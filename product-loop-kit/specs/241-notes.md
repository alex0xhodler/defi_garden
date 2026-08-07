# 241 — implementation notes

## What changed and why

**translations.js**
- Added `formatCount(value)` (module-level, next to `createTranslationFunction`) — the
  one shared en-US pinned formatter for numbers reaching the dictionary. Identity for
  non-finite-number values. Exported via `module.exports` and left as a bare top-level
  `function` declaration — the exact same mechanism `translations`/`createTranslationFunction`
  already use to become a browser global (translations.js is a plain, non-module
  `<script>`, so a top-level `function`/`const` becomes `window.formatCount` automatically;
  no `window.formatCount = ...` assignment was added, to match the existing pattern exactly).
- `createTranslationFunction(lang)`'s returned `t(key, ...params)` now maps `params` through
  `formatCount` before invoking the entry, on both the normal path and the English-fallback
  path.
- Fixed every plurality predicate that compares a count param against the numeric literal
  `1` to be string-safe (`String(x) === '1'` / `!== '1'`), because a probed/production count
  now always arrives as a formatted string. Sites fixed (matches the brief's enumerated list
  exactly, re-grepped to confirm no others exist — see Non-vacuity below for the grep):
  `showingResults` (EN), `planner.years`, `planner.speedupDisciplined`,
  `planner.reportElapsedDays` (EN + KO — the KO one **does** branch to a different sentence,
  unlike every other KO counterpart below), `tcpTokenDescription`, `tcpChainDescription`,
  `tcpTokenIntro`, `tcpChainIntro`, `tcpSubLine`, `tcpAnswer`, `tcpFaqA2`. KO counterparts of
  the `tcp*`/`showingResults`/`years`/`speedupDisciplined` keys do **not** pluralize (Korean
  has no count-driven plural), confirmed by reading each KO entry directly — no `=== 1`/`!== 1`
  guard exists there, so nothing to fix.

**planner.js**
- Added `applyPinnedCounts(args)` next to `safeTranslations()`/`makeT()`. Mirrors
  `formatCount` at the `makeT()` accessor chokepoint, with the same spec-082
  graceful-degradation contract as `safeTranslations()`: it prefers `window.formatCount`
  (the real shared global, set once `translations.min.js` loads) and only degrades to an
  inline identity-safe copy if that global is absent — it never throws on a missing global.
  `makeT(lang)`'s returned `t(key, ...)` now maps its `args` through `applyPinnedCounts`
  before dispatching to the dictionary entry.
- `rootT(lang, key)` was **not** changed. Its sole caller is `planner.js:4824`:
  `rootT(lang, 'loadingError')` — no numeric params are ever passed (checked: `grep -n
  "rootT("` in planner.js returns exactly the one call site plus the definition). Confirmed
  out of scope per the brief.

**A deviation the brief did not anticipate (required, not optional) — `PoolDetail.js` /
`generate-pool-pages.js` / `translations.js`**

Five EN + five KO dictionary entries (`dailyEarningsSubLabel`, `monthlyEarningsSubLabel`,
`basedOnInvestment`, `projectionBody`, `gardenThisPoolCtaConcrete`) did their **own**
formatting internally: `Number(amount || 0).toLocaleString('en-US', ...)`. These are exactly
the "already using helpers" class spec 241.md marks OUT of scope for the count-sweep — but
the mandated accessor-chokepoint design (map **every** param through `formatCount` before the
entry runs) doesn't distinguish "count" params from these. Two real production call sites pass
raw numbers into these entries (`PoolDetail.js:1231` `t('basedOnInvestment', investmentAmount)`,
`PoolDetail.js:1089`/`:1311` `t('projectionBody'/'gardenThisPoolCtaConcrete', ..., projectionAmount)`,
and `generate-pool-pages.js:398`/`:426` the same pair for the static pool-page twins). Once
`formatCount` pre-converts a raw number to a formatted STRING (e.g. `"1,976"`) before the
entry runs, the entry's own `Number("1,976" || 0)` returns `NaN` (`Number()` cannot parse a
comma-grouped string) — reproduced concretely:
```
before this deviation: t('basedOnInvestment', 1976) -> "Based on $NaN investment"
```
This is a real, visible money-display regression on the live pool-detail calculator and the
static pool-page twins, not a theoretical one — verified with a throwaway repro before fixing.
It also silently changes `projectionBody`/`gardenThisPoolCtaConcrete`'s `amount` position from
whole-dollar-rounded (`{maximumFractionDigits: 0}`) to up-to-3-decimal display, since
`formatCount` doesn't apply that option, and `projectionAmount` is a compound-interest float
in practice.

**Fix** (minimal, reuses the same shared `formatCount`, does not re-implement):
- All 10 entries now do `formatCount(amount) || 0` instead of
  `Number(amount || 0).toLocaleString('en-US'[, opts])`. `formatCount` is idempotent (identity
  on an already-formatted string) and still formats a raw number for any caller that reaches
  the entry directly, bypassing the accessor. Verified this produces byte-identical output to
  the original for every param that used the *default* `toLocaleString('en-US')` (no options)
  — `formatCount`'s formatting is exactly that call, so `principal`/`investmentAmount` needed
  no other change.
- The two params that used `{maximumFractionDigits: 0}` (`projectionBody`'s `amount`,
  `gardenThisPoolCtaConcrete`'s `amount`, both always `projectionAmount`, a compound-growth
  float) needed the ROUNDING moved to the call site, since `formatCount` has no rounding
  option. Added `Math.round(...)` at the three real call sites:
  `PoolDetail.js:1089` (`t('projectionBody', ..., Math.round(projectionAmount))`),
  `PoolDetail.js:1311` (`t('gardenThisPoolCtaConcrete', Math.round(projectionAmount), ...)`),
  `generate-pool-pages.js:398`/`:426` (same pair). `PoolDetail.js`'s no-`t` fallback branch
  already did `Math.round(projectionAmount)` (line 1312's non-t template literal) — the fix
  makes the `t()` branch consistent with a fallback that was already there.
- Verified with `node test_pool_detail_anomaly_projection.js` (asserts the literal regex
  `/\$1,000 in this pool grows to ~\$/`), `node test_projection_lead.js`, and
  `node test_ko_pool_money_honesty.js` (asserts KO $ figures are numerically identical to EN)
  — all green after the fix, all three exercise exactly these entries/call sites.

Two of the five entries (`dailyEarningsSubLabel`, `monthlyEarningsSubLabel`) are **dead code**
— grepped for `'dailyEarningsSubLabel'`/`'monthlyEarningsSubLabel'` across every `.js` file in
the repo (excluding `translations.js`/`translations.min.js`/compiled twins) and found zero
call sites. Fixed anyway for coherence (cheap, and keeps the guard test's sweep meaningful for
every entry rather than needing a "known-dead, don't bother" carve-out).

## landing.js / generate-spotlight.js audit (brief §5)

`landing.js` calls `getCopy()` (`translations[lang].landing`) and reads `plannerCopy`/`rootCopy`
directly — both bypass `createTranslationFunction` and `makeT`. Grepped every read of `copy.*`,
`plannerCopy[...]`, `rootCopy.*`:
```
grep -n "copy\.\|plannerCopy\[\|rootCopy\.\|plantedDate\|goalLabel" landing.js
```
Only one function-valued call: `copy.returnStatus(plantedDate)` (line 333). `plantedDate` is
built at line 198 via `new Date(savedPlan.savedAt).toLocaleDateString('en-US', {...})` — always
a formatted STRING, never a raw number. `goalLabel = plannerCopy[goalLabelKey]` (line 194) is a
plain property read, not a function call. **No landing.js call site passes a raw number** — per
the brief, changed nothing there.

`landing.returnStatus` (the one function-valued `.landing` key, both EN/KO — confirmed via a
recursive walk: `.landing` has exactly 1 function-valued entry per language, `.planner` has 81,
top-level has 71, total `(71+1+81)*2 = 306`) is therefore reachable only through this one
audited-safe, never-passed-a-raw-number call site — consistent with it being outside both
accessors' scope by design, not an oversight.

`generate-spotlight.js:180`'s `goalLabelText(goalDef, lang)` reads `dict[goalDef.labelKey]`
directly (mirrors `makeT`'s dict-then-fallback-then-key-echo logic per its own header comment)
but never CALLS the resolved value as a function — every `.planner` goal label (`goalClaude`,
`goalSpotify`, etc.) is a plain string, not a function. Confirmed: `grep -n
"typeof.*function\|(\.\.\." generate-spotlight.js` around that function shows no invocation.
Nothing to change.

## New test: test_translations_number_format.js (plain lane)

- **Population**: flattens both `en`/`ko` trees recursing into nested subtrees, collects every
  function-valued key. Printed count: **306** (matches the measured territory in spec 241.md
  exactly). Asserted `> 250` (a population sanity bound, not a hardcoded exact-match assertion,
  per the brief).
- **Allowlist**: real, keyed, empty object (`ALLOWLIST = {}`). Printed size: **0**. Asserted
  empty — the design's point is that the accessor-chokepoint fix needs no per-entry exemption.
- **Sweep**: every entry, every parameter position, probed with `1976` (other positions filled
  with the neutral string `'X'`), invoked THROUGH the real `createTranslationFunction(lang)`
  for top-level keys and a `makeT()`-shaped mirror for `.planner` keys (the same established
  mirror pattern `test_planner.js:1065-1066` already uses for this exact accessor — `makeT`
  lives inside planner.js's IIFE and isn't exported). 496 total invocations. **Deviation from
  the brief's literal `/\d{4,}/` regex**: several entries carry a static, non-count literal —
  the APY_SANITY_LIMIT threshold baked into copy as `"…exclude anomalous (>1000% APY)
  pools…"` (`translations.js` `tcpAnswer`/`tcpFaqA2`(EN)/`tcpAnswer`/`tcpFaqA3`(KO) —
  the literal `1000` is never derived from any parameter, so it appears in EVERY invocation
  regardless of the probe or the fix). A blanket `/\d{4,}/.test(wholeOutput)` scan would
  therefore fail on those entries permanently, unrelated to formatting correctness — a
  false positive baked into the spec's example regex, not a defect in the fix. The test instead
  checks for the specific PROBED value appearing bare (`(?<!\d)1976(?!\d)`, which by
  construction cannot match the correctly-grouped `"1,976"` — the comma splits the run into
  `"1"` and `"976"`, neither 4+ digits), scoped to the injected value rather than the whole
  string. This is a stricter, false-positive-free version of the same invariant the brief
  describes ("no bare 4+ digit run" — from the probe).
- **Mirror-guard** (brief §6c): a source-level assertion that `planner.js`'s real `makeT()`
  still calls `applyPinnedCounts()`, and that `applyPinnedCounts()` still reaches for
  `window.formatCount`. Documented in the test's own comment what this can/can't catch: it
  proves the CALL SITE is present, not that the shared formatter behaves correctly at runtime
  in a real browser — `test_translations_fallback.js`'s minified-artifact assertions and the
  rendered Playwright leg (below) cover that.
- **Named-instance assertions** (positive controls): all 7 from the brief, verbatim, all pass.
- **Identity check**: non-numeric params pass through unchanged; `formatCount` identity-tested
  directly against `'X'`/`NaN`/`undefined`/an object.

Added to `package.json`'s `test:serial` chain (inserted right after
`test_translations_fallback.js`, matching where the brief pointed) and confirmed with
`node test_test_registry.js` (no orphans/ghosts/duplicates) and `node run-tests.js --list
--lane=plain` (classified `plain`, since it never mentions "playwright").

## New test: test_results_count_render.js (browser lane, item 7)

Rendered Playwright acceptance, per the standing decision that UX items ship a rendered test,
not unit fixtures alone. Fixture-routes `/?token=USDC` to exactly 1,976 synthetic USDC pools
(all TVL ≥ $20M, comfortably above `DEFAULT_MIN_TVL`), asserts `.google-results-count` and
`.results-count` (the `showingResults` line) both render the grouped `"1,976"` form and neither
contains the bare digit run — reproducing the exact "1,976 results / 1976 pools found" defect
from the audit and proving it's gone. Added to `test:serial` right after `test_footer_contract.js`.

Timebox outcome: **completed well within the 5-minute box** — the full run (including browser
launch, fixture load, three assertions) took ~15-20 seconds. Chromium was available at
`/opt/pw-browsers/chromium`.

**Self-inflicted bug found and fixed while writing this test**: the initial settle-wait
(`page.waitForFunction`) polled for the BARE digit string `"1976"` inside
`.google-results-count`, which — once the fix is correctly applied — never appears (the comma
in `"1,976"` splits the run), so the wait always timed out even on a passing page. Fixed by
waiting for "any digit present" instead of the specific (correct-vs-buggy) form, so the settle
condition doesn't itself assume the answer under test. Left as a comment in the test file.

## Non-vacuity proof (per compiled-artifact-mutation-proof playbook)

`home.html`/`plan.html` load `translations.min.js`, never `translations.js` — confirmed via
`grep -n "translations" home.html plan.html` before mutating anything. Every mutate/restore
cycle below is therefore the THREE-step operation the playbook requires: edit source →
`node minify-assets.js` (translations.js is minified directly, no compile step) → run test →
restore → re-minify → verify md5 match.

### Proof 1 — entry-level mutation (`showingResults` EN reverted to the pre-241 diff)

Reverted `showingResults` to exactly the pre-241 line:
`showingResults: (count) => \`${count} pool${count !== 1 ? 's' : ''} found\`;`. Note: the
literal `${count}` interpolation itself was **never changed** by the 241 fix — the entry always
interpolated `count` bare; what makes it render grouped post-fix is entirely the accessor
mapping `count` to `"1,976"` BEFORE the entry runs. So "reverting to bare interpolation" is, in
this specific entry, indistinguishable from reverting my whole diff to that line — which is
exactly what I did, and it correctly re-breaks the STRING-SAFE PLURALITY predicate (the
`count !== 1` numeric comparison, always true against a string).

- Before: `translations.js` md5 `9ad2458dd7b92cf4cef51e7c2d0e6461`,
  `translations.min.js` md5 `413692f0aa7c078e830ad0030bcd3f6a`.
- `node test_translations_number_format.js` → **RED** (exit 1). Failure output:
  ```
  ✗ t_en('showingResults', 1) === '1 pool found' (pluralization regression guard)
      Expected values to be strictly equal:
  + actual - expected

  + '1 pools found'
  - '1 pool found'
  ```
  (13/14 assertions passed, 1 failed — the pluralization named-instance guard, exactly as
  designed to catch this specific regression.)
- Restored `translations.js` from a scratchpad backup (outside the repo), re-ran
  `node minify-assets.js`, verified `md5sum -c` against the pre-mutation pair → **both OK**
  (byte-identical restore). Re-ran the guard test → **GREEN** (14/14).

### Proof 2 — accessor-level mutation (the load-bearing chokepoint)

Neutered `createTranslationFunction`'s mapping: `const mappedParams = params.map(formatCount);`
→ `const mappedParams = params;` (entries themselves untouched).

- Before: same md5 pair as Proof 1's restored state (`9ad2458d...` / `413692f0...`).
- `node minify-assets.js`, then `node test_translations_number_format.js` → **RED** (exit 1).
  **240 bare-number failures across many keys** (not one) — excerpt:
  ```
  240 bare-number failure(s):
    en.showingResults [param 0] rendered a bare 1976 — expected "1,976". Output: "1976 pools found"
    en.chainYields [param 0] rendered a bare 1976 — expected "1,976". Output: "1976 DeFi Yields"
    en.tokenYields [param 0] rendered a bare 1976 — expected "1,976". Output: "Yields for 1976 on X"
    en.tokenYields [param 1] rendered a bare 1976 — expected "1,976". Output: "Yields for X on 1976"
    en.baseApyBreakdown [param 0] rendered a bare 1976 — expected "1,976". Output: "1976% Base"
    …and 235 more
  ```
  Named-instance controls for `showingResults(1976)` (EN + KO) also failed as expected;
  `showingResults(1)` still passed (the pluralization predicate itself is untouched by this
  mutation, correctly isolating the two legs). This proves the accessor mapping is the
  load-bearing mechanism, distinguishable from the entry-level plurality fix in Proof 1.
- Restored, re-minified, `md5sum -c` → **both OK**. Guard test re-ran → **GREEN** (14/14).

### Proof 3 — the same accessor mutation, observed at the RENDERED layer

Re-ran the same accessor-neuter mutation (`mappedParams = params;`) → `node minify-assets.js`
→ `node test_results_count_render.js` → **RED** (1/3 passed). Rendered output reproduced the
ORIGINAL audit defect verbatim:
```
.google-results-count: "1,976 results"
.results-count:        "1976 pools found"
```
(`.google-results-count` stays grouped because app.js's own `toLocaleString('en-US')` at
app.js:3132 is independent of translations.js — only `.results-count`, driven by
`showingResults`, regresses. This is precisely the "two inches apart" defect from the audit.)
Restored, re-minified, `md5sum -c` against the same before-pair → **both OK**. Re-ran
`test_results_count_render.js` → **GREEN** (3/3).

## Verification run log (all commands actually executed, in order)

| Command | Result |
|---|---|
| `node test_translations_number_format.js` | PASS (14/14) |
| `node test_planner.js` | PASS (208 assertions) |
| `node test_protocol_parsing.js` | PASS (9/9) |
| `node test_qualifier_fix.js` | PASS (9/9) |
| `node test_translations_fallback.js` | PASS (8/8) |
| `node test_i18n_pages.js` | PASS (19 assertions) |
| `node test_token_pages.js` | PASS (100 assertions) |
| `node test_chain_pages.js` | PASS (91 assertions) |
| `node test_hub_pages.js` | PASS (42 assertions) |
| `node test_footer_contract.js` | PASS (9/9) |
| `node test_results_count_render.js` | PASS (3/3), ~15-20s, well inside the 5-min box |
| `node test_compiled_assets.js` | PASS (4/4) |
| `node test_minified_assets.js` | PASS (9/9) |
| `node test_min_asset_boot.js` | PASS (18/18) |
| `node test_test_registry.js` | PASS (5/5) — no orphans/ghosts for the 2 new test files |
| `node run-tests.js --lane=plain` | **completed**, PASS 52 / FAIL 0 / TIMEOUT 0, ~80s total, well inside 5 min |
| `node test_pool_detail_anomaly_projection.js` (extra, not in the required list — run because I touched `PoolDetail.js`) | PASS (11/11) |
| `node test_projection_lead.js` (extra, same reason) | PASS (7/7) |
| `node test_ko_pool_money_honesty.js` (extra, same reason) | PASS (8/8) |
| `node test_pool_twin_parity.js` (extra, touched `generate-pool-pages.js`) | 24/36 — see below |

`test_pool_twin_parity.js`'s 12 failures are **all** the same pre-existing, unrelated cause:
`console.error: Failed to load resource: the server responded with a status of 404 (Not Found)
(http://localhost:8862/data/pools-snapshot-meta.json)`. Every "render+parity" assertion (the
one that actually checks rendered $/APY/TVL numbers — the thing this diff could plausibly
break) **passed** for all 6 pools tested; only the separate "zero page errors" assertion failed,
on a 404 for a file (`data/pools-snapshot-meta.json`) that exists on disk but 404s from this
test's own local HTTP server — unrelated to translations/money formatting, and not a file this
diff touches. Not in the required verification list; flagged here rather than silently
ignored, per the honesty requirement.

## Deviations from the brief (summary)

1. **Bare-digit check is probe-scoped, not a blanket `/\d{4,}/` scan** — see the
   test-file section above. Required because of the pre-existing static `1000`
   (APY_SANITY_LIMIT) literal in `tcpAnswer`/`tcpFaqA2`/`tcpFaqA3`, which would false-positive
   a blanket scan on every invocation regardless of the fix.
2. **PoolDetail.js / generate-pool-pages.js / 10 translations.js entries changed beyond the
   literal brief** — required to prevent a real `$NaN` / wrong-decimal-precision regression
   the accessor-chokepoint design would otherwise introduce on two live production surfaces
   (the pool-detail calculator, the static pool-page markdown twins). Full rationale and
   verification above.
3. Everything else (formatCount definition/placement/export, `t()`/`makeT()` wiring, the 10
   pluralization-predicate fixes, the population/allowlist/mirror-guard/named-instance test
   shape, the `test:serial` insertion points) implemented exactly as specified.

## Class-rule question: "if this defect appeared in a different member of the same population
tomorrow, would anything catch it?"

**Yes — with a number: any of the 306 flattened function-valued dictionary entries** (existing
or newly added, at any parameter position) that renders a raw number bare instead of grouped
would be caught by `test_translations_number_format.js`'s sweep (assertion "every
function-valued entry renders the probe grouped…", currently exercising 496 invocations) — it
enumerates the population fresh on every run (not a hardcoded list), so a brand-new key with a
numeric param is automatically included with no test-file edit required. The only way a new
entry could evade it is by (a) living in a THIRD nested subtree this walk doesn't yet know
about (it recurses into any object-valued key, so this would have to be a genuinely new nesting
shape) or (b) being read through a THIRD accessor that bypasses both
`createTranslationFunction` and `makeT` (as `.landing.returnStatus` already does, by design,
because it's never handed a raw number) — case (b) is exactly the landing.js audit above, and a
future landing entry that starts receiving raw numbers would need the same audit repeated, not
automatically caught by this guard. That's the honest boundary of "yes, with a number": **306
of 306 covered entries are caught automatically; 2 of 306 (the `.landing` entries) are covered
only by a manual audit, not by the automated sweep, because they're intentionally outside both
accessors' scope.**
