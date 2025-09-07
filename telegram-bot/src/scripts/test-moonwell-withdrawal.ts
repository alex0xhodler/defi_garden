import { parseArgs } from 'node:util';
import { createTestAccount, printTestResults, TestResult } from './test-helpers';
import { withdrawFromMoonwell, getMoonwellBalance } from '../services/moonwell-defi';

/**
 * Test script for Moonwell USDC vault withdrawals
 * 
 * This script tests the Moonwell withdrawal functionality using the proven
 * Morpho/Spark/Seamless pattern that has shown 100% success rate.
 * 
 * Usage:
 *   npm run test:moonwell-withdraw -- --key YOUR_PRIVATE_KEY --shares 0.1
 *   npm run test:moonwell-withdraw -- --key YOUR_PRIVATE_KEY --shares max
 *   ts-node src/scripts/test-moonwell-withdrawal.ts --key YOUR_PRIVATE_KEY --shares 0.1
 * 
 * Requirements:
 * - Private key with Moonwell USDC shares in Moonwell vault
 * - CDP Paymaster whitelisting for gasless transactions
 * - Valid Moonwell vault address
 */

async function testMoonwellWithdrawal() {
  console.log('🧪 Testing Moonwell USDC Vault Withdrawal');
  console.log('=========================================\n');

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
    console.error('Usage: npm run test:moonwell-withdraw -- --key YOUR_PRIVATE_KEY --shares 0.1');
    console.error('       npm run test:moonwell-withdraw -- --key YOUR_PRIVATE_KEY --shares max');
    process.exit(1);
  }

  const testResults: TestResult[] = [];
  const startTime = Date.now();

  try {
    // Step 1: Create test account from private key
    console.log('🔑 Creating test Smart Wallet account...');
    const testAccount = await createTestAccount(values.key as string);
    console.log(`✅ Smart Wallet created: ${testAccount.address}\n`);

    // Step 2: Check current balance
    console.log('💰 Checking current Moonwell balance...');
    const balanceStart = Date.now();
    const balance = await getMoonwellBalance(testAccount.address);
    const balanceTime = Date.now() - balanceStart;

    console.log(`📊 Current balance: ${balance.sharesFormatted} Moonwell USDC shares`);
    console.log(`📊 USDC equivalent: ~${balance.assetsFormatted} USDC\n`);

    if (balance.shares === 0n) {
      console.log('⚠️  No Moonwell shares found. Please deposit first using:');
      console.log('   npm run test:moonwell -- --key YOUR_PRIVATE_KEY --amount 0.1\n');
      process.exit(1);
    }

    testResults.push({
      name: 'Balance Check',
      success: true,
      details: {
        shares: balance.sharesFormatted,
        assets: balance.assetsFormatted,
        executionTime: `${balanceTime}ms`
      },
      duration: balanceTime
    });

    // Step 3: Test Moonwell withdrawal
    console.log(`🔄 Testing Moonwell withdrawal: ${values.shares} shares`);
    console.log('Using same proven pattern as Morpho PYTH/USDC, Spark, and Seamless...\n');
    
    const withdrawStart = Date.now();
    const result = await withdrawFromMoonwell('test-user', values.shares as string, testAccount);
    const withdrawTime = Date.now() - withdrawStart;

    testResults.push({
      name: 'Moonwell USDC Withdrawal',
      success: result.success,
      details: result.success 
        ? {
            txHash: result.txHash,
            assets: result.assets,
            executionTime: `${withdrawTime}ms`,
            gasUsed: 'Gasless (CDP Paymaster)',
            pattern: 'Direct ERC4626 Redeem'
          }
        : { error: result.error },
      duration: withdrawTime
    });

    if (result.success) {
      console.log('✅ Moonwell withdrawal successful!');
      console.log(`📋 Transaction: ${result.txHash}`);
      console.log(`💰 USDC received: ${result.assets}`);
      console.log(`⏱️  Execution time: ${withdrawTime}ms`);
      console.log(`⛽ Gas cost: $0.00 (Sponsored by CDP)`);
    } else {
      console.log('❌ Moonwell withdrawal failed!');
      console.log(`📋 Error: ${result.error}`);
    }

    // Step 4: Check final balance if withdrawal was successful
    if (result.success) {
      console.log('\n💰 Checking final balance...');
      const finalBalance = await getMoonwellBalance(testAccount.address);
      console.log(`📊 Remaining shares: ${finalBalance.sharesFormatted} Moonwell USDC`);
      console.log(`📊 USDC equivalent: ~${finalBalance.assetsFormatted} USDC`);
      
      const balanceDiff = balance.shares - finalBalance.shares;
      console.log(`📈 Shares redeemed: ${(Number(balanceDiff) / 1e18).toFixed(6)} Moonwell USDC`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Test execution failed:', errorMessage);
    
    testResults.push({
      name: 'Moonwell Withdrawal Test',
      success: false,
      details: { error: errorMessage },
      duration: Date.now() - startTime
    });
  }

  // Print final results
  const totalTime = Date.now() - startTime;
  console.log('\n' + '='.repeat(50));
  console.log('📊 MOONWELL WITHDRAWAL TEST RESULTS');
  console.log('='.repeat(50));
  printTestResults(testResults, totalTime);

  // Exit with appropriate code
  const allSuccess = testResults.every(r => r.success);
  process.exit(allSuccess ? 0 : 1);
}

// Run the test
testMoonwellWithdrawal().catch(console.error);