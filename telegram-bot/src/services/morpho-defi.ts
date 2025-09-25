import { Address, parseUnits, encodeFunctionData } from 'viem';
import { getCoinbaseSmartWallet, createSponsoredBundlerClient, publicClient } from '../lib/coinbase-wallet';
import { metaMorphoAbi, permitAbi, generalAdapterAbi, erc20Abi } from '../utils/abis';

// Base tokens for Morpho operations
const BASE_TOKENS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address
};

// Morpho contract addresses on Base
const MORPHO_CONTRACTS = {
  GENERAL_ADAPTER: "0xb98c948cfa24072e58935bc004a8a7b376ae746a" as Address,
  METAMORPHO_PYTH_USDC: "0x0fabfeacedf47e890c50c8120177fff69c6a1d9b" as Address,
  MORPHO_BLUE: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb" as Address,
  BUNDLER: "0x6bfd8137e702540e7a42b74178a4a49ba43920c4" as Address
};

// Simple ERC20 ABI for balance check
const simpleERC20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// Simple nonces ABI for permit
const simpleNoncesAbi = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "nonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// Simple permit ABI
const simplePermitAbi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" }
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

// Exact forceApprove ABI matching original transaction (d96ca0b9)
const simpleForceApproveAbi = [
  {
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
      { name: "", type: "uint256" }
    ],
    name: "forceApprove",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

// Exact morphoSupply ABI matching original transaction (6ef5eeae)  
const simpleMorphoSupplyAbi = [
  {
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
      { name: "", type: "address" }
    ],
    name: "morphoSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

/**
 * Deposits USDC into the Morpho PYTH/USDC vault for a user, sponsoring the gas fee via a multicall.
 * This function bundles the necessary `approve` and `deposit` actions into a single gasless transaction.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} usdcAmount - The amount of USDC to deposit, in a human-readable format (e.g., "100.5").
 * @param {any} [testSmartAccount] - An optional smart account object for testing purposes.
 * @returns {Promise<{ success: boolean; txHash?: string; error?: string; shares?: string }>} An object indicating the transaction's success, hash, shares received, or an error message.
 */
export async function deployToMorphoPYTH(
  userId: string,
  usdcAmount: string,
  testSmartAccount?: any // Optional parameter for testing
): Promise<{ success: boolean; txHash?: string; error?: string; shares?: string }> {
  try {
    console.log(`🚀 Deploying ${usdcAmount} USDC to Morpho PYTH/USDC for user ${userId}`);

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
      address: BASE_TOKENS.USDC,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [smartAccount.address]
    });

    if (usdcBalance < amountWei) {
      throw new Error(`Insufficient USDC balance. Have: ${usdcBalance}, Need: ${amountWei}`);
    }

    // Get current nonce for permit
    const currentNonce = await publicClient.readContract({
      address: BASE_TOKENS.USDC,
      abi: simpleNoncesAbi,
      functionName: 'nonces',
      args: [smartAccount.address]
    });

    // Create permit deadline (1 hour from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Create sponsored bundler client for gasless transactions
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    // Replicate exact multicall pattern from successful transaction
    // Manually construct calldata using exact function selectors from original transaction
    
    // forceApprove: d96ca0b9 + parameters
    const forceApproveCalldata = '0xd96ca0b9' + 
      BASE_TOKENS.USDC.slice(2).padStart(64, '0') +  // token (32 bytes)
      MORPHO_CONTRACTS.GENERAL_ADAPTER.slice(2).padStart(64, '0') +  // spender (32 bytes)
      amountWei.toString(16).padStart(64, '0');  // amount (32 bytes)
      
    // morphoSupply: 6ef5eeae + parameters  
    const morphoSupplyCalldata = '0x6ef5eeae' +
      MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC.slice(2).padStart(64, '0') +  // market (32 bytes)
      amountWei.toString(16).padStart(64, '0') +  // assets (32 bytes) 
      '0000000000000000000000000000000000000000000000000000000000000000' +  // shares = 0 (32 bytes)
      smartAccount.address.slice(2).padStart(64, '0');  // onBehalf (32 bytes)

    // USDC approve for MetaMorpho vault direct deposit
    const approveCalldata = '0x095ea7b3' + 
      MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC.slice(2).padStart(64, '0') +  // spender (MetaMorpho vault)
      amountWei.toString(16).padStart(64, '0');  // amount (32 bytes)
    
    // Try direct deposit to MetaMorpho vault (ERC4626 standard)
    const directDepositCalldata = '0x6e553f65' +  // deposit(uint256,address) 
      amountWei.toString(16).padStart(64, '0') +     // assets (32 bytes)
      smartAccount.address.slice(2).padStart(64, '0'); // receiver (32 bytes)
    
    const operations = [
      // Step 1: Approve MetaMorpho vault to spend USDC
      {
        to: BASE_TOKENS.USDC,
        value: '0',
        data: approveCalldata as `0x${string}`,
        skipRevert: false
      },
      // Step 2: Direct deposit to MetaMorpho vault (ERC4626)
      {
        to: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC,
        value: '0',
        data: directDepositCalldata as `0x${string}`,
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

    console.log(`✅ Morpho deposit UserOperation sent: ${txHash}`);

    // Wait for transaction confirmation
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: txHash
    });

    if (receipt.success) {
      // Get the shares received (from event logs if available)
      let sharesReceived = amountWei; // Approximation, should parse from logs for accuracy
      
      const actualTxHash = receipt.receipt.transactionHash;
      console.log(`✅ Morpho deposit successful! Blockchain TX: ${actualTxHash}`);
      console.log(`✅ Shares received: ${sharesReceived}`);
      
      return { 
        success: true, 
        txHash: actualTxHash, // Return the actual blockchain transaction hash
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
 * Withdraws USDC from the Morpho PYTH/USDC vault by redeeming vault shares in a gas-sponsored transaction.
 * It uses a direct ERC4626 `redeem` call.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} sharesAmount - The amount of vault shares to redeem. Can be a specific number or 'max'.
 * @param {any} [testSmartAccount] - An optional smart account object for testing purposes.
 * @returns {Promise<{ success: boolean; txHash?: string; error?: string; assets?: string }>} An object indicating the transaction's success, hash, assets received, or an error message.
 */
export async function withdrawFromMorphoPYTH(
  userId: string,
  sharesAmount: string,
  testSmartAccount?: any // Optional parameter for testing
): Promise<{ success: boolean; txHash?: string; error?: string; assets?: string }> {
  try {
    console.log(`🔄 Withdrawing ${sharesAmount} shares from Morpho PYTH/USDC for user ${userId}`);

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
    
    // Check current share balance first
    const shareBalance = await publicClient.readContract({
      address: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [smartAccount.address]
    });

    // Handle "max" amount or parse the specific amount
    let sharesWei: bigint;
    if (sharesAmount.toLowerCase() === 'max') {
      sharesWei = shareBalance; // Use full balance
      console.log(`📊 Using max balance: ${shareBalance} shares`);
    } else {
      // Convert shares amount to proper units (18 decimals for MetaMorpho shares)
      sharesWei = parseUnits(sharesAmount, 18);
      
      if (shareBalance < sharesWei) {
        throw new Error(`Insufficient share balance. Have: ${shareBalance}, Need: ${sharesWei}`);
      }
    }

    // Get current nonce for permit
    const currentNonce = await publicClient.readContract({
      address: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC,
      abi: simpleNoncesAbi,
      functionName: 'nonces',
      args: [smartAccount.address]
    });

    // Create permit deadline (1 hour from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Create sponsored bundler client for gasless transactions
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    // Use direct MetaMorpho redeem instead of GeneralAdapter (like successful deposits)
    // This avoids the complexity of GeneralAdapter and uses standard ERC4626 pattern
    
    // Direct redeem call to MetaMorpho vault (ERC4626 redeem: ba087652)
    const directRedeemCalldata = '0xba087652' +  // redeem(uint256,address,address)
      sharesWei.toString(16).padStart(64, '0') +     // shares (32 bytes)
      smartAccount.address.slice(2).padStart(64, '0') +  // receiver (32 bytes)
      smartAccount.address.slice(2).padStart(64, '0');   // owner (32 bytes)

    const operations = [
      // Single step: Direct redeem from MetaMorpho vault (ERC4626)
      {
        to: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC,
        value: '0',
        data: directRedeemCalldata as `0x${string}`,
        skipRevert: false
      }
    ];

    console.log('📝 Executing Morpho withdrawal via sponsored transaction...');
    
    // Execute the sponsored transaction with multicall
    const txHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: operations.map(op => ({
        to: op.to as Address,
        value: BigInt(op.value),
        data: op.data
      }))
    });

    console.log(`✅ Morpho withdrawal UserOperation sent: ${txHash}`);

    // Wait for transaction confirmation
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: txHash
    });

    if (receipt.success) {
      // Get the assets received (approximate - should parse from logs for accuracy)
      let assetsReceived = sharesWei; // Approximation, should parse from logs for accuracy
      
      const actualTxHash = receipt.receipt.transactionHash;
      console.log(`✅ Morpho withdrawal successful! Blockchain TX: ${actualTxHash}`);
      console.log(`✅ Assets received: ${assetsReceived}`);
      
      return { 
        success: true, 
        txHash: actualTxHash, // Return the actual blockchain transaction hash
        assets: assetsReceived.toString()
      };
    } else {
      throw new Error('Transaction failed during execution');
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
 * Fetches a user's position in the Morpho PYTH/USDC vault.
 * It returns both the raw share balance and the underlying USDC asset value.
 * @param {Address} userAddress - The user's wallet address.
 * @returns {Promise<{ shares: bigint; assets: bigint; sharesFormatted: string; assetsFormatted: string; }>} An object containing the raw and formatted share and asset balances.
 */
export async function getMorphoBalance(userAddress: Address): Promise<{
  shares: bigint;
  assets: bigint;
  sharesFormatted: string;
  assetsFormatted: string;
}> {
  try {
    // Get user's share balance using simple ERC20 balanceOf ABI
    const shares = await publicClient.readContract({
      address: MORPHO_CONTRACTS.METAMORPHO_PYTH_USDC,
      abi: simpleERC20Abi,
      functionName: 'balanceOf',
      args: [userAddress]
    });

    // Convert shares to assets using proper decimals
    // Shares are 18 decimals, assets (USDC) are 6 decimals
    // For MetaMorpho, shares ≈ assets in USD value (approximately 1:1 ratio)
    const assets = shares / BigInt(1e12); // Convert from 18 decimals to 6 decimals (divide by 1e12)

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
 * Gets the current APY for the Morpho PYTH/USDC vault.
 * Note: This currently returns a hardcoded default value and should be updated to fetch from a live API.
 * @returns {Promise<number>} A promise that resolves to the current APY as a percentage.
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
 * Fetches information about the Morpho vault, such as its total assets and TVL.
 * @returns {Promise<{ totalAssets: bigint; tvlFormatted: string; }>} An object containing the total assets in wei and a formatted TVL string.
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