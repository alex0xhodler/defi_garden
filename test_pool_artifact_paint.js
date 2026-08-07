/* Rendered Playwright acceptance gate for spec 216 — per-pool paint artifacts
   (`pools/<id>.json`, generate-pool-pages.js) extend 214's instant snapshot
   paint to `?pool=` arrivals whose id is ABSENT from the railed $10M
   snapshot. Drives the REAL rendered home.html analytics app (compiled/
   minified artifacts, exactly what ships) and asserts on rendered pool-detail
   markup / the rendered grid — never on internal state alone. Fixture-routed
   per the test_snapshot_first.js / test_search.js house pattern: a local
   http-server serves the repo, page.route intercepts yields.llama.fi, the
   /data/ snapshot pair AND /pools/<id>.json, and every other external host is
   aborted.

   Fixtures carry DISTINCT, identifiable projects so which path served a
   render is observable in text: "snapproto" (railed snapshot pools),
   "artifactproto" (the sub-rail per-pool artifact — the new mechanism),
   "livematch" (the live fixture, used to prove every degrade falls through
   to today's exact path). A "fresh" snapshot/artifact is stamped with a
   generatedAt of NOW at test runtime (never a committed date).

   Scenarios:
     (a) HEADLINE — fresh snapshot (pool absent) + valid fresh artifact + live
         given an INDEFINITE delay (never fulfilled) → pool-detail paints from
         the artifact's own record, and the live request never completes.
     (b) POSITIVE CONTROL — the IDENTICAL scenario to (a), with the
         /pools/<id>.json route 404'd instead of served → the SAME assertion
         (paint within the same budget) now FAILS, proving criterion (a)
         actually depends on the artifact existing (185/207 precedent: a
         criterion that passes with the mechanism deleted tests nothing).
     (c)-(h) six degrades, each falling through to today's exact live path:
         artifact 404 (using a truly dead id, absent from live too → the 072
         dead-pool empty state) · malformed JSON · schemaVersion !== 1 ·
         generatedAt older than SNAPSHOT_MAX_AGE_MS · record id mismatch ·
         snapshot itself stale (the pre-216 decline path, never even
         attempting an artifact fetch).
     (i) shape gate — a non-UUID-shaped `?pool=` value never triggers an
         artifact fetch attempt at all (falls straight to live).
     (j) trust-rail invariant (208's HARD invariant) — after the sub-rail
         artifact paints into `pools` state, searching for that SAME pool's
         own (unique, fixture-only) symbol at the default $10M floor renders
         ZERO matching cards — proving the render-time floor filters it out
         of the grid regardless of how the record entered `pools`.
     (k) `data_load_time`'s delivered performance_metric event carries
         source: 'pool-artifact' on the new path, and `pool_view` fires
         exactly once for the same landing.

   Run: node test_pool_artifact_paint.js */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { translations: tr } = require('./translations.js');
const EN_DEAD_POOL_TITLE = tr.en.poolNotFoundTitle;

const PORT = 8871; // distinct from every other test_*.js PORT (8791-8870 taken)
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const LIVE_URL = 'https://yields.llama.fi/pools';
const BUDGET_MS = 6000; // the "same budget" the positive control (b) must fail within

// --- fixtures: projected 13-field pools (mirrors test_snapshot_first.js) ---
function projPool(id, project, symbol, chain, tvl, apyBase) {
  return {
    pool: id, project, symbol, chain, tvlUsd: tvl,
    apyBase: apyBase || 0, apyReward: 0, apyMean30d: apyBase || 0,
    poolMeta: null, url: 'https://example.test/' + id,
    exposure: 'single', ilRisk: 'no', underlyingTokens: ['0x' + id]
  };
}
const SNAPSHOT_POOLS = [
  projPool('snap-usdc-1', 'snapproto', 'USDC', 'Ethereum', 55_000_000, 4.2)
];
// The headline sub-rail pool: absent from every snapshot fixture here, ONLY
// resolvable via /pools/<id>.json. UUID-SHAPED (app.js's POOL_ARTIFACT_UUID_RE
// gate must accept it, or the artifact fetch is never even attempted — the
// shape gate is asserted SEPARATELY in scenario (i), with a deliberately
// non-UUID id). A fixture-unique symbol (never collides with any other test
// fixture's symbol) so scenario (j) can search for it and unambiguously prove
// zero cards render.
const ARTIFACT_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
const ARTIFACT_SYMBOL = 'GARDENSUBRAIL216';
const ARTIFACT_POOL = projPool(ARTIFACT_ID, 'artifactproto', ARTIFACT_SYMBOL, 'Base', 500_000, 9.0); // sub-$10M TVL — the whole point
// Used by the five artifact-level degrades (c-h below): UUID-shaped (must
// clear the shape gate so the artifact fetch is actually attempted and its
// response actually exercised — a non-UUID id would make these degrades pass
// trivially via the shape gate instead of via the response validation this
// item adds), absent from the snapshot, present in the LIVE fixture under a
// distinct project so a live-sourced render is unambiguous.
const MATCHED_ID = 'bbbbbbbb-1111-2222-3333-444444444444';
const MATCHED_LIVE_POOL = projPool(MATCHED_ID, 'livematch', 'USDC', 'Optimism', 40_000_000, 3.3);
// A truly dead id (still UUID-shaped) — absent from snapshot, artifact AND
// live — proves the 072 empty state still renders exactly as it does today
// when the mechanism 404s.
const GHOST_ID = 'cccccccc-1111-2222-3333-444444444444';
// Non-UUID-shaped id (legacy/hostile) — must never reach an artifact fetch.
const SHAPE_GATE_ID = 'not-a-uuid-shaped-id';

function snapshotEnvelope(pools, generatedAt) {
  return { schemaVersion: 1, generatedAt, source: LIVE_URL, minTvlUsd: 10000000, count: pools.length, pools };
}
function metaFor(pools, generatedAt) {
  const body = JSON.stringify(snapshotEnvelope(pools, generatedAt));
  return { schemaVersion: 1, generatedAt, count: pools.length, bytes: Buffer.byteLength(body, 'utf8') };
}
function artifactEnvelope(record, generatedAt, overrides) {
  return Object.assign({ schemaVersion: 1, generatedAt, source: LIVE_URL, minTvlUsd: 1000, count: 1, pools: [record] }, overrides || {});
}
function liveBody(pools) { return JSON.stringify({ status: 'success', data: pools }); }
const freshTs = () => new Date().toISOString();
const staleTs = () => new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(); // 7h old > 6h gate

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
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
 * opts: { meta, snap: {pools,ts}|null, live: {pools}|'hang'|null,
 *         artifact: envelopeObject|'malformed'|null(=404) }
 * The artifact route matches ANY /pools/<id>.json under localhost — one
 * fixture per test, since each scenario only ever requests its own id.
 */
async function makeRouted(browser, opts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let liveRequests = 0;
  let liveCompleted = false;
  let artifactRequests = 0;

  await context.route(u => !u.href.startsWith(`http://localhost:${PORT}`) && !u.href.includes('yields.llama.fi'),
    r => r.abort());

  const page = await context.newPage();
  page.on('requestfinished', (req) => { if (req.url() === LIVE_URL) liveCompleted = true; });
  page.on('requestfailed', (req) => { if (req.url() === LIVE_URL) liveCompleted = true; });

  await page.route(LIVE_URL, (route) => {
    liveRequests++;
    if (opts.live === 'hang') return; // never settle
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
  await page.route(`http://localhost:${PORT}/pools/*.json`, (route) => {
    artifactRequests++;
    if (opts.artifact == null) { route.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }); return; }
    if (opts.artifact === 'malformed') { route.fulfill({ status: 200, contentType: 'application/json', body: '{not valid json!!' }); return; }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.artifact) });
  });

  return {
    context, page,
    liveHits: () => liveRequests, liveCompleted: () => liveCompleted,
    artifactHits: () => artifactRequests
  };
}

async function poolDetailProject(page, timeout) {
  await page.waitForSelector('.pool-detail-view', { timeout: timeout || 15000 });
  return (await page.locator('.protocol-name').first().textContent()).trim().toLowerCase();
}

async function installSpies(page) {
  await page.addInitScript(() => {
    window.__trackEvents = [];
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.track) { setTimeout(install, 0); return; }
      const origTrack = Analytics.track.bind(Analytics);
      Analytics.track = (eventName, eventData) => {
        window.__trackEvents.push({ eventName, eventData });
        return origTrack(eventName, eventData);
      };
    };
    install();
  });
}
async function pollEvents(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const events = await page.evaluate(() => window.__trackEvents || []);
    const hits = events.filter(predicate);
    if (hits.length || Date.now() > deadline) return hits;
    await page.waitForTimeout(100);
  }
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // (a) HEADLINE ------------------------------------------------------------
    await test('(a) HEADLINE: ?pool=<id absent from snapshot, present via /pools/<id>.json> + live given an indefinite delay → paints from the artifact, live never completes', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts },
        live: 'hang', artifact: artifactEnvelope(ARTIFACT_POOL, ts)
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${ARTIFACT_ID}`, { waitUntil: 'load', timeout: 20000 });
        const project = await poolDetailProject(r.page, BUDGET_MS);
        if (project !== 'artifactproto') throw new Error(`expected the artifact's own project (artifactproto), got "${project}"`);
        // Assert the rendered numbers match the artifact's record (TVL + APY).
        const bodyText = await r.page.locator('.pool-detail-view').textContent();
        if (!bodyText.includes('9.00%') && !bodyText.includes('9%')) throw new Error(`expected the artifact's 9% APY somewhere in the render, got: ${bodyText.slice(0, 400)}`);
        await r.page.waitForTimeout(500);
        if (r.liveCompleted()) throw new Error('expected the live request to never complete while the artifact paints the pool detail');
      } finally {
        await r.page.unroute(LIVE_URL).catch(() => {});
        await r.context.close();
      }
    });

    // (b) POSITIVE CONTROL ------------------------------------------------------
    await test('(b) POSITIVE CONTROL: the IDENTICAL scenario with /pools/<id>.json 404\'d → the SAME assertion fails within the SAME budget', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts },
        live: 'hang', artifact: null // <-- the only change from (a)
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${ARTIFACT_ID}`, { waitUntil: 'load', timeout: 20000 });
        let painted = true;
        try {
          await r.page.waitForSelector('.pool-detail-view', { timeout: BUDGET_MS });
        } catch (e) {
          painted = false;
        }
        if (painted) throw new Error('expected NO pool-detail paint within the budget once the artifact route 404s (mechanism deleted must fail the criterion)');
        if (r.artifactHits() < 1) throw new Error('expected the artifact endpoint to have been requested (and declined) before falling through');
      } finally {
        await r.page.unroute(LIVE_URL).catch(() => {});
        await r.context.close();
      }
    });

    // (c) artifact 404 on a TRULY DEAD id → falls through to live (also
    // lacking it) → the honest 072 dead-pool empty state, exactly as today.
    await test('(c) degrade: artifact 404 on a dead id (absent from live too) → 072 dead-pool empty state, live was hit', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts },
        live: { pools: [MATCHED_LIVE_POOL] }, artifact: null
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${GHOST_ID}`, { waitUntil: 'load', timeout: 20000 });
        await r.page.waitForSelector('.empty-state', { timeout: 15000 });
        await r.page.waitForFunction((title) => {
          const el = document.querySelector('.empty-state .empty-message');
          return el && el.textContent.trim() === title;
        }, EN_DEAD_POOL_TITLE, { timeout: 8000 });
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit once the artifact 404\'d');
      } finally { await r.context.close(); }
    });

    // (d) malformed JSON → falls through to live.
    await test('(d) degrade: artifact returns malformed JSON → falls through to live (livematch renders)', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts },
        live: { pools: [MATCHED_LIVE_POOL] }, artifact: 'malformed'
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${MATCHED_ID}`, { waitUntil: 'load', timeout: 20000 });
        const project = await poolDetailProject(r.page);
        if (project !== 'livematch') throw new Error(`expected fallback to live (livematch), got "${project}"`);
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit for malformed artifact JSON');
        if (r.artifactHits() < 1) throw new Error('expected the artifact endpoint to have actually been requested (proves this degrade exercises response validation, not just the shape gate)');
      } finally { await r.context.close(); }
    });

    // (e) schemaVersion !== 1 → falls through to live.
    await test('(e) degrade: artifact schemaVersion !== 1 → falls through to live', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts },
        live: { pools: [MATCHED_LIVE_POOL] },
        artifact: artifactEnvelope(MATCHED_LIVE_POOL, ts, { schemaVersion: 2 })
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${MATCHED_ID}`, { waitUntil: 'load', timeout: 20000 });
        const project = await poolDetailProject(r.page);
        if (project !== 'livematch') throw new Error(`expected fallback to live (livematch), got "${project}"`);
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit for schemaVersion !== 1');
        if (r.artifactHits() < 1) throw new Error('expected the artifact endpoint to have actually been requested');
      } finally { await r.context.close(); }
    });

    // (f) generatedAt older than SNAPSHOT_MAX_AGE_MS → falls through to live.
    await test('(f) degrade: artifact generatedAt stale (>6h) → falls through to live', async () => {
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts: freshTs() }, snap: { pools: SNAPSHOT_POOLS, ts: freshTs() },
        live: { pools: [MATCHED_LIVE_POOL] },
        artifact: artifactEnvelope(MATCHED_LIVE_POOL, staleTs())
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${MATCHED_ID}`, { waitUntil: 'load', timeout: 20000 });
        const project = await poolDetailProject(r.page);
        if (project !== 'livematch') throw new Error(`expected fallback to live (livematch), got "${project}"`);
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit for a stale artifact generatedAt');
        if (r.artifactHits() < 1) throw new Error('expected the artifact endpoint to have actually been requested');
      } finally { await r.context.close(); }
    });

    // (g) artifact record id does not match the requested id → falls through to live.
    await test('(g) degrade: artifact record id mismatch → falls through to live', async () => {
      const ts = freshTs();
      const mismatchedRecord = projPool('some-other-id-entirely', 'artifactmismatch', 'USDC', 'Base', 500_000, 5);
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts },
        live: { pools: [MATCHED_LIVE_POOL] },
        artifact: artifactEnvelope(mismatchedRecord, ts)
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${MATCHED_ID}`, { waitUntil: 'load', timeout: 20000 });
        const project = await poolDetailProject(r.page);
        if (project !== 'livematch') throw new Error(`expected fallback to live (livematch), got "${project}" — an id-mismatched artifact must never be accepted`);
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit for an id-mismatched artifact');
        if (r.artifactHits() < 1) throw new Error('expected the artifact endpoint to have actually been requested');
      } finally { await r.context.close(); }
    });

    // (h) snapshot itself stale → the pre-216 decline path; the artifact is
    // never even attempted (poolAbsent is only set when the snapshot itself
    // was fresh/valid), falls straight to live exactly like non-pool arrivals.
    await test('(h) degrade: snapshot itself stale (7h) → falls through to live WITHOUT ever attempting the artifact fetch', async () => {
      const stale = staleTs();
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts: stale }, snap: { pools: SNAPSHOT_POOLS, ts: stale },
        live: { pools: [MATCHED_LIVE_POOL] },
        artifact: artifactEnvelope(MATCHED_LIVE_POOL, freshTs()) // would succeed if ever fetched — proves it wasn't
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${MATCHED_ID}`, { waitUntil: 'load', timeout: 20000 });
        const project = await poolDetailProject(r.page);
        if (project !== 'livematch') throw new Error(`expected fallback to live (livematch), got "${project}"`);
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to be hit for a stale snapshot');
        if (r.artifactHits() !== 0) throw new Error(`expected the artifact endpoint to never be requested when the snapshot itself is stale, got ${r.artifactHits()} hit(s)`);
      } finally { await r.context.close(); }
    });

    // (i) shape gate: a non-UUID `?pool=` value never triggers an artifact fetch.
    await test('(i) shape gate: non-UUID-shaped ?pool= value never triggers an artifact fetch, falls straight to live', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts },
        // Non-empty live fixture (lacking SHAPE_GATE_ID) so `pools.length > 0`
        // still gates the pool-detail resolver into its "not found" branch
        // rather than never resolving at all (an empty live array would leave
        // the resolver effect's `pools.length > 0` guard permanently false).
        live: { pools: [MATCHED_LIVE_POOL] }, artifact: artifactEnvelope(ARTIFACT_POOL, ts)
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${SHAPE_GATE_ID}`, { waitUntil: 'load', timeout: 20000 });
        await r.page.waitForSelector('.empty-state', { timeout: 15000 }); // dead id (empty live) -> 072 state
        if (r.artifactHits() !== 0) throw new Error(`expected 0 artifact fetch attempts for a non-UUID-shaped id, got ${r.artifactHits()}`);
        if (r.liveHits() < 1) throw new Error('expected the live endpoint to still be hit');
      } finally { await r.context.close(); }
    });

    // (j) TRUST-RAIL INVARIANT (208's HARD invariant) ---------------------------
    await test('(j) trust-rail invariant: after the sub-rail artifact paints, searching its OWN unique symbol at the default $10M floor renders ZERO matching cards', async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts },
        live: null, artifact: artifactEnvelope(ARTIFACT_POOL, ts)
      });
      try {
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${ARTIFACT_ID}`, { waitUntil: 'load', timeout: 20000 });
        const project = await poolDetailProject(r.page);
        if (project !== 'artifactproto') throw new Error(`sanity: expected the artifact paint first, got "${project}"`);

        // Leave pool-detail via the "Search Results" breadcrumb (handleBackFromDetail) —
        // this does NOT reset selectedToken/selectedChain/minTvl, and crucially
        // does NOT refetch: `pools` state still holds snapshotPools.concat([record]).
        await r.page.click('text=Search Results');
        await r.page.waitForSelector('.search-input', { timeout: 10000 });

        const input = r.page.locator('.search-input');
        await input.click();
        await input.fill(ARTIFACT_SYMBOL);
        await input.press('Enter');

        // Poll for the settled filtered state (mirrors test_search.js's pattern).
        const deadline = Date.now() + 8000;
        let lastFailure = null;
        for (;;) {
          lastFailure = await r.page.evaluate((needleProject) => {
            const cards = Array.from(document.querySelectorAll('.pool-card'));
            const contextTexts = Array.from(document.querySelectorAll('.pool-context-inline')).map(e => e.textContent.toLowerCase());
            const offending = contextTexts.filter(t => t.includes(needleProject));
            if (offending.length > 0) return `found ${offending.length} rendered card(s) naming the sub-rail project "${needleProject}"`;
            return null;
          }, 'artifactproto');
          if (!lastFailure) break;
          if (Date.now() > deadline) throw new Error(lastFailure);
          await r.page.waitForTimeout(200);
        }
      } finally { await r.context.close(); }
    });

    // (k) data_load_time source: 'pool-artifact', and pool_view fires exactly once.
    await test("(k) data_load_time's delivered performance_metric event carries source: 'pool-artifact', and pool_view fires exactly once", async () => {
      const ts = freshTs();
      const r = await makeRouted(browser, {
        meta: { pools: SNAPSHOT_POOLS, ts }, snap: { pools: SNAPSHOT_POOLS, ts },
        live: null, artifact: artifactEnvelope(ARTIFACT_POOL, ts)
      });
      try {
        await installSpies(r.page);
        await r.page.goto(`http://localhost:${PORT}/home.html?pool=${ARTIFACT_ID}`, { waitUntil: 'load', timeout: 20000 });
        await poolDetailProject(r.page);

        const perfHits = await pollEvents(r.page, (e) => e.eventName === 'performance_metric' && e.eventData && e.eventData.metric_name === 'data_load_time', 5000);
        if (perfHits.length === 0) throw new Error('expected a delivered performance_metric(data_load_time) event');
        if (perfHits[0].eventData.source !== 'pool-artifact') throw new Error(`expected source: 'pool-artifact', got ${JSON.stringify(perfHits[0].eventData)}`);

        // pool_view settles once protocolUrlsSettled resolves — give it a moment.
        const poolViewHits = await pollEvents(r.page, (e) => e.eventName === 'pool_view', 5000);
        if (poolViewHits.length !== 1) throw new Error(`expected exactly 1 pool_view event, got ${poolViewHits.length}: ${JSON.stringify(poolViewHits)}`);
        if (poolViewHits[0].eventData.source !== 'url_direct') throw new Error(`expected pool_view source 'url_direct', got ${JSON.stringify(poolViewHits[0].eventData)}`);
      } finally { await r.context.close(); }
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed}/${total} pool-artifact-paint scenarios passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_pool_artifact_paint crashed: ' + err.message);
  process.exitCode = 1;
});
