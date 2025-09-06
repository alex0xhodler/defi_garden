#!/usr/bin/env ts-node

/**
 * Morpho PYTH/USDC Deposit Testing Script
 * 
 * Tests gasless USDC deposits to Morpho PYTH/USDC vault using Smart Wallet
 * 
 * Usage:
 *   npm run test:morpho -- --key 0xYOUR_PRIVATE_KEY
 *   ts-node src/scripts/test-morpho-deposit.ts --key 0xYOUR_PRIVATE_KEY
 * 
 * Options:
 *   --key       Private key of test wallet (required)
 *   --amount    USDC amount to deposit (default: 1)
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */

import { parseArgs } from 'node:util';
import { deployToMorphoPYTH, getMorphoBalance } from '../services/morpho-defi';
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
  amount: number;
  verbose: boolean;
}

// Parse command line arguments
function parseArguments(): TestConfig {
  const { values } = parseArgs({
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
🧪 MORPHO DEPOSIT TEST SCRIPT
============================

Tests gasless USDC deposits to Morpho PYTH/USDC vault using Smart Wallet.

Usage:
  npm run test:morpho -- --key 0xYOUR_PRIVATE_KEY [options]

Required:
  --key, -k     Private key of test wallet (0x + 64 hex chars)

Options:
  --amount, -a  USDC amount to deposit (default: 1)
  --verbose, -v Enable verbose logging
  --help, -h    Show this help message

Examples:
  npm run test:morpho -- --key 0x1234567890abcdef...
  npm run test:morpho -- --key 0x1234... --amount 5 --verbose

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

  const amount = values.amount ? parseFloat(values.amount) : 1;
  if (isNaN(amount) || amount <= 0 || amount > 100) {
    console.error('❌ Error: Invalid amount. Must be a positive number ≤ 100 USDC');
    process.exit(1);
  }

  return {
    privateKey,
    amount,
    verbose: values.verbose || false
  };
}

// Display test banner
function showTestBanner(config: TestConfig, smartWalletAddress: string, usdcBalance: string) {
  console.log(`
🧪 MORPHO DEPOSIT TEST
=====================
🦑 Smart Wallet: ${smartWalletAddress}
💰 USDC Balance: ${usdcBalance} USDC
📊 Test Amount: ${config.amount} USDC
🎯 Target: Morpho PYTH/USDC Vault (~10% APY)
⛽ Transaction: Gasless (Sponsored)

Starting test...
  `);
}

// Main test function
async function testMorphoDeposit(config: TestConfig): Promise<TestResult> {
  const result: TestResult = {
    success: false,
    startTime: Date.now()
  };

  try {
    console.log('🧪 MORPHO DEPOSIT TEST STARTING...\n');

    // Step 1: Create Smart Wallet from private key
    console.log('[1/5] Creating Smart Wallet from private key...');
    const wallet = await createTestSmartWallet(config.privateKey);
    
    if (config.verbose) {
      console.log(`    Owner: ${wallet.owner.address}`);
      console.log(`    Smart Wallet: ${wallet.smartAccount.address}`);
    }

    // Step 2: Check USDC balance
    console.log('[2/5] Checking USDC balance...');
    const balance = await checkUSDCBalance(wallet.address);
    
    if (Number(balance.formatted) < config.amount) {
      throw new Error(`Insufficient USDC balance. Have: ${balance.formatted}, Need: ${config.amount}`);
    }

    // Display test banner
    showTestBanner(config, wallet.address, balance.formatted);

    // Step 3: Execute gasless deposit to Morpho
    console.log('[3/5] Executing gasless deposit to Morpho PYTH/USDC...');
    
    // Create mock user session for the service
    const mockSession = createMockUserSession('test-user');
    
    const depositResult = await deployToMorphoPYTH('test-user', config.amount.toString(), wallet.smartAccount);
    
    if (!depositResult.success) {
      throw new Error(depositResult.error || 'Deposit failed with unknown error');
    }

    result.txHash = depositResult.txHash;
    result.shares = depositResult.shares;

    if (config.verbose) {
      console.log(`    TX Hash: ${result.txHash}`);
      console.log(`    Shares: ${result.shares}`);
    }

    // Step 4: Verify transaction on blockchain
    console.log('[4/5] Verifying transaction on blockchain...');
    
    if (result.txHash) {
      const txVerification = await verifyTransaction(result.txHash);
      if (!txVerification.success) {
        throw new Error('Transaction verification failed - transaction reverted');
      }
      result.gasUsed = txVerification.gasUsed;
    }

    // Step 5: Check Morpho balance to confirm shares received
    console.log('[5/5] Checking Morpho vault balance...');
    
    const morphoBalance = await getMorphoBalance(wallet.address);
    
    if (Number(morphoBalance.assetsFormatted) === 0) {
      throw new Error('No assets found in Morpho vault after deposit');
    }

    console.log(`✅ Vault shares: ${morphoBalance.sharesFormatted}`);
    console.log(`✅ Asset value: ${morphoBalance.assetsFormatted} USDC`);

    // Test completed successfully
    result.success = true;
    result.endTime = Date.now();
    
    return result;

  } catch (error: any) {
    result.error = safeErrorLog(error, 'Morpho deposit test');
    result.endTime = Date.now();
    return result;
  }
}

// Main execution
async function main() {
  try {
    const config = parseArguments();
    
    console.log('⚠️  WARNING: This script uses real blockchain transactions!');
    console.log('   Only use dedicated test wallets, never production wallets!\n');

    const result = await testMorphoDeposit(config);
    
    // Display test results
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(50));
    console.log(formatTestResult(result));

    if (result.success) {
      console.log('🎉 Morpho integration test PASSED!');
      console.log('   Ready for production deployment.\n');
      process.exit(0);
    } else {
      console.log('💥 Morpho integration test FAILED!');
      console.log('   Fix errors before production deployment.\n');
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ TEST SCRIPT ERROR:', error.message);
    process.exit(1);
  }
}

// Handle script termination gracefully
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Test terminated');
  process.exit(1);
});

// Run the test
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}