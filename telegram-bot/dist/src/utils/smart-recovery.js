"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storePendingTransaction = storePendingTransaction;
exports.getPendingTransaction = getPendingTransaction;
exports.clearPendingTransaction = clearPendingTransaction;
exports.generateSmartMessage = generateSmartMessage;
exports.createSmartRecoveryKeyboard = createSmartRecoveryKeyboard;
exports.sendInsufficientBalanceFlow = sendInsufficientBalanceFlow;
exports.generateCompletionMessage = generateCompletionMessage;
exports.generatePartialDepositMessage = generatePartialDepositMessage;
exports.createCompletionKeyboard = createCompletionKeyboard;
exports.createPartialDepositKeyboard = createPartialDepositKeyboard;
exports.hasPendingTransaction = hasPendingTransaction;
exports.getPendingShortage = getPendingShortage;
const grammy_1 = require("grammy");
const token_wallet_1 = require("../lib/token-wallet");
const database_1 = require("../lib/database");
/**
 * Store pending transaction in user session and database
 */
function storePendingTransaction(ctx, details) {
    const pendingTx = {
        type: 'invest',
        protocol: details.protocol,
        poolId: details.poolId,
        amount: details.requestedAmount,
        apy: details.apy,
        shortage: details.shortage,
        timestamp: Date.now(),
        reminderSent: false,
        // Mark as manual selection for auto-deployment logic
        isManualSelection: true,
        // Store deployment metadata from poolInfo if available
        deployFn: details.poolInfo?.deployFn,
        service: details.poolInfo?.service,
        displayName: details.poolInfo?.displayName || details.protocol,
        project: details.poolInfo?.project || details.protocol,
        riskScore: details.poolInfo?.riskScore,
        poolInfo: details.poolInfo // Store full poolInfo for retry
    };
    // Store in in-memory session
    ctx.session.pendingTransaction = pendingTx;
    // Also store in database for event monitor access
    try {
        const { getDatabase } = require("../lib/database");
        const db = getDatabase();
        const userId = ctx.session.userId;
        if (userId) {
            // Get current session data
            const userSession = db.prepare('SELECT session_data FROM users WHERE userId = ?').get(userId);
            let sessionData = {};
            if (userSession && userSession.session_data) {
                sessionData = JSON.parse(userSession.session_data);
            }
            // Add pending transaction
            sessionData.pendingTransaction = pendingTx;
            // Save back to database
            db.prepare('UPDATE users SET session_data = ? WHERE userId = ?')
                .run(JSON.stringify(sessionData), userId);
            console.log(`💾 Stored pending transaction in DB for user ${userId}: ${details.protocol} $${details.requestedAmount}`);
        }
    }
    catch (error) {
        console.error("Error storing pending transaction to database:", error);
    }
}
/**
 * Get pending transaction from session
 */
function getPendingTransaction(ctx) {
    const pending = ctx.session.pendingTransaction;
    // Check if expired (5 minutes)
    if (pending && Date.now() - pending.timestamp > 5 * 60 * 1000) {
        clearPendingTransaction(ctx);
        return undefined;
    }
    return pending;
}
/**
 * Clear pending transaction from session and database
 */
function clearPendingTransaction(ctx) {
    // Clear from in-memory session
    if (ctx.session.pendingTransaction) {
        delete ctx.session.pendingTransaction;
    }
    // Also clear from database
    try {
        const { getDatabase } = require("../lib/database");
        const db = getDatabase();
        const userId = ctx.session.userId;
        if (userId) {
            // Get current session data
            const userSession = db.prepare('SELECT session_data FROM users WHERE userId = ?').get(userId);
            if (userSession && userSession.session_data) {
                const sessionData = JSON.parse(userSession.session_data);
                if (sessionData.pendingTransaction) {
                    delete sessionData.pendingTransaction;
                    // Save back to database
                    db.prepare('UPDATE users SET session_data = ? WHERE userId = ?')
                        .run(JSON.stringify(sessionData), userId);
                    console.log(`🗑️ Cleared pending transaction from DB for user ${userId}`);
                }
            }
        }
    }
    catch (error) {
        console.error("Error clearing pending transaction from database:", error);
    }
}
/**
 * Generate smart contextual message for insufficient balance
 */
function generateSmartMessage(details) {
    const { currentBalance, requestedAmount, shortage, protocol, apy } = details;
    let message = `💳 **Smart Investment Assistant**\n\n` +
        `You're **$${shortage.toFixed(2)} short** for this investment:\n` +
        `• Investment: **${protocol}**\n`;
    // Only show APY if it's greater than 0 (yield farming protocols)
    if (apy > 0) {
        message += `• Target APY: **${apy}%**\n`;
    }
    message += `• Your balance: $${currentBalance.toFixed(2)}\n` +
        `• Needed: $${requestedAmount.toFixed(2)}\n\n` +
        `**Deposit USDC to continue:**\n`;
    return message;
}
/**
 * Create smart recovery keyboard with contextual options
 */
function createSmartRecoveryKeyboard(details) {
    const { shortage, currentBalance, poolInfo } = details;
    // Check if this is an index token purchase
    const isIndexToken = poolInfo?.service === 'index-tokens' || poolInfo?.deployFn === 'buyIndexToken';
    if (isIndexToken) {
        // Index token specific keyboard with vertical layout
        return new grammy_1.InlineKeyboard()
            .text(`✅ Invest $${currentBalance.toFixed(2)} Now`, "index_adjust_confirm")
            .row()
            .text(`📥 Deposit $${shortage.toFixed(2)} More`, "deposit")
            .row()
            .text("🔍 Check Deposit", "manual_deposit_check")
            .row()
            .text("🔄 Change Amount", "index_adjust_change")
            .row()
            .text("❌ Cancel", "index_adjust_cancel");
    }
    else {
        // Standard yield investment keyboard
        return new grammy_1.InlineKeyboard()
            .text(`📥 Deposit $${shortage.toFixed(2)}`, "deposit")
            .text("🔍 Check Deposit", "manual_deposit_check")
            .row()
            .text(`💰 Invest $${currentBalance.toFixed(2)} Now`, "invest_available")
            .text("🔄 Change Amount", "modify_amount")
            .row()
            .text("❌ Cancel", "cancel_investment");
    }
}
/**
 * Show intelligent insufficient balance flow with deposit screen
 */
async function sendInsufficientBalanceFlow(ctx, details) {
    try {
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ User session not found. Please restart with /start");
            return;
        }
        // Store pending transaction
        storePendingTransaction(ctx, details);
        // For index tokens, also store session data for the adjust handlers
        const isIndexToken = details.poolInfo?.service === 'index-tokens' || details.poolInfo?.deployFn === 'buyIndexToken';
        if (isIndexToken) {
            const tempData = ctx.session.tempData || {};
            tempData.indexData = {
                selectedIndexToken: details.poolId,
                amount: details.requestedAmount.toString(),
                adjustedAmount: details.currentBalance.toString(),
                originalAmount: details.requestedAmount.toString()
            };
            ctx.session.tempData = tempData;
            ctx.session.currentAction = "index_adjust";
        }
        // Start 5-minute monitoring window with manual selection context
        (0, database_1.startDepositMonitoringWithContext)(userId, 'manual_selection', 5, {
            protocol: details.protocol,
            amount: details.requestedAmount,
            apy: details.apy
        });
        // Force refresh event monitor to immediately watch this wallet
        try {
            const eventMonitor = require("../services/event-monitor.js");
            await eventMonitor.forceRefreshWallets();
            console.log(`🔄 Started 5-minute deposit monitoring for insufficient balance - user ${userId}`);
        }
        catch (error) {
            console.error("Could not force refresh wallets for insufficient balance monitoring:", error);
        }
        // Get user's wallet address
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        if (!wallet) {
            await ctx.reply("❌ Wallet not found. Please set up your wallet first.");
            return;
        }
        const depositAddress = wallet.address;
        // Generate smart message
        const message = generateSmartMessage(details) +
            `\`${depositAddress}\`\n\n` +
            `*Network:* Base (super cheap fees!)\n` +
            `*Monitoring:* 5 minutes active\n\n` +
            `✅ **I'll auto-complete your investment when funds arrive!** 🦑`;
        // Create contextual keyboard
        const keyboard = createSmartRecoveryKeyboard(details);
        await ctx.reply(message, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
        console.log(`💳 Smart recovery flow initiated for user ${userId}: $${details.shortage} shortage for ${details.protocol}`);
    }
    catch (error) {
        console.error("Error in sendInsufficientBalanceFlow:", error);
        await ctx.reply("❌ Something went wrong setting up the deposit flow. Please try again.");
    }
}
/**
 * Generate completion offer message for successful deposit
 */
function generateCompletionMessage(firstName, depositAmount, tokenSymbol, pending) {
    return `🎉 **Perfect ${firstName}!**\n\n` +
        `You deposited **$${depositAmount} ${tokenSymbol}**\n` +
        `✅ You now have enough for your investment!\n\n` +
        `**Ready to complete:**\n` +
        `• Protocol: ${pending.protocol}\n` +
        `• Amount: $${pending.amount}\n` +
        `• APY: ${pending.apy}%\n\n` +
        `Shall I complete your investment now?`;
}
/**
 * Generate partial deposit message when user deposits less than needed
 */
function generatePartialDepositMessage(firstName, depositAmount, tokenSymbol, stillNeeded, pending) {
    return `💰 **Partial Deposit Received ${firstName}**\n\n` +
        `+$${depositAmount} ${tokenSymbol} received\n` +
        `You still need **$${stillNeeded.toFixed(2)}** more\n\n` +
        `**Your pending investment:**\n` +
        `• ${pending.protocol} at ${pending.apy}% APY\n` +
        `• Total needed: $${pending.amount}\n\n` +
        `What would you like to do?`;
}
/**
 * Create completion keyboard for successful deposits
 */
function createCompletionKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("✅ Complete Investment", "retry_pending_transaction")
        .row()
        .text("💼 Keep in Wallet", "cancel_pending_transaction")
        .text("🎯 View Options", "main_menu");
}
/**
 * Create partial deposit keyboard
 */
function createPartialDepositKeyboard(stillNeeded) {
    return new grammy_1.InlineKeyboard()
        .text(`📥 Deposit $${stillNeeded.toFixed(2)} More`, "deposit")
        .row()
        .text("💰 Invest Available Funds", "invest_available")
        .row()
        .text("❌ Cancel", "cancel_pending_transaction");
}
/**
 * Check if user has a valid pending transaction
 */
function hasPendingTransaction(ctx) {
    const pending = getPendingTransaction(ctx);
    return !!pending;
}
/**
 * Get shortage amount from pending transaction
 */
function getPendingShortage(ctx) {
    const pending = getPendingTransaction(ctx);
    return pending?.shortage || 0;
}
