"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEthBalance = formatEthBalance;
exports.formatTokenBalance = formatTokenBalance;
exports.parseAmount = parseAmount;
exports.formatAddress = formatAddress;
exports.formatBalanceMessage = formatBalanceMessage;
exports.formatTransactionDetails = formatTransactionDetails;
exports.formatTransactionReceipt = formatTransactionReceipt;
exports.formatWithdrawalConfirmation = formatWithdrawalConfirmation;
const viem_1 = require("viem");
/**
 * Format ETH balance with proper decimals
 */
function formatEthBalance(balanceWei) {
    try {
        const formatted = (0, viem_1.formatEther)(typeof balanceWei === "string" ? BigInt(balanceWei) : balanceWei);
        // Format to 6 decimal places
        return parseFloat(formatted).toFixed(6);
    }
    catch (error) {
        console.error("Error formatting ETH balance:", error);
        return "0.000000";
    }
}
/**
 * Format token balance based on decimals
 */
function formatTokenBalance(balance, decimals) {
    try {
        const formatted = (0, viem_1.formatUnits)(BigInt(balance), decimals);
        // Format to 6 decimal places
        return parseFloat(formatted).toFixed(6);
    }
    catch (error) {
        console.error("Error formatting token balance:", error);
        return "0.000000";
    }
}
/**
 * Parse user input amount to wei
 */
function parseAmount(amount, decimals = 18) {
    try {
        if (decimals === 18) {
            return (0, viem_1.parseEther)(amount).toString();
        }
        else {
            return (0, viem_1.parseUnits)(amount, decimals).toString();
        }
    }
    catch (error) {
        console.error("Error parsing amount:", error);
        throw new Error("Invalid amount format");
    }
}
/**
 * Format address for display (0x1234...5678)
 */
function formatAddress(address) {
    if (!address || address.length < 10)
        return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}
/**
 * Format token balances for display in Telegram
 */
function formatBalanceMessage(ethBalance, tokenBalances = []) {
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
 * Format transaction details for confirmation
 */
function formatTransactionDetails(fromToken, toToken, fromAmount, toAmount, selectedGasPriority, selectedSlippage) {
    return (`*Transaction Details*\n\n` +
        `From: ${fromAmount} ${fromToken}\n` +
        `To: ${toAmount} ${toToken}\n` +
        `Gas Priority: ${selectedGasPriority}\n` +
        `Slippage: ${selectedSlippage}%\n` +
        `Do you want to proceed with this transaction?`);
}
/**
 * Format transaction receipt
 */
function formatTransactionReceipt(hash, status, gasUsed) {
    const statusEmoji = status === "success" ? "✅" : "❌";
    return (`*Transaction ${statusEmoji}*\n\n` +
        `Transaction Hash: \`${hash}\`\n` +
        `Status: ${status}\n` +
        `Gas Used: ${(0, viem_1.formatEther)(BigInt(gasUsed))} ETH\n`);
}
/**
 * Format withdrawal confirmation message
 */
function formatWithdrawalConfirmation(amount, toAddress) {
    return (`*Withdrawal Confirmation*\n\n` +
        `Amount: ${formatEthBalance(amount)} ETH\n` +
        `To: ${formatAddress(toAddress)}\n` +
        `Do you want to proceed with this withdrawal?`);
}
