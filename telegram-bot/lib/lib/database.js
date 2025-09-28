"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = initDatabase;
exports.createUser = createUser;
exports.getUserByTelegramId = getUserByTelegramId;
exports.updateUserOnboardingStatus = updateUserOnboardingStatus;
exports.updateUserBalanceCheckTime = updateUserBalanceCheckTime;
exports.setExpectingDepositUntil = setExpectingDepositUntil;
exports.startDepositMonitoring = startDepositMonitoring;
exports.startDepositMonitoringWithContext = startDepositMonitoringWithContext;
exports.getMonitoringContext = getMonitoringContext;
exports.stopDepositMonitoring = stopDepositMonitoring;
exports.getUsersForBalanceMonitoring = getUsersForBalanceMonitoring;
exports.saveWallet = saveWallet;
exports.getWalletByUserId = getWalletByUserId;
exports.getWalletByAddress = getWalletByAddress;
exports.updateWalletDeploymentStatus = updateWalletDeploymentStatus;
exports.deleteWallet = deleteWallet;
exports.saveUserSettings = saveUserSettings;
exports.getUserSettings = getUserSettings;
exports.savePosition = savePosition;
exports.getPositionsByUserId = getPositionsByUserId;
exports.updatePositionValue = updatePositionValue;
exports.deletePosition = deletePosition;
exports.saveTransaction = saveTransaction;
exports.getTransactionsByUserId = getTransactionsByUserId;
exports.getPortfolioStats = getPortfolioStats;
exports.cleanupUnverifiedTransactions = cleanupUnverifiedTransactions;
exports.getDatabase = getDatabase;
exports.saveProtocolRate = saveProtocolRate;
exports.getProtocolRate = getProtocolRate;
exports.getAllProtocolRates = getAllProtocolRates;
exports.getIndexTokensByCategory = getIndexTokensByCategory;
exports.getIndexTokenById = getIndexTokenById;
exports.getAllActiveIndexTokens = getAllActiveIndexTokens;
exports.getIndexComposition = getIndexComposition;
exports.saveIndexPosition = saveIndexPosition;
exports.getIndexPositionsByUserId = getIndexPositionsByUserId;
exports.getIndexPositionByUserAndToken = getIndexPositionByUserAndToken;
exports.updateIndexPositionValue = updateIndexPositionValue;
exports.deleteIndexPosition = deleteIndexPosition;
exports.saveIndexTransaction = saveIndexTransaction;
exports.getIndexTransactionsByUserId = getIndexTransactionsByUserId;
exports.getIndexPortfolioStats = getIndexPortfolioStats;
exports.runIndexTablesMigration = runIndexTablesMigration;
exports.closeDatabase = closeDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const constants_1 = require("../utils/constants");
const db = new better_sqlite3_1.default(constants_1.DB_PATH);
// Initialize tables
function initDatabase() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS ${constants_1.DB_TABLES.USERS} (
      userId TEXT PRIMARY KEY,
      telegramId TEXT NOT NULL,
      username TEXT,
      firstName TEXT,
      lastName TEXT,
      createdAt INTEGER NOT NULL,
      onboardingCompleted INTEGER,
      lastBalanceCheck INTEGER,
      expectingDepositUntil INTEGER,
      notificationSettings TEXT,
      session_data TEXT
    );
    
    CREATE TABLE IF NOT EXISTS ${constants_1.DB_TABLES.WALLETS} (
      address TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      encryptedPrivateKey TEXT NOT NULL,
      type TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      autoCreated INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (userId) REFERENCES ${constants_1.DB_TABLES.USERS}(userId)
    );
    
    CREATE TABLE IF NOT EXISTS ${constants_1.DB_TABLES.SETTINGS} (
      userId TEXT PRIMARY KEY,
      riskLevel INTEGER NOT NULL DEFAULT 3,
      slippage REAL NOT NULL DEFAULT 1.0,
      autoCompound INTEGER NOT NULL DEFAULT 1,
      minApy REAL NOT NULL DEFAULT 5.0,
      FOREIGN KEY (userId) REFERENCES ${constants_1.DB_TABLES.USERS}(userId)
    );
    
    CREATE TABLE IF NOT EXISTS ${constants_1.DB_TABLES.POSITIONS} (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      poolId TEXT NOT NULL,
      protocol TEXT NOT NULL,
      chain TEXT NOT NULL,
      tokenSymbol TEXT NOT NULL,
      amountInvested REAL NOT NULL,
      currentValue REAL NOT NULL,
      entryApy REAL NOT NULL,
      currentApy REAL NOT NULL,
      yieldEarned REAL NOT NULL DEFAULT 0,
      txHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      lastUpdated INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES ${constants_1.DB_TABLES.USERS}(userId)
    );
    
    CREATE TABLE IF NOT EXISTS ${constants_1.DB_TABLES.TRANSACTIONS} (
      txHash TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      walletAddress TEXT NOT NULL,
      operationType TEXT NOT NULL,
      poolId TEXT,
      protocol TEXT,
      tokenSymbol TEXT NOT NULL,
      amount TEXT NOT NULL,
      yieldEarned TEXT,
      status TEXT NOT NULL,
      gasUsed TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES ${constants_1.DB_TABLES.USERS}(userId),
      FOREIGN KEY (walletAddress) REFERENCES ${constants_1.DB_TABLES.WALLETS}(address)
    );
    
    CREATE TABLE IF NOT EXISTS protocol_rates (
      protocol TEXT PRIMARY KEY,
      apy REAL NOT NULL,
      apyBase REAL NOT NULL,
      apyReward REAL NOT NULL,
      tvlUsd REAL NOT NULL,
      lastUpdated INTEGER NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_positions_user ON ${constants_1.DB_TABLES.POSITIONS}(userId);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON ${constants_1.DB_TABLES.TRANSACTIONS}(userId);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON ${constants_1.DB_TABLES.TRANSACTIONS}(operationType);
  `);
    // Add session_data column if it doesn't exist (migration)
    try {
        db.exec(`ALTER TABLE ${constants_1.DB_TABLES.USERS} ADD COLUMN session_data TEXT`);
        console.log("✅ Added session_data column to users table");
    }
    catch (error) {
        // Column already exists - this is normal
        if (!error.message.includes('duplicate column name')) {
            console.error("Error adding session_data column:", error);
        }
    }
    // Run index tables migration
    try {
        runIndexTablesMigration();
    }
    catch (error) {
        console.error("Error running index tables migration:", error);
    }
}
// User operations
function createUser(userId, telegramId, username, firstName, lastName) {
    const stmt = db.prepare(`
    INSERT OR IGNORE INTO ${constants_1.DB_TABLES.USERS} (userId, telegramId, username, firstName, lastName, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    stmt.run(userId, telegramId, username, firstName, lastName, Date.now());
}
function getUserByTelegramId(telegramId) {
    const stmt = db.prepare(`
    SELECT * FROM ${constants_1.DB_TABLES.USERS} WHERE telegramId = ?
  `);
    return stmt.get(telegramId);
}
function updateUserOnboardingStatus(userId, completed) {
    const stmt = db.prepare(`
    UPDATE ${constants_1.DB_TABLES.USERS} 
    SET onboardingCompleted = ?
    WHERE userId = ?
  `);
    stmt.run(completed ? Date.now() : null, userId);
}
function updateUserBalanceCheckTime(userId) {
    const stmt = db.prepare(`
    UPDATE ${constants_1.DB_TABLES.USERS} 
    SET lastBalanceCheck = ?
    WHERE userId = ?
  `);
    stmt.run(Date.now(), userId);
}
function setExpectingDepositUntil(userId, untilTimestamp) {
    const stmt = db.prepare(`
    UPDATE ${constants_1.DB_TABLES.USERS} 
    SET expectingDepositUntil = ?
    WHERE userId = ?
  `);
    stmt.run(untilTimestamp, userId);
}
function startDepositMonitoring(userId, durationMinutes = 5) {
    const untilTimestamp = Date.now() + (durationMinutes * 60 * 1000);
    setExpectingDepositUntil(userId, untilTimestamp);
}
// Enhanced version with context tracking
function startDepositMonitoringWithContext(userId, contextType, durationMinutes = 5, metadata) {
    // Start normal monitoring
    const untilTimestamp = Date.now() + (durationMinutes * 60 * 1000);
    setExpectingDepositUntil(userId, untilTimestamp);
    // Store monitoring context in session_data
    try {
        const db = getDatabase();
        const userSession = db.prepare('SELECT session_data FROM users WHERE userId = ?').get(userId);
        let sessionData = {};
        if (userSession && userSession.session_data) {
            sessionData = JSON.parse(userSession.session_data);
        }
        // Add monitoring context
        sessionData.monitoringContext = {
            type: contextType,
            timestamp: Date.now(),
            metadata: metadata || {}
        };
        // Save back to database
        db.prepare('UPDATE users SET session_data = ? WHERE userId = ?')
            .run(JSON.stringify(sessionData), userId);
        console.log(`💾 Stored monitoring context for user ${userId}: ${contextType}`);
    }
    catch (error) {
        console.error("Error storing monitoring context:", error);
        // Continue with normal monitoring even if context storage fails
    }
}
// Get monitoring context for a user
function getMonitoringContext(userId) {
    try {
        const db = getDatabase();
        const userSession = db.prepare('SELECT session_data FROM users WHERE userId = ?').get(userId);
        if (userSession && userSession.session_data) {
            const sessionData = JSON.parse(userSession.session_data);
            const context = sessionData.monitoringContext;
            // Check if context is expired (should match monitoring window)
            if (context && Date.now() - context.timestamp > 5 * 60 * 1000) {
                return null;
            }
            return context || null;
        }
    }
    catch (error) {
        console.error("Error getting monitoring context:", error);
    }
    return null;
}
function stopDepositMonitoring(userId) {
    setExpectingDepositUntil(userId, null);
}
function getUsersForBalanceMonitoring() {
    const currentTime = Date.now();
    const fiveMinutesAgo = currentTime - (5 * 60 * 1000); // 5 minutes in milliseconds
    const stmt = db.prepare(`
    SELECT * FROM ${constants_1.DB_TABLES.USERS} 
    WHERE (
      -- New users waiting for first deposit (only monitor for 5 minutes after lastBalanceCheck)
      (onboardingCompleted IS NULL AND lastBalanceCheck IS NOT NULL AND lastBalanceCheck > ?)
      OR 
      -- Users actively expecting deposit (within time window)
      (expectingDepositUntil IS NOT NULL AND expectingDepositUntil > ?)
    )
  `);
    return stmt.all(fiveMinutesAgo, currentTime);
}
// Wallet operations
function saveWallet(walletData, userId) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${constants_1.DB_TABLES.WALLETS} (address, userId, encryptedPrivateKey, type, createdAt, autoCreated, isDeployed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(walletData.address, userId, walletData.encryptedPrivateKey, walletData.type, walletData.createdAt, walletData.autoCreated ? 1 : 0, walletData.isDeployed ? 1 : 0);
}
function getWalletByUserId(userId) {
    const stmt = db.prepare(`
    SELECT * FROM ${constants_1.DB_TABLES.WALLETS} WHERE userId = ?
  `);
    const result = stmt.get(userId);
    if (!result)
        return null;
    return {
        address: result.address,
        encryptedPrivateKey: result.encryptedPrivateKey,
        type: result.type,
        createdAt: result.createdAt,
        autoCreated: result.autoCreated === 1,
        isDeployed: result.isDeployed === 1
    };
}
function getWalletByAddress(address) {
    const stmt = db.prepare(`
    SELECT * FROM ${constants_1.DB_TABLES.WALLETS} WHERE address = ?
  `);
    const result = stmt.get(address);
    if (!result)
        return null;
    return {
        address: result.address,
        encryptedPrivateKey: result.encryptedPrivateKey,
        type: result.type,
        createdAt: result.createdAt,
        autoCreated: result.autoCreated === 1,
        isDeployed: result.isDeployed === 1
    };
}
function updateWalletDeploymentStatus(userId, isDeployed) {
    const stmt = db.prepare(`
    UPDATE ${constants_1.DB_TABLES.WALLETS} SET isDeployed = ? WHERE userId = ?
  `);
    stmt.run(isDeployed ? 1 : 0, userId);
}
function deleteWallet(address) {
    const stmt = db.prepare(`
    DELETE FROM ${constants_1.DB_TABLES.WALLETS} WHERE address = ?
  `);
    stmt.run(address);
}
// Settings operations
function saveUserSettings(userId, settings) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${constants_1.DB_TABLES.SETTINGS} (userId, riskLevel, slippage, autoCompound, minApy)
    VALUES (?, ?, ?, ?, ?)
  `);
    stmt.run(userId, settings.riskLevel, settings.slippage, settings.autoCompound ? 1 : 0, settings.minApy);
}
function getUserSettings(userId) {
    const stmt = db.prepare(`
    SELECT * FROM ${constants_1.DB_TABLES.SETTINGS} WHERE userId = ?
  `);
    const result = stmt.get(userId);
    if (!result)
        return null;
    return {
        userId,
        riskLevel: result.riskLevel,
        slippage: result.slippage,
        autoCompound: result.autoCompound === 1,
        minApy: result.minApy,
    };
}
// Position operations
function savePosition(position) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${constants_1.DB_TABLES.POSITIONS} (
      id, userId, poolId, protocol, chain, tokenSymbol,
      amountInvested, currentValue, entryApy, currentApy, yieldEarned,
      txHash, createdAt, lastUpdated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const now = Date.now();
    stmt.run(position.id, position.userId, position.poolId, position.protocol, position.chain, position.tokenSymbol, position.amountInvested, position.currentValue, position.entryApy, position.currentApy, position.yieldEarned, position.txHash, position.createdAt instanceof Date ? position.createdAt.getTime() : now, now);
}
function getPositionsByUserId(userId) {
    const stmt = db.prepare(`
    SELECT * FROM ${constants_1.DB_TABLES.POSITIONS} 
    WHERE userId = ? 
    ORDER BY createdAt DESC
  `);
    const rows = stmt.all(userId);
    return rows.map(row => ({
        ...row,
        createdAt: new Date(row.createdAt),
        lastUpdated: new Date(row.lastUpdated)
    }));
}
function updatePositionValue(positionId, currentValue, currentApy, yieldEarned) {
    const stmt = db.prepare(`
    UPDATE ${constants_1.DB_TABLES.POSITIONS} 
    SET currentValue = ?, currentApy = ?, yieldEarned = ?, lastUpdated = ?
    WHERE id = ?
  `);
    stmt.run(currentValue, currentApy, yieldEarned, Date.now(), positionId);
}
function deletePosition(positionId) {
    const stmt = db.prepare(`
    DELETE FROM ${constants_1.DB_TABLES.POSITIONS} WHERE id = ?
  `);
    stmt.run(positionId);
}
// Transaction operations
function saveTransaction(txHash, userId, walletAddress, operationType, tokenSymbol, amount, status, poolId, protocol, yieldEarned, gasUsed) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${constants_1.DB_TABLES.TRANSACTIONS} (
      txHash, userId, walletAddress, operationType, poolId, protocol,
      tokenSymbol, amount, yieldEarned, status, gasUsed, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(txHash, userId, walletAddress, operationType, poolId, protocol, tokenSymbol, amount, yieldEarned, status, gasUsed, Date.now());
}
function getTransactionsByUserId(userId, limit = 10) {
    const stmt = db.prepare(`
    SELECT * FROM ${constants_1.DB_TABLES.TRANSACTIONS} 
    WHERE userId = ? 
    ORDER BY timestamp DESC 
    LIMIT ?
  `);
    return stmt.all(userId, limit);
}
function getPortfolioStats(userId) {
    const stmt = db.prepare(`
    SELECT 
      SUM(currentValue) as totalValue,
      SUM(amountInvested) as totalInvested, 
      SUM(yieldEarned) as totalYield,
      COUNT(*) as positionCount
    FROM ${constants_1.DB_TABLES.POSITIONS}
    WHERE userId = ?
  `);
    const result = stmt.get(userId);
    return {
        totalValue: result.totalValue || 0,
        totalInvested: result.totalInvested || 0,
        totalYield: result.totalYield || 0,
        positionCount: result.positionCount || 0
    };
}
// Clean up unverified transactions and positions
function cleanupUnverifiedTransactions(userId) {
    // Keep only the latest successful transaction for the user
    const latestSuccessfulTx = db.prepare(`
    SELECT txHash FROM ${constants_1.DB_TABLES.TRANSACTIONS} 
    WHERE userId = ? AND status = 'success' 
    ORDER BY timestamp DESC 
    LIMIT 1
  `).get(userId);
    let deletedTransactions = 0;
    let deletedPositions = 0;
    if (latestSuccessfulTx) {
        // Delete all transactions except the latest successful one
        const deleteTransactionsStmt = db.prepare(`
      DELETE FROM ${constants_1.DB_TABLES.TRANSACTIONS} 
      WHERE userId = ? AND txHash != ?
    `);
        const txResult = deleteTransactionsStmt.run(userId, latestSuccessfulTx.txHash);
        deletedTransactions = txResult.changes;
        // Delete all positions except those related to the latest successful transaction
        const deletePositionsStmt = db.prepare(`
      DELETE FROM ${constants_1.DB_TABLES.POSITIONS} 
      WHERE userId = ? AND txHash != ?
    `);
        const posResult = deletePositionsStmt.run(userId, latestSuccessfulTx.txHash);
        deletedPositions = posResult.changes;
    }
    else {
        // No successful transactions, delete all transactions and positions for this user
        const deleteAllTransactionsStmt = db.prepare(`
      DELETE FROM ${constants_1.DB_TABLES.TRANSACTIONS} WHERE userId = ?
    `);
        const txResult = deleteAllTransactionsStmt.run(userId);
        deletedTransactions = txResult.changes;
        const deleteAllPositionsStmt = db.prepare(`
      DELETE FROM ${constants_1.DB_TABLES.POSITIONS} WHERE userId = ?
    `);
        const posResult = deleteAllPositionsStmt.run(userId);
        deletedPositions = posResult.changes;
    }
    return { deletedTransactions, deletedPositions };
}
// Get database instance for direct access
function getDatabase() {
    return db;
}
// Protocol rates operations
function saveProtocolRate(protocol, apy, apyBase, apyReward, tvlUsd) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO protocol_rates (protocol, apy, apyBase, apyReward, tvlUsd, lastUpdated)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    stmt.run(protocol.toLowerCase(), apy, apyBase, apyReward, tvlUsd, Date.now());
}
function getProtocolRate(protocol) {
    const stmt = db.prepare(`
    SELECT * FROM protocol_rates WHERE protocol = ?
  `);
    return stmt.get(protocol.toLowerCase());
}
function getAllProtocolRates() {
    const stmt = db.prepare(`
    SELECT * FROM protocol_rates ORDER BY apy DESC
  `);
    return stmt.all();
}
// Index token operations
function getIndexTokensByCategory(category) {
    const stmt = db.prepare(`
    SELECT * FROM index_tokens 
    WHERE category = ? AND isActive = 1
    ORDER BY riskLevel ASC, name ASC
  `);
    return stmt.all(category);
}
function getIndexTokenById(tokenId) {
    const stmt = db.prepare(`
    SELECT * FROM index_tokens WHERE tokenId = ? AND isActive = 1
  `);
    return stmt.get(tokenId);
}
function getAllActiveIndexTokens() {
    const stmt = db.prepare(`
    SELECT * FROM index_tokens 
    WHERE isActive = 1
    ORDER BY category ASC, riskLevel ASC, name ASC
  `);
    return stmt.all();
}
function getIndexComposition(tokenId) {
    const stmt = db.prepare(`
    SELECT * FROM index_compositions 
    WHERE indexTokenId = ?
    ORDER BY weightPercentage DESC
  `);
    return stmt.all(tokenId);
}
// Index position operations
function saveIndexPosition(position) {
    const now = Date.now();
    const firstPurchase = position.firstPurchaseAt || now;
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO index_positions (
      id, userId, indexTokenId, tokensOwned, averageBuyPrice,
      totalInvested, currentValue, firstPurchaseAt, lastUpdatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(position.id, position.userId, position.indexTokenId, position.tokensOwned, position.averageBuyPrice, position.totalInvested, position.currentValue, firstPurchase, now);
}
function getIndexPositionsByUserId(userId) {
    const stmt = db.prepare(`
    SELECT ip.*, it.symbol, it.name, it.contractAddress, it.category, it.riskLevel
    FROM index_positions ip
    JOIN index_tokens it ON ip.indexTokenId = it.tokenId
    WHERE ip.userId = ? AND ip.tokensOwned > 0
    ORDER BY ip.currentValue DESC
  `);
    return stmt.all(userId);
}
function getIndexPositionByUserAndToken(userId, indexTokenId) {
    const stmt = db.prepare(`
    SELECT * FROM index_positions 
    WHERE userId = ? AND indexTokenId = ?
  `);
    return stmt.get(userId, indexTokenId);
}
function updateIndexPositionValue(positionId, tokensOwned, currentValue, averageBuyPrice) {
    const now = Date.now();
    if (averageBuyPrice !== undefined) {
        // Update with new average buy price (for additional purchases)
        const stmt = db.prepare(`
      UPDATE index_positions 
      SET tokensOwned = ?, currentValue = ?, averageBuyPrice = ?, lastUpdatedAt = ?
      WHERE id = ?
    `);
        stmt.run(tokensOwned, currentValue, averageBuyPrice, now, positionId);
    }
    else {
        // Update only current value (for price changes)
        const stmt = db.prepare(`
      UPDATE index_positions 
      SET tokensOwned = ?, currentValue = ?, lastUpdatedAt = ?
      WHERE id = ?
    `);
        stmt.run(tokensOwned, currentValue, now, positionId);
    }
}
function deleteIndexPosition(positionId) {
    const stmt = db.prepare(`
    DELETE FROM index_positions WHERE id = ?
  `);
    stmt.run(positionId);
}
// Index transaction operations
function saveIndexTransaction(txHash, userId, indexTokenId, operationType, usdcAmount, tokensAmount, pricePerToken, status, gasUsed) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO index_transactions (
      txHash, userId, indexTokenId, operationType, usdcAmount,
      tokensAmount, pricePerToken, gasUsed, status, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(txHash, userId, indexTokenId, operationType, usdcAmount, tokensAmount, pricePerToken, gasUsed, status, Date.now());
}
function getIndexTransactionsByUserId(userId, limit = 10) {
    const stmt = db.prepare(`
    SELECT it.*, idx.symbol, idx.name
    FROM index_transactions it
    JOIN index_tokens idx ON it.indexTokenId = idx.tokenId
    WHERE it.userId = ? 
    ORDER BY it.timestamp DESC 
    LIMIT ?
  `);
    return stmt.all(userId, limit);
}
function getIndexPortfolioStats(userId) {
    const stmt = db.prepare(`
    SELECT 
      SUM(currentValue) as totalValue,
      SUM(totalInvested) as totalInvested,
      SUM(currentValue - totalInvested) as totalPnL,
      COUNT(*) as positionCount
    FROM index_positions
    WHERE userId = ? AND tokensOwned > 0
  `);
    const result = stmt.get(userId);
    return {
        totalValue: result.totalValue || 0,
        totalInvested: result.totalInvested || 0,
        totalPnL: result.totalPnL || 0,
        positionCount: result.positionCount || 0
    };
}
// Run migration to add index tables
function runIndexTablesMigration() {
    try {
        // Read and execute the migration SQL
        const fs = require('fs');
        const path = require('path');
        const migrationPath = path.join(__dirname, '../../migrations/add-index-tables.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        db.exec(migrationSQL);
        console.log("✅ Index tables migration completed successfully");
    }
    catch (error) {
        console.error("❌ Error running index tables migration:", error);
        throw error;
    }
}
// Close database connection
function closeDatabase() {
    db.close();
}
