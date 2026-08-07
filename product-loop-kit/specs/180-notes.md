# Notes: item 180 — the AI-discovery surface must not publish links to an empty grid

## Summary of the change

All in `generate-llms.js`, inserted as one new section (R1/R2/R3 + anti-vacuity
rails + orchestrator) between `buildFull()` and `main()`, plus the minimum
surgical touch to `buildConcise()` and `main()` needed to wire it in:

- `gridLinkPoolCount(url, pools, opts)` (R1, exported) — the one shared
  simulation helper. Mirrors `test_seo_cta_targets.js:117`'s reference
  arithmetic (`(tvlUsd||0) >= floor && (tvlUsd||0) > 0`) plus token/chain/
  protocols/poolTypes/minApy matching. Never simulates `?pool=`; returns
  `null` for any URL that isn't a "grid link" at all.
- `applyChainRetarget(chainUrls, pools, sitemapUrlSet, baseUrl)` (R2) —
  retargets a dead `?chain=` link at its real `/chains/<slug>` page (via
  `tokenSlug` reused from `generate-token-pages.js`, the same import
  `generate-chain-pages.js:41` uses) when the sitemap actually has one;
  omits and counts it otherwise.
- `repairMinApyLink(url, pools, snapshotPools, opts)` (R3) — the descending
  `[10,5,3,1]` rung ladder, validated under **both** the live/fixture
  population and `data/pools-snapshot.json` (Territory T2), dropping
  `minApy` or omitting the link entirely if nothing resolves under both.
- `applyLinkIntegrityGate(input)` — orchestrates R1–R3 plus both anti-vacuity
  rails. Always computes the pre-180 baseline (`buildConcise`/`buildFull`
  called with the original, untouched `categories` and no `opts`) first;
  that baseline **is** the byte-identical fallback for both rails, and is
  the population `scanGridLinks()` measures the "checked" denominator
  against.
- `buildConcise()` gained one new, backward-compatible trailing parameter
  (`opts.highApyStakingUrl`, default `undefined` → byte-identical to every
  pre-180 call site including every existing test). `buildFull()`'s
  signature is **completely unchanged** — R2 is applied by pre-transforming
  the `categories` object (`chains`/`other` arrays) before calling it a
  second time, never by touching the function itself.
- `main()`: three new lines (load `sitemapUrlSet`, load
  `data/pools-snapshot.json` via `loadSnapshotPoolsForR3()`, call
  `applyLinkIntegrityGate()`) replacing the two direct `buildConcise`/
  `buildFull` calls; one new summary line.
- `module.exports` gained the new surface: `gridLinkPoolCount`,
  `applyChainRetarget`, `repairMinApyLink`, `withMinApy`, `snapshotApyOf`,
  `scanGridLinks`, `loadSnapshotPoolsForR3`, `applyLinkIntegrityGate`,
  `GRID_LINK_PARAMS`, `MIN_APY_RUNGS`, `STRUCTURAL_TRIPWIRE_FRACTION`,
  `SNAPSHOT_PATH`.

`MIN_TVL_USD`/`APY_SANITY_LIMIT` are byte-unchanged (`git diff` confirms
zero touched lines at their declarations); `grep -n "10000000\|APY_SANITY"
generate-llms.js` shows exactly the two original declarations plus one new
comment referencing `MIN_TVL_USD` by name — no second floor literal anywhere.

## Deviations from the literal spec, and why (conservative choices)

1. **R3's activation condition checks BOTH populations, not just live —
   stronger than a literal reading of R1/R2's wording.** The spec's R1 text
   describes `gridLinkPoolCount()` against a single `pools` array, and R2's
   "dead" determination is (correctly) live-population-only. For R3
   specifically, Territory T2 says the *chosen rung* must resolve under both
   populations "because `audit-app.js`'s level-3 re-check reads the
   committed snapshot" — but it doesn't explicitly say the *original link's
   liveness* must also be judged against both. I made it so anyway: on this
   very checkout, right now, the live population resolves `minApy=10` (1
   Staking pool at 10.18% APY today) while `data/pools-snapshot.json`
   (frozen at 2026-07-29) does not (top Staking APY there is 6.40%). If R3
   only fired when the *live* check found the link dead, today's run would
   have left `minApy=10` untouched — and `audit-app.js`'s own level-3
   re-check (which reads the snapshot, not live data) would still flag it,
   failing the acceptance criterion. Checking both populations up front is
   what makes this actually converge; documented in the `repairMinApyLink()`
   doc comment. I did **not** extend this dual-population liveness check to
   R2 (chain links) — the spec doesn't ask for it there, and I verified
   empirically (see Verification §3) that the live and snapshot populations
   agree exactly on which of the 102 sitemap chains are dead today (62/62
   match) — but this is a **weaker guarantee than R3 has**, and a chain
   right at the population's edge could in principle disagree between the
   two populations on some future day. Flagged as a residual risk, not
   fixed, because the spec scopes R2's dual-check nowhere and inventing one
   would be scope creep beyond the measured evidence.
2. **The "checked grid links" denominator for the 40% tripwire is measured
   by regex-scanning the built baseline TEXT of both files, not by walking
   `categories`.** The spec's own evidence (63/535, `38+497`) is a
   *text-surface* count — it includes hardcoded example links ("Popular
   Token Yields", "Common Search Patterns"), `analyzeYieldData()`-derived
   aggregate links ("Top Chains by TVL", "Major DeFi Protocols"), and
   per-pool fallback links, none of which live in `categories`. Reproducing
   that shape required `scanGridLinks(content, baseUrl)`, a small text
   scanner using the exact same applicability rule as `gridLinkPoolCount()`
   (same `GRID_LINK_PARAMS` set, same `?pool=` exclusion), applied to the
   already-built baseline string. This is the only piece of R1 that reads
   generated text instead of source data structures; I considered it
   necessary rather than optional because a chains-only denominator would
   have made the tripwire fire on almost any local/CI-fixture run with a
   short chain list, defeating its purpose as a *simulation-sanity* check.
3. **`data/pools-snapshot.json` is read directly (fs + JSON.parse), never
   through another generator.** The rules forbid "any other generator"; I
   treated the committed snapshot as a plain data file, matching how
   `audit-app.js` itself reads it (`loadSnapshotPopulation()`,
   `audit-app.js:845`) — I did not import or call anything from
   `audit-app.js` either (not a named reuse source in the spec), I wrote a
   small independent loader (`loadSnapshotPoolsForR3`) that fails safe to
   `null` on any read/parse/shape problem, degrading R3 to live-only
   validation with a logged note. This is intentionally NOT wired through
   `loadFixturePools()` (that helper is for the `?fixture` CLI/env
   override of the *live pool population*, a different concept from the
   *secondary validation population* R3 needs).
4. **The 14 omitted chain names came out identical to the spec's own list**
   (Abstract, Alephium, Boba, Carbon, Chia, Kasplex, Metis, Moonriver,
   Obyte, Rollux, Shape, Taiko, Telos, Unit0) on a fresh, independent live
   fetch taken hours after the spec was written — I did not special-case or
   hardcode this list anywhere; it fell out of the retarget logic given
   today's sitemap + live pool data. Documented here as a strong
   correctness signal, not a deviation.
5. **`test_llms_shared_source.js` is not registered in `run-tests.js`.**
   `run-tests.js` parses its file list from `package.json`'s `test:serial`
   chain (`run-tests.js:80`); `test_llms_shared_source.js` was never added
   to that chain (pre-existing gap, unrelated to this item). The task's
   required test list named it explicitly, so I ran it directly
   (`node test_llms_shared_source.js`) instead of via `run-tests.js --only=`
   — see Verification §7. I did not add it to `package.json` because
   `package.json` is on the explicit do-not-touch list.
6. **`test_seo_cta_targets.js` fails on `--lane=plain`, pre-existing and
   unrelated.** 5 of 2186 static token pages (`gitc`, `hahype`, `mchc`,
   `n3xt`, `wmetax`) have zero live pools today at the $100K page floor —
   this is item 173's surface (`tokens/*.html` CTAs), a different generator
   (`generate-token-pages.js`), untouched by this diff. `git status`
   confirms only `generate-llms.js`, `llms.txt`, `llms-full.txt`,
   `test_audit_text_surfaces.js`, `test_llms_link_integrity.js` changed.
   Reported, not fixed — out of this item's scope by the same logic 180's
   own spec used to scope out `?pool=` liveness and `## Token Pages`.

## Honest limitations

- **R2's dead/live determination is single-population (live/fixture only),
  not dual-checked like R3's.** Verified to agree with the committed
  snapshot today (62/62), but not *structurally* guaranteed to agree on
  every future day the way R3's rung choice is. If a chain sits exactly at
  the boundary of having its one qualifying pool cross $10M between the live
  fetch and the next snapshot regen, `audit-app.js`'s level-3 re-check could
  in principle flag a single new chain link before the next daily bake
  self-corrects it (R1 "re-decides every link on every bake" per the
  Hypothesis — a same-day flag, not a persistent one).
- **The structural tripwire's 40% threshold is evaluated once per
  generator run, using the SAME pool population for both the dry-run
  baseline measurement and the real fix** — by construction this can't
  disagree with itself within one run, but it does mean a population that
  is *exactly* at the 40% boundary could flip sides between two adjacent
  daily runs. Not a defect (this is inherent to any percentage-of-live-data
  gate), just worth naming.
- **`applyLinkIntegrityGate()` builds `buildConcise`/`buildFull` twice** when
  the gate is active (once for the baseline/measurement, once for the fixed
  output) — cheap (pure string building, ~200KB, no network), not optimized
  further since correctness (guaranteed byte-identical fallback) mattered
  more than one extra string-build per daily CI run.
- I did not extend R1/R2/R3 to any grid-link class beyond chain-section and
  minApy (e.g. `## Token Pages`, `## Popular Token Yields`) — matching the
  spec's explicit Non-goals, but meaning a hypothetical FOURTH dead-link
  class in the future would be counted by the tripwire's denominator/
  numerator machinery (via `scanGridLinks`) but not actually fixed by any
  rule, and would sit in the output as a genuinely dead link with no rail
  catching it. Today's measured corpus has no such class.

## Verification (measured, not asserted)

All measurements below were taken on this checkout, 2026-07-30, against a
live `https://yields.llama.fi/pools` fetch (16,021 pools at fetch time — pool
counts naturally vary run-to-run; day-to-day churn in the exact set of "top
15" pools shown in "Current Top Yields"/"Live High-Yield Opportunities" is
expected and unrelated to this item).

### 1. Before/after dead-grid-link counts, independent script (not the generator's own helper)

Script: `/tmp/.../scratchpad/indep_check.js` — a standalone dead-link
simulator written BEFORE `gridLinkPoolCount()` existed, re-implementing the
same rule by hand from `test_seo_cta_targets.js`'s reference arithmetic, run
against a fresh live fetch (never `require`s `generate-llms.js`'s gate code):

```
BEFORE (pre-180 committed files, git show HEAD, checked live):
  llms.txt:      checked 37 grid links, dead 0   (today's live minApy=10 rung happens to clear — see #6 below)
  llms-full.txt: checked 472 grid links, dead 62  — e.g. https://www.defi.garden/?chain=Abstract

AFTER (regenerated files on disk):
  llms.txt:      checked 37 grid links, dead 0
  llms-full.txt: checked 410 grid links, dead 0
```

llms.txt's "before" dead count reads 0 rather than the spec's documented 1
because of live-data drift between the spec's measurement and this run's
fetch (the Staking pool APY moved above the 10% rung between those two
independent live fetches, hours apart) — the underlying defect (R3 not
existing yet) is the same; see §4 below for a version of this proof that
forces llms.txt's "before" case to go RED too, since it's the more
interesting/fragile one.

### 2. R2 chain-section retarget split — measured against the real corpus

```
retarget 48, omit 14
omitted: Abstract, Alephium, Boba, Carbon, Chia, Kasplex, Metis, Moonriver,
         Obyte, Rollux, Shape, Taiko, Telos, Unit0
```

Exact match with the spec's own 48/14 split and the 14 named chains.

`## Chain Pages` section counts in the regenerated `llms-full.txt`:
`grep -c` → 48 `/chains/<slug>` lines; `## Other Pages` section: 40
`/chains/<slug>` lines (the ones never touched, still-relevant) — 48+40=88,
the full EN `/chains/<slug>` sitemap population, with **zero** duplication
(verified: `grep -c 'chains/astar'` in the whole file = 1 for the EN URL,
plus 1 separate for the unrelated `/ko/chains/astar` URL).

### 3. URL-set diff, old vs. new, every delta accounted for

`diff` of the sorted unique-URL sets (`git show HEAD:llms-full.txt` vs. the
regenerated file):

- 62 lines removed, **all** `?chain=<C>` — exactly the 62 dead chain links.
- 3 `?pool=<id>` lines changed (2 removed, 1 added net across a few rows) —
  ordinary daily churn in which pools rank in the top-15
  "Current Top Yields"/"Live High-Yield Opportunities" leaderboard; nothing
  in these sections is this item's concern (R1 never simulates `?pool=`).
- **Nothing else** in the 4,927-line old / 4,865-line new unique-URL sets
  differs. The 48 retargeted `/chains/<slug>` URLs do not appear as
  "added" in this diff because they were ALREADY present in the file (in
  `## Other Pages`) before this change — they moved sections, the URL
  string itself is unchanged, confirmed separately in §2.
- Live `?chain=` links: `comm -12` of the old and new `- https://.../?chain=`
  line sets → **40**, byte-identical (exact line match, not just URL match).

### 4. Non-vacuity proof (LEARNINGS 2026-07-27's required transcript)

`/tmp/.../scratchpad/nonvacuity_demo.js`, run against a live fetch (16,021
pools):

```
--- RED: pre-180 committed files (git show HEAD) ---
llms.txt (pre-180): checked 37 grid links, dead 0
llms-full.txt (pre-180): checked 472 grid links, dead 62
  e.g. dead link: https://www.defi.garden/?chain=Abstract
TOTAL pre-180 dead: 62

--- GREEN: regenerated files on disk now ---
llms.txt (regenerated): checked 37 grid links, dead 0
llms-full.txt (regenerated): checked 410 grid links, dead 0
TOTAL regenerated dead: 0
```

This defeats the gate the honest way (checking the PRE-180 committed
artifact, not a contrived fixture) and quotes a real dead link
(`?chain=Abstract`) going RED, then shows the regenerated files GREEN.
The committed-artifact leg added to `test_llms_link_integrity.js` makes this
permanent (using `data/pools-snapshot.json`, deterministic/no-network — see
§7); the fixture-level `test('R3 repairMinApyLink() — Territory T2: ...')`
in the same file additionally proves R3's dual-population requirement in
isolation, quoting the exact live-vs-snapshot disagreement this item's own
`minApy=10` case exhibits today (see item 1 below).

### 5. Empty-population rail — byte-identical, md5-verified

```
applied: false disabledReason: empty-population
concise md5 match: true
full md5 match: true
concise byte-identical: true
full byte-identical: true
```

(`gateResult.concise === baselineConcise` and `.full === baselineFull`,
strict string equality, not just md5 — md5 shown per the ask to "show
byte-identical (md5sum)".)

### 6. Structural (>40%) tripwire — fixture-forced, exit code + stderr verified

A 20-chain fixture (all dead against a 1-pool, sub-floor population) forced
21/41 = 51.2% affected:

```
❌ [llms][error] [180] link-integrity gate DISABLED — would retarget-or-omit
   21/41 grid links (51.2%), over the 40% tripwire. This means the
   simulation is probably broken, not that the surface is really this dead.
   Emitting pre-180 links unchanged.
applied: false disabledReason: structural-tripwire
process.exitCode: 1
concise byte-identical to baseline: true
full byte-identical to baseline: true
```

Also verified this does NOT break `test_llms_shared_source.js`'s subprocess
invocations (`execFileSync` throws on a non-zero child exit code): that
test's synthetic fixture pools are all below $10M by design (documented
"DUST" divergence test), which WOULD make every `?chain=` link in the real
102-chain sitemap dead — but the tripwire's denominator also counts the
~350 `?token=` links and other hardcoded/aggregate grid links the real
sitemap always contributes, keeping that scenario's affected fraction under
40% (measured: 4/24 in an early manual repro, well under). Confirmed by
actually running `node test_llms_shared_source.js` — 12/12 assertions pass,
`process.exitCode` never set (see §7).

### 7. Tests run and results

- `node run-tests.js --only=test_llms_link_integrity.js,test_llms_rails.js,test_llms_freshness.js,test_llms_shared_source.js,test_audit_text_surfaces.js,test_audit_prescan.js`
  → **selected only 5 of the 6 named files** (`test_llms_shared_source.js` is
  not in `package.json`'s `test:serial` chain, which is `run-tests.js`'s
  sole file-discovery source — pre-existing gap, see Deviation #5). All 5
  selected: **PASS** (`test_llms_freshness.js` 131ms, `test_llms_rails.js`
  156ms, `test_llms_link_integrity.js` 217ms, `test_audit_prescan.js`
  111557ms, `test_audit_text_surfaces.js` 2889ms — all well under the 5-min
  timebox).
- `node test_llms_shared_source.js` (run directly) → **12/12 PASS**.
- `node run-tests.js --lane=plain` → **37 PASS, 1 FAIL**
  (`test_seo_cta_targets.js`, pre-existing/unrelated live-data drift on
  `tokens/*.html`, see Deviation #6 — not touched by this diff, not in the
  task's required test list).
- `node audit-app.js --only=text-surfaces` → `textSurfaces.suspectCount: 0`,
  `bySignal.link-target-integrity: 0` on the regenerated files. (The full,
  unfiltered `node audit-app.js` was also run once, ~5 min, all surfaces
  green except one unrelated `poolPrescan` finding —
  `mean30d-rail-breach: 1` — a different signal on a different surface
  [pool-level `apyMean30d` sanity, not text-surface link integrity],
  pre-existing, out of this item's scope.)
- Excerpt positive controls (`test_audit_text_surfaces.js:302`, `:325`) —
  byte-untouched in this diff, both still fire (confirmed in the 46/46 pass
  run above): rule (a)/(c) findings on the pre-166 llms.txt excerpt, all
  three sub-rules on the pre-166 llms-full.txt excerpt.

Nothing was left UNRUN under the 5-minute timebox — the longest single
command (`test_audit_prescan.js`, ~112s, and the full `node audit-app.js`,
~5 min) both completed within budget.

Note: running `node audit-app.js` (full, unfiltered) writes its result to
`product-loop-kit/signals/audit-findings.json` (`DEFAULT_OUT`,
`audit-app.js:115`) as a side effect of verification, not a deliverable —
reverted via `git checkout -- product-loop-kit/signals/audit-findings.json`
before finishing, since only `specs/180-notes.md` under `product-loop-kit/`
is in scope for this item.

## Instrumentation

None — per the spec's own acceptance criterion (generated AI-discovery
surface, no user-facing string, no `translations.js` touch).

## Operator addendum — verifier findings recorded post-PASS (2026-07-30)

The verifier returned **PASS, 10/10, tier HIGH** and independently re-derived every number (its own
checker, its own 48/14/40 split, its own URL-set arithmetic `4,927 − 64 + 2 = 4,865`, its own two mutations,
and an end-to-end empty-population run against `127.0.0.1:9`). Four findings it raised are recorded here
because they belong in the honest-limitations record, not in a merge decision:

1. **The 40% structural tripwire cannot fire in production.** Numerator is structurally capped at 103 links
   (102 chain + 1 minApy) against a ~480-509-link text-surface denominator, so the verifier's forced worst
   case (a 1-pool fixture killing every chain link) reached only **21.5%** and the gate applied normally,
   rewriting the entire `?chain=` population without a loud failure. Both the threshold and the denominator
   shape come from `specs/180.md`, so the builder implemented what was specified — the rail as specified is
   **inert**, and the notes' framing ("a simulation bug must fail loudly, not quietly shrink the AI surface")
   is not true of the production corpus. Blast radius is bounded and named (14 `log()`ged omissions), and the
   consequential rail (empty population) is proven working. **Follow-up candidate for the heartbeat, not
   fixed here:** the correct shape is a class-relative rail ("the whole chain class went dead"), a design
   change needing its own spec — not a threshold tweak.
2. **The new committed-artifact test legs are self-referential.** They call the shipped
   `gridLinkPoolCount`, so they cannot see a defect *inside* R1 — proved by the verifier's Mutation A, where
   both legs stayed GREEN while the regenerated artifacts carried all 63 dead links. The independent guard is
   `test_audit_text_surfaces.js`'s level-3 leg (`audit-app.js`'s own simulator), which did go red. §4's claim
   that the artifact leg "makes this permanent" is corrected: the audit leg is what makes it permanent.
3. **R1's `protocols` is whole-string equality; `audit-app.js:934` uses comma-split membership.** Harmless
   today (grep: no multi-protocol link exists on either surface) but a live divergence between the two
   simulators whose agreement Territory T2 leans on. Documented, deliberately NOT patched — a post-PASS code
   change would require re-verification, and the spec authorised "exact `project`".
4. **Process:** the operator committed the working tree while the verifier was mid-run. The verifier checked
   the committed bytes against what it had verified (`git show HEAD:llms.txt` = `04856b18…`,
   `generate-llms.js` = `d4a3bb97…`) and they match, so no verdict rests on the drift — but the tree should be
   frozen while a verifier runs.

Also noted: `product-loop-kit/playbooks/dead-generated-link-repair.md` was written by the operator (build.md
step 6, the compound step) and was not in the changed-file list handed to the verifier. Docs-only, loop-kit
only, zero product effect — same pattern as items 174/175/176.
