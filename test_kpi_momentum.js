/* Playwright behavior gate for spec 103 (pool-detail rate-momentum note):
   drives the REAL rendered pool-detail UI (static server + chromium) and
   asserts on the rendered DOM — never on a return value. Spec acceptance
   criteria D1–D8 are exercised as real `/?pool=<id>` renders.

   Fixture-routed like test_kpi_track_record.js: browser-originated HTTPS is
   proxy-blocked in-sandbox (standing decision 2026-07-12), so the
   yields.llama.fi /pools fetch and the unpkg React/Babel scripts are stubbed
   with local vendored copies / a DefiLlama-shaped fixture snapshot. External
   font/analytics fetches fail locally and are ignorable per CLAUDE.md.

   Run: node test_kpi_momentum.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8796;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
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

// D1 — RISING: hp:30, apyMomentum:2.3, cur 6, apyMean30d 6 so 071 stays silent.
const RISING_POOL = makePool({
  pool: 'rising-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 2.3, apyStdev: 0.4, tvlTrend: 0.02 }
});
// D2 — FALLING: hp:30, apyMomentum:-2.3, cur 6, apyMean30d 6.
const FALLING_POOL = makePool({
  pool: 'falling-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: -2.3, apyStdev: 0.4, tvlTrend: -0.02 }
});
// D3 — below threshold: hp:30, |momentum| 0.1 < 0.5 → note ABSENT.
const BELOW_POOL = makePool({
  pool: 'below-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.1, apyStdev: 0.4, tvlTrend: 0.02 }
});
// D4 — short window: hp:3 < 7 → note ABSENT.
const SHORT_POOL = makePool({
  pool: 'short-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 3, firstSeen: '2026-07-12', apyMomentum: 2.3, apyStdev: 0.4, tvlTrend: 0.02 }
});
// D5a — null momentum: hp:1, apyMomentum null → note ABSENT.
const NULLMOM_POOL = makePool({
  pool: 'nullmom-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 1, firstSeen: '2026-07-14', apyMomentum: null, apyStdev: null, tvlTrend: null }
});
// D5b — no kpis field at all → note ABSENT (real SEO live-landing behavior).
const NO_KPIS_POOL = makePool({
  pool: 'no-kpis-pool', apyBase: 6, apyMean30d: 6
});
// D6 — trips 071 (142.84% vs 405.32%) WITH rising kpis → note ABSENT, 071 wins.
const VOLATILE_KPIS_POOL = makePool({
  pool: 'volatile-kpis-pool', apyBase: 100, apyReward: 42.84, apyMean30d: 405.32,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 2.3, apyStdev: 0.4, tvlTrend: 0.02 }
});

const ALL_POOLS = [RISING_POOL, FALLING_POOL, BELOW_POOL, SHORT_POOL, NULLMOM_POOL, NO_KPIS_POOL, VOLATILE_KPIS_POOL];
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
    const el = document.querySelector('.rate-momentum-note');
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

    // D1 — RISING fixture shows the note incl. the formatted delta and "30".
    // Note: _formatApy (app.js formatApy, en-US, maximumFractionDigits:2, no
    // zero-padding) renders 2.3 as "2.3%", not the spec's illustrative "2.30%".
    await test('D1 rising pool (momentum 2.3) renders .rate-momentum-note incl. "2.3%" and "30"', async () => {
      const { present, text } = await renderPool(page, RISING_POOL.pool);
      if (!present) throw new Error('expected .rate-momentum-note to be present');
      if (!text.includes('climbed about')) throw new Error(`expected RISING substring, got: ${text}`);
      if (!text.includes('2.3%')) throw new Error(`expected "2.3%" in RISING copy, got: ${text}`);
      if (!text.includes('30')) throw new Error(`expected "30" in RISING copy, got: ${text}`);
    });

    // D2 — FALLING fixture shows the note incl. the formatted delta and "30".
    await test('D2 falling pool (momentum -2.3) renders .rate-momentum-note incl. "2.3%" and "30"', async () => {
      const { present, text } = await renderPool(page, FALLING_POOL.pool);
      if (!present) throw new Error('expected .rate-momentum-note to be present');
      if (!text.includes('eased down about')) throw new Error(`expected FALLING substring, got: ${text}`);
      if (!text.includes('2.3%')) throw new Error(`expected "2.3%" in FALLING copy, got: ${text}`);
      if (!text.includes('30')) throw new Error(`expected "30" in FALLING copy, got: ${text}`);
    });

    // D3 — below-threshold fixture: note ABSENT (|momentum| < 0.5).
    await test('D3 below-threshold pool (momentum 0.1) renders no .rate-momentum-note', async () => {
      const { present } = await renderPool(page, BELOW_POOL.pool);
      if (present) throw new Error('expected no .rate-momentum-note when |momentum| < 0.5');
    });

    // D4 — short-window fixture: note ABSENT (hp < 7).
    await test('D4 short-window pool (hp:3) renders no .rate-momentum-note', async () => {
      const { present } = await renderPool(page, SHORT_POOL.pool);
      if (present) throw new Error('expected no .rate-momentum-note when hp < 7');
    });

    // D5 — null momentum and no-kpis fixtures: note ABSENT in both.
    await test('D5 null-momentum and no-kpis pools render no .rate-momentum-note', async () => {
      const nullMom = await renderPool(page, NULLMOM_POOL.pool);
      if (nullMom.present) throw new Error('expected no .rate-momentum-note when apyMomentum is null');
      const noKpis = await renderPool(page, NO_KPIS_POOL.pool);
      if (noKpis.present) throw new Error('expected no .rate-momentum-note when kpis is missing');
    });

    // D6 — 071 fires: momentum note ABSENT, volatility note PRESENT.
    await test('D6 volatile pool with kpis: .rate-momentum-note ABSENT, .rate-volatility-note PRESENT', async () => {
      const { present, volPresent } = await renderPool(page, VOLATILE_KPIS_POOL.pool);
      if (present) throw new Error('expected no .rate-momentum-note when 071 fires');
      if (!volPresent) throw new Error('expected .rate-volatility-note to be present (071 wins)');
    });

    // D7 — Korean copy on the RISING fixture.
    await test('D7 ?lang=ko rising pool renders Korean momentum copy', async () => {
      const { present, text } = await renderPool(page, RISING_POOL.pool, 'ko');
      if (!present) throw new Error('expected .rate-momentum-note to be present in ko');
      if (!text.includes('올랐습니다')) {
        throw new Error(`expected Korean rising substring, got: ${text}`);
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
  console.log(passed + '/8 rate-momentum behavior assertions passed');
}

main().catch((err) => {
  console.error('test_kpi_momentum crashed: ' + err.message);
  process.exitCode = 1;
});
