/* Rendered Playwright regression test for the shared analytics header.

   Across token, chain, pool-detail, and analytics-homepage routes, it checks
   one visible theme/language pair, pressable hit targets, no horizontal
   overflow, functional clicks, EN/KO and light/dark parity, and results
   content clearing the sticky header at the supported viewport boundaries.

   Isolated mutation proofs restore the former fixed/oversized geometry and
   inject a duplicate legacy pair only after a green precondition. Each proof
   must make the behavioral assertion fail, preventing vacuous coverage.

   Fixtures serve the same compiled/minified assets production loads while
   replacing external React, icon, and pool-data requests deterministically.

   Run: node test_mobile_controls_reachable.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8876; // distinct from other test_* files (8791-8875 taken; 8875 is the prior max, test_landing_footer_occlusion.js)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// 12-pool USDC/Ethereum fixture (spec 222's documented shape) — enough
// distinct symbols/projects for the grid to actually populate, and every
// tvlUsd is well above DEFAULT_MIN_TVL ($10M, app.js:801).
const POOLS = Array.from({ length: 12 }, (_, i) => ({
  pool: `probe-pool-${i}`,
  project: ['aave-v3', 'compound-v3', 'morpho-blue', 'fluid-lending'][i % 4],
  symbol: ['USDC', 'STEAKUSDC', 'USDT', 'DAI'][i % 4],
  chain: 'Ethereum',
  tvlUsd: 900_000_000 - i * 10_000_000,
  apyBase: 5.5 - i * 0.1,
  apyReward: 0,
  underlyingTokens: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48']
}));
const FIXTURE = JSON.stringify({ status: 'success', data: POOLS });

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
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function routeFixtures(page) {
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
}

// The prod sheet (style.min.css) is injected asynchronously by home.html's
// addCSS (media='print' -> onload media='all'). Wait until it has actually
// applied before measuring geometry — proxy signal: --color-primary (a
// custom property only the real design-system sheet defines) resolves to a
// non-empty value, same technique test_filter_dropdown_polish.js uses.
async function waitForCss(page) {
  await page.waitForFunction(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() !== '';
  }, { timeout: 15000 });
}

function attachErrorCollector(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
      errors.push('console.error: ' + m.text());
  });
  return errors;
}

// Read every matching control's visibility and hit-test geometry. Production
// renders the shared header instance; mutation proofs may inject a legacy
// duplicate so failure diagnostics still name the covering element.
async function measureControlsDiagnostic(page, selector) {
  return page.evaluate((sel) => {
    const els = Array.from(document.querySelectorAll(sel));
    const details = els.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        className: el.className,
        display: cs.display,
        visible: cs.display !== 'none' && r.width > 0 && r.height > 0,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height }
      };
    });
    const visibleEls = els.filter((el, i) => details[i].visible);
    const target = visibleEls[0] || els[0];
    let hits = null;
    // 225 round 3b: containment diagnostics. The clip class that survived
    // this test (standalone theme-toggle's legacy 48px switch overflowing
    // its 40px icon-only box, spilling past the viewport edge as a visible,
    // unpressable sliver) is invisible to a centre/lower-band hit test —
    // the button's own border box was fully on-canvas. Two extra reads:
    //   (a) the border box itself must sit fully inside the viewport;
    //   (b) the control's content must FIT its box (scrollWidth/Height vs
    //       clientWidth/Height, +1px rounding tolerance) — overflowing
    //       child content is what actually painted past the edge.
    let containment = null;
    if (target) {
      const r0 = target.getBoundingClientRect();
      containment = {
        rect: { left: r0.left, right: r0.right, top: r0.top, bottom: r0.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        boxInViewport: r0.left >= 0 && r0.top >= 0 && r0.right <= window.innerWidth,
        scrollWidth: target.scrollWidth,
        clientWidth: target.clientWidth,
        scrollHeight: target.scrollHeight,
        clientHeight: target.clientHeight,
        contentFits: target.scrollWidth <= target.clientWidth + 1 &&
                     target.scrollHeight <= target.clientHeight + 1
      };
    }
    if (target) {
      const r = target.getBoundingClientRect();
      const points = {
        centre: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
        lowerBand: { x: r.x + r.width / 2, y: r.y + r.height * 0.75 }
      };
      hits = {};
      for (const [name, pt] of Object.entries(points)) {
        const hitEl = document.elementFromPoint(pt.x, pt.y);
        hits[name] = {
          isSelf: !!(hitEl && (hitEl === target || target.contains(hitEl))),
          tag: hitEl ? hitEl.tagName : null,
          className: hitEl && typeof hitEl.className === 'string' ? hitEl.className : (hitEl ? String(hitEl.className) : '')
        };
      }
    }
    return { details, visibleCount: details.filter((d) => d.visible).length, hits, containment };
  }, selector);
}

function assertReachable(diag, selector, label) {
  const problems = [];
  if (diag.visibleCount !== 1) {
    problems.push(`expected exactly 1 visible ${selector}, got ${diag.visibleCount} -- ${JSON.stringify(diag.details)}`);
  }
  if (diag.hits) {
    for (const [name, hit] of Object.entries(diag.hits)) {
      if (!hit.isSelf) {
        problems.push(`hit test at "${name}" did not resolve to ${selector} itself -- covering element: <${hit.tag} class="${hit.className}">`);
      }
    }
  }
  // 225 round 3b: containment criteria (see measureControlsDiagnostic) —
  // guards the clip class the hit tests alone let through.
  if (diag.containment) {
    if (!diag.containment.boxInViewport) {
      problems.push(`${selector} border box leaves the viewport -- rect ${JSON.stringify(diag.containment.rect)} vs viewport ${JSON.stringify(diag.containment.viewport)}`);
    }
    if (!diag.containment.contentFits) {
      problems.push(`${selector} content overflows its own box (clipped/spilling child) -- scroll ${diag.containment.scrollWidth}x${diag.containment.scrollHeight} > client ${diag.containment.clientWidth}x${diag.containment.clientHeight}`);
    }
  }
  if (problems.length) throw new Error(`${label}: ${problems.join(' | ')}`);
}

async function assertAtRest(page, label) {
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY !== 0) throw new Error(`${label}: window.scrollY=${scrollY}, expected 0 -- this test must never scroll before measuring`);
}

async function assertNoOverflow(page, label) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  if (scrollWidth > innerWidth) {
    throw new Error(`${label}: documentElement.scrollWidth (${scrollWidth}) > window.innerWidth (${innerWidth}) -- horizontal overflow`);
  }
}

// Criteria (1)+(2)+(3) combined, at rest, for both controls.
async function assertControlsReachable(page, label) {
  await assertAtRest(page, label);
  for (const sel of ['.theme-toggle', '.language-toggle']) {
    const diag = await measureControlsDiagnostic(page, sel);
    assertReachable(diag, sel, label);
  }
  await assertNoOverflow(page, label);
}

// --- Criterion 11 (attempt 2): .results-title/.results-header clear of ---
// .app-header-sticky. Rect-intersection AND a hit test, same reasoning
// as measureControlsDiagnostic above -- two elements can have
// non-overlapping bounding rects and still fail the hit test (e.g. a third
// element painted on top), so both checks run independently and either one
// failing is reported.
async function measureClearanceDiagnostic(page, selector) {
  return page.evaluate((sel) => {
    const header = document.querySelector('.app-header-sticky');
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const hr = header ? header.getBoundingClientRect() : null;
    const r = el.getBoundingClientRect();
    const intersects = !!hr && !(r.right <= hr.left || r.left >= hr.right || r.bottom <= hr.top || r.top >= hr.bottom);
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const hitEl = document.elementFromPoint(cx, cy);
    return {
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      headerRect: hr ? { x: hr.x, y: hr.y, width: hr.width, height: hr.height } : null,
      intersects,
      hit: {
        isSelf: !!(hitEl && (hitEl === el || el.contains(hitEl))),
        tag: hitEl ? hitEl.tagName : null,
        className: hitEl && typeof hitEl.className === 'string' ? hitEl.className : (hitEl ? String(hitEl.className) : '')
      }
    };
  }, selector);
}

function assertHeaderClear(diag, selector, label) {
  if (diag.missing) throw new Error(`${label}: ${selector} not found in DOM`);
  const problems = [];
  if (diag.intersects) {
    problems.push(`${selector} rect ${JSON.stringify(diag.rect)} intersects .app-header-sticky rect ${JSON.stringify(diag.headerRect)}`);
  }
  if (!diag.hit.isSelf) {
    problems.push(`${selector} hit test at centre did not resolve to itself -- covering element: <${diag.hit.tag} class="${diag.hit.className}">, rect: ${JSON.stringify(diag.rect)}, header rect: ${JSON.stringify(diag.headerRect)}`);
  }
  if (problems.length) throw new Error(`${label}: ${problems.join(' | ')}`);
}

async function assertResultsHeaderClear(page, label) {
  await assertAtRest(page, label);
  for (const sel of ['.results-title', '.results-header']) {
    const diag = await measureClearanceDiagnostic(page, sel);
    assertHeaderClear(diag, sel, label);
  }
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const tokenUrl = `http://localhost:${PORT}/home.html?token=USDC`;
  const chainUrl = `http://localhost:${PORT}/home.html?chain=Ethereum`;
  const koTokenUrl = `http://localhost:${PORT}/home.html?token=USDC&lang=ko`;
  const homepageUrl = `http://localhost:${PORT}/home.html?app=1`;
  const WIDTHS = [360, 480, 640, 768, 1280];

  try {
    // --- (1)-(3): ?token=USDC across all five widths, one page reused, ---
    // same pattern as test_cta_at_rest_occlusion.js.
    const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const pageErrors = attachErrorCollector(page);
    await routeFixtures(page);

    for (const width of WIDTHS) {
      await test(`(1)-(3) ${width}x780 ?token=USDC: exactly one visible+reachable theme-toggle and language-toggle, no horizontal overflow`, async () => {
        await page.setViewportSize({ width, height: 780 });
        await page.goto(tokenUrl, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.pool-card', { timeout: 15000 });
        await waitForCss(page);
        await assertControlsReachable(page, `${width}x780 ?token=USDC`);
      });
      // (11) is only in the design bar at 360/480/640/768 (spec 222's
      // addendum) -- 1280 is out of scope (measured clear both before and
      // after, per the addendum's own baseline table), so skip it here.
      // Page is already on this width/URL from the test just above -- no
      // re-navigation needed.
      if (width !== 1280) {
        await test(`(11) ${width}x780 ?token=USDC: .results-title and .results-header clear of .app-header-sticky`, async () => {
          await assertResultsHeaderClear(page, `${width}x780 ?token=USDC`);
        });
      }
    }

    await test('no unexpected page/console errors (?token=USDC, all widths)', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });

    // --- (4): real click() at 360px -- theme flips data-theme, language ---
    // flips the ?lang URL state. A real click() fails with a Playwright
    // interception error if anything covers the button, so no separate
    // "is it covered" check is needed here -- the click itself is the proof.
    await test('(4) 360px: clicking the visible theme toggle flips document.documentElement.dataset.theme', async () => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(tokenUrl, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await waitForCss(page);
      await assertAtRest(page, '360px click (theme)');
      const before = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.locator('.theme-toggle:visible').click({ timeout: 5000 });
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => document.documentElement.dataset.theme);
      if (after === before || !['light', 'dark'].includes(after)) {
        throw new Error(`theme did not flip via a real click: before=${before} after=${after}`);
      }
    });

    await test('(4) 360px: clicking the visible language toggle flips the ?lang URL state en<->ko', async () => {
      const beforeLang = new URL(page.url()).searchParams.get('lang') || 'en';
      await page.locator('.language-toggle:visible').click({ timeout: 5000 });
      await page.waitForTimeout(150);
      const afterLang = new URL(page.url()).searchParams.get('lang') || 'en';
      if (afterLang === beforeLang) {
        throw new Error(`?lang state did not flip via a real click: before=${beforeLang} after=${afterLang}`);
      }
    });
    await page.close();

    // --- (5): KO parity at 360px, fresh page. ---
    const koPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const koErrors = attachErrorCollector(koPage);
    await routeFixtures(koPage);
    await test('(5) 360px ?lang=ko: exactly one visible+reachable theme-toggle and language-toggle, no overflow', async () => {
      await koPage.goto(koTokenUrl, { waitUntil: 'load', timeout: 20000 });
      await koPage.waitForSelector('.pool-card', { timeout: 15000 });
      await waitForCss(koPage);
      await assertControlsReachable(koPage, '360x780 ?lang=ko');
    });
    await test('no unexpected page/console errors (KO page)', async () => {
      if (koErrors.length) throw new Error(koErrors.join('\n    '));
    });

    // (11) KO parity across the full design bar (spec 222's addendum names
    // EN and KO explicitly, unlike criterion 5 above which is 360px-only).
    for (const width of [360, 480, 640, 768]) {
      await test(`(11) ${width}x780 ?lang=ko ?token=USDC: .results-title and .results-header clear of .app-header-sticky`, async () => {
        await koPage.setViewportSize({ width, height: 780 });
        await koPage.goto(koTokenUrl, { waitUntil: 'load', timeout: 20000 });
        await koPage.waitForSelector('.pool-card', { timeout: 15000 });
        await waitForCss(koPage);
        await assertResultsHeaderClear(koPage, `${width}x780 ?lang=ko ?token=USDC`);
      });
    }
    await koPage.close();

    // --- (6): dark mode at 360px, fresh page so localStorage.theme is set
    // before first paint (test_cta_at_rest_occlusion.js's pattern). ---
    const darkPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const darkErrors = attachErrorCollector(darkPage);
    await darkPage.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await routeFixtures(darkPage);
    await test('(6) 360px dark mode: exactly one visible+reachable theme-toggle and language-toggle, no overflow', async () => {
      await darkPage.goto(tokenUrl, { waitUntil: 'load', timeout: 20000 });
      await darkPage.waitForSelector('.pool-card', { timeout: 15000 });
      await waitForCss(darkPage);
      const theme = await darkPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (theme !== 'dark') throw new Error(`expected data-theme="dark" before measuring, got ${theme}`);
      await assertControlsReachable(darkPage, '360x780 dark');
    });
    await test('no unexpected page/console errors (dark page)', async () => {
      if (darkErrors.length) throw new Error(darkErrors.join('\n    '));
    });
    await darkPage.close();

    // --- (7): ?chain=Ethereum parity at 360px, fresh page. ---
    const chainPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const chainErrors = attachErrorCollector(chainPage);
    await routeFixtures(chainPage);
    await test('(7) 360px ?chain=Ethereum: exactly one visible+reachable theme-toggle and language-toggle, no overflow', async () => {
      await chainPage.goto(chainUrl, { waitUntil: 'load', timeout: 20000 });
      await chainPage.waitForSelector('.pool-card', { timeout: 15000 });
      await waitForCss(chainPage);
      await assertControlsReachable(chainPage, '360x780 ?chain=Ethereum');
    });
    await test('no unexpected page/console errors (?chain= page)', async () => {
      if (chainErrors.length) throw new Error(chainErrors.join('\n    '));
    });
    await test('(11) 360x780 ?chain=Ethereum: .results-title and .results-header clear of .app-header-sticky', async () => {
      await assertResultsHeaderClear(chainPage, '360x780 ?chain=Ethereum');
    });
    await chainPage.close();

    // --- (8): the analytics homepage uses the same shared header and must
    // keep its one in-flow control pair reachable at phone width. ---
    const homePage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const homeErrors = attachErrorCollector(homePage);
    await routeFixtures(homePage);
    await test('(8) 360px ?app=1 (analytics homepage): shared-header controls visible and self-hit-testing', async () => {
      await homePage.goto(homepageUrl, { waitUntil: 'load', timeout: 20000 });
      await homePage.waitForSelector('#root .search-input', { timeout: 15000 });
      await waitForCss(homePage);
      await assertControlsReachable(homePage, '360x780 ?app=1 (homepage)');
    });
    await test('no unexpected page/console errors (homepage)', async () => {
      if (homeErrors.length) throw new Error(homeErrors.join('\n    '));
    });
    await homePage.close();

    // --- (8b) 225 round 3b: the SAME surface at desktop width. The clip
    // that motivated the containment criteria (theme toggle's legacy switch
    // spilling past the right viewport edge) was visible at 1280 AND 360 on
    // ?app=1, but this suite only drove ?app=1 at 360 and only hit-tested
    // box centres — so it stayed green. Desktop coverage + the containment
    // checks above close that gap. ---
    const homeWidePage = await browser.newPage({ viewport: { width: 1280, height: 780 } });
    const homeWideErrors = attachErrorCollector(homeWidePage);
    await routeFixtures(homeWidePage);
    await test('(8b) 1280px ?app=1 (analytics homepage): shared-header controls on-canvas and self-hit-testing', async () => {
      await homeWidePage.goto(homepageUrl, { waitUntil: 'load', timeout: 20000 });
      await homeWidePage.waitForSelector('#root .search-input', { timeout: 15000 });
      await waitForCss(homeWidePage);
      await assertControlsReachable(homeWidePage, '1280x780 ?app=1 (homepage)');
    });
    await test('no unexpected page/console errors (homepage, 1280)', async () => {
      if (homeWideErrors.length) throw new Error(homeWideErrors.join('\n    '));
    });
    await homeWidePage.close();

    // --- (9) RED PROOF, own isolated page, 768x780. Inject the retired
    // duplicate shape and restore fixed positioning so the reachability
    // assertion deterministically detects overlapping controls. ---
    const redPage = await browser.newPage({ viewport: { width: 768, height: 780 } });
    await routeFixtures(redPage);
    await test('(9) RED PROOF: with the shipped fix mutated away in-page, criteria (1)+(2) go red naming the covering element', async () => {
      await redPage.goto(tokenUrl, { waitUntil: 'load', timeout: 20000 });
      await redPage.waitForSelector('.pool-card', { timeout: 15000 });
      await waitForCss(redPage);

      // Sanity: green BEFORE mutation, so any red below is caused by the
      // mutation, not by test flakiness or a wrong selector.
      await assertControlsReachable(redPage, '768x780 red-proof PRE-mutation (must be green)');

      // The duplicate elements no longer exist in production. Inject their
      // retired direct-child shape after the green precondition solely to
      // prove that duplicate-control and occlusion detection can go red.
      await redPage.evaluate(() => {
        const app = document.querySelector('.app');
        const themeBtn = document.createElement('button');
        themeBtn.className = 'theme-toggle';
        themeBtn.setAttribute('data-theme', 'light');
        themeBtn.setAttribute('aria-label', 'Switch to dark mode');
        themeBtn.innerHTML = '<div class="theme-toggle-icon">☾</div>';
        const langBtn = document.createElement('button');
        langBtn.className = 'language-toggle';
        langBtn.setAttribute('aria-label', 'Switch to Korean');
        langBtn.textContent = 'EN';
        app.appendChild(themeBtn);
        app.appendChild(langBtn);
      });

      // Restore the former fixed header geometry and wide search minimum.
      // The injected duplicate remains visible, so criteria (1)+(2) must
      // detect either the duplicate population or its covering geometry.
      await redPage.addStyleTag({ content: `
        .app-header-controls .theme-toggle {
          position: fixed !important; top: var(--space-20) !important;
          right: var(--space-20) !important; z-index: 1000 !important; margin: 0 !important;
        }
        .app-header-controls .language-toggle {
          position: fixed !important; top: var(--space-20) !important;
          right: calc(var(--space-20) + 200px) !important; z-index: 1000 !important; margin: 0 !important;
        }
        .app-search-container { min-width: 170px !important; }
        .app-search-input { min-width: 170px !important; }
      `});
      await redPage.waitForTimeout(100);

      const scrollY = await redPage.evaluate(() => window.scrollY);
      if (scrollY !== 0) throw new Error(`red proof: window.scrollY=${scrollY}, expected 0`);

      let thrown = null;
      try {
        await assertControlsReachable(redPage, '768x780 red-proof POST-mutation (must go red)');
      } catch (e) {
        thrown = e;
      }
      if (!thrown) {
        throw new Error('positive control failed to reproduce the defect -- assertControlsReachable stayed GREEN after the shipped fix was mutated away in-page; a check that cannot fail is not evidence of health');
      }
      if (!/covering element|expected exactly 1 visible/.test(thrown.message)) {
        throw new Error(`red proof fired but the message did not name a covering element / visibility mismatch as expected: ${thrown.message}`);
      }
      console.log(`    red proof fired as expected: ${thrown.message}`);
    });
    await redPage.close();

    // --- (9) SECOND RED PROOF, attempt 2: own isolated page at 360x780.
    // The compact-search follow-up adds independent protections beyond
    // min-width:0: phone wordmark removal and tighter field/action padding.
    // Reintroduce the complete pre-fix geometry so this positive control
    // continues to prove the unreachable-control detector.
    const redPage2 = await browser.newPage({ viewport: { width: 360, height: 780 } });
    await routeFixtures(redPage2);
    await test('(9) RED PROOF #2 (360x780): restoring pre-fix search geometry reproduces the unreachable off-screen control signature', async () => {
      await redPage2.goto(tokenUrl, { waitUntil: 'load', timeout: 20000 });
      await redPage2.waitForSelector('.pool-card', { timeout: 15000 });
      await waitForCss(redPage2);

      // Sanity: green BEFORE mutation.
      await assertControlsReachable(redPage2, '360x780 unreachable-red-proof PRE-mutation (must be green)');

      await redPage2.addStyleTag({ content: `
        .app-brand-wordmark { display: inline !important; }
        .app-logo { flex: 0 1 auto !important; }
        .app-search-bar { padding-left: 16px !important; padding-right: 16px !important; }
        .app-search-container { min-width: 170px !important; }
        .app-search-input { min-width: 170px !important; padding-left: 20px !important; padding-right: 20px !important; }
        .app-search-clear { width: auto !important; padding-left: 8px !important; padding-right: 8px !important; }
      `});
      await redPage2.waitForTimeout(100);

      const scrollY = await redPage2.evaluate(() => window.scrollY);
      if (scrollY !== 0) throw new Error(`red proof: window.scrollY=${scrollY}, expected 0`);

      const diag = await redPage2.evaluate(() => {
        const el = document.querySelector('.app-header-controls .theme-toggle');
        if (!el) return { missing: true };
        const r = el.getBoundingClientRect();
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const hitEl = document.elementFromPoint(cx, cy);
        return {
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          hitIsNull: hitEl === null,
          hitTag: hitEl ? hitEl.tagName : null,
          hitClass: hitEl && typeof hitEl.className === 'string' ? hitEl.className : '',
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth
        };
      });
      if (diag.missing) throw new Error('red proof: .app-header-controls .theme-toggle not found in DOM');
      if (!diag.hitIsNull) {
        throw new Error(`positive control failed to reproduce the UNREACHABLE signature -- expected elementFromPoint at the header .theme-toggle's centre to resolve to null (off-screen clip), got <${diag.hitTag} class="${diag.hitClass}"> instead -- rect: ${JSON.stringify(diag.rect)}`);
      }
      if (diag.scrollWidth !== diag.innerWidth) {
        throw new Error(`red proof: expected documentElement.scrollWidth (${diag.scrollWidth}) === innerWidth (${diag.innerWidth}) -- this item's defect is a CLIP the user cannot scroll to reach, not scrollable overflow; got overflow instead`);
      }
      console.log(`    red proof fired as expected: header .theme-toggle centre -> null (off-screen clip), rect=${JSON.stringify(diag.rect)}, scrollWidth(${diag.scrollWidth})===innerWidth(${diag.innerWidth})`);
    });
    await redPage2.close();

    // --- (11) RED PROOF, attempt 2: own isolated page at 360x780. Mutate
    // .app.has-results's padding-top back to the pre-attempt-2 20px value
    // and assert criterion 11 goes red, naming the header. ---
    const redPage3 = await browser.newPage({ viewport: { width: 360, height: 780 } });
    await routeFixtures(redPage3);
    await test('(11) RED PROOF (attempt 2, 360x780): mutating .app.has-results padding-top back to var(--space-20) reproduces the .results-title/.results-header occlusion under the header', async () => {
      await redPage3.goto(tokenUrl, { waitUntil: 'load', timeout: 20000 });
      await redPage3.waitForSelector('.pool-card', { timeout: 15000 });
      await waitForCss(redPage3);

      // Sanity: green BEFORE mutation.
      await assertResultsHeaderClear(redPage3, '360x780 padding-top red-proof PRE-mutation (must be green)');

      await redPage3.addStyleTag({ content: `
        .app.has-results { padding-top: 20px !important; }
      `});
      await redPage3.waitForTimeout(100);

      const scrollY = await redPage3.evaluate(() => window.scrollY);
      if (scrollY !== 0) throw new Error(`red proof: window.scrollY=${scrollY}, expected 0`);

      let thrown = null;
      try {
        await assertResultsHeaderClear(redPage3, '360x780 padding-top red-proof POST-mutation (must go red)');
      } catch (e) {
        thrown = e;
      }
      if (!thrown) {
        throw new Error('positive control failed to reproduce the (A) regression -- criterion 11 stayed GREEN after padding-top was mutated back to 20px; a check that cannot fail is not evidence of health');
      }
      if (!/app-header/i.test(thrown.message)) {
        throw new Error(`red proof fired but did not name the header as the intersecting/covering element: ${thrown.message}`);
      }
      console.log(`    red proof fired as expected: ${thrown.message}`);
    });
    await redPage3.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`test_mobile_controls_reachable.js: ${passed}/${total} tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
