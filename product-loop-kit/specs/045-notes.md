# 045 — build notes

## Deviations from the spec's literal wording (conservative choices, why)

1. **Canonical is `/tokens` and `/chains` (no trailing slash), not `/tokens/`/`/chains/`.**
   The spec's prose used a trailing slash as shorthand for "the hub page." `vercel.json`
   has `"trailingSlash": false`, and every other generated URL in this repo (spoke
   pages, sitemaps, canonical.js) is trailing-slash-free. Canonicalizing to `/tokens/`
   would mean the canonical URL 308-redirects to the URL actually served — a
   canonical/served-URL mismatch is worse than matching the site's own convention.
   Filenames are still `tokens/index.html`/`chains/index.html` (Vercel's `cleanUrls`
   serves a directory's `index.html` at the clean path).

2. **Tokens hub is two-tier (top-60 direct + A–Z sub-hubs under `/tokens/az/<letter>`);
   chains hub is one-tier (all ~86 linked directly).** 2,022 tokens is far past the
   ~30–100 links-per-template guidance the spec cites; 86 chains isn't. Every token is
   reachable in exactly one more hop than a top-60 token (home → hub → letter → token
   = 3 clicks, still inside the ≤3-click budget). `tokens/az/<letter>.html` lives in a
   subdirectory, so it cannot collide with a token literally slugging to `az`.

3. **Real `tokens/`/`chains/` directories are not regenerated in this session.**
   `yields.llama.fi` is network-blocked in this sandbox (confirmed via curl: `CONNECT
   tunnel failed, 403` — matches the precedent noted in specs 039/040/044). The
   generator code + a fixture run (`/tmp` scratch dir, not committed) are verified;
   the actual `tokens/index.html`, `tokens/az/*.html`, and `chains/index.html` land in
   the repo on the next `sitemap-update.yml` CI run after merge (its `on.push.paths`
   already includes `generate-token-pages.js`/`generate-chain-pages.js`), same
   mechanism 013/021/041 relied on.

4. **`test_smoke.js` fails in this sandbox before AND after this diff** — confirmed by
   `git stash` and re-running: both `bare /` and `/?token=USDC` time out waiting for
   selectors because React/analytics/DefiLlama all load over the network, which is
   blocked here. Not a regression introduced by this change. Every other test in the
   `npm test` chain (`test_planner`, `test_protocol_parsing`, `test_qualifier_fix`,
   `test_canonical`, `test_search`, `test_token_pages`, `test_chain_pages`,
   `test_hub_pages`, `test_indexnow`, `test_stories`) passes green.

5. **New `.seo-hub-links` footer class instead of reusing `.app-footer`.**
   `.app-footer` is `position: fixed` and is already the analytics app's own
   bottom-of-screen footer (`app.js`) — reusing it for a second, always-present static
   element would fight it for the same fixed slot. `.seo-hub-links` is a small new
   block built entirely from existing design tokens (`--color-*`, `--space-*`,
   `--neuro-radius-sm`, `--focus-ring`) — no new colors/gradients, consistent with the
   "reuse before inventing" standing decision.

6. **Hub pages get their own `hub-`-prefixed scoped `<style>` block** (`renderHubStyleBlock`
   in `generate-token-pages.js`, shared by both generators) rather than reusing the
   `tp-`/`cp-` prefixed blocks verbatim. This mirrors the codebase's existing pattern
   (chain pages already duplicate token pages' CSS structure under a `cp-` prefix) —
   hub pages are their own template, same tokens, new prefix.

## Not done (explicitly out of scope per spec)
- Category/pillar pages ("Best Stablecoin Yields" etc.) — spec calls this phase 2.
- `ItemList`/`CollectionPage` JSON-LD on the hubs — spec defers this to 046, "don't block on it."
