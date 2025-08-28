import { Address, parseUnits, formatEther } from "viem";
import { WalletData, TransactionReceipt } from "../types/wallet";
import { executeContractMethod, getTokenAllowance, getEthBalance } from "./token-wallet";
import { BASE_TOKENS, MAX_UINT256 } from "../utils/constants";

// Aave V3 Pool contract address on Base
const AAVE_V3_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address;

// Compound V3 USDC contract address on Base  
const COMPOUND_V3_USDC = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf" as Address;

// Fluid Finance fUSDC contract address on Base
const FLUID_FUSDC = "0xf42f5795d9ac7e9d757db633d693cd548cfd9169" as Address;

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
  },
  {
    "inputs": [
      {"internalType": "address", "name": "asset", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"},
      {"internalType": "address", "name": "to", "type": "address"}
    ],
    "name": "withdraw",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
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

// Fluid Finance fToken ABI - deposit/withdraw functions
const FLUID_FTOKEN_ABI = [
  {
    "inputs": [
      {"internalType": "uint256", "name": "amount_", "type": "uint256"},
      {"internalType": "address", "name": "receiver_", "type": "address"}
    ],
    "name": "deposit",
    "outputs": [{"internalType": "uint256", "name": "shares_", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "amount_", "type": "uint256"},
      {"internalType": "address", "name": "receiver_", "type": "address"},
      {"internalType": "address", "name": "owner_", "type": "address"}
    ],
    "name": "withdraw",
    "outputs": [{"internalType": "uint256", "name": "shares_", "type": "uint256"}],
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
 * Withdraw USDC from Aave V3
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5") or "max" for full withdrawal
 * @param claimRewards Whether to claim rewards before withdrawal (default true for max, false for partial)
 * @returns Transaction receipt
 */
export async function withdrawFromAave(
  walletData: WalletData,
  amountUsdc: string,
  claimRewards?: boolean
): Promise<TransactionReceipt> {
  const userAddress = walletData.address as Address;
  const isMaxWithdrawal = amountUsdc.toLowerCase() === "max";
  
  // Check ETH balance for gas fees first
  await checkEthBalance(walletData, "0.0001");

  // Default behavior: claim rewards for max withdrawal, don't claim for partial
  const shouldClaimRewards = claimRewards !== undefined ? claimRewards : isMaxWithdrawal;

  // If claiming rewards, do that first (this is a simplified version - Aave rewards need specific setup)
  if (shouldClaimRewards) {
    console.log("Note: Reward claiming would happen here - currently simplified for v1");
    // TODO: Implement actual reward claiming when Aave rewards are configured
  }

  // For max withdrawal, use MAX_UINT256 which tells Aave to withdraw all aTokens
  const usdcAmount = isMaxWithdrawal 
    ? BigInt(MAX_UINT256)
    : parseUnits(amountUsdc, 6);

  console.log(`Withdrawing ${isMaxWithdrawal ? "all" : amountUsdc} USDC from Aave V3${shouldClaimRewards ? " (with rewards)" : ""}...`);
  
  const receipt = await executeContractMethod({
    walletData,
    contractAddress: AAVE_V3_POOL,
    abi: AAVE_POOL_ABI,
    functionName: "withdraw",
    args: [
      BASE_TOKENS.USDC, // asset
      usdcAmount.toString(), // amount (MAX_UINT256 for full withdrawal)
      userAddress // to (where to send withdrawn USDC)
    ]
  });

  return receipt;
}

/**
 * Supply USDC to Fluid Finance
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5")
 * @returns Transaction receipt
 */
export async function supplyToFluid(
  walletData: WalletData,
  amountUsdc: string
): Promise<TransactionReceipt> {
  const userAddress = walletData.address as Address;
  const usdcAmount = parseUnits(amountUsdc, 6); // USDC has 6 decimals

  // Check ETH balance for gas fees first
  await checkEthBalance(walletData, "0.0001");

  // Step 1: Check and approve USDC allowance for Fluid fUSDC
  const currentAllowance = await getTokenAllowance(
    BASE_TOKENS.USDC,
    userAddress,
    FLUID_FUSDC
  );

  if (BigInt(currentAllowance) < usdcAmount) {
    console.log("Approving USDC for Fluid Finance...");
    
    const approvalReceipt = await executeContractMethod({
      walletData,
      contractAddress: BASE_TOKENS.USDC,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [FLUID_FUSDC, MAX_UINT256] // Approve max amount for future transactions
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
      FLUID_FUSDC
    );
    
    console.log(`New allowance after approval: ${newAllowance}`);
    
    if (BigInt(newAllowance) < usdcAmount) {
      throw new Error(`Approval failed to set sufficient allowance. Got: ${newAllowance}, Need: ${usdcAmount.toString()}`);
    }
  }

  // Step 2: Deposit USDC to Fluid
  console.log(`Depositing ${amountUsdc} USDC to Fluid Finance...`);
  
  const receipt = await executeContractMethod({
    walletData,
    contractAddress: FLUID_FUSDC,
    abi: FLUID_FTOKEN_ABI,
    functionName: "deposit",
    args: [
      usdcAmount.toString(), // amount_
      userAddress // receiver_ (user receives fUSDC tokens)
    ]
  });

  return receipt;
}

/**
 * Withdraw USDC from Fluid Finance
 * @param walletData User's wallet data
 * @param amountUsdc Amount in USDC (human readable, e.g., "100.5") or "max" for full withdrawal
 * @param claimRewards Whether to claim rewards before withdrawal (default true for max, false for partial)
 * @returns Transaction receipt
 */
export async function withdrawFromFluid(
  walletData: WalletData,
  amountUsdc: string,
  claimRewards?: boolean
): Promise<TransactionReceipt> {
  const userAddress = walletData.address as Address;
  const isMaxWithdrawal = amountUsdc.toLowerCase() === "max";
  
  // Check ETH balance for gas fees first
  await checkEthBalance(walletData, "0.0001");

  // Default behavior: claim rewards for max withdrawal, don't claim for partial
  const shouldClaimRewards = claimRewards !== undefined ? claimRewards : isMaxWithdrawal;

  // If claiming rewards, do that first (this is a simplified version - Fluid rewards need specific setup)
  if (shouldClaimRewards) {
    console.log("Note: Reward claiming would happen here - currently simplified for v1");
    // TODO: Implement actual reward claiming when Fluid rewards are configured
  }

  // For max withdrawal, use MAX_UINT256 which tells Fluid to withdraw all fUSDC
  const usdcAmount = isMaxWithdrawal 
    ? BigInt(MAX_UINT256)
    : parseUnits(amountUsdc, 6);

  console.log(`Withdrawing ${isMaxWithdrawal ? "all" : amountUsdc} USDC from Fluid Finance${shouldClaimRewards ? " (with rewards)" : ""}...`);
  
  const receipt = await executeContractMethod({
    walletData,
    contractAddress: FLUID_FUSDC,
    abi: FLUID_FTOKEN_ABI,
    functionName: "withdraw",
    args: [
      usdcAmount.toString(), // amount_ (MAX_UINT256 for full withdrawal)
      userAddress, // receiver_ (where to send withdrawn USDC)
      userAddress  // owner_ (who owns the fUSDC tokens)
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
    
    case "fluid":
      return await supplyToFluid(walletData, amountUsdc);
    
    case "compound":
      return await supplyToCompound(walletData, amountUsdc);
    
    default:
      throw new Error(`Unsupported protocol: ${protocol}`);
  }
}