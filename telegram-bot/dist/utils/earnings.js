"use strict";
/**
 * Calculate real-time earnings based on deposit amount and APY
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRealTimeEarnings = calculateRealTimeEarnings;
exports.formatTxLink = formatTxLink;
function calculateRealTimeEarnings(usdcAmount, apy) {
    // Calculate earnings per different time periods
    const yearlyEarnings = usdcAmount * (apy / 100);
    const monthlyEarnings = yearlyEarnings / 12;
    const weeklyEarnings = yearlyEarnings / 52;
    const dailyEarnings = yearlyEarnings / 365;
    // Format earnings to appropriate precision
    const formatEarnings = (amount) => {
        if (amount >= 1) {
            return `$${amount.toFixed(2)}`;
        }
        else if (amount >= 0.01) {
            return `$${amount.toFixed(3)}`;
        }
        else {
            return `$${amount.toFixed(4)}`;
        }
    };
    // Choose the most meaningful timeframe based on amount
    if (weeklyEarnings >= 0.01) {
        return `${formatEarnings(weeklyEarnings)} per week`;
    }
    else if (monthlyEarnings >= 0.01) {
        return `${formatEarnings(monthlyEarnings)} per month`;
    }
    else {
        return `${formatEarnings(yearlyEarnings)} per year`;
    }
}
/**
 * Format transaction hash with Basescan link (no preview)
 */
function formatTxLink(txHash) {
    return `[${txHash.slice(0, 10)}...](https://basescan.org/tx/${txHash})`;
}
