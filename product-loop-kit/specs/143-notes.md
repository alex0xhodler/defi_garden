# 143 — build notes (deviations, conservative choices)

## Outcome
Root-cause fix shipped: the "Garden this pool" CTA now marks its planner deep-link with `&src=pool`; the planner reads that marker to (a) render honest arrival copy instead of the share-recipient framing and (b) suppress the false `share_link_opened` event. Genuine-share arrival (item 007) unchanged.

## Deviations from spec (all conservative, all justified)
1. **Recompiled/reminified assets** (`PoolDetail.compiled.js`, `PoolDetail.compiled.min.js`, `planner.min.js`, `translations.min.js`) were regenerated via the repo's own `node compile-app.js` + `node minify-assets.js`. The spec's change list named only the raw sources, but `home.html` serves the COMPILED/MINIFIED output, and `test_compiled_assets.js`/`test_minified_assets.js` enforce byte-identity between source and artifact. Without regenerating, the `&src=pool` change would not reach the rendered pool page (the first Playwright run proved this — it landed on the planner WITHOUT `src=pool` until the compiled artifact was refreshed). No hand-editing of generated files — generators only. `app.compiled.*` untouched (app.js not modified).
2. **`u.searchParams.delete('src')` placed in `encodePlanToUrl`** (not a separate helper): confirmed that function builds `u` from `window.location.href`, so the delete is load-bearing — a user who arrived via `?src=pool` and then shares their plan must emit a CLEAN share URL, else the recipient would wrongly get the pool-sourced copy. Mirrors the existing `delete('preset')/delete('fresh')`.

## Conservative choices
- `poolSourced = !!sharedPlan && urlParams.get('src') === 'pool'` — gated on `sharedPlan` being truthy first, so it can never change behavior on non-deep-link loads. Genuine share links (buildShareUrl) never set `src`, so they are cleanly unaffected.
- Copy: honest, no over-claim. The deep-link doesn't carry the pool's name/APY, so the copy says "the pool you picked" (true — the user clicked Garden-this-pool on a specific pool) without naming it. No "someone/sent/shared" (EN) or "누군가/보냈/공유" (KO).
- The prefilled plan, the "Make it mine" affordance, bloom fast-forward, and `decodePlanFromUrl`'s null-return contract are all UNCHANGED — only attribution copy + the one analytics gate changed.

## Metric-capture in the acceptance test
`Analytics` is a top-level lexical `const` in analytics.js (not `window.Analytics`), and `track()` early-returns on localhost before any network call. So neither a `window` trap nor a network-payload capture can observe `share_link_opened` in-sandbox. The test wraps `Analytics.trackShareLinkOpened` in the same script scope (injected via a response-append on analytics.js) and records each real invocation to `window.__shareOpens` — observing the exact method the planner calls. Scenarios run in isolated browser contexts so a saved `garden-plan` can't leak between them.

## Test results (independently re-run by orchestrator)
- `test_garden_cta_arrival.js`: PASS (all 8 assertions), stable across 2 runs.
- `test_northstar_cta_fires.js`: 7/7 (garden_cta still fires `pool_click{source=garden_cta}` with the new href).
- `test_repeat_cta.js`: 5/5 · `test_translations_fallback.js`: 8/8 (min artifacts idempotent) · `test_report_share.js`: 8/8 · `test_share_mix_roundtrip.js`: 5/5 (delete('src') didn't break encode/decode) · `test_compiled_assets.js`: 4/4.

## Pre-existing failures (NOT caused by 143 — reproduced at HEAD)
- `test_minified_assets.js` **exits 1** on two assertions ("home.html does not load translations.min.js", "plan.html still loads raw planner.js") and therefore **halts the `npm test` `&&` chain at position 4** — so `test_garden_cta_arrival.js` (appended at the end) does NOT execute inside a full `npm test` run (nor does any test after position 4). `home.html`/`plan.html` are not in this diff; the verifier reproduced the identical exit=1 at HEAD via `git stash`. Correction of an earlier inaccurate note: this test does NOT exit 0 — it exits 1 and halts the chain. This is tolerated because **no CI workflow runs `npm test`** (only `sitemap-update.yml` exists), the loop verifies affected tests individually, and it is a standing repo inconsistency (CLAUDE.md itself notes plan.html loads raw `planner.js` — which means this diff's raw `planner.js` change IS served on plan.html directly; the regenerated `planner.min.js`/`translations.min.js` are belt-and-suspenders, while `PoolDetail.compiled(.min).js` IS what home.html serves and was mandatory — the acceptance test confirms `src=pool` reaches the rendered home.html pool page).
- `test_smoke.js` / `test_search.js`: documented pre-existing sandbox-network timeouts (browser-originated HTTPS blocked at proxy — NORTH_STAR 2026-07-12). Every test exercising the changed lines was verified individually (garden_cta_arrival 8/8, northstar_cta_fires 7/7, repeat_cta 5/5, report_share 8/8, share_mix_roundtrip 5/5, translations_fallback 8/8, compiled_assets 4/4).
