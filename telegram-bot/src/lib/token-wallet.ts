import {
  createWalletClient,
  http,
  createPublicClient,
  Account,
  WalletClient,
  Address,
  formatUnits,
  parseUnits,
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
 * Creates a Viem WalletClient instance for a given account.
 * This client is used for sending transactions (write operations).
 * @param {Account} account - The Viem account object created from a private key.
 * @returns {WalletClient} A configured Viem WalletClient.
 */
function createClient(account: Account): WalletClient {
  return createWalletClient({
    account,
    chain: base,
    transport: http(QUICKNODE_RPC_URL),
  });
}

/**
 * Creates a Viem PublicClient instance for the Base network.
 * This client is used for read-only operations like fetching balances and reading contract state.
 * @returns {PublicClient} A configured Viem PublicClient.
 */
export function createPublicClientForBase() {
  return createPublicClient({
    chain: base,
    transport: http(QUICKNODE_RPC_URL),
  });
}

/**
 * Generates a new wallet for a user, encrypts the private key, and saves it to the database.
 * @param {string} userId - The unique identifier for the user.
 * @returns {Promise<WalletData>} A promise that resolves with the data of the newly created wallet.
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
    autoCreated: true, // Mark as auto-created
  };

  // Save wallet to database
  saveWallet(walletData, userId);

  return walletData;
}

/**
 * Imports a wallet using a provided private key.
 * It encrypts the key and saves the wallet data to the database.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} privateKey - The private key to import.
 * @returns {Promise<WalletData>} A promise that resolves with the data of the imported wallet.
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
 * Retrieves a user's wallet data from the database.
 * @param {string} userId - The user's unique identifier.
 * @returns {Promise<WalletData | null>} A promise that resolves with the user's wallet data, or null if not found.
 */
export async function getWallet(userId: string): Promise<WalletData | null> {
  return getWalletByUserId(userId);
}

/**
 * Creates a Viem `Account` object from the wallet data by decrypting the private key.
 * @param {WalletData} walletData - The user's wallet data.
 * @returns {Account} The Viem account object.
 */
export function getAccount(walletData: WalletData): Account {
  const privateKey = decrypt(walletData.encryptedPrivateKey);
  return privateKeyToAccount(`0x${privateKey.replace(/^0x/, "")}`);
}

/**
 * Decrypts and returns the private key from a user's wallet data.
 * @param {WalletData} walletData - The user's wallet data.
 * @returns {string} The decrypted private key.
 */
export function getPrivateKey(walletData: WalletData): string {
  return decrypt(walletData.encryptedPrivateKey);
}

/**
 * Fetches the native ETH balance for a given address.
 * @param {Address} address - The address to check the balance of.
 * @returns {Promise<string>} A promise that resolves to the balance as a string in wei.
 * @throws Will throw an error if the RPC call fails.
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
 * A generic function to execute a write method on a smart contract.
 * It simulates the transaction first for safety and then sends it with optimized gas settings.
 * @param {object} params - The parameters for the contract method execution.
 * @param {WalletData} params.walletData - The user's wallet data.
 * @param {Address} params.contractAddress - The address of the contract to interact with.
 * @param {any} params.abi - The ABI of the contract.
 * @param {string} params.functionName - The name of the function to call.
 * @param {any[]} params.args - The arguments to pass to the function.
 * @returns {Promise<TransactionReceipt>} A promise that resolves with the transaction receipt.
 * @throws Will throw an error if the simulation or transaction fails.
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

      // Use "fast" gas settings for reliable transaction execution
      const feeData = await publicClient.estimateFeesPerGas();
      
      // Use 2x multiplier for "fast" transaction speed
      const maxFeePerGas = feeData.maxFeePerGas * 2n;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas * 2n;

      // Write transaction with fast gas settings
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi,
        functionName,
        args,
        account,
        chain: base,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      console.log(`Transaction submitted with fast gas: ${hash}`);

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
 * Executes a raw transaction.
 * @param {WalletData} walletData - The user's wallet data.
 * @param {TransactionParams} params - The transaction parameters (to, data, value, etc.).
 * @returns {Promise<TransactionReceipt>} A promise that resolves with the transaction receipt.
 * @throws Will throw an error if the transaction fails.
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
 * Withdraws ETH from the user's wallet to a specified address.
 * @param {WalletData} walletData - The user's wallet data.
 * @param {WithdrawalParams} params - The withdrawal parameters (to, amount, gas settings).
 * @returns {Promise<TransactionReceipt>} A promise that resolves with the transaction receipt.
 * @throws Will throw an error if the withdrawal fails.
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
 * Estimates the gas required for an ETH withdrawal transaction.
 * @param {Address} from - The sender's address.
 * @param {Address} to - The recipient's address.
 * @param {string} amount - The amount of ETH to send in wei.
 * @returns {Promise<string>} A promise that resolves to the estimated gas as a string.
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
 * Fetches on-chain information for a given ERC20 token, such as its symbol and decimals.
 * @param {Address} tokenAddress - The contract address of the token.
 * @returns {Promise<TokenInfo | null>} A promise that resolves to a TokenInfo object, or null if the token is not found or an error occurs.
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
 * Fetches the balance of a specific token (ERC20 or native ETH) for a given wallet address.
 * @param {Address} tokenAddress - The contract address of the token, or the native token address for ETH.
 * @param {Address} walletAddress - The address of the wallet to check.
 * @returns {Promise<string>} A promise that resolves to the raw token balance as a string.
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
 * Fetches the balances for multiple tokens for a single wallet address in an efficient manner.
 * @param {Address[]} tokenAddresses - An array of token addresses to check.
 * @param {Address} walletAddress - The address of the wallet.
 * @returns {Promise<TokenInfo[]>} A promise that resolves to an array of TokenInfo objects, each including the balance.
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
 * Fetches the user's deposit balance in the Aave V3 protocol.
 * This is determined by checking the balance of the aUSDC token.
 * @param {Address} walletAddress - The user's wallet address.
 * @returns {Promise<{ aUsdcBalance: string; aUsdcBalanceFormatted: string; }>} A promise that resolves to an object containing the raw and formatted balance.
 */
export async function getAaveBalance(walletAddress: Address): Promise<{
  aUsdcBalance: string;
  aUsdcBalanceFormatted: string;
}> {
  try {
    const publicClient = createPublicClientForBase();
    
    // Get aUSDC balance (represents USDC deposited in Aave)
    const aUsdcBalance = await publicClient.readContract({
      address: BASE_TOKENS.aUSDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });

    return {
      aUsdcBalance: aUsdcBalance.toString(),
      aUsdcBalanceFormatted: formatTokenAmount(aUsdcBalance.toString(), 6, 2) // USDC has 6 decimals
    };
  } catch (error) {
    console.error("Error fetching Aave balance:", error);
    return {
      aUsdcBalance: "0",
      aUsdcBalanceFormatted: "0.00"
    };
  }
}

/**
 * Fetches the user's deposit balance in the Fluid Finance protocol.
 * This is determined by checking the balance of the fUSDC token.
 * @param {Address} walletAddress - The user's wallet address.
 * @returns {Promise<{ fUsdcBalance: string; fUsdcBalanceFormatted: string; }>} A promise that resolves to an object containing the raw and formatted balance.
 */
export async function getFluidBalance(walletAddress: Address): Promise<{
  fUsdcBalance: string;
  fUsdcBalanceFormatted: string;
}> {
  try {
    const publicClient = createPublicClientForBase();
    
    // Get fUSDC balance (represents USDC deposited in Fluid)
    const fUsdcBalance = await publicClient.readContract({
      address: BASE_TOKENS.fUSDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });

    return {
      fUsdcBalance: fUsdcBalance.toString(),
      fUsdcBalanceFormatted: formatTokenAmount(fUsdcBalance.toString(), 6, 2) // USDC has 6 decimals
    };
  } catch (error) {
    console.error("Error fetching Fluid balance:", error);
    return {
      fUsdcBalance: "0",
      fUsdcBalanceFormatted: "0.00"
    };
  }
}

/**
 * Fetches the user's deposit balance in the Compound V3 protocol.
 * This is determined by checking the balance of the cUSDCv3 token.
 * @param {Address} walletAddress - The user's wallet address.
 * @returns {Promise<{ cUsdcBalance: string; cUsdcBalanceFormatted: string; }>} A promise that resolves to an object containing the raw and formatted balance.
 */
export async function getCompoundBalance(walletAddress: Address): Promise<{
  cUsdcBalance: string;
  cUsdcBalanceFormatted: string;
}> {
  try {
    const publicClient = createPublicClientForBase();
    
    // Get cUSDCv3 balance (represents USDC deposited in Compound V3)
    const cUsdcBalance = await publicClient.readContract({
      address: BASE_TOKENS.cUSDCv3,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });

    return {
      cUsdcBalance: cUsdcBalance.toString(),
      cUsdcBalanceFormatted: formatTokenAmount(cUsdcBalance.toString(), 6, 2) // USDC has 6 decimals
    };
  } catch (error) {
    console.error("Error fetching Compound balance:", error);
    return {
      cUsdcBalance: "0",
      cUsdcBalanceFormatted: "0.00"
    };
  }
}

/**
 * A utility function to get a token's contract address from its symbol.
 * @param {string} symbol - The token symbol (e.g., "ETH", "USDC").
 * @returns {Address | null} The token's address, or null if not found in the predefined list.
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
 * A utility function to format a raw token amount (in its smallest unit, e.g., wei) into a human-readable string.
 * @param {string | bigint} amount - The raw token amount.
 * @param {number} decimals - The number of decimals the token has.
 * @param {number} [displayDecimals=4] - The number of decimal places to show in the output string.
 * @returns {string} The formatted token amount as a string.
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
 * Fetches the current ERC20 token allowance a spender has from an owner.
 * @param {Address} tokenAddress - The contract address of the ERC20 token.
 * @param {Address} ownerAddress - The address of the token owner.
 * @param {Address} spenderAddress - The address of the spender.
 * @returns {Promise<string>} A promise that resolves to the allowance amount as a string.
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

/**
 * Transfers USDC tokens from the user's wallet to a specified destination address.
 * @param {WalletData} walletData - The user's wallet data.
 * @param {Address} toAddress - The recipient's address.
 * @param {string} amount - The amount of USDC to transfer, in human-readable format.
 * @returns {Promise<TransactionReceipt>} A promise that resolves with the transaction receipt.
 * @throws Will throw an error if the balance is insufficient or the transaction fails.
 */
export async function transferUsdc(
  walletData: WalletData,
  toAddress: Address,
  amount: string
): Promise<TransactionReceipt> {
  try {
    console.log(`🔍 USDC Transfer: ${amount} USDC from ${walletData.address} to ${toAddress}`);
    
    // CRITICAL: Check actual on-chain balance before attempting transfer
    const actualBalance = await getTokenBalance(BASE_TOKENS.USDC, walletData.address as Address);
    const actualBalanceFormatted = formatTokenAmount(actualBalance, 6, 2);
    
    console.log(`💰 Actual USDC balance in ${walletData.address}: ${actualBalanceFormatted} USDC (${actualBalance} raw)`);
    
    const usdcAmount = parseUnits(amount, 6); // USDC has 6 decimals
    console.log(`🔄 Attempting to transfer: ${amount} USDC = ${usdcAmount.toString()} raw units`);
    
    // Verify we have sufficient balance
    if (BigInt(actualBalance) < usdcAmount) {
      throw new Error(`Insufficient USDC balance in wallet ${walletData.address}. Need: ${amount} USDC, Have: ${actualBalanceFormatted} USDC`);
    }
    
    // Use the existing executeContractMethod to transfer USDC
    const receipt = await executeContractMethod({
      walletData,
      contractAddress: BASE_TOKENS.USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [toAddress, usdcAmount.toString()]
    });

    return receipt;
  } catch (error) {
    console.error("USDC transfer failed:", error);
    throw error;
  }
}