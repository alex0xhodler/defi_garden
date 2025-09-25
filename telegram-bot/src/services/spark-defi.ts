import { Address, parseUnits, encodeFunctionData } from 'viem';
import { getCoinbaseSmartWallet, createSponsoredBundlerClient, publicClient } from '../lib/coinbase-wallet';

// Spark USDC vault token addresses on Base
const SPARK_TOKENS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
};

// Spark USDC vault contract addresses on Base (using same infrastructure as Morpho)
const SPARK_CONTRACTS = {
  GENERAL_ADAPTER: "0xb98c948cfa24072e58935bc004a8a7b376ae746a" as Address,
  SPARK_USDC_VAULT: "0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a" as Address, // SPARKUSDC vault address
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
 * Deposits USDC into the Spark USDC vault for a user, sponsoring the gas fee.
 * This function follows the ERC4626 standard, bundling `approve` and `deposit` calls into a single gasless transaction.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} usdcAmount - The amount of USDC to deposit, in a human-readable format (e.g., "1.0").
 * @param {any} [testSmartAccount] - An optional smart account object for testing purposes.
 * @returns {Promise<{ success: boolean; txHash?: string; error?: string; shares?: string }>} An object indicating the transaction's success, hash, shares received, or an error message.
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

    // Using EXACT same pattern as working Morpho PYTH/USDC implementation
    // Only difference: vault address (Spark vs Morpho PYTH)
    
    // USDC approve for Spark vault direct deposit (same as Morpho pattern)
    const approveCalldata = '0x095ea7b3' + 
      SPARK_CONTRACTS.SPARK_USDC_VAULT.slice(2).padStart(64, '0') +  // spender (Spark vault)
      amountWei.toString(16).padStart(64, '0');  // amount (32 bytes)
    
    // Direct deposit to Spark vault (ERC4626 standard - same as Morpho)
    const directDepositCalldata = '0x6e553f65' +  // deposit(uint256,address) 
      amountWei.toString(16).padStart(64, '0') +     // assets (32 bytes)
      smartAccount.address.slice(2).padStart(64, '0'); // receiver (32 bytes)
    
    const operations = [
      // Step 1: Approve Spark vault to spend USDC
      {
        to: SPARK_TOKENS.USDC,
        value: '0',
        data: approveCalldata as `0x${string}`,
        skipRevert: false
      },
      // Step 2: Direct deposit to Spark vault (ERC4626)
      {
        to: SPARK_CONTRACTS.SPARK_USDC_VAULT,
        value: '0',
        data: directDepositCalldata as `0x${string}`,
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
 * Withdraws USDC from the Spark USDC vault by redeeming vault shares.
 * This function uses the standard ERC4626 `redeem` function in a gas-sponsored transaction.
 * @param {string} userId - The unique identifier for the user.
 * @param {string | 'max'} sharesAmount - The amount of vault shares to redeem, or 'max' to redeem all.
 * @param {any} [testSmartAccount] - An optional smart account object for testing purposes.
 * @returns {Promise<{ success: boolean; txHash?: string; error?: string; assets?: string }>} An object indicating the transaction's success, hash, assets received, or an error message.
 */
export async function withdrawFromSpark(
  userId: string,
  sharesAmount: string | 'max',
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
    
    // Handle max withdrawal or convert shares amount to proper units
    let sharesWei: bigint;
    
    // Check current share balance first
    const shareBalance = await publicClient.readContract({
      address: SPARK_CONTRACTS.SPARK_USDC_VAULT,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [smartAccount.address]
    });
    
    if (sharesAmount === 'max') {
      // Use exact balance for max exit to avoid precision issues
      sharesWei = shareBalance;
      console.log(`📤 MAX EXIT: Using exact balance ${sharesWei} wei (${(Number(sharesWei) / 1e18).toFixed(6)} SPARKUSDC)`);
    } else {
      // Convert shares amount to proper units (18 decimals for SPARKUSDC shares)
      sharesWei = parseUnits(sharesAmount as string, 18);
      
      if (shareBalance < sharesWei) {
        throw new Error(`Insufficient SPARKUSDC share balance. Have: ${shareBalance}, Need: ${sharesWei}`);
      }
    }
    
    if (sharesWei === 0n) {
      throw new Error('No SPARKUSDC shares to withdraw');
    }

    // Create sponsored bundler client for gasless transactions
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    // Using direct vault redeem (ERC4626 standard) - same as successful deposit pattern
    // The working deposit used direct vault interaction, so withdrawal should too
    
    const directRedeemCalldata = '0xba087652' +  // redeem(uint256,address,address) - ERC4626 standard
      sharesWei.toString(16).padStart(64, '0') +             // shares amount
      smartAccount.address.slice(2).padStart(64, '0') +      // receiver 
      smartAccount.address.slice(2).padStart(64, '0');       // owner

    const operations = [
      // Direct redeem from Spark vault (ERC4626)
      {
        to: SPARK_CONTRACTS.SPARK_USDC_VAULT,
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
 * Fetches a user's balance in the Spark USDC vault.
 * It returns both the raw share balance (SPARKUSDC) and the underlying USDC asset value.
 * @param {Address} userAddress - The user's wallet address.
 * @returns {Promise<{ shares: bigint; assets: bigint; sharesFormatted: string; assetsFormatted: string; }>} An object containing the raw and formatted share and asset balances.
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
      address: SPARK_CONTRACTS.SPARK_USDC_VAULT,
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
 * Fetches the current APY for the Spark USDC vault from the DeFiLlama API.
 * @returns {Promise<number>} A promise that resolves to the current APY as a percentage. Returns a default value on failure.
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
 * Fetches general information about the Spark USDC vault, including its Total Value Locked (TVL).
 * @returns {Promise<{ totalAssets: bigint; tvlFormatted: string; }>} An object containing the total assets in USDC units and the formatted TVL string.
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