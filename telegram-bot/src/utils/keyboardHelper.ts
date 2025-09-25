import { InlineKeyboard } from "grammy";

/**
 * Creates a standard confirmation keyboard with "Yes" and "No" buttons.
 * @returns {InlineKeyboard} A grammY InlineKeyboard object.
 */
export function createConfirmationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Yes", "confirm_yes")
    .text("❌ No", "confirm_no");
}

/**
 * Creates a keyboard for selecting gas priority (Low, Medium, High).
 * @returns {InlineKeyboard} A grammY InlineKeyboard object.
 */
export function createGasPriorityKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🐢 Low", "gas_low")
    .text("🚶 Medium", "gas_medium")
    .text("🚀 High", "gas_high");
}

/**
 * Creates a keyboard for selecting slippage tolerance.
 * @returns {InlineKeyboard} A grammY InlineKeyboard object.
 */
export function createSlippageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("0.5%", "slippage_0.5")
    .text("1%", "slippage_1")
    .text("2%", "slippage_2")
    .text("3%", "slippage_3");
}

/**
 * Creates a keyboard for the main settings menu.
 * @returns {InlineKeyboard} A grammY InlineKeyboard object.
 */
export function createSettingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Slippage", "settings_slippage")
    .text("⛽ Gas Priority", "settings_gasPriority")
    .row()
    .text("🔙 Back", "settings_back");
}

/**
 * Creates a keyboard for selecting a token, including common options and a "Custom" option.
 * @returns {InlineKeyboard} A grammY InlineKeyboard object.
 */
export function createTokenSelectionKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("USDC", "token_USDC")
    .text("DAI", "token_DAI")
    .row()
    .text("WBTC", "token_WBTC")
    .row()
    .text("Custom Token", "token_custom");

  return keyboard;
}

/**
 * Creates a pagination keyboard with "Previous" and "Next" buttons for navigating through pages.
 * @param {number} currentPage - The current page number.
 * @param {number} totalPages - The total number of pages.
 * @returns {InlineKeyboard} A grammY InlineKeyboard object with pagination controls.
 */
export function createPaginationKeyboard(
  currentPage: number,
  totalPages: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (currentPage > 1) {
    keyboard.text("⬅️ Previous", `page_${currentPage - 1}`);
  }

  keyboard.text(`${currentPage}/${totalPages}`, "page_current");

  if (currentPage < totalPages) {
    keyboard.text("➡️ Next", `page_${currentPage + 1}`);
  }

  return keyboard;
}
