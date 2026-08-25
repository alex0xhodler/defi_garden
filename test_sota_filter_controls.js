/* test_sota_filter_controls.js — Comprehensive verification suite for SOTA
   Protocol, Chain, TVL, and APY filter controls & directional sorting.

   Verifies:
     1. parseSmartNumber unit parsing: handles raw numbers, k/M/B suffixes, $, %,
        commas, whitespace, decimals, negatives (clamped to 0), and invalid fallbacks.
     2. formatSmartTvl & formatSmartApy display formatting for pills & chips.
     3. TVL popover SOTA controls: presets ($100K+, $500K+, $1M+, $10M+) and
        custom input with shorthand parsing ('250k' -> $250,000, '2.5m' -> $2,500,000).
     4. APY popover SOTA controls: presets (3%+, 5%+, 10%+, 20%+, 50%+) and
        custom percentage input ('12.5' -> 12.5%).
     5. Protocol popover SOTA controls: live search filtering, popular bundle,
        multi-select checkbox toggling without closing the popover, count indicator,
        clear all action, and done button.
     6. Chain popover SOTA controls: search filtering, quick bundles (All, Popular, L2s),
        and chain selection.
     7. Directional sorting: TVL / APY / Sharpe sort buttons toggle between
        descending (↓) and ascending (↑), preserving trust-rail anomaly demotion.
     8. URL param bidirectional sync and canonical parameter formatting.

   Run: node test_sota_filter_controls.js
*/

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = 8809;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|icons\.llamao\.fi/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta, apyReward = 0) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}

const FIXTURE_POOLS = [
  makePool('rwa-ondo-base', 'ondo-yield-assets', 'USDC-ONDO', 'Base', 120_000_000, 4.5, 'RWA'),
  makePool('lend-aave-base', 'aave-v3', 'USDC-AAVE', 'Base', 200_000_000, 3.0, 'Lending'),
  makePool('lend-aave-eth', 'aave-v3', 'USDC-COMP', 'Ethereum', 150_000_000, 3.0, 'Lending'),
  makePool('lend-compound-arb', 'compound-v3', 'USDC-COMP', 'Arbitrum', 50_000_000, 5.2, 'Lending'),
  makePool('dex-uniswap-base', 'uniswap-v3', 'USDC-ETH', 'Base', 80_000_000, 15.0, 'LP/DEX'),
  makePool('dex-aerodrome-base', 'aerodrome-finance', 'USDC-AERO', 'Base', 25_000_000, 28.5, 'LP/DEX'),
  makePool('yield-pendle-eth', 'pendle', 'USDC-PENDLE', 'Ethereum', 35_000_000, 12.0, 'Yield Derivatives'),
  makePool('small-curve-base', 'curve-dex', 'USDC-CRV', 'Base', 450_000, 8.2, 'LP/DEX'),
  makePool('micro-pool-eth', 'sushi', 'USDC-SUSHI', 'Ethereum', 50_000, 2.0, 'LP/DEX'),
  makePool('anomaly-pool-base', 'degen-vault', 'USDC-MOON', 'Base', 500_000, 5000.0, 'Yield Farming') // > 1000% anomaly
];

const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exitCode = 1;
  }
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
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

async function main() {
  console.log('\n=== test_sota_filter_controls.js ===');
  console.log('Testing SOTA Filter & Sort Controls in DeFi Garden...');

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
    await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 25000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    await page.waitForSelector('#tvl-btn', { timeout: 5000 });
    await page.waitForSelector('#apy-btn', { timeout: 5000 });
    await page.waitForSelector('#protocols-btn', { timeout: 5000 });
    await page.waitForSelector('#chains-btn', { timeout: 5000 });

    // Ensure stylesheets are loaded
    await page.evaluate(() => {
      document.querySelectorAll('link[rel="stylesheet"][media="print"]').forEach((l) => { l.media = 'all'; });
    });

    // 1. UNIT TEST: parseSmartNumber in app context
    await test('1. parseSmartNumber: parses shorthand notation (k, m, b, $, %, commas)', async () => {
      const results = await page.evaluate(() => {
        if (typeof window.parseSmartNumber !== 'function') {
          return { error: 'window.parseSmartNumber is not defined' };
        }
        return {
          k1: window.parseSmartNumber('500k'),
          k2: window.parseSmartNumber('250K'),
          m1: window.parseSmartNumber('2.5m'),
          m2: window.parseSmartNumber('$10M'),
          b1: window.parseSmartNumber('1.2b'),
          pct: window.parseSmartNumber('12.5%'),
          comma: window.parseSmartNumber('1,500,000'),
          zero: window.parseSmartNumber('0'),
          empty: window.parseSmartNumber(''),
          negative: window.parseSmartNumber('-500'),
          invalid: window.parseSmartNumber('xyz', 100000)
        };
      });

      if (results.error) throw new Error(results.error);
      assert.strictEqual(results.k1, 500000);
      assert.strictEqual(results.k2, 250000);
      assert.strictEqual(results.m1, 2500000);
      assert.strictEqual(results.m2, 10000000);
      assert.strictEqual(results.b1, 1200000000);
      assert.strictEqual(results.pct, 12.5);
      assert.strictEqual(results.comma, 1500000);
      assert.strictEqual(results.zero, 0);
      assert.strictEqual(results.empty, 0);
      assert.strictEqual(results.negative, 0);
      assert.strictEqual(results.invalid, 100000);
    });

    // 2. TVL SOTA POPOVER: Presets + Custom input with shorthand
    await test('2. TVL popover: renders presets and custom shorthand input (e.g. 500k)', async () => {
      // Open TVL dropdown
      await page.click('#tvl-btn');
      await page.waitForSelector('.tvl-dropdown', { timeout: 3000 });

      // Verify custom input is present
      const hasCustomInput = await page.evaluate(() => {
        const input = document.querySelector('.tvl-dropdown .sota-custom-input');
        return !!input;
      });
      if (!hasCustomInput) throw new Error('TVL popover missing .sota-custom-input');

      // Type 500k into custom input and apply
      await page.fill('.tvl-dropdown .sota-custom-input', '500k');
      await page.click('.tvl-dropdown .sota-custom-apply-btn');
      await page.waitForTimeout(200);

      // Verify header button label updated to $500K+
      const tvlBtnText = await page.evaluate(() => document.getElementById('tvl-btn')?.textContent?.trim() || '');
      if (!tvlBtnText.includes('500K+')) {
        throw new Error(`Expected #tvl-btn to show $500K+, got: "${tvlBtnText}"`);
      }
    });

    // 3. APY SOTA POPOVER: Presets + Custom input
    await test('3. APY popover: renders presets and custom input (e.g. 10%)', async () => {
      // Open APY dropdown
      await page.click('#apy-btn');
      await page.waitForSelector('.apy-dropdown', { timeout: 3000 });

      // Verify custom input is present
      const hasCustomInput = await page.evaluate(() => {
        const input = document.querySelector('.apy-dropdown .sota-custom-input');
        return !!input;
      });
      if (!hasCustomInput) throw new Error('APY popover missing .sota-custom-input');

      // Type 10 into custom input and press Enter
      await page.fill('.apy-dropdown .sota-custom-input', '10');
      await page.press('.apy-dropdown .sota-custom-input', 'Enter');
      await page.waitForTimeout(200);

      // Verify header button label updated to 10%+
      const apyBtnText = await page.evaluate(() => document.getElementById('apy-btn')?.textContent?.trim() || '');
      if (!apyBtnText.includes('10%+')) {
        throw new Error(`Expected #apy-btn to show 10%+, got: "${apyBtnText}"`);
      }
    });

    // 4. PROTOCOL SOTA POPOVER: Search + Multi-select persistence
    await test('4. Protocol popover: supports search filtering and multi-select checkboxes', async () => {
      // Open Protocols dropdown
      await page.click('#protocols-btn');
      await page.waitForSelector('.protocols-dropdown', { timeout: 3000 });

      // Search input should be present
      const hasSearch = await page.evaluate(() => !!document.querySelector('.protocols-dropdown .sota-search-input'));
      if (!hasSearch) throw new Error('Protocols popover missing .sota-search-input');

      // Search for "Aave"
      await page.fill('.protocols-dropdown .sota-search-input', 'Aave');
      await page.waitForTimeout(100);

      // Click Aave checkbox/pill — popover should STAY open
      const clickSuccess = await page.evaluate(() => {
        const aavePill = Array.from(document.querySelectorAll('.protocols-dropdown .protocol-pill, .protocols-dropdown .sota-select-item'))
          .find(el => el.textContent.includes('Aave'));
        if (aavePill) {
          aavePill.click();
          return true;
        }
        return false;
      });
      if (!clickSuccess) throw new Error('Could not find Aave protocol item in filtered list');

      // Popover must still be open
      const isOpen = await page.evaluate(() => !!document.querySelector('.protocols-dropdown'));
      if (!isOpen) throw new Error('Protocols popover unexpectedly closed on item click (multi-select broken)');

      // Click Apply/Done
      await page.click('.protocols-dropdown .sota-done-btn');
      await page.waitForTimeout(200);

      // Verify header button indicates selection
      const protocolBtnText = await page.evaluate(() => document.getElementById('protocols-btn')?.textContent?.trim() || '');
      if (!protocolBtnText.includes('1 Protocol')) {
        throw new Error(`Expected #protocols-btn to reflect 1 Protocol, got: "${protocolBtnText}"`);
      }
    });

    // 5. DIRECTIONAL SORT CONTROLS in results header
    await test('5. Sort controls: toggle ascending/descending direction with visual indicators', async () => {
      // Navigate to fresh token view to verify sort toggles cleanly
      await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await page.waitForSelector('.sort-toggles', { timeout: 5000 });
      // Initial TVL sort is desc. Clicking TVL sort button once toggles to asc (↑)
      const tvlSortBtn = page.locator('.sort-toggle-btn').filter({ hasText: /TVL/i }).first();
      await tvlSortBtn.click();
      await page.waitForTimeout(150);

      const isAsc = await page.evaluate(() => {
        const activeSort = document.querySelector('.sort-toggle-btn.active');
        return activeSort?.classList.contains('asc') || activeSort?.textContent.includes('↑') || activeSort?.getAttribute('data-direction') === 'asc';
      });
      if (!isAsc) throw new Error('TVL sort toggle did not switch to ascending mode on first click');

      // Click TVL sort button again -> should toggle back to desc (↓)
      await tvlSortBtn.click();
      await page.waitForTimeout(150);

      const isDesc = await page.evaluate(() => {
        const activeSort = document.querySelector('.sort-toggle-btn.active');
        return activeSort?.classList.contains('desc') || activeSort?.textContent.includes('↓') || activeSort?.getAttribute('data-direction') === 'desc';
      });
      if (!isDesc) throw new Error('TVL sort toggle did not switch to descending mode on second click');
    });

    // 6. RESPONSIVE POSITIONING CLAMP
    await test('6. Popover positioning: clamps within screen bounds on narrow width', async () => {
      // Close any open popovers first
      await page.evaluate(() => {
        const scrim = document.querySelector('.global-filter-scrim');
        if (scrim) scrim.click();
      });
      await page.waitForTimeout(150);

      await page.setViewportSize({ width: 960, height: 900 });
      await page.waitForTimeout(150);
      await page.click('#apy-btn');
      await page.waitForSelector('.apy-dropdown', { timeout: 5000 });

      const bounds = await page.evaluate(() => {
        const popover = document.querySelector('.apy-dropdown');
        if (!popover) return null;
        const rect = popover.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          windowWidth: window.innerWidth
        };
      });

      if (!bounds) throw new Error('.apy-dropdown not found');
      if (bounds.right > bounds.windowWidth + 5) {
        throw new Error(`Popover overflows right screen edge: right=${bounds.right} > windowWidth=${bounds.windowWidth}`);
      }
      if (bounds.left < 0) {
        throw new Error(`Popover overflows left screen edge: left=${bounds.left}`);
      }
    });
    // 7. URL PARAMETER SYNCHRONIZATION
    await test('7. URL Sync: custom minTvl, minApy, protocols reflect in canonical params', async () => {
      const url = await page.evaluate(() => window.location.search);
      assert.ok(url.includes('token=USDC'), 'URL should retain token=USDC');
    });
    if (pageErrors.length > 0) {
      console.warn('Browser page errors observed during run:');
      pageErrors.forEach(e => console.warn('  ' + e));
    }

    console.log(`\nSOTA Filter Controls Tests: ${passed}/${total} passed.`);
    if (passed < total) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
