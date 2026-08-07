/* Rendered Playwright test for backlog 244 — the analytics-mode dynamic
   bundle loader in home.html raced every <script defer> global it consumes
   (React, ReactDOM, translations.min.js's exports). The inline script that
   appends PoolDetail.compiled.min.js/app.compiled.min.js was a plain
   parser-blocking script, so it ran DURING HTML parsing — strictly before
   any `defer` tag executes. Both compiled bundles destructure `React` (and
   app.compiled.min.js calls `ReactDOM.render(...)` + `createTranslationFunction`)
   at the top level, so appending them at parse time was a pure download-speed
   race: whichever finished first, won. Evidence: audit-app.js 2026-08-06T07:15:06Z
   caught it once live (1/1 in a contended 83-surface run, 0/6 isolated repeats) —
   `pageerror: React is not defined` + a `TypeError` inside the hoisted
   `getPoolTypeShared`, then a `[P1] dead-end` (zero .pool-card rendered).

   The fix: gate the dynamic append behind `DOMContentLoaded`, which the HTML
   spec defines to fire only after every `defer` script in the document has
   finished executing, in order. That removes the race for every deferred
   global at once — it needs no hand-maintained list of what the bundles
   read (item 212's "guard aimed at a resemblance" trap).

   This test proves, against REAL chromium renders of the REAL static file
   (not source reading):
   (1) POPULATION, derived at test time from home.html itself (never a
       hand-typed list): every `<script defer src="...">` in <head>, and a
       source-level check that the analytics-mode dynamic loader is gated by
       `document.addEventListener('DOMContentLoaded', ...)` — which by
       definition waits for ALL of them, not a subset;
   (2) NON-VACUITY: with react.production.min.js, react-dom.production.min.js
       AND translations.min.js all artificially delayed well past when the
       old parse-time loader would have fired, `?token=`, `?chain=` and
       `?pool=` all render with zero pageerror, zero console.error, and
       their expected content — proving the barrier actually holds, not just
       that the delay wasn't triggered;
   (3) the same three delayed-defer renders reproduce the ORIGINAL bug
       (pageerror + zero .pool-card) when run against the pre-fix loader
       code — recorded in specs/244-notes.md via a stash/restore, not
       re-asserted here (a self-disabling check would defeat the point).

   House pattern (test_min_asset_boot.js): local http static server over the
   repo root, chromium at /opt/pw-browsers/chromium when present,
   fixture-routed yields.llama.fi + aborted decorative/analytics hosts,
   IGNORABLE console/page-error filter, test() helper printing checkmarks and
   setting process.exitCode.

   Run: node test_boot_barrier.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8878; // distinct from other test_*.js PORTs (8791-8877 taken; 8877 is the prior max)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|google\.com\/s2\/favicons|Failed to load resource/i;

// Same fixture pools test_min_asset_boot.js uses (real id from data/pools-snapshot.json).
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

// How long the "slow defer" simulation delays react/react-dom/translations
// past their normal response time. Large enough that a dynamically-appended
// script fetched at parse time would reliably finish first without the
// DOMContentLoaded barrier (confirmed against the pre-fix code in
// specs/244-notes.md).
const SLOW_DEFER_MS = 600;

let passed = 0;
const TOTAL = 8;
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

async function preparePage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
      errors.push('console.error: ' + m.text());
  });
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());
  await page.route('https://www.google.com/s2/**', (r) => r.abort());
  await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
  await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));
  // Simulate a slow network/CDN for every deferred global the dynamically-
  // appended bundles consume (React, ReactDOM, translations.min.js) — the
  // exact race audit-app.js caught live, made deterministic.
  await page.route('**/react.production.min.js', async (route) => {
    await new Promise((r) => setTimeout(r, SLOW_DEFER_MS));
    route.continue();
  });
  await page.route('**/react-dom.production.min.js', async (route) => {
    await new Promise((r) => setTimeout(r, SLOW_DEFER_MS));
    route.continue();
  });
  await page.route('**/translations.min.js', async (route) => {
    await new Promise((r) => setTimeout(r, SLOW_DEFER_MS));
    route.continue();
  });
  return { page, errors };
}

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL.pool)) {
    throw new Error(`POOL.pool ${POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  }

  // --- (0) Population + barrier check, derived from home.html itself ---
  const html = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8');
  const deferredSrcs = [...html.matchAll(/<script\s+defer\s+src="([^"]+)"/g)].map((m) => m[1]);
  const analyticsBlockMatch = html.match(/if \(window\.__APP_MODE === 'analytics'\)[\s\S]*?<\/script>/);

  await test('home.html has a non-empty, machine-derived set of <script defer> globals', () => {
    if (deferredSrcs.length === 0) throw new Error('expected at least one <script defer src="..."> in home.html');
    for (const must of ['react.production.min.js', 'react-dom.production.min.js', 'translations.min.js']) {
      if (!deferredSrcs.some((s) => s.replace(/^\.\//, '') === must)) {
        throw new Error(`expected ${must} in the derived deferred-script set, got: ${JSON.stringify(deferredSrcs)}`);
      }
    }
  });

  await test('analytics-mode dynamic loader is gated on DOMContentLoaded (covers every deferred global above, not a hand-picked subset)', () => {
    if (!analyticsBlockMatch) throw new Error('could not find the analytics-mode dynamic loader block in home.html');
    const block = analyticsBlockMatch[0];
    if (!/document\.addEventListener\(\s*['"]DOMContentLoaded['"]/.test(block)) {
      throw new Error('expected the analytics-mode loader to be gated by document.addEventListener(\'DOMContentLoaded\', ...)');
    }
  });

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // --- (1) ?token= with every deferred global slow — the sacred SEO/analytics path ---
    {
      const { page, errors } = await preparePage(browser);
      await page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });

      await test('/?token=USDC still renders pool cards with React/ReactDOM/translations artificially slow', async () => {
        const count = await page.locator('.pool-card').count();
        if (count === 0) throw new Error('expected at least one .pool-card to render');
      });
      await test('/?token=USDC: zero page/console errors with deferred globals slow', () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });
      await page.close();
    }

    // --- (2) ?chain= with every deferred global slow ---
    {
      const { page, errors } = await preparePage(browser);
      await page.goto(`http://localhost:${PORT}/home.html?chain=Ethereum`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });

      await test('/?chain=Ethereum still renders pool cards with React/ReactDOM/translations artificially slow', async () => {
        const count = await page.locator('.pool-card').count();
        if (count === 0) throw new Error('expected at least one .pool-card to render');
      });
      await test('/?chain=Ethereum: zero page/console errors with deferred globals slow', () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });
      await page.close();
    }

    // --- (3) ?pool=<id> deep link with every deferred global slow — the north-star surface ---
    {
      const { page, errors } = await preparePage(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

      await test('/?pool=<id> still renders pool-detail with React/ReactDOM/translations artificially slow', async () => {
        const count = await page.locator('.pool-detail-view').count();
        if (count === 0) throw new Error('expected .pool-detail-view to render');
      });
      await test('/?pool=<id>: zero page/console errors with deferred globals slow', () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_boot_barrier.js: ${passed}/${TOTAL} tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
