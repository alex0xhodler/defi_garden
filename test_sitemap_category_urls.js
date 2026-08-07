/* Rendered + Node-gate acceptance for backlog item 189 (specs/189.md) —
   "the sitemap's pool-type taxonomy is a stale FORK of the product's real
   classifier, so category sitemap URLs land on an empty grid".

   generate-sitemap.js used to carry its own copy of the pool-type classifier
   (4 categories, 3 short protocol lists) that disagreed with the product's
   single source of truth (getPoolTypeShared, PoolDetail.js, spec 130) on
   12.2% of pools — always in the direction of over-assigning "Yield
   Farming". That meant sitemap category URLs the fork emitted (or a token
   the fork over-filed under "Yield Farming") could render an EMPTY grid on
   the real product, because the grid itself filters with the PRODUCT
   classifier (app.js:2036's poolTypeMatch), not the fork.

   Fix (specs/189.md): generate-sitemap.js's getPoolType now delegates to the
   real getPoolTypeShared, extracted straight out of PoolDetail.js via `vm`
   at require time (Leg A); the category taxonomy grew from 4 to the
   product's real 6 categories, adding RWA and Yield Derivatives (Leg B).

   A1/A2 are rendered Playwright, fixture-routed per the test_pool_type_badge.js
   / test_category_taxonomy.js house harness (browser-originated HTTPS is
   blocked in-sandbox — 2026-07-12 standing decision) — copied verbatim
   (server, fixture routing, IGNORABLE_ERROR_PATTERN, CHROMIUM_EXECUTABLE).
   A3-A5 are pure-Node gates.

   UPDATED for item 226 (specs/226.md, 2026-08-05): generate-sitemap.js's
   EMIT_APP_VIEW_SITEMAPS now defaults to false — sitemap-category-*.xml no
   longer ships by default (Google head-curation). A1/A2/A5 still need to
   validate the underlying category-URL correctness logic the flag gates
   (this file's whole reason for existing), so they now run against a SCRATCH
   MUTANT of generate-sitemap.js with the flag forced back on
   (withAppViewEnabledSitemapModule(), below) instead of the plain import —
   never against stale committed files at repo root, which item 226 stops
   regenerating there by default.

   A1: with a fixture population containing an RWA pool (ondo), a Yield-
       Derivatives pool (pendle), a staking pool (binance-staked-eth / WBETH)
       and a lending pool, `?token=<T>&poolTypes=Yield%20Farming` for a token
       whose only pools are RWA renders ZERO pool cards (proves the dead URL
       is genuinely dead in the product, not a simulation artifact), while
       `?token=<T>&poolTypes=RWA` renders that token's pools. No page errors
       at 1280 and 360.
   A2: every category URL the REAL generateSitemapSuite() emits for the SAME
       fixture population renders >=2 pool cards — the fix must not introduce
       a new dead/thin URL of its own (188's trap).
   A3: getPoolType() returns the right category for the exact pools spec
       130's test_pool_type_badge.js locks on, and agrees with an
       independently-extracted getPoolTypeShared on 100% of the committed
       data/pools-snapshot.json population — asserted as a number.
   A4: extraction throws a named, actionable Error when PoolDetail.js can't
       be parsed (pointed at scratch files), never silently falls back.
   A5: simulating the app's real token-first filter (app.js:2020-2062) over
       the REGENERATED sitemap-category-*.xml on disk yields 0 URLs at 0
       pools and 0 URLs at 1 pool; the set includes >=1 poolTypes=RWA and
       >=1 poolTypes=Yield%20Derivatives URL; every <loc> is a well-formed
       absolute https://www.defi.garden/?token=…&poolTypes=… URL.

   Run: node test_sitemap_category_urls.js */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { chromium } = require('playwright');
const {
  generateSitemapSuite,
  getPoolType,
  extractGetPoolTypeShared,
  SITEMAP_MIN_TVL
} = require('./generate-sitemap.js');

const PORT = 8866; // distinct from every other test_* file (8791-8865 taken as of this item)
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
// A3 — Node-only: getPoolType() correctness + 100% agreement with an
// independently-extracted getPoolTypeShared on the committed snapshot.
// ---------------------------------------------------------------------------
function runA3() {
  console.log('\nA3 — getPoolType() correctness + 100% agreement with getPoolTypeShared (Node-only)');

  check('getPoolType({project:"ondo-yield-assets"}) === "RWA"',
    getPoolType({ project: 'ondo-yield-assets' }) === 'RWA');
  check('getPoolType({project:"pendle"}) === "Yield Derivatives"',
    getPoolType({ project: 'pendle' }) === 'Yield Derivatives');
  check('getPoolType({project:"sky-lending"}) === "Lending" (spec 130\'s test_pool_type_badge.js pool)',
    getPoolType({ project: 'sky-lending' }) === 'Lending');
  check('getPoolType({project:"venus-core-pool"}) === "Lending" (spec 130\'s test_pool_type_badge.js pool)',
    getPoolType({ project: 'venus-core-pool' }) === 'Lending');

  // Independent re-extraction (a SEPARATE vm.runInContext call, not the
  // module-scope cache getPoolType() itself uses) — guards against a future
  // re-fork where getPoolType silently stops tracking PoolDetail.js.
  const independentShared = extractGetPoolTypeShared();

  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  const pools = Array.isArray(raw) ? raw : (raw.pools || raw.data || []);
  check('data/pools-snapshot.json population is non-empty (precheck against a vacuous pass)', pools.length > 0,
    `pools.length: ${pools.length}`);

  let mismatches = 0;
  const mismatchDetail = [];
  for (const p of pools) {
    const a = getPoolType(p);
    const b = independentShared(p);
    if (a !== b) {
      mismatches++;
      if (mismatchDetail.length < 5) mismatchDetail.push(`${p.project}: getPoolType=${a} vs getPoolTypeShared=${b}`);
    }
  }
  check(`getPoolType() agrees with getPoolTypeShared on 100% of ${pools.length} committed pools (0 disagreements)`,
    mismatches === 0,
    `${mismatches} disagreement(s): ${mismatchDetail.join('; ')}`);
}

// ---------------------------------------------------------------------------
// A4 — Node-only: extraction throws named, actionable errors; never falls
// back to a stale/forked list.
// ---------------------------------------------------------------------------
function assertThrowsActionable(desc, path_, mustInclude) {
  let threw = false;
  let message = '';
  try {
    extractGetPoolTypeShared(path_);
  } catch (err) {
    threw = true;
    message = err.message;
  }
  const includesAll = mustInclude.every(s => message.includes(s));
  check(desc, threw && includesAll,
    threw ? `error did not name the expected anchors — got: ${message}` : 'did not throw at all (silent fallback)');
}

function runA4() {
  console.log('\nA4 — extraction fails LOUDLY on a broken PoolDetail.js, never silently falls back (Node-only)');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-category-urls-a4-'));
  try {
    assertThrowsActionable(
      'missing PoolDetail.js throws, naming the path',
      path.join(tmpDir, 'does-not-exist.js'),
      [path.join(tmpDir, 'does-not-exist.js')]
    );

    const noStartAnchor = path.join(tmpDir, 'no-start-anchor.js');
    fs.writeFileSync(noStartAnchor, 'const SOMETHING_ELSE = [];\nfunction other() { return 1; }\n');
    assertThrowsActionable(
      'PoolDetail.js missing the "const LENDING_PROTOCOLS" start anchor throws, naming both the path and the anchor',
      noStartAnchor,
      [noStartAnchor, 'const LENDING_PROTOCOLS']
    );

    const noFnAnchor = path.join(tmpDir, 'no-fn-anchor.js');
    fs.writeFileSync(noFnAnchor, 'const LENDING_PROTOCOLS = [];\nfunction somethingElse() { return 1; }\n');
    assertThrowsActionable(
      'PoolDetail.js missing the "function getPoolTypeShared" end anchor throws, naming both the path and the anchor',
      noFnAnchor,
      [noFnAnchor, 'function getPoolTypeShared']
    );

    const badSyntax = path.join(tmpDir, 'bad-syntax.js');
    fs.writeFileSync(badSyntax, 'const LENDING_PROTOCOLS = [\nfunction getPoolTypeShared(pool) { return\n}\n');
    assertThrowsActionable(
      'PoolDetail.js with a syntax error in the classifier region throws, naming the path',
      badSyntax,
      [badSyntax]
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Never a silent fallback: a throwing extractor must not return anything.
  let fallbackHappened = false;
  try {
    const fn = extractGetPoolTypeShared(path.join(os.tmpdir(), 'definitely-does-not-exist-189.js'));
    fallbackHappened = typeof fn === 'function'; // would mean it silently returned SOMETHING
  } catch (e) {
    fallbackHappened = false; // correct — threw, no fallback value returned
  }
  check('a failed extraction never returns a function (no silent fallback to old lists)', !fallbackHappened);
}

// ---------------------------------------------------------------------------
// A5 — Node-only: simulate the app's real token-first filter over the
// REGENERATED sitemap-category-*.xml files on disk, against live pool data
// (the same source generate-sitemap.js itself fetches — sandbox reaches
// yields.llama.fi via node/curl, browser-originated HTTPS does not).
// ---------------------------------------------------------------------------
function fetchLivePools() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://yields.llama.fi/pools', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (err) {
          reject(new Error('failed to parse live pools response: ' + err.message));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('live pools fetch timed out after 60s')));
  });
}

// item 226 (Google head-curation): reads from a supplied DIRECTORY, never
// ROOT — generate-sitemap.js no longer regenerates sitemap-category-*.xml at
// repo root by default (EMIT_APP_VIEW_SITEMAPS=false), so a committed copy
// there would go stale. Callers pass a scratch dir this test just regenerated
// into (see withAppViewEnabledSitemapModule() below).
function readCategoryLocsFrom(dir) {
  const files = fs.readdirSync(dir).filter(f => /^sitemap-category-.*\.xml$/.test(f));
  const locs = [];
  for (const file of files) {
    const xml = fs.readFileSync(path.join(dir, file), 'utf8');
    const matches = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)];
    for (const m of matches) locs.push({ file, loc: m[1].replace(/&amp;/g, '&') });
  }
  return { files, locs };
}

// The app's real token-first grid filter (app.js:2020-2062) for a category
// URL: substring symbol match, exact getPoolTypeShared category match,
// tvlUsd >= DEFAULT_MIN_TVL, tvlUsd > 0. SITEMAP_MIN_TVL is generate-
// sitemap.js's own copy of app.js's DEFAULT_MIN_TVL (kept in lockstep per
// its own header comment) — reused here rather than a third hardcoded $10M.
function countMatchingPools(pools, token, poolType) {
  let n = 0;
  for (const p of pools) {
    if (!p.symbol) continue;
    const hasToken = String(p.symbol).toUpperCase().includes(String(token).toUpperCase());
    if (!hasToken) continue;
    if (getPoolType(p) !== poolType) continue;
    const tvl = p.tvlUsd || 0;
    if (!(tvl >= SITEMAP_MIN_TVL) || !(tvl > 0)) continue;
    n++;
  }
  return n;
}

async function runA5() {
  console.log('\nA5 — regenerated sitemap-category-*.xml never emits a dead/thin URL (Node-only, live pool data)');

  let livePools;
  try {
    livePools = await fetchLivePools();
  } catch (err) {
    check('fetched live pool data to simulate the regenerated URLs against', false, err.message);
    console.log('  (skipping the rest of A5\'s count simulation — no live data to simulate against)');
    return;
  }
  check('live pool fetch returned a non-empty array (precheck)', Array.isArray(livePools) && livePools.length > 0,
    `got: ${Array.isArray(livePools) ? livePools.length + ' pools' : typeof livePools}`);

  // item 226: regenerate into a scratch dir via the app-view-enabled mutant
  // (see header) instead of reading committed sitemap-category-*.xml files
  // from repo root — those no longer regenerate there by default.
  const { files, locs } = await withTmpDir(async (dir) => {
    await withAppViewEnabledSitemapModule(async (mutantGs) => {
      await generateQuietly(livePools, mutantGs.generateSitemapSuite);
    });
    return readCategoryLocsFrom(dir);
  });
  check('at least one sitemap-category-*.xml file exists on disk (regeneration ran)', files.length > 0,
    `files: ${JSON.stringify(files)}`);
  check('at least one <loc> exists across all category files (precheck against a vacuous pass)', locs.length > 0,
    `locs.length: ${locs.length}`);

  // Well-formedness: every <loc> is an absolute https://www.defi.garden/?... URL
  // carrying both token and poolTypes.
  let malformed = [];
  for (const { loc } of locs) {
    try {
      const u = new URL(loc);
      const ok = u.protocol === 'https:' && u.hostname === 'www.defi.garden' &&
        u.searchParams.has('token') && u.searchParams.has('poolTypes');
      if (!ok) malformed.push(loc);
    } catch (e) {
      malformed.push(loc + ' (unparseable: ' + e.message + ')');
    }
  }
  check(`every <loc> (${locs.length} total) is a well-formed absolute https://www.defi.garden/?token=…&poolTypes=… URL`,
    malformed.length === 0, `malformed: ${JSON.stringify(malformed.slice(0, 10))}`);

  check('at least one poolTypes=RWA URL is emitted',
    locs.some(({ loc }) => new URL(loc).searchParams.get('poolTypes') === 'RWA'));
  check('at least one poolTypes=Yield Derivatives URL is emitted',
    locs.some(({ loc }) => new URL(loc).searchParams.get('poolTypes') === 'Yield Derivatives'));

  // item 226: reuse the SAME livePools fetch this function already made
  // above (the regenerated URLs must be simulated against the exact
  // population that produced them — a second, later fetch could observe
  // different live data and false-flag a URL that was correct when emitted).
  const pools = livePools;

  const zeroPool = [];
  const onePool = [];
  for (const { file, loc } of locs) {
    const u = new URL(loc);
    const token = u.searchParams.get('token');
    const poolType = u.searchParams.get('poolTypes');
    const n = countMatchingPools(pools, token, poolType);
    if (n === 0) zeroPool.push(`${file}: ${loc} (0 pools)`);
    else if (n === 1) onePool.push(`${file}: ${loc} (1 pool)`);
  }
  check(`0 of ${locs.length} regenerated category URLs render 0 pools under the real product filter`,
    zeroPool.length === 0, `${zeroPool.length} dead: ${JSON.stringify(zeroPool.slice(0, 10))}`);
  check(`0 of ${locs.length} regenerated category URLs render exactly 1 pool (below the 013 quality gate's own promise of >=2)`,
    onePool.length === 0, `${onePool.length} thin: ${JSON.stringify(onePool.slice(0, 10))}`);
}

// ---------------------------------------------------------------------------
// A1/A2 — rendered Chromium check. Fixture: 2 qualifying (>=$10M TVL) pools
// per category across all SIX product categories, so:
//   - GOLDX exists ONLY as an RWA token (drives A1's dead-Yield-Farming /
//     live-RWA pair directly, per the spec's own example),
//   - WBETH is the spec's own binance-staked-eth staking example,
//   - PDLX is Yield Derivatives (pendle), LNDX is Lending (aave-v3), LPDX is
//     LP/DEX (uniswap-v3), YFMX is unmatched -> Yield Farming (default).
// generateSitemapSuite() run against this SAME fixture (A2) derives the
// REAL emitted category URLs — never a hand-typed expected list.
// ---------------------------------------------------------------------------
const FIXTURE_POOLS = [
  // RWA — token GOLDX (A1: "a token whose only pools are RWA")
  { pool: 'rwa-1', project: 'ondo-yield-assets', symbol: 'GOLDX-USDC', chain: 'Ethereum', tvlUsd: 120_000_000, apyBase: 4.5, apyReward: 0 },
  { pool: 'rwa-2', project: 'ondo-yield-assets', symbol: 'GOLDX-DAI', chain: 'Ethereum', tvlUsd: 90_000_000, apyBase: 4.2, apyReward: 0 },
  // Yield Derivatives — token PDLX
  { pool: 'yd-1', project: 'pendle', symbol: 'PDLX-USDE', chain: 'Ethereum', tvlUsd: 80_000_000, apyBase: 6.0, apyReward: 0 },
  { pool: 'yd-2', project: 'pendle', symbol: 'PDLX-SUSDE', chain: 'Ethereum', tvlUsd: 60_000_000, apyBase: 7.5, apyReward: 0 },
  // Staking — token WBETH (spec's own binance-staked-eth example)
  { pool: 'st-1', project: 'binance-staked-eth', symbol: 'WBETH', chain: 'Ethereum', tvlUsd: 150_000_000, apyBase: 3.2, apyReward: 0 },
  { pool: 'st-2', project: 'binance-staked-eth', symbol: 'WBETH-ETH', chain: 'Ethereum', tvlUsd: 100_000_000, apyBase: 3.0, apyReward: 0 },
  // Lending — token LNDX
  { pool: 'ln-1', project: 'aave-v3', symbol: 'LNDX-USDC', chain: 'Ethereum', tvlUsd: 200_000_000, apyBase: 3.0, apyReward: 0 },
  { pool: 'ln-2', project: 'aave-v3', symbol: 'LNDX-DAI', chain: 'Ethereum', tvlUsd: 180_000_000, apyBase: 2.8, apyReward: 0 },
  // LP/DEX — token LPDX
  { pool: 'lp-1', project: 'uniswap-v3', symbol: 'LPDX-WETH', chain: 'Ethereum', tvlUsd: 70_000_000, apyBase: 8.0, apyReward: 0 },
  { pool: 'lp-2', project: 'uniswap-v3', symbol: 'LPDX-USDC', chain: 'Ethereum', tvlUsd: 65_000_000, apyBase: 7.5, apyReward: 0 },
  // Yield Farming (default, unmatched project) — token YFMX
  { pool: 'yf-1', project: 'some-random-farm', symbol: 'YFMX-CAKE', chain: 'Ethereum', tvlUsd: 40_000_000, apyBase: 12.0, apyReward: 3.0 },
  { pool: 'yf-2', project: 'some-random-farm', symbol: 'YFMX-BNB', chain: 'Ethereum', tvlUsd: 35_000_000, apyBase: 11.0, apyReward: 2.0 },
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

async function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-category-urls-'));
  const originalCwd = process.cwd();
  try {
    process.chdir(dir);
    return await fn(dir);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// `suiteFn` (item 226) lets a caller substitute a different generateSitemapSuite
// — e.g. an app-view-enabled scratch mutant's — without duplicating the
// console-suppression wrapper. Defaults to the real, imported one.
async function generateQuietly(pools, suiteFn) {
  const fn = suiteFn || generateSitemapSuite;
  const realLog = console.log;
  console.log = () => {};
  try {
    await fn(pools);
  } finally {
    console.log = realLog;
  }
}

// item 226 (Google head-curation): EMIT_APP_VIEW_SITEMAPS now defaults to
// false, so the category-sitemap family this whole file exists to validate
// no longer ships by default. This forces it on via a SCRATCH MUTANT copy of
// generate-sitemap.js — written to REPO ROOT (never touching the real file)
// so its PoolDetail.js relative require still resolves, deleted immediately
// after use — so this test keeps exercising the REAL underlying category-URL
// correctness logic the flag gates (the spec's own documented revert path),
// rather than a stale snapshot of committed sitemap-category-*.xml files.
async function withAppViewEnabledSitemapModule(fn) {
  const realPath = path.join(ROOT, 'generate-sitemap.js');
  const realSrc = fs.readFileSync(realPath, 'utf8');
  const mutatedSrc = realSrc.replace(
    'const EMIT_APP_VIEW_SITEMAPS = false;',
    'const EMIT_APP_VIEW_SITEMAPS = true;'
  );
  if (mutatedSrc === realSrc) throw new Error('withAppViewEnabledSitemapModule: EMIT_APP_VIEW_SITEMAPS anchor not found in generate-sitemap.js');
  const mutantPath = path.join(ROOT, `generate-sitemap.226-catmutant-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(mutantPath, mutatedSrc);
  try {
    delete require.cache[mutantPath];
    return await fn(require(mutantPath));
  } finally {
    delete require.cache[mutantPath];
    fs.rmSync(mutantPath, { force: true });
  }
}

// Derive the REAL emitted category-URL list by running the actual generator
// (app-view-enabled mutant, item 226) against FIXTURE_POOLS in a scratch cwd.
async function realEmittedCategoryUrls() {
  return withTmpDir(async (dir) => {
    await withAppViewEnabledSitemapModule(async (mutantGs) => {
      await generateQuietly(FIXTURE_POOLS, mutantGs.generateSitemapSuite);
    });
    const files = fs.readdirSync(dir).filter(f => /^sitemap-category-.*\.xml$/.test(f));
    const locs = [];
    for (const file of files) {
      const xml = fs.readFileSync(path.join(dir, file), 'utf8');
      const matches = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)];
      for (const m of matches) locs.push(m[1].replace(/&amp;/g, '&'));
    }
    return locs;
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

async function routeFixtures(page) {
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
  await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

async function withPage(browser, viewport, fn) {
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      pageErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
    }
  });
  await routeFixtures(page);
  try {
    await fn(page);
  } finally {
    if (pageErrors.length) {
      check(`zero non-ignorable page errors at ${viewport.width}px`, false, pageErrors.join(' | '));
    } else {
      check(`zero non-ignorable page errors at ${viewport.width}px`, true);
    }
    await page.close();
  }
}

// No single selector distinguishes "genuinely 0 cards" from "not rendered
// yet" (playbooks/product-audit.md's "Async meta reads" trap), so this waits
// for a .pool-card to appear (short timeout, ignored if it never does — the
// 0-card case) THEN a fixed settle window before the final count, mirroring
// test_sitemap_filter_urls.js's A2 non-vacuity wait for an ever-empty page.
async function cardCountFor(page, search) {
  await page.goto(`http://localhost:${PORT}/home.html${search}`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector('.pool-card', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  return await page.evaluate(() => document.querySelectorAll('.pool-card').length);
}

async function main() {
  runA3();
  runA4();
  await runA5();

  console.log('\nA1/A2 — rendered Chromium check (real generator output + hand-picked dead/live pair, live-shape fixture)');

  const emittedCategoryUrls = await realEmittedCategoryUrls();
  check('generateSitemapSuite(FIXTURE_POOLS) emitted >= 1 category URL to check (fixture must exercise something)',
    emittedCategoryUrls.length >= 1, `emitted: ${JSON.stringify(emittedCategoryUrls)}`);
  console.log('  emitted category URLs (real generator output, this fixture): ' + JSON.stringify(emittedCategoryUrls));

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // --- A1: dead-Yield-Farming vs live-RWA pair, at 1280 and 360 ----------
    await withPage(browser, { width: 1280, height: 900 }, async (page) => {
      await test('A1 @1280: ?token=GOLDX&poolTypes=Yield%20Farming renders ZERO pool cards (proves the dead URL is genuinely dead)', async () => {
        const cards = await cardCountFor(page, '?token=GOLDX&poolTypes=Yield%20Farming');
        if (cards !== 0) throw new Error(`expected 0 .pool-card, got ${cards}`);
      });
      await test('A1 @1280: ?token=GOLDX&poolTypes=RWA renders GOLDX\'s pools', async () => {
        const cards = await cardCountFor(page, '?token=GOLDX&poolTypes=RWA');
        if (cards < 1) throw new Error(`expected >=1 .pool-card, got ${cards}`);
      });
    });

    await withPage(browser, { width: 360, height: 780 }, async (page) => {
      await test('A1 @360: ?token=GOLDX&poolTypes=Yield%20Farming renders ZERO pool cards', async () => {
        const cards = await cardCountFor(page, '?token=GOLDX&poolTypes=Yield%20Farming');
        if (cards !== 0) throw new Error(`expected 0 .pool-card, got ${cards}`);
      });
      await test('A1 @360: ?token=GOLDX&poolTypes=RWA renders GOLDX\'s pools', async () => {
        const cards = await cardCountFor(page, '?token=GOLDX&poolTypes=RWA');
        if (cards < 1) throw new Error(`expected >=1 .pool-card, got ${cards}`);
      });
    });

    // --- A2: every REAL emitted category URL for this fixture renders >=2 -
    await withPage(browser, { width: 1280, height: 900 }, async (page) => {
      for (const loc of emittedCategoryUrls) {
        const search = new URL(loc).search;
        await test(`A2: ${search} renders >=2 .pool-card (no new dead/thin URL of the fix's own making)`, async () => {
          const cards = await cardCountFor(page, search);
          if (cards < 2) throw new Error(`expected >=2 .pool-card for ${search}, got ${cards}`);
        });
      }
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} test_sitemap_category_urls.js: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('test_sitemap_category_urls crashed: ' + err.message);
  process.exit(1);
});
