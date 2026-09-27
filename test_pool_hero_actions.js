/* Playwright gate: on every ?pool= page the hero's two actions ("Spend yield"
   and the protocol CTA) sit side by side and are fully inside the first
   viewport on mobile and desktop — after the APY's honesty qualifier.
   Run: node test_pool_hero_actions.js */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8847;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi|yields\.llama\.fi\/chart|fontshare\.com|www\.google\.com\/s2\/favicons|coingecko/i;

const FIXTURE_POOLS = [
  { pool: 'aaaaaaaa-0000-4000-8000-000000000001', project: 'morpho-blue', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 250_000_000, apyBase: 5.4, apyReward: 0, apyMean30d: 5.3 },
  { pool: 'aaaaaaaa-0000-4000-8000-000000000002', project: 'ondo-yield-assets', symbol: 'USDY', chain: 'Ethereum', tvlUsd: 1_200_000_000, apyBase: 3.6, apyReward: 0, apyMean30d: 3.6 },
  // Volatile: current vs 30d mean >= 1.5x renders the rate-volatility honesty note.
  { pool: 'aaaaaaaa-0000-4000-8000-000000000003', project: 'aave-v3', symbol: 'USDT', chain: 'Arbitrum', tvlUsd: 40_000_000, apyBase: 12.5, apyReward: 0, apyMean30d: 5.0 }
];
const VIEWPORTS = [[1280, 720], [1440, 900], [390, 844], [360, 740]];

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

async function preparePage(page) {
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  // Stale snapshot -> the app falls through to the routed live /pools fixture.
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}'
  }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ status: 'success', data: FIXTURE_POOLS })
  }));
  await page.route('https://api.llama.fi/protocols', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]'
  }));
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  let passed = 0;
  let failed = 0;
  try {
    for (const fixture of FIXTURE_POOLS) {
      for (const [w, h] of VIEWPORTS) {
        const name = fixture.project + ' ' + w + 'x' + h;
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = [];
        page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const source = (msg.location() && msg.location().url) || '';
          if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) errors.push('console.error: ' + msg.text());
        });
        try {
          await preparePage(page);
          await page.goto(`http://localhost:${PORT}/?pool=${fixture.pool}`, { waitUntil: 'load', timeout: 20000 });
          await page.waitForSelector('.pool-hero-actions .cta-button-primary', { timeout: 15000 });
          await page.waitForTimeout(300);
          const m = await page.evaluate(() => {
            const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
            const primary = document.querySelector('.pool-hero-actions .cta-button-primary');
            const secondary = document.querySelector('.pool-hero-actions .pool-hero-action-secondary .cta-button-protocol');
            const qualifier = document.querySelector('.pool-hero-qualifier');
            return {
              ih: innerHeight, iw: innerWidth, sw: document.documentElement.scrollWidth,
              primary: box(primary), secondary: secondary && box(secondary),
              qualifier: qualifier && box(qualifier),
              volatility: !!document.querySelector('.rate-volatility-note')
            };
          });
          assert.ok(m.secondary, 'protocol CTA rendered');
          assert.ok(m.primary.bottom <= m.ih && m.secondary.bottom <= m.ih, `both buttons inside the first viewport (primary ${Math.round(m.primary.bottom)}, secondary ${Math.round(m.secondary.bottom)}, viewport ${m.ih})`);
          assert.ok(m.primary.top >= 0 && m.secondary.top >= 0, 'buttons not above the viewport');
          assert.ok(Math.abs(m.primary.top - m.secondary.top) <= 2, `buttons on one row (tops ${Math.round(m.primary.top)} vs ${Math.round(m.secondary.top)})`);
          assert.ok(m.primary.right <= m.secondary.left, 'Spend yield is left of the protocol CTA');
          assert.ok(m.secondary.right <= m.iw && m.sw <= m.iw, 'no horizontal overflow');
          if (m.qualifier) assert.ok(m.qualifier.bottom <= m.primary.top, 'honesty qualifier reads before the actions');
          if (fixture.pool.endsWith('3')) assert.ok(m.volatility, 'volatile fixture renders the rate-volatility note');
          if (errors.length) throw new Error(errors.join('\n'));
          passed++;
          console.log('  ✓ ' + name);
        } catch (err) {
          failed++;
          console.error('  ✗ ' + name + '\n    ' + err.message);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' passed, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
}

main().catch((err) => { console.error('pool hero actions test failed: ' + err.message); process.exitCode = 1; });
