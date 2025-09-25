import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { updateUserOnboardingStatus } from "./database";

// Create bot instance for notifications (will be initialized later)
let notificationBot: Bot | null = null;

/**
 * Initializes the bot instance used for sending notifications.
 * This must be called once at startup.
 * @param {Bot} bot - The main grammY bot instance.
 */
export function initializeNotificationBot(bot: Bot): void {
  notificationBot = bot;
}

/**
 * Sends a notification to a user confirming their deposit has been received.
 * It also marks the user's onboarding as complete.
 * @param {string} userId - The user's Telegram ID.
 * @param {string} firstName - The user's first name.
 * @param {string} amount - The amount of the deposit.
 * @param {string} tokenSymbol - The symbol of the deposited token (e.g., "USDC").
 * @returns {Promise<void>}
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
 * Sends a regular update to the user about their earnings.
 * @param {string} userId - The user's Telegram ID.
 * @param {string} firstName - The user's first name.
 * @param {number} totalYield - The total yield earned so far.
 * @param {number} dailyYield - The yield earned in the last 24 hours.
 * @returns {Promise<void>}
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
 * Sends a warning to the user if their ETH balance is low, which might prevent them from paying for gas.
 * @param {string} userId - The user's Telegram ID.
 * @param {string} firstName - The user's first name.
 * @param {string} ethBalance - The user's current (low) ETH balance.
 * @returns {Promise<void>}
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
 * Notifies the user when there is a significant amount of yield ready to be harvested.
 * @param {string} userId - The user's Telegram ID.
 * @param {string} firstName - The user's first name.
 * @param {number} pendingYield - The amount of pending yield.
 * @param {string} protocol - The protocol where the yield is available.
 * @returns {Promise<void>}
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
 * Sends an emergency security alert to the user regarding a protocol they are invested in.
 * @param {string} userId - The user's Telegram ID.
 * @param {string} firstName - The user's first name.
 * @param {string} protocol - The protocol affected by the alert.
 * @param {"LOW" | "MEDIUM" | "HIGH"} riskLevel - The severity of the risk.
 * @param {string} description - A description of the security issue.
 * @returns {Promise<void>}
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
 * A helper function to retrieve a user's first name from the database using their Telegram ID.
 * @param {string} telegramId - The user's Telegram ID.
 * @returns {string} The user's first name, or "there" as a fallback.
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