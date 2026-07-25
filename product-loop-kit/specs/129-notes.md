# 129 — implementation notes (deviations + conservative choices)

## What was built
- **Reorder:** the existing "The Long Game" projection card (`PoolDetail.js`) now renders BEFORE the
  quick-metrics earnings grid (daily / monthly / risk), immediately after the hero card. The whole node
  moved verbatim — projection math, degen-haircut note, anomaly warning, and disclaimer all move with it,
  byte-unchanged.
- **Hook class:** added `pool-projection-card` to the card's className (`metric-card-simple
  pool-projection-card animate-on-mount`). Hook only — no new CSS rule; styling still comes from
  `metric-card-simple`.
- **Keep-your-money line:** new `projectionKeepNote` (EN + KO) rendered as a calm secondary line under the
  projection body. EN "Your deposit stays yours — you keep your money, and it keeps working." / KO
  "예치금은 그대로 내 것 — 돈은 지키면서 계속 일하게 하세요." No numbers in the line → nothing to rail.
- Regenerated `PoolDetail.compiled.js`, `PoolDetail.compiled.min.js`, `translations.min.js` via
  `npm run compile` + `npm run minify`. `app.compiled.js` byte-unchanged (app.js untouched).

## Conservative choices / deviations from the raw backlog idea
1. **Not APY-conditional.** The backlog row frames the problem on *low-APY* pools, but I lead with the
   projection for EVERY pool, not just below a threshold. Rationale: a threshold is arguable, adds branching,
   and the 5y compounded outcome is the honest yield-funded headline on any pool — the daily/monthly cards
   still render right below for the granular breakdown. Simpler + universal beats a per-pool hack. (Documented
   here as a deviation for the improve loop.)
2. **Reused the existing thesis wording** ("you keep your money" already in translations.js L433/499/511) —
   standing decision 2026-07-10 "reuse before inventing". No new component, no new CSS.
3. **Did NOT touch the daily/monthly cards' content** — 128 established them as the single earnings surface;
   129 only changes their POSITION relative to the projection, not their existence or copy.
4. **Trust rails untouched** — `APY_SANITY_LIMIT_LOCAL`/`isAnomalous` gate, degen ⅓ haircut, `calcDisclaimer`
   all move with the node unchanged; `showConcreteCta = !isAnomalous` and both CTAs unchanged. `grep` on the
   diff: 0 hits on any rail constant.

## Testing
- New rendered test `test_projection_lead.js` (chromium, real `?pool=<lido id>` landing) — 7/7 pass:
  projection-before-grid DOM order (EN + KO), 5y number retained, EN "keep your money" + KO "예치금" present,
  daily/monthly cards still render, no page errors. Wired into `npm test` after `test_earnings_dedup.js`.
- Regression green: `test_northstar_cta_fires.js` 7/7, `test_repeat_cta.js` 5/5, `test_earnings_dedup.js` 4/4,
  `test_ko_pool_money_honesty.js` 7/7, `test_compiled_assets.js` 4/4, `test_translations_fallback.js` 8/8.
- `test_minified_assets.js` fails (2 asserts: home.html/plan.html raw-loading) — **PRE-EXISTING on origin/main**,
  proven via `git stash -u` baseline (identical 7-pass/2-fail on the clean tree). Files untouched by 129
  (home.html/plan.html). Not a 129 regression.

## Ship / risk
- Not on the NEVER list (no trust-rail weakening, no credentials/money, no SEO deletion, no out-of-scope dir).
- Render-path change on the pool-detail (north-star) surface → **needs human visual spot-check** (003 pixel
  gate unshipped; advisory, post-merge).
