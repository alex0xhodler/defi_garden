# 082 build notes — harden planner against `translations is not defined`

## What changed

### `planner.js` (i18n block, formerly lines 794–810)
- Added `safeTranslations()` immediately before `makeT()`:
  ```js
  function safeTranslations() {
    if (typeof translations !== 'undefined' && translations) return translations;
    if (typeof window !== 'undefined' && window.translations) return window.translations;
    return null;
  }
  ```
  `typeof translations` never throws on an undeclared global — this is the guard that removes the uncaught `ReferenceError`.
- Rewrote `makeT(lang)` so the returned `t()` calls `safeTranslations()` **on every invocation** (lazy re-check) rather than dereferencing `translations` once at memo time. When the accessor returns the real object, resolution is identical to before (per-lang `.planner` dict, `en.planner` fallback, function-valued entries applied with `...args`, key-echo for unknown keys). When it returns `null`, `t()` returns the key string — the same graceful degradation the old `t()` already used for unknown keys.
- Rewrote `rootT(lang, key)` the same way: lazy `safeTranslations()`; when `null`, return the `key` string (its sole caller, `planner.js:~4341`, renders the result as text inside `<p>` for `loadingError`, so a string is safe). When translations is present, behavior is byte-identical, including returning `undefined` for a key missing in both the lang dict and `en`.

### `planner.min.js`
- Regenerated via `node minify-assets.js`. The `typeof translations` guard survives minification (terser cannot mangle a free global reference). Only `planner.min.js` changed content; the other six `.min.*` outputs re-minified to byte-identical no-ops (git shows no diff for them).

### `test_translations_fallback.js` (new, repo root, plain node, no new deps)
- Slices the `safeTranslations`/`makeT`/`rootT` block out of `planner.js` source and evals it in a `node:vm` context (these functions are not on the module `api`, and exporting them would be an out-of-scope surface change). 8 assertions:
  - undefined global → `makeT`/`rootT` do not throw and key-echo;
  - lazy recovery: the same `t()` picks up `translations` set on the context after the fact;
  - `window.translations` fallback branch;
  - normal path with a stub: dict/ko/en-fallback/function-valued/key-echo for `makeT`, and lang/en-fallback/`undefined`-for-missing for `rootT` (identical to pre-082);
  - `planner.min.js` contains `typeof translations`;
  - `planner.min.js` equals a fresh `transformJs('planner.js', src)` (re-minify idempotent), reusing `minify-assets.js`'s exported transform.
- No hardcoded absolute/scratchpad paths — `__dirname` + repo-relative only (the item-083 verifier-FAIL class is avoided).

### `package.json`
- Appended `&& node test_translations_fallback.js` to the `test` chain.

### `product-loop-kit/BACKLOG.md`
- Item 082 row status flipped READY → IN_PROGRESS (loop bookkeeping; a product-loop-kit file, expected to change).

## Deviations from the spec's literal text
- **Key-echo instead of "inline en fallback" English strings.** The spec's Change bullet suggested `window.translations || <inline en fallback>`. A literal inline English planner dictionary was deliberately **not** added: it would duplicate `translations.js`, violating the CLAUDE.md single-source rule ("Every user-facing string goes through `translations.js`"), and — critically — it is impossible to render "the English planner strings" when the `translations` payload never loaded, because those strings live *in* that payload. The honest minimal fallback is therefore key-echo (the same degradation `t()` already applies to unknown keys), paired with **lazy recovery**: because `t()` re-checks `safeTranslations()` on each call, a `translations.min.js` that loads late (the most likely real-world trigger — a deferred-script race, not a permanent 404) yields correct strings on the next render pass with no remount. The planner mounts either way; it never throws. No new user-facing string was introduced, so no EN/KO translations change was needed.
- No other deviations. Load order, `defer` attributes, `translations.js`, `app.js` untouched.

## Test results (this run, sandbox)
- `node test_translations_fallback.js` → 8/8 pass (~0.1s)
- `node test_planner.js` → 208/208 pass (0s)
- `node test_protocol_parsing.js` → pass (0s)
- `node test_qualifier_fix.js` → pass (0s)
- `node test_compiled_assets.js` → 4/4 pass (1s)
- `node test_minified_assets.js` → 9/9 pass (~1.5s)
- `node test_css_minified_render.js` → 2/2 pass (2s)
- `node test_smoke.js` → 8/8 pass (95s, Playwright)
- `node test_growth_capital_projection.js` → 2/2 pass (28s, Playwright real-browser planner render — confirms the planner still mounts and renders after the i18n rewrite)
- Full `npm test` was **not** run to completion: `test_smoke.js` alone takes ~95s and the chain has ~30 further tests (several Playwright-based), so the full run exceeds the 5-minute per-command timebox. Ran through `test_smoke.js` (chain position 7) plus the planner-render regression; all green. Remaining chain items (sitemap/stories/og/i18n-pages/etc.) are unrelated to this change's surface.
- No pre-existing failures encountered in the tests that ran.

## Noticed but NOT touched (out of scope)
- The spec's own follow-up: if the true trigger is `translations.min.js` returning 404/empty on some deploy (a build-artifact staleness problem like 061/068), that is a separate deploy-integrity issue. The defensive guard is correct regardless, but it treats the symptom; a permanent load failure would still show key-echo text (degraded but not broken). Left as the spec's noted follow-up.
- `node_modules` was absent; ran `npm install` to obtain `terser`/`clean-css`/`playwright` for minify + tests. Not committed (git-ignored, not in working-tree status).
