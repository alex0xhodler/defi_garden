/**
 * Simple, clean interface for consistent APY across the entire bot
 * This is the ONLY file that other parts of the system should import for APY data
 */

import { apyOrchestrator } from '../services/apy-orchestrator';

/**
 * Get consistent APY for user context with risk preference consideration
 * This ensures the same APY is shown throughout a user's journey
 * 
 * @param userId - Optional user ID for session consistency and risk settings
 * @param context - User journey context for consistency
 * @returns Promise<number> - APY percentage (e.g., 7.5 for 7.5%)
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
 * Get immediate APY (fast response) for real-time UI updates
 * Uses cached data if available, shows loading indicator if needed
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
 * Adjust APY based on user risk preference to match auto-investing logic
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
 * Get fresh APY data (bypasses cache)
 * Use this when you specifically need the latest data
 * 
 * @param userId - Optional user ID
 * @returns Promise<number> - Fresh APY percentage
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
 * Get APY with detailed information (for debugging/monitoring)
 * 
 * @param userId - Optional user ID
 * @param context - User journey context
 * @returns Promise with detailed APY response
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
 * Legacy compatibility - replaces getHighestAPY() calls
 * @deprecated Use getConsistentAPY() instead
 */
export async function getHighestAPY(): Promise<number> {
  console.warn('⚠️ getHighestAPY() is deprecated. Use getConsistentAPY() instead.');
  return await getConsistentAPY();
}

/**
 * Legacy compatibility - replaces getCompoundV3APY() calls
 * @deprecated Use getConsistentAPY() instead
 */
export async function getCompoundV3APY(): Promise<number> {
  console.warn('⚠️ getCompoundV3APY() is deprecated. Use getConsistentAPY() instead.');
  return await getConsistentAPY();
}