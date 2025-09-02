import { createPublicClient, http, Address } from 'viem';
import { toCoinbaseSmartAccount, createPaymasterClient } from 'viem/account-abstraction';
import { base } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { saveWallet, getWalletByUserId } from './database';
import { encrypt, decrypt } from './encryption';
import { WalletData } from '../types/wallet';

// Coinbase CDP configuration
const CDP_PROJECT_ID = '8c26f2ba-ed37-49ab-868b-ebad7692c0a0';
const CDP_API_KEY = '9578d547-b0f5-46ee-840a-7872b4234c46';

// CDP Bundler and Paymaster endpoints for USDC gas payments
const CDP_BUNDLER_URL = "https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz";
const PAYMASTER_URL = "https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz";

// Public Base RPC for read operations
const PUBLIC_RPC_URL = "https://mainnet.base.org";

// Create public client for Base mainnet (read operations)
export const publicClient = createPublicClient({
  chain: base,
  transport: http(PUBLIC_RPC_URL),
});

// Create CDP Paymaster client for USDC gas payments
export const cdpPaymasterClient = createPaymasterClient({
  transport: http(PAYMASTER_URL),
});

/**
 * Generate a new Coinbase Smart Wallet for a user
 */
export async function generateCoinbaseSmartWallet(userId: string) {
  try {
    console.log(`🦑 Creating Coinbase Smart Wallet for user ${userId}...`);

    // Generate new private key for the EOA owner
    const privateKey = generatePrivateKey();
    const owner = privateKeyToAccount(privateKey);

    // Create Coinbase Smart Account
    const smartAccount = await toCoinbaseSmartAccount({
      client: publicClient,
      owners: [owner],
      version: '1.1'
    });

    console.log(`✅ Smart Wallet created: ${smartAccount.address}`);

    // Encrypt and save the private key
    const encryptedPrivateKey = encrypt(privateKey);
    
    const walletData: WalletData = {
      address: smartAccount.address,
      encryptedPrivateKey,
      type: 'coinbase-smart-wallet' as const,
      createdAt: Date.now(),
      autoCreated: true
    };

    // Save to database
    saveWallet(walletData, userId);

    console.log(`🦑 Coinbase Smart Wallet saved for user ${userId}`);

    return {
      address: smartAccount.address,
      smartAccount,
      owner
    };

  } catch (error) {
    console.error('Error creating Coinbase Smart Wallet:', error);
    throw error;
  }
}

/**
 * Get existing Coinbase Smart Wallet for user
 */
export async function getCoinbaseSmartWallet(userId: string) {
  try {
    const walletData = getWalletByUserId(userId);
    
    if (!walletData || walletData.type !== 'coinbase-smart-wallet') {
      return null;
    }

    // Decrypt private key
    const privateKey = decrypt(walletData.encryptedPrivateKey);
    const owner = privateKeyToAccount(privateKey as `0x${string}`);

    // Recreate smart account
    const smartAccount = await toCoinbaseSmartAccount({
      client: publicClient,
      owners: [owner],
      version: '1.1'
    });

    return {
      address: smartAccount.address,
      smartAccount,
      owner,
      walletData
    };

  } catch (error) {
    console.error('Error retrieving Coinbase Smart Wallet:', error);
    throw error;
  }
}

/**
 * Check if user has a Coinbase Smart Wallet
 */
export function hasCoinbaseSmartWallet(userId: string): boolean {
  const walletData = getWalletByUserId(userId);
  return walletData?.type === 'coinbase-smart-wallet';
}

/**
 * Get wallet addresses (both smart wallet and EOA) for a user
 */
export async function getWalletAddresses(userId: string): Promise<{ smartWalletAddress: Address; eoaAddress: Address } | null> {
  try {
    const wallet = await getCoinbaseSmartWallet(userId);
    if (!wallet) return null;
    
    return {
      smartWalletAddress: wallet.smartAccount.address,
      eoaAddress: wallet.owner.address
    };
  } catch (error) {
    console.error('Error getting wallet addresses:', error);
    return null;
  }
}

/**
 * Get USDC balance for a Coinbase Smart Wallet
 */
export async function getCoinbaseWalletUSDCBalance(walletAddress: Address): Promise<string> {
  try {
    const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    
    const balance = await publicClient.readContract({
      address: BASE_USDC_ADDRESS,
      abi: [
        {
          constant: true,
          inputs: [{ name: '_owner', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: 'balance', type: 'uint256' }],
          type: 'function',
        },
      ],
      functionName: 'balanceOf',
      args: [walletAddress],
    });

    // Convert from 6 decimals to readable format
    const balanceFormatted = (Number(balance) / Math.pow(10, 6)).toFixed(2);
    return balanceFormatted;

  } catch (error) {
    console.error('Error checking USDC balance:', error);
    return '0.00';
  }
}

/**
 * Create CDP bundler client for USDC gas payment transactions
 */
export async function createSponsoredBundlerClient(smartAccount: any) {
  const { createBundlerClient } = await import('viem/account-abstraction');
  
  // Use CDP bundler and paymaster for complete USDC gas payment solution
  return createBundlerClient({
    account: smartAccount,
    client: publicClient,
    transport: http(CDP_BUNDLER_URL),
    chain: base,
    paymaster: cdpPaymasterClient, // CDP paymaster for USDC gas payments
  });
}

/**
 * Check if CDP Paymaster supports USDC gas payments
 */
export async function checkPaymasterUSDCSupport(): Promise<boolean> {
  try {
    // Call pm_getAcceptedPaymentTokens to verify USDC is supported
    const response = await fetch(PAYMASTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pm_getAcceptedPaymentTokens',
        params: ['0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', '0x2105', {}] // EntryPoint, Base Chain ID
      })
    });
    
    const result = await response.json();
    const acceptedTokens = result.result?.acceptedTokens || [];
    const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    
    return acceptedTokens.some((token: any) => 
      token.address.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase()
    );
  } catch (error) {
    console.error('Error checking paymaster USDC support:', error);
    return false;
  }
}

/**
 * Check USDC balance in both Smart Wallet and EOA
 */
export async function checkAllUSDCBalances(userId: string): Promise<{ 
  smartWalletBalance: string; 
  eoaBalance: string;
  smartWalletAddress: Address;
  eoaAddress: Address;
  totalBalance: string;
} | null> {
  try {
    const wallet = await getCoinbaseSmartWallet(userId);
    if (!wallet) return null;
    
    const smartWalletBalance = await getCoinbaseWalletUSDCBalance(wallet.smartAccount.address);
    const eoaBalance = await getCoinbaseWalletUSDCBalance(wallet.owner.address);
    
    const totalBalance = (parseFloat(smartWalletBalance) + parseFloat(eoaBalance)).toFixed(2);
    
    return {
      smartWalletBalance,
      eoaBalance,
      smartWalletAddress: wallet.smartAccount.address,
      eoaAddress: wallet.owner.address,
      totalBalance
    };
  } catch (error) {
    console.error('Error checking all USDC balances:', error);
    return null;
  }
}

export { publicClient as coinbasePublicClient };