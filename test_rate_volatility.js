/* Playwright behavior gate for spec 071 (pool-detail rate-volatility honesty
   note): drives the REAL rendered pool-detail UI (static server + chromium)
   and asserts on the rendered DOM — never on a return value. Spec acceptance
   criteria 1–5 are exercised as real `/?pool=<id>` renders.

   Fixture-routed like test_search.js: browser-originated HTTPS is proxy-blocked
   in-sandbox (standing decision 2026-07-12), so the yields.llama.fi /pools
   fetch and the unpkg React/Babel scripts are stubbed with local vendored
   copies / a DefiLlama-shaped fixture snapshot. External font/analytics fetches
   fail locally and are ignorable per CLAUDE.md.

   Run: node test_rate_volatility.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8794;
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
// never interferes with the divergence note under test.
function makePool(overrides) {
  return Object.assign({
    pool: 'fixture-pool', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
    tvlUsd: 45_000_000, apyBase: 0, apyReward: 0
  }, overrides);
}

// Criterion 1: base+reward total = 142.84, apyMean30d = 405.32 (the reported
// 2.8x case). Note MUST render with both formatted strings.
const DIVERGENT = makePool({
  pool: 'divergent-pool', apyBase: 100, apyReward: 42.84, apyMean30d: 405.32
});
// Criterion 2: total 5.20 vs 30d mean 5.00 (1.04x). Note MUST be absent.
const STABLE = makePool({
  pool: 'stable-pool', apyBase: 5.2, apyReward: 0, apyMean30d: 5.0
});
// Criterion 3: divergent-looking rates but NO apyMean30d. Note MUST be absent.
const NO_MEAN = makePool({
  pool: 'no-mean-pool', apyBase: 100, apyReward: 42.84
});

const ALL_POOLS = [DIVERGENT, STABLE, NO_MEAN];
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
  // Pool Information is expanded by default; wait for its content to mount so
  // the note (if any) has had its render pass.
  await page.waitForSelector('.pool-info-content', { timeout: 15000 });
  // The note is conditional; give the render a settle window then read once.
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const el = document.querySelector('.rate-volatility-note');
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
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
    }));

    // Criterion 1 — divergent fixture shows the note with both formatted APYs.
    await test('divergent pool (142.84% vs 405.32%) renders .rate-volatility-note with both numbers', async () => {
      const { present, text } = await renderPool(page, DIVERGENT.pool);
      if (!present) throw new Error('expected .rate-volatility-note to be present');
      if (!text.includes('142.84%')) throw new Error(`expected note text to contain "142.84%", got: ${text}`);
      if (!text.includes('405.32%')) throw new Error(`expected note text to contain "405.32%", got: ${text}`);
    });

    // Criterion 2 — stable fixture: no note.
    await test('stable pool (5.20% vs 5.00%) renders no .rate-volatility-note', async () => {
      const { present } = await renderPool(page, STABLE.pool);
      if (present) throw new Error('expected no .rate-volatility-note on a stable pool');
    });

    // Criterion 3 — missing apyMean30d: no note.
    await test('pool with no apyMean30d renders no .rate-volatility-note', async () => {
      const { present } = await renderPool(page, NO_MEAN.pool);
      if (present) throw new Error('expected no .rate-volatility-note when apyMean30d is missing');
    });

    // Criterion 4 — Korean copy on the divergent fixture.
    await test('?lang=ko divergent pool renders Korean note copy', async () => {
      const { present, text } = await renderPool(page, DIVERGENT.pool, 'ko');
      if (!present) throw new Error('expected .rate-volatility-note to be present in ko');
      if (!text.includes('이율은 변동이 큽니다')) {
        throw new Error(`expected Korean note substring, got: ${text}`);
      }
      if (!text.includes('142.84%') || !text.includes('405.32%')) {
        throw new Error(`expected ko note to still carry both formatted APYs, got: ${text}`);
      }
    });

    // Criterion 5 — zero page errors across every render above.
    await test('zero page errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/5 rate-volatility behavior assertions passed');
}

main().catch((err) => {
  console.error('test_rate_volatility crashed: ' + err.message);
  process.exitCode = 1;
});
