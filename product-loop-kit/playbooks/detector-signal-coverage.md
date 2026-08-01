# detector-signal-coverage — playbook

**When:** you are adding a signal to a checker (`prescanStaticPages`, `prescanTextSurfaces`, `prescanPools`,
`validate-sitemaps`, any `test_*` gate), OR a real defect just shipped on a surface that a checker already
covers and the checker was **green the whole time**. The tell is a checker reporting `suspectCount: 0` on a
file that a human then found a bug in by hand.

**Answer in one line:** the checker's signal set was drawn from the *last* bug found, so it can only see that
bug's class — enumerate what the surface **asserts** (not what it contains), and the uncovered assertion
classes are where the next bug already is.

## The pattern this exists to break

Three consecutive instances in this repo, same shape every time:

| item | surface | signals the checker had | class that shipped anyway |
|---|---|---|---|
| 148 | `tokens/*.html` | one hand-picked page rendered | 7 junk slugs in the tail of 2,167 pages |
| 159 → 160 | `llms.txt` | numbers + emptiness (`apy-rail-breach`, `broken-number-literal`, `tvl-floor-claim`, `empty-surface`) | 32 **mis-targeted links** (item 166) |
| 166 → 167 | pool-detail | one hardcoded flagship pool (`PREFERRED_POOL_ID`) | every real bug was on a non-flagship pool (122/144/145/165) |
| 169 → 172 | `tokens/*.html` + `chains/*.html` | slugs + numbers (`junk-slug`, `zero-yield-claim`, `broken-number-literal`, `absurd-magnitude`) | **~41,300 links never looked at**, incl. the 4,989 `?pool=` hops into the north-star surface — the same class 169 had just closed on the *text* surfaces two files away |
| 172 → 175 | `tokens/*.html` + `chains/*.html` | `link-target-integrity` — *is the query key routed?* | **1,749 dead CTAs** (item 173). `?chain=Cardano` is perfectly routed; it just returns nothing. The signal shipped the same morning and scored **0** on the 2,200 pages carrying the bug |

Each fix was specced from the previous bug, so each new checker inherited the previous bug's *shape*:
number bug → number detectors; one-page audit → one-page audit. Item 169 is the text-surface twin of 167.
Item 172 inherited 166's definition of "broken link" — an *unrouted param* — and so could not see a routed
param that resolves to nothing.

## A link check has three levels — name which one you are building

This is the generalisation item 175 encodes, and the reason four consecutive link items each missed the next
bug: each built level 1 again, in a new place.

| level | question | catches | cost |
|---|---|---|---|
| 1 **routed** | is the query key one the app recognises? | a key that was never a param (`?search=`) | param-set membership; 172 built it |
| 2 **resolvable** | does the *value* name a real entity — a project slug, a preset key? | a renamed/removed entity still linked | one set lookup per link |
| 3 **non-empty** | does the target, **under its own default filters**, return what the linking page claims? | two internally-consistent surfaces with a broken contract between them | a filter simulation over the right population |

**Level 3 is the only one that catches a mismatch between two surfaces that are each individually correct** —
which is what 173 was: the page was right, the app was right, the contract between them was broken. If your
new link signal is level 1 or 2, say so in the spec and price the level-3 gap; do not let "we added a link
check" stand in for "links are checked".

## The population rule (the trap that makes level 3 hard, and its exact resolution)

Level 3 needs a pool population to simulate against, and picking the wrong one produces a detector that is
confidently, massively wrong. Validating generated `?pool=` ids against `data/pools-snapshot.json` reported
**4,233 of 4,989** links dead — all false (true figure against a live fetch: **15**), because the token pages
draw from the ~16,000-pool feed at a $100K floor while the snapshot is the ≥$10M 746-pool set
(`product-audit.md` class 10).

The rule is not "be careful" — it is exact, and it turns on **completeness at a floor**:

> `data/pools-snapshot.json` is not a *sample* of the feed. Its `minTvlUsd` field says it is **every** pool at
> or above that floor. So:
> - link's **effective floor ≥ `snapshot.minTvlUsd`** → the snapshot is a **complete** population at that
>   floor → simulate against it, **zero** false-positive risk.
> - link's **effective floor < `snapshot.minTvlUsd`** → the snapshot is **incomplete** → it must never be
>   used. Find the population the link's generator actually drew from, or declare the link
>   **indeterminate** — and *report the count you skipped*, so the gap is visible instead of silent.

Where to find the sub-floor population offline: **the generated page itself lists it.** Both SEO generators
render their pool set into one table (one `<tr>` per pool carrying a `tp-pool-link`/`cp-pool-link` anchor and
a TVL money cell), so the page carries the $100K set the repo has no other copy of. Parse the **last**
`<td class="num">` cell, not a fixed column index — the two generators order their columns differently.

**Effective floor** always comes from the app's own resolution, not from the link's literal text:
`app.js:927` — param present → `parseInt(value, 10)`; absent → `DEFAULT_MIN_TVL` (`app.js:801`). An explicit
floor **below** the default is honoured, never clamped up; a simulation that always applies the default flags
item 173's own fix as broken.

Measured on real corpora before any code was written (the step 4 controls, done right): pre-173 bytes
(`git worktree` at `cc243611b^`, 2,200 pages) → **1,879 pages / 4,024 dead links**; post-173 HEAD → **0**.
That gap *is* the proof the signal is non-vacuous, and it took ~80 lines of throwaway `node` to get before
committing to a design.

## The second axis: coverage RATE, not signal set (added 2026-08-01, item 196)

Everything above asks *which classes can this checker see*. There is an independent axis that produces the
same "green checker, real bug" outcome: **what fraction of the population does the checker actually look at
per tick, and does its selection remember what it already looked at?** A checker with a complete signal set
and a 0.3%/tick memoryless sample finds defects by luck.

Two questions, asked in this order, whenever a checker samples rather than sweeps:

1. **Selection** — can this picker ever reach the whole population, or is it structurally pinned?
   (`PREFERRED_POOL_ID` could reach exactly one pool; item 167 fixed that. A hand-picked anchor page could
   reach one of 2,167; item 154 fixed that.)
2. **Throughput** — given it *can* reach everything, how long is a full pass, and does the picker have
   **memory**? A seeded pick with no persisted `seen` samples **with replacement across ticks**, so coverage
   follows the coupon-collector curve, not a linear sweep. Item 191 asked this for pools; 196 for static
   pages.

**The transplant rule — this is the cheap, repeatable move.** When a mechanism gets built for one
population, immediately list the *sibling* populations with the same shape and ask which of them never got
it. The mechanism is already written, tested and exported; applying it elsewhere is a call, not a build.
183 built persisted never-audited-first rotation for pool-detail. The static leg — older blind spot, 3×
the population — kept sampling memorylessly for **13 more items**, and `specs/154-notes.md` had named the
remedy as unbuilt the whole time.

| item | population | selection fixed | throughput/memory fixed |
|---|---|---|---|
| 154 / 157 | 2,195 static SEO leaves | 154 (anchor → rotation), 157 (prescan promotion) | **196** |
| 167 / 183 | ~737 snapshot pools | 167 (flagship → rotation), 183 (never-audited-first) | 191 → 192 (budget 2 → 32) |

Measure it, do not estimate it: drive the real picker over N simulated ticks, threading its own state
tick-to-tick, and count **distinct pages reached** and **re-renders**. Memoryless static sampling over
180 days measured 276 of 360 chain renders (77%) spent re-reading an already-audited page.

**Two traps specific to this axis:**

- **A `seen` cap below the candidate population silently defeats the whole fix.** Drop-oldest eviction means
  `unseen` never empties, the wrap branch becomes dead code, and evicted pages re-enter the pick pool — while
  every run still looks normal. Reusing the pool leg's `ROTATION_SEEN_CAP = 2000` for a 2,109-page estate
  would have done exactly this. Assert the cap against a **disk-read population count**, never a literal.
- **Do not port the sibling's whole apparatus — port the part whose precondition holds.** 192's `baseSeen`
  reconciliation exists only because pool renders can be *skipped* by a wall-clock guard; the static leg has
  no such skip, so porting it would be cargo. Record the precondition in a comment so the omission is a
  decision, not an oversight.

## The third axis: is the POPULATION complete? (added 2026-08-01, item 197)

The two axes above both take the population as given. Axis 1 asks *which claim classes* the checker can see;
axis 2 asks *what fraction of the population* it reaches per tick and whether the picker remembers. Neither
one can see the failure where **a whole sub-population was never enumerated at all** — because every metric
the checker reports is computed over the population it knows about, so a half-size population produces a
**perfectly healthy-looking report**. `scanned: 2186, suspectCount: 0` is exactly what a complete clean scan
looks like; it was also what a 50%-blind one looked like for 13 items.

Real instance: `audit-app.js` built its static population from exactly two calls —
`listLeafPages('tokens')` and `listLeafPages('chains')` — at both collection points (`:1398` prescan,
`:2016-2017` rotation). The repo also ships **`ko/tokens/` + `ko/chains/` = 2,186 leaf pages**, byte-for-byte
the same count as the EN estate, **2,215 `<loc>`s of it submitted to Google**. Not one signal, cheap or
rendered, had ever touched them.

**The three questions, in order:**

1. **Enumerate the population from disk, not from the code.** `ls` the generated dirs, count the artifacts,
   and compare that number to what the checker reports as `scanned`. If they differ, you have found this bug.
   One command: `find <generated dirs> -name '*.html' | wc -l` vs the tick's `prescan.scanned`.
2. **Ask what the checker's collection call CANNOT reach.** A hardcoded directory argument is the tell — the
   same tell as a hardcoded id (167) or a hand-picked anchor page (154), one level up. `grep` the collection
   function's call sites and read the *arguments*, not the function.
3. **Check for a decoy that makes the gap read as covered.** This is what let it survive 13 items:
   `surfacesCovered` contained `pool-detail-ko`, `planner-ko` and `plan-bloom-ko`, so "KO is audited" was
   true — for three *app routes* reached via `?lang=ko`, which say nothing about 2,186 static KO pages.
   **A sibling surface with the same adjective in its name is not coverage.** Grep the covered set for the
   population's own **path prefix** (`/ko/`), never for a label.

**Decision rule:** enumerate the population from disk, assert the checker's `scanned` count **against that
disk-read count** rather than against a literal, and the class cannot recur — the assertion goes red the day
someone adds a new family of generated pages. This is the same rule as 196's seen-cap invariant ("assert the
cap against a disk-read population count, never a literal"), applied to the population instead of the cap.

**And size it honestly before ticketing.** Run the existing predicates over the unscanned sub-population by
hand first (`prescanStaticPages({pages: koLeaves})` → `0 suspects`). If it comes back clean, say so in the
row: this is **coverage exposure, not a live bug**, and the value is the *render-only* classes reaching the
sub-population for the first time plus every future signal covering the whole estate by construction. A
coverage item oversold as a bug is how a backlog stops being rankable.

The counterweight that keeps it worth doing: **item 190 was a KO-only defect on those exact pages**, found by
a `translations.js` dictionary diff — a completely different checker. The estate scan could not have found it
then, and could not have found it the next day either.

| axis | question | items |
|---|---|---|
| 1 · signal set | which claim classes can this checker see? | 148 → 159/160 → 166/169 → 172 → 175 |
| 2 · rate + memory | what fraction per tick, and does the picker remember? | 154/157 → 196 · 167/183 → 191/192 |
| 3 · population | is the set it enumerates the whole set? | **197** |

### Building the axis-3 fix: three traps the transplant itself introduces (added 2026-08-01, item 197 build)

Widening a population is a *call, not a build* — but the call has three sharp edges, and all three were live
in 197. Check each one by name before claiming the transplant is mechanical.

1. **The classifier's FALLTHROUGH, not its new branch.** Any per-item router (`routeToLeg()`, a
   `scannedByFamily` counter, a lane picker) ends in a bare `else → <incumbent>`. Adding `ko/tokens/` to the
   population without reordering the prefix tests is *silently* wrong in one direction only: `startsWith('chains/')`
   never matches `ko/chains/…`, so the new rels sail past every explicit branch and land in the default leg.
   The detector then records pages it never opened as *audited* and skips them. **Rule: test the more specific
   prefix first, and read the `else` branch as if it were a `catch(){}`** — ask what wrong thing it now
   swallows, not whether the new branch is right.
2. **A sub-rule whose PRECONDITION fails must not be transplanted — and the omission must be in the output.**
   Not every signal in a checker earns the wider population. 197's `?pool=` liveness sub-rule was left EN-only
   because the KO half was *measured* to emit an identical id set (42,604 links / 3,696 ids): running it would
   have doubled the resolution cost to reproduce every existing finding. The rule from 196 (*port the part
   whose precondition holds*) needs this second half: **stamp the narrowing into the emitted result**
   (`poolLinkLiveness.scope: 'en'`), because a scan that quietly checks less than its name implies is the
   exact failure this whole playbook exists to prevent. A comment is not enough — the next reader reads JSON.
3. **Never pay for the new population out of the incumbent's budget.** A fixed render budget split across a
   doubled population halves the coverage you already had — a throughput regression that no test asserts
   because no test pins the old number. **Rule: raise the budget, split it explicitly, and keep the incumbent's
   pick count byte-identical** (197: default 6 → 12, `ceil()` deliberately favouring the EN half, EN staying at
   4 tokens + 2 chains). Then *measure* the new wall-clock against the run's own cap and publish before/after —
   and do not borrow a per-unit cost measured on a different surface class (192's 0.19s/surface is pool-detail;
   static leaves cost ~10s each here). A budget justified by the wrong denominator is an estimate wearing a
   measurement's clothes.

**Also expect the spec's own population figures to be stale by the time you build** (the 184 drift lesson,
recurring): 197's spec said 4,372, the checkout said 4,360, one day later. This is harmless *only* because
the acceptance criterion forbade literals and required a disk-derived count. Write the assertion that way and
estate churn is a non-event; write it with the spec's number and the gate breaks tomorrow for no reason.

## The fourth axis: LENS, not rate or population (added 2026-08-01, item 199)

The second axis asks *how much* of a population is looked at; the third asks whether the population is even
enumerated. This one is independent of both: **under how many rendering conditions?** A population can be
enumerated completely and swept at 100%/tick and still be size-1 here.

Ask it as one question, whenever a surface has more than one rendering condition:

> **Enumerate the conditions the checks are written for — viewport, colour scheme, language, degraded
> network — and for each, count how many members of the population are ever rendered under it. Any count of
> 1 is a hardcoded constant wearing a checkmark.**

For pool-detail the answer was: 1280px/light/EN reached 32 pools/tick, while 360px, dark and KO each reached
**exactly one hardcoded pool** — `PREFERRED_POOL_ID`, unchanged since item 167 — so the `responsive` and KO
`i18n` checks had a sample size of one, forever, on the north-star surface. Nothing was disabled; the checks
ran every tick. The number that mattered was simply never written down.

**Cheapest correct fix (199's shape):** do not multiply the rotation. Add a *bounded* extra render of a
subset of the picks it already made, one condition each, cycling the condition by a seed-derived offset so
re-picked members accumulate different conditions over cycles. The lens machinery already exists per surface;
only the surface entries were missing.

**Trap unique to this axis — the second render must not be counted as a first one.** A per-tick throughput
number ("N members/tick → full pass ~K ticks") counts *members*, not *renders*. Give the extra renders their
own marker (`lensPick`, never `rotationPick`), their own counters, and keep them out of the persisted `seen`
set and out of any skip-reconciliation array. Otherwise adding coverage silently inflates the very honesty
number the throughput item was built to protect (192), and a skipped extra render can strip a member from
`seen` that genuinely *was* audited.

### Ask the lens question once per surface KIND, not once per checker (added 2026-08-01, item 200)

199 asked "how many members are rendered under each condition?" and fixed the answer for **one** surface
kind. The trap is that fixing it there makes the whole checker *read* as lens-covered. Item 200, one day
later, on the same file: `grep -n "dark: true" audit-app.js` → **2 hits in 4,257 lines, both pool-detail**.
The entire `landing → planner → bloom` path — every surface between a visitor arriving and `plan_created` —
had **zero** dark renders, and the `landing` surface had exactly one audited entry in total (1280px/light/EN:
no 360px, no dark, no KO). This is 197's tell in a different costume: *"the three `-ko` surfaces that do
appear are app routes via `?lang=ko` — which is exactly why the gap read as covered for 13 items."*

> **Build the matrix, don't spot-check it. Rows = every surface kind the checker drives; columns = every
> rendering condition its checks are written for. Fill in the count per cell. Empty cells are the finding —
> and one full row does not speak for the others.**

**Assert the matrix as a property, not the names as a list.** 200's test asserts *"every funnel kind has ≥1
dark surface, and the landing kind has a 360px, a dark AND a ko surface"* against the parsed surface array,
rather than asserting five hardcoded names exist. A name list goes green forever the day it is written; a
property re-fails the moment a future edit reopens the hole.

**The paired trap: a lens that cannot see.** Adding a condition to a surface whose driver has no check for
that condition buys nothing — it renders and asserts the same things it already did. Before adding a lens,
read the driver for that kind and confirm the condition-specific checks exist there. 200's landing driver had
neither `checkResponsive()` nor the Hangul check (both present in the planner and bloom drivers), so the
surfaces and the two call sites had to ship together or the coverage would have been decorative — the same
half-a-predicate failure mode as 198. Prove the new checks can go red by mutating them, per surface, before
claiming the lens works.

## Steps

1. **List what the surface ASSERTS, not what it holds.** For each artifact, write one line per kind of claim
   it makes. `llms.txt` asserts: a rate (number), a size (number), a name (string), *and a destination*
   (link) — that fourth one had no detector for four items. A page asserts: a title, a count, a price, a
   canonical, a link target, a language.
2. **Cross off the claims that already have a signal.** Read the signals table directly — `audit-app.js:208`
   (`TEXT_SURFACE_SIGNALS`), `:194` (`POOL_PRESCAN_SIGNALS`), `:176` (`PRESCAN_SIGNALS`). What is left over
   is the blind spot, and it is not hypothetical: check the leftover classes against the *committed bytes*
   before writing any code (a 20-line `python3` scan over the artifact is enough, and it is the same scan
   your detector will later encode).
3. **Decision rule.** Leftover class trips on today's committed bytes → **file it as a bug, not a detector
   item** (fix the emitter first; the detector then has a true negative to prove itself against — 160's own
   rule, restated in 169). Leftover class is clean today → **file the detector**, and require a historical
   positive control (see step 4). No leftover class → say so explicitly in the notes; "the signal set is
   complete for the claims this surface makes" is a real, useful finding.
4. **Every new signal needs BOTH controls, executed:**
   - **positive** — real bytes from before the fix (`git log --oneline -- <artifact>` → the commit before the
     fix commit → `git show <sha>:<file>`). Real historical bytes beat a hand-written fixture: a fixture is
     written from your mental model of the bug, which is the same mental model that missed it.
   - **true negative** — the current committed artifact, expected clean. If it goes red, the signal is
     over-tight: **fix the signal, never the surface.**
5. **Prove each sub-rule non-vacuous separately.** Neuter one rule at a time, confirm the control loses
   exactly that rule's suspect and keeps the others, restore byte-identically (`md5sum`), confirm green.
   A single combined cycle cannot distinguish "three working rules" from "one working rule and two dead ones"
   (item 166's verification found exactly that: two guards sharing an exit code stayed green with one removed).

## Resolution

- Detector-only diffs touch no product file, no generator, no generated surface, no dependency — they are
  additive checks and land under the ordinary risk policy (usually HIGH on **size** once tests are counted:
  154 +184, 157 +224, 166 +226 all crossed the 150-line LOW cap).
- Single-source anything the detector compares against (`APY_SANITY_LIMIT`, the router's param arrays in
  `home.html:77-78`). A second hardcoded copy of the truth is itself the drift bug the detector is meant to
  catch.
- One suspect per file per signal, examples capped in `detail`. A systemic defect must not flood findings.

## Traps

- **"The checker was green" is not evidence of health until you have proven it can go red.** (`LEARNINGS.md`,
  2026-07-27.)
- Specifying the new detector from the last bug's *shape* is the failure this playbook is about — resist
  "add another number check" when the last three misses were links, targets and coverage.
- **Diff the shipped predicate against the rule you wrote down (added 2026-08-01, item 198).** The cheapest
  possible miss is not a class nobody thought of — it is a **conjunct that was written down and then half
  implemented**. `product-audit.md` 5(2) specified *"byte-identical to its EN value **AND** containing no
  Hangul"*; item 190 shipped `en === ko` and stopped. Consequences of dropping the second conjunct, both
  measured by probe: an untranslated string **one space** away from its EN twin passes clean, and — worse —
  **the gate goes silent the day EN is reworded without KO**, i.e. exactly when the drift it exists to catch
  appears. Keying on a property of the *pair* when the assertion is about a property of *one side* also
  manufactures false positives (`$100` vs `$100`) that get papered over with allowlist entries, so the
  allowlist grows for a reason unrelated to the bug class.
  **Decision rule: when a playbook or spec states a predicate as a conjunction, the test suite must contain
  one case per conjunct, each proving the OTHER conjunct alone would not have caught it.** Cheapest check on
  an existing gate — 5 minutes, no fixtures: import the exported predicate and run a mutation table of
  near-miss inputs through it. Every row that comes back "clean" and should not have is a finding.
- Comparing whole lines/whole files instead of the extracted claim makes a rule trivially true and therefore
  vacuous (169 rule (c): compare the extracted `% APY` / `$ TVL` literals, not the line).
- A historical fixture that is 200KB does not belong in the repo: commit **verbatim excerpted lines** with the
  provenance sha, and additionally reconstruct the full artifact via `git show` inside a try/catch so the test
  is stronger where git exists and still non-vacuous where it does not.
- Don't extend a new signal across surface families in the same item (text + HTML + sitemaps + OG). One family
  per item — 160's rule, held by 167 and 169.
- **`runAudit()` clobbers the heartbeat's snapshot.** `audit-app.js:115` defaults `outPath` to the *committed*
  `product-loop-kit/signals/audit-findings.json`, so any verification run — including a scoped
  `runAudit({only:[…]})` — silently overwrites the last heartbeat's findings with your partial run. Observed
  twice in item 169's session (build agent and verifier both hit it). Always `AUDIT_OUT=/tmp/… node audit-app.js`
  when auditing for verification, and `git status` the signals folder before committing.
- **Aggregate the whole file, don't `break` at the first hit.** One-suspect-per-file is a *reporting* cap, not a
  *scanning* cap: the suspect's leading number must still be the true total, with the examples capped and a
  `(+N more)` tail. A rule that stops scanning at its first hit reports "1 conflict" on a file with ten and
  looks identical to a healthy file that has one. Caught by the verifier in 169 with a two-group synthetic
  fixture — worth making that fixture the standard probe for any new aggregate signal.

- **"One family per item" has a companion rule: WRITE DOWN the families you deferred, with their size.**
  169 deferred HTML correctly and said so in one clause of its non-goals (`specs/169.md:41`). That clause
  was the whole evidence base for 172 the next week — the deferral is only useful if the next reader can
  find it and price it. State the deferred family AND a number (`prescanStaticPages` covers 2,183 files vs
  `prescanTextSurfaces`'s 2), so the follow-on is rankable instead of rediscovered.
- **When you port a signal to a new surface family, re-derive the rule from that surface's own semantics.**
  A ported rule that reads identically is usually wrong: rule (a) on text surfaces is "is this key routed?",
  which on HTML splits by link path (`/` → the router arbitrates; `/plan.html` → the path already decided;
  `/tokens/…` → the query is inert). The port that copies the predicate instead of the *question* produces
  a detector that is simultaneously too tight and too loose. See `product-audit.md` check 10's HTML half.

- **A new level WILL turn a stale "the real surface is clean" assertion red — that is the signal working, and
  the fix is to narrow the assertion, never to relax it.** `test_audit_text_surfaces.js` asserted *zero*
  `link-target-integrity` suspects on the committed `llms*.txt`; that assertion was true for level 1 and
  became false the moment level 3 existed, because level 3 found **63 real dead links** there (62 in
  `llms-full.txt`'s `## Chain Pages` section, 1 in `llms.txt`'s "High APY staking"). Correct handling, in
  order: (1) narrow the old assertion to the sub-rules it was actually written for, (2) add a separately
  named case pinning the new findings as a KNOWN defect that cites the backlog item you filed, (3) file the
  item. What you must not do: widen the detector's tolerance, delete the case, or fix the emitter inside the
  detector item — that last one is scope creep that also destroys the positive control.
- **Expect the audit's exit code to flip, and check what that breaks *before* deciding it is a problem.**
  Real new P1 findings mean `audit-app.js` starts exiting non-zero on a clean tree. Verify whether the merge
  gate actually runs it (`package.json`'s `test` → `run-tests.js`: it runs the audit's *unit tests*, not the
  audit) before treating red-audit-on-main as a blocker. A red audit whose findings are true is the product
  working.

## The inverse case: a REPAIR upstream can blind a detector without touching it (item 183)

Everything above is about a detector too narrow from birth. There is a second way to go blind, and it
looks like good news while it happens: **someone fixes the product defect by making the failure mode
render something instead of nothing, reusing the same selector.** The detector's alarm goes quiet — which
reads as "fixed" — and in the same edit the detector loses the ability to see the failure at all.

Real instance: item 182 changed `PoolDetail.js`'s `renderProtocolCtaBlock()` so `.cta-button-protocol`
**always** renders — the real "Start Earning" CTA when a URL tier resolves, an honest DefiLlama fallback
when none does. `audit-app.js`'s check asked "is `.cta-button-protocol` present and visible?". After 182
the answer is *always yes*. The daily P1 vanished (1 finding, 0 blocking) **and** a pool where the
north-star `protocol_link` emitter does not exist now audits clean. Not one line of `audit-app.js`
changed.

**Steps — when a long-running finding goes quiet:**
1. Find the commit that quieted it (`git log -S'<the selector or copy the check asserts>' -- <product file>`).
   A detector that goes green with no detector change means the *product* changed.
2. Read the repair. Ask the one question that matters: **does the failure mode now render something the
   detector's predicate accepts?** Same class, same selector, same test id — all are the tell.
3. Decision rule: if the failure now renders a *different shape under the same selector* → the detector
   must assert the **shape**, not the presence. If the failure now renders *nothing different* → the
   repair genuinely closed the class, and the detector is fine.
4. Re-derive the check from what the surface is supposed to *prove* (here: "the north-star CTA exists"),
   not from the DOM node it used to be absent from.

**Traps:**
- **A quiet gate is not evidence of a fixed product.** Prefer "why did this go quiet?" over "good, it's
  green" — especially the run right after a related item merged.
- **Don't let the newly-visible failure be auto-downgraded by the old finding's excuse.** When you add
  provenance/classification to explain a finding, scope the downgrade to the shape it causally explains.
  183 initially applied one kind→severity table to *both* shapes, which would have downgraded a genuinely
  **absent** element using protocol-URL evidence that has no causal link to why it vanished. The verifier
  caught it. Severity must be shape-first, kind-second.
- **The honest fallback is still a defect on the metric surface.** 182's DefiLlama fallback is correct
  product behaviour *and* means half the north star is absent on that page. Both are true; the detector's
  job is to say so, not to pick a side.

## Level 2 needs a LIVE population — and shipping it green is the normal outcome (item 184)

**When:** you are building level 2 (`resolvable`) for a value class whose entity set lives off-repo — pool
ids, protocol slugs — rather than in a committed file.

**Answer in one line:** resolve against the **live** feed, never the committed snapshot, and classify every
miss with 181's contract/stale/drift split before deciding the gate's verdict; a level-2 gate that ships
**green** is the expected result, not a wasted item.

**Steps:**
1. **Pick the population deliberately.** `data/pools-snapshot.json` is pre-filtered to the app's $10M floor —
   validating ids against it is the class-10 trap (item 175 measured ~4,233 false positives). Level 2 for
   pool ids means a live `https://yields.llama.fi/pools` fetch. Node-side network is open (2026-07-12
   standing decision); browser-originated is not.
2. **Never let a fetch failure pass the gate silently.** Three states, not two: `ran` · `unrun` (requested,
   failed → blocking finding) · `not requested` (kill switch → silent). Collapsing `unrun` into
   `not requested` turns a network blip into a green gate.
3. **Split repo-decidable from live-decidable before you write a single threshold.** Anything invariant to
   live data (malformed id shape; a link the page's own rows do not back) is `contract` — fatal at count 1,
   because no data change can cause or cure it. Everything else goes through 181's stale/drift split.
4. **Decision rule for a new fatal contract rule:** measure it over the whole estate first. If it holds at
   **100% today**, ship it fatal (181's own branch condition). If it does not, it is a repair item, not a
   gate rule.
5. **Reuse the budget, never restate it.** One `DRIFT_BUDGET_FRACTION`, imported. If the denominator differs
   from the original surface's (184 counts distinct link *ids*; 181 counts *pages*), say so at the call site
   — an honest reuse, not a silent one.
6. **Expect the measured numbers to have moved since the spec was written.** Re-measure, publish both, and
   account for the delta. 184's spec found 4 dead links; the build found 1, and *not one of the same four* —
   the daily bake had resolved them. Zero set overlap between two measurements on an unchanged tree is the
   signature of drift, and it is evidence, not noise.

**Traps:**
- **Repairing instead of gating.** If the dead set is inside the drift budget, regenerating the surface to
  make the gate green ships a repair and leaves the gate unbuilt — the opposite of the item. `git diff` over
  the generated dirs must be **0 lines**.
- **A green gate nobody has seen fail.** Prove non-vacuity three ways: synthetic cases per class, the real
  corpus asserted green, and a **copy** of a real page broken in a scratch dir — then assert the original's
  md5 is unchanged, so the proof can never have come from editing the estate.
- **Registration is part of shipping.** `run-tests.js` parses the exact chain out of `package.json`'s
  `test:serial`; it does **not** glob `test_*.js`. An unregistered test file is a gate that never runs.
  Note also that `classifyLane()` is *transitive* — a Node-only test that requires `audit-app.js` lands in
  the **browser** lane. State the lane; do not report plain-lane coverage you do not have.

**Provenance:** distilled from item 169 (`specs/169.md`, `169-notes.md`) — the `link-target-integrity` signal —
generalising the pattern named in its backlog row and previously hit by items 148 → 159/160 → 166/167.
Extended by item 175 (`specs/175.md` Territory notes T1–T8, `175-notes.md`): the three-level model, the
population-completeness rule, and the stale-clean-assertion trap. Extended by item 183 (`specs/183.md`
Territory notes T1, `183-notes.md`): the repair-blinds-the-detector inverse case and the shape-first
severity rule. Extended by item 184 (`specs/184.md`, `184-notes.md`, `184-pr.md`): level 2 over the HTML
estate — live-population selection, the three run-states, the 100%-today branch condition for a fatal
contract rule, and the "ship it green, prove it can go red" standard. Extended by item 197's build (`specs/197.md`, `197-notes.md`, `197-pr.md`): the three transplant traps —
the classifier fallthrough, the sub-rule whose precondition fails (and stamping the omission into the output),
and never funding a new population out of the incumbent's budget. Extended by item 199 (`specs/199.md`, `199-notes.md`, `199-pr.md`): the LENS axis — rendering conditions whose population is one — and the second-render-must-not-count-as-a-first rule that keeps 192's throughput honesty intact. Extended by item 200 (`specs/200.md`, `200-notes.md`, `200-pr.md`): ask the lens question per surface KIND (one covered row makes the whole checker read as covered — `dark: true` existed on 2 of 4,257 lines, both pool-detail, while the entire landing→planner→bloom funnel had none), assert the matrix as a property rather than a name list, and the paired "a lens that cannot see" trap — a condition added to a driver that has no check for it is decorative coverage.
