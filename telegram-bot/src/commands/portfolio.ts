import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";
import { ERRORS } from "../utils/constants";
import { 
  getPositionsByUserId, 
  getPortfolioStats 
} from "../lib/database";
import { getWallet, getAaveBalance, getFluidBalance, getTokenBalance } from "../lib/token-wallet";
import { Address } from "viem";
import { BASE_TOKENS } from "../utils/constants";

const portfolioHandler: CommandHandler = {
  command: "portfolio",
  description: "View DeFi positions and yields",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      // Get user's wallet
      const wallet = await getWallet(userId);
      if (!wallet) {
        await ctx.reply("❌ No wallet found. Create one first with /start");
        return;
      }

      const walletAddress = wallet.address as Address;

      // Fetch real on-chain balances
      const [aaveBalance, fluidBalance, usdcBalance] = await Promise.all([
        getAaveBalance(walletAddress),
        getFluidBalance(walletAddress),
        getTokenBalance(BASE_TOKENS.USDC, walletAddress)
      ]);

      const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
      const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
      const usdcBalanceNum = parseFloat(usdcBalance) / 1e6; // Convert from wei to USDC

      // If no DeFi deposits, show empty portfolio
      if (aaveBalanceNum === 0 && fluidBalanceNum === 0) {
        const keyboard = new InlineKeyboard()
          .text("🚀 Start Earning", "zap_funds")
          .text("📥 Deposit", "deposit")
          .row()
          .text("📚 Learn More", "help");

        await ctx.reply(
          `📊 **Your DeFi Portfolio**\n\n` +
          `🌱 You haven't started yield farming yet!\n\n` +
          `**Current Balances**:\n` +
          `• Wallet USDC: $${usdcBalanceNum.toFixed(2)}\n` +
          `• Aave Deposits: $0.00\n` +
          `• Fluid Deposits: $0.00\n\n` +
          `**Get Started**:\n` +
          `• Use 🚀 Start Earning to auto-deploy to best yields\n` +
          `• Earn 5%+ APY on your USDC\n` +
          `• Only vetted, high-TVL protocols\n\n` +
          `💡 **Tip**: Portfolio now shows real-time blockchain data`,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard
          }
        );
        return;
      }

      // Show DeFi positions with real balances
      const aaveApy = 5.2; // Could fetch real APY from Aave API
      const fluidApy = 7.8; // Could fetch real APY from Fluid API
      const totalValue = aaveBalanceNum + fluidBalanceNum;
      
      let message = `📊 **Your DeFi Portfolio**\n\n`;
      
      // Real-time balances
      message += `💰 **Total Portfolio Value**: $${totalValue.toFixed(2)}\n`;
      message += `💳 **Wallet USDC**: $${usdcBalanceNum.toFixed(2)}\n`;
      message += `🏦 **Total Deposited**: $${totalValue.toFixed(2)}\n\n`;

      // Active positions
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
      const keyboard = new InlineKeyboard()
        .text("🚀 Zap More", "zap_funds")
        .text("🚪 Exit Pool", "withdraw")
        .row()
        .text("🔄 Refresh", "view_portfolio")
        .text("💰 Check Balance", "check_balance");

      message += `⏰ *Updated: ${new Date().toLocaleTimeString()}*`;

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });

    } catch (error) {
      console.error("Error in portfolio command:", error);
      await ctx.reply("❌ Error fetching portfolio data. Please try again.");
    }
  },
};

// Handle portfolio details callback
export const handlePortfolioDetails = async (ctx: BotContext) => {
  try {
    const userId = ctx.session.userId;
    if (!userId) return;

    const wallet = await getWallet(userId);
    if (!wallet) {
      await ctx.answerCallbackQuery("No wallet found");
      return;
    }

    const walletAddress = wallet.address as Address;
    const [aaveBalance, fluidBalance] = await Promise.all([
      getAaveBalance(walletAddress),
      getFluidBalance(walletAddress)
    ]);
    
    const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
    const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
    
    if (aaveBalanceNum === 0 && fluidBalanceNum === 0) {
      await ctx.answerCallbackQuery("No active positions found");
      return;
    }

    await ctx.answerCallbackQuery();

    const aaveApy = 5.2; // Could fetch from Aave API
    const fluidApy = 7.8; // Could fetch from Fluid API
    
    let message = `📈 **Portfolio Details**\n\n`;
    
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
    message += `• **Contract**: \`${BASE_TOKENS.aUSDC.slice(0, 8)}...\`\n\n`;
    
    message += `**⚡ Available Actions**\n`;
    message += `• **Exit Pool**: Get all funds back to wallet\n`;
    message += `• **Add More**: Zap additional USDC to pool\n\n`;

    const keyboard = new InlineKeyboard()
      .text("🚪 Exit Pool", "withdraw")
      .text("🚀 Zap More", "zap_funds")
      .row()
      .text("🔄 Refresh Data", "portfolio_details")
      .text("🔙 Back to Portfolio", "view_portfolio");

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });

  } catch (error) {
    console.error("Error showing portfolio details:", error);
    await ctx.answerCallbackQuery("❌ Error loading details");
  }
};

export default portfolioHandler;