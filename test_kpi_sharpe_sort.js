/* Playwright behavior gate for spec 117.2: the analytics grid gains a
   "Risk-adjusted" sort that ranks rail-passing (sane) pools by rate-stability
   Sharpe (pool.kpis.apySharpe, from the 117 compute leg) descending, while
   anomalous pools (APY > APY_SANITY_LIMIT = 1000%) stay demoted below ALL sane
   pools exactly as the tvl/apy sorts, and null-Sharpe sane pools sort after all
   numeric-Sharpe sane pools (graceful no-op until data accrues ~2026-07-22).
   Drives the REAL rendered UI (http-server + chromium) and asserts on the
   rendered DOM order of .pool-symbol — never on source strings — per the
   2026-07-11 standing decision that UX items ship a rendered Playwright test.

   Fixture-routed, sandbox-safe: this run's sandbox blocks browser HTTPS to
   unpkg.com (React/Babel) and yields.llama.fi (pools), so those are routed to
   local vendored copies / a DefiLlama-shaped fixture. The committed static
   snapshot (/data/pools-snapshot*) is stale-stubbed (generatedAt 2020) so the
   FE's 15-min freshness gate falls back to the live fixture rather than the
   committed snapshot — mirrors test_default_sort.js / test_zero_yield_demote.js.

   Fixture: all pools above DEFAULT_MIN_TVL ($100K as of spec 173, was $10M), every symbol carries the
   "USDC" token segment (so /?token=USDC matches all) and every pool is on chain
   Base (so /?chain=Base matches all) — one fixture drives token + chain modes.
   Numeric-Sharpe order is MAXIMALLY different from TVL order so DOM order is
   unambiguous. Includes an ANOMALOUS pool (apyBase > 1000) with a HIGH apySharpe
   that MUST still sort last, and a null-apySharpe sane pool that MUST sort after
   all numeric-Sharpe sane pools.

     symbol     tvl     apyBase  apySharpe   role
     USDC-HI    50M     4        3.0         sane, highest Sharpe
     USDC-MID   300M    5        2.0         sane, mid Sharpe (biggest TVL → proves it's Sharpe not TVL)
     USDC-LO    200M    6        1.0         sane, lowest numeric Sharpe
     USDC-NUL   100M    4        null        sane, null Sharpe → after all numeric
     USDC-ANOM  400M    1500     9.9         ANOMALOUS (apyBase > 1000) → last of all
   Sharpe-desc among sane numeric = HI, MID, LO ; then NUL ; then ANOM.
   TVL-desc order would be ANOM(400M), MID(300M), LO(200M), NUL(100M), HI(50M) —
   maximally different, so a passing order proves the Sharpe comparator ran.

   Run: node test_kpi_sharpe_sort.js */
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

function makePool(id, project, symbol, chain, tvlUsd, apyBase, apySharpe, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0, kpis: { apySharpe } };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
const FIXTURE_POOLS = [
  makePool('usdc-hi-base', 'aave-v3', 'USDC-HI', 'Base', 50_000_000, 4.0, 3.0),
  makePool('usdc-mid-base', 'morpho-blue', 'USDC-MID', 'Base', 300_000_000, 5.0, 2.0, 'Lending'),
  makePool('usdc-lo-base', 'curve-dex', 'USDC-LO', 'Base', 200_000_000, 6.0, 1.0),
  makePool('usdc-nul-base', 'aave-v3', 'USDC-NUL', 'Base', 100_000_000, 4.0, null),
  makePool('usdc-anom-base', 'somewhere', 'USDC-ANOM', 'Base', 400_000_000, 1500.0, 9.9)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// Expected risk-adjusted order: sane numeric Sharpe desc, then null-Sharpe sane,
// then the anomalous pool demoted below every sane pool.
const SHARPE_ORDER = ['USDC-HI', 'USDC-MID', 'USDC-LO', 'USDC-NUL', 'USDC-ANOM'];
const SANE_NUMERIC = ['USDC-HI', 'USDC-MID', 'USDC-LO'];

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
  // to the live fixture (spec 059 pattern, copied from test_default_sort.js).
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

    // The "Risk-adjusted" button carries the translated label; read it live so
    // the click is by rendered text, not a hard-coded source string.
    let sharpeLabelEn = null;

    // (a) Token-first mode: click the Risk-adjusted sort → Sharpe-desc ordering,
    //     with anomalous demoted last and null-Sharpe after numeric.
    await test('/?token=USDC + Risk-adjusted sort → Sharpe-desc, anomalous last, null after numeric', async () => {
      await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      sharpeLabelEn = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.view-toggle-btn.sort-toggle-btn'));
        // The third sort button (after APY, TVL) is the risk-adjusted one.
        const b = btns.find(x => x.textContent.trim() !== 'APY' && x.textContent.trim() !== 'TVL');
        return b ? b.textContent.trim() : null;
      });
      if (!sharpeLabelEn) throw new Error('Risk-adjusted sort button not found');
      await page.locator('.view-toggle-btn.sort-toggle-btn', { hasText: sharpeLabelEn }).click();
      await waitForOrder(page, SHARPE_ORDER);
      assertOrder(await symbolOrder(page), SHARPE_ORDER, 'token-mode Sharpe order');
    });

    // (b) Explicit acceptance-criteria assertions on the same rendered order.
    await test('sane pools order by apySharpe DESC (HI > MID > LO)', async () => {
      const order = await symbolOrder(page);
      const idx = (s) => order.indexOf(s);
      if (!(idx('USDC-HI') < idx('USDC-MID') && idx('USDC-MID') < idx('USDC-LO'))) {
        throw new Error(`expected HI<MID<LO by Sharpe, got ${JSON.stringify(order)}`);
      }
    });

    await test('anomalous pool (APY > APY_SANITY_LIMIT) stays demoted below ALL sane pools', async () => {
      const order = await symbolOrder(page);
      const anomIdx = order.indexOf('USDC-ANOM');
      if (anomIdx === -1) throw new Error(`USDC-ANOM not rendered; order=${JSON.stringify(order)}`);
      const saneMax = Math.max(...order.map((s, i) => ({ s, i })).filter(({ s }) => s !== 'USDC-ANOM').map(({ i }) => i));
      if (!(anomIdx > saneMax)) {
        throw new Error(`expected USDC-ANOM (idx ${anomIdx}) after all sane pools (max idx ${saneMax}); order=${JSON.stringify(order)}`);
      }
    });

    await test('null-Sharpe sane pool sorts after all numeric-Sharpe sane pools', async () => {
      const order = await symbolOrder(page);
      const nulIdx = order.indexOf('USDC-NUL');
      if (nulIdx === -1) throw new Error(`USDC-NUL not rendered; order=${JSON.stringify(order)}`);
      const numericMax = Math.max(...SANE_NUMERIC.map((s) => order.indexOf(s)));
      if (!(nulIdx > numericMax)) {
        throw new Error(`expected USDC-NUL (idx ${nulIdx}) after all numeric-Sharpe sane pools (max idx ${numericMax}); order=${JSON.stringify(order)}`);
      }
    });

    // (c) Chain-first mode: same fixture, same expected order via the chain branch.
    await test('/?chain=Base + Risk-adjusted sort → same Sharpe-desc order (chain branch)', async () => {
      await page.goto(`http://localhost:${PORT}/?chain=Base`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await page.locator('.view-toggle-btn.sort-toggle-btn', { hasText: sharpeLabelEn }).click();
      await waitForOrder(page, SHARPE_ORDER);
      assertOrder(await symbolOrder(page), SHARPE_ORDER, 'chain-mode Sharpe order');
    });

    // (d) KO label: the rendered button text is the Korean string, not the raw
    //     translation key and not the EN string.
    await test('?lang=ko → Risk-adjusted button shows the KO label (not raw key, not EN)', async () => {
      await page.goto(`http://localhost:${PORT}/?token=USDC&lang=ko`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const koLabel = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.view-toggle-btn.sort-toggle-btn'));
        const b = btns.find(x => x.textContent.trim() !== 'APY' && x.textContent.trim() !== 'TVL');
        return b ? b.textContent.trim() : null;
      });
      if (!koLabel) throw new Error('Risk-adjusted sort button not found under ?lang=ko');
      if (koLabel === 'sortByRiskAdjusted') throw new Error('raw translation key leaked as button label');
      if (koLabel === sharpeLabelEn) throw new Error(`KO label identical to EN label (${JSON.stringify(koLabel)}); KO string missing`);
      if (!/[가-힣]/.test(koLabel)) throw new Error(`expected Hangul in KO label, got ${JSON.stringify(koLabel)}`);
      // The KO button must still function: clicking it produces the Sharpe order.
      await page.locator('.view-toggle-btn.sort-toggle-btn', { hasText: koLabel }).click();
      await waitForOrder(page, SHARPE_ORDER);
      assertOrder(await symbolOrder(page), SHARPE_ORDER, 'KO-label Sharpe order');
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
  console.log(`✓ ${passed}/${total} risk-adjusted-sort assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_kpi_sharpe_sort crashed: ' + err.message);
  process.exitCode = 1;
});
