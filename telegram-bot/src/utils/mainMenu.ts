import { InlineKeyboard } from "grammy";

/**
 * Create standardized main menu keyboard
 * This should be used across all commands to maintain consistency
 */
export function createMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("💰 Check Balance", "check_balance")
    .text("🚀 Start Earning", "zap_funds")
    .row()
    .text("📊 Portfolio", "view_portfolio")
    .text("🌾 Harvest", "harvest_yields")
    .row()
    .text("⚙️ Settings", "open_settings")
    .text("📋 Help", "help");
}

/**
 * Main menu message text
 */
export function getMainMenuMessage(firstName: string = "there"): string {
  return `🌱 *Welcome back ${firstName}! Ready to earn 7% APY effortlessly?*\n\n` +
    `✅ AI picks best yields daily\n` +
    `✅ No lock-ups, withdraw anytime\n` +
    `✅ Vetted protocols only\n` +
    `✅ Auto-compound while you sleep\n\n` +
    `What would you like to do?`;
}