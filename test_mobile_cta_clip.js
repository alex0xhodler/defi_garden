/* Rendered Playwright test for backlog 136 — P0 mobile clip bug.

   The primary "Garden this pool" CTA (.cta-button-primary) and the TOTAL APY
   value (.pool-action-apy .apy-value-hero) live inside .pool-action-card, which
   kept `min-width: 260px` with no mobile override. On pool-detail at 360px the
   action card overflowed the hero card (.pool-hero-card, inline `overflow:hidden`
   + 32px padding) and the CTA + APY value were clipped invisible — the whole
   mobile-width device class could not tap the #1 north-star CTA.

   This test proves, against a REAL render (not source reading), that at 360px
   the CTA and APY value bounding boxes are fully INSIDE the hero card box (an
   element-visibility assert, NOT page scrollWidth — the overflow is clipped
   inside the card, so scrollWidth passes today and misses the class). It also
   guards the 1280px desktop layout for regression.

   Load order matters: navigating to `?pool=` puts home.html in analytics mode,
   whose inline addCSS injects `pool-detail-styles.min.css` (the prod sheet).
   If that min sheet lacked the fix the 360px containment assert fails — which
   is exactly the mutation intent (removing the override reproduces the clip).

   Fixture-routed (unpkg React/Babel vendored, snapshot 404'd to force the live
   path, external hosts aborted/ignored) — the house pattern from
   test_northstar_cta_fires.js. Browser-originated external HTTPS is blocked in
   this sandbox.

   Run: node test_mobile_cta_clip.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8850; // distinct from other test_* files (8791-8819 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — same id used by test_northstar_cta_fires.js. Verified present in
// the snapshot below before the test runs; the fixture stays byte-stable
// regardless of snapshot regeneration cadence.
const POOL = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  project: 'lido', symbol: 'STETH', chain: 'Ethereum',
  tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [POOL] });

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

// The prod sheet (pool-detail-styles.min.css) is injected asynchronously by
// home.html's addCSS (media='print' → onload media='all'). Wait until it has
// actually applied before measuring geometry. Proxy: the base .pool-action-card
// rule sets `display: flex` — a plain <div> is `block` until that sheet applies,
// so `display === 'flex'` is a viewport-independent signal it's live (the neuro
// shadow tokens resolve to `none` in-sandbox, so they can't be used here).
async function waitForCss(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.pool-action-card');
    if (!el) return false;
    return getComputedStyle(el).display === 'flex';
  }, { timeout: 15000 });
}

// Asserts child box is fully inside parent box on the x-axis (left/right),
// with ±1px tolerance for sub-pixel rounding, and that the child is a real
// visible box (positive width).
function assertContainedX(child, parent, label) {
  if (!child) throw new Error(`${label}: element not found / no bounding box`);
  if (!parent) throw new Error(`${label}: ancestor .pool-hero-card has no bounding box`);
  if (!(child.width > 0)) throw new Error(`${label}: expected positive width, got ${child.width}`);
  if (child.x < parent.x - 1) {
    throw new Error(`${label}: clipped on LEFT — child.x ${child.x} < card.x ${parent.x}`);
  }
  if (child.x + child.width > parent.x + parent.width + 1) {
    throw new Error(`${label}: clipped on RIGHT — child right ${child.x + child.width} > card right ${parent.x + parent.width}`);
  }
}

async function assertLayout(page, widthLabel) {
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  await waitForCss(page);

  const card = await page.locator('.pool-hero-card').first().boundingBox();

  const cta = await page.locator('.cta-button-primary').first().boundingBox();
  const ctaVisible = await page.locator('.cta-button-primary').first().isVisible();
  if (!ctaVisible) throw new Error(`${widthLabel}: .cta-button-primary is not visible`);
  assertContainedX(cta, card, `${widthLabel} "Garden this pool" CTA`);

  const apy = await page.locator('.pool-action-apy .apy-value-hero').first().boundingBox();
  const apyVisible = await page.locator('.pool-action-apy .apy-value-hero').first().isVisible();
  if (!apyVisible) throw new Error(`${widthLabel}: TOTAL APY value is not visible`);
  assertContainedX(apy, card, `${widthLabel} TOTAL APY value`);
}

async function main() {
  // Sanity check: the fixture pool id is real, drawn from the committed
  // snapshot — not invented.
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL.pool)) {
    throw new Error(`POOL.pool ${POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
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
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));

    const poolUrl = `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(POOL.pool)}`;

    await test('360px: pool-detail renders with no page errors', async () => {
      await page.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });

    await test('360px: "Garden this pool" CTA + TOTAL APY are visible and fully inside .pool-hero-card', async () => {
      await assertLayout(page, '360px');
    });

    await test('1280px: same containment holds (desktop regression guard)', async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await assertLayout(page, '1280px');
    });

    await test('no unexpected page/console errors', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_mobile_cta_clip.js: ${passed}/4 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
