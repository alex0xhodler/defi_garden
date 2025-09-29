#!/usr/bin/env ts-node
"use strict";
/**
 * Migration script to fix wallet addresses for existing Coinbase Smart Wallet users
 *
 * This script:
 * 1. Finds all users with coinbase-smart-wallet type
 * 2. Recreates their smart wallets with deterministic nonce
 * 3. Updates the database with the correct smart wallet addresses
 * 4. Logs all changes for verification
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = runMigration;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const account_abstraction_1 = require("viem/account-abstraction");
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const encryption_1 = require("../lib/encryption");
const constants_1 = require("../utils/constants");
// Create public client for Base mainnet using Coinbase developer API
const publicClient = (0, viem_1.createPublicClient)({
    chain: chains_1.base,
    transport: (0, viem_1.http)("https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz"),
});
const db = new better_sqlite3_1.default(constants_1.DB_PATH);
/**
 * Migrate a single wallet
 */
async function migrateWallet(wallet) {
    try {
        // Decrypt private key
        const privateKey = (0, encryption_1.decrypt)(wallet.encryptedPrivateKey);
        const owner = (0, accounts_1.privateKeyToAccount)(privateKey);
        // Recreate smart account with deterministic nonce
        const smartAccount = await (0, account_abstraction_1.toCoinbaseSmartAccount)({
            client: publicClient,
            owners: [owner],
            nonce: 0n, // Use same deterministic nonce as new creation logic
            version: '1.1'
        });
        const newAddress = smartAccount.address;
        const oldAddress = wallet.address;
        const changed = newAddress.toLowerCase() !== oldAddress.toLowerCase();
        if (changed) {
            console.log(`👤 User ${wallet.userId}:`);
            console.log(`   Old: ${oldAddress}`);
            console.log(`   New: ${newAddress}`);
            // Update database with correct address
            const stmt = db.prepare(`
        UPDATE wallets 
        SET address = ? 
        WHERE userId = ? AND type = 'coinbase-smart-wallet'
      `);
            stmt.run(newAddress, wallet.userId);
            console.log(`   ✅ Updated in database`);
        }
        else {
            console.log(`✅ User ${wallet.userId}: Address already correct (${newAddress})`);
        }
        return {
            userId: wallet.userId,
            oldAddress,
            newAddress,
            changed
        };
    }
    catch (error) {
        console.error(`❌ Error migrating wallet for user ${wallet.userId}:`, error);
        throw error;
    }
}
/**
 * Main migration function
 */
async function runMigration() {
    console.log("🚀 Starting Coinbase Smart Wallet address migration...\n");
    try {
        // Get all coinbase-smart-wallet users
        const stmt = db.prepare(`
      SELECT * FROM wallets 
      WHERE type = 'coinbase-smart-wallet'
      ORDER BY createdAt ASC
    `);
        const wallets = stmt.all();
        if (wallets.length === 0) {
            console.log("ℹ️  No Coinbase Smart Wallets found to migrate");
            return;
        }
        console.log(`📊 Found ${wallets.length} Coinbase Smart Wallet(s) to check\n`);
        const results = {
            total: wallets.length,
            changed: 0,
            unchanged: 0,
            errors: 0
        };
        // Process each wallet
        for (const wallet of wallets) {
            try {
                const result = await migrateWallet(wallet);
                if (result.changed) {
                    results.changed++;
                }
                else {
                    results.unchanged++;
                }
                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            catch (error) {
                results.errors++;
                console.error(`❌ Failed to migrate user ${wallet.userId}`);
            }
            console.log(); // Add spacing between users
        }
        // Summary
        console.log("📈 Migration Summary:");
        console.log(`   Total wallets: ${results.total}`);
        console.log(`   Addresses updated: ${results.changed}`);
        console.log(`   Already correct: ${results.unchanged}`);
        console.log(`   Errors: ${results.errors}`);
        if (results.changed > 0) {
            console.log(`\n✅ Migration completed! ${results.changed} address(es) were corrected.`);
            console.log("🔄 Restart the bot to ensure event monitor picks up the new addresses.");
        }
        else {
            console.log("\n✅ Migration completed! All addresses were already correct.");
        }
    }
    catch (error) {
        console.error("❌ Migration failed:", error);
        throw error;
    }
    finally {
        db.close();
    }
}
// Run migration if called directly
if (require.main === module) {
    runMigration()
        .then(() => {
        console.log("\n🎉 Migration script finished successfully");
        process.exit(0);
    })
        .catch((error) => {
        console.error("\n💥 Migration script failed:", error);
        process.exit(1);
    });
}
