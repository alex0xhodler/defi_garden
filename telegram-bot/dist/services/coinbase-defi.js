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
exports.autoDeployToCompoundV3 = autoDeployToCompoundV3;
exports.getCompoundV3APY = getCompoundV3APY;
exports.getCompoundV3Balance = getCompoundV3Balance;
exports.withdrawFromCompoundV3 = withdrawFromCompoundV3;
exports.gaslessDeployToAave = gaslessDeployToAave;
exports.gaslessWithdrawFromAave = gaslessWithdrawFromAave;
exports.gaslessDeployToFluid = gaslessDeployToFluid;
exports.gaslessWithdrawFromFluid = gaslessWithdrawFromFluid;
const viem_1 = require("viem");
const coinbase_wallet_1 = require("../lib/coinbase-wallet");
const database_1 = require("../lib/database");
// Contract addresses - Using correct Base addresses
const COMPOUND_V3_USDC_ADDRESS = "0xb125e6687d4313864e53df431d5425969c15eb2f";
const AAVE_V3_POOL_ADDRESS = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const FLUID_FUSDC_ADDRESS = "0xf42f5795d9ac7e9d757db633d693cd548cfd9169";
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// Constants for USDC gas payments via paymaster
const MIN_USDC_THRESHOLD = (0, viem_1.parseUnits)('1', 6); // $1 minimum for gas
const USDC_APPROVAL_AMOUNT = (0, viem_1.parseUnits)('20', 6); // $20 approval for gas payments
// CDP Paymaster contract address (will be determined from paymaster response)
let PAYMASTER_CONTRACT_ADDRESS = null;
// ERC-20 ABI for approve and allowance
const ERC20_ABI = [
    {
        constant: false,
        inputs: [
            { name: '_spender', type: 'address' },
            { name: '_value', type: 'uint256' }
        ],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: true,
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
        ],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    }
];
// Compound V3 ABI for supply and withdraw
const COMPOUND_V3_ABI = [
    {
        constant: false,
        inputs: [
            { name: 'asset', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        name: 'supply',
        outputs: [],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: false,
        inputs: [
            { name: 'asset', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        name: 'withdraw',
        outputs: [],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    }
];
// Aave V3 Pool ABI for supply and withdraw
const AAVE_V3_POOL_ABI = [
    {
        inputs: [
            { name: 'asset', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'onBehalfOf', type: 'address' },
            { name: 'referralCode', type: 'uint16' }
        ],
        name: 'supply',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        inputs: [
            { name: 'asset', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'to', type: 'address' }
        ],
        name: 'withdraw',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function'
    }
];
// Fluid fToken ABI for deposit and withdraw
const FLUID_FTOKEN_ABI = [
    {
        inputs: [
            { name: 'amount_', type: 'uint256' },
            { name: 'receiver_', type: 'address' }
        ],
        name: 'deposit',
        outputs: [{ name: 'shares_', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        inputs: [
            { name: 'amount_', type: 'uint256' },
            { name: 'receiver_', type: 'address' },
            { name: 'owner_', type: 'address' }
        ],
        name: 'withdraw',
        outputs: [{ name: 'shares_', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function'
    }
];
/**
 * Auto-deploy USDC to Compound V3 with sponsored gas
 */
async function autoDeployToCompoundV3(userId, usdcAmount) {
    try {
        console.log(`🚀 Auto-deploying ${usdcAmount} USDC to Compound V3 for user ${userId}`);
        // Get user's Coinbase Smart Wallet
        const wallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
        if (!wallet) {
            throw new Error('No Coinbase Smart Wallet found for user');
        }
        const { smartAccount } = wallet;
        // Convert USDC amount to proper units (6 decimals)
        const amountWei = (0, viem_1.parseUnits)(usdcAmount, 6);
        // Check current USDC balance
        const currentBalance = await (0, coinbase_wallet_1.getCoinbaseWalletUSDCBalance)(smartAccount.address);
        const currentBalanceWei = (0, viem_1.parseUnits)(currentBalance, 6);
        // Reserve small amount for gas (Base gas is ~1¢)
        const gasReserveWei = (0, viem_1.parseUnits)('0.01', 6); // $0.01 USDC reserve for gas (1 cent)
        // Auto-fit deployment amount to available balance minus gas reserve
        let deployAmountWei;
        let actualDeployAmount;
        if (currentBalanceWei < gasReserveWei) {
            throw new Error(`Insufficient USDC balance for gas fees. Have: ${currentBalance} USDC, Need at least: $0.01 USDC for gas`);
        }
        const maxDeployableWei = currentBalanceWei - gasReserveWei;
        if (amountWei > maxDeployableWei) {
            // Auto-fit to available balance
            deployAmountWei = maxDeployableWei;
            actualDeployAmount = (Number(deployAmountWei) / Math.pow(10, 6)).toFixed(2);
            console.log(`💰 Auto-fitting deployment: ${usdcAmount} USDC requested, deploying ${actualDeployAmount} USDC (reserved $0.01 for gas)`);
        }
        else {
            // Use requested amount
            deployAmountWei = amountWei;
            actualDeployAmount = usdcAmount;
            console.log(`💰 Deploying full amount: ${actualDeployAmount} USDC (${currentBalance} USDC available, $0.01 reserved for gas)`);
        }
        // Create bundler client with CDP paymaster for USDC gas payments
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        console.log(`🚀 Preparing USDC gas payment transaction for ${actualDeployAmount} USDC...`);
        // CDP Paymaster contract address (extracted from error logs)
        const PAYMASTER_CONTRACT_ADDRESS = "0x2faeb0760d4230ef2ac21496bb4f0b47d634fd4c";
        const GAS_APPROVAL_AMOUNT = (0, viem_1.parseUnits)('5', 6); // $5 USDC approval for gas payments
        // Build calls array with paymaster approval
        const calls = [];
        // Simple calls - just approve and supply (paymaster approval is handled automatically)
        calls.push(
        // 1. Approve Compound V3 to spend USDC
        {
            abi: ERC20_ABI,
            functionName: 'approve',
            to: BASE_USDC_ADDRESS,
            args: [COMPOUND_V3_USDC_ADDRESS, deployAmountWei],
        }, 
        // 2. Supply USDC to Compound V3
        {
            abi: COMPOUND_V3_ABI,
            functionName: 'supply',
            to: COMPOUND_V3_USDC_ADDRESS,
            args: [BASE_USDC_ADDRESS, deployAmountWei],
        });
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
            paymaster: coinbase_wallet_1.cdpPaymasterClient,
            paymasterContext: {
                erc20: BASE_USDC_ADDRESS // Tell paymaster to use USDC for gas payment
            }
        });
        console.log(`⏳ Waiting for transaction confirmation: ${userOpHash}`);
        // Wait for transaction receipt
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: userOpHash,
        });
        console.log(`✅ Transaction confirmed! Hash: ${receipt.receipt.transactionHash}`);
        // Complete user onboarding
        (0, database_1.updateUserOnboardingStatus)(userId, true);
        return {
            success: true,
            txHash: receipt.receipt.transactionHash
        };
    }
    catch (error) {
        console.error('Error auto-deploying to Compound V3:', error);
        // Check for Compound V3 specific errors
        if (error.message?.includes('0x36405305')) {
            console.error('Compound V3 contract error - likely SupplyCapExceeded or NotCollateralized');
            return {
                success: false,
                error: 'Compound V3 market may have reached supply cap or requires different configuration. Please try again later or contact support.'
            };
        }
        // Check if it's a paymaster rejection with token info
        if (error.code === -32002 && error.data?.acceptedTokens) {
            console.error('Paymaster rejection - accepted tokens:', error.data.acceptedTokens);
            console.error('Paymaster address:', error.data.paymasterAddress);
            return {
                success: false,
                error: `Paymaster requires USDC approval. Address: ${error.data.paymasterAddress}`
            };
        }
        // Check for gas-related errors
        if (error.message?.includes('transfer amount exceeds balance')) {
            return {
                success: false,
                error: `Insufficient USDC balance for deployment and gas fees.`
            };
        }
        // Log full error details for debugging
        console.error('Full error details:', {
            message: error.message,
            cause: error.cause?.message,
            details: error.details,
            code: error.code,
            data: error.data,
            stack: error.stack?.split('\n').slice(0, 5) // First 5 lines of stack trace
        });
        return {
            success: false,
            error: error.message || error.details || 'Unknown error occurred'
        };
    }
}
/**
 * Get current Compound V3 APY from DefiLlama
 */
async function getCompoundV3APY() {
    const { getCompoundV3APY } = await Promise.resolve().then(() => __importStar(require('../lib/defillama-api')));
    return await getCompoundV3APY();
}
/**
 * Check if user has funds deployed in Compound V3
 */
async function getCompoundV3Balance(walletAddress) {
    try {
        const { coinbasePublicClient } = await Promise.resolve().then(() => __importStar(require('../lib/coinbase-wallet')));
        const balance = await coinbasePublicClient.readContract({
            address: COMPOUND_V3_USDC_ADDRESS,
            abi: [
                {
                    constant: true,
                    inputs: [{ name: 'account', type: 'address' }],
                    name: 'balanceOf',
                    outputs: [{ name: '', type: 'uint256' }],
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
        console.error('Error checking Compound V3 balance:', error);
        return '0.00';
    }
}
/**
 * Withdraw USDC from Compound V3 with CDP sponsored gas
 */
async function withdrawFromCompoundV3(userId, usdcAmount) {
    try {
        console.log(`💸 Withdrawing ${usdcAmount} USDC from Compound V3 for user ${userId}`);
        // Get user's Coinbase Smart Wallet
        const wallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
        if (!wallet) {
            throw new Error('No Coinbase Smart Wallet found for user');
        }
        const { smartAccount } = wallet;
        // Convert USDC amount to proper units (6 decimals)
        const withdrawAmountWei = (0, viem_1.parseUnits)(usdcAmount, 6);
        // Check current Compound V3 balance
        const compoundBalance = await getCompoundV3Balance(smartAccount.address);
        const compoundBalanceWei = (0, viem_1.parseUnits)(compoundBalance, 6);
        if (compoundBalanceWei === 0n) {
            throw new Error('No USDC deposited in Compound V3 to withdraw');
        }
        if (withdrawAmountWei > compoundBalanceWei) {
            throw new Error(`Insufficient Compound V3 balance. Requested: ${usdcAmount} USDC, Available: ${compoundBalance} USDC`);
        }
        // Create bundler client with CDP paymaster for USDC gas payments
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        console.log(`🚀 Preparing USDC gas payment transaction for ${usdcAmount} USDC withdrawal...`);
        // Build calls array - just withdraw (no approval needed for withdrawals)
        const calls = [
            {
                abi: COMPOUND_V3_ABI,
                functionName: 'withdraw',
                to: COMPOUND_V3_USDC_ADDRESS,
                args: [BASE_USDC_ADDRESS, withdrawAmountWei],
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
            paymaster: coinbase_wallet_1.cdpPaymasterClient,
            paymasterContext: {
                erc20: BASE_USDC_ADDRESS // Tell paymaster to use USDC for gas payment
            }
        });
        console.log(`⏳ Waiting for withdrawal confirmation: ${userOpHash}`);
        // Wait for transaction receipt
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: userOpHash,
        });
        console.log(`✅ Withdrawal confirmed! Hash: ${receipt.receipt.transactionHash}`);
        return {
            success: true,
            txHash: receipt.receipt.transactionHash
        };
    }
    catch (error) {
        console.error('Error withdrawing from Compound V3:', error);
        // Check for Compound V3 specific errors
        if (error.message?.includes('0x36405305')) {
            console.error('Compound V3 contract error during withdrawal');
            return {
                success: false,
                error: 'Compound V3 withdrawal failed due to contract error. Please try again later or contact support.'
            };
        }
        // Check if it's a paymaster rejection
        if (error.code === -32002 && error.data?.acceptedTokens) {
            console.error('Paymaster rejection during withdrawal:', error.data);
            return {
                success: false,
                error: `Gas payment failed. Please ensure you have some USDC for gas fees.`
            };
        }
        // Check for insufficient balance errors
        if (error.message?.includes('Insufficient') || error.message?.includes('No USDC deposited')) {
            return {
                success: false,
                error: error.message
            };
        }
        // Log full error details for debugging
        console.error('Full withdrawal error details:', {
            message: error.message,
            cause: error.cause?.message,
            details: error.details,
            code: error.code,
            data: error.data,
            stack: error.stack?.split('\n').slice(0, 5)
        });
        return {
            success: false,
            error: error.message || error.details || 'Unknown withdrawal error occurred'
        };
    }
}
/**
 * Auto-deploy USDC to Aave V3 with sponsored gas
 */
async function gaslessDeployToAave(userId, usdcAmount) {
    try {
        console.log(`🚀 Auto-deploying ${usdcAmount} USDC to Aave V3 for user ${userId}`);
        // Get user's Coinbase Smart Wallet
        const wallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
        if (!wallet) {
            throw new Error('No Coinbase Smart Wallet found for user');
        }
        const { smartAccount } = wallet;
        // Convert USDC amount to proper units (6 decimals)
        const amountWei = (0, viem_1.parseUnits)(usdcAmount, 6);
        // Check current USDC balance
        const currentBalance = await (0, coinbase_wallet_1.getCoinbaseWalletUSDCBalance)(smartAccount.address);
        const currentBalanceWei = (0, viem_1.parseUnits)(currentBalance, 6);
        // Reserve small amount for gas (Base gas is ~1¢)
        const gasReserveWei = (0, viem_1.parseUnits)('0.01', 6); // $0.01 USDC reserve for gas (1 cent)
        // Auto-fit deployment amount to available balance minus gas reserve
        let deployAmountWei;
        let actualDeployAmount;
        if (currentBalanceWei < gasReserveWei) {
            throw new Error(`Insufficient USDC balance for gas fees. Have: ${currentBalance} USDC, Need at least: $0.01 USDC for gas`);
        }
        const maxDeployableWei = currentBalanceWei - gasReserveWei;
        if (amountWei > maxDeployableWei) {
            // Auto-fit to available balance
            deployAmountWei = maxDeployableWei;
            actualDeployAmount = (Number(deployAmountWei) / Math.pow(10, 6)).toFixed(2);
            console.log(`💰 Auto-fitting deployment: ${usdcAmount} USDC requested, deploying ${actualDeployAmount} USDC (reserved $0.01 for gas)`);
        }
        else {
            // Use requested amount
            deployAmountWei = amountWei;
            actualDeployAmount = usdcAmount;
            console.log(`💰 Deploying full amount: ${actualDeployAmount} USDC (${currentBalance} USDC available, $0.01 reserved for gas)`);
        }
        // Create bundler client with CDP paymaster for USDC gas payments
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        console.log(`🚀 Preparing USDC gas payment transaction for ${actualDeployAmount} USDC to Aave V3...`);
        // Build calls array - approve and supply to Aave
        const calls = [
            // 1. Approve Aave V3 Pool to spend USDC
            {
                abi: ERC20_ABI,
                functionName: 'approve',
                to: BASE_USDC_ADDRESS,
                args: [AAVE_V3_POOL_ADDRESS, deployAmountWei],
            },
            // 2. Supply USDC to Aave V3
            {
                abi: AAVE_V3_POOL_ABI,
                functionName: 'supply',
                to: AAVE_V3_POOL_ADDRESS,
                args: [BASE_USDC_ADDRESS, deployAmountWei, smartAccount.address, 0], // 0 = no referral
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
            paymaster: coinbase_wallet_1.cdpPaymasterClient,
            paymasterContext: {
                erc20: BASE_USDC_ADDRESS // Tell paymaster to use USDC for gas payment
            }
        });
        console.log(`⏳ Waiting for Aave V3 transaction confirmation: ${userOpHash}`);
        // Wait for transaction receipt
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: userOpHash,
        });
        console.log(`✅ Aave V3 deposit confirmed! Hash: ${receipt.receipt.transactionHash}`);
        // Complete user onboarding
        (0, database_1.updateUserOnboardingStatus)(userId, true);
        return {
            success: true,
            txHash: receipt.receipt.transactionHash
        };
    }
    catch (error) {
        console.error('Error auto-deploying to Aave V3:', error);
        // Check if it's a paymaster rejection
        if (error.code === -32002 && error.data?.acceptedTokens) {
            console.error('Paymaster rejection during Aave deposit:', error.data);
            return {
                success: false,
                error: `Gas payment failed. Please ensure you have sufficient USDC for gas fees.`
            };
        }
        // Check for balance-related errors
        if (error.message?.includes('transfer amount exceeds balance') || error.message?.includes('Insufficient')) {
            return {
                success: false,
                error: error.message
            };
        }
        // Log full error details for debugging
        console.error('Full Aave V3 deposit error details:', {
            message: error.message,
            cause: error.cause?.message,
            details: error.details,
            code: error.code,
            data: error.data,
            stack: error.stack?.split('\n').slice(0, 5)
        });
        return {
            success: false,
            error: error.message || error.details || 'Unknown Aave V3 deposit error occurred'
        };
    }
}
/**
 * Withdraw USDC from Aave V3 with CDP sponsored gas
 */
async function gaslessWithdrawFromAave(userId, usdcAmount) {
    try {
        console.log(`💸 Withdrawing ${usdcAmount} USDC from Aave V3 for user ${userId}`);
        // Get user's Coinbase Smart Wallet
        const wallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
        if (!wallet) {
            throw new Error('No Coinbase Smart Wallet found for user');
        }
        const { smartAccount } = wallet;
        // Convert USDC amount to proper units (6 decimals) or use max
        const isMaxWithdrawal = usdcAmount.toLowerCase() === "max";
        const withdrawAmountWei = isMaxWithdrawal
            ? (0, viem_1.parseUnits)("115792089237316195423570985008687907853269984665640564039457584007913129639935", 0) // MAX_UINT256
            : (0, viem_1.parseUnits)(usdcAmount, 6);
        // Create bundler client with CDP paymaster for USDC gas payments
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        console.log(`🚀 Preparing USDC gas payment transaction for ${isMaxWithdrawal ? "max" : usdcAmount} USDC withdrawal from Aave V3...`);
        // Build calls array - just withdraw (no approval needed for withdrawals)
        const calls = [
            {
                abi: AAVE_V3_POOL_ABI,
                functionName: 'withdraw',
                to: AAVE_V3_POOL_ADDRESS,
                args: [BASE_USDC_ADDRESS, withdrawAmountWei, smartAccount.address],
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
            paymaster: coinbase_wallet_1.cdpPaymasterClient,
            paymasterContext: {
                erc20: BASE_USDC_ADDRESS // Tell paymaster to use USDC for gas payment
            }
        });
        console.log(`⏳ Waiting for Aave V3 withdrawal confirmation: ${userOpHash}`);
        // Wait for transaction receipt
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: userOpHash,
        });
        console.log(`✅ Aave V3 withdrawal confirmed! Hash: ${receipt.receipt.transactionHash}`);
        return {
            success: true,
            txHash: receipt.receipt.transactionHash
        };
    }
    catch (error) {
        console.error('Error withdrawing from Aave V3:', error);
        // Check if it's a paymaster rejection
        if (error.code === -32002 && error.data?.acceptedTokens) {
            console.error('Paymaster rejection during Aave withdrawal:', error.data);
            return {
                success: false,
                error: `Gas payment failed. Please ensure you have some USDC for gas fees.`
            };
        }
        // Check for insufficient balance errors
        if (error.message?.includes('Insufficient') || error.message?.includes('No USDC deposited')) {
            return {
                success: false,
                error: error.message
            };
        }
        // Log full error details for debugging
        console.error('Full Aave V3 withdrawal error details:', {
            message: error.message,
            cause: error.cause?.message,
            details: error.details,
            code: error.code,
            data: error.data,
            stack: error.stack?.split('\n').slice(0, 5)
        });
        return {
            success: false,
            error: error.message || error.details || 'Unknown Aave V3 withdrawal error occurred'
        };
    }
}
/**
 * Auto-deploy USDC to Fluid Finance with sponsored gas
 */
async function gaslessDeployToFluid(userId, usdcAmount) {
    try {
        console.log(`🚀 Auto-deploying ${usdcAmount} USDC to Fluid Finance for user ${userId}`);
        // Get user's Coinbase Smart Wallet
        const wallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
        if (!wallet) {
            throw new Error('No Coinbase Smart Wallet found for user');
        }
        const { smartAccount } = wallet;
        // Convert USDC amount to proper units (6 decimals)
        const amountWei = (0, viem_1.parseUnits)(usdcAmount, 6);
        // Check current USDC balance
        const currentBalance = await (0, coinbase_wallet_1.getCoinbaseWalletUSDCBalance)(smartAccount.address);
        const currentBalanceWei = (0, viem_1.parseUnits)(currentBalance, 6);
        // Reserve small amount for gas (Base gas is ~1¢)
        const gasReserveWei = (0, viem_1.parseUnits)('0.01', 6); // $0.01 USDC reserve for gas (1 cent)
        // Auto-fit deployment amount to available balance minus gas reserve
        let deployAmountWei;
        let actualDeployAmount;
        if (currentBalanceWei < gasReserveWei) {
            throw new Error(`Insufficient USDC balance for gas fees. Have: ${currentBalance} USDC, Need at least: $0.01 USDC for gas`);
        }
        const maxDeployableWei = currentBalanceWei - gasReserveWei;
        if (amountWei > maxDeployableWei) {
            // Auto-fit to available balance
            deployAmountWei = maxDeployableWei;
            actualDeployAmount = (Number(deployAmountWei) / Math.pow(10, 6)).toFixed(2);
            console.log(`💰 Auto-fitting deployment: ${usdcAmount} USDC requested, deploying ${actualDeployAmount} USDC (reserved $0.01 for gas)`);
        }
        else {
            // Use requested amount
            deployAmountWei = amountWei;
            actualDeployAmount = usdcAmount;
            console.log(`💰 Deploying full amount: ${actualDeployAmount} USDC (${currentBalance} USDC available, $0.01 reserved for gas)`);
        }
        // Create bundler client with CDP paymaster for USDC gas payments
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        console.log(`🚀 Preparing USDC gas payment transaction for ${actualDeployAmount} USDC to Fluid Finance...`);
        // Build calls array - approve and deposit to Fluid
        const calls = [
            // 1. Approve Fluid fUSDC to spend USDC
            {
                abi: ERC20_ABI,
                functionName: 'approve',
                to: BASE_USDC_ADDRESS,
                args: [FLUID_FUSDC_ADDRESS, deployAmountWei],
            },
            // 2. Deposit USDC to Fluid Finance
            {
                abi: FLUID_FTOKEN_ABI,
                functionName: 'deposit',
                to: FLUID_FUSDC_ADDRESS,
                args: [deployAmountWei, smartAccount.address], // amount_, receiver_
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
            paymaster: coinbase_wallet_1.cdpPaymasterClient,
            paymasterContext: {
                erc20: BASE_USDC_ADDRESS // Tell paymaster to use USDC for gas payment
            }
        });
        console.log(`⏳ Waiting for Fluid Finance transaction confirmation: ${userOpHash}`);
        // Wait for transaction receipt
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: userOpHash,
        });
        console.log(`✅ Fluid Finance deposit confirmed! Hash: ${receipt.receipt.transactionHash}`);
        // Complete user onboarding
        (0, database_1.updateUserOnboardingStatus)(userId, true);
        return {
            success: true,
            txHash: receipt.receipt.transactionHash
        };
    }
    catch (error) {
        console.error('Error auto-deploying to Fluid Finance:', error);
        // Check if it's a paymaster rejection
        if (error.code === -32002 && error.data?.acceptedTokens) {
            console.error('Paymaster rejection during Fluid deposit:', error.data);
            return {
                success: false,
                error: `Gas payment failed. Please ensure you have sufficient USDC for gas fees.`
            };
        }
        // Check for balance-related errors
        if (error.message?.includes('transfer amount exceeds balance') || error.message?.includes('Insufficient')) {
            return {
                success: false,
                error: error.message
            };
        }
        // Log full error details for debugging
        console.error('Full Fluid Finance deposit error details:', {
            message: error.message,
            cause: error.cause?.message,
            details: error.details,
            code: error.code,
            data: error.data,
            stack: error.stack?.split('\n').slice(0, 5)
        });
        return {
            success: false,
            error: error.message || error.details || 'Unknown Fluid Finance deposit error occurred'
        };
    }
}
/**
 * Withdraw USDC from Fluid Finance with CDP sponsored gas
 */
async function gaslessWithdrawFromFluid(userId, usdcAmount) {
    try {
        console.log(`💸 Withdrawing ${usdcAmount} USDC from Fluid Finance for user ${userId}`);
        // Get user's Coinbase Smart Wallet
        const wallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
        if (!wallet) {
            throw new Error('No Coinbase Smart Wallet found for user');
        }
        const { smartAccount } = wallet;
        // Convert USDC amount to proper units (6 decimals) or use max
        const isMaxWithdrawal = usdcAmount.toLowerCase() === "max";
        const withdrawAmountWei = isMaxWithdrawal
            ? (0, viem_1.parseUnits)("115792089237316195423570985008687907853269984665640564039457584007913129639935", 0) // MAX_UINT256
            : (0, viem_1.parseUnits)(usdcAmount, 6);
        // Create bundler client with CDP paymaster for USDC gas payments
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        console.log(`🚀 Preparing USDC gas payment transaction for ${isMaxWithdrawal ? "max" : usdcAmount} USDC withdrawal from Fluid Finance...`);
        // Build calls array - just withdraw (no approval needed for withdrawals)
        const calls = [
            {
                abi: FLUID_FTOKEN_ABI,
                functionName: 'withdraw',
                to: FLUID_FUSDC_ADDRESS,
                args: [withdrawAmountWei, smartAccount.address, smartAccount.address], // amount_, receiver_, owner_
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
            paymaster: coinbase_wallet_1.cdpPaymasterClient,
            paymasterContext: {
                erc20: BASE_USDC_ADDRESS // Tell paymaster to use USDC for gas payment
            }
        });
        console.log(`⏳ Waiting for Fluid Finance withdrawal confirmation: ${userOpHash}`);
        // Wait for transaction receipt
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: userOpHash,
        });
        console.log(`✅ Fluid Finance withdrawal confirmed! Hash: ${receipt.receipt.transactionHash}`);
        return {
            success: true,
            txHash: receipt.receipt.transactionHash
        };
    }
    catch (error) {
        console.error('Error withdrawing from Fluid Finance:', error);
        // Check if it's a paymaster rejection
        if (error.code === -32002 && error.data?.acceptedTokens) {
            console.error('Paymaster rejection during Fluid withdrawal:', error.data);
            return {
                success: false,
                error: `Gas payment failed. Please ensure you have some USDC for gas fees.`
            };
        }
        // Check for insufficient balance errors
        if (error.message?.includes('Insufficient') || error.message?.includes('No USDC deposited')) {
            return {
                success: false,
                error: error.message
            };
        }
        // Log full error details for debugging
        console.error('Full Fluid Finance withdrawal error details:', {
            message: error.message,
            cause: error.cause?.message,
            details: error.details,
            code: error.code,
            data: error.data,
            stack: error.stack?.split('\n').slice(0, 5)
        });
        return {
            success: false,
            error: error.message || error.details || 'Unknown Fluid Finance withdrawal error occurred'
        };
    }
}
