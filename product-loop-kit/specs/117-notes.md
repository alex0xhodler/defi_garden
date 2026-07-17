# 117 — build notes (compute leg)

Scope shipped this run: **the compute leg only** — `apySharpe` + `apyMean` added to
`computeKpis` in `compute-kpis.js`. NO surfacing. The spec is explicit that the surface
sub-items (pool-detail annotation, analytics sort, planner blend preference) ship "ONE at
a time" AFTER the compute leg and are out of scope here. So this run satisfies exactly the
compute + test acceptance criteria; the display-copy/EN+KO/ranking criteria belong to the
future surface items and are not applicable to an invisible derived field.

## What changed
- `compute-kpis.js`:
  - Two module constants: `RISK_FREE_APY = 4.0` (disclosed ~US T-bill benchmark, configurable),
    `SHARPE_MIN_POINTS = 8` (below this the ratio is too noisy → null).
  - `computeKpis` now computes the apy series, its population stdev, and its mean ONCE and
    reuses them. New returned fields:
    - `apyMean = round(mean, 2)` — plain mean of the apy series, any point count (even 1), never null-gated.
    - `apySharpe = round((mean − RISK_FREE_APY) / sd, 2)` when `series.length ≥ 8 && sd > 0`, else `null`.
  - Both constants exported for the tests.
- `test_compute_kpis.js`: 5 new tests (apyMean any-count incl. 1 pt; apySharpe null <8 pts;
  apySharpe = 0.5 on the textbook [2,4,4,4,5,5,7,9] series (mean 5, sd 2 → (5−4)/2); apySharpe
  null on sd=0 with 8 pts; exported-constants check). No existing tests modified.

## Conservative choices / deviations
- **Reused the existing `sd` for `apyStdev`** rather than adding a parallel stdev call —
  `apyStdev`'s emitted value is byte-identical (`round(sd, 2)` gated on `enough`), so no
  existing KPI output changes; only new keys are added inside the `kpis` object.
- **No √T annualization** — deliberate and documented inline so a future reviewer doesn't
  "fix" it by multiplying by √252. `apyTotal` is already an annualized rate.
- **`apyMean` is NOT null-gated** (matches the spec's `round(mean, 2)` with no gate) — the
  mean of the observed points is honest at any count; it's only `apySharpe` that needs the
  8-point noise floor.
- **First post-merge CI run will legitimately rewrite** the snapshot/slices once to add the
  two new keys inside each pool's `kpis` object (expected — one enrich rewrite, then idempotent).
  059's churn-trap is unaffected: `generate-pools-snapshot.js` strips the whole `kpis` object
  in its freshness compare, and the existing CHURN-TRAP regression test still passes.

## Trust rails
Byte-untouched. This script still only ADDS a derived field; it never filters, reorders,
drops, or re-weights a pool, and never reads/relaxes `APY_SANITY_LIMIT` / `DEFAULT_MIN_TVL` /
anomaly flags (applied upstream by 059). The honesty caveat (Sharpe = yield-rate volatility
only, NOT principal safety) is carried in the code comment now and MUST accompany any future
surface.

## Tests
`node test_compute_kpis.js` → 20/20 exit 0. Full NORTH_STAR chain
(`test_planner.js && test_protocol_parsing.js && test_qualifier_fix.js`) exit 0.
