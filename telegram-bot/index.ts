import { Bot, session, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import { BotContext, createInitialSessionData } from "./src/context";
import { initDatabase, closeDatabase } from "./src/lib/database";
import { verifyEncryptionKey } from "./src/lib/encryption";

// Import commands
import { startHandler, helpHandler } from "./src/commands/start-help";
import { walletHandler, createHandler } from "./src/commands/wallet";
import { importHandler, exportHandler, handlePrivateKeyInput, handleExportConfirmation } from "./src/commands/import-export";
import { balanceHandler } from "./src/commands/balance";
import zapHandler, {
  handlePoolSelection,
  handleZapAmountInput,
  handleZapConfirmation,
  handleZapRetry,
} from "./src/commands/zap";
import portfolioHandler, { handlePortfolioDetails } from "./src/commands/portfolio";
import harvestHandler from "./src/commands/harvest";
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
  { command: zapHandler.command, description: zapHandler.description },
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
  if (callbackData === "withdraw_aave_max" || callbackData === "withdraw_fluid_max" || callbackData === "withdraw_custom" || 
      callbackData === "withdraw_custom_with_rewards" || callbackData === "withdraw_custom_no_rewards") {
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
  } else if (callbackData === "portfolio_details") {
    await handlePortfolioDetails(ctx);
  } else if (callbackData === "retry_zap") {
    await handleZapRetry(ctx);
  }

  // Auto-deployment vs manual selection
  else if (callbackData === "zap_auto_deploy") {
    ctx.session.zapMode = "auto";
    await zapHandler.handler(ctx);
  } else if (callbackData === "zap_choose_protocol") {
    ctx.session.zapMode = "manual";
    // Show protocol selection
    await handlePoolSelection(ctx);
  }

  // Pool selection callbacks
  else if (callbackData.startsWith("pool_")) {
    const poolId = callbackData.replace("pool_", "");
    ctx.session.tempData!.selectedPool = poolId;
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
      | "back";

    if (option === "back") {
      // Go back to main menu
      const keyboard = new InlineKeyboard()
        .text("💰 Balance", "check_balance")
        .text("📊 Portfolio", "view_portfolio")
        .row()
        .text("🚀 Zap", "zap_funds")
        .text("🚪 Exit Pool", "withdraw")
        .row()
        .text("⚙️ Settings", "open_settings")
        .text("📋 Help", "help");

      await ctx.editMessageText(
        `🌱 *DeFi Garden Bot*\n\n` +
          `Your automated yield farming assistant.\n\n` +
          `What would you like to do?`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
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
    default:
      // If no current action, show help
      if (!ctx.session.currentAction) {
        const keyboard = new InlineKeyboard()
          .text("💰 Balance", "check_balance")
          .text("📊 Portfolio", "view_portfolio")
          .row()
          .text("🚀 Zap", "zap_funds")
          .text("🚪 Exit Pool", "withdraw")
          .row()
          .text("⚙️ Settings", "open_settings")
          .text("📋 Help", "help");

        await ctx.reply(
          "🌱 Hello! Here are some things you can do:\n\n" +
            "/wallet - View your wallet\n" +
            "/balance - Check your token balances\n" +
            "/portfolio - View your DeFi positions and yields\n" +
            "/zap - Invest in yield farming pools\n" +
            "/withdraw - Exit DeFi pools and get funds back to wallet\n" +
            "/deposit - Get your deposit address\n" +
            "/settings - Adjust risk and slippage settings\n" +
            "/help - Show help message",
          { reply_markup: keyboard }
        );
      }
      break;
  }
});

// Help command
bot.command("help", async (ctx) => {
  await ctx.reply(
    "🌱 *DeFi Garden Bot Help*\n\n" +
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
  console.log("🌱 Starting DeFi Garden Telegram Bot...");

  try {
    // Start bot
    await bot.start();
    console.log("✅ Bot started successfully!");

    // Log info
    console.log("ℹ️  Press Ctrl+C to stop the bot");
    console.log("🌱 DeFi Garden Bot is ready to help users earn yield!");
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