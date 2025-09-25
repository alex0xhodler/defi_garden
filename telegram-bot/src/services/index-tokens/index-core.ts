import { Address, parseUnits } from 'viem';
import { getCoinbaseSmartWallet, createSponsoredBundlerClient, hasCoinbaseSmartWallet } from '../../lib/coinbase-wallet';
import { getWallet } from '../../lib/token-wallet';
import { 
  saveIndexPosition, 
  saveIndexTransaction, 
  getIndexPositionByUserAndToken,
  updateIndexPositionValue,
  getIndexTokenById 
} from '../../lib/database';
import { 
  IndexTransactionResult, 
  IndexToken, 
  IndexPosition 
} from '../../types/index-tokens';
import { 
  INDEX_CONTRACTS, 
  BASE_TOKENS,
  INDEX_ERRORS,
  INDEX_TRANSACTION_CONFIG 
} from '../../utils/index-constants';
import { getOdosQuote, buildSwapCalldata } from './odos-router';

/**
 * Buy index tokens using USDC via ODOS router
 * 
 * This function implements a gasless transaction flow using Coinbase Smart Account
 * with the ODOS DEX aggregator to swap USDC for index tokens with the best rates.
 * 
 * Transaction flow:
 * 1. Get Coinbase Smart Wallet for user
 * 2. Get ODOS quote for USDC → Index Token swap
 * 3. Execute transaction bundle with gasless sponsorship:
 *    - Approve USDC spending to ODOS Router
 *    - Execute swap via ODOS Router
 * 4. Track and save position in database
 * 
 * @param userId User ID for the transaction
 * @param indexTokenId The ID of the index token to purchase
 * @param usdcAmount Amount of USDC to spend (as string)
 * @returns Transaction result with success status
 */
export async function buyIndexToken(
  userId: string,
  indexTokenId: string,
  usdcAmount: string
): Promise<IndexTransactionResult> {
  try {
    // ========================================================================
    // STEP 1: VALIDATE INPUTS AND GET SMART WALLET
    // ========================================================================
    console.log(`🔄 Starting ODOS-powered index token purchase`);
    console.log(`   Amount: ${usdcAmount} USDC`);
    console.log(`   Token ID: ${indexTokenId}`);
    console.log(`   User: ${userId}`);

    // Validate USDC amount
    const amount = parseFloat(usdcAmount);
    if (amount < 1) {
      return { success: false, error: INDEX_ERRORS.INVALID_AMOUNT };
    }

    // Get index token metadata from database
    const indexToken = getIndexTokenById(indexTokenId);
    if (!indexToken) {
      return { success: false, error: INDEX_ERRORS.INVALID_INDEX_TOKEN };
    }

    console.log(`📊 Target Token: ${indexToken.symbol} (${indexToken.name})`);
    console.log(`   Contract: ${indexToken.contractAddress}`);
    console.log(`   Category: ${indexToken.category}`);
    console.log(`   Risk Level: ${indexToken.riskLevel}/10`);

    // Get user's Coinbase Smart Wallet
    const smartWallet = await getCoinbaseSmartWallet(userId);
    if (!smartWallet) {
      console.error(`❌ No Smart Wallet found for user ${userId}`);
      return { success: false, error: INDEX_ERRORS.NO_SMART_WALLET };
    }

    const walletAddress = smartWallet.smartAccount.address;
    console.log(`💼 Smart Wallet: ${walletAddress}`);
    console.log(`   Deployed: ${smartWallet.isDeployed}`);

    // ========================================================================
    // STEP 2: GET ODOS QUOTE
    // ========================================================================
    const usdcAmountWei = parseUnits(usdcAmount, 6); // USDC has 6 decimals
    console.log(`📋 Requesting ODOS quote...`);
    console.log(`   Input: ${usdcAmountWei} wei USDC (${usdcAmount})`);
    console.log(`   Output: ${indexToken.contractAddress} (${indexToken.symbol})`);
    
    const quoteResult = await getOdosQuote(
      BASE_TOKENS.USDC,
      indexToken.contractAddress as Address,
      usdcAmountWei,
      walletAddress
    );

    if (!quoteResult.success || !quoteResult.quote) {
      console.error('❌ ODOS quote request failed:', quoteResult.error);
      return {
        success: false,
        error: quoteResult.error || 'Unable to get price quote from ODOS. Please try again.'
      };
    }

    const quote = quoteResult.quote;
    console.log(`✅ ODOS Quote Received`);
    console.log(`   Path ID: ${quote.pathId}`);
    console.log(`   Gas Estimate: ${quote.gasEstimate}`);
    console.log(`   Price Impact: ${quote.priceImpact.toFixed(4)}%`);
    
    // Validate quote data
    if (!quote.outAmounts || quote.outAmounts.length === 0) {
      return { success: false, error: INDEX_ERRORS.NO_LIQUIDITY };
    }

    // Calculate expected tokens (assuming 18 decimals for index tokens)
    const expectedTokensWei = BigInt(quote.outAmounts[0]);
    const tokenDecimals = 18; // Standard for most ERC-20 tokens
    const tokensReceived = Number(expectedTokensWei) / Math.pow(10, tokenDecimals);
    const pricePerToken = amount / tokensReceived;

    console.log(`💰 Expected Output:`);
    console.log(`   Raw Wei: ${expectedTokensWei}`);
    console.log(`   Formatted: ${tokensReceived} ${indexToken.symbol}`);
    console.log(`   Price Per Token: $${pricePerToken.toFixed(6)}`);

    // Validate price impact
    if (quote.priceImpact > 10.0) {
      console.error(`❌ Price impact too high: ${quote.priceImpact}%`);
      return {
        success: false,
        error: `${INDEX_ERRORS.SLIPPAGE_TOO_HIGH} (${quote.priceImpact.toFixed(2)}%)`
      };
    }

    // ========================================================================
    // STEP 3: PREPARE GASLESS TRANSACTION BUNDLE
    // ========================================================================
    console.log(`🎨 Building gasless transaction bundle...`);
    
    // Create bundler client for gasless transactions
    const bundlerClient = await createSponsoredBundlerClient(
      smartWallet.smartAccount, 
      smartWallet.isDeployed
    );

    try {
      // Import required modules
      const { cdpPaymasterClient } = await import('../../lib/coinbase-wallet');
      const { erc20Abi } = await import('../../utils/abis');
      
      // Validate ODOS transaction data
      if (!quote.transaction.to || !quote.transaction.data) {
        console.error('❌ Invalid ODOS transaction data:', quote.transaction);
        return {
          success: false,
          error: 'Invalid transaction data from ODOS. Please try again.'
        };
      }
      
      console.log(`🔧 Transaction Details:`);
      console.log(`   ODOS Router: ${quote.transaction.to}`);
      console.log(`   Transaction Data: ${quote.transaction.data.slice(0, 20)}...`);
      console.log(`   Data Length: ${quote.transaction.data.length} chars`);
      console.log(`   ETH Value: ${quote.transaction.value || '0'}`);
      console.log(`   Approval Target: ${INDEX_CONTRACTS.ODOS_ROUTER_V3}`);
      console.log(`   Approval Amount: ${usdcAmountWei} USDC wei`);
      
      // Build transaction calls array matching your successful transaction pattern
      const calls = [
        // Call 1: Approve USDC spending to ODOS Router V3
        // This matches your first transaction: approve(spender, value)
        {
          abi: erc20Abi,
          functionName: 'approve',
          to: BASE_TOKENS.USDC, // USDC contract
          args: [
            INDEX_CONTRACTS.ODOS_ROUTER_V3, // spender (ODOS Router V3)
            usdcAmountWei // value to approve
          ]
        },
        // Call 2: Execute ODOS swap 
        // This matches your second transaction: swapCompact()
        {
          to: quote.transaction.to as Address, // ODOS Router V3
          data: quote.transaction.data as `0x${string}`, // swapCompact() calldata
          value: BigInt(quote.transaction.value || '0') // ETH value (usually 0)
        }
      ];
      
      console.log(`🍰 Transaction bundle prepared (${calls.length} calls)`);

      // ========================================================================
      // STEP 4: EXECUTE GASLESS TRANSACTION
      // ========================================================================
      console.log(`🚀 Executing gasless transaction bundle...`);
      console.log(`   Smart Account: ${smartWallet.smartAccount.address}`);
      console.log(`   Is Deployed: ${smartWallet.isDeployed}`);
      console.log(`   Bundler: Coinbase CDP`);
      console.log(`   Gas Sponsor: USDC paymaster`);
      
      // Configure optimized gas estimation
      smartWallet.smartAccount.userOperation = {
        estimateGas: async (userOperation: any) => {
          const estimate = await bundlerClient.estimateUserOperationGas(userOperation);
          // Add safety buffer based on ODOS complexity
          estimate.preVerificationGas = estimate.preVerificationGas * 3n / 2n; // +50%
          estimate.callGasLimit = estimate.callGasLimit * 130n / 100n; // +30% for ODOS
          estimate.verificationGasLimit = estimate.verificationGasLimit * 120n / 100n; // +20%
          
          console.log(`⛽ Gas Estimates:`);
          console.log(`   Pre-verification: ${estimate.preVerificationGas}`);
          console.log(`   Call Gas Limit: ${estimate.callGasLimit}`);
          console.log(`   Verification: ${estimate.verificationGasLimit}`);
          
          return estimate;
        },
      };
      
      // Execute the user operation with USDC gas sponsorship
      console.log(`📡 Sending UserOperation to bundler...`);
      const userOpHash = await bundlerClient.sendUserOperation({
        account: smartWallet.smartAccount,
        calls,
        paymaster: cdpPaymasterClient,
        paymasterContext: {
          erc20: BASE_TOKENS.USDC // Pay gas with USDC
        }
      });
      
      console.log(`✅ UserOperation submitted successfully`);
      console.log(`   UserOp Hash: ${userOpHash}`);
      console.log(`   Waiting for on-chain confirmation...`);
      
      // Wait for transaction to be mined and confirmed
      const startTime = Date.now();
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 120000 // 2 minute timeout for ODOS transactions
      });
      
      const executionTime = Date.now() - startTime;
      console.log(`⏱️ Transaction completed in ${executionTime}ms`);
      console.log(`   Status: ${receipt.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`   Block Number: ${receipt.receipt.blockNumber}`);
      console.log(`   Transaction Hash: ${receipt.receipt.transactionHash}`);
      console.log(`   Gas Used: ${receipt.receipt.gasUsed}`);
      
      if (!receipt.success) {
        console.error('❌ Transaction failed on-chain');
        console.error('   Receipt:', JSON.stringify(receipt, null, 2));
        return {
          success: false,
          error: 'ODOS swap transaction failed on-chain. Please try again.'
        };
      }

      // ========================================================================
      // STEP 5: SAVE TO DATABASE AND RETURN SUCCESS
      // ========================================================================
      console.log(`💾 Saving successful transaction to database...`);
      
      const txHash = receipt.receipt.transactionHash;
      const tokensReceivedString = tokensReceived.toString();
      
      try {
        // Check if user already has a position in this index token
        const existingPosition = getIndexPositionByUserAndToken(userId, indexTokenId);
        
        if (existingPosition) {
          // Update existing position
          console.log(`🔄 Updating existing position: ${existingPosition.id}`);
          
          const newTokensOwned = existingPosition.tokensOwned + tokensReceived;
          const newTotalInvested = existingPosition.totalInvested + amount;
          const newAverageBuyPrice = newTotalInvested / newTokensOwned;
          
          updateIndexPositionValue(
            existingPosition.id,
            newTokensOwned,
            newTotalInvested, // Current value will be updated by price feeds later
            newAverageBuyPrice
          );
          
          console.log(`✅ Position updated:`);
          console.log(`   New Tokens Owned: ${newTokensOwned}`);
          console.log(`   New Total Invested: $${newTotalInvested}`);
          console.log(`   New Avg Buy Price: $${newAverageBuyPrice.toFixed(6)}`);
        } else {
          // Create new position
          const positionId = `idx_${Date.now()}_${userId}`;
          console.log(`✨ Creating new position: ${positionId}`);
          
          saveIndexPosition({
            id: positionId,
            userId,
            indexTokenId,
            tokensOwned: tokensReceived,
            averageBuyPrice: pricePerToken,
            totalInvested: amount,
            currentValue: amount, // Initially equals investment
          });
          
          console.log(`✅ New position created:`);
          console.log(`   Position ID: ${positionId}`);
          console.log(`   Tokens Owned: ${tokensReceived}`);
          console.log(`   Buy Price: $${pricePerToken.toFixed(6)}`);
          console.log(`   Total Invested: $${amount}`);
        }
        
        // Save transaction record for history
        console.log(`📝 Saving transaction record...`);
        saveIndexTransaction(
          txHash,
          userId,
          indexTokenId,
          'buy',
          amount,
          tokensReceived,
          pricePerToken,
          'success'
        );
        
        console.log(`✅ Transaction record saved successfully`);
        
      } catch (dbError: any) {
        console.error('❌ Database save error:', dbError);
        // Don't fail the entire transaction for DB errors
        // The blockchain transaction succeeded, just log the error
      }
      
      // Log final success summary
      console.log(`🎉 INDEX TOKEN PURCHASE COMPLETED SUCCESSFULLY!`);
      console.log(`========================================`);
      console.log(`   User: ${userId}`);
      console.log(`   Token: ${indexToken.symbol} (${indexToken.name})`);
      console.log(`   Amount Invested: $${amount} USDC`);
      console.log(`   Tokens Received: ${tokensReceived} ${indexToken.symbol}`);
      console.log(`   Price per Token: $${pricePerToken.toFixed(6)}`);
      console.log(`   Transaction Hash: ${txHash}`);
      console.log(`   Gas Sponsored: Yes (✅ Gasless)`);
      console.log(`   Execution Time: ${executionTime}ms`);
      console.log(`========================================`);
      
      return {
        success: true,
        txHash,
        tokensReceived: tokensReceivedString,
        pricePerToken
      };

    } catch (txError: any) {
      // ========================================================================
      // TRANSACTION ERROR HANDLING
      // ========================================================================
      console.error('❌ TRANSACTION EXECUTION FAILED');
      console.error('========================================');
      console.error(`   User: ${userId}`);
      console.error(`   Token: ${indexTokenId}`);
      console.error(`   Amount: $${amount} USDC`);
      console.error(`   Error Type: ${txError.name || 'Unknown'}`);
      console.error(`   Error Message: ${txError.message || 'No message'}`);
      console.error(`   Error Code: ${txError.code || 'No code'}`);
      console.error('========================================');
      
      // Log full error for debugging
      if (txError.stack) {
        console.error('   Stack Trace:');
        console.error(txError.stack.split('\n').slice(0, 5).join('\n'));
      }
      
      // Save failed transaction record for tracking
      try {
        const failedTxHash = `failed_${Date.now()}_${userId}`;
        saveIndexTransaction(
          failedTxHash,
          userId,
          indexTokenId,
          'buy',
          amount,
          0, // No tokens received
          pricePerToken,
          'failed'
        );
        console.log(`📝 Failed transaction logged: ${failedTxHash}`);
      } catch (dbError) {
        console.error('❌ Failed to log failed transaction:', dbError);
      }
      
      // Return user-friendly error messages based on error type
      let userError: string = INDEX_ERRORS.TRANSACTION_FAILED;
      
      if (txError.message?.includes('insufficient')) {
        userError = INDEX_ERRORS.INSUFFICIENT_USDC;
      } else if (txError.message?.includes('slippage') || txError.message?.includes('price impact')) {
        userError = INDEX_ERRORS.SLIPPAGE_TOO_HIGH;
      } else if (txError.message?.includes('allowance') || txError.message?.includes('approve')) {
        userError = 'USDC approval failed. Please ensure the bot has permission to spend your USDC.';
      } else if (txError.message?.includes('timeout')) {
        userError = 'Transaction timeout. The network may be congested. Please try again.';
      } else if (txError.message?.includes('rejected')) {
        userError = 'Transaction was rejected. Please try again or contact support.';
      } else if (txError.message?.includes('gas')) {
        userError = 'Gas estimation failed. The transaction may not be feasible at this time.';
      } else if (txError.code === 'NETWORK_ERROR') {
        userError = INDEX_ERRORS.NETWORK_ERROR;
      }
      
      return {
        success: false,
        error: userError
      };
    }

  } catch (error: any) {
    console.error('❌ Error in buyIndexToken:', error);
    return {
      success: false,
      error: error.message || INDEX_ERRORS.TRANSACTION_FAILED
    };
  }
}

/**
 * Get user's total index portfolio value
 */
export async function getUserIndexPortfolioValue(userId: string): Promise<{
  totalValue: number;
  totalInvested: number;
  totalPnL: number;
  positionCount: number;
}> {
  return {
    totalValue: 0,
    totalInvested: 0,
    totalPnL: 0,
    positionCount: 0
  };
}