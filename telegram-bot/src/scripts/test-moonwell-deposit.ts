import { parseArgs } from 'node:util';
import { createTestAccount, printTestResults, TestResult } from './test-helpers';
import { deployToMoonwell } from '../services/moonwell-defi';

/**
 * Test script for Moonwell USDC vault deposits
 * 
 * This script tests the Moonwell deposit functionality using the proven
 * Morpho/Spark/Seamless pattern that has shown 100% success rate.
 * 
 * Usage:
 *   npm run test:moonwell -- --key YOUR_PRIVATE_KEY --amount 0.1
 *   ts-node src/scripts/test-moonwell-deposit.ts --key YOUR_PRIVATE_KEY --amount 0.1
 * 
 * Requirements:
 * - Private key with USDC balance on Base network
 * - CDP Paymaster whitelisting for gasless transactions
 * - Valid Moonwell vault address
 */

async function testMoonwellDeposit() {
  console.log('🧪 Testing Moonwell USDC Vault Deposit');
  console.log('======================================\n');

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
    console.error('Usage: npm run test:moonwell -- --key YOUR_PRIVATE_KEY --amount 0.1');
    process.exit(1);
  }

  const testResults: TestResult[] = [];
  const startTime = Date.now();

  try {
    // Step 1: Create test account from private key
    console.log('🔑 Creating test Smart Wallet account...');
    const testAccount = await createTestAccount(values.key as string);
    console.log(`✅ Smart Wallet created: ${testAccount.address}\n`);

    // Step 2: Test Moonwell deposit
    console.log(`🚀 Testing Moonwell deposit: ${values.amount} USDC`);
    console.log('Using same proven pattern as Morpho PYTH/USDC, Spark, and Seamless...\n');
    
    const depositStart = Date.now();
    const result = await deployToMoonwell('test-user', values.amount as string, testAccount);
    const depositTime = Date.now() - depositStart;

    testResults.push({
      name: 'Moonwell USDC Deposit',
      success: result.success,
      details: result.success 
        ? {
            txHash: result.txHash,
            shares: result.shares,
            executionTime: `${depositTime}ms`,
            gasUsed: 'Gasless (CDP Paymaster)',
            pattern: 'Direct ERC4626 Deposit'
          }
        : { error: result.error },
      duration: depositTime
    });

    if (result.success) {
      console.log('✅ Moonwell deposit successful!');
      console.log(`📋 Transaction: ${result.txHash}`);
      console.log(`🎯 Shares received: ${result.shares}`);
      console.log(`⏱️  Execution time: ${depositTime}ms`);
      console.log(`⛽ Gas cost: $0.00 (Sponsored by CDP)`);
    } else {
      console.log('❌ Moonwell deposit failed!');
      console.log(`📋 Error: ${result.error}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Test execution failed:', errorMessage);
    
    testResults.push({
      name: 'Moonwell Deposit Test',
      success: false,
      details: { error: errorMessage },
      duration: Date.now() - startTime
    });
  }

  // Print final results
  const totalTime = Date.now() - startTime;
  console.log('\n' + '='.repeat(50));
  console.log('📊 MOONWELL DEPOSIT TEST RESULTS');
  console.log('='.repeat(50));
  printTestResults(testResults, totalTime);

  // Exit with appropriate code
  const allSuccess = testResults.every(r => r.success);
  process.exit(allSuccess ? 0 : 1);
}

// Run the test
testMoonwellDeposit().catch(console.error);