/* test_webmcp_rail_derivation.js — backlog 266 (spec 266 Leg D).

   Rendered acceptance for spec 266: a source-level scan
   (test_rail_predicate_derivation.js, Leg C) proves home.html's
   `search_yield_pools` tool no longer CONTAINS a hand-typed rail literal;
   this file proves the LIVE, REGISTERED tool actually BEHAVES the way the
   rails demand, driven through real Chromium (standing decision
   2026-07-11: rendered product behaviour, never unit fixtures alone).

   Real Chromium loads `/` from a locally served copy of the site (same
   `startServer`/MIME/CHROMIUM_EXECUTABLE idiom as test_smoke.js and
   test_northstar_cta_fires.js). `https://yields.llama.fi/pools` is routed to
   an in-test fixture via `page.route` — browser-originated external HTTPS is
   BLOCKED in this sandbox (standing decision 2026-07-12), so this test never
   depends on real network. The tool under test is invoked the way an agent
   actually would: read off `window.navigator.modelContext.tools`, found by
   `name === 'search_yield_pools'`, its `execute` called in-page.

   Rail values are read from trust-rails.js IN NODE, at test time (never
   100000/1000 hardcoded here) and used to build every fixture pool relative
   to them — `DEFAULT_MIN_TVL - 1` / exactly `DEFAULT_MIN_TVL`, and the two
   defect-3 pools' APY figures as multiples of `APY_SANITY_LIMIT` — so this
   test still means the same thing if either rail value ever changes (spec
   266's non-vacuity mutation 4 exercises exactly this: it sets
   DEFAULT_MIN_TVL to 250000 and expects this file to STAY GREEN, because
   both the page and this test derive from the same source, and additionally
   checks the page's admission behaviour actually moved with it).

   Run: node test_webmcp_rail_derivation.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const { DEFAULT_MIN_TVL, APY_SANITY_LIMIT } = require('./trust-rails.js');

const PORT = 8982; // distinct from every other test_*.js PORT in this repo (see test_northstar_cta_fires.js's own note)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|unpkg|Failed to load resource/i;

// ---------------------------------------------------------------------------
// Fixture pools — every threshold-adjacent figure derived from trust-rails.js
// at test time, never a re-typed 100000/1000.
// ---------------------------------------------------------------------------

const BELOW_FLOOR_POOL = {
  pool: 'below-floor-pool', project: 'testproj', symbol: 'USDC', chain: 'Ethereum',
  tvlUsd: DEFAULT_MIN_TVL - 1, apyBase: 5, apyReward: 0, apy: 5,
};
const AT_FLOOR_POOL = {
  pool: 'at-floor-pool', project: 'testproj', symbol: 'USDC', chain: 'Ethereum',
  tvlUsd: DEFAULT_MIN_TVL, apyBase: 5, apyReward: 0, apy: 5,
};
// Defect 3 (spec 266 Evidence #3): a pool whose upstream `apy` field is LOW
// (would have slipped past the OLD `p.apy > 1000` check) but whose real
// railed quantity (apyBase+apyReward) is well over APY_SANITY_LIMIT — must
// be EXCLUDED under the fixed logic. apyBase/apyReward are each 0.9x the
// limit so their sum is 1.8x it (1800% when APY_SANITY_LIMIT=1000, matching
// spec 266's own acceptance-criteria fixture numbers exactly, but computed
// from the live constant rather than re-typed).
const DEFECT3_APY_HALF = Math.round(APY_SANITY_LIMIT * 0.9);
const DEFECT3_EXCLUDED_POOL = {
  pool: 'defect3-excluded-pool', project: 'testproj', symbol: 'USDC', chain: 'Ethereum',
  tvlUsd: DEFAULT_MIN_TVL * 100, apyBase: DEFECT3_APY_HALF, apyReward: DEFECT3_APY_HALF, apy: 5,
};
// Mirror case: upstream `apy` field is HIGH (would have been wrongly
// rejected by the OLD `p.apy > 1000` check) but the real railed quantity is
// small — must be INCLUDED, and the tool must RETURN the computed total
// (5), never the stale upstream field (2x the limit, matching spec 266's
// own "apy: 2000" acceptance-criteria number when APY_SANITY_LIMIT=1000).
const DEFECT3_INCLUDED_POOL = {
  pool: 'defect3-included-pool', project: 'testproj', symbol: 'USDC', chain: 'Ethereum',
  tvlUsd: DEFAULT_MIN_TVL * 100, apyBase: 5, apyReward: 0, apy: APY_SANITY_LIMIT * 2,
};

const FIXTURE_POOLS = [BELOW_FLOOR_POOL, AT_FLOOR_POOL, DEFECT3_EXCLUDED_POOL, DEFECT3_INCLUDED_POOL];
const FIXTURE_BODY = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'home.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

/** Calls the LIVE registered `search_yield_pools` tool's `execute` in-page
 * (found by name off `window.navigator.modelContext.tools`, exactly how an
 * agent would reach it — never a re-implementation of the filter logic
 * here) and returns its resolved `{ success, results }` payload. */
async function callSearchYieldPools(page, args) {
  return page.evaluate(async (toolArgs) => {
    const tools = (window.navigator.modelContext && window.navigator.modelContext.tools) || [];
    const tool = tools.find((t) => t.name === 'search_yield_pools');
    if (!tool) throw new Error('search_yield_pools tool not found on window.navigator.modelContext.tools');
    return tool.execute(toolArgs || {});
  }, args || {});
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
        pageErrors.push('console.error: ' + m.text());
    });

    await page.route('https://icons.llamao.fi/**', (r) => r.abort());
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_BODY }));

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });

    await test('window.TRUST_RAILS on the live page matches the values read from trust-rails.js in Node (sanity: same source)', async () => {
      const rails = await page.evaluate(() => ({
        DEFAULT_MIN_TVL: window.TRUST_RAILS && window.TRUST_RAILS.DEFAULT_MIN_TVL,
        APY_SANITY_LIMIT: window.TRUST_RAILS && window.TRUST_RAILS.APY_SANITY_LIMIT,
      }));
      if (rails.DEFAULT_MIN_TVL !== DEFAULT_MIN_TVL) throw new Error(`page window.TRUST_RAILS.DEFAULT_MIN_TVL=${rails.DEFAULT_MIN_TVL}, Node trust-rails.js says ${DEFAULT_MIN_TVL}`);
      if (rails.APY_SANITY_LIMIT !== APY_SANITY_LIMIT) throw new Error(`page window.TRUST_RAILS.APY_SANITY_LIMIT=${rails.APY_SANITY_LIMIT}, Node trust-rails.js says ${APY_SANITY_LIMIT}`);
    });

    await test('the search_yield_pools tool is actually registered on window.navigator.modelContext.tools', async () => {
      const names = await page.evaluate(() => ((window.navigator.modelContext && window.navigator.modelContext.tools) || []).map((t) => t.name));
      if (!names.includes('search_yield_pools')) throw new Error(`search_yield_pools not found among registered tools: ${JSON.stringify(names)}`);
    });

    let result;
    await test('calling the live tool succeeds and returns a results array', async () => {
      result = await callSearchYieldPools(page, {});
      if (!result || result.success !== true) throw new Error(`expected success:true, got ${JSON.stringify(result)}`);
      if (!Array.isArray(result.results)) throw new Error(`expected results to be an array, got ${JSON.stringify(result)}`);
    });

    function findResult(poolId) {
      return result.results.find((r) => r.pool === poolId);
    }

    await test(`a pool $1 below DEFAULT_MIN_TVL (${DEFAULT_MIN_TVL - 1}) is EXCLUDED — no numeric rail literal, source reads window.TRUST_RAILS`, () => {
      if (findResult(BELOW_FLOOR_POOL.pool)) throw new Error(`below-floor pool (tvlUsd=${BELOW_FLOOR_POOL.tvlUsd}) was wrongly included: ${JSON.stringify(findResult(BELOW_FLOOR_POOL.pool))}`);
    });

    await test(`a pool at EXACTLY DEFAULT_MIN_TVL (${DEFAULT_MIN_TVL}) is INCLUDED`, () => {
      if (!findResult(AT_FLOOR_POOL.pool)) throw new Error(`at-floor pool (tvlUsd=${AT_FLOOR_POOL.tvlUsd}) was wrongly excluded from: ${JSON.stringify(result.results)}`);
    });

    await test('defect 3, direction 1: apy:5 but apyBase+apyReward over APY_SANITY_LIMIT is EXCLUDED (the old apy-field check would have admitted it)', () => {
      if (findResult(DEFECT3_EXCLUDED_POOL.pool)) throw new Error(`defect-3-excluded pool (apyBase=${DEFECT3_EXCLUDED_POOL.apyBase}, apyReward=${DEFECT3_EXCLUDED_POOL.apyReward}, upstream apy=${DEFECT3_EXCLUDED_POOL.apy}) was wrongly included: ${JSON.stringify(findResult(DEFECT3_EXCLUDED_POOL.pool))}`);
    });

    await test(`defect 3, direction 2: apy:${DEFECT3_INCLUDED_POOL.apy} but apyBase+apyReward well under APY_SANITY_LIMIT is INCLUDED (the old apy-field check would have rejected it)`, () => {
      if (!findResult(DEFECT3_INCLUDED_POOL.pool)) throw new Error(`defect-3-included pool was wrongly excluded from: ${JSON.stringify(result.results)}`);
    });

    await test('the returned `apy` equals apyBase+apyReward, never the stale upstream `apy` field', () => {
      const atFloor = findResult(AT_FLOOR_POOL.pool);
      if (!atFloor) throw new Error('at-floor pool missing from results — cannot check its apy');
      const expectedAtFloor = AT_FLOOR_POOL.apyBase + AT_FLOOR_POOL.apyReward;
      if (atFloor.apy !== expectedAtFloor) throw new Error(`at-floor pool: expected returned apy=${expectedAtFloor} (apyBase+apyReward), got ${atFloor.apy}`);

      const defect3 = findResult(DEFECT3_INCLUDED_POOL.pool);
      if (!defect3) throw new Error('defect-3-included pool missing from results — cannot check its apy');
      const expectedDefect3 = DEFECT3_INCLUDED_POOL.apyBase + DEFECT3_INCLUDED_POOL.apyReward;
      if (defect3.apy !== expectedDefect3) throw new Error(`defect-3-included pool: expected returned apy=${expectedDefect3} (apyBase+apyReward), NOT the stale upstream apy=${DEFECT3_INCLUDED_POOL.apy} — got ${defect3.apy}`);
      if (defect3.apy === DEFECT3_INCLUDED_POOL.apy) throw new Error('defect-3-included pool: returned apy equals the stale upstream field — the tool is still railing the wrong quantity');
    });

    await test('the minApy filter operates on apyBase+apyReward, not the upstream apy field', async () => {
      // A minApy set ABOVE the upstream apy field but BELOW the true total
      // must still admit defect3-included-pool (total apy=5 < any sane
      // minApy here would exclude it if it worked on the wrong field the
      // OTHER way — so instead: set minApy just above the true total (5) and
      // below the stale upstream field (2000), and confirm it now excludes
      // the pool on the TRUE total, proving the filter reads the same
      // computed quantity the tool returns, not the upstream apy field.
      const trueTotal = DEFECT3_INCLUDED_POOL.apyBase + DEFECT3_INCLUDED_POOL.apyReward;
      const aboveTrueTotal = await callSearchYieldPools(page, { minApy: trueTotal + 1 });
      const stillThere = aboveTrueTotal.results.find((r) => r.pool === DEFECT3_INCLUDED_POOL.pool);
      if (stillThere) throw new Error(`minApy=${trueTotal + 1} (just above the TRUE total ${trueTotal}) should have excluded defect-3-included-pool, but it is still present: ${JSON.stringify(stillThere)} — minApy is filtering on the wrong quantity`);
    });

    await test('no unexpected page/console errors', () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\ntest_webmcp_rail_derivation.js: ${passed} tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
