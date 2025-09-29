"use strict";
/**
 * Central APY Orchestrator - The Brain of the APY Management System
 * Coordinates all APY operations with enterprise-grade reliability
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apyOrchestrator = void 0;
exports.getContextualAPY = getContextualAPY;
const circuit_breaker_1 = require("../utils/circuit-breaker");
const apy_cache_1 = require("./apy-cache");
const apy_sources_1 = require("./apy-sources");
class APYOrchestrator {
    constructor() {
        this.startTime = Date.now();
        this.totalRequests = 0;
        this.successfulRequests = 0;
        this.totalResponseTime = 0;
        this.backgroundRefreshInterval = null;
        this.circuitBreaker = new circuit_breaker_1.CircuitBreaker(circuit_breaker_1.CIRCUIT_BREAKER_CONFIGS.EXTERNAL_API, 'APY-Orchestrator');
        this.initialize();
    }
    async initialize() {
        console.log('🎯 APY Orchestrator initializing...');
        // Start cache cleanup
        apy_cache_1.apyCache.startCleanupInterval();
        // Start background refresh
        this.startBackgroundRefresh();
        // Pre-warm cache with initial data
        await this.preWarmCache();
        console.log('✅ APY Orchestrator initialized successfully');
    }
    /**
     * Main entry point - Get APY with full orchestration
     */
    async getAPY(request = {}) {
        const startTime = Date.now();
        this.totalRequests++;
        try {
            // Apply timeout if specified
            const timeout = request.timeout || 5000;
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('APY request timeout')), timeout);
            });
            const apyPromise = this.executeAPYRequest(request);
            const result = await Promise.race([apyPromise, timeoutPromise]);
            this.successfulRequests++;
            const responseTime = Date.now() - startTime;
            this.totalResponseTime += responseTime;
            return {
                ...result,
                responseTime,
                metadata: {
                    ...result.metadata,
                    userId: request.userId,
                    journeyState: request.journeyState
                }
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            console.error(`❌ APY orchestrator failed (${responseTime}ms):`, error);
            // Return emergency fallback
            return this.getEmergencyFallback(request, responseTime);
        }
    }
    /**
     * Core APY request execution with intelligent routing
     */
    async executeAPYRequest(request) {
        // Check if fresh data is required
        if (request.requireFresh) {
            console.log(`🔄 Fresh APY requested for user ${request.userId}`);
            return await this.getFreshAPY(request);
        }
        // Try cache first (with user context if provided)
        const cachedData = await apy_cache_1.apyCache.getAPY(request.userId, request.journeyState);
        if (cachedData.confidence > 0.7) { // High confidence threshold
            console.log(`⚡ High-confidence cache hit (${cachedData.confidence.toFixed(2)}) for user ${request.userId}`);
            return {
                value: cachedData.value,
                source: cachedData.source,
                confidence: cachedData.confidence,
                responseTime: 0,
                timestamp: cachedData.timestamp,
                cached: true,
                metadata: {
                    cacheLayer: cachedData.source,
                    healthScore: cachedData.confidence
                }
            };
        }
        // Cache has low confidence, try to get fresh data
        return await this.getFreshAPY(request);
    }
    /**
     * Get fresh APY data with circuit breaker protection
     */
    async getFreshAPY(request) {
        const operation = async () => {
            return await apy_sources_1.apySourceManager.getAPY();
        };
        const fallback = async () => {
            console.log('🔄 Circuit breaker triggered - using cached fallback');
            const cachedData = await apy_cache_1.apyCache.getAPY(request.userId, request.journeyState);
            // For initial context, if we have no good cached data, try to wait for fresh data
            if (request.journeyState === 'initial' && cachedData.source === 'fallback') {
                console.log('⏳ Initial context needs fresh data - trying one more time...');
                // Give the background refresh a moment to complete
                await new Promise(resolve => setTimeout(resolve, 1000));
                const retryCache = await apy_cache_1.apyCache.getAPY(request.userId, request.journeyState);
                if (retryCache.source !== 'fallback') {
                    return {
                        value: retryCache.value,
                        source: `retry_${retryCache.source}`,
                        confidence: retryCache.confidence,
                        responseTime: 1000,
                        timestamp: retryCache.timestamp
                    };
                }
            }
            return {
                value: cachedData.value,
                source: `fallback_${cachedData.source}`,
                confidence: cachedData.confidence * 0.8, // Reduce confidence for fallback
                responseTime: 0,
                timestamp: cachedData.timestamp
            };
        };
        const result = await this.circuitBreaker.execute(operation, fallback);
        // Update cache with fresh data
        if (result.confidence > 0.8) {
            apy_cache_1.apyCache.setFreshAPY(result.value, 'api');
        }
        return {
            value: result.value,
            source: result.source,
            confidence: result.confidence,
            responseTime: result.responseTime,
            timestamp: result.timestamp,
            cached: false,
            metadata: {
                healthScore: this.circuitBreaker.getHealthScore()
            }
        };
    }
    /**
     * Emergency fallback when everything fails
     */
    getEmergencyFallback(request, responseTime) {
        const emergencyAPY = 7.5; // Safe conservative value
        console.log(`🆘 Emergency fallback activated - returning ${emergencyAPY}% APY`);
        return {
            value: emergencyAPY,
            source: 'emergency_fallback',
            confidence: 0.3, // Low confidence in emergency mode
            responseTime,
            timestamp: Date.now(),
            cached: false,
            metadata: {
                userId: request.userId,
                journeyState: request.journeyState,
                cacheLayer: 'emergency',
                healthScore: 0.0
            }
        };
    }
    /**
     * Background refresh to keep cache warm
     */
    startBackgroundRefresh() {
        if (this.backgroundRefreshInterval) {
            clearInterval(this.backgroundRefreshInterval);
        }
        this.backgroundRefreshInterval = setInterval(async () => {
            try {
                console.log('🔄 Background APY refresh starting...');
                const result = await apy_sources_1.apySourceManager.getAPY();
                apy_cache_1.apyCache.setFreshAPY(result.value, 'api');
                console.log(`✅ Background APY refresh completed: ${result.value}%`);
            }
            catch (error) {
                console.warn('⚠️ Background APY refresh failed:', error);
            }
        }, 300000); // Every 5 minutes
        console.log('🔄 Background refresh started (5min interval)');
    }
    /**
     * Pre-warm cache on startup
     */
    async preWarmCache() {
        try {
            console.log('🔥 Pre-warming APY cache...');
            const result = await apy_sources_1.apySourceManager.getAPY();
            apy_cache_1.apyCache.setFreshAPY(result.value, 'api');
            console.log(`🔥 Cache pre-warmed with ${result.value}% APY`);
        }
        catch (error) {
            console.warn('⚠️ Cache pre-warming failed:', error);
        }
    }
    /**
     * Health monitoring and diagnostics
     */
    getHealthStatus() {
        const uptime = Date.now() - this.startTime;
        const successRate = this.totalRequests > 0 ? this.successfulRequests / this.totalRequests : 0;
        const avgResponseTime = this.totalRequests > 0 ? this.totalResponseTime / this.totalRequests : 0;
        let overall = 'healthy';
        if (successRate < 0.95 || avgResponseTime > 2000) {
            overall = 'degraded';
        }
        if (successRate < 0.8 || avgResponseTime > 5000) {
            overall = 'critical';
        }
        return {
            overall,
            sources: apy_sources_1.apySourceManager.getSourcesHealth(),
            cache: apy_cache_1.apyCache.getCacheStats(),
            circuitBreaker: this.circuitBreaker.getMetrics(),
            uptime,
            totalRequests: this.totalRequests,
            successfulRequests: this.successfulRequests,
            averageResponseTime: Math.round(avgResponseTime)
        };
    }
    /**
     * Administrative functions
     */
    async forceRefresh() {
        console.log('🔄 Force refresh requested');
        return await this.getFreshAPY({ requireFresh: true });
    }
    clearAllCaches() {
        apy_cache_1.apyCache.clearCache('ALL');
        console.log('🧹 All caches cleared by orchestrator');
    }
    resetHealthMetrics() {
        this.totalRequests = 0;
        this.successfulRequests = 0;
        this.totalResponseTime = 0;
        this.startTime = Date.now();
        this.circuitBreaker.reset();
        apy_sources_1.apySourceManager.resetHealthScores();
        console.log('🔄 All health metrics reset');
    }
    /**
     * Shutdown gracefully
     */
    shutdown() {
        if (this.backgroundRefreshInterval) {
            clearInterval(this.backgroundRefreshInterval);
            this.backgroundRefreshInterval = null;
        }
        console.log('🔚 APY Orchestrator shutdown complete');
    }
}
// Export singleton instance
exports.apyOrchestrator = new APYOrchestrator();
// Export simple interface for easy integration
async function getContextualAPY(userId, journeyState, options) {
    const response = await exports.apyOrchestrator.getAPY({
        userId,
        journeyState,
        requireFresh: options?.requireFresh,
        timeout: options?.timeout
    });
    return response.value;
}
