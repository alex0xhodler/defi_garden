/* Playwright behavior gate for X-spotlight -> waitlist/plan attribution (spec
   064): drives the REAL rendered plan.html UI (2026-07-11 standing decision —
   never fixture strings alone, 017's failure is the precedent). Opens the
   exact URL shape generate-spotlight.js's buildShareUrl now emits
   (goal/monthly/pace/chain/token + src=x_spotlight&ref=<slug>), lets the
   garden render, and asserts:
     1. Analytics.trackPlanCreated fires with source=x_spotlight
     2. clicking the Bloom checkout CTA opens the waitlist modal and fires
        Analytics.trackWaitlistOpened with source=x_spotlight
     3. a plain share link with no ?src= carries source=null on both events
        (no regression on the non-spotlight path)

   Mirrors test_spotlight_url.js's exact harness (local static server, real
   Chromium, vendored React/Babel + a routed pools fixture — browser-
   originated HTTPS to unpkg.com/yields.llama.fi is blocked at the proxy
   connection level in this sandbox, NORTH_STAR.md 2026-07-12) and
   test_waitlist_seo_entry.js's Mixpanel-stub-queue inspection technique
   (window.mixpanel queues track() calls as plain array entries before the
   real lib loads — inspected directly, never dependent on mp.defi.garden
   being reachable).

   Run: node test_spotlight_attribution.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8798; // 8791-8797 already claimed by prior test_* files
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|google\.com\/s2\/favicons/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Same shape generate-spotlight.js's isQualifyingPool/classifyPersona would
// accept: clears the $10M floor, well under APY_SANITY_LIMIT, stable symbol
// -> 'stable' persona (matches pace=stable in the URLs below).
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('spotlight-usdc-base', 'aave-v3', 'USDC', 'Base', 60_000_000, 5.0)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'plan.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

// Mirrors test_spotlight_url.js's toggle-then-wait helper — subscription
// goals (this test's default 'claude') render .gp-sub-customize-trigger
// instead of .gp-pools-toggle, both reveal .gp-pool-grid once expanded.
async function openPlanUrl(page, query) {
  await page.goto(`http://localhost:${PORT}/plan.html?${query}`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector('.gp-checkout-cta', { timeout: 15000 });
}

async function readTrackCalls(page, eventName) {
  const calls = await page.evaluate(() => (window.mixpanel || []).filter((c) => Array.isArray(c) && c[0] === 'track'));
  return calls.filter((c) => c[1] === eventName);
}

async function main() {
  // Same hardcoded-false precedent as test_spotlight_url.js: a live curl
  // probe reports both hosts reachable, but letting Chromium hit them
  // directly hangs every assertion on a timeout since React never mounts.
  const unpkgReachable = false;
  console.log(`network: unpkg.com ${unpkgReachable ? 'reachable' : 'BLOCKED (using local vendored React/Babel)'}, yields.llama.fi BLOCKED (using fixture pool)`);

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const source = msg.location()?.url || '';
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        pageErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });

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
    // spec 059: serve a STALE snapshot so the FE falls back to the fixtured LIVE endpoint deterministically (a 200 keeps the browser console clean; a 404 would trip pageErrors guards).
    await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
    }));

    const SPOTLIGHT_QUERY = 'goal=claude&monthly=20&pace=stable&chain=Base&token=USDC&src=x_spotlight&ref=aave-v3-usdc-base';

    await test('a spotlight share link (src=x_spotlight) fires plan_created with source=x_spotlight', async () => {
      await openPlanUrl(page, SPOTLIGHT_QUERY);
      const calls = await readTrackCalls(page, 'plan_created');
      if (!calls.length) throw new Error('no plan_created track call found in the Mixpanel stub queue');
      if (calls[0][2].source !== 'x_spotlight') {
        throw new Error('expected plan_created source=x_spotlight, got ' + JSON.stringify(calls[0][2].source));
      }
    });

    await test('clicking the Bloom checkout CTA opens the waitlist modal and fires waitlist_opened with source=x_spotlight', async () => {
      await page.locator('.gp-checkout-cta').first().click();
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
      const calls = await readTrackCalls(page, 'waitlist_opened');
      if (!calls.length) throw new Error('no waitlist_opened track call found in the Mixpanel stub queue');
      if (calls[0][2].source !== 'x_spotlight') {
        throw new Error('expected waitlist_opened source=x_spotlight, got ' + JSON.stringify(calls[0][2].source));
      }
    });

    await test('a plain share link with no ?src= carries source=null on plan_created (no regression)', async () => {
      const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page2.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
      for (const [url, localPath] of Object.entries(vendored)) {
        await page2.route(url, (route) => route.fulfill({
          status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath)
        }));
      }
      // spec 059: serve a STALE snapshot so the FE falls back to the fixtured LIVE endpoint deterministically (a 200 keeps the browser console clean; a 404 would trip pageErrors guards).
      await page2.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
      await page2.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
      }));
      await openPlanUrl(page2, 'goal=claude&monthly=20&pace=stable&chain=Base&token=USDC');
      const calls = await page2.evaluate(() => (window.mixpanel || []).filter((c) => Array.isArray(c) && c[0] === 'track' && c[1] === 'plan_created'));
      await page2.close();
      if (!calls.length) throw new Error('no plan_created track call found for the plain share link');
      if (calls[0][2].source !== null) {
        throw new Error('expected plan_created source=null on a non-spotlight link, got ' + JSON.stringify(calls[0][2].source));
      }
    });

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  const total = 3;
  console.log(passed + '/' + total + ' spotlight-attribution assertions passed');
}

main().catch((err) => {
  console.error('test_spotlight_attribution crashed: ' + err.message);
  process.exitCode = 1;
});
