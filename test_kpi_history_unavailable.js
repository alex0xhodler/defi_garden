/* Playwright behavior gate for spec 207 (pool-detail rate-history-unavailable
   note): drives the REAL rendered pool-detail UI (static server + chromium)
   and asserts on the rendered DOM — never on a return value.

   207 adds a fourth "no data at all" tier to 088.1's rate-track-record block:
   a `?pool=<id>` deep link whose pool carries no `kpis` object at all (the
   ~88.6% of deep links absent from data/pools-snapshot.json — real SEO live
   landings, see test_kpi_seo_enrichment.js for the 105 backfill path that
   covers the other 11.4%) previously rendered nothing where 088.1's note
   would have gone. This note says so honestly instead, gated on a settle
   timer so it never flashes ahead of app.js's 105 kpi-snapshot backfill.

   Fixture-routed like test_kpi_track_record.js / test_kpi_seo_enrichment.js:
   browser-originated HTTPS is proxy-blocked in-sandbox (standing decision
   2026-07-12), so the yields.llama.fi /pools fetch and the unpkg React/Babel
   scripts are stubbed with local vendored copies / DefiLlama-shaped fixture
   snapshots. External font/analytics fetches fail locally and are ignorable
   per CLAUDE.md.

   Run: node test_kpi_history_unavailable.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8797;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// The settle gate in PoolDetail.js waits 1000ms before declaring a kpis-less
// pool's history lookup "settled" (giving app.js's 105 backfill a window to
// land first). Wait comfortably past that before asserting.
const SETTLE_WAIT_MS = 1600;

// --- DefiLlama-shaped fixtures ------------------------------------------
// All sized above DEFAULT_MIN_TVL ($10M) so trust-rail filtering never hides
// them. Every fixture below the sanity limit (1000%) so anomaly demotion
// never interferes with the notes under test.
function makePool(overrides) {
  return Object.assign({
    pool: 'fixture-pool', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
    tvlUsd: 45_000_000, apyBase: 6, apyReward: 0, apyMean30d: 6
  }, overrides);
}

// Case 1/5 — no kpis field at all, no snapshot match: new note PRESENT,
// .rate-track-record-note ABSENT.
const NO_HISTORY_POOL = makePool({ pool: 'no-history-pool' });
// Case 2 — kpis present, hp:30 steady: .rate-track-record-note PRESENT,
// new note ABSENT (additive claim).
const WITH_KPIS_POOL = makePool({
  pool: 'with-kpis-pool',
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.1, apyStdev: 0.4, tvlTrend: 0.02 }
});
// Case 4 — no kpis AND trips 071 volatility (same shape as
// test_kpi_track_record.js's D5 fixture): .rate-volatility-note PRESENT,
// new note ABSENT (mutual exclusion).
const VOLATILE_NO_KPIS_POOL = makePool({
  pool: 'volatile-no-kpis-pool', apyBase: 100, apyReward: 42.84, apyMean30d: 405.32
});
// Case 3 — no-flash: present live with no kpis, but present in the snapshot
// WITH kpis, so app.js's 105 effect should backfill it before the 1s settle
// gate fires.
const NO_FLASH_POOL = makePool({ pool: 'no-flash-pool' });

const ALL_LIVE_POOLS = [NO_HISTORY_POOL, WITH_KPIS_POOL, VOLATILE_NO_KPIS_POOL, NO_FLASH_POOL];
const LIVE_RESPONSE = JSON.stringify({ status: 'success', data: ALL_LIVE_POOLS });

// Empty snapshot: no pool matches, so 105 never backfills anything for cases 1/2/4/5.
const EMPTY_SNAPSHOT_RESPONSE = JSON.stringify({
  schemaVersion: 1, generatedAt: '2026-07-15T00:00:00.000Z', count: 0, pools: []
});
// Snapshot for the no-flash case: contains no-flash-pool WITH real kpis.
const NO_FLASH_SNAPSHOT_RESPONSE = JSON.stringify({
  schemaVersion: 1, generatedAt: '2026-07-15T00:00:00.000Z', count: 1,
  pools: [makePool({
    pool: 'no-flash-pool',
    kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.1, apyStdev: 0.4, tvlTrend: 0.02 }
  })]
});

let passed = 0;
let totalTests = 0;
async function test(name, fn) {
  totalTests++;
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

async function routeCommon(page, snapshotBody, snapshotDelayMs) {
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
  await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
  await page.route('**/data/pools-snapshot-meta.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":0,"bytes":100}'
  }));
  await page.route('**/data/pools-snapshot*', async (route) => {
    if (snapshotDelayMs) await new Promise((r) => setTimeout(r, snapshotDelayMs));
    route.fulfill({ status: 200, contentType: 'application/json', body: snapshotBody });
  });
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: LIVE_RESPONSE
  }));
}

// Land directly on ?pool=<id> (the SEO / share deep-link path), wait past the
// 1s settle gate, and read the settled pool-detail DOM.
async function renderPool(page, poolId, lang) {
  const langParam = lang ? `&lang=${lang}` : '';
  await page.goto(
    `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(poolId)}${langParam}`,
    { waitUntil: 'load', timeout: 20000 }
  );
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  await page.waitForSelector('.pool-info-content', { timeout: 15000 });
  await page.waitForTimeout(SETTLE_WAIT_MS);
  return page.evaluate(() => {
    const unavailable = document.querySelector('.rate-history-unavailable-note');
    const trackRecord = document.querySelector('.rate-track-record-note');
    const volatility = document.querySelector('.rate-volatility-note');
    return {
      unavailablePresent: !!unavailable,
      unavailableText: unavailable ? unavailable.textContent : null,
      trackRecordPresent: !!trackRecord,
      volatilityPresent: !!volatility
    };
  });
}

// Continuous-sampling variant of renderPool, used where a single post-settle
// DOM read cannot prove absence-over-time (see C3 below). Polls the DOM every
// POLL_INTERVAL_MS from just after navigation until SETTLE_WAIT_MS has
// elapsed, recording whether .rate-history-unavailable-note was EVER present
// at any sample, then returns the final settled state too.
const POLL_INTERVAL_MS = 50;
async function renderPoolWithHistory(page, poolId, lang) {
  const langParam = lang ? `&lang=${lang}` : '';
  // 'domcontentloaded' rather than 'load': the page's 'load' event doesn't
  // fire until every blocked external host (fonts/analytics/icons) has timed
  // out, which takes 10+ seconds in this sandbox — by then the ~400ms
  // snapshot race is long over and polling would start after the fact.
  // 'domcontentloaded' resolves as soon as the document's scripts have run,
  // which is well before that, so the poll below actually straddles the race.
  await page.goto(
    `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(poolId)}${langParam}`,
    { waitUntil: 'domcontentloaded', timeout: 20000 }
  );
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  await page.waitForSelector('.pool-info-content', { timeout: 15000 });

  let everUnavailable = false;
  const deadline = Date.now() + SETTLE_WAIT_MS;
  while (Date.now() < deadline) {
    const present = await page.evaluate(() => !!document.querySelector('.rate-history-unavailable-note'));
    if (present) { everUnavailable = true; break; } // no need to keep polling once proven
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
  // One final read past the full settle window for the steady-state assertions.
  await page.waitForTimeout(Math.max(0, deadline - Date.now()));
  const final = await page.evaluate(() => ({
    unavailablePresent: !!document.querySelector('.rate-history-unavailable-note'),
    trackRecordPresent: !!document.querySelector('.rate-track-record-note'),
    volatilityPresent: !!document.querySelector('.rate-volatility-note')
  }));
  return Object.assign({ everUnavailable }, final);
}

async function main() {
  console.log('network: unpkg.com BLOCKED (local vendored React/Babel), ' +
    'yields.llama.fi BLOCKED (DefiLlama-shaped fixture snapshot)');

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    const attachErrorListeners = (page) => {
      page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const source = msg.location()?.url || '';
        if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
          pageErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
        }
      });
    };

    // Main page: empty snapshot, used for cases 1, 2, 4, 5.
    const page = await context.newPage();
    attachErrorListeners(page);
    await routeCommon(page, EMPTY_SNAPSHOT_RESPONSE);

    // Case 1 — pool with no kpis and no snapshot match: new note present,
    // .rate-track-record-note absent.
    await test('C1 no-kpis pool (no snapshot match) renders .rate-history-unavailable-note, not .rate-track-record-note', async () => {
      const r = await renderPool(page, NO_HISTORY_POOL.pool);
      if (!r.unavailablePresent) throw new Error('expected .rate-history-unavailable-note to be present');
      if (!r.unavailableText.includes("We don't have a rate history for this pool")) {
        throw new Error(`expected the honest-copy substring, got: ${r.unavailableText}`);
      }
      if (r.trackRecordPresent) throw new Error('expected .rate-track-record-note to be absent');
    });

    // Case 2 — pool WITH kpis (hp:30, steady): .rate-track-record-note
    // present, new note absent (additive claim — the 11.4% direct-kpis path
    // is unchanged).
    await test('C2 pool with kpis renders .rate-track-record-note, not .rate-history-unavailable-note', async () => {
      const r = await renderPool(page, WITH_KPIS_POOL.pool);
      if (!r.trackRecordPresent) throw new Error('expected .rate-track-record-note to be present');
      if (r.unavailablePresent) throw new Error('expected .rate-history-unavailable-note to be absent');
    });

    // Case 4 — no kpis AND trips 071 volatility: .rate-volatility-note wins,
    // new note absent (mutual exclusion, same divergence boolean as the
    // sibling track-record/momentum/tvl-trend notes).
    await test('C4 volatile no-kpis pool renders .rate-volatility-note, not .rate-history-unavailable-note', async () => {
      const r = await renderPool(page, VOLATILE_NO_KPIS_POOL.pool);
      if (!r.volatilityPresent) throw new Error('expected .rate-volatility-note to be present (071 wins)');
      if (r.unavailablePresent) throw new Error('expected .rate-history-unavailable-note to be absent when 071 fires');
    });

    // Case 5 — ?lang=ko on the no-kpis pool renders Korean copy.
    await test('C5 ?lang=ko no-kpis pool renders Korean rate-history-unavailable copy', async () => {
      const r = await renderPool(page, NO_HISTORY_POOL.pool, 'ko');
      if (!r.unavailablePresent) throw new Error('expected .rate-history-unavailable-note to be present in ko');
      if (!r.unavailableText.includes('이율 기록이 없습니다')) {
        throw new Error(`expected Korean note substring, got: ${r.unavailableText}`);
      }
    });

    await page.close();

    // Case 3 — no-flash: separate page/route setup, snapshot DOES contain the
    // no-kpis pool's id with real kpis, so app.js's 105 backfill succeeds
    // before the 1s settle gate fires. After settling, the honest-fallback
    // note must be absent and the real track-record note present — the 11.4%
    // path stays byte-unchanged in behaviour.
    //
    // Why this case is written the way it is: a single DOM read taken after
    // the full SETTLE_WAIT_MS cannot fail regardless of whether the settle
    // gate exists at all. The mocked snapshot route used to resolve in well
    // under 50ms, so by the time any post-settle sample runs, 105's backfill
    // has *already* landed and overwritten the note either way — the gate
    // never gets exercised. To make this case real acceptance evidence for
    // "no flash": (a) the snapshot route is given a deliberate ~400ms delay,
    // comfortably below the 1000ms gate, so there is an observable window
    // where a gateless render *would* paint the honest-fallback note before
    // the backfill lands; (b) the DOM is polled continuously from navigation
    // through the full settle window (renderPoolWithHistory), recording
    // whether .rate-history-unavailable-note was EVER present at any sample
    // — not just at one point in time. With the 1000ms gate in place the note
    // must never appear (the backfill at ~400ms resets historyLookupSettled's
    // effect before the 1000ms timer can fire); without the gate it would
    // paint immediately on mount and be caught by the poll.
    const NO_FLASH_SNAPSHOT_DELAY_MS = 400;
    const noFlashPage = await context.newPage();
    attachErrorListeners(noFlashPage);
    await routeCommon(noFlashPage, NO_FLASH_SNAPSHOT_RESPONSE, NO_FLASH_SNAPSHOT_DELAY_MS);

    await test('C3 no-flash: pool backfilled from snapshot never shows .rate-history-unavailable-note at any point, and settles on .rate-track-record-note', async () => {
      const r = await renderPoolWithHistory(noFlashPage, NO_FLASH_POOL.pool);
      if (r.everUnavailable) throw new Error('expected .rate-history-unavailable-note to never appear during the delayed 105 backfill window');
      if (r.unavailablePresent) throw new Error('expected .rate-history-unavailable-note to be absent after 105 backfill settles');
      if (!r.trackRecordPresent) throw new Error('expected .rate-track-record-note to be present after 105 backfill settles');
    });

    await noFlashPage.close();

    // Case 6 — zero page errors across every render above.
    await test('C6 zero page errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/' + totalTests + ' rate-history-unavailable behavior assertions passed');
}

main().catch((err) => {
  console.error('test_kpi_history_unavailable crashed: ' + err.message);
  process.exitCode = 1;
});
