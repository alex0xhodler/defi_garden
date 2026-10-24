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
const USDY_ID = '43641cf5-a92e-416b-bce9-27113d3c0db6'; // curated USDC (maple); the old USDY entry was dropped as permissioned
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
    assert.ok((await page.locator('#landing-uw-title').innerText()).includes('predictive analytics'), 'hero headline');
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
    await page.waitForSelector('.landing-uw-pool-tab', { timeout: 10000 });
    const card = page.locator('.landing-uw-terminal-card');
    await page.locator('.landing-uw-pool-tab', { hasText: 'USDC' }).click();
    await page.waitForFunction(() => /3\.71%/.test((document.querySelector('.landing-uw-yield-val') || {}).textContent || ''), null, { timeout: 10000 });
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

    // The landing is one plain scrolling page: no scroll snapping, bands in order.
    const flow = await page.evaluate(() => ({
      snap: getComputedStyle(document.documentElement).scrollSnapType,
      order: ['underwriting-section', 'landing-method', 'landing-coverage', 'landing-agents', 'seo-content']
        .map((id) => document.getElementById(id).getBoundingClientRect().top)
    }));
    assert.ok(/none/.test(flow.snap), 'no scroll snapping: ' + flow.snap);
    assert.deepStrictEqual(flow.order.slice().sort((a, b) => a - b), flow.order, 'sections in order');
    assert.strictEqual(await page.locator('[data-testid="landing-next-section"]').count(), 0, 'next-section button removed');
    passed++;
    console.log('  ✓ landing sections flow in order: hero, method, coverage, agents, seo');

    // Hero buy box: one primary (methodology) + one quiet secondary; search is the existing app route.
    assert.strictEqual(await page.locator('[data-testid="landing-methodology-cta"]').getAttribute('href'), '/methodology');
    assert.strictEqual(await page.locator('[data-testid="landing-underwriting-cta"]').getAttribute('href'), '/?app=1');
    assert.strictEqual(await page.locator('.landing-uw-cta-row a').count(), 2, 'exactly two links in the buy box');
    // Method strip: pillar and band NAMES only (the score is proprietary: no weights, no cutoffs).
    const pillarText = (await page.locator('.landing-pillar').allInnerTexts()).join('|');
    ['Yield stability', 'Sustainability', 'Capital stickiness', 'Exit liquidity'].forEach((n) => assert.ok(pillarText.includes(n), 'pillar name ' + n));
    assert.ok(!/\bpts?\b|\b(35|25|15)\b/.test(pillarText), 'no pillar weights on the homepage: ' + pillarText);
    assert.deepStrictEqual(await page.locator('.landing-band-seg').evaluateAll((els) => els.map((el) => el.dataset.band)), ['AAA', 'AA', 'A', 'BBB', 'HIGH RISK']);
    const bandText = await page.locator('[data-testid="landing-bands"]').innerText();
    assert.ok(!/[≥<]|\b(85|70|55|40)\b/.test(bandText), 'no band cutoffs on the homepage: ' + bandText);
    const widths = await page.locator('.landing-band-seg').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    assert.ok(Math.max.apply(null, widths) - Math.min.apply(null, widths) <= 2, 'band chips are equal width: ' + widths);
    // The track record lives only on /forecast-accuracy: no section, no numbers, no evaluation fetch from the homepage.
    assert.strictEqual(await page.locator('[data-testid="landing-record"]').count(), 0, 'no track-record section on the homepage');
    assert.strictEqual(await page.locator('[data-testid="landing-record-link"]').count(), 0);
    assert.ok(!(await page.locator('#landing-root').innerText()).match(/test runs|skill score|band capture/i), 'no track-record metrics on the homepage');
    // Coverage: counts from landing-pools.json (when present), categories without numbers.
    const covData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'landing-pools.json'), 'utf8')).coverage;
    const covText = await page.locator('[data-testid="landing-coverage"]').innerText();
    if (covData) assert.ok(covText.includes(new Intl.NumberFormat('en-US').format(covData.scoredPools)), 'coverage count from CI data');
    assert.ok(!/\d\s*(pools|vaults)\b[^.]*\b(Lending|Staking|RWA)\b/.test(covText), 'no invented per-category counts');
    assert.strictEqual(await page.locator('.landing-category-chip').count(), 5);
    assert.strictEqual(await page.locator('[data-testid="landing-agents-link"]').getAttribute('href'), '/mcp');
    passed++;
    console.log('  ✓ method strip (names only), coverage and agents sections render; no track record');

    // Search routes to the existing analytics-app URLs.
    await page.fill('[data-testid="landing-search"]', 'USDC');
    await Promise.all([page.waitForURL(/\?token=USDC/), page.press('[data-testid="landing-search"]', 'Enter')]);
    passed++;
    console.log('  ✓ hero search routes "USDC" to /?token=USDC');
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#landing-root .landing-hero-underwriting', { timeout: 10000 });

    // Mobile: headline -> search -> primary CTA -> example card; no horizontal overflow.
    for (const [w, h] of [[360, 780], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      const m = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { titleBottom: r('#landing-uw-title').bottom, searchTop: r('[data-testid="landing-search"]').top, ctaTop: r('[data-testid="landing-methodology-cta"]').top, ctaBottom: r('[data-testid="landing-methodology-cta"]').bottom, cardTop: r('.landing-uw-terminal-card').top, ih: innerHeight, sw: document.documentElement.scrollWidth };
      });
      assert.ok(m.searchTop >= m.titleBottom && m.ctaTop >= m.searchTop && m.cardTop >= m.ctaTop, w + 'px: order is headline -> search -> CTA -> card');
      assert.ok(m.ctaBottom <= m.ih, w + 'x' + h + ': primary CTA inside the first viewport');
      assert.ok(m.sw <= w, w + 'px: no horizontal overflow (' + m.sw + ')');
    }
    const status = await page.locator('.landing-uw-status').innerText();
    assert.ok(/Scored .+ · live DefiLlama rates/.test(status), 'data-backed status line: ' + status);
    assert.strictEqual(await page.locator('.landing-uw-eyebrow').count(), 0, 'eyebrow chip replaced');
    passed++;
    console.log('  ✓ mobile: status, headline, search, primary CTA in the first viewport, no overflow');

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
    // 2026-10-24 "The Standard": the nav is exactly Search · Methodology · API; legacy features are not advertised.
    assert.deepStrictEqual(
      await page.locator('.landing-nav a').evaluateAll((as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')])),
      [['Search yields', '/?app=1'], ['Methodology', '/methodology'], ['API', '/mcp']],
      'Topnav is exactly Search / Methodology / API'
    );
    assert.strictEqual(await page.locator('.landing-mobile-nav a').count(), 3, 'mobile menu mirrors the 3 nav links');
    assert.ok(!/Savings Planner|Stocks|card/i.test(navText), 'Topnav must not advertise planner / stocks / card');
    assert.strictEqual(await page.locator('.landing-nav a[href="/for/claude"], .landing-nav a[href="/stocks"], .landing-nav a[href*="plan.html"], .landing-mobile-nav a[data-testid="landing-nav-card"]').count(), 0, 'no legacy-feature links in nav');
    passed++;
    console.log('  ✓ landing topnav contains clean active links without "How it works"');

    // Test Korean language toggle
    await page.goto(`http://localhost:${PORT}/?lang=en`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.landing-header-actions .lang-menu-trigger', { timeout: 10000 });
    // The EN/KO toggle is a language menu now (lang-menu.js): trigger -> item.
    const langBtn = page.locator('.landing-header-actions .lang-menu-trigger');
    await langBtn.click();
    await page.locator('.lang-menu-item[data-lang="ko"]').click();
    await page.waitForFunction(() => {
      const el = document.querySelector('.landing-uw-status');
      return el && el.textContent.includes('실시간');
    }, { timeout: 5000 });
    assert.ok((await page.locator('.landing-uw-terminal-card').innerText()).includes('점수 사례'), 'Expected Korean card labels');
    passed++;
    console.log('  ✓ language toggle switches landing page to Korean');

    // Switch back to EN
    await langBtn.click();
    await page.locator('.lang-menu-item[data-lang="en"]').click();
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
