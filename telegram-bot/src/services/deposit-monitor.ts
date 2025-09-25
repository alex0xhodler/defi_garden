import { Bot } from "grammy";
import { 
  getUsersForBalanceMonitoring, 
  getWalletByUserId,
  updateUserBalanceCheckTime 
} from "../lib/database";
import { getTokenBalance } from "../lib/token-wallet";
import { COMMON_TOKENS } from "../utils/constants";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Simple bot instance without complex typing
const monitorBot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "");

// Store previous balances to detect changes
const previousBalances = new Map<string, { usdc: string; eth: string }>();

/**
 * Sends a notification to a user when a new deposit is detected.
 * @param {string} userId - The user's Telegram ID.
 * @param {string} firstName - The user's first name.
 * @param {string} amount - The amount of the deposit.
 * @param {string} tokenSymbol - The symbol of the deposited token.
 * @returns {Promise<void>}
 */
async function notifyDepositReceived(
  userId: string,
  firstName: string,
  amount: string,
  tokenSymbol: string
): Promise<void> {
  try {
    const message = `✨ Deposit confirmed ${firstName}!\n\n` +
      `${amount} ${tokenSymbol} received and ready to start earning!\n\n` +
      `🦑 Your inkvest account is growing! 🦑`;

    await monitorBot.api.sendMessage(userId, message);
    console.log(`📬 Sent deposit notification to ${firstName}: ${amount} ${tokenSymbol}`);

  } catch (error) {
    console.error(`Failed to send deposit notification to user ${userId}:`, error);
  }
}

/**
 * Periodically checks the balances for all users who are currently being monitored for deposits.
 * It fetches the list of users from the database and then checks each one.
 * @returns {Promise<void>}
 */
async function checkUserBalances(): Promise<void> {
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
 * Checks the token balances for a single user, compares them to previously stored balances,
 * and sends a notification if a new deposit is detected.
 * @param {any} user - The user object from the database.
 * @returns {Promise<void>}
 */
async function checkSingleUserBalance(user: any): Promise<void> {
  const wallet = getWalletByUserId(user.userId);
  if (!wallet) return;

  const walletAddress = wallet.address;
  const userId = user.userId;
  const firstName = user.firstName || "there";

  try {
    // Get current balances
    const usdcBalance = await getTokenBalance(
      walletAddress,
      COMMON_TOKENS.USDC
    );

    const currentBalances = {
      usdc: usdcBalance.toString(),
      eth: "0"
    };

    // Get previous balances
    const previousBalance = previousBalances.get(userId);

    if (previousBalance) {
      // Check for USDC deposit
      if (parseFloat(currentBalances.usdc) > parseFloat(previousBalance.usdc)) {
        const depositAmount = (
          parseFloat(currentBalances.usdc) - parseFloat(previousBalance.usdc)
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

    // Update stored balances
    previousBalances.set(userId, currentBalances);

  } catch (error) {
    console.error(`Error checking balance for ${walletAddress}:`, error);
  }
}

/**
 * Starts the deposit monitoring service.
 * It performs an initial balance check and then sets up a recurring interval to check for new deposits.
 * @returns {Promise<void>}
 */
async function startMonitoringService(): Promise<void> {
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

// Start the service
if (require.main === module) {
  startMonitoringService();
}

export { startMonitoringService, checkUserBalances };