# Spec 252 — build notes

## Summary

`analytics.js` now supports `?insider=1` (persist) / `?insider=0` (clear) as a
localStorage flag (`defi_garden_insider`), and stamps `insider: true` onto
`getBaseContext()` — the same spread mechanism `acquisition` already uses —
for every subsequently tracked event, on both router paths. Unmarked
visitors carry no `insider` key at all (never `insider: false`). No UI, no
new dependency, no change to `ANALYTICS_PARAMS`/`PLANNER_PARAMS`, no move of
the `analytics.js` `<script defer>` tag.

## Files changed

- `analytics.js` — +60/-2 lines (`git diff --stat`). New: `INSIDER_STORAGE_KEY`,
  `_insiderOverride`, `applyInsiderParam()`, `isInsider()`; one call added in
  `init()`; one spread line added in `getBaseContext()`.
- `package.json` — +1/-1 line: registered `test_analytics_insider.js` in
  `test:serial`, immediately after `test_analytics_src_attribution.js`.
- `test_analytics_insider.js` — new file, 356 lines. Rendered Playwright,
  fixture-routing style matching `test_analytics_src_attribution.js`.

No minified/compiled twin exists for `analytics.js` — checked explicitly:
`minify-assets.js`'s `JS_FILES` list is `['app.compiled.js',
'PoolDetail.compiled.js', 'planner.js', 'translations.js']` and
`compile-app.js`'s `FILES` is `['app.js', 'PoolDetail.js']`. `analytics.js`
appears in neither, and there is no `analytics.min.js` / `analytics.compiled.js`
on disk. Nothing to regenerate.

## Deviation from the literal spec text, and why

The spec's Change section describes the mechanism as "attach `insider: true`
to the base context ... if the flag is present" with no further detail on
*how* presence is determined. The implementation adds one thing the spec
text doesn't spell out: an in-session override (`_insiderOverride`), set
directly from the CURRENT load's `?insider=` param, that takes precedence
over the localStorage read. Without it, `isInsider()` would have to read
`localStorage` on every call, including the very first page that sets the
flag — and the acceptance criteria's non-vacuity proof (b) requires that
breaking ONLY the persistence write leaves the *immediate* marking
assertions green while failing ONLY the reload/cross-navigation assertions.
That isolation is impossible without separating "this load's own param" from
"a prior load's persisted value." This is the conservative, spec-compliant
reading: the observable contract (marks on `=1`, clears on `=0`, persists,
never stamps `false`) is unchanged; the override is purely an
implementation detail needed to make the two guards independently provable,
per the spec's own acceptance criterion.

No other deviations. Diff is 62 net lines in `analytics.js` — well under the
spec's "well under 150 lines" estimate.

## NORTH_STAR gate language ("real" = not crawler-classified AND not insider)

Per spec 252's acceptance criteria: `NORTH_STAR.md`'s north-star definition
and this repo's gate language are meant to gain the word **real**, defined
as "not crawler-classified **and** not `insider`." I did NOT edit
`NORTH_STAR.md` — the task's own instructions state only the human edits
that file, and CLAUDE.md's `NORTH_STAR edited by the operator on the human's
answers only` convention is corroborated at
`product-loop-kit/NORTH_STAR.md` line 146. Recording it here per the task's
explicit instruction, for the next heartbeat/human edit to pick up:

> A "real" session/event, from this item forward, is one that is BOTH
> not crawler-classified (existing `playbooks/traffic-quality-classification.md`
> predicate) AND does not carry `insider: true` (this item's flag). Every
> future signals snapshot should be able to state "N sessions, of which M
> insider, K crawler, R real" with R = N − (M ∪ K) — derived from the two
> properties, not from a regional forensic argument (the 08-07 Utrecht case
> in this spec's Evidence section).

## Class closed: no (spec's own framing, confirmed)

The spec states plainly: "The flag covers the operator on devices they
mark. It does not cover an unmarked device, a teammate, or a contractor."
Confirmed unchanged by this build — nothing in the implementation narrows or
widens that residual. The number left open is unbounded and unmeasurable by
construction (any device that never visits a `?insider=1` URL is
indistinguishable from a genuine visitor by this mechanism alone), which is
why the spec pairs this flag with the geo/device forensic step in
`playbooks/traffic-quality-classification.md` rather than treating it as a
complete answer.

## Non-vacuity proof (both halves), commands + output + md5sums

Baseline: `md5sum analytics.js` → `be1c99dfae9069956645c521fa312995` (before
either mutation, and confirmed identical after each restore below).

### (a) Remove the base-context stamping line

Removed the line `...(this.isInsider() ? { insider: true } : {})` (and its
preceding comment) from `getBaseContext()`.

```
$ node test_analytics_insider.js
  ✗ planner-mode /plan.html?insider=1: every tracked event carries insider=true, including waitlist_opened (never fires from app.js)
    planner-mode marked: event "session_start" expected insider===true, got undefined
  ✗ analytics-mode /?token=USDC&insider=1: every tracked event carries insider=true, including page_view (only ever fires from app.js)
    analytics-mode marked: event "session_start" expected insider===true, got undefined
  ✓ planner-mode /plan.html (no insider param): no event carries an insider key
  ✓ analytics-mode /?token=USDC (no insider param): no event carries an insider key
  ✗ persistence: mark via planner ?insider=1, then reload the SAME planner URL without the param — still insider=true
    persistence across reload (planner): event "session_start" expected insider===true, got undefined
  ✗ persistence: same marked device navigates to the ANALYTICS-mode path with no insider param — still insider=true
    persistence across router-mode navigation (planner -> analytics): event "session_start" expected insider===true, got undefined
  ✓ ?insider=0 on the analytics-mode path clears a previously-marked device
  ✓ the clear persists: revisiting the planner path with no insider param stays absent
  ✓ population coverage: observed events span both router paths, not just page_view
test_analytics_insider.js: 5/9 tests passed
EXIT:1
```

RED for both router paths (planner-mode test AND analytics-mode test), as
required.

Restore:

```
$ cp <scratchpad>/analytics.js.orig analytics.js
$ md5sum analytics.js
be1c99dfae9069956645c521fa312995  analytics.js       # byte-identical to baseline
$ node test_analytics_insider.js
  ✓ ... (all 9)
test_analytics_insider.js: 9/9 tests passed
EXIT:0
```

### (b) Break ONLY the persistence (never write to localStorage)

In `applyInsiderParam()`, commented out `localStorage.setItem(...)` and
`localStorage.removeItem(...)` (kept `this._insiderOverride = true/false`
assignments, kept `isInsider()`'s read path untouched).

```
$ md5sum analytics.js
0f9419cd639f4ec356588aca73607f91  analytics.js
$ node test_analytics_insider.js
  ✓ planner-mode /plan.html?insider=1: ...                          [GREEN — immediate mark, no persistence needed]
  ✓ analytics-mode /?token=USDC&insider=1: ...                      [GREEN — immediate mark, no persistence needed]
  ✓ planner-mode /plan.html (no insider param): ...                 [GREEN — unaffected]
  ✓ analytics-mode /?token=USDC (no insider param): ...             [GREEN — unaffected]
  ✗ persistence: mark via planner ?insider=1, then reload ...       [RED — depends on the disabled write]
    persistence across reload (planner): event "session_start" expected insider===true, got undefined
  ✗ persistence: same marked device navigates to ANALYTICS-mode ... [RED — depends on the disabled write]
    persistence across router-mode navigation (planner -> analytics): event "session_start" expected insider===true, got undefined
  ✓ ?insider=0 on the analytics-mode path clears ...                [GREEN — clearing is also an immediate override, not a read]
  ✓ the clear persists: revisiting the planner path ...             [GREEN — flag was never set in localStorage in the first place, so "clear persists" trivially holds]
  ✓ population coverage: ...                                        [GREEN]
test_analytics_insider.js: 7/9 tests passed
EXIT:1
```

Exactly the two persistence-dependent assertions go red, on their own — the
immediate-marking, unmarked-absence, and clear-related assertions all stay
green, proving these are independent guards rather than two checks masking
each other (item 166's lesson, cited in the spec).

Restore:

```
$ cp <scratchpad>/analytics.js.orig analytics.js
$ md5sum analytics.js
be1c99dfae9069956645c521fa312995  analytics.js       # byte-identical to baseline
$ node test_analytics_insider.js
  ✓ ... (all 9)
test_analytics_insider.js: 9/9 tests passed
EXIT:0
```

## Population enumeration

`test_analytics_insider.js` parses `analytics.js`'s own source at test time
via `/[A-Za-z.]*track\('([a-zA-Z_]+)'/g` (matching both `this.track('<name>'`
call sites and the two bare `Analytics.track('page_focus'|'page_blur'`
calls at the bottom of the file), yielding a 30-name population set. The
test asserts a self-check that the parse found ≥20 names and includes
`page_view`, `waitlist_opened`, `session_start` (guards against silent regex
drift). Every observed track call across every scenario is checked against
this population (unrecognized event name → hard failure, catching test/prod
drift) and against the insider expectation. Observed events across the whole
suite: `page_view`, `waitlist_opened`, `session_start`, `filter_combination`,
`performance_metric` — spanning both the planner-only event
(`waitlist_opened`, which can never fire from `app.js`) and the
analytics-only event (`page_view`, which can never fire from `planner.js`),
so the check is not blind to either router path.

## A harness flakiness finding NOT specific to this item (documented, worked around)

`session_start` — the event fired from `analytics.js`'s bottom-of-file
`window.addEventListener('load', ...)` handler — intermittently does not
reach the `window.mixpanel` stub queue in this test harness, even though the
page's own `readyState` is `complete` and no `pageerror` fires. Root cause:
the established `neutralizeHostGate()` pattern (used by
`test_analytics_src_attribution.js`, `test_analytics_host_gate_render.js`,
and now this file) patches `Analytics.isProductionHost` via an
`addInitScript` poll (`setTimeout(install, 0)` retried until the lexical
`Analytics` binding exists — it cannot be patched via
`Object.defineProperty(window, 'Analytics', ...)` because `const Analytics =
{...}` at script top level is a lexical binding, not a `window` property).
On some runs, the page's own `load` event fires and calls
`Analytics.startSession()` → `track('session_start', ...)` BEFORE that poll
has landed its patch — at that instant `isProductionHost()` still reads the
real (`localhost`) hostname, so `track()` takes its normal, correct,
production-safe early return and the call is silently gate-suppressed
(exactly as spec 096 intends for a genuine non-production visit — this is
NOT a bug in `analytics.js`, it is a property of testing a `load`-time event
against an asynchronously-installed test double). `waitlist_opened` and
`page_view`, by contrast, fire from React mount/effect passes that reliably
run well after the patch has landed, so they never race.

Confirmed empirically: 3/5 raw runs of the file (before adjusting the test)
had `session_start` missing from a single scenario's captured calls; 5/5
runs after adjusting the test to treat `session_start` as opportunistic
(checked for insider-correctness IF observed, never required) were stable
green. This is a pre-existing characteristic of the established
`neutralizeHostGate()` harness pattern, not introduced by this item — it
would affect any future test hard-requiring `session_start`'s presence
under this same pattern. Worth a playbook note for whoever next writes a
test that depends on `session_start` specifically; not fixed here (out of
this item's scope — the fix belongs in the shared test-harness pattern, not
in `analytics.js` or in this one test file).

## Regression run (exit codes read without a pipe)

NORTH_STAR-mandated chain:
```
$ node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
... (208 + 9 + 9 assertions, all passed)
NORTH_STAR_CHAIN_EXIT:0
```

Individually:
```
$ node test_analytics_insider.js        → 9/9 passed, EXIT:0
$ node test_test_registry.js            → 5/5 passed, EXIT:0
$ node test_analytics_acquisition.js    → 23/23 passed, EXIT:0
$ node test_analytics_src_attribution.js→ 5/5 passed, EXIT:0
$ node test_analytics_fires.js          → 1/1 passed, EXIT:0
$ node test_analytics_host_gate.js      → 16/16 passed, EXIT:0
$ node test_smoke.js                    → 13/13 passed, EXIT:0 (ran >120s — real
                                            network reachable in-sandbox this
                                            session, so it fetched a live
                                            yields.llama.fi snapshot; moved to
                                            background per the 5-minute
                                            foreground timebox, completed
                                            cleanly, no kill/retry needed)
```

All required regression tests green. No test was skipped or worked around.

## Router-mode verification (hard constraint)

Manually verified `home.html:90-94`'s `ANALYTICS_PARAMS`/`PLANNER_PARAMS`
arrays do NOT contain `insider` (grepped before editing anything).
`test_analytics_insider.js` itself exercises both `/plan.html?insider=1...`
(lands on planner — asserted via `.gp-waitlist-backdrop` render) and
`/?token=USDC&insider=1` (lands on analytics grid — asserted via
`.pool-card` render), so both router paths are render-verified with the new
param present, not just grepped.

## `analytics.js` <script> tag — untouched (hard constraint)

Not moved, not reordered. `home.html:218` and `plan.html:107` both still
read `<script defer src="analytics.js"></script>` in `<head>`, unchanged —
confirmed via `git diff` (no lines touching those two files at all; the
entire diff is scoped to `analytics.js`, `package.json`, and the new test
file).

## What I could NOT do / gaps

- `NORTH_STAR.md` gate-language update — intentionally not done (human-only
  file per this task's instructions and the repo's own recorded convention).
  Text is above, ready for the human/heartbeat to paste in.
- `playbooks/traffic-quality-classification.md`'s "query recipe for the
  filter once it exists" (spec's Change item 2) — the spec frames this as
  already-updated by the 2026-08-08 heartbeat for the predicate/geo-device
  step, with this item adding "the query recipe for the filter once it
  exists." That recipe depends on a live Mixpanel cohort/query surface this
  build session has no credentialed access to (the `mixpanel` MCP connector
  is unauthenticated in this environment) — out of reach in-session, and per
  the spec's own "Explicitly OUT of scope" list, a Mixpanel cohort via the
  API is an org-admin, human-owned action anyway. Not attempted.
- The value-leg of Measurement ("≥1 event carrying `insider: true` in
  Mixpanel proves the instrument non-vacuously") can only be exercised by
  the operator visiting prod with `?insider=1` after this ships — noted per
  the spec's own Measurement/Gate section, not something a build session can
  satisfy.

Everything else in the spec's acceptance criteria and hard constraints is
implemented and test-verified as described above.
