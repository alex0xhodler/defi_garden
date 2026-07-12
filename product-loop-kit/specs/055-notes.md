# Notes: 055 — long-cache Cache-Control for static JS/CSS/fonts

No spec file existed for this item (backlog row said "heartbeat writes the spec"); wrote `specs/055.md` from `reports/2026-07-12-pagespeed.md` finding 4 + a direct read of `vercel.json`, per the build-loop instructions for a spec-less top READY item.

## Deviation from the naive "add long-cache headers" ask
The backlog title itself flags the risk: "content-hash/versioning aware so updates still propagate." This repo has no content-hashed filenames — `app.compiled.min.js`, `style.min.css`, etc. are static names referenced directly in `home.html`/`plan.html`, and the build loop merges to `main` (auto-deploying via Vercel's git integration) multiple times a day. Applying the textbook `Cache-Control: public, max-age=31536000, immutable` to JS/CSS would have served stale (possibly broken) JS to repeat visitors for up to a year after any deploy — an availability regression disguised as a perf win.

Chose instead:
- **Fonts** (`/fonts/(.*)`): `public, max-age=31536000, immutable`. Safe — one font file, never content-modified in this repo's history, and a font swap is not a correctness risk the way broken app logic would be.
- **JS/CSS** (`/(.*)\.(js|css)`): `public, max-age=300, stale-while-revalidate=86400`. 5 minutes of hard freshness (kills the every-page-nav refetch within a session) plus a 1-day stale-while-revalidate window — a returning visitor gets an instant cached response while the browser silently refetches in the background, so a deploy propagates on that visitor's next request after the background refetch completes, not "up to a year later."

This is more conservative than the original backlog framing implied but is the change that actually satisfies "updates still propagate" — a true content-hashed-filename fix (which would allow safely going `immutable` on JS/CSS too) is a separate, larger build-pipeline change (would touch `compile-app.js`, `minify-assets.js`, and every `<script src>` in `home.html`+`plan.html`) and was scoped OUT per the spec.

## Scope
`vercel.json` (2 new header rules) + `package.json` (wire the new test into the `test` script) + `test_cache_headers.js` (new offline test) + `product-loop-kit/specs/055.md`. No change to `home.html`, `plan.html`, any `<script>`/`<link>` tag, or the `rewrites` array. No new dependencies.

## Verification performed
- `node test_cache_headers.js` — 7/7 assertions pass.
- `node test_planner.js`, `node test_protocol_parsing.js`, `node test_qualifier_fix.js` — all pass (unaffected by a config-only diff; ran them as the fastest signal that nothing else broke).
- Full `npm test` (17 suites incl. Playwright `test_smoke.js`) was not run in-sandbox — `yields.llama.fi`/`unpkg.com` are network-blocked here, the same precedent noted on items 040/044/045/051/052/053/054. This diff touches no render path, no JS/CSS content, and no HTML — only response headers for existing static files — so the render-path tests are not expected to be affected, but the verifier should treat any header-serving behavior as "needs human/live spot-check on next deploy" like the other perf items in this batch.
