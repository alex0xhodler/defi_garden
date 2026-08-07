# 199-notes: pool-detail rotation gains a lens dimension (360px / dark / ko)

## What was built

`buildPoolSurfaces()` in `audit-app.js` now emits, in addition to the unchanged
anchor/promotion/rotation surfaces, a bounded number of **lens surfaces**: a
second render of a subset of the SAME rotation picks, one at 360px, one dark,
one Korean, cycling. Concretely:

- Two new module-level constants next to `DEFAULT_POOL_SAMPLE`/`MAX_POOL_SAMPLE`:
  `LENSES = ['360px', 'dark', 'ko']`, `DEFAULT_POOL_LENS_SAMPLE = 6`,
  `MAX_POOL_LENS_SAMPLE = 24`.
- Immediately after the existing (byte-unchanged) `rotationPicks` loop in
  `buildPoolSurfaces()`, a new block computes `lensSampleSize` (env
  `AUDIT_POOL_LENS_SAMPLE` / `opts.poolLensSample`, clamped to
  `[0, MAX_POOL_LENS_SAMPLE]`, then to `rotationPicks.length`) and appends one
  lens surface per of the first `lensSampleSize` picks:
  `pool-detail:<prefix>@360px|@dark|@ko`, width/dark/ko set per lens, `@ko`
  appending `&lang=ko`, `poolId` carrying the full id, and — the one field the
  spec is emphatic about — `lensPick: true`, **never** `rotationPick`.
- The lens for position `i` is `LENSES[(i + tickOffset) % LENSES.length]`,
  `tickOffset = hashSeed(`${seed}:poollens`) % LENSES.length` — same seed the
  rotation itself uses, namespaced so the hash never collides with
  `${seed}:pools` / `${seed}:poolprescan` / `${seed}:fill`.
- `poolRotation` gains additive-only fields: `lensSampleSize`, `lensRendered`,
  `lensSkipped`, `lenses` (`{poolIdPrefix: lens}`). `emptyPoolRotationResult()`
  (override-mode shape) gained the same four fields at their zero/`{}` values.
- The wall-clock guard in `runAudit()`'s render loop now triggers on
  `s.rotationPick || s.lensPick`. A lens skip increments a **separate**
  counter (`skippedLensCount`) and is never pushed into `skippedRotationIds`
  — so a lens skip can never strip a pool from the committed `seen` array
  (the pool's own `rotationPick` surface, earlier in the same list, already
  rendered it). Post-loop, `poolRotation.lensRendered`/`lensSkipped` are
  overwritten with the honest post-render counts, mirroring exactly how
  `renderedCount`/`truncated` are already handled (backlog 192).
- One new CLI summary line: `[audit] pool lenses: N rendered (360px xA, dark
  xB, ko xC) over M rotation picks, K skipped`, or an explicit `disabled (...)`
  when the sample is 0 — never a silent absence.
- `LENSES`, `DEFAULT_POOL_LENS_SAMPLE`, `MAX_POOL_LENS_SAMPLE` exported
  (item-159 rule: tests interpolate, never re-type).

**`seen` / `thisRunPoolIds` / `cycle` bookkeeping is byte-unchanged** — verified
both by inspection (the code path that builds `thisRunPoolIds` was not
touched) and by test (f) in `test_audit_pool_lens.js` and the two clean
end-to-end runs below (identical `poolRotation.{cycle,seenCount,
candidateCount,picked,wrapped,sampleSize,renderedCount,truncated}` and
identical `rotationState`/`baseSeen` with the lens leg on vs off, same seed +
same prior state).

## Deviations from the spec

1. **A test regression in `test_audit_pool_prescan.js`, initially blocked by
   the hard file-allowlist, later fixed under an explicit operator-authorized
   scope extension.** See "Resolved: `test_audit_pool_prescan.js` A6 repoint"
   below for the full before/after. Originally the task's file allowlist
   (`audit-app.js`, `package.json` test-registration line, new
   `test_audit_pool_lens.js`, this notes file) did not include
   `test_audit_pool_prescan.js`, so a pre-197 assertion that measured
   "rotation fills its own budget" via a raw
   `extraSurfaces.length === DEFAULT_POOL_SAMPLE` check failed, because
   `extraSurfaces` legitimately grows by up to `DEFAULT_POOL_LENS_SAMPLE` (6)
   once the lens leg is added — exactly as spec 199 intends. The operator
   subsequently authorized exactly one change to that one file to repoint the
   assertion to a rotation-only count; done, tested, and non-vacuity-proven
   below. The suite is now fully green (see the resolved section).
2. **No other deviations.** Every acceptance-criterion shape (naming,
   `lensPick` marker, seed/tickOffset determinism, budget knobs, guard
   extension, CLI line, additive-only report fields) was implemented exactly
   as spec'd.

## Test results (verbatim)

### `node test_audit_pool_lens.js` (new test, criterion 5)

```
  ✓ (a)+(b): three rotation picks each get one lens surface — correct width/dark/ko/url per lens, lensPick set, rotationPick NOT set
  ✓ (c): opts.poolLensSample above MAX_POOL_LENS_SAMPLE clamps to the ceiling when enough rotation picks exist
  ✓ (c): lens sample clamps to rotationPicks.length when fewer pools were picked than the lens budget
  ✓ (d): AUDIT_POOL_LENS_SAMPLE=0 -> zero lens surfaces, rotationPick surfaces unaffected
  ✓ (e): the lens assigned to a fixed rotation pick varies across seeds, and is stable for a repeated seed
  ✓ (f): rotation bookkeeping (seen, renderedCount, candidateCount, picked, truncated, wrapped) is identical with the lens leg on vs off
[audit] playwright resolved from global (1.56.1) at /opt/node22/lib/node_modules
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15844 pools)
  ✓ runAudit({only: [non-existent]}) reports the planned lensSampleSize but an honest lensRendered:0, lensSkipped:0

test_audit_pool_lens.js: 7 passed, 0 failed
```
Exit code: **0**. 7/7 assertions pass, mapping onto spec 199 acceptance
criterion 5(a)-(f) plus one extra covering the honest-overwrite mechanism
under `opts.only` scoping.

### Regression suite named in the build brief

`node test_audit_app.js`:
```
  ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes findings JSON
  ✓ positive control: injected 900T Base APY renders into pool-detail → P0 number-sanity finding
  ✓ negative control: injected 900T 30d-Mean APY is suppressed on pool-detail (backlog 144 rail holds)

test_audit_app.js: 3 passed, 0 failed
```
Exit code **0**.

`node test_audit_runner.js`:
```
9 assertions passed.
PASS test_audit_runner (9 assertions)
```
Exit code **0**.

`node test_audit_pool_prescan.js` (WITH my diff):
```
  ✓ A3a: prescanPools() on a fixture with exactly one apy-rail-breach pool returns exactly that suspect
  ✓ A3b: runAudit({only:["pool-prescan"]}) against a fixture snapshot file emits the P0 pool-prescan:apy-rail-breach aggregate finding
  ✓ A5: same seed -> identical extraSurfaces + poolPrescan.promoted across two calls
  ✓ A5: different seed, suspects <= cap -> promotion set unchanged (promotion is suspicion-driven, not seed-driven)
  ✓ A5: different seed -> ROTATION may differ (coverage actually accumulates, not just promotion)
  ✗ A6: opts.poolPrescan === false -> no promotion, no pool-prescan findings, rotation still fills its own budget
    rotation (DEFAULT_POOL_SAMPLE=32) must still fill its own budget when only promotion is killed; got 38: ["pool-detail:p0000016", ... 32 rotationPick entries ..., "pool-detail:p0000016@360px","pool-detail:p0000017@dark","pool-detail:p0000018@ko","pool-detail:p0000019@360px","pool-detail:p0000020@dark","pool-detail:p0000021@ko"]
  ✓ A6: AUDIT_POOL_PRESCAN=0 env var has the same effect as opts.poolPrescan:false
  ✓ A6: poolIds override -> exactly that pool as anchor, prescan off, no extraSurfaces from a single id
  ✓ A6: poolIds override with multiple ids -> first is the anchor, the rest become pool-detail:<prefix> extraSurfaces verbatim
  ✓ A3 (spec 171): every suspect for the signal promoted AND every promoted surface rendered zero findings -> aggregate downgraded to P2 with a reason naming the surface
  ✓ A4 (spec 171, load-bearing): same as A3 but ONE suspect left unpromoted -> severity unchanged (unverified != clean)
  ✓ A4b (spec 171): a promoted suspect whose surface was never actually rendered in THIS run (opts.only scoped it away) counts as unverified, not clean
  ✓ A5 (spec 171): all suspects promoted but ONE promoted surface produced >=1 rendered finding -> severity unchanged
  ✓ A7 (spec 171): prescan disabled -> zero aggregate findings exist to reconcile in the first place; reconciling the empty set is a true no-op

test_audit_pool_prescan.js: 13 passed, 1 failed
```
Exit code **1**. **This is a NEW regression caused by this diff** (full
triage below, "New findings" §1) — NOT pre-existing.

`node test_audit_pool_prescan.js` on an `origin/main` baseline (`git stash
push -- audit-app.js package.json`, re-run, `git stash pop`):
```
test_audit_pool_prescan.js: 14 passed, 0 failed
```
Confirms the A6 failure is caused by this diff, not pre-existing.

`node test_audit_static_rotation.js` (WITH my diff — unaffected leg):
```
  ✓ criterion 1 (tokens): a real leaf marked seen is never re-picked while unseen leaves remain, across 6 different seeds
  ✓ criterion 1 (chains): a real leaf marked seen is never re-picked while unseen leaves remain, across 6 different seeds
  ✓ criterion 2: default run yields 4 token + 2 chain surfaces plus the anchor (still named static-page, still first)
  ✓ criterion 3: same seed + same prior state -> identical picks; a different seed -> different picks
  ✓ criterion 4: wrap — every candidate already seen -> wrapped=true, cycle+1, seen resets to just this run's picks, next cycle starts fresh
  ✓ criterion 5: STATIC_ROTATION_SEEN_CAP exceeds the REAL combined tokens+chains leaf count (read from disk, not hardcoded)
  ✓ criterion 6: a prescan-promoted leaf AND the anchor leaf both land in tokens.seen even though rotation never picked them
  ✓ criterion 7a: runAudit() library call (no persistRotationState) leaves the COMMITTED audit-static-rotation.json untouched
  ✓ criterion 7b: runAudit() library call with an explicit (temp) staticRotationStatePath still never writes it without persistRotationState
  ✓ runAudit({persistRotationState:true}) writes the static-rotation state, and a genuine no-op second run produces byte-identical bytes
  ✓ criterion 8: missing file, corrupt JSON, {}, {tokens:5}, {tokens:{seen:"nope"}} all degrade to a fresh cycle-0 state and a normal pick, never throw
  ✓ criterion 9: AUDIT_STATIC_PAGES override — surfaces verbatim, rotation off (disabled shape), no state read/written, unaffected by rotation opts
  ✓ criterion 10: 180-day simulation — zero token re-renders (720 distinct, the true ceiling at 4/tick); chains reach full coverage with only the mathematically-forced fill-repeat before the wrap

test_audit_static_rotation.js: 13 passed, 0 failed
```
Exit code **0**.

`node test_audit_pool_prescan.js` / `node test_audit_prescan.js` — the latter
(WITH my diff):
```
  ✗ criterion 4: non-vacuity — identical config with prescan:false does NOT cover the probe slug
    prescan:false must not cover the probe surface (that would mean criterion 3 passed by a lucky uniform pick, not promotion); got ["static-page","static-page:tokens/_audit_probe_25318"]

test_audit_prescan.js: 47 passed, 1 failed
```
Exit code **1**. Re-run on an `origin/main` baseline (same `git stash`
method):
```
test_audit_prescan.js: 47 passed, 1 failed   (same single criterion-4 failure)
```
**PRE-EXISTING, proven** — unrelated to the static leg I never touched;
belongs to the static-page probe-collision class the prescan playbook already
has a slot for (rule G/D territory — a probe file left behind by a prior run,
or PID-based probe naming colliding under this sandbox's process-reuse). Out
of scope for item 199; not investigated further here per the "one item, one
red class" rule.

### `timeout 290 npm run test:fast` (plain lane)

First attempt failed fast with `dependencies not installed — run npm ci`
(`run-tests.js`'s own `NODE_MODULES_PATH` existence check) — this sandbox
checkout had no `node_modules/` at all. Proven pre-existing/environmental
(rule C) by stashing my diff and re-running: **identical** failure message on
`origin/main`. Ran `npm ci` (67 packages, 3s, no network issues through the
proxy) and re-ran:

```
run-tests.js: 39 file(s) selected (lane=plain, plain=39, browser=0, timeout=plain:120s/browser:600s, plain-jobs=3, browser-jobs=3)
...
TOTAL pass=39 fail=0 timeout=0 total=39
```
Exit code **0**. All 39 plain-lane files green. **None of the audit test
files are in the plain lane** (they classify as `browser` — Playwright-based)
so the plain lane's green status does not cover the one new regression or the
one pre-existing red documented above; those live in the browser lane, which
was exercised individually per-file above (not the full `npm run
test:browser`, which was **UNRUN** — not requested, and a full ~120-file
600s-budget browser sweep does not fit this item's foreground timebox
alongside the two required end-to-end `node audit-app.js` runs; every audit
file the build brief explicitly named WAS run individually and is reported
above).

## End-to-end `node audit-app.js` runs (acceptance criteria 1-4)

First attempt at the paired runs picked up state contamination from an
earlier attempt that had been killed by the tool's own 120s wrapper timeout
before I raised the Bash `timeout` parameter to 300000ms — the killed child
process had apparently still reached its own `persistRotationState` write
before dying, so the "fresh" scratch copy for the very next run started from
an already-mutated `seen` set. Confirmed via three independent determinism
probes (`buildPoolSurfaces()` called twice with an identical fixture,
`AUDIT_ROTATION_STATE`-only reproduction, and two full `node audit-app.js
--only=__nope__` invocations against byte-identical fresh state) that the
rotation/lens machinery is fully deterministic given identical inputs — the
mismatch was a testing-harness artifact of my own aborted command, not a
product bug. That same command also (my mistake, not a product bug) briefly
created `product-loop-kit/signals/audit-static-rotation.json` for real
because a fast one-off verification call forgot to override
`AUDIT_STATIC_ROTATION_STATE`; caught immediately via `git status --porcelain`
and removed (`rm`) before it was ever the subject of any other operation —
confirmed clean:
```
$ git status --porcelain -- product-loop-kit/signals/
(no output)
```

The two runs actually used as evidence below are a clean, controlled pair:
both started from a **freshly-made, verified-byte-identical** copy of the
real committed `product-loop-kit/signals/audit-rotation.json` (diffed against
the source immediately before each run — `0` differences both times), with
`AUDIT_ROTATION_STATE`/`AUDIT_STATIC_ROTATION_STATE`/`AUDIT_OUT` all
redirected to scratch paths under this session's scratchpad, run to
completion (not killed), same UTC day (`2026-08-01`, hence same default
seed).

**Run A — default lens sample:**
```
$ AUDIT_ROTATION_STATE=.../clean-rotation-A.json AUDIT_STATIC_ROTATION_STATE=.../clean-static-A.json AUDIT_OUT=.../clean-out-A.json \
  node audit-app.js
EXIT:0  ELAPSED:123s
```
```
[audit] surfaces covered: text-surfaces, i18n, grid-token, pool-detail, grid-chain, dead-pool, grid-loading, pool-detail-360, grid-360, pool-detail-dark, pool-detail-ko, pool-detail:201e5f6e, pool-detail:ce14c4f9, pool-detail:d4b3c522, pool-detail:db678df9, pool-detail:e378a7c2, pool-detail:eaa7b496, pool-detail:f0131970, pool-detail:f8cd444e, pool-detail:01d96249, pool-detail:097b18e2, pool-detail:0f23649e, pool-detail:177d0a37, pool-detail:1ba55596, pool-detail:2393da89, pool-detail:2e53bb82, pool-detail:367f7910, pool-detail:3deaf6d7, pool-detail:458a64c5, pool-detail:4c45cc9e, pool-detail:545ef93e, pool-detail:58e1b97d, pool-detail:6655d315, pool-detail:723797ce, pool-detail:7b3e4cca, pool-detail:7fb382fb, pool-detail:86d5dc3c, pool-detail:8edfdf02, pool-detail:951e4e49, pool-detail:9f79f58d, pool-detail:a451a8da, pool-detail:ad047a62, pool-detail:b5d7a190, pool-detail:bd335b46, pool-detail:ce14c4f9@360px, pool-detail:d4b3c522@dark, pool-detail:db678df9@ko, pool-detail:e378a7c2@360px, pool-detail:eaa7b496@dark, pool-detail:f0131970@ko, landing, planner, planner-360, planner-ko, plan-bloom-growth, plan-bloom-target, plan-bloom-subscription, plan-bloom-360, plan-bloom-ko, static-page, static-page:tokens/shit, static-page:tokens/wtao, static-page:tokens/cscbusdc, static-page:tokens/kysol, static-page:chains/solana, static-page:chains/ethereum
[audit] findings: 1 total, 0 blocking (P0/P1)
[audit] pool rotation: cycle 0, seen 48/735 candidates, picked [ce14c4f9-..., d4b3c522-..., db678df9-..., e378a7c2-..., eaa7b496-..., f0131970-..., f8cd444e-..., 01d96249-..., 097b18e2-..., 0f23649e-..., 177d0a37-..., 1ba55596-..., 2393da89-..., 2e53bb82-..., 367f7910-..., 3deaf6d7-..., 458a64c5-..., 4c45cc9e-..., 545ef93e-..., 58e1b97d-..., 6655d315-..., 723797ce-..., 7b3e4cca-..., 7fb382fb-..., 86d5dc3c-..., 8edfdf02-..., 951e4e49-..., 9f79f58d-..., a451a8da-..., ad047a62-..., b5d7a190-..., bd335b46-...], rendered 32/32, wrapped=false
[audit] rotation throughput (rotation-only, excludes anchor + prescan-promoted ids, uses RENDERED not picked count): 32 pool-details/tick over 735 rotation candidates -> full pass ~23 ticks (~days)
[audit] pool lenses: 6 rendered (360px x2, dark x2, ko x2) over 6 rotation picks, 0 skipped
```
(UUIDs elided to `...` for readability here only; the full ids are in the
scratch `clean-out-A.json` if needed — `poolRotation.picked` is byte-identical
to Run B's, verified programmatically below.)

**Run B — `AUDIT_POOL_LENS_SAMPLE=0`, same fresh committed starting state:**
```
$ AUDIT_ROTATION_STATE=.../clean-rotation-B.json AUDIT_STATIC_ROTATION_STATE=.../clean-static-B.json AUDIT_OUT=.../clean-out-B.json AUDIT_POOL_LENS_SAMPLE=0 \
  node audit-app.js
EXIT:0  ELAPSED:118s
```
```
[audit] surfaces covered: text-surfaces, i18n, grid-token, pool-detail, grid-chain, dead-pool, grid-loading, pool-detail-360, grid-360, pool-detail-dark, pool-detail-ko, pool-detail:201e5f6e, pool-detail:ce14c4f9, pool-detail:d4b3c522, pool-detail:db678df9, pool-detail:e378a7c2, pool-detail:eaa7b496, pool-detail:f0131970, pool-detail:f8cd444e, pool-detail:01d96249, pool-detail:097b18e2, pool-detail:0f23649e, pool-detail:177d0a37, pool-detail:1ba55596, pool-detail:2393da89, pool-detail:2e53bb82, pool-detail:367f7910, pool-detail:3deaf6d7, pool-detail:458a64c5, pool-detail:4c45cc9e, pool-detail:545ef93e, pool-detail:58e1b97d, pool-detail:6655d315, pool-detail:723797ce, pool-detail:7b3e4cca, pool-detail:7fb382fb, pool-detail:86d5dc3c, pool-detail:8edfdf02, pool-detail:951e4e49, pool-detail:9f79f58d, pool-detail:a451a8da, pool-detail:ad047a62, pool-detail:b5d7a190, pool-detail:bd335b46, landing, planner, planner-360, planner-ko, plan-bloom-growth, plan-bloom-target, plan-bloom-subscription, plan-bloom-360, plan-bloom-ko, static-page, static-page:tokens/shit, static-page:tokens/wtao, static-page:tokens/cscbusdc, static-page:tokens/kysol, static-page:chains/solana, static-page:chains/ethereum
[audit] findings: 1 total, 0 blocking (P0/P1)
[audit] pool rotation: cycle 0, seen 48/735 candidates, picked [same 32 ids as Run A, byte-identical order], rendered 32/32, wrapped=false
[audit] rotation throughput (rotation-only, excludes anchor + prescan-promoted ids, uses RENDERED not picked count): 32 pool-details/tick over 735 rotation candidates -> full pass ~23 ticks (~days)
[audit] pool lenses: disabled (AUDIT_POOL_LENS_SAMPLE=0 or no rotation picks)
```

**Programmatic comparison of the two output JSON files** (criteria 1, 3, 4):
```
A minus lens entries == B exactly: True
lens-only entries in A: ['pool-detail:ce14c4f9@360px', 'pool-detail:d4b3c522@dark', 'pool-detail:db678df9@ko', 'pool-detail:e378a7c2@360px', 'pool-detail:eaa7b496@dark', 'pool-detail:f0131970@ko']

poolRotation A == poolRotation B on shared pre-197 fields:
  cycle True
  seenCount True
  candidateCount True
  picked True
  wrapped True
  sampleSize True
  renderedCount True
  truncated True

A lensSampleSize/lensRendered/lensSkipped/lenses: 6 6 0 {'ce14c4f9': '360px', 'd4b3c522': 'dark', 'db678df9': 'ko', 'e378a7c2': '360px', 'eaa7b496': 'dark', 'f0131970': 'ko'}
B lensSampleSize/lensRendered/lensSkipped/lenses: 0 0 0 {}
```

**Criteria satisfied:**
1. **Criterion 1**: Run A's `surfacesCovered` contains
   `pool-detail:ce14c4f9@360px`, `pool-detail:e378a7c2@360px` (≥1 `@360px`),
   `pool-detail:d4b3c522@dark`, `pool-detail:eaa7b496@dark` (≥1 `@dark`),
   `pool-detail:db678df9@ko`, `pool-detail:f0131970@ko` (≥1 `@ko`) — pasted
   verbatim above. Exit code unchanged in meaning (0, no P0/P1).
2. Run A elapsed **123s**, Run B (lens off) elapsed **118s** — both under the
   300s cap. Delta ≈ **+5s** for 6 lens renders (~0.83s/render observed here,
   the same order of magnitude as 192's ~0.19s/render marginal cost plus
   ordinary run-to-run network-fetch jitter — the two "contaminated" runs
   earlier measured 122s/120s, a +2s delta, underscoring that this delta is
   dominated by fixed-cost jitter, not the lens leg).
3. `A minus lens entries == B exactly: True` — Run B's surface list is Run
   A's list with only the 6 lens entries removed, i.e. **identical in shape**
   to the pre-197 surface list for the same seed + prior state.
4. `poolRotation.{cycle,seenCount,candidateCount,picked,wrapped,sampleSize,
   renderedCount,truncated}` are **all identical** between the two runs — the
   lens leg does not perturb rotation bookkeeping.

## Non-vacuity — demonstrated, not asserted

**Mutation 1 — drop `'ko'` from `LENSES`:**
```diff
-const LENSES = ['360px', 'dark', 'ko'];
+const LENSES = ['360px', 'dark'];
```
```
$ node test_audit_pool_lens.js
Error: expected the fixed lens order ['360px','dark','ko'], got ["360px","dark"]
    at assert (/home/user/defi_garden/test_audit_pool_lens.js:51:47)
    ...
EXIT:1
```
Restored byte-exact (`git diff origin/main -- audit-app.js | grep "LENSES = "`
shows only the intended `['360px', 'dark', 'ko']` line), re-ran:
```
test_audit_pool_lens.js: 7 passed, 0 failed
EXIT:0
```

**Mutation 2 — the exact anti-pattern spec §4 warns about, flip a lens
surface to also carry `rotationPick: true`:**
```diff
-      kind: 'pool', poolId: id, lensPick: true
+      kind: 'pool', poolId: id, lensPick: true, rotationPick: true
```
```
$ node test_audit_pool_lens.js
  ✗ (a)+(b): three rotation picks each get one lens surface — correct width/dark/ko/url per lens, lensPick set, rotationPick NOT set
    expected 3 plain rotationPick surfaces, got 6: ["pool-detail:lens0001","pool-detail:lens0002","pool-detail:lens0000","pool-detail:lens0001@dark","pool-detail:lens0002@ko","pool-detail:lens0000@360px"]
  ...
  ✗ (f): rotation bookkeeping (seen, renderedCount, candidateCount, picked, truncated, wrapped) is identical with the lens leg on vs off
    rotationPick poolIds must be identical: on=[... 14 entries, doubled ...] off=[... 8 entries ...]
  ...
test_audit_pool_lens.js: 5 passed, 2 failed
EXIT:1
```
Restored byte-exact:
```
$ git diff origin/main -- audit-app.js | grep -c "rotationPick: true, rotationPick\|lensPick: true, rotationPick"
0
$ git status --porcelain
 M audit-app.js
 M package.json
?? test_audit_pool_lens.js
```
```
$ node test_audit_pool_lens.js
test_audit_pool_lens.js: 7 passed, 0 failed
EXIT:0
```
Both mutations independently killed by the new test, both restored
byte-exact and re-verified green.

## `git diff origin/main --stat` (post-fix)

```
 audit-app.js                  | 129 +++++++++++++++++++++++++--
 package.json                  |   2 +-
 product-loop-kit/specs/199.md | 200 ++++++++++++++++++++++++++++++++++++++++++
 test_audit_pool_prescan.js    |   8 +-
 4 files changed, 331 insertions(+), 8 deletions(-)
```
(`product-loop-kit/specs/199.md` is the pre-existing spec commit already on
this branch before this build session started, not authored here.
`test_audit_pool_prescan.js`'s 8-line delta is the single operator-authorized
A6 repoint above — confirmed to be exactly that one hunk via
`git diff origin/main -- test_audit_pool_prescan.js | grep -c "^[+-]"` = 10.)

## `git status --porcelain` (post-fix)

```
 M audit-app.js
 M package.json
 M test_audit_pool_prescan.js
?? product-loop-kit/specs/199-notes.md
?? test_audit_pool_lens.js
```
`product-loop-kit/signals/audit-findings.json` and `.../audit-rotation.json`
confirmed **untouched** throughout (`git status --porcelain --
product-loop-kit/signals/` returns nothing) — every real/exploratory
`node audit-app.js` invocation in this session had `AUDIT_ROTATION_STATE`,
`AUDIT_STATIC_ROTATION_STATE`, and `AUDIT_OUT` all redirected to scratch
paths, with the one exception (a stray `audit-static-rotation.json` created
by a verification call that forgot the override) caught and removed
immediately, confirmed clean before any further step.

## Resolved: `test_audit_pool_prescan.js` A6 repoint (operator-authorized scope extension)

The regression documented as finding #1 (below, and in the original
"Deviations" §1) was **fixed** after the operator explicitly authorized
exactly one change to `test_audit_pool_prescan.js` — repointing the stale
`extraSurfaces.length === DEFAULT_POOL_SAMPLE` proxy to a rotation-only count.
This is now a **resolved** item, not an open finding or a deliberately-unfixed
one.

**The change** (the only hunk touched in that file):
```diff
-    assert(r.extraSurfaces.length === DEFAULT_POOL_SAMPLE, `rotation (DEFAULT_POOL_SAMPLE=${DEFAULT_POOL_SAMPLE}) must still fill its own budget when only promotion is killed; got ${r.extraSurfaces.length}: ${JSON.stringify(r.extraSurfaces.map((s) => s.name))}`);
+    // backlog 199: `extraSurfaces.length` alone stopped being a proxy for
+    // "rotation filled its own budget" the moment lens surfaces (marked
+    // `lensPick`, never `rotationPick`) started riding along in the same
+    // array — filter to `rotationPick` surfaces so this keeps measuring the
+    // guarantee it names, not an array length 197 legitimately grows.
+    const rotationOnlySurfaces = r.extraSurfaces.filter((s) => s.rotationPick);
+    assert(rotationOnlySurfaces.length === DEFAULT_POOL_SAMPLE, `rotation (DEFAULT_POOL_SAMPLE=${DEFAULT_POOL_SAMPLE}) must still fill its own budget when only promotion is killed; got ${rotationOnlySurfaces.length} rotationPick surfaces: ${JSON.stringify(rotationOnlySurfaces.map((s) => s.name))}`);
```
No other assertion in the file was touched; `git diff origin/main --
test_audit_pool_prescan.js | grep -c "^[+-]"` = 10 lines (this one hunk only).

**Verbatim re-run, post-fix:**
```
  ✓ A3a: prescanPools() on a fixture with exactly one apy-rail-breach pool returns exactly that suspect
  ✓ A3b: runAudit({only:["pool-prescan"]}) against a fixture snapshot file emits the P0 pool-prescan:apy-rail-breach aggregate finding
  ✓ A5: same seed -> identical extraSurfaces + poolPrescan.promoted across two calls
  ✓ A5: different seed, suspects <= cap -> promotion set unchanged (promotion is suspicion-driven, not seed-driven)
  ✓ A5: different seed -> ROTATION may differ (coverage actually accumulates, not just promotion)
  ✓ A6: opts.poolPrescan === false -> no promotion, no pool-prescan findings, rotation still fills its own budget
  ✓ A6: AUDIT_POOL_PRESCAN=0 env var has the same effect as opts.poolPrescan:false
  ✓ A6: poolIds override -> exactly that pool as anchor, prescan off, no extraSurfaces from a single id
  ✓ A6: poolIds override with multiple ids -> first is the anchor, the rest become pool-detail:<prefix> extraSurfaces verbatim
  ✓ A3 (spec 171): every suspect for the signal promoted AND every promoted surface rendered zero findings -> aggregate downgraded to P2 with a reason naming the surface
  ✓ A4 (spec 171, load-bearing): same as A3 but ONE suspect left unpromoted -> severity unchanged (unverified != clean)
  ✓ A4b (spec 171): a promoted suspect whose surface was never actually rendered in THIS run (opts.only scoped it away) counts as unverified, not clean
  ✓ A5 (spec 171): all suspects promoted but ONE promoted surface produced >=1 rendered finding -> severity unchanged
  ✓ A7 (spec 171): prescan disabled -> zero aggregate findings exist to reconcile in the first place; reconciling the empty set is a true no-op

test_audit_pool_prescan.js: 14 passed, 0 failed
```
Exit code **0**. 14/14 — matches the `origin/main` baseline count exactly,
now achieved WITH the lens diff in place.

Sibling tests re-confirmed unaffected by the repoint:
```
$ node test_audit_pool_lens.js  -> test_audit_pool_lens.js: 7 passed, 0 failed   (EXIT:0)
$ node test_audit_static_rotation.js -> test_audit_static_rotation.js: 13 passed, 0 failed   (EXIT:0)
```

**Non-vacuity for the repointed assertion** (a `.filter()` can silently pass
on an empty array, so this had to be demonstrated, not assumed). Drivable
directly in the fixture: temporarily shrank the A6 fixture's candidate pool
from `DEFAULT_POOL_SAMPLE + 10` (42) non-anchor pools down to `5` (well under
`DEFAULT_POOL_SAMPLE`, so rotation genuinely cannot fill a 32-pick budget —
`computeRotation()` caps `picked.length` at the candidate count, exactly the
mechanism the fixture's own pre-existing comment warns about):
```diff
-    const pools = [anchorPool(), railBreachPool('breach-pool-E')].concat(Array.from({ length: DEFAULT_POOL_SAMPLE + 10 }, (_, i) => cleanPool(i)));
+    const pools = [anchorPool(), railBreachPool('breach-pool-E')].concat(Array.from({ length: 5 /* NON-VACUITY PROBE 197 — deliberately fewer than DEFAULT_POOL_SAMPLE, temporary */ }, (_, i) => cleanPool(i)));
```
```
$ node test_audit_pool_prescan.js
  ✗ A6: opts.poolPrescan === false -> no promotion, no pool-prescan findings, rotation still fills its own budget
    rotation (DEFAULT_POOL_SAMPLE=32) must still fill its own budget when only promotion is killed; got 6 rotationPick surfaces: ["pool-detail:p0000002","pool-detail:p0000003","pool-detail:p0000004","pool-detail:breach-p","pool-detail:p0000000","pool-detail:p0000001"]
  ✓ A6: AUDIT_POOL_PRESCAN=0 env var has the same effect as opts.poolPrescan:false
  ✓ A7 (spec 171): prescan disabled -> zero aggregate findings exist to reconcile in the first place; reconciling the empty set is a true no-op

test_audit_pool_prescan.js: 13 passed, 1 failed
```
Exit code **1** — the repointed filter genuinely goes RED when rotation
under-fills its budget (6 rotationPick surfaces from a 6-candidate pool vs
the expected 32), proving the filter is a live assertion, not a vacuous
always-pass. Restored byte-exact:
```
$ git diff origin/main -- test_audit_pool_prescan.js | grep -c "^[+-]"
10
```
(only the one authorized hunk remains — the probe line is gone). Re-ran green:
```
test_audit_pool_prescan.js: 14 passed, 0 failed
```
Exit code **0**.

## New findings the audit originated

1. No P0/P1 findings originated by the real end-to-end runs: both Run A and
   Run B report `[audit] findings: 1 total, 0 blocking (P0/P1)` — the single
   finding is a pre-existing, already-known one carried from
   `text-surfaces`/`i18n`/prescan legs, unrelated to the lens surfaces
   themselves (both runs, lens-on and lens-off, report the identical single
   finding). The lens leg itself originated **zero** new findings in these
   two runs — expected on a small (6-surface) sample against an already
   largely-clean codebase; the whole point of this item is to make future
   360px/dark/KO defects on non-anchor pools reachable at all, not to
   guarantee one shows up in the first six draws.

## What was deliberately not fixed here

- The `test_audit_pool_prescan.js` A6 regression is **no longer in this
  list** — it was fixed under the operator-authorized scope extension; see
  "Resolved: `test_audit_pool_prescan.js` A6 repoint" above.
- The pre-existing `test_audit_prescan.js` criterion-4 red (probe-collision
  class, proven pre-existing on `origin/main`, unrelated to this item's
  files) — untouched, per "one item, one red class."

## What was NOT run (UNRUN, not implied green)

- `npm run test:browser` (the full ~40-file, up to 600s/file browser lane) —
  **UNRUN**. Not requested by name in the build brief (which named specific
  files individually, all of which WERE run), and running the full lane
  would not fit this item's foreground timebox alongside the two mandatory
  paired end-to-end `node audit-app.js` runs (each ~120s) plus the
  determinism/non-vacuity investigation above. Every audit-family test file
  the brief explicitly named was run individually and reported above.
- The static-estate lens dimension (`static-page:*`) and planner/bloom
  surfaces — out of scope per spec 199's own "Out of scope" section, not
  built, not tested.

## PUSH FAILURE — first conclusion WRONG, real cause found, resolved (operator, 2026-08-01)

Recorded in full because the wrong conclusion is the more useful half.

**What was concluded first, and it was wrong.** Every `git push` failed **HTTP 413 on
`POST /git-receive-pack`**. Reproduced on a no-op push whose pack measures 32 bytes, on the loop branch AND
on the harness-designated branch, retried 2s/4s/8s/16s, `http.postBuffer`/`pack.window=0` making no
difference; `GITHUB_TOKEN`/`GH_TOKEN` in this container turned out to be a 14-character proxy placeholder,
so a direct GitHub push authenticates as nobody. On that evidence the run concluded pushes were disabled in
this environment, filed issue #354 and handed the human a `git format-patch` artifact — citing PR #331
(item 176, 07-29) as precedent for the same symptom.

**The real cause.** This session's clone is **shallow** (`.git/shallow`, created 06:12), and `main` advanced
after it — the repo's own daily sitemap CI plus the 2026-08-01 heartbeat commit `2652f6d26`. `git push`
takes the remote's *advertised* ref tips as pack negatives, but only ones whose objects it holds; after
`main` moved, **not one advertised tip existed locally** (`grep -c "$(git rev-parse origin/main)"` over the
receive-pack advertisement returned **0**). With no negative available, send-pack packed the entire
snapshot: measured **500,059,675 bytes uploaded** (12,949 chunks, `GIT_TRACE_CURL`) for a change whose
correct thin pack is **41,205 bytes**. The 413 was accurate — the request really was too large.

**The fix, one command.** `git fetch origin main`. The advertised tip (`2652f6d26`) became a local object,
the pack dropped to 41 KB, and the push succeeded.

**Two things the diagnosis also turned up.** (a) The relay is not a dumb proxy — it *inspects* push payloads
and answers **403 with an explicit `ERR …` message** for policy denials (`only ref-update and shallow lines
are permitted`), so a genuine policy block looks nothing like this 413. (b) The heartbeat commit that broke
the base also **took backlog ids 197 and 198**, so this item was renumbered 197 -> 199 before merge
(2026-07-11 collision precedent); every self-reference was repointed and `test_audit_pool_lens.js` (7/7) and
`test_audit_pool_prescan.js` (14/14) were re-run green *after* the rename.

Written up as `playbooks/shallow-clone-push-413.md`, whose first step is: measure
`git pack-objects --revs --thin --stdout | wc -c` before concluding anything about the environment.
Issue #354 was corrected rather than left standing under the wrong conclusion.
