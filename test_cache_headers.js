/* Unit tests for vercel.json static-asset Cache-Control headers (spec 055).
   Offline — parses vercel.json directly, no network/server involved.
   Run: node test_cache_headers.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const raw = fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8');
let config;

console.log('vercel.json — still valid JSON');
test('parses without throwing', () => {
  config = JSON.parse(raw);
  assert.ok(config.headers && Array.isArray(config.headers));
});

function cacheControlFor(rule) {
  const h = rule.headers.find(h => h.key === 'Cache-Control');
  return h ? h.value : undefined;
}

console.log('fonts — long, immutable cache');
test('a header rule matches /fonts/(.*) with immutable Cache-Control', () => {
  const rule = config.headers.find(r => r.source === '/fonts/(.*)');
  assert.ok(rule, 'expected a rule with source "/fonts/(.*)"');
  const cc = cacheControlFor(rule);
  assert.ok(cc, 'expected a Cache-Control header on the fonts rule');
  assert.ok(/immutable/.test(cc), `expected "immutable" in Cache-Control, got: ${cc}`);
  assert.ok(/max-age=31536000/.test(cc), `expected a 1-year max-age, got: ${cc}`);
});

console.log('JS/CSS static assets — non-zero, revalidating cache (not immutable — filenames are unhashed)');
test('a header rule matches .js/.css paths with a non-zero max-age', () => {
  const rule = config.headers.find(r => /\\\.\(js\|css\)/.test(r.source) || /\.\(js\|css\)/.test(r.source));
  assert.ok(rule, 'expected a rule whose source targets .js/.css files');
  const cc = cacheControlFor(rule);
  assert.ok(cc, 'expected a Cache-Control header on the JS/CSS rule');
  const match = cc.match(/max-age=(\d+)/);
  assert.ok(match, `expected a max-age in Cache-Control, got: ${cc}`);
  assert.notStrictEqual(match[1], '0', 'max-age=0 would defeat the purpose of this item');
});
test('the JS/CSS rule is not "immutable" (no content-hashed filenames exist yet — see spec 055 scope)', () => {
  const rule = config.headers.find(r => /\.\(js\|css\)/.test(r.source));
  const cc = cacheControlFor(rule);
  assert.ok(!/immutable/.test(cc), `JS/CSS assets are referenced by static (unhashed) filenames — "immutable" would risk serving stale JS after a deploy; got: ${cc}`);
});

console.log('HTML entry points — untouched, still always-revalidate');
test('/ still has max-age=0', () => {
  const rule = config.headers.find(r => r.source === '/' && r.headers.some(h => h.key === 'Cache-Control'));
  assert.ok(rule, 'expected the "/" rule with a Cache-Control header to still exist');
  assert.ok(/max-age=0/.test(cacheControlFor(rule)));
});
test('/home still has max-age=0', () => {
  const rule = config.headers.find(r => r.source === '/home');
  assert.ok(rule, 'expected the "/home" rule to still exist');
  assert.ok(/max-age=0/.test(cacheControlFor(rule)));
});

console.log('rewrites — untouched by this item');
test('rewrites array is unchanged in shape (still has the "/" -> "/home" rewrite)', () => {
  const rewrite = config.rewrites.find(r => r.source === '/' && r.destination === '/home' && !r.has);
  assert.ok(rewrite, 'expected the bare "/" -> "/home" rewrite to still be present');
});

console.log(`\n${passed} assertions passed.`);
if (process.exitCode) { console.error('\n❌ some assertions failed'); }
