/* Playwright behavior gate for spec 104 (pool-detail TVL-trend note):
   drives the REAL rendered pool-detail UI (static server + chromium) and
   asserts on the rendered DOM — never on a return value. Spec acceptance
   criteria D1–D8 are exercised as real `/?pool=<id>` renders.

   Fixture-routed like test_kpi_momentum.js: browser-originated HTTPS is
   proxy-blocked in-sandbox (standing decision 2026-07-12), so the
   yields.llama.fi /pools fetch and the unpkg React/Babel scripts are stubbed
   with local vendored copies / a DefiLlama-shaped fixture snapshot. External
   font/analytics fetches fail locally and are ignorable per CLAUDE.md.

   Run: node test_kpi_tvl_trend.js */
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

// --- DefiLlama-shaped fixtures ------------------------------------------
// All sized above DEFAULT_MIN_TVL ($100K as of spec 173, was $10M) so trust-rail filtering never hides
// them. Every fixture below the sanity limit (1000%) so anomaly demotion
// never interferes with the note under test.
function makePool(overrides) {
  return Object.assign({
    pool: 'fixture-pool', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
    tvlUsd: 45_000_000, apyBase: 0, apyReward: 0
  }, overrides);
}

// D1 — SHRINKING: hp:30, tvlTrend:-0.30, cur 6, apyMean30d 6 so 071 stays silent.
const SHRINK_POOL = makePool({
  pool: 'shrink-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.02, apyStdev: 0.4, tvlTrend: -0.30 }
});
// D2 — GROWING: hp:30, tvlTrend:0.42, cur 6, apyMean30d 6.
const GROW_POOL = makePool({
  pool: 'grow-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.02, apyStdev: 0.4, tvlTrend: 0.42 }
});
// D3 — below threshold: hp:30, |tvlTrend| 0.1 < 0.25 → note ABSENT.
const BELOW_POOL = makePool({
  pool: 'below-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.02, apyStdev: 0.4, tvlTrend: 0.1 }
});
// D4 — short window: hp:3 < 7 → note ABSENT.
const SHORT_POOL = makePool({
  pool: 'short-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 3, firstSeen: '2026-07-12', apyMomentum: 0.02, apyStdev: 0.4, tvlTrend: 0.5 }
});
// D5a — null tvlTrend: hp:1, tvlTrend null → note ABSENT.
const NULLTVL_POOL = makePool({
  pool: 'nulltvl-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 1, firstSeen: '2026-07-14', apyMomentum: null, apyStdev: null, tvlTrend: null }
});
// D5b — no kpis field at all → note ABSENT (real SEO live-landing behavior).
const NO_KPIS_POOL = makePool({
  pool: 'no-kpis-pool', apyBase: 6, apyMean30d: 6
});
// D6 — trips 071 (142.84% vs 405.32%) WITH shrinking kpis → note ABSENT, 071 wins.
const VOLATILE_KPIS_POOL = makePool({
  pool: 'volatile-kpis-pool', apyBase: 100, apyReward: 42.84, apyMean30d: 405.32,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.02, apyStdev: 0.4, tvlTrend: -0.30 }
});

const ALL_POOLS = [SHRINK_POOL, GROW_POOL, BELOW_POOL, SHORT_POOL, NULLTVL_POOL, NO_KPIS_POOL, VOLATILE_KPIS_POOL];
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
    const el = document.querySelector('.tvl-trend-note');
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
    await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
    await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
    }));

    // D1 — SHRINKING fixture shows the note incl. the formatted percent and "30".
    await test('D1 shrink pool (tvlTrend -0.30) renders .tvl-trend-note incl. "30%" and "30"', async () => {
      const { present, text } = await renderPool(page, SHRINK_POOL.pool);
      if (!present) throw new Error('expected .tvl-trend-note to be present');
      if (!text.includes('shrunk about')) throw new Error(`expected SHRINKING substring, got: ${text}`);
      if (!text.includes('30%')) throw new Error(`expected "30%" in SHRINKING copy, got: ${text}`);
      if (!text.includes('30')) throw new Error(`expected "30" in SHRINKING copy, got: ${text}`);
    });

    // D2 — GROWING fixture shows the note incl. the formatted percent and "30".
    await test('D2 grow pool (tvlTrend 0.42) renders .tvl-trend-note incl. "42%" and "30"', async () => {
      const { present, text } = await renderPool(page, GROW_POOL.pool);
      if (!present) throw new Error('expected .tvl-trend-note to be present');
      if (!text.includes('grown about')) throw new Error(`expected GROWING substring, got: ${text}`);
      if (!text.includes('42%')) throw new Error(`expected "42%" in GROWING copy, got: ${text}`);
      if (!text.includes('30')) throw new Error(`expected "30" in GROWING copy, got: ${text}`);
    });

    // D3 — below-threshold fixture: note ABSENT (|tvlTrend| < 0.25).
    await test('D3 below-threshold pool (tvlTrend 0.1) renders no .tvl-trend-note', async () => {
      const { present } = await renderPool(page, BELOW_POOL.pool);
      if (present) throw new Error('expected no .tvl-trend-note when |tvlTrend| < 0.25');
    });

    // D4 — short-window fixture: note ABSENT (hp < 7).
    await test('D4 short-window pool (hp:3) renders no .tvl-trend-note', async () => {
      const { present } = await renderPool(page, SHORT_POOL.pool);
      if (present) throw new Error('expected no .tvl-trend-note when hp < 7');
    });

    // D5 — null tvlTrend and no-kpis fixtures: note ABSENT in both.
    await test('D5 null-tvlTrend and no-kpis pools render no .tvl-trend-note', async () => {
      const nullTvl = await renderPool(page, NULLTVL_POOL.pool);
      if (nullTvl.present) throw new Error('expected no .tvl-trend-note when tvlTrend is null');
      const noKpis = await renderPool(page, NO_KPIS_POOL.pool);
      if (noKpis.present) throw new Error('expected no .tvl-trend-note when kpis is missing');
    });

    // D6 — 071 fires: tvl-trend note ABSENT, volatility note PRESENT.
    await test('D6 volatile pool with kpis: .tvl-trend-note ABSENT, .rate-volatility-note PRESENT', async () => {
      const { present, volPresent } = await renderPool(page, VOLATILE_KPIS_POOL.pool);
      if (present) throw new Error('expected no .tvl-trend-note when 071 fires');
      if (!volPresent) throw new Error('expected .rate-volatility-note to be present (071 wins)');
    });

    // D7 — Korean copy on the SHRINKING fixture.
    await test('D7 ?lang=ko shrink pool renders Korean tvl-trend copy', async () => {
      const { present, text } = await renderPool(page, SHRINK_POOL.pool, 'ko');
      if (!present) throw new Error('expected .tvl-trend-note to be present in ko');
      if (!text.includes('줄었습니다')) {
        throw new Error(`expected Korean shrinking substring, got: ${text}`);
      }
    });

    // D8 — zero page errors across every render above.
    await test('D8 zero page errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/8 tvl-trend behavior assertions passed');
}

main().catch((err) => {
  console.error('test_kpi_tvl_trend crashed: ' + err.message);
  process.exitCode = 1;
});
