# 105 — build notes

Built 2026-07-15 (build loop). One item, per spec `specs/105.md`.

## What was built
- `app.js`: new `kpiEnrichedPoolRef` useRef + one purely-additive `useEffect`
  (after the pool-detail resolution effect) that, when the detail pool carries no
  `kpis`, fetches `/data/pools-snapshot.json` once (ref-guarded, no loop), finds
  the pool by `pool.pool`, and merges only a real `kpis` object onto `detailPool`
  via a functional `setDetailPool`. Any failure / pool-absent leaves `detailPool`
  untouched → the 088.1 + 103 notes hide exactly as today. `pools` array and all
  trust-rail logic byte-untouched.
- `test_kpi_seo_enrichment.js` (new, port 8799): rendered-Playwright gate,
  mirrors `test_kpi_track_record.js`. Live `/pools` fixture pools carry NO kpis
  (real SEO-landing shape); `/data/pools-snapshot.json` routed to a fresh fixture
  WITH kpis. D1–D5 per spec §D. Wired into `package.json`'s test chain after
  `test_kpi_momentum.js`.
- `app.compiled.js` / `app.compiled.min.js` regenerated via `npm run compile &&
  npm run minify`.

## Deviations from spec
None on code/test content. Implementation matches spec §A/§D verbatim.

## Conservative choices (recorded for the improve loop)
- The enrichment fetches the snapshot DIRECTLY, bypassing the 15-min
  snapshot-meta freshness gate (spec §Territory-note 3): `kpis` are slow-moving
  derived signals from 087's retained history, and 071's live-data volatility
  note (which reads live `apyMean30d`, not kpis) takes precedence over both
  kpis-driven notes — so a few-hours-stale kpis object cannot mislead. Simpler,
  and any failure is a no-op (notes hide as today).
- Fires whenever `detailPool` lacks `kpis`, not only on `?pool=` deep links. In
  practice the deep-link path is the only kpis-less detail path (in-app
  browse→detail carries kpis from the snapshot); if `pools` ever came from live
  (escape hatch), enriching that detail pool too is consistent and honest.

## Test results (agent-run, 2026-07-15)
- `test_kpi_seo_enrichment.js` → 5/5
- `test_kpi_track_record.js` → 7/7 (regression)
- `test_kpi_momentum.js` → 8/8 (regression)
- `test_compiled_assets.js` → 4/4 ; `test_minified_assets.js` → 7 pass (the 2
  home.html/plan.html raw-asset assertions fail identically on pristine main —
  pre-existing, unrelated to this diff; verified via a clean origin/main
  worktree run).

## Risk
HIGH — touches `?pool=` deep-link render behavior (a sacred parameterized-URL
surface). Purely additive: surfaces trust-signal notes that otherwise hide;
reads only derived kpis; never filters/reorders/re-flags a pool; never reads or
writes the rail constants. No NEVER-list surface (no rail weakening, no
credentials, no SEO deletion, no out-of-scope dirs).
