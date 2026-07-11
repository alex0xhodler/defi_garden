# 013 notes — build

## What shipped
`generate-sitemap.js`: added a sitemap URL quality gate mirroring app.js's own default rendering threshold.
- `SITEMAP_MIN_TVL = 10000000` (= app.js `DEFAULT_MIN_TVL`, app.js:730) and `APY_SANITY_LIMIT = 1000` (= app.js:729), with an `isAnomalousApy`/`isQualifyingPool` pair matching app.js's formula (`apyBase + apyReward > 1000`).
- Built three qualifying-pool count maps (token-only, token+chain, token+category) counting only pools with `tvlUsd >= $10M` and non-anomalous APY — the exact predicate the live app applies by default.
- `sitemap-tokens-all.xml`, each `sitemap-chain-*.xml`, and each `sitemap-category-*.xml` now only emit a URL when its exact combo has ≥2 qualifying pools (`SITEMAP_MIN_QUALIFYING_POOLS = 2`).
- Chain landing pages (`?chain=Y` alone) and the `minTvl`/`minApy` threshold pages in `sitemap-main.xml` are untouched — out of scope per spec.
- Each family logs how many URLs it dropped (`console.log`), so the effect is auditable from CI output, not silent.

## Deviation from spec: could not regenerate real sitemap files in this sandbox
The spec's acceptance criteria call for running `npm run sitemap` and recording real before/after URL counts. This sandbox's egress policy blocks `yields.llama.fi` (confirmed: `curl` to the API returns proxy 403; `npm run sitemap` errors with a proxy "Host not in [allowlist]" HTML body where JSON was expected) — the same constraint specs/010-diagnosis.md hit ("Sandbox cannot reach yields.llama.fi (allowlist)"). This is a sandbox limitation, not a code defect.

Instead of fabricating numbers, I verified the new logic end-to-end against synthetic mock pool data in an isolated scratch copy of the script (mocked `https.get`, ran the real `generateSitemapSuite()`, inspected the written XML):
- A token with 2 qualifying pools (≥$10M, non-anomalous) on a chain → included in both `sitemap-tokens-all.xml` and that chain's sitemap. ✓
- A token with only 1 qualifying pool globally (second pool below the TVL floor) → dropped from `sitemap-tokens-all.xml`. ✓
- A token with 2 pools where one is anomalous (APY > 1000%) → only 1 qualifying pool → dropped. ✓
- A token that qualifies globally (2 pools on Ethereum) but has only 1 qualifying pool on a *different* chain (Base) → included in the global sitemap, correctly EXCLUDED from that chain's combo sitemap (proves the per-combo count, not the token's global count, gates each URL family independently). ✓
- Drop-count log lines fired correctly per family.

Real before/after URL counts will appear naturally on the next run of `.github/workflows/sitemap-update.yml` (the existing daily CI job that already has live network access and commits regenerated sitemap files — evidenced by the recent `chore: update sitemap and LLM files with latest yields` commit on main). No hand-edit of the generated XML files was made in this PR; they'll regenerate honestly on the next scheduled CI run.

## No other deviations
Change is scoped to `generate-sitemap.js` only, as the spec required. No changes to app.js, home.html, or any other sitemap-family logic (chain landing pages, `minTvl`/`minApy` pages) beyond what the spec called for.
