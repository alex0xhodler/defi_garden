#!/usr/bin/env ts-node
"use strict";
/**
 * Seamless USDC Vault Deposit Testing Script
 * Simple deposit test following existing pattern
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_util_1 = require("node:util");
const test_helpers_1 = require("../utils/test-helpers");
const seamless_defi_1 = require("../services/seamless-defi");
async function main() {
    console.log('🌊 Seamless USDC Vault Deposit Test');
    console.log('===================================\n');
    const { values } = (0, node_util_1.parseArgs)({
        args: process.argv.slice(2),
        options: {
            key: { type: 'string', short: 'k' },
            amount: { type: 'string', short: 'a', default: '0.1' }
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
        console.log(`🚀 Depositing ${values.amount} USDC to Seamless vault...`);
        const result = await (0, seamless_defi_1.deployToSeamless)('test-user', values.amount, smartWallet);
        if (result.success) {
            console.log('✅ Deposit successful!');
            console.log(`📋 Transaction: ${result.txHash}`);
            console.log('🎉 Seamless deposit test PASSED!');
        }
        else {
            console.error(`❌ Deposit failed: ${result.error}`);
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
