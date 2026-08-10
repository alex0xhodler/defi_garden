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

## Finding: `urlDirectPoolViewFiredRef`'s purpose (per the operator's build
brief, "if and only if you verify..." — NOT per `specs/257.md`, which
contains no such instruction; see correction below)

**Provenance correction (Attempt 2):** the section title originally
attributed the "if and only if you verify the ref's purpose, include the
line" instruction to the spec. The verifier checked `specs/257.md` and
confirmed it contains no such instruction — that framing came from the
operator's build brief for this session, not from the spec document. The
finding itself is sound and was behaviorally verified (see below); only the
attribution of where the instruction came from was wrong. Corrected here;
the analysis is unchanged.

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

**Structural note (recorded, not acted on beyond following the build
brief's instruction to mirror it):** tracing the actual current code paths, this
guard is not load-bearing for either `handlePoolClick` or
`handleCalculateYield` today — in both cases the url_direct effect's own
`!detailPool` gate already blocks re-entry immediately after
`setDetailPool`/`setCurrentView` run, before the ref would ever be consulted;
and `handleCalculateYield` additionally never calls `window.history.pushState`
to write `?pool=` into the URL at all (unlike `handlePoolClick`), so the
url_direct effect's `urlParams.pool` match can't fire for a
calculator-entered pool regardless of the ref. Set it anyway, matching
`handlePoolClick` exactly: the build brief's instruction was framed as "if you
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

## Attempt 2 — verifier FAIL and what changed

The verifier FAILed the Attempt 1 build on two blocking items.

### FAILURE 1 (P1) — the gate was blind to quote-style variants

The spec's population criterion requires "a fourth entry path added tomorrow
must fail the gate." The verifier mutated `app.js` three ways to test this
and found the gate blind to one of them:

- **Variant A** — a new named function, `setCurrentView('pool-detail')`
  (single-quoted), no paired emit → correctly caught, RED 2/4.
- **Variant B** — a fourth transition added *inside `App`'s existing
  anonymous effect*, no paired emit → caught, but only by the plain COUNT
  assertion — set-equality alone passed, because the extra transition
  attributes to `App`, which already owns an emit.
- **Variant C** — a new named function, `setCurrentView("pool-detail")`
  (**double**-quoted), no paired emit → **GREEN, 4/4, exit=0 — MISSED.**

Root cause: `TRANSITION_TEXT = "setCurrentView('pool-detail')"` and
`EMIT_TEXT = 'Analytics.trackPoolView('` were fixed-spelling
`String.prototype.indexOf` scans. Any quote-style or whitespace variant was
invisible to them. The repo enforces no quote-style convention (no eslint/
prettier/editorconfig), and `app.js` already mixes single- and
double-quoted literals (e.g. `= "All"`), so this was a live gap, not a
theoretical one.

**Fix applied** (test file only — `app.js` untouched, confirmed correct by
the verifier):

1. `TRANSITION_TEXT`/`findAllIndices` replaced by the regex
   `/setCurrentView\s*\(\s*(['"])pool-detail\1\s*\)/g` over the scrubbed
   source.
2. `EMIT_TEXT` replaced by `/\btrackPoolView\s*\(/g` — drops the mandatory
   `Analytics.` prefix and the fixed-spacing assumption. Explicitly
   verified (new test) that the `// … trackPoolView call …` comment near
   `app.js:2788` does not inflate the count under the looser regex — it
   cannot, because `scrub()` blanks comments before either regex runs.
3. The self-defeat sub-check's `source: 'yield_calculator'` marker lookup
   is now the equivalent quote-/whitespace-tolerant regex, for the same
   reason.
4. Two permanent regression tests added: an in-memory-only variant A
   (single-quoted) and variant C (double-quoted) mutated copy of `app.js`
   (a new named function with an un-paired transition, never written to
   disk), each asserted caught by the analyzer. The variant-C test also
   re-runs the frozen pre-fix scan (`legacyCountTransitions`, a verbatim
   copy of the old `TRANSITION_TEXT`/`indexOf` logic) against the same
   mutation and asserts it stays unchanged (3→3) — proving the regression
   case is non-vacuous: it would have been invisible under the pre-fix
   scanner and is caught only because of this fix.
5. The header comment's regex-brace-literal count was corrected: the
   verifier found **four** brace-containing regex literals in `app.js`
   (`:230`, `:321`, `:474`, `:808`), not the one the header previously
   claimed. All four remain brace-balanced within their own statement, so
   the scrubbing conclusion survives — only the count was wrong.
6. The test header's honesty section was expanded: the gate's resolution is
   per named function, not per transition — variant B's shape (a second
   transition added into a function that already owns an emit) is caught
   only by the count assertion, never by set-equality alone. Stated
   explicitly rather than left implicit.

The transition-site/emit-site counts on real `app.js` are unchanged (3 and
3); all four original assertions still pass; the file now carries 7
assertions total (up from 4).

**Non-vacuity of the two new regression tests — verbatim before/after.**
Reproduced independently of the permanent regression tests themselves, by
running the actual pre-fix test file (git commit `8b6fd1c7fa`, the exact
version the verifier reviewed) and the actual fixed test file against an
identical, disk-isolated copy of `app.js` with a variant-C
(`setCurrentView("pool-detail")`, double-quoted, no paired emit) function
appended — the mutated copy never touched the real `app.js`:

```
=== TRUE OLD (pre-fix, commit 8b6fd1c7fa) analyzer run against the variant-C
    mutated app.js — reproduces the verifier's exact finding ===
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
```

```
=== NEW (fixed, this session) analyzer run against the SAME variant-C
    mutated app.js — now correctly RED ===
test_pool_view_transition_parity.js — spec 257 guard: transition sites vs. pool_view emit sites

  ✗ regex counts (quote-style tolerant): setCurrentView(['"]pool-detail['"]) and trackPoolView( occur equally often in app.js
    expected equal counts, got 4 transition site(s) and 3 emit site(s)

4 !== 3

  ✗ set-equality both directions: every transition-site owner has a paired emit-site owner, and vice versa
    owner(s) that transition into pool-detail but have NO trackPoolView emit in their own body: injectedVariantCHandler
  ✓ handleCalculateYield fires exactly one trackPoolView( and exactly one trackPoolClick( — no double-fire
    confirmed RED on mutated source: missing-emit owner(s) = [handleCalculateYield, injectedVariantCHandler]
  ✓ SELF-DEFEAT: with the spec-257 trackPoolView call surgically removed in memory, the analyzer REPORTS the gap
    comment at L2788 confirmed scrubbed; emit count unaffected (3)
  ✓ the "// … trackPoolView call …" comment near app.js:2788 does not inflate the emit-site count
    variant A caught by both the legacy scan and the current regex scan (never the gap)
  ✓ REGRESSION (variant A, single-quoted): a 4th, un-paired setCurrentView('pool-detail') is caught by the analyzer
    variant C: legacy scan missed it (3 -> 3, unchanged); current regex scan caught it (owner reported: injectedVariantCHandler)
  ✓ REGRESSION (variant C, double-quoted): a 4th, un-paired setCurrentView("pool-detail") is caught by the analyzer, and PROVEN non-vacuous against the pre-fix scan

test_pool_view_transition_parity.js: 5/7 tests passed
exit=1
```

Identical mutated fixture, two different scanners, opposite verdicts: this
is the non-vacuity proof for the fix. The full `test_pool_view_transition_parity.js`
run against the real, unmutated `app.js` is 7/7, exit=0 (see below).

### FAILURE 2 (P2) — risk tier artifacts

The verifier independently assigned **HIGH** (998-line diff, ~620
hand-written, against NORTH_STAR's 150-line LOW cap, on the measurement
surface; precedent items 186/154/157/167/215/231/233), against the
builder's LOW guess. `product-loop-kit/specs/257-pr.md` is updated: the
header now records verifier-assigned HIGH with the reason; a 5-question
quiz (base64-encoded answers) is appended, matching `186-pr.md`'s format;
and the "Neither set is hardcoded…" claim is corrected to state the
post-fix reality honestly — quote-style variants are now caught, but the
gate's per-named-function resolution still means a same-owner double
transition (variant B's shape) is caught only by the count assertion. A
"What the verifier found" section records the variant-C proof and the fix,
so the audit trail shows the gap rather than hiding it.

### Documentation corrections

`257-notes.md`'s "Finding: `urlDirectPoolViewFiredRef`'s purpose" section
title mis-attributed its framing instruction ("if and only if you
verify...") to `specs/257.md`. The verifier confirmed the spec contains no
such instruction — it came from the operator's build brief for the
session. Retitled/reworded above; the finding itself (the ref's actual
behavioral purpose, confirmed by tracing the code) is unchanged, only the
attribution.

### Full-suite verification after the fix

All run with `timeout 300 node <file>`, against the real repository state
(app.js untouched throughout):

- `test_pool_view_transition_parity.js` — **7/7**, exit=0. Finds 3
  transition sites / 3 emit sites on real `app.js`, unchanged from before.
- `test_pool_view_calculator_path.js` — **5/5**, exit=0.
- `test_test_registry.js` — **5/5**, exit=0.
- `test_run_tests.js` — **26/26**, exit=0.
- `test_compiled_assets.js` — **4/4**, exit=0.
- `test_minified_assets.js` — **9/9**, exit=0.
- `test_northstar_cta_fires.js` — **12/12**, exit=0.

`git status --porcelain` shows only `product-loop-kit/specs/257-notes.md`
as dirty at the time of this entry — `test_pool_view_transition_parity.js`
and `product-loop-kit/specs/257-pr.md` were checkpointed partway through this
fix session by the **operator** (commits `99aeb5b903`/`05d7d5ad70`/`f3ece42a8d`),
not by harness auto-checkpointing and not by the fix agent, which correctly ran
no `git commit`. Same mechanism and same reason as `b0ea8eb4cf` in Attempt 1: a
session stop-hook requires a clean tree and the container is ephemeral, so
in-flight work is checkpointed and pushed rather than risked. The branch
squash-merges, so only the final state reaches `main`.

(The fix agent's own report repeated Attempt 1's mis-attribution of these
commits to harness auto-checkpointing; corrected here, as it was there, so the
audit trail is accurate about who wrote what.)
