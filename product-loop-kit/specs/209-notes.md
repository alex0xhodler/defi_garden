# 209-notes: repointing the audit's own 4 stale-fixture guard tests (rule B, items 199/201/203)

Build-loop item 209, branch `claude/loop-209`. Test-file-only diff, written as I went, per the brief.

## Summary of the change

Four assertions in three `test_audit_*.js` files were red on `origin/main` because three *shipped,
tested* product widenings never updated their witnesses. All four are `pre-existing-red-triage.md`
**decision rule B** (stale test, product deliberately moved) — no product file was touched.

1. **`test_audit_pool_link_liveness.js`** — `ANCHOR_HREF_RE` (`:315`) required the closing quote
   immediately after the pool id, so it matched zero anchors on `tokens/usdc.html` once item 203 started
   appending `&src=seo_token` to every estate `tp-pool-link` anchor. Widened the regex to capture (and, on
   the id-swap replace, preserve) an arbitrary post-id query tail: group 3 is now `[^"]*` (the tail), group
   4 is the closing quote. The id-swap assertion at `:326` (now further down after the added `originalTail`
   line) was updated to check for the tail-intact string, so this stays a **stale** failure forever, never
   degrades into a **contract** failure. Also updated the minimal page builder (`buildPage()`, the
   `anchorHtml` map, formerly `:83`) to emit the same `&src=seo_token` tail on every synthetic anchor, so
   the fixtures stop encoding a shape the estate no longer produces.
2. **`test_audit_cta_provenance.js` `:520` and `:711`** — both assertions treated
   `buildPoolSurfaces().extraSurfaces` as "the rotation picks", but item 199 now appends lens surfaces
   (`lensPick: true`, deliberately never `rotationPick`) into the same array, so 3 picks arrive as 6
   entries (3 `rotationPick` + 3 `lensPick` @360px/@dark/@ko). Both sites now **partition**
   `extraSurfaces` into `rotationSurfaces` (`rotationPick === true`) and `nonRotationSurfaces`
   (everything else), assert `rotationSurfaces.length === poolSample`, and add the classification
   assertion whose absence let the drift in: `nonRotationSurfaces.every((s) => s.lensPick === true)` — a
   third, unclassified kind still fails this. Every downstream `pickNames`/`pickNames1` (the 4 sites that
   feed `only: [...]`) was re-derived to `rotationSurfaces.map((s) => s.name)` / the equivalent filter, so
   `only:` stays scoped to rotation-pick names exactly like it was pre-199 — see Design decision below for
   why lens names were deliberately excluded from `only`.
3. **`test_audit_planner_flow.js` `:117`** — asserted the bloom branch's source contains the literal
   `s.width <= 360`; item 201 widened the real branch (`audit-app.js:3691`) to `s.width <= 768`. Repointed
   the assertion at the boundary the product has today, keeping the `checkResponsive(page, s, findings`
   half of the check unchanged.

## Design decision: lens names deliberately excluded from `only:` — why

`audit-app.js:4277` gates the wall-clock guard on `s.rotationPick || s.lensPick`, and `only:` filtering
(`audit-app.js:4114`) happens on the full `surfaces` array **before** the render loop, so a surface whose
name is absent from `only` never reaches the guard's loop at all. The four `192`-guard/honesty tests in
`test_audit_cta_provenance.js` are specifically about the **rotation** guard's skip/render/seen-honesty
behavior; none of their assertions (`renderedCount` — sourced from `renderedRotationCount` only,
`truncated` — sourced from `skippedRotationIds.length > 0` only, `poolRotation.picked.length`, the
`seen`/`baseSeen` accounting — all sourced from `rotationPicks`, never lens) is defined in terms of lens
surfaces. Keeping `pickNames` rotation-only means lens surfaces are filtered out of `surfaces` entirely
for these tests (never built into the run at all, exactly as if item 199 had never shipped from this
test's point of view) — this is the option that reproduces the pre-199 test scenario byte-for-byte,
rather than one that also exercises the guard's lens-skip counters this file was never written to check.
Confirmed empirically: before this fix, the two tests that never asserted the rotation-only partition
(`:566`'s "192 guard: normal budget" and `:620`'s "192 honesty (highest-risk)") were already passing with
the ballooned (6-name) `pickNames`, because `renderedCount`/`truncated`/`seen` never read lens state
either way — so this decision changes no test's verdict, only what population of surfaces those tests
build/render, which matters for wall-clock cost and for not silently growing the coverage these tests
claim (`pre-existing-red-triage.md`'s own "repointing a pivot must not silently shrink OR grow the gate"
concern, mirrored here in the other direction).

## Non-vacuity proofs (spec's mandatory requirement, verbatim)

All three proofs mutate a **scratch copy** of the input the assertion judges — never the assertion, never
a committed file. Scripts written to
`/tmp/claude-0/-home-user-defi-garden/14939e93-526d-5a78-aa92-f0121cdccc30/scratchpad/` (this session's
scratchpad, not the repo).

### Proof 1 — `:320` (ANCHOR_HREF_RE): an anchor whose `?pool=` shape is genuinely absent still trips the check

`node proof1_anchor_regex.js`:

```
real tokens/usdc.html matches ANCHOR_HREF_RE: true (tail=&src=seo_token)
mutated scratch copy matches ANCHOR_HREF_RE: false
assertion fired as expected: fixture wiring check: tokens/usdc.html must contain at least one class="tp-pool-link" href="https://www.defi.garden/?pool=<id>" anchor — its shape moved out from under this test
```

(Renamed every `class="tp-pool-link"` to `class="tp-pool-link-renamed"` on a scratch copy of the real
page's bytes; the sanity line up top confirms the SAME regex still matches the real, unmutated page today
— proving the assertion is alive on the real input, not merely constructible to fail.)

### Proof 2 — `:520`/`:711` (rotationPick/lensPick partition)

`node proof2_partition.js` (uses the real `buildPoolSurfaces()`, mutates scratch copies of its
`extraSurfaces` output):

```
--- (0) baseline: real buildPoolSurfaces() output, unmutated ---
baseline: PASSED (unexpected if this run is meant to fail)

--- (A) rotation-pick count mutated away from poolSample (drop one rotationPick entry on a scratch copy) ---
count-mutated: FAILED as expected -> fixture wiring check: expected 3 pre-computed rotation picks, got 2: ["pool-detail:p0000004","pool-detail:p0000008"]

--- (B) a third, unclassified surface kind injected on a scratch copy (neither rotationPick nor lensPick) ---
third-kind-injected: FAILED as expected -> fixture wiring check: expected every non-rotationPick extraSurfaces entry to be a lensPick, got [...,{"name":"pool-detail:mystery@promoted","url":"/home.html?pool=mystery","kind":"pool","poolId":"mystery"}]
```

(0) proves the real, unmutated output passes today (not vacuously red); (A) proves a rotation-pick count
!= `poolSample` still fails; (B) proves an `extraSurfaces` entry carrying neither `rotationPick` nor
`lensPick` still fails.

### Proof 3 — `:117` (bloom responsive scope): missing call and unscoped call both still fail

`node proof3_bloom_branch.js` (extracts the REAL bloom branch from `audit-app.js` via the same regex the
test uses, mutates scratch copies of the extracted string):

```
--- (0) baseline: the REAL bloom branch, unmutated ---
baseline (real audit-app.js source): PASSED

--- (a) scratch copy with the checkResponsive call REMOVED entirely ---
no-checkResponsive-call: FAILED as expected -> bloom branch missing the 360+768-scoped responsive check (widened by backlog 201)

--- (b) scratch copy with an UNSCOPED (all-viewport) checkResponsive call ---
unscoped-call: FAILED as expected -> bloom branch missing the 360+768-scoped responsive check (widened by backlog 201)
```

## Byte-unchanged proof — `tokens/usdc.html`

```
$ md5sum tokens/usdc.html      # before any edit
f9d133e9bbc6b470b63725c9380dc1e5  tokens/usdc.html
$ md5sum tokens/usdc.html      # after every edit + every test run in this session
f9d133e9bbc6b470b63725c9380dc1e5  tokens/usdc.html
```
Unchanged — matches at every checkpoint, byte for byte.

## Pass/fail counts — before (pre-change, this checkout) vs after (post-change)

| file | pre-change | post-change | new total tests |
|---|---|---|---|
| `test_audit_pool_link_liveness.js` | 11 passed, 1 failed | **12 passed, 0 failed** | 12 (unchanged) |
| `test_audit_cta_provenance.js` | 33 passed, 2 failed | **35 passed, 0 failed** | 35 (unchanged) |
| `test_audit_planner_flow.js` | 10 passed, 1 failed | **11 passed, 0 failed** | 11 (unchanged) |

No `test()` block was added or removed in any file — only assertions inside existing test bodies were
repointed/added, so the total test count per file is identical before and after; every prior-passing
assertion still passes (no relaxation), and the exact assertion that used to fail now passes for the
reason it exists (proven non-vacuous above), not because it was weakened.

## Verbatim final runs

```
$ timeout 280 node test_audit_pool_link_liveness.js
... (all 12 lines ✓) ...
test_audit_pool_link_liveness.js: 12 passed, 0 failed

$ timeout 280 node test_audit_cta_provenance.js
... (all 35 lines ✓) ...
test_audit_cta_provenance.js: 35 passed, 0 failed

$ timeout 280 node test_audit_planner_flow.js
... (all 11 lines ✓) ...
test_audit_planner_flow.js: 11 passed, 0 failed
```

## `npm run test:fast` (once, at the end)

```
$ timeout 280 npm run test:fast
...
TOTAL pass=42 fail=0 timeout=0 total=42
```
Exit code 0. This is the `--lane=plain` lane (`run-tests.js --lane=plain`) — it does **not** include the
`test_audit_*.js` browser-lane files (those were run individually above, each within its own 280s
foreground timebox, per the brief). The full 88-file browser lane was **not** run and is **not** claimed
green — out of scope per the brief's timebox and per `test_seo_surface_audit.js`'s own out-of-scope status
below.

## Side-effect files — reverted after every run

`product-loop-kit/signals/audit-static-rotation.json` was touched (as pre-existing, documented behaviour
of `test_audit_cta_provenance.js` and `test_audit_planner_flow.js`'s `persistRotationState`/rotation
tests) after two of the runs in this session; reverted with `git checkout --` immediately after each,
confirmed via `git status --porcelain` before moving on. `product-loop-kit/signals/audit-rotation.json`
was never touched by any of these three files in this session. No scratch fixture directories
(`_audit_seo_fixture_*` or otherwise) were left in the repo tree — the pool-link-liveness file's own
`os.tmpdir()`-based scratch dir is removed in its own `finally` block; confirmed empty after every run.

## Pre-existing red NOT touched, reported with its classification

`test_seo_surface_audit.js` (item 185's own still-open red — "digit-LEADING real tickers …") was **not
run** in this session (out of scope per the brief; it exceeds the 5-minute foreground timebox and item 185
already owns it as **rule F**, stale proxy metric, per `pre-existing-red-triage.md`). Not absorbed, not
fixed — left exactly as documented in `specs/206-notes.md`'s own Residual section and the spec's own
Evidence table.

## Deviations from the spec

1. **The `:117` fix line number shifted from `:117` to a different line number after the `originalTail`
   insertion in the pool-link-liveness file** (unrelated file, no cross-contamination — noted only because
   the spec's own line numbers in its evidence table are pre-diff line numbers, as expected of any spec
   written against `origin/main`). No functional deviation.
2. **The classification assertion (`nonRotationSurfaces.every((s) => s.lensPick === true)`) was added at
   BOTH `:520`'s test and `:711`'s test**, not just once. The spec's wording ("add the assertion whose
   absence let this drift in") reads singular, but both failing sites independently carried the identical
   pre-199 `extraSurfaces.every((s) => s.rotationPick === true)` assertion before this fix (one is what
   throws at `:520`/`:521`, the other at `:711`) — upgrading only one of the two would leave the other
   pinned to the same over-strict, already-proven-stale literal, which the spec's own acceptance criterion
   ("EVERY existing assertion in both tests still asserts exactly what it asserted pre-199") forbids
   leaving unrepointed. Both were fixed identically, each with its own non-vacuity coverage (Proof 2 above
   exercises the shared `buildPoolSurfaces()` output both sites read from).
3. **`pickNames`/`pickNames1` were re-derived at 4 call sites total** (`:519`, `:566`(pre-diff),
   `:620`(pre-diff), `:717`(pre-diff)), not just the 2 that were failing. The 2 that weren't failing
   (`test:566`'s normal-budget test, `test:620`'s highest-risk-honesty test) were passing today only
   because none of their assertions (`renderedCount`, `truncated`, `seen`) are defined in terms of lens
   surfaces — but leaving their `pickNames` ballooned to 6 names would silently widen what those two
   tests' `only:` allowlist builds and renders every future run (see "Design decision" above), which is
   exactly the kind of unnoticed scope creep this whole item exists to repoint. Re-deriving all 4 keeps
   the fix internally consistent without changing any of those two tests' verdicts (confirmed: same pass
   count before and after this consistency-only edit).
4. **No product file, generator, or dependency was touched anywhere** — confirmed via
   `git diff --stat -- audit-app.js app.js PoolDetail.js planner.js translations.js package.json home.html
   style.css data/ tokens/ chains/` returning empty at the end of the session.

## Residual / filed-not-fixed

- `test_seo_surface_audit.js` (item 185's rule-F red) — untouched, as required, documented above.
- Nothing else found in the three repaired files beyond the four assertions the spec named. No drive-by
  fixes, no refactors, no new test cases beyond the one classification assertion the spec explicitly
  called for.

## Files touched

- `test_audit_pool_link_liveness.js` — `ANCHOR_HREF_RE` widened to capture+preserve a post-id query tail;
  `buildPage()`'s anchor template updated to emit the same `&src=seo_token` tail; the id-swap test's
  assertion updated to check the tail-intact string. +10/-5 lines.
- `test_audit_cta_provenance.js` — 4 `pickNames`/`pickNames1` call sites re-derived to rotation-only; 2 of
  those sites (the ones that were actually failing) additionally gained the
  rotationPick/lensPick-partition classification assertion. +28/-7 lines.
- `test_audit_planner_flow.js` — one literal repointed (`s.width <= 360` → `s.width <= 768`) in the bloom
  branch's responsive-scope assertion, message text updated to match. +1/-1 lines.

`git diff --stat -- test_audit_pool_link_liveness.js test_audit_cta_provenance.js
test_audit_planner_flow.js`: **42 insertions(+), 12 deletions(-)** across the three files, well under the
150-line budget. `git diff --name-only origin/main` contains only these three test files plus this item's
own bookkeeping (`product-loop-kit/specs/209.md`, `product-loop-kit/specs/209-notes.md`,
`product-loop-kit/BACKLOG.md`) — no product/generator/generated-surface/data file appears anywhere in it.
