# 019 — implementation notes

## Deviations from spec (conservative choices, logged for the improve loop)

1. **"futureValue helper" is duplicated, not imported.** app.js and PoolDetail.js
   (analytics-app surface) have zero code sharing with planner.js — this is an
   existing, documented constraint (see app.js's own comment above
   `STABLE_SYMBOLS`: "this repo has no build step or module system linking
   app.js and planner.js, so each browser script is self-contained"). The same
   pattern already covers `APY_SANITY_LIMIT`/`formatUsd`/`formatApy` (each
   independently redefined in PoolDetail.js as `APY_SANITY_LIMIT_LOCAL` /
   fallback formatters). `futureValue` here follows that exact precedent:
   defined once in app.js, passed down as a prop, with a matching fallback
   inside PoolDetail.js for the no-prop (SSR/test) case — same shape as the
   existing `_formatUsd`/`_formatNum`/`_formatApy` fallbacks already in the file.

2. **"Deep-link prefilled with this pool" does not pin the literal pool.**
   The planner has no concept of an individual pool — by design (trust rails:
   it always curates/blends across multiple pools passing `DEFAULT_MIN_TVL` +
   `APY_SANITY_LIMIT`, never quotes a single named pool's rate as a plan's
   APY). Spec's own OUT-of-scope list forbids touching "planner internals," so
   adding single-pool-pinning to the planner was not an option. Instead the
   CTA reuses the planner's existing, stable, already-public URL contract (the
   same `goal`/`pace`/`monthly` params the share-plan feature already uses,
   see `decodePlanFromUrl` in planner.js) to prefill: `goal=retirement`
   (the most generic growth goal), `pace=<persona>` mapped from this pool's
   risk tier (stable/rwa/degen — using the exact same 25/50 risk-score bands
   `getRiskAssessment()` already computes), and `monthly=200` (the same
   illustrative amount shown in the mini-projection immediately above the
   CTA, so the number the user just saw carries through). Zero planner.js
   edits.

3. **Persona→degen-haircut condition.** Spec says "degen haircut where
   applicable" without defining "applicable" for a single pool (the haircut
   is persona-scoped in planner.js, not pool-scoped). Applied it when this
   pool's risk tier maps to the `degen` persona band (score > 50, includes
   the anomalous-APY forced-High case) — i.e. the same condition that sends
   the "Garden this pool" CTA into the degen persona. Reuses the existing
   `degenHaircutNote` translation key verbatim (already used by planner.js
   for the identical disclosure).

4. **Trust-data fields (30d mean APY / exposure / IL risk) render only when
   present on the pool object** (`typeof pool.apyMean30d === 'number'`,
   `pool.exposure`, `pool.ilRisk` truthy) — these are DefiLlama pool-API
   fields not present on every pool. No new fetch; same `pool` object already
   passed into the component today.

5. **`plannerCta` translation key removed** (both en/ko) rather than left
   dead — it was referenced from exactly one call site (PoolDetail.js's old
   CTA), now replaced by `gardenThisPoolCta`. Verified via repo-wide grep that
   no other file referenced it.

## Not touched (per spec's OUT-of-scope)
- Router semantics / `?pool=` URL behavior
- Trust-rail values (`APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`)
- planner.js internals (no edits to that file at all)

## Test run
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` — 190/190 assertions, exit 0 (unaffected by this diff, which is app.js/PoolDetail.js/translations.js only).
- `npm test`'s Playwright suite (test_smoke.js/test_canonical.js/test_search.js) hung past the 5-minute foreground timebox in this sandbox (real-network `page.goto` against `yields.llama.fi` with no mock, same class of sandbox network-policy friction noted in the 018 log entry) — killed per standing decision (never wait unbounded) rather than blocking on it.
- In its place, wrote `specs/019-verify-manual.js` (mocked network via `page.route`, vendors local React/Babel/Babel-standalone like test_search.js does when unpkg.com is blocked) and drove the real `/?pool=` route for 3 fixture pools — low-risk (stable), medium-risk (rwa), and an anomalous >1000% APY pool. All 3 pass: exactly one CTA, href carries `goal=`/`pace=`/`monthly=`, projection text renders, anomalous pool shows `.calc-warning`, zero page errors. Deleted after use — not committed (ad hoc, not part of the permanent suite).
- **Bug found + fixed during this check**: the first pass, `degenHaircutNote` (reused from planner.js's translation key) rendered as the literal string `"degenHaircutNote"` instead of the disclosure text. Root cause: that key lives nested under `translations.en.planner.*`, but PoolDetail.js's `t()` (app.js's `createTranslationFunction`) does a flat `translations[language][key]` lookup with no `planner.` nesting — the two translation namespaces aren't interchangeable. Fixed by adding a new flat key `poolDegenHaircutNote` (en+ko) instead of reusing the nested one.
- **Pre-existing rendering anomaly found, NOT fixed (out of scope)**: in this sandbox's headless-Chromium screenshot, the hero's right-column action card (APY value + primary CTA button + secondary protocol link) renders visually blank/invisible even on unmodified `origin/main` — confirmed by temporarily reverting PoolDetail.js/app.js to the committed version and reproducing the identical blank region before reapplying this diff. The DOM content itself is correct in both cases (Playwright locator/text/attribute assertions all pass); only the pixel paint in this specific harness is affected, isolated to that one sub-tree. Everything this spec added (mini-projection card, trust-data grid cells) lives in separate sibling containers and renders fully visibly in the same screenshots. Flagging for the human/next loop to check on a real device — not touched here per spec's "smallest change" scope.
