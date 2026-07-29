/* Rendered Playwright test for backlog 132 — the ?token= landing loading flash.
   Before the fix, the empty-state top message ("No yields found for X / Try
   adjusting your filters") rendered DURING the initial fetch, because the
   grid-vs-empty ternary (app.js) gated only on `filteredPools.length > 0`, not
   `loading`. This drives a real ?token= landing with a DELAYED pools fetch and
   asserts: (1) during the fetch the results area shows the loading line, NOT
   "No yields found"; (2) once the fetch resolves to no matching pools, the
   honest empty state renders.

   Fixture-routed (unpkg React/Babel vendored, snapshot 404'd to force the live
   path so the delay is observable) — the house pattern from test_search.js.

   Run: node test_token_loading_state.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8796;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
// pools-snapshot is deliberately 404'd below (to force the live path), so its
// browser-logged 404 is a harness artifact, not a real page error.
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Fixture pools — none match INFINIFIUSDC, so a search for it resolves EMPTY
// after load (the case the human hit). All well above DEFAULT_MIN_TVL ($100K as of spec 173, was $10M) so the floor never hides them.
const FIXTURE = JSON.stringify({ status: 'success', data: [
  { pool: 'usdc-base-aave', project: 'aave-v3', symbol: 'USDC', chain: 'Base', tvlUsd: 45_000_000, apyBase: 4.2, apyReward: 0 },
  { pool: 'eth-eth-aave', project: 'aave-v3', symbol: 'ETH', chain: 'Ethereum', tvlUsd: 200_000_000, apyBase: 2.9, apyReward: 0 }
]});

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

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
        pageErrors.push('console.error: ' + m.text());
    });

    const nm = path.join(ROOT, 'node_modules');
    for (const [url, lp] of Object.entries({
      'https://unpkg.com/react@18/umd/react.production.min.js': path.join(nm, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(nm, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js': path.join(nm, '@babel/standalone/babel.min.js')
    })) {
      await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
    }
    await page.route('https://icons.llamao.fi/**', (r) => r.abort());
    // 404 the committed snapshot → forces the live path, whose timing we control.
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    // DELAY the live pools fetch by 1.8s so the loading state is observable.
    await page.route('https://yields.llama.fi/pools', async (r) => {
      await new Promise((res) => setTimeout(res, 1800));
      r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE });
    });

    await test('132: during the delayed fetch a ?token= landing shows the loading line, NOT "No yields found"', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?token=INFINIFIUSDC`, { waitUntil: 'commit', timeout: 20000 });
      // Results section renders as soon as selectedToken is set (from the URL),
      // BEFORE the (delayed) pools fetch resolves — the pre-fetch window.
      await page.waitForSelector('.results-section .empty-state', { timeout: 12000 });
      const msg = (await page.locator('.results-section .empty-message').first().textContent() || '').trim();
      if (/No yields found/i.test(msg)) throw new Error(`empty-state "No yields found" rendered during load (the 132 flash): "${msg}"`);
      if (!/Loading/i.test(msg)) throw new Error(`expected a loading line during the fetch, got: "${msg}"`);
    });

    await test('132: after the fetch resolves to no matching pools, the honest empty state renders', async () => {
      await page.waitForFunction(
        () => /No yields found/i.test(document.querySelector('.results-section .empty-message')?.textContent || ''),
        { timeout: 12000 }
      );
      const msg = (await page.locator('.results-section .empty-message').first().textContent() || '').trim();
      if (!/INFINIFIUSDC/i.test(msg)) throw new Error(`expected the resolved empty state to name the token, got: "${msg}"`);
    });

    await test('132: no page/console errors on the ?token= landing', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_token_loading_state.js: ${passed}/3 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
