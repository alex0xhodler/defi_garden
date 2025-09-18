import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { updateUserOnboardingStatus } from "./database";

// Create bot instance for notifications (will be initialized later)
let notificationBot: Bot | null = null;

/**
 * Initialize the notification bot instance
 */
export function initializeNotificationBot(bot: Bot): void {
  notificationBot = bot;
}

/**
 * Send deposit confirmation notification to user
 */
export async function notifyDepositReceived(
  userId: string, 
  firstName: string, 
  amount: string, 
  tokenSymbol: string
): Promise<void> {
  if (!notificationBot) {
    console.error("Notification bot not initialized");
    return;
  }

  try {
    const keyboard = new InlineKeyboard()
      .text("🚀 Start Earning", "zap_auto_deploy")
      .row()
      .text("📊 View Balance", "check_balance");

    const message = `✨ Deposit confirmed ${firstName}!\n\n` +
      `${amount} ${tokenSymbol} is now working quietly in the background for you.\n\n` +
      `Ready to start earning?`;

    await notificationBot.api.sendMessage(userId, message, {
      reply_markup: keyboard,
      parse_mode: "Markdown"
    });

    // Mark onboarding as completed
    updateUserOnboardingStatus(userId, true);

  } catch (error) {
    console.error(`Failed to send deposit notification to user ${userId}:`, error);
  }
}

/**
 * Send yield update notification
 */
export async function notifyYieldUpdate(
  userId: string,
  firstName: string,
  totalYield: number,
  dailyYield: number
): Promise<void> {
  if (!notificationBot) return;

  try {
    const keyboard = new InlineKeyboard()
      .text("📊 View Portfolio", "view_portfolio")
      .row()
      .text("💰 Collect Earnings", "harvest_yields");

    const message = `💰 ${firstName}, your account is growing!\n\n` +
      `💰 Total earned: $${totalYield.toFixed(2)}\n` +
      `📈 Today: +$${dailyYield.toFixed(2)}\n\n` +
      `Your money is working hard for you.`;

    await notificationBot.api.sendMessage(userId, message, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error(`Failed to send yield notification to user ${userId}:`, error);
  }
}

/**
 * Send low balance warning
 */
export async function notifyLowGasBalance(
  userId: string,
  firstName: string,
  ethBalance: string
): Promise<void> {
  if (!notificationBot) return;

  try {
    const keyboard = new InlineKeyboard()
      .text("💰 Deposit ETH", "deposit")
      .row()
      .text("📊 Check Balance", "check_balance");

    const message = `⛽ Hey ${firstName}, you're running low on gas!\n\n` +
      `ETH Balance: ${ethBalance}\n\n` +
      `Add some ETH to continue earning rewards.`;

    await notificationBot.api.sendMessage(userId, message, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error(`Failed to send gas warning to user ${userId}:`, error);
  }
}

/**
 * Send harvest opportunity notification
 */
export async function notifyHarvestOpportunity(
  userId: string,
  firstName: string,
  pendingYield: number,
  protocol: string
): Promise<void> {
  if (!notificationBot) return;

  try {
    const keyboard = new InlineKeyboard()
      .text("💰 Collect Now", "harvest_yields")
      .row()
      .text("📊 View Portfolio", "view_portfolio");

    const message = `💰 ${firstName}, time to collect earnings!\n\n` +
      `💰 Pending yield: $${pendingYield.toFixed(2)}\n` +
      `📈 Protocol: ${protocol}\n\n` +
      `Collect now to compound your earnings.`;

    await notificationBot.api.sendMessage(userId, message, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error(`Failed to send harvest notification to user ${userId}:`, error);
  }
}

/**
 * Send emergency alert notification
 */
export async function notifyEmergencyAlert(
  userId: string,
  firstName: string,
  protocol: string,
  riskLevel: "LOW" | "MEDIUM" | "HIGH",
  description: string
): Promise<void> {
  if (!notificationBot) return;

  try {
    const riskEmoji = {
      LOW: "⚠️",
      MEDIUM: "🚨", 
      HIGH: "🔴"
    };

    const keyboard = new InlineKeyboard()
      .text("📊 View Portfolio", "view_portfolio")
      .row()
      .text("📤 Emergency Withdraw", "withdraw");

    const message = `${riskEmoji[riskLevel]} ${firstName}, security alert!\n\n` +
      `Protocol: ${protocol}\n` +
      `Risk: ${riskLevel}\n\n` +
      `${description}\n\n` +
      `Review your positions immediately.`;

    await notificationBot.api.sendMessage(userId, message, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error(`Failed to send emergency alert to user ${userId}:`, error);
  }
}

/**
 * Helper to get user's first name from database
 */
export function getUserFirstName(telegramId: string): string {
  try {
    const { getUserByTelegramId } = require("./database");
    const user = getUserByTelegramId(telegramId);
    return user?.firstName || "there";
  } catch (error) {
    console.error("Failed to get user first name:", error);
    return "there";
  }
}