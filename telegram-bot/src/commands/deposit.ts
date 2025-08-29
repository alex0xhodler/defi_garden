import { BotContext } from "../context";
import { getWallet } from "../lib/token-wallet";
import { CommandHandler } from "../types/commands";
import { InlineKeyboard } from "grammy";

const depositHandler: CommandHandler = {
  command: "deposit",
  description: "Display your wallet address for deposits",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply("❌ Please start the bot first with /start command.");
        return;
      }

      // Get user's wallet
      const wallet = await getWallet(userId);

      if (!wallet) {
        const keyboard = new InlineKeyboard()
          .text("Create Wallet", "create_wallet")
          .text("Import Wallet", "import_wallet");

        await ctx.reply(
          "❌ You don't have a wallet yet.\n\n" +
            "You need to create or import a wallet first:",
          { reply_markup: keyboard }
        );
        return;
      }

      // Send deposit information
      await ctx.reply(
        `📥 *Deposit Funds to Your Wallet*\n\n` +
          `**Your Base Network Address:**\n` +
          `\`${wallet.address}\`\n\n` +
          `**What to Deposit:**\n` +
          `• **ETH** - Required for gas fees (minimum 0.0001 ETH)\n` +
          `• **USDC** - For DeFi yield farming\n\n` +
          `**Network:** Base (Chain ID: 8453)\n\n` +
          `**Important Notes:**\n` +
          `⚠️ Only send assets on Base network\n` +
          `⛽ ETH is required for all DeFi transactions\n` +
          `📊 Use /balance to check when funds arrive\n` +
          `🔐 Never share your private key\n\n` +
          `**Recommended:**\n` +
          `• 0.001-0.002 ETH for gas fees (~$2-4)\n` +
          `• Any amount of USDC for yield farming\n` +
          `• Base gas is very cheap! (~$0.002 per tx)`,
        {
          parse_mode: "Markdown",
        }
      );

    } catch (error) {
      console.error("Error in deposit command:", error);
      await ctx.reply("❌ An error occurred. Please try again later.");
    }
  },
};

export default depositHandler;
