/* Playwright behavior gate: a token + chain=All (or Popular) analytics query
   must return the token's pools, not the "No yields found" empty state.

   Regression cover for the reported bug: the token-first filter matched
   pool.chain === selectedChain literally, so selectedChain==='All' (a wildcard,
   not a real chain) filtered out EVERY pool and the UI wrongly showed
   "No yields found for USDC" on /?token=USDC&chain=All&poolTypes=Lending&minTvl=10000000.

   Fixture-routed like test_kpi_track_record.js: browser-originated HTTPS is
   proxy-blocked in-sandbox, so unpkg React/Babel are vendored locally and the
   yields.llama.fi /pools fetch is a DefiLlama-shaped fixture. The snapshot route
   is served STALE so the FE falls back to the fixtured live endpoint. External
   font/analytics fetches fail locally and are ignorable per CLAUDE.md.

   Run: node test_token_chain_all.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8815;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// DefiLlama-shaped fixtures, all above DEFAULT_MIN_TVL ($10M) and below the
// 1000% sanity limit. USDC lending pools spread across several chains (incl. a
// non-popular one, Metis) + a non-USDC and a non-lending pool as negative cover.
function pool(o) {
  return Object.assign({ pool: 'p', project: 'aave-v3', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 50_000_000, apyBase: 5, apyReward: 0 }, o);
}
const POOLS = [
  pool({ pool: 'u-eth', project: 'aave-v3', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 180_000_000 }),
  pool({ pool: 'u-base', project: 'compound-v3', symbol: 'USDC', chain: 'Base', tvlUsd: 36_000_000 }),
  pool({ pool: 'u-arb', project: 'aave-v3', symbol: 'USDC', chain: 'Arbitrum', tvlUsd: 30_000_000 }),
  pool({ pool: 'u-metis', project: 'tectonic', symbol: 'USDC', chain: 'Metis', tvlUsd: 15_000_000 }), // non-popular chain
  pool({ pool: 'u-lp', project: 'uniswap-v3', symbol: 'USDC-ETH', chain: 'Ethereum', tvlUsd: 90_000_000 }), // USDC but LP, not Lending
  pool({ pool: 'dai-eth', project: 'aave-v3', symbol: 'DAI', chain: 'Ethereum', tvlUsd: 70_000_000 }) // not USDC
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: POOLS });

let passed = 0;
async function test(name, fn) {
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

async function renderQuery(page, query) {
  await page.goto(`http://localhost:${PORT}/home.html?${query}`, { waitUntil: 'load', timeout: 20000 });
  // Either results or the empty state settles; wait for whichever appears.
  await page.waitForSelector('.pool-card, .empty-state', { timeout: 15000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => ({
    emptyState: !!document.querySelector('.empty-state'),
    // main results only (exclude .empty-state-alternatives suggestions)
    cards: document.querySelectorAll('.pools-grid > .pool-card, .pools-list > .pool-card').length
  }));
}

async function main() {
  console.log('network: unpkg.com BLOCKED (local vendored React/Babel), yields.llama.fi BLOCKED (DefiLlama-shaped fixture)');
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
    // Stale snapshot -> FE falls back to the fixtured live endpoint deterministically.
    await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));

    // The exact reported URL: token + chain=All + Lending + $10M floor.
    await test('?token=USDC&chain=All&poolTypes=Lending&minTvl=10000000 shows pools, not the empty state', async () => {
      const { emptyState, cards } = await renderQuery(page, 'token=USDC&chain=All&poolTypes=Lending&minTvl=10000000');
      if (emptyState) throw new Error('empty state rendered — the chain=All token query wrongly returned zero pools');
      // 4 USDC lending pools (eth/base/arb/metis); the USDC-ETH LP and the DAI pool are excluded.
      if (cards !== 4) throw new Error(`expected 4 USDC lending pool cards across all chains, got ${cards}`);
    });

    // chain=All with no pool-type filter returns every USDC pool (incl. the LP).
    await test('?token=USDC&chain=All returns all USDC pools across chains', async () => {
      const { emptyState, cards } = await renderQuery(page, 'token=USDC&chain=All');
      if (emptyState) throw new Error('empty state rendered for token=USDC&chain=All');
      if (cards !== 5) throw new Error(`expected 5 USDC pools (4 lending + 1 LP) across all chains, got ${cards}`);
    });

    // Regression: a specific chain still filters to that chain only.
    await test('?token=USDC&chain=Base still filters to the single chain (no over-match)', async () => {
      const { emptyState, cards } = await renderQuery(page, 'token=USDC&chain=Base');
      if (emptyState) throw new Error('empty state rendered for token=USDC&chain=Base');
      if (cards !== 1) throw new Error(`expected exactly 1 USDC pool on Base, got ${cards}`);
    });

    // chain=Popular includes popular-chain pools, excludes the non-popular Metis one.
    await test('?token=USDC&chain=Popular includes popular chains, excludes non-popular (Metis)', async () => {
      const { emptyState, cards } = await renderQuery(page, 'token=USDC&chain=Popular&poolTypes=Lending&minTvl=10000000');
      if (emptyState) throw new Error('empty state rendered for token=USDC&chain=Popular');
      if (cards !== 3) throw new Error(`expected 3 USDC lending pools on popular chains (eth/base/arb, not Metis), got ${cards}`);
    });

    await test('zero page errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/5 token+chain=All behavior assertions passed');
}

main().catch((err) => { console.error('test_token_chain_all crashed: ' + err.message); process.exitCode = 1; });
