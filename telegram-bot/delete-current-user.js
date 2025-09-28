const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || "./defi-garden.sqlite";
const targetWallet = '0xc8465a06cF21cB616bF152347add102C4E0D1583';

try {
  // Connect to the database
  const db = new Database(DB_PATH);
  
  console.log(`🗑️ Starting deletion process for wallet: ${targetWallet}`);
  
  // Get wallet and user info first
  const wallets = db.prepare('SELECT * FROM wallets WHERE address = ?').all(targetWallet);
  console.log(`Found ${wallets.length} wallets with this address`);
  
  if (wallets.length === 0) {
    console.log('❌ No wallets found with this address');
    db.close();
    process.exit(0);
  }
  
  const userIds = wallets.map(w => w.userId);
  const users = db.prepare(`SELECT * FROM users WHERE userId IN (${userIds.map(() => '?').join(',')})`).all(...userIds);
  
  console.log(`Found ${users.length} users associated with this wallet`);
  
  for (const wallet of wallets) {
    const user = users.find(u => u.userId === wallet.userId);
    console.log(`\nWallet details:
    - address: ${wallet.address}
    - userId: ${wallet.userId}
    - type: ${wallet.type}
    - user: ${user ? user.firstName || user.username : 'Unknown'}
    - createdAt: ${new Date(wallet.createdAt).toISOString()}`);
  }
  
  console.log('\n🗑️ Deleting user data...');
  
  // Temporarily disable foreign key constraints
  db.prepare('PRAGMA foreign_keys = OFF').run();
  
  // Delete from all tables
  const deleteQueries = [
    { table: 'positions', query: 'DELETE FROM positions WHERE userId IN (' + userIds.map(() => '?').join(',') + ')' },
    { table: 'transactions', query: 'DELETE FROM transactions WHERE userId IN (' + userIds.map(() => '?').join(',') + ')' },
    { table: 'settings', query: 'DELETE FROM settings WHERE userId IN (' + userIds.map(() => '?').join(',') + ')' },
    { table: 'wallets', query: 'DELETE FROM wallets WHERE userId IN (' + userIds.map(() => '?').join(',') + ')' },
    { table: 'users', query: 'DELETE FROM users WHERE userId IN (' + userIds.map(() => '?').join(',') + ')' }
  ];
  
  let totalDeleted = 0;
  
  for (const { table, query } of deleteQueries) {
    const result = db.prepare(query).run(...userIds);
    console.log(`- ${table}: ${result.changes} rows deleted`);
    totalDeleted += result.changes;
  }
  
  // Re-enable foreign key constraints
  db.prepare('PRAGMA foreign_keys = ON').run();
  
  console.log(`\n✅ Successfully deleted ${totalDeleted} total rows for wallet ${targetWallet}`);
  console.log('🧪 Database is now clean for testing fresh user onboarding');
  
  // Verify deletion
  const remainingWallets = db.prepare('SELECT COUNT(*) as count FROM wallets WHERE address = ?').get(targetWallet);
  const remainingUsers = db.prepare(`SELECT COUNT(*) as count FROM users WHERE userId IN (${userIds.map(() => '?').join(',')})`).get(...userIds);
  console.log(`Verification: ${remainingWallets.count} wallets and ${remainingUsers.count} users remaining`);
  
  db.close();
  
} catch (error) {
  console.error('❌ Error during deletion:', error);
  process.exit(1);
}