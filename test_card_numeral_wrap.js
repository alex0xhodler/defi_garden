/* Playwright behavior gate for spec 246: pool card numeral cells get a wrap
   discipline. Drives the REAL rendered UI (http-server + chromium) and
   asserts on the rendered DOM via computed styles — never on source strings —
   per the 2026-07-11 standing decision.

   RAZOR (product-loop-kit/RAZOR.md): assert the CLASS, not the instance. The
   population of "numeral cells" is derived from the RENDERED DOM at test
   time — for every .pool-card in the results container, every one of
   .pool-apy-hero / .pool-apy-preview / .pool-apy-tag / .tvl-value that
   EXISTS is scanned and asserted, rather than hard-coding which pool has
   which cell. If this defect reappears in a different numeral cell of a pool
   card tomorrow, this scan catches it (see specs/246-notes.md for the scan's
   coverage boundary).

   Verifies, across BOTH views (list default + Grid View toggle), BOTH
   themes (light/dark) and FOUR viewports (360/768/1280/1540):
   A. every existing numeral cell renders on ONE line
      (round(boundingRect.height / computed lineHeight) === 1).
   B. every existing numeral cell has computed white-space === 'nowrap'.
   C. no horizontal page scroll (document.documentElement.scrollWidth <=
      window.innerWidth, 1px tolerance).
   D. every numeral cell's own scrollWidth <= clientWidth + 1 (no internal
      clipping/overflow of its own content).
   E. no numeral cell's box overlaps ANY other rendered text-bearing leaf
      element's box within the same .pool-card (no encroachment). The
      neighbour set is DERIVED from the rendered card (246 finding 1b,
      attempt 2 — the verifier reproduced a real overlap between
      .pool-apy-hero and .pool-context-inline that a hardcoded
      numeral-vs-.pool-symbol-only comparison could never see): every element
      with no child elements and non-empty text is a candidate neighbour, so
      .pool-context-inline and .pool-symbol are covered automatically, and so
      would any future text element added to the card. ONE exclusion:
      elements inside .pool-cta-section (the CTA button) are left out of the
      neighbour set — see the inline comment at the derivation site for why,
      and for the unrelated CTA-button overlap that exclusion was found to be
      hiding (recorded, not fixed, in specs/246-notes.md).
   Plus, on /?pool=<id> (leg b, already closed by 247 — pinned only):
   F. .pool-token-chip computed font-family === body's computed font-family.
   G. .pool-token-chip computed text-transform !== 'uppercase'.
   Zero page errors throughout (reuses the ignorable-error filter).

   Coverage boundary of check E, stated plainly (RAZOR): the derivation
   covers every rendered .pool-card in THIS test's population. It does NOT
   cover, and cannot catch: (1) overlaps hidden by the .pool-cta-section
   exclusion above; (2) a pairing this file's fixture population doesn't
   render — in particular, the usdc-poly-aave fixture pool (relabeled to
   LONGEST_PROJECT_SLUG) below is
   deliberately paired with a REALISTIC (non-anomalous) APY, so it proves the
   long-slug byline does NOT collide with a normal-magnitude hero; the same
   long slug paired with an ANOMALOUS magnitude (e.g. apyBase 9999999.99) DOES
   collide with .pool-apy-hero at 768px — reproduced in this session, NOT
   fixed, NOT asserted by any test() below (asserting it would make this file
   permanently red for a pre-existing, out-of-scope defect) — see
   specs/246-notes.md for the exact reproduction and viewport.

   Harness notes learned the hard way (do not "fix" these):
   - `page.goto` uses waitUntil: 'domcontentloaded', NOT 'load' — 'load' hangs
     in this sandbox (unreachable analytics/font hosts never fire their load
     event even when routed/aborted).
   - Theme is switched via the real .theme-toggle button (no page.reload() —
     reload also hangs here). The pool-detail navigation sets dark mode via
     page.addInitScript + localStorage BEFORE that page's first navigation,
     for the same reason.

   Fixture-routed, sandbox-safe: clones test_list_polish.js's server +
   routeFixtures + stale-snapshot stub verbatim. Fixture includes an
   anomaly-flagged pool (apyBase far above APY_SANITY_LIMIT, so the hero
   renders "⚠ …" — the positive control from the operator's pre-change
   measurement), a near-zero (~$0.00/day magnitude) yielding pool, a 0-yield
   pool (renders .pool-apy-tag), and enough pools to fill more than one grid
   row at 1280/1540 (9 pools -> rows [4,4,1], same shape the operator
   measured on main).

   Run: node test_card_numeral_wrap.js */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8981; // distinct from other test_* files (8791-8980 taken)
const ROOT = __dirname;
const SCRATCH = os.tmpdir();
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|icons\.llamao\.fi/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// 246 finding 1b (verifier, attempt 2): the guard's neighbour set must be
// exercised against a REALISTIC worst case, not a convenient hardcoded name.
// Computed from the live snapshot, not hardcoded -- if the snapshot's longest
// project slug changes, this fixture follows it. Printed below (non-vacuity:
// the value actually used is visible in the run's own output).
const SNAPSHOT_FOR_LONGEST_SLUG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pools-snapshot.json'), 'utf8'));
let LONGEST_PROJECT_SLUG = '';
for (const p of SNAPSHOT_FOR_LONGEST_SLUG.pools) {
  if (p.project && p.project.length > LONGEST_PROJECT_SLUG.length) LONGEST_PROJECT_SLUG = p.project;
}

// DefiLlama-shaped fixture (mirrors test_list_polish.js): sized above
// DEFAULT_MIN_TVL ($10M) so trust-rail filtering never hides them.
function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
const FIXTURE_POOLS = [
  // Positive control: apyBase (36,452.38%) is far above APY_SANITY_LIMIT
  // (1000%, app.js:800) -> isAnomalousApy() true -> hero renders
  // "⚠ 36,452.38%". This is the live defect the operator measured on main.
  makePool('usdc-anomaly', 'weird-farm', 'USDC', 'Ethereum', 20_000_000, 36452.38),
  // 0-yield pool -> hasNoSupplyYield() true -> renders .pool-apy-tag instead
  // of .pool-apy-hero's sibling .pool-apy-preview.
  makePool('usdc-base-collateral', 'some-lend', 'USDC', 'Base', 45_000_000, 0),
  // Near-zero yield (still >= NO_SUPPLY_YIELD_EPSILON so it keeps the
  // .pool-apy-preview $/day cell) -> $1000 * (0.01%/365) rounds to $0.00/day,
  // the smallest realistic magnitude for that cell.
  makePool('usdc-near-zero', 'quiet-vault', 'USDC', 'Ethereum', 12_000_000, 0.01),
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9),
  makePool('usdc-arb-aave', 'aave-v3', 'USDC', 'Arbitrum', 70_000_000, 4.8),
  // 246 finding 1b: this pool's project is the LONGEST project slug actually
  // present in data/pools-snapshot.json (computed above, not hardcoded),
  // paired with a realistic (non-anomalous) APY -- exercises the widened
  // neighbour-overlap check (E) against a real-world-shaped worst case, not
  // an invented one. Kept at this pool's original TVL rank (30M) so it
  // occupies the SAME page-1 slot 'aave-v3'/Polygon held before: itemsPerPage
  // is 9 (app.js), so simply appending a 12th fixture pool would silently
  // push the lowest-ranked pool (usdc-daypreview-glitch, the Trial-2
  // non-vacuity stress fixture for .pool-apy-preview) off page 1 instead of
  // adding coverage -- relabeling an existing filler pool avoids that.
  makePool('usdc-poly-aave', LONGEST_PROJECT_SLUG, 'USDC', 'Polygon', 30_000_000, 3.1),
  makePool('usdc-opt-aave', 'aave-v3', 'USDC', 'Optimism', 25_000_000, 2.7),
  makePool('usdc-avax-aave', 'aave-v3', 'USDC', 'Avalanche', 40_000_000, 3.9),
  makePool('usdc-bsc-venus', 'venus-core-pool', 'USDC', 'BSC', 18_000_000, 4.4),
  // Non-vacuity stress fixtures: realistic magnitudes never approach the
  // fixed 110-130px list-view tracks (the operator's measured bound for the
  // $/day cell is ~$27.40/day at APY_SANITY_LIMIT; TVL is always abbreviated
  // to a few chars by formatCurrency) — so proving the .pool-apy-preview and
  // .tvl-value nowrap rules can actually fire red requires content wide
  // enough to reach the track, not just any anomalous value. Both scenarios
  // are real documented failure modes in this codebase's history (RAZOR.md
  // worked example 2: a garbage-magnitude apyMean30d card; item 122: a
  // garbage-magnitude TVL-shaped number), not invented extremes: the $/day
  // calc (getQuickPreview, app.js) is NOT clamped to APY_SANITY_LIMIT even
  // though the hero display is flagged, so a sufficiently glitched apyBase
  // still produces an oversized $/day string; formatCurrency has no upper
  // bound either.
  makePool('usdc-daypreview-glitch', 'glitch-farm', 'USDC', 'Ethereum', 15_000_000, 9999999.99),
  makePool('usdc-tvl-glitch', 'glitch-vault', 'USDC', 'Ethereum', 950_000_000_000_000_000, 3.0)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// Second fixture, for the leg-(b) pool-detail navigation: one pool carrying
// underlyingTokens so the "Underlying Assets" chip row renders.
const CHIP_POOL = {
  pool: 'usdc-chip-detail', project: 'aave-v3', symbol: 'USDC/WETH', chain: 'Ethereum',
  tvlUsd: 50_000_000, apyBase: 4.5, apyReward: 0,
  underlyingTokens: ['0xdac17f958d2ee523a2206206994597c13d831ec7', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2']
};
const CHIP_FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: [CHIP_POOL] });

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
        let body = data;
        // home.html ships style.min.css as <link media="print" onload="this.media='all'">
        // (non-render-blocking async-CSS). Serve the post-onload state here so
        // computed-style assertions see the real applied CSS (mirrors
        // test_list_polish.js).
        if (path.extname(filePath) === '.html') {
          body = Buffer.from(data.toString('utf8')
            .replace('media="print" onload="this.media=\'all\'"', 'media="all"'));
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(body);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function routeFixtures(page, poolsResponse) {
  const nodeModules = path.join(ROOT, 'node_modules');
  await page.route('https://api.fontshare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const vendored = {
    'https://unpkg.com/react@18/umd/react.production.min.js':
      path.join(nodeModules, 'react/umd/react.production.min.js'),
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js':
      path.join(nodeModules, 'react-dom/umd/react-dom.production.min.js'),
    'https://unpkg.com/@babel/standalone/babel.min.js':
      path.join(nodeModules, '@babel/standalone/babel.min.js')
  };
  for (const [url, localPath] of Object.entries(vendored)) {
    await page.route(url, (route) => route.fulfill({
      status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath)
    }));
  }
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  // Stale-stub the committed snapshot so the 15-min freshness gate falls back
  // to the live fixture (spec 059 pattern).
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: poolsResponse
  }));
}

async function ensureCssApplied(page) {
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() !== '',
    { timeout: 10000 }
  );
}

// The core class-scan: for every .pool-card in the results container, for
// every one of the four numeral-cell classes that EXISTS as a child, check
// one-line + nowrap + no-self-overflow + no-overlap. Returns an array of
// failure strings (empty = pass) plus the count of cells scanned, so the
// caller can report population size (non-vacuity).
const SCAN_FN = () => {
  const NUMERAL_CLASSES = ['pool-apy-hero', 'pool-apy-preview', 'pool-apy-tag', 'tvl-value'];
  const cards = Array.from(document.querySelectorAll('.pool-card'));
  const failures = [];
  let scanned = 0;

  // Page-level horizontal scroll.
  const scrollWidth = document.documentElement.scrollWidth;
  const innerWidth = window.innerWidth;
  if (scrollWidth > innerWidth + 1) {
    failures.push(`page horizontal overflow: scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`);
  }

  cards.forEach((card, cardIdx) => {
    const cellsInCard = [];
    for (const cls of NUMERAL_CLASSES) {
      const el = card.querySelector('.' + cls);
      if (!el) continue;
      const cs = getComputedStyle(el);
      // Some cells are legitimately display:none at certain breakpoints
      // (e.g. .pool-apy-preview/.pool-apy-tag in the <768px list-view mobile
      // row layout, style.css ~2998) -- "exists" means RENDERED, not merely
      // present in the DOM.
      if (cs.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      scanned++;

      // B. computed white-space === nowrap.
      if (cs.whiteSpace !== 'nowrap') {
        failures.push(`card[${cardIdx}] .${cls} "${el.textContent}": white-space="${cs.whiteSpace}" !== "nowrap"`);
      }

      // A. one line: round(height / lineHeight) === 1.
      const lineHeight = parseFloat(cs.lineHeight);
      const lines = lineHeight > 0 ? Math.round(rect.height / lineHeight) : NaN;
      if (lines !== 1) {
        failures.push(`card[${cardIdx}] .${cls} "${el.textContent}": ${lines} lines (height=${rect.height.toFixed(1)}, lineHeight=${lineHeight})`);
      }

      // D. own content doesn't overflow its own box.
      if (el.scrollWidth > el.clientWidth + 1) {
        failures.push(`card[${cardIdx}] .${cls} "${el.textContent}": scrollWidth=${el.scrollWidth} > clientWidth=${el.clientWidth} (self-overflow)`);
      }

      cellsInCard.push({ cls, text: el.textContent, rect });
    }

    // 246 finding 1b (widened, attempt 2): neighbours are DERIVED from the
    // rendered card, not hardcoded to .pool-symbol -- every rendered LEAF
    // text-bearing element in the card (an element with no child elements and
    // non-empty trimmed textContent) is a candidate neighbour, so
    // .pool-context-inline (the "on <project> · <chain>" byline the verifier
    // reproduced an overlap against) and .pool-symbol are both included
    // automatically, and so would a sixth text element added to the card
    // tomorrow. ONE exclusion, stated here rather than silently applied:
    // elements inside .pool-cta-section (the "Calculate Yield" button) are
    // left out, because a control's action label is a different semantic
    // class than passive identity/numeral text and this item's scope is the
    // numeral-vs-text collision class, not interactive controls. That
    // exclusion is not merely theoretical: including the CTA button surfaced
    // a real overlap in grid view (.tvl-value "$950000000.0B" -- the
    // pre-existing non-vacuity stress fixture for the TVL cell, tvlUsd=
    // 950e15 -- overlapping .calculate-yield-btn-new "View & calculate →")
    // that is unrelated to either of this item's two findings; it is neither
    // fixed nor further investigated here (out of scope), recorded in
    // specs/246-notes.md instead of being silently swallowed by the
    // exclusion.
    const allEls = Array.from(card.querySelectorAll('*')).filter((el) => !el.closest('.pool-cta-section'));
    const neighbours = cellsInCard.slice();
    const numeralClassSet = new Set(cellsInCard.map((c) => c.cls));
    for (const el of allEls) {
      if (el.children.length !== 0) continue; // only leaves: avoid double-counting a parent and its own child text
      const txt = (el.textContent || '').trim();
      if (!txt) continue;
      const leafCls = (el.className && typeof el.className === 'string') ? el.className.split(/\s+/)[0] : el.tagName;
      if (numeralClassSet.has(leafCls)) continue; // already scanned above as a numeral cell
      const leafCs = getComputedStyle(el);
      if (leafCs.display === 'none') continue;
      const leafRect = el.getBoundingClientRect();
      if (leafRect.width === 0 && leafRect.height === 0) continue;
      neighbours.push({ cls: leafCls || el.tagName, text: txt, rect: leafRect });
    }

    // E. no pairwise overlap between a numeral cell and any neighbour
    // (another numeral cell, or any other rendered text-bearing leaf in the
    // card -- see the derivation above for what "leaf" excludes).
    for (let i = 0; i < cellsInCard.length; i++) {
      for (let j = 0; j < neighbours.length; j++) {
        if (neighbours[j].cls === cellsInCard[i].cls && neighbours[j].text === cellsInCard[i].text) continue;
        const a = cellsInCard[i].rect;
        const b = neighbours[j].rect;
        const overlaps = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        if (overlaps) {
          failures.push(`card[${cardIdx}] .${cellsInCard[i].cls} "${cellsInCard[i].text}" overlaps .${neighbours[j].cls} "${neighbours[j].text}"`);
        }
      }
    }
  });

  return { failures, scanned, cardCount: cards.length };
};

async function runScanAssertion(page, label) {
  const { failures, scanned, cardCount } = await page.evaluate(SCAN_FN);
  if (cardCount < 1) throw new Error(`${label}: no .pool-card found`);
  if (scanned < 1) throw new Error(`${label}: no numeral cells found (scan is vacuous)`);
  if (failures.length) {
    throw new Error(`${label}: ${failures.length} failure(s) across ${scanned} numeral cells / ${cardCount} cards:\n    ` + failures.join('\n    '));
  }
  return scanned;
}

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(SCRATCH, name), fullPage: false });
  } catch (err) {
    console.log('    screenshot FAILED (' + name + '): ' + err.message);
  }
}

async function main() {
  console.log('network: unpkg.com BLOCKED (vendored React/Babel), yields.llama.fi BLOCKED (fixture snapshot)');
  console.log(`longest project slug in data/pools-snapshot.json: "${LONGEST_PROJECT_SLUG}" (${LONGEST_PROJECT_SLUG.length} chars) -- used as usdc-poly-aave's project below (246 finding 1b)`);
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const VIEWPORTS = [360, 768, 1280, 1540];
  let totalScanned = 0;
  try {
    // ---- Main listing page: list view (default) + Grid View toggle, both
    // themes, all four viewports. ----
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const source = msg.location()?.url || '';
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        pageErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });
    await routeFixtures(page, FIXTURE_RESPONSE);

    await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    await ensureCssApplied(page);

    // LIGHT theme, list view (default container is .pools-list).
    for (const width of VIEWPORTS) {
      await test(`list/light/${width}px: numeral-cell class scan`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const containerClass = await page.evaluate(() => document.querySelector('.pool-card').parentElement.className);
        if (containerClass !== 'pools-list') throw new Error(`expected pools-list container, got "${containerClass}"`);
        totalScanned += await runScanAssertion(page, `list/light/${width}px`);
      });
    }
    await shot(page, '246-list-light-1280.png');

    // Switch to Grid View (no reload — the real UI toggle).
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.view-toggle-btn[title="Grid View"]').click();
    await page.waitForFunction(
      () => { const c = document.querySelector('.pool-card'); return c && c.parentElement.className === 'pools-grid'; },
      { timeout: 5000 }
    );

    // LIGHT theme, grid view.
    for (const width of VIEWPORTS) {
      await test(`grid/light/${width}px: numeral-cell class scan`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const containerClass = await page.evaluate(() => document.querySelector('.pool-card').parentElement.className);
        if (containerClass !== 'pools-grid') throw new Error(`expected pools-grid container, got "${containerClass}"`);
        totalScanned += await runScanAssertion(page, `grid/light/${width}px`);
      });
    }
    await shot(page, '246-grid-light-1280.png');

    // Toggle to DARK theme via the real .theme-toggle button (no reload).
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.app-header-controls .theme-toggle').click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', { timeout: 5000 });

    // DARK theme, grid view (already toggled from the light pass above).
    for (const width of VIEWPORTS) {
      await test(`grid/dark/${width}px: numeral-cell class scan`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        totalScanned += await runScanAssertion(page, `grid/dark/${width}px`);
      });
    }
    await shot(page, '246-grid-dark-1280.png');

    // Back to List View, dark theme.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.view-toggle-btn[title="List View"]').click();
    await page.waitForFunction(
      () => { const c = document.querySelector('.pool-card'); return c && c.parentElement.className === 'pools-list'; },
      { timeout: 5000 }
    );

    for (const width of VIEWPORTS) {
      await test(`list/dark/${width}px: numeral-cell class scan`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        totalScanned += await runScanAssertion(page, `list/dark/${width}px`);
      });
    }
    await shot(page, '246-list-dark-1280.png');

    if (pageErrors.length) {
      console.error('page errors during main-listing run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
    await page.close();

    // ---- Pool detail page: leg (b), pinned only (already closed by 247).
    // Theme set via addInitScript + localStorage BEFORE first navigation —
    // NOT page.reload() (hangs in this sandbox). Separate page instance so
    // the main-listing pageErrors collector above isn't polluted. ----
    const detailPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const detailErrors = [];
    detailPage.on('pageerror', (err) => detailErrors.push('pageerror: ' + err.message));
    detailPage.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const source = msg.location()?.url || '';
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        detailErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });
    await detailPage.addInitScript(() => {
      try {
        localStorage.setItem('theme', 'dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      } catch (e) { /* ignore */ }
    });
    await routeFixtures(detailPage, CHIP_FIXTURE_RESPONSE);
    await detailPage.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(CHIP_POOL.pool)}`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await detailPage.waitForSelector('.pool-detail-view', { timeout: 15000 });
    await detailPage.waitForFunction(() => document.querySelector('.pool-token-chip'), { timeout: 15000 });
    await ensureCssApplied(detailPage);

    await test('F. .pool-token-chip computed font-family === body computed font-family', async () => {
      const r = await detailPage.evaluate(() => ({
        chip: getComputedStyle(document.querySelector('.pool-token-chip')).fontFamily,
        body: getComputedStyle(document.body).fontFamily
      }));
      if (r.chip !== r.body) throw new Error(`chip font-family "${r.chip}" !== body font-family "${r.body}"`);
    });

    await test('G. .pool-token-chip computed text-transform !== "uppercase"', async () => {
      const v = await detailPage.evaluate(() =>
        getComputedStyle(document.querySelector('.pool-token-chip')).textTransform);
      if (v === 'uppercase') throw new Error(`text-transform is "uppercase" (238 mono-caps remnant regressed)`);
    });

    await shot(detailPage, '246-pool-detail-dark-1280.png');

    if (detailErrors.length) {
      console.error('page errors during pool-detail run:\n' + detailErrors.join('\n'));
      process.exitCode = 1;
    }
    await detailPage.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`numeral cells scanned across all combinations: ${totalScanned}`);
  console.log(`✓ ${passed}/${total} card-numeral-wrap assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_card_numeral_wrap crashed: ' + err.message);
  process.exitCode = 1;
});
