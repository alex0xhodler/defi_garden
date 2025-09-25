import { InlineKeyboard } from "grammy";
import { Address } from "viem";
import { BotContext } from "../context";
import {
  createUser,
  getUserByTelegramId,
  getUserSettings,
  saveUserSettings,
  updateUserBalanceCheckTime,
  startDepositMonitoringWithContext,
  startDepositMonitoring,
} from "../lib/database";
import { generateCoinbaseSmartWallet, getCoinbaseSmartWallet, hasCoinbaseSmartWallet } from "../lib/coinbase-wallet";
import { CommandHandler } from "../types/commands";
import { DEFAULT_SETTINGS } from "../utils/constants";

// Start handler with auto-wallet creation
export const startHandler: CommandHandler = {
  command: "start",
  description: "Welcome to inkvest - start earning today",
  handler: async (ctx: BotContext) => {
    try {
      let userId = ctx.session.userId;
      const firstName = ctx.from?.first_name || "there";
      console.log(`🚨 DEBUG: START COMMAND CALLED for user ${userId} (${firstName}) at ${new Date().toISOString()}`);      
      
      // 🚨 FIX: Handle undefined userId (session issue)
      if (!userId) {
        userId = ctx.from?.id?.toString();
        console.log(`🚨 DEBUG: userId was undefined, using Telegram ID: ${userId}`);
        if (userId) {
          ctx.session.userId = userId;
        } else {
          console.error(`🚨 CRITICAL: Cannot determine userId for user ${firstName}`);
          await ctx.reply(`❌ Sorry, there was a session error. Please try /start again.`);
          return;
        }
      }

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
        await ctx.reply(`👋 Hi ${firstName}! I'm inkvest, your personal high-yield savings assistant.\n\nCreating your secure inkvest account with exportable wallet... 🦑`);

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
        
        // Start 5-minute deposit monitoring window (new user onboarding)
        startDepositMonitoringWithContext(userId, 'onboarding', 5, {
          userType: 'new_user',
          walletCreated: true
        });
        
        // Manual balance checking system will handle deposit detection
        console.log(`🔄 User ${userId} ready for manual balance checks`);
        
        // Use real-time APY with immediate response and updates
        const { sendMessageWithRealtimeAPY } = await import("../utils/realtime-apy-updater");
        
        // Check for deposit button - monitoring starts automatically
        const keyboard = new InlineKeyboard()
          .text("🔍 Check for Deposit", "manual_balance_check");

        await sendMessageWithRealtimeAPY(ctx, {
          generateMessage: (apy: number, isLoading: boolean) => {
            const baseMessage = `✨ *You're all set to earn ${apy}% APY on your deposits!*\n\n` +
              `💰 *Your inkvest deposit address:*\n` +
              `\`${wallet.address}\`\n\n` +
              `Send USDC to this address ↑ (on Base blockchain network) to start earning.\n\n` +
              `✅ inkvest pays for the transaction\n` +
              `✅ Funds auto-deposit to highest rates\n` +
              `✅ Withdraw anytime, no penalties or lock-ups\n\n` +
              `I'll start earning interest as soon as funds arrive! 🦑`;
            
            return isLoading ? baseMessage + `\n\n⏳ *Getting latest rates...*` : baseMessage;
          },
          keyboard
        }, userId);

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
          await ctx.reply(`👋 Welcome back ${firstName}!\n\nCreating your secure inkvest wallet (fully exportable)... 🦑`);

          // Auto-create Coinbase Smart Wallet
          const newWallet = await generateCoinbaseSmartWallet(userId);
          
          // Set wallet in session
          ctx.session.walletAddress = newWallet.address;

          // Start balance monitoring
          updateUserBalanceCheckTime(userId);
          
          // Manual balance checking system will handle deposit detection
          console.log(`🔄 User ${userId} ready for manual balance checks`);
          
          // Use real-time APY with immediate response and updates
          const { sendMessageWithRealtimeAPY } = await import("../utils/realtime-apy-updater");
          
          // Check for deposit button - monitoring starts automatically
          const keyboard = new InlineKeyboard()
            .text("🔍 Check for Deposit", "manual_balance_check");

          await sendMessageWithRealtimeAPY(ctx, {
            generateMessage: (apy: number, isLoading: boolean) => {
              const baseMessage = `✨ *You're all set to earn ${apy}% APY on your deposits!*\n\n` +
                `💰 *Your inkvest deposit address:*\n` +
                `\`${newWallet.address}\`\n\n` +
                `Send USDC to this address ↑ (on Base blockchain network) to start earning.\n\n` +
                `✅ inkvest pays for the transaction\n` +
                `✅ Funds auto-deposit to highest rates\n` +
                `✅ Withdraw anytime, no penalties or lock-ups\n\n` +
                `I'll start earning interest as soon as funds arrive! 🦑`;
              
              return isLoading ? baseMessage + `\n\n⏳ *Getting latest rates...*` : baseMessage;
            },
            keyboard
          }, userId);
        } else {
          // Existing user with wallet - check if they have any funds
          ctx.session.walletAddress = wallet.address;
          
          // Check both wallet USDC balance and DeFi positions
          const { getCoinbaseWalletUSDCBalance, getCoinbaseSmartWallet } = await import("../lib/coinbase-wallet");
          const { getAaveBalance, getFluidBalance, getCompoundBalance } = await import("../lib/token-wallet");
          const { getMorphoBalance } = await import("../services/morpho-defi");
          const { getSparkBalance } = await import("../services/spark-defi");
          const { getSeamlessBalance } = await import("../services/seamless-defi");
          const { getMoonwellBalance } = await import("../services/moonwell-defi");
          const { getMorphoRe7Balance } = await import("../services/morpho-re7-defi");
          
          try {
            // Get Smart Wallet address for new protocols (since deposits are made via CDP)
            const smartWallet = await getCoinbaseSmartWallet(userId);
            const smartWalletAddress = smartWallet?.smartAccount.address;
            
            const [walletUsdc, aaveBalance, fluidBalance, compoundBalance, morphoBalance, sparkBalance, seamlessBalance, moonwellBalance, morphoRe7Balance] = await Promise.all([
              getCoinbaseWalletUSDCBalance(wallet.address as Address),
              getAaveBalance(wallet.address as Address),
              getFluidBalance(wallet.address as Address),
              getCompoundBalance(wallet.address as Address),
              getMorphoBalance(wallet.address as Address),
              // Check Spark balance on Smart Wallet address since deposits are made there
              smartWalletAddress ? getSparkBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
              // Check Seamless balance on Smart Wallet address since deposits are made there
              smartWalletAddress ? getSeamlessBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
              // Check Moonwell balance on Smart Wallet address since deposits are made there
              smartWalletAddress ? getMoonwellBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
              // Check Morpho Re7 balance on Smart Wallet address since deposits are made there
              smartWalletAddress ? getMorphoRe7Balance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' })
            ]);

            const walletUsdcNum = parseFloat(walletUsdc);
            const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
            const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
            const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
            const morphoBalanceNum = parseFloat(morphoBalance.assetsFormatted);
            const sparkBalanceNum = parseFloat(sparkBalance.assetsFormatted);
            const seamlessBalanceNum = parseFloat(seamlessBalance.assetsFormatted);
            const moonwellBalanceNum = parseFloat(moonwellBalance.assetsFormatted);
            const morphoRe7BalanceNum = parseFloat(morphoRe7Balance.assetsFormatted);
            
            const totalFunds = walletUsdcNum + aaveBalanceNum + fluidBalanceNum + compoundBalanceNum + morphoBalanceNum + sparkBalanceNum + seamlessBalanceNum + moonwellBalanceNum + morphoRe7BalanceNum;
            
            console.log(`🔍 User ${firstName} funds check: Wallet: $${walletUsdcNum}, Aave: $${aaveBalanceNum}, Fluid: $${fluidBalanceNum}, Compound: $${compoundBalanceNum}, Morpho: $${morphoBalanceNum}, Spark: $${sparkBalanceNum}, Seamless: $${seamlessBalanceNum}, Moonwell: $${moonwellBalanceNum}, Re7: $${morphoRe7BalanceNum}, Total: $${totalFunds}`);
            
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
              // User has no funds - show deposit screen and START MONITORING
              console.log(`🚨 DEBUG: About to send no-funds message to user ${userId}`);
              
              startDepositMonitoringWithContext(userId, 'onboarding', 5, {
                userType: 'existing_low_balance',
                totalFunds: totalFunds
              });
              console.log(`🎯 Started onboarding monitoring for user ${userId} (/start - no funds)`);

              // Force refresh monitoring service to include this user
              try {
                const eventMonitor = await import("../services/event-monitor");
                await eventMonitor.forceRefreshWallets();
                console.log(`🔄 Refreshed monitoring service for user ${userId}`);
              } catch (error) {
                console.log("Event monitor refresh failed:", error instanceof Error ? error.message : String(error));
              }

              
              try {
                const keyboard = new InlineKeyboard()
                  .text("🔍 Check for Deposit", "manual_balance_check");

                console.log(`🚨 DEBUG: Attempting to send reply to user ${userId}, chat ID: ${ctx.chat?.id}`);
                const messageResult = await ctx.reply(
                  `👋 *Welcome back ${firstName}!*\n\n` +
                  `🐙 *Your inkvest savings account address:*\n` +
                  `\`${wallet.address}\`\n\n` +
                  `Send USDC on Base ↑ to start earning.\n\n` +
                  `⚡ *I'm watching 24/7* - funds auto-deploy instantly when they arrive.`,
                  {
                    parse_mode: "Markdown",
                    reply_markup: keyboard,
                  }
                );
                console.log(`✅ DEBUG: Successfully sent no-funds reply to user ${userId}, message ID: ${messageResult.message_id}`);
              } catch (replyError) {
                console.error(`🚨 DEBUG: Failed to send reply to user ${userId}:`, replyError);
                // Try sending a simple message without formatting
                try {
                  await ctx.reply(`Welcome back ${firstName}! Send USDC to: ${wallet.address}`);
                  console.log(`✅ DEBUG: Sent fallback message to user ${userId}`);
                } catch (fallbackError) {
                  console.error(`🚨 DEBUG: Even fallback message failed for user ${userId}:`, fallbackError);
                }
              }
            }
          } catch (error) {
            console.error("Error checking user funds for", firstName, ":", error);
            
            // Fallback to basic deposit screen - ALSO START MONITORING
            startDepositMonitoringWithContext(userId, 'onboarding', 5, {
              userType: 'existing_fallback',
              error: 'balance_check_failed'
            });
            console.log(`🎯 Started onboarding monitoring for user ${userId} (/start - fallback)`);

            // Force refresh monitoring service
            try {
              const eventMonitor = await import("../services/event-monitor");
              await eventMonitor.forceRefreshWallets();
              console.log(`🔄 Refreshed monitoring service for user ${userId}`);
            } catch (refreshError) {
              console.log("Event monitor refresh failed:", refreshError instanceof Error ? refreshError.message : String(refreshError));
            }
            
            const keyboard = new InlineKeyboard()
              .text("🔍 Check for Deposit", "manual_balance_check");

            await ctx.reply(
              `👋 *Welcome back ${firstName}!*\n\n` +
              `🐙 *Your inkvest savings account address:*\n` +
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
      
      // Get highest APY for marketing message with consistency
      const { getConsistentAPY } = await import("../utils/consistent-apy");
      const highestAPY = await getConsistentAPY(ctx.session.userId, 'initial');

      const keyboard = new InlineKeyboard()
        .text("💰 Start Earning", "deposit")
        .text("📊 View Portfolio", "view_portfolio")
        .row()
        .text("⚙️ Settings", "open_settings")
        .text("🔄 Main Menu", "main_menu");

      await ctx.reply(
        `🦑 *How inkvest Works*\n\n` +
          `Hi ${firstName}! I'm your personal high-yield savings assistant.\n\n` +
          `🐙 *What I Do*\n` +
          `• Find the best interest rates (~${highestAPY}% APY)\n` +
          `• Auto-deposit your funds safely\n` +
          `• Monitor and compound your earnings\n\n` +
          `🛡️ *Safety & Control*\n` +
          `• Only use established platforms ($10M+ deposits)\n` +
          `• You own your wallet + can export anytime\n` +
          `• Ultra-low fees on Base network\n\n` +
          `💰 *Getting Started*\n` +
          `1. Send USDC to your deposit address\n` +
          `2. I'll notify when funds arrive\n` +
          `3. Auto-deposit to best rates\n` +
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