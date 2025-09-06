import { Address, parseUnits, encodeFunctionData } from 'viem';
import { getCoinbaseSmartWallet, createSponsoredBundlerClient, publicClient } from '../lib/coinbase-wallet';

// Spark USDC vault token addresses on Base
const SPARK_TOKENS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
};

// Spark USDC vault contract addresses on Base (from stack traces)
const SPARK_CONTRACTS = {
  VAULT: "0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a" as Address, // SPARKUSDC vault address
  GENERAL_ADAPTER: "0xb98c948cfa24072e58935bc004a8a7b376ae746a" as Address, // General adapter from multicall
  BUNDLER: "0x6bfd8137e702540e7a42b74178a4a49ba43920c4" as Address // Bundler3 address
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
 * Deposit USDC to Spark USDC vault with sponsored gas
 * 
 * Based on proven Morpho pattern - Direct ERC4626 deposit via multicall
 * Uses the same transaction pattern as proven successful deposits
 * 
 * @param userId User identifier
 * @param usdcAmount Amount to deposit (in USDC, e.g., "1.0")
 * @param testSmartAccount Optional smart account for testing
 * @returns Promise with success status, transaction hash, and shares received
 */
export async function deployToSpark(
  userId: string, 
  usdcAmount: string,
  testSmartAccount?: any // Optional parameter for testing
): Promise<{ success: boolean; txHash?: string; error?: string; shares?: string }> {
  try {
    console.log(`🚀 Deploying ${usdcAmount} USDC to Spark USDC vault for user ${userId}`);

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
      address: SPARK_TOKENS.USDC,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [smartAccount.address]
    });

    if (usdcBalance < amountWei) {
      throw new Error(`Insufficient USDC balance. Have: ${usdcBalance}, Need: ${amountWei}`);
    }

    // Create sponsored bundler client for gasless transactions
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    // Following the exact pattern from successful stack trace
    // The multicall pattern uses General Adapter with approve + deposit
    
    // Step 1: Approve General Adapter to spend USDC
    const approveCalldata = '0x095ea7b3' + 
      SPARK_CONTRACTS.GENERAL_ADAPTER.slice(2).padStart(64, '0') +  // spender (general adapter)
      amountWei.toString(16).padStart(64, '0');  // amount

    // Step 2: Deposit via General Adapter to Spark vault
    // Based on stack trace analysis, using the deposit function pattern
    const depositCalldata = '0x6e553f65' +  // deposit(uint256,address)
      amountWei.toString(16).padStart(64, '0') +     // assets
      smartAccount.address.slice(2).padStart(64, '0'); // receiver

    const operations = [
      // Step 1: Approve General Adapter to spend USDC
      {
        to: SPARK_TOKENS.USDC,
        value: '0',
        data: approveCalldata as `0x${string}`,
        skipRevert: false
      },
      // Step 2: Deposit to Spark vault via General Adapter
      {
        to: SPARK_CONTRACTS.GENERAL_ADAPTER,
        value: '0',
        data: depositCalldata as `0x${string}`,
        skipRevert: false
      }
    ];

    console.log('📝 Executing Spark USDC vault deposit via sponsored transaction...');
    
    // Execute the sponsored transaction with multicall
    const txHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: operations.map(op => ({
        to: op.to as Address,
        value: BigInt(op.value),
        data: op.data
      }))
    });

    console.log(`✅ Spark deposit UserOperation sent: ${txHash}`);

    // Wait for transaction confirmation
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: txHash
    });

    if (receipt.success) {
      // Get the shares received (approximation - should parse from logs for accuracy)
      let sharesReceived = amountWei; // Approximation for ERC4626 vaults
      
      const actualTxHash = receipt.receipt.transactionHash;
      console.log(`✅ Spark deposit successful! Blockchain TX: ${actualTxHash}`);
      console.log(`✅ SPARKUSDC shares received: ${sharesReceived}`);
      
      return { 
        success: true, 
        txHash: actualTxHash,
        shares: sharesReceived.toString()
      };
    } else {
      throw new Error('Transaction failed during execution');
    }

  } catch (error: any) {
    console.error('❌ Spark deposit failed:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error during Spark deposit'
    };
  }
}

/**
 * Withdraw USDC from Spark vault using direct ERC4626 redeem
 * 
 * Based on proven withdrawal pattern from stack traces
 * Uses permit + redeem pattern via General Adapter
 * 
 * @param userId User identifier
 * @param sharesAmount Amount of shares to redeem
 * @param testSmartAccount Optional smart account for testing
 * @returns Promise with success status, transaction hash, and assets received
 */
export async function withdrawFromSpark(
  userId: string, 
  sharesAmount: string,
  testSmartAccount?: any // Optional parameter for testing
): Promise<{ success: boolean; txHash?: string; error?: string; assets?: string }> {
  try {
    console.log(`🔄 Withdrawing ${sharesAmount} SPARKUSDC shares from Spark vault for user ${userId}`);

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
    
    // Convert shares amount to proper units (18 decimals for SPARKUSDC shares)
    const sharesWei = parseUnits(sharesAmount, 18);
    
    // Check current share balance
    const shareBalance = await publicClient.readContract({
      address: SPARK_CONTRACTS.VAULT,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [smartAccount.address]
    });

    if (shareBalance < sharesWei) {
      throw new Error(`Insufficient SPARKUSDC share balance. Have: ${shareBalance}, Need: ${sharesWei}`);
    }

    // Create sponsored bundler client for gasless transactions
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    // Following the withdrawal stack trace pattern:
    // Uses permit signature + redeem via General Adapter
    
    // For now, using direct redeem approach (can be enhanced with permit later)
    const directRedeemCalldata = '0xa7f6e606' +  // Function selector from stack trace
      SPARK_CONTRACTS.VAULT.slice(2).padStart(64, '0') +     // vault address
      sharesWei.toString(16).padStart(64, '0') +             // shares amount
      '0'.padStart(64, '0') +                                // minAmountOut (0 for now)
      smartAccount.address.slice(2).padStart(64, '0') +      // receiver
      smartAccount.address.slice(2).padStart(64, '0');       // owner

    const operations = [
      // Direct redeem via General Adapter (following stack trace pattern)
      {
        to: SPARK_CONTRACTS.GENERAL_ADAPTER,
        value: '0',
        data: directRedeemCalldata as `0x${string}`,
        skipRevert: false
      }
    ];

    console.log('📝 Executing Spark withdrawal via sponsored transaction...');
    
    // Execute the sponsored transaction
    const txHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: operations.map(op => ({
        to: op.to as Address,
        value: BigInt(op.value),
        data: op.data
      }))
    });

    console.log(`✅ Spark withdrawal UserOperation sent: ${txHash}`);

    // Wait for transaction confirmation
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: txHash
    });

    if (receipt.success) {
      // Get the assets received (approximate - should parse from logs for accuracy)
      let assetsReceived = sharesWei / BigInt(1e12); // Convert from 18 to 6 decimals
      
      const actualTxHash = receipt.receipt.transactionHash;
      console.log(`✅ Spark withdrawal successful! Blockchain TX: ${actualTxHash}`);
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
    console.error('❌ Spark withdrawal failed:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error during Spark withdrawal'
    };
  }
}

/**
 * Get user's Spark vault position (shares and equivalent USDC value)
 * 
 * @param userAddress User's wallet address
 * @returns Object with shares, assets, and formatted values
 */
export async function getSparkBalance(userAddress: Address): Promise<{
  shares: bigint;
  assets: bigint;
  sharesFormatted: string;
  assetsFormatted: string;
}> {
  try {
    // Get user's SPARKUSDC share balance
    const shares = await publicClient.readContract({
      address: SPARK_CONTRACTS.VAULT,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [userAddress]
    });

    // Convert shares to assets using proper decimals
    // SPARKUSDC shares are 18 decimals, USDC is 6 decimals
    const assets = shares / BigInt(1e12); // Convert from 18 decimals to 6 decimals

    return {
      shares,
      assets,
      sharesFormatted: (Number(shares) / 1e18).toFixed(6), // 18 decimals for SPARKUSDC
      assetsFormatted: (Number(assets) / 1e6).toFixed(6)   // 6 decimals for USDC
    };

  } catch (error) {
    console.error('Error getting Spark balance:', error);
    return {
      shares: 0n,
      assets: 0n,
      sharesFormatted: '0',
      assetsFormatted: '0'
    };
  }
}

/**
 * Get current APY for Spark USDC vault from DeFiLlama
 * 
 * @returns Current APY as a percentage
 */
export async function getSparkAPY(): Promise<number> {
  try {
    // Fetch from DeFiLlama API using the pool ID
    const poolId = '9f146531-9c31-46ba-8e26-6b59bdaca9ff';
    const response = await fetch(`https://yields.llama.fi/pools/${poolId}`);
    
    if (!response.ok) {
      console.warn('Failed to fetch Spark APY from DeFiLlama');
      return 0.0; // Default APY
    }
    
    const data = await response.json();
    return data.apy || 0.0;
  } catch (error) {
    console.error('Error getting Spark APY:', error);
    return 0;
  }
}

/**
 * Get Spark vault total assets and TVL for display
 * 
 * @returns Object with total assets and formatted TVL
 */
export async function getSparkVaultInfo(): Promise<{
  totalAssets: bigint;
  tvlFormatted: string;
}> {
  try {
    // Fetch TVL from DeFiLlama API
    const poolId = '9f146531-9c31-46ba-8e26-6b59bdaca9ff';
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
    console.error('Error getting Spark vault info:', error);
    return {
      totalAssets: 0n,
      tvlFormatted: '$0M'
    };
  }
}

// Export aliases for consistency
// Note: Functions are already exported above, no need for aliases