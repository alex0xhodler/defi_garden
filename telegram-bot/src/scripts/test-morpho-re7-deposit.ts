#!/usr/bin/env ts-node

/**
 * Morpho Re7 Universal USDC Vault Deposit Testing Script
 * 
 * Tests gasless USDC deposits to Re7 Universal USDC vault using Smart Wallet
 * Following proven Morpho/Spark/Seamless pattern
 * 
 * Usage:
 *   npm run test:morpho-re7 -- --key 0xYOUR_PRIVATE_KEY --amount 0.1
 *   ts-node src/scripts/test-morpho-re7-deposit.ts --key 0xYOUR_PRIVATE_KEY --amount 0.1
 * 
 * Options:
 *   --key       Private key of test wallet (required)
 *   --amount    USDC amount to deposit (default: 0.1) 
 *   --verbose   Enable verbose logging (default: false)
 *   --help      Show help message
 */

import { parseArgs } from 'node:util';
import { deployToMorphoRe7, getMorphoRe7Balance } from '../services/morpho-re7-defi';
import { createTestSmartWallet, checkUSDCBalance } from '../utils/test-helpers';

async function main() {
  console.log('♾️  Morpho Re7 Universal USDC Vault Deposit Test');
  console.log('===============================================\n');

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
    console.log('Usage: npm run test:morpho-re7 -- --key YOUR_PRIVATE_KEY [--amount 0.1] [--verbose]');
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

    // Check current Morpho Re7 balance
    console.log('📊 Checking current Morpho Re7 position...');
    const beforeBalance = await getMorphoRe7Balance(smartWallet.address);
    console.log(`📈 Current Re7 Universal USDC shares: ${beforeBalance.sharesFormatted}\n`);

    // Execute deposit
    console.log(`🚀 Depositing ${amount} USDC to Re7 Universal USDC vault...`);
    const startTime = Date.now();
    
    const result = await deployToMorphoRe7('test-user', amount, smartWallet);
    
    const executionTime = Date.now() - startTime;

    if (result.success) {
      console.log('✅ Deposit successful!');
      console.log(`📋 Transaction: ${result.txHash}`);
      console.log(`🎯 Shares received: ${result.shares}`);
      console.log(`⏱️  Execution time: ${executionTime}ms`);
      console.log(`⛽ Gas cost: $0.00 (Sponsored by CDP)\n`);

      // Check final balance
      console.log('📊 Checking final Morpho Re7 position...');
      const afterBalance = await getMorphoRe7Balance(smartWallet.address);
      console.log(`📈 New Re7 Universal USDC shares: ${afterBalance.sharesFormatted}`);
      
      const sharesDiff = afterBalance.shares - beforeBalance.shares;
      console.log(`📊 Shares gained: ${(Number(sharesDiff) / 1e18).toFixed(6)} Re7 Universal USDC\n`);

      console.log('🎉 Morpho Re7 deposit test PASSED!');
    } else {
      console.error('❌ Deposit failed!');
      console.error(`📋 Error: ${result.error}\n`);
      console.log('🔴 Morpho Re7 deposit test FAILED!');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    console.log('🔴 Morpho Re7 deposit test FAILED!');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}