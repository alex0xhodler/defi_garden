import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import {
  createUser,
  getUserByTelegramId,
  getUserSettings,
  saveUserSettings,
} from "../lib/database";
import { CommandHandler } from "../types/commands";
import { DEFAULT_SETTINGS } from "../utils/constants";

// Start handler
export const startHandler: CommandHandler = {
  command: "start",
  description: "Start bot and create/import wallet",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.from?.id.toString();

      if (!userId) {
        await ctx.reply("❌ Unable to identify user. Please try again later.");
        return;
      }

      // Set user ID in session
      ctx.session.userId = userId;

      // Check if user already exists
      const existingUser = getUserByTelegramId(userId);

      if (!existingUser) {
        // Register new user
        createUser(
          userId,
          userId,
          ctx.from?.username,
          ctx.from?.first_name,
          ctx.from?.last_name
        );

        // Create default DeFi settings
        saveUserSettings(userId, {
          riskLevel: DEFAULT_SETTINGS.RISK_LEVEL,
          slippage: DEFAULT_SETTINGS.SLIPPAGE,
          autoCompound: DEFAULT_SETTINGS.AUTO_COMPOUND,
          minApy: DEFAULT_SETTINGS.MIN_APY,
        });

        // Welcome message for new users
        await ctx.reply(
          `🌱 *Welcome to DeFi Garden Bot!*\n\n` +
            `Your automated yield farming assistant that finds the best DeFi opportunities.\n\n` +
            `🚀 *Getting Started*\n` +
            `• /create — Create a new wallet\n` +
            `• /import — Import an existing wallet\n\n` +
            `💰 *Wallet Management*\n` +
            `• /wallet — View your wallet address\n` +
            `• /balance — Check token balances\n` +
            `• /deposit — Get your deposit address\n` +
            `• /withdraw — Withdraw to another address\n\n` +
            `🌾 *DeFi Commands*\n` +
            `• /portfolio — View your yield positions\n` +
            `• /zap — Auto-deploy to best yield pools\n` +
            `• /harvest — Claim yields and compound\n` +
            `• /settings — Adjust risk tolerance\n\n` +
            `🛡️ *Safety First*: We only use vetted protocols with high TVL.\n` +
            `🤖 *Auto-Magic*: Just tell me your risk level, I'll find the best yields!\n\n` +
            `Start by creating or importing a wallet, then deposit USDC to begin earning.`,
          { parse_mode: "Markdown" }
        );
      } else {
        // Get user settings
        const settings = getUserSettings(userId);

        if (settings) {
          ctx.session.settings = settings;
        }

        // Welcome back message for existing users
        const keyboard = new InlineKeyboard()
          .text("💰 Balance", "check_balance")
          .text("📊 Portfolio", "view_portfolio")
          .row()
          .text("🚀 Zap", "zap_funds")
          .text("💸 Withdraw", "withdraw")
          .row()
          .text("⚙️ Settings", "open_settings")
          .text("📋 Help", "help");

        await ctx.reply(
          `🌱 *Welcome back to DeFi Garden!*\n\n` +
            `Your automated yield farming assistant is ready.\n\n` +
            `What would you like to do today?`,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );
      }
    } catch (error) {
      console.error("Error in start command:", error);
      await ctx.reply("❌ An error occurred. Please try again later.");
    }
  },
};

// Help handler
export const helpHandler: CommandHandler = {
  command: "help",
  description: "Show help and available commands",
  handler: async (ctx: BotContext) => {
    try {
      await ctx.reply(
        `🌱 *DeFi Garden Bot Help*\n\n` +
          `Your automated yield farming assistant that finds the best DeFi opportunities.\n\n` +
          `🚀 *Getting Started*\n` +
          `• /create — Create a new wallet\n` +
          `• /import — Import an existing wallet\n\n` +
          `💰 *Wallet Management*\n` +
          `• /wallet — View your wallet address\n` +
          `• /balance — Check token balances\n` +
          `• /deposit — Get your deposit address\n` +
          `• /withdraw — Withdraw to another address\n\n` +
          `🌾 *DeFi Commands*\n` +
          `• /portfolio — View your yield farming positions\n` +
          `• /zap — Auto-deploy funds to best yield pools\n` +
          `• /harvest — Claim yields and compound rewards\n` +
          `• /settings — Adjust risk tolerance and preferences\n\n` +
          `🤖 *How It Works*\n` +
          `1. Set your risk level (1=safest, 5=highest yield)\n` +
          `2. I scan 50+ protocols for the best opportunities\n` +
          `3. Auto-deploy to pools with high TVL and good audits\n` +
          `4. Track your yields and compound automatically\n\n` +
          `🛡️ *Safety Features*\n` +
          `• Only vetted protocols with $10M+ TVL\n` +
          `• Gas protection (won't let you overpay)\n` +
          `• 24/7 monitoring with emergency alerts\n` +
          `• You maintain full control of your funds\n\n` +
          `💡 *Pro Tip*: Start with USDC on Base network for cheap gas!`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Error in help command:", error);
      await ctx.reply(
        "❌ An error occurred while displaying help. Please try again later."
      );
    }
  },
};