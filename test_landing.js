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
  { pool: 'usde-eth-pendle', project: 'pendle', symbol: 'USDe', chain: 'Ethereum', tvlUsd: 65_000_000, apyBase: 8.5, apyReward: 0 }
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
    await page.waitForSelector('#landing-root .landing-search-input', { timeout: 10000 });
    assert.strictEqual(await page.locator('#landing-root .landing-app').getAttribute('data-mode'), 'landing');
    assert.strictEqual(await page.locator('#planner-root .gp-app').count(), 0, 'bare / must not mount the planner above the landing');
    assert.strictEqual(await page.locator('#landing-root .landing-plant-svg').getAttribute('width'), '340');
    assert.strictEqual(await page.locator('#landing-root .landing-plant-svg').getAttribute('height'), '260');
    const landingLeafMarks = page.locator('#landing-root .landing-leaf-mark');
    assert.strictEqual(await landingLeafMarks.count(), 2);
    assert.strictEqual(await landingLeafMarks.first().getAttribute('width'), '24');
    assert.strictEqual(await landingLeafMarks.first().getAttribute('height'), '24');
    assert.strictEqual(await page.locator('#landing-root .landing-icon').getAttribute('width'), '23');
    assert.strictEqual(await page.locator('#landing-root .landing-icon').getAttribute('height'), '23');
    const landingArrowIcons = page.locator('#landing-root .landing-arrow-icon');
    assert.strictEqual(await landingArrowIcons.count(), 2);
    assert.strictEqual(await landingArrowIcons.first().getAttribute('width'), '19');
    assert.strictEqual(await landingArrowIcons.first().getAttribute('height'), '19');
    const landingFooterText = await page.locator('#landing-root .app-footer').innerText();
    assert.ok(landingFooterText.includes('DefiLlama API') && landingFooterText.includes('Browse tokens'), 'landing footer should match the analytics footer');
    passed++;
    console.log('  ✓ bare / renders the search-first landing');

    await page.locator('[data-testid="landing-search"]').fill('USDC');
    await page.locator('[data-testid="landing-search"]').press('Enter');
    // waitUntil defaults to 'load'; the analytics route's decorative icon
    // requests never settle in this sandbox (proxy-blocked, see IGNORABLE_ERROR_PATTERN
    // above) so 'load' never fires even though the navigation itself is
    // already complete. Wait on the URL only, exactly as the app's own
    // history-push resolves it — the .pool-card assertion right below is
    // still what actually proves the handoff rendered.
    await page.waitForURL((url) => url.searchParams.get('token') === 'USDC', { waitUntil: 'commit', timeout: 10000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    passed++;
    console.log('  ✓ landing search enters the existing analytics result route');

    // Test direct tap on example chips: "USDC on Base"
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#landing-root .landing-example-chip', { timeout: 10000 });
    await page.locator('#landing-root .landing-example-chip', { hasText: 'USDC on Base' }).click();
    await page.waitForURL((url) => url.searchParams.get('token') === 'USDC' && url.searchParams.get('chain') === 'Base', { waitUntil: 'commit', timeout: 10000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    passed++;
    console.log('  ✓ tapping USDC on Base example chip navigates directly to search results');

    // Test direct tap on example chips: "Pendle PTs"
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#landing-root .landing-example-chip', { timeout: 10000 });
    await page.locator('#landing-root .landing-example-chip', { hasText: 'Pendle PTs' }).click();
    await page.waitForURL((url) => url.searchParams.get('protocols') === 'Pendle', { waitUntil: 'commit', timeout: 10000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    passed++;
    console.log('  ✓ tapping Pendle PTs example chip navigates directly to search results');

    // Test direct tap on example chips: "Morpho vaults"
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#landing-root .landing-example-chip', { timeout: 10000 });
    await page.locator('#landing-root .landing-example-chip', { hasText: 'Morpho vaults' }).click();
    await page.waitForURL((url) => url.searchParams.get('protocols') === 'Morpho', { waitUntil: 'commit', timeout: 10000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    passed++;
    console.log('  ✓ tapping Morpho vaults example chip navigates directly to search results');

    await page.goto(`http://localhost:${PORT}/plan.html`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#planner-root .gp-app', { timeout: 10000 });
    assert.strictEqual(await page.locator('#planner-root .gp-logo').getAttribute('href'), 'home.html');
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
