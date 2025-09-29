"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployToSeamless = deployToSeamless;
exports.withdrawFromSeamless = withdrawFromSeamless;
exports.getSeamlessBalance = getSeamlessBalance;
exports.getSeamlessAPY = getSeamlessAPY;
exports.getSeamlessVaultInfo = getSeamlessVaultInfo;
const viem_1 = require("viem");
const coinbase_wallet_1 = require("../lib/coinbase-wallet");
// Seamless USDC vault token addresses on Base
const SEAMLESS_TOKENS = {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
// Seamless USDC vault contract addresses on Base (using same infrastructure as Morpho/Spark)
const SEAMLESS_CONTRACTS = {
    GENERAL_ADAPTER: "0xb98c948cfa24072e58935bc004a8a7b376ae746a",
    SEAMLESS_USDC_VAULT: "0x616a4e1db48e22028f6bbf20444cd3b8e3273738", // SMUSDC vault address
    MORPHO_BLUE: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb",
    BUNDLER: "0x6bfd8137e702540e7a42b74178a4a49ba43920c4"
};
// Standard ERC20 ABI for balance checks
const simpleERC20Abi = [
    {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function"
    }
];
/**
 * Deposit USDC to Seamless USDC vault with sponsored gas
 *
 * Based on proven Morpho/Spark pattern - Direct ERC4626 deposit via multicall
 * Uses the same transaction pattern as proven successful deposits
 *
 * @param userId User identifier
 * @param usdcAmount Amount to deposit (in USDC, e.g., "1.0")
 * @param testSmartAccount Optional smart account for testing
 * @returns Promise with success status, transaction hash, and shares received
 */
async function deployToSeamless(userId, usdcAmount, testSmartAccount // Optional parameter for testing
) {
    try {
        console.log(`🚀 Deploying ${usdcAmount} USDC to Seamless USDC vault for user ${userId}`);
        let smartAccount;
        if (testSmartAccount) {
            // Use provided smart account for testing
            smartAccount = testSmartAccount;
        }
        else {
            // Get user's Coinbase Smart Wallet from database
            const wallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
            if (!wallet) {
                throw new Error('No Coinbase Smart Wallet found for user');
            }
            smartAccount = wallet.smartAccount;
        }
        // Convert USDC amount to proper units (6 decimals)
        const amountWei = (0, viem_1.parseUnits)(usdcAmount, 6);
        // Check current USDC balance
        const usdcBalance = await coinbase_wallet_1.publicClient.readContract({
            address: SEAMLESS_TOKENS.USDC,
            abi: simpleERC20Abi,
            functionName: 'balanceOf',
            args: [smartAccount.address]
        });
        if (usdcBalance < amountWei) {
            throw new Error(`Insufficient USDC balance. Have: ${usdcBalance}, Need: ${amountWei}`);
        }
        // Create sponsored bundler client for gasless transactions
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        // Using EXACT same pattern as working Morpho PYTH/USDC and Spark implementation
        // Only difference: vault address (Seamless vs Morpho PYTH vs Spark)
        // USDC approve for Seamless vault direct deposit (same as Morpho/Spark pattern)
        const approveCalldata = '0x095ea7b3' +
            SEAMLESS_CONTRACTS.SEAMLESS_USDC_VAULT.slice(2).padStart(64, '0') + // spender (Seamless vault)
            amountWei.toString(16).padStart(64, '0'); // amount (32 bytes)
        // Direct deposit to Seamless vault (ERC4626 standard - same as Morpho/Spark)
        const directDepositCalldata = '0x6e553f65' + // deposit(uint256,address) 
            amountWei.toString(16).padStart(64, '0') + // assets (32 bytes)
            smartAccount.address.slice(2).padStart(64, '0'); // receiver (32 bytes)
        const operations = [
            // Step 1: Approve Seamless vault to spend USDC
            {
                to: SEAMLESS_TOKENS.USDC,
                value: '0',
                data: approveCalldata,
                skipRevert: false
            },
            // Step 2: Direct deposit to Seamless vault (ERC4626)
            {
                to: SEAMLESS_CONTRACTS.SEAMLESS_USDC_VAULT,
                value: '0',
                data: directDepositCalldata,
                skipRevert: false
            }
        ];
        console.log('📝 Executing Seamless USDC vault deposit via sponsored transaction...');
        // Execute the sponsored transaction with multicall
        const txHash = await bundlerClient.sendUserOperation({
            account: smartAccount,
            calls: operations.map(op => ({
                to: op.to,
                value: BigInt(op.value),
                data: op.data
            }))
        });
        console.log(`✅ Seamless deposit UserOperation sent: ${txHash}`);
        // Wait for transaction confirmation
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: txHash
        });
        if (receipt.success) {
            // Get the shares received (approximation - should parse from logs for accuracy)
            let sharesReceived = amountWei; // Approximation for ERC4626 vaults
            const actualTxHash = receipt.receipt.transactionHash;
            console.log(`✅ Seamless deposit successful! Blockchain TX: ${actualTxHash}`);
            console.log(`✅ SMUSDC shares received: ${sharesReceived}`);
            return {
                success: true,
                txHash: actualTxHash,
                shares: sharesReceived.toString()
            };
        }
        else {
            throw new Error('Transaction failed during execution');
        }
    }
    catch (error) {
        console.error('❌ Seamless deposit failed:', error);
        return {
            success: false,
            error: error.message || 'Unknown error during Seamless deposit'
        };
    }
}
/**
 * Withdraw USDC from Seamless vault using direct ERC4626 redeem
 *
 * Based on proven withdrawal pattern from Morpho/Spark success
 * Uses direct ERC4626 redeem pattern
 *
 * @param userId User identifier
 * @param sharesAmount Amount of shares to redeem
 * @param testSmartAccount Optional smart account for testing
 * @returns Promise with success status, transaction hash, and assets received
 */
async function withdrawFromSeamless(userId, sharesAmount, testSmartAccount // Optional parameter for testing
) {
    try {
        console.log(`🔄 Withdrawing ${sharesAmount} SMUSDC shares from Seamless vault for user ${userId}`);
        let smartAccount;
        if (testSmartAccount) {
            // Use provided smart account for testing
            smartAccount = testSmartAccount;
        }
        else {
            // Get user's Coinbase Smart Wallet from database
            const wallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
            if (!wallet) {
                throw new Error('No Coinbase Smart Wallet found for user');
            }
            smartAccount = wallet.smartAccount;
        }
        // Handle max withdrawal or convert shares amount to proper units
        let sharesWei;
        // Check current share balance first
        const shareBalance = await coinbase_wallet_1.publicClient.readContract({
            address: SEAMLESS_CONTRACTS.SEAMLESS_USDC_VAULT,
            abi: simpleERC20Abi,
            functionName: 'balanceOf',
            args: [smartAccount.address]
        });
        if (sharesAmount === 'max') {
            // Use exact balance for max exit to avoid precision issues
            sharesWei = shareBalance;
            console.log(`📤 MAX EXIT: Using exact balance ${sharesWei} wei (${(Number(sharesWei) / 1e18).toFixed(6)} SMUSDC)`);
        }
        else {
            // Convert shares amount to proper units (18 decimals for SMUSDC shares)
            sharesWei = (0, viem_1.parseUnits)(sharesAmount, 18);
            if (shareBalance < sharesWei) {
                throw new Error(`Insufficient SMUSDC share balance. Have: ${shareBalance}, Need: ${sharesWei}`);
            }
        }
        if (sharesWei === 0n) {
            throw new Error('No SMUSDC shares to withdraw');
        }
        // Create sponsored bundler client for gasless transactions
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        // Using direct vault redeem (ERC4626 standard) - same as successful Morpho/Spark pattern
        // The working deposit used direct vault interaction, so withdrawal should too
        console.log(`🔍 Debug info:`);
        console.log(`   Vault: ${SEAMLESS_CONTRACTS.SEAMLESS_USDC_VAULT}`);
        console.log(`   Shares to redeem: ${sharesWei}`);
        console.log(`   Smart Account: ${smartAccount.address}`);
        console.log(`   Share balance: ${shareBalance}`);
        const directRedeemCalldata = '0xba087652' + // redeem(uint256,address,address) - ERC4626 standard
            sharesWei.toString(16).padStart(64, '0') + // shares amount
            smartAccount.address.slice(2).padStart(64, '0') + // receiver 
            smartAccount.address.slice(2).padStart(64, '0'); // owner
        console.log(`   Redeem calldata: ${directRedeemCalldata}`);
        const operations = [
            // Direct redeem from Seamless vault (ERC4626)
            {
                to: SEAMLESS_CONTRACTS.SEAMLESS_USDC_VAULT,
                value: '0',
                data: directRedeemCalldata,
                skipRevert: false
            }
        ];
        console.log('📝 Executing Seamless withdrawal via sponsored transaction...');
        // Execute the sponsored transaction
        const txHash = await bundlerClient.sendUserOperation({
            account: smartAccount,
            calls: operations.map(op => ({
                to: op.to,
                value: BigInt(op.value),
                data: op.data
            }))
        });
        console.log(`✅ Seamless withdrawal UserOperation sent: ${txHash}`);
        // Wait for transaction confirmation
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: txHash
        });
        if (receipt.success) {
            // Get the assets received (approximate - should parse from logs for accuracy)
            let assetsReceived = sharesWei / BigInt(1e12); // Convert from 18 to 6 decimals
            const actualTxHash = receipt.receipt.transactionHash;
            console.log(`✅ Seamless withdrawal successful! Blockchain TX: ${actualTxHash}`);
            console.log(`✅ USDC assets received: ${assetsReceived}`);
            return {
                success: true,
                txHash: actualTxHash,
                assets: assetsReceived.toString()
            };
        }
        else {
            throw new Error('Transaction failed during execution');
        }
    }
    catch (error) {
        console.error('❌ Seamless withdrawal failed:', error);
        return {
            success: false,
            error: error.message || 'Unknown error during Seamless withdrawal'
        };
    }
}
/**
 * Get user's Seamless vault position (shares and equivalent USDC value)
 *
 * @param userAddress User's wallet address
 * @returns Object with shares, assets, and formatted values
 */
async function getSeamlessBalance(userAddress) {
    try {
        // Get user's SMUSDC share balance
        const shares = await coinbase_wallet_1.publicClient.readContract({
            address: SEAMLESS_CONTRACTS.SEAMLESS_USDC_VAULT,
            abi: simpleERC20Abi,
            functionName: 'balanceOf',
            args: [userAddress]
        });
        // Convert shares to assets using proper decimals
        // SMUSDC shares are 18 decimals, USDC is 6 decimals
        const assets = shares / BigInt(1e12); // Convert from 18 decimals to 6 decimals
        return {
            shares,
            assets,
            sharesFormatted: (Number(shares) / 1e18).toFixed(6), // 18 decimals for SMUSDC
            assetsFormatted: (Number(assets) / 1e6).toFixed(6) // 6 decimals for USDC
        };
    }
    catch (error) {
        console.error('Error getting Seamless balance:', error);
        return {
            shares: 0n,
            assets: 0n,
            sharesFormatted: '0',
            assetsFormatted: '0'
        };
    }
}
/**
 * Get current APY for Seamless USDC vault from DeFiLlama
 *
 * @returns Current APY as a percentage
 */
async function getSeamlessAPY() {
    try {
        // Fetch from DeFiLlama API using the pool ID
        const poolId = '4a22de3c-271e-4152-b8d8-29053de06f37';
        const response = await fetch(`https://yields.llama.fi/pools/${poolId}`);
        if (!response.ok) {
            console.warn('Failed to fetch Seamless APY from DeFiLlama');
            return 0.0; // Default APY
        }
        const data = await response.json();
        return data.apy || 0.0;
    }
    catch (error) {
        console.error('Error getting Seamless APY:', error);
        return 0;
    }
}
/**
 * Get Seamless vault total assets and TVL for display
 *
 * @returns Object with total assets and formatted TVL
 */
async function getSeamlessVaultInfo() {
    try {
        // Fetch TVL from DeFiLlama API
        const poolId = '4a22de3c-271e-4152-b8d8-29053de06f37';
        const response = await fetch(`https://yields.llama.fi/pools/${poolId}`);
        let totalAssets = 0n;
        let tvlFormatted = '$0M';
        if (response.ok) {
            const data = await response.json();
            const tvlUsd = data.tvlUsd || 0;
            totalAssets = BigInt(Math.floor(tvlUsd * 1e6)); // Convert to USDC units
            tvlFormatted = `$${(tvlUsd / 1e6).toFixed(1)}M`;
        }
        return {
            totalAssets,
            tvlFormatted
        };
    }
    catch (error) {
        console.error('Error getting Seamless vault info:', error);
        return {
            totalAssets: 0n,
            tvlFormatted: '$0M'
        };
    }
}
