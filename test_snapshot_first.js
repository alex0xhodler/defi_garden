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

   Scenarios (spec 059 E2; (a)/(c2)/(d) explicitly pin ?minTvl=10000000 as of
   spec 173, 2026-07-29 — DEFAULT_MIN_TVL dropped to $100K that day, so the
   bare-URL default they used to rely on for snapshot ELIGIBILITY is gone;
   they now assert the same snapshot mechanics at the floor that's still
   actually snapshot-eligible, SNAPSHOT_MIN_TVL = $10M):
     (a) ?minTvl=10000000 + fresh snapshot + live ABORTED → renders snapshot cards, no live call
     (b) ?minTvl=10000000 + snapshot 404 + live fixture → cards render from live (missing → fallback)
     (c) ?minTvl=10000000 + STALE snapshot (7h > 6h gate) + live fixture → cards render from live AND live was hit
     (c2) ?minTvl=10000000 + WITHIN-GATE snapshot (3h < 6h gate, spec 140) + live ABORTED → snapshot cards, no live call
     (d) ?minTvl=10000000 equivalence: same pools as snapshot vs as live → identical rendered set
     (e) ?minTvl=10000 + fresh snapshot + live fixture → live used (rail-relax gate)
     (f) bare / planner renders with fresh snapshot + live ABORTED (both router paths)
     (g) ?pool=<id> + fresh snapshot + live fixture → live used (sacred deep link)
     (h) spec 173 TRAP CHECK: bare (no ?minTvl=) + fresh snapshot + live fixture →
         DEFAULT now loads LIVE (not the $10M-floored snapshot), and a pool between
         $100K and $10M is visible in the grid
     (i) spec 173 REGRESSION CONTROL: ?minTvl=10000000 serves the snapshot, then
         relaxing the TVL chip below $10M fires the escape-hatch live refetch

   Run: node test_snapshot_first.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

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
// Spec 173 (h): a live pool between the new $100K default and the snapshot's
// own $10M physical floor. The snapshot (SNAPSHOT_POOLS, all >= $10M per its
// own filter) can never legitimately contain this pool, so its appearance
// proves the render came from live, not from the $10M-floored snapshot.
const MIXED_LIVE_POOLS = [
  projPool('live-usdc-1', 'liveproto', 'USDC', 'Base', 60_000_000, 4.0),
  projPool('live-usdc-small', 'liveprotosmall100k', 'USDC', 'Polygon', 500_000, 6.0)
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
 *         live: {pools} | null(=abort) }
 * Returns { context, page, liveHits: () => number }.
 */
async function makeRouted(browser, opts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let liveRequests = 0;

  // Abort every external host except yields.llama.fi (handled below). Localhost
  // (incl. /data/, intercepted per-scenario below) passes through.
  await context.route(u => !u.href.startsWith(`http://localhost:${PORT}`) && !u.href.includes('yields.llama.fi'),
    r => r.abort());

  const page = await context.newPage();

  await page.route(LIVE_URL, (route) => {
    liveRequests++;
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

  return { context, page, liveHits: () => liveRequests };
}

async function cardContexts(page) {
  await page.waitForSelector('.pool-card', { timeout: 15000 });
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pool-context-inline')).map(e => e.textContent.toLowerCase()));
}
function everyIncludes(texts, needle) { return texts.length > 0 && texts.every(t => t.includes(needle)); }
function anyIncludes(texts, needle) { return texts.some(t => t.includes(needle)); }

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // (a) fresh snapshot + live ABORTED → snapshot cards, no live call. Pins
    // ?minTvl=10000000 (spec 173): the bare-URL default is $100K now, which is
    // below SNAPSHOT_MIN_TVL and would never reach the snapshot at all — this
    // scenario tests the snapshot's OWN fetch mechanics, so it must supply an
    // effective minTvl that's still actually snapshot-eligible.
    await test('(a) ?minTvl=10000000 + fresh snapshot + live aborted → renders snapshot cards, no live call', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: null });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC&minTvl=10000000`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!everyIncludes(ctx, 'snapproto')) throw new Error('expected snapshot cards (snapproto), got: ' + JSON.stringify(ctx));
        if (anyIncludes(ctx, 'liveproto')) throw new Error('live pools must not appear when live is aborted');
        if (r.liveHits() !== 0) throw new Error(`expected 0 live requests, got ${r.liveHits()}`);
      } finally { await r.context.close(); }
    });

    // (b) snapshot 404 + live fixture → cards render from live. Pins
    // ?minTvl=10000000 (spec 173) so this scenario still actually exercises the
    // meta-404 fallback path rather than passing vacuously via the (now much
    // lower) default already being snapshot-ineligible.
    await test('(b) ?minTvl=10000000 + snapshot 404 + live fixture → cards render from live (missing → fallback)', async () => {
      const r = await makeRouted(browser, { meta: null, snap: null, live: { pools: LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC&minTvl=10000000`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!everyIncludes(ctx, 'liveproto')) throw new Error('expected live cards (liveproto), got: ' + JSON.stringify(ctx));
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit on snapshot 404');
      } finally { await r.context.close(); }
    });

    // (c) STALE snapshot + live fixture → live cards AND live was hit. Pins
    // ?minTvl=10000000 (spec 173) so this still tests the STALENESS gate
    // specifically, not the (now separate) default-eligibility threshold.
    await test('(c) ?minTvl=10000000 + stale snapshot + live fixture → cards render from live AND live was requested', async () => {
      const stale = staleTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts: stale }, snap: { pools: SNAPSHOT_POOLS, ts: stale }, live: { pools: LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC&minTvl=10000000`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!everyIncludes(ctx, 'liveproto')) throw new Error('stale snapshot must fall back to live, got: ' + JSON.stringify(ctx));
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit for a stale snapshot');
      } finally { await r.context.close(); }
    });

    // (c2) WITHIN-GATE snapshot (3h old, < 6h) + live aborted → snapshot served, no live call.
    //      This is the spec-140 acceptance: an age the OLD 15-min gate would have
    //      rejected now stays on the fast path. Pins ?minTvl=10000000 (spec 173)
    //      for the same reason as (a)/(b)/(c) above.
    await test('(c2) ?minTvl=10000000 + within-gate snapshot (3h < 6h) + live aborted → snapshot cards, no live call', async () => {
      const ts = withinTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: null });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC&minTvl=10000000`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!everyIncludes(ctx, 'snapproto')) throw new Error('expected snapshot cards (snapproto) for a 3h-old snapshot, got: ' + JSON.stringify(ctx));
        if (anyIncludes(ctx, 'liveproto')) throw new Error('live pools must not appear for a within-gate snapshot');
        if (r.liveHits() !== 0) throw new Error(`expected 0 live requests for a 3h-old snapshot, got ${r.liveHits()}`);
      } finally { await r.context.close(); }
    });

    // (d) equivalence: same pools via snapshot vs via live → identical set.
    // Pins ?minTvl=10000000 (spec 173) on both branches so the snapshot branch
    // is actually snapshot-eligible (the bare-URL default no longer is).
    await test('(d) ?minTvl=10000000 equivalence: same pools as snapshot vs as live render the identical card set', async () => {
      const ts = freshTs();
      let viaSnapshot, viaLive;
      const r1 = await makeRouted(browser, { meta: { pools: SHARED_POOLS, ts }, snap: { pools: SHARED_POOLS, ts }, live: null });
      try {
        await r1.page.goto(`http://localhost:${PORT}/home.html?token=USDC&minTvl=10000000`, { waitUntil: 'load', timeout: 20000 });
        viaSnapshot = (await cardContexts(r1.page)).slice().sort();
      } finally { await r1.context.close(); }
      const r2 = await makeRouted(browser, { meta: null, snap: null, live: { pools: SHARED_POOLS } });
      try {
        await r2.page.goto(`http://localhost:${PORT}/home.html?token=USDC&minTvl=10000000`, { waitUntil: 'load', timeout: 20000 });
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

    // (f) bare / planner renders with fresh snapshot + live aborted.
    await test('(f) bare / planner renders from fresh snapshot with live aborted (both router paths)', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: null });
      try {
        await r.page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
        await r.page.waitForSelector('.gp-tagline h1', { timeout: 12000 });
        const h1 = (await r.page.locator('.gp-tagline h1').textContent()).trim();
        if (h1.length === 0) throw new Error('planner hero did not render');
        // Give the planner's idle-scheduled fetch time to run the snapshot path.
        await r.page.waitForTimeout(2500);
        if (r.liveHits() !== 0) throw new Error(`planner fell back to live unexpectedly (live hits ${r.liveHits()})`);
      } finally { await r.context.close(); }
    });

    // (g) ?pool=<id> + fresh snapshot + live fixture → live used (sacred deep link).
    await test('(g) ?pool=<id> + fresh snapshot + live fixture → live used (sacred deep link)', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: { pools: LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=live-usdc-1`, { waitUntil: 'load', timeout: 20000 });
        // The pool only exists in the live fixture — if the snapshot were used
        // for a ?pool= load, this detail view could never resolve.
        await r.page.waitForSelector('.pool-detail-view', { timeout: 15000 });
        if (r.liveHits() < 1) throw new Error('?pool= deep link must always fetch live');
      } finally { await r.context.close(); }
    });

    // (h) SPEC 173 TRAP CHECK — the acceptance criterion this item exists to
    // prove: at the new $100K default (no ?minTvl= at all), the app must NOT
    // serve the $10M-floored static snapshot. If it wrongly did (the exact bug
    // naively renaming DEFAULT_MIN_TVL would have caused), a pool between
    // $100K and $10M could never appear, because the snapshot itself never
    // contains one. live-usdc-small ($500K) is present ONLY in the live
    // fixture, never in SNAPSHOT_POOLS (all >= $10M) — its presence in the
    // rendered grid is the proof the render came from live.
    await test('(h) spec 173 trap check: DEFAULT (no ?minTvl=) + fresh snapshot + live fixture → loads LIVE, and a $100K-$10M pool is visible', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: { pools: MIXED_LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
        const ctx = await cardContexts(r.page);
        if (!anyIncludes(ctx, 'liveprotosmall100k')) {
          throw new Error('expected the $500K live-only pool (liveprotosmall100k) to be visible at the new $100K default, got: ' + JSON.stringify(ctx));
        }
        if (anyIncludes(ctx, 'snapproto')) {
          throw new Error('the $10M-floored snapshot must not serve the default view any more, got: ' + JSON.stringify(ctx));
        }
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit at the new $100K default (snapshot-ineligible)');
      } finally { await r.context.close(); }
    });

    // (i) SPEC 173 REGRESSION CONTROL — item 059's snapshot win must still be
    // intact for a request whose effective minTvl is still >= $10M, AND the
    // escape hatch (spec 059 B3) must still fire the instant that effective
    // floor drops below $10M (e.g. the user picks a lower TVL chip).
    await test('(i) spec 173 regression control: ?minTvl=10000000 serves the snapshot, then relaxing below $10M fires the escape-hatch live refetch', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, { meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts }, live: { pools: MIXED_LIVE_POOLS } });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?token=USDC&minTvl=10000000`, { waitUntil: 'load', timeout: 20000 });
        const initialCtx = await cardContexts(r.page);
        if (!everyIncludes(initialCtx, 'snapproto')) {
          throw new Error('expected the snapshot to serve ?minTvl=10000000, got: ' + JSON.stringify(initialCtx));
        }
        if (r.liveHits() !== 0) throw new Error(`expected 0 live requests before relaxing the floor, got ${r.liveHits()}`);

        // Relax the TVL floor via the real UI chip (not a URL edit) to $100K+,
        // below SNAPSHOT_MIN_TVL — this must trigger the escape-hatch effect.
        await r.page.click('#tvl-btn');
        await r.page.waitForSelector('.global-filter-dropdown', { timeout: 5000 });
        await r.page.evaluate(() => {
          const chip = Array.from(document.querySelectorAll('.global-filter-dropdown .filter-chip'))
            .find(c => c.textContent.trim() === '$100K+');
          if (!chip) throw new Error('no $100K+ TVL chip found');
          chip.click();
        });

        // Poll for the escape hatch's live refetch to land: liveproto-small100k
        // only exists in the live fixture, so its arrival proves the refetch
        // completed and replaced `pools` with the live payload.
        const deadline = Date.now() + 8000;
        let settledCtx = initialCtx;
        while (Date.now() < deadline) {
          settledCtx = await cardContexts(r.page);
          if (anyIncludes(settledCtx, 'liveprotosmall100k')) break;
          await r.page.waitForTimeout(150);
        }
        if (!anyIncludes(settledCtx, 'liveprotosmall100k')) {
          throw new Error('escape hatch never surfaced the live $500K pool after relaxing below $10M, got: ' + JSON.stringify(settledCtx));
        }
        if (r.liveHits() < 1) throw new Error('expected the escape-hatch live refetch to hit the live endpoint after relaxing below $10M');
      } finally { await r.context.close(); }
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed}/10 snapshot-first scenarios passed`);
  if (passed !== 10) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_snapshot_first crashed: ' + err.message);
  process.exitCode = 1;
});
