/* Playwright behavior gate for spec 105 (enrich live ?pool=<id> SEO deep-link
   landings with the snapshot's kpis): drives the REAL rendered pool-detail UI
   (static server + chromium) and asserts on the rendered DOM — never on a
   return value. Spec acceptance criteria D1–D5 are exercised as real
   `/?pool=<id>` renders.

   The live /pools fetch is routed to a fixture WITHOUT kpis (the real
   SEO-landing shape — DefiLlama has no kpis), and /data/pools-snapshot.json is
   routed to a FRESH fixture snapshot WITH kpis. The 105 enrichment effect reads
   the snapshot directly (no meta gate — the ?pool= path never consults it), so
   the 088.1 rate-track-record note that could not render for SEO arrivals now
   does.

   Fixture-routed like test_kpi_track_record.js: browser-originated HTTPS is
   proxy-blocked in-sandbox (standing decision 2026-07-12), so the
   yields.llama.fi /pools fetch and the unpkg React/Babel scripts are stubbed
   with local vendored copies / a DefiLlama-shaped fixture snapshot. External
   font/analytics fetches fail locally and are ignorable per CLAUDE.md.

   Run: node test_kpi_seo_enrichment.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8799;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// --- DefiLlama-shaped fixtures ------------------------------------------
// LIVE /pools pools carry NO kpis (the real SEO live-landing shape). All sized
// above DEFAULT_MIN_TVL ($10M) so trust-rail filtering never hides them, and
// apyBase:6 / apyMean30d:6 so 071's volatility note never fires (it takes
// precedence over the track-record note).
function makePool(overrides) {
  return Object.assign({
    pool: 'fixture-pool', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
    tvlUsd: 45_000_000, apyBase: 6, apyReward: 0, apyMean30d: 6
  }, overrides);
}

// D1 — pool present in BOTH live (no kpis) and snapshot (hp:1) → NEW-tier note.
const NEW_LIVE = makePool({ pool: 'new-pool' });
// D2 — pool present live but ABSENT from the snapshot → no enrichment.
const ABSENT_LIVE = makePool({ pool: 'absent-pool' });
// D3 — pool present in BOTH; snapshot kpis hp:30 steady → STEADY-tier note.
const STEADY_LIVE = makePool({ pool: 'steady-pool' });
// D4 — pool present in BOTH; snapshot pool has NO kpis field → note ABSENT.
const SNAP_NO_KPIS_LIVE = makePool({ pool: 'snap-no-kpis-pool' });

const LIVE_POOLS = [NEW_LIVE, ABSENT_LIVE, STEADY_LIVE, SNAP_NO_KPIS_LIVE];
const LIVE_RESPONSE = JSON.stringify({ status: 'success', data: LIVE_POOLS });

// The fresh snapshot carries kpis for the enrichable pools. absent-pool is
// deliberately omitted (D2); snap-no-kpis-pool is present but WITHOUT a kpis
// field (D4).
const SNAPSHOT_POOLS = [
  makePool({ pool: 'new-pool', kpis: { historyPoints: 1, firstSeen: '2026-07-14', apyMomentum: null, apyStdev: null, tvlTrend: null } }),
  makePool({ pool: 'steady-pool', kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.1, apyStdev: 0.4, tvlTrend: 0.02 } }),
  makePool({ pool: 'snap-no-kpis-pool' })
];
const SNAPSHOT_RESPONSE = JSON.stringify({
  schemaVersion: 1, generatedAt: '2026-07-15T00:00:00.000Z', count: SNAPSHOT_POOLS.length, pools: SNAPSHOT_POOLS
});

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

// Land directly on ?pool=<id> (the SEO / share deep-link path) and read the
// settled pool-detail DOM: whether the track-record note rendered and its text.
async function renderPool(page, poolId) {
  await page.goto(
    `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(poolId)}`,
    { waitUntil: 'load', timeout: 20000 }
  );
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  await page.waitForSelector('.pool-info-content', { timeout: 15000 });
  // Enrichment is an async fetch after first render; give it time to settle.
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const el = document.querySelector('.rate-track-record-note');
    return { present: !!el, text: el ? el.textContent : null };
  });
}

async function main() {
  console.log('network: unpkg.com BLOCKED (local vendored React/Babel), ' +
    'yields.llama.fi BLOCKED (live fixture, no kpis), ' +
    'pools-snapshot.json ROUTED (fresh fixture with kpis)');

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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
    await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event

    // The meta gate is irrelevant to the ?pool= path (snapshotEligible is false),
    // but route it to a STALE meta so nothing else ever consults it and it never
    // reaches the real network. Registered BEFORE the main-snapshot route; the
    // two globs do not overlap (-meta.json vs .json), and Playwright matches the
    // most-recently-added route first regardless.
    await page.route('**/data/pools-snapshot-meta.json', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":0,"bytes":100}'
    }));
    // The 105 effect fetches this directly — the fresh snapshot WITH kpis.
    await page.route('**/data/pools-snapshot.json', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: SNAPSHOT_RESPONSE
    }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: LIVE_RESPONSE
    }));

    // D1 — live landing (no kpis) enriched from snapshot hp:1 → NEW-tier note.
    await test('D1 SEO landing enriched from snapshot (hp:1) renders NEW-tier .rate-track-record-note', async () => {
      const { present, text } = await renderPool(page, NEW_LIVE.pool);
      if (!present) throw new Error('expected .rate-track-record-note to be present after enrichment');
      if (!text.includes('still building this pool')) {
        throw new Error(`expected NEW-tier substring, got: ${text}`);
      }
    });

    // D2 — pool absent from the snapshot → no enrichment, note ABSENT (honest).
    await test('D2 pool absent from snapshot renders no .rate-track-record-note', async () => {
      const { present } = await renderPool(page, ABSENT_LIVE.pool);
      if (present) throw new Error('expected no .rate-track-record-note when pool is absent from the snapshot');
    });

    // D3 — enriched from snapshot hp:30 steady → STEADY-tier copy incl. "30".
    await test('D3 SEO landing enriched from snapshot (hp:30 steady) renders STEADY-tier copy incl. "30"', async () => {
      const { present, text } = await renderPool(page, STEADY_LIVE.pool);
      if (!present) throw new Error('expected .rate-track-record-note to be present after enrichment');
      if (!text.includes('Steady so far')) throw new Error(`expected STEADY-tier substring, got: ${text}`);
      if (!text.includes('30')) throw new Error(`expected "30" in STEADY copy, got: ${text}`);
    });

    // D4 — snapshot pool has no kpis field → note ABSENT (never a placeholder).
    await test('D4 snapshot pool without a kpis field renders no .rate-track-record-note', async () => {
      const { present } = await renderPool(page, SNAP_NO_KPIS_LIVE.pool);
      if (present) throw new Error('expected no .rate-track-record-note when the snapshot pool has no kpis field');
    });

    // D5 — zero page errors across every render above.
    await test('D5 zero page errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/5 SEO kpis-enrichment behavior assertions passed');
}

main().catch((err) => {
  console.error('test_kpi_seo_enrichment crashed: ' + err.message);
  process.exitCode = 1;
});
