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
exports.handlePortfolioDetails = void 0;
const grammy_1 = require("grammy");
const constants_1 = require("../utils/constants");
const token_wallet_1 = require("../lib/token-wallet");
const constants_2 = require("../utils/constants");
const portfolioHandler = {
    command: "portfolio",
    description: "View DeFi positions and yields",
    handler: async (ctx) => {
        try {
            const userId = ctx.session.userId;
            if (!userId) {
                await ctx.reply(constants_1.ERRORS.NO_WALLET);
                return;
            }
            // Get user's wallet
            const wallet = await (0, token_wallet_1.getWallet)(userId);
            if (!wallet) {
                await ctx.reply("❌ No wallet found. Create one first with /start");
                return;
            }
            const walletAddress = wallet.address;
            // Fetch real on-chain balances
            const [aaveBalance, fluidBalance, compoundBalance, usdcBalance] = await Promise.all([
                (0, token_wallet_1.getAaveBalance)(walletAddress),
                (0, token_wallet_1.getFluidBalance)(walletAddress),
                (0, token_wallet_1.getCompoundBalance)(walletAddress),
                (0, token_wallet_1.getTokenBalance)(constants_2.BASE_TOKENS.USDC, walletAddress)
            ]);
            const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
            const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
            const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
            const usdcBalanceNum = parseFloat(usdcBalance) / 1e6; // Convert from wei to USDC
            // If no DeFi deposits, show empty portfolio
            if (aaveBalanceNum === 0 && fluidBalanceNum === 0 && compoundBalanceNum === 0) {
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("🦑 Start Earning", "zap_funds")
                    .text("📥 Deposit", "deposit")
                    .row()
                    .text("💰 Check Balance", "check_balance")
                    .text("📚 Learn More", "help");
                await ctx.reply(`📊 **Your DeFi Portfolio**\n\n` +
                    `🌱 You haven't started yield farming yet!\n\n` +
                    `**Current Balances**:\n` +
                    `• Wallet USDC: $${usdcBalanceNum.toFixed(2)}\n` +
                    `• Aave Deposits: $0.00\n` +
                    `• Fluid Deposits: $0.00\n` +
                    `• Compound Deposits: $0.00\n\n` +
                    `**Get Started**:\n` +
                    `• Use 🦑 Start Earning to auto-deploy to best yields\n` +
                    `• Earn 5%+ APY on your USDC\n` +
                    `• Only vetted, high-TVL protocols\n\n` +
                    `💡 **Tip**: Portfolio now shows real-time blockchain data`, {
                    parse_mode: "Markdown",
                    reply_markup: keyboard
                });
                return;
            }
            // Fetch real-time APY data (with current fallbacks)
            let aaveApy = 5.69;
            let fluidApy = 7.72;
            let compoundApy = 7.65;
            try {
                const { fetchProtocolApy } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
                const [realAaveApy, realFluidApy, realCompoundApy] = await Promise.allSettled([
                    fetchProtocolApy("AAVE"),
                    fetchProtocolApy("FLUID"),
                    fetchProtocolApy("COMPOUND")
                ]);
                if (realAaveApy.status === 'fulfilled')
                    aaveApy = realAaveApy.value;
                if (realFluidApy.status === 'fulfilled')
                    fluidApy = realFluidApy.value;
                if (realCompoundApy.status === 'fulfilled')
                    compoundApy = realCompoundApy.value;
                console.log(`Portfolio APY rates: Aave ${aaveApy}%, Fluid ${fluidApy}%, Compound ${compoundApy}%`);
            }
            catch (error) {
                console.warn("Failed to fetch real-time APY, using fallback rates:", error);
            }
            const totalValue = aaveBalanceNum + fluidBalanceNum + compoundBalanceNum;
            let message = `📊 **Your DeFi Portfolio**\n\n`;
            // Real-time balances
            message += `💰 **Total Portfolio Value**: $${totalValue.toFixed(2)}\n`;
            message += `💳 **Wallet USDC**: $${usdcBalanceNum.toFixed(2)}\n`;
            message += `🏦 **Total Deposited**: $${totalValue.toFixed(2)}\n\n`;
            // Active positions (sorted by APY - highest first)
            if (compoundBalanceNum > 0) {
                message += `**🏦 Compound V3 Position**\n\n`;
                message += `🟢 **Compound USDC**\n`;
                message += `• **Current Deposit**: $${compoundBalanceNum.toFixed(2)}\n`;
                message += `• **Current APY**: ${compoundApy}%\n`;
                message += `• **Protocol**: Compound V3 on Base\n`;
                message += `• **Status**: ✅ Active & Earning\n\n`;
            }
            if (fluidBalanceNum > 0) {
                message += `**🌊 Fluid Finance Position**\n\n`;
                message += `🟢 **Fluid USDC**\n`;
                message += `• **Current Deposit**: $${fluidBalanceNum.toFixed(2)}\n`;
                message += `• **Current APY**: ${fluidApy}%\n`;
                message += `• **Protocol**: Fluid on Base\n`;
                message += `• **Status**: ✅ Active & Earning\n\n`;
            }
            if (aaveBalanceNum > 0) {
                message += `**🏛️ Aave V3 Position**\n\n`;
                message += `🟢 **Aave USDC**\n`;
                message += `• **Current Deposit**: $${aaveBalanceNum.toFixed(2)}\n`;
                message += `• **Current APY**: ${aaveApy}%\n`;
                message += `• **Protocol**: Aave V3 on Base\n`;
                message += `• **Status**: ✅ Active & Earning\n\n`;
            }
            // Performance note
            message += `📈 **Real-Time Data**\n`;
            message += `• Balance fetched from blockchain\n`;
            message += `• Reflects all deposits/withdrawals\n`;
            message += `• Auto-compounding rewards included\n\n`;
            // Quick actions
            const keyboard = new grammy_1.InlineKeyboard()
                .text("🦑 Earn More", "zap_funds")
                .text("🌾 Harvest", "harvest_yields")
                .row()
                .text("🚪 Exit Pool", "withdraw")
                .text("🔄 Refresh", "view_portfolio")
                .row()
                .text("💰 Check Balance", "check_balance");
            message += `⏰ *Updated: ${new Date().toLocaleTimeString()}*`;
            await ctx.reply(message, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
        }
        catch (error) {
            console.error("Error in portfolio command:", error);
            await ctx.reply("❌ Error fetching portfolio data. Please try again.");
        }
    },
};
// Handle portfolio details callback
const handlePortfolioDetails = async (ctx) => {
    try {
        const userId = ctx.session.userId;
        if (!userId)
            return;
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        if (!wallet) {
            await ctx.answerCallbackQuery("No wallet found");
            return;
        }
        const walletAddress = wallet.address;
        const [aaveBalance, fluidBalance, compoundBalance] = await Promise.all([
            (0, token_wallet_1.getAaveBalance)(walletAddress),
            (0, token_wallet_1.getFluidBalance)(walletAddress),
            (0, token_wallet_1.getCompoundBalance)(walletAddress)
        ]);
        const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
        const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
        const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
        if (aaveBalanceNum === 0 && fluidBalanceNum === 0 && compoundBalanceNum === 0) {
            await ctx.answerCallbackQuery("No active positions found");
            return;
        }
        await ctx.answerCallbackQuery();
        // Fetch real-time APY data
        let aaveApy = 5.69;
        let fluidApy = 7.72;
        let compoundApy = 7.65;
        try {
            const { fetchProtocolApy } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
            const [realAaveApy, realFluidApy, realCompoundApy] = await Promise.allSettled([
                fetchProtocolApy("AAVE"),
                fetchProtocolApy("FLUID"),
                fetchProtocolApy("COMPOUND")
            ]);
            if (realAaveApy.status === 'fulfilled')
                aaveApy = realAaveApy.value;
            if (realFluidApy.status === 'fulfilled')
                fluidApy = realFluidApy.value;
            if (realCompoundApy.status === 'fulfilled')
                compoundApy = realCompoundApy.value;
        }
        catch (error) {
            console.warn("Failed to fetch real-time APY for portfolio details:", error);
        }
        let message = `📈 **Portfolio Details**\n\n`;
        // Show positions in order of APY (highest first)
        if (compoundBalanceNum > 0) {
            message += `**🏦 Compound V3 Position Details**\n\n`;
            message += `🟢 **USDC Lending Position**\n`;
            message += `• **Current Deposit**: $${compoundBalanceNum.toFixed(2)}\n`;
            message += `• **Token**: cUSDCv3 (Compound interest-bearing USDC)\n`;
            message += `• **Protocol**: Compound V3\n`;
            message += `• **Chain**: Base Network\n`;
            message += `• **Current APY**: ${compoundApy}%\n`;
            message += `• **Status**: ✅ Active & Auto-Compounding\n`;
            message += `• **Risk Level**: 🟢 Low (Compound is battle-tested)\n\n`;
        }
        if (fluidBalanceNum > 0) {
            message += `**🌊 Fluid Finance Position Details**\n\n`;
            message += `🟢 **USDC Lending Position**\n`;
            message += `• **Current Deposit**: $${fluidBalanceNum.toFixed(2)}\n`;
            message += `• **Token**: fUSDC (Fluid interest-bearing USDC)\n`;
            message += `• **Protocol**: Fluid Finance\n`;
            message += `• **Chain**: Base Network\n`;
            message += `• **Current APY**: ${fluidApy}%\n`;
            message += `• **Status**: ✅ Active & Auto-Compounding\n`;
            message += `• **Risk Level**: 🟢 Low (InstaDApp backed)\n\n`;
        }
        if (aaveBalanceNum > 0) {
            message += `**🏛️ Aave V3 Position Details**\n\n`;
            message += `🟢 **USDC Lending Position**\n`;
            message += `• **Current Deposit**: $${aaveBalanceNum.toFixed(2)}\n`;
            message += `• **Token**: aUSDC (Aave interest-bearing USDC)\n`;
            message += `• **Protocol**: Aave V3\n`;
            message += `• **Chain**: Base Network\n`;
            message += `• **Current APY**: ${aaveApy}%\n`;
            message += `• **Status**: ✅ Active & Auto-Compounding\n`;
            message += `• **Risk Level**: 🟢 Low (Aave is battle-tested)\n\n`;
        }
        message += `**📊 Position Analysis**\n`;
        message += `• **Real-Time Balance**: Fetched from blockchain\n`;
        message += `• **Liquidity**: Can withdraw anytime\n`;
        message += `• **Rewards**: Auto-compounding in aUSDC\n`;
        message += `• **Contract**: \`${constants_2.BASE_TOKENS.aUSDC.slice(0, 8)}...\`\n\n`;
        message += `**⚡ Available Actions**\n`;
        message += `• **Exit Pool**: Get all funds back to wallet\n`;
        message += `• **Add More**: Zap additional USDC to pool\n\n`;
        const keyboard = new grammy_1.InlineKeyboard()
            .text("🚪 Exit Pool", "withdraw")
            .text("🦑 Earn More", "zap_funds")
            .row()
            .text("🔄 Refresh Data", "portfolio_details")
            .text("🔙 Back to Portfolio", "view_portfolio");
        await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            reply_markup: keyboard,
        });
    }
    catch (error) {
        console.error("Error showing portfolio details:", error);
        await ctx.answerCallbackQuery("❌ Error loading details");
    }
};
exports.handlePortfolioDetails = handlePortfolioDetails;
exports.default = portfolioHandler;
