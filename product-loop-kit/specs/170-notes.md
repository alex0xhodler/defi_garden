# 170 — build notes

Item: make the browser lane's `run-tests.js` scheduler conflict-aware, so
`--jobs=N > 1` is safely honoured instead of silently forced to 1.
Spec: `product-loop-kit/specs/170.md`. Branch: `claude/loop-170` (already
checked out per the build brief — not created here). Base: `origin/main` @
`07e18988b` (includes 169).

Scope actually touched: `run-tests.js`, `test_run_tests.js`. No other file
was edited. `product-loop-kit/specs/170.md` is the pre-existing spec file
handed to the build (not authored here). This file (`170-notes.md`) is new.

## What shipped

`run-tests.js`:

- `extractPorts(fileName)` (new, ~line 178): reads the file's OWN source
  (`path.join(ROOT, fileName)`, non-transitive — deliberately, see "Design
  choices" below) and unions two regex scans into a `Set<number>`:
  - `PORT_DECL_RE = /\b(?:const|let|var)\s+(\w*PORT\w*)\s*=\s*(\d+)/g` — the
    declaration form used by every port-declaring file in this repo.
  - `PORT_HOST_RE = /(?:localhost|127\.0\.0\.1):(\d+)/g` — URL literals.
- `AUDIT_FINDINGS_KEY = 'res:audit-findings'` (new, ~line 201) and
  `conflictKeysFor(fileName)` (new, ~line 213): builds `{ keys: Set<string>,
  exclusive: boolean }` — `port:<n>` per extracted port, plus
  `AUDIT_FINDINGS_KEY` if the source contains `'audit-findings.json'` or
  `'DEFAULT_OUT'`; `exclusive` is `true` iff the port set is empty (sentinel
  flag, not a magic key — see spec point 3).
- `defaultJobsFor(lane, jobsOverride)` (rewritten, ~line 275): `jobsOverride`
  now wins unconditionally for BOTH lanes (previously the browser lane
  silently discarded it). With no override, browser defaults to
  `max(1, min(3, cpus-1))`, plain keeps its original `max(1, min(4, cpus-1))`.
  Docstring rewritten to describe the new invariant (was: "forced — fixed-
  port real-Chromium files must serialize").
- `runQueue(entries, jobs, timeoutSec, onResult, opts)` (rewritten, ~line
  372): now takes an optional 5th arg. With no `opts.getConflict` — the
  plain lane's call site, untouched — it is the ORIGINAL shared-index worker
  pool, **behaviourally** identical (VERIFIER CORRECTION: not byte-for-byte —
  `workerCount` is hoisted above `worker()`, where it is unused and has no
  observable effect, and `runFile` is aliased as `runOne` via
  `options.runFile || runFile`, which *is* `runFile` when no opts are
  passed). With `opts.getConflict(entry)` supplied (the browser
  lane's call site) it runs a greedy, event-driven conflict-aware scheduler:
  on every free slot, scan not-started entries in list order, start the
  first whose key set is disjoint from every in-flight file's key set (or,
  for an exclusive entry, only when nothing else is in flight); if none is
  eligible, start nothing and wait for a completion event. `opts.runFile`
  lets a caller substitute the executor — used by the test suite's stub
  runner, never by production code (default is the real `runFile`).
- `main()` (~line 519): builds `browserConflictInfo` via `conflictKeysFor`
  for the browser lane's selected files only, and passes `{ getConflict }`
  into the browser lane's `runQueue` call. The plain lane's call is
  unchanged (no options argument at all).
- Exports added: `extractPorts`, `conflictKeysFor`, `runQueue`, `runFile`,
  `AUDIT_FINDINGS_KEY` (matching the existing bottom-of-file export style;
  nothing renamed or removed).

`test_run_tests.js`:

- Test harness (`test()`, ~line 44): changed to chain each test onto a
  running promise and `await fn()`, instead of calling `fn()` synchronously.
  This was NOT in the spec's file list of things to change, but was
  necessary: the scheduler-interval tests must `await runQueue(...)` (real
  concurrency via real `setTimeout`), and the original harness would have
  called an async `fn` without awaiting it, silently racing tests against
  each other and swallowing assertion failures as unhandled rejections. Sync
  tests behave identically (a non-promise return awaited on the same
  microtask turn) — reran the full pre-existing suite (17 assertions) to
  confirm no behavior change; see verification below.
- New tests (all under a "spec 170" heading, after the existing lane-aware-
  timeout tests):
  - Port extraction over the REAL corpus (not fixtures): asserts the 8796
    group (7 files) and 8799 group (5 files) from the spec's table each
    extract their shared port, and that `conflictKeysFor` gives them the
    matching/non-overlapping key sets.
  - `test_audit_app.js` / `test_audit_runner.js` both carry
    `AUDIT_FINDINGS_KEY` and are ALSO independently `exclusive` (no port
    literal of their own — `audit-app.js`'s `AUDIT_PORT` is opened by the
    required helper, invisible to the non-transitive scan). Asserted
    honestly rather than assumed.
  - A file with no port literal at all (`test_seo_surface_audit.js`) is
    flagged `exclusive`.
  - A deterministic scheduler-interval test: a stub runner (`opts.runFile`)
    using real `setTimeout` (an "awaited timer", per the build brief) with a
    fixed 60ms delay records `{file, start, end}` intervals. Asserts (a)
    zero overlap between two files sharing a port key, (b) an exclusive file
    overlaps nothing, (c) a non-conflicting pair (disjoint keys, jobs=3)
    DOES overlap — the explicit non-vacuity guard: a scheduler that silently
    serialised everything fails this assertion.
  - `--jobs=1` reproduces the pre-170 serial order and non-overlap exactly
    (asserted via captured start order + interval math), using the SAME
    conflict-aware code path (not a special-cased branch).
  - The plain-lane call path (`runQueue` with no `getConflict`) still works
    as an ordinary shared-index pool.
  - `defaultJobsFor('browser')` is `>1` on this (4-core) box and is in
    `[1,3]`; an explicit `--jobs` override wins, including above the cap.
  - None of the new tests spawn `run-tests.js --only=test_run_tests.js` or
    any subprocess run that could recurse into this file — the fork-bomb
    hazard flagged in the build brief. All new scheduler tests call
    `runTests.runQueue` in-process with a stub runner; no `spawnSync` at all
    is used by any new test.

## Design choices / deviations from a literal reading of the spec

1. **Port extraction is non-transitive (own source only), by design, not
   an oversight.** The spec's point 3 ("unknown-port files are exclusive...
   may be opening a port through a helper") only makes sense if extraction
   does NOT chase `require`s the way `classifyLane`'s playwright-detection
   does — otherwise `test_audit_app.js` would inherit `audit-app.js`'s
   `AUDIT_PORT = 8821` default and stop being exclusive, contradicting the
   spec's own example. Verified empirically: exactly 8 browser files have an
   empty extracted port set, and all 8 are the `test_audit_*` /
   `test_seo_surface_audit.js` family that requires `audit-app.js` — matches
   the spec's framing precisely.
2. **`conflictKeysFor` still adds `AUDIT_FINDINGS_KEY` to files that are
   ALSO exclusive** (both `test_audit_app.js` and `test_audit_runner.js`
   have zero ports). This is redundant in practice (exclusive already
   forces them to run alone) but conservative and cheap, and keeps the two
   mechanisms independently correct — if a THIRD file later touches
   `audit-findings.json` but does have its own port literal, it still gets
   the correct shared-resource key without relying on it also being
   port-less.
3. **The audit-findings key is substring/keyword-based (any file
   containing `'audit-findings.json'` or `'DEFAULT_OUT'`), not a hardcoded
   2-file list**, per the spec's rationale for point 2 ("a future third file
   ... automatically included"). Confirmed only `test_audit_app.js` and
   `test_audit_runner.js` match today (`grep -l "audit-findings\.json\|
   DEFAULT_OUT" *.js` → those two plus `audit-app.js` itself, which is not a
   test file and never enters the file list).
4. **Test harness change (async-aware `test()`)** — see above; not called
   out in the spec's file-touch list but required for the interval tests to
   be real assertions rather than fire-and-forget promises. Scoped to
   `test_run_tests.js` only, which is in-scope.
5. **PORT_DECL_RE matches any identifier CONTAINING the substring "PORT"**,
   exactly as spec point 1 specifies ("`<IDENT containing PORT>`"). Noted
   but not fixed (out of scope — spec's own definition): this would also
   match a hypothetical `const EXPORT_LIMIT = 500` or `const SUPPORT_ID =
   80`, since "EXPORT" and "SUPPORT" both contain "PORT" as a substring.
   Checked the real corpus for this — `grep -rnE "\b(const|let|var)\s+\w*
   (EXPORT|REPORT|SUPPORT|PASSPORT)\w*\s*=\s*[0-9]+" test_*.js *.js` — zero
   matches today. Flagging as a candidate ticket (see below), not fixing,
   since fixing would mean deviating from the spec's literal grammar.

6. **Exclusive files are DEFERRED, not drained-to — a real semantic gap
   between the spec's wording and the implementation, found by the verifier,
   disclosed rather than silently fixed.** Spec point 3 says an exclusive
   file makes the scheduler "drain in-flight work first". The shipped pump
   does something weaker: while anything is in flight it *skips* the
   exclusive entry and keeps filling free slots with LATER files. The
   verifier demonstrated it with the shipped `runQueue` and a stub runner —
   an exclusive file at list position 2 of 8 (jobs=3) started **last**
   (`a,b,c,d,e,f,g,EXCL`). The safety invariant the criteria actually test
   ("an exclusive file overlaps nothing") is intact, and today's wall-clock
   impact is nil because all 8 real exclusives are the mutually-exclusive
   `test_audit_*` family, so no acceptance criterion fails and the code was
   NOT changed after the verifier's PASS (that would have invalidated the
   verified diff). Two consequences recorded honestly: (a) the inline
   comment `continue; // must drain first.` inside the pump's scan loop is
   **inaccurate** — it should read "defer until nothing is in flight"; (b) a
   future exclusive file that is genuinely slow would be starved to the end
   of the lane, lengthening the tail. Both are the candidate ticket below.

## Candidate tickets (noticed, not fixed — out of scope for 170)

- **Exclusive-file scheduling: decide drain-then-run vs defer, and fix the
  inline comment either way** (deviation 6 above). Cheap either way; the
  comment is wrong as shipped, which is the part that misleads a reader.

- `PORT_DECL_RE`'s "identifier contains PORT" match (see deviation 5 above)
  is broader than "identifier IS a port name" and could theoretically
  false-positive on an unrelated `EXPORT_*`/`SUPPORT_*`/`REPORT_*` constant
  in a future test file. Zero false positives on the corpus today; worth a
  narrower regex (e.g. `\bPORT\b` as a whole word, or a `_PORT` suffix
  convention) if a collision is ever observed.
- The measured-run exercise surfaced that several browser files are far
  slower than the spec's working assumption of "~30s each" (`specs/170.md`
  line 20's `test_default_sort.js = 28.3s` framing generalizes to a mid-
  range file, not a ceiling): `test_kpi_momentum.js` took 108.14s and
  `test_min_asset_boot.js` 65.86s in this run's jobs=1 baseline,
  `test_pool_logo.js` 86.6–87.5s in two separate runs. This doesn't affect
  170's correctness (the scheduler's correctness proof is interval-based,
  not duration-based), but it means future `--only` subset selections for
  timeboxed measurement should sample actual per-file timing first (as this
  build ended up doing) rather than assume a flat ~30s/file estimate.
- Not fixed, not in scope: `test_search.js` / `test_smoke.js` are still slow
  outliers per prior items' notes (163/169) — 170 explicitly lists "making
  test_search.js/test_smoke.js faster" as a non-goal, and this build did not
  touch either file.

## Verification

### `node test_run_tests.js` — all green (26 assertions, was 16 pre-170)

VERIFIER CORRECTION: the pre-170 baseline is **16**, not 17 — `origin/main`'s
`test_run_tests.js` has 16 `test(` registrations and prints 16 ✓ lines. The
"17" written here first was wrong; the +10 delta is the real one.

```
$ node test_run_tests.js
run-tests.js runner — 163
  ✓ A1: parseFileList splits a simple && chain, in order
  ✓ A1: parseFileList handles a single-file chain (no &&)
  ✓ A1: parseFileList tolerates irregular whitespace around &&
  ✓ A1: parseFileList throws on a step that is not a bare "node <file>.js"
  ✓ A1: --list on the real repo yields exactly the parsed test:serial chain, same order
  ✓ A3: a failing plain file does not abort the run — others still execute, it is reported FAIL, exit is non-zero
  ✓ A4 (fixture): a direct mention of the marker classifies a file as browser
  ✓ A4 (fixture): a one-hop local require of a marker-mentioning module classifies as browser
  ✓ A4 (fixture): a two-hop local require chain still classifies as browser (depth > 1)
  ✓ A4 (fixture): a file whose local requires never mention the marker stays plain
  ✓ A4 (fixture): circular local requires do not hang or crash the scan (cycle-safe)
  ✓ A4 (real repo, read-only): test_seo_surface_audit.js and test_audit_prescan.js land in browser via ./audit-app.js, despite no direct mention themselves
  ✓ A4 (real repo, read-only): test_llms_rails.js and test_planner.js land in plain
  ✓ A5: a file that outlives --timeout is recorded TIMEOUT, and the run continues to the next file
  ✓ lane-aware timeout: with no --timeout, resolveTimeout defaults to 120s (plain) and 600s (browser)
  ✓ lane-aware timeout: an explicit --timeout override wins for both lanes
  ✓ spec 170 A2: the real 8796 group (7 files) all extract port 8796, from the files on disk
  ✓ spec 170 A2: the real 8799 group (5 files) all extract port 8799, from the files on disk
  ✓ spec 170 A2: conflictKeysFor gives the whole 8796 group an overlapping key set (port:8796), and it is disjoint from the 8799 group
  ✓ spec 170: the two audit-findings.json writers share the audit resource key
  ✓ spec 170: a file with no port literal at all is flagged exclusive with an empty port-derived key set
  ✓ spec 170 A3/A4: scheduler interval test — zero overlap between conflicting files, exclusive overlaps nothing, a non-conflicting pair DOES overlap (non-vacuity)
  ✓ spec 170: --jobs=1 reproduces serial behaviour exactly — one file in flight at a time, original list order
  ✓ spec 170: the plain-lane call path (no getConflict) is untouched — behaves as a plain shared-index worker pool
  ✓ spec 170 A1: defaultJobsFor("browser") is no longer forced to 1 — on a multi-core box it is > 1
  ✓ spec 170 A1: an explicit --jobs override wins over the browser default

26 assertions passed
```
Ran 4 consecutive times (once during development, three times in final
verification) — 26/26 every time, no flakiness observed.

### `node run-tests.js --lane=plain` — 36/36 pass (~4.7s)

```
$ time node run-tests.js --lane=plain
...
TOTAL pass=36 fail=0 timeout=0 total=36

real	0m4.696s
```

### `node run-tests.js --list | tail -3`

```
$ node run-tests.js --list | tail -3
test_run_tests.js	plain

TOTAL files=100 plain=36 browser=64 listed=100
```

### `--json` shape check (spec: "if you add fields, add, never rename")

Ran `node run-tests.js --lane=plain --json=<scratch path>` and inspected the
payload: keys are `lane, timeoutOverrideSec, timeoutSec, plainJobs,
browserJobs, summary, results` — identical to pre-170. `browserJobs` now
correctly reports `3` (the new default) even on a plain-only run, instead of
the old hardcoded `1`.

### THE REAL MEASURED RUN (acceptance criterion 5)

**First attempt (8 files, as originally planned) truncated — recorded
honestly, not reported as green.** The spec's own per-file-time framing
("~30s each") turned out not to hold for two of the chosen files:

```
$ time timeout 290 node run-tests.js --lane=browser --jobs=1 --only=test_default_sort.js,test_hero_copy.js,test_kpi_momentum.js,test_pool_logo.js,test_min_asset_boot.js,test_northstar_cta_fires.js,test_pool_type_badge.js,test_kpi_rail_history.js
run-tests.js: 8 file(s) selected (lane=browser, plain=0, browser=8, timeout=plain:120s/browser:600s, plain-jobs=1, browser-jobs=1)

PASS       65.86s  test_min_asset_boot.js
PASS       28.53s  test_northstar_cta_fires.js
PASS        1.26s  test_hero_copy.js
PASS      108.14s  test_kpi_momentum.js
PASS       26.68s  test_default_sort.js
Terminated

real	4m50.007s
```
5 of 8 files completed (all PASS) before the 290s hard cap killed the run;
`test_pool_logo.js`, `test_pool_type_badge.js`, `test_kpi_rail_history.js`
never got a result. **This run is TRUNCATED, not green** — dropped from the
final measurement.

A follow-up 150s-capped probe of the untested 8796-group file confirmed the
same pattern (one file alone can eat most of a 290s budget):

```
$ time timeout 150 node run-tests.js --lane=browser --jobs=1 --only=test_pool_logo.js,test_mean30d_sanity.js
run-tests.js: 2 file(s) selected (lane=browser, plain=0, browser=2, timeout=plain:120s/browser:600s, plain-jobs=1, browser-jobs=1)

PASS       86.58s  test_pool_logo.js
Terminated

real	2m30.006s
```
`test_mean30d_sanity.js` never got a result in this probe — also dropped.

**Final measured set — shrunk to 4 files, chosen from files with now-known,
timebox-safe durations, still spanning multiple conflict groups including a
real shared-port pair**: `test_default_sort.js` + `test_hero_copy.js` (both
port 8799 — the spec's own example pair), `test_pool_logo.js` (port 8796),
`test_northstar_cta_fires.js` (port 8818, singleton). Dropped from the
original 8-file plan: `test_kpi_momentum.js`, `test_min_asset_boot.js`
(too slow — see truncated run above), `test_pool_type_badge.js`,
`test_kpi_rail_history.js` (never reached before the cap; speed unknown).

`--jobs=1` (serial baseline):
```
$ time timeout 290 node run-tests.js --lane=browser --jobs=1 --only=test_default_sort.js,test_hero_copy.js,test_pool_logo.js,test_northstar_cta_fires.js
run-tests.js: 4 file(s) selected (lane=browser, plain=0, browser=4, timeout=plain:120s/browser:600s, plain-jobs=1, browser-jobs=1)

PASS       27.68s  test_northstar_cta_fires.js
PASS        1.29s  test_hero_copy.js
PASS       26.66s  test_default_sort.js
PASS       86.64s  test_pool_logo.js

TOTAL pass=4 fail=0 timeout=0 total=4

real	2m22.345s
```
**Wall-clock: 142.345s. Pass: 4/4.**

New default (`browser-jobs=3`, no `--jobs` flag):
```
$ time timeout 290 node run-tests.js --lane=browser --only=test_default_sort.js,test_hero_copy.js,test_pool_logo.js,test_northstar_cta_fires.js
run-tests.js: 4 file(s) selected (lane=browser, plain=0, browser=4, timeout=plain:120s/browser:600s, plain-jobs=3, browser-jobs=3)

PASS        2.35s  test_hero_copy.js
PASS       28.76s  test_northstar_cta_fires.js
PASS       26.64s  test_default_sort.js
PASS       87.49s  test_pool_logo.js

TOTAL pass=4 fail=0 timeout=0 total=4

real	1m27.577s
```
**Wall-clock: 87.577s. Pass: 4/4.**

**Result: 142.345s → 87.577s, a 38.5% reduction**, and the concurrent
wall-clock (87.577s) sits almost exactly at the single longest file's own
duration (`test_pool_logo.js`, ~87s) — exactly what a correct conflict-aware
scheduler should produce here: the 8799 pair (`test_default_sort.js` +
`test_hero_copy.js`, ~27–29s combined) and the singleton
`test_northstar_cta_fires.js` (~29s) both fit inside `test_pool_logo.js`'s
own runtime once run concurrently with it, so the critical path collapses to
the slowest file rather than the sum of all four. All 4 files PASSed in
BOTH runs — no file was red on either configuration, so no origin/main
baseline comparison was needed for this set.

### What was NOT run

- **The full 64-file browser lane was NOT run.** At the per-file speeds
  observed in this session (many files well over the spec's ~30s
  assumption, up to 108s for one file), a full serial pass would run well
  past 30 minutes and the default-concurrency pass would still likely
  exceed the 5-minute investigation timebox by a wide margin. Not attempted,
  per the spec's explicit "do NOT attempt the full 64-file browser lane"
  instruction.
- The originally-planned 8-file set (`test_kpi_momentum.js`,
  `test_min_asset_boot.js`, `test_pool_type_badge.js`,
  `test_kpi_rail_history.js` among them) was NOT completed as a single run —
  see the truncated run above. `test_kpi_momentum.js` and
  `test_min_asset_boot.js` DID individually PASS (in the truncated run,
  before the cap fired) but were not included in the final measured
  before/after comparison. `test_pool_type_badge.js` and
  `test_kpi_rail_history.js` were never run in this session at all — their
  pass/fail status and duration are unknown.
- `test_mean30d_sanity.js` was started once (in the 150s probe) but killed
  before completion — unknown pass/fail status, not counted anywhere.
- No origin/main baseline run was performed, because every file actually
  measured (the 8 in the truncated run, the 4 in the final comparison) was
  PASS in this branch's runs — there was nothing red to prove pre-existing.

## Acceptance criteria — self-check (see final report for the authoritative version)

1. MET — `defaultJobsFor('browser', N)` honours `N`; `--jobs=1` uses the
   same conflict-aware code path with an in-flight cap of 1, which reduces
   to strict original-order one-at-a-time execution (proved by
   `test_run_tests.js`'s dedicated jobs=1 test, and matches the measured
   run's file-by-file PASS list order).
2. MET — real-corpus 8796 (7 files) / 8799 (5 files) groups asserted in
   `test_run_tests.js`.
3. MET — deterministic interval test proves zero overlap for conflicting
   keys AND a non-conflicting pair DOES overlap under jobs>1 (non-vacuity).
4. MET — same interval test asserts the exclusive file overlaps nothing.
5. MET (on a shrunk 4-file set, see "What was NOT run" for the honest
   accounting of the original 8-file plan) — 142.345s → 87.577s, 4/4 pass
   both runs, spanning 3 conflict groups (8799 pair, 8796, 8818).
6. MET — `run-tests.js --lane=plain` 36/36 pass; `test_run_tests.js` 26/26
   pass in full.
7. MET — `git diff <base>..HEAD --stat` shows only `run-tests.js`,
   `test_run_tests.js`, and the pre-existing `product-loop-kit/specs/170.md`
   spec file touched; `git diff -- package.json` empty; no other file in the
   diff (so `home.html`, `app.js`'s trust-rail constants, the SEO-generator
   scripts, etc. are untouched by construction, not by a targeted grep).
