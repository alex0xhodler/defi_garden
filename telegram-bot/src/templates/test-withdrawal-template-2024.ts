#!/usr/bin/env ts-node

/**
 * [PROTOCOL] USDC Vault Withdrawal Testing Script
 * 
 * Tests gasless USDC withdrawals from [PROTOCOL] USDC vault using Smart Wallet
 * Following proven Morpho/Spark/Seamless/Moonwell pattern
 * 
 * Usage:
 *   npm run test:[protocol]-withdraw -- --key 0xYOUR_PRIVATE_KEY --shares 0.1
 *   npm run test:[protocol]-withdraw -- --key 0xYOUR_PRIVATE_KEY --shares max
 *   ts-node src/scripts/test-[protocol]-withdrawal.ts --key 0xYOUR_PRIVATE_KEY --shares 0.1
 * 
 * Options:
 *   --key       Private key of test wallet (required)
 *   --shares    Shares amount to withdraw or "max" for all (default: 0.1) 
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */

import { parseArgs } from 'node:util';
import { withdrawFrom[PROTOCOL], get[PROTOCOL]Balance } from '../services/[protocol]-defi';
import { createTestSmartWallet, checkUSDCBalance } from '../utils/test-helpers';

async function main() {
  console.log('🔥 [PROTOCOL] USDC Vault Withdrawal Test');
  console.log('======================================\n');

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      key: { type: 'string', short: 'k' },
      shares: { type: 'string', short: 's', default: '0.1' },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  });

  if (values.help) {
    console.log('Usage: npm run test:[protocol]-withdraw -- --key YOUR_PRIVATE_KEY [--shares 0.1|max] [--verbose]');
    process.exit(0);
  }

  if (!values.key) {
    console.error('❌ Private key required. Use --key YOUR_PRIVATE_KEY');
    process.exit(1);
  }

  const shares = values.shares as string;
  const verbose = values.verbose as boolean;

  try {
    // Create test Smart Wallet
    console.log(`🔐 Creating Smart Wallet for testing...`);
    const smartWallet = await createTestSmartWallet(values.key as string);
    console.log(`✅ Smart Wallet: ${smartWallet.address}\n`);

    // Check current [PROTOCOL] balance
    console.log('📊 Checking current [PROTOCOL] position...');
    const beforeBalance = await get[PROTOCOL]Balance(smartWallet.address);
    console.log(`📈 Current [PROTOCOL] shares: ${beforeBalance.sharesFormatted}`);
    console.log(`💵 USDC equivalent: ~${beforeBalance.assetsFormatted} USDC\n`);

    if (beforeBalance.shares === 0n) {
      console.log('⚠️  No [PROTOCOL] shares found. Please deposit first using:');
      console.log('   npm run test:[protocol] -- --key YOUR_PRIVATE_KEY --amount 0.1\n');
      process.exit(1);
    }

    // Check initial USDC balance
    console.log(`💰 Checking USDC balance before withdrawal...`);
    const beforeUSDC = await checkUSDCBalance(smartWallet.address);
    console.log(`💵 USDC Balance: ${beforeUSDC.formatted} USDC\n`);

    // Execute withdrawal
    console.log(`🔄 Withdrawing ${shares} [PROTOCOL] USDC shares...`);
    const startTime = Date.now();
    
    const result = await withdrawFrom[PROTOCOL]('test-user', shares, smartWallet);
    
    const executionTime = Date.now() - startTime;

    if (result.success) {
      console.log('✅ Withdrawal successful!');
      console.log(`📋 Transaction: ${result.txHash}`);
      console.log(`💰 USDC received: ${result.assets}`);
      console.log(`⏱️  Execution time: ${executionTime}ms`);
      console.log(`⛽ Gas cost: $0.00 (Sponsored by CDP)\n`);

      // Check final balances
      console.log('📊 Checking final positions...');
      const afterBalance = await get[PROTOCOL]Balance(smartWallet.address);
      const afterUSDC = await checkUSDCBalance(smartWallet.address);
      
      console.log(`📈 Remaining [PROTOCOL] shares: ${afterBalance.sharesFormatted}`);
      console.log(`💵 Final USDC Balance: ${afterUSDC.formatted} USDC`);
      
      const sharesDiff = beforeBalance.shares - afterBalance.shares;
      const usdcDiff = parseFloat(afterUSDC.formatted) - parseFloat(beforeUSDC.formatted);
      
      console.log(`📊 Shares redeemed: ${(Number(sharesDiff) / 1e18).toFixed(6)} [PROTOCOL] USDC`);
      console.log(`📊 USDC received: +${usdcDiff.toFixed(6)} USDC\n`);

      console.log('🎉 [PROTOCOL] withdrawal test PASSED!');
    } else {
      console.error('❌ Withdrawal failed!');
      console.error(`📋 Error: ${result.error}\n`);
      console.log('🔴 [PROTOCOL] withdrawal test FAILED!');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    console.log('🔴 [PROTOCOL] withdrawal test FAILED!');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}