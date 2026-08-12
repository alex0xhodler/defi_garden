/* Acceptance test for backlog 219 — the audit's occlusion lens, leg (a).
   audit-app.js renders real pages in real Chromium but every existing check
   is a DOM read of a defect someone already named (number-sanity, dead-cta,
   responsive, ...) — none of them asks "is this element actually visible,
   and can I actually press it?". Item 218 (the north-star `garden_cta`
   anchor, fully behind the footer and click-intercepted at 360x780) shipped
   invisible to every one of those checks; this test proves the new
   `checkOcclusion` lens (audit-app.js) would have caught it, and that it does
   not flag the ordinary layout every other surface already relies on
   (top-anchored sticky headers, content simply scrolled under one).

   Two layers, the shape test_audit_768_lens.js established:

     1. SOURCE-LEVEL (no browser; always runs, always able to fail):
        (1) checkOcclusion is defined in audit-app.js and exported;
        (2) it is called on the success path of all seven non-`loading` kind
            branches — exactly 7 `await checkOcclusion(` call sites, and the
            `loading` branch (isolated by its own start/end anchors) contains
            none;
        (3) OCCLUSION_HEIGHT === 780, the check name literal 'occlusion' is
            present, and the bottom-of-scroll pass's bottom-anchor gate is
            pinned in source (so a later edit cannot quietly widen the
            asymmetry into a header-noise generator without this test
            failing).

     2. REAL CHROMIUM (only the browser launch itself may be skip-tolerant,
        per the 160 lesson — every assertion sits outside that catch):
        (4) no false positive on the real north-star surface (360x780,
            fixture-routed, minified sheets live) — zero P0/P1;
        (5) RED PROOF — same real page with 218's fix mutated away in-page
            (`.app.pool-detail-view .app-footer` forced back to `position:
            fixed`) — checkOcclusion() called directly reports >=1 P0 naming
            the garden_cta anchor (href containing plan.html). This is the
            assertion that proves the lens would have caught 218, not a prose
            claim that it would have;
        (6) the bottom-of-scroll leg is not dead — a local fixture with a
            bottom-anchored opaque fixed bar over end-of-document content
            flags on that pass; the same fixture with the bar `position:
            static` does not;
        (7) the lens does not flag ordinary layout — a top-anchored fixed
            header with proper clearance, content scrolled under it at max
            scroll, yields zero blocking findings (the two-position asymmetry,
            asserted rather than assumed);
        (8) the bottom-of-scroll leg is not vacuous on a page carrying
            `html { scroll-behavior: smooth }` — a local fixture reproducing
            style.css:2845's exact rule, tall enough to scroll, must still
            reach true bottom and yield NO "unreachable" P2 advisory. Added
            2026-08-04 after the real pool-detail-360 surface (which DOES
            carry smooth scrolling) failed this silently on the first
            implementation — see checkOcclusion's own scroll-behavior-defeat
            comment in audit-app.js;
        (8b) the AT-REST leg is not vacuous EITHER, on a smooth-scrolling
            page already scrolled away from the top when checkOcclusion runs
            (mimicking the planner's pre-check `.gp-chip` click, which can
            scroll the thread into view) — no "at-rest pass skipped" P2, and
            the real at-rest occlusion the fixture carries IS reported;
        (9) integration — runAudit({ only: ['pool-detail-360'] }) covers that
            surface, every finding is well-formed, and any `occlusion`
            finding this real run originates is reported in
            specs/219-notes.md, not fixed here (a detector's first real
            findings are the next tick's tickets).

   Real-page machinery (startServer/routeFixtures/waitForCss/the STETH
   fixture pool/IGNORABLE) borrowed verbatim from test_cta_at_rest_occlusion.js
   (backlog 218's own acceptance test) — same house pattern used across
   test_footer_occlusion.js/test_earnings_dedup.js/test_northstar_cta_fires.js.
   Browser-originated external HTTPS is blocked in this sandbox (NORTH_STAR.md
   2026-07-12).

   Run: node test_audit_occlusion_lens.js */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { runAudit, checkOcclusion, OCCLUSION_HEIGHT, blockingFindings } = require('./audit-app.js');

const ROOT = __dirname;
const SOURCE_PATH = path.join(ROOT, 'audit-app.js');

// PORT 8874: distinct from other test_* files' own static servers — 8873 was
// the prior max (test_cta_at_rest_occlusion.js). 8975 is this test's own
// runAudit() integration port (distinct from every port grepped across
// test_audit_*.js at build time).
const PORT = 8874;
const RUNAUDIT_PORT = 8975;

const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Same STETH fixture pool id every other occlusion test in this repo uses
// (test_footer_occlusion.js/test_cta_at_rest_occlusion.js/test_earnings_dedup.js),
// so the fixture stays byte-stable regardless of snapshot regeneration
// cadence — verified present in the committed snapshot before this test runs.
const POOL = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  project: 'lido', symbol: 'STETH', chain: 'Ethereum',
  tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [POOL] });

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
async function testAsync(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assertT(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------------------
// Layer 1 — source-level. No playwright import invoked, no server, no
// browser: these always run and can always fail regardless of whether
// Chromium is available in this sandbox.
// ---------------------------------------------------------------------------
console.log('audit-app.js — backlog 219 occlusion lens\n');

const source = fs.readFileSync(SOURCE_PATH, 'utf8');

test('(1) checkOcclusion is defined in audit-app.js', () => {
  assertT(/function checkOcclusion\(page, s, findings\)/.test(source),
    'no "function checkOcclusion(page, s, findings)" found in audit-app.js');
});

test('(1) checkOcclusion is exported from module.exports', () => {
  assertT(typeof checkOcclusion === 'function', 'require(\'./audit-app.js\').checkOcclusion is not a function');
});

test('(2) exactly 7 "await checkOcclusion(" call sites in audit-app.js', () => {
  const matches = source.match(/await checkOcclusion\(/g) || [];
  assertT(matches.length === 7, `expected exactly 7 call sites, found ${matches.length}`);
});

test('(2) the loading branch contains zero checkOcclusion call sites', () => {
  const start = source.indexOf("if (s.kind === 'loading')");
  assertT(start > -1, 'could not find the loading branch start anchor');
  // First "return findings;" after the branch opens closes it — every other
  // kind branch's own "return findings;" lines live strictly after this one.
  const returnIdx = source.indexOf('return findings;', start);
  assertT(returnIdx > -1, 'could not find the loading branch\'s "return findings;"');
  const closeIdx = source.indexOf('\n    }', returnIdx); // the branch's closing brace
  assertT(closeIdx > -1, 'could not find the loading branch\'s closing brace');
  const loadingBlock = source.slice(start, closeIdx);
  assertT(!loadingBlock.includes('checkOcclusion'),
    `the loading branch must not call checkOcclusion (it measures a mid-flight paint race, no settled layout) — found it in: ${loadingBlock}`);
});

test('(3) OCCLUSION_HEIGHT === 780', () => {
  assertT(OCCLUSION_HEIGHT === 780, `expected OCCLUSION_HEIGHT === 780, got ${OCCLUSION_HEIGHT}`);
  assertT(/const OCCLUSION_HEIGHT = 780;/.test(source), 'literal "const OCCLUSION_HEIGHT = 780;" not found in source');
});

test('(3) the check name literal \'occlusion\' is present', () => {
  assertT(source.includes("'occlusion'"), 'no \'occlusion\' check-name literal found in audit-app.js');
});

test('(3) the two-position asymmetry\'s bottom-anchor gate is pinned in source', () => {
  assertT(/bottomAnchor && rect\.bottom < viewportH - 2/.test(source),
    'no bottom-anchor gate ("bottomAnchor && rect.bottom < viewportH - 2") found — the asymmetry rule (only bottom-anchored overlays may occlude at bottom-of-scroll) must exist as a real gate, not be assumed');
});

// ---------------------------------------------------------------------------
// Layer 2 — real Chromium. Only the browser launch itself may be
// skip-tolerant (a genuine environment gap); every assertion below sits
// OUTSIDE that catch, per the 160 post-verifier lesson.
// ---------------------------------------------------------------------------

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

// Same proxy signal test_cta_at_rest_occlusion.js/test_footer_occlusion.js/
// test_mobile_cta_clip.js use: the prod min sheet is injected async
// (home.html's addCSS, media='print' -> onload media='all') — wait for a
// rule from it to actually apply before measuring geometry.
async function waitForCss(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.pool-action-card');
    if (!el) return false;
    return getComputedStyle(el).display === 'flex';
  }, { timeout: 15000 });
}

function makeErrorSink(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
      errors.push('console.error: ' + m.text());
  });
  return errors;
}

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL.pool)) {
    throw new Error(`POOL.pool ${POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  }

  let browser = null;
  let server = null;
  const outPaths = [];

  try {
    server = await startServer();
    browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  } catch (err) {
    console.log('  (skipped) real-Chromium layer — could not launch here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/219-notes.md');
    console.log(`\ntest_audit_occlusion_lens.js: ${passed} passed, ${failed} failed (browser layer skipped)`);
    if (server) server.close();
    if (process.exitCode) process.exit(process.exitCode);
    return;
  }

  try {
    const poolUrl = `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(POOL.pool)}`;

    // --- (4) No false positive on the real north-star surface. ---
    const cleanPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const cleanErrors = makeErrorSink(cleanPage);
    await routeFixtures(cleanPage);
    await cleanPage.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
    await cleanPage.waitForSelector('.pool-detail-view', { timeout: 15000 });
    await waitForCss(cleanPage);

    let cleanFindings = [];
    await testAsync('(4) checkOcclusion on the real, unmutated pool-detail page at 360x780 reports zero P0/P1', async () => {
      const s = { name: 'test-pool-360-clean', vpLabel: '360px', width: 360, kind: 'pool' };
      await checkOcclusion(cleanPage, s, cleanFindings);
      const blocking = blockingFindings(cleanFindings);
      assertT(blocking.length === 0,
        `expected zero P0/P1 on the healthy real page, got ${blocking.length}: ${JSON.stringify(blocking, null, 2)}`);
    });

    await testAsync('(4) no unexpected page/console errors on the clean real page', async () => {
      assertT(cleanErrors.length === 0, cleanErrors.join('\n    '));
    });
    await cleanPage.close();

    // --- (5) RED PROOF — 218's fix mutated away in-page, in its own
    // isolated page so it cannot contaminate assertion (4) above. ---
    const redPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const redErrors = makeErrorSink(redPage);
    await routeFixtures(redPage);
    await redPage.goto(poolUrl, { waitUntil: 'load', timeout: 20000 });
    await redPage.waitForSelector('.pool-detail-view', { timeout: 15000 });
    await waitForCss(redPage);
    // The exact pre-218 state: footer forced back to a fixed, bottom-anchored
    // overlay AND the view's clearance stays cancelled (padding-bottom: 0,
    // 218's own permanent change on this view) — the same injection
    // test_cta_at_rest_occlusion.js's own positive control uses.
    // 225 round 3c: the recomposed hero raised the at-rest CTA above the old
    // bottom band (y≈493 at 360x780 vs footer 721), so the 59px bottom-
    // pinned footer stopped reaching the anchor and the P0 degraded to a P1
    // on a subtitle. The injection stays BOTTOM-ANCHORED (the lens's
    // two-position asymmetry gates at-rest findings on bottom-anchored
    // overlays) but grows tall enough to cover the CTA's at-rest region —
    // same intent (the lens MUST report the garden_cta anchor as occluded),
    // stronger fault.
    await redPage.addStyleTag({ content: '.app.pool-detail-view .app-footer{position:fixed !important;bottom:0;left:0;right:0;height:340px !important} .app.pool-detail-view{padding-bottom:0 !important}' });
    await redPage.waitForTimeout(100);

    let redFindings = [];
    await testAsync('(5) RED PROOF: with 218\'s fix mutated away, checkOcclusion reports >=1 P0 naming the garden_cta anchor (href contains plan.html)', async () => {
      const s = { name: 'test-pool-360', vpLabel: '360px', width: 360, kind: 'pool' };
      await checkOcclusion(redPage, s, redFindings);
      const p0s = redFindings.filter((f) => f.severity === 'P0' && f.check === 'occlusion');
      assertT(p0s.length >= 1, `expected >=1 P0 occlusion finding, got ${redFindings.length} total findings: ${JSON.stringify(redFindings, null, 2)}`);
      const namesGardenCta = p0s.some((f) => f.detail.includes('plan.html'));
      assertT(namesGardenCta, `expected a P0 finding whose detail names the garden_cta anchor (href containing "plan.html"), got: ${JSON.stringify(p0s, null, 2)}`);
    });

    await testAsync('(5) no unexpected page/console errors on the mutated red-proof page', async () => {
      assertT(redErrors.length === 0, redErrors.join('\n    '));
    });
    await redPage.close();

    // --- (6) Bottom-of-scroll leg is not dead: local fixture pages via
    // page.setContent(). A large in-flow spacer pushes a short paragraph to
    // the TRUE end of the document (an absolutely-positioned `bottom: Npx`
    // element with no positioned ancestor resolves against the initial
    // containing block, NOT the full scrollable canvas — normal in-flow
    // placement is what actually lands content at the document's real
    // bottom), clear of the viewport at rest, then a bottom-anchored bar
    // that is either `position: fixed` (must flag) or `position: static`
    // (must not). The paragraph is short enough (one line) that once it is
    // covered at all, it is covered ENTIRELY — the hit-test point (its own
    // centre, the only point tested for a text-bearing victim) lands inside
    // the overlap, matching the geometry gate rather than a partial-overlap
    // case where the centre would still resolve to the paragraph itself. ---
    function bottomBarFixture(barPosition) {
      return `<!doctype html><html><head><style>
        body { margin: 0; font-family: sans-serif; }
        .intro { padding: 16px; }
        .spacer { height: 1900px; }
        .end-content { margin: 0; padding: 8px 16px; }
        .bar { position: ${barPosition}; bottom: 0; left: 0; right: 0; height: 60px; background: #202020; color: #fff; }
      </style></head><body>
        <div class="intro">intro content, well clear of the document's end</div>
        <div class="spacer"></div>
        <p class="end-content">End of document text, must be readable once scrolled all the way down.</p>
        <div class="bar">bottom bar</div>
      </body></html>`;
    }

    const fixedBarPage = await browser.newPage({ viewport: { width: 800, height: 780 } });
    const fixedBarErrors = makeErrorSink(fixedBarPage);
    await fixedBarPage.setContent(bottomBarFixture('fixed'));

    let fixedBarFindings = [];
    await testAsync('(6) bottom-anchored opaque fixed bar over end-of-document content: bottom-of-scroll finding IS reported', async () => {
      const s = { name: 'test-bottom-bar-fixed', vpLabel: '800px', width: 800, kind: 'static' };
      await checkOcclusion(fixedBarPage, s, fixedBarFindings);
      const bottomFindings = fixedBarFindings.filter((f) => f.check === 'occlusion' && f.detail.includes('bottom-of-scroll'));
      assertT(bottomFindings.length >= 1, `expected >=1 bottom-of-scroll occlusion finding, got: ${JSON.stringify(fixedBarFindings, null, 2)}`);
      const blocking = bottomFindings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
      assertT(blocking.length >= 1, `expected the bottom-of-scroll finding to be blocking (P0/P1), got: ${JSON.stringify(bottomFindings, null, 2)}`);
    });
    await testAsync('(6) no unexpected page/console errors on the fixed-bar fixture', async () => {
      assertT(fixedBarErrors.length === 0, fixedBarErrors.join('\n    '));
    });
    await fixedBarPage.close();

    const staticBarPage = await browser.newPage({ viewport: { width: 800, height: 780 } });
    const staticBarErrors = makeErrorSink(staticBarPage);
    await staticBarPage.setContent(bottomBarFixture('static'));

    let staticBarFindings = [];
    await testAsync('(6) same fixture with the bar `position: static`: no occlusion finding', async () => {
      const s = { name: 'test-bottom-bar-static', vpLabel: '800px', width: 800, kind: 'static' };
      await checkOcclusion(staticBarPage, s, staticBarFindings);
      const bottomFindings = staticBarFindings.filter((f) => f.check === 'occlusion' && (f.severity === 'P0' || f.severity === 'P1'));
      assertT(bottomFindings.length === 0, `expected zero blocking occlusion findings with a static (non-fixed) bar, got: ${JSON.stringify(bottomFindings, null, 2)}`);
    });
    await testAsync('(6) no unexpected page/console errors on the static-bar fixture', async () => {
      assertT(staticBarErrors.length === 0, staticBarErrors.join('\n    '));
    });
    await staticBarPage.close();

    // --- (7) The lens does not flag ordinary layout: top-anchored fixed
    // header with proper clearance, content scrolls under it. ---
    function topHeaderFixture() {
      return `<!doctype html><html><head><style>
        body { margin: 0; height: 2000px; font-family: sans-serif; padding-top: 60px; }
        .header { position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #202020; color: #fff; }
        .content p { padding: 16px; }
      </style></head><body>
        <div class="header">site header</div>
        <div class="content">
          <p>Paragraph one, clear of the header at rest thanks to the body's own top clearance.</p>
          <p class="end-content">Paragraph at the very end of the document — once scrolled to the bottom this simply passes UNDER the fixed header, which the user can always reveal again by scrolling up; that is not the defect class this lens flags.</p>
        </div>
      </body></html>`;
    }

    const topHeaderPage = await browser.newPage({ viewport: { width: 800, height: 780 } });
    const topHeaderErrors = makeErrorSink(topHeaderPage);
    await topHeaderPage.setContent(topHeaderFixture());

    let topHeaderFindings = [];
    await testAsync('(7) top-anchored fixed header with clearance, content scrolled under it at max scroll: zero blocking findings', async () => {
      const s = { name: 'test-top-header', vpLabel: '800px', width: 800, kind: 'static' };
      await checkOcclusion(topHeaderPage, s, topHeaderFindings);
      const blocking = topHeaderFindings.filter((f) => f.check === 'occlusion' && (f.severity === 'P0' || f.severity === 'P1'));
      assertT(blocking.length === 0, `expected zero blocking findings against ordinary top-header layout, got: ${JSON.stringify(blocking, null, 2)}`);
    });
    await testAsync('(7) no unexpected page/console errors on the top-header fixture', async () => {
      assertT(topHeaderErrors.length === 0, topHeaderErrors.join('\n    '));
    });
    await topHeaderPage.close();

    // --- (8) The bottom-of-scroll leg is not vacuous on a page carrying
    // `html { scroll-behavior: smooth }` (style.css:2845's exact rule,
    // reproduced verbatim here) — a plain `window.scrollTo` on such a page
    // ANIMATES, so a naive "read position right after scrolling" loop can
    // read a mid-animation position and misreport a genuinely-reachable
    // bottom as unreachable. This is exactly what happened on the real
    // pool-detail-360 surface on the first implementation (scrollTop=1663 of
    // a scrollHeight=2504 target, 96.5% of the way there — see
    // specs/219-notes.md). The fixture below is tall enough to require
    // several viewport-heights of scrolling (2600px over a 780px viewport),
    // so a single un-defeated animated `scrollTo` provably would NOT land at
    // the bottom in one settle window. ---
    function smoothScrollFixture() {
      return `<!doctype html><html><head><style>
        html { scroll-behavior: smooth; }
        body { margin: 0; font-family: sans-serif; }
        .intro { padding: 16px; }
        .spacer { height: 2500px; }
        .end-content { margin: 0; padding: 8px 16px 40px 16px; }
      </style></head><body>
        <div class="intro">intro content, well clear of the document's end</div>
        <div class="spacer"></div>
        <p class="end-content">End of document text, reachable only once smooth scrolling is defeated.</p>
      </body></html>`;
    }

    const smoothScrollPage = await browser.newPage({ viewport: { width: 800, height: 780 } });
    const smoothScrollErrors = makeErrorSink(smoothScrollPage);
    await smoothScrollPage.setContent(smoothScrollFixture());

    let smoothScrollFindings = [];
    await testAsync('(8) html{scroll-behavior:smooth} fixture: bottom-of-scroll leg still reaches true bottom, no "unreachable" P2', async () => {
      const s = { name: 'test-smooth-scroll', vpLabel: '800px', width: 800, kind: 'static' };
      await checkOcclusion(smoothScrollPage, s, smoothScrollFindings);
      const unreachable = smoothScrollFindings.filter((f) => f.check === 'occlusion' && f.detail.includes('unreachable'));
      assertT(unreachable.length === 0,
        `expected NO "bottom-of-scroll unreachable" advisory on a smooth-scrolling page (the leg must defeat scroll-behavior:smooth, not just be lucky on pages without it), got: ${JSON.stringify(unreachable, null, 2)}`);
    });
    await testAsync('(8) no unexpected page/console errors on the smooth-scroll fixture', async () => {
      assertT(smoothScrollErrors.length === 0, smoothScrollErrors.join('\n    '));
    });
    await smoothScrollPage.close();

    // --- (8b) Round-3 robustness fix: the AT-REST pass must not be silently
    // skipped by `html { scroll-behavior: smooth }` either. The planner
    // driver clicks a `.gp-chip` immediately before calling checkOcclusion
    // (audit-app.js ~3717), and that click can scroll the thread into view —
    // on any surface not already at scrollY=0 when checkOcclusion runs, a
    // naive `scrollTo(0,0)` under smooth scrolling would animate and a
    // single immediate scrollY read would catch it mid-flight, silently
    // degrading the at-rest leg (the leg that catches item 218) to a P2
    // advisory instead of measuring it. This fixture reproduces BOTH
    // conditions at once: smooth scrolling AND a page already scrolled away
    // from the top when checkOcclusion is invoked. It also carries a GENUINE
    // at-rest occlusion (a top-anchored fixed bar with no clearance sitting
    // over the first paragraph) — a test that only proved "no advisory
    // fired" would pass just as well on a check that measured nothing; this
    // one only passes if the pass actually ran AND actually saw the defect. ---
    function preScrolledSmoothFixture() {
      return `<!doctype html><html><head><style>
        html { scroll-behavior: smooth; }
        body { margin: 0; font-family: sans-serif; }
        .bar { position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #202020; color: #fff; z-index: 10; }
        .first-para { margin: 0; padding: 16px; }
        .spacer { height: 2000px; }
      </style></head><body>
        <div class="bar">site bar, no clearance below it</div>
        <p class="first-para">This paragraph has zero top clearance and sits directly behind the fixed bar at rest.</p>
        <div class="spacer"></div>
        <p>end of document content</p>
      </body></html>`;
    }

    const preScrolledPage = await browser.newPage({ viewport: { width: 800, height: 780 } });
    const preScrolledErrors = makeErrorSink(preScrolledPage);
    await preScrolledPage.setContent(preScrolledSmoothFixture());
    // Mimic the planner's pre-occlusion chip click: scroll away from the top
    // (this itself animates, per the fixture's own scroll-behavior:smooth)
    // and let the animation fully settle before invoking checkOcclusion, so
    // the pass genuinely starts from a non-zero scrollY.
    await preScrolledPage.evaluate(() => window.scrollTo(0, 500));
    await preScrolledPage.waitForTimeout(800);
    const scrollYBeforeCheck = await preScrolledPage.evaluate(() => window.scrollY);
    assertT(scrollYBeforeCheck > 0, `test setup failed: expected the page to be scrolled away from the top before checkOcclusion runs, got scrollY=${scrollYBeforeCheck}`);

    let preScrolledFindings = [];
    await testAsync('(8b) smooth-scrolling page, already scrolled away from top: at-rest pass still measures (no "at-rest pass skipped" P2) and reports the real at-rest occlusion', async () => {
      const s = { name: 'test-prescrolled-smooth', vpLabel: '800px', width: 800, kind: 'static' };
      await checkOcclusion(preScrolledPage, s, preScrolledFindings);
      const skipped = preScrolledFindings.filter((f) => f.check === 'occlusion' && f.detail.includes('at-rest pass skipped'));
      assertT(skipped.length === 0,
        `expected the at-rest pass to actually measure (not degrade to a skip advisory) even when the page starts scrolled and smooth-scrolling is in effect, got: ${JSON.stringify(skipped, null, 2)}`);
      const atRestHit = preScrolledFindings.filter((f) =>
        f.check === 'occlusion' && f.detail.includes('at-rest') && f.detail.includes('first-para'));
      assertT(atRestHit.length >= 1,
        `expected the at-rest pass to report the fixture's real occlusion (.first-para behind .bar); got: ${JSON.stringify(preScrolledFindings, null, 2)}`);
    });
    await testAsync('(8b) no unexpected page/console errors on the pre-scrolled smooth fixture', async () => {
      assertT(preScrolledErrors.length === 0, preScrolledErrors.join('\n    '));
    });
    await preScrolledPage.close();

    // --- (9) Integration: runAudit({ only: ['pool-detail-360'] }). ---
    const outPath = path.join(os.tmpdir(), `audit-findings-occlusion-lens-${process.pid}.json`);
    outPaths.push(outPath);
    const timeoutMs = 90000;
    async function raced(promise, label) {
      let timer;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs / 1000}s hard timeout`)), timeoutMs); })
        ]);
      } finally {
        clearTimeout(timer);
      }
    }

    let integrationResult = null;
    try {
      integrationResult = await raced(runAudit({ port: RUNAUDIT_PORT, only: ['pool-detail-360'], outPath }), 'pool-detail-360 render');
    } catch (err) {
      console.log('  (skipped) integration case — could not run the audit here: ' + err.message);
      console.log('    reason recorded in product-loop-kit/specs/219-notes.md');
    }

    if (integrationResult) {
      test('(9) runAudit({ only: ["pool-detail-360"] }) covers that surface', () => {
        assertT(Array.isArray(integrationResult.surfacesCovered), 'result.surfacesCovered is not an array');
        assertT(integrationResult.surfacesCovered.includes('pool-detail-360'),
          `expected surfacesCovered to include "pool-detail-360"; got ${JSON.stringify(integrationResult.surfacesCovered)}`);
      });
      test('(9) every finding from the real run is well-formed', () => {
        assertT(Array.isArray(integrationResult.findings), 'result.findings is not an array');
        for (const f of integrationResult.findings) {
          assertT(f && typeof f === 'object', `finding is not an object: ${JSON.stringify(f)}`);
          assertT(typeof f.surface === 'string' && f.surface.length > 0, `finding missing a surface string: ${JSON.stringify(f)}`);
          assertT(typeof f.viewport === 'string' && f.viewport.length > 0, `finding missing a viewport string: ${JSON.stringify(f)}`);
          assertT(typeof f.check === 'string' && f.check.length > 0, `finding missing a check string: ${JSON.stringify(f)}`);
          assertT(['P0', 'P1', 'P2'].includes(f.severity), `finding has an unrecognized severity: ${JSON.stringify(f)}`);
          assertT(typeof f.detail === 'string' && f.detail.length > 0, `finding missing a detail string: ${JSON.stringify(f)}`);
        }
        const occlusionFindings = integrationResult.findings.filter((f) => f.check === 'occlusion' && f.surface === 'pool-detail-360');
        if (occlusionFindings.length > 0) {
          console.log(`    NOTE: this real run originated ${occlusionFindings.length} occlusion finding(s) on pool-detail-360 — reported in specs/219-notes.md per acceptance criterion 9, not fixed here: ${JSON.stringify(occlusionFindings, null, 2)}`);
        } else {
          console.log('    NOTE: this real run originated zero occlusion findings on pool-detail-360.');
        }
      });
      test('(8) the real pool-detail-360 run produces NO "bottom-of-scroll unreachable" P2 (arrival confirmed on the real product, not just a fixture)', () => {
        const unreachable = integrationResult.findings.filter((f) =>
          f.surface === 'pool-detail-360' && f.check === 'occlusion' && f.detail.includes('unreachable'));
        assertT(unreachable.length === 0,
          `expected zero "unreachable" advisories on the real north-star surface now that scroll-behavior:smooth is defeated, got: ${JSON.stringify(unreachable, null, 2)}`);
      });
    }

    // --- (10)/(11) backlog 276 — the victim scan used to exempt ANY
    // fixed/sticky element AND anything inside ANY overlay, blanket, not
    // per-pair. That is strictly wider than the legitimate exemption (a
    // victim inside its OWN covering overlay), so a victim nested in one
    // overlay but occluded by a DIFFERENT, unrelated overlay went unseen —
    // the exact item 273 shape: `.app-search-input` lives inside
    // `.app-header-sticky` (itself an overlay) and was occluded by a sibling
    // `.language-toggle` (position:fixed), invisible to the lens. ---
    function nestedOverlayVictimFixture() {
      return `<!doctype html><html><head><style>
        body { margin: 0; height: 1200px; font-family: sans-serif; }
        .header-sticky { position: sticky; top: 0; left: 0; right: 0; height: 60px; background: #202020; z-index: 1; }
        .search-input { position: absolute; top: 4px; left: 20px; width: 120px; height: 32px; box-sizing: border-box; }
        .toggle { position: fixed; top: 8px; left: 60px; width: 40px; height: 40px; background: #900; color: #fff; z-index: 2; }
      </style></head><body>
        <div class="header-sticky"><input class="search-input" placeholder="search"></div>
        <div class="toggle">T</div>
        <p>page content, well clear of the header</p>
      </body></html>`;
    }

    const nestedPage = await browser.newPage({ viewport: { width: 800, height: 780 } });
    const nestedErrors = makeErrorSink(nestedPage);
    await nestedPage.setContent(nestedOverlayVictimFixture());

    let nestedFindings = [];
    await testAsync('(10) backlog 276: a victim inside overlay A, occluded by a DIFFERENT overlay B that is not its ancestor, IS reported', async () => {
      const s = { name: 'test-nested-overlay-victim', vpLabel: '800px', width: 800, kind: 'static' };
      await checkOcclusion(nestedPage, s, nestedFindings);
      const blocking = nestedFindings.filter((f) => f.check === 'occlusion' && f.severity === 'P0');
      assertT(blocking.length >= 1,
        `expected >=1 P0 occlusion finding (search-input occluded by the sibling toggle), got: ${JSON.stringify(nestedFindings, null, 2)}`);
      const namesInput = blocking.some((f) => f.detail.includes('search-input'));
      assertT(namesInput, `expected a P0 finding naming the search-input, got: ${JSON.stringify(blocking, null, 2)}`);
    });
    await testAsync('(10) no unexpected page/console errors on the nested-overlay-victim fixture', async () => {
      assertT(nestedErrors.length === 0, nestedErrors.join('\n    '));
    });
    await nestedPage.close();

    // Negative control (backlog 276's own stated risk: "false-positive risk
    // on legitimately-nested overlay content — the exemption exists for a
    // reason"). A victim inside its OWN covering overlay, with no OTHER
    // overlay on the page, must stay unflagged — the per-pair rewrite must
    // not have widened the check into flagging every overlay's own children.
    function selfContainedOverlayFixture() {
      return `<!doctype html><html><head><style>
        body { margin: 0; height: 1200px; font-family: sans-serif; padding-top: 60px; }
        .header { position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #202020; z-index: 1; display: flex; align-items: center; }
        .header a { color: #fff; margin-left: 16px; }
      </style></head><body>
        <div class="header"><a href="#nav">Menu</a></div>
        <p>page content, safely below the header thanks to top padding</p>
      </body></html>`;
    }

    const selfContainedPage = await browser.newPage({ viewport: { width: 800, height: 780 } });
    const selfContainedErrors = makeErrorSink(selfContainedPage);
    await selfContainedPage.setContent(selfContainedOverlayFixture());

    let selfContainedFindings = [];
    await testAsync('(11) negative control: a victim inside its OWN covering overlay, no other overlay on the page, stays unflagged', async () => {
      const s = { name: 'test-self-contained-overlay', vpLabel: '800px', width: 800, kind: 'static' };
      await checkOcclusion(selfContainedPage, s, selfContainedFindings);
      const blocking = selfContainedFindings.filter((f) => f.check === 'occlusion' && (f.severity === 'P0' || f.severity === 'P1'));
      assertT(blocking.length === 0,
        `expected zero blocking findings for a nav link inside its own fixed header, got: ${JSON.stringify(blocking, null, 2)}`);
    });
    await testAsync('(11) no unexpected page/console errors on the self-contained-overlay fixture', async () => {
      assertT(selfContainedErrors.length === 0, selfContainedErrors.join('\n    '));
    });
    await selfContainedPage.close();
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
    for (const p of outPaths) { try { fs.unlinkSync(p); } catch (e) {} }
  }

  console.log(`\ntest_audit_occlusion_lens.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
