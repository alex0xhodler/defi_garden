import dotenv from "dotenv";
import { Address } from "viem";

dotenv.config();

// Endpoints
export const QUICKNODE_RPC_URL = process.env.QUICKNODE_RPC || "";

// Validate RPC configuration - use only the provided Alchemy endpoint
export const isRpcConfigured = (): boolean => {
  return QUICKNODE_RPC_URL === "https://base-mainnet.g.alchemy.com/v2/lk_ng-qu5hCuS7Hw12s5s";
};

export const DEFI_GARDEN_API_URL = process.env.DEFI_GARDEN_API_URL || "https://yields.llama.fi/pools";
export const ONEINCH_API_URL = "https://api.1inch.dev/swap/v5.2";
export const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || "";

// Supported chain IDs
export const SUPPORTED_CHAINS = {
  BASE: "8453",
  ETHEREUM: "1", 
  ARBITRUM: "42161",
  POLYGON: "137",
  OPTIMISM: "10"
};

// Default chain for v1
export const DEFAULT_CHAIN_ID = SUPPORTED_CHAINS.BASE;

// Native token (ETH) address representation
export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Common token addresses on Base (for v1)
export const BASE_TOKENS: Record<string, Address> = {
  ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  WETH: "0x4200000000000000000000000000000000000006",
  CBETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
};

// For compatibility with copied files
export const COMMON_TOKENS = BASE_TOKENS;
export const BASE_CHAIN_ID = DEFAULT_CHAIN_ID;

// DeFi Protocol addresses and info on Base
export const BASE_PROTOCOLS = {
  AAVE: {
    name: "Aave",
    riskScore: 1, // Very safe
    auditor: "Trail of Bits",
    website: "https://aave.com"
  },
  COMPOUND: {
    name: "Compound", 
    riskScore: 1,
    auditor: "OpenZeppelin",
    website: "https://compound.finance"
  },
  YEARN: {
    name: "Yearn",
    riskScore: 2,
    auditor: "Trail of Bits", 
    website: "https://yearn.fi"
  },
  PENDLE: {
    name: "Pendle",
    riskScore: 3,
    auditor: "Peckshield",
    website: "https://pendle.finance"
  }
};

// Risk scoring thresholds
export const RISK_THRESHOLDS = {
  TVL_SAFE: 100_000_000, // $100M+ for auto-deployment
  TVL_MINIMUM: 10_000_000, // $10M minimum even for manual
  APY_SUSPICIOUS: 100, // Flag APY over 100% as suspicious
  GAS_RATIO_MAX: 0.1, // Max 10% of investment can be gas
};

// Default user settings
export const DEFAULT_SETTINGS = {
  RISK_LEVEL: 3, // Medium risk (1-5 scale)
  SLIPPAGE: 1.0, // 1%
  AUTO_COMPOUND: true,
  MIN_APY: 5.0, // 5% minimum APY
};

// Gas settings (inherited from original)
export const GAS_PRIORITY = {
  low: 90,
  medium: 95, 
  high: 99,
};

// Default slippage tolerance (for compatibility)
export const DEFAULT_SLIPPAGE = 1.0; // 1%

// Timeouts
export const CONFIRMATION_TIMEOUT = 60000; // 1 minute
export const POSITION_UPDATE_INTERVAL = 300000; // 5 minutes

// Maximum approve amount
export const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

// Database configuration
export const DB_PATH = process.env.DB_PATH || "./defi-garden.sqlite";

// Database table names
export const DB_TABLES = {
  USERS: "users",
  WALLETS: "wallets", 
  SETTINGS: "settings",
  POSITIONS: "positions", // New for DeFi positions
  TRANSACTIONS: "transactions",
};

// Bot command descriptions
export const COMMANDS = {
  START: "Start bot and create/import wallet",
  WALLET: "View your wallet information", 
  BALANCE: "Check token balances",
  PORTFOLIO: "View DeFi positions and yields",
  ZAP: "Auto-deploy funds to best yield opportunities",
  HARVEST: "Claim yields and compound rewards",
  SETTINGS: "Adjust risk tolerance and preferences",
  DEPOSIT: "Show deposit address",
  WITHDRAW: "Withdraw funds to another address",
  HELP: "Show help and commands"
};

// Error messages
export const ERRORS = {
  NO_WALLET: "❌ You don't have a wallet yet. Use /start to create one.",
  INSUFFICIENT_BALANCE: "❌ Insufficient balance for this operation.",
  GAS_TOO_HIGH: "⛽ Gas cost is too high relative to your investment.",
  INVALID_AMOUNT: "❌ Invalid amount format. Please enter a positive number.",
  POSITION_NOT_FOUND: "❌ Position not found in your portfolio.",
  NETWORK_ERROR: "❌ Network error. Please try again later."
};