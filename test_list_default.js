/* Playwright behavior gate for spec 090: the analytics browse must DEFAULT to
   the list/rows container (`.pools-list`), not the grid of boxes. Drives the
   REAL rendered UI (http-server + chromium) and asserts on the rendered DOM —
   never on source strings — per the 2026-07-11 standing decision that UX items
   ship a rendered Playwright test.

   Fixture-routed, sandbox-safe: this run's sandbox blocks browser HTTPS to
   unpkg.com (React/Babel) and yields.llama.fi (pools), so those are routed to
   local vendored copies / a DefiLlama-shaped fixture. The committed static
   snapshot (/data/pools-snapshot*) is stale-stubbed (generatedAt 2020) so the
   FE's 15-min freshness gate falls back to the live fixture rather than the
   committed snapshot — mirrors test_search.js exactly.

   Run: node test_list_default.js */
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
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// DefiLlama-shaped fixture (mirrors test_search.js): sized above DEFAULT_MIN_TVL
// ($100K as of spec 173, was $10M) so trust-rail filtering never hides them.
// USDC + an Ethereum-chain pool guarantee both the ?token= and ?chain= paths
// render cards.
function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
const FIXTURE_POOLS = [
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9, 'Lending'),
  makePool('usdc-arb-aave', 'aave-v3', 'USDC', 'Arbitrum', 70_000_000, 4.8),
  makePool('eth-eth-aave', 'aave-v3', 'ETH', 'Ethereum', 200_000_000, 2.9),
  makePool('3crv-eth-curve', 'curve-dex', '3CRV', 'Ethereum', 60_000_000, 3.2)
];
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
  // Stale-stub the committed snapshot so the 15-min freshness gate falls back
  // to the live fixture (spec 059 pattern, copied from test_search.js).
  await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

async function poolsContainerClass(page) {
  await page.waitForSelector('.pool-card', { timeout: 15000 });
  return page.evaluate(() => {
    const card = document.querySelector('.pool-card');
    const container = card && card.parentElement;
    return {
      containerClass: container ? container.className : null,
      cardCount: document.querySelectorAll('.pool-card').length
    };
  });
}

async function main() {
  console.log('network: unpkg.com BLOCKED (vendored React/Babel), yields.llama.fi BLOCKED (fixture snapshot)');
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

    await test('/?token=USDC defaults to .pools-list with pool cards (no interaction)', async () => {
      await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      const { containerClass, cardCount } = await poolsContainerClass(page);
      if (containerClass !== 'pools-list') {
        throw new Error(`expected pools container class "pools-list", got "${containerClass}"`);
      }
      if (!(cardCount >= 1)) {
        throw new Error(`expected >=1 .pool-card inside the list container, got ${cardCount}`);
      }
    });

    await test('▦/☰ toggle works both ways (grid → list)', async () => {
      // Already on /?token=USDC from the previous test. Click Grid View.
      await page.locator('.view-toggle-btn[title="Grid View"]').click();
      await page.waitForFunction(
        () => { const c = document.querySelector('.pool-card'); return c && c.parentElement.className === 'pools-grid'; },
        { timeout: 5000 }
      ).catch(() => {});
      let cls = await page.evaluate(() => document.querySelector('.pool-card').parentElement.className);
      if (cls !== 'pools-grid') throw new Error(`after Grid View click, expected "pools-grid", got "${cls}"`);

      // Click List View — back to rows.
      await page.locator('.view-toggle-btn[title="List View"]').click();
      await page.waitForFunction(
        () => { const c = document.querySelector('.pool-card'); return c && c.parentElement.className === 'pools-list'; },
        { timeout: 5000 }
      ).catch(() => {});
      cls = await page.evaluate(() => document.querySelector('.pool-card').parentElement.className);
      if (cls !== 'pools-list') throw new Error(`after List View click, expected "pools-list", got "${cls}"`);
    });

    await test('/?chain=Ethereum (chain mode) also defaults to .pools-list with pool cards', async () => {
      await page.goto(`http://localhost:${PORT}/?chain=Ethereum`, { waitUntil: 'load', timeout: 20000 });
      const { containerClass, cardCount } = await poolsContainerClass(page);
      if (containerClass !== 'pools-list') {
        throw new Error(`expected pools container class "pools-list" in chain mode, got "${containerClass}"`);
      }
      if (!(cardCount >= 1)) {
        throw new Error(`expected >=1 .pool-card in chain mode, got ${cardCount}`);
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
  console.log(`✓ ${passed}/${total} list-default assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_list_default crashed: ' + err.message);
  process.exitCode = 1;
});
