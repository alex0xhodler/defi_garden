# 189 — build notes

Status at handoff: implementation complete (Leg A + Leg B + Leg C), verified, uncommitted (per
instructions — operator session owns commit/PR/BACKLOG/LOG).

## Summary

`generate-sitemap.js`'s `getPoolType()` was a forked copy of the product's real pool-type
classifier (`getPoolTypeShared`, `PoolDetail.js`, spec 130). Leg A deletes the fork and replaces it
with the real classifier, extracted straight out of `PoolDetail.js` via a bare `vm` context (the
same anchor-slice-evaluate pattern `test_helpers_parser.js`'s `extractParser` already uses for
`app.js`'s NL parser). Leg B extends the sitemap's category taxonomy from the fork's 4 categories to
the product's real 6 (`app.js:114-121` `CATEGORY_TABS`), adding `RWA` and `Yield Derivatives`. Leg C
regenerates the SEO artifacts against live DefiLlama data and confirms the fix.

## Leg A — de-fork the classifier

Deleted the old `getPoolType()` body (3 short protocol lists, 4 categories) and replaced it with:

- `extractGetPoolTypeShared(poolDetailPath = PoolDetail.js)` — reads `PoolDetail.js`, slices from
  `const LENDING_PROTOCOLS` through the closing `}` of `function getPoolTypeShared`, evaluates the
  slice in a bare `vm` context, and returns the extracted function. Exported **un-cached** so tests
  can point it at a scratch file without disturbing the real module-scope cache. Throws a single
  actionable `Error` naming `PoolDetail.js`'s exact path and the specific missing/broken anchor on
  every failure mode (unreadable file, missing start anchor, missing end anchor, unparseable slice,
  non-function result) — never a silent fallback to the old lists.
- `const _getPoolTypeShared = extractGetPoolTypeShared();` — runs **at require time** (module top
  level, not lazily on first call), so a broken/moved `PoolDetail.js` fails
  `require('./generate-sitemap.js')` itself, loudly, exactly like the file's existing posture on a
  DefiLlama fetch error. This is why `generate-llms.js`/`audit-app.js`'s existing `require(...).getPoolType`
  wrapped in `try/catch` is the right shape already — they were built for this failure mode.
- `getPoolType(pool)` now just calls `_getPoolTypeShared(pool)`. Name and signature are byte-identical
  to before, so `generate-llms.js` / `audit-app.js` / `generate-token-pages.js` needed **zero**
  call-site changes (verified — see A6 below).

Verified the extracted region evaluates cleanly outside a browser (references only
`String`/`Array` builtins + the five list constants it declares itself — no DOM, no React) and that
`getPoolType()` agrees with an **independently** re-extracted `getPoolTypeShared` on **100% of the
736 pools** in the committed `data/pools-snapshot.json` (0 disagreements) — see A3 below.

## Leg B — six-category taxonomy

`categories` grew from `['Lending', 'Staking', 'LP/DEX', 'Yield Farming']` to
`['Lending', 'Staking', 'LP/DEX', 'Yield Farming', 'RWA', 'Yield Derivatives']`; `categoryUrlMap`
gained `'RWA': 'RWA'` and `'Yield Derivatives': 'Yield%20Derivatives'`. Verified (did not need to
rewrite) that the filename derivation (`sitemap-category-<safeCatName>.xml` — the
`replace(/[^a-z0-9]/gi, '-')` regex already turns `Yield Derivatives` into
`sitemap-category-Yield-Derivatives.xml` correctly), the alphabetical sitemap-index entry loop, and
`cleanupStaleSitemaps()` (keys off the written-filename list, generic over any category) all handle
the two new categories with **no code change** — confirmed by the live regeneration actually writing
`sitemap-category-RWA.xml` (3 URLs) and `sitemap-category-Yield-Derivatives.xml` (4 URLs) and both
appearing correctly in the regenerated `sitemap.xml` index.

## Leg C — regeneration

`npm run sitemap && npm run generate:llms` run against live DefiLlama data (15,873 pools fetched).
Full before/after accounting below (A8). Re-ran both commands a second time afterward to confirm
byte-identical, idempotent output (md5sums of `sitemap-category-RWA.xml`,
`sitemap-category-Yield-Derivatives.xml`, `sitemap-category-Lending.xml`, `sitemap.xml`, `llms.txt`
matched across the two runs) — same discipline as 188's precedent.

## Deviations from the spec (all conservative, none relax a trust rail)

1. **`extractGetPoolTypeShared` extraction happens at require time, but is exported un-cached for
   testability.** The spec says "extracted... at require time with vm" and separately "Cache at
   module scope" and A4 says the extraction must be testable against a temp file. A single cached
   function tangled to a fixed path can't satisfy both: production needs a **module-scope memo of the
   real `PoolDetail.js`**, while A4's regression test needs to call the **same extraction logic**
   against a scratch file **without** poisoning or being poisoned by that memo. Resolved by splitting
   the two: `extractGetPoolTypeShared(path)` does the raw extraction (no internal caching, so a test
   can call it with any path any number of times); a single module-scope `const _getPoolTypeShared =
   extractGetPoolTypeShared();` (default path) is the ONE production call, executed once, at
   require time, with the result cached in that `const`. `getPoolType()` is just `(pool) =>
   _getPoolTypeShared(pool)`. This is the same "cache the one production call, keep the underlying
   logic separately testable" shape `test_helpers_parser.js`'s `extractParser` already uses (it's
   re-called per test file, not memoized, because its callers explicitly want a fresh extraction each
   time) — I judged a require-time memo was the closer read of "at require time" + "cache at module
   scope" for THIS item, since `getPoolType()` is called once per pool across potentially thousands
   of pools during a single sitemap run, and re-reading/re-evaluating `PoolDetail.js` on every single
   call would be wasteful for no correctness benefit.
2. **A1's fixture token (`GOLDX`) is hand-picked, not the literal `ondo`/`pendle` symbols from the
   spec's prose example.** The spec's acceptance text uses `ondo`/`pendle`/`binance-staked-eth` as
   illustrative PROJECT names for the four category pools, and separately asks for "a token whose
   only pools are RWA." I used `project: 'ondo-yield-assets'` (a real `RWA_PROTOCOLS` entry) for the
   RWA pools and a synthetic token symbol (`GOLDX`) so the fixture is self-contained and has no
   collision with any other category's token substring. `binance-staked-eth` / `WBETH` is used
   VERBATIM per the spec's own explicit example for the staking pool.
3. **A2 is derived from `generateSitemapSuite(FIXTURE_POOLS)`'s real output, not a hand-typed URL
   list** — same "never a hand-picked always-works set" discipline `test_sitemap_filter_urls.js`
   established for item 188. The fixture is deliberately crafted with exactly 2 qualifying (>$10M
   TVL) pools per category across all 6 categories, so `generateSitemapSuite` emits one URL per
   category and every one of those 6 real, generator-derived URLs is then rendered and asserted
   `>=2 .pool-card`.
4. **A5 fetches live pool data at test-run time (a fresh `https.get('https://yields.llama.fi/pools')`
   call inside the test) rather than reading a committed fixture.** A5's literal requirement is to
   simulate the app's real filter over the **regenerated, on-disk** `sitemap-category-*.xml` files —
   those were generated from ~15.8K live pools, not from `data/pools-snapshot.json`'s 736-pool
   snapshot, so simulating against the snapshot would produce nonsense (thousands of URLs the
   snapshot has no data for, at all). The sandbox's confirmed node/curl reachability of
   `yields.llama.fi` (CLAUDE.md, NORTH_STAR 2026-07-12 standing decision, and this item's own
   "Sandbox" territory note) makes this the correct, most-honest simulation, at the cost of the test
   needing network at run time — same trade-off `npm run sitemap` itself already makes. If the fetch
   fails, the test reports the failure explicitly and skips the rest of A5's count simulation rather
   than silently passing.
5. **Port 8866** chosen for the new test's Playwright server (grepped every `const PORT = ` literal
   in the repo first; highest existing value was 8865).

## Non-vacuity (the mutation and its result)

**Real, naturally-occurring RED → GREEN, not a synthetic revert.** Ran the finished, fixed
`test_sitemap_category_urls.js` TWICE:

1. **Before Leg C's regeneration** (Leg A + Leg B code changes were already in place, but the
   on-disk `sitemap-category-*.xml` files were still the OLD fork-generated files from the last
   commit): **29 passed, 4 failed** — A5 correctly caught the exact bug spec 189 describes against
   the real committed files: `poolTypes=RWA`/`poolTypes=Yield Derivatives` URLs absent, and the same
   **8 dead + 3 thin `Yield-Farming` URLs** the spec's own investigation measured (`WBETH`, `SUSDS`,
   `USDY`, `SAVAX`, `BEAT`, `XMR`, `SIERRA`, `ECR` at 0 pools; `OSETH`, `OUSG`, `RLUSD` at 1 pool) —
   byte-for-byte the same list as specs/189.md's "The finding" section. Saved in full at
   `/tmp/claude-0/.../scratchpad/189/test-pre-legC.log`.
2. **After Leg C's regeneration** (`npm run sitemap && npm run generate:llms`, live data): **33
   passed, 0 failed**.

This is exactly the kind of proof 188-notes.md's "Non-vacuity" section modeled: the test wasn't just
asserted to be capable of failing in the abstract — it was run against the ACTUAL pre-fix artifact
state and genuinely went red on the actual measured defect, then green after the actual fix.

A1/A2's fixture-driven rendered assertions also inherently prove non-vacuity: A1 always passed (it
tests the app's OWN real filtering logic in app.js, untouched by this item, so it isn't testing the
fix directly) — its purpose is to prove the GOLDX/Yield-Farming vs GOLDX/RWA distinction is real in
the rendered product, independent of which sitemap file got which URL.

## Before/after accounting (A8, no truncation)

### Per-file `<loc>` counts

| file | before (git HEAD) | after (regenerated) | delta |
|---|---|---|---|
| `sitemap-category-Lending.xml` | 36 | 38 | +2 |
| `sitemap-category-Staking.xml` | 1 | 2 | +1 |
| `sitemap-category-LP-DEX.xml` | 13 | 21 | +8 |
| `sitemap-category-Yield-Farming.xml` | 64 | 49 | −15 |
| `sitemap-category-RWA.xml` | *(did not exist)* | 3 | +3 (new file) |
| `sitemap-category-Yield-Derivatives.xml` | *(did not exist)* | 4 | +4 (new file) |
| **total** | **114** | **117** | **+3** |

(Spec's own pre-measurement predicted 116 total, 15 removed / 17 added, per-category `L38 · S2 ·
LP20 · YF49 · RWA3 · YD4` — my LIVE regeneration measured `L38 · S2 · LP21 · YF49 · RWA3 · YD4`
(117 total, 15 removed / 18 added). The 1-URL difference (LP/DEX 20→21, one extra added URL) is
ordinary live-data drift between the spec's investigation snapshot and this run's live fetch — same
pools API, different point in time. Every other number matches the spec's prediction exactly.)

### Removed URLs (15 — all were dead-or-thin `Yield Farming` URLs the fork over-filed)

```
https://www.defi.garden/?token=BEAT&poolTypes=Yield%20Farming
https://www.defi.garden/?token=ECR&poolTypes=Yield%20Farming
https://www.defi.garden/?token=OSETH&poolTypes=Yield%20Farming
https://www.defi.garden/?token=OUSG&poolTypes=Yield%20Farming
https://www.defi.garden/?token=RLUSD&poolTypes=Yield%20Farming
https://www.defi.garden/?token=SAVAX&poolTypes=Yield%20Farming
https://www.defi.garden/?token=SDAI&poolTypes=Yield%20Farming
https://www.defi.garden/?token=SIERRA&poolTypes=Yield%20Farming
https://www.defi.garden/?token=SOL&poolTypes=Yield%20Farming
https://www.defi.garden/?token=SUSDS&poolTypes=Yield%20Farming
https://www.defi.garden/?token=USDAI&poolTypes=Yield%20Farming
https://www.defi.garden/?token=USDS&poolTypes=Yield%20Farming
https://www.defi.garden/?token=USDY&poolTypes=Yield%20Farming
https://www.defi.garden/?token=WBETH&poolTypes=Yield%20Farming
https://www.defi.garden/?token=XMR&poolTypes=Yield%20Farming
```

### Added URLs (18 — the same tokens' HONEST category, plus newly-qualifying LP/DEX combos)

```
https://www.defi.garden/?token=BEAT&poolTypes=LP%2FDEX
https://www.defi.garden/?token=ECR&poolTypes=LP%2FDEX
https://www.defi.garden/?token=LUNC&poolTypes=LP%2FDEX
https://www.defi.garden/?token=OUSG&poolTypes=RWA
https://www.defi.garden/?token=PYUSD&poolTypes=LP%2FDEX
https://www.defi.garden/?token=SAVAX&poolTypes=Lending
https://www.defi.garden/?token=SIERRA&poolTypes=Yield%20Derivatives
https://www.defi.garden/?token=STUSDS&poolTypes=Lending
https://www.defi.garden/?token=SUSDAI&poolTypes=Yield%20Derivatives
https://www.defi.garden/?token=SUSDE&poolTypes=Yield%20Derivatives
https://www.defi.garden/?token=SYRUPUSDC&poolTypes=LP%2FDEX
https://www.defi.garden/?token=USDAI&poolTypes=Yield%20Derivatives
https://www.defi.garden/?token=USDC&poolTypes=RWA
https://www.defi.garden/?token=USDG&poolTypes=LP%2FDEX
https://www.defi.garden/?token=USDY&poolTypes=RWA
https://www.defi.garden/?token=WBETH&poolTypes=Staking
https://www.defi.garden/?token=WSOL&poolTypes=LP%2FDEX
https://www.defi.garden/?token=XMR&poolTypes=LP%2FDEX
```

### Per-token reconciliation

- **9 tokens moved from a wrong category to their honest one** (present in BOTH lists above, under a
  different `poolTypes` value): `BEAT`, `ECR`, `OUSG`, `SAVAX`, `SIERRA`, `USDAI`, `USDY`, `WBETH`,
  `XMR`.
- **6 tokens lost their category URL entirely** (in the removed list, no replacement in the added
  list): `OSETH`, `RLUSD`, `SDAI`, `SOL`, `SUSDS`, `USDS`. This is item 013's quality gate working as
  designed, not de-indexing: each token's HONEST per-category count (under the real classifier) is
  now below `SITEMAP_MIN_QUALIFYING_POOLS`=2, so no category URL is minted for it — but every one of
  the 6 still keeps its plain `?token=<T>` entry in `sitemap-tokens-all.xml`, verified individually:

  ```
  OSETH: present in sitemap-tokens-all.xml
  RLUSD: present in sitemap-tokens-all.xml
  SDAI:  present in sitemap-tokens-all.xml
  SOL:   present in sitemap-tokens-all.xml
  SUSDS: present in sitemap-tokens-all.xml
  USDS:  present in sitemap-tokens-all.xml
  ```

  (Spec's own pre-measurement named 4 such tokens — `OSETH, SDAI, SOL, RLUSD`; this run's live data
  additionally drops `SUSDS` and `USDS` below the gate, live-data drift consistent with the same
  ~1-URL variance noted in the per-file table above.)
- **9 tokens are brand new to the category sitemap** (in the added list, not previously present under
  ANY category): `LUNC`, `PYUSD`, `STUSDS`, `SUSDAI`, `SUSDE`, `SYRUPUSDC`, `USDC`, `USDG`, `WSOL` —
  ordinary live-data qualification churn (new pools crossing the $10M/2-pool gate since the last
  commit), not caused by this item's classifier/taxonomy change.

### Other files touched by the Leg C regeneration (not hand-edited)

`sitemap-category-LP-DEX.xml`, `sitemap-category-Lending.xml`, `sitemap-category-Staking.xml`,
`sitemap-category-Yield-Farming.xml` (all four intended — the classifier fix's direct effect);
`sitemap-category-RWA.xml`, `sitemap-category-Yield-Derivatives.xml` (new files, Leg B); `sitemap.xml`
(index — cascades from child lastmods); `sitemap-tokens-all.xml`, `sitemap-chain-Plasma.xml`,
`sitemap-chain-Solana.xml` (ordinary live-data drift, spot-checked below, NOT caused by this item's
code); `llms.txt`, `llms-full.txt` (regenerated from the corrected sitemap suite via the existing,
unmodified `generate-llms.js` pipeline).

- `sitemap-chain-Plasma.xml`'s diff is exactly a `<lastmod>`/`<priority>` update on its one existing
  `<url>` (0.84 → 0.83) — no `<loc>` added or removed. Chain sitemaps never call `getPoolType()` at
  all (only token+chain combos, no category axis), so this file cannot be affected by Leg A/B by
  construction; the diff is pure TVL/timing drift.
- `sitemap-chain-Solana.xml`'s diff is exactly one new `<url>` (`?token=LUNC&chain=Solana`) — same
  reasoning, unrelated to this item's code.
- `sitemap-tokens-all.xml`'s diff was not hand-verified token-by-token (would require re-deriving
  hundreds of per-token qualifying counts from the live feed by hand); this sitemap also never calls
  `getPoolType()` (token discovery sitemap has no category axis), so by construction it can only
  reflect live TVL/APY-qualification drift, not this item's code. **Not exhaustively verified**,
  flagged honestly per the 188-notes precedent rather than asserted with false confidence.
- `llms.txt`/`llms-full.txt`'s diffs beyond the corrected sitemap URLs are the standard cascading
  effect of `generate-llms.js` re-reading the regenerated sitemap suite (its own pipeline, untouched
  by this item) plus its existing R2/R3 chain-retarget/minApy-repair logic re-running against the new
  URL set — not independently re-verified line-by-line beyond the `test_llms_link_integrity.js`
  gates (all pass, see below).

## What I could NOT verify

- **The full ~100-file browser test lane was NOT run** (explicit timebox instruction — 5 foreground
  minutes per run, and the instruction to not attempt the full lane). Ran: the new
  `test_sitemap_category_urls.js` (twice — pre- and post-Leg-C), plus every file named in the brief:
  `test_sitemap_xml.js`, `test_sitemap_filter_urls.js`, `test_llms_link_integrity.js`,
  `test_audit_text_surfaces.js`, `test_pool_type_badge.js`, `test_seo_shared_source.js`,
  `test_token_slug_validity.js`. Did **not** run any other browser-lane or plain-lane file (e.g.
  `test_search.js`, `test_category_taxonomy.js`, `test_hub_pages.js`, the full `test:fast`/`test:serial`
  suite) — no code path outside `generate-sitemap.js`'s exported `getPoolType`/taxonomy and the SEO
  artifacts changed, and none of those other files require `generate-sitemap.js`.
- **`sitemap-tokens-all.xml`'s full per-token diff** — see "Other files touched" above; spot-checked
  the mechanism (no category axis, so it can't be code-caused) but did not hand-re-derive every
  qualifying count.
- **`llms.txt`/`llms-full.txt`'s line-by-line diff beyond the sitemap URL set** — covered by the
  existing `test_llms_link_integrity.js` gates (57/57 pass, including the "zero dead grid links"
  and "no empty-heading-over-nothing" assertions against the real regenerated files), not manually
  re-derived beyond that.
- **`node_modules` was absent from this checkout at session start** (`npm install` had never been
  run) — ran `npm install` (67 packages, network-reachable per the sandbox's confirmed npm
  reachability) before any test could execute. Flagging since this is environment setup, not part of
  this item's diff, and the operator should know the checkout needed it.
- **No `translations.js` change** — confirmed (`git diff --stat -- translations.js` empty). This item
  touches only `generate-sitemap.js` (generator logic), `package.json` (test registration), a new test
  file, and generated SEO artifacts (URLs/XML/txt) — zero new user-facing UI strings anywhere. **Case:
  "no translations.js change expected" applies, confirmed** (per the spec's own closing line).

## Acceptance criteria — status

- **A1 (rendered, the bug).** `test_sitemap_category_urls.js`: fixture population with an RWA pool
  (`ondo-yield-assets`, token `GOLDX`), a Yield-Derivatives pool (`pendle`, token `PDLX`), a staking
  pool (`binance-staked-eth`, token `WBETH`, the spec's own example) and a lending pool (`aave-v3`,
  token `LNDX`). `?token=GOLDX&poolTypes=Yield%20Farming` renders **0** `.pool-card` at both 1280px
  and 360px; `?token=GOLDX&poolTypes=RWA` renders **2** `.pool-card` (GOLDX's actual pools) at both
  viewports. Zero non-ignorable page errors at either viewport. **PASS** (6/6 assertions).
- **A2 (rendered, the fix's own output).** Every category URL `generateSitemapSuite()` REALLY emits
  for the SAME fixture (derived, not hand-typed: `LPDX`→LP/DEX, `LNDX`→Lending, `GOLDX`→RWA,
  `WBETH`→Staking, `PDLX`→Yield Derivatives, `YFMX`→Yield Farming) renders **>=2** `.pool-card` —
  every one of the 6 rendered at exactly 2 (the fixture's own design). **PASS** (6/6 URLs).
- **A3 (Node gate).** `getPoolType({project:'ondo-yield-assets'})` → `RWA`;
  `getPoolType({project:'pendle'})` → `Yield Derivatives`; `getPoolType({project:'sky-lending'})` →
  `Lending`; `getPoolType({project:'venus-core-pool'})` → `Lending` (the exact pools spec 130's
  `test_pool_type_badge.js` locks). Agreement with an independently re-extracted `getPoolTypeShared`
  on **736/736 (100%)** of `data/pools-snapshot.json`, **0 disagreements**, asserted as a number, not
  eyeballed. **PASS** (6/6 assertions).
- **A4 (Node gate, regression).** `extractGetPoolTypeShared()` pointed at 4 distinct broken scratch
  files (missing file, missing start anchor, missing end anchor, syntax error) throws a named,
  actionable `Error` quoting the exact path and the specific missing/broken anchor in every case; a
  failed extraction never returns a function (no silent fallback). **PASS** (5/5 assertions).
- **A5 (Node gate, the emission).** Simulating the app's real token-first filter (`app.js:2020-2062`
  semantics: substring symbol match, exact `getPoolType` category match, `tvlUsd >= SITEMAP_MIN_TVL`,
  `tvlUsd > 0`) against live pool data (15,873 pools, fresh fetch) over the REGENERATED
  `sitemap-category-*.xml` (117 `<loc>` total) yields **0 URLs at 0 pools, 0 URLs at 1 pool**; the
  set includes `poolTypes=RWA` (3 URLs) and `poolTypes=Yield Derivatives` (4 URLs); every `<loc>` is
  a well-formed absolute `https://www.defi.garden/?token=…&poolTypes=…` URL. **PASS** (8/8
  assertions, post-Leg-C; see "Non-vacuity" above for the pre-Leg-C RED run that caught the exact
  spec-described defect on the actual committed files).
- **A6 (consumers, no call-site change).** `git diff --stat -- generate-llms.js audit-app.js
  generate-token-pages.js` → **empty**. `test_llms_link_integrity.js` (57/57) and
  `test_audit_text_surfaces.js` (49/49) both pass, including their lazy-require + drop-path
  exercises. **PASS**.
- **A7 (trust rails + scope).** `git diff --stat -- app.js PoolDetail.js home.html plan.html
  planner.js translations.js vercel.json` → **empty**. `SITEMAP_MIN_TVL = 10000000`,
  `APY_SANITY_LIMIT = 1000`, `SITEMAP_MIN_QUALIFYING_POOLS = 2` — byte-unchanged (verified via
  targeted `git diff` grep on those three lines: zero hits). `git status --short -- telegram-bot/
  whatsapp-bot/ workers/` → empty. **PASS**.
- **A8 (SEO surface accounting).** See "Before/after accounting" above — full per-file `<loc>`
  counts, complete removed (15) and added (18) URL lists, no truncation, per-token reconciliation,
  and the mechanism check on every other touched file. **PASS**.
- **EN + KO (vacuous, stated per instructions).** No `translations.js` change — this item touches
  only generator code, an audit-consumed export, test registration, and generated SEO artifacts; zero
  new user-facing strings. **Case applies, confirmed.**

## Test results (exact counts)

| file | result |
|---|---|
| `test_sitemap_category_urls.js` (new) | pre-Leg-C: 29 passed / 4 failed (expected RED — reproduces the exact spec-described defect on the actual committed files); post-Leg-C: **33 passed / 0 failed** |
| `test_sitemap_xml.js` | 27 passed / 0 failed |
| `test_sitemap_filter_urls.js` | 11 passed / 0 failed |
| `test_llms_link_integrity.js` | 57 passed / 0 failed |
| `test_audit_text_surfaces.js` | 49 passed / 0 failed |
| `test_pool_type_badge.js` | 10 passed / 0 failed |
| `test_seo_shared_source.js` | 20 passed / 0 failed |
| `test_token_slug_validity.js` | 66 passed / 0 failed |

All 8 files pass, each run well under the 5-foreground-minute timebox individually. Did **not** run
the full `test:serial`/`test:fast` lane or any file not named in the brief — see "What I could NOT
verify" above.

## Files changed

- `generate-sitemap.js` — Leg A: deleted the forked `getPoolType()`; added
  `extractGetPoolTypeShared()` (vm-extraction of `PoolDetail.js`'s classifier region, un-cached,
  exported), a module-scope `const _getPoolTypeShared = extractGetPoolTypeShared();` evaluated at
  require time, and a one-line `getPoolType(pool)` delegating to it. Leg B: `categories` array and
  `categoryUrlMap` extended from 4 to the product's 6 categories (added `RWA`, `Yield Derivatives`).
  `module.exports` gained `extractGetPoolTypeShared` (additive; every existing export unchanged).
- `test_sitemap_category_urls.js` (new) — A1-A5, registered in `package.json`'s `test:serial`
  immediately after `test_sitemap_filter_urls.js`.
- `package.json` — registered `test_sitemap_category_urls.js` in `test:serial`.
- Regenerated (never hand-edited): `sitemap.xml`, `sitemap-category-Lending.xml`,
  `sitemap-category-Staking.xml`, `sitemap-category-LP-DEX.xml`, `sitemap-category-Yield-Farming.xml`,
  `sitemap-tokens-all.xml`, `sitemap-chain-Plasma.xml`, `sitemap-chain-Solana.xml`, `llms.txt`,
  `llms-full.txt`; **new**: `sitemap-category-RWA.xml`, `sitemap-category-Yield-Derivatives.xml`.

## Not touched (confirmed)

`git diff --stat -- app.js PoolDetail.js home.html plan.html planner.js translations.js vercel.json`
→ empty. `git diff --stat -- generate-llms.js audit-app.js generate-token-pages.js` → empty. Nothing
under `telegram-bot/`, `whatsapp-bot/`, `workers/` touched. No commit, no push, no PR, no
`product-loop-kit/BACKLOG.md`/`LOG.md` edit (the pre-existing uncommitted `BACKLOG.md` row and
`specs/189.md` from before this session started were left as-is, not reverted).
