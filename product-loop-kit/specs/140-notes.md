# 140 — build notes

## What changed
- `app.js`: `SNAPSHOT_MAX_AGE_MS` 15 min (`15 * 60 * 1000`) → 6 h (`6 * 60 * 60 * 1000`). Comment rewritten to state the REAL CI-bake cadence (~1.5–3h, git-observable via `data/pools-snapshot-meta.json`) and that the 109 poller writes Cloudflare D1, not this repo file — so the never-realized ~5-min cadence never applied.
- Regenerated compiled/minified artifacts: `app.compiled.js`, `app.compiled.min.js`, `planner.min.js` (house rule since 052/053 — source is the edit surface, `npm run compile && npm run minify` regenerates). Verified the folded constant `216e5` (= 21,600,000 = 6h) is present in both `.min` files and the old `9e5`/`15*6e4` is gone.
- `test_snapshot_first.js`: `staleTs` 1h → **7h** (1h no longer clears the 6h gate, so scenario (c) needed a genuinely-stale age to still exercise the fallback). Added `withinTs` (3h) + new scenario **(c2)**: a 3h-old snapshot the OLD 15-min gate would have rejected now stays on the fast path with live aborted (asserts 0 live requests). Scenario count 7 → 8.

## Deviation from spec (documented per build.md step 3)
- **Spec named only `app.js`; I also changed the identical constant in `planner.js:3852`.** `planner.js` carries a byte-identical `SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000` gate (spec 059 C1) on the bare-`/` planner path — the DEFAULT product surface. The spec's stated hypothesis ("serve the overwhelming majority of prod sessions", "instant first paint") is undercut if the planner path keeps the dead 15-min gate. This is not scope creep or a refactor: it is the same one-line value change applied to the same dead gate for freshness-semantics consistency across both router paths. Conservative call: same 6h value, same rationale, no behavioral change beyond the gate width. Rendered scenario (f) already covers the planner snapshot path.

## Out of scope (unchanged, per spec)
- Bake cadence / CI schedule, D1 serving, escape-hatch refetch (sub-floor `minTvl` → live), `?pool=` always-live deep-link rule, snapshot eligibility (`!pool && minTvl >= DEFAULT_MIN_TVL`), and all trust rails (snapshot content is already $10M-railed). None touched.

## Test results (timeboxed, 5-min foreground cap honored)
- `test_pools_snapshot.js` — 9/9 pass (gate-independent; unaffected).
- `test_snapshot_first.js` — 7/8 pass. The one failing scenario **(f)** (bare `/` planner hero `.gp-tagline h1` not rendering) **FAILS IDENTICALLY AT HEAD** (verified via `git stash` baseline run: 6/7 before my change). Pre-existing sandbox flake — the planner hero renders synchronously on mount (`step==='goal'`, planner.js:4769) BEFORE any snapshot fetch, so the useEffect constant change provably cannot affect it. CLAUDE.md notes external font/analytics fetches fail locally (ignorable). My new scenario (c2) and all gate-relevant scenarios (a,b,c,d,e,g) pass.
- `test_compiled_assets.js` — 4/4 pass. `test_css_minified_render.js` — 2/2 pass.
- `test_minified_assets.js` — 7/8. The one failing assertion ("plan.html still loads raw planner.js") **also FAILS AT HEAD** (verified via `git stash` baseline). Pre-existing: `plan.html:100` references raw `planner.js`, not `planner.min.js` — I did not modify `plan.html` (not in `git status`), so this failure predates and is unrelated to spec 140.

## Net
Every test failure observed is reproduced at HEAD with my changes stashed. The diff introduces zero new failures and adds one new passing rendered assertion for the raised gate.
