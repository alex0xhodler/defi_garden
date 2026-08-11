/* test_webmcp_rail_derivation.js — backlog 266: the WebMCP agent surface
   (home.html's `search_yield_pools` tool, registered on `navigator.
   modelContext` at page load) must APPLY both trust rails by reading
   `window.TRUST_RAILS` at call time, not by hand-typing numbers that merely
   happen to equal the rail today (spec 266's Evidence: `home.html:269-270`
   used to read `if (p.tvlUsd < 100000) return false;` / `if (p.apy > 1000)
   return false;` — a THIRD, undiscovered copy of the rail, and one that
   additionally used DefiLlama's own `apy` field instead of the
   `apyBase + apyReward` total every other railed surface computes
   (`edge/api-core.js`'s `totalApy()`, `app.js`, `planner.js:110`'s
   `poolTotalApy`)). This is the applied-rail sibling of backlog 254's
   stated-rail prose guard (`test_rail_floor_derivation.js`) and 261's
   machine-manifest guard (`test_agent_surface_rail_claims.js`) — same idea
   (derive the population at test time, assert against `trust-rails.js`,
   never a re-typed literal), a THIRD claim-shape (an APPLIED predicate
   inside an inline `<script>`, not a stated figure in prose/JSON), and a
   THIRD population (browser-inline scripts + tracked `*.js` mirror
   declarations, not markdown/manifest files).

   THREE LEGS, each guarding a different failure mode of the SAME class.
   Two verifier findings (same review cycle) are folded in below: finding 2
   widened Leg B (a class-scan blind spot); finding 3 fixed a SECOND real
   defect this item's own first draft introduced (the result-row shape) and
   widened Leg A to assert it.

   Leg A (rendered, Playwright) — proves the MECHANISM itself, against a
   real render: the page's own registered tool list is read from
   `navigator.modelContext.tools` (population derived at runtime — the tool
   is found by name, never a hardcoded array index), executed with a
   DefiLlama-shaped fixture routed in, and re-executed after mutating
   `window.TRUST_RAILS` in the page. A literal-equal copy of the rail value
   can satisfy "the filter uses the number 100000" but CANNOT satisfy "the
   filter's behaviour changes when I change `window.TRUST_RAILS.
   DEFAULT_MIN_TVL` at runtime" — that is the whole point of Leg A's
   mutation assertions (ii)/(iii), and why this is the only leg that could
   have caught the original defect by construction rather than by reading
   source. Verifier finding 3 (measured live against 15,616 real pools):
   this item's OWN first-draft result-row shape diverged from `edge/api-
   core.js`'s `projectPool()` — it overwrote the `apy` key with the
   computed total and coerced a `null` `apyBase`/`apyReward` (DefiLlama's
   "unknown") to `0`, silently erasing "unknown" and dropping 185 real
   above-floor pools (2.5% of the population, median `apy` 6.05%) from any
   `minApy` filter. Fixed: `apy` now passes through UNMODIFIED, a new
   `totalApy` key carries the derived total, and `apyBase`/`apyReward`
   preserve `null`. Leg A asserts all three, plus the honest (not hidden)
   consequence that a null-total pool still gets excluded by `minApy` —
   `api-core.js`'s own null-as-0 total semantics, unchanged, just no longer
   silently coerced one field earlier than it should be.

   Leg B (class, static) — TWO checks over EVERY inline `<script>` block of
   EVERY root-level `*.html` document that loads `trust-rails.js` (globbed
   at test time — home.html + plan.html, 2 files today):

     1. THE VALUE-LITERAL SCAN (WIDENED, verifier finding 2, same review
        cycle as the Leg C name-family widening; widened AGAIN round 2 —
        see "SPELLINGS COVERED" and "ROUND 2" below): the PRIMARY guard is
        now "no bare numeric literal anywhere in an inline `<script>`
        evaluates to any `trust-rails.js` value" — deliberately LHS-shape-
        agnostic. The dotted-field comparison scan below (`p.tvlUsd <
        100000`) is provably too narrow: the verifier added a second WebMCP
        tool containing `var MIN_TVL = 100000; var tvl = p.tvlUsd; if (tvl <
        MIN_TVL) return false; if (tvl < 100000) return false;` and the
        field-comparison-only gate stayed GREEN — a local variable
        assignment and a comparison against a RENAMED local are both
        invisible to a scanner that only recognises `pool.field OP literal`.
        Rather than chase every possible LHS shape a hand-typed rail copy
        could hide behind (destructured `{tvlUsd}`, bracket `p['tvlUsd']`, a
        renamed local, a totally unrelated-looking variable), this scan
        bans the VALUE outright: any token that PARSES as a JS number,
        found in the script's CODE (not inside a string/template-literal-
        text/comment — see EXCLUSION below) and EVALUATED (via `Number()`,
        never by typing separate string patterns per spelling) to
        `APY_SANITY_LIMIT` or `DEFAULT_MIN_TVL`, is a violation, full stop,
        regardless of what surrounds it.
        SPELLINGS COVERED (each evaluated, never string-matched): plain
        decimal (`100000`), exponential (`1e5`), numeric-separated
        (`100_000`), hexadecimal/octal/binary (`0x186A0`/`0o303240`/
        `0b11000011010100000`) — see `scanForRailValueLiterals`'s own
        comment for the exact regex/evaluation. A legacy-octal-LOOKING
        token with a bare leading zero and no `o`/`x`/`b` marker (e.g.
        `0100000`) needs no special handling: `Number()` (unlike the
        LANGUAGE's own literal grammar in non-strict source) always reads a
        leading-zero digit run as decimal, so it already evaluates to
        100000 via the plain-decimal branch.
        EXCLUSION, by role, not convenience: string-literal contents,
        template-literal STATIC TEXT, and comment contents are masked out
        (blanked, length/newlines preserved) before the numeric-token scan
        runs, because a digit sequence there is prose/documentation, not an
        executable rail predicate — e.g. a description string that happens
        to mention "$100,000" is not a hand-typed copy of the floor, it is
        prose ABOUT the floor (already separately guarded, differently, by
        backlog 254/`test_agent_surface_rail_claims.js`). A template
        literal's `${...}` INTERPOLATION contents are the one exception —
        see ROUND 2 below — because interpolated code is real, executable
        JS, not prose. Proven safe for hand-written (non-minified) HTML
        documents the same way Leg C's `stripJsComments` was proven safe
        for ordinary `*.js` files (home.html/plan.html are not minified —
        the div-then-dereference corruption risk documented on Leg C's
        `stripJsComments` applies only to minified artifacts, none of which
        are in Leg B's population; `maskStringsAndComments` below is now
        self-contained and no longer calls `stripJsComments` at all, for
        the reason its own comment explains).
        ROUND 2 (P1, this masking function's OWN comment previously
        misdescribed its behaviour): a template literal's `${...}`
        interpolation is real code and must be SCANNED, not masked. The
        first version of `maskStringsAndComments` masked a template
        literal's entire contents — text AND interpolations alike — while
        its comment claimed the opposite ("does NOT special-case
        interpolation... can only over-report, never hide a violation").
        The verifier proved the code, not the comment, was live: injecting
        var MIN_TVL = Number(`${100000}`); into the real home.html left
        the gate GREEN. Fixed in `maskStringsAndComments` (masks template
        TEXT, preserves interpolation CODE, handles nesting) — see that
        function's own comment for the mechanism.
        THE ONE FALSE-POSITIVE SHAPE this predicate has: a legitimate,
        UNRELATED literal that numerically happens to equal 1000 or 100000
        — e.g. a millisecond timeout (`setTimeout(fn, 1000)`) or a
        rounding/precision constant (`Math.round(x * 100000) / 100000` for
        5-decimal precision). None exists in home.html/plan.html today
        (measured, not assumed — see the "measured hit count" test below,
        which asserts today's real count and would need updating, loudly,
        if this ever legitimately fires). THE ONLY HONEST RESOLUTION when a
        REAL one appears: name it as a constant sourced from its own domain
        (e.g. a `POLL_DEBOUNCE_MS` read from a shared config, never from
        `trust-rails.js`), or restructure it for a REAL reason and say so
        in a comment at the site. Never an allowlist — and never rewriting
        the literal into an arithmetically-equivalent expression (e.g.
        `2 * 500` instead of `1000`) SOLELY to defeat this scan; a prior
        version of this paragraph named that expression as an example
        "resolution", which is exactly the bypass the next paragraph
        discloses as residue — the guard must never publish its own
        workaround.
        RESIDUE, disclosed not hidden: ARITHMETIC COMPOSITION (`50000 * 2`,
        `DEFAULT_MIN_TVL - 1`, any expression whose RESULT equals a rail
        value but whose SOURCE TEXT contains no single token that does) is
        genuinely out of reach of a literal-token scan and this file does
        NOT attempt to evaluate expressions — doing so would require a real
        JS parser/evaluator, a materially different and riskier tool than a
        regex-plus-tokenizer scan. This is the same shape as Leg C's
        "unrelated name" residue: a known, measured gap, not a silent one.

     2. THE DOTTED-FIELD COMPARISON SCAN (original Leg A/B mechanism, KEPT
        as the COVERAGE assertion, not replaced): a comparison of a pool
        field (`tvlUsd`/`apy`/`apyBase`/`apyReward`/`totalApy`) against a
        bare numeric literal. This stays because it is what proves the scan
        isn't vacuous FOR THE SPECIFIC SURFACE THIS ITEM FIXED — population
        must be non-empty AND every found comparison must classify as
        "derived", so a rename can never make the coverage check silently
        pass by finding nothing.

   Leg C (mirror set-equality, both directions) — every tracked `*.js`
   file's OWN declaration of `APY_SANITY_LIMIT`/`DEFAULT_MIN_TVL` (the
   mirrors app.js's canonical literal already has, per trust-rails.js's own
   header: `app.js` stays human-owned and is never rewritten to `require()`
   this file) must still equal `trust-rails.js`. This is NOT about
   home.html specifically — it is the standing invariant Leg A/B's fix
   depends on staying true tomorrow: if a mirror drifts, home.html's fix
   (which reads `window.TRUST_RAILS`, itself built FROM `trust-rails.js`)
   is still correct, but every mirror site (`compute-kpis.js`, `planner.js`,
   the generators, the poller) would silently diverge from it. `edge/
   api-core.js` is deliberately NOT in this population — it holds no
   literal (`const APY_SANITY_LIMIT = trustRails.APY_SANITY_LIMIT;`, a live
   `require()`, never a hand-typed number) and is already guarded by
   `test_api_worker.js`'s own mirror assertion (see that file's section B);
   asserting it again here would be exactly the duplicate-assertion the
   task brief warns against. THIS FILE ITSELF is excluded from the
   population the same way, and for the same kind of reason: it names both
   rail constants only as DATA — self-defeat injection fixtures (literal
   source text of constructs being proven caught) and the unrelated-name
   residue test's own PROBE list (`MAX_SANE_RATE` etc., deliberately chosen
   to share no prefix with either rail base) — never as a declaration the
   product reads, so it is not a mirror to check against `trust-rails.js`
   any more than `trust-rails.js` is a mirror of itself (caught live: this
   exclusion was ADDED after every prior green run — this file's own — had
   been measured against a population that happened to exclude it while it
   was untracked; `git add`ing it changed `git ls-files` and turned the
   residue test's own probe-name list into a false "unrelated mirror"
   finding about this file, fixed here rather than by weakening that
   check for anything else).

   Leg C's population is a NAME FAMILY, not an exact-name match: it scans
   for `APY_SANITY_LIMIT[A-Z0-9_]*` / `DEFAULT_MIN_TVL[A-Z0-9_]*` and maps
   every matched name back to its BASE rail for the equality assertion.
   This widening exists because the file's FIRST, exact-name-only version
   was proven blind, in this same review cycle, by a real site: `PoolDetail.
   js:297`/`PoolDetail.compiled.js:281` declare `const APY_SANITY_LIMIT_
   LOCAL = 1000;` — a genuine mirror under a SUFFIXED name (found while
   building the exact-name scan; that scan could not see it, and spec 266's
   own residue section claimed "no such site exists today," which this
   finding falsifies). `PoolDetail.js:297` is now this scan's POSITIVE
   CONTROL (asserted present, mapped to base rail `APY_SANITY_LIMIT`,
   below) — evidence the family pattern actually works — not the
   definition of what's covered; the family pattern is the definition.
   What the family STILL cannot see: a mirror under a name sharing NO
   prefix with either base at all (e.g. a hypothetical `MAX_SANE_RATE =
   1000`). This is measured below, not assumed — a residue test greps the
   real repo for several plausible unrelated names and reports the count
   found (zero, as of this writing); if that count is ever non-zero, the
   test fails loudly naming the site rather than silently missing it.

   Leg C's population-detection has two tiers, because a minifier can
   strand a constant's NAME away from its VALUE entirely:
     1. TEXT scan — `(?:const|var|let)\s+NAME\s*=\s*<number>` for ordinary
        source (protects against a comment merely MENTIONING "NAME = 1000"
        as prose, e.g. `test_agent_surface_rail_claims.js`'s own KNOWN
        LIMITATION paragraph — verified below NOT to false-positive), and a
        looser, unanchored `NAME\s*=\s*<number>` for `*.min.js` files (safe
        there because Terser strips real comments and comma-joins sibling
        `var` declarators, e.g. `app.compiled.min.js`'s single `var
        APY_SANITY_LIMIT=1e3,DEFAULT_MIN_TVL=1e5,...` statement, which the
        anchored form would only catch the FIRST declarator of).
     2. REQUIRE fallback, `*.min.js` ONLY — `planner.min.js` renames the
        local variable Terser assigned the literal to (observed: `r`, reused
        across unrelated scopes by the minifier) and the ORIGINAL name
        `APY_SANITY_LIMIT` survives only as an export-object KEY
        (`APY_SANITY_LIMIT:r`), which no text pattern can resolve to a
        value. `planner.min.js` already carries planner.js's UMD guard
        (`module.exports = api` — trust-rails.js's own header documents
        this), so `require()`-ing it and reading the exported property is
        the ONLY way to recover the real value — and is side-effect-free by
        construction: a `*.min.js` file is a generated artifact, never a
        script meant to be `node`-executed directly, unlike `generate-*.js`/
        `test_*.js` (which is why this fallback is scoped to `.min.js`
        filenames ONLY — attempting it on arbitrary tracked `*.js` files
        was tried while building this test and required well over half the
        repo's `test_*.js` files, most of which run their own suite
        immediately on `require()` with no `require.main === module`
        guard).
   "Fail loudly rather than skip silently" (spec 266 Leg C bullet) is
   implemented two ways, proportional to each tier's risk of a silent miss:
     - `.min.js`: if a file's raw text contains the constant's bare NAME but
       neither tier resolved a numeric value for it, THROW — this is
       exactly "a site legitimately cannot be parsed."
     - ordinary `.js`: a SEPARATE, comment-aware loose scan (real comments
       stripped, `NAME\s*=\s*<number>` unanchored) is asserted to find
       EXACTLY the same {file, name, value} set the anchored primary scan
       found. A future declaration shape the anchored regex doesn't
       recognise (e.g. `exports.NAME = 1000`) would show up in the loose
       scan but not the anchored one, and this cross-check goes RED rather
       than the population silently excluding it. Verified below to be
       clean against the real repo (zero discrepancies today).

   Every threshold compared in every leg is read from `require('./trust-
   rails.js')` — never re-typed as a literal in this file itself, which
   would make this guard exactly the class of bug it exists to catch.

   Run: node test_webmcp_rail_derivation.js
   (Leg A drives real Chromium — `run-tests.js` puts this file in the
   browser lane by the same transitive-scan mechanism as every other
   Playwright test_*.js; see test_test_registry.js's header for how that
   classification works.) */
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const trustRails = require('./trust-rails.js');
const DEFAULT_MIN_TVL = trustRails.DEFAULT_MIN_TVL;
const APY_SANITY_LIMIT = trustRails.APY_SANITY_LIMIT;

const ROOT = __dirname;
const PORT = 8985; // distinct from other test_* files (8791-8981 taken as of this item)
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// ===========================================================================
// Leg A — rendered Playwright: the mechanism itself.
// ===========================================================================

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

const POOLS_URL = 'https://yields.llama.fi/pools';

// DefiLlama-shaped fixture — has BOTH `apy` (DefiLlama's own field, the
// surface's OLD, wrong signal) and `apyBase`/`apyReward` (what the fixed
// surface actually reads), per spec 266's territory note: the committed
// data/pools-snapshot.json has no `apy` field at all, but the LIVE
// yields.llama.fi/pools payload this tool fetches does — so this fixture
// matches the live shape, not the snapshot shape.
function makePool(id, tvlUsd, apy, apyBase, apyReward) {
  return { pool: id, project: 'test-project', symbol: 'USDC', chain: 'Ethereum', tvlUsd, apy, apyBase, apyReward };
}

// Every threshold below is a function of DEFAULT_MIN_TVL/APY_SANITY_LIMIT
// read from trust-rails.js above — never a re-typed number.
const POOL_ABOVE_FLOOR = makePool('above-floor', DEFAULT_MIN_TVL + 1, 5, 5, 0);
const POOL_BELOW_FLOOR = makePool('below-floor', DEFAULT_MIN_TVL - 1, 5, 5, 0);
// (iv) total-APY semantics, direction 1: DefiLlama's own `apy` field reads
// a low, sane-looking 5% while the REAL total (apyBase+apyReward) is 1.2x
// the sanity limit — the OLD `p.apy > 1000` check would have let this
// through; the fixed check must exclude it.
const POOL_TOTAL_APY_EXCLUDED = makePool('total-apy-excluded', DEFAULT_MIN_TVL * 10, 5, APY_SANITY_LIMIT * 0.6, APY_SANITY_LIMIT * 0.6);
// (iv) direction 2: DefiLlama's own `apy` field reads a wildly anomalous
// 2000% while the REAL total is a sane 0.3% of the limit — the OLD check
// would have DROPPED this pool; the fixed check must include it.
const POOL_TOTAL_APY_INCLUDED = makePool('total-apy-included', DEFAULT_MIN_TVL * 10, 2000, APY_SANITY_LIMIT * 0.003, 0);
// Verifier finding 3: matches the LIVE population measured against
// yields.llama.fi/pools (15,616 pools, 7,350 above floor) — 185 above-floor
// pools (2.5%, median `apy` 6.05%) report apyBase AND apyReward both null
// (DefiLlama's own "unknown", not zero) alongside a positive raw `apy`.
// Above the TVL floor so it is otherwise eligible; its computed total is 0
// (null treated as 0, api-core.js's own totalApy() semantics), so the
// sanity filter (0 <= APY_SANITY_LIMIT) still passes it through.
const POOL_NULL_COMPONENTS = makePool('null-components', DEFAULT_MIN_TVL * 10, 6.05, null, null);

const FIXTURE_POOLS = [POOL_ABOVE_FLOOR, POOL_BELOW_FLOOR, POOL_TOTAL_APY_EXCLUDED, POOL_TOTAL_APY_INCLUDED, POOL_NULL_COMPONENTS];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });
async function runLegA() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Browser-originated external HTTPS is blocked in this sandbox
    // (NORTH_STAR 2026-07-12) — route the pools fetch to the fixture above,
    // the house pattern from test_smoke.js/test_northstar_cta_fires.js.
    await page.route('https://icons.llamao.fi/**', (r) => r.abort());
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}'
    }));
    await page.route(POOLS_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));
    await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'load', timeout: 15000 });

    async function toolNames() {
      return page.evaluate(() => (window.navigator.modelContext.tools || []).map((t) => t.name));
    }
    async function execTool(name, args) {
      return page.evaluate(({ name, args }) => {
        const tool = (window.navigator.modelContext.tools || []).find((t) => t.name === name);
        if (!tool) return { __notFound: true };
        return tool.execute(args || {});
      }, { name, args });
    }

    await test('Leg A: search_yield_pools is found in navigator.modelContext.tools by NAME (population read at runtime, not a hardcoded index)', async () => {
      const names = await toolNames();
      assert.ok(names.includes('search_yield_pools'), 'expected "search_yield_pools" among registered tools: ' + JSON.stringify(names));
    });

    await test('Leg A (i): at REAL rails, a fixture pool at DEFAULT_MIN_TVL+1 is returned and one at DEFAULT_MIN_TVL-1 is not', async () => {
      const result = await execTool('search_yield_pools', {});
      assert.ok(result && result.success, 'tool execution should succeed: ' + JSON.stringify(result));
      const ids = result.results.map((r) => r.pool);
      assert.ok(ids.includes('above-floor'), 'expected the pool at DEFAULT_MIN_TVL+1 present at real rails; got ' + JSON.stringify(ids));
      assert.ok(!ids.includes('below-floor'), 'expected the pool at DEFAULT_MIN_TVL-1 excluded at real rails; got ' + JSON.stringify(ids));
    });

    await test('Leg A (iv): total-APY semantics both directions — apyBase+apyReward drives inclusion/exclusion, not DefiLlama\'s own `apy` field', async () => {
      const result = await execTool('search_yield_pools', {});
      const ids = result.results.map((r) => r.pool);
      assert.ok(!ids.includes('total-apy-excluded'), 'a pool with a low `apy` field (5) but anomalous apyBase+apyReward (1.2x the limit) must be EXCLUDED — the old p.apy check would have returned it; got ' + JSON.stringify(ids));
      assert.ok(ids.includes('total-apy-included'), 'a pool with a high `apy` field (2000) but sane apyBase+apyReward must be INCLUDED — the old p.apy check would have dropped it; got ' + JSON.stringify(ids));
    });

    await test('Leg A (verifier finding 3): the result row mirrors edge/api-core.js\'s projectPool() shape — `totalApy` is the derived apyBase+apyReward total, `apy` is DefiLlama\'s own field passed through UNMODIFIED (never overwritten)', async () => {
      const result = await execTool('search_yield_pools', {});
      const included = result.results.find((r) => r.pool === 'total-apy-included');
      assert.ok(included, 'sanity: total-apy-included must be in the result set for this assertion to mean anything');
      const expectedTotal = POOL_TOTAL_APY_INCLUDED.apyBase + POOL_TOTAL_APY_INCLUDED.apyReward;
      assert.strictEqual(included.totalApy, expectedTotal, 'result totalApy must equal apyBase+apyReward (' + expectedTotal + '); got ' + included.totalApy);
      assert.strictEqual(included.apy, POOL_TOTAL_APY_INCLUDED.apy, 'result apy must be DefiLlama\'s own RAW field (' + POOL_TOTAL_APY_INCLUDED.apy + '), passed through unmodified, not overwritten with the computed total; got ' + included.apy);
      assert.strictEqual(included.apyBase, POOL_TOTAL_APY_INCLUDED.apyBase, 'result row must carry the raw apyBase');
      assert.strictEqual(included.apyReward, POOL_TOTAL_APY_INCLUDED.apyReward, 'result row must carry the raw apyReward');
    });

    await test('Leg A (verifier finding 3, i+ii): a pool with apyBase/apyReward both null (the live 185-pool population\'s shape) is returned, with null PRESERVED — not coerced to 0', async () => {
      const result = await execTool('search_yield_pools', {});
      const ids = result.results.map((r) => r.pool);
      assert.ok(ids.includes('null-components'), '(i) a pool with null apyBase/apyReward and a positive raw apy, above the TVL floor, must be returned; got ' + JSON.stringify(ids));
      const row = result.results.find((r) => r.pool === 'null-components');
      assert.strictEqual(row.apyBase, null, '(ii) apyBase must be preserved as null (api-core.js\'s projectPool() shape), not coerced to 0; got ' + JSON.stringify(row.apyBase));
      assert.strictEqual(row.apyReward, null, '(ii) apyReward must be preserved as null, not coerced to 0; got ' + JSON.stringify(row.apyReward));
      assert.strictEqual(row.apy, POOL_NULL_COMPONENTS.apy, 'apy must still be the raw DefiLlama field (6.05), unmodified; got ' + row.apy);
      assert.strictEqual(row.totalApy, 0, 'totalApy treats null as 0 (api-core.js\'s own totalApy() semantics) — asserted here, not hidden; got ' + row.totalApy);
    });

    await test('Leg A (verifier finding 3, iii): with minApy=5, the null-components pool is EXCLUDED — the honest consequence of api-core\'s null-as-0 total semantics, asserted rather than hidden', async () => {
      const result = await execTool('search_yield_pools', { minApy: 5 });
      const ids = result.results.map((r) => r.pool);
      assert.ok(!ids.includes('null-components'), 'expected null-components excluded when minApy=5 (its computed total APY is 0, since null apyBase/apyReward are treated as 0); got ' + JSON.stringify(ids));
    });

    await test('Leg A (ii): mutating window.TRUST_RAILS.DEFAULT_MIN_TVL at runtime changes the filter\'s behaviour — a literal-equal copy cannot pass this', async () => {
      const raisedFloor = POOL_ABOVE_FLOOR.tvlUsd + 1; // now excludes the pool that just passed
      await page.evaluate((v) => { window.TRUST_RAILS.DEFAULT_MIN_TVL = v; }, raisedFloor);
      const result = await execTool('search_yield_pools', {});
      const ids = result.results.map((r) => r.pool);
      await page.evaluate((v) => { window.TRUST_RAILS.DEFAULT_MIN_TVL = v; }, DEFAULT_MIN_TVL); // restore before the next assertion
      assert.ok(!ids.includes('above-floor'), 'expected the previously-returned pool excluded after raising DEFAULT_MIN_TVL past its tvlUsd; got ' + JSON.stringify(ids));
    });

    await test('Leg A (iii): mutating window.TRUST_RAILS.APY_SANITY_LIMIT at runtime changes the filter\'s behaviour', async () => {
      const totalOfAboveFloor = POOL_ABOVE_FLOOR.apyBase + POOL_ABOVE_FLOOR.apyReward;
      const loweredLimit = totalOfAboveFloor - 1; // now excludes the pool that just passed
      await page.evaluate((v) => { window.TRUST_RAILS.APY_SANITY_LIMIT = v; }, loweredLimit);
      const result = await execTool('search_yield_pools', {});
      const ids = result.results.map((r) => r.pool);
      await page.evaluate((v) => { window.TRUST_RAILS.APY_SANITY_LIMIT = v; }, APY_SANITY_LIMIT); // restore
      assert.ok(!ids.includes('above-floor'), 'expected the previously-returned pool excluded after lowering APY_SANITY_LIMIT below its total APY; got ' + JSON.stringify(ids));
    });
  } finally {
    await browser.close();
    server.close();
  }
}

// ===========================================================================
// Leg B — static class scan: every root *.html that loads trust-rails.js,
// every inline <script>, no bare-numeric-literal pool-field comparison.
// ===========================================================================

const POOL_FIELD = '(?:[\\w$]+(?:\\.[\\w$]+)*\\.(?:tvlUsd|apyBase|apyReward|apy)\\b|\\btotalApy\\b)';
const COMPARATOR = '(?:<=|>=|===|!==|==|!=|<|>)';
const OPERAND_TOKEN = '[^\\s;,)]+';
const NUMERIC_LITERAL = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

// Population: every *.html at repo root whose source contains a
// trust-rails.js script tag — globbed at test time, never hand-listed.
function htmlFilesLoadingTrustRails() {
  return fs.readdirSync(ROOT)
    .filter((f) => /\.html$/i.test(f))
    .filter((f) => /<script[^>]*\bsrc\s*=\s*["']trust-rails\.js["'][^>]*>/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')))
    .sort();
}

// Every inline (non-src, non-ld+json) <script>...</script> block, with the
// absolute 1-indexed line its content starts on (so violations report
// real file:line, not an offset into the extracted fragment).
function extractInlineScripts(html) {
  const scripts = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue;
    const openTag = '<script' + attrs + '>';
    const contentStart = m.index + openTag.length;
    const startLine = html.slice(0, contentStart).split('\n').length;
    scripts.push({ content: m[2], startLine });
  }
  return scripts;
}

// The widened (verifier finding 2) predicate's rail values — read from
// trust-rails.js, never typed as a literal in this file (that would make
// this guard exactly the class of bug it exists to catch).
const RAIL_VALUES = [APY_SANITY_LIMIT, DEFAULT_MIN_TVL];

// Masks out string-literal ('...'/"..."/`...`) CONTENTS and comment (`//`,
// `/* */`) CONTENTS, in a SINGLE left-to-right pass that resolves a STRING
// boundary before ever checking for a comment-start sequence. This order is
// load-bearing, not stylistic: home.html's `search_yield_pools` tool
// contains `fetch("https://yields.llama.fi/pools")` — a string whose
// CONTENTS include a bare `//`. An earlier two-pass version of this
// function (strip comments first via a comment-only regex, THEN mask
// strings) treated that `//` inside the string as a line-comment start,
// deleted the string's own closing quote along with it, and desynced the
// SEPARATE string-tracking pass for the rest of the file — caught only by
// this file's own self-defeat cases going unexpectedly GREEN (0 violations
// where >=1 was expected) during this item's build, not by the "measured
// hit count" test, which cannot distinguish "correctly found nothing" from
// "wrongly blanked everything". Single-pass, string-first, closes that
// class: a comment marker can never appear "inside" a string from this
// function's point of view, because a string's content is consumed whole,
// via its own char-by-char loop (respecting backslash-escapes so `\"`
// cannot prematurely end it), before the top-level loop ever reaches a
// position where a comment-start sequence could be evaluated. Blanks
// non-quote/non-comment content to spaces, preserving length and newlines,
// so absolute line numbers computed against the result still line up with
// the ORIGINAL text.
//
// TEMPLATE LITERALS (verifier round-2 P1 — corrected from a prior version
// of this comment, which CLAIMED the opposite of what the code below it
// did): a template literal's STATIC TEXT is masked exactly like a string
// (it is string content), but every `${...}` INTERPOLATION's contents are
// PRESERVED UNMASKED, because interpolated code is real, executable JS —
// `` `${100000}` `` is exactly as much a bare numeric literal as
// `if (x < 100000)` is. The verifier proved the prior version wrong end-to-
// end: injecting `var MIN_TVL = Number(\`${100000}\`);` into the real
// home.html left the gate GREEN — a hand-typed rail copy hiding inside a
// backtick while the header comment asserted that was structurally
// impossible. Implemented with an explicit stack (`stack`, below) rather
// than recursion, tracking two frame kinds: `{ type: 'template' }` (inside
// a template literal's text, masking) and `{ type: 'interp', depth }`
// (inside a `${...}` interpolation's CODE, scanning; `depth` counts NESTED
// unmatched `{`/`}` inside that interpolation — e.g. an object literal
// `${ {a:1} }` or a nested arrow-function body — so the interpolation's OWN
// closing `}` is recognised even when the interpolated expression contains
// braces of its own). A NESTED template literal inside an interpolation
// (`` `${ `inner ${x}` }` ``) pushes its own `template` frame the same way
// the outer one did, so nesting resolves correctly to arbitrary depth. A
// plain `'`/`"` string inside an interpolation is masked by the SAME
// self-contained quote-consuming loop used at the top level — its own `{`/
// `}` characters are consumed inside that loop and never reach the
// interpolation's brace-depth counter, so `${ "a{b}c" }` does not
// desynchronize the depth count.
function maskStringsAndComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // Stack of enclosing template/interpolation frames — empty means
  // top-level code (or, equivalently, inside a `${...}` interpolation,
  // which is ALSO code — see the `top.type === 'interp'` brace-tracking
  // branch below, reached with the stack non-empty).
  const stack = [];

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    const top = stack.length ? stack[stack.length - 1] : null;

    if (top && top.type === 'template') {
      // Inside a template literal's TEXT — mask, except the closing
      // backtick (pops this frame) and a `${` interpolation start (pushes
      // an `interp` frame; the delimiter itself is code, output verbatim,
      // not masked — it carries no digits either way).
      if (c === '`') { stack.pop(); out += c; i++; continue; }
      if (c === '$' && next === '{') { stack.push({ type: 'interp', depth: 0 }); out += '${'; i += 2; continue; }
      if (c === '\\' && i + 1 < n) {
        out += (c === '\n' ? '\n' : ' ') + (src[i + 1] === '\n' ? '\n' : ' ');
        i += 2;
        continue;
      }
      out += (c === '\n' ? '\n' : ' ');
      i++;
      continue;
    }

    // CODE context: top-level, or inside a `${...}` interpolation (top &&
    // top.type === 'interp'). Track that interpolation's own brace depth
    // FIRST — a "{"/"}" here is real code (object literal, block), not a
    // string/comment delimiter, so it must never fall through to the
    // generic char-output branch at the bottom uncounted.
    if (top && top.type === 'interp') {
      if (c === '{') { top.depth++; out += c; i++; continue; }
      if (c === '}') {
        if (top.depth === 0) { stack.pop(); out += c; i++; continue; }
        top.depth--;
        out += c;
        i++;
        continue;
      }
    }

    // String literal ('...'/"...") — self-contained consume loop; a "{"/"}"
    // or "//"/"/*" inside is just string content, never re-examined by the
    // outer dispatch (this is what keeps `${ "a{b}c" }` from desyncing the
    // interpolation depth counter above).
    if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          out += (src[i] === '\n' ? '\n' : ' ') + (src[i + 1] === '\n' ? '\n' : ' ');
          i += 2;
          continue;
        }
        out += (src[i] === '\n' ? '\n' : ' ');
        i++;
      }
      if (i < n) { out += src[i]; i++; } // closing quote
      continue;
    }

    // Template literal open (top-level, or a NESTED template inside an
    // interpolation — either way, push a fresh `template` frame).
    if (c === '`') { stack.push({ type: 'template' }); out += c; i++; continue; }

    // Line comment.
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    // Block comment.
    if (c === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += (src[i] === '\n' ? '\n' : ' ');
        i++;
      }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// THE WIDENED SCAN (verifier finding 2, widened further round 2 P2): every
// bare numeric-literal TOKEN — decimal, exponential (`1e5`), numeric-
// separated (`100_000`), or hex/octal/binary (`0x186A0`/`0o303240`/
// `0b11000011010100000`) — anywhere in an inline script's CODE (strings/
// comments/template-text masked out first, `${...}` interpolation content
// preserved — see `maskStringsAndComments`) that EVALUATES (via `Number()`,
// after stripping any `_` separators — `Number()` does not accept them
// natively, unlike the language's own literal grammar; hex/octal/binary
// prefixes ARE accepted natively) to a value in `railValues`. Never typed
// as separate string patterns ("1e5", "0x186A0", ...) — one evaluation
// path for every spelling. Hex/octal/binary branches are tried BEFORE the
// plain-decimal branch in the alternation so `0x...`'s leading "0" is never
// consumed as a standalone decimal "0" first. Deliberately LHS-shape-
// agnostic — see header comment for why.
function scanForRailValueLiterals(fileLabel, html, railValues) {
  const NUMERIC_TOKEN = /\b(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0[oO][0-7](?:_?[0-7])*|0[bB][01](?:_?[01])*|\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?)\b/g;
  const violations = [];
  for (const s of extractInlineScripts(html)) {
    const masked = maskStringsAndComments(s.content);
    const originalLines = s.content.split('\n');
    let m;
    NUMERIC_TOKEN.lastIndex = 0;
    while ((m = NUMERIC_TOKEN.exec(masked))) {
      const value = Number(m[0].replace(/_/g, ''));
      if (!railValues.includes(value)) continue;
      const relLine = masked.slice(0, m.index).split('\n').length;
      const absLine = s.startLine + relLine - 1;
      const lineText = (originalLines[relLine - 1] || '').trim();
      violations.push({ file: fileLabel, line: absLine, literal: m[0], value, lineText });
    }
  }
  return violations;
}

// Finds every comparison of a pool field against ANY operand, in both
// orders (field OP value, value OP field) — the unit Leg B's coverage
// assertion counts, classified literal-vs-derived by the caller.
function scanFieldComparisons(content) {
  const found = [];
  const seen = new Set();
  const reFieldFirst = new RegExp('(' + POOL_FIELD + ')\\s*(' + COMPARATOR + ')\\s*(' + OPERAND_TOKEN + ')', 'g');
  let m;
  while ((m = reFieldFirst.exec(content))) {
    const key = m.index + ':' + m[0];
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ index: m.index, text: m[0], field: m[1], operand: m[3] });
  }
  const reValueFirst = new RegExp('(' + OPERAND_TOKEN + ')\\s*(' + COMPARATOR + ')\\s*(' + POOL_FIELD + ')', 'g');
  while ((m = reValueFirst.exec(content))) {
    const key = m.index + ':' + m[0];
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ index: m.index, text: m[0], field: m[3], operand: m[1] });
  }
  return found.sort((a, b) => a.index - b.index);
}

// Scans one HTML document's inline scripts; returns {violations, comparisons}
// with absolute file:line on every entry. Pure function so the self-defeat
// check below exercises the SAME logic the real assertions trust.
function scanHtmlForRailComparisons(fileLabel, html) {
  const violations = [];
  const comparisons = [];
  for (const s of extractInlineScripts(html)) {
    for (const hit of scanFieldComparisons(s.content)) {
      const relLine = s.content.slice(0, hit.index).split('\n').length;
      const absLine = s.startLine + relLine - 1;
      const operand = hit.operand.replace(/[);]+$/, '');
      const isLiteral = NUMERIC_LITERAL.test(operand.trim());
      const entry = { file: fileLabel, line: absLine, text: hit.text, field: hit.field, operand, isLiteral };
      comparisons.push(entry);
      if (isLiteral) violations.push(entry);
    }
  }
  return { violations, comparisons };
}

async function runLegB() {
  const htmlFiles = htmlFilesLoadingTrustRails();
  console.log('\nLeg B population: ' + JSON.stringify(htmlFiles) + ' (root *.html loading trust-rails.js)');

  await test('Leg B: population is exactly the root *.html files that load trust-rails.js (home.html + plan.html today, globbed not hand-listed)', () => {
    assert.ok(htmlFiles.length >= 1, 'expected at least one *.html loading trust-rails.js');
    assert.ok(htmlFiles.includes('home.html'), 'home.html must be in the population');
  });

  const allViolations = [];
  const allComparisons = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const { violations, comparisons } = scanHtmlForRailComparisons(file, html);
    allViolations.push(...violations);
    allComparisons.push(...comparisons);
  }

  // --- Check 1 (widened, verifier finding 2, PRIMARY): no bare numeric
  // literal anywhere in an inline script equals a trust-rails.js value. ---
  const allValueLiteralViolations = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    allValueLiteralViolations.push(...scanForRailValueLiterals(file, html, RAIL_VALUES));
  }

  await test('Leg B (widened, verifier finding 2): zero bare numeric literals anywhere in an inline <script> equal to any trust-rails.js value (decimal or exponential spelling, LHS-shape-agnostic)', () => {
    assert.deepStrictEqual(
      allValueLiteralViolations, [],
      allValueLiteralViolations.map((v) => `${v.file}:${v.line}: literal "${v.literal}" (= ${v.value}, a trust-rails.js value) in "${v.lineText}"`).join('\n')
    );
    console.log(`  (measured hit count on the unmodified repo: ${allValueLiteralViolations.length})`);
  });

  // --- Check 2 (original mechanism, KEPT as the coverage assertion — see
  // header comment): a comparison of a pool field against a bare literal. ---
  await test('Leg B: zero inline-script comparisons of a pool field against a bare numeric literal, across every populated *.html', () => {
    assert.deepStrictEqual(
      allViolations, [],
      allViolations.map((v) => `${v.file}:${v.line}: "${v.text}" — pool field "${v.field}" compared against bare literal "${v.operand}"`).join('\n')
    );
  });

  await test('Leg B coverage: at least 1 pool-field comparison is found in home.html, and EVERY one found (there or anywhere in the population) classifies as derived — a rename cannot make this scan vacuously clean', () => {
    const homeComparisons = allComparisons.filter((c) => c.file === 'home.html');
    assert.ok(homeComparisons.length >= 1, 'expected >=1 pool-field comparison found in home.html; found 0 — the scanner is blind, not the surface clean');
    const literalOnes = allComparisons.filter((c) => c.isLiteral);
    assert.deepStrictEqual(literalOnes, [], 'coverage assertion should be unreachable here (already asserted above), listing for context: ' + JSON.stringify(literalOnes));
    console.log(`  (found ${allComparisons.length} pool-field comparison(s) across the population, all derived: ${JSON.stringify(allComparisons.map((c) => c.file + ':' + c.line))})`);
  });

  // In-process self-defeat (test_test_registry.js leg (e)'s idiom): the
  // SAME scanFieldComparisons/scanHtmlForRailComparisons logic the
  // assertions above trust, run over an IN-MEMORY copy of home.html with a
  // known bare-literal comparison injected, must report it. Never touches
  // disk — proves the check CAN go red, not just that it currently doesn't.
  await test('Leg B self-defeat: injecting "if (p.tvlUsd < 100000) return false;" into an in-memory copy of home.html IS reported', () => {
    const realHtml = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8');
    const marker = 'var totalApy = (Number(p.apyBase) || 0) + (Number(p.apyReward) || 0);';
    assert.ok(realHtml.includes(marker), 'sanity: expected to find the anchor line to inject after — home.html\'s filter shape changed underneath this test');
    const mutatedHtml = realHtml.replace(marker, marker + '\n                                        if (p.tvlUsd < 100000) return false;');
    const { violations } = scanHtmlForRailComparisons('home.html (in-memory, mutated)', mutatedHtml);
    assert.ok(violations.length >= 1, 'expected the injected bare-literal comparison to be reported; the scanner found nothing — a check that cannot go red is not evidence it works');
    assert.ok(violations.some((v) => v.text.includes('100000')), 'expected a violation naming the injected literal 100000; got ' + JSON.stringify(violations));

    // Restore proof: scanning the REAL, unmutated home.html right after must
    // still be clean — the red above came from the deliberate injection,
    // not a side effect of running this check.
    const realResult = scanHtmlForRailComparisons('home.html', realHtml);
    assert.deepStrictEqual(realResult.violations, [], 'sanity: the real, unmutated home.html must still scan clean after the self-defeat case ran');
  });

  // Three self-defeat cases for the WIDENED value-literal scan (verifier
  // finding 2's exact requirement) — each exercises scanForRailValueLiterals,
  // the SAME pure function the real assertion above trusts, over an
  // IN-MEMORY mutated copy of home.html. Never touches disk.
  const realHtmlForWidenedSelfDefeat = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8');
  const widenedInjectionAnchor = 'var totalApy = (Number(p.apyBase) || 0) + (Number(p.apyReward) || 0);';

  function widenedSelfDefeatCase(label, injectedSnippet, expectMinViolations) {
    return test(`Leg B widened self-defeat (${label}): the value-literal scan reports it`, () => {
      assert.ok(realHtmlForWidenedSelfDefeat.includes(widenedInjectionAnchor), 'sanity: expected to find the anchor line to inject after — home.html\'s filter shape changed underneath this test');
      const mutatedHtml = realHtmlForWidenedSelfDefeat.replace(widenedInjectionAnchor, widenedInjectionAnchor + '\n' + injectedSnippet);
      const violations = scanForRailValueLiterals(`home.html (in-memory, ${label})`, mutatedHtml, RAIL_VALUES);
      assert.ok(violations.length >= expectMinViolations, `expected >=${expectMinViolations} violation(s) for "${label}"; the scanner found ${violations.length} — a check that cannot go red is not evidence it works`);

      // Restore proof: the REAL, unmutated home.html must still scan clean
      // right after — the red above came from the deliberate injection.
      const realViolations = scanForRailValueLiterals('home.html', realHtmlForWidenedSelfDefeat, RAIL_VALUES);
      assert.deepStrictEqual(realViolations, [], 'sanity: the real, unmutated home.html must still scan clean after this self-defeat case ran');
      return violations;
    });
  }

  // (a) the ORIGINAL exact-name-scan-catchable construct — sanity, both
  // scans must still agree it's a violation.
  await widenedSelfDefeatCase(
    'the old bare comparison',
    '                                        if (p.tvlUsd < 100000) return false;',
    1
  );

  // (b) the VERIFIER'S EXACT construct that stayed green against the
  // dotted-field-only scanner — a renamed local variable, TWICE (the
  // assignment AND the re-compared literal).
  await widenedSelfDefeatCase(
    'the verifier\'s renamed-local construct',
    '                                        var MIN_TVL = 100000;\n                                        var tvl = p.tvlUsd;\n                                        if (tvl < MIN_TVL) return false;\n                                        if (tvl < 100000) return false;',
    2 // both the "var MIN_TVL = 100000" assignment AND the "tvl < 100000" comparison
  );

  // (c) a destructured / bracket-access variant — same blindness class,
  // different LHS shape again.
  await widenedSelfDefeatCase(
    'a destructured/bracket-access variant',
    '                                        var {tvlUsd} = p;\n                                        if (tvlUsd < 100000) return false;\n                                        if (p[\'tvlUsd\'] < 100000) return false;',
    2 // two independent "100000" comparisons, neither a dotted p.tvlUsd form
  );

  // (d) verifier ROUND 2 P1's exact construct — the template-literal
  // interpolation shape that defeated the FIRST version of
  // maskStringsAndComments (whose header comment claimed interpolation
  // content could only be OVER-reported, never hidden; the code actually
  // masked it, hiding it). Uses the verifier's literal source text.
  await widenedSelfDefeatCase(
    "verifier round 2's template-literal interpolation construct",
    '                                        var MIN_TVL = Number(`${100000}`);',
    1
  );

  // (e) verifier ROUND 2 P2 — numeric-separator spelling.
  await widenedSelfDefeatCase(
    'a numeric-separator literal (100_000)',
    '                                        var MIN_TVL = 100_000;',
    1
  );

  // (f) verifier ROUND 2 P2 — hexadecimal spelling (0x186A0 === 100000).
  await widenedSelfDefeatCase(
    'a hexadecimal literal (0x186A0 === 100000)',
    '                                        var MIN_TVL = 0x186A0;',
    1
  );
}

// ===========================================================================
// Leg C — mirror set-equality, both directions, across tracked *.js.
//
// WIDENED (coordinator follow-up, same session): population is a NAME
// FAMILY, `APY_SANITY_LIMIT[A-Z0-9_]*` / `DEFAULT_MIN_TVL[A-Z0-9_]*`, not an
// exact-name match. Motivating instance: `PoolDetail.js:297`/`PoolDetail.
// compiled.js:281` declare `const APY_SANITY_LIMIT_LOCAL = 1000;` — a real
// mirror under a SUFFIXED name, found while building this file's original
// exact-name version (which could not see it — spec 266's residue section
// claimed "no such site exists today", which this finding falsifies). That
// site is now this scan's POSITIVE CONTROL (asserted present below), not
// its definition — the family pattern is the definition, and it would catch
// any future `_DEFAULT`/`_FLOOR`/etc. suffix variant the same way.
//
// Each declared name is mapped back to its BASE rail (`APY_SANITY_LIMIT` or
// `DEFAULT_MIN_TVL`) for the equality assertion — `siteMatchesRail` compares
// against `rails[site.baseRail]`, never `rails[site.name]`.
//
// What the family still cannot see: a mirror under a name with NO shared
// prefix at all (e.g. a hypothetical `MAX_SANE_RATE = 1000`). This is
// measured, not assumed — `git ls-files '*.js' | xargs grep` for plausible
// unrelated names (`MAX_SANE_RATE`, `RATE_CEILING`, `TVL_FLOOR`,
// `MIN_TVL_FLOOR`) below turns up zero real declarations today; see the
// "unrelated-name residue" test.
// ===========================================================================

const RAIL_BASES = ['APY_SANITY_LIMIT', 'DEFAULT_MIN_TVL'];
// Plausible unrelated-name mirrors, checked (not assumed) to be absent —
// see the "unrelated-name residue" test below. Not exhaustive by
// construction (no scan for an unknown name CAN be exhaustive); this is the
// measured boundary of what the family widening still cannot see.
const PLAUSIBLE_UNRELATED_NAMES = ['MAX_SANE_RATE', 'RATE_CEILING', 'TVL_FLOOR', 'MIN_TVL_FLOOR', 'ANOMALY_THRESHOLD'];

function familyPattern(base) {
  return base + '[A-Z0-9_]*';
}

function stripJsComments(src) {
  // Safe ONLY for hand-written (non-minified) source — verified below to
  // agree with the anchored primary scan on every real tracked *.js file.
  // Minified files can contain a division-then-dereference byte sequence
  // that reads as an unterminated "/*", which corrupts a naive strip; see
  // header comment for why the require() fallback exists instead for those.
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

// Runs a global regex (capture group 1 = declared name, group 2 = numeric
// value) against `text`, returning every match as {declaredName, value, index}.
function allDeclarationMatches(re, text) {
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    out.push({ declaredName: m[1], value: Number(m[2]), index: m.index });
  }
  return out;
}

// Primary detector, FAMILY-widened: an anchored declaration for ordinary
// source (protects against a comment merely MENTIONING "NAME = 1000" as
// prose — verified below against the real repo's own such comments), an
// unanchored one for *.min.js (safe there; comma-joined sibling declarators
// need it — see header comment's app.compiled.min.js example). Returns
// EVERY distinct family member declared in the file for this base, not just
// the exact base name.
function primaryDeclarations(file, src, base) {
  const isMin = /\.min\.js$/.test(file);
  const re = isMin
    ? new RegExp('\\b(' + familyPattern(base) + ')\\s*=\\s*([0-9][0-9.eE+-]*)', 'g')
    : new RegExp('(?:const|var|let)\\s+(' + familyPattern(base) + ')\\s*=\\s*([0-9][0-9.eE+-]*)', 'g');
  return allDeclarationMatches(re, src).map((m) => ({
    declaredName: m.declaredName, value: m.value,
    line: src.slice(0, m.index).split('\n').length, method: 'declared literal',
  }));
}

// Comment-aware, UNANCHORED, FAMILY-widened loose scan — the cross-check
// that proves the anchored primary scan above isn't silently missing a
// declaration shape (or a family member) it doesn't recognise. Ordinary
// (non-.min.js) files only.
function looseDeclarations(src, base) {
  const stripped = stripJsComments(src);
  const re = new RegExp('\\b(' + familyPattern(base) + ')\\s*=\\s*([0-9][0-9.eE+-]*)', 'g');
  return allDeclarationMatches(re, stripped);
}

// The one file excluded beyond trust-rails.js itself — see header comment
// for why (DATA, not a declaration). Computed, not a second hand-typed
// string, so a rename of this file renames its own exclusion too.
const SELF_FILE = path.basename(__filename);

function rawTrackedJsFiles() {
  return execFileSync('git', ['ls-files', '*.js'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
}

function trackedJsFiles() {
  return rawTrackedJsFiles()
    .filter((f) => f !== 'trust-rails.js') // the source of truth, not a mirror to check against itself
    .filter((f) => f !== SELF_FILE); // this file — DATA, not a declaration; see header comment
}

function findDeclarationSites() {
  const files = trackedJsFiles();
  const sites = [];
  const looseCrossCheckFailures = [];
  const unparseableMinSites = [];

  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const src = fs.readFileSync(abs, 'utf8');
    const isMin = /\.min\.js$/.test(rel);

    for (const base of RAIL_BASES) {
      const primary = primaryDeclarations(rel, src, base);
      const primaryNames = new Set(primary.map((p) => p.declaredName));
      for (const p of primary) {
        sites.push({ file: rel, name: p.declaredName, baseRail: base, value: p.value, line: p.line, method: p.method });
      }

      if (isMin) {
        // Every NON-property-access, FAMILY-matching occurrence not already
        // resolved by the primary (text) scan above — a property READ like
        // translations.min.js's `TRUST_RAILS.DEFAULT_MIN_TVL` is a derived
        // reference, not a stranded declaration, and must not trip the
        // loud-fail below (excluded by the negative lookbehind on ".").
        const standaloneRe = new RegExp('(?<!\\.)\\b(' + familyPattern(base) + ')\\b', 'g');
        const standaloneNames = new Set(allDeclarationsOrNames(standaloneRe, src).filter((n) => !primaryNames.has(n)));
        for (const declaredName of standaloneNames) {
          // Fallback: require() a UMD-guarded minified module and read its
          // exported property directly (see header comment — planner.min.js
          // is the real, load-bearing case for this).
          let exported = null;
          try { exported = require(abs); } catch (e) { exported = null; }
          if (exported && typeof exported[declaredName] === 'number') {
            sites.push({ file: rel, name: declaredName, baseRail: base, value: exported[declaredName], line: null, method: 'require() (minified — name/value separated by the minifier)' });
          } else {
            // "Fail loudly rather than skip silently" (spec 266): the name
            // is textually present, standalone (not merely a property read),
            // but neither tier resolved a value.
            unparseableMinSites.push(`${rel}: contains standalone "${declaredName}" but require() did not export a numeric "${declaredName}"`);
          }
        }
        continue;
      }

      // Ordinary file — cross-check with the comment-aware loose scan; any
      // family member the loose scan finds that the anchored primary scan
      // did NOT already resolve means the anchored scan is silently missing
      // a real declaration shape (or a family member's shape).
      const loose = looseDeclarations(src, base);
      for (const l of loose) {
        if (!primaryNames.has(l.declaredName)) {
          looseCrossCheckFailures.push(`${rel}: loose (comment-aware, unanchored) scan found "${l.declaredName} = ${l.value}" but the anchored (const|var|let) declaration scan found nothing for that name — a declaration shape this scanner doesn't recognise, or a real value hiding in a non-declaration context; update the scanner rather than silently excluding this site`);
        }
      }
    }
  }

  return { sites, looseCrossCheckFailures, unparseableMinSites };
}

// Helper used only by the .min.js standalone-occurrence pass above: every
// DISTINCT capture-group-1 match of a name-only (no "=value") regex.
function allDeclarationsOrNames(re, text) {
  const names = new Set();
  let m;
  while ((m = re.exec(text))) names.add(m[1]);
  return Array.from(names);
}

// Pure equality checker, isolated so the in-file self-defeat case below
// proves the SAME logic the real assertions trust (test_test_registry.js's
// computeOrphans()/computeGhosts() idiom). Compares against the site's BASE
// rail, never its (possibly family-suffixed) declared name.
function siteMatchesRail(site, rails) {
  return site.value === rails[site.baseRail];
}

async function runLegC() {
  const { sites, looseCrossCheckFailures, unparseableMinSites } = findDeclarationSites();

  await test('Leg C: no family-matching name is textually present (standalone) in a *.min.js file without a resolvable value ("fail loudly rather than skip silently")', () => {
    assert.deepStrictEqual(unparseableMinSites, [], unparseableMinSites.join('\n'));
  });

  await test('Leg C: comment-aware, family-widened loose scan agrees with the anchored primary declaration scan on every ordinary (non-.min.js) tracked *.js file (no silently-missed declaration shape or family member)', () => {
    assert.deepStrictEqual(looseCrossCheckFailures, [], looseCrossCheckFailures.join('\n'));
  });

  // Beyond trust-rails.js (the source), exactly ONE file is excluded from
  // the population (this file itself, DATA not declarations — see header
  // comment) — so the exclusion can never quietly grow into a general list.
  await test('Leg C population exclusion, beyond trust-rails.js, is exactly one file (this test file) — never a growing exclusion list', () => {
    const excludedBeyondSource = rawTrackedJsFiles().filter((f) => f !== 'trust-rails.js' && !trackedJsFiles().includes(f));
    assert.deepStrictEqual(excludedBeyondSource, [SELF_FILE], `expected exactly [${SELF_FILE}] excluded beyond trust-rails.js; got ${JSON.stringify(excludedBeyondSource)}`);
  });

  console.log(`\nLeg C population: ${sites.length} declaration site(s) (name-FAMILY scan: ${RAIL_BASES.map(familyPattern).join(', ')}) across tracked *.js (trust-rails.js itself excluded — it is the source, not a mirror):`);
  console.log(JSON.stringify(sites.map((s) => ({ file: s.file, name: s.name, baseRail: s.baseRail, value: s.value, line: s.line, method: s.method })), null, 2));

  await test('Leg C population is non-vacuous and derived at test time (never a hardcoded file list)', () => {
    assert.ok(sites.length >= 10, `expected >=10 declaration sites; found ${sites.length}`);
    const files = new Set(sites.map((s) => s.file));
    assert.ok(files.has('app.js'), 'app.js (the canonical, human-owned declaration) must be in the population');
    assert.ok(files.has('planner.min.js'), 'planner.min.js must be in the population (the require()-fallback case)');
  });

  await test('Leg C family widening: PoolDetail.js/PoolDetail.compiled.js\'s APY_SANITY_LIMIT_LOCAL — the motivating finding, now the POSITIVE CONTROL — is in the population, mapped to base rail APY_SANITY_LIMIT', () => {
    const poolDetailSite = sites.find((s) => s.file === 'PoolDetail.js' && s.name === 'APY_SANITY_LIMIT_LOCAL');
    const poolDetailCompiledSite = sites.find((s) => s.file === 'PoolDetail.compiled.js' && s.name === 'APY_SANITY_LIMIT_LOCAL');
    assert.ok(poolDetailSite, 'expected PoolDetail.js APY_SANITY_LIMIT_LOCAL in the family-widened population; the exact-name scan could not see this, the family scan must');
    assert.ok(poolDetailCompiledSite, 'expected PoolDetail.compiled.js APY_SANITY_LIMIT_LOCAL in the family-widened population');
    assert.strictEqual(poolDetailSite.baseRail, 'APY_SANITY_LIMIT', 'APY_SANITY_LIMIT_LOCAL must map back to base rail APY_SANITY_LIMIT for the equality assertion');
    assert.strictEqual(poolDetailSite.line, 297, 'expected PoolDetail.js:297 (spec 266\'s residue note names this exact line)');
  });

  await test('Leg C unrelated-name residue: plausible mirror names sharing NO prefix with either rail base (the shape the family scan still cannot see) are measured, not assumed — zero found today', () => {
    const jsFiles = trackedJsFiles();
    const found = [];
    for (const rel of jsFiles) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const unrelated of PLAUSIBLE_UNRELATED_NAMES) {
        if (new RegExp('(?:const|var|let)\\s+' + unrelated + '\\s*=\\s*[0-9]').test(src) || new RegExp('\\b' + unrelated + '\\s*=\\s*[0-9]').test(src)) {
          found.push(`${rel}: ${unrelated}`);
        }
      }
    }
    console.log(`  (checked ${PLAUSIBLE_UNRELATED_NAMES.length} plausible unrelated name(s) across ${jsFiles.length} tracked *.js files; found: ${found.length ? JSON.stringify(found) : 'none'})`);
    assert.deepStrictEqual(found, [], `found an unrelated-name mirror the family scan cannot see: ${JSON.stringify(found)} — this is real residue, not a defect in this test (see header comment's "what the family still cannot see")`);
  });

  await test('Leg C self-defeat: siteMatchesRail() — the pure equality checker every assertion below trusts — reports a mismatch on a deliberately wrong in-memory site, and a match on a real one', () => {
    const rails = { APY_SANITY_LIMIT, DEFAULT_MIN_TVL };
    const fakeWrongSite = { file: '(in-memory, self-defeat only)', name: 'APY_SANITY_LIMIT', baseRail: 'APY_SANITY_LIMIT', value: APY_SANITY_LIMIT + 1, line: 1 };
    assert.strictEqual(siteMatchesRail(fakeWrongSite, rails), false, 'expected a deliberately wrong value to be reported as a mismatch — a check that cannot go red is not evidence it works');
    const realSite = sites.find((s) => s.file === 'app.js' && s.name === 'APY_SANITY_LIMIT');
    assert.ok(realSite, 'sanity: app.js APY_SANITY_LIMIT must be in the real population for this comparison to mean anything');
    assert.strictEqual(siteMatchesRail(realSite, rails), true, 'sanity: the real app.js site must still match after the self-defeat case ran');
  });

  await test('Leg C: every declared mirror (family-widened) equals trust-rails.js\'s BASE rail, in BOTH directions (site -> rail and rail -> site)', () => {
    const rails = { APY_SANITY_LIMIT, DEFAULT_MIN_TVL };
    const mismatches = sites.filter((s) => !siteMatchesRail(s, rails));
    const detail = mismatches.map((s) => {
      const where = s.line ? `${s.file}:${s.line}` : s.file;
      return `${where}: ${s.name} = ${s.value} (base rail ${s.baseRail}, trust-rails.js says ${rails[s.baseRail]})`;
    }).join('\n');
    assert.deepStrictEqual(mismatches, [], detail);
    // Direction 2, explicit (symmetric with strictEqual, but asserted the
    // other way round per spec 266 / test_api_worker.js's own convention —
    // never comparing a value to itself).
    for (const s of sites) {
      assert.strictEqual(rails[s.baseRail], s.value, `trust-rails.js's ${s.baseRail} (${rails[s.baseRail]}) must equal ${s.file}${s.line ? ':' + s.line : ''}'s declared ${s.name} value (${s.value}), reverse direction`);
    }
  });
}

// ===========================================================================
// Run all three legs.
// ===========================================================================

async function main() {
  console.log('test_webmcp_rail_derivation.js — backlog 266\n');
  console.log('Leg A (rendered Playwright)');
  await runLegA();
  console.log('\nLeg B (static class scan)');
  await runLegB();
  console.log('\nLeg C (mirror set-equality)');
  await runLegC();
  console.log(`\n${passed} assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('test_webmcp_rail_derivation.js crashed: ' + err.stack);
  process.exit(1);
});
