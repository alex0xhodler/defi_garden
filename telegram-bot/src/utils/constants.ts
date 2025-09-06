import dotenv from "dotenv";
import { Address } from "viem";

dotenv.config();

// Endpoints
export const QUICKNODE_RPC_URL = process.env.QUICKNODE_RPC || "";

// Validate RPC configuration - check if proper RPC endpoint is configured
export const isRpcConfigured = (): boolean => {
  return !!(QUICKNODE_RPC_URL && 
           QUICKNODE_RPC_URL.length > 0 && 
           (QUICKNODE_RPC_URL.includes('quiknode.pro') || 
            QUICKNODE_RPC_URL.includes('alchemy.com') || 
            QUICKNODE_RPC_URL.includes('infura.io') ||
            QUICKNODE_RPC_URL.includes('drpc.org') ||
            QUICKNODE_RPC_URL.includes('api.developer.coinbase.com')));
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
  // Aave V3 aTokens on Base
  aUSDC: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
  // Fluid Finance fTokens on Base
  fUSDC: "0xf42f5795d9ac7e9d757db633d693cd548cfd9169",
  // Compound V3 cTokens on Base
  cUSDCv3: "0xb125e6687d4313864e53df431d5425969c15eb2f",
  // Compound V3 Rewards Contract on Base
  CometRewards: "0x123964802e6ababbe1bc9547d72ef1b69b00a6b1",
  // COMP Token on Base
  COMP: "0x9e1028f5f1d5ede59748ffcee5532509976840e0",
  // Morpho PYTH/USDC vault on Base  
  MORPHO_PYTH_USDC: "0x0fabfeacedf47e890c50c8120177fff69c6a1d9b",
};

// For compatibility with copied files
export const COMMON_TOKENS = BASE_TOKENS;
export const BASE_CHAIN_ID = DEFAULT_CHAIN_ID;

// Additional contract addresses for Morpho integration
export const MORPHO_CONTRACTS: Record<string, Address> = {
  // Main Morpho Blue contract
  MORPHO_BLUE: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb",
  // GeneralAdapter contract for multicall operations
  GENERAL_ADAPTER: "0xb98c948cfa24072e58935bc004a8a7b376ae746a",
  // Morpho PYTH/USDC MetaMorpho vault
  METAMORPHO_PYTH_USDC: "0x0fabfeacedf47e890c50c8120177fff69c6a1d9b",
  // Bundler contract (from transaction analysis)
  BUNDLER: "0x6bfd8137e702540e7a42b74178a4a49ba43920c4"
};

// DeFi Protocol addresses and info on Base
export const BASE_PROTOCOLS = {
  AAVE: {
    name: "Aave",
    riskScore: 1, // Very safe
    auditor: "Trail of Bits",
    website: "https://aave.com"
  },
  FLUID: {
    name: "Fluid",
    riskScore: 1, // Very safe - InstaDApp backed
    auditor: "Multiple",
    website: "https://fluid.instadapp.io"
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
  },
  MORPHO: {
    name: "Morpho",
    riskScore: 2,
    auditor: "Spearbit",
    website: "https://morpho.org"
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
  WITHDRAW: "Exit DeFi pools and get funds back to wallet",
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