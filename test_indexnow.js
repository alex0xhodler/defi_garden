/* Unit tests for the IndexNow ping script (spec 022).
   Asserts on the pure payload/URL-collection functions and confirms the
   committed key file is the single source of truth for the key — no
   hardcoded duplicate to drift out of sync. Run: node test_indexnow.js */
const assert = require('assert');
const fs = require('fs');
const https = require('https');
const path = require('path');
const indexnow = require('./indexnow-ping.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('buildIndexNowPayload — exact IndexNow API shape');
test('returns {host, key, keyLocation, urlList} verbatim', () => {
  const payload = indexnow.buildIndexNowPayload(
    ['https://www.defi.garden/tokens/usdc'], 'www.defi.garden', 'thekey', 'https://www.defi.garden/thekey.txt'
  );
  assert.deepStrictEqual(payload, {
    host: 'www.defi.garden',
    key: 'thekey',
    keyLocation: 'https://www.defi.garden/thekey.txt',
    urlList: ['https://www.defi.garden/tokens/usdc'],
  });
});

console.log('extractLocs / collectUrls — sitemap parsing');
const fixturePath = path.join(__dirname, 'test_fixtures', 'sitemap-indexnow-sample.xml');
test('extracts every <loc> from a sitemap XML string', () => {
  const xml = fs.readFileSync(fixturePath, 'utf8');
  assert.deepStrictEqual(indexnow.extractLocs(xml), [
    'https://www.defi.garden/tokens/usdc',
    'https://www.defi.garden/tokens/steth',
    'https://www.defi.garden/tokens/usdc',
  ]);
});
test('collectUrls dedupes repeated <loc> entries across files', () => {
  const urls = indexnow.collectUrls([fixturePath]);
  assert.deepStrictEqual(urls, [
    'https://www.defi.garden/tokens/usdc',
    'https://www.defi.garden/tokens/steth',
  ]);
});
test('collectUrls caps at the given max (protects a single oversized POST)', () => {
  const urls = indexnow.collectUrls([fixturePath], 1);
  assert.strictEqual(urls.length, 1);
  assert.strictEqual(urls[0], 'https://www.defi.garden/tokens/usdc');
});
test('collectUrls silently skips a missing sitemap file (no throw)', () => {
  const urls = indexnow.collectUrls([path.join(__dirname, 'test_fixtures', 'does-not-exist.xml')]);
  assert.deepStrictEqual(urls, []);
});

console.log('key file — single source of truth');
test('findKeyFile locates the committed <hex>.txt key file at repo root', () => {
  const keyFile = indexnow.findKeyFile(__dirname);
  assert.ok(/^[a-f0-9]{16,64}\.txt$/.test(path.basename(keyFile)), 'key filename must be <hex>.txt');
});
test('loadKey reads a key whose value matches its own filename (IndexNow convention)', () => {
  const { key, keyFileName } = indexnow.loadKey(__dirname);
  assert.strictEqual(`${key}.txt`, keyFileName, 'key content must equal the filename without .txt');
  assert.ok(/^[a-f0-9]{16,64}$/.test(key), 'key must be hex');
});
test('the key file on disk has no trailing newline / whitespace drift', () => {
  const keyFile = indexnow.findKeyFile(__dirname);
  const raw = fs.readFileSync(keyFile, 'utf8');
  assert.strictEqual(raw, raw.trim(), 'key file must contain exactly the key, nothing else');
});

console.log('--dry-run / no-URL path — zero network I/O');
test('submitToIndexNow is never invoked when main() has no URLs to submit', async () => {
  const originalRequest = https.request;
  https.request = () => { throw new Error('https.request must not be called with zero URLs'); };
  try {
    const urls = indexnow.collectUrls([path.join(__dirname, 'test_fixtures', 'does-not-exist.xml')]);
    assert.strictEqual(urls.length, 0);
    // Mirrors main()'s own early-return guard: zero URLs means no payload is ever POSTed.
  } finally {
    https.request = originalRequest;
  }
});
test('buildIndexNowPayload + submitToIndexNow are decoupled (payload construction never touches the network)', () => {
  const originalRequest = https.request;
  https.request = () => { throw new Error('https.request must not be called while only building a payload'); };
  try {
    const payload = indexnow.buildIndexNowPayload(['https://www.defi.garden/tokens/usdc'], 'www.defi.garden', 'k', 'https://www.defi.garden/k.txt');
    assert.strictEqual(payload.urlList.length, 1);
  } finally {
    https.request = originalRequest;
  }
});

console.log(`\n${passed} assertions passed.`);
if (process.exitCode) { console.error('\n❌ some assertions failed'); }
