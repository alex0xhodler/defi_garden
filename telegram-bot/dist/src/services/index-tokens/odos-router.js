"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOdosQuote = getOdosQuote;
exports.buildSwapCalldata = buildSwapCalldata;
exports.getMultipleQuotes = getMultipleQuotes;
exports.getSwapGasEstimate = getSwapGasEstimate;
exports.checkSwapFeasibility = checkSwapFeasibility;
exports.resetRateLimit = resetRateLimit;
exports.getRateLimitStatus = getRateLimitStatus;
const index_constants_1 = require("../../utils/index-constants");
// Rate limiting tracking
let requestCount = 0;
let lastResetTime = Date.now();
/**
 * Get quote from Reserve Protocol's ODOS wrapper for LCAP token swaps
 * This uses Reserve Protocol's custom API that wraps ODOS functionality
 *
 * @param inputToken Input token address
 * @param outputToken Output token address
 * @param inputAmount Input amount in wei
 * @param userAddress User's wallet address
 * @param slippage Slippage tolerance (default 1.0%)
 * @returns Quote result with success/error status
 */
async function getOdosQuote(inputToken, outputToken, inputAmount, userAddress, slippage = index_constants_1.ODOS_CONFIG.DEFAULT_SLIPPAGE) {
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
        if (slippage < 0.1 || slippage > index_constants_1.ODOS_CONFIG.MAX_SLIPPAGE) {
            return {
                success: false,
                error: `Invalid slippage: ${slippage}%. Must be between 0.1% and ${index_constants_1.ODOS_CONFIG.MAX_SLIPPAGE}%`
            };
        }
        console.log(`📋 Getting Reserve Protocol quote: ${inputAmount} ${inputToken} → ${outputToken}`);
        console.log(`👤 User: ${userAddress}, Slippage: ${slippage}%`);
        // Use Reserve Protocol API for LCAP token (0x4da9a0f397db1397902070f93a4d6ddbc0e0e6e8)
        // Check both input and output tokens for LCAP
        const isLCAP = inputToken.toLowerCase() === '0x4da9a0f397db1397902070f93a4d6ddbc0e0e6e8' ||
            outputToken.toLowerCase() === '0x4da9a0f397db1397902070f93a4d6ddbc0e0e6e8';
        let response;
        if (isLCAP) {
            // Use Reserve Protocol's ODOS wrapper API
            const params = new URLSearchParams({
                chainId: '8453', // Base chain ID
                tokenIn: inputToken,
                tokenOut: outputToken,
                amountIn: inputAmount.toString(),
                slippage: (slippage * 100).toString(), // Convert 1.0% to 100 basis points
                signer: userAddress
            });
            console.log(`🔗 Using Reserve Protocol API with params:`, params.toString());
            response = await fetch(`https://api.reserve.org/odos/swap?${params}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Origin': 'https://app.reserve.org',
                    'Referer': 'https://app.reserve.org/'
                },
                signal: AbortSignal.timeout(index_constants_1.ODOS_CONFIG.REQUEST_TIMEOUT_MS)
            });
        }
        else {
            // Use standard ODOS API for other tokens
            const quoteRequest = {
                inputTokens: [{
                        tokenAddress: inputToken,
                        amount: inputAmount.toString()
                    }],
                outputTokens: [{
                        tokenAddress: outputToken,
                        proportion: 1
                    }],
                userAddr: userAddress,
                slippageLimitPercent: slippage,
                sourceBlacklist: [],
                sourceWhitelist: []
            };
            response = await fetch(`${index_constants_1.ODOS_CONFIG.API_BASE_URL}${index_constants_1.ODOS_CONFIG.QUOTE_ENDPOINT}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(quoteRequest),
                signal: AbortSignal.timeout(index_constants_1.ODOS_CONFIG.REQUEST_TIMEOUT_MS)
            });
        }
        // Increment request counter
        requestCount++;
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Odos API error (${response.status}):`, errorText);
            // Handle specific error cases
            if (response.status === 400) {
                return { success: false, error: index_constants_1.INDEX_ERRORS.INVALID_AMOUNT };
            }
            else if (response.status === 429) {
                return { success: false, error: 'API rate limit exceeded. Please try again later.' };
            }
            else if (response.status >= 500) {
                return { success: false, error: 'Odos service temporarily unavailable. Please try again.' };
            }
            else {
                return { success: false, error: index_constants_1.INDEX_ERRORS.ODOS_API_ERROR };
            }
        }
        const responseData = await response.json();
        let quoteData;
        if (isLCAP && responseData.status === 'success') {
            // Convert Reserve Protocol response to ODOS format
            const result = responseData.result;
            console.log(`✅ Reserve Protocol response received:`);
            console.log(`   Token In: ${result.tokenIn}`);
            console.log(`   Amount In: ${result.amountIn}`);
            console.log(`   Token Out: ${result.tokenOut}`);
            console.log(`   Amount Out: ${result.amountOut}`);
            console.log(`   Price Impact: ${result.priceImpact}%`);
            console.log(`   Gas Estimate: ${result.gas}`);
            // Convert to ODOS-compatible format
            quoteData = {
                inTokens: [{
                        tokenAddress: result.tokenIn,
                        amount: result.amountIn
                    }],
                outTokens: [{
                        tokenAddress: result.tokenOut,
                        amount: result.amountOut
                    }],
                inAmounts: [result.amountIn],
                outAmounts: [result.amountOut],
                gasEstimate: parseInt(result.gas),
                dataGasEstimate: 0,
                gweiPerGas: 0,
                gasEstimateValue: 0,
                inValues: [result.amountInValue],
                outValues: [result.amountOutValue],
                netOutValue: result.amountOutValue,
                priceImpact: result.priceImpact,
                percentDiff: 0,
                partnerFeePercent: 0,
                pathId: 'reserve-protocol',
                pathViz: null,
                blockNumber: 0,
                transaction: {
                    to: result.tx.to,
                    value: result.tx.value,
                    data: result.tx.data,
                    gas: result.tx.gas,
                    gasPrice: result.tx.gasPrice.toString()
                }
            };
        }
        else {
            // Standard ODOS response
            quoteData = responseData;
        }
        // Validate response
        if (!quoteData.outAmounts || quoteData.outAmounts.length === 0) {
            return { success: false, error: index_constants_1.INDEX_ERRORS.NO_LIQUIDITY };
        }
        // Check if output amount is reasonable (not zero)
        const outputAmount = BigInt(quoteData.outAmounts[0]);
        if (outputAmount === 0n) {
            return { success: false, error: index_constants_1.INDEX_ERRORS.NO_LIQUIDITY };
        }
        // Log final quote details
        console.log(`✅ Quote processed successfully:`);
        console.log(`   Input: ${inputAmount} → Output: ${outputAmount}`);
        console.log(`   Price Impact: ${quoteData.priceImpact}%`);
        console.log(`   Gas Estimate: ${quoteData.gasEstimate}`);
        // Validate price impact
        if (quoteData.priceImpact > 10.0) { // 10% maximum price impact
            return {
                success: false,
                error: `${index_constants_1.INDEX_ERRORS.SLIPPAGE_TOO_HIGH} Price impact: ${quoteData.priceImpact.toFixed(2)}%`
            };
        }
        return { success: true, quote: quoteData };
    }
    catch (error) {
        console.error('❌ Error getting Odos quote:', error);
        if (error.name === 'AbortError') {
            return { success: false, error: 'Request timeout. Please try again.' };
        }
        else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return { success: false, error: index_constants_1.INDEX_ERRORS.NETWORK_ERROR };
        }
        else {
            return {
                success: false,
                error: error.message || index_constants_1.INDEX_ERRORS.ODOS_API_ERROR
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
async function buildSwapCalldata(inputToken, outputToken, inputAmount, userAddress, slippage = index_constants_1.ODOS_CONFIG.DEFAULT_SLIPPAGE) {
    try {
        // First get the quote
        const quoteResult = await getOdosQuote(inputToken, outputToken, inputAmount, userAddress, slippage);
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
    }
    catch (error) {
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
async function getMultipleQuotes(inputToken, outputToken, inputAmount, userAddress, slippageOptions = [1.0, 2.0, 3.0]) {
    const quotes = [];
    for (const slippage of slippageOptions) {
        const result = await getOdosQuote(inputToken, outputToken, inputAmount, userAddress, slippage);
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
async function getSwapGasEstimate(inputToken, outputToken, inputAmount, userAddress) {
    try {
        const quoteResult = await getOdosQuote(inputToken, outputToken, inputAmount, userAddress);
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
    }
    catch (error) {
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
async function checkSwapFeasibility(inputToken, outputToken, inputAmount, userAddress) {
    try {
        const quoteResult = await getOdosQuote(inputToken, outputToken, inputAmount, userAddress, 1.0 // Low slippage for feasibility check
        );
        if (!quoteResult.success || !quoteResult.quote) {
            return {
                feasible: false,
                error: quoteResult.error,
                reasons: ['Failed to get quote']
            };
        }
        const quote = quoteResult.quote;
        const reasons = [];
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
    }
    catch (error) {
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
function checkRateLimit() {
    const now = Date.now();
    const timeElapsed = now - lastResetTime;
    // Reset counter every minute
    if (timeElapsed >= 60000) {
        requestCount = 0;
        lastResetTime = now;
        return { allowed: true };
    }
    // Check if we've exceeded the limit
    if (requestCount >= index_constants_1.ODOS_CONFIG.MAX_REQUESTS_PER_MINUTE) {
        const waitTime = 60000 - timeElapsed;
        return { allowed: false, waitTimeMs: waitTime };
    }
    return { allowed: true };
}
/**
 * Reset rate limiting counter (for testing or manual reset)
 */
function resetRateLimit() {
    requestCount = 0;
    lastResetTime = Date.now();
}
/**
 * Get current rate limiting status
 * @returns Current request count and time until reset
 */
function getRateLimitStatus() {
    const now = Date.now();
    const timeElapsed = now - lastResetTime;
    const timeUntilReset = Math.max(0, 60000 - timeElapsed);
    return {
        requestCount,
        maxRequests: index_constants_1.ODOS_CONFIG.MAX_REQUESTS_PER_MINUTE,
        timeUntilResetMs: timeUntilReset
    };
}
