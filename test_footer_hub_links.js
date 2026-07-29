/* Playwright gate (spec 086): the footer "Browse tokens / Browse chains" hub
   links must be reachable in every mode — the human bug was that the static
   .seo-hub-links footer sat in normal flow UNDER the position:fixed .app-footer
   and could never be clicked in analytics mode.

   Run: node test_footer_hub_links.js

   Serves the repo statically (mimicking vercel.json's "/" -> home.html rewrite,
   and resolving /tokens & /chains to their generated index.html so the real
   navigation targets exist) and drives real Chromium against:
     a. /?token=USDC (analytics) -> both links live INSIDE the fixed .app-footer,
        are VISIBLE, and a real Playwright click (which refuses to click an
        occluded target) on "Browse tokens" navigates to /tokens; the static
        .seo-hub-links footer is display:none in this mode (links duplicated in
        the visible footer — same links to every audience, no cloaking).
     b. bare / (planner) -> the static .seo-hub-links links exist, are visible
        (no fixed .app-footer occludes them here) and clicking navigates /tokens.
     c. ?lang=ko&token=USDC -> the rendered footer links show the KO strings.
     d. raw-HTML integrity -> home.html source still carries both static anchors
        (crawler de-orphan surface, 045 — fs-level assert).

   Mirrors test_smoke.js: fixture-routed pools, CHROMIUM_EXECUTABLE fallback,
   IGNORABLE_ERROR_PATTERN for the known non-critical external fetches. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8803; // 8791-8802 already claimed by prior test_* files (085 took 8802)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
// Same rationale as test_smoke.js: only known non-critical external fetches are
// silenced; genuine page/console errors still fail the gate.
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;

const POOLS_URL = 'https://yields.llama.fi/pools';

// DefiLlama-shaped fixture so /?token=USDC renders .pool-card elements (and thus
// the main-view .app-footer). Above the $100K TVL floor (spec 173, was $10M), non-zero apyBase.
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9),
  makePool('usdc-arb-aave', 'aave-v3', 'USDC', 'Arbitrum', 70_000_000, 4.8),
  makePool('eth-eth-aave', 'aave-v3', 'ETH', 'Ethereum', 200_000_000, 2.9)
];
const POOLS_BODY = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/home.html';
      let filePath = path.join(ROOT, urlPath);
      // Resolve extension-less paths (/tokens, /chains) to their index.html so
      // the footer links have a real 200 navigation target.
      if (!path.extname(filePath)) {
        const indexPath = path.join(filePath, 'index.html');
        if (fs.existsSync(indexPath)) filePath = indexPath;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
    }
  });
  // spec 059: serve a STALE snapshot so the FE falls back to the fixtured LIVE endpoint deterministically (a 200 keeps the browser console clean; a 404 would trip pageErrors guards).
  await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route(POOLS_URL, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: POOLS_BODY
  }));
  return { page, errors };
}

// home.html loads style.min.css via the async `media="print"
// onload=this.media='all'` pattern; that onload swap is unreliable in headless
// Chromium (JS-injected sheets like pool-detail-styles.min.css do apply, the
// static print-media link often doesn't), so nothing from style.css applies and
// .app-footer never becomes position:fixed. Real Chrome performs the swap, so
// we replicate it here to evaluate the production-applied CSS (fixed footer +
// the analytics-mode `.seo-hub-links { display:none }` rule under test).
async function applyPrintStylesheets(page) {
  await page.evaluate(() => {
    document.querySelectorAll('link[rel="stylesheet"][media="print"]').forEach((l) => { l.media = 'all'; });
  });
  // Wait until style.css is actually applied. Its .seo-hub-links rule sets
  // display:flex (planner) and the 086 rule sets display:none (analytics) —
  // either differs from the unstyled <footer> default of block, so once it is
  // not 'block' the cascade has landed and visibility checks are meaningful.
  await page.waitForFunction(() => {
    const el = document.querySelector('.seo-hub-links');
    return el && getComputedStyle(el).display !== 'block';
  }, { timeout: 5000 });
}

async function main() {
  // (d) raw-HTML integrity — fs-level, no browser needed.
  await test('home.html raw source still contains both static hub anchors (045 crawler surface)', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8');
    if (!/<a href="\/tokens">/.test(html)) throw new Error('missing static <a href="/tokens"> anchor');
    if (!/<a href="\/chains">/.test(html)) throw new Error('missing static <a href="/chains"> anchor');
  });

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // (a) analytics mode: links inside the visible fixed .app-footer, clickable.
    await test('/?token=USDC: both hub links inside visible .app-footer, static footer hidden, click -> /tokens', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/?token=USDC', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await applyPrintStylesheets(page);

      const links = page.locator('.app-footer .app-footer-hub-links a');
      if (await links.count() !== 2) throw new Error('expected 2 hub links inside .app-footer, found ' + await links.count());
      const tokensLink = page.locator('.app-footer .app-footer-hub-links a[href="/tokens"]');
      const chainsLink = page.locator('.app-footer .app-footer-hub-links a[href="/chains"]');
      if (!await tokensLink.isVisible()) throw new Error('Browse tokens link not visible inside .app-footer');
      if (!await chainsLink.isVisible()) throw new Error('Browse chains link not visible inside .app-footer');
      if ((await tokensLink.textContent()).trim() !== 'Browse tokens') throw new Error('EN Browse tokens text mismatch');
      if ((await chainsLink.textContent()).trim() !== 'Browse chains') throw new Error('EN Browse chains text mismatch');

      // Static crawler footer must be hidden in analytics mode (links duplicated
      // in the visible footer above).
      if (await page.locator('.seo-hub-links').isVisible()) throw new Error('.seo-hub-links should be display:none in analytics mode');

      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));

      // Real click proves non-occlusion (Playwright refuses to click a covered
      // element); assert it navigates to /tokens.
      await Promise.all([
        page.waitForURL('**/tokens', { waitUntil: 'commit', timeout: 10000 }),
        tokensLink.click()
      ]);
      if (!/\/tokens$/.test(new URL(page.url()).pathname)) throw new Error('click did not navigate to /tokens, got ' + page.url());
      await page.close();
    });

    // (b) planner mode: static links reachable + clickable (no fixed footer here).
    await test('bare / (planner): static .seo-hub-links visible + click -> /tokens', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('#planner-root [class*="gp-"]', { timeout: 10000 });
      await applyPrintStylesheets(page);

      const staticTokens = page.locator('.seo-hub-links a[href="/tokens"]');
      if (await staticTokens.count() !== 1) throw new Error('expected the static /tokens anchor in planner mode');
      if (!await staticTokens.isVisible()) throw new Error('static /tokens link not visible in planner mode');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));

      await staticTokens.scrollIntoViewIfNeeded();
      await Promise.all([
        page.waitForURL('**/tokens', { waitUntil: 'commit', timeout: 10000 }),
        staticTokens.click()
      ]);
      if (!/\/tokens$/.test(new URL(page.url()).pathname)) throw new Error('planner-mode click did not navigate to /tokens, got ' + page.url());
      await page.close();
    });

    // (c) KO strings on the rendered footer links.
    await test('?lang=ko&token=USDC: footer hub links render the KO strings', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/?lang=ko&token=USDC', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const tokensLink = page.locator('.app-footer .app-footer-hub-links a[href="/tokens"]');
      const chainsLink = page.locator('.app-footer .app-footer-hub-links a[href="/chains"]');
      const tokensText = (await tokensLink.textContent()).trim();
      const chainsText = (await chainsLink.textContent()).trim();
      if (tokensText !== '토큰 둘러보기') throw new Error('KO Browse tokens mismatch, got "' + tokensText + '"');
      if (chainsText !== '체인 둘러보기') throw new Error('KO Browse chains mismatch, got "' + chainsText + '"');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      await page.close();
    });

    // (e) pool-detail (north-star page): the 131 regression. Load the detail view
    // and assert single-instance WITHOUT forcing the async style.css swap — the
    // inline critical rule in home.html <head> must hide the static footer at
    // first paint (this is the exact state the 2026-07-23 audit captured: 2 links).
    await test('/?pool=usdc-base-aave (north-star): inline critical CSS hides static footer pre-swap, one visible hub link set', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/?pool=usdc-base-aave', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      // Deliberately NO applyPrintStylesheets: prove the inline rule works before
      // the media="print" swap fires (the FOUC / headless-audit state).
      if (await page.evaluate(() => document.documentElement.getAttribute('data-app-mode')) !== 'analytics')
        throw new Error('expected data-app-mode="analytics" on pool-detail page');
      const seoDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('.seo-hub-links')).display);
      if (seoDisplay !== 'none') throw new Error('.seo-hub-links must be display:none from inline critical CSS pre-swap, got ' + seoDisplay);
      const visibleTokens = await page.locator('a[href="/tokens"]:visible').count();
      const visibleChains = await page.locator('a[href="/chains"]:visible').count();
      if (visibleTokens !== 1) throw new Error('expected exactly 1 visible /tokens link on pool-detail, found ' + visibleTokens);
      if (visibleChains !== 1) throw new Error('expected exactly 1 visible /chains link on pool-detail, found ' + visibleChains);
      const inFooter = await page.locator('.app-footer .app-footer-hub-links a[href="/tokens"]').isVisible();
      if (!inFooter) throw new Error('the one visible /tokens link should be inside .app-footer-hub-links');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      await page.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' footer-hub-link assertions passed');
}

main().catch((err) => {
  console.error('footer-hub-link test crashed: ' + err.message);
  process.exitCode = 1;
});
