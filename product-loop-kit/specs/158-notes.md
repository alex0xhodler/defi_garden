# 158-notes: `test_landing.js` fixture-routing fix

## What changed, in reading order

All changes are inside `test_landing.js`; no other file was touched.

1. **`IGNORABLE_ERROR_PATTERN` (line 21)** — extended to add `icons\.llamao\.fi`,
   `api\.llama\.fi\/protocols`, `www\.google\.com\/s2\/favicons` to the existing
   `mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|fontshare\.com` set, matching
   `test_smoke.js:40`'s set. Added the same explanatory comment style as
   `test_smoke.js:18-20` about the pattern being matched against the resource's
   URL, not the message text.

2. **`preparePage()` (lines 44-67)** — two routes added before the existing
   `yields.llama.fi/pools` / `api.llama.fi/protocols` routes:
   - `page.route('https://icons.llamao.fi/**', route => route.abort())` (line 47)
     — copied verbatim from `test_smoke.js:129`, same comment wording
     ("decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so
     requests never delay the load event").
   - `page.route('**/data/pools-snapshot*', ...)` (lines 52-56) — fulfills with
     a deliberately-stale envelope (`generatedAt: 2020-01-01`), same shape as
     `test_smoke.js:130`. This makes `app.js`'s `tryLoadSnapshot()` age check
     (app.js:1118-1119) reject the snapshot immediately and fall through to
     `loadLive()` (app.js:1096), so the routed `yields.llama.fi/pools` fixture
     (`FIXTURE_POOLS`, 2 USDC pools) becomes the actual data source instead of
     the committed 738-pool `data/pools-snapshot.json`.

3. **Console-error classification (lines 75-85)** — rewritten from
   `msg.text()`-only matching to also check `msg.location()?.url`, copying
   `test_smoke.js:117-122`'s idiom (`if (msg.type() !== 'error') return;` early
   exit, `source` variable, both `IGNORABLE_ERROR_PATTERN.test(source)` and
   `IGNORABLE_ERROR_PATTERN.test(msg.text())` checked, error message annotated
   with `(source)` when present).

4. **The `waitForURL` call for checkpoint 2 (line 117)** — added
   `{ waitUntil: 'commit', ... }` so the wait no longer depends on the `load`
   lifecycle event, which never fires on `/?token=USDC` in this sandbox because
   the 10 `icons.llamao.fi` requests, `mp.defi.garden/lib.min.js`, and
   `api.fontshare.com` hang forever (browser-originated HTTPS blocked at the
   proxy). Added a comment explaining why, and noting the `.pool-card`
   `waitForSelector` right after (unchanged) is what actually proves the
   handoff rendered. The icon-abort route added in (2) further reduces how
   many of these outstanding requests exist at all, but the `waitUntil` change
   is what removes the dependency on `load` entirely.

No assertion's meaning was changed. All 5 checkpoints (landing SVG/leaf/icon/
arrow-icon geometry + `data-mode` + no-planner-above-landing guard + footer
text; the search→analytics handoff incl. `.pool-card` render; `plan.html`;
planner share URL; `?app=1`) are byte-identical to before except for the
`waitForURL` options object noted above.

## Deviations from spec 158

None. Implemented exactly the three changes spec 158 §"Change" lists, in the
order given, copying the shipped precedent's wording as instructed.

## Verification — raw output

### (a) `node test_landing.js`

```
$ node test_landing.js
  ✓ bare / renders the search-first landing
  ✓ landing search enters the existing analytics result route
  ✓ plan.html still renders the garden planner
  ✓ planner share URLs still render the garden planner
  ✓ ?app=1 still renders the analytics search app
5 landing assertions passed
$ echo $?
0
```

### (b) Fixture-in-force proof (scratch probe, not committed)

A scratch script (`probe_158b.js`, run from the repo root so `node_modules`
resolved, then deleted — never committed) drove the identical landing→search
flow with the identical routing (icon abort, stale snapshot, `FIXTURE_POOLS`
on `yields.llama.fi/pools`) and read the rendered grid:

```
PROBE .pool-card count: 2
PROBE result-count text match: 2 pools found
PROBE FIXTURE_POOLS length (expected upper bound): 2
```

2 pool cards / "2 pools found" matches `FIXTURE_POOLS` exactly (both entries
are USDC pools) — not the 148-pool count the spec's own probe measured against
the committed `data/pools-snapshot.json`. This confirms the snapshot route is
actually short-circuiting `tryLoadSnapshot()` and the live-fetch fixture is
the real source.

### (c) Non-vacuity mutation

Backed up `test_landing.js` (md5 `0905190f75b40a9574bd5b18170bd268`), then
changed line 109's `fill('USDC')` to `fill('DOGE')` (a token `FIXTURE_POOLS`
does not contain) while leaving the `waitForURL` predicate checking for
`'USDC'` unchanged:

```
$ node test_landing.js
  ✓ bare / renders the search-first landing
landing test failed: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation until "commit"
  navigated to "http://localhost:8793/?token=DOGE"
============================================================
$ echo $?
1
```

Checkpoint 2 ("landing search enters the existing analytics result route")
flipped RED: the URL became `?token=DOGE` and the predicate (still `=== 'USDC'`)
never matched, so `waitForURL` timed out. This proves the gate can fail.

Restored the file and confirmed byte-identical:

```
$ cp test_landing.js.orig.bak test_landing.js
$ diff test_landing.js.orig.bak test_landing.js && echo "DIFF: IDENTICAL"
DIFF: IDENTICAL
$ md5sum test_landing.js
0905190f75b40a9574bd5b18170bd268  test_landing.js
```

Re-ran `node test_landing.js` after restore: exit 0, all 5 checkpoints again
(see re-run below), confirming the restore is functionally identical too.

### (d) `node test_smoke.js`

First attempt was killed by my own 120s Bash-tool timebox (the file's live
`yields.llama.fi` reachability probe plus 9 real-browser page loads across 3
viewports plus a JSON-LD assertion routinely takes longer than 120s in this
sandbox — this is pre-existing behavior of a file I did not touch, not a
regression). Re-run with a 300s cap:

```
$ node test_smoke.js
network: yields.llama.fi reachable — serving live snapshot captured via curl
  ✓ home.html: sitewide Organization + WebSite JSON-LD, valid JSON, minimum required properties (040)
  ✓ bare / renders the search-first landing at 360px
  ✓ /plan.html renders the planner at 360px
  ✓ /?token=USDC renders pool cards at 360px
  ✓ bare / renders the search-first landing at 768px
  ✓ /plan.html renders the planner at 768px
  ✓ /?token=USDC renders pool cards at 768px
  ✓ bare / renders the search-first landing at 1280px
  ✓ /plan.html renders the planner at 1280px
  ✓ /?token=USDC renders pool cards at 1280px
  ✓ pool-detail view (?pool=<id>) renders a BreadcrumbList JSON-LD block (040)
11 smoke assertions passed
$ echo $?
0
```

Item 156's gate (position 9) does not regress.

### (e) Full `npm test` chain, 5-minute foreground timebox

`package.json`'s `test` script is 91 files (parsed and numbered via
`s.split('&&')`; confirmed `test_landing.js` is file 10, `test_smoke.js` is
file 9, matching spec 158's claim).

```
$ timeout 300 npm test 2>&1 | tail -40
...
network: yields.llama.fi reachable — serving live snapshot captured via curl
  ✓ home.html: sitewide Organization + WebSite JSON-LD, valid JSON, minimum required properties (040)
  ✓ bare / renders the search-first landing at 360px
  ✓ /plan.html renders the planner at 360px
  ✓ /?token=USDC renders pool cards at 360px
  ✓ bare / renders the search-first landing at 768px
  ✓ /plan.html renders the planner at 768px
  ✓ /?token=USDC renders pool cards at 768px
  ✓ bare / renders the search-first landing at 1280px
  ✓ /plan.html renders the planner at 1280px
  ✓ /?token=USDC renders pool cards at 1280px
  ✓ pool-detail view (?pool=<id>) renders a BreadcrumbList JSON-LD block (040)
11 smoke assertions passed
  ✓ bare / renders the search-first landing
  ✓ landing search enters the existing analytics result route
  ✓ plan.html still renders the garden planner
  ✓ planner share URLs still render the garden planner
  ✓ ?app=1 still renders the analytics search app
5 landing assertions passed
canonicalFor — analytics mode (self-canonical)
  ... [24/24 test_canonical.js assertions, all ✓] ...
All 24 assertions evaluated.
network: unpkg.com BLOCKED (using local vendored React/Babel), yields.llama.fi BLOCKED (using DefiLlama-shaped fixture snapshot)
  ✓ "USDC on Base" renders a correctly filtered, non-empty grid
  ✓ "Lending on Plasma" renders a correctly filtered, non-empty grid
  ✗ "CRV LP on Curve" renders a correctly filtered, non-empty grid
    page.waitForTimeout: Target page, context or browser has been closed
  ✗ "Kamino lending" renders a correctly filtered, non-empty grid
    page.goto: Target page, context or browser has been closed
  [... 15 more cascading "Target page, context or browser has been closed" ✗ lines ...]
2/20 search behavior assertions passed
$ echo $?
124
```

## Honest status of the rest of the chain

**Position 9 (`test_smoke.js`) and position 10 (`test_landing.js`) both pass**
inside the full-chain run — this item's target is cleared. The chain proceeds
into **position 11 (`test_canonical.js`), which passes fully (24/24)**, and
continues into **position 12 (`test_search.js`)**.

`test_search.js` was still mid-flight — 2 of its 14 canonical NL-search
queries had completed, the 3rd ("CRV LP on Curve") was in progress — when the
overall `timeout 300` fired and force-closed the browser process. Every
subsequent line in that file's run ("Kamino lending" through the 5 negative
regression queries) failed with `Target page, context or browser has been
closed`, which is a direct artifact of that forced kill, not a discovered
defect in `test_search.js`'s own logic — the first two queries that did get to
run to completion both passed cleanly. **`npm test` did not finish inside the
5-minute timebox; I did not watch all ~90 files finish, so I am not claiming
"npm test is green."** The honest record is: chain clears through position 11
inside the timebox and is killed while genuinely running (not stuck/hung)
partway through position 12.

**Does this reproduce on `origin/main`?** I checked this two ways, using
`git stash` (branch HEAD is `7989cf070`, identical to `origin/main`, with only
`test_landing.js` modified in the working tree — `git stash push -- test_landing.js`
gives an exact `origin/main` working copy without needing a worktree):

1. `node test_landing.js` standalone on `origin/main`'s file reproduces the
   documented failure exactly: exits 1, `page.waitForURL: Timeout 10000ms
   exceeded`, log shows only `"domcontentloaded" event fired` (never `load`).
   This is the root-cause failure spec 158 exists to fix, and it does
   reproduce, confirming this file was genuinely broken on `origin/main`
   before this change.
2. A `timeout 120 npm test` run on `origin/main`'s tree didn't even reach
   `test_landing.js` (position 10) — it was still inside `test_smoke.js`
   (position 9, itself slow in this sandbox, consistent with (d) above) when
   the 120s cap fired, again via cascading "Target page ... closed" artifacts
   from the forced kill, not a real position-9 failure (confirmed separately
   that position 9 exits 0 given a longer budget, see (d)).

So the `test_search.js` cutoff observed on my branch's full-chain run is a
**timebox artifact common to both branches** (this sandbox's real-Chromium
suite is simply slower than 5 minutes end-to-end for ~12+ files), not
something introduced by this change, and not the same failure class as the
`test_landing.js` regression this item fixes. I did not attempt to fix
`test_search.js` or anything past position 11 — out of scope per spec 158.
`git stash pop` restored my `test_landing.js` change afterward; confirmed via
`git status` and `md5sum` (`0905190f75b40a9574bd5b18170bd268`, unchanged).

## Guardrails

`git diff origin/main --stat`:

```
 test_landing.js | 31 +++++++++++++++++++++++++++----
 1 file changed, 27 insertions(+), 4 deletions(-)
```

Only `test_landing.js` is modified relative to `origin/main`. No product file
(`home.html`, `app.js`, `planner.js`, `translations.js`, `style.css`, etc.), no
generated SEO surface (`sitemap*.xml`, `stories/`, `llms.txt`), no
`package.json`/dependency change, no trust-rail constant
(`APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`), no `__APP_MODE` router logic, and no
`?token=/?chain=/?pool=` behavior was touched. `product-loop-kit/specs/158.md`
was pre-existing/untracked in the working tree (not authored by this change);
the only file this item added under `product-loop-kit/` is this notes file,
as permitted.

## Verifier addendum (operator, post-verification)

The verifier subagent independently re-derived all 6 criteria (PASS, LOW tier) and **settled the one
question this notes file had to leave open**. Where §(e) above says `test_search.js` (position 12) "was
still mid-flight" when the 5-minute cap fired, the verifier ran that file standalone twice:

- capped at **280s** → 18/20, killed mid-assertion on `"comparison of yields"`, reproducing the identical
  `page.goto: Target page, context or browser has been closed` cascade — corroborating that the cascade is
  an artifact of the kill, not of the file;
- capped at **550s** → **`20/20 search behavior assertions passed`, exit 0**.

So positions **9, 10, 11 and 12 are all green** on this branch. `test_search.js` is not a red and is not
the next stopper; it simply needs more than the 5-minute foreground timebox on its own. The honest
statement of the chain's status is therefore: **no known red remains at positions 1-12; the chain has
never been observed past position 12 in-sandbox because the real-Chromium suite is slower than the
timebox, not because anything after it is failing.** Whether files 13-91 are green is still unknown and
was not claimed by this item.

Verifier's non-blocking observation, recorded for the next loop: `IGNORABLE_ERROR_PATTERN` is now
duplicated identically across three files (`test_smoke.js`, `test_search.js`, `test_landing.js`) — a
future divergence between them would be easy to miss. Not fixed here (out of scope, one item one change);
noted as a candidate for a shared test helper.
