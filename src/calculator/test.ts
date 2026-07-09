import assert from 'assert';
import { calculateBlendedYield, calculateGasFeeUsd } from './engine.js';
import { CalculatorInput, DefiLlamaPool, GasOracleData } from './interfaces.js';

// Setup Mock Data
const MOCK_POOLS: DefiLlamaPool[] = [
  {
    pool: 'pool-eth-usdc',
    chain: 'Ethereum',
    project: 'aave-v3',
    symbol: 'USDC',
    tvlUsd: 500000000,
    apy: 5.5 // 5.5% APY
  },
  {
    pool: 'pool-base-usdc',
    chain: 'Base',
    project: 'morpho-blue',
    symbol: 'USDC',
    tvlUsd: 120000000,
    apy: 8.0 // 8.0% APY
  },
  {
    pool: 'pool-sol-usdc',
    chain: 'Solana',
    project: 'kamino',
    symbol: 'USDC',
    tvlUsd: 300000000,
    apy: 12.0 // 12.0% APY
  }
];

const MOCK_GAS_ORACLE: Record<string, GasOracleData> = {
  Ethereum: {
    chain: 'Ethereum',
    gasPriceGwei: 20, // 20 gwei
    nativeTokenPriceUsd: 3000, // $3000 ETH
    estimatedGasLimit: {
      approve: 45000,
      deposit: 150000,
      withdraw: 150000,
      claimRewards: 100000,
      bridge: 120000
    }
  },
  Base: {
    chain: 'Base',
    gasPriceGwei: 0.1, // 0.1 gwei (very cheap)
    nativeTokenPriceUsd: 3000, // $3000 ETH
    estimatedGasLimit: {
      approve: 45000,
      deposit: 150000,
      withdraw: 150000,
      claimRewards: 100000,
      bridge: 120000
    }
  },
  Solana: {
    chain: 'Solana',
    gasPriceGwei: 0, // Solana uses lamports, not gwei
    nativeTokenPriceUsd: 140, // $140 SOL
    estimatedGasLimit: {
      approve: 0,
      deposit: 0,
      withdraw: 0,
      claimRewards: 0,
      bridge: 0
    },
    flatTxFeeUsd: 0.01 // Flat transaction fee of 1 cent on Solana
  }
};

const DEFAULT_SLIPPAGE = {
  defaultBridgeSlippagePercent: 0.1, // 0.1%
  defaultSwapSlippagePercent: 0.05, // 0.05%
  chainSpecificSlippagePercent: {
    Solana: 0.2 // Higher slippage on Solana swaps
  }
};

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message || err}`);
  }
}

console.log('--- RUNNING stablecoin yield calculator engine tests ---');

// Test 1: Gas calculator helper
runTest('calculateGasFeeUsd parses EVM and non-EVM flat fees correctly', () => {
  // Ethereum deposit: 150000 gas * 20 gwei * 1e-9 * $3000 = $9.00
  const ethFee = calculateGasFeeUsd(MOCK_GAS_ORACLE.Ethereum, 'deposit');
  assert.strictEqual(ethFee, 9.00);

  // Base approval: 45000 gas * 0.1 gwei * 1e-9 * $3000 = $0.0135
  const baseFee = calculateGasFeeUsd(MOCK_GAS_ORACLE.Base, 'approve');
  assert.ok(Math.abs(baseFee - 0.0135) < 0.0001);

  // Solana deposit: flat USD fee = $0.01
  const solFee = calculateGasFeeUsd(MOCK_GAS_ORACLE.Solana, 'deposit');
  assert.strictEqual(solFee, 0.01);
});

// Test 2: Simple interest calculation with zero fees and zero slippage
runTest('simple interest calculation with zero fees and zero slippage', () => {
  // Create gas oracle with zero fees
  const zeroGasOracle = JSON.parse(JSON.stringify(MOCK_GAS_ORACLE));
  for (const chain in zeroGasOracle) {
    zeroGasOracle[chain].gasPriceGwei = 0;
    zeroGasOracle[chain].flatTxFeeUsd = 0;
  }

  const input: CalculatorInput = {
    principalUsd: 10000,
    durationDays: 365,
    sourceChain: 'Ethereum',
    allocations: [
      { poolId: 'pool-eth-usdc', allocationPercentage: 100 }
    ],
    pools: MOCK_POOLS,
    gasOracle: zeroGasOracle,
    slippageConfig: {
      defaultBridgeSlippagePercent: 0,
      defaultSwapSlippagePercent: 0
    },
    compoundingFrequency: 'simple',
    isAutoCompounding: false
  };

  const result = calculateBlendedYield(input);
  
  assert.strictEqual(result.totalSlippagePaidUsd, 0);
  assert.strictEqual(result.totalGasPaidUsd, 0);
  assert.strictEqual(result.netEndingBalanceUsd, 10550); // 10000 * (1 + 5.5% APY * 1 year) = 10550
  assert.strictEqual(result.totalNetYieldUsd, 550);
  assert.ok(Math.abs(result.blendedNetApyPercent - 5.5) < 0.001);
});

// Test 3: Compounding calculation (daily), zero fees/slippage
runTest('compounding interest (daily) with zero fees and zero slippage', () => {
  const zeroGasOracle = JSON.parse(JSON.stringify(MOCK_GAS_ORACLE));
  for (const chain in zeroGasOracle) {
    zeroGasOracle[chain].gasPriceGwei = 0;
    zeroGasOracle[chain].flatTxFeeUsd = 0;
  }

  const input: CalculatorInput = {
    principalUsd: 10000,
    durationDays: 365,
    sourceChain: 'Ethereum',
    allocations: [
      { poolId: 'pool-eth-usdc', allocationPercentage: 100 }
    ],
    pools: MOCK_POOLS,
    gasOracle: zeroGasOracle,
    slippageConfig: {
      defaultBridgeSlippagePercent: 0,
      defaultSwapSlippagePercent: 0
    },
    compoundingFrequency: 'daily',
    isAutoCompounding: true // Auto-compounding vault
  };

  const result = calculateBlendedYield(input);
  
  // Formula: P * (1 + r/365)^365
  const expected = 10000 * Math.pow(1 + 0.055 / 365, 365);
  assert.ok(Math.abs(result.netEndingBalanceUsd - expected) < 0.01, `Expected ${expected} but got ${result.netEndingBalanceUsd}`);
  assert.ok(result.blendedNetApyPercent > 5.5, 'Compounded APY should exceed simple APY');
});

// Test 4: Slippage deduction
runTest('slippage is correctly deducted on entry', () => {
  const zeroGasOracle = JSON.parse(JSON.stringify(MOCK_GAS_ORACLE));
  for (const chain in zeroGasOracle) {
    zeroGasOracle[chain].gasPriceGwei = 0;
    zeroGasOracle[chain].flatTxFeeUsd = 0;
  }

  const input: CalculatorInput = {
    principalUsd: 10000,
    durationDays: 365,
    sourceChain: 'Ethereum',
    allocations: [
      { poolId: 'pool-eth-usdc', allocationPercentage: 100 }
    ],
    pools: MOCK_POOLS,
    gasOracle: zeroGasOracle,
    slippageConfig: {
      defaultBridgeSlippagePercent: 0.1, // Not bridged since Ethereum -> Ethereum
      defaultSwapSlippagePercent: 0.5 // 0.5% swap slippage
    },
    compoundingFrequency: 'simple',
    isAutoCompounding: false
  };

  const result = calculateBlendedYield(input);
  
  // 10000 * 0.5% = $50 slippage
  assert.strictEqual(result.totalSlippagePaidUsd, 50);
  assert.strictEqual(result.poolResults[0].startingPrincipalUsd, 9950);
  // Yield: 9950 * 5.5% = 547.25
  // Final Balance: 9950 + 547.25 = 10497.25
  assert.ok(Math.abs(result.netEndingBalanceUsd - 10497.25) < 0.01, `Got ${result.netEndingBalanceUsd}`);
});

// Test 5: Cross-chain gas fees and bridging slippage
runTest('cross-chain transaction costs and bridging slippage are computed', () => {
  // Bridge Ethereum to Base
  const input: CalculatorInput = {
    principalUsd: 10000,
    durationDays: 365,
    sourceChain: 'Ethereum',
    allocations: [
      { poolId: 'pool-base-usdc', allocationPercentage: 100 }
    ],
    pools: MOCK_POOLS,
    gasOracle: MOCK_GAS_ORACLE,
    slippageConfig: DEFAULT_SLIPPAGE,
    compoundingFrequency: 'simple',
    isAutoCompounding: false
  };

  const result = calculateBlendedYield(input);
  const poolRes = result.poolResults[0];

  // 1. Slippage: cross-chain from Ethereum to Base.
  // bridge slippage 0.1% + swap slippage 0.05% = 0.15%
  // 10000 * 0.15% = $15
  assert.ok(Math.abs(result.totalSlippagePaidUsd - 15) < 0.0001);

  // 2. Entry Gas Fees:
  // Paid on Ethereum (source): bridge gas = 120000 gas * 20 gwei * 1e-9 * $3000 ETH = $7.20
  // Paid on Base (target): approve = 45000 gas * 0.1 gwei * $3000 ETH = $0.0135
  // Paid on Base (target): deposit = 150000 gas * 0.1 gwei * $3000 ETH = $0.045
  // Total entry gas = 7.20 + 0.0135 + 0.045 = 7.2585
  assert.ok(Math.abs(poolRes.entryGasPaidUsd - 7.2585) < 0.0001);

  // Starting Principal = 10000 - 15 (slippage) - 7.2585 (gas) = 9977.7415
  assert.ok(Math.abs(poolRes.startingPrincipalUsd - 9977.7415) < 0.0001);

  // 3. Simple Interest:
  // Gross end balance = 9977.7415 * (1 + 8.0% APY * 1 year) = 10775.96082
  assert.ok(Math.abs(poolRes.grossEndingBalanceUsd - 10775.96082) < 0.01);

  // 4. Exit Gas Fee:
  // Paid on Base (target): withdraw = 150000 gas * 0.1 gwei * $3000 ETH = $0.045
  assert.ok(Math.abs(poolRes.exitGasPaidUsd - 0.045) < 0.0001);

  // 5. Net Ending Balance = 10775.96082 - 0.045 = 10775.91582
  assert.ok(Math.abs(result.netEndingBalanceUsd - 10775.91582) < 0.01);
});

// Test 6: Extreme gas fee exceeding principal / unprofitable pool
runTest('extreme gas fee completely consumes small allocation', () => {
  const input: CalculatorInput = {
    principalUsd: 10, // Only $10 initial investment
    durationDays: 365,
    sourceChain: 'Ethereum',
    allocations: [
      { poolId: 'pool-eth-usdc', allocationPercentage: 100 }
    ],
    pools: MOCK_POOLS,
    gasOracle: MOCK_GAS_ORACLE, // Ethereum gas fees are high (~$11.7 entry fee)
    slippageConfig: DEFAULT_SLIPPAGE,
    compoundingFrequency: 'simple',
    isAutoCompounding: false
  };

  const result = calculateBlendedYield(input);
  
  assert.strictEqual(result.unprofitablePoolsCount, 1);
  assert.strictEqual(result.netEndingBalanceUsd, 0);
  assert.strictEqual(result.poolResults[0].startingPrincipalUsd, 0);
  assert.ok(result.poolResults[0].warning?.includes('completely consumed'));
});

// Test 7: Manual compounding position drainage
runTest('unprofitable manual compounding is warned and can drain position', () => {
  // Let's compound weekly (52 times) manually on Ethereum where gas is expensive
  const input: CalculatorInput = {
    principalUsd: 100, // Small principal
    durationDays: 365,
    sourceChain: 'Ethereum',
    allocations: [
      { poolId: 'pool-eth-usdc', allocationPercentage: 100 }
    ],
    pools: MOCK_POOLS,
    gasOracle: MOCK_GAS_ORACLE, // weekly claim rewards on Ethereum will cost ~ $6.00 gas per event
    slippageConfig: DEFAULT_SLIPPAGE,
    compoundingFrequency: 'weekly',
    isAutoCompounding: false // Manual compounding
  };

  const result = calculateBlendedYield(input);
  
  assert.strictEqual(result.netEndingBalanceUsd, 0);
  assert.strictEqual(result.unprofitablePoolsCount, 1);
  assert.ok(result.poolResults[0].warning?.includes('completely drained') || result.poolResults[0].warning?.includes('gas cost exceeds'));
});

// Test 8: Non-EVM flat fee fallback
runTest('non-EVM chain uses flat transaction fees correctly', () => {
  const input: CalculatorInput = {
    principalUsd: 1000,
    durationDays: 365,
    sourceChain: 'Solana',
    allocations: [
      { poolId: 'pool-sol-usdc', allocationPercentage: 100 }
    ],
    pools: MOCK_POOLS,
    gasOracle: MOCK_GAS_ORACLE,
    slippageConfig: DEFAULT_SLIPPAGE, // Solana slippage override is 0.2%
    compoundingFrequency: 'simple',
    isAutoCompounding: false
  };

  const result = calculateBlendedYield(input);
  const poolRes = result.poolResults[0];

  // Slippage: 1000 * 0.2% = $2
  assert.strictEqual(result.totalSlippagePaidUsd, 2);

  // Gas: Solana uses flat fees!
  // Entry gas (approve + deposit on Solana) = 0.01 + 0.01 = 0.02
  assert.strictEqual(poolRes.entryGasPaidUsd, 0.02);

  // Starting Principal = 1000 - 2 (slippage) - 0.02 (gas) = 997.98
  assert.strictEqual(poolRes.startingPrincipalUsd, 997.98);

  // Exit gas = 0.01
  assert.strictEqual(poolRes.exitGasPaidUsd, 0.01);
});

// Test 9: Blended multi-chain diversification
runTest('blended yield calculation over multiple pools on different chains', () => {
  const input: CalculatorInput = {
    principalUsd: 10000,
    durationDays: 180, // Half a year
    sourceChain: 'Ethereum',
    allocations: [
      { poolId: 'pool-eth-usdc', allocationPercentage: 60 }, // $6000 on Ethereum
      { poolId: 'pool-sol-usdc', allocationPercentage: 40 }  // $4000 on Solana (bridged)
    ],
    pools: MOCK_POOLS,
    gasOracle: MOCK_GAS_ORACLE,
    slippageConfig: DEFAULT_SLIPPAGE,
    compoundingFrequency: 'monthly',
    isAutoCompounding: true // Auto-compounded vaults
  };

  const result = calculateBlendedYield(input);

  assert.strictEqual(result.poolResults.length, 2);
  assert.strictEqual(result.initialPrincipalUsd, 10000);
  assert.ok(result.totalSlippagePaidUsd > 0);
  assert.ok(result.totalGasPaidUsd > 0);
  assert.ok(result.netEndingBalanceUsd > 10000);
  assert.ok(result.totalNetYieldUsd > 0);
  assert.ok(result.blendedNetApyPercent > 0);
});

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed successfully!');
}
