# 088.1 build notes (2026-07-14)

Sub-item 088.1 of 088 (data-layer leg 3): first ICP-facing KPI surfaced in-app — a rate-track-record /
steadiness note on pool detail, extending the 071 volatility-note pattern. 088 stays open for further
surfacings.

## Conservative choices / deviations

- **Surface = pool detail, data via `pool.kpis` if present, ZERO new fetch.** The recommended surface
  (spec §sketch) is pool detail. 087's `kpis` ride only `data/pools-snapshot.json`, which the app loads
  for `?token=`/`?chain=` browse — so an in-app browse→detail click (`handlePoolClick`) carries `kpis`
  into `PoolDetail` today. Direct `?pool=` SEO deep links always load LIVE `/pools` (no `kpis`) → the
  note hides honestly. Chosen over adding a snapshot-lookup fetch on the deep-link path: smaller change,
  no new network dependency on the conversion-critical page, no entanglement with 059/072 load logic.
  The SEO deep-link enrichment is a documented follow-up sub-item, NOT built here (one-item rule).

- **Data is null-valued today (1 history point).** Every pool's `kpis` is currently
  `{historyPoints:1, firstSeen, apyMomentum:null, apyStdev:null, tvlTrend:null}`, so in production the
  note only renders its "still building a track record" (NEW) tier until 087's daily CI accrues history.
  The STEADY/TRACKED tiers activate automatically as data accrues; the code covers all tiers today and
  is exercised across all three by the Playwright fixtures. Honest-by-construction: no fabricated
  steadiness claim on thin history.

- **Mutual exclusion with 071.** The note yields entirely when the 071 divergence boolean fires (same
  expression), so the volatile case shows only 071's "moves a lot" message — never two rate notes at
  once, never a contradiction.

- **ONE KPI only.** `apyMomentum` and `tvlTrend` (also published by 087) are intentionally NOT surfaced
  here — smallest-change / one-KPI rule. Candidates for later 088 sub-items.

- **Steady threshold** = `apyStdev / currentTotalApy <= 0.2` with `historyPoints >= 7`. Relative
  dispersion (not absolute) so a 6% and a 20% pool are judged on the same "how much does the rate wobble
  relative to its level" basis. `>= 7` points before any steadiness claim (a week of history minimum).

## Trust rails

Untouched. The note reads only the derived `kpis` object + `apyBase/apyReward/apyMean30d`; it never
filters, drops, reorders, re-weights, or re-flags a pool, and never reads/writes `APY_SANITY_LIMIT` or
`DEFAULT_MIN_TVL`. Ranking/annotation within already-passing pools only (087/058 §5).

## Artifacts

`npm run compile && npm run minify` regenerated `PoolDetail.compiled.js`, `PoolDetail.compiled.min.js`,
`translations.min.js`. (`npm install` was needed first — `node_modules` was empty; it's gitignored, not
a tracked change.)

## Tests

- New `test_kpi_track_record.js` (port 8795, mirrors `test_rate_volatility.js` fixture-routing): 7/7,
  zero page errors — NEW/STEADY/TRACKED tier renders, no-kpis→absent, volatile+kpis→071-wins, KO copy.
  Added to the `package.json` test chain.
- `test_rate_volatility.js` 5/5 (071 intact), `test_compiled_assets.js` 4/4, `test_minified_assets.js`
  9/9.
