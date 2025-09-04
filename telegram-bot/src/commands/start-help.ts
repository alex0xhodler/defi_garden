import { InlineKeyboard } from "grammy";
import { Address } from "viem";
import { BotContext } from "../context";
import {
  createUser,
  getUserByTelegramId,
  getUserSettings,
  saveUserSettings,
  updateUserBalanceCheckTime,
  startDepositMonitoring,
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

        // Start balance monitoring (legacy system for onboarding)
        updateUserBalanceCheckTime(userId);
        
        // Start 5-minute deposit monitoring window
        startDepositMonitoring(userId, 5);
        
        // Manual balance checking system will handle deposit detection
        console.log(`🔄 User ${userId} ready for manual balance checks`);
        
        // Get current APY
        const { getCompoundV3APY } = await import("../lib/defillama-api");
        const apy = await getCompoundV3APY();

        // Check for deposit button - monitoring starts automatically
        const keyboard = new InlineKeyboard()
          .text("🔍 Check for Deposit", "manual_balance_check");

        await ctx.reply(
          `✨ *You're all set to earn ${apy}% APY on USDC!*\n\n` +
          `💰 *Your inkvest address:*\n` +
          `\`${wallet.address}\`\n\n` +
          `Send USDC on Base ↑ to start earning.\n\n` +
          `✅ Gasless transactions (we sponsor gas)\n` +
          `✅ Auto-deployed to highest yields\n` +
          `✅ Withdraw anytime, zero lock-ups\n\n` +
          `I'll auto-deploy as soon as funds arrive! 🦑`,
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
          
          // Manual balance checking system will handle deposit detection
          console.log(`🔄 User ${userId} ready for manual balance checks`);
          
          // Get current APY
          const { getCompoundV3APY } = await import("../lib/defillama-api");
          const apy = await getCompoundV3APY();

          // Check for deposit button - monitoring starts automatically
          const keyboard = new InlineKeyboard()
            .text("🔍 Check for Deposit", "manual_balance_check");

          await ctx.reply(
            `✨ *You're all set to earn ${apy}% APY on USDC!*\n\n` +
            `💰 *Your inkvest address:*\n` +
            `\`${newWallet.address}\`\n\n` +
            `Send USDC on Base ↑ to start earning.\n\n` +
            `✅ Gasless transactions (we sponsor gas)\n` +
            `✅ Auto-deployed to highest yields\n` +
            `✅ Withdraw anytime, zero lock-ups\n\n` +
            `I'll auto-deploy as soon as funds arrive! 🦑`,
            {
              parse_mode: "Markdown",
              reply_markup: keyboard,
            }
          );
        } else {
          // Existing user with wallet - check if they have any funds
          ctx.session.walletAddress = wallet.address;
          
          // Check both wallet USDC balance and DeFi positions
          const { getCoinbaseWalletUSDCBalance } = await import("../lib/coinbase-wallet");
          const { getAaveBalance, getFluidBalance, getCompoundBalance } = await import("../lib/token-wallet");
          
          try {
            const [walletUsdc, aaveBalance, fluidBalance, compoundBalance] = await Promise.all([
              getCoinbaseWalletUSDCBalance(wallet.address as Address),
              getAaveBalance(wallet.address as Address),
              getFluidBalance(wallet.address as Address),
              getCompoundBalance(wallet.address as Address)
            ]);

            const walletUsdcNum = parseFloat(walletUsdc);
            const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
            const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
            const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
            
            const totalFunds = walletUsdcNum + aaveBalanceNum + fluidBalanceNum + compoundBalanceNum;
            
            console.log(`🔍 User ${firstName} funds check: Wallet: $${walletUsdcNum}, Aave: $${aaveBalanceNum}, Fluid: $${fluidBalanceNum}, Compound: $${compoundBalanceNum}, Total: $${totalFunds}`);
            
            if (totalFunds > 0.01) {
              // User has funds - show full main menu
              const { createMainMenuKeyboard, getMainMenuMessage } = await import("../utils/mainMenu");

              await ctx.reply(
                await getMainMenuMessage(firstName, wallet.address, userId),
                {
                  parse_mode: "Markdown", 
                  reply_markup: createMainMenuKeyboard(),
                }
              );
            } else {
              // User has no funds - show deposit screen
              const keyboard = new InlineKeyboard()
                .text("🔍 Check for Deposit", "manual_balance_check");

              await ctx.reply(
                `👋 *Welcome back ${firstName}!*\n\n` +
                `💰 *Your inkvest address:*\n` +
                `\`${wallet.address}\`\n\n` +
                `Send USDC on Base ↑ to start earning.\n\n` +
                `⚡ *I'm watching 24/7* - funds auto-deploy instantly when they arrive.`,
                {
                  parse_mode: "Markdown",
                  reply_markup: keyboard,
                }
              );
            }
          } catch (error) {
            console.error("Error checking user funds for", firstName, ":", error);
            // Fallback to basic deposit screen
            const keyboard = new InlineKeyboard()
              .text("🔍 Check for Deposit", "manual_balance_check");

            await ctx.reply(
              `👋 *Welcome back ${firstName}!*\n\n` +
              `💰 *Your inkvest address:*\n` +
              `\`${wallet.address}\`\n\n` +
              `Send USDC on Base ↑ to start earning.\n\n` +
              `⚡ *I'm watching 24/7* - funds auto-deploy instantly when they arrive.`,
              {
                parse_mode: "Markdown",
                reply_markup: keyboard,
              }
            );
          }
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
      
      // Get highest APY for marketing message
      const { getHighestAPY } = await import("../lib/defillama-api");
      const highestAPY = await getHighestAPY();

      const keyboard = new InlineKeyboard()
        .text("💰 Start Earning", "deposit")
        .text("📊 View Portfolio", "view_portfolio")
        .row()
        .text("⚙️ Settings", "open_settings")
        .text("🔄 Main Menu", "main_menu");

      await ctx.reply(
        `🦑 *How inkvest Works*\n\n` +
          `Hi ${firstName}! I'm your personal yield farming assistant.\n\n` +
          `🐙 *What I Do*\n` +
          `• Find the best DeFi yields (~${highestAPY}% APY)\n` +
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