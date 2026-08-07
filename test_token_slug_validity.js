/* Unit tests for the shared token-validity predicate (spec 148).
   Root cause: tokenSymbols() splits a Pendle-style symbol like
   "PT-SUSDE-22OCT2026" into three "tokens" — PT, SUSDE, and the expiry-date
   fragment 22OCT2026 — and the pre-148 TOKEN_REGEX happily accepted both
   pure-numeric strings ("2027", "00") and date-shaped fragments
   ("22OCT2026"), earning them a real generated page.

   isValidToken() is DUPLICATED (not shared) between generate-token-pages.js
   and generate-sitemap.js — a documented mirror pair. This test runs EVERY
   assertion against BOTH exported predicates so a future drift between the
   two mirrors fails loudly instead of silently reintroducing junk pages via
   just one of the two generators.

   Run: node test_token_slug_validity.js */
const assert = require('assert');
const tokenPages = require('./generate-token-pages.js');
const sitemapGen = require('./generate-sitemap.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const PREDICATES = [
  ['generate-token-pages.js', tokenPages.isValidToken],
  ['generate-sitemap.js', sitemapGen.isValidToken],
];

// --- NEGATIVE: pure-numeric strings + Pendle-style date-shaped expiry
// fragments must never earn a page. Not hardcoded to today's live snapshot
// (the spec's Territory notes: the junk set churns daily) — these are
// representative examples of the two REJECTION RULES, not an exhaustive list.
const NEGATIVE = [
  '8OCT2026', '22OCT2026', '16SEP26', '10DEC2026', '18JUN2026', '17DEC2026',
  '24SEP2026', '27AUG2026', '2027', '00', '01', '67', '20261231',
  // lowercase variants — the predicate must be case-insensitive
  '8oct2026', '22oct2026',
];

// --- POSITIVE: real tickers that merely LOOK date-ish or numeric-ish must
// never be swept up by the two rejection rules above. This is the exact
// failure mode the spec calls out as the FAIL condition: a regex too greedy
// silently deletes real token pages.
const POSITIVE = [
  'USDC', 'WETH', '3CRV', '1INCH', '2Z', '4CHAN', '50EIGEN', '40AVAX',
  '0X0', '13W', '1W', '4W', 'BTC', 'PT', 'USDC.E', 'SUSDE',
];

PREDICATES.forEach(([label, isValidToken]) => {
  console.log(`\nisValidToken (${label}) — negative list (date fragments / pure-numeric)`);
  NEGATIVE.forEach(sym => {
    test(`rejects "${sym}"`, () => {
      assert.strictEqual(isValidToken(sym), false, `${label}: isValidToken(${JSON.stringify(sym)}) should be false`);
    });
  });

  console.log(`\nisValidToken (${label}) — positive list (real tickers that must survive)`);
  POSITIVE.forEach(sym => {
    test(`accepts "${sym}"`, () => {
      assert.strictEqual(isValidToken(sym), true, `${label}: isValidToken(${JSON.stringify(sym)}) should be true`);
    });
  });
});

// --- End-to-end: prove the predicate change actually reaches the real
// generator output, not just the standalone function. A Pendle-style pool's
// structural prefix (PT) and underlying asset (SUSDE) must still earn pages;
// its expiry-date fragment (22OCT2026) must not, even though it clears the
// generator's TVL/APY eligibility gates on its own.
console.log('\nEnd-to-end — rankTopTokens() never mints a page for the expiry-date fragment');
const pendlePool = {
  pool: 'pendle-pt-susde-22oct2026',
  project: 'pendle',
  chain: 'Ethereum',
  symbol: 'PT-SUSDE-22OCT2026',
  tvlUsd: 5_000_000,
  apyBase: 8.5,
  apyReward: 0,
};
const ordinaryPool = {
  pool: 'aave-v3-usdc',
  project: 'aave-v3',
  chain: 'Ethereum',
  symbol: 'USDC',
  tvlUsd: 200_000_000,
  apyBase: 4.2,
  apyReward: 0,
};
const ranked = tokenPages.rankTopTokens([pendlePool, ordinaryPool]);
const symbols = ranked.map(r => r.symbol);

test('ranked symbols include PT (Pendle structural prefix — explicitly out of scope, stays a real page)', () => {
  assert.ok(symbols.includes('PT'), 'expected PT in ranked symbols: ' + JSON.stringify(symbols));
});
test('ranked symbols include SUSDE (the real underlying asset)', () => {
  assert.ok(symbols.includes('SUSDE'), 'expected SUSDE in ranked symbols: ' + JSON.stringify(symbols));
});
test('ranked symbols include USDC (ordinary pool, unaffected control)', () => {
  assert.ok(symbols.includes('USDC'), 'expected USDC in ranked symbols: ' + JSON.stringify(symbols));
});
test('ranked symbols do NOT include the expiry-date fragment 22OCT2026', () => {
  assert.ok(!symbols.includes('22OCT2026'), 'expiry-date fragment leaked into rankTopTokens output: ' + JSON.stringify(symbols));
});

console.log(`\n${passed} assertions passed`);
