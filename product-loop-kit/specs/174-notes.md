# Spec 174 — implementation notes

## What changed, and where

### 1. Stop publishing a false safety floor (the P1)

`translations.js`:
- `tcpTrustNote` (EN, line 664; KO, line 1353) — was a plain string quoting
  `"DeFi Garden's trust filters (≥ $100K TVL...)"`. Now a function
  `(floorStr) => ...` whose sentence scopes the floor to *this page's listing
  bar* and drops the "trust filters" attribution. The anomalous-APY exclusion
  clause is kept (it's true).
- `tcpFaqA3` (EN, line 691; KO, line 1375) — same change, for the FAQ answer
  to "Are these rates safe?" (`tcpFaqQ3`, unchanged). This was the specific
  100x-false claim in spec 174's evidence section (`"trust filters — a $100K
  minimum TVL"` read as a claim about the *product's* floor, when the app's
  real savings-plan floor is `DEFAULT_MIN_TVL = $10M`, `app.js:801`, unchanged
  and byte-identical — see the `git diff app.js` check below).

Call sites updated to pass `formatUsd(MIN_POOL_TVL)` — never a re-typed
literal:
- `generate-token-pages.js:649` — `buildAnswerAndFaq`'s FAQ array
  (`t('tcpFaqA3', formatUsd(MIN_POOL_TVL))`).
- `generate-token-pages.js:528, 578, 879` — the three `tcpTrustNote` render
  sites (token hub, A–Z sub-hub, token leaf page).
- `generate-chain-pages.js:337, 392` — the two `tcpTrustNote` render sites
  (chain leaf page, chain hub page). `buildAnswerAndFaq` is shared with the
  token generator (no separate chain-side FAQ builder to touch).

`createTranslationFunction` (translations.js) already treats every key
generically (`typeof translation === 'function' ? translation(...params) :
translation`), and `tcpFaqA3`/`tcpTrustNote` join many other already-function
`tcp*` keys — no change needed to the lookup helper or to
`test_translations_fallback.js`'s fixture/assertions.

### 2. Forever numbers rest only on rail-passing, actually-yielding pools

`generate-token-pages.js:375-397`, `yieldHeadlineFor(rec, lang)`: now filters
`rec.pools` to `isQualifyingPool(p) && formatApy(poolTotalApy(p)) !== '0.00%'`
before calling `gp.blendedApy(...)`. Returns `null` (no headline rendered —
`renderYieldHeadlineHtml` already handles null) when no pool survives the
filter. The existing null-guards (median rounds to 0.00%, non-finite/≤0
forever amount) are unchanged. `generate-chain-pages.js` calls this same
function (`yieldHeadlineFor` is imported from `tp`, not re-implemented) — no
separate chain-side copy exists or was added.

### 3. No `0.00%` rows in the "DeFi Yields" table

`generate-token-pages.js:189-236` (`rankTopTokens`) and
`generate-chain-pages.js:60-98` (`rankTopChains`): the 030/032/033
eligibility gate is **untouched** — still evaluated on `shown =
rec.pools.slice(0, POOLS_PER_PAGE)`, still `if (!shown.some(non-zero))
return`. Comments added explaining why the gate must stay on `shown` (keeps
the generated page set identical) and is deliberately a *different* slice
from what's displayed.

After the gate passes, the record's displayed `pools` is now:
```js
const displayPools = rec.pools
  .filter(p => formatApy(poolTotalApy(p)) !== '0.00%')
  .slice(0, POOLS_PER_PAGE);
```
computed from the **full** sorted `rec.pools` (not `shown`), so a page that
loses zero rows backfills real yield rows from beyond `POOLS_PER_PAGE`
instead of shrinking. `records.push({ ..., pools: displayPools })` replaces
`pools: shown`.

### Regenerated, per the spec's own instruction (minified mirror only)

`translations.min.js` was regenerated via `node minify-assets.js` (the
project's own `npm run minify`, driven by `minify-assets.js`'s `JS_FILES`
list which includes `translations.js`) since `translations.js` changed.
`git diff --stat` after the run shows only `translations.min.js` changed
among the minified outputs — `app.compiled.min.js`, `PoolDetail.compiled.min.js`,
`planner.min.js`, and the three `.min.css` files are byte-identical (their
sources — `app.js`, `PoolDetail.js`, `planner.js` — were not touched).

**`tokens/`, `chains/`, `ko/`, sitemap and llms output were NOT regenerated**
per the explicit instruction that the orchestrator runs that regen.

## Deviations from the plan, and why

1. **`test_token_pages.js:380` / `test_chain_pages.js:340` were NOT changed.**
   The task's "Tests" section said these lines "currently assert the answer
   contains '$100K TVL floor' — update them to the new truth." On inspection,
   that assertion is on the `tp-answer`/`cp-answer` **direct-answer block**
   (`tcpAnswer`), not the FAQ safety answer (`tcpFaqA3`). `tcpAnswer`'s
   sentence ("...among N pools above the $100K TVL floor. Rates are live
   from DefiLlama and exclude anomalous...") is a true, page-scoped statement
   — it does not attribute the floor to "DeFi Garden's trust filters" as a
   safety guarantee, which was the actual defect identified in spec 174's
   evidence section and in this build-loop item's own scoped instruction
   ("Make `tcpFaqA3` and `tcpTrustNote` FUNCTIONS... " — two keys, not
   `tcpAnswer`). Changing `tcpAnswer` to interpolate `MIN_POOL_TVL` too would
   have been reasonable defensive hardening, but it is scope creep beyond
   "Implement EXACTLY the plan below." I left `tcpAnswer` untouched; the test
   at that line still passes unmodified (verified: `node test_token_pages.js`
   / `node test_chain_pages.js`, 0 failures on that assertion). Flagging this
   explicitly so a human/verifier can decide whether `tcpAnswer` should be a
   follow-up item (its `$100K TVL floor` / `$100K TVL 기준` phrasing across
   `tcpAnswer`, `tcpFaqA2`, `tcpSubLine`, `tcpTokenIntro`, `tcpChainIntro`,
   `tcpTokenDescription`, `tcpChainDescription`, `tcpDatasetTokenDescription`,
   `tcpDatasetChainDescription`, `tcpTokenHubIntro`, `tcpChainHubIntro` is
   still a hardcoded literal, not interpolated from `MIN_POOL_TVL` — all
   *true, page-scoped statements*, none of which attribute the floor to
   "DeFi Garden's trust filters" as a safety claim, so none carry 174's P1
   defect, but all share the literal-vs-constant smell item 159 flagged).

2. **The pre-existing "returns null ... blended MEDIAN rounds to 0.00%, even
   with a non-zero pool present" test in both files was replaced, not kept
   alongside new tests.** Its fixture (`[0%, 0%, 5%]` pools) exercised exactly
   the behavior spec 174 requires changing: post-fix, the 5% pool alone gets
   blended (median of one non-zero pool = 5%, not null). Keeping the old
   assertion verbatim would have pinned down the pre-174 (defective)
   behavior forever. It was replaced with two tests per file: an all-zero-
   pools case (still correctly `null`) and a mixed zero/non-zero case with an
   exact expected blended value (the new required regression test).

## Red→green non-vacuity proof

Commands run in order:
```
git stash push -- generate-token-pages.js generate-chain-pages.js translations.js translations.min.js
node test_token_pages.js 2>&1 | grep -E "✗|assertions passed"
node test_chain_pages.js 2>&1 | grep -E "✗|assertions passed"
```
Output (RED, source at pre-174 state):
```
  ✗ 174: a zero-APY pool mixed with real pools is excluded from the blend — exact expected value from a fixture
  ✗ 174: FAQ "Are these rates safe?" answer cites the real MIN_POOL_TVL floor and never says "trust filters" (EN)
  ✗ 174: FAQ safety answer changes when MIN_POOL_TVL changes (interpolated, never a re-typed literal)
  ✗ 174: FAQ safety answer cites the real USD floor and never says 신뢰 기준 (trust criteria) as the safety guarantee (KO)
  ✗ 174: tcpTrustNote footer note is likewise interpolated from the floor, not "trust filters" (EN + KO)
  ✗ 174: rankTopTokens excludes 0.00%-APY rows from the displayed table and backfills a real-yield pool ranked beyond POOLS_PER_PAGE
89 assertions passed
===CHAIN===
  ✗ 174: a zero-APY pool mixed with real pools is excluded from the blend — exact expected value from a fixture
  ✗ 174: FAQ "Are these rates safe?" answer cites the real MIN_POOL_TVL floor and never says "trust filters" (EN)
  ✗ 174: FAQ safety answer changes when MIN_POOL_TVL changes (interpolated, never a re-typed literal)
  ✗ 174: FAQ safety answer cites the real USD floor and never says 신뢰 기준 (trust criteria) as the safety guarantee (KO)
  ✗ 174: tcpTrustNote footer note is likewise interpolated from the floor, not "trust filters" (EN + KO)
  ✗ 174: rankTopChains excludes 0.00%-APY rows from the displayed table and backfills a real-yield pool ranked beyond POOLS_PER_PAGE
80 assertions passed
```
(6 new/updated assertions RED per file — the "all rail-passing pools
visibly zero → null" and "no 0.00% row across the shared fixture" assertions
were already true pre-fix for those particular fixtures, as expected — they
still assert the invariant going forward.)

Then:
```
git stash pop
node test_token_pages.js 2>&1 | grep -E "✗|assertions passed"
node test_chain_pages.js 2>&1 | grep -E "✗|assertions passed"
```
Output (GREEN, source restored):
```
95 assertions passed
===CHAIN===
86 assertions passed
```
Zero failures in either file.

## Exact test commands + results

```
node test_token_pages.js && node test_chain_pages.js && node test_translations_fallback.js \
  && node test_i18n_pages.js && node test_seo_cta_render.js && node test_seo_cta_targets.js \
  && node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
```
- `test_token_pages.js` — 95 assertions passed.
- `test_chain_pages.js` — 86 assertions passed.
- `test_translations_fallback.js` — 8 assertions passed (includes the
  `planner.min.js` re-minify idempotence check — unaffected, `planner.js`
  untouched).
- `test_i18n_pages.js` — 19 assertions passed (en/ko parity, hreflang,
  pool-parity — all pass unchanged).
- `test_seo_cta_render.js` — 2/2 passed.
- `test_seo_cta_targets.js` — **fails**: "8 of 2205 pages have a dead
  primary CTA" (ANSEM/ASTRA/CKES/HARRIS/JYAI/MCDULL/SWAG/XVG token pages).
  **Pre-existing, not caused by this change** — reproduced identically after
  `git stash` (source at pre-174 state): same 8 pages, same failure. This is
  item 173's territory ("The dead CTAs on the same pages → item 173"),
  explicitly out of scope for 174. Evidence: ran `git stash` (stashing all 6
  changed files), re-ran `node test_seo_cta_targets.js` — identical 8 dead
  CTAs, identical failure — then `git stash pop` to restore.
- `test_planner.js` — 208 assertions evaluated, all green (`planner.js`
  untouched; this test doesn't touch the SEO generators).
- `test_protocol_parsing.js` — 9/9 passed.
- `test_qualifier_fix.js` — 9/9 passed.

Also ran, per the task's grep instruction:
```
grep -rn "trust filters" --include=*.js .
```
Remaining hits are all either (a) the new explanatory code comments in
`translations.js` documenting *why* the old string was wrong, or (b) test
assertion messages/test-name strings in `test_token_pages.js`/
`test_chain_pages.js` (including the new 174 tests, whose names/messages
necessarily mention the phrase to assert its absence) — no live copy string
still contains it. `test_token_pages.js:380` / `test_chain_pages.js:340`
still carry the *pre-existing* assertion-failure message text "answer must
disclose the trust filters" (English prose, not a copy string under test —
see deviation #1 above for why that assertion itself was left alone).

Also confirmed:
- `git diff app.js` / `git diff planner.js` — both empty. `DEFAULT_MIN_TVL`
  and `APY_SANITY_LIMIT` in `app.js`, and the degen haircut / rails in
  `planner.js`, are byte-untouched.
- `MIN_POOL_TVL`'s value (100000) in `generate-token-pages.js` is unchanged
  (only its *usage* — passed through `formatUsd` into the two translation
  calls, and used to filter the display-pools slice — changed).
- `node test_hub_pages.js` — 42 assertions passed (hub/A–Z pages also call
  `tcpTrustNote`, now with the floor argument — unaffected).

## Pre-existing failures found and NOT caused by this change

- `test_seo_cta_targets.js`: 8/2205 dead primary CTAs (item 173's scope).
  Verified pre-existing via `git stash` / re-run / `git stash pop` (see
  above) — identical failure before and after this diff.

No other pre-existing failures were observed in the required test list.

## What was NOT done (explicitly out of scope, per the plan)

- `tokens/`, `chains/`, `ko/`, sitemap, and llms output were not regenerated
  — orchestrator's job.
- `MIN_POOL_TVL`'s value was not changed (human decision, flagged in spec
  174.md's "Open questions").
- No new dependencies were added.

---

## Round 2 (coordinator follow-up): zero re-typed "$100K" literals anywhere

The coordinator correctly flagged that deviation #1 above under-scoped the
fix: spec 174's acceptance criterion 2 is literally "no re-typed literal
anywhere in the templates," and 11 more `tcp*` keys still hardcoded `$100K`
(several also attributing the floor to "DeFi Garden" — the same 100x-false
pattern as `tcpFaqA3`/`tcpTrustNote`, just not phrased as a direct answer to
"is this safe?"). This round fixes all of them. Deviation #1 above is
**superseded** by this round — `tcpAnswer` and the rest are now parameterized
too.

### What changed, and where (round 2)

`translations.js` — every one of these EN keys (and its KO counterpart, same
file) converted to take `floorStr` as its last parameter, with the literal
`$100K`/`100K` text replaced by `${floorStr}`. Where the sentence attributed
the floor to "DeFi Garden" as a whole, it was re-scoped to "this page" /
dropped the "our"/"DeFi Garden's" possessive (matching round 1's
`tcpFaqA3`/`tcpTrustNote` fix):
- `tcpTokenDescription` (line 627 EN / 1329 KO), `tcpChainDescription` (629 /
  1331) — "above the `${floorStr}` TVL floor" (was already page-scoped, no
  attribution change needed, just interpolation).
- `tcpTokenIntro` (631 / 1333), `tcpChainIntro` (633 / 1335) — "clear DeFi
  Garden's `$100K` TVL floor" → "clear this page's `${floorStr}` TVL floor" /
  KO "DeFi Garden의 `$100K` TVL 기준" → "이 페이지의 `${floorStr}` TVL 기준".
- `tcpSubLine` (637 / 1339) — "above the `${floorStr}` TVL floor".
- `tcpDatasetTokenDescription` (674 / 1369), `tcpDatasetChainDescription`
  (676 / 1371) — "filtered by a `${floorStr}` TVL floor" (page-scoped
  already; interpolation only).
- `tcpAnswer` (683 / 1378, the `tp-answer`/`cp-answer` direct-answer block —
  the exact key deviation #1 flagged) — "above the `${floorStr}` TVL floor".
- `tcpFaqA2` (689 / 1384) — "clear DeFi Garden's `$100K` TVL floor" → "clear
  this page's `${floorStr}` TVL floor" / KO "DeFi Garden의 `$100K` TVL 기준"
  → "이 페이지의 `${floorStr}` TVL 기준".
- `tcpTokenHubIntro` (709 / 1398), `tcpChainHubIntro` (717 / 1406) — converted
  from plain strings to `(floorStr) => ...` functions; "filtered through our
  `$100K` floor" → "filtered through a `${floorStr}` TVL floor" / KO
  "`$100K` 기준" → "`${floorStr}` TVL 기준".

Call sites (both generators introduce ONE `const floorStr =
formatUsd(MIN_POOL_TVL);` per render function, reused by every `t(...)` call
in that function — never a second computation):
- `generate-token-pages.js`: `buildAnswerAndFaq` (shared, ~line 635-654) now
  computes `floorStr` once and passes it to `tcpAnswer` and `tcpFaqA2`.
  `renderTokenPage` computes its own `floorStr` and passes it to
  `tcpTokenDescription`, `tcpTokenIntro`, `tcpDatasetTokenDescription`,
  `tcpSubLine`. `renderTokenHubPage`/`renderTokenAzPage` pass
  `formatUsd(MIN_POOL_TVL)` directly to `tcpTokenHubIntro`.
- `generate-chain-pages.js`: `renderChainPage` computes its own `floorStr`,
  passed to `tcpChainDescription`, `tcpChainIntro`,
  `tcpDatasetChainDescription`, `tcpSubLine`. `renderChainHubPage` passes
  `formatUsd(MIN_POOL_TVL)` directly to `tcpChainHubIntro`.

`translations.min.js` regenerated again via `node minify-assets.js` (only
this file changed in the re-run; all other `.min.*` outputs byte-identical).

### Proof: zero remaining literals

```
$ grep -n '100K' translations.js generate-token-pages.js generate-chain-pages.js
translations.js:692:    // $100K minimum TVL...", stated as an answer to "Are these rates safe?".
translations.js:693:    // That attributed the PAGE's own $100K listing floor to the product's
translations.js:707:    // 174: "a ${floorStr} TVL floor", not "our $100K floor" — the floor is
translations.js:1397:    // 174: "${floorStr} TVL 기준" — "$100K 기준"으로 다시 적지 않아요.
generate-token-pages.js:59:// only real, non-anomalous pools — just down to a $100K floor, any count >= 1.
generate-token-pages.js:60:const MIN_POOL_TVL = 100000;      // $100K eligibility floor for a page's pools
generate-chain-pages.js:65:    if (!isQualifyingPool(p)) return; // trust rail + $100K floor, one gate
```
Every remaining hit is a `//` code comment or the `MIN_POOL_TVL = 100000`
declaration line itself — zero occurrences in any template string, in either
language.

### New committed regression: scratch-run non-vacuity (mirrors the verifier's own method)

Spec 174's acceptance criterion 2 says the verifier proves this "by changing
the constant in a scratch run and observing the copy change with it." Added
that exact mechanism as a committed test in both `test_token_pages.js` and
`test_chain_pages.js`:
- A `loadScratchGenerators(newFloor)` helper writes patched **copies** of
  `generate-token-pages.js`/`generate-chain-pages.js` to a fresh
  `fs.mkdtempSync(os.tmpdir())` directory — source text, with every relative
  `require('./x.js')` rewritten to an absolute path (so the copies still
  resolve `translations.js`/`planner.js`/`generate-sitemap.js`/etc. from the
  real project dir) and `const MIN_POOL_TVL = 100000;` literally replaced
  with `const MIN_POOL_TVL = 250000;` — then `require()`s those copies fresh
  (never the cached real modules, via a unique temp path each run).
- The new test (`174: mutating MIN_POOL_TVL in a scratch run moves EVERY
  floor mention on token + chain + hub pages, with zero stale $100K
  literal`, one in each test file, checking all 4 page types from both
  directions — token file checks token+chain+both hubs, chain file checks
  chain+token+both hubs) renders a real token page, chain page, token hub
  page, and chain hub page from the patched modules and asserts each
  contains `formatUsd(250000)` (`"$250K"`) and contains **zero** occurrences
  of `"$100K"`.
- Cleanup (`cleanupScratch`): clears the temp modules from `require.cache`
  and `fs.rmSync(scratchDir, { recursive: true, force: true })` in a
  `finally` block, so the scratch dir never survives the test run (verified
  empty via `ls /tmp | grep dg-174-scratch` after the full run — nothing
  found).

### Red→green non-vacuity proof (round 2)

```
$ git stash push -- generate-token-pages.js generate-chain-pages.js translations.js translations.min.js
$ node test_token_pages.js 2>&1 | grep -E "✗|assertions passed"
  ✗ 174: mutating MIN_POOL_TVL in a scratch run moves EVERY floor mention on token + chain + hub pages, with zero stale $100K literal
95 assertions passed
$ node test_token_pages.js 2>&1 | grep -A3 "✗ 174: mutating"
  ✗ 174: mutating MIN_POOL_TVL in a scratch run moves EVERY floor mention on token + chain + hub pages, with zero stale $100K literal
    token page must not retain the stale $100K literal once the constant changes
$ git stash pop
$ node test_token_pages.js 2>&1 | grep -E "✗|assertions passed"
96 assertions passed
```
Same sequence for the chain-file test:
```
$ git stash push -- generate-token-pages.js generate-chain-pages.js translations.js translations.min.js
$ node test_chain_pages.js 2>&1 | grep -E "✗|assertions passed"
  ✗ 174: mutating MIN_POOL_TVL in a scratch run moves EVERY floor mention on chain + token + hub pages, with zero stale $100K literal
86 assertions passed
$ git stash pop
$ node test_chain_pages.js 2>&1 | grep -E "✗|assertions passed"
87 assertions passed
```
RED against the round-1 (post-round-1-but-pre-round-2) source, GREEN after
restoring the round-2 fix, confirmed both directions.

### Re-run test commands + results (round 2, coordinator's list)

```
node test_token_pages.js && node test_chain_pages.js && node test_hub_pages.js \
  && node test_translations_fallback.js && node test_i18n_pages.js \
  && node test_seo_shared_source.js && node test_llms_rails.js \
  && node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
```
- `test_token_pages.js` — 96 assertions passed.
- `test_chain_pages.js` — 87 assertions passed.
- `test_hub_pages.js` — 42 assertions passed.
- `test_translations_fallback.js` — 8 assertions passed.
- `test_i18n_pages.js` — 19 assertions passed.
- `test_seo_shared_source.js` — 20 assertions passed (includes the "no stray
  repo artifact written" guardrail — confirms this round's scratch-run
  harness, which writes to `os.tmpdir()`, leaves no trace in the repo tree).
- `test_llms_rails.js` — 14 assertions passed (llms.txt/llms-full.txt rails
  — untouched by this item, confirmed still green).
- `test_planner.js` — 208 assertions evaluated, all green.
- `test_protocol_parsing.js` — 9/9 passed.
- `test_qualifier_fix.js` — 9/9 passed.

Each command run individually, none exceeded ~10s (well under the 5-minute
timebox).

### Hard constraints re-verified (round 2)

```
$ git diff --name-only app.js planner.js
(empty)
$ git status --short
 M generate-chain-pages.js
 M generate-token-pages.js
 M test_chain_pages.js
 M test_token_pages.js
 M translations.js
 M translations.min.js
```
`app.js`/`planner.js` byte-identical; `tokens/`/`chains/`/`ko/`/sitemaps
untouched; no new dependencies.

### Background jobs

An exploratory full `npm test` (`node run-tests.js`) was kicked off in the
background during round 1 for extra assurance beyond the required list; it
self-terminated (its own `timeout 300` wrapper) before round 2 began. Checked
before finishing: `jobs -l` empty, `ps aux | grep -i run-tests` empty, no
`node`/`chrome`/`chromium` processes owned by this session, no leftover
`dg-174-scratch-*` or other temp dirs under `/tmp`. The tree is static.
