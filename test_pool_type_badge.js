/* Pool-detail hero badge classification gate (spec 130). The pool-detail hero
   badge (.pool-type-badge-hero) previously carried a NARROW inline copy of the
   pool-type classifier that diverged from app.js's complete one — so
   stablecoin-lending pools (sky-lending / SUSDS, venus-core-pool) were
   mislabelled "YIELD FARMING". Spec 130 de-duplicates into ONE shared
   classifier (getPoolTypeShared in PoolDetail.js) used by both surfaces.

   Rendered Playwright only (fixture-routed, test_category_taxonomy.js harness
   verbatim): deep-link /?pool=<id>, read .pool-type-badge-hero textContent,
   assert the corrected category. Primary fix: sky-lending -> "Lending".

   Run: node test_pool_type_badge.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8834;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// All TVL > $10M, non-zero apyBase, distinct pool id + symbol. These exercise
// each branch of the shared classifier as seen on the pool-detail hero badge.
const FIXTURE_POOLS = [
  { pool: 'p-susds', project: 'sky-lending', symbol: 'SUSDS', chain: 'Ethereum', tvlUsd: 200_000_000, apyBase: 3.6, apyReward: 0 },
  { pool: 'p-venus', project: 'venus-core-pool', symbol: 'USDC-VENUS', chain: 'BSC', tvlUsd: 268_000_000, apyBase: 4.0, apyReward: 0 },
  { pool: 'p-aave', project: 'aave-v3', symbol: 'USDC-AAVE', chain: 'Ethereum', tvlUsd: 300_000_000, apyBase: 3.0, apyReward: 0 },
  { pool: 'p-pendle', project: 'pendle', symbol: 'PT-USDE', chain: 'Ethereum', tvlUsd: 80_000_000, apyBase: 7.5, apyReward: 0 },
  { pool: 'p-farm', project: 'some-random-farm', symbol: 'CAKE-BNB', chain: 'BSC', tvlUsd: 15_000_000, apyBase: 20.0, apyReward: 5.0 }
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// Expected hero-badge textContent (raw mixed-case DOM string; CSS uppercases
// it visually via text-transform, but textContent is the raw category name).
const EXPECTED = [
  { id: 'p-susds', category: 'Lending' },            // PRIMARY FIX (was "Yield Farming")
  { id: 'p-venus', category: 'Lending' },            // proves the richer shared list is used
  { id: 'p-aave', category: 'Lending' },             // regression — already worked
  { id: 'p-pendle', category: 'Yield Derivatives' }, // spec-091 category pool-detail previously lacked
  { id: 'p-farm', category: 'Yield Farming' }        // negative — default still works
];

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
  // Stale-stub the committed snapshot so the 15-min freshness gate falls back
  // to the live fixture rather than the committed snapshot.
  await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

async function main() {
  console.log('\n=== rendered Playwright: pool-detail hero badge classification (spec 130) ===');
  console.log('network: unpkg.com BLOCKED (vendored React/Babel), yields.llama.fi BLOCKED (fixture snapshot)');
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    for (const { id, category } of EXPECTED) {
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

      await test(`${id} hero badge === "${category}"`, async () => {
        await page.goto(`http://localhost:${PORT}/?pool=${id}`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.pool-type-badge-hero', { timeout: 15000 });
        const raw = (await page.$eval('.pool-type-badge-hero', el => el.textContent)).trim();
        // Prefer an exact match against the raw mixed-case DOM string; fall back
        // to case-insensitive only if the platform uppercased textContent.
        const ok = raw === category || raw.toLowerCase() === category.toLowerCase();
        if (!ok) throw new Error(`expected badge "${category}", got "${raw}"`);
      });

      await test(`${id} renders with zero non-ignorable page errors`, async () => {
        if (pageErrors.length) throw new Error('page errors:\n    ' + pageErrors.join('\n    '));
      });

      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed}/${total} rendered assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_pool_type_badge crashed: ' + err.message);
  process.exitCode = 1;
});
