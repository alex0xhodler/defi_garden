/* Regression tests for spec 159 — generate-llms.js must apply the SAME trust
   rails the product enforces (app.js:800 APY_SANITY_LIMIT = 1000, app.js:801
   DEFAULT_MIN_TVL = 10000000) to the llms.txt / llms-full.txt AI-discovery
   surface. Before this fix, `pickHighYield()` had no APY ceiling at all and a
   $10k TVL floor (1000x looser than the product), so the surface published a
   leaderboard of the dataset's most anomalous pools (up to 353,114% APY) —
   pools the analytics app itself would never show.

   Covers:
   (a) a fixture pool at 353114.2% APY / $576,877 TVL is excluded — on BOTH
       counts (anomalous APY AND sub-floor TVL) — plus an anomalous-APY-but-
       huge-TVL fixture pool, to prove the APY rail alone is load-bearing
       (TVL alone would not have caught it).
   (b) an in-rail pool at/above the new TVL floor IS included.
   (c) the exact boundary: apy === APY_SANITY_LIMIT (1000) is included,
       1000.01 is excluded.
   (d) the COMMITTED llms.txt / llms-full.txt on disk are parsed and asserted
       to contain zero APY figures > 1000 — the artifact itself is gated, not
       just the function. Both render formats are covered: llms.txt uses
       `.toFixed(1)`, llms-full.txt uses `.toFixed(2)`.
   (e) both committed files still list >= 5 real pool lines each — a filter
       that empties the surface is a FAIL, not a fix.

   Method trap (carried from the spec's Territory notes): `data/pools-
   snapshot.json` has NO `apy` field (its keys are `apyBase`/`apyReward`/
   `apyMean30d`) — a rail check written against snapshot shape would pass
   VACUOUSLY. Fixtures here use the LIVE-payload shape (a real `apy` field),
   which is what generate-llms.js and pickHighYield() actually read.

   Run: node test_llms_rails.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  pickHighYield,
  APY_SANITY_LIMIT,
  MIN_TVL_USD,
  formatTvlFloor,
} = require('./generate-llms.js');
// backlog 254: the sync check below asserts MIN_TVL_USD against THIS (the
// live app.js-mirroring shared source), never a re-typed literal — a
// hardcoded `10000000` here is exactly the class of defect backlog 254
// fixed (this file's own former assertion was one of the casualties).
const { DEFAULT_MIN_TVL } = require('./trust-rails.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('llms.txt / llms-full.txt trust rails — 159');

// --- (0) The rail constants themselves ------------------------------------
test('APY_SANITY_LIMIT mirrors app.js:800 (1000)', () => {
  assert.strictEqual(APY_SANITY_LIMIT, 1000);
});
test('MIN_TVL_USD mirrors trust-rails.js DEFAULT_MIN_TVL (itself mirroring app.js:801)', () => {
  assert.strictEqual(MIN_TVL_USD, DEFAULT_MIN_TVL);
});

// --- (a) The real-world anomalous pool from the spec's evidence -----------
test('353114.2% APY / $576,877 TVL pool (live-payload shape) is excluded', () => {
  const pools = [
    { chain: 'BSC', project: 'zeebu', symbol: 'ZBU', apy: 353114.2, tvlUsd: 576877 },
  ];
  const { top } = pickHighYield(pools);
  assert.strictEqual(top.length, 0, 'anomalous pool must not survive the filter');
});

test('APY rail alone is load-bearing: anomalous APY + HUGE TVL is still excluded', () => {
  // TVL floor alone would let this through — only the APY ceiling catches it.
  const pools = [
    { chain: 'Ethereum', project: 'huge-anomaly', symbol: 'FOO-BAR', apy: 50000, tvlUsd: 500000000 },
  ];
  const { top } = pickHighYield(pools);
  assert.strictEqual(top.length, 0, 'anomalous APY must exclude even a well-capitalized pool');
});

// --- (b) In-rail pool at/above the new TVL floor is included --------------
test('in-rail pool at the MIN_TVL_USD floor and sane APY is included', () => {
  const pools = [
    { chain: 'Base', project: 'uniswap-v3', symbol: 'WETH-USDC', apy: 25.4, tvlUsd: MIN_TVL_USD },
  ];
  const { top } = pickHighYield(pools);
  assert.strictEqual(top.length, 1, 'in-rail pool must be included');
  assert.strictEqual(top[0].symbol, 'WETH-USDC');
});

test('pool just under the TVL floor is excluded', () => {
  const pools = [
    { chain: 'Base', project: 'uniswap-v3', symbol: 'WETH-USDC', apy: 25.4, tvlUsd: MIN_TVL_USD - 1 },
  ];
  const { top } = pickHighYield(pools);
  assert.strictEqual(top.length, 0, 'sub-floor TVL must be excluded');
});

// --- (c) Exact APY boundary -------------------------------------------------
test('boundary: apy === 1000 (exactly APY_SANITY_LIMIT) is included', () => {
  const pools = [
    { chain: 'Ethereum', project: 'boundary', symbol: 'AAA-BBB', apy: 1000, tvlUsd: MIN_TVL_USD },
  ];
  const { top } = pickHighYield(pools);
  assert.strictEqual(top.length, 1, 'exactly the limit must be inclusive (<=)');
});

test('boundary: apy === 1000.01 is excluded', () => {
  const pools = [
    { chain: 'Ethereum', project: 'boundary', symbol: 'AAA-BBB', apy: 1000.01, tvlUsd: MIN_TVL_USD },
  ];
  const { top } = pickHighYield(pools);
  assert.strictEqual(top.length, 0, 'one hundredth of a percent over the limit must be excluded');
});

// --- TL;DR string derives from the constant, not a second hardcoded literal
test('TL;DR TVL claim derives from MIN_TVL_USD via formatTvlFloor', () => {
  assert.strictEqual(formatTvlFloor(MIN_TVL_USD), formatTvlFloor(DEFAULT_MIN_TVL));
  assert.strictEqual(formatTvlFloor(1000000), '$1M');
});

// --- (d) + (e) The committed artifacts themselves are gated ----------------
function parseApyFigures(content, decimalRegex) {
  const matches = content.match(new RegExp(`— ${decimalRegex}% APY`, 'g')) || [];
  return matches.map(m => parseFloat(m.replace(/^— /, '').replace(/% APY$/, '')));
}

test('committed llms.txt has zero APY figures > 1000 (.toFixed(1) format)', () => {
  const content = fs.readFileSync(path.join(__dirname, 'llms.txt'), 'utf8');
  const figures = parseApyFigures(content, '[0-9.]+');
  assert.ok(figures.length > 0, 'expected at least one APY figure to parse from llms.txt');
  const anomalous = figures.filter(f => f > 1000);
  assert.deepStrictEqual(anomalous, [], `llms.txt has anomalous APY figures: ${anomalous.join(', ')}`);
});

test('committed llms-full.txt has zero APY figures > 1000 (.toFixed(2) format)', () => {
  const content = fs.readFileSync(path.join(__dirname, 'llms-full.txt'), 'utf8');
  const figures = parseApyFigures(content, '[0-9.]+');
  assert.ok(figures.length > 0, 'expected at least one APY figure to parse from llms-full.txt');
  const anomalous = figures.filter(f => f > 1000);
  assert.deepStrictEqual(anomalous, [], `llms-full.txt has anomalous APY figures: ${anomalous.join(', ')}`);
});

test('committed llms.txt still lists >= 5 real pool lines', () => {
  const content = fs.readFileSync(path.join(__dirname, 'llms.txt'), 'utf8');
  const poolLines = (content.match(/^- .+% APY, .+ TVL — /gm) || []).length;
  assert.ok(poolLines >= 5, `expected >= 5 pool lines in llms.txt, found ${poolLines}`);
});

test('committed llms-full.txt still lists >= 5 real pool lines', () => {
  const content = fs.readFileSync(path.join(__dirname, 'llms-full.txt'), 'utf8');
  const poolLines = (content.match(/^- .+% APY, .+ TVL — /gm) || []).length;
  assert.ok(poolLines >= 5, `expected >= 5 pool lines in llms-full.txt, found ${poolLines}`);
});

test('committed llms.txt TL;DR TVL claim matches the floor actually used', () => {
  const content = fs.readFileSync(path.join(__dirname, 'llms.txt'), 'utf8');
  assert.ok(
    content.includes(`TVL ≥ ${formatTvlFloor(MIN_TVL_USD)}`),
    'TL;DR must render the live MIN_TVL_USD constant, not a stale hardcoded literal'
  );
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
