/* Rendered Playwright test for backlog 221 — the analytics grid
   (`/home.html?token=`/`?chain=`) renders the shared OPAQUE, `position:
   fixed; bottom: 0; z-index: 100` `.app-footer` (style.css:2513-2524)
   inside `.app.has-results` (root at app.js:3000-3001, footer render site
   app.js:3533) — the third and last `.app-footer` render site (the
   playbook's three-site sweep, closed 2026-08-04 at item 220).

   Root cause (spec 221's Evidence, re-measured this run against a real
   render, unmodified tree, BEFORE this item's fix, grid-token 1280x780):
     interactive victim <button class="calculate-yield-btn-new"> occluded by
     <footer class="app-footer"> rect {x:0,y:711,w:1280,h:69} — ~99% covered,
     elementFromPoint at the button's centre resolved to the footer, not the
     button. grid-360 similarly buried a `.pool-symbol` row under the
     footer's {y:722-780} band. Unlike 217/220, `.app.has-results` DOES
     inherit `.app`'s own clearance (`padding-bottom: 80px`, style.css:852,
     "Space for footer") — the overlap is still there, because the victim is
     MID-DOCUMENT at scroll 0 (a `.pool-card` row, not the end of the
     document) and `padding-bottom` only lengthens the document; it cannot
     move content that already sits inside the footer's fixed band at first
     paint (218's exact lesson, recurring on a third surface).

   The fix (style.css, directly below `.app.has-results { display: block;
   padding-top: var(--space-32) }`): reuses 218/220's shipped pattern — the
   footer leaves the fixed layer on this view — but in the FALLBACK shape
   (spec 221's "Option B"), not 218/220's flex-column `margin-top: auto`
   idiom. `.app.has-results` is `display: block`, not already a flex column,
   so `margin-top: auto` on the footer alone would be inert; switching the
   view to `display: flex; flex-direction: column` to make it load-bearing
   was measured (not assumed) to shift `.container`'s position by +6px at
   360x780, a real side effect of item 222's own quarantined bug
   (`.theme-toggle`/`.language-toggle` render `position: static`, in-flow,
   directly under `.app` on this route at mobile width — block layout lets
   their margins collapse into `.container`'s leading edge, flex items never
   collapse margins with anything). Per spec 221's instruction ("if ANY
   other element shifts, do not force it — go to Option B"), this test
   ships and verifies the fallback:
     .app.has-results .app-footer { position: static; }
     .app.has-results { padding-bottom: 0; }
   No `margin-top: auto` — see style.css's own comment for why an inert
   declaration would be noise, not insurance, and specs/221-notes.md for the
   full flex-perturbation measurement this test does NOT re-derive.

   This test proves, against a REAL render (not source reading — style.css
   is minified and home.html:134 serves `style.min.css`, so a raw-only fix
   ships dead, item 136's trap this suite's own `npm run minify` guards
   against):
   For BOTH `?token=USDC` and `?chain=Ethereum`, at 360x780 and 1280x780,
   light AND dark:
     (a) no `.pool-card` (and specifically no `.calculate-yield-btn-new` or
         `.pool-symbol` — the exact victims spec 221's Evidence names)
         intersects `.app-footer`'s bounding box at rest (`scrollY===0`,
         asserted, never scrolled — 218's own lesson: "computing a clear
         scroll target hides the at-rest bug", this test never computes
         one);
     (b) HIT TEST, not paint-test: `elementFromPoint` at each
         `.calculate-yield-btn-new`'s and `.pool-symbol`'s lower band
         resolves to that element (or a `.pool-card` descendant of it),
         never `.app-footer` or a footer descendant;
     (c) the footer is still present, non-zero-sized, and its two hub links
         (`/tokens`, `/chains`) are hit-testable once scrolled to the true
         bottom (looped, arrival asserted — a silently-unscrolled test would
         pass vacuously) — the fix must not "fix" occlusion by hiding the
         footer;
     (d) no unexpected page/console errors.
   Plus a POSITIVE CONTROL, its own isolated page (so it cannot contaminate
   the real assertions): `.app.has-results .app-footer`'s `position: static`
   is mutated back to `fixed` in-page (padding-bottom restored to 80px too,
   reproducing the exact pre-fix state) at grid-token 1280x780, and the SAME
   at-rest measurement + hit test MUST report occlusion — a check that
   cannot go red is not evidence of health.

   Fixture-routed the same house pattern test_landing_footer_occlusion.js /
   test_cta_at_rest_occlusion.js use: `icons.llamao.fi` aborted, a
   deliberately-stale `pools-snapshot` route forces the live-fetch path, and
   `https://yields.llama.fi/pools` is fulfilled with a synthetic fixture
   sized to fill a 780px-tall viewport past the footer's band on both grid
   surfaces (the same technique used to reproduce the BEFORE numbers quoted
   above — a small handful of real pools does not reliably reach the fold).
   React/ReactDOM/translations are loaded from LOCAL files by home.html
   (`./react.production.min.js` etc, static `defer` tags) — no unpkg routing
   needed, same as test_landing_footer_occlusion.js. Browser-originated
   external HTTPS is blocked in this sandbox (NORTH_STAR.md 2026-07-12
   standing decision).

   Run: node test_grid_footer_occlusion.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8876; // distinct from other test_* files (8791-8875 taken; 8875 is the prior max, test_landing_footer_occlusion.js)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons|yields\.llama\.fi|pools-snapshot|Failed to load resource/i;

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

// Synthetic fixture, sized to fill a 780px-tall viewport past the footer's
// band on BOTH grid surfaces: half the pools are Ethereum (for
// ?chain=Ethereum) and every pool carries USDC in its symbol (for
// ?token=USDC), same construction used to reproduce spec 221's BEFORE
// numbers against a real render.
function buildPools(n) {
  const pools = [];
  for (let i = 0; i < n; i++) {
    pools.push({
      pool: `fixture-grid-pool-${i}`,
      project: 'aave-v3',
      symbol: i % 3 === 0 ? 'USDC' : (i % 3 === 1 ? 'STEAKUSDC' : 'aUSDC'),
      chain: i % 2 === 0 ? 'Ethereum' : 'Arbitrum',
      tvlUsd: 50_000_000 + i * 1_000_000,
      apyBase: 3 + (i % 5) * 0.2,
      apyReward: 0,
      apy: 3 + (i % 5) * 0.2
    });
  }
  return pools;
}
const FIXTURE_POOLS = buildPools(24);
const FIXTURE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

async function routeFixtures(page) {
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());
  await page.route('**/data/pools-snapshot*', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}'
  }));
  await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE
  }));
}

function makeErrorSink(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const source = m.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(m.text()))
      errors.push('console.error: ' + m.text() + (source ? ' (' + source + ')' : ''));
  });
  return errors;
}

// Scrolls to the true bottom of the document, looping window.scrollTo with
// short waits, then ASSERTS the bottom was actually reached — a test that
// silently failed to scroll would pass its geometry assertion vacuously
// (technique verbatim from test_footer_occlusion.js's scrollToTrueBottom(),
// reused by test_landing_footer_occlusion.js).
async function scrollToTrueBottom(page) {
  let atBottom = false;
  for (let i = 0; i < 8; i++) {
    atBottom = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const doc = document.documentElement;
      return Math.abs((doc.scrollTop + window.innerHeight) - doc.scrollHeight) <= 1;
    });
    if (atBottom) break;
    await page.waitForTimeout(150);
  }
  if (!atBottom) throw new Error('scrollToTrueBottom: never reached the true bottom of the document after 8 attempts');
  return atBottom;
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

async function getFooterBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.app-footer');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

// Every `.pool-card`, `.calculate-yield-btn-new` (P0 interactive victim) and
// `.pool-symbol` (P1 text victim) rect — spec 221's Evidence names both
// classes explicitly.
async function getVictimBoxes(page) {
  return page.evaluate(() => {
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      cards: Array.from(document.querySelectorAll('.pool-card')).map(rectOf),
      ctaButtons: Array.from(document.querySelectorAll('.calculate-yield-btn-new')).map(rectOf),
      poolSymbols: Array.from(document.querySelectorAll('.pool-symbol')).map(rectOf)
    };
  });
}

// Hit test at a rect's "lower band" (75% of its height). Walked via
// closest('.pool-card') so a descendant (icon/span inside the button, or
// the symbol text node's wrapper) still counts as a content hit.
// `elementFromPoint` legitimately returns an off-screen null/other element
// when the point is outside the viewport (MDN) — offscreen victims (e.g. a
// card below the fold at scroll 0 on a tall grid) are reported distinctly
// and treated as not-applicable, same as test_landing_footer_occlusion.js's
// hitTestLowerBand. The independent rect-intersection check (run first)
// still catches a genuine overlap regardless of on-screen-ness.
async function hitTestLowerBand(page, rect) {
  return page.evaluate((r) => {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height * 0.75;
    if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) {
      return { offscreen: true, tag: null, className: '', isFooter: false, isContent: false };
    }
    const el = document.elementFromPoint(cx, cy);
    const isFooter = !!(el && el.closest('.app-footer'));
    const isContent = !!(el && el.closest('.pool-card'));
    return {
      offscreen: false,
      tag: el ? el.tagName : null,
      className: el && typeof el.className === 'string' ? el.className : String(el && el.className),
      isFooter, isContent
    };
  }, rect);
}

// Core measurement: no `.pool-card`/CTA-button/pool-symbol rect intersects
// the footer, and the lower-band hit test on every CTA button and pool
// symbol never resolves to the footer.
async function assertNoOcclusion(page, label) {
  const footerBox = await getFooterBox(page);
  if (!footerBox) throw new Error(`${label}: .app-footer has no bounding box`);

  const victims = await getVictimBoxes(page);
  if (victims.cards.length === 0) throw new Error(`${label}: no .pool-card rendered — fixture routing failed`);
  if (victims.ctaButtons.length === 0) throw new Error(`${label}: no .calculate-yield-btn-new rendered`);
  if (victims.poolSymbols.length === 0) throw new Error(`${label}: no .pool-symbol rendered`);

  for (const [idx, rect] of victims.cards.entries()) {
    if (rectsIntersect(rect, footerBox)) {
      throw new Error(`${label}: .pool-card[${idx}] rect intersects .app-footer — card=${JSON.stringify(rect)} footer=${JSON.stringify(footerBox)}`);
    }
  }

  for (const [idx, rect] of victims.ctaButtons.entries()) {
    if (rectsIntersect(rect, footerBox)) {
      throw new Error(`${label}: .calculate-yield-btn-new[${idx}] rect intersects .app-footer — cta=${JSON.stringify(rect)} footer=${JSON.stringify(footerBox)}`);
    }
    const hit = await hitTestLowerBand(page, rect);
    if (!hit.offscreen && (hit.isFooter || !hit.isContent)) {
      throw new Error(`${label}: hit test at .calculate-yield-btn-new[${idx}]'s lower band resolved to <${hit.tag} class="${hit.className}"> (isFooter=${hit.isFooter}), expected a .pool-card descendant`);
    }
  }

  for (const [idx, rect] of victims.poolSymbols.entries()) {
    if (rectsIntersect(rect, footerBox)) {
      throw new Error(`${label}: .pool-symbol[${idx}] rect intersects .app-footer — symbol=${JSON.stringify(rect)} footer=${JSON.stringify(footerBox)}`);
    }
    const hit = await hitTestLowerBand(page, rect);
    if (!hit.offscreen && (hit.isFooter || !hit.isContent)) {
      throw new Error(`${label}: hit test at .pool-symbol[${idx}]'s lower band resolved to <${hit.tag} class="${hit.className}"> (isFooter=${hit.isFooter}), expected a .pool-card descendant`);
    }
  }

  return { footerBox, cardCount: victims.cards.length, ctaCount: victims.ctaButtons.length, symbolCount: victims.poolSymbols.length };
}

async function assertHubLinksHitTestable(page, label) {
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('.app-footer a[href="/tokens"], .app-footer a[href="/chains"]'));
    return anchors.map((a) => {
      const r = a.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const hitsSelf = !!(hit && (hit === a || hit.closest('a') === a));
      return { href: a.getAttribute('href'), rect: { x: r.x, y: r.y, width: r.width, height: r.height }, hitsSelf };
    });
  });
  if (links.length !== 2) throw new Error(`${label}: expected 2 footer hub links (/tokens, /chains), found ${links.length}: ${JSON.stringify(links)}`);
  for (const l of links) {
    if (!l.hitsSelf) throw new Error(`${label}: footer hub link ${l.href} is not hit-testable at its own centre — rect=${JSON.stringify(l.rect)}`);
  }
}

async function assertFooterPresentAndVisible(page, label) {
  const footerBox = await getFooterBox(page);
  if (!footerBox) throw new Error(`${label}: .app-footer not found in DOM`);
  if (footerBox.width <= 0 || footerBox.height <= 0) {
    throw new Error(`${label}: .app-footer has zero size — rect=${JSON.stringify(footerBox)}`);
  }
  await assertHubLinksHitTestable(page, label);
  return footerBox;
}

const SURFACES = [
  { key: 'grid-token', url: '/home.html?token=USDC', waitSelector: '.pool-card' },
  { key: 'grid-chain', url: '/home.html?chain=Ethereum', waitSelector: '.pool-card' }
];
const CONFIGS = [];
for (const surface of SURFACES) {
  for (const width of [360, 1280]) {
    for (const dark of [false, true]) {
      CONFIGS.push({
        label: `${surface.key} ${width}x780${dark ? ' dark' : ''}`,
        surface, width, height: 780, dark
      });
    }
  }
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const measured = {};

  try {
    for (const cfg of CONFIGS) {
      const page = await browser.newPage({ viewport: { width: cfg.width, height: cfg.height } });
      const errors = makeErrorSink(page);
      if (cfg.dark) await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
      await routeFixtures(page);

      const url = `http://localhost:${PORT}${cfg.surface.url}`;

      await test(`${cfg.label}: grid renders with no page errors`, async () => {
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector(cfg.surface.waitSelector, { timeout: 15000 });
        await page.waitForSelector('.app-footer', { timeout: 15000 });
        if (cfg.dark) {
          const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
          if (theme !== 'dark') throw new Error(`expected data-theme="dark", got ${theme}`);
        }
        if (errors.length) throw new Error(errors.join('\n    '));
      });

      await test(`${cfg.label}: AT REST (scrollY=0), no .pool-card/CTA/pool-symbol intersects .app-footer, hit test resolves to content`, async () => {
        const scrollY = await page.evaluate(() => window.scrollY);
        if (scrollY !== 0) throw new Error(`expected scrollY===0 at rest, got ${scrollY}`);
        measured[cfg.label + ' at-rest'] = await assertNoOcclusion(page, `${cfg.label} at-rest`);
      });

      await test(`${cfg.label}: .app-footer present, visible, hub links hit-testable at true bottom of scroll`, async () => {
        // Same rationale as test_landing_footer_occlusion.js: once the fix
        // takes the footer out of the fixed layer, it is only guaranteed to
        // be on screen once scrolled far enough — ordinary end-of-document
        // footer behaviour, not the "hiding the footer" failure mode
        // criterion (c) guards against (display:none / zero size / detached).
        await scrollToTrueBottom(page);
        measured[cfg.label + ' footer'] = await assertFooterPresentAndVisible(page, cfg.label);
      });

      await test(`${cfg.label}: no unexpected page/console errors`, async () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });

      await page.close();
    }

    // --- POSITIVE CONTROL, its own isolated page/context so it cannot
    // contaminate the real assertions above. Re-applies the pre-fix state:
    // `.app.has-results .app-footer` forced back to fixed, `.app.has-results`
    // padding-bottom restored to 80px (the exact `.app` value it cancels) —
    // the SAME measurement technique assertNoOcclusion() uses, asserting the
    // inverse (occlusion IS reported), proving the check can actually fail.
    const controlPage = await browser.newPage({ viewport: { width: 1280, height: 780 } });
    await routeFixtures(controlPage);
    await test('positive control: with the fix mutated away in-page, at-rest occlusion IS reported (proves the check can fail)', async () => {
      const url = `http://localhost:${PORT}/home.html?token=USDC`;
      await controlPage.goto(url, { waitUntil: 'load', timeout: 20000 });
      await controlPage.waitForSelector('.pool-card', { timeout: 15000 });
      await controlPage.addStyleTag({
        content: '.app.has-results .app-footer{position:fixed !important;bottom:0 !important;left:0;right:0} .app.has-results{padding-bottom:80px !important}'
      });
      await controlPage.waitForTimeout(100);

      const scrollY = await controlPage.evaluate(() => window.scrollY);
      if (scrollY !== 0) throw new Error(`positive control: window.scrollY=${scrollY}, expected 0`);

      let occluded = false;
      try {
        await assertNoOcclusion(controlPage, 'positive control');
      } catch (e) {
        occluded = true;
      }

      if (!occluded) {
        throw new Error('positive control failed to reproduce occlusion — the check would never fail and is not evidence of health');
      }
    });
    await controlPage.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log('measured (px):', JSON.stringify(measured, null, 2));
  console.log(`test_grid_footer_occlusion.js: ${passed}/${total} tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
