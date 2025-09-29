#!/usr/bin/env ts-node
"use strict";
/**
 * Spark USDC Vault Full Cycle Test
 *
 * Tests complete lifecycle: Deposit → Partial Exit (50%) → Full Exit (remaining)
 *
 * Usage:
 *   npm run test:spark-cycle -- --key 0xYOUR_PRIVATE_KEY
 *   ts-node src/scripts/test-spark-full-cycle.ts --key 0xYOUR_PRIVATE_KEY
 *
 * Options:
 *   --key       Private key of test wallet (required)
 *   --amount    USDC amount to deposit (default: 0.1)
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testSparkFullCycle = testSparkFullCycle;
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

🧪 SPARK USDC VAULT FULL CYCLE TEST
==================================

Tests complete lifecycle: Deposit → Partial Exit (50%) → Full Exit (remaining)

USAGE:
  npm run test:spark-cycle -- --key 0xYOUR_PRIVATE_KEY --amount 0.1
  ts-node src/scripts/test-spark-full-cycle.ts --key 0xYOUR_PRIVATE_KEY

OPTIONS:
  --key, -k       Private key of test wallet (required)
  --amount, -a    USDC amount to deposit (default: 0.1)
  --verbose, -v   Enable verbose logging
  --help, -h      Show this help message

EXAMPLES:
  # Test full cycle with 0.1 USDC (default)
  npm run test:spark-cycle -- --key 0x1234...

  # Test full cycle with 0.2 USDC and verbose logging  
  npm run test:spark-cycle -- --key 0x1234... --amount 0.2 --verbose

⚠️  REQUIREMENTS:
  - Private key must have USDC balance on Base network
  - Minimum recommended: 0.1 USDC + gas buffer
  - Tests real transactions on Base mainnet

💡 FLOW: Deposit → 50% Partial Exit → 100% Full Exit
    `);
        process.exit(0);
    }
    // Validate required arguments
    if (!values.key) {
        console.error('❌ Error: Private key is required. Use --key or -k');
        console.error('   Example: npm run test:spark-cycle -- --key 0xYOUR_PRIVATE_KEY');
        process.exit(1);
    }
    return {
        privateKey: values.key,
        amount: parseFloat(values.amount || '0.1'),
        verbose: values.verbose || false
    };
}
/**
 * Main test function for complete Spark USDC vault cycle
 */
async function testSparkFullCycle() {
    const config = parseArguments();
    console.log('\n🧪 SPARK USDC VAULT FULL CYCLE TEST');
    console.log('==================================');
    console.log('Flow: Deposit → Partial Exit (50%) → Full Exit (remaining)\n');
    const testResults = [];
    let txHashes = [];
    try {
        // Step 1: Setup Smart Wallet
        console.log('🔧 Step 1: Setting up Smart Wallet...');
        const { smartAccount, address: smartWalletAddress } = await (0, test_helpers_1.createTestSmartWallet)(config.privateKey);
        if (config.verbose) {
            console.log(`📍 Smart Wallet Address: ${smartWalletAddress}`);
        }
        // Step 2: Check Initial USDC Balance
        console.log('💰 Step 2: Checking initial USDC balance...');
        const initialUsdcBalance = await (0, test_helpers_1.checkUSDCBalance)(smartWalletAddress);
        const minimumRequired = config.amount + 0.01; // Small buffer
        if (parseFloat(initialUsdcBalance.formatted) < minimumRequired) {
            throw new Error(`Insufficient USDC balance. Have: ${initialUsdcBalance.formatted} USDC, Need: ${minimumRequired} USDC.\n` +
                `Please fund your Smart Wallet: ${smartWalletAddress}`);
        }
        console.log(`✅ Initial USDC Balance: ${initialUsdcBalance.formatted} USDC`);
        // Step 3: Check Initial Spark Position
        console.log('📊 Step 3: Checking initial Spark vault position...');
        const initialSparkPosition = await (0, spark_defi_1.getSparkBalance)(smartWalletAddress);
        console.log(`📈 Initial SPARKUSDC Shares: ${initialSparkPosition.sharesFormatted}`);
        const mockSession = (0, test_helpers_1.createMockUserSession)();
        const mockUserId = mockSession.userId;
        // ======================
        // PHASE 1: DEPOSIT
        // ======================
        console.log(`\n🚀 PHASE 1: DEPOSITING ${config.amount} USDC TO SPARK VAULT`);
        console.log('========================================================');
        const depositResult = await (0, spark_defi_1.deployToSpark)(mockUserId, config.amount.toString(), smartAccount);
        if (!depositResult.success) {
            throw new Error(`Deposit failed: ${depositResult.error}`);
        }
        const depositTxHash = depositResult.txHash;
        txHashes.push(depositTxHash);
        console.log(`✅ Deposit successful! TX: ${depositTxHash}`);
        // Wait for settlement
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Check position after deposit
        const postDepositPosition = await (0, spark_defi_1.getSparkBalance)(smartWalletAddress);
        const sharesReceived = parseFloat(postDepositPosition.sharesFormatted) - parseFloat(initialSparkPosition.sharesFormatted);
        console.log(`📊 Post-Deposit Position:`);
        console.log(`   💎 SPARKUSDC Shares: ${postDepositPosition.sharesFormatted} (+${sharesReceived.toFixed(6)})`);
        console.log(`   💵 Est. USDC Value: ${postDepositPosition.assetsFormatted} USDC`);
        // ======================
        // PHASE 2: PARTIAL EXIT (50%)
        // ======================
        console.log(`\n🔄 PHASE 2: PARTIAL EXIT (50% OF POSITION)`);
        console.log('==========================================');
        const totalShares = parseFloat(postDepositPosition.sharesFormatted);
        const partialExitShares = totalShares * 0.5; // 50%
        console.log(`📤 Withdrawing 50%: ${partialExitShares.toFixed(6)} SPARKUSDC shares`);
        const partialExitResult = await (0, spark_defi_1.withdrawFromSpark)(mockUserId, partialExitShares.toString(), smartAccount);
        if (!partialExitResult.success) {
            throw new Error(`Partial exit failed: ${partialExitResult.error}`);
        }
        const partialExitTxHash = partialExitResult.txHash;
        txHashes.push(partialExitTxHash);
        console.log(`✅ Partial exit successful! TX: ${partialExitTxHash}`);
        // Wait for settlement
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Check position after partial exit
        const postPartialExitPosition = await (0, spark_defi_1.getSparkBalance)(smartWalletAddress);
        const postPartialExitUsdcBalance = await (0, test_helpers_1.checkUSDCBalance)(smartWalletAddress);
        console.log(`📊 Post-Partial Exit Position:`);
        console.log(`   💎 SPARKUSDC Shares: ${postPartialExitPosition.sharesFormatted} (remaining)`);
        console.log(`   💰 USDC Balance: ${postPartialExitUsdcBalance.formatted} USDC`);
        // ======================
        // PHASE 3: FULL EXIT (remaining 50%)
        // ======================
        console.log(`\n🔚 PHASE 3: FULL EXIT (REMAINING 50%)`);
        console.log('==================================');
        const remainingShares = parseFloat(postPartialExitPosition.sharesFormatted);
        if (remainingShares < 0.000001) {
            throw new Error('No remaining shares to exit! Partial exit may have been too aggressive.');
        }
        console.log(`📤 MAX EXIT: Withdrawing all remaining ${remainingShares.toFixed(6)} SPARKUSDC shares`);
        const fullExitResult = await (0, spark_defi_1.withdrawFromSpark)(mockUserId, remainingShares.toString(), smartAccount);
        if (!fullExitResult.success) {
            throw new Error(`Full exit failed: ${fullExitResult.error}`);
        }
        const fullExitTxHash = fullExitResult.txHash;
        txHashes.push(fullExitTxHash);
        console.log(`✅ Full exit successful! TX: ${fullExitTxHash}`);
        // Wait for settlement
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Check final positions
        const finalSparkPosition = await (0, spark_defi_1.getSparkBalance)(smartWalletAddress);
        const finalUsdcBalance = await (0, test_helpers_1.checkUSDCBalance)(smartWalletAddress);
        // ======================
        // FINAL RESULTS
        // ======================
        console.log(`\n📊 FINAL POSITION ANALYSIS`);
        console.log('==========================');
        const totalUsdcReceived = parseFloat(finalUsdcBalance.formatted) - parseFloat(initialUsdcBalance.formatted);
        const finalRemainingShares = parseFloat(finalSparkPosition.sharesFormatted);
        console.log(`💰 Total USDC Change: ${totalUsdcReceived >= 0 ? '+' : ''}${totalUsdcReceived.toFixed(6)} USDC`);
        console.log(`💎 Final SPARKUSDC Shares: ${finalSparkPosition.sharesFormatted}`);
        console.log(`🎯 Exit Status: ${finalRemainingShares < 0.000001 ? 'FULLY EXITED' : 'DUST REMAINING'}`);
        if (finalRemainingShares >= 0.000001) {
            console.log(`⚠️  Remaining dust: ${finalRemainingShares} SPARKUSDC shares`);
        }
        // Success Summary
        console.log('\n🎉 SPARK FULL CYCLE TEST COMPLETED SUCCESSFULLY!');
        console.log('================================================\n');
        console.log(`✅ Phase 1 - Deposit: ${config.amount} USDC → ${sharesReceived.toFixed(6)} SPARKUSDC shares`);
        console.log(`✅ Phase 2 - Partial Exit: 50% of position`);
        console.log(`✅ Phase 3 - Full Exit: Remaining position`);
        console.log(`✅ All Transactions: Gasless via CDP Paymaster`);
        console.log(`✅ Net Result: ${totalUsdcReceived >= 0 ? 'SUCCESS' : 'LOSS'} (${totalUsdcReceived.toFixed(6)} USDC)`);
        console.log('\n📋 Transaction History:');
        txHashes.forEach((hash, index) => {
            const phaseNames = ['Deposit', 'Partial Exit', 'Full Exit'];
            console.log(`   ${index + 1}. ${phaseNames[index]}: ${hash}`);
        });
    }
    catch (error) {
        console.error('\n❌ SPARK FULL CYCLE TEST FAILED');
        console.error('===============================\n');
        const errorMsg = error?.message || 'Unknown error';
        console.error(`Error: ${errorMsg}`);
        if (txHashes.length > 0) {
            console.error('\n📋 Completed Transactions:');
            txHashes.forEach((hash, index) => {
                const phaseNames = ['Deposit', 'Partial Exit', 'Full Exit'];
                console.error(`   ${index + 1}. ${phaseNames[index]}: ${hash}`);
            });
        }
        if (config.verbose) {
            console.error('\n🔍 Debug Info:');
            console.error(`Private Key: ${config.privateKey.substring(0, 6)}...`);
            console.error(`Amount: ${config.amount} USDC`);
            console.error(`Completed Phases: ${txHashes.length}/3`);
        }
        process.exit(1);
    }
}
// Execute if called directly
if (require.main === module) {
    testSparkFullCycle().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
