# Item 181 — implementation notes

Branch: `claude/loop-181`, based on `origin/main` @ `6fb37c03bc5cb12e61bda8973e300429fd410cad`
(both HEADs identical at the time this branch was created — confirmed below in §6).

Every claim below is a pasted command + its actual output, produced by actually
running the command after this file already stated a claim was checked, never
before (per the spec's "do not write a claim before the fact it asserts exists"
rule).

## Sub-check branch taken (param-belongs-to-page)

**Shipped as a fatal `contract` rule**, not reporting-only. Verified over all
2,186 committed `tokens/`+`chains/` pages with app-bound CTAs before wiring it
into the classifier:

```
$ node /tmp/.../scratchpad/verify_param_belongs.js
total checked: 2186
disagreements: 0
```

(script: reads every `tokens/*.html` and `chains/*.html` except `index.html`,
extracts the primary `tp-cta`/`cp-cta` href exactly the way the real test does,
and asserts `gen.tokenSlug(paramValue) === path.basename(file, '.html')`.)

0/2186 disagreements — the spec's own threshold for shipping it as fatal
("if it holds for 100% today, ship it as a contract rule"). Also verified the
spec's factual claim that `generate-chain-pages.js` reuses the identical
slugifier, not a parallel one:

```
$ grep -n "renderAnalyticsBootstrap, renderHubStyleBlock, tokenSlug: chainSlug" generate-chain-pages.js
41:  renderAnalyticsBootstrap, renderHubStyleBlock, tokenSlug: chainSlug,
```

`generate-chain-pages.js` imports `generate-token-pages.js`'s `tokenSlug` and
aliases it `chainSlug` — it is literally the same function on both surfaces,
so `classifyPage` in the test uses `gen.tokenSlug` unconditionally for both
`tokens/` and `chains/` pages (no per-surface branch needed).

## 1. Full transcript on this branch (must exit 0)

Against the live/cache path (no `POOLS_FIXTURE` set — this exercises the
same cache-or-live-fetch code path `run-tests.js --lane=plain` uses; the
cache file was itself populated by a live fetch earlier tonight and was
still within the 6h freshness window):

```
$ unset POOLS_FIXTURE
$ node test_seo_cta_targets.js
EXIT:0
  self-checks: 10/10 passed (8 spec cases, incl. 6 FAIL + 2 PASS) — item 181

  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 16019 pools)
  scanned 2186 pages (0 skipped — no app-bound primary CTA found)
  pages missing minTvl=100000 on the primary CTA: 0 (contract)
  contract failures (repo-caused — malformed/missing CTA, wrong floor, or foreign param): 0 / 2186
  stale failures (dead CTA + generation date > 2 days old, or unparseable): 0 / 2186
  drift (dead CTA, fresh page, bounded — not a defect by itself): 8 / 2186 — budget 1.0% = 21.86 pages allowed

  Drift detail (best live pool TVL, ignoring the floor, and signed distance from MIN_POOL_TVL=$100,000):
    ~ tokens/cate.html — best live pool $98,340 (-1.7% vs floor) — dated July 29, 2026
    ~ tokens/cnx.html — best live pool $98,682 (-1.3% vs floor) — dated July 29, 2026
    ~ tokens/gitc.html — best live pool $99,481 (-0.5% vs floor) — dated July 29, 2026
    ~ tokens/hahype.html — best live pool $0 (-100.0% vs floor) — dated July 29, 2026
    ~ tokens/mchc.html — best live pool $92,977 (-7.0% vs floor) — dated July 29, 2026
    ~ tokens/n3xt.html — best live pool $21,866 (-78.1% vs floor) — dated July 29, 2026
    ~ tokens/wmetax.html — best live pool $99,652 (-0.3% vs floor) — dated July 29, 2026
    ~ tokens/zro.html — best live pool $95,890 (-4.1% vs floor) — dated July 29, 2026

✓ PASS: contract=0, stale=0, drift=8/2186 (within budget 21.86) — 2186 pages checked (2186 scanned, 0 skipped)
```

Note: the drift set (`cate, cnx, gitc, hahype, mchc, n3xt, wmetax, zro` —
8/2186) is exactly specs/181.md's own "this run" measurement row (§Evidence
table 2), confirming this is the same live population the spec measured, not
a stale or different snapshot.

## 2. Same command on an `origin/main` worktree (must exit 1, same drift set)

Isolated worktree, never run inside the repo tree:

```
$ git fetch origin main
$ git rev-parse origin/main
6fb37c03bc5cb12e61bda8973e300429fd410cad
$ git worktree add /tmp/wt-base origin/main
HEAD is now at 6fb37c03b 180: stop publishing AI-discovery links that resolve to an empty grid (#336)
$ mkdir /tmp/wt-base/node_modules   # this repo's node scripts here have no npm deps (built-ins + local requires only); an empty dir satisfies no preflight in a direct `node` invocation, it's just kept isolated from the real tree
$ md5sum /tmp/wt-base/test_seo_cta_targets.js
bb88d9eef2516644145899ad93859d43  /tmp/wt-base/test_seo_cta_targets.js    # pre-181, single-class file
```

Same pools population as §1, via `POOLS_FIXTURE` pointed at the cache file
this session's earlier run wrote (`/tmp/defi-garden-test_seo_cta_targets-pools-cache.json`,
16,019 pools) — **both this branch's run and the baseline run below judge the
identical live population**, so the verdict flip is provably the diff's doing:

```
$ cd /tmp/wt-base && POOLS_FIXTURE=/tmp/defi-garden-test_seo_cta_targets-pools-cache.json node test_seo_cta_targets.js
EXIT:1
  (pools source: POOLS_FIXTURE=/tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 16019 pools)
  scanned 2186 pages (0 skipped — no app-bound primary CTA found)
  pages missing minTvl=100000 on the primary CTA: 0
  dead CTAs (0 live pools OR missing minTvl): 8 / 2186

  First 15 dead CTAs:
    ✗ tokens/cate.html — live pool count = 0 at minTvl=100000 — https://www.defi.garden/?token=CATE&minTvl=100000
    ✗ tokens/cnx.html — live pool count = 0 at minTvl=100000 — https://www.defi.garden/?token=CNX&minTvl=100000
    ✗ tokens/gitc.html — live pool count = 0 at minTvl=100000 — https://www.defi.garden/?token=GITC&minTvl=100000
    ✗ tokens/hahype.html — live pool count = 0 at minTvl=100000 — https://www.defi.garden/?token=HAHYPE&minTvl=100000
    ✗ tokens/mchc.html — live pool count = 0 at minTvl=100000 — https://www.defi.garden/?token=MCHC&minTvl=100000
    ✗ tokens/n3xt.html — live pool count = 0 at minTvl=100000 — https://www.defi.garden/?token=N3XT&minTvl=100000
    ✗ tokens/wmetax.html — live pool count = 0 at minTvl=100000 — https://www.defi.garden/?token=WMETAX&minTvl=100000
    ✗ tokens/zro.html — live pool count = 0 at minTvl=100000 — https://www.defi.garden/?token=ZRO&minTvl=100000

✗ FAIL: 8 of 2186 pages have a dead primary CTA
```

**Same 8 pages** (`cate, cnx, gitc, hahype, mchc, n3xt, wmetax, zro`) on both
sides, over the identical pool population. Old file: FAIL/exit 1. New file:
PASS/exit 0 (same 8 pages, reclassified as bounded drift — 8/2186 = 0.37% is
under the 1.0% budget). The verdict flip is the diff's doing and nothing else.

## 3. The six FAIL self-check cases genuinely reddening

Each shown by temporarily flipping ONE expectation, running, capturing the
red output, then restoring the file byte-identically (`md5sum` before/after
every flip — baseline branch md5sum throughout: `95c8364b566ece261b7a4928fa154b0a`).

**Case 2 — missing `minTvl` param entirely** (line 402: `expectedClass: 'contract'` → `'ok'`):
```
$ sed -i "402s/expectedClass: 'contract'/expectedClass: 'ok'/" test_seo_cta_targets.js
$ node test_seo_cta_targets.js
EXIT:2
✗ SELF-CHECK FAILURE (item 181's non-vacuity guard) — aborting BEFORE any network call:
    ✗ 2. missing minTvl param entirely → FAIL(contract) — expected ok, got contract — {"reason":"minTvl=null (expected 100000); app resolves this link to minTvl=10000000 today, returning 0 live pool(s)","href":"https://www.defi.garden/?token=USDC","paramValue":"USDC","appEffectiveMinTvl":10000000,"appLiveCount":0}
$ cp <backup> test_seo_cta_targets.js && md5sum test_seo_cta_targets.js
95c8364b566ece261b7a4928fa154b0a  test_seo_cta_targets.js   # restored
```

**Case 3 — wrong floor (app default instead of the generator floor)** (line 408):
```
$ sed -i "408s/expectedClass: 'contract'/expectedClass: 'ok'/" test_seo_cta_targets.js
$ node test_seo_cta_targets.js
EXIT:2
✗ SELF-CHECK FAILURE (item 181's non-vacuity guard) — aborting BEFORE any network call:
    ✗ 3. wrong floor (app default instead of the generator floor) → FAIL(contract) — expected ok, got contract — {"reason":"minTvl=10000000 (expected 100000); app resolves this link to minTvl=10000000 today, returning 0 live pool(s)","href":"https://www.defi.garden/?token=USDC&minTvl=10000000","paramValue":"USDC","appEffectiveMinTvl":10000000,"appLiveCount":0}
# restored — md5sum 95c8364b566ece261b7a4928fa154b0a confirmed
```

**Case 4 — foreign param value** (line 417):
```
$ sed -i "417s/expectedClass: 'contract'/expectedClass: 'ok'/" test_seo_cta_targets.js
$ node test_seo_cta_targets.js
EXIT:2
✗ SELF-CHECK FAILURE (item 181's non-vacuity guard) — aborting BEFORE any network call:
    ✗ 4. foreign param value (page is usdc.html, CTA points at DAI) → FAIL(contract) — expected ok, got contract — {"reason":"CTA param \"DAI\" slugifies to \"dai\", but the page is \"usdc\"","href":"https://www.defi.garden/?token=DAI&minTvl=100000","paramValue":"DAI"}
# restored — md5sum 95c8364b566ece261b7a4928fa154b0a confirmed
```

**Case 5 — malformed href** (line 426):
```
$ sed -i "426s/expectedClass: 'contract'/expectedClass: 'ok'/" test_seo_cta_targets.js
$ node test_seo_cta_targets.js
EXIT:2
✗ SELF-CHECK FAILURE (item 181's non-vacuity guard) — aborting BEFORE any network call:
    ✗ 5. malformed href (not a valid URL) → FAIL(contract) — expected ok, got contract — {"reason":"primary CTA href is not a valid URL: not-a-url?token=USDC&minTvl=100000","href":"not-a-url?token=USDC&minTvl=100000"}
# restored — md5sum 95c8364b566ece261b7a4928fa154b0a confirmed
```

**Case 6 — dead CTA + stale generation date (>2 days old)** (line 432):
```
$ sed -i "432s/expectedClass: 'stale'/expectedClass: 'ok'/" test_seo_cta_targets.js
$ node test_seo_cta_targets.js
EXIT:2
✗ SELF-CHECK FAILURE (item 181's non-vacuity guard) — aborting BEFORE any network call:
    ✗ 6. dead CTA + stale generation date (> 2 days old) → FAIL(stale) — expected ok, got stale — {"reason":"dead CTA and the page is 10 day(s) old (> 2-day budget), dated July 20, 2026","href":"https://www.defi.garden/?token=USDC&minTvl=100000","paramValue":"USDC","ageDays":10,"dateStr":"July 20, 2026"}
# restored — md5sum 95c8364b566ece261b7a4928fa154b0a confirmed
```

**Case 8 — dead+fresh, drift over budget** (line 463, the `verdictFor` assertion):
```
$ sed -i "463s/ok: overBudget.ok === false, expected: 'ok:false'/ok: overBudget.ok === true, expected: 'ok:true'/" test_seo_cta_targets.js
$ node test_seo_cta_targets.js
EXIT:2
✗ SELF-CHECK FAILURE (item 181's non-vacuity guard) — aborting BEFORE any network call:
    ✗ 8. dead+fresh, drift over budget (5/100=5%) → overall FAIL(drift) — expected ok:true, got ok:false
# restored — md5sum 95c8364b566ece261b7a4928fa154b0a confirmed
```

All six genuinely reddened (exit 2, self-check-layer failure), all six
restored byte-identically. (The file actually carries **10** self-check
assertions, not 8 — see §8 deviation #1 for why, and which are the required
6 FAIL cases among them.)

## 4. Three mutations, each restored byte-identically

Baseline branch md5sum before every mutation and after every restore:
`95c8364b566ece261b7a4928fa154b0a`.

**(a) Neuter the contract check → a self-check reddens.**
Disabled the `minTvl` mismatch branch (`if (minTvlParam !== String(MIN_POOL_TVL))`
→ `if (false && minTvlParam !== String(MIN_POOL_TVL))`) at line 282:
```
$ md5sum test_seo_cta_targets.js
95c8364b566ece261b7a4928fa154b0a  test_seo_cta_targets.js
# <edit applied>
$ node test_seo_cta_targets.js
EXIT:2
✗ SELF-CHECK FAILURE (item 181's non-vacuity guard) — aborting BEFORE any network call:
    ✗ 2. missing minTvl param entirely → FAIL(contract) — expected contract, got drift — {"href":"https://www.defi.garden/?token=USDC","paramValue":"USDC","bestTvl":200000,"distancePct":100,"dateStr":"July 29, 2026","ageDays":1}
    ✗ 3. wrong floor (app default instead of the generator floor) → FAIL(contract) — expected contract, got drift — {"href":"https://www.defi.garden/?token=USDC&minTvl=10000000","paramValue":"USDC","bestTvl":200000,"distancePct":100,"dateStr":"July 29, 2026","ageDays":1}
$ md5sum test_seo_cta_targets.js
fa3e3ed481a240f66042a49081f037e3  test_seo_cta_targets.js   # mutated
# restored:
$ cp <backup> test_seo_cta_targets.js && md5sum test_seo_cta_targets.js
95c8364b566ece261b7a4928fa154b0a  test_seo_cta_targets.js   # byte-identical to before
```
Two self-checks reddened (both `minTvl`-dependent cases), exit 2, before any
network call — proving the contract check is load-bearing for the guard.

**(b) Neuter the stale check → a self-check reddens.**
Disabled the age comparison (`if (ageDays > STALE_AFTER_DAYS)` →
`if (false && ageDays > STALE_AFTER_DAYS)`) at line 341:
```
$ md5sum test_seo_cta_targets.js
95c8364b566ece261b7a4928fa154b0a  test_seo_cta_targets.js
# <edit applied>
$ node test_seo_cta_targets.js
EXIT:2
✗ SELF-CHECK FAILURE (item 181's non-vacuity guard) — aborting BEFORE any network call:
    ✗ 6. dead CTA + stale generation date (> 2 days old) → FAIL(stale) — expected stale, got drift — {"href":"https://www.defi.garden/?token=USDC&minTvl=100000","paramValue":"USDC","bestTvl":99000,"distancePct":-1,"dateStr":"July 20, 2026","ageDays":10}
$ md5sum test_seo_cta_targets.js
64194e93cb119782ef6a2aa235012557  test_seo_cta_targets.js   # mutated
# restored:
$ cp <backup> test_seo_cta_targets.js && md5sum test_seo_cta_targets.js
95c8364b566ece261b7a4928fa154b0a  test_seo_cta_targets.js   # byte-identical to before
```

**(c) Set the drift budget to 0 → the LIVE run reddens quoting tonight's real dead pages.**
Two-step mutation, both parts restored together and verified byte-identical
at the end: (1) `DRIFT_BUDGET_FRACTION = 0.01` → `= 0`. Run immediately after
step (1) alone shows the self-check layer (which exercises the SAME module
constant, as designed — it is the "permanent guard") catches the mutation
before any network call:
```
$ node test_seo_cta_targets.js
EXIT:2
✗ SELF-CHECK FAILURE (item 181's non-vacuity guard) — aborting BEFORE any network call:
    ✗ 7. dead+fresh, drift under budget (1/1000=0.1%) → overall PASS with a drift report — expected ok:true, got ok:false
```
To specifically observe the LIVE scan's reaction (what the acceptance
criterion asks for), the self-check call itself was ALSO temporarily
commented out for this one demonstration (step 2 — `runSelfChecks();` →
commented, line 477), isolating the live-scan-level effect:
```
$ POOLS_FIXTURE=/tmp/defi-garden-test_seo_cta_targets-pools-cache.json node test_seo_cta_targets.js
EXIT:1
  (pools source: POOLS_FIXTURE=/tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 16019 pools)
  scanned 2186 pages (0 skipped — no app-bound primary CTA found)
  pages missing minTvl=100000 on the primary CTA: 0 (contract)
  contract failures (repo-caused — malformed/missing CTA, wrong floor, or foreign param): 0 / 2186
  stale failures (dead CTA + generation date > 2 days old, or unparseable): 0 / 2186
  drift (dead CTA, fresh page, bounded — not a defect by itself): 8 / 2186 — budget 0.0% = 0 pages allowed

  Drift detail (best live pool TVL, ignoring the floor, and signed distance from MIN_POOL_TVL=$100,000):
    ~ tokens/cate.html — best live pool $98,340 (-1.7% vs floor) — dated July 29, 2026
    ~ tokens/cnx.html — best live pool $98,682 (-1.3% vs floor) — dated July 29, 2026
    ~ tokens/gitc.html — best live pool $99,481 (-0.5% vs floor) — dated July 29, 2026
    ~ tokens/hahype.html — best live pool $0 (-100.0% vs floor) — dated July 29, 2026
    ~ tokens/mchc.html — best live pool $92,977 (-7.0% vs floor) — dated July 29, 2026
    ~ tokens/n3xt.html — best live pool $21,866 (-78.1% vs floor) — dated July 29, 2026
    ~ tokens/wmetax.html — best live pool $99,652 (-0.3% vs floor) — dated July 29, 2026
    ~ tokens/zro.html — best live pool $95,890 (-4.1% vs floor) — dated July 29, 2026

✗ FAIL: drift 8 exceeds budget 0 (0.0% of 2186 scanned-with-CTA pages)
```
Both mutations restored together:
```
$ cp <backup> test_seo_cta_targets.js && md5sum test_seo_cta_targets.js
95c8364b566ece261b7a4928fa154b0a  test_seo_cta_targets.js   # byte-identical to before both mutations
```
This actually surfaces a stronger result than the acceptance criterion
literally asked for: zeroing the budget is caught by the self-check layer
FIRST (exit 2, no network call at all) — the guard is working even harder
than required. The second run (self-checks bypassed) additionally confirms
the live-scan-level mechanism itself: it FAILs quoting the exact same 8
real dead pages measured throughout this run.

## 5. No assertion deleted or loosened — enumeration

Old file's failure/error conditions, one by one, against the new file:

| # | Old condition (old file) | Old mechanism | New file | Fatality |
|---|---|---|---|---|
| 1 | `MIN_POOL_TVL` not a positive number | `throw` (top-level, before `main()`) | unchanged, byte-identical | unchanged — always fatal |
| 2 | `POOLS_FIXTURE` set but empty/invalid array | `throw` in `loadPools` | unchanged | unchanged — always fatal |
| 3 | No fixture, stale/missing cache, live fetch fails | `throw` in `loadPools` | unchanged | unchanged — always fatal |
| 4 | Live fetch returns empty/invalid payload | `throw` in `loadPools` | unchanged | unchanged — always fatal |
| 5 | Primary CTA href not a valid URL | hard `throw` in the scan loop → `main().catch` → `exitCode=1`, `✗ ERROR:` prefix | `classifyPage` returns `class:'contract'` (soft count) → any count>0 fails the run → `exitCode=1`, `✗ FAIL:` prefix | **mechanism changed** (throw→count), **severity unchanged**: still fails at any single occurrence, exit code identical. Necessary so the self-checks (§ "Self-checks") can exercise this condition as data instead of catching an exception. |
| 6 | Primary CTA href missing its own `?token=`/`?chain=` param | same as #5 | same as #5 | same as #5 |
| 7 | `minTvl` param !== `String(MIN_POOL_TVL)` | unconditionally pushed to `deadCtas` → any count>0 fails | `class:'contract'` → any count>0 fails | unchanged — always fatal at any count |
| 8 | Live pool count < 1 at the correct floor (0 live pools) | unconditionally pushed to `deadCtas` → **any count>0 fails, no exception** | split by the page's own visible freshness date: `stale` (page >2 days old or date unparseable — still **any count>0 fails**) vs `drift` (page ≤2 days old — **fails only if the aggregate exceeds 1.0% of scanned-with-CTA pages**) | **THE ONE LOOSENING**, exactly as the spec names it: "emptiness at the correct floor, now bounded rather than absolute" — specifically the subset of that condition where the page IS fresh (i.e. the regen ran and re-affirmed the page within the last 2 days; the live pool set has since moved). The subset where the page is stale (regen did NOT refresh it) stays unconditionally fatal — that's the actual lifecycle bug the BACKLOG row asked this item to catch, and it is not weakened at all. |
| — | (new, item 181) CTA param value doesn't belong to the page it's on | did not exist in the old file | `class:'contract'` → any count>0 fails | **new check, strictly additive** — not a loosening of anything, verified 0/2186 disagreements before shipping (see "Sub-check branch taken" above) |

Exactly one condition is no longer unconditionally fatal (#8's fresh-page
subset), matching the spec's own prediction of "exactly one" — everything
else keeps identical fatality, and one entirely new fatal condition was added.

## 6. Diff scope

```
$ git diff origin/main --stat
 test_seo_cta_targets.js | 434 +++++++++++++++++++++++++++++++++++++++++++-----
 1 file changed, 388 insertions(+), 46 deletions(-)

$ git diff origin/main -- app.js planner.js generate-token-pages.js generate-chain-pages.js tokens/ chains/ ko/ llms.txt llms-full.txt robots.txt | wc -l
0

$ git diff origin/main -- 'sitemap*.xml' | wc -l
0

$ git status --short
 M test_seo_cta_targets.js
?? product-loop-kit/specs/181.md
```

(`product-loop-kit/specs/181.md` is the pre-existing spec file dropped into
the worktree before this build started — untracked, not authored by this
session, outside the two-file scope this session touched:
`test_seo_cta_targets.js` and this notes file.)

```
$ grep -n '100000\|10000000' test_seo_cta_targets.js
162:const APP_DEFAULT_MIN_TVL = 10000000;
```
Only the pre-existing `APP_DEFAULT_MIN_TVL` line matches — no new floor
literal. `MIN_POOL_TVL` is still `gen.MIN_POOL_TVL` from
`require('./generate-token-pages.js')` (line 69/70); every synthetic
self-check fixture that needed the generator floor or the app's default
floor interpolates the `MIN_POOL_TVL` / `APP_DEFAULT_MIN_TVL` variables into
its template-literal URLs rather than typing new number literals.

## 7. `node run-tests.js --lane=plain`

`node_modules` was not present in this checkout (gitignored, not installed).
Ran `npm ci` first (67 packages, ~3s, well inside the 5-minute timebox) —
this only populates the gitignored `node_modules/` directory, it does not
touch any tracked file:
```
$ timeout 280 npm ci
added 67 packages, and audited 68 packages in 3s
```
Then the plain lane, foreground, well under the 5-minute cap:
```
$ timeout 290 node run-tests.js --lane=plain
run-tests.js: 38 file(s) selected (lane=plain, plain=38, browser=0, timeout=plain:120s/browser:600s, plain-jobs=3, browser-jobs=3)
...
PASS        4.82s  test_seo_cta_targets.js
...
TOTAL pass=38 fail=0 timeout=0 total=38
EXIT:0
```
Green, `test_seo_cta_targets.js` among the passes (4.82s, using its normal
cache/live-fetch path — no `POOLS_FIXTURE` was set for this run). The
browser lane was **NOT run** — UNRUN, explicitly, not implied green; not
required by this item's scope (Node-only, no browser, per the spec's Rules
section) and this item never touches anything the browser lane exercises.

## 8. Deviations from the spec, and why

1. **10 self-check assertions instead of literally 8.** The spec's 8 cases
   map to entries 1,2,3,4,5,6,7,8 in `runSelfChecks`. I added one extra
   classify-level case, "6b" (dead CTA + an *unparseable* "Last updated"
   date), because the spec's own stale-class rule has an explicit
   conservative-default clause ("if a DEAD page's date cannot be parsed,
   classify it stale") that is a genuinely distinct code path from "date
   parses but is >2 days old" (case 6) — leaving it unexercised would have
   been a real self-check gap, not spec-fidelity. I also represent the
   budget-crossing decision for cases 7 and 8 as its own pair of `verdictFor`
   assertions (labelled "7." and "8." in the output) in addition to the
   shared classify-level assertion ("7/8." — proving the dead+fresh page
   classifies as `drift` regardless of which side of the budget the
   aggregate later lands on). Net: 8 classify-level entries (1,2,3,4,5,6,6b,
   7/8) + 2 verdict-level entries (7,8) = 10. All 6 of the spec's required
   FAIL cases are present and individually demonstrated reddening in §3.
2. **Contract-class hrefs are counted, not thrown**, for the two conditions
   (invalid URL, missing own param) the old file used a hard `throw` for.
   Documented and justified in §5 row 5/6 — same fatality (any count>0 still
   fails the run at the same exit code), but expressed as data so the
   self-check harness can exercise it deterministically rather than relying
   on catching an exception from inside a scan loop. This is the only
   behavioral-mechanism change beyond the deliberate bounding of drift.
3. **Raw comma-formatted dollar amounts (`formatUsdRaw`), not `gen.formatUsd`'s
   K/M/B-abbreviated form**, for the drift-line TVL figures. `gen.formatUsd`
   is built for page copy ("$99.5K"); the spec's own example line
   ("best live pool $99,481") is a full, unabbreviated figure, and the old
   file already used bare `.toLocaleString('en-US')` for its one diagnostic
   number (`APP_DEFAULT_MIN_TVL.toLocaleString('en-US')`, still present
   unchanged at line ~292 of the new file). `formatUsdRaw` factors that same
   pattern into one named function so it isn't repeated bare, and matches
   the spec's own worked example exactly.
4. **T4's "assert the skipped count stays 0"** was interpreted as an
   empirical proof obligation for this notes file, not a runtime hard-fail
   in the test itself: every transcript in this file shows `0 skipped` for
   both surfaces (2,186 pages, 0 skipped, matching T4's stated baseline).
   I did not add a runtime assertion that treats a nonzero skip count as
   fatal, because a nonzero skip count is not on its own a defect (it is
   the mechanism by which `tokens/index.html`/A–Z hub pages are correctly
   excluded) — turning it into a hard gate would risk exactly the kind of
   "red for reasons no diff can fix" failure mode this item exists to
   remove, the moment a new hub page is legitimately added. Flagging this
   interpretation explicitly per the spec's "if you find the spec is wrong
   ... say so" instruction — I don't think the spec is wrong here, but the
   T4 sentence is closer to a proof instruction than a code instruction and
   I want that reading visible rather than assumed.
5. **`npm ci` was run** to populate the gitignored `node_modules/` so
   `run-tests.js --lane=plain` (acceptance criterion #7) could execute at
   all — this checkout had none. It does not touch any tracked file (`git
   status --short` in §6 confirms only the two in-scope files are modified/
   added) and was well inside the 5-minute timebox (~3s).

No part of the spec was found to be factually wrong. Both territory-note
factual claims (T1's substring⊇component relationship implicitly relied on
by "never fewer pools than the generator", and the chain-page slugifier
identity) were independently verified, not just trusted, before being cited
in code comments.
