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

const LANDING_POOLS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'landing-pools.json'), 'utf8')).pools;
const USDY_ID = 'ac61ee82-2fe4-4f9b-a9cd-7fb33f598859';
const STETH_ID = '747c1d2a-c668-4682-b9f9-296708a3dd90';
const CHART_FAILING_ID = 'd8c4eff5-c8a9-46fc-a888-057c4c668e72'; // SUSDS
const CHART_FIXTURE = {
  [USDY_ID]: { apy: 3.71, tvlUsd: 1_250_000_000 },
  [STETH_ID]: { apy: 5000, tvlUsd: 26_000_000_000 }
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
    await page.waitForSelector('#landing-root .landing-hero-underwriting', { timeout: 10000 });
    assert.strictEqual(await page.locator('#landing-root .landing-app').getAttribute('data-mode'), 'landing');
    assert.strictEqual(await page.locator('#planner-root .gp-app').count(), 0, 'bare / must not mount the planner above the landing');
    assert.ok((await page.locator('#landing-uw-title').innerText()).includes('predictively underwritten'), 'hero headline');
    assert.strictEqual(await page.locator('.landing-hero-spotlight, [data-testid="landing-virtual-card"], .landing-page-dots, .landing-page-dot').count(), 0, 'card panel and page dots are gone');
    assert.strictEqual(await page.locator('h1').count(), 1, 'exactly one h1 on the landing');
    const landingLeafMarks = page.locator('#landing-root .landing-leaf-mark');
    assert.strictEqual(await landingLeafMarks.count(), 1);
    const landingFooterText = await page.locator('#landing-root .app-footer').innerText();
    assert.ok(landingFooterText.includes('DefiLlama API') && landingFooterText.includes('Browse tokens'), 'landing footer should match the analytics footer');
    passed++;
    console.log('  ✓ bare / renders the single underwriting landing with visible footer');

    // SEO/rates content stays crawlable, below the hero, above the footer.
    const heroBox = await page.locator('.landing-hero-underwriting').boundingBox();
    const seoBox = await page.locator('#seo-content').boundingBox();
    const footerBox = await page.locator('#landing-root .app-footer').boundingBox();
    assert.ok(seoBox && seoBox.height > 0, '#seo-content is visible');
    assert.ok(seoBox.y >= heroBox.y + heroBox.height - 1, '#seo-content sits below the hero');
    assert.ok(footerBox.y >= seoBox.y + seoBox.height - 1, 'footer sits after #seo-content');
    assert.strictEqual(await page.locator('#seo-content h2#seo-h1').count(), 1, 'seo title demoted to h2');
    passed++;
    console.log('  ✓ SEO content is a section below the hero, footer after it');

    // Live numbers: USDY APY + TVL from the chart fixture, score from landing-pools.json.
    const usdy = LANDING_POOLS.find((p) => p.pool === USDY_ID);
    await page.waitForFunction(() => /3\.71%/.test((document.querySelector('.landing-uw-yield-val') || {}).textContent || ''), null, { timeout: 10000 });
    const card = page.locator('.landing-uw-terminal-card');
    const cardText = await card.innerText();
    assert.ok(cardText.includes('$1.25B'), 'live TVL rendered: ' + cardText);
    assert.ok(cardText.includes(usdy.defiScore.score.toFixed(1)) && cardText.includes(usdy.defiScore.rating), 'baked score rendered');
    assert.strictEqual(await card.locator('[data-testid="landing-uw-source"]').getAttribute('data-source'), 'live');
    assert.strictEqual(await card.locator('.landing-uw-terminal-jump').getAttribute('href'), '/?pool=' + USDY_ID);
    passed++;
    console.log('  ✓ hero card shows live APY/TVL and the baked DeFi Score');

    // Trust rails: anomalous live APY never renders; failed live fetch falls back to the labelled snapshot.
    await page.waitForFunction(() => document.querySelectorAll('.landing-uw-pool-tab').length === 3, null, { timeout: 10000 });
    const tabs = await page.locator('.landing-uw-pool-tab').allInnerTexts();
    assert.ok(!tabs.some((t) => /STETH/i.test(t)), 'anomalous STETH tab must be hidden: ' + tabs.join(','));
    await page.locator('.landing-uw-pool-tab', { hasText: 'SUSDS' }).click();
    const susds = LANDING_POOLS.find((p) => p.pool === CHART_FAILING_ID);
    assert.strictEqual(await card.locator('[data-testid="landing-uw-source"]').getAttribute('data-source'), 'snapshot');
    assert.ok((await page.locator('.landing-uw-yield-val').innerText()).includes(susds.apy.toFixed(2) + '%'), 'snapshot APY fallback');
    passed++;
    console.log('  ✓ anomalous pools are hidden and failed live fetches fall back to the labelled snapshot');

    // Two full-screen snap sections on desktop; one click moves hero -> rates.
    const snap = await page.evaluate(() => ({
      type: getComputedStyle(document.documentElement).scrollSnapType,
      hero: getComputedStyle(document.querySelector('.landing-underwriting-wrapper')).scrollSnapAlign,
      seo: getComputedStyle(document.getElementById('seo-content')).scrollSnapAlign
    }));
    assert.ok(/y mandatory/.test(snap.type), 'desktop snaps vertically: ' + snap.type);
    assert.strictEqual(snap.hero, 'start');
    assert.strictEqual(snap.seo, 'start');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('[data-testid="landing-next-section"]').click();
    await page.waitForFunction(() => {
      const top = document.getElementById('seo-content').getBoundingClientRect().top;
      const header = document.querySelector('.landing-header').getBoundingClientRect().bottom;
      return Math.abs(top - header) <= 24;
    }, null, { timeout: 5000 });
    passed++;
    console.log('  ✓ desktop: hero and rates are snap sections; the next-section button moves to rates');

    // Mobile: the whole underwriting card is in the first screen, right after the headline.
    for (const [w, h] of [[360, 780], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      const m = await page.evaluate(() => {
        const card = document.querySelector('.landing-uw-terminal-card').getBoundingClientRect();
        const title = document.getElementById('landing-uw-title').getBoundingClientRect();
        const cta = document.querySelector('[data-testid="landing-underwriting-cta"]').getBoundingClientRect();
        return { cardTop: card.top, cardBottom: card.bottom, titleBottom: title.bottom, ctaTop: cta.top, ih: innerHeight };
      });
      assert.ok(m.cardBottom <= m.ih, w + 'x' + h + ': card fully in first viewport (bottom ' + Math.round(m.cardBottom) + ' > ' + m.ih + ')');
      assert.ok(m.cardTop >= m.titleBottom && m.ctaTop >= m.cardBottom, w + 'px: order is headline -> card -> CTA');
    }
    const status = await page.locator('.landing-uw-status').innerText();
    assert.ok(/Scored .+ · live DefiLlama rates/.test(status), 'data-backed status line: ' + status);
    assert.strictEqual(await page.locator('.landing-uw-eyebrow').count(), 0, 'eyebrow chip replaced');
    passed++;
    console.log('  ✓ mobile: status line, headline, then the full card inside the first viewport');

    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(150);
    assert.ok(!/mandatory/.test(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)), 'mobile does not snap');
    await page.setViewportSize({ width: 1280, height: 800 });
    passed++;
    console.log('  ✓ mobile: plain vertical scroll, no snapping');

    // Single vertical page: no horizontal overflow, wheel scrolls the document (no panel transform).
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
      assert.ok(m.sw <= m.cw, width + 'px: no horizontal overflow (' + m.sw + ' > ' + m.cw + ')');
      assert.ok(m.sh > m.ih, width + 'px: page scrolls vertically to reach the SEO section');
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => window.scrollY > 0), 'wheel scrolls the page vertically');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.landing-main')).transform), 'none');
    passed++;
    console.log('  ✓ one vertical page at 360/768/1280 with native scrolling');

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
      const el = document.querySelector('.landing-uw-status');
      return el && el.textContent.includes('실시간');
    }, { timeout: 5000 });
    assert.ok((await page.locator('.landing-uw-terminal-card').innerText()).includes('건전성'), 'Expected Korean card labels');
    passed++;
    console.log('  ✓ language toggle switches landing page to Korean');

    // Switch back to EN
    await langBtn.click();
    await page.waitForFunction(() => {
      const el = document.querySelector('.landing-uw-status');
      return el && el.textContent.includes('live DefiLlama rates');
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
