"use strict";
/**
 * Simple, clean interface for consistent APY across the entire bot
 * This is the ONLY file that other parts of the system should import for APY data
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConsistentAPY = getConsistentAPY;
exports.getImmediateAPY = getImmediateAPY;
exports.getFreshAPY = getFreshAPY;
exports.getDetailedAPY = getDetailedAPY;
exports.getHighestAPY = getHighestAPY;
exports.getCompoundV3APY = getCompoundV3APY;
const apy_orchestrator_1 = require("../services/apy-orchestrator");
/**
 * Get consistent APY for user context with risk preference consideration
 * This ensures the same APY is shown throughout a user's journey
 *
 * @param userId - Optional user ID for session consistency and risk settings
 * @param context - User journey context for consistency
 * @returns Promise<number> - APY percentage (e.g., 7.5 for 7.5%)
 */
async function getConsistentAPY(userId, context) {
    try {
        const response = await apy_orchestrator_1.apyOrchestrator.getAPY({
            userId,
            journeyState: context,
            timeout: 3000 // Standard timeout - no blocking
        });
        // Get user risk-adjusted APY
        return await getRiskAdjustedAPY(response.value, userId);
    }
    catch (error) {
        console.error('❌ getConsistentAPY failed:', error);
        // Return risk-adjusted fallback
        return await getRiskAdjustedAPY(7.5, userId);
    }
}
/**
 * Get immediate APY (fast response) for real-time UI updates
 * Uses cached data if available, shows loading indicator if needed
 */
async function getImmediateAPY(userId) {
    try {
        const response = await apy_orchestrator_1.apyOrchestrator.getAPY({
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
    }
    catch (error) {
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
async function getRiskAdjustedAPY(baseAPY, userId) {
    if (!userId)
        return baseAPY;
    try {
        const { getUserSettings } = await Promise.resolve().then(() => __importStar(require('../lib/database')));
        const settings = getUserSettings(userId);
        if (!settings)
            return baseAPY;
        // Match the auto-investing risk logic
        const riskLevel = settings.riskLevel || 3; // Default moderate risk
        // Risk-adjusted APY selection (matching auto-invest behavior)
        if (riskLevel <= 2) {
            // Conservative: Show Aave/Compound range (5-7%)
            return Math.min(baseAPY, 7.0);
        }
        else if (riskLevel >= 4) {
            // Aggressive: Show highest available APY
            return baseAPY;
        }
        else {
            // Moderate: Show good but not extreme APY (cap at ~9%)
            return Math.min(baseAPY, 9.0);
        }
    }
    catch (error) {
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
async function getFreshAPY(userId) {
    try {
        const response = await apy_orchestrator_1.apyOrchestrator.getAPY({
            userId,
            requireFresh: true,
            timeout: 5000 // Longer timeout for fresh data
        });
        return response.value;
    }
    catch (error) {
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
async function getDetailedAPY(userId, context) {
    return await apy_orchestrator_1.apyOrchestrator.getAPY({
        userId,
        journeyState: context,
        timeout: 3000
    });
}
/**
 * Legacy compatibility - replaces getHighestAPY() calls
 * @deprecated Use getConsistentAPY() instead
 */
async function getHighestAPY() {
    console.warn('⚠️ getHighestAPY() is deprecated. Use getConsistentAPY() instead.');
    return await getConsistentAPY();
}
/**
 * Legacy compatibility - replaces getCompoundV3APY() calls
 * @deprecated Use getConsistentAPY() instead
 */
async function getCompoundV3APY() {
    console.warn('⚠️ getCompoundV3APY() is deprecated. Use getConsistentAPY() instead.');
    return await getConsistentAPY();
}
