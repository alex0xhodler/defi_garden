import { privateKeyToAccount } from 'viem/accounts';
import { toCoinbaseSmartAccount } from 'viem/account-abstraction';
import { createPublicClient, http, Address } from 'viem';
import { base } from 'viem/chains';
import { erc20Abi } from './abis';
import { BASE_TOKENS } from './constants';

// Create public client for Base mainnet using Coinbase developer API
const publicClient = createPublicClient({
  chain: base,
  transport: http("https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz"),
});

/**
 * Creates a Coinbase Smart Wallet instance from a private key for testing purposes.
 * This allows tests to simulate a user's wallet.
 * @param {string} privateKey - The private key of the owner EOA.
 * @returns {Promise<object>} An object containing the owner account, the smart account, and its address.
 * @throws Will throw an error if the private key format is invalid.
 */
export async function createTestSmartWallet(privateKey: string) {
  try {
    console.log('🔑 Creating Smart Wallet from private key...');
    
    // Validate private key format
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      throw new Error('Invalid private key format. Expected 0x followed by 64 hex characters');
    }

    // Create owner account from private key
    const owner = privateKeyToAccount(privateKey as `0x${string}`);
    console.log(`👤 Owner address: ${owner.address}`);

    // Create Smart Account with deterministic nonce
    const smartAccount = await toCoinbaseSmartAccount({
      client: publicClient,
      owners: [owner],
      nonce: 0n, // Deterministic nonce
      version: '1.1'
    });

    console.log(`🦑 Smart Wallet address: ${smartAccount.address}`);
    
    return {
      owner,
      smartAccount,
      address: smartAccount.address
    };

  } catch (error: any) {
    console.error('❌ Failed to create Smart Wallet:', error.message);
    throw error;
  }
}

/**
 * Checks the USDC balance of a given address on the Base network.
 * @param {Address} address - The address to check the balance of.
 * @returns {Promise<{ balance: bigint; formatted: string; }>} An object containing the raw balance as a bigint and the formatted balance as a string.
 * @throws Will throw an error if the balance check fails.
 */
export async function checkUSDCBalance(address: Address): Promise<{
  balance: bigint;
  formatted: string;
}> {
  try {
    console.log(`💰 Checking USDC balance for ${address}...`);
    
    const balance = await publicClient.readContract({
      address: BASE_TOKENS.USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address]
    });

    const formatted = (Number(balance) / 1e6).toFixed(6); // USDC has 6 decimals
    
    console.log(`💰 USDC Balance: ${formatted} USDC`);
    
    return {
      balance,
      formatted
    };

  } catch (error: any) {
    console.error('❌ Failed to check USDC balance:', error.message);
    throw error;
  }
}

/**
 * Creates a mock user session object for use in tests.
 * @param {string} [userId='test-user'] - The user ID to use for the mock session.
 * @returns {object} A mock session object with default settings.
 */
export function createMockUserSession(userId: string = 'test-user') {
  return {
    userId,
    settings: {
      riskLevel: 3,
      slippage: 1.0,
      autoCompound: true,
      minApy: 5.0
    },
    currentAction: undefined,
    tempData: {},
    zapMode: 'auto'
  };
}

/**
 * Validates if a given string is a valid Ethereum transaction hash.
 * @param {string} hash - The string to validate.
 * @returns {boolean} True if the string is a valid transaction hash, false otherwise.
 */
export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * @interface TestResult
 * @description Represents the outcome of a test execution.
 * @property {boolean} success - Whether the test passed.
 * @property {string} [txHash] - The transaction hash, if applicable.
 * @property {string} [shares] - The amount of shares received, if applicable.
 * @property {string} [error] - The error message if the test failed.
 * @property {string} [gasUsed] - The amount of gas used.
 * @property {number} startTime - The timestamp when the test started.
 * @property {number} [endTime] - The timestamp when the test ended.
 */
export interface TestResult {
  success: boolean;
  txHash?: string;
  shares?: string;
  error?: string;
  gasUsed?: string;
  startTime: number;
  endTime?: number;
}

/**
 * Formats a TestResult object into a human-readable string for logging.
 * @param {TestResult} result - The test result object.
 * @returns {string} A formatted string summarizing the test result.
 */
export function formatTestResult(result: TestResult): string {
  const duration = result.endTime ? result.endTime - result.startTime : 0;

  if (result.success) {
    return `
✅ TEST PASSED (${duration}ms)
  📝 TX Hash: ${result.txHash}
  📈 Shares: ${result.shares}
  ⛽ Gas Used: ${result.gasUsed || 'N/A (gasless)'}
`;
  } else {
    return `
❌ TEST FAILED (${duration}ms)  
  🚨 Error: ${result.error}
`;
  }
}

/**
 * Verifies a transaction on the blockchain by repeatedly fetching its receipt until it's confirmed.
 * @param {string} txHash - The hash of the transaction to verify.
 * @returns {Promise<{ success: boolean; gasUsed?: string; blockNumber?: number; }>} An object indicating the transaction status and details.
 */
export async function verifyTransaction(txHash: string): Promise<{
  success: boolean;
  gasUsed?: string;
  blockNumber?: number;
}> {
  try {
    if (!isValidTxHash(txHash)) {
      throw new Error('Invalid transaction hash format');
    }

    console.log(`🔍 Verifying transaction: ${txHash}`);
    
    // Retry logic - wait for transaction to be confirmed
    let receipt: any = null;
    const maxRetries = 10;
    const retryDelay = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔍 Verification attempt ${attempt}/${maxRetries}...`);
        
        receipt = await publicClient.getTransactionReceipt({
          hash: txHash as `0x${string}`
        });
        
        // If we got a receipt, break out of retry loop
        break;
        
      } catch (error: any) {
        if (attempt === maxRetries) {
          throw new Error(`Transaction not found after ${maxRetries} attempts: ${error.message}`);
        }
        
        console.log(`🔍 Transaction not confirmed yet, waiting ${retryDelay/1000}s... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    if (!receipt) {
      throw new Error('Transaction receipt not found after all retries');
    }

    const success = receipt.status === 'success';
    
    console.log(`🔍 Transaction status: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`🔍 Block number: ${receipt.blockNumber}`);
    console.log(`🔍 Gas used: ${receipt.gasUsed.toString()}`);

    return {
      success,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: Number(receipt.blockNumber)
    };

  } catch (error: any) {
    console.error('❌ Failed to verify transaction:', error.message);
    return { success: false };
  }
}

/**
 * Waits for a transaction to be confirmed on the blockchain, with a specified timeout.
 * @param {string} txHash - The hash of the transaction to wait for.
 * @param {number} [timeoutMs=30000] - The maximum time to wait in milliseconds.
 * @returns {Promise<boolean>} A promise that resolves to true if the transaction succeeded, or false if it failed.
 * @throws Will throw an error if the transaction verification times out.
 */
export async function waitForTransaction(
  txHash: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await verifyTransaction(txHash);
      if (result.success !== undefined) {
        return result.success;
      }
    } catch (error) {
      // Transaction might not be mined yet, continue waiting
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Transaction verification timeout after ${timeoutMs}ms`);
}

/**
 * Logs an error message safely by sanitizing it to remove sensitive data like private keys and addresses.
 * @param {any} error - The error object or message.
 * @param {string} context - A string describing the context where the error occurred.
 * @returns {string} The sanitized error message.
 */
export function safeErrorLog(error: any, context: string): string {
  const message = error?.message || 'Unknown error';

  // Remove potentially sensitive data
  const sanitized = message
    .replace(/0x[a-fA-F0-9]{40}/g, '0x***')  // Replace addresses
    .replace(/0x[a-fA-F0-9]{64}/g, '0x***')  // Replace private keys/hashes
    .substring(0, 500); // Limit length
    
  console.error(`❌ ${context}:`, sanitized);
  return sanitized;
}