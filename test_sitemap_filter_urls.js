/* Rendered acceptance gate for backlog item 188 (specs/188.md) — "the 7
   filter URLs we submit to Google are homepage duplicates that can never
   render a grid". Proven in code: app.js:2010-2013's token-first mode has an
   early return (`if (!selectedToken) { setFilteredPools([]); return; }`), so
   a filter-only query (`?minTvl=`/`?minApy=` with no token, no chain) never
   reaches a branch that populates filteredPools — every one of the seven
   hardcoded URLs `generate-sitemap.js` used to emit rendered the same empty
   search hero as `/`.

   generate-sitemap.js now emits gated `?chain=All&...` equivalents instead —
   the app's own token-less chain-first browse mode (app.js:1837/1843's
   `chainMatch = selectedChain === 'All' || ...`), which DOES render a real
   grid. A rung only earns a <loc> once >= SITEMAP_MIN_QUALIFYING_POOLS pools
   clear its own effective filter (countQualifyingChainAll() in
   generate-sitemap.js).

   This test drives the REAL rendered app in Chromium — never fixtures of a
   parser function (house rule: product-loop-kit/playbooks/product-audit.md's
   fixture traps + the 018 postmortem it cites — a prior spec asserted only
   against extracted parser return values while the actual product stayed
   broken because nothing ever mounted a browser). Live-shape fixture routed
   via page.route per NORTH_STAR 2026-07-12 / product-audit.md: browser-
   originated HTTPS to yields.llama.fi is proxy-blocked in this sandbox, so
   the LIVE endpoint is served the LIVE shape `{status:'success', data:[…]}`
   (playbooks/product-audit.md's fixture-trap section — the snapshot shape
   `{pools:[…]}` would silently read `data.data` -> undefined -> false
   "0 results", a fabricated finding, not this bug).

   A1: for EVERY filter URL generate-sitemap.js's REAL gate emits for a fixed
       fixture population (derived by actually running generateSitemapSuite()
       against the fixture below — never a hand-typed expected list, so this
       test tracks the generator's real behavior), >=1 .pool-card renders and
       <meta name="robots"> is never noindex.
   A2: non-vacuity — the SAME fixture, navigated at the PRE-FIX URL shape
       (?minApy=5, no chain — the literal shape generate-sitemap.js used to
       emit) renders 0 pool cards. This is exactly what makes the test able
       to go red: reverting generate-sitemap.js's chain=All emission (or
       simply asking the pre-fix question) reproduces this failure mode.
   A3: the gate really gates — two Node-only (no browser) checks that a rung
       with < SITEMAP_MIN_QUALIFYING_POOLS qualifying pools is ABSENT from
       the emitted sitemap-main.xml and a rung with >= 2 is PRESENT,
       including a pool that qualifies ONLY via apyReward (apyBase=0) to
       prove the apyBase+apyReward semantics, not the raw `apy` field.

   Run: node test_sitemap_filter_urls.js */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');
const { generateSitemapSuite } = require('./generate-sitemap.js');

const PORT = 8793;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); }
}

// ---------------------------------------------------------------------------
// A3 — Node-only: the gate really gates. Two isolated fixture populations,
// each run through the REAL generateSitemapSuite() in a scratch cwd, so this
// exercises the shipped generator code path, never a re-implementation of
// its logic.
// ---------------------------------------------------------------------------
async function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-filter-urls-'));
  const originalCwd = process.cwd();
  try {
    process.chdir(dir);
    return await fn(dir); // MUST await — fn is async (calls generateSitemapSuite), and
    // the finally block below deletes `dir` and restores cwd; without
    // awaiting, both would run before the generator finished writing files.
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Suppresses ONLY the generator's own console.log noise, never this test's
// own check()/test() output — deliberately narrower than wrapping the whole
// withTmpDir callback, which would (and, in an earlier version of this file,
// did) silently swallow this test's own passing assertions along with it.
async function generateQuietly(pools) {
  const realLog = console.log;
  console.log = () => {};
  try {
    await generateSitemapSuite(pools);
  } finally {
    console.log = realLog;
  }
}

function mainSitemapLocs(dir) {
  const xml = fs.readFileSync(path.join(dir, 'sitemap-main.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
}

async function runA3() {
  console.log('\nA3 — the gate really gates (Node-only, generateSitemapSuite())');

  // Population where minApy=20 has exactly 1 qualifying pool (< the gate's
  // SITEMAP_MIN_QUALIFYING_POOLS=2) and minApy=10 has exactly 2 — one of
  // which (a2) qualifies ONLY through apyReward (apyBase=0), proving the
  // gate reads apyBase+apyReward, not a raw `apy` field neither this fixture
  // nor the generator's pool shape even carries. A minApy=20 qualifier is
  // NECESSARILY also a minApy=10 qualifier (22 >= 10), so b1 alone would
  // already put minApy=10 at 1 — a2 is what tips it to exactly 2, which is
  // what the third check below proves by removing it.
  const pools = [
    { pool: 'b1', chain: 'Arbitrum', project: 'gmx', symbol: 'GMX', tvlUsd: 60_000_000, apyBase: 22, apyReward: 0 }, // the sole minApy=20 qualifier; also counts toward minApy=10
    { pool: 'a2', chain: 'Base', project: 'compound-v3', symbol: 'USDT', tvlUsd: 40_000_000, apyBase: 0, apyReward: 11 }, // apyReward-only — the SECOND minApy=10 qualifier
    { pool: 'a4', chain: 'Solana', project: 'kamino-lend', symbol: 'SOL', tvlUsd: 30_000_000, apyBase: 3, apyReward: 0 }, // qualifies neither rung
  ];

  await withTmpDir(async (dir) => {
    await generateQuietly(pools);
    const locs = mainSitemapLocs(dir);

    check(
      'minApy=20 (1 qualifying pool, below SITEMAP_MIN_QUALIFYING_POOLS=2) is ABSENT from sitemap-main.xml',
      !locs.some(l => l.includes('minApy=20')),
      `locs: ${JSON.stringify(locs)}`
    );
    check(
      'minApy=10 (2 qualifying pools, ONE of them apyReward-only) is PRESENT in sitemap-main.xml',
      locs.includes('https://www.defi.garden/?chain=All&minApy=10'),
      `locs: ${JSON.stringify(locs)}`
    );
    // Sanity: the apyReward-only pool (a2) really is what tips minApy=10 over
    // the gate — remove it and confirm minApy=10 drops out too, so the
    // "present" assertion above isn't accidentally satisfied some other way.
    const poolsWithoutRewardOnly = pools.filter(p => p.pool !== 'a2');
    fs.rmSync('sitemap-main.xml', { force: true });
    fs.rmSync('sitemap.xml', { force: true });
    await generateQuietly(poolsWithoutRewardOnly);
    const locsWithout = mainSitemapLocs(dir);
    check(
      'removing the apyReward-only qualifier drops minApy=10 back below the gate (proves apyReward alone was load-bearing)',
      !locsWithout.some(l => l.includes('minApy=10')),
      `locs: ${JSON.stringify(locsWithout)}`
    );
  });
}

// ---------------------------------------------------------------------------
// A1/A2 — rendered Chromium check.
// ---------------------------------------------------------------------------

// DefiLlama live-shape fixture. Deliberately crafted so the REAL gate
// (countQualifyingChainAll(), generate-sitemap.js) both emits several rungs
// and drops several others for THIS SAME fixture — proving the browser test
// exercises the generator's real, gated output, not a hand-picked "always
// works" set.
const FIXTURE_POOLS = [
  { pool: 'p1', chain: 'Base', project: 'aave-v3', symbol: 'USDC', tvlUsd: 45_000_000, apyBase: 4.2, apyReward: 0, apy: 4.2 },
  { pool: 'p2', chain: 'Arbitrum', project: 'radiant', symbol: 'USDT', tvlUsd: 30_000_000, apyBase: 3.0, apyReward: 0, apy: 3.0 },
  { pool: 'p3', chain: 'Ethereum', project: 'lido', symbol: 'ETH', tvlUsd: 250_000_000, apyBase: 3.0, apyReward: 0, apy: 3.0 },
  { pool: 'p4', chain: 'Base', project: 'compound-v3', symbol: 'WBTC', tvlUsd: 90_000_000, apyBase: 15.0, apyReward: 0, apy: 15.0 },
  { pool: 'p5', chain: 'Arbitrum', project: 'gmx', symbol: 'GMX', tvlUsd: 95_000_000, apyBase: 22.0, apyReward: 0, apy: 22.0 },
  { pool: 'p6', chain: 'Ethereum', project: 'curve-dex', symbol: 'CRV', tvlUsd: 1_500_000, apyBase: 8.0, apyReward: 0, apy: 8.0 },
  { pool: 'p7', chain: 'Solana', project: 'kamino-lend', symbol: 'SOL', tvlUsd: 2_000_000, apyBase: 9.0, apyReward: 0, apy: 9.0 },
  { pool: 'p8', chain: 'Arbitrum', project: 'camelot-v3', symbol: 'ARB', tvlUsd: 22_000_000, apyBase: 0, apyReward: 13.0, apy: 13.0 },
  { pool: 'p9', chain: 'Ethereum', project: 'sushiswap', symbol: 'DAI', tvlUsd: 500_000, apyBase: 9.0, apyReward: 0, apy: 9.0 }, // below every TVL rung
  { pool: 'p10', chain: 'Fantom', project: 'somechain', symbol: 'FOO-BAR', tvlUsd: 50_000_000, apyBase: 1500, apyReward: 0, apy: 1500 }, // anomalous, must be excluded
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// Derive the REAL emitted filter-URL list by running the actual generator
// against FIXTURE_POOLS in a scratch cwd — never a hand-typed expected list.
async function realEmittedFilterUrls() {
  return withTmpDir(async (dir) => {
    await generateQuietly(FIXTURE_POOLS);
    const locs = mainSitemapLocs(dir);
    return locs.filter(l => l.includes('chain=All'));
  });
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

async function routeFixture(page) {
  const nodeModules = path.join(ROOT, 'node_modules');
  const vendored = {
    'https://unpkg.com/react@18/umd/react.production.min.js':
      path.join(nodeModules, 'react/umd/react.production.min.js'),
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js':
      path.join(nodeModules, 'react-dom/umd/react-dom.production.min.js'),
    'https://unpkg.com/@babel/standalone/babel.min.js':
      path.join(nodeModules, '@babel/standalone/babel.min.js')
  };
  for (const [url, localPath] of Object.entries(vendored)) {
    await page.route(url, (route) => route.fulfill({
      status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath)
    }));
  }
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  // Force the LIVE fetch path (never the snapshot-first path — spec 059) so
  // the test exercises the same code path a real crawler landing on one of
  // these sitemap URLs would hit.
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  // LIVE shape per playbooks/product-audit.md's fixture-trap section:
  // {status:'success', data:[…]} — the snapshot shape {pools:[…]} would make
  // the live loader read `data.data` -> undefined -> a fabricated "0 results".
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

// Poll up to ~10s: the 012 noindex meta and filteredPools both land after a
// babel-standalone compile + data-fetch + effect pass, so a single
// point-in-time read can false-negative (playbooks/product-audit.md's
// "Async meta reads" trap).
async function pollUntil(page, fn, { timeoutMs = 10000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    last = await page.evaluate(fn);
    if (last.ok) return last;
    if (Date.now() > deadline) return last;
    await page.waitForTimeout(intervalMs);
  }
}

async function main() {
  await runA3();

  console.log('\nA1/A2 — rendered Chromium check (real generator output, live-shape fixture)');

  const emittedUrls = await realEmittedFilterUrls();
  check('generateSitemapSuite(FIXTURE_POOLS) emitted >= 1 filter URL to check (fixture must exercise something)', emittedUrls.length >= 1,
    `emitted: ${JSON.stringify(emittedUrls)}`);
  check('generateSitemapSuite(FIXTURE_POOLS) also DROPPED >= 1 rung for this same fixture (proves the gate is live, not a no-op)',
    emittedUrls.length < 7, // 7 = the pre-fix hardcoded rung count; a gate that never drops would emit all combinations
    `emitted: ${JSON.stringify(emittedUrls)}`);
  console.log('  emitted filter URLs (real generator output, this fixture): ' + JSON.stringify(emittedUrls));

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const source = msg.location()?.url || '';
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        pageErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });
    await routeFixture(page);

    // --- A1: every filter URL generate-sitemap.js's REAL gate emits -------
    for (const loc of emittedUrls) {
      const search = new URL(loc).search; // e.g. "?chain=All&minApy=10"
      await test(`A1: ${search} renders >=1 .pool-card and <meta robots> is not noindex`, async () => {
        await page.goto(`http://localhost:${PORT}/home.html${search}`, { waitUntil: 'load', timeout: 20000 });
        const result = await pollUntil(page, () => {
          const cards = document.querySelectorAll('.pool-card').length;
          const robots = document.querySelector('meta[name="robots"]');
          const robotsContent = robots ? robots.getAttribute('content') : null;
          return { ok: cards >= 1 && robotsContent !== 'noindex', cards, robotsContent };
        });
        assert.ok(result.cards >= 1, `expected >=1 .pool-card for ${search}, got ${result.cards}`);
        assert.notStrictEqual(result.robotsContent, 'noindex', `expected <meta robots> not noindex for ${search}, got "${result.robotsContent}"`);
      });
    }

    // --- A2: non-vacuity — the PRE-FIX URL shape must still render 0 cards -
    // Same fixture, same server, same routing; only the URL shape reverts to
    // what generate-sitemap.js emitted before this fix. This is exactly what
    // makes A1 non-vacuous: if generate-sitemap.js's chain=All emission were
    // reverted (or this test pointed at the OLD shape), A1's assertions
    // above would fail exactly the way this one now passes.
    await test('A2 (non-vacuity): the PRE-FIX shape "?minApy=5" (no chain) renders 0 .pool-card — proves this test can go RED', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?minApy=5`, { waitUntil: 'load', timeout: 20000 });
      // No polling needed for "stays empty forever" — app.js:2010-2013's
      // token-first early return means filteredPools never populates for a
      // chain-less, token-less query; wait a fixed settle window instead and
      // assert the state never changed. A poll-for-truthy here would be
      // testing nothing (an ever-empty condition is trivially "eventually
      // true"), so this one deliberately waits, not polls.
      await page.waitForTimeout(2500);
      const cards = await page.locator('.pool-card').count();
      assert.strictEqual(cards, 0, `expected 0 .pool-card for the pre-fix "?minApy=5" shape, got ${cards}`);
    });

    if (pageErrors.length) {
      check('no unexpected page/console errors during the run', false, pageErrors.join(' | '));
    } else {
      check('no unexpected page/console errors during the run', true);
    }

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} test_sitemap_filter_urls.js: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('test_sitemap_filter_urls crashed: ' + err.message);
  process.exit(1);
});
