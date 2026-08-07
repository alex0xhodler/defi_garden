# 168 build notes

## Files changed

- `generate-llms.js` (866 lines total, +174/-83 vs origin/main):
  - Extracted `isRailPassing(pool, minTvlUsd = MIN_TVL_USD)` (line 271) from `pickHighYield()`'s
    previously-inlined filter — one source of truth for the trust rail (TVL floor + APY sanity
    ceiling), same semantics as before, `pickHighYield()` now calls it. Exported.
  - Added `plannerRate(pools, options = {})` (line 320) — median `apy` over ALL rail-passing pools
    (via `isRailPassing()`), not the top-15 slice `pickHighYield()` uses for its leaderboard. Returns
    `{ medianApy, eligibleCount }` or `null` when nothing is eligible. Exported.
  - Added `buildPlannerSection(meta, rate, opts = {})` (line 478) — the ONE shared emitter for the
    `## Garden Planner` section, called by both `buildConcise()` (opts.full=false) and `buildFull()`
    (opts.full=true, adds the early-access waitlist line). Exported.
  - `buildConcise()`: rewrote the homepage `TL;DR:` to name both faces of the product; inserted the
    Garden Planner section right after Homepage; added two planner-shaped lines to
    "Common Search Patterns".
  - `buildFull()`: same homepage `TL;DR:` treatment for consistency; inserted the same shared
    section (fuller variant) right after Homepage; both functions now accept a 5th parameter
    (`plannerRateResult`) that defaults to `undefined`, so existing callers/tests that only pass 4
    args still work (the section just renders its number-free branch).
  - `main()`: computes `plannerRate(yields)` once and threads it into both builders.
  - `module.exports`: added `isRailPassing`, `plannerRate`, `buildPlannerSection`.
- `llms.txt` (89 lines) / `llms-full.txt` (5034 lines): regenerated via `node generate-llms.js`
  against a live `yields.llama.fi/pools` fetch (15,993 pools; 553 cleared the rails). Never
  hand-edited.
- `package.json` (1 line changed): `test:serial` — inserted `node test_llms_planner_section.js`
  immediately after `node test_llms_rails.js` (and before the pre-existing
  `node test_llms_link_integrity.js`).
- `test_llms_planner_section.js` (270 lines, new file): 23 assertions — committed-artifact leg,
  router-param membership (parsed live out of `home.html`, not a second hardcoded copy),
  `plannerRate()` unit tests, `buildPlannerSection()` empty/filled branch tests, ban-list, and
  no-fake-availability checks. Follows `test_llms_rails.js`'s `test()` harness and console-output
  shape.

`run-tests.js` needed no edit — same reasoning as 166's notes: it parses `package.json`'s
`test:serial` string directly, and the new file classifies into the `plain` lane (confirmed by the
`run-tests.js --lane=plain` run below, which lists `test_llms_planner_section.js` in its PASS output).

## Operator design decisions inherited (resolving the spec's ambiguities)

1. **Median over the FULL rail-passing set, not the top-15 slice.** `pickHighYield()`'s `topN=15`
   leaderboard is a "best of" list; `plannerRate()` deliberately re-filters the whole pool array via
   `isRailPassing()` and takes the median of that entire eligible set (553 pools in this run, not
   15). This is the conservative, representative "what does the market pay" figure the operator
   specified — a top-N median would overstate a real plan's earnings.
2. **The rate line states its own divergence from a real plan's rate**, verbatim per the operator's
   supplied phrasing: *"A plan's own rate is usually lower: the planner picks a smaller, more
   conservative pool set per temperament (the default pace is stablecoin lending/staking only)."*
   This stops the file's median from being read as "what your plan will earn."
3. **No forever-number dollar figure or multiplier is ever emitted** — only the formula in words
   (`forever number = annual bill ÷ blended rate`). Publishing an optimistic capital figure derived
   from a market-wide median (not a user's actual, more conservative plan rate) was named as the
   specific trust risk to avoid; the formula alone is the citable, non-misleading content.
4. **Preset URLs (`?preset=tomoko`, `?preset=kevin`) instead of `?goal=` links.**
   `decodePlanFromUrl()` (`planner.js:1080-1113`) returns `null` unless the URL carries
   `goal` + `pace` + (`monthly` or `fm=capital&capital=`) together — a bare `?goal=retirement` would
   not reproduce a plan and would repeat item 166's link-integrity bug class in a new form. The two
   presets used are real entries in `PRESETS` (`planner.js:1119-1122`) and `preset` is a real member
   of `PLANNER_PARAMS` (`home.html:78`), so both URLs are verified-routed and verified to actually
   fast-forward to a filled plan.
5. **Subscription card mention is early-access/waitlist framed, never asserts availability** — one
   clause ("an early-access waitlist exists for a card that would pay a subscription directly from a
   position's yield; the card itself is not available yet"), included only in the fuller
   `llms-full.txt` body (`opts.full`); omitted from the concise `llms.txt` body entirely, which is
   the safest reading of "if mentioned at all."
6. **Copy ban-list (CLAUDE.md)** — "save up", "afford", "budget" — checked with a direct case-insensitive
   regex test against both branches of the rendered section in the new test file; none appear
   anywhere in `buildPlannerSection()`'s output (empty or filled, concise or full).

## Deviations from the brief

1. **`buildConcise()`/`buildFull()` gained an optional 5th parameter** (`plannerRateResult`) rather
   than being restructured to take an options object. This keeps `test_llms_link_integrity.js`'s
   existing 4-argument calls (`buildConcise(baseMeta, emptyCategories, ...)`) working unchanged — with
   `plannerRateResult` defaulting to `undefined`, `buildPlannerSection()`'s `if (rate)` guard treats
   that identically to `null` and renders the number-free branch. Verified: `test_llms_link_integrity.js`
   still passes 24/24 with zero edits to that file.
2. **Query-example additions only touched `buildConcise()`'s "Common Search Patterns" section.**
   `buildFull()` has no equivalent section (confirmed by reading the function top to bottom before
   editing — its sections are Homepage/Token Pages/Chain Pages/Pool Type Pages/High-Value Filter
   Pages/Other Pages/Market Analysis ×3/Live High-Yield Opportunities/Disclaimers; none is a
   query-pattern list), so per the brief's own "if it has a matching section" clause, nothing was
   added there beyond the shared Garden Planner section itself.
3. **`isRailPassing()` takes the pool object first and `minTvlUsd` second** (matching
   `pickHighYield()`'s existing `options.minTvlUsd` convention) rather than being a closure — this
   keeps it a plain, independently-testable, stateless function reusable from `plannerRate()` without
   threading extra state.
4. **Homepage `TL;DR:` wording** is not the literal example sentence from `168.md`'s evidence section
   (which only quotes the *old, wrong* line) — I wrote a single sentence naming both URL shapes
   (`?token=`, `?chain=`, `?pool=`) and both product faces, per the brief's explicit instruction ("one
   sentence, no marketing adjectives"), and used the *identical* sentence in both `buildConcise()`
   and `buildFull()` for consistency (the brief only required "the same way," not an identical
   string, but identical was simpler and equally correct).
5. No other deviations. `translations.js`/KO was correctly left untouched — `llms*.txt` is a single
   English machine-readable artifact with no KO counterpart, so the EN+KO rule is not engaged (stated
   per the spec's own instruction to say so explicitly).

## Step 0b non-vacuity proofs (playbook `derived-number-rails.md`)

### (i) Neutralise the `buildPlannerSection` call sites → new assertions go RED

Both call sites in `buildConcise()`/`buildFull()` were commented out in place:
```js
// MUTATION (168 Step 0b non-vacuity proof — temporarily neutralised, restored after)
// lines.push(...buildPlannerSection(meta, plannerRateResult, { full: false }));
// lines.push('');
```
(and the `{ full: true }` equivalent in `buildFull()`). Ran `node generate-llms.js` (live fetch) to
regenerate the mutated artifacts, then `node test_llms_planner_section.js`. Verbatim red output
(5 of 23 assertions failed, exit code 1):
```
llms.txt / llms-full.txt Garden Planner section — 168
  ✗ committed llms.txt contains a "## Garden Planner" section with a TL;DR: line
    expected a "## Garden Planner" heading followed by a TL;DR: line in llms.txt
  ✗ committed llms-full.txt contains the same section AND the three archetype literals
    expected a "## Garden Planner" heading followed by a TL;DR: line in llms-full.txt
  ✗ committed llms.txt case-insensitive planner/forever-number/subscription match count >= 3 (was 0)
    expected >= 3 matches, found 2
  ✓ committed homepage TL;DR no longer equals the old verbatim string and mentions the planner
  ✗ llms.txt Garden Planner section: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}
    could not find "## Garden Planner" section
  ✗ llms-full.txt Garden Planner section: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}
    could not find "## Garden Planner" section
  ...
18 assertions passed
FAILED
```
(The 18 that stayed green are the pure unit-level `plannerRate()`/`buildPlannerSection()` tests,
which call the exported functions directly and correctly don't depend on whether `buildConcise`/
`buildFull` wire them in — that asymmetry is expected and is itself evidence the artifact-level
assertions, not the unit ones, are what caught the mutation.) Restored `generate-llms.js`,
`llms.txt`, `llms-full.txt` byte-exact from pre-mutation backups (diffed with `diff -q`, zero output
on all three), then re-ran `node test_llms_planner_section.js`: 23/23 passed, exit 0.

### (ii) Empty-pools fixture → section renders number-free and intact, not broken

`generate-llms.js`'s own `--fixture` flag intentionally will NOT admit a genuinely empty array —
`loadFixturePools()` treats an empty fixture as "missing" and fails SAFE to a live fetch (spec 113's
anti-truncation guarantee), so the correct way to exercise the true empty-pools path is to call the
exported functions directly with `[]`, exactly as `generate-llms.js` would if a live fetch
legitimately returned nothing. Script and verbatim output:
```
$ node step0b-empty-pools-run.js
plannerRate([]) => null

--- llms.txt Garden Planner section (empty pools) ---
## Garden Planner
TL;DR: A goal-first savings planner for people who think in monthly deposits and life goals, not APY or pools — the default experience at the bare site root.
- Entry point (bare path, always the planner): https://www.defi.garden/plan.html
- Example filled plans, real presets carrying no invented numbers: https://www.defi.garden/?preset=tomoko and https://www.defi.garden/?preset=kevin
- GROWTH: long-horizon goals like retirement or a home — projects future value from steady monthly deposits.
- TARGET: a specific item to buy — projects time-to-item from monthly deposits and the live rate.
- SUBSCRIPTION: the "forever number" — the capital whose yield alone covers a recurring bill, indefinitely.
- Forever number formula: forever number = annual bill ÷ blended rate. No projected dollar figure is published here — a plan's own inputs determine the real number.

--- llms-full.txt Garden Planner section (empty pools) ---
## Garden Planner
TL;DR: A goal-first savings planner for people who think in monthly deposits and life goals, not APY or pools — the default experience at the bare site root.
- Entry point (bare path, always the planner): https://www.defi.garden/plan.html
- Example filled plans, real presets carrying no invented numbers: https://www.defi.garden/?preset=tomoko and https://www.defi.garden/?preset=kevin
- GROWTH: long-horizon goals like retirement or a home — projects future value from steady monthly deposits.
- TARGET: a specific item to buy — projects time-to-item from monthly deposits and the live rate.
- SUBSCRIPTION: the "forever number" — the capital whose yield alone covers a recurring bill, indefinitely.
- Forever number formula: forever number = annual bill ÷ blended rate. No projected dollar figure is published here — a plan's own inputs determine the real number.
- An early-access waitlist exists for a card that would pay a subscription directly from a position's yield; the card itself is not available yet.

Bad-token scan (undefined/NaN/$0/0.0%):
  concise section contains bad token: false
  full section contains bad token: false
  concise section contains "Live blended rate": false
  full section contains "Live blended rate": false
  concise section contains all 3 archetypes: true
```
Confirms the section degrades honestly — prose and URLs intact, both rate lines cleanly omitted, no
`undefined`/`NaN`/`$0`/zeroed placeholder anywhere.

## Before/after measured counts

| Metric | Before (origin/main) | After |
|---|---|---|
| `grep -icE "planner|forever number|subscription" llms.txt` | 0 | 8 |
| `## Garden Planner` sections present (llms.txt / llms-full.txt) | 0 / 0 | 1 / 1 |
| `GROWTH`/`TARGET`/`SUBSCRIPTION` literals in llms-full.txt | 0 | 3 (each present) |
| Homepage `TL;DR:` mentions "planner" | no (generic "Main dashboard...") | yes, both files |
| Live blended rate line present | n/a | yes: `3.3%` across `553` rail-passing pools |
| `?preset=` occurrences in the new section | 0 | 2 (`tomoko`, `kevin`) |
| Router-param-membership violations in the new section | n/a | 0 |
| `test_llms_planner_section.js` assertions | file didn't exist | 23, all passing |
| `pickHighYield()` / rail-fixture regression (`test_llms_rails.js`) | 14 passing | 14 passing (unchanged — semantics preserved via extraction) |

## Regression gate

All commands run under the 5-minute foreground timebox; none needed to be killed.

```
$ node test_llms_planner_section.js
23 assertions passed

$ node test_llms_rails.js && node test_llms_freshness.js && node test_llms_shared_source.js && node test_llms_link_integrity.js
14 assertions passed   (rails — 159)
8 assertions passed    (freshness — 083)
12 assertions passed   (shared source — 113)
24 assertions passed   (link integrity — 166)
# exit 0

$ node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
All 208 assertions evaluated. / 9/9 passed / 9/9 passed
# exit 0

$ node run-tests.js --lane=plain --timeout=90
run-tests.js: 36 file(s) selected (lane=plain, plain=36, browser=0, ...)
TOTAL pass=36 fail=0 timeout=0 total=36
# exit 0 — includes test_llms_planner_section.js, test_llms_rails.js, test_llms_link_integrity.js,
# test_llms_freshness.js, test_planner.js, test_protocol_parsing.js, test_qualifier_fix.js among the 36
```
No pre-existing failures were encountered anywhere in this gate, so no `git stash` baseline
comparison was needed. (Browser-lane files — `test_search.js`, `test_smoke.js`, etc. — were correctly
excluded per the brief's explicit "do NOT run the browser lane" instruction.)

## Anything not done / could not do

Nothing was skipped. Live network access to `yields.llama.fi/pools` worked on the first attempt
(15,993 pools, ~1.5s) and on both mutation-run regenerations during Step 0b — no retry was needed and
no data was faked. `plannerRate()`'s 3.3% figure over 553 eligible pools was eyeballed for plausibility
(single-digit %, well under the 1000% ceiling) before committing.

## Post-review correction: the copy claimed something the router does not do

Operator review caught a real defect in the first cut: both new `TL;DR:` lines asserted that bare
`/` **is** the Garden Planner —

- Homepage: `TL;DR: https://www.defi.garden/ is the goal-first Garden Planner for monthly-deposit
  savings goals; ...`
- Garden Planner section: `... not APY or pools — the default experience at the bare site root.`

That is false against the live router. `home.html:82`:
```js
window.__APP_MODE = needsAnalytics ? 'analytics' : (needsPlanner ? 'planner' : 'landing');
```
Bare `/` carries no analytics param and no planner param and is not `/plan.html`, so it resolves to
**`'landing'`** — a search-first landing surface (`landing.js`, "Search-first DeFi Garden landing
surface") that **links out** to `plan.html` (`landing.js:260/282/329/339`), not the planner itself.
This is the 2026-07-15 landing pivot (also documented at item 156's LOG entry, "same three-mode
router"). **`CLAUDE.md`'s "Garden Planner (the DEFAULT feature, bare `/` and `plan.html`)" statement
is stale relative to this pivot — a doc-vs-code divergence for a human to reconcile in CLAUDE.md
itself; this build did NOT edit CLAUDE.md**, since that's out of this item's scope and the operator's
instruction was explicit that the fix belongs in the copy, not the doc.

Publishing "bare `/` is the planner" on the AI-discovery surface is exactly item 166's defect class —
a sentence whose destination doesn't do what the sentence claims — reintroduced in the copy layer on
the very surface 166 had just fixed at the link level. My own Step 0b proofs from the first cut did
not catch it because they proved the section's *presence* and *number-honesty*, never the *factual
accuracy of its prose against the router* — a distinct claim this correction's new regression guard
now covers.

### Fix applied

1. **Homepage `TL;DR:`** (identical line in both `buildConcise()` and `buildFull()`, `generate-llms.js`):
   ```
   TL;DR: https://www.defi.garden/ is a search-first landing page that routes into both faces of the
   product: /plan.html (and planner params) for the goal-first Garden Planner, and parameterized URLs
   (?token=, ?chain=, ?pool=) for the yield analytics app.
   ```
2. **Garden Planner section `TL;DR:`** (`buildPlannerSection()`), dropped "the default experience at
   the bare site root" and replaced with an accurate locator:
   ```
   TL;DR: A goal-first savings planner for people who think in monthly deposits and life goals, not
   APY or pools — lives at /plan.html, reached from the search-first landing surface at the site root.
   ```
3. No other bullet touched — the `- Entry point (bare path, always the planner): .../plan.html` line
   was already correct (`plan.html` really is always planner, per `isPlannerPath` in the same router
   snippet) and was left as-is; the rate lines, archetype lines, and formula line are byte-identical
   to before this correction.

### New regression guard, pinned to the router's own source

Added two assertions to `test_llms_planner_section.js` (now 25 assertions, up from 23):

1. **`home.html` router shape test** — regex-matches the live `window.__APP_MODE = needsAnalytics ? 'analytics' : (needsPlanner ? 'planner' : '<mode>')` assignment out of `home.html` itself (no second
   hardcoded copy of the mode logic, same discipline as the existing `parseParamArray` router-param
   test) and asserts `<mode>` is still `'landing'`. The failure message tells the next reader exactly
   what to do if it ever changes: *"if bare `/` is now the planner again, update the Homepage and
   Garden Planner TL;DR copy in generate-llms.js... then update this assertion."*
2. **Committed-artifact never-claims-root-is-planner test** — asserts neither `llms.txt` nor
   `llms-full.txt` matches `/(bare (site )?root|https:\/\/www\.defi\.garden\/)[^\n]{0,60}\b(is|as) the
   [^\n]{0,20}(Garden )?Planner/i` or the stale `/default experience at the bare/i` phrase.

### Step 0b RED proof for this correction

Backed up the corrected `llms.txt`/`llms-full.txt`/`generate-llms.js` to scratch, then string-replaced
the two corrected `TL;DR:` lines in the **committed artifacts** back to the original defective text
(regenerating from source would just re-emit the fix, so mutating the committed files directly is the
only way to reproduce exactly what shipped in the first cut), then ran the test. Verbatim red output
(1 of 25 assertions failed, exit code 1):
```
llms.txt / llms-full.txt Garden Planner section — 168
  ✓ committed llms.txt contains a "## Garden Planner" section with a TL;DR: line
  ✓ committed llms-full.txt contains the same section AND the three archetype literals
  ✓ committed llms.txt case-insensitive planner/forever-number/subscription match count >= 3 (was 0)
  ✓ committed homepage TL;DR no longer equals the old verbatim string and mentions the planner
  ✓ llms.txt Garden Planner section: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}
  ✓ llms-full.txt Garden Planner section: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}
  ✓ sanity: "preset" is actually a member of PLANNER_PARAMS (parse sanity)
  ✓ home.html router: bare "/" fallback mode is still "landing" (pins the truth this copy depends on)
  ✗ committed llms.txt / llms-full.txt never claim the site root itself is the Garden Planner
    llms.txt appears to claim the site root itself is the Garden Planner — bare "/" resolves to 'landing' per home.html, not 'planner'
  ...
24 assertions passed

FAILED
```
Restored `llms.txt`/`llms-full.txt` byte-exact from the scratch backup (`diff -q` returned no output
on both), re-ran: 25/25 passed, exit 0.

### Re-run regression gate (post-correction)

```
$ node test_llms_planner_section.js
25 assertions passed

$ node test_llms_rails.js && node test_llms_freshness.js && node test_llms_shared_source.js && node test_llms_link_integrity.js
14 + 8 + 12 + 24 assertions passed, exit 0

$ node run-tests.js --lane=plain --timeout=90
TOTAL pass=36 fail=0 timeout=0 total=36
```
All green, same 36-file plain-lane set as before (the new assertions live inside the already-wired
`test_llms_planner_section.js`, so no `run-tests.js`/`package.json` change was needed for this
correction).

### Rate after correction

Regenerated live (15,993 pools fetched): **3.3% median APY across 553 rail-passing pools** — unchanged
from the pre-correction run to three significant figures (copy-only fix, same live payload shape;
the small residual difference, if any, is just fetch-to-fetch market movement, not a logic change).

## Post-review correction 2: the divergence-direction caveat was backwards

Operator review (this time rendering the actual product) caught a second defect in the caveat bullet
that follows the "Live blended rate" line — a line the operator's own brief had specified verbatim,
so the operator flagged it as their error to fix, not mine to have caught blind, but it still could
not ship:

```
- A plan's own rate is usually lower: the planner picks a smaller, more conservative pool set per temperament (the default pace is stablecoin lending/staking only).
```

### Why it's false

`curatePools()` (`planner.js:604-671`) filters the pool set to the temperament band and then sorts
**APY-descending** (`poolTotalApy(b) - poolTotalApy(a)`, with a Sharpe tie-break), taking the top 3.
`blendedApy()` (`planner.js:686-689`) is the median of those top-3 pools. That is a **best-in-band**
selection, not a smaller/more-conservative one — so a plan's own rate is typically **higher** than
this file's market-wide median (which is the median over the *entire* rail-passing set, best and
worst pools alike), not lower as the shipped line claimed.

**Rendered evidence** (operator spot-check, headless Chromium, local server, `/?preset=tomoko`):
```
"🌳 Retirement $1,000/mo … grows to $162,000 in 10 yrs  Blended APY 5.78%  Timeline 10 yrs"
```
5.78% on a real preset plan vs. the 3.3% market-wide median this file publishes the same day — the
opposite of what the old bullet claimed.

### This is the `dual-source-logic-divergence` playbook's shape

Two independent rate computations exist over two different pool sets: `plannerRate()` here (median
over the *full* rail-passing set) and `curatePools()`/`blendedApy()` in `planner.js` (median of the
temperament band's *top-3-by-APY*). Both are legitimate, correctly-implemented, differently-scoped
numbers — this is exactly the playbook's "two sources, two selection rules" shape, not a bug in
either computation. The playbook's warning is not "pick the correct one," it's "do not silently
assume they agree, and do not duplicate one computation into the other's surface to make them match."

**The resolution taken is to state the divergence, not to duplicate `curatePools()`'s selection rule
into `generate-llms.js`.** Re-implementing "median of the temperament band's top-3-by-APY" here would
be a second, drifting copy of a selection rule that already lives in `planner.js` — exactly the
failure mode `dual-source-logic-divergence.md` exists to prevent (two copies of the same logic that
silently diverge the next time either one changes). The honest fix is a caveat that tells the reader
the two numbers are computed over different sets and will differ, without claiming a direction we
have not measured a distribution to support (`5.78% > 3.3%` is one instance, not a proof of "usually
higher" either — the file makes no claim beyond "not the same number").

### Replacement bullet (verbatim, identical in both files, via the shared `buildPlannerSection()` emitter)

```
- A plan's own rate is computed over a different set: the planner picks a small, temperament-filtered selection of pools (the default pace is stablecoin lending/staking only) and blends those, so the rate a plan shows will differ from this market-wide median.
```

No other bullet touched — the "Live blended rate: 3.3% — median APY across the 553 pools clearing our
published rails..." line above it is byte-identical to before this correction.

### New guard: `test_llms_planner_section.js` now 26 assertions (was 25)

Added one assertion asserting neither committed file contains a directional claim ("usually
lower"/"usually higher"/"lower than"/"higher than") applied to "a plan's own rate":
```js
const directionalClaim = /\bplan'?s?\s+own\s+rate\b[^\n]{0,80}\b(usually\s+(lower|higher)|lower\s+than|higher\s+than)\b/i;
```

### Step 0b RED proof

Backed up the corrected `llms.txt`/`llms-full.txt`/`generate-llms.js` to scratch, string-replaced the
corrected bullet in the **committed artifacts** back to the exact original shipped text (regenerating
from source would just re-emit the fix), ran the test. Verbatim red output (1 of 26 assertions
failed, exit code 1):
```
llms.txt / llms-full.txt Garden Planner section — 168
  ✓ committed llms.txt contains a "## Garden Planner" section with a TL;DR: line
  ✓ committed llms-full.txt contains the same section AND the three archetype literals
  ✓ committed llms.txt case-insensitive planner/forever-number/subscription match count >= 3 (was 0)
  ✓ committed homepage TL;DR no longer equals the old verbatim string and mentions the planner
  ✓ llms.txt Garden Planner section: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}
  ✓ llms-full.txt Garden Planner section: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}
  ✓ sanity: "preset" is actually a member of PLANNER_PARAMS (parse sanity)
  ✓ home.html router: bare "/" fallback mode is still "landing" (pins the truth this copy depends on)
  ✓ committed llms.txt / llms-full.txt never claim the site root itself is the Garden Planner
  ✗ committed llms.txt / llms-full.txt: no directional claim ("usually lower/higher", "X than") about a plan's own rate vs the published median
    llms.txt asserts a direction (lower/higher) for a plan's own rate vs the published median — curatePools()/blendedApy() select the best-in-band pools per temperament, not a smaller "conservative" set, so the direction is not reliably known and must not be claimed either way
  ...
25 assertions passed

FAILED
```
Restored `llms.txt`/`llms-full.txt` byte-exact from the scratch backup (`diff -q` returned no output
on both), re-ran: 26/26 passed, exit 0.

### Re-run regression gate (post-correction 2)

```
$ node test_llms_planner_section.js
26 assertions passed

$ node test_llms_rails.js && node test_llms_freshness.js && node test_llms_shared_source.js && node test_llms_link_integrity.js
14 + 8 + 12 + 24 assertions passed, exit 0

$ node run-tests.js --lane=plain --timeout=90
TOTAL pass=36 fail=0 timeout=0 total=36
```
All green. No `package.json`/`run-tests.js` change needed — the new assertion lives inside the
already-wired `test_llms_planner_section.js`.

### Rate after correction 2

Regenerated live (15,993 pools fetched): **3.3% median APY across 553 rail-passing pools** — unchanged
(copy-only fix, no selection-logic change).
