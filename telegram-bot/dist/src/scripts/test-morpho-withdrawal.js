#!/usr/bin/env ts-node
"use strict";
/**
 * Morpho PYTH/USDC Withdrawal Testing Script
 *
 * Tests gasless share redemption from Morpho PYTH/USDC vault using Smart Wallet
 * Based on successful transaction: 0x5ca632844fdd976062b1913adeb7197788220acbe8f9718b50c82a1fcfc24e13
 *
 * Usage:
 *   npm run test:morpho-withdraw -- --key 0xYOUR_PRIVATE_KEY
 *   ts-node src/scripts/test-morpho-withdrawal.ts --key 0xYOUR_PRIVATE_KEY
 *
 * Options:
 *   --key       Private key of test wallet (required)
 *   --shares    Share amount to withdraw (default: 0.5)
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_util_1 = require("node:util");
const morpho_defi_1 = require("../services/morpho-defi");
const test_helpers_1 = require("../utils/test-helpers");
// Parse command line arguments
function parseArguments() {
    const { values } = (0, node_util_1.parseArgs)({
        args: process.argv.slice(2),
        options: {
            key: { type: 'string', short: 'k' },
            shares: { type: 'string', short: 's' },
            verbose: { type: 'boolean', short: 'v' },
            help: { type: 'boolean', short: 'h' }
        }
    });
    // Show help if requested
    if (values.help) {
        console.log(`

🧪 MORPHO WITHDRAWAL TEST SCRIPT
================================

Tests gasless share redemption from Morpho PYTH/USDC vault using Smart Wallet.

Usage:
  npm run test:morpho-withdraw -- --key 0xYOUR_PRIVATE_KEY [options]

Required:
  --key, -k     Private key of test wallet (0x + 64 hex chars)

Options:
  --shares, -s  Share amount to withdraw (default: 0.1)
  --verbose, -v Enable verbose logging
  --help, -h    Show this help message

Examples:
  npm run test:morpho-withdraw -- --key 0x1234567890abcdef...
  npm run test:morpho-withdraw -- --key 0x1234... --shares 1.0 --verbose

⚠️  WARNING: Only use dedicated test wallets, never production wallets!
    `);
        process.exit(0);
    }
    // Validate required arguments
    if (!values.key) {
        console.error('❌ Error: Private key is required. Use --key 0xYOUR_PRIVATE_KEY');
        console.error('   Use --help for usage information');
        process.exit(1);
    }
    // Validate private key format
    const privateKey = values.key;
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
        console.error('❌ Error: Invalid private key format. Expected 0x followed by 64 hex characters');
        process.exit(1);
    }
    const shares = values.shares ? parseFloat(values.shares) : 0.1;
    if (isNaN(shares) || shares <= 0 || shares > 100) {
        console.error('❌ Error: Invalid share amount. Must be a positive number ≤ 100 shares');
        process.exit(1);
    }
    return {
        privateKey,
        shares,
        verbose: values.verbose || false
    };
}
// Display test banner
function showTestBanner(config, smartWalletAddress, morphoBalance, usdcBalance) {
    console.log(`

🧪 MORPHO WITHDRAWAL TEST
=========================
🦑 Smart Wallet: ${smartWalletAddress}
📊 Morpho Shares: ${morphoBalance.sharesFormatted}
💰 Asset Value: ${morphoBalance.assetsFormatted} USDC
💸 USDC Balance: ${usdcBalance} USDC
🔄 Withdrawing: ${config.shares} shares
🎯 From: Morpho PYTH/USDC Vault (~10% APY)
⛽ Transaction: Gasless (Sponsored)

Starting withdrawal test...
  `);
}
// Main test function
async function testMorphoWithdrawal(config) {
    const result = {
        success: false,
        startTime: Date.now()
    };
    try {
        console.log('🧪 MORPHO WITHDRAWAL TEST STARTING...\n');
        // Step 1: Create Smart Wallet from private key
        console.log('[1/6] Creating Smart Wallet from private key...');
        const wallet = await (0, test_helpers_1.createTestSmartWallet)(config.privateKey);
        if (config.verbose) {
            console.log(`    Owner: ${wallet.owner.address}`);
            console.log(`    Smart Wallet: ${wallet.smartAccount.address}`);
        }
        // Step 2: Check current Morpho balance
        console.log('[2/6] Checking Morpho vault balance...');
        const morphoBalance = await (0, morpho_defi_1.getMorphoBalance)(wallet.address);
        if (Number(morphoBalance.sharesFormatted) < config.shares) {
            throw new Error(`Insufficient Morpho shares. Have: ${morphoBalance.sharesFormatted}, Need: ${config.shares}`);
        }
        // Step 3: Check current USDC balance (before withdrawal)
        console.log('[3/6] Checking USDC balance (before withdrawal)...');
        const beforeBalance = await (0, test_helpers_1.checkUSDCBalance)(wallet.address);
        // Display test banner
        showTestBanner(config, wallet.address, morphoBalance, beforeBalance.formatted);
        // Step 4: Execute gasless withdrawal from Morpho
        console.log('[4/6] Executing gasless withdrawal from Morpho PYTH/USDC...');
        // Create mock user session for the service
        const mockSession = (0, test_helpers_1.createMockUserSession)('test-user');
        const withdrawResult = await (0, morpho_defi_1.withdrawFromMorphoPYTH)('test-user', config.shares.toString(), wallet.smartAccount);
        if (!withdrawResult.success) {
            throw new Error(withdrawResult.error || 'Withdrawal failed with unknown error');
        }
        result.txHash = withdrawResult.txHash;
        result.shares = withdrawResult.assets; // Assets received
        if (config.verbose) {
            console.log(`    TX Hash: ${result.txHash}`);
            console.log(`    Assets: ${result.shares}`);
        }
        // Step 5: Verify transaction on blockchain
        console.log('[5/6] Verifying transaction on blockchain...');
        if (result.txHash) {
            const txVerification = await (0, test_helpers_1.verifyTransaction)(result.txHash);
            if (!txVerification.success) {
                throw new Error('Transaction verification failed - transaction reverted');
            }
            result.gasUsed = txVerification.gasUsed;
        }
        // Step 6: Check balances after withdrawal
        console.log('[6/6] Checking balances after withdrawal...');
        const afterBalance = await (0, test_helpers_1.checkUSDCBalance)(wallet.address);
        const afterMorphoBalance = await (0, morpho_defi_1.getMorphoBalance)(wallet.address);
        const usdcIncrease = Number(afterBalance.formatted) - Number(beforeBalance.formatted);
        const shareDecrease = Number(morphoBalance.sharesFormatted) - Number(afterMorphoBalance.sharesFormatted);
        console.log(`✅ USDC increase: +${usdcIncrease.toFixed(6)} USDC`);
        console.log(`✅ Shares decrease: -${shareDecrease.toFixed(6)} shares`);
        console.log(`✅ Remaining shares: ${afterMorphoBalance.sharesFormatted}`);
        if (usdcIncrease <= 0) {
            throw new Error('No USDC received from withdrawal');
        }
        // Test completed successfully
        result.success = true;
        result.endTime = Date.now();
        return result;
    }
    catch (error) {
        result.error = (0, test_helpers_1.safeErrorLog)(error, 'Morpho withdrawal test');
        result.endTime = Date.now();
        return result;
    }
}
// Main execution
async function main() {
    try {
        const config = parseArguments();
        console.log('⚠️  WARNING: This script uses real blockchain transactions!');
        console.log('   Only use dedicated test wallets, never production wallets!\n');
        const result = await testMorphoWithdrawal(config);
        // Display test results
        console.log('\n' + '='.repeat(50));
        console.log('📊 WITHDRAWAL TEST RESULTS');
        console.log('='.repeat(50));
        console.log((0, test_helpers_1.formatTestResult)(result));
        if (result.success) {
            console.log('🎉 Morpho withdrawal test PASSED!');
            console.log('   Withdrawal functionality working correctly.\n');
            process.exit(0);
        }
        else {
            console.log('💥 Morpho withdrawal test FAILED!');
            console.log('   Fix errors before production deployment.\n');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('\n❌ TEST SCRIPT ERROR:', error.message);
        process.exit(1);
    }
}
// Handle script termination gracefully
process.on('SIGINT', () => {
    console.log('\n\n🛑 Test interrupted by user');
    process.exit(1);
});
process.on('SIGTERM', () => {
    console.log('\n\n🛑 Test terminated');
    process.exit(1);
});
// Run the test
if (require.main === module) {
    main().catch((error) => {
        console.error('💥 Unexpected error:', error);
        process.exit(1);
    });
}
