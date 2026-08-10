# Backlog 257 — build notes

## Summary of changes

- **`app.js`**, `handleCalculateYield` (the `.calculate-yield-btn-new` handler):
  added one `Analytics.trackPoolView(pool, { source: 'yield_calculator', ... })`
  call, mirroring `handlePoolClick`'s existing `trackPoolView` call (context
  keys `search_query`, `selected_chain`, `selected_token`,
  `protocolCtaPresent`) and including the `urlDirectPoolViewFiredRef.current =
  pool.pool;` line — see "Judgment call: the ref" below. The pre-existing
  `Analytics.trackPoolClick(pool, 'yield_calculator')` call and the rest of the
  handler (`setDetailPool`, `setCurrentView`, `setSearchInput`, `scrollTo`) are
  untouched. Net: 16 lines added, 0 removed, 0 lines of the two pre-existing
  emit sites (`app.js:1332` `url_direct`, `app.js:2670` `card_click`) touched.
- **`app.compiled.js`, `app.compiled.min.js`**: regenerated via `npm run
  compile && npm run minify` (source-derived, not hand-edited — CLAUDE.md/
  compile-app.js's own header rule). `test_compiled_assets.js` and
  `test_minified_assets.js` both assert byte-identity against a *fresh*
  compile/minify of the current source, so this step is self-verifying, not
  a one-time action that could silently drift.
- **New test `test_pool_view_transition_parity.js`** (plain lane, no
  browser): parses `app.js` at test time, derives the transition-site set
  (`setCurrentView('pool-detail')`) and the emit-site set
  (`Analytics.trackPoolView(`), attributes each occurrence to its nearest
  enclosing NAMED function via a hand-rolled scrub + brace-depth walk
  (documented in the file's own header comment — no AST library dependency;
  `acorn` is present only transitively via `terser` and is not declared in
  `package.json`, so I did not reach for it), and asserts set-equality both
  directions. Includes the required self-defeat sub-check (mutates an
  in-memory copy with the new call surgically removed, asserts the same
  analyzer reports the gap) and the `handleCalculateYield` exactly-one-of-each
  assertion.
- **New test `test_pool_view_calculator_path.js`** (browser lane,
  Playwright, port 8979 — 8978 was the prior max in-repo): loads the
  analytics grid via the fixture-routed/snapshot-404'd pattern, clicks
  `.calculate-yield-btn-new`, spies at `Analytics.track` (the delivered
  boundary — see the file's header for why, mirroring
  `test_northstar_cta_fires.js`/the 214 addendum), and asserts exactly one
  `pool_view{source:'yield_calculator', pool_id, pool_project, pool_chain,
  total_apy}` and exactly one `pool_click{source, click_type:
  'yield_calculator'}`, plus that `.pool-detail-view` actually rendered.
- **`package.json`**: both new files appended to `test:serial`, placed
  immediately after `test_northstar_cta_fires.js` (same neighborhood as the
  other north-star/pool-detail-transition tests they're paired with).

## Verification note discovered before any code was written

Running any test locally required `npm ci` first — `node_modules` did not
exist in the working tree at session start (a fresh-checkout sandbox, not a
repo problem). Recorded here because it's a precondition for reproducing any
of the runs below, not a defect.

## Deviations from the spec, and why

1. **Attribution method: hand-rolled scanner, not an AST parser.** The spec's
   step 2 explicitly offers "a robust-enough attribution" via brace-depth
   walk as one acceptable option, so this isn't a deviation in the strict
   sense — flagging the choice anyway. `acorn` is reachable via
   `require('acorn')` in this repo (a transitive dependency of `terser`), but
   it is not a declared dependency in `package.json`, and no other test file
   in the repo depends on an undeclared transitive package. Depending on it
   would be one `npm update` away from breaking every future run of this
   test for a reason that has nothing to do with spec 257. The hand-rolled
   scrubber + brace-depth walk is ~100 lines, documented inline, and its own
   self-defeat check proves it isn't vacuous — judged sufficient.

2. **Scrubber does NOT blank single/double-quoted string literals** (it does
   blank line comments, block comments, and template-literal bodies). First
   version blanked all strings uniformly, matching the "keep braces inside
   strings from corrupting the depth count" goal — but that also blanked
   away `'pool-detail'` inside `setCurrentView('pool-detail')`, which is
   itself the literal text under search, and the test's first run found 0
   transition sites where grep finds 3. Fixed by leaving single/double-quoted
   string *contents* un-scrubbed (the scanner still walks past them
   correctly, just doesn't replace them with spaces) — safe here because a
   one-off scan (recorded in the test's header comment) confirmed app.js has
   zero single/double-quoted string literals containing a `{`/`}` byte or the
   substrings "trackPoolView"/"setCurrentView". This assumption is stated
   explicitly in the test file, not hidden; if it ever stops holding the
   analyzer would need a real tokenizer.

3. **`source: 'yield_calculator'` reuses the `pool_click` vocabulary**, per
   the spec's own stated judgment call (Open questions section) — not an
   independent decision, just confirming it was followed rather than
   silently reconsidered.

## Finding: `urlDirectPoolViewFiredRef`'s purpose (per spec instruction, "if
and only if you verify...")

Read `app.js:1280-1340` (the `?pool=` url_direct resolver effect and its
paired settle-gated emit effect) plus the ref's own declaration comment
(`app.js:887`: *"pool id already tracked as a url_direct landing, prevents
double-fire vs card click"*).

**Confirmed purpose**: the url_direct resolver effect
(`app.js:1280-1320`) only *parks* a pool for the deferred `pool_view` emit
when `urlDirectPoolViewFiredRef.current !== foundPool.pool` — a once-per-pool
guard against that effect re-parking/re-firing for the same pool id.
`handlePoolClick` sets the ref to the clicked pool's id *before* its own
`trackPoolView` call, so that if the url_direct effect's dependency array
(`[pools, detailPool, currentView]`) were ever to re-run while the URL still
carried a matching `?pool=` id (e.g. a future change that starts writing
`?pool=` earlier, or a re-render ordering change), it would not double-park
the same pool for a second emit.

**Structural note (recorded, not acted on beyond following the spec's
instruction to mirror it):** tracing the actual current code paths, this
guard is not load-bearing for either `handlePoolClick` or
`handleCalculateYield` today — in both cases the url_direct effect's own
`!detailPool` gate already blocks re-entry immediately after
`setDetailPool`/`setCurrentView` run, before the ref would ever be consulted;
and `handleCalculateYield` additionally never calls `window.history.pushState`
to write `?pool=` into the URL at all (unlike `handlePoolClick`), so the
url_direct effect's `urlParams.pool` match can't fire for a
calculator-entered pool regardless of the ref. Set it anyway, matching
`handlePoolClick` exactly: the spec instruction was framed as "if you
confirm the ref's purpose, include the line" (confirmed above), it costs
nothing, and it defends against a category of double-fire risk that a future
change to `handleCalculateYield` (e.g. adding a `pushState` to keep the URL
in sync, which would make it behave more like `handlePoolClick`) could
otherwise reintroduce silently.

## Non-vacuity proof (spec-required, acceptance criterion "Non-vacuity")

Procedure: (a) remove the new `Analytics.trackPoolView(...)` call and its
surrounding comment from `handleCalculateYield` in `app.js`; (b) recompile/
reminify; (c) run both new tests, expect RED; (d) `git status`/`md5sum`
confirmed the *pre-deletion* `app.js`/`app.compiled.js`/`app.compiled.min.js`
were captured first; restore by re-applying the identical edit (this
sandbox's working tree had no prior commit of the fix to `git checkout --`
back to, so restoration was "reproduce the exact prior edit," verified
byte-identical via `md5sum` before vs. after — see transcript); (e) recompile/
reminify; (f) run both tests again, expect GREEN.

`md5sum` before deletion vs. after restoration (`app.js`, `app.compiled.js`,
`app.compiled.min.js`) — **identical**:

```
c0f2d858dc37d84a7f463ad863de5dc4  app.js
de98ae1311e0a4d8bf0b7dcbcad25901  app.compiled.js
92190a3c558720ee325f679babd396bc  app.compiled.min.js
```

### RED run (call removed)

```
=== test_pool_view_transition_parity.js (RED expected) ===
test_pool_view_transition_parity.js — spec 257 guard: transition sites vs. pool_view emit sites

  ✗ grep-equivalent counts: setCurrentView('pool-detail') and Analytics.trackPoolView( occur equally often in app.js
    expected equal counts, got 3 transition site(s) and 2 emit site(s)

3 !== 2

  ✗ set-equality both directions: every transition-site owner has a paired emit-site owner, and vice versa
    owner(s) that transition into pool-detail but have NO trackPoolView emit in their own body: handleCalculateYield
  ✗ handleCalculateYield fires exactly one trackPoolView( and exactly one trackPoolClick( — no double-fire
    expected exactly 1 trackPoolView( in handleCalculateYield, got 0

0 !== 1

  ✗ SELF-DEFEAT: with the spec-257 trackPoolView call surgically removed in memory, the analyzer REPORTS the gap
    self-defeat setup: marker "source: 'yield_calculator'" not found in app.js — did the spec-257 emit move or get renamed?

test_pool_view_transition_parity.js: 0/4 tests passed
exit=1

=== test_pool_view_calculator_path.js (RED expected) ===
  ✓ clicking .calculate-yield-btn-new renders .pool-detail-view (not a no-op)
  ✗ the calculator path fires exactly one pool_view(source=yield_calculator) with full segmentation props
    expected exactly one pool_view, got []
  ✓ the calculator path fires exactly one pool_click(source=yield_calculator, click_type=yield_calculator)
  ✗ pool_view fired exactly once total (no double-fire against the static leg)
    expected exactly one pool_view across the whole interaction, got 0: []
  ✓ no unexpected page/console errors
test_pool_view_calculator_path.js: 3/5 tests passed
exit=1
```

Note on the plain-lane test's own self-defeat sub-check going RED-on-RED
here (rather than reporting the gap): with the call genuinely absent from
real source, the sub-check's own setup precondition (find the unique
`source: 'yield_calculator'` marker to know *where* to surgically remove
from) correctly cannot locate anything to remove — an honest failure that
still proves the point (there is no emit to find), not a bug in the
self-defeat logic. The three assertions above it already demonstrate the
gap directly.

### GREEN run (call restored, byte-identical)

```
=== test_pool_view_transition_parity.js (GREEN expected) ===
test_pool_view_transition_parity.js — spec 257 guard: transition sites vs. pool_view emit sites

    (found 3 of each, at this tick)
  ✓ grep-equivalent counts: setCurrentView('pool-detail') and Analytics.trackPoolView( occur equally often in app.js
    owners: App, handleCalculateYield, handlePoolClick
    transition sites -> owners: L1293:App, L2683:handlePoolClick, L2803:handleCalculateYield
    emit sites -> owners: L1332:App, L2670:handlePoolClick, L2793:handleCalculateYield
  ✓ set-equality both directions: every transition-site owner has a paired emit-site owner, and vice versa
  ✓ handleCalculateYield fires exactly one trackPoolView( and exactly one trackPoolClick( — no double-fire
    confirmed RED on mutated source: missing-emit owner(s) = [handleCalculateYield]
  ✓ SELF-DEFEAT: with the spec-257 trackPoolView call surgically removed in memory, the analyzer REPORTS the gap

test_pool_view_transition_parity.js: 4/4 tests passed
exit=0

=== test_pool_view_calculator_path.js (GREEN expected) ===
  ✓ clicking .calculate-yield-btn-new renders .pool-detail-view (not a no-op)
  ✓ the calculator path fires exactly one pool_view(source=yield_calculator) with full segmentation props
  ✓ the calculator path fires exactly one pool_click(source=yield_calculator, click_type=yield_calculator)
  ✓ pool_view fired exactly once total (no double-fire against the static leg)
  ✓ no unexpected page/console errors
test_pool_view_calculator_path.js: 5/5 tests passed
exit=0
```

## Other tests run against the final (restored/GREEN) state

All green, all timeboxed under 300s:

- `test_pool_view_transition_parity.js` — 4/4
- `test_pool_view_calculator_path.js` — 5/5
- `test_northstar_cta_fires.js` — 12/12 (confirms the `url_direct` and
  `card_click` payloads — segmentation props, sources, CTA behavior — are
  unaffected)
- `test_analytics_fires.js` — 1/1
- `test_test_registry.js` — 5/5 (confirms both new files are correctly
  registered in `test:serial`, no orphans/ghosts/duplicates)
- `test_run_tests.js` — 26/26
- `test_compiled_assets.js` — 4/4 (confirms `app.compiled.js` matches a
  fresh compile of the final `app.js`)
- `test_minified_assets.js` — 9/9 (confirms `app.compiled.min.js` and the
  other minified artifacts match fresh minifies of their sources)
- `test_css_minified_render.js` — 2/2

Lane check: `node run-tests.js --list --lane=plain` places
`test_pool_view_transition_parity.js` in the plain lane;
`node run-tests.js --list --lane=browser` places
`test_pool_view_calculator_path.js` in the browser lane — both as intended
(the parity test never imports/mentions playwright; the calculator-path test
does).

**Not run** (per the operator's explicit timebox instructions —
`test_search.js` only "if time permits," and it wasn't spent here since the
required list was already fully green): `test_search.js`. No other test in
the required list was skipped.

## Honest answer to the spec's "Class closed?" question

The spec itself already answers this (`specs/257.md`, "Class closed by this
item:") and this build did not change that answer: **yes for pool-detail,
no for the general case.** This item closes the transition-vs-emission gap
for `currentView === 'pool-detail'` specifically, with a test that re-derives
both sets from source every run (so a fourth `setCurrentView('pool-detail')`
site added later fails the gate honestly, without anyone needing to remember
this playbook entry). It does **not** generalize to any other tracked view
(`plan-bloom`, the planner steps, etc.) — those would need their own
transition-set/emit-set pair and their own set-equality test; none of that
exists after this item, and none was added, per the spec's explicit
out-of-scope list. If a future item wants that guarantee for another view,
it should file a new backlog item rather than assume this one covers it.

## Note on the mid-build checkpoint commit

Commit `b0ea8eb4cf` ("wip(257): pool_view on the third pool-detail entry path
(build agent in flight)") on `claude/loop-257` captured the `app.js` edit,
both new test files, and the `package.json` registration part-way through the
build. It was made by the **operator**, not by the build agent (which
correctly ran no `git commit`) and not by harness auto-checkpointing: a
session stop-hook requires a clean tree, and the container is ephemeral, so
the in-flight work was checkpointed and pushed rather than risked. The branch
squash-merges, so the single-commit-per-item rule (NORTH_STAR 2026-07-13) is
preserved at the destination on `main`.

The build agent's own report mis-attributed this commit to harness
auto-checkpointing; corrected here so the record is accurate.
