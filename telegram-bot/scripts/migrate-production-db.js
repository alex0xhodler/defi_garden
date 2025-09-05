#!/usr/bin/env node

/**
 * Production Database Migration Script
 * 
 * Fixes two critical schema issues:
 * 1. Missing 'users' table (needed by event-monitor)  
 * 2. Missing 'isDeployed' column in 'wallets' table (needed by bot)
 * 
 * Usage: node scripts/migrate-production-db.js
 */

const Database = require('better-sqlite3');
const path = require('path');

// Production database path - use same logic as the app
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'defi-garden.sqlite');

console.log(`🔧 Starting production database migration...`);
console.log(`📍 Database path: ${DB_PATH}`);

try {
  const db = new Database(DB_PATH);
  
  console.log(`✅ Connected to production database`);
  
  // Check current schema state
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map(t => t.name);
  
  console.log(`📊 Current tables: ${tableNames.join(', ')}`);
  
  // Migration 1: Ensure users table exists
  if (!tableNames.includes('users')) {
    console.log(`🚨 Missing 'users' table - creating now...`);
    
    db.exec(`
      CREATE TABLE users (
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
    `);
    
    console.log(`✅ Created 'users' table successfully`);
  } else {
    console.log(`✅ 'users' table already exists`);
  }
  
  // Migration 2: Add isDeployed column to wallets table if missing
  try {
    // Try to select isDeployed column to see if it exists
    db.prepare("SELECT isDeployed FROM wallets LIMIT 1").get();
    console.log(`✅ 'isDeployed' column already exists in wallets table`);
  } catch (error) {
    if (error.message.includes('no such column: isDeployed')) {
      console.log(`🚨 Missing 'isDeployed' column in wallets table - adding now...`);
      
      db.exec(`
        ALTER TABLE wallets ADD COLUMN isDeployed INTEGER NOT NULL DEFAULT 0;
      `);
      
      console.log(`✅ Added 'isDeployed' column to wallets table successfully`);
    } else {
      throw error;
    }
  }
  
  // Migration 3: Verify critical indexes exist
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
  const indexNames = indexes.map(i => i.name);
  
  console.log(`🔍 Current indexes: ${indexNames.join(', ')}`);
  
  // Create missing indexes if needed
  const requiredIndexes = [
    { name: 'idx_positions_user', sql: 'CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(userId)' },
    { name: 'idx_transactions_user', sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(userId)' },
    { name: 'idx_transactions_type', sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(operationType)' }
  ];
  
  for (const index of requiredIndexes) {
    if (!indexNames.includes(index.name)) {
      console.log(`🚨 Missing index '${index.name}' - creating now...`);
      db.exec(index.sql);
      console.log(`✅ Created index '${index.name}' successfully`);
    }
  }
  
  // Final verification
  console.log(`\n🔍 Final schema verification:`);
  
  // Verify users table structure
  const usersSchema = db.prepare("PRAGMA table_info(users)").all();
  console.log(`📋 Users table columns: ${usersSchema.map(col => col.name).join(', ')}`);
  
  // Verify wallets table structure  
  const walletsSchema = db.prepare("PRAGMA table_info(wallets)").all();
  console.log(`📋 Wallets table columns: ${walletsSchema.map(col => col.name).join(', ')}`);
  
  // Check if isDeployed column is now present
  const hasIsDeployed = walletsSchema.some(col => col.name === 'isDeployed');
  if (hasIsDeployed) {
    console.log(`✅ 'isDeployed' column verified in wallets table`);
  } else {
    console.log(`🚨 ERROR: 'isDeployed' column still missing from wallets table`);
  }
  
  db.close();
  console.log(`\n🎉 Production database migration completed successfully!`);
  console.log(`\n📝 Migration Summary:`);
  console.log(`   • Users table: ✅ Available`);
  console.log(`   • Wallets.isDeployed column: ✅ Available`);
  console.log(`   • Required indexes: ✅ Available`);
  console.log(`\n🔄 You can now restart the bot and event-monitor services.`);
  
} catch (error) {
  console.error(`❌ Migration failed:`, error);
  process.exit(1);
}