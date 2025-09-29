"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestSmartWallet = createTestSmartWallet;
exports.checkUSDCBalance = checkUSDCBalance;
exports.createMockUserSession = createMockUserSession;
exports.isValidTxHash = isValidTxHash;
exports.formatTestResult = formatTestResult;
exports.verifyTransaction = verifyTransaction;
exports.waitForTransaction = waitForTransaction;
exports.safeErrorLog = safeErrorLog;
const accounts_1 = require("viem/accounts");
const account_abstraction_1 = require("viem/account-abstraction");
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const abis_1 = require("./abis");
const constants_1 = require("./constants");
// Create public client for Base mainnet using Coinbase developer API
const publicClient = (0, viem_1.createPublicClient)({
    chain: chains_1.base,
    transport: (0, viem_1.http)("https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz"),
});
/**
 * Create a Smart Wallet from private key for testing
 */
async function createTestSmartWallet(privateKey) {
    try {
        console.log('🔑 Creating Smart Wallet from private key...');
        // Validate private key format
        if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
            throw new Error('Invalid private key format. Expected 0x followed by 64 hex characters');
        }
        // Create owner account from private key
        const owner = (0, accounts_1.privateKeyToAccount)(privateKey);
        console.log(`👤 Owner address: ${owner.address}`);
        // Create Smart Account with deterministic nonce
        const smartAccount = await (0, account_abstraction_1.toCoinbaseSmartAccount)({
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
    }
    catch (error) {
        console.error('❌ Failed to create Smart Wallet:', error.message);
        throw error;
    }
}
/**
 * Check USDC balance of an address
 */
async function checkUSDCBalance(address) {
    try {
        console.log(`💰 Checking USDC balance for ${address}...`);
        const balance = await publicClient.readContract({
            address: constants_1.BASE_TOKENS.USDC,
            abi: abis_1.erc20Abi,
            functionName: 'balanceOf',
            args: [address]
        });
        const formatted = (Number(balance) / 1e6).toFixed(6); // USDC has 6 decimals
        console.log(`💰 USDC Balance: ${formatted} USDC`);
        return {
            balance,
            formatted
        };
    }
    catch (error) {
        console.error('❌ Failed to check USDC balance:', error.message);
        throw error;
    }
}
/**
 * Mock user session for testing purposes
 */
function createMockUserSession(userId = 'test-user') {
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
 * Validate transaction hash format
 */
function isValidTxHash(hash) {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
}
function formatTestResult(result) {
    const duration = result.endTime ? result.endTime - result.startTime : 0;
    if (result.success) {
        return `
✅ TEST PASSED (${duration}ms)
  📝 TX Hash: ${result.txHash}
  📈 Shares: ${result.shares}
  ⛽ Gas Used: ${result.gasUsed || 'N/A (gasless)'}
`;
    }
    else {
        return `
❌ TEST FAILED (${duration}ms)  
  🚨 Error: ${result.error}
`;
    }
}
/**
 * Verify a transaction on the blockchain
 */
async function verifyTransaction(txHash) {
    try {
        if (!isValidTxHash(txHash)) {
            throw new Error('Invalid transaction hash format');
        }
        console.log(`🔍 Verifying transaction: ${txHash}`);
        // Retry logic - wait for transaction to be confirmed
        let receipt = null;
        const maxRetries = 10;
        const retryDelay = 2000; // 2 seconds
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔍 Verification attempt ${attempt}/${maxRetries}...`);
                receipt = await publicClient.getTransactionReceipt({
                    hash: txHash
                });
                // If we got a receipt, break out of retry loop
                break;
            }
            catch (error) {
                if (attempt === maxRetries) {
                    throw new Error(`Transaction not found after ${maxRetries} attempts: ${error.message}`);
                }
                console.log(`🔍 Transaction not confirmed yet, waiting ${retryDelay / 1000}s... (attempt ${attempt}/${maxRetries})`);
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
    }
    catch (error) {
        console.error('❌ Failed to verify transaction:', error.message);
        return { success: false };
    }
}
/**
 * Wait for a transaction to be confirmed with timeout
 */
async function waitForTransaction(txHash, timeoutMs = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const result = await verifyTransaction(txHash);
            if (result.success !== undefined) {
                return result.success;
            }
        }
        catch (error) {
            // Transaction might not be mined yet, continue waiting
        }
        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`Transaction verification timeout after ${timeoutMs}ms`);
}
/**
 * Safe error logging without exposing sensitive data
 */
function safeErrorLog(error, context) {
    const message = error?.message || 'Unknown error';
    // Remove potentially sensitive data
    const sanitized = message
        .replace(/0x[a-fA-F0-9]{40}/g, '0x***') // Replace addresses
        .replace(/0x[a-fA-F0-9]{64}/g, '0x***') // Replace private keys/hashes
        .substring(0, 500); // Limit length
    console.error(`❌ ${context}:`, sanitized);
    return sanitized;
}
