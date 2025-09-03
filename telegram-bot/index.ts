import { Bot, session, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import { BotContext, createInitialSessionData } from "./src/context";
import { initDatabase, closeDatabase } from "./src/lib/database";
import { verifyEncryptionKey } from "./src/lib/encryption";

// Import commands
import { startHandler, helpHandler } from "./src/commands/start-help";
import { walletHandler, createHandler } from "./src/commands/wallet";
import { importHandler, exportHandler, handlePrivateKeyInput, handleExportConfirmation } from "./src/commands/import-export";
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

// Handle callback queries
bot.on("callback_query:data", async (ctx) => {
  const callbackData = ctx.callbackQuery.data;

  // Handle withdraw-specific callbacks first
  if (callbackData === "withdraw_aave_max" || callbackData === "withdraw_fluid_max" || callbackData === "withdraw_compound_max" ||
      callbackData === "withdraw_fluid_menu" || callbackData === "withdraw_aave_menu" || callbackData === "withdraw_compound_menu" ||
      callbackData === "withdraw_fluid_custom" || callbackData === "withdraw_aave_custom" || callbackData === "withdraw_compound_custom" ||
      callbackData === "withdraw_aave_custom_with_rewards" || callbackData === "withdraw_aave_custom_no_rewards" ||
      callbackData === "withdraw_compound_custom_with_rewards" || callbackData === "withdraw_compound_custom_no_rewards" ||
      callbackData === "withdraw_custom" || callbackData === "withdraw_custom_with_rewards" || callbackData === "withdraw_custom_no_rewards") {
    await handleWithdrawCallbacks(ctx);
    return;
  }

  // Confirmation callbacks
  if (callbackData === "confirm_yes") {
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
  } else if (callbackData === "deposit") {
    await depositHandler.handler(ctx);
  } else if (callbackData === "withdraw") {
    await withdrawHandler.handler(ctx);
  } else if (callbackData === "help") {
    await helpHandler.handler(ctx);
  } else if (callbackData === "manual_balance_check") {
    // Manual balance check for onboarding users
    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.reply("❌ Please start the bot first with /start command.");
      return;
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
      
      if (parseFloat(usdcBalance.toString()) > 0) {
        // Funds detected! Auto-deploy using Coinbase CDP
        
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
          `🎉 *Deposit detected!*\n\n` +
          `${usdcBalance.toString()} USDC found in your wallet!\n\n` +
          `Auto-deploying to ${bestProtocol.protocol} (${bestProtocol.apy}% APY) with sponsored gas...`,
          { parse_mode: "Markdown" }
        );
        
        const firstName = ctx.from?.first_name || "there";
        
        // Execute sponsored deployment
        setTimeout(async () => {
          try {
            const coinbaseDefi = await import("./src/services/coinbase-defi");
            const deploymentFunction = coinbaseDefi[bestProtocol.deployFn as keyof typeof coinbaseDefi];
            
            if (!deploymentFunction) {
              throw new Error(`Deployment function ${bestProtocol.deployFn} not found`);
            }
            
            const deployResult = await deploymentFunction(userId, usdcBalance.toString());
            
            if (deployResult.success) {
              // Send success message with main menu
              const { createMainMenuKeyboard, getMainMenuMessage } = await import("./src/utils/mainMenu");
              
              // Import earnings utilities
              const { calculateRealTimeEarnings, formatTxLink } = await import("./src/utils/earnings");
              const earnings = calculateRealTimeEarnings(parseFloat(usdcBalance.toString()), bestProtocol.apy);
              
              await ctx.editMessageText(
                `🐙 *Welcome to your **inkvest** control center!*\n\n` +
                `✅ ${usdcBalance.toString()} USDC deployed to ${bestProtocol.protocol} (${bestProtocol.apy}% APY)\n` +
                `✅ Gas sponsored by inkvest (gasless for you!)\n` +
                `✅ Auto-compounding activated\n` +
                `✅ Earning ${earnings} automatically\n\n` +
                (deployResult.txHash ? `Deploy TX: ${formatTxLink(deployResult.txHash)}` : `Deployment completed successfully`),
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
    // Help with depositing USDC
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
      ctx.session.tempData!.poolInfo = {
        protocol: selectedPoolData.project,
        apy: selectedPoolData.apy,
        tvlUsd: selectedPoolData.tvlUsd,
        riskScore: calculateRiskScore(selectedPoolData)
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
      | "back"
      | "export_key";

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
    } else {
      await handleSettingsOption(ctx, option);
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
  } else {
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
      "🤖 *Auto-Deployment*: I automatically find the best yield opportunities based on your risk settings.\n" +
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