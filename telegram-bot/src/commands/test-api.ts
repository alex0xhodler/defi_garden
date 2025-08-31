import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";

const testApiHandler: CommandHandler = {
  command: "test_api",
  description: "Test DeFiLlama API integration (development only)",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply("❌ Please start the bot first with /start command.");
        return;
      }

      await ctx.reply("🔄 Testing DeFiLlama API integration...\n\nThis may take a few seconds...");

      // Import and test the API
      const { testDeFiLlamaAPI } = await import("../lib/defillama-api");
      
      // Run the test
      await testDeFiLlamaAPI();
      
      await ctx.reply(
        "✅ **API Test Completed!**\n\n" +
        "Real-time yield data has been fetched successfully. " +
        "Check the console logs for detailed APY information.\n\n" +
        "The bot is now using live data from DeFiLlama for yield calculations!"
      );

    } catch (error) {
      console.error("API test error:", error);
      await ctx.reply(
        "❌ **API Test Failed**\n\n" +
        `Error: ${(error as Error).message}\n\n` +
        "The bot will fall back to cached yield data. " +
        "This might be due to network issues or API rate limits."
      );
    }
  },
};

export default testApiHandler;