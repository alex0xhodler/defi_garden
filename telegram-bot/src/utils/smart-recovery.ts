import { BotContext } from "../context";
import { InlineKeyboard } from "grammy";
import { getWallet } from "../lib/token-wallet";
import { startDepositMonitoringWithContext } from "../lib/database";

export interface PendingTransaction {
  type: 'invest' | 'withdraw';
  protocol: string;
  poolId: string;
  amount: number;
  apy: number;
  shortage: number;
  timestamp: number;
  reminderSent?: boolean;
  // Enhanced for manual selection completion
  isManualSelection?: boolean;
  deployFn?: string;
  service?: string; 
  displayName?: string;
  project?: string;
  riskScore?: number;
}

export interface InsufficientBalanceDetails {
  currentBalance: number;
  requestedAmount: number;
  shortage: number;
  protocol: string;
  poolId: string;
  apy: number;
  poolInfo?: any;
}

/**
 * Stores the details of a pending transaction in both the user's session and the database.
 * This is used to recover the transaction later, for example, after the user deposits more funds.
 * @param {BotContext} ctx - The bot context.
 * @param {InsufficientBalanceDetails} details - The details of the transaction that failed due to insufficient balance.
 */
export function storePendingTransaction(ctx: BotContext, details: InsufficientBalanceDetails): void {
  const pendingTx: PendingTransaction = {
    type: 'invest' as const,
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
    riskScore: details.poolInfo?.riskScore
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
      let sessionData: any = {};
      
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
  } catch (error) {
    console.error("Error storing pending transaction to database:", error);
  }
}

/**
 * Retrieves the pending transaction from the user's session.
 * It also checks if the pending transaction has expired and clears it if necessary.
 * @param {BotContext} ctx - The bot context.
 * @returns {PendingTransaction | undefined} The pending transaction object, or undefined if none exists or it has expired.
 */
export function getPendingTransaction(ctx: BotContext): PendingTransaction | undefined {
  const pending = ctx.session.pendingTransaction;

  // Check if expired (5 minutes)
  if (pending && Date.now() - pending.timestamp > 5 * 60 * 1000) {
    clearPendingTransaction(ctx);
    return undefined;
  }
  
  return pending;
}

/**
 * Clears any pending transaction from the user's session and the database.
 * @param {BotContext} ctx - The bot context.
 */
export function clearPendingTransaction(ctx: BotContext): void {
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
  } catch (error) {
    console.error("Error clearing pending transaction from database:", error);
  }
}

/**
 * Generates a user-friendly message explaining why a transaction failed due to insufficient balance.
 * @param {InsufficientBalanceDetails} details - The details of the failed transaction.
 * @returns {string} A formatted markdown message.
 */
export function generateSmartMessage(details: InsufficientBalanceDetails): string {
  const { currentBalance, requestedAmount, shortage, protocol, apy } = details;

  return `💳 **Smart Savings Assistant**\n\n` +
    `You're **$${shortage.toFixed(2)} short** for this investment:\n` +
    `• Protocol: **${protocol}**\n` +
    `• Target APY: **${apy}%**\n` +
    `• Your balance: $${currentBalance.toFixed(2)}\n` +
    `• Needed: $${requestedAmount.toFixed(2)}\n\n` +
    `**Deposit USDC to continue:**\n`;
}

/**
 * Creates a keyboard with contextual options for the user to recover from an insufficient balance error.
 * Options may include depositing more funds, investing the available amount, or changing the amount.
 * @param {InsufficientBalanceDetails} details - The details of the failed transaction.
 * @returns {InlineKeyboard} A grammY InlineKeyboard object.
 */
export function createSmartRecoveryKeyboard(details: InsufficientBalanceDetails): InlineKeyboard {
  const { shortage, currentBalance } = details;

  return new InlineKeyboard()
    .text(`📥 Deposit $${shortage.toFixed(2)}`, "deposit")
    .text("🔍 Check Deposit", "manual_deposit_check")
    .row()
    .text(`💰 Invest $${currentBalance.toFixed(2)} Now`, "invest_available")
    .text("🔄 Change Amount", "modify_amount")
    .row()
    .text("❌ Cancel", "cancel_investment");
}

/**
 * Initiates the smart recovery flow when a user has an insufficient balance.
 * It stores the pending transaction, starts deposit monitoring, and sends a message to the user
 * with their deposit address and recovery options.
 * @param {BotContext} ctx - The bot context.
 * @param {InsufficientBalanceDetails} details - The details of the failed transaction.
 * @returns {Promise<void>}
 */
export async function sendInsufficientBalanceFlow(
  ctx: BotContext,
  details: InsufficientBalanceDetails
): Promise<void> {
  try {
    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.reply("❌ User session not found. Please restart with /start");
      return;
    }

    // Store pending transaction
    storePendingTransaction(ctx, details);

    // Start 5-minute monitoring window with manual selection context
    startDepositMonitoringWithContext(userId, 'manual_selection', 5, {
      protocol: details.protocol,
      amount: details.requestedAmount,
      apy: details.apy
    });
    
    // Force refresh event monitor to immediately watch this wallet
    try {
      const eventMonitor = require("../services/event-monitor.js");
      await eventMonitor.forceRefreshWallets();
      console.log(`🔄 Started 5-minute deposit monitoring for insufficient balance - user ${userId}`);
    } catch (error) {
      console.error("Could not force refresh wallets for insufficient balance monitoring:", error);
    }

    // Get user's wallet address
    const wallet = await getWallet(userId);
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

  } catch (error) {
    console.error("Error in sendInsufficientBalanceFlow:", error);
    await ctx.reply("❌ Something went wrong setting up the deposit flow. Please try again.");
  }
}

/**
 * Generates a message to offer the completion of a pending transaction after a successful deposit.
 * @param {string} firstName - The user's first name.
 * @param {number} depositAmount - The amount the user deposited.
 * @param {string} tokenSymbol - The symbol of the deposited token.
 * @param {PendingTransaction} pending - The details of the pending transaction.
 * @returns {string} A formatted markdown message.
 */
export function generateCompletionMessage(
  firstName: string,
  depositAmount: number,
  tokenSymbol: string,
  pending: PendingTransaction
): string {
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
 * Generates a message for when a user makes a partial deposit that is not enough to cover the pending transaction.
 * @param {string} firstName - The user's first name.
 * @param {number} depositAmount - The amount the user deposited.
 * @param {string} tokenSymbol - The symbol of the deposited token.
 * @param {number} stillNeeded - The remaining amount needed.
 * @param {PendingTransaction} pending - The details of the pending transaction.
 * @returns {string} A formatted markdown message.
 */
export function generatePartialDepositMessage(
  firstName: string,
  depositAmount: number,
  tokenSymbol: string,
  stillNeeded: number,
  pending: PendingTransaction
): string {
  return `💰 **Partial Deposit Received ${firstName}**\n\n` +
    `+$${depositAmount} ${tokenSymbol} received\n` +
    `You still need **$${stillNeeded.toFixed(2)}** more\n\n` +
    `**Your pending investment:**\n` +
    `• ${pending.protocol} at ${pending.apy}% APY\n` +
    `• Total needed: $${pending.amount}\n\n` +
    `What would you like to do?`;
}

/**
 * Creates a keyboard with options for the user after they have deposited enough funds to complete a pending transaction.
 * @returns {InlineKeyboard} A grammY InlineKeyboard object.
 */
export function createCompletionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Complete Investment", "retry_pending_transaction")
    .row()
    .text("💼 Keep in Wallet", "cancel_pending_transaction")
    .text("🎯 View Options", "main_menu");
}

/**
 * Creates a keyboard with options for the user after they have made a partial deposit.
 * @param {number} stillNeeded - The remaining amount the user needs to deposit.
 * @returns {InlineKeyboard} A grammY InlineKeyboard object.
 */
export function createPartialDepositKeyboard(stillNeeded: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(`📥 Deposit $${stillNeeded.toFixed(2)} More`, "deposit")
    .row()
    .text("💰 Invest Available Funds", "invest_available")
    .row()
    .text("❌ Cancel", "cancel_pending_transaction");
}

/**
 * Checks if the user has a valid, non-expired pending transaction in their session.
 * @param {BotContext} ctx - The bot context.
 * @returns {boolean} True if a valid pending transaction exists, false otherwise.
 */
export function hasPendingTransaction(ctx: BotContext): boolean {
  const pending = getPendingTransaction(ctx);
  return !!pending;
}

/**
 * Gets the shortage amount from the user's pending transaction.
 * @param {BotContext} ctx - The bot context.
 * @returns {number} The shortage amount, or 0 if no pending transaction exists.
 */
export function getPendingShortage(ctx: BotContext): number {
  const pending = getPendingTransaction(ctx);
  return pending?.shortage || 0;
}