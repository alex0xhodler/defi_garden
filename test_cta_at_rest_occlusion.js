/* Rendered Playwright test for backlog 218 — the north-star `garden_cta`
   anchor sits behind the opaque, `position: fixed` `.app-footer` AT
   `scrollY = 0`, before the user has scrolled or touched anything.

   Root cause (spec 218's Evidence, re-measured this run on the suite's
   standard STETH fixture pool `747c1d2a-…`, `home.html?pool=…`, real
   minified sheets, `scrollY = 0`):
     360x780:  cta rect 703.3 -> 750.3 (h 47)   footer rect 722 -> 780 (fixed)
               -- footer OVERLAPS the button; elementFromPoint at the CTA's
               lower band returns the footer, not the anchor.
     768x900:  cta rect 590.8 -> 637.8           footer rect 842 -> 900 (clear)
     1280x900: cta rect 309.9 -> 356.9           footer rect 831 -> 900 (clear)
   Item 217's fix (`pool-detail-styles.css:1065-1072`) restores `.app`'s
   `padding-bottom: 80px` clearance, which protects the END of the document —
   it cannot protect a mid-document element (the hero CTA) that happens to
   land inside the footer's band at rest. The overlap is content-dependent
   (hero-card height varies by pool: 47px buried on the human's own pool,
   28.3px on the fixture pool here) so no clearance VALUE fixes the class —
   only removing the fixed overlay on this view does (see the 218 comment
   block in pool-detail-styles.css, directly below 217's).

   AT-REST MEASUREMENT IS THE WHOLE POINT. test_footer_occlusion.js (217)
   measures the TRUE BOTTOM of scroll and proved that surface clear; its own
   case (5) proved the CTA can be scrolled to a position where it clears the
   footer. Neither asks what the user sees at first paint, before any
   scrolling — and that is exactly where 218 lives (playbooks/
   fixed-overlay-occlusion.md, "Computing a clear scroll target hides the
   at-rest bug"). Every case below asserts `window.scrollY === 0` immediately
   before measuring, and never calls scrollTo/scrollIntoViewIfNeeded, so a
   test that silently drifted into scrolling territory would fail loudly
   instead of passing vacuously.

   This test proves, against a REAL render (not source reading — a stale
   MINIFIED sheet is the trap item 136 fell into, and the one this suite's
   fixture-routing + waitForCss guard against):
   (1)-(3) at 360x780 / 768x900 / 1280x900, AT REST (`scrollY === 0`,
       asserted, never scrolled), the `garden_cta` anchor's bounding rect
       does NOT intersect `.app-footer`'s bounding rect;
   (4) same, 360x780 DARK (`localStorage.theme = 'dark'` via addInitScript on
       a fresh page, `data-theme="dark"` asserted before measuring);
   (5) HIT TEST, all four cases above: `document.elementFromPoint()` at the
       CTA's centre AND at 75% of its height (its "lower band") returns the
       CTA anchor itself or a descendant of it (walked via
       `closest('a[href*="plan.html"]')`) — never `.app-footer` or a footer
       child. This is strictly stronger than the geometry check: a rect can
       fail to "intersect" by sub-pixel rounding while the actual paint order
       still lets the footer steal the click, which is the failure mode that
       matters (the user taps and nothing happens), not the rect algebra;
   (6) POSITIVE CONTROL, its own isolated page (so it cannot contaminate the
       real assertions): at 360x780, `.app.pool-detail-view .app-footer`'s
       `position: static` is mutated back to `fixed` in-page — i.e. 218's fix
       is undone while 217's clearance stays exactly as it is on `main`
       today (`padding-bottom: 0` on this view, restored to the pre-218
       state by re-applying `position: fixed`) — and the SAME at-rest
       measurement + hit test MUST report intersection/footer-hit. A check
       that cannot go red is not evidence of health;
   (7) no unexpected page/console errors on any measured page.

   Fixture-routed (unpkg React/ReactDOM/Babel vendored from node_modules,
   `icons.llamao.fi` aborted, the snapshot JSON route 404'd to force the live
   path, `https://yields.llama.fi/pools` fulfilled with a one-pool fixture) —
   the house pattern copied verbatim from test_footer_occlusion.js/
   test_earnings_dedup.js/test_northstar_cta_fires.js. Browser-originated
   external HTTPS is blocked in this sandbox (NORTH_STAR.md 2026-07-12).

   Run: node test_cta_at_rest_occlusion.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8873; // distinct from other test_* files (8791-8872 taken; 8872 is the prior max, test_footer_occlusion.js)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — same id used by test_footer_occlusion.js/test_earnings_dedup.js
// /test_mobile_cta_clip.js so the fixture stays byte-stable regardless of
// snapshot regeneration cadence; verified present in the snapshot before the
// test runs.
const POOL = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  project: 'lido', symbol: 'STETH', chain: 'Ethereum',
  tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [POOL] });

const CTA_SELECTOR = 'a[href*="plan.html"][href*="src=pool"]'; // the hero garden_cta anchor, same selector test_footer_occlusion.js's case (5) uses

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

// The prod sheet (pool-detail-styles.min.css) is injected asynchronously by
// home.html's addCSS (media='print' -> onload media='all'). Wait until it has
// actually applied before measuring geometry, same proxy signal
// test_footer_occlusion.js/test_mobile_cta_clip.js use: .pool-action-card is
// `display:flex` only once the sheet is live (a plain div is `block` before).
async function waitForCss(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.pool-action-card');
    if (!el) return false;
    return getComputedStyle(el).display === 'flex';
  }, { timeout: 15000 });
}

// Rect intersection, same algebra test_footer_occlusion.js's case (5) uses.
function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

// Core AT-REST measurement: asserts scrollY === 0 (never scrolls — that is
// the entire point of this test, per playbooks/fixed-overlay-occlusion.md's
// "computing a clear scroll target hides the at-rest bug"), then returns the
// CTA's and footer's bounding boxes and whether they intersect.
async function measureAtRest(page, label) {
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY !== 0) {
    throw new Error(`${label}: measureAtRest called with window.scrollY=${scrollY}, expected 0 — this test must never scroll before measuring`);
  }
  const ctaBox = await page.locator(CTA_SELECTOR).first().boundingBox();
  const footerBox = await page.locator('.app-footer').first().boundingBox();
  if (!ctaBox) throw new Error(`${label}: garden_cta anchor (${CTA_SELECTOR}) has no bounding box`);
  if (!footerBox) throw new Error(`${label}: .app-footer has no bounding box`);
  const occluded = rectsIntersect(ctaBox, footerBox);
  return { ctaBox, footerBox, occluded };
}

async function assertNoOcclusion(page, label) {
  const { ctaBox, footerBox, occluded } = await measureAtRest(page, label);
  if (occluded) {
    throw new Error(`${label}: garden_cta rect intersects .app-footer rect at rest — cta=${JSON.stringify(ctaBox)} footer=${JSON.stringify(footerBox)}`);
  }
  return { ctaBox, footerBox };
}

// Hit test: elementFromPoint at the CTA's centre and at 75% of its height
// (its "lower band" — where a real thumb/cursor is most likely to land on a
// button this short), walked via closest('a[href*="plan.html"]') so a
// descendant (icon/span) inside the anchor still counts as a hit. Returns
// tag+class of whatever was actually hit, for the failure message, and
// whether it resolved to the footer instead.
async function hitTestCta(page, label) {
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY !== 0) {
    throw new Error(`${label}: hitTestCta called with window.scrollY=${scrollY}, expected 0 — this test must never scroll before measuring`);
  }
  const result = await page.evaluate((sel) => {
    const cta = document.querySelector(sel);
    if (!cta) return { error: 'cta not found' };
    const rect = cta.getBoundingClientRect();
    const points = {
      centre: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      lowerBand: { x: rect.x + rect.width / 2, y: rect.y + rect.height * 0.75 }
    };
    const out = {};
    for (const [name, pt] of Object.entries(points)) {
      const el = document.elementFromPoint(pt.x, pt.y);
      const closestCta = el ? el.closest(sel) : null;
      const isCta = !!(el && (el === cta || closestCta === cta));
      const closestFooter = el ? el.closest('.app-footer') : null;
      out[name] = {
        tag: el ? el.tagName : null,
        className: el && typeof el.className === 'string' ? el.className : (el ? String(el.className) : ''),
        isCta,
        isFooter: !!closestFooter
      };
    }
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, out };
  }, CTA_SELECTOR);

  if (result.error) throw new Error(`${label}: ${result.error}`);
  for (const [name, hit] of Object.entries(result.out)) {
    if (hit.isFooter || !hit.isCta) {
      throw new Error(`${label}: hit test at "${name}" did not resolve to garden_cta — got <${hit.tag} class="${hit.className}"> (isFooter=${hit.isFooter})`);
    }
  }
  return result;
}

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL.pool)) {
    throw new Error(`POOL.pool ${POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const poolUrl = `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(POOL.pool)}`;
  const measured = {};

  try {
    // --- Real-page assertions (1)-(3), (5a)-(5c): one page reused across
    // viewports, same pattern as test_footer_occlusion.js. ---
    const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
        pageErrors.push('console.error: ' + m.text());
    });
    await routeFixtures(page);

    await test('360px: pool-detail renders with no page errors', async () => {
      await page.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(page);
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });

    await test('(1) 360x780 at rest: garden_cta rect does NOT intersect .app-footer rect', async () => {
      measured['360'] = await assertNoOcclusion(page, '360x780');
    });

    await test('(5a) 360x780 at rest: hit test at CTA centre and lower band returns garden_cta', async () => {
      await hitTestCta(page, '360x780');
    });

    await test('(2) 768x900 at rest: garden_cta rect does NOT intersect .app-footer rect', async () => {
      await page.setViewportSize({ width: 768, height: 900 });
      await page.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(page);
      measured['768'] = await assertNoOcclusion(page, '768x900');
    });

    await test('(5b) 768x900 at rest: hit test at CTA centre and lower band returns garden_cta', async () => {
      await hitTestCta(page, '768x900');
    });

    await test('(3) 1280x900 at rest: garden_cta rect does NOT intersect .app-footer rect', async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(page);
      measured['1280'] = await assertNoOcclusion(page, '1280x900');
    });

    await test('(5c) 1280x900 at rest: hit test at CTA centre and lower band returns garden_cta', async () => {
      await hitTestCta(page, '1280x900');
    });

    await test('no unexpected page/console errors (real page)', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });

    // --- (4) Dark-mode assertion: fresh page so localStorage theme is set
    // before first paint (the pattern test_footer_occlusion.js uses). ---
    const darkPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const darkErrors = [];
    darkPage.on('pageerror', (e) => darkErrors.push('pageerror: ' + e.message));
    darkPage.on('console', (m) => {
      if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
        darkErrors.push('console.error: ' + m.text());
    });
    await darkPage.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await routeFixtures(darkPage);

    await test('(4) 360x780 dark at rest: garden_cta rect does NOT intersect .app-footer rect', async () => {
      await darkPage.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await darkPage.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(darkPage);
      const theme = await darkPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (theme !== 'dark') throw new Error(`expected data-theme="dark", got ${theme}`);
      measured.dark360 = await assertNoOcclusion(darkPage, '360x780 dark');
    });

    await test('(5d) 360x780 dark at rest: hit test at CTA centre and lower band returns garden_cta', async () => {
      await hitTestCta(darkPage, '360x780 dark');
    });

    await test('no unexpected page/console errors (dark page)', async () => {
      if (darkErrors.length) throw new Error(darkErrors.join('\n    '));
    });
    await darkPage.close();

    // --- (6) Positive control / self-defeat, in its own isolated page so it
    // cannot contaminate the real assertions above. Mutates 218's fix away
    // (re-applies `position: fixed` to the footer on this view) while
    // leaving 217's clearance exactly as the fixed code has it
    // (`padding-bottom: 0` on `.app.pool-detail-view`, since 218 removed the
    // vestigial 80px on this view) — i.e. it reproduces "218 undone, 217's
    // in-place fix still applied", the state this test exists to catch. ---
    const controlPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    await routeFixtures(controlPage);
    await test('(6) positive control: with the fix mutated away in-page, at-rest occlusion IS reported (proves the check can fail)', async () => {
      await controlPage.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await controlPage.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(controlPage);
      // 225 round 3c: the recomposed hero raised the at-rest CTA well above
      // the old bottom band (y≈493 at 360x780 vs the footer's 721), so a
      // bottom-pinned footer no longer reaches it and the control stopped
      // reproducing. The mutation now pins the footer over the CTA's own
      // at-rest region — same intent (prove the occlusion check CAN fail),
      // stronger fault injection.
      await controlPage.addStyleTag({ content: '.app.pool-detail-view .app-footer{position:fixed !important;top:0;bottom:0;left:0;right:0;height:auto !important}' });
      await controlPage.waitForTimeout(100);

      const scrollY = await controlPage.evaluate(() => window.scrollY);
      if (scrollY !== 0) throw new Error(`positive control: window.scrollY=${scrollY}, expected 0`);

      const ctaBox = await controlPage.locator(CTA_SELECTOR).first().boundingBox();
      const footerBox = await controlPage.locator('.app-footer').first().boundingBox();
      if (!ctaBox) throw new Error('positive control: garden_cta anchor has no bounding box');
      if (!footerBox) throw new Error('positive control: .app-footer has no bounding box');
      const occluded = rectsIntersect(ctaBox, footerBox);

      let footerHit = false;
      try {
        await hitTestCta(controlPage, '360x780 control');
      } catch (e) {
        footerHit = true; // hitTestCta throws precisely when the footer (or a non-CTA element) is hit
      }

      if (!occluded && !footerHit) {
        throw new Error(`positive control failed to reproduce occlusion — cta=${JSON.stringify(ctaBox)} footer=${JSON.stringify(footerBox)} (occluded=${occluded}, footerHit=${footerHit}); the check would never fail and is not evidence of health`);
      }
    });
    await controlPage.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log('measured (at-rest geometry, scrollY=0, px):', JSON.stringify(measured, null, 2));
  console.log(`test_cta_at_rest_occlusion.js: ${passed}/${total} tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
