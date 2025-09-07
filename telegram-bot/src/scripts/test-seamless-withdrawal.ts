#!/usr/bin/env ts-node

/**
 * Seamless USDC Vault Withdrawal Testing Script
 * Simple withdrawal test following existing pattern
 */

import { parseArgs } from 'node:util';
import { createTestSmartWallet, checkUSDCBalance } from '../utils/test-helpers';
import { withdrawFromSeamless, getSeamlessBalance } from '../services/seamless-defi';

async function main() {
  console.log('🌊 Seamless USDC Vault Withdrawal Test');
  console.log('======================================\n');

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      key: { type: 'string', short: 'k' },
      shares: { type: 'string', short: 's', default: '0.1' }
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

    console.log(`🔄 Withdrawing ${values.shares} SMUSDC shares...`);
    const result = await withdrawFromSeamless('test-user', values.shares as string, smartWallet);

    if (result.success) {
      console.log('✅ Withdrawal successful!');
      console.log(`📋 Transaction: ${result.txHash}`);
      console.log('🎉 Seamless withdrawal test PASSED!');
    } else {
      console.error(`❌ Withdrawal failed: ${result.error}`);
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