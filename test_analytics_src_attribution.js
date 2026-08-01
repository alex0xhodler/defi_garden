/* Rendered Playwright test for backlog 202 — `src`, the product's own
   internal-link acquisition tag (seo_token/seo_chain on the static SEO
   estate's waitlist CTAs, x_spotlight on spotlight packs, pool on the
   north-star CTA), added to `Analytics.captureAcquisition()`'s param list.

   Proves the RENDERED, end-to-end path (never fixture strings alone,
   2026-07-11 standing decision — 017's failure is the precedent):
     1. `/plan.html?waitlist=1&src=seo_token` — the exact URL every static
        token/chain page's waitlist CTA links to — produces at least one
        mixpanel.track call whose props include src === 'seo_token', AND the
        pre-existing waitlist_opened `source` property is still
        'seo_token' (no regression, no collision between the two properties).
     2. `/?pool=<id>&src=seo_token` — the north-star pool-detail surface —
        emits pool_view carrying src === 'seo_token'.
     3. Controls: both URLs WITHOUT ?src= emit no `src` key on ANY recorded
        event's props.

   Harness mirrors two established patterns:
     - test_waitlist_seo_entry.js: same plan.html?waitlist=1&src=... URL
       shape, same neutralizeHostGate() (spec 096's PRODUCTION_HOSTS gate
       makes Analytics.track() return before ever reaching mixpanel.track()
       when location.hostname is localhost — this override restores the real
       production path), same window.mixpanel stub-queue inspection (the
       Mixpanel snippet in home.html/plan.html queues track() calls as plain
       array entries — ['track', eventName, props] — before the real lib
       loads; read directly, never dependent on mp.defi.garden being
       reachable in this sandbox).
     - test_analytics_fires.js / test_northstar_cta_fires.js: local HTTP
       server + `/opt/pw-browsers/chromium` executablePath fallback + a
       blanket "abort every non-localhost request" route (the robust pattern
       test_snapshot_first.js established) so mp.defi.garden/icons.llamao.fi/
       fontshare never hang a goto() past its timeout.

   `src` (unlike `source` on trackWaitlistOpened's context, which is read
   directly off the URL param synchronously) reaches an event's props via
   `Analytics.acquisition`, captured once by `Analytics.init()` on the
   window 'load' listener (analytics.js's own auto-init, bottom of file) —
   NOT on React mount. `session_start` fires from that same 'load' handler
   right after `Analytics.init()`, so it is the reliable poll target proving
   acquisition capture has happened before any src assertion is checked.

   Run: node test_analytics_src_attribution.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8869; // distinct from other test_* files (8791-8868 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — same id test_northstar_cta_fires.js uses for its url_direct
// fixture. Reused (not read live) so this fixture stays byte-stable
// regardless of snapshot regeneration cadence; verified present below.
const POOL_ID = '747c1d2a-c668-4682-b9f9-296708a3dd90';
const POOL_FIXTURE = { pool: POOL_ID, project: 'lido', symbol: 'STETH', chain: 'Ethereum', tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0 };
const POOLS_RESPONSE = JSON.stringify({ status: 'success', data: [POOL_FIXTURE] });

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

// Same poll-and-patch shape as test_waitlist_seo_entry.js/test_spotlight_attribution.js:
// spec 096's production-host gate (analytics.js:96, PRODUCTION_HOSTS at :14) makes
// Analytics.track() return before ever calling mixpanel.track() when location.hostname
// is localhost — neutralising restores the real production path into the same
// window.mixpanel stub queue every assertion below reads.
async function neutralizeHostGate(target) {
  await target.addInitScript(() => {
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.isProductionHost) { setTimeout(install, 0); return; }
      Analytics.isProductionHost = () => true;
    };
    install();
  });
}

function trackCalls(page) {
  return page.evaluate(() => (window.mixpanel || []).filter((c) => Array.isArray(c) && c[0] === 'track'));
}

// Polls the mixpanel stub queue until `predicate` is satisfied or `timeoutMs`
// elapses, returning whatever was last read (never throws on timeout — the
// caller decides what an empty/incomplete result means).
async function pollTrackCalls(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let calls = [];
  for (;;) {
    calls = await trackCalls(page);
    if (predicate(calls) || Date.now() > deadline) break;
    await page.waitForTimeout(100);
  }
  return calls;
}

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL_ID)) {
    throw new Error(`POOL_ID ${POOL_ID} not found in data/pools-snapshot.json — pick a real id`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext();
    // Blanket-abort every external host (mp.defi.garden's mixpanel lib,
    // icons.llamao.fi, fontshare) so nothing hangs a goto() past its timeout
    // — the established pattern from test_analytics_fires.js/
    // test_waitlist_seo_entry.js. Registered first so the specific fixture
    // route below (registered after, per-page) still wins — Playwright
    // matches routes most-recently-registered-first.
    await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`), (route) => route.abort());
    await neutralizeHostGate(context);
    await context.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

    const pageErrors = [];
    function trackErrors(p) {
      p.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
    }

    // --- 1. plan.html?waitlist=1&src=seo_token — the exact URL every static
    //    token/chain SEO page's waitlist CTA links to ---
    await test('/plan.html?waitlist=1&src=seo_token: a track call carries src=seo_token, waitlist_opened source unchanged', async () => {
      const page = await context.newPage();
      trackErrors(page);
      await page.goto(`http://localhost:${PORT}/plan.html?waitlist=1&src=seo_token`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 10000 });

      // session_start fires from analytics.js's own window 'load' handler,
      // right after Analytics.init() captures acquisition — reliable proof
      // that this.acquisition (and therefore src) is populated before the
      // no-src-key assertions elsewhere in this file would mean anything.
      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'session_start'), 8000);

      const withSrc = calls.filter((c) => c[2] && c[2].src === 'seo_token');
      if (!withSrc.length) throw new Error('no track call carries src=seo_token — got ' + JSON.stringify(calls.map((c) => [c[1], c[2] && c[2].src])));

      const opened = calls.find((c) => c[1] === 'waitlist_opened');
      if (!opened) throw new Error('no waitlist_opened track call found in the Mixpanel stub queue');
      if (opened[2].source !== 'seo_token') {
        throw new Error('regression: expected waitlist_opened source=seo_token, got ' + JSON.stringify(opened[2].source));
      }
      await page.close();
    });

    // --- Control 1: same URL, no ?src= ---
    await test('/plan.html?waitlist=1 (no src param): no event carries a src key', async () => {
      const page = await context.newPage();
      trackErrors(page);
      await page.goto(`http://localhost:${PORT}/plan.html?waitlist=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 10000 });

      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'session_start'), 8000);
      const withSrc = calls.filter((c) => c[2] && 'src' in c[2]);
      if (withSrc.length) throw new Error('expected no src key on any event, found it on: ' + JSON.stringify(withSrc.map((c) => c[1])));
      await page.close();
    });

    // --- 2. /?pool=<id>&src=seo_token — the north-star pool-detail surface ---
    await test('/?pool=<id>&src=seo_token: pool_view carries src=seo_token', async () => {
      const page = await context.newPage();
      trackErrors(page);
      await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: POOLS_RESPONSE
      }));
      await page.goto(`http://localhost:${PORT}/?pool=${encodeURIComponent(POOL_ID)}&src=seo_token`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'pool_view'), 15000);
      const poolView = calls.find((c) => c[1] === 'pool_view');
      if (!poolView) throw new Error('no pool_view track call found in the Mixpanel stub queue');
      if (poolView[2].src !== 'seo_token') {
        throw new Error('expected pool_view src=seo_token, got ' + JSON.stringify(poolView[2].src));
      }
      await page.close();
    });

    // --- Control 2: same URL, no ?src= ---
    await test('/?pool=<id> (no src param): no event carries a src key', async () => {
      const page = await context.newPage();
      trackErrors(page);
      await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: POOLS_RESPONSE
      }));
      await page.goto(`http://localhost:${PORT}/?pool=${encodeURIComponent(POOL_ID)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'pool_view'), 15000);
      const withSrc = calls.filter((c) => c[2] && 'src' in c[2]);
      if (withSrc.length) throw new Error('expected no src key on any event, found it on: ' + JSON.stringify(withSrc.map((c) => c[1])));
      await page.close();
    });

    await test('no unexpected page errors across any case', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_analytics_src_attribution.js: ${passed}/5 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('test_analytics_src_attribution crashed: ' + err.message);
  process.exit(1);
});
