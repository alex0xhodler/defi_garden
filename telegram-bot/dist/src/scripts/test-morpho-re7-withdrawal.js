#!/usr/bin/env ts-node
"use strict";
/**
 * Morpho Re7 Universal USDC Vault Withdrawal Testing Script
 *
 * Tests gasless USDC withdrawals from Re7 Universal USDC vault using Smart Wallet
 * Following proven Morpho/Spark/Seamless pattern
 *
 * Usage:
 *   npm run test:morpho-re7-withdraw -- --key 0xYOUR_PRIVATE_KEY --shares 0.1
 *   npm run test:morpho-re7-withdraw -- --key 0xYOUR_PRIVATE_KEY --shares max
 *   ts-node src/scripts/test-morpho-re7-withdrawal.ts --key 0xYOUR_PRIVATE_KEY --shares 0.1
 *
 * Options:
 *   --key       Private key of test wallet (required)
 *   --shares    Shares amount to withdraw or "max" for all (default: 0.1)
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_util_1 = require("node:util");
const morpho_re7_defi_1 = require("../services/morpho-re7-defi");
const test_helpers_1 = require("../utils/test-helpers");
async function main() {
    console.log('♾️  Morpho Re7 Universal USDC Vault Withdrawal Test');
    console.log('================================================\n');
    const { values } = (0, node_util_1.parseArgs)({
        args: process.argv.slice(2),
        options: {
            key: { type: 'string', short: 'k' },
            shares: { type: 'string', short: 's', default: '0.1' },
            verbose: { type: 'boolean', short: 'v', default: false },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });
    if (values.help) {
        console.log('Usage: npm run test:morpho-re7-withdraw -- --key YOUR_PRIVATE_KEY [--shares 0.1|max] [--verbose]');
        process.exit(0);
    }
    if (!values.key) {
        console.error('❌ Private key required. Use --key YOUR_PRIVATE_KEY');
        process.exit(1);
    }
    const shares = values.shares;
    const verbose = values.verbose;
    try {
        // Create test Smart Wallet
        console.log(`🔐 Creating Smart Wallet for testing...`);
        const smartWallet = await (0, test_helpers_1.createTestSmartWallet)(values.key);
        console.log(`✅ Smart Wallet: ${smartWallet.address}\n`);
        // Check current Morpho Re7 balance
        console.log('📊 Checking current Morpho Re7 position...');
        const beforeBalance = await (0, morpho_re7_defi_1.getMorphoRe7Balance)(smartWallet.address);
        console.log(`📈 Current Re7 Universal USDC shares: ${beforeBalance.sharesFormatted}`);
        console.log(`💵 USDC equivalent: ~${beforeBalance.assetsFormatted} USDC\n`);
        if (beforeBalance.shares === 0n) {
            console.log('⚠️  No Re7 Universal USDC shares found. Please deposit first using:');
            console.log('   npm run test:morpho-re7 -- --key YOUR_PRIVATE_KEY --amount 0.1\n');
            process.exit(1);
        }
        // Check initial USDC balance
        console.log(`💰 Checking USDC balance before withdrawal...`);
        const beforeUSDC = await (0, test_helpers_1.checkUSDCBalance)(smartWallet.address);
        console.log(`💵 USDC Balance: ${beforeUSDC.formatted} USDC\n`);
        // Execute withdrawal
        console.log(`🔄 Withdrawing ${shares} Re7 Universal USDC shares...`);
        const startTime = Date.now();
        const result = await (0, morpho_re7_defi_1.withdrawFromMorphoRe7)('test-user', shares, smartWallet);
        const executionTime = Date.now() - startTime;
        if (result.success) {
            console.log('✅ Withdrawal successful!');
            console.log(`📋 Transaction: ${result.txHash}`);
            console.log(`💰 USDC received: ${result.assets}`);
            console.log(`⏱️  Execution time: ${executionTime}ms`);
            console.log(`⛽ Gas cost: $0.00 (Sponsored by CDP)\n`);
            // Check final balances
            console.log('📊 Checking final positions...');
            const afterBalance = await (0, morpho_re7_defi_1.getMorphoRe7Balance)(smartWallet.address);
            const afterUSDC = await (0, test_helpers_1.checkUSDCBalance)(smartWallet.address);
            console.log(`📈 Remaining Re7 Universal USDC shares: ${afterBalance.sharesFormatted}`);
            console.log(`💵 Final USDC Balance: ${afterUSDC.formatted} USDC`);
            const sharesDiff = beforeBalance.shares - afterBalance.shares;
            const usdcDiff = parseFloat(afterUSDC.formatted) - parseFloat(beforeUSDC.formatted);
            console.log(`📊 Shares redeemed: ${(Number(sharesDiff) / 1e18).toFixed(6)} Re7 Universal USDC`);
            console.log(`📊 USDC received: +${usdcDiff.toFixed(6)} USDC\n`);
            console.log('🎉 Morpho Re7 withdrawal test PASSED!');
        }
        else {
            console.error('❌ Withdrawal failed!');
            console.error(`📋 Error: ${result.error}\n`);
            console.log('🔴 Morpho Re7 withdrawal test FAILED!');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('❌ Test execution failed:', error);
        console.log('🔴 Morpho Re7 withdrawal test FAILED!');
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
