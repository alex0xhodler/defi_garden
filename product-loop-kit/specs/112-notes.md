# 112 — build notes (deviations, conservative choices)

Branch: `claude/loop-112` · commit `d67fd1d` (code+test) · built by an Opus coding agent, operated/verified by Fable.

## What shipped (matches spec Design exactly)
- `generate-pools-snapshot.js`: `--seo-out <path>` / `SEO_OUT` writes a **$1000-floored RAW-pool** transient (full fields, `JSON.stringify`) from the SAME single `/pools` fetch, BEFORE the `generateSnapshot` early-return so it always writes even on an unchanged snapshot. Committed `data/` output byte-identical (additive, separate path).
- `generate-token-pages.js` / `generate-chain-pages.js` / `generate-sitemap.js`: shared `loadFixturePools(path)` helper — returns a non-empty pool array or `null`; `null` ⇒ caller live-fetches (fail-SAFE, never a truncated run). Exported from all three. Sitemap also got `parseFixtureArg` + `main()` now passes `override` into `generateSitemapSuite` (which already had the `Array.isArray(poolsOverride) ? … : fetch` seam).
- `.github/workflows/sitemap-update.yml`: snapshot step gains `--seo-out "$RUNNER_TEMP/seo-pools.json"`; token/chain steps append `--fixture "$RUNNER_TEMP/seo-pools.json"`; sitemap step prefixed `POOLS_FIXTURE=…`. `$RUNNER_TEMP` is outside the repo ⇒ no committed transient (A2). **4 live fetches → 1.**
- `test_seo_shared_source.js` (new, 20/20, network-free): B1 byte-identical (full payload output === $1000-filtered output for all 3 generators, incl. OG PNGs, modulo lastmod/date) + C1 fail-safe (`loadFixturePools` returns array for good fixture, `null` for missing/empty/malformed — all three modules).

## Deviations from spec
1. **Spec said "zero code change" for token/chain generators; I changed them anyway (fail-safe loader).** Required by acceptance C1 + the "Live fallback (non-negotiable)" section: the pre-existing `if (args.fixture) { JSON.parse(readFileSync…) }` branch did NOT fail safe — a missing file threw, an empty file produced a truncated run (a pruned sitemap). The spec's own fallback clause overrides its "zero code change" aside. Change is minimal and filter-neutral.
2. **C1 proven via the exported `loadFixturePools` decision, not a live network fallback.** Deterministic and network-free: a `null` return is the exact signal that `main()` falls through to `fetchPoolData()`. Avoids a flaky/slow 10 MB live fetch in the test. The live path itself is unchanged code.
3. **Transient = RAW pool objects, not the 13-field projection.** Guarantees byte-identical downstream (every field any generator reads is preserved). The $1000 floor is the only filter, and it's a provable superset (token/chain floor $100K, sitemap skips `<1000`). B1 proves it.
4. **`npm install` was needed** (node_modules absent; OG-image dep `@napi-rs/canvas` pulled transitively). No package.json dependency / lockfile change.

## Trust rails / NEVER-list
- No rail moved. $1000 is a superset gate, not a rail change; each generator's own `APY_SANITY_LIMIT`/`MIN_POOL_TVL`/anomaly handling byte-untouched. Attribution unchanged.
- **No SEO deletion** — B1's byte-identical guardrail is exactly what keeps 112 off the NEVER list that blocked 102. 0 dropped `/tokens/`, 0 dropped `/chains/`, 0 dropped `<loc>`.
- Does not touch 107's ToS keystone (transient is scratch-only, never served/committed).

## Tests
- 112's own: `test_seo_shared_source` 20/20 + all 10 must-pass SEO-generator tests (`test_pools_snapshot`, `test_token_pages`, `test_chain_pages`, `test_sitemap_xml`, `test_i18n_pages`, `test_og_images`, `test_og_outroot`, `test_sitemap_cleanup`, `test_lastmod_honesty`) — GREEN, re-run by the operator.
- Pre-existing failures (proven independent of 112 by reverting the 4 generators to base `bf3bae21b` → identical failure):
  - `test_minified_assets`, `test_hub_pages` — **main is currently red** on `home.html`/`plan.html` baseline drift (they load raw assets + a changed `__APP_MODE` router, likely from PR #239). 112 touches none of those files. Flagged for the heartbeat — NOT this item's scope.
  - `test_landing`, `test_smoke`, `test_search`, `test_kpi_momentum`, `test_pool_logo`, `test_plan_confidence` — sandbox Playwright/external-host timeouts (established precedent, 2026-07-12 standing decision).

## For the human
- Live proof lands on the next `sitemap-update.yml` CI run: the job log should show ONE `📡 Fetching pools` (in the snapshot step) + `🌱 SEO transient: N pools >= $1,000 TVL`, and the three generator steps printing `📄 Loaded pools from fixture` instead of fetching. `git status` after the run must show NO new `seo-pools.json`.
- Separate observation (not 112): `test_minified_assets` says `home.html` no longer loads `translations.min.js` and `plan.html` loads raw `planner.js` — a possible funnel-top perf regression on main worth a look.
