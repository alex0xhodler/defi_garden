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
 * Clamps a number between a minimum and maximum value.
 * @param {number} n - The number to clamp.
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} The clamped number.
 */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Determines the risk band ('low', 'medium', 'high') from a numerical risk score.
 * Boundaries: [0-6) = low, [6-8) = medium, [8-10] = high.
 * @param {number} score - The numerical risk score (0-10).
 * @returns {RiskBand} The corresponding risk band.
 */
export function riskBand(score: number): RiskBand {
  const s = clamp(score, 0, 10);
  if (s >= 8) return 'high';
  if (s >= 6) return 'medium';
  return 'low';
}

/**
 * Gets the emoji icon corresponding to a numerical risk score.
 * @param {number} score - The numerical risk score.
 * @returns {string} The emoji icon for the risk level.
 */
export function riskIcon(score: number): string {
  return RISK_ICON[riskBand(score)];
}

/**
 * Gets the capitalized text label ('Low', 'Medium', 'High') for a numerical risk score.
 * @param {number} score - The numerical risk score.
 * @returns {string} The capitalized risk label.
 */
export function riskLabel(score: number): string {
  const band = riskBand(score);
  return band.charAt(0).toUpperCase() + band.slice(1);
}

/**
 * Gets a combined string with both the risk icon and label for display.
 * @param {number} score - The numerical risk score.
 * @returns {string} A formatted string with the icon and label (e.g., "🛡️ Low").
 */
export function riskDisplay(score: number): string {
  const icon = riskIcon(score);
  const label = riskLabel(score);
  return `${icon} ${label}`;
}