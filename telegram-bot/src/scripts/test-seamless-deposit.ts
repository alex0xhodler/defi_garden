import { parseArgs } from 'node:util';
import { createTestSmartWallet, checkUSDCBalance } from '../utils/test-helpers';
import { deployToSeamless, getSeamlessBalance } from '../services/seamless-defi';

/**
 * Test script for Seamless USDC vault deposits
 * 
 * This script tests the Seamless deposit functionality using the proven
 * Morpho/Spark pattern that has shown 100% success rate.
 * 
 * Usage:
 *   npm run test:seamless -- --key YOUR_PRIVATE_KEY --amount 0.1
 *   ts-node src/scripts/test-seamless-deposit.ts --key YOUR_PRIVATE_KEY --amount 0.1
 * 
 * Requirements:
 * - Private key with USDC balance on Base network
 * - CDP Paymaster whitelisting for gasless transactions
 * - Valid Seamless vault address
 */

async function testSeamlessDeposit() {
  console.log('🧪 Testing Seamless USDC Vault Deposit');
  console.log('=====================================\n');

  // Parse command line arguments
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      key: { type: 'string', short: 'k' },
      amount: { type: 'string', short: 'a' },
      verbose: { type: 'boolean', short: 'v', default: false }
    }
  });

  if (!values.key || !values.amount) {
    console.error('❌ Missing required arguments');
    console.error('Usage: npm run test:seamless -- --key YOUR_PRIVATE_KEY --amount 0.1');
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    // Step 1: Create test account from private key
    console.log('🔑 Creating test Smart Wallet account...');
    const testAccount = await createTestSmartWallet(values.key as string);
    console.log(`✅ Smart Wallet created: ${testAccount.address}\n`);

    // Step 2: Test Seamless deposit
    console.log(`💰 Testing deposit of ${values.amount} USDC to Seamless vault...`);
    const depositResult = await deployToSeamless(
      'test-user-seamless',
      values.amount as string,
      testAccount
    );

    if (depositResult.success) {
      testResults.push({
        success: true,
        startTime,
        endTime: Date.now()
      });

      console.log('✅ Seamless deposit test PASSED!');
      console.log(`📝 Transaction Hash: ${depositResult.txHash}`);
      console.log(`💎 SMUSDC Shares Received: ${depositResult.shares}`);
      console.log(`🔗 View on BaseScan: https://basescan.org/tx/${depositResult.txHash}\n`);

      // Optional: Show detailed logs
      if (values.verbose) {
        console.log('📊 Detailed Results:');
        console.log(`   - Smart Wallet: ${testAccount.address}`);
        console.log(`   - USDC Amount: ${values.amount}`);
        console.log(`   - Shares Received: ${depositResult.shares}`);
        console.log(`   - Transaction: ${depositResult.txHash}`);
        console.log(`   - Gas Cost: $0 (gasless via CDP Paymaster)\n`);
      }

    } else {
      testResults.push({
        success: false,
        startTime,
        endTime: Date.now()
      });

      console.error('❌ Seamless deposit test FAILED!');
      console.error(`💀 Error: ${depositResult.error}\n`);
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
  printTestResults('Seamless USDC Deposit Test', testResults);

  // Exit with proper code
  const allPassed = testResults.every(result => result.success);
  process.exit(allPassed ? 0 : 1);
}

// Execute the test
if (require.main === module) {
  testSeamlessDeposit().catch((error) => {
    console.error('💀 Fatal error during testing:', error);
    process.exit(1);
  });
}