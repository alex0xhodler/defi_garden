# 200-notes: completing the lens matrix on the three funnel surfaces (landing/planner/bloom)

## What was built

**Leg A — `audit-app.js:3804-3822`.** Five surfaces appended strictly after
`plan-bloom-ko` (the end of the fixed default-rotation array), each preceded
by a comment block (`:3804-3817`) that names backlog 200, explains the
"dark mode has ZERO renders anywhere on landing/planner/bloom" gap, and
restates spec 200's own "no new budget knob" reasoning verbatim (five FIXED
surfaces are not a sampled population — `AUDIT_POOL_SAMPLE`/
`AUDIT_STATIC_SAMPLE`/`AUDIT_POOL_LENS_SAMPLE` all govern populations where
the count is a policy question; `opts.only`/`--only` already gives per-surface
control):

```js
{ name: 'landing-360', url: '/', kind: 'landing', width: 360 },
{ name: 'landing-dark', url: '/', kind: 'landing', width: 1280, dark: true },
{ name: 'landing-ko', url: '/?lang=ko', kind: 'landing', width: 1280, ko: true },
{ name: 'planner-dark', url: '/plan.html', kind: 'planner', width: 1280, dark: true },
{ name: 'plan-bloom-dark', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10', kind: 'bloom', width: 1280, dark: true }
```

`plan-bloom-dark`'s url is byte-identical to `plan-bloom-growth`'s (reused,
not retyped — same as 164's own convention).

**Leg B — `audit-app.js:3362, 3370-3378`.** The `kind === 'landing'` driver:
- `:3362` — `auditText`'s return value is now captured (`const text = await
  auditText(page, s, findings);`), where it was previously discarded.
- `:3370-3375` — the KO Hangul check, same shape as the planner (`:3423-3426`)
  and bloom (`:3468-3471`) drivers: `if (s.ko) { const hasHangul =
  /[가-힣]/.test(text); if (!hasHangul) findings.push(finding(s.name,
  s.vpLabel, 'i18n', 'P2', 'KO surface rendered no Hangul text')); }`
- `:3377-3378` — the 360px responsive check:
  `if (s.width <= 360) await checkResponsive(page, s, findings,
  '.landing-search-submit');`

Both inserted in the same position the planner/bloom drivers use: after the
CTA presence/visibility block, before the `errors.length` push.

**Leg C — new `test_audit_funnel_lens.js`**, wired into `package.json`'s
`test:serial` chain immediately after `test_audit_pool_lens.js`
(`package.json:21`). Two layers mirroring `test_audit_planner_surface.js`'s
shape: 9 source-level tests (cannot be skipped for an environment gap) plus
2 real-Chromium `runAudit()` integration tests, whose assertions sit outside
the environment-gap catch.

## Deviations from the spec

None. Every acceptance-criterion shape (surface names/urls/kinds/widths/
flags, append position, driver call-site position, no new budget knob,
`test:serial` insertion point, the two-layer test shape) was implemented
exactly as spec'd. No product defect found by the new lenses was fixed here
(see "Residuals" below).

## Test results (verbatim)

### `node test_audit_funnel_lens.js` (new test, criterion 5)

```
audit-app.js — backlog 200 funnel-lens surfaces

  ✓ default rotation contains "landing-360" with url/kind/width/dark/ko per spec 200's table
  ✓ default rotation contains "landing-dark" with url/kind/width/dark/ko per spec 200's table
  ✓ default rotation contains "landing-ko" with url/kind/width/dark/ko per spec 200's table
  ✓ default rotation contains "planner-dark" with url/kind/width/dark/ko per spec 200's table
  ✓ default rotation contains "plan-bloom-dark" with url/kind/width/dark/ko per spec 200's table
  ✓ the five new surfaces are appended AFTER plan-bloom-ko (no existing surface renamed/moved)
  ✓ --static-only's exclusion mechanism (s.kind === 'static' filter) is present unchanged
  ✓ property: every funnel kind (landing/planner/bloom) has >=1 dark surface, and landing has a 360px, a dark AND a ko surface
  ✓ the landing driver (kind === 'landing') captures auditText's return value and gains a responsive + an i18n check
[audit] playwright resolved from local (1.61.1) at local node_modules
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15819 pools)
  ✓ (e) runAudit({ only: ["landing-360", "landing-ko"] }) covers both new surfaces
  ✓ (e) the findings array is well-formed (a real defect found here is reported, never swallowed)

test_audit_funnel_lens.js: 11 passed, 0 failed
```
Exit code **0**. 11/11 pass, mapping onto spec 200 acceptance criterion
5(a)-(e): (a)+(c) the five per-surface literal checks, the ordering check and
the `--static-only` grep; (b) the property test parsed generically off the
surfaces array (not hardcoded to the five new names); (d) the landing
driver's source-level call-site check; (e) the real `runAudit()` render.
Re-run again after the non-vacuity probes were restored (below) — same
11/0 result, confirming the restoration is behaviorally, not just textually,
identical.

### Regression suite named in the build brief

`node test_audit_app.js`:
```
[audit] playwright resolved from local (1.61.1) at local node_modules
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15819 pools)
  ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes findings JSON
[audit] playwright resolved from local (1.61.1) at local node_modules
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15819 pools)
  ✓ positive control: injected 900T Base APY renders into pool-detail → P0 number-sanity finding
[audit] playwright resolved from local (1.61.1) at local node_modules
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15819 pools)
  ✓ negative control: injected 900T 30d-Mean APY is suppressed on pool-detail (backlog 144 rail holds)

test_audit_app.js: 3 passed, 0 failed
```
Exit code **0**.

`node test_audit_planner_surface.js`:
```
audit-app.js — backlog 162 planner/landing surfaces

  ✓ default rotation contains "landing" with url/kind/width per spec
  ✓ default rotation contains "planner" with url/kind/width per spec
  ✓ default rotation contains "planner-360" with url/kind/width per spec
  ✓ default rotation contains "planner-ko" with url/kind/width per spec
  ✓ the four new surfaces are appended AFTER pool-detail-ko (no existing surface renamed/moved)
  ✓ --static-only's exclusion mechanism (s.kind === 'static' filter) is present unchanged
[audit] playwright resolved from local (1.61.1) at local node_modules
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15819 pools)
  ✓ runAudit({ only: ["planner"] }) covers exactly the planner surface
  ✓ runAudit({ only: ["planner"] }) — the goal-picker first screen renders, no dead-end/dead-cta finding
[audit] playwright resolved from local (1.61.1) at local node_modules
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15819 pools)
  (skipped) case B integration — could not run the audit here: case B (staticOnly) exceeded 150s hard timeout
    reason recorded in product-loop-kit/specs/162-notes.md

test_audit_planner_surface.js: 8 passed, 0 failed
```
Exit code **0**. Case B's skip is the file's OWN pre-existing, by-design
skip-tolerance (only the `runAudit()` call itself is wrapped; every
assertion that ran is outside it) — not caused by this diff (this item never
touches the static-page rotation the 150s case renders), and every assertion
that DID execute passed. Not touched, not repointed — recorded for
completeness per the build brief's "run individually and named" instruction.

`node test_audit_pool_lens.js`:
```
  ✓ (a)+(b): three rotation picks each get one lens surface — correct width/dark/ko/url per lens, lensPick set, rotationPick NOT set
  ✓ (c): opts.poolLensSample above MAX_POOL_LENS_SAMPLE clamps to the ceiling when enough rotation picks exist
  ✓ (c): lens sample clamps to rotationPicks.length when fewer pools were picked than the lens budget
  ✓ (d): AUDIT_POOL_LENS_SAMPLE=0 -> zero lens surfaces, rotationPick surfaces unaffected
  ✓ (e): the lens assigned to a fixed rotation pick varies across seeds, and is stable for a repeated seed
  ✓ (f): rotation bookkeeping (seen, renderedCount, candidateCount, picked, truncated, wrapped) is identical with the lens leg on vs off
[audit] playwright resolved from local (1.61.1) at local node_modules
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15819 pools)
  ✓ runAudit({only: [non-existent]}) reports the planned lensSampleSize but an honest lensRendered:0, lensSkipped:0

test_audit_pool_lens.js: 7 passed, 0 failed
```
Exit code **0**. Unaffected by this item (Leg A/B never touch
`buildPoolSurfaces()` or the pool driver).

### `timeout 290 npm run test:fast` (plain lane)

```
run-tests.js: 39 file(s) selected (lane=plain, plain=39, browser=0, timeout=plain:120s/browser:600s, plain-jobs=3, browser-jobs=3)
...
TOTAL pass=39 fail=0 timeout=0 total=39
```
Exit code **0**. All 39 plain-lane files green (`npm ci` was run first — this
checkout had no `node_modules/` at session start, same environmental note as
199-notes.md). None of the audit test files are in the plain lane (Playwright
classifies them `browser`); they were run individually above, per the build
brief.

`npm run test:browser` (full lane) — **UNRUN**, see below.

## End-to-end `node audit-app.js` runs (acceptance criteria 1-3)

Both runs started from **freshly-made, verified-byte-identical** copies of
the real committed `product-loop-kit/signals/audit-rotation.json` and
`audit-static-rotation.json` (diffed against the source immediately before
copying — 0 differences), with `AUDIT_ROTATION_STATE` /
`AUDIT_STATIC_ROTATION_STATE` / `AUDIT_OUT` redirected to scratch paths, and
an explicit shared seed (`AUDIT_STATIC_SEED=backlog200-comparison-seed`, which
also supplies `poolSeed` per its own fallback chain) so both runs are
comparable independent of the default day-derived seed. The baseline run used
an isolated `git worktree` at `origin/main` (96d5512d5); the branch run used
this checkout.

**Baseline (`origin/main`, worktree):**
```
$ cd <worktree>; AUDIT_ROTATION_STATE=.../rotation-baseline.json AUDIT_STATIC_ROTATION_STATE=.../static-rotation-baseline.json \
  AUDIT_OUT=.../out-baseline.json AUDIT_STATIC_SEED=backlog200-comparison-seed node audit-app.js
```
Elapsed: **real 3m18.310s = 198.3s** (well under the 300s cap).
`[audit] findings: 1 total, 0 blocking (P0/P1)`.

**Branch (this checkout, with Leg A/B applied):**
```
$ AUDIT_ROTATION_STATE=.../rotation-branch.json AUDIT_STATIC_ROTATION_STATE=.../static-rotation-branch.json \
  AUDIT_OUT=.../out-branch.json AUDIT_STATIC_SEED=backlog200-comparison-seed node audit-app.js
```
Elapsed: **real 3m19.081s = 199.1s** (well under the 300s cap).
`[audit] findings: 1 total, 0 blocking (P0/P1)` — same single pre-existing
`pool-prescan:mean30d-rail-breach` P2 aggregate as the baseline (unrelated to
this item; see "New findings" below).

**Criterion 1 — the five new names, pasted verbatim from the branch run's
`surfacesCovered`:**
```
"landing-360","landing-dark","landing-ko","planner-dark","plan-bloom-dark"
```
(full array reproduced in the programmatic comparison below — they appear
immediately after `plan-bloom-ko`, before `static-page`, exactly the append
position Leg A specifies.)

**Criterion 2 — elapsed time and delta:** branch 199.1s vs baseline 198.3s =
**+0.8s** for the five extra funnel-lens renders. Five extra renders is the
whole cost, and the delta here (five lightweight landing/planner/bloom
renders — no pool-detail machinery, no extra pool-prescan work) is smaller
than 199's own ~0.19s/pool-detail-render marginal cost times five would
suggest, because landing/planner/bloom renders are cheaper than pool-detail
renders and run-to-run network-fetch jitter dominates at this scale (the same
observation 199-notes.md made about its own measured delta).

**Criterion 3 — programmatic array comparison** (not a prose claim):
```js
const A = baseline.surfacesCovered;  // 72 entries
const B = branch.surfacesCovered;    // 77 entries
newOnes = B.filter(x => !A.includes(x));
// => ["landing-360","landing-dark","landing-ko","planner-dark","plan-bloom-dark"]
removed = A.filter(x => !B.includes(x));
// => []  (nothing removed)
bMinusNew = B.filter(x => !newOnes.includes(x));
// bMinusNew === A, order-preserving: TRUE
```
Full arrays (both 72/77 entries respectively) were captured; `B` with the
five new entries stripped out is **byte-identical, in the same order**, to
`A`. No existing surface renamed, moved, or reordered.

## Non-vacuity — demonstrated, not asserted (criterion 4)

Both probes mutate `audit-app.js`, run a real `runAudit()` against exactly
the affected surface, print the finding that appears, then restore
byte-exact.

### Probe (a) — landing-360's responsive check

Forced the ancestor-clip branch inside the shared `checkResponsive()` helper
to always fire (`audit-app.js:3644`):
```diff
     const box = await cta.boundingBox();
-    if (!box || box.width <= 0 || box.height <= 0) {
+    if (/* NON-VACUITY PROBE 200 (a), TEMPORARY */ true) {
```
```
$ node -e '... runAudit({ port: 8947, only: ["landing-360"], ... })'
surfacesCovered: ["landing-360"]
findings: [
  {
    "surface": "landing-360",
    "viewport": "360px",
    "check": "responsive",
    "severity": "P2",
    "detail": ".landing-search-submit has zero-area box at 360px (ancestor-clipped)"
  }
]
```
Restored byte-exact, verified:
```
$ git diff origin/main -- audit-app.js | grep -c "PROBE 200"
0
```

### Probe (b) — landing-ko's Hangul check

Forced the landing driver's own `hasHangul` predicate to always read false
(`audit-app.js:3373`, inside the `if (s.ko) { ... }` block Leg B added):
```diff
       if (s.ko) {
-        const hasHangul = /[가-힣]/.test(text);
+        const hasHangul = /* NON-VACUITY PROBE 200 (b), TEMPORARY */ false;
         if (!hasHangul) findings.push(finding(s.name, s.vpLabel, 'i18n', 'P2', 'KO surface rendered no Hangul text'));
       }
```
```
$ node -e '... runAudit({ port: 8946, only: ["landing-ko"], ... })'
surfacesCovered: ["landing-ko"]
findings: [
  {
    "surface": "landing-ko",
    "viewport": "1280px/ko",
    "check": "i18n",
    "severity": "P2",
    "detail": "KO surface rendered no Hangul text"
  }
]
```
Restored byte-exact, verified together with probe (a):
```
$ git diff origin/main -- audit-app.js | grep -c "PROBE 200"
0
$ git diff --stat origin/main -- audit-app.js
 audit-app.js | 33 ++++++-
 1 file changed, 31 insertions(+), 2 deletions(-)
```
Both probes independently show their new check going RED, both restored
byte-exact, and `test_audit_funnel_lens.js` re-run green (11/0) afterward to
confirm the restoration is behaviorally, not just textually, identical.

(One incidental cleanup during these probes: an early `node -e` invocation
that forgot to pass `SCRATCH` as an env var — `SCRATCH="$SCRATCH"` was placed
*after* the script instead of before it, so it became a stray positional
argument instead of an environment assignment — wrote a real
`undefined/runs/probe-b-out.json` relative to the repo root. Caught via
`git status --porcelain` immediately after, removed with `rm -rf
./undefined`, confirmed clean before continuing. Recorded per 199-notes.md's
own precedent of disclosing testing-harness slips rather than hiding them.)

## `git diff origin/main --stat`

```
 audit-app.js                  |  33 ++++++-
 package.json                  |   2 +-
 product-loop-kit/BACKLOG.md   |   1 +
 product-loop-kit/specs/200.md | 223 ++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 256 insertions(+), 3 deletions(-)
```
`product-loop-kit/BACKLOG.md`'s one-line addition (the item-200 row) and
`product-loop-kit/specs/200.md` (the spec itself) were both already present
in the working tree when this build session started — not authored here —
and are exactly the "`product-loop-kit/` bookkeeping" criterion 6 names as
allowed alongside `audit-app.js`/`package.json`/the new test file. This
session's own working-tree changes were captured by an automatic local
checkpoint commit (`4b0ef6f32`, "wip(200): ... local checkpoint, to be
squashed") partway through — not a commit this build authored deliberately;
per the operator's own git handling, left as-is. No `git push` was performed.

## `git status --porcelain`

```
?? test_audit_funnel_lens.js
```
Everything else (Leg A/B in `audit-app.js`, the `package.json` registration
line, `product-loop-kit/specs/200-notes.md`) is captured in the tree as
described above. `product-loop-kit/signals/` confirmed untouched throughout
(`git status --porcelain -- product-loop-kit/signals/` returns nothing) —
every real `node audit-app.js` / `runAudit()` invocation in this session had
`AUDIT_ROTATION_STATE`/`AUDIT_STATIC_ROTATION_STATE`/`AUDIT_OUT` redirected to
scratch paths.

## New findings the audit originated

**Zero** new findings on any of the five new funnel-lens surfaces, in either
the two full end-to-end runs or the standalone `test_audit_funnel_lens.js`
integration run. Both full runs report the identical single pre-existing
finding:
```json
{
  "surface": "pool-prescan",
  "check": "pool-prescan:mean30d-rail-breach",
  "severity": "P2",
  "detail": "1 of 740 snapshot pools match mean30d-rail-breach — examples: 201e5f6e — reconciled: ... downgraded to non-blocking."
}
```
— a pool-prescan aggregate unrelated to landing/planner/bloom, present
identically in the baseline run too. Per spec 200 acceptance criterion 8:
this is an honest null result on a five-surface sample, not evidence the
funnel is defect-free — the point of this item is that a real
360px/dark/KO defect on these surfaces is now reachable at all, matching
199's own "zero findings in the first six draws" precedent for the same
reason (small sample, already largely-clean codebase).

## Residuals / deliberately not fixed here

- Nothing was found to fix. Had the real runs or the non-vacuity probes
  surfaced a genuine (non-probe-induced) defect on any of the five new
  surfaces, it would be reported here with severity and left unfixed per
  spec 200's explicit "Out of scope — fixing any product defect the new
  lenses find" and criterion 8's "file it, don't fix it" rule. None did.
- Everything spec 200 itself lists as out of scope (768px, the full
  archetype × lens matrix on bloom, the static-estate `/ko/`+EN lens
  dimension, a rotation/cycling mechanism for these five, any new check) was
  correctly not built.

## What was NOT run (UNRUN, not implied green)

- `npm run test:browser` (the full ~40-file, up to 600s/file browser lane) —
  **UNRUN**. Not requested by name in the build brief (which named specific
  files individually, all of which WERE run), and running the full lane would
  not fit this item's foreground timebox alongside the two mandatory paired
  end-to-end `node audit-app.js` runs (each ~200s) plus the two non-vacuity
  probes (each a real Chromium render). Every audit-family test file the
  brief explicitly named was run individually and reported above.
