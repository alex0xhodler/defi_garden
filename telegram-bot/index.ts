import { Bot, session, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import { BotContext, createInitialSessionData } from "./src/context";
import { initDatabase, closeDatabase } from "./src/lib/database";
import { verifyEncryptionKey } from "./src/lib/encryption";

// Import commands
import { startHandler, helpHandler } from "./src/commands/start-help";
import { walletHandler, createHandler } from "./src/commands/wallet";
import { importHandler, exportHandler, handlePrivateKeyInput, handleExportConfirmation, handleFundMigration } from "./src/commands/import-export";
import { balanceHandler, handleWithdrawEth, handleWithdrawUsdc, handleWithdrawTextInput } from "./src/commands/balance";
import zapHandler, {
  handlePoolSelection,
  handleZapAmountInput,
  handleZapConfirmation,
  handleZapRetry,
  handleAutoEarn,
} from "./src/commands/zap";
import earnHandler from "./src/commands/earn";
import portfolioHandler, { handlePortfolioDetails } from "./src/commands/portfolio";
import harvestHandler, { handleHarvestConfirmation } from "./src/commands/harvest";
import settingsHandler, {
  handleSettingsOption,
  updateSlippage,
  updateRiskLevel,
  updateMinApy,
} from "./src/commands/settings";
import depositHandler from "./src/commands/deposit";
import withdrawHandler, {
  handleWithdrawCallbacks,
  handleWithdrawAmountInput,
} from "./src/commands/withdraw";

// Load environment variables
dotenv.config();

// Initialize database
initDatabase();

// Verify encryption key is set
if (!verifyEncryptionKey()) {
  console.error(
    "⛔ ERROR: Wallet encryption key is not properly configured. Set a 32-character WALLET_ENCRYPTION_KEY in your .env file."
  );
  process.exit(1);
}

// Create bot instance
const bot = new Bot<BotContext>(process.env.TELEGRAM_BOT_TOKEN || "");

// Set up session middleware
bot.use(
  session({
    initial: createInitialSessionData,
  })
);

// Register command handlers
bot.command(startHandler.command, startHandler.handler);
bot.command(walletHandler.command, walletHandler.handler);
bot.command(createHandler.command, createHandler.handler);
bot.command(importHandler.command, importHandler.handler);
bot.command(exportHandler.command, exportHandler.handler);
bot.command(balanceHandler.command, balanceHandler.handler);
bot.command(portfolioHandler.command, portfolioHandler.handler);
bot.command(zapHandler.command, zapHandler.handler);
bot.command(earnHandler.command, earnHandler.handler);
bot.command(harvestHandler.command, harvestHandler.handler);
bot.command(settingsHandler.command, settingsHandler.handler);
bot.command(depositHandler.command, depositHandler.handler);
bot.command(withdrawHandler.command, withdrawHandler.handler);
bot.command(helpHandler.command, helpHandler.handler);

// Set bot commands menu
bot.api.setMyCommands([
  { command: startHandler.command, description: startHandler.description },
  { command: walletHandler.command, description: walletHandler.description },
  { command: balanceHandler.command, description: balanceHandler.description },
  { command: portfolioHandler.command, description: portfolioHandler.description },
  { command: earnHandler.command, description: earnHandler.description },
  { command: harvestHandler.command, description: harvestHandler.description },
  { command: settingsHandler.command, description: settingsHandler.description },
  { command: depositHandler.command, description: depositHandler.description },
  { command: withdrawHandler.command, description: withdrawHandler.description },
  { command: helpHandler.command, description: helpHandler.description },
]);

// Add cancel command
bot.command("cancel", async (ctx) => {
  if (ctx.session.currentAction || ctx.session.awaitingWithdrawAmount) {
    ctx.session.currentAction = undefined;
    ctx.session.tempData = {};
    ctx.session.awaitingWithdrawAmount = false;
    await ctx.reply("✅ Operation cancelled.");
  } else {
    await ctx.reply("There is no active operation to cancel.");
  }
});

// Add test command to verify bot is receiving commands
bot.command("test", async (ctx) => {
  console.log("🧪 TEST COMMAND EXECUTED - Bot is receiving commands!");
  await ctx.reply("🧪 Test successful! Bot is working.");
});

// Smart Recovery Handler Functions
async function handleRetryPendingTransaction(ctx: BotContext) {
  try {
    const { getPendingTransaction, clearPendingTransaction } = await import("./src/utils/smart-recovery");
    const pending = getPendingTransaction(ctx);
    
    if (!pending) {
      await ctx.reply("❌ No pending transaction found or it has expired.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    // Verify user has sufficient balance now
    const { getWallet, getMultipleTokenBalances, formatTokenAmount } = await import("./src/lib/token-wallet");
    const { BASE_TOKENS } = await import("./src/utils/constants");
    
    const wallet = await getWallet(ctx.session.userId!);
    if (!wallet) {
      await ctx.reply("❌ Wallet not found. Please set up your wallet first.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    const tokenBalances = await getMultipleTokenBalances([BASE_TOKENS.USDC], wallet.address);
    const usdcBalance = tokenBalances.find(token => token.symbol === "USDC");
    
    if (!usdcBalance) {
      await ctx.reply("❌ No USDC balance found. Please deposit USDC first.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    const readableBalance = parseFloat(formatTokenAmount(usdcBalance.balance, 6, 2));
    
    if (readableBalance < pending.amount) {
      const stillNeeded = pending.amount - readableBalance;
      await ctx.reply(
        `❌ **Still insufficient balance**\n\n` +
        `**Your balance**: $${readableBalance.toFixed(2)} USDC\n` +
        `**Needed**: $${pending.amount.toFixed(2)} USDC\n` +
        `**Short by**: $${stillNeeded.toFixed(2)} USDC\n\n` +
        `Please deposit more USDC to complete this investment.`
      );
      await ctx.answerCallbackQuery();
      return;
    }
    
    // Set up session for transaction execution
    ctx.session.tempData = {
      amount: pending.amount.toString(),
      selectedPool: pending.poolId,
      poolInfo: {
        protocol: pending.protocol,
        apy: pending.apy
      }
    };
    
    ctx.session.currentAction = "zap_confirm";
    
    // Clear pending transaction
    clearPendingTransaction(ctx);
    
    // Execute the investment
    await ctx.reply("⏳ **Processing your investment...**\n\nThis may take 30-60 seconds.");
    await handleZapConfirmation(ctx, true);
    
    await ctx.answerCallbackQuery("Investment started!");
    
  } catch (error) {
    console.error("Error handling retry pending transaction:", error);
    await ctx.reply("❌ An error occurred while processing your investment. Please try again.");
    await ctx.answerCallbackQuery();
  }
}

async function handleCancelPendingTransaction(ctx: BotContext) {
  try {
    const { clearPendingTransaction } = await import("./src/utils/smart-recovery");
    clearPendingTransaction(ctx);
    
    ctx.session.tempData = {};
    ctx.session.currentAction = undefined;
    
    await ctx.reply("✅ **Pending investment cancelled**\n\nYour funds remain safe in your wallet. You can invest them anytime using /earn or /zap.");
    await ctx.answerCallbackQuery("Investment cancelled");
    
  } catch (error) {
    console.error("Error cancelling pending transaction:", error);
    await ctx.reply("❌ An error occurred while cancelling. Please try again.");
    await ctx.answerCallbackQuery();
  }
}

async function handleInvestAvailable(ctx: BotContext) {
  try {
    const { getPendingTransaction, clearPendingTransaction } = await import("./src/utils/smart-recovery");
    const pending = getPendingTransaction(ctx);
    
    if (!pending) {
      await ctx.reply("❌ No pending transaction found or it has expired.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    // Get current balance
    const { getWallet, getMultipleTokenBalances, formatTokenAmount } = await import("./src/lib/token-wallet");
    const { BASE_TOKENS } = await import("./src/utils/constants");
    
    const wallet = await getWallet(ctx.session.userId!);
    if (!wallet) {
      await ctx.reply("❌ Wallet not found. Please set up your wallet first.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    const tokenBalances = await getMultipleTokenBalances([BASE_TOKENS.USDC], wallet.address);
    const usdcBalance = tokenBalances.find(token => token.symbol === "USDC");
    
    if (!usdcBalance) {
      await ctx.reply("❌ No USDC balance found. Please deposit USDC first.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    const availableAmount = parseFloat(formatTokenAmount(usdcBalance.balance, 6, 2));
    
    if (availableAmount < 1) {
      await ctx.reply("❌ Insufficient balance. Minimum investment is $1 USDC.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    // Set up session for transaction execution with available amount
    ctx.session.tempData = {
      amount: availableAmount.toString(),
      selectedPool: pending.poolId,
      poolInfo: {
        protocol: pending.protocol,
        apy: pending.apy
      }
    };
    
    ctx.session.currentAction = "zap_confirm";
    
    // Clear pending transaction
    clearPendingTransaction(ctx);
    
    // Show confirmation
    const yearlyYield = (availableAmount * pending.apy) / 100;
    const monthlyYield = yearlyYield / 12;
    
    const confirmKeyboard = new InlineKeyboard()
      .text("✅ Confirm", "confirm_yes")
      .text("❌ Cancel", "confirm_no");
    
    await ctx.reply(
      `🎯 **Investment Confirmation**\n\n` +
      `**Available Amount**: $${availableAmount.toFixed(2)} USDC\n` +
      `**Selected Pool**: ${pending.protocol}\n` +
      `**Current APY**: ${pending.apy}%\n\n` +
      `**Estimated Returns**:\n` +
      `• Monthly: ~$${monthlyYield.toFixed(2)}\n` +
      `• Yearly: ~$${yearlyYield.toFixed(2)}\n\n` +
      `Proceed with this investment?`,
      {
        parse_mode: "Markdown",
        reply_markup: confirmKeyboard
      }
    );
    
    await ctx.answerCallbackQuery("Using available balance");
    
  } catch (error) {
    console.error("Error handling invest available:", error);
    await ctx.reply("❌ An error occurred while processing your request. Please try again.");
    await ctx.answerCallbackQuery();
  }
}

async function handleManualDepositCheck(ctx: BotContext) {
  try {
    const { getPendingTransaction, clearPendingTransaction } = await import("./src/utils/smart-recovery");
    const pending = getPendingTransaction(ctx);
    
    if (!pending) {
      await ctx.reply("❌ No pending transaction found or it has expired.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    await ctx.reply("🔍 **Checking for deposits...**\n\nPlease wait while I scan the blockchain...");
    
    // Get current balance to check if deposit was received
    const { getWallet, getMultipleTokenBalances, formatTokenAmount } = await import("./src/lib/token-wallet");
    const { BASE_TOKENS } = await import("./src/utils/constants");
    
    const wallet = await getWallet(ctx.session.userId!);
    if (!wallet) {
      await ctx.reply("❌ Wallet not found. Please set up your wallet first.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    const tokenBalances = await getMultipleTokenBalances([BASE_TOKENS.USDC], wallet.address);
    const usdcBalance = tokenBalances.find(token => token.symbol === "USDC");
    
    if (!usdcBalance) {
      await ctx.reply("❌ No USDC balance found. Please make sure you deposited to the correct address on Base network.");
      await ctx.answerCallbackQuery();
      return;
    }
    
    const currentBalance = parseFloat(formatTokenAmount(usdcBalance.balance, 6, 2));
    const stillNeeded = pending.amount - currentBalance;
    
    console.log(`🔍 Manual deposit check: User ${ctx.session.userId} has $${currentBalance}, needs $${pending.amount} (shortage: $${stillNeeded})`);
    
    if (stillNeeded <= 0) {
      // Sufficient balance now - offer completion
      const { InlineKeyboard } = await import("grammy");
      
      const keyboard = new InlineKeyboard()
        .text(`✅ Complete ${pending.protocol} Investment (${pending.apy}% APY)`, "retry_pending_transaction")
        .row()
        .text("💼 Keep in Wallet", "cancel_pending_transaction")
        .text("🎯 View Options", "main_menu");
      
      await ctx.reply(
        `🎉 **Deposit Confirmed!**\n\n` +
        `✅ You now have **$${currentBalance.toFixed(2)} USDC**\n` +
        `✅ Sufficient for your **$${pending.amount} investment**\n\n` +
        `**Ready to complete:**\n` +
        `• Protocol: ${pending.protocol}\n` +
        `• Amount: $${pending.amount}\n` +
        `• APY: ${pending.apy}%\n\n` +
        `Shall I complete your investment now?`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
      
    } else if (currentBalance > (pending.amount - pending.shortage)) {
      // Partial deposit received
      const { InlineKeyboard } = await import("grammy");
      
      // Update shortage in pending transaction
      pending.shortage = stillNeeded;
      
      const keyboard = new InlineKeyboard()
        .text(`📥 Deposit $${stillNeeded.toFixed(2)} More`, "deposit")
        .text("🔍 Check Again", "manual_deposit_check")
        .row()
        .text("💰 Invest Available Funds", "invest_available")
        .text("❌ Cancel", "cancel_pending_transaction");
      
      await ctx.reply(
        `💰 **Partial Deposit Detected**\n\n` +
        `**Your balance**: $${currentBalance.toFixed(2)} USDC\n` +
        `**Still needed**: $${stillNeeded.toFixed(2)} USDC\n\n` +
        `**Your pending investment:**\n` +
        `• ${pending.protocol} at ${pending.apy}% APY\n` +
        `• Total needed: $${pending.amount}\n\n` +
        `What would you like to do?`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
      
    } else {
      // No deposit detected yet
      const { InlineKeyboard } = await import("grammy");
      
      const keyboard = new InlineKeyboard()
        .text("🔍 Check Again", "manual_deposit_check")
        .text(`📥 Deposit $${pending.shortage.toFixed(2)}`, "deposit")
        .row()
        .text("💰 Invest Available", "invest_available")
        .text("❌ Cancel", "cancel_pending_transaction");
      
      await ctx.reply(
        `🔍 **No New Deposits Found**\n\n` +
        `**Your balance**: $${currentBalance.toFixed(2)} USDC\n` +
        `**Still needed**: $${stillNeeded.toFixed(2)} USDC\n\n` +
        `**Tips:**\n` +
        `• Make sure you sent USDC to: \`${wallet.address}\`\n` +
        `• Verify you're using **Base network** (not Ethereum mainnet)\n` +
        `• Transactions can take 1-2 minutes to confirm\n\n` +
        `**Your target investment:** ${pending.protocol} at ${pending.apy}% APY`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
    }
    
    await ctx.answerCallbackQuery("Balance checked!");
    
  } catch (error) {
    console.error("Error in manual deposit check:", error);
    await ctx.reply("❌ An error occurred while checking your balance. Please try again.");
    await ctx.answerCallbackQuery();
  }
}

// Handle callback queries
bot.on("callback_query:data", async (ctx) => {
  const callbackData = ctx.callbackQuery.data;

  // Handle withdraw-specific callbacks first
  if (callbackData === "withdraw_aave_max" || callbackData === "withdraw_fluid_max" || callbackData === "withdraw_compound_max" || callbackData === "withdraw_morpho_max" || callbackData === "withdraw_spark_max" || callbackData === "withdraw_seamless_max" || callbackData === "withdraw_moonwell_max" ||
      callbackData === "withdraw_fluid_menu" || callbackData === "withdraw_aave_menu" || callbackData === "withdraw_compound_menu" || callbackData === "withdraw_morpho_menu" || callbackData === "withdraw_spark_menu" || callbackData === "withdraw_seamless_menu" || callbackData === "withdraw_moonwell_menu" ||
      callbackData === "withdraw_fluid_custom" || callbackData === "withdraw_aave_custom" || callbackData === "withdraw_compound_custom" || callbackData === "withdraw_morpho_custom" || callbackData === "withdraw_spark_custom" || callbackData === "withdraw_seamless_custom" || callbackData === "withdraw_moonwell_custom" ||
      callbackData === "withdraw_aave_custom_with_rewards" || callbackData === "withdraw_aave_custom_no_rewards" ||
      callbackData === "withdraw_compound_custom_with_rewards" || callbackData === "withdraw_compound_custom_no_rewards" ||
      callbackData === "withdraw_custom" || callbackData === "withdraw_custom_with_rewards" || callbackData === "withdraw_custom_no_rewards" ||
      callbackData.startsWith("confirm_withdraw_") || callbackData.startsWith("cancel_withdraw_")) {
    await handleWithdrawCallbacks(ctx);
    return;
  }

  // Fund migration callbacks
  if (callbackData === "confirm_fund_migration") {
    await handleFundMigration(ctx, true);
    await ctx.answerCallbackQuery();
    return;
  } else if (callbackData === "skip_fund_migration") {
    await handleFundMigration(ctx, false);
    await ctx.answerCallbackQuery();
    return;
  }

  // Confirmation callbacks
  else if (callbackData === "confirm_yes") {
    switch (ctx.session.currentAction) {
      case "export_wallet":
        await handleExportConfirmation(ctx, true);
        break;
      case "zap_confirm":
        await handleZapConfirmation(ctx, true);
        break;
      default:
        await ctx.answerCallbackQuery("Unknown action");
    }
  } else if (callbackData === "confirm_no") {
    switch (ctx.session.currentAction) {
      case "export_wallet":
        await handleExportConfirmation(ctx, false);
        break;
      case "zap_confirm":
        await handleZapConfirmation(ctx, false);
        break;
      default:
        await ctx.answerCallbackQuery("Unknown action");
    }
  }

  // Main menu callbacks
  else if (callbackData === "check_balance") {
    await balanceHandler.handler(ctx);
  } else if (callbackData === "view_portfolio") {
    await portfolioHandler.handler(ctx);
  } else if (callbackData === "zap_funds") {
    await zapHandler.handler(ctx);
  } else if (callbackData === "harvest_yields") {
    await harvestHandler.handler(ctx);
  } else if (callbackData === "open_settings") {
    await settingsHandler.handler(ctx);
  } else if (callbackData === "open_portfolio") {
    await portfolioHandler.handler(ctx);
  } else if (callbackData === "deposit") {
    await depositHandler.handler(ctx);
  } else if (callbackData === "withdraw") {
    await withdrawHandler.handler(ctx);
  } else if (callbackData === "help") {
    await helpHandler.handler(ctx);
  } else if (callbackData === "manual_balance_check") {
    // Manual balance check for onboarding users - Start monitoring for deposits
    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.reply("❌ Please start the bot first with /start command.");
      return;
    }

    // Start deposit monitoring for 5 minutes when user manually checks balance
    const { startDepositMonitoringWithContext } = await import("./src/lib/database");
    startDepositMonitoringWithContext(userId, 'balance_check', 5, {
      trigger: 'manual_balance_check_button'
    });
    console.log(`🎯 Started balance_check monitoring for user ${userId} (manual_balance_check)`);

    // Force refresh monitoring service to include this user immediately
    try {
      const eventMonitor = await import("./src/services/event-monitor");
      await eventMonitor.forceRefreshWallets();
      console.log(`🔄 Refreshed monitoring service for user ${userId}`);
    } catch (error) {
      console.log("Event monitor refresh failed:", error instanceof Error ? error.message : String(error));
    }

    const { getCoinbaseSmartWallet, getCoinbaseWalletUSDCBalance } = await import("./src/lib/coinbase-wallet");
    const wallet = await getCoinbaseSmartWallet(userId);
    
    if (!wallet) {
      await ctx.reply("❌ No Coinbase Smart Wallet found. Please use /start to create one.");
      return;
    }

    await ctx.answerCallbackQuery("Checking for deposits...");
    
    try {
      // Check USDC balance
      const usdcBalance = await getCoinbaseWalletUSDCBalance(wallet.address);
      const balanceNum = parseFloat(usdcBalance.toString());
      
      if (balanceNum > 0.01) {
        // Funds detected! Check if first-time user or existing user
        const { getUserByTelegramId } = await import("./src/lib/database");
        const user = getUserByTelegramId(userId);
        const isFirstTimeUser = !user || user.onboardingCompleted === null;
        
        if (isFirstTimeUser) {
          // First-time user - auto-deploy for quick onboarding
          console.log(`🆕 First-time deposit detected: $${balanceNum} USDC for user ${userId}`);
          
          // Determine the highest APY protocol
          const { fetchRealTimeYields } = await import("./src/lib/defillama-api");
          const yields = await fetchRealTimeYields();
          const sortedYields = yields.sort((a, b) => b.apy - a.apy);
          const highestYieldProtocol = sortedYields[0];
        
        // Map protocol names to deployment functions
        const protocolMap = {
          'Aave': { deployFn: 'gaslessDeployToAave', displayName: 'Aave V3' },
          'Fluid': { deployFn: 'gaslessDeployToFluid', displayName: 'Fluid' },
          'Compound': { deployFn: 'autoDeployToCompoundV3', displayName: 'Compound V3' }
        };
        
        const protocolConfig = protocolMap[highestYieldProtocol.project as keyof typeof protocolMap];
        const bestProtocol = protocolConfig ? {
          protocol: protocolConfig.displayName,
          deployFn: protocolConfig.deployFn,
          apy: highestYieldProtocol.apy,
          project: highestYieldProtocol.project
        } : {
          protocol: 'Compound V3',
          deployFn: 'autoDeployToCompoundV3', 
          apy: 7.65,
          project: 'Compound'
        };
        
          await ctx.editMessageText(
            `🎉 *First deposit detected!*\n\n` +
            `${usdcBalance.toString()} USDC found in your wallet!\n\n` +
            `Auto-deploying to ${bestProtocol.protocol} (${bestProtocol.apy}% APY) with sponsored gas...`,
            { parse_mode: "Markdown" }
          );
          
          const firstName = ctx.from?.first_name || "there";
        
        // Execute sponsored deployment
        setTimeout(async () => {
          try {
            const coinbaseDefi = await import("./src/services/coinbase-defi");
            
            let deployResult: { success: boolean; txHash?: string; error?: string };
            
            if (bestProtocol.deployFn === 'autoDeployToCompoundV3') {
              deployResult = await coinbaseDefi.autoDeployToCompoundV3(userId, usdcBalance.toString());
            } else if (bestProtocol.deployFn === 'gaslessDeployToAave') {
              deployResult = await coinbaseDefi.gaslessDeployToAave(userId, usdcBalance.toString());
            } else if (bestProtocol.deployFn === 'gaslessDeployToFluid') {
              deployResult = await coinbaseDefi.gaslessDeployToFluid(userId, usdcBalance.toString());
            } else {
              throw new Error(`Unknown deployment function: ${bestProtocol.deployFn}`);
            }
            
            if (deployResult.success) {
              // Send success message with main menu
              const { createMainMenuKeyboard, getMainMenuMessage } = await import("./src/utils/mainMenu");
              
              // Import earnings utilities
              const { calculateDetailedEarnings, formatTxLink } = await import("./src/utils/earnings");
              const earnings = calculateDetailedEarnings(parseFloat(usdcBalance.toString()), bestProtocol.apy);
              
              await ctx.editMessageText(
                `🐙 *Welcome to your **inkvest** savings account!*\n\n` +
                `💰 **Position Summary:**\n` +
                `• Invested: $${usdcBalance.toString()} USDC into ${bestProtocol.protocol}\n` +
                `• APY: ${bestProtocol.apy}% (auto-compounding)\n` +
                `• Strategy: Gasless & automated\n\n` +
                `📈 **Your Earnings Breakdown:**\n` +
                `• Daily: ${earnings.dailyWithContext}\n` +
                `• Weekly: ${earnings.weekly}\n` +
                `• Monthly: ${earnings.monthly}\n` +
                `• Yearly: ${earnings.yearly}\n` +
                `• Time to 2x: ~${earnings.timeToDouble}\n\n` +
                `✅ **Benefits:**\n` +
                `• ${earnings.comparisonMultiple} better than US savings (${earnings.savingsApy})\n` +
                `• Gas sponsored by inkvest\n` +
                `• Withdraw anytime, no penalties\n\n` +
                (deployResult.txHash ? 
                  `📝 [View Investment](https://basescan.org/tx/${deployResult.txHash})` : 
                  `📝 Investment completed successfully`),
                { 
                  parse_mode: "Markdown",
                  reply_markup: createMainMenuKeyboard()
                }
              );
            } else {
              const { createMainMenuKeyboard } = await import("./src/utils/mainMenu");
              
              await ctx.editMessageText(
                `⚠️ *Deployment failed*\n\n` +
                `${usdcBalance.toString()} USDC found but couldn't auto-deploy to ${bestProtocol.protocol}.\n\n` +
                `Error: ${deployResult.error}\n\n` +
                `Please try manual deployment via the bot menu.`,
                { 
                  parse_mode: "Markdown",
                  reply_markup: createMainMenuKeyboard()
                }
              );
            }
          } catch (error) {
            console.error("Error completing manual onboarding:", error);
            await ctx.editMessageText(
              `❌ Error during deployment. Please try again later.`,
              { parse_mode: "Markdown" }
            );
          }
        }, 2000);
        
        } else {
          // Existing user - show balance with investment options
          console.log(`💰 Existing user deposit detected: $${balanceNum} USDC for user ${userId}`);
          
          const { InlineKeyboard } = await import("grammy");
          const keyboard = new InlineKeyboard()
            .text("🦑 inkvest Automanaged", "zap_auto_deploy")
            .row()
            .text("📊 View Portfolio", "view_portfolio")
            .text("💰 Check Balance", "check_balance")
            .row()
            .text("🔄 Main Menu", "main_menu");
          
          await ctx.editMessageText(
            `💰 **Deposit confirmed!**\n\n` +
            `$${balanceNum.toFixed(2)} USDC found in your wallet\n\n` +
            `Your funds are ready! Choose your investment approach:`,
            { 
              parse_mode: "Markdown",
              reply_markup: keyboard
            }
          );
        }
        
      } else {
        // No funds yet - improved messaging
        const { getHighestAPY } = await import("./src/lib/defillama-api");
        const apy = await getHighestAPY();
        
        const keyboard = new InlineKeyboard()
          .text("🔍 Check Again", "manual_balance_check")
          .row()
          .text("📋 How to Send USDC", "deposit_help");
          
        await ctx.editMessageText(
          `🔍 *Monitoring your inkvest address...*\n\n` +
          `💰 *Your earning address:*\n\`${wallet.address}\`\n\n` +
          `No deposits detected yet. Send USDC on Base network to start earning ${apy}% APY!\n\n` +
          `⚡ *I'm watching 24/7* - funds auto-deploy instantly when they arrive.`,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );
      }
      
    } catch (error) {
      console.error("Error checking manual balance:", error);
      
      const keyboard = new InlineKeyboard()
        .text("🔍 Try Again", "manual_balance_check")
        .row()
        .text("📋 How to Send USDC", "deposit_help");
        
      await ctx.editMessageText(
        "❌ *Connection issue*\n\nCouldn't check your balance. Please try again in a moment.",
        { 
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
    }
  } else if (callbackData === "deposit_help") {
    // Help with depositing USDC - Start monitoring for deposits
    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.reply("❌ Please start the bot first with /start command.");
      return;
    }
    
    const { getCoinbaseSmartWallet } = await import("./src/lib/coinbase-wallet");
    const wallet = await getCoinbaseSmartWallet(userId);
    
    if (!wallet) {
      await ctx.reply("❌ No wallet found. Please use /start to create one.");
      return;
    }

    // Start deposit monitoring for 5 minutes when user requests deposit help
    const { startDepositMonitoringWithContext } = await import("./src/lib/database");
    startDepositMonitoringWithContext(userId, 'balance_check', 5, {
      trigger: 'deposit_help_button'
    });
    console.log(`🎯 Started balance_check monitoring for user ${userId} (deposit_help)`);

    // Force refresh monitoring service to include this user immediately
    try {
      const eventMonitor = await import("./src/services/event-monitor");
      await eventMonitor.forceRefreshWallets();
      console.log(`🔄 Refreshed monitoring service for user ${userId}`);
    } catch (error) {
      console.log("Event monitor refresh failed:", error instanceof Error ? error.message : String(error));
    }
    
    const keyboard = new InlineKeyboard()
      .text("🔍 Check for Deposit", "manual_balance_check")
      .row()
      .text("🔄 Back to Main", "main_menu");
    
    await ctx.editMessageText(
      `📋 *How to Send USDC to inkvest*\n\n` +
      `💰 *Your address:*\n\`${wallet.address}\`\n\n` +
      `📱 *From Mobile Wallet (Coinbase, MetaMask, etc.):*\n` +
      `1. Open your wallet app\n` +
      `2. Find "Send" or "Transfer"\n` +
      `3. Select USDC token\n` +
      `4. Paste your address above ↑\n` +
      `5. Choose **Base network** (important!)\n` +
      `6. Send any amount (min $1)\n\n` +
      `💻 *From Exchange (Coinbase, Binance, etc.):*\n` +
      `1. Go to "Withdraw" or "Send"\n` +
      `2. Select USDC\n` +
      `3. Choose **Base network**\n` +
      `4. Paste your address above ↑\n\n` +
      `⚡ *Once sent, I'll auto-deploy within seconds!*`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
  } else if (callbackData === "main_menu") {
    // Standardized main menu for all contexts
    const { createMainMenuKeyboard, getMainMenuMessage } = await import("./src/utils/mainMenu");
    const firstName = ctx.from?.first_name || "there";
    
    // Get wallet address from session or database
    let walletAddress = ctx.session.walletAddress;
    if (!walletAddress && ctx.session.userId) {
      const { getWallet } = await import("./src/lib/token-wallet");
      const wallet = await getWallet(ctx.session.userId);
      if (wallet) {
        walletAddress = wallet.address;
        ctx.session.walletAddress = wallet.address; // Update session
      }
    }
    
    // Try to edit message first, fallback to reply
    try {
      await ctx.editMessageText(
        await getMainMenuMessage(firstName, walletAddress, ctx.session.userId),
        {
          parse_mode: "Markdown",
          reply_markup: createMainMenuKeyboard(),
        }
      );
    } catch (error) {
      // If editing fails, send new message
      await ctx.reply(
        await getMainMenuMessage(firstName, walletAddress, ctx.session.userId),
        {
          parse_mode: "Markdown",
          reply_markup: createMainMenuKeyboard(),
        }
      );
    }
  } else if (callbackData === "portfolio_details") {
    await handlePortfolioDetails(ctx);
  } else if (callbackData === "retry_zap") {
    await handleZapRetry(ctx);
  }

  // Harvest callbacks
  else if (callbackData === "harvest_compound") {
    await handleHarvestConfirmation(ctx, "compound");
  } else if (callbackData === "harvest_withdraw") {
    await handleHarvestConfirmation(ctx, "withdraw");
  } else if (callbackData === "harvest_split") {
    await handleHarvestConfirmation(ctx, "split");
  } else if (callbackData === "harvest_cancel") {
    ctx.session.tempData = {};
    await ctx.editMessageText(
      "🌾 Harvest cancelled. Your yields remain in the protocols earning interest.",
      {
        reply_markup: new InlineKeyboard()
          .text("📊 View Portfolio", "view_portfolio")
          .text("🔄 Try Again", "harvest_yields")
      }
    );
  } else if (callbackData === "harvest_yields") {
    await harvestHandler.handler(ctx);
  }

  // Balance menu withdraw callbacks
  else if (callbackData === "withdraw_eth") {
    await handleWithdrawEth(ctx);
  } else if (callbackData === "withdraw_usdc") {
    await handleWithdrawUsdc(ctx);
  }

  // Auto-deployment vs manual selection
  else if (callbackData === "zap_auto_deploy") {
    await handleAutoEarn(ctx);
  } else if (callbackData === "zap_choose_protocol") {
    ctx.session.zapMode = "manual";
    // Show protocol selection
    await handlePoolSelection(ctx);
  }

  // Pool selection callbacks
  else if (callbackData.startsWith("pool_")) {
    const poolId = callbackData.replace("pool_", "");
    ctx.session.tempData!.selectedPool = poolId;
    
    // We need to get the pool info and store it as well
    const { getYieldOpportunities } = await import("./src/commands/zap");
    const opportunities = await getYieldOpportunities("USDC");
    const selectedPoolData = opportunities.find(pool => pool.poolId === poolId);
    
    if (selectedPoolData) {
      const { calculateRiskScore } = await import("./src/commands/zap");
      
      // Protocol mapping for deployment metadata (matches event-monitor.js)
      const protocolMap = {
        'Aave': {
          deployFn: 'gaslessDeployToAave',
          service: '../services/coinbase-defi',
          displayName: 'Aave V3'
        },
        'Fluid': {
          deployFn: 'gaslessDeployToFluid',
          service: '../services/coinbase-defi', 
          displayName: 'Fluid'
        },
        'Compound': {
          deployFn: 'autoDeployToCompoundV3',
          service: '../services/coinbase-defi',
          displayName: 'Compound V3'
        },
        'Morpho': {
          deployFn: 'deployToMorphoPYTH',
          service: '../services/morpho-defi',
          displayName: 'Morpho PYTH/USDC'
        },
        'Spark': {
          deployFn: 'deployToSpark',
          service: '../services/spark-defi',
          displayName: 'Spark Protocol'
        },
        'Seamless': {
          deployFn: 'deployToSeamless',
          service: '../services/seamless-defi',
          displayName: 'Seamless Protocol'
        },
        'Moonwell': {
          deployFn: 'deployToMoonwell',
          service: '../services/moonwell-defi',
          displayName: 'Moonwell USDC'
        },
        'Moonwell USDC': {
          deployFn: 'deployToMoonwell',
          service: '../services/moonwell-defi',
          displayName: 'Moonwell USDC'
        }
      };
      
      const protocolConfig = protocolMap[selectedPoolData.project as keyof typeof protocolMap];
      
      ctx.session.tempData!.poolInfo = {
        protocol: selectedPoolData.project,
        apy: selectedPoolData.apy,
        tvlUsd: selectedPoolData.tvlUsd,
        riskScore: calculateRiskScore(selectedPoolData),
        // Add deployment metadata for manual protocol completion
        deployFn: protocolConfig?.deployFn,
        service: protocolConfig?.service,
        displayName: protocolConfig?.displayName || selectedPoolData.project,
        project: selectedPoolData.project
      };
    }
    
    ctx.session.currentAction = "zap_amount";
    // Ask for amount
    await ctx.editMessageText(
      "💰 How much would you like to invest?\n\nEnter the amount in USDC:",
      { parse_mode: "Markdown" }
    );
  }

  // Settings callbacks
  else if (callbackData.startsWith("settings_")) {
    const option = callbackData.replace("settings_", "") as
      | "risk"
      | "slippage"
      | "minApy"
      | "reset"
      | "back"
      | "export_key";
    
    console.log(`🔧 Settings callback: "${callbackData}" → option: "${option}"`);

    if (option === "back") {
      // Go back to standardized main menu
      const { createMainMenuKeyboard, getMainMenuMessage } = await import("./src/utils/mainMenu");
      const firstName = ctx.from?.first_name || "there";
      
      // Get wallet address from session or database
      let walletAddress = ctx.session.walletAddress;
      if (!walletAddress && ctx.session.userId) {
        const { getWallet } = await import("./src/lib/token-wallet");
        const wallet = await getWallet(ctx.session.userId);
        if (wallet) {
          walletAddress = wallet.address;
          ctx.session.walletAddress = wallet.address; // Update session
        }
      }
      
      await ctx.editMessageText(
        await getMainMenuMessage(firstName, walletAddress, ctx.session.userId),
        {
          parse_mode: "Markdown",
          reply_markup: createMainMenuKeyboard(),
        }
      );
    } else if (option === "export_key") {
      // Handle export private key from settings
      const { exportHandler } = await import("./src/commands/import-export");
      await exportHandler.handler(ctx);
    } else if (option === "reset") {
      // Handle reset to defaults
      const userId = ctx.session.userId;
      if (!userId) {
        await ctx.answerCallbackQuery("Session expired");
        return;
      }

      // Import constants and database functions
      const { DEFAULT_SETTINGS } = await import("./src/utils/constants");
      const { saveUserSettings } = await import("./src/lib/database");

      // Reset to default settings
      ctx.session.settings = {
        userId,
        riskLevel: DEFAULT_SETTINGS.RISK_LEVEL,
        slippage: DEFAULT_SETTINGS.SLIPPAGE,
        autoCompound: DEFAULT_SETTINGS.AUTO_COMPOUND,
        minApy: DEFAULT_SETTINGS.MIN_APY,
      };

      // Save to database
      await saveUserSettings(userId, ctx.session.settings);

      await ctx.answerCallbackQuery("Settings reset to defaults!");
      await ctx.editMessageText(
        `🔄 **Settings Reset to Defaults**\n\n` +
        `✅ Risk Level: **3** (Moderate)\n` +
        `✅ Min APY: **5%**\n\n` +
        `Your settings have been restored to the recommended defaults.\n\n` +
        `💡 You can adjust them anytime from the Settings menu.`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("⚙️ Settings", "open_settings")
            .text("🔙 Go Back", "go_back_start")
        }
      );
    } else {
      console.log(`🔧 Calling handleSettingsOption with option: "${option}"`);
      await handleSettingsOption(ctx, option);
      console.log(`🔧 handleSettingsOption completed for: "${option}"`);
    }
  }

  // Risk level callbacks
  else if (callbackData.startsWith("risk_")) {
    const risk = parseInt(callbackData.replace("risk_", ""));
    await updateRiskLevel(ctx, risk);
  }

  // Slippage callbacks
  else if (callbackData.startsWith("slippage_")) {
    const slippage = parseFloat(callbackData.replace("slippage_", ""));
    await updateSlippage(ctx, slippage);
  }

  // Min APY callbacks
  else if (callbackData.startsWith("minapy_")) {
    const minApy = parseFloat(callbackData.replace("minapy_", ""));
    await updateMinApy(ctx, minApy);
  }

  // Go back to start callback
  else if (callbackData === "go_back_start") {
    await startHandler.handler(ctx);
    await ctx.answerCallbackQuery();
  }

  // Other callbacks
  else if (callbackData === "export_key") {
    await exportHandler.handler(ctx);
  } else if (callbackData === "create_wallet") {
    await createHandler.handler(ctx);
  } else if (callbackData === "import_wallet") {
    await importHandler.handler(ctx);
  } else if (callbackData === "confirm_create_wallet") {
    ctx.session.walletAddress = undefined;
    await createHandler.handler(ctx);
  } else if (callbackData === "cancel_create_wallet") {
    await ctx.answerCallbackQuery("Wallet creation cancelled");
    await ctx.editMessageText(
      "Operation cancelled. Your existing wallet remains unchanged."
    );
  } else if (callbackData === "confirm_import_wallet") {
    ctx.session.walletAddress = undefined;
    await importHandler.handler(ctx);
  } else if (callbackData === "cancel_import_wallet") {
    await ctx.answerCallbackQuery("Wallet import cancelled");
    await ctx.editMessageText(
      "Operation cancelled. Your existing wallet remains unchanged."
    );
  }

  // Smart Recovery Flow Callbacks
  else if (callbackData === "retry_pending_transaction") {
    await handleRetryPendingTransaction(ctx);
  } else if (callbackData === "cancel_pending_transaction") {
    await handleCancelPendingTransaction(ctx);
  } else if (callbackData === "invest_available") {
    await handleInvestAvailable(ctx);
  } else if (callbackData === "modify_amount") {
    // Restart the zap flow to modify amount
    ctx.session.currentAction = "zap_amount";
    ctx.session.tempData = {}; // Clear existing data
    await ctx.reply("💰 Enter the new amount you'd like to invest in USDC:");
    await ctx.answerCallbackQuery();
  } else if (callbackData === "cancel_investment") {
    // Clear any pending transaction and session data
    const { clearPendingTransaction } = await import("./src/utils/smart-recovery");
    clearPendingTransaction(ctx);
    ctx.session.tempData = {};
    ctx.session.currentAction = undefined;
    
    await ctx.reply("❌ Investment cancelled. Your funds remain safe in your wallet.");
    await ctx.answerCallbackQuery();
  } else if (callbackData === "manual_deposit_check") {
    await handleManualDepositCheck(ctx);
  } 
  
  else {
    await ctx.answerCallbackQuery("Unknown command");
  }
});

// Handle text messages (for inputs during workflows)
bot.on("message:text", async (ctx) => {
  // Skip commands
  if (ctx.message.text.startsWith("/")) return;

  // Handle custom withdraw amount input
  if (ctx.session.awaitingWithdrawAmount) {
    await handleWithdrawAmountInput(ctx, ctx.message.text);
    return;
  }

  switch (ctx.session.currentAction) {
    case "import_wallet":
      await handlePrivateKeyInput(ctx);
      break;
    case "zap_amount":
      await handleZapAmountInput(ctx);
      break;
    case "withdraw_eth_address":
    case "withdraw_usdc_address":
    case "withdraw_eth_amount":
    case "withdraw_usdc_amount":
      await handleWithdrawTextInput(ctx, ctx.message.text);
      break;
    default:
      // If no current action, show standardized main menu
      if (!ctx.session.currentAction) {
        const { createMainMenuKeyboard, getMainMenuMessage } = await import("./src/utils/mainMenu");
        const firstName = ctx.from?.first_name || "there";
        
        // Get wallet address from session or database
        let walletAddress = ctx.session.walletAddress;
        if (!walletAddress && ctx.session.userId) {
          const { getWallet } = await import("./src/lib/token-wallet");
          const wallet = await getWallet(ctx.session.userId);
          if (wallet) {
            walletAddress = wallet.address;
            ctx.session.walletAddress = wallet.address; // Update session
          }
        }

        await ctx.reply(
          await getMainMenuMessage(firstName, walletAddress, ctx.session.userId),
          { 
            parse_mode: "Markdown",
            reply_markup: createMainMenuKeyboard() 
          }
        );
      }
      break;
  }
});

// Help command
bot.command("help", async (ctx) => {
  await ctx.reply(
    "🦑 *inkvest Bot Help*\n\n" +
      "*Wallet Commands:*\n" +
      "/start - Start the bot and create/import wallet\n" +
      "/wallet - Show wallet address\n" +
      "/balance - Show token balances\n\n" +
      "*DeFi Commands:*\n" +
      "/portfolio - View your yield farming positions\n" +
      "/zap - Auto-deploy funds to best yield opportunities\n" +
      "/harvest - Claim yields and compound rewards\n" +
      "/settings - Adjust risk tolerance and slippage\n\n" +
      "*Transfer Commands:*\n" +
      "/deposit - Show your deposit address\n" +
      "/withdraw - Withdraw funds to another address\n\n" +
      "*Other Commands:*\n" +
      "/cancel - Cancel current operation\n" +
      "/help - Show this help message\n\n" +
      "🐙 *Auto-Deployment*: I automatically find the best yield opportunities based on your risk settings.\n" +
      "🛡️ *Safety First*: Only vetted protocols with high TVL are used.\n" +
      "📈 *Track Performance*: View real-time portfolio value and yields earned.",
    { parse_mode: "Markdown" }
  );
});

// Handle errors
bot.catch((err) => {
  console.error("Bot error occurred:", err);
});

// Start the bot
const startBot = async () => {
  console.log("🦑 Starting inkvest Telegram Bot...");

  try {
    // Start bot
    await bot.start();
    console.log("✅ Bot started successfully!");

    // Log info
    console.log("ℹ️  Press Ctrl+C to stop the bot");
    console.log("🦑 inkvest Bot is ready to help users earn yield!");
  } catch (error) {
    console.error("❌ Failed to start bot:", error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("🛑 Stopping bot...");
  await bot.stop();
  closeDatabase();
  console.log("👋 Bot stopped. Goodbye!");
  process.exit(0);
});

// Start the bot
startBot();