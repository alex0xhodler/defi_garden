"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConfirmationKeyboard = createConfirmationKeyboard;
exports.createGasPriorityKeyboard = createGasPriorityKeyboard;
exports.createSlippageKeyboard = createSlippageKeyboard;
exports.createSettingsKeyboard = createSettingsKeyboard;
exports.createTokenSelectionKeyboard = createTokenSelectionKeyboard;
exports.createPaginationKeyboard = createPaginationKeyboard;
const grammy_1 = require("grammy");
/**
 * Create confirmation keyboard with Yes/No buttons
 */
function createConfirmationKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("✅ Yes", "confirm_yes")
        .text("❌ No", "confirm_no");
}
/**
 * Create gas priority selection keyboard
 */
function createGasPriorityKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("🐢 Low", "gas_low")
        .text("🚶 Medium", "gas_medium")
        .text("🚀 High", "gas_high");
}
/**
 * Create slippage selection keyboard
 */
function createSlippageKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("0.5%", "slippage_0.5")
        .text("1%", "slippage_1")
        .text("2%", "slippage_2")
        .text("3%", "slippage_3");
}
/**
 * Create settings keyboard
 */
function createSettingsKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("🔄 Slippage", "settings_slippage")
        .text("⛽ Gas Priority", "settings_gasPriority")
        .row()
        .text("🔙 Back", "settings_back");
}
/**
 * Create token selection keyboard with common tokens
 */
function createTokenSelectionKeyboard() {
    const keyboard = new grammy_1.InlineKeyboard()
        .text("USDC", "token_USDC")
        .text("DAI", "token_DAI")
        .row()
        .text("WBTC", "token_WBTC")
        .row()
        .text("Custom Token", "token_custom");
    return keyboard;
}
/**
 * Create pagination keyboard for history view
 */
function createPaginationKeyboard(currentPage, totalPages) {
    const keyboard = new grammy_1.InlineKeyboard();
    if (currentPage > 1) {
        keyboard.text("⬅️ Previous", `page_${currentPage - 1}`);
    }
    keyboard.text(`${currentPage}/${totalPages}`, "page_current");
    if (currentPage < totalPages) {
        keyboard.text("➡️ Next", `page_${currentPage + 1}`);
    }
    return keyboard;
}
