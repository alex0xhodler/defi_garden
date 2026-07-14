/* Category-taxonomy gate for spec 091: adds two honest, protocol-derived
   analytics categories — RWA and Yield Derivatives — as first-class nav tabs +
   NL-parser targets. Borrowing is DEFERRED (supply-side feed only; see spec 091
   §"honest-classification decision").

   Two layers:
   1. Parser unit (pure Node, extractParser from test_helpers_parser.js, like
      test_protocol_parsing.js): "rwa"/"real world assets" -> RWA;
      "pendle"/"yield derivatives" -> Yield Derivatives; and a NEGATIVE case
      ("best usdc yields") adds neither.
   2. Rendered Playwright (fixture-routed, test_default_sort.js harness verbatim):
      an ondo (RWA) / pendle x2 (Yield Derivatives) / aave (Lending) fixture on
      chain Base; assert the RWA + Yield Derivatives nav tabs render, that
      clicking each filters the grid to its pools, that TYPING "pendle" filters
      by PROTOCOL not the PENDLE token (fix 098 — PT-USDE, a pendle pool with no
      PENDLE symbol segment, must appear), zero page errors, and that both tabs
      still exist in the DOM at a 360px viewport (they scroll, not wrap).

   Run: node test_category_taxonomy.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { extractParser } = require('./test_helpers_parser.js');

// ---------------------------------------------------------------------------
// Layer 1: parser unit
// ---------------------------------------------------------------------------
const TOKENS = ['USDC', 'USDT', 'ETH', 'SOL'];
const CHAINS = ['Base', 'Ethereum', 'Arbitrum', 'Solana'];

let parse;
try {
  parse = extractParser(path.join(__dirname, 'app.js'));
} catch (err) {
  console.error('EXTRACTION FAILED: ' + err.message);
  process.exit(1);
}

let unitPassed = 0;
let unitTotal = 0;
function assertIncludes(desc, query, category) {
  unitTotal++;
  const got = parse(query, TOKENS, CHAINS, []).poolTypes;
  if (got.includes(category)) { unitPassed++; console.log('  ✓ ' + desc); }
  else { console.log('  ✗ ' + desc + '\n    expected poolTypes to include ' + JSON.stringify(category) + ', got ' + JSON.stringify(got)); process.exitCode = 1; }
}
function assertExcludes(desc, query, categories) {
  unitTotal++;
  const got = parse(query, TOKENS, CHAINS, []).poolTypes;
  const bad = categories.filter((c) => got.includes(c));
  if (!bad.length) { unitPassed++; console.log('  ✓ ' + desc); }
  else { console.log('  ✗ ' + desc + '\n    expected poolTypes to exclude ' + JSON.stringify(categories) + ', got ' + JSON.stringify(got)); process.exitCode = 1; }
}

// Assert exact token + a protocol membership on the parsed result.
function assertTokenProtocol(desc, query, tokens, expectToken, expectProtocol) {
  unitTotal++;
  const r = parse(query, tokens, CHAINS, []);
  const okToken = r.token === expectToken;
  const okProto = expectProtocol == null || r.protocols.includes(expectProtocol);
  if (okToken && okProto) { unitPassed++; console.log('  ✓ ' + desc); }
  else { console.log('  ✗ ' + desc + '\n    expected token ' + JSON.stringify(expectToken) + (expectProtocol ? ' + protocol ' + JSON.stringify(expectProtocol) : '') + ', got token ' + JSON.stringify(r.token) + ' protocols ' + JSON.stringify(r.protocols)); process.exitCode = 1; }
}

console.log('=== parser unit: RWA / Yield Derivatives detection (spec 091) ===');
assertIncludes('"rwa" -> RWA', 'rwa', 'RWA');
assertIncludes('"real world assets" -> RWA', 'real world assets', 'RWA');
assertIncludes('"pendle" -> Yield Derivatives', 'pendle', 'Yield Derivatives');
assertIncludes('"yield derivatives" -> Yield Derivatives', 'yield derivatives', 'Yield Derivatives');
assertExcludes('"best usdc yields" -> neither RWA nor Yield Derivatives', 'best usdc yields', ['RWA', 'Yield Derivatives']);

// Fix (098): a bare protocol name that is ALSO a token symbol (PENDLE) must NOT
// become a token search — the protocol's pools span many underlying tokens, so
// token=PENDLE wrongly empties the result. The token is dropped; the protocol
// (+ category) drives the filter.
assertTokenProtocol('"pendle" -> token cleared, protocol Pendle', 'pendle', ['PENDLE', 'USDC', 'ETH'], '', 'Pendle');
assertTokenProtocol('"aave" -> token cleared, protocol Aave', 'aave', ['AAVE', 'USDC'], '', 'Aave');
// Non-regression: a token that is NOT the detected protocol's name stays.
assertTokenProtocol('"usdc on aave" keeps token USDC', 'usdc on aave', ['USDC', 'AAVE'], 'USDC', 'Aave');

// ---------------------------------------------------------------------------
// Layer 2: rendered Playwright (test_default_sort.js harness)
// ---------------------------------------------------------------------------
const PORT = 8801;
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
// All TVL > $10M, non-zero apyBase, all on Base. `PT-USDE` is a pendle-protocol
// pool whose symbol carries NO "PENDLE" token segment — it proves that typing
// "pendle" filters by PROTOCOL, not by the PENDLE token (fix 098).
const FIXTURE_POOLS = [
  makePool('rwa-ondo-base', 'ondo-yield-assets', 'USDC-ONDO', 'Base', 120_000_000, 4.5),
  makePool('yd-pendle-base', 'pendle', 'USDC-PENDLE', 'Base', 80_000_000, 6.0),
  makePool('yd-pendle-pt-base', 'pendle', 'PT-USDE', 'Base', 60_000_000, 7.5),
  makePool('lend-aave-base', 'aave-v3', 'USDC-AAVE', 'Base', 200_000_000, 3.0, 'Lending')
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
  // to the live fixture rather than the committed snapshot.
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

// Set of visible .pool-card symbols.
function symbolSet(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim())
  );
}
async function waitForSymbols(page, expected) {
  await page.waitForFunction((exp) => {
    const syms = Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim());
    return syms.length === exp.length && exp.every((s) => syms.includes(s));
  }, expected, { timeout: 15000 }).catch(() => {});
}
function assertSet(actual, expected, label) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (a.length !== e.length || !a.every((s, i) => s === e[i])) {
    throw new Error(`${label}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
  }
}
// Click the nav tab whose trimmed text exactly equals `label`.
async function clickTab(page, label) {
  await page.evaluate((lbl) => {
    const btn = Array.from(document.querySelectorAll('.google-nav-tab')).find(b => b.textContent.trim() === lbl);
    if (!btn) throw new Error('tab not found: ' + lbl);
    btn.click();
  }, label);
}

async function main() {
  console.log('\n=== rendered Playwright: category nav tabs + filtering (spec 091) ===');
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
    await waitForSymbols(page, ['USDC-ONDO', 'USDC-PENDLE', 'PT-USDE', 'USDC-AAVE']);

    // (a) The RWA + Yield Derivatives nav tabs render.
    await test('nav tabs include "RWA" and "Yield Derivatives"', async () => {
      const labels = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.google-nav-tab')).map(b => b.textContent.trim()));
      for (const want of ['RWA', 'Yield Derivatives']) {
        if (!labels.includes(want)) throw new Error(`expected a nav tab "${want}", got ${JSON.stringify(labels)}`);
      }
    });

    // (b) Clicking the RWA tab leaves ONLY the ondo pool.
    await test('clicking RWA tab filters grid to only the ondo pool', async () => {
      await clickTab(page, 'RWA');
      await waitForSymbols(page, ['USDC-ONDO']);
      assertSet(await symbolSet(page), ['USDC-ONDO'], 'RWA-filtered grid');
    });

    // (c) Clicking Yield Derivatives leaves ONLY the two pendle-protocol pools.
    await test('clicking Yield Derivatives tab filters grid to the pendle pools', async () => {
      await clickTab(page, 'Yield Derivatives');
      await waitForSymbols(page, ['USDC-PENDLE', 'PT-USDE']);
      assertSet(await symbolSet(page), ['USDC-PENDLE', 'PT-USDE'], 'Yield-Derivatives-filtered grid');
    });

    // (e) At 360px the RWA + Yield Derivatives tabs still exist in the DOM (they scroll).
    // Runs BEFORE the search test so it observes the healthy browse header.
    await test('RWA + Yield Derivatives tabs exist in DOM at 360px viewport', async () => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.waitForTimeout(200);
      const labels = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.google-nav-tab')).map(b => b.textContent.trim()));
      for (const want of ['RWA', 'Yield Derivatives']) {
        if (!labels.includes(want)) throw new Error(`expected "${want}" tab at 360px, got ${JSON.stringify(labels)}`);
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    // (c2) Fix 096: TYPING "pendle" filters by PROTOCOL, not the PENDLE token.
    // The old bug set token=PENDLE and showed a dead-end (or only PENDLE-symbol
    // pools). Now it must show BOTH pendle-protocol pools — crucially PT-USDE,
    // whose symbol has no PENDLE segment, so it can only appear via the protocol
    // filter, not a token filter. Drives the input via keyboard (the animated
    // placeholder re-renders the node, so a bound locator for press() can detach).
    await test('typing "pendle" shows pendle-PROTOCOL pools (not the PENDLE token)', async () => {
      await clickTab(page, 'All');
      await waitForSymbols(page, ['USDC-ONDO', 'USDC-PENDLE', 'PT-USDE', 'USDC-AAVE']);
      await page.click('.google-search-input');
      await page.keyboard.type('pendle', { delay: 20 });
      await page.waitForTimeout(400); // let the 300ms search debounce settle
      await page.keyboard.press('Enter');
      await waitForSymbols(page, ['USDC-PENDLE', 'PT-USDE']);
      const syms = await symbolSet(page);
      assertSet(syms, ['USDC-PENDLE', 'PT-USDE'], 'typed-"pendle" grid');
      // Explicit regression guard: the no-PENDLE-token pool MUST be present.
      if (!syms.includes('PT-USDE')) throw new Error('PT-USDE missing — search is still token-restricted to PENDLE');
    });

    // (d) Zero non-ignorable page errors.
    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${unitPassed}/${unitTotal} parser-unit + ${passed}/${total} rendered assertions passed`);
  if (unitPassed !== unitTotal || passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_category_taxonomy crashed: ' + err.message);
  process.exitCode = 1;
});
