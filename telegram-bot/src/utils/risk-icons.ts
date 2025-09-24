/**
 * Risk icon mapping utility
 * Provides standardized risk level icons across the bot
 */

export type RiskBand = 'low' | 'medium' | 'high';

export const RISK_ICON: Record<RiskBand, string> = {
  low: '🛡️',     // Shield - safe/low risk
  medium: '🟡',   // Yellow circle - moderate risk  
  high: '🟠',     // Orange circle - high risk
};

/**
 * Clamp a number between min and max values
 */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Determine risk band from numerical score
 * Boundaries: [0-6) = low, [6-8) = medium, [8-10] = high
 */
export function riskBand(score: number): RiskBand {
  const s = clamp(score, 0, 10);
  if (s >= 8) return 'high';
  if (s >= 6) return 'medium';
  return 'low';
}

/**
 * Get risk icon emoji from numerical score
 */
export function riskIcon(score: number): string {
  return RISK_ICON[riskBand(score)];
}

/**
 * Get risk level text from numerical score
 */
export function riskLabel(score: number): string {
  const band = riskBand(score);
  return band.charAt(0).toUpperCase() + band.slice(1);
}

/**
 * Get both icon and label for display
 */
export function riskDisplay(score: number): string {
  const icon = riskIcon(score);
  const label = riskLabel(score);
  return `${icon} ${label}`;
}