#!/usr/bin/env node

const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || "./defi-garden.sqlite";

try {
  console.log('🔧 Fixing wallet address in database...');
  
  const db = new Database(DB_PATH);
  
  // Update the wallet address from Smart Account to EOA address
  const result = db.prepare(`
    UPDATE wallets 
    SET address = ? 
    WHERE address = ?
  `).run(
    '0xec54B5b1Ae6a81154610B8197EB6910174531832', // Correct EOA address
    '0x9eD1D3001013b25798b125A770ea137327168f54'  // Wrong Smart Account address
  );
  
  console.log(`✅ Updated ${result.changes} wallet record(s)`);
  
  // Verify the change
  const wallet = db.prepare(`
    SELECT address, userId, type 
    FROM wallets 
    WHERE address = ?
  `).get('0xec54B5b1Ae6a81154610B8197EB6910174531832');
  
  if (wallet) {
    console.log(`✅ Verified: User ${wallet.userId} now has correct EOA address: ${wallet.address}`);
  } else {
    console.log('❌ Verification failed - wallet not found with new address');
  }
  
  db.close();
  console.log('🎉 Database fix completed');
  
} catch (error) {
  console.error('❌ Database fix failed:', error);
  process.exit(1);
}