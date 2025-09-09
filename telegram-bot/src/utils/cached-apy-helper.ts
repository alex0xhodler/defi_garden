/**
 * Database-first APY utility for performance optimization
 * 
 * Uses cached database values first, falls back to API if needed.
 * Dramatically reduces API calls for display-only scenarios.
 */

/**
 * Get highest APY from database cache first, API as fallback
 * Avoids expensive fetchRealTimeYields() call for display purposes
 */
export async function getCachedHighestAPY(): Promise<number> {
  try {
    const { getProtocolRate } = await import('../lib/database');
    
    // Try to get cached APY values from database
    const cachedProtocols = [
      'aave', 'fluid', 'compound', 'morpho', 
      'spark', 'seamless', 'moonwell', 'morpho-re7'
    ];
    
    const cachedAPYs: number[] = [];
    
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
    const { getHighestAPY } = await import('../lib/defillama-api');
    return await getHighestAPY();
    
  } catch (error) {
    console.error('Error getting cached highest APY:', error);
    // Ultimate fallback
    return 7.5;
  }
}

/**
 * Get individual protocol APY from database cache first, API as fallback
 * Optimized for position-specific APY lookups
 */
export async function getCachedProtocolAPY(protocol: 'AAVE' | 'FLUID' | 'COMPOUND' | 'MORPHO' | 'SPARK' | 'SEAMLESS' | 'MOONWELL' | 'MORPHO_RE7'): Promise<number> {
  try {
    const { getProtocolRate } = await import('../lib/database');
    
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
    const { fetchProtocolApy } = await import('../lib/defillama-api');
    return await fetchProtocolApy(protocol);
    
  } catch (error) {
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
export async function getCachedMultipleProtocolAPYs(protocols: Array<'AAVE' | 'FLUID' | 'COMPOUND' | 'MORPHO' | 'SPARK' | 'SEAMLESS' | 'MOONWELL' | 'MORPHO_RE7'>): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  
  // Batch process all requested protocols
  const promises = protocols.map(async (protocol) => {
    const apy = await getCachedProtocolAPY(protocol);
    return { protocol, apy };
  });
  
  const resolved = await Promise.allSettled(promises);
  
  resolved.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      results[protocols[index]] = result.value.apy;
    } else {
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