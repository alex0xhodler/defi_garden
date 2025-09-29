"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.URLS = exports.TIME_CONSTANTS = exports.RISK_LEVELS = exports.INDEX_DISPLAY = exports.INDEX_ERRORS = exports.INDEX_TRANSACTION_CONFIG = exports.ODOS_CONFIG = exports.INDEX_CATEGORY_CONFIGS = exports.BASE_TOKENS = exports.INDEX_CONTRACTS = void 0;
// Index-related contract addresses on Base network
exports.INDEX_CONTRACTS = {
    // Odos Router V3 for DEX aggregation and swaps on Base
    ODOS_ROUTER_V3: "0x0d05a7d3448512b78fa8a9e46c4872c88c4a0d05",
    // Known index tokens (add more as they become available)
    LCAP_TOKEN: "0x4da9a0f397db1397902070f93a4d6ddbc0e0e6e8", // Large Cap Index
    // Placeholder addresses for future index tokens
    DEFI_INDEX: "0x0000000000000000000000000000000000000001",
    EMERGING_INDEX: "0x0000000000000000000000000000000000000002",
    SECTOR_AI_INDEX: "0x0000000000000000000000000000000000000003",
};
// Base network token addresses (reusing from existing constants)
exports.BASE_TOKENS = {
    USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    WETH: "0x4200000000000000000000000000000000000006",
    cbBTC: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    DAI: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
    cbETH: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
};
// Index categories and their properties
exports.INDEX_CATEGORY_CONFIGS = {
    blue_chip: {
        minInvestment: 1, // $1 USDC minimum
        maxInvestment: 10000, // $10k USDC maximum per transaction
        defaultSlippage: 1.0, // 1%
        maxSlippage: 5.0, // 5%
        riskScore: 3, // Medium-low risk
        description: "Diversified basket of top cryptocurrency assets"
    },
    defi: {
        minInvestment: 1,
        maxInvestment: 5000,
        defaultSlippage: 2.0, // 2% (DeFi tokens more volatile)
        maxSlippage: 8.0,
        riskScore: 5, // Medium risk
        description: "Portfolio of leading DeFi protocol governance tokens"
    },
    emerging: {
        minInvestment: 1,
        maxInvestment: 2000, // Lower max due to higher risk
        defaultSlippage: 3.0, // 3% (emerging tokens very volatile)
        maxSlippage: 10.0,
        riskScore: 8, // High risk
        description: "High-growth potential tokens from new protocols"
    },
    sector: {
        minInvestment: 1,
        maxInvestment: 3000,
        defaultSlippage: 2.5, // 2.5%
        maxSlippage: 8.0,
        riskScore: 6, // Medium-high risk
        description: "Thematic exposure to specific crypto sectors"
    }
};
// Odos Router API configuration
exports.ODOS_CONFIG = {
    API_BASE_URL: "https://api.odos.xyz",
    QUOTE_ENDPOINT: "/sor/quote/v2",
    ASSEMBLE_ENDPOINT: "/sor/assemble",
    SWAP_ENDPOINT: "/sor/swap/v2",
    // Default parameters
    DEFAULT_SLIPPAGE: 1.0, // 1%
    MAX_SLIPPAGE: 10.0, // 10%
    DEFAULT_GAS_PRICE: "0.001", // 0.001 Gwei for Base
    // Rate limiting
    MAX_REQUESTS_PER_MINUTE: 60,
    REQUEST_TIMEOUT_MS: 30000, // 30 seconds
};
// Transaction settings
exports.INDEX_TRANSACTION_CONFIG = {
    // Gas settings for Base network
    DEFAULT_GAS_LIMIT: 500000n, // 500k gas limit
    MAX_GAS_LIMIT: 1000000n, // 1M gas limit max
    DEFAULT_GAS_PRICE: "0.001000000", // 0.001 Gwei in wei
    // Transaction timeouts
    APPROVAL_TIMEOUT_MS: 60000, // 1 minute for approval
    SWAP_TIMEOUT_MS: 120000, // 2 minutes for swap
    // Retry configuration
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 2000, // 2 seconds between retries
    // Balance check settings
    MIN_ETH_FOR_GAS: "0.0001", // Minimum ETH needed for gas (for non-gasless users)
    BALANCE_CHECK_BUFFER: 1.1, // 10% buffer on balance checks
};
// Error messages specific to index operations
exports.INDEX_ERRORS = {
    INSUFFICIENT_USDC: "❌ Insufficient USDC balance for this index purchase.",
    INSUFFICIENT_INDEX_TOKENS: "❌ Insufficient index tokens for this sale.",
    INVALID_AMOUNT: "❌ Please enter a valid amount (minimum $1 USDC).",
    INVALID_INDEX_TOKEN: "❌ Invalid index token selected.",
    INVALID_CATEGORY: "❌ Invalid index category selected.",
    ODOS_API_ERROR: "❌ Unable to get price quote. Please try again.",
    SLIPPAGE_TOO_HIGH: "❌ Price impact too high. Try a smaller amount or increase slippage tolerance.",
    NO_LIQUIDITY: "❌ Insufficient liquidity for this trade size.",
    TRANSACTION_FAILED: "❌ Transaction failed. Please try again.",
    NETWORK_ERROR: "❌ Network error. Please check your connection and try again.",
    NO_SMART_WALLET: "❌ Index token purchases require a Smart Wallet. Create one with /wallet",
    POSITION_NOT_FOUND: "❌ Index position not found.",
    NO_POSITIONS: "📊 You don't have any index token positions yet.",
};
// Display constants
exports.INDEX_DISPLAY = {
    // Emojis for different purposes
    EMOJIS: {
        INDEX: "📊",
        BUY: "🛒",
        SELL: "💵",
        PORTFOLIO: "💼",
        TREND_UP: "📈",
        TREND_DOWN: "📉",
        NEUTRAL: "➡️",
        WARNING: "⚠️",
        SUCCESS: "✅",
        ERROR: "❌",
        LOADING: "⏳",
        INFO: "ℹ️"
    },
    // Number formatting
    PRICE_DECIMALS: 4, // Show 4 decimal places for token prices
    BALANCE_DECIMALS: 6, // Show 6 decimal places for token balances
    USD_DECIMALS: 2, // Show 2 decimal places for USD values
    PERCENTAGE_DECIMALS: 2, // Show 2 decimal places for percentages
    // Display limits
    MAX_POSITIONS_IN_SUMMARY: 5, // Show max 5 positions in portfolio summary
    MAX_TRANSACTIONS_IN_HISTORY: 10, // Show max 10 transactions in history
    // Message length limits
    MAX_MESSAGE_LENGTH: 4000, // Telegram message limit
    MAX_DESCRIPTION_LENGTH: 200, // Max length for index descriptions
};
// Risk level mappings
exports.RISK_LEVELS = {
    1: { label: "Very Low", emoji: "🟢", color: "#4CAF50" },
    2: { label: "Low", emoji: "🟢", color: "#8BC34A" },
    3: { label: "Low-Medium", emoji: "🟡", color: "#FFEB3B" },
    4: { label: "Medium", emoji: "🟡", color: "#FFC107" },
    5: { label: "Medium", emoji: "🟠", color: "#FF9800" },
    6: { label: "Medium-High", emoji: "🟠", color: "#FF5722" },
    7: { label: "High", emoji: "🔴", color: "#F44336" },
    8: { label: "High", emoji: "🔴", color: "#E91E63" },
    9: { label: "Very High", emoji: "🔴", color: "#9C27B0" },
    10: { label: "Extreme", emoji: "⚫", color: "#795548" },
};
// Time constants
exports.TIME_CONSTANTS = {
    MINUTE_MS: 60 * 1000,
    HOUR_MS: 60 * 60 * 1000,
    DAY_MS: 24 * 60 * 60 * 1000,
    WEEK_MS: 7 * 24 * 60 * 60 * 1000,
    MONTH_MS: 30 * 24 * 60 * 60 * 1000,
    // Cache durations
    PRICE_CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    BALANCE_CACHE_DURATION: 30 * 1000, // 30 seconds
    COMPOSITION_CACHE_DURATION: 60 * 60 * 1000, // 1 hour
};
// URL constants
exports.URLS = {
    // Block explorers
    BASE_SCAN: "https://basescan.org",
    // DEX interfaces
    UNISWAP: "https://app.uniswap.org/#/swap",
    // Documentation
    ODOS_DOCS: "https://docs.odos.xyz",
    INDEX_DOCS: "https://docs.indexcoop.com", // Example
    // API endpoints
    COINGECKO_API: "https://api.coingecko.com/api/v3",
    DEFILLAMA_API: "https://api.llama.fi",
};
exports.default = {
    INDEX_CONTRACTS: exports.INDEX_CONTRACTS,
    BASE_TOKENS: exports.BASE_TOKENS,
    INDEX_CATEGORY_CONFIGS: exports.INDEX_CATEGORY_CONFIGS,
    ODOS_CONFIG: exports.ODOS_CONFIG,
    INDEX_TRANSACTION_CONFIG: exports.INDEX_TRANSACTION_CONFIG,
    INDEX_ERRORS: exports.INDEX_ERRORS,
    INDEX_DISPLAY: exports.INDEX_DISPLAY,
    RISK_LEVELS: exports.RISK_LEVELS,
    TIME_CONSTANTS: exports.TIME_CONSTANTS,
    URLS: exports.URLS
};
