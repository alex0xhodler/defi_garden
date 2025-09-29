"use strict";
/**
 * Smart data sources for APY with resilient fallback chains
 * Manages multiple data sources with health monitoring and intelligent routing
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
exports.apySourceManager = void 0;
class APYSourceManager {
    constructor() {
        this.sources = new Map();
        this.initializeSources();
    }
    initializeSources() {
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
    async getAPY() {
        const sortedSources = Array.from(this.sources.entries())
            .sort(([, a], [, b]) => {
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
            }
            catch (error) {
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
    async fetchFromSource(sourceName) {
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
    async fetchFromDeFiLlama() {
        const { getHighestAPY } = await Promise.resolve().then(() => __importStar(require('../lib/defillama-api')));
        const apy = await getHighestAPY();
        if (typeof apy !== 'number' || apy <= 0 || apy > 50) {
            throw new Error(`Invalid APY from DeFiLlama: ${apy}`);
        }
        return apy;
    }
    /**
     * Secondary source: Database cached values
     */
    async fetchFromDatabase() {
        try {
            const { getProtocolRate } = await Promise.resolve().then(() => __importStar(require('../lib/database')));
            const cached = getProtocolRate('highest_apy');
            if (cached && cached.apy && typeof cached.apy === 'number') {
                // Check if data is not too old (within 24 hours)
                const age = Date.now() - (cached.lastUpdated || 0);
                if (age < 24 * 60 * 60 * 1000) {
                    return cached.apy;
                }
            }
            throw new Error('No valid cached APY in database');
        }
        catch (error) {
            throw new Error(`Database APY fetch failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Tertiary source: Calculate average from multiple protocols
     */
    async fetchCalculatedAverage() {
        try {
            const { getProtocolRate } = await Promise.resolve().then(() => __importStar(require('../lib/database')));
            const protocols = ['aave', 'fluid', 'compound', 'morpho', 'spark', 'seamless', 'moonwell'];
            const validAPYs = [];
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
        }
        catch (error) {
            throw new Error(`Calculated average fetch failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Emergency source: Static fallback values
     */
    getStaticFallback() {
        // Return a conservative but reasonable APY
        const fallbackAPY = 7.5; // Conservative estimate
        console.log(`🆘 Using static fallback APY: ${fallbackAPY}%`);
        return fallbackAPY;
    }
    /**
     * Health monitoring and metrics
     */
    recordSuccess(sourceName, responseTime) {
        const source = this.sources.get(sourceName);
        if (!source)
            return;
        source.totalCalls++;
        source.successfulCalls++;
        source.lastSuccess = Date.now();
        // Update health score based on success rate and response time
        const successRate = source.successfulCalls / source.totalCalls;
        const responseScore = Math.max(0, 1 - (responseTime / 10000)); // Penalize slow responses
        source.healthScore = (successRate * 0.7) + (responseScore * 0.3);
        console.log(`✅ APY source ${sourceName} success (${responseTime}ms) - Health: ${source.healthScore.toFixed(2)}`);
    }
    recordFailure(sourceName, error) {
        const source = this.sources.get(sourceName);
        if (!source)
            return;
        source.totalCalls++;
        source.lastFailure = Date.now();
        // Update health score
        const successRate = source.successfulCalls / source.totalCalls;
        source.healthScore = successRate * 0.8; // Penalty for failures
        console.log(`❌ APY source ${sourceName} failed - Health: ${source.healthScore.toFixed(2)}`);
    }
    calculateConfidence(source, responseTime) {
        let confidence = source.healthScore;
        // Adjust based on response time
        if (responseTime < 1000)
            confidence *= 1.0;
        else if (responseTime < 3000)
            confidence *= 0.9;
        else if (responseTime < 5000)
            confidence *= 0.8;
        else
            confidence *= 0.7;
        // Adjust based on recency
        if (source.lastSuccess) {
            const age = Date.now() - source.lastSuccess;
            if (age > 60000)
                confidence *= 0.9; // Reduce confidence for older data
        }
        return Math.max(0, Math.min(1, confidence));
    }
    /**
     * Get health status of all sources
     */
    getSourcesHealth() {
        return Object.fromEntries(this.sources.entries());
    }
    /**
     * Reset health scores (useful for testing)
     */
    resetHealthScores() {
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
    setSourcePriority(sourceName, priority) {
        const source = this.sources.get(sourceName);
        if (source) {
            source.priority = priority;
            console.log(`🔧 Source ${sourceName} priority set to ${priority}`);
        }
    }
}
// Export singleton instance
exports.apySourceManager = new APYSourceManager();
