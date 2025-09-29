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
exports.supplyToAave = supplyToAave;
exports.supplyToCompound = supplyToCompound;
exports.withdrawFromCompound = withdrawFromCompound;
exports.withdrawFromAave = withdrawFromAave;
exports.supplyToFluid = supplyToFluid;
exports.withdrawFromFluid = withdrawFromFluid;
exports.executeWithdraw = executeWithdraw;
exports.claimCompoundRewards = claimCompoundRewards;
exports.getPendingFluidRewards = getPendingFluidRewards;
exports.getPendingCompoundRewards = getPendingCompoundRewards;
exports.executeZap = executeZap;
const viem_1 = require("viem");
const token_wallet_1 = require("./token-wallet");
const constants_1 = require("../utils/constants");
const coinbase_wallet_1 = require("./coinbase-wallet");
const coinbase_defi_1 = require("../services/coinbase-defi");
const morpho_defi_1 = require("../services/morpho-defi");
// Aave V3 Pool contract address on Base
const AAVE_V3_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
// Compound V3 USDC proxy contract address on Base (TransparentUpgradeableProxy)
const COMPOUND_V3_USDC = "0xb125e6687d4313864e53df431d5425969c15eb2f";
// Fluid Finance fUSDC contract address on Base
const FLUID_FUSDC = "0xf42f5795d9ac7e9d757db633d693cd548cfd9169";
// Aave V3 Pool ABI - only the functions we need
const AAVE_POOL_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "asset", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "internalType": "address", "name": "onBehalfOf", "type": "address" },
            { "internalType": "uint16", "name": "referralCode", "type": "uint16" }
        ],
        "name": "supply",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "asset", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "internalType": "address", "name": "to", "type": "address" }
        ],
        "name": "withdraw",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];
// Compound V3 ABI - only the functions we need
const COMPOUND_V3_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "asset", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "supply",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "asset", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "withdraw",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];
// CometRewards ABI for claiming COMP rewards
const COMET_REWARDS_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "comet", "type": "address" },
            { "internalType": "address", "name": "src", "type": "address" },
            { "internalType": "bool", "name": "shouldAccrue", "type": "bool" }
        ],
        "name": "claim",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "comet", "type": "address" },
            { "internalType": "address", "name": "account", "type": "address" }
        ],
        "name": "getRewardOwed",
        "outputs": [
            { "internalType": "address", "name": "", "type": "address" },
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];
// ERC20 ABI for approve function
const ERC20_APPROVE_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "spender", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];
// Fluid Finance fToken ABI - deposit/withdraw functions
const FLUID_FTOKEN_ABI = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "amount_", "type": "uint256" },
            { "internalType": "address", "name": "receiver_", "type": "address" }
        ],
        "name": "deposit",
        "outputs": [{ "internalType": "uint256", "name": "shares_", "type": "uint256" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "amount_", "type": "uint256" },
            { "internalType": "address", "name": "receiver_", "type": "address" },
            { "internalType": "address", "name": "owner_", "type": "address" }
        ],
        "name": "withdraw",
        "outputs": [{ "internalType": "uint256", "name": "shares_", "type": "uint256" }],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];
/**
 * Check if wallet has sufficient ETH for gas fees
 * @param walletData User's wallet data
 * @param minEthRequired Minimum ETH required (default 0.0001 ETH)
 * @returns Promise<void> - throws error if insufficient
 */
async function checkEthBalance(walletData, minEthRequired = "0.0001") {
    const userAddress = walletData.address;
    const ethBalance = await (0, token_wallet_1.getEthBalance)(userAddress);
    const balanceInEth = (0, viem_1.formatEther)(BigInt(ethBalance));
    console.log(`Wallet ETH balance: ${balanceInEth} ETH`);
    if (parseFloat(balanceInEth) < parseFloat(minEthRequired)) {
        throw new Error(`Insufficient ETH for gas fees. You have ${balanceInEth} ETH but need at least ${minEthRequired} ETH. ` +
            `Please deposit ETH to ${userAddress} on Base network.`);
    }
}
/**
 * Supply USDC to Aave V3
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5")
 * @returns Transaction receipt
 */
async function supplyToAave(walletData, amountUsdc) {
    const userAddress = walletData.address;
    const usdcAmount = (0, viem_1.parseUnits)(amountUsdc, 6); // USDC has 6 decimals
    // Check ETH balance for gas fees first
    await checkEthBalance(walletData, "0.0001"); // Require 0.0001 ETH minimum (~40 cents)
    // Step 1: Check and approve USDC allowance for Aave Pool
    const currentAllowance = await (0, token_wallet_1.getTokenAllowance)(constants_1.BASE_TOKENS.USDC, userAddress, AAVE_V3_POOL);
    if (BigInt(currentAllowance) < usdcAmount) {
        console.log("Approving USDC for Aave Pool...");
        const approvalReceipt = await (0, token_wallet_1.executeContractMethod)({
            walletData,
            contractAddress: constants_1.BASE_TOKENS.USDC,
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            args: [AAVE_V3_POOL, constants_1.MAX_UINT256] // Approve max amount for future transactions
        });
        console.log(`Approval transaction confirmed: ${approvalReceipt.transactionHash}`);
        // Verify the approval was successful
        if (approvalReceipt.status !== "success") {
            throw new Error(`Approval transaction failed: ${approvalReceipt.transactionHash}`);
        }
        // Double-check the allowance was actually set
        const newAllowance = await (0, token_wallet_1.getTokenAllowance)(constants_1.BASE_TOKENS.USDC, userAddress, AAVE_V3_POOL);
        console.log(`New allowance after approval: ${newAllowance}`);
        if (BigInt(newAllowance) < usdcAmount) {
            throw new Error(`Approval failed to set sufficient allowance. Got: ${newAllowance}, Need: ${usdcAmount.toString()}`);
        }
    }
    // Step 2: Supply USDC to Aave
    console.log(`Supplying ${amountUsdc} USDC to Aave V3...`);
    const receipt = await (0, token_wallet_1.executeContractMethod)({
        walletData,
        contractAddress: AAVE_V3_POOL,
        abi: AAVE_POOL_ABI,
        functionName: "supply",
        args: [
            constants_1.BASE_TOKENS.USDC, // asset
            usdcAmount.toString(), // amount
            userAddress, // onBehalfOf (user receives aTokens)
            0 // referralCode (0 = no referral)
        ]
    });
    return receipt;
}
/**
 * Supply USDC to Compound V3
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5")
 * @returns Transaction receipt
 */
async function supplyToCompound(walletData, amountUsdc) {
    const userAddress = walletData.address;
    const usdcAmount = (0, viem_1.parseUnits)(amountUsdc, 6); // USDC has 6 decimals
    // Check ETH balance for gas fees first
    await checkEthBalance(walletData, "0.0001"); // Require 0.0001 ETH minimum (~40 cents)
    // Step 1: Check and approve USDC allowance for Compound V3
    const currentAllowance = await (0, token_wallet_1.getTokenAllowance)(constants_1.BASE_TOKENS.USDC, userAddress, COMPOUND_V3_USDC);
    if (BigInt(currentAllowance) < usdcAmount) {
        console.log("Approving USDC for Compound V3...");
        const approvalReceipt = await (0, token_wallet_1.executeContractMethod)({
            walletData,
            contractAddress: constants_1.BASE_TOKENS.USDC,
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            args: [COMPOUND_V3_USDC, constants_1.MAX_UINT256] // Approve max amount
        });
        console.log(`Approval transaction confirmed: ${approvalReceipt.transactionHash}`);
        // Verify the approval was successful
        if (approvalReceipt.status !== "success") {
            throw new Error(`Approval transaction failed: ${approvalReceipt.transactionHash}`);
        }
    }
    // Step 2: Supply USDC to Compound
    console.log(`Supplying ${amountUsdc} USDC to Compound V3...`);
    const receipt = await (0, token_wallet_1.executeContractMethod)({
        walletData,
        contractAddress: COMPOUND_V3_USDC,
        abi: COMPOUND_V3_ABI,
        functionName: "supply",
        args: [
            constants_1.BASE_TOKENS.USDC, // asset
            usdcAmount.toString() // amount
        ]
    });
    return receipt;
}
/**
 * Withdraw USDC from Compound V3
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5") or "max" for full withdrawal
 * @param claimRewards Whether to claim rewards before withdrawal (default true for max, false for partial)
 * @returns Transaction receipt
 */
async function withdrawFromCompound(walletData, amountUsdc, claimRewards) {
    const userAddress = walletData.address;
    const isMaxWithdrawal = amountUsdc.toLowerCase() === "max";
    // Check ETH balance for gas fees first
    await checkEthBalance(walletData, "0.0001");
    // Default behavior: claim rewards for max withdrawal, don't claim for partial
    const shouldClaimRewards = claimRewards !== undefined ? claimRewards : isMaxWithdrawal;
    // If claiming rewards, do that first (this is a simplified version - Compound rewards need specific setup)
    if (shouldClaimRewards) {
        console.log("Note: Reward claiming would happen here - currently simplified for v1");
        // TODO: Implement actual reward claiming when Compound rewards are configured
    }
    // For max withdrawal, use MAX_UINT256 which tells Compound to withdraw all
    const usdcAmount = isMaxWithdrawal
        ? BigInt(constants_1.MAX_UINT256)
        : (0, viem_1.parseUnits)(amountUsdc, 6);
    console.log(`Withdrawing ${isMaxWithdrawal ? "all" : amountUsdc} USDC from Compound V3${shouldClaimRewards ? " (with rewards)" : ""}...`);
    const receipt = await (0, token_wallet_1.executeContractMethod)({
        walletData,
        contractAddress: COMPOUND_V3_USDC,
        abi: COMPOUND_V3_ABI,
        functionName: "withdraw",
        args: [
            constants_1.BASE_TOKENS.USDC, // asset
            usdcAmount.toString() // amount (MAX_UINT256 for full withdrawal)
        ]
    });
    return receipt;
}
/**
 * Withdraw USDC from Aave V3
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5") or "max" for full withdrawal
 * @param claimRewards Whether to claim rewards before withdrawal (default true for max, false for partial)
 * @returns Transaction receipt
 */
async function withdrawFromAave(walletData, amountUsdc, claimRewards) {
    const userAddress = walletData.address;
    const isMaxWithdrawal = amountUsdc.toLowerCase() === "max";
    // Check ETH balance for gas fees first
    await checkEthBalance(walletData, "0.0001");
    // Default behavior: claim rewards for max withdrawal, don't claim for partial
    const shouldClaimRewards = claimRewards !== undefined ? claimRewards : isMaxWithdrawal;
    // If claiming rewards, do that first (this is a simplified version - Aave rewards need specific setup)
    if (shouldClaimRewards) {
        console.log("Note: Reward claiming would happen here - currently simplified for v1");
        // TODO: Implement actual reward claiming when Aave rewards are configured
    }
    // For max withdrawal, use MAX_UINT256 which tells Aave to withdraw all aTokens
    const usdcAmount = isMaxWithdrawal
        ? BigInt(constants_1.MAX_UINT256)
        : (0, viem_1.parseUnits)(amountUsdc, 6);
    console.log(`Withdrawing ${isMaxWithdrawal ? "all" : amountUsdc} USDC from Aave V3${shouldClaimRewards ? " (with rewards)" : ""}...`);
    const receipt = await (0, token_wallet_1.executeContractMethod)({
        walletData,
        contractAddress: AAVE_V3_POOL,
        abi: AAVE_POOL_ABI,
        functionName: "withdraw",
        args: [
            constants_1.BASE_TOKENS.USDC, // asset
            usdcAmount.toString(), // amount (MAX_UINT256 for full withdrawal)
            userAddress // to (where to send withdrawn USDC)
        ]
    });
    return receipt;
}
/**
 * Supply USDC to Fluid Finance
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5")
 * @returns Transaction receipt
 */
async function supplyToFluid(walletData, amountUsdc) {
    const userAddress = walletData.address;
    const usdcAmount = (0, viem_1.parseUnits)(amountUsdc, 6); // USDC has 6 decimals
    // Check ETH balance for gas fees first
    await checkEthBalance(walletData, "0.0001");
    // Step 1: Check and approve USDC allowance for Fluid fUSDC
    console.log(`Fluid contract address: ${FLUID_FUSDC}`);
    console.log(`USDC contract address: ${constants_1.BASE_TOKENS.USDC}`);
    console.log(`User address: ${userAddress}`);
    const currentAllowance = await (0, token_wallet_1.getTokenAllowance)(constants_1.BASE_TOKENS.USDC, userAddress, FLUID_FUSDC);
    console.log(`Current USDC allowance for Fluid: ${currentAllowance}`);
    if (BigInt(currentAllowance) < usdcAmount) {
        console.log(`Approving USDC for Fluid Finance... Required: ${usdcAmount.toString()}`);
        const approvalReceipt = await (0, token_wallet_1.executeContractMethod)({
            walletData,
            contractAddress: constants_1.BASE_TOKENS.USDC,
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            args: [FLUID_FUSDC, constants_1.MAX_UINT256] // Approve max amount for future transactions
        });
        console.log(`Approval transaction confirmed: ${approvalReceipt.transactionHash}`);
        // Verify the approval was successful
        if (approvalReceipt.status !== "success") {
            throw new Error(`Approval transaction failed: ${approvalReceipt.transactionHash}`);
        }
        // Wait a moment for the approval to be indexed
        console.log("Waiting 2 seconds for approval to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Double-check the allowance was actually set
        const newAllowance = await (0, token_wallet_1.getTokenAllowance)(constants_1.BASE_TOKENS.USDC, userAddress, FLUID_FUSDC);
        console.log(`New allowance after approval: ${newAllowance}`);
        if (BigInt(newAllowance) < usdcAmount) {
            throw new Error(`Approval failed to set sufficient allowance. Got: ${newAllowance}, Need: ${usdcAmount.toString()}`);
        }
    }
    // Step 2: Deposit USDC to Fluid
    console.log(`Depositing ${amountUsdc} USDC to Fluid Finance...`);
    const receipt = await (0, token_wallet_1.executeContractMethod)({
        walletData,
        contractAddress: FLUID_FUSDC,
        abi: FLUID_FTOKEN_ABI,
        functionName: "deposit",
        args: [
            usdcAmount.toString(), // amount_
            userAddress // receiver_ (user receives fUSDC tokens)
        ]
    });
    return receipt;
}
/**
 * Withdraw USDC from Fluid Finance
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5") or "max" for full withdrawal
 * @param claimRewards Whether to claim rewards before withdrawal (default true for max, false for partial)
 * @returns Transaction receipt
 */
async function withdrawFromFluid(walletData, amountUsdc, claimRewards) {
    const userAddress = walletData.address;
    const isMaxWithdrawal = amountUsdc.toLowerCase() === "max";
    // Check ETH balance for gas fees first
    await checkEthBalance(walletData, "0.0001");
    // Default behavior: claim rewards for max withdrawal, don't claim for partial
    const shouldClaimRewards = claimRewards !== undefined ? claimRewards : isMaxWithdrawal;
    // If claiming rewards, do that first (this is a simplified version - Fluid rewards need specific setup)
    if (shouldClaimRewards) {
        console.log("Note: Reward claiming would happen here - currently simplified for v1");
        // TODO: Implement actual reward claiming when Fluid rewards are configured
    }
    // For max withdrawal, use MAX_UINT256 which tells Fluid to withdraw all fUSDC
    const usdcAmount = isMaxWithdrawal
        ? BigInt(constants_1.MAX_UINT256)
        : (0, viem_1.parseUnits)(amountUsdc, 6);
    console.log(`Withdrawing ${isMaxWithdrawal ? "all" : amountUsdc} USDC from Fluid Finance${shouldClaimRewards ? " (with rewards)" : ""}...`);
    const receipt = await (0, token_wallet_1.executeContractMethod)({
        walletData,
        contractAddress: FLUID_FUSDC,
        abi: FLUID_FTOKEN_ABI,
        functionName: "withdraw",
        args: [
            usdcAmount.toString(), // amount_ (MAX_UINT256 for full withdrawal)
            userAddress, // receiver_ (where to send withdrawn USDC)
            userAddress // owner_ (who owns the fUSDC tokens)
        ]
    });
    return receipt;
}
/**
 * Execute a withdrawal transaction from the specified protocol
 * @param protocol Protocol name ("aave", "fluid", or "compound")
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC to withdraw or "max" for full withdrawal
 * @param claimRewards Whether to claim rewards before withdrawal
 * @returns Transaction receipt
 */
async function executeWithdraw(protocol, walletData, amountUsdc, claimRewards, userId) {
    // Check if user has Smart Wallet for gasless transactions (require userId for gasless)
    const hasSmartWallet = userId ? (0, coinbase_wallet_1.hasCoinbaseSmartWallet)(userId) : false;
    if (hasSmartWallet) {
        console.log(`🦑 Using gasless transactions for ${protocol} withdrawal`);
        // Route to gasless functions (note: claimRewards is handled internally)
        let result;
        switch (protocol.toLowerCase()) {
            case "aave":
                result = await (0, coinbase_defi_1.gaslessWithdrawFromAave)(userId, amountUsdc);
                break;
            case "fluid":
                result = await (0, coinbase_defi_1.gaslessWithdrawFromFluid)(userId, amountUsdc);
                break;
            case "compound":
                result = await (0, coinbase_defi_1.withdrawFromCompoundV3)(userId, amountUsdc);
                break;
            case "morpho":
                result = await (0, morpho_defi_1.withdrawFromMorphoPYTH)(userId, amountUsdc);
                break;
            case "spark":
                const { withdrawFromSpark } = await Promise.resolve().then(() => __importStar(require("../services/spark-defi")));
                result = await withdrawFromSpark(userId, amountUsdc);
                break;
            case "seamless":
                const { withdrawFromSeamless } = await Promise.resolve().then(() => __importStar(require("../services/seamless-defi")));
                result = await withdrawFromSeamless(userId, amountUsdc);
                break;
            case "moonwell":
            case "moonwell usdc":
                const { withdrawFromMoonwell } = await Promise.resolve().then(() => __importStar(require("../services/moonwell-defi")));
                result = await withdrawFromMoonwell(userId, amountUsdc);
                break;
            case "morpho-re7":
            case "re7 universal usdc":
            case "re7":
                const { withdrawFromMorphoRe7 } = await Promise.resolve().then(() => __importStar(require("../services/morpho-re7-defi")));
                result = await withdrawFromMorphoRe7(userId, amountUsdc);
                break;
            default:
                throw new Error(`Unsupported protocol for gasless: ${protocol.toLowerCase()}`);
        }
        if (!result.success) {
            throw new Error(result.error || `Gasless ${protocol} withdrawal failed`);
        }
        // Return a compatible TransactionReceipt format
        return {
            transactionHash: result.txHash,
            status: "success"
        };
    }
    else {
        console.log(`📤 Using regular transactions for ${protocol} withdrawal (no Smart Wallet)`);
        // Fall back to regular functions for users without Smart Wallet
        switch (protocol.toLowerCase()) {
            case "aave":
                return await withdrawFromAave(walletData, amountUsdc, claimRewards);
            case "fluid":
                return await withdrawFromFluid(walletData, amountUsdc, claimRewards);
            case "compound":
                return await withdrawFromCompound(walletData, amountUsdc, claimRewards);
            case "morpho":
                throw new Error(`Morpho requires a Coinbase Smart Wallet for gasless transactions. Please create a Smart Wallet using /wallet.`);
            default:
                throw new Error(`Unsupported protocol: ${protocol}`);
        }
    }
}
/**
 * Execute a zap transaction to the specified protocol
 * @param protocol Protocol name ("Aave" or "Compound")
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC to supply
 * @returns Transaction receipt
 */
/**
 * Claim COMP rewards from Compound V3
 * @param walletData User's wallet data
 * @returns Transaction receipt
 */
async function claimCompoundRewards(walletData) {
    const userAddress = walletData.address;
    // Check ETH balance for gas fees first
    await checkEthBalance(walletData, "0.0001");
    console.log(`Claiming COMP rewards from Compound V3 for ${userAddress}...`);
    const receipt = await (0, token_wallet_1.executeContractMethod)({
        walletData,
        contractAddress: constants_1.BASE_TOKENS.CometRewards,
        abi: COMET_REWARDS_ABI,
        functionName: "claim",
        args: [
            COMPOUND_V3_USDC, // comet - the Compound V3 USDC contract
            userAddress, // src - the user address
            true // shouldAccrue - true to accrue latest rewards
        ]
    });
    return receipt;
}
/**
 * Get pending FLUID token rewards from FluidMerkleDistributor
 * Based on transaction structure from FluidMerkleDistributor.claim()
 */
async function getPendingFluidRewards(userAddress) {
    try {
        const FLUID_TOKEN = "0x61e030a56d33e8260fdd81f03b162a79fe3449cd";
        console.log(`🔍 Checking FLUID rewards for ${userAddress}...`);
        // Step 1: Get user's positions from Fluid API
        const positionsUrl = `https://api.fluid.instadapp.io/v2/lending/8453/users/${userAddress}/positions`;
        console.log(`Fetching positions from: ${positionsUrl}`);
        const positionsResponse = await fetch(positionsUrl);
        if (!positionsResponse.ok) {
            console.error(`Failed to fetch positions: ${positionsResponse.status}`);
            throw new Error(`Failed to fetch positions: ${positionsResponse.status}`);
        }
        const positionsData = await positionsResponse.json();
        console.log(`📊 Found ${positionsData.length || 0} positions`);
        // Step 2: Get earnings for each position
        let totalEarnings = 0;
        let hasAnyEarnings = false;
        const positionIds = [];
        if (positionsData && positionsData.length > 0) {
            for (const position of positionsData) {
                try {
                    const positionId = position.positionId || position.position || position.id;
                    if (!positionId)
                        continue;
                    positionIds.push(positionId);
                    const earningsUrl = `https://api.fluid.instadapp.io/8453/users/${userAddress}/positions/${positionId}/earnings`;
                    console.log(`Fetching earnings for position ${positionId}...`);
                    const earningsResponse = await fetch(earningsUrl);
                    if (earningsResponse.ok) {
                        const earningsData = await earningsResponse.json();
                        // Parse earnings data (structure TBD - need to see actual response)
                        if (earningsData && earningsData.claimableAmount) {
                            const claimableAmount = parseFloat(earningsData.claimableAmount);
                            if (claimableAmount > 0) {
                                totalEarnings += claimableAmount;
                                hasAnyEarnings = true;
                            }
                        }
                    }
                }
                catch (positionError) {
                    console.warn(`Error fetching earnings for position:`, positionError);
                }
            }
        }
        console.log(`🎁 Total FLUID earnings: ${totalEarnings} FLUID`);
        return {
            rewardToken: FLUID_TOKEN,
            amount: (totalEarnings * 1e18).toString(), // Convert to wei
            amountFormatted: totalEarnings.toFixed(6),
            hasClaimableRewards: hasAnyEarnings,
            positionId: positionIds.length > 0 ? positionIds[0] : undefined, // Return first position
            cycle: undefined // Would need to get from merkle distributor
        };
    }
    catch (error) {
        console.error("Error fetching FLUID rewards:", error);
        return {
            rewardToken: "0x61e030a56d33e8260fdd81f03b162a79fe3449cd",
            amount: "0",
            amountFormatted: "0.000000",
            hasClaimableRewards: false
        };
    }
}
/**
 * Check pending COMP rewards for a user
 * @param userAddress User's wallet address
 * @returns Pending reward amount and token address
 */
async function getPendingCompoundRewards(userAddress) {
    try {
        const { createPublicClientForBase } = await Promise.resolve().then(() => __importStar(require("./token-wallet")));
        const publicClient = createPublicClientForBase();
        const result = await publicClient.readContract({
            address: constants_1.BASE_TOKENS.CometRewards,
            abi: COMET_REWARDS_ABI,
            functionName: "getRewardOwed",
            args: [COMPOUND_V3_USDC, userAddress]
        });
        const [rewardToken, amount] = result;
        return {
            rewardToken,
            amount: amount.toString(),
            amountFormatted: (Number(amount) / 1e18).toFixed(6) // COMP has 18 decimals
        };
    }
    catch (error) {
        console.error("Error getting pending Compound rewards:", error);
        return {
            rewardToken: constants_1.BASE_TOKENS.COMP,
            amount: "0",
            amountFormatted: "0.000000"
        };
    }
}
async function executeZap(protocol, walletData, amountUsdc, userId) {
    console.log(`🔍 executeZap called with protocol: "${protocol}", userId: ${userId}`);
    // Check if user has Smart Wallet for gasless transactions (require userId for gasless)
    const hasSmartWallet = userId ? (0, coinbase_wallet_1.hasCoinbaseSmartWallet)(userId) : false;
    console.log(`🔍 User ${userId} hasSmartWallet: ${hasSmartWallet}`);
    if (hasSmartWallet) {
        console.log(`🦑 Using gasless transactions for ${protocol} deployment`);
        // Route to gasless functions
        let result;
        const protocolLower = protocol.toLowerCase();
        console.log(`🔍 Routing gasless transaction for protocol: "${protocolLower}"`);
        switch (protocolLower) {
            case "aave":
                result = await (0, coinbase_defi_1.gaslessDeployToAave)(userId, amountUsdc);
                break;
            case "fluid":
                result = await (0, coinbase_defi_1.gaslessDeployToFluid)(userId, amountUsdc);
                break;
            case "compound":
                result = await (0, coinbase_defi_1.autoDeployToCompoundV3)(userId, amountUsdc);
                break;
            case "morpho":
                result = await (0, morpho_defi_1.deployToMorphoPYTH)(userId, amountUsdc);
                break;
            case "spark":
                const { deployToSpark } = await Promise.resolve().then(() => __importStar(require("../services/spark-defi")));
                result = await deployToSpark(userId, amountUsdc);
                break;
            case "seamless":
                const { deployToSeamless } = await Promise.resolve().then(() => __importStar(require("../services/seamless-defi")));
                result = await deployToSeamless(userId, amountUsdc);
                break;
            case "moonwell":
            case "moonwell usdc":
                const { deployToMoonwell } = await Promise.resolve().then(() => __importStar(require("../services/moonwell-defi")));
                result = await deployToMoonwell(userId, amountUsdc);
                break;
            case "morpho-re7":
            case "re7 universal usdc":
            case "re7":
                const { deployToMorphoRe7 } = await Promise.resolve().then(() => __importStar(require("../services/morpho-re7-defi")));
                result = await deployToMorphoRe7(userId, amountUsdc);
                break;
            default:
                throw new Error(`Unsupported protocol for gasless: ${protocolLower}`);
        }
        if (!result.success) {
            throw new Error(result.error || `Gasless ${protocol} deployment failed`);
        }
        // Return a compatible TransactionReceipt format
        return {
            transactionHash: result.txHash,
            status: "success"
        };
    }
    else {
        console.log(`📤 Using regular transactions for ${protocol} deployment (no Smart Wallet)`);
        // Fall back to regular functions for users without Smart Wallet
        switch (protocol.toLowerCase()) {
            case "aave":
                return await supplyToAave(walletData, amountUsdc);
            case "fluid":
                return await supplyToFluid(walletData, amountUsdc);
            case "compound":
                return await supplyToCompound(walletData, amountUsdc);
            case "morpho":
                throw new Error(`Morpho requires a Coinbase Smart Wallet for gasless transactions. Please create a Smart Wallet using /wallet.`);
            default:
                throw new Error(`Unsupported protocol: ${protocol}`);
        }
    }
}
