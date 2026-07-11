# 025 build notes

- CTA text: added `gardenThisPoolCtaConcrete(amount, years)` (EN + KO), reusing 019's `projectionAmount` so the button and the projection block always agree. EN "Garden this pool → ~$X in 5y"; KO "이 풀 가든하기 → 5년 후 약 <amount>".
- Trust rail honored: `showConcreteCta = !isAnomalous`. Anomalous pools keep the generic CTA — the projected number (which for a >1000% pool would be absurd) never reaches the button. Verified the anomaly branch by code trace.
- Deep link: appended `&years=${PROJECTION_YEARS}` (=5). The planner's `decodePlanFromUrl` reads `years`; no planner.js change. The link never carries the pool APY — planner computes from its own blended sanity-capped rate.
- Instrumentation: `garden_cta` now sends `ctaVariant` ('concrete'|'generic') + `projectionYears`, so the concrete-vs-generic lift is measurable against `plan_created`.
- Deviations: none. Followed 019's existing variables and formatters exactly.
- Verification: `node --check` clean on both files; executed the translation functions for EN + KO (both render correctly, en-US and Korean formatting); offline test chain (test_planner 190, test_protocol_parsing, test_qualifier_fix, test_canonical 24, test_token_pages 20) exits 0. Playwright on the real `/?pool=` route not runnable here (yields.llama.fi 403-blocked) — same limitation as 019; verified by code trace + translation execution.
