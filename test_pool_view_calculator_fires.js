/* test_pool_view_calculator_fires.js — spec 257: the rendered proof that
   the third pool-detail entry path (the grid card's "calculate yield"
   button, `.calculate-yield-btn-new`, `app.js` `handleCalculateYield`) now
   emits `pool_view`.

   Modelled closely on test_northstar_cta_fires.js (fixture routing, unpkg
   React/Babel vendoring, snapshot 404 to force the live `/pools` path, the
   `Analytics.track` spy installed via addInitScript, the Chromium executable
   path, the IGNORABLE page-error regex) — see that file's header for the
   full rationale of each of those choices; not re-derived here.

   Spy point: `Analytics.track` itself (the delivered boundary), NOT
   `Analytics.trackPoolView`/`trackPoolClick` — spec 257 acceptance criteria
   explicitly requires the delivered boundary, matching test_northstar_cta_
   fires.js's own rationale (mixpanel.track is unreachable in-sandbox; this
   is the outermost point that still carries the full enriched payload each
   track* helper builds).

   Asserts:
     (1) clicking `.calculate-yield-btn-new` on the `?token=` analytics grid
         fires exactly ONE `pool_view` with `source: 'yield_calculator'` and
         non-empty `pool_id`/`pool_project`/`pool_chain`/`total_apy`;
     (2) exactly ONE `pool_click` with `source: 'yield_calculator'` in the
         same interaction (the pre-existing trackPoolClick call — proves no
         double-fire of either event, the same property test_northstar_cta_
         fires.js already asserts for card_click/url_direct/garden_cta/
         protocol_link);
     (3) the pool-detail view actually rendered after the click (`.pool-
         detail-view` present) — so a passing test can't mean "the button
         did nothing".

   Run: node test_pool_view_calculator_fires.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// Distinct from every other test_*.js file's `const PORT = ` (grepped
// 2026-08-10: highest in use is 8978, test_results_count_render.js).
const PORT = 8979;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

const CALCULATOR_POOL = {
  pool: 'usdc-base-aave-calc-test', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
  tvlUsd: 45_000_000, apyBase: 4.2, apyReward: 0
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

// Same rationale/ordering as test_northstar_cta_fires.js's installTrackSpy:
// wraps Analytics.track once for the page's lifetime (addInitScript re-runs
// on every real navigation), and preventDefaults the two pool-detail CTAs'
// native actions so a real click never navigates this test page away. Not
// needed here for correctness of THIS file's own assertions (it never
// clicks those CTAs), but harmless and keeps the spy installer identical to
// its model rather than a subtly-different reimplementation.
async function installTrackSpy(page) {
  await page.addInitScript(() => {
    window.__events = [];
    window.open = () => null;
    document.addEventListener('click', (e) => {
      if (e.target.closest('.cta-button-primary, .cta-button-protocol')) e.preventDefault();
    }, true);
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

// Segmentation props required by the north-star query (same shape as
// test_northstar_cta_fires.js's assertSegmentationProps).
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
    // Force the live path deterministically (matches test_northstar_cta_
    // fires.js/test_search.js) — the committed snapshot would otherwise
    // silently satisfy the grid load with real pools that have no
    // guaranteed `.calculate-yield-btn-new`-reachable fixture pool.
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));

    await installTrackSpy(page);

    await test('clicking .calculate-yield-btn-new on the analytics grid fires exactly one pool_view(source=yield_calculator) with segmentation props, one pool_click(source=yield_calculator), no double-fire, and renders the pool-detail view', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });

      const btn = page.locator('.calculate-yield-btn-new').first();
      if ((await btn.count()) === 0) throw new Error('expected .calculate-yield-btn-new to render on at least one pool card');

      await page.evaluate(() => { window.__events = []; });
      await btn.click();

      await page.waitForSelector('.pool-detail-view', { timeout: 10000 });

      const events = await pollEvents(page, (evs) =>
        evs.some((e) => e.eventName === 'pool_view') && evs.some((e) => e.eventName === 'pool_click'),
      5000);

      const views = events.filter((e) => e.eventName === 'pool_view');
      const clicks = events.filter((e) => e.eventName === 'pool_click');

      if (views.length !== 1) throw new Error(`expected exactly one pool_view, got ${views.length}: ${JSON.stringify(views)}`);
      assertSegmentationProps(views[0].eventData, 'yield_calculator', 'calculator pool_view');

      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click, got ${clicks.length}: ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.source !== 'yield_calculator') {
        throw new Error(`expected pool_click source="yield_calculator", got ${JSON.stringify(clicks[0].eventData)}`);
      }
      // click_type is trackPoolClick's own long-standing property (kept for
      // backward compatibility — see analytics.js trackPoolClick comment);
      // both must agree, since they come from the same call.
      if (clicks[0].eventData.click_type !== 'yield_calculator') {
        throw new Error(`expected pool_click click_type="yield_calculator", got ${JSON.stringify(clicks[0].eventData)}`);
      }

      const detailVisible = await page.locator('.pool-detail-view').count();
      if (detailVisible === 0) throw new Error('expected .pool-detail-view to be present after the click — a passing event assertion must not mean "the button did nothing"');
    });

    await test('no unexpected page/console errors', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_pool_view_calculator_fires.js: ${passed}/2 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
