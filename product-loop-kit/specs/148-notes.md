# Spec 148 — build notes

## 1. Code change

`isValidToken()` in `generate-token-pages.js` (~line 82) and `generate-sitemap.js`
(~line 132) both now layer two rejection rules on top of the existing
`TOKEN_REGEX`:
- `PURE_NUMERIC_REGEX = /^[0-9]+$/` — kills `00`, `01`, `67`, `2027`, `20261231`.
- `DATE_FRAGMENT_REGEX = /^[0-9]{1,2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[0-9]{2,4}$/i`
  — kills Pendle-style expiry fragments like `22OCT2026`, `16SEP26`.

Both files carry a comment pointing at the other as its mirror (the existing
convention at `generate-token-pages.js:70`). `generate-sitemap.js` now also
exports `isValidToken` (it wasn't exported before this change) so it's
directly testable. `generate-chain-pages.js` still imports `isValidToken`
from `generate-token-pages.js` — no third copy was added.

No trust rail touched: `MIN_POOL_TVL`, `APY_SANITY_LIMIT`,
`MIN_QUALIFYING_POOLS`, `tokenSlug`, `tokenSymbols` are byte-identical to
before this diff.

## 2. Non-vacuity proof (stash cycle)

Stashed ONLY the two source files, kept the new test:

```
$ git stash push -m "148: stash source-only for non-vacuity check" -- generate-sitemap.js generate-token-pages.js
$ node test_token_slug_validity.js; echo "EXIT CODE: $?"
```

RED (pre-change predicate) — representative failures:
```
isValidToken (generate-token-pages.js) — negative list (date fragments / pure-numeric)
  ✗ rejects "8OCT2026"
    generate-token-pages.js: isValidToken("8OCT2026") should be false
    true !== false
  ... (all 15 negative-list cases fail on generate-token-pages.js)

isValidToken (generate-sitemap.js) — negative list (date fragments / pure-numeric)
  ✗ rejects "8OCT2026"
    isValidToken is not a function
  ... (generate-sitemap.js didn't even export isValidToken pre-change)

End-to-end — rankTopTokens() never mints a page for the expiry-date fragment
  ✗ ranked symbols do NOT include the expiry-date fragment 22OCT2026
    expiry-date fragment leaked into rankTopTokens output: ["USDC","PT","SUSDE","22OCT2026"]

19 assertions passed
EXIT CODE: 1
```

Restored the fix:
```
$ git stash pop
$ node test_token_slug_validity.js; echo "EXIT CODE: $?"
```

GREEN:
```
... all 66 assertions passed
66 assertions passed
EXIT CODE: 0
```

Non-vacuity proven on all three axes the test covers: the negative list on
BOTH mirrors, and the end-to-end `rankTopTokens()` leak check.

## 3. Regenerated SEO surface — controlled, CI-identical pipeline

Fixture fetched once, isolated: `node generate-pools-snapshot.js --out $S/data
--seo-out $S/seo-pools.json` → 16,087 pools fetched live, 16,022 pools ≥
$1,000 TVL written to the SEO transient (`$S/seo-pools.json`).

**Baseline** (`git worktree add $S/wt-base origin/main`, run inside the
isolated worktree with the shared fixture — a `node_modules` symlink from the
repo root was added first so the worktree could load `@napi-rs/canvas` for OG
image generation):
```
node generate-token-pages.js --out tokens --sitemap sitemap-token-pages.xml --fixture $S/seo-pools.json
🏆 Top 2081 tokens by TVL (>= 1 qualifying pools each)
🗺️  Wrote sitemap-token-pages.xml (2109 URLs)   # 2081 tokens + 1 hub + 27 A–Z
```
KO variants land at `$S/wt-base/ko/tokens/` — confirms why this must run in
an isolated worktree, not the repo tree (would otherwise write into the
repo's committed `ko/`).

**Fixed** (repo working tree, same fixture, same flags):
```
node generate-token-pages.js --out tokens --sitemap sitemap-token-pages.xml --fixture $S/seo-pools.json
🏆 Top 2074 tokens by TVL (>= 1 qualifying pools each)
🗺️  Wrote sitemap-token-pages.xml (2102 URLs)   # 2074 tokens + 1 hub + 27 A–Z
node generate-chain-pages.js --out chains --sitemap sitemap-chain-pages.xml --fixture $S/seo-pools.json
🏆 87 chains (>= 1 qualifying pool each)          # chain count unaffected — isValidToken is a token-only gate
POOLS_FIXTURE=$S/seo-pools.json node generate-sitemap.js
POOLS_FIXTURE=$S/seo-pools.json node generate-llms.js
```

**Measured controlled delta** (`<loc>` slug sets of `sitemap-token-pages.xml`,
baseline vs fixed, same fixture both sides):
- Baseline: **2109** `<loc>` (2081 tokens + hub + 27 A–Z)
- Fixed: **2102** `<loc>` (2074 tokens + hub + 27 A–Z)
- **Dropped slugs (exactly 7)**: `00`, `01`, `17dec2026`, `20261231`, `2027`,
  `67`, `8oct2026` — every one date-shaped or pure-numeric, matching the
  spec's evidence table exactly (`8OCT2026`, `17DEC2026`, `2027`, `20261231`,
  `00`, `01`, `67`).
- **Added slugs: EMPTY** (`comm -13` of the two sorted slug sets returns
  nothing). The predicate change added zero new pages, removed junk only —
  no real ticker was dropped by the regex. This is the controlled,
  churn-free measurement the spec's acceptance criterion means by "drops by
  exactly the number of rejected slugs and by no more."

## 4. Orphan prune (step 3e) — and why the 19 daily-TVL-churn pages were
left as the real regen produced them

Wrote a throwaway predicate-driven checker in the scratchpad (not committed)
that, for every `tokens/*.html` and `ko/tokens/*.html`, recovers the symbol
from the rendered `<h1>SYMBOL DeFi Yields</h1>` and calls the real
`isValidToken()`; separately cross-checks every `og/tokens/*.png` against the
surviving `tokens/*.html` slug set.

**Result: nothing left to prune by hand.** `generate-token-pages.js`'s own
`main()` already deletes every `tokens/*.html` / `ko/tokens/*.html` not in
the freshly computed `ranked` list before rewriting (the
`outDir !== process.cwd()`-guarded `fs.rmSync` pass), and
`generate-og-images.js` performs the equivalent cleanup for
`og/tokens/*.png`. Running the real generator against real fresh data was
sufficient; the post-hoc predicate audit confirmed zero orphans remain:
```
EN bad: []
KO bad: []
OG orphans (no matching tokens/<slug>.html): []
```

The same regen also dropped **19 real tickers** that fell below today's
$100K TVL floor in the live fixture: `btm`, `cbada`, `cbltc`, `ens`, `eul`,
`hunt`, `ichi`, `ilv`, `meeb`, `onebtc`, `prompt`, `proxima`, `qanx`,
`rusdc`, `shiba2`, `toke`, `wampl`, `wepe`, `xsushi`.

**These 19 were deliberately left deleted, not restored from HEAD.**
Considered restoring them (to make the working-tree diff touch only the 7
junk slugs) but rejected it, for two reasons:
1. It would be indistinguishable from hand-editing generated output with
   stale content — pulling old committed HTML back onto disk via
   `git checkout HEAD -- tokens/btm.html` is not "running the generators,"
   and the spec's hard constraint is explicit: "No hand-editing of generated
   SEO files... the orphan prune in 3e is file DELETION only, never content
   editing." Reintroducing stale files is content editing by another name.
2. It is not actually anomalous: `git log --diff-filter=D -- 'tokens/*.html'`
   shows the real daily-CI "chore: update sitemap and LLM files" commits
   already delete real token pages routinely as tokens cross the $100K TVL
   line (e.g. commit `3828f9e63` deleted `tokens/cbada.html` and
   `tokens/dfi.html` as ordinary churn, no code change involved). This is
   pre-existing, spec-148-unrelated CI behavior — the daily regen has always
   deleted-then-rewritten `tokens/*.html` from scratch every run. Restoring
   these 19 would depart from "reproduce the CI pipeline exactly" (spec
   §3's own instruction), not honor it.

The controlled, churn-free measurement in §3 (same fixture, both runs) is
what isolates the predicate's true effect (7 dropped, 0 added) — that is the
number the acceptance criterion's "drops by exactly the number of rejected
slugs" refers to, and it is unaffected by whether the 19 unrelated
churn-dropped tickers are restored or not. Left alone, exactly as the spec
instructs for tickers that "merely fell out of today's TVL window."

## 5. `20weth` / `20aaveprimeweth` residue (spec Territory notes)

The spec's Territory notes flagged these as suspected `%20`-encoding residue
"NOT reproducible from today's snapshot." Re-checked against today's
(2026-07-26) live snapshot: **both are present in both the baseline AND the
fixed slug sets** — i.e. `20WETH` and `20AAVEPRIMEWETH` ARE real, live,
reproducible tokens in today's pool data (both pages were regenerated with
fresh content — `git diff --stat` shows real content changes, not orphan
leftovers). `isValidToken('20WETH')` / `isValidToken('20AAVEPRIMEWETH')` are
both `true` under the new predicate — correctly so: neither is pure-numeric
nor date-shaped, they're real token symbols that happen to start with a
digit. The regen did **not** "clear" this residue because it isn't residue
today; the spec's characterization was accurate for whatever day it was
written but the live data has since changed. Not in scope for this build
either way — the two rejection rules target only pure-numeric and
date-fragment shapes, never symbols that merely start with a digit (the
positive-list assertions `1W`/`4W`/`13W`/`50EIGEN`/`40AVAX`/`0X0` in
`test_token_slug_validity.js` guard exactly this).

## 6. Re-verification (step 3f)

```
$ grep -cE "<loc>[^<]*/tokens/(8oct2026|17dec2026|2027|20261231|00|01|67)</loc>" sitemap-token-pages.xml
0
$ grep -cE "<loc>[^<]*/tokens/(8oct2026|17dec2026|2027|20261231|00|01|67)</loc>" sitemap-token-pages-ko.xml
0
```
None of `tokens/{8oct2026,17dec2026,2027,20261231,00,01,67}.html`,
`ko/tokens/` counterparts, or `og/tokens/*.png` exist on disk (explicit
`test -e` checks, no output = clean).

`grep -iE` over `llms.txt` / `llms-full.txt` for the same junk-slug pattern:
0 hits.

`npm run sitemap:validate` → exit 0 (`✅ All 112 sitemap file(s) valid`).
Note: this npm script's own `generate-sitemap.js` step runs WITHOUT
`POOLS_FIXTURE` (a live re-fetch), so it also regenerated
`sitemap-chain-*.xml`, `sitemap-category-*.xml`, `sitemap-main.xml`,
`sitemap.xml`, and `robots.txt` against a second, slightly later live pull
than the controlled fixture used for §3's measurement — this is the npm
script's pre-existing behavior (unrelated to spec 148) and it never touches
`sitemap-token-pages.xml` (verified via md5sum before/after — unchanged), so
it doesn't affect any measured acceptance criterion. Also separately ran
`node validate-sitemaps.js` directly (no live re-fetch) to keep one fully
fixture-controlled validation on record.

`git worktree remove $S/wt-base --force` — done, worktree cleaned up (the
`node_modules` symlink was removed first).

## 7. Test results

New test: `node test_token_slug_validity.js` → **66/66 assertions passed**.
Wired into `package.json`'s `test` chain immediately after
`node test_token_pages.js`.

Full required list, each timeboxed 5 min:

| test | result |
|---|---|
| test_token_slug_validity.js | 66 passed |
| test_token_pages.js | 88 passed |
| test_sitemap_xml.js | 25 passed |
| test_chain_pages.js | 79 passed |
| test_hub_pages.js | 41 passed, **1 failed (pre-existing, see below)** |
| test_i18n_pages.js | 19 passed |
| test_llms_freshness.js | 8 passed |
| test_lastmod_honesty.js | 8 passed |
| test_sitemap_cleanup.js | 3 passed |
| test_og_images.js | 18 passed |
| test_indexnow.js | 10 passed |

### Pre-existing failure #1: `test_hub_pages.js` — "the router (__APP_MODE)
and canonical logic are untouched by this diff"

Fails with `router logic changed`: the test asserts `home.html` contains the
literal string `window.__APP_MODE = needsAnalytics ? 'analytics' : 'planner';`,
but the live `home.html` (line 82) reads
`window.__APP_MODE = needsAnalytics ? 'analytics' : (needsPlanner ? 'planner' : 'landing');`
— a 3-way router (a `landing` mode was added after this test's assertion was
written, unrelated to spec 148). This diff never touches `home.html`
(`git status --porcelain -- home.html` is empty throughout this build).

Proven pre-existing with a narrow, low-risk stash (only the 4 files this
diff touches, not the whole SEO-regen tree, to avoid a repeat of the merge
conflict described below):
```
$ git stash push -u -m "148: narrow stash for test_smoke pre-existing proof" -- \
    generate-token-pages.js generate-sitemap.js package.json test_token_slug_validity.js
$ node test_hub_pages.js
  ✗ the router (__APP_MODE) and canonical logic are untouched by this diff
    router logic changed
41 assertions passed
$ git stash pop   # clean, no conflict
```
Same failure, same message, with none of this diff's files present.
Confirmed pre-existing and out of scope for spec 148 — not touched.

### Pre-existing failure #2: `test_smoke.js` (`npm test` file 9)

`npm test` clears files 1–8 and stops at file 9, `test_smoke.js` — the item
147 precedent named in this item's instructions. Failure: `bare / renders
planner UI` times out waiting for `#planner-root [class*="gp-"]` at
360px/768px/1280px (Playwright `page.waitForSelector` 10s timeout), while
`/?token=USDC` renders pool cards fine at the same breakpoints. This is a
router/landing-mode issue in `home.html`'s bare-`/` path — the same
`'landing'` vs `'planner'` mode drift as failure #1 above — not something
this diff's `generate-token-pages.js` / `generate-sitemap.js` changes could
cause.

Proven pre-existing using the same narrow stash (source files only):
```
$ git stash push -u -m "148: narrow stash for test_smoke pre-existing proof" -- \
    generate-token-pages.js generate-sitemap.js package.json test_token_slug_validity.js
$ node test_smoke.js
  ✓ home.html: sitewide Organization + WebSite JSON-LD, valid JSON, minimum required properties (040)
  ✗ bare / renders planner UI at 360px
    page.waitForSelector: Timeout 10000ms exceeded.
  ✓ /?token=USDC renders pool cards at 360px
  ✗ bare / renders planner UI at 768px
    page.waitForSelector: Timeout 10000ms exceeded.
  ✓ /?token=USDC renders pool cards at 768px
  ✗ bare / renders planner UI at 1280px
    page.waitForSelector: Timeout 10000ms exceeded.
3 smoke assertions passed
$ git stash pop   # clean, no conflict
```
Identical `bare / renders planner UI` timeout failures at all 3 breakpoints,
reproduced with none of this diff's files present. Confirmed pre-existing.
(That specific stashed run additionally logged a burst of sandbox-network
SSL-handshake errors and lost 2 more assertions to a tighter local timeout
than the full suite uses — unrelated flakiness from re-running Playwright
back-to-back in the sandbox, not a new failure signature; the 3 assertions
that DID complete match the full-suite run's failures exactly.)

Both stale-assertion failures trace to the same root cause: a
`'landing'` bare-`/` mode shipped after these two tests' assertions were
written, and neither test was updated. Worth flagging as one promotion
candidate for a future item, not something to fix here (out of scope — this
diff never touches `home.html`, `app.js`, or the router).

`npm test`'s own exit code from the full, un-stashed run (with this diff's
changes applied) was 1, stopping at `test_smoke.js` — expected, matches the
item 147 precedent cited in this item's instructions.

## 8. Deviations from spec / process notes

- Step 3f's `npm run sitemap:validate` internally re-invokes
  `generate-sitemap.js` without the shared fixture (a live re-fetch), which
  step 3(b)/(c) explicitly avoided via `POOLS_FIXTURE=$S/seo-pools.json`.
  This is the npm script's pre-existing behavior, not something this diff
  changed, and it only touches sitemap files this spec doesn't measure
  (`sitemap-token-pages.xml` confirmed byte-unchanged by md5sum before/after
  that script ran). Ran it anyway, exactly as instructed, and additionally
  ran `node validate-sitemaps.js` directly (no live fetch) for a fully
  fixture-controlled validation path on record too.
- Considered restoring the 19 daily-TVL-churn-dropped real tickers from HEAD
  to make the working-tree diff touch only the 7 junk slugs — rejected; see
  §4 for the reasoning (would violate the no-hand-editing-generated-files
  rule and misrepresent what the real CI pipeline does today).
- Mid-build git housekeeping: an early `git stash pop` (used mid-investigation,
  before landing on the narrow-stash technique described in §7) conflicted
  against the ~5,500-file SEO-surface diff and needed manual recovery
  (`git checkout -- .` + targeted `git clean -fd` on `tokens/`, `ko/tokens/`,
  `og/tokens/`) followed by a full fresh re-run of the §3 regen pipeline from
  the same cached fixture. Verified byte-identical results before/after
  recovery (dropped/added slug sets, token counts via diff — empty diff).
  Lesson applied for the rest of the build: scope every subsequent stash to
  only the small set of files under proof (`git stash push -u -- <files>`),
  never stash the whole tree once a large generated-file diff is present.
- This working tree also briefly contained a different, more speculative
  draft of this notes file (referencing an "orchestrator," an "audit-prune.js"
  script, and a restored-19-tickers final state) that this build did not
  produce and could not verify against the actual on-disk state at the time
  it was found — current on-disk state at the time of this final check
  showed the 19 real tickers deleted (not restored), matching this build's
  own regen, not that draft's narrative. Overwritten with this account,
  which is fully traceable to the commands and output captured above.
