import { BotContext } from "../context";
import { InlineKeyboard } from "grammy";
import { getWallet } from "../lib/token-wallet";
import { startDepositMonitoring } from "../lib/database";

export interface PendingTransaction {
  type: 'invest' | 'withdraw';
  protocol: string;
  poolId: string;
  amount: number;
  apy: number;
  shortage: number;
  timestamp: number;
  reminderSent?: boolean;
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
 * Store pending transaction in user session and database
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
    reminderSent: false
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
 * Get pending transaction from session
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
 * Clear pending transaction from session and database
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
 * Generate smart contextual message for insufficient balance
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
 * Create smart recovery keyboard with contextual options
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
 * Show intelligent insufficient balance flow with deposit screen
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

    // Start 5-minute monitoring window
    startDepositMonitoring(userId, 5);
    
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
 * Generate completion offer message for successful deposit
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
 * Generate partial deposit message when user deposits less than needed
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
 * Create completion keyboard for successful deposits
 */
export function createCompletionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Complete Investment", "retry_pending_transaction")
    .row()
    .text("💼 Keep in Wallet", "cancel_pending_transaction")
    .text("🎯 View Options", "main_menu");
}

/**
 * Create partial deposit keyboard
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
 * Check if user has a valid pending transaction
 */
export function hasPendingTransaction(ctx: BotContext): boolean {
  const pending = getPendingTransaction(ctx);
  return !!pending;
}

/**
 * Get shortage amount from pending transaction
 */
export function getPendingShortage(ctx: BotContext): number {
  const pending = getPendingTransaction(ctx);
  return pending?.shortage || 0;
}