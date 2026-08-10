/* Rendered Playwright test for backlog 257 — the third, previously
   un-instrumented, pool-detail entry path: the "calculate yield" button on
   a grid pool card (`.calculate-yield-btn-new`, app.js's handleCalculateYield).

   Structure/spy pattern copied in spirit from test_northstar_cta_fires.js
   (fixture-routed unpkg React/Babel, snapshot 404'd to force the live path,
   chromium at /opt/pw-browsers/chromium, spy at the DELIVERED boundary
   `Analytics.track` — never `trackPoolView`/`trackPoolClick` directly, per
   playbooks/analytics-regression-triage.md's 214 addendum step 3: a correct
   call site is not evidence the property reaches Mixpanel, wrap the
   choke-point every track* helper funnels through).

   This test proves, against a REAL render (not source reading):
   (1) clicking `.calculate-yield-btn-new` on a grid card actually renders
       `.pool-detail-view` (so a passing test can't be a no-op — the button
       could theoretically no-op and this test would still need to fail);
   (2) exactly one `pool_view` event reaches Analytics.track with
       `source: 'yield_calculator'` AND the full enrichPoolData() segmentation
       set (`pool_id`, `pool_project`, `pool_chain`, `total_apy`) non-empty;
   (3) exactly one `pool_click` event reaches Analytics.track with
       `source`/`click_type` both `yield_calculator` (the pre-existing emit,
       asserted here too so a future edit can't silently turn it into a
       double-fire or drop it while "fixing" the new pool_view call).

   Run: node test_pool_view_calculator_path.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8979; // distinct from other test_* files (8791-8978 taken; 8978 is test_results_count_render.js, the prior max)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

const CALCULATOR_POOL = {
  pool: 'usdc-arbitrum-calc-test', project: 'aave-v3', symbol: 'USDC', chain: 'Arbitrum',
  tvlUsd: 32_000_000, apyBase: 3.8, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [CALCULATOR_POOL] });

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

// Wraps Analytics.track (the pre-mixpanel choke point every track* helper
// funnels through) so every event's fully-enriched payload is observable,
// regardless of mixpanel/production-host gating downstream. addInitScript
// runs before the page's own deferred scripts (winning the race against any
// auto-firing events) and re-runs on every real navigation — call once per
// page, not per navigation, or Analytics.track ends up double-wrapped.
async function installTrackSpy(page) {
  await page.addInitScript(() => {
    window.__events = [];
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.track) { setTimeout(install, 0); return; }
      const orig = Analytics.track.bind(Analytics);
      Analytics.track = (eventName, eventData) => {
        window.__events.push({ eventName, eventData });
        return orig(eventName, eventData);
      };
    };
    install();
  });
}

async function pollEvents(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let events = [];
  for (;;) {
    events = await page.evaluate(() => window.__events);
    if (predicate(events) || Date.now() > deadline) break;
    await page.waitForTimeout(100);
  }
  return events;
}

function assertSegmentationProps(eventData, expectedSource, label) {
  const checks = {
    pool_id: eventData.pool_id,
    pool_project: eventData.pool_project,
    pool_chain: eventData.pool_chain,
    total_apy: eventData.total_apy,
    source: eventData.source
  };
  for (const [key, val] of Object.entries(checks)) {
    if (val === undefined || val === null || val === '') {
      throw new Error(`${label}: missing/empty segmentation prop "${key}" — got ${JSON.stringify(eventData)}`);
    }
  }
  if (eventData.source !== expectedSource) {
    throw new Error(`${label}: expected source="${expectedSource}", got "${eventData.source}" — ${JSON.stringify(eventData)}`);
  }
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

    const nm = path.join(ROOT, 'node_modules');
    for (const [url, lp] of Object.entries({
      'https://unpkg.com/react@18/umd/react.production.min.js': path.join(nm, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(nm, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js': path.join(nm, '@babel/standalone/babel.min.js')
    })) {
      await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
    }
    await page.route('https://icons.llamao.fi/**', (r) => r.abort());
    // Force the live path deterministically (matches test_northstar_cta_fires.js
    // / test_search.js) — the committed snapshot would otherwise silently
    // satisfy the grid load instead of our fixture pool.
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));

    await installTrackSpy(page);
    await page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });

    await test('clicking .calculate-yield-btn-new renders .pool-detail-view (not a no-op)', async () => {
      const btn = page.locator('.calculate-yield-btn-new').first();
      if ((await btn.count()) === 0) throw new Error('expected .calculate-yield-btn-new to render on the grid pool card');
      await btn.click();
      await page.waitForSelector('.pool-detail-view', { timeout: 10000 });
    });

    await test('the calculator path fires exactly one pool_view(source=yield_calculator) with full segmentation props', async () => {
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_view'), 5000);
      const views = events.filter((e) => e.eventName === 'pool_view');
      if (views.length !== 1) throw new Error(`expected exactly one pool_view, got ${JSON.stringify(views)}`);
      assertSegmentationProps(views[0].eventData, 'yield_calculator', 'yield_calculator pool_view');
    });

    await test('the calculator path fires exactly one pool_click(source=yield_calculator, click_type=yield_calculator)', async () => {
      const events = await page.evaluate(() => window.__events);
      const clicks = events.filter((e) => e.eventName === 'pool_click');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click, got ${JSON.stringify(clicks)}`);
      const clickData = clicks[0].eventData;
      if (clickData.source !== 'yield_calculator') throw new Error(`expected pool_click source="yield_calculator", got ${JSON.stringify(clickData)}`);
      if (clickData.click_type !== 'yield_calculator') throw new Error(`expected pool_click click_type="yield_calculator", got ${JSON.stringify(clickData)}`);
    });

    await test('pool_view fired exactly once total (no double-fire against the static leg)', async () => {
      const events = await page.evaluate(() => window.__events);
      const views = events.filter((e) => e.eventName === 'pool_view');
      if (views.length !== 1) throw new Error(`expected exactly one pool_view across the whole interaction, got ${views.length}: ${JSON.stringify(views)}`);
    });

    await test('no unexpected page/console errors', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_pool_view_calculator_path.js: ${passed}/5 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
