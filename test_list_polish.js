/* Playwright behavior gate for spec 095: list-view SOTA table polish. Drives the
   REAL rendered UI (http-server + chromium) and asserts on the rendered DOM via
   computed styles — never on source strings — per the 2026-07-11 standing decision.

   Verifies (list view, /?token=USDC):
   A. .pools-list .pool-apy-section computed align-items === 'flex-end'.
   B. .pools-list .pool-tvl-section computed align-items === 'flex-end'.
   C. .pool-apy-hero + .tvl-value computed font-variant-numeric includes tabular-nums.
   D. every .pools-list .pool-card offsetHeight >= 84.
   E. the 0-yield row (apy-section carrying .pool-apy-tag) has its .pool-apy-hero
      color === resolved var(--color-text-secondary), and the number still shows a '0'.
   F. regression guard: Grid View click → .pool-card parent becomes .pools-grid.

   Fixture-routed, sandbox-safe: clones test_list_default.js's server + routeFixtures
   + stale-snapshot stub verbatim. Fixture includes a 0-yield USDC pool so the list
   shows a "No supply yield" row alongside yielding rows.

   Run: node test_list_polish.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8795;
const ROOT = __dirname;
const SCRATCH = '/tmp/claude-0/-home-user-defi-garden/f3b411fb-6502-5242-98d4-1cc4500d77dc/scratchpad';
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// DefiLlama-shaped fixture (mirrors test_list_default.js): sized above
// DEFAULT_MIN_TVL ($100K as of spec 173, was $10M) so trust-rail filtering never hides them. Includes a
// 0-yield USDC pool so the ?token=USDC list renders a "No supply yield" row.
function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
const FIXTURE_POOLS = [
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9),
  makePool('usdc-arb-aave', 'aave-v3', 'USDC', 'Arbitrum', 70_000_000, 4.8),
  makePool('usdc-base-collateral', 'some-lend', 'USDC', 'Base', 45_000_000, 0) // 0-yield → "No supply yield" tag
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
        let body = data;
        // home.html ships style.min.css as <link media="print" onload="this.media='all'">
        // (non-render-blocking async-CSS, backlog 053). In production the onload swap
        // to media="all" fires early — before the async pool data fetch resolves and
        // React renders the cards — so the sheet (incl. the 095 :has() rule) is active
        // when a card is created. Serve that post-onload state here so computed-style
        // assertions see the real applied CSS; the print/onload swap timing itself is
        // not what 095 is testing.
        if (path.extname(filePath) === '.html') {
          body = Buffer.from(data.toString('utf8')
            .replace('media="print" onload="this.media=\'all\'"', 'media="all"'));
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(body);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function routeFixtures(page) {
  const nodeModules = path.join(ROOT, 'node_modules');
  // style.css @imports a fontshare stylesheet (line 1). With the sheet served as
  // media="all" that @import is render-blocking, and fontshare is unreachable in
  // the sandbox — route it to empty CSS so `load` fires (fonts are irrelevant here).
  await page.route('https://api.fontshare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
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
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

// The server serves style.min.css as media="all" (its post-onload state), so the
// sheet applies from first paint. Its custom props (--color-*) only resolve once
// the neuro theme tokens are in — wait for that before reading computed styles.
async function ensureCssApplied(page) {
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() !== '',
    { timeout: 10000 }
  );
}

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(SCRATCH, name), fullPage: false });
    console.log('    screenshot: ' + path.join(SCRATCH, name));
  } catch (err) {
    console.log('    screenshot FAILED (' + name + '): ' + err.message);
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

    await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    await ensureCssApplied(page);

    await test('A. .pools-list .pool-apy-section computed align-items === flex-end', async () => {
      const v = await page.evaluate(() =>
        getComputedStyle(document.querySelector('.pools-list .pool-apy-section')).alignItems);
      if (v !== 'flex-end') throw new Error(`expected align-items flex-end, got "${v}"`);
    });

    await test('B. .pools-list .pool-tvl-section computed align-items === flex-end', async () => {
      const v = await page.evaluate(() =>
        getComputedStyle(document.querySelector('.pools-list .pool-tvl-section')).alignItems);
      if (v !== 'flex-end') throw new Error(`expected align-items flex-end, got "${v}"`);
    });

    await test('C. APY hero + TVL value computed font-variant-numeric includes tabular-nums', async () => {
      const r = await page.evaluate(() => ({
        hero: getComputedStyle(document.querySelector('.pools-list .pool-apy-hero')).fontVariantNumeric,
        tvl: getComputedStyle(document.querySelector('.pools-list .tvl-value')).fontVariantNumeric
      }));
      if (!/tabular-nums/.test(r.hero)) throw new Error(`apy-hero font-variant-numeric "${r.hero}" lacks tabular-nums`);
      if (!/tabular-nums/.test(r.tvl)) throw new Error(`tvl-value font-variant-numeric "${r.tvl}" lacks tabular-nums`);
    });

    await test('D. every .pools-list .pool-card offsetHeight >= 84', async () => {
      const heights = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.pools-list .pool-card')).map((c) => c.offsetHeight));
      if (!heights.length) throw new Error('no list cards found');
      const short = heights.filter((h) => h < 84);
      if (short.length) throw new Error(`row(s) shorter than 84px: ${JSON.stringify(heights)}`);
    });

    await test('E. 0-yield row hero is calmer (opacity 0.75 + secondary color) with number preserved', async () => {
      const r = await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('.pools-list .pool-apy-section'));
        const zeroSection = sections.find((s) => s.querySelector('.pool-apy-tag'));
        if (!zeroSection) return { missing: true };
        const hero = zeroSection.querySelector('.pool-apy-hero');
        // Resolve the CSS variable rgb-to-rgb via a throwaway element, the same
        // way the rule renders it (so the compare is theme-independent).
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-text-secondary)';
        document.body.appendChild(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        const cs = getComputedStyle(hero);
        return { opacity: cs.opacity, heroColor: cs.color, expected, text: hero.textContent };
      });
      if (r.missing) throw new Error('no 0-yield row (.pool-apy-section with .pool-apy-tag) found');
      // Primary check: opacity is a literal (0.75), independent of var resolution.
      if (r.opacity !== '0.75') throw new Error(`0-yield hero opacity "${r.opacity}" !== "0.75" (calm-0 rule not applied)`);
      if (r.heroColor !== r.expected) throw new Error(`hero color "${r.heroColor}" !== --color-text-secondary "${r.expected}"`);
      // Trust rail: the number is never blanked, only calmed.
      if (!/0/.test(r.text)) throw new Error(`0-yield hero text "${r.text}" has no '0' digit (number blanked)`);
    });

    await shot(page, '095-1280.png');

    await test('F. regression guard: Grid View → .pool-card parent becomes pools-grid', async () => {
      await page.locator('.view-toggle-btn[title="Grid View"]').click();
      await page.waitForFunction(
        () => { const c = document.querySelector('.pool-card'); return c && c.parentElement.className === 'pools-grid'; },
        { timeout: 5000 }
      ).catch(() => {});
      const cls = await page.evaluate(() => document.querySelector('.pool-card').parentElement.className);
      if (cls !== 'pools-grid') throw new Error(`after Grid View click, expected "pools-grid", got "${cls}"`);
      // Back to list view for remaining screenshots.
      await page.locator('.view-toggle-btn[title="List View"]').click();
      await page.waitForFunction(
        () => { const c = document.querySelector('.pool-card'); return c && c.parentElement.className === 'pools-list'; },
        { timeout: 5000 }
      ).catch(() => {});
    });

    // Responsive + dark screenshots for operator visual review.
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.waitForTimeout(300);
    await shot(page, '095-768.png');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(300);
    await shot(page, '095-360.png');

    // Dark mode at 1280 (localStorage theme + data-theme attr).
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.reload({ waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    await ensureCssApplied(page);
    await page.waitForTimeout(300);
    await shot(page, '095-1280-dark.png');

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`✓ ${passed}/${total} list-polish assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_list_polish crashed: ' + err.message);
  process.exitCode = 1;
});
