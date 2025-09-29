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
exports.handleWithdrawAmountInput = exports.handleWithdrawCallbacks = void 0;
const token_wallet_1 = require("../lib/token-wallet");
const defi_protocols_1 = require("../lib/defi-protocols");
const coinbase_defi_1 = require("../services/coinbase-defi");
const coinbase_wallet_1 = require("../lib/coinbase-wallet");
const grammy_1 = require("grammy");
const withdrawHandler = {
    command: "withdraw",
    description: "Exit DeFi pools and get USDC back to wallet",
    handler: async (ctx) => {
        try {
            const userId = ctx.session.userId;
            if (!userId) {
                await ctx.reply("❌ Please start the bot first with /start command.");
                return;
            }
            // Get user's wallet
            const wallet = await (0, token_wallet_1.getWallet)(userId);
            if (!wallet) {
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("Create Wallet", "create_wallet")
                    .text("Import Wallet", "import_wallet");
                await ctx.reply("❌ You don't have a wallet yet.\n\n" +
                    "You need to create or import a wallet first:", { reply_markup: keyboard });
                return;
            }
            // Check user balances across all protocols to filter active positions
            const { getCoinbaseSmartWallet } = await Promise.resolve().then(() => __importStar(require("../lib/coinbase-wallet")));
            const { getMorphoBalance } = await Promise.resolve().then(() => __importStar(require("../services/morpho-defi")));
            const { getSparkBalance } = await Promise.resolve().then(() => __importStar(require("../services/spark-defi")));
            const { getSeamlessBalance } = await Promise.resolve().then(() => __importStar(require("../services/seamless-defi")));
            const { getMoonwellBalance } = await Promise.resolve().then(() => __importStar(require("../services/moonwell-defi")));
            const { getMorphoRe7Balance } = await Promise.resolve().then(() => __importStar(require("../services/morpho-re7-defi")));
            try {
                // Get Smart Wallet address for new protocols (since deposits are made via CDP)
                const smartWallet = await getCoinbaseSmartWallet(userId);
                const smartWalletAddress = smartWallet?.smartAccount.address;
                const [aaveBalance, fluidBalance, compoundBalance, morphoBalance, sparkBalance, seamlessBalance, moonwellBalance, morphoRe7Balance] = await Promise.all([
                    (0, token_wallet_1.getAaveBalance)(wallet.address),
                    (0, token_wallet_1.getFluidBalance)(wallet.address),
                    (0, token_wallet_1.getCompoundBalance)(wallet.address),
                    getMorphoBalance(wallet.address),
                    // Check Spark balance on Smart Wallet address since deposits are made there
                    smartWalletAddress ? getSparkBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
                    // Check Seamless balance on Smart Wallet address since deposits are made there
                    smartWalletAddress ? getSeamlessBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
                    // Check Moonwell balance on Smart Wallet address since deposits are made there
                    smartWalletAddress ? getMoonwellBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
                    // Check Morpho Re7 balance on Smart Wallet address since deposits are made there
                    smartWalletAddress ? getMorphoRe7Balance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' })
                ]);
                // Parse balances and filter active positions (>$0.01)
                const activePositions = [];
                const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
                const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
                const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
                const morphoBalanceNum = parseFloat(morphoBalance.assetsFormatted);
                const sparkBalanceNum = parseFloat(sparkBalance.assetsFormatted);
                const seamlessBalanceNum = parseFloat(seamlessBalance.assetsFormatted);
                const moonwellBalanceNum = parseFloat(moonwellBalance.assetsFormatted);
                const morphoRe7BalanceNum = parseFloat(morphoRe7Balance.assetsFormatted);
                if (aaveBalanceNum > 0.01)
                    activePositions.push({ protocol: 'aave', balance: aaveBalanceNum, emoji: '🏛️', name: 'Aave V3', apy: '5.2%' });
                if (fluidBalanceNum > 0.01)
                    activePositions.push({ protocol: 'fluid', balance: fluidBalanceNum, emoji: '🌊', name: 'Fluid Finance', apy: '7.8%' });
                if (compoundBalanceNum > 0.01)
                    activePositions.push({ protocol: 'compound', balance: compoundBalanceNum, emoji: '🏦', name: 'Compound V3', apy: '6.2%' });
                if (morphoBalanceNum > 0.01)
                    activePositions.push({ protocol: 'morpho', balance: morphoBalanceNum, emoji: '🔬', name: 'Morpho PYTH/USDC', apy: '10%' });
                if (sparkBalanceNum > 0.01)
                    activePositions.push({ protocol: 'spark', balance: sparkBalanceNum, emoji: '⚡', name: 'Spark USDC Vault', apy: '8%' });
                if (seamlessBalanceNum > 0.01)
                    activePositions.push({ protocol: 'seamless', balance: seamlessBalanceNum, emoji: '🌊', name: 'Seamless USDC', apy: '5%' });
                if (moonwellBalanceNum > 0.01)
                    activePositions.push({ protocol: 'moonwell', balance: moonwellBalanceNum, emoji: '🌕', name: 'Moonwell USDC', apy: '5%' });
                if (morphoRe7BalanceNum > 0.01)
                    activePositions.push({ protocol: 'morpho-re7', balance: morphoRe7BalanceNum, emoji: '♾️', name: 'Re7 Universal USDC', apy: '9%' });
                // If no active positions, show earning suggestion
                if (activePositions.length === 0) {
                    const { getHighestAPY } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
                    const highestAPY = await getHighestAPY();
                    const keyboard = new grammy_1.InlineKeyboard()
                        .text("🦑 Start Earning", "zap_auto_deploy")
                        .text("📊 View Portfolio", "view_portfolio")
                        .row()
                        .text("🔄 Main Menu", "main_menu");
                    await ctx.reply(`No active positions to exit from, are you looking to start earning ${highestAPY}% returned by inkvest automanage option?`, { reply_markup: keyboard });
                    return;
                }
                // Build keyboard with only active positions
                const keyboard = new grammy_1.InlineKeyboard();
                activePositions.forEach(position => {
                    keyboard.text(`${position.emoji} Exit from ${position.name}`, `withdraw_${position.protocol}_menu`).row();
                });
                keyboard.text("❌ Cancel", "cancel_operation");
                // Build succinct message with actual balances
                let message = `🚪 **Exit Active Positions**\n\nChoose protocol to exit from:\n\n`;
                activePositions.forEach(position => {
                    message += `${position.emoji} **${position.name}**: $${position.balance.toFixed(2)} (${position.apy} APY)\n`;
                });
                message += `\nAll exits are gasless via Smart Wallet`;
                await ctx.reply(message, {
                    parse_mode: "Markdown",
                    reply_markup: keyboard,
                });
            }
            catch (error) {
                console.error("Error checking user balances for withdraw:", error);
                // Fallback: show retry option
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "withdraw")
                    .text("📊 View Portfolio", "view_portfolio")
                    .row()
                    .text("🔄 Main Menu", "main_menu");
                await ctx.reply("⚠️ Unable to fetch balances. Try again?", { reply_markup: keyboard });
            }
        }
        catch (error) {
            console.error("Error in withdraw command:", error);
            await ctx.reply("❌ An error occurred. Please try again later.");
        }
    },
};
// Handle withdrawal callbacks
const handleWithdrawCallbacks = async (ctx) => {
    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData)
        return;
    try {
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.answerCallbackQuery("Please start the bot first with /start");
            return;
        }
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        if (!wallet) {
            await ctx.answerCallbackQuery("No wallet found. Create one first.");
            return;
        }
        // Handle cancel withdrawal callbacks
        if (callbackData.startsWith("cancel_withdraw_")) {
            await ctx.answerCallbackQuery("Withdrawal cancelled");
            const protocol = callbackData.split("_")[2]; // Extract protocol from cancel_withdraw_protocol
            const protocolInfo = {
                'fluid': { name: 'Fluid Finance', emoji: '🌊' },
                'aave': { name: 'Aave V3', emoji: '🏛️' },
                'compound': { name: 'Compound V3', emoji: '🏦' },
                'morpho': { name: 'Morpho PYTH/USDC', emoji: '🔬' },
                'spark': { name: 'Spark USDC Vault', emoji: '⚡' },
                'seamless': { name: 'Seamless USDC', emoji: '🌊' },
                'moonwell': { name: 'Moonwell USDC', emoji: '🌕' },
                'morpho-re7': { name: 'Re7 Universal USDC', emoji: '♾️' }
            };
            const info = protocolInfo[protocol] || { name: 'Protocol', emoji: '💰' };
            const continueKeyboard = new grammy_1.InlineKeyboard()
                .text("📊 View Portfolio", "view_portfolio")
                .text("💰 Check Balance", "check_balance")
                .row()
                .text("🦑 Invest More", "zap_auto_deploy")
                .text("🔄 Main Menu", "main_menu");
            await ctx.reply(`✅ **Withdrawal Cancelled**\n\n` +
                `${info.emoji} Your ${info.name} position remains active and earning interest.\n\n` +
                `💰 **Smart choice!** Your funds continue compounding automatically.\n\n` +
                `What would you like to do next?`, {
                parse_mode: "Markdown",
                reply_markup: continueKeyboard
            });
            return;
        }
        // Handle protocol menu selection
        if (callbackData === "withdraw_fluid_menu") {
            await ctx.answerCallbackQuery();
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💸 Exit All Fluid", "withdraw_fluid_max").row()
                .text("⚖️ Exit Custom Amount", "withdraw_fluid_custom").row()
                .text("🔙 Back", "withdraw");
            await ctx.reply(`🌊 **Exit from Fluid Finance**\n\n` +
                `**Your Fluid Position:**\n` +
                `• Current APY: 7.8%\n` +
                `• Token: fUSDC (interest-bearing)\n` +
                `• Rewards: Auto-compounding\n\n` +
                `**Exit Options:**\n` +
                `• **Exit All** - Withdraw complete Fluid position to wallet\n` +
                `• **Custom Amount** - Specify exact USDC amount to exit\n\n` +
                `**Note:** Rewards are automatically claimed on withdrawal`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            return;
        }
        if (callbackData === "withdraw_aave_menu") {
            await ctx.answerCallbackQuery();
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💸 Exit All Aave", "withdraw_aave_max").row()
                .text("⚖️ Exit Custom Amount", "withdraw_aave_custom").row()
                .text("🔙 Back", "withdraw");
            await ctx.reply(`🏛️ **Exit from Aave V3**\n\n` +
                `**Your Aave Position:**\n` +
                `• Current APY: 5.2%\n` +
                `• Token: aUSDC (interest-bearing)\n` +
                `• Rewards: Auto-compounding\n\n` +
                `**Exit Options:**\n` +
                `• **Exit All** - Withdraw complete Aave position to wallet\n` +
                `• **Custom Amount** - Specify exact USDC amount to exit\n\n` +
                `**Note:** Rewards are automatically claimed on full withdrawal`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            return;
        }
        if (callbackData === "withdraw_compound_menu") {
            await ctx.answerCallbackQuery();
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💸 Exit All Compound", "withdraw_compound_max").row()
                .text("⚖️ Exit Custom Amount", "withdraw_compound_custom").row()
                .text("🔙 Back", "withdraw");
            await ctx.reply(`🏦 **Exit from Compound V3**\n\n` +
                `**Your Compound Position:**\n` +
                `• Current APY: 6.2%\n` +
                `• Token: cUSDCv3 (interest-bearing)\n` +
                `• Rewards: COMP tokens\n\n` +
                `**Exit Options:**\n` +
                `• **Exit All** - Withdraw complete Compound position to wallet\n` +
                `• **Custom Amount** - Specify exact USDC amount to exit\n\n` +
                `**Note:** COMP rewards are claimed automatically on withdrawal`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            return;
        }
        if (callbackData === "withdraw_morpho_menu") {
            await ctx.answerCallbackQuery();
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💸 Exit All Morpho", "withdraw_morpho_max").row()
                .text("⚖️ Exit Custom Amount", "withdraw_morpho_custom").row()
                .text("🔙 Back", "withdraw");
            await ctx.reply(`🔬 **Exit from Morpho PYTH/USDC**\n\n` +
                `**Your Morpho Position:**\n` +
                `• Current APY: 10.0%\n` +
                `• Token: MetaMorpho shares (vault shares)\n` +
                `• Rewards: Auto-compounding yield\n\n` +
                `**Exit Options:**\n` +
                `• **Exit All** - Withdraw complete Morpho position to Smart Wallet\n` +
                `• **Custom Amount** - Specify exact share amount to redeem\n\n` +
                `**Note:** Gasless transactions via Smart Wallet technology`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            return;
        }
        if (callbackData === "withdraw_morpho_max") {
            await ctx.answerCallbackQuery();
            const processingMsg = await ctx.reply(`🔄 **Processing Pool Exit...**\n\n` +
                `**Protocol:** Morpho PYTH/USDC\n` +
                `**Amount:** All available shares\n` +
                `**Gas:** Sponsored by inkvest (gasless for you!)\n` +
                `**Status:** Executing transaction...`, {
                parse_mode: "Markdown"
            });
            try {
                // Import the withdrawFromMorphoPYTH function
                const { withdrawFromMorphoPYTH } = await Promise.resolve().then(() => __importStar(require("../services/morpho-defi")));
                const userId = ctx.from?.id?.toString();
                if (!userId) {
                    throw new Error("User ID not found");
                }
                const result = await withdrawFromMorphoPYTH(userId, "max");
                if (!result.success) {
                    throw new Error(result.error);
                }
                const successKeyboard = new grammy_1.InlineKeyboard()
                    .text("🦑 Earn More", "zap_funds")
                    .text("📊 View Portfolio", "view_portfolio")
                    .row()
                    .text("💰 Check Balance", "check_balance")
                    .text("📥 Deposit More", "deposit");
                await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, `✅ **Pool Exit Successful!**\n\n` +
                    `**Protocol:** Morpho PYTH/USDC\n` +
                    `**Amount:** All available shares redeemed\n` +
                    `**Assets Received:** ${result.assets} USDC\n` +
                    `**Gas:** Sponsored by inkvest (gasless!)\n` +
                    `**Transaction:** \`${result.txHash}\`\n\n` +
                    `💰 USDC has been moved back to your Smart Wallet!\n` +
                    `🔍 [View on Basescan](https://basescan.org/tx/${result.txHash})`, {
                    parse_mode: "Markdown",
                    reply_markup: successKeyboard
                });
            }
            catch (error) {
                console.error("Morpho withdrawal failed:", error);
                const errorKeyboard = new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "withdraw_morpho_max")
                    .text("💸 Custom Amount", "withdraw_morpho_custom")
                    .row()
                    .text("📊 View Portfolio", "view_portfolio")
                    .text("💰 Check Balance", "check_balance");
                await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, `❌ **Pool Exit Failed**\n\n` +
                    `**Error:** ${error.message}\n\n` +
                    `This might be due to:\n` +
                    `• No USDC deposited in Morpho\n` +
                    `• Network issues\n` +
                    `• Smart Wallet not set up\n\n` +
                    `Try checking your balance with /portfolio`, {
                    parse_mode: "Markdown",
                    reply_markup: errorKeyboard
                });
            }
            return;
        }
        if (callbackData === "withdraw_morpho_custom") {
            await ctx.answerCallbackQuery();
            // Store protocol preference and set state for amount input
            ctx.session.tempData = ctx.session.tempData || {};
            ctx.session.tempData.protocol = "morpho";
            ctx.session.awaitingWithdrawAmount = true;
            await ctx.reply(`💸 **Custom Morpho Withdrawal**\n\n` +
                `Please enter the amount of shares you want to redeem:\n\n` +
                `**Examples:**\n` +
                `• \`1\` - Redeem 1 share\n` +
                `• \`50.5\` - Redeem 50.5 shares\n` +
                `• \`max\` - Redeem all available\n\n` +
                `**Note:** Gasless via Smart Wallet technology\n\n` +
                `**Cancel:** Send /cancel`, {
                parse_mode: "Markdown"
            });
            return;
        }
        if (callbackData === "withdraw_spark_menu") {
            await ctx.answerCallbackQuery();
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💸 Exit All Spark", "withdraw_spark_max").row()
                .text("⚖️ Exit Custom Amount", "withdraw_spark_custom").row()
                .text("🔙 Back", "withdraw");
            await ctx.reply(`⚡ **Exit from Spark USDC Vault**\n\n` +
                `**Your Spark Position:**\n` +
                `• Current APY: 8.0%\n` +
                `• Token: SPARKUSDC shares (vault shares)\n` +
                `• Rewards: Auto-compounding yield\n\n` +
                `**Exit Options:**\n` +
                `• **Exit All** - Withdraw complete Spark position to Smart Wallet\n` +
                `• **Custom Amount** - Specify exact share amount to redeem\n\n` +
                `**Note:** Gasless transactions via Smart Wallet technology`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            return;
        }
        if (callbackData === "withdraw_spark_max") {
            await ctx.answerCallbackQuery();
            const processingMsg = await ctx.reply(`🔄 **Processing Pool Exit...**\n\n` +
                `**Protocol:** Spark USDC Vault\n` +
                `**Amount:** All available shares\n` +
                `**Gas:** Sponsored by inkvest (gasless for you!)\n` +
                `**Status:** Executing transaction...`, {
                parse_mode: "Markdown"
            });
            try {
                // Import the withdrawFromSpark function
                const { withdrawFromSpark } = await Promise.resolve().then(() => __importStar(require("../services/spark-defi")));
                const userId = ctx.from?.id?.toString();
                if (!userId) {
                    throw new Error("User ID not found");
                }
                const result = await withdrawFromSpark(userId, "max");
                if (!result.success) {
                    throw new Error(result.error || "Unknown withdrawal error");
                }
                await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, `✅ **Spark Pool Exit Successful!**\n\n` +
                    `**Protocol:** Spark USDC Vault\n` +
                    `**Transaction:** \`${result.txHash}\`\n` +
                    `**USDC Received:** ${result.assets ? (parseFloat(result.assets) / 1e6).toFixed(6) : 'Processing...'}\n` +
                    `**Gas Cost:** $0.00 (sponsored by inkvest!)\n` +
                    `**Status:** ✅ Complete\n\n` +
                    `💰 USDC has been added to your Smart Wallet\n` +
                    `📊 Check your updated portfolio`, {
                    parse_mode: "Markdown",
                    reply_markup: new grammy_1.InlineKeyboard()
                        .text("📊 View Portfolio", "view_portfolio")
                        .text("💰 Check Balance", "check_balance")
                        .row()
                        .text("🦑 Start Earning", "zap_funds")
                });
            }
            catch (error) {
                console.error("Spark withdrawal failed:", error);
                const errorKeyboard = new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "withdraw_spark_max")
                    .text("💸 Custom Amount", "withdraw_spark_custom")
                    .row()
                    .text("📊 View Portfolio", "view_portfolio")
                    .text("💰 Check Balance", "check_balance");
                await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, `❌ **Spark Pool Exit Failed**\n\n` +
                    `**Error:** ${error.message}\n\n` +
                    `**Common Issues:**\n` +
                    `• No Spark position found\n` +
                    `• Network connectivity issues\n` +
                    `• Transaction temporarily failed\n\n` +
                    `**Solutions:**\n` +
                    `• Try again in a few seconds\n` +
                    `• Check your portfolio first\n` +
                    `• Use custom amount if max fails`, {
                    parse_mode: "Markdown",
                    reply_markup: errorKeyboard
                });
            }
            return;
        }
        if (callbackData === "withdraw_spark_custom") {
            await ctx.answerCallbackQuery();
            // Store protocol preference and set state for amount input
            ctx.session.tempData = ctx.session.tempData || {};
            ctx.session.tempData.protocol = "spark";
            ctx.session.awaitingWithdrawAmount = true;
            await ctx.reply(`💸 **Custom Spark Withdrawal**\n\n` +
                `Please enter the amount of SPARKUSDC shares you want to redeem:\n\n` +
                `**Examples:**\n` +
                `• \`1\` - Redeem 1 SPARKUSDC share\n` +
                `• \`0.5\` - Redeem 0.5 shares\n` +
                `• \`max\` - Redeem all available\n\n` +
                `**Note:** Gasless via Smart Wallet technology\n\n` +
                `**Cancel:** Send /cancel`, {
                parse_mode: "Markdown"
            });
            return;
        }
        if (callbackData === "withdraw_seamless_menu") {
            await ctx.answerCallbackQuery();
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💸 Exit All Seamless", "withdraw_seamless_max").row()
                .text("⚖️ Exit Custom Amount", "withdraw_seamless_custom").row()
                .text("🔙 Back", "withdraw");
            await ctx.reply(`🌊 **Exit from Seamless USDC**\n\n` +
                `**Your Seamless Position:**\n` +
                `• Current APY: 5.0%\n` +
                `• Token: SMUSDC shares (vault shares)\n` +
                `• Rewards: Auto-compounding yield\n\n` +
                `**Exit Options:**\n` +
                `• **Exit All** - Withdraw complete Seamless position to Smart Wallet\n` +
                `• **Custom Amount** - Specify exact share amount to redeem\n\n` +
                `**Note:** Gasless transactions via Smart Wallet technology`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            return;
        }
        if (callbackData === "withdraw_moonwell_menu") {
            await ctx.answerCallbackQuery();
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💸 Exit All Moonwell", "withdraw_moonwell_max").row()
                .text("⚖️ Exit Custom Amount", "withdraw_moonwell_custom").row()
                .text("🔙 Back", "withdraw");
            await ctx.reply(`🌕 **Exit from Moonwell USDC**\n\n` +
                `**Your Moonwell Position:**\n` +
                `• Current APY: 5.0%\n` +
                `• Token: Moonwell USDC shares (vault shares)\n` +
                `• Rewards: Auto-compounding yield\n\n` +
                `**Exit Options:**\n` +
                `• **Exit All** - Withdraw complete Moonwell position to Smart Wallet\n` +
                `• **Custom Amount** - Specify exact share amount to redeem\n\n` +
                `**Note:** Gasless transactions via Smart Wallet technology`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            return;
        }
        if (callbackData === "withdraw_morpho-re7_menu") {
            await ctx.answerCallbackQuery();
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💸 Exit All Re7", "withdraw_morpho-re7_max").row()
                .text("⚖️ Exit Custom Amount", "withdraw_morpho-re7_custom").row()
                .text("🔙 Back", "withdraw");
            await ctx.reply(`♾️ **Exit from Re7 Universal USDC**\n\n` +
                `**Your Re7 Position:**\n` +
                `• Current APY: 10.12%\n` +
                `• Token: Re7 Universal USDC shares (vault shares)\n` +
                `• Rewards: Auto-compounding yield\n\n` +
                `**Exit Options:**\n` +
                `• **Exit All** - Withdraw complete Re7 position to Smart Wallet\n` +
                `• **Custom Amount** - Specify exact share amount to redeem\n\n` +
                `**Note:** Gasless transactions via Smart Wallet technology`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            return;
        }
        if (callbackData === "withdraw_seamless_max") {
            await ctx.answerCallbackQuery();
            const processingMsg = await ctx.reply(`🔄 **Processing Pool Exit...**\n\n` +
                `**Protocol:** Seamless USDC\n` +
                `**Amount:** All available shares\n` +
                `**Gas:** Sponsored by inkvest (gasless for you!)\n` +
                `**Status:** Executing transaction...`, {
                parse_mode: "Markdown"
            });
            try {
                // Import the withdrawFromSeamless function
                const { withdrawFromSeamless } = await Promise.resolve().then(() => __importStar(require("../services/seamless-defi")));
                const userId = ctx.from?.id?.toString();
                if (!userId) {
                    throw new Error("User ID not found");
                }
                const result = await withdrawFromSeamless(userId, "max");
                if (!result.success) {
                    throw new Error(result.error || "Unknown withdrawal error");
                }
                await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, `✅ **Seamless Pool Exit Successful!**\n\n` +
                    `**Protocol:** Seamless USDC\n` +
                    `**Transaction:** \`${result.txHash}\`\n` +
                    `**USDC Received:** ${result.assets ? (parseFloat(result.assets) / 1e6).toFixed(6) : 'Processing...'}\n` +
                    `**Gas Cost:** $0.00 (sponsored by inkvest!)\n` +
                    `**Status:** ✅ Complete\n\n` +
                    `💰 USDC has been added to your Smart Wallet\n` +
                    `📊 Check your updated portfolio`, {
                    parse_mode: "Markdown",
                    reply_markup: new grammy_1.InlineKeyboard()
                        .text("📊 View Portfolio", "view_portfolio")
                        .text("💰 Check Balance", "check_balance")
                        .row()
                        .text("🦑 Start Earning", "zap_funds")
                });
            }
            catch (error) {
                console.error("Seamless withdrawal failed:", error);
                const errorKeyboard = new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "withdraw_seamless_max")
                    .text("💸 Custom Amount", "withdraw_seamless_custom")
                    .row()
                    .text("📊 View Portfolio", "view_portfolio")
                    .text("💰 Check Balance", "check_balance");
                await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, `❌ **Seamless Pool Exit Failed**\n\n` +
                    `**Error:** ${error.message}\n\n` +
                    `**Common Issues:**\n` +
                    `• No Seamless position found\n` +
                    `• Network connectivity issues\n` +
                    `• Transaction temporarily failed\n\n` +
                    `**Solutions:**\n` +
                    `• Try again in a few seconds\n` +
                    `• Check your portfolio first\n` +
                    `• Use custom amount if max fails`, {
                    parse_mode: "Markdown",
                    reply_markup: errorKeyboard
                });
            }
            return;
        }
        if (callbackData === "withdraw_seamless_custom") {
            await ctx.answerCallbackQuery();
            // Store protocol preference and set state for amount input
            ctx.session.tempData = ctx.session.tempData || {};
            ctx.session.tempData.protocol = "seamless";
            ctx.session.awaitingWithdrawAmount = true;
            await ctx.reply(`💸 **Custom Seamless Withdrawal**\n\n` +
                `Please enter the amount of SMUSDC shares you want to redeem:\n\n` +
                `**Examples:**\n` +
                `• \`1\` - Redeem 1 SMUSDC share\n` +
                `• \`0.5\` - Redeem 0.5 shares\n` +
                `• \`max\` - Redeem all available\n\n` +
                `**Note:** Gasless via Smart Wallet technology\n\n` +
                `**Cancel:** Send /cancel`, {
                parse_mode: "Markdown"
            });
            return;
        }
        if (callbackData === "withdraw_moonwell_max") {
            await ctx.answerCallbackQuery();
            const processingMsg = await ctx.reply(`🔄 **Processing Pool Exit...**\n\n` +
                `• Initiating Moonwell USDC withdrawal\n` +
                `• Using gasless Smart Wallet transaction\n` +
                `• Please wait...`, { parse_mode: "Markdown" });
            try {
                const userId = ctx.from.id.toString();
                // Use Smart Wallet for gasless withdrawal
                const { withdrawFromMoonwell } = await Promise.resolve().then(() => __importStar(require("../services/moonwell-defi")));
                const result = await withdrawFromMoonwell(userId, 'max');
                if (result.success && result.txHash) {
                    await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, `✅ **Moonwell Pool Exit Complete!**\n\n` +
                        `**Transaction Hash:**\n\`${result.txHash}\`\n\n` +
                        `• **Protocol:** Moonwell USDC\n` +
                        `• **Assets Received:** USDC deposited to Smart Wallet\n` +
                        `• **Gas Cost:** $0.00 (Sponsored)\n\n` +
                        `Your funds are now available in your Smart Wallet!`, {
                        parse_mode: "Markdown",
                        reply_markup: new grammy_1.InlineKeyboard()
                            .text("💰 Check Balance", "check_balance")
                            .text("📊 View Portfolio", "view_portfolio")
                            .row()
                    });
                }
                else {
                    throw new Error(result.error || 'Transaction failed');
                }
            }
            catch (error) {
                console.error('❌ Moonwell max withdrawal failed:', error);
                const errorKeyboard = new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "withdraw_moonwell_max")
                    .text("💸 Custom Amount", "withdraw_moonwell_custom")
                    .row()
                    .text("📊 View Portfolio", "view_portfolio")
                    .text("💰 Check Balance", "check_balance");
                await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, `❌ **Moonwell Pool Exit Failed**\n\n` +
                    `**Error:** ${error.message}\n\n` +
                    `**Common Issues:**\n` +
                    `• Insufficient balance\n` +
                    `• Network connectivity\n` +
                    `• Try custom amount instead`, {
                    parse_mode: "Markdown",
                    reply_markup: errorKeyboard
                });
            }
            return;
        }
        if (callbackData === "withdraw_moonwell_custom") {
            await ctx.answerCallbackQuery();
            // Store protocol preference and set state for amount input
            ctx.session.tempData = ctx.session.tempData || {};
            ctx.session.tempData.protocol = "moonwell";
            ctx.session.awaitingWithdrawAmount = true;
            await ctx.reply(`💸 **Custom Moonwell Withdrawal**\n\n` +
                `Please enter the amount of Moonwell USDC shares you want to redeem:\n\n` +
                `**Examples:**\n` +
                `• \`1\` - Redeem 1 Moonwell USDC share\n` +
                `• \`0.5\` - Redeem 0.5 shares\n` +
                `• \`max\` - Redeem all available\n\n` +
                `**Note:** Gasless via Smart Wallet technology\n\n` +
                `**Cancel:** Send /cancel`, {
                parse_mode: "Markdown"
            });
            return;
        }
        if (callbackData === "withdraw_morpho-re7_max") {
            await ctx.answerCallbackQuery();
            const processingMsg = await ctx.reply(`🔄 **Processing Pool Exit...**\n\n` +
                `• Initiating Re7 Universal USDC withdrawal\n` +
                `• Using gasless Smart Wallet transaction\n` +
                `• Please wait...`, { parse_mode: "Markdown" });
            try {
                const userId = ctx.from.id.toString();
                // Use Smart Wallet for gasless withdrawal
                const { withdrawFromMorphoRe7 } = await Promise.resolve().then(() => __importStar(require("../services/morpho-re7-defi")));
                const result = await withdrawFromMorphoRe7(userId, 'max');
                if (result.success && result.txHash) {
                    await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, `✅ **Re7 Universal USDC Pool Exit Complete!**\n\n` +
                        `**Transaction Hash:**\n\`${result.txHash}\`\n\n` +
                        `• **Protocol:** Re7 Universal USDC\n` +
                        `• **Assets Received:** USDC deposited to Smart Wallet\n` +
                        `• **Gas Cost:** $0.00 (Sponsored)\n\n` +
                        `Your funds are now available in your Smart Wallet!`, {
                        parse_mode: "Markdown",
                        reply_markup: new grammy_1.InlineKeyboard()
                            .text("💰 Check Balance", "check_balance")
                            .text("📊 View Portfolio", "view_portfolio")
                            .row()
                    });
                }
                else {
                    throw new Error(result.error || 'Transaction failed');
                }
            }
            catch (error) {
                console.error('❌ Morpho Re7 max withdrawal failed:', error);
                const errorKeyboard = new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "withdraw_morpho-re7_max")
                    .text("💸 Custom Amount", "withdraw_morpho-re7_custom")
                    .row()
                    .text("📊 View Portfolio", "view_portfolio")
                    .text("💰 Check Balance", "check_balance");
                await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, `❌ **Re7 Universal USDC Pool Exit Failed**\n\n` +
                    `**Error:** ${error.message}\n\n` +
                    `**Common Issues:**\n` +
                    `• Insufficient balance\n` +
                    `• Network connectivity\n` +
                    `• Try custom amount instead`, {
                    parse_mode: "Markdown",
                    reply_markup: errorKeyboard
                });
            }
            return;
        }
        if (callbackData === "withdraw_morpho-re7_custom") {
            await ctx.answerCallbackQuery();
            // Store protocol preference and set state for amount input
            ctx.session.tempData = ctx.session.tempData || {};
            ctx.session.tempData.protocol = "morpho-re7";
            ctx.session.awaitingWithdrawAmount = true;
            await ctx.reply(`💸 **Custom Re7 Universal USDC Withdrawal**\n\n` +
                `Please enter the amount of Re7 Universal USDC shares you want to redeem:\n\n` +
                `**Examples:**\n` +
                `• \`1\` - Redeem 1 Re7 Universal USDC share\n` +
                `• \`0.5\` - Redeem 0.5 shares\n` +
                `• \`max\` - Redeem all available\n\n` +
                `**Note:** Gasless via Smart Wallet technology\n\n` +
                `**Cancel:** Send /cancel`, {
                parse_mode: "Markdown"
            });
            return;
        }
        if (callbackData === "withdraw_fluid_max") {
            await ctx.answerCallbackQuery();
            // Show locked funds confirmation first
            await showWithdrawalConfirmation(ctx, "fluid", "max");
            return;
        }
        if (callbackData === "confirm_withdraw_fluid_max") {
            await ctx.answerCallbackQuery();
            const processingMsg = await ctx.reply(`🔄 **Processing Pool Exit...**\n\n` +
                `**Protocol:** Fluid Finance\n` +
                `**Amount:** All available USDC\n` +
                `**Status:** Executing transaction...`, {
                parse_mode: "Markdown"
            });
            try {
                const userId = ctx.from?.id?.toString();
                const hasSmartWallet = userId ? (0, coinbase_wallet_1.hasCoinbaseSmartWallet)(userId) : false;
                let receipt;
                if (hasSmartWallet) {
                    console.log(`🦑 Using gasless Fluid withdrawal for Smart Wallet user`);
                    const result = await (0, coinbase_defi_1.gaslessWithdrawFromFluid)(userId, "max");
                    if (!result.success) {
                        throw new Error(result.error);
                    }
                    // Simulate receipt format for consistency
                    receipt = {
                        transactionHash: result.txHash,
                        blockNumber: "N/A (CDP UserOp)",
                        gasUsed: "Sponsored by inkvest"
                    };
                }
                else {
                    console.log(`📤 Using regular Fluid withdrawal (no Smart Wallet)`);
                    receipt = await (0, defi_protocols_1.withdrawFromFluid)(wallet, "max");
                }
                const successKeyboard = new grammy_1.InlineKeyboard()
                    .text("🦑 Earn More", "zap_funds")
                    .text("📊 View Portfolio", "view_portfolio")
                    .row()
                    .text("💰 Check Balance", "check_balance")
                    .text("📥 Deposit More", "deposit");
                await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, `✅ **Pool Exit Successful!**\n\n` +
                    `**Protocol:** Fluid Finance\n` +
                    `**Amount:** All available USDC\n` +
                    `**Transaction:** \`${receipt.transactionHash}\`\n` +
                    `**Block:** ${receipt.blockNumber}\n` +
                    `**Gas Used:** ${receipt.gasUsed}\n\n` +
                    `💰 USDC has been moved back to your wallet!\n` +
                    `🔍 [View on Basescan](https://basescan.org/tx/${receipt.transactionHash})`, {
                    parse_mode: "Markdown",
                    reply_markup: successKeyboard
                });
            }
            catch (error) {
                console.error("Fluid withdrawal failed:", error);
                const errorKeyboard = new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "withdraw_fluid_max")
                    .text("🏛️ Exit Aave Instead", "withdraw_aave_max")
                    .row()
                    .text("📊 View Portfolio", "view_portfolio")
                    .text("💰 Check Balance", "check_balance");
                await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, `❌ **Pool Exit Failed**\n\n` +
                    `**Error:** ${error.message}\n\n` +
                    `This might be due to:\n` +
                    `• Insufficient ETH for gas fees\n` +
                    `• No USDC deposited in Fluid\n` +
                    `• Network issues\n\n` +
                    `Try checking your balance with /portfolio`, {
                    parse_mode: "Markdown",
                    reply_markup: errorKeyboard
                });
            }
        }
        if (callbackData === "withdraw_aave_max") {
            await ctx.answerCallbackQuery();
            // Show locked funds confirmation first
            await showWithdrawalConfirmation(ctx, "aave", "max");
            return;
        }
        if (callbackData === "confirm_withdraw_aave_max") {
            await ctx.answerCallbackQuery();
            const processingMsg = await ctx.reply(`🔄 **Processing Pool Exit...**\n\n` +
                `**Protocol:** Aave V3\n` +
                `**Amount:** All available USDC\n` +
                `**Status:** Executing transaction...`, {
                parse_mode: "Markdown"
            });
            try {
                const userId = ctx.from?.id?.toString();
                const hasSmartWallet = userId ? (0, coinbase_wallet_1.hasCoinbaseSmartWallet)(userId) : false;
                let receipt;
                if (hasSmartWallet) {
                    console.log(`🦑 Using gasless Aave withdrawal for Smart Wallet user`);
                    const result = await (0, coinbase_defi_1.gaslessWithdrawFromAave)(userId, "max");
                    if (!result.success) {
                        throw new Error(result.error);
                    }
                    // Simulate receipt format for consistency
                    receipt = {
                        transactionHash: result.txHash,
                        blockNumber: "N/A (CDP UserOp)",
                        gasUsed: "Sponsored by inkvest"
                    };
                }
                else {
                    console.log(`📤 Using regular Aave withdrawal (no Smart Wallet)`);
                    receipt = await (0, defi_protocols_1.withdrawFromAave)(wallet, "max");
                }
                const successKeyboard = new grammy_1.InlineKeyboard()
                    .text("🦑 Earn More", "zap_funds")
                    .text("📊 View Portfolio", "view_portfolio")
                    .row()
                    .text("💰 Check Balance", "check_balance")
                    .text("📥 Deposit More", "deposit");
                await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, `✅ **Pool Exit Successful!**\n\n` +
                    `**Protocol:** Aave V3\n` +
                    `**Amount:** All available USDC\n` +
                    `**Transaction:** \`${receipt.transactionHash}\`\n` +
                    `**Block:** ${receipt.blockNumber}\n` +
                    `**Gas Used:** ${receipt.gasUsed}\n\n` +
                    `💰 USDC has been moved back to your wallet!\n` +
                    `🔍 [View on Basescan](https://basescan.org/tx/${receipt.transactionHash})`, {
                    parse_mode: "Markdown",
                    reply_markup: successKeyboard
                });
            }
            catch (error) {
                console.error("Withdrawal failed:", error);
                const errorKeyboard = new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "withdraw_aave_max")
                    .text("💸 Custom Amount", "withdraw_custom")
                    .row()
                    .text("📊 View Portfolio", "view_portfolio")
                    .text("💰 Check Balance", "check_balance");
                await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, `❌ **Pool Exit Failed**\n\n` +
                    `**Error:** ${error.message}\n\n` +
                    `This might be due to:\n` +
                    `• Insufficient ETH for gas fees\n` +
                    `• No USDC deposited in Aave\n` +
                    `• Network issues\n\n` +
                    `Try checking your balance with /portfolio`, {
                    parse_mode: "Markdown",
                    reply_markup: errorKeyboard
                });
            }
        }
        if (callbackData === "withdraw_compound_max") {
            await ctx.answerCallbackQuery();
            // Show locked funds confirmation first
            await showWithdrawalConfirmation(ctx, "compound", "max");
            return;
        }
        if (callbackData === "confirm_withdraw_compound_max") {
            await ctx.answerCallbackQuery();
            const processingMsg = await ctx.reply(`🔄 **Processing Pool Exit...**\n\n` +
                `**Protocol:** Compound V3\n` +
                `**Amount:** All available USDC\n` +
                `**Gas:** Sponsored by inkvest (gasless for you!)\n` +
                `**Status:** Executing transaction...`, {
                parse_mode: "Markdown"
            });
            try {
                // Get user's exact Compound V3 balance to withdraw max amount
                const { getCompoundV3BalanceExact } = await Promise.resolve().then(() => __importStar(require("../services/coinbase-defi")));
                const smartWallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
                if (!smartWallet) {
                    throw new Error("Smart wallet not found");
                }
                const compoundBalanceExact = await getCompoundV3BalanceExact(smartWallet.smartAccount.address);
                if (compoundBalanceExact === 0n) {
                    throw new Error("No USDC deposited in Compound V3 to withdraw");
                }
                const result = await (0, coinbase_defi_1.withdrawFromCompoundV3)(userId, compoundBalanceExact, true);
                if (!result.success) {
                    throw new Error(result.error);
                }
                const successKeyboard = new grammy_1.InlineKeyboard()
                    .text("🦑 Earn More", "zap_funds")
                    .text("📊 View Portfolio", "view_portfolio")
                    .row()
                    .text("💰 Check Balance", "check_balance")
                    .text("📥 Deposit More", "deposit");
                await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, `✅ **Pool Exit Successful!**\n\n` +
                    `**Protocol:** Compound V3\n` +
                    `**Amount:** All available USDC\n` +
                    `**Gas:** Sponsored by inkvest (gasless!)\n` +
                    `**Transaction:** \`${result.txHash}\`\n\n` +
                    `💰 USDC has been moved back to your Smart Wallet!\n` +
                    `🔍 [View on Basescan](https://basescan.org/tx/${result.txHash})`, {
                    parse_mode: "Markdown",
                    reply_markup: successKeyboard
                });
            }
            catch (error) {
                console.error("Compound withdrawal failed:", error);
                const errorKeyboard = new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "withdraw_compound_max")
                    .text("💸 Custom Amount", "withdraw_compound_custom")
                    .row()
                    .text("📊 View Portfolio", "view_portfolio")
                    .text("💰 Check Balance", "check_balance");
                await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, `❌ **Pool Exit Failed**\n\n` +
                    `**Error:** ${error.message}\n\n` +
                    `This might be due to:\n` +
                    `• Insufficient ETH for gas fees\n` +
                    `• No USDC deposited in Compound\n` +
                    `• Network issues\n\n` +
                    `Try checking your balance with /portfolio`, {
                    parse_mode: "Markdown",
                    reply_markup: errorKeyboard
                });
            }
        }
        if (callbackData === "withdraw_compound_custom") {
            await ctx.answerCallbackQuery();
            // Store protocol preference and set state for amount input
            ctx.session.tempData = ctx.session.tempData || {};
            ctx.session.tempData.protocol = "compound";
            ctx.session.awaitingWithdrawAmount = true;
            await ctx.reply(`💸 **Custom Compound Withdrawal**\n\n` +
                `Please enter the amount of USDC you want to withdraw:\n\n` +
                `**Examples:**\n` +
                `• \`1\` - Withdraw 1 USDC\n` +
                `• \`50.5\` - Withdraw 50.5 USDC\n` +
                `• \`max\` - Withdraw all available\n\n` +
                `**Note:** COMP rewards are automatically claimed\n\n` +
                `**Cancel:** Send /cancel`, {
                parse_mode: "Markdown"
            });
            return;
        }
        // Handle protocol-specific custom withdrawals
        if (callbackData === "withdraw_fluid_custom") {
            await ctx.answerCallbackQuery();
            // Store protocol preference and set state for amount input
            ctx.session.tempData = ctx.session.tempData || {};
            ctx.session.tempData.protocol = "fluid";
            ctx.session.tempData.claimRewards = true; // Fluid always claims rewards
            ctx.session.awaitingWithdrawAmount = true;
            await ctx.reply(`💸 **Custom Fluid Withdrawal**\n\n` +
                `Please enter the amount of USDC you want to withdraw from Fluid:\n\n` +
                `**Examples:**\n` +
                `• \`1\` - Withdraw 1 USDC\n` +
                `• \`50.5\` - Withdraw 50.5 USDC\n` +
                `• \`max\` - Withdraw all available\n\n` +
                `**Protocol:** Fluid Finance (7.8% APY)\n` +
                `**Rewards:** Will be automatically claimed\n\n` +
                `**Cancel:** Send /cancel`, {
                parse_mode: "Markdown"
            });
            return;
        }
        if (callbackData === "withdraw_aave_custom") {
            await ctx.answerCallbackQuery();
            // Store protocol preference and set state for amount input
            ctx.session.tempData = ctx.session.tempData || {};
            ctx.session.tempData.protocol = "aave";
            ctx.session.awaitingWithdrawAmount = true;
            await ctx.reply(`💸 **Custom Aave Withdrawal**\n\n` +
                `Please enter the amount of USDC you want to withdraw from Aave:\n\n` +
                `**Examples:**\n` +
                `• \`1\` - Withdraw 1 USDC\n` +
                `• \`50.5\` - Withdraw 50.5 USDC\n` +
                `• \`max\` - Withdraw all available\n\n` +
                `**Protocol:** Aave V3 (5.2% APY)`, {
                parse_mode: "Markdown"
            });
            return;
        }
        // Legacy support - redirect old custom to Aave
        if (callbackData === "withdraw_custom") {
            await ctx.answerCallbackQuery();
            // Show reward options for custom withdrawal
            const rewardKeyboard = new grammy_1.InlineKeyboard()
                .text("🚪 Exit + Claim Rewards", "withdraw_custom_with_rewards").row()
                .text("🚪 Exit Only", "withdraw_custom_no_rewards").row()
                .text("❌ Cancel", "cancel_operation");
            await ctx.reply(`🚪 **Custom Pool Exit Options**\n\n` +
                `**Choose your exit preference:**\n` +
                `• **With Rewards** - Claim any earned rewards before exit\n` +
                `• **Without Rewards** - Just exit principal, leave rewards in pool\n\n` +
                `**Note:** Rewards are automatically claimed for full exits`, {
                parse_mode: "Markdown",
                reply_markup: rewardKeyboard,
            });
        }
        if (callbackData === "withdraw_custom_with_rewards" || callbackData === "withdraw_custom_no_rewards") {
            await ctx.answerCallbackQuery();
            // Store reward preference and set state for amount input
            ctx.session.tempData = ctx.session.tempData || {};
            ctx.session.tempData.claimRewards = callbackData === "withdraw_custom_with_rewards";
            ctx.session.awaitingWithdrawAmount = true;
            await ctx.reply(`💸 **Custom Withdrawal Amount**\n\n` +
                `Please enter the amount of USDC you want to withdraw from Aave:\n\n` +
                `**Examples:**\n` +
                `• \`1\` - Withdraw 1 USDC\n` +
                `• \`50.5\` - Withdraw 50.5 USDC\n` +
                `• \`max\` - Withdraw all available\n\n` +
                `**Rewards:** ${ctx.session.tempData.claimRewards ? "Will be claimed" : "Will be left in pool"}\n\n` +
                `**Cancel:** Send /cancel`, {
                parse_mode: "Markdown"
            });
        }
    }
    catch (error) {
        console.error("Error handling withdrawal callback:", error);
        await ctx.answerCallbackQuery("❌ An error occurred. Please try again.");
    }
};
exports.handleWithdrawCallbacks = handleWithdrawCallbacks;
// Handle custom withdrawal amount input
const handleWithdrawAmountInput = async (ctx, amount) => {
    try {
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Please start the bot first with /start command.");
            return;
        }
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        if (!wallet) {
            await ctx.reply("❌ No wallet found. Create one first.");
            return;
        }
        // Validate amount
        if (amount.toLowerCase() !== "max" && (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)) {
            await ctx.reply("❌ Please enter a valid amount (positive number) or `max`", {
                parse_mode: "Markdown"
            });
            return;
        }
        // Determine which protocol to withdraw from
        const protocol = ctx.session.tempData?.protocol || "aave"; // Default to Aave for legacy support
        const protocolName = protocol === "fluid" ? "Fluid Finance" : protocol === "compound" ? "Compound V3" : protocol === "morpho" ? "Morpho PYTH/USDC" : protocol === "spark" ? "Spark USDC Vault" : protocol === "seamless" ? "Seamless USDC" : protocol === "moonwell" ? "Moonwell USDC" : protocol === "morpho-re7" ? "Re7 Universal USDC" : "Aave V3";
        const protocolEmoji = protocol === "fluid" ? "🌊" : protocol === "compound" ? "🏦" : protocol === "morpho" ? "🔬" : protocol === "spark" ? "⚡" : protocol === "seamless" ? "🌊" : protocol === "moonwell" ? "🌕" : protocol === "morpho-re7" ? "♾️" : "🏛️";
        const processingMsg = await ctx.reply(`🔄 **Processing Withdrawal...**\n\n` +
            `**Protocol:** ${protocolEmoji} ${protocolName}\n` +
            `**Amount:** ${amount === "max" ? "All available" : amount} USDC\n` +
            `**Status:** Executing transaction...`, {
            parse_mode: "Markdown"
        });
        try {
            const claimRewards = ctx.session.tempData?.claimRewards;
            const isMaxWithdrawal = amount.toLowerCase() === "max";
            // Execute withdrawal based on protocol
            const hasSmartWallet = (0, coinbase_wallet_1.hasCoinbaseSmartWallet)(userId);
            let receipt;
            if (protocol === "fluid") {
                if (hasSmartWallet) {
                    console.log(`🦑 Using gasless Fluid withdrawal for Smart Wallet user`);
                    const result = await (0, coinbase_defi_1.gaslessWithdrawFromFluid)(userId, amount);
                    if (!result.success) {
                        throw new Error(result.error);
                    }
                    receipt = {
                        transactionHash: result.txHash,
                        blockNumber: "N/A (CDP UserOp)",
                        gasUsed: "Sponsored by inkvest"
                    };
                }
                else {
                    console.log(`📤 Using regular Fluid withdrawal (no Smart Wallet)`);
                    receipt = await (0, defi_protocols_1.withdrawFromFluid)(wallet, amount, claimRewards);
                }
            }
            else if (protocol === "compound") {
                // Use CDP gasless withdrawal for Compound V3
                const result = await (0, coinbase_defi_1.withdrawFromCompoundV3)(userId, amount);
                if (!result.success) {
                    throw new Error(result.error);
                }
                // Simulate receipt format for consistency with other protocols
                receipt = {
                    transactionHash: result.txHash,
                    blockNumber: "N/A (CDP UserOp)",
                    gasUsed: "Sponsored by inkvest"
                };
            }
            else if (protocol === "morpho") {
                // Use Morpho gasless withdrawal
                console.log(`🔬 Using gasless Morpho withdrawal for Smart Wallet user`);
                const { withdrawFromMorphoPYTH } = await Promise.resolve().then(() => __importStar(require("../services/morpho-defi")));
                const result = await withdrawFromMorphoPYTH(userId, amount);
                if (!result.success) {
                    throw new Error(result.error);
                }
                receipt = {
                    transactionHash: result.txHash,
                    blockNumber: "N/A (CDP UserOp)",
                    gasUsed: "Sponsored by inkvest"
                };
            }
            else if (protocol === "spark") {
                // Use Spark gasless withdrawal
                console.log(`⚡ Using gasless Spark withdrawal for Smart Wallet user`);
                const { withdrawFromSpark } = await Promise.resolve().then(() => __importStar(require("../services/spark-defi")));
                const result = await withdrawFromSpark(userId, amount);
                if (!result.success) {
                    throw new Error(result.error);
                }
                receipt = {
                    transactionHash: result.txHash,
                    blockNumber: "N/A (CDP UserOp)",
                    gasUsed: "Sponsored by inkvest"
                };
            }
            else if (protocol === "seamless") {
                // Use Seamless gasless withdrawal
                console.log(`🌊 Using gasless Seamless withdrawal for Smart Wallet user`);
                const { withdrawFromSeamless } = await Promise.resolve().then(() => __importStar(require("../services/seamless-defi")));
                const result = await withdrawFromSeamless(userId, amount);
                if (!result.success) {
                    throw new Error(result.error);
                }
                receipt = {
                    transactionHash: result.txHash,
                    blockNumber: "N/A (CDP UserOp)",
                    gasUsed: "Sponsored by inkvest"
                };
            }
            else if (protocol === "moonwell") {
                // Use Moonwell gasless withdrawal
                console.log(`🌕 Using gasless Moonwell withdrawal for Smart Wallet user`);
                const { withdrawFromMoonwell } = await Promise.resolve().then(() => __importStar(require("../services/moonwell-defi")));
                const result = await withdrawFromMoonwell(userId, amount);
                if (!result.success) {
                    throw new Error(result.error);
                }
                receipt = {
                    transactionHash: result.txHash,
                    blockNumber: "N/A (CDP UserOp)",
                    gasUsed: "Sponsored by inkvest"
                };
            }
            else if (protocol === "morpho-re7") {
                // Use Morpho Re7 gasless withdrawal
                console.log(`♾️ Using gasless Morpho Re7 withdrawal for Smart Wallet user`);
                const { withdrawFromMorphoRe7 } = await Promise.resolve().then(() => __importStar(require("../services/morpho-re7-defi")));
                const result = await withdrawFromMorphoRe7(userId, amount);
                if (!result.success) {
                    throw new Error(result.error);
                }
                receipt = {
                    transactionHash: result.txHash,
                    blockNumber: "N/A (CDP UserOp)",
                    gasUsed: "Sponsored by inkvest"
                };
            }
            else {
                if (hasSmartWallet) {
                    console.log(`🦑 Using gasless Aave withdrawal for Smart Wallet user`);
                    const result = await (0, coinbase_defi_1.gaslessWithdrawFromAave)(userId, amount);
                    if (!result.success) {
                        throw new Error(result.error);
                    }
                    receipt = {
                        transactionHash: result.txHash,
                        blockNumber: "N/A (CDP UserOp)",
                        gasUsed: "Sponsored by inkvest"
                    };
                }
                else {
                    console.log(`📤 Using regular Aave withdrawal (no Smart Wallet)`);
                    receipt = await (0, defi_protocols_1.withdrawFromAave)(wallet, amount, claimRewards);
                }
            }
            // Determine reward status based on actual behavior
            let rewardStatus;
            if (isMaxWithdrawal) {
                rewardStatus = "Claimed (automatic for full withdrawal)";
            }
            else if (claimRewards === true) {
                rewardStatus = "Claimed";
            }
            else if (claimRewards === false) {
                rewardStatus = "Left in pool";
            }
            else {
                // Default for partial withdrawals when not explicitly set
                rewardStatus = "Left in pool (default)";
            }
            const successKeyboard = new grammy_1.InlineKeyboard()
                .text("🦑 Earn More", "zap_funds")
                .text("📊 View Portfolio", "view_portfolio")
                .row()
                .text("💰 Check Balance", "check_balance")
                .text("📥 Deposit More", "deposit");
            // Build success message based on protocol
            let successMessage = `✅ **Withdrawal Successful!**\n\n` +
                `**Protocol:** ${protocolEmoji} ${protocolName}\n` +
                `**Amount:** ${isMaxWithdrawal ? "All available" : amount} USDC\n`;
            if (protocol === "compound") {
                // CDP gasless withdrawal message
                successMessage += `**Gas:** Sponsored by inkvest (gasless!)\n` +
                    `**Transaction:** \`${receipt.transactionHash}\`\n\n` +
                    `💰 USDC has been withdrawn to your Smart Wallet!\n`;
            }
            else {
                // Regular withdrawal message
                successMessage += `**Rewards:** ${rewardStatus}\n` +
                    `**Transaction:** \`${receipt.transactionHash}\`\n` +
                    `**Block:** ${receipt.blockNumber}\n` +
                    `**Gas Used:** ${receipt.gasUsed}\n\n` +
                    `💰 USDC has been withdrawn to your wallet!\n`;
            }
            successMessage += `🔍 [View on Basescan](https://basescan.org/tx/${receipt.transactionHash})`;
            await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, successMessage, {
                parse_mode: "Markdown",
                reply_markup: successKeyboard
            });
            // Clear the awaiting state and temp data
            ctx.session.awaitingWithdrawAmount = false;
            ctx.session.tempData = {};
        }
        catch (error) {
            console.error("Withdrawal failed:", error);
            const retryCustomAction = protocol === "fluid" ? "withdraw_fluid_custom" : protocol === "compound" ? "withdraw_compound_custom" : protocol === "morpho" ? "withdraw_morpho_custom" : protocol === "spark" ? "withdraw_spark_custom" : protocol === "seamless" ? "withdraw_seamless_custom" : protocol === "moonwell" ? "withdraw_moonwell_custom" : protocol === "morpho-re7" ? "withdraw_morpho-re7_custom" : "withdraw_aave_custom";
            const withdrawAllAction = protocol === "fluid" ? "withdraw_fluid_max" : protocol === "compound" ? "withdraw_compound_max" : protocol === "morpho" ? "withdraw_morpho_max" : protocol === "spark" ? "withdraw_spark_max" : protocol === "seamless" ? "withdraw_seamless_max" : protocol === "moonwell" ? "withdraw_moonwell_max" : protocol === "morpho-re7" ? "withdraw_morpho-re7_max" : "withdraw_aave_max";
            const protocolDisplayName = protocol === "fluid" ? "Fluid Finance" : protocol === "compound" ? "Compound" : protocol === "morpho" ? "Morpho PYTH/USDC" : protocol === "spark" ? "Spark USDC Vault" : protocol === "seamless" ? "Seamless USDC" : protocol === "moonwell" ? "Moonwell USDC" : protocol === "morpho-re7" ? "Re7 Universal USDC" : "Aave";
            const errorKeyboard = new grammy_1.InlineKeyboard()
                .text("🔄 Try Again", retryCustomAction)
                .text(`💸 Exit All ${protocolDisplayName}`, withdrawAllAction)
                .row()
                .text("📊 View Portfolio", "view_portfolio")
                .text("💰 Check Balance", "check_balance");
            await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, `❌ **Withdrawal Failed**\n\n` +
                `**Protocol:** ${protocolEmoji} ${protocolName}\n` +
                `**Error:** ${error.message}\n\n` +
                `This might be due to:\n` +
                `• Insufficient ETH for gas fees\n` +
                `• No USDC deposited in ${protocolDisplayName}\n` +
                `• Withdrawal amount exceeds deposited balance\n` +
                `• Network issues\n\n` +
                `Try checking your balance with /portfolio`, {
                parse_mode: "Markdown",
                reply_markup: errorKeyboard
            });
            // Clear the awaiting state and temp data
            ctx.session.awaitingWithdrawAmount = false;
            ctx.session.tempData = {};
        }
    }
    catch (error) {
        console.error("Error processing withdrawal amount:", error);
        await ctx.reply("❌ An error occurred. Please try again later.");
        ctx.session.awaitingWithdrawAmount = false;
        ctx.session.tempData = {};
    }
};
exports.handleWithdrawAmountInput = handleWithdrawAmountInput;
/**
 * Show withdrawal confirmation with daily earnings impact
 */
async function showWithdrawalConfirmation(ctx, protocol, amount) {
    try {
        // Get protocol info and current APY
        const protocolInfo = {
            'fluid': { name: 'Fluid Finance', emoji: '🌊', apy: 7.8 },
            'aave': { name: 'Aave V3', emoji: '🏛️', apy: 5.2 },
            'compound': { name: 'Compound V3', emoji: '🏦', apy: 6.2 },
            'morpho': { name: 'Morpho PYTH/USDC', emoji: '🔬', apy: 10.0 }
        };
        const info = protocolInfo[protocol] || { name: 'Protocol', emoji: '💰', apy: 5.0 };
        // Get user's actual balance from their DeFi positions
        const userId = ctx.from?.id?.toString();
        let estimatedBalance = 0;
        if (userId) {
            try {
                // Get user's actual balance based on protocol
                const wallet = await (0, token_wallet_1.getWallet)(userId);
                if (wallet) {
                    if (protocol === 'aave') {
                        const balanceResult = await (0, token_wallet_1.getAaveBalance)(wallet.address);
                        estimatedBalance = parseFloat(balanceResult.aUsdcBalanceFormatted);
                    }
                    else if (protocol === 'compound') {
                        // Use the coinbase-defi function for Compound V3 which returns simple string
                        const { getCompoundV3Balance } = await Promise.resolve().then(() => __importStar(require("../services/coinbase-defi")));
                        estimatedBalance = parseFloat(await getCompoundV3Balance(wallet.address));
                    }
                    else if (protocol === 'fluid') {
                        const balanceResult = await (0, token_wallet_1.getFluidBalance)(wallet.address);
                        estimatedBalance = parseFloat(balanceResult.fUsdcBalanceFormatted);
                    }
                    else if (protocol === 'morpho') {
                        const { getMorphoBalance } = await Promise.resolve().then(() => __importStar(require("../services/morpho-defi")));
                        const balanceResult = await getMorphoBalance(wallet.address);
                        estimatedBalance = parseFloat(balanceResult.assetsFormatted);
                    }
                }
            }
            catch (error) {
                console.error(`Error fetching ${protocol} balance:`, error);
                estimatedBalance = 1; // Fallback to $1 if we can't fetch balance
            }
        }
        // Fallback to $1 if no balance found
        if (estimatedBalance <= 0) {
            estimatedBalance = 1;
        }
        const dailyEarnings = (estimatedBalance * info.apy) / 100 / 365;
        const confirmKeyboard = new grammy_1.InlineKeyboard()
            .text(`💸 Withdraw Now (-$${dailyEarnings.toFixed(4)})`, `confirm_withdraw_${protocol}_${amount}`)
            .row()
            .text(`📈 Keep Earning`, `cancel_withdraw_${protocol}`)
            .text(`📊 View Details`, `view_portfolio`);
        const message = `⚠️ **Withdrawal Impact Confirmation**\n\n` +
            `${info.emoji} **${info.name}**\n` +
            `• Your balance: **$${estimatedBalance.toFixed(2)} USDC**\n` +
            `• Current APY: **${info.apy}%**\n` +
            `• Daily earnings: **$${dailyEarnings.toFixed(4)}/day**\n` +
            `• Weekly earnings: **$${(dailyEarnings * 7).toFixed(3)}**\n\n` +
            `**If you withdraw now:**\n` +
            `❌ You'll forfeit today's earnings (~$${dailyEarnings.toFixed(4)})\n` +
            `❌ Your funds will stop earning interest\n` +
            `✅ USDC will be available in your wallet instantly\n\n` +
            `**Alternative:**\n` +
            `📈 Keep earning and withdraw tomorrow\n` +
            `📈 Compound your returns automatically\n\n` +
            `**What would you like to do?**`;
        await ctx.reply(message, {
            parse_mode: "Markdown",
            reply_markup: confirmKeyboard
        });
    }
    catch (error) {
        console.error("Error showing withdrawal confirmation:", error);
        await ctx.reply("❌ An error occurred. Please try again later.");
    }
}
exports.default = withdrawHandler;
