# 056 implementation notes

## What changed
- Vendored `react.production.min.js` and `react-dom.production.min.js` at the repo root — byte-identical copies of `node_modules/react/umd/react.production.min.js` and `node_modules/react-dom/umd/react-dom.production.min.js` (React 18.3.1, matching `package.json`'s pinned devDependency version). Verified with `diff` (no output = identical).
- `home.html`: swapped the two `<script defer crossorigin src="https://unpkg.com/...">` tags for `<script defer src="./react.production.min.js">` / `./react-dom.production.min.js`. Dropped `crossorigin` (same-origin file, no CORS mode needed). Removed the now-dead `unpkg.com` `preconnect`/`dns-prefetch` hints (nothing else fetches from unpkg post-052). Left `yields.llama.fi` hints untouched.
- `plan.html`: identical script-tag swap, plus removed the unpkg `preload`/`preconnect`/`dns-prefetch` triplet. Kept the `yields.llama.fi` preconnect/dns-prefetch.
- No changes to `__APP_MODE` router logic, `ANALYTICS_PARAMS`, compile/minify pipeline, or CI workflow — confirmed via diff review.

## Deviations from spec
None. Implemented exactly as specced.

## vercel.json — deliberately untouched
Spec's acceptance criteria don't mention vercel.json, and no change is needed: the existing generic cache rule `"source": "/(.*)\\.(js|css)"` already matches `react.production.min.js`/`react-dom.production.min.js` by extension, so they automatically inherit the 5min+SWR cache header 055 shipped for all static JS/CSS. Confirmed by reading vercel.json directly.

## Test evidence
- `diff` confirms both vendored files are byte-identical to their `node_modules` source.
- `grep -n unpkg home.html plan.html` → zero matches (criterion 1, 3).
- `git diff home.html plan.html` reviewed line-by-line — router/`ANALYTICS_PARAMS` blocks untouched (criterion 4); diff is exactly the script-tag/resource-hint swap described above (criterion 7).
- `node test_smoke.js`: the "bare / renders planner UI" checks now find the planner selector successfully (page.waitForSelector succeeded) with only pre-existing `net::ERR_CONNECTION_RESET` console errors (font/analytics fetches blocked in-sandbox, same pattern documented across 040/044/045/051-055). The `/?token=USDC renders pool cards` checks still time out — this is the pre-existing `yields.llama.fi` sandbox network block (pools fetch), NOT a regression from this change.
  - **Baseline comparison (critical evidence):** stashed this diff and re-ran `test_smoke.js` against `main` (unpkg-based React). Result: repeated `SSL error code 1` handshake failures against unpkg.com, escalating to `CreatePlatformSocket() failed` and the browser process crashing outright (`Target page, context or browser has been closed`) partway through the run. This change measurably *improves* in-sandbox test reliability — self-hosting React eliminates a whole class of unpkg-dependent failures; only the already-documented `yields.llama.fi` limitation remains.
- `npm test`'s `&&`-chain still stops at `test_smoke.js` (same as it would on `main`, pre-existing) so the later tests in the chain don't run via that command. Ran the remaining 10 test files individually instead: `test_canonical.js`, `test_token_pages.js`, `test_chain_pages.js`, `test_hub_pages.js`, `test_indexnow.js`, `test_stories.js`, `test_i18n_pages.js`, `test_og_images.js`, `test_cache_headers.js` all exit 0. `test_analytics_fires.js` exits 1 — confirmed via the same stash/baseline comparison that this fails identically on `main` (unrelated `page.goto` timeout on a static `/tokens/<slug>` page with no React/unpkg dependency at all — a different pre-existing sandbox network issue, not caused by this diff).
- No test file references `react.production.min.js`/`react-dom.production.min.js` by path, so none needed updating.

## Human visual spot-check flag
Per NORTH_STAR.md's render-path note, this touches the actual JS runtime source loaded on every page (home.html + plan.html). Flagging `needs human visual spot-check` on next live deploy, consistent with precedent (040/044/045/051-055).
