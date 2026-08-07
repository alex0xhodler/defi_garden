# 175 — build notes

Item: extend `link-target-integrity` (169/172) with levels 2 ("resolvable") and 3 ("non-empty") so the
scanner can catch the 173/166 class of bug (a routed, well-formed link that resolves to nothing) without a
human re-deriving it by hand.
Spec: `product-loop-kit/specs/175.md` (Territory notes T1–T8 are binding — read first). Branch:
`claude/loop-175` (already checked out per the build brief). Base: includes 176 (`96fb8c751`) plus the
Territory-notes-only commit `8e1771190` that preceded me (touches `specs/175.md` and the playbook only, no
product/test code).

## What shipped

- `audit-app.js`: ONE new shared helper block (`loadDefaultMinTvl`, `loadPlannerPresetKeys`,
  `loadSnapshotPopulation`, `linkQueryPairs`, `effectiveMinTvl`, `symbolMatchesTokenMirror`,
  `LEVEL3_GRID_PARAMS`, `countQualifyingPools`, `parsePageOwnPools`) inserted between 172's
  `ownedPathResolvesToFile()` and the "Static-surface prescan" comment — used by BOTH
  `prescanTextSurfaces()` and `prescanStaticPages()`, no second copy. Both prescan functions gained:
  (1) a one-time-per-scan setup block (`minTvlInfo`/`snapshotInfo`/`presetKeysInfo`/`projectSet`, each with
  its own stderr-once-per-scan degrade note, mirroring the existing `routerParams`/`plannerParams`
  convention); (2) a level-2 block (protocols/preset resolvability) and a level-3 block (non-empty
  simulation) appended after the existing rule (a)/(b)/(c) blocks, inside the per-file/per-page loop.
  `prescanStaticPages()`'s existing rule-(b) loop also now tallies `poolAnchorCount` (one line added) so
  level 3's anti-vacuity rail doesn't re-scan the page a second time.
- `test_audit_prescan.js`: 15 new `test(...)` cases (level 2 positive/negative × protocols/preset, the
  4,233-trap non-goal proof, level-3 positive/negative/minTvl-semantics/anti-vacuity, 3 degrade paths) plus
  necessary narrowing of 5 PRE-EXISTING rule-(b)/"all three" assertions (see Deviation 1 below).
- `test_audit_text_surfaces.js`: 16 new `test(...)` cases (same shape as above, plus the below-floor-skip
  pair and a level-1 regression guard) plus narrowing of the line-337 TRUE NEGATIVE assertion and 3
  PRE-EXISTING pre-166-fixture assertions that legitimately now also see level-3 hits (Deviation 2/3 below).
- No other file touched. No new npm dependency, no `package.json` change (verified: `git diff --stat`
  below lists exactly these 3 files).

```
 audit-app.js                | 427 +++++++++++++++++++++++++++++++++++++++++++-
 test_audit_prescan.js       | 181 +++++++++++++++++--
 test_audit_text_surfaces.js | 265 +++++++++++++++++++++++++--
 3 files changed, 851 insertions(+), 22 deletions(-)
```
Final line counts: `audit-app.js` 2490 lines, `test_audit_prescan.js` 722 lines,
`test_audit_text_surfaces.js` 925 lines.

## Ground truth reproduced (spec's own acceptance bar)

Measured with a throwaway script against the pre-materialised `git worktree` at `cc243611b^`
(`…/scratchpad/pre173`, not committed anywhere in this repo) and against the current checkout, using the
FINAL shipped `prescanStaticPages()`/`prescanTextSurfaces()` (not the prototypes):

| corpus | pages/files scanned | level-3 flagged pages/files | level-3 flagged links |
|---|---|---|---|
| pre-173 (`cc243611b^`, 2,200 pages) | 2,200 | **1,878** | **4,020** |
| post-173 (HEAD `chains/`+`tokens/`) | 2,186 | **0** | **0** |
| `llms.txt` | 1 | 1 | **1** (`/?poolTypes=Staking&minApy=10`) |
| `llms-full.txt` | 1 | 1 | **62** (all `## Chain Pages`, e.g. `?chain=Cardano`) |
| level 2 (protocols/preset) on real `llms*.txt` + real `chains/`/`tokens/` | — | **0** bad slugs, **0** bad presets | — |

- **Acceptance criterion 1** (pre-173 ≥ 1,700): **1,878 ≥ 1,700 — PASS.** The spec's own T3 table (measured
  by the prototype scripts, pre-dispatch) reports 1,879 pages / 4,024 links on the same corpus. My shipped
  numbers (1,878/4,020) are marginally lower — see Deviation 4 below; this is expected, documented, and
  still clears the bar by a wide margin.
- **Acceptance criterion 2** (post-173 → 0): **0 — PASS**, matches T3 exactly.
- **T4's 63-real-dead-link figure** (1 + 62): **reproduced exactly** on `llms.txt`/`llms-full.txt`.
- **Anti-vacuity rail** (T8): fires on **0 of 2,200** pre-173 pages and **0 of 2,186** post-173 pages —
  matches spec's "fires on 0 of 2,200 pages today" expectation.

## Deviations / conservative choices (with rationale)

1. **Narrowed 5 PRE-EXISTING assertions in `test_audit_prescan.js` (rule-(b) positive/negative controls +
   the "all three sub-rules" case), rather than leaving them unmodified.** These fixtures use
   `minimalPage()`'s bare `<a class="tp-pool-link" href="...">` anchors with NO surrounding
   `<tr><td class="num">` table markup — a shape no real generated page has (029's templates always emit
   the full row). Once level 3's anti-vacuity rail (T8) exists, "page has a pool-row anchor but zero
   parseable TVL rows" is now literally, correctly true of these fixtures — a genuine new finding, not a
   false positive. I narrowed the 4 rule-(b) assertions to filter on rule (b)'s own detail phrase (the SAME
   convention rule (c)'s own negative controls already use — `/resolve/.test(detail)`), and updated the
   "all three sub-rules" case to expect 4 suspects (3 legacy + the now-legitimate anti-vacuity finding),
   asserting both counts explicitly rather than silently absorbing the extra finding into a loosened
   `>= 3`. This is a widen-the-filter change, not a weakened guarantee — every one of the 5 tests still
   fails if its own sub-rule regresses, and I did not touch fixture content or delete any assertion.

2. **Narrowed `test_audit_text_surfaces.js:337`'s TRUE NEGATIVE assertion, exactly as Territory note T4
   requires**, from "zero `link-target-integrity` suspects on the real committed surfaces" to "zero
   suspects on levels 1/2/(b)/(c)" (level 2 stays in the narrowed clean set — it genuinely is clean today,
   0 bad protocol slugs / 0 bad presets). A NEW, separately-named test
   (`link-target-integrity LEVEL 3 (backlog 175, KNOWN FILED DEFECT — backlog 180, ...)`) pins the exact
   level-3 findings (1 in `llms.txt`, 62 in `llms-full.txt`) as a known, filed defect citing backlog 180 —
   per spec's explicit instruction. The assertion was narrowed, never relaxed to hide anything, never
   deleted; the new finding is asserted with an EXACT count (not `>= `), so a future drift (180 landing, or
   the live pool population shifting the chain-page counts) will re-fail this pin loudly rather than pass
   silently — the failure message says exactly that.

3. **Also narrowed 3 more PRE-EXISTING tests that use REAL historical text** (the trimmed pre-166 `llms.txt`
   excerpt fixture, and the two "opportunistic full-file control" cases that `git show` the real pre-166
   bytes at a fixed sha). All three legitimately now ALSO see level-3 hits, because their content is real
   text evaluated against the CURRENT committed `data/pools-snapshot.json`:
   - The trimmed `llms.txt` excerpt (`test-fixtures/pre166/llms-pre166.txt`) still contains the literal
     `?poolTypes=Staking&minApy=10` line — I added an explicit assertion pinning that ONE known level-3 hit
     (same backlog-180 framing as case 2), rather than just filtering it away, since it's a small, stable,
     already-committed fixture.
   - The two "opportunistic" `git show`-based cases replay a FIXED historical commit's bytes but evaluate
     them against TODAY's snapshot — a quantity with two moving parts (fixed text × live-ish data), so I
     filtered level-3 hits OUT of their assertions without pinning an exact count, and left a comment
     explaining why (avoiding a fragile pin tied to data neither of these tests was designed to track).
     I confirmed by inspection that filtering, not deletion, is what changed — the a/b/c assertions those
     tests were written for are untouched and still pass on the real historical bytes.

4. **The pre-173 corpus measurement (1,878 pages / 4,020 links) is slightly below the prototype's own
   pre-dispatch measurement (1,879/4,024, spec's T3 table) — expected, and documented in-code.** The
   prototype (`…/scratchpad/proto3.js`) compares row TVL to the floor with no tolerance
   (`r.tvl >= eff && r.tvl > 0`). The shipped implementation adds Territory note T2's 0.5% DOWNWARD
   tolerance on the floor (`toleratedFloor = floor * 0.995`) to absorb the ~3-significant-digit display
   rounding on rendered TVL figures — this can only ever let a FEW more rows qualify (fewer flags), never
   the reverse, exactly as T2 specifies. The 1-page/4-link delta is that tolerance doing its job on rows
   that sit within 0.5% of their page's floor. Both numbers clear the ≥1,700 acceptance bar by a wide
   margin; I did not chase an exact match to the prototype's un-tolerant number because the spec explicitly
   directs the tolerance to be added and explicitly frames it as "more conservative, never less."

5. **`effectiveMinTvl()`'s NaN handling is a directed deviation from a LITERAL byte-for-byte mirror of
   app.js:927, not from the spec.** app.js:927 itself is
   `params.has('minTvl') ? parseInt(params.get('minTvl'), 10) : DEFAULT_MIN_TVL` — a present-but-malformed
   value flows through as `NaN` in the real app (which then fails every `tvlUsd >= NaN` comparison,
   functionally reading as "zero pools" anyway). The **operator's build brief** (not `specs/175.md` — the
   verifier correctly caught this mis-citation post-hoc; no NaN statement exists anywhere in the spec or its
   Territory notes) specified "a present-but-NaN value falls back to `defaultMinTvl`", and I implemented
   exactly that behaviour, which is the conservative direction (never a bare `NaN`
   floor), which happens to converge to the same practical outcome (a malformed floor never quietly
   qualifies anything) via a cleaner, explicit path rather than relying on NaN-comparison semantics. Noted
   here per the spec's own request to record every deviation, however small.

## Explicit answers to the two questions the spec asks me to write down

**(a) Does the `poolTypes` constraint end up applied on the static-page population, and why (not)?**
**No.** `prescanStaticPages()`'s level-3 check does **not** call the shared `countQualifyingPools()` helper
at all — it can't: that helper's `token`/`chain`/`protocols`/`poolTypes`/`minApy` filters all read real pool
fields (`symbol`, `chain`, `project`, computed pool type, `apyBase`/`apyReward`) that `parsePageOwnPools()`
never captures (Territory note T2 only describes parsing the LAST `<td class="num">` cell — the TVL money
figure — nothing else is on the rendered row in a form worth re-parsing). Calling `countQualifyingPools()`
against `parsePageOwnPools()`'s `{tvlUsd}`-only rows would make `token && !symbolMatchesTokenMirror(undefined, token)`
true for every real token page (since `p.symbol` is always undefined), collapsing every real page's count to
zero and making the check vacuously fire everywhere — the opposite of the measured 0-on-post-173 result.
So static-page level 3 applies **only the TVL floor** (with the 0.5% tolerance) to the page's own rows;
`token`/`chain`/`protocols`/`poolTypes`/`minApy` are implicitly satisfied by the fact that the page's own
row set is already the pre-filtered population its generator drew from for that exact token/chain — level 3
here is purely "does ANY row on this page clear the link's TVL floor," which is the whole of what's
checkable from a TVL-only row set and matches the validated prototype (`proto3.js`) exactly in spirit.

**(b) Exact final state of `test_audit_text_surfaces.js`'s line-337 assertion.**
The original single assertion (`assertT(hits.length === 0, ...)` over ALL `link-target-integrity` suspects)
is now TWO separate `test(...)` cases:
1. `'link-target-integrity: TRUE NEGATIVE on levels 1/(b)/(c) + level 2 — ...'` — asserts zero suspects
   whose detail does NOT match the level-3 detail signature (`/resolve.*ZERO pools/`). Still exactly zero
   today (levels 1, 2, (b), (c) are all clean on the real committed surfaces).
2. `'link-target-integrity LEVEL 3 (backlog 175, KNOWN FILED DEFECT — backlog 180, ...)'` — a NEW test that
   asserts EXACTLY 2 level-3 suspects exist (one per file), with the `llms.txt` one matching count 1 and
   quoting `poolTypes=Staking`, and the `llms-full.txt` one matching count 62 — pinning today's real,
   previously-unfound defect rather than hiding it, per Territory note T4's explicit instruction.

## Things I could not verify / pre-existing gaps (not caused by this change)

- **`test_seo_surface_audit.js` criterion 2** ("tokens/00.html real render -> junk-slug P1") fails both
  with and without my changes — confirmed by `git stash`-ing all 3 modified files and re-running on the
  unmodified branch HEAD (`8e1771190`). This is a Chromium render-timing/environment issue in this sandbox,
  unrelated to `link-target-integrity`/175. `origin/main` (`d755df0a2`) predates `audit-app.js` and this
  test file entirely (checked via `git worktree`), so it could not serve as the baseline the verification
  brief asked for; the same-branch stash comparison is the closest available proof of pre-existence.
- **`test_seo_cta_targets.js`** fails with 7 dead CTAs (`ankravax`, `gitc`, `mchc`, `n3xt`, `wmetax`,
  `zeal`, `zro` — all "live pool count = 0 at minTvl=100000" against a live `yields.llama.fi/pools` fetch).
  Confirmed pre-existing via the same `git stash` comparison (identical 7-item failure list with and
  without my changes) — this is live pool-population drift for six/seven small tokens since item 173
  shipped, not a `link-target-integrity`/175 regression; this file is not in 175's scope (`audit-app.js`
  and the two `test_audit_*` files only).
- **`node_modules` was absent** at the start of this session (`npm run test:fast` failed immediately with
  "dependencies not installed — run `npm ci`" before any test ran). I ran `npm ci` (installs the versions
  already pinned in the committed `package-lock.json` — no `package.json` edit, no new dependency added)
  so the fast lane and Playwright-backed tests could actually execute; this is a sandbox-state action, not
  a code change, and is reported here for transparency.

## Verification run (verbatim tallies)

1. `node test_audit_prescan.js` → **41 passed, 0 failed**
2. `node test_audit_text_surfaces.js` → **46 passed, 0 failed**
3. `node test_audit_app.js` → 3/3 pass · `node test_audit_runner.js` → 9/9 assertions pass ·
   `node test_seo_surface_audit.js` → **4 passed, 1 failed** (pre-existing, see above) ·
   `node test_audit_pool_prescan.js` → 14/14 pass
4. `node test_llms_link_integrity.js` → 24/24 assertions pass ·
   `node test_seo_cta_targets.js` → **FAIL, 7 dead CTAs** (pre-existing, see above; live-fetch pool source
   was available in this sandbox, so this is a real red, not an environment gap)
5. `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` → all green
   (208 + 9 + 9 assertions)
6. `npm run test:fast` → **37 passed, 1 failed** (`test_seo_cta_targets.js`, the same pre-existing failure
   as step 4)

No test was weakened to force a pass. Every assertion that changed either narrows scope to the sub-rule it
was written for (with the freed-up scope re-asserted elsewhere, never dropped) or pins a genuinely new,
correct finding.
