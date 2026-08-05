/* Playwright rendered-acceptance gate for spec 241 (UX audit F6): the analytics
   grid's `.google-results-count` ("N results") and the `.results-count` line
   (translations.js's `showingResults`, "N pools found") must render the SAME
   grouped en-US formatting for the SAME number — not one grouped and one bare.
   Both read the identical `filteredPools.length` value (app.js:3132/3310), so
   the only way they can disagree is if one accessor formats and the other
   doesn't; this drives the REAL rendered app (not a unit fixture) per the
   2026-07-11 standing decision that UX items ship a rendered Playwright test.

   >=1000 results is the reproduction condition for the audit's original bug
   (a 4-digit count needs grouping to look different from a bare digit run at
   all) — the fixture below returns exactly 1,976 distinct USDC pools, all
   comfortably above DEFAULT_MIN_TVL ($10M) so the trust-rail filter never
   trims the count.

   Fixture-routed, sandbox-safe (mirrors test_list_default.js / test_search.js):
   this sandbox blocks browser HTTPS to unpkg.com and yields.llama.fi, so
   those are routed to local vendored copies / this file's DefiLlama-shaped
   fixture; the committed static snapshot is stale-stubbed so the FE's
   freshness gate falls back to the live-fixture route.

   Run: node test_results_count_render.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8978; // grepped max claimed port at write time was 8975 (test_audit_occlusion_lens.js's RUNAUDIT_PORT).
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const POOL_COUNT = 1976; // same probe value as test_translations_number_format.js, thematic only — any count >= 1000 exercises the bug.
const CHAINS = ['Ethereum', 'Base', 'Arbitrum', 'Polygon', 'Optimism', 'Avalanche'];
function makeFixturePools(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      pool: `usdc-fixture-${i}`,
      project: `fixture-protocol-${i % 40}`,
      symbol: 'USDC',
      chain: CHAINS[i % CHAINS.length],
      tvlUsd: 20_000_000 + (i * 1000), // comfortably above DEFAULT_MIN_TVL ($10M)
      apyBase: 2 + (i % 10) * 0.3,
      apyReward: 0
    });
  }
  return out;
}
const FIXTURE_POOLS = makeFixturePools(POOL_COUNT);
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

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

async function routeFixtures(page) {
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
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

function normalize(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log(`network: unpkg.com BLOCKED (vendored React/Babel), yields.llama.fi BLOCKED (fixture: ${POOL_COUNT} USDC pools)`);
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
    await routeFixtures(page);

    await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    // Both counters derive from the same filteredPools.length (app.js) — wait
    // for the header text to actually settle (non-empty, contains a digit)
    // before reading either surface, so a still-settling render can't be
    // mistaken for a mismatch. Deliberately does NOT gate on the grouped
    // form ("1,976") here — that's exactly the thing under test below, and a
    // settle-wait gated on the expected-correct answer would time out
    // (uninformatively) instead of failing the assertions cleanly if the
    // bug were present.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.google-results-count');
        return el && /\d/.test(el.textContent);
      },
      { timeout: 15000 }
    );

    const googleResultsText = normalize(await page.locator('.google-results-count').innerText());
    const resultsCountText = normalize(await page.locator('.results-count').innerText());

    await test(`.google-results-count renders the grouped count ("${POOL_COUNT.toLocaleString('en-US')}"), not a bare digit run`, () => {
      const grouped = POOL_COUNT.toLocaleString('en-US');
      if (!googleResultsText.includes(grouped)) {
        throw new Error(`expected "${grouped}" inside ".google-results-count", got "${googleResultsText}"`);
      }
      if (new RegExp(`(?<!\\d)${POOL_COUNT}(?!\\d)`).test(googleResultsText)) {
        throw new Error(`".google-results-count" contains a BARE (ungrouped) ${POOL_COUNT}: "${googleResultsText}"`);
      }
    });

    await test(`.results-count (showingResults) renders the grouped count ("${POOL_COUNT.toLocaleString('en-US')}"), not a bare digit run`, () => {
      const grouped = POOL_COUNT.toLocaleString('en-US');
      if (!resultsCountText.includes(grouped)) {
        throw new Error(`expected "${grouped}" inside ".results-count", got "${resultsCountText}"`);
      }
      if (new RegExp(`(?<!\\d)${POOL_COUNT}(?!\\d)`).test(resultsCountText)) {
        throw new Error(`".results-count" contains a BARE (ungrouped) ${POOL_COUNT}: "${resultsCountText}"`);
      }
    });

    await test('both surfaces render the IDENTICAL grouped rendering of the same number (the "two inches apart" cross-surface invariant)', () => {
      const grouped = POOL_COUNT.toLocaleString('en-US');
      const googleHasGrouped = googleResultsText.includes(grouped);
      const resultsHasGrouped = resultsCountText.includes(grouped);
      if (!(googleHasGrouped && resultsHasGrouped)) {
        throw new Error('at least one surface did not render the grouped form — see the two assertions above for which.\n' +
          `  .google-results-count: "${googleResultsText}"\n  .results-count: "${resultsCountText}"`);
      }
    });

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`✓ ${passed}/${total} results-count-render assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_results_count_render crashed: ' + err.message);
  process.exitCode = 1;
});
