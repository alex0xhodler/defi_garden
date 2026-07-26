/* Rendered Playwright test for backlog 147 — ship the minified bundles the
   site already builds. `home.html` (translations.js/planner.js) and
   `plan.html` (planner.js) were swapped to load `translations.min.js` /
   `planner.min.js` instead of the raw sources. `test_minified_assets.js`
   only proves the committed `.min.` files are byte-fresh and that the two
   HTML files' `src=` attributes were swapped — it never boots a browser, so
   it cannot prove the minified bundle actually EXECUTES (terser runs with
   `mangle: true` but `toplevel` unset — minify-assets.js:30 — so this should
   be behavior-neutral, but "should be" is an assumption, not proof).

   This test proves, against REAL chromium renders of the REAL static files
   (not source reading):
   (1) plan.html requests planner.min.js and NEVER planner.js, and the
       planner's first screen (goal chips) renders and an interactive step
       (picking a goal) actually completes — proving the minified bundle
       executes, not merely loads;
   (2) home.html, routed into planner mode via the IA router's __APP_MODE
       (PLANNER_PARAMS, home.html's inline router script), does the same
       PLUS requests translations.min.js and never translations.js. NOTE:
       "bare /" with zero query params currently resolves to __APP_MODE
       'landing' (search-first landing, `landing.js`), not 'planner' — this
       is documented, pre-existing IA drift (product-loop-kit/LOG.md
       2026-07-15 build 114 finding: "bare / is now a SEARCH-FIRST landing
       ... no longer the planner"; CLAUDE.md is flagged stale on this point,
       human-owned, not edited here) and entirely out of this item's scope
       (three `src` swaps only). `/?fresh=1` is the minimal PLANNER_PARAMS
       key that reaches the router's planner branch on home.html (the file
       under test) without decoding a shared-plan URL or a saved localStorage
       plan, so it is used here as the "planner via home.html's router"
       stand-in for the spec's "bare /" wording;
   (3) /?pool=<id> (the north-star surface) renders pool-detail with BOTH
       CTAs ("Garden this pool" + "Start Earning on <protocol>"), while the
       document requested translations.min.js + planner.min.js (never the
       raw sources);
   (4) /?token=USDC still renders pool cards — the sacred SEO/analytics path
       — same request-level proof;
   (5) ?lang=ko on the planner (plan.html) renders Korean copy, proving
       translations.min.js carries the full KO dictionary end to end;
   (6) zero unexpected page/console errors across every render above.

   House pattern (test_repeat_cta.js / test_northstar_cta_fires.js): local
   http static server over the repo root, chromium at
   /opt/pw-browsers/chromium when present, fixture-routed yields.llama.fi +
   aborted decorative/analytics hosts, IGNORABLE console/page-error filter,
   test() helper printing checkmarks and setting process.exitCode. React/Babel
   are NOT fetched from unpkg here — home.html/plan.html vendor React locally
   (./react.production.min.js, ./react-dom.production.min.js) and load only
   already-compiled artifacts (no @babel/standalone), so no CDN routing is
   needed for those two files (unlike older tests written before backlog 052).

   Non-vacuity (spec AC8): stashing this item's home.html/plan.html changes
   and re-running this file must fail the request-level assertions — recorded
   verbatim in specs/147-notes.md, not asserted here (a self-disabling check
   would defeat the point of a stash-baseline proof).

   Run: node test_min_asset_boot.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8862; // distinct from other test_* files (8791-8861 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|google\.com\/s2\/favicons|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — same id test_repeat_cta.js / test_northstar_cta_fires.js use
// for their url_direct (`?pool=<id>`) landing, reused here (not read live)
// so the fixture stays byte-stable regardless of snapshot regeneration
// cadence. Verified present in the snapshot below before the test runs.
const POOL = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  project: 'lido', symbol: 'STETH', chain: 'Ethereum',
  tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const TOKEN_POOL = {
  pool: 'usdc-base-aave-test', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
  tvlUsd: 45_000_000, apyBase: 4.2, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [POOL, TOKEN_POOL] });

let passed = 0;
const TOTAL = 18;
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

// Registers request/error tracking on a fresh page and fixture-routes the
// external hosts every render touches. Returns { paths, errors } — `paths`
// collects every same-origin request's pathname (exact string, so
// "planner.min.js" can never accidentally satisfy an assertion looking for
// the raw "planner.js"), `errors` collects unexpected page/console errors.
async function preparePage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const paths = [];
  const errors = [];
  page.on('request', (req) => {
    try {
      const u = new URL(req.url());
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') paths.push(u.pathname);
    } catch (e) { /* ignore malformed URLs */ }
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
      errors.push('console.error: ' + m.text());
  });
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());
  await page.route('https://www.google.com/s2/**', (r) => r.abort());
  await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
  await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));
  return { page, paths, errors };
}

// Exact-pathname assertions — never substring, so ".min.js" can't accidentally
// satisfy a check looking for the raw file.
function assertMinNotRaw(paths, minFile, rawFile, label) {
  if (!paths.includes('/' + minFile)) throw new Error(`${label}: expected a request for /${minFile}, got: ${JSON.stringify(paths)}`);
  if (paths.includes('/' + rawFile)) throw new Error(`${label}: expected NO request for raw /${rawFile}, but it was requested`);
}

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL.pool)) {
    throw new Error(`POOL.pool ${POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // --- (1) plan.html boots the planner from planner.min.js ---
    {
      const { page, paths, errors } = await preparePage(browser);
      await page.goto(`http://localhost:${PORT}/plan.html`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.gp-question', { timeout: 15000 });

      await test('plan.html requests planner.min.js and never planner.js', async () => {
        assertMinNotRaw(paths, 'planner.min.js', 'planner.js', 'plan.html');
      });

      await test('plan.html: goal chips render on the planner\'s first screen', async () => {
        const chipCount = await page.locator('.gp-chip').count();
        if (chipCount === 0) throw new Error('expected at least one .gp-chip on the first screen');
      });

      await test('plan.html: picking a goal chip completes an interactive step (thread row appears)', async () => {
        await page.locator('.gp-chip').first().click();
        await page.waitForSelector('.gp-thread-row', { timeout: 10000 });
      });

      await test('plan.html: no unexpected page/console errors', async () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });
      await page.close();
    }

    // --- (2) home.html routed into planner mode (__APP_MODE via PLANNER_PARAMS) ---
    // See the file-header note: bare "/" alone is 'landing' mode (documented
    // IA drift, out of this item's scope). /?fresh=1 is the minimal
    // PLANNER_PARAMS key that reaches the router's planner branch on
    // home.html — the file whose translations.js/planner.js src this item
    // swapped — without decoding a shared plan or loading a saved one.
    {
      const { page, paths, errors } = await preparePage(browser);
      await page.goto(`http://localhost:${PORT}/home.html?fresh=1`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.gp-question', { timeout: 15000 });

      await test('home.html?fresh=1 (planner mode) requests planner.min.js and never planner.js', async () => {
        assertMinNotRaw(paths, 'planner.min.js', 'planner.js', 'home.html?fresh=1');
      });

      await test('home.html?fresh=1 requests translations.min.js and never translations.js', async () => {
        assertMinNotRaw(paths, 'translations.min.js', 'translations.js', 'home.html?fresh=1');
      });

      await test('home.html?fresh=1: goal chips render on the planner\'s first screen', async () => {
        const chipCount = await page.locator('.gp-chip').count();
        if (chipCount === 0) throw new Error('expected at least one .gp-chip on the first screen');
      });

      await test('home.html?fresh=1: picking a goal chip completes an interactive step (thread row appears)', async () => {
        await page.locator('.gp-chip').first().click();
        await page.waitForSelector('.gp-thread-row', { timeout: 10000 });
      });

      await test('home.html?fresh=1: no unexpected page/console errors', async () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });
      await page.close();
    }

    // --- (3) /?pool=<id> — the north-star surface ---
    {
      const { page, paths, errors } = await preparePage(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

      await test('/?pool=<id> requests translations.min.js + planner.min.js, never the raw sources', async () => {
        assertMinNotRaw(paths, 'translations.min.js', 'translations.js', '/?pool=<id>');
        assertMinNotRaw(paths, 'planner.min.js', 'planner.js', '/?pool=<id>');
      });

      await test('/?pool=<id> renders both north-star CTAs ("Garden this pool" + "Start Earning on <protocol>")', async () => {
        const gardenCta = await page.locator('.cta-button-primary').first().innerText();
        if (!/Garden this pool/i.test(gardenCta)) throw new Error(`expected "Garden this pool" CTA text, got: ${gardenCta}`);
        const protocolCtaCount = await page.locator('.cta-button-protocol').count();
        if (protocolCtaCount === 0) throw new Error('expected a .cta-button-protocol CTA to render');
        const protocolCta = await page.locator('.cta-button-protocol').first().innerText();
        if (!/Start Earning on/i.test(protocolCta)) throw new Error(`expected "Start Earning on <protocol>" CTA text, got: ${protocolCta}`);
      });

      await test('/?pool=<id>: no unexpected page/console errors', async () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });
      await page.close();
    }

    // --- (4) /?token=USDC — the sacred SEO/analytics path ---
    {
      const { page, paths, errors } = await preparePage(browser);
      await page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });

      await test('/?token=USDC requests translations.min.js + planner.min.js, never the raw sources', async () => {
        assertMinNotRaw(paths, 'translations.min.js', 'translations.js', '/?token=USDC');
        assertMinNotRaw(paths, 'planner.min.js', 'planner.js', '/?token=USDC');
      });

      await test('/?token=USDC still renders pool cards', async () => {
        const count = await page.locator('.pool-card').count();
        if (count === 0) throw new Error('expected at least one .pool-card to render');
      });

      await test('/?token=USDC: no unexpected page/console errors', async () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });
      await page.close();
    }

    // --- (5) ?lang=ko on the planner — translations.min.js carries the full KO dictionary ---
    {
      const { page, paths, errors } = await preparePage(browser);
      await page.goto(`http://localhost:${PORT}/plan.html?lang=ko`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.gp-question', { timeout: 15000 });

      await test('plan.html?lang=ko requests translations.min.js and never translations.js', async () => {
        assertMinNotRaw(paths, 'translations.min.js', 'translations.js', 'plan.html?lang=ko');
      });

      await test('plan.html?lang=ko renders Korean copy on the planner\'s first screen', async () => {
        const question = await page.locator('.gp-question').innerText();
        if (!/무엇을 위해/.test(question)) throw new Error(`expected Korean step1Question copy, got: ${question}`);
      });

      await test('plan.html?lang=ko: no unexpected page/console errors', async () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_min_asset_boot.js: ${passed}/${TOTAL} tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
