/* Rendered Playwright test for backlog 138 — north-star CTA resilience.
   The "Start Earning on <protocol> ↗" secondary CTA (PoolDetail.js
   `.cta-button-protocol`, one of the two north-star conversion clicks —
   fires `pool_click{source=protocol_link}`) renders ONLY when
   `getProtocolUrlWithRef(pool)` resolves to a URL.

   POST-182 TIER ORDER (read this before touching this file again):
     pool.url → dynamicProtocolUrls (background api.llama.fi/protocols fetch)
     → bakedProtocolUrls (CI-baked data/protocol-urls.json, spec 182 leg A)
     → static PROTOCOL_URLS (item 138's hand-added fallback, e.g.
       'sky-lending') → null (app.js getProtocolUrl).
   When ALL FOUR tiers return null, PoolDetail.js no longer renders nothing
   (spec 182 leg B/D): it renders an HONEST DEFILLAMA FALLBACK — reusing the
   *same* `.cta-button-protocol` className on purpose (zero-new-CSS
   directive) — which fires `pool_click{source='defillama_fallback'}`
   instead of `protocol_link`. That fallback is what this file's own
   negative-control fixture (a project in no tier at all) now renders.

   WHY `data/protocol-urls.json` IS BLOCKED/404'D IN THIS TEST, DELIBERATELY:
   This file's whole purpose (backlog 138) is to prove item 138's hand-added
   STATIC `PROTOCOL_URLS['sky-lending']` entry is load-bearing — i.e. that
   without it, sky-lending's CTA would not render under the degraded
   condition. Spec 182 baked `sky-lending` into `data/protocol-urls.json`
   too (verified: it is present there as of this test's writing), and this
   file's local http server serves the real repo tree — so, unblocked, the
   positive control's CTA would render from the BAKED tier even if the
   static entry it exists to guard were deleted, making the assertion
   vacuous about the exact thing it was written to protect. Blocking
   `/data/protocol-urls.json` the same way the pools-snapshot is already
   blocked restores isolation to the static tier alone. This is proven by
   mutation, not merely asserted — see specs/182-notes.md's "Follow-up"
   section for the md5-verified before/after.

   WHY THE NEGATIVE CONTROL NOW *DISTINGUISHES* RATHER THAN *COUNTS*:
   Before 182, "renders 0 `.cta-button-protocol`" was a valid proxy for "no
   URL resolved anywhere", because the only thing that ever wore that class
   was the real protocol CTA. Spec 182 legitimately puts a SECOND, different
   thing behind the same class (the DefiLlama fallback), so a bare element
   count is no longer evidence of anything — it would be true (1 element)
   whether the fallback fired correctly OR the code regressed to always
   rendering the real protocol CTA text. The negative control below instead
   asserts the STRONGER, still-load-bearing claim: a `.cta-button-protocol`
   IS present (the honest fallback, not nothing), its copy does NOT contain
   the protocol-CTA phrasing ("Start Earning" / "Start Earning on
   <project>", read live from translations.js — never re-typed), it DOES
   name DefiLlama (ditto), and clicking it fires
   `pool_click{source='defillama_fallback'}` and NEVER `protocol_link`. That
   is strictly more informative than "count === 0" ever was, and it still
   fails the moment either the fallback disappears or the CTA mislabels
   itself as `protocol_link` (which would silently inflate the north star).

   This test proves, against a REAL render under the degraded condition
   (dynamic protocols fetch aborted, baked artifact 404'd, snapshot 404'd,
   no pool.url):
   (1) POSITIVE — a sky-lending pool NOW renders `.cta-button-protocol`
       purely from the static PROTOCOL_URLS fallback item 138 added (with
       the baked tier that would otherwise also cover it blocked out), and
       the CTA still fires `pool_click{source=protocol_link}` when clicked;
   (2) DISTINGUISHING negative control — a pool whose project resolves in NO
       tier at all renders the honest DefiLlama fallback (not the real
       protocol CTA, not nothing), and clicking it fires
       `pool_click{source=defillama_fallback}`, never `protocol_link`.
       Pre-138 the sky-lending pool behaved like this negative control —
       that's the regression this guards.

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
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Reads a single `key: <value>,` entry out of translations.js's `en:` (or
// `ko:`) block and evals it live — string literal or arrow function — so
// this test never re-types a copy string that could drift from the real one.
// Mirrors test_protocol_cta_baked.js's extractKoFallbackCopy/extractProtocolUrlsConst
// pattern (read the source of truth, don't duplicate it).
function extractTranslation(lang, key) {
  const src = fs.readFileSync(path.join(ROOT, 'translations.js'), 'utf8');
  const blockIdx = src.indexOf(`\n  ${lang}: {`);
  if (blockIdx < 0) throw new Error(`could not find the "${lang}:" block in translations.js`);
  // Bound the search to this language's block only (next top-level `  <lang>: {`
  // or end of file) so same-named keys in the other language can't match.
  const nextBlockIdx = src.indexOf('\n  ', blockIdx + 1);
  const rest = src.slice(blockIdx);
  const m = rest.match(new RegExp(`\\n\\s*${key}:\\s*(.+?),\\s*\\n`));
  if (!m) throw new Error(`could not find "${key}" in translations.js's "${lang}:" block`);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${m[1]});`)();
}

// Compiled copy needed by both fixtures, read live rather than re-typed.
const enStartEarningOn = extractTranslation('en', 'startEarningOn'); // (protocol) => string
const enViewOnDefillama = extractTranslation('en', 'viewOnDefillama'); // string

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

  // Sanity: confirm (don't assume) that the CI-baked artifact ALSO covers
  // sky-lending today — this is precisely why blocking it below is
  // necessary, not incidental, to keep the positive control isolating the
  // static PROTOCOL_URLS tier item 138 added.
  const bakedArtifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'protocol-urls.json'), 'utf8'));
  if (!bakedArtifact.urls || !bakedArtifact.urls['sky-lending']) {
    throw new Error('data/protocol-urls.json no longer covers sky-lending — the /data/protocol-urls.json ' +
      'block below is now belt-and-braces rather than load-bearing; re-check this comment/test before removing it anyway');
  }

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
    // spec 182 — ALSO block the CI-baked protocol-URL artifact. Without this,
    // sky-lending (present in data/protocol-urls.json as confirmed above)
    // would resolve from the baked tier, and the positive control below would
    // no longer prove anything about item 138's STATIC PROTOCOL_URLS entry —
    // see the file header for the full non-vacuity rationale. app.js's own
    // fetch treats a non-ok response as silent failure (`finally` still sets
    // protocolUrlsSettled), so a 404 here is safe and does not wedge anything.
    await page.route('**/data/protocol-urls*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));
    await page.route('https://api.llama.fi/protocols', (r) => r.abort());

    await installTrackSpy(page);

    // --- POSITIVE: sky-lending renders + fires the CTA from the static fallback ---
    await test('sky-lending: "Start Earning" CTA renders from static fallback with dynamic fetch + baked artifact both failed + no pool.url', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(SKY_POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      const cta = page.locator('.cta-button-protocol');
      // Give the background protocols fetch and the (404'd) baked-artifact
      // fetch their chance to settle before asserting the CTA is present
      // purely on the static fallback.
      await page.waitForTimeout(500);
      const count = await cta.count();
      if (count === 0) throw new Error('expected .cta-button-protocol to render for sky-lending from static PROTOCOL_URLS fallback — got 0 (the 138 regression)');
      // With the baked tier blocked, this must be the REAL protocol CTA, not
      // the DefiLlama fallback that now shares the same className — pin that
      // down explicitly rather than trusting the count alone.
      const text = await cta.first().textContent();
      const expected = enStartEarningOn(SKY_POOL.project);
      if (!text.includes(expected)) {
        throw new Error(`expected CTA text to include "${expected}" (the real protocol CTA), got "${text}" — looks like the DefiLlama fallback rendered instead, meaning the static tier isn't actually load-bearing here`);
      }
    });

    await test('sky-lending: the fallback CTA still fires pool_click{source=protocol_link} on click', async () => {
      await page.evaluate(() => { window.__events = []; });
      await page.locator('.cta-button-protocol').first().click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link');
      if (clicks.length < 1) throw new Error(`expected a pool_click{source=protocol_link}, got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.pool_project !== 'sky-lending') throw new Error(`expected pool_project=sky-lending, got ${JSON.stringify(clicks[0].eventData)}`);
    });

    // --- DISTINGUISHING negative control (post-182): no tier resolves → the
    // HONEST DEFILLAMA FALLBACK renders (same className, different copy and
    // analytics source), not the real protocol CTA and not nothing. See the
    // file header for why a bare "count === 0" check is no longer valid here.
    await test('unknown protocol: honest DefiLlama fallback renders (.cta-button-protocol present, NOT the protocol-CTA copy)', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(UNKNOWN_POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await page.waitForTimeout(500);
      const cta = page.locator('.cta-button-protocol');
      const count = await cta.count();
      if (count === 0) throw new Error('expected the honest DefiLlama fallback (still .cta-button-protocol className, spec 182 leg B/D) to render for an unresolved protocol — got 0');
      const text = await cta.first().textContent();
      const protocolCtaPhrasing = enStartEarningOn(UNKNOWN_POOL.project);
      if (text.includes('Start Earning') || text.includes(protocolCtaPhrasing)) {
        throw new Error(`fallback copy must not contain protocol-CTA phrasing ("Start Earning" / "${protocolCtaPhrasing}") — got "${text}"`);
      }
      if (!text.includes('DefiLlama')) {
        throw new Error(`expected fallback copy to name DefiLlama (matching translations.js's "${enViewOnDefillama}"), got "${text}"`);
      }
    });

    await test('unknown protocol: clicking the fallback fires pool_click{source=defillama_fallback}, NEVER protocol_link', async () => {
      await page.evaluate(() => { window.__events = []; });
      await page.locator('.cta-button-protocol').first().click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click');
      if (clicks.length < 1) throw new Error(`expected a pool_click, got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.source === 'protocol_link') {
        throw new Error('fallback click fired source=protocol_link — this would silently inflate the north star (spec 182 leg B explicit FAIL condition)');
      }
      if (clicks[0].eventData.source !== 'defillama_fallback') {
        throw new Error(`expected source=defillama_fallback, got ${JSON.stringify(clicks[0].eventData)}`);
      }
    });

    if (pageErrors.length) throw new Error('page errors during test:\n  ' + pageErrors.join('\n  '));
    console.log(`\n  ${passed}/${total} assertions passed`);
    if (process.exitCode) process.exit(process.exitCode);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
