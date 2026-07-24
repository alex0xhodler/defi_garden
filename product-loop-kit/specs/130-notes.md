# 130 — implementation notes

## What was built
Single-source pool-type classification. `PoolDetail.js` (loads first) now owns the 5 protocol-list constants + a top-level `function getPoolTypeShared(pool)` (app.js's complete classifier verbatim, RWA→YieldDerivatives→poolMeta-lending→LENDING→DEX→STAKING→YieldFarming). `'sky-lending'` appended to `LENDING_PROTOCOLS`. `app.js` deleted its 5 list consts + getPoolType body, now delegates: `const getPoolType = (pool) => getPoolTypeShared(pool);`. Grid call-sites (app.js 5 sites) unchanged. Recompiled + reminified; `getPoolTypeShared` survives terser as a global (top-level names preserved, same mechanism as `PoolDetail`).

## Conservative choices
- Chose the true single-source dedupe (PoolDetail owns it, app.js delegates) over keeping two hand-synced copies — aligns with the REUSE-COMPONENTS standing decision (2026-07-10) and makes future drift impossible. Cross-script global reachability is guaranteed by home.html's documented load order (PoolDetail.compiled.min.js before app.compiled.min.js — already relied on for the global `PoolDetail`).
- Ported app.js's classifier verbatim (it is the more complete one, with RWA/Yield-Derivatives + `\s+`→`-` normalization) rather than the narrower PoolDetail version — this UPGRADES pool-detail classification (venus/moonwell/pendle now correct there) at no cost to the grid.
- `venus`/`moonwell`/`benqi-lending` were already in app.js's LENDING list, so the only new list entry needed was `sky-lending`.

## Deviations from spec
- None functional. All 6 acceptance criteria met via `test_pool_type_badge.js` (10/10 rendered, re-run independently by the orchestrator: EXIT 0).

## Known pre-existing failure (NOT introduced by 130)
- `test_minified_assets.js` has one failing assertion: "plan.html still loads raw planner.js". Verified byte-identical on `origin/main` (`git show origin/main:plan.html` references `planner.js`, not `planner.min.js`, at line 100). Item 130 touches neither `plan.html` nor `planner.js`/`planner.min.js`. This failure predates the item and is out of its scope — plan.html's CI-minification swap is a separate concern. Documented here per the honesty rule; not fixed (would be scope creep / a verifier FAIL).

## Tests run (orchestrator, independent)
- `test_pool_type_badge.js` — 10/10, EXIT 0 (new acceptance test)
- `test_category_taxonomy.js` — 8/8 unit + 5/5 rendered (grid classification unchanged regression)
- `test_compiled_assets.js` — 4/4; `test_protocol_parsing.js` 9/9; `test_qualifier_fix.js` 9/9
