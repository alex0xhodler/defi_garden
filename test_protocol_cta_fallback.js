/* Rendered Playwright test for backlog 138 — north-star CTA resilience.
   The "Start Earning on <protocol> ↗" secondary CTA (PoolDetail.js
   `.cta-button-protocol`, one of the two north-star conversion clicks —
   fires `pool_click{source=protocol_link}`) renders ONLY when
   `getProtocolUrlWithRef(pool)` resolves to a URL. That resolution walks:
   pool.url → dynamicProtocolUrls (the background api.llama.fi/protocols
   fetch) → static PROTOCOL_URLS → null (app.js getProtocolUrl). When the
   dynamic fetch fails/races (ad-blocker, outage, slow network) AND the pool
   carries no url (the committed snapshot never does) AND the protocol has no
   static entry, the CTA silently renders NOTHING — the exact gap 138 fixes
   for sky-lending (SUSDS, the ICP's $4.7B flagship stablecoin lender).

   This test proves, against a REAL render under that degraded condition
   (dynamic protocols fetch aborted, snapshot 404'd, no pool.url):
   (1) POSITIVE — a sky-lending pool NOW renders `.cta-button-protocol`
       purely from the static PROTOCOL_URLS fallback item 138 added, and the
       CTA still fires `pool_click{source=protocol_link}` when clicked;
   (2) NEGATIVE control — a pool whose project has NO static entry and no
       dynamic entry renders NO `.cta-button-protocol`, proving the CTA is
       genuinely URL-gated (so assertion (1) is load-bearing, not a page that
       always shows the button). Pre-138 the sky-lending pool behaved like
       this negative control — that's the regression this guards.

   Fixture-routed, browser external HTTPS blocked in-sandbox (NORTH_STAR.md
   2026-07-12). Spies Analytics.track (the pre-mixpanel choke point) exactly
   as test_northstar_cta_fires.js does. Run: node test_protocol_cta_fallback.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8819; // distinct from other test_* files
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|api\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real sky-lending SUSDS pool id from the committed data/pools-snapshot.json
// ($4.7B, the item's cited flagship). NO `url` field — matches the snapshot,
// forcing resolution down to the static PROTOCOL_URLS fallback under test.
const SKY_POOL = {
  pool: 'd8c4eff5-c8a9-46fc-a888-057c4c668e72',
  project: 'sky-lending', symbol: 'SUSDS', chain: 'Ethereum',
  tvlUsd: 4_700_000_000, apyBase: 3.6, apyReward: 0
};
// Negative control — a project with NO static and NO dynamic URL entry.
const UNKNOWN_POOL = {
  pool: 'unknown-proto-fallback-test',
  project: 'totally-unknown-protocol-xyz', symbol: 'USDC', chain: 'Ethereum',
  tvlUsd: 50_000_000, apyBase: 4.0, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [SKY_POOL, UNKNOWN_POOL] });

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

async function installTrackSpy(page) {
  await page.addInitScript(() => {
    window.__events = [];
    window.open = () => null;
    // Ensure no cached dynamic protocol map masks the static-fallback path.
    try { localStorage.removeItem('defi-protocols'); } catch (e) {}
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

async function main() {
  // Sanity: the sky-lending fixture pool id is real, drawn from the committed
  // snapshot (not invented), and — critically for the test's premise — the
  // snapshot entry carries NO url (so production truly relies on the fallback).
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  const hit = snapshot.pools.find((p) => p.pool === SKY_POOL.pool);
  if (!hit) throw new Error(`SKY_POOL.pool ${SKY_POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  if (hit.project !== 'sky-lending') throw new Error(`SKY_POOL.pool is project "${hit.project}", expected sky-lending`);
  if (hit.url) throw new Error('SKY_POOL snapshot entry unexpectedly has a url — premise (no pool.url) broken');

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
    // Force the live path (snapshot 404) and, crucially, SIMULATE the dynamic
    // protocols fetch failing — this is the degraded condition 138 hardens.
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));
    await page.route('https://api.llama.fi/protocols', (r) => r.abort());

    await installTrackSpy(page);

    // --- POSITIVE: sky-lending renders + fires the CTA from the static fallback ---
    await test('sky-lending: "Start Earning" CTA renders from static fallback with dynamic fetch failed + no pool.url', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(SKY_POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      const cta = page.locator('.cta-button-protocol');
      // Give the background protocols fetch its chance to (fail to) resolve
      // before asserting the CTA is present purely on the static fallback.
      await page.waitForTimeout(500);
      const count = await cta.count();
      if (count === 0) throw new Error('expected .cta-button-protocol to render for sky-lending from static PROTOCOL_URLS fallback — got 0 (the 138 regression)');
    });

    await test('sky-lending: the fallback CTA still fires pool_click{source=protocol_link} on click', async () => {
      await page.evaluate(() => { window.__events = []; });
      await page.locator('.cta-button-protocol').first().click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link');
      if (clicks.length < 1) throw new Error(`expected a pool_click{source=protocol_link}, got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.pool_project !== 'sky-lending') throw new Error(`expected pool_project=sky-lending, got ${JSON.stringify(clicks[0].eventData)}`);
    });

    // --- NEGATIVE control: no static/dynamic URL → no CTA (CTA is URL-gated) ---
    await test('unknown protocol: NO "Start Earning" CTA renders (proves the CTA is genuinely URL-gated)', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(UNKNOWN_POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await page.waitForTimeout(500);
      const count = await page.locator('.cta-button-protocol').count();
      if (count !== 0) throw new Error(`expected NO .cta-button-protocol for an unknown protocol, got ${count} — CTA is not URL-gated, so the positive assertion proves nothing`);
    });

    if (pageErrors.length) throw new Error('page errors during test:\n  ' + pageErrors.join('\n  '));
    console.log(`\n  ${passed}/3 assertions passed`);
    if (process.exitCode) process.exit(process.exitCode);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
