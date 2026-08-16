/* Rendered-Playwright acceptance gate for spec 236 PHASE 1: ONE header band
   on all three analytics-app views (no-results/search, results grid, pool
   detail) + ONE `--content-max-width` token consumed by all three page
   shells.

   Before this change: the no-results/search state (`/?app=1` — the router's
   `app` param forces analytics mode with no token/chain/pool, so app.js
   renders its own no-results branch) had NO `.app-header-sticky` band at
   all — instead a giant centered `h1.logo` + `.subtitle` hero and a
   FLOATING standalone `.theme-toggle`/`.language-toggle` pair (`app.js`,
   pre-236). The grid (`/?token=USDC`) and pool-detail (`/?pool=<id>`) views
   already shared `renderHeaderRow()`, but the shell widths disagreed (600px
   home / 1200px grid, no shared token). 236 phase 1 makes the no-results
   state render the SAME `.app-header-sticky` → `renderHeaderRow(false)`
   band (the missing search slot is the one sanctioned, documented
   variation — see product-loop-kit/specs/236-notes.md) and tokenizes every
   page shell's max-width onto `--content-max-width`.

   Rig mirrors test_footer_contract.js exactly: fixture-routed local static
   server for home.html, vendored-free (no unpkg — home.html loads the
   COMMITTED compiled+minified bundles directly, same as production),
   CHROMIUM_EXECUTABLE fallback, IGNORABLE_ERROR_PATTERN, page-error
   collection, `page.addInitScript` for deterministic theme.

   Run: node test_nav_band_identity.js */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// PORT scan (`grep -h "^const PORT" test_*.js`): highest claimed port on
// disk at authoring time was 9700 (test_audit_* family) — 236 takes the
// next round number clear of that range. Only a PREFERENCE, not a
// requirement: startServer() below binds port 0 (OS-assigned free port)
// and reads back whatever it actually got, so a stale listener left over
// from a previous crashed/backgrounded run on this same port can never
// EADDRINUSE this gate — a coordinator run hit exactly that failure mode
// against a fixed port before this fix.
const PORT_HINT = 9801;
let PORT = PORT_HINT;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;

const POOLS_URL = 'https://yields.llama.fi/pools';
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOL_ID = 'usdc-base-aave-236';
const FIXTURE_POOLS = [
  makePool(FIXTURE_POOL_ID, 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-eth-morpho-236', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9)
];
const POOLS_BODY = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Binds port 0 (OS picks any free port) rather than PORT_HINT directly —
// resilient to a stale listener left on the hinted port by a previous run
// (see the PORT_HINT comment above). Sets the module-level `PORT` to
// whatever the OS actually assigned before resolving, so every later
// `http://localhost:${PORT}` URL in this file is correct.
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/home.html';
      const filePath = path.join(ROOT, urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      PORT = server.address().port;
      resolve(server);
    });
  });
}

async function newPage(browser, { theme } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
    }
  });
  if (theme) {
    await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
  }
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}'
  }));
  await page.route(POOLS_URL, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: POOLS_BODY }));
  return { page, errors };
}

// The three analytics-app views under test. `/?app=1` forces analytics mode
// (home.html's IA router `ANALYTICS_PARAMS` list) with no token/chain/pool,
// i.e. app.js's own no-results/search branch — NOT landing.js's `/`.
const VIEWS = [
  { name: 'no-results (/?app=1)', path: '/?app=1', ready: '.app-header-sticky' },
  { name: 'grid (/?token=USDC)', path: '/?token=USDC', ready: '.pool-card' },
  { name: `pool-detail (/?pool=${FIXTURE_POOL_ID})`, path: `/?pool=${FIXTURE_POOL_ID}`, ready: '.pool-detail-view' }
];
const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 768, height: 900 },
  { width: 1280, height: 900 }
];
const THEMES = ['light', 'dark'];

// One page load -> the full set of geometry/identity facts this gate cares
// about, read in a single evaluate() so every number comes from the SAME
// paint.
async function readViewFacts(browser, view, viewport, theme) {
  const { page, errors } = await newPage(browser, { theme });
  await page.setViewportSize(viewport);
  await page.goto('http://localhost:' + PORT + view.path, { waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector(view.ready, { timeout: 15000 });
  await page.waitForSelector('.app-header-sticky', { timeout: 15000 });
  await page.waitForSelector('.app-header-content', { timeout: 15000 });
  // Let one rAF settle (fonts/layout) before measuring, same discipline as
  // test_mobile_controls_reachable.js.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const facts = await page.evaluate(() => {
    const sticky = document.querySelector('.app-header-sticky');
    const content = document.querySelector('.app-header-content');
    const navRow = document.querySelector('.app-nav-row');
    const logo = document.querySelector('.app-logo');
    const controls = document.querySelector('.app-header-controls');
    const container = document.querySelector('.container');
    // The first content block a viewer actually sees below the band, per
    // view: `.search-section` (no-results), `.results-section` (grid),
    // `.pool-detail-container` (pool-detail) — all three are `.container`'s
    // first rendered element child, so this is one generic query rather
    // than three per-view special cases.
    const firstContent = container ? container.firstElementChild : null;
    const root = document.documentElement;
    const cs = (el) => getComputedStyle(el);
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    return {
      dataTheme: root.getAttribute('data-theme'),
      tokenMaxWidth: cs(root).getPropertyValue('--content-max-width').trim(),
      stickyHeight: sticky ? rect(sticky).height : null,
      stickyBottom: sticky ? rect(sticky).bottom : null,
      firstContentTop: firstContent ? rect(firstContent).top : null,
      // The nav-row (category tabs) is grid-ONLY chrome living inside
      // .app-header-sticky alongside the shared band (app.js: "part of the
      // header - ONLY on results") — its presence is exactly what makes
      // grid's .app-header-sticky taller than the other two, by design.
      navRowHeight: navRow ? rect(navRow).height : null,
      contentHeight: content ? rect(content).height : null,
      contentMaxWidth: content ? cs(content).maxWidth : null,
      contentPadding: content ? cs(content).padding : null,
      contentRect: content ? rect(content) : null,
      logoRect: logo ? rect(logo) : null,
      controlsRect: controls ? rect(controls) : null,
      containerMaxWidth: container ? cs(container).maxWidth : null,
      languageControlCount: document.querySelectorAll('.language-toggle').length,
      themeControlCount: document.querySelectorAll('.theme-toggle').length,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth
    };
  });

  if (errors.length) throw new Error(view.name + ' @' + viewport.width + 'x' + viewport.height + ' [' + theme + ']: page errors:\n' + errors.join('\n'));
  await page.close();
  return facts;
}

function px(v) {
  const n = parseFloat(v);
  if (Number.isNaN(n)) throw new Error('could not parse px value from "' + v + '"');
  return n;
}
function closeEnough(a, b, tolerancePx, label) {
  if (Math.abs(a - b) > tolerancePx) {
    throw new Error(`${label}: ${a} vs ${b} differ by more than ±${tolerancePx}px`);
  }
}

async function main() {
  console.log('\n=== rendered Playwright: nav-band identity across 3 analytics views (spec 236 phase 1) ===');
  console.log('network: yields.llama.fi routed to a fixture, icons.llamao.fi aborted — nothing real hit');
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const label = `${viewport.width}x${viewport.height} [${theme}]`;
        const results = {};
        for (const view of VIEWS) {
          results[view.name] = await readViewFacts(browser, view, viewport, theme);
        }

        // --- Leg 1: the band is present on all three, in the expected theme.
        await test(`[${label}] .app-header-sticky/.app-header-content present on all 3 views, data-theme correct`, async () => {
          for (const view of VIEWS) {
            const f = results[view.name];
            if (f.stickyHeight === null) throw new Error(view.name + ': .app-header-sticky missing');
            if (f.contentRect === null) throw new Error(view.name + ': .app-header-content missing');
            if (f.dataTheme !== theme) throw new Error(view.name + ': data-theme="' + f.dataTheme + '", expected "' + theme + '"');
          }
        });

        // --- Leg 2: .app-header-sticky height. The grid view carries an
        //     EXTRA row inside the sticky band — .app-nav-row (category
        //     tabs) — that the other two views never render (app.js: "part
        //     of the header - ONLY on results"); that row is grid-only
        //     chrome sitting alongside the shared band, not part of it, so
        //     grid's .app-header-sticky is legitimately taller BY EXACTLY
        //     the nav-row's own height. The two single-row views
        //     (no-results, pool-detail) must still match each other
        //     exactly, and grid's total must decompose exactly into
        //     content + nav-row with nothing left unaccounted for.
        await test(`[${label}] .app-header-sticky height: identical on the two single-row views; grid's excess is exactly its own .app-nav-row`, async () => {
          const noResults = results[VIEWS[0].name];
          const grid = results[VIEWS[1].name];
          const poolDetail = results[VIEWS[2].name];
          closeEnough(poolDetail.stickyHeight, noResults.stickyHeight, 1,
            `${VIEWS[2].name} sticky height vs ${VIEWS[0].name} (both single-row, must match)`);
          if (grid.navRowHeight === null) throw new Error(VIEWS[1].name + ': .app-nav-row missing (grid must render it)');
          if (noResults.navRowHeight !== null) throw new Error(VIEWS[0].name + ': .app-nav-row present, expected absent (no-results has no nav-row)');
          if (poolDetail.navRowHeight !== null) throw new Error(VIEWS[2].name + ': .app-nav-row present, expected absent (pool-detail has no nav-row)');
          closeEnough(grid.contentHeight + grid.navRowHeight, grid.stickyHeight, 1,
            `${VIEWS[1].name} .app-header-content + .app-nav-row vs its own .app-header-sticky total`);
        });

        // --- Leg 2b: the shared band ROW itself (.app-header-content, the
        //     actual "one header band" component) is identical (±1px)
        //     height across all 3 views, independent of grid's extra row.
        await test(`[${label}] .app-header-content height identical (±1px) across all 3 views`, async () => {
          const base = results[VIEWS[0].name].contentHeight;
          for (const view of VIEWS) {
            closeEnough(results[view.name].contentHeight, base, 1, `${view.name} .app-header-content height vs ${VIEWS[0].name}`);
          }
        });

        // --- Leg 3: .app-header-content resolved max-width + padding identical.
        await test(`[${label}] .app-header-content resolved max-width + padding identical across all 3 views`, async () => {
          const base = results[VIEWS[0].name];
          for (const view of VIEWS) {
            const f = results[view.name];
            closeEnough(px(f.contentMaxWidth), px(base.contentMaxWidth), 1, `${view.name} .app-header-content max-width vs ${VIEWS[0].name}`);
            if (f.contentPadding !== base.contentPadding) {
              throw new Error(`${view.name} .app-header-content padding "${f.contentPadding}" !== ${VIEWS[0].name} padding "${base.contentPadding}"`);
            }
          }
        });

        // --- Leg 4: .app-logo / .app-header-controls y-position + left/right
        //     edge alignment identical. Deliberately NOT asserting on the
        //     search slot (the one sanctioned variation, includeSearch).
        await test(`[${label}] .app-logo / .app-header-controls y-position + edges identical (±1px) across all 3 views`, async () => {
          const base = results[VIEWS[0].name];
          for (const view of VIEWS) {
            const f = results[view.name];
            if (!f.logoRect) throw new Error(view.name + ': .app-logo missing');
            if (!f.controlsRect) throw new Error(view.name + ': .app-header-controls missing');
            closeEnough(f.logoRect.top, base.logoRect.top, 1, `${view.name} .app-logo top vs ${VIEWS[0].name}`);
            closeEnough(f.logoRect.left, base.logoRect.left, 1, `${view.name} .app-logo left vs ${VIEWS[0].name}`);
            closeEnough(f.controlsRect.top, base.controlsRect.top, 1, `${view.name} .app-header-controls top vs ${VIEWS[0].name}`);
            closeEnough(f.controlsRect.right, base.controlsRect.right, 1, `${view.name} .app-header-controls right vs ${VIEWS[0].name}`);
          }
        });

        // --- Leg 5: all three page shells resolve the SAME computed
        //     max-width, and that value derives from --content-max-width
        //     (read the token at test time, never a hardcoded 1200 literal).
        await test(`[${label}] all 3 page-shell .container elements resolve the SAME max-width, sourced from --content-max-width`, async () => {
          const tokenValues = VIEWS.map((v) => results[v.name].tokenMaxWidth);
          if (new Set(tokenValues).size !== 1) throw new Error('--content-max-width itself differs across views: ' + JSON.stringify(tokenValues));
          const expectedPx = px(tokenValues[0]);
          for (const view of VIEWS) {
            const f = results[view.name];
            if (!f.containerMaxWidth) throw new Error(view.name + ': .container missing');
            closeEnough(px(f.containerMaxWidth), expectedPx, 1, `${view.name} .container max-width vs --content-max-width (${tokenValues[0]})`);
          }
        });

        // --- Leg 6: exactly one language control and one theme control per view.
        await test(`[${label}] exactly ONE .language-toggle and ONE .theme-toggle per view`, async () => {
          for (const view of VIEWS) {
            const f = results[view.name];
            if (f.languageControlCount !== 1) throw new Error(view.name + ': expected 1 .language-toggle, got ' + f.languageControlCount);
            if (f.themeControlCount !== 1) throw new Error(view.name + ': expected 1 .theme-toggle, got ' + f.themeControlCount);
          }
        });

        // --- Leg 7: no horizontal body scroll at 360px on any of the three.
        if (viewport.width === 360) {
          await test(`[${label}] no horizontal body scroll on any of the 3 views (scrollWidth <= clientWidth)`, async () => {
            for (const view of VIEWS) {
              const f = results[view.name];
              if (f.scrollWidth > f.clientWidth) {
                throw new Error(`${view.name}: documentElement.scrollWidth (${f.scrollWidth}) > clientWidth (${f.clientWidth}) — horizontal overflow`);
              }
            }
          });
        }

        // --- Leg 8: the band is a new occluder on every view it was added
        //     to (no-results especially — its `.app:not(.has-results)
        //     .container` still carries a pre-236 `transform: translateY
        //     (-5vh)` "Google-style positioning" shift that predates the
        //     fixed band and could, in principle, pull the hero back up
        //     underneath it even with the new padding-top clearance, since
        //     a transform doesn't respect padding). Assert the first
        //     visible content block on every view starts AT OR BELOW the
        //     band's bottom edge — occlusion is a house defect class.
        await test(`[${label}] first content block on every view starts at/below .app-header-sticky's bottom edge (no band occlusion)`, async () => {
          for (const view of VIEWS) {
            const f = results[view.name];
            if (f.firstContentTop === null) throw new Error(view.name + ': .container has no first element child to check');
            if (f.firstContentTop < f.stickyBottom - 1) {
              throw new Error(`${view.name}: first content top (${f.firstContentTop}) is ABOVE the band's bottom edge (${f.stickyBottom}) — occluded by .app-header-sticky`);
            }
          }
        });
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed}/${total} rendered assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_nav_band_identity.js crashed: ' + err.message);
  process.exitCode = 1;
});
