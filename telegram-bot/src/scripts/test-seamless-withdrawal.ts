import { parseArgs } from 'node:util';
import { createTestAccount, printTestResults, TestResult } from './test-helpers';
import { withdrawFromSeamless, getSeamlessBalance } from '../services/seamless-defi';

/**
 * Test script for Seamless USDC vault withdrawals
 * 
 * This script tests the Seamless withdrawal functionality using the proven
 * Morpho/Spark pattern that has shown 100% success rate.
 * 
 * Usage:
 *   npm run test:seamless-withdraw -- --key YOUR_PRIVATE_KEY --shares 0.1
 *   npm run test:seamless-withdraw -- --key YOUR_PRIVATE_KEY --shares max
 *   ts-node src/scripts/test-seamless-withdrawal.ts --key YOUR_PRIVATE_KEY --shares 0.1
 * 
 * Requirements:
 * - Private key with SMUSDC shares in Seamless vault
 * - CDP Paymaster whitelisting for gasless transactions
 * - Valid Seamless vault address
 */

async function testSeamlessWithdrawal() {
  console.log('🧪 Testing Seamless USDC Vault Withdrawal');
  console.log('========================================\n');

  // Parse command line arguments
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      key: { type: 'string', short: 'k' },
      shares: { type: 'string', short: 's' },
      verbose: { type: 'boolean', short: 'v', default: false }
    }
  });

  if (!values.key || !values.shares) {
    console.error('❌ Missing required arguments');
    console.error('Usage: npm run test:seamless-withdraw -- --key YOUR_PRIVATE_KEY --shares 0.1');
    console.error('       npm run test:seamless-withdraw -- --key YOUR_PRIVATE_KEY --shares max');
    process.exit(1);
  }

  const testResults: TestResult[] = [];
  const startTime = Date.now();

  try {
    // Step 1: Create test account from private key
    console.log('🔑 Creating test Smart Wallet account...');
    const testAccount = await createTestAccount(values.key as string);
    console.log(`✅ Smart Wallet created: ${testAccount.address}\n`);

    // Step 2: Check current Seamless balance
    console.log('💰 Checking current Seamless vault balance...');
    const balance = await getSeamlessBalance(testAccount.address);
    
    console.log(`📊 Current SMUSDC Position:`);
    console.log(`   - Shares: ${balance.sharesFormatted} SMUSDC`);
    console.log(`   - Assets: ${balance.assetsFormatted} USDC`);
    console.log(`   - Raw Shares: ${balance.shares}`);
    console.log(`   - Raw Assets: ${balance.assets}\n`);

    if (balance.shares === 0n) {
      console.error('❌ No SMUSDC shares found in wallet');
      console.error('   Please deposit to Seamless vault first or use a different wallet');
      process.exit(1);
    }

    // Step 3: Test Seamless withdrawal
    console.log(`🔄 Testing withdrawal of ${values.shares} SMUSDC shares from Seamless vault...`);
    const withdrawalResult = await withdrawFromSeamless(
      'test-user-seamless',
      values.shares as string,
      testAccount
    );

    if (withdrawalResult.success) {
      testResults.push({
        success: true,
        startTime,
        endTime: Date.now()
      });

      console.log('✅ Seamless withdrawal test PASSED!');
      console.log(`📝 Transaction Hash: ${withdrawalResult.txHash}`);
      console.log(`💰 USDC Assets Received: ${withdrawalResult.assets}`);
      console.log(`🔗 View on BaseScan: https://basescan.org/tx/${withdrawalResult.txHash}\n`);

      // Show final balance after withdrawal
      const finalBalance = await getSeamlessBalance(testAccount.address);
      console.log('📊 Final Seamless Position:');
      console.log(`   - Remaining Shares: ${finalBalance.sharesFormatted} SMUSDC`);
      console.log(`   - Remaining Assets: ${finalBalance.assetsFormatted} USDC\n`);

      // Optional: Show detailed logs
      if (values.verbose) {
        console.log('📊 Detailed Results:');
        console.log(`   - Smart Wallet: ${testAccount.address}`);
        console.log(`   - Shares Withdrawn: ${values.shares}`);
        console.log(`   - Assets Received: ${withdrawalResult.assets}`);
        console.log(`   - Transaction: ${withdrawalResult.txHash}`);
        console.log(`   - Gas Cost: $0 (gasless via CDP Paymaster)`);
        console.log(`   - Exchange Rate: ~${(Number(withdrawalResult.assets) / (values.shares === 'max' ? Number(balance.shares) / 1e18 : Number(values.shares))).toFixed(6)} USDC per SMUSDC\n`);
      }

    } else {
      testResults.push({
        success: false,
        startTime,
        endTime: Date.now()
      });

      console.error('❌ Seamless withdrawal test FAILED!');
      console.error(`💀 Error: ${withdrawalResult.error}\n`);
    }

  } catch (error: any) {
    testResults.push({
      success: false,
      startTime,
      endTime: Date.now()
    });

    console.error('❌ Test execution failed:', error.message);
  }

  // Print final test results
  printTestResults('Seamless USDC Withdrawal Test', testResults);

  // Exit with proper code
  const allPassed = testResults.every(result => result.success);
  process.exit(allPassed ? 0 : 1);
}

// Execute the test
if (require.main === module) {
  testSeamlessWithdrawal().catch((error) => {
    console.error('💀 Fatal error during testing:', error);
    process.exit(1);
  });
}