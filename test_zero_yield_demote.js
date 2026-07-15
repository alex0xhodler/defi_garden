/* Playwright behavior gate for spec 092: 0%/near-0%-yield pools (collateral
   assets with huge TVL, no supply yield) must be DEMOTED below yielding pools
   in the TVL sort, and TAGGED "No supply yield" on the card — while KEEPING the
   honest 0.00% number (trust rail: never hide/fabricate a number). Drives the
   REAL rendered UI (http-server + chromium) and asserts on the rendered DOM —
   never on source strings — per the 2026-07-11 standing decision that UX items
   ship a rendered Playwright test.

   Fixture-routed, sandbox-safe: this run's sandbox blocks browser HTTPS to
   unpkg.com (React/Babel) and yields.llama.fi (pools), so those are routed to
   local vendored copies / a DefiLlama-shaped fixture. The committed static
   snapshot (/data/pools-snapshot*) is stale-stubbed (generatedAt 2020) so the
   FE's 15-min freshness gate falls back to the live fixture rather than the
   committed snapshot — mirrors test_list_default.js exactly.

   Run: node test_zero_yield_demote.js */
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

// DefiLlama-shaped fixture: sized above DEFAULT_MIN_TVL ($10M) so trust-rail
// filtering never hides them. Several yielding Base pools plus ONE high-TVL
// 0%-yield collateral pool (CBBTC) whose TVL dwarfs every yielding pool — the
// exact population the audit flags. `apyReward` defaults to 0 in makePool.
function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
const COLLATERAL_ID = 'cbbtc-base-collateral';
const FIXTURE_POOLS = [
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-base-morpho', 'morpho-blue', 'USDC', 'Base', 55_000_000, 5.9, 'Lending'),
  makePool('weth-base-aave', 'aave-v3', 'WETH', 'Base', 80_000_000, 8.0),
  makePool('dai-base-curve', 'curve-dex', 'DAI', 'Base', 40_000_000, 4.8),
  makePool(COLLATERAL_ID, 'aave-v3', 'CBBTC', 'Base', 500_000_000, 0)
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
  // to the live fixture (spec 059 pattern, copied from test_list_default.js).
  await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

// Ordered list of .pool-symbol texts, in DOM order.
function symbolOrder(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim())
  );
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

    await page.goto(`http://localhost:${PORT}/?chain=Base`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });

    // Click the TVL sort toggle (default is APY). The sort buttons are
    // .view-toggle-btn.sort-toggle-btn labeled 'APY' / 'TVL' (app.js ~line 2892).
    await page.locator('.sort-toggle-btn', { hasText: 'TVL' }).click();
    // Wait until the collateral pool has sunk to the last card position.
    await page.waitForFunction(() => {
      const syms = Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim());
      return syms.length > 1 && syms[syms.length - 1] === 'CBBTC';
    }, { timeout: 5000 }).catch(() => {});

    await test('TVL sort demotes the 0%-yield collateral pool below every yielding pool', async () => {
      const order = await symbolOrder(page);
      const collateralIdx = order.indexOf('CBBTC');
      if (collateralIdx === -1) throw new Error(`CBBTC card not found; order=${JSON.stringify(order)}`);
      // Every OTHER card is a yielding pool — each must appear before CBBTC.
      const yieldingIdxs = order
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s !== 'CBBTC')
        .map(({ i }) => i);
      if (yieldingIdxs.length < 1) throw new Error(`expected >=1 yielding card, order=${JSON.stringify(order)}`);
      const maxYielding = Math.max(...yieldingIdxs);
      if (!(collateralIdx > maxYielding)) {
        throw new Error(`expected CBBTC (idx ${collateralIdx}) after all yielding cards (max idx ${maxYielding}); order=${JSON.stringify(order)}`);
      }
    });

    await test('collateral card shows the "No supply yield" tag (.pool-apy-tag)', async () => {
      const tagText = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.pool-card'));
        const card = cards.find(c => c.querySelector('.pool-symbol')?.textContent.trim() === 'CBBTC');
        const tag = card && card.querySelector('.pool-apy-tag');
        return tag ? tag.textContent.trim() : null;
      });
      if (tagText !== 'No supply yield') {
        throw new Error(`expected .pool-apy-tag text "No supply yield", got ${JSON.stringify(tagText)}`);
      }
    });

    await test('collateral card still renders the honest 0.00% APY hero (trust rail)', async () => {
      const heroText = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.pool-card'));
        const card = cards.find(c => c.querySelector('.pool-symbol')?.textContent.trim() === 'CBBTC');
        const hero = card && card.querySelector('.pool-apy-hero');
        return hero ? hero.textContent.trim() : null;
      });
      if (heroText === null) throw new Error('CBBTC .pool-apy-hero not found');
      // Number preserved: reads as "0" / "0.00%" once formatApy rounds.
      if (!/0/.test(heroText) || !heroText.includes('%')) {
        throw new Error(`expected honest zero APY in hero (contains "0" and "%"), got ${JSON.stringify(heroText)}`);
      }
    });

    await test('a yielding pool card does NOT show the .pool-apy-tag', async () => {
      const hasTag = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.pool-card'));
        const card = cards.find(c => c.querySelector('.pool-symbol')?.textContent.trim() !== 'CBBTC');
        return !!(card && card.querySelector('.pool-apy-tag'));
      });
      if (hasTag) throw new Error('a yielding pool card unexpectedly rendered .pool-apy-tag');
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
  console.log(`✓ ${passed}/${total} zero-yield-demote assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_zero_yield_demote crashed: ' + err.message);
  process.exitCode = 1;
});
