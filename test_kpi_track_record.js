/* Playwright behavior gate for spec 088.1 (pool-detail rate-track-record
   note): drives the REAL rendered pool-detail UI (static server + chromium)
   and asserts on the rendered DOM — never on a return value. Spec acceptance
   criteria D1–D7 are exercised as real `/?pool=<id>` renders.

   Fixture-routed like test_rate_volatility.js: browser-originated HTTPS is
   proxy-blocked in-sandbox (standing decision 2026-07-12), so the
   yields.llama.fi /pools fetch and the unpkg React/Babel scripts are stubbed
   with local vendored copies / a DefiLlama-shaped fixture snapshot. External
   font/analytics fetches fail locally and are ignorable per CLAUDE.md.

   Run: node test_kpi_track_record.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8795;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// --- DefiLlama-shaped fixtures ------------------------------------------
// All sized above DEFAULT_MIN_TVL ($10M) so trust-rail filtering never hides
// them. Every fixture below the sanity limit (1000%) so anomaly demotion
// never interferes with the note under test.
function makePool(overrides) {
  return Object.assign({
    pool: 'fixture-pool', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
    tvlUsd: 45_000_000, apyBase: 0, apyReward: 0
  }, overrides);
}

// D1 — NEW tier: hp:1, stdev null, apyMean30d near cur so 071 never fires.
const NEW_POOL = makePool({
  pool: 'new-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 1, firstSeen: '2026-07-14', apyMomentum: null, apyStdev: null, tvlTrend: null }
});
// D2 — STEADY tier: hp:30, stdev 0.4, cur 6 → ratio 0.067 ≤ 0.2.
const STEADY_POOL = makePool({
  pool: 'steady-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.1, apyStdev: 0.4, tvlTrend: 0.02 }
});
// D3 — TRACKED tier: hp:30, stdev 5, cur 6 → ratio 0.83 > 0.2.
const TRACKED_POOL = makePool({
  pool: 'tracked-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: -1, apyStdev: 5, tvlTrend: -0.1 }
});
// D4 — no kpis field at all → note ABSENT (real SEO live-landing behavior).
const NO_KPIS_POOL = makePool({
  pool: 'no-kpis-pool', apyBase: 6, apyMean30d: 6
});
// D5 — trips 071 (142.84% vs 405.32%) WITH steady kpis → note ABSENT, 071 wins.
const VOLATILE_KPIS_POOL = makePool({
  pool: 'volatile-kpis-pool', apyBase: 100, apyReward: 42.84, apyMean30d: 405.32,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.1, apyStdev: 0.4, tvlTrend: 0.02 }
});

const ALL_POOLS = [NEW_POOL, STEADY_POOL, TRACKED_POOL, NO_KPIS_POOL, VOLATILE_KPIS_POOL];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: ALL_POOLS });

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
// settled pool-detail DOM: whether the note rendered and its text.
async function renderPool(page, poolId, lang) {
  const langParam = lang ? `&lang=${lang}` : '';
  await page.goto(
    `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(poolId)}${langParam}`,
    { waitUntil: 'load', timeout: 20000 }
  );
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  await page.waitForSelector('.pool-info-content', { timeout: 15000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const el = document.querySelector('.rate-track-record-note');
    const vol = document.querySelector('.rate-volatility-note');
    return { present: !!el, text: el ? el.textContent : null, volPresent: !!vol };
  });
}

async function main() {
  console.log('network: unpkg.com BLOCKED (local vendored React/Babel), ' +
    'yields.llama.fi BLOCKED (DefiLlama-shaped fixture snapshot)');

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
    // spec 059: serve a STALE snapshot so the FE falls back to the fixtured LIVE endpoint deterministically (a 200 keeps the browser console clean; a 404 would trip pageErrors guards).
    await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
    }));

    // D1 — NEW-tier fixture shows the note with the number-free NEW copy.
    await test('D1 new pool (hp:1) renders .rate-track-record-note with NEW-tier copy', async () => {
      const { present, text } = await renderPool(page, NEW_POOL.pool);
      if (!present) throw new Error('expected .rate-track-record-note to be present');
      if (!text.includes('still building this pool')) {
        throw new Error(`expected NEW-tier substring, got: ${text}`);
      }
    });

    // D2 — STEADY-tier fixture shows the note incl. "30".
    await test('D2 steady pool (hp:30, stdev/cur ≤0.2) renders STEADY-tier copy incl. "30"', async () => {
      const { present, text } = await renderPool(page, STEADY_POOL.pool);
      if (!present) throw new Error('expected .rate-track-record-note to be present');
      if (!text.includes('Steady so far')) throw new Error(`expected STEADY-tier substring, got: ${text}`);
      if (!text.includes('30')) throw new Error(`expected "30" in STEADY copy, got: ${text}`);
    });

    // D3 — TRACKED-tier fixture shows the note incl. "30".
    await test('D3 tracked pool (hp:30, stdev/cur >0.2) renders TRACKED-tier copy incl. "30"', async () => {
      const { present, text } = await renderPool(page, TRACKED_POOL.pool);
      if (!present) throw new Error('expected .rate-track-record-note to be present');
      if (!text.includes('been tracking this pool')) throw new Error(`expected TRACKED-tier substring, got: ${text}`);
      if (!text.includes('30')) throw new Error(`expected "30" in TRACKED copy, got: ${text}`);
    });

    // D4 — no kpis field: note ABSENT.
    await test('D4 pool with no kpis renders no .rate-track-record-note', async () => {
      const { present } = await renderPool(page, NO_KPIS_POOL.pool);
      if (present) throw new Error('expected no .rate-track-record-note when kpis is missing');
    });

    // D5 — 071 fires: track-record note ABSENT, volatility note PRESENT.
    await test('D5 volatile pool with kpis: .rate-track-record-note ABSENT, .rate-volatility-note PRESENT', async () => {
      const { present, volPresent } = await renderPool(page, VOLATILE_KPIS_POOL.pool);
      if (present) throw new Error('expected no .rate-track-record-note when 071 fires');
      if (!volPresent) throw new Error('expected .rate-volatility-note to be present (071 wins)');
    });

    // D6 — Korean copy on the NEW-tier fixture.
    await test('D6 ?lang=ko new pool renders Korean note copy', async () => {
      const { present, text } = await renderPool(page, NEW_POOL.pool, 'ko');
      if (!present) throw new Error('expected .rate-track-record-note to be present in ko');
      if (!text.includes('이율 기록을 쌓아가는 중입니다')) {
        throw new Error(`expected Korean note substring, got: ${text}`);
      }
    });

    // D7 — zero page errors across every render above.
    await test('D7 zero page errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/7 rate-track-record behavior assertions passed');
}

main().catch((err) => {
  console.error('test_kpi_track_record crashed: ' + err.message);
  process.exitCode = 1;
});
