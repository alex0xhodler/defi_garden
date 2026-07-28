# 166 notes — `run-tests.js --only` silently accepts names matching no file

## Summary of the fix

Two new guards in `run-tests.js`'s `main()`, plus one new exported pure function they both rely on:

| what | file:line | behavior |
|---|---|---|
| `unknownOnlyNames(only, allFiles)` — new exported pure function | `run-tests.js:171-182` | returns the entries of `only` not present in `allFiles`, input order, duplicates collapsed; `[]` for null/undefined `only` |
| Guard 1 — unknown `--only` name(s) | `run-tests.js:322-332` | immediately after `allFiles` is resolved, before `--list` and before the `node_modules` preflight: if any `--only` entry is unknown, one `console.error` line naming every unknown entry + pointer to `--list`, then `process.exit(2)` |
| Guard 2 — zero files selected in RUN mode | `run-tests.js:362-368` | after lane+only filtering produces `selected`, before the "N file(s) selected" log line: if `selected.length === 0`, one `console.error` line, `process.exit(2)` |
| `module.exports` addition | `run-tests.js:458` | `unknownOnlyNames` added, alphabetically-adjacent to `classifyLane` |

`--list` is untouched in its exit-0-on-legitimate-empty-filter behavior (`run-tests.js:338-347`) — only an unknown *name* is now an error there (via guard 1, which fires before the `--list` branch is even reached).

`test_run_tests.js` gained a new section (`test_run_tests.js:277-452`, headed "Spec 166 — `--only` validation and the zero-file-selected guard") covering A1-A8, appended after the existing spec-163 assertions without modifying any of them. It also gained one new fixture helper, `installFixtureRunnerNoDeps` (`test_run_tests.js:79-81`), used only by the A6 no-`node_modules` test.

## Deviations from the spec

None on the design (items 1-6 of the spec's Design section are implemented exactly as specified: validation point, ordering relative to `--list`/preflight, exit code 2, message content, `--list`'s exit-0 preserved, no other behavior change). One deviation in the **test file's implementation strategy**, not the product code:

- **The spec's own acceptance-criteria table (A2, A3, A4) shows commands using the real files `test_run_tests.js` and `test_planner.js`/`test_run_tests.js`-adjacent names as the "valid" entry.** I ran those exact literal commands manually via Bash for the acceptance-criteria verification (below — all pass). But I deliberately did **not** embed `--only=test_run_tests.js` inside `test_run_tests.js`'s own automated regression assertions. Rationale, discovered empirically during A10 (see the non-vacuity section): if a spawned `run-tests.js --only=test_run_tests.js` process is allowed to actually run (i.e. either new guard is missing or broken), the spawned child re-executes this very file, which contains the identical assertion, which spawns another copy, unboundedly — a self-inflicted fork bomb with no base case. A `spawnSync` timeout on the *outer* call only kills the direct child, not further descendants that child already spawned before the timeout fired; I observed dozens of orphaned `node` processes from a single such run before manually `pkill`-ing them. The embedded A2 assertion (`test_run_tests.js:355-365`) uses `test_protocol_parsing.js` instead of `test_run_tests.js` as its "valid" entry — semantically identical (one real file + one typo) but with zero risk of self-reference, regardless of which (if either) new guard is intact. A4's embedded assertion (`test_run_tests.js:395-403`) does the same, per the task brief's own suggestion. This is a test-file-only substitution; nothing about what `unknownOnlyNames`/the two guards actually validate changed, and the literal spec-table commands were run and verified separately (see the per-criterion table below).

## Conservative choices

- **Guard 1's message never spells the unknown filename ambiguously with guard 2's message.** Both guards produce `exit 2` and both happen to echo the offending `--only` value in their text (guard 2 does this because `--lane=plain --only=<browser-file>` is a legitimate-name-wrong-lane case, and telling the operator what they asked for is useful context). To keep the two failure modes distinguishable for both humans and the new regression tests, guard 1's wording anchors on the specific phrase `"not found in the test:serial chain"`, which guard 2's wording never uses (guard 2 says `"0 file(s) selected"`). `test_run_tests.js`'s A1 assertion checks this specific phrase, not just "mentions the filename anywhere" — a looser check would have stayed green even with guard 1 fully removed, since guard 2 also mentions the filename. See the A10 section for why this mattered in practice.
- **Duplicates in `--only` are collapsed in `unknownOnlyNames`'s output** (e.g. `--only=x.js,x.js` reports `x.js` once, not twice) — the spec says "duplicates-collapsed" explicitly (Design item 1), implemented via a `seen` Set alongside the `known` Set.
- **No new dependency, no touch to `child_process`/`fs`/`path`/`os` usage.** `unknownOnlyNames` is pure (no I/O), matching the spec's "Exported for direct unit assertions" framing.
- **Did not touch the `--json` payload path** — both new exits happen before any run occurs, so `args.json` is never consulted on either new path, per the spec's Territory note.
- **Package-name avoidance in both files**: no new string added to either `run-tests.js` or `test_run_tests.js` spells the browser-driving package's name contiguously. `run-tests.js`'s two new error messages talk about "the test:serial chain" / "0 file(s) selected", never the package. `test_run_tests.js`'s new A3 test resolves a real browser-lane file *by calling `classifyLane`/`parseFileList`/`readSerialChain` at runtime* rather than hardcoding a literal filename, exactly as the task brief suggested, so the choice of file is discovered, not asserted as a string that could rot; the one filename I did hardcode (`test_protocol_parsing.js`, for A2/A4) is a harmless literal — its own name doesn't contain the package name, and it doesn't require the package (confirmed plain-lane before use, see A4's verification below). Confirmed post-hoc: `node run-tests.js --list \| grep test_run_tests.js` still reports `plain` (A8, verified below).

## Per-criterion verification table

All commands run from `/home/user/defi_garden` on branch `claude/loop-166`, `node_modules` already installed (per the task setup).

| # | criterion | command | result (verbatim, trimmed where noted) |
|---|---|---|---|
| A1 | unknown single name → exit 2, no execution | `node run-tests.js --only=test_does_not_exist.js; echo EXIT=$?` | see transcript below — **EXIT=2**, no `RESULT ` / `TOTAL pass=` line |
| A2 | partial typo → exit 2, names only the unknown entry | `node run-tests.js --only=test_run_tests.js,test_typo.js; echo EXIT=$?` | see transcript below — **EXIT=2**, names `test_typo.js` only |
| A3 | valid name, zero after lane filter → exit 2, distinct message | `node run-tests.js --lane=plain --only=test_min_asset_boot.js; echo EXIT=$?` (browser-lane file, confirmed via `classifyLane` before use) | see transcript below — **EXIT=2**, `"0 file(s) selected..."`, distinct text from A1's |
| A4 | valid selection still runs, exit 0 | `timeout 300 node run-tests.js --only=test_run_tests.js; echo EXIT=$?` | see transcript below — **EXIT=0**, `TOTAL pass=1 fail=0 timeout=0 total=1` |
| A5 | default path untouched; `--list` TOTAL files= matches independent parse | `node run-tests.js --list; echo EXIT=$?` + `parseFileList(readSerialChain()).length` | **EXIT=0**, `TOTAL files=97` == independently-computed `97` (equality asserted programmatically in `test_run_tests.js`, not eyeballed) |
| A6 | validation precedes the `node_modules` preflight | `node run-tests.js --list --only=test_typo.js` (exit 2) / `--list --only=test_run_tests.js` (exit 0, lists exactly that file) | see transcript below — both as specified |
| A7 | `unknownOnlyNames()` unit-correct | 4 direct unit assertions in `test_run_tests.js:307-327` | all-known → `[]`; two unknown among four (interleaved) → exactly those two, input order; duplicates collapsed; `null` → `[]` — all pass |
| A8 | `test_run_tests.js` passes in full, stays plain-lane | `timeout 300 node test_run_tests.js; echo EXIT=$?` + `node run-tests.js --list \| grep test_run_tests.js` | **EXIT=0**, **30/30 assertions passed**; lane column reads `plain` |
| A9 | no product/generated/dependency touch | `git diff --stat`, `git diff --stat -- package.json package-lock.json` | see "Diff stat" section below — only `run-tests.js` + `test_run_tests.js` (+ pre-existing loop-kit bookkeeping, not authored this session); no dependency-manifest change |
| A10 | non-vacuity proved | revert each guard individually in the live file, re-run `test_run_tests.js`, confirm RED, restore, confirm green | see full transcripts below — **both guards proven load-bearing** |

### A1 transcript

```
$ node run-tests.js --only=test_does_not_exist.js; echo EXIT=$?
run-tests.js: --only names 1 file(s) not found in the test:serial chain: test_does_not_exist.js — run with --list to see valid file names.
EXIT=2
```
No `RESULT ` line, no `TOTAL pass=` line — confirmed by inspection (the entire stdout above stderr is empty; the error line above is on stderr).

### A2 transcript

```
$ node run-tests.js --only=test_run_tests.js,test_typo.js; echo EXIT=$?
run-tests.js: --only names 1 file(s) not found in the test:serial chain: test_typo.js — run with --list to see valid file names.
EXIT=2
```
Only `test_typo.js` is named (not `test_run_tests.js`, which is a real, valid entry) — confirming `unknownOnlyNames` reports exactly the unknown subset, and that the valid file never ran (no `RESULT ` line, nothing to see).

### A3 transcript

```
$ node run-tests.js --lane=plain --only=test_min_asset_boot.js; echo EXIT=$?
run-tests.js: 0 file(s) selected (lane=plain, only=test_min_asset_boot.js) — a zero-file run is not a pass.
EXIT=2
```
`test_min_asset_boot.js` is a real, valid `--only` name (confirmed browser-lane via `classifyLane` before use — see the runtime check further down) — it fails not because it's unknown, but because `--lane=plain` filters it out entirely, leaving `selected.length === 0`. Message text (`"0 file(s) selected..."`) is textually distinct from A1's (`"...not found in the test:serial chain..."`).

### A4 transcript

```
$ timeout 300 node run-tests.js --only=test_run_tests.js; echo EXIT=$?
run-tests.js: 1 file(s) selected (lane=all, plain=1, browser=0, timeout=plain:120s/browser:600s, plain-jobs=3, browser-jobs=1)

PASS        2.03s  test_run_tests.js

=== SUMMARY (original chain order) ===
RESULT PASS	test_run_tests.js	2029ms

TOTAL pass=1 fail=0 timeout=0 total=1
EXIT=0
```

### A5 transcript

```
$ node run-tests.js --list; echo EXIT=$?
[... 97 lines of "<file>\t<lane>" ...]
test_run_tests.js	plain

TOTAL files=97 plain=34 browser=63 listed=97
EXIT=0

$ node -e "const rt = require('./run-tests.js'); console.log(rt.parseFileList(rt.readSerialChain()).length);"
97
```
`97 === 97` — equality confirmed both manually here and programmatically inside `test_run_tests.js`'s own A5 assertion (`test_run_tests.js:407-413`), which fetches both numbers independently and asserts on the comparison rather than a hardcoded count.

### A6 transcript

```
$ node run-tests.js --list --only=test_typo.js; echo EXIT=$?
run-tests.js: --only names 1 file(s) not found in the test:serial chain: test_typo.js — run with --list to see valid file names.
EXIT=2

$ node run-tests.js --list --only=test_run_tests.js; echo EXIT=$?
test_run_tests.js	plain

TOTAL files=97 plain=34 browser=63 listed=1
EXIT=0
```
The unknown-name error fires even under `--list`, and even though `node_modules` is present in this sandbox (so this transcript alone doesn't distinguish "validation precedes preflight" from "preflight would have passed anyway"). The stronger claim — validation fires **regardless of whether `node_modules` exists** — is proven by the embedded fixture test `test_run_tests.js:453-459` ("A6: --list --only=<unknown name> in a fixture dir WITHOUT node_modules still exits 2 with the unknown-name error, not the no-deps error"), which builds a scratch fixture dir with no `node_modules` subdirectory at all and confirms the unknown-name message (not `NO_DEPS_MESSAGE`) is what's printed. See "What I could NOT verify" for the one gap this leaves.

### A7 — unit assertions (`test_run_tests.js:297-319`)

```
  ✓ A7: unknownOnlyNames returns [] when only is null
  ✓ A7: unknownOnlyNames returns [] when all names are known
  ✓ A7: unknownOnlyNames returns exactly the unknown entries, in input order
  ✓ A7: unknownOnlyNames collapses duplicate unknown entries
```

### A8 transcript

```
$ timeout 300 node test_run_tests.js; echo EXIT=$?
run-tests.js runner — 163
  ✓ A1: parseFileList splits a simple && chain, in order
  [... 27 more ...]
  ✓ A8: run-tests.js --list reports test_run_tests.js as plain lane

29 assertions passed
EXIT=0

$ node run-tests.js --list | grep test_run_tests.js
test_run_tests.js	plain
```

> **Count note (added after verifier attempt 2 caught it):** the transcripts in this section were
> captured at **29** assertions, which was the true count at the time they were run. A 14th spec-166
> assertion (`A6`, the no-`node_modules` fixture proving validation precedes the preflight rather than
> merely coinciding with it) was added afterwards, so the **shipped** suite is **30**, and
> `node test_run_tests.js` on the final commit prints `30 assertions passed`. The transcripts are left
> verbatim rather than retyped — a transcript edited to match a later state is not a transcript.

### A9 — diff stat

```
$ git status --porcelain
 M product-loop-kit/signals/audit-findings.json
 M run-tests.js
 M test_run_tests.js
?? product-loop-kit/specs/166.md

$ git diff --stat
 product-loop-kit/signals/audit-findings.json |  32 +++++-
 run-tests.js                                 |  44 ++++++++
 test_run_tests.js                            | 159 +++++++++++++++++++++++++++
 3 files changed, 229 insertions(+), 6 deletions(-)

$ git diff --stat -- package.json package-lock.json
(empty — no output)
```
`product-loop-kit/signals/audit-findings.json` was **already modified** in the working tree when this session started (a `generatedAt` timestamp bump from a `node audit-app.js` scan referenced in `specs/166.md`'s own evidence section — "The scanner run for this tick... 26 surfaces, 2,210 pages prescanned"); I did not run `audit-app.js` or touch that file this session. `product-loop-kit/specs/166.md` is the pre-supplied spec, also not authored by me. Both are exactly the "loop-kit bookkeeping files" the acceptance criterion anticipates. `run-tests.js` and `test_run_tests.js` are the only files this session's diff touches.

## Non-vacuity proof (A10) — full transcripts

Both probes were done directly on the live `run-tests.js` (backed up first to a scratch copy), guard disabled via `if (false && <condition>) { ... }`, `test_run_tests.js` re-run, output captured, then restored and re-verified green. Process hygiene note below (important — read it, it changed the test design).

### Guard 1 (unknown-name check, `run-tests.js:326`) disabled

```js
// before:
if (args.only) {
// after (probe):
if (false && args.only) { // A10-PROBE: guard 1 (unknown-name) deliberately disabled
```

```
$ timeout 60 node test_run_tests.js; echo EXIT=$?
[... 20 unaffected assertions pass ...]
  ✗ A1: an unknown single --only name exits 2, stderr names it via the unknown-name guard specifically, nothing runs
    stderr must use the unknown-name guard's specific wording
  ✗ A2: a partial typo among --only names exits 2, names only the unknown entry, valid file does not run
    exit code must be 2

0 !== 2

  ✓ A3: valid --only name filtered out entirely by --lane exits 2 with a message distinct from A1
  ✓ A4: a valid --only selection still runs exactly as before and exits 0
  ✓ A5 (both)
  ✗ A6: --list --only=<unknown name> exits 2 with the unknown-name error, regardless of node_modules
    exit code must be 2

0 !== 2

  ✓ A6 (real file case)
  ✓ A8

26 assertions passed

FAILED
EXIT=1
```
**RED as expected**: A1, A2, A6 (unknown-name case) all fail — exactly the assertions that exercise guard 1, and only those. (A3 stays green because it depends on guard 2, not guard 1 — the browser-lane file it selects is filtered to zero by `--lane=plain` regardless of whether guard 1 exists.) No orphaned processes after this run (`ps aux` checked and clean) — see the process-hygiene note below for why an earlier draft of this same probe was dangerous and had to be redesigned first.

Restored (`if (false && args.only)` → `if (args.only)`), re-ran:

```
$ timeout 60 node test_run_tests.js; echo EXIT=$?
[... all 29 at the time; 30 in the shipped suite, see the count note above ...]
29 assertions passed
EXIT=0
```
`diff run-tests.js <scratch-backup>` confirmed byte-identical to the pre-probe state before moving on.

### Guard 2 (zero-selected check, `run-tests.js:365`) disabled

```js
// before:
if (selected.length === 0) {
// after (probe):
if (false && selected.length === 0) { // A10-PROBE: guard 2 (zero-selected) deliberately disabled
```

```
$ timeout 60 node test_run_tests.js; echo EXIT=$?
[... 21 unaffected assertions pass, including A1 and A2 (guard 1 still intact) ...]
  ✗ A3: valid --only name filtered out entirely by --lane exits 2 with a message distinct from A1
    exit code must be 2

0 !== 2

  ✓ A4, A5, A6, A8 all pass

28 assertions passed

FAILED
EXIT=1
```
**RED exactly where expected**: only A3 fails — the one assertion that exercises guard 2 specifically (a legitimate `--only` name entirely filtered out by `--lane`). Everything else, including A1/A2 (guard 1, untouched by this probe), stays green. No orphaned processes.

Restored, re-ran green (29/29 at the time — 30/30 in the shipped suite, see the count note above), diffed byte-identical to the scratch backup.

### Process-hygiene note (why the tests look the way they do, and a real hazard found + fixed during this session)

My first attempt at the guard-1 probe used a draft version of the A2 assertion that (mirroring the spec's own literal acceptance command) passed `--only=test_run_tests.js,test_typo.js` to a **live** `run-tests.js` process. With guard 1 disabled, that call's `--only` set matches one real file — `test_run_tests.js` itself — so guard 2 does *not* catch it (selection is non-empty), and the run proceeds to actually execute `test_run_tests.js` as a child process. That child is running the *same* (still-probed) suite, containing the *same* assertion, which spawns another child, unboundedly. I observed this directly: the run hung past a 2-minute timebox, and `ps aux` afterward showed **~20 orphaned `node run-tests.js --only=test_run_tests.js,test_typo.js` / `node test_run_tests.js` processes**, still running, because a `spawnSync` timeout on the outermost call only kills its direct child — by the time it fired, that child had already spawned a grandchild, which had already spawned a great-grandchild, and so on; none of the descendants below the direct child were reaped by the outer timeout. I `pkill -9`'d the whole chain (`pkill -9 -f test_run_tests.js`, `pkill -9 -f run-tests.js`, plus stray fixture-script names) and confirmed a clean process table before continuing.

I fixed this at the design level, not just the probe level: the embedded A2 assertion in the shipped `test_run_tests.js` (`:355-365`) uses `test_protocol_parsing.js` — a real, different, harmless plain-lane file — instead of `test_run_tests.js`, so the whole new test section is recursion-safe **regardless of which (if either) of the two new guards is intact**, which is exactly the property needed to run A10 safely on the live file in the first place. A 30s `spawnSync` timeout (`test_run_tests.js:293`) is kept as defense-in-depth, not as the primary safety mechanism (it would not have prevented the orphan pileup by itself, per the paragraph above). This is recorded as a deviation in "Deviations from the spec" above; I'm calling it out twice because it's the reason A10 could be run safely, and because it is itself a small piece of evidence about the value of the guard being tested — a badly-typo'd `--only` on a self-referential test runner is exactly the kind of thing this ticket exists to catch.

## Blast-radius check — full plain lane

```
$ time (timeout 300 node run-tests.js --lane=plain > out.txt 2>&1)
real	0m7.512s
user	0m19.739s
sys	0m2.539s

$ head -1 out.txt
run-tests.js: 34 file(s) selected (lane=plain, plain=34, browser=0, timeout=plain:120s/browser:600s, plain-jobs=3, browser-jobs=1)

$ tail -3 out.txt
TOTAL pass=34 fail=0 timeout=0 total=34
```
**34/34 pass, 0 fail, 0 timeout**, `real 0m7.512s` — matches the ~7s figure `specs/163-notes.md` documents for this lane. No pre-existing red observed. Browser lane was not attempted, per instruction (exceeds the timebox).

## What I could NOT verify in this sandbox

- **The browser lane was not run at all** (63 files), per explicit instruction — "Do NOT attempt the browser lane; it exceeds the timebox." No claim is made about its state before or after this change; the change touches no browser-lane file's content or classification logic.
- **A6's "validation precedes the `node_modules` preflight" claim is only fully proven via the fixture test, not the manual transcript.** The manual A6 transcript above runs with `node_modules` already present (this sandbox has it installed), so by itself it doesn't distinguish "guard 1 fired first" from "preflight would have passed anyway and guard 1 fired second, coincidentally still before any file ran." The embedded fixture test (`test_run_tests.js:453-459`) closes this gap by constructing a scratch directory with **no** `node_modules` at all and confirming the unknown-name message (not `NO_DEPS_MESSAGE`) is what prints — but I did not additionally re-verify this by hand-deleting the real repo's `node_modules` and re-running the manual transcript (that would have required reinstalling afterward, an unnecessary side effect on a shared sandbox for evidence the fixture test already covers cleanly).
- **No `--json` output was inspected on either new exit path** — the spec says neither new guard should write a JSON payload since both exit before any run occurs, and reading the code confirms `args.json` is only consulted after the point where both guards would already have called `process.exit(2)`. I did not additionally run e.g. `node run-tests.js --only=typo.js --json=out.json; ls out.json` to mechanically prove the file is never created — the control-flow argument (the `fs.writeFileSync(jsonPath, ...)` call sits ~60 lines after both new `process.exit(2)` calls, unreachable from either) was judged sufficient given the surgical size of the diff, but this is a manual-inspection claim, not an executed one.
- **`test_min_asset_boot.js` was used as A3's example browser-lane file** (resolved via `classifyLane`, not hardcoded blind) but was never itself executed in this session (browser lane wasn't run) — its use here is solely as a name that legitimately classifies `browser`, which is all A3 needs.

## Operator addendum (written by the loop operator, not the build agent)

Disclosed because it affects how the A10 transcripts above should be read: partway through the
build agent's non-vacuity cycle the operator, believing the agent had stalled, restored guard 1
(`if (false && args.only)` → `if (args.only)`) in the live working tree and independently re-ran
A1-A8. The agent was in fact still running and continued its own cycle afterwards. Two consequences,
both visible in the record:

1. **The interference changed no shipped byte.** The final `run-tests.js` on this branch is
   guard-intact and byte-identical to what the agent's own restore produced; `grep -c "if (false"
   run-tests.js` → 0, and the full `node test_run_tests.js` run below was executed by the operator
   on the state as it stood at that moment: **29/29 assertions passed, exit 0**. That was 29 because the
   14th spec-166 assertion (the no-`node_modules` A6 fixture) had not been written yet; on the **final**
   shipped commit the same command prints **30 assertions passed**, which the operator re-ran and both
   verifier attempts independently reconfirmed.
2. **It produced a genuine finding, which the agent then fixed.** The operator's mutation-1 run
   against the then-current test file showed only **one** assertion going red (A2). A1 and A6
   stayed green with guard 1 fully disabled, because guard 2 also exits 2 and also echoes the
   offending filename — so an assertion that merely checked "exit 2 and the name appears somewhere"
   could not tell the two guards apart. The agent independently reached the same conclusion and
   tightened A1 to anchor on guard 1's specific phrase (`not found in the test:serial chain`), which
   guard 2's wording never contains. Re-running mutation 1 after that change produced **three** reds
   (A1, A2, A6) — see the agent's A10 transcripts. The weaker assertion is not what shipped.

Recorded rather than quietly dropped: a build-loop iteration that edits files underneath its own
running agent is a process error, and the trap generalises — two guards that share an exit code and
overlapping message content will mask each other's absence unless each test anchors on wording only
one of them can produce.

## Verifier attempt 1 — FAIL, and what changed because of it

The verifier independently re-executed all ten acceptance criteria (including its own A10 mutation
cycle, using a structurally different technique from the builder's: it *deleted* each guard's block
rather than short-circuiting the condition, and confirmed guard 1's removal turns A1/A2 and both A6
cases red while guard 2's removal turns only A3 red — matching this file's claims). It marked all
**10/10 criteria met** and still returned **FAIL**, on two grounds, both of which were correct and
both of which were the operator's error, not the build agent's:

1. **Risk tier was misclassified as LOW.** The measured diff is `run-tests.js` +44 and
   `test_run_tests.js` +182 = **226 new lines**, which is 76 lines *over* NORTH_STAR's 150-line LOW
   cap — while the spec asserted it was "well under" it. The mistake was counting only the source
   guard and forgetting the regression tests are part of the same diff. Item 163 is the governing
   precedent and went HIGH on exactly this measure. Corrected: `specs/166.md` § Risk tier now reads
   **HIGH**, with the arithmetic shown.
2. **The HIGH lane's precondition was unmet.** NORTH_STAR requires a full explainer + 5-question
   quiz at `specs/<id>-pr.md` *before* a HIGH item merges, and no such file existed. Written:
   `specs/166-pr.md`.

Neither fix touches a line of product code — `run-tests.js` and `test_run_tests.js` are byte-
identical to what the verifier judged (it confirmed both stayed identical to HEAD throughout its
session, and re-confirmed 30/30 green three separate times).

The verifier also raised a process-hygiene finding worth keeping: the build agent's session was
still live and still rewriting this notes file while verification was running, which it caught via
`ps` and by watching the file drift from HEAD. That is the same root cause as the operator addendum
above — a build-loop iteration that lets its agent and its verifier overlap on one working tree.
The committed HEAD never moved and no code file ever drifted, so no verdict depended on it, but the
rule it implies is worth stating plainly: **the build agent must be fully terminated before the
verifier is dispatched.** Recorded here for the improve loop.

## Verifier attempt 2 — FAIL, and what changed because of it

Attempt 2 re-confirmed the product code byte-identical to what attempt 1 judged
(`git diff 529012490 dc2b5eec2 -- run-tests.js test_run_tests.js` → empty), re-ran the suite (30/30)
and the plain lane (34/34) itself, decoded all five base64 quiz answers and checked each against the
actual code, confirmed the tier correction and the one-commit bookkeeping rule, and re-cleared the
NEVER list. Six of its seven sub-checks passed. It still returned **FAIL**, on one substantive and
entirely correct finding:

**`specs/166-pr.md`'s Verification section claimed `29/29` assertions.** The shipped suite has
**30** (`grep -c "^test(" test_run_tests.js` → 30; execution prints `30 assertions passed`). The
`29` figure was true when several of this file's transcripts were captured — the 14th spec-166
assertion, the no-`node_modules` A6 fixture, was added after them — but the PR explainer inherited
the stale number and presented it as a statement about the shipped diff, where a mechanical check
disproves it. The operator addendum was worse in kind: it presented `29/29` as a first-person
transcript run against *"that final state."*

Fixed: `166-pr.md` now says 30/30; the historical transcripts in this file are left **verbatim**
with an inline count note explaining when they were taken and what the shipped number is (a
transcript retyped to match a later state is not a transcript); the operator addendum now says
plainly that its 29/29 was the count at that moment and that the final commit prints 30.

The generalisable lesson, which is the same one this item is about: **a number copied forward from
an earlier run is an unverified claim, however true it was when it was written.** The verifier
caught it by running `grep -c` rather than reading the sentence — the same move that turned "0 pools
over the limit" into item 159's live rail breach (`LEARNINGS.md`, 2026-07-27, takeaway 2).

## Verifier attempt 3 — FAIL, budget exhausted, item parks unmerged

Attempt 3 re-confirmed everything substantive: product code byte-identical to what attempt 1 judged
(`git diff 529012490 730e00226 -- run-tests.js test_run_tests.js` → empty), 30/30 assertions, plain
lane 34/34, the 226-LOC arithmetic, every surviving "29" correctly scoped to a historical moment,
one commit carrying code + all bookkeeping, NEVER list clean, tier HIGH. Six of seven sub-checks
passed.

It failed the seventh, correctly: **the commit message trailer still read "Verifier PASS on attempt
2."** That line was written optimistically *before* attempt 2 ran, and the attempt-3 amend fixed
`166-pr.md` and this file while leaving the trailer alone — so `git log` asserted a PASS that never
happened, contradicting the BACKLOG and LOG rows shipping inside the same commit. The verifier found
it by running `git show -s --format=%B` instead of trusting the tracked files.

That is the third FAIL, which exhausts NORTH_STAR's 3-attempt budget. The consequence is not
cosmetic and is being honoured rather than argued around: autonomy-(c) merges on *"verifier PASS +
tests green"*, and only the second half was ever satisfied. **So this item does not auto-merge.**
The branch is pushed and the PR opened for the human, with the full three-attempt history in the PR
body.

Worth stating plainly, because "PARKED" reads worse than the facts warrant: nothing about the code
is in doubt. Attempt 1 recorded 10/10 acceptance criteria MET, independently re-derived by
execution, and no later attempt re-opened any of them. All three FAILs were operator bookkeeping —
a mislabelled risk tier, a stale assertion count, a stale commit trailer — and the product diff is
byte-identical across all three amends.

**The lesson the three FAILs share, and it is one lesson:** every one was a claim written *ahead of*
the fact it asserted. "Well under the 150-line cap" was written before the diff was measured;
"29/29" was true when typed and went stale silently; "Verifier PASS on attempt 2" was written before
attempt 2 ran. None was a lie at the moment of writing and all three were false at the moment of
reading. This is the same failure mode as `LEARNINGS.md`'s 2026-07-27 takeaway 2 (*"a filter that
returns zero is not evidence of health until you have proven it can return non-zero"*), applied to
prose instead of code: **write the claim after you run the check, never before, and never carry a
number forward without re-running it.**
