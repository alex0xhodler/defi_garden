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
  // spec 180: link-integrity gate (R1/R2/R3 + anti-vacuity rails)
  gridLinkPoolCount,
  applyChainRetarget,
  repairMinApyLink,
  applyLinkIntegrityGate,
  snapshotApyOf,
  pickHighYield,
  analyzeYieldData,
  plannerRate,
  MIN_TVL_USD,
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

// --- item 188 Leg B: buildFull()'s four filter-heading sections must not ship
// a "## <heading>" + TL;DR promising content above zero links — the same
// guard ## Other Pages already had (a heading claim over an empty section is
// the false-claim class 174/159 fixed for a single line, applied to a whole
// section). Required for Leg A's own correctness: once Leg A gates the
// filter-URL list, categories.highValue can legitimately empty out.
test('buildFull(): with ALL FOUR category arrays empty, none of Token/Chain/Pool Type/High-Value Filter headings ship at all', () => {
  const out = buildFull(baseMeta, emptyCategories, pickHighYield([]), analyzeYieldData([]), plannerRate([]));
  assert.ok(!out.includes('## Token Pages'), 'empty categories.tokens must not ship the heading');
  assert.ok(!out.includes('## Chain Pages'), 'empty categories.chains must not ship the heading');
  assert.ok(!out.includes('## Pool Type Pages'), 'empty categories.poolTypes must not ship the heading');
  assert.ok(!out.includes('## High-Value Filter Pages'), 'empty categories.highValue must not ship the heading');
});

test('buildFull(): the guard is PER-SECTION, not all-or-nothing — a populated category still ships its heading+links while an empty sibling stays absent', () => {
  const mixedCategories = {
    homepage: [`${BASE}/`],
    tokens: [`${BASE}/?token=USDC`], // populated
    chains: [], // empty
    poolTypes: [], // empty
    highValue: [`${BASE}/?chain=All&minApy=5`], // populated (Leg A's own shape)
    other: [],
  };
  const out = buildFull(baseMeta, mixedCategories, pickHighYield([]), analyzeYieldData([]), plannerRate([]));
  assert.ok(out.includes('## Token Pages'), 'populated categories.tokens must still ship its heading');
  assert.ok(out.includes(`${BASE}/?token=USDC`), 'populated categories.tokens must still ship its link');
  assert.ok(out.includes('## High-Value Filter Pages'), 'populated categories.highValue must still ship its heading');
  assert.ok(out.includes(`${BASE}/?chain=All&minApy=5`), 'populated categories.highValue must still ship its link');
  assert.ok(!out.includes('## Chain Pages'), 'empty categories.chains must not ship its heading');
  assert.ok(!out.includes('## Pool Type Pages'), 'empty categories.poolTypes must not ship its heading');
});

test('buildFull(): "## <heading>" is never immediately followed by a TL;DR line and then a blank line/another heading with no link in between (A5\'s literal assertion, over the FULL emptyCategories output)', () => {
  const out = buildFull(baseMeta, emptyCategories, pickHighYield([]), analyzeYieldData([]), plannerRate([]));
  const lines = out.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('## ')) continue;
    const tldrLine = lines[i + 1] || '';
    if (!tldrLine.startsWith('TL;DR')) continue; // not every heading has a TL;DR line (e.g. by-chain ### subheadings)
    const afterTldr = lines[i + 2] || '';
    const isEmptySection = afterTldr === '' || afterTldr.startsWith('## ');
    assert.ok(!isEmptySection, `heading "${lines[i]}" is followed by a TL;DR then an empty/next-heading line with no link — the exact defect A5 bans`);
  }
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

/* ===========================================================================
   spec 180 — "the AI-discovery surface must not publish links to an empty
   grid". R1 (gridLinkPoolCount), R2 (applyChainRetarget), R3
   (repairMinApyLink), both anti-vacuity rails, plus a committed-artifact leg
   asserting zero dead grid links in the real llms.txt/llms-full.txt.

   Method trap (this file's own header note, repeated because it bites R1's
   fixtures specifically): every fixture pool below carries a real `apy`
   field and, where relevant, a `pool` id — the LIVE-payload shape
   generate-llms.js actually reads. A snapshot-shaped fixture (apyBase/
   apyReward, no `apy`) would make gridLinkPoolCount() silently read
   `Number(undefined) || 0` = 0 for every pool and every assertion below
   would pass VACUOUSLY regardless of which rule is under test.
   =========================================================================== */
console.log('\nspec 180 — link-integrity gate (R1/R2/R3 + anti-vacuity rails)');

const BASE180 = 'https://www.defi.garden';

// --- R1: gridLinkPoolCount() ------------------------------------------------
test('R1 gridLinkPoolCount(): token match is case-insensitive substring on symbol', () => {
  const pools = [{ symbol: 'USDC-AERO', chain: 'Base', project: 'aerodrome-v1', tvlUsd: 20000000, apy: 12 }];
  const hit = gridLinkPoolCount(`${BASE180}/?token=usdc`, pools);
  assert.strictEqual(hit.count, 1, 'lowercase "usdc" must substring-match "USDC-AERO"');
  const miss = gridLinkPoolCount(`${BASE180}/?token=ZZZNOPE`, pools);
  assert.strictEqual(miss.count, 0);
});

test('R1 gridLinkPoolCount(): chain match is exact', () => {
  const pools = [{ symbol: 'USDC', chain: 'Base', project: 'x', tvlUsd: 20000000, apy: 5 }];
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Base`, pools).count, 1);
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=BASE`, pools).count, 0, 'chain match must be case-exact, not case-insensitive');
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Ethereum`, pools).count, 0);
});

test('R1 gridLinkPoolCount(): protocols match is exact project equality', () => {
  const pools = [{ symbol: 'USDC', chain: 'Ethereum', project: 'aave-v3', tvlUsd: 20000000, apy: 4 }];
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?protocols=aave-v3`, pools).count, 1);
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?protocols=aave`, pools).count, 0, 'must be exact, not substring');
});

test('R1 gridLinkPoolCount(): poolTypes uses getPoolType(), lazily required from generate-sitemap.js', () => {
  const pools = [
    { symbol: 'USDC', chain: 'Ethereum', project: 'aave-v3', tvlUsd: 20000000, apy: 4 },   // Lending
    { symbol: 'ETH', chain: 'Ethereum', project: 'lido', tvlUsd: 30000000, apy: 3 },       // Staking
  ];
  const lending = gridLinkPoolCount(`${BASE180}/?poolTypes=Lending`, pools);
  assert.strictEqual(lending.count, 1);
  assert.strictEqual(lending.poolTypesDropped, false);
  const staking = gridLinkPoolCount(`${BASE180}/?poolTypes=Staking`, pools);
  assert.strictEqual(staking.count, 1);
});

test('R1 gridLinkPoolCount(): poolTypes classifier unavailable -> constraint DROPPED and counted, never silently ignored', () => {
  const pools = [{ symbol: 'USDC', chain: 'Ethereum', project: 'aave-v3', tvlUsd: 20000000, apy: 4 }];
  // opts.getPoolType explicitly null simulates the try/catch's "unavailable" branch.
  const result = gridLinkPoolCount(`${BASE180}/?poolTypes=Lending`, pools, { getPoolType: null });
  assert.strictEqual(result.poolTypesDropped, true, 'unavailable classifier must be reported, not swallowed');
  assert.strictEqual(result.count, 1, 'with the constraint dropped, the pool still counts (TVL alone qualifies it)');
});

test('R1 gridLinkPoolCount(): minTvl explicit param wins over MIN_TVL_USD', () => {
  // backlog 254: pool/floor pair re-chosen relative to MIN_TVL_USD (now
  // $100K, was $10M) rather than a stale literal — same relationship as
  // before (pool below MIN_TVL_USD, above an explicit lower floor).
  const pools = [{ symbol: 'USDC', chain: 'Base', project: 'x', tvlUsd: 50000, apy: 4 }];
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Base&minTvl=10000`, pools).count, 1, 'explicit floor below MIN_TVL_USD must be honored, never clamped up');
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Base`, pools).count, 0, 'absent minTvl falls back to MIN_TVL_USD — this pool is below it');
});

test('R1 gridLinkPoolCount(): qualification is (tvlUsd||0)>=floor && (tvlUsd||0)>0 — test_seo_cta_targets.js:117 reference', () => {
  const atFloor = [{ symbol: 'USDC', chain: 'Base', project: 'x', tvlUsd: MIN_TVL_USD, apy: 1 }];
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Base`, atFloor).count, 1, 'exactly at the floor must qualify');
  const zeroTvl = [{ symbol: 'USDC', chain: 'Base', project: 'x', tvlUsd: 0, apy: 1 }];
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Base&minTvl=0`, zeroTvl).count, 0, 'tvlUsd=0 must never qualify even at a $0 floor');
});

test('R1 gridLinkPoolCount(): minApy is apy >= minApy', () => {
  const pools = [{ symbol: 'USDC', chain: 'Base', project: 'x', tvlUsd: 20000000, apy: 5 }];
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Base&minApy=5`, pools).count, 1);
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Base&minApy=5.01`, pools).count, 0);
});

// --- item 188 Leg C: 'All' is a wildcard chain (mirrors app.js:1837/1843's
// `chainMatch = selectedChain === 'All' || ...`) — without this, every
// `?chain=All&...` link the new sitemap gate emits (specs/188.md) would
// simulate to zero pools here (no pool's `chain` field is ever 'All') and
// applyChainRetarget()/the structural tripwire would treat a genuinely LIVE
// link as dead. -------------------------------------------------------------
test('R1 gridLinkPoolCount(): "?chain=All&minApy=<x>" counts the SAME pools as the identical query with no chain param at all', () => {
  const pools = [
    { symbol: 'USDC', chain: 'Ethereum', project: 'aave-v3', tvlUsd: 20000000, apy: 6 },
    { symbol: 'USDT', chain: 'Solana', project: 'kamino-lend', tvlUsd: 30000000, apy: 8 },
    // backlog 254: below MIN_TVL_USD (now $100K, was $10M) — re-chosen so
    // this pool stays sub-floor under the corrected floor.
    { symbol: 'DAI', chain: 'Base', project: 'compound-v3', tvlUsd: 50000, apy: 20 }, // below the TVL floor used
  ];
  const withAll = gridLinkPoolCount(`${BASE180}/?chain=All&minApy=5`, pools);
  const withoutChain = gridLinkPoolCount(`${BASE180}/?minApy=5`, pools);
  assert.strictEqual(withAll.count, withoutChain.count, 'chain=All must count identically to no chain param at all');
  assert.strictEqual(withAll.count, 2, 'Ethereum + Solana both qualify (>= MIN_TVL_USD, >= 5% APY); Base is below the TVL floor');
});

test('R1 gridLinkPoolCount(): "?chain=Ethereum" (a literal, non-\'All\' chain) still filters exactly — the wildcard must not become a general chain bypass', () => {
  const pools = [
    { symbol: 'USDC', chain: 'Ethereum', project: 'aave-v3', tvlUsd: 20000000, apy: 6 },
    { symbol: 'USDT', chain: 'Solana', project: 'kamino-lend', tvlUsd: 30000000, apy: 8 },
  ];
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Ethereum`, pools).count, 1, 'must count only the Ethereum pool');
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?chain=Solana`, pools).count, 1, 'must count only the Solana pool');
});

test('R1 gridLinkPoolCount(): ?pool=<id> is NEVER simulated (175\'s 4,233-false-positive trap) — returns null', () => {
  const pools = [{ symbol: 'USDC', chain: 'Base', project: 'x', tvlUsd: 1, apy: 1, pool: 'irrelevant' }];
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?pool=abc123&chain=Base`, pools), null, 'a link carrying ?pool= must never be simulated, even alongside other grid params');
});

test('R1 gridLinkPoolCount(): a link carrying none of GRID_LINK_PARAMS is untouched -> null', () => {
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/?lang=ko`, []), null);
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/plan.html?preset=tomoko`, []), null);
});

test('R1 gridLinkPoolCount(): a path-only URL (no query at all) is untouched -> null', () => {
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/chains/cardano`, []), null);
  assert.strictEqual(gridLinkPoolCount(`${BASE180}/`, []), null);
});

// --- R2: applyChainRetarget() -----------------------------------------------
test('R2 applyChainRetarget(): a LIVE chain link is returned byte-unchanged', () => {
  const pools = [{ symbol: 'USDC', chain: 'Ethereum', project: 'aave-v3', tvlUsd: 20000000, apy: 4 }];
  const chainUrls = [`${BASE180}/?chain=Ethereum`];
  const sitemapUrlSet = new Set([`${BASE180}/chains/ethereum`]);
  const result = applyChainRetarget(chainUrls, pools, sitemapUrlSet, BASE180);
  assert.deepStrictEqual(result.lines, chainUrls, 'a live chain link must not be touched');
  assert.strictEqual(result.retargetedCount, 0);
  assert.strictEqual(result.omittedCount, 0);
});

test('R2 applyChainRetarget(): a DEAD chain link with a static /chains/<slug> page is retargeted there', () => {
  const pools = []; // nothing qualifies -> every chain link is dead
  const chainUrls = [`${BASE180}/?chain=Cardano`];
  const sitemapUrlSet = new Set([`${BASE180}/chains/cardano`]);
  const result = applyChainRetarget(chainUrls, pools, sitemapUrlSet, BASE180);
  assert.deepStrictEqual(result.lines, [`${BASE180}/chains/cardano`]);
  assert.strictEqual(result.retargetedCount, 1);
  assert.ok(result.retargetedUrls.has(`${BASE180}/chains/cardano`));
  assert.strictEqual(result.omittedCount, 0);
});

test('R2 applyChainRetarget(): a DEAD chain link with NO static page is omitted and counted, never silently dropped', () => {
  const pools = [];
  const chainUrls = [`${BASE180}/?chain=Abstract`];
  const sitemapUrlSet = new Set(); // no /chains/abstract page exists
  const result = applyChainRetarget(chainUrls, pools, sitemapUrlSet, BASE180);
  assert.deepStrictEqual(result.lines, [], 'no honest destination exists — the link must be omitted, not left dead');
  assert.strictEqual(result.omittedCount, 1);
  assert.deepStrictEqual(result.omittedChains, ['Abstract']);
  assert.strictEqual(result.retargetedCount, 0);
});

test('R2 applyChainRetarget(): mixed batch reproduces the measured 48/14/40-shape split independently at fixture scale', () => {
  const pools = [{ symbol: 'USDC', chain: 'LiveChain', project: 'x', tvlUsd: 20000000, apy: 4 }];
  const chainUrls = [
    `${BASE180}/?chain=LiveChain`,   // live -> unchanged
    `${BASE180}/?chain=DeadWithPage`, // dead, has a static page -> retargeted
    `${BASE180}/?chain=DeadNoPage`,   // dead, no static page -> omitted
  ];
  const sitemapUrlSet = new Set([`${BASE180}/chains/deadwithpage`]);
  const result = applyChainRetarget(chainUrls, pools, sitemapUrlSet, BASE180);
  assert.deepStrictEqual(result.lines, [`${BASE180}/?chain=LiveChain`, `${BASE180}/chains/deadwithpage`]);
  assert.strictEqual(result.retargetedCount, 1);
  assert.strictEqual(result.omittedCount, 1);
  assert.deepStrictEqual(result.omittedChains, ['DeadNoPage']);
});

// --- R3: repairMinApyLink() -------------------------------------------------
test('R3 repairMinApyLink(): a link that already resolves under both populations is left unchanged', () => {
  const url = `${BASE180}/?poolTypes=Staking&minApy=10`;
  const live = [{ symbol: 'X', chain: 'C', project: 'lido', tvlUsd: 20000000, apy: 12 }];
  const snap = [{ symbol: 'X', chain: 'C', project: 'lido', tvlUsd: 20000000, apyBase: 8, apyReward: 4 }]; // 12 total
  const result = repairMinApyLink(url, live, snap);
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.url, url);
});

test('R3 repairMinApyLink(): dead at the original rung -> repaired to the HIGHEST rung resolving >=1 pool under BOTH populations', () => {
  const url = `${BASE180}/?poolTypes=Staking&minApy=10`;
  // Highest total APY is 6 live / 6 snapshot -> minApy=10 is dead;
  // minApy=5 is the highest of [10,5,3,1] that resolves under both (6>=5).
  const live = [{ symbol: 'X', chain: 'C', project: 'lido', tvlUsd: 20000000, apy: 6 }];
  const snap = [{ symbol: 'X', chain: 'C', project: 'lido', tvlUsd: 20000000, apyBase: 4, apyReward: 2 }]; // 6 total
  const result = repairMinApyLink(url, live, snap);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.rung, 5);
  assert.strictEqual(result.url, `${BASE180}/?poolTypes=Staking&minApy=5`);
  assert.strictEqual(result.dropped, false);
  assert.strictEqual(result.omitted, false);
});

test('R3 repairMinApyLink() — Territory T2: a rung that resolves LIVE but NOT in the snapshot is rejected (this is why the check is dual-population)', () => {
  const url = `${BASE180}/?poolTypes=Staking&minApy=10`;
  // Reproduces the real 2026-07-30 case: minApy=10 clears live (apy field)
  // but not the snapshot (apyBase+apyReward) — the repair must not stop at
  // a rung the audit's own re-check (against the snapshot) would still fail.
  const live = [{ symbol: 'X', chain: 'C', project: 'lido', tvlUsd: 20000000, apy: 10.2 }];
  const snap = [{ symbol: 'X', chain: 'C', project: 'lido', tvlUsd: 20000000, apyBase: 6.0, apyReward: 0.15 }]; // 6.15 total — dead at rung 10, alive at rung 5
  const result = repairMinApyLink(url, live, snap);
  assert.strictEqual(result.changed, true, 'minApy=10 resolves live but must still be repaired because it fails the snapshot');
  assert.strictEqual(result.rung, 5, 'must skip rung 10 (live-only pass, snapshot 6.15 < 10) and land on rung 5 (snapshot 6.15 >= 5, live 10.2 >= 5)');
  assert.strictEqual(result.url, `${BASE180}/?poolTypes=Staking&minApy=5`);
});

test('R3 repairMinApyLink(): no rung resolves under both -> minApy dropped entirely', () => {
  const url = `${BASE180}/?poolTypes=Staking&minApy=10`;
  const live = [{ symbol: 'X', chain: 'C', project: 'lido', tvlUsd: 20000000, apy: 0.5 }];
  const snap = [{ symbol: 'X', chain: 'C', project: 'lido', tvlUsd: 20000000, apyBase: 0.3, apyReward: 0.1 }]; // 0.4
  const result = repairMinApyLink(url, live, snap);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.dropped, true);
  assert.strictEqual(result.omitted, false);
  assert.strictEqual(result.rung, null);
  assert.strictEqual(result.url, `${BASE180}/?poolTypes=Staking`, 'minApy param must be gone entirely, not set to 0');
});

test('R3 repairMinApyLink(): still empty even with minApy dropped -> omitted (url null)', () => {
  const url = `${BASE180}/?poolTypes=Staking&minApy=10`;
  const live = []; // no pools qualify at all, at any rung
  const snap = [];
  const result = repairMinApyLink(url, live, snap);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.omitted, true);
  assert.strictEqual(result.url, null, 'an omitted link must never leave a dangling non-null URL');
});

test('R3 repairMinApyLink(): snapshotPools unavailable (null) -> falls back to live-only validation, never throws', () => {
  const url = `${BASE180}/?poolTypes=Staking&minApy=10`;
  const live = [{ symbol: 'X', chain: 'C', project: 'lido', tvlUsd: 20000000, apy: 12 }];
  const result = repairMinApyLink(url, live, null);
  assert.strictEqual(result.changed, false, 'live-only: minApy=10 already resolves, no repair needed');
});

// --- Anti-vacuity rail 1: empty population -> gate fully disabled ----------
test('applyLinkIntegrityGate(): empty pool population -> gate disabled, output byte-identical to the un-gated baseline', () => {
  const categories = { homepage: [`${BASE180}/`], tokens: [], chains: [`${BASE180}/?chain=Cardano`], poolTypes: [], highValue: [], other: [`${BASE180}/chains/cardano`] };
  const meta = { baseUrl: BASE180, updatedAt: '2026-07-30T00:00:00.000Z', totalUrls: 2, defiLlamaFetchedAt: null };
  const baselineConcise = buildConcise(meta, categories, pickHighYield([]), analyzeYieldData([]), plannerRate([]));
  const baselineFull = buildFull(meta, categories, pickHighYield([]), analyzeYieldData([]), plannerRate([]));
  const gated = applyLinkIntegrityGate({
    pools: [], categories, meta,
    highYield: pickHighYield([]), yieldAnalysis: analyzeYieldData([]), plannerRateResult: plannerRate([]),
    sitemapUrlSet: new Set([`${BASE180}/chains/cardano`]), baseUrl: BASE180, snapshotPools: null,
  });
  assert.strictEqual(gated.applied, false);
  assert.strictEqual(gated.disabledReason, 'empty-population');
  assert.strictEqual(gated.concise, baselineConcise, 'concise output must be byte-identical to pre-180 baseline');
  assert.strictEqual(gated.full, baselineFull, 'full output must be byte-identical to pre-180 baseline');
});

// --- Anti-vacuity rail 2: >40% structural tripwire --------------------------
test('applyLinkIntegrityGate(): would-affect >40% of checked grid links -> gate disabled, non-zero exitCode, output unchanged', () => {
  const chainNames = ['Cardano', 'Celo', 'Abstract', 'Alephium', 'Boba', 'Carbon', 'Chia', 'Kasplex', 'Metis', 'Moonriver', 'Obyte', 'Rollux', 'Shape', 'Taiko', 'Telos', 'Unit0', 'Astar', 'Bifrost', 'Canto', 'Conflux'];
  const categories = {
    homepage: [`${BASE180}/`], tokens: [],
    chains: chainNames.map((c) => `${BASE180}/?chain=${c}`),
    poolTypes: [], highValue: [],
    other: [`${BASE180}/chains/cardano`, `${BASE180}/chains/celo`],
  };
  const meta = { baseUrl: BASE180, updatedAt: '2026-07-30T00:00:00.000Z', totalUrls: chainNames.length, defiLlamaFetchedAt: null };
  // Non-empty (rail 1 must NOT fire) but qualifies nothing at the $10M floor
  // -> every chain link in this fixture is dead -> way over 40% affected.
  const pools = [{ symbol: 'USDC', chain: 'SomeOtherChain', project: 'x', tvlUsd: 1, apy: 1 }];
  const highYield = pickHighYield(pools), yieldAnalysis = analyzeYieldData(pools), plannerRateResult = plannerRate(pools);
  const baselineConcise = buildConcise(meta, categories, highYield, yieldAnalysis, plannerRateResult);
  const baselineFull = buildFull(meta, categories, highYield, yieldAnalysis, plannerRateResult);

  const savedExitCode = process.exitCode;
  process.exitCode = undefined;
  const gated = applyLinkIntegrityGate({
    pools, categories, meta, highYield, yieldAnalysis, plannerRateResult,
    sitemapUrlSet: new Set(categories.other), baseUrl: BASE180, snapshotPools: null,
  });
  const trippedExitCode = process.exitCode;
  process.exitCode = savedExitCode; // never leak this test's exitCode into the suite's own

  assert.strictEqual(gated.applied, false);
  assert.strictEqual(gated.disabledReason, 'structural-tripwire');
  assert.ok(gated.stats.fraction > 0.4, `expected the fixture to exceed the 40% tripwire, got ${gated.stats.fraction}`);
  assert.strictEqual(trippedExitCode, 1, 'the tripwire must set a non-zero process.exitCode — a simulation bug must fail loudly');
  assert.strictEqual(gated.concise, baselineConcise, 'tripped gate must still emit byte-identical baseline content');
  assert.strictEqual(gated.full, baselineFull, 'tripped gate must still emit byte-identical baseline content');
});

test('applyLinkIntegrityGate(): under the 40% tripwire (today\'s real ~12%) -> gate applies, R2+R3 actually change output', () => {
  const categories = {
    homepage: [`${BASE180}/`], tokens: [],
    chains: [`${BASE180}/?chain=LiveChain`, `${BASE180}/?chain=DeadChain`],
    poolTypes: [], highValue: [],
    other: [`${BASE180}/chains/deadchain`],
  };
  const meta = { baseUrl: BASE180, updatedAt: '2026-07-30T00:00:00.000Z', totalUrls: 2, defiLlamaFetchedAt: null };
  const pools = [{ symbol: 'USDC', chain: 'LiveChain', project: 'x', tvlUsd: 20000000, apy: 4 }];
  const highYield = pickHighYield(pools), yieldAnalysis = analyzeYieldData(pools), plannerRateResult = plannerRate(pools);
  const gated = applyLinkIntegrityGate({
    pools, categories, meta, highYield, yieldAnalysis, plannerRateResult,
    sitemapUrlSet: new Set(categories.other), baseUrl: BASE180, snapshotPools: null,
  });
  assert.strictEqual(gated.applied, true);
  assert.ok(gated.full.includes(`${BASE180}/?chain=LiveChain`), 'live chain link kept');
  assert.ok(gated.full.includes(`${BASE180}/chains/deadchain`), 'dead chain retargeted to its static page');
  assert.ok(!gated.full.includes(`${BASE180}/?chain=DeadChain`), 'the dead ?chain= link itself must be gone');
});

// --- Committed-artifact leg: zero dead grid links in the REAL, regenerated
// llms.txt/llms-full.txt, checked against the committed data/pools-
// snapshot.json (deterministic, no network — the same population
// audit-app.js's own level-3 re-check reads, apyBase+apyReward). Mirrors
// audit-app.js's own below-floor skip: a link whose effective floor sits
// BELOW the snapshot's own $10M floor is indeterminate against this
// population and is not counted either way (never the class-10
// 4,233-false-positive trap). ---------------------------------------------
const SNAPSHOT_FOR_TEST_PATH = path.join(__dirname, 'data', 'pools-snapshot.json');
let snapshotForTest = null;
try {
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FOR_TEST_PATH, 'utf8'));
  if (Array.isArray(raw.pools) && typeof raw.minTvlUsd === 'number') snapshotForTest = raw;
} catch (e) { /* handled below — the test fails loudly, never passes vacuously */ }

function findDeadGridLinksAgainstSnapshot(content, snapshot) {
  const re = /https:\/\/www\.defi\.garden(\/\?[^\s]*)?/g;
  const dead = [];
  const seen = new Set();
  for (const m of content.matchAll(re)) {
    const url = m[0];
    if (seen.has(url)) continue;
    seen.add(url);
    let parsed;
    try { parsed = new URL(url); } catch (e) { continue; }
    const minTvlParam = parsed.searchParams.get('minTvl');
    const effectiveFloor = minTvlParam !== null ? (parseInt(minTvlParam, 10) || 0) : MIN_TVL_USD;
    if (effectiveFloor < snapshot.minTvlUsd) continue; // below the snapshot's own floor — indeterminate, never checked
    const result = gridLinkPoolCount(url, snapshot.pools, { apyOf: snapshotApyOf });
    if (result === null) continue; // not a grid link (?pool=, path-only, or no GRID_LINK_PARAMS)
    if (result.count === 0) dead.push(url);
  }
  return dead;
}

test('committed llms.txt: zero dead grid links against data/pools-snapshot.json (spec 180)', () => {
  assert.ok(snapshotForTest, 'data/pools-snapshot.json must load — refusing to pass vacuously without a real population');
  const dead = findDeadGridLinksAgainstSnapshot(llmsContent, snapshotForTest);
  assert.deepStrictEqual(dead, [], `expected 0 dead grid links in llms.txt, found: ${JSON.stringify(dead)}`);
});

test('committed llms-full.txt: zero dead grid links against data/pools-snapshot.json (spec 180) — was 62', () => {
  assert.ok(snapshotForTest, 'data/pools-snapshot.json must load — refusing to pass vacuously without a real population');
  const dead = findDeadGridLinksAgainstSnapshot(llmsFullContent, snapshotForTest);
  assert.deepStrictEqual(dead, [], `expected 0 dead grid links in llms-full.txt, found: ${JSON.stringify(dead)}`);
});

// --- item 188 Leg B, committed-artifact leg: A5's literal assertion over the
// REAL regenerated llms-full.txt — no "## <heading>" is immediately followed
// by a TL;DR line and then a blank line / another heading (a heading+claim
// over zero links). Specifically ## Pool Type Pages must be absent entirely
// (no ?poolTypes= URL exists anywhere in the sitemap, before or after Leg A).
test('committed llms-full.txt: "## Pool Type Pages" is absent entirely (no ?poolTypes= URL exists in the sitemap)', () => {
  assert.ok(!llmsFullContent.includes('## Pool Type Pages'), 'expected the heading to be gone, guarded by Leg B\'s new categories.poolTypes.length > 0 check');
});

test('committed llms-full.txt: no "## <heading>" is followed by a TL;DR line and then an empty/next-heading line (A5\'s literal assertion, real file)', () => {
  const lines = llmsFullContent.split('\n');
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('## ')) continue;
    const tldrLine = lines[i + 1] || '';
    if (!tldrLine.startsWith('TL;DR')) continue;
    const afterTldr = lines[i + 2] || '';
    if (afterTldr === '' || afterTldr.startsWith('## ')) violations.push(lines[i]);
  }
  assert.deepStrictEqual(violations, [], `expected zero heading+TL;DR-over-nothing sections, found: ${JSON.stringify(violations)}`);
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
