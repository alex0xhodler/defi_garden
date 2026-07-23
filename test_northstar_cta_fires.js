/* Rendered Playwright test for backlog 123 — P0 north-star instrumentation
   DEFINE + verify. The north star (NORTH_STAR.md, pivoted 2026-07-23) is the
   two pool-detail conversion CTAs: "Garden this pool" (PoolDetail.js
   `cta-button-primary`, fires `Analytics.trackPoolClick(pool, 'garden_cta', ...)`)
   and "Start Earning on <protocol>" (PoolDetail.js `pool-action-protocol-link`,
   fires `Analytics.trackPoolClick(pool, 'protocol_link')`). Both funnel into
   the single `pool_click` event, isolated by a `source` property.

   This test proves, against REAL renders (not source reading):
   (1) both CTAs fire `pool_click` on BOTH pool-detail entry paths —
       card_click (grid → click a card) and url_direct (`/?pool=<id>` landing);
   (2) every `pool_click` carries non-empty segmentation props: pool id,
       project, chain, apy, source;
   (3) the `pool_view` denominator event fires exactly once per pool-detail
       render on both paths (it already had render-path coverage in
       test_search.js for source values; this file additionally checks the
       segmentation props load-bearing for the north-star query).

   Spy point: `Analytics.track` itself — the outermost real boundary
   reachable in-sandbox (mixpanel.track is unreachable; mp.defi.garden/
   cdn.mxpnl.com are blocked, and Analytics.track() no-ops before ever
   reaching mixpanel — see test_analytics_fires.js's identical rationale).
   Wrapping at this single choke point (rather than trackPoolView/
   trackPoolClick individually) also captures the FULL enriched event
   payload each track* helper builds, which is what the props assertion
   needs.

   Fixture-routed (unpkg React/Babel vendored, snapshot 404'd to force the
   live path) — the house pattern from test_search.js/test_token_loading_state.js;
   browser-originated external HTTPS is blocked in this sandbox (NORTH_STAR.md
   2026-07-12 standing decision).

   Run: node test_northstar_cta_fires.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8818; // distinct from other test_* files (8791-8817 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — used for the url_direct (`?pool=<id>`) landing. Reused here
// (not read live from the snapshot at fixture-build time) so the fixture
// stays byte-stable regardless of snapshot regeneration cadence; the id is
// verified present in the snapshot below before the test runs.
const URL_DIRECT_POOL = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  project: 'lido', symbol: 'STETH', chain: 'Ethereum',
  tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const CARD_CLICK_POOL = {
  pool: 'usdc-base-aave-test', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
  tvlUsd: 45_000_000, apyBase: 4.2, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [URL_DIRECT_POOL, CARD_CLICK_POOL] });

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
// runs before the page's own deferred scripts (winning the race against
// auto-firing events like url_direct's pool_view) AND re-runs on every real
// navigation for the lifetime of the page — call this exactly ONCE per page,
// not per navigation, or Analytics.track ends up double/triple-wrapped.
//
// Also intercepts the two CTAs at the document capture phase to preventDefault
// their native browser action (the "Garden this pool" CTA is a real <a href>
// into the planner; a real click would navigate this test page away before
// events can be read back) WITHOUT calling stopPropagation, so React's own
// bubble-phase onClick (and the Analytics.trackPoolClick call inside it)
// still fires normally. window.open is stubbed so the protocol_link button's
// external-navigation call is inert too (belt and suspenders).
async function installTrackSpy(page) {
  await page.addInitScript(() => {
    window.__events = [];
    window.open = () => null;
    document.addEventListener('click', (e) => {
      if (e.target.closest('.cta-button-primary, .pool-action-protocol-link')) e.preventDefault();
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

// Isolates one assertion's event capture from whatever the page emitted
// before it, without re-wrapping Analytics.track (that stays installed once
// via installTrackSpy's addInitScript for the page's whole lifetime).
async function resetEvents(page) {
  await page.evaluate(() => { window.__events = []; });
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

// Segmentation props required by the north-star query (product-loop-kit/
// NORTH_STAR.md metric section, backlog 123c): pool id, project, chain,
// apy, source — every one non-empty/defined.
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
  // Sanity check: the url_direct fixture pool id is real, drawn from the
  // committed snapshot (spec brief step b.2) — not invented.
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  const snapshotHit = snapshot.pools.find((p) => p.pool === URL_DIRECT_POOL.pool);
  if (!snapshotHit) throw new Error(`URL_DIRECT_POOL.pool ${URL_DIRECT_POOL.pool} not found in data/pools-snapshot.json — pick a real id`);

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
    // Force the live path deterministically on both entry paths (matches
    // test_token_loading_state.js/test_search.js — the committed snapshot
    // would otherwise silently satisfy the card_click grid load too).
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));

    // --- Path 1: url_direct — land directly on /?pool=<id> ---
    await test('url_direct: landing on /?pool=<id> fires pool_view(source=url_direct) with segmentation props', async () => {
      await installTrackSpy(page);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(URL_DIRECT_POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_view'), 5000);
      const views = events.filter((e) => e.eventName === 'pool_view');
      if (views.length !== 1) throw new Error(`expected exactly one pool_view on url_direct landing, got ${JSON.stringify(views)}`);
      if (views[0].eventData.source !== 'url_direct') throw new Error(`expected source=url_direct, got ${JSON.stringify(views[0].eventData)}`);
      assertSegmentationProps(views[0].eventData, 'url_direct', 'url_direct pool_view');
    });

    await test('url_direct: "Garden this pool" CTA fires pool_click(source=garden_cta) with segmentation props', async () => {
      await resetEvents(page);
      await page.locator('.cta-button-primary').first().click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=garden_cta), got ${JSON.stringify(clicks)}`);
      assertSegmentationProps(clicks[0].eventData, 'garden_cta', 'url_direct garden_cta pool_click');
    });

    await test('url_direct: "Start Earning on <protocol>" link fires pool_click(source=protocol_link) with segmentation props, no navigation', async () => {
      await resetEvents(page);
      const link = page.locator('.pool-action-protocol-link').first();
      if ((await link.count()) === 0) throw new Error('expected .pool-action-protocol-link to render for a pool with a known protocol URL (lido)');
      await link.click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=protocol_link), got ${JSON.stringify(clicks)}`);
      assertSegmentationProps(clicks[0].eventData, 'protocol_link', 'url_direct protocol_link pool_click');
      if (page.url().includes('lido.fi')) throw new Error('protocol_link click navigated the test page away — window.open was not intercepted');
    });

    // --- Path 2: card_click — /?token=USDC grid, click a card into detail ---
    await test('card_click: clicking a pool card fires pool_view(source=card_click) with segmentation props', async () => {
      // installTrackSpy's addInitScript (registered once, above) re-runs
      // automatically on this real navigation, resetting window.__events and
      // re-wrapping Analytics.track fresh — no re-install needed here.
      await page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await resetEvents(page);

      await page.locator('.pool-card').first().click();
      await page.waitForSelector('.pool-detail-view', { timeout: 10000 });
      const poolId = new URL(page.url()).searchParams.get('pool');
      if (!poolId) throw new Error('expected card click to set ?pool= in the URL');

      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_view'), 5000);
      const views = events.filter((e) => e.eventName === 'pool_view');
      if (views.length !== 1) throw new Error(`expected exactly one pool_view after card click, got ${JSON.stringify(views)}`);
      if (views[0].eventData.source !== 'card_click') throw new Error(`expected source=card_click, got ${JSON.stringify(views[0].eventData)}`);
      assertSegmentationProps(views[0].eventData, 'card_click', 'card_click pool_view');
    });

    await test('card_click: "Garden this pool" CTA fires pool_click(source=garden_cta) with segmentation props', async () => {
      await resetEvents(page);
      await page.locator('.cta-button-primary').first().click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=garden_cta), got ${JSON.stringify(clicks)}`);
      assertSegmentationProps(clicks[0].eventData, 'garden_cta', 'card_click garden_cta pool_click');
    });

    await test('card_click: "Start Earning on <protocol>" link fires pool_click(source=protocol_link) with segmentation props, no navigation', async () => {
      await resetEvents(page);
      const link = page.locator('.pool-action-protocol-link').first();
      if ((await link.count()) === 0) throw new Error('expected .pool-action-protocol-link to render for a pool with a known protocol URL (aave-v3)');
      await link.click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=protocol_link), got ${JSON.stringify(clicks)}`);
      assertSegmentationProps(clicks[0].eventData, 'protocol_link', 'card_click protocol_link pool_click');
      if (page.url().includes('app.aave.com')) throw new Error('protocol_link click navigated the test page away — window.open was not intercepted');
    });

    await test('no unexpected page/console errors across either path', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_northstar_cta_fires.js: ${passed}/7 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
