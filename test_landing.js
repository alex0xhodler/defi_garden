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

const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'landing-pools.json'), 'utf8'));
const LANDING_POOLS = BOARD.pools;
const TRACK = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'track-record.json'), 'utf8'));
const LIVE_POOL = LANDING_POOLS[0];
const CHART_FAILING_ID = LANDING_POOLS[1].pool;     // live fetch fails -> labelled snapshot
const ANOMALOUS_ID = LANDING_POOLS[2].pool;         // live APY past the sanity rail -> never shown
const CHART_FIXTURE = {
  [LIVE_POOL.pool]: { apy: 3.71, tvlUsd: 1_250_000_000 },
  [ANOMALOUS_ID]: { apy: 5000, tvlUsd: 26_000_000_000 }
};

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
  // Landing hero: live APY/TVL per curated pool from DefiLlama's per-pool chart
  // endpoint. USDY is healthy, SUSDS fails (-> snapshot fallback), STETH is
  // anomalous (APY above the sanity rail -> must never render).
  await page.route('https://yields.llama.fi/chart/**', (route) => {
    const id = route.request().url().split('/').pop();
    if (id === CHART_FAILING_ID) return route.fulfill({ status: 500, body: 'boom' });
    const point = CHART_FIXTURE[id] || { apy: 4, tvlUsd: 500_000_000 };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: [{ timestamp: '2026-09-26T00:00:00.000Z', apy: 1, tvlUsd: 1 }, Object.assign({ timestamp: '2026-09-27T00:00:00.000Z' }, point)] })
    });
  });
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
      // The chart 500 for CHART_FAILING_ID is the deliberate snapshot-fallback fixture.
      if (source.endsWith('/chart/' + CHART_FAILING_ID)) return;
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });
    await preparePage(page);

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#landing-root [data-testid="landing-row"]', { timeout: 10000 });
    assert.strictEqual(await page.locator('#landing-root .landing-app').getAttribute('data-mode'), 'landing');
    assert.strictEqual(await page.locator('#planner-root .gp-app').count(), 0, 'bare / must not mount the planner above the landing');
    assert.strictEqual(await page.locator('h1').count(), 1, 'exactly one h1');
    assert.ok((await page.locator('#landing-uw-title').innerText()).includes('instruments'), 'instrument headline');
    assert.strictEqual(await page.locator('.landing-theme-button, .landing-next-section, .landing-hero-spotlight').count(), 0, 'dark-only, no old landing chrome');
    const landingFooterText = await page.locator('#landing-root .app-footer').innerText();
    assert.ok(landingFooterText.includes('DefiLlama API') && landingFooterText.includes('Browse tokens'), 'landing footer should match the analytics footer');
    passed++;
    console.log('  ✓ bare / renders the instrument-panel landing with visible footer');

    // Leaderboard: ranked by score from the committed file; trust rails re-applied to live values.
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="landing-row"]').length === n, LANDING_POOLS.length - 1, { timeout: 10000 });
    const rowTexts = await page.locator('[data-testid="landing-row"]').allInnerTexts();
    assert.ok(rowTexts[0].includes(LIVE_POOL.symbol) && rowTexts[0].includes('3.71%'), 'rank 1 shows its live APY: ' + rowTexts[0]);
    assert.ok(!rowTexts.some((t) => t.startsWith('03')), 'anomalous rank 3 is removed by the sanity rail');
    passed++;
    console.log('  ✓ ranked leaderboard renders with live top rows; anomalous live APY is removed');

    // Desktop instrument panel reads the selected pool from real numbers.
    const panel = page.locator('[data-testid="landing-underwriting-card"]');
    await panel.waitFor({ timeout: 5000 });
    assert.strictEqual(await panel.locator('.ip-panel-title').innerText(), LIVE_POOL.symbol);
    const labels = await panel.locator('[role="img"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    assert.strictEqual(labels.length, 6, 'six instruments with text equivalents');
    assert.ok(labels[0].includes(LIVE_POOL.defiScore.score.toFixed(1)) && labels[0].includes(LIVE_POOL.defiScore.rating), 'score dial: ' + labels[0]);
    assert.ok(labels[1].includes('3.71%'), 'APY dial reads the live value: ' + labels[1]);
    assert.ok(labels[2].includes(LIVE_POOL.forecast.p50.toFixed(2) + '%'), 'forecast dial: ' + labels[2]);
    assert.ok(labels[3].includes('$1.25B'), 'depth dial reads live TVL: ' + labels[3]);
    assert.strictEqual(await panel.locator('[data-testid="landing-uw-source"]').getAttribute('data-source'), 'live');
    assert.strictEqual(await panel.locator('[data-testid="landing-open-pool"]').getAttribute('href'), '/?pool=' + LIVE_POOL.pool);
    const needleBefore = await panel.locator('.ip-needle').first().getAttribute('style');
    await page.locator('[data-testid="landing-row"]').nth(1).click();
    await page.waitForFunction((sym) => document.querySelector('.ip-panel-title').textContent === sym, LANDING_POOLS[1].symbol);
    assert.strictEqual(await panel.locator('[data-testid="landing-uw-source"]').getAttribute('data-source'), 'snapshot', 'failed live fetch is labelled');
    assert.strictEqual(await panel.locator('[data-testid="landing-open-pool"]').getAttribute('href'), '/?pool=' + CHART_FAILING_ID);
    if (LANDING_POOLS[1].defiScore.score !== LIVE_POOL.defiScore.score) {
      assert.notStrictEqual(await panel.locator('.ip-needle').first().getAttribute('style'), needleBefore, 'needle moves with the reading');
    }
    passed++;
    console.log('  ✓ panel reads the selected pool on six instruments; selecting a row swings the needles');

    // Category tabs filter by asset class.
    const ethCount = LANDING_POOLS.filter((p) => p.category === 'eth' && p.pool !== ANOMALOUS_ID).length;
    if (ethCount) {
      await page.locator('.ip-tab', { hasText: 'ETH' }).click();
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid="landing-row"]').length === n, ethCount);
      await page.locator('.ip-tab', { hasText: 'All' }).click();
    }
    passed++;
    console.log('  ✓ category tabs filter the leaderboard');

    // Track record: published numbers, including the honest baseline comparison.
    const log = page.locator('[data-testid="landing-track-record"]');
    await log.waitFor({ timeout: 5000 });
    const logText = await log.innerText();
    if (TRACK.matured.n) {
      const pct = (Math.round(TRACK.matured.coverage * 1000) / 10).toFixed(1) + '%';
      assert.ok(logText.includes(pct), 'coverage shown: ' + pct);
      assert.ok(logText.includes(TRACK.matured.medianAbsErrorForecast.toFixed(3)) && logText.includes(TRACK.matured.medianAbsErrorNaive.toFixed(3)), 'forecast error shown next to the naive baseline');
      if (TRACK.matured.medianAbsErrorForecast >= TRACK.matured.medianAbsErrorNaive) assert.ok(/no better/.test(logText), 'no-edge result is stated plainly');
    } else {
      assert.ok(/first ones mature/.test(logText), 'waiting state names the maturity date');
    }
    const agents = await page.locator('[data-testid="landing-agents"]').innerText();
    assert.ok(agents.includes('https://www.defi.garden/api/mcp'), 'real MCP endpoint');
    assert.strictEqual(await page.locator('[data-testid="landing-agents"] a[href="/data/landing-pools.json"]').count(), 1);
    assert.strictEqual(await page.locator('#seo-content h2#seo-h1').count(), 1, 'crawlable SEO section stays, as an h2');
    passed++;
    console.log('  ✓ track record, agent access and the SEO section render below the panel');

    // Mobile: the list is the page; a tapped row opens its panel in place.
    for (const [w, h] of [[390, 844], [360, 740]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      assert.strictEqual(await page.locator('[data-testid="landing-underwriting-card"]').count(), 0, w + 'px: no panel until a row is tapped');
      const inView = await page.evaluate(() => [...document.querySelectorAll('[data-testid="landing-row"]')].filter((r) => r.getBoundingClientRect().bottom <= innerHeight).length);
      assert.ok(inView >= 5, w + 'px: at least 5 rows in the first viewport (' + inView + ')');
    }
    await page.locator('[data-testid="landing-row"]').first().click();
    await page.locator('.ip-row-panel [data-testid="landing-open-pool"]').waitFor({ timeout: 5000 });
    assert.strictEqual(await page.locator('[data-testid="landing-row"]').first().getAttribute('aria-expanded'), 'true');
    passed++;
    console.log('  ✓ mobile: 5+ ranked rows in the first viewport; a tapped row opens its instruments in place');

    for (const width of [360, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      assert.ok(m.sw <= m.cw, width + 'px: no horizontal overflow (' + m.sw + ' > ' + m.cw + ')');
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    passed++;
    console.log('  ✓ no horizontal overflow at 360/768/1280/1440');

    // Review fixes: rows are distinguishable, the list is legible, the page ends at the footer.
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('[data-testid="landing-row"]', { timeout: 10000 });
    const rowCount = await page.locator('[data-testid="landing-row"]').count();
    assert.strictEqual(await page.locator('[data-testid="landing-row"] .ip-chain').count(), rowCount, 'every row carries its chain as its own tag');
    assert.ok((await page.locator('.ip-cols').textContent()).includes('APY now'), 'column legend above the rows');
    const ends = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight, footerBottom: Math.round(document.querySelector('#landing-root .app-footer').getBoundingClientRect().bottom + window.scrollY) }));
    assert.ok(Math.abs(ends.docH - ends.footerBottom) <= 2, 'page ends at the footer (docH ' + ends.docH + ', footer ' + ends.footerBottom + ')');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('[data-testid="landing-row"]').count(), 10, 'mobile shows the top 10 first');
    await page.locator('.ip-show-all').click();
    assert.strictEqual(await page.locator('[data-testid="landing-row"]').count(), rowCount, 'show all reveals the full leaderboard');
    await page.setViewportSize({ width: 1280, height: 800 });
    passed++;
    console.log('  ✓ chain tags, column legend, no page void, mobile top-10 with show all');

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
    assert.strictEqual(await page.locator('.landing-nav a[data-testid="landing-nav-card"]').getAttribute('href'), '/for/claude');
    assert.strictEqual(await page.locator('.landing-mobile-nav a[data-testid="landing-nav-card"]').count(), 1, 'card link also in the mobile menu');
    passed++;
    console.log('  ✓ landing topnav contains clean active links without "How it works"');

    // Test Korean language toggle
    await page.goto(`http://localhost:${PORT}/?lang=en`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.landing-header-actions .landing-icon-button', { timeout: 10000 });
    const langBtn = page.locator('.landing-header-actions .landing-icon-button').first();
    await langBtn.click();
    await page.waitForFunction(() => {
      const el = document.getElementById('landing-uw-title');
      return el && el.textContent.includes('계기판');
    }, { timeout: 5000 });
    assert.ok((await page.locator('.ip-list-title').textContent()).includes('DeFi 점수'), 'Expected Korean list labels');
    passed++;
    console.log('  ✓ language toggle switches landing page to Korean');

    // Switch back to EN
    await langBtn.click();
    await page.waitForFunction(() => {
      const el = document.getElementById('landing-uw-title');
      return el && el.textContent.includes('instruments');
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
