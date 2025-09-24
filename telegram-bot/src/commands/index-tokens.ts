import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";
import { 
  IndexCategory, 
  INDEX_CATEGORIES,
  ExtendedTempData,
  IndexSessionData 
} from "../types/index-tokens";
import { 
  getIndexTokensByCategory, 
  getIndexTokenById,
  getWallet,
  getIndexPositionsByUserId 
} from "../lib/database";
import { 
  INDEX_ERRORS, 
  INDEX_DISPLAY,
  INDEX_CATEGORY_CONFIGS,
  RISK_LEVELS 
} from "../utils/index-constants";
import { hasCoinbaseSmartWallet } from "../lib/coinbase-wallet";
import { buyIndexToken, sellIndexToken } from "../services/index-tokens/index-core";
import { getUserIndexPositions } from "../services/index-tokens/index-balance";
import { isValidAmount } from "../utils/validators";

const indexTokensHandler: CommandHandler = {
  command: "index",
  description: "Buy and manage index token investments",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;
      const firstName = ctx.from?.first_name || "there";

      if (!userId) {
        await ctx.reply("❌ Please start the bot first with /start command.");
        return;
      }

      // Get user's wallet
      const wallet = await getWallet(userId);
      if (!wallet) {
        const keyboard = new InlineKeyboard()
          .text("✨ Set Up Wallet", "create_wallet")
          .text("🔑 Import Wallet", "import_wallet");

        await ctx.reply(
          `👋 Hey ${firstName}! You need a wallet to invest in index tokens.\\n\\nLet me help you set that up:`,
          { reply_markup: keyboard }
        );
        return;
      }

      // Check if user has Smart Wallet (required for index tokens)
      if (!hasCoinbaseSmartWallet(userId)) {
        await ctx.reply(
          `🦑 **Index Token Investments**\\n\\n` +
          `Index tokens require a Smart Wallet for gasless transactions.\\n\\n` +
          `Please create a Smart Wallet first using /wallet, then come back to start investing in token baskets!`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Show index categories
      await showIndexCategories(ctx, firstName);

    } catch (error) {
      console.error("Error in index command:", error);
      await ctx.reply("❌ Something went wrong. Please try again in a moment.");
    }
  },
};

/**
 * Show available index categories to the user
 */
async function showIndexCategories(ctx: BotContext, firstName: string): Promise<void> {
  const keyboard = new InlineKeyboard();

  // Add each category as a button
  for (const [categoryKey, categoryInfo] of Object.entries(INDEX_CATEGORIES)) {
    const config = INDEX_CATEGORY_CONFIGS[categoryKey as IndexCategory];
    const riskEmoji = RISK_LEVELS[config.riskScore]?.emoji || "🟡";
    
    keyboard
      .text(
        `${categoryInfo.emoji} ${categoryInfo.displayName}`, 
        `index_category_${categoryKey}`
      )
      .row();
  }

  // Add bottom navigation
  keyboard
    .text("📊 My Index Positions", "view_index_positions")
    .row()
    .text("🔙 Back to Main Menu", "main_menu");

  const message = 
    `📊 **Index Token Investments**\\n\\n` +
    `Hey ${firstName}! Choose an index category to start investing in token baskets:\\n\\n` +
    
    `🏛️ **Blue Chip Index**\\n` +
    `• BTC, ETH, major cryptocurrencies\\n` +
    `• Lower risk, steady growth\\n` +
    `• Expected: 6-10% annually\\n\\n` +
    
    `🚀 **DeFi Protocol Index**\\n` +
    `• AAVE, UNI, COMP tokens\\n` +
    `• Medium risk, higher upside\\n` +
    `• Expected: 12-25% annually\\n\\n` +
    
    `💎 **Emerging Protocols**\\n` +
    `• New protocols, L2 tokens\\n` +
    `• Higher risk, max upside\\n` +
    `• Expected: 20-50% annually\\n\\n` +
    
    `🌍 **Sector Rotation**\\n` +
    `• AI, Gaming, RWA themes\\n` +
    `• Theme-based investing\\n` +
    `• Expected: 15-35% annually\\n\\n` +
    
    `✅ **Benefits:**\\n` +
    `• Gasless transactions (we pay gas)\\n` +
    `• Instant diversification\\n` +
    `• Professional rebalancing\\n` +
    `• Sell anytime, no lock-ups`;

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}

/**
 * Handle index category selection
 */
export async function handleIndexCategorySelection(
  ctx: BotContext, 
  category: IndexCategory
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();

    // Validate category
    if (!INDEX_CATEGORIES[category]) {
      await ctx.reply(INDEX_ERRORS.INVALID_CATEGORY);
      return;
    }

    // Get available tokens in this category
    const tokens = getIndexTokensByCategory(category);
    
    if (tokens.length === 0) {
      await ctx.reply(
        `🚧 **Coming Soon**\\n\\n` +
        `${INDEX_CATEGORIES[category].emoji} ${INDEX_CATEGORIES[category].displayName} tokens are not available yet.\\n\\n` +
        `We're working on adding more index options. Try the Blue Chip Index (LCAP) which is currently available!`,
        { 
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Back", "index_main")
        }
      );
      return;
    }

    // Store selected category in session
    ctx.session.tempData = { 
      ...ctx.session.tempData,
      indexData: { selectedCategory: category }
    } as ExtendedTempData;

    // Show available tokens in category
    await showTokensInCategory(ctx, category, tokens);

  } catch (error) {
    console.error("Error handling category selection:", error);
    await ctx.reply(INDEX_ERRORS.NETWORK_ERROR);
  }
}

/**
 * Show available tokens in a category
 */
async function showTokensInCategory(ctx: BotContext, category: IndexCategory, tokens: any[]): Promise<void> {
  const categoryInfo = INDEX_CATEGORIES[category];
  const keyboard = new InlineKeyboard();

  let message = `${categoryInfo.emoji} **${categoryInfo.displayName}**\\n\\n`;
  message += `${categoryInfo.description}\\n\\n`;
  message += `**Available Tokens:**\\n\\n`;

  for (const token of tokens) {
    // Add token info to message
    const riskEmoji = RISK_LEVELS[token.riskLevel]?.emoji || "🟡";
    message += `${riskEmoji} **${token.symbol} - ${token.name}**\\n`;
    message += `• Risk Level: ${token.riskLevel}/10\\n`;
    if (token.description) {
      message += `• ${token.description}\\n`;
    }
    message += `\\n`;

    // Add button for this token
    keyboard.text(`Buy ${token.symbol}`, `index_token_${token.tokenId}`).row();
  }

  // Add navigation buttons
  keyboard
    .text("🔙 Back to Categories", "index_main")
    .text("📊 My Positions", "view_index_positions");

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}

/**
 * Handle index token selection
 */
export async function handleIndexTokenSelection(
  ctx: BotContext,
  indexTokenId: string  
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();

    // Get token information
    const token = getIndexTokenById(indexTokenId);
    if (!token) {
      await ctx.reply(INDEX_ERRORS.INVALID_INDEX_TOKEN);
      return;
    }

    // Store selected token in session
    const tempData = ctx.session.tempData as ExtendedTempData || {};
    tempData.indexData = {
      ...tempData.indexData,
      selectedIndexToken: indexTokenId
    };
    ctx.session.tempData = tempData;
    ctx.session.currentAction = "index_amount";

    // Show token details and ask for amount
    await showTokenDetailsAndAskAmount(ctx, token);

  } catch (error) {
    console.error("Error handling token selection:", error);
    await ctx.reply(INDEX_ERRORS.NETWORK_ERROR);
  }
}

/**
 * Show token details and ask for investment amount
 */
async function showTokenDetailsAndAskAmount(ctx: BotContext, token: any): Promise<void> {
  const categoryInfo = INDEX_CATEGORIES[token.category as IndexCategory];
  const riskInfo = RISK_LEVELS[token.riskLevel];
  const config = INDEX_CATEGORY_CONFIGS[token.category as IndexCategory];

  let message = `${categoryInfo.emoji} **${token.symbol} - ${token.name}**\\n\\n`;
  
  // Token details
  message += `**Token Details:**\\n`;
  message += `• **Category**: ${categoryInfo.displayName}\\n`;
  message += `• **Risk Level**: ${riskInfo?.emoji} ${token.riskLevel}/10 (${riskInfo?.label})\\n`;
  message += `• **Expected Return**: ${categoryInfo.expectedReturn}\\n\\n`;
  
  if (token.description) {
    message += `**What's Inside:**\\n${token.description}\\n\\n`;
  }

  // Investment parameters
  message += `**Investment Parameters:**\\n`;
  message += `• **Minimum**: $${config.minInvestment} USDC\\n`;
  message += `• **Maximum**: $${config.maxInvestment} USDC\\n`;
  message += `• **Default Slippage**: ${config.defaultSlippage}%\\n\\n`;

  // Benefits
  message += `**Benefits:**\\n`;
  message += `✅ Instant diversification across multiple tokens\\n`;
  message += `✅ Professional portfolio management\\n`;
  message += `✅ Gasless transactions (we pay gas fees)\\n`;
  message += `✅ Liquid - sell anytime with no penalties\\n\\n`;

  message += `💰 **How much USDC would you like to invest?**\\n\\n`;
  message += `Enter the amount in USDC (e.g., "10", "25.5", "100"):`;

  const keyboard = new InlineKeyboard()
    .text("$10", "index_amount_10")
    .text("$25", "index_amount_25") 
    .text("$50", "index_amount_50")
    .row()
    .text("$100", "index_amount_100")
    .text("$250", "index_amount_250")
    .text("$500", "index_amount_500")
    .row()
    .text("🔙 Back", `index_category_${token.category}`)
    .text("❌ Cancel", "index_main");

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}

/**
 * Handle quick amount selection
 */
export async function handleIndexQuickAmount(
  ctx: BotContext,
  amount: string
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();

    const tempData = ctx.session.tempData as ExtendedTempData || {};
    if (!tempData.indexData?.selectedIndexToken) {
      await ctx.reply("❌ Session expired. Please start again.");
      return;
    }

    // Store amount and process
    tempData.indexData.amount = amount;
    ctx.session.tempData = tempData;

    await processIndexAmountInput(ctx, amount);

  } catch (error) {
    console.error("Error handling quick amount:", error);
    await ctx.reply(INDEX_ERRORS.NETWORK_ERROR);
  }
}

/**
 * Handle amount input for index purchase
 */
export async function handleIndexAmountInput(ctx: BotContext): Promise<void> {
  try {
    const amountInput = ctx.message?.text;
    if (!amountInput) {
      await ctx.reply("❌ Invalid request. Please try again.");
      return;
    }

    await processIndexAmountInput(ctx, amountInput);

  } catch (error) {
    console.error("Error handling index amount input:", error);
    await ctx.reply(INDEX_ERRORS.NETWORK_ERROR);
  }
}

/**
 * Process the amount input and show confirmation
 */
async function processIndexAmountInput(ctx: BotContext, amountInput: string): Promise<void> {
  // Validate amount
  if (!isValidAmount(amountInput)) {
    await ctx.reply(INDEX_ERRORS.INVALID_AMOUNT + "\\n\\nTry again or type /cancel to abort.");
    return;
  }

  const amount = parseFloat(amountInput);
  const tempData = ctx.session.tempData as ExtendedTempData || {};
  
  if (!tempData.indexData?.selectedIndexToken) {
    await ctx.reply("❌ Session expired. Please start again with /index");
    return;
  }

  const token = getIndexTokenById(tempData.indexData.selectedIndexToken);
  if (!token) {
    await ctx.reply(INDEX_ERRORS.INVALID_INDEX_TOKEN);
    return;
  }

  const config = INDEX_CATEGORY_CONFIGS[token.category as IndexCategory];

  // Validate amount limits
  if (amount < config.minInvestment) {
    await ctx.reply(
      `❌ Minimum investment is $${config.minInvestment} USDC.\\n\\nTry again or type /cancel to abort.`
    );
    return;
  }

  if (amount > config.maxInvestment) {
    await ctx.reply(
      `❌ Maximum investment is $${config.maxInvestment} USDC per transaction.\\n\\nTry again or type /cancel to abort.`
    );
    return;
  }

  // Store amount and show confirmation
  tempData.indexData.amount = amountInput;
  ctx.session.tempData = tempData;
  ctx.session.currentAction = "index_confirm";

  await showIndexPurchaseConfirmation(ctx, token, amount);
}

/**
 * Show purchase confirmation
 */
async function showIndexPurchaseConfirmation(ctx: BotContext, token: any, amount: number): Promise<void> {
  const categoryInfo = INDEX_CATEGORIES[token.category as IndexCategory];
  const riskInfo = RISK_LEVELS[token.riskLevel];

  let message = `🛒 **Purchase Confirmation**\\n\\n`;
  message += `**Index Token**: ${categoryInfo.emoji} ${token.symbol}\\n`;
  message += `**Investment Amount**: $${amount} USDC\\n`;
  message += `**Category**: ${categoryInfo.displayName}\\n`;
  message += `**Risk Level**: ${riskInfo?.emoji} ${token.riskLevel}/10\\n\\n`;

  message += `**Expected Benefits:**\\n`;
  message += `📊 Instant diversification across multiple cryptocurrencies\\n`;
  message += `🎯 Professional portfolio management and rebalancing\\n`;
  message += `⚡ Gasless transaction (we pay the fees)\\n`;
  message += `💧 High liquidity - sell anytime\\n\\n`;

  message += `**Important Notes:**\\n`;
  message += `⚠️ Index token prices fluctuate with market conditions\\n`;
  message += `⚠️ Past performance doesn't guarantee future results\\n`;
  message += `⚠️ Only invest what you can afford to lose\\n\\n`;

  message += `Proceed with this investment?`;

  const keyboard = new InlineKeyboard()
    .text("✅ Confirm Purchase", "index_confirm_yes")
    .text("❌ Cancel", "index_confirm_no")
    .row()
    .text("🔙 Change Amount", `index_token_${token.tokenId}`);

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}

/**
 * Handle purchase confirmation
 */
export async function handleIndexPurchaseConfirmation(
  ctx: BotContext,
  confirmed: boolean
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
    
    if (!confirmed) {
      await ctx.reply("❌ Purchase cancelled.");
      ctx.session.currentAction = undefined;
      ctx.session.tempData = {};
      return;
    }

    const tempData = ctx.session.tempData as ExtendedTempData || {};
    const { selectedIndexToken, amount } = tempData.indexData || {};
    const userId = ctx.session.userId;

    if (!userId || !selectedIndexToken || !amount) {
      await ctx.reply("❌ Session expired. Please start again with /index");
      return;
    }

    await ctx.reply("⏳ Processing your index token purchase...\\n\\n🔄 This may take 30-60 seconds.");

    // Execute the purchase
    console.log(`Executing index token purchase: ${amount} USDC for ${selectedIndexToken}`);
    
    const result = await buyIndexToken(userId, selectedIndexToken, amount);

    if (result.success) {
      const token = getIndexTokenById(selectedIndexToken);
      
      await ctx.reply(
        `✅ **Purchase Successful!**\\n\\n` +
        `💰 **Invested**: $${amount} USDC\\n` +
        `📊 **Token**: ${token?.symbol} (${token?.name})\\n` +
        `🪙 **Received**: ${result.tokensReceived} tokens\\n` +
        `💱 **Price**: $${result.pricePerToken?.toFixed(4)} per token\\n` +
        `🔗 **Transaction**: \\`${result.txHash}\\`\\n\\n` +
        `🎉 Your index position is now active! Use /index to view your positions.`,
        { 
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("📊 View Positions", "view_index_positions")
            .text("🛒 Buy More", "index_main")
        }
      );
    } else {
      await ctx.reply(
        `❌ **Purchase Failed**\\n\\n` +
        `**Error**: ${result.error}\\n\\n` +
        `Your USDC is safe. Please try again or contact support if the issue persists.`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🔄 Try Again", "index_main")
            .text("💰 Check Balance", "check_balance")
        }
      );
    }

    // Reset session
    ctx.session.currentAction = undefined;
    ctx.session.tempData = {};

  } catch (error) {
    console.error("Error processing index purchase:", error);
    await ctx.reply("❌ An unexpected error occurred. Please try again.");
  }
}

/**
 * Show user's index positions
 */
export async function handleViewIndexPositions(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.reply("❌ Please start the bot first with /start command.");
      return;
    }

    await ctx.answerCallbackQuery();

    // Get user's positions
    const positions = await getUserIndexPositions(userId);
    
    if (positions.length === 0) {
      await ctx.reply(
        INDEX_ERRORS.NO_POSITIONS + "\\n\\n" +
        "Ready to start investing in token baskets?",
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🛒 Start Investing", "index_main")
            .text("🔙 Back to Main", "main_menu")
        }
      );
      return;
    }

    // Build positions message
    let message = `📊 **Your Index Positions**\\n\\n`;
    let totalValue = 0;
    let totalInvested = 0;

    for (const position of positions) {
      const categoryInfo = INDEX_CATEGORIES[position.category as IndexCategory];
      const pnl = position.currentValue - position.totalInvested;
      const pnlPercent = (pnl / position.totalInvested) * 100;
      const pnlEmoji = pnl >= 0 ? "📈" : "📉";

      totalValue += position.currentValue;
      totalInvested += position.totalInvested;

      message += `${categoryInfo?.emoji || "📊"} **${position.symbol}**\\n`;
      message += `• Tokens: ${position.tokensOwned.toFixed(6)}\\n`;
      message += `• Value: $${position.currentValue.toFixed(2)}\\n`;
      message += `• Invested: $${position.totalInvested.toFixed(2)}\\n`;
      message += `• P&L: ${pnlEmoji} $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)\\n\\n`;
    }

    const totalPnL = totalValue - totalInvested;
    const totalPnLPercent = (totalPnL / totalInvested) * 100;
    const totalEmoji = totalPnL >= 0 ? "📈" : "📉";

    message += `**Portfolio Summary:**\\n`;
    message += `💰 Total Value: $${totalValue.toFixed(2)}\\n`;
    message += `💵 Total Invested: $${totalInvested.toFixed(2)}\\n`;
    message += `${totalEmoji} Total P&L: $${totalPnL.toFixed(2)} (${totalPnLPercent.toFixed(1)}%)\\n`;

    const keyboard = new InlineKeyboard()
      .text("🛒 Buy More", "index_main")
      .text("💵 Sell Positions", "sell_index_positions")
      .row()
      .text("🔄 Refresh", "view_index_positions")
      .text("🔙 Main Menu", "main_menu");

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });

  } catch (error) {
    console.error("Error viewing index positions:", error);
    await ctx.reply(INDEX_ERRORS.NETWORK_ERROR);
  }
}

export default indexTokensHandler;