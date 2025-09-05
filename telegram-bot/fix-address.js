#!/usr/bin/env node

// Simple script to fix the monitoring address in production database
const Database = require('better-sqlite3');

const db = new Database('defi-garden.sqlite');

console.log('📋 Current wallet addresses:');
const current = db.prepare('SELECT userId, address FROM wallets').all();
current.forEach(wallet => {
  console.log(`User ${wallet.userId}: ${wallet.address}`);
});

// Update the problematic address
console.log('\n🔧 Fixing address for user 6499212858...');
console.log('From: 0x9eD1D3001013b25798b125A770ea137327168f54');
console.log('To:   0xec54B5b1Ae6a81154610B8197EB6910174531832');

const result = db.prepare(`
  UPDATE wallets 
  SET address = '0xec54B5b1Ae6a81154610B8197EB6910174531832' 
  WHERE userId = '6499212858'
`).run();

console.log(`✅ Updated ${result.changes} records`);

console.log('\n📋 Updated wallet addresses:');
const updated = db.prepare('SELECT userId, address FROM wallets').all();
updated.forEach(wallet => {
  console.log(`User ${wallet.userId}: ${wallet.address}`);
});

db.close();
console.log('\n🎯 Address fix complete! Event monitor will now watch correct address.');