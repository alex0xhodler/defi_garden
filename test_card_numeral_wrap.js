/* Playwright behavior gate for specs 246 + 260 + 274: pool card numeral cells
   get a wrap discipline, must never intersect any other element of the same
   card, and (274) must never be clipped by their OWN card's edge in grid
   view. Drives the REAL rendered UI (http-server + chromium) and asserts on
   the rendered DOM via computed styles — never on source strings — per the
   2026-07-11 standing decision.

   RAZOR (product-loop-kit/RAZOR.md): assert the CLASS, not the instance. The
   population of "numeral cells" is derived from the RENDERED DOM at test
   time — for every .pool-card in the results container, every one of
   .pool-apy-hero / .pool-apy-preview / .pool-apy-tag / .tvl-value that
   EXISTS is scanned and asserted, rather than hard-coding which pool has
   which cell. If this defect reappears in a different numeral cell of a pool
   card tomorrow, this scan catches it (see "Coverage boundary" below). Spec
   260 attempt-2 finding 2: this claim is now enforced, not just asserted —
   NUMERAL_CLASS_COVERAGE below fails the run if any of the four classes was
   scanned zero times across the whole run (a fixture-population gap, not a
   CSS defect, previously let .pool-apy-tag go unscanned silently).

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
      element's box within the same .pool-card (no encroachment), EXCEPT
      elements inside .pool-cta-section — see "Leg B: abandoned" below for
      why that one exclusion is retained. The neighbour set is otherwise
      DERIVED from the rendered card: every element with no child elements
      and non-empty trimmed text is a candidate neighbour, so
      .pool-context-inline (the "on <project> · <chain>" byline) and
      .pool-symbol are both covered automatically, and so would any future
      passive-text element added to the card.
   H. (spec 260 AC-4) every existing numeral cell's computed text-overflow
      !== 'ellipsis' — a fix that removes an E overlap by truncating the
      NUMBER instead of reserving space for it is a fail regardless of
      whether the overlap is gone (trust rail, CLAUDE.md); asserted
      separately from D because D only catches unclipped internal overflow,
      not this specific fix-shape.
   I. (spec 260 attempt-3, verifier finding) for every view×theme×viewport
      combination where `.pool-columns` actually RENDERS (derived from the
      DOM each time — computed display !== 'none' — never hardcoded as "only
      >=768px", even though that's where the `@media (max-width: 767px) {
      .pool-columns { display: none } }` rule in style.css happens to put
      it): `.pool-columns .col-apy`'s right edge === `.pool-apy-hero`'s right
      edge, and `.pool-columns .col-tvl`'s right edge === `.tvl-value`'s
      right edge, within 1px, for every NON-ANOMALOUS `.pool-card` (a card
      whose `.pool-apy-hero` does NOT also carry `apy-anomalous` — app.js
      marks the anomaly-flagged hero with that exact second class,
      app.js:3034 — derived from the DOM, not from fixture ids). Neither
      attempt 1's nor attempt 2's AC-3 methodology ever captured
      `.pool-columns`'s rects — both measured only `.pool-card`'s own numeral
      cells — which is how attempt 2 shipped a `.pool-columns` template
      change (`110px 130px` -> `auto auto`) that left every numeral cell
      individually well-behaved (checks A/B/D/H all green) while silently
      detaching the header row from the data rows by ~108px on the APY
      column at 768/1280px, on every completely normal row, on every
      `?token=`/`?chain=` sitemap URL — see specs/260-notes.md "Attempt 3"
      for the full incident writeup and the two non-vacuity transcripts
      (re-applying the shipped `.pool-columns` regression, and separately
      neutering the `.pool-tvl-section` min-width floor below) proving this
      check would have caught it.
   J. (spec 274) GRID VIEW ONLY: every existing numeral cell's bounding rect
      is fully CONTAINED inside its `.pool-card`'s own bounding rect (all
      four edges, 1px tolerance) — the gap check D can't see, because a
      `white-space: nowrap` numeral's OWN box always sizes exactly to its
      content (scrollWidth === clientWidth trivially), so D passes even when
      the whole box has been laid out past the card's right edge and silently
      clipped by `.pool-card`'s `overflow: hidden` (style.css ~3195) — the
      live defect (specs/274.md). Additionally, for every card where every one
      of its numeral cells passes the containment check above, `.pool-card`'s
      own `scrollWidth <= clientWidth + 1` is asserted too (no clipping-
      ancestor overflow at all) — EXCEPT when the card's overflow is
      DOM-provably caused by a non-numeral leaf (see "Coverage boundary of
      check J" below): that case is logged, counted, and excluded from the
      hard assertion rather than silently passed or force-failed on a defect
      outside this item's scope. Checked at all 4 viewports, both themes,
      grid view only (list view's `.pool-card` has a different, unrelated
      layout — see CLAUDE.md/specs/274.md, this item does not touch it).
   Plus, on /?pool=<id> (leg b, already closed by 247 — pinned only):
   F. .pool-token-chip computed font-family === body's computed font-family.
   G. .pool-token-chip computed text-transform !== 'uppercase'.
   Zero page errors throughout (reuses the ignorable-error filter).

   Leg B: ABANDONED (spec 260 attempt-2, operator decision — do not re-argue,
   see specs/260-notes.md "Attempt 2"). Leg B was a CSS remedy for instance
   (ii) — .tvl-value x .calculate-yield-btn-new, grid view, 1280/1540px, both
   themes — the collision the .pool-cta-section exclusion below is hiding.
   Attempt 1 shipped a leg-B CSS fix, but the verifier measured it moved the
   .pools-grid closing-line hairline boundary on completely NORMAL cards by
   89px @360, 497px @768, ~46px @1280/1540, in both themes — a visible,
   never-approved design regression on every card of the analytics grid, the
   surface every parameterized ?token=/?chain= URL renders, to buy a fix for
   a defect that is UNREACHABLE from live data (0 of 7,334 live pools:
   max live TVL $17,707,651,767 -> formatCurrency renders "$17.7B", 6 chars,
   nowhere near the CTA). The spec's own Change section pre-authorized
   exactly this outcome ("if leg B has no CSS remedy that satisfies the
   constraints, ship leg A, state leg B open with the number, and do NOT
   widen the guard's neighbour set past what stays green"). So: the
   .pool-cta-section exclusion below is RETAINED, .pools-grid's CSS is
   byte-identical to pre-260 main, and instance (ii) is REPRODUCED (proven
   red without the exclusion — see the non-vacuity transcript in
   specs/260-notes.md) but NOT fixed and NOT guarded in the shipped gate.

   Coverage boundary of check E, stated plainly (RAZOR): the derivation
   covers every rendered .pool-card in THIS test's population, MINUS
   .pool-cta-section (leg B, above). It does NOT cover, and cannot catch:
   (1) a pairing this file's fixture population doesn't render; (2) any
   numeral-vs-interactive-control collision inside .pool-cta-section — by
   construction, this is instance (ii) itself, left open; (3) numeral cells
   OUTSIDE .pool-card entirely — the planner (planner.js/plan.html), the
   pool-detail page body (PoolDetail.js, e.g. TVL/APY figures rendered there
   under different classes) and the ~4,400 generated static token/chain
   pages' own numeral renderings all use different classes/components and
   are guarded by nothing here (specs/260.md "Class closed by this item" —
   recorded, not ticketed, absent evidence of a live defect there). Two
   fixture pairings worth naming explicitly: the usdc-poly-aave fixture pool
   (relabeled to LONGEST_PROJECT_SLUG) is deliberately paired with a
   REALISTIC (non-anomalous) APY — proving the long-slug byline does not
   collide with a normal-magnitude hero, NOT that a long slug + anomalous APY
   never collides at 768px pre-fix (it did, reproduced in 246's session, and
   the leg-A fix in this item closes it — see specs/260-notes.md); the
   usdc-worst-live-apy fixture pool carries the ACTUAL highest live
   apyBase+apyReward pool's real project/chain (derived at test-run time
   below, spec 260 AC-1) — at 768px its hero box DOES exceed its 110px track
   pre-fix, but its byline is too short to reach the spilled region, so this
   specific live pairing was reachable-but-not-colliding even before the fix
   (specs/260-notes.md has the pixel numbers); it is asserted here so a real
   snapshot-derived pool, not only invented magnitudes, stays in the guarded
   population.

   Coverage boundary of check I, stated plainly (RAZOR, and the honest trade
   spec 260 attempt-3 asks to state, not hide): check I only asserts on
   NON-ANOMALOUS rows (no `apy-anomalous` class on that row's hero) by
   design. On an ANOMALOUS row, `.pool-apy-hero`'s own track (`.pool-card`'s
   grid track 3, `auto`-sized) grows to fit the "⚠ 36,452.38%"-shaped string,
   and that growth is what leg A's fix exists to allow — the alternative is
   the pre-246 defect (the numeral overflowing into the byline neighbour).
   `.pool-columns`'s track 3 stays fixed at 110px (this file's own
   non-vacuity trial 1, below, proves growing it to `auto` instead breaks
   NORMAL-row alignment, which is the opposite of a fix). So an anomalous
   row's hero can legitimately drift out from under the "APY" header label —
   this check does not assert on that row, on purpose, rather than either
   hiding the drift behind a wider tolerance or forcing the numeral to
   truncate (which AC-4/check H forbids). This is the same trade instance
   (i)'s fix always implied; it was just never written down against a
   concrete pixel measurement until now (see specs/260-notes.md "Attempt 3").

   Coverage boundary of check J (RAZOR, same honesty bar as checks E/I above):
   measurement surfaced a SEPARATE, PRE-EXISTING defect this item does not fix
   or cause — an extremely long project-slug byline (`.pool-context-inline`,
   e.g. `usdc-poly-aave`, non-anomalous ~45.67% APY) can by itself blow out
   `.pool-header-new` via flexbox's default `min-width: auto` on
   `.pool-left-section`/`.pool-name-group`, unrelated to any numeral's width.
   Reproduced on a clean pre-274 baseline (specs/274-notes.md), so it's out of
   this item's "grid-card containment [for numerals] only" scope (specs/274.md
   "Class closed by this item"). An unconditional `card.scrollWidth <=
   clientWidth` would go red on this fixture for the wrong reason, so the
   ancestor-scrollWidth assertion only hard-fails when the overflow is
   attributable to a NUMERAL cell (i.e. that cell already fails the
   containment check above). A card that overflows with every numeral cell
   individually contained is logged, not silently dropped or hidden — see
   RUN_CONTAINMENT.excusedByline — same treatment as check E's
   `.pool-cta-section` exclusion and check I's anomalous-row exclusion. Left
   OPEN beyond this logging, out of scope here (different bug class: sibling
   min-content escape, not numeral-track escape).

   Harness notes learned the hard way (do not "fix" these):
   - `page.goto` uses waitUntil: 'domcontentloaded', NOT 'load' — 'load' hangs
     in this sandbox (unreachable analytics/font hosts never fire their load
     event even when routed/aborted).
   - Theme is switched via the real .theme-toggle button (no page.reload() —
     reload also hangs here). The pool-detail navigation sets dark mode via
     page.addInitScript + localStorage BEFORE that page's first navigation,
     for the same reason.

   Fixture-routed, sandbox-safe: clones test_list_polish.js's server +
   routeFixtures + stale-snapshot stub verbatim. Exactly 9 pools (==
   itemsPerPage, app.js:929) so ALL of them render on page 1 — no ranking
   arithmetic needed, and the [4,4,1] grid-row shape at 1280/1540 the
   operator measured on main is preserved. Includes an anomaly-flagged pool
   (apyBase far above APY_SANITY_LIMIT, so the hero renders "⚠ …" — the
   positive control from the operator's pre-change measurement), a near-zero
   (~$0.00/day magnitude) yielding pool, and a 0-yield pool (renders
   .pool-apy-tag) — spec 260 attempt-2 finding 2: see the FIXTURE_POOLS block
   comment below for why the fixture is exactly 9, not 11 (0-yield pools sort
   last of ALL fixture pools regardless of TVL, app.js:2003-2008/2193-2196,
   so a fixture with too many yielding pools silently pushes the 0-yield one
   off page 1 and .pool-apy-tag is never scanned).

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

// Spec 260 AC-1/Population: the highest LIVE apyBase+apyReward pool and its
// REAL project/chain, derived at test time from the same snapshot pass
// (not hardcoded) -- reuses SNAPSHOT_FOR_LONGEST_SLUG rather than reading
// the file twice. Printed below (non-vacuity: the value used is visible in
// the run's own output). specs/260-notes.md records the AC-1 measurement:
// at 768px list view this pairing's hero box (132.05px) DOES exceed its
// 110px track, but the byline ("zeebu · BSC", 12 chars) is far too short to
// reach the spilled-over region -- reachable-but-not-reproducing, i.e. this
// specific live pairing does NOT collide with .pool-context-inline even
// pre-fix. It is asserted here anyway (not just noted) because after the
// leg-A fix the hero's track grows to fit it exactly regardless, and this
// keeps a REAL worst-case pool permanently in the guard's population rather
// than only ever exercising invented magnitudes.
let WORST_LIVE_APY_POOL = null;
for (const p of SNAPSHOT_FOR_LONGEST_SLUG.pools) {
  const total = (p.apyBase || 0) + (p.apyReward || 0);
  if (!WORST_LIVE_APY_POOL || total > WORST_LIVE_APY_POOL.total) {
    WORST_LIVE_APY_POOL = { project: p.project, chain: p.chain, total };
  }
}

// DefiLlama-shaped fixture (mirrors test_list_polish.js): sized above
// DEFAULT_MIN_TVL ($10M) so trust-rail filtering never hides them.
function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
// Spec 260 attempt-2 finding 2: itemsPerPage is 9 (app.js:929) and the
// default sort is TVL-desc with 0-yield pools demoted below EVERY yielding
// pool regardless of their own TVL (app.js:2003-2008/2193-2196, "Yielding
// pools before no-supply-yield pools, then TVL desc") -- attempt 1's 11-pool
// fixture (2 plain aave-v3 fillers too many) pushed usdc-near-zero (a
// yielding pool, would-be rank 10) AND usdc-base-collateral (0-yield, always
// sorts last of ALL pools in the fixture no matter its TVL -- raising its
// TVL cannot fix this, only shrinking the yielding-pool count can) off page
// 1, so .pool-apy-tag was scanned zero times despite the file's claim to
// enumerate every numeral cell that renders. Fixed by dropping the fixture
// to exactly 9 pools total (== itemsPerPage, so ALL of them render on page
// 1, no ranking arithmetic needed): the two interchangeable plain-aave-v3
// fillers usdc-opt-aave/usdc-avax-aave are removed outright (their only job
// was padding the [4,4,1] grid-row count, which usdc-near-zero and
// usdc-base-collateral now do instead), every other stress fixture is kept
// verbatim. This was verified empirically (real Playwright run against the
// real sort, not by TVL arithmetic alone) -- see specs/260-notes.md
// "Attempt 2" for the printed roster and per-class scan counts.
const FIXTURE_POOLS = [
  // Positive control: apyBase (36,452.38%) is far above APY_SANITY_LIMIT
  // (1000%, app.js:800) -> isAnomalousApy() true -> hero renders
  // "⚠ 36,452.38%". This is the live defect the operator measured on main.
  makePool('usdc-anomaly', 'weird-farm', 'USDC', 'Ethereum', 20_000_000, 36452.38),
  // 0-yield pool -> hasNoSupplyYield() true -> renders .pool-apy-tag instead
  // of .pool-apy-hero's sibling .pool-apy-preview. Sorts LAST of all 9
  // fixture pools unconditionally (0-yield demotion beats TVL, see the block
  // comment above) -- TVL only needs to clear the trust-rail floor, its
  // magnitude relative to siblings is irrelevant to rank here.
  makePool('usdc-base-collateral', 'some-lend', 'USDC', 'Base', 45_000_000, 0),
  // Near-zero yield (still >= NO_SUPPLY_YIELD_EPSILON so it keeps the
  // .pool-apy-preview $/day cell) -> $1000 * (0.01%/365) rounds to $0.00/day,
  // the smallest realistic magnitude for that cell. Lowest TVL among the 8
  // yielding pools -> ranks 8th of 8 yielding, still on page 1.
  makePool('usdc-near-zero', 'quiet-vault', 'USDC', 'Ethereum', 12_000_000, 0.01),
  // Spec 274 Population: a normal 2-digit-before-the-decimal APY, well under
  // APY_SANITY_LIMIT -> non-anomalous, no ⚠ -- the "should never move"
  // control for check J's containment assertion and the pixel-drift proof
  // (specs/274-notes.md). Was 5.9 (1-digit) pre-274; retargeted, no other
  // comment in this file pins the old value.
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 45.67),
  // Spec 274 Population: a 3-digit-before-the-decimal APY (705.51%, the exact
  // magnitude class of the human's live "WETH-CBBTC 705.51" clip report) --
  // still under the 1000% sanity limit, so non-anomalous/no ⚠, same as the
  // live case. Was 4.8 (1-digit) pre-274; retargeted, no other comment in
  // this file pins the old value.
  makePool('usdc-arb-aave', 'aave-v3', 'USDC', 'Arbitrum', 70_000_000, 705.51),
  // 246 finding 1b: this pool's project is the LONGEST project slug actually
  // present in data/pools-snapshot.json (computed above, not hardcoded),
  // paired with a realistic (non-anomalous) APY -- exercises the widened
  // neighbour-overlap check (E) against a real-world-shaped worst case, not
  // an invented one.
  makePool('usdc-poly-aave', LONGEST_PROJECT_SLUG, 'USDC', 'Polygon', 30_000_000, 3.1),
  // Spec 260 AC-1/Population: real project/chain of the LIVE worst
  // apyBase+apyReward pool (computed above, not hardcoded). TVL kept at 18M
  // (already >= DEFAULT_MIN_TVL's $10M floor per specs/260.md) rather than
  // the live pool's actual $555,125 TVL, specifically so this fixture
  // renders at all -- the real pool's apyReward-shaped total is passed
  // through makePool's apyBase parameter since app.js sums
  // apyBase+apyReward identically for display, so which field carries the
  // number doesn't change what renders.
  makePool('usdc-worst-live-apy', WORST_LIVE_APY_POOL.project, 'USDC', WORST_LIVE_APY_POOL.chain, 18_000_000, WORST_LIVE_APY_POOL.total),
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
  //
  // Spec 260 AC-2: project relabeled from 'glitch-farm' to LONGEST_PROJECT_SLUG
  // (same slug usdc-poly-aave carries above, at a realistic 3.1% APY) --
  // pairing that same 57-char slug with this pool's ALREADY-anomalous
  // apyBase (9999999.99) reproduces the EXACT instance (i) collision
  // (.pool-apy-hero x .pool-context-inline, list view, 768px) that 246 left
  // open and specs/260-notes.md documents as reproducing pre-fix. Asserting
  // it here, in the officially green population, proves the leg-A fix in the
  // shipped CSS -- not just a scratch reproduction outside the test file.
  makePool('usdc-daypreview-glitch', LONGEST_PROJECT_SLUG, 'USDC', 'Ethereum', 15_000_000, 9999999.99),
  // Spec 274 Population: retargeted from 3.0 (non-anomalous) to 3385.12 --
  // the exact 4-digit-before-the-decimal magnitude class of the human's live
  // "IDAI-IUSDC-IUSDT ⚠ 3,385.12%" clip report (anomalous, >1000% sanity
  // limit -> ⚠ prefix, matching the live case exactly). Doubles this pool's
  // existing job (line ~453's TVL-glitch/leg-B comment, unaffected -- that
  // exclusion is about .tvl-value's string width, not apyBase) as the
  // 4-digit-anomalous member of check J's digit-count population, rather
  // than adding a 10th fixture pool and disturbing the exactly-9/itemsPerPage
  // page-1 discipline documented above (spec 260 attempt-2 finding 2).
  makePool('usdc-tvl-glitch', 'glitch-vault', 'USDC', 'Ethereum', 950_000_000_000_000_000, 3385.12)
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
// failure strings (empty = pass) plus the count of cells scanned (and a
// per-class breakdown, spec 260 attempt-2 finding 2), so the caller can
// report population size AND per-class coverage (non-vacuity).
const SCAN_FN = () => {
  const NUMERAL_CLASSES = ['pool-apy-hero', 'pool-apy-preview', 'pool-apy-tag', 'tvl-value'];
  const cards = Array.from(document.querySelectorAll('.pool-card'));
  const failures = [];
  let scanned = 0;
  const classCounts = { 'pool-apy-hero': 0, 'pool-apy-preview': 0, 'pool-apy-tag': 0, 'tvl-value': 0 };

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
      classCounts[cls]++;

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

      // Spec 260 AC-4: a fix that removes the overlap by ellipsizing the
      // NUMBER is a fail regardless of whether the overlap is gone (trust
      // rail, CLAUDE.md) -- distinct from D above (D catches unclipped
      // internal overflow; this catches the fix-shape that would make D
      // pass by truncating instead of reserving space). Scoped to numeral
      // cells only: a CTA button label ellipsizing is fine (leg B) and is
      // asserted separately, not here.
      if (cs.textOverflow === 'ellipsis') {
        failures.push(`card[${cardIdx}] .${cls} "${el.textContent}": text-overflow="ellipsis" (numeral truncation, spec 260 AC-4 trust-rail fail)`);
      }

      cellsInCard.push({ cls, text: el.textContent, rect });
    }

    // 246 finding 1b (widened, attempt 2) + spec 260: neighbours are DERIVED
    // from the rendered card, not hardcoded to .pool-symbol -- every
    // rendered LEAF text-bearing element in the card (an element with no
    // child elements and non-empty trimmed textContent) is a candidate
    // neighbour, so .pool-context-inline (the "on <project> · <chain>"
    // byline) and .pool-symbol are both included automatically, and so would
    // a sixth text element added to the card tomorrow.
    //
    // Spec 260 attempt-2 finding 1 (operator decision — leg B abandoned, see
    // the file header comment "Leg B: ABANDONED"): the `!el.closest(
    // '.pool-cta-section')` exclusion below is RETAINED, not removed.
    // Attempt 1 removed it after shipping a leg-B CSS fix for instance (ii)
    // (.tvl-value x .calculate-yield-btn-new, grid view, 1280/1540px); that
    // CSS fix was reverted (it moved the .pools-grid closing-line hairline
    // on every normal card by up to ~497px, an unapproved visible design
    // regression, to buy a fix for a defect that is UNREACHABLE from live
    // data — 0 of 7,334 live pools, max live TVL $17.7B / 6 chars). With the
    // CSS reverted, removing this exclusion would make the gate
    // PERMANENTLY RED on the shipped usdc-tvl-glitch stress fixture, which
    // is not a gate (specs/260.md's own instruction). Instance (ii) is
    // reproduced (proven red without this exclusion — non-vacuity transcript
    // in specs/260-notes.md "Attempt 2") but left open, unguarded, with the
    // number, exactly as specs/260.md's Change section pre-authorized.
    const allEls = Array.from(card.querySelectorAll('*'));
    const neighbours = cellsInCard.slice();
    const numeralClassSet = new Set(cellsInCard.map((c) => c.cls));
    for (const el of allEls) {
      if (el.children.length !== 0) continue; // only leaves: avoid double-counting a parent and its own child text
      if (el.closest('.pool-cta-section')) continue; // spec 260: leg B abandoned, see above
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

  return { failures, scanned, cardCount: cards.length, classCounts };
};

// Spec 260 attempt-2 finding 2: running total across every view x theme x
// viewport combination in the run, so a class scanned zero times across the
// WHOLE run (not just one combination) is caught -- see main()'s final
// assertion below.
const RUN_CLASS_COUNTS = { 'pool-apy-hero': 0, 'pool-apy-preview': 0, 'pool-apy-tag': 0, 'tvl-value': 0 };

async function runScanAssertion(page, label) {
  const { failures, scanned, cardCount, classCounts } = await page.evaluate(SCAN_FN);
  if (cardCount < 1) throw new Error(`${label}: no .pool-card found`);
  if (scanned < 1) throw new Error(`${label}: no numeral cells found (scan is vacuous)`);
  if (failures.length) {
    throw new Error(`${label}: ${failures.length} failure(s) across ${scanned} numeral cells / ${cardCount} cards:\n    ` + failures.join('\n    '));
  }
  for (const cls of Object.keys(classCounts)) RUN_CLASS_COUNTS[cls] += classCounts[cls];
  return scanned;
}

// Spec 260 attempt-3, check I: header/row column alignment. Self-detects
// applicability from the rendered DOM (`.pool-columns` present AND its
// computed display !== 'none') rather than assuming the >=768px breakpoint
// from style.css, so this stays correct even if that breakpoint value ever
// moves. "Non-anomalous" is likewise derived from the DOM: app.js marks the
// anomaly-flagged hero with a second `apy-anomalous` class (app.js:3034) --
// a card whose `.pool-apy-hero` carries that class is skipped, not asserted
// on (see the file header's "Coverage boundary of check I" for why that
// exclusion is intentional, not a hole).
const COLUMN_ALIGN_FN = () => {
  const cols = document.querySelector('.pool-columns');
  const applicable = !!cols && getComputedStyle(cols).display !== 'none';
  if (!applicable) return { applicable: false, failures: [], checked: 0 };

  const colApyRight = cols.querySelector('.col-apy').getBoundingClientRect().right;
  const colTvlRight = cols.querySelector('.col-tvl').getBoundingClientRect().right;
  const cards = Array.from(document.querySelectorAll('.pool-card'));
  const failures = [];
  let checked = 0;

  const checkCell = (el, label, targetRight) => {
    if (!el) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    checked++;
    const drift = rect.right - targetRight;
    if (Math.abs(drift) > 1) {
      failures.push(`${label} "${el.textContent}": right=${rect.right.toFixed(2)} vs header col right=${targetRight.toFixed(2)} -> drift=${drift.toFixed(2)}px`);
    }
  };

  for (const card of cards) {
    if (card.querySelector('.apy-anomalous')) continue; // anomalous row: intentionally not asserted, see file header
    checkCell(card.querySelector('.pool-apy-hero'), '.pool-apy-hero vs .col-apy', colApyRight);
    checkCell(card.querySelector('.tvl-value'), '.tvl-value vs .col-tvl', colTvlRight);
  }

  return { applicable: true, failures, checked };
};

// Spec 260 attempt-3: running totals across the whole run, mirroring
// RUN_CLASS_COUNTS's non-vacuity pattern above -- so a check I that silently
// never applies to anything (e.g. a future markup change that removes
// .pool-columns from the DOM in list view) fails loud instead of the run
// quietly passing on zero assertions.
const RUN_COLUMN_ALIGN = { applicableCombos: 0, checked: 0 };

async function runColumnAlignmentAssertion(page, label) {
  const { applicable, failures, checked } = await page.evaluate(COLUMN_ALIGN_FN);
  if (!applicable) return { applicable: false, checked: 0 };
  if (checked < 1) throw new Error(`${label}: .pool-columns rendered but zero non-anomalous numeral cells were checked (check I is vacuous here)`);
  if (failures.length) {
    throw new Error(`${label}: ${failures.length} header/row column alignment failure(s) across ${checked} non-anomalous numeral cells:\n    ` + failures.join('\n    '));
  }
  RUN_COLUMN_ALIGN.applicableCombos++;
  RUN_COLUMN_ALIGN.checked += checked;
  return { applicable: true, checked };
}

// Spec 274, check J: grid-view numeral containment against the CARD (not
// just the numeral's own box, which D already covers and which is always
// trivially satisfied by a nowrap element -- see the file header's check J
// description). Population is DOM-derived: the same NUMERAL_CLASSES list
// SCAN_FN uses, re-declared here (this file's existing pattern -- see
// COLUMN_ALIGN_FN above, which likewise re-derives its own element set
// rather than sharing a closure, since page.evaluate() callbacks run in the
// browser with no access to this file's module scope).
const CONTAINMENT_FN = () => {
  const NUMERAL_CLASSES = ['pool-apy-hero', 'pool-apy-preview', 'pool-apy-tag', 'tvl-value'];
  const cards = Array.from(document.querySelectorAll('.pool-card'));
  const failures = [];
  const excusedByline = []; // see "Coverage boundary of check J" in the file header
  let checked = 0;

  cards.forEach((card, cardIdx) => {
    const cardRect = card.getBoundingClientRect();
    const numeralCells = [];
    for (const cls of NUMERAL_CLASSES) {
      const el = card.querySelector('.' + cls);
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      checked++;
      const contained = rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1
        && rect.top >= cardRect.top - 1 && rect.bottom <= cardRect.bottom + 1;
      if (!contained) {
        failures.push(`card[${cardIdx}] .${cls} "${el.textContent}": rect=[${rect.left.toFixed(1)},${rect.right.toFixed(1)}] not contained in card=[${cardRect.left.toFixed(1)},${cardRect.right.toFixed(1)}]`);
      }
      numeralCells.push({ cls, contained });
    }

    const cardOverflows = card.scrollWidth > card.clientWidth + 1;
    if (!cardOverflows) return; // fully clean card, nothing more to check
    const anyNumeralUncontained = numeralCells.some((c) => !c.contained);
    if (anyNumeralUncontained) return; // already reported above; no need to duplicate via the ancestor check
    // Card overflows but every numeral cell (if any) is individually
    // contained -- per the file header's "Coverage boundary of check J",
    // this is the pre-existing, out-of-scope, non-numeral (byline) overflow
    // class, not a 274 regression. Logged and excluded, not silently passed.
    excusedByline.push(`card[${cardIdx}]: scrollWidth=${card.scrollWidth} > clientWidth=${card.clientWidth}, but all ${numeralCells.length} numeral cell(s) contained -- excused as pre-existing non-numeral overflow, see "Coverage boundary of check J"`);
  });

  return { failures, checked, excusedByline, cardCount: cards.length };
};

const RUN_CONTAINMENT = { checked: 0, excusedByline: 0, combos: 0 };

async function runContainmentAssertion(page, label) {
  const { failures, checked, excusedByline, cardCount } = await page.evaluate(CONTAINMENT_FN);
  if (cardCount < 1) throw new Error(`${label}: no .pool-card found (check J is vacuous here)`);
  if (checked < 1) throw new Error(`${label}: no numeral cells found (check J is vacuous here)`);
  if (failures.length) {
    throw new Error(`${label}: ${failures.length} grid-card containment failure(s) across ${checked} numeral cells / ${cardCount} cards:\n    ` + failures.join('\n    '));
  }
  RUN_CONTAINMENT.checked += checked;
  RUN_CONTAINMENT.excusedByline += excusedByline.length;
  RUN_CONTAINMENT.combos++;
  if (excusedByline.length) {
    console.log(`    (check J) ${label}: ${excusedByline.length} card(s) excused (pre-existing non-numeral overflow, see file header):`);
    excusedByline.forEach((l) => console.log('      ' + l));
  }
  return { checked, excusedByline: excusedByline.length };
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
  console.log(`highest live apyBase+apyReward in data/pools-snapshot.json: ${WORST_LIVE_APY_POOL.project} / ${WORST_LIVE_APY_POOL.chain} @ ${WORST_LIVE_APY_POOL.total.toFixed(2)}% -- used as usdc-worst-live-apy below (spec 260 AC-1)`);
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

    // Spec 260 attempt-2 finding 2: print the ACTUAL rendered page-1 roster
    // (real DOM order, not the fixture's declaration order) so the ranking
    // this test relies on is provable, not just derived on paper.
    const roster = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.pool-card')).map((card, i) => {
        const symbol = card.querySelector('.pool-symbol')?.textContent || '';
        const ctx = card.querySelector('.pool-context-inline')?.textContent || '';
        const hasTag = !!card.querySelector('.pool-apy-tag');
        return `  [${i}] ${symbol} — ${ctx}${hasTag ? ' (0-yield, .pool-apy-tag)' : ''}`;
      }));
    console.log(`rendered page-1 roster (${roster.length} cards):\n` + roster.join('\n'));

    // LIGHT theme, list view (default container is .pools-list).
    for (const width of VIEWPORTS) {
      await test(`list/light/${width}px: numeral-cell class scan`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const containerClass = await page.evaluate(() => document.querySelector('.pool-card').parentElement.className);
        if (containerClass !== 'pools-list') throw new Error(`expected pools-list container, got "${containerClass}"`);
        totalScanned += await runScanAssertion(page, `list/light/${width}px`);
      });
      await test(`list/light/${width}px: header/row column alignment (check I)`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        await runColumnAlignmentAssertion(page, `list/light/${width}px`);
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
      // Check I is applicability-gated (`.pool-columns` doesn't exist in grid
      // view's DOM at all -- viewMode !== 'list' means React never renders
      // it, not merely CSS-hidden) -- called anyway so that fact is derived
      // from the DOM each run rather than assumed by omission.
      await test(`grid/light/${width}px: header/row column alignment (check I, expect not-applicable)`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const result = await runColumnAlignmentAssertion(page, `grid/light/${width}px`);
        if (result.applicable) throw new Error(`grid/light/${width}px: expected .pool-columns to be absent in grid view, but check I found it applicable`);
      });
      await test(`grid/light/${width}px: card containment (check J)`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(600); // let AnimatedNumber settle to its final width before measuring
        await runContainmentAssertion(page, `grid/light/${width}px`);
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
      await test(`grid/dark/${width}px: header/row column alignment (check I, expect not-applicable)`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const result = await runColumnAlignmentAssertion(page, `grid/dark/${width}px`);
        if (result.applicable) throw new Error(`grid/dark/${width}px: expected .pool-columns to be absent in grid view, but check I found it applicable`);
      });
      await test(`grid/dark/${width}px: card containment (check J)`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(600); // let AnimatedNumber settle to its final width before measuring
        await runContainmentAssertion(page, `grid/dark/${width}px`);
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
      await test(`list/dark/${width}px: header/row column alignment (check I)`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        await runColumnAlignmentAssertion(page, `list/dark/${width}px`);
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
  console.log('per-class scan counts across all view x theme x viewport combinations:');
  console.log('  ' + Object.entries(RUN_CLASS_COUNTS).map(([cls, n]) => `.${cls}=${n}`).join('  '));

  // Spec 260 attempt-2 finding 2: enforce the file's own coverage claim
  // ("the scan enumerates every numeral cell that exists in every rendered
  // .pool-card") instead of just asserting it in prose -- if the fixture
  // ever regresses back to a population gap (a class rendered nowhere on
  // page 1), this turns the gate red instead of silently passing with
  // partial coverage.
  const uncovered = Object.entries(RUN_CLASS_COUNTS).filter(([, n]) => n === 0).map(([cls]) => cls);
  if (uncovered.length) {
    console.error(`✗ NUMERAL_CLASS_COVERAGE: class(es) never scanned across the whole run: ${uncovered.join(', ')} (fixture-population gap, spec 260 attempt-2 finding 2)`);
    process.exitCode = 1;
  } else {
    console.log('✓ NUMERAL_CLASS_COVERAGE: all 4 numeral classes scanned at least once');
  }

  // Spec 260 attempt-3, check I: non-vacuity of the header/row alignment
  // check itself -- .pool-columns is applicable in list view at 768/1280/
  // 1540px (3 widths) x 2 themes = 6 combinations expected; if that count
  // ever drops to 0 (e.g. a future markup change stops rendering
  // .pool-columns in list view, or every fixture row becomes anomalous) the
  // check would otherwise pass by never running.
  console.log(`header/row column alignment (check I): ${RUN_COLUMN_ALIGN.checked} non-anomalous numeral cells checked across ${RUN_COLUMN_ALIGN.applicableCombos} applicable view x theme x viewport combinations`);
  if (RUN_COLUMN_ALIGN.applicableCombos < 1 || RUN_COLUMN_ALIGN.checked < 1) {
    console.error('✗ COLUMN_ALIGNMENT_COVERAGE: check I never asserted on any applicable combination (vacuous, spec 260 attempt-3)');
    process.exitCode = 1;
  } else {
    console.log('✓ COLUMN_ALIGNMENT_COVERAGE: check I asserted on at least one non-anomalous row in every applicable combination');
  }

  // Spec 274, check J: non-vacuity -- expected applicable at all 4 grid
  // viewports x 2 themes = 8 combinations; if that count ever drops to 0
  // (e.g. a future markup change stops rendering .pool-card in grid view)
  // the check would otherwise pass by never running.
  console.log(`grid-card containment (check J): ${RUN_CONTAINMENT.checked} numeral cells checked across ${RUN_CONTAINMENT.combos} grid view x theme x viewport combinations (${RUN_CONTAINMENT.excusedByline} card(s) excused as pre-existing non-numeral overflow, see file header "Coverage boundary of check J")`);
  if (RUN_CONTAINMENT.combos < 1 || RUN_CONTAINMENT.checked < 1) {
    console.error('✗ CONTAINMENT_COVERAGE: check J never asserted on any combination (vacuous, spec 274)');
    process.exitCode = 1;
  } else {
    console.log('✓ CONTAINMENT_COVERAGE: check J asserted on at least one numeral cell in every grid view x theme x viewport combination');
  }

  console.log(`✓ ${passed}/${total} card-numeral-wrap assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_card_numeral_wrap crashed: ' + err.message);
  process.exitCode = 1;
});
