"use strict";
/**
 * Database-first APY utility for performance optimization
 *
 * Uses cached database values first, falls back to API if needed.
 * Dramatically reduces API calls for display-only scenarios.
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
exports.getCachedHighestAPY = getCachedHighestAPY;
exports.getCachedProtocolAPY = getCachedProtocolAPY;
exports.getCachedMultipleProtocolAPYs = getCachedMultipleProtocolAPYs;
/**
 * Get highest APY from database cache first, API as fallback
 * Avoids expensive fetchRealTimeYields() call for display purposes
 */
async function getCachedHighestAPY() {
    try {
        const { getProtocolRate } = await Promise.resolve().then(() => __importStar(require('../lib/database')));
        // Try to get cached APY values from database
        const cachedProtocols = [
            'aave', 'fluid', 'compound', 'morpho',
            'spark', 'seamless', 'moonwell', 'morpho-re7'
        ];
        const cachedAPYs = [];
        for (const protocol of cachedProtocols) {
            const cached = getProtocolRate(protocol);
            if (cached && cached.apy) {
                cachedAPYs.push(cached.apy);
            }
        }
        // If we have cached data, return highest
        if (cachedAPYs.length > 0) {
            const highestCached = Math.max(...cachedAPYs);
            console.log(`📦 Using cached highest APY: ${highestCached}% (from ${cachedAPYs.length} protocols in DB)`);
            return parseFloat(highestCached.toFixed(2));
        }
        // Fallback to API if no cached data
        console.log(`⚠️ No cached APY data found, falling back to API call`);
        const { getHighestAPY } = await Promise.resolve().then(() => __importStar(require('../lib/defillama-api')));
        return await getHighestAPY();
    }
    catch (error) {
        console.error('Error getting cached highest APY:', error);
        // Ultimate fallback
        return 7.5;
    }
}
/**
 * Get individual protocol APY from database cache first, API as fallback
 * Optimized for position-specific APY lookups
 */
async function getCachedProtocolAPY(protocol) {
    try {
        const { getProtocolRate } = await Promise.resolve().then(() => __importStar(require('../lib/database')));
        // Map protocol names to database keys
        const dbProtocolMap = {
            'AAVE': 'aave',
            'FLUID': 'fluid',
            'COMPOUND': 'compound',
            'MORPHO': 'morpho',
            'SPARK': 'spark',
            'SEAMLESS': 'seamless',
            'MOONWELL': 'moonwell',
            'MORPHO_RE7': 'morpho-re7'
        };
        const dbKey = dbProtocolMap[protocol];
        const cached = getProtocolRate(dbKey);
        // If we have fresh cached data (less than 30 minutes old), use it
        if (cached && cached.apy && (Date.now() - cached.lastUpdated) < 30 * 60 * 1000) {
            console.log(`📦 Using cached ${protocol} APY: ${cached.apy}% (${Math.round((Date.now() - cached.lastUpdated) / (60 * 1000))} min old)`);
            return parseFloat(cached.apy.toFixed(2));
        }
        // If cached data is stale or missing, fallback to API
        console.log(`🔄 Cached ${protocol} data ${cached ? 'stale' : 'missing'}, fetching from API...`);
        const { fetchProtocolApy } = await Promise.resolve().then(() => __importStar(require('../lib/defillama-api')));
        return await fetchProtocolApy(protocol);
    }
    catch (error) {
        console.error(`Error getting cached ${protocol} APY:`, error);
        // Protocol-specific fallbacks
        const fallbacks = {
            AAVE: 5.69,
            FLUID: 7.72,
            COMPOUND: 7.65,
            MORPHO: 10.0,
            SPARK: 8.0,
            SEAMLESS: 5.0,
            MOONWELL: 5.0,
            MORPHO_RE7: 6.0
        };
        return fallbacks[protocol];
    }
}
/**
 * Get multiple protocol APYs from cache efficiently
 * Returns only the APYs for protocols that actually have positions
 */
async function getCachedMultipleProtocolAPYs(protocols) {
    const results = {};
    // Batch process all requested protocols
    const promises = protocols.map(async (protocol) => {
        const apy = await getCachedProtocolAPY(protocol);
        return { protocol, apy };
    });
    const resolved = await Promise.allSettled(promises);
    resolved.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            results[protocols[index]] = result.value.apy;
        }
        else {
            // Use fallback for failed protocol
            const fallbacks = {
                AAVE: 5.69,
                FLUID: 7.72,
                COMPOUND: 7.65,
                MORPHO: 10.0,
                SPARK: 8.0,
                SEAMLESS: 5.0,
                MOONWELL: 5.0,
                MORPHO_RE7: 6.0
            };
            results[protocols[index]] = fallbacks[protocols[index]];
        }
    });
    console.log(`📊 Cached APY lookup for ${protocols.length} protocols: ${Object.entries(results).map(([p, apy]) => `${p}: ${apy}%`).join(', ')}`);
    return results;
}
