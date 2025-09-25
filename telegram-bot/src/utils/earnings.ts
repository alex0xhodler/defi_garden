/**
 * Calculates and formats a user-friendly string representing the estimated earnings
 * over a meaningful time period (week, month, or year).
 * @param {number} usdcAmount - The principal amount in USDC.
 * @param {number} apy - The Annual Percentage Yield (e.g., 7.5 for 7.5%).
 * @returns {string} A formatted string describing the earnings (e.g., "$1.44 per week").
 */
export function calculateRealTimeEarnings(usdcAmount: number, apy: number) {
  // Calculate earnings per different time periods
  const yearlyEarnings = usdcAmount * (apy / 100);
  const monthlyEarnings = yearlyEarnings / 12;
  const weeklyEarnings = yearlyEarnings / 52;
  const dailyEarnings = yearlyEarnings / 365;
  
  // Format earnings to appropriate precision
  const formatEarnings = (amount: number): string => {
    if (amount >= 1) {
      return `$${amount.toFixed(2)}`;
    } else if (amount >= 0.01) {
      return `$${amount.toFixed(3)}`;
    } else {
      return `$${amount.toFixed(4)}`;
    }
  };

  // Choose the most meaningful timeframe based on amount
  if (weeklyEarnings >= 0.01) {
    return `${formatEarnings(weeklyEarnings)} per week`;
  } else if (monthlyEarnings >= 0.01) {
    return `${formatEarnings(monthlyEarnings)} per month`;
  } else {
    return `${formatEarnings(yearlyEarnings)} per year`;
  }
}

/**
 * Calculates a detailed breakdown of earnings, including daily, weekly, monthly,
 * and yearly projections, as well as time-to-double estimates and comparisons to traditional savings.
 * @param {number} usdcAmount - The principal amount in USDC.
 * @param {number} apy - The Annual Percentage Yield.
 * @returns {object} An object containing various formatted earnings metrics.
 */
export function calculateDetailedEarnings(usdcAmount: number, apy: number) {
  const yearlyEarnings = usdcAmount * (apy / 100);
  const monthlyEarnings = yearlyEarnings / 12;
  const weeklyEarnings = yearlyEarnings / 52;
  const dailyEarnings = yearlyEarnings / 365;
  
  // Format earnings to appropriate precision
  const formatEarnings = (amount: number): string => {
    if (amount >= 1) {
      return `$${amount.toFixed(2)}`;
    } else if (amount >= 0.01) {
      return `$${amount.toFixed(3)}`;
    } else {
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
 * Formats a transaction hash into a markdown link to its page on Basescan.
 * @param {string} txHash - The transaction hash.
 * @returns {string} A markdown-formatted link to the transaction on Basescan.
 */
export function formatTxLink(txHash: string): string {
  return `[${txHash.slice(0, 10)}...](https://basescan.org/tx/${txHash})`;
}