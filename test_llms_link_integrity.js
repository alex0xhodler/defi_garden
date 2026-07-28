/* Regression tests for spec 166 — the AI-discovery surface's links must go
   where they claim, and pool rows must deep-link to pool-detail
   (`/?pool=<id>`), the router's north-star surface.

   Before this fix, generate-llms.js had three defects (spec 166's evidence,
   verified verbatim on live prod 2026-07-28):
     Class 1 — the by-chain rows in llms-full.txt built their URL from
       `pool.url || meta.baseUrl`. No DefiLlama payload has a `.url` field, so
       that fallback fired on 100% of rows, always: every one of those 15 rows
       linked to the bare homepage, not the pool it described.
     Class 2 — protocol rows (and the "Pendle opportunities" example) emitted
       `?search=<protocol>`. `search` is not a member of `home.html`'s
       `ANALYTICS_PARAMS`/`PLANNER_PARAMS`, so the IA router falls through to
       the query-less `landing` mode — a dead-feeling link.
     Class 3 — the "Current Top Yields" rows in llms.txt built
       `?token=<symbol>&chain=<chain>`, which cannot distinguish two distinct
       pools that share a symbol+chain (two Base uniswap-v3 WETH-USDC pools
       rendered as two rows pointing at ONE identical URL).

   Covers:
   (1) `poolUrl()` fixture-level: pool with an id -> `?pool=<id>`; pool with no
       id (or an empty-string id) -> the `?token=&chain=` fallback.
   (2) `buildConcise`/`buildFull` fixture-level: protocol rows emit
       `?protocols=`, never `?search=`; the "Pendle opportunities" example
       routes through `?protocols=`.
   (3) Committed-artifact leg (llms.txt + llms-full.txt on disk):
       - zero rows ending in the bare-homepage fallback
         (`TVL — https://www.defi.garden$`)
       - zero `?search=` occurrences
       - >= 10 `?pool=<uuid>` rows in llms-full.txt, >= 5 in llms.txt
       - >= 5 real pool lines per file (carry 159's non-empty-surface floor)
       - router-param membership: every `?key=`/`&key=` in both files is a
         member of home.html's own ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}
         — parsed live out of home.html, never a second hardcoded copy
       - class-3 regression: within each file, no two rows stating DIFFERENT
         APY/TVL figures share the same URL

   Method trap (carried from 159's Territory notes, and 166's spec explicitly
   repeats it): `data/pools-snapshot.json` has NO `apy` field (its keys are
   `apyBase`/`apyReward`/`apyMean30d`) — a fixture written against snapshot
   shape would make `pickHighYield()`/`buildConcise`/`buildFull` process an
   empty set and every assertion here would pass VACUOUSLY. Fixtures below use
   the LIVE-payload shape (a real `apy` field, `pool` id field), which is what
   generate-llms.js actually reads.

   Run: node test_llms_link_integrity.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  poolUrl,
  buildConcise,
  buildFull,
} = require('./generate-llms.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('llms.txt / llms-full.txt link integrity — 166');

const BASE = 'https://www.defi.garden';

// --- (1) poolUrl() fixture-level -------------------------------------------
test('poolUrl(): pool with a real id -> /?pool=<id>', () => {
  const pool = { pool: 'b99bcdf5-1350-4269-981e-0e9b5cccb007', chain: 'Base', project: 'uniswap-v3', symbol: 'WETH-USDC', apy: 86.2, tvlUsd: 111005227 };
  assert.strictEqual(poolUrl(pool, BASE), `${BASE}/?pool=b99bcdf5-1350-4269-981e-0e9b5cccb007`);
});

test('poolUrl(): pool.pool absent -> ?token=<symbol>&chain=<chain> fallback', () => {
  const pool = { chain: 'Ethereum', project: 'saturn', symbol: 'SUSDAT', apy: 25.6, tvlUsd: 80813928 };
  assert.strictEqual(poolUrl(pool, BASE), `${BASE}/?token=SUSDAT&chain=Ethereum`);
});

test('poolUrl(): pool.pool is an empty string -> falls back, does not emit /?pool=', () => {
  const pool = { pool: '', chain: 'Solana', project: 'orca-dex', symbol: 'SOL-USDC', apy: 52.4, tvlUsd: 25414650 };
  const url = poolUrl(pool, BASE);
  assert.strictEqual(url, `${BASE}/?token=SOL-USDC&chain=Solana`);
  assert.ok(!url.includes('?pool='), 'empty pool.pool must not produce a ?pool= link');
});

test('poolUrl(): never reads a .url field (no DefiLlama payload has one)', () => {
  const pool = { url: 'https://should-be-ignored.example', chain: 'Base', project: 'aerodrome-v1', symbol: 'USDC-AERO', apy: 19.47, tvlUsd: 26142073 };
  const url = poolUrl(pool, BASE);
  assert.ok(!url.includes('should-be-ignored'), 'poolUrl must ignore pool.url entirely');
  assert.strictEqual(url, `${BASE}/?token=USDC-AERO&chain=Base`);
});

// --- (2) buildConcise/buildFull emit ?pool= and ?protocols=, never ?search= -
const emptyCategories = { homepage: [`${BASE}/`], tokens: [], chains: [], poolTypes: [], highValue: [], other: [] };
const baseMeta = { baseUrl: BASE, updatedAt: '2026-07-28T00:00:00.000Z', totalUrls: 1, defiLlamaFetchedAt: '2026-07-28T00:00:00.000Z' };

function liveShapedHighYield() {
  const withId = { chain: 'Base', project: 'uniswap-v3', symbol: 'WETH-USDC', apy: 86.2, tvlUsd: 111005227, pool: 'b99bcdf5-1350-4269-981e-0e9b5cccb007' };
  const withoutId = { chain: 'Ethereum', project: 'saturn', symbol: 'SUSDAT', apy: 25.6, tvlUsd: 80813928 };
  return { top: [withId, withoutId], byChain: { Base: [withId], Ethereum: [withoutId] } };
}

function liveShapedYieldAnalysis() {
  return {
    topChainsByTvl: [{ chain: 'Base', tvl: 6.3e9 }],
    topProtocols: [{ protocol: 'lido', tvl: 17.6e9 }],
    popularTokens: [],
    topTokenChainCombos: [],
  };
}

test('buildConcise(): pool row with an id emits /?pool=<id>', () => {
  const out = buildConcise(baseMeta, emptyCategories, liveShapedHighYield(), liveShapedYieldAnalysis());
  assert.ok(out.includes('/?pool=b99bcdf5-1350-4269-981e-0e9b5cccb007'), 'expected a ?pool= link for the pool that has an id');
});

test('buildConcise(): pool row with no id falls back to ?token=&chain=', () => {
  const out = buildConcise(baseMeta, emptyCategories, liveShapedHighYield(), liveShapedYieldAnalysis());
  assert.ok(out.includes(`${BASE}/?token=SUSDAT&chain=Ethereum`), 'expected the fallback link for the pool that has no id');
});

test('buildConcise(): protocol rows emit ?protocols=, never ?search=', () => {
  const out = buildConcise(baseMeta, emptyCategories, liveShapedHighYield(), liveShapedYieldAnalysis());
  assert.ok(out.includes(`${BASE}/?protocols=lido`), 'expected ?protocols= for the protocol row');
  assert.ok(!out.includes('?search='), 'buildConcise output must never contain ?search=');
});

test('buildConcise(): "Pendle opportunities" example routes through ?protocols=', () => {
  const out = buildConcise(baseMeta, emptyCategories, liveShapedHighYield(), liveShapedYieldAnalysis());
  assert.ok(out.includes(`${BASE}/?protocols=pendle`), 'expected the Pendle example to use ?protocols=pendle');
});

test('buildFull(): by-chain pool row with an id emits /?pool=<id>, never the bare baseUrl', () => {
  const out = buildFull(baseMeta, emptyCategories, liveShapedHighYield(), liveShapedYieldAnalysis());
  assert.ok(out.includes('/?pool=b99bcdf5-1350-4269-981e-0e9b5cccb007'), 'expected a ?pool= link in the by-chain section');
  assert.ok(!new RegExp(`TVL — ${BASE.replace(/[.]/g, '\\.')}$`, 'm').test(out), 'no by-chain row may fall back to the bare homepage');
});

test('buildFull(): by-chain pool row with no id falls back to ?token=&chain=', () => {
  const out = buildFull(baseMeta, emptyCategories, liveShapedHighYield(), liveShapedYieldAnalysis());
  assert.ok(out.includes(`${BASE}/?token=SUSDAT&chain=Ethereum`), 'expected the fallback link in the by-chain section');
});

test('buildFull(): protocol rows emit ?protocols=, never ?search=', () => {
  const out = buildFull(baseMeta, emptyCategories, liveShapedHighYield(), liveShapedYieldAnalysis());
  assert.ok(out.includes(`${BASE}/?protocols=lido`), 'expected ?protocols= for the protocol row');
  assert.ok(!out.includes('?search='), 'buildFull output must never contain ?search=');
});

// --- (3) Committed-artifact leg --------------------------------------------
const LLMS_PATH = path.join(__dirname, 'llms.txt');
const LLMS_FULL_PATH = path.join(__dirname, 'llms-full.txt');
const llmsContent = fs.readFileSync(LLMS_PATH, 'utf8');
const llmsFullContent = fs.readFileSync(LLMS_FULL_PATH, 'utf8');

test('committed llms.txt: zero rows fall back to the bare homepage (TVL — baseUrl$)', () => {
  const matches = llmsContent.match(/TVL — https:\/\/www\.defi\.garden$/gm) || [];
  assert.strictEqual(matches.length, 0, `expected 0 bare-homepage fallback rows, found ${matches.length}`);
});

test('committed llms-full.txt: zero rows fall back to the bare homepage (TVL — baseUrl$) — was 15', () => {
  const matches = llmsFullContent.match(/TVL — https:\/\/www\.defi\.garden$/gm) || [];
  assert.strictEqual(matches.length, 0, `expected 0 bare-homepage fallback rows, found ${matches.length}`);
});

test('committed llms.txt: zero ?search= occurrences', () => {
  const matches = llmsContent.match(/\?search=/g) || [];
  assert.strictEqual(matches.length, 0, `expected 0 occurrences of ?search=, found ${matches.length}`);
});

test('committed llms-full.txt: zero ?search= occurrences — was 10', () => {
  const matches = llmsFullContent.match(/\?search=/g) || [];
  assert.strictEqual(matches.length, 0, `expected 0 occurrences of ?search=, found ${matches.length}`);
});

test('committed llms.txt: >= 5 rows matching \\?pool=[uuid] — was 0', () => {
  const matches = llmsContent.match(/\?pool=[0-9a-f-]{36}/g) || [];
  assert.ok(matches.length >= 5, `expected >= 5 ?pool=<uuid> rows in llms.txt, found ${matches.length}`);
});

test('committed llms-full.txt: >= 10 rows matching \\?pool=[uuid] — was 0', () => {
  const matches = llmsFullContent.match(/\?pool=[0-9a-f-]{36}/g) || [];
  assert.ok(matches.length >= 10, `expected >= 10 ?pool=<uuid> rows in llms-full.txt, found ${matches.length}`);
});

test('committed llms.txt still lists >= 5 real pool lines (159\'s non-empty floor)', () => {
  const poolLines = (llmsContent.match(/^- .+% APY, .+ TVL — /gm) || []).length;
  assert.ok(poolLines >= 5, `expected >= 5 pool lines in llms.txt, found ${poolLines}`);
});

test('committed llms-full.txt still lists >= 5 real pool lines (159\'s non-empty floor)', () => {
  const poolLines = (llmsFullContent.match(/^- .+% APY, .+ TVL — /gm) || []).length;
  assert.ok(poolLines >= 5, `expected >= 5 pool lines in llms-full.txt, found ${poolLines}`);
});

// --- Router-param membership: parsed live out of home.html, never a second
// hardcoded copy of ANALYTICS_PARAMS/PLANNER_PARAMS. -----------------------
function parseParamArray(html, varName) {
  const re = new RegExp(`var\\s+${varName}\\s*=\\s*\\[([^\\]]*)\\]`);
  const m = html.match(re);
  if (!m) throw new Error(`could not find "var ${varName} = [...]" in home.html`);
  const items = m[1].match(/'([^']*)'|"([^"]*)"/g) || [];
  return items.map(s => s.slice(1, -1));
}

const homeHtml = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
const ANALYTICS_PARAMS = parseParamArray(homeHtml, 'ANALYTICS_PARAMS');
const PLANNER_PARAMS = parseParamArray(homeHtml, 'PLANNER_PARAMS');
const ALLOWED_PARAMS = new Set([...ANALYTICS_PARAMS, ...PLANNER_PARAMS, 'lang']);

test('home.html actually contains ANALYTICS_PARAMS and PLANNER_PARAMS arrays (parse sanity)', () => {
  assert.ok(ANALYTICS_PARAMS.includes('token'), 'expected "token" in ANALYTICS_PARAMS');
  assert.ok(ANALYTICS_PARAMS.includes('pool'), 'expected "pool" in ANALYTICS_PARAMS');
  assert.ok(ANALYTICS_PARAMS.includes('protocols'), 'expected "protocols" in ANALYTICS_PARAMS');
  assert.ok(PLANNER_PARAMS.length > 0, 'expected a non-empty PLANNER_PARAMS');
});

function extractQueryKeys(content) {
  const keys = new Set();
  const re = /[?&]([A-Za-z0-9_]+)=/g;
  let m;
  while ((m = re.exec(content))) keys.add(m[1]);
  return keys;
}

test('committed llms.txt: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}', () => {
  const keys = extractQueryKeys(llmsContent);
  const unknown = [...keys].filter(k => !ALLOWED_PARAMS.has(k));
  assert.deepStrictEqual(unknown, [], `llms.txt emits unrouted param(s): ${unknown.join(', ')}`);
});

test('committed llms-full.txt: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}', () => {
  const keys = extractQueryKeys(llmsFullContent);
  const unknown = [...keys].filter(k => !ALLOWED_PARAMS.has(k));
  assert.deepStrictEqual(unknown, [], `llms-full.txt emits unrouted param(s): ${unknown.join(', ')}`);
});

// --- Class-3 regression: no two rows with DIFFERENT APY/TVL share a URL ----
function findConflictingUrls(content) {
  const re = /^- .+? — ([0-9.]+)% APY, (\$[0-9,]+) TVL — (\S+)$/gm;
  const byUrl = new Map(); // url -> Set of "apy|tvl" combos seen
  let m;
  while ((m = re.exec(content))) {
    const [, apy, tvl, url] = m;
    const combo = `${apy}|${tvl}`;
    if (!byUrl.has(url)) byUrl.set(url, new Set());
    byUrl.get(url).add(combo);
  }
  const conflicts = [];
  for (const [url, combos] of byUrl) {
    if (combos.size > 1) conflicts.push({ url, combos: [...combos] });
  }
  return conflicts;
}

test('committed llms.txt: no two rows with different APY/TVL share the same URL (class-3 regression)', () => {
  const conflicts = findConflictingUrls(llmsContent);
  assert.deepStrictEqual(conflicts, [], `llms.txt has URL(s) shared by conflicting figures: ${JSON.stringify(conflicts)}`);
});

test('committed llms-full.txt: no two rows with different APY/TVL share the same URL (class-3 regression)', () => {
  const conflicts = findConflictingUrls(llmsFullContent);
  assert.deepStrictEqual(conflicts, [], `llms-full.txt has URL(s) shared by conflicting figures: ${JSON.stringify(conflicts)}`);
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
