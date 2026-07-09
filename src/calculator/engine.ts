import {
  CalculatorInput,
  BlendedCalculationResult,
  PoolCalculationResult,
  GasOracleData,
  EstimatedGasLimit,
  DefiLlamaPool
} from './interfaces.js';

/**
 * Calculates gas fee in USD for a specific transaction type on a given chain.
 */
export function calculateGasFeeUsd(
  oracle: GasOracleData | undefined,
  txType: keyof EstimatedGasLimit
): number {
  if (!oracle) return 0;
  
  // If a flat USD transaction fee is specified, use it as fallback/standard
  if (oracle.flatTxFeeUsd !== undefined) {
    return oracle.flatTxFeeUsd;
  }
  
  const limit = oracle.estimatedGasLimit[txType] || 0;
  // gasPriceGwei * 10^-9 gives gas price in ether/native unit
  const priceNative = oracle.gasPriceGwei * 1e-9;
  return limit * priceNative * oracle.nativeTokenPriceUsd;
}

/**
 * Computes true net-yields for multi-chain stablecoins by factoring in gas fees,
 * bridging slippage, and compounding frequencies.
 */
export function calculateBlendedYield(input: CalculatorInput): BlendedCalculationResult {
  const {
    principalUsd,
    durationDays,
    sourceChain,
    allocations,
    pools,
    gasOracle,
    slippageConfig,
    compoundingFrequency,
    isAutoCompounding,
    performanceFeePercent = 0
  } = input;

  if (principalUsd <= 0) {
    throw new Error('Principal must be greater than zero');
  }
  if (durationDays <= 0) {
    throw new Error('Duration must be greater than zero');
  }

  // Verify allocations sum to approximately 100%
  const totalAllocation = allocations.reduce((sum, a) => sum + a.allocationPercentage, 0);
  if (Math.abs(totalAllocation - 100) > 0.01) {
    throw new Error(`Allocations must sum to 100%, currently they sum to ${totalAllocation}%`);
  }

  const durationYears = durationDays / 365;

  // Determine compounding periods per year
  let compoundsPerYear = 0;
  switch (compoundingFrequency) {
    case 'simple':
      compoundsPerYear = 0;
      break;
    case 'daily':
      compoundsPerYear = 365;
      break;
    case 'weekly':
      compoundsPerYear = 52;
      break;
    case 'monthly':
      compoundsPerYear = 12;
      break;
    case 'quarterly':
      compoundsPerYear = 4;
      break;
    case 'annually':
      compoundsPerYear = 1;
      break;
  }

  const totalCompoundingPeriods = compoundsPerYear > 0 
    ? Math.floor(compoundsPerYear * durationYears) 
    : 0;

  const poolResults: PoolCalculationResult[] = [];
  let unprofitablePoolsCount = 0;
  let totalEndingBalanceUsd = 0;
  let totalGasPaidUsd = 0;
  let totalSlippagePaidUsd = 0;

  for (const allocation of allocations) {
    const pool = pools.find(p => p.pool === allocation.poolId);
    if (!pool) {
      throw new Error(`Pool with ID ${allocation.poolId} not found in pools list`);
    }

    const allocatedPrincipalUsd = principalUsd * (allocation.allocationPercentage / 100);
    const targetChain = pool.chain;
    const isCrossChain = sourceChain.toLowerCase() !== targetChain.toLowerCase();

    // 1. Calculate Slippage
    let slippagePercent = slippageConfig.defaultSwapSlippagePercent;
    if (isCrossChain) {
      slippagePercent += slippageConfig.defaultBridgeSlippagePercent;
    }
    
    // Check for chain-specific slippage overrides
    if (slippageConfig.chainSpecificSlippagePercent) {
      if (slippageConfig.chainSpecificSlippagePercent[targetChain]) {
        slippagePercent = slippageConfig.chainSpecificSlippagePercent[targetChain];
      }
    }

    const slippagePaidUsd = allocatedPrincipalUsd * (slippagePercent / 100);
    const principalAfterSlippage = allocatedPrincipalUsd - slippagePaidUsd;

    // 2. Calculate Entry Gas Fees
    const sourceOracle = gasOracle[sourceChain];
    const targetOracle = gasOracle[targetChain];

    let entryGasPaidUsd = 0;
    let bridgeGasUsd = 0;
    
    if (isCrossChain) {
      // Cross-chain requires bridging gas on source chain + approval and deposit on target chain
      bridgeGasUsd = calculateGasFeeUsd(sourceOracle, 'bridge');
      const approveGasUsd = calculateGasFeeUsd(targetOracle, 'approve');
      const depositGasUsd = calculateGasFeeUsd(targetOracle, 'deposit');
      entryGasPaidUsd = bridgeGasUsd + approveGasUsd + depositGasUsd;
    } else {
      // Same-chain requires approval and deposit gas on source chain
      const approveGasUsd = calculateGasFeeUsd(sourceOracle, 'approve');
      const depositGasUsd = calculateGasFeeUsd(sourceOracle, 'deposit');
      entryGasPaidUsd = approveGasUsd + depositGasUsd;
    }

    const startingPrincipalUsd = Math.max(0, principalAfterSlippage - entryGasPaidUsd);
    let warning: string | undefined;

    if (startingPrincipalUsd === 0) {
      warning = 'allocated principal completely consumed by entry costs and slippage';
      unprofitablePoolsCount++;
      poolResults.push({
        poolId: pool.pool,
        chain: pool.chain,
        project: pool.project,
        symbol: pool.symbol,
        allocatedPrincipalUsd,
        slippagePaidUsd,
        entryGasPaidUsd,
        startingPrincipalUsd: 0,
        grossEndingBalanceUsd: 0,
        accruedYieldUsd: 0,
        exitGasPaidUsd: 0,
        compoundingGasPaidUsd: 0,
        compoundingEventsCount: 0,
        netEndingBalanceUsd: 0,
        netYieldUsd: -allocatedPrincipalUsd,
        netApyPercent: -100,
        warning
      });
      totalGasPaidUsd += entryGasPaidUsd;
      totalSlippagePaidUsd += slippagePaidUsd;
      continue;
    }

    // 3. Compounding & Yield Calculation
    const poolRawApy = pool.apy !== undefined 
      ? pool.apy 
      : ((pool.apyBase || 0) + (pool.apyReward || 0));
    
    const r = poolRawApy / 100;

    let grossEndingBalanceUsd = startingPrincipalUsd;
    let compoundingGasPaidUsd = 0;
    let compoundingEventsCount = 0;

    if (compoundsPerYear === 0) {
      // Simple Interest Formula
      grossEndingBalanceUsd = startingPrincipalUsd * (1 + r * durationYears);
    } else {
      // Compounding Interest
      if (isAutoCompounding) {
        // Vault auto-compounding: user pays 0 gas, but we factor in potential performance fees
        const endBalanceWithNoFee = startingPrincipalUsd * Math.pow(1 + r / compoundsPerYear, totalCompoundingPeriods);
        const grossYield = endBalanceWithNoFee - startingPrincipalUsd;
        
        if (grossYield > 0 && performanceFeePercent > 0) {
          const feePaid = grossYield * (performanceFeePercent / 100);
          grossEndingBalanceUsd = startingPrincipalUsd + (grossYield - feePaid);
        } else {
          grossEndingBalanceUsd = endBalanceWithNoFee;
        }
      } else {
        // Manual compounding: user triggers compound transaction and pays gas per compounding event
        const compoundGasFeeUsd = calculateGasFeeUsd(targetOracle, 'claimRewards');
        
        let currentBalance = startingPrincipalUsd;
        const ratePerPeriod = r / compoundsPerYear;
        
        let unprofitableCompoundingLogged = false;

        for (let period = 1; period <= totalCompoundingPeriods; period++) {
          const interestEarned = currentBalance * ratePerPeriod;
          
          if (interestEarned <= compoundGasFeeUsd && !unprofitableCompoundingLogged) {
            warning = 'manual compounding gas cost exceeds interest earned per period';
            unprofitableCompoundingLogged = true;
          }

          const nextBalance = currentBalance + interestEarned - compoundGasFeeUsd;
          
          if (nextBalance <= 0) {
            currentBalance = 0;
            warning = 'position completely drained by manual compounding gas fees';
            break;
          }
          
          currentBalance = nextBalance;
          compoundingGasPaidUsd += compoundGasFeeUsd;
          compoundingEventsCount++;
        }
        
        grossEndingBalanceUsd = currentBalance;
      }
    }

    // 4. Calculate Exit Gas Fees
    const exitGasPaidUsd = calculateGasFeeUsd(targetOracle, 'withdraw');
    const netEndingBalanceUsd = Math.max(0, grossEndingBalanceUsd - exitGasPaidUsd);

    // Calculate yield metrics
    const totalCosts = slippagePaidUsd + entryGasPaidUsd + compoundingGasPaidUsd + exitGasPaidUsd;
    const netYieldUsd = netEndingBalanceUsd - allocatedPrincipalUsd;
    
    // Accrued yield before subtracting transaction gas (for transparency)
    const rawYieldEarned = Math.max(0, grossEndingBalanceUsd - startingPrincipalUsd + compoundingGasPaidUsd);

    if (netYieldUsd < 0 && !warning) {
      warning = 'net yield is negative after factoring in fees and slippage';
    }

    if (netYieldUsd < 0) {
      unprofitablePoolsCount++;
    }

    // Annualized Net APY Calculation
    // APY = (Ending Balance / Starting Principal) ^ (365 / days) - 1
    let netApyPercent = -100;
    if (netEndingBalanceUsd > 0) {
      netApyPercent = (Math.pow(netEndingBalanceUsd / allocatedPrincipalUsd, 365 / durationDays) - 1) * 100;
    }

    poolResults.push({
      poolId: pool.pool,
      chain: pool.chain,
      project: pool.project,
      symbol: pool.symbol,
      allocatedPrincipalUsd,
      slippagePaidUsd,
      entryGasPaidUsd,
      startingPrincipalUsd,
      grossEndingBalanceUsd,
      accruedYieldUsd: rawYieldEarned,
      exitGasPaidUsd,
      compoundingGasPaidUsd,
      compoundingEventsCount,
      netEndingBalanceUsd,
      netYieldUsd,
      netApyPercent,
      warning
    });

    totalEndingBalanceUsd += netEndingBalanceUsd;
    totalGasPaidUsd += entryGasPaidUsd + compoundingGasPaidUsd + exitGasPaidUsd;
    totalSlippagePaidUsd += slippagePaidUsd;
  }

  // Calculate blended net APY
  let blendedNetApyPercent = -100;
  if (totalEndingBalanceUsd > 0) {
    blendedNetApyPercent = (Math.pow(totalEndingBalanceUsd / principalUsd, 365 / durationDays) - 1) * 100;
  }

  const totalNetYieldUsd = totalEndingBalanceUsd - principalUsd;

  return {
    initialPrincipalUsd: principalUsd,
    netEndingBalanceUsd: totalEndingBalanceUsd,
    totalNetYieldUsd,
    blendedNetApyPercent,
    totalGasPaidUsd,
    totalSlippagePaidUsd,
    poolResults,
    unprofitablePoolsCount
  };
}
