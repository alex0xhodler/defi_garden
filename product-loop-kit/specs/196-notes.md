# 196 — build notes

## Change made

`audit-app.js`, `package.json`, and a new `test_audit_static_rotation.js` only.

1. Factored the `{cycle, seen}` validate/default logic out of `readRotationState()` into a new
   shared helper, `normalizeRotationLeg(leg)` (placed directly above `readRotationState()`, next
   to `computeRotation()`). `readRotationState()` now calls it and returns exactly what it always
   did (external contract, exported and used by tests, unchanged — verified by reasoning: the old
   inline check `parsed && typeof parsed==='object' && Array.isArray(parsed.seen)` degrading to
   fresh state otherwise is *exactly* what `normalizeRotationLeg()` does internally).
2. Added `readStaticRotationState(statePath)` next to it — the static leg's counterpart, reading
   `{ schemaVersion, tokens: {cycle, seen}, chains: {cycle, seen} }` and normalizing **each leg
   independently** via the same shared helper, so a corrupt `chains` leg can never take down a
   valid `tokens` leg or vice versa. Degrades to a fresh cycle-0/empty-seen state for whichever
   leg(s) are malformed — missing file, corrupt JSON, `{}`, `{tokens: 5}`,
   `{tokens: {seen: "nope"}}` — never throws.
3. Added two constants beside their pool-leg siblings: `DEFAULT_STATIC_ROTATION_STATE_PATH`
   (`product-loop-kit/signals/audit-static-rotation.json`, beside `DEFAULT_ROTATION_STATE_PATH`)
   and `STATIC_ROTATION_SEEN_CAP = 6000` (beside `ROTATION_SEEN_CAP`, with a comment explaining
   *why* it isn't just `ROTATION_SEEN_CAP` reused — the token estate alone, ~2,107 candidates, is
   already larger than that 2000 cap).
4. Rewrote the uniform-rotation tail of `buildStaticSurfaces()`: the two `sampleBySeed(...)` calls
   that used to pick tokens/chains directly are now two `computeRotation(candidates, count,
   \`${seed}:tokens\`/\`:chains\`, priorState.tokens/.chains)` calls — `computeRotation()` itself is
   untouched, called exactly as 183 already calls it for pools, just twice. The seed namespacing
   (`${seed}:tokens`, `${seed}:chains`) is the pre-existing convention, unchanged in string shape.
   Everything rendered this tick — the anchor leaf, every prescan-promoted leaf (routed to its leg
   by `tokens/`/`chains/` path prefix), and every rotation pick — is folded into the appropriate
   leg's `seen`, capped at `STATIC_ROTATION_SEEN_CAP`, mirroring `buildPoolSurfaces()`'s
   `thisRunPoolIds` rule exactly.
5. `buildStaticSurfaces()`'s return object is **extended**, never reshaped: added
   `staticRotation` (`{tokens, chains}`, each `{cycle, seenCount, candidateCount, picked, wrapped,
   sampleSize}`), `staticRotationState` (the object to persist, `null` in override mode), and
   `staticRotationStatePath`. The `AUDIT_STATIC_PAGES` override branch is untouched apart from
   also returning the same three fields in their disabled/zero shape (`emptyStaticRotationLegResult()`,
   mirroring `emptyPoolRotationResult()`) so callers never have to null-check — no state is read
   or written in that branch, proved directly in `test_audit_static_rotation.js`'s criterion 9 by
   passing a bogus, would-throw-if-touched `staticRotationStatePath` and a poisoned
   `staticRotationState` alongside an override and showing the output is byte-identical either way.
6. `runAudit()`: threaded `opts.staticRotationStatePath`/`opts.staticRotationState` through (both
   already flow automatically — `buildStaticSurfaces()` is called with `Object.assign({}, opts,
   {...})`, unlike the pool leg's explicit-allowlist call, so no change was needed there beyond
   the new opts existing). Added `staticRotation: staticResult.staticRotation` to the result object,
   right next to `poolRotation`. Added a **second, symmetric persist block** right after the
   existing pool-rotation one, same gate (`opts.persistRotationState`, CLI-only), same
   write-only-if-bytes-differ rule. Added one CLI summary line, `[audit] static rotation: tokens
   cycle … | chains cycle …`, mirroring `[audit] pool rotation: …` immediately above it.
7. `module.exports` gained `STATIC_ROTATION_SEEN_CAP` and `readStaticRotationState` (mirrors the
   existing `ROTATION_SEEN_CAP`/`readRotationState` exports, for the same reason: tests need to
   assert the cap-vs-real-population invariant and drive the degrade-never-throws reader directly).
8. `package.json`'s `test:serial` chain: inserted `node test_audit_static_rotation.js` immediately
   after `node test_audit_pool_prescan.js` and before `node test_audit_cta_provenance.js` — its
   nearest sibling in subject matter (183's rotation machinery) — single-line format preserved.

## Deviations from the spec / conservative choices

- **Criterion 10's literal "≥ 1,080 distinct token pages" is arithmetically unreachable and was
  not asserted as written.** The static leg's 2:1 split gives exactly 4 token picks/tick
  (`DEFAULT_STATIC_SAMPLE=6`, unchanged — raising it is explicitly out of scope per the spec's own
  "Change" section). A 180-day simulation at 4 picks/tick can never produce more than 4×180=720
  distinct token renders — there are only 720 render *slots* in the whole window. 1,080 = 6×180,
  i.e. the **combined** tokens+chains per-tick budget, not a token-only figure, and it doesn't
  match the criterion's own "token pages" wording or its "zero re-renders" qualifier (which the
  criterion text itself only ever attaches to chains). I ran the real 180-day simulation against
  the built code (`buildStaticSurfaces({staticSeed, prescan:false})`, threading
  `staticRotationState` tick to tick, exactly the rig spec 196's own evidence section used) and
  asserted the **true, derived ceiling** instead: exactly 720 distinct token pages, **zero**
  re-renders (population 2,107 ≫ 720 total picks, so no wrap is even possible in this window) —
  a decisive result on its own terms (recovers all 101 of origin/main's measured re-renders as
  newly-distinct coverage, on top of the pre-existing 619). This is stated as a real deviation, not
  hidden by loosening the assertion to something vacuous.
- **Criterion 10's chain requirement ("zero chain re-renders before the wrap") needed one small,
  principled correction, not a loosening.** `computeRotation()` — reused **verbatim**, per the
  spec's own "invent nothing" instruction — has a documented "fill from seen once unseen is
  exhausted" branch (183's own design, for when candidates aren't picked evenly). 87 chain
  candidates at 2/tick leaves a remainder of 1, so the tick that completes first full coverage
  necessarily fills its last slot from an already-seen candidate — one tick *before* `wrapped`
  itself flips true (wrapped only fires once unseen is fully empty at a tick's *start*). This is
  a real, correct, pre-existing property of the exact machinery this item is required to reuse,
  not a defect it introduces. The test computes the expected forced-repeat count dynamically from
  the real `candidateCount % sampleSize` (not hardcoded — self-corrects to 0 if the estate size or
  split ever makes it divide evenly) and asserts full coverage is reached with *exactly* that many
  repeats, no more.
- **No `baseSeen` reconciliation ported from 192, per the spec's own explicit instruction** — the
  static leg has no time-budget-skip path (`AUDIT_TIME_BUDGET_MS` gates the pool-detail
  `rotationPick` render loop only), so every rotation pick this function computes really does get
  rendered and crediting it as `seen` at build time is already honest. Commented at the call site
  with the precondition, per the spec's request, so a future time-budget guard on the static leg
  would know to add it back.
- **`buildStaticSurfaces()`'s existing `Object.assign({}, opts, {...})` call convention (vs.
  `buildPoolSurfaces()`'s explicit allowlist) was left as-is.** This meant `opts.staticRotationStatePath`
  / `opts.staticRotationState` flow into `buildStaticSurfaces()` from `runAudit()`'s `opts` with zero
  changes to the call site — noted here because it's an asymmetry between the two builder functions
  that predates this item and wasn't introduced by it.
- **Test criterion 6 (anchor + promoted leaves land in `seen`) is a pure-fs test, no Chromium
  render** — promotion and seen-recording both happen entirely inside `buildStaticSurfaces()`
  before any page is ever rendered, so driving it directly (with a real probe file written into
  `tokens/`, sized via the same guarantee-not-luck trick `test_audit_prescan.js` already uses, then
  removed in a `finally`) proves the mechanism without paying for a browser launch. This mirrors
  the spec's own instruction ("driving `buildStaticSurfaces()` as a pure function with injected
  state") more literally than a full `runAudit()` render would.
- **The two `runAudit()`-level tests for criterion 7** (library calls never write) intentionally
  cover two things separately: (a) the literal committed path
  (`product-loop-kit/signals/audit-static-rotation.json`) is untouched by a plain library call
  (existence/byte-identity before vs. after — matches the spec's literal wording), and (b) an
  explicit temp `staticRotationStatePath` also never gets created without `persistRotationState`
  (proves the gate, not just the specific file). The persisting/no-op test uses the exact same
  `AUDIT_STATIC_SAMPLE='0'` (env-string, not `opts.staticSample:0`) falsy-zero-trap workaround
  `test_audit_cta_provenance.js`'s own `AUDIT_POOL_SAMPLE=0` no-op test documents, for the same
  reason — and always pairs a temp `staticRotationStatePath` with a temp `rotationStatePath` when
  `persistRotationState:true`, so the pool leg's own committed `audit-rotation.json` is never
  touched by a test that only cares about the static leg.

## Things not verified / not run

- The full ~130-file `test:serial`/`npm test` suite was **not** run in full — only the six files
  the build instructions named (`test_audit_static_rotation.js`, `test_seo_surface_audit.js`,
  `test_audit_prescan.js`, `test_audit_pool_prescan.js`, `test_audit_app.js`, `test_run_tests.js`),
  per the task's explicit timebox instruction.
- The browser lane classification (`run-tests.js`'s transitive-require scan) will place
  `test_audit_static_rotation.js` in the `browser` lane (it requires `./audit-app.js`, which
  mentions "playwright") even though most of its assertions are pure-fs — this is the same
  pre-existing classification `test_seo_surface_audit.js`/`test_audit_prescan.js` already get, not
  something this item changes or needed to special-case.
- Did not attempt to simulate a *combined* multi-thousand-day horizon to observe the token leg's
  own eventual wrap (~527 days per the spec's own estimate) — out of scope for the 180-day
  criterion 10 window, and criterion 4's wrap contract is already proven directly (both legs) via
  injected already-fully-seen state, independent of any long simulation.

## Test results (exact commands run)

All run from `/home/user/defi_garden`, in order.

```
timeout 280 node test_audit_static_rotation.js   # NEW — 13/13 passed
timeout 280 node test_seo_surface_audit.js       # 8/8 passed
timeout 280 node test_audit_prescan.js           # 48/48 passed
timeout 280 node test_audit_pool_prescan.js      # 14/14 passed
timeout 280 node test_audit_app.js               # 3/3 passed
timeout 280 node test_run_tests.js               # 26/26 passed
```

No failures to explain away — everything green on the first clean run after the fix described
above for criterion 10's chain fill-repeat count.

## Non-vacuity (criterion 13) — exact evidence

`git stash push --keep-index -- audit-app.js` (stashes only `audit-app.js`'s modifications,
leaving `package.json`'s change and the new, untracked `test_audit_static_rotation.js` in place),
then `timeout 280 node test_audit_static_rotation.js` against the now-reverted-to-`origin/main`
`audit-app.js`. Exact observed output:

```
  ✗ criterion 1 (tokens): a real leaf marked seen is never re-picked while unseen leaves remain, across 6 different seeds
    Cannot read properties of undefined (reading 'tokens')
  ✗ criterion 1 (chains): a real leaf marked seen is never re-picked while unseen leaves remain, across 6 different seeds
    Cannot read properties of undefined (reading 'chains')
  ✗ criterion 2: default run yields 4 token + 2 chain surfaces plus the anchor (still named static-page, still first)
    Cannot read properties of undefined (reading 'tokens')
  ✗ criterion 3: same seed + same prior state -> identical picks; a different seed -> different picks
    Cannot read properties of undefined (reading 'tokens')
  ✗ criterion 4: wrap — every candidate already seen -> wrapped=true, cycle+1, seen resets to just this run's picks, next cycle starts fresh
    Cannot read properties of undefined (reading 'tokens')
  ✗ criterion 5: STATIC_ROTATION_SEEN_CAP exceeds the REAL combined tokens+chains leaf count (read from disk, not hardcoded)
    STATIC_ROTATION_SEEN_CAP (undefined) must exceed the real combined tokens+chains leaf count (2195 = 2108 tokens + 87 chains) or the wrap branch for whichever leg hits the cap first can never fire on real data — raise the cap before this ships.
  ✗ criterion 6: a prescan-promoted leaf AND the anchor leaf both land in tokens.seen even though rotation never picked them
    Cannot read properties of undefined (reading 'tokens')
  ✓ criterion 7a: runAudit() library call (no persistRotationState) leaves the COMMITTED audit-static-rotation.json untouched
  ✓ criterion 7b: runAudit() library call with an explicit (temp) staticRotationStatePath still never writes it without persistRotationState
  ✗ runAudit({persistRotationState:true}) writes the static-rotation state, and a genuine no-op second run produces byte-identical bytes
    expected the static-rotation state file to exist after a persisting run
  ✗ criterion 8: missing file, corrupt JSON, {}, {tokens:5}, {tokens:{seen:"nope"}} all degrade to a fresh cycle-0 state and a normal pick, never throw
    Cannot read properties of undefined (reading 'tokens')
  ✗ criterion 9: AUDIT_STATIC_PAGES override — surfaces verbatim, rotation off (disabled shape), no state read/written, unaffected by rotation opts
    expected staticRotationState === null in override mode (nothing to persist), got undefined
  ✗ criterion 10: 180-day simulation — zero token re-renders (720 distinct, the true ceiling at 4/tick); chains reach full coverage with only the mathematically-forced fill-repeat before the wrap
    Cannot read properties of undefined (reading 'tokens')

test_audit_static_rotation.js: 2 passed, 11 failed
```

Criterion 1 (and 9 of the other 12 assertions) go RED as required — the two that stay green
(7a/7b, "never writes without persisting") are correctly insensitive to this item's own change,
since "a library call doesn't write a file" is true whether or not the feature exists at all; they
are not evidence this item did nothing, just correctly-scoped assertions.

`git stash pop` restored the diff. Verified byte-exact via `git diff --stat` immediately after:
`audit-app.js | 209 ++++++++++++++++++++++++++++++++++++++++++++++++++++++-----` /
`package.json | 2 +-`, `2 files changed, 193 insertions(+), 18 deletions(-)` — identical to the
diff stat immediately before the stash, and `test_audit_static_rotation.js` re-run green (13/13)
again afterward.

## Criterion 11 — real end-to-end CLI run

Backed up the two tracked signal files (`audit-findings.json`, `audit-rotation.json`) first, then
ran `timeout 280 node audit-app.js` for real (full render: all app surfaces + pool-detail rotation
+ static rotation, real Chromium). Result: `status: "OK"`, `1 finding, 0 blocking` (the pre-existing
known auto-downgraded finding, unrelated to this item), and:

```
[audit] static rotation: tokens cycle 0, seen 5/2107 candidates, picked [tokens/gtusdccore.html, tokens/pork.html, tokens/usda.html, tokens/ban.html], wrapped=false | chains cycle 0, seen 2/87 candidates, picked [chains/solana.html, chains/ethereum.html], wrapped=false
```

`product-loop-kit/signals/audit-static-rotation.json` was written with non-empty `tokens.seen`
(5 entries: the anchor + 4 picks) and `chains.seen` (2 entries: the 2 picks, no anchor — the
anchor is a token page). `staticRotation` appeared in the findings JSON alongside `poolRotation`,
matching the shape shown above. After confirming this, the two tracked signal files were restored
from their backups and the newly-created `audit-static-rotation.json` was deleted, per the task's
testing-discipline instruction — `git status --porcelain` at the end shows only the intended diff.

## Final `git status --porcelain`

```
 M audit-app.js
 M package.json
?? product-loop-kit/specs/196.md
?? test_audit_static_rotation.js
```

## Residuals

- None deliberately left inside spec's stated scope, beyond the two documented, principled
  corrections to criterion 10's literal numbers above (both make the assertion *stronger* against
  the real, achievable behavior of the reused machinery, not weaker).
