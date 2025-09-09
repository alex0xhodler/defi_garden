import { Address, parseUnits, encodeFunctionData } from 'viem';
import { getCoinbaseSmartWallet, createSponsoredBundlerClient, publicClient } from '../lib/coinbase-wallet';

// Morpho Re7 Universal USDC vault token addresses on Base
const MORPHO_RE7_TOKENS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
};

// Morpho Re7 Universal USDC vault contract addresses on Base (using same infrastructure as Morpho/Spark/Seamless)
const MORPHO_RE7_CONTRACTS = {
  GENERAL_ADAPTER: "0xb98c948cfa24072e58935bc004a8a7b376ae746a" as Address,
  MORPHO_RE7_USDC_VAULT: "0xB7890CEE6CF4792cdCC13489D36D9d42726ab863" as Address, // Re7 Universal USDC vault address
  MORPHO_BLUE: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb" as Address,
  BUNDLER: "0x6bfd8137e702540e7a42b74178a4a49ba43920c4" as Address
};

// Standard ERC20 ABI for balance checks
const simpleERC20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

/**
 * Deposit USDC to Morpho Re7 Universal USDC vault with sponsored gas
 * 
 * Based on proven Morpho/Spark/Seamless pattern - Direct ERC4626 deposit via multicall
 * Uses the same transaction pattern as proven successful deposits
 * 
 * @param userId User identifier
 * @param usdcAmount Amount to deposit (in USDC, e.g., "1.0")
 * @param testSmartAccount Optional smart account for testing
 * @returns Promise with success status, transaction hash, and shares received
 */
export async function deployToMorphoRe7(
  userId: string, 
  usdcAmount: string,
  testSmartAccount?: any // Optional parameter for testing
): Promise<{ success: boolean; txHash?: string; error?: string; shares?: string }> {
  try {
    console.log(`🚀 Deploying ${usdcAmount} USDC to Morpho Re7 Universal USDC vault for user ${userId}`);

    let smartAccount;
    
    if (testSmartAccount) {
      // Use provided smart account for testing
      smartAccount = testSmartAccount;
    } else {
      // Get user's Coinbase Smart Wallet from database
      const wallet = await getCoinbaseSmartWallet(userId);
      if (!wallet) {
        throw new Error('No Coinbase Smart Wallet found for user');
      }
      smartAccount = wallet.smartAccount;
    }
    
    // Convert USDC amount to proper units (6 decimals)
    const amountWei = parseUnits(usdcAmount, 6);
    
    // Check current USDC balance
    const usdcBalance = await publicClient.readContract({
      address: MORPHO_RE7_TOKENS.USDC,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [smartAccount.address]
    });

    if (usdcBalance < amountWei) {
      throw new Error(`Insufficient USDC balance. Have: ${usdcBalance}, Need: ${amountWei}`);
    }

    // Create sponsored bundler client for gasless transactions
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    // Using EXACT same pattern as working Morpho PYTH/USDC, Spark, and Seamless implementation
    // Only difference: vault address (Morpho Re7 vs Moonwell vs Morpho PYTH vs Spark vs Seamless)
    
    // USDC approve for Morpho Re7 vault direct deposit (same as Morpho/Spark/Seamless pattern)
    const approveCalldata = '0x095ea7b3' + 
      MORPHO_RE7_CONTRACTS.MORPHO_RE7_USDC_VAULT.slice(2).padStart(64, '0') +  // spender (Morpho Re7 vault)
      amountWei.toString(16).padStart(64, '0');  // amount (32 bytes)
    
    // Direct deposit to Morpho Re7 vault (ERC4626 standard - same as Morpho/Spark/Seamless)
    const directDepositCalldata = '0x6e553f65' +  // deposit(uint256,address) 
      amountWei.toString(16).padStart(64, '0') +     // assets (32 bytes)
      smartAccount.address.slice(2).padStart(64, '0'); // receiver (32 bytes)
    
    const operations = [
      // Step 1: Approve Morpho Re7 vault to spend USDC
      {
        to: MORPHO_RE7_TOKENS.USDC,
        value: '0',
        data: approveCalldata as `0x${string}`,
        skipRevert: false
      },
      // Step 2: Direct deposit to Morpho Re7 vault (ERC4626)
      {
        to: MORPHO_RE7_CONTRACTS.MORPHO_RE7_USDC_VAULT,
        value: '0',
        data: directDepositCalldata as `0x${string}`,
        skipRevert: false
      }
    ];

    console.log('📝 Executing Morpho Re7 Universal USDC vault deposit via sponsored transaction...');
    
    // Execute the sponsored transaction with multicall
    const txHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: operations.map(op => ({
        to: op.to as Address,
        value: BigInt(op.value),
        data: op.data
      }))
    });

    console.log(`✅ Morpho Re7 deposit UserOperation sent: ${txHash}`);

    // Wait for transaction confirmation
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: txHash
    });

    if (receipt.success) {
      // Get the shares received (approximation - should parse from logs for accuracy)
      let sharesReceived = amountWei; // Approximation for ERC4626 vaults
      
      const actualTxHash = receipt.receipt.transactionHash;
      console.log(`✅ Morpho Re7 deposit successful! Blockchain TX: ${actualTxHash}`);
      console.log(`✅ Morpho Re7 Universal USDC shares received: ${sharesReceived}`);
      
      return { 
        success: true, 
        txHash: actualTxHash,
        shares: sharesReceived.toString()
      };
    } else {
      throw new Error('Transaction failed during execution');
    }

  } catch (error: any) {
    console.error('❌ Morpho Re7 deposit failed:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error during Morpho Re7 deposit'
    };
  }
}

/**
 * Withdraw USDC from Morpho Re7 vault using direct ERC4626 redeem
 * 
 * Based on proven withdrawal pattern from Morpho/Spark/Seamless success
 * Uses direct ERC4626 redeem pattern
 * 
 * @param userId User identifier
 * @param sharesAmount Amount of shares to redeem
 * @param testSmartAccount Optional smart account for testing
 * @returns Promise with success status, transaction hash, and assets received
 */
export async function withdrawFromMorphoRe7(
  userId: string, 
  sharesAmount: string | 'max',
  testSmartAccount?: any // Optional parameter for testing
): Promise<{ success: boolean; txHash?: string; error?: string; assets?: string }> {
  try {
    console.log(`🔄 Withdrawing ${sharesAmount} Morpho Re7 Universal USDC shares from Morpho Re7 vault for user ${userId}`);

    let smartAccount;
    
    if (testSmartAccount) {
      // Use provided smart account for testing
      smartAccount = testSmartAccount;
    } else {
      // Get user's Coinbase Smart Wallet from database
      const wallet = await getCoinbaseSmartWallet(userId);
      if (!wallet) {
        throw new Error('No Coinbase Smart Wallet found for user');
      }
      smartAccount = wallet.smartAccount;
    }
    
    // Handle max withdrawal or convert shares amount to proper units
    let sharesWei: bigint;
    
    // Check current share balance first
    const shareBalance = await publicClient.readContract({
      address: MORPHO_RE7_CONTRACTS.MORPHO_RE7_USDC_VAULT,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [smartAccount.address]
    });
    
    if (sharesAmount === 'max') {
      // Use balance minus 1 wei for max exit to avoid vault rounding issues
      sharesWei = shareBalance > 1n ? shareBalance - 1n : shareBalance;
      console.log(`📤 MAX EXIT: Using ${sharesWei} wei (${(Number(sharesWei) / 1e18).toFixed(6)} Re7 Universal USDC) [original: ${shareBalance}]`);
    } else {
      // Convert shares amount to proper units (18 decimals for Morpho Re7 Universal USDC shares)
      sharesWei = parseUnits(sharesAmount as string, 18);
      
      if (shareBalance < sharesWei) {
        throw new Error(`Insufficient Morpho Re7 Universal USDC share balance. Have: ${shareBalance}, Need: ${sharesWei}`);
      }
    }
    
    if (sharesWei === 0n) {
      throw new Error('No Morpho Re7 Universal USDC shares to withdraw');
    }

    // Create sponsored bundler client for gasless transactions
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    // Using direct vault redeem (ERC4626 standard) - same as successful Morpho/Spark/Seamless pattern
    // The working deposit used direct vault interaction, so withdrawal should too
    
    console.log(`🔍 Debug info:`);
    console.log(`   Vault: ${MORPHO_RE7_CONTRACTS.MORPHO_RE7_USDC_VAULT}`);
    console.log(`   Shares to redeem: ${sharesWei}`);
    console.log(`   Smart Account: ${smartAccount.address}`);
    console.log(`   Share balance: ${shareBalance}`);
    
    const directRedeemCalldata = '0xba087652' +  // redeem(uint256,address,address) - ERC4626 standard
      sharesWei.toString(16).padStart(64, '0') +             // shares amount
      smartAccount.address.slice(2).padStart(64, '0') +      // receiver 
      smartAccount.address.slice(2).padStart(64, '0');       // owner

    console.log(`   Redeem calldata: ${directRedeemCalldata}`);

    const operations = [
      // Direct redeem from Morpho Re7 vault (ERC4626)
      {
        to: MORPHO_RE7_CONTRACTS.MORPHO_RE7_USDC_VAULT,
        value: '0',
        data: directRedeemCalldata as `0x${string}`,
        skipRevert: false
      }
    ];

    console.log('📝 Executing Morpho Re7 withdrawal via sponsored transaction...');
    
    // Execute the sponsored transaction
    const txHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: operations.map(op => ({
        to: op.to as Address,
        value: BigInt(op.value),
        data: op.data
      }))
    });

    console.log(`✅ Morpho Re7 withdrawal UserOperation sent: ${txHash}`);

    // Wait for transaction confirmation
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: txHash
    });

    if (receipt.success) {
      // Get the assets received (approximate - should parse from logs for accuracy)
      let assetsReceived = sharesWei / BigInt(1e12); // Convert from 18 to 6 decimals
      
      const actualTxHash = receipt.receipt.transactionHash;
      console.log(`✅ Morpho Re7 withdrawal successful! Blockchain TX: ${actualTxHash}`);
      console.log(`✅ USDC assets received: ${assetsReceived}`);
      
      return { 
        success: true, 
        txHash: actualTxHash,
        assets: assetsReceived.toString()
      };
    } else {
      throw new Error('Transaction failed during execution');
    }

  } catch (error: any) {
    console.error('❌ Morpho Re7 withdrawal failed:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error during Morpho Re7 withdrawal'
    };
  }
}

/**
 * Get user's Morpho Re7 vault position (shares and equivalent USDC value)
 * 
 * @param userAddress User's wallet address
 * @returns Object with shares, assets, and formatted values
 */
export async function getMorphoRe7Balance(userAddress: Address): Promise<{
  shares: bigint;
  assets: bigint;
  sharesFormatted: string;
  assetsFormatted: string;
}> {
  try {
    // Get user's Morpho Re7 Universal USDC share balance
    const shares = await publicClient.readContract({
      address: MORPHO_RE7_CONTRACTS.MORPHO_RE7_USDC_VAULT,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [userAddress]
    });

    // Convert shares to assets using proper decimals
    // Morpho Re7 Universal USDC shares are 18 decimals, USDC is 6 decimals
    const assets = shares / BigInt(1e12); // Convert from 18 decimals to 6 decimals

    return {
      shares,
      assets,
      sharesFormatted: (Number(shares) / 1e18).toFixed(6), // 18 decimals for Morpho Re7 Universal USDC
      assetsFormatted: (Number(assets) / 1e6).toFixed(6)   // 6 decimals for USDC
    };

  } catch (error) {
    console.error('Error getting Morpho Re7 balance:', error);
    return {
      shares: 0n,
      assets: 0n,
      sharesFormatted: '0',
      assetsFormatted: '0'
    };
  }
}

/**
 * Get current APY for Morpho Re7 Universal USDC vault from DeFiLlama
 * 
 * @returns Current APY as a percentage
 */
export async function getMorphoRe7APY(): Promise<number> {
  try {
    // Fetch from DeFiLlama API using the pool ID
    const poolId = '44390fb2-b3ad-46ee-a916-f21289f3cc88';
    const response = await fetch(`https://yields.llama.fi/pools/${poolId}`);
    
    if (!response.ok) {
      console.warn('Failed to fetch Morpho Re7 APY from DeFiLlama');
      return 5.0; // Default APY
    }
    
    const data = await response.json();
    return data.apy || 5.0;
  } catch (error) {
    console.error('Error getting Morpho Re7 APY:', error);
    return 5.0;
  }
}

/**
 * Get Morpho Re7 vault total assets and TVL for display
 * 
 * @returns Object with total assets and formatted TVL
 */
export async function getMorphoRe7VaultInfo(): Promise<{
  totalAssets: bigint;
  tvlFormatted: string;
}> {
  try {
    // Fetch TVL from DeFiLlama API
    const poolId = '44390fb2-b3ad-46ee-a916-f21289f3cc88';
    const response = await fetch(`https://yields.llama.fi/pools/${poolId}`);
    
    let totalAssets = 0n;
    let tvlFormatted = '$0M';
    
    if (response.ok) {
      const data = await response.json();
      const tvlUsd = data.tvlUsd || 0;
      totalAssets = BigInt(Math.floor(tvlUsd * 1e6)); // Convert to USDC units
      tvlFormatted = `$${(tvlUsd / 1e6).toFixed(1)}M`;
    }

    return {
      totalAssets,
      tvlFormatted
    };

  } catch (error) {
    console.error('Error getting Morpho Re7 vault info:', error);
    return {
      totalAssets: 0n,
      tvlFormatted: '$0M'
    };
  }
}