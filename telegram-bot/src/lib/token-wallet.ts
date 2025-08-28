import {
  createWalletClient,
  http,
  createPublicClient,
  Account,
  WalletClient,
  Address,
  formatUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { encrypt, decrypt } from "./encryption";
import { saveWallet, getWalletByUserId } from "./database";
import {
  WalletData,
  TransactionParams,
  WithdrawalParams,
  TransactionReceipt,
} from "../types/wallet";
import { TokenInfo } from "../types/config";
import { erc20Abi } from "../utils/abis";
import {
  QUICKNODE_RPC_URL,
  COMMON_TOKENS,
  NATIVE_TOKEN_ADDRESS,
  MAX_UINT256,
  BASE_TOKENS,
  isRpcConfigured,
} from "../utils/constants";

// *** WALLET FUNCTIONS *** //

/**
 * Create a wallet client for the given private key
 */
function createClient(account: Account): WalletClient {
  return createWalletClient({
    account,
    chain: base,
    transport: http(QUICKNODE_RPC_URL),
  });
}

/**
 * Create a public client for Base network
 */
export function createPublicClientForBase() {
  return createPublicClient({
    chain: base,
    transport: http(QUICKNODE_RPC_URL),
  });
}

/**
 * Generate a new wallet
 */
export async function generateWallet(userId: string): Promise<WalletData> {
  const privateKey = generatePrivateKey();

  // Create account from private key
  const account = privateKeyToAccount(privateKey);

  const walletData: WalletData = {
    address: account.address,
    encryptedPrivateKey: encrypt(privateKey),
    type: "generated",
    createdAt: Date.now(),
  };

  // Save wallet to database
  saveWallet(walletData, userId);

  return walletData;
}

/**
 * Import a wallet from private key
 */
export async function importWallet(
  userId: string,
  privateKey: string
): Promise<WalletData> {
  // Remove 0x prefix if present
  const cleanPrivateKey = privateKey.replace(/^0x/, "");

  // Create account from private key
  const account = privateKeyToAccount(`0x${cleanPrivateKey}`);

  const walletData: WalletData = {
    address: account.address,
    encryptedPrivateKey: encrypt(cleanPrivateKey),
    type: "imported",
    createdAt: Date.now(),
  };

  // Save wallet to database
  saveWallet(walletData, userId);

  return walletData;
}

/**
 * Get wallet for a user
 */
export async function getWallet(userId: string): Promise<WalletData | null> {
  return getWalletByUserId(userId);
}

/**
 * Get account object from wallet data
 */
export function getAccount(walletData: WalletData): Account {
  const privateKey = decrypt(walletData.encryptedPrivateKey);
  return privateKeyToAccount(`0x${privateKey.replace(/^0x/, "")}`);
}

/**
 * Get private key from wallet data
 */
export function getPrivateKey(walletData: WalletData): string {
  return decrypt(walletData.encryptedPrivateKey);
}

/**
 * Get ETH balance for an address
 */
export async function getEthBalance(address: Address): Promise<string> {
  try {
    const publicClient = createPublicClientForBase();
    const balance = await publicClient.getBalance({ address });
    return balance.toString();
  } catch (error) {
    console.error("Error fetching ETH balance:", error);
    throw error;
  }
}

/**
 * Execute a contract method using viem's writeContract
 */
export async function executeContractMethod({
  walletData,
  contractAddress,
  abi,
  functionName,
  args,
}: {
  walletData: WalletData;
  contractAddress: Address;
  abi: any;
  functionName: string;
  args: any[];
}): Promise<TransactionReceipt> {
  try {
    const account = getAccount(walletData);

    const publicClient = createPublicClientForBase(); // Read client
    const walletClient = createClient(account); // Write client

    try {
      // Simulate to get the transaction request
      const { request } = await publicClient.simulateContract({
        address: contractAddress,
        abi,
        functionName,
        args,
        account,
      });

      // Write transaction
      const hash = await walletClient.writeContract(request);
      console.log(`Transaction submitted: ${hash}`);

      // Wait for receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Transaction receipt - Status: ${receipt.status}, Block: ${receipt.blockNumber}`);

      // Check if transaction actually succeeded on-chain
      if (receipt.status !== "success") {
        throw new Error(`Transaction failed on-chain. Hash: ${hash}`);
      }

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === "success" ? "success" : "failure",
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (simulationError: any) {
      console.error("Contract simulation failed:", simulationError);
      
      // Re-throw simulation errors with better context
      if (simulationError.message?.includes('execution reverted')) {
        throw new Error(`Contract execution would fail: ${simulationError.message}`);
      } else if (simulationError.message?.includes('insufficient funds')) {
        throw new Error(`Insufficient balance for this transaction`);
      } else if (simulationError.message?.includes('allowance')) {
        throw new Error(`Token approval required or insufficient`);
      }
      
      throw simulationError;
    }
  } catch (error) {
    console.error("Contract method execution failed:", error);
    throw error;
  }
}

/**
 * Execute a transaction
 */
export async function executeTransaction(
  walletData: WalletData,
  params: TransactionParams
): Promise<TransactionReceipt> {
  try {
    const account = getAccount(walletData);
    const client = createClient(account);

    // Prepare transaction parameters
    const txParams: any = {
      to: params.to,
      data: params.data,
      value: BigInt(params.value || "0"),
      gasPrice: BigInt(params.gasPrice),
    };

    // Send transaction
    const hash = await client.sendTransaction(txParams);

    // Wait for transaction receipt
    const publicClient = createPublicClientForBase();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === "success" ? "success" : "failure",
      gasUsed: receipt.gasUsed.toString(),
    };
  } catch (error) {
    console.error("Transaction execution failed:", error);
    throw error;
  }
}

/**
 * Withdraw ETH to another address
 */
export async function withdrawEth(
  walletData: WalletData,
  params: WithdrawalParams
): Promise<TransactionReceipt> {
  try {
    const account = getAccount(walletData);

    const client = createClient(account);

    // Prepare transaction parameters
    const txParams: any = {
      to: params.to,
      value: BigInt(params.amount),
      gasLimit: BigInt(21000), // Standard gas limit for ETH transfer
    };

    // Add gas price parameters
    if (params.maxFeePerGas && params.maxPriorityFeePerGas) {
      txParams.maxFeePerGas = BigInt(params.maxFeePerGas);
      txParams.maxPriorityFeePerGas = BigInt(params.maxPriorityFeePerGas);
    } else if (params.gasPrice) {
      txParams.gasPrice = BigInt(params.gasPrice);
    }

    // Send transaction
    const hash = await client.sendTransaction(txParams);

    // Wait for transaction receipt
    const publicClient = createPublicClientForBase();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === "success" ? "success" : "failure",
      gasUsed: receipt.gasUsed.toString(),
    };
  } catch (error) {
    console.error("Withdrawal failed:", error);
    throw error;
  }
}

/**
 * Estimate gas for ETH withdrawal
 */
export async function estimateWithdrawalGas(
  from: Address,
  to: Address,
  amount: string
): Promise<string> {
  try {
    const publicClient = createPublicClientForBase();

    const gasEstimate = await publicClient.estimateGas({
      account: from,
      to: to,
      value: BigInt(amount),
    });

    return gasEstimate.toString();
  } catch (error) {
    console.error("Gas estimation failed:", error);
    return "21000"; // Default gas limit for ETH transfer
  }
}

// *** TOKEN FUNCTIONS *** //

/**
 * Get token information using on-chain RPC calls
 * @param tokenAddress The token's contract address
 * @returns TokenInfo object with token details or null if failed
 */
export async function getTokenInfo(
  tokenAddress: Address
): Promise<TokenInfo | null> {
  try {
    // Handle native ETH specially
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      return {
        address: NATIVE_TOKEN_ADDRESS,
        symbol: "ETH",
        decimals: 18,
        balance: "0",
      };
    }

    const publicClient = createPublicClientForBase();

    // Make parallel requests for token data
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);

    return {
      address: tokenAddress,
      symbol: symbol as string,
      decimals: Number(decimals),
      balance: "0",
    };
  } catch (error) {
    console.error("Error fetching token info:", error);
    return null;
  }
}

/**
 * Get token balance for a specific address
 * @param tokenAddress The token's contract address
 * @param walletAddress The wallet address to check balance for
 * @returns Token balance as string
 */
export async function getTokenBalance(
  tokenAddress: Address,
  walletAddress: Address
): Promise<string> {
  try {
    const publicClient = createPublicClientForBase();

    // If it's ETH, get native balance
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      const balance = await publicClient.getBalance({
        address: walletAddress,
      });
      return balance.toString();
    }

    // For ERC20 tokens
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });

    return balance.toString();
  } catch (error) {
    console.error("Error fetching token balance:", error);
    return "0";
  }
}

/**
 * Get multiple token balances for a wallet
 * @param tokenAddresses Array of token addresses
 * @param walletAddress Wallet address to check balances for
 * @returns Array of token info objects with balances
 */
export async function getMultipleTokenBalances(
  tokenAddresses: Address[],
  walletAddress: Address
): Promise<TokenInfo[]> {
  try {
    // Check if RPC is properly configured
    if (!isRpcConfigured()) {
      console.error("RPC not properly configured, using fallback data");
      throw new Error("RPC_NOT_CONFIGURED");
    }

    const tokenPromises = tokenAddresses.map(async (address) => {
      try {
        const tokenInfo = await getTokenInfo(address);
        if (!tokenInfo) return null;

        const balance = await getTokenBalance(address, walletAddress);
        return {
          ...tokenInfo,
          balance,
        };
      } catch (tokenError: any) {
        // Handle rate limit errors specifically
        if (tokenError?.cause?.status === 429 || tokenError?.details?.includes('rate limit')) {
          console.error(`Rate limit hit for token ${address}, skipping`);
          return null;
        }
        
        console.error(`Error fetching balance for token ${address}:`, tokenError);
        return null;
      }
    });

    const tokens = await Promise.all(tokenPromises);
    return tokens.filter((token): token is TokenInfo => token !== null);
  } catch (error: any) {
    console.error("Error fetching multiple token balances:", error);
    
    if (error.message === "RPC_NOT_CONFIGURED") {
      throw error; // Re-throw to be handled by caller
    }
    
    return [];
  }
}

/**
 * Get token address from symbol
 * @param symbol Token symbol (e.g., "ETH", "USDC")
 * @returns Token address or null if not found
 */
export function getTokenAddressFromSymbol(symbol: string): Address | null {
  const upperSymbol = symbol.toUpperCase();

  // Check if it's in our common tokens list
  if (COMMON_TOKENS[upperSymbol as keyof typeof COMMON_TOKENS]) {
    return COMMON_TOKENS[upperSymbol as keyof typeof COMMON_TOKENS];
  }

  return null;
}

/**
 * Format token amount according to its decimals
 * @param amount Raw token amount (in base units)
 * @param decimals Token decimals
 * @param displayDecimals Number of decimals to display
 * @returns Formatted amount as string
 */
export function formatTokenAmount(
  amount: string | bigint,
  decimals: number,
  displayDecimals: number = 4
): string {
  try {
    const formatted = formatUnits(
      typeof amount === "string" ? BigInt(amount) : amount,
      decimals
    );
    return parseFloat(formatted).toFixed(displayDecimals);
  } catch (error) {
    console.error("Error formatting token amount:", error);
    return "0";
  }
}

/**
 * Get ERC20 token allowance
 * @param tokenAddress Token contract address
 * @param ownerAddress Owner address
 * @param spenderAddress Spender address (typically exchange contract)
 * @returns Allowance amount as string
 */
export async function getTokenAllowance(
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address
): Promise<string> {
  try {
    // Native token (ETH) doesn't need allowance
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      return MAX_UINT256;
    }

    const publicClient = createPublicClientForBase();

    const allowance = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [ownerAddress, spenderAddress],
    });

    return allowance.toString();
  } catch (error) {
    console.error("Error getting token allowance:", error);
    return "0";
  }
}