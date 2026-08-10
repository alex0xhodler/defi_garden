/**
 * test_gsc_client.js — Unit test for Google Search Console API client
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadServiceAccountKey } = require('./scripts/gsc_client');

console.log('Testing gsc_client.js...');

// Test 1: loadServiceAccountKey returns null or valid object gracefully
const keyResult = loadServiceAccountKey();
if (keyResult) {
  assert(keyResult.key.client_email, 'Key must have client_email');
  assert(keyResult.key.private_key, 'Key must have private_key');
  console.log('✓ Found GSC Service Account key at:', keyResult.path);
} else {
  console.log('✓ Handled missing GSC key gracefully (NEEDS_CREDENTIALS state).');
}

// Test 2: Ensure gsc_client script can execute in dry-run mode
const { execSync } = require('child_process');
const output = execSync('node scripts/gsc_client.js audit', { encoding: 'utf8' });
const parsed = JSON.parse(output);

assert(parsed.status === 'NEEDS_CREDENTIALS' || parsed.status === 'CONNECTED', 'Audit must return valid status');
if (parsed.status === 'NEEDS_CREDENTIALS') {
  assert(Array.isArray(parsed.setup_instructions), 'Must output setup instructions');
}

console.log('All gsc_client.js tests PASS!');
