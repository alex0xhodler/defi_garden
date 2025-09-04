"use strict";
/**
 * Calculate real-time earnings based on deposit amount and APY
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRealTimeEarnings = calculateRealTimeEarnings;
exports.calculateDetailedEarnings = calculateDetailedEarnings;
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
 * Calculate detailed earnings breakdown for enhanced display
 */
function calculateDetailedEarnings(usdcAmount, apy) {
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
    // Rule of 72 for doubling time
    const yearsToDouble = (72 / apy).toFixed(1);
    // Comparison to average US savings account (0.2% APY)
    const savingsMultiple = Math.round(apy / 0.2);
    // Add context for very small daily amounts
    const dailyContext = dailyEarnings < 0.01 ?
        ` (~1 cent every ${Math.ceil(0.01 / dailyEarnings)} days)` : '';
    return {
        daily: formatEarnings(dailyEarnings),
        dailyWithContext: `${formatEarnings(dailyEarnings)}${dailyContext}`,
        weekly: formatEarnings(weeklyEarnings),
        monthly: formatEarnings(monthlyEarnings),
        yearly: formatEarnings(yearlyEarnings),
        timeToDouble: `${yearsToDouble} years`,
        comparisonMultiple: `${savingsMultiple}x`,
        savingsApy: "0.2%" // US average for context
    };
}
/**
 * Format transaction hash with Basescan link (no preview)
 */
function formatTxLink(txHash) {
    return `[${txHash.slice(0, 10)}...](https://basescan.org/tx/${txHash})`;
}
