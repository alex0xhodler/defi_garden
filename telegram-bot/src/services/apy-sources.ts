/**
 * Smart data sources for APY with resilient fallback chains
 * Manages multiple data sources with health monitoring and intelligent routing
 */

export interface APYSource {
  name: string;
  priority: number;
  healthScore: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  totalCalls: number;
  successfulCalls: number;
}

export interface APYSourceResult {
  value: number;
  source: string;
  confidence: number;
  responseTime: number;
  timestamp: number;
}

class APYSourceManager {
  private sources: Map<string, APYSource> = new Map();

  constructor() {
    this.initializeSources();
  }

  private initializeSources(): void {
    // Primary source: DeFiLlama highest APY
    this.sources.set('defillama_highest', {
      name: 'DeFiLlama Highest APY',
      priority: 1,
      healthScore: 1.0,
      lastSuccess: null,
      lastFailure: null,
      totalCalls: 0,
      successfulCalls: 0
    });

    // Secondary source: Database cached
    this.sources.set('database_cached', {
      name: 'Database Cached APY',
      priority: 2,
      healthScore: 1.0,
      lastSuccess: null,
      lastFailure: null,
      totalCalls: 0,
      successfulCalls: 0
    });

    // Tertiary source: Calculated average
    this.sources.set('calculated_average', {
      name: 'Calculated Protocol Average',
      priority: 3,
      healthScore: 1.0,
      lastSuccess: null,
      lastFailure: null,
      totalCalls: 0,
      successfulCalls: 0
    });

    // Emergency source: Static values
    this.sources.set('static_fallback', {
      name: 'Static Fallback Values',
      priority: 4,
      healthScore: 1.0,
      lastSuccess: null,
      lastFailure: null,
      totalCalls: 0,
      successfulCalls: 0
    });
  }

  /**
   * Get APY from best available source with intelligent fallback
   */
  async getAPY(): Promise<APYSourceResult> {
    const sortedSources = Array.from(this.sources.entries())
      .sort(([,a], [,b]) => {
        // Primary sort by priority, secondary by health score
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.healthScore - a.healthScore;
      });

    for (const [sourceName, sourceInfo] of sortedSources) {
      try {
        const startTime = Date.now();
        const result = await this.fetchFromSource(sourceName);
        const responseTime = Date.now() - startTime;

        this.recordSuccess(sourceName, responseTime);

        return {
          value: result,
          source: sourceName,
          confidence: this.calculateConfidence(sourceInfo, responseTime),
          responseTime,
          timestamp: Date.now()
        };

      } catch (error) {
        this.recordFailure(sourceName, error);
        console.warn(`⚠️ APY source ${sourceName} failed:`, error instanceof Error ? error.message : String(error));
        
        // Continue to next source
        continue;
      }
    }

    // If all sources failed, return emergency value
    throw new Error('All APY sources failed');
  }

  /**
   * Fetch from specific source
   */
  private async fetchFromSource(sourceName: string): Promise<number> {
    switch (sourceName) {
      case 'defillama_highest':
        return await this.fetchFromDeFiLlama();
      
      case 'database_cached':
        return await this.fetchFromDatabase();
      
      case 'calculated_average':
        return await this.fetchCalculatedAverage();
      
      case 'static_fallback':
        return this.getStaticFallback();
      
      default:
        throw new Error(`Unknown source: ${sourceName}`);
    }
  }

  /**
   * Primary source: DeFiLlama API
   */
  private async fetchFromDeFiLlama(): Promise<number> {
    const { getHighestAPY } = await import('../lib/defillama-api');
    const apy = await getHighestAPY();
    
    if (typeof apy !== 'number' || apy <= 0 || apy > 50) {
      throw new Error(`Invalid APY from DeFiLlama: ${apy}`);
    }
    
    return apy;
  }

  /**
   * Secondary source: Database cached values
   */
  private async fetchFromDatabase(): Promise<number> {
    try {
      const { getProtocolRate } = await import('../lib/database');
      const cached = getProtocolRate('highest_apy');
      
      if (cached && cached.apy && typeof cached.apy === 'number') {
        // Check if data is not too old (within 24 hours)
        const age = Date.now() - (cached.lastUpdated || 0);
        if (age < 24 * 60 * 60 * 1000) {
          return cached.apy;
        }
      }
      
      throw new Error('No valid cached APY in database');
    } catch (error) {
      throw new Error(`Database APY fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Tertiary source: Calculate average from multiple protocols
   */
  private async fetchCalculatedAverage(): Promise<number> {
    try {
      const { getProtocolRate } = await import('../lib/database');
      
      const protocols = ['aave', 'fluid', 'compound', 'morpho', 'spark', 'seamless', 'moonwell'];
      const validAPYs: number[] = [];
      
      for (const protocol of protocols) {
        const rate = getProtocolRate(protocol);
        if (rate && rate.apy && typeof rate.apy === 'number' && rate.apy > 0) {
          validAPYs.push(rate.apy);
        }
      }
      
      if (validAPYs.length === 0) {
        throw new Error('No valid protocol APYs found for calculation');
      }
      
      // Return the highest APY from available protocols
      const highest = Math.max(...validAPYs);
      console.log(`📊 Calculated APY from ${validAPYs.length} protocols: ${highest}%`);
      
      return highest;
    } catch (error) {
      throw new Error(`Calculated average fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Emergency source: Static fallback values
   */
  private getStaticFallback(): number {
    // Return a conservative but reasonable APY
    const fallbackAPY = 7.5; // Conservative estimate
    console.log(`🆘 Using static fallback APY: ${fallbackAPY}%`);
    return fallbackAPY;
  }

  /**
   * Health monitoring and metrics
   */
  private recordSuccess(sourceName: string, responseTime: number): void {
    const source = this.sources.get(sourceName);
    if (!source) return;

    source.totalCalls++;
    source.successfulCalls++;
    source.lastSuccess = Date.now();
    
    // Update health score based on success rate and response time
    const successRate = source.successfulCalls / source.totalCalls;
    const responseScore = Math.max(0, 1 - (responseTime / 10000)); // Penalize slow responses
    source.healthScore = (successRate * 0.7) + (responseScore * 0.3);
    
    console.log(`✅ APY source ${sourceName} success (${responseTime}ms) - Health: ${source.healthScore.toFixed(2)}`);
  }

  private recordFailure(sourceName: string, error: unknown): void {
    const source = this.sources.get(sourceName);
    if (!source) return;

    source.totalCalls++;
    source.lastFailure = Date.now();
    
    // Update health score
    const successRate = source.successfulCalls / source.totalCalls;
    source.healthScore = successRate * 0.8; // Penalty for failures
    
    console.log(`❌ APY source ${sourceName} failed - Health: ${source.healthScore.toFixed(2)}`);
  }

  private calculateConfidence(source: APYSource, responseTime: number): number {
    let confidence = source.healthScore;
    
    // Adjust based on response time
    if (responseTime < 1000) confidence *= 1.0;
    else if (responseTime < 3000) confidence *= 0.9;
    else if (responseTime < 5000) confidence *= 0.8;
    else confidence *= 0.7;
    
    // Adjust based on recency
    if (source.lastSuccess) {
      const age = Date.now() - source.lastSuccess;
      if (age > 60000) confidence *= 0.9; // Reduce confidence for older data
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get health status of all sources
   */
  getSourcesHealth(): Record<string, APYSource> {
    return Object.fromEntries(this.sources.entries());
  }

  /**
   * Reset health scores (useful for testing)
   */
  resetHealthScores(): void {
    for (const source of this.sources.values()) {
      source.healthScore = 1.0;
      source.totalCalls = 0;
      source.successfulCalls = 0;
      source.lastSuccess = null;
      source.lastFailure = null;
    }
    console.log('🔄 All source health scores reset');
  }

  /**
   * Force specific source priority (for testing/debugging)
   */
  setSourcePriority(sourceName: string, priority: number): void {
    const source = this.sources.get(sourceName);
    if (source) {
      source.priority = priority;
      console.log(`🔧 Source ${sourceName} priority set to ${priority}`);
    }
  }
}

// Export singleton instance
export const apySourceManager = new APYSourceManager();