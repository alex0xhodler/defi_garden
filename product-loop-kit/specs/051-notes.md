# 051 — implementation notes

## Approach
Generation runs inline inside `generate-token-pages.js`/`generate-chain-pages.js`'s
existing `main()`, right after `ranked` is computed and before any HTML is
written — not as a separate CI step. This is required (not optional) to
satisfy AC #3/#4: the fallback to the shared `og-image.png` has to be known
*before* that page's `<head>` is rendered, so the same run that decides
"this record's image failed" is the run that writes the page pointing at
the fallback. A separate later CI step couldn't feed that decision back into
already-written HTML without a second render pass.

New file `generate-og-images.js` owns the canvas render + file I/O
(`renderOgCard`, `generateOgImages`) and is required by both page
generators. `generate-token-pages.js` requires it *lazily* inside `main()`
(same reason `generate-chain-pages.js` is lazy-required there: the image
module requires `generate-token-pages.js` eagerly for `poolTotalApy`/
`formatApy`, so a top-level require in the other direction would be a load
cycle). `generate-chain-pages.js` requires it eagerly at the top — safe,
since the image module never requires chain-pages back.

## Deviations from spec

1. **Rendering approach**: `@napi-rs/canvas` (headless, prebuilt Linux
   binaries via `optionalDependencies`, no browser). Added as a real
   `dependencies` entry (not `devDependencies`) — CI's `npm install
   --only=production` needs it present. Verified the prebuilt
   `linux-x64-gnu` binary is what `ubuntu-latest` will pull, and that it
   actually renders (real PNG bytes, 1200×630, checked with `file(1)` and a
   manual visual review — see below).

2. **One image per token/chain slug, not per language.** The card's data
   (symbol/chain name, best gated APY, pool count) is identical between the
   `en` and `ko` page variants — same pattern the spec itself notes for pool
   data ("static pages are copy-only translated"). Both language variants'
   `og:image` point at the same `og/<kind>/<slug>.png`, roughly halving the
   image count vs. one per language pair.

3. **Dropped the 🌱 emoji from the brand mark.** First render showed the
   emoji as a tofu box (`□`) — `@napi-rs/canvas`'s bundled font has no
   color-emoji glyph, and nothing guarantees `ubuntu-latest` has a system
   emoji font `sans-serif` would fall back to either. Replaced with a plain
   vector dot (`ctx.arc`, primary-blue fill) + "DeFi Garden" text — same
   brand color, no glyph-availability risk. Visually reviewed the fix
   (`og-big-preview2.png` in this session's scratchpad) before shipping.

4. **Stale-image cleanup added** (not explicitly asked for, but same
   staleness class 031 already fixed for `.html` pages): a token/chain
   dropped by this run's gate, or a renamed slug, has its old PNG removed
   each run so `og/<kind>/` doesn't accumulate orphans forever.

5. **Repo-bloat open question (spec's own "builder evaluates")**: images
   are committed to the repo under `og/tokens/`/`og/chains/`, same pattern
   as the already-committed `tokens/`/`chains/`/sitemap directories — no
   separate build-artifact pipeline. Each fixture-set PNG is ~35-45KB; at
   live scale (hundreds of qualifying tokens + ~100 chains, no cap by
   default) this adds low tens-of-MB to the repo, which is consistent with
   the site's existing pattern of committing all generated SEO surface.
   Not changed here; flag as a future watch-item if repo/checkout size
   becomes a real CI cost — no evidence of that yet.

## What's NOT verified in this sandbox
`yields.llama.fi` is network-blocked here (pre-existing sandbox limitation,
documented on 014/021/041/050 etc.) — the live-scale run (real token/chain
counts, real image sizes at scale) hasn't executed. Verified instead via:
- the existing `pools-sample.json`/`pools-chain-sample.json` fixtures
  (same fixtures `test_token_pages.js`/`test_chain_pages.js` already use,
  including the ANOM anomaly-exclusion branch)
- a full end-to-end CLI run (`node generate-token-pages.js --fixture ...`)
  writing real PNGs + real HTML to a scratch dir, confirmed with `file(1)`
  and a rendered-image visual check
- `test_og_images.js` (new, 18 assertions) + the full existing
  `test_token_pages.js`/`test_chain_pages.js` suites (71 + 63 assertions),
  all green
Real `og/tokens/*.png` + `og/chains/*.png` land on the next
`sitemap-update.yml` CI run after merge, same as every prior SEO-surface
item in this backlog.
