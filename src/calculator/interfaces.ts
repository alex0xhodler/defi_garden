/**
 * TypeScript interfaces for the multi-chain stablecoin yield calculator engine.
 * Supports DefiLlama API inputs, gas-estimation oracle data, and calculation outputs.
 */

export interface DefiLlamaPool {
  pool: string; // Unique UUID
  chain: string; // e.g., 'Ethereum', 'Base', 'Arbitrum', 'Solana'
  project: string; // e.g., 'aave-v3', 'morpho-blue'
  symbol: string; // e.g., 'USDC', 'USDT', 'USDS'
  tvlUsd: number;
  apy: number; // Combined APY
  apyBase?: number;
  apyReward?: number;
}

export interface EstimatedGasLimit {
  approve: number; // ERC20 approval gas limit (typically ~45,000)
  deposit: number; // Vault deposit gas limit (typically ~150,000 - 300,000)
  withdraw: number; // Vault withdraw gas limit (typically ~150,000 - 300,000)
  claimRewards: number; // Claim reward token gas limit (typically ~100,000)
  bridge: number; // Bridge transaction gas limit (typically ~100,000 - 150,000)
}

export interface GasOracleData {
  chain: string;
  gasPriceGwei: number; // EVM gas price in gwei (e.g., 15)
  nativeTokenPriceUsd: number; // Native asset price (e.g., ETH = $3000, SOL = $140)
  estimatedGasLimit: EstimatedGasLimit;
  flatTxFeeUsd?: number; // Optional flat USD fee fallback for non-EVM or L2s
}

export interface PoolAllocation {
  poolId: string; // Reference to DefiLlamaPool.pool
  allocationPercentage: number; // 0 to 100
}

export interface SlippageConfig {
  defaultBridgeSlippagePercent: number; // e.g., 0.1 for 0.1%
  defaultSwapSlippagePercent: number; // e.g., 0.05 for 0.05%
  chainSpecificSlippagePercent?: Record<string, number>; // e.g., { 'Ethereum': 0.05 }
}

export type CompoundingFrequency = 'simple' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';

export interface CalculatorInput {
  principalUsd: number; // Initial investment in USD (e.g., 10000)
  durationDays: number; // Period in days (e.g., 365)
  sourceChain: string; // Origin chain of funds (e.g., 'Ethereum')
  allocations: PoolAllocation[]; // Pool allocation splits
  pools: DefiLlamaPool[]; // Available pools from DefiLlama
  gasOracle: Record<string, GasOracleData>; // Gas data keyed by chain name (e.g., { 'Ethereum': ... })
  slippageConfig: SlippageConfig;
  compoundingFrequency: CompoundingFrequency;
  isAutoCompounding: boolean; // True = on-chain vault compounding (user pays zero gas for periodic compounds), False = manual user compounding (user pays gas)
  performanceFeePercent?: number; // Optional on-chain vault performance fee on yield (e.g., 5 for 5%)
}

export interface PoolCalculationResult {
  poolId: string;
  chain: string;
  project: string;
  symbol: string;
  allocatedPrincipalUsd: number; // $P_0$ allocated
  slippagePaidUsd: number; // Slippage cost
  entryGasPaidUsd: number; // Entry gas cost
  startingPrincipalUsd: number; // Net principal actually earning yield ($P_{start}$)
  grossEndingBalanceUsd: number; // Ending balance before exit fee
  accruedYieldUsd: number; // Raw yield earned
  exitGasPaidUsd: number; // Exit gas cost
  compoundingGasPaidUsd: number; // Gas paid for compounding (if manual)
  compoundingEventsCount: number; // Number of compounding events simulated
  netEndingBalanceUsd: number; // Net redeemable ending balance
  netYieldUsd: number; // Net profit/loss
  netApyPercent: number; // Actual annualized yield percentage
  warning?: string; // e.g., "gas fees exceed yield"
}

export interface BlendedCalculationResult {
  initialPrincipalUsd: number;
  netEndingBalanceUsd: number;
  totalNetYieldUsd: number;
  blendedNetApyPercent: number;
  totalGasPaidUsd: number;
  totalSlippagePaidUsd: number;
  poolResults: PoolCalculationResult[];
  unprofitablePoolsCount: number;
}
