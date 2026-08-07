# 192 — build notes

## What shipped

Three parts, all inside `audit-app.js` (loop tooling, no product surface):

1. `DEFAULT_POOL_SAMPLE` 6 -> 32, `MAX_POOL_SAMPLE` 6 -> 64 (this time deliberately set
   *above* the default, so `AUDIT_POOL_SAMPLE` can raise the sample as well as lower it —
   191 hit the opposite trap). Justified inline, in the constants' own comment block, by
   the operator's three pre-spec measurements; 191's own comment/history is kept verbatim
   above the new paragraph, with the one sentence 192 supersedes ("raising it further needs
   `MAX_POOL_SAMPLE` raised...") explicitly marked SUPERSEDED rather than deleted.
2. A wall-clock guard, `AUDIT_TIME_BUDGET_MS` (default `DEFAULT_TIME_BUDGET_MS`, itself
   `FOREGROUND_CAP_MS` — the 300s/5-minute standing cap turned into an actual constant for
   the first time, since none existed to derive from). Only surfaces `buildPoolSurfaces()`
   marks `rotationPick: true` are ever skippable; the anchor, prescan-promoted surfaces, and
   every other named surface (static/text/i18n/landing/planner/bloom/...) are structurally
   unreachable by the guard because they never carry that marker.
3. The honesty reconciliation: `runAudit()` now strips any rotation id the guard skipped
   from the persisted `seen[]` *unless* it was already legitimately seen in an earlier run
   (via the new `baseSeen` field `buildPoolSurfaces()` returns), and exposes
   `poolRotation.renderedCount`/`.truncated`/`.timeBudgetMs` in both
   `signals/audit-findings.json` and the CLI console summary. The full-pass throughput line
   is now derived from `renderedCount`, never `sampleSize`/`picked.length`.

### Files changed (vs `origin/main`)

- `audit-app.js` — **+274/-52** lines (`git diff origin/main --stat`). Constants
  (`FOREGROUND_CAP_MS`, `DEFAULT_TIME_BUDGET_MS`, `DEFAULT_POOL_SAMPLE`/`MAX_POOL_SAMPLE`
  raised with their comment history preserved), the `AUDIT_POOL_SAMPLE`/new
  `AUDIT_TIME_BUDGET_MS` usage-doc block, `buildPoolSurfaces()` (`poolId`/`rotationPick`
  markers on `extraSurfaces`, `baseSeen` + optimistic `renderedCount`/`truncated` on the
  return shape), `emptyPoolRotationResult()` (new fields), `runAudit()` (budget resolution
  + `runStartTime`, the render-loop guard, the post-loop reconciliation +
  `poolRotation` enrichment), the CLI's two console lines, and the exports list
  (`FOREGROUND_CAP_MS`, `DEFAULT_TIME_BUDGET_MS`).
- `test_audit_cta_provenance.js` — **+187/-27** lines. Scaled five existing 191 fixtures
  that were sized "comfortably above 6" (191's own margin) and silently stopped proving
  anything once `DEFAULT_POOL_SAMPLE`/`MAX_POOL_SAMPLE` moved past their fixed `20`/`8`/`30`
  candidate counts (interpolated off the exported constants instead — item-159 rule); added
  three new real-Chromium `runAudit()` tests for the wall-clock guard (fires, is inert on
  the normal budget, and the honesty/re-pick round-trip).
- `test_audit_pool_prescan.js` — **+20/-4** lines. Scaled two fixtures (A6's
  `opts.poolPrescan:false` case, A5's different-seed rotation case) that hit the exact same
  trap — both had fixed candidate counts (`20`, `30`) below the new `DEFAULT_POOL_SAMPLE`
  (32), which silently made `computeRotation()` cap at the candidate count instead of the
  sample size, passing the assertions for the wrong reason.

No product file, trust rail, router, SEO artifact, or `package.json` touched — confirmed
by `git diff --stat` against `origin/main` showing only the three files above (plus this
notes file and the pre-existing `specs/192.md`, both docs).

## Measurement — why 32/64, not a lower or higher value

**Not re-measured, per the spec's explicit instruction** ("do NOT re-run it; the three
timings in §Evidence are this run's operator measurements and are the justification of
record"). The operator's three pre-spec timings, restated here (and in the constants' own
comment in `audit-app.js`) because the justification must travel with the code:

| `AUDIT_POOL_SAMPLE` | wall-clock | exit | findings |
|---|---|---|---|
| 6 (old default) | 111s | 0 | 1 total, 0 blocking |
| 16 | 111s | 0 | 1 total, 0 blocking |
| 32 | 116s | 1 | 3 total, 2 blocking (1 P0 + 1 P1) |

Marginal cost per rendered pool-detail: ~0.19s (+5s of wall-clock for 26 extra renders,
6 -> 32) — confirms, does not contradict, 191's own finding that per-pool render cost is
not the bottleneck (fixed costs — live fetches, the 2,183-page static prescan — dominate).
32 is the largest *measured* value (116s = 39% of `FOREGROUND_CAP_MS`), landing well inside
this item's own <=180s (60% of the cap) target. 64 (`MAX_POOL_SAMPLE`) is bounded by the
same measurement extrapolated, not by taste: ~0.19s/render * 64 ~= 12s of rendering, on top
of the ~104-111s fixed-cost floor 191/192 both measured, extrapolating to ~116-122s — still
comfortably under 180s.

**My own post-change measurement** (this checkout, this build session, one foreground run,
`AUDIT_ROTATION_STATE` redirected to a scratch file under this session's scratchpad so the
tracked `audit-rotation.json` was never touched; `audit-findings.json` **was** overwritten
by this run, as the task instructions say it must be, and restored via
`git checkout -- product-loop-kit/signals/audit-findings.json` immediately after reading it
back — confirmed by `git status --short` showing it clean afterward):

```
$ s=$(date +%s); AUDIT_ROTATION_STATE=<scratch path> node audit-app.js > run.log 2> run.err; \
  echo exit=$? elapsed=$(( $(date +%s) - s ))s
exit=1 elapsed=116s
```

- `[audit] findings: 2 total, 1 blocking (P0/P1)`
- `[audit] pool rotation: cycle 0, seen 34/739 candidates, picked [...32 ids...],
  rendered 32/32, wrapped=false`
- `[audit] rotation throughput (rotation-only, excludes anchor + prescan-promoted ids,
  uses RENDERED not picked count): 32 pool-details/tick over 739 rotation candidates ->
  full pass ~24 ticks (~days)` — `ceil(739/32) = 24`, matching 191's own arithmetic style
  (191 reported ~124 ticks at 6; 24 at 32 is the expected further ~5.2x cut).
- Read back programmatically from the (pre-restore) `signals/audit-findings.json`:
  `poolRotation = { picked.length: 32, sampleSize: 32, renderedCount: 32, truncated: false,
  candidateCount: 739 }` — satisfies the "picked has the new default length, read from the
  emitted findings JSON" acceptance criterion directly.

**116s measured, both today and at spec-writing time** — the run stayed exactly where the
spec predicted (39% of the 300s cap, well under the 180s target), the wall-clock guard
never engaged (`truncated: false`, `timeBudgetMs: 300000` — the untouched default), and the
one blocking finding is discussed honestly in "Noticed, deliberately not fixed" below (it is
the same live P0 class the spec's own evidence section already surfaced and separately
filed, not a new regression this item introduces).

### Why `AUDIT_TIME_BUDGET_MS` defaults to `FOREGROUND_CAP_MS` itself, not a fraction of it

The spec says "derived from the existing 300s cap constant if one exists — never a second
hardcoded literal." No such constant existed anywhere in `audit-app.js` before this item —
the "300s/5-minute foreground cap" was prose repeated across several comments, never a
number the code could read. I added exactly one (`FOREGROUND_CAP_MS = 300 * 1000`) and set
`DEFAULT_TIME_BUDGET_MS = FOREGROUND_CAP_MS` — an identity mapping, not an arbitrary
fraction. Reasoning: the guard's whole job (per the spec's own words) is "the raised
ceiling can never cost a finished run" — i.e. it protects the *same* 300s the standing
2026-07-11 decision already governs, not some independently-chosen fraction of it, which
would just be a second unjustified number this spec doesn't ask for. The tighter <=180s
target this item sets is instead achieved *architecturally*, by the part-1 ceiling choice
itself (32 measured at 116s, 64 extrapolated to ~122s) — the guard is the safety net for an
*abnormal* day (a latency spike, or someone raising `AUDIT_POOL_SAMPLE` toward 64 on a slow
day) where that architectural margin stops holding, not the thing enforcing the ordinary
case. Because rotation-picked surfaces are spliced early in the surface list (right after
`pool-detail-ko`, well before the static-page leg), a default budget equal to the full 300s
cap is still effectively inert on every normal run — confirmed by the real 116s run above
(`truncated: false`) and by the dedicated "guard inert on the normal budget" test.

## The `rotationPick` marker (Territory notes' named hazard)

The spec's own territory notes called this "the most likely way to build the guard subtly
wrong": rotation-picked and prescan-promoted `pool-detail:<prefix>` surfaces are otherwise
byte-identical in shape (`kind: 'pool'`, same name pattern), so a guard keyed off the name
prefix would also catch — and could skip — promoted surfaces, which the spec explicitly
forbids. `buildPoolSurfaces()` now sets `rotationPick: true` **only** on the surfaces it
pushes from `rotationPicks` (the seeded-rotation output), never on `promotedIds`-derived
entries, never on the anchor, and never on the `AUDIT_POOL_IDS` override path's entries.
The render loop's guard checks `s.rotationPick` — a real field, not a name-shape inference —
so a promoted surface is structurally unreachable by the guard regardless of what its name
happens to look like. Verified two ways: (a) a fixture-level assertion
(`pre.extraSurfaces.every((s) => s.rotationPick === true)`) in the new guard tests, on a
fixture with `poolPrescan: false` so every `extraSurfaces` entry IS a rotation pick by
construction (a promotion-present fixture would additionally need to assert the promoted
entries do NOT carry the marker — not separately re-tested here since 167/171's own
promotion tests already pin `extraSurfaces`' promoted-then-rotation-picks ordering and this
item does not touch that ordering); (b) the real 116s run above rendered `pool-detail:201e5f6e`
(a `pool-prescan` promotion, visible in `surfacesCovered` immediately after the four named
anchor surfaces, before the 32 rotation picks) with `truncated: false` and it was never at
risk of being skipped since the guard never even evaluates non-`rotationPick` surfaces.

## The honesty reconciliation (spec's highest-risk line)

`buildPoolSurfaces()` computes `rotationState`/`poolRotation` **optimistically** — as if
every pick would render, because it does no rendering and cannot know better. It now also
returns `baseSeen`: the exact `seen[]` this run's picks were layered on top of (empty on a
wrap, otherwise the prior committed state). `runAudit()`, after the render loop, computes
`newlySkipped = skippedRotationIds.filter(id => !baseSeenSet.has(id))` and strips only
those ids from the persisted `seen[]`. The `baseSeen` filter is the load-bearing part: it is
what stops the reconciliation from *wrongly* punishing an id that was already legitimately
seen in an earlier run and merely got re-picked this run (183's "fill from seen once unseen
is exhausted" path) and then skipped — that id's *prior* coverage is real and must not be
erased just because this run didn't re-render it. Proven directly by the new
"192 honesty" test: a fully-truncated run (tiny budget, all 3 picks skipped) persists
`seen == [anchor only]`, and the very next run — same seed, same candidates, normal budget —
deterministically re-picks the *exact* same 3 ids (proven by array equality, not merely "is
eligible"), renders them for real this time, and *then* they land in `seen`.

## Deviations from the spec, and why

- **`AUDIT_TIME_BUDGET_MS`'s exact default value.** The spec specifies "derived from the
  existing 300s cap constant," not the precise formula. I chose identity
  (`DEFAULT_TIME_BUDGET_MS = FOREGROUND_CAP_MS`) over an arbitrary fraction — reasoning
  given above. This is a judgment call the spec left open; a different, still-defensible
  choice (e.g. 90% of the cap, leaving explicit teardown headroom) was available and I did
  not take it, on the grounds that inventing a fraction with no measurement behind it would
  itself be "a second unjustified number."
- **The byte-identity proof for `computeRotation()`/`sampleBySeed()`/`hashSeed()`** is a
  build-time verification (documented below), not a new permanent automated test — asserting
  byte-identity against a moving `origin/main` ref inside a committed test would itself be a
  fragile, non-repeatable gate (the ref moves; the test would need updating on every future
  merge to main for reasons unrelated to this item). 191 set this precedent: its own
  "explicitly out of scope, confirmed untouched" claims were verified the same way
  (`git diff --stat`), not with a dedicated byte-diff test. Recorded here instead, with the
  actual command and output (see below), which is the durable artifact a future reader needs.
- **`poolRotation.timeBudgetMs`** is a field the spec's acceptance criteria don't explicitly
  ask for, added so the console's `TRUNCATED (...)` note and a reader of the raw JSON never
  have to re-read code to know what budget a truncated run was measured against — same
  "legible, not implicit" spirit as 191's own throughput line. Not scope creep in the sense
  of touching anything the spec puts out of scope; purely additive to the existing
  `poolRotation` shape.
- **Fixture scaling beyond the one line the spec named.** The spec explicitly calls out
  `test_audit_pool_prescan.js:165` as "the fix, not scope creep." Build-time testing found
  **four more** instances of the identical trap (three in `test_audit_cta_provenance.js`'s
  191-era fixtures sized `poolFixture(20)`/`poolFixture(8)`, one more in
  `test_audit_pool_prescan.js`'s A5 different-seed rotation case, fixed at `Array.from({length: 30})`)
  — all silently stopped proving what they claimed to prove once `DEFAULT_POOL_SAMPLE`
  exceeded their fixed candidate counts (`computeRotation()` caps `picked.length` at the
  candidate count when candidates < sampleSize, so an under-sized fixture passes for the
  wrong reason: not because the logic is correct, but because there weren't enough
  candidates to tell the difference). Every fix interpolates the exported
  `DEFAULT_POOL_SAMPLE`/`MAX_POOL_SAMPLE` constants, never a re-typed literal. This is the
  same class of fix the spec pre-authorized at one specific line; I extended it everywhere
  the same trap actually existed rather than fixing only the one line the spec happened to
  name, since leaving the other four red (or, worse, silently-passing-for-the-wrong-reason)
  would have left exactly the dishonesty this item's part 3 exists to prevent, one layer up
  in the test suite itself.

## Verification

### Baseline (pre-existing red), measured on a clean checkout

`HEAD` (before this item's changes) was byte-identical to `origin/main`
(`git rev-parse HEAD` == `git rev-parse origin/main`), so the baseline was taken via
`git stash push -- audit-app.js test_audit_cta_provenance.js test_audit_pool_prescan.js`
(the only three files this item ever touched), running the required suites, then
`git stash pop`.

| Command | Result on clean `origin/main` |
|---|---|
| `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` | PASS (208 / 9 / 9 assertions) |
| `node test_audit_app.js` | PASS (3 passed, 0 failed) |
| `node test_audit_runner.js` | PASS (9 assertions) |
| `node test_audit_pool_prescan.js` | PASS (14 passed, 0 failed) |
| `node test_audit_prescan.js` | PASS (48 passed, 0 failed) |
| `node test_audit_cta_provenance.js` | PASS (28 passed, 0 failed) |

**No pre-existing red anywhere in the required suite family.** Nothing to classify under
`pre-existing-red-triage.md`.

### After the change

| Command | Result |
|---|---|
| `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` | PASS (208 / 9 / 9 assertions) |
| `node test_audit_app.js` | PASS (3 passed, 0 failed) |
| `node test_audit_runner.js` | PASS (9 assertions) |
| `node test_audit_pool_prescan.js` | PASS (14 passed, 0 failed — includes the 2 rescaled fixtures) |
| `node test_audit_prescan.js` | PASS (48 passed, 0 failed; wall-clock 1m43s) |
| `node test_audit_cta_provenance.js` | PASS (31 passed, 0 failed — 28 pre-existing (3 rescaled) + 3 new backlog-192 guard/honesty cases; wall-clock 13s) |

### Byte-identity proof: `computeRotation()`/`sampleBySeed()`/`hashSeed()` untouched

```
$ git diff origin/main -- audit-app.js | grep -n '^@@'
@@ -83,14 +83,34 @@             (doc comment block, line 83 in the OLD file)
@@ -218,6 +238,15 @@ const POOL_ID_UUID_RE ...
@@ -233,11 +262,39 @@ const DEFAULT_POOL_PRESCAN_MAX = 2; // promotion cap
@@ -314,6 +371,22 @@ const DEFAULT_ROTATION_STATE_PATH ...
@@ -2185,8 +2258,10 @@ function emptyPoolRotationResult() {
@@ -2213,19 +2288,29 @@ function emptyPoolRotationResult() {
@@ -2238,14 +2323,18 @@ function buildPoolSurfaces(opts = {}) {
@@ -2328,8 +2417,13 @@ function buildPoolSurfaces(opts = {}) {
@@ -2352,8 +2446,16 @@ function buildPoolSurfaces(opts = {}) {
@@ -2375,10 +2477,26 @@ function buildPoolSurfaces(opts = {}) {
@@ -3077,6 +3195,15 @@ function reconcilePrescanFindings(aggregateFindings, opts) {
@@ -3275,8 +3402,27 @@ async function runAudit(opts = {}) {
@@ -3286,6 +3432,42 @@ async function runAudit(opts = {}) {
@@ -3390,7 +3572,11 @@ module.exports = {
@@ -3430,7 +3616,12 @@ if (require.main === module) {
@@ -3439,12 +3630,17 @@ if (require.main === module) {

$ grep -n '^function hashSeed(\|^function sampleBySeed(\|^function computeRotation(' \
    <(git show origin/main:audit-app.js)
850:function hashSeed(str) {
872:function sampleBySeed(sortedList, count, seed) {
2137:function computeRotation(candidates, sampleSize, seed, state) {
```

None of the diff hunks' ranges overlap lines 850-887 (`hashSeed`/`sampleBySeed`) or
2137-2166 (`computeRotation`) in the old file's line numbering — confirmed directly, not
just by range-eyeballing:

```
$ awk '/^function hashSeed\(/,/^}/' <(git show origin/main:audit-app.js) > /tmp/a.txt
$ awk '/^function hashSeed\(/,/^}/' audit-app.js > /tmp/b.txt
$ diff /tmp/a.txt /tmp/b.txt && echo IDENTICAL
IDENTICAL
# same for sampleBySeed and computeRotation — all three IDENTICAL
```

Also: 191's own golden pin (`test_audit_cta_provenance.js`, "191 (d)(i)") still passes
unmodified — `computeRotation(candidates, 2, seed, state)` at its own sample size (2)
still returns `['golden-007', 'golden-002']`, exactly as before 192.

### Full `node audit-app.js` run at the new default

```
$ s=$(date +%s); AUDIT_ROTATION_STATE=<scratch>/audit-rotation-192-postchange.json \
    timeout 300 node audit-app.js > run.log 2> run.err
$ echo exit=$? elapsed=$(( $(date +%s) - s ))s
exit=1 elapsed=116s
```

**116s <= 180s target.** Read back programmatically (before restoring the file):

```js
const r = require('./product-loop-kit/signals/audit-findings.json');
// r.poolRotation.picked.length === 32
// r.poolRotation.sampleSize === 32
// r.poolRotation.renderedCount === 32
// r.poolRotation.truncated === false
// r.poolRotation.candidateCount === 739
```

`product-loop-kit/signals/audit-findings.json` was restored immediately after
(`git checkout -- product-loop-kit/signals/audit-findings.json`); `git status --short`
confirmed afterward that no tracked signal file was left modified — only
`test_audit_cta_provenance.js` (this item's own test changes) remained in the working tree
at that point.

## Noticed, deliberately not fixed

- **The 116s run's one blocking (P0) finding is the same live bug class the spec's own
  evidence section already found and filed separately, not a regression this item
  introduces.** My run hit `pool-detail:18b7d006` with the identical astronomical value
  `"11111111111111111111111111111111111111112"` (`1.11e+40`) the spec's evidence quoted for
  a *different* pool (`pool-detail:3075a746`) — different pool because my run used a fresh
  scratch rotation state (a different candidate subset gets picked than the operator's own
  tracked-state run), same underlying value, which is the tail of a base58 wrapped-SOL mint
  address (`So1111...112`) being parsed as a number by `scanNumbers()`'s boundary-free
  regex — already diagnosed and filed (visible in this session's scratchpad as backlog rows
  193/194, written by the operator from this exact measurement run, per spec's "both are
  filed as their own backlog rows from this run's evidence"). One-item rule: not fixed here.
- **`AUDIT_POOL_IDS`-override mode's `extraSurfaces` now also carry `poolId`** (shape parity
  with the promoted/rotation paths) even though nothing reads it in that mode (rotation state
  is `null` there, so no reconciliation ever runs) — purely for consistency, not because
  anything needed it.
- **`test_seo_surface_audit.js`'s unscoped `runAudit({port: 8901, ...})` call (criterion 1)**
  now implicitly renders the full new default (32 rotation picks instead of 6) since it sets
  no `only`/`poolSample` override. I did not re-run this file (it's outside the spec's named
  test list and outside the "reuse before inventing" scope this item budgets for) — the
  seven `runAudit()` calls in that file already run concurrently specifically because one of
  them (the static-prescan leg) dominates wall-clock, so the added ~5s of rotation-render
  cost is very unlikely to change its pass/fail outcome, but I have not proven that and am
  saying so rather than claiming it.
- **The wrap-test comment in `test_audit_cta_provenance.js` ("191/192 (e)")** now sizes its
  fixture at `DEFAULT_POOL_SAMPLE + 2` (34 candidates) instead of a literal `8` — this makes
  the fixture larger than what the phrase "small fixture" might suggest, but it is still a
  cheap in-memory pure-function test (no render, no fs beyond the two temp files other tests
  already use), and sizing it any smaller would silently break the "reach a wrap in a few
  runs" property the moment `DEFAULT_POOL_SAMPLE` is next raised.
- **Did not verify** whether any heartbeat/dashboard tooling outside `audit-app.js` (e.g.
  `scripts/dashboard-server.js`) reads `poolRotation.sampleSize` and assumes it never exceeds
  the old ceiling of 6 — out of scope per the task brief (audit-app.js + tests only), but
  flagging it as unverified rather than silently assuming it's fine.
- **An automated interim "wip(loop)" snapshot commit appeared on this branch during the
  build session** (`3cba1ba2f`, message "item 192 in-progress build snapshot (interim,
  squashed before push)"), capturing `audit-app.js`/`test_audit_pool_prescan.js`/an earlier
  revision of `test_audit_cta_provenance.js` at that point in time. I did not run `git
  commit` at any point in this session — this reads as a platform/stop-hook-level checkpoint
  mechanism (its own commit message says "squashed before push," implying it is not the
  final form), not an action I took. Noting it here for the operator's awareness since the
  task brief says "leave your work in the working tree" and I want to be explicit that any
  commit present on this branch was not one I authored via a git command.

## Instrumentation

None, as the spec requires. Loop tooling, no user-facing change, no product event, no
`translations.js` string — EN+KO satisfied vacuously (stated per spec's explicit
requirement not to leave this unsaid).

## Verifier fix, attempt 2 (2026-07-31) — the `baseSeen` protection had no test that could catch its removal

### The verifier's finding

The honesty reconciliation's `baseSeen` protection at `audit-app.js:3449-3450` — the filter
that stops the guard from stripping an id's PRIOR legitimate coverage when that id is
re-picked via `computeRotation()`'s "fill from seen" branch and then skipped this run — had
no automated test that would catch its removal. Mutating

```js
const newlySkipped = skippedRotationIds.filter((id) => id && !baseSeenSet.has(id));
```

to

```js
const newlySkipped = skippedRotationIds.filter((id) => id);
```

(unconditionally stripping every skipped id, including already-legitimately-seen ones) left
all 31 + 14 tests in `test_audit_cta_provenance.js` and `test_audit_pool_prescan.js` GREEN.
The shipped "192 honesty" test only ever exercises a fresh state (`baseSeen=[]`, a brand-new
`{cycle:0, seen:[]}` rotation file), where correct and broken code produce identical output —
`newlySkipped` is the same set either way when nothing was ever seen before this run.

### The correction to this file's earlier claim

Above, in "The honesty reconciliation" section, this file said the `baseSeen` filter was
"proven directly by the new '192 honesty' test." **That overclaimed.** The existing "192
honesty" test proves the *other* half of the honesty requirement — that a skipped id must
not gain NEW coverage it never earned (`seen == [anchor only]` after a fully-truncated
fresh-state run, then the exact same ids re-picked and rendered next run). It says nothing
about the `baseSeenSet` branch specifically, because its fixture's `baseSeen` is always `[]`
— the filter and its removal are indistinguishable on that fixture. The half the earlier
claim did NOT prove — that a skipped id's PRIOR (already-committed, earlier-run) coverage is
preserved rather than wrongly erased — was untested until the new test below.

### The new test

Added to `test_audit_cta_provenance.js`, immediately after the existing "192 honesty"
test, immediately before "invariant (operator review round 2)":

**`192 honesty (baseSeen protection, verifier attack-192-2): a skipped rotation pick already
covered by an EARLIER run keeps its prior coverage; a skipped never-before-seen pick from the
same run does not gain any`**

What it does, matching the verifier's four required elements exactly:

(a) **Real, non-empty prior `seen`, containing non-anchor ids**: 5 non-anchor candidate pools
(`cleanPool(0..4)`); the prior committed rotation state is `{cycle:0, seen:[anchorId,
p0000000, p0000001, p0000002, p0000003]}` — 4 of the 5 candidates plus the anchor, leaving
exactly one candidate (`p0000004`) unseen.

(b) **A run whose rotation pick includes an already-seen id via the "fill from seen"
branch**: with `poolSample=3` and only 1 unseen candidate, `computeRotation()`'s `unseen`
pool (length 1) is exhausted after a single pick, forcing the fill-from-seen branch
(`audit-app.js` ~2228-2237) to supply the other 2 picks from the 4 already-seen candidates.
A pure `buildPoolSurfaces()` pre-computation (no render) confirms this wiring before spending
any Chromium time: `pickedIds.length === 3`, at least one pick is a member of `priorSeen`
(the fill-from-seen picks) and at least one is not (`p0000004`, the sole never-before-seen
pick) — both asserted as fixture-wiring checks, so the test fails loudly (not silently) if a
future change to `computeRotation()`'s branch order stops engaging the fill path here.

(c) **Trips the time-budget guard so the already-seen id is among the SKIPPED ones**:
`timeBudgetMs: 1` trips the guard before the first rotation-picked surface renders, so all
3 picks — the fill-from-seen ids and the never-before-seen id together — land in
`skippedRotationIds` in the same run, exactly the mixed shape the finding requires to
distinguish the two id classes.

(d) **Asserts persisted `seen` after that run STILL contains the already-seen skipped
id(s), AND that the newly-skipped never-before-seen id is ABSENT**: reads back
`signals`-equivalent state from the scratch `rotationPath` file
(`os.tmpdir()/audit-rotation-192-baseseen-<pid>.json`, the same temp-file pattern the
sibling 192 guard/honesty tests already use — no tracked signal file touched) and asserts,
per id, both directions — plus that the untouched prior-seen candidates and the anchor
remain undisturbed.

### Mutation-kill evidence

**1. New test PASSES on the current (unmutated) implementation:**

```
$ timeout 300 node test_audit_cta_provenance.js
...
  ✓ 192 honesty (baseSeen protection, verifier attack-192-2): a skipped rotation pick
    already covered by an EARLIER run keeps its prior coverage; a skipped never-before-seen
    pick from the same run does not gain any
...
test_audit_cta_provenance.js: 32 passed, 0 failed
```

**2. New test FAILS (RED) under the exact mutation the finding names**, applied to
`audit-app.js:3450` (`newlySkipped = skippedRotationIds.filter((id) => id && !baseSeenSet.has(id))`
-> `skippedRotationIds.filter((id) => id)`):

```
$ timeout 300 node test_audit_cta_provenance.js
...
  ✗ 192 honesty (baseSeen protection, verifier attack-192-2): a skipped rotation pick
    already covered by an EARLIER run keeps its prior coverage; a skipped never-before-seen
    pick from the same run does not gain any
    THE baseSeen PROTECTION (this is the line the verifier's finding attacks): expected
    already-seen pick p0000000 — skipped THIS run, but legitimately covered by the EARLIER
    run that seeded priorState — to REMAIN in persisted seen; got
    ["747c1d2a-c668-4682-b9f9-296708a3dd90","p0000001","p0000003"]
...
test_audit_cta_provenance.js: 31 passed, 1 failed
```

All 31 other tests in the file — including the pre-existing "192 honesty" test — stayed
GREEN under this exact mutation, confirming the verifier's finding precisely: only the new
test can see this regression.

**3. `audit-app.js` restored byte-exactly** via `git checkout -- audit-app.js` immediately
after capturing the RED output above:

```
$ git checkout -- audit-app.js
$ git diff --stat audit-app.js
$ git status --short audit-app.js
```

Both commands produced empty output — no diff, nothing to show.

**Full re-run after restoration**, both required suites green:

```
$ timeout 300 node test_audit_cta_provenance.js
test_audit_cta_provenance.js: 32 passed, 0 failed

$ timeout 300 node test_audit_pool_prescan.js
test_audit_pool_prescan.js: 14 passed, 0 failed
```

`git status --short` after both runs shows only `test_audit_cta_provenance.js` modified — no
tracked signal file (`product-loop-kit/signals/audit-findings.json`,
`product-loop-kit/signals/audit-rotation.json`) was touched by this fix; the new test uses
its own scratch files under `os.tmpdir()`, cleaned up in its `finally` block like every
sibling test in the file.

No implementation change was made or is believed needed — the spec's part 3 logic
(`audit-app.js:3448-3457`) is correct as shipped; only the missing test coverage is added
here, per the task's scope.
