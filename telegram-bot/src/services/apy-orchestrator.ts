/**
 * Central APY Orchestrator - The Brain of the APY Management System
 * Coordinates all APY operations with enterprise-grade reliability
 */

import { CircuitBreaker, CIRCUIT_BREAKER_CONFIGS } from '../utils/circuit-breaker';
import { apyCache, type APYData } from './apy-cache';
import { apySourceManager, type APYSourceResult } from './apy-sources';

export interface APYRequest {
  userId?: string;
  journeyState?: 'initial' | 'checking_deposits' | 'portfolio' | 'settings';
  requireFresh?: boolean; // Force fresh data fetch
  timeout?: number; // Request timeout in ms
}

export interface APYResponse {
  value: number;
  source: string;
  confidence: number;
  responseTime: number;
  timestamp: number;
  cached: boolean;
  metadata: {
    userId?: string;
    journeyState?: string;
    cacheLayer?: string;
    healthScore?: number;
  };
}

export interface APYHealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  sources: Record<string, any>;
  cache: any;
  circuitBreaker: any;
  uptime: number;
  totalRequests: number;
  successfulRequests: number;
  averageResponseTime: number;
}

/**
 * Manages the entire lifecycle of APY data, from fetching to caching and serving.
 * It acts as a central controller, ensuring data reliability and performance
 * through features like circuit breaking, background refreshing, and intelligent caching.
 */
class APYOrchestrator {
  private circuitBreaker: CircuitBreaker;
  private startTime: number = Date.now();
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private totalResponseTime: number = 0;
  private backgroundRefreshInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.circuitBreaker = new CircuitBreaker(
      CIRCUIT_BREAKER_CONFIGS.EXTERNAL_API,
      'APY-Orchestrator'
    );
    
    this.initialize();
  }

  /**
   * Initializes the orchestrator by starting background processes and pre-warming the cache.
   * @private
   */
  private async initialize(): Promise<void> {
    console.log('🎯 APY Orchestrator initializing...');

    // Start cache cleanup
    apyCache.startCleanupInterval();
    
    // Start background refresh
    this.startBackgroundRefresh();
    
    // Pre-warm cache with initial data
    await this.preWarmCache();
    
    console.log('✅ APY Orchestrator initialized successfully');
  }

  /**
   * The main entry point for requesting APY data.
   * It handles request timeouts and routes the request through the orchestration logic.
   * @param {APYRequest} [request={}] - The request object, containing optional user context and flags.
   * @returns {Promise<APYResponse>} A promise that resolves to a detailed APY response object.
   */
  async getAPY(request: APYRequest = {}): Promise<APYResponse> {
    const startTime = Date.now();
    this.totalRequests++;

    try {
      // Apply timeout if specified
      const timeout = request.timeout || 5000;
      const timeoutPromise = new Promise<never>((_, reject) => {
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

    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`❌ APY orchestrator failed (${responseTime}ms):`, error);
      
      // Return emergency fallback
      return this.getEmergencyFallback(request, responseTime);
    }
  }

  /**
   * The core logic for handling an APY request.
   * It decides whether to serve from cache or fetch fresh data based on the request and cache state.
   * @private
   * @param {APYRequest} request - The APY request object.
   * @returns {Promise<APYResponse>} A promise that resolves to the APY response.
   */
  private async executeAPYRequest(request: APYRequest): Promise<APYResponse> {
    // Check if fresh data is required
    if (request.requireFresh) {
      console.log(`🔄 Fresh APY requested for user ${request.userId}`);
      return await this.getFreshAPY(request);
    }

    // Try cache first (with user context if provided)
    const cachedData = await apyCache.getAPY(request.userId, request.journeyState);
    
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
   * Fetches fresh APY data from the source manager, wrapped in a circuit breaker for resilience.
   * It uses the cache as a fallback if the circuit is open.
   * @private
   * @param {APYRequest} request - The APY request object.
   * @returns {Promise<APYResponse>} A promise that resolves to the APY response based on fresh data or a fallback.
   */
  private async getFreshAPY(request: APYRequest): Promise<APYResponse> {
    const operation = async (): Promise<APYSourceResult> => {
      return await apySourceManager.getAPY();
    };

    const fallback = async (): Promise<APYSourceResult> => {
      console.log('🔄 Circuit breaker triggered - using cached fallback');
      const cachedData = await apyCache.getAPY(request.userId, request.journeyState);
      
      // For initial context, if we have no good cached data, try to wait for fresh data
      if (request.journeyState === 'initial' && cachedData.source === 'fallback') {
        console.log('⏳ Initial context needs fresh data - trying one more time...');
        // Give the background refresh a moment to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryCache = await apyCache.getAPY(request.userId, request.journeyState);
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
      apyCache.setFreshAPY(result.value, 'api');
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
   * Provides a final, hardcoded fallback APY value when all other data sources and caches are unavailable.
   * @private
   * @param {APYRequest} request - The original APY request object.
   * @param {number} responseTime - The total time taken before falling back.
   * @returns {APYResponse} An APY response object with low confidence.
   */
  private getEmergencyFallback(request: APYRequest, responseTime: number): APYResponse {
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
   * Starts a background interval to periodically refresh the APY data,
   * ensuring the cache stays warm and up-to-date.
   * @private
   */
  private startBackgroundRefresh(): void {
    if (this.backgroundRefreshInterval) {
      clearInterval(this.backgroundRefreshInterval);
    }

    this.backgroundRefreshInterval = setInterval(async () => {
      try {
        console.log('🔄 Background APY refresh starting...');
        const result = await apySourceManager.getAPY();
        apyCache.setFreshAPY(result.value, 'api');
        console.log(`✅ Background APY refresh completed: ${result.value}%`);
      } catch (error) {
        console.warn('⚠️ Background APY refresh failed:', error);
      }
    }, 300000); // Every 5 minutes

    console.log('🔄 Background refresh started (5min interval)');
  }

  /**
   * Performs an initial fetch of APY data on startup to populate the cache.
   * @private
   */
  private async preWarmCache(): Promise<void> {
    try {
      console.log('🔥 Pre-warming APY cache...');
      const result = await apySourceManager.getAPY();
      apyCache.setFreshAPY(result.value, 'api');
      console.log(`🔥 Cache pre-warmed with ${result.value}% APY`);
    } catch (error) {
      console.warn('⚠️ Cache pre-warming failed:', error);
    }
  }

  /**
   * Provides a comprehensive health status of the entire APY system.
   * This includes metrics on uptime, success rate, response times, and the status of underlying components like the cache and circuit breaker.
   * @returns {APYHealthStatus} An object containing detailed health metrics.
   */
  getHealthStatus(): APYHealthStatus {
    const uptime = Date.now() - this.startTime;
    const successRate = this.totalRequests > 0 ? this.successfulRequests / this.totalRequests : 0;
    const avgResponseTime = this.totalRequests > 0 ? this.totalResponseTime / this.totalRequests : 0;

    let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (successRate < 0.95 || avgResponseTime > 2000) {
      overall = 'degraded';
    }
    if (successRate < 0.8 || avgResponseTime > 5000) {
      overall = 'critical';
    }

    return {
      overall,
      sources: apySourceManager.getSourcesHealth(),
      cache: apyCache.getCacheStats(),
      circuitBreaker: this.circuitBreaker.getMetrics(),
      uptime,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      averageResponseTime: Math.round(avgResponseTime)
    };
  }

  /**
   * An administrative function to force an immediate refresh of the APY data, bypassing all caches.
   * @returns {Promise<APYResponse>} A promise that resolves to the freshly fetched APY response.
   */
  async forceRefresh(): Promise<APYResponse> {
    console.log('🔄 Force refresh requested');
    return await this.getFreshAPY({ requireFresh: true });
  }

  /**
   * An administrative function to clear all cache layers.
   */
  clearAllCaches(): void {
    apyCache.clearCache('ALL');
    console.log('🧹 All caches cleared by orchestrator');
  }

  /**
   * An administrative function to reset all health and performance metrics.
   */
  resetHealthMetrics(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.totalResponseTime = 0;
    this.startTime = Date.now();
    this.circuitBreaker.reset();
    apySourceManager.resetHealthScores();
    console.log('🔄 All health metrics reset');
  }

  /**
   * Gracefully shuts down the orchestrator by clearing any running intervals.
   */
  shutdown(): void {
    if (this.backgroundRefreshInterval) {
      clearInterval(this.backgroundRefreshInterval);
      this.backgroundRefreshInterval = null;
    }
    console.log('🔚 APY Orchestrator shutdown complete');
  }
}

// Export singleton instance
export const apyOrchestrator = new APYOrchestrator();

/**
 * A simplified, exported function for easy integration into other parts of the application.
 * It provides a straightforward way to get a contextual APY value without needing to interact with the full orchestrator object.
 * @param {string} [userId] - The user's ID for session context.
 * @param {'initial' | 'checking_deposits' | 'portfolio' | 'settings'} [journeyState] - The user's current journey state.
 * @param {object} [options] - Optional parameters.
 * @param {boolean} [options.requireFresh] - Whether to force a fresh data fetch.
 * @param {number} [options.timeout] - Request timeout in milliseconds.
 * @returns {Promise<number>} A promise that resolves to the final APY value.
 */
export async function getContextualAPY(
  userId?: string,
  journeyState?: 'initial' | 'checking_deposits' | 'portfolio' | 'settings',
  options?: { requireFresh?: boolean; timeout?: number }
): Promise<number> {
  const response = await apyOrchestrator.getAPY({
    userId,
    journeyState,
    requireFresh: options?.requireFresh,
    timeout: options?.timeout
  });
  
  return response.value;
}