# 188 — build notes

Status at handoff: implementation complete (Leg A + Leg B + Leg C), verified, uncommitted (per
instructions — operator session owns commit/PR/BACKLOG/LOG).

## Spec amendment (Leg C) — folded in mid-build, and a self-correction

The operator added a mandatory "Leg C" mid-session: both grid-link simulators
(`generate-llms.js:gridLinkPoolCount` and `audit-app.js:countQualifyingPools`) match `chain`
**literally** (`if (chain && p.chain !== chain) continue;`). No pool in any population (live feed,
`data/pools-snapshot.json`, or the app's own render logic) has `chain === 'All'` — `'All'` is a
wildcard the app recognizes specially (`app.js:1837/1843`: `chainMatch = selectedChain === 'All' ||
...`). Without Leg C, every `?chain=All&...` URL Leg A emits would simulate to **zero** pools in
both simulators, and:
1. `generate-llms.js`'s `applyChainRetarget()` (spec 180 R2) would classify each new URL as dead,
   fail to find a `/chains/all` static page (none exists — 'All' isn't a real chain), and **omit**
   the URLs from `## Chain Pages` entirely — the opposite of Leg A's point.
2. `audit-app.js`'s level-3 `link-target-integrity` text-surface check would raise a fresh blocking
   P1 per URL — the exact defect class this item exists to close, reintroduced by the fix itself.

I had independently identified this exact failure mode by reading `applyChainRetarget()` before the
amendment arrived (it's flagged in the spec's own "Territory notes" as something to "confirm"), so
the amendment matched my own analysis. Fix: both simulators now special-case `chain === 'All'` as
"match every pool", each with a comment naming `app.js:1837/1843` as the source of truth.

**Self-correction, recorded honestly:** on first pass I misread the amendment's closing line
("Everything else in your brief stands unchanged — including: do not touch app.js, no commit/push/
PR...") as narrowing scope AWAY from the original spec's Leg B (guard `buildFull()`'s four
unconditional sections). I initially shipped without Leg B and documented the gap in these notes as
a deliberate, operator-scoped omission. On re-reading, that line lists example CONSTRAINTS that
stand unchanged — it does not narrow the brief; Leg C is additive to the full original spec, not a
replacement for any part of it. **I reversed this and implemented Leg B before finalizing** (see
below). Leaving this paragraph in rather than quietly rewriting history, since a wrong scope call
caught and self-corrected mid-session is exactly the kind of thing these notes exist to surface.

**`chain=Popular` (the sibling wildcard, app.js:1838's 15-chain list) — deliberately NOT fixed**,
per the amendment's explicit instruction not to duplicate that list into either simulator. Evidence
it's dormant, not live:
```
grep -rn "chain=Popular" sitemap-*.xml llms.txt llms-full.txt tokens/ chains/ stories/
```
→ **0 matches**, confirmed both before Leg A's changes and again after the final regeneration. This
item never emits a `?chain=Popular` URL (Leg A only ever emits `chain=All`), so the gap is inert
today. **Known, recorded gap**: if any future generator or hand-authored copy ever produces a
`?chain=Popular` link, both simulators will mis-classify it as dead (0 pools) until someone applies
the same fix with the popular-chains list. Both `gridLinkPoolCount()` and `countQualifyingPools()`
carry an inline comment pointing here.

## Leg B — implemented (generate-llms.js `buildFull()`)

`## Token Pages`, `## Chain Pages`, `## Pool Type Pages`, `## High-Value Filter Pages` now carry the
same `if (categories.X.length > 0)` guard `## Other Pages` already had — exact mirror of the
existing pattern, no new pattern invented. Required for Leg A's own correctness: Leg A moves every
filter URL to carry `chain=All`, so `categories.highValue` (where the OLD 7 `?minTvl=`/`?minApy=`
URLs used to land) is now **permanently empty** — confirmed via the generator's own log line,
`URL categories: ... poolTypes(0), highValue(0)`. Before this fix, `## High-Value Filter Pages`
would have shipped with its TL;DR ("Filtered views for minimum TVL and APY thresholds") over zero
links — the exact false-claim-over-nothing defect class A5 describes, self-inflicted by Leg A.
`## Pool Type Pages` was ALREADY empty before this item (no `?poolTypes=` URL exists anywhere in the
sitemap — a pre-existing defect the spec's own "Not the NEVER list" section names) and is now also
correctly guarded.

Verified in the regenerated `llms-full.txt`: `grep -n "^## " llms-full.txt` no longer lists either
heading; `## Token Pages` and `## Chain Pages` (both genuinely non-empty) still render normally.

## Deviations from the spec (all conservative, none relax a trust rail)

1. **Extra unit tests beyond A3's literal wording.** The amendment's "Added acceptance" asked for "a
   unit check per simulator that `?chain=All&minApy=<x>` counts the same pools as the same query
   with no `chain` param, and that `?chain=Ethereum` still filters." I implemented this as **direct**
   unit tests against the now-exported `countQualifyingPools` (audit-app.js, added to
   `test_audit_text_surfaces.js`) and the already-exported `gridLinkPoolCount` (generate-llms.js,
   added to `test_llms_link_integrity.js`) rather than only integration-level `prescanTextSurfaces()`
   fixtures — cheaper, more precise, and pins the exact function under test. I also added one
   integration-level case per file to prove the fix survives the full pipeline. `countQualifyingPools`
   was not previously exported from `audit-app.js`; I added it to `module.exports` (additive, no
   existing export touched).
2. **A1's fixture is fully independent of A3's fixture.** A3's fixture is minimal and precisely
   engineered so removing one pool (`a2`, the apyReward-only qualifier) tips `minApy=10` from present
   to absent — proving apyReward is load-bearing, not just present. A1's fixture is larger (10
   pools) and deliberately produces *some* emitted rungs and *some* dropped rungs from the SAME
   fixture, so the browser test exercises the generator's real gated output rather than a
   hand-picked "always works" URL list. Both fixtures' exact emitted-URL sets are derived by
   actually running `generateSitemapSuite()`, never hand-typed expected lists.
3. **`isQualifyingPool`'s signature changed (additive, default preserved).** `isQualifyingPool(pool)`
   became `isQualifyingPool(pool, minTvl = SITEMAP_MIN_TVL)`. Every pre-existing call site
   (token/chain/category gates, all internal to `generate-sitemap.js`) calls it with one argument, so
   behavior for all of them is byte-identical to before — verified by the fact that every existing
   plain-lane sitemap test still passes and the regenerated non-`sitemap-main.xml` sitemap diffs are
   explainable by live-data drift alone (see "Regen diff accounting" below), not by a semantics
   change.
4. **Reverted an unrelated side-effect file, twice.** Running the real `node audit-app.js` CLI (not
   the test suite) during verification wrote to the committed
   `product-loop-kit/signals/audit-rotation.json` (the CLI's `persistRotationState: true` default —
   normal, documented CLI behavior, not a bug). Since this is bookkeeping state unrelated to item
   188's actual fix, I `git checkout --`'d it back to its pre-verification committed state both
   times I ran the CLI directly. Verified `git status --short product-loop-kit/ data/` is clean
   after each.
5. **New test file's fixture design choice.** `test_sitemap_filter_urls.js`'s A1 loop drives the
   REAL emitted URL list (by calling `generateSitemapSuite()` against the fixture and parsing its
   output), never a hardcoded expected URL list — spec A1 says "for every filter URL
   generate-sitemap.js emits", and this is the literal, generator-output-driven reading of that
   clause.

## Non-vacuity — the mutation and its result (A2's requirement, extended)

**Leg A mutation:** `git stash push --keep-index -- generate-sitemap.js` (reverts Leg A's fix,
restoring the 7 hardcoded `?minTvl=`/`?minApy=` URLs with no `chain=All` gating), run `node
test_sitemap_filter_urls.js`, observe RED, `git stash pop` to restore, re-run, observe GREEN.

**RED (pre-fix generator):**
```
✗ minApy=20 ... is ABSENT from sitemap-main.xml     (fails — old shape has no gate at all)
✗ minApy=10 ... is PRESENT in sitemap-main.xml       (fails — old shape has no chain=All URL)
✗ removing the apyReward-only qualifier drops ...    (fails — same reason)
✗ generateSitemapSuite(FIXTURE_POOLS) emitted >= 1 filter URL to check — emitted: []
  (0 A1 render assertions ran — the OLD generator never emits a `chain=All` URL for ANY
  population, so realEmittedFilterUrls() correctly returns an empty set; this precheck exists
  precisely so that "0 iterations" registers as a failure, not a vacuous pass)
✓ generateSitemapSuite(FIXTURE_POOLS) also DROPPED >= 1 rung — trivially true, unrelated
✓ A2 (non-vacuity): "?minApy=5" (no chain) renders 0 .pool-card — still true either way,
  this assertion is intentionally independent of the fix (it tests the OLD shape's own behavior)
✓ no unexpected page/console errors

RESULT: 3 passed, 4 failed
```
**GREEN (post-fix generator, restored):** 11 passed, 0 failed.

**Leg C mutation (generate-llms.js):** temporarily removed the `chain !== 'All'` clause from
`gridLinkPoolCount()`'s chain check, re-ran `test_llms_link_integrity.js` — the new
`"?chain=All&minApy=<x>" counts the SAME pools as ... no chain param at all` assertion went RED
(`0 !== 2`, since a literal `'All'` never matches any pool's `chain` field), while every other test
stayed green (confirms the mutation is scoped to exactly the intended line). Restored, re-ran,
confirmed GREEN (all 57 pass).

**Leg B mutation:** ran the new `buildFull()` committed-artifact assertions
(`"## Pool Type Pages" is absent entirely` / `no "## <heading>" is followed by a TL;DR ... `)
against the Leg-A-only regeneration (before the Leg B code fix existed) — both went RED, correctly
quoting `["## Pool Type Pages", "## High-Value Filter Pages"]` as the violating headings. After
implementing the Leg B guard and regenerating, both assertions pass GREEN. This is a real,
naturally-occurring non-vacuity proof (not a synthetic revert) — the exact sequence I actually
executed while building.

## Regen diff accounting (seo-surface-regen-delta.md discipline)

Regeneration touched: `sitemap-main.xml` (intended — the 6-URL filter-list swap), `sitemap.xml`
(index, cascades from child lastmods), `sitemap-category-Lending.xml`,
`sitemap-category-Yield-Farming.xml`, `sitemap-chain-Ethereum.xml`, `sitemap-chain-Plasma.xml`,
`sitemap-chain-Solana.xml`, `sitemap-tokens-all.xml`, `llms.txt`, `llms-full.txt`, and **deleted**
`sitemap-chain-Blast.xml`.

- `sitemap-main.xml`'s diff is **exactly** the 7→6 filter URL swap (verified by reading the full
  diff — no other `<url>` block touched).
- `llms-full.txt`'s diff (beyond Leg A's new 6 URLs replacing the old 7, and R2's retarget/omit
  math shifting slightly as a result) also drops the `## Pool Type Pages` and `## High-Value Filter
  Pages` headings — Leg B, intended.
- Every touched sitemap file besides `sitemap-main.xml`/`sitemap.xml` is explained by ordinary data
  drift, NOT by my code: the last commit's sitemap generation ran 2026-07-14 (`<lastmod>` values in
  the pre-regen files), 17 days before this run. `isQualifyingPool()`'s signature changed but its
  DEFAULT-ARG behavior for every pre-existing caller (all token/chain/category gates) is
  byte-identical to before — no rail, threshold, or predicate changed for them.
- Verified the highest-risk case (`sitemap-chain-Blast.xml` DELETED entirely) against the live pool
  cache directly: **0 pools with `chain === 'Blast'` in the current 15,888-pool live feed** — Blast
  is simply absent from DefiLlama's `/pools` response today (a whole-chain disappearance, not a
  threshold pool losing qualification). This is `cleanupStaleSitemaps()`'s pre-existing (pre-188)
  behavior working as designed on an empty child sitemap.
- Did not hand-verify every dropped/added token+chain/category combo in the other touched sitemap
  files (would require re-deriving thousands of per-token qualifying counts from the live feed by
  hand); the byte-identical `isQualifyingPool()` default-arg behavior plus the Blast spot-check is
  the evidence base for "ordinary churn, not code-caused" on the rest. **Unverified in full**,
  flagged honestly rather than asserted with false confidence.
- `sitemap-token-pages.xml`/`sitemap-chain-pages.xml`/their `-ko` siblings and `robots.txt` were
  **not** regenerated in this session (owned by `generate-token-pages.js`/`generate-chain-pages.js`,
  out of this item's scope — `npm run sitemap` only re-reads their existing on-disk files via the
  `existsSync` guard, never rewrites them).
- Re-ran `npm run sitemap && npm run generate:llms` a third time after the Leg B fix to reconfirm
  byte-identical idempotency (A7) — md5sums of `sitemap-main.xml`/`llms.txt`/`llms-full.txt`/
  `sitemap.xml` matched across the re-run.

## What I could NOT verify

- **The full ~2,176-page static SEO surface was not re-scanned this session** beyond the targeted
  `node audit-app.js --only=text-surfaces` runs and the browser-lane audit test suite (which samples
  a rotating subset). This item does not touch `generate-token-pages.js`/`generate-chain-pages.js`
  or any static page, so this is out of scope, not an oversight.
- **Did not run the FULL browser lane** (70 files, up to 600s each — far over any single command's
  practical budget). Ran the new test (`test_sitemap_filter_urls.js`) plus every browser-lane file
  that `require`s `generate-sitemap.js`, `generate-llms.js`, or `audit-app.js` (10 files total:
  `test_audit_runner.js`, `test_audit_app.js`, `test_seo_surface_audit.js`, `test_audit_prescan.js`,
  `test_audit_pool_prescan.js`, `test_audit_cta_provenance.js`, `test_audit_text_surfaces.js`,
  `test_audit_pool_link_liveness.js`, `test_audit_planner_surface.js`, `test_audit_planner_flow.js`)
  — all pass. `test_audit_cta_provenance.js` and `test_audit_pool_link_liveness.js` were run once,
  before the Leg B regeneration — both operate on `data/pools-snapshot.json` and the static
  `tokens/`/`chains/` pages, neither of which Leg B touches, so they were not re-run after the Leg B
  regen; every other file in the list was run (or re-run) after Leg B. Did not run browser-lane
  files unrelated to this item's changed files (e.g. `test_search.js`, `test_landing.js`) — no code
  path touched by this item's diff could affect them, and A8 does not name them.
- **`sitemap-category-*`/`sitemap-chain-*`/`sitemap-tokens-all.xml` per-combo drift** (see "Regen
  diff accounting" above) — spot-checked one case (Blast) exhaustively, did not re-derive the rest
  by hand.
- **KO translation impact**: none expected or found (see A9 below); did not additionally render the
  new `?chain=All...` URLs with `?lang=ko` in the browser test, since no new user-facing string was
  added anywhere in the product surface — only generator output (URLs, XML, txt) and code comments
  changed.

## Acceptance criteria — status

- **A1 (rendered, not fixtures).** `test_sitemap_filter_urls.js`: for every filter URL the real
  `generateSitemapSuite()` emits against a fixed live-shape fixture, drives Chromium against
  `home.html` with `yields.llama.fi/pools` routed to `{status:'success', data:[...]}` (LIVE shape per
  the fixture-trap playbook), asserts `>=1 .pool-card` and `<meta name="robots">` not noindex. PASS
  (4/4 URLs this fixture emits).
- **A2 (non-vacuity, both directions).** Same test asserts the pre-fix shape (`?minApy=5`, no
  `chain`) renders 0 `.pool-card`. PASS. Full stash-based mutation proof above.
- **A3 (the gate really gates).** Node-only checks in the same file: a rung with 1 qualifying pool
  (< `SITEMAP_MIN_QUALIFYING_POOLS`=2) is absent; a rung with 2 (one qualifying ONLY via `apyReward`,
  `apyBase=0`) is present; removing that apyReward-only pool drops the rung back out. PASS (all 3).
- **A4 (`minApy=50` gone from both surfaces + audit clears).**
  `grep -c "minApy=50" sitemap-main.xml llms.txt llms-full.txt` → **0, 0, 0** (spec asked for
  sitemap-main.xml + llms-full.txt; I additionally checked llms.txt too, also 0).
  `node audit-app.js --only=text-surfaces` (text-surface leg, ~2s, well under the 5-minute timebox):
  `textSurfaces.suspectCount: 0`, `bySignal.link-target-integrity: 0`, overall `findings: 0 total,
  0 blocking`. PASS.
- **A5 (empty sections cannot ship).** Implemented (Leg B, see above): `## Token Pages`,
  `## Chain Pages`, `## Pool Type Pages`, `## High-Value Filter Pages` now share `## Other Pages`'s
  existing `if (...length > 0)` guard. Unit tests in `test_llms_link_integrity.js`: (1) with all
  four category arrays empty, none of the four headings ship; (2) the guard is per-section (a
  populated category still ships, an empty sibling stays absent); (3) a literal scan of the full
  `emptyCategories` output for "heading + TL;DR + (blank/next-heading)" finds zero violations.
  Committed-artifact checks: `## Pool Type Pages` is absent from the regenerated `llms-full.txt`;
  a full-file scan for the heading+TL;DR-over-nothing pattern finds zero violations. PASS.
- **A6 (sacred URLs untouched).** `git diff --stat -- app.js home.html PoolDetail.js planner.js
  vercel.json` → empty (verified, exit 0, no output). Did not additionally re-render `?token=USDC`/
  `?chain=Ethereum`/`?pool=<id>` in a fresh browser session this run — the empty diff of the files
  that implement those surfaces is direct proof no code path that renders them changed at all.
- **A7 (generated surface is generator output).** `npm run sitemap && npm run generate:llms` run
  three times total across the session (once for Leg A alone, once after the Leg B fix, once more
  to reconfirm); `md5sum sitemap-main.xml llms.txt llms-full.txt sitemap.xml` byte-identical across
  back-to-back re-runs each time. `node validate-sitemaps.js` → all 113 sitemap files valid. PASS.
- **A8 (existing gates stay green, test registered).** Baseline (worktree at `origin/main`
  `d4eaca588`): **38 pass / 1 fail / 39 total** (plain lane) — the 1 failure was
  `test_llms_link_integrity.js`, already red at baseline because the committed `llms-full.txt`
  already carried the exact `?minApy=50` dead link this item fixes. After (final state, post Leg A+
  B+C): **39 pass / 0 fail / 39 total**. All 6 named tests (`test_sitemap_xml.js`,
  `test_llms_link_integrity.js`, `test_llms_rails.js`, `test_llms_freshness.js`, `test_canonical.js`,
  `test_seo_cta_targets.js`) pass — all 6 are classified `plain` lane by `run-tests.js` (none
  actually require Playwright despite the spec calling them "browser/SEO tests"), so `npm run
  test:fast` covers all of them. `test_sitemap_filter_urls.js` registered in `package.json`'s
  `test:serial` immediately after `test_sitemap_xml.js` (same sitemap-generation-validity family)
  and before `test_hub_pages.js`. `node run-tests.js --list --only=test_sitemap_filter_urls.js`
  confirms it classifies `browser` (correctly — it requires `playwright`), and total plain-lane
  count stayed 39 (unaffected).
- **A9 (EN + KO).** No `translations.js` change — confirmed: `git diff --stat -- translations.js` is
  empty. This item touches only generator code (`generate-sitemap.js`, `generate-llms.js`), an
  audit script (`audit-app.js`), tests, and generated artifacts (URLs/XML/txt) — zero new
  user-facing UI strings anywhere. **Case: "no translations.js change expected" applies, confirmed.**

## Emitted-URL list (Leg A, live regeneration, 2026-07-31)

`node generate-sitemap.js` (real live DefiLlama fetch, 15,878 pools) emitted, into `sitemap-main.xml`:

| rung | emitted? |
|---|---|
| `?chain=All&minTvl=1000000` | ✅ |
| `?chain=All` (the $10M rung, normalised form) | ✅ |
| `?chain=All&minTvl=100000000` | ✅ |
| `?chain=All&minApy=5` | ✅ |
| `?chain=All&minApy=10` | ✅ |
| `?chain=All&minApy=20` | ✅ |
| `?chain=All&minApy=50` | ❌ dropped — **0 qualifying pools** |

Exact drop log line from the live run: `sitemap-main.xml: dropped 1 filter rung(s) below quality
gate (< 2 qualifying pools) — minApy=50 (0 qualifying)`.

**6 of 7 rungs emitted, matching the spec's own prediction exactly** ("Today that emits six URLs
and drops minApy=50").

All 6 emitted URLs confirmed present, exactly once each, in the regenerated `llms-full.txt`
(machine-verified with a Python regex scan, not eyeballed):
```
https://www.defi.garden/?chain=All&minTvl=1000000 -> 1
https://www.defi.garden/?chain=All -> 1
https://www.defi.garden/?chain=All&minTvl=100000000 -> 1
https://www.defi.garden/?chain=All&minApy=5 -> 1
https://www.defi.garden/?chain=All&minApy=10 -> 1
https://www.defi.garden/?chain=All&minApy=20 -> 1
```
This directly proves the amendment's "after regeneration, all emitted filter URLs are actually
PRESENT in llms-full.txt (proving R2 did not omit them)" acceptance — R2's `applyChainRetarget()`
correctly recognized all 6 as LIVE (via the Leg C wildcard fix) and left them byte-unchanged rather
than retargeting-to-nonexistent-page or omitting them. Confirmed independently: none of the 6 appear
in the R2 log's omitted-chains list (`Abstract, Alephium, Boba, Carbon, Chia, Fantom, Kasplex,
Metis, Moonriver, Obyte, Rollux, Shape, Taiko, Telos, Unit0` — no `All`).

`grep -c "minApy=50" sitemap-main.xml llms.txt llms-full.txt` → **0, 0, 0**.

## Files changed

- `generate-sitemap.js` — Leg A: gated `?chain=All&...` emission replacing the 7 hardcoded URLs;
  `isQualifyingPool()` gained an optional `minTvl` param (default preserves old behavior);
  `poolTotalApy()` extracted; new `countQualifyingChainAll()`; new exports
  (`isQualifyingPool`, `poolTotalApy`, `countQualifyingChainAll`, `SITEMAP_MIN_TVL`,
  `SITEMAP_MIN_QUALIFYING_POOLS`, `APY_SANITY_LIMIT`).
- `generate-llms.js` — Leg C: `gridLinkPoolCount()`'s chain match treats `'All'` as a wildcard. Leg
  B: `buildFull()`'s four filter-heading sections gained the `if (...length > 0)` guard
  `## Other Pages` already had.
- `audit-app.js` — Leg C: `countQualifyingPools()`'s chain match treats `'All'` as a wildcard;
  exported `countQualifyingPools` for direct unit testing.
- `test_sitemap_filter_urls.js` (new) — the A1/A2/A3 rendered + Node-only gate test, registered in
  `package.json`'s `test:serial`.
- `test_llms_link_integrity.js` — 2 new unit tests for the Leg C wildcard fix on
  `gridLinkPoolCount()`; 3 new unit tests + 2 new committed-artifact tests for the Leg B guard on
  `buildFull()`.
- `test_audit_text_surfaces.js` — 3 new tests (2 unit + 1 integration) for the Leg C wildcard fix on
  `countQualifyingPools()`.
- `package.json` — registered `test_sitemap_filter_urls.js` in `test:serial`.
- Regenerated (never hand-edited): `sitemap.xml`, `sitemap-main.xml`, `sitemap-category-Lending.xml`,
  `sitemap-category-Yield-Farming.xml`, `sitemap-chain-Ethereum.xml`, `sitemap-chain-Plasma.xml`,
  `sitemap-chain-Solana.xml`, `sitemap-tokens-all.xml`, `llms.txt`, `llms-full.txt`; deleted
  `sitemap-chain-Blast.xml` (stale-child cleanup, chain absent from live feed).

## Not touched (confirmed)

`git diff --stat -- app.js home.html PoolDetail.js planner.js vercel.json translations.js` → empty.
Nothing under `telegram-bot/`, `whatsapp-bot/`, `workers/` touched. No commit, no push, no PR, no
`product-loop-kit/BACKLOG.md`/`LOG.md` edit.
