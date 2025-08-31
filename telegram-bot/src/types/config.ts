import { Address } from "viem";

export interface Config {
  telegramBotToken: string;
  quicknodeRpc: string;
  walletEncryptionKey: string;
  dbPath?: string;
  chainId: number;
  defaultSlippage: number;
  defaultRiskLevel: number;
  defiGardenApiUrl?: string;
}

export interface UserSettings {
  userId: string;
  riskLevel: number; // 1-5 scale (1=safest, 5=highest risk)
  slippage: number;
  autoCompound: boolean; // Auto-compound yields
  minApy: number; // Minimum acceptable APY
}

// DeFi Pool Information
export interface PoolInfo {
  poolId: string;
  protocol: string;
  chain: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  riskScore: number;
  address: Address;
  underlyingToken: Address;
  auditor?: string;
  trackRecord?: string;
  risks: string[];
}

// User's DeFi Position
export interface Position {
  id: string;
  userId: string;
  poolId: string;
  protocol: string;
  chain: string;
  tokenSymbol: string;
  amountInvested: number;
  currentValue: number;
  entryApy: number;
  currentApy: number;
  yieldEarned: number;
  txHash: string;
  createdAt: Date;
  lastUpdated: Date;
}

// Yield Opportunity from DeFi Garden API
export interface YieldOpportunity {
  poolId: string;
  project: string;
  chain: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  ilRisk: string;
  exposure: string;
  predictions?: {
    predictedClass: string;
    predictedProbability: number;
    binnedConfidence: number;
  };
  underlyingTokens?: string[];
  rewardTokens?: string[];
  riskScore?: number;
  protocol?: string;
}

// Gas price information
export interface GasPriceInfo {
  confidence: number;
  price: number;
  maxFeePerGas: number;
  maxPriorityFeePerGas: number;
}

export interface BlockPrice {
  estimatedPrices: GasPriceInfo[];
  baseFeePerGas?: number;
}

export interface BlockPrices {
  blockPrices: BlockPrice[];
  system?: string;
  network?: string;
  unit?: string;
}

// 1inch API response types
export interface SwapResponse {
  data: {
    to: Address;
    data: string;
    value: string;
    gasPrice: string;
  };
}

export interface QuoteResponse {
  data: {
    toTokenAmount: string;
    estimatedGas: string;
  };
}

// Token information
export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
  balance: string;
  usd?: number;
}

export interface JsonRpcResponse<T> {
  data?: T;
  result?: T;
  error?: {
    message: string;
    code: number;
  };
  id: number;
  jsonrpc: string;
}