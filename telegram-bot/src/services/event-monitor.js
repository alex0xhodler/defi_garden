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
// Store pre-deposit balances to detect first-time vs existing users
const preDepositBalances = new Map();
// Cache deployment status to avoid repeated blockchain calls
const deploymentStatusCache = new Map();
let wsConnection = null;
let pollInterval = null;
let connectionCheckInterval = null;

/**
 * Determine the highest APY protocol and its deployment function
 */
async function getHighestAPYProtocol() {
  try {
    const { fetchRealTimeYields } = require("../lib/defillama-api");
    
    // Fetch current APYs from DeFiLlama
    const yields = await fetchRealTimeYields();
    
    // Sort by APY descending to get the highest
    const sortedYields = yields.sort((a, b) => b.apy - a.apy);
    const highestYieldProtocol = sortedYields[0];
    
    console.log(`🎯 Highest APY Protocol: ${highestYieldProtocol.project} with ${highestYieldProtocol.apy}% APY`);
    
    // Map protocol names to deployment functions
    const protocolMap = {
      'Aave': {
        deployFn: 'gaslessDeployToAave',
        displayName: 'Aave V3'
      },
      'Fluid': {
        deployFn: 'gaslessDeployToFluid', 
        displayName: 'Fluid'
      },
      'Compound': {
        deployFn: 'autoDeployToCompoundV3',
        displayName: 'Compound V3'
      },
      'Morpho': {
        deployFn: 'deployToMorphoPYTH',
        displayName: 'Morpho PYTH/USDC'
      }
    };
    
    const protocolConfig = protocolMap[highestYieldProtocol.project];
    if (!protocolConfig) {
      console.warn(`⚠️ Unknown protocol ${highestYieldProtocol.project}, defaulting to Compound V3`);
      return {
        protocol: 'Compound V3',
        deployFn: 'autoDeployToCompoundV3',
        apy: highestYieldProtocol.apy,
        project: 'Compound'
      };
    }
    
    return {
      protocol: protocolConfig.displayName,
      deployFn: protocolConfig.deployFn,
      apy: highestYieldProtocol.apy,
      project: highestYieldProtocol.project
    };
    
  } catch (error) {
    console.error("Error determining highest APY protocol:", error);
    // Fallback to Compound V3 if API fails
    return {
      protocol: 'Compound V3',
      deployFn: 'autoDeployToCompoundV3', 
      apy: 7.65,
      project: 'Compound'
    };
  }
}

/**
 * Manually set pre-deposit balance for a user (for new wallet edge case)
 */
function setPreDepositBalance(userId, balance) {
  console.log(`🎯 Manually setting pre-deposit balance for user ${userId}: $${balance}`);
  preDepositBalances.set(userId, balance);
}

/**
 * Check if user has existing funds in their smart wallet
 */
async function checkPreDepositBalance(userId) {
  try {
    const { getCoinbaseWalletUSDCBalance } = require("../lib/coinbase-wallet");
    const { getCoinbaseSmartWallet } = require("../lib/coinbase-wallet");
    
    const wallet = await getCoinbaseSmartWallet(userId);
    if (!wallet || !wallet.smartAccount) {
      console.log(`⚠️ Could not get smart wallet for balance check: ${userId}`);
      return 0;
    }
    
    const balance = await getCoinbaseWalletUSDCBalance(wallet.smartAccount.address);
    const balanceNum = parseFloat(balance) || 0;
    
    console.log(`💰 Pre-deposit balance check for user ${userId}: $${balanceNum} USDC`);
    return balanceNum;
    
  } catch (error) {
    console.error(`Error checking pre-deposit balance for user ${userId}:`, error);
    return 0;
  }
}

/**
 * Handle new deposit - auto-deploy for first-time users, notify existing users
 */
async function handleNewDeposit(userId, firstName, amount, tokenSymbol, txHash) {
  try {
    // Get the pre-deposit balance we stored when monitoring started
    const preDepositBalance = preDepositBalances.get(userId) || 0;
    const isFirstDeposit = preDepositBalance < 0.01; // Less than 1 cent = new user
    
    console.log(`💡 Deposit handling: User ${userId}, pre-deposit: $${preDepositBalance}, first deposit: ${isFirstDeposit}`);
    
    if (isFirstDeposit) {
      // New user - auto-deploy for quick onboarding
      await handleFirstTimeDeposit(userId, firstName, amount, tokenSymbol, txHash);
    } else {
      // Existing user - keep funds in wallet and notify
      await handleExistingUserDeposit(userId, firstName, amount, tokenSymbol, txHash);
    }
    
    // Clean up the stored balance
    preDepositBalances.delete(userId);
    
  } catch (error) {
    console.error(`Failed to handle deposit for user ${userId}:`, error);
    
    // Fallback: send basic notification
    try {
      await monitorBot.api.sendMessage(
        userId,
        `✨ Deposit confirmed ${firstName}!\n\n` +
        `${amount} ${tokenSymbol} received but processing failed.\n\n` +
        `Please use the bot menu to manage your funds.`
      );
    } catch (fallbackError) {
      console.error(`Failed to send fallback notification:`, fallbackError);
    }
  }
}

/**
 * Handle first-time deposit - auto-deploy for quick onboarding
 */
async function handleFirstTimeDeposit(userId, firstName, amount, tokenSymbol, txHash) {
  try {
    // Step 1: Determine the highest APY protocol
    const bestProtocol = await getHighestAPYProtocol();
    
    // Step 2: Send initial notification
    await monitorBot.api.sendMessage(
      userId,
      `🎉 *Deposit confirmed ${firstName}!*\n\n` +
      `${amount} ${tokenSymbol} received!\n\n` +
      `Auto-deploying to ${bestProtocol.protocol} (${bestProtocol.apy}% APY) with sponsored gas... 🦑`,
      { parse_mode: "Markdown" }
    );

    // Step 3: Auto-deploy using Coinbase CDP sponsored transactions
    console.log(`🦑 Auto-deploying ${amount} ${tokenSymbol} for user ${userId} to ${bestProtocol.protocol}...`);
    
    // Import Coinbase DeFi service and get the appropriate deployment function
    const coinbaseDefi = require("../services/coinbase-defi.ts");
    const deploymentFunction = coinbaseDefi[bestProtocol.deployFn];
    
    if (!deploymentFunction) {
      throw new Error(`Deployment function ${bestProtocol.deployFn} not found`);
    }
    
    // Execute sponsored deployment
    const deployResult = await deploymentFunction(userId, amount);
    
    if (deployResult.success) {
      console.log(`✅ Successfully deployed ${amount} ${tokenSymbol} to ${bestProtocol.protocol}`);
      
      // Step 4: Send success message with main menu
      const { createMainMenuKeyboard, getMainMenuMessage } = require("../utils/mainMenu");
      
      // Import earnings utilities
      const { calculateDetailedEarnings, formatTxLink } = require("../utils/earnings");
      const earnings = calculateDetailedEarnings(parseFloat(amount), bestProtocol.apy);
      
      await monitorBot.api.sendMessage(
        userId,
        `🐙 *Welcome to your **inkvest** savings account!*\n\n` +
        `💰 **Position Summary:**\n` +
        `• Invested: $${amount} ${tokenSymbol} into ${bestProtocol.protocol}\n` +
        `• APY: ${bestProtocol.apy}% (auto-compounding)\n` +
        `• Strategy: Gasless & automated\n\n` +
        `📈 **Your Earnings Breakdown:**\n` +
        `• Daily: ${earnings.dailyWithContext}\n` +
        `• Weekly: ${earnings.weekly}\n` +
        `• Monthly: ${earnings.monthly}\n` +
        `• Yearly: ${earnings.yearly}\n` +
        `• Time to 2x: ~${earnings.timeToDouble}\n\n` +
        `✅ **Benefits:**\n` +
        `• ${earnings.comparisonMultiple} better than US savings (${earnings.savingsApy})\n` +
        `• Gas sponsored by inkvest\n` +
        `• Withdraw anytime, no penalties\n\n` +
        `📝 [View Deposit](https://basescan.org/tx/${txHash}) | [View Investment](https://basescan.org/tx/${deployResult.txHash})`,
        { 
          parse_mode: "Markdown",
          reply_markup: createMainMenuKeyboard()
        }
      );

      console.log(`🦑 ${firstName} successfully onboarded with ${amount} ${tokenSymbol} deployed!`);

    } else {
      console.error(`❌ Failed to deploy ${amount} ${tokenSymbol} to ${bestProtocol.protocol}: ${deployResult.error}`);
      
      // Send error message but still complete onboarding
      await monitorBot.api.sendMessage(
        userId,
        `⚠️ *Deposit confirmed but deployment failed*\n\n` +
        `${amount} ${tokenSymbol} received but couldn't auto-deploy to ${bestProtocol.protocol}.\n\n` +
        `Error: ${deployResult.error}\n\n` +
        `Please try manual deployment via the bot menu.`,
        { parse_mode: "Markdown" }
      );
    }

  } catch (error) {
    console.error(`Failed to auto-deploy and complete onboarding for user ${userId}:`, error);
    
    // Send error message but still complete onboarding
    await monitorBot.api.sendMessage(
      userId,
      `⚠️ *Deposit confirmed but deployment failed*\n\n` +
      `${amount} ${tokenSymbol} received but couldn't auto-deploy.\n\n` +
      `Please try manual deployment via the bot menu.`,
      { parse_mode: "Markdown" }
    );
  }
}

/**
 * Handle deposit for existing user - check for pending transactions and offer smart completion
 */
async function handleExistingUserDeposit(userId, firstName, amount, tokenSymbol, txHash) {
  try {
    console.log(`💰 Existing user deposit: ${amount} ${tokenSymbol} for user ${userId}`);
    
    // Get current total balance after deposit
    const { getCoinbaseWalletUSDCBalance } = require("../lib/coinbase-wallet");
    const { getCoinbaseSmartWallet } = require("../lib/coinbase-wallet");
    
    const wallet = await getCoinbaseSmartWallet(userId);
    let totalBalance = amount; // fallback if we can't get current balance
    
    if (wallet && wallet.smartAccount) {
      const currentBalance = await getCoinbaseWalletUSDCBalance(wallet.smartAccount.address);
      totalBalance = currentBalance;
    }
    
    // Check for pending transaction in database session
    const { getDatabase } = require("../lib/database");
    let pendingTx = null;
    
    try {
      const db = getDatabase();
      const userSession = db.prepare('SELECT session_data FROM users WHERE userId = ?').get(userId);
      
      if (userSession && userSession.session_data) {
        const sessionData = JSON.parse(userSession.session_data);
        pendingTx = sessionData.pendingTransaction;
        
        // Check if pending transaction is still valid (not expired - 5 minutes)
        if (pendingTx && Date.now() - pendingTx.timestamp > 5 * 60 * 1000) {
          console.log(`⏰ Pending transaction expired for user ${userId}, clearing it`);
          
          // Clear expired pending transaction
          sessionData.pendingTransaction = undefined;
          db.prepare('UPDATE users SET session_data = ? WHERE userId = ?')
            .run(JSON.stringify(sessionData), userId);
          
          pendingTx = null;
        }
      }
    } catch (dbError) {
      console.error(`Error checking pending transaction for user ${userId}:`, dbError);
    }
    
    // Import menu utilities
    const { InlineKeyboard } = require("grammy");
    const { formatTxLink } = require("../utils/earnings");
    
    if (pendingTx) {
      // User has pending transaction - check if deposit is sufficient
      const depositAmount = parseFloat(amount);
      const stillNeeded = pendingTx.shortage - depositAmount;
      
      console.log(`🎯 User ${userId} has pending ${pendingTx.protocol} investment: needed $${pendingTx.shortage}, deposited $${depositAmount}`);
      
      if (stillNeeded <= 0) {
        // Sufficient deposit - offer completion
        const keyboard = new InlineKeyboard()
          .text(`✅ Complete ${pendingTx.protocol} Investment (${pendingTx.apy}% APY)`, "retry_pending_transaction")
          .row()
          .text("💼 Keep in Wallet", "cancel_pending_transaction")
          .text("🎯 View Options", "main_menu");
        
        await monitorBot.api.sendMessage(
          userId,
          `🎉 **Perfect ${firstName}!**\n\n` +
          `You deposited **$${depositAmount} ${tokenSymbol}**\n` +
          `✅ You now have enough for your investment!\n\n` +
          `**Ready to complete:**\n` +
          `• Protocol: ${pendingTx.protocol}\n` +
          `• Amount: $${pendingTx.amount}\n` +
          `• APY: ${pendingTx.apy}%\n\n` +
          `Deposit TX: ${formatTxLink(txHash)}\n\n` +
          `Shall I complete your investment now?`,
          { 
            parse_mode: "Markdown",
            reply_markup: keyboard
          }
        );
        
      } else {
        // Partial deposit - show remaining needed
        console.log(`📊 Partial deposit: user ${userId} still needs $${stillNeeded.toFixed(2)} more`);
        
        // Update the shortage in session
        try {
          const db = getDatabase();
          const userSession = db.prepare('SELECT session_data FROM users WHERE userId = ?').get(userId);
          
          if (userSession && userSession.session_data) {
            const sessionData = JSON.parse(userSession.session_data);
            sessionData.pendingTransaction.shortage = stillNeeded;
            db.prepare('UPDATE users SET session_data = ? WHERE userId = ?')
              .run(JSON.stringify(sessionData), userId);
          }
        } catch (updateError) {
          console.error(`Error updating pending transaction shortage:`, updateError);
        }
        
        const keyboard = new InlineKeyboard()
          .text(`📥 Deposit $${stillNeeded.toFixed(2)} More`, "deposit")
          .row()
          .text("💰 Invest Available Funds", "invest_available")
          .row()
          .text("❌ Cancel", "cancel_pending_transaction");
        
        await monitorBot.api.sendMessage(
          userId,
          `💰 **Partial Deposit Received ${firstName}**\n\n` +
          `+$${depositAmount} ${tokenSymbol} received\n` +
          `You still need **$${stillNeeded.toFixed(2)}** more\n\n` +
          `**Your pending investment:**\n` +
          `• ${pendingTx.protocol} at ${pendingTx.apy}% APY\n` +
          `• Total needed: $${pendingTx.amount}\n\n` +
          `Deposit TX: ${formatTxLink(txHash)}\n\n` +
          `What would you like to do?`,
          { 
            parse_mode: "Markdown",
            reply_markup: keyboard
          }
        );
      }
      
    } else {
      // No pending transaction - standard deposit flow
      const keyboard = new InlineKeyboard()
        .text("🦑 inkvest Automanaged", "zap_auto_deploy")
        .row()
        .text("📊 View Portfolio", "view_portfolio")
        .text("💰 Check Balance", "check_balance")
        .row()
        .text("🔄 Main Menu", "main_menu");
      
      await monitorBot.api.sendMessage(
        userId,
        `💰 **Deposit confirmed ${firstName}!**\n\n` +
        `+$${amount} ${tokenSymbol} received\n` +
        `💳 **Total wallet balance: $${totalBalance} USDC**\n\n` +
        `Your funds are ready! Choose your investment approach:\n\n` +
        `Deposit TX: ${formatTxLink(txHash)}`,
        { 
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
    }
    
    console.log(`✅ Existing user ${firstName} deposit handled - ${pendingTx ? 'with pending transaction' : 'standard flow'}`);
    
  } catch (error) {
    console.error(`Failed to handle existing user deposit for user ${userId}:`, error);
    
    // Fallback notification
    await monitorBot.api.sendMessage(
      userId,
      `💰 **Deposit confirmed ${firstName}!**\n\n` +
      `${amount} ${tokenSymbol} received and ready in your wallet.\n\n` +
      `Use the bot menu to deploy your funds.`,
      { parse_mode: "Markdown" }
    );
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
        
        // Use the same address that the bot displays to users for deposits
        console.log(`📍 Using wallet address for monitoring deposits: ${addressToMonitor}`);
        
        // Store pre-deposit balance for this user (only if not already set)
        if (!preDepositBalances.has(user.userId)) {
          const preBalance = await checkPreDepositBalance(user.userId);
          preDepositBalances.set(user.userId, preBalance);
          console.log(`🏁 Initial pre-deposit balance set for user ${user.userId}: $${preBalance} USDC`);
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
    
    // Start polling every 30 seconds when monitoring active wallets (reduced frequency)
    if (!pollInterval) {
      pollInterval = setInterval(async () => {
        await checkAndManageConnection();
      }, 30 * 1000);
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
      
      // Handle new deposit (auto-deploy for new users, notify existing users)
      handleNewDeposit(
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
      console.log(`✅ Monitoring ${walletCount} wallet(s) with 30-second polling`);
    }
    
    // Check for wallet changes every 60 seconds (when idle) 
    // Active polling (30 seconds) only happens when wallets are being monitored
    connectionCheckInterval = setInterval(async () => {
      // Only run the check if we're not already actively polling
      if (!pollInterval) {
        await checkAndManageConnection();
      }
    }, 60 * 1000);
    
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

module.exports = { startEventMonitoringService, forceRefreshWallets, setPreDepositBalance };