/* Rendered Playwright test for backlog 217 — pool-detail cancels the fixed
   footer's clearance, so the bottom band of content is permanently occluded.

   Root cause (verified on origin/main @ 3584d54200): `.app { padding-bottom:
   80px; ... }` (style.css:849-853, "Space for footer") is the app-wide
   clearance that lets the OPAQUE, `position: fixed` `.app-footer`
   (style.css:2513-2524) coexist with content. `pool-detail-styles.css:1066-
   1068` used to read `.app.pool-detail-view { padding: 0; }`, which cancelled
   that clearance on exactly this one view. `.pool-detail-container`'s own
   16px bottom padding (pool-detail-styles.css:682-684 at <=768px) does not
   come close to covering a 58-69px footer, so at maximum scroll the last
   slice of page content sat behind the footer and could never be scrolled
   into view. Human report: iPhone 1170x2532 dark, morpho-blue/SIRLOINUSDC/
   Base, the hero card's rate-steadiness sentence sliced mid-word by the
   footer paint.

   Measured this run (spec 217's Evidence section, 390x844 dark, TRUE bottom
   of scroll):
     footer.top = 786 (height 58, occupies 786-844)
     .pool-detail-container.bottom = 802   <-- 16px BELOW the footer's top
     .app.pool-detail-view padding-bottom = 0px
     .app.pool-detail-view rect.bottom = 844 (flush with viewport, zero
       clearance)
   Footer heights across the design bar: 58px at <=768px (the
   `@media (max-width:768px)` `.app-footer` padding rule, style.css:2767-
   2773), 69px at 1280px.

   The fix (pool-detail-styles.css:1065-1072): delete the `padding: 0`
   canceller and leave a comment explaining why the clearance must survive on
   this view. No new value/token — `.app`'s ONLY padding declaration in the
   whole design system is `style.css:852` (grep-verified: `.app {` appears
   only at style.css:849 and style.css:5227, the latter a `transition` rule
   with no padding), so "stop cancelling" is strictly equivalent to
   "restore 80px" with zero duplication. `.app.pool-detail-view .container
   { max-width: none; padding: 0; }` directly below is untouched — it does
   real work unrelated to this defect.

   This test proves, against a REAL render (not source reading, per the
   2026-07-11 standing decision that rendered layout defects need rendered
   proof — a source-level assertion that `padding: 0` is gone would not catch
   a stale MINIFIED sheet, which is the artifact the product actually serves):
   (1)-(4) at 360/768/1280/360-dark, scrolled to the TRUE bottom of the
       document (verified reached, not assumed), `.pool-detail-container`'s
       bounding-box bottom is <= `.app-footer`'s bounding-box top (<=1px
       sub-pixel tolerance);
   (5) the `garden_cta` anchor can be scrolled to a position clear of the
       footer at 360px (BACKLOG row 217's "worth checking, not yet proven" —
       this proves it; see 217-notes.md for the recorded finding);
   (6) POSITIVE CONTROL: with the fix mutated away in-page, in its own
       isolated page so it cannot contaminate the real assertions, the same
       bottom-of-scroll measurement DOES report occlusion — proving the check
       can fail, not just always pass (playbooks/derived-number-rails.md Step
       0b). UPDATED for item 218: this control originally re-applied
       `padding-bottom: 0 !important` to `.app.pool-detail-view` alone, which
       reproduced occlusion when `.app-footer` was still an opaque
       `position: fixed` overlay (cancelling clearance exposes content to a
       fixed overlay). Item 218 changed the mechanism on this view: the
       footer now joins document flow (`position: static`), and 218's own
       `.app.pool-detail-view { padding-bottom: 0 }` is a real, permanent part
       of the fix (the 80px clearance is vestigial once nothing is fixed
       above it). Re-applying JUST that same padding override therefore no
       longer removes any actual protection — there is no fixed overlay left
       for it to expose the page to — so the old control would pass while
       measuring nothing (worse than a control that can't go red: it looks
       like it's still testing something). The control now injects CSS that
       reproduces the FULL pre-217/pre-218 state — footer restored to
       `position: fixed` AND clearance re-cancelled — which is the only
       combination that still reproduces this test's defect class;
   (7) implicitly covered by every assertion above: the page is navigated via
       `home.html?pool=...` in analytics mode, which injects the MINIFIED
       `pool-detail-styles.min.css` (home.html:167), not the raw sheet — a
       stale min asset would fail this test even if the raw source were
       fixed (the exact trap test_mobile_cta_clip.js's header documents for
       item 136);
   (8) no unexpected page/console errors.

   Fixture-routed (unpkg React/ReactDOM/Babel vendored from node_modules,
   `icons.llamao.fi` aborted, the snapshot JSON route 404'd to force the
   live path, `https://yields.llama.fi/pools` fulfilled with a one-pool
   fixture) — the house pattern from test_earnings_dedup.js/
   test_northstar_cta_fires.js. Browser-originated external HTTPS is blocked
   in this sandbox (NORTH_STAR.md 2026-07-12 standing decision).

   Run: node test_footer_occlusion.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8872; // distinct from other test_* files (8791-8871 taken; 8871 is the prior max)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — same id used by test_earnings_dedup.js/test_mobile_cta_clip.js
// so the fixture stays byte-stable regardless of snapshot regeneration
// cadence; verified present in the snapshot before the test runs.
const POOL = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  project: 'lido', symbol: 'STETH', chain: 'Ethereum',
  tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [POOL] });

let passed = 0;
async function test(name, fn) {
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
// test_mobile_cta_clip.js uses: .pool-action-card is `display:flex` only once
// the sheet is live (a plain div is `block` before that).
async function waitForCss(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.pool-action-card');
    if (!el) return false;
    return getComputedStyle(el).display === 'flex';
  }, { timeout: 15000 });
}

// Scrolls to the true bottom of the document, looping window.scrollTo a
// handful of times (content can still be growing/settling right after
// mount) with short waits, then ASSERTS the bottom was actually reached —
// a test that silently failed to scroll would pass its geometry assertion
// vacuously.
async function scrollToTrueBottom(page) {
  let atBottom = false;
  for (let i = 0; i < 8; i++) {
    atBottom = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const doc = document.documentElement;
      // Within 1px of true bottom counts as "reached" (sub-pixel rounding).
      return Math.abs((doc.scrollTop + window.innerHeight) - doc.scrollHeight) <= 1;
    });
    if (atBottom) break;
    await page.waitForTimeout(150);
  }
  if (!atBottom) throw new Error('scrollToTrueBottom: never reached the true bottom of the document after 8 attempts');
  return atBottom;
}

// Core occlusion measurement: after scrolling to the true bottom, is
// .pool-detail-container's bottom edge behind (below) .app-footer's top edge?
// Returns { containerBottom, footerTop, occluded } for the caller to assert
// on positively (real page) or negatively (positive control).
async function measureOcclusion(page) {
  const reached = await scrollToTrueBottom(page);
  if (!reached) throw new Error('measureOcclusion: scroll did not reach the true bottom — geometry assertion would be vacuous');

  const containerBox = await page.locator('.pool-detail-container').first().boundingBox();
  const footerBox = await page.locator('.app-footer').first().boundingBox();
  if (!containerBox) throw new Error('measureOcclusion: .pool-detail-container has no bounding box');
  if (!footerBox) throw new Error('measureOcclusion: .app-footer has no bounding box');

  const containerBottom = containerBox.y + containerBox.height;
  const footerTop = footerBox.y;
  return { containerBottom, footerTop, occluded: containerBottom > footerTop + 1 };
}

async function assertNoOcclusion(page, label) {
  const { containerBottom, footerTop, occluded } = await measureOcclusion(page);
  if (occluded) {
    throw new Error(`${label}: content occluded — .pool-detail-container.bottom ${containerBottom} > .app-footer.top ${footerTop} (tolerance 1px)`);
  }
  return { containerBottom, footerTop };
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
    // --- Real-page assertions (1)-(5), (8): one page reused across viewports. ---
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

    await test('(1) 360px: scrolled to true bottom, .pool-detail-container is NOT occluded by .app-footer', async () => {
      measured['360'] = await assertNoOcclusion(page, '360px');
    });

    await test('(2) 768px: scrolled to true bottom, .pool-detail-container is NOT occluded by .app-footer', async () => {
      await page.setViewportSize({ width: 768, height: 900 });
      await page.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(page);
      measured['768'] = await assertNoOcclusion(page, '768px');
    });

    await test('(3) 1280px: scrolled to true bottom, .pool-detail-container is NOT occluded by .app-footer', async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(page);
      measured['1280'] = await assertNoOcclusion(page, '1280px');
    });

    await test('(5) 360px: garden_cta CTA can be scrolled clear of the footer', async () => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(page);

      const ctaCount = await page.locator('a[href*="plan.html"][href*="src=pool"]').count();
      if (ctaCount === 0) throw new Error('garden_cta anchor (a[href*="plan.html"][href*="src=pool"]) not found on the page');

      // The CTA lives near the TOP of the page (the hero action card), well
      // above the true bottom of scroll — so `scrollIntoViewIfNeeded()` is
      // the wrong tool here: the browser's native "is it in the viewport"
      // check does not know the fixed footer visually paints over the last
      // ~58px of that same viewport, so it can decide the element is
      // "already visible" (in-viewport-bounds) while it is in fact sitting
      // behind the footer, and leave scroll position unchanged. Instead,
      // explicitly compute a scroll position that clears the CTA's bottom
      // edge above the footer's top edge, then verify no intersection.
      const geometry = await page.evaluate(() => {
        const cta = document.querySelector('a[href*="plan.html"][href*="src=pool"]');
        const footer = document.querySelector('.app-footer');
        const ctaRect = cta.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        return {
          ctaDocTop: ctaRect.top + window.scrollY,
          ctaDocBottom: ctaRect.bottom + window.scrollY,
          ctaHeight: ctaRect.height,
          footerViewportTop: footerRect.top,
          maxScrollY: document.documentElement.scrollHeight - window.innerHeight
        };
      });
      // Scroll just far enough that the CTA's bottom edge sits at (or above)
      // the footer's top edge, with a small margin, clamped to the
      // document's actual scroll range.
      const targetScrollY = Math.max(0, Math.min(
        geometry.maxScrollY,
        geometry.ctaDocBottom - geometry.footerViewportTop + 4
      ));
      await page.evaluate((y) => window.scrollTo(0, y), targetScrollY);
      await page.waitForTimeout(150);

      const cta = page.locator('a[href*="plan.html"][href*="src=pool"]').first();
      const ctaBox = await cta.boundingBox();
      const footerBox = await page.locator('.app-footer').first().boundingBox();
      if (!ctaBox) throw new Error('garden_cta anchor has no bounding box after scrolling');
      if (!footerBox) throw new Error('.app-footer has no bounding box');

      const intersects = ctaBox.y < footerBox.y + footerBox.height &&
        ctaBox.y + ctaBox.height > footerBox.y &&
        ctaBox.x < footerBox.x + footerBox.width &&
        ctaBox.x + ctaBox.width > footerBox.x;
      if (intersects) {
        throw new Error(`garden_cta CTA rect intersects the footer rect at the computed clear scroll position (scrollY=${targetScrollY}, maxScrollY=${geometry.maxScrollY}) — cta=${JSON.stringify(ctaBox)} footer=${JSON.stringify(footerBox)}`);
      }
      measured.cta = { targetScrollY, maxScrollY: geometry.maxScrollY, ctaBox, footerBox };
    });

    await test('no unexpected page/console errors (real page)', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });

    // --- (4) Dark-mode assertion: fresh page so localStorage theme is set
    // before first paint (the pattern used elsewhere in the suite). ---
    const darkPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const darkErrors = [];
    darkPage.on('pageerror', (e) => darkErrors.push('pageerror: ' + e.message));
    darkPage.on('console', (m) => {
      if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
        darkErrors.push('console.error: ' + m.text());
    });
    await darkPage.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await routeFixtures(darkPage);

    await test('(4) 360px dark mode: scrolled to true bottom, .pool-detail-container is NOT occluded by .app-footer', async () => {
      await darkPage.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await darkPage.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(darkPage);
      const theme = await darkPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (theme !== 'dark') throw new Error(`expected data-theme="dark", got ${theme}`);
      measured.dark360 = await assertNoOcclusion(darkPage, '360px dark');
      if (darkErrors.length) throw new Error(darkErrors.join('\n    '));
    });
    await darkPage.close();

    // --- (6) Positive control / self-defeat, in its own isolated page/context
    // so it cannot contaminate the real assertions above. ---
    const controlPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    await routeFixtures(controlPage);
    await test('(6) positive control: with the fix mutated away in-page, occlusion IS reported (proves the check can fail)', async () => {
      await controlPage.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
      await controlPage.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await waitForCss(controlPage);
      // Re-cancel the clearance the fix restored, exactly the pre-fix rule —
      // UPDATED for item 218: once 218 puts `.app-footer` back in document
      // flow on this view (`position: static`), cancelling clearance alone
      // (`padding-bottom: 0 !important`) can no longer produce occlusion —
      // there is no fixed overlay left for the missing padding to expose the
      // page to. That control would pass while measuring nothing (worse than
      // a control that can't go red: it LOOKS like it's testing something).
      // The control now reproduces the FULL pre-217/pre-218 state — the
      // footer restored to a fixed overlay AND clearance cancelled — which is
      // the only combination that still reproduces this test's defect class.
      await controlPage.addStyleTag({ content: '.app.pool-detail-view .app-footer{position:fixed !important;bottom:0;left:0;right:0} .app.pool-detail-view{padding-bottom:0 !important}' });
      await controlPage.waitForTimeout(100);

      const { occluded, containerBottom, footerTop } = await measureOcclusion(controlPage);
      if (!occluded) {
        throw new Error(`positive control failed to reproduce occlusion — container.bottom ${containerBottom} <= footer.top ${footerTop} even with the clearance mutated away; the check would never fail and is not evidence of health`);
      }
    });
    await controlPage.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log('measured (bottom-of-scroll geometry, px):', JSON.stringify(measured, null, 2));
  console.log(`test_footer_occlusion.js: ${passed}/8 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
