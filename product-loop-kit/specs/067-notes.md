# 067 build notes

## What shipped
`planner.js` gained `capitalGrowth(capital, annualRatePct, years)` — a lump-sum compounding helper (`capital * (1+r)^years`), the capital-path counterpart to the pre-existing `futureValue`/`totalDeposited` monthly-annuity helpers. Threaded into every GROWTH-archetype projection/deposited computation that was silently ignoring `capital`:
1. `buildPlanHero`'s growth branch (`futureValue(monthly, apy, years) + capitalGrowth(capital, apy, years)`)
2. Bloom's top-level `projection`/`bankProjection`/`deposited` vars (feeds the `plan_saved` persisted payload, using `propCapital`)
3. Bloom's live-slider `liveProjection`/`liveBankProjection` + the "You'd have deposited" line (the exact figures the reported URL rendered) — gated on `isCapitalPath`, using `slideCapital`
4. `GardenReport`'s `newProjection` (the returning-visitor recompute, using `plan.capital`)

## Deviations from spec
None — the spec was written from the diagnosed root cause, so "change" and "what shipped" match exactly.

## A real trap found and avoided mid-build
`slideCapital`'s `useState(propCapital || 5000)` defaults to `5000` even on a plan with NO capital (monthly-funded). Naively adding `capitalGrowth(slideCapital, ...)` to the live headline unconditionally (without gating on `isCapitalPath`) would have introduced a NEW bug: every monthly-funded growth plan would have gained a phantom $5,000 (or whatever the slider's current position is) added to its projection. Caught by re-reading the `slideCapital` `useState` initializer before writing the fix, not by a failing test — added an explicit regression test afterward (`growth archetype, capital=0/null -> unaffected`) to lock it in. The top-level (non-slider) `propCapital`/`plan.capital` reads don't have this trap — they're `null`/`0` when a plan has no capital, so those sites (`buildPlanHero`, the persisted `projection`/`deposited` vars, `GardenReport`) sum `capitalGrowth(...)` unconditionally without needing an `isCapitalPath` guard.

## Investigated, not a bug: pool-detail "amount" discrepancy
The human's report also mentioned "amount in pool view." Screenshots show the SAME pool (same `?pool=` id, same underlying assets) at two scroll positions of one page: `TOTAL APY 142.84%` at the top, `30D MEAN APY 405.32%` further down in "Pool Information." The "Calculate Your Earnings" figures ($3.91/day, $119.03/mo on $1,000) verify against the 142.84% *total* APY (`1000 * 1.4284 / 365 ≈ $3.91`), not the 30-day mean — the calculator is using the correct/intended field. A yield-farming reward pool's 30-day mean legitimately diverging that far from its current rate is plausible (reward-emission volatility), not a miscalculation. No code change made here; flagging it back to the human in case the discrepancy itself (two very different APY numbers shown on one page) is worth a future UX pass, but it is not the "$0" class of bug and nothing was found broken.

## Verification (Playwright, real rendered UI, not fixtures — 2026-07-11 standing decision)
New `test_growth_capital_projection.js` drives real rendered `plan.html` with the EXACT reported URL (`?goal=retirement&pace=rwa&capital=1000&fm=capital&years=5`) against a fixture pool that clears the `rwa` persona's trust rails:
1. Headline, bank-comparison, and "deposited" lines are all non-`$0`, and the headline visibly compounds above the $1,000 principal.
2. The same plan, saved (via Bloom's auto-save effect) and reloaded as a bare `/plan.html` (routing into `GardenReport`, the returning-visitor view), also renders a non-`$0` "now" projection.

New `test_planner.js` unit tests: `capitalGrowth` in isolation (compounds correctly, returns 0 for null/0 capital, returns bare principal at 0% rate) and `buildPlanHero`'s growth branch under the exact reported scenario, plus an explicit no-phantom-capital regression test for a monthly-funded plan.

`node test_planner.js` — 196/196 (was 190, +6 new). `test_growth_capital_projection.js` — 2/2 (new). No regression: `test_qualifier_fix.js`, `test_protocol_parsing.js`, `test_minified_assets.js` (7/7, `planner.min.js` regenerated + confirmed byte-identical), `test_spotlight_url.js`, `test_spotlight_attribution.js`, `test_waitlist_seo_entry.js`, `test_waitlist_funnel.js` all pass unchanged.
