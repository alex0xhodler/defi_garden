# 2026-07-12 — PageSpeed / Core Web Vitals audit → perf backlog (052–057)

Human shared a PageSpeed Insights report for defi.garden. The live PSI API was rate-limited (429, no key), so findings are derived from the actual repo assets + head loading pattern (more precise than the score anyway). Grounds backlog items 052–057.

## Already good (do NOT re-file)
- `font-display: swap` on @font-face (style.css:786); FKGroteskNeue.woff2 preloaded.
- style.css loaded non-blocking (`media="print" onload="this.media='all'"`).
- Planner path (default `/`) does NOT load Babel/app.js — only `__APP_MODE==='analytics'` injects them. Route-split already exists.

## Findings (impact order)
1. **In-browser Babel transpile (dominant issue).** Analytics/SEO pages inject `app.js` (119K) + `PoolDetail.js` (52K) as `text/babel` and load `@babel/standalone/babel.min.js` (~2.9MB, unpkg) to transpile them ON the main thread at runtime (home.html ~300-310). Massive TBT/LCP/TTI hit on mobile — and it lands on exactly the `?token=`/`?pool=` SEO pages we've been optimizing. → **052**.
2. **Zero minification.** Raw source shipped: app.js 119K, planner.js 196K, style.css 123K, translations.js 67K, PoolDetail.js 52K (~557K raw). No build step minifies them. → **053**.
3. **No `preconnect`.** Only `dns-prefetch` for unpkg/yields.llama.fi (home.html); the React/Babel critical fetches want a full `preconnect`. 0 preconnect tags. → **054**.
4. **No static-asset cache headers.** vercel.json sets `Cache-Control` only for `/` and `/home` (`max-age=0`); JS/CSS/fonts get no long-cache. → **055**.
5. **React/Babel from third-party unpkg** (no control/cache); **og-image.png 280K** + per-page OG PNGs (051). → **056**, **057**.

## Framing vs "no build step"
The repo already runs node generators in CI that COMMIT artifacts (sitemaps, /tokens, /chains, OG images). Precompiling/minifying app assets in the same `sitemap-update.yml` CI and committing `*.min.js` is the SAME pattern — source stays unbuilt, CI ships compiled copies. Not a local build step. (home.html changes are still HIGH — sacred router.)

## Proposed items
- **052** (9.0, HIGH) — Precompile app.js/PoolDetail.js in CI → plain JS; home.html loads the compiled files, drop `@babel/standalone`. Biggest mobile win.
- **053** (8.0, MED) — Minify app/planner/style/translations/PoolDetail in CI (committed `.min`), reference the minified files. No source change.
- **054** (7.0, LOW) — `preconnect` to unpkg + yields.llama.fi (keep dns-prefetch fallback).
- **055** (6.5, MED) — Long-cache headers for static JS/CSS/fonts in vercel.json (content-hash/versioning aware so updates still propagate).
- **056** (6.0, MED) — Self-host React (react/react-dom) to drop the unpkg 3rd-party critical dependency.
- **057** (5.5, LOW) — Optimize og-image.png (280K) + generated OG PNGs (051): compress/resize, modern format.

## Note
052/053/056 interact (all touch what home.html loads). Sequence 052 → 053 → 056; each is independently shippable. All are HIGH-adjacent on home.html — verify the __APP_MODE router + ANALYTICS_PARAMS stay byte-identical, and both router paths (planner `/`, analytics `?token=USDC`) still render (test_smoke.js).
