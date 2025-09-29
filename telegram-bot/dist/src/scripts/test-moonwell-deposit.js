#!/usr/bin/env ts-node
"use strict";
/**
 * Moonwell USDC Vault Deposit Testing Script
 *
 * Tests gasless USDC deposits to Moonwell USDC vault using Smart Wallet
 * Following proven Morpho/Spark/Seamless pattern
 *
 * Usage:
 *   npm run test:moonwell -- --key 0xYOUR_PRIVATE_KEY --amount 0.1
 *   ts-node src/scripts/test-moonwell-deposit.ts --key 0xYOUR_PRIVATE_KEY --amount 0.1
 *
 * Options:
 *   --key       Private key of test wallet (required)
 *   --amount    USDC amount to deposit (default: 0.1)
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_util_1 = require("node:util");
const moonwell_defi_1 = require("../services/moonwell-defi");
const test_helpers_1 = require("../utils/test-helpers");
async function main() {
    console.log('🌕 Moonwell USDC Vault Deposit Test');
    console.log('===================================\n');
    const { values } = (0, node_util_1.parseArgs)({
        args: process.argv.slice(2),
        options: {
            key: { type: 'string', short: 'k' },
            amount: { type: 'string', short: 'a', default: '0.1' },
            verbose: { type: 'boolean', short: 'v', default: false },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });
    if (values.help) {
        console.log('Usage: npm run test:moonwell -- --key YOUR_PRIVATE_KEY [--amount 0.1] [--verbose]');
        process.exit(0);
    }
    if (!values.key) {
        console.error('❌ Private key required. Use --key YOUR_PRIVATE_KEY');
        process.exit(1);
    }
    const amount = values.amount;
    const verbose = values.verbose;
    try {
        // Create test Smart Wallet
        console.log(`🔐 Creating Smart Wallet for testing...`);
        const smartWallet = await (0, test_helpers_1.createTestSmartWallet)(values.key);
        console.log(`✅ Smart Wallet: ${smartWallet.address}\n`);
        // Check USDC balance
        console.log(`💰 Checking USDC balance...`);
        const usdcBalance = await (0, test_helpers_1.checkUSDCBalance)(smartWallet.address);
        console.log(`💵 USDC Balance: ${usdcBalance.formatted} USDC\n`);
        if (parseFloat(usdcBalance.formatted) < parseFloat(amount)) {
            console.error(`❌ Insufficient USDC. Need ${amount}, have ${usdcBalance.formatted}`);
            process.exit(1);
        }
        // Check current Moonwell balance
        console.log('📊 Checking current Moonwell position...');
        const beforeBalance = await (0, moonwell_defi_1.getMoonwellBalance)(smartWallet.address);
        console.log(`📈 Current Moonwell shares: ${beforeBalance.sharesFormatted}\n`);
        // Execute deposit
        console.log(`🚀 Depositing ${amount} USDC to Moonwell USDC vault...`);
        const startTime = Date.now();
        const result = await (0, moonwell_defi_1.deployToMoonwell)('test-user', amount, smartWallet);
        const executionTime = Date.now() - startTime;
        if (result.success) {
            console.log('✅ Deposit successful!');
            console.log(`📋 Transaction: ${result.txHash}`);
            console.log(`🎯 Shares received: ${result.shares}`);
            console.log(`⏱️  Execution time: ${executionTime}ms`);
            console.log(`⛽ Gas cost: $0.00 (Sponsored by CDP)\n`);
            // Check final balance
            console.log('📊 Checking final Moonwell position...');
            const afterBalance = await (0, moonwell_defi_1.getMoonwellBalance)(smartWallet.address);
            console.log(`📈 New Moonwell shares: ${afterBalance.sharesFormatted}`);
            const sharesDiff = afterBalance.shares - beforeBalance.shares;
            console.log(`📊 Shares gained: ${(Number(sharesDiff) / 1e18).toFixed(6)} Moonwell USDC\n`);
            console.log('🎉 Moonwell deposit test PASSED!');
        }
        else {
            console.error('❌ Deposit failed!');
            console.error(`📋 Error: ${result.error}\n`);
            console.log('🔴 Moonwell deposit test FAILED!');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('❌ Test execution failed:', error);
        console.log('🔴 Moonwell deposit test FAILED!');
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
