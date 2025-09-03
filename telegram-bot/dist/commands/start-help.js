"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpHandler = exports.startHandler = void 0;
const grammy_1 = require("grammy");
const database_1 = require("../lib/database");
const coinbase_wallet_1 = require("../lib/coinbase-wallet");
const constants_1 = require("../utils/constants");
// Start handler with auto-wallet creation
exports.startHandler = {
    command: "start",
    description: "Start bot and begin earning",
    handler: async (ctx) => {
        try {
            const userId = ctx.from?.id.toString();
            const firstName = ctx.from?.first_name || "there";
            if (!userId) {
                await ctx.reply("❌ Unable to identify user. Please try again later.");
                return;
            }
            // Set user ID in session
            ctx.session.userId = userId;
            // Check if user already exists
            const existingUser = (0, database_1.getUserByTelegramId)(userId);
            if (!existingUser) {
                // New user - auto-create everything
                await ctx.reply(`👋 Hi ${firstName}! I'm inkvest, your personal yield farming companion.\n\nSetting up your inkvest account... 🦑`);
                // Register new user
                (0, database_1.createUser)(userId, userId, ctx.from?.username, ctx.from?.first_name, ctx.from?.last_name);
                // Create default DeFi settings
                (0, database_1.saveUserSettings)(userId, {
                    riskLevel: constants_1.DEFAULT_SETTINGS.RISK_LEVEL,
                    slippage: constants_1.DEFAULT_SETTINGS.SLIPPAGE,
                    autoCompound: constants_1.DEFAULT_SETTINGS.AUTO_COMPOUND,
                    minApy: constants_1.DEFAULT_SETTINGS.MIN_APY,
                });
                // Auto-create Coinbase Smart Wallet
                const wallet = await (0, coinbase_wallet_1.generateCoinbaseSmartWallet)(userId);
                // Set wallet in session
                ctx.session.walletAddress = wallet.address;
                // Start balance monitoring (legacy system for onboarding)
                (0, database_1.updateUserBalanceCheckTime)(userId);
                // Start 5-minute deposit monitoring window
                (0, database_1.startDepositMonitoring)(userId, 5);
                // Force refresh event monitor to immediately watch this new wallet
                try {
                    const eventMonitor = require("../services/event-monitor.js");
                    await eventMonitor.forceRefreshWallets();
                    console.log(`🔄 Started 5-minute deposit monitoring for new user ${userId}`);
                }
                catch (error) {
                    console.error("Could not force refresh wallets:", error);
                }
                // Get current APY
                const { getCompoundV3APY } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
                const apy = await getCompoundV3APY();
                // Check for deposit button - monitoring starts automatically
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("🔍 Check for Deposit", "manual_balance_check");
                await ctx.reply(`✨ *You're all set to earn ${apy}% APY on USDC!*\n\n` +
                    `💰 *Your inkvest address:*\n` +
                    `\`${wallet.address}\`\n\n` +
                    `Send USDC on Base ↑ to start earning.\n\n` +
                    `✅ Gasless transactions (we sponsor gas)\n` +
                    `✅ Auto-deployed to highest yields\n` +
                    `✅ Withdraw anytime, zero lock-ups\n\n` +
                    `I'll auto-deploy as soon as funds arrive! 🚀`, {
                    parse_mode: "Markdown",
                    reply_markup: keyboard,
                });
            }
            else {
                // Existing user - check if they have Coinbase Smart Wallet
                const wallet = await (async () => {
                    if ((0, coinbase_wallet_1.hasCoinbaseSmartWallet)(userId)) {
                        return await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
                    }
                    return null;
                })();
                // Get user settings
                const settings = (0, database_1.getUserSettings)(userId);
                if (settings) {
                    ctx.session.settings = settings;
                }
                if (!wallet) {
                    // User exists but no wallet - auto-create Coinbase Smart Wallet
                    await ctx.reply(`👋 Welcome back ${firstName}!\n\nSetting up your inkvest Smart Wallet... 🦑`);
                    // Auto-create Coinbase Smart Wallet
                    const newWallet = await (0, coinbase_wallet_1.generateCoinbaseSmartWallet)(userId);
                    // Set wallet in session
                    ctx.session.walletAddress = newWallet.address;
                    // Start balance monitoring
                    (0, database_1.updateUserBalanceCheckTime)(userId);
                    // Force refresh event monitor to immediately watch this new wallet
                    try {
                        const eventMonitor = require("../services/event-monitor.js");
                        await eventMonitor.forceRefreshWallets();
                    }
                    catch (error) {
                        console.error("Could not force refresh wallets:", error);
                    }
                    // Get current APY
                    const { getCompoundV3APY } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
                    const apy = await getCompoundV3APY();
                    // Check for deposit button - monitoring starts automatically
                    const keyboard = new grammy_1.InlineKeyboard()
                        .text("🔍 Check for Deposit", "manual_balance_check");
                    await ctx.reply(`✨ *You're all set to earn ${apy}% APY on USDC!*\n\n` +
                        `💰 *Your inkvest address:*\n` +
                        `\`${newWallet.address}\`\n\n` +
                        `Send USDC on Base ↑ to start earning.\n\n` +
                        `✅ Gasless transactions (we sponsor gas)\n` +
                        `✅ Auto-deployed to highest yields\n` +
                        `✅ Withdraw anytime, zero lock-ups\n\n` +
                        `I'll auto-deploy as soon as funds arrive! 🚀`, {
                        parse_mode: "Markdown",
                        reply_markup: keyboard,
                    });
                }
                else {
                    // Existing user with wallet - check if they have any funds
                    ctx.session.walletAddress = wallet.address;
                    // Check both wallet USDC balance and DeFi positions
                    const { getCoinbaseWalletUSDCBalance } = await Promise.resolve().then(() => __importStar(require("../lib/coinbase-wallet")));
                    const { getAaveBalance, getFluidBalance, getCompoundBalance } = await Promise.resolve().then(() => __importStar(require("../lib/token-wallet")));
                    try {
                        const [walletUsdc, aaveBalance, fluidBalance, compoundBalance] = await Promise.all([
                            getCoinbaseWalletUSDCBalance(wallet.address),
                            getAaveBalance(wallet.address),
                            getFluidBalance(wallet.address),
                            getCompoundBalance(wallet.address)
                        ]);
                        const walletUsdcNum = parseFloat(walletUsdc);
                        const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
                        const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
                        const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
                        const totalFunds = walletUsdcNum + aaveBalanceNum + fluidBalanceNum + compoundBalanceNum;
                        console.log(`🔍 User ${firstName} funds check: Wallet: $${walletUsdcNum}, Aave: $${aaveBalanceNum}, Fluid: $${fluidBalanceNum}, Compound: $${compoundBalanceNum}, Total: $${totalFunds}`);
                        if (totalFunds > 0.01) {
                            // User has funds - show full main menu
                            const { createMainMenuKeyboard, getMainMenuMessage } = await Promise.resolve().then(() => __importStar(require("../utils/mainMenu")));
                            await ctx.reply(await getMainMenuMessage(firstName, wallet.address, userId), {
                                parse_mode: "Markdown",
                                reply_markup: createMainMenuKeyboard(),
                            });
                        }
                        else {
                            // User has no funds - show deposit screen
                            const keyboard = new grammy_1.InlineKeyboard()
                                .text("🔍 Check for Deposit", "manual_balance_check");
                            await ctx.reply(`👋 *Welcome back ${firstName}!*\n\n` +
                                `💰 *Your inkvest address:*\n` +
                                `\`${wallet.address}\`\n\n` +
                                `Send USDC on Base ↑ to start earning.\n\n` +
                                `⚡ *I'm watching 24/7* - funds auto-deploy instantly when they arrive.`, {
                                parse_mode: "Markdown",
                                reply_markup: keyboard,
                            });
                        }
                    }
                    catch (error) {
                        console.error("Error checking user funds for", firstName, ":", error);
                        // Fallback to basic deposit screen
                        const keyboard = new grammy_1.InlineKeyboard()
                            .text("🔍 Check for Deposit", "manual_balance_check");
                        await ctx.reply(`👋 *Welcome back ${firstName}!*\n\n` +
                            `💰 *Your inkvest address:*\n` +
                            `\`${wallet.address}\`\n\n` +
                            `Send USDC on Base ↑ to start earning.\n\n` +
                            `⚡ *I'm watching 24/7* - funds auto-deploy instantly when they arrive.`, {
                            parse_mode: "Markdown",
                            reply_markup: keyboard,
                        });
                    }
                }
            }
        }
        catch (error) {
            console.error("Error in start command:", error);
            await ctx.reply("❌ Something went wrong. Please try again in a moment.");
        }
    },
};
// Help handler with simplified messaging
exports.helpHandler = {
    command: "help",
    description: "How inkvest works",
    handler: async (ctx) => {
        try {
            const firstName = ctx.from?.first_name || "there";
            // Get highest APY for marketing message
            const { getHighestAPY } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
            const highestAPY = await getHighestAPY();
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💰 Start Earning", "deposit")
                .text("📊 View Portfolio", "view_portfolio")
                .row()
                .text("⚙️ Settings", "open_settings")
                .text("🔄 Main Menu", "main_menu");
            await ctx.reply(`🦑 *How inkvest Works*\n\n` +
                `Hi ${firstName}! I'm your personal yield farming assistant.\n\n` +
                `🤖 *What I Do*\n` +
                `• Find the best DeFi yields (~${highestAPY}% APY)\n` +
                `• Auto-deploy your funds safely\n` +
                `• Monitor and compound earnings\n\n` +
                `🛡️ *Safety First*\n` +
                `• Only use vetted protocols ($10M+ TVL)\n` +
                `• You keep full control of funds\n` +
                `• Base network = ultra-low fees\n\n` +
                `💰 *Getting Started*\n` +
                `1. Send USDC to your deposit address\n` +
                `2. I'll notify when funds arrive\n` +
                `3. Auto-deploy to best opportunities\n` +
                `4. Watch your money grow! 🌱`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
        }
        catch (error) {
            console.error("Error in help command:", error);
            await ctx.reply("❌ Something went wrong. Please try again in a moment.");
        }
    },
};
