"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../lib/database");
const cleanupHandler = {
    command: "cleanup",
    description: "Clean up unverified transactions and positions",
    handler: async (ctx) => {
        try {
            const userId = ctx.session.userId;
            if (!userId) {
                await ctx.reply("❌ Please start the bot first with /start command.");
                return;
            }
            // Perform cleanup
            const result = (0, database_1.cleanupUnverifiedTransactions)(userId);
            await ctx.reply(`🧹 **Database Cleanup Complete**\n\n` +
                `**Removed:**\n` +
                `• ${result.deletedTransactions} transactions\n` +
                `• ${result.deletedPositions} positions\n\n` +
                `**Kept:**\n` +
                `• Latest successful transaction only\n` +
                `• Corresponding verified position\n\n` +
                `Your portfolio now shows only verified on-chain data! 📊`);
        }
        catch (error) {
            console.error("Error in cleanup command:", error);
            await ctx.reply("❌ An error occurred during cleanup. Please try again later.");
        }
    },
};
exports.default = cleanupHandler;
