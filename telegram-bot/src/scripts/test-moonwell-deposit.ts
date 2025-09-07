#!/usr/bin/env ts-node

/**
 * Moonwell USDC Vault Deposit Testing Script
 * 
 * Tests gasless USDC deposits to Moonwell USDC vault using Smart Wallet
 * Following proven Morpho/Spark/Seamless pattern
 * 
 * Usage:
 *   npm run test:moonwell -- --key 0xYOUR_PRIVATE_KEY --amount 0.1
 *   ts-node src/scripts/test-moonwell-deposit.ts --key 0xYOUR_PRIVATE_KEY --amount 0.1
 * 
 * Options:
 *   --key       Private key of test wallet (required)
 *   --amount    USDC amount to deposit (default: 0.1) 
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */

import { parseArgs } from 'node:util';
import { deployToMoonwell, getMoonwellBalance } from '../services/moonwell-defi';
import { createTestSmartWallet, checkUSDCBalance } from '../utils/test-helpers';

async function main() {
  console.log('🌕 Moonwell USDC Vault Deposit Test');
  console.log('===================================\n');

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      key: { type: 'string', short: 'k' },
      amount: { type: 'string', short: 'a', default: '0.1' },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  });

  if (values.help) {
    console.log('Usage: npm run test:moonwell -- --key YOUR_PRIVATE_KEY [--amount 0.1] [--verbose]');
    process.exit(0);
  }

  if (!values.key) {
    console.error('❌ Private key required. Use --key YOUR_PRIVATE_KEY');
    process.exit(1);
  }

  const amount = values.amount as string;
  const verbose = values.verbose as boolean;

  try {
    // Create test Smart Wallet
    console.log(`🔐 Creating Smart Wallet for testing...`);
    const smartWallet = await createTestSmartWallet(values.key as string);
    console.log(`✅ Smart Wallet: ${smartWallet.address}\n`);

    // Check USDC balance
    console.log(`💰 Checking USDC balance...`);
    const usdcBalance = await checkUSDCBalance(smartWallet.address);
    console.log(`💵 USDC Balance: ${usdcBalance.formatted} USDC\n`);

    if (parseFloat(usdcBalance.formatted) < parseFloat(amount)) {
      console.error(`❌ Insufficient USDC. Need ${amount}, have ${usdcBalance.formatted}`);
      process.exit(1);
    }

    // Check current Moonwell balance
    console.log('📊 Checking current Moonwell position...');
    const beforeBalance = await getMoonwellBalance(smartWallet.address);
    console.log(`📈 Current Moonwell shares: ${beforeBalance.sharesFormatted}\n`);

    // Execute deposit
    console.log(`🚀 Depositing ${amount} USDC to Moonwell USDC vault...`);
    const startTime = Date.now();
    
    const result = await deployToMoonwell('test-user', amount, smartWallet);
    
    const executionTime = Date.now() - startTime;

    if (result.success) {
      console.log('✅ Deposit successful!');
      console.log(`📋 Transaction: ${result.txHash}`);
      console.log(`🎯 Shares received: ${result.shares}`);
      console.log(`⏱️  Execution time: ${executionTime}ms`);
      console.log(`⛽ Gas cost: $0.00 (Sponsored by CDP)\n`);

      // Check final balance
      console.log('📊 Checking final Moonwell position...');
      const afterBalance = await getMoonwellBalance(smartWallet.address);
      console.log(`📈 New Moonwell shares: ${afterBalance.sharesFormatted}`);
      
      const sharesDiff = afterBalance.shares - beforeBalance.shares;
      console.log(`📊 Shares gained: ${(Number(sharesDiff) / 1e18).toFixed(6)} Moonwell USDC\n`);

      console.log('🎉 Moonwell deposit test PASSED!');
    } else {
      console.error('❌ Deposit failed!');
      console.error(`📋 Error: ${result.error}\n`);
      console.log('🔴 Moonwell deposit test FAILED!');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    console.log('🔴 Moonwell deposit test FAILED!');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}