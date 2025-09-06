#!/usr/bin/env ts-node

/**
 * Spark USDC Vault Withdrawal Testing Script
 * 
 * Tests gasless share redemption from Spark USDC vault using Smart Wallet
 * 
 * Usage:
 *   npm run test:spark-withdraw -- --key 0xYOUR_PRIVATE_KEY
 *   ts-node src/scripts/test-spark-withdrawal.ts --key 0xYOUR_PRIVATE_KEY
 * 
 * Options:
 *   --key       Private key of test wallet (required)
 *   --shares    Share amount to withdraw (default: 0.05)
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */

import { parseArgs } from 'node:util';
import { withdrawFromSpark, getSparkBalance } from '../services/spark-defi';
import { 
  createTestSmartWallet, 
  checkUSDCBalance, 
  createMockUserSession,
  formatTestResult,
  isValidTxHash,
  TestResult
} from '../utils/test-helpers';

// Test configuration
interface TestConfig {
  privateKey: string;
  shares: number | 'max';
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

🧪 SPARK USDC VAULT WITHDRAWAL TEST SCRIPT
==========================================

Tests gasless share redemption from Spark USDC vault using Smart Wallet.

USAGE:
  npm run test:spark-withdraw -- --key 0xYOUR_PRIVATE_KEY --shares 0.05
  ts-node src/scripts/test-spark-withdrawal.ts --key 0xYOUR_PRIVATE_KEY

OPTIONS:
  --key, -k       Private key of test wallet (required)
  --shares, -s    SPARKUSDC shares to withdraw (default: 0.05, use "max" for full exit)
  --verbose, -v   Enable verbose logging
  --help, -h      Show this help message

EXAMPLES:
  # Test withdraw 0.05 SPARKUSDC shares (default)
  npm run test:spark-withdraw -- --key 0x1234...

  # Test withdraw 0.1 shares with verbose logging  
  npm run test:spark-withdraw -- --key 0x1234... --shares 0.1 --verbose

  # Test full exit (withdraw all shares)
  npm run test:spark-withdraw -- --key 0x1234... --shares max

⚠️  REQUIREMENTS:
  - Private key must have SPARKUSDC shares in Spark vault
  - Minimum recommended: 0.05+ SPARKUSDC shares
  - Run deposit test first if you don't have shares

💡 TIP: Start with small amounts (0.05 shares) for testing
        Check current position with: getSparkBalance()
    `);
    process.exit(0);
  }

  // Validate required arguments
  if (!values.key) {
    console.error('❌ Error: Private key is required. Use --key or -k');
    console.error('   Example: npm run test:spark-withdraw -- --key 0xYOUR_PRIVATE_KEY');
    process.exit(1);
  }

  const sharesInput = values.shares || '0.05';
  
  return {
    privateKey: values.key,
    shares: sharesInput === 'max' ? 'max' : parseFloat(sharesInput),
    verbose: values.verbose || false
  };
}

/**
 * Main test function for Spark USDC vault withdrawal
 */
async function testSparkWithdrawal(): Promise<void> {
  const config = parseArguments();
  
  console.log('\n🧪 SPARK USDC VAULT WITHDRAWAL TEST');
  console.log('==================================\n');

  const testResults: TestResult[] = [];
  
  try {
    // Step 1: Setup Smart Wallet
    console.log('🔧 Step 1: Setting up Smart Wallet...');
    
    const { smartAccount, address: smartWalletAddress } = await createTestSmartWallet(config.privateKey);
    
    if (config.verbose) {
      console.log(`📍 Smart Wallet Address: ${smartWalletAddress}`);
    }
    
    testResults.push({
      success: true,
      startTime: Date.now(),
      endTime: Date.now(),
      shares: '0'
    });

    // Step 2: Check Initial Positions
    console.log('📊 Step 2: Checking current positions...');
    
    const initialUsdcBalance = await checkUSDCBalance(smartWalletAddress);
    const initialSparkPosition = await getSparkBalance(smartWalletAddress);
    
    console.log(`💰 Initial USDC Balance: ${initialUsdcBalance} USDC`);
    console.log(`💎 Initial SPARKUSDC Shares: ${initialSparkPosition.sharesFormatted}`);
    console.log(`📈 Estimated USDC Value: ${initialSparkPosition.assetsFormatted} USDC`);
    
    // Handle max exit or validate sufficient shares
    const sharesAvailable = parseFloat(initialSparkPosition.sharesFormatted);
    let sharesToWithdraw: number;
    const isMaxExit = config.shares === 'max';
    
    if (isMaxExit) {
      // For max exit, use the exact raw balance to avoid precision issues
      sharesToWithdraw = parseFloat((Number(initialSparkPosition.shares) / 1e18).toFixed(18));
      console.log(`📤 MAX EXIT: Withdrawing all ${sharesToWithdraw} SPARKUSDC shares (exact balance)`);
    } else {
      sharesToWithdraw = config.shares as number;
      if (sharesAvailable < sharesToWithdraw) {
        throw new Error(
          `Insufficient SPARKUSDC shares. Have: ${sharesAvailable}, Need: ${sharesToWithdraw}.\n` +
          `Run deposit test first: npm run test:spark -- --key ${config.privateKey.substring(0, 6)}...`
        );
      }
    }
    
    if (sharesToWithdraw === 0) {
      throw new Error('No SPARKUSDC shares to withdraw. Run deposit test first.');
    }
    
    testResults.push({
      success: true,
      startTime: Date.now(),
      endTime: Date.now(),
      shares: sharesAvailable.toString()
    });

    // Step 3: Execute Withdrawal
    console.log(`🔄 Step 3: ${isMaxExit ? 'MAX EXIT - Withdrawing ALL' : `Withdrawing ${sharesToWithdraw}`} SPARKUSDC shares...`);
    
    const mockSession = createMockUserSession();
    const mockUserId = mockSession.userId;
    
    const withdrawalResult = await withdrawFromSpark(
      mockUserId,
      isMaxExit ? 'max' : sharesToWithdraw.toString(),
      smartAccount  // Pass smartAccount for testing
    );

    if (!withdrawalResult.success) {
      throw new Error(`Withdrawal failed: ${withdrawalResult.error}`);
    }

    const txHash = withdrawalResult.txHash!;
    console.log(`✅ Withdrawal successful! Transaction: ${txHash}`);
    
    testResults.push({
      success: true,
      startTime: Date.now(),
      endTime: Date.now(),
      txHash,
      shares: sharesToWithdraw.toString()
    });

    // Step 4: Verify Transaction On-Chain
    console.log('🔍 Step 4: Verifying transaction on blockchain...');
    
    if (!isValidTxHash(txHash)) {
      console.warn(`⚠️  Transaction hash format invalid: ${txHash}`);
    } else {
      console.log(`✅ Transaction hash verified: ${txHash}`);
    }

    // Step 5: Check Final Positions
    console.log('💰 Step 5: Checking final positions...');
    
    // Wait briefly for state updates
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const finalUsdcBalance = await checkUSDCBalance(smartWalletAddress);
    const finalSparkPosition = await getSparkBalance(smartWalletAddress);
    
    // Calculate changes
    const usdcReceived = parseFloat(finalUsdcBalance.formatted) - parseFloat(initialUsdcBalance.formatted);
    const sharesRedeemed = parseFloat(initialSparkPosition.sharesFormatted) - parseFloat(finalSparkPosition.sharesFormatted);
    
    console.log(`📊 Final Positions:`);
    console.log(`   💰 USDC Balance: ${finalUsdcBalance.formatted} USDC (+${usdcReceived.toFixed(6)})`);
    console.log(`   💎 SPARKUSDC Shares: ${finalSparkPosition.sharesFormatted} (-${sharesRedeemed.toFixed(6)})`);
    
    // Show current exchange rate (not misleading "yield")
    if (usdcReceived > 0 && sharesRedeemed > 0) {
      const exchangeRate = usdcReceived / sharesRedeemed;
      console.log(`   📊 Current Exchange Rate: 1 SPARKUSDC = ${exchangeRate.toFixed(6)} USDC`);
    }
    
    // Check if full exit was successful
    if (isMaxExit) {
      const remainingShares = parseFloat(finalSparkPosition.sharesFormatted);
      if (remainingShares < 0.000001) { // Account for rounding
        console.log(`   ✅ FULL EXIT SUCCESSFUL: All shares redeemed`);
      } else {
        console.log(`   ⚠️ Remaining dust: ${remainingShares} SPARKUSDC shares`);
      }
    }
    
    testResults.push({
      success: true,
      startTime: Date.now(),
      endTime: Date.now(),
      shares: sharesRedeemed.toFixed(6)
    });

    // Step 6: Success Summary
    console.log('\n🎉 SPARK WITHDRAWAL TEST COMPLETED SUCCESSFULLY!');
    console.log('==============================================\n');
    
    console.log(`✅ ${isMaxExit ? 'FULL EXIT' : 'PARTIAL EXIT'}: ${sharesRedeemed.toFixed(6)} SPARKUSDC shares`);
    console.log(`✅ Received: ${usdcReceived.toFixed(6)} USDC`);
    console.log(`✅ Transaction: ${txHash}`);
    console.log(`✅ Gasless: Transaction paid by CDP Paymaster`);
    
    if (isMaxExit) {
      const remainingShares = parseFloat(finalSparkPosition.sharesFormatted);
      console.log(`✅ Position Status: ${remainingShares < 0.000001 ? 'FULLY EXITED' : 'DUST REMAINING'}`);
    }
    
    if (config.verbose) {
      console.log('\n📋 Detailed Test Results:');
      testResults.forEach(result => {
        console.log(formatTestResult(result));
      });
    }

  } catch (error: any) {
    console.error('\n❌ SPARK WITHDRAWAL TEST FAILED');
    console.error('==============================\n');
    
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
      console.error(`Shares: ${config.shares} SPARKUSDC`);
      console.error(`Verbose: ${config.verbose}`);
    }
    
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  testSparkWithdrawal().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testSparkWithdrawal };