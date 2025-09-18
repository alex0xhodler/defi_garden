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
   * Main entry point - Get APY with full orchestration
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
   * Core APY request execution with intelligent routing
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
   * Get fresh APY data with circuit breaker protection
   */
  private async getFreshAPY(request: APYRequest): Promise<APYResponse> {
    const operation = async (): Promise<APYSourceResult> => {
      return await apySourceManager.getAPY();
    };

    const fallback = async (): Promise<APYSourceResult> => {
      console.log('🔄 Circuit breaker triggered - using cached fallback');
      const cachedData = await apyCache.getAPY(request.userId, request.journeyState);
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
   * Emergency fallback when everything fails
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
   * Background refresh to keep cache warm
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
    }, 60000); // Every minute

    console.log('🔄 Background refresh started (60s interval)');
  }

  /**
   * Pre-warm cache on startup
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
   * Health monitoring and diagnostics
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
   * Administrative functions
   */
  async forceRefresh(): Promise<APYResponse> {
    console.log('🔄 Force refresh requested');
    return await this.getFreshAPY({ requireFresh: true });
  }

  clearAllCaches(): void {
    apyCache.clearCache('ALL');
    console.log('🧹 All caches cleared by orchestrator');
  }

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
   * Shutdown gracefully
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

// Export simple interface for easy integration
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