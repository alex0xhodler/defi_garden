/* Playwright behavior gate for spec 089: the analytics browse must DEFAULT to
   TVL-descending sort (size = the safety signal the cautious saver reads first),
   NOT APY-descending. Drives the REAL rendered UI (http-server + chromium) and
   asserts on the rendered DOM order of .pool-symbol — never on source strings —
   per the 2026-07-11 standing decision that UX items ship a rendered Playwright
   test.

   Fixture-routed, sandbox-safe: this run's sandbox blocks browser HTTPS to
   unpkg.com (React/Babel) and yields.llama.fi (pools), so those are routed to
   local vendored copies / a DefiLlama-shaped fixture. The committed static
   snapshot (/data/pools-snapshot*) is stale-stubbed (generatedAt 2020) so the
   FE's 15-min freshness gate falls back to the live fixture rather than the
   committed snapshot — mirrors test_zero_yield_demote.js / test_list_default.js.

   Fixture: all pools above DEFAULT_MIN_TVL ($10M), all with non-zero apyBase (so
   092's no-supply-yield demote never interferes — this test is purely about
   TVL-vs-APY ordering of yielding pools). TVL-desc order and APY-desc order are
   MAXIMALLY different, so DOM order is unambiguous:
     USDC-AAA  tvl 300M  apy 3%
     USDC-BBB  tvl 200M  apy 5%
     USDC-CCC  tvl 100M  apy 9%
   TVL-desc = AAA,BBB,CCC ; APY-desc = CCC,BBB,AAA.
   Every symbol contains the "USDC" token segment (so /?token=USDC matches all)
   and every pool is on chain Base (so /?chain=Base matches all) — one fixture
   exercises both the token-first and chain-first sort branches.

   Run: node test_default_sort.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8799;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
const FIXTURE_POOLS = [
  makePool('usdc-aaa-base', 'aave-v3', 'USDC-AAA', 'Base', 300_000_000, 3.0),
  makePool('usdc-bbb-base', 'morpho-blue', 'USDC-BBB', 'Base', 200_000_000, 5.0, 'Lending'),
  makePool('usdc-ccc-base', 'curve-dex', 'USDC-CCC', 'Base', 100_000_000, 9.0)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

const TVL_ORDER = ['USDC-AAA', 'USDC-BBB', 'USDC-CCC']; // TVL desc
const APY_ORDER = ['USDC-CCC', 'USDC-BBB', 'USDC-AAA']; // APY desc

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
  // to the live fixture (spec 059 pattern, copied from test_zero_yield_demote.js).
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

// Wait until the rendered symbol order matches the expected array.
async function waitForOrder(page, expected) {
  await page.waitForFunction((exp) => {
    const syms = Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim());
    return syms.length === exp.length && syms.every((s, i) => s === exp[i]);
  }, expected, { timeout: 5000 }).catch(() => {});
}

function assertOrder(actual, expected, label) {
  if (actual.length !== expected.length || !actual.every((s, i) => s === expected[i])) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
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

    // (a) Token-first mode: fresh load, NO interaction → TVL-descending default.
    await test('/?token=USDC fresh load (no interaction) → TVL-descending order', async () => {
      await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await waitForOrder(page, TVL_ORDER);
      assertOrder(await symbolOrder(page), TVL_ORDER, 'token-mode default order');
    });

    // (b) Chain-first mode: fresh load, NO interaction → TVL-descending default.
    await test('/?chain=Base fresh load (no interaction) → TVL-descending order', async () => {
      await page.goto(`http://localhost:${PORT}/?chain=Base`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await waitForOrder(page, TVL_ORDER);
      assertOrder(await symbolOrder(page), TVL_ORDER, 'chain-mode default order');
    });

    // (c) TVL sort toggle carries `active` by default; APY does not.
    await test('TVL sort toggle is active by default, APY is not', async () => {
      // Still on /?chain=Base from the previous test, no sort interaction yet.
      const state = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.view-toggle-btn.sort-toggle-btn'));
        const find = (label) => btns.find(b => b.textContent.trim() === label);
        const apy = find('APY');
        const tvl = find('TVL');
        return {
          apyActive: apy ? apy.classList.contains('active') : null,
          tvlActive: tvl ? tvl.classList.contains('active') : null
        };
      });
      if (state.tvlActive !== true) throw new Error(`expected TVL sort button active, got ${JSON.stringify(state)}`);
      if (state.apyActive !== false) throw new Error(`expected APY sort button NOT active, got ${JSON.stringify(state)}`);
    });

    // (d) Toggle round-trip: APY → APY-desc, TVL → back to TVL-desc.
    await test('sort toggle round-trip: APY → APY-desc, TVL → TVL-desc', async () => {
      await page.locator('.view-toggle-btn.sort-toggle-btn', { hasText: 'APY' }).click();
      await waitForOrder(page, APY_ORDER);
      assertOrder(await symbolOrder(page), APY_ORDER, 'after APY toggle');

      await page.locator('.view-toggle-btn.sort-toggle-btn', { hasText: 'TVL' }).click();
      await waitForOrder(page, TVL_ORDER);
      assertOrder(await symbolOrder(page), TVL_ORDER, 'after TVL toggle');
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
  console.log(`✓ ${passed}/${total} default-sort assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_default_sort crashed: ' + err.message);
  process.exitCode = 1;
});
