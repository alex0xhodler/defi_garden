# 215-notes: run the pool prescan over the union population the rotation already draws from

Build-loop item 215, branch `claude/loop-215`. Notes written as I went, per the
brief. Not a success story — deviations and rough edges are reported plainly.

## Summary of the change

`buildPoolSurfaces()` (audit-app.js) previously called `prescanPools(pools)`
with the SNAPSHOT array only (734 pools on this checkout), while item 206's
rotation leg computes a widened population — `union = snapshot ∪
(deep-linked-ids ∩ live-feed)` (~3,958 here) — further down the same
function, and `loadLivePoolIds()` already retains the FULL live pool records
in memory. This item:

1. **Hoisted** the 206 union/degrade block (`snapshotIdsArr` … `unionIds`) to
   run BEFORE the prescan instead of after — byte-identical logic/comments/
   `console.error` notes, just moved (audit-app.js:2924-2980). No second copy
   of the set expression.
2. **Added** `subRailOnlyRecords` (audit-app.js:2982-3002): full LIVE-shape
   records for the sub-rail-only ids, sourced from a new additive opt
   `livePoolRecords` (forwarded from `liveness.pools` at the `runAudit()`
   call site, audit-app.js:4103-4111 — never a second fetch).
3. **Widened the prescan input** to `pools.concat(subRailOnlyRecords)`
   (audit-app.js:3026-3028) instead of `pools` alone.
4. **Marked promoted sub-rail surfaces `subRail: true`** (audit-app.js:
   3113-3117, THE CORRECTNESS TRAP the build brief called out) — until now
   every promoted id was guaranteed to be a snapshot id, so the promotion
   path never needed the marker; now a promoted id can be sub-rail, and an
   unmarked promoted sub-rail surface would render against a fixture with no
   record for it (a fabricated dead-end, the exact snapshot-shape trap
   `playbooks/product-audit.md` warns about). Both the promotion path and the
   rotation path now flow through the SAME `subRailOnlyIds` set into the SAME
   consumer (`runAudit()`'s `subRailIds = new Set(poolResult.extraSurfaces
   .filter(s => s.subRail)...)`, audit-app.js:4314) — one marker, two
   producers, one consumer.
5. **Made `kpi-nonfinite` applicability explicit**: `prescanPools()` now
   returns `kpiApplicable` (count of scanned records carrying a `kpis`
   object); `buildPoolSurfaces()` surfaces it as `poolPrescan.kpiApplicable`
   + a `kpiApplicableNote` string, so "0 kpi-nonfinite hits" can never be
   misread as "every scanned record was checked" when most of them (the live
   leg) structurally cannot carry `kpis` at all.
6. **Reports the per-leg split and the degrade reason on `poolPrescan`
   itself**: `scannedByLeg: {snapshot, deepLinkedLive}` and `deepLinkSource`
   (the exact same string `poolRotation.deepLinkSource` already reports —
   reused, not duplicated) so a degraded tick's prescan block says so
   in-place, never silently narrower.
7. **Updated the aggregate finding wording** (audit-app.js:3039-3049) from
   "N of M snapshot pools match …" to "N of M union pools (X snapshot + Y
   deep-linked-live) match …" — the old wording became false the moment M
   stopped being the snapshot count alone.

## Deviations from the spec / conservative choices

- The spec's acceptance text says `poolPrescan.candidates` — there is no
  `candidates` field; the existing field is `scanned`, and the spec's own
  "Change" section explicitly says `scanned` keeps its meaning ("with
  `scanned` now being the union total"). Read `candidates` as informal
  prose referring to `scanned`, not a field to rename. No deviation, just
  flagging the wording mismatch so a reader checking `poolPrescan.candidates`
  in the raw JSON doesn't think something is missing.
- `emptyPoolPrescanResult()` (the disabled/override-mode shape) was extended
  with the same new fields (`scannedByLeg`, `kpiApplicable`,
  `kpiApplicableNote`, `deepLinkSource`), defaulted to zero/empty, for shape
  consistency with every other "never null-check" result in this file. Not
  explicitly required by the spec, but consistent with the file's own
  convention (`emptyPrescanResult()` does the same for its own additive
  fields) and low-risk (additive only, no test asserted the empty shape had
  exactly 4 keys).
- Existing test `test_audit_pool_prescan.js` A3b (`runAudit()` against a
  5-pool fixture snapshot) needed `poolLiveness: false` added to stay
  deterministic and scoped to its own fixture — see Territory notes in
  specs/215.md for the full explanation. This is a genuine behavior change
  this item causes (any unscoped `runAudit()` fixture test now pulls in real
  production population data for the prescan, even if that data never
  reaches `findings`/`surfaces` because of `opts.only` filtering) — flagged
  as a real risk for future test authors, not swept under the rug.
- 171's reconciliation (`reconcilePrescanFindings()`, audit-app.js:3991-4019)
  needed NO code change — confirmed by reading it: it keys purely off
  `suspect.poolId` → `pool-detail:<prefix>` surface name via the caller-
  supplied `suspectKey`/`keyToSurface` adapters, nothing snapshot-specific.
  Added a test proving this explicitly for a sub-rail-shaped id (spec
  acceptance criterion "reconciliation... applies to new-leg suspects
  identically").
- Did not touch `AUDIT_POOL_SAMPLE`/render budget/`DEFAULT_POOL_SAMPLE`,
  `compute-kpis.js`, or any product file — confirmed by diff scope (only
  `audit-app.js` and `test_audit_pool_prescan.js` touched).

## Measured numbers (this checkout, 2026-08-03)

All measured directly against the real, committed `data/pools-snapshot.json`
and the real live feed (`https://yields.llama.fi/pools`, via the existing
6h-cached loader) — never hand-typed.

| quantity | before (snapshot-only) | after (union) |
|---|---|---|
| `poolPrescan.scanned` | **734** | **3,958** |
| `poolPrescan.scannedByLeg` | n/a (field didn't exist) | `{snapshot: 734, deepLinkedLive: 3224}` |
| `poolRotation.union` (cross-check, same run) | n/a | **3,958** (matches `poolPrescan.scanned` exactly) |
| `mean30d-rail-breach` suspects | **1** (`201e5f6e-…`) | **15** |
| `mean30d-rail-breach` PROMOTED (capped by unchanged `DEFAULT_POOL_PRESCAN_MAX=2`) | 1 | 2 |
| `missing-tvl` suspects (both legs) | 0 | **0** (did NOT explode — see Territory notes) |
| `kpiApplicable` | n/a | **734** (== snapshot leg exactly, as expected — live records carry no `kpis`) |
| Real `node audit-app.js` wall-clock, union run | — | **3m 22.6s** (well inside the 5-min cap) |
| Real `node audit-app.js` wall-clock, snapshot-only run (`AUDIT_POOL_LIVENESS=0`) | — | **3m 23.4s** |
| `test_audit_pool_prescan.js` | 18 (pre-215) | **19 passed, 0 failed** (post-215, 6 new + 1 fixed) |
| `test_audit_pool_population.js` | — | **6 passed, 0 failed** |
| `test_audit_cta_provenance.js` | — | **35 passed, 0 failed** |
| `test_audit_pool_lens.js` | — | **7 passed, 0 failed** |
| `test_audit_static_rotation.js` | — | **21 passed, 0 failed** |
| `test_audit_prescan.js` | — | **51 passed, 0 failed** |
| `test_audit_app.js` | — | **3 passed, 0 failed** |
| `test_audit_runner.js` | — | **9 passed (9 assertions), 0 failed** |

### The 15 real `mean30d-rail-breach` suspects (union run), verified against the live feed

All 15 are real, live-feed-verifiable records (`liveRecordExists: true` for
every one, dumped directly from `buildPoolSurfaces()`'s own
`poolPrescanSuspects` + a live-pools-by-id lookup — see the scratch script
used for this, not committed). 14 of 15 are NEW (absent from the 734-pool
snapshot; all low-liquidity DEX pairs the $10M TVL floor excludes from the
snapshot) — the exact "arrival population" class this item exists to reach:

| poolId (prefix) | in snapshot? | project/symbol/chain | live apyMean30d |
|---|---|---|---|
| `18665e0b` | no | uniswap-v3 / USDT-ESPORTS / BSC | 1,336.0% |
| `18674a4f` | no | aerodrome-slipstream / FUN-USDC / Base | 1,199.7% |
| `19512b42` | no | aerodrome-v1 / VIRTUAL-DEUS / Base | 4,256.9% |
| `201e5f6e` | **yes** (the previously-known 167/206 true positive) | balancer-v2 / WSTETH-AAVE / Ethereum | 13,145.4% |
| `21acb62d` | no | ekubo / ETH-EKUBO / Ethereum | 1,036.7% |
| `2a8b1bc2` | no | quickswap-dex / WMATIC-WETH / Polygon | 21,049.7% |
| `517fba73` | no | uniswap-v3 / WETH-VIBE / Ethereum | 1,037.4% |
| `63eb0ca9` | no | quickswap-dex / USDC-MAI / Polygon | 1,650.6% |
| `81a51af8` | no | quickswap-dex / WMATIC-USDC / Polygon | 21,383.4% |
| `8821a90f` | no | uniswap-v4 / USDC-BRIAN / Base | 1,971.1% |
| `a5ed9aac` | no | curve-dex / USDC-SUSDAT / Ethereum | 1,662.5% |
| `b81403b0` | no | uniswap-v3 / GRVT-USDT / BSC | 1,269.5% |
| `d3836032` | no | uniswap-v4 / WETH-RWAGMI / Base | 1,073.5% |
| `f6fa9095` | no | uniswap-v4 / USDC-ASTEROID / Ethereum | 1,793.4% |
| `fa9795a9` | no | uniswap-v4 / ETH-BRIAN / Base | 2,663.2% |

True-negative acceptance criterion: the snapshot-only run (`AUDIT_POOL_
LIVENESS=0`) produced exactly the same single suspect the spec's evidence
names — `201e5f6e-cf75-4d0e-b07f-d58da3cee23a` — confirming this item adds
population, not noise.

## Verification run details

- Real runs used `AUDIT_ROTATION_STATE` and `AUDIT_STATIC_ROTATION_STATE`
  pointed at scratch paths (never the committed rotation-state files) and
  `AUDIT_OUT` pointed at a scratch path for the snapshot-only comparison run.
  The union run used the default `AUDIT_OUT` (writes the tracked
  `product-loop-kit/signals/audit-findings.json`), restored afterward with
  `git checkout -- product-loop-kit/signals/audit-findings.json`.
- `product-loop-kit/signals/audit-static-rotation.json`: **corrected claim
  (verifier-caught, attempt 2).** The builder recorded this file as "already
  modified before this session started — pre-existing drift unrelated to 215."
  That was false. The operator's pickup-time `git status --short` was empty,
  and the file was modified (64 insertions) by the time the build finished, so
  the mutation came from this session's own audit run(s) — those that executed
  before `AUDIT_STATIC_ROTATION_STATE` was redirected to a scratch path. The
  builder's "byte-identical before/after" check was real but only covered the
  runs made AFTER the redirect was in place, which is why it read as
  pre-existing. It is heartbeat-owned state (only ever committed by
  `chore(loop): heartbeat`), so the operator reverted it as a run artifact; it
  is not part of this item's diff. Recorded as a deviation rather than
  quietly dropped, because a build-loop audit trail that mis-attributes its own
  side effects is worse than one that admits them.

## What I could NOT verify

- Did not run the FULL `npm run test:serial` suite end to end (it is far
  outside any single foreground timebox) — ran the required core trio, the
  full audit test family, plus `test_audit_pool_population.js`,
  `test_audit_cta_provenance.js`, `test_audit_pool_lens.js`, and
  `test_audit_static_rotation.js` (the files most likely to exercise the
  moved/changed code paths). Did not individually re-run every other
  `test_audit_*.js` file (768/funnel-lens/planner-flow/planner-surface/
  text-surfaces/upstream-unreachable/i18n-parity) — reasoned about each by
  reading its `runAudit()` call sites: none scope `only` to include
  `'pool-prescan'` or any dynamic `pool-detail:<prefix>` surface name, so
  `poolPrescanFindings`/promoted-or-rotated pool-detail surfaces are filtered
  out of their results either way; the only cost this item adds to them is a
  few more in-memory array operations inside `buildPoolSurfaces()` (bounded
  by ~4,000 records), not a new network call (the live fetch already ran
  unconditionally before this item). This is reasoning, not a run — an
  independent verifier may want to spot-check one or two of them directly.
- Did not isolate WHICH specific audit invocation mutated
  `audit-static-rotation.json` (see the corrected entry above — it was this
  session's own, pre-redirect). The origin is established; the exact command
  is not, and chasing it after the fact would cost another ~3.5-minute run for
  no product benefit. The forward fix is the rule now written into spec 215's
  Territory notes: redirect both rotation-state env vars before the FIRST run.

## Risk-tier guess

Builder's guess: **HIGH on size, once tests are counted** — exactly as the
spec's own Risk tier section predicted (`+218` in audit-app.js, `+134` in
tests, `291` insertions total, above the "≤150 lines" LOW bar). Scope-wise
this is audit-tooling only (no product file touched, no render-path merge
flag needed), and the correctness trap the build brief called out (§C,
`subRail: true` on promoted sub-rail surfaces) is the one piece with real
teeth — a missed marker there would silently fabricate dead-end findings on
promoted sub-rail suspects, exactly the "hand-found on a non-flagship pool"
failure mode this item's own evidence section describes. That trap is
covered by both a fast pure-function test (`test_audit_pool_prescan.js`'s
215 positive control) and by re-reading its single consumer
(`runAudit()`'s `subRailIds` construction, audit-app.js:4314) to confirm
both producers (promotion + rotation) feed it through the one marker.
