import { Address, parseUnits, encodeFunctionData } from 'viem';
import { getCoinbaseSmartWallet, createSponsoredBundlerClient, publicClient, cdpPaymasterClient } from '../lib/coinbase-wallet';
import { updateUserOnboardingStatus } from '../lib/database';

// Contract addresses
const COMPOUND_V3_USDC_ADDRESS = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf" as Address;
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

// Constants for USDC gas payments via paymaster
const MIN_USDC_THRESHOLD = parseUnits('1', 6); // $1 minimum for gas
const USDC_APPROVAL_AMOUNT = parseUnits('20', 6); // $20 approval for gas payments

// CDP Paymaster contract address (will be determined from paymaster response)
let PAYMASTER_CONTRACT_ADDRESS: Address | null = null;

// ERC-20 ABI for approve and allowance
const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: true,
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// Compound V3 ABI for supply
const COMPOUND_V3_ABI = [
  {
    constant: false,
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'supply',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

/**
 * Auto-deploy USDC to Compound V3 with sponsored gas
 */
export async function autoDeployToCompoundV3(
  userId: string, 
  usdcAmount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log(`🚀 Auto-deploying ${usdcAmount} USDC to Compound V3 for user ${userId}`);

    // Get user's Coinbase Smart Wallet
    const wallet = await getCoinbaseSmartWallet(userId);
    if (!wallet) {
      throw new Error('No Coinbase Smart Wallet found for user');
    }

    const { smartAccount } = wallet;

    // Convert USDC amount to proper units (6 decimals)
    const amountWei = parseUnits(usdcAmount, 6);

    // Create bundler client with CDP paymaster for USDC gas payments
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    console.log(`🚀 Preparing USDC gas payment transaction for ${usdcAmount} USDC...`);
    
    // Check if paymaster approval is needed for USDC gas payments
    let paymasterApprovalNeeded = false;
    let paymasterAddress: Address | null = null;

    // Build calls array - start with main transaction calls
    const calls = [];

    // Note: We'll first try without paymaster approval, and add it if needed based on error response
    
    // Main transaction calls
    calls.push(
      // 1. Approve Compound V3 to spend USDC
      {
        abi: ERC20_ABI,
        functionName: 'approve',
        to: BASE_USDC_ADDRESS,
        args: [COMPOUND_V3_USDC_ADDRESS, amountWei],
      },
      // 2. Supply USDC to Compound V3
      {
        abi: COMPOUND_V3_ABI,
        functionName: 'supply',
        to: COMPOUND_V3_USDC_ADDRESS,
        args: [BASE_USDC_ADDRESS, amountWei],
      }
    );

    console.log(`📡 Sending UserOperation with USDC gas payment...`);

    // Configure gas estimation (pad for safety)
    smartAccount.userOperation = {
      estimateGas: async (userOperation: any) => {
        const estimate = await bundlerClient.estimateUserOperationGas(userOperation);
        // Increase gas limits for safety
        estimate.preVerificationGas = estimate.preVerificationGas * 2n;
        estimate.callGasLimit = estimate.callGasLimit * 120n / 100n; // +20%
        return estimate;
      },
    };

    // Send UserOperation with USDC gas payment via CDP paymaster
    const userOpHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls,
      paymaster: cdpPaymasterClient, // Use CDP paymaster client
      paymasterContext: {
        erc20: BASE_USDC_ADDRESS // Tell paymaster to use USDC for gas payment
      }
    });

    console.log(`⏳ Waiting for transaction confirmation: ${userOpHash}`);

    // Wait for transaction receipt
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log(`✅ Transaction confirmed! Hash: ${receipt.receipt.transactionHash}`);

    // Complete user onboarding
    updateUserOnboardingStatus(userId, true);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash
    };

  } catch (error: any) {
    console.error('Error auto-deploying to Compound V3:', error);
    
    // Check if it's a paymaster rejection with token info
    if (error.code === -32002 && error.data?.acceptedTokens) {
      console.error('Paymaster rejection - accepted tokens:', error.data.acceptedTokens);
      console.error('Paymaster address:', error.data.paymasterAddress);
      
      // TODO: Could implement retry logic with paymaster approval here
      return {
        success: false,
        error: `Paymaster requires USDC approval. Address: ${error.data.paymasterAddress}`
      };
    }
    
    // Log full error details for debugging
    console.error('Full error details:', {
      message: error.message,
      cause: error.cause?.message,
      details: error.details,
      code: error.code,
      data: error.data,
      stack: error.stack?.split('\n').slice(0, 5) // First 5 lines of stack trace
    });
    
    return {
      success: false,
      error: error.message || error.details || 'Unknown error occurred'
    };
  }
}

/**
 * Get current Compound V3 APY (hardcoded for now)
 */
export function getCompoundV3APY(): number {
  return 8.33; // Current APY for USDC on Compound V3
}

/**
 * Check if user has funds deployed in Compound V3
 */
export async function getCompoundV3Balance(walletAddress: Address): Promise<string> {
  try {
    const { coinbasePublicClient } = await import('../lib/coinbase-wallet');
    
    const balance = await coinbasePublicClient.readContract({
      address: COMPOUND_V3_USDC_ADDRESS,
      abi: [
        {
          constant: true,
          inputs: [{ name: 'account', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: '', type: 'uint256' }],
          type: 'function',
        },
      ],
      functionName: 'balanceOf',
      args: [walletAddress],
    });

    // Convert from 6 decimals to readable format
    const balanceFormatted = (Number(balance) / Math.pow(10, 6)).toFixed(2);
    return balanceFormatted;

  } catch (error) {
    console.error('Error checking Compound V3 balance:', error);
    return '0.00';
  }
}