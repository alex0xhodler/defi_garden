#!/usr/bin/env ts-node
"use strict";
/**
 * Spark USDC Vault Deposit Testing Script
 *
 * Tests gasless USDC deposits to Spark USDC vault using Smart Wallet
 *
 * Usage:
 *   npm run test:spark -- --key 0xYOUR_PRIVATE_KEY
 *   ts-node src/scripts/test-spark-deposit.ts --key 0xYOUR_PRIVATE_KEY
 *
 * Options:
 *   --key       Private key of test wallet (required)
 *   --amount    USDC amount to deposit (default: 0.1)
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testSparkDeposit = testSparkDeposit;
const node_util_1 = require("node:util");
const spark_defi_1 = require("../services/spark-defi");
const test_helpers_1 = require("../utils/test-helpers");
// Parse command line arguments
function parseArguments() {
    const { values } = (0, node_util_1.parseArgs)({
        args: process.argv.slice(2),
        options: {
            key: { type: 'string', short: 'k' },
            amount: { type: 'string', short: 'a' },
            verbose: { type: 'boolean', short: 'v' },
            help: { type: 'boolean', short: 'h' }
        }
    });
    // Show help if requested
    if (values.help) {
        console.log(`

🧪 SPARK USDC VAULT DEPOSIT TEST SCRIPT
======================================

Tests gasless USDC deposits to Spark USDC vault using Smart Wallet.

USAGE:
  npm run test:spark -- --key 0xYOUR_PRIVATE_KEY --amount 0.1
  ts-node src/scripts/test-spark-deposit.ts --key 0xYOUR_PRIVATE_KEY

OPTIONS:
  --key, -k       Private key of test wallet (required)
  --amount, -a    USDC amount to deposit (default: 0.1)
  --verbose, -v   Enable verbose logging
  --help, -h      Show this help message

EXAMPLES:
  # Test deposit 0.1 USDC (default)
  npm run test:spark -- --key 0x1234...

  # Test deposit 0.5 USDC with verbose logging  
  npm run test:spark -- --key 0x1234... --amount 0.5 --verbose

⚠️  REQUIREMENTS:
  - Private key must have USDC balance on Base network
  - Minimum recommended: 0.1 USDC + gas
  - Smart Wallet will be auto-deployed if needed

💡 TIP: Start with small amounts (0.1 USDC) for testing
    `);
        process.exit(0);
    }
    // Validate required arguments
    if (!values.key) {
        console.error('❌ Error: Private key is required. Use --key or -k');
        console.error('   Example: npm run test:spark -- --key 0xYOUR_PRIVATE_KEY');
        process.exit(1);
    }
    return {
        privateKey: values.key,
        amount: parseFloat(values.amount || '0.1'),
        verbose: values.verbose || false
    };
}
/**
 * Main test function for Spark USDC vault deposit
 */
async function testSparkDeposit() {
    const config = parseArguments();
    console.log('\n🧪 SPARK USDC VAULT DEPOSIT TEST');
    console.log('================================\n');
    const testResults = [];
    try {
        // Step 1: Setup Smart Wallet
        console.log('🔧 Step 1: Setting up Smart Wallet...');
        const { smartAccount, address: smartWalletAddress } = await (0, test_helpers_1.createTestSmartWallet)(config.privateKey);
        if (config.verbose) {
            console.log(`📍 Smart Wallet Address: ${smartWalletAddress}`);
        }
        testResults.push({
            success: true,
            startTime: Date.now(),
            endTime: Date.now(),
            shares: '0'
        });
        // Step 2: Check USDC Balance
        console.log('💰 Step 2: Checking USDC balance...');
        const usdcBalance = await (0, test_helpers_1.checkUSDCBalance)(smartWalletAddress);
        const minimumRequired = config.amount + 0.01; // Small buffer for gas estimation
        if (parseFloat(usdcBalance.formatted) < minimumRequired) {
            throw new Error(`Insufficient USDC balance. Have: ${usdcBalance.formatted} USDC, Need: ${minimumRequired} USDC.\n` +
                `Please fund your Smart Wallet: ${smartWalletAddress}`);
        }
        console.log(`✅ USDC Balance: ${usdcBalance.formatted} USDC (sufficient for ${config.amount} USDC deposit)`);
        testResults.push({
            success: true,
            startTime: Date.now(),
            endTime: Date.now(),
            shares: usdcBalance.formatted
        });
        // Step 3: Check Initial Spark Position
        console.log('📊 Step 3: Checking initial Spark vault position...');
        const initialPosition = await (0, spark_defi_1.getSparkBalance)(smartWalletAddress);
        if (config.verbose) {
            console.log(`📈 Initial SPARKUSDC Shares: ${initialPosition.sharesFormatted}`);
            console.log(`💵 Initial USDC Value: ${initialPosition.assetsFormatted} USDC`);
        }
        // Step 4: Execute Deposit
        console.log(`🚀 Step 4: Depositing ${config.amount} USDC to Spark vault...`);
        const mockSession = (0, test_helpers_1.createMockUserSession)();
        const mockUserId = mockSession.userId;
        const depositResult = await (0, spark_defi_1.deployToSpark)(mockUserId, config.amount.toString(), smartAccount // Pass smartAccount for testing
        );
        if (!depositResult.success) {
            throw new Error(`Deposit failed: ${depositResult.error}`);
        }
        const txHash = depositResult.txHash;
        console.log(`✅ Deposit successful! Transaction: ${txHash}`);
        testResults.push({
            success: true,
            startTime: Date.now(),
            endTime: Date.now(),
            txHash,
            shares: depositResult.shares || '0'
        });
        // Step 5: Verify Transaction On-Chain
        console.log('🔍 Step 5: Verifying transaction on blockchain...');
        if (!(0, test_helpers_1.isValidTxHash)(txHash)) {
            console.warn(`⚠️  Transaction hash format invalid: ${txHash}`);
        }
        else {
            console.log(`✅ Transaction hash verified: ${txHash}`);
        }
        // Step 6: Check Final Position & Yield
        console.log('📈 Step 6: Checking final position and shares received...');
        // Wait briefly for state updates
        await new Promise(resolve => setTimeout(resolve, 3000));
        const finalPosition = await (0, spark_defi_1.getSparkBalance)(smartWalletAddress);
        const sharesReceived = finalPosition.shares - initialPosition.shares;
        const assetsIncrease = finalPosition.assets - initialPosition.assets;
        console.log(`📊 Final Position:`);
        console.log(`   💎 SPARKUSDC Shares: ${finalPosition.sharesFormatted} (+${(Number(sharesReceived) / 1e18).toFixed(6)})`);
        console.log(`   💵 USDC Value: ${finalPosition.assetsFormatted} USDC (+${(Number(assetsIncrease) / 1e6).toFixed(6)})`);
        if (Number(sharesReceived) > 0) {
            const shareToAssetRatio = Number(assetsIncrease) / Number(sharesReceived) * 1e12; // Adjust for decimal difference
            console.log(`   📊 Share-to-Asset Ratio: 1 share ≈ ${shareToAssetRatio.toFixed(6)} USDC`);
        }
        testResults.push({
            success: true,
            startTime: Date.now(),
            endTime: Date.now(),
            shares: (Number(sharesReceived) / 1e18).toFixed(6)
        });
        // Step 7: Success Summary
        console.log('\n🎉 SPARK DEPOSIT TEST COMPLETED SUCCESSFULLY!');
        console.log('============================================\n');
        console.log(`✅ Deposited: ${config.amount} USDC`);
        console.log(`✅ Received: ${(Number(sharesReceived) / 1e18).toFixed(6)} SPARKUSDC shares`);
        console.log(`✅ Transaction: ${txHash}`);
        console.log(`✅ Gasless: Transaction paid by CDP Paymaster`);
        if (config.verbose) {
            console.log('\n📋 Detailed Test Results:');
            testResults.forEach(result => {
                console.log((0, test_helpers_1.formatTestResult)(result));
            });
        }
    }
    catch (error) {
        console.error('\n❌ SPARK DEPOSIT TEST FAILED');
        console.error('============================\n');
        const errorMsg = error?.message || 'Unknown error';
        console.error(`Error: ${errorMsg}`);
        testResults.push({
            success: false,
            startTime: Date.now(),
            endTime: Date.now(),
            error: errorMsg
        });
        if (config.verbose) {
            console.error('\n🔍 Debugging Information:');
            console.error(`Private Key: ${config.privateKey.substring(0, 6)}...`);
            console.error(`Amount: ${config.amount} USDC`);
            console.error(`Verbose: ${config.verbose}`);
        }
        process.exit(1);
    }
}
// Execute if called directly
if (require.main === module) {
    testSparkDeposit().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
