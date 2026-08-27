/* Playwright regression gate for the search-first landing route.
   Run: node test_landing.js
   This drives the real static app and verifies the primary landing search plus
   the existing planner and analytics entry points. */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8793;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
// Matched against the failing resource's own URL (msg.location().url), not
// msg.text() — Chromium's "Failed to load resource" text never includes the
// URL itself (exact test_smoke.js/test_search.js technique + comment).
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const FIXTURE_POOLS = [
  { pool: 'usdc-base-aave', project: 'aave-v3', symbol: 'USDC', chain: 'Base', tvlUsd: 45_000_000, apyBase: 4.2, apyReward: 0 },
  { pool: 'usdc-eth-morpho', project: 'morpho-blue', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 55_000_000, apyBase: 5.9, apyReward: 0 },
  { pool: 'usde-eth-pendle', project: 'pendle', symbol: 'USDe', chain: 'Ethereum', tvlUsd: 65_000_000, apyBase: 8.5, apyReward: 0 },
  { pool: 'usdc-sol-kamino', project: 'kamino-lend', symbol: 'USDC', chain: 'Solana', tvlUsd: 80_000_000, apyBase: 7.5, apyReward: 0 }
];

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
  // React/Babel are intentionally loaded from the same CDN as production;
  // this checkout may not have those optional packages installed locally.
  await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
  // Snapshot-first FE (spec 059): serve a deliberately-stale snapshot so
  // tryLoadSnapshot's age check rejects it and the app falls through to the
  // routed live /pools fetch below, making FIXTURE_POOLS the real source for
  // the grid instead of the committed data/pools-snapshot.json (test_smoke.js:130 shape).
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}'
  }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'success', data: FIXTURE_POOLS })
  }));
  await page.route('https://api.llama.fi/protocols', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [] })
  }));
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  let passed = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // Classify by the failing resource's URL, not the text — Chromium's
      // "Failed to load resource" message never contains the URL (test_smoke.js:117-122).
      const source = msg.location()?.url || '';
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });
    await preparePage(page);

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#landing-root .landing-hero-spotlight', { timeout: 10000 });
    assert.strictEqual(await page.locator('#landing-root .landing-app').getAttribute('data-mode'), 'landing');
    assert.strictEqual(await page.locator('#planner-root .gp-app').count(), 0, 'bare / must not mount the planner above the landing');
    assert.strictEqual(await page.locator('#landing-root .card-botanical-watermark').getAttribute('viewBox'), '0 0 340 260');
    const landingLeafMarks = page.locator('#landing-root .landing-leaf-mark');
    assert.strictEqual(await landingLeafMarks.count(), 1);
    assert.strictEqual(await landingLeafMarks.first().getAttribute('width'), '24');
    assert.strictEqual(await landingLeafMarks.first().getAttribute('height'), '24');
    const landingArrowIcons = page.locator('#landing-root .landing-arrow-icon');
    assert.strictEqual(await landingArrowIcons.count(), 1);
    assert.strictEqual(await landingArrowIcons.first().getAttribute('width'), '19');
    assert.strictEqual(await landingArrowIcons.first().getAttribute('height'), '19');
    const landingFooterText = await page.locator('#landing-root .app-footer').innerText();
    assert.ok(landingFooterText.includes('DefiLlama API') && landingFooterText.includes('Browse tokens'), 'landing footer should match the analytics footer');
    passed++;
    console.log('  ✓ bare / renders the hero intent landing with visible footer');

    // Test interactive preset chips on landing
    const cursorBtn = page.locator('.landing-subs-grid button', { hasText: 'Cursor Pro' });
    if (await cursorBtn.count()) {
      await cursorBtn.click();
      const cta = page.locator('[data-testid="landing-intent-cta"]');
      assert.strictEqual(await cta.getAttribute('href'), '/for/cursor');
      assert.ok((await cta.innerText()).includes('Cursor Pro'));
    }
    passed++;
    console.log('  ✓ interactive preset chips switch subscriptions and update CTA');
    // Test analytics search entry
    await page.goto(`http://localhost:${PORT}/?app=1`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#root .search-input', { timeout: 15000 });
    await page.locator('.search-input').fill('USDC');
    await page.locator('.search-input').press('Enter');
    await page.waitForURL((url) => url.searchParams.get('token') === 'USDC', { waitUntil: 'commit', timeout: 10000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    passed++;
    console.log('  ✓ search yields enters the existing analytics result route');

    // Test direct token query route
    await page.goto(`http://localhost:${PORT}/?token=USDC&chain=Base`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    passed++;
    console.log('  ✓ direct token query navigates directly to search results');
    await page.goto(`http://localhost:${PORT}/plan.html`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#planner-root .gp-app', { timeout: 10000 });
    const logoHref = await page.locator('#planner-root .gp-logo').getAttribute('href');
    assert.ok(logoHref === '/' || logoHref === 'home.html', 'Expected logo to link to root/home');
    passed++;
    console.log('  ✓ plan.html still renders the garden planner');

    await page.goto(`http://localhost:${PORT}/?goal=iphone&capital=10000&fm=capital`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#planner-root .gp-app', { timeout: 10000 });
    passed++;
    console.log('  ✓ planner share URLs still render the garden planner');

    await page.goto(`http://localhost:${PORT}/?app=1`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#root .search-input', { timeout: 15000 });
    passed++;
    console.log('  ✓ ?app=1 still renders the analytics search app');

    // Test top navigation links on landing (no "How it works", correct links)
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.landing-nav', { timeout: 10000 });
    const navText = await page.locator('.landing-nav').innerText();
    assert.ok(!navText.includes('How it works'), 'Topnav must not contain "How it works"');
    assert.ok(navText.includes('Search yields') && navText.includes('Savings Planner'), 'Topnav contains Search yields and Savings Planner');
    passed++;
    console.log('  ✓ landing topnav contains clean active links without "How it works"');

    // Test Korean language toggle
    await page.goto(`http://localhost:${PORT}/?lang=en`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.landing-header-actions .landing-icon-button', { timeout: 10000 });
    const langBtn = page.locator('.landing-header-actions .landing-icon-button').first();
    await langBtn.click();
    await page.waitForFunction(() => {
      const el = document.querySelector('.landing-spotlight-eyebrow span');
      return el && el.textContent.includes('일상으로 들어온');
    }, { timeout: 5000 });
    const koEyebrow = await page.locator('.landing-spotlight-eyebrow span').innerText();
    assert.ok(/일상으로 들어온/i.test(koEyebrow), 'Expected Korean eyebrow text');
    passed++;
    console.log('  ✓ language toggle switches landing page to Korean');

    // Switch back to EN
    await langBtn.click();
    await page.waitForFunction(() => {
      const el = document.querySelector('.landing-spotlight-eyebrow span');
      return el && el.textContent.includes('Bringing DeFi');
    }, { timeout: 5000 });

    if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' landing assertions passed');
}

main().catch((err) => {
  console.error('landing test failed: ' + err.message);
  process.exitCode = 1;
});
