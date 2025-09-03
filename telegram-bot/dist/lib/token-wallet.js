"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPublicClientForBase = createPublicClientForBase;
exports.generateWallet = generateWallet;
exports.importWallet = importWallet;
exports.getWallet = getWallet;
exports.getAccount = getAccount;
exports.getPrivateKey = getPrivateKey;
exports.getEthBalance = getEthBalance;
exports.executeContractMethod = executeContractMethod;
exports.executeTransaction = executeTransaction;
exports.withdrawEth = withdrawEth;
exports.estimateWithdrawalGas = estimateWithdrawalGas;
exports.getTokenInfo = getTokenInfo;
exports.getTokenBalance = getTokenBalance;
exports.getMultipleTokenBalances = getMultipleTokenBalances;
exports.getAaveBalance = getAaveBalance;
exports.getFluidBalance = getFluidBalance;
exports.getCompoundBalance = getCompoundBalance;
exports.getTokenAddressFromSymbol = getTokenAddressFromSymbol;
exports.formatTokenAmount = formatTokenAmount;
exports.getTokenAllowance = getTokenAllowance;
exports.transferUsdc = transferUsdc;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const encryption_1 = require("./encryption");
const database_1 = require("./database");
const abis_1 = require("../utils/abis");
const constants_1 = require("../utils/constants");
// *** WALLET FUNCTIONS *** //
/**
 * Create a wallet client for the given private key
 */
function createClient(account) {
    return (0, viem_1.createWalletClient)({
        account,
        chain: chains_1.base,
        transport: (0, viem_1.http)(constants_1.QUICKNODE_RPC_URL),
    });
}
/**
 * Create a public client for Base network
 */
function createPublicClientForBase() {
    return (0, viem_1.createPublicClient)({
        chain: chains_1.base,
        transport: (0, viem_1.http)(constants_1.QUICKNODE_RPC_URL),
    });
}
/**
 * Generate a new wallet
 */
async function generateWallet(userId) {
    const privateKey = (0, accounts_1.generatePrivateKey)();
    // Create account from private key
    const account = (0, accounts_1.privateKeyToAccount)(privateKey);
    const walletData = {
        address: account.address,
        encryptedPrivateKey: (0, encryption_1.encrypt)(privateKey),
        type: "generated",
        createdAt: Date.now(),
        autoCreated: true, // Mark as auto-created
    };
    // Save wallet to database
    (0, database_1.saveWallet)(walletData, userId);
    return walletData;
}
/**
 * Import a wallet from private key
 */
async function importWallet(userId, privateKey) {
    // Remove 0x prefix if present
    const cleanPrivateKey = privateKey.replace(/^0x/, "");
    // Create account from private key
    const account = (0, accounts_1.privateKeyToAccount)(`0x${cleanPrivateKey}`);
    const walletData = {
        address: account.address,
        encryptedPrivateKey: (0, encryption_1.encrypt)(cleanPrivateKey),
        type: "imported",
        createdAt: Date.now(),
    };
    // Save wallet to database
    (0, database_1.saveWallet)(walletData, userId);
    return walletData;
}
/**
 * Get wallet for a user
 */
async function getWallet(userId) {
    return (0, database_1.getWalletByUserId)(userId);
}
/**
 * Get account object from wallet data
 */
function getAccount(walletData) {
    const privateKey = (0, encryption_1.decrypt)(walletData.encryptedPrivateKey);
    return (0, accounts_1.privateKeyToAccount)(`0x${privateKey.replace(/^0x/, "")}`);
}
/**
 * Get private key from wallet data
 */
function getPrivateKey(walletData) {
    return (0, encryption_1.decrypt)(walletData.encryptedPrivateKey);
}
/**
 * Get ETH balance for an address
 */
async function getEthBalance(address) {
    try {
        const publicClient = createPublicClientForBase();
        const balance = await publicClient.getBalance({ address });
        return balance.toString();
    }
    catch (error) {
        console.error("Error fetching ETH balance:", error);
        throw error;
    }
}
/**
 * Execute a contract method using viem's writeContract
 */
async function executeContractMethod({ walletData, contractAddress, abi, functionName, args, }) {
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
                chain: chains_1.base,
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
        }
        catch (simulationError) {
            console.error("Contract simulation failed:", simulationError);
            // Re-throw simulation errors with better context
            if (simulationError.message?.includes('execution reverted')) {
                throw new Error(`Contract execution would fail: ${simulationError.message}`);
            }
            else if (simulationError.message?.includes('insufficient funds')) {
                throw new Error(`Insufficient balance for this transaction`);
            }
            else if (simulationError.message?.includes('allowance')) {
                throw new Error(`Token approval required or insufficient`);
            }
            throw simulationError;
        }
    }
    catch (error) {
        console.error("Contract method execution failed:", error);
        throw error;
    }
}
/**
 * Execute a transaction
 */
async function executeTransaction(walletData, params) {
    try {
        const account = getAccount(walletData);
        const client = createClient(account);
        // Prepare transaction parameters
        const txParams = {
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
    }
    catch (error) {
        console.error("Transaction execution failed:", error);
        throw error;
    }
}
/**
 * Withdraw ETH to another address
 */
async function withdrawEth(walletData, params) {
    try {
        const account = getAccount(walletData);
        const client = createClient(account);
        // Prepare transaction parameters
        const txParams = {
            to: params.to,
            value: BigInt(params.amount),
            gasLimit: BigInt(21000), // Standard gas limit for ETH transfer
        };
        // Add gas price parameters
        if (params.maxFeePerGas && params.maxPriorityFeePerGas) {
            txParams.maxFeePerGas = BigInt(params.maxFeePerGas);
            txParams.maxPriorityFeePerGas = BigInt(params.maxPriorityFeePerGas);
        }
        else if (params.gasPrice) {
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
    }
    catch (error) {
        console.error("Withdrawal failed:", error);
        throw error;
    }
}
/**
 * Estimate gas for ETH withdrawal
 */
async function estimateWithdrawalGas(from, to, amount) {
    try {
        const publicClient = createPublicClientForBase();
        const gasEstimate = await publicClient.estimateGas({
            account: from,
            to: to,
            value: BigInt(amount),
        });
        return gasEstimate.toString();
    }
    catch (error) {
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
async function getTokenInfo(tokenAddress) {
    try {
        // Handle native ETH specially
        if (tokenAddress.toLowerCase() === constants_1.NATIVE_TOKEN_ADDRESS.toLowerCase()) {
            return {
                address: constants_1.NATIVE_TOKEN_ADDRESS,
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
                abi: abis_1.erc20Abi,
                functionName: "symbol",
            }),
            publicClient.readContract({
                address: tokenAddress,
                abi: abis_1.erc20Abi,
                functionName: "decimals",
            }),
        ]);
        return {
            address: tokenAddress,
            symbol: symbol,
            decimals: Number(decimals),
            balance: "0",
        };
    }
    catch (error) {
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
async function getTokenBalance(tokenAddress, walletAddress) {
    try {
        const publicClient = createPublicClientForBase();
        // If it's ETH, get native balance
        if (tokenAddress.toLowerCase() === constants_1.NATIVE_TOKEN_ADDRESS.toLowerCase()) {
            const balance = await publicClient.getBalance({
                address: walletAddress,
            });
            return balance.toString();
        }
        // For ERC20 tokens
        const balance = await publicClient.readContract({
            address: tokenAddress,
            abi: abis_1.erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
        });
        return balance.toString();
    }
    catch (error) {
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
async function getMultipleTokenBalances(tokenAddresses, walletAddress) {
    try {
        // Check if RPC is properly configured
        if (!(0, constants_1.isRpcConfigured)()) {
            console.error("RPC not properly configured, using fallback data");
            throw new Error("RPC_NOT_CONFIGURED");
        }
        const tokenPromises = tokenAddresses.map(async (address) => {
            try {
                const tokenInfo = await getTokenInfo(address);
                if (!tokenInfo)
                    return null;
                const balance = await getTokenBalance(address, walletAddress);
                return {
                    ...tokenInfo,
                    balance,
                };
            }
            catch (tokenError) {
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
        return tokens.filter((token) => token !== null);
    }
    catch (error) {
        console.error("Error fetching multiple token balances:", error);
        if (error.message === "RPC_NOT_CONFIGURED") {
            throw error; // Re-throw to be handled by caller
        }
        return [];
    }
}
/**
 * Get Aave aUSDC balance for a wallet (real deposited amount)
 * @param walletAddress The wallet address to check
 * @returns aUSDC balance representing actual Aave deposits
 */
async function getAaveBalance(walletAddress) {
    try {
        const publicClient = createPublicClientForBase();
        // Get aUSDC balance (represents USDC deposited in Aave)
        const aUsdcBalance = await publicClient.readContract({
            address: constants_1.BASE_TOKENS.aUSDC,
            abi: abis_1.erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
        });
        return {
            aUsdcBalance: aUsdcBalance.toString(),
            aUsdcBalanceFormatted: formatTokenAmount(aUsdcBalance.toString(), 6, 2) // USDC has 6 decimals
        };
    }
    catch (error) {
        console.error("Error fetching Aave balance:", error);
        return {
            aUsdcBalance: "0",
            aUsdcBalanceFormatted: "0.00"
        };
    }
}
/**
 * Get Fluid fUSDC balance for a wallet (real deposited amount)
 * @param walletAddress The wallet address to check
 * @returns fUSDC balance representing actual Fluid deposits
 */
async function getFluidBalance(walletAddress) {
    try {
        const publicClient = createPublicClientForBase();
        // Get fUSDC balance (represents USDC deposited in Fluid)
        const fUsdcBalance = await publicClient.readContract({
            address: constants_1.BASE_TOKENS.fUSDC,
            abi: abis_1.erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
        });
        return {
            fUsdcBalance: fUsdcBalance.toString(),
            fUsdcBalanceFormatted: formatTokenAmount(fUsdcBalance.toString(), 6, 2) // USDC has 6 decimals
        };
    }
    catch (error) {
        console.error("Error fetching Fluid balance:", error);
        return {
            fUsdcBalance: "0",
            fUsdcBalanceFormatted: "0.00"
        };
    }
}
/**
 * Get Compound V3 cUSDCv3 balance for a wallet (real deposited amount)
 * @param walletAddress The wallet address to check
 * @returns cUSDCv3 balance representing actual Compound deposits
 */
async function getCompoundBalance(walletAddress) {
    try {
        const publicClient = createPublicClientForBase();
        // Get cUSDCv3 balance (represents USDC deposited in Compound V3)
        const cUsdcBalance = await publicClient.readContract({
            address: constants_1.BASE_TOKENS.cUSDCv3,
            abi: abis_1.erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
        });
        return {
            cUsdcBalance: cUsdcBalance.toString(),
            cUsdcBalanceFormatted: formatTokenAmount(cUsdcBalance.toString(), 6, 2) // USDC has 6 decimals
        };
    }
    catch (error) {
        console.error("Error fetching Compound balance:", error);
        return {
            cUsdcBalance: "0",
            cUsdcBalanceFormatted: "0.00"
        };
    }
}
/**
 * Get token address from symbol
 * @param symbol Token symbol (e.g., "ETH", "USDC")
 * @returns Token address or null if not found
 */
function getTokenAddressFromSymbol(symbol) {
    const upperSymbol = symbol.toUpperCase();
    // Check if it's in our common tokens list
    if (constants_1.COMMON_TOKENS[upperSymbol]) {
        return constants_1.COMMON_TOKENS[upperSymbol];
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
function formatTokenAmount(amount, decimals, displayDecimals = 4) {
    try {
        const formatted = (0, viem_1.formatUnits)(typeof amount === "string" ? BigInt(amount) : amount, decimals);
        return parseFloat(formatted).toFixed(displayDecimals);
    }
    catch (error) {
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
async function getTokenAllowance(tokenAddress, ownerAddress, spenderAddress) {
    try {
        // Native token (ETH) doesn't need allowance
        if (tokenAddress.toLowerCase() === constants_1.NATIVE_TOKEN_ADDRESS.toLowerCase()) {
            return constants_1.MAX_UINT256;
        }
        const publicClient = createPublicClientForBase();
        const allowance = await publicClient.readContract({
            address: tokenAddress,
            abi: abis_1.erc20Abi,
            functionName: "allowance",
            args: [ownerAddress, spenderAddress],
        });
        return allowance.toString();
    }
    catch (error) {
        console.error("Error getting token allowance:", error);
        return "0";
    }
}
/**
 * Transfer USDC tokens to another address
 * @param walletData User's wallet data
 * @param toAddress Destination address
 * @param amount Amount in USDC (human readable, e.g., "100.5")
 * @returns Transaction receipt
 */
async function transferUsdc(walletData, toAddress, amount) {
    try {
        console.log(`🔍 USDC Transfer: ${amount} USDC from ${walletData.address} to ${toAddress}`);
        // CRITICAL: Check actual on-chain balance before attempting transfer
        const actualBalance = await getTokenBalance(constants_1.BASE_TOKENS.USDC, walletData.address);
        const actualBalanceFormatted = formatTokenAmount(actualBalance, 6, 2);
        console.log(`💰 Actual USDC balance in ${walletData.address}: ${actualBalanceFormatted} USDC (${actualBalance} raw)`);
        const usdcAmount = (0, viem_1.parseUnits)(amount, 6); // USDC has 6 decimals
        console.log(`🔄 Attempting to transfer: ${amount} USDC = ${usdcAmount.toString()} raw units`);
        // Verify we have sufficient balance
        if (BigInt(actualBalance) < usdcAmount) {
            throw new Error(`Insufficient USDC balance in wallet ${walletData.address}. Need: ${amount} USDC, Have: ${actualBalanceFormatted} USDC`);
        }
        // Use the existing executeContractMethod to transfer USDC
        const receipt = await executeContractMethod({
            walletData,
            contractAddress: constants_1.BASE_TOKENS.USDC,
            abi: abis_1.erc20Abi,
            functionName: "transfer",
            args: [toAddress, usdcAmount.toString()]
        });
        return receipt;
    }
    catch (error) {
        console.error("USDC transfer failed:", error);
        throw error;
    }
}
