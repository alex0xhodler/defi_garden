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

## Attempt 3 — verifier FAIL (round 2) and what changed

The second verifier FAILed the Attempt-2 build. Its closing line is the load-bearing finding, more important
than any single missed character: *"Two attempts have now each closed exactly the one variant the previous
verifier demonstrated — that pattern, not the missing regex character, is the thing to watch."* Concretely,
three findings:

### FAILURE 1 (P1) — backtick transition invisible, twice over; four more uncaught shapes disclosed

`setCurrentView(\`pool-detail\`)` (a new named function, no paired emit) scored **GREEN, 7/7, exit=0** against
the Attempt-2 test. Root cause was TWO independent bugs:

1. `TRANSITION_RE` (Attempt 2) was `/setCurrentView\s*\(\s*(['"])pool-detail\1\s*\)/g` — quote-tolerant for
   `'`/`"` only, the ONE additional variant Round 1's verifier had demonstrated (double-quoted), and no wider.
   No backtick branch.
2. `scrub()` (the single scrubber Attempts 1-2 shared for both the depth-walk and the pattern-scan)
   unconditionally blanked template-literal BODIES — replaced with spaces — to protect the brace-depth walk
   from a stray `{`/`}` byte inside a template string. This erased a backtick transition's own text before
   either regex ever ran, so widening the regex alone would NOT have been sufficient; the scrubbing bug had
   to be found and fixed independently.

The verifier additionally measured FOUR more uncaught shapes, only one of which (the per-named-function
resolution limit) had been disclosed: backtick template literal (above); an aliased setter
(`const setViewAlias = setCurrentView; setViewAlias('pool-detail')`); string concatenation
(`setCurrentView('pool' + '-detail')`); a named constant (`setCurrentView(POOL_DETAIL_VIEW)`); and a legal
trailing comma (`setCurrentView('pool-detail',)`). All GREEN, all previously undisclosed except the resolution
limit.

**Exhaustive delimiter enumeration (required by the operator's brief, stated here as the authoritative
version — also carried into the test file's own header comment):** JavaScript has EXACTLY THREE
string-literal delimiters — `'`, `"`, and `` ` `` (backtick). There is no fourth. `TRANSITION_RE` now covers
all three, plus the syntactic slack around the call: arbitrary whitespace/newlines (`\s*` matches `\n`, so
this was in fact already covered by the Attempt-2 regex — verified, not assumed, see the "whitespace/newline"
row in the verification table below) and one legal trailing comma (`,?` — this WAS a genuine, new Attempt-3
gap fix, not already covered). That is the full extent of what a textual/regex scan can address for a call
written as literal source text with a literal string argument.

**Disclosed, not caught (five shapes, none required by the spec, all named explicitly in the test file's
header comment and in `257-pr.md`'s caveat list, replacing the single "one honest caveat" line the verifier
flagged as an under-claim):**
1. Aliased setter: `const setViewAlias = setCurrentView; setViewAlias('pool-detail');`
2. String concatenation / computed argument: `setCurrentView('pool' + '-detail')`
3. Named constant: `setCurrentView(POOL_DETAIL_VIEW)`
4. Aliased or computed-property emit (the mirror class on the emit side, per the operator's instruction to
   audit `EMIT_RE` the same way): `const tpv = Analytics.trackPoolView; tpv(...)`;
   `Analytics['trackPoolView'](...)`; `Analytics.trackPoolView.call(this, ...)` / `.apply(...)` / `.bind(...)()`
5. Nested template literal: a backtick string containing another backtick inside its own `${...}`
   interpolation (e.g. `` `${`nested`}` ``) — `scrubForPatternScan()`'s char-walk finds the FIRST unescaped
   backtick as the string's close, which a nested template would defeat. A dedicated one-off scan (below)
   found zero instances in `app.js` today; this is a verified-absent-today fact, not a proof for all future
   edits.

None of these five requires an AST parser to name; closing them for real would (`acorn` is reachable only as
an undeclared transitive dependency of `terser` — the same reasoning Attempt 1 gave for not depending on it
holds here, restated rather than silently re-decided).

**Verification of the "app.js has no problematic string/template content" assumption, re-run for the
backtick case (Attempt 3):**

```
$ node -e '... walks every template literal in app.js, tests body against /setCurrentView|trackPoolView|pool-detail/ ...'
template-literal false-positive-candidate hits: 0

$ node -e '... walks every template literal in app.js, tests body for a nested (unescaped) backtick ...'
template literal count: 110 possibly nested: 0
```

Zero of 110 template literals in `app.js` contain the transition/emit substrings, and zero are nested.

### FAILURE 2 (P2) — Attempt 2 introduced a hardcoded population count

`test_pool_view_transition_parity.js:507` (Attempt 2's version) read:

```js
assert.strictEqual(emitIndices.length, 3, `expected exactly 3 emit sites (the comment must not inflate the count), got ${emitIndices.length}`);
```

New in Attempt 2, hardcoding the exact population the spec's own Population criterion forbids hardcoding, and
directly contradicting the file's own neighboring comment ("a 4th site added later must still pass"). The
verifier appended a **correctly instrumented** fourth path (`handleOpenDetailFromNewSurface`, with BOTH a
`setCurrentView('pool-detail')` AND a real `Analytics.trackPoolView(...)`) and measured the gate go **RED,
6/7, exit=1** on this single assertion, while every other assertion (count parity, set-equality) correctly
stayed green. A future engineer doing the right thing would have hit a red gate pointing at a comment-scrubbing
red herring.

**Fix:** the hardcoded assertion was replaced with a RELATIVE comparison — deleting only the comment's own
line from `app.js` (in memory) must not change the emit count returned by `analyze()`, whatever that count
currently is; no absolute number appears in the assertion. A **permanent positive-control fixture** was added:
a correctly-paired new transition+emit in a new named function (`handleOpenDetailFromNewSurface`) must keep
BOTH the count assertion and set-equality green — this is the executable form of "a gate that fires on
correct code is worse than no gate," and it is the fixture that would have caught Attempt 2's mistake before
the verifier had to.

### FAILURE 3 (P2) — quiz Q4's answer was self-contradictory

`257-pr.md`'s Q4 asked for the smallest edit adding an *uninstrumented* fourth entry path while still passing
every assertion. Attempt 2's answer gave the same-owner (variant B) shape and then said "it would be caught
only by the count assertion" — an edit caught by an assertion does not pass every assertion. The verifier
measured variant B at 6/7, exit=1, confirming the contradiction directly.

**Fix:** Q4 rewritten to ask for, and answer with, the alias/named-constant family (FAILURE 1's disclosed
list) — a shape that genuinely produces ZERO regex matches on either side, so every assertion in the file
passes vacuously true rather than being caught-but-flagged. The other four Q&As were re-read for the same
defect (a reassuring answer rather than an accurate one); Q1/Q2/Q5 were found accurate and left in substance
unchanged (wording only, to account for there now being two verifier rounds); Q3 was widened to also name the
GENERAL pattern behind both misses (narrowest-hypothesis-per-instance, not the class), not just Attempt 1's
specific mechanism, since the question as originally framed invited exactly the kind of instance-scoped answer
this whole finding is about.

### What changed (files)

Only `test_pool_view_transition_parity.js`, `product-loop-kit/specs/257-pr.md`, and this file. `app.js`,
`app.compiled.js`, `app.compiled.min.js`, and `package.json` were not touched (confirmed unchanged — same
content as the Attempt-2 build; no md5sum diff needed since no edit was made).

In `test_pool_view_transition_parity.js`:
1. `TRANSITION_RE` → `/setCurrentView\s*\(\s*(['"\`])pool-detail\1\s*,?\s*\)/g` (backtick alternation +
   optional trailing comma added).
2. The single `scrub()` was split into `scrubForDepth()` (renamed, behavior unchanged — blanks comments AND
   template bodies, used for the brace-depth walk) and `scrubForPatternScan()` (new — blanks comments only,
   preserves ALL quoted-string content including backtick bodies, used for `TRANSITION_RE`/`EMIT_RE`).
   `analyze()` now runs two scrub passes over the same source and cross-references indices between them
   (both scrubbers are position-preserving — same length, characters only ever replaced, never
   inserted/deleted — so an index found via one aligns 1:1 with the same index in the other).
3. A frozen `PREV_ATTEMPT2_TRANSITION_RE` (the exact Attempt-2 regex, no backtick, no trailing comma) was
   added alongside the existing `LEGACY_TRANSITION_TEXT` (Attempt-1's indexOf scan), so every new regression
   fixture can prove non-vacuity against the SPECIFIC prior-round scanner it defeats — not just against "some
   older version."
4. Three new permanent regression fixtures: variant D (backtick), variant E (trailing comma), variant B
   (same-owner, now an executable fixture rather than only prose — proven to desync the count assertion while
   leaving set-equality green, matching the documented resolution limit exactly).
5. One new permanent positive-control fixture (FAILURE 2 fix, described above).
6. The hardcoded `emitIndices.length === 3` assertion replaced with the relative before/after-comment-deletion
   comparison (FAILURE 2 fix, described above).
7. The self-defeat marker regex (`removeYieldCalculatorTrackPoolView`'s `markerRe`) widened to accept a
   backtick-delimited `source:` value too, for consistency with `TRANSITION_RE`'s widening (not because any
   real call site uses one today — belt-and-suspenders).
8. `passed`/`totalTests` counters made dynamic (`totalTests++` inside `test()`) so the final
   `${passed}/${total}` log line can never itself drift into a second hardcoded-number bug alongside the one
   just fixed.
9. Header comment rewritten: the false "a quote-style variant can no longer hide from the gate" claim (FAILURE
   1's second finding — the docs actively claiming coverage they didn't have) replaced with the exhaustive
   delimiter enumeration, the disclosed five-shape list, and the emit-side widening audit's conclusion (no
   further regex widening exists that is both textually meaningful and still catchable — alias/computed/bound
   forms are disclosed, not covered).

In `product-loop-kit/specs/257-pr.md`: "one honest caveat" replaced with the full disclosed list; a "Round 2"
subsection added under "What the verifier found" (kept alongside "Round 1" rather than overwriting it, so the
audit trail shows the gate failed twice); risk-tier paragraph's line counts updated to reflect the larger
diff; Quiz Q3/Q4 reworded and re-answered, Q1/Q2/Q5 re-verified and left substantively unchanged; base64 quiz
block re-encoded.

### VERIFY BEFORE REPORTING — measured table, disk-isolated copies of `app.js`

Every row below was run as `timeout 300 node test_pool_view_transition_parity.js` against a COPY of the real
repository written to an isolated scratch directory (`/tmp/.../257v3/rows/<row>/`), each copy mutated exactly
once and never written back to the real `app.js`. The real `app.js` in the working tree was never touched by
any of this.

| row | mutation | expected | measured | exit |
|---|---|---|---|---|
| 1 | backtick, new fn, no emit | RED | RED, 7/11 | 1 |
| 2 | single-quoted (variant A), new fn, no emit | RED | RED, 7/11 | 1 |
| 3 | double-quoted (variant C), new fn, no emit | RED | RED, 7/11 | 1 |
| 4 | trailing comma, new fn, no emit | RED | RED, 7/11 | 1 |
| 5 | whitespace/newline-split call, new fn, no emit | RED | RED, 7/11 | 1 |
| 6 | same-owner (variant B), 2nd transition inside `handlePoolClick`, no new emit | RED (count assertion) | RED, 9/11 | 1 |
| 7 | correctly-paired 4th path (new fn, transition + real emit) | GREEN | GREEN, 11/11 | 0 |
| 8a | aliased setter (`setViewAlias`) | GREEN (disclosed, not caught) | GREEN, 11/11 | 0 |
| 8b | string concatenation (`'pool' + '-detail'`) | GREEN (disclosed, not caught) | GREEN, 11/11 | 0 |
| 8c | named constant (`POOL_DETAIL_VIEW`) | GREEN (disclosed, not caught) | GREEN, 11/11 | 0 |
| 9 | unmutated `app.js` | GREEN, 3/3 | GREEN, 11/11, 3 transitions / 3 emits | 0 |

**Row 1 (backtick) verbatim transcript — RED, non-vacuous:**

```
test_pool_view_transition_parity.js — spec 257 guard: transition sites vs. pool_view emit sites

  ✗ regex counts (quote-style tolerant): setCurrentView(['"]pool-detail['"]) and trackPoolView( occur equally often in app.js
    expected equal counts, got 4 transition site(s) and 3 emit site(s)

4 !== 3

  ✗ set-equality both directions: every transition-site owner has a paired emit-site owner, and vice versa
    owner(s) that transition into pool-detail but have NO trackPoolView emit in their own body: injectedRowBacktickHandler
  ✓ handleCalculateYield fires exactly one trackPoolView( and exactly one trackPoolClick( — no double-fire
  ✓ SELF-DEFEAT: with the spec-257 trackPoolView call surgically removed in memory, the analyzer REPORTS the gap
  ✓ the "// … trackPoolView call …" comment near app.js:2788 does not inflate the emit-site count (relative, not hardcoded — spec-257 FAILURE 2 fix)
  ✓ REGRESSION (variant A, single-quoted): a 4th, un-paired setCurrentView('pool-detail') is caught by the analyzer
  ✓ REGRESSION (variant C, double-quoted): a 4th, un-paired setCurrentView("pool-detail") is caught by the analyzer, and PROVEN non-vacuous against the pre-fix scan
  ✓ REGRESSION (variant D, BACKTICK): a 4th, un-paired setCurrentView(`pool-detail`) is caught by the analyzer, and PROVEN non-vacuous against the attempt-2 scan
  ✓ REGRESSION (variant E, TRAILING COMMA): a 4th, un-paired setCurrentView('pool-detail',) is caught by the analyzer, and PROVEN non-vacuous against the attempt-2 scan
  ✗ REGRESSION (variant B, same-owner): a 2nd transition inside an already-instrumented function is caught ONLY by the count assertion, never set-equality alone — documents the gate's known resolution limit
    [set-equality now includes 'injectedRowBacktickHandler' — expected, since this row's OWN mutation adds an unrelated 4th owner; this fixture's assumption of an otherwise-unmutated app.js does not hold inside row 1's isolated copy, which is why this one fixture (only) also goes red here — the three assertions above it already demonstrate row 1's actual point]
  ✗ POSITIVE CONTROL: a correctly-paired 4th entry path (new transition + real trackPoolView emit, same owner) keeps the gate GREEN — spec-257 FAILURE 2 fix
    a correctly-paired 4th path must keep transition count === emit count

5 !== 4

test_pool_view_transition_parity.js: 7/11 tests passed
exit=1
```

(The variant-B and positive-control fixtures' own failures inside row 1's copy are an artifact of running the
FULL file — including its OTHER fixtures — against a base that already has an extra, unrelated mutation; they
are not evidence about the backtick shape itself, which the first three assertions demonstrate directly. This
is expected and does not weaken the RED verdict for row 1's actual claim.)

**Row 9 (unmutated) verbatim transcript — GREEN, all 11 assertions, 3/3 real transitions and emits:**

```
test_pool_view_transition_parity.js — spec 257 guard: transition sites vs. pool_view emit sites

    (found 3 of each, at this tick)
  ✓ regex counts (quote-style tolerant): setCurrentView(['"]pool-detail['"]) and trackPoolView( occur equally often in app.js
    owners: App, handleCalculateYield, handlePoolClick
    transition sites -> owners: L1293:App, L2683:handlePoolClick, L2803:handleCalculateYield
    emit sites -> owners: L1332:App, L2670:handlePoolClick, L2793:handleCalculateYield
  ✓ set-equality both directions: every transition-site owner has a paired emit-site owner, and vice versa
  ✓ handleCalculateYield fires exactly one trackPoolView( and exactly one trackPoolClick( — no double-fire
  ✓ SELF-DEFEAT: with the spec-257 trackPoolView call surgically removed in memory, the analyzer REPORTS the gap
  ✓ the "// … trackPoolView call …" comment near app.js:2788 does not inflate the emit-site count (relative, not hardcoded — spec-257 FAILURE 2 fix)
  ✓ REGRESSION (variant A, single-quoted): a 4th, un-paired setCurrentView('pool-detail') is caught by the analyzer
  ✓ REGRESSION (variant C, double-quoted): a 4th, un-paired setCurrentView("pool-detail") is caught by the analyzer, and PROVEN non-vacuous against the pre-fix scan
  ✓ REGRESSION (variant D, BACKTICK): a 4th, un-paired setCurrentView(`pool-detail`) is caught by the analyzer, and PROVEN non-vacuous against the attempt-2 scan
  ✓ REGRESSION (variant E, TRAILING COMMA): a 4th, un-paired setCurrentView('pool-detail',) is caught by the analyzer, and PROVEN non-vacuous against the attempt-2 scan
  ✓ REGRESSION (variant B, same-owner): a 2nd transition inside an already-instrumented function is caught ONLY by the count assertion, never set-equality alone — documents the gate's known resolution limit
  ✓ POSITIVE CONTROL: a correctly-paired 4th entry path (new transition + real trackPoolView emit, same owner) keeps the gate GREEN — spec-257 FAILURE 2 fix

test_pool_view_transition_parity.js: 11/11 tests passed
exit=0
```

**Row 6 (same-owner / variant B) verbatim transcript — RED via count assertion, exactly as documented:**

```
  ✗ regex counts (quote-style tolerant): setCurrentView(['"]pool-detail['"]) and trackPoolView( occur equally often in app.js
    expected equal counts, got 4 transition site(s) and 3 emit site(s)

4 !== 3

  ✓ set-equality both directions: every transition-site owner has a paired emit-site owner, and vice versa
...
test_pool_view_transition_parity.js: 9/11 tests passed
exit=1
```

(In-repo, in-memory equivalent of this row is also a permanent fixture in the test file itself — "REGRESSION
(variant B, same-owner)" — which passed 11/11 in the unmodified-app.js run above; the disk-isolated row 6 here
is the SAME shape verified independently, from outside the file under test, per the operator's instruction not
to trust only the file's own self-tests.)

### Full-suite verification after the fix (real repository, `app.js` untouched throughout)

All run with `timeout 300 node <file>`:

- `test_pool_view_transition_parity.js` — **11/11**, exit=0. 3 transition sites / 3 emit sites on real
  `app.js`, unchanged from Attempts 1 and 2.
- `test_pool_view_calculator_path.js` — **5/5**, exit=0.
- `test_test_registry.js` — **5/5**, exit=0.
- `test_run_tests.js` — **26/26**, exit=0.
- `test_compiled_assets.js` — **4/4**, exit=0.
- `test_minified_assets.js` — **9/9**, exit=0.
- `test_northstar_cta_fires.js` — **12/12**, exit=0.

`git diff` against the Attempt-2 state shows changes confined to `test_pool_view_transition_parity.js`,
`product-loop-kit/specs/257-pr.md`, and this file — `app.js`, `app.compiled.js`, `app.compiled.min.js`, and
`package.json` are byte-identical to the Attempt-2 build (no edit was made to any of them; nothing to
md5sum-diff).

As in Attempts 1 and 2, in-flight work in this sandbox was checkpointed and pushed by the operator (not by
this build/fix agent, which ran no `git commit`) partway through the session, for the same reason recorded
above (`b0ea8eb4cf`, and the Attempt-2 equivalents): a session stop-hook requires a clean tree and the
container is ephemeral.
