#!/usr/bin/env ts-node

/**
 * Transfer USDC from EOA to Smart Wallet for Testing
 * 
 * Transfers USDC from the EOA (your private key address) to the Smart Wallet
 * so that the Spark vault tests can use the funds.
 * 
 * Usage:
 *   ts-node src/scripts/transfer-usdc-to-smart-wallet.ts --key 0xYOUR_PRIVATE_KEY --amount 1.0
 */

import { parseArgs } from 'node:util';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { createTestSmartWallet, checkUSDCBalance } from '../utils/test-helpers';

// USDC contract address on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// Simple ERC20 ABI for transfer
const erc20Abi = [
  {
    inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

interface TransferConfig {
  privateKey: string;
  amount: number;
}

function parseArguments(): TransferConfig {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      key: { type: 'string', short: 'k' },
      amount: { type: 'string', short: 'a' },
      help: { type: 'boolean', short: 'h' }
    }
  });

  if (values.help) {
    console.log(`
🔄 USDC TRANSFER TO SMART WALLET
===============================

Transfers USDC from EOA to Smart Wallet for testing.

USAGE:
  ts-node src/scripts/transfer-usdc-to-smart-wallet.ts --key 0xYOUR_KEY --amount 1.0

OPTIONS:
  --key, -k       Private key (required)
  --amount, -a    USDC amount to transfer (default: 1.0)
  --help, -h      Show this help

EXAMPLE:
  ts-node src/scripts/transfer-usdc-to-smart-wallet.ts --key 0x887... --amount 1.5
    `);
    process.exit(0);
  }

  if (!values.key) {
    console.error('❌ Error: Private key required');
    process.exit(1);
  }

  return {
    privateKey: values.key,
    amount: parseFloat(values.amount || '1.0')
  };
}

async function transferUSDCToSmartWallet() {
  const config = parseArguments();
  
  console.log('\n🔄 TRANSFERRING USDC FROM EOA TO SMART WALLET');
  console.log('=============================================\n');

  try {
    // Create public client
    const publicClient = createPublicClient({
      chain: base,
      transport: http("https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz"),
    });

    // Create EOA account and wallet client
    const account = privateKeyToAccount(config.privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http("https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz"),
    });

    console.log(`👤 EOA Address: ${account.address}`);

    // Get Smart Wallet address
    const { address: smartWalletAddress } = await createTestSmartWallet(config.privateKey);
    console.log(`🦑 Smart Wallet Address: ${smartWalletAddress}`);

    // Check EOA USDC balance
    const eoaBalance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account.address]
    });

    const eoaBalanceFormatted = (Number(eoaBalance) / 1e6).toFixed(6);
    console.log(`💰 EOA USDC Balance: ${eoaBalanceFormatted} USDC`);

    // Check Smart Wallet USDC balance
    const smartWalletBalance = await checkUSDCBalance(smartWalletAddress);
    console.log(`🏦 Smart Wallet USDC Balance: ${smartWalletBalance.formatted} USDC`);

    // Validate sufficient balance
    const transferAmount = parseUnits(config.amount.toString(), 6);
    if (eoaBalance < transferAmount) {
      throw new Error(`Insufficient USDC in EOA. Have: ${eoaBalanceFormatted}, Need: ${config.amount}`);
    }

    console.log(`\n📤 Transferring ${config.amount} USDC from EOA to Smart Wallet...`);

    // Execute transfer
    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [smartWalletAddress, transferAmount],
    });

    console.log(`✅ Transfer transaction sent: ${hash}`);
    console.log('⏳ Waiting for confirmation...');

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      console.log(`✅ Transfer confirmed! Block: ${receipt.blockNumber}`);
      
      // Check final balances
      console.log('\n📊 Final Balances:');
      
      const finalEoaBalance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account.address]
      });
      
      const finalSmartWalletBalance = await checkUSDCBalance(smartWalletAddress);
      
      console.log(`👤 EOA USDC Balance: ${(Number(finalEoaBalance) / 1e6).toFixed(6)} USDC`);
      console.log(`🦑 Smart Wallet USDC Balance: ${finalSmartWalletBalance.formatted} USDC`);
      
      console.log('\n🎉 TRANSFER COMPLETED SUCCESSFULLY!');
      console.log('Now you can run the Spark vault tests:');
      console.log(`npm run test:spark-cycle -- --key ${config.privateKey.substring(0, 10)}... --amount 0.1`);
      
    } else {
      throw new Error('Transaction failed');
    }

  } catch (error: any) {
    console.error('\n❌ TRANSFER FAILED');
    console.error('==================');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  transferUSDCToSmartWallet().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { transferUSDCToSmartWallet };