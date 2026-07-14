# 080 — build notes

Ship the last mile of 013's sitemap quality gate: CI now commits the real regenerated
child sitemaps and the generator deletes its stale orphans.

## Changes

- `generate-sitemap.js`
  - Added named constant `FOREIGN_PAGE_SITEMAPS` (the four page-sitemaps owned by
    generate-token-pages.js / generate-chain-pages.js) — never deleted.
  - Added `cleanupStaleSitemaps(writtenFilenames, dir = process.cwd())`: scans `dir`
    for `/^sitemap-.*\.xml$/`, deletes any file not written this run and not a foreign
    page-sitemap. Logs every deletion individually + a summary count. The regex requires
    a hyphen after "sitemap", so `sitemap.xml` (the index) can never match.
  - `generateSitemapSuite` now tracks `writtenFilenames` (files actually written, i.e.
    non-empty families) and calls `cleanupStaleSitemaps(writtenFilenames)` right after the
    index is written.
  - Exported `cleanupStaleSitemaps` and `FOREIGN_PAGE_SITEMAPS` alongside the existing
    exports. CLI behavior unchanged (`node generate-sitemap.js` runs identically).
  - Trust rails byte-untouched: `SITEMAP_MIN_TVL` (10000000), `APY_SANITY_LIMIT` (1000),
    `SITEMAP_MIN_QUALIFYING_POOLS` (2) and the gate logic are unchanged.
- `test_sitemap_cleanup.js` (new, no network): drives `cleanupStaleSitemaps` in a
  `mkdtempSync` temp dir. Asserts stale generator-owned child deleted; foreign page-sitemap
  kept; fresh-written child kept; `sitemap.xml` index kept; non-sitemap file kept. Plus a
  "never delete any of the four page-sitemaps" case and an empty-dir no-op case. Temp dir
  cleaned up; exits non-zero on failure.
- `package.json`: appended `&& node test_sitemap_cleanup.js` to the `test` chain.
- `.github/workflows/sitemap-update.yml`: added `git add -A -- 'sitemap*.xml'` immediately
  after the existing `git add ...` line in the commit step (quoted pathspec so git stages
  deletions of tracked files; `-A` lands the deletions). Nothing else reordered/removed.

## Generator run (live, network open)

`node generate-sitemap.js` at repo root — full DefiLlama fetch succeeded on the first try
(no retries needed). Rewrote the index + 106 child sitemaps + robots.txt, and the new
cleanup deleted exactly the 12 expected orphans.

### Deleted orphan files (12)

- sitemap-combos.xml
- sitemap-chains.xml
- sitemap-chain-Arbitrum-Nova.xml
- sitemap-chain-Bitcoincash.xml
- sitemap-chain-Blast.xml
- sitemap-chain-Chiliz.xml
- sitemap-chain-Cosmos.xml
- sitemap-chain-Doge.xml
- sitemap-chain-Litecoin.xml
- sitemap-chain-Mode.xml
- sitemap-chain-Soneium.xml
- sitemap-chain-Wc.xml

### Post-run integrity verification

- Every `<loc>` in `sitemap.xml` (110 refs) resolves to an existing root file — 0 missing.
- 0 root `sitemap-*.xml` unreferenced by the index.
- The four page-sitemaps still present and untouched:
  sitemap-token-pages.xml, sitemap-token-pages-ko.xml, sitemap-chain-pages.xml,
  sitemap-chain-pages-ko.xml.
- Root `sitemap*.xml` file count: 123 → 111 (12 orphans removed).

### URL counts — before (committed HEAD) vs after (this live run)

| File | Before | After |
|---|---|---|
| Total `<url>` across all root sitemap*.xml | 25,051 | 4,774 |
| sitemap-tokens-all.xml | 4,147 | 107 |
| sitemap-chain-Ethereum.xml | 2,301 | 67 |
| sitemap-category-Lending.xml | 451 | 35 |
| sitemap-category-Staking.xml | 43 | 1 |
| sitemap-category-LP-DEX.xml | 3,307 | 14 |
| sitemap-category-Yield-Farming.xml | 3,347 | 62 |

The shrink is the expected effect of 013's gate finally deploying (spec 013 documented
"expect a material drop"). The 4,774 total INCLUDES the four
page-sitemaps (4,326 URLs); the generator-owned children contribute the remaining 448
(verifier-corrected — an earlier draft of this sentence had it backwards).

## Test results (verbatim, each ≤5 min foreground)

- `node test_sitemap_cleanup.js` → PASS — "3 assertions passed" (exit 0)
- `node validate-sitemaps.js` → PASS — "✅ All 111 sitemap file(s) valid" (exit 0)
- `node test_sitemap_xml.js` → PASS — "✅ test_sitemap_xml: 25 passed, 0 failed" (exit 0)
- `node test_planner.js` → PASS — "All 208 assertions evaluated." (exit 0)
- `node test_protocol_parsing.js` → PASS (exit 0)
- `node test_qualifier_fix.js` → PASS (exit 0)

No test needed adjustment. `test_sitemap_xml.js` runs the generators in an isolated temp
dir with its own fixture, so the shrunken committed sitemaps do not affect it; it has no
hardcoded counts or `sitemap-combos.xml` assumptions.

## Deviations from spec

None. (Note: `npm install` was required first because `node_modules` was absent in the
sandbox — `fast-xml-parser` is a declared production dependency; no new dependency added.)
