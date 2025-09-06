import { YieldOpportunity } from "../types/config";
import axios from "axios";

// DeFiLlama API endpoints
const POOLS_ENDPOINT = "https://yields.llama.fi/pools";
const CHART_ENDPOINT = "https://yields.llama.fi/chart";

// Pool IDs for USDC lending on Base
export const POOL_IDS = {
  AAVE: "7e0661bf-8cf3-45e6-9424-31916d4c7b84",
  FLUID: "7372edda-f07f-4598-83e5-4edec48c4039", 
  COMPOUND: "0c8567f8-ba5b-41ad-80de-00a71895eb19",
  MORPHO: "301667a4-dc42-492d-a978-ea4f69811a72",
  SPARK: "9f146531-9c31-46ba-8e26-6b59bdaca9ff"
} as const;

// DeFiLlama API pool structure
interface DeFiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  apyBase7d?: number;
  apyMean30d?: number;
  stablecoin?: boolean;
  ilRisk?: string;
  exposure?: string;
  predictions?: {
    predictedClass: string;
    predictedProbability: number;
    binnedConfidence: number;
  };
  poolMeta?: string;
  mu?: number;
  sigma?: number;
  count?: number;
  outlier?: boolean;
  underlyingTokens?: string[];
  rewardTokens?: string[];
}

/**
 * Fetch specific pools by IDs (much more efficient than fetching all pools)
 */
async function fetchSpecificPools(poolIds: string[]): Promise<DeFiLlamaPool[]> {
  try {
    console.log(`Fetching specific pools from DeFiLlama: ${poolIds.join(', ')}`);
    
    // Fetch all pools but only process the ones we need
    const response = await axios.get(POOLS_ENDPOINT);
    const data = response.data;
    const allPools = data.data || [];
    
    // Filter to only our 3 pools
    const ourPools = allPools.filter((pool: DeFiLlamaPool) => 
      poolIds.includes(pool.pool)
    );
    
    console.log(`Found ${ourPools.length}/${poolIds.length} requested pools`);
    return ourPools;
  } catch (error) {
    console.error("Error fetching specific pools from DeFiLlama:", error);
    throw error;
  }
}

/**
 * Fetch specific pool data by pool ID
 */
async function fetchPoolById(poolId: string): Promise<DeFiLlamaPool | null> {
  try {
    const pools = await fetchSpecificPools([poolId]);
    const pool = pools.find(p => p.pool === poolId);
    
    if (!pool) {
      console.warn(`Pool with ID ${poolId} not found in DeFiLlama data`);
      return null;
    }
    
    return pool;
  } catch (error) {
    console.error(`Error fetching pool ${poolId}:`, error);
    throw error;
  }
}

/**
 * Convert DeFiLlama pool to our YieldOpportunity format
 */
function convertToYieldOpportunity(
  pool: DeFiLlamaPool, 
  protocol: string,
  fallbackApy?: number
): YieldOpportunity {
  // Calculate total APY (base + rewards)
  const apyBase = pool.apyBase || 0;
  const apyReward = pool.apyReward || 0;
  const totalApy = pool.apy || (apyBase + apyReward) || fallbackApy || 0;
  
  return {
    poolId: `${protocol.toLowerCase()}-usdc-base`,
    project: protocol,
    chain: "Base",
    symbol: "USDC",
    tvlUsd: pool.tvlUsd || 0,
    apy: parseFloat(totalApy.toFixed(2)),
    apyBase: parseFloat(apyBase.toFixed(2)),
    apyReward: parseFloat(apyReward.toFixed(2)),
    ilRisk: "no", // USDC lending has no IL risk
    exposure: "single",
    underlyingTokens: pool.underlyingTokens || ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"], // USDC on Base
    rewardTokens: pool.rewardTokens || [],
    riskScore: 1, // Will be calculated separately
    protocol: protocol.toLowerCase()
  };
}

/**
 * Fetch real-time USDC lending rates for all protocols
 */
export async function fetchRealTimeYields(): Promise<YieldOpportunity[]> {
  try {
    console.log("=== FETCHING REAL-TIME YIELDS ===");
    
    // Import database functions
    const { saveProtocolRate, getProtocolRate } = await import("./database");
    
    // Fetch all five pools in one efficient call
    const pools = await fetchSpecificPools([
      POOL_IDS.AAVE,
      POOL_IDS.FLUID,
      POOL_IDS.COMPOUND,
      POOL_IDS.MORPHO,
      POOL_IDS.SPARK
    ]);
    
    const aavePool = pools.find(p => p.pool === POOL_IDS.AAVE);
    const fluidPool = pools.find(p => p.pool === POOL_IDS.FLUID);
    const compoundPool = pools.find(p => p.pool === POOL_IDS.COMPOUND);
    const morphoPool = pools.find(p => p.pool === POOL_IDS.MORPHO);
    const sparkPool = pools.find(p => p.pool === POOL_IDS.SPARK);
    
    const opportunities: YieldOpportunity[] = [];
    
    // Process Aave
    if (aavePool) {
      const aaveOpportunity = convertToYieldOpportunity(aavePool, "Aave");
      opportunities.push(aaveOpportunity);
      
      // Save to database for future fallback
      saveProtocolRate("aave", aaveOpportunity.apy, aaveOpportunity.apyBase, aaveOpportunity.apyReward, aavePool.tvlUsd);
      console.log(`✅ Aave: ${aaveOpportunity.apy}% APY (${aaveOpportunity.apyBase}% base + ${aaveOpportunity.apyReward}% rewards) - saved to DB`);
    } else {
      console.warn("❌ Failed to fetch Aave data, using database fallback");
      const cachedAave = getProtocolRate("aave");
      if (cachedAave) {
        opportunities.push(convertToYieldOpportunity({
          tvlUsd: cachedAave.tvlUsd,
          apy: cachedAave.apy,
          apyBase: cachedAave.apyBase,
          apyReward: cachedAave.apyReward
        } as DeFiLlamaPool, "Aave"));
        console.log(`📦 Using cached Aave data: ${cachedAave.apy}% APY (last updated: ${new Date(cachedAave.lastUpdated).toISOString()})`);
      } else {
        console.log(`🔧 Using hardcoded Aave fallback: 5.69% APY`);
        opportunities.push(convertToYieldOpportunity({} as DeFiLlamaPool, "Aave", 5.69));
      }
    }
    
    // Process Fluid
    if (fluidPool) {
      const fluidOpportunity = convertToYieldOpportunity(fluidPool, "Fluid");
      opportunities.push(fluidOpportunity);
      
      // Save to database for future fallback
      saveProtocolRate("fluid", fluidOpportunity.apy, fluidOpportunity.apyBase, fluidOpportunity.apyReward, fluidPool.tvlUsd);
      console.log(`✅ Fluid: ${fluidOpportunity.apy}% APY (${fluidOpportunity.apyBase}% base + ${fluidOpportunity.apyReward}% rewards) - saved to DB`);
    } else {
      console.warn("❌ Failed to fetch Fluid data, using database fallback");
      const cachedFluid = getProtocolRate("fluid");
      if (cachedFluid) {
        opportunities.push(convertToYieldOpportunity({
          tvlUsd: cachedFluid.tvlUsd,
          apy: cachedFluid.apy,
          apyBase: cachedFluid.apyBase,
          apyReward: cachedFluid.apyReward
        } as DeFiLlamaPool, "Fluid"));
        console.log(`📦 Using cached Fluid data: ${cachedFluid.apy}% APY (last updated: ${new Date(cachedFluid.lastUpdated).toISOString()})`);
      } else {
        console.log(`🔧 Using hardcoded Fluid fallback: 7.72% APY`);
        opportunities.push(convertToYieldOpportunity({} as DeFiLlamaPool, "Fluid", 7.72));
      }
    }
    
    // Process Compound
    if (compoundPool) {
      const compoundOpportunity = convertToYieldOpportunity(compoundPool, "Compound");
      opportunities.push(compoundOpportunity);
      
      // Save to database for future fallback
      saveProtocolRate("compound", compoundOpportunity.apy, compoundOpportunity.apyBase, compoundOpportunity.apyReward, compoundPool.tvlUsd);
      console.log(`✅ Compound: ${compoundOpportunity.apy}% APY (${compoundOpportunity.apyBase}% base + ${compoundOpportunity.apyReward}% rewards) - saved to DB`);
    } else {
      console.warn("❌ Failed to fetch Compound data, using database fallback");
      const cachedCompound = getProtocolRate("compound");
      if (cachedCompound) {
        opportunities.push(convertToYieldOpportunity({
          tvlUsd: cachedCompound.tvlUsd,
          apy: cachedCompound.apy,
          apyBase: cachedCompound.apyBase,
          apyReward: cachedCompound.apyReward
        } as DeFiLlamaPool, "Compound"));
        console.log(`📦 Using cached Compound data: ${cachedCompound.apy}% APY (last updated: ${new Date(cachedCompound.lastUpdated).toISOString()})`);
      } else {
        console.log(`🔧 Using hardcoded Compound fallback: 7.65% APY`);
        opportunities.push(convertToYieldOpportunity({} as DeFiLlamaPool, "Compound", 7.65));
      }
    }
    
    // Process Morpho
    if (morphoPool) {
      const morphoOpportunity = convertToYieldOpportunity(morphoPool, "Morpho");
      opportunities.push(morphoOpportunity);
      
      // Save to database for future fallback
      saveProtocolRate("morpho", morphoOpportunity.apy, morphoOpportunity.apyBase, morphoOpportunity.apyReward, morphoPool.tvlUsd);
      console.log(`✅ Morpho: ${morphoOpportunity.apy}% APY (${morphoOpportunity.apyBase}% base + ${morphoOpportunity.apyReward}% rewards) - saved to DB`);
    } else {
      console.warn("❌ Failed to fetch Morpho data, using database fallback");
      const cachedMorpho = getProtocolRate("morpho");
      if (cachedMorpho) {
        opportunities.push(convertToYieldOpportunity({
          tvlUsd: cachedMorpho.tvlUsd,
          apy: cachedMorpho.apy,
          apyBase: cachedMorpho.apyBase,
          apyReward: cachedMorpho.apyReward
        } as DeFiLlamaPool, "Morpho"));
        console.log(`📦 Using cached Morpho data: ${cachedMorpho.apy}% APY (last updated: ${new Date(cachedMorpho.lastUpdated).toISOString()})`);
      } else {
        console.log(`🔧 Using hardcoded Morpho fallback: 10.0% APY`);
        opportunities.push(convertToYieldOpportunity({} as DeFiLlamaPool, "Morpho", 10.0));
      }
    }
    
    // Process Spark
    if (sparkPool) {
      const sparkOpportunity = convertToYieldOpportunity(sparkPool, "Spark");
      opportunities.push(sparkOpportunity);
      
      // Save to database for future fallback
      saveProtocolRate("spark", sparkOpportunity.apy, sparkOpportunity.apyBase, sparkOpportunity.apyReward, sparkPool.tvlUsd);
      console.log(`✅ Spark: ${sparkOpportunity.apy}% APY (${sparkOpportunity.apyBase}% base + ${sparkOpportunity.apyReward}% rewards) - saved to DB`);
    } else {
      console.warn("❌ Failed to fetch Spark data, using database fallback");
      const cachedSpark = getProtocolRate("spark");
      if (cachedSpark) {
        opportunities.push(convertToYieldOpportunity({
          tvlUsd: cachedSpark.tvlUsd,
          apy: cachedSpark.apy,
          apyBase: cachedSpark.apyBase,
          apyReward: cachedSpark.apyReward
        } as DeFiLlamaPool, "Spark"));
        console.log(`📦 Using cached Spark data: ${cachedSpark.apy}% APY (last updated: ${new Date(cachedSpark.lastUpdated).toISOString()})`);
      } else {
        console.log(`🔧 Using hardcoded Spark fallback: 8.0% APY`);
        opportunities.push(convertToYieldOpportunity({} as DeFiLlamaPool, "Spark", 8.0));
      }
    }
    
    console.log(`=== FETCHED ${opportunities.length} REAL-TIME YIELDS ===`);
    return opportunities;
    
  } catch (error) {
    console.error("Error fetching real-time yields:", error);
    
    // Try to use database cache as fallback
    console.log("API failed, attempting to use database cache");
    try {
      const { getProtocolRate } = await import("./database");
      const opportunities: YieldOpportunity[] = [];
      
      // Try cached data for each protocol
      const protocols = [
        { name: "Aave", fallback: 5.69 },
        { name: "Fluid", fallback: 7.72 },
        { name: "Compound", fallback: 7.65 },
        { name: "Morpho", fallback: 10.0 }
      ];
      
      for (const { name, fallback } of protocols) {
        const cached = getProtocolRate(name.toLowerCase());
        if (cached) {
          opportunities.push(convertToYieldOpportunity({
            tvlUsd: cached.tvlUsd,
            apy: cached.apy,
            apyBase: cached.apyBase,
            apyReward: cached.apyReward
          } as DeFiLlamaPool, name));
          console.log(`📦 Using cached ${name} data: ${cached.apy}% APY (${Math.round((Date.now() - cached.lastUpdated) / (60 * 1000))} minutes old)`);
        } else {
          opportunities.push(convertToYieldOpportunity({} as DeFiLlamaPool, name, fallback));
          console.log(`🔧 Using hardcoded ${name} fallback: ${fallback}% APY`);
        }
      }
      
      return opportunities;
    } catch (dbError) {
      console.error("Database fallback also failed:", dbError);
      console.log("Using hardcoded fallback yield data");
      return [
        convertToYieldOpportunity({} as DeFiLlamaPool, "Aave", 5.69),
        convertToYieldOpportunity({} as DeFiLlamaPool, "Fluid", 7.72),
        convertToYieldOpportunity({} as DeFiLlamaPool, "Compound", 7.65)
      ];
    }
  }
}

/**
 * Get the highest APY from all monitored pools
 */
export async function getHighestAPY(): Promise<number> {
  try {
    const yields = await fetchRealTimeYields();
    const highestAPY = Math.max(...yields.map(y => y.apy));
    console.log(`Highest APY found: ${highestAPY}%`);
    return parseFloat(highestAPY.toFixed(2));
  } catch (error) {
    console.error("Error fetching highest APY:", error);
    return 7.72; // Fallback to reasonable default
  }
}

/**
 * Get Compound V3 specific APY (async wrapper)
 */
export async function getCompoundV3APY(): Promise<number> {
  return await fetchProtocolApy("COMPOUND");
}

/**
 * Fetch individual protocol APY by pool ID
 */
export async function fetchProtocolApy(protocol: "AAVE" | "FLUID" | "COMPOUND" | "MORPHO" | "SPARK"): Promise<number> {
  try {
    const poolId = POOL_IDS[protocol];
    const pool = await fetchPoolById(poolId);
    
    if (!pool) {
      console.warn(`No data found for ${protocol}, using fallback`);
      const fallbacks = { AAVE: 5.69, FLUID: 7.72, COMPOUND: 7.65, MORPHO: 10.0, SPARK: 8.0 };
      return fallbacks[protocol];
    }
    
    const apy = pool.apy || ((pool.apyBase || 0) + (pool.apyReward || 0));
    console.log(`${protocol} current APY: ${apy.toFixed(2)}%`);
    
    return parseFloat(apy.toFixed(2));
  } catch (error) {
    console.error(`Error fetching ${protocol} APY:`, error);
    const fallbacks = { AAVE: 5.69, FLUID: 7.72, COMPOUND: 7.65, MORPHO: 10.0, SPARK: 8.0 };
    return fallbacks[protocol];
  }
}

/**
 * Test function to verify API connectivity and data structure
 */
export async function testDeFiLlamaAPI(): Promise<void> {
  console.log("=== TESTING DEFILLAMA API ===");
  
  try {
    const opportunities = await fetchRealTimeYields();
    
    console.log("\n📊 Current USDC Lending Rates on Base:");
    opportunities
      .sort((a, b) => b.apy - a.apy)
      .forEach((pool, index) => {
        console.log(`${index + 1}. ${pool.project}: ${pool.apy}% APY`);
        console.log(`   TVL: $${(pool.tvlUsd / 1_000_000).toFixed(1)}M`);
        console.log(`   Base: ${pool.apyBase}% | Rewards: ${pool.apyReward}%\n`);
      });
      
  } catch (error) {
    console.error("API test failed:", error);
  }
}