"use strict";
/**
 * Risk icon mapping utility
 * Provides standardized risk level icons across the bot
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RISK_ICON = void 0;
exports.clamp = clamp;
exports.riskBand = riskBand;
exports.riskIcon = riskIcon;
exports.riskLabel = riskLabel;
exports.riskDisplay = riskDisplay;
exports.RISK_ICON = {
    low: '🛡️', // Shield - safe/low risk
    medium: '🟡', // Yellow circle - moderate risk  
    high: '🟠', // Orange circle - high risk
};
/**
 * Clamp a number between min and max values
 */
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
/**
 * Determine risk band from numerical score
 * Boundaries: [0-6) = low, [6-8) = medium, [8-10] = high
 */
function riskBand(score) {
    const s = clamp(score, 0, 10);
    if (s >= 8)
        return 'high';
    if (s >= 6)
        return 'medium';
    return 'low';
}
/**
 * Get risk icon emoji from numerical score
 */
function riskIcon(score) {
    return exports.RISK_ICON[riskBand(score)];
}
/**
 * Get risk level text from numerical score
 */
function riskLabel(score) {
    const band = riskBand(score);
    return band.charAt(0).toUpperCase() + band.slice(1);
}
/**
 * Get both icon and label for display
 */
function riskDisplay(score) {
    const icon = riskIcon(score);
    const label = riskLabel(score);
    return `${icon} ${label}`;
}
