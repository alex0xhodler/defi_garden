# Backlog 266 — build notes

All four legs implemented (A, B, C, D) plus the `package.json` registration.
No scope expansion: `app.js`, `calculate_savings_projection`'s hardcoded
`apy = 5.5`, `plan.html`, tool names/schemas/descriptions, and rail VALUES
are all untouched, per the spec's OUT OF SCOPE list.

## Summary of changes

- **`home.html`** (Leg A) — `search_yield_pools`'s `execute`: the two
  literals (`p.tvlUsd < 100000`, `p.apy > 1000`) now read
  `window.TRUST_RAILS.DEFAULT_MIN_TVL` / `.APY_SANITY_LIMIT`. Added a local
  `totalApy(p)` helper, byte-equivalent to `edge/api-core.js:85`
  (`(Number(p.apyBase)||0) + (Number(p.apyReward)||0)`), used for the sanity
  rail, the `minApy` filter, and the `apy` value returned to the agent
  (previously DefiLlama's own unrailed `apy` field). A short comment points
  at the same reasoning as the neighbouring `:246-249` comment. Nothing else
  in the file changed — router, tool names/schemas/descriptions, and
  `calculate_savings_projection` are byte-identical to before.
- **`tools/test-agent-tools.js`** (Leg B) — now
  `require('../trust-rails.js')`; the invariant-check thresholds
  (`DEFAULT_MIN_TVL`, `APY_SANITY_LIMIT`) and their printed messages
  (`formatTvlFloor(DEFAULT_MIN_TVL)`) are derived from it; the APY invariant
  check now uses the same `totalApy()` arithmetic as home.html/
  edge/api-core.js instead of `x.apy`. The stale `10000000` literal is gone.
  Left `x.apy` alone at the one place it's just a console-log sample-pool
  display (line ~137, `p.apy.toFixed(2)`) — not an "invariant check" per the
  spec's own scoping of Leg B, and I have no evidence of what shape
  `scripts/dashboard-server.js`'s `/api/pools` actually returns in this
  checkout (see "Could not verify" below), so I did not touch it.
- **New `test_rail_predicate_derivation.js`** (Leg C, plain lane) — see
  "Leg C: population, detector, allowlist" below.
- **New `test_webmcp_rail_derivation.js`** (Leg D, browser lane) — see "Leg D"
  below.
- **`package.json`** — appended
  `&& node test_rail_predicate_derivation.js && node test_webmcp_rail_derivation.js`
  at the very end of the `test:serial` chain (same append-at-the-end
  convention backlog 261's notes used).

## Deviation from the spec's literal wording (disclosed, not silent)

The task's Leg C instruction says: "EXCLUDE `*.min.js`, `*.compiled.js`, and
`run-tests.js`'s own generated-artifact twins." Taken completely literally
this reads as three separate exclusion items, but `run-tests.js` has no
generated twins of its own. Spec 266's own Territory Notes give the actual
intended meaning verbatim: *"Generated twins (`*.min.js`, `*.compiled.js`)
mirror `PoolDetail.js`/`planner.js`... `test_compiled_assets.js` guards that
relationship"* — i.e. the twins ARE `*.min.js`/`*.compiled.js`, and
`test_compiled_assets.js` (found via `run-tests.js`'s registry) is what
guards them being fresh. I implemented the exclusion as the spec's Territory
Notes describe (excluding `*.min.js`/`*.compiled.js`, both root-level and the
`.compiled.min.js` double-suffix case), not as three independent glob
exclusions, and documented this reading in the test file's own header
comment.

## Leg C: population, detector, allowlist

**Population**: `fs.globSync(['*.js','test_*.js','edge/*.js','tools/*.js'])`
(root-only, non-recursive) plus the two named files `home.html`/`plan.html`,
minus `*.min.js`/`*.compiled.js`. Resolves to **207 files** on this tree
(206 before Leg C's own test file joined the population; 207 once Leg D's
file joined too). Verified excluded-by-role, each checked for `*.js` file
count before writing the exclusion into the header comment:

| root | `*.js` files found | role |
|---|---|---|
| `pools/`, `tokens/`, `chains/`, `ko/`, `stories/` | 0 each | generated `*.html`/`*.md` SEO surface, different population |
| `src/` | 2 (`poller-core.js`, `poller.js`) | background KPI-poller infra, own independent rail mirror per `trust-rails.js`'s own header |
| `product-loop-kit/` | 6 | loop tooling/spec archive, not product code |
| `telegram-bot/` | 75 | separate deployable subsystem (task's own DO-NOT list) |
| `workers/` | 1 | separate deployable subsystem (task's own DO-NOT list) |
| `.well-known/` | 1 | third-party template; its `*.json` manifest surface is item 261's population, not this one |
| `data/`, `assets/`, `fonts/`, `og/`, `test-fixtures/`, `test_fixtures/` | 0 each | no `*.js` files at all |

(`whatsapp-bot/` doesn't exist in this checkout, so it never had a chance to
leak in either way — not listed in the header's exclusion table for that
reason, but mentioned here for completeness.)

**Detector**: a comment/string-aware character-level tokenizer (tracks
`'`/`"`/`` ` `` string state and `${...}` template-literal interpolation
re-entry) strips real `//`/`/* */` comments and ordinary string text before
regex-scanning for `ident OP literal` / `literal OP ident` (both operand
orders, canonicalised to one key) where `ident` contains `tvl`/`apy`
case-insensitively and `literal` is non-zero. Two bugs found and fixed while
building this, both worth recording:

1. **A naive line-based `//`/`/* */`-stripper (no string awareness)
   mis-parsed itself.** `test_agent_surface_rail_claims.js` contains glob
   strings like `'tools/*.json'` and `'product-loop-kit/**'` — the substring
   `/*` inside those STRING LITERALS was mistaken for a block-comment open,
   which then consumed real code up to the next `*/` anywhere later in the
   file (including two real `assert.ok(tvlClaims.length >= 2, ...)` sites,
   which silently disappeared from the scan). Fixed by tracking actual
   string/template state, not just "look for `/*`" — verified by checking
   those two sites are present in the final scan output.
2. **No word-boundary guard on the literal produced a false site.**
   `planner.js:1534`'s real code is
   `if (apy2 > APY_SANITY_LIMIT || apy2 <= 0) continue;` — the correct rail
   re-check, comparing against the imported CONSTANT, not a literal. Without
   a `(?<![\w$.])` lookbehind before the numeric-literal capture, the regex
   matched the trailing `2` of `apy2` as if it were a standalone literal,
   producing a phantom `"2 > APY_SANITY_LIMIT"` site. Fixed by requiring a
   non-identifier character (or start-of-match) immediately before both the
   identifier and the literal captures. Verified: `planner.js` now
   contributes zero sites, matching its actual code (it does the rail
   re-check *right*, which is exactly why the detector should never flag
   it).

**Final scan, this checkout, after Legs A+B: 32 sites in 12 files, 31 unique
`file|expr` keys** (`app.js`'s `minTvl >= 1000000` appears on two lines,
2260 and 3283, for two different reasons — both folded into one allowlist
entry whose reason names both). `home.html` and `tools/test-agent-tools.js`
contribute **zero** sites — asserted as its own dedicated test, not just
implied by the allowlist's absence of entries for them.

### Allowlist summary, by reason category (31 entries)

| category | count | files |
|---|---|---|
| Display/analytics risk-confidence band (a pool already admitted gets sorted into a UI/reporting tier) | 15 | `PoolDetail.js` (5), `analytics.js` (10) |
| Explicit mirror of the above (generated static pages) | 5 | `generate-pool-pages.js` |
| A DIFFERENT, intentional, lower gate named in spec 266's own Evidence table (SEO-hygiene, not the admission rail) | 2 | `generate-sitemap.js` |
| Unrelated UI/analytics threshold (the user's own filter selection crossing $1M) | 1 | `app.js` |
| Test-only: array-length anti-vacuity count (identifier merely contains "tvl"/"apy" as a name fragment) | 2 | `test_agent_surface_rail_claims.js` |
| Test-only: statistics/tolerance value unrelated to either rail | 2 | `test_compute_kpis.js`, `test_pool_twin_parity.js` |
| Test-only: fixture-partition/persona-curation threshold (arbitrary or a persona's own bar, not `DEFAULT_MIN_TVL`) | 2 | `test_dead_pool.js`, `test_planner.js` |
| Test-only: fixture-construction sanity check that numerically coincides with the rail today | 2 | `test_pool_twins.js`, `test_pools_snapshot.js` |

**On the last row** — both `test_pool_twins.js:117` and
`test_pools_snapshot.js:76` use a literal that happens to equal
`DEFAULT_MIN_TVL` ($100,000) *today*. I classified them as intentional
test-construction/verification values rather than fixing them, because (a)
Leg A/B's scope is `home.html`/`tools/test-agent-tools.js` only — the spec's
Change section names exactly those two files, and (b)
`generate-pools-snapshot.js` (the module `test_pools_snapshot.js` actually
exercises) has its **own, separate, pre-existing, unlinked** local constant
— `generate-pools-snapshot.js:52`: `const DEFAULT_MIN_TVL = 100000;` — that
does NOT `require('./trust-rails.js')`. This is a genuine THIRD (really
fourth, counting the two this item fixes) unlinked copy of the rail value,
invisible to Leg C's detector because it's a bare assignment with no
comparison operator (documented coverage limitation (a) in the test's header
comment). It is real residue, **not fixed here** (out of scope — Legs A/B
name two specific files, and expanding to a third is exactly the scope
creep the task instructions forbid). Flagging for a future item, not
ticketing one myself per the outer instructions.

## Leg D: rendered acceptance

`test_webmcp_rail_derivation.js` serves the repo statically (same
`startServer`/MIME/`CHROMIUM_EXECUTABLE` idiom as `test_smoke.js`/
`test_northstar_cta_fires.js`), routes `https://yields.llama.fi/pools` to an
in-test fixture, loads `/`, and calls the *live* `search_yield_pools.execute`
found off `window.navigator.modelContext.tools` — never a re-implementation
of the filter logic in the test itself. Fixture pools:

- `below-floor-pool`: `tvlUsd: DEFAULT_MIN_TVL - 1` → excluded
- `at-floor-pool`: `tvlUsd: DEFAULT_MIN_TVL` (exactly) → included
- `defect3-excluded-pool`: `apy: 5`, `apyBase`/`apyReward` each
  `round(APY_SANITY_LIMIT * 0.9)` (900/900 today, total 1800) → excluded
  (positive control: the old `p.apy > 1000` check would have admitted this
  pool since its upstream `apy` field is only 5)
- `defect3-included-pool`: `apyBase: 5, apyReward: 0` (total 5), upstream
  `apy: APY_SANITY_LIMIT * 2` (2000 today) → included, and its RETURNED
  `apy` must equal 5, never 2000

All four TVL/APY figures are computed from `DEFAULT_MIN_TVL`/
`APY_SANITY_LIMIT` read via `require('./trust-rails.js')` in Node at test
time, never the raw numbers — the `900`/`2000`/`100000ish` values in the
console output are what those formulas evaluate to *today*, not literals in
the test source (verified directly by mutation 4 below, which changes
`DEFAULT_MIN_TVL` and watches the test's own printed values move with it).
Also added a `minApy` check (not explicitly demanded by the acceptance list,
but directly implied by "The APY rail and the `minApy` filter operate on
`apyBase + apyReward`") proving the filter reads the computed total, not the
upstream field, by setting `minApy` just above the TRUE total and confirming
it excludes a pool whose STALE upstream field was far above that.

## Non-vacuity log — all 5 mutations executed in-session

Baseline hashes (recorded before any mutation):
`home.html` = `b063bd95d26ff0599730660debfd9934`,
`trust-rails.js` = `60487050645511d3dd8a21d22331316e`,
`test_rail_predicate_derivation.js` = `4dacaf157d33e716b51da253d658815a`.

### 1. Re-introduce `if (p.tvlUsd < 100000) return false;` in home.html

Applied as an ADDED redundant line right after the fixed
`window.TRUST_RAILS.DEFAULT_MIN_TVL` check (both checks coexist; today they
evaluate identically since the literal equals the current rail — that's the
whole point of this mutation).

**Leg C — RED**, quoted:
```
    Leg A/B did not fully derive from trust-rails.js — found literal(s): [{"file":"home.html","line":280,"expr":"p.tvlUsd < 100000"}]
  ✗ backlog 266 acceptance: home.html and tools/test-agent-tools.js contribute ZERO sites after Legs A+B
    home.html:280: unclassified pool-threshold literal comparison "p.tvlUsd < 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
  ✗ every scanned site is in the allowlist (a new unlinked rail-copy literal cannot land silently)
```

**Leg D — confirmed still GREEN** (10/10 tests passed) — proving Leg D alone
would NOT have caught a correct-today copy, which is exactly why Leg C
exists.

Restore: `md5sum home.html` → `b063bd95d26ff0599730660debfd9934` (matches
baseline, byte-identical). Re-run Leg C: **green**, 7/7 assertions passed.

### 2. Delete one allowlist entry (`PoolDetail.js|pool.tvlUsd < 1000000`)

**Leg C — RED**, quoted:
```
  ✗ every scanned site is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    PoolDetail.js:325: unclassified pool-threshold literal comparison "pool.tvlUsd < 1000000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
(scan ⊄ allowlist direction, as expected)

Restore: `md5sum test_rail_predicate_derivation.js` →
`4dacaf157d33e716b51da253d658815a` (matches baseline, byte-identical).
Re-run: **green**, 7/7 assertions passed.

### 3. Add a fabricated allowlist entry (`nonexistent-file.js|fabricatedTvl > 999999999`)

**Leg C — RED**, quoted:
```
  ✗ every allowlist entry still matches at least one scanned site (the mirror cannot rot)
    nonexistent-file.js|fabricatedTvl > 999999999: allowlist entry matches nothing in the current scan — the code changed (or the entry was mistyped); update or remove it
```
(allowlist ⊄ scan direction — anti-rot, as expected)

Restore: `md5sum test_rail_predicate_derivation.js` →
`4dacaf157d33e716b51da253d658815a` (matches baseline, byte-identical).
Re-run: **green**, 7/7 assertions passed.

### 4. `trust-rails.js`: `DEFAULT_MIN_TVL = 250000`

**Leg D — stayed GREEN** (10/10 tests passed; the "at-floor" assertion's own
label printed `"a pool at EXACTLY DEFAULT_MIN_TVL (250000) is INCLUDED"`,
proving the fixture itself moved with the mutated constant). Per the spec:
green here IS the proof the page follows the rail (both sides derive from
the same source), NOT a false negative.

**Additionally verified the page's admission BEHAVIOUR actually changed**
(spec's own extra requirement, not just "the derived test stayed green"):
a one-off Playwright script (not committed — throwaway verification only)
loaded the mutated page and called the live tool with a single pool at the
OLD floor (`tvlUsd: 100000`). Output:
```
page window.TRUST_RAILS.DEFAULT_MIN_TVL = 250000
OLD-FLOOR pool ($100,000 TVL) present in results? false
PASS: old-floor pool ($100,000) is now EXCLUDED — the page followed the mutated rail, proving Leg A truly derives at runtime, not a cached/compiled value.
```

Restore: `md5sum trust-rails.js` → `60487050645511d3dd8a21d22331316e`
(matches baseline, byte-identical). Re-run Leg D: **green**, 10/10 tests
passed.

### 5. Revert home.html's `totalApy(p)` usage to `p.apy`

Applied by changing the two comparison sites and the returned `apy` field
back to `p.apy` (kept the now-unused `totalApy` function definition in
place, to isolate this one mutation).

**Leg D — RED on both defect-3 fixtures**, quoted:
```
  ✗ defect 3, direction 1: apy:5 but apyBase+apyReward over APY_SANITY_LIMIT is EXCLUDED (the old apy-field check would have admitted it)
    defect-3-excluded pool (apyBase=900, apyReward=900, upstream apy=5) was wrongly included: {"pool":"defect3-excluded-pool", ... "apy":5}
  ✗ defect 3, direction 2: apy:2000 but apyBase+apyReward well under APY_SANITY_LIMIT is INCLUDED (the old apy-field check would have rejected it)
    defect-3-included pool was wrongly excluded from: [...]
  ✗ the returned `apy` equals apyBase+apyReward, never the stale upstream `apy` field
    defect-3-included pool missing from results — cannot check its apy
(7/10 tests passed, 3 failed)
```

Restore: `md5sum home.html` → `b063bd95d26ff0599730660debfd9934` (matches
baseline, byte-identical). Re-run Leg D: **green**, 10/10 tests passed.

## Verification run (this session)

- `node test_rail_predicate_derivation.js` — **green**, 7/7 assertions
  (population 207 files, 32 sites, 31 allowlist entries).
- `node test_webmcp_rail_derivation.js` — **green**, 10/10 tests.
- `node test_test_registry.js` — **green**, 5/5 assertions (both new files
  present in `test:serial`, no orphans/ghosts/duplicates).
- `node run-tests.js --list --lane=plain` / `--lane=browser` — confirms
  `test_rail_predicate_derivation.js` classifies `plain` and
  `test_webmcp_rail_derivation.js` classifies `browser` (the latter contains
  the literal string `playwright`, satisfying the classifier and the task's
  own naming requirement).
- `node test_smoke.js` — **green**, 13/13 assertions (both router paths:
  bare `/` → landing, `/plan.html` → planner, `/?token=USDC` → analytics app
  with pool cards; ran twice in this session, both green, including once
  AFTER all 5 mutations had been restored).
- `node test_agent_surface_rail_claims.js && node test_rail_floor_derivation.js
  && node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
  && node test_api_worker.js` — all **green** individually (all exit 0;
  `test_api_worker.js`: 750/750 assertions).
- `node run-tests.js --lane=plain --timeout=120` — ran within a 290s
  timebox and completed (did not need to be reported as "didn't fit"):
  **63 files selected, 61 pass, 2 fail, 0 timeout.** The 2 failures are
  **pre-existing and unrelated to this item**:
  - `test_translations_number_format.js` — fails on
    `en.landing.trustFloor`/`en.planner.personaDegenDesc` zero-arg-function
    arity, a translations.js/backlog-254 concern with no connection to
    `home.html`'s WebMCP tool or `tools/test-agent-tools.js`.
  - `test_vercelignore.js` — fails because `ko/tokens/0x0.html`/`.md` (a
    generated SEO page) isn't tracked by git in this checkout — a
    generated-asset-completeness issue in this sandbox, not a rail defect;
    confirmed by grep that neither failing test references
    `trust-rails.js`/`home.html`'s tool body/`tools/test-agent-tools.js`
    logic at all (`test_vercelignore.js` only lists `home.html`/`plan.html`
    among many other filenames in a MUST-KEEP path array).

## An observation, not an action I took

Partway through this session `git log` shows a commit already exists on
this branch — `f28f74951a "wip(266): checkpoint mid-build — spec + legs A/B
(local only, to be amended into one commit before push)"` — whose tree
already matches my Leg A/B edits to `home.html`/`tools/test-agent-tools.js`
byte-for-byte (`git diff` against `HEAD` shows no changes for either file).
**I did not run `git commit`, `git add`, or any other git write command at
any point in this session** — the task instructions explicitly forbid it and
I followed that. This commit appears to be an automatic checkpoint the
harness took mid-session, independent of anything I invoked. My Leg C/D work
and the `package.json` edit remain uncommitted in the working tree, as
instructed ("leave all files in the working tree for review") — `git
status` shows `package.json` modified and both new test files untracked.
Flagging this plainly rather than silently letting a report say "nothing was
committed" when a commit is, in fact, sitting in `git log`.

## Residue (recorded, not fixed — all explicitly out of scope)

- **`home.html`'s `calculate_savings_projection` tool hardcodes
  `var apy = 5.5;`** (home.html, inside the second WebMCP tool's `execute`).
  This is a fabricated, unrailed projection rate with no connection to
  either `DEFAULT_MIN_TVL` or `APY_SANITY_LIMIT` — spec 266's own OUT OF
  SCOPE section names this explicitly ("a fabricated projection rate is a
  different class — an unrailed *number*, not an unlinked *rail*") and
  instructs recording it here, not fixing it. Untouched.
- **`generate-pools-snapshot.js:52`**: `const DEFAULT_MIN_TVL = 100000;` —
  a pre-existing, unlinked, bare-assignment copy of the rail value (not
  `require('./trust-rails.js')`), invisible to Leg C's detector by design
  (no comparison operator — documented coverage limitation (a)). Discovered
  while classifying `test_pools_snapshot.js:76`'s allowlist entry. Out of
  this item's Leg A/B scope (`home.html`, `tools/test-agent-tools.js` only).
  Not ticketed here per the outer task instructions ("do not edit
  BACKLOG.md/LOG.md").
- **Rail SEMANTICS remain machine-unchecked outside home.html.** Leg C's
  detector only sees "a literal compared against a tvl/apy-named
  identifier" — it cannot tell whether a passing comparison is railing the
  RIGHT quantity (e.g. a future file could correctly derive
  `APY_SANITY_LIMIT` from `trust-rails.js` but still compare it against the
  wrong field, exactly like home.html's own defect 3 before this item). Leg
  D closes this gap for `home.html` specifically, by rendered behaviour; no
  other file in the population has an equivalent rendered check. Recorded
  per spec 266's own "Class closed by this item" bullet (c), not ticketed.

## Could not verify

- `tools/test-agent-tools.js` itself was **not runnable end-to-end** in this
  checkout: it `spawn`s `scripts/dashboard-server.js`, which does not exist
  in this repo (`ls scripts/` has no `dashboard-server.js`). This matches
  the spec's own Territory Notes ("This file is not in the test registry —
  it needs a running server on :8001 — so it stays out of the chain"). I
  verified the source-level correctness of the diff (grep confirms zero
  remaining literal tvl/apy comparisons in the file, and Leg C's scan
  independently confirms it contributes zero sites) but could not exercise
  it live end-to-end for lack of the server it spawns.

## Operator-requested widening (assignment stratum)

Leg C's own header comment (coverage limitation (a)) already documented the
blind spot: the comparison-only detector cannot see a rail copy written as a
bare `const|let|var IDENT = LITERAL;` ASSIGNMENT, with no comparison operator
anywhere near it. An operator review measured this stratum directly across
the same population Leg C already globs and found it was not one site
(`generate-pools-snapshot.js:52`, the residue Leg C's own build recorded) —
it was a dozen-plus. This entry documents the widening that closes that gap.

### What was found

`test_rail_predicate_derivation.js` was extended with a second detector,
`findAssignmentSites` (paired with a new comment-only stripper,
`stripComments`), scanning the SAME globbed population (207 files) for
`const|let|var <IDENT containing tvl/apy> = <non-zero numeric literal>;`.
Unlike the comparison detector, this scan deliberately does **not** blank
out string/template TEXT — only real `//`/`/* */` comments are stripped —
because three real sites in this repo are hand-typed declarations living
**inside a string literal** (`tokenSrc.replace('const MIN_POOL_TVL =
100000;', patchedMarker)` scratch-patch markers in `test_chain_pages.js`/
`test_markdown_twins.js`/`test_token_pages.js`); blanking string text the
way the comparison scan does would make those invisible too, which is the
wrong call for this shape. Running the widened scan against this checkout,
before any fix, found **26 assignment sites across 18 files** (4 of them —
`app.js`'s and `trust-rails.js`'s own `APY_SANITY_LIMIT`/`DEFAULT_MIN_TVL`
declarations — are the canonical source and are excluded by role, proven
by a dedicated assertion that they are *exactly* those two constants each,
not a wrong-shaped exclusion silently swallowing something else).

The operator's own finding table (in the task instructions) named 14 of
these sites across 9 files. Running the widened detector for real, against
the live population rather than trusting that table as exhaustive, surfaced
**8 more sites the table did not name**: `PoolDetail.js`'s
`APY_SANITY_LIMIT_LOCAL`, `compute-kpis.js`'s own `APY_SANITY_LIMIT` (in
addition to the `RISK_FREE_APY` the table did name), `generate-spotlight.js`'s
own `APY_SANITY_LIMIT` (in addition to the `DEFAULT_MIN_TVL` at line 73 the
table did name), `generate-stories.js`'s own `APY_SANITY_LIMIT` (in addition
to the `BANK_APY` the table did name), `home.html`'s `calculate_savings_
projection`'s `var apy = 5.5` (spec 266's own already-recorded OUT-OF-SCOPE
residue — a fabricated projection rate, not a rail copy), `planner.js`'s own
`APY_SANITY_LIMIT`, and `test_kpi_rail_history.js`'s own `APY_SANITY_LIMIT`
mirror. All are classified below; none is silently invisible now — every
one is either fixed (derives from `trust-rails.js`, so it no longer matches
the scan's literal-RHS shape) or allowlisted with an honest reason.

### Full classified table

| file | expression | disposition | reason (short) |
|---|---|---|---|
| `app.js` | `const APY_SANITY_LIMIT = 1000` | canonical, excluded by role | the source; never touched |
| `app.js` | `const DEFAULT_MIN_TVL = 100000` | canonical, excluded by role | the source; never touched |
| `trust-rails.js` | `var APY_SANITY_LIMIT = 1000` | canonical source, excluded by role | the ONE mirror every other consumer reads; never touched |
| `trust-rails.js` | `var DEFAULT_MIN_TVL = 100000` | canonical source, excluded by role | the ONE mirror every other consumer reads; never touched |
| `generate-pools-snapshot.js` | `const APY_SANITY_LIMIT = 1000` | **FIXED** | now `require('./trust-rails.js')`; header + runtime print (`formatTvlFloor`) fixed too |
| `generate-pools-snapshot.js` | `const DEFAULT_MIN_TVL = 100000` | **FIXED** | same require, same fix |
| `generate-sitemap.js` | `const SITEMAP_MIN_TVL = 100000` | **FIXED** | now `require('./trust-rails.js')` (destructured as `DEFAULT_MIN_TVL: SITEMAP_MIN_TVL`); "no shared import exists" comment corrected |
| `generate-sitemap.js` | `const APY_SANITY_LIMIT = 1000` | **FIXED** | same require |
| `generate-spotlight.js` | `const DEFAULT_MIN_TVL = 100000` (line 73) | **FIXED** | now `require('./trust-rails.js')`; the "deliberately NOT $100K .../must clear the $10M floor" comment rewritten to name the relationship, not re-type a figure |
| `generate-token-pages.js` | `const APY_SANITY_LIMIT = 1000` | **FIXED** (task's conditional instruction) | now `require('./trust-rails.js')`; `node test_token_pages.js` stayed green (109/109) so no allowlist fallback was needed |
| `generate-token-pages.js` | `const MIN_POOL_TVL = 100000` | allowlisted | this generator's OWN long-tail-SEO eligibility floor (human directive 2026-07-11), deliberately separate, coincides with the value today by coincidence, not contract |
| `generate-pool-pages.js` | `const POOL_ARTIFACT_MIN_TVL = 1000` | allowlisted | the JSON paint artifact's own honest floor (item 216) |
| `compute-kpis.js` | `const RISK_FREE_APY = 4.0` | allowlisted | unrelated financial constant (disclosed risk-free benchmark) |
| `generate-stories.js` / `planner.js` | `BANK_APY = 0.5` | allowlisted (both files) | unrelated financial constant (savings-account contrast figure) |
| `home.html` | `var apy = 5.5` | allowlisted | spec 266's own OUT-OF-SCOPE fabricated projection rate; not a rail copy |
| `test_chain_pages.js` / `test_markdown_twins.js` / `test_token_pages.js` | `const MIN_POOL_TVL = 100000` (string-embedded) | allowlisted (3 entries) | scratch-patch STRING markers, unlinked text-mirrors of `generate-token-pages.js`'s own `MIN_POOL_TVL` |
| `test_seo_cta_targets.js` | `const APP_DEFAULT_MIN_TVL = 100000` | allowlisted | test fixture floor, unlinked mirror |
| `test_planner.js` | `var apy = 5.3` (×2 lines, 1 key) | allowlisted | local per-test fixture rate ("disney" bundle scenario), not a rail constant |
| **beyond the operator's table** — found by running the widened scan for real: | | | |
| `PoolDetail.js` | `const APY_SANITY_LIMIT_LOCAL = 1000` | allowlisted (residue) | genuine unlinked mirror ("mirror of app.js constant"); core UI component, not one of the three named fix targets |
| `compute-kpis.js` | `const APY_SANITY_LIMIT = 1000` | allowlisted (residue) | genuine unlinked mirror ("TRUST RAIL mirror, source of truth: app.js:800"); not one of the three named fix targets |
| `generate-spotlight.js` | `const APY_SANITY_LIMIT = 1000` (line 414 after the earlier edit) | allowlisted (residue) | genuine unlinked mirror ("mirrors planner.js:19"); the task named only this file's `DEFAULT_MIN_TVL` (line 73) as a fix target, not this |
| `generate-stories.js` | `const APY_SANITY_LIMIT = 1000` | allowlisted (residue) | genuine unlinked mirror; not one of the three named fix targets |
| `planner.js` | `var APY_SANITY_LIMIT = 1000` | allowlisted (residue) | genuine unlinked mirror at the top of core planner code; deriving the DECLARATION is Leg A/D territory the outer task said not to redo |
| `test_kpi_rail_history.js` | `const APY_SANITY_LIMIT = 1000` | allowlisted (residue) | read-only test-fixture mirror, not named by the operator's table |

**Total after the fix pass**: 32 comparison sites (unchanged from Leg C's original build) + 18 non-canonical assignment sites (+4 canonical, excluded by role) = 48 allowlist entries.

### Deviations from a literal reading of the task, disclosed

1. **The task's Leg-2 fix list named `generate-spotlight.js:73` only** (its
   `DEFAULT_MIN_TVL`). The SAME file also hand-types `APY_SANITY_LIMIT = 1000`
   at what is now line 414 (line 408 before the edit shifted it), with a
   comment saying "mirrors planner.js:19 — same value, never weakened." This
   is a genuine unlinked mirror by the same standard as the fixed constants,
   but it was not named in either the operator's evidence table or the
   task's explicit step-2 fix list, and `planner.js:19` itself (the thing it
   claims to mirror) is core browser planner code the task says not to
   redo (Leg A/D territory). I allowlisted it as residue rather than fixing
   it unilaterally, to keep this a bounded widening rather than expanding
   the diff beyond what was authorized. Flagged here for a future item.
2. **Same reasoning applied to `PoolDetail.js`, `compute-kpis.js`'s own
   `APY_SANITY_LIMIT`, `generate-stories.js`'s own `APY_SANITY_LIMIT`,
   `planner.js`'s own `APY_SANITY_LIMIT`, and `test_kpi_rail_history.js`** —
   all genuine unlinked mirrors the widened scan found that neither the
   operator's table nor the task's explicit fix list named. None was fixed;
   all are allowlisted with an honest reason stating plainly that they ARE
   mirrors, not "different thresholds" — this widening's own task text
   permits exactly this move for the four `test_*.js` mirrors it did name
   ("residue, not fixed here"), and I extended that same honesty standard
   to the additional sites the broader scan turned up rather than either
   silently fixing them (scope creep) or silently omitting them from the
   allowlist (which would make the guard fail).
3. **`generate-token-pages.js`'s `APY_SANITY_LIMIT` was fixed, not
   allowlisted** — the task's own conditional ("derive it... unless doing
   so breaks `node test_token_pages.js`, in which case allowlist it") was
   exercised: the derivation was applied and `node test_token_pages.js` ran
   green (109/109 assertions), including its own `test_chain_pages.js`/
   `test_markdown_twins.js` scratch-copy siblings (both of which `require()`
   a patched copy of this exact file), so no allowlist fallback was needed.
4. **The assignment-scan detector does not strip string/template TEXT**
   (only comments), unlike the comparison detector, which strips both. This
   is a deliberate, disclosed divergence from the comparison scan's own
   convention, driven by needing to catch the 3 string-embedded
   `test_chain_pages.js`/`test_markdown_twins.js`/`test_token_pages.js`
   scratch-patch markers the operator's table explicitly named as sites.
   The header comment ("ASSIGNMENT DETECTOR") states this reasoning and its
   own residual limitation (a hand-typed declaration inside a string is
   fragile to that generator's declaration TEXT reformatting in a way this
   guard cannot see — caught today only by each test's own `assert.ok`).
5. **Allowlist reason strings and the synthetic comment-stripping test
   fixture had to be written carefully to avoid self-pollution.** Because
   the assignment scan does not strip strings, and `test_rail_predicate_
   derivation.js` is itself part of the scanned population, an early draft
   of this widening had its OWN allowlist reason text (quoting
   `'const MIN_POOL_TVL = 100000;'` verbatim, semicolon included, to
   describe the `test_chain_pages.js` scratch-patch marker) and its OWN
   synthetic test snippet (built as bare string literals) both trip the new
   detector when the file scanned itself — see the non-vacuity log below,
   which caught this live. Fixed by (a) rephrasing the allowlist reasons to
   describe the pattern without reproducing a semicolon-terminated
   `IDENT = LITERAL;` sequence verbatim, and (b) building the synthetic
   snippet via string concatenation (`const K = 'const'; K + ' ... = ...;'`)
   so the keyword never appears contiguous with its identifier in this
   file's own raw source. Both are commented in place explaining why.

### Complete non-vacuity log, executed in-session, with md5 pairs

Baseline hashes (recorded before any mutation, after all fix-pass edits were
already applied and the suite was green):

```
test_rail_predicate_derivation.js  114941831cf0aeb8624131c9253141c8
generate-pools-snapshot.js         349d296732d0f76e56c866c9e69977fa
generate-spotlight.js              90a432c478da64cb393a7fe6b0ee570c
generate-sitemap.js                0093c2820e5ade274801adb377527f97
generate-token-pages.js            c7b7064b3b8ac647db172b08f78eba9b
compute-kpis.js                    668ca89d406fe989ff5fac52d70fcaef  (untouched by the fix pass — used as the mutation target for items 1 and 4 below, since it carries two real assignment sites)
```

**1. Bare `const FOO_MIN_TVL = 100000;` added to a scanned non-canonical
file (`compute-kpis.js`, next to `RISK_FREE_APY`) → RED (unclassified site),
quoted:**
```
  ✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    compute-kpis.js:51: unclassified pool-threshold literal assignment "const FOO_MIN_TVL = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
FAILED
```
Restore: `md5sum compute-kpis.js` → `668ca89d406fe989ff5fac52d70fcaef` (matches
baseline, byte-identical; also confirmed via `git diff --stat compute-kpis.js`
producing no output). Re-run: **green**, 11/11 assertions.

**2. Deleted the `PoolDetail.js|const APY_SANITY_LIMIT_LOCAL = 1000`
allowlist entry → RED (scan ⊄ allowlist), quoted:**
```
  ✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    PoolDetail.js:297: unclassified pool-threshold literal assignment "const APY_SANITY_LIMIT_LOCAL = 1000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
FAILED
```
Restore: `md5sum test_rail_predicate_derivation.js` →
`114941831cf0aeb8624131c9253141c8` (matches baseline, byte-identical). Re-run:
**green**, 11/11 assertions.

**3. Added a fabricated allowlist entry
(`nonexistent-file.js|const FABRICATED_MIN_TVL = 999999999`) → RED
(allowlist ⊄ scan, anti-rot), quoted:**
```
  ✗ every allowlist entry still matches at least one scanned site (the mirror cannot rot)
    nonexistent-file.js|const FABRICATED_MIN_TVL = 999999999: allowlist entry matches nothing in the current scan — the code changed (or the entry was mistyped); update or remove it
FAILED
```
Restore: `md5sum test_rail_predicate_derivation.js` →
`114941831cf0aeb8624131c9253141c8` (matches baseline, byte-identical). Re-run:
**green**, 11/11 assertions.

**4. Comment-stripping proof.** Two parts, both executed:
   - **Permanent unit assertion** (green in the normal run, quoted from the
     suite output): `✓ comment-stripping works for the assignment scan: a
     commented-out rail-shaped assignment is NOT reported, a real one still
     is` — calls `findAssignmentSites` directly on a synthetic snippet with
     one `//`-commented, one `/* */`-commented, and one real declaration,
     and asserts only the real one is reported.
   - **The header's own quoted `const DEFAULT_MIN_TVL = 100000` (coverage
     limitation (a), inside this file's own top-of-file block comment) is
     confirmed NOT reported** — also a permanent, always-run assertion,
     green: `✓ this file's OWN header-comment quote of `const
     DEFAULT_MIN_TVL = 100000` (coverage limitation (a)) is not reported as
     a site`. (Discovered live, mid-build: an early draft of this same
     assertion's OWN test title and the allowlist's OWN reason strings — see
     deviation 5 above — themselves tripped this check, because the scan
     does not strip strings; both were rephrased to stop reproducing a
     complete `IDENT = LITERAL;` sequence, and the assertion then went green
     and has stayed green since.)
   - **Live mutation — commenting out a real site makes it disappear from
     the scan**, executed: commented out `compute-kpis.js`'s real
     `const RISK_FREE_APY = 4.0;` line. Result — **RED** on the OTHER
     direction (allowlist ⊄ scan, since the entry now matched nothing),
     which is the direct, positive proof the site vanished from the scan
     the moment it was commented out, quoted:
     ```
       ✗ every allowlist entry still matches at least one scanned site (the mirror cannot rot)
         compute-kpis.js|const RISK_FREE_APY = 4.0: allowlist entry matches nothing in the current scan — the code changed (or the entry was mistyped); update or remove it
     FAILED
     ```
     Restore: `md5sum compute-kpis.js` → `668ca89d406fe989ff5fac52d70fcaef`
     (matches baseline, byte-identical). Re-run: **green**, 11/11 assertions.

All four sub-rules were neutered **separately**, each restored to a
byte-identical file before the next mutation began, with the full suite
re-confirmed green after every restore.

### Verification run (this session, post-widening)

Verbatim (or summarized where noted) results, run after all fix-pass edits
and after every mutation above was restored:

- `node test_rail_predicate_derivation.js` — **green**, 11/11 assertions
  (population: 207 files; comparison sites: 32; assignment sites: 18
  non-canonical + 4 canonical excluded; allowlist entries: 48).
- `node test_pools_snapshot.js` — **green**, 9/9 assertions.
- `node test_spotlight.js` — **green**, 60/60 assertions.
- `node test_sitemap_xml.js` — **green**, 17/17 (`✅ 17 passed, 0 failed`).
- `node test_sitemap_filter_urls.js` — **green**, 11/11 (`✅ 11 passed, 0
  failed`).
- `node test_token_pages.js` — **green**, 109/109 assertions (proves the
  `generate-token-pages.js` `APY_SANITY_LIMIT` derivation, deviation 3
  above, is safe).
- `node test_chain_pages.js` — **green**, 100/100 assertions (its own
  scratch-copy of `generate-token-pages.js`, via `rewriteRequiresToAbsolute`,
  correctly carries the new `require('./trust-rails.js')` through).
- `node test_markdown_twins.js` — **green**, 16/16 assertions (same
  scratch-copy path, confirmed independently).
- `node test_smoke.js` — **green**, 13/13 assertions (both router paths
  intact: bare `/` → landing/planner, `/?token=USDC` → analytics app with
  pool cards; `home.html`/`plan.html` untouched by this widening).
- `node test_test_registry.js` — **green**, 5/5 assertions.
- `node test_webmcp_rail_derivation.js` — **green**, 10/10 tests (Leg D
  unaffected — this widening never touched `home.html`).
- `node run-tests.js --lane=plain --timeout=120` — completed within the
  timebox: **63 files selected, pass=61, fail=2, timeout=0** — the SAME two
  pre-existing, unrelated failures already documented in this file's earlier
  "Verification run" section: `test_translations_number_format.js` and
  `test_vercelignore.js`. Neither touches `translations.js`'s formatter
  logic or `.vercelignore`'s tracked-file list, and this widening's `git
  diff --stat` (`generate-pools-snapshot.js`, `generate-sitemap.js`,
  `generate-spotlight.js`, `generate-token-pages.js`,
  `test_rail_predicate_derivation.js` — 5 files, 341 insertions, 40
  deletions) touches neither file, confirming these two failures are
  pre-existing and unrelated, not proof-by-assumption.

### Residue NOT fixed here

- **Every genuine unlinked mirror listed in the "beyond the operator's
  table" rows above** (`PoolDetail.js`, `compute-kpis.js`,
  `generate-spotlight.js`, `generate-stories.js`, `planner.js`,
  `test_kpi_rail_history.js`) — real, honestly-labeled residue, out of this
  bounded widening's fix scope. A future item could derive each from
  `trust-rails.js` (all are Node-reachable except `planner.js`, which is
  core browser code requiring the same care Leg A/D took with `home.html`).
- **The four `test_*.js` mirrors the task itself named** (`test_chain_
  pages.js`, `test_markdown_twins.js`, `test_token_pages.js`,
  `test_seo_cta_targets.js`) — unlinked test-fixture mirrors of a
  generator's own threshold, per the task's own instruction ("residue, not
  fixed here").
- **The PROSE stratum — stale "$10M" rail claims in `*.js` comments.**
  Item 261's prose guard (`test_agent_surface_rail_claims.js`) scans only
  `.md`/`.json`/`.txt`; root `*.js` comments are an uncovered population.
  Measured directly in this checkout (methodology: grep root, non-generated
  `*.js` files for comment lines matching `DEFAULT_MIN_TVL ($10M)`-shaped
  claims, `app.js:729`/`app.js:730`/`729-730` stale line citations, or
  `"$10M floor"`/`"$10M default floor"` phrasing — EXCLUDING lines that
  narrate the historical migration correctly, e.g. trust-rails.js's own
  "`DEFAULT_MIN_TVL` moved from $10M to $100K", and excluding lines about a
  genuinely different, deliberately-$10M-or-higher threshold verified by
  reading context, e.g. `planner.js:3988`'s "the planner's floors are all
  >= $10M" — true, since `PERSONAS.stable/rwa/degen` all curate at $10M or
  above, a persona-curation floor layered ON TOP of `DEFAULT_MIN_TVL`, not a
  restatement of it; and TWO of `generate-sitemap.js`'s three `$10M`
  mentions (verifier round 1 correction: this sentence originally excused
  all three, which was wrong — see "Verifier round 1" section below).
  `generate-sitemap.js:86` ("chain=All rung gate below, which needs to
  evaluate at $1M/$10M/$100M floors") and the post-fix-shifted line
  formerly at `:664` ("The $10M rung normalises to `?chain=All`") describe
  the unrelated `chain=All` multi-tier rung-selection FEATURE, not
  `DEFAULT_MIN_TVL`, and were correctly left alone. The THIRD mention, at
  the line that was `:85` at the time of this census ("all called with the
  implicit $10M default"), was NOT a feature mention — it was sitting
  directly on `isQualifyingPool`'s own `SITEMAP_MIN_TVL` default-parameter
  comment and DID restate the stale $10M rail value; it is now fixed
  (verifier round 1, finding 1) to read "implicit SITEMAP_MIN_TVL/
  DEFAULT_MIN_TVL default". Because the census below wrongly excused ALL
  THREE of `generate-sitemap.js`'s mentions when it was originally built,
  `generate-sitemap.js` was never added to the 38-file list below even
  though it DID carry one real stale claim at the time — the file-count
  below is a pre-existing undercount by (at least) this one file, inherited
  from the same mis-classification this correction fixes. Not recomputed
  here (the census is already flagged below as approximate, for a future
  item to re-verify); `generate-sitemap.js` itself needs no addition to the
  list now regardless, since its one real stale claim is fixed as of this
  round):

  **38 `*.js` files** (root-level, generated `*.compiled.js`/`*.compiled.
  min.js`/`*.min.js` twins excluded, consistent with Leg C's own population
  convention) carry at least one stale "$10M" rail-floor claim in a
  comment and/or cite the stale `app.js:729`/`:730` line numbers. This
  count includes `app.js` itself (5 stale-comment sites: lines 1090, 1254,
  1259, 1272, 2551 — the CODE at `app.js:800-801` is correct and canonical;
  only its OWN prose comments elsewhere in the file are stale) and all four
  of the files this widening's step 2/3 already touched for their
  ASSIGNMENT sites (`generate-pools-snapshot.js`, `generate-spotlight.js`,
  `generate-token-pages.js`, `generate-pool-pages.js` — fixing the
  assignment did not fix every nearby comment; only the specific header
  paragraphs this widening's task named were rewritten). Full file list:
  `PoolDetail.js`, `app.js`, `audit-app.js`, `generate-pool-pages.js`,
  `generate-pools-snapshot.js`, `generate-spotlight.js`,
  `generate-token-pages.js`, `test_audit_text_surfaces.js`,
  `test_card_numeral_wrap.js`, `test_dead_pool.js`, `test_default_sort.js`,
  `test_kpi_history_unavailable.js`, `test_kpi_momentum.js`,
  `test_kpi_seo_enrichment.js`, `test_kpi_sharpe_annotation.js`,
  `test_kpi_sharpe_sort.js`, `test_kpi_track_record.js`,
  `test_kpi_tvl_trend.js`, `test_list_polish.js`,
  `test_llms_link_integrity.js`, `test_mean30d_sanity.js`,
  `test_minttvl_clean_url.js`, `test_mobile_controls_reachable.js`,
  `test_poller.js`, `test_pool_artifact_paint.js`,
  `test_pool_detail_anomaly_projection.js`, `test_pools_snapshot.js`,
  `test_rate_volatility.js`, `test_results_count_render.js`,
  `test_search.js`, `test_seo_app_link_attribution.js`,
  `test_seo_cta_render.js`, `test_seo_cta_targets.js`, `test_spotlight.js`,
  `test_spotlight_attribution.js`, `test_token_chain_all.js`,
  `test_token_vault_match.js`, `test_zero_yield_demote.js`. This count is a
  grep-and-context-check census, not a per-line hand audit of every match
  against every possible false positive — a future item scoping the prose
  fix should re-verify each file rather than trust this count as
  definitive, but it is measured from this checkout, not guessed. **Not
  fixed here** — a separate item, per the outer task's explicit instruction.
- **Rail SEMANTICS remain machine-unchecked outside `home.html`** —
  unchanged from Leg C's original build; this widening only closes the
  bare-assignment coverage gap, not the "railing the wrong quantity" gap
  (limitation (b), still open, still by design — see the file's header
  comment).
- **Follow-up comment fix (2026-08-11):** `generate-token-pages.js`'s
  `MIN_POOL_TVL` header comment (~lines 57-62) was corrected — it no longer
  claims a stale $10M `DEFAULT_MIN_TVL` or cites the stale `app.js:730` line
  number, and now states that `MIN_POOL_TVL` and `DEFAULT_MIN_TVL` coincide
  in value today even though they remain separately-decided policies. The
  broader 38-file stale-"$10M"-in-JS-comments census above remains unfixed
  and unticketed.

## Verifier round 1 — FAIL, and the fixes

Three findings, all fixed in this session (attempt 2/3). Covered in order below,
each with what changed, proof, and re-measured numbers.

### Finding 1 — stale `$10M` rail claims survived in the very files this diff rewired, including one at RUNTIME

All named sites fixed, plus two more found in `generate-token-pages.js` while
re-grepping (that file is also "a file this item already edits" — Leg E fixed
its `APY_SANITY_LIMIT` declaration — so its stale comments are in scope too):

- `generate-pools-snapshot.js:80` — `isRailedIn`'s doc comment now says "The
  rail: DEFAULT_MIN_TVL floor applied upstream" (was "$10M TVL floor").
- `generate-pools-snapshot.js:308` (comment near the `--seo-out` transient) —
  now says "feeds the committed DEFAULT_MIN_TVL-floored snapshot" (was "the
  committed $10M snapshot").
- `generate-spotlight.js:18` (TRUST PRINCIPLE header) — no longer says
  `DEFAULT_MIN_TVL` here is "the APP's $10M plan-entry floor (app.js:730 /
  planner.js)"; now names it as the app's own plan-entry floor (trust-rails.js,
  mirroring app.js's canonical constant) and explains the relationship to
  `generate-token-pages.js`'s `MIN_POOL_TVL` without hand-typing a figure.
- `generate-spotlight.js:397` (persona-classification comment, "Mirroring
  minTvl too... than just this script's `$10M` qualifying floor") — now reads
  "DEFAULT_MIN_TVL qualifying floor".
- `generate-spotlight.js:173` — **the runtime fix.** `pickPool`'s
  `SpotlightError` message for a `--pool` that fails the TVL floor used to
  hand-type `` `...is below the $10M floor` ``. `formatTvlFloor` is now
  imported alongside `DEFAULT_MIN_TVL` (`const { DEFAULT_MIN_TVL,
  formatTvlFloor } = require('./trust-rails.js');`) and the message now reads
  `` `...is below the ${formatTvlFloor(DEFAULT_MIN_TVL)} floor` `` — derived,
  same as the line immediately above it already derives its own APY figure via
  `formatApy(poolTotalApy(pool))`. `node test_spotlight.js` stayed green
  (60/60) after this change.
- `generate-sitemap.js:85` (comment above `isQualifyingPool`, "all called with
  the implicit `$10M` default") — corrected to "implicit SITEMAP_MIN_TVL/
  DEFAULT_MIN_TVL default". `generate-sitemap.js:86` (now shifted by one line)
  and the line at what was `:664` are UNCHANGED — both describe the `chain=All`
  multi-tier rung-selection FEATURE (a genuinely different, intentional
  $1M/$10M/$100M ladder), not `DEFAULT_MIN_TVL`, exactly as spec 266's own
  Evidence table already distinguished. The corresponding sentence in this
  file (the "PROSE stratum" bullet under "Residue NOT fixed here") wrongly
  excused all three as the feature mention; corrected in place above (search
  "TWO of `generate-sitemap.js`'s three").
- `generate-token-pages.js:54` — "APY_SANITY_LIMIT is a TRUST RAIL (mirrors
  `app.js:729` / planner.js)" corrected to name `trust-rails.js` as the
  derivation path, no stale line-number citation.
- `generate-token-pages.js:913` (comment in `rateBehaviourFor`'s doc block) —
  "the committed `data/pools-snapshot.json` (the app's `$10M` snapshot)"
  corrected to "the app's DEFAULT_MIN_TVL-floored snapshot".

Verified with a final grep of all four files for `\$10M|app\.js:729|app\.js:730`:
only the two legitimate `generate-sitemap.js` chain=All-rung mentions remain
(lines 87 and 665, post-edit). `generate-pools-snapshot.js`,
`generate-spotlight.js`, `generate-token-pages.js` are now completely clean.
`node test_pools_snapshot.js` (9/9), `node test_spotlight.js` (60/60),
`node test_sitemap_xml.js` (17/17), `node test_token_pages.js` (109/109) all
stayed green after these edits.

### Finding 2 — the detector was keyed on the two known instances' punctuation, not the mechanism

`test_rail_predicate_derivation.js` widened on four fronts:

1. **`NUM_RE`** now recognises hex (`0x1a4`), exponent (`1e5`/`1E5`/`1e+5`),
   underscore separators (`100_000`), and leading-dot decimals (`.5`), in
   addition to plain decimals — alternation-ordered so hex is tried before the
   plain-decimal branch would truncate it at the leading `0`.
2. **The comparison detector (`findSites`)** no longer scans line-by-line. It
   now comment/string-strips the WHOLE file, replaces every newline with a
   single space (1:1, so every other character's offset is unchanged), and
   runs ONE global regex pass over the flattened text — a condition wrapped
   across two (or more) source lines is now caught in the same pass as a
   same-line one, with no separate windowing pass and no risk of double-
   reporting. Line numbers are recovered via binary search over the original
   newline offsets (`lineForOffset`).
3. **The assignment detector (`findAssignmentSites`)**'s terminator changed
   from a hard-coded trailing `\s*;` to a lookahead `(?=[;,}]|\s*$)` — a
   declaration is now recognised whether it ends in `;`, a comma (first
   declarator of a multi-declarator statement), a closing `}`, or nothing at
   all (ASI/newline-terminated).
4. **Two brand-new detectors**, both scanning the SAME globbed population
   (`src/*.js` now included — see finding 3b):
   - `findObjectPropertySites` — `IDENT: LITERAL` inside an object literal
     (`{ DEFAULT_MIN_TVL: 100000 }`).
   - `findPlainAssignmentSites` — `x.IDENT = LITERAL` / bare `IDENT = LITERAL`
     with NO `const|let|var` keyword (`o.APY_SANITY_LIMIT = 1000;`), skipping
     any match whose LHS is actually a real declaration (to avoid
     double-reporting the same site under two allowlist keys).

**Scope decision, disclosed:** both new detectors restrict their identifier to
`SCREAMING_SNAKE_CASE` (`^[A-Z][A-Z0-9_]*$`), not the general
tvl/apy-containing pattern the comparison detector uses. A first, unrestricted
cut of `findObjectPropertySites` found not one rail copy — it found every
ordinary pool/KPI fixture object literal in the test suite
(`{ tvlUsd: 500000, apyBase: 9, apyMean30d: ... }`, by the hundreds), because
a pool's own DefiLlama field names legitimately contain "tvl"/"apy" and are
written in camelCase/snake_case. Every real rail name already in this file's
ALLOWLIST (`DEFAULT_MIN_TVL`, `APY_SANITY_LIMIT`, `RISK_FREE_APY`, `BANK_APY`,
`MIN_POOL_TVL`, `POOL_ARTIFACT_MIN_TVL`, `APY_SANITY_LIMIT_LOCAL`,
`APP_DEFAULT_MIN_TVL`) is SCREAMING_SNAKE_CASE with zero exceptions, and the
attack's own example (`DEFAULT_MIN_TVL: 100000` / `o.APY_SANITY_LIMIT = 1000`)
is too — so this is the weakest predicate consistent with the evidence, per
the task's own instruction, not an arbitrary narrowing.

**Constraint check — no allowlisted site was dropped, only added/kept:** the
widening surfaced exactly one new REAL site in the live codebase:
`generate-llms.js`'s `tvl > 1e9` (×4 identical occurrences, one key) — a
billions-vs-millions DISPLAY FORMAT cutoff, newly visible only because the
widened `NUM_RE` now recognises exponent literals. Classified and allowlisted
with an honest reason. Every one of the pre-existing 48 allowlist entries
still matches (`allowlist entries: 49` after adding this one — 48 unchanged +
1 new). Nothing was re-keyed.

**Population, before/after:** 207 files → 209 (src/poller-core.js,
src/poller.js added, finding 3b). Comparison sites: 32 → 36 (+4:
`generate-llms.js`'s exponent-form sites, newly visible). Assignment sites:
18 non-canonical (unchanged — no new real assignment-shaped sites; the
terminator widening changed WHAT the regex could match, not what's actually
in the repo today). Object-property / plain-assignment sites: 0 real (both
detectors proven correct via synthetic fixtures below, not via a real hit —
there are none in this codebase today).

#### The five attacks, re-run live in `compute-kpis.js`, red output quoted, byte-identical restore proven

Baseline (recorded before any attack): `md5sum compute-kpis.js` →
`668ca89d406fe989ff5fac52d70fcaef`. Each attack applied as a standalone
addition near `RISK_FREE_APY`/`APY_SANITY_LIMIT` (line ~62), test re-run,
reverted, hash re-checked, test re-run green — one at a time, never combined.

**Attack 1 — `if (p.tvlUsd < 1e5) return false;` (exponent form):**
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    compute-kpis.js:64: unclassified pool-threshold literal comparison "p.tvlUsd < 1e5" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restore: `md5sum compute-kpis.js` → `668ca89d406fe989ff5fac52d70fcaef` (byte-identical). Re-run: green, 17/17.

**Attack 2 — comparison wrapped across two lines:**
```js
function __attack2(p) {
  if (p.tvlUsd <
      100000) return false;
  return true;
}
```
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    compute-kpis.js:65: unclassified pool-threshold literal comparison "p.tvlUsd < 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restore: `md5sum compute-kpis.js` → `668ca89d406fe989ff5fac52d70fcaef` (byte-identical). Re-run: green, 17/17.

**Attack 3 — `const ATTACK_DEFAULT_MIN_TVL = 100000` with no trailing `;` (ASI):**
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    compute-kpis.js:64: unclassified pool-threshold literal assignment "const ATTACK_DEFAULT_MIN_TVL = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restore: `md5sum compute-kpis.js` → `668ca89d406fe989ff5fac52d70fcaef` (byte-identical). Re-run: green, 17/17.

**Attack 4 — `const ATTACK_RAILS = { DEFAULT_MIN_TVL: 100000, APY_SANITY_LIMIT: 1000 };` (object-property form):**
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    compute-kpis.js:64: unclassified pool-threshold literal comparison "DEFAULT_MIN_TVL: 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
compute-kpis.js:64: unclassified pool-threshold literal comparison "APY_SANITY_LIMIT: 1000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
(Both properties flagged, not just one.) Restore: `md5sum compute-kpis.js` → `668ca89d406fe989ff5fac52d70fcaef` (byte-identical). Re-run: green, 17/17.

**Attack 5 — `o.APY_SANITY_LIMIT = 1000;` (assignment, no declaration keyword):**
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    compute-kpis.js:65: unclassified pool-threshold literal assignment "o.APY_SANITY_LIMIT = 1000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restore: `md5sum compute-kpis.js` → `668ca89d406fe989ff5fac52d70fcaef` (byte-identical). Re-run: green, 17/17.

All five attacks were run **individually** (one applied, tested, reverted, and
re-verified green before the next began) — never combined — and
`node test_compute_kpis.js` (the file's own real test suite) stayed green
(28/28) throughout, confirming the attack-and-revert cycle never actually
mutated the file's real behaviour. Every existing non-vacuity sub-rule from
the original widening (bare assignment added → red; allowlist entry deleted →
red; fabricated allowlist entry → red; comment-stripping proof) remains green
in the current suite (see "Complete non-vacuity log" above, still valid — none
of those mechanisms changed, only the regexes they exercise got wider).

Self-pollution note: every synthetic test fixture added for these five attacks
(both the standing unit tests now in the file, and the ones used against
`compute-kpis.js` above) builds its rail-shaped identifier via string
concatenation (`'FAKE' + '_MIN_TVL'`), never as one contiguous token — required
because the two new detectors (object-property, plain-assignment) do NOT
blank string text, unlike the comparison detector, so a bare identifier
written as ordinary fixture text in this file's own raw source would
self-pollute the very self-checks these tests exist alongside. This was
caught live while building the widening (several of the file's OWN fixture
strings tripped its own new detectors on the first run) and fixed the same way
the original assignment-detector widening handled it for its own fixtures.

### Finding 3 — wrong residue numbers, and an unnamed population member with two hand-typed rail copies

**(a) Re-measured literal-`0` exclusion.** Using the CURRENT (widened)
detector and population, dropping the `!== 0` filter raises the comparison-
site count from **36 to 96** — i.e. **60 sites are excluded as literal-`0`
comparisons** (a small script duplicating the exact `findSites` logic with
the zero-filter toggled was used to measure this; see the "measure_zero.js"
methodology below). This matches `product-loop-kit/specs/266.md`'s own
already-corrected figure ("measured, it is **60**") — the operator appears to
have already applied this correction to `specs/266.md` (line 255) in the same
round. `test_rail_predicate_derivation.js`'s header comment is corrected in
place (search "MEASURED (verifier round 1, finding 3a") to state 36/96/60
instead of the stale "~32 to ~70+"/"roughly 40". **`specs/266-pr.md`:102 still
says "~40 sites"** — per this task's own DO-NOT list ("edit
BACKLOG.md/LOG.md/specs/266.md/specs/266-pr.md — the operator owns those
three"), this file was NOT touched; flagging here so the operator can apply
the same **60** figure there.

Measurement methodology (reproducible): the exact `stripCommentsAndStrings`/
`IDENT_RE`/`NUM_RE`/`OPS` logic from the live detector, run twice over the
same globbed population — once with the zero-literal filter applied (36,
matches the live test's own count) and once without it (96) — confirms the
60-site delta directly rather than trusting a hand count.

**(b) `src/poller-core.js` — brought into the scanned population, fixed to derive both rails.**
`JS_GLOB_PATTERNS` now includes `'src/*.js'`; `src` was removed from the
"excluded roots" list (both the header's EXCLUDED table and the population
test's `excludedRoots` array — `src/` moved from EXCLUDED-by-role to
INCLUDED, with the header rewritten to say why). `src/poller-core.js`:
- `:18-19`'s bare `const APY_SANITY_LIMIT = 1000; const DEFAULT_MIN_TVL =
  100000;` replaced with `const { APY_SANITY_LIMIT, DEFAULT_MIN_TVL } =
  require('../trust-rails.js');` — `module.exports` (line 59+) and every
  exported constant NAME are byte-identical to before, satisfying the "keep
  `src/poller.js`'s (ESM Worker) interop working" constraint.
- `:11` ("$10M TVL floor applied at write time") → "DEFAULT_MIN_TVL floor
  applied at write time".
- `:7-8` ("mirrored VERBATIM from generate-pools-snapshot.js:51-52 (themselves
  mirrored from app.js:729-730)") → rewritten to say "derived from
  trust-rails.js (itself mirroring app.js's own canonical constants,
  app.js:800-801)", no stale line-number chain.
- `:48` (`// $10M floor — the ONLY drop`) → `// DEFAULT_MIN_TVL floor — the
  ONLY drop`. The doc-comment above `railedRows` ("Drops pools below the $10M
  TVL floor") also corrected to "DEFAULT_MIN_TVL floor".

Bringing `src/*.js` into the population surfaced **zero** further sites —
`src/poller-core.js` and `src/poller.js` both contribute zero sites across
all four detectors (comparison/assignment/object-property/plain-assignment),
confirmed by two new dedicated assertions (`verifier round 1, finding 3b:
src/ is now IN the population...` and `...src/poller-core.js contributes
ZERO assignment/object-property/plain-assignment sites...`). No new allowlist
entries were needed for `src/`.

`node test_poller.js` — **21/21 assertions passed**, verbatim:
```
test_poller.js: 21/21 assertions passed
```
Also ran `test_audit_pool_prescan.js` (the only other test that actually
`require()`s `src/poller-core.js`, confirmed by grep — `test_agent_log.js`
only mentions it in a comment, and `test_vercelignore.js` only lists its path
string in a must-keep array): **19 passed, 0 failed**.

### Also (Leg E's fourth generator)

`generate-token-pages.js`'s `APY_SANITY_LIMIT` derivation (the fourth
generator Leg E touched, beyond the three named in spec 266's Change section)
was already recorded clearly in this file's "Full classified table" (row
`generate-token-pages.js | const APY_SANITY_LIMIT = 1000 | FIXED (task's
conditional instruction)`) and in "Deviations from a literal reading of the
task, disclosed" item 3, from the original build. Untouched by this round
beyond the two additional stale-comment fixes at `:54`/`:913` (Finding 1
above) — the derivation itself was already correct and is not reverted.

## Corrected generate-sitemap.js census sentence (finding 1)

The sentence in the "PROSE stratum" residue bullet that read "and
`generate-sitemap.js`'s `$1M/$10M/$100M` mentions, which describe the
unrelated `chain=All` multi-tier rung-selection feature, not
`DEFAULT_MIN_TVL`" wrongly excused ALL THREE of that file's `$10M` mentions.
Only TWO are the legitimate chain=All-rung feature (`:86` and the
post-fix-shifted line formerly at `:664`); the THIRD (formerly `:85`) sat
directly on `isQualifyingPool`'s own `SITEMAP_MIN_TVL` default-parameter
comment and DID restate the stale rail value — it is the site fixed under
Finding 1 above. Corrected in place (search "TWO of `generate-sitemap.js`'s
three `$10M` mentions").

## Verification (this round)

```
node test_rail_predicate_derivation.js  → 19/19 assertions passed (population: 209 files; comparison sites: 36; assignment sites: 18 (+4 canonical, excluded); allowlist entries: 49)
node test_webmcp_rail_derivation.js     → 10/10 tests passed
node test_pools_snapshot.js             → 9/9 assertions passed
node test_spotlight.js                  → 60/60 assertions passed
node test_sitemap_xml.js                → 17/17 passed
node test_sitemap_filter_urls.js        → 11/11 passed
node test_token_pages.js                → 109/109 assertions passed
node test_chain_pages.js                → 100/100 assertions passed
node test_markdown_twins.js             → 16/16 assertions passed
node test_poller.js                     → 21/21 assertions passed
node test_smoke.js                      → 13/13 smoke assertions passed (both router paths intact: bare / → landing, /plan.html → planner, /?token=USDC → analytics app with pool cards)
node test_test_registry.js              → 5/5 assertions passed

timeout 280 node run-tests.js --lane=plain --timeout=110
  → 63 files selected, pass=61, fail=2, timeout=0
  → the ONLY 2 failures: test_translations_number_format.js, test_vercelignore.js
    (both pre-existing and unrelated — confirmed by running test_vercelignore.js
    standalone: it fails on `ko/tokens/0x0.html`/`.md` not being tracked by git in
    this sandbox, a generated-SEO-asset-completeness issue, not a rail defect;
    neither failure references trust-rails.js, src/poller-core.js, or any of the
    four generator files touched by this round's fixes)
```

## Verifier round 2 — FAIL, and the fixes

Five findings, attempt 3/3 (no round 4). All five addressed in this session.
Only file touched permanently: `test_rail_predicate_derivation.js`. `home.html`
and `src/poller-core.js` were mutated only transiently for live attack proofs
and restored byte-identically (proven below) — neither carries a permanent
change. `app.js`, `trust-rails.js`, `planner.js` were never touched at all
(md5 unchanged from session start — see "Final md5 sanity" below).

### FIX 1 — the three newer detectors were still LINE-based

`findAssignmentSites`, `findObjectPropertySites`, `findPlainAssignmentSites`
all did `stripped.split('\n')` + a per-line regex loop — the exact mechanism
round 1's own finding 2 had already proven escapable for the comparison
detector (`findSites`), left unfixed in these three. Fixed the same way
`findSites` was fixed in round 1: scan the whole comment-stripped file as ONE
string (newlines preserved this time, not flattened to spaces — `\s` already
matches `\n`, so every `\s*` gap in these patterns already spans line breaks
once the per-line split is removed), add the `m` (multiline) flag to each
detector's regex so `TERMINATOR_LOOKAHEAD`'s `\s*$` branch (the ASI case)
still means "end of THIS line", not "end of the whole file", and recover
1-indexed line numbers via `lineForOffset` over that file's own newline
offsets — identical machinery to `findSites`'s own round-1 fix.

Two permanent regression tests added (`assignment detector catches a
declaration whose \`=\` and LITERAL are split across two lines (verifier
round 2, attack n1)`, `object-property detector catches a \`KEY:\`/LITERAL
pair split across three lines... (attack n2)`), both green on synthetic
fixtures. Then both attacks were planted LIVE in `src/poller-core.js`,
proven red, and restored byte-identically:

```
baseline: md5sum src/poller-core.js → 904c8480619a8c88e024feee8bcbeb2e
```

**n1 — `const ATTACK_WRAPPED_MIN_TVL =` / newline / `  100000;`** appended
after `retentionCutoff`. RED, quoted:
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:67: unclassified pool-threshold literal assignment "const ATTACK_WRAPPED_MIN_TVL = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restore: `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e`
(byte-identical). Re-run: **green**, 19/19 (this file's assertion count before
FIX 2/3's additional tests were added — see final counts below).

**n2 — `const __R2 = {` / newline / `  DEFAULT_MIN_TVL:` / newline /
`    100000` / newline / `};`** appended after `retentionCutoff`. RED, quoted:
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:68: unclassified pool-threshold literal comparison "DEFAULT_MIN_TVL: 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restore: `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e`
(byte-identical). Re-run: **green**.

Both attacks were applied, tested, and reverted **one at a time**, never
combined.

### FIX 2 — `findPlainAssignmentSites`'s SCREAMING_SNAKE restriction relaxed

Relaxed the key predicate from `^[A-Z][A-Z0-9_]*$` (`CONST_CASE_RE`) to the
general identifier grammar (`DECL_IDENT_RE`) filtered by the SAME
case-insensitive `/tvl|apy/i` substring test every other detector in this
file already uses — no longer a special case for this one detector.

**Re-measured cost — CORRECTING the task's own "exactly 2" estimate, not
just repeating it**: relaxing this ONE detector's key predicate surfaces
**4 additional sites**, not 2:
- `test_audit_app.js:172` and `test_audit_number_boundary.js:176`, both
  `target.apyReward = 1` — the two the task named, both fixture mutations
  forcing PoolDetail.js's shared `apyBase>0 && apyReward>0` render gate true.
- **2 MORE, found by actually running the relaxed detector rather than
  trusting the estimate as final**: `test_audit_text_surfaces.js:398`
  (`minApy = 10`) and `test_seo_app_link_attribution.js:315`/`:331`
  (`minTvl = 100000`, one key, two lines) — both a genuinely different
  false-positive shape: a URL QUERY-STRING fragment (`?...&minApy=10`,
  `?...&minTvl=100000`) sitting inside an ordinary string/template-literal
  argument (an assertion message / a real navigated-to test URL). This
  detector deliberately does not strip string text (same tradeoff
  `findAssignmentSites` documents, needed to catch rail declarations hidden
  inside scratch-patch string markers), so a query-string `key=value`
  fragment reads identically to a JS assignment once the key predicate is
  relaxed enough to match lowercase identifiers. All 4 classified honestly in
  the ALLOWLIST (see "PLAIN-ASSIGNMENT-SHAPED entries" in the test file).

(Self-pollution caught live while writing the two query-string allowlist
reasons: an early draft's own prose for the `test_seo_app_link_attribution.js`
entry spelled the query-string fragment contiguously and tripped the very
detector it was describing, in this file's own source. Fixed by rephrasing
the reason to describe the value without reproducing an `IDENT = NUM`-shaped
token contiguously — the same self-pollution discipline this file's earlier
widenings already established for allowlist-reason prose and synthetic test
fixtures.)

Permanent regression test added (`plain-assignment detector now catches a
LOWERCASE/camelCase rail-shaped assignment (verifier round 2, FIX 2, attack
n5)...`), green on a synthetic fixture. Then attack n5 was planted LIVE in
`src/poller-core.js` and proven red/restored:

```
baseline: md5sum src/poller-core.js → 904c8480619a8c88e024feee8bcbeb2e
```

**n5 — `const __o2 = {}; __o2.defaultMinTvl = 100000;`** (lowercase camelCase
— would have been invisible under the old `^[A-Z][A-Z0-9_]*$` restriction)
appended after `retentionCutoff`. RED, quoted:
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:68: unclassified pool-threshold literal assignment "__o2.defaultMinTvl = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restore: `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e`
(byte-identical). Re-run: **green**.

### FIX 3 — the object-property detector's SCREAMING_SNAKE restriction, KEPT, and the drifted mirror it hides

Re-measured the cost of fully relaxing `findObjectPropertySites`'s key
predicate (matching ANY tvl/apy-containing property name, exactly like the
comparison/assignment detectors): **1040 hits**, **107 after excluding
DefiLlama's own field names** (`tvlUsd`, `apyBase`, `apyReward`,
`apyMean30d`, `apyPct1D/7D/30D`, `apyBase7d`, etc.) — too large to classify
honestly on this final attempt. **Kept** the restriction (`^[A-Z][A-Z0-9_]*$`
on `findObjectPropertySites` only — `findAssignmentSites` never had one,
`findPlainAssignmentSites` no longer does after FIX 2).

**The divergence, verified directly, both sides (chose Option 1 — the
pinned-test option; feasible well inside the ~20-minute fallback budget):**

| band | `generate-spotlight.js:419-421` `PERSONA_BANDS.<band>.minTvl` | `planner.js:560-575` `PERSONAS.<band>.minTvl` | divergence |
|---|---|---|---|
| `stable` (spotlight :419, planner :561-562) | `50000000` | `50000000` | agree |
| `rwa` (spotlight :420, planner :566-567) | `100000` | `10000000` | **100x** |
| `degen` (spotlight :421, planner :571-572) | `100000` | `10000000` | **100x** |

`generate-spotlight.js`'s own comment (lines 396-405) states `PERSONA_BANDS`
is meant to mirror `planner.js`'s `PERSONAS` bands so the persona this script
assigns a pool is one the live planner would actually accept for that exact
pool — "otherwise a pack could tag a $12M-TVL stablecoin pool 'stable' and
the real curatePools would reject it." Two of the three bands have already
drifted from that stated intent by exactly 100x. **Not fixed** — which value
is correct (spotlight's $100K, meaning planner.js's own $10M rwa/degen floor
should have been mirrored; or planner's $10M, meaning generate-spotlight.js
should be raised) is a product decision, out of this item's scope. No
`PERSONA_BANDS`/`PERSONAS` value touched.

**Permanent pin added** — `test_rail_predicate_derivation.js`, test named
`FIX 3 pin (verifier round 2, finding 3): generate-spotlight.js
PERSONA_BANDS.minTvl vs planner.js PERSONAS.minTvl — a RECORDED KNOWN
DIVERGENCE...`. It:
1. reads both files' CURRENT source at test time and extracts each band's
   `minTvl` via a small brace-depth walk + per-band regex (not a hand-typed
   copy disconnected from the live files);
2. asserts the extracted values equal this exact recorded snapshot
   (`{stable:50000000, rwa:100000, degen:100000}` / `{stable:50000000,
   rwa:10000000, degen:10000000}`) — so if EITHER file's actual values move
   even slightly, this assertion fails and forces an update to both the test
   and this note;
3. separately asserts the CHARACTER of the divergence (`stable` agrees;
   `rwa`/`degen` differ by exactly 100x) — so if the mirror is ever fixed
   (values become equal) or the ratio changes to something else, this also
   fails loudly rather than silently staying green.
The test is GREEN today (documents, does not fail the suite) — proven
non-vacuous by a standalone sanity check (synthetic content, no repo file
touched) confirming the same assertion logic correctly turns RED if `rwa`'s
values were hypothetically equal:
```
extracted: { stable: 50000000, rwa: 100000, degen: 10000000 }
would pin test fail on this synthetic (rwa now matches spotlight 100000)? YES - notStrictEqual would throw, pin correctly goes RED
```

Also recorded in the test file's own header (`PROP_RE`'s "SCOPE NOTE") and in
the "EXCLUDED, BY ROLE" population table is not applicable here — this is a
DETECTOR limitation, not a population exclusion; the residue is recorded
directly beside `PROP_RE`'s own comment and via this note.

### FIX 4 — false/stale claims corrected

`PROP_RE`'s "SCOPE NOTE" used to justify the (then-shared) SCREAMING_SNAKE
restriction with: "every real rail name in this file's existing ALLOWLIST
already has [SCREAMING_SNAKE_CASE]... zero exceptions." **False as written**
— the allowlist has always contained two lowercase ASSIGNMENT-shaped entries,
`home.html|var apy = 5.5` (~:1247 post-edit) and `test_planner.js|var apy =
5.3` (~:1251 post-edit), both findAssignmentSites entries (which never
carried a case restriction at all — it only ever claimed the restriction was
needed for `PROP_RE`/`PLAIN_ASSIGN_RE`, and even that half of the claim is now
only true of `PROP_RE`, post-FIX-2). Rewritten in place (search "UNLIKE round
1's claim" in the test file) to state the true justification: the restriction
now applies to `findObjectPropertySites` alone, justified purely by the
measured 1040/107 fixture-explosion cost of relaxing it — never by a
naming-convention absolute.

**Current counts, re-measured this round** (added as a new "FIX 4" header
subsection in the test file, right before `'use strict'`):
- population: **209 files** (unchanged this round).
- comparison sites (`findSites`): **36** (unchanged this round — `findSites`
  was already fixed in round 1).
- zero-exclusion figure (comparison detector): dropping the `!== 0` filter
  raises 36 → 96, i.e. **60 sites excluded** (unchanged this round).
- assignment sites (`findAssignmentSites`): **18 non-canonical + 4 canonical**
  (app.js x2, trust-rails.js x2, excluded by role) — unchanged in COUNT (the
  whole-file flattening closed a coverage GAP, proven by attack n1/its
  regression test, not a count that was already wrong; no real site in this
  checkout happens to be split across a line boundary today).
- object-property sites (`findObjectPropertySites`): **0 real** (unchanged —
  the restriction is unchanged this round; proven correct only by synthetic
  fixtures, as before).
- plain-assignment sites (`findPlainAssignmentSites`): **5, across 4 files**
  — UP from 0 before FIX 2's relaxation (see FIX 2 above for the breakdown).
- allowlist entries: **53** (49 entering this round — 48 from the original
  widening + 1 `generate-llms.js` exponent entry added in round 1 — plus 4
  new PLAIN-ASSIGNMENT-SHAPED entries this round).
- final assertion count: **23/23** (`node test_rail_predicate_derivation.js`).

Per the task's DO-NOT list, `product-loop-kit/specs/266.md` and
`specs/266-pr.md` were **not edited** — the operator owns those and is fixing
their numbers in parallel; this correction lives only in the test file itself
and in this note.

### FIX 5 — role-excluded rail-shaped constant in `telegram-bot/`, named (docs only, no code change)

`telegram-bot/dist/src/utils/constants.js:111-116` declares `RISK_THRESHOLDS
= { TVL_SAFE: 100000000, TVL_MINIMUM: 10000000, APY_SUSPICIOUS: 100 }`.
**Correction to the task's own framing, verified by grep rather than taken on
faith**: it is `TVL_SAFE` (not `TVL_MINIMUM`) that is consumed as a live
filter, at `telegram-bot/dist/src/commands/earn.js:394,452` and
`zap.js:418` (`pool.tvlUsd >= RISK_THRESHOLDS.TVL_SAFE`). A repo-wide grep for
`TVL_MINIMUM` inside `telegram-bot/` finds it referenced NOWHERE else —
it appears to be declared but currently **unused** as a live filter anywhere
in this checkout. `TVL_MINIMUM: 10000000` is exactly the PRE-`6fceca79bb`
value of this repo's own `DEFAULT_MIN_TVL` (moved to $100K by that commit).

Whether this is an independent, deliberately-more-conservative bot-risk
policy, or a fossil copy of the old $10M floor that never got the memo (and
simply hasn't been wired to a live filter yet — or was already superseded by
`TVL_SAFE` without `TVL_MINIMUM` being removed) is **ambiguous and
unresolved**. `telegram-bot/` is NEVER-touched (NORTH_STAR out-of-scope:
wallet/funds code) — no code there is touched, and nothing here investigates
further. Named in the test file's own "EXCLUDED, BY ROLE" population table
(search "NAMED RESIDUE (verifier round 2, finding 5" in
`test_rail_predicate_derivation.js`) and here, per the task's instruction.

### Full attack battery, re-run at the end of this round

All round-1 attacks that do not require touching `app.js`/`trust-rails.js`/
`planner.js` were re-run live; round-2's n1/n2/n5 (concretely defined by this
round's task text) were re-run live per FIX 1/FIX 2 above. **n3/n4**: the task
text names findings 3 and 4 (PERSONA_BANDS divergence; false header claims)
as part of "round-2's n1-n5" but gives no concrete plant-and-revert attack
definition for either (unlike n1/n2/n5, which come with literal code to
plant) — these two findings are DOCUMENTATION/measurement fixes, not
literal-copy attacks with a natural red/green mutation cycle. Rather than
fabricate an attack scenario for them, they are verified directly against
FIX 3's pin test and FIX 4's corrected claims/counts above. Flagged plainly,
not silently reported as "verified" without a real attack behind it.

| # | attack | mechanism | result | restore proof |
|---|---|---|---|---|
| round-1 #1 | `if (p.tvlUsd < 100000) return false;` re-added in `home.html` | live, home.html | **RED** on Leg C (`unclassified... "p.tvlUsd < 100000"`); Leg D stayed **GREEN** (10/10) — proves Leg D alone would not catch a correct-today copy | `md5sum home.html` → `b063bd95d26ff0599730660debfd9934` both before and after |
| round-1 #2 | delete `PoolDetail.js\|pool.tvlUsd < 1000000` allowlist entry | live, test file | **RED** (`unclassified... "pool.tvlUsd < 1000000"`) | `md5sum test_rail_predicate_derivation.js` → `9bd638fa88969d9f2ab0745b924370a5` both before and after |
| round-1 #3 | add `nonexistent-file.js\|fabricatedTvl > 999999999` | live, test file | **RED** (allowlist ⊄ scan, anti-rot) | same md5, both before and after |
| round-1 #4 | `trust-rails.js`: `DEFAULT_MIN_TVL = 250000` | **NOT re-mutated this round** | **NOT re-run live** — `trust-rails.js` is on this round's explicit DO-NOT-touch list; confirmed instead that `trust-rails.js`'s current md5 (`60487050645511d3dd8a21d22331316e`) is BYTE-IDENTICAL to the hash recorded when this exact attack was verified in the prior round ("Non-vacuity log", mutation 4, above) — same file state, so that prior quoted red/stayed-green/behaviour-changed proof still applies unchanged. Flagged plainly rather than silently claimed re-verified. | n/a this round (see prior round's proof above) |
| round-1 #5 | revert `home.html`'s `totalApy(p)` usage to `p.apy` | live, home.html | **RED** on Leg D (3/10 failed: both defect-3 directions + the returned-`apy` check) | `md5sum home.html` → `b063bd95d26ff0599730660debfd9934` both before and after |
| round-2 n1 | `const ATTACK_WRAPPED_MIN_TVL =` / newline / `100000;` | live, `src/poller-core.js` | **RED** (`unclassified... assignment "const ATTACK_WRAPPED_MIN_TVL = 100000"`) | `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e` both before and after |
| round-2 n2 | `const __R2 = { DEFAULT_MIN_TVL:` / newline / `100000` / newline / `};` | live, `src/poller-core.js` | **RED** (`unclassified... comparison "DEFAULT_MIN_TVL: 100000"`) | same md5, both before and after |
| round-2 n3 | *(no concrete attack given this round — see note above)* | — | verified via FIX 3's pin test (green, non-vacuity proven by a standalone synthetic-content sanity check) | n/a |
| round-2 n4 | *(no concrete attack given this round — see note above)* | — | verified via FIX 4's corrected claims/re-measured counts | n/a |
| round-2 n5 | `const __o2 = {}; __o2.defaultMinTvl = 100000;` | live, `src/poller-core.js` | **RED** (`unclassified... assignment "__o2.defaultMinTvl = 100000"`) | same md5, both before and after |

**Nothing escaped that was live-tested.** The only item not re-run as a live
plant-and-revert this round is round-1 #4 (trust-rails.js), for the reason
stated in the table — this is disclosed as a limitation of this round, not
claimed as a fresh verification.

### Final md5 sanity (files this round was forbidden to permanently change)

```
trust-rails.js          60487050645511d3dd8a21d22331316e  (unchanged all session)
planner.js               b0ff1a7f7c897ad9b240afdc8e271f2a  (unchanged all session — never touched)
app.js                   df8bdeb99f5aeb0396cb8ab91e3eaaa4  (unchanged all session — never touched)
home.html                b063bd95d26ff0599730660debfd9934  (mutated twice, transiently, both restored)
src/poller-core.js       904c8480619a8c88e024feee8bcbeb2e  (mutated three times, transiently, all restored)
```

### Final verification run (this session, after all fixes and all attacks reverted)

```
node test_rail_predicate_derivation.js  → 23/23 assertions (population: 209 files; comparison sites: 36; assignment sites: 18 (+4 canonical, excluded); allowlist entries: 53)
node test_webmcp_rail_derivation.js     → 10/10 tests passed
node test_spotlight.js                  → 60/60 assertions passed
node test_poller.js                     → 21/21 assertions passed
node test_pools_snapshot.js             → 9/9 assertions passed
node test_sitemap_xml.js                → 17/17 passed
node test_token_pages.js                → 109/109 assertions passed
node test_smoke.js                      → 13/13 (two runs in this sandbox hit a transient
                                            "browser.newPage: Target page, context or browser
                                            has been closed" flake under a 110s cap and were
                                            reported as timeouts; both re-runs at 180s completed
                                            cleanly at 13/13 — no file test_smoke.js exercises
                                            was left changed, so this is sandbox flakiness, not
                                            a regression from this round's fixes)
node test_test_registry.js              → 5/5 assertions passed

timeout 290 node run-tests.js --lane=plain --timeout=110
  → 63 files selected, pass=61, fail=2, timeout=0
  → the ONLY 2 failures: test_translations_number_format.js, test_vercelignore.js
    (both pre-existing and unrelated — same two as every prior round; neither
    references trust-rails.js, src/poller-core.js, home.html's WebMCP tool, or
    any file this round touched)
```

## Operator round-3 check: default-parameter shape

Only file touched permanently: `test_rail_predicate_derivation.js`.
`src/poller-core.js` was mutated only transiently, four times, for live attack
proofs, and restored byte-identically after each (proven below). No other
file was touched.

### (A) ESCAPES — fixed: a rail as a DEFAULT PARAMETER

**Diagnosis confirmed.** `findPlainAssignmentSites`'s terminator
(`TERMINATOR_LOOKAHEAD`, shared with `ASSIGN_RE`/`PROP_RE`) recognised `;`,
`,`, `}`, or end-of-line — never a bare `)`. A rail copy written as a
DEFAULT PARAMETER —

```js
function __n3(pool, minTvl = 100000) { return (pool.tvlUsd||0) >= minTvl; }
```

— is terminated by the parameter list's closing `)`, so it was invisible to
every detector in this file before this round. Live anchor named by the
task: `generate-sitemap.js:88` is literally `function isQualifyingPool(pool,
minTvl = SITEMAP_MIN_TVL)` — correct today (an identifier, not a literal),
but a hand-typed literal there instead of the constant is exactly this
escaping shape, at a real rail-enforcement point.

**Terminator change.** Rather than widen the SHARED `TERMINATOR_LOOKAHEAD`
(which `ASSIGN_RE` and `PROP_RE` also use), a new, detector-scoped constant
was added and used ONLY by `PLAIN_ASSIGN_RE`:

```js
const PLAIN_ASSIGN_TERMINATOR_LOOKAHEAD = '(?=[;,)}]|\\s*$)';
```

Kept scoped rather than shared because a `const|let|var` declaration can
never appear inside a parameter list (so `ASSIGN_RE` has no matching
real-world shape to gain from a `)` terminator), and an object-property
literal ending a call argument already terminates on the existing `}`
branch before the wrapping `)` is ever reached (`foo({ DEFAULT_MIN_TVL:
100000 })` — the `}` closes first). Widening either shared detector would
have added blast radius on two detectors two prior verifier rounds already
exhaustively re-verified, for zero additional catching power. This is the
smallest fix that closes the actual gap.

The multi-parameter case, `f(a, minTvl = 100000, b)`, needed NO new
terminator branch: the trailing `,` before the next parameter was already
one of `TERMINATOR_LOOKAHEAD`'s (and now `PLAIN_ASSIGN_TERMINATOR_LOOKAHEAD`'s)
original branches. Verified directly, both as a synthetic regression test in
the test file and as a live plant-and-revert below — this was ALREADY caught
before this round's change, confirming the diagnosis's own parenthetical
("`,` already covers the multi-parameter case").

**New sites surfaced by the widening: exactly 1.** Re-running the full scan
against the live 209-file population after the terminator change found one
new real site, `test_seo_cta_render.js:112`'s `minTvl = 100000` — NOT real
code: a `console.log` message reporting a fixture's TVL value, whose string
happens to end in a literal `)` immediately after the number (`` `...rendered
at minTvl=100000)` ``), which only the widened terminator now recognises as
a boundary. Same false-positive class as the pre-existing
`test_seo_app_link_attribution.js` entry (a value-shaped fragment sitting
inside string TEXT this detector deliberately does not strip), just
newly reachable through the `)` branch instead of `;`/`,`/`}`. Allowlisted
with an honest reason (see "PLAIN-ASSIGNMENT-SHAPED entries" /
`test_seo_cta_render.js` in the ALLOWLIST). **Every one of the 53
pre-existing allowlist entries still matches** — nothing was dropped or
re-keyed; allowlist entries: 53 → 54.

**Counts, before/after this round:** population 209 → 209 (unchanged).
Comparison sites 36 → 36 (unchanged). Assignment sites 18+4 canonical →
18+4 canonical (unchanged). Object-property sites 0 → 0 (unchanged).
Plain-assignment sites: 5 across 4 files → 6 across 5 files. Allowlist
entries: 53 → 54. Test assertion count: 23/23 → 25/25 (the two new
permanent regression tests for `__n3`/`__n3b`).

### Proofs, live in `src/poller-core.js`, md5 pairs quoted

Baseline (recorded before any mutation this round, unchanged from every
prior round): `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e`.
Each attack applied as a standalone one-line addition right before
`module.exports`, test re-run, reverted, hash re-checked, test re-run green
— one at a time, never combined.

**Attack `__n3` — `function __n3(pool, minTvl = 100000) { return
(pool.tvlUsd||0) >= minTvl; }` (single, trailing default parameter — the
actual escape, now fixed):**
```
✗ verifier round 1, finding 3b: src/poller-core.js contributes ZERO assignment/object-property/plain-assignment sites (both rails now derived from trust-rails.js)
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:66: unclassified pool-threshold literal assignment "minTvl = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
FAILED
```
`md5sum src/poller-core.js` while planted → `1c4c43d5a480bf668161fe4319331278`.
Restore: `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e`
(byte-identical to baseline). Re-run: **green**, 25/25.

**Attack `__n3b` — `function __n3b(a, minTvl = 100000, b) {}` (default
parameter in the MIDDLE of a multi-parameter list — proof that the
pre-existing `,` terminator already covered this shape, not a new catch):**
```
✗ verifier round 1, finding 3b: src/poller-core.js contributes ZERO assignment/object-property/plain-assignment sites (both rails now derived from trust-rails.js)
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:66: unclassified pool-threshold literal assignment "minTvl = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
FAILED
```
`md5sum src/poller-core.js` while planted → `3699cd805134392f6ee5f0b9e6f0351c`.
Restore: `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e`
(byte-identical to baseline). Re-run: **green**, 25/25.

**Regression re-run — round-2's n1 (`const ATTACK_WRAPPED_MIN_TVL =` /
newline / `  100000;`), confirming the terminator widening did not disturb
the assignment-detector's own wrapped-declaration catch:**
```
✗ verifier round 1, finding 3b: src/poller-core.js contributes ZERO assignment/object-property/plain-assignment sites (both rails now derived from trust-rails.js)
    src/poller-core.js must derive DEFAULT_MIN_TVL/APY_SANITY_LIMIT from trust-rails.js, not hand-declare them
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:66: unclassified pool-threshold literal assignment "const ATTACK_WRAPPED_MIN_TVL = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
FAILED
```
`md5sum src/poller-core.js` while planted → `6511b42d015a9f597b21e39f494dae23`.
Restore: `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e`
(byte-identical to baseline). Re-run: **green**, 25/25.

**Regression re-run — round-2's n5 (`const __o2 = {}; __o2.defaultMinTvl =
100000;`), confirming the terminator widening did not disturb the
plain-assignment detector's own lowercase/camelCase catch:**
```
✗ verifier round 1, finding 3b: src/poller-core.js contributes ZERO assignment/object-property/plain-assignment sites (both rails now derived from trust-rails.js)
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:66: unclassified pool-threshold literal assignment "__o2.defaultMinTvl = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
FAILED
```
`md5sum src/poller-core.js` while planted → `13cf713b1a5bded38d551398a6cf0cf6`.
Restore: `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e`
(byte-identical to baseline). Re-run: **green**, 25/25.

All four mutations were applied, tested, and reverted **individually** — one
planted, tested, reverted, and re-verified green (with the restored md5
matching baseline) before the next began — never combined. Two permanent
synthetic regression tests were also added to the test file itself
(`plain-assignment detector catches a rail-shaped DEFAULT PARAMETER, the
last one in the list (operator round 3, attack __n3)` and `...in the middle
of a multi-parameter list, via the PRE-EXISTING "," terminator (operator
round 3, attack __n3b — regression, not a new catch)`), both green.

### (B) STILL ESCAPES — residue, not fixed: lowercase object-property rail

A lowercase (or camelCase) OBJECT-PROPERTY rail copy —

```js
const __R3 = { defaultMinTvl: 100000, apySanityLimit: 1000 };
```

— still escapes every detector in this file, and this round does **not**
close that gap. `findObjectPropertySites` (`PROP_RE`) keeps its
`SCREAMING_SNAKE_CASE` (`^[A-Z][A-Z0-9_]*$`) key restriction, unchanged from
FIX 3 (verifier round 2, finding 3). The reason the restriction is kept is a
measured cost, not a naming-convention absolute: relaxing `PROP_RE`'s key
predicate to the same general `/tvl|apy/i` substring test every other
detector in this file already uses was re-measured (verifier round 2) at
**1040 raw hits**, **107 after excluding DefiLlama's own field names**
(`tvlUsd`, `apyBase`, `apyReward`, `apyMean30d`, `apyPct1D/7D/30D`,
`apyBase7d`, etc.) — because an object-property *definition* with a
tvl/apy-containing key is not rare, it is what every pool/KPI fixture
literal in this repo's own test suite looks like, by the hundreds. 107 is
still too large a set to classify honestly in any single item's attempt, so
the restriction stays, and the lowercase/camelCase shape it cannot see stays
open.

**This is stated as GENERAL residue, not a closed class**: the escaping
shape is "any lowercase or camelCase object-property rail mirror," not only
the one worked `__R3` example above — nothing in this round or FIX 3
narrows the shape to a single instance, and a future item should not read
either as implying the class is closed.

**Named live instance already on record, independent of this round**:
`generate-spotlight.js:419-421`'s `PERSONA_BANDS` object (lowercase band
keys `stable`/`rwa`/`degen`, each nesting a lowercase `minTvl` property) vs.
`planner.js:567/572`'s `PERSONAS` object (same lowercase shape) — neither
side is `SCREAMING_SNAKE_CASE`, so `PROP_RE` cannot see either declaration,
by construction, regardless of whether the restriction is kept or relaxed
tomorrow. The two objects are meant to mirror each other (each file's own
comment says so) but have already drifted by **exactly 100x on 2 of the 3
bands** (`rwa`: spotlight `100000` vs. planner `10000000`; `degen`: spotlight
`100000` vs. planner `10000000`; `stable` still agrees at `50000000` both
sides). This divergence is already independently pinned by the test file's
own "FIX 3 pin" test (`generate-spotlight.js PERSONA_BANDS.minTvl vs
planner.js PERSONAS.minTvl`), which derives both files' current values at
test time and fails the moment either side changes — it is not re-derived or
re-proven here, only cross-referenced as the concrete, permanent record of
this exact residue.

Which value is correct (or whether an independent narrower predicate could
someday catch this shape without the 1040/107 explosion) is a product/tooling
decision out of this round's scope. No `PROP_RE` restriction, no
`PERSONA_BANDS`/`PERSONAS` value, and no other file was touched to address
this residue.

### Verification (this round)

```
node test_rail_predicate_derivation.js  → 25/25 assertions passed (population: 209 files; comparison sites: 36; assignment sites: 18 (+4 canonical, excluded); allowlist entries: 54)
node test_sitemap_xml.js                → 17/17 passed
node test_sitemap_filter_urls.js        → 11/11 passed
node test_poller.js                     → 21/21 assertions passed
node test_spotlight.js                  → 60/60 assertions passed
node test_test_registry.js              → 5/5 assertions passed

timeout 280 node run-tests.js --lane=plain --timeout=110
  → 63 files selected, pass=61, fail=2, timeout=0
  → the ONLY 2 failures: test_translations_number_format.js, test_vercelignore.js
    (both pre-existing and unrelated — same two as every prior round; neither
    references trust-rails.js, src/poller-core.js, or PLAIN_ASSIGN_RE's
    terminator)
```

Final md5 sanity — files this round was forbidden to permanently change,
confirmed unchanged from session start: `app.js`, `trust-rails.js`,
`planner.js`, `generate-sitemap.js` were never touched at all this round
(no edit tool call against any of them); `src/poller-core.js` was mutated
four times, transiently, all four restored to
`904c8480619a8c88e024feee8bcbeb2e` as quoted above.

## Verifier round 3 — the parenthesised-operand gap

The finding: `findSites`' comparison detector only matched when a BARE
identifier/member chain sat directly against the operator (`p.tvlUsd <
100000`) — the punctuation of the two motivating instances. It was blind to
this repo's own HOUSE IDIOM for rail comparisons, the exact form used at the
three rail-enforcement points this backlog item itself rewired:

```
generate-sitemap.js:88          return (pool.tvlUsd || 0) >= minTvl && !isAnomalousApy(pool);
generate-spotlight.js:79         return !isAnomalousApy(pool) && (pool.tvlUsd || 0) >= DEFAULT_MIN_TVL;
generate-pools-snapshot.js:81    return (Number(pool.tvlUsd) || 0) >= DEFAULT_MIN_TVL;
```

All three are correct TODAY (the right-hand side is an identifier/constant,
never a literal — comparing to a constant is the right idiom, not a rail
copy), so none of them is itself a "site". A hand-typed LITERAL at any of
those three shapes, though, was invisible to the guard — proven by four
synthetic attacks (x1, x2, x6, x3, matching the verifier's own naming) and
the verifier's own decisive demonstration: `test_pool_twins.js:117`
(`SUB_10M_FIXTURE.tvlUsd < 100000`, scanned) sitting one line above
`test_pool_twins.js:118` (`(p.tvlUsd || 0) >= 100000`, invisible).

Only file touched permanently this round: `test_rail_predicate_derivation.js`.
`src/poller-core.js` was mutated nine times total this round, all transient,
all restored byte-identically (proven below). No other file was touched.

### The fix — three parts

**1. Widened `findSites`' operand grammar.** The identifier position now
also accepts any parenthesised expression whose text contains a tvl/apy
identifier (`PAREN_GROUP_RE`, up to 3 levels of paren nesting — this
checkout's own worst case, PoolDetail.js's 3-deep rate-divergence ratio
guard `(Math.max((pool.apyBase||0)+(pool.apyReward||0), pool.apyMean30d) /
Math.min(...))`, needed exactly 3), in BOTH operand orders; the literal
position now also accepts a parenthesised literal (`p.tvlUsd < (100000)`,
attack x6), also both orders. Internal whitespace inside a captured
paren-group is normalised to a single space before use as the allowlist key
(`normaliseIdent`), so 5 differently-indented occurrences of the identical
PoolDetail.js expression fold into ONE key — the same "one key per identical
occurrence" precedent `generate-llms.js`'s `tvl > 1e9` entry (4 occurrences)
already established, not a new convention invented for this round.

**2. Fixed `PROP_RE` to accept quoted keys** (`'DEFAULT_MIN_TVL': 100000`
and `"DEFAULT_MIN_TVL": 100000`, attack x3) via an optional `(['"]?)` capture
with a matching `\1` backreference on the close side (so mismatched quotes —
not valid JS — are correctly rejected). The SCREAMING_SNAKE_CASE key
restriction itself is UNCHANGED; only quoting is newly tolerated, exactly as
scoped. Re-measured population-wide (both against the shipped comment
stripper and the regex-literal-fixed one, see part 3): **0 new real sites** —
no file in this checkout currently hand-types a quoted rail-shaped key; only
the synthetic x3 attack exercises this path.

**3. A separate, pre-existing bug found and fixed while re-deriving the real
site list (not asked for by the task, but required for its own named site to
actually become visible):** `stripCommentsAndStrings`/`stripComments` had no
notion of a JS REGEX LITERAL. A regex containing an ODD number of quote
characters — extremely common in this codebase's own `"key":\s*`-shaped
generator regexes, e.g. `generate-pools-snapshot.js:125`'s
`.replace(/("generatedAt":\s*)"[^"]*"/g, ...)` (5 raw `"` chars) — desyncs
the walker's quote-tracking for the REST OF THE FILE, silently blanking every
subsequent line out of existence for `findSites`. **Six files were measured
permanently corrupted this way** (their entire tail blanked, confirmed by an
instrumented walker that reports where `quote` state ends stuck at EOF):
`compute-kpis.js` (stuck from line 290), `generate-history-backfill.js`
(line 44, `sqlStr`'s own `/'/g` regex — ONE raw `'` char), `generate-pools-
snapshot.js` (line 127), `generate-protocol-urls.js` (line 191),
`test_seo_app_link_attribution.js` (line 287), `test_seo_cta_targets.js`
(line 389, triggered by `CTA_LINK_RE`/`LAST_UPDATED_RE`, both `href="..."`-
shaped regexes at lines 217/233). A SEVENTH file, `test_api_worker.js`, was
found TRANSIENTLY corrupted (a `href="([^"]*)"`-shaped regex at line 70
desyncs the state for ~30 lines, then a later regex with its own odd
quote-count happens to resync it by luck) — found only by re-running the
scan, not by the tail-corruption heuristic used to find the other six.

Fix: `regexAllowedBefore`/`scanRegexLiteral`, the standard "is a value
expected here" heuristic every real JS tokenizer uses — a `/` immediately
after an operator/opening-punctuation character or a regex-precursor keyword
(`return`, `typeof`, `instanceof`, `in`, `of`, `new`, `delete`, `void`,
`throw`, `case`, `do`, `else`, `yield`, `await`), or at start-of-file, begins
a regex literal (scanned respecting backslash escapes and `[...]` character
classes, where an unescaped `/` does not terminate); anywhere else `/` is
division (or, as already handled, a comment opener). Documented as a
heuristic, not a full parser, with its one known limitation stated inline
(a comment/string ending immediately before the `/` can fool the look-back —
no instance of this shape exists in the current population). Applied to
BOTH `stripCommentsAndStrings` (regex body blanked, like a string) and
`stripComments` (regex body preserved verbatim, like a string — consistent
with that function's own convention).

**Re-measured: this fix surfaces ZERO new assignment/object-property/
plain-assignment sites** (verified by running all three detectors,
population-wide, with the shipped `stripComments` vs. the regex-literal-fixed
one, before making any other change) — the corruption happened to only ever
matter for `findSites`' own comparison scan in the 7 affected files, not for
a bare declaration/property/no-keyword-assignment shape landing inside one of
their corrupted spans this round.

### How many new sites were surfaced, and their classification

Re-derived by actually running the widened scan against the full 209-file
population — **not** by trusting the verifier's own 11-item enumeration
(its own instruction). The real count is **19**, not 11:

| # | Site | Classification |
|---|------|-----------------|
| 1–5 | `PoolDetail.js:524,538,569,949,986` — `(Math.max((pool.apyBase\|\|0)+(pool.apyReward\|\|0),pool.apyMean30d)/Math.min(...))>=1.5` | Rate-divergence confidence guard (087/104/210) gating the momentum/TVL-trend honesty notes — a ratio threshold, not APY_SANITY_LIMIT (a ceiling on a raw rate, not a ratio between two readings). 5 occurrences, differently indented per card/story render, fold to ONE allowlist key. |
| 6 | `PoolDetail.js:954` — `(pool.kpis.apyMomentum)>=0.5` | "Rate has climbed" momentum-note trigger — a 0.5pp movement threshold, unrelated to APY_SANITY_LIMIT. |
| 7 | `PoolDetail.js:991` — `(pool.kpis.tvlTrend)>=0.25` | TVL-trend significance gate — a 25% fractional-change threshold, unrelated to DEFAULT_MIN_TVL (an absolute-dollar floor). |
| 8 | `generate-pool-pages.js:291` — same ratio guard, `currentTotalApy` variant | Explicit mirror of PoolDetail.js's own rate-divergence guard — not APY_SANITY_LIMIT. |
| 9 | `generate-pools-snapshot.js:312` — `(Number(p && p.tvlUsd)\|\|0)>=1000` | The generator's OWN `--seoOut` scratch transient ("$1000-floored RAW-pool transient... Scratch path only — never committed/served") — the SAME $1,000 SEO-hygiene floor already allowlisted for generate-sitemap.js's bare-identifier form, 100x below DEFAULT_MIN_TVL, never a copy of it. **This is the verifier's own named decisive site** — it needed BOTH fixes (regex-literal + operand widening) to become visible. |
| 10 | `test_seo_shared_source.js:122` — `(Number(p.tvlUsd)\|\|0)>=1000` | Test mirror of the same $1,000 SEO floor, for the shared-source test. |
| 11 | `test_llms_shared_source.js:78` — `(p.tvlUsd)>=1000` | Same $1,000 SEO floor mirror, llms.txt test. |
| 12 | `planner.js:711` — `(k.apyStdev/cur)<=0.2` | "Steady pool" portfolio-narrative classifier (stdev/apy ratio) — same character as test_compute_kpis.js's already-allowlisted `kpis.apyStdev<0.05`, not APY_SANITY_LIMIT. |
| 13 | `planner.js:3530` — `(deltaApy)<=0.05` | "Holding steady" plan-status UI-copy threshold — unrelated to either rail. |
| 14 | `test_api_worker.js:369` — `(blendedRes.body.apyPct-expectedBlendedApy)<1e-9` | Floating-point parity tolerance, same character as test_pool_twin_parity.js's `apyDiff>0.02`. |
| 15–16 | `test_api_worker.js:103,104` — `....apySanityLimitExplanation.length>20` / `....minTvlExplanation.length>20` | Anti-vacuity string-LENGTH check on prose, not a rail value — same class as test_agent_surface_rail_claims.js's array-length entries. Previously hidden inside test_api_worker.js's own TRANSIENT regex-literal corruption. |
| 17 | `test_pool_twins.js:118` — `(p.tvlUsd\|\|0)>=100000` | Sanity check that every pool in the REAL snapshot clears DEFAULT_MIN_TVL — reads already-railed data, same class as the pre-existing test_pools_snapshot.js:76 entry, not a second rail implementation. **The verifier's own decisive two-adjacent-lines demonstration.** |
| 18–19 | `test_spotlight_packs.js:60,145` — `Math.abs(degenPack.effectiveApy-headline/3)<1e-9` / `Math.abs(pack.effectiveApy-expectedEff)<1e-9` | Floating-point tolerance verifying the degen ⅓-haircut math — same tolerance class as #14. |

**None of the 19 is a real unlinked rail copy.** No STOP was triggered.

The other nine sites the verifier enumerated (`generate-pools-snapshot.js:312`,
`test_seo_shared_source.js:122`, `test_llms_shared_source.js:78`,
`PoolDetail.js:954`, `PoolDetail.js:991`, `planner.js:711`, `planner.js:3530`,
`test_api_worker.js:369`, `test_spotlight_packs.js:60`,
`test_spotlight_packs.js:145`) all appear above, confirmed. Its enumeration
under-counted by 8 (the 5 PoolDetail.js ratio-guard occurrences beyond the
one it may have sampled, `generate-pool-pages.js:291`'s mirror, and
`test_api_worker.js:103,104`'s string-length checks) — found only by running
the widened scan against the real population rather than trusting the
11-item list.

### Attack proofs — x1, x2, x6, x3 (planted and reverted individually)

Baseline: `md5sum src/poller-core.js` → `904c8480619a8c88e024feee8bcbeb2e`
(confirmed matching before this round's first plant).

**x1 — `function __x1(pool) { return (pool.tvlUsd || 0) >= 100000; }`**
appended. Planted md5: `13b20d35dfc0c9ec2f811a474d8d9765`. RED, quoted:
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:76: unclassified pool-threshold literal comparison "(pool.tvlUsd || 0) >= 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restored via `git checkout -- src/poller-core.js`. `md5sum` →
`904c8480619a8c88e024feee8bcbeb2e` (byte-identical). Re-run: **green**, 34/34.

**x2 — `function __x2(pool) { return (Number(pool.tvlUsd) || 0) >= 100000; }`**
appended. Planted md5: `7f4cbe9ee62a26d3761cc09f304f032c`. RED, quoted:
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:76: unclassified pool-threshold literal comparison "(Number(pool.tvlUsd) || 0) >= 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restored. `md5sum` → `904c8480619a8c88e024feee8bcbeb2e` (byte-identical).
Re-run: **green**, 34/34.

**x6 — `function __x6(p) { return p.tvlUsd < (100000); }`** appended.
Planted md5: `9b8d4526f33426a05b2497dfd3f14dc3`. RED, quoted:
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:76: unclassified pool-threshold literal comparison "p.tvlUsd < 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
(The `(100000)` literal is unwrapped to its bare numeral for the key —
working as designed.) Restored. `md5sum` → `904c8480619a8c88e024feee8bcbeb2e`
(byte-identical). Re-run: **green**, 34/34.

**x3 — `const __x3 = { 'DEFAULT_MIN_TVL': 100000 };`** appended. Planted
md5: `c57a4cf94b253594452c754206284c77`. RED, quoted:
```
✗ every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)
    src/poller-core.js:76: unclassified pool-threshold literal comparison "DEFAULT_MIN_TVL: 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
(Reported as "comparison" by the combined-failure message's own labeling
heuristic — `expr.includes('=')` is false for a colon-keyed entry — but the
site itself was correctly found by `findObjectPropertySites`, proven by the
allowlist-key text `DEFAULT_MIN_TVL: 100000`, the object-property shape, not
a comparison shape at all; a cosmetic label quirk in the failure message,
not a detection defect.) Restored. `md5sum` → `904c8480619a8c88e024feee8bcbeb2e`
(byte-identical). Re-run: **green**, 34/34.

All four mutations were applied, tested, and reverted **individually** — one
planted, tested, reverted, and re-verified green (with the restored md5
matching baseline) before the next began — never combined. `git checkout --`
was used for every revert this round (safer than a hand-written string
replace — an earlier attempt using a Python string-replace on the FIRST x1
plant produced a byte-INEQUAL restore, `fd0464e79abfd8aea55dfcd809114357`,
because the replace dropped the file's trailing newline; caught immediately
by the md5 check, never left in place, and `git checkout --` used for every
plant from x1 onward, including a clean re-plant/re-revert of x1 itself).

### Regression battery re-run — n1, n2, n5, `__n3` (all still RED, clean restores)

Re-ran the earlier rounds' own live attacks against THIS round's changed
detector, to prove nothing regressed:

**n1 — `const ATTACK_WRAPPED_MIN_TVL =` / newline / `  100000;`** appended.
Planted md5: `d74b027f39df6894e449dc34669d2013`. RED, quoted:
```
src/poller-core.js:76: unclassified pool-threshold literal assignment "const ATTACK_WRAPPED_MIN_TVL = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restored via `git checkout --`. `md5sum` → `904c8480619a8c88e024feee8bcbeb2e`.

**n2 — `const __R2 = {` / newline / `  DEFAULT_MIN_TVL:` / newline /
`    100000` / newline / `};`** appended. Planted md5:
`0f451a272cd9531253e38a2d1931f46e`. RED, quoted:
```
src/poller-core.js:77: unclassified pool-threshold literal comparison "DEFAULT_MIN_TVL: 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restored via `git checkout --`. `md5sum` → `904c8480619a8c88e024feee8bcbeb2e`.

**n5 — `const __o2 = {}; __o2.defaultMinTvl = 100000;`** appended. Planted
md5: `5e40d17ac975c69906c1395db63c71e8`. RED, quoted:
```
src/poller-core.js:76: unclassified pool-threshold literal assignment "__o2.defaultMinTvl = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
Restored via `git checkout --`. `md5sum` → `904c8480619a8c88e024feee8bcbeb2e`.

**`__n3` — `function __n3(pool, minTvl = 100000) { return
(pool.tvlUsd||0) >= minTvl; }`** appended. Planted md5:
`1ecaa59aad151ea9ccacb46d202c825b`. RED, quoted:
```
src/poller-core.js:76: unclassified pool-threshold literal assignment "minTvl = 100000" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy
```
(Note the function BODY's own `(pool.tvlUsd||0) >= minTvl` — comparing the
newly-widened paren-group operand against the identifier `minTvl` — is
correctly NOT flagged; only the default-parameter's hand-typed literal is.
This is the widened `findSites` grammar and the pre-existing
`PLAIN_ASSIGN_RE` default-parameter shape both working correctly on the same
line, not a coincidence.) Restored via `git checkout --`. `md5sum` →
`904c8480619a8c88e024feee8bcbeb2e`.

All nine plants this round (x1, x2, x6, x3, n1, n2, n5, `__n3`, plus the
earlier x1 re-plant/re-revert during the md5-check catch above) were applied
and reverted one at a time; `src/poller-core.js`'s final state, confirmed by
both `git status --short` (clean) and `md5sum` (`904c8480619a8c88e024feee8bcbeb2e`),
matches session-start exactly.

### Hunted shapes (task's own instruction — at least 3 more, whether they escape or not)

Tested directly against all four detectors (`findSites`,
`findAssignmentSites`, `findObjectPropertySites`, `findPlainAssignmentSites`)
via synthetic snippets run from a subdirectory NOT matched by the population
glob (so the hunt's own fixture text couldn't self-pollute the real scan) —
not merely reasoned about:

| Shape | Snippet | Result |
|---|---|---|
| Bracket/computed-property assignment | `obj['tvlFloor'] = 100000;` | **ESCAPES** all four. `findPlainAssignmentSites`'s LHS grammar is dot-chains only, never bracket subscripts. New coverage limitation (c). |
| `Math.min`/`Math.max` clamp, no comparison operator | `const floor = Math.min(pool.tvlUsd, 100000);` | **ESCAPES** all four. No operator (`<`/`<=`/`>`/`>=`/`=`/`:`) is present at all — a fundamentally different mechanism no operator-keyed detector can see. New coverage limitation (d). |
| Function-name encodes the rail, argument doesn't | `if (getTvlFloor() >= 100000) { ok(); }` | **ESCAPES** `findSites`. The widened `PAREN_GROUP_RE` inspects the TEXT inside the parens (here, empty), never the preceding function name. New coverage limitation (e). |
| Destructuring default (function param) | `function f({ minTvl = 100000 } = {}) { return pool.tvlUsd >= minTvl; }` | **DOES NOT ESCAPE.** Caught by `findPlainAssignmentSites` as `minTvl = 100000` — the existing `}` terminator branch already covers it, no widening needed. |
| Destructuring default (`const`) | `const { minTvl = 100000 } = opts;` | **DOES NOT ESCAPE.** Same, caught by `findPlainAssignmentSites`. |
| Template-literal interpolation with a comparison | `` const s = `${pool.tvlUsd >= 100000 ? 'ok' : 'no'}`; `` | **DOES NOT ESCAPE.** Already covered by the `${...}` re-entry-as-code behaviour `stripCommentsAndStrings` has always had. |
| Ternary RHS on a bare assignment | `const apyFloor = cond ? 100000 : 500;` | **ESCAPES** all four (re-confirmed, not merely re-asserted — this is the SAME already-documented residual gap in coverage limitation (a), the RHS-must-be-a-single-bare-numeric-token restriction). |
| Array of thresholds | `const tvlTiers = [100000, 1000000, 10000000];` | **ESCAPES** all four, same root cause as the ternary case above — not a new class. |
| Equality operator | `if (pool.tvlUsd === 100000) { ok(); }` | **ESCAPES** `findSites` — `===`/`!==`/`==`/`!=` were never in `OPS` (a rail is a floor/ceiling, not an equality check). New coverage limitation (f), named explicitly rather than left as a silent assumption. |
| Lowercase object-property inside a function-call argument | `Object.assign(rails, { tvlFloor: 100000 });` | **ESCAPES**, same root cause as the ALREADY-documented lowercase-object-property residue (`PROP_RE`'s SCREAMING_SNAKE_CASE restriction) — a different syntactic wrapper (call argument vs. `const X = {...}`), not a new root cause. |

Three genuinely NEW escaping shapes recorded (bracket/computed-property
assignment, no-operator clamping, function-name-encodes-the-rail), plus
confirmation (not mere assumption) that destructuring defaults and template
interpolations do NOT escape, and re-confirmation that the ternary/array RHS
gap and the equality-operator gap are real, satisfying the task's "hunt for
at least three more shapes... record the result whether they escape or not."

### Re-measured counts (every number below is echoed by the script's own final summary line)

- **Population: 209 files** (unchanged — this round touched detector logic
  and the allowlist, not the globbed file list).
- **Comparison sites (findSites): 55** (up from 36). Derivation, isolated:
  the regex-literal fix ALONE (old operand grammar, fixed comment/string
  stripper) raises the count to **38** (2 net-new: `test_api_worker.js:103,
  104`'s string-length checks, previously hidden inside that file's
  TRANSIENT corruption); the operand-grammar widening on top of THAT fixed
  baseline adds **17 more** (55 total). 36+2+17=55 — verified by running each
  fix in isolation against the shipped baseline before combining them, not
  assumed additive. **19 net-new sites** versus the shipped 36; **zero**
  previously-classified sites dropped (every one of the original 36 verified
  still present, unchanged, in the new 55).
- **Zero-exclusion figure (comparison detector only):** dropping the
  "literal !== 0" filter now raises the count from 55 to **127** — **72**
  sites excluded (up from 60 pre-round-3 — the operand widening surfaces
  many more `(x || 0) > 0`-shaped emptiness tests than the bare-identifier
  form ever could).
- **Assignment sites (findAssignmentSites): 18 non-canonical + 4 canonical**
  (unchanged — re-verified population-wide that the regex-literal fix
  surfaces zero new sites here).
- **Object-property sites (findObjectPropertySites): 0 real** (unchanged —
  re-verified population-wide against BOTH the shipped and the
  regex-literal-fixed comment stripper, to rule out a quoted key hiding
  inside one of the 7 newly-unblanked files).
- **Plain-assignment sites (findPlainAssignmentSites): 6, across 5 files**
  (unchanged).
- **Allowlist entries: 69** (54 entering this round + 15 new keys covering
  the 19 newly-classified sites — 5 PoolDetail.js occurrences of one
  expression fold to 1 key, the other 14 sites are 1:1 = 15 keys).
- **Assertion count: 34** (25 entering this round + 9 new: x1, x2, x6-both-
  orders-in-one-test, whitespace-normalisation, x3-both-quotes-plus-
  mismatch-in-one-test, unquoted-shape-regression, regex-corruption-fix,
  regex-vs-division-no-false-positive, comment-still-stripped-after-regex).

### Coverage-limitations header — updated honestly

The test file's own header now states, as residue (not claimed closed):
(a) ternary/array/multi-statement RHS on a bare assignment — re-confirmed
escaping, not merely re-asserted; (c) bracket/computed-property assignment —
new; (d) `Math.min`/`Math.max` clamp with no comparison operator — new;
(e) function-name-encodes-the-rail, argument doesn't — new; (f) equality
operators never in `OPS` — new; (g) destructuring defaults and template
interpolations — confirmed NOT escaping. The pre-existing lowercase
object-property residue (PROP_RE's SCREAMING_SNAKE_CASE restriction,
`generate-spotlight.js` `PERSONA_BANDS` vs. `planner.js` `PERSONAS`) is
UNCHANGED by this round (only PROP_RE's quoting tolerance was touched, not
its case restriction) — including a variant found this round via the shape
hunt (`Object.assign(rails, { tvlFloor: 100000 })`, same root cause, not a
new one).

### Verification (this round)

```
node test_rail_predicate_derivation.js  → 34/34 assertions passed (population: 209 files; comparison sites: 55; assignment sites: 18 (+4 canonical, excluded); allowlist entries: 69)
node test_webmcp_rail_derivation.js     → 10/10 tests passed
node test_pool_twins.js                 → 41/41 pool-twin assertions passed
node test_spotlight.js                  → 60/60 assertions passed
node test_poller.js                     → 21/21 assertions passed
node test_pools_snapshot.js             → 9/9 assertions passed
node test_sitemap_xml.js                → 17/17 passed
node test_api_worker.js                 → 750/750 assertions passed
node test_test_registry.js              → 5/5 assertions passed

timeout 280 node run-tests.js --lane=plain --timeout=110
  → 63 files selected, pass=61, fail=2, timeout=0
  → the ONLY 2 failures: test_translations_number_format.js, test_vercelignore.js
    (both pre-existing and unrelated — same two as every prior round; neither
    references trust-rails.js, src/poller-core.js, or this round's detector
    changes)
```

Final md5 sanity — files this round was forbidden to permanently change,
confirmed unchanged from session start (`git status --short` shows only
`test_rail_predicate_derivation.js` modified): `app.js`, `trust-rails.js`,
`planner.js`, `generate-sitemap.js`, `generate-spotlight.js`,
`generate-pools-snapshot.js`, `home.html` were never touched at all this
round; `src/poller-core.js` was mutated nine times, all transient, all
restored to `904c8480619a8c88e024feee8bcbeb2e` as quoted above. `specs/266.md`
and `specs/266-pr.md` were not touched (operator's own claim-correction work,
done in parallel, out of this round's scope by explicit instruction).
