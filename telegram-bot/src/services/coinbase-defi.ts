import { Address, parseUnits, encodeFunctionData } from 'viem';
import { getCoinbaseSmartWallet, createSponsoredBundlerClient, publicClient, cdpPaymasterClient, getCoinbaseWalletUSDCBalance } from '../lib/coinbase-wallet';
import { updateUserOnboardingStatus } from '../lib/database';

// Contract addresses - Using correct Base Compound V3 USDC proxy address
const COMPOUND_V3_USDC_ADDRESS = "0xb125e6687d4313864e53df431d5425969c15eb2f" as Address;
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

// Compound V3 ABI for supply and withdraw
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
  },
  {
    constant: false,
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'withdraw',
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

    // Check current USDC balance
    const currentBalance = await getCoinbaseWalletUSDCBalance(smartAccount.address);
    const currentBalanceWei = parseUnits(currentBalance, 6);
    
    // Reserve small amount for gas (Base gas is ~1¢)
    const gasReserveWei = parseUnits('0.05', 6); // $0.05 USDC reserve for gas (5 cents)
    
    // Auto-fit deployment amount to available balance minus gas reserve
    let deployAmountWei: bigint;
    let actualDeployAmount: string;
    
    if (currentBalanceWei <= gasReserveWei) {
      throw new Error(`Insufficient USDC balance for gas fees. Have: ${currentBalance} USDC, Need at least: $0.05 USDC for gas`);
    }
    
    const maxDeployableWei = currentBalanceWei - gasReserveWei;
    
    if (amountWei > maxDeployableWei) {
      // Auto-fit to available balance
      deployAmountWei = maxDeployableWei;
      actualDeployAmount = (Number(deployAmountWei) / Math.pow(10, 6)).toFixed(2);
      console.log(`💰 Auto-fitting deployment: ${usdcAmount} USDC requested, deploying ${actualDeployAmount} USDC (reserved $0.05 for gas)`);
    } else {
      // Use requested amount
      deployAmountWei = amountWei;
      actualDeployAmount = usdcAmount;
      console.log(`💰 Deploying full amount: ${actualDeployAmount} USDC (${currentBalance} USDC available, $0.05 reserved for gas)`);
    }

    // Create bundler client with CDP paymaster for USDC gas payments
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    console.log(`🚀 Preparing USDC gas payment transaction for ${actualDeployAmount} USDC...`);
    
    // CDP Paymaster contract address (extracted from error logs)
    const PAYMASTER_CONTRACT_ADDRESS = "0x2faeb0760d4230ef2ac21496bb4f0b47d634fd4c" as Address;
    const GAS_APPROVAL_AMOUNT = parseUnits('5', 6); // $5 USDC approval for gas payments

    // Build calls array with paymaster approval
    const calls = [];
    
    // Simple calls - just approve and supply (paymaster approval is handled automatically)
    calls.push(
      // 1. Approve Compound V3 to spend USDC
      {
        abi: ERC20_ABI,
        functionName: 'approve',
        to: BASE_USDC_ADDRESS,
        args: [COMPOUND_V3_USDC_ADDRESS, deployAmountWei],
      },
      // 2. Supply USDC to Compound V3
      {
        abi: COMPOUND_V3_ABI,
        functionName: 'supply',
        to: COMPOUND_V3_USDC_ADDRESS,
        args: [BASE_USDC_ADDRESS, deployAmountWei],
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
      paymaster: cdpPaymasterClient,
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
    
    // Check for Compound V3 specific errors
    if (error.message?.includes('0x36405305')) {
      console.error('Compound V3 contract error - likely SupplyCapExceeded or NotCollateralized');
      return {
        success: false,
        error: 'Compound V3 market may have reached supply cap or requires different configuration. Please try again later or contact support.'
      };
    }
    
    // Check if it's a paymaster rejection with token info
    if (error.code === -32002 && error.data?.acceptedTokens) {
      console.error('Paymaster rejection - accepted tokens:', error.data.acceptedTokens);
      console.error('Paymaster address:', error.data.paymasterAddress);
      
      return {
        success: false,
        error: `Paymaster requires USDC approval. Address: ${error.data.paymasterAddress}`
      };
    }
    
    // Check for gas-related errors
    if (error.message?.includes('transfer amount exceeds balance')) {
      return {
        success: false,
        error: `Insufficient USDC balance for deployment and gas fees.`
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
 * Get current Compound V3 APY from DefiLlama
 */
export async function getCompoundV3APY(): Promise<number> {
  const { getCompoundV3APY } = await import('../lib/defillama-api');
  return await getCompoundV3APY();
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

/**
 * Withdraw USDC from Compound V3 with CDP sponsored gas
 */
export async function withdrawFromCompoundV3(
  userId: string, 
  usdcAmount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log(`💸 Withdrawing ${usdcAmount} USDC from Compound V3 for user ${userId}`);

    // Get user's Coinbase Smart Wallet
    const wallet = await getCoinbaseSmartWallet(userId);
    if (!wallet) {
      throw new Error('No Coinbase Smart Wallet found for user');
    }

    const { smartAccount } = wallet;

    // Convert USDC amount to proper units (6 decimals)
    const withdrawAmountWei = parseUnits(usdcAmount, 6);

    // Check current Compound V3 balance
    const compoundBalance = await getCompoundV3Balance(smartAccount.address);
    const compoundBalanceWei = parseUnits(compoundBalance, 6);
    
    if (compoundBalanceWei === 0n) {
      throw new Error('No USDC deposited in Compound V3 to withdraw');
    }
    
    if (withdrawAmountWei > compoundBalanceWei) {
      throw new Error(`Insufficient Compound V3 balance. Requested: ${usdcAmount} USDC, Available: ${compoundBalance} USDC`);
    }

    // Create bundler client with CDP paymaster for USDC gas payments
    const bundlerClient = await createSponsoredBundlerClient(smartAccount);

    console.log(`🚀 Preparing USDC gas payment transaction for ${usdcAmount} USDC withdrawal...`);

    // Build calls array - just withdraw (no approval needed for withdrawals)
    const calls = [
      {
        abi: COMPOUND_V3_ABI,
        functionName: 'withdraw',
        to: COMPOUND_V3_USDC_ADDRESS,
        args: [BASE_USDC_ADDRESS, withdrawAmountWei],
      }
    ];

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
      paymaster: cdpPaymasterClient,
      paymasterContext: {
        erc20: BASE_USDC_ADDRESS // Tell paymaster to use USDC for gas payment
      }
    });

    console.log(`⏳ Waiting for withdrawal confirmation: ${userOpHash}`);

    // Wait for transaction receipt
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log(`✅ Withdrawal confirmed! Hash: ${receipt.receipt.transactionHash}`);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash
    };

  } catch (error: any) {
    console.error('Error withdrawing from Compound V3:', error);
    
    // Check for Compound V3 specific errors
    if (error.message?.includes('0x36405305')) {
      console.error('Compound V3 contract error during withdrawal');
      return {
        success: false,
        error: 'Compound V3 withdrawal failed due to contract error. Please try again later or contact support.'
      };
    }
    
    // Check if it's a paymaster rejection
    if (error.code === -32002 && error.data?.acceptedTokens) {
      console.error('Paymaster rejection during withdrawal:', error.data);
      return {
        success: false,
        error: `Gas payment failed. Please ensure you have some USDC for gas fees.`
      };
    }
    
    // Check for insufficient balance errors
    if (error.message?.includes('Insufficient') || error.message?.includes('No USDC deposited')) {
      return {
        success: false,
        error: error.message
      };
    }
    
    // Log full error details for debugging
    console.error('Full withdrawal error details:', {
      message: error.message,
      cause: error.cause?.message,
      details: error.details,
      code: error.code,
      data: error.data,
      stack: error.stack?.split('\n').slice(0, 5)
    });
    
    return {
      success: false,
      error: error.message || error.details || 'Unknown withdrawal error occurred'
    };
  }
}