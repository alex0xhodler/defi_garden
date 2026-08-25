/* Rendered Playwright test for backlog 220 — the landing route (bare `/`)
   never inherited the shared footer clearance, so the OPAQUE, `position:
   fixed` `.app-footer` (style.css:2513-2524) permanently occludes its last
   content, both at rest and at true bottom of scroll.

   Root cause (verified on origin/main @ d7c9b79729, BEFORE this run's fix,
   768x780): `landing.js:244` gives the landing root `<div>` `className:
   'landing-app'`, and `landing.js:356` renders the shared `e('footer',
   { className: 'app-footer' }, ...)` inside it — so the landing route gets
   the fixed footer. `.app`'s own clearance (`padding-bottom: 80px`,
   style.css:849-853, "Space for footer") is class-scoped to `.app`;
   `grep -n "\.landing-app" style.css` returns zero matches, so `.landing-app`
   never inherited it. Measured this run, unmodified, 768x780:
     AT REST (scrollY=0): "Live DefiLlama data" trust-rail text at
       rect{x:449.7,y:760.5,w:110.9,h:18}, footer at rect{x:0,y:722,w:768,
       h:58} — fully covered, elementFromPoint at the text's lower band
       resolved to <footer class="app-footer">.
     TRUE BOTTOM OF SCROLL (scrollTop 100 + innerHeight 780 = 880 =
       scrollHeight, confirmed reached): hero-body paragraph at
       rect{x:24,y:704,w:254.3,h:36}, same footer rect — half covered,
       hit-test resolved to the footer.
   Both match spec 220's quoted findings and specs/219-notes.md §2(c) exactly
   — this is item 179's class, still live per 219's BACKLOG row: fixed once
   on bare `/` (179), never ported, paid for again on pool-detail 20 days
   later (217/218). This is now the 220 ticket for the DEFAULT surface.

   The fix (landing-styles.css, directly below `.landing-app`'s own block):
   clearance alone cannot help — finding (1) is a MID-DOCUMENT overlap at
   scroll 0, not an end-of-document one, so no padding value moves it (the
   same argument pool-detail-styles.css:1080-1112 already records for item
   218). REUSES 218's shipped, verifier-passed pattern instead of inventing a
   new one: the footer joins normal document flow on this view only.
   `.landing-app` is ALREADY `display: flex; flex-direction: column;
   min-height: 100vh` (landing-styles.css:4-11), so `margin-top: auto` on the
   now-in-flow footer is the same flex sticky-footer idiom 218 used — no new
   layout mode, no new token, no new value, no new class:
     .landing-app .app-footer { position: static; margin-top: auto; }
   Unlike 218, no companion `padding-bottom: 0` override is needed —
   `.landing-app` never carried a `padding-bottom` in the first place (218's
   own view had 217's restored 80px to cancel back to 0; this route never had
   any clearance to begin with, per the root-cause paragraph above).

   This test proves, against a REAL render (not source reading — a stale
   asset is the trap item 136/061 fell into, though landing-styles.css is
   loaded RAW, not minified: `home.html:169` — `addCSS('landing-styles.css',
   true)` — and landing-styles.css is absent from minify-assets.js's
   CSS_FILES list, so there is no `.min` twin for this file to go stale):
   (1)-(4) AT REST (scrollY=0) at 360x780/768x780/1280x780/768x780-dark: the
       item-(1) victim ("Live DefiLlama data" trust text) and the last
       `.landing-trust-section` descendant do NOT intersect `.app-footer`'s
       bounding box;
   (5)-(8) same four configurations, scrolled to the TRUE bottom (looped,
       arrival asserted — a silently-unscrolled test would pass vacuously):
       no content element intersects the footer;
   (9)-(12) HIT TEST, not paint-test, all four configurations: elementFromPoint
       at the item-(1) and item-(2) victims' lower band resolves to the
       content element (or a `.landing-main` descendant), never `.app-footer`
       or a footer descendant;
   (13)-(16) the footer is still present, non-zero-sized, and its two hub
       links (`/tokens`, `/chains`) are hit-testable at all four
       configurations — the fix must not "fix" occlusion by hiding the
       footer;
   (17) POSITIVE CONTROL, its own isolated page (so it cannot contaminate the
       real assertions): `.landing-app .app-footer` is forced back to
       `position: fixed !important; bottom: 0 !important` in-page at 768x780,
       and the SAME at-rest measurement DOES report occlusion — a check that
       cannot fail is not a check (playbooks/derived-number-rails.md Step 0b);
   (18) no unexpected page/console errors, using test_landing.js's own
       IGNORABLE_ERROR_PATTERN allow-list.

   Fixture-routed the same way test_landing.js drives the landing route
   (icons.llamao.fi aborted, a stale pools-snapshot forces the live path,
   yields.llama.fi fulfilled) — the landing route itself renders no pool
   data (grep-verified: landing.js contains no `fetch(`), but home.html's
   shared boot path preconnects to yields.llama.fi, so the same routing
   keeps the run hermetic exactly as test_landing.js's own comment explains.
   React/ReactDOM/translations are loaded from LOCAL files by home.html
   (`./react.production.min.js` etc, static `defer` tags) — no unpkg
   routing needed, unlike test_footer_occlusion.js's pool-detail page.
   Browser-originated external HTTPS is blocked in this sandbox
   (NORTH_STAR.md 2026-07-12 standing decision).

   Run: node test_landing_footer_occlusion.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8875; // distinct from other test_* files (8791-8874 taken; 8874/8975 are test_audit_occlusion_lens.js's, the prior max)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
// Same allow-list test_landing.js uses (its own comment: matched against the
// failing resource's URL, msg.location().url, not msg.text() — Chromium's
// "Failed to load resource" text never includes the URL itself).
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

// Same routing test_landing.js's preparePage() uses: decorative icon host
// aborted, a deliberately-stale snapshot forces the live-fetch fallback, and
// the live fetch itself is fulfilled with an empty pool list (the landing
// route renders no pool data itself, but home.html's shared boot path
// preconnects to yields.llama.fi, and staying hermetic costs nothing here).
async function routeFixtures(page) {
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());
  await page.route('**/data/pools-snapshot*', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}'
  }));
  await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: [] })
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

// Scrolls to the true bottom of the document, looping window.scrollTo a
// handful of times (content can still be settling right after mount) with
// short waits, then ASSERTS the bottom was actually reached — a test that
// silently failed to scroll would pass its geometry assertion vacuously
// (technique verbatim from test_footer_occlusion.js's scrollToTrueBottom()).
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

// Locates the bottom-most content victim before the footer: the CTA hint / CTA button in hero spotlight.
async function getVictimBoxes(page) {
  return page.evaluate(() => {
    const victim = document.querySelector('.landing-card-hint') || document.querySelector('[data-testid="landing-intent-cta"]');
    const bottomSection = document.querySelector('.landing-hero-spotlight') || document.querySelector('.landing-main');
    let lastDescendant = null;
    if (bottomSection) {
      const kids = bottomSection.querySelectorAll('*');
      lastDescendant = kids.length ? kids[kids.length - 1] : bottomSection;
    }
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      victimFound: !!victim,
      victimRect: rectOf(victim),
      lastDescendantFound: !!lastDescendant,
      lastDescendantRect: rectOf(lastDescendant)
    };
  });
}

// Item-(2) victim: the hero-spotlight subhead / hero-body paragraph.
async function getHeroBodyBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.landing-spotlight-subhead') || document.querySelector('.landing-hero-body');
    if (!el) return { found: false, rect: null };
    const r = el.getBoundingClientRect();
    return { found: true, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  });
}

async function getFooterBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.app-footer');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

// Hit test at a rect's "lower band" (75% of its height) — where a real
// thumb/cursor is most likely to land — walked via closest('.landing-main')
// so a descendant still counts as a content hit. Returns whether the hit
// resolved to the footer (the failure mode that matters: the footer steals
// the tap, not just paints over the text).
//
// `document.elementFromPoint()` returns null for a point outside the
// viewport's own visible bounds (MDN: "if either argument is negative, or
// exceeds the interior width/height, the method returns null") — which
// happens legitimately here: the hero/trust content is taller than a 780px
// viewport at several widths, so at scroll 0 the trust rail can sit BELOW
// the fold (not yet visible), and at true-bottom-of-scroll the hero body can
// sit ABOVE it (already scrolled past). Neither case is occlusion — nothing
// is painted over anything because neither element is on screen at all — so
// `offscreen: true` is reported distinctly from a real hit, and the caller
// treats it as "not applicable" rather than a failure. The independent
// rect-intersection check (assertNoOcclusion, run first) still catches a
// genuine overlap regardless of on-screen-ness.
async function hitTestLowerBand(page, rect) {
  return page.evaluate((r) => {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height * 0.75;
    if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) {
      return { offscreen: true, tag: null, className: '', isFooter: false, isContent: false };
    }
    const el = document.elementFromPoint(cx, cy);
    const isFooter = !!(el && el.closest('.app-footer'));
    const isContent = !!(el && (el.closest('.landing-main') || el.closest('.landing-search-section') || el.closest('.landing-hero-spotlight')));
    return {
      offscreen: false,
      tag: el ? el.tagName : null,
      className: el && typeof el.className === 'string' ? el.className : String(el && el.className),
      isFooter, isContent
    };
  }, rect);
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

// Core measurement, reused for both at-rest and bottom-of-scroll cases: no
// content victim intersects the footer, and the lower-band hit test never
// resolves to the footer.
async function assertNoOcclusion(page, label) {
  const footerBox = await getFooterBox(page);
  if (!footerBox) throw new Error(`${label}: .app-footer has no bounding box`);

  const victims = await getVictimBoxes(page);
  if (!victims.victimFound) throw new Error(`${label}: "Live DefiLlama data" trust-rail victim not found`);
  if (!victims.victimRect) throw new Error(`${label}: victim has no bounding box`);
  if (rectsIntersect(victims.victimRect, footerBox)) {
    throw new Error(`${label}: trust-rail victim rect intersects .app-footer — victim=${JSON.stringify(victims.victimRect)} footer=${JSON.stringify(footerBox)}`);
  }
  if (victims.lastDescendantFound && victims.lastDescendantRect) {
    if (rectsIntersect(victims.lastDescendantRect, footerBox)) {
      throw new Error(`${label}: last .landing-trust-section descendant intersects .app-footer — rect=${JSON.stringify(victims.lastDescendantRect)} footer=${JSON.stringify(footerBox)}`);
    }
  }

  const heroBody = await getHeroBodyBox(page);
  if (heroBody.found && rectsIntersect(heroBody.rect, footerBox)) {
    throw new Error(`${label}: hero-body paragraph intersects .app-footer — hero=${JSON.stringify(heroBody.rect)} footer=${JSON.stringify(footerBox)}`);
  }

  const victimHit = await hitTestLowerBand(page, victims.victimRect);
  if (!victimHit.offscreen && (victimHit.isFooter || !victimHit.isContent)) {
    throw new Error(`${label}: hit test at trust-rail victim's lower band resolved to <${victimHit.tag} class="${victimHit.className}"> (isFooter=${victimHit.isFooter}), expected a .landing-main/.landing-trust-section descendant`);
  }

  if (heroBody.found) {
    const heroHit = await hitTestLowerBand(page, heroBody.rect);
    if (!heroHit.offscreen && (heroHit.isFooter || !heroHit.isContent)) {
      throw new Error(`${label}: hit test at hero-body's lower band resolved to <${heroHit.tag} class="${heroHit.className}"> (isFooter=${heroHit.isFooter}), expected a .landing-main descendant`);
    }
  }

  return { footerBox, victimRect: victims.victimRect, heroBodyRect: heroBody.rect };
}

const CONFIGS = [
  { label: '360x780', width: 360, height: 780, dark: false },
  { label: '768x780', width: 768, height: 780, dark: false },
  { label: '1280x780', width: 1280, height: 780, dark: false },
  { label: '768x780 dark', width: 768, height: 780, dark: true }
];

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const url = `http://localhost:${PORT}/`;
  const measured = {};

  try {
    for (const cfg of CONFIGS) {
      const page = await browser.newPage({ viewport: { width: cfg.width, height: cfg.height } });
      const errors = makeErrorSink(page);
      if (cfg.dark) await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
      await routeFixtures(page);

      await test(`${cfg.label}: landing renders with no page errors`, async () => {
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.landing-app .app-footer', { timeout: 15000 });
        if (cfg.dark) {
          const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
          if (theme !== 'dark') throw new Error(`expected data-theme="dark", got ${theme}`);
        }
        if (errors.length) throw new Error(errors.join('\n    '));
      });

      await test(`(1-4) ${cfg.label} AT REST (scrollY=0): no content victim intersects .app-footer, hit test resolves to content`, async () => {
        const scrollY = await page.evaluate(() => window.scrollY);
        if (scrollY !== 0) throw new Error(`expected scrollY===0 at rest, got ${scrollY}`);
        measured[cfg.label + ' at-rest'] = await assertNoOcclusion(page, `${cfg.label} at-rest`);
      });

      await test(`(5-8) ${cfg.label} TRUE BOTTOM OF SCROLL: no content victim intersects .app-footer, hit test resolves to content`, async () => {
        await scrollToTrueBottom(page);
        measured[cfg.label + ' bottom-of-scroll'] = await assertNoOcclusion(page, `${cfg.label} bottom-of-scroll`);
      });

      await test(`(13-16) ${cfg.label}: .app-footer present, visible, hub links hit-testable`, async () => {
        // Scrolled to the true bottom explicitly (not relying on the prior
        // step's leftover scroll position): once the fix takes the footer
        // out of the fixed layer, it is only guaranteed to be ON SCREEN once
        // the page is scrolled far enough — on a viewport shorter than the
        // page content (e.g. 360x780, content 1062px tall) the in-flow
        // footer legitimately sits below the fold at scroll 0, exactly the
        // ordinary end-of-document footer behaviour every static page has.
        // That is not the "hiding the footer" failure mode criterion 4
        // guards against (display:none / zero size / detached from DOM) —
        // it is proven present+usable at the one scroll position every user
        // who keeps reading will always reach.
        await scrollToTrueBottom(page);
        measured[cfg.label + ' footer'] = await assertFooterPresentAndVisible(page, cfg.label);
      });

      await test(`(18) ${cfg.label}: no unexpected page/console errors`, async () => {
        if (errors.length) throw new Error(errors.join('\n    '));
      });

      await page.close();
    }

    // --- (17) POSITIVE CONTROL, its own isolated page/context so it cannot
    // contaminate the real assertions above. Re-applies the pre-fix state:
    // `.landing-app .app-footer` forced back to a fixed, bottom-anchored
    // overlay — the SAME measurement technique assertNoOcclusion() uses, but
    // asserting the inverse (occlusion IS reported), proving the check can
    // actually go red. ---
    const controlPage = await browser.newPage({ viewport: { width: 768, height: 780 } });
    await routeFixtures(controlPage);
    await test('(17) positive control: with the fix mutated away in-page, at-rest occlusion IS reported (proves the check can fail)', async () => {
      await controlPage.goto(url, { waitUntil: 'load', timeout: 20000 });
      await controlPage.waitForSelector('.landing-app .app-footer', { timeout: 15000 });
      await controlPage.addStyleTag({ content: '.landing-app .app-footer{position:fixed !important;top:0 !important;bottom:0 !important;left:0;right:0;margin-top:0 !important;z-index:9999 !important}' });
      await controlPage.waitForTimeout(100);

      const scrollY = await controlPage.evaluate(() => window.scrollY);
      if (scrollY !== 0) throw new Error(`positive control: window.scrollY=${scrollY}, expected 0`);

      const footerBox = await getFooterBox(controlPage);
      if (!footerBox) throw new Error('positive control: missing footer bounding box');

      const targetRect = await controlPage.evaluate(() => {
        const el = document.querySelector('.landing-spotlight-subhead') || document.querySelector('.landing-spotlight-title') || document.querySelector('.landing-hero-body');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      if (!targetRect) throw new Error('positive control: missing target element bounding box');

      const occludedByRect = rectsIntersect(targetRect, footerBox);
      const hit = await hitTestLowerBand(controlPage, targetRect);
      const occludedByHit = hit.isFooter;

      if (!occludedByRect && !occludedByHit) {
        throw new Error(`positive control failed to reproduce occlusion — target=${JSON.stringify(targetRect)} footer=${JSON.stringify(footerBox)} (rectIntersect=${occludedByRect}, hitFooter=${occludedByHit}); the check would never fail and is not evidence of health`);
      }
    });
    await controlPage.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log('measured (px):', JSON.stringify(measured, null, 2));
  console.log(`test_landing_footer_occlusion.js: ${passed}/${total} tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
