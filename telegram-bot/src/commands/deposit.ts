import { BotContext } from "../context";
import { getWallet } from "../lib/token-wallet";
import { CommandHandler } from "../types/commands";
import { InlineKeyboard } from "grammy";

const depositHandler: CommandHandler = {
  command: "deposit",
  description: "Get your deposit address",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;
      const firstName = ctx.from?.first_name || "there";

      if (!userId) {
        await ctx.reply("❌ Please start the bot first with /start command.");
        return;
      }

      // Get user's wallet
      const wallet = await getWallet(userId);

      if (!wallet) {
        const keyboard = new InlineKeyboard()
          .text("✨ Set Up Wallet", "create_wallet")
          .text("🔑 Import Wallet", "import_wallet");

        await ctx.reply(
          `👋 Hey ${firstName}! You need a wallet first.\n\nLet me set that up for you:`,
          { reply_markup: keyboard }
        );
        return;
      }

      // Create action buttons
      const keyboard = new InlineKeyboard()
        .text("🚀 Start Earning", "zap_auto_deploy")
        .row()
        .text("💰 Check Balance", "check_balance")
        .text("📊 Portfolio", "view_portfolio");

      // Simplified deposit information
      await ctx.reply(
        `💰 *Ready to start earning, ${firstName}?*\n\n` +
          `Send USDC to your address:\n` +
          `\`${wallet.address}\`\n\n` +
          `*Network:* Base (super cheap fees!)\n` +
          `*Minimum:* Any amount\n` +
          `*Gas fees:* Add ~$2 worth of ETH\n\n` +
          `I'll notify you when funds arrive! 🌱`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );

    } catch (error) {
      console.error("Error in deposit command:", error);
      await ctx.reply("❌ Something went wrong. Please try again in a moment.");
    }
  },
};

export default depositHandler;
