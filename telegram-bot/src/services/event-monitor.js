const { Bot } = require("grammy");
const WebSocket = require("ws");
const { 
  getUsersForBalanceMonitoring, 
  getWalletByUserId 
} = require("../lib/database.ts");
require("dotenv").config();

// Simple bot instance for notifications
const monitorBot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "");

// Base USDC token address
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Alchemy WebSocket endpoint
const ALCHEMY_WSS = "wss://base-mainnet.g.alchemy.com/v2/lk_ng-qu5hCuS7Hw12s5s";

// Store monitored wallet addresses
const monitoredWallets = new Set();

/**
 * Send deposit notification
 */
async function notifyDepositReceived(userId, firstName, amount, tokenSymbol, txHash) {
  try {
    const message = `✨ Deposit confirmed ${firstName}!\n\n` +
      `${amount} ${tokenSymbol} received and ready to start earning!\n\n` +
      `Transaction: \`${txHash}\`\n\n` +
      `🦑 Your inkvest account is growing! 🚀`;

    await monitorBot.api.sendMessage(userId, message);
    console.log(`📬 Sent deposit notification to ${firstName}: ${amount} ${tokenSymbol} (${txHash.slice(0,10)}...)`);

  } catch (error) {
    console.error(`Failed to send deposit notification to user ${userId}:`, error);
  }
}

/**
 * Load wallet addresses to monitor
 */
function loadWalletAddresses() {
  try {
    const users = getUsersForBalanceMonitoring();
    monitoredWallets.clear();
    
    for (const user of users) {
      const wallet = getWalletByUserId(user.userId);
      if (wallet) {
        monitoredWallets.add({
          address: wallet.address.toLowerCase(),
          userId: user.userId,
          firstName: user.firstName || "there"
        });
      }
    }
    
    console.log(`📊 Loaded ${monitoredWallets.size} wallet addresses to monitor`);
    return Array.from(monitoredWallets);
    
  } catch (error) {
    console.error("Error loading wallet addresses:", error);
    return [];
  }
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
      
      // Send notification
      notifyDepositReceived(
        walletInfo.userId,
        walletInfo.firstName,
        amount,
        "USDC",
        txHash
      );
    }
    
  } catch (error) {
    console.error("Error handling transfer event:", error);
  }
}

/**
 * Setup WebSocket connection with event subscriptions
 */
function setupWebSocketConnection() {
  const ws = new WebSocket(ALCHEMY_WSS);
  let pingInterval;
  
  ws.on('open', function() {
    console.log('🔌 Connected to Alchemy WebSocket');
    
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
    console.error('❌ WebSocket error:', error);
  });

  ws.on('close', function() {
    console.log('🔌 WebSocket connection closed. Reconnecting in 5 seconds...');
    
    if (pingInterval) {
      clearInterval(pingInterval);
    }
    
    // Reconnect after delay
    setTimeout(() => {
      setupWebSocketConnection();
    }, 5000);
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
    // Load wallet addresses to monitor
    const wallets = loadWalletAddresses();
    
    if (wallets.length === 0) {
      console.log("⚠️  No wallets to monitor. Service will continue to listen for new users.");
    }
    
    // Setup WebSocket connection
    setupWebSocketConnection();
    
    // Refresh monitored wallets every 5 minutes
    setInterval(() => {
      loadWalletAddresses();
    }, 5 * 60 * 1000);
    
    console.log("✅ Event-based monitoring service started");
    console.log("📡 Listening for real-time USDC Transfer events");
    
  } catch (error) {
    console.error("❌ Failed to start event monitoring service:", error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on("SIGINT", async () => {
  console.log("🛑 Stopping event monitoring service...");
  await monitorBot.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Stopping event monitoring service...");
  await monitorBot.stop();
  process.exit(0);
});

// Start the service if run directly
if (require.main === module) {
  startEventMonitoringService();
}

module.exports = { startEventMonitoringService };