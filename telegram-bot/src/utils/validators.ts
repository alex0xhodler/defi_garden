import { isAddress } from "viem";

/**
 * Validates if a given string is a valid Ethereum address.
 * @param {string} address - The string to validate.
 * @returns {boolean} True if the address is valid, false otherwise.
 */
export function isValidAddress(address: string): boolean {
  return isAddress(address);
}

/**
 * Validates if a given string is a valid Ethereum private key.
 * A valid key is 64 hexadecimal characters, optionally prefixed with '0x'.
 * @param {string} privateKey - The string to validate.
 * @returns {boolean} True if the private key is valid, false otherwise.
 */
export function isValidPrivateKey(privateKey: string): boolean {
  // Private key should be 64 hex characters with or without 0x prefix
  const hexRegex = /^(0x)?[0-9a-fA-F]{64}$/;
  return hexRegex.test(privateKey);
}

/**
 * Validates if a given string represents a valid, positive numerical amount.
 * @param {string} amount - The string to validate.
 * @returns {boolean} True if the amount is a valid positive number, false otherwise.
 */
export function isValidAmount(amount: string): boolean {
  // Amount should be a positive number with up to 18 decimal places
  const amountRegex = /^(?!0\d)\d*(\.\d{1,18})?$/;
  return amountRegex.test(amount) && parseFloat(amount) > 0;
}

/**
 * Checks if a given balance is sufficient to cover a transaction amount plus estimated gas.
 * @param {string} balance - The total available balance.
 * @param {string} amount - The transaction amount.
 * @param {string} [gasEstimate="0"] - The estimated gas cost for the transaction.
 * @returns {boolean} True if the balance is sufficient, false otherwise.
 */
export function hasEnoughBalance(
  balance: string,
  amount: string,
  gasEstimate: string = "0"
): boolean {
  try {
    const balanceBigInt = BigInt(balance);
    const amountBigInt = BigInt(amount);
    const gasEstimateBigInt = BigInt(gasEstimate);

    // For ETH transfers, we need to check if balance >= amount + gas
    return balanceBigInt >= amountBigInt + gasEstimateBigInt;
  } catch (error) {
    console.error("Error checking balance:", error);
    return false;
  }
}

/**
 * Validates if a given slippage value is within a reasonable range (0% to 50%).
 * @param {number} slippage - The slippage percentage.
 * @returns {boolean} True if the slippage is valid, false otherwise.
 */
export function isValidSlippage(slippage: number): boolean {
  return slippage > 0 && slippage <= 50;
}

/**
 * Validates if a given string is a valid gas priority setting.
 * @param {string} priority - The priority string to validate.
 * @returns {boolean} True if the priority is one of "low", "medium", or "high".
 */
export function isValidGasPriority(
  priority: string
): priority is "low" | "medium" | "high" {
  return ["low", "medium", "high"].includes(priority);
}
