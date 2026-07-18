/* Playwright behavior gate for spec 117.1 (pool-detail rate-stability Sharpe
   annotation): drives the REAL rendered pool-detail UI (static server +
   chromium) and asserts on the rendered DOM — never on a return value. The
   Sharpe line renders as ONE extra calm line INSIDE the 088.1
   .rate-track-record-note, present only when kpis.apySharpe is a finite number.

   Fixture-routed like test_kpi_track_record.js: browser-originated HTTPS is
   proxy-blocked in-sandbox (standing decision 2026-07-12), so the
   yields.llama.fi /pools fetch and the unpkg React/Babel scripts are stubbed
   with local vendored copies / a DefiLlama-shaped fixture snapshot. External
   font/analytics fetches fail locally and are ignorable per CLAUDE.md.

   Run: node test_kpi_sharpe_annotation.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8798;
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
// never interferes with the note under test. apyMean30d ≈ cur so 071 never
// fires and the parent .rate-track-record-note always renders.
function makePool(overrides) {
  return Object.assign({
    pool: 'fixture-pool', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
    tvlUsd: 45_000_000, apyBase: 0, apyReward: 0
  }, overrides);
}

// S1 — apySharpe a finite number + hp:30 (≥8) → Sharpe annotation PRESENT.
const SHARPE_POOL = makePool({
  pool: 'sharpe-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.1, apyStdev: 0.4, tvlTrend: 0.02, apySharpe: 0.5 }
});
// S2 — apySharpe null (but hp:30 so parent block still renders) → annotation ABSENT.
const NULL_SHARPE_POOL = makePool({
  pool: 'null-sharpe-pool', apyBase: 6, apyMean30d: 6,
  kpis: { historyPoints: 30, firstSeen: '2026-06-14', apyMomentum: 0.1, apyStdev: 0.4, tvlTrend: 0.02, apySharpe: null }
});

const ALL_POOLS = [SHARPE_POOL, NULL_SHARPE_POOL];
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
// settled pool-detail DOM: the parent note text (which includes the Sharpe
// annotation as an extra child line).
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
    return { present: !!el, text: el ? el.textContent : null };
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
    await page.route('https://icons.llamao.fi/**', (route) => route.abort());
    await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
    }));

    // S1 — finite apySharpe: annotation present with benchmark + caveat, no raw key.
    await test('S1 apySharpe:0.5 (hp:30) renders Sharpe annotation w/ "4%" benchmark + principal-safety caveat', async () => {
      const { present, text } = await renderPool(page, SHARPE_POOL.pool);
      if (!present) throw new Error('expected .rate-track-record-note to be present');
      if (!text.includes('Rate-stability score')) throw new Error(`expected Sharpe annotation, got: ${text}`);
      if (!text.includes('0.5')) throw new Error(`expected formatted value "0.5", got: ${text}`);
      if (!text.includes('4%')) throw new Error(`expected "4%" benchmark, got: ${text}`);
      if (!text.includes('not a measure of principal safety')) throw new Error(`expected principal-safety caveat, got: ${text}`);
      if (text.includes('rateSharpeNote')) throw new Error(`raw translation key leaked: ${text}`);
    });

    // S2 — null apySharpe: parent note renders (stdev sentence), annotation ABSENT.
    await test('S2 apySharpe:null (hp:30) renders parent note but NO Sharpe annotation', async () => {
      const { present, text } = await renderPool(page, NULL_SHARPE_POOL.pool);
      if (!present) throw new Error('expected .rate-track-record-note to still render (hp:30)');
      if (text.includes('Rate-stability score')) throw new Error(`expected NO Sharpe annotation when apySharpe null, got: ${text}`);
      if (text.includes('rateSharpeNote')) throw new Error(`raw translation key leaked: ${text}`);
    });

    // S3 — Korean copy on the finite-Sharpe fixture: KO caveat present, no raw key.
    await test('S3 ?lang=ko finite apySharpe renders Korean Sharpe annotation', async () => {
      const { present, text } = await renderPool(page, SHARPE_POOL.pool, 'ko');
      if (!present) throw new Error('expected .rate-track-record-note to be present in ko');
      if (!text.includes('이율 안정성 점수')) throw new Error(`expected Korean Sharpe substring, got: ${text}`);
      if (!text.includes('원금 안전성을 나타내는 지표가 아닙니다')) throw new Error(`expected Korean principal-safety caveat, got: ${text}`);
      if (text.includes('rateSharpeNote')) throw new Error(`raw translation key leaked: ${text}`);
    });

    // S4 — zero page errors across every render above.
    await test('S4 zero page errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/4 rate-stability Sharpe annotation behavior assertions passed');
}

main().catch((err) => {
  console.error('test_kpi_sharpe_annotation crashed: ' + err.message);
  process.exitCode = 1;
});
