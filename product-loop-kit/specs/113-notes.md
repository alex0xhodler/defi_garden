# 113 — build notes

**Item:** Fold `generate-llms.js` onto 112's shared `$1000`-floored SEO transient (single CI `/pools` fetch).
**Branch:** `claude/inspiring-meitner-sylww4` (harness-pinned; one commit carries code + test + bookkeeping per standing decision 2026-07-13 #104).
**Risk:** HIGH (generated SEO surface; human-signed content-semantics change, spec 113 §DECISION 2026-07-15 EXCLUDE).

## What changed (3 files, surgical)
1. **generate-llms.js**
   - Added `loadFixturePools(fixturePath)` + `parseFixtureArg(argv)` — copied verbatim from `generate-sitemap.js` (same fail-SAFE-to-live semantics), placed right after `fetchYieldsSafe`. Uses this file's `log()` helper for the fallback warnings (no `console.warn` convention here).
   - `main()`: the single `const { yields, sourceTs } = await fetchYieldsSafe();` line now prefers the transient — `parseFixtureArg` → `loadFixturePools`; on a good fixture it uses those pools and stamps `sourceTs` from the fixture file's mtime (the transient was produced by a live DefiLlama fetch earlier in the same CI run, so its mtime is the honest "fetched" time); on null it falls through to `fetchYieldsSafe()` exactly as before. `pickHighYield`/`analyzeYieldData` calls unchanged.
   - `module.exports`: added `analyzeYieldData`, `loadFixturePools`, `parseFixtureArg` (needed by the test).
2. **.github/workflows/sitemap-update.yml** — the "Generate LLM files" step: `node generate-llms.js` → `POOLS_FIXTURE="$RUNNER_TEMP/seo-pools.json" node generate-llms.js`. Nothing else touched (paths: trigger list unchanged — llms regens on every run regardless of trigger, so adding it would only cost extra deploys).
3. **test_llms_shared_source.js** (new) — pure Node, network-free, writes only under `os.tmpdir()`, non-zero exit on failure. 12 assertions:
   - MECHANISM (identity given identical inputs): two end-to-end runs over the SAME fixture emit byte-identical `llms.txt`/`llms-full.txt` (normalized via the module's own `normalizeLlmsContent`). `LLMS_OUTPUT_DIR`/`SITEMAP_PATH`/`POOLS_FIXTURE` env overrides keep output in tmp, repo untouched.
   - DOCUMENTED DUST DIVERGENCE: `analyzeYieldData(full)` vs `analyzeYieldData(filtered)` for a dust-concentrated chain/protocol differ by EXACTLY the total dust TVL — asserted, with messages stating this is the KNOWN, human-signed-off exclusion (backlog 113), not a regression.
   - FAIL-SAFE (C1): `loadFixturePools` → array for good fixture, null for missing/empty/malformed; `parseFixtureArg` reads `--fixture` / env.
   - Guardrail: `git status --porcelain` unchanged before/after.

## Deviations from spec
None material. Spec left `sourceTs` handling to the builder; chose fixture-file mtime (honest, non-null) over `null`/"unavailable" — and it doesn't affect byte-identity anyway since `normalizeLlmsContent` already scrubs the `(fetched: …)` line (083). The "assert identity given identical inputs" was implemented end-to-end (child_process, real emitted files) rather than at the function level, matching the 112 test precedent — stronger evidence.

## Verification (all green)
- `node test_llms_shared_source.js` → 12/12, exit 0.
- NORTH_STAR test line: `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` → all OK.
- Transient path is network-free: the MECHANISM runs execute `generate-llms.js` with the fixture and complete without any `yields.llama.fi` fetch (the fallback only fires on a bad/absent fixture).

## Trust rails / NEVER-list
Untouched. The transient is already trust-rail-filtered (`$1000` floor upstream in `generate-pools-snapshot.js`); the llms attribution line is unchanged; no `APY_SANITY_LIMIT`/`DEFAULT_MIN_TVL`/anomaly/haircut code touched; no SEO surface deleted (llms still generated every run, now from the shared transient). The one accepted content change (sub-$1000 dust excluded from llms aggregates) is human-signed-off (spec 113, 2026-07-15).

## Live effect
Takes effect on the next `sitemap-update.yml` run (daily cron or any listed-file push): the job drops from 2 live DefiLlama `/pools` fetches to 1. Empirically byte-identical on the 2026-07-15 live payload (13 dust pools / $4,310, below display granularity); structurally may differ if future sub-$1000 pools concentrate in a top-N bucket — accepted.
