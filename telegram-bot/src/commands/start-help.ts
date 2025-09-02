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
        await ctx.reply(`👋 Hi ${firstName}! I'm DeFi Garden, your personal yield farming companion.\n\nSetting up your DeFi Garden... 🌱`);

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

        // Auto-create wallet (now includes autoCreated flag)
        const wallet = await generateWallet(userId);
        
        // Set wallet in session
        ctx.session.walletAddress = wallet.address;

        // Start balance monitoring
        updateUserBalanceCheckTime(userId);

        // Create compelling keyboard with export emphasis
        const keyboard = new InlineKeyboard()
          .text("🔑 Export Private Key Now", "export_key")
          .row()
          .text("💰 Check Balance", "check_balance")
          .text("🚀 Start Earning", "zap_auto_deploy")
          .row()
          .text("📋 How it Works", "help");

        await ctx.reply(
          `✨ *You're all set to earn 7% APY on USDC!*\n\n` +
          `Your deposit address:\n` +
          `\`${wallet.address}\`\n\n` +
          `✅ No impermanent loss risk\n` +
          `✅ Only audited protocols ($10M+ TVL)\n` +
          `✅ AI-managed yield optimization\n` +
          `✅ Auto-compounding rewards\n\n` +
          `⚠️ *Save your private key (one-time setup):*\n\n` +
          `Ready to start earning? Send USDC to your address above.\n` +
          `*Network:* Base (ultra-low fees ~$0.01)\n\n` +
          `I'll notify you when funds arrive and start earning automatically!`,
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
          // User exists but no wallet - auto-create like new users
          await ctx.reply(`👋 Welcome back ${firstName}!\n\nSetting up your DeFi Garden... 🌱`);

          // Auto-create wallet (now includes autoCreated flag)
          const newWallet = await generateWallet(userId);
          
          // Set wallet in session
          ctx.session.walletAddress = newWallet.address;

          // Start balance monitoring
          updateUserBalanceCheckTime(userId);

          // Create compelling keyboard with export emphasis
          const keyboard = new InlineKeyboard()
            .text("🔑 Export Private Key Now", "export_key")
            .row()
            .text("💰 Check Balance", "check_balance")
            .text("🚀 Start Earning", "zap_auto_deploy")
            .row()
            .text("📋 How it Works", "help");

          await ctx.reply(
            `✨ *You're all set to earn 7% APY on USDC!*\n\n` +
            `Your deposit address:\n` +
            `\`${newWallet.address}\`\n\n` +
            `✅ No impermanent loss risk\n` +
            `✅ Only audited protocols ($10M+ TVL)\n` +
            `✅ AI-managed yield optimization\n` +
            `✅ Auto-compounding rewards\n\n` +
            `⚠️ *Save your private key (one-time setup):*\n\n` +
            `Ready to start earning? Send USDC to your address above.\n` +
            `*Network:* Base (ultra-low fees ~$0.01)\n\n` +
            `I'll notify you when funds arrive and start earning automatically!`,
            {
              parse_mode: "Markdown",
              reply_markup: keyboard,
            }
          );
        } else {
          // Full returning user experience  
          ctx.session.walletAddress = wallet.address;
          
          const keyboard = new InlineKeyboard()
            .text("💰 Check Balance", "check_balance")
            .text("🚀 Start Earning", "zap_funds")
            .row()
            .text("📊 Portfolio", "view_portfolio")
            .text("🌾 Harvest", "harvest_yields")
            .row()
            .text("⚙️ Settings", "open_settings")
            .text("📋 Help", "help");

          await ctx.reply(
            `🌱 *Welcome back ${firstName}! Ready to earn 7% APY effortlessly?*\n\n` +
            `Your earning address:\n` +
            `\`${wallet.address}\`\n\n` +
            `✅ AI picks best yields daily\n` +
            `✅ No lock-ups, withdraw anytime\n` +
            `✅ Vetted protocols only\n` +
            `✅ Auto-compound while you sleep\n\n` +
            `Send USDC to start earning on Base network.`,
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