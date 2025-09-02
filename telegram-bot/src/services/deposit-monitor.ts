import { Bot } from "grammy";
import { BotContext, createInitialSessionData } from "../context";
import { 
  getUsersForBalanceMonitoring, 
  getWalletByUserId,
  updateUserBalanceCheckTime 
} from "../lib/database";
import { 
  notifyDepositReceived, 
  notifyLowGasBalance,
  initializeNotificationBot,
  getUserFirstName 
} from "../lib/notifications";
import { getTokenBalance } from "../lib/token-wallet";
import { COMMON_TOKENS } from "../utils/constants";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Bot instance
const monitorBot = new Bot<BotContext>(process.env.TELEGRAM_BOT_TOKEN || "");

// Initialize session middleware
import { session } from "grammy";
monitorBot.use(session({ initial: createInitialSessionData }));

// Initialize notification system
initializeNotificationBot(monitorBot);

// Store previous balances to detect changes
const previousBalances = new Map<string, { usdc: string; eth: string }>();

/**
 * Check balances for users who need monitoring
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
        
        // Update last balance check time
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
      COMMON_TOKENS.USDC.address
    );
    
    const ethBalance = await getTokenBalance(
      walletAddress,
      "0x0000000000000000000000000000000000000000" // Native ETH
    );

    const currentBalances = {
      usdc: usdcBalance.toString(),
      eth: ethBalance.toString()
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

      // Check for low ETH balance (less than 0.0005 ETH)
      const ethBalanceFloat = parseFloat(currentBalances.eth);
      if (ethBalanceFloat < 0.0005 && ethBalanceFloat > 0) {
        await notifyLowGasBalance(
          userId,
          firstName,
          ethBalanceFloat.toFixed(6)
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
 * Start the deposit monitoring service
 */
async function startMonitoringService(): Promise<void> {
  console.log("🚀 Starting deposit monitoring service...");

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

/**
 * Graceful shutdown
 */
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

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught exception in deposit monitor:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled rejection in deposit monitor:", reason);
  process.exit(1);
});

// Start the service
if (require.main === module) {
  startMonitoringService();
}

export { startMonitoringService, checkUserBalances };