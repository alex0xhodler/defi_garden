/* Playwright acceptance gate for spec 059 (snapshot-first FE with live fallback).
   Drives the REAL rendered home.html analytics app + planner (compiled/minified
   artifacts, exactly what ships) and asserts on rendered pool cards / the planner
   hero — never on fetch internals alone. Fixture-routed per the test_search.js /
   test_hero_copy.js pattern: a local http-server serves the repo, page.route
   intercepts yields.llama.fi and the /data/ snapshot URLs, and all other
   external hosts are aborted.

   The snapshot fixture and the live fixture carry DIFFERENT, identifiable
   projects ("snapproto" vs "liveproto") so which data path served the render is
   observable in the card context text. A "fresh" snapshot is stamped with a
   generatedAt of NOW at test runtime (never a committed date). Scenarios that
   must fall back to live also assert the live endpoint was actually requested.

   Scenarios (spec 059 E2, extended by spec 214 for snapshot-present `?pool=`
   arrivals — see (h)/(i)/(j)/(k)):
     (a) fresh snapshot + live ABORTED → ?token=USDC renders snapshot cards, no live call
     (b) snapshot 404 + live fixture → cards render from live (missing → fallback)
     (c) STALE snapshot (7h > 6h gate) + live fixture → cards render from live AND live was hit
     (c2) WITHIN-GATE snapshot (3h < 6h gate, spec 140) + live ABORTED → snapshot cards, no live call
     (d) equivalence: same pools as snapshot vs as live → identical rendered set
     (e) ?minTvl=10000 + fresh snapshot + live fixture → live used (rail-relax gate)
     (f) /plan.html planner renders with fresh snapshot + live ABORTED
     (f2) bare / landing renders from fresh snapshot with live ABORTED, planner not mounted (both router paths)
     (g) ?pool=<id absent from snapshot> + fresh snapshot + live fixture → the id was
         never snapshot-eligible, so live is used and the page renders exactly as today
     (h) [spec 214] ?pool=<snapshot-present id> + fresh snapshot + live given an
         INDEFINITE delay (never fulfilled/aborted, not merely aborted — proves the
         paint doesn't block on live settling either way) → pool-detail paints from
         the snapshot pool, and the live request never completes
     (i) [spec 214] ?pool=<id absent from BOTH snapshot and live> + fresh snapshot +
         live fixture → falls through to live (which also lacks the id) → the honest
         072 dead-pool empty state renders, and live WAS hit
     (j) [spec 214] STALE snapshot (7h > 6h gate) + ?pool=<snapshot-present id> + live
         fixture containing that id under a different project → falls through to live
         (today's non-pool stale behavior, now also proven for pool arrivals)
     (k) [spec 214, strengthened attempt 2] data_load_time's DELIVERED
         performance_metric Analytics.track payload: source: 'snapshot' on the
         (h)-shaped path, source: 'live' on a live pool arrival (plus a folded-in
         trackPerformance call-boundary check)

   Run: node test_snapshot_first.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
// Runtime strings straight from the source of truth (mirrors test_dead_pool.js).
const { translations: tr } = require('./translations.js');
const EN_DEAD_POOL_TITLE = tr.en.poolNotFoundTitle;

const PORT = 8801;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const LIVE_URL = 'https://yields.llama.fi/pools';

// --- fixtures: projected 13-field pools ------------------------------------
function projPool(id, project, symbol, chain, tvl, apyBase) {
  return {
    pool: id, project, symbol, chain, tvlUsd: tvl,
    apyBase: apyBase || 0, apyReward: 0, apyMean30d: apyBase || 0,
    poolMeta: null, url: 'https://example.test/' + id,
    exposure: 'single', ilRisk: 'no', underlyingTokens: ['0x' + id]
  };
}
const SNAPSHOT_POOLS = [
  projPool('snap-usdc-1', 'snapproto', 'USDC', 'Ethereum', 55_000_000, 4.2),
  projPool('snap-usdc-2', 'snapprotob', 'USDC', 'Arbitrum', 30_000_000, 5.1)
];
const LIVE_POOLS = [
  projPool('live-usdc-1', 'liveproto', 'USDC', 'Base', 60_000_000, 4.0),
  projPool('live-usdc-2', 'liveprotob', 'USDC', 'Optimism', 25_000_000, 3.9)
];
const SHARED_POOLS = [
  projPool('shared-usdc-1', 'sharedproto', 'USDC', 'Ethereum', 50_000_000, 4.5),
  projPool('shared-usdc-2', 'sharedprotob', 'USDC', 'Polygon', 22_000_000, 3.7)
];
// spec 214 fixtures --------------------------------------------------------
// An id absent from every fixture in this file (snapshot AND live) — used to
// prove a truly dead id still falls through to the 072 empty state.
const GHOST_ID = 'ghost-pool-none';
// Same id as SNAPSHOT_POOLS[0] ('snap-usdc-1') but served by the LIVE fixture
// under a different project, so a render sourced from live vs. snapshot is
// distinguishable by which project name paints.
const LIVE_MATCH_POOLS = [
  projPool('snap-usdc-1', 'liveprotomatch', 'USDC', 'Base', 70_000_000, 4.4)
];

function snapshotEnvelope(pools, generatedAt) {
  return { schemaVersion: 1, generatedAt, source: LIVE_URL, minTvlUsd: 10000000, count: pools.length, pools };
}
function metaFor(pools, generatedAt) {
  const body = JSON.stringify(snapshotEnvelope(pools, generatedAt));
  return { schemaVersion: 1, generatedAt, count: pools.length, bytes: Buffer.byteLength(body, 'utf8') };
}
function liveBody(pools) { return JSON.stringify({ status: 'success', data: pools }); }
const freshTs = () => new Date().toISOString();
const withinTs = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h old < 6h gate → snapshot still served (spec 140)
const staleTs = () => new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(); // 7h old > 6h gate (spec 140) → live

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

/**
 * Build a routed context+page.
 * opts: { meta: {ok,pools,ts} | null(=404), snap: {ok,pools,ts} | null(=404),
 *         live: {pools} | 'hang'(=never fulfilled/aborted) | null(=abort) }
 * Returns { context, page, liveHits: () => number, liveCompleted: () => boolean }.
 * liveCompleted tracks whether the live request ever reached a terminal state
 * (response or network failure) — used by spec 214 scenario (h) to prove a
 * snapshot paint doesn't wait on an in-flight live request.
 */
async function makeRouted(browser, opts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let liveRequests = 0;
  let liveCompleted = false;

  // Abort every external host except yields.llama.fi (handled below). Localhost
  // (incl. /data/, intercepted per-scenario below) passes through.
  await context.route(u => !u.href.startsWith(`http://localhost:${PORT}`) && !u.href.includes('yields.llama.fi'),
    r => r.abort());

  const page = await context.newPage();
  page.on('requestfinished', (req) => { if (req.url() === LIVE_URL) liveCompleted = true; });
  page.on('requestfailed', (req) => { if (req.url() === LIVE_URL) liveCompleted = true; });

  await page.route(LIVE_URL, (route) => {
    liveRequests++;
    if (opts.live === 'hang') return; // never settle — request stays in flight
    if (opts.live) route.fulfill({ status: 200, contentType: 'application/json', body: liveBody(opts.live.pools) });
    else route.abort();
  });

  const metaUrl = `http://localhost:${PORT}/data/pools-snapshot-meta.json`;
  const snapUrl = `http://localhost:${PORT}/data/pools-snapshot.json`;
  await page.route(metaUrl, (route) => {
    if (!opts.meta) { route.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }); return; }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metaFor(opts.meta.pools, opts.meta.ts)) });
  });
  await page.route(snapUrl, (route) => {
    if (!opts.snap) { route.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }); return; }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshotEnvelope(opts.snap.pools, opts.snap.ts)) });
  });

  return { context, page, liveHits: () => liveRequests, liveCompleted: () => liveCompleted };
}

async function cardContexts(page) {
  await page.waitForSelector('.pool-card', { timeout: 15000 });
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pool-context-inline')).map(e => e.textContent.toLowerCase()));
}
function everyIncludes(texts, needle) { return texts.length > 0 && texts.every(t => t.includes(needle)); }
function anyIncludes(texts, needle) { return texts.some(t => t.includes(needle)); }

// Reads the pool-detail's project name (PoolDetail.js's `.protocol-name`
// span renders `pool.project` verbatim) — the identifiable text that proves
// which data source (snapshot vs live) served the render.
async function poolDetailProject(page) {
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  return (await page.locator('.protocol-name').first().textContent()).trim().toLowerCase();
}

// Spec 214 (k), attempt 2: the verifier found that analytics.js's
// trackPerformance() dropped context.source/context.pools_count before they
// ever reached the tracked payload — so attempt 1's spy on
// Analytics.trackPerformance itself only proved the CALL SITE (app.js) was
// correct, not that the criterion ("the data_load_time perf event carries
// source: snapshot vs live") actually held for the event that gets tracked.
// analytics.js has been fixed (this item) to forward `source`/`pools_count`
// into the payload it hands to `track()`, so we now spy at the delivered-
// payload boundary instead: Analytics.track(eventName, eventData), the same
// wrap-before-delegate choke point test_analytics_fires.js /
// test_northstar_cta_fires.js already spy on. `Analytics.track` is entered
// (and eventData is fully assembled) BEFORE its internal isProductionHost()
// suppression check (analytics.js's track(): the gate is the first statement
// *inside* the function body, after the wrapper has already captured the
// call), so the payload is observable here regardless of host-gating (spec
// 096) — confirmed by reading analytics.js and by the established tests
// using this exact spy point under the same localhost-suppressed conditions.
// addInitScript so it's installed before app.js's background fetch effect
// can race it.
//
// We also keep a lightweight trackPerformance call-boundary capture
// (folded in below) since it still adds signal — it isolates "did app.js
// pass the right context" from "did analytics.js forward it" — but the
// assertion that decides pass/fail is the delivered Analytics.track payload.
async function installPerfSpy(page) {
  await page.addInitScript(() => {
    window.__trackEvents = [];
    window.__perfCallContexts = [];
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.track || !Analytics.trackPerformance) { setTimeout(install, 0); return; }
      const origTrack = Analytics.track.bind(Analytics);
      Analytics.track = (eventName, eventData) => {
        window.__trackEvents.push({ eventName, eventData });
        return origTrack(eventName, eventData);
      };
      const origPerf = Analytics.trackPerformance.bind(Analytics);
      Analytics.trackPerformance = (metric, value, context) => {
        window.__perfCallContexts.push({ metric, value, context });
        return origPerf(metric, value, context);
      };
    };
    install();
  });
}

// Polls for the delivered `performance_metric` Analytics.track payload whose
// metric_name matches, returning its eventData (the actual tracked object —
// this is what a Mixpanel report would see, modulo host-gate suppression).
async function pollPerfEvents(page, metric, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const events = await page.evaluate(() => window.__trackEvents || []);
    const hit = events.find((e) => e.eventName === 'performance_metric' && e.eventData && e.eventData.metric_name === metric);
    if (hit || Date.now() > deadline) return hit ? hit.eventData : null;
    await page.waitForTimeout(100);
  }
}

// Reads back the raw context app.js passed into Analytics.trackPerformance
// (the call-boundary check folded in per the task's instructions) — proves
// the call site independently of whether analytics.js forwards it.
async function pollPerfCallContext(page, metric, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const calls = await page.evaluate(() => window.__perfCallContexts || []);
    const hit = calls.find((c) => c.metric === metric);
    if (hit || Date.now() > deadline) return hit ? hit.context : null;
    await page.waitForTimeout(100);
  }
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // (a) fresh snapshot + live ABORTED → snapshot cards, no live call.
    await test('(a) fresh snapshot + live aborted → ?token=USDC renders snapshot cards, no live call', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: null });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!everyIncludes(ctx, 'snapproto')) throw new Error('expected snapshot cards (snapproto), got: ' + JSON.stringify(ctx));
        if (anyIncludes(ctx, 'liveproto')) throw new Error('live pools must not appear when live is aborted');
        if (r.liveHits() !== 0) throw new Error(`expected 0 live requests, got ${r.liveHits()}`);
      } finally { await r.context.close(); }
    });

    // (b) snapshot 404 + live fixture → cards render from live.
    await test('(b) snapshot 404 + live fixture → cards render from live (missing → fallback)', async () => {
      const r = await makeRouted(browser, { meta: null, snap: null, live: { pools: LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!everyIncludes(ctx, 'liveproto')) throw new Error('expected live cards (liveproto), got: ' + JSON.stringify(ctx));
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit on snapshot 404');
      } finally { await r.context.close(); }
    });

    // (c) STALE snapshot + live fixture → live cards AND live was hit.
    await test('(c) stale snapshot + live fixture → cards render from live AND live was requested', async () => {
      const stale = staleTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts: stale }, snap: { pools: SNAPSHOT_POOLS, ts: stale }, live: { pools: LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!everyIncludes(ctx, 'liveproto')) throw new Error('stale snapshot must fall back to live, got: ' + JSON.stringify(ctx));
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit for a stale snapshot');
      } finally { await r.context.close(); }
    });

    // (c2) WITHIN-GATE snapshot (3h old, < 6h) + live aborted → snapshot served, no live call.
    //      This is the spec-140 acceptance: an age the OLD 15-min gate would have
    //      rejected now stays on the fast path.
    await test('(c2) within-gate snapshot (3h < 6h) + live aborted → snapshot cards, no live call', async () => {
      const ts = withinTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: null });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!everyIncludes(ctx, 'snapproto')) throw new Error('expected snapshot cards (snapproto) for a 3h-old snapshot, got: ' + JSON.stringify(ctx));
        if (anyIncludes(ctx, 'liveproto')) throw new Error('live pools must not appear for a within-gate snapshot');
        if (r.liveHits() !== 0) throw new Error(`expected 0 live requests for a 3h-old snapshot, got ${r.liveHits()}`);
      } finally { await r.context.close(); }
    });

    // (d) equivalence: same pools via snapshot vs via live → identical set.
    await test('(d) equivalence: same pools as snapshot vs as live render the identical card set', async () => {
      const ts = freshTs();
      let viaSnapshot, viaLive;
      const r1 = await makeRouted(browser, { meta: { pools: SHARED_POOLS, ts }, snap: { pools: SHARED_POOLS, ts }, live: null });
      try {
        await r1.page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
        viaSnapshot = (await cardContexts(r1.page)).slice().sort();
      } finally { await r1.context.close(); }
      const r2 = await makeRouted(browser, { meta: null, snap: null, live: { pools: SHARED_POOLS } });
      try {
        await r2.page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
        viaLive = (await cardContexts(r2.page)).slice().sort();
      } finally { await r2.context.close(); }
      if (JSON.stringify(viaSnapshot) !== JSON.stringify(viaLive)) {
        throw new Error(`snapshot vs live rendered different sets:\n  snapshot: ${JSON.stringify(viaSnapshot)}\n  live: ${JSON.stringify(viaLive)}`);
      }
      if (!everyIncludes(viaSnapshot, 'sharedproto')) throw new Error('expected the shared pool set to render');
    });

    // (e) ?minTvl=10000 + fresh snapshot + live fixture → live used.
    await test('(e) ?minTvl=10000 (below floor) + fresh snapshot → live used (rail-relax gate)', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: { pools: LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC&minTvl=10000`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!anyIncludes(ctx, 'liveproto')) throw new Error('below-floor minTvl must load live, got: ' + JSON.stringify(ctx));
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit when minTvl < $10M');
      } finally { await r.context.close(); }
    });

    // (f) /plan.html planner renders with fresh snapshot + live aborted.
    // Repointed from bare `/` per the 2026-07-15 landing pivot (home.html:82):
    // bare `/` now mounts the search-first landing into #landing-root, not the
    // planner, so `.gp-tagline h1` (planner-only markup) can never appear there.
    // The planner moved to the `/plan.html` route (`isPlannerPath`, home.html:80).
    // See (f2) below for the re-homed bare-`/` coverage.
    await test('(f) /plan.html planner renders from fresh snapshot with live aborted', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: null });
      try {
        await r.page.goto(`http://localhost:${PORT}/plan.html`, { waitUntil: 'load', timeout: 20000 });
        await r.page.waitForSelector('.gp-tagline h1', { timeout: 12000 });
        const h1 = (await r.page.locator('.gp-tagline h1').textContent()).trim();
        if (h1.length === 0) throw new Error('planner hero did not render');
        // Give the planner's idle-scheduled fetch time to run the snapshot path.
        await r.page.waitForTimeout(2500);
        if (r.liveHits() !== 0) throw new Error(`planner fell back to live unexpectedly (live hits ${r.liveHits()})`);
      } finally { await r.context.close(); }
    });

    // (f2) re-homed coverage (156 pattern): bare / no longer mounts the planner
    // (home.html:82's 3-way router — landing pivot, 2026-07-15). It mounts the
    // search-first landing into #landing-root, which issues no pool-data fetch
    // of its own (landing.js has no snapshot/live fetch path), so live must
    // still read 0 hits. Also assert the planner did NOT mount, mirroring
    // test_smoke.js:181-187.
    await test('(f2) bare / landing renders from fresh snapshot with live aborted, planner not mounted (both router paths)', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: null });
      try {
        await r.page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
        await r.page.waitForSelector('[data-testid="landing-search"]', { timeout: 12000 });
        const plannerMounted = await r.page.locator('#planner-root .gp-app').count();
        if (plannerMounted !== 0) throw new Error('planner mounted on bare / (expected only the landing)');
        // Give any idle-scheduled fetch time to run before asserting no live call.
        await r.page.waitForTimeout(2500);
        if (r.liveHits() !== 0) throw new Error(`landing made an unexpected live request (live hits ${r.liveHits()})`);
      } finally { await r.context.close(); }
    });

    // (g) [was "sacred deep link — always live"; spec 214 makes pool arrivals
    // snapshot-eligible, but this id ('live-usdc-1') is absent from the
    // snapshot fixture, so it was never eligible for the snapshot path either
    // way — it still falls through to live and renders exactly as today.]
    await test('(g) ?pool=<id absent from snapshot> + fresh snapshot + live fixture → falls through to live, renders as today', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: { pools: LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=live-usdc-1`, { waitUntil: 'load', timeout: 20000 });
        // The pool only exists in the live fixture — if the snapshot were used
        // for a ?pool= load, this detail view could never resolve.
        await r.page.waitForSelector('.pool-detail-view', { timeout: 15000 });
        if (r.liveHits() < 1) throw new Error('a snapshot-absent ?pool= id must still fall through to live');
      } finally { await r.context.close(); }
    });

    // (h) [spec 214] ?pool=<snapshot-present id> + fresh snapshot + live given
    // an INDEFINITE delay → paints from the snapshot pool without ever
    // waiting on live to settle. The live route is left permanently
    // unfulfilled/unaborted (rather than merely aborted) so that if a future
    // regression made the paint depend on live resolving, this test would
    // time out on .pool-detail-view instead of silently passing.
    await test('(h) ?pool=<snapshot-present id> + fresh snapshot + live given an indefinite delay → paints from snapshot, live never completes', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: 'hang' });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=snap-usdc-1`, { waitUntil: 'load', timeout: 20000 });
        const project = await poolDetailProject(r.page);
        if (project !== 'snapproto') throw new Error(`expected the rendered pool detail to be the snapshot pool (snapproto), got "${project}"`);
        // Give any (incorrect) hidden live dependency a moment to surface before asserting.
        await r.page.waitForTimeout(500);
        if (r.liveHits() !== 0) throw new Error(`expected 0 live requests for a snapshot-resolved pool arrival, got ${r.liveHits()}`);
        if (r.liveCompleted()) throw new Error('expected the live request to never complete while the snapshot paints the pool detail');
      } finally {
        await r.page.unroute(LIVE_URL).catch(() => {});
        await r.context.close();
      }
    });

    // (i) [spec 214] ?pool=<id absent from BOTH snapshot and live> + fresh
    // snapshot + live fixture → the snapshot declines (id not present), falls
    // through to live (which also lacks the id), and the honest 072 dead-pool
    // empty state renders — mirroring test_dead_pool.js's assertion style.
    await test('(i) ?pool=<id absent from snapshot AND live> + fresh snapshot + live fixture → honest dead-pool empty state, live was hit', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: { pools: LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${GHOST_ID}`, { waitUntil: 'load', timeout: 20000 });
        await r.page.waitForSelector('.empty-state', { timeout: 15000 });
        await r.page.waitForFunction((title) => {
          const el = document.querySelector('.empty-state .empty-message');
          return el && el.textContent.trim() === title;
        }, EN_DEAD_POOL_TITLE, { timeout: 8000 });
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit once the snapshot declined the id');
      } finally { await r.context.close(); }
    });

    // (j) [spec 214] STALE snapshot (7h > 6h gate) + ?pool=<snapshot-present
    // id> + live fixture containing that SAME id under a different project →
    // falls through to live exactly like the non-pool stale case (c), now
    // proven for a pool arrival too. LIVE_MATCH_POOLS reuses SNAPSHOT_POOLS[0]'s
    // id under project "liveprotomatch" so the render is unambiguously live-sourced.
    await test('(j) STALE snapshot (7h) + ?pool=<snapshot-present id> + live fixture with that id → falls through to live', async () => {
      const stale = staleTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts: stale }, snap: { pools: SNAPSHOT_POOLS, ts: stale }, live: { pools: LIVE_MATCH_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=snap-usdc-1`, { waitUntil: 'load', timeout: 20000 });
        const project = await poolDetailProject(r.page);
        if (project !== 'liveprotomatch') throw new Error(`expected the stale snapshot to fall through to live (liveprotomatch), got "${project}"`);
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit for a stale snapshot on a pool arrival');
      } finally { await r.context.close(); }
    });

    // (k) [spec 214, strengthened attempt 2] data_load_time's DELIVERED
    // performance_metric event (the Analytics.track payload — what a
    // Mixpanel report would actually see, modulo host-gate suppression)
    // carries source: 'snapshot' on a snapshot-resolved pool arrival, and
    // source: 'live' on a live-resolved pool arrival. This is the assertion
    // AC7 requires: attempt 1's version only checked the trackPerformance
    // call boundary (proving app.js's call site, not the delivered event),
    // which is why it passed against a version of analytics.js that silently
    // dropped `source` before it ever reached the tracked payload. The
    // call-boundary check is folded in below as a secondary, weaker
    // assertion — see installPerfSpy's comment for why the delivered-payload
    // check at Analytics.track is the one that decides pass/fail.
    await test("(k) data_load_time's DELIVERED performance_metric event carries source: 'snapshot' on the snapshot path and 'live' on the live path", async () => {
      const ts = freshTs();
      const rSnap = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: null });
      try {
        await installPerfSpy(rSnap.page);
        await rSnap.page.goto(`http://localhost:${PORT}/home.html?pool=snap-usdc-1`, { waitUntil: 'load', timeout: 20000 });
        await poolDetailProject(rSnap.page);
        const callCtx = await pollPerfCallContext(rSnap.page, 'data_load_time', 5000);
        if (!callCtx) throw new Error('expected a trackPerformance("data_load_time", ...) call on the snapshot path');
        if (callCtx.source !== 'snapshot') throw new Error(`call-boundary: expected source=snapshot, got ${JSON.stringify(callCtx)}`);
        const delivered = await pollPerfEvents(rSnap.page, 'data_load_time', 5000);
        if (!delivered) throw new Error('expected a delivered performance_metric Analytics.track event on the snapshot path');
        if (delivered.source !== 'snapshot') throw new Error(`delivered payload: expected source=snapshot, got ${JSON.stringify(delivered)}`);
        if (delivered.pools_count !== SNAPSHOT_POOLS.length) throw new Error(`delivered payload: expected pools_count=${SNAPSHOT_POOLS.length}, got ${JSON.stringify(delivered)}`);
      } finally { await rSnap.context.close(); }

      const rLive = await makeRouted(browser, { meta: null, snap: null, live: { pools: LIVE_POOLS } });
      try {
        await installPerfSpy(rLive.page);
        await rLive.page.goto(`http://localhost:${PORT}/home.html?pool=live-usdc-1`, { waitUntil: 'load', timeout: 20000 });
        await poolDetailProject(rLive.page);
        const callCtx = await pollPerfCallContext(rLive.page, 'data_load_time', 5000);
        if (!callCtx) throw new Error('expected a trackPerformance("data_load_time", ...) call on the live path');
        if (callCtx.source !== 'live') throw new Error(`call-boundary: expected source=live, got ${JSON.stringify(callCtx)}`);
        const delivered = await pollPerfEvents(rLive.page, 'data_load_time', 5000);
        if (!delivered) throw new Error('expected a delivered performance_metric Analytics.track event on the live path');
        if (delivered.source !== 'live') throw new Error(`delivered payload: expected source=live, got ${JSON.stringify(delivered)}`);
        if (delivered.pools_count !== LIVE_POOLS.length) throw new Error(`delivered payload: expected pools_count=${LIVE_POOLS.length}, got ${JSON.stringify(delivered)}`);
      } finally { await rLive.context.close(); }
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed}/13 snapshot-first scenarios passed`);
  if (passed !== 13) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_snapshot_first crashed: ' + err.message);
  process.exitCode = 1;
});
