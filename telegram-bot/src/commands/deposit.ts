import { BotContext } from "../context";
import { getWallet } from "../lib/token-wallet";
import { CommandHandler } from "../types/commands";
import { InlineKeyboard } from "grammy";
import { startDepositMonitoringWithContext } from "../lib/database";

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

      // Get the deposit address (now deterministic from database)
      const depositAddress = wallet.address;
      
      // Log for verification
      if (wallet.type === 'coinbase-smart-wallet') {
        console.log(`📍 Using Smart Wallet deposit address: ${depositAddress}`);
      }

      // Start 5-minute monitoring window for generic deposits (no auto-deploy)
      startDepositMonitoringWithContext(userId, 'generic_deposit', 5, {
        command: '/deposit',
        walletType: wallet.type
      });
      
      // Manual balance checking system will handle deposit detection
      if (wallet.type === 'coinbase-smart-wallet' && wallet.autoCreated) {
        console.log(`🆕 New Smart Wallet ready for manual balance checks`);
      }
      console.log(`🔄 User ${userId} ready for manual balance checks`);

      // Create action buttons with multiple payment options
      const keyboard = new InlineKeyboard()
        .text("🦑 Start Earning", "zap_auto_deploy")
        .row()
        .text("💳 Apple Pay", "buy_usdc_applepay")
        .text("🏪 Coinbase", "buy_usdc_coinbase")
        .row()
        .text("💰 Check Balance", "check_balance")
        .text("📊 Portfolio", "view_portfolio");

      // Enhanced deposit information with multiple payment options
      await ctx.reply(
        `💰 *Ready to start earning, ${firstName}?*\n\n` +
          `**Option 1: Send USDC directly**\n` +
          `\`${depositAddress}\`\n` +
          `*Network:* Base (super cheap fees!)\n\n` +
          `**Option 2: Buy USDC instantly** 💳\n` +
          `• Apple Pay - Fast checkout\n` +
          `• Coinbase - Traditional purchase\n\n` +
          `*Minimum:* Any amount\n` +
          `*Gas fees:* Sponsored by inkvest! 🦑\n\n` +
          `✅ **Now monitoring for deposits** (5 minutes)\n` +
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
