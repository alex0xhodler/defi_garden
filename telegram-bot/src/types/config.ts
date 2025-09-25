import { Address } from "viem";

/**
 * Defines the structure for the main application configuration.
 */
export interface Config {
  /** The Telegram bot token from BotFather. */
  telegramBotToken: string;
  /** The RPC endpoint URL for the blockchain network. */
  quicknodeRpc: string;
  /** The secret key used for encrypting user wallet data. */
  walletEncryptionKey: string;
  /** The file path for the SQLite database. */
  dbPath?: string;
  /** The chain ID of the target network. */
  chainId: number;
  /** The default slippage tolerance for swaps. */
  defaultSlippage: number;
  /** The default risk level for new users. */
  defaultRiskLevel: number;
  /** The URL for the inkvest API (if used). */
  inkvestApiUrl?: string;
}

/**
 * Defines the structure for a user's personalized settings.
 */
export interface UserSettings {
  /** The unique identifier for the user. */
  userId: string;
  /** The user's risk tolerance on a 1-5 scale (1=safest, 5=highest risk). */
  riskLevel: number;
  /** The user's slippage tolerance percentage. */
  slippage: number;
  /** A flag indicating if yields should be auto-compounded. */
  autoCompound: boolean;
  /** The minimum APY a user is interested in. */
  minApy: number;
}

/**
 * Defines the structure for detailed information about a specific DeFi pool.
 */
export interface PoolInfo {
  /** A unique identifier for the pool. */
  poolId: string;
  /** The name of the DeFi protocol. */
  protocol: string;
  /** The blockchain the pool is on. */
  chain: string;
  /** The symbol of the underlying token. */
  symbol: string;
  /** The current Annual Percentage Yield. */
  apy: number;
  /** The Total Value Locked in USD. */
  tvlUsd: number;
  /** A calculated risk score for the pool. */
  riskScore: number;
  /** The contract address of the pool. */
  address: Address;
  /** The contract address of the underlying token. */
  underlyingToken: Address;
  /** The name of the auditing firm. */
  auditor?: string;
  /** Information about the protocol's track record. */
  trackRecord?: string;
  /** A list of identified risks associated with the pool. */
  risks: string[];
}

/**
 * Defines the structure for a user's active investment position in a DeFi pool.
 */
export interface Position {
  /** A unique identifier for the position. */
  id: string;
  /** The ID of the user who owns the position. */
  userId: string;
  /** The ID of the pool the position is in. */
  poolId: string;
  /** The name of the protocol. */
  protocol: string;
  /** The blockchain of the position. */
  chain: string;
  /** The symbol of the invested token. */
  tokenSymbol: string;
  /** The initial amount invested. */
  amountInvested: number;
  /** The current value of the position, including yield. */
  currentValue: number;
  /** The APY at the time of entry. */
  entryApy: number;
  /** The current APY of the position. */
  currentApy: number;
  /** The total yield earned by this position. */
  yieldEarned: number;
  /** The transaction hash of the investment. */
  txHash: string;
  /** The date the position was created. */
  createdAt: Date;
  /** The date the position was last updated. */
  lastUpdated: Date;
}

/**
 * Defines the structure for a yield opportunity, typically fetched from an external API like DeFiLlama.
 */
export interface YieldOpportunity {
  /** A unique identifier for the pool. */
  poolId: string;
  /** The name of the project/protocol. */
  project: string;
  /** The blockchain the pool is on. */
  chain: string;
  /** The symbol of the underlying token. */
  symbol: string;
  /** The Total Value Locked in USD. */
  tvlUsd: number;
  /** The total APY. */
  apy: number;
  /** The base APY from lending/borrowing interest. */
  apyBase: number;
  /** The APY from token rewards. */
  apyReward: number;
  /** The risk of impermanent loss. */
  ilRisk: string;
  /** The type of asset exposure (e.g., 'single'). */
  exposure: string;
  /** Predictions about future APY behavior. */
  predictions?: {
    predictedClass: string;
    predictedProbability: number;
    binnedConfidence: number;
  };
  /** The contract addresses of the underlying tokens. */
  underlyingTokens?: string[];
  /** The contract addresses of the reward tokens. */
  rewardTokens?: string[];
  /** A calculated risk score. */
  riskScore?: number;
  /** The protocol name. */
  protocol?: string;
}

/**
 * Defines the structure for gas price information.
 */
export interface GasPriceInfo {
  /** The confidence level for this gas price estimate. */
  confidence: number;
  /** The estimated price. */
  price: number;
  /** The maximum fee per gas in wei. */
  maxFeePerGas: number;
  /** The maximum priority fee per gas in wei. */
  maxPriorityFeePerGas: number;
}

/**
 * Defines the structure for gas price estimates for a specific block.
 */
export interface BlockPrice {
  /** An array of gas price estimates with different confidence levels. */
  estimatedPrices: GasPriceInfo[];
  /** The base fee per gas for the block. */
  baseFeePerGas?: number;
}

/**
 * Defines the structure for the overall response from a gas price API.
 */
export interface BlockPrices {
  /** An array of block price estimates. */
  blockPrices: BlockPrice[];
  /** The system used for the estimate. */
  system?: string;
  /** The network the estimate is for. */
  network?: string;
  /** The unit for the gas price. */
  unit?: string;
}

/**
 * Defines the structure for the data returned from a swap API call.
 */
export interface SwapResponse {
  data: {
    /** The address the transaction should be sent to. */
    to: Address;
    /** The encoded transaction data. */
    data: string;
    /** The amount of ETH to send with the transaction. */
    value: string;
    /** The recommended gas price. */
    gasPrice: string;
  };
}

/**
 * Defines the structure for the data returned from a quote API call.
 */
export interface QuoteResponse {
  data: {
    /** The estimated amount of the destination token to be received. */
    toTokenAmount: string;
    /** The estimated gas cost for the transaction. */
    estimatedGas: string;
  };
}

/**
 * Defines the structure for information about a specific token.
 */
export interface TokenInfo {
  /** The contract address of the token. */
  address: Address;
  /** The token's symbol (e.g., "USDC"). */
  symbol: string;
  /** The number of decimals the token uses. */
  decimals: number;
  /** The user's balance of this token. */
  balance: string;
  /** The current price of the token in USD. */
  usd?: number;
}

/**
 * Defines a generic structure for a JSON-RPC response.
 * @template T The type of the expected data or result.
 */
export interface JsonRpcResponse<T> {
  /** The response data (used by some APIs). */
  data?: T;
  /** The response result (standard for JSON-RPC). */
  result?: T;
  /** An error object if the request failed. */
  error?: {
    message: string;
    code: number;
  };
  /** The ID of the JSON-RPC request. */
  id: number;
  /** The JSON-RPC version string. */
  jsonrpc: string;
}