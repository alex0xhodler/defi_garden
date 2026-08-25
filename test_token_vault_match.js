/* Playwright behavior gate: the analytics token filter must include vault-ticker
   pools whose DefiLlama `symbol` embeds the base asset (STEAKUSDC, GTUSDCP,
   mwUSDC), not only pools whose symbol is literally the token.

   Regression guarded: app.js matched a pool to a token only when a
   separator-split part of the symbol EXACTLY equalled the token
   (`symbol === 'USDC'`), so every Morpho Blue USDC vault on Base was dropped
   from `?token=USDC&chain=Base` — the biggest venues vanished and a small
   bare-"USDC" pool (Centrifuge) floated to the top. Fixed via
   symbolMatchesToken() (substring, DefiLlama-parity), used by the grid filter
   AND the chain/protocol/pool-type counts.

   Drives the REAL rendered analytics app (home.html + app.compiled.min.js) at
   the parameterized `?token=USDC&chain=Base` URL — asserts on the DOM grid,
   never on a helper's return value (spec 017 precedent). Run: node test_token_vault_match.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8802;
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
// DefiLlama-shaped: Morpho Blue vaults carry vault-ticker symbols; the bare
// "USDC" pools are the only ones the OLD exact-match kept. Plus noise:
// wrong-chain USDC (Ethereum), a below-$10M-floor USDC pool, and a WETH pool
// (over-match guard — a USDC search must NOT pull it in).
const FIXTURE_POOLS = [
  makePool('base-gtusdcp',   'morpho-blue',        'GTUSDCP',     'Base',     428_000_000, 4.33),
  makePool('base-steakusdc', 'morpho-blue',        'STEAKUSDC',   'Base',     370_000_000, 4.36),
  makePool('base-sirloin',   'morpho-blue',        'SIRLOINUSDC', 'Base',     203_000_000, 5.45),
  makePool('base-usdc-cfg',  'centrifuge-protocol','USDC',        'Base',      50_000_000, 2.15),
  makePool('base-usdc-aave', 'aave-v3',            'USDC',        'Base',      33_000_000, 3.02),
  makePool('base-weth-aave', 'aave-v3',            'WETH',        'Base',     100_000_000, 2.10), // must NOT match USDC
  makePool('eth-steakusdc',  'morpho-blue',        'STEAKUSDC',   'Ethereum', 230_000_000, 4.11), // wrong chain
  makePool('base-usdc-tiny', 'some-proto',         'PUSDC',       'Base',          50_000, 3.89)   // below $100K floor
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'home.html' : urlPath.replace(/^\/+/, ''));
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

async function loadSearch(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const src = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(src) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (src ? ' (' + src + ')' : ''));
    }
  });
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route(POOLS_URL, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));
  await page.goto('http://localhost:' + PORT + '/?token=USDC&chain=Base', { waitUntil: 'load', timeout: 15000 });
  await page.waitForSelector('.pool-card', { timeout: 10000 });
  const symbols = await page.$$eval('.pool-symbol', (els) => els.map((e) => e.textContent.trim().toUpperCase()));
  return { page, errors, symbols };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    let shared;
    await test('Morpho vault-ticker pools (STEAKUSDC/GTUSDCP/SIRLOINUSDC) appear for token=USDC on Base', async () => {
      shared = await loadSearch(browser);
      const { symbols, errors } = shared;
      for (const want of ['GTUSDCP', 'STEAKUSDC', 'SIRLOINUSDC']) {
        if (!symbols.some((s) => s.includes(want))) {
          throw new Error('expected a "' + want + '" card; rendered symbols = ' + JSON.stringify(symbols));
        }
      }
      if (errors.length) throw new Error('unexpected page errors: ' + errors.join(' | '));
    });

    await test('highest-TVL Morpho vault leads the grid (not the bare-USDC Centrifuge pool)', async () => {
      const top = shared.symbols[0];
      if (!/GTUSDCP/.test(top)) throw new Error('expected GTUSDCP ($428M) first by TVL, got "' + top + '"');
    });

    await test('over-match guard: a WETH pool is NOT pulled into a USDC search', async () => {
      if (shared.symbols.some((s) => s === 'WETH' || s.includes('WETH'))) {
        throw new Error('WETH leaked into token=USDC results: ' + JSON.stringify(shared.symbols));
      }
    });

    await test('chain + TVL rails still hold (wrong-chain + sub-$10M pools excluded)', async () => {
      // 5 Base USDC-substring pools are >= $10M; the Ethereum STEAKUSDC and the
      // $5M PUSDC must be absent. (PUSDC substring-matches USDC but is below floor.)
      const count = shared.symbols.length;
      if (count !== 5) throw new Error('expected exactly 5 cards (chain+floor rails), got ' + count + ': ' + JSON.stringify(shared.symbols));
      if (shared.symbols.some((s) => s.includes('PUSDC'))) throw new Error('sub-$10M PUSDC pool leaked past the TVL floor');
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log('\n' + passed + '/4 passed');
}

main();
