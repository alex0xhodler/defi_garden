import Database from "better-sqlite3";
import { WalletData } from "../types/wallet";
import { UserSettings, Position } from "../types/config";
import { DB_PATH, DB_TABLES } from "../utils/constants";

const db = new Database(DB_PATH);

// Define types for database rows
type UserRow = {
  userId: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: number;
};

type WalletRow = {
  address: string;
  userId: string;
  encryptedPrivateKey: string;
  type: string;
  createdAt: number;
};

type SettingsRow = {
  userId: string;
  riskLevel: number;
  slippage: number;
  autoCompound: number; // SQLite doesn't have boolean, use 0/1
  minApy: number;
};

type PositionRow = {
  id: string;
  userId: string;
  poolId: string;
  protocol: string;
  chain: string;
  tokenSymbol: string;
  amountInvested: number;
  currentValue: number;
  entryApy: number;
  currentApy: number;
  yieldEarned: number;
  txHash: string;
  createdAt: number;
  lastUpdated: number;
};

type TransactionRow = {
  txHash: string;
  userId: string;
  walletAddress: string;
  operationType: string; // 'zap', 'harvest', 'compound', 'withdraw'
  poolId: string | null;
  protocol: string | null;
  tokenSymbol: string;
  amount: string;
  yieldEarned: string | null;
  status: string;
  gasUsed: string | null;
  timestamp: number;
};

// Initialize tables
export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${DB_TABLES.USERS} (
      userId TEXT PRIMARY KEY,
      telegramId TEXT NOT NULL,
      username TEXT,
      firstName TEXT,
      lastName TEXT,
      createdAt INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS ${DB_TABLES.WALLETS} (
      address TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      encryptedPrivateKey TEXT NOT NULL,
      type TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES ${DB_TABLES.USERS}(userId)
    );
    
    CREATE TABLE IF NOT EXISTS ${DB_TABLES.SETTINGS} (
      userId TEXT PRIMARY KEY,
      riskLevel INTEGER NOT NULL DEFAULT 3,
      slippage REAL NOT NULL DEFAULT 1.0,
      autoCompound INTEGER NOT NULL DEFAULT 1,
      minApy REAL NOT NULL DEFAULT 5.0,
      FOREIGN KEY (userId) REFERENCES ${DB_TABLES.USERS}(userId)
    );
    
    CREATE TABLE IF NOT EXISTS ${DB_TABLES.POSITIONS} (
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
      FOREIGN KEY (userId) REFERENCES ${DB_TABLES.USERS}(userId)
    );
    
    CREATE TABLE IF NOT EXISTS ${DB_TABLES.TRANSACTIONS} (
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
      FOREIGN KEY (userId) REFERENCES ${DB_TABLES.USERS}(userId),
      FOREIGN KEY (walletAddress) REFERENCES ${DB_TABLES.WALLETS}(address)
    );
    
    CREATE INDEX IF NOT EXISTS idx_positions_user ON ${DB_TABLES.POSITIONS}(userId);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON ${DB_TABLES.TRANSACTIONS}(userId);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON ${DB_TABLES.TRANSACTIONS}(operationType);
  `);
}

// User operations
export function createUser(
  userId: string,
  telegramId: string,
  username?: string,
  firstName?: string,
  lastName?: string
): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO ${DB_TABLES.USERS} (userId, telegramId, username, firstName, lastName, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(userId, telegramId, username, firstName, lastName, Date.now());
}

export function getUserByTelegramId(telegramId: string): UserRow | undefined {
  const stmt = db.prepare(`
    SELECT * FROM ${DB_TABLES.USERS} WHERE telegramId = ?
  `);

  return stmt.get(telegramId) as UserRow | undefined;
}

// Wallet operations
export function saveWallet(walletData: WalletData, userId: string): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${DB_TABLES.WALLETS} (address, userId, encryptedPrivateKey, type, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    walletData.address,
    userId,
    walletData.encryptedPrivateKey,
    walletData.type,
    walletData.createdAt
  );
}

export function getWalletByUserId(userId: string): WalletData | null {
  const stmt = db.prepare(`
    SELECT * FROM ${DB_TABLES.WALLETS} WHERE userId = ?
  `);

  const result = stmt.get(userId) as WalletRow | undefined;
  return result ? (result as unknown as WalletData) : null;
}

export function getWalletByAddress(address: string): WalletData | null {
  const stmt = db.prepare(`
    SELECT * FROM ${DB_TABLES.WALLETS} WHERE address = ?
  `);

  const result = stmt.get(address) as WalletRow | undefined;
  return result ? (result as unknown as WalletData) : null;
}

export function deleteWallet(address: string): void {
  const stmt = db.prepare(`
    DELETE FROM ${DB_TABLES.WALLETS} WHERE address = ?
  `);

  stmt.run(address);
}

// Settings operations
export function saveUserSettings(
  userId: string,
  settings: Omit<UserSettings, "userId">
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${DB_TABLES.SETTINGS} (userId, riskLevel, slippage, autoCompound, minApy)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    userId,
    settings.riskLevel,
    settings.slippage,
    settings.autoCompound ? 1 : 0,
    settings.minApy
  );
}

export function getUserSettings(userId: string): UserSettings | null {
  const stmt = db.prepare(`
    SELECT * FROM ${DB_TABLES.SETTINGS} WHERE userId = ?
  `);

  const result = stmt.get(userId) as SettingsRow | undefined;

  if (!result) return null;

  return {
    userId,
    riskLevel: result.riskLevel,
    slippage: result.slippage,
    autoCompound: result.autoCompound === 1,
    minApy: result.minApy,
  };
}

// Position operations
export function savePosition(position: Omit<Position, 'lastUpdated'>): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${DB_TABLES.POSITIONS} (
      id, userId, poolId, protocol, chain, tokenSymbol,
      amountInvested, currentValue, entryApy, currentApy, yieldEarned,
      txHash, createdAt, lastUpdated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  stmt.run(
    position.id,
    position.userId,
    position.poolId,
    position.protocol,
    position.chain,
    position.tokenSymbol,
    position.amountInvested,
    position.currentValue,
    position.entryApy,
    position.currentApy,
    position.yieldEarned,
    position.txHash,
    position.createdAt instanceof Date ? position.createdAt.getTime() : now,
    now
  );
}

export function getPositionsByUserId(userId: string): Position[] {
  const stmt = db.prepare(`
    SELECT * FROM ${DB_TABLES.POSITIONS} 
    WHERE userId = ? 
    ORDER BY createdAt DESC
  `);

  const rows = stmt.all(userId) as PositionRow[];
  return rows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt),
    lastUpdated: new Date(row.lastUpdated)
  }));
}

export function updatePositionValue(
  positionId: string, 
  currentValue: number, 
  currentApy: number, 
  yieldEarned: number
): void {
  const stmt = db.prepare(`
    UPDATE ${DB_TABLES.POSITIONS} 
    SET currentValue = ?, currentApy = ?, yieldEarned = ?, lastUpdated = ?
    WHERE id = ?
  `);

  stmt.run(currentValue, currentApy, yieldEarned, Date.now(), positionId);
}

export function deletePosition(positionId: string): void {
  const stmt = db.prepare(`
    DELETE FROM ${DB_TABLES.POSITIONS} WHERE id = ?
  `);

  stmt.run(positionId);
}

// Transaction operations
export function saveTransaction(
  txHash: string,
  userId: string,
  walletAddress: string,
  operationType: string,
  tokenSymbol: string,
  amount: string,
  status: string,
  poolId?: string,
  protocol?: string,
  yieldEarned?: string,
  gasUsed?: string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${DB_TABLES.TRANSACTIONS} (
      txHash, userId, walletAddress, operationType, poolId, protocol,
      tokenSymbol, amount, yieldEarned, status, gasUsed, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    txHash,
    userId,
    walletAddress,
    operationType,
    poolId,
    protocol,
    tokenSymbol,
    amount,
    yieldEarned,
    status,
    gasUsed,
    Date.now()
  );
}

export function getTransactionsByUserId(
  userId: string,
  limit = 10
): TransactionRow[] {
  const stmt = db.prepare(`
    SELECT * FROM ${DB_TABLES.TRANSACTIONS} 
    WHERE userId = ? 
    ORDER BY timestamp DESC 
    LIMIT ?
  `);

  return stmt.all(userId, limit) as TransactionRow[];
}

export function getPortfolioStats(userId: string): {
  totalValue: number;
  totalInvested: number;
  totalYield: number;
  positionCount: number;
} {
  const stmt = db.prepare(`
    SELECT 
      SUM(currentValue) as totalValue,
      SUM(amountInvested) as totalInvested, 
      SUM(yieldEarned) as totalYield,
      COUNT(*) as positionCount
    FROM ${DB_TABLES.POSITIONS}
    WHERE userId = ?
  `);

  const result = stmt.get(userId) as any;
  
  return {
    totalValue: result.totalValue || 0,
    totalInvested: result.totalInvested || 0,
    totalYield: result.totalYield || 0,
    positionCount: result.positionCount || 0
  };
}

// Clean up unverified transactions and positions
export function cleanupUnverifiedTransactions(userId: string): {
  deletedTransactions: number;
  deletedPositions: number;
} {
  // Keep only the latest successful transaction for the user
  const latestSuccessfulTx = db.prepare(`
    SELECT txHash FROM ${DB_TABLES.TRANSACTIONS} 
    WHERE userId = ? AND status = 'success' 
    ORDER BY timestamp DESC 
    LIMIT 1
  `).get(userId) as { txHash: string } | undefined;

  let deletedTransactions = 0;
  let deletedPositions = 0;

  if (latestSuccessfulTx) {
    // Delete all transactions except the latest successful one
    const deleteTransactionsStmt = db.prepare(`
      DELETE FROM ${DB_TABLES.TRANSACTIONS} 
      WHERE userId = ? AND txHash != ?
    `);
    const txResult = deleteTransactionsStmt.run(userId, latestSuccessfulTx.txHash);
    deletedTransactions = txResult.changes;

    // Delete all positions except those related to the latest successful transaction
    const deletePositionsStmt = db.prepare(`
      DELETE FROM ${DB_TABLES.POSITIONS} 
      WHERE userId = ? AND txHash != ?
    `);
    const posResult = deletePositionsStmt.run(userId, latestSuccessfulTx.txHash);
    deletedPositions = posResult.changes;
  } else {
    // No successful transactions, delete all transactions and positions for this user
    const deleteAllTransactionsStmt = db.prepare(`
      DELETE FROM ${DB_TABLES.TRANSACTIONS} WHERE userId = ?
    `);
    const txResult = deleteAllTransactionsStmt.run(userId);
    deletedTransactions = txResult.changes;

    const deleteAllPositionsStmt = db.prepare(`
      DELETE FROM ${DB_TABLES.POSITIONS} WHERE userId = ?
    `);
    const posResult = deleteAllPositionsStmt.run(userId);
    deletedPositions = posResult.changes;
  }

  return { deletedTransactions, deletedPositions };
}

// Close database connection
export function closeDatabase(): void {
  db.close();
}