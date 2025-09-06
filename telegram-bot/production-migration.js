#!/usr/bin/env node

const Database = require('better-sqlite3');
const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

const DB_PATH = process.env.DB_PATH || "./defi-garden.sqlite";
const PUBLIC_RPC_URL = "https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz";

// Create public client for checking deployment
const publicClient = createPublicClient({
  chain: base,
  transport: http(PUBLIC_RPC_URL),
});

async function checkAccountDeployment(address) {
  try {
    const code = await publicClient.getCode({ address });
    return code !== undefined && code !== '0x';
  } catch (error) {
    console.error(`Error checking deployment for ${address}:`, error);
    return false;
  }
}

async function runProductionMigration() {
  console.log('🚀 Starting PRODUCTION migration: Smart Account deployment tracking...');
  console.log(`📍 Database: ${DB_PATH}`);
  
  try {
    const db = new Database(DB_PATH);
    
    // ===== STEP 1: Add isDeployed column =====
    console.log('\n📝 STEP 1: Adding isDeployed column...');
    
    // Check if column already exists
    const columnExists = db.prepare(`
      SELECT COUNT(*) as count 
      FROM pragma_table_info('wallets') 
      WHERE name = 'isDeployed'
    `).get();
    
    if (columnExists.count > 0) {
      console.log('✅ Column isDeployed already exists, skipping schema migration');
    } else {
      // Add the isDeployed column
      db.prepare('ALTER TABLE wallets ADD COLUMN isDeployed INTEGER NOT NULL DEFAULT 0').run();
      console.log('✅ Successfully added isDeployed column to wallets table');
    }
    
    // ===== STEP 2: Update existing deployed accounts =====
    console.log('\n🔍 STEP 2: Checking existing Smart Accounts...');
    
    // Get all coinbase-smart-wallet type wallets that are marked as not deployed
    const wallets = db.prepare(`
      SELECT address, userId 
      FROM wallets 
      WHERE type = 'coinbase-smart-wallet' AND isDeployed = 0
    `).all();
    
    console.log(`📊 Found ${wallets.length} Smart Accounts marked as not deployed`);
    
    if (wallets.length === 0) {
      console.log('✅ No accounts to check');
    } else {
      const updateStmt = db.prepare('UPDATE wallets SET isDeployed = 1 WHERE address = ?');
      let updatedCount = 0;
      
      for (const wallet of wallets) {
        console.log(`  🔍 Checking ${wallet.address.slice(0, 10)}... (user: ${wallet.userId})`);
        
        const isDeployed = await checkAccountDeployment(wallet.address);
        
        if (isDeployed) {
          updateStmt.run(wallet.address);
          updatedCount++;
          console.log(`    ✅ Account is deployed - updated database`);
        } else {
          console.log(`    🚀 Account not deployed - keeping isDeployed=0`);
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`\n  ✅ Updated ${updatedCount} deployed accounts in database`);
      console.log(`  📝 ${wallets.length - updatedCount} accounts remain as not deployed`);
    }
    
    // ===== STEP 3: Final verification =====
    console.log('\n🔎 STEP 3: Final verification...');
    
    const finalStatus = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN isDeployed = 1 THEN 1 ELSE 0 END) as deployed,
        SUM(CASE WHEN isDeployed = 0 THEN 1 ELSE 0 END) as not_deployed
      FROM wallets 
      WHERE type = 'coinbase-smart-wallet'
    `).get();
    
    console.log(`  📊 Smart Wallets Summary:`);
    console.log(`     Total: ${finalStatus.total}`);
    console.log(`     Deployed: ${finalStatus.deployed}`);
    console.log(`     Not Deployed: ${finalStatus.not_deployed}`);
    
    // Test a sample query to make sure everything works
    const sampleWallet = db.prepare(`
      SELECT address, userId, isDeployed 
      FROM wallets 
      WHERE type = 'coinbase-smart-wallet' 
      LIMIT 1
    `).get();
    
    if (sampleWallet) {
      console.log(`  🧪 Sample wallet: ${sampleWallet.address.slice(0, 10)}... (deployed: ${sampleWallet.isDeployed === 1})`);
    }
    
    db.close();
    
    console.log('\n🎉 PRODUCTION MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('✅ Database schema updated');
    console.log('✅ Existing accounts checked and updated');
    console.log('✅ Ready for code deployment');
    console.log('\n📋 Next steps:');
    console.log('   1. Deploy new code (npm run build && restart bot)');
    console.log('   2. Monitor logs for "already deployed (from database)" messages');
    console.log('   3. Test deposit + withdrawal flow');
    console.log('   4. Verify no AA10 errors in production');
    
  } catch (error) {
    console.error('\n❌ PRODUCTION MIGRATION FAILED:', error);
    console.error('\n🚨 ROLLBACK INSTRUCTIONS:');
    console.error('   1. Stop the bot immediately');
    console.error('   2. Restore database from backup');  
    console.error('   3. Revert to previous code version');
    console.error('   4. Restart bot');
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  runProductionMigration();
}

module.exports = { runProductionMigration };