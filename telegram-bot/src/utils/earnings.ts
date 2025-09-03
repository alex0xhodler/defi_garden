/**
 * Calculate real-time earnings based on deposit amount and APY
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
 * Format transaction hash with Basescan link (no preview)
 */
export function formatTxLink(txHash: string): string {
  return `[${txHash.slice(0, 10)}...](https://basescan.org/tx/${txHash})`;
}