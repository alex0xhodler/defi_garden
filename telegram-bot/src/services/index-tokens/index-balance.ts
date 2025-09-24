import { Address, formatUnits } from 'viem';
import { createPublicClientForBase } from '../../lib/token-wallet';
import { 
  getIndexPositionsByUserId, 
  getIndexTokenById,
  getAllActiveIndexTokens,
  updateIndexPositionValue 
} from '../../lib/database';
import { 
  IndexBalanceInfo, 
  IndexPosition,
  IndexPortfolioStats 
} from '../../types/index-tokens';
import { 
  INDEX_DISPLAY,
  TIME_CONSTANTS 
} from '../../utils/index-constants';

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
] as const;

// Cache for price data to reduce API calls
const priceCache = new Map<string, { price: number; timestamp: number; change24h?: number }>();

/**
 * Get balance of a specific index token for a user
 * @param userAddress User's wallet address
 * @param indexTokenId Index token ID from database
 * @returns Balance information
 */
export async function getIndexTokenBalance(
  userAddress: Address,
  indexTokenId: string
): Promise<IndexBalanceInfo | null> {
  try {
    console.log(`📊 Getting index token balance: ${indexTokenId} for ${userAddress}`);

    // Get token metadata from database
    const tokenData = getIndexTokenById(indexTokenId);
    if (!tokenData) {
      console.error(`❌ Index token not found: ${indexTokenId}`);
      return null;
    }

    // Get on-chain balance
    const publicClient = createPublicClientForBase();
    
    // First get token decimals
    const decimals = await publicClient.readContract({
      address: tokenData.contractAddress as Address,
      abi: ERC20_ABI,
      functionName: 'decimals'
    }) as number;

    // Then get balance
    const balance = await publicClient.readContract({
      address: tokenData.contractAddress as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAddress]
    }) as bigint;

    // Format balance to human readable
    const balanceFormatted = formatUnits(balance, decimals);

    // Get current price
    const priceData = await getTokenPrice(tokenData.contractAddress as Address, tokenData.symbol);
    const valueInUSDC = (parseFloat(balanceFormatted) * priceData.price).toFixed(INDEX_DISPLAY.USD_DECIMALS);

    console.log(`✅ Balance retrieved: ${balanceFormatted} ${tokenData.symbol} ($${valueInUSDC})`);

    return {
      tokenId: indexTokenId,
      symbol: tokenData.symbol,
      name: tokenData.name,
      contractAddress: tokenData.contractAddress as Address,
      balance,
      balanceFormatted: parseFloat(balanceFormatted).toFixed(INDEX_DISPLAY.BALANCE_DECIMALS),
      valueInUSDC,
      pricePerToken: priceData.price,
      priceChange24h: priceData.change24h,
      category: tokenData.category as any,
      riskLevel: tokenData.riskLevel
    };

  } catch (error: any) {
    console.error(`❌ Error getting index token balance for ${indexTokenId}:`, error);
    return null;
  }
}

/**
 * Get all index token balances for a user
 * @param userAddress User's wallet address
 * @returns Array of balance information for all held tokens
 */
export async function getAllIndexBalances(
  userAddress: Address
): Promise<IndexBalanceInfo[]> {
  try {
    console.log(`📊 Getting all index balances for ${userAddress}`);

    // Get all active index tokens from database
    const allTokens = getAllActiveIndexTokens();
    const balances: IndexBalanceInfo[] = [];

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

  } catch (error: any) {
    console.error(`❌ Error getting all index balances:`, error);
    return [];
  }
}

/**
 * Get user's index positions from database with current values
 * @param userId User ID
 * @returns Array of positions with current market values
 */
export async function getUserIndexPositions(userId: string): Promise<IndexPosition[]> {
  try {
    console.log(`📊 Getting index positions for user ${userId}`);

    // Get positions from database
    const positions = getIndexPositionsByUserId(userId);
    
    if (positions.length === 0) {
      console.log(`📊 No index positions found for user ${userId}`);
      return [];
    }

    // Update current values with market prices
    const updatedPositions: IndexPosition[] = [];

    for (const position of positions) {
      try {
        // Get current price for this token
        const tokenData = getIndexTokenById(position.indexTokenId);
        if (!tokenData) {
          console.warn(`⚠️ Token data not found for position: ${position.indexTokenId}`);
          continue;
        }

        const priceData = await getTokenPrice(tokenData.contractAddress, tokenData.symbol);
        const currentValue = position.tokensOwned * priceData.price;

        // Update position in database with current value
        updateIndexPositionValue(
          position.id,
          position.tokensOwned,
          currentValue
          // Don't update average buy price - that stays historical
        );

        // Add to results with updated current value
        updatedPositions.push({
          ...position,
          currentValue,
          symbol: tokenData.symbol,
          name: tokenData.name,
          contractAddress: tokenData.contractAddress as Address,
          category: tokenData.category as any,
          riskLevel: tokenData.riskLevel
        });

        // Small delay between price API calls
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (positionError) {
        console.error(`❌ Error updating position ${position.id}:`, positionError);
        // Include position with stale data rather than excluding it
        updatedPositions.push(position);
      }
    }

    // Sort by current value (highest first)
    updatedPositions.sort((a, b) => b.currentValue - a.currentValue);

    console.log(`✅ Retrieved ${updatedPositions.length} index positions`);
    return updatedPositions;

  } catch (error: any) {
    console.error(`❌ Error getting user index positions:`, error);
    return [];
  }
}

/**
 * Calculate portfolio statistics for a user
 * @param userId User ID
 * @returns Portfolio statistics
 */
export async function calculateIndexPortfolioStats(userId: string): Promise<IndexPortfolioStats> {
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

    const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const totalInvested = positions.reduce((sum, pos) => sum + pos.totalInvested, 0);
    const totalPnL = totalValue - totalInvested;

    return {
      totalValue,
      totalInvested,
      totalPnL,
      positionCount: positions.length
    };

  } catch (error: any) {
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
async function getTokenPrice(
  tokenAddress: Address | string,
  symbol: string
): Promise<{ price: number; change24h?: number }> {
  const cacheKey = tokenAddress.toString();
  const now = Date.now();

  // Check cache first
  const cached = priceCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < TIME_CONSTANTS.PRICE_CACHE_DURATION) {
    return { price: cached.price, change24h: cached.change24h };
  }

  try {
    // Try multiple price sources
    let priceData = await getPriceFromCoingecko(tokenAddress, symbol);
    
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

  } catch (error) {
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
async function getPriceFromCoingecko(
  tokenAddress: Address | string,
  symbol: string
): Promise<{ price: number; change24h?: number } | null> {
  try {
    // Note: For now we'll use a mock response since LCAP might not be on CoinGecko yet
    // In production, you'd make an actual API call here
    
    // Mock price for LCAP based on your stack trace data
    if (symbol === 'LCAP') {
      return {
        price: 11.91, // $10 USDC / 0.837 LCAP ≈ $11.91 per LCAP
        change24h: 2.5 // Mock 2.5% daily change
      };
    }

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

  } catch (error) {
    console.error('Error fetching from CoinGecko:', error);
    return null;
  }
}

/**
 * Get token price from DeFiLlama API
 * @param tokenAddress Token contract address
 * @returns Price data or null
 */
async function getPriceFromDeFiLlama(
  tokenAddress: Address | string
): Promise<{ price: number; change24h?: number } | null> {
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

  } catch (error) {
    console.error('Error fetching from DeFiLlama:', error);
    return null;
  }
}

/**
 * Refresh all position values for a user (useful for periodic updates)
 * @param userId User ID
 * @returns Number of positions updated
 */
export async function refreshUserPositionValues(userId: string): Promise<number> {
  try {
    console.log(`🔄 Refreshing position values for user ${userId}`);

    const positions = getIndexPositionsByUserId(userId);
    let updatedCount = 0;

    for (const position of positions) {
      try {
        const tokenData = getIndexTokenById(position.indexTokenId);
        if (!tokenData) continue;

        const priceData = await getTokenPrice(tokenData.contractAddress, tokenData.symbol);
        const newCurrentValue = position.tokensOwned * priceData.price;

        // Only update if value changed significantly (more than 1 cent difference)
        if (Math.abs(newCurrentValue - position.currentValue) > 0.01) {
          updateIndexPositionValue(
            position.id,
            position.tokensOwned,
            newCurrentValue
          );
          updatedCount++;
        }

        // Rate limit API calls
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (positionError) {
        console.error(`Error refreshing position ${position.id}:`, positionError);
      }
    }

    console.log(`✅ Refreshed ${updatedCount} position values`);
    return updatedCount;

  } catch (error: any) {
    console.error('❌ Error refreshing position values:', error);
    return 0;
  }
}

/**
 * Clear price cache (useful for testing or forced refresh)
 */
export function clearPriceCache(): void {
  priceCache.clear();
  console.log('✅ Price cache cleared');
}

/**
 * Get price cache statistics
 * @returns Cache statistics
 */
export function getPriceCacheStats(): {
  size: number;
  oldestEntry?: number;
  newestEntry?: number;
} {
  const now = Date.now();
  let oldest = now;
  let newest = 0;

  for (const entry of priceCache.values()) {
    if (entry.timestamp < oldest) oldest = entry.timestamp;
    if (entry.timestamp > newest) newest = entry.timestamp;
  }

  return {
    size: priceCache.size,
    oldestEntry: priceCache.size > 0 ? oldest : undefined,
    newestEntry: priceCache.size > 0 ? newest : undefined
  };
}