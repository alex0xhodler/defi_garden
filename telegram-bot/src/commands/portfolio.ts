import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";
import { ERRORS } from "../utils/constants";
import { 
  getPositionsByUserId, 
  getPortfolioStats 
} from "../lib/database";

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

      // Get user's positions
      const positions = getPositionsByUserId(userId);
      const stats = getPortfolioStats(userId);

      if (positions.length === 0) {
        const keyboard = new InlineKeyboard()
          .text("🚀 Start Farming", "zap_funds")
          .text("📥 Deposit", "deposit")
          .row()
          .text("🧹 Cleanup DB", "portfolio_cleanup")
          .text("📚 Learn More", "help");

        await ctx.reply(
          `📊 *Your DeFi Portfolio*\n\n` +
          `🌱 You haven't started yield farming yet!\n\n` +
          `**Get Started**:\n` +
          `• Deposit USDC to your wallet with 📥 Deposit\n` +
          `• Use 🚀 Start Farming to auto-deploy to best yields\n` +
          `• Watch your money grow! 📈\n\n` +
          `**Why Start Now?**\n` +
          `✅ Earn 5%+ APY on stablecoins\n` +
          `✅ Auto-compound your rewards\n` +
          `✅ Only vetted, high-TVL protocols\n` +
          `✅ 24/7 monitoring and alerts\n\n` +
          `💡 **Tip**: Use 🧹 Cleanup DB to remove any old transaction records`,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard
          }
        );
        return;
      }

      // Calculate total performance
      const totalGain = stats.totalValue - stats.totalInvested;
      const totalGainPercent = stats.totalInvested > 0 
        ? ((totalGain / stats.totalInvested) * 100) 
        : 0;

      let message = `📊 *Your DeFi Portfolio*\n\n`;
      
      // Portfolio summary
      message += `💰 **Total Value**: $${stats.totalValue.toFixed(2)}\n`;
      message += `📈 **Total Invested**: $${stats.totalInvested.toFixed(2)}\n`;
      message += `🌱 **Yields Earned**: $${stats.totalYield.toFixed(2)} (${totalGainPercent >= 0 ? '+' : ''}${totalGainPercent.toFixed(2)}%)\n`;
      message += `🏦 **Active Positions**: ${stats.positionCount}\n\n`;

      // Performance indicator
      if (totalGain > 0) {
        message += `🟢 *Portfolio is profitable!*\n\n`;
      } else if (totalGain < 0) {
        message += `🔴 *Portfolio is down (temporary market fluctuation)*\n\n`;
      } else {
        message += `⚪ *Breaking even*\n\n`;
      }

      // Individual positions
      message += `**🏦 Active Positions**:\n\n`;
      
      for (const position of positions.slice(0, 3)) { // Show top 3 positions for space
        const gainLoss = position.currentValue - position.amountInvested + position.yieldEarned;
        const gainLossPercent = position.amountInvested > 0 
          ? ((gainLoss / position.amountInvested) * 100) 
          : 0;
        
        const gainIcon = gainLoss > 0 ? "🟢" : gainLoss < 0 ? "🔴" : "⚪";
        const ageInDays = Math.floor((Date.now() - Number(position.createdAt)) / (1000 * 60 * 60 * 24));
        
        message += `${gainIcon} **${position.protocol} ${position.tokenSymbol}**\n`;
        message += `• Invested: $${position.amountInvested.toFixed(2)}\n`;
        message += `• Current: $${position.currentValue.toFixed(2)}\n`;
        message += `• Yield: $${position.yieldEarned.toFixed(2)} (${position.currentApy}% APY)\n`;
        message += `• P&L: ${gainLoss >= 0 ? '+' : ''}$${gainLoss.toFixed(2)} (${gainLossPercent >= 0 ? '+' : ''}${gainLossPercent.toFixed(2)}%)\n`;
        message += `• Age: ${ageInDays} days\n\n`;
      }

      if (positions.length > 3) {
        message += `...and ${positions.length - 3} more positions\n\n`;
      }

      // Quick actions
      const keyboard = new InlineKeyboard()
        .text("🌾 Harvest Yields", "harvest_yields")
        .text("🚀 Zap More", "zap_funds")
        .row()
        .text("💸 Withdraw", "withdraw")
        .text("🔄 Refresh", "view_portfolio")
        .row()
        .text("📈 Details", "portfolio_details")
        .text("🧹 Cleanup DB", "portfolio_cleanup");

      // Quick stats and tips
      message += `📅 **Performance Summary**:\n`;
      message += `• Total Earnings: +$${stats.totalYield.toFixed(2)}\n`;
      message += `• Portfolio ROI: ${totalGainPercent >= 0 ? '+' : ''}${totalGainPercent.toFixed(2)}%\n`;
      if (stats.totalValue > 0) {
        message += `• Ready to withdraw: $${stats.totalValue.toFixed(2)}\n`;
      }
      message += `\n💡 **Quick Actions**: Use buttons below to zap more funds in, withdraw profits, or harvest yields.\n\n`;
      message += `⏰ *Last updated: ${new Date().toLocaleTimeString()}*`;

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });

      // Auto-suggest actions based on portfolio state
      if (stats.totalYield > 50) {
        setTimeout(async () => {
          await ctx.reply(
            `💡 *Portfolio Tip*: You've earned $${stats.totalYield.toFixed(2)} in yields! ` +
            `Consider harvesting and re-investing for compound growth. 🌱`,
            {
              reply_markup: new InlineKeyboard().text("🌾 Harvest & Compound", "harvest_yields")
            }
          );
        }, 2000);
      }

    } catch (error) {
      console.error("Error in portfolio command:", error);
      await ctx.reply(ERRORS.NETWORK_ERROR);
    }
  },
};

// Handle portfolio details callback
export const handlePortfolioDetails = async (ctx: BotContext) => {
  try {
    const userId = ctx.session.userId;
    if (!userId) return;

    const positions = getPositionsByUserId(userId);
    
    if (positions.length === 0) {
      await ctx.answerCallbackQuery("No positions to show details for");
      return;
    }

    await ctx.answerCallbackQuery();

    let message = `📈 **Portfolio Details**\n\n`;
    
    for (const [index, position] of positions.entries()) {
      const gainLoss = position.currentValue - position.amountInvested + position.yieldEarned;
      const gainLossPercent = position.amountInvested > 0 
        ? ((gainLoss / position.amountInvested) * 100) 
        : 0;
      
      const gainIcon = gainLoss > 0 ? "🟢" : gainLoss < 0 ? "🔴" : "⚪";
      const ageInDays = Math.floor((Date.now() - Number(position.createdAt)) / (1000 * 60 * 60 * 24));
      
      message += `**${index + 1}. ${gainIcon} ${position.protocol} ${position.tokenSymbol}**\n`;
      message += `• **Pool ID**: \`${position.poolId.slice(0, 8)}...\`\n`;
      message += `• **Chain**: ${position.chain}\n`;
      message += `• **Invested**: $${position.amountInvested.toFixed(2)}\n`;
      message += `• **Current Value**: $${position.currentValue.toFixed(2)}\n`;
      message += `• **Yield Earned**: $${position.yieldEarned.toFixed(2)}\n`;
      message += `• **Entry APY**: ${position.entryApy}%\n`;
      message += `• **Current APY**: ${position.currentApy}%\n`;
      message += `• **Total P&L**: ${gainLoss >= 0 ? '+' : ''}$${gainLoss.toFixed(2)} (${gainLossPercent >= 0 ? '+' : ''}${gainLossPercent.toFixed(2)}%)\n`;
      message += `• **Position Age**: ${ageInDays} days\n`;
      message += `• **Transaction**: [\`${position.txHash.slice(0, 10)}...\`](https://basescan.org/tx/${position.txHash})\n\n`;
    }

    const keyboard = new InlineKeyboard()
      .text("💸 Withdraw All", "withdraw_aave_max")
      .text("💸 Withdraw Custom", "withdraw_custom")
      .row()
      .text("🚀 Zap More", "zap_funds")
      .text("🌾 Harvest", "harvest_yields")
      .row()
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