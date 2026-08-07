# 229 build notes — Spotlight packs v2: story-worthiness ranking + hook

Implements `product-loop-kit/specs/229.md` against `generate-spotlight.js`, its four
existing test files, and the regenerated `spotlights/` output. Surgical diff:
`generate-spotlight.js`, `test_spotlight.js`, `test_spotlight_packs.js`,
`spotlights/*` only. No product render path, no `planner.js`/`app.js`/`PoolDetail.js`/
`home.html`, no `translations.js`, no `package.json` deps touched.

## What changed (file:line references are post-diff)

- `generate-spotlight.js:104-171` — two new gates, `isRepresentativeRate` (with a
  shared `representativenessRatio` helper reused by both the gate and its
  `rateRepresentative` story-signal companion) and `isFundableForever` (reuses
  `planner.js`'s `foreverNumber`, never a second implementation). Constants
  `REPRESENTATIVE_REL = 0.5`, `REPRESENTATIVE_ABS_PP = 0.5`.
- `generate-spotlight.js:201-215` — `pickPool`'s explicit `--pool <id>` path now also
  validates both new gates, throwing `SpotlightError` that names the failing gate
  (`isRepresentativeRate` / `isFundableForever` literally appear in the message).
- `generate-spotlight.js:225-375` — new story-worthiness scoring section:
  `percentileRank`/`sortedAsc`/binary-search helpers, `buildStoryContext` (builds the
  gated candidate set + percentile-rank source arrays once per call),
  `storySignals`, `storyScore` (unweighted mean, with the RAZOR.md rationale in a
  code comment), `hookAngle` (restricted to `smallProtocol`/`unusualRate`/`freshness`),
  `scoredCandidates` (shared by `rankCandidates`/`buildCadence`/`buildPack` so none of
  them re-run the same gating pass independently), and the rewritten `rankCandidates`
  (storyScore descending, ties broken by total APY descending).
- `generate-spotlight.js:486-550` — `buildTweetDraft` now takes `hook` and opens the
  tweet with it (body byte-identical below); `buildCanvaFields` gains the additive
  `hook` key; new `buildHook` implementing the three exact templates from spec §3.
- `generate-spotlight.js:645-741` — `buildPack` gains `pools` in its options (used to
  build the story context), and the return object gains `hook`, `hookAngle`,
  `storyScore`, `storySignals`, `daysTracked`, `apyMean30d` — every pre-existing field
  keeps its name/type/meaning (verified by a dedicated additive-only test, see below).
- `generate-spotlight.js:772-822` — `buildCadence`'s next-candidates list now takes at
  most one pool per `project` and each row carries `hookAngle`;
  `renderCadenceMarkdown` prints it.
- `generate-spotlight.js:868` — `main()` now passes `pools` into `buildPack` so the
  live CLI run gets honest population-relative signals (not the single-pool fallback).
- `generate-spotlight.js:893-905` — `module.exports` gains the new gates,
  `REPRESENTATIVE_REL`/`REPRESENTATIVE_ABS_PP`, `buildStoryContext`, `storySignals`,
  `storyScore`, `hookAngle`, `buildHook`.
- **`renderSpotlightCard` (lines 568-642) is byte-unchanged** — confirmed via
  `git diff` on the function body (zero `+`/`-` lines inside it; the only diff hunk
  touching its neighborhood is a line-number-shift context header). Visuals leg
  stays `GATED(225 SHIPPED)` per spec.

## Deviations / judgment calls (spec left these as "Open questions" or under-specified)

1. **`rateRepresentative` formula.** The spec's literal shape is
   `max(0, 1 − min(deviation / REPRESENTATIVE_REL, 1))`, "deviation as in the gate."
   I derived `deviation` as a normalized ratio (`representativenessRatio`) rather than
   the raw pp gap, specifically so that `ratio <= REPRESENTATIVE_REL` iff the pool
   passes `isRepresentativeRate` — the gate's own threshold factors as
   `REL * max(|mean|, ABS_PP/REL)`, so dividing by that same `max()` term makes the
   REL and ABS_PP branches of the gate collapse into one comparable number that both
   the gate and the score read from the same function. This is the one piece of the
   spec I had to interpret rather than transcribe; it is fully documented in the code
   comment above `representativenessRatio`.
2. **`smallProtocol`/`freshness` population is per-CANDIDATE-POOL, not per-distinct-
   protocol.** Spec §2 says "computed over the gated candidate set", and the candidate
   set is explicitly a pool-level set, so a protocol with 2 qualifying pools
   contributes its (identical) aggregate-TVL value twice to the `smallProtocol`
   percentile population. I read this as the literal, defensible interpretation of
   "the gated candidate set" (a set of pools) rather than inventing a protocol-level
   dedupe the spec never asked for. Recorded here as a judgment call, not silently.
3. **`FOREVER_PROBE_MONTHLY = 1`** for `isFundableForever`. `foreverNumber`'s
   finiteness depends only on the sign of the rate, never the monthly magnitude (see
   the code comment), so any fixed positive probe proves the same thing a real goal's
   monthly figure would; I used `1` for clarity rather than borrowing a specific
   `SUBSCRIPTION_GOALS` value that would look coincidental.
4. **Hook's `$<foreverAmt>` template glyph.** `foreverAmtStr` (from `formatUsd`)
   already carries its own leading `$` (e.g. `"$5.9K"`), so I do not prepend a second
   literal `$` before it in `buildHook` — doing so would print `"$$5.9K"`. Documented
   inline at the return statement.
5. **`buildPack`'s single-pool fallback context** (`pools` not supplied) — used only
   by pre-229 pure-unit-test call sites. It degrades honestly rather than
   fabricating a population: with a population of one, `percentileRank`'s `n<=1`
   branch returns `1`, so `smallProtocol`/`freshness` (both `1 - percentileRank(...)`)
   read `0`, `unusualRate` (uninverted) reads `1`, and `rateRepresentative` is
   whatever that pool's own apy/apyMean30d deviation actually is. (An earlier draft
   of this comment incorrectly said all four signals read `1` in this fallback —
   caught in review and corrected; no test asserted the wrong value, so nothing else
   needed to change.)
6. **CADENCE_POOLS fixture (pre-229, `test_spotlight.js`)** — I gave `small-a/b/c`
   equal `tvlUsd` ($15M each) and `apyMean30d == apyBase` so every signal EXCEPT
   `unusualRate` ties across all three, making the pre-229 expected order
   (`['small-a','small-b','small-c']`) hold under storyScore ranking *by
   construction*, not coincidence — this keeps the pre-229 cadence tests
   (`buildCadence honors nextN`, "excludes already-covered", etc., which all assume
   that specific order) passing without a full rewrite. A separate, deliberately
   signal-heterogeneous fixture (`STORY_POOLS`) proves storyScore genuinely diverges
   from APY order in general — see below.

## Tests added

Extended `test_spotlight.js` (new "Story-worthiness scoring (item 229)" section,
~270 lines) and `test_spotlight_packs.js` (229 assertions folded into the existing
committed-pack loop). No new test file — extending the existing two matched the
spec's stated preference, and both already cover pure-unit + CLI + committed-pack
surfaces this item touches. `test_test_registry.js` needed no change since no file
was added (confirmed green, 5/5).

Population fixture `STORY_POOLS` (`test_spotlight.js`): 9 pools that pass both new
gates, deliberately varied on every signal axis (protocol-aggregate TVL, persona-band
APY rank, `count`, apyMean30d deviation) so storyScore order is not forced to
coincide with APY order — plus one duplicate-protocol pool (`p1b`, same project as
`p1`) so the cadence dedupe test is not vacuous — and 6 control pools, one per
exclusion path:

- `curve-ctrl` / `whale-ctrl` — excluded via `isSmallEnoughProtocol`
- `scam-ctrl` / `dust-ctrl` — excluded via `isQualifyingPool`
- `concrete-ctrl` — **positive control only**, mirrors the spec's live measurement
  (project `concrete`, symbol `SRROYUSDC`, 86.51% headline vs a 4.51% `apyMean30d`).
  It appears in exactly 3 assertions, all of which test *that this specific
  deviation gets excluded*, never as the definition of `REPRESENTATIVE_REL`/
  `REPRESENTATIVE_ABS_PP` (those are fixed constants declared independently, with
  their own rationale in the code comment, well before this fixture pool exists).
- `unfundable-ctrl` — 0%/0% pool, isolates `isFundableForever` alone (passes
  `isRepresentativeRate` since deviation is 0, fails `isFundableForever` since
  `foreverNumber` at rate 0 is `Infinity`, not finite)

Assertions cover every acceptance-criteria bullet:
- both gates hold for every pool `rankCandidates(STORY_POOLS)` returns (population,
  not sampled)
- all 4 signals in `[0,1]` for every candidate; `storyScore` equals the
  independently-recomputed mean of the *returned* signals (not re-derived from raw
  pool data — recomputing the mean from the signals object is the "independent"
  check the acceptance criterion asks for, since `storyScore`'s own implementation
  is a one-line mean with nothing else to independently re-derive)
- `hookAngle` ∈ `{smallProtocol, unusualRate, freshness}` for every candidate
- order is non-increasing in storyScore, and NOT equal to the APY-descending order
  (checked programmatically against the same population, not hand-verified)
- `pickPool('concrete-ctrl')` throws naming `isRepresentativeRate`;
  `pickPool('unfundable-ctrl')` throws naming `isFundableForever`
- `buildCadence`'s next list has no repeated project (exercised meaningfully via
  `p1`/`p1b` sharing `alpha-proto`), and each row carries a valid `hookAngle`
- hook honesty: one line, no ban-list word, "tracked" (not "days old") for the
  freshness angle, forever-clause figure == `foreverAmtStr` and rate ==
  `effectiveApyStr` (never `apyStr` when they differ) — asserted over the full
  9-pool generated population
- degen-honesty: the degen-persona pools in this population (`p5`, `p6`) keep the
  ⅓-haircut tweet sentence and their hook never quotes the raw headline as the
  forever basis; a non-degen spot-check confirms no haircut wording and
  `apyStr == effectiveApyStr`
- additive-only: `PRE_229_PACK_FIELDS`/`PRE_229_CANVA_FIELDS` (recorded verbatim from
  the pre-diff `buildPack`/`buildCanvaFields` return statements) are all still
  present with sane types, and every 229 field is present *alongside* them

`test_spotlight_packs.js`'s existing committed-pack loop gained: `isRepresentativeRate`
on the pack's own recorded apy/apyMean30d (reconstructed as a minimal pool-shaped
object, since `isRepresentativeRate` reads `apyBase`/`apyReward` while a pack only
stores the pre-summed `apy` — see the inline comment), `hookAngle` validity, hook
non-empty/single-line/no-ban-word, forever-clause self-consistency, `canvaFields.hook
=== pack.hook`, and `storyScore` == mean of `storySignals`.

## Test results (verbatim)

`node test_spotlight.js` (final, after all mutation restores): **59 assertions
passed**, exit 0.

`node test_spotlight_packs.js` (final, against the regenerated packs): **11
assertions passed**, exit 0.

`node test_spotlight_url.js`: **3/3 spotlight-URL behavior assertions passed**
(browser lane, unaffected by this diff — re-run to confirm no regression).

`node test_spotlight_attribution.js`: **3/3 spotlight-attribution assertions
passed** (browser lane, unaffected — re-run to confirm no regression).

`node test_test_registry.js`: **5/5 assertions passed** (no new file added, nothing
to register).

`timeout 300 node run-tests.js --lane=plain`:
```
run-tests.js: 52 file(s) selected (lane=plain, plain=52, browser=0, timeout=plain:120s/browser:600s, plain-jobs=3, browser-jobs=3)
...
TOTAL pass=52 fail=0 timeout=0 total=52
```
Exit code 0. Every plain-lane file passed, including `test_spotlight.js` (1040ms)
and `test_spotlight_packs.js` (159ms). **No failures — nothing to classify as
pre-existing, no `origin/main` worktree reproduction needed.**
`test_spotlight_url.js`/`test_spotlight_attribution.js` are browser-lane (not part
of `--lane=plain`); both were run individually above and are green.

## Non-vacuity — four separate mutations

Baseline / restored `generate-spotlight.js` md5 (identical before and after every
mutation cycle): **`d08468b3a47cab90de1ec0dc3c908d01`**

For each rule: mutate → run `node test_spotlight.js` → capture RED → restore exact
original text → confirm md5 matches baseline → confirm green again.

**(a) `isRepresentativeRate`** — replaced body with `return true;`.
RED:
```
✗ positive control: concrete/SRROYUSDC-shaped pool (86.51% vs 4.51% apyMean30d) fails isRepresentativeRate specifically
✗ rankCandidates never returns any of the 5 gate-excluded control pools
✗ pickPool(<pool failing isRepresentativeRate>) throws SpotlightError naming that gate
56 assertions passed
FAILED
```
Restore md5: `d08468b3a47cab90de1ec0dc3c908d01` (matches baseline). Green after
restore: 59 assertions passed.

**(b) `isFundableForever`** — replaced body with `return true;`.
RED:
```
✗ isFundableForever excludes a 0%-effective-rate pool while isRepresentativeRate still passes it (gate isolation)
✗ rankCandidates never returns any of the 5 gate-excluded control pools
✗ pickPool(<pool failing isFundableForever>) throws SpotlightError naming that gate
56 assertions passed
FAILED
```
Restore md5: `d08468b3a47cab90de1ec0dc3c908d01` (matches baseline). Green after
restore: 59 assertions passed.

**(c) storyScore sort** — `scoredCandidates`'s sort comparator changed from
`storyScore desc (tie: APY desc)` to plain `poolTotalApy(b.pool) - poolTotalApy(a.pool)`
(the pre-229 behavior).
RED:
```
✗ rankCandidates order is non-increasing in storyScore
✗ rankCandidates order is NOT the same as APY-descending order (storyScore actually changed the ranking)
57 assertions passed
FAILED
```
Restore md5: `d08468b3a47cab90de1ec0dc3c908d01` (matches baseline). Green after
restore: 59 assertions passed.

**(d) cadence protocol-dedupe** — removed the
`if (seenProjects.has(p.project)) continue;` line from `buildCadence`.
RED:
```
✗ buildCadence's next-candidates list on STORY_POOLS never repeats a project (alpha-proto has 2 candidate pools)
58 assertions passed
FAILED
```
Restore md5: `d08468b3a47cab90de1ec0dc3c908d01` (matches baseline). Green after
restore: 59 assertions passed.

All four md5 pairs (before-mutation baseline == after-restore) are identical:
`d08468b3a47cab90de1ec0dc3c908d01` / `d08468b3a47cab90de1ec0dc3c908d01`. Four
distinct assertions went red for four distinct reasons — this is not "one working
rule and three dead ones."

## Regenerated packs

Fetched live `https://yields.llama.fi/pools` (15,679 pools, 2026-08-06), computed
`buildCadence(pools, [], {nextN:5})` to get the top-5 protocol-deduped candidates in
one pass (this already IS the protocol-deduped ranking, so no separate script was
needed), then ran the CLI three times with `--pool <id> --fixture <cached fetch>`
(same cached fetch for all 3 runs, so the 3 packs are internally consistent against
one snapshot rather than 3 separate live calls that could drift against each other
mid-run) to land exactly the top 3 distinct protocols. Deleted the 3 stale
directories (`pareto-credit-usdc-ethereum`, `project-x-whype-usdc-hyperliquid-l1`,
`yo-protocol-usdc-base`) first.

| slug | protocol | pool | apy | tvl | angle | storyScore |
|---|---|---|---|---|---|---|
| `liminal-basis-limusd-ethereum` | liminal-basis | LIMUSD (Ethereum) | 7.61% | $10.83M | `freshness` | 0.9207 |
| `gami-labs-earnusdc-stellar` | gami-labs | EARNUSDC (Stellar) | 7.00% | $20.64M | `freshness` | 0.9151 |
| `gaib-said-ethereum` | gaib | SAID (Ethereum) | 10.83% | $18.44M | `unusualRate` | 0.9095 |

These match the spec's own "Live-data reality check for the builder (2026-08-06)"
reference note almost exactly (same 3 protocols/pools/angles; APY/TVL/days-tracked
differ by the few hours between the spec's measurement and this build's live fetch —
expected, rates drift daily, and 069's rule is that committed-pack tests assert
self-consistency against each pack's own recorded numbers, never against live rates
at test time).

`spotlights/CADENCE.md` regenerated: 3 covered, 5 next candidates (each next row now
also prints its `hookAngle`, per spec §4).

Sample hook (from `liminal-basis-limusd-ethereum/pack.json`):
> "Liminal Basis's LIMUSD pool on Ethereum has been tracked 8 days and already holds
> $10.83M. $3.2K parked there pays your Claude Pro forever at 7.61%."

## What I could not / did not do

- Nothing in the spec's acceptance criteria was skipped. The one place I made a
  judgment call the spec left genuinely open (`rateRepresentative`'s exact
  normalization) is documented above and in the code itself, with the reasoning for
  why it is the natural reading rather than an arbitrary choice.
- I did not build a live-network-dependent default test path (mirroring
  `test_seo_cta_targets.js`'s POOLS_FIXTURE/live-fetch/cache convention) for the new
  population assertions — I used a hand-built, deterministic, network-free
  `STORY_POOLS` fixture instead, matching `test_spotlight.js`'s own house style
  (`FIXTURE_POOLS`/`CADENCE_POOLS`) rather than `test_seo_cta_targets.js`'s. This
  keeps `--lane=plain` fast and deterministic and avoids flakiness from live-network
  dependence in the default test run, while still exercising every acceptance
  criterion as a genuine population-level test (9 candidates + 6 gate-exclusion
  controls, not a single hardcoded pool). I verified the real 15k-pool live
  population separately (via the regenerated packs + the `buildCadence` computation
  above), so the real-world behavior is checked, just not wired into the committed
  test file as a live-network assertion.

## Post-review refinement — covered-protocol dedupe gap (found by the coordinator)

**How it was found:** not by any test — by the coordinator reading the rendered
`spotlights/CADENCE.md` output after the initial build. `liminal-basis` appeared
as BOTH a covered pack ("Liminal Basis · LIMUSD (Ethereum)") AND the #1 next
candidate ("Liminal Basis · LIMUSD (Hyperliquid L1)" — a *different* pool of the
same protocol). The original `buildCadence`'s `seenProjects` set was populated only
from pools it iterated *within the next list itself*; it never looked at which
protocols the already-covered packs belonged to. My original test suite could not
have caught this: every `buildCadence` call in the original test file that exercised
protocol-dedupe passed `coveredPacks: []` (the "never repeats a project" test on
`STORY_POOLS` used `gen.buildCadence(STORY_POOLS, [], { nextN: 20 })`) — there was no
assertion anywhere that fed a non-empty `coveredPacks` array whose protocol
overlapped a live candidate's protocol on a *different* pool id. This is a real gap
in test coverage, not a gap in the implementation logic that a broader run would have
surfaced — hence the new population test added below, specifically targeting this.

**Root cause:** the spec's own rationale for the dedupe ("each post tags a protocol,
so the next-up list must not repeat one") applies just as much to "the protocol the
human is about to post about right after the one they just posted" as it does to
"two rows in the same next-up list" — the original implementation only covered the
latter.

**Fix** (`generate-spotlight.js`, `buildCadence`): seed `seenProjects` with every
covered pack's own recorded `protocol` field before the loop begins, in addition to
the existing per-pool-id `coveredPoolIds` filter:
```js
const seenProjects = new Set((coveredPacks || []).map((p) => p.protocol).filter(Boolean));
```
Both checks are necessary and kept: `coveredPoolIds` stops the *exact same pool*
reappearing; the `seenProjects` seed stops a *different pool of the same protocol*
reappearing. Uses the covered pack's already-recorded `protocol` field directly
(never re-derived from a pool lookup), matching the reuse-never-reimplement
convention this file follows throughout.

**New test** (`test_spotlight.js`, beside the existing "never repeats a project"
test): `"buildCadence's next-candidates list never carries a protocol already
present in coveredPacks, even via a different pool"`. Builds two synthetic covered
packs on protocols (`beta-proto`, `gamma-proto`) that DO have live, uncovered
candidates in `STORY_POOLS` (`p2`, `p3`) on pool ids that are NOT the covered packs'
own pool ids — a self-check (`wouldOtherwiseQualify`) proves this isn't vacuous
(each covered protocol really does have >=1 live candidate that the old
pool-id-only filter would have let through) — then asserts, over the full returned
`cadence.next` population, that no row's `protocol` is in the covered-protocol set.

**Non-vacuity re-run for mutation (d).** The single line that implements the dedupe
(`if (seenProjects.has(p.project)) continue;`) is the shared gate both the
within-list check and the covered-protocol seed route through (the seed only ever
matters if this line reads it), so mutating that one line disables both mechanisms
at once — the correct scope for "mutate the source to disable only that rule."

New baseline md5 (post-fix, before mutation): `cfbf0fb0a786f33a9dc9b9f70f7be4b2`

RED (`node test_spotlight.js`):
```
✗ buildCadence's next-candidates list on STORY_POOLS never repeats a project (alpha-proto has 2 candidate pools)
✗ buildCadence's next-candidates list never carries a protocol already present in coveredPacks, even via a different pool
58 assertions passed
FAILED
```
Both the pre-existing within-list test AND the new covered-protocol test went red
from the same single mutation — confirming they exercise genuinely different code
paths that both route through this one line, not one test with a duplicate.

Restore md5: `cfbf0fb0a786f33a9dc9b9f70f7be4b2` (matches the post-fix baseline
exactly). Green after restore: 60 assertions passed (up from 59 — the one new test).

**CADENCE.md regenerated** (cadence-only, no 4th pack — `loadCoveredPacks` +
`buildCadence` + `renderCadenceMarkdown` re-run directly against the same cached live
fetch and the 3 existing committed packs, not a full `npm run spotlight` invocation,
since that would auto-pick and write a 4th pack directory). `liminal-basis` no longer
appears in "Next candidates"; the list now surfaces 5 genuinely uncovered protocols
(`unitas-usdu`, `tori-finance`, `bitway-earn`, `ember`, `zerobase-cedefi`). Exactly 3
pack directories remain under `spotlights/`.

**Final verification after the fix:**
- `node test_spotlight.js`: 60/60 assertions passed
- `node test_spotlight_packs.js`: 11/11 assertions passed (unchanged — committed
  packs themselves didn't need to change, only the cadence doc)
- `timeout 300 node run-tests.js --lane=plain`: `TOTAL pass=52 fail=0 timeout=0
  total=52`, exit 0

## Post-review finding #2 — `test_vercelignore.js`'s hardcoded MUST_KEEP slug (found by the verifier, post-commit)

**The regression.** After the commit (`894d48b829`), the verifier ran
`node test_vercelignore.js` and got a real FAIL: 144 assertions passed + 3 failures.
`MUST_KEEP` (a hardcoded allowlist asserting specific paths are served, not stopped,
by `.vercelignore`) named `spotlights/pareto-credit-usdc-ethereum/{card.png,pack.json}`
— one of the 3 stale pack directories this item's own regen step deleted. Check (c)'s
own fixture-sanity assertion ("every MUST_KEEP path is a real tracked file") caught
it, correctly, once the deletion was actually committed.

**Why pre-commit green was misleading — a git-tracking-state dependency neither of
us caught during the build.** Before the commit, `git ls-files` (which
`test_vercelignore.js`'s `ALL_FILES` is built from) still listed the OLD
`pareto-credit-usdc-ethereum` files as tracked, because their deletion via `rm -rf`
was only a working-tree change — `git add`/commit had not happened yet — while the 3
NEW pack directories were untracked (also not yet `git add`ed) and so invisible to
`git ls-files` either way. The hardcoded MUST_KEEP entries matched reality by
accident: the old files were still "tracked" in git's eyes even though they no
longer existed as content, and the new files weren't expected to appear yet. Every
`node test_vercelignore.js` run during the build session was against this same
stale-but-passing tracking state. Committing (which stages both the deletions and
the additions atomically) is what flipped `git ls-files` to reality and turned the
mismatch visible. **The lesson recorded here plainly: a test result that depends on
git's index/tracking state, run before the commit that changes that state, is not
evidence about the post-commit world — "pre-commit green" was not evidence.**

**Why derive instead of re-hardcoding the 3 new slugs.** Swapping in the 3 new slugs
would reproduce the identical defect on the very next weekly regen — this item's own
stated purpose is "3 packs/week refreshed with live numbers" (spec 229 evidence
section), meaning the committed slug set is *designed* to churn on a schedule
shorter than most other MUST_KEEP entries' lifetimes. A hardcoded slug list
guarantees `test_vercelignore.js` breaks on cadence, for a reason that has nothing to
do with `.vercelignore` correctness — exactly the class build.md's guard rule and
RAZOR.md name: derive from the machine-readable source (the real tracked-file list
this test already computes as `ALL_FILES`) rather than hand-maintaining a mirror of
it.

**Fix (`test_vercelignore.js`, immediately before the `MUST_KEEP` array):**
`spotlightPackFiles`/`spotlightCardFiles` are now derived at test time as
`ALL_FILES.filter((f) => /^spotlights\/[^/]+\/pack\.json$/.test(f))` (and the
`card.png` sibling pattern), spread into `MUST_KEEP` alongside the one remaining
literal entry, `spotlights/CADENCE.md` (a fixed path, not slug-dependent, so it
stays hardcoded correctly). This feeds the exact same downstream machinery the
hardcoded entries did — the `for (const f of MUST_KEEP) test(...)` loop and check
(c)'s fixture-sanity assertion are untouched; only the SOURCE of the two spotlight
paths changed, from a literal string to a filter over the real tracked-file list.

**Non-vacuity guard (required by the coordinator, and correctly so).** A derivation
that silently returns `[]` (e.g. a typo'd regex, or every pack deleted mid-regen)
would make the `MUST_KEEP` spread contribute zero spotlight entries and the KEPT
loop would just iterate fewer tests — still green, testing nothing for that class.
Added:
```js
test('(c) non-vacuity: at least 3 spotlight pack.json files are tracked (the cadence\'s own 3-pack shape) — an empty derivation would silently under-test this section', () => {
  assert.ok(spotlightPackFiles.length >= 3, ...);
  assert.strictEqual(spotlightPackFiles.length, spotlightCardFiles.length, ...);
});
```
asserting the cadence's own committed shape (>=3, per spec 229 §5) rather than just
`>0`, plus a lockstep check between the two derivations (every `pack.json` must have
a sibling `card.png`).

**Non-vacuity proof, two parts as requested.**

*Part 1 — the new guard itself is not vacuous.* Mutated `spotlightPackFiles`'s regex
to `^spotlights-NEVER-MATCH\/...` (a pattern guaranteed to match nothing):
- Baseline md5 (`test_vercelignore.js`, pre-mutation): `a7ce9ca53d76b76e221a0c38e63254af`
- RED: `✗ (c) non-vacuity: at least 3 spotlight pack.json files are tracked ...` —
  `148 assertions passed (FAILURES above)` / `FAILED`. Confirmed the mechanism the
  guard exists to catch, directly: with the mutation still in place, the individual
  `(c) KEPT: spotlights/*/pack.json` tests (3 of them) simply DISAPPEARED from the
  MUST_KEEP loop rather than failing — only `card.png` KEPT tests and
  `spotlights/CADENCE.md` still ran. Without the non-vacuity guard, this state would
  have reported "all green" while silently testing three fewer things.
- Restore md5: `a7ce9ca53d76b76e221a0c38e63254af` (byte-identical to baseline).
  Green after restore: 152 assertions passed, exit 0.

*Part 2 — the derivation still feeds the real KEPT/EXCLUDED path, not a weaker one*
(the coordinator's separate ask: prove a derived spotlight file that WERE excluded
would still be caught by check (c), the same way the hardcoded entries would have
been). Temporarily appended `/spotlights/` to the REAL `.vercelignore` on disk
(baseline md5 `8d49a86afae41243ffd5d3b5e831001a`):
```
✗ (c) KEPT: spotlights/CADENCE.md
✗ (c) KEPT: spotlights/gaib-said-ethereum/pack.json
✗ (c) KEPT: spotlights/gami-labs-earnusdc-stellar/pack.json
✗ (c) KEPT: spotlights/liminal-basis-limusd-ethereum/pack.json
✗ (c) KEPT: spotlights/gaib-said-ethereum/card.png
✗ (c) KEPT: spotlights/gami-labs-earnusdc-stellar/card.png
✗ (c) KEPT: spotlights/liminal-basis-limusd-ethereum/card.png
145 assertions passed (FAILURES above)
FAILED
```
All 6 derived entries plus the 1 literal entry went red — proving the derived paths
are asserted through the identical `KEPT_SET.has(f)` check the hardcoded strings
used, not a parallel/weaker path. Reverted via `git checkout -- .vercelignore`;
restore md5 `8d49a86afae41243ffd5d3b5e831001a` (byte-identical to baseline). Green
after restore: 152 assertions passed, exit 0.

**Scope widening — recorded honestly, not glossed over.** `test_vercelignore.js` is
now part of this item's diff. It was NOT in the original spec-229 surgical-diff
scope (`generate-spotlight.js` + its 2 test files + `spotlights/*`), and I am not
pretending otherwise: it needed touching because it independently asserts a fact
about files this item's regen step changes (which spotlight pack directories are
git-tracked), and that assertion broke as a direct, mechanical consequence of this
item's own regeneration step, not because of any bug in `test_vercelignore.js`
itself pre-229. `.vercelignore` itself was never touched (only borrowed for a
non-vacuity proof and immediately reverted, confirmed byte-identical above).

**Final verification after this fix:**
- `node test_vercelignore.js`: 152/152 assertions passed, exit 0
- `timeout 300 node run-tests.js --lane=plain`, run against the actual COMMITTED
  git tracking state (working tree clean at `894d48b829` before this fix, `git
  status --short` showing only `test_vercelignore.js` modified after it):
  `TOTAL pass=52 fail=0 timeout=0 total=52`, exit 0 — a genuine post-commit green,
  not the pre-commit false-positive this finding is about.

### Correction #3 — the non-vacuity guard's own predicate was over-tight (`>= 3` → `> 0`)

**Provenance, stated plainly.** The `>= 3` predicate in the guard above was written
by me (the builder) to the operator's own explicit instruction at the time
("at least 3 spotlight `pack.json` files are tracked (the cadence's 3-pack shape)");
it did not originate from my independent judgment about what this file should
assert. Verifier attempt 2 correctly flagged it, and the operator's follow-up
instruction attributed the error to themselves rather than leaving it ambiguous —
recorded here for the same reason: so a later reader can see exactly where the
instance-specific constant (today's committed pack count, 3) entered a file whose
only job is asserting `.vercelignore` correctness, and why it was removed.

**The finding.** The guard's own comment named the failure mode it exists to catch:
a derivation collapsing to **zero** ("if this ever drops to 0 the MUST_KEEP loop
below tests nothing"). But the assertion it paired with that comment was `>= 3` —
today's exact committed pack count, not the zero case the comment describes. The
weakest predicate that separates the known-bad case (0 — nothing left for the
MUST_KEEP loop to exercise) from the known-good case (any real derivation, i.e. >=1)
is `> 0`. `>= 3` is a product/cadence invariant (spec 229 §5's "3 packs" — this
build's one-time regen output) smuggled into a file whose stated job is
`.vercelignore` correctness, not spotlight-cadence correctness; a perfectly benign
future state (1 or 2 packs mid-regen, or a deliberate cadence change to e.g. 2
packs/week) would fail this file for a reason that has nothing to do with what it
exists to check. This is exactly the "weakest predicate that distinguishes
known-bad from known-good" discipline the codebase's other non-vacuity guards
already follow (e.g. `test_test_registry.js`'s self-defeat check removes exactly one
known file, not an arbitrary number).

**Fix.** `spotlightPackFiles.length >= 3` → `spotlightPackFiles.length > 0`; test name
changed from "...(the cadence's own 3-pack shape)..." to "at least one spotlight
pack.json is tracked..."; the guard's comment rewritten to state the `>0`/weakest-
predicate rationale directly instead of citing the 3-pack cadence shape. The separate
`spotlightPackFiles.length === spotlightCardFiles.length` lockstep assertion is
UNCHANGED — the operator confirmed it is legitimately count-independent (it compares
the two derivations to each other, never to a fixed number) and was not part of this
finding. No separate ">=3 as a standing cadence invariant" assertion was added — the
operator was explicit that if that invariant is ever wanted, it needs its own name
and its own justification in its own future item, not folded into this
`.vercelignore` gate under a different assertion's cover.

**Non-vacuity re-proof for the weakened guard.** New baseline md5 (post-fix, before
mutation): `a6e9c66b93ca2df3038cbe22e45a0579`. Mutated `spotlightPackFiles`'s regex
to `^spotlights-NEVER-MATCH\/...` (matches nothing) — same mutation shape as before,
re-run against the now-`>0` predicate:
```
✗ (c) non-vacuity: at least one spotlight pack.json is tracked — an empty derivation would silently under-test this section
148 assertions passed (FAILURES above)
FAILED
```
Confirms `> 0` still catches the zero case exactly as `>= 3` did — the predicate got
weaker without the guard losing its actual power. Restore md5:
`a6e9c66b93ca2df3038cbe22e45a0579` (byte-identical to the post-fix baseline). Green
after restore: 152 assertions passed, exit 0.

**Final verification after correction #3:**
- `node test_vercelignore.js`: 152/152 assertions passed, exit 0
- `timeout 300 node run-tests.js --lane=plain`: `TOTAL pass=52 fail=0 timeout=0
  total=52`, exit 0
