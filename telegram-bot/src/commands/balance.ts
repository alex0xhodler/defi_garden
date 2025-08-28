import { BotContext } from "../context";
import { getWallet, getEthBalance, getMultipleTokenBalances } from "../lib/token-wallet";
import { formatBalanceMessage } from "../utils/formatters";
import { CommandHandler } from "../types/commands";
import { InlineKeyboard } from "grammy";
import { Address } from "viem";
import { TokenInfo } from "../types/config";
import { BASE_TOKENS, isRpcConfigured } from "../utils/constants";

// Handler for balance command
export const balanceHandler: CommandHandler = {
  command: "balance",
  description: "Show current ETH + filtered ERC-20 balances",
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
        await ctx.reply(
          "❌ You don't have a wallet yet.\n\n" +
            "Use /create to create a new wallet or /import to import an existing one."
        );
        return;
      }

      // Check RPC configuration first
      if (!isRpcConfigured()) {
        await ctx.reply(
          "❌ **RPC Configuration Error**\n\n" +
          "Your RPC endpoint is not properly configured. Please:\n\n" +
          "1. Get a proper RPC endpoint from QuickNode or similar\n" +
          "2. Update your `.env` file:\n" +
          "   `QUICKNODE_RPC=https://your-endpoint.quiknode.pro/your-key`\n" +
          "3. Restart the bot\n\n" +
          "**Current RPC**: Using rate-limited public endpoint\n" +
          "**Solution**: Get a dedicated RPC with higher limits",
          { parse_mode: "Markdown" }
        );
        return;
      }

      await ctx.reply("⏳ Fetching your balances...");

      try {
        // Get ETH balance
        const ethBalance = await getEthBalance(wallet.address);

        // Get token balances - only check USDC to reduce RPC calls
        const tokenBalances = await getMultipleTokenBalances(
          [BASE_TOKENS.USDC], // Only check USDC to minimize RPC calls
          wallet.address as Address
        );

        // Create actions keyboard
        const keyboard = new InlineKeyboard()
          .text("📥 Deposit", "deposit")
          .row()
          .text("💱 Buy Token", "buy_token")
          .text("💱 Sell Token", "sell_token")
          .row()
          .text("📤 Withdraw", "withdraw");

        // Format and send balance message
        const message = formatBalanceMessage(ethBalance, tokenBalances);

        await ctx.reply(message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });

      } catch (rpcError: any) {
        console.error("RPC Error in balance command:", rpcError);
        
        if (rpcError.message === "RPC_NOT_CONFIGURED") {
          await ctx.reply(
            "❌ **RPC Configuration Error**\n\n" +
            "Please update your `.env` file with a proper RPC endpoint:\n" +
            "`QUICKNODE_RPC=https://your-endpoint.quiknode.pro/your-key`",
            { parse_mode: "Markdown" }
          );
        } else if (rpcError?.cause?.status === 429 || rpcError?.details?.includes('rate limit')) {
          await ctx.reply(
            "⏳ **Rate Limit Hit**\n\n" +
            "Your RPC endpoint is being rate limited. Please:\n\n" +
            "• Wait a few minutes and try again\n" +
            "• Consider upgrading to a higher-tier RPC plan\n" +
            "• Or use a different RPC provider\n\n" +
            "Current endpoint appears to have low rate limits."
          );
        } else {
          await ctx.reply(
            "❌ **Network Error**\n\n" +
            "Failed to fetch balances. This might be due to:\n\n" +
            "• RPC endpoint issues\n" +
            "• Network connectivity problems\n" +
            "• Temporary service outage\n\n" +
            "Please try again in a few minutes."
          );
        }
      }
    } catch (error) {
      console.error("Error in balance command:", error);
      await ctx.reply(
        "❌ An unexpected error occurred while fetching your balances. Please try again later."
      );
    }
  },
};

