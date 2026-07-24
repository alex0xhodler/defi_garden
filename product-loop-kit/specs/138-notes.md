# 138 — build notes

## What was built
- Added 35 top-50-TVL protocol entries (+ short-slug aliases → 50 keys) to `PROTOCOL_URLS` in `app.js`, including `sky-lending`/`sky`.
- Regenerated `app.compiled.js` + `app.compiled.min.js` (`npm run compile && npm run minify`) — production serves `app.compiled.min.js`, so the source edit alone would not take effect. Verified `sky-lending":"https://app.sky.money"` present in the minified output.
- Added `test_protocol_cta_fallback.js` (rendered Playwright) and wired it into the `npm test` script after `test_northstar_cta_fires.js`.

## Deviations / conservative choices
- **URL provenance:** did NOT hand-guess URLs. Fetched `https://api.llama.fi/protocols` (in-sandbox network reaches it per NORTH_STAR.md 2026-07-12) — the exact source `dynamicProtocolUrls` builds from — and used its `url` per slug, so the static fallback matches what the dynamic path would produce. Stripped affiliate query params (`?ref=`/`?utm_source=`/`?referrer=`) so `getProtocolUrlWithRef` adds our own `ref=defi.garden` cleanly. Kept meaningful paths (e.g. `circle.com/usyc`).
- **Scope:** implemented only the primary fix (static-map entries). Deferred the "bake url into the 059 snapshot" durable option — out of this item's surgical scope, ties to the 134 study.
- **`spark-savings`** mapped to `https://spark.fi` (consistent with the existing `spark`/`sparklend` entries) rather than the API's `data.spark.fi/savings/` data page.
- **`invesco-ustb` → `superstate.com`**: kept verbatim from the live API (USTB is Superstate's tokenized T-bill — correct, not a mismatch).

## Test evidence
- `test_protocol_cta_fallback.js`: 3/3 assertions pass (positive render + click-fires, negative control).
- `test_northstar_cta_fires.js` 7/7, `test_repeat_cta.js` 5/5, `test_smoke.js` 5/5 (both router paths), `test_compiled_assets.js` 4/4, `test_css_minified_render.js` 2/2, `test_protocol_parsing.js` 9/9 — all pass.
- Pre-existing unrelated failure: `test_minified_assets.js` "plan.html still loads raw planner.js" — reproduced on the clean tree (changes stashed) BEFORE any 138 edit; not touched by this diff (no plan.html/planner change).

## Test env note
`@babel/core`, `@babel/plugin-transform-block-scoping`, `terser`, `clean-css` were not present in `node_modules` and had to be `npm install`ed to run compile/minify. They are already declared devDependencies-adjacent tooling (the compile/minify scripts predate this item); CI installs them. Not added to package.json by this item.
