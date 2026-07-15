# 094 build notes

Branch: `claude/inspiring-meitner-juwpwq` (harness-pinned; per standing decision 2026-07-13, everything — code + tests + bookkeeping — lands in ONE commit/PR on this branch).

## What shipped
Decorative protocol logo (+ small chain corner badge) on every pool row/card, in the single shared `renderPoolCard` path (`app.js`), so grid AND list both get it. New `PoolLogo` React component (plain `React.createElement`, two `useState` error flags). Lazy DefiLlama-CDN `<img>` → monogram fallback (first letter of `pool.project`, neuro chip) on error/missing. The existing `.pool-context-inline` text badge is preserved (augment, not replace).

## Icon source (resolved in spec)
- Protocol: `https://icons.llamao.fi/icons/protocols/<project.toLowerCase()>?w=48&h=48` (curl-verified 200 image/webp).
- Chain: `https://icons.llamao.fi/icons/chains/rsz_<chain.toLowerCase()>?w=48&h=48` (curl-verified 200).
- `icons.llama.fi` (no "o") 404s — must use `llamao`.

## Trust rails
Byte-identical. `PoolLogo` reads `pool.project`/`pool.chain` only; no sort/filter/number/anomaly/092-demotion touched. `git diff app.js | grep -E 'APY_SANITY_LIMIT|DEFAULT_MIN_TVL|isAnomalousApy|hasNoSupplyYield'` → empty.

## Deviations from the build brief (conservative choices, recorded for the improve loop)
1. **10 render tests beyond the new one were edited** — `test_smoke`, `test_search`, `test_default_sort`, `test_rate_volatility`, `test_kpi_track_record`, `test_zero_yield_demote`, `test_footer_hub_links`, `test_category_taxonomy`, `test_list_default`, `test_analytics_fires`. Each got `icons\.llamao\.fi` added to `IGNORABLE_ERROR_PATTERN` + a `page.route('https://icons.llamao.fi/**', route.abort())`. Necessary, not scope creep: introducing an external image host into the shared render path made these analytics-grid tests fail two ways in-sandbox — console-error assertions on `ERR_CONNECTION_RESET`, and `load`-event timeouts from the hanging (proxy-blocked) requests. The abort route mirrors each test's existing "route the blocked host" pattern; the ignore-token mirrors the existing mixpanel/fontshare entries. `test_snapshot_first`/`test_dead_pool` needed nothing (existing catch-all abort + pageerror-only collection). A token added to `test_spotlight_url.js` was reverted — it drives `plan.html`, which never uses `renderPoolCard`.
2. **`test_pool_logo.js` flips `style.min.css` `media=print`→`all` after navigation** — `home.html` loads the main stylesheet with `media="print"` and swaps to `all` on the link's `onload` (render-blocking-CSS perf trick). That `onload` doesn't fire in the headless fixture load, so without the flip the box-size/no-reflow assertions would measure unstyled elements. Documented inline in the test.

## Test results (timeboxed, sandbox)
- `node test_pool_logo.js` → **5/5** green (goodproto row = `img.pool-logo-img[loading=lazy]` 24×24; badproto row = monogram "B" 24×24, equal box → no reflow; grid+list+`?chain=` all carry `.pool-logo`; text badge preserved; no page errors).
- Full `npm test` chain halts at `test_analytics_fires` — **pre-existing** sandbox failure (generated `/tokens/big` page `load` timeout; stash-baseline proven identical with changes removed, `[baseline exit 124]`). Every touched test after the halt point + the new test were run individually and pass (smoke 8/8, list_default 3/3, default_sort 4/4, zero_yield_demote 4/4, rate_volatility 5/5, kpi_track_record 7/7, footer_hub_links 4/4, category_taxonomy 8/8+5/5, pool_logo 5/5). `test_search` flakes 19/20 under isolated 300s caps (search-parsing assertion, timeout-bound, stash-baseline identical — unrelated to icons).

## Artifacts regenerated
`app.compiled.js`, `app.compiled.min.js`, `style.min.css`, `translations.min.js` via `node compile-app.js` + `node minify-assets.js` (tools installed in-sandbox via `npm i --no-save @babel/core @babel/plugin-transform-block-scoping terser playwright`; PoolDetail/planner minified outputs byte-identical to HEAD — no churn).

## Screenshots (monogram fallback — real icons CDN-blocked in-sandbox; monogram IS the contract)
`scratchpad/pool_logo_{360,768,1280,1280_dark}.png` — neuro monogram chip above the symbol, text badge intact, no layout break, clean light+dark at all widths.
