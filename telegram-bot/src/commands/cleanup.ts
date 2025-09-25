import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";
import { cleanupUnverifiedTransactions } from "../lib/database";

/**
 * Handles the /cleanup command.
 * This command is an administrative tool to remove unverified or outdated transaction
 * and position records from the database for a specific user, ensuring data integrity.
 * @command /cleanup
 * @description Clean up unverified transactions and positions.
 */
const cleanupHandler: CommandHandler = {
  command: "cleanup",
  description: "Clean up unverified transactions and positions",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply("❌ Please start the bot first with /start command.");
        return;
      }

      // Perform cleanup
      const result = cleanupUnverifiedTransactions(userId);

      await ctx.reply(
        `🧹 **Database Cleanup Complete**\n\n` +
          `**Removed:**\n` +
          `• ${result.deletedTransactions} transactions\n` +
          `• ${result.deletedPositions} positions\n\n` +
          `**Kept:**\n` +
          `• Latest successful transaction only\n` +
          `• Corresponding verified position\n\n` +
          `Your portfolio now shows only verified on-chain data! 📊`
      );

    } catch (error) {
      console.error("Error in cleanup command:", error);
      await ctx.reply("❌ An error occurred during cleanup. Please try again later.");
    }
  },
};

export default cleanupHandler;