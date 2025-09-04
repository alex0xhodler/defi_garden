"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERRORS = exports.COMMANDS = exports.DB_TABLES = exports.DB_PATH = exports.MAX_UINT256 = exports.POSITION_UPDATE_INTERVAL = exports.CONFIRMATION_TIMEOUT = exports.DEFAULT_SLIPPAGE = exports.GAS_PRIORITY = exports.DEFAULT_SETTINGS = exports.RISK_THRESHOLDS = exports.BASE_PROTOCOLS = exports.BASE_CHAIN_ID = exports.COMMON_TOKENS = exports.BASE_TOKENS = exports.NATIVE_TOKEN_ADDRESS = exports.DEFAULT_CHAIN_ID = exports.SUPPORTED_CHAINS = exports.ENCRYPTION_KEY = exports.ONEINCH_API_URL = exports.DEFI_GARDEN_API_URL = exports.isRpcConfigured = exports.QUICKNODE_RPC_URL = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Endpoints
exports.QUICKNODE_RPC_URL = process.env.QUICKNODE_RPC || "";
// Validate RPC configuration - check if proper RPC endpoint is configured
const isRpcConfigured = () => {
    return !!(exports.QUICKNODE_RPC_URL &&
        exports.QUICKNODE_RPC_URL.length > 0 &&
        (exports.QUICKNODE_RPC_URL.includes('quiknode.pro') ||
            exports.QUICKNODE_RPC_URL.includes('alchemy.com') ||
            exports.QUICKNODE_RPC_URL.includes('infura.io') ||
            exports.QUICKNODE_RPC_URL.includes('drpc.org') ||
            exports.QUICKNODE_RPC_URL.includes('api.developer.coinbase.com')));
};
exports.isRpcConfigured = isRpcConfigured;
exports.DEFI_GARDEN_API_URL = process.env.DEFI_GARDEN_API_URL || "https://yields.llama.fi/pools";
exports.ONEINCH_API_URL = "https://api.1inch.dev/swap/v5.2";
exports.ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || "";
// Supported chain IDs
exports.SUPPORTED_CHAINS = {
    BASE: "8453",
    ETHEREUM: "1",
    ARBITRUM: "42161",
    POLYGON: "137",
    OPTIMISM: "10"
};
// Default chain for v1
exports.DEFAULT_CHAIN_ID = exports.SUPPORTED_CHAINS.BASE;
// Native token (ETH) address representation
exports.NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
// Common token addresses on Base (for v1)
exports.BASE_TOKENS = {
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
};
// For compatibility with copied files
exports.COMMON_TOKENS = exports.BASE_TOKENS;
exports.BASE_CHAIN_ID = exports.DEFAULT_CHAIN_ID;
// DeFi Protocol addresses and info on Base
exports.BASE_PROTOCOLS = {
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
    }
};
// Risk scoring thresholds
exports.RISK_THRESHOLDS = {
    TVL_SAFE: 100000000, // $100M+ for auto-deployment
    TVL_MINIMUM: 10000000, // $10M minimum even for manual
    APY_SUSPICIOUS: 100, // Flag APY over 100% as suspicious
    GAS_RATIO_MAX: 0.1, // Max 10% of investment can be gas
};
// Default user settings
exports.DEFAULT_SETTINGS = {
    RISK_LEVEL: 3, // Medium risk (1-5 scale)
    SLIPPAGE: 1.0, // 1%
    AUTO_COMPOUND: true,
    MIN_APY: 5.0, // 5% minimum APY
};
// Gas settings (inherited from original)
exports.GAS_PRIORITY = {
    low: 90,
    medium: 95,
    high: 99,
};
// Default slippage tolerance (for compatibility)
exports.DEFAULT_SLIPPAGE = 1.0; // 1%
// Timeouts
exports.CONFIRMATION_TIMEOUT = 60000; // 1 minute
exports.POSITION_UPDATE_INTERVAL = 300000; // 5 minutes
// Maximum approve amount
exports.MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
// Database configuration
exports.DB_PATH = process.env.DB_PATH || "./defi-garden.sqlite";
// Database table names
exports.DB_TABLES = {
    USERS: "users",
    WALLETS: "wallets",
    SETTINGS: "settings",
    POSITIONS: "positions", // New for DeFi positions
    TRANSACTIONS: "transactions",
};
// Bot command descriptions
exports.COMMANDS = {
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
exports.ERRORS = {
    NO_WALLET: "❌ You don't have a wallet yet. Use /start to create one.",
    INSUFFICIENT_BALANCE: "❌ Insufficient balance for this operation.",
    GAS_TOO_HIGH: "⛽ Gas cost is too high relative to your investment.",
    INVALID_AMOUNT: "❌ Invalid amount format. Please enter a positive number.",
    POSITION_NOT_FOUND: "❌ Position not found in your portfolio.",
    NETWORK_ERROR: "❌ Network error. Please try again later."
};
