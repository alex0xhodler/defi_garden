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

async function updateDeployedAccounts() {
  try {
    console.log('🔍 Checking existing Smart Accounts for deployment status...');
    
    const db = new Database(DB_PATH);
    
    // Get all coinbase-smart-wallet type wallets that are marked as not deployed
    const wallets = db.prepare(`
      SELECT address, userId 
      FROM wallets 
      WHERE type = 'coinbase-smart-wallet' AND isDeployed = 0
    `).all();
    
    console.log(`📊 Found ${wallets.length} Smart Accounts marked as not deployed`);
    
    if (wallets.length === 0) {
      console.log('✅ No accounts to check');
      db.close();
      return;
    }
    
    const updateStmt = db.prepare('UPDATE wallets SET isDeployed = 1 WHERE address = ?');
    let updatedCount = 0;
    
    for (const wallet of wallets) {
      console.log(`🔍 Checking ${wallet.address.slice(0, 10)}... (user: ${wallet.userId})`);
      
      const isDeployed = await checkAccountDeployment(wallet.address);
      
      if (isDeployed) {
        updateStmt.run(wallet.address);
        updatedCount++;
        console.log(`  ✅ Account is deployed - updated database`);
      } else {
        console.log(`  🚀 Account not deployed - keeping isDeployed=0`);
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n✅ Updated ${updatedCount} deployed accounts in database`);
    console.log(`📝 ${wallets.length - updatedCount} accounts remain as not deployed`);
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error updating deployed accounts:', error);
    process.exit(1);
  }
}

// Run the update
updateDeployedAccounts();