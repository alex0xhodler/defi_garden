import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { TokenInfo } from "../types/config";

/**
 * Formats a raw ETH balance (in wei) into a human-readable string with 6 decimal places.
 * @param {string | bigint} balanceWei - The ETH balance in wei.
 * @returns {string} The formatted ETH balance as a string (e.g., "0.123456").
 */
export function formatEthBalance(balanceWei: string | bigint): string {
  try {
    const formatted = formatEther(typeof balanceWei === "string" ? BigInt(balanceWei) : balanceWei);
    // Format to 6 decimal places
    return parseFloat(formatted).toFixed(6);
  } catch (error) {
    console.error("Error formatting ETH balance:", error);
    return "0.000000";
  }
}

/**
 * Formats a raw ERC20 token balance into a human-readable string based on the token's decimals.
 * @param {string} balance - The raw token balance.
 * @param {number} decimals - The number of decimals the token has.
 * @returns {string} The formatted token balance as a string.
 */
export function formatTokenBalance(balance: string, decimals: number): string {
  try {
    const formatted = formatUnits(BigInt(balance), decimals);
    // Format to 6 decimal places
    return parseFloat(formatted).toFixed(6);
  } catch (error) {
    console.error("Error formatting token balance:", error);
    return "0.000000";
  }
}

/**
 * Parses a human-readable amount string into its raw integer representation (e.g., wei for ETH),
 * based on the specified number of decimals.
 * @param {string} amount - The human-readable amount string (e.g., "1.5").
 * @param {number} [decimals=18] - The number of decimals for the token.
 * @returns {string} The raw amount as a string.
 * @throws Will throw an error if the amount format is invalid.
 */
export function parseAmount(amount: string, decimals: number = 18): string {
  try {
    if (decimals === 18) {
      return parseEther(amount).toString();
    } else {
      return parseUnits(amount, decimals).toString();
    }
  } catch (error) {
    console.error("Error parsing amount:", error);
    throw new Error("Invalid amount format");
  }
}

/**
 * Formats a long Ethereum address into a shortened version for display (e.g., "0x1234...5678").
 * @param {string} address - The full Ethereum address.
 * @returns {string} The shortened address string.
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
}

/**
 * Creates a formatted string message displaying a user's ETH and ERC20 token balances.
 * @param {string} ethBalance - The user's raw ETH balance in wei.
 * @param {TokenInfo[]} [tokenBalances=[]] - An array of token info objects, including their balances.
 * @returns {string} A formatted markdown string for display in Telegram.
 */
export function formatBalanceMessage(
  ethBalance: string,
  tokenBalances: TokenInfo[] = []
): string {
  let message = `💰 *Your Balances*\n\n`;
  message += `*ETH*: ${formatEthBalance(ethBalance)} ETH\n`;

  if (tokenBalances.length > 0) {
    message += `\n*ERC-20 Tokens:*\n`;
    tokenBalances.forEach((token) => {
      const formattedBalance = formatTokenBalance(token.balance, token.decimals);
      message += `*${token.symbol}*: ${formattedBalance} ${token.symbol}\n`;
    });
  }

  message += `\n`;
  return message;
}

/**
 * Creates a formatted markdown string summarizing transaction details for user confirmation.
 * @param {string} fromToken - The symbol of the source token.
 * @param {string} toToken - The symbol of the destination token.
 * @param {string} fromAmount - The amount of the source token.
 * @param {string} toAmount - The amount of the destination token.
 * @param {string} selectedGasPriority - The selected gas priority (e.g., "high").
 * @param {string} selectedSlippage - The selected slippage tolerance (e.g., "1%").
 * @returns {string} A formatted markdown string for the confirmation message.
 */
export function formatTransactionDetails(
  fromToken: string,
  toToken: string,
  fromAmount: string,
  toAmount: string,
  selectedGasPriority: string,
  selectedSlippage: string
): string {
  return (
    `*Transaction Details*\n\n` +
    `From: ${fromAmount} ${fromToken}\n` +
    `To: ${toAmount} ${toToken}\n` +
    `Gas Priority: ${selectedGasPriority}\n` +
    `Slippage: ${selectedSlippage}%\n` +
    `Do you want to proceed with this transaction?`
  );
}

/**
 * Formats a transaction receipt into a human-readable markdown string.
 * @param {string} hash - The transaction hash.
 * @param {string} status - The status of the transaction ('success' or 'failure').
 * @param {string} gasUsed - The amount of gas used, in wei.
 * @returns {string} A formatted markdown string of the transaction receipt.
 */
export function formatTransactionReceipt(
  hash: string,
  status: string,
  gasUsed: string
): string {
  const statusEmoji = status === "success" ? "✅" : "❌";

  return (
    `*Transaction ${statusEmoji}*\n\n` +
    `Transaction Hash: \`${hash}\`\n` +
    `Status: ${status}\n` +
    `Gas Used: ${formatEther(BigInt(gasUsed))} ETH\n`
  );
}

/**
 * Creates a formatted markdown string for a withdrawal confirmation message.
 * @param {string} amount - The raw amount to be withdrawn, in wei.
 * @param {string} toAddress - The recipient's address.
 * @returns {string} A formatted markdown string for the confirmation message.
 */
export function formatWithdrawalConfirmation(
  amount: string,
  toAddress: string,
): string {
  return (
    `*Withdrawal Confirmation*\n\n` +
    `Amount: ${formatEthBalance(amount)} ETH\n` +
    `To: ${formatAddress(toAddress)}\n` +
    `Do you want to proceed with this withdrawal?`
  );
}
