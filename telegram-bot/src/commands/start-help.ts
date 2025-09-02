import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import {
  createUser,
  getUserByTelegramId,
  getUserSettings,
  saveUserSettings,
  updateUserBalanceCheckTime,
} from "../lib/database";
import { generateCoinbaseSmartWallet, getCoinbaseSmartWallet, hasCoinbaseSmartWallet } from "../lib/coinbase-wallet";
import { CommandHandler } from "../types/commands";
import { DEFAULT_SETTINGS } from "../utils/constants";

// Start handler with auto-wallet creation
export const startHandler: CommandHandler = {
  command: "start",
  description: "Start bot and begin earning",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.from?.id.toString();
      const firstName = ctx.from?.first_name || "there";

      if (!userId) {
        await ctx.reply("❌ Unable to identify user. Please try again later.");
        return;
      }

      // Set user ID in session
      ctx.session.userId = userId;

      // Check if user already exists
      const existingUser = getUserByTelegramId(userId);

      if (!existingUser) {
        // New user - auto-create everything
        await ctx.reply(`👋 Hi ${firstName}! I'm inkvest, your personal yield farming companion.\n\nSetting up your inkvest account... 🦑`);

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

        // Auto-create Coinbase Smart Wallet
        const wallet = await generateCoinbaseSmartWallet(userId);
        
        // Set wallet in session
        ctx.session.walletAddress = wallet.address;

        // Start balance monitoring
        updateUserBalanceCheckTime(userId);

        // Only export key button - monitoring starts automatically
        const keyboard = new InlineKeyboard()
          .text("🔑 Export Private Key", "export_key");

        await ctx.reply(
          `✨ *You're all set to earn 8.33% APY on USDC!*\n\n` +
          `🦑 *Your inkvest Smart Wallet:*\n` +
          `\`${wallet.address}\`\n\n` +
          `✅ Gasless transactions (we sponsor gas)\n` +
          `✅ Auto-deployed to Compound V3 (8.33% APY)\n` +
          `✅ No impermanent loss risk\n` +
          `✅ Instant deployment upon deposit\n\n` +
          `⚠️ *Save your private key (one-time setup):*\n\n` +
          `Ready to start earning? Send USDC to your address above.\n` +
          `*Network:* Base (ultra-low fees)\n\n` +
          `I'll auto-deploy to highest yield as soon as funds arrive! 🚀`,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );

      } else {
        // Existing user - check if they have Coinbase Smart Wallet
        const wallet = await (async () => {
          if (hasCoinbaseSmartWallet(userId)) {
            return await getCoinbaseSmartWallet(userId);
          }
          return null;
        })();
        
        // Get user settings
        const settings = getUserSettings(userId);
        if (settings) {
          ctx.session.settings = settings;
        }

        if (!wallet) {
          // User exists but no wallet - auto-create Coinbase Smart Wallet
          await ctx.reply(`👋 Welcome back ${firstName}!\n\nSetting up your inkvest Smart Wallet... 🦑`);

          // Auto-create Coinbase Smart Wallet
          const newWallet = await generateCoinbaseSmartWallet(userId);
          
          // Set wallet in session
          ctx.session.walletAddress = newWallet.address;

          // Start balance monitoring
          updateUserBalanceCheckTime(userId);

          // Only export key button - monitoring starts automatically
          const keyboard = new InlineKeyboard()
            .text("🔑 Export Private Key", "export_key");

          await ctx.reply(
            `✨ *You're all set to earn 8.33% APY on USDC!*\n\n` +
            `🦑 *Your inkvest Smart Wallet:*\n` +
            `\`${newWallet.address}\`\n\n` +
            `✅ Gasless transactions (we sponsor gas)\n` +
            `✅ Auto-deployed to Compound V3 (8.33% APY)\n` +
            `✅ No impermanent loss risk\n` +
            `✅ Instant deployment upon deposit\n\n` +
            `⚠️ *Save your private key (one-time setup):*\n\n` +
            `Ready to start earning? Send USDC to your address above.\n` +
            `*Network:* Base (ultra-low fees)\n\n` +
            `I'll auto-deploy to highest yield as soon as funds arrive! 🚀`,
            {
              parse_mode: "Markdown",
              reply_markup: keyboard,
            }
          );
        } else {
          // Full returning user experience  
          ctx.session.walletAddress = wallet.address;
          
          const { createMainMenuKeyboard, getMainMenuMessage } = await import("../utils/mainMenu");

          await ctx.reply(
            getMainMenuMessage(firstName, wallet.address),
            {
              parse_mode: "Markdown", 
              reply_markup: createMainMenuKeyboard(),
            }
          );
        }
      }
    } catch (error) {
      console.error("Error in start command:", error);
      await ctx.reply("❌ Something went wrong. Please try again in a moment.");
    }
  },
};

// Help handler with simplified messaging
export const helpHandler: CommandHandler = {
  command: "help",
  description: "How inkvest works",
  handler: async (ctx: BotContext) => {
    try {
      const firstName = ctx.from?.first_name || "there";

      const keyboard = new InlineKeyboard()
        .text("💰 Start Earning", "deposit")
        .text("📊 View Portfolio", "view_portfolio")
        .row()
        .text("⚙️ Settings", "open_settings")
        .text("🔄 Main Menu", "main_menu");

      await ctx.reply(
        `🦑 *How inkvest Works*\n\n` +
          `Hi ${firstName}! I'm your personal yield farming assistant.\n\n` +
          `🤖 *What I Do*\n` +
          `• Find the best DeFi yields (~7% APY)\n` +
          `• Auto-deploy your funds safely\n` +
          `• Monitor and compound earnings\n\n` +
          `🛡️ *Safety First*\n` +
          `• Only use vetted protocols ($10M+ TVL)\n` +
          `• You keep full control of funds\n` +
          `• Base network = ultra-low fees\n\n` +
          `💰 *Getting Started*\n` +
          `1. Send USDC to your deposit address\n` +
          `2. I'll notify when funds arrive\n` +
          `3. Auto-deploy to best opportunities\n` +
          `4. Watch your money grow! 🌱`,
        { 
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
    } catch (error) {
      console.error("Error in help command:", error);
      await ctx.reply("❌ Something went wrong. Please try again in a moment.");
    }
  },
};