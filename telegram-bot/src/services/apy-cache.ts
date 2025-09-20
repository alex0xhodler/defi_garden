/**
 * Multi-layer intelligent caching system for APY data
 * L1: Hot memory cache (30s) - instant responses
 * L2: Session cache - user journey consistency  
 * L3: Database cache (5min) - persistence layer
 * L4: Static fallback - emergency values
 */

export interface APYData {
  value: number;
  timestamp: number;
  source: 'api' | 'cache_l1' | 'cache_l2' | 'cache_l3' | 'fallback';
  confidence: number; // 0-1 scale indicating data freshness/reliability
}

export interface SessionAPYContext {
  userId: string;
  journeyState: 'initial' | 'checking_deposits' | 'portfolio' | 'settings';
  apy: number;
  timestamp: number;
  interactionCount: number;
}

class APYCacheSystem {
  // L1 Cache: Global 30-second hot cache
  private l1Cache: APYData | null = null;
  private readonly L1_TTL = 30 * 1000; // 30 seconds

  // L2 Cache: Per-user session cache
  private l2Cache = new Map<string, SessionAPYContext>();
  private readonly L2_TTL = 60 * 1000; // 60 seconds per session

  // L3 Cache: Database integration (will be implemented)
  private readonly L3_TTL = 5 * 60 * 1000; // 5 minutes

  // L4 Cache: Static emergency fallbacks
  private readonly L4_FALLBACKS = {
    default: 7.5,
    compound: 7.65,
    aave: 5.69,
    fluid: 7.72,
    morpho: 10.0
  };

  /**
   * Get APY with intelligent layer selection
   */
  async getAPY(userId?: string, journeyState?: string): Promise<APYData> {
    const now = Date.now();

    // Try L2 (Session Cache) first if user context provided
    if (userId && journeyState) {
      const sessionData = this.getL2Cache(userId, journeyState as any);
      if (sessionData) {
        console.log(`📦 L2 Cache hit for user ${userId} in ${journeyState}`);
        return {
          value: sessionData.apy,
          timestamp: sessionData.timestamp,
          source: 'cache_l2',
          confidence: this.calculateConfidence(sessionData.timestamp, this.L2_TTL)
        };
      }
    }

    // Try L1 (Global Hot Cache)
    if (this.l1Cache && (now - this.l1Cache.timestamp) < this.L1_TTL) {
      console.log(`⚡ L1 Cache hit - serving hot data (${((now - this.l1Cache.timestamp) / 1000).toFixed(1)}s old)`);
      
      // Store in L2 for user session consistency
      if (userId && journeyState) {
        this.setL2Cache(userId, journeyState as any, this.l1Cache.value);
      }
      
      return {
        ...this.l1Cache,
        source: 'cache_l1',
        confidence: this.calculateConfidence(this.l1Cache.timestamp, this.L1_TTL)
      };
    }

    // Try L3 (Database Cache) - placeholder for now
    const l3Data = await this.getL3Cache();
    if (l3Data && (now - l3Data.timestamp) < this.L3_TTL) {
      console.log(`🗄️ L3 Database cache hit`);
      
      // Populate upper caches
      this.setL1Cache(l3Data.value);
      if (userId && journeyState) {
        this.setL2Cache(userId, journeyState as any, l3Data.value);
      }
      
      return {
        ...l3Data,
        source: 'cache_l3',
        confidence: this.calculateConfidence(l3Data.timestamp, this.L3_TTL)
      };
    }

    // L4 Fallback - emergency mode
    console.log(`🆘 Using L4 fallback - all caches missed`);
    const fallbackValue = this.L4_FALLBACKS.default;
    
    // Still populate caches for consistency
    this.setL1Cache(fallbackValue);
    if (userId && journeyState) {
      this.setL2Cache(userId, journeyState as any, fallbackValue);
    }
    
    return {
      value: fallbackValue,
      timestamp: now,
      source: 'fallback',
      confidence: 0.5 // Medium confidence in fallback
    };
  }

  /**
   * Set fresh APY data from external source
   */
  setFreshAPY(value: number, source: 'api' | 'database' = 'api'): void {
    const now = Date.now();
    
    // Update L1 cache
    this.setL1Cache(value);
    
    // Update L3 cache (database) - placeholder
    this.setL3Cache(value);
    
    console.log(`🔄 Fresh APY cached: ${value}% from ${source}`);
  }

  /**
   * L1 Cache Operations
   */
  private setL1Cache(value: number): void {
    this.l1Cache = {
      value,
      timestamp: Date.now(),
      source: 'api',
      confidence: 1.0
    };
  }

  /**
   * L2 Cache Operations (Session Management)
   */
  private getL2Cache(userId: string, journeyState: SessionAPYContext['journeyState']): SessionAPYContext | null {
    const cached = this.l2Cache.get(userId);
    const now = Date.now();
    
    if (!cached || (now - cached.timestamp) > this.L2_TTL) {
      if (cached) {
        console.log(`🗑️ L2 cache expired for user ${userId} (${((now - cached.timestamp) / 1000).toFixed(1)}s old)`);
        this.l2Cache.delete(userId);
      }
      return null;
    }
    
    // Update interaction count and journey state
    cached.interactionCount++;
    cached.journeyState = journeyState;
    
    return cached;
  }

  private setL2Cache(userId: string, journeyState: SessionAPYContext['journeyState'], apy: number): void {
    const existing = this.l2Cache.get(userId);
    
    this.l2Cache.set(userId, {
      userId,
      journeyState,
      apy,
      timestamp: Date.now(),
      interactionCount: existing ? existing.interactionCount + 1 : 1
    });
    
    console.log(`💾 L2 cache set for user ${userId} in ${journeyState} (${apy}% APY)`);
  }

  /**
   * L3 Cache Operations (Database Integration)
   */
  private async getL3Cache(): Promise<APYData | null> {
    try {
      // This will integrate with the existing database system
      const { getProtocolRate } = await import('../lib/database');
      const cached = getProtocolRate('highest_apy');
      
      if (cached && cached.apy) {
        return {
          value: cached.apy,
          timestamp: cached.lastUpdated || Date.now(),
          source: 'cache_l3',
          confidence: this.calculateConfidence(cached.lastUpdated || Date.now(), this.L3_TTL)
        };
      }
    } catch (error) {
      console.warn(`⚠️ L3 cache read failed:`, error);
    }
    
    return null;
  }

  private async setL3Cache(value: number): Promise<void> {
    try {
      // This will integrate with the existing database system
      const { saveProtocolRate } = await import('../lib/database');
      // Using database function signature: protocol, apy, apyBase, apyReward, tvlUsd
      saveProtocolRate('highest_apy', value, value, 0, 0);
    } catch (error) {
      console.warn(`⚠️ L3 cache write failed:`, error);
    }
  }

  /**
   * Cache Analytics and Management
   */
  private calculateConfidence(timestamp: number, maxAge: number): number {
    const age = Date.now() - timestamp;
    return Math.max(0, Math.min(1, 1 - (age / maxAge)));
  }

  getCacheStats() {
    const now = Date.now();
    return {
      l1: {
        exists: !!this.l1Cache,
        age: this.l1Cache ? now - this.l1Cache.timestamp : null,
        value: this.l1Cache?.value,
        confidence: this.l1Cache ? this.calculateConfidence(this.l1Cache.timestamp, this.L1_TTL) : 0
      },
      l2: {
        activeSessions: this.l2Cache.size,
        sessions: Array.from(this.l2Cache.entries()).map(([userId, data]) => ({
          userId,
          journeyState: data.journeyState,
          age: now - data.timestamp,
          interactions: data.interactionCount,
          confidence: this.calculateConfidence(data.timestamp, this.L2_TTL)
        }))
      }
    };
  }

  clearCache(level?: 'L1' | 'L2' | 'L3' | 'ALL'): void {
    switch (level) {
      case 'L1':
        this.l1Cache = null;
        console.log(`🧹 L1 cache cleared`);
        break;
      case 'L2':
        this.l2Cache.clear();
        console.log(`🧹 L2 cache cleared`);
        break;
      case 'L3':
        // Will implement database clearing
        console.log(`🧹 L3 cache clear requested`);
        break;
      case 'ALL':
      default:
        this.l1Cache = null;
        this.l2Cache.clear();
        console.log(`🧹 All caches cleared`);
        break;
    }
  }

  // Cleanup expired sessions periodically
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userId, data] of this.l2Cache.entries()) {
      if (now - data.timestamp > this.L2_TTL) {
        this.l2Cache.delete(userId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired L2 sessions`);
    }
  }

  // Start periodic cleanup
  startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Clean every minute
    
    console.log(`🔄 APY cache cleanup interval started`);
  }
}

// Export singleton instance
export const apyCache = new APYCacheSystem();