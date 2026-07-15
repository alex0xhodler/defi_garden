# 104 — build notes (deviations + conservative choices)

Build loop 2026-07-15. Operator session on claude-opus-4-8; product code written by a
dispatched Opus coding agent per the 2026-07-13 execution split; verifier subagent judged
the diff.

## What was built (matches specs/104.md exactly)

- `PoolDetail.js` (~line 1404): new `.tvl-trend-note` block, placed immediately AFTER the
  103 rate-momentum note and before the Tokens Section. Reuses 071's exact inline neuro
  styling. Gate = `!(071 volatility boolean) && kpis object present && typeof
  kpis.tvlTrend === 'number' && historyPoints >= 7 && |tvlTrend| >= 0.25`. Two tiers:
  SHRINKING (`tvl <= -0.25`) and GROWING (otherwise). Percent formatted via `_formatNum`
  (en-US grouping, never bare toLocaleString). Reads only `pool.kpis.*` + the 071 APY
  fields — no rail constant read/written, no filter/reorder/reflag.
- `translations.js`: two keys `tvlTrendShrinking(pct, hp)` / `tvlTrendGrowing(pct, hp)` in
  EN + natural KO, both added together. `${pct}` is the pre-formatted percent string
  incl. `%`.
- `PoolDetail.compiled.js`, `PoolDetail.compiled.min.js`, `translations.min.js`
  regenerated via `npm run compile && npm run minify` in the same working tree.
- `test_kpi_tvl_trend.js`: rendered-Playwright gate (mirrors `test_kpi_momentum.js`),
  port 8797, D1–D8. Wired into `package.json`'s test chain after
  `test_kpi_seo_enrichment.js`.

## Conservative choices

- **Threshold `|tvlTrend| >= 0.25` (25%) + window `historyPoints >= 7`.** Mirrors the 103
  momentum note's "only speak on a meaningful move over a real window" discipline. A
  ≥25% deposit-base swing over ≥7 tracked points is a genuine trend, not day-to-day TVL
  noise; below it the note stays silent (D3/D4 assert absence). This keeps the note honest
  and avoids stacking noise on every pool.
- **Yields to the 071 volatility note** (same divergence boolean negated), identical to the
  088.1/103 siblings, so a volatile pool shows exactly one note (D6 asserts the tvl-trend
  note is ABSENT and the volatility note PRESENT).
- **Growing case explicitly NOT sold as a guarantee** ("More deposits isn't a guarantee…")
  and the shrinking case names the ICP-relevant risk plainly (a pool can keep clearing the
  $10M floor while losing deposits) — cautious-saver, education-not-advice framing; no
  "save up/afford/budget".
- **Live SEO deep-links show nothing.** `?pool=<id>` loads live `/pools` with no `kpis`, so
  the note hides (D5 asserts absence with no-kpis + null-tvlTrend fixtures). Consistent with
  088.1/103; SEO-landing kpi enrichment is item 105's territory, already shipped for the
  notes that existed then — tvl-trend inherits it automatically once a snapshot with kpis
  is the source.

## Deviations from spec

- None material. The implementation follows specs/104.md criteria A–D verbatim.

## Test results (this session, timeboxed ≤5 min each)

- `test_kpi_tvl_trend.js` — 8/8 PASS (D1–D8, real rendered pool-detail DOM).
- Regression on siblings: `test_kpi_track_record.js` 7/7, `test_kpi_momentum.js` 8/8,
  `test_rate_volatility.js` 5/5 — all green (mutual exclusion + no interference confirmed).
- `test_compiled_assets.js` 4/4, `test_translations_fallback.js` 8/8 — green.
- `test_minified_assets.js`: the 7 "byte-identical to a fresh minify" assertions ALL PASS
  (incl. PoolDetail.compiled.min.js + translations.min.js — proves 104's regeneration is
  consistent). The 2 failing assertions ("home.html loads … *.compiled.min.js" and
  "plan.html loads … planner.min.js") are PRE-EXISTING on clean `origin/main`
  (c630d4535) — proven by `git stash` baseline: clean HEAD fails the identical 2
  assertions. Root cause = the landing-animation first-paint PRs (#241/#242/#243) had
  home.html/plan.html load RAW js for faster first paint; item 104 touches neither file.
  Flagged for the heartbeat as a separate item candidate, out of 104's scope.
- Sandbox-blocked Playwright/external-host tests in the full chain (test_landing/test_smoke/
  test_search/etc.) are the standing 2026-07-12 network limitation, 104-independent.

## Environment note

The dispatched coding agent left a lingering test server + chromium holding port 8797
after its own test run; the operator stopped the agent (edits already complete + correct in
the working tree) and cleaned the processes before the clean verification run above.
