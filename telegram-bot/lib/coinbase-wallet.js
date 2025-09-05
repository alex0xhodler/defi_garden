"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.coinbasePublicClient = exports.cdpPaymasterClient = exports.publicClient = void 0;
exports.generateCoinbaseSmartWallet = generateCoinbaseSmartWallet;
exports.getCoinbaseSmartWallet = getCoinbaseSmartWallet;
exports.hasCoinbaseSmartWallet = hasCoinbaseSmartWallet;
exports.getWalletAddresses = getWalletAddresses;
exports.getCoinbaseWalletUSDCBalance = getCoinbaseWalletUSDCBalance;
exports.createSponsoredBundlerClient = createSponsoredBundlerClient;
exports.checkPaymasterUSDCSupport = checkPaymasterUSDCSupport;
exports.checkAllUSDCBalances = checkAllUSDCBalances;
exports.transferUsdcGasless = transferUsdcGasless;
const viem_1 = require("viem");
const account_abstraction_1 = require("viem/account-abstraction");
const chains_1 = require("viem/chains");
const accounts_1 = require("viem/accounts");
const database_1 = require("./database");
const encryption_1 = require("./encryption");
// Coinbase CDP configuration
const CDP_PROJECT_ID = '8c26f2ba-ed37-49ab-868b-ebad7692c0a0';
const CDP_API_KEY = '9578d547-b0f5-46ee-840a-7872b4234c46';
// CDP Bundler and Paymaster endpoints for USDC gas payments
const CDP_BUNDLER_URL = "https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz";
const PAYMASTER_URL = "https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz";
// DRPC Base RPC for read operations (no rate limiting)
const PUBLIC_RPC_URL = "https://lb.drpc.org/base/AvgxwlBbqkwviRzVD3VcB1HBZLeBg98R8IWRqhnKxixj";
// Create public client for Base mainnet (read operations)
exports.publicClient = (0, viem_1.createPublicClient)({
    chain: chains_1.base,
    transport: (0, viem_1.http)(PUBLIC_RPC_URL),
});
exports.coinbasePublicClient = exports.publicClient;
// Create CDP Paymaster client for USDC gas payments
exports.cdpPaymasterClient = (0, account_abstraction_1.createPaymasterClient)({
    transport: (0, viem_1.http)(PAYMASTER_URL),
});
/**
 * Generate a new Coinbase Smart Wallet for a user
 */
async function generateCoinbaseSmartWallet(userId) {
    try {
        console.log(`🦑 Creating Coinbase Smart Wallet for user ${userId}...`);
        // Generate new private key for the EOA owner
        const privateKey = (0, accounts_1.generatePrivateKey)();
        const owner = (0, accounts_1.privateKeyToAccount)(privateKey);
        // Create Coinbase Smart Account with deterministic nonce
        const smartAccount = await (0, account_abstraction_1.toCoinbaseSmartAccount)({
            client: exports.publicClient,
            owners: [owner],
            nonce: 0n, // Use fixed nonce for deterministic address generation
            version: '1.1'
        });
        console.log(`✅ Smart Wallet created: ${smartAccount.address}`);
        // Encrypt and save the private key
        const encryptedPrivateKey = (0, encryption_1.encrypt)(privateKey);
        const walletData = {
            address: smartAccount.address,
            encryptedPrivateKey,
            type: 'coinbase-smart-wallet',
            createdAt: Date.now(),
            autoCreated: true
        };
        // Save to database
        (0, database_1.saveWallet)(walletData, userId);
        console.log(`🦑 Coinbase Smart Wallet saved for user ${userId}`);
        return {
            address: smartAccount.address,
            smartAccount,
            owner
        };
    }
    catch (error) {
        console.error('Error creating Coinbase Smart Wallet:', error);
        throw error;
    }
}
/**
 * Check if Smart Account is deployed on-chain (fallback for edge cases)
 */
async function isSmartAccountDeployedOnChain(address) {
    try {
        const code = await exports.publicClient.getCode({ address });
        return code !== undefined && code !== '0x';
    }
    catch (error) {
        console.error('Error checking Smart Account deployment on-chain:', error);
        return false;
    }
}
/**
 * Get existing Coinbase Smart Wallet for user
 */
async function getCoinbaseSmartWallet(userId) {
    try {
        const walletData = (0, database_1.getWalletByUserId)(userId);
        if (!walletData || walletData.type !== 'coinbase-smart-wallet') {
            return null;
        }
        // Decrypt private key
        const privateKey = (0, encryption_1.decrypt)(walletData.encryptedPrivateKey);
        const owner = (0, accounts_1.privateKeyToAccount)(privateKey);
        // Use deployment status from database (much faster than blockchain call)
        const isDeployed = walletData.isDeployed || false;
        // Recreate smart account with the same nonce for consistent address
        const smartAccountConfig = {
            client: exports.publicClient,
            owners: [owner],
            nonce: 0n, // Use same nonce as creation for deterministic address
            version: '1.1'
        };
        // Log deployment status for debugging
        if (isDeployed) {
            console.log(`🔗 Smart Account ${walletData.address} already deployed (from database)`);
        }
        else {
            console.log(`🚀 Smart Account ${walletData.address} not deployed yet (from database)`);
        }
        const smartAccount = await (0, account_abstraction_1.toCoinbaseSmartAccount)(smartAccountConfig);
        return {
            address: smartAccount.address,
            smartAccount,
            owner,
            walletData,
            isDeployed
        };
    }
    catch (error) {
        console.error('Error retrieving Coinbase Smart Wallet:', error);
        throw error;
    }
}
/**
 * Check if user has a Coinbase Smart Wallet
 */
function hasCoinbaseSmartWallet(userId) {
    const walletData = (0, database_1.getWalletByUserId)(userId);
    return walletData?.type === 'coinbase-smart-wallet';
}
/**
 * Get wallet addresses (both smart wallet and EOA) for a user
 */
async function getWalletAddresses(userId) {
    try {
        const wallet = await getCoinbaseSmartWallet(userId);
        if (!wallet)
            return null;
        return {
            smartWalletAddress: wallet.smartAccount.address,
            eoaAddress: wallet.owner.address
        };
    }
    catch (error) {
        console.error('Error getting wallet addresses:', error);
        return null;
    }
}
/**
 * Get USDC balance for a Coinbase Smart Wallet
 */
async function getCoinbaseWalletUSDCBalance(walletAddress) {
    try {
        const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        const balance = await exports.publicClient.readContract({
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
    }
    catch (error) {
        console.error('Error checking USDC balance:', error);
        return '0.00';
    }
}
/**
 * Create CDP bundler client for USDC gas payment transactions
 */
async function createSponsoredBundlerClient(smartAccount, isDeployed = false) {
    const { createBundlerClient } = await Promise.resolve().then(() => __importStar(require('viem/account-abstraction')));
    // If the account is already deployed, remove initCode to avoid AA10 error
    if (isDeployed && smartAccount.getInitCode) {
        console.log(`🔧 Removing initCode for deployed Smart Account`);
        // Override getInitCode to return undefined for deployed accounts
        const originalGetInitCode = smartAccount.getInitCode;
        smartAccount.getInitCode = () => undefined;
    }
    // Use CDP bundler and paymaster for complete USDC gas payment solution
    return createBundlerClient({
        account: smartAccount,
        client: exports.publicClient,
        transport: (0, viem_1.http)(CDP_BUNDLER_URL),
        chain: chains_1.base,
        paymaster: exports.cdpPaymasterClient, // CDP paymaster for USDC gas payments
    });
}
/**
 * Check if CDP Paymaster supports USDC gas payments
 */
async function checkPaymasterUSDCSupport() {
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
        return acceptedTokens.some((token) => token.address.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase());
    }
    catch (error) {
        console.error('Error checking paymaster USDC support:', error);
        return false;
    }
}
/**
 * Check USDC balance in both Smart Wallet and EOA
 */
async function checkAllUSDCBalances(userId) {
    try {
        const wallet = await getCoinbaseSmartWallet(userId);
        if (!wallet)
            return null;
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
    }
    catch (error) {
        console.error('Error checking all USDC balances:', error);
        return null;
    }
}
/**
 * Transfer USDC gaslessly using CDP paymaster (gas paid with USDC)
 */
async function transferUsdcGasless(userId, toAddress, usdcAmount) {
    try {
        console.log(`💸 Gasless USDC transfer: ${usdcAmount} USDC to ${toAddress} for user ${userId}`);
        // Get user's Coinbase Smart Wallet
        const wallet = await getCoinbaseSmartWallet(userId);
        if (!wallet) {
            throw new Error('No Coinbase Smart Wallet found for user');
        }
        const { smartAccount } = wallet;
        // Convert USDC amount to proper units (6 decimals)
        const amountWei = (0, viem_1.parseUnits)(usdcAmount, 6);
        // Check current USDC balance
        const currentBalance = await getCoinbaseWalletUSDCBalance(smartAccount.address);
        const currentBalanceWei = (0, viem_1.parseUnits)(currentBalance, 6);
        // Reserve small amount for gas (Base gas is ~1¢)
        const gasReserveWei = (0, viem_1.parseUnits)('0.01', 6); // $0.01 USDC reserve for gas
        // Check if sufficient balance including gas
        if (currentBalanceWei < gasReserveWei) {
            throw new Error(`Insufficient USDC balance for gas fees. Have: ${currentBalance} USDC, Need at least: $0.01 USDC for gas`);
        }
        const maxTransferableWei = currentBalanceWei - gasReserveWei;
        if (amountWei > maxTransferableWei) {
            throw new Error(`Insufficient USDC balance. Requested: ${usdcAmount} USDC, Available: ${(Number(maxTransferableWei) / Math.pow(10, 6)).toFixed(2)} USDC (after gas reserve)`);
        }
        // Get wallet with deployment status
        const walletInfo = await getCoinbaseSmartWallet(userId);
        // Create bundler client with CDP paymaster for USDC gas payments
        const bundlerClient = await createSponsoredBundlerClient(smartAccount, walletInfo?.isDeployed || false);
        console.log(`🚀 Preparing gasless USDC transfer with USDC gas payment...`);
        const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        // ERC-20 ABI for transfer
        const ERC20_ABI = [
            {
                constant: false,
                inputs: [
                    { name: '_to', type: 'address' },
                    { name: '_value', type: 'uint256' }
                ],
                name: 'transfer',
                outputs: [{ name: '', type: 'bool' }],
                payable: false,
                stateMutability: 'nonpayable',
                type: 'function'
            }
        ];
        // Build calls array - just transfer USDC
        const calls = [
            {
                abi: ERC20_ABI,
                functionName: 'transfer',
                to: BASE_USDC_ADDRESS,
                args: [toAddress, amountWei],
            }
        ];
        console.log(`📡 Sending UserOperation with USDC gas payment...`);
        // Configure gas estimation (pad for safety)
        smartAccount.userOperation = {
            estimateGas: async (userOperation) => {
                const estimate = await bundlerClient.estimateUserOperationGas(userOperation);
                // Increase gas limits for safety
                estimate.preVerificationGas = estimate.preVerificationGas * 2n;
                estimate.callGasLimit = estimate.callGasLimit * 120n / 100n; // +20%
                return estimate;
            },
        };
        // Send UserOperation with USDC gas payment via CDP paymaster
        const userOpHash = await bundlerClient.sendUserOperation({
            account: smartAccount,
            calls,
            paymaster: exports.cdpPaymasterClient,
            paymasterContext: {
                erc20: BASE_USDC_ADDRESS // Tell paymaster to use USDC for gas payment
            }
        });
        console.log(`⏳ Waiting for gasless transfer confirmation: ${userOpHash}`);
        // Wait for transaction receipt
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: userOpHash,
        });
        console.log(`✅ Gasless transfer confirmed! Hash: ${receipt.receipt.transactionHash}`);
        return {
            success: true,
            txHash: receipt.receipt.transactionHash
        };
    }
    catch (error) {
        console.error('Error in gasless USDC transfer:', error);
        // Check if it's a paymaster rejection
        if (error.code === -32002) {
            if (error.message?.includes('max address transaction sponsorship count reached')) {
                console.error('Paymaster sponsorship limit reached:', error.details);
                return {
                    success: false,
                    error: `Coinbase paymaster limit reached. Will use regular withdrawal instead.`
                };
            }
            else if (error.data?.acceptedTokens) {
                console.error('Paymaster rejection during transfer:', error.data);
                return {
                    success: false,
                    error: `Gas payment failed. Please ensure you have sufficient USDC for gas fees.`
                };
            }
        }
        // Check for balance-related errors
        if (error.message?.includes('Insufficient') || error.message?.includes('transfer amount exceeds balance')) {
            return {
                success: false,
                error: error.message
            };
        }
        // Log full error details for debugging
        console.error('Full gasless transfer error details:', {
            message: error.message,
            cause: error.cause?.message,
            details: error.details,
            code: error.code,
            data: error.data,
            stack: error.stack?.split('\n').slice(0, 5)
        });
        return {
            success: false,
            error: error.message || error.details || 'Unknown gasless transfer error occurred'
        };
    }
}
