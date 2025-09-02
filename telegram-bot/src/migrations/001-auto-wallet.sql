-- Migration 001: Add auto-wallet support columns
-- Run this script to update existing database schema

-- Add new columns to users table
ALTER TABLE users ADD COLUMN onboardingCompleted INTEGER;
ALTER TABLE users ADD COLUMN lastBalanceCheck INTEGER;
ALTER TABLE users ADD COLUMN notificationSettings TEXT;

-- Add new column to wallets table
ALTER TABLE wallets ADD COLUMN autoCreated INTEGER NOT NULL DEFAULT 0;

-- Update existing wallets to be marked as NOT auto-created (they were manually created/imported)
UPDATE wallets SET autoCreated = 0 WHERE autoCreated IS NULL;

-- Create indexes for better performance on new monitoring queries
CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboardingCompleted);
CREATE INDEX IF NOT EXISTS idx_users_balance_check ON users(lastBalanceCheck);
CREATE INDEX IF NOT EXISTS idx_wallets_auto_created ON wallets(autoCreated);