import { Address } from "viem";

export interface WalletData {
  address: Address;
  encryptedPrivateKey: string;
  type: "imported" | "generated";
  createdAt: number;
  autoCreated?: boolean;
}

export interface TransactionParams {
  to: Address;
  data: string;
  value: string;
  gasPrice: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface WithdrawalParams {
  from: Address;
  to: Address;
  amount: string; // in wei
  gasPrice: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: BigInt;
  status: "success" | "failure";
  gasUsed: string;
}

// DeFi-specific transaction types
export interface ZapParams {
  poolAddress: Address;
  tokenIn: Address;
  amountIn: string;
  minAmountOut: string;
  swapData?: string; // 1inch swap calldata if needed
}

export interface HarvestParams {
  poolAddress: Address;
  compound: boolean; // true to compound, false to withdraw
}