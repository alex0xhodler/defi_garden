# 163 — implementation notes

Built exactly per specs/163.md's Design section: `run-tests.js` (new, root, CommonJS,
`child_process`/`fs`/`path`/`os` only), `test_run_tests.js` (new, root), and `package.json`
scripts (`test:serial` = the original 94-step chain byte-identical + `node test_run_tests.js`
appended; `test` = `node run-tests.js`; `test:fast` / `test:browser` added).

## Deviations from the spec, and why

1. **`main()` is guarded by `require.main === module`.** Not stated in the spec, but required:
   `test_run_tests.js` needs to `require` `run-tests.js`'s exported helpers to unit-test them.
   Without the guard, that `require` call executes `main()` — i.e. runs the *entire real test
   chain* as a side effect of importing the module. I caught this the hard way: my first
   `require('./run-tests.js')` from a throwaway shell one-liner kicked off the real 94-file chain
   in the background before I'd even written `test_run_tests.js`. Killed it (`kill -9` on the
   `node -e` process and the `test_smoke.js` child it had spawned) before it did anything but read
   files. Fixed by wrapping the `main().catch(...)` call in `if (require.main === module)`.

2. **`test_run_tests.js` cannot spell the browser-driver package name as a contiguous literal, or
   use a literal `require('./run-tests.js')`, anywhere in its own source.** This is the more
   interesting one. `test_run_tests.js` is itself an entry in the parsed `test:serial` chain, so
   it goes through the same lane classifier as every other file. That classifier does a raw-text
   scan (not an AST parse — the spec explicitly rules out anything requiring a new dependency) for
   the substring `playwright`, in the file itself and everything it locally requires
   (`require('./x')`-style, transitively). `run-tests.js`'s own source necessarily contains that
   substring many times, because it's the string the classifier searches for. Two consequences,
   both caught by actually running `--list` against my own draft rather than assuming it was fine:
   - A plain `require('./run-tests.js')` in `test_run_tests.js` creates a local-require edge to a
     file that mentions the marker → `test_run_tests.js` gets classified `browser`. Fixed by
     loading it via a computed path in a variable (`require(RUN_TESTS_PATH)`) — the classifier's
     require-regex only matches a literal quoted relative string sitting directly inside the call,
     by design, so a computed path doesn't register as an edge at all.
   - Any fixture-content string that spells `playwright` out as a contiguous literal (e.g. a
     comment written into a temp file to test the "direct mention" classification path) also
     trips the *direct*-mention check on `test_run_tests.js` itself, since the raw-text scan
     doesn't distinguish "this file's own prose" from "a string this file happens to contain."
     Fixed by reconstructing the name at runtime from two halves (`'play' + 'wright'`) and using
     that everywhere a fixture needs the real string. This also caught me twice: my first pass
     used the reconstructed constant in the fixture bodies but still spelled the literal contiguous
     form out in *prose comments* explaining the workaround (`` `require('./run-tests.js')` ``,
     twice) — `grep -c playwright test_run_tests.js` was 0 (I'd avoided the word itself) but
     `node run-tests.js --list --only=test_run_tests.js` still said `browser`, because the
     `require('./run-tests.js')` *pattern* — not the marker word — was what the require-edge
     regex matched, resolving to `run-tests.js`, which does mention the marker. Fixed by
     rephrasing those comments to describe the syntax without typing it out. Verified after each
     fix with the actual `--list --only=test_run_tests.js` command (see A4 evidence below) — not
     just a source grep, since the grep alone had missed the require-edge case entirely.
   Net effect: none of this changes what's tested — `mentionsPlaywrightTransitively` still receives
   the real, reconstructed string at runtime and classifies exactly as it would classify a product
   file. It only affects how `test_run_tests.js`'s own source is written, so that this file (which
   exists to test the classifier) doesn't accidentally get classified by the very rule it's testing.

No other deviations. File list, preflight, lanes, timeout, jobs, `--list`, `--json`, `--only`,
exit-code semantics all implemented as specified.

## Acceptance criteria — evidence

### A1 — no file lost
`test:serial`'s chain parses to 95 steps (94 original + the appended `test_run_tests.js`).
`node run-tests.js --list` reports the same 95, same order:

```
$ node -e "...parse test:serial via split('&&')..."
parsed step count: 95
$ node run-tests.js --list | grep TOTAL
TOTAL files=95 plain=34 browser=61 listed=95
```

Programmatic (not eyeballed) equality is asserted directly in `test_run_tests.js`'s
`"A1: --list on the real repo yields exactly the parsed test:serial chain, same order"` test,
which independently parses `package.json`'s `test:serial` string via the exported
`parseFileList` and `assert.deepStrictEqual`s it against `--list`'s actual stdout — no hardcoded
count anywhere.

### A2 — fresh-clone honesty (mutation-proved)
```
$ mv node_modules /tmp/.../nm-stash-163
$ node run-tests.js
dependencies not installed — run `npm ci`
EXIT CODE: 2
```
Zero test-file output appeared (no PASS/FAIL/RUNNING lines — the process exits before the file
list is even executed). Restored immediately:
```
$ mv /tmp/.../nm-stash-163 node_modules
$ ls node_modules | wc -l
42
```
(42 packages, matching the pre-move count — nothing lost.)

### A3 — a red does not abort the run (mutation-proved)
```
$ md5sum test_lastmod_honesty.js
e0cf2d6512952b34a558740585f73e3a  test_lastmod_honesty.js
```
Injected a deliberately-failing `test(...)` block at the end of the file (an
`assert.strictEqual(1, 2, ...)`), then:
```
$ node run-tests.js --lane=plain
...
RESULT PASS  test_sitemap_cleanup.js       86ms
RESULT FAIL  test_lastmod_honesty.js       87ms
RESULT PASS  test_llms_freshness.js        84ms
...
TOTAL pass=33 fail=1 timeout=0 total=34
EXIT CODE: 1
```
All 34 plain-lane files ran (verified via `grep -c "^RESULT"` = 34), in original chain order;
`test_lastmod_honesty.js` is listed FAIL; exit code is 1 (non-zero). Restored and confirmed
byte-identical:
```
$ cp /tmp/.../test_lastmod_honesty.js.orig test_lastmod_honesty.js
$ md5sum test_lastmod_honesty.js
e0cf2d6512952b34a558740585f73e3a  test_lastmod_honesty.js   <- matches pre-mutation hash
```

### A4 — lane classification is transitive
```
$ node run-tests.js --list --lane=browser | grep -E "test_seo_surface_audit|test_audit_prescan"
test_seo_surface_audit.js	browser
test_audit_prescan.js	browser
$ node run-tests.js --list --lane=plain | grep -E "test_llms_rails|test_planner\.js"
test_planner.js	plain
test_llms_rails.js	plain
```
Both named files are classified correctly despite neither containing the literal marker string
themselves (confirmed: `grep -in playwright test_seo_surface_audit.js test_audit_prescan.js` →
no match) — they're caught via `require('./audit-app.js')`, which does mention it.

**Bonus finding, not just the two files the spec names as the proof case:** the transitive scanner
also correctly moves a *third* file, `test_audit_app.js`, into the browser lane for the identical
reason (it too requires `./audit-app.js` without mentioning the marker itself). The spec's A4 text
only names two files as "the concrete case that proves it," not an exhaustive list — this is the
classifier doing exactly what it's designed to do, not a bug. Net lane counts on the real chain
(95 files, including the newly-appended `test_run_tests.js`): **plain = 34, browser = 61.** A
literal one-level grep for the marker across the original 94 files finds exactly 58 direct
mentions (`94 - 58 = 36` naive-plain), and the transitive scan correctly moves 3 of those 36
(`test_seo_surface_audit.js`, `test_audit_prescan.js`, `test_audit_app.js`) into browser, leaving
33 true-plain + the 1 new file = 34. This reconciles with the operator's own baseline (see A6).

`test_run_tests.js` covers this same logic with isolated fixtures (direct mention, one-hop
transitive, two-hop transitive/depth, no-mention-stays-plain, and a circular-require pair that
must not hang or crash the scan) — all 5 fixture cases pass, see A9.

### A5 — timeout is enforced (mutation-proved)
Fixture dir (`node_modules/` present as an empty dir to clear preflight, a copy of `run-tests.js`,
a `sleepy.js` that never exits on its own via `setInterval`, and an `after.js` that exits 0):
```
$ node run-tests.js --lane=plain --timeout=2 --jobs=1
TIMEOUT     2.01s  sleepy.js
PASS        0.04s  after.js
RESULT TIMEOUT	sleepy.js	2014ms
RESULT PASS	after.js	40ms
TOTAL pass=1 fail=0 timeout=1 total=2
EXIT CODE: 1
```
Forced `--jobs=1` (strict serial) so the ordering itself proves continuation: `sleepy.js` times
out at ~2.01s (matching `--timeout=2`) and the run then proceeds to `after.js`, which passes.
Exit code is 1 (non-zero). Also covered with an isolated fixture in `test_run_tests.js` (A9).

### A6 — plain lane is green and fast
```
$ time node run-tests.js --lane=plain
...
TOTAL pass=34 fail=0 timeout=0 total=34

real	0m7.004s
```
**34 pass / 0 fail / 0 timeout, 34 total, ~7 seconds wall-clock.** No red revealed — matches the
operator's stated expectation exactly ("a correct plain lane should be fully green"). This is
34, not the operator's measured 36-file/34-pass baseline, because the transitive classifier
correctly moves the 2 files that were the operator's measured "failures" (both were the 90s cap
firing on `test_seo_surface_audit.js` / `test_audit_prescan.js`) into the browser lane, **and**
also correctly moves `test_audit_app.js` (see A4's bonus finding) — that file had been one of the
operator's 34 "passing" naive-plain files; moving it out just relocates a pass, so removing it and
adding the newly-appended `test_run_tests.js` nets back to 34, all green. No new red found; nothing
to ticket.

### A7 — browser lane, honestly bounded
Full lane (61 files, real Chromium) was **not** attempted — per spec, that's an automatic FAIL if
claimed green. Demonstrated instead on a 2-file named subset:
```
$ node run-tests.js --lane=browser --only=test_smoke.js,test_landing.js
TIMEOUT   120.03s  test_smoke.js
PASS       53.57s  test_landing.js
TOTAL pass=1 fail=0 timeout=1 total=2
real	2m53.678s
EXIT CODE: 1
```
`test_landing.js` passed at 53.57s. `test_smoke.js` hit the default 120s per-file cap — this
mirrors the spec's own Territory note that `test_search.js` needs ~550s standalone; `test_smoke.js`
apparently needs a similarly-raised `--timeout` when run under this harness rather than
standalone. **This is a finding, recorded here, not fixed** (per the spec's explicit non-goal:
"fixing any red the runner newly reveals... ticket it"). Candidate ticket: determine
`test_smoke.js`'s actual standalone runtime under the runner's process-spawn overhead and either
document a recommended `--timeout` for the browser lane or split/optimize the file.

**What was not run:** all 61 files, minus the 2 above = **59 browser-lane files not executed in
this session.** This includes `test_search.js` (documented ~550s need), the audit-suite files
(`test_audit_runner.js`, `test_audit_app.js`, `test_seo_surface_audit.js`, `test_audit_prescan.js`,
`test_audit_text_surfaces.js`, `test_audit_planner_surface.js`), and the remaining ~53 UI/CTA/
analytics browser tests. None of these were executed or asserted green in this session.

### A8 — `npm test` still gates
```
$ node -e "...pkg.scripts..."
has test:serial: true
test script: node run-tests.js
test:fast: node run-tests.js --lane=plain
test:browser: node run-tests.js --lane=browser
test:serial step count: 95
first step: node test_planner.js
last step: node test_run_tests.js

$ npm test -- --only=test_planner.js --lane=plain
> node run-tests.js --only=test_planner.js --lane=plain
PASS        0.11s  test_planner.js
TOTAL pass=1 fail=0 timeout=0 total=1
EXIT: 0
```
`npm test` dispatches to `run-tests.js` and correctly forwards CLI flags. Non-zero-exit-on-failure
is proven directly by A3 and A5 above (both invoked `run-tests.js` the same way `npm test` does,
just without the `npm` wrapper, to keep runs fast and scoped — running the *full* `npm test` would
attempt the entire 95-file/all-lanes chain, which is explicitly out of the timebox per A7).

**Minor finding, not a spec violation:** `--only=<name-that-matches-nothing>` selects 0 files and
exits 0 (vacuously "green") rather than erroring:
```
$ npm test -- --only=does_not_exist.js --lane=plain
TOTAL pass=0 fail=0 timeout=0 total=0
EXIT: 0
```
No acceptance criterion requires erroring on an empty selection, so this is not fixed here — noting
it as a candidate ticket (a typo'd `--only` value could silently produce a "passing" empty run).

### A9 — new test file
`test_run_tests.js` covers A1 (parseFileList unit + `--list` integration equality), A3 (fixture:
failing plain file doesn't abort the run, is reported FAIL, exit non-zero), A4 (5 fixture cases:
direct/one-hop/two-hop/no-mention/cyclic, plus 2 read-only checks against the real named files),
and A5 (fixture: timeout recorded, run continues) — 14 assertions, all local, no network, no
browser:
```
$ node test_run_tests.js
...
14 assertions passed
```
It's wired into `test:serial` (appended as the 95th step) and is itself in the **plain** lane
(`node run-tests.js --list --only=test_run_tests.js` → `test_run_tests.js  plain`) — see the
Deviations section above for what that required.

### A10 — scope
```
$ git status --porcelain
 M package.json
?? run-tests.js
?? test_run_tests.js

$ git diff --stat
 package.json | 5 ++++-
 1 file changed, 4 insertions(+), 1 deletion(-)
```
`package.json`'s diff is scripts-only (`test`, `test:fast`, `test:browser` added; `test:serial`
added holding the byte-identical original chain + the one appended line). Verified programmatically
that the pre-existing `test` chain string equals the new `test:serial` string with the appended
`" && node test_run_tests.js"` suffix stripped off (`true`). No dependency/devDependency touched, no
product file, no generated SEO surface, no `.github/workflows/` change, no trust-rail constant
touched. This notes file and the two new root files are the only additions.

## What I could NOT run, and why

- **The full browser lane (61 files, real Chromium)** — explicitly out of scope per A7's own
  wording ("expected to exceed the timebox... do NOT attempt it"). Only 2 of 61 were run (see A7).
  59 files, including `test_search.js` (~550s documented need) and the entire audit suite, have no
  observed result from this session.
- **A live two-concurrent-session port-collision test** for the browser lane's forced `--jobs=1`
  (the `162-notes.md`-documented `EADDRINUSE` scenario) — not attempted; would require deliberately
  running two overlapping browser-lane sessions, which risks exactly the collision the design is
  meant to prevent, for no acceptance-criterion payoff (A6/A7 don't ask for this, and forcing
  `browser-jobs=1` is enforced unconditionally in code regardless of `--jobs`, not something that
  needs a live collision to verify).
- **`npm test` run to completion (default `--lane=all`)** — would attempt all 95 files; not run for
  the same timebox reason as the full browser lane. Verified instead via scoped `--only`/`--lane`
  invocations through the `npm test --` wrapper (A8).

## Plain-lane numbers (headline)

**34 pass / 0 fail / 0 timeout, 34 total, ~7s wall-clock.** No red revealed in the plain lane.

## Candidate tickets (not fixed here, per the spec's non-goals)

1. `test_smoke.js` needs a per-file `--timeout` above the 120s default when run under
   `run-tests.js` (hit the cap in the A7 subset run); likely needs the same treatment as
   `test_search.js`.
2. `--only=<name>` that matches zero files exits 0 rather than erroring — a typo could silently
   report a "passing" empty run.
