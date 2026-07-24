/* Playwright acceptance gate (backlog item 135): the analytics app must NOT
   pin the default floor `minTvl=10000000` into the URLs it generates.

   Guarded regression: `updateUrl` (app.js) wrote `minTvl` whenever
   `minTvl > 0`. DEFAULT_MIN_TVL = 10000000, and the read path already defaults
   an ABSENT `minTvl` to that same $10M floor — so pinning the default into
   every `?token=`/`?chain=` URL was pure noise leaking into indexed/shared
   links. The fix omits `minTvl` when it equals DEFAULT_MIN_TVL; non-default
   floors are still serialized, and the effective floor is unchanged.

   Run: node test_minttvl_clean_url.js

   Harness mirrors test_plan_clean_url.js: static server (home.html for `/`),
   sandboxed Chromium, the pools-fetch fixture route, snapshot-stub route, and
   the ignorable-error classifier. Drives the REAL analytics UI at a real
   parameterized path — no unit fixtures. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8801;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml; charset=utf-8'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;

const POOLS_URL = 'https://yields.llama.fi/pools';
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
// USDC pools all ABOVE the $10M default floor so they pass and render.
const FIXTURE_POOLS = [
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9),
  makePool('usdc-arb-aave', 'aave-v3', 'USDC', 'Arbitrum', 70_000_000, 4.8),
  makePool('usdc-sol-kamino', 'kamino-lend', 'USDC', 'Solana', 80_000_000, 7.5),
  makePool('eth-eth-aave', 'aave-v3', 'ETH', 'Ethereum', 200_000_000, 2.9)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// Vercel-style resolver: `/` -> home.html (which serves both the planner and,
// on a parameterized URL, the analytics app).
function resolveCleanUrl(urlPath) {
  if (urlPath === '/') return 'home.html';
  const rel = urlPath.replace(/^\/+/, '');
  if (fs.existsSync(path.join(ROOT, rel))) return rel;
  if (!path.extname(rel) && fs.existsSync(path.join(ROOT, rel + '.html'))) return rel + '.html';
  return rel;
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, resolveCleanUrl(urlPath));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
    }
  });
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route(POOLS_URL, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));
  return { page, errors };
}

// Wait for the analytics results grid to render at least one pool card.
async function waitForPools(page) {
  await page.waitForSelector('.pool-card', { timeout: 15000 });
}

// Poll window.location.search until `predicate` holds or timeout — the
// URL-write effect fires ~100ms after isInitialLoad flips false.
async function pollSearch(page, predicate, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 3000);
  let search = '';
  while (Date.now() < deadline) {
    search = await page.evaluate(() => window.location.search);
    if (predicate(search)) return search;
    await page.waitForTimeout(100);
  }
  return search;
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // Test A (THE FIX): landing on /?token=USDC settles into a URL that does
    // NOT pin the default minTvl=10000000, but keeps token=USDC.
    await test('/?token=USDC does not pin minTvl=10000000 into the settled URL', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/?token=USDC', { waitUntil: 'load', timeout: 15000 });
      await waitForPools(page);
      // Give the post-initial-load URL-write effect time to run, and assert the
      // default floor never appears at any point during the settle window.
      const search = await pollSearch(page, (s) => /minTvl=10000000/.test(s), 3000);
      if (/minTvl=10000000/.test(search)) throw new Error('URL still pins the default floor: ' + search);
      if (!/token=USDC/i.test(search)) throw new Error('URL lost token=USDC after settle: ' + search);
      if (errors.length) throw new Error('unexpected page errors: ' + errors.join(' | '));
      console.log('      (settled search=' + JSON.stringify(search) + ')');
      await page.close();
    });

    // Test B (floor intact via read path): a bare /?token=USDC (no minTvl param)
    // still renders the >$10M USDC pools — the $10M default floor still applies.
    await test('bare /?token=USDC still renders pools >= $10M (default floor intact)', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/?token=USDC', { waitUntil: 'load', timeout: 15000 });
      await waitForPools(page);
      const cardCount = await page.$$eval('.pool-card', (els) => els.length);
      if (cardCount < 1) throw new Error('no pool cards rendered for bare /?token=USDC');
      if (errors.length) throw new Error('unexpected page errors: ' + errors.join(' | '));
      console.log('      (' + cardCount + ' USDC pool cards rendered)');
      await page.close();
    });

    // Test C (non-default still serialized): a non-$10M floor round-trips and is
    // re-written to the URL — proving only the default is omitted, not all minTvl.
    await test('/?token=USDC&minTvl=50000 keeps the non-default floor in the settled URL', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/?token=USDC&minTvl=50000', { waitUntil: 'load', timeout: 15000 });
      await waitForPools(page);
      // The non-default value must persist through settle (URL re-serialization).
      const search = await pollSearch(page, (s) => !/minTvl=50000/.test(s), 3000);
      if (!/minTvl=50000/.test(search)) throw new Error('non-default minTvl=50000 was dropped from the URL: ' + search);
      if (/minTvl=10000000/.test(search)) throw new Error('URL unexpectedly pinned the default floor: ' + search);
      if (errors.length) throw new Error('unexpected page errors: ' + errors.join(' | '));
      console.log('      (settled search=' + JSON.stringify(search) + ')');
      await page.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log('\n' + passed + '/3 passed');
}

main();
