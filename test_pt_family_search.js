/* Item 151: PT search groups maturity variants under their parent asset.
   Run: node test_pt_family_search.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { extractParser } = require('./test_helpers_parser.js');

const ROOT = __dirname;
const PORT = 8815;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const TOKENS = ['PT', 'SUSDAI', 'SUSDE', '22OCT2026', '18JUN2026', '13AUG2026', 'USDC'];
const CHAINS = ['Ethereum', 'Base'];
const POOLS = [
  { pool: 'susdai-oct', project: 'aave-v3', symbol: 'PT-SUSDAI-22OCT2026', chain: 'Ethereum', tvlUsd: 40_000_000, apyBase: 4.2, apyReward: 0 },
  { pool: 'susdai-jun', project: 'morpho-blue', symbol: 'PT-SUSDAI-18JUN2026', chain: 'Base', tvlUsd: 30_000_000, apyBase: 4.0, apyReward: 0 },
  { pool: 'susde-aug', project: 'aave-v3', symbol: 'PT-SUSDE-13AUG2026', chain: 'Ethereum', tvlUsd: 20_000_000, apyBase: 3.8, apyReward: 0 },
  { pool: 'opt-collision', project: 'aave-v3', symbol: 'OPT-USDC', chain: 'Ethereum', tvlUsd: 60_000_000, apyBase: 3.7, apyReward: 0 },
  { pool: 'usdc-control', project: 'aave-v3', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 50_000_000, apyBase: 3.5, apyReward: 0 }
];
const EXPECT_PT = POOLS.slice(0, 3).map((p) => p.symbol);
const EXPECT_SUSDAI = POOLS.slice(0, 2).map((p) => p.symbol);

let parse;
try { parse = extractParser(path.join(ROOT, 'app.js')); }
catch (err) { console.error('EXTRACTION FAILED: ' + err.message); process.exit(1); }

function parserCase(query, expected) {
  assert.strictEqual(parse(query, TOKENS, CHAINS, []).token, expected, `${query} parser token`);
}
parserCase('PT', 'PT');
parserCase('PT-SUSDAI', 'PT-SUSDAI');
parserCase('ptsusdai', 'PT-SUSDAI');
parserCase('PT-NOTREAL', '');
console.log('4 parser assertions passed');

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
    'https://unpkg.com/react@18/umd/react.production.min.js': path.join(nodeModules, 'react/umd/react.production.min.js'),
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(nodeModules, 'react-dom/umd/react-dom.production.min.js'),
    'https://unpkg.com/@babel/standalone/babel.min.js': path.join(nodeModules, '@babel/standalone/babel.min.js')
  };
  for (const [url, localPath] of Object.entries(vendored)) {
    await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath) }));
  }
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: POOLS }) }));
}

function visibleSymbols(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map((el) => el.textContent.trim()).sort());
}
async function waitForSymbols(page, expected) {
  const sorted = [...expected].sort();
  try {
    await page.waitForFunction((want) => {
      const got = Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map((el) => el.textContent.trim()).sort();
      return JSON.stringify(got) === JSON.stringify(want);
    }, sorted, { timeout: 15000 });
  } catch (err) {
    const actual = await visibleSymbols(page);
    const input = await page.$eval('.app-search-input', (el) => el.value);
    throw new Error(`expected ${JSON.stringify(sorted)}, got ${JSON.stringify(actual)} for input ${JSON.stringify(input)} at ${page.url()}`);
  }
}
async function submit(page, query, expected, expectedToken) {
  await page.click('.app-search-input', { clickCount: 3 });
  await page.keyboard.type(query);
  await page.waitForTimeout(350);
  await page.keyboard.press('Enter');
  await waitForSymbols(page, expected);
  assert.deepStrictEqual(await visibleSymbols(page), [...expected].sort(), `rendered ${query} results`);
  assert.strictEqual(await page.$eval('.app-search-input', (el) => el.value), query, `${query} input`);
  assert.strictEqual(new URL(page.url()).searchParams.get('token'), expectedToken, `${query} URL token`);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const source = msg.location()?.url || '';
      const ignorable = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
      if (!ignorable.test(source) && !ignorable.test(msg.text())) {
        errors.push('console.error: ' + msg.text() + (source ? ` (${source})` : ''));
      }
    });
    await routeFixtures(page);
    await page.goto(`http://localhost:${PORT}/?chain=All`, { waitUntil: 'load', timeout: 20000 });
    await waitForSymbols(page, POOLS.map((p) => p.symbol));
    await submit(page, 'PT', EXPECT_PT, 'PT');
    await submit(page, 'PT-SUSDAI', EXPECT_SUSDAI, 'PT-SUSDAI');
    await page.setViewportSize({ width: 360, height: 780 });
    await submit(page, 'ptsusdai', EXPECT_SUSDAI, 'PT-SUSDAI');
    assert.deepStrictEqual(errors, [], 'non-ignorable page errors');
    console.log('4 rendered assertions passed');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => { console.error(err.stack || err.message); process.exitCode = 1; });
