import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import {
  createUser,
  getUserByTelegramId,
  getUserSettings,
  saveUserSettings,
  updateUserBalanceCheckTime,
} from "../lib/database";
import { generateWallet } from "../lib/token-wallet";
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
        await ctx.reply(`👋 Hi ${firstName}! I'm DeFi Garden, your personal yield farming companion.\n\nI'm setting up your account to start earning... 🌱`);

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

        // Auto-create wallet with autoCreated flag
        const wallet = await generateWallet(userId);
        
        // Update the wallet to mark it as auto-created
        const walletWithFlag = { ...wallet, autoCreated: true };
        const { saveWallet } = await import("../lib/database");
        saveWallet(walletWithFlag, userId);
        
        // Set wallet in session
        ctx.session.walletAddress = wallet.address;

        // Start balance monitoring
        updateUserBalanceCheckTime(userId);

        // Create simple keyboard for getting started
        const keyboard = new InlineKeyboard()
          .text("💰 Deposit Funds", "deposit")
          .row()
          .text("📋 How it Works", "help");

        await ctx.reply(
          `✨ All set ${firstName}! Your DeFi Garden account is now live on Base.\n\n` +
          `💰 To start earning ~7% APY, simply send USDC to:\n` +
          `\`${wallet.address}\`\n\n` +
          `I'll notify you when funds arrive and start earning automatically.`,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );

      } else {
        // Existing user - check if they have wallet
        const { getWallet } = await import("../lib/token-wallet");
        const wallet = await getWallet(userId);
        
        // Get user settings
        const settings = getUserSettings(userId);
        if (settings) {
          ctx.session.settings = settings;
        }

        if (!wallet) {
          // User exists but no wallet - offer to auto-create
          const keyboard = new InlineKeyboard()
            .text("✨ Set Up Wallet", "create_wallet")
            .text("🔑 Import Wallet", "import_wallet");

          await ctx.reply(
            `👋 Welcome back ${firstName}!\n\n` +
            `Let's get your wallet set up to start earning:`,
            { reply_markup: keyboard }
          );
        } else {
          // Full returning user experience
          ctx.session.walletAddress = wallet.address;
          
          const keyboard = new InlineKeyboard()
            .text("💰 Balance", "check_balance")
            .text("📊 Portfolio", "view_portfolio")
            .row()
            .text("🚀 Earn More", "zap_funds")
            .text("🌾 Harvest", "harvest_yields")
            .row()
            .text("⚙️ Settings", "open_settings")
            .text("📋 Help", "help");

          await ctx.reply(
            `🌱 Welcome back ${firstName}!\n\nYour DeFi Garden is ready. What would you like to do?`,
            {
              parse_mode: "Markdown", 
              reply_markup: keyboard,
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
  description: "How DeFi Garden works",
  handler: async (ctx: BotContext) => {
    try {
      const firstName = ctx.from?.first_name || "there";

      const keyboard = new InlineKeyboard()
        .text("💰 Start Earning", "deposit")
        .text("📊 View Portfolio", "view_portfolio")
        .row()
        .text("⚙️ Settings", "open_settings")
        .text("🔄 Main Menu", "start");

      await ctx.reply(
        `🌱 *How DeFi Garden Works*\n\n` +
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