#!/usr/bin/env ts-node
"use strict";
/**
 * Seamless USDC Vault Withdrawal Testing Script
 * Simple withdrawal test following existing pattern
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_util_1 = require("node:util");
const test_helpers_1 = require("../utils/test-helpers");
const seamless_defi_1 = require("../services/seamless-defi");
async function main() {
    console.log('🌊 Seamless USDC Vault Withdrawal Test');
    console.log('======================================\n');
    const { values } = (0, node_util_1.parseArgs)({
        args: process.argv.slice(2),
        options: {
            key: { type: 'string', short: 'k' },
            shares: { type: 'string', short: 's', default: '0.1' }
        }
    });
    if (!values.key) {
        console.error('❌ Private key required. Use --key YOUR_PRIVATE_KEY');
        process.exit(1);
    }
    try {
        console.log('🔐 Creating Smart Wallet...');
        const smartWallet = await (0, test_helpers_1.createTestSmartWallet)(values.key);
        console.log(`✅ Smart Wallet: ${smartWallet.address}\n`);
        console.log(`🔄 Withdrawing ${values.shares} SMUSDC shares...`);
        const result = await (0, seamless_defi_1.withdrawFromSeamless)('test-user', values.shares, smartWallet);
        if (result.success) {
            console.log('✅ Withdrawal successful!');
            console.log(`📋 Transaction: ${result.txHash}`);
            console.log('🎉 Seamless withdrawal test PASSED!');
        }
        else {
            console.error(`❌ Withdrawal failed: ${result.error}`);
            process.exit(1);
        }
    }
    catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
