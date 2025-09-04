const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || "./defi-garden.sqlite";

try {
  console.log('🔧 Starting migration: Add isDeployed column to wallets table...');
  
  const db = new Database(DB_PATH);
  
  // Check if column already exists
  const columnExists = db.prepare(`
    SELECT COUNT(*) as count 
    FROM pragma_table_info('wallets') 
    WHERE name = 'isDeployed'
  `).get();
  
  if (columnExists.count > 0) {
    console.log('✅ Column isDeployed already exists, skipping migration');
    db.close();
    process.exit(0);
  }
  
  // Add the isDeployed column
  db.prepare('ALTER TABLE wallets ADD COLUMN isDeployed INTEGER NOT NULL DEFAULT 0').run();
  
  console.log('✅ Successfully added isDeployed column to wallets table');
  
  // Check current wallets that might already be deployed
  const existingWallets = db.prepare('SELECT address, userId, createdAt FROM wallets').all();
  console.log(`📊 Found ${existingWallets.length} existing wallets`);
  
  if (existingWallets.length > 0) {
    console.log('\n💡 Note: Existing wallets have isDeployed=0 by default');
    console.log('   If any Smart Accounts are already deployed, they will be auto-detected');
    console.log('   on first transaction and updated to isDeployed=1');
    
    existingWallets.forEach((wallet, index) => {
      console.log(`   ${index + 1}. ${wallet.address.slice(0, 8)}... (user: ${wallet.userId})`);
    });
  }
  
  console.log('\n✅ Migration completed successfully');
  
  db.close();
  
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}