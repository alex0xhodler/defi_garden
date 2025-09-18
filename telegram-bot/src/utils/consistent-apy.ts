/**
 * Simple, clean interface for consistent APY across the entire bot
 * This is the ONLY file that other parts of the system should import for APY data
 */

import { apyOrchestrator } from '../services/apy-orchestrator';

/**
 * Get consistent APY for user context
 * This ensures the same APY is shown throughout a user's journey
 * 
 * @param userId - Optional user ID for session consistency
 * @param context - User journey context for consistency
 * @returns Promise<number> - APY percentage (e.g., 7.5 for 7.5%)
 */
export async function getConsistentAPY(
  userId?: string,
  context?: 'initial' | 'checking_deposits' | 'portfolio' | 'settings'
): Promise<number> {
  try {
    // For initial context, we MUST get fresh data to avoid inconsistency
    const requireFresh = context === 'initial';
    
    const response = await apyOrchestrator.getAPY({
      userId,
      journeyState: context,
      requireFresh, // Force fresh data for initial interactions
      timeout: requireFresh ? 8000 : 3000 // Longer timeout for fresh data
    });
    
    return response.value;
  } catch (error) {
    console.error('❌ getConsistentAPY failed:', error);
    // Return safe fallback
    return 7.5;
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