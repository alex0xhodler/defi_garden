#!/usr/bin/env node

const Database = require('better-sqlite3');
const CryptoJS = require('crypto-js');
const { privateKeyToAccount } = require('viem/accounts');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const DB_PATH = process.env.DB_PATH || './defi-garden.sqlite';
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.error('❌ WALLET_ENCRYPTION_KEY not found in environment');
  process.exit(1);
}

function decrypt(encryptedText) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    throw new Error('Decryption failed: ' + error.message);
  }
}

async function verifyAllKeys() {
  try {
    console.log('🔍 Searching for 0x3584cB73Cb524cDA9e89c72c5f12fb2c6bd1FE42 in encrypted private keys...\n');
    
    const db = new Database(DB_PATH);
    
    const wallets = db.prepare(`
      SELECT userId, address, encryptedPrivateKey, type, createdAt 
      FROM wallets 
      ORDER BY createdAt DESC
    `).all();

    console.log(`Found ${wallets.length} wallets in database:`);
    
    for (const wallet of wallets) {
      try {
        console.log(`\n👤 User ${wallet.userId} (${wallet.type}):`);
        console.log(`   Stored Address: ${wallet.address}`);
        console.log(`   Created: ${new Date(wallet.createdAt).toISOString()}`);
        
        // Decrypt private key
        const privateKey = decrypt(wallet.encryptedPrivateKey);
        
        // Derive address from private key
        const cleanPrivateKey = privateKey.replace(/^0x/, '');
        const account = privateKeyToAccount(`0x${cleanPrivateKey}`);
        const derivedAddress = account.address;
        
        console.log(`   Derived Address: ${derivedAddress}`);
        
        // Check if addresses match
        const addressMatch = wallet.address.toLowerCase() === derivedAddress.toLowerCase();
        console.log(`   Address Match: ${addressMatch ? '✅' : '❌'}`);
        
        // Check if this is our target wallet
        const isTargetWallet = derivedAddress.toLowerCase() === '0x3584cB73Cb524cDA9e89c72c5f12fb2c6bd1FE42'.toLowerCase();
        if (isTargetWallet) {
          console.log('   🎯 TARGET WALLET FOUND!');
          console.log(`   Private Key: ${privateKey}`);
        }
        
      } catch (error) {
        console.log(`   ❌ Error processing wallet: ${error.message}`);
      }
    }
    
    db.close();
    console.log('\n✅ Verification complete');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyAllKeys();