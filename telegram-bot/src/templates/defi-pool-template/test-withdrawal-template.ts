#!/usr/bin/env ts-node

/**
 * [POOL_NAME] Withdrawal Testing Script Template
 * 
 * Tests gasless share redemption from [POOL_NAME] vault using Smart Wallet
 * 
 * Usage:
 *   npm run test:[pool-name]-withdraw -- --key 0xYOUR_PRIVATE_KEY
 *   ts-node src/scripts/test-[pool-name]-withdrawal.ts --key 0xYOUR_PRIVATE_KEY
 * 
 * Options:
 *   --key       Private key of test wallet (required)
 *   --shares    Share amount to withdraw (default: 0.1)
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 * 
 * TODO: Update all [POOL_NAME] and [pool-name] placeholders
 */

import { parseArgs } from 'node:util';
// TODO: Update import to match your service file
import { withdrawFrom[POOL_NAME], get[POOL_NAME]Balance } from '../services/[pool-name]-defi';
import { 
  createTestSmartWallet, 
  checkUSDCBalance, 
  createMockUserSession,
  formatTestResult,
  verifyTransaction,
  safeErrorLog,
  TestResult
} from '../utils/test-helpers';

// Test configuration
interface TestConfig {
  privateKey: string;
  shares: number;
  verbose: boolean;
}

// Parse command line arguments
function parseArguments(): TestConfig {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      key: { type: 'string', short: 'k' },
      shares: { type: 'string', short: 's' },
      verbose: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' }
    }
  });

  // Show help if requested
  if (values.help) {
    console.log(`

🧪 [POOL_NAME] WITHDRAWAL TEST SCRIPT
=====================================

Tests gasless share redemption from [POOL_NAME] vault using Smart Wallet.

Usage:
  npm run test:[pool-name]-withdraw -- --key 0xYOUR_PRIVATE_KEY [options]

Required:
  --key, -k     Private key of test wallet (0x + 64 hex chars)

Options:
  --shares, -s  Share amount to withdraw (default: 0.1)
  --verbose, -v Enable verbose logging
  --help, -h    Show this help message

Examples:
  npm run test:[pool-name]-withdraw -- --key 0x1234567890abcdef...
  npm run test:[pool-name]-withdraw -- --key 0x1234... --shares 1.0 --verbose

⚠️  WARNING: Only use dedicated test wallets, never production wallets!
    `);
    process.exit(0);
  }

  // Validate required arguments
  if (!values.key) {
    console.error('❌ Error: Private key is required. Use --key 0xYOUR_PRIVATE_KEY');
    console.error('   Use --help for usage information');
    process.exit(1);
  }

  // Validate private key format
  const privateKey = values.key;
  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    console.error('❌ Error: Invalid private key format. Expected 0x followed by 64 hex characters');
    process.exit(1);
  }

  const shares = values.shares ? parseFloat(values.shares) : 0.1; // Default to small test amount
  if (isNaN(shares) || shares <= 0 || shares > 100) {
    console.error('❌ Error: Invalid share amount. Must be a positive number ≤ 100 shares');
    process.exit(1);
  }

  return {
    privateKey,
    shares,
    verbose: values.verbose || false
  };
}

// Display test banner
function showTestBanner(config: TestConfig, smartWalletAddress: string, poolBalance: any, usdcBalance: string) {
  console.log(`

🧪 [POOL_NAME] WITHDRAWAL TEST
==============================
🦑 Smart Wallet: ${smartWalletAddress}
📊 Pool Shares: ${poolBalance.sharesFormatted}
💰 Asset Value: ${poolBalance.assetsFormatted} USDC
💸 USDC Balance: ${usdcBalance} USDC
🔄 Withdrawing: ${config.shares} shares
🎯 From: [POOL_NAME] Vault
⛽ Transaction: Gasless (Sponsored)

Starting withdrawal test...
  `);
}

// Main test function
async function test[POOL_NAME]Withdrawal(config: TestConfig): Promise<TestResult> {
  const result: TestResult = {
    success: false,
    startTime: Date.now()
  };

  try {
    console.log('🧪 [POOL_NAME] WITHDRAWAL TEST STARTING...\\n');

    // Step 1: Create Smart Wallet from private key
    console.log('[1/6] Creating Smart Wallet from private key...');
    const wallet = await createTestSmartWallet(config.privateKey);
    
    if (config.verbose) {
      console.log(`    Owner: ${wallet.owner.address}`);
      console.log(`    Smart Wallet: ${wallet.smartAccount.address}`);
    }

    // Step 2: Check current pool balance
    console.log('[2/6] Checking [POOL_NAME] vault balance...');
    // TODO: Update function call to match your service
    const poolBalance = await get[POOL_NAME]Balance(wallet.address);
    
    if (Number(poolBalance.sharesFormatted) < config.shares) {
      throw new Error(`Insufficient [POOL_NAME] shares. Have: ${poolBalance.sharesFormatted}, Need: ${config.shares}`);
    }

    // Step 3: Check current USDC balance (before withdrawal)
    console.log('[3/6] Checking USDC balance (before withdrawal)...');
    const beforeBalance = await checkUSDCBalance(wallet.address);

    // Display test banner
    showTestBanner(config, wallet.address, poolBalance, beforeBalance.formatted);

    // Step 4: Execute gasless withdrawal from [POOL_NAME]
    console.log('[4/6] Executing gasless withdrawal from [POOL_NAME]...');
    
    // Create mock user session for the service
    const mockSession = createMockUserSession('test-user');
    
    // TODO: Update function call to match your service
    const withdrawResult = await withdrawFrom[POOL_NAME]('test-user', config.shares.toString(), wallet.smartAccount);
    
    if (!withdrawResult.success) {
      throw new Error(withdrawResult.error || 'Withdrawal failed with unknown error');
    }

    result.txHash = withdrawResult.txHash;
    result.shares = withdrawResult.assets; // Assets received

    if (config.verbose) {
      console.log(`    TX Hash: ${result.txHash}`);
      console.log(`    Assets: ${result.shares}`);
    }

    // Step 5: Verify transaction on blockchain
    console.log('[5/6] Verifying transaction on blockchain...');
    
    if (result.txHash) {
      const txVerification = await verifyTransaction(result.txHash);
      if (!txVerification.success) {
        throw new Error('Transaction verification failed - transaction reverted');
      }
      result.gasUsed = txVerification.gasUsed;
    }

    // Step 6: Check balances after withdrawal
    console.log('[6/6] Checking balances after withdrawal...');
    
    const afterBalance = await checkUSDCBalance(wallet.address);
    // TODO: Update function call to match your service
    const afterPoolBalance = await get[POOL_NAME]Balance(wallet.address);
    
    const usdcIncrease = Number(afterBalance.formatted) - Number(beforeBalance.formatted);
    const shareDecrease = Number(poolBalance.sharesFormatted) - Number(afterPoolBalance.sharesFormatted);
    
    console.log(`✅ USDC increase: +${usdcIncrease.toFixed(6)} USDC`);
    console.log(`✅ Shares decrease: -${shareDecrease.toFixed(6)} shares`);
    console.log(`✅ Remaining shares: ${afterPoolBalance.sharesFormatted}`);

    if (usdcIncrease <= 0) {
      throw new Error('No USDC received from withdrawal');
    }

    // Check for yield (withdrawal should give more USDC than expected)
    const expectedRatio = config.shares; // 1:1 ratio expected
    const actualRatio = usdcIncrease;
    const yieldBonus = ((actualRatio - expectedRatio) / expectedRatio) * 100;
    
    if (yieldBonus > 0) {
      console.log(`🎉 YIELD DETECTED: +${yieldBonus.toFixed(2)}% bonus!`);
    }

    // Test completed successfully
    result.success = true;
    result.endTime = Date.now();
    
    return result;

  } catch (error: any) {
    result.error = safeErrorLog(error, '[POOL_NAME] withdrawal test');
    result.endTime = Date.now();
    return result;
  }
}

// Main execution
async function main() {
  try {
    const config = parseArguments();
    
    console.log('⚠️  WARNING: This script uses real blockchain transactions!');
    console.log('   Only use dedicated test wallets, never production wallets!\\n');

    const result = await test[POOL_NAME]Withdrawal(config);
    
    // Display test results
    console.log('\\n' + '='.repeat(50));
    console.log('📊 WITHDRAWAL TEST RESULTS');
    console.log('='.repeat(50));
    console.log(formatTestResult(result));

    if (result.success) {
      console.log('🎉 [POOL_NAME] withdrawal test PASSED!');
      console.log('   Withdrawal functionality working correctly.\\n');
      process.exit(0);
    } else {
      console.log('💥 [POOL_NAME] withdrawal test FAILED!');
      console.log('   Fix errors before production deployment.\\n');
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\\n❌ TEST SCRIPT ERROR:', error.message);
    process.exit(1);
  }
}

// Handle script termination gracefully
process.on('SIGINT', () => {
  console.log('\\n\\n🛑 Test interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\\n\\n🛑 Test terminated');
  process.exit(1);
});

// Run the test
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}