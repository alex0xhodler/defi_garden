"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidAddress = isValidAddress;
exports.isValidPrivateKey = isValidPrivateKey;
exports.isValidAmount = isValidAmount;
exports.hasEnoughBalance = hasEnoughBalance;
exports.isValidSlippage = isValidSlippage;
exports.isValidGasPriority = isValidGasPriority;
const viem_1 = require("viem");
/**
 * Validate if a string is a valid Ethereum address
 */
function isValidAddress(address) {
    return (0, viem_1.isAddress)(address);
}
/**
 * Validate if a string is a valid private key
 */
function isValidPrivateKey(privateKey) {
    // Private key should be 64 hex characters with or without 0x prefix
    const hexRegex = /^(0x)?[0-9a-fA-F]{64}$/;
    return hexRegex.test(privateKey);
}
/**
 * Validate if a string is a valid amount
 */
function isValidAmount(amount) {
    // Amount should be a positive number with up to 18 decimal places
    const amountRegex = /^(?!0\d)\d*(\.\d{1,18})?$/;
    return amountRegex.test(amount) && parseFloat(amount) > 0;
}
/**
 * Check if user has enough balance for a transaction
 */
function hasEnoughBalance(balance, amount, gasEstimate = "0") {
    try {
        const balanceBigInt = BigInt(balance);
        const amountBigInt = BigInt(amount);
        const gasEstimateBigInt = BigInt(gasEstimate);
        // For ETH transfers, we need to check if balance >= amount + gas
        return balanceBigInt >= amountBigInt + gasEstimateBigInt;
    }
    catch (error) {
        console.error("Error checking balance:", error);
        return false;
    }
}
/**
 * Validate slippage value
 */
function isValidSlippage(slippage) {
    return slippage > 0 && slippage <= 50;
}
/**
 * Validate gas priority value
 */
function isValidGasPriority(priority) {
    return ["low", "medium", "high"].includes(priority);
}
