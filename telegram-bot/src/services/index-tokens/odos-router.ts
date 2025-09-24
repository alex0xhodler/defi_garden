import { Address } from 'viem';
import { 
  OdosQuoteRequest, 
  OdosQuoteResponse 
} from '../../types/index-tokens';
import { 
  ODOS_CONFIG, 
  INDEX_ERRORS 
} from '../../utils/index-constants';

// Rate limiting tracking
let requestCount = 0;
let lastResetTime = Date.now();

/**
 * Get quote from Odos Router for token swaps
 * @param inputToken Input token address
 * @param outputToken Output token address  
 * @param inputAmount Input amount in wei
 * @param userAddress User's wallet address
 * @param slippage Slippage tolerance (default 1.0%)
 * @returns Quote result with success/error status
 */
export async function getOdosQuote(
  inputToken: Address,
  outputToken: Address,
  inputAmount: bigint,
  userAddress: Address,
  slippage: number = ODOS_CONFIG.DEFAULT_SLIPPAGE
): Promise<{ success: boolean; quote?: OdosQuoteResponse; error?: string }> {
  try {
    // Check rate limiting
    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.allowed) {
      return { 
        success: false, 
        error: `Rate limit exceeded. Please wait ${rateLimitCheck.waitTimeMs}ms` 
      };
    }

    // Validate slippage
    if (slippage < 0.1 || slippage > ODOS_CONFIG.MAX_SLIPPAGE) {
      return {
        success: false,
        error: `Invalid slippage: ${slippage}%. Must be between 0.1% and ${ODOS_CONFIG.MAX_SLIPPAGE}%`
      };
    }

    console.log(`📋 Getting Odos quote: ${inputAmount} ${inputToken} → ${outputToken}`);
    console.log(`👤 User: ${userAddress}, Slippage: ${slippage}%`);

    // Prepare quote request
    const quoteRequest: OdosQuoteRequest = {
      inputTokens: [{
        tokenAddress: inputToken,
        amount: inputAmount.toString()
      }],
      outputTokens: [{
        tokenAddress: outputToken,
        proportion: 1 // 100% to output token
      }],
      userAddr: userAddress,
      slippageLimitPercent: slippage,
      sourceBlacklist: [], // Could add problematic DEXs here
      sourceWhitelist: [] // Could restrict to specific DEXs here
    };

    // Make API request
    const response = await fetch(`${ODOS_CONFIG.API_BASE_URL}${ODOS_CONFIG.QUOTE_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(quoteRequest),
      signal: AbortSignal.timeout(ODOS_CONFIG.REQUEST_TIMEOUT_MS)
    });

    // Increment request counter
    requestCount++;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Odos API error (${response.status}):`, errorText);
      
      // Handle specific error cases
      if (response.status === 400) {
        return { success: false, error: INDEX_ERRORS.INVALID_AMOUNT };
      } else if (response.status === 429) {
        return { success: false, error: 'API rate limit exceeded. Please try again later.' };
      } else if (response.status >= 500) {
        return { success: false, error: 'Odos service temporarily unavailable. Please try again.' };
      } else {
        return { success: false, error: INDEX_ERRORS.ODOS_API_ERROR };
      }
    }

    const quoteData: OdosQuoteResponse = await response.json();
    
    // Validate response
    if (!quoteData.outAmounts || quoteData.outAmounts.length === 0) {
      return { success: false, error: INDEX_ERRORS.NO_LIQUIDITY };
    }

    // Check if output amount is reasonable (not zero)
    const outputAmount = BigInt(quoteData.outAmounts[0]);
    if (outputAmount === 0n) {
      return { success: false, error: INDEX_ERRORS.NO_LIQUIDITY };
    }

    // Log quote details
    console.log(`✅ Odos quote received:`);
    console.log(`   Input: ${inputAmount} → Output: ${outputAmount}`);
    console.log(`   Price Impact: ${quoteData.priceImpact}%`);
    console.log(`   Gas Estimate: ${quoteData.gasEstimate}`);

    // Validate price impact
    if (quoteData.priceImpact > 10.0) { // 10% maximum price impact
      return { 
        success: false, 
        error: `${INDEX_ERRORS.SLIPPAGE_TOO_HIGH} Price impact: ${quoteData.priceImpact.toFixed(2)}%` 
      };
    }

    return { success: true, quote: quoteData };

  } catch (error: any) {
    console.error('❌ Error getting Odos quote:', error);
    
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timeout. Please try again.' };
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return { success: false, error: INDEX_ERRORS.NETWORK_ERROR };
    } else {
      return { 
        success: false, 
        error: error.message || INDEX_ERRORS.ODOS_API_ERROR 
      };
    }
  }
}

/**
 * Build swap calldata for direct execution (alternative to using quote transaction)
 * @param inputToken Input token address
 * @param outputToken Output token address
 * @param inputAmount Input amount in wei
 * @param userAddress User's wallet address
 * @param slippage Slippage tolerance
 * @returns Swap calldata
 */
export async function buildSwapCalldata(
  inputToken: Address,
  outputToken: Address,
  inputAmount: bigint,
  userAddress: Address,
  slippage: number = ODOS_CONFIG.DEFAULT_SLIPPAGE
): Promise<{ success: boolean; calldata?: `0x${string}`; target?: Address; error?: string }> {
  try {
    // First get the quote
    const quoteResult = await getOdosQuote(
      inputToken,
      outputToken,
      inputAmount,
      userAddress,
      slippage
    );

    if (!quoteResult.success || !quoteResult.quote) {
      return { 
        success: false, 
        error: quoteResult.error || 'Failed to get quote' 
      };
    }

    const quote = quoteResult.quote;

    // Extract calldata and target from quote response
    return {
      success: true,
      calldata: quote.transaction.data,
      target: quote.transaction.to
    };

  } catch (error: any) {
    console.error('❌ Error building swap calldata:', error);
    return {
      success: false,
      error: error.message || 'Failed to build swap calldata'
    };
  }
}

/**
 * Get multiple quotes for comparison (useful for finding best price)
 * @param inputToken Input token address
 * @param outputToken Output token address
 * @param inputAmount Input amount in wei
 * @param userAddress User's wallet address
 * @param slippageOptions Array of slippage values to try
 * @returns Array of quote results
 */
export async function getMultipleQuotes(
  inputToken: Address,
  outputToken: Address,
  inputAmount: bigint,
  userAddress: Address,
  slippageOptions: number[] = [1.0, 2.0, 3.0]
): Promise<Array<{ slippage: number; result: { success: boolean; quote?: OdosQuoteResponse; error?: string } }>> {
  const quotes = [];

  for (const slippage of slippageOptions) {
    const result = await getOdosQuote(
      inputToken,
      outputToken,
      inputAmount,
      userAddress,
      slippage
    );
    
    quotes.push({ slippage, result });
    
    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return quotes;
}

/**
 * Get estimated gas cost for a swap
 * @param inputToken Input token address
 * @param outputToken Output token address
 * @param inputAmount Input amount in wei
 * @param userAddress User's wallet address
 * @returns Estimated gas cost in ETH
 */
export async function getSwapGasEstimate(
  inputToken: Address,
  outputToken: Address,
  inputAmount: bigint,
  userAddress: Address
): Promise<{ success: boolean; gasEstimate?: number; gasCostEth?: string; error?: string }> {
  try {
    const quoteResult = await getOdosQuote(
      inputToken,
      outputToken,
      inputAmount,
      userAddress
    );

    if (!quoteResult.success || !quoteResult.quote) {
      return { 
        success: false, 
        error: quoteResult.error || 'Failed to get gas estimate' 
      };
    }

    const quote = quoteResult.quote;
    const gasCostEth = (quote.gasEstimate * quote.gweiPerGas / 1e9).toFixed(8);

    return {
      success: true,
      gasEstimate: quote.gasEstimate,
      gasCostEth: gasCostEth
    };

  } catch (error: any) {
    console.error('❌ Error getting gas estimate:', error);
    return {
      success: false,
      error: error.message || 'Failed to get gas estimate'
    };
  }
}

/**
 * Check if swap is feasible (has reasonable price impact and liquidity)
 * @param inputToken Input token address
 * @param outputToken Output token address
 * @param inputAmount Input amount in wei
 * @param userAddress User's wallet address
 * @returns Feasibility check result
 */
export async function checkSwapFeasibility(
  inputToken: Address,
  outputToken: Address,
  inputAmount: bigint,
  userAddress: Address
): Promise<{ 
  feasible: boolean; 
  priceImpact?: number; 
  outputAmount?: string;
  reasons?: string[];
  error?: string; 
}> {
  try {
    const quoteResult = await getOdosQuote(
      inputToken,
      outputToken,
      inputAmount,
      userAddress,
      1.0 // Low slippage for feasibility check
    );

    if (!quoteResult.success || !quoteResult.quote) {
      return { 
        feasible: false, 
        error: quoteResult.error,
        reasons: ['Failed to get quote']
      };
    }

    const quote = quoteResult.quote;
    const reasons: string[] = [];
    let feasible = true;

    // Check price impact
    if (quote.priceImpact > 5.0) {
      feasible = false;
      reasons.push(`High price impact: ${quote.priceImpact.toFixed(2)}%`);
    }

    // Check output amount
    const outputAmount = BigInt(quote.outAmounts[0]);
    if (outputAmount === 0n) {
      feasible = false;
      reasons.push('No output tokens available');
    }

    // Check gas cost reasonableness (on Base, should be very low)
    const gasCostEth = quote.gasEstimate * quote.gweiPerGas / 1e9;
    if (gasCostEth > 0.01) { // More than 0.01 ETH seems high for Base
      reasons.push(`High gas cost: ${gasCostEth.toFixed(6)} ETH`);
      // Don't mark as unfeasible, just warn
    }

    return {
      feasible,
      priceImpact: quote.priceImpact,
      outputAmount: quote.outAmounts[0],
      reasons: reasons.length > 0 ? reasons : undefined
    };

  } catch (error: any) {
    console.error('❌ Error checking swap feasibility:', error);
    return {
      feasible: false,
      error: error.message || 'Failed to check feasibility',
      reasons: ['API error']
    };
  }
}

/**
 * Rate limiting check
 * @returns Whether request is allowed and wait time if not
 */
function checkRateLimit(): { allowed: boolean; waitTimeMs?: number } {
  const now = Date.now();
  const timeElapsed = now - lastResetTime;

  // Reset counter every minute
  if (timeElapsed >= 60000) {
    requestCount = 0;
    lastResetTime = now;
    return { allowed: true };
  }

  // Check if we've exceeded the limit
  if (requestCount >= ODOS_CONFIG.MAX_REQUESTS_PER_MINUTE) {
    const waitTime = 60000 - timeElapsed;
    return { allowed: false, waitTimeMs: waitTime };
  }

  return { allowed: true };
}

/**
 * Reset rate limiting counter (for testing or manual reset)
 */
export function resetRateLimit(): void {
  requestCount = 0;
  lastResetTime = Date.now();
}

/**
 * Get current rate limiting status
 * @returns Current request count and time until reset
 */
export function getRateLimitStatus(): { 
  requestCount: number; 
  maxRequests: number; 
  timeUntilResetMs: number; 
} {
  const now = Date.now();
  const timeElapsed = now - lastResetTime;
  const timeUntilReset = Math.max(0, 60000 - timeElapsed);

  return {
    requestCount,
    maxRequests: ODOS_CONFIG.MAX_REQUESTS_PER_MINUTE,
    timeUntilResetMs: timeUntilReset
  };
}