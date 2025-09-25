import { Address, parseUnits } from 'viem';
import { getCoinbaseSmartWallet, createSponsoredBundlerClient } from '../../lib/coinbase-wallet';
import { 
  saveIndexTransaction, 
  getIndexPositionByUserAndToken,
  updateIndexPositionValue,
  getIndexTokenById 
} from '../../lib/database';
import { 
  IndexTransactionResult 
} from '../../types/index-tokens';
import { 
  INDEX_CONTRACTS, 
  BASE_TOKENS,
  INDEX_ERRORS 
} from '../../utils/index-constants';
import { getOdosQuote } from './odos-router';

/**
 * Sell index tokens for USDC via Reserve Protocol's ODOS wrapper
 * 
 * This function implements gasless selling of index tokens using the same
 * Reserve Protocol API and ODOS router pattern as buying.
 * 
 * Transaction flow:
 * 1. Get Coinbase Smart Wallet for user
 * 2. Get quote from Reserve Protocol API for Index Token → USDC swap
 * 3. Execute gasless transaction (approval + swap) - APPROVAL IS NEEDED!
 * 4. Update position in database
 * 
 * @param userId User ID for the transaction
 * @param indexTokenId The ID of the index token to sell
 * @param tokenAmount Amount of index tokens to sell (as string)
 * @returns Transaction result with success status
 */
export async function sellIndexToken(
  userId: string,
  indexTokenId: string,
  tokenAmount: string
): Promise<IndexTransactionResult> {
  try {
    // ========================================================================
    // STEP 1: VALIDATE INPUTS AND GET SMART WALLET
    // ========================================================================
    console.log(`💰 Starting ODOS-powered index token sale`);
    console.log(`   Token Amount: ${tokenAmount} tokens`);
    console.log(`   Token ID: ${indexTokenId}`);
    console.log(`   User: ${userId}`);

    // Handle special 'MAX' case for 100% sells
    let amount: number;
    let isMaxSell = false;
    
    if (tokenAmount === 'MAX') {
      // For 100% sells, we'll determine the exact amount from wallet balance later
      console.log(`🎯 MAX sell requested - will use exact wallet balance`);
      amount = 0; // Placeholder, will be set from wallet balance
      isMaxSell = true;
    } else {
      // Validate token amount for partial sells
      amount = parseFloat(tokenAmount);
      if (amount <= 0) {
        return { success: false, error: 'Please enter a valid amount of tokens to sell.' };
      }
    }

    // Get index token metadata from database
    const indexToken = getIndexTokenById(indexTokenId);
    if (!indexToken) {
      return { success: false, error: INDEX_ERRORS.INVALID_INDEX_TOKEN };
    }

    console.log(`📊 Selling Token: ${indexToken.symbol} (${indexToken.name})`);
    console.log(`   Contract: ${indexToken.contractAddress}`);
    console.log(`   Category: ${indexToken.category}`);

    // Check if user has enough tokens to sell
    const existingPosition = getIndexPositionByUserAndToken(userId, indexTokenId);
    if (!existingPosition) {
      return { success: false, error: 'You don\'t own any of this index token to sell.' };
    }

    // Skip validation for MAX sells - we'll use the actual wallet balance
    if (!isMaxSell && existingPosition.tokensOwned < amount) {
      return { 
        success: false, 
        error: `Insufficient tokens. You own ${existingPosition.tokensOwned.toFixed(6)} ${indexToken.symbol}, but trying to sell ${amount}.`
      };
    }
    
    console.log(`📋 Position Info: ${existingPosition.tokensOwned.toFixed(6)} ${indexToken.symbol} in database`);

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
    // STEP 2: GET WALLET BALANCE FOR MAX SELLS OR PARSE AMOUNT FOR PARTIAL SELLS
    // ========================================================================
    const tokenDecimals = 18; // Standard for most ERC-20 tokens
    let tokenAmountWei: bigint;
    
    if (isMaxSell) {
      // For MAX sells, get the actual wallet balance first
      const { createPublicClient, http } = await import('viem');
      const { base } = await import('viem/chains');
      const { erc20Abi } = await import('../../utils/abis');
      
      const publicClient = createPublicClient({
        chain: base,
        transport: http()
      });
      
      const userBalance = await publicClient.readContract({
        address: indexToken.contractAddress as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress]
      });
      
      tokenAmountWei = userBalance;
      amount = Number(userBalance) / 1e18; // Convert to human-readable amount
      
      console.log(`🎯 MAX sell - using wallet balance:`);
      console.log(`   Raw Balance: ${userBalance} wei`);
      console.log(`   Token Amount: ${amount} ${indexToken.symbol}`);
      
      if (tokenAmountWei === 0n) {
        return { success: false, error: 'No tokens found in your wallet to sell.' };
      }
    } else {
      // Parse provided amount for partial sells
      tokenAmountWei = parseUnits(tokenAmount, tokenDecimals);
      console.log(`💵 Partial sell - using provided amount: ${amount} ${indexToken.symbol}`);
    }
    
    console.log(`📍 Requesting sell quote...`);
    console.log(`   Input: ${tokenAmountWei} wei ${indexToken.symbol} (${amount.toFixed(6)} tokens)`);
    console.log(`   Output: USDC`);
    
    // Get sell quote (INDEX TOKEN → USDC)
    const quoteResult = await getOdosQuote(
      indexToken.contractAddress as Address, // Input: Index token
      BASE_TOKENS.USDC, // Output: USDC
      tokenAmountWei,
      walletAddress
    );

    if (!quoteResult.success || !quoteResult.quote) {
      console.error('❌ ODOS sell quote request failed:', quoteResult.error);
      return {
        success: false,
        error: quoteResult.error || 'Unable to get sell quote from Reserve Protocol. Please try again.'
      };
    }

    const quote = quoteResult.quote;
    console.log(`✅ Sell Quote Received`);
    console.log(`   Path ID: ${quote.pathId}`);
    console.log(`   Gas Estimate: ${quote.gasEstimate}`);
    console.log(`   Price Impact: ${quote.priceImpact.toFixed(4)}%`);
    
    // Validate quote data
    if (!quote.outAmounts || quote.outAmounts.length === 0) {
      return { success: false, error: INDEX_ERRORS.NO_LIQUIDITY };
    }

    // Calculate expected USDC (6 decimals)
    const expectedUsdcWei = BigInt(quote.outAmounts[0]);
    const usdcReceived = Number(expectedUsdcWei) / Math.pow(10, 6);
    const pricePerToken = usdcReceived / amount;

    console.log(`💰 Expected Output:`);
    console.log(`   Raw USDC Wei: ${expectedUsdcWei}`);
    console.log(`   Formatted: ${usdcReceived} USDC`);
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
    // STEP 3: EXECUTE GASLESS SELL TRANSACTION
    // ========================================================================
    console.log(`🎨 Building gasless sell transaction...`);
    
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
        console.error('❌ Invalid ODOS sell transaction data:', quote.transaction);
        return {
          success: false,
          error: 'Invalid sell transaction data from Reserve Protocol. Please try again.'
        };
      }
      
      console.log(`🔧 Sell Transaction Details:`);
      console.log(`   ODOS Router: ${quote.transaction.to}`);
      console.log(`   Transaction Data: ${quote.transaction.data.slice(0, 20)}...`);
      console.log(`   Data Length: ${quote.transaction.data.length} chars`);
      console.log(`   ETH Value: ${quote.transaction.value || '0'}`);
      console.log(`   Approval Target: ${INDEX_CONTRACTS.ODOS_ROUTER_V3}`);
      console.log(`   Approval Strategy: Full user balance (avoids insufficient funds)`);
      
      // Get user's full LCAP balance and current allowance
      // For MAX sells, we already have the balance; for partial sells, get it fresh
      let userBalance: bigint;
      let currentAllowance: bigint;
      
      if (isMaxSell) {
        // We already have the wallet balance from earlier
        userBalance = tokenAmountWei;
        
        // Get current allowance
        const { createPublicClient, http } = await import('viem');
        const { base } = await import('viem/chains');
        
        const publicClient = createPublicClient({
          chain: base,
          transport: http()
        });
        
        currentAllowance = await publicClient.readContract({
          address: indexToken.contractAddress as Address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [walletAddress, INDEX_CONTRACTS.ODOS_ROUTER_V3]
        });
      } else {
        // For partial sells, get both balance and allowance
        const { createPublicClient, http } = await import('viem');
        const { base } = await import('viem/chains');
        
        const publicClient = createPublicClient({
          chain: base,
          transport: http()
        });
        
        [userBalance, currentAllowance] = await Promise.all([
          publicClient.readContract({
            address: indexToken.contractAddress as Address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [walletAddress]
          }),
          publicClient.readContract({
            address: indexToken.contractAddress as Address,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [walletAddress, INDEX_CONTRACTS.ODOS_ROUTER_V3]
          })
        ]);
      }
      
      console.log(`💰 User's ${indexToken.symbol} balance: ${userBalance} wei (${Number(userBalance) / 1e18} tokens)`);
      console.log(`🔍 Current allowance: ${currentAllowance} wei (${Number(currentAllowance) / 1e18} tokens)`);
      
      // For MAX sells, we've already used the correct wallet balance from the beginning
      if (isMaxSell) {
        console.log(`✅ MAX sell: Using exact wallet balance ${Number(userBalance) / 1e18} tokens`);
      }
      
      const calls = [];
      
      // Only approve if current allowance is insufficient for this sale
      // Add small buffer (0.1%) to handle precision differences
      const bufferAmount = tokenAmountWei * 1001n / 1000n; // +0.1% buffer
      if (currentAllowance < bufferAmount) {
        console.log(`🔄 Current allowance (${Number(currentAllowance) / 1e18} tokens) insufficient for sale (${Number(tokenAmountWei) / 1e18} tokens)`);
        
        // LCAP token requires allowance to be reset to 0 before setting new allowance
        if (currentAllowance > 0n) {
          console.log(`🔄 Resetting existing allowance to 0 first (LCAP requirement)`);
          calls.push({
            abi: erc20Abi,
            functionName: 'approve',
            to: indexToken.contractAddress as Address,
            args: [
              INDEX_CONTRACTS.ODOS_ROUTER_V3,
              0n // Reset to 0
            ]
          });
        }
        
        console.log(`💳 Approving full balance: ${userBalance} wei`);
        calls.push({
          abi: erc20Abi,
          functionName: 'approve',
          to: indexToken.contractAddress as Address,
          args: [
            INDEX_CONTRACTS.ODOS_ROUTER_V3,
            userBalance // Use full balance for future sells too
          ]
        });
      } else {
        console.log(`✅ Current allowance (${Number(currentAllowance) / 1e18} tokens) is sufficient for sale (${Number(tokenAmountWei) / 1e18} tokens)`);
      }
      
      // Always add the swap call
      calls.push({
        to: quote.transaction.to as Address,
        data: quote.transaction.data as `0x${string}`,
        value: BigInt(quote.transaction.value || '0')
      });
      
      console.log(`🍰 Sell transaction prepared (${calls.length} calls)`);
      let step = 1;
      
      if (currentAllowance < tokenAmountWei) {
        if (currentAllowance > 0n) {
          console.log(`   ${step++}. Reset allowance to 0 (LCAP requirement)`);
        }
        console.log(`   ${step++}. Approve full ${indexToken.symbol} balance: ${Number(userBalance) / 1e18} tokens`);
      }
      
      console.log(`   ${step}. Execute ODOS swap via swapCompact()`);
      
      if (currentAllowance >= tokenAmountWei) {
        console.log(`   ✅ Note: Using existing sufficient allowance, no approval needed`);
      } else {
        console.log(`   📌 Note: Full balance approval prevents future insufficient balance errors`);
      }
      
      // ========================================================================
      // STEP 4: EXECUTE GASLESS TRANSACTION
      // ========================================================================
      console.log(`🚀 Executing gasless sell transaction...`);
      console.log(`   Smart Account: ${smartWallet.smartAccount.address}`);
      console.log(`   Is Deployed: ${smartWallet.isDeployed}`);
      console.log(`   Bundler: Coinbase CDP`);
      console.log(`   Gas Sponsor: USDC paymaster`);
      
      // Configure optimized gas estimation for sell (similar to buy with approval)
      smartWallet.smartAccount.userOperation = {
        estimateGas: async (userOperation: any) => {
          const estimate = await bundlerClient.estimateUserOperationGas(userOperation);
          // Similar buffer as buy since we have approval + swap
          estimate.preVerificationGas = estimate.preVerificationGas * 3n / 2n; // +50%
          estimate.callGasLimit = estimate.callGasLimit * 130n / 100n; // +30% for ODOS
          estimate.verificationGasLimit = estimate.verificationGasLimit * 120n / 100n; // +20%
          
          console.log(`⛽ Gas Estimates (Sell with Approval):`);
          console.log(`   Pre-verification: ${estimate.preVerificationGas}`);
          console.log(`   Call Gas Limit: ${estimate.callGasLimit}`);
          console.log(`   Verification: ${estimate.verificationGasLimit}`);
          
          return estimate;
        },
      };
      
      // Execute the user operation with USDC gas sponsorship
      console.log(`📡 Sending sell UserOperation to bundler...`);
      const userOpHash = await bundlerClient.sendUserOperation({
        account: smartWallet.smartAccount,
        calls,
        paymaster: cdpPaymasterClient,
        paymasterContext: {
          erc20: BASE_TOKENS.USDC // Pay gas with USDC (from sale proceeds)
        }
      });
      
      console.log(`✅ Sell UserOperation submitted successfully`);
      console.log(`   UserOp Hash: ${userOpHash}`);
      console.log(`   Waiting for on-chain confirmation...`);
      
      // Wait for transaction to be mined and confirmed
      const startTime = Date.now();
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 120000 // 2 minute timeout
      });
      
      const executionTime = Date.now() - startTime;
      console.log(`⏱️ Sell transaction completed in ${executionTime}ms`);
      console.log(`   Status: ${receipt.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`   Block Number: ${receipt.receipt.blockNumber}`);
      console.log(`   Transaction Hash: ${receipt.receipt.transactionHash}`);
      console.log(`   Gas Used: ${receipt.receipt.gasUsed}`);
      
      if (!receipt.success) {
        console.error('❌ Sell transaction failed on-chain');
        return {
          success: false,
          error: 'Index token sell transaction failed on-chain. Please try again.'
        };
      }

      // ========================================================================
      // STEP 5: UPDATE DATABASE AND RETURN SUCCESS
      // ========================================================================
      console.log(`💾 Updating position after successful sell...`);
      
      const txHash = receipt.receipt.transactionHash;
      const tokensRemainingAfterSell = existingPosition.tokensOwned - amount;
      
      try {
        if (tokensRemainingAfterSell <= 0.000001) {
          // Position fully sold - could delete or set to zero
          console.log(`🗑️ Position fully sold, setting to zero`);
          updateIndexPositionValue(
            existingPosition.id,
            0, // No tokens remaining
            0, // No current value
            existingPosition.averageBuyPrice  // Keep original buy price for record keeping
          );
        } else {
          // Partial sell - update remaining position
          const remainingInvestedValue = (existingPosition.totalInvested / existingPosition.tokensOwned) * tokensRemainingAfterSell;
          
          console.log(`📊 Updating partial sell position:`);
          console.log(`   Remaining tokens: ${tokensRemainingAfterSell}`);
          console.log(`   Remaining invested value: $${remainingInvestedValue}`);
          
          updateIndexPositionValue(
            existingPosition.id,
            tokensRemainingAfterSell,
            remainingInvestedValue, // Will be updated by price feeds later
            existingPosition.averageBuyPrice // Keep original buy price
          );
        }
        
        // Save sell transaction record
        console.log(`📝 Saving sell transaction record...`);
        saveIndexTransaction(
          txHash,
          userId,
          indexTokenId,
          'sell',
          usdcReceived, // USDC received
          amount, // Tokens sold
          pricePerToken,
          'success'
        );
        
        console.log(`✅ Database updated successfully`);
        
      } catch (dbError: any) {
        console.error('❌ Database update error:', dbError);
        // Don't fail the entire transaction for DB errors
      }
      
      // Log final success summary
      console.log(`🎉 INDEX TOKEN SALE COMPLETED SUCCESSFULLY!`);
      console.log(`========================================`);
      console.log(`   User: ${userId}`);
      console.log(`   Token: ${indexToken.symbol} (${indexToken.name})`);
      console.log(`   Tokens Sold: ${amount} ${indexToken.symbol}`);
      console.log(`   USDC Received: $${usdcReceived}`);
      console.log(`   Price per Token: $${pricePerToken.toFixed(6)}`);
      console.log(`   Transaction Hash: ${txHash}`);
      console.log(`   Gas Sponsored: Yes (✅ Gasless)`);
      console.log(`   Execution Time: ${executionTime}ms`);
      console.log(`========================================`);
      
      return {
        success: true,
        txHash,
        tokensReceived: usdcReceived.toString(),
        pricePerToken
      };

    } catch (txError: any) {
      // ========================================================================
      // SELL TRANSACTION ERROR HANDLING
      // ========================================================================
      console.error('❌ SELL TRANSACTION EXECUTION FAILED');
      console.error('========================================');
      console.error(`   User: ${userId}`);
      console.error(`   Token: ${indexTokenId}`);
      console.error(`   Amount: ${amount} tokens`);
      console.error(`   Error Type: ${txError.name || 'Unknown'}`);
      console.error(`   Error Message: ${txError.message || 'No message'}`);
      console.error('========================================');
      
      // Save failed sell transaction record
      try {
        const failedTxHash = `failed_sell_${Date.now()}_${userId}`;
        saveIndexTransaction(
          failedTxHash,
          userId,
          indexTokenId,
          'sell',
          0, // No USDC received
          amount,
          pricePerToken,
          'failed'
        );
        console.log(`📝 Failed sell transaction logged: ${failedTxHash}`);
      } catch (dbError) {
        console.error('❌ Failed to log failed sell transaction:', dbError);
      }
      
      // Return user-friendly error message
      let userError: string = INDEX_ERRORS.TRANSACTION_FAILED;
      
      if (txError.message?.includes('insufficient')) {
        userError = 'Insufficient tokens in wallet to complete the sale.';
      } else if (txError.message?.includes('slippage') || txError.message?.includes('price impact')) {
        userError = INDEX_ERRORS.SLIPPAGE_TOO_HIGH;
      } else if (txError.message?.includes('timeout')) {
        userError = 'Sale transaction timeout. Please try again.';
      } else if (txError.message?.includes('rejected')) {
        userError = 'Sale transaction was rejected. Please try again.';
      } else if (txError.code === 'NETWORK_ERROR') {
        userError = INDEX_ERRORS.NETWORK_ERROR;
      }
      
      return {
        success: false,
        error: userError
      };
    }

  } catch (error: any) {
    console.error('❌ Error in sellIndexToken:', error);
    return {
      success: false,
      error: error.message || INDEX_ERRORS.TRANSACTION_FAILED
    };
  }
}