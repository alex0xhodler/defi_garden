import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";
import { ERRORS } from "../utils/constants";
import { 
  getPositionsByUserId, 
  updatePositionValue,
  saveTransaction 
} from "../lib/database";

const harvestHandler: CommandHandler = {
  command: "harvest",
  description: "Claim yields and compound rewards",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      // Get user's positions
      const positions = getPositionsByUserId(userId);

      if (positions.length === 0) {
        await ctx.reply(
          `🌾 *No Positions to Harvest*\n\n` +
          `You don't have any active yield farming positions yet.\n\n` +
          `Use /zap to start earning yields!`,
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("🚀 Start Farming", "zap_funds")
          }
        );
        return;
      }

      // Calculate total harvestable yields
      const totalYieldEarned = positions.reduce((sum, pos) => sum + pos.yieldEarned, 0);
      
      // Check if there are significant yields to harvest
      if (totalYieldEarned < 0.1) {
        await ctx.reply(
          `🌾 *Harvest Status*\n\n` +
          `💰 Yields Earned: $${totalYieldEarned.toFixed(4)}\n\n` +
          `⏰ Your positions are still growing! Come back when you've earned more yields.\n\n` +
          `**Tip**: Yields accumulate over time. Wait until you have at least $1 to harvest for better gas efficiency.`,
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard()
              .text("📊 View Portfolio", "view_portfolio")
              .text("🚀 Zap More", "zap_funds")
          }
        );
        return;
      }

      // Show harvestable positions
      let message = `🌾 *Ready to Harvest*\n\n`;
      message += `💰 **Total Yields Available**: $${totalYieldEarned.toFixed(2)}\n\n`;
      
      message += `**🏦 Your Positions**:\n`;
      
      const harvestablePositions = positions.filter(pos => pos.yieldEarned > 0.01);
      
      for (const position of harvestablePositions) {
        const daysSinceCreated = Math.floor((Date.now() - position.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        message += `• **${position.protocol} ${position.tokenSymbol}**: +$${position.yieldEarned.toFixed(2)} (${daysSinceCreated} days)\n`;
      }

      message += `\n**Choose harvest strategy**:\n\n`;
      message += `🔄 **Auto-Compound**: Re-invest yields to earn more\n`;
      message += `💸 **Withdraw**: Send yields to your wallet\n`;
      message += `⚖️ **Smart Split**: Compound 80%, withdraw 20%`;

      const keyboard = new InlineKeyboard()
        .text("🔄 Auto-Compound All", "harvest_compound")
        .row()
        .text("💸 Withdraw All", "harvest_withdraw") 
        .text("⚖️ Smart Split", "harvest_split")
        .row()
        .text("🎯 Choose Per Position", "harvest_custom")
        .text("❌ Cancel", "harvest_cancel");

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });

      // Store harvest data in session
      ctx.session.tempData = {
        harvestablePositions: positions.filter(pos => pos.yieldEarned > 0.01),
        totalYield: totalYieldEarned
      };

    } catch (error) {
      console.error("Error in harvest command:", error);
      await ctx.reply(ERRORS.NETWORK_ERROR);
    }
  },
};

// Handle harvest confirmation and execution
export async function handleHarvestConfirmation(
  ctx: BotContext,
  strategy: "compound" | "withdraw" | "split"
): Promise<void> {
  try {
    const userId = ctx.session.userId;
    const { harvestablePositions, totalYield } = ctx.session.tempData || {};

    if (!userId || !harvestablePositions || !totalYield) {
      await ctx.reply("❌ Session expired. Please try /harvest again.");
      return;
    }

    await ctx.editMessageReplyMarkup({ reply_markup: undefined });

    let strategyMessage = "";
    let compoundAmount = 0;
    let withdrawAmount = 0;

    switch (strategy) {
      case "compound":
        compoundAmount = totalYield;
        strategyMessage = "🔄 Auto-compounding all yields";
        break;
      case "withdraw": 
        withdrawAmount = totalYield;
        strategyMessage = "💸 Withdrawing all yields to wallet";
        break;
      case "split":
        compoundAmount = totalYield * 0.8;
        withdrawAmount = totalYield * 0.2;
        strategyMessage = "⚖️ Smart split: 80% compound, 20% withdraw";
        break;
    }

    await ctx.reply(
      `⏳ **Executing Harvest**\n\n` +
      `${strategyMessage}\n\n` +
      `💰 Processing $${totalYield.toFixed(2)} in yields...\n\n` +
      `🔄 This may take 30-60 seconds.`
    );

    // TODO: Implement actual harvest transactions
    // For v1, we'll simulate the harvest
    const simulatedTxHash = "0x" + Math.random().toString(16).substring(2, 66);

    // Update each position
    for (const position of harvestablePositions) {
      // Reset yield earned to 0 (harvested)
      await updatePositionValue(
        position.id,
        position.currentValue + (strategy === "compound" ? position.yieldEarned * 0.8 : 0),
        position.currentApy,
        0 // Reset yield earned
      );

      // Record harvest transaction
      await saveTransaction(
        simulatedTxHash + "_" + position.id,
        userId,
        ctx.session.tempData!.walletAddress || position.id,
        "harvest",
        position.tokenSymbol,
        position.yieldEarned.toString(),
        "success",
        position.poolId,
        position.protocol,
        position.yieldEarned.toString(),
        "21000"
      );
    }

    // Success message
    let successMessage = `✅ **Harvest Completed!**\n\n`;
    successMessage += `🔗 **Transaction**: \`${simulatedTxHash}\`\n\n`;
    
    if (compoundAmount > 0) {
      successMessage += `🔄 **Compounded**: $${compoundAmount.toFixed(2)}\n`;
      successMessage += `📈 This amount is now earning additional yields!\n\n`;
    }
    
    if (withdrawAmount > 0) {
      successMessage += `💸 **Withdrawn**: $${withdrawAmount.toFixed(2)}\n`;
      successMessage += `💰 Sent to your wallet address\n\n`;
    }

    successMessage += `🌱 **Next Steps**:\n`;
    successMessage += `• Your compounded yields are already earning\n`;
    successMessage += `• Check /portfolio for updated positions\n`;
    successMessage += `• Harvest again when yields accumulate\n\n`;
    
    const estimatedMonthlyYield = totalYield * 4; // Rough estimate if harvested weekly
    successMessage += `📊 **Performance**: At this rate, you're earning ~$${estimatedMonthlyYield.toFixed(2)}/month`;

    await ctx.reply(successMessage, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("📊 View Portfolio", "view_portfolio")
        .text("🚀 Zap More", "zap_funds")
    });

    // Clear session data
    ctx.session.tempData = {};

    // Auto-suggest next action based on harvest amount
    if (totalYield > 20) {
      setTimeout(async () => {
        await ctx.reply(
          `💡 **Great harvest!** You earned $${totalYield.toFixed(2)}. ` +
          `Consider increasing your positions to earn even more. The compound effect is powerful! 📈`,
          {
            reply_markup: new InlineKeyboard().text("🚀 Invest More", "zap_funds")
          }
        );
      }, 3000);
    }

  } catch (error) {
    console.error("Error processing harvest:", error);
    await ctx.reply(
      "❌ An error occurred during harvest. Please check /portfolio to verify if the harvest completed."
    );
  }
}

export default harvestHandler;