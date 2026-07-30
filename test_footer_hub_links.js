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
     b. bare / (landing) -> the landing app's OWN footer (landing.js:356-367,
        `.app-footer .app-footer-hub-links a`) carries the hub links now — the
        same arrangement analytics mode already uses (app footer supplies the
        links; the static block is superseded, not deleted). Assert those
        links are visible and a real click navigates to /tokens.
     b2. bare / (crawler surface) -> the static .seo-hub-links markup (spec
        045's crawler de-orphan surface) must still be PRESENT in the DOM with
        both anchors on the landing route, regardless of its visibility
        (which the app footer deliberately supersedes there).
     c. ?lang=ko&token=USDC -> the rendered footer links show the KO strings.
     d. raw-HTML integrity -> home.html source still carries both static anchors
        (crawler de-orphan surface, 045 — fs-level assert).

   Item 179 (landing-mode occlusion + /plan.html gap) adds:
     A1. bare / -> exactly ONE visible /tokens + /chains pair (the landing
        app-footer's), proving the 179 dedup rule actually hides the static
        block's duplicate on the default route (b/b2 above already proved
        presence-in-DOM and the app-footer pair individually; A1 proves there
        is no longer a second VISIBLE pair, which is the defect 179 fixes).
     A2. bare / -> the hide is render-blocking: WITHOUT applyPrintStylesheets
        (i.e. before style.min.css's async swap lands), the inline critical
        CSS in home.html's <head> already computes .seo-hub-links to
        display:none for data-app-mode="landing" (mirrors case (e), which
        proves the same for analytics).
     A5. /plan.html -> the static footer (179 added it; previously ABSENT,
        `grep -c seo-hub-links plan.html` was 0) renders visible + clickable:
        plan.html sets no data-app-mode at all, so the 086/179 hide rule does
        not match there, same as planner mode on /.
     A6. /plan.html raw source -> both static anchors present (crawler
        surface, fs-level, same shape as (d) for home.html).
     A7. /plan.html?lang=ko -> the planner localizes the static footer anchors
        from the EXISTING footerBrowseTokens/footerBrowseChains keys after
        mount, while the raw file (A6) still ships EN for crawlers.

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
// the main-view .app-footer). Above the $10M TVL floor, non-zero apyBase.
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

  // (A6) raw-HTML integrity for /plan.html (179) — fs-level, no browser needed.
  await test('plan.html raw source contains both static hub anchors (179 crawler surface)', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'plan.html'), 'utf8');
    if (!/<a href="\/tokens">/.test(html)) throw new Error('missing static <a href="/tokens"> anchor in plan.html');
    if (!/<a href="\/chains">/.test(html)) throw new Error('missing static <a href="/chains"> anchor in plan.html');
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

    // (b) landing mode: the hub links moved onto the landing app's OWN footer.
    // Readiness wait repointed per the 2026-07-15 landing pivot (home.html:82):
    // bare / mounts the search-first landing into #landing-root, not the
    // planner, so `#planner-root [class*="gp-"]` never appears there.
    // data-testid preferred over class-shape selectors (156's explicit
    // precedent) so this readiness wait is not the next stale one.
    //
    // Coordinator-verified rule-B repoint (176): landing.js:356-367 renders
    // its own `<footer class="app-footer"><p class="app-footer-hub-links">`
    // with real /tokens and /chains anchors — the same arrangement analytics
    // mode already uses (app footer supplies the links). The behaviour did
    // not disappear, it moved; this case now asserts the surface that
    // inherited it, same strictness as the original (no catch/soft-assert).
    await test('bare / (landing): landing app-footer hub links visible + click -> /tokens', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('[data-testid="landing-search"]', { timeout: 10000 });
      await applyPrintStylesheets(page);

      const links = page.locator('.app-footer .app-footer-hub-links a');
      if (await links.count() !== 2) throw new Error('expected 2 hub links inside the landing .app-footer, found ' + await links.count());
      const tokensLink = page.locator('.app-footer .app-footer-hub-links a[href="/tokens"]');
      const chainsLink = page.locator('.app-footer .app-footer-hub-links a[href="/chains"]');
      if (!await tokensLink.isVisible()) throw new Error('Browse tokens link not visible inside the landing .app-footer');
      if (!await chainsLink.isVisible()) throw new Error('Browse chains link not visible inside the landing .app-footer');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));

      await Promise.all([
        page.waitForURL('**/tokens', { waitUntil: 'commit', timeout: 10000 }),
        tokensLink.click()
      ]);
      if (!/\/tokens$/.test(new URL(page.url()).pathname)) throw new Error('landing-mode click did not navigate to /tokens, got ' + page.url());
      await page.close();
    });

    // (b2) re-homed crawler-surface coverage (176, coordinator correction —
    // replaces the invented /plan.html case). Spec 045's actual requirement is
    // that the static .seo-hub-links markup with both anchors stays PRESENT in
    // the DOM for crawlers, not that it is visible/clickable — in landing mode
    // it is deliberately superseded by the app footer asserted in (b) above,
    // the same supersession analytics mode already does (086). Presence, not
    // visibility, so this assertion keeps holding if the block is later hidden
    // with CSS and stays true to what 045 actually needs.
    await test('bare / (landing): static .seo-hub-links crawler markup still present in the DOM (045)', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('[data-testid="landing-search"]', { timeout: 10000 });

      const staticTokens = page.locator('.seo-hub-links a[href="/tokens"]');
      const staticChains = page.locator('.seo-hub-links a[href="/chains"]');
      if (await staticTokens.count() !== 1) throw new Error('expected the static /tokens anchor to remain present in the DOM on bare /');
      if (await staticChains.count() !== 1) throw new Error('expected the static /chains anchor to remain present in the DOM on bare /');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      await page.close();
    });

    // (A1) bare / -> exactly ONE visible /tokens + /chains pair, the 179 fix's
    // core assertion: before 179 the static block's duplicate was also
    // visible here (occluded but still `display:flex`, so Playwright's
    // `:visible` — which checks CSS visibility, not occlusion — counted it),
    // giving 2 visible pairs. The dedup rule now makes only the landing
    // app-footer's pair visible.
    await test('bare / (landing): exactly one visible /tokens + /chains pair, inside the app-footer', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('[data-testid="landing-search"]', { timeout: 10000 });
      await applyPrintStylesheets(page);

      const visibleTokens = await page.locator('a[href="/tokens"]:visible').count();
      const visibleChains = await page.locator('a[href="/chains"]:visible').count();
      if (visibleTokens !== 1) throw new Error('expected exactly 1 visible /tokens link on bare /, found ' + visibleTokens);
      if (visibleChains !== 1) throw new Error('expected exactly 1 visible /chains link on bare /, found ' + visibleChains);
      const inAppFooter = await page.locator('.app-footer .app-footer-hub-links a[href="/tokens"]').isVisible();
      if (!inAppFooter) throw new Error('the one visible /tokens link should be inside .app-footer-hub-links');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      await page.close();
    });

    // (A2) bare / -> the hide is render-blocking (inline critical CSS), not
    // dependent on style.min.css's async swap. Mirrors case (e)'s proof for
    // analytics mode, extended to landing.
    await test('bare / (landing): inline critical CSS hides static footer pre-swap', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('[data-testid="landing-search"]', { timeout: 10000 });
      // Deliberately NO applyPrintStylesheets: prove the inline rule works
      // before the media="print" swap fires (the FOUC / headless-audit state).
      const appMode = await page.evaluate(() => document.documentElement.getAttribute('data-app-mode'));
      if (appMode !== 'landing') throw new Error('expected data-app-mode="landing" on bare /, got ' + appMode);
      const seoDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('.seo-hub-links')).display);
      if (seoDisplay !== 'none') throw new Error('.seo-hub-links must be display:none from inline critical CSS pre-swap on bare /, got ' + seoDisplay);
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
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

    // (A5) /plan.html -> the static footer 179 added renders visible +
    // clickable (plan.html sets no data-app-mode at all, so the 086/179 hide
    // rule never matches there — same as planner mode on /).
    await test('/plan.html: static hub links visible + clickable (179)', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/plan.html', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('.gp-question', { timeout: 15000 });
      await applyPrintStylesheets(page);

      const tokensLink = page.locator('.seo-hub-links a[href="/tokens"]');
      const chainsLink = page.locator('.seo-hub-links a[href="/chains"]');
      if (!await tokensLink.isVisible()) throw new Error('/plan.html: Browse tokens link not visible');
      if (!await chainsLink.isVisible()) throw new Error('/plan.html: Browse chains link not visible');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));

      // Real click proves non-occlusion (Playwright refuses to click a
      // covered element); asserts navigation to /tokens.
      await Promise.all([
        page.waitForURL('**/tokens', { waitUntil: 'commit', timeout: 10000 }),
        tokensLink.click()
      ]);
      if (!/\/tokens$/.test(new URL(page.url()).pathname)) throw new Error('/plan.html click did not navigate to /tokens, got ' + page.url());
      await page.close();
    });

    // (A7) /plan.html?lang=ko -> the planner localizes the static footer
    // anchors from the EXISTING footerBrowseTokens/footerBrowseChains keys
    // after mount. Raw file (A6) still ships EN — this is a post-mount DOM
    // assertion only.
    await test('/plan.html?lang=ko: static hub links localized to KO after mount (179)', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/plan.html?lang=ko', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('.gp-question', { timeout: 15000 });
      const tokensLink = page.locator('.seo-hub-links a[href="/tokens"]');
      const chainsLink = page.locator('.seo-hub-links a[href="/chains"]');
      const tokensText = (await tokensLink.textContent()).trim();
      const chainsText = (await chainsLink.textContent()).trim();
      if (tokensText !== '토큰 둘러보기') throw new Error('/plan.html?lang=ko: KO Browse tokens mismatch, got "' + tokensText + '"');
      if (chainsText !== '체인 둘러보기') throw new Error('/plan.html?lang=ko: KO Browse chains mismatch, got "' + chainsText + '"');
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
