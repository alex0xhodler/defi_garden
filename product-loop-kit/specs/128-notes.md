# 128 — build notes (deviations & conservative choices)

## Decisions made where the BACKLOG row left latitude
- **"Consolidate to one earnings surface + the calculator"** was ambiguous about *which* surface survives. Chose to keep the **top stat cards** (prominent, always-visible glance next to the CTA cluster) and remove the **numeric calculator-header subhead** (a collapsed-state preview of a number already shown right above it). The calculator itself is the "+ the calculator" half and is untouched. This is the smallest change that eliminates the flagged 3× redundancy without removing a whole visual block.
- **Replaced, not deleted, the subhead.** A calculator header with only a title and no subhead reads as unfinished; kept a non-numeric affordance line (`calcSubPrompt`) so the collapsed state still tells the user what expanding does.
- **Removed the `quickEstimate` translation key entirely** (EN + KO) rather than leaving it orphaned — grep confirmed `PoolDetail.js:750` was its only call site. No test references it (grepped `test_*.js`).

## Verification
- New rendered-Playwright acceptance `test_earnings_dedup.js`: 4/4 pass against the real pool-detail render.
- Regression: `test_northstar_cta_fires.js` 7/7, `test_repeat_cta.js` 5/5 (both drive pool-detail — confirm CTAs still render/fire), `test_compiled_assets.js` 4/4, `test_translations_fallback.js` 8/8, `test_planner.js` 208 assertions — all green.

## Pre-existing baseline failure (NOT caused by this item)
- `test_minified_assets.js` fails `plan.html still loads raw planner.js` (and the home.html raw-load assertion). Confirmed pre-existing by `git stash`-ing this diff and re-running: the failure is present on baseline, and `plan.html` is not in this diff. It reflects the backlog-053 "committed source loads raw, CI minifies at deploy" pattern, unrelated to earnings dedup. Left as-is (out of scope for 128).

## Compile pipeline note (for the next loop)
- `node_modules` was empty on this fresh cloud checkout; `npm install` (~within timebox) was required before `npm run compile && npm run minify` could regenerate the committed `*.compiled(.min).js` / `*.min.js`. The runtime loads `PoolDetail.compiled.min.js` (home.html:341), so editing `PoolDetail.js` alone is invisible in prod without recompiling + re-minifying — both were run and the drift tests (`test_compiled_assets.js`) confirm no drift.
