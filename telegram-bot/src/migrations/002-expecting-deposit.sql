-- Migration 002: Add expectingDepositUntil field for efficient deposit monitoring
-- This field tracks when to stop monitoring a wallet for deposits

-- Add the new field to users table
ALTER TABLE users ADD COLUMN expectingDepositUntil INTEGER;

-- Create index for efficient querying of wallets expecting deposits
CREATE INDEX IF NOT EXISTS idx_users_expecting_deposit ON users(expectingDepositUntil);

-- Create composite index for monitoring query optimization
CREATE INDEX IF NOT EXISTS idx_users_monitoring ON users(onboardingCompleted, lastBalanceCheck, expectingDepositUntil);