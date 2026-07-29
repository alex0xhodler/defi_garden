# Notes: item 173 — dead SEO CTAs

## Summary of the change

Exactly two PRODUCT-SOURCE lines changed, both reading the existing
`MIN_POOL_TVL` constant (never re-typed — the 159 rule). Other files in the
diff — two new tests, four assertions in two pre-existing tests, one
`package.json` script-wiring line, and the regenerated SEO surface — are
itemised under Deviations below; "two lines" describes the generator change
only, not the whole diff:

- `generate-token-pages.js:673` —
  `const appUrl = \`${SITE_URL}/?token=${encodeURIComponent(rec.symbol)}\`;`
  → `const appUrl = \`${SITE_URL}/?token=${encodeURIComponent(rec.symbol)}&minTvl=${MIN_POOL_TVL}\`;`
- `generate-chain-pages.js:149` —
  `const appUrl = \`${SITE_URL}/?chain=${encodeURIComponent(rec.chain)}\`;`
  → `const appUrl = \`${SITE_URL}/?chain=${encodeURIComponent(rec.chain)}&minTvl=${MIN_POOL_TVL}\`;`

`categoryLinksFor()` and `poolHrefFor()`'s no-id fallback both build off `appUrl`,
so they inherit `&minTvl=100000` automatically — no second injection site, per
territory note 4.

## Deviations from the literal spec, and why (conservative choices)

1. **Two pre-existing unit tests needed updating, not just the two new test
   files.** `test_token_pages.js` and `test_chain_pages.js` each had two
   assertions that hardcoded the OLD exact CTA/fallback-link href string
   (e.g. `href="https://www.defi.garden/?token=BIG&poolTypes=Lending"` and
   `href="https://www.defi.garden/?token=X"` for the no-pool-id fallback).
   Once `appUrl` carries `&minTvl=100000`, those exact strings no longer
   appear (the real string is now
   `...?token=BIG&minTvl=100000&poolTypes=Lending`, etc.), so the assertions
   failed — a real regression I discovered only by running the mandated
   test list, not something the spec anticipated. I updated all 4 assertions
   (2 per file) to interpolate `gen.MIN_POOL_TVL` rather than hardcoding
   `100000` a second time, keeping the 159 rule's spirit. This is the only
   place I touched test files beyond writing the two new ones; it was
   necessary to keep `test_token_pages.js`/`test_chain_pages.js` green as the
   spec's own step 5 requires. Diff: `test_token_pages.js` +9/-2,
   `test_chain_pages.js` +11/-2.
2. **`test_seo_cta_targets.js`'s RED run reported ALL 2,200 pages as
   "dead" (missing `minTvl`), not exactly 1,749.** This is a stronger,
   more conservative RED signal than the spec's own 1,749 baseline: the test
   asserts BOTH that the CTA carries `minTvl=<MIN_POOL_TVL>` AND that it
   returns ≥1 live pool. Pre-fix, 100% of pages fail the first assertion (no
   page had `minTvl` at all), so the test correctly fails loudly on all 2,200
   — a superset of the 1,749 that were actually zero-result at the app's true
   default floor. I added a secondary diagnostic line to the RED transcript
   that separately computes, for each pre-fix page, what the app's ACTUAL
   effective floor (`$10,000,000`, mirroring `app.js:801` `DEFAULT_MIN_TVL`,
   used ONLY inside the test for this modeling, never re-typed into either
   generator file) resolves the bare link to — this reproduced the spec's own
   number almost exactly (1,750 vs. 1,749 measured the day before; the 1-pool
   difference is normal live-data drift between two independent live fetches
   a day apart, not a test defect).
3. **Sampled the FAQ/description-prose claim differently per page type** —
   used a small ad-hoc one-off Node script (not committed) to regex-extract
   each page's claimed pool count and compare it to a live recount, rather
   than folding this into the committed test file, since the acceptance
   criterion only asks for "at least 3 sampled pages" reported in this notes
   file, not a fourth committed test.
4. **`npm install` was required** before `npm run tokens`/`npm run chains`
   would run (missing `@napi-rs/canvas` etc. — this is a normal dependency
   install for a repo whose `node_modules` was never populated in this
   sandbox, not a code change). Also required `NODE_PATH=/opt/node22/lib/node_modules`
   to run the Playwright tests, since `playwright` is installed globally at
   `/opt/node22/lib/node_modules/playwright` rather than in the project's own
   (now-installed) `node_modules` — this matches how `test_minttvl_clean_url.js`
   and other existing Playwright tests in this repo must already be run; not
   a new requirement I introduced.
5. **72 files show as deleted (`D`) in `git status`, split evenly across
   `tokens/`/`ko/tokens/`.** This is natural churn from re-fetching LIVE
   DefiLlama data at regen time (some tokens' qualifying-pool set shifted
   below the $100K floor or their eligible pool count/rank changed between
   this run and the last commit) — it is not caused by the 2-line `appUrl`
   fix, which only changes the string built inside `appUrl`. Confirmed by the
   git diff of the two source files showing exactly 2 changed lines total.
6. **Did not execute `test_analytics_fires.js`, `test_i18n_pages.js`, or
   `test_og_images.js`** (all three also call `renderTokenPage`/
   `renderChainPage`) even though they are not in the spec's mandated test
   list, to respect the "do NOT run the whole `npm test` chain" instruction.
   I did grep all three for hardcoded `href="https://www.defi.garden/?token=`
   / `?chain=` literals and found none — so they are unlikely to be affected
   by the `appUrl` shape change — but this is a static grep, not an executed
   proof, and I am flagging that distinction rather than claiming a green I
   did not observe.
7. **`package.json` was edited — added by the operator after the verifier
   caught it as an UNDISCLOSED deviation (verifier FAIL, attempt 1).** The
   two new test files were spliced into the `test:serial` chain (after
   `test_chain_pages.js`, before `test_sitemap_xml.js`) so they actually run
   under `npm test` — a test the merge gate never executes is not a gate.
   That edit was made during the build but never written down, while the
   summary above said "exactly two source lines changed", so the record
   contradicted the diff. NORTH_STAR lists `package.json` as an explicit
   HIGH/config-infra trigger, which is exactly why it must be disclosed
   rather than assumed benign. **Scope of the edit, re-derived from
   `git diff -- package.json`: ONE line changed** — the `test:serial` value —
   inserting `&& node test_seo_cta_targets.js && node test_seo_cta_render.js`.
   No dependency added, removed or version-bumped; `dependencies`/
   `devDependencies` byte-identical. The failure was the missing disclosure,
   not the change. Recorded here rather than silently patched, per the 166
   precedent (a claim written ahead of the fact it asserts is still false
   when read).

## Verification history

- **Attempt 1 — verifier FAIL.** 9/9 acceptance criteria met and independently
  re-derived (red→green reproduced in a clean `origin/main` worktree; the fix
  additionally mutation-tested by stripping `&minTvl=100000` from a live page
  and confirming the test caught it; 2 sampled pages matched their prose
  claims exactly; rail bytes confirmed identical; the 24 dropped token pages
  independently traced to genuine drop-below-floor churn in live data, not
  code-caused de-indexing). Sole failure: deviation 7 above — the
  `package.json` edit was absent from these notes. Risk tier HIGH, assigned
  independently, agreeing with the builder's guess.
- **Attempt 2** — notes corrected (deviation 7 + this section + the summary's
  scope wording); no product code, test, or generated file changed between
  attempts. Re-submitted for verification.

## Red -> Green non-vacuity proof (155 precedent)

**RED — `test_seo_cta_targets.js` run against the CURRENT (pre-change)
`tokens/`/`chains/` output**, before either source edit was regenerated:

```
$ node test_seo_cta_targets.js
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 16036 pools)
  scanned 2200 pages (0 skipped — no app-bound primary CTA found)
  pages missing minTvl=100000 on the primary CTA: 2200
    of those, pages whose CTA resolves to 0 live pools at the APP'S ACTUAL default floor today ($10,000,000): 1750 (specs/173.md measured 1,749)
  dead CTAs (0 live pools OR missing minTvl): 2200 / 2200

  First 15 dead CTAs:
    ✗ tokens/00.html — minTvl=null (expected 100000); app resolves this link to minTvl=10000000 today, returning 0 live pool(s) — https://www.defi.garden/?token=00
    ✗ tokens/01.html — minTvl=null (expected 100000); app resolves this link to minTvl=10000000 today, returning 0 live pool(s) — https://www.defi.garden/?token=01
    ✗ tokens/0x0.html — minTvl=null (expected 100000); app resolves this link to minTvl=10000000 today, returning 0 live pool(s) — https://www.defi.garden/?token=0X0
    [... 12 more, all the same shape ...]

✗ FAIL: 2200 of 2200 pages have a dead primary CTA
```

(1,750 vs. the spec's measured 1,749 — a 1-pool difference from live-data
drift between two independent fetches roughly a day apart; not a test bug.)

**GREEN — after the 2-line fix, `npm install`, and the full regen** (tokens,
chains, sitemap, generate:llms, generate-stories):

```
$ node test_seo_cta_targets.js
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 16033 pools)
  scanned 2217 pages (0 skipped — no app-bound primary CTA found)
  pages missing minTvl=100000 on the primary CTA: 0
  dead CTAs (0 live pools OR missing minTvl): 0 / 2217

✓ PASS: 0 dead CTAs out of 2217 pages checked (2217 scanned, 0 skipped)
```

Page-count note: 2,217 scanned post-regen vs. 2,200 pre-regen — this is the
2,130 tokens + 87 chains (index.html excluded from each) at the moment of
this run's live fetch, vs. the committed 2,112 tokens + 88 chains baseline;
normal token/chain-set churn from live data between runs (see deviation #5),
not related to the fix's correctness.

## Before / after dead-CTA counts

| state | pages scanned | dead CTAs |
|---|---|---|
| pre-change (committed `tokens/`/`chains/`) | 2,200 | **2,200** (all missing `minTvl`; 1,750 also resolve to 0 live pools at the app's real default floor today) |
| post-change (regenerated `tokens/`/`chains/`) | 2,217 | **0** |

## Sample verification (>= 3 pages, live count vs. page's own claim)

Computed via a live DefiLlama fetch (16,033 pools) against the regenerated
pages, using the same qualification the app applies (`tvlUsd >= minTvl`,
`tvlUsd > 0`, chain exact-match / token substring-match per `app.js`'s
`symbolMatchesToken`):

| page | page's own prose claim | CTA target's live count | match? |
|---|---|---|---|
| `chains/cardano.html` | "33 live pools on Cardano" | 33 | **MATCH** |
| `chains/celo.html` | "15 live pools on Celo" | 15 | **MATCH** |
| `tokens/1inch.html` | "17 live 1INCH pools" | 17 | **MATCH** |
| `tokens/buidl.html` | "9 live BUIDL pools" | 9 | **MATCH** |

All 4 sampled pages (one more than the required minimum of 3) match exactly.

## Rail-integrity proof

```
$ grep -c "10000000" generate-token-pages.js generate-chain-pages.js
generate-token-pages.js:0
generate-chain-pages.js:0
```
(0/0 both before and after the change — the literal `10000000` never appears
in either generator file, pre- or post-change.)

```
$ git diff -- app.js canonical.js
(empty output — byte-identical)
```

```
$ git diff --stat -- generate-token-pages.js generate-chain-pages.js
 generate-chain-pages.js | 2 +-
 generate-token-pages.js | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```

Exactly 2 lines changed across the 2 in-scope generator files. `DEFAULT_MIN_TVL`
and `APY_SANITY_LIMIT` in `app.js` are untouched (confirmed by the empty
`git diff` above); no trust rail was weakened.

## Tests run, exact commands and real output

All run under the 5-minute-per-test timebox; none needed anywhere close to it.

```
$ node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
...
All 208 assertions evaluated.
9/9 passed
9/9 passed
```
(all three green, no failures — exit 0)

```
$ node test_token_pages.js
88 assertions passed
```
(exit 0 — green only AFTER the two stale-assertion fixes described in
deviation #1 above; first run showed 1 failure, "missing category link",
traced to the pre-existing hardcoded href literal, not a defect in the
173 fix itself)

```
$ node test_chain_pages.js
79 assertions passed
```
(exit 0 — same category of stale-assertion fix needed, described above)

```
$ node test_sitemap_xml.js
✅ test_sitemap_xml: 25 passed, 0 failed
```

```
$ node test_canonical.js
All 24 assertions evaluated.
```
(exit 0, no failures)

```
$ node test_llms_link_integrity.js
24 assertions passed
```
(exit 0)

```
$ node test_seo_cta_targets.js
✓ PASS: 0 dead CTAs out of 2217 pages checked (2217 scanned, 0 skipped)
```

```
$ NODE_PATH=/opt/node22/lib/node_modules node test_seo_cta_render.js
      (3 Cardano pool cards rendered at minTvl=100000)
  ✓ /?chain=Cardano&minTvl=100000 (the fixed CTA) renders >=1 pool card
      (0 primary pool cards rendered — Cardano's pools are all below the $10M default floor)
  ✓ bare /?chain=Cardano (pre-fix CTA shape) renders zero PRIMARY pool cards (empty state)

2/2 passed
```

```
$ NODE_PATH=/opt/node22/lib/node_modules node test_minttvl_clean_url.js
      (settled search="?token=USDC")
  ✓ /?token=USDC does not pin minTvl=10000000 into the settled URL
      (4 USDC pool cards rendered)
  ✓ bare /?token=USDC still renders pools >= $10M (default floor intact)
      (settled search="?token=USDC&minTvl=50000")
  ✓ /?token=USDC&minTvl=50000 keeps the non-default floor in the settled URL

3/3 passed
```

Every test on the spec's mandated list (step 5) passed, with real output
captured above — no test was skipped or assumed.

## What I could NOT verify (honest disclosure)

- Did not execute `test_analytics_fires.js`, `test_i18n_pages.js`, or
  `test_og_images.js` — all three call `renderTokenPage`/`renderChainPage`
  but are outside the spec's mandated test list, and running the full
  `npm test` chain was explicitly out of scope for this timebox. A static
  grep for hardcoded `?token=`/`?chain=` href literals in those three files
  found none, suggesting low risk, but this is not an executed proof.
- Did not attempt to reproduce the heartbeat's exact prod query
  (`query_id 471e380a`, `page_view`s on `/tokens/*`/`/chains/*` in the last 7
  days) — no access to that analytics backend from this environment. The
  measurement plan in specs/173.md (traffic-gated, ≥30 events) is a
  post-deploy read the operator/heartbeat will need to perform later.
- `test_seo_cta_targets.js`'s primary-CTA extraction relies on a regex
  (`class="(?:tp|cp)-cta" href="..."` filtered to hrefs containing
  `token=`/`chain=`) rather than a full HTML parser. It correctly
  distinguishes the app-bound primary CTA from the sibling waitlist CTA
  (same CSS class, different href) across all 2,217 regenerated pages with
  zero pages skipped, but a structural HTML change to how the CTA is marked
  up in the future could silently make this extraction miss pages — noting
  this as a known limitation, not a defect observed today.

## Flag for the human (per spec's "Open questions")

Per specs/173.md's own open question: the judgment call of whether generated
pages should instead be rebuilt at the app's $10M floor (fewer, richer
pages) rather than the app matching the page's $100K floor was explicitly
NOT revisited here — this item implements the settled 2026-07-11 direction
(the page's own $100K pool set is authoritative; the link must reproduce it).
If the human wants to reconsider that direction, it's a separate, bigger
call, flagged here per instruction, not decided by this change.

Also carrying forward territory notes 1 and 2 (perf trade-off: these
landings now always take the `loadLive()` path, losing the instant-snapshot
fast render; and the new `?token=X&minTvl=100000` canonical variant per
`canonical.js`'s `CANONICAL_PARAMS` including `minTvl`) — both already
appended verbatim to `specs/173.md`'s Territory notes section as instructed.
