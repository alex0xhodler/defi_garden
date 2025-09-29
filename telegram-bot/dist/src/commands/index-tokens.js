"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleIndexCategorySelection = handleIndexCategorySelection;
exports.handleIndexTokenSelection = handleIndexTokenSelection;
exports.handleIndexQuickAmount = handleIndexQuickAmount;
exports.handleIndexAmountInput = handleIndexAmountInput;
exports.handleIndexPurchaseConfirmation = handleIndexPurchaseConfirmation;
exports.handleViewIndexPositions = handleViewIndexPositions;
exports.handleSellIndexPositions = handleSellIndexPositions;
exports.handleSellIndexToken = handleSellIndexToken;
exports.handleSellIndexAmount = handleSellIndexAmount;
exports.handleSellIndexCustomAmount = handleSellIndexCustomAmount;
exports.handleIndexSellConfirmation = handleIndexSellConfirmation;
exports.handleIndexSellAmountInput = handleIndexSellAmountInput;
exports.handleIndexRetryAfterTransfer = handleIndexRetryAfterTransfer;
exports.handleSelectAddress = handleSelectAddress;
exports.handleIndexCancelTransfer = handleIndexCancelTransfer;
const grammy_1 = require("grammy");
const index_tokens_1 = require("../types/index-tokens");
const database_1 = require("../lib/database");
const token_wallet_1 = require("../lib/token-wallet");
const index_constants_1 = require("../utils/index-constants");
const coinbase_wallet_1 = require("../lib/coinbase-wallet");
const index_core_1 = require("../services/index-tokens/index-core");
const sell_index_1 = require("../services/index-tokens/sell-index");
const index_balance_1 = require("../services/index-tokens/index-balance");
const validators_1 = require("../utils/validators");
const smart_recovery_1 = require("../utils/smart-recovery");
const indexTokensHandler = {
    command: "index",
    description: "Buy and manage index token investments",
    handler: async (ctx) => {
        try {
            const userId = ctx.session.userId;
            const firstName = ctx.from?.first_name || "there";
            if (!userId) {
                await ctx.reply("❌ Please start the bot first with /start command.");
                return;
            }
            // Get user's wallet
            const wallet = await (0, token_wallet_1.getWallet)(userId);
            if (!wallet) {
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("✨ Set Up Wallet", "create_wallet")
                    .text("🔑 Import Wallet", "import_wallet");
                await ctx.reply(`👋 Hey ${firstName}! You need a wallet to invest in index tokens.\n\nLet me help you set that up:`, { reply_markup: keyboard });
                return;
            }
            // Check if user has Smart Wallet (required for index tokens)
            if (!(0, coinbase_wallet_1.hasCoinbaseSmartWallet)(userId)) {
                await ctx.reply(`🦑 **Index Token Investments**\n\n` +
                    `Index tokens require a Smart Wallet for gasless transactions.\n\n` +
                    `Please create a Smart Wallet first using /wallet, then come back to start investing in token baskets!`, { parse_mode: "Markdown" });
                return;
            }
            // Show index categories
            await showIndexCategories(ctx, firstName);
        }
        catch (error) {
            console.error("Error in index command:", error);
            await ctx.reply("❌ Something went wrong. Please try again in a moment.");
        }
    },
};
/**
 * Show available index tokens directly to the user
 */
async function showIndexCategories(ctx, firstName) {
    const keyboard = new grammy_1.InlineKeyboard();
    // Show LCAP token directly
    keyboard
        .text("🏦 LCAP - Large Cap Index", "index_token_blue_chip_01")
        .row()
        .text("🌍 OPEN - Coming Soon", "index_token_open_coming_soon")
        .row();
    // Add bottom navigation
    keyboard
        .text("📊 My Index Positions", "view_index_positions")
        .row()
        .text("🔙 Back to Main Menu", "main_menu");
    const message = `📊 **Index Token Investments**\n\n` +
        `Hey ${firstName}! Choose an index token to start investing:\n\n` +
        `🏦 **LCAP - Large Cap Index**\n` +
        `• Tracks 95% of large-cap digital asset market cap\n` +
        `• BTC, ETH, and major cryptocurrencies\n` +
        `• Lower risk, steady growth\n` +
        `• Risk Level: 3/10\n\n` +
        `🌍 **OPEN - Coming Soon**\n` +
        `• Open Stablecoin Index (equal-weight)\n` +
        `• Leading stablecoin protocols & governance\n` +
        `• Focus on transparency & decentralization\n` +
        `• Risk Level: 5/10\n\n` +
        `✅ **Benefits:**\n` +
        `• Gasless transactions (we pay gas)\n` +
        `• Instant diversification\n` +
        `• Professional rebalancing\n` +
        `• Sell anytime, no lock-ups`;
    await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard
    });
}
/**
 * Handle index category selection
 */
async function handleIndexCategorySelection(ctx, category) {
    try {
        await ctx.answerCallbackQuery();
        // Validate category
        if (!index_tokens_1.INDEX_CATEGORIES[category]) {
            await ctx.reply(index_constants_1.INDEX_ERRORS.INVALID_CATEGORY);
            return;
        }
        // Get available tokens in this category
        const tokens = (0, database_1.getIndexTokensByCategory)(category);
        if (tokens.length === 0) {
            await ctx.reply(`🚧 **Coming Soon**\n\n` +
                `${index_tokens_1.INDEX_CATEGORIES[category].emoji} ${index_tokens_1.INDEX_CATEGORIES[category].displayName} tokens are not available yet.\n\n` +
                `We're working on adding more index options. Try the Blue Chip Index (LCAP) which is currently available!`, {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard().text("🔙 Back", "index_main")
            });
            return;
        }
        // Store selected category in session
        ctx.session.tempData = {
            ...ctx.session.tempData,
            indexData: { selectedCategory: category }
        };
        // Show available tokens in category
        await showTokensInCategory(ctx, category, tokens);
    }
    catch (error) {
        console.error("Error handling category selection:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Show available tokens in a category
 */
async function showTokensInCategory(ctx, category, tokens) {
    const categoryInfo = index_tokens_1.INDEX_CATEGORIES[category];
    const keyboard = new grammy_1.InlineKeyboard();
    let message = `${categoryInfo.emoji} **${categoryInfo.displayName}**\n\n`;
    message += `${categoryInfo.description}\n\n`;
    message += `**Available Tokens:**\n\n`;
    for (const token of tokens) {
        // Add token info to message
        const riskEmoji = index_constants_1.RISK_LEVELS[token.riskLevel]?.emoji || "🟡";
        // Special display for LCAP token
        if (token.symbol === 'LCAP' || token.tokenId === 'blue_chip_01') {
            message += `${riskEmoji} **${token.symbol} - CF Large Cap Index**\n`;
            message += `• Risk Level: ${token.riskLevel}/10\n`;
            message += `• Tracks 95% of large-cap digital asset market cap (CF Benchmarks)\n`;
        }
        else {
            message += `${riskEmoji} **${token.symbol} - ${token.name}**\n`;
            message += `• Risk Level: ${token.riskLevel}/10\n`;
            if (token.description) {
                message += `• ${token.description}\n`;
            }
        }
        message += `\n`;
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
async function handleIndexTokenSelection(ctx, indexTokenId) {
    try {
        await ctx.answerCallbackQuery();
        // Get token information
        const token = (0, database_1.getIndexTokenById)(indexTokenId);
        if (!token) {
            await ctx.reply(index_constants_1.INDEX_ERRORS.INVALID_INDEX_TOKEN);
            return;
        }
        // Store selected token in session
        const tempData = ctx.session.tempData || {};
        tempData.indexData = {
            ...tempData.indexData,
            selectedIndexToken: indexTokenId
        };
        ctx.session.tempData = tempData;
        ctx.session.currentAction = "index_amount";
        // Show token details and ask for amount
        await showTokenDetailsAndAskAmount(ctx, token);
    }
    catch (error) {
        console.error("Error handling token selection:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Show token details and ask for investment amount
 */
async function showTokenDetailsAndAskAmount(ctx, token) {
    const categoryInfo = index_tokens_1.INDEX_CATEGORIES[token.category];
    const riskInfo = index_constants_1.RISK_LEVELS[token.riskLevel];
    const config = index_constants_1.INDEX_CATEGORY_CONFIGS[token.category];
    let message = `${categoryInfo.emoji} **${token.symbol} - ${token.name}**\n\n`;
    // Token details
    message += `**Token Details:**\n`;
    message += `• **Category**: ${categoryInfo.displayName}\n`;
    message += `• **Risk Level**: ${riskInfo?.emoji} ${token.riskLevel}/10 (${riskInfo?.label})\n`;
    message += `• **Expected Return**: ${categoryInfo.expectedReturn}\n\n`;
    // Special handling for LCAP token with CF Benchmarks details
    if (token.symbol === 'LCAP' || token.tokenId === 'blue_chip_01') {
        message += `**About the Index:**\n`;
        message += `The CF Large Cap Index (Diversified Weight) is a liquid, investible benchmark portfolio index designed to track the performance of large-cap digital assets. The index seeks to capture 95% of the total market capitalization of the investible digital asset universe as its constituents.\n\n`;
        message += `**Index Methodology:**\n`;
        message += `• Weighted by free-float market capitalization\n`;
        message += `• Calculated daily at 4:00 PM EST\n`;
        message += `• Re-constituted and rebalanced quarterly\n`;
        message += `• Launched February 14, 2023\n`;
        message += `• Denominated in USD\n\n`;
        message += `**Links & Resources:**\n`;
        message += `🔗 [Reserve Protocol Interface](https://app.reserve.org/base/index-dtf/${token.contractAddress}/overview)\n`;
        message += `📊 [CF Benchmarks Data](https://www.cfbenchmarks.com/data/indices/CFDLCUS_RR_TR)\n`;
        message += `🐦 [CF Benchmarks Twitter](https://x.com/CFBenchmarks)\n\n`;
    }
    else if (token.description) {
        message += `**What's Inside:**\n${token.description}\n\n`;
    }
    // Investment parameters
    message += `**Investment Parameters:**\n`;
    message += `• **Minimum**: $${config.minInvestment} USDC\n`;
    message += `• **Maximum**: $${config.maxInvestment} USDC\n`;
    message += `• **Default Slippage**: ${config.defaultSlippage}%\n\n`;
    // Benefits
    message += `**Benefits:**\n`;
    message += `✅ Instant diversification across multiple tokens\n`;
    message += `✅ Professional portfolio management\n`;
    message += `✅ Gasless transactions (we pay gas fees)\n`;
    message += `✅ Liquid - sell anytime with no penalties\n\n`;
    message += `💰 **How much USDC would you like to invest?**\n\n`;
    message += `Enter the amount in USDC (e.g., "10", "25.5", "100"):`;
    const keyboard = new grammy_1.InlineKeyboard()
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
async function handleIndexQuickAmount(ctx, amount) {
    try {
        await ctx.answerCallbackQuery();
        const tempData = ctx.session.tempData || {};
        if (!tempData.indexData?.selectedIndexToken) {
            await ctx.reply("❌ Session expired. Please start again.");
            return;
        }
        // Store amount and process
        tempData.indexData.amount = amount;
        ctx.session.tempData = tempData;
        await processIndexAmountInput(ctx, amount);
    }
    catch (error) {
        console.error("Error handling quick amount:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Handle amount input for index purchase
 */
async function handleIndexAmountInput(ctx) {
    try {
        const amountInput = ctx.message?.text;
        if (!amountInput) {
            await ctx.reply("❌ Invalid request. Please try again.");
            return;
        }
        await processIndexAmountInput(ctx, amountInput);
    }
    catch (error) {
        console.error("Error handling index amount input:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Process the amount input and show confirmation
 */
async function processIndexAmountInput(ctx, amountInput) {
    // Validate amount
    if (!(0, validators_1.isValidAmount)(amountInput)) {
        await ctx.reply(index_constants_1.INDEX_ERRORS.INVALID_AMOUNT + "\n\nTry again or type /cancel to abort.");
        return;
    }
    const amount = parseFloat(amountInput);
    const tempData = ctx.session.tempData || {};
    if (!tempData.indexData?.selectedIndexToken) {
        await ctx.reply("❌ Session expired. Please start again with /index");
        return;
    }
    const token = (0, database_1.getIndexTokenById)(tempData.indexData.selectedIndexToken);
    if (!token) {
        await ctx.reply(index_constants_1.INDEX_ERRORS.INVALID_INDEX_TOKEN);
        return;
    }
    const config = index_constants_1.INDEX_CATEGORY_CONFIGS[token.category];
    // Validate amount limits
    if (amount < config.minInvestment) {
        await ctx.reply(`❌ Minimum investment is $${config.minInvestment} USDC.\n\nTry again or type /cancel to abort.`);
        return;
    }
    if (amount > config.maxInvestment) {
        await ctx.reply(`❌ Maximum investment is $${config.maxInvestment} USDC per transaction.\n\nTry again or type /cancel to abort.`);
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
async function showIndexPurchaseConfirmation(ctx, token, amount) {
    const categoryInfo = index_tokens_1.INDEX_CATEGORIES[token.category];
    const riskInfo = index_constants_1.RISK_LEVELS[token.riskLevel];
    let message = `🛒 **Purchase Confirmation**\n\n`;
    message += `**Index Token**: ${categoryInfo.emoji} ${token.symbol}\n`;
    message += `**Investment Amount**: $${amount} USDC\n`;
    message += `**Category**: ${categoryInfo.displayName}\n`;
    message += `**Risk Level**: ${riskInfo?.emoji} ${token.riskLevel}/10\n\n`;
    message += `**Expected Benefits:**\n`;
    message += `📊 Instant diversification across multiple cryptocurrencies\n`;
    message += `🎯 Professional portfolio management and rebalancing\n`;
    message += `⚡ Gasless transaction (we pay the fees)\n`;
    message += `💧 High liquidity - sell anytime\n\n`;
    message += `**Important Notes:**\n`;
    message += `⚠️ Index token prices fluctuate with market conditions\n`;
    message += `⚠️ Past performance doesn't guarantee future results\n`;
    message += `⚠️ Only invest what you can afford to lose\n\n`;
    message += `Proceed with this investment?`;
    const keyboard = new grammy_1.InlineKeyboard()
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
async function handleIndexPurchaseConfirmation(ctx, confirmed) {
    try {
        await ctx.answerCallbackQuery();
        if (!confirmed) {
            await ctx.reply("❌ Purchase cancelled.");
            ctx.session.currentAction = undefined;
            ctx.session.tempData = {};
            return;
        }
        const tempData = ctx.session.tempData || {};
        const { selectedIndexToken, amount } = tempData.indexData || {};
        const userId = ctx.session.userId;
        if (!userId || !selectedIndexToken || !amount) {
            await ctx.reply("❌ Session expired. Please start again with /index");
            return;
        }
        // Check user's USDC balance first
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        if (!wallet) {
            await ctx.reply("❌ Wallet not found. Please set up your wallet first.");
            return;
        }
        try {
            // Get current USDC balance from all wallets (Smart Wallet + EOA)
            const { checkAllUSDCBalances } = await Promise.resolve().then(() => __importStar(require("../lib/coinbase-wallet")));
            const balances = await checkAllUSDCBalances(userId);
            if (!balances) {
                await ctx.reply("❌ Unable to check balance. Please try again.");
                return;
            }
            const currentBalance = parseFloat(balances.totalBalance);
            const smartWalletBalance = parseFloat(balances.smartWalletBalance);
            const eoaBalance = parseFloat(balances.eoaBalance);
            const requestedAmount = parseFloat(amount);
            // Get token info for display purposes
            const token = (0, database_1.getIndexTokenById)(selectedIndexToken);
            // Check if we need to transfer funds from EOA to Smart Wallet for gasless transaction
            if (smartWalletBalance < requestedAmount && eoaBalance > 0) {
                console.log(`💱 Auto-transferring funds from EOA to Smart Wallet for gasless transaction`);
                console.log(`   Smart Wallet: $${smartWalletBalance}, EOA: $${eoaBalance}, Needed: $${requestedAmount}`);
                const amountToTransfer = Math.min(eoaBalance, requestedAmount - smartWalletBalance + 0.01); // Add small buffer
                await ctx.reply(`⚡ **Preparing Gasless Transaction**\n\n` +
                    `📊 **Transaction Details:**\n` +
                    `• Index Token: ${token?.symbol || 'Index Token'}\n` +
                    `• Investment Amount: $${requestedAmount.toFixed(2)} USDC\n` +
                    `• Transfer Required: $${amountToTransfer.toFixed(2)} USDC\n\n` +
                    `🔄 **Status:** Checking Smart Wallet balance...\n` +
                    `⏳ **Next:** Auto-transfer funds for gasless execution\n\n` +
                    `💡 This process usually takes 30-60 seconds`, { parse_mode: "Markdown" });
                try {
                    // For now, inform user they need to transfer funds manually
                    // TODO: Implement EOA to Smart Wallet transfer function
                    const keyboard = new grammy_1.InlineKeyboard()
                        .text("📋 Select Address", `select_address_${balances.smartWalletAddress}`)
                        .row()
                        .text("🔄 Check & Retry", "index_retry_after_transfer")
                        .text("❌ Cancel Purchase", "index_cancel_transfer");
                    await ctx.reply(`💸 **Transfer Required for Gasless Transaction**\n\n` +
                        `📊 **What you're buying:**\n` +
                        `• ${token?.symbol || 'Index Token'} - $${requestedAmount.toFixed(2)} USDC\n\n` +
                        `🔄 **Action needed:**\n` +
                        `Transfer $${amountToTransfer.toFixed(2)} USDC to your Smart Wallet\n\n` +
                        `🎯 **Your Smart Wallet Address:**\n` +
                        `\`${balances.smartWalletAddress}\`\n\n` +
                        `ℹ️ **Why this step?**\n` +
                        `Your funds are in your private key wallet, but gasless transactions require them in your Smart Wallet.\n\n` +
                        `🟢 **After transferring:** Click "Check & Retry" and we'll automatically continue your purchase!`, {
                        parse_mode: "Markdown",
                        reply_markup: keyboard
                    });
                    return;
                }
                catch (transferError) {
                    console.error("Manual transfer notification failed:", transferError);
                    await ctx.reply("❌ **Error**\n\n" +
                        "Unable to display transfer information. Please try again.");
                    return;
                }
            }
            console.log(`💰 Index token purchase check: User has $${currentBalance}, wants to invest $${requestedAmount}`);
            // Get minimum investment for this token category
            const config = index_constants_1.INDEX_CATEGORY_CONFIGS[token?.category];
            const minInvestment = config?.minInvestment || 1; // Default $1 minimum
            // Case 1: User has enough for requested amount (or very close)
            if (currentBalance >= requestedAmount) {
                // Check if balance differs significantly from requested amount
                const balanceDifference = Math.abs(currentBalance - requestedAmount);
                const significantDifference = balanceDifference > 0.50; // More than $0.50 difference
                if (significantDifference && currentBalance !== requestedAmount) {
                    console.log(`📈 Balance adjustment offered: User has $${currentBalance}, wants $${requestedAmount}`);
                    // Show balance adjustment confirmation
                    const adjustmentKeyboard = new grammy_1.InlineKeyboard()
                        .text(`✅ Invest $${currentBalance.toFixed(2)}`, "index_adjust_confirm")
                        .text("🔄 Change Amount", "index_adjust_change")
                        .row()
                        .text("❌ Cancel", "index_adjust_cancel");
                    await ctx.reply(`📊 **Balance Adjustment Available**\n\n` +
                        `**Your current balance**: $${currentBalance.toFixed(2)} USDC\n` +
                        `**Amount you wanted**: $${requestedAmount.toFixed(2)} USDC\n\n` +
                        `📊 **${token?.symbol} - ${token?.name}**\n` +
                        `Would you like to invest your full available balance instead?`, {
                        parse_mode: "Markdown",
                        reply_markup: adjustmentKeyboard
                    });
                    // Store adjustment data in session for later use
                    const tempData = ctx.session.tempData || {};
                    tempData.indexData = {
                        ...tempData.indexData,
                        adjustedAmount: currentBalance.toString(),
                        originalAmount: requestedAmount.toString()
                    };
                    ctx.session.tempData = tempData;
                    ctx.session.currentAction = "index_adjust";
                    return;
                }
                // Otherwise proceed with exact requested amount
            }
            // Case 2: User has some funds (above minimum) but not enough - use smart recovery flow
            else if (currentBalance >= minInvestment && currentBalance < requestedAmount) {
                const shortage = requestedAmount - currentBalance;
                console.log(`💡 Using smart recovery flow: User has $${currentBalance}, wants $${requestedAmount}, shortage $${shortage}`);
                // Use the smart recovery flow with deposit monitoring and auto-retry
                await (0, smart_recovery_1.sendInsufficientBalanceFlow)(ctx, {
                    currentBalance,
                    requestedAmount,
                    shortage,
                    protocol: `Index Token - ${token?.symbol}`,
                    poolId: selectedIndexToken,
                    apy: 0, // Index tokens don't have traditional APY
                    poolInfo: {
                        displayName: token?.name || 'Index Token',
                        project: 'Index Token',
                        service: 'index-tokens',
                        deployFn: 'buyIndexToken',
                        category: token?.category,
                        isManualSelection: true // This triggers proper handling in event monitor
                    }
                });
                return;
            }
            // Case 3: User has very little funds (below minimum) - use insufficient balance flow
            else {
                const shortage = requestedAmount - currentBalance;
                console.log(`💳 Insufficient balance for index purchase: User has $${currentBalance}, needs $${requestedAmount} (shortage: $${shortage})`);
                // Use the smart recovery flow for insufficient balance
                await (0, smart_recovery_1.sendInsufficientBalanceFlow)(ctx, {
                    currentBalance,
                    requestedAmount,
                    shortage,
                    protocol: `Index Token - ${token?.symbol}`,
                    poolId: selectedIndexToken,
                    apy: 0, // Index tokens don't have APY in the traditional sense
                    poolInfo: {
                        displayName: token?.name || 'Index Token',
                        project: 'Index Token',
                        service: 'index-tokens',
                        deployFn: 'buyIndexToken',
                        category: token?.category
                    }
                });
                return;
            }
            await ctx.reply("⏳ Processing your index token purchase...\n\n🔄 This may take 30-60 seconds.");
            // Execute the purchase
            console.log(`Executing index token purchase: ${amount} USDC for ${selectedIndexToken}`);
            const result = await (0, index_core_1.buyIndexToken)(userId, selectedIndexToken, amount);
            if (result.success) {
                const token = (0, database_1.getIndexTokenById)(selectedIndexToken);
                await ctx.reply(`✅ **Purchase Successful!**\n\n` +
                    `💰 **Invested**: $${amount} USDC\n` +
                    `📊 **Token**: ${token?.symbol} (${token?.name})\n` +
                    `🪙 **Received**: ${result.tokensReceived} tokens\n` +
                    `💱 **Price**: $${result.pricePerToken?.toFixed(4)} per token\n` +
                    `🔗 **Transaction**: \`${result.txHash}\`\n\n` +
                    `🎉 Your index position is now active! Use /index to view your positions.`, {
                    parse_mode: "Markdown",
                    reply_markup: new grammy_1.InlineKeyboard()
                        .text("📊 View Positions", "view_index_positions")
                        .text("🛒 Buy More", "index_main")
                });
            }
            else {
                await ctx.reply(`❌ **Purchase Failed**\n\n` +
                    `**Error**: ${result.error}\n\n` +
                    `Your USDC is safe. Please try again or contact support if the issue persists.`, {
                    parse_mode: "Markdown",
                    reply_markup: new grammy_1.InlineKeyboard()
                        .text("🔄 Try Again", "index_main")
                        .text("💰 Check Balance", "check_balance")
                });
            }
            // Reset session
            ctx.session.currentAction = undefined;
            ctx.session.tempData = {};
        }
        catch (balanceError) {
            console.error("Error checking balance for index purchase:", balanceError);
            await ctx.reply("❌ Error checking your balance. Please try again.");
        }
    }
    catch (error) {
        console.error("Error processing index purchase:", error);
        await ctx.reply("❌ An unexpected error occurred. Please try again.");
    }
}
/**
 * Show user's index positions
 */
async function handleViewIndexPositions(ctx) {
    try {
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Please start the bot first with /start command.");
            return;
        }
        await ctx.answerCallbackQuery();
        // Get user's positions
        const positions = await (0, index_balance_1.getUserIndexPositions)(userId);
        if (positions.length === 0) {
            await ctx.reply(index_constants_1.INDEX_ERRORS.NO_POSITIONS + "\n\n" +
                "Ready to start investing in token baskets?", {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("🛒 Start Investing", "index_main")
                    .text("🔙 Back to Main", "main_menu")
            });
            return;
        }
        // Build positions message
        let message = `📊 **Your Index Positions**\n\n`;
        let totalValue = 0;
        let totalInvested = 0;
        for (const position of positions) {
            const categoryInfo = index_tokens_1.INDEX_CATEGORIES[position.category];
            const pnl = position.currentValue - position.totalInvested;
            const pnlPercent = (pnl / position.totalInvested) * 100;
            const pnlEmoji = pnl >= 0 ? "📈" : "📉";
            totalValue += position.currentValue;
            totalInvested += position.totalInvested;
            message += `${categoryInfo?.emoji || "📊"} **${position.symbol}**\n`;
            message += `• Tokens: ${position.tokensOwned.toFixed(6)}\n`;
            message += `• Value: $${position.currentValue.toFixed(2)}\n`;
            message += `• Invested: $${position.totalInvested.toFixed(2)}\n`;
            message += `• P&L: ${pnlEmoji} $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)\n\n`;
        }
        const totalPnL = totalValue - totalInvested;
        const totalPnLPercent = (totalPnL / totalInvested) * 100;
        const totalEmoji = totalPnL >= 0 ? "📈" : "📉";
        message += `**Portfolio Summary:**\n`;
        message += `💰 Total Value: $${totalValue.toFixed(2)}\n`;
        message += `💵 Total Invested: $${totalInvested.toFixed(2)}\n`;
        message += `${totalEmoji} Total P&L: $${totalPnL.toFixed(2)} (${totalPnLPercent.toFixed(1)}%)\n`;
        const keyboard = new grammy_1.InlineKeyboard()
            .text("🛒 Buy More", "index_main")
            .text("💵 Sell Positions", "sell_index_positions")
            .row()
            .text("🔄 Refresh", "view_index_positions")
            .text("🔙 Main Menu", "main_menu");
        await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    }
    catch (error) {
        console.error("Error viewing index positions:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Handle index positions selling - show list of positions to sell
 */
async function handleSellIndexPositions(ctx) {
    try {
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Please start the bot first with /start command.");
            return;
        }
        await ctx.answerCallbackQuery();
        // Get user's positions
        const positions = await (0, index_balance_1.getUserIndexPositions)(userId);
        if (positions.length === 0) {
            await ctx.reply("📊 **No Index Positions to Sell**\n\n" +
                "You don't have any index token positions yet.\n\n" +
                "Ready to start investing in token baskets?", {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("🛒 Start Investing", "index_main")
                    .text("🔙 Back to Main", "main_menu")
            });
            return;
        }
        // Build sell positions message with individual sell buttons
        let message = `💵 **Sell Index Positions**\n\n`;
        message += `Choose which position you'd like to sell:\n\n`;
        const keyboard = new grammy_1.InlineKeyboard();
        for (const position of positions) {
            const categoryInfo = index_tokens_1.INDEX_CATEGORIES[position.category];
            const pnl = position.currentValue - position.totalInvested;
            const pnlPercent = (pnl / position.totalInvested) * 100;
            const pnlEmoji = pnl >= 0 ? "📈" : "📉";
            message += `${categoryInfo?.emoji || "📊"} **${position.symbol}**\n`;
            message += `• Tokens: ${position.tokensOwned.toFixed(6)}\n`;
            message += `• Value: $${position.currentValue.toFixed(2)}\n`;
            message += `• P&L: ${pnlEmoji} $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)\n\n`;
            // Add sell button for this position
            keyboard.text(`💵 Sell ${position.symbol} ($${position.currentValue.toFixed(2)})`, `sell_index_token_${position.indexTokenId}`).row();
        }
        // Add navigation buttons
        keyboard
            .text("🔙 Back to Positions", "view_index_positions")
            .text("🏠 Main Menu", "main_menu");
        await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    }
    catch (error) {
        console.error("Error showing sell index positions:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Handle selling a specific index token - show sell amount options
 */
async function handleSellIndexToken(ctx, indexTokenId) {
    try {
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Please start the bot first with /start command.");
            return;
        }
        await ctx.answerCallbackQuery();
        // Get the specific position
        const positions = await (0, index_balance_1.getUserIndexPositions)(userId);
        const position = positions.find(p => p.indexTokenId === indexTokenId);
        if (!position) {
            await ctx.reply("❌ **Position Not Found**\n\n" +
                "This index token position no longer exists or has been sold.", {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("🔙 Back to Positions", "view_index_positions")
            });
            return;
        }
        // Get token details
        const token = (0, database_1.getIndexTokenById)(indexTokenId);
        if (!token) {
            await ctx.reply(index_constants_1.INDEX_ERRORS.INVALID_INDEX_TOKEN);
            return;
        }
        const categoryInfo = index_tokens_1.INDEX_CATEGORIES[position.category];
        const pnl = position.currentValue - position.totalInvested;
        const pnlPercent = (pnl / position.totalInvested) * 100;
        const pnlEmoji = pnl >= 0 ? "📈" : "📉";
        let message = `💵 **Sell ${position.symbol}**\n\n`;
        // Position details
        message += `**Your Position:**\n`;
        message += `${categoryInfo?.emoji || "📊"} ${token.name}\n`;
        message += `• **Tokens Owned**: ${position.tokensOwned.toFixed(6)} ${position.symbol}\n`;
        message += `• **Current Value**: $${position.currentValue.toFixed(2)}\n`;
        message += `• **Invested**: $${position.totalInvested.toFixed(2)}\n`;
        message += `• **P&L**: ${pnlEmoji} $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)\n\n`;
        message += `**How much would you like to sell?**\n\n`;
        message += `Choose an option below or enter a custom amount:`;
        // Create sell amount options
        const keyboard = new grammy_1.InlineKeyboard();
        // Percentage-based sell options
        const quarterValue = position.currentValue * 0.25;
        const halfValue = position.currentValue * 0.5;
        const threeQuarterValue = position.currentValue * 0.75;
        const fullValue = position.currentValue;
        keyboard
            .text(`25% ($${quarterValue.toFixed(2)})`, `sell_index_amount_${indexTokenId}_25`)
            .text(`50% ($${halfValue.toFixed(2)})`, `sell_index_amount_${indexTokenId}_50`)
            .row()
            .text(`75% ($${threeQuarterValue.toFixed(2)})`, `sell_index_amount_${indexTokenId}_75`)
            .text(`100% ($${fullValue.toFixed(2)})`, `sell_index_amount_${indexTokenId}_100`)
            .row()
            .text("📝 Custom Amount", `sell_index_custom_${indexTokenId}`)
            .row()
            .text("🔙 Back", "sell_index_positions")
            .text("❌ Cancel", "view_index_positions");
        // Store the selected token for selling in session
        ctx.session.tempData = {
            ...ctx.session.tempData,
            indexData: {
                selectedIndexToken: indexTokenId,
                sellMode: true
            }
        };
        await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    }
    catch (error) {
        console.error("Error handling sell index token:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Handle selling index token by percentage
 */
async function handleSellIndexAmount(ctx, indexTokenId, percentage) {
    try {
        await ctx.answerCallbackQuery();
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Session expired. Please try again.");
            return;
        }
        // Get the position
        const positions = await (0, index_balance_1.getUserIndexPositions)(userId);
        console.log(`🔍 Debug - Looking for indexTokenId: ${indexTokenId}`);
        console.log(`🔍 Debug - Available positions:`, positions.map(p => ({
            id: p.id,
            indexTokenId: p.indexTokenId,
            symbol: p.symbol,
            tokensOwned: p.tokensOwned
        })));
        const position = positions.find(p => p.indexTokenId === indexTokenId);
        if (!position) {
            await ctx.reply(`❌ Position not found for token ${indexTokenId}.\n\nAvailable positions: ${positions.length}\n\nDebug: ${JSON.stringify(positions.map(p => p.indexTokenId))}`);
            return;
        }
        // For 100% sells, use a special marker to indicate we want to sell everything
        // The actual amount will be determined by the wallet balance in the sell service
        if (percentage === 100) {
            console.log(`🎯 100% sell requested - will use actual wallet balance`);
            await proceedWithSell(ctx, indexTokenId, 'MAX', true); // Pass flag for 100% sell
        }
        else {
            // Calculate tokens to sell based on percentage for partial sells
            const tokensToSell = (position.tokensOwned * percentage) / 100;
            await proceedWithSell(ctx, indexTokenId, tokensToSell.toString());
        }
    }
    catch (error) {
        console.error("Error handling sell index amount:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Handle custom amount selling - prompt for input
 */
async function handleSellIndexCustomAmount(ctx, indexTokenId) {
    try {
        await ctx.answerCallbackQuery();
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Session expired. Please try again.");
            return;
        }
        // Get the position
        const positions = await (0, index_balance_1.getUserIndexPositions)(userId);
        const position = positions.find(p => p.indexTokenId === indexTokenId);
        if (!position) {
            await ctx.reply(`❌ Position not found for token ${indexTokenId}.\n\nAvailable positions: ${positions.length}`);
            return;
        }
        // Set session for custom amount input
        ctx.session.tempData = {
            ...ctx.session.tempData,
            indexData: {
                selectedIndexToken: indexTokenId,
                sellMode: true,
                customAmount: true
            }
        };
        ctx.session.currentAction = "index_sell_amount";
        const token = (0, database_1.getIndexTokenById)(indexTokenId);
        await ctx.editMessageText(`📝 **Custom Sell Amount**\n\n` +
            `**Your Position**: ${position.tokensOwned.toFixed(6)} ${position.symbol}\n` +
            `**Current Value**: $${position.currentValue.toFixed(2)}\n\n` +
            `**Enter the number of tokens to sell:**\n` +
            `(Maximum: ${position.tokensOwned.toFixed(6)} ${position.symbol})\n\n` +
            `Type the amount or use /cancel to abort.`, {
            parse_mode: "Markdown",
            reply_markup: new grammy_1.InlineKeyboard()
                .text("❌ Cancel", `sell_index_token_${indexTokenId}`)
        });
    }
    catch (error) {
        console.error("Error handling sell custom amount:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Process the actual sell with confirmation
 */
async function proceedWithSell(ctx, indexTokenId, tokenAmount, isMaxSell = false) {
    const userId = ctx.session.userId;
    if (!userId)
        return;
    // Get position and token info
    const positions = await (0, index_balance_1.getUserIndexPositions)(userId);
    const position = positions.find(p => p.indexTokenId === indexTokenId);
    const token = (0, database_1.getIndexTokenById)(indexTokenId);
    if (!position || !token) {
        await ctx.reply("❌ Position or token not found.");
        return;
    }
    let amount;
    let actualTokenAmount;
    if (isMaxSell && tokenAmount === 'MAX') {
        // For 100% sells, we'll get the actual wallet balance
        // The sell service will handle the exact amount calculation
        amount = position.tokensOwned; // Use database amount for display purposes only
        actualTokenAmount = 'MAX'; // Pass special marker to sell service
        console.log(`🎯 100% sell: Using wallet balance (display amount: ${amount})`);
    }
    else {
        // Regular amount validation for partial sells
        amount = parseFloat(tokenAmount);
        actualTokenAmount = tokenAmount;
        if (amount <= 0 || amount > position.tokensOwned) {
            await ctx.reply(`❌ **Invalid Amount**\n\n` +
                `Please enter a valid amount between 0.000001 and ${position.tokensOwned.toFixed(6)} ${position.symbol}.`);
            return;
        }
    }
    const categoryInfo = index_tokens_1.INDEX_CATEGORIES[position.category];
    const valueToSell = (position.currentValue / position.tokensOwned) * amount;
    const percentageToSell = (amount / position.tokensOwned) * 100;
    let message = `💵 **Confirm Sale**\n\n`;
    message += `**Token**: ${categoryInfo?.emoji || "📊"} ${token.symbol}\n`;
    message += `**Amount to Sell**: ${amount.toFixed(6)} tokens (${percentageToSell.toFixed(1)}%)\n`;
    message += `**Estimated Value**: ~$${valueToSell.toFixed(2)} USDC\n\n`;
    message += `**Important Notes:**\n`;
    message += `⚠️ Final amount may vary due to price changes\n`;
    message += `⚠️ This action cannot be undone\n`;
    message += `⚠️ Gas fees will be sponsored (free for you)\n\n`;
    message += `Proceed with this sale?`;
    // Store sell data in session
    ctx.session.tempData = {
        ...ctx.session.tempData,
        indexData: {
            selectedIndexToken: indexTokenId,
            sellAmount: actualTokenAmount, // Use the actual amount or 'MAX'
            sellMode: true,
            isMaxSell: isMaxSell // Store the flag for later use
        }
    };
    ctx.session.currentAction = "index_sell_confirm";
    const keyboard = new grammy_1.InlineKeyboard()
        .text("✅ Confirm Sale", "index_sell_confirm_yes")
        .text("❌ Cancel", "index_sell_confirm_no")
        .row()
        .text("🔙 Change Amount", `sell_index_token_${indexTokenId}`);
    try {
        await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    }
    catch (editError) {
        // If edit fails, send a new message instead
        console.log('Message edit failed, sending new message:', editError.description);
        await ctx.reply(message, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    }
}
/**
 * Handle sell confirmation
 */
async function handleIndexSellConfirmation(ctx, confirmed) {
    try {
        await ctx.answerCallbackQuery();
        if (!confirmed) {
            await ctx.reply("❌ Sale cancelled.");
            ctx.session.currentAction = undefined;
            ctx.session.tempData = {};
            return;
        }
        const tempData = ctx.session.tempData || {};
        const { selectedIndexToken, sellAmount } = tempData.indexData || {};
        const userId = ctx.session.userId;
        if (!userId || !selectedIndexToken || !sellAmount) {
            await ctx.reply("❌ Session expired. Please start again.");
            return;
        }
        await ctx.reply("⏳ Processing your index token sale...\n\n🔄 This may take 30-60 seconds.");
        // Execute the actual sell transaction
        const result = await (0, sell_index_1.sellIndexToken)(userId, selectedIndexToken, sellAmount);
        if (result.success) {
            const token = (0, database_1.getIndexTokenById)(selectedIndexToken);
            await ctx.reply(`✅ **Sale Successful!**\n\n` +
                `💵 **Sold**: ${sellAmount} ${token?.symbol}\n` +
                `💰 **Received**: ${result.tokensReceived} USDC\n` +
                `💱 **Price**: $${result.pricePerToken?.toFixed(4)} per token\n` +
                `🔗 **Transaction**: \`${result.txHash}\`\n\n` +
                `🎉 USDC has been added to your wallet! Use /index to view remaining positions.`, {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("📊 View Positions", "view_index_positions")
                    .text("🛒 Buy More", "index_main")
            });
        }
        else {
            await ctx.reply(`❌ **Sale Failed**\n\n` +
                `**Error**: ${result.error}\n\n` +
                `Your tokens are safe. Please try again or contact support if the issue persists.`, {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "view_index_positions")
                    .text("💰 Check Positions", "view_index_positions")
            });
        }
        // Reset session
        ctx.session.currentAction = undefined;
        ctx.session.tempData = {};
    }
    catch (error) {
        console.error("Error processing index sell:", error);
        await ctx.reply("❌ An unexpected error occurred. Please try again.");
    }
}
/**
 * Handle custom sell amount text input
 */
async function handleIndexSellAmountInput(ctx) {
    try {
        const amountInput = ctx.message?.text;
        if (!amountInput) {
            await ctx.reply("❌ Invalid request. Please try again.");
            return;
        }
        const tempData = ctx.session.tempData || {};
        const selectedIndexToken = tempData.indexData?.selectedIndexToken;
        if (!selectedIndexToken) {
            await ctx.reply("❌ Session expired. Please start again with /index");
            return;
        }
        // Validate amount
        const amount = parseFloat(amountInput);
        if (isNaN(amount) || amount <= 0) {
            await ctx.reply("❌ Invalid amount. Please enter a positive number.");
            return;
        }
        // Get position to validate against owned tokens
        const positions = await (0, index_balance_1.getUserIndexPositions)(ctx.session.userId);
        const position = positions.find(p => p.indexTokenId === selectedIndexToken);
        if (!position) {
            await ctx.reply("❌ Position not found.");
            return;
        }
        if (amount > position.tokensOwned) {
            await ctx.reply(`❌ **Insufficient Tokens**\n\n` +
                `You only own ${position.tokensOwned.toFixed(6)} ${position.symbol}, but trying to sell ${amount}.\n\n` +
                `Please enter a smaller amount.`);
            return;
        }
        // Reset current action and proceed with sell
        ctx.session.currentAction = undefined;
        await proceedWithSell(ctx, selectedIndexToken, amountInput);
    }
    catch (error) {
        console.error("Error handling sell amount input:", error);
        await ctx.reply(index_constants_1.INDEX_ERRORS.NETWORK_ERROR);
    }
}
/**
 * Handle retry after manual transfer
 */
async function handleIndexRetryAfterTransfer(ctx, isAutoRetry = false) {
    try {
        // Only answer callback query if this is a manual retry, not an auto-retry
        if (!isAutoRetry) {
            await ctx.answerCallbackQuery();
        }
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Please start the bot first with /start command.");
            return;
        }
        const tempData = ctx.session.tempData || {};
        const { selectedIndexToken, amount } = tempData.indexData || {};
        if (!selectedIndexToken || !amount) {
            await ctx.reply("❌ Session expired. Please start again with /index");
            return;
        }
        // Check Smart Wallet balance
        const checkingMessage = isAutoRetry
            ? `🕰 **Automatic Balance Check**\n\n` +
                `⏳ Checking if your transfer has arrived...`
            : `🔄 **Checking Smart Wallet Balance...**\n\n` +
                `⏳ Please wait while we verify your transfer...`;
        await ctx.reply(checkingMessage, { parse_mode: "Markdown" });
        // Add a small delay for blockchain confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Check balance again and potentially proceed with transaction
        const { checkAllUSDCBalances } = await Promise.resolve().then(() => __importStar(require("../lib/coinbase-wallet")));
        const balances = await checkAllUSDCBalances(userId);
        if (!balances) {
            // Try to get balances from session data to show address even if check failed
            const tempData = ctx.session.tempData || {};
            const sessionToken = tempData.indexData?.selectedIndexToken;
            const sessionAmount = tempData.indexData?.amount;
            const token = sessionToken ? (0, database_1.getIndexTokenById)(sessionToken) : null;
            await ctx.reply(`❌ **Balance Check Failed**\n\n` +
                `Unable to verify your Smart Wallet balance right now.\n\n` +
                `${token && sessionAmount ? `📊 **Your Purchase:** ${token.symbol} - $${parseFloat(sessionAmount).toFixed(2)} USDC\n\n` : ''}` +
                `💡 **What to do:**\n` +
                `• Wait 30 seconds and try "Check Again"\n` +
                `• Network might be temporarily busy\n` +
                `• Your transfer may still be processing`, {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("🔄 Check Again", "index_retry_after_transfer")
                    .text("❌ Cancel", "index_cancel_transfer")
            });
            return;
        }
        const smartWalletBalance = parseFloat(balances.smartWalletBalance);
        const requestedAmount = parseFloat(amount);
        if (smartWalletBalance >= requestedAmount) {
            // Sufficient balance - proceed with purchase
            const successMessage = isAutoRetry
                ? `🎉 **Transfer Auto-Detected!**\n\n` +
                    `💰 Smart Wallet Balance: $${smartWalletBalance.toFixed(2)} USDC\n` +
                    `📊 Required: $${requestedAmount.toFixed(2)} USDC\n\n` +
                    `✨ Perfect! Your transfer arrived and we caught it automatically!\n` +
                    `⚡ Now proceeding with your gasless purchase...`
                : `✅ **Transfer Detected!**\n\n` +
                    `Smart Wallet Balance: $${smartWalletBalance.toFixed(2)} USDC\n` +
                    `Required: $${requestedAmount.toFixed(2)} USDC\n\n` +
                    `⚡ Proceeding with gasless purchase...`;
            await ctx.reply(successMessage, { parse_mode: "Markdown" });
            // Continue with the actual purchase
            await executePurchaseFlow(ctx, userId, selectedIndexToken, amount);
        }
        else {
            // Still insufficient - show current status with address for continued monitoring
            const stillNeeded = requestedAmount - smartWalletBalance;
            const token = (0, database_1.getIndexTokenById)(selectedIndexToken);
            await ctx.reply(`🟡 **Transfer In Progress**\n\n` +
                `📊 **Purchase:** ${token?.symbol || 'Index Token'} - $${requestedAmount.toFixed(2)} USDC\n` +
                `💰 **Current Balance:** $${smartWalletBalance.toFixed(2)} USDC\n` +
                `📈 **Still needed:** $${stillNeeded.toFixed(2)} USDC\n\n` +
                `🎯 **Your Smart Wallet Address:**\n` +
                `\`${balances?.smartWalletAddress}\`\n\n` +
                `⏳ **Status:** Transfer may still be processing...\n` +
                `⚡ Blockchain transactions can take 30-60 seconds\n\n` +
                `💡 **Next Steps:**\n` +
                `• If you haven't sent funds yet, send $${stillNeeded.toFixed(2)} USDC to the address above\n` +
                `• If you already sent, wait 30-60 seconds then click "Check Again"\n` +
                `• We'll automatically continue once funds arrive!\n\n` +
                `🕰 **Auto-check:** We'll check again in 30 seconds automatically`, {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("📋 Copy Address", `select_address_${balances?.smartWalletAddress}`)
                    .row()
                    .text("🔄 Check Now", "index_retry_after_transfer")
                    .text("❌ Cancel Purchase", "index_cancel_transfer")
            });
            // Set up automatic retry in 30 seconds
            setTimeout(async () => {
                try {
                    // Only auto-retry if the user hasn't already completed or cancelled
                    const currentTempData = ctx.session.tempData || {};
                    if (currentTempData.indexData?.selectedIndexToken === selectedIndexToken) {
                        console.log(`🕰 Auto-retry triggered for user ${userId} after 30 seconds`);
                        await handleIndexRetryAfterTransfer(ctx, true); // Pass true for isAutoRetry
                    }
                }
                catch (error) {
                    console.error('Auto-retry failed:', error);
                }
            }, 30000);
        }
    }
    catch (error) {
        console.error("Error handling retry after transfer:", error);
        await ctx.reply("❌ An error occurred while checking your balance. Please try again.");
    }
}
/**
 * Handle select address for easy copying
 */
async function handleSelectAddress(ctx, address) {
    try {
        await ctx.answerCallbackQuery();
        await ctx.reply(`📋 **Smart Wallet Address**\n\n` +
            `Tap the address below to easily select and copy:\n\n` +
            `\`${address}\`\n\n` +
            `💡 **Copy Instructions:**\n` +
            `• **Mobile**: Tap the address above to select, then copy\n` +
            `• **Desktop**: Click the address to select, then Ctrl+C (or Cmd+C on Mac)\n\n` +
            `⚠️ **Important:**\n` +
            `• Send USDC on **Base network** only\n` +
            `• Use this exact address - no spaces or extra characters\n` +
            `• Double-check the address before sending`, {
            parse_mode: "Markdown",
            reply_markup: new grammy_1.InlineKeyboard()
                .text("🔄 Back to Transfer", "index_retry_after_transfer")
        });
    }
    catch (error) {
        console.error("Error handling select address:", error);
        await ctx.reply("❌ Error displaying address. Please try again.");
    }
}
/**
 * Handle cancelling transfer and purchase
 */
async function handleIndexCancelTransfer(ctx) {
    try {
        await ctx.answerCallbackQuery();
        // Clear session data
        ctx.session.currentAction = undefined;
        ctx.session.tempData = {};
        await ctx.reply(`❌ **Purchase Cancelled**\n\n` +
            `Your funds remain safe in your wallets. You can try purchasing index tokens again anytime!`, {
            parse_mode: "Markdown",
            reply_markup: new grammy_1.InlineKeyboard()
                .text("💰 Check Balance", "check_balance")
                .text("🌐 Main Menu", "main_menu")
        });
    }
    catch (error) {
        console.error("Error handling cancel transfer:", error);
        await ctx.reply("❌ Something went wrong. Please try /start to reset.");
    }
}
/**
 * Execute the actual purchase flow after balance verification
 */
async function executePurchaseFlow(ctx, userId, selectedIndexToken, amount) {
    try {
        const token = (0, database_1.getIndexTokenById)(selectedIndexToken);
        if (!token) {
            await ctx.reply("❌ Token not found. Please start again.");
            return;
        }
        await ctx.reply(`⚡ **Executing Gasless Purchase...**\n\n` +
            `• Token: ${token.symbol}\n` +
            `• Amount: $${amount} USDC\n` +
            `• Status: Processing transaction...\n\n` +
            `⏳ This may take 30-90 seconds`, { parse_mode: "Markdown" });
        // Execute the actual purchase
        const result = await (0, index_core_1.buyIndexToken)(userId, selectedIndexToken, amount);
        if (result.success) {
            // Purchase successful
            const categoryInfo = index_tokens_1.INDEX_CATEGORIES[token.category];
            await ctx.reply(`🎉 **Purchase Successful!**\n\n` +
                `🎯 **Token**: ${categoryInfo?.emoji || "📊"} ${token.symbol}\n` +
                `💰 **Invested**: $${amount} USDC\n` +
                `📈 **Tokens Received**: ${result.tokensReceived} ${token.symbol}\n` +
                `💱 **Price**: $${result.pricePerToken?.toFixed(4)} per token\n` +
                `🔗 **Transaction**: \`${result.txHash}\`\n\n` +
                `🎆 Welcome to the world of index token investing! Your tokens are now working for you.`, {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("📊 View Portfolio", "view_portfolio")
                    .text("📊 My Positions", "view_index_positions")
                    .row()
                    .text("🎆 Buy More", "index_main")
            });
        }
        else {
            // Purchase failed
            await ctx.reply(`❌ **Purchase Failed**\n\n` +
                `**Error**: ${result.error}\n\n` +
                `Your funds are safe in your Smart Wallet. Please try again or contact support if the issue persists.`, {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("🔄 Try Again", "index_retry_after_transfer")
                    .text("💰 Check Balance", "check_balance")
            });
        }
        // Clear session
        ctx.session.currentAction = undefined;
        ctx.session.tempData = {};
    }
    catch (error) {
        console.error("Error executing purchase flow:", error);
        await ctx.reply(`❌ **Transaction Error**\n\n` +
            `An unexpected error occurred during purchase. Your funds are safe.\n\n` +
            `Please try again or contact support if the issue persists.`);
    }
}
exports.default = indexTokensHandler;
