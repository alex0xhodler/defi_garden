const { Bot } = require("grammy");
const WebSocket = require("ws");
const { 
  getUsersForBalanceMonitoring, 
  getWalletByUserId,
  stopDepositMonitoring 
} = require("../lib/database.ts");
require("dotenv").config();

// Simple bot instance for notifications
const monitorBot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "");

// Base USDC token address
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// DRPC WebSocket endpoint for Base mainnet (no rate limiting)
const BASE_WSS = "wss://lb.drpc.org/base/AvgxwlBbqkwviRzVD3VcB1HBZLeBg98R8IWRqhnKxixj";

// Store monitored wallet addresses and connection state
const monitoredWallets = new Set();
let wsConnection = null;
let pollInterval = null;
let connectionCheckInterval = null;

/**
 * Auto-deploy funds and complete onboarding using Coinbase CDP
 */
async function autoDeployFundsAndCompleteOnboarding(userId, firstName, amount, tokenSymbol, txHash) {
  try {
    // Step 1: Send initial notification
    await monitorBot.api.sendMessage(
      userId,
      `🎉 *Deposit confirmed ${firstName}!*\n\n` +
      `${amount} ${tokenSymbol} received!\n\n` +
      `Auto-deploying to Compound V3 with sponsored gas... 🚀`,
      { parse_mode: "Markdown" }
    );

    // Step 2: Auto-deploy using Coinbase CDP sponsored transactions
    console.log(`🚀 Auto-deploying ${amount} ${tokenSymbol} for user ${userId} using CDP...`);
    
    // Import Coinbase DeFi service
    const { autoDeployToCompoundV3 } = require("../services/coinbase-defi.ts");
    
    // Execute sponsored deployment
    const deployResult = await autoDeployToCompoundV3(userId, amount);
    
    if (deployResult.success) {
      console.log(`✅ Successfully deployed ${amount} ${tokenSymbol} to Compound V3`);
      
      // Step 3: Send success message with main menu
      const { createMainMenuKeyboard, getMainMenuMessage } = await import("../utils/mainMenu.ts");
      const { getCompoundV3APY } = await import("../lib/defillama-api.ts");
      
      const apy = await getCompoundV3APY();
      
      // Import earnings utilities
      const { calculateRealTimeEarnings, formatTxLink } = await import("../utils/earnings.ts");
      const earnings = calculateRealTimeEarnings(parseFloat(amount), apy);
      
      await monitorBot.api.sendMessage(
        userId,
        `🐙 *Welcome to your **inkvest** control center!*\n\n` +
        `✅ ${amount} ${tokenSymbol} deployed to Compound V3 (${apy}% APY)\n` +
        `✅ Gas sponsored by inkvest (gasless for you!)\n` +
        `✅ Auto-compounding activated\n` +
        `✅ Earning ${earnings} automatically\n\n` +
        `Deposit TX: ${formatTxLink(txHash)}\n` +
        `Deploy TX: ${formatTxLink(deployResult.txHash)}`,
        { 
          parse_mode: "Markdown",
          reply_markup: createMainMenuKeyboard()
        }
      );

      console.log(`🦑 ${firstName} successfully onboarded with ${amount} ${tokenSymbol} deployed!`);

    } else {
      console.error(`❌ Failed to deploy ${amount} ${tokenSymbol}: ${deployResult.error}`);
      
      // Send error message but still complete onboarding
      await monitorBot.api.sendMessage(
        userId,
        `⚠️ *Deposit confirmed but deployment failed*\n\n` +
        `${amount} ${tokenSymbol} received but couldn't auto-deploy.\n\n` +
        `Error: ${deployResult.error}\n\n` +
        `Please try manual deployment via the bot menu.`,
        { parse_mode: "Markdown" }
      );
    }

  } catch (error) {
    console.error(`Failed to auto-deploy and complete onboarding for user ${userId}:`, error);
    
    // Fallback: send basic notification
    try {
      await monitorBot.api.sendMessage(
        userId,
        `✨ Deposit confirmed ${firstName}!\n\n` +
        `${amount} ${tokenSymbol} received but auto-deployment failed.\n\n` +
        `Please use the bot menu to deploy manually.`
      );
    } catch (fallbackError) {
      console.error(`Failed to send fallback notification:`, fallbackError);
    }
  }
}

/**
 * Load wallet addresses to monitor (gets correct smart wallet addresses)
 */
async function loadWalletAddresses() {
  try {
    const users = getUsersForBalanceMonitoring();
    const previousCount = monitoredWallets.size;
    monitoredWallets.clear();
    
    for (const user of users) {
      const wallet = getWalletByUserId(user.userId);
      if (wallet) {
        let addressToMonitor = wallet.address;
        
        // For Coinbase Smart Wallets, get the correct smart wallet address
        if (wallet.type === 'coinbase-smart-wallet') {
          try {
            // Import getCoinbaseSmartWallet to get the real address
            const { getCoinbaseSmartWallet } = await import("../lib/coinbase-wallet.ts");
            const smartWallet = await getCoinbaseSmartWallet(user.userId);
            if (smartWallet && smartWallet.smartAccount) {
              addressToMonitor = smartWallet.smartAccount.address;
              console.log(`📍 Using Smart Wallet address for monitoring: ${addressToMonitor} (database had: ${wallet.address})`);
            } else {
              console.log(`⚠️ Could not get Smart Wallet for user ${user.userId}, using database address: ${wallet.address}`);
            }
          } catch (error) {
            console.error(`Error getting smart wallet address for user ${user.userId}:`, error);
          }
        }
        
        monitoredWallets.add({
          address: addressToMonitor.toLowerCase(),
          userId: user.userId,
          firstName: user.firstName || "there"
        });
      }
    }
    
    const currentCount = monitoredWallets.size;
    if (currentCount !== previousCount) {
      console.log(`📊 Wallet count changed: ${previousCount} → ${currentCount} wallets to monitor`);
    }
    
    return Array.from(monitoredWallets);
    
  } catch (error) {
    console.error("Error loading wallet addresses:", error);
    return [];
  }
}

/**
 * Force immediate refresh of monitored wallets
 * Call this when new users are created for instant monitoring
 */
async function forceRefreshWallets() {
  console.log("🔄 Force refreshing monitored wallets...");
  await checkAndManageConnection();
}

/**
 * Check wallet count and manage WebSocket connection accordingly
 */
async function checkAndManageConnection() {
  const wallets = await loadWalletAddresses();
  const walletCount = wallets.length;

  if (walletCount === 0 && wsConnection) {
    // No wallets to monitor - disconnect everything
    console.log("📴 No wallets to monitor - disconnecting WebSocket and stopping polling");
    
    wsConnection.close();
    wsConnection = null;
    
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    
  } else if (walletCount > 0 && !wsConnection) {
    // New wallets found - start connection and polling
    console.log(`🔌 Starting WebSocket monitoring for ${walletCount} wallet(s)`);
    
    setupWebSocketConnection();
    
    // Start polling every 5 seconds when monitoring active wallets
    if (!pollInterval) {
      pollInterval = setInterval(async () => {
        await checkAndManageConnection();
      }, 5 * 1000);
    }
  }

  return walletCount;
}

/**
 * Parse transfer log data
 */
function parseTransferAmount(data) {
  try {
    // Remove '0x' prefix and convert hex to decimal
    const hexValue = data.slice(2);
    const decimalValue = BigInt('0x' + hexValue);
    
    // USDC has 6 decimals
    const amount = Number(decimalValue) / Math.pow(10, 6);
    return amount.toFixed(2);
    
  } catch (error) {
    console.error("Error parsing transfer amount:", error);
    return "0.00";
  }
}

/**
 * Handle incoming transfer event
 */
function handleTransferEvent(log) {
  try {
    // Extract recipient address from topics[2] (indexed parameter)
    const recipientAddress = '0x' + log.topics[2].slice(-40);
    const recipient = recipientAddress.toLowerCase();
    
    // Check if this is one of our monitored wallets
    const walletInfo = Array.from(monitoredWallets).find(w => w.address === recipient);
    
    if (walletInfo) {
      const amount = parseTransferAmount(log.data);
      const txHash = log.transactionHash;
      
      console.log(`💰 USDC deposit detected: ${amount} USDC to ${recipient.slice(0,8)}... (${txHash.slice(0,10)}...)`);
      
      // Stop deposit monitoring for this wallet (deposit received!)
      stopDepositMonitoring(walletInfo.userId);
      
      // Auto-deploy funds and complete onboarding
      autoDeployFundsAndCompleteOnboarding(
        walletInfo.userId,
        walletInfo.firstName,
        amount,
        "USDC",
        txHash
      );
      
      // Force refresh to remove this wallet from monitoring
      setTimeout(() => {
        checkAndManageConnection();
      }, 1000);
    }
    
  } catch (error) {
    console.error("Error handling transfer event:", error);
  }
}

/**
 * Setup WebSocket connection with event subscriptions
 */
function setupWebSocketConnection() {
  const ws = new WebSocket(BASE_WSS);
  let pingInterval;
  
  // Store connection reference for management
  wsConnection = ws;
  
  ws.on('open', function() {
    console.log('🔌 Connected to DRPC WebSocket (Base mainnet)');
    
    // Subscribe to USDC Transfer events
    const subscription = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_subscribe",
      params: [
        "logs",
        {
          address: BASE_USDC_ADDRESS,
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" // Transfer event signature
          ]
        }
      ]
    };
    
    ws.send(JSON.stringify(subscription));
    console.log(`📡 Subscribed to USDC Transfer events on ${BASE_USDC_ADDRESS}`);
    
    // Setup ping to keep connection alive
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);
  });

  ws.on('message', function(data) {
    try {
      const message = JSON.parse(data);
      
      if (message.method === 'eth_subscription') {
        const log = message.params.result;
        handleTransferEvent(log);
      } else if (message.id === 1) {
        console.log(`✅ Subscription confirmed: ${message.result}`);
      }
      
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  });

  ws.on('error', function(error) {
    console.error('❌ WebSocket error:', error.message || error);
    
    // Log specific connection errors
    if (error.code === 'ECONNREFUSED') {
      console.error('💔 Connection refused - check RPC endpoint configuration');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🔍 DNS resolution failed - check network connectivity');
    } else if (error.message && error.message.includes('Unexpected server response')) {
      console.error('🚫 Server rejected WebSocket upgrade - endpoint may not support WebSocket');
    }
  });

  ws.on('close', function(code, reason) {
    console.log(`🔌 WebSocket connection closed (${code}): ${reason || 'No reason'}`);
    
    // Clear connection reference
    wsConnection = null;
    
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    
    // Only reconnect if we still have wallets to monitor
    setTimeout(async () => {
      await checkAndManageConnection();
    }, 10000);
  });

  ws.on('pong', function() {
    // Keep-alive pong received
  });
}

/**
 * Start the event-based monitoring service
 */
async function startEventMonitoringService() {
  console.log("🦑 Starting inkvest event-based deposit monitoring...");

  try {
    // Check initial wallet count and start connections if needed
    const walletCount = await checkAndManageConnection();
    
    if (walletCount === 0) {
      console.log("⚠️  No wallets to monitor currently - service will activate when wallets are added");
    } else {
      console.log(`✅ Monitoring ${walletCount} wallet(s) with 5-second polling`);
    }
    
    // Check for wallet changes every 30 seconds (when idle) 
    // Active polling (5 seconds) only happens when wallets are being monitored
    connectionCheckInterval = setInterval(async () => {
      // Only run the check if we're not already actively polling
      if (!pollInterval) {
        await checkAndManageConnection();
      }
    }, 30 * 1000);
    
    console.log("✅ Event-based monitoring service started");
    console.log("📡 Efficient monitoring - zero resources when no wallets");
    
  } catch (error) {
    console.error("❌ Failed to start event monitoring service:", error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on("SIGINT", async () => {
  console.log("🛑 Stopping event monitoring service...");
  
  // Close WebSocket connection
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
  }
  
  // Clear all intervals
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
  
  await monitorBot.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Stopping event monitoring service...");
  
  // Close WebSocket connection
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
  }
  
  // Clear all intervals
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
  
  await monitorBot.stop();
  process.exit(0);
});

// Start the service if run directly
if (require.main === module) {
  startEventMonitoringService();
}

module.exports = { startEventMonitoringService, forceRefreshWallets };