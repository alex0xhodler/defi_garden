const { Bot } = require("grammy");
const { 
  getUsersForBalanceMonitoring, 
  getWalletByUserId,
  updateUserBalanceCheckTime 
} = require("../lib/database");
const { getTokenBalance } = require("../lib/token-wallet");
const { COMMON_TOKENS } = require("../utils/constants");
require("dotenv").config();

// Simple bot instance for notifications
const monitorBot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "");

// Store previous balances to detect changes
const previousBalances = new Map();

/**
 * Send deposit notification
 */
async function notifyDepositReceived(userId, firstName, amount, tokenSymbol) {
  try {
    const message = `✨ Deposit confirmed ${firstName}!\n\n` +
      `${amount} ${tokenSymbol} received and ready to start earning!\n\n` +
      `🦑 Your inkvest account is growing! 🚀`;

    await monitorBot.api.sendMessage(userId, message);
    console.log(`📬 Sent deposit notification to ${firstName}: ${amount} ${tokenSymbol}`);

  } catch (error) {
    console.error(`Failed to send deposit notification to user ${userId}:`, error);
  }
}

/**
 * Check balances for users who need monitoring
 */
async function checkUserBalances() {
  try {
    const users = getUsersForBalanceMonitoring();
    
    if (users.length === 0) {
      console.log("📊 No users to monitor");
      return;
    }

    console.log(`📊 Checking balances for ${users.length} users...`);

    for (const user of users) {
      try {
        await checkSingleUserBalance(user);
        updateUserBalanceCheckTime(user.userId);
      } catch (error) {
        console.error(`Failed to check balance for user ${user.userId}:`, error);
      }
    }

  } catch (error) {
    console.error("Error in balance monitoring:", error);
  }
}

/**
 * Check balance for a single user
 */
async function checkSingleUserBalance(user) {
  const wallet = getWalletByUserId(user.userId);
  if (!wallet) return;

  const walletAddress = wallet.address;
  const userId = user.userId;
  const firstName = user.firstName || "there";

  try {
    // Get current USDC balance
    const usdcBalance = await getTokenBalance(
      walletAddress,
      COMMON_TOKENS.USDC.address
    );

    const currentBalance = usdcBalance.toString();

    // Get previous balance
    const previousBalance = previousBalances.get(userId);

    if (previousBalance) {
      // Check for USDC deposit
      if (parseFloat(currentBalance) > parseFloat(previousBalance)) {
        const depositAmount = (
          parseFloat(currentBalance) - parseFloat(previousBalance)
        ).toFixed(2);

        console.log(`💰 Deposit detected for ${firstName}: ${depositAmount} USDC`);
        
        await notifyDepositReceived(
          userId,
          firstName,
          depositAmount,
          "USDC"
        );
      }
    }

    // Update stored balance
    previousBalances.set(userId, currentBalance);

  } catch (error) {
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
    }, 30_000);

    console.log("✅ Deposit monitoring service started");
    console.log("📊 Checking balances every 30 seconds");

  } catch (error) {
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

// Start the service if run directly
if (require.main === module) {
  startMonitoringService();
}

module.exports = { startMonitoringService, checkUserBalances };