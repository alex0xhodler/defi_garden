#!/usr/bin/env node

/**
 * Quick migration runner script
 * Run this with: node migrate-wallets.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log("🚀 Starting wallet address migration...\n");

// Run the TypeScript migration script using ts-node
const scriptPath = path.join(__dirname, 'src', 'scripts', 'migrate-wallet-addresses.ts');

const tsNode = spawn('npx', ['ts-node', scriptPath], {
  stdio: 'inherit',
  cwd: __dirname
});

tsNode.on('close', (code) => {
  if (code === 0) {
    console.log("\n✅ Migration completed successfully!");
  } else {
    console.log(`\n❌ Migration failed with exit code ${code}`);
    process.exit(code);
  }
});

tsNode.on('error', (error) => {
  console.error("❌ Failed to run migration script:", error);
  process.exit(1);
});