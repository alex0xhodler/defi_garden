# 053 notes

## What shipped
- `minify-assets.js` (new, pattern mirrors `compile-app.js`): pure `transformJs`/`transformCss` functions + a CLI runner. Minifies, via `terser`: `app.compiled.js`, `PoolDetail.compiled.js` (052's compile output — minifying the compiled output, not re-minifying raw JSX-free source twice), `planner.js`, `translations.js`. Minifies `style.css` via `clean-css`.
- New deps (production, same tier as `@babel/core`): `terser@^5.49.0`, `clean-css@^5.3.3`.
- `npm run minify` script added; `npm test` now runs `test_minified_assets.js` (freshness gate, same pattern as `test_compiled_assets.js`) right after `test_compiled_assets.js`.
- `home.html` / `plan.html`: swapped `style.css`→`style.min.css`, `translations.js`→`translations.min.js`, `planner.js`→`planner.min.js`, `app.compiled.js`/`PoolDetail.compiled.js`→`app.compiled.min.js`/`PoolDetail.compiled.min.js`. Source files stay the edit surface (comments added at each swap site).
- `.github/workflows/sitemap-update.yml`: added a "Minify JS/CSS" step right after the existing compile step, added the new source files to the `paths:` trigger list, and added the five `.min.` outputs to the commit step's `git add`.
- Updated `test_compiled_assets.js`'s two home.html assertions (they string-matched `addScript('PoolDetail.compiled.js'` / `app.compiled.js')` literally) to match `.compiled.min.js` now that home.html loads the minified compiled output instead of the unminified one directly.

## Deviations from spec
- Scope: minified exactly the 5 files named in the spec's Evidence/Change sections (app/PoolDetail via their .compiled outputs, planner.js, style.css, translations.js). Did NOT touch `planner-styles.css` (83K) or `pool-detail-styles.css` (23K) — sizable but outside what 053's evidence named; a natural follow-up, not silently rolled into this diff.
- Filename for the app/PoolDetail chain came out as `app.compiled.min.js` / `PoolDetail.compiled.min.js` (regex-derived from `.compiled.js` → `.compiled.min.js`), not `app.min.js`. Kept consistent with "minify whatever 052 already produces" rather than inventing a new naming scheme.

## Verification
- `node test_compiled_assets.js` and `node test_minified_assets.js`: all green (freshness + home.html/plan.html reference checks).
- `node --check` on all 4 minified JS outputs: valid syntax.
- Local static-file serve: all 5 new `.min.` files return 200 and are correctly referenced from the served `home.html`.
- `test_smoke.js` (Playwright, real Chromium against both router paths) **cannot complete in this sandbox**: `unpkg.com` (React/React-DOM UMD, loaded via static `<script>` regardless of minification) and `yields.llama.fi` (pool data) are both network-blocked here (confirmed via `curl`, exit 56/timeout). Reproduced the identical timeout-and-fail behavior by stashing this diff and running `test_smoke.js` against unmodified `main` — same failure mode, so this is the same pre-existing sandbox limitation already documented against backlog 040/044/045/051/052, not a regression from 053. Needs a human/CI run with real network to visually confirm both paths render pixel-identical to before.
- Did not run the full `npm test` chain to completion (it halts at `test_smoke.js` for the reason above, blocking everything after it in the `&&` chain); the two backlog-053-specific tests were run directly and pass.
