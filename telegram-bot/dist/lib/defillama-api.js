"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.POOL_IDS = void 0;
exports.fetchRealTimeYields = fetchRealTimeYields;
exports.getHighestAPY = getHighestAPY;
exports.getCompoundV3APY = getCompoundV3APY;
exports.fetchProtocolApy = fetchProtocolApy;
exports.testDeFiLlamaAPI = testDeFiLlamaAPI;
const axios_1 = __importDefault(require("axios"));
// DeFiLlama API endpoints
const POOLS_ENDPOINT = "https://yields.llama.fi/pools";
const CHART_ENDPOINT = "https://yields.llama.fi/chart";
// Pool IDs for USDC lending on Base
exports.POOL_IDS = {
    AAVE: "7e0661bf-8cf3-45e6-9424-31916d4c7b84",
    FLUID: "7372edda-f07f-4598-83e5-4edec48c4039",
    COMPOUND: "0c8567f8-ba5b-41ad-80de-00a71895eb19"
};
/**
 * Fetch specific pools by IDs (much more efficient than fetching all pools)
 */
async function fetchSpecificPools(poolIds) {
    try {
        console.log(`Fetching specific pools from DeFiLlama: ${poolIds.join(', ')}`);
        // Fetch all pools but only process the ones we need
        const response = await axios_1.default.get(POOLS_ENDPOINT);
        const data = response.data;
        const allPools = data.data || [];
        // Filter to only our 3 pools
        const ourPools = allPools.filter((pool) => poolIds.includes(pool.pool));
        console.log(`Found ${ourPools.length}/${poolIds.length} requested pools`);
        return ourPools;
    }
    catch (error) {
        console.error("Error fetching specific pools from DeFiLlama:", error);
        throw error;
    }
}
/**
 * Fetch specific pool data by pool ID
 */
async function fetchPoolById(poolId) {
    try {
        const pools = await fetchSpecificPools([poolId]);
        const pool = pools.find(p => p.pool === poolId);
        if (!pool) {
            console.warn(`Pool with ID ${poolId} not found in DeFiLlama data`);
            return null;
        }
        return pool;
    }
    catch (error) {
        console.error(`Error fetching pool ${poolId}:`, error);
        throw error;
    }
}
/**
 * Convert DeFiLlama pool to our YieldOpportunity format
 */
function convertToYieldOpportunity(pool, protocol, fallbackApy) {
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
async function fetchRealTimeYields() {
    try {
        console.log("=== FETCHING REAL-TIME YIELDS ===");
        // Fetch all three pools in one efficient call
        const pools = await fetchSpecificPools([
            exports.POOL_IDS.AAVE,
            exports.POOL_IDS.FLUID,
            exports.POOL_IDS.COMPOUND
        ]);
        const aavePool = pools.find(p => p.pool === exports.POOL_IDS.AAVE);
        const fluidPool = pools.find(p => p.pool === exports.POOL_IDS.FLUID);
        const compoundPool = pools.find(p => p.pool === exports.POOL_IDS.COMPOUND);
        const opportunities = [];
        // Process Aave
        if (aavePool) {
            const aaveOpportunity = convertToYieldOpportunity(aavePool, "Aave");
            opportunities.push(aaveOpportunity);
            console.log(`✅ Aave: ${aaveOpportunity.apy}% APY (${aaveOpportunity.apyBase}% base + ${aaveOpportunity.apyReward}% rewards)`);
        }
        else {
            console.warn("❌ Failed to fetch Aave data, using fallback");
            opportunities.push(convertToYieldOpportunity({}, "Aave", 5.69));
        }
        // Process Fluid
        if (fluidPool) {
            const fluidOpportunity = convertToYieldOpportunity(fluidPool, "Fluid");
            opportunities.push(fluidOpportunity);
            console.log(`✅ Fluid: ${fluidOpportunity.apy}% APY (${fluidOpportunity.apyBase}% base + ${fluidOpportunity.apyReward}% rewards)`);
        }
        else {
            console.warn("❌ Failed to fetch Fluid data, using fallback");
            opportunities.push(convertToYieldOpportunity({}, "Fluid", 7.72));
        }
        // Process Compound
        if (compoundPool) {
            const compoundOpportunity = convertToYieldOpportunity(compoundPool, "Compound");
            opportunities.push(compoundOpportunity);
            console.log(`✅ Compound: ${compoundOpportunity.apy}% APY (${compoundOpportunity.apyBase}% base + ${compoundOpportunity.apyReward}% rewards)`);
        }
        else {
            console.warn("❌ Failed to fetch Compound data, using fallback");
            opportunities.push(convertToYieldOpportunity({}, "Compound", 7.65));
        }
        console.log(`=== FETCHED ${opportunities.length} REAL-TIME YIELDS ===`);
        return opportunities;
    }
    catch (error) {
        console.error("Error fetching real-time yields:", error);
        // Return fallback data if API fails
        console.log("Using fallback yield data due to API error");
        return [
            convertToYieldOpportunity({}, "Aave", 5.69),
            convertToYieldOpportunity({}, "Fluid", 7.72),
            convertToYieldOpportunity({}, "Compound", 7.65)
        ];
    }
}
/**
 * Get the highest APY from all monitored pools
 */
async function getHighestAPY() {
    try {
        const yields = await fetchRealTimeYields();
        const highestAPY = Math.max(...yields.map(y => y.apy));
        console.log(`Highest APY found: ${highestAPY}%`);
        return parseFloat(highestAPY.toFixed(2));
    }
    catch (error) {
        console.error("Error fetching highest APY:", error);
        return 7.72; // Fallback to reasonable default
    }
}
/**
 * Get Compound V3 specific APY (async wrapper)
 */
async function getCompoundV3APY() {
    return await fetchProtocolApy("COMPOUND");
}
/**
 * Fetch individual protocol APY by pool ID
 */
async function fetchProtocolApy(protocol) {
    try {
        const poolId = exports.POOL_IDS[protocol];
        const pool = await fetchPoolById(poolId);
        if (!pool) {
            console.warn(`No data found for ${protocol}, using fallback`);
            const fallbacks = { AAVE: 5.69, FLUID: 7.72, COMPOUND: 7.65 };
            return fallbacks[protocol];
        }
        const apy = pool.apy || ((pool.apyBase || 0) + (pool.apyReward || 0));
        console.log(`${protocol} current APY: ${apy.toFixed(2)}%`);
        return parseFloat(apy.toFixed(2));
    }
    catch (error) {
        console.error(`Error fetching ${protocol} APY:`, error);
        const fallbacks = { AAVE: 5.69, FLUID: 7.72, COMPOUND: 7.65 };
        return fallbacks[protocol];
    }
}
/**
 * Test function to verify API connectivity and data structure
 */
async function testDeFiLlamaAPI() {
    console.log("=== TESTING DEFILLAMA API ===");
    try {
        const opportunities = await fetchRealTimeYields();
        console.log("\n📊 Current USDC Lending Rates on Base:");
        opportunities
            .sort((a, b) => b.apy - a.apy)
            .forEach((pool, index) => {
            console.log(`${index + 1}. ${pool.project}: ${pool.apy}% APY`);
            console.log(`   TVL: $${(pool.tvlUsd / 1000000).toFixed(1)}M`);
            console.log(`   Base: ${pool.apyBase}% | Rewards: ${pool.apyReward}%\n`);
        });
    }
    catch (error) {
        console.error("API test failed:", error);
    }
}
