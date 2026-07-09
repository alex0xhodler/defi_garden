#!/usr/bin/env node

/**
 * Your 'Set-and-Forget' Stablecoin Yield Calculator Generator / Runner.
 * Factoring in gas fees, bridging slippage, and auto-compounding frequencies.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to parse arguments
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(val => {
    if (val.startsWith('--')) {
      const parts = val.substring(2).split('=');
      args[parts[0]] = parts[1] || true;
    }
  });
  return args;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Fallback mock pools if DefiLlama is down
const MOCK_POOLS = [
  { pool: 'aave-eth', chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC', tvlUsd: 850000000, apy: 5.4 },
  { pool: 'morpho-base', chain: 'Base', project: 'morpho-blue', symbol: 'USDC', tvlUsd: 140000000, apy: 7.8 },
  { pool: 'aave-arb', chain: 'Arbitrum', project: 'aave-v3', symbol: 'USDC', tvlUsd: 190000000, apy: 6.2 },
  { pool: 'kamino-sol', chain: 'Solana', project: 'kamino', symbol: 'USDC', tvlUsd: 310000000, apy: 11.5 }
];

// Mock Gas Oracle Data
const GAS_ORACLE = {
  Ethereum: {
    chain: 'Ethereum',
    gasPriceGwei: 15,
    nativeTokenPriceUsd: 3100,
    estimatedGasLimit: { approve: 45000, deposit: 150000, withdraw: 150000, claimRewards: 100000, bridge: 120000 }
  },
  Base: {
    chain: 'Base',
    gasPriceGwei: 0.1,
    nativeTokenPriceUsd: 3100,
    estimatedGasLimit: { approve: 45000, deposit: 150000, withdraw: 150000, claimRewards: 100000, bridge: 120000 }
  },
  Arbitrum: {
    chain: 'Arbitrum',
    gasPriceGwei: 0.1,
    nativeTokenPriceUsd: 3100,
    estimatedGasLimit: { approve: 45000, deposit: 150000, withdraw: 150000, claimRewards: 100000, bridge: 120000 }
  },
  Solana: {
    chain: 'Solana',
    gasPriceGwei: 0,
    nativeTokenPriceUsd: 140,
    estimatedGasLimit: { approve: 0, deposit: 0, withdraw: 0, claimRewards: 0, bridge: 0 },
    flatTxFeeUsd: 0.01
  }
};

const SLIPPAGE_CONFIG = {
  defaultBridgeSlippagePercent: 0.1,
  defaultSwapSlippagePercent: 0.05,
  chainSpecificSlippagePercent: { Solana: 0.15 }
};

async function main() {
  const args = parseArgs();

  // Extract config
  const calculatorId = args.calculatorId || 'blended-stablecoin-yield';
  const assetType = args.assetType || 'stablecoin';
  const chains = (args.chains || 'Ethereum,Base,Arbitrum').split(',');
  const feature = args.feature || 'diversified_yield_projection';
  
  const principal = parseFloat(args.principal) || 10000;
  const duration = parseInt(args.duration) || 365;
  const frequency = args.frequency || 'monthly';
  const isAuto = args.autoCompound !== 'false';

  console.log(`================================================================`);
  console.log(` OVERSIGHT COMMAND CENTER | YIELD CALCULATOR GENERATOR          `);
  console.log(`================================================================`);
  console.log(`ID:      ${calculatorId}`);
  console.log(`Asset:   ${assetType.toUpperCase()}`);
  console.log(`Chains:  ${chains.join(', ')}`);
  console.log(`Feature: ${feature}`);
  console.log(`----------------------------------------------------------------`);

  let rawPools = [];
  try {
    console.log('📡 Fetching live DefiLlama pools to select top stablecoin yields...');
    const data = await httpsGet('https://yields.llama.fi/pools');
    const json = JSON.parse(data);
    rawPools = json.data || json;
    console.log('✓ Successfully retrieved live yield data.');
  } catch (err) {
    console.warn('⚠ Failed to fetch live pools from DefiLlama. Using built-in curated pools.');
    rawPools = MOCK_POOLS;
  }

  // Filter pools by chains and stablecoin tokens
  const stableTokens = ['USDC', 'USDT', 'USDS', 'DAI'];
  const targetChains = new Set(chains.map(c => c.trim().toLowerCase()));
  
  const filteredPools = rawPools.filter(p => {
    const chainMatch = targetChains.has(p.chain.toLowerCase());
    const symbolMatch = stableTokens.some(token => p.symbol.toUpperCase().includes(token));
    const tvlOk = p.tvlUsd > 10000000; // >$10M TVL
    return chainMatch && symbolMatch && tvlOk;
  });

  // Select the highest APY pool for each chain to build a diversified portfolio
  const selectedPools = [];
  chains.forEach(chainName => {
    const chainPools = filteredPools.filter(p => p.chain.toLowerCase() === chainName.toLowerCase());
    if (chainPools.length > 0) {
      chainPools.sort((a, b) => {
        const aApy = a.apy !== undefined ? a.apy : ((a.apyBase || 0) + (a.apyReward || 0));
        const bApy = b.apy !== undefined ? b.apy : ((b.apyBase || 0) + (b.apyReward || 0));
        return bApy - aApy;
      });
      const topPool = chainPools[0];
      selectedPools.push({
        pool: topPool.pool,
        chain: topPool.chain,
        project: topPool.project,
        symbol: topPool.symbol,
        tvlUsd: topPool.tvlUsd,
        apy: topPool.apy !== undefined ? topPool.apy : ((topPool.apyBase || 0) + (topPool.apyReward || 0))
      });
    } else {
      // Fallback from mock pools if not found
      const fallback = MOCK_POOLS.find(p => p.chain.toLowerCase() === chainName.toLowerCase());
      if (fallback) {
        selectedPools.push(fallback);
      }
    }
  });

  if (selectedPools.length === 0) {
    console.error('✗ Error: Could not find or seed any pools for the specified chains.');
    process.exit(1);
  }

  console.log(`\nSelected Diversified Pools:`);
  selectedPools.forEach(p => {
    console.log(`  • [${p.chain}] ${p.project} (${p.symbol}) | APY: ${p.apy.toFixed(2)}% | TVL: $${(p.tvlUsd / 1e6).toFixed(1)}M`);
  });

  // Dynamic ES Module import of the TS engine
  const { calculateBlendedYield } = await import('../dist/calculator/engine.js');

  // Build equal-split allocations
  const allocationPercent = 100 / selectedPools.length;
  const allocations = selectedPools.map(p => ({
    poolId: p.pool,
    allocationPercentage: allocationPercent
  }));

  const input = {
    principalUsd: principal,
    durationDays: duration,
    sourceChain: 'Ethereum',
    allocations,
    pools: selectedPools,
    gasOracle: GAS_ORACLE,
    slippageConfig: SLIPPAGE_CONFIG,
    compoundingFrequency: frequency,
    isAutoCompounding: isAuto,
    performanceFeePercent: 2.0 // standard 2% performance fee
  };

  const result = calculateBlendedYield(input);

  // Sterile Receipt Ledger Layout
  console.log(`\n================================================================`);
  console.log(`                 INVESTMENT PERFORMANCE RECEIPT                 `);
  console.log(`================================================================`);
  console.log(`Initial Principal:  $${result.initialPrincipalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Duration:           ${duration} Days`);
  console.log(`Compounding:        ${frequency.toUpperCase()} (${isAuto ? 'AUTO' : 'MANUAL'})`);
  console.log(`----------------------------------------------------------------`);
  
  result.poolResults.forEach(p => {
    console.log(`[${p.chain.toUpperCase()}] ${p.project.toUpperCase()} (${p.symbol})`);
    console.log(`  Allocated:        $${p.allocatedPrincipalUsd.toFixed(2).padStart(12)}`);
    console.log(`  Slippage Paid:   -$${p.slippagePaidUsd.toFixed(2).padStart(12)}`);
    console.log(`  Entry Gas:       -$${p.entryGasPaidUsd.toFixed(2).padStart(12)}`);
    console.log(`  Earning Principal:$${p.startingPrincipalUsd.toFixed(2).padStart(12)}`);
    console.log(`  Gross Yield:     +$${p.accruedYieldUsd.toFixed(2).padStart(12)}`);
    if (p.compoundingGasPaidUsd > 0) {
      console.log(`  Compound Gas:    -$${p.compoundingGasPaidUsd.toFixed(2).padStart(12)} (Count: ${p.compoundingEventsCount})`);
    }
    console.log(`  Exit Gas:        -$${p.exitGasPaidUsd.toFixed(2).padStart(12)}`);
    console.log(`  Net Ending:       $${p.netEndingBalanceUsd.toFixed(2).padStart(12)}`);
    console.log(`  Net Yield:       +$${p.netYieldUsd.toFixed(2).padStart(12)} (Net APY: ${p.netApyPercent.toFixed(2)}%)`);
    if (p.warning) {
      console.log(`  ⚠ WARNING: ${p.warning}`);
    }
    console.log(`----------------------------------------------------------------`);
  });

  console.log(`TOTALS`);
  console.log(`  Total Gas Paid:  -$${result.totalGasPaidUsd.toFixed(2).padStart(12)}`);
  console.log(`  Total Slippage:  -$${result.totalSlippagePaidUsd.toFixed(2).padStart(12)}`);
  console.log(`  Net Ending:       $${result.netEndingBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(12)}`);
  console.log(`  Total Net Yield: +$${result.totalNetYieldUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(12)}`);
  console.log(`  Blended Net APY:  ${result.blendedNetApyPercent.toFixed(4).padStart(11)}%`);
  console.log(`================================================================`);
}

main().catch(err => {
  console.error('✗ Execution error:', err);
  process.exit(1);
});
