#!/usr/bin/env ts-node

/**
 * Seamless USDC Vault Deposit Testing Script
 * Simple deposit test following existing pattern
 */

import { parseArgs } from 'node:util';
import { createTestSmartWallet, checkUSDCBalance } from '../utils/test-helpers';
import { deployToSeamless, getSeamlessBalance } from '../services/seamless-defi';

async function main() {
  console.log('🌊 Seamless USDC Vault Deposit Test');
  console.log('===================================\n');

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      key: { type: 'string', short: 'k' },
      amount: { type: 'string', short: 'a', default: '0.1' }
    }
  });

  if (!values.key) {
    console.error('❌ Private key required. Use --key YOUR_PRIVATE_KEY');
    process.exit(1);
  }

  try {
    console.log('🔐 Creating Smart Wallet...');
    const smartWallet = await createTestSmartWallet(values.key as string);
    console.log(`✅ Smart Wallet: ${smartWallet.address}\n`);

    console.log(`🚀 Depositing ${values.amount} USDC to Seamless vault...`);
    const result = await deployToSeamless('test-user', values.amount as string, smartWallet);

    if (result.success) {
      console.log('✅ Deposit successful!');
      console.log(`📋 Transaction: ${result.txHash}`);
      console.log('🎉 Seamless deposit test PASSED!');
    } else {
      console.error(`❌ Deposit failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}