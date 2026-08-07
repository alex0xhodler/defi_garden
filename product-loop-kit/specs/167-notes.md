# 167 — build notes

Item: pool-detail blind spot — `audit-app.js` renders 1 pool out of 740 (the
flagship). Spec: `product-loop-kit/specs/167.md`. Branch: `claude/loop-167`
(already checked out per the build brief — not created here). Base:
`949ca156d` ("167: spec the audit's pool-detail blind spot").

## What shipped

- `audit-app.js` (+317 / −8, `git diff --numstat`): `prescanPools(pools, opts)`
  — pure, no I/O beyond the already-read snapshot — plus `buildPoolSurfaces(opts)`
  (anchor resolution + promotion + rotation + aggregate findings), the
  `POOL_PRESCAN_SIGNALS` single-source-of-truth map, `DEFAULT_POOL_PRESCAN_MAX`/
  `DEFAULT_POOL_SAMPLE`/`MAX_POOL_SAMPLE`/`POOL_ID_PREFIX_LEN` constants, and
  wiring into `runAudit()` (`poolPrescan` result block, `pool-prescan:<signal>`
  aggregate findings folded into `findings`, extra `pool-detail:<prefix>`
  surfaces spliced into the surface list right after `pool-detail-ko`). Header
  doc comment gained the four new env-var entries. Both new functions exported.
- `test_audit_pool_prescan.js` (new, 207 lines, 9 cases) — covers A3/A5/A6 on
  fixtures, per the build brief's scoping.
- `package.json`: one insertion into `test:serial`'s chain, immediately after
  `test_audit_prescan.js`.

Nothing else. `git diff --stat` (tracked files only):
```
 audit-app.js | 325 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 package.json |   2 +-
 2 files changed, 318 insertions(+), 9 deletions(-)
```
Plus the one new untracked file (`test_audit_pool_prescan.js`, 207 lines). No
product file (`PoolDetail.js`/`app.js`/`planner.js`/`home.html`/
`translations.js`/any `generate-*.js`) appears anywhere in the diff.

## Acceptance criteria — evidence

### A1 — the blind spot is closed, provably

Clean, uncontaminated full run (`node audit-app.js`, no other chromium job
running concurrently — see the A7 timing note below for why "clean" mattered),
stdout JSON re-parsed:

```
$ node audit-app.js > clean_after_run.log 2>&1   # (full transcript below, A7)
$ python3 -c "... parse clean_after_run.log ..."
generatedAt: 2026-07-28T06:50:35.473Z
surfacesCovered has pool-detail:201e5f6e: True
surfacesCovered count: 29
poolPrescan: {
  "scanned": 740,
  "suspectCount": 1,
  "bySignal": {
    "apy-rail-breach": 0,
    "mean30d-rail-breach": 1,
    "kpi-nonfinite": 0,
    "absurd-magnitude": 0,
    "missing-tvl": 0
  },
  "promoted": [
    "201e5f6e-cf75-4d0e-b07f-d58da3cee23a"
  ]
}
promoted contains full id: True
```

`surfacesCovered` contains `pool-detail:201e5f6e` (≠ `747c1d2a-…`), and
`poolPrescan.promoted` contains the **full** id
`201e5f6e-cf75-4d0e-b07f-d58da3cee23a` verbatim (not the 8-char prefix used
only in surface *naming* — see Deviations §2, a real bug I found and fixed
against my own first draft). **MET.**

### A2 — the promoted pool is actually rendered

Same run, `pool-detail:201e5f6e`'s findings:
```
findings for pool-detail:201e5f6e: []
```
The surface is in `surfacesCovered` (not skipped), and it reached a verdict —
a **clean render**, zero findings, no `driver threw:` page-error. This is a
real, informative outcome, not an omission: it means `PoolDetail.js`'s 144
`mean30dSane` gate (the same gate `test_audit_app.js`'s case 3 already locks
in) suppresses the out-of-rail `apyMean30d` figure from ever reaching this
pool's rendered page — confirmed on the *exact* pool item 144/145 were filed
about. See "Findings on the live product" below. **MET.**

### A3 — non-vacuity (the 155 lesson) — mandatory proof, executed live

**Green (before neutering)**, ad-hoc 2-pool fixture (a stand-in anchor +
one pool with `apyBase+apyReward = 50,000%`), `only: ['pool-prescan']`:
```
=== GREEN RUN (before neuter) ===
[audit] playwright resolved from local (1.61.1) at local node_modules
[audit] preferred pool id absent from snapshot; using anchor-747c1d2a-stand-in
finding present: true 1 of 2 snapshot pools match apy-rail-breach — examples: breach-n
```

**Neutered** `audit-app.js:613` (`totalApy > APY_SANITY_LIMIT` →
`totalApy > Infinity`) and re-ran the same ad-hoc fixture AND the real test
suite:
```
=== NEUTERED RUN — ad-hoc fixture ===
[audit] playwright resolved from local (1.61.1) at local node_modules
[audit] preferred pool id absent from snapshot; using anchor-747c1d2a-stand-in
finding present (should now be FALSE): false

=== NEUTERED RUN — the real test suite ===
  ✗ A3a: prescanPools() on a fixture with exactly one apy-rail-breach pool returns exactly that suspect
    expected exactly 1 apy-rail-breach suspect, got 0: []
  ✗ A3b: runAudit({only:["pool-prescan"]}) against a fixture snapshot file emits the P0 pool-prescan:apy-rail-breach aggregate finding
    expected a pool-prescan:apy-rail-breach finding; got: []
  ✓ A5: same seed -> identical extraSurfaces + poolPrescan.promoted across two calls
  ✗ A5: different seed, suspects <= cap -> promotion set unchanged (promotion is suspicion-driven, not seed-driven)
    expected exactly 1 promoted suspect, got []
  ✓ A5: different seed -> ROTATION may differ (coverage actually accumulates, not just promotion)
  ✓ A6: opts.poolPrescan === false -> no promotion, no pool-prescan findings, rotation still fills its own budget
  ✓ A6: AUDIT_POOL_PRESCAN=0 env var has the same effect as opts.poolPrescan:false
  ✓ A6: poolIds override -> exactly that pool as anchor, prescan off, no extraSurfaces from a single id
  ✓ A6: poolIds override with multiple ids -> first is the anchor, the rest become pool-detail:<prefix> extraSurfaces verbatim

test_audit_pool_prescan.js: 6 passed, 3 failed
```
Exactly the three rail-dependent cases (A3a, A3b, and the A5 sub-case whose
fixture depends on the same suspect existing) went red; the other 6 — which
exercise `missing-tvl`/kill-switches/determinism-when-suspect-free, none of
which depend on the `apy-rail-breach` predicate — stayed green. Correct blast
radius, same shape as item 160's own precedent.

**Restored** and verified byte-identical, then re-ran green:
```
$ md5sum audit-app.js
05dfdb31f446c46d2221793303f3001d  audit-app.js
$ (expected, captured before neutering)
05dfdb31f446c46d2221793303f3001d  audit-app.js
=== RESTORED RUN ===
  ✓ A3a: prescanPools() on a fixture with exactly one apy-rail-breach pool returns exactly that suspect
  ✓ A3b: runAudit({only:["pool-prescan"]}) against a fixture snapshot file emits the P0 pool-prescan:apy-rail-breach aggregate finding
  ✓ A5: same seed -> identical extraSurfaces + poolPrescan.promoted across two calls
  ✓ A5: different seed, suspects <= cap -> promotion set unchanged (promotion is suspicion-driven, not seed-driven)
  ✓ A5: different seed -> ROTATION may differ (coverage actually accumulates, not just promotion)
  ✓ A6: opts.poolPrescan === false -> no promotion, no pool-prescan findings, rotation still fills its own budget
  ✓ A6: AUDIT_POOL_PRESCAN=0 env var has the same effect as opts.poolPrescan:false
  ✓ A6: poolIds override -> exactly that pool as anchor, prescan off, no extraSurfaces from a single id
  ✓ A6: poolIds override with multiple ids -> first is the anchor, the rest become pool-detail:<prefix> extraSurfaces verbatim

test_audit_pool_prescan.js: 9 passed, 0 failed
```
**MET.**

### A4 — no surface regression

Required subset, run via `node run-tests.js --lane=browser --only=…` (per the
build brief's timebox rule — the full 63-file browser lane was never
attempted):
```
$ node run-tests.js --lane=browser --only=test_audit_runner.js,test_audit_app.js,test_seo_surface_audit.js,test_audit_prescan.js,test_audit_pool_prescan.js,test_audit_planner_flow.js
run-tests.js: 6 file(s) selected (lane=browser, plain=0, browser=6, timeout=plain:120s/browser:600s, plain-jobs=3, browser-jobs=1)

PASS        0.47s  test_audit_runner.js
PASS       20.27s  test_audit_app.js
PASS      106.11s  test_seo_surface_audit.js
PASS      124.83s  test_audit_prescan.js
PASS        0.90s  test_audit_pool_prescan.js
PASS        1.94s  test_audit_planner_flow.js

TOTAL pass=6 fail=0 timeout=0 total=6
```
The four names (`pool-detail`, `pool-detail-360`, `pool-detail-dark`,
`pool-detail-ko`) plus `dead-pool` are present in every A1/A2 evidence JSON
above and still point at the anchor pool (`test_audit_app.js`'s own case 1
asserts `pool-detail`/`dead-pool` presence and passed). Also re-ran the plain
lane (34/34, unaffected — the new test classifies into the browser lane, same
as its siblings, since it transitively requires `playwright` via
`audit-app.js`):
```
$ node run-tests.js --lane=plain
...
TOTAL pass=34 fail=0 timeout=0 total=34
```
**MET.**

### A5 — determinism

Covered by `test_audit_pool_prescan.js`'s three A5 cases (fixture-based, no
rendering needed — `buildPoolSurfaces()` is a pure function):
1. Same seed twice → identical `extraSurfaces` + `poolPrescan.promoted`.
2. Different seed, 1 suspect ≤ cap(2) → **same** promoted set (promotion is
   suspicion-driven).
3. Different seed, zero suspects (all-clean fixture, so every `extraSurfaces`
   entry is a rotation pick) → rotation sets **differ** across seeds, proving
   coverage actually accumulates.

Also spot-checked directly against the real 740-pool snapshot:
```
$ node -e "... buildPoolSurfaces({pools, poolSeed:'seedA'}) x2, and poolSeed:'seedB' ..."
same seed identical extras: true
same seed identical promoted: true
diff seed same promoted (suspects<=cap): true
```
All 9/9 green in the test suite run quoted under A3/A4. **MET.**

### A6 — kill switches work

Fixture-level (`test_audit_pool_prescan.js`, all green above) AND end-to-end
through the real CLI path against the real snapshot:
```
$ AUDIT_POOL_PRESCAN=0 node -e "runAudit({only:['pool-prescan']})..."
findings: []
poolPrescan: {"scanned":0,"suspectCount":0,"bySignal":{},"promoted":[]}

$ AUDIT_POOL_IDS=201e5f6e-cf75-4d0e-b07f-d58da3cee23a node -e "runAudit({only:['pool-detail','pool-prescan']})..."
surfacesCovered: [ 'pool-detail' ]
poolPrescan: {"scanned":0,"suspectCount":0,"bySignal":{},"promoted":[]}
findings on pool-detail: []
```
`AUDIT_POOL_PRESCAN=0` → prescan fully off (`scanned:0`), zero `pool-prescan:*`
findings, anchor+rotation logic untouched (rotation still ran in the fixture
case above — 2 rotation picks with promotion killed). `AUDIT_POOL_IDS=<id>` →
exactly that one pool renders as `pool-detail` (the override even ran the
*real* out-of-rail pool through the real render pipeline and it came back
clean — same 144-gate confirmation as A2). **MET.**

### A7 — bounded cost

**First two measurements were contaminated** (self-inflicted — a concurrent
one-off chromium invocation during the first background run, and the full
regression suite running concurrently during the second) and are disclosed,
not used as evidence:
- Run 1 (contaminated by a concurrent ad-hoc chromium call for A2): 223s.
- Run 2 (contaminated by the concurrent regression-suite run): 260s.

**Clean, solo, timed comparison** (baseline = `git show HEAD:audit-app.js`
swapped into place, run alone; then restored to my working copy, verified
byte-identical, run alone again — no other node/chromium process running
during either):
```
$ md5sum audit-app.js   # before swap
05dfdb31f446c46d2221793303f3001d  audit-app.js
$ cp <HEAD-copy> audit-app.js
$ time node audit-app.js            # BASELINE (pre-167)
BASELINE elapsed: 101s
[audit] surfaces covered: text-surfaces, grid-token, pool-detail, grid-chain, dead-pool, grid-loading, pool-detail-360, grid-360, pool-detail-dark, pool-detail-ko, landing, planner, planner-360, planner-ko, plan-bloom-growth, plan-bloom-target, plan-bloom-subscription, plan-bloom-360, plan-bloom-ko, static-page, static-page:tokens/01, static-page:tokens/17dec2026, static-page:tokens/20261231, static-page:tokens/2027, static-page:tokens/supercbbtc, static-page:tokens/eulerrlusd
[audit] findings: 5 total, 5 blocking (P0/P1)
   # 26 surfaces

$ cp <my-working-copy> audit-app.js
$ md5sum audit-app.js   # confirmed restored correctly
05dfdb31f446c46d2221793303f3001d  audit-app.js
$ time node audit-app.js            # AFTER (167)
CLEAN AFTER elapsed: 100s
[audit] surfaces covered: text-surfaces, grid-token, pool-detail, grid-chain, dead-pool, grid-loading, pool-detail-360, grid-360, pool-detail-dark, pool-detail-ko, pool-detail:201e5f6e, pool-detail:3025b6b3, pool-detail:b55f43a8, landing, planner, planner-360, planner-ko, plan-bloom-growth, plan-bloom-target, plan-bloom-subscription, plan-bloom-360, plan-bloom-ko, static-page, static-page:tokens/01, static-page:tokens/17dec2026, static-page:tokens/20261231, static-page:tokens/2027, static-page:tokens/supercbbtc, static-page:tokens/eulerrlusd
[audit] findings: 6 total, 6 blocking (P0/P1)
   # 29 surfaces (+3: 1 promoted + 2 rotated pool-detail:<prefix>)
```
Growth: **26 → 29 surfaces (+3)**, well under `MAX_POOL_SAMPLE` (6) and under
the default additive budget (`DEFAULT_POOL_PRESCAN_MAX` 2 +
`DEFAULT_POOL_SAMPLE` 2 = 4; only 3 landed because there's exactly 1 real
suspect today, so promotion contributed 1, not 2). Wall-clock: 101s → 100s —
no measurable cost at all (within run-to-run noise); 3 extra pool-detail
renders are cheap relative to the run's other ~26 surfaces. **MET.**

### A8 — new test wired in

`test_audit_pool_prescan.js` exists (207 lines, 9 cases, all green — see A3).
Wired into `package.json`'s `test:serial` chain immediately after
`test_audit_prescan.js`:
```
$ git diff package.json
...
-... && node test_audit_prescan.js && node test_audit_text_surfaces.js && ...
+... && node test_audit_prescan.js && node test_audit_pool_prescan.js && node test_audit_text_surfaces.js && ...
```
Confirmed picked up by the test runner's auto-discovery too (not just the
`test:serial` string):
```
$ node run-tests.js --list --only=test_audit_pool_prescan.js
test_audit_pool_prescan.js	browser

TOTAL files=98 plain=34 browser=64 listed=1
```
**MET.**

### A9 — rails untouched, mechanically shown

```
$ git diff HEAD -- audit-app.js | grep -n "^[+-].*\(APY_SANITY_LIMIT\|ABSURD_MAGNITUDE\)\s*="
(empty)
$ grep -n "^const APY_SANITY_LIMIT\|^const ABSURD_MAGNITUDE" audit-app.js src/poller-core.js
audit-app.js:121:const ABSURD_MAGNITUDE = 1e11;
src/poller-core.js:18:const APY_SANITY_LIMIT = 1000;      // total APY above this = anomalous (KEPT + flagged downstream)
```
Both are the SAME single definitions that existed before this item — neither
line is touched by the diff (the grep for `+`/`-` lines on either constant's
`=` assignment returns nothing). `prescanPools()` imports and reads
`APY_SANITY_LIMIT`/`ABSURD_MAGNITUDE` from module scope, never redeclares
them. `git diff --stat` (below, repeated from the top) touches only
`audit-app.js` and `package.json` — no product file:
```
 audit-app.js | 325 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 package.json |   2 +-
 2 files changed, 318 insertions(+), 9 deletions(-)
```
**MET.**

## Deviations from the spec, and the conservative choice made

1. **Promotion + rotation are ADDITIVE budgets, not a shared one** (unlike
   157's static leg, where promoted pages *replace* uniform picks within one
   `sampleSize`). Spec §2 gives promotion its own knob
   (`DEFAULT_POOL_PRESCAN_MAX`, default 2) and describes rotation as filling
   "the remaining budget (`DEFAULT_POOL_SAMPLE`, default 2, `MAX_POOL_SAMPLE`
   cap 6)" — read literally, `DEFAULT_POOL_SAMPLE` names rotation's *own*
   budget, not `sampleSize − promoted.length`. I verified this reading against
   the Measurement section's own arithmetic: "pool-detail surfaces per run go
   1 → up to 7 (1 anchor + ≤2 promoted + ≤2 rotated)" only reconciles as
   `4 (anchor variants) + 1 (today's real suspect count) + 2 (rotation) = 7`
   under an additive model — a shared-budget model interpreting
   `DEFAULT_POOL_PRESCAN_MAX`+`DEFAULT_POOL_SAMPLE` as the same pool of 2
   would cap total growth at 2, not 3, and could never reach 7. Chose additive
   because it's the reading that makes the spec's own worked example true,
   confirmed empirically in the clean A7 run above (26→29, exactly
   4+1+2=7 `pool-detail*`-named surfaces total). Default-config growth is
   still small (≤4) and comfortably under `MAX_POOL_SAMPLE`(6), so A7 holds
   either way — but I want this reasoning on record since it's the one place
   I diverged from 157's own precedent shape rather than mirroring it exactly.

2. **`poolPrescan.promoted` holds FULL pool ids, not the 8-char prefix used in
   surface naming — a bug I found in my own first draft, not a spec reading.**
   My first implementation stored `promotedIds.map(poolIdPrefix)`, matching
   157's `prescan.promoted` (which stores *slugs*, an analogous
   shortened form). But A1 is explicit: `poolPrescan.promoted contains
   201e5f6e-cf75-4d0e-b07f-d58da3cee23a` — the whole UUID. I caught this by
   literally checking `array.includes(fullId)` against my own first-draft
   output and it was false. Fixed to store full ids; `pool-detail:<prefix>`
   surface *naming* (and the aggregate finding's `examples` list, for
   readability) still uses the 8-char prefix, per spec §2's explicit
   `pool-detail:<pool-id-prefix>` naming instruction. Re-verified after the
   fix (see A1's transcript: `promoted contains full id: True`).

3. **"P0-first, tie broken by `sampleBySeed`" implemented as a genuine
   two-tier selection**, not a single `sampleBySeed()` call over a globally
   sorted list. 157 never needed this because its two active prescan signals
   (`junk-slug`, `zero-yield-claim`) are both P1 — a plain P0-first sort was
   enough as a tie-break for a single flat pick. Pool signals mix P0 and P1
   (`missing-tvl` is P1, the rest P0), so a flat `sampleBySeed` over the whole
   sorted list could stochastically pick a P1 pool over an available P0 one
   when the P0 group alone doesn't fill the cap from one direction and
   overflows from another — I split it: take all P0 suspects first
   (seed-tie-broken only if the P0 group itself exceeds the cap), then spend
   any remaining cap on P1 suspects (also seed-tie-broken). This is the
   literal reading of "P0-first, tie broken by sampleBySeed," not an
   invention — but it's more mechanism than 157 needed, so flagging it as a
   deliberate difference in shape.

4. **Fixture in `test_audit_pool_prescan.js` needed pool ids whose first 8
   characters vary** — a real finding from writing the test, not a spec
   deviation. My first fixture draft used ids like `clean-pool-000`..`-029`;
   `POOL_ID_PREFIX_LEN`(8) truncates all of them to the identical string
   `"clean-po"`, so `pool-detail:<prefix>` surface *names* collided across
   every rotation pick regardless of which distinct pool was actually chosen
   — a fixture artifact, verified via the pool `url`s (which correctly
   differed) once I suspected the `name`-based assertion was measuring the
   wrong thing. Documented in the fixture builder's own comment; also worth
   noting as a real (if astronomically unlikely) property of the shipped
   `POOL_ID_PREFIX_LEN=8` choice: two DIFFERENT promoted/rotated pool ids that
   happen to share an 8-char prefix would collide in `surfaces[].name` within
   the same run. Real snapshot pool ids are DefiLlama UUIDs (effectively
   random in their first 8 hex characters), so this is a non-issue in
   practice — not fixed here (out of spec scope; would mean either lengthening
   the prefix or dedup logic neither the spec nor 157's naming precedent
   calls for).

5. **`kpi-nonfinite` cannot fire from any on-disk snapshot** — disclosed, not
   hidden. Valid JSON cannot encode `NaN`/`Infinity` (`JSON.parse` throws on
   the bare literal), so this signal is a pure in-memory-fixture robustness
   net, never a live-data detector, until/unless some future code path
   constructs a pool object programmatically without going through
   `JSON.parse`. Exercised implicitly by the file's own general shape (no
   dedicated fixture case in `test_audit_pool_prescan.js`, since A3/A5/A6 as
   scoped don't require it) — noted here rather than silently assumed
   equivalent to the other four signals.

6. **Pool prescan is NOT gated off under `opts.staticOnly`**, unlike item
   160's text-surfaces (which defaults OFF under `staticOnly` specifically to
   avoid colliding with `test_audit_prescan.js`'s legacy
   `surfacesCovered.length <= 7` assertion on a `staticOnly` run). Pool
   prescan never touches `surfacesCovered` at all (only the aggregate
   `pool-prescan:*` finding, gated the same way `static-prescan:*` already
   is via `opts.only`), so that specific collision cannot happen — and
   leaving it on by default is what makes `test_audit_pool_prescan.js`'s A5
   determinism cases affordable without paying full-render cost (they still
   don't use `staticOnly`, but a hypothetical future test that wanted a fast
   pool-only probe via `staticOnly` would still get real prescan behavior,
   not silently-off behavior). Verified no regression: the full 6-file
   regression run above (including `test_audit_prescan.js`, which uses
   `staticOnly` heavily) stayed green.

## Findings the new surfaces produced on the live product

**No new bug found on the promoted pool — recorded here as a confirmed-clean
result, not a candidate ticket.** The one live suspect
(`201e5f6e-cf75-4d0e-b07f-d58da3cee23a`, balancer-v2 WSTETH-AAVE,
`apyMean30d = 30282.5457`, 30× the rail) renders with **zero** findings on
`pool-detail:201e5f6e` in every run above, including the `AUDIT_POOL_IDS`
override that pointed the *anchor* surface itself directly at this pool. This
is `PoolDetail.js`'s existing 144 `mean30dSane` gate working exactly as
designed, confirmed for the first time on the *exact* pool item 144 was
originally filed about (previously only proven via a synthetic
900-quadrillion injection in `test_audit_app.js` case 3, never against this
pool's real, smaller-but-still-30×-over-rail number). No candidate ticket —
this is the audit doing its job and finding the rail holds.

The one systemic finding this run surfaces is the pre-existing
`pool-prescan:mean30d-rail-breach` aggregate (P0, `1 of 740 snapshot pools`)
— this is **known, already-ticketed territory** (items 144/145 own the
`apyMean30d` rail question at the data/KPI layer; this item's job was only to
make the pool *visible* to the scanner, which it now is). Not a new candidate
ticket, per the spec's own framing ("the live true positive your work must
make visible" — evidence, not a new defect).

## What I could NOT verify in this sandbox

- **The full 63-file browser lane** — never attempted, per the binding
  timebox rule. Only the specific 6 files A4 names were run via
  `--lane=browser --only=…`.
- **A clean-room "before" baseline run in true isolation from this session's
  own tooling** — the baseline run (101s) shared the same sandbox/CPU as
  everything else in this session; it just wasn't running *concurrently*
  with another chromium process. I cannot rule out session-level background
  noise (e.g. the harness's own processes) affecting either the 101s or 100s
  figures by a few seconds either way — the comparison is "clean" relative to
  my own other jobs, not a hermetically isolated benchmark.
- **Real Mixpanel/heartbeat pickup of the new `poolPrescan` block** — outside
  this sandbox's reach (Mixpanel MCP unauthenticated per NORTH_STAR.md); I
  can only confirm the JSON shape is correct and gets written by
  `runAudit()`, not that the heartbeat's daily job actually reads it yet.
- **Collision behavior of the `POOL_ID_PREFIX_LEN=8` naming scheme on real
  future snapshots** — argued from UUID randomness (Deviation 4), not
  empirically stress-tested against the full space of possible future
  snapshots.
- I did **not** re-run the entire `npm test` (98-file) suite — the plain lane
  (34/34) and the specific 6-file browser subset A4 names were run; the
  remaining ~58 browser-lane files outside that subset were not re-verified
  by this session (none of them read pool-detail surfaces or
  `POOL_PRESCAN_SIGNALS`/`prescanPools`/`buildPoolSurfaces`, so risk is low,
  but "low risk" is an inference here, not an observation).

## Risk-tier guess

**HIGH** (size — matches the spec's own proposed tier and 154/157/160's
precedent). Measured diff: `git diff --stat` → 2 files changed, 318
insertions(+), 9 deletions(-) (`audit-app.js` +317/−8, `package.json` +1/−1),
plus one new 207-line test file. Well over the 150-line LOW cap on raw count,
but — same argument 160 made for its own HIGH self-assessment — this is
tooling-only (`audit-app.js`, its test, `package.json`'s test chain), no
product surface, no new dependency, no trust-rail edit (A9, mechanically
shown). No NEVER-list category touched. Verifier assigns independently, per
convention.
