import { Address } from "viem";

/**
 * Defines the structure for storing wallet data in the database.
 */
export interface WalletData {
  /** The public address of the wallet. */
  address: Address;
  /** The encrypted private key of the wallet. */
  encryptedPrivateKey: string;
  /** The type of wallet. */
  type: "imported" | "generated" | "coinbase-smart-wallet";
  /** The timestamp when the wallet was created. */
  createdAt: number;
  /** A flag indicating if the wallet was created automatically for the user. */
  autoCreated?: boolean;
  /** A flag indicating if the smart wallet contract has been deployed on-chain. */
  isDeployed?: boolean;
}

/**
 * Defines the parameters for a generic blockchain transaction.
 */
export interface TransactionParams {
  /** The recipient's address. */
  to: Address;
  /** The encoded transaction data. */
  data: string;
  /** The amount of ETH to send with the transaction, in wei. */
  value: string;
  /** The gas price for legacy transactions. */
  gasPrice: string;
  /** The maximum fee per gas for EIP-1559 transactions. */
  maxFeePerGas?: string;
  /** The maximum priority fee per gas for EIP-1559 transactions. */
  maxPriorityFeePerGas?: string;
}

/**
 * Defines the parameters for a withdrawal transaction.
 */
export interface WithdrawalParams {
  /** The sender's address. */
  from: Address;
  /** The recipient's address. */
  to: Address;
  /** The amount to withdraw, in wei. */
  amount: string;
  /** The gas price for the transaction. */
  gasPrice: string;
  /** The maximum fee per gas for EIP-1559 transactions. */
  maxFeePerGas?: string;
  /** The maximum priority fee per gas for EIP-1559 transactions. */
  maxPriorityFeePerGas?: string;
}

/**
 * Defines the structure of a transaction receipt after it has been mined.
 */
export interface TransactionReceipt {
  /** The unique hash of the transaction. */
  transactionHash: string;
  /** The block number in which the transaction was included. */
  blockNumber: BigInt;
  /** The status of the transaction. */
  status: "success" | "failure";
  /** The amount of gas used by the transaction. */
  gasUsed: string;
}

/**
 * Defines the parameters for a "zap" (invest) transaction into a DeFi pool.
 */
export interface ZapParams {
  /** The address of the DeFi pool. */
  poolAddress: Address;
  /** The address of the input token. */
  tokenIn: Address;
  /** The amount of the input token, in its smallest unit. */
  amountIn: string;
  /** The minimum amount of the output token to receive, to protect against slippage. */
  minAmountOut: string;
  /** Optional encoded swap data if a token swap is required. */
  swapData?: string;
}

/**
 * Defines the parameters for a harvest transaction to claim yields from a DeFi pool.
 */
export interface HarvestParams {
  /** The address of the DeFi pool. */
  poolAddress: Address;
  /** A flag to determine whether to compound the earnings or withdraw them. */
  compound: boolean;
}