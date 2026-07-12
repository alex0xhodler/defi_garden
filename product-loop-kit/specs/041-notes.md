# 041 — build notes

## What shipped
`generate-chain-pages.js` — direct extension of 014/021's `/tokens/<slug>` pattern to chains. Unlike 014/021's original two-PR split (phase 1 = generator + offline sample, phase 2 = CI/sitemap wiring), this ships BOTH in one PR: 021 already proved the full CI pattern end-to-end for tokens, so there was no exploratory risk left to de-risk by splitting. The wiring (sitemap index guard, CI step, package.json) is a mechanical mirror of what 021 already shipped and merged successfully.

## Reuse (per CLAUDE.md/NORTH_STAR "reuse before inventing")
`generate-chain-pages.js` requires `generate-token-pages.js` and reuses its exported `isQualifyingPool`, `poolTotalApy`, `formatUsd`, `formatApy`, `escapeHtml`, `renderAnalyticsBootstrap`, `tokenSlug` (aliased `chainSlug` — it's a generic string slugifier despite the name), and every eligibility constant (`MIN_POOL_TVL`, `APY_SANITY_LIMIT`, `MIN_QUALIFYING_POOLS`, `DEFAULT_LIMIT`, `SITE_URL`). The only new export added to `generate-token-pages.js` is `escapeHtml` (it existed but wasn't exported before — additive, no behavior change, verified `test_token_pages.js` still passes 44/44 unchanged).

Trust-rail benefit of this reuse: the anomaly/floor gate (`isQualifyingPool`) has ONE implementation shared by both generators, not two copies that could drift.

## Deviations from spec
- **Content columns**: chain pages show a Token column (each row spans multiple tokens) where token pages don't need one (already token-specific) — spec anticipated this ("adds a Token column vs. the token page's Protocol/Chain/APY/TVL").
- **No `MIN_POOL_TVL`/`APY_SANITY_LIMIT` redefinition**: spec described "same $100K floor" as a property; in the actual implementation these are imported constants, not redefined values, which is a stronger reuse guarantee than restating the same numbers in two files (a future floor change only needs to happen once, in `generate-token-pages.js`).
- **`POOLS_PER_PAGE` not reused/exported from `generate-token-pages.js`**: this constant stayed a local, independently-tunable value (`= 8`, same number) in each file, since it's a display concern, not a trust-rail — no shared source of truth needed and it lets a future PR change one page type's density without touching the other.

## Trust rails verified untouched
- `isQualifyingPool`/`APY_SANITY_LIMIT`/`MIN_POOL_TVL` — imported, not modified.
- `?chain=` app logic (app.js) — not touched.
- `sitemap-chain-*.xml` (the pre-existing 111 per-chain token-combo files) — not touched, different file (singular new file is `sitemap-chain-pages.xml`, plural/distinct name chosen specifically to avoid collision).
- `vercel.json` — not touched; static files under `chains/` serve the same way `tokens/` already does.

## Verification limits (sandbox, same wall every prior SEO-generator item hit)
- `yields.llama.fi` and `unpkg.com` are unreachable here (confirmed pattern from 014/018/021/039/040/042's LOG entries) — offline `--fixture` verification only. Real chain pages/sitemap only exist after the next `sitemap-update.yml` CI run (same residual 021 documented: "trigger the Action, watch").
- `node_modules/` is absent (playwright never installed) — `test_smoke.js`/`test_search.js` fail with `MODULE_NOT_FOUND`, confirmed pre-existing on this branch's base (same failure with all this session's changes stashed) and unrelated to this diff's blast radius. Every other test in the chain (`test_planner`, `test_protocol_parsing`, `test_qualifier_fix`, `test_canonical`, `test_token_pages`, `test_chain_pages`, `test_indexnow`, `test_stories`) ran individually and green (188 total assertions across the non-Playwright suite, incl. 39 new).
- `generate-sitemap.js`'s new `existsSync('sitemap-chain-pages.xml')` block cannot be exercised live (the script has no `--fixture` path, unchanged from before this diff) — verified by syntax check (`node -c`) and by direct code inspection: it is a byte-for-byte structural mirror of the already-shipped, already-proven `sitemap-token-pages.xml` block immediately above it.
- `.github/workflows/sitemap-update.yml` changes verified as valid YAML (`python3 -c 'import yaml; yaml.safe_load(...)'`) and by inspection — the new step is a structural mirror of the existing "Generate token landing pages" step.

## Sample output
`chains/*.html` (4 pages: big, mid, anom, multi-chain) generated offline from `test_fixtures/pools-chain-sample.json` and committed for review, same as 014's original phase-1 practice. These will be overwritten by the next live CI run once it produces the real chain set (mirrors what happened to `tokens/`'s sample pages after 021 shipped).
