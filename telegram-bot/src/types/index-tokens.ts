import { Address } from "viem";

// Index token categories
export type IndexCategory = 'blue_chip' | 'defi' | 'emerging' | 'sector';

// Index token metadata
export interface IndexToken {
  tokenId: string;
  symbol: string;
  name: string;
  category: IndexCategory;
  contractAddress: Address;
  chain: string;
  description?: string;
  riskLevel: number; // 1-10 scale
  isActive: boolean;
  createdAt: Date;
  lastUpdated: Date;
}

// Index composition - what underlying tokens make up the index
export interface IndexComposition {
  id: string;
  indexTokenId: string;
  underlyingToken: Address;
  underlyingSymbol: string;
  weightPercentage: number; // 0-100
  lastUpdated: Date;
}

// User's index position
export interface IndexPosition {
  id: string;
  userId: string;
  indexTokenId: string;
  tokensOwned: number;
  averageBuyPrice: number; // in USDC per token
  totalInvested: number; // Total USDC spent
  currentValue: number; // Current USD value
  firstPurchaseAt: Date;
  lastUpdatedAt: Date;
  
  // Joined data from index_tokens table
  symbol?: string;
  name?: string;
  contractAddress?: Address;
  category?: IndexCategory;
  riskLevel?: number;
}

// Index transaction record
export interface IndexTransaction {
  txHash: string;
  userId: string;
  indexTokenId: string;
  operationType: 'buy' | 'sell';
  usdcAmount: number; // Amount in USDC
  tokensAmount: number; // Index tokens received/sold
  pricePerToken: number; // USDC per index token at time of transaction
  gasUsed?: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: Date;
  
  // Joined data
  symbol?: string;
  name?: string;
}

// Balance information for display
export interface IndexBalanceInfo {
  tokenId: string;
  symbol: string;
  name: string;
  contractAddress: Address;
  balance: bigint; // Raw token balance
  balanceFormatted: string; // Human readable balance
  valueInUSDC: string; // Current USD value
  pricePerToken: number; // Current USDC price per token
  priceChange24h?: number; // 24h price change %
  category: IndexCategory;
  riskLevel: number;
}

// Portfolio stats for index positions
export interface IndexPortfolioStats {
  totalValue: number; // Total USD value
  totalInvested: number; // Total USDC invested
  totalPnL: number; // Total profit/loss
  positionCount: number; // Number of positions
}

// API response types for Odos Router
export interface OdosQuoteRequest {
  inputTokens: Array<{
    tokenAddress: Address;
    amount: string;
  }>;
  outputTokens: Array<{
    tokenAddress: Address;
    proportion: number;
  }>;
  userAddr: Address;
  slippageLimitPercent: number;
  sourceBlacklist?: string[];
  sourceWhitelist?: string[];
}

export interface OdosQuoteResponse {
  inTokens: Array<{
    tokenAddress: Address;
    amount: string;
  }>;
  outTokens: Array<{
    tokenAddress: Address;
    amount: string;
  }>;
  inAmounts: string[];
  outAmounts: string[];
  gasEstimate: number;
  dataGasEstimate: number;
  gweiPerGas: number;
  gasEstimateValue: number;
  inValues: number[];
  outValues: number[];
  netOutValue: number;
  priceImpact: number;
  percentDiff: number;
  partnerFeePercent: number;
  pathId: string;
  pathViz: any;
  blockNumber: number;
  transaction: {
    to: Address;
    value: string;
    data: `0x${string}`;
    gas: number;
    gasPrice: string;
  };
}

// Transaction execution result
export interface IndexTransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  tokensReceived?: string;
  pricePerToken?: number;
}

// Category display information
export interface IndexCategoryInfo {
  category: IndexCategory;
  displayName: string;
  description: string;
  emoji: string;
  riskRange: [number, number]; // [min, max] risk levels
  expectedReturn: string; // e.g., "8-12% annually"
}

// Constants for index categories
export const INDEX_CATEGORIES: Record<IndexCategory, IndexCategoryInfo> = {
  blue_chip: {
    category: 'blue_chip',
    displayName: 'Blue Chip Index',
    description: 'BTC, ETH, and major cryptocurrencies with proven track records',
    emoji: '🏛️',
    riskRange: [2, 4],
    expectedReturn: '6-10% annually'
  },
  defi: {
    category: 'defi',
    displayName: 'DeFi Protocol Index',
    description: 'Leading DeFi tokens like AAVE, UNI, COMP, and SUSHI',
    emoji: '🚀',
    riskRange: [4, 6],
    expectedReturn: '12-25% annually'
  },
  emerging: {
    category: 'emerging',
    displayName: 'Emerging Protocols',
    description: 'New protocols and Layer 2 tokens with high growth potential',
    emoji: '💎',
    riskRange: [7, 9],
    expectedReturn: '20-50% annually'
  },
  sector: {
    category: 'sector',
    displayName: 'Sector Rotation',
    description: 'Thematic investments in AI, Gaming, RWA, and trending sectors',
    emoji: '🌍',
    riskRange: [5, 8],
    expectedReturn: '15-35% annually'
  }
};

// Session data for index purchases
export interface IndexSessionData {
  selectedCategory?: IndexCategory;
  selectedIndexToken?: string;
  amount?: string;
  quoteData?: OdosQuoteResponse;
  confirmationStep?: boolean;
}

// Helper type for extended session data
export interface ExtendedTempData {
  // Existing fields
  selectedToken?: string;
  selectedPool?: string;
  poolInfo?: any;
  amount?: string;
  walletAddress?: string;
  
  // New index-related fields
  indexData?: IndexSessionData;
}