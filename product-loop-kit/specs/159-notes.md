# 159 notes — apply the trust rails to the `llms.txt` surface

## TVL floor decision

Operator decided **$10,000,000** (`MIN_TVL_USD`, mirroring `DEFAULT_MIN_TVL` at `app.js:801`) up front — the spec's open question 2 ("if under ~8 lines, fall back to $1M") is explicitly NOT needed: the operator verified against the live DefiLlama payload this session and found **548** pools qualify at `tvl >= $10M && apy <= 1000`, far more than `topN = 15`. Re-running the generator in this session against a fresh live tick found **549** eligible pools (549 vs 548 — one tick's worth of pool churn on live data; same order of magnitude, confirms the estimate). No `$1M` fallback branch was implemented.

## Change summary

- `generate-llms.js`: added `APY_SANITY_LIMIT = 1000` and `MIN_TVL_USD = 10000000` once, at the top of the file, each commented as a read-only mirror of `app.js:800` / `app.js:801`. Neither `app.js` nor the rail values themselves were touched.
- `pickHighYield()`'s default `minTvlUsd` now reads `MIN_TVL_USD`; its filter predicate gained `&& apy <= APY_SANITY_LIMIT` alongside the pre-existing `apy > 0 && isFinite(apy)`.
- Added `formatTvlFloor(usd)`, an en-US-locale abbreviated formatter (`10000000 -> "$10M"`), and made the `llms.txt` "Current Top Yields" TL;DR derive its TVL claim from `formatTvlFloor(MIN_TVL_USD)` instead of the old hardcoded `"TVL ≥ $10k"` literal.
- Checked the `llms-full.txt` "Live High-Yield Opportunities (by Chain)" TL;DR (`generate-llms.js:595`, `'TL;DR: Current top-performing pools with detailed metrics.'`) — it makes no numeric TVL/APY claim, so no derived-string fix was needed there. Confirmed via `grep -n -A3 "Live High-Yield Opportunities"`.
- Exported `APY_SANITY_LIMIT`, `MIN_TVL_USD`, `formatTvlFloor` from `generate-llms.js` for the new test.
- Regenerated `llms.txt` + `llms-full.txt` via `npm run generate:llms` (sanctioned path; live DefiLlama fetch, 16,084 pools fetched, 549 eligible under the new rails). Neither file was hand-edited.

## Surviving line counts after regen

- `llms.txt`: **8** pool lines in "Current Top Yields" (unchanged count — `topN` slice of 8 was already applied pre-fix; the pools themselves are now all in-rail).
- `llms-full.txt`: **15** pool lines across "Live High-Yield Opportunities (by Chain)" (Base 5, Solana 3, Ethereum 6, Monad 1 in this tick — chain mix shifted because different pools now qualify).
- Both well above the acceptance floor of >= 5 pool lines each; the filter did not empty the surface.

## Rail-driven removal vs. ordinary churn split

`llms.txt` diff: **38** changed lines total (`git diff` count of `<`/`>` pairs).
- **20** ordinary daily-data churn (Last Updated timestamp: 2; Top Chains by TVL figures: 4; Popular Token-Chain Combinations figures: 4; USDC-on-Ethereum figure: 2; Major DeFi Protocols figures: 8).
- **18** rail-driven (the entire "Current Top Yields" section: 1 TL;DR line + 8 old anomalous pool lines replaced by 8 new in-rail pool lines, counted as 2+16 diff lines).

`llms-full.txt` diff: **88** changed lines total.
- **48** ordinary daily-data churn (timestamp, chain/protocol/token-chain TVL figures in the "Market Analysis" sections — unaffected by the APY/TVL rail since `analyzeYieldData()` aggregates all pools regardless of APY).
- **40** rail-driven (the entire "Live High-Yield Opportunities (by Chain)" section: old anomalous per-chain pool lists — BSC/Base/Avalanche/Polygon/Aptos/Solana sections carrying up to 353,114.16% APY — replaced by the new in-rail Base/Solana/Ethereum/Monad sections).

Verified directly: `grep -oE "— [0-9.]+% APY" <file> | ... | awk '$1>1000' | wc -l` returns **8** on the pre-fix committed files (llms.txt) / **15** (llms-full.txt) matching the spec's own evidence table, and **0** on the regenerated files.

## Non-vacuity proof

Temporarily removed `&& apy <= APY_SANITY_LIMIT` from `pickHighYield()`'s filter predicate (byte-for-byte the only edit), ran `node test_llms_rails.js`:

- **RED: 12 passed, 2 failed**, `process.exitCode = 1`. The two failures were exactly the ones designed to catch this regression:
  - "APY rail alone is load-bearing: anomalous APY + HUGE TVL is still excluded" — failed (`1 !== 0`), because with the TVL floor alone a $500M-TVL pool at 50,000% APY now passed.
  - "boundary: apy === 1000.01 is excluded" — failed (`1 !== 0`), because 1000.01% now passed with no APY ceiling.
  - (The 353114.2%/$576,877-TVL fixture from the spec's own evidence still passed at RED — it's excluded on TVL alone at $10M, which is exactly why the spec asked for a *second*, huge-TVL fixture to prove the APY rail is independently load-bearing, not redundant with the TVL floor.)

Restored the file via `Edit` back to the exact original predicate string, confirmed via `md5sum generate-llms.js` before/after the round-trip (`59ccd182b3633dcd227995d9dbd22c8f` both times — byte-identical). Re-ran `node test_llms_rails.js`:

- **GREEN: 14 passed, 0 failed**, exit code 0.

## Deliberate NO-INSTRUMENTATION disclosure (142/149/154 precedent)

`llms.txt` / `llms-full.txt` are static plain-text files consumed by crawlers and LLM agents fetching them directly over HTTP. They have no client-side JavaScript runtime — nothing in them can execute, so nothing in them can fire a Mixpanel event or any other analytics call. No instrumentation was added, and none should be: doing so would mean inventing a metric with no mechanism to ever emit it. This mirrors the precedent recorded for items 142/149/154. The correctness of this fix is verified functionally (acceptance-criteria greps + `test_llms_rails.js`), not via a growth/analytics signal — consistent with the spec's own Measurement section ("none — correctness item, not an experiment").

## What was NOT done / could not verify in this sandbox

- `npm test`'s full ~90-test chain was not run (per instructions — too slow/flaky for this sandbox). Ran the targeted set instead (see final report).
- `test_seo_surface_audit.js` timed out (120s) due to sandbox network restrictions — headless Chromium's outbound TLS handshakes fail in this environment (`SSL error code 1`, `net_error -202`/`-101`, `CreatePlatformSocket` "Address family not supported"). Confirmed via `grep -n "llms" test_seo_surface_audit.js audit-app.js` that this test does not reference `llms.txt`/`llms-full.txt`/`generate-llms.js` at all — it audits the HTML analytics app via a live browser, an unrelated surface. Treated as a pre-existing sandbox limitation, not a regression from this change.
- `test_minified_assets.js` was not run — the build-loop brief flagged it as having 2 known pre-existing failures on main (home.html/plan.html) unrelated to this item, and it is unrelated to the llms surface.
