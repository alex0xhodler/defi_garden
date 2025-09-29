"use strict";
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
exports.getIndexTokenBalance = getIndexTokenBalance;
exports.getAllIndexBalances = getAllIndexBalances;
exports.getUserIndexPositions = getUserIndexPositions;
exports.calculateIndexPortfolioStats = calculateIndexPortfolioStats;
exports.refreshUserPositionValues = refreshUserPositionValues;
exports.clearPriceCache = clearPriceCache;
exports.getPriceCacheStats = getPriceCacheStats;
const viem_1 = require("viem");
const token_wallet_1 = require("../../lib/token-wallet");
const database_1 = require("../../lib/database");
const index_constants_1 = require("../../utils/index-constants");
// Simple ERC20 ABI for balance checking
const ERC20_ABI = [
    {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function'
    }
];
// Cache for price data to reduce API calls
const priceCache = new Map();
/**
 * Get balance of a specific index token for a user
 * @param userAddress User's wallet address
 * @param indexTokenId Index token ID from database
 * @returns Balance information
 */
async function getIndexTokenBalance(userAddress, indexTokenId) {
    try {
        console.log(`📊 Getting index token balance: ${indexTokenId} for ${userAddress}`);
        // Get token metadata from database
        const tokenData = (0, database_1.getIndexTokenById)(indexTokenId);
        if (!tokenData) {
            console.error(`❌ Index token not found: ${indexTokenId}`);
            return null;
        }
        // Get on-chain balance
        const publicClient = (0, token_wallet_1.createPublicClientForBase)();
        // First get token decimals
        const decimals = await publicClient.readContract({
            address: tokenData.contractAddress,
            abi: ERC20_ABI,
            functionName: 'decimals'
        });
        // Then get balance
        const balance = await publicClient.readContract({
            address: tokenData.contractAddress,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [userAddress]
        });
        // Format balance to human readable
        const balanceFormatted = (0, viem_1.formatUnits)(balance, decimals);
        // Get current price
        const priceData = await getTokenPrice(tokenData.contractAddress, tokenData.symbol);
        const valueInUSDC = (parseFloat(balanceFormatted) * priceData.price).toFixed(index_constants_1.INDEX_DISPLAY.USD_DECIMALS);
        console.log(`✅ Balance retrieved: ${balanceFormatted} ${tokenData.symbol} ($${valueInUSDC})`);
        return {
            tokenId: indexTokenId,
            symbol: tokenData.symbol,
            name: tokenData.name,
            contractAddress: tokenData.contractAddress,
            balance,
            balanceFormatted: parseFloat(balanceFormatted).toFixed(index_constants_1.INDEX_DISPLAY.BALANCE_DECIMALS),
            valueInUSDC,
            pricePerToken: priceData.price,
            priceChange24h: priceData.change24h,
            category: tokenData.category,
            riskLevel: tokenData.riskLevel
        };
    }
    catch (error) {
        console.error(`❌ Error getting index token balance for ${indexTokenId}:`, error);
        return null;
    }
}
/**
 * Get all index token balances for a user
 * @param userAddress User's wallet address
 * @returns Array of balance information for all held tokens
 */
async function getAllIndexBalances(userAddress) {
    try {
        console.log(`📊 Getting all index balances for ${userAddress}`);
        // Get all active index tokens from database
        const allTokens = (0, database_1.getAllActiveIndexTokens)();
        const balances = [];
        // Check balance for each token
        for (const token of allTokens) {
            const balanceInfo = await getIndexTokenBalance(userAddress, token.tokenId);
            if (balanceInfo && parseFloat(balanceInfo.balanceFormatted) > 0.000001) {
                balances.push(balanceInfo);
            }
            // Small delay to avoid overwhelming RPC
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        // Sort by value (highest first)
        balances.sort((a, b) => parseFloat(b.valueInUSDC) - parseFloat(a.valueInUSDC));
        console.log(`✅ Found ${balances.length} index token balances with value > 0`);
        return balances;
    }
    catch (error) {
        console.error(`❌ Error getting all index balances:`, error);
        return [];
    }
}
/**
 * Get user's index positions from database with current values
 * @param userId User ID
 * @returns Array of positions with current market values
 */
async function getUserIndexPositions(userId) {
    try {
        console.log(`📊 Getting index positions for user ${userId}`);
        // Get positions from database
        const positions = (0, database_1.getIndexPositionsByUserId)(userId);
        if (positions.length === 0) {
            console.log(`📊 No index positions found for user ${userId}`);
            return [];
        }
        // Get user's wallet address for on-chain balance verification
        const { getWallet } = await Promise.resolve().then(() => __importStar(require('../../lib/token-wallet')));
        const wallet = await getWallet(userId);
        if (!wallet) {
            console.warn(`⚠️ No wallet found for user ${userId}, cannot verify on-chain balances`);
            return [];
        }
        // Update current values with market prices and verify on-chain balances
        const updatedPositions = [];
        for (const position of positions) {
            try {
                // Get current price for this token
                const tokenData = (0, database_1.getIndexTokenById)(position.indexTokenId);
                if (!tokenData) {
                    console.warn(`⚠️ Token data not found for position: ${position.indexTokenId}`);
                    continue;
                }
                // Verify on-chain balance to detect stale positions
                const onChainBalance = await getIndexTokenBalance(wallet.address, position.indexTokenId);
                const actualTokensOwned = onChainBalance ? parseFloat(onChainBalance.balanceFormatted) : 0;
                console.log(`🔍 Position ${position.indexTokenId}: DB=${position.tokensOwned}, OnChain=${actualTokensOwned}`);
                // If on-chain balance is zero or very small, clean up the position
                if (actualTokensOwned < 0.000001) {
                    console.log(`🧽 Cleaning up stale position ${position.id} - on-chain balance: ${actualTokensOwned}`);
                    const { deleteIndexPosition } = await Promise.resolve().then(() => __importStar(require('../../lib/database')));
                    deleteIndexPosition(position.id);
                    continue; // Skip adding this position to results
                }
                // Use on-chain balance if it differs significantly from database
                const tokensToUse = Math.abs(actualTokensOwned - position.tokensOwned) > 0.001 ? actualTokensOwned : position.tokensOwned;
                const priceData = await getTokenPrice(tokenData.contractAddress, tokenData.symbol);
                const currentValue = tokensToUse * priceData.price;
                // Update position in database with corrected tokens owned and current value
                (0, database_1.updateIndexPositionValue)(position.id, tokensToUse, currentValue
                // Don't update average buy price - that stays historical
                );
                // Add to results with updated current value and corrected tokens owned
                updatedPositions.push({
                    ...position,
                    tokensOwned: tokensToUse,
                    currentValue,
                    symbol: tokenData.symbol,
                    name: tokenData.name,
                    contractAddress: tokenData.contractAddress,
                    category: tokenData.category,
                    riskLevel: tokenData.riskLevel,
                    firstPurchaseAt: new Date(position.firstPurchaseAt),
                    lastUpdatedAt: new Date(position.lastUpdatedAt)
                });
                // Small delay between price API calls
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            catch (positionError) {
                console.error(`❌ Error updating position ${position.id}:`, positionError);
                // Include position with stale data rather than excluding it
                updatedPositions.push({
                    ...position,
                    firstPurchaseAt: new Date(position.firstPurchaseAt),
                    lastUpdatedAt: new Date(position.lastUpdatedAt)
                });
            }
        }
        // Sort by current value (highest first)
        updatedPositions.sort((a, b) => b.currentValue - a.currentValue);
        console.log(`✅ Retrieved ${updatedPositions.length} index positions`);
        return updatedPositions;
    }
    catch (error) {
        console.error(`❌ Error getting user index positions:`, error);
        return [];
    }
}
/**
 * Calculate portfolio statistics for a user
 * @param userId User ID
 * @returns Portfolio statistics
 */
async function calculateIndexPortfolioStats(userId) {
    try {
        const positions = await getUserIndexPositions(userId);
        if (positions.length === 0) {
            return {
                totalValue: 0,
                totalInvested: 0,
                totalPnL: 0,
                positionCount: 0
            };
        }
        // Only include positions with actual token holdings for P&L calculation
        const activePositions = positions.filter(pos => pos.tokensOwned > 0.000001);
        const totalValue = activePositions.reduce((sum, pos) => sum + pos.currentValue, 0);
        const totalInvested = activePositions.reduce((sum, pos) => sum + pos.totalInvested, 0);
        const totalPnL = totalValue - totalInvested;
        console.log(`📊 Portfolio Stats: ${activePositions.length} active positions, $${totalValue.toFixed(2)} value, $${totalInvested.toFixed(2)} invested, $${totalPnL.toFixed(2)} P&L`);
        return {
            totalValue,
            totalInvested,
            totalPnL,
            positionCount: activePositions.length
        };
    }
    catch (error) {
        console.error(`❌ Error calculating portfolio stats:`, error);
        return {
            totalValue: 0,
            totalInvested: 0,
            totalPnL: 0,
            positionCount: 0
        };
    }
}
/**
 * Get price for an index token (with caching)
 * @param tokenAddress Token contract address
 * @param symbol Token symbol for fallback pricing
 * @returns Price data with 24h change if available
 */
async function getTokenPrice(tokenAddress, symbol) {
    const cacheKey = tokenAddress.toString();
    const now = Date.now();
    // Check cache first
    const cached = priceCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < index_constants_1.TIME_CONSTANTS.PRICE_CACHE_DURATION) {
        return { price: cached.price, change24h: cached.change24h };
    }
    try {
        // For LCAP token, prioritize Reserve Protocol API for consistency with sell quotes
        let priceData = await getPriceFromReserveProtocol(tokenAddress);
        if (!priceData) {
            priceData = await getPriceFromCoingecko(tokenAddress, symbol);
        }
        if (!priceData) {
            priceData = await getPriceFromDeFiLlama(tokenAddress);
        }
        if (!priceData) {
            // Fallback to a reasonable default price for testing
            console.warn(`⚠️ Could not fetch price for ${symbol}, using fallback`);
            priceData = { price: 10.0 }; // $10 fallback for LCAP
        }
        // Cache the result
        priceCache.set(cacheKey, {
            ...priceData,
            timestamp: now
        });
        return priceData;
    }
    catch (error) {
        console.error(`❌ Error fetching price for ${symbol}:`, error);
        // Return cached data even if expired, or fallback
        if (cached) {
            return { price: cached.price, change24h: cached.change24h };
        }
        return { price: 10.0 }; // Final fallback
    }
}
/**
 * Get token price from CoinGecko API
 * @param tokenAddress Token contract address
 * @param symbol Token symbol
 * @returns Price data or null
 */
async function getPriceFromCoingecko(tokenAddress, symbol) {
    try {
        // Note: For now we'll use a mock response since LCAP might not be on CoinGecko yet
        // In production, you'd make an actual API call here
        // LCAP pricing is now handled by Reserve Protocol API for consistency
        // For other tokens, you would make actual API calls:
        /*
        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${tokenAddress}&vs_currencies=usd&include_24hr_change=true`,
          { signal: AbortSignal.timeout(10000) }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        const tokenData = data[tokenAddress.toLowerCase()];
        
        if (!tokenData) return null;
        
        return {
          price: tokenData.usd,
          change24h: tokenData.usd_24h_change
        };
        */
        return null; // For now, fall through to other sources
    }
    catch (error) {
        console.error('Error fetching from CoinGecko:', error);
        return null;
    }
}
/**
 * Get token price from Reserve Protocol API for LCAP token
 * This ensures pricing consistency with sell quotes
 * @param tokenAddress Token contract address
 * @returns Price data or null
 */
async function getPriceFromReserveProtocol(tokenAddress) {
    try {
        // Check if this is the LCAP token
        const isLCAP = tokenAddress.toString().toLowerCase() === '0x4da9a0f397db1397902070f93a4d6ddbc0e0e6e8';
        if (!isLCAP) {
            return null; // Only handle LCAP through Reserve Protocol
        }
        // Get a small quote (1 LCAP token = 10^18 wei) to determine current price
        // We'll quote LCAP → USDC to get the USD value
        const oneTokenInWei = '1000000000000000000'; // 1 LCAP
        const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
        const params = new URLSearchParams({
            chainId: '8453', // Base chain ID
            tokenIn: tokenAddress.toString(),
            tokenOut: usdcAddress,
            amountIn: oneTokenInWei,
            slippage: '100', // 1% slippage
            signer: '0x0000000000000000000000000000000000000001' // Dummy signer for quote only
        });
        console.log(`📊 Fetching LCAP price via Reserve Protocol...`);
        const response = await fetch(`https://api.reserve.org/odos/swap?${params}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Origin': 'https://app.reserve.org',
                'Referer': 'https://app.reserve.org/'
            },
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            console.warn(`⚠️ Reserve Protocol API error: ${response.status}`);
            return null;
        }
        const responseData = await response.json();
        if (responseData.status === 'success') {
            const result = responseData.result;
            // Calculate price: amountOut (USDC with 6 decimals) / amountIn (LCAP with 18 decimals)
            const usdcOut = parseFloat(result.amountOut) / 1e6; // USDC has 6 decimals
            const lcapIn = parseFloat(result.amountIn) / 1e18; // LCAP has 18 decimals
            const price = usdcOut / lcapIn;
            console.log(`✅ LCAP price from Reserve Protocol: $${price.toFixed(4)}`);
            console.log(`   Quote: ${lcapIn} LCAP → ${usdcOut} USDC`);
            return {
                price: price,
                change24h: undefined // Reserve Protocol doesn't provide 24h change
            };
        }
        console.warn(`⚠️ Reserve Protocol returned error:`, responseData.error);
        return null;
    }
    catch (error) {
        console.error('Error fetching from Reserve Protocol:', error);
        return null;
    }
}
/**
 * Get token price from DeFiLlama API
 * @param tokenAddress Token contract address
 * @returns Price data or null
 */
async function getPriceFromDeFiLlama(tokenAddress) {
    try {
        // Mock implementation - in production you'd call DeFiLlama
        // Example for actual implementation:
        /*
        const response = await fetch(
          `https://coins.llama.fi/prices/current/base:${tokenAddress}`,
          { signal: AbortSignal.timeout(10000) }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        const priceData = data.coins[`base:${tokenAddress}`];
        
        if (!priceData) return null;
        
        return {
          price: priceData.price,
          change24h: undefined // DeFiLlama doesn't always provide 24h change
        };
        */
        return null; // For now, return null to fall through
    }
    catch (error) {
        console.error('Error fetching from DeFiLlama:', error);
        return null;
    }
}
/**
 * Refresh all position values for a user (useful for periodic updates)
 * @param userId User ID
 * @returns Number of positions updated
 */
async function refreshUserPositionValues(userId) {
    try {
        console.log(`🔄 Refreshing position values for user ${userId}`);
        const positions = (0, database_1.getIndexPositionsByUserId)(userId);
        let updatedCount = 0;
        for (const position of positions) {
            try {
                const tokenData = (0, database_1.getIndexTokenById)(position.indexTokenId);
                if (!tokenData)
                    continue;
                const priceData = await getTokenPrice(tokenData.contractAddress, tokenData.symbol);
                const newCurrentValue = position.tokensOwned * priceData.price;
                // Only update if value changed significantly (more than 1 cent difference)
                if (Math.abs(newCurrentValue - position.currentValue) > 0.01) {
                    (0, database_1.updateIndexPositionValue)(position.id, position.tokensOwned, newCurrentValue);
                    updatedCount++;
                }
                // Rate limit API calls
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            catch (positionError) {
                console.error(`Error refreshing position ${position.id}:`, positionError);
            }
        }
        console.log(`✅ Refreshed ${updatedCount} position values`);
        return updatedCount;
    }
    catch (error) {
        console.error('❌ Error refreshing position values:', error);
        return 0;
    }
}
/**
 * Clear price cache (useful for testing or forced refresh)
 */
function clearPriceCache() {
    priceCache.clear();
    console.log('✅ Price cache cleared');
}
/**
 * Get price cache statistics
 * @returns Cache statistics
 */
function getPriceCacheStats() {
    const now = Date.now();
    let oldest = now;
    let newest = 0;
    for (const entry of priceCache.values()) {
        if (entry.timestamp < oldest)
            oldest = entry.timestamp;
        if (entry.timestamp > newest)
            newest = entry.timestamp;
    }
    return {
        size: priceCache.size,
        oldestEntry: priceCache.size > 0 ? oldest : undefined,
        newestEntry: priceCache.size > 0 ? newest : undefined
    };
}
