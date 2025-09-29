"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployToMoonwell = deployToMoonwell;
exports.withdrawFromMoonwell = withdrawFromMoonwell;
exports.getMoonwellBalance = getMoonwellBalance;
exports.getMoonwellAPY = getMoonwellAPY;
exports.getMoonwellVaultInfo = getMoonwellVaultInfo;
const viem_1 = require("viem");
const coinbase_wallet_1 = require("../lib/coinbase-wallet");
// Moonwell USDC vault token addresses on Base
const MOONWELL_TOKENS = {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
// Moonwell USDC vault contract addresses on Base (using same infrastructure as Morpho/Spark/Seamless)
const MOONWELL_CONTRACTS = {
    GENERAL_ADAPTER: "0xb98c948cfa24072e58935bc004a8a7b376ae746a",
    MOONWELL_USDC_VAULT: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca", // Moonwell USDC vault address
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
 * Deposit USDC to Moonwell USDC vault with sponsored gas
 *
 * Based on proven Morpho/Spark/Seamless pattern - Direct ERC4626 deposit via multicall
 * Uses the same transaction pattern as proven successful deposits
 *
 * @param userId User identifier
 * @param usdcAmount Amount to deposit (in USDC, e.g., "1.0")
 * @param testSmartAccount Optional smart account for testing
 * @returns Promise with success status, transaction hash, and shares received
 */
async function deployToMoonwell(userId, usdcAmount, testSmartAccount // Optional parameter for testing
) {
    try {
        console.log(`🚀 Deploying ${usdcAmount} USDC to Moonwell USDC vault for user ${userId}`);
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
            address: MOONWELL_TOKENS.USDC,
            abi: simpleERC20Abi,
            functionName: 'balanceOf',
            args: [smartAccount.address]
        });
        if (usdcBalance < amountWei) {
            throw new Error(`Insufficient USDC balance. Have: ${usdcBalance}, Need: ${amountWei}`);
        }
        // Create sponsored bundler client for gasless transactions
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        // Using EXACT same pattern as working Morpho PYTH/USDC, Spark, and Seamless implementation
        // Only difference: vault address (Moonwell vs Morpho PYTH vs Spark vs Seamless)
        // USDC approve for Moonwell vault direct deposit (same as Morpho/Spark/Seamless pattern)
        const approveCalldata = '0x095ea7b3' +
            MOONWELL_CONTRACTS.MOONWELL_USDC_VAULT.slice(2).padStart(64, '0') + // spender (Moonwell vault)
            amountWei.toString(16).padStart(64, '0'); // amount (32 bytes)
        // Direct deposit to Moonwell vault (ERC4626 standard - same as Morpho/Spark/Seamless)
        const directDepositCalldata = '0x6e553f65' + // deposit(uint256,address) 
            amountWei.toString(16).padStart(64, '0') + // assets (32 bytes)
            smartAccount.address.slice(2).padStart(64, '0'); // receiver (32 bytes)
        const operations = [
            // Step 1: Approve Moonwell vault to spend USDC
            {
                to: MOONWELL_TOKENS.USDC,
                value: '0',
                data: approveCalldata,
                skipRevert: false
            },
            // Step 2: Direct deposit to Moonwell vault (ERC4626)
            {
                to: MOONWELL_CONTRACTS.MOONWELL_USDC_VAULT,
                value: '0',
                data: directDepositCalldata,
                skipRevert: false
            }
        ];
        console.log('📝 Executing Moonwell USDC vault deposit via sponsored transaction...');
        // Execute the sponsored transaction with multicall
        const txHash = await bundlerClient.sendUserOperation({
            account: smartAccount,
            calls: operations.map(op => ({
                to: op.to,
                value: BigInt(op.value),
                data: op.data
            }))
        });
        console.log(`✅ Moonwell deposit UserOperation sent: ${txHash}`);
        // Wait for transaction confirmation
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: txHash
        });
        if (receipt.success) {
            // Get the shares received (approximation - should parse from logs for accuracy)
            let sharesReceived = amountWei; // Approximation for ERC4626 vaults
            const actualTxHash = receipt.receipt.transactionHash;
            console.log(`✅ Moonwell deposit successful! Blockchain TX: ${actualTxHash}`);
            console.log(`✅ Moonwell USDC shares received: ${sharesReceived}`);
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
        console.error('❌ Moonwell deposit failed:', error);
        return {
            success: false,
            error: error.message || 'Unknown error during Moonwell deposit'
        };
    }
}
/**
 * Withdraw USDC from Moonwell vault using direct ERC4626 redeem
 *
 * Based on proven withdrawal pattern from Morpho/Spark/Seamless success
 * Uses direct ERC4626 redeem pattern
 *
 * @param userId User identifier
 * @param sharesAmount Amount of shares to redeem
 * @param testSmartAccount Optional smart account for testing
 * @returns Promise with success status, transaction hash, and assets received
 */
async function withdrawFromMoonwell(userId, sharesAmount, testSmartAccount // Optional parameter for testing
) {
    try {
        console.log(`🔄 Withdrawing ${sharesAmount} Moonwell USDC shares from Moonwell vault for user ${userId}`);
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
            address: MOONWELL_CONTRACTS.MOONWELL_USDC_VAULT,
            abi: simpleERC20Abi,
            functionName: 'balanceOf',
            args: [smartAccount.address]
        });
        if (sharesAmount === 'max') {
            // Use exact balance for max exit to avoid precision issues
            sharesWei = shareBalance;
            console.log(`📤 MAX EXIT: Using exact balance ${sharesWei} wei (${(Number(sharesWei) / 1e18).toFixed(6)} Moonwell USDC)`);
        }
        else {
            // Convert shares amount to proper units (18 decimals for Moonwell USDC shares)
            sharesWei = (0, viem_1.parseUnits)(sharesAmount, 18);
            if (shareBalance < sharesWei) {
                throw new Error(`Insufficient Moonwell USDC share balance. Have: ${shareBalance}, Need: ${sharesWei}`);
            }
        }
        if (sharesWei === 0n) {
            throw new Error('No Moonwell USDC shares to withdraw');
        }
        // Create sponsored bundler client for gasless transactions
        const bundlerClient = await (0, coinbase_wallet_1.createSponsoredBundlerClient)(smartAccount);
        // Using direct vault redeem (ERC4626 standard) - same as successful Morpho/Spark/Seamless pattern
        // The working deposit used direct vault interaction, so withdrawal should too
        console.log(`🔍 Debug info:`);
        console.log(`   Vault: ${MOONWELL_CONTRACTS.MOONWELL_USDC_VAULT}`);
        console.log(`   Shares to redeem: ${sharesWei}`);
        console.log(`   Smart Account: ${smartAccount.address}`);
        console.log(`   Share balance: ${shareBalance}`);
        const directRedeemCalldata = '0xba087652' + // redeem(uint256,address,address) - ERC4626 standard
            sharesWei.toString(16).padStart(64, '0') + // shares amount
            smartAccount.address.slice(2).padStart(64, '0') + // receiver 
            smartAccount.address.slice(2).padStart(64, '0'); // owner
        console.log(`   Redeem calldata: ${directRedeemCalldata}`);
        const operations = [
            // Direct redeem from Moonwell vault (ERC4626)
            {
                to: MOONWELL_CONTRACTS.MOONWELL_USDC_VAULT,
                value: '0',
                data: directRedeemCalldata,
                skipRevert: false
            }
        ];
        console.log('📝 Executing Moonwell withdrawal via sponsored transaction...');
        // Execute the sponsored transaction
        const txHash = await bundlerClient.sendUserOperation({
            account: smartAccount,
            calls: operations.map(op => ({
                to: op.to,
                value: BigInt(op.value),
                data: op.data
            }))
        });
        console.log(`✅ Moonwell withdrawal UserOperation sent: ${txHash}`);
        // Wait for transaction confirmation
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: txHash
        });
        if (receipt.success) {
            // Get the assets received (approximate - should parse from logs for accuracy)
            let assetsReceived = sharesWei / BigInt(1e12); // Convert from 18 to 6 decimals
            const actualTxHash = receipt.receipt.transactionHash;
            console.log(`✅ Moonwell withdrawal successful! Blockchain TX: ${actualTxHash}`);
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
        console.error('❌ Moonwell withdrawal failed:', error);
        return {
            success: false,
            error: error.message || 'Unknown error during Moonwell withdrawal'
        };
    }
}
/**
 * Get user's Moonwell vault position (shares and equivalent USDC value)
 *
 * @param userAddress User's wallet address
 * @returns Object with shares, assets, and formatted values
 */
async function getMoonwellBalance(userAddress) {
    try {
        // Get user's Moonwell USDC share balance
        const shares = await coinbase_wallet_1.publicClient.readContract({
            address: MOONWELL_CONTRACTS.MOONWELL_USDC_VAULT,
            abi: simpleERC20Abi,
            functionName: 'balanceOf',
            args: [userAddress]
        });
        // Convert shares to assets using proper decimals
        // Moonwell USDC shares are 18 decimals, USDC is 6 decimals
        const assets = shares / BigInt(1e12); // Convert from 18 decimals to 6 decimals
        return {
            shares,
            assets,
            sharesFormatted: (Number(shares) / 1e18).toFixed(6), // 18 decimals for Moonwell USDC
            assetsFormatted: (Number(assets) / 1e6).toFixed(6) // 6 decimals for USDC
        };
    }
    catch (error) {
        console.error('Error getting Moonwell balance:', error);
        return {
            shares: 0n,
            assets: 0n,
            sharesFormatted: '0',
            assetsFormatted: '0'
        };
    }
}
/**
 * Get current APY for Moonwell USDC vault from DeFiLlama
 *
 * @returns Current APY as a percentage
 */
async function getMoonwellAPY() {
    try {
        // Fetch from DeFiLlama API using the pool ID
        const poolId = '1643c124-f047-4fc5-9642-d6fa91875184';
        const response = await fetch(`https://yields.llama.fi/pools/${poolId}`);
        if (!response.ok) {
            console.warn('Failed to fetch Moonwell APY from DeFiLlama');
            return 5.0; // Default APY
        }
        const data = await response.json();
        return data.apy || 5.0;
    }
    catch (error) {
        console.error('Error getting Moonwell APY:', error);
        return 5.0;
    }
}
/**
 * Get Moonwell vault total assets and TVL for display
 *
 * @returns Object with total assets and formatted TVL
 */
async function getMoonwellVaultInfo() {
    try {
        // Fetch TVL from DeFiLlama API
        const poolId = '1643c124-f047-4fc5-9642-d6fa91875184';
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
        console.error('Error getting Moonwell vault info:', error);
        return {
            totalAssets: 0n,
            tvlFormatted: '$0M'
        };
    }
}
