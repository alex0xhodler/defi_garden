import { Address, parseUnits, formatEther } from "viem";
import { WalletData, TransactionReceipt } from "../types/wallet";
import { executeContractMethod, getTokenAllowance, getEthBalance } from "./token-wallet";
import { BASE_TOKENS, MAX_UINT256 } from "../utils/constants";

// Aave V3 Pool contract address on Base
const AAVE_V3_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address;

// Compound V3 USDC contract address on Base  
const COMPOUND_V3_USDC = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf" as Address;

// Aave V3 Pool ABI - only the functions we need
const AAVE_POOL_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "asset", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"},
      {"internalType": "address", "name": "onBehalfOf", "type": "address"},
      {"internalType": "uint16", "name": "referralCode", "type": "uint16"}
    ],
    "name": "supply",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Compound V3 ABI - only the functions we need
const COMPOUND_V3_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "asset", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "supply",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// ERC20 ABI for approve function
const ERC20_APPROVE_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

/**
 * Check if wallet has sufficient ETH for gas fees
 * @param walletData User's wallet data
 * @param minEthRequired Minimum ETH required (default 0.0001 ETH)
 * @returns Promise<void> - throws error if insufficient
 */
async function checkEthBalance(walletData: WalletData, minEthRequired: string = "0.0001"): Promise<void> {
  const userAddress = walletData.address as Address;
  const ethBalance = await getEthBalance(userAddress);
  const balanceInEth = formatEther(BigInt(ethBalance));
  
  console.log(`Wallet ETH balance: ${balanceInEth} ETH`);
  
  if (parseFloat(balanceInEth) < parseFloat(minEthRequired)) {
    throw new Error(
      `Insufficient ETH for gas fees. You have ${balanceInEth} ETH but need at least ${minEthRequired} ETH. ` +
      `Please deposit ETH to ${userAddress} on Base network.`
    );
  }
}

/**
 * Supply USDC to Aave V3
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5")
 * @returns Transaction receipt
 */
export async function supplyToAave(
  walletData: WalletData,
  amountUsdc: string
): Promise<TransactionReceipt> {
  const userAddress = walletData.address as Address;
  const usdcAmount = parseUnits(amountUsdc, 6); // USDC has 6 decimals

  // Check ETH balance for gas fees first
  await checkEthBalance(walletData, "0.0001"); // Require 0.0001 ETH minimum (~40 cents)

  // Step 1: Check and approve USDC allowance for Aave Pool
  const currentAllowance = await getTokenAllowance(
    BASE_TOKENS.USDC,
    userAddress,
    AAVE_V3_POOL
  );

  if (BigInt(currentAllowance) < usdcAmount) {
    console.log("Approving USDC for Aave Pool...");
    
    const approvalReceipt = await executeContractMethod({
      walletData,
      contractAddress: BASE_TOKENS.USDC,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [AAVE_V3_POOL, MAX_UINT256] // Approve max amount for future transactions
    });

    console.log(`Approval transaction confirmed: ${approvalReceipt.transactionHash}`);
    
    // Verify the approval was successful
    if (approvalReceipt.status !== "success") {
      throw new Error(`Approval transaction failed: ${approvalReceipt.transactionHash}`);
    }

    // Double-check the allowance was actually set
    const newAllowance = await getTokenAllowance(
      BASE_TOKENS.USDC,
      userAddress,
      AAVE_V3_POOL
    );
    
    console.log(`New allowance after approval: ${newAllowance}`);
    
    if (BigInt(newAllowance) < usdcAmount) {
      throw new Error(`Approval failed to set sufficient allowance. Got: ${newAllowance}, Need: ${usdcAmount.toString()}`);
    }
  }

  // Step 2: Supply USDC to Aave
  console.log(`Supplying ${amountUsdc} USDC to Aave V3...`);
  
  const receipt = await executeContractMethod({
    walletData,
    contractAddress: AAVE_V3_POOL,
    abi: AAVE_POOL_ABI,
    functionName: "supply",
    args: [
      BASE_TOKENS.USDC, // asset
      usdcAmount.toString(), // amount
      userAddress, // onBehalfOf (user receives aTokens)
      0 // referralCode (0 = no referral)
    ]
  });

  return receipt;
}

/**
 * Supply USDC to Compound V3
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5")
 * @returns Transaction receipt
 */
export async function supplyToCompound(
  walletData: WalletData,
  amountUsdc: string
): Promise<TransactionReceipt> {
  const userAddress = walletData.address as Address;
  const usdcAmount = parseUnits(amountUsdc, 6); // USDC has 6 decimals

  // Check ETH balance for gas fees first
  await checkEthBalance(walletData, "0.0001"); // Require 0.0001 ETH minimum (~40 cents)

  // Step 1: Check and approve USDC allowance for Compound V3
  const currentAllowance = await getTokenAllowance(
    BASE_TOKENS.USDC,
    userAddress,
    COMPOUND_V3_USDC
  );

  if (BigInt(currentAllowance) < usdcAmount) {
    console.log("Approving USDC for Compound V3...");
    
    const approvalReceipt = await executeContractMethod({
      walletData,
      contractAddress: BASE_TOKENS.USDC,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [COMPOUND_V3_USDC, MAX_UINT256] // Approve max amount
    });

    console.log(`Approval transaction confirmed: ${approvalReceipt.transactionHash}`);
    
    // Verify the approval was successful
    if (approvalReceipt.status !== "success") {
      throw new Error(`Approval transaction failed: ${approvalReceipt.transactionHash}`);
    }
  }

  // Step 2: Supply USDC to Compound
  console.log(`Supplying ${amountUsdc} USDC to Compound V3...`);
  
  const receipt = await executeContractMethod({
    walletData,
    contractAddress: COMPOUND_V3_USDC,
    abi: COMPOUND_V3_ABI,
    functionName: "supply",
    args: [
      BASE_TOKENS.USDC, // asset
      usdcAmount.toString() // amount
    ]
  });

  return receipt;
}

/**
 * Execute a zap transaction to the specified protocol
 * @param protocol Protocol name ("Aave" or "Compound")
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC to supply
 * @returns Transaction receipt
 */
export async function executeZap(
  protocol: string,
  walletData: WalletData,
  amountUsdc: string
): Promise<TransactionReceipt> {
  switch (protocol.toLowerCase()) {
    case "aave":
      return await supplyToAave(walletData, amountUsdc);
    
    case "compound":
      return await supplyToCompound(walletData, amountUsdc);
    
    default:
      throw new Error(`Unsupported protocol: ${protocol}`);
  }
}