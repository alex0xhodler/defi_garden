/**
 * Simple, clean interface for consistent APY across the entire bot
 * This is the ONLY file that other parts of the system should import for APY data
 */

import { apyOrchestrator } from '../services/apy-orchestrator';

/**
 * Provides a consistent APY value for the user throughout their session.
 * It uses the APY orchestrator to fetch a cached or fresh value and then adjusts it based on the user's risk settings.
 * This is the primary function that should be used to display APY to users.
 * @param {string} [userId] - The user's ID for session consistency and risk settings.
 * @param {'initial' | 'checking_deposits' | 'portfolio' | 'settings'} [context] - The user's current context in the bot flow.
 * @returns {Promise<number>} A promise that resolves to the consistent, risk-adjusted APY percentage.
 */
export async function getConsistentAPY(
  userId?: string,
  context?: 'initial' | 'checking_deposits' | 'portfolio' | 'settings'
): Promise<number> {
  try {
    const response = await apyOrchestrator.getAPY({
      userId,
      journeyState: context,
      timeout: 3000 // Standard timeout - no blocking
    });
    
    // Get user risk-adjusted APY
    return await getRiskAdjustedAPY(response.value, userId);
  } catch (error) {
    console.error('❌ getConsistentAPY failed:', error);
    // Return risk-adjusted fallback
    return await getRiskAdjustedAPY(7.5, userId);
  }
}

/**
 * Gets an APY value with a very short timeout, suitable for immediate UI updates.
 * It returns the APY along with a flag indicating if a background refresh is needed (based on cache confidence).
 * @param {string} [userId] - The user's ID for session context.
 * @returns {Promise<{ apy: number; isLoading: boolean; confidence: number; }>} An object with the APY, a loading flag, and a confidence score.
 */
export async function getImmediateAPY(userId?: string): Promise<{
  apy: number;
  isLoading: boolean;
  confidence: number;
}> {
  try {
    const response = await apyOrchestrator.getAPY({
      userId,
      journeyState: 'initial',
      timeout: 100 // Very fast timeout for immediate response
    });
    
    const adjustedAPY = await getRiskAdjustedAPY(response.value, userId);
    
    return {
      apy: adjustedAPY,
      isLoading: response.confidence < 0.8, // Show loading if low confidence
      confidence: response.confidence
    };
  } catch (error) {
    const fallbackAPY = await getRiskAdjustedAPY(7.5, userId);
    return {
      apy: fallbackAPY,
      isLoading: true, // Always loading if we hit fallback
      confidence: 0.3
    };
  }
}

/**
 * Adjusts a base APY according to the user's saved risk preference.
 * This ensures that the APY shown to the user aligns with the investment opportunities they will be offered.
 * @private
 * @param {number} baseAPY - The base APY fetched from the orchestrator.
 * @param {string} [userId] - The user's ID to fetch risk settings for.
 * @returns {Promise<number>} The risk-adjusted APY.
 */
async function getRiskAdjustedAPY(baseAPY: number, userId?: string): Promise<number> {
  if (!userId) return baseAPY;

  try {
    const { getUserSettings } = await import('../lib/database');
    const settings = getUserSettings(userId);
    
    if (!settings) return baseAPY;
    
    // Match the auto-investing risk logic
    const riskLevel = settings.riskLevel || 3; // Default moderate risk
    
    // Risk-adjusted APY selection (matching auto-invest behavior)
    if (riskLevel <= 2) {
      // Conservative: Show Aave/Compound range (5-7%)
      return Math.min(baseAPY, 7.0);
    } else if (riskLevel >= 4) {
      // Aggressive: Show highest available APY
      return baseAPY;
    } else {
      // Moderate: Show good but not extreme APY (cap at ~9%)
      return Math.min(baseAPY, 9.0);
    }
  } catch (error) {
    console.warn('⚠️ Could not get risk settings, using base APY:', error);
    return baseAPY;
  }
}

/**
 * Forces a fetch of fresh APY data, bypassing any caches.
 * This should be used sparingly, only when the absolute latest data is required.
 * @param {string} [userId] - The user's ID.
 * @returns {Promise<number>} A promise that resolves to the fresh APY percentage.
 */
export async function getFreshAPY(userId?: string): Promise<number> {
  try {
    const response = await apyOrchestrator.getAPY({
      userId,
      requireFresh: true,
      timeout: 5000 // Longer timeout for fresh data
    });
    
    return response.value;
  } catch (error) {
    console.error('❌ getFreshAPY failed:', error);
    // Try to get cached version as fallback
    return await getConsistentAPY(userId);
  }
}

/**
 * Gets the full, detailed APY response from the orchestrator, including metadata.
 * This is primarily intended for debugging and monitoring purposes.
 * @param {string} [userId] - The user's ID.
 * @param {'initial' | 'checking_deposits' | 'portfolio' | 'settings'} [context] - The user's current context.
 * @returns {Promise<import('../services/apy-orchestrator').APYResponse>} A promise that resolves to the detailed APY response object.
 */
export async function getDetailedAPY(
  userId?: string,
  context?: 'initial' | 'checking_deposits' | 'portfolio' | 'settings'
) {
  return await apyOrchestrator.getAPY({
    userId,
    journeyState: context,
    timeout: 3000
  });
}

/**
 * A deprecated legacy function for compatibility.
 * @deprecated Use getConsistentAPY() instead.
 * @returns {Promise<number>} The consistent APY.
 */
export async function getHighestAPY(): Promise<number> {
  console.warn('⚠️ getHighestAPY() is deprecated. Use getConsistentAPY() instead.');
  return await getConsistentAPY();
}

/**
 * A deprecated legacy function for compatibility.
 * @deprecated Use getConsistentAPY() instead.
 * @returns {Promise<number>} The consistent APY.
 */
export async function getCompoundV3APY(): Promise<number> {
  console.warn('⚠️ getCompoundV3APY() is deprecated. Use getConsistentAPY() instead.');
  return await getConsistentAPY();
}