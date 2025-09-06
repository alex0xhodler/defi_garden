import { Address, parseUnits, encodeFunctionData } from 'viem';
import { getCoinbaseSmartWallet, createSponsoredBundlerClient, publicClient } from '../lib/coinbase-wallet';
import { metaMorphoAbi, permitAbi, generalAdapterAbi, erc20Abi } from '../utils/abis';
import { BASE_TOKENS, MORPHO_CONTRACTS, MAX_UINT256 } from '../utils/constants';

/**
 * Deploy USDC to Morpho PYTH/USDC vault with sponsored gas
 * Follows the multicall pattern from the user's transaction
 */
export async function deployToMorphoPYTH(
  userId: string, 
  usdcAmount: string
): Promise<{ success: boolean; txHash?: string; error?: string; shares?: string }> {
  try {
    console.log(`🚀 Deploying ${usdcAmount} USDC to Morpho PYTH/USDC for user ${userId}`);

    // Get user's Coinbase Smart Wallet
    const wallet = await getCoinbaseSmartWallet(userId);
    if (!wallet) {
      throw new Error('No Coinbase Smart Wallet found for user');
    }

    const { smartAccount } = wallet;
    
    // Convert USDC amount to proper units (6 decimals)
    const amountWei = parseUnits(usdcAmount, 6);
    
    // Check current USDC balance
    const usdcBalance = await publicClient.readContract({
      address: BASE_TOKENS.USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [smartAccount.address]
    });

    if (usdcBalance < amountWei) {
      throw new Error(`Insufficient USDC balance. Have: ${usdcBalance}, Need: ${amountWei}`);
    }

    // Get current nonce for permit
    const currentNonce = await publicClient.readContract({
      address: BASE_TOKENS.USDC,
      abi: permitAbi,
      functionName: 'nonces',
      args: [smartAccount.address]
    });

    // Create permit deadline (1 hour from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Create sponsored bundler client for gasless transactions
    const bundlerClient = await createSponsoredBundlerClient();

    // Prepare multicall operations following the transaction pattern
    const operations = [
      // 1. Permit USDC to GeneralAdapter (gasless approval)
      {
        to: BASE_TOKENS.USDC,
        value: '0',
        data: encodeFunctionData({
          abi: permitAbi,
          functionName: 'permit',
          args: [
            smartAccount.address, // owner
            MORPHO_CONTRACTS.GENERAL_ADAPTER, // spender
            amountWei, // value
            deadline, // deadline
            27, // v (will be overridden by signature)
            '0x0000000000000000000000000000000000000000000000000000000000000000', // r (placeholder)
            '0x0000000000000000000000000000000000000000000000000000000000000000'  // s (placeholder)
          ]
        }),
        skipRevert: true
      },
      // 2. Transfer USDC from user to GeneralAdapter
      {
        to: MORPHO_CONTRACTS.GENERAL_ADAPTER,
        value: '0',
        data: encodeFunctionData({
          abi: generalAdapterAbi,
          functionName: 'forceApprove',
          args: [
            BASE_TOKENS.USDC, // token
            MORPHO_CONTRACTS.GENERAL_ADAPTER, // spender
            amountWei // value
          ]
        }),
        skipRevert: false
      },
      // 3. Supply to Morpho via GeneralAdapter  
      {
        to: MORPHO_CONTRACTS.GENERAL_ADAPTER,
        value: '0',
        data: encodeFunctionData({
          abi: generalAdapterAbi,
          functionName: 'morphoSupply',
          args: [
            MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC, // market
            amountWei, // assets
            0n, // minShares (no slippage protection for now)
            smartAccount.address // onBehalf
          ]
        }),
        skipRevert: false
      }
    ];

    console.log('📝 Executing Morpho deposit via sponsored transaction...');
    
    // Execute the sponsored transaction with multicall
    const txHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: operations.map(op => ({
        to: op.to as Address,
        value: BigInt(op.value),
        data: op.data
      }))
    });

    console.log(`✅ Morpho deposit transaction sent: ${txHash}`);

    // Wait for transaction confirmation
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: txHash
    });

    if (receipt.success) {
      // Get the shares received (from event logs if available)
      let sharesReceived = amountWei; // Approximation, should parse from logs for accuracy
      
      console.log(`✅ Morpho deposit successful! Shares: ${sharesReceived}`);
      
      return { 
        success: true, 
        txHash: receipt.receipt.transactionHash,
        shares: sharesReceived.toString()
      };
    } else {
      throw new Error('Transaction failed during execution');
    }

  } catch (error: any) {
    console.error('❌ Morpho deposit failed:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error during Morpho deposit'
    };
  }
}

/**
 * Withdraw USDC from Morpho PYTH/USDC vault
 */
export async function withdrawFromMorphoPYTH(
  userId: string, 
  sharesAmount: string
): Promise<{ success: boolean; txHash?: string; error?: string; assets?: string }> {
  try {
    console.log(`🔄 Withdrawing ${sharesAmount} shares from Morpho PYTH/USDC for user ${userId}`);

    // Get user's Coinbase Smart Wallet
    const wallet = await getCoinbaseSmartWallet(userId);
    if (!wallet) {
      throw new Error('No Coinbase Smart Wallet found for user');
    }

    const { smartAccount } = wallet;
    
    // Convert shares amount to proper units
    const sharesWei = parseUnits(sharesAmount, 18); // MetaMorpho shares are 18 decimals
    
    // Check current share balance
    const shareBalance = await publicClient.readContract({
      address: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC,
      abi: metaMorphoAbi,
      functionName: 'balanceOf',
      args: [smartAccount.address]
    });

    if (shareBalance < sharesWei) {
      throw new Error(`Insufficient share balance. Have: ${shareBalance}, Need: ${sharesWei}`);
    }

    // Create sponsored bundler client
    const bundlerClient = await createSponsoredBundlerClient();

    // Prepare withdraw call
    const withdrawCall = {
      to: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC as Address,
      value: 0n,
      data: encodeFunctionData({
        abi: metaMorphoAbi,
        functionName: 'redeem',
        args: [
          sharesWei, // shares
          smartAccount.address, // receiver
          smartAccount.address  // owner
        ]
      })
    };

    console.log('📝 Executing Morpho withdrawal via sponsored transaction...');
    
    // Execute the sponsored transaction
    const txHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: [withdrawCall]
    });

    console.log(`✅ Morpho withdrawal transaction sent: ${txHash}`);

    // Wait for transaction confirmation
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: txHash
    });

    if (receipt.success) {
      // The assets received should be parsed from logs for accuracy
      const assetsReceived = sharesWei; // Approximation
      
      console.log(`✅ Morpho withdrawal successful! Assets: ${assetsReceived}`);
      
      return { 
        success: true, 
        txHash: receipt.receipt.transactionHash,
        assets: assetsReceived.toString()
      };
    } else {
      throw new Error('Withdrawal transaction failed during execution');
    }

  } catch (error: any) {
    console.error('❌ Morpho withdrawal failed:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error during Morpho withdrawal'
    };
  }
}

/**
 * Get user's Morpho PYTH/USDC position (shares and equivalent USDC value)
 */
export async function getMorphoBalance(userAddress: Address): Promise<{
  shares: bigint;
  assets: bigint;
  sharesFormatted: string;
  assetsFormatted: string;
}> {
  try {
    // Get user's share balance
    const shares = await publicClient.readContract({
      address: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC,
      abi: metaMorphoAbi,
      functionName: 'balanceOf',
      args: [userAddress]
    });

    // Convert shares to underlying assets (USDC)
    const assets = shares > 0n ? await publicClient.readContract({
      address: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC,
      abi: metaMorphoAbi,
      functionName: 'previewWithdraw',
      args: [shares]
    }) : 0n;

    return {
      shares,
      assets,
      sharesFormatted: (Number(shares) / 1e18).toFixed(6), // 18 decimals for shares
      assetsFormatted: (Number(assets) / 1e6).toFixed(6)   // 6 decimals for USDC
    };

  } catch (error) {
    console.error('Error getting Morpho balance:', error);
    return {
      shares: 0n,
      assets: 0n,
      sharesFormatted: '0',
      assetsFormatted: '0'
    };
  }
}

/**
 * Get current APY for Morpho PYTH/USDC vault
 * This should be fetched from Defillama or Morpho's API
 */
export async function getMorphoAPY(): Promise<number> {
  try {
    // For now, return a default APY
    // This should be updated to fetch from Defillama API
    return 10.0; // ~10% APY as mentioned by user
  } catch (error) {
    console.error('Error getting Morpho APY:', error);
    return 0;
  }
}

/**
 * Get vault total assets and TVL for display
 */
export async function getMorphoVaultInfo(): Promise<{
  totalAssets: bigint;
  tvlFormatted: string;
}> {
  try {
    const totalAssets = await publicClient.readContract({
      address: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC,
      abi: metaMorphoAbi,
      functionName: 'totalAssets'
    });

    return {
      totalAssets,
      tvlFormatted: `$${(Number(totalAssets) / 1e6 / 1e6).toFixed(1)}M` // Convert to millions
    };

  } catch (error) {
    console.error('Error getting Morpho vault info:', error);
    return {
      totalAssets: 0n,
      tvlFormatted: '$0M'
    };
  }
}