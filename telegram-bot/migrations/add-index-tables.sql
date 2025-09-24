-- Migration: Add Index Tokens Support
-- Created: 2024-09-24
-- Description: Add database tables to support Index token investments alongside yield farming

-- Index tokens metadata table
CREATE TABLE IF NOT EXISTS index_tokens (
    tokenId TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('blue_chip', 'defi', 'emerging', 'sector')),
    contractAddress TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'base',
    description TEXT,
    riskLevel INTEGER NOT NULL CHECK (riskLevel >= 1 AND riskLevel <= 10),
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt INTEGER NOT NULL,
    lastUpdated INTEGER NOT NULL
);

-- Index compositions (what tokens are in each index)
CREATE TABLE IF NOT EXISTS index_compositions (
    id TEXT PRIMARY KEY,
    indexTokenId TEXT NOT NULL,
    underlyingToken TEXT NOT NULL,
    underlyingSymbol TEXT NOT NULL,
    weightPercentage REAL NOT NULL CHECK (weightPercentage > 0 AND weightPercentage <= 100),
    lastUpdated INTEGER NOT NULL,
    FOREIGN KEY (indexTokenId) REFERENCES index_tokens(tokenId) ON DELETE CASCADE
);

-- Index positions (user holdings)
CREATE TABLE IF NOT EXISTS index_positions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    indexTokenId TEXT NOT NULL,
    tokensOwned REAL NOT NULL CHECK (tokensOwned >= 0),
    averageBuyPrice REAL NOT NULL CHECK (averageBuyPrice > 0), -- in USDC per token
    totalInvested REAL NOT NULL CHECK (totalInvested > 0), -- Total USDC spent
    currentValue REAL NOT NULL CHECK (currentValue >= 0), -- Current USD value
    firstPurchaseAt INTEGER NOT NULL,
    lastUpdatedAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE,
    FOREIGN KEY (indexTokenId) REFERENCES index_tokens(tokenId) ON DELETE CASCADE
);

-- Index transactions
CREATE TABLE IF NOT EXISTS index_transactions (
    txHash TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    indexTokenId TEXT NOT NULL,
    operationType TEXT NOT NULL CHECK (operationType IN ('buy', 'sell')),
    usdcAmount REAL NOT NULL CHECK (usdcAmount > 0), -- Amount in USDC
    tokensAmount REAL NOT NULL CHECK (tokensAmount > 0), -- Index tokens received/sold
    pricePerToken REAL NOT NULL CHECK (pricePerToken > 0), -- USDC per index token at time of transaction
    gasUsed TEXT,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE,
    FOREIGN KEY (indexTokenId) REFERENCES index_tokens(tokenId) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_index_positions_user ON index_positions(userId);
CREATE INDEX IF NOT EXISTS idx_index_positions_token ON index_positions(indexTokenId);
CREATE INDEX IF NOT EXISTS idx_index_transactions_user ON index_transactions(userId);
CREATE INDEX IF NOT EXISTS idx_index_transactions_token ON index_transactions(indexTokenId);
CREATE INDEX IF NOT EXISTS idx_index_transactions_type ON index_transactions(operationType);
CREATE INDEX IF NOT EXISTS idx_index_compositions_token ON index_compositions(indexTokenId);

-- Insert sample index tokens for testing/initial deployment
-- Blue Chip Index
INSERT OR IGNORE INTO index_tokens (
    tokenId, symbol, name, category, contractAddress, chain, description, riskLevel, createdAt, lastUpdated
) VALUES (
    'blue_chip_01', 
    'LCAP', 
    'Large Cap Index', 
    'blue_chip', 
    '0x4da9a0f397db1397902070f93a4d6ddbc0e0e6e8', 
    'base',
    'Diversified basket of top crypto assets including BTC, ETH, and major altcoins',
    3,
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
);

-- Sample compositions for LCAP (approximate weights)
INSERT OR IGNORE INTO index_compositions (id, indexTokenId, underlyingToken, underlyingSymbol, weightPercentage, lastUpdated) VALUES
('comp_lcap_01', 'blue_chip_01', '0x4200000000000000000000000000000000000006', 'WETH', 35.0, strftime('%s', 'now') * 1000),
('comp_lcap_02', 'blue_chip_01', '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', 'cbBTC', 30.0, strftime('%s', 'now') * 1000),
('comp_lcap_03', 'blue_chip_01', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 'USDC', 15.0, strftime('%s', 'now') * 1000),
('comp_lcap_04', 'blue_chip_01', '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', 'DAI', 10.0, strftime('%s', 'now') * 1000),
('comp_lcap_05', 'blue_chip_01', '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', 'cbETH', 10.0, strftime('%s', 'now') * 1000);

-- DeFi Index placeholder (for future implementation)
INSERT OR IGNORE INTO index_tokens (
    tokenId, symbol, name, category, contractAddress, chain, description, riskLevel, createdAt, lastUpdated
) VALUES (
    'defi_01', 
    'DEFI', 
    'DeFi Protocol Index', 
    'defi', 
    '0x0000000000000000000000000000000000000001', 
    'base',
    'Basket of leading DeFi protocol tokens (AAVE, UNI, COMP, etc.)',
    5,
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
);

-- Emerging Index placeholder (for future implementation)  
INSERT OR IGNORE INTO index_tokens (
    tokenId, symbol, name, category, contractAddress, chain, description, riskLevel, createdAt, lastUpdated
) VALUES (
    'emerging_01', 
    'EMRG', 
    'Emerging Protocols Index', 
    'emerging', 
    '0x0000000000000000000000000000000000000002', 
    'base',
    'High-growth potential tokens from new protocols and L2s',
    8,
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
);

-- Sector Rotation placeholder (for future implementation)
INSERT OR IGNORE INTO index_tokens (
    tokenId, symbol, name, category, contractAddress, chain, description, riskLevel, createdAt, lastUpdated
) VALUES (
    'sector_01', 
    'AI', 
    'AI & Machine Learning Index', 
    'sector', 
    '0x0000000000000000000000000000000000000003', 
    'base',
    'Tokens from AI, machine learning, and data analytics projects',
    6,
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
);

-- Add migration tracking (optional - for keeping track of applied migrations)
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

INSERT OR IGNORE INTO migrations (name) VALUES ('add-index-tables');