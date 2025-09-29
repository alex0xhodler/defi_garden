"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMonitoringService = startMonitoringService;
exports.checkUserBalances = checkUserBalances;
const grammy_1 = require("grammy");
const database_1 = require("../lib/database");
const token_wallet_1 = require("../lib/token-wallet");
const constants_1 = require("../utils/constants");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Simple bot instance without complex typing
const monitorBot = new grammy_1.Bot(process.env.TELEGRAM_BOT_TOKEN || "");
// Store previous balances to detect changes
const previousBalances = new Map();
/**
 * Send deposit notification
 */
async function notifyDepositReceived(userId, firstName, amount, tokenSymbol) {
    try {
        const message = `✨ Deposit confirmed ${firstName}!\n\n` +
            `${amount} ${tokenSymbol} received and ready to start earning!\n\n` +
            `🦑 Your inkvest account is growing! 🦑`;
        await monitorBot.api.sendMessage(userId, message);
        console.log(`📬 Sent deposit notification to ${firstName}: ${amount} ${tokenSymbol}`);
    }
    catch (error) {
        console.error(`Failed to send deposit notification to user ${userId}:`, error);
    }
}
/**
 * Check balances for users who need monitoring
 */
async function checkUserBalances() {
    try {
        const users = (0, database_1.getUsersForBalanceMonitoring)();
        if (users.length === 0) {
            console.log("📊 No users to monitor");
            return;
        }
        console.log(`📊 Checking balances for ${users.length} users...`);
        for (const user of users) {
            try {
                await checkSingleUserBalance(user);
                (0, database_1.updateUserBalanceCheckTime)(user.userId);
            }
            catch (error) {
                console.error(`Failed to check balance for user ${user.userId}:`, error);
            }
        }
    }
    catch (error) {
        console.error("Error in balance monitoring:", error);
    }
}
/**
 * Check balance for a single user
 */
async function checkSingleUserBalance(user) {
    const wallet = (0, database_1.getWalletByUserId)(user.userId);
    if (!wallet)
        return;
    const walletAddress = wallet.address;
    const userId = user.userId;
    const firstName = user.firstName || "there";
    try {
        // Get current balances
        const usdcBalance = await (0, token_wallet_1.getTokenBalance)(walletAddress, constants_1.COMMON_TOKENS.USDC);
        const currentBalances = {
            usdc: usdcBalance.toString(),
            eth: "0"
        };
        // Get previous balances
        const previousBalance = previousBalances.get(userId);
        if (previousBalance) {
            // Check for USDC deposit
            if (parseFloat(currentBalances.usdc) > parseFloat(previousBalance.usdc)) {
                const depositAmount = (parseFloat(currentBalances.usdc) - parseFloat(previousBalance.usdc)).toFixed(2);
                console.log(`💰 Deposit detected for ${firstName}: ${depositAmount} USDC`);
                await notifyDepositReceived(userId, firstName, depositAmount, "USDC");
            }
        }
        // Update stored balances
        previousBalances.set(userId, currentBalances);
    }
    catch (error) {
        console.error(`Error checking balance for ${walletAddress}:`, error);
    }
}
/**
 * Start the deposit monitoring service
 */
async function startMonitoringService() {
    console.log("🦑 Starting inkvest deposit monitoring service...");
    try {
        // Initial balance check
        await checkUserBalances();
        // Set up periodic monitoring (every 30 seconds)
        setInterval(async () => {
            await checkUserBalances();
        }, 30000);
        console.log("✅ Deposit monitoring service started");
        console.log("📊 Checking balances every 30 seconds");
    }
    catch (error) {
        console.error("❌ Failed to start monitoring service:", error);
        process.exit(1);
    }
}
// Graceful shutdown handlers
process.on("SIGINT", async () => {
    console.log("🛑 Stopping deposit monitoring service...");
    await monitorBot.stop();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    console.log("🛑 Stopping deposit monitoring service...");
    await monitorBot.stop();
    process.exit(0);
});
// Start the service
if (require.main === module) {
    startMonitoringService();
}
