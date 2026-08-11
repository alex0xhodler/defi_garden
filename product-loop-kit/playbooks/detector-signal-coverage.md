# detector-signal-coverage — playbook

**When:** you are adding a signal to a checker (`prescanStaticPages`, `prescanTextSurfaces`, `prescanPools`,
`validate-sitemaps`, any `test_*` gate), OR a real defect just shipped on a surface that a checker already
covers and the checker was **green the whole time**. The tell is a checker reporting `suspectCount: 0` on a
file that a human then found a bug in by hand.

**Answer in one line:** the checker's signal set was drawn from the *last* bug found, so it can only see that
bug's class — enumerate what the surface **asserts** (not what it contains), and the uncovered assertion
classes are where the next bug already is.

**Not this playbook if the checker CAN see the class and still missed it** — a detector that flags the same
permanent defect on only some runs has a false-negative RATE problem, not a coverage problem. Go to
`detector-detection-rate.md` (added by item 231, 2026-08-05).

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
| 7 · provenance | did it enumerate the declaration or the executor? | 212 → **234** |

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

### The check exists, has a call site, and is still gated shut (added 2026-08-01, item 201)

200's paired trap is "the driver has no check for the condition." 201 is the next costume down, and it
survives 200's own remedy: the driver **does** have the check, the call site **is** there, and the check's
body is fully generic — but the call site's own **trigger predicate excludes the value you are adding**.

`checkResponsive` reads `s.width` for every comparison and every message, with no `360` literal in its body.
All five of its call sites read `if (s.width <= 360)`. So a 768px surface would have rendered, reported
clean, and been counted in `surfacesCovered` — with the width-specific check switched off. Green because
nothing measured it: item 166's vacuous-green, arriving through the lens door.

> **Before adding a lens value, grep the call sites of the condition's check for a predicate on that
> condition, and evaluate the predicate at the new value.** `s.width <= 360` at width 768 is `false`. A
> check whose body is width-generic tells you nothing about whether it will run.

Two rules that fall out, both cheap:

- **Ship the gate and the surfaces in one item.** Either alone is a no-op: widening the gate with no surface
  between the old and new bound changes nothing, and the surface without the widened gate is decorative.
  Say so in the spec so a reviewer can see the halves are load-bearing on each other.
- **Prefer widening the existing predicate over adding an opt-in flag.** A `responsive: true` flag was
  considered here and rejected: the gate is a predicate over the condition, the condition is the policy, and
  a flag lets the next surface silently opt out of the check the lens exists to enable.

**Non-vacuity for a lens is width-specific, not check-specific.** "The check has a red-proof" is not enough —
198's precedent is that a predicate can pass its own test and still be off in production. Force the check to
fire **on a surface at the new lens value** and confirm the emitted finding carries that value
(`detail: ".landing-search-submit has zero-area box at 768px"`, `viewport: "768px"`). A red-proof at the old
value proves only the old value.

**Watch for a guardrail test that quotes the line you are changing.** A prior item's test may assert the call
site as a **verbatim source literal** (`assertT(block.includes("if (s.width <= 360) await checkResponsive(…)"))`).
Widening the gate makes that literal absent and the old test red — which is correct behaviour, not a
conflict to route around. Move the literal with the line (one token), keep every other assertion in that file
untouched, and **prove it is a co-move by removing the call site it guards and showing the assertion still
goes red**. Without that proof, a literal update is indistinguishable from loosening a gate to fit a diff.

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

## The fifth axis: does the allow-list model every CONSUMER? (added 2026-08-02, item 203)

Axes 1-4 all ask about *reach* — which classes, what fraction, which population, under which rendering
conditions. This one asks about a detector whose reach is perfect and whose **model of the world is wrong**.

An allow-list detector ("every X must be one of the known-good X") is only as true as its enumeration of
what produces X. `link-target-integrity` rule (a) asserts every query key on every owned link is a key this
product routes on, and builds the allowed set by parsing `home.html`'s two router arrays plus a hardcoded
`'lang'`. That is not a list of *legal keys*; it is a list of **keys the two routers read** — and it was
written by someone looking at the routers. A third consumer (`analytics.js`'s `captureAcquisition()` list,
which reads `utm_*`/`ref`/click-ids/`src` into every event) has always existed and the gate never knew.

**The tell, and it is counter-intuitive:** the detector does not go quiet, it goes *loud on something
correct*. Nothing looks broken until someone ships a legitimate value and the gate calls it a defect —
here, tagging the estate's `?pool=` links would have fired a P1 on all 4,360 pages. So this axis is found
by a **blocked correct change**, never by a clean tick. Axes 1-4 are found by asking what the detector
misses; this one is found when the detector accuses you.

### Steps

1. **When a gate rejects a change you believe is correct, ask what the gate believes — before you edit it.**
   The wrong question is "how do I get my value past this." The right one is "what proposition does this
   allow-list encode, and is it true?" Read how the list is *built*, not what is in it.
2. **Enumerate the real producers/consumers of the thing being validated.** Grep for every reader of the
   value class (here: every place a query param is read — both routers, `analytics.js`, `translations.js`).
   A source the list was never derived from is the finding.
3. **Check whether the file already documents the gap.** Allow-lists accrete explicit exceptions, and each
   one is a consumer someone hit before you and patched by hand. Item 203's fix was one line above the bug:
   `'lang'` was already allowed explicitly *"because it is read by translations.js, not the router."* One
   hand-patched exception = a missing axis; two = the enumeration is the bug, not the entries.
4. **Derive the new source, never re-type it.** Parse the real list at scan time (item 166's bug class: a
   second copy that drifts and silently allows keys nothing reads). Inherit the existing failure path's
   shape so callers need no new branching, and **return null-and-skip, never a wildcard**, on parse failure.
5. **Prove the widened gate still catches things — with a mutation on the NEW source.** This is the whole
   safety argument and it is the one check the builder's own tests cannot make (a wildcard makes every
   positive test pass *more* easily; green looks identical either way). Three probes, and the third is the
   one that matters: an unknown key still fires; corrupting the new source degrades to a skipped rule;
   and removing a **different** key from the new source makes real usage of *that* key flagged again.
   Only the third distinguishes "derived per-key" from "any list at all ⇒ blanket pass."

**Traps specific to this axis:**
- **The shortcut that breaks routing.** The obvious fix is to add the key to the router's own array. Here
  that would have made `src` an IA-router *trigger* (`needsAnalytics`/`needsPlanner`), sending bare
  `/?src=x` to the wrong face of the product. Widening the *validator* and widening the *router* look
  similar in a diff and are not remotely the same change.
- **Widening to unblock yourself is indistinguishable from widening because it is true** — in the diff, in
  the tests, and in the passing CI. Only the step-5 mutation tells them apart, so it is not optional.
- **The diagnostic string outlives the model.** Rule (a)'s message still names only the two router arrays;
  a message that lists the old sources teaches the next reader the old, false model.

**Provenance:** distilled from item 169 (`specs/169.md`, `169-notes.md`) — the `link-target-integrity` signal —
generalising the pattern named in its backlog row and previously hit by items 148 → 159/160 → 166/167.
Extended by item 175 (`specs/175.md` Territory notes T1–T8, `175-notes.md`): the three-level model, the
population-completeness rule, and the stale-clean-assertion trap. Extended by item 183 (`specs/183.md`
Territory notes T1, `183-notes.md`): the repair-blinds-the-detector inverse case and the shape-first
severity rule. Extended by item 184 (`specs/184.md`, `184-notes.md`, `184-pr.md`): level 2 over the HTML
estate — live-population selection, the three run-states, the 100%-today branch condition for a fatal
contract rule, and the "ship it green, prove it can go red" standard. Extended by item 197's build (`specs/197.md`, `197-notes.md`, `197-pr.md`): the three transplant traps —
the classifier fallthrough, the sub-rule whose precondition fails (and stamping the omission into the output),
and never funding a new population out of the incumbent's budget. Extended by item 199 (`specs/199.md`, `199-notes.md`, `199-pr.md`): the LENS axis — rendering conditions whose population is one — and the second-render-must-not-count-as-a-first rule that keeps 192's throughput honesty intact. Extended by item 200 (`specs/200.md`, `200-notes.md`, `200-pr.md`): ask the lens question per surface KIND (one covered row makes the whole checker read as covered — `dark: true` existed on 2 of 4,257 lines, both pool-detail, while the entire landing→planner→bloom funnel had none), assert the matrix as a property rather than a name list, and the paired "a lens that cannot see" trap — a condition added to a driver that has no check for it is decorative coverage. Extended by item 201 (`specs/201.md`, `201-notes.md`, `201-pr.md`): the gated-shut variant — the check exists, has a call site and a generic body, but the call site's own trigger predicate excludes the lens value being added (`s.width <= 360` evaluated at 768); ship the gate and the surfaces as one item, widen the predicate rather than adding an opt-in flag, prove non-vacuity AT the new lens value, and treat a prior test's verbatim source literal as a co-move that must itself be red-proved. Extended by item 203 (`specs/203.md`, `203-notes.md`, `203-pr.md`): the CONSUMER-enumeration axis — an allow-list is only as true as its list of what produces the thing it validates, it is discovered by a *blocked correct change* rather than a missed defect, the file's own hand-patched exceptions (`'lang'`) are the signpost, and the widened set must be proved non-vacuous by mutating the NEW source on a key other than the one that motivated the item.

---

## FOURTH AXIS — is the population the ARRIVAL population, or just the artifact nearest to hand? (2026-08-02, items 206/207)

Axis 1 asks whether the *signal set* is complete; axis 2 whether the *rate/memory* is; the third axis (197)
whether the *page population* is. All three still assume you are auditing the right set of **things**. This
axis asks where that set came from — and the answer is almost always "whichever committed artifact was
easiest to `require()`".

**The tell:** a checker, a fix, or a rotation resolves its population from a data file that exists for an
unrelated reason. `data/pools-snapshot.json` exists because 059 needed a $10M-railed front-end payload.
Three separate things then quietly adopted it as *the set of pools*:
- `audit-app.js`'s pool-detail rotation (`:610`, `:1556`) → 734 candidates,
- item 105's kpi backfill for SEO arrivals (`app.js:1253-1273`) → `snap.pools.find(…)`,
- `compute-kpis.js`'s history series (header `:9-11`) → the slim per-date point.

Measured against the population users actually arrive on — the **3,669 `?pool=` deep links the estate
emits** — all three reach **420 (11.4%)** and miss **3,249 (88.6%)**.

**Why it is invisible:** every one of those three is individually correct about its own artifact, and none
of them is wrong in a way a test can catch. 105 even *documents* the limitation in its own comment
("a pool absent from the snapshot leaves detailPool untouched and the notes hide as today") — it was
written down and never **measured**, which is the whole failure. A documented limitation with no number
next to it reads as an edge case; the number turned it into the majority case.

**The question to ask, once per checker/fix/rotation:**
> *What population does this draw from, what population do users actually arrive on, and what is the
> intersection as a percentage?*

Two lines of `node` answers it. Run it before believing any clean run, and **write the percentage into the
report** — "clean" without a denominator is the claim this axis exists to break.

**The generalised rule:** `product-audit.md` class 10 already says *"validate a generated link against the
population its generator drew from, not against whatever dataset is nearest to hand"* — that was written
about the 4,233-false-positive `?pool=` liveness trap. This is the **same rule one level up**: it applies
not just to what you validate *against*, but to what you enumerate *over*. Data artifacts are built for a
purpose; inheriting one as a population silently inherits its filter.

**Traps specific to this axis:**
- **The floors are usually not the bug.** Here the estate floors at $100K and the app at $10M, both by
  deliberate human directive (2026-07-11). The instinct to "fix the mismatch" by moving a floor is a
  trust-rail edit on the NEVER list. The bug is the audit inheriting a floor it was never meant to have —
  fix the population, never the rail.
- **A widened population that finds nothing proves nothing.** LEARNINGS 2026-07-27 takeaway 2 applied to
  targets: ship the widening with a positive control (inject a malformed member of the NEW population,
  watch the finding appear, remove it, watch it go) or the clean run is vacuous exactly where it was before.
- **Widening the population usually changes the render/data PATH too.** Sub-rail pools have no snapshot
  record, so they can only be driven through the live-fetch path — and `product-audit.md`'s fixture trap #1
  says the wrong payload shape there renders 0 results and fabricates a wave of dead-end findings. Budget
  for the fixture work; a flood of new "findings" after a population widening is a fixture bug until proven
  otherwise.
- **Falsify the loud hypothesis before ticketing it.** This tick chased two obvious-looking trust-claim
  contradictions first ($10M trust strip vs $100K page copy; `tvlTrendShrinking`'s "keeps clearing our $10M
  floor" on a $1.5M pool) and **both were false** — the landers do not load `landing.js`, and the prose sits
  behind the same `pool.kpis` gate that a sub-rail pool never passes. Record falsifications in the snapshot;
  they are the reason the *real* finding (a blank, not a lie) was correctly framed.

**Provenance:** items 206/207/208, heartbeat 2026-08-02, found by following the first real
SEO-lander → pool-detail journey in the loop's history (`/tokens/jitosol` → `/?pool=fdcccd6a-…`, a
$1,500,009 Kamino pool) out of the prod `page_view` URL breakdown and asking which of this repo's checks
could have rendered that page. None could.

### Resolution — what widening a population actually costs (206 shipped, 2026-08-02)

The audit leg of the three above is fixed. The shape of the fix generalises; reuse it rather than
re-deriving it.

**The population expression, and why the intersection is not optional:**

```
candidates = artifact-nearest-to-hand  ∪  (arrival population  ∩  the set you can actually RENDER)
```

Here: `snapshot ids ∪ (estate ?pool= ids ∩ live pool ids)` — 736 → **3,985 union / 3,984 reachable**.
The `∩ live` leg is a **safety rule, not an optimisation**: a member of the arrival population with no
backing record has no fixture record, so its surface renders the honest empty state and the scanner
raises a dead-end that does not exist in production. Intersecting makes that structurally impossible
instead of merely unlikely, and it costs nothing when the arrival population is healthy (3,669 of 3,669
resolved live). Every degrade path — fetch error, kill switch, prescan off, shape-valid-but-not-live —
must contribute **zero** candidates and **say so** in the reported block plus stderr. A population that
silently widens to members it cannot render is worse than the narrow one it replaced.

**Two things that pass the headline criterion while breaking silently.** Both are worth checking by hand
on any population widening, because a "candidateCount > N" acceptance test is green for both:

1. **A seen-memory cap below the new population.** `ROTATION_SEEN_CAP` was 2,000 against 3,984
   candidates. Drop-oldest memory that can never cover the population means `unseen` never reaches zero,
   `computeRotation()`'s wrap branch becomes permanently dead code, and the cycle counter never advances
   — the never-audited-first guarantee evaporates while every number in the report still looks right.
   This is the identical trap `STATIC_ROTATION_SEEN_CAP`'s own comment documents from 196; the second
   occurrence in two months. **Check the cap against the NEW population, every time.** Raised to 12,000.
2. **Merging the new records into the existing fixture body.** One merged body is the smaller diff and
   changes what pre-existing surfaces see — here `grid-loading`, the one `forceLive` surface, would have
   started receiving thousands of pools it had never seen. Build a **second** body served only to
   surfaces carrying the new marker; every pre-existing surface's fixture stays byte-identical.

**Hoist the extractor, never copy it.** The `?pool=` extraction already existed inside 184's liveness
block. Two copies of an extraction rule drift, and a drifted population is the exact failure this axis
exists to fix — so it became one `extractDeepLinkPoolIds()` helper with two callers. Cost of running it
unconditionally: 1,025 ms over 4,304 pages. Cheap; measure yours and write the number down.

**What the widening actually bought, honestly stated:** on the first real run, **27 of 32** rotation
picks were sub-rail — pools the old population could never have reached. Findings on them so far: zero,
across the verifier's three real non-snapshot renders and the first full tick. That is a *proven
non-vacuous* clean run (the positive control fires on demand), not the old vacuous one — which is a real
result per LEARNINGS 2026-07-27 takeaway 2, and the reason the spec's decision rule accepts it.

**The cost nobody budgets for: cycle time.** At the unchanged 32 picks/tick, a full cycle over 3,984
candidates takes **~125 daily ticks (~4 months)**, against ~23 before. Widening a population without
raising the per-tick budget converts a fast shallow sweep into a slow deep one. That is usually the right
trade — arrival-reachable coverage beats re-auditing flagships — but state it in the spec rather than
discovering it a quarter later, and do not "fix" it by quietly raising the sample budget: that trades
against the wall-clock cap, which is a separate decision with its own guard (192).

**Provenance:** item 206, shipped 2026-08-02, verifier PASS 9/9 tier HIGH. Items 207 (the kpi-backfill
leg of the same three) and 208 (the structural history/kpi leg, deliberately measure-then-decide) remain.

### Corollary, caught one day later (2026-08-03, item 215): widening a population must reach EVERY leg that reads it

206 widened the ROTATION's population to the union — and the same file's PRESCAN kept reading the
snapshot. First post-ship tick: `poolPrescan.candidates = 734` vs rotation `union = 3964`, while
`loadLivePoolIds()` was already retaining the full live records the prescan would need (kept for the
sub-rail fixture body — the data was in memory, the prescan just wasn't pointed at it). Net effect: the
cheap rail-relative checks reach 18.5% of the candidates and the sub-rail 3,230 wait on a ~124-tick
rendered pass for a predicate that needs no render at all.

**The rule:** a "population" is read by more legs than the one you are widening — rotation, prescan,
promotion, budget caps, seen-memory, reconciliation. Before shipping a widening, `grep` the file for
every consumer of the OLD population expression and, for each, either widen it in the same item or write
it down as deferred **with a number** (the "one family per item" companion rule, applied to legs). 206's
spec deferred nothing — the prescan leg was simply never enumerated, so the gap shipped silently and read
as covered ("the audit now scans the arrival population") for exactly the reason axis-3 decoys do.

**The cheap tick-time check that caught it:** compare the run's own reported denominators against each
other — `poolPrescan.candidates` vs `poolRotation.union` came from the same run, same JSON, and disagreed
5.4×. Any two legs of one checker reporting different population sizes for "the pools" is this bug, found
with zero code.

#### Resolution — what widening the second leg cost (215 shipped, 2026-08-03)

**The widening itself was nearly free.** `poolPrescan.scanned` 734 → **3,958**, now equal to
`poolRotation.union` by construction (the test asserts them against each other, never against a
literal). Full-run wall-clock: **3m22.6s** union vs **3m23.4s** snapshot-only — the added leg is inside
run-to-run noise, because the records were already fetched and the predicates are pure. When the data is
already in memory, "widen the other leg" is close to a free coverage multiple; the reason it went
unshipped for a day was that nobody enumerated the leg, not that it was expensive.

**What it found on the first run:** `mean30d-rail-breach` suspects 1 → **15**, all 14 new ones verified
real by id against the live feed (quickswap WMATIC-USDC at 21,383% `apyMean30d`, uniswap-v3
USDT-ESPORTS at 1,336%, …) — every one a low-liquidity pair the $10M snapshot floor excludes, i.e.
precisely the arrival population. `missing-tvl` was feared to explode on sub-rail records and stayed at
**0**: sub-rail pools carry valid `tvlUsd`, just below the display floor. Fear was worth pre-registering;
the measurement retired it in one run.

**The generalizable trap, and it is NOT about populations:** a widened population can reach code that
*marks* surfaces, not just code that counts them. Here, prescan **promotion** could suddenly promote a
sub-rail id, and the promotion path had never needed the `subRail: true` marker because every promoted id
had been a snapshot id by construction. Unmarked, `runAudit()` would have served that render the
snapshot-shaped fixture, the page would have hit its empty state, and the scanner would have reported a
**dead-end finding that does not exist in production** — a fabricated P1 on the north-star surface (171's
lineage). **Rule: when widening a population, find every INVARIANT that held only because the population
was narrow** ("every promoted id is in the snapshot"), not merely every leg that reads it. Grep for the
markers/branches that were previously unreachable, and make one set feed all producers of a marker —
here both producers now mark from the same `subRailOnlyIds`.

**Prove the new leg with a control you have actually seen fail.** The positive control (inject a sub-rail
record breaching the rail → assert suspect + promoted + `subRail: true`) was falsified on purpose during
verification: deleting the marking line made the test fail, then it was restored. A control never
observed failing is not evidence (LEARNINGS 2026-07-27).

**Applicability, stated so the number is not over-read:** this closes *prescan* coverage only. Sub-rail
pools get their numbers checked every tick; the render-only classes (`dead-cta`, i18n leaks, 360px
clipping, console errors) still reach them only via the 32-picks/tick rotation (~124-tick full pass).
Raising that budget trades against the wall-clock cap — a separate decision with its own guard (192).
Say which half of "coverage" a coverage number refers to.

**Provenance:** item 215, shipped 2026-08-03, verifier FAIL→PASS 7/7 tier HIGH. The FAIL was a
documentation-honesty defect, not a code defect: the build session mis-attributed its own mutation of
`signals/audit-static-rotation.json` to "pre-existing drift." Two process rules came out of it —
redirect **both** `AUDIT_ROTATION_STATE` and `AUDIT_STATIC_ROTATION_STATE` before the **first** audit
invocation (not after a baseline run), and never call a dirty file pre-existing without checking the
pickup-time `git status`.

---

## The sixth axis: which VALUE TYPES can the predicate evaluate at all? (added 2026-08-07, items 248/249)

Axes 1-5 ask which claim classes a checker can see, what fraction of the population it reaches, whether the
population is fully enumerated, under which rendering conditions, and whether its allow-list models every
consumer. All six-minus-one still assume that once the checker *reaches* a member, it can **evaluate** it.
This axis is the case where it reaches everything and silently evaluates only some of it, because the
predicate is guarded by a **type test**.

**The tell is a one-line `continue` with a reassuring comment.** `audit-app.js:1071`, the `en-ko-parity`
value-honesty rule:

```js
if (typeof enVal !== 'string' || typeof koVal !== 'string') continue; // function/array/number leaves: parity only
```

Measured against the live dictionary: **391 of 544 keys are strings and get value-checked; 153 (28.1%) are
functions and get key-existence and nothing else.** The blind region is not the boring tail — **~80 of the
153 are `planner.*`** (`bloomHeadline`, `heroTarget`, `shareTweet`, `degenHaircutNote`), i.e. the narrative
copy on the ICP's default surface, plus the whole `tcp*` family behind the generated SEO estate.

**Why this survives longer than the other axes:** the skip is *documented*. `flattenI18nDict`'s own comment
names function leaves as terminal values and even cites `returnStatus` as an example. A skip with an
explanatory comment reads as a considered decision, so nobody re-opens it — where an undocumented one invites
a second look. **A comment explaining why a check does not run is not the same as a decision that it should
not.** Treat an explanatory comment on a `continue` as a finding, not as reassurance.

**How it surfaced (and it was not by the checker):** item 225 added 5 translation keys in both namespaces;
3 of the 5 had byte-identical EN/KO values. The gate caught the two string ones and could not see the third,
``onProtocolChain: (protocol, chain) => `${protocol} · ${chain}` ``. The gap is found by **auditing a commit
the checker just passed**, never by a clean tick.

### The step that matters most: SIZE THE BLIND REGION BEFORE YOU SCORE IT

Axis 3 already states this for page sub-populations (*"size it honestly before ticketing … run the existing
predicates over the unscanned sub-population by hand first"*). **Restated in its weakest form, because it is
not about populations — it is about any blind region, however it was carved:**

> Whenever you find a region a checker cannot see — a sub-population, a leaf type, a lens value, a consumer —
> **apply the checker's own predicate to that region by hand, and put the defect count in the backlog row.**
> The number decides whether you filed a bug or a coverage item, and they rank very differently.

Do it in two passes, weakest last:

1. **The strict pass** — exact equality of the two sides (`en[k].toString() === ko[k].toString()`). Cheap,
   but *too strong*: it misses a KO value that differs from EN and is still English.
2. **The predicate pass** — run the gate's actual rule against the region, normalising the value into
   whatever the rule expects. For a function leaf that means extracting comparable literal text: strip the
   parameter list, strip every `${…}` interpolation, then apply the rule (here: no Hangul AND ≥1 Latin letter).

Worked, on the 153 blind keys:

| pass | result |
|---|---|
| strict (identical source) | **2 of 153 (1.3%)** — `onProtocolChain`, `poolPageTitle`; neither carries Latin prose |
| the gate's own predicate | **1 of 153** — `poolPageTitle`, whose only Latin is the brand name "DeFi Garden" |

So the blind region was **clean**, and the item was filed as latent coverage (5.5) instead of the P1 it
superficially resembled. **This is the whole value of the step.** A 28.1% blind spot on the ICP's default
surface writes itself as an alarming ticket; the measurement is what keeps the backlog rankable — axis 3's
own warning, *"a coverage item oversold as a bug is how a backlog stops being rankable."*

### Writing the fix so the axis cannot recur

- **Do not special-case the type you just found.** `typeof === 'function'` is the same mistake one notch
  wider. Write a **normalising extractor** that returns comparable text for any leaf type and returns
  `null` for what it genuinely cannot handle — then **count and emit the nulls** (`skippedLeafTypes`), so
  the next unhandled type is visible instead of silent. The weakest predicate is *every leaf the dictionary
  can hold is value-checked, whatever its type*.
- **Derive the type census at run time, never pin it.** `functionLeaves === 153` is a literal that re-breaks
  on the next copy change; assert `stringLeaves + functionLeaves === scanned` and that the function count is
  `> 0` and equal to the live count. (196's seen-cap rule and 197's disk-read population rule, one level down.)
- **Non-vacuity must be proved on the newly-covered TYPE.** A red demonstrated on a *string* leaf proves only
  the path that already worked. Force a `planner.*` **function** leaf's literal text to English, confirm the
  gate names that key, restore byte-identically (`md5sum`). This is the type-level twin of 201's
  "non-vacuity for a lens is width-specific, not check-specific."

### The neighbouring trap: a suspect in the blind region may be an ALLOW-LIST omission, not a defect

Both keys the gate *did* catch this tick (`resultsColApy` ko `"APY"`, `resultsColTvl` ko `"TVL"`) were
**correct copy with a missing exemption**: `I18N_UNTRANSLATED_ALLOWLIST` already blessed `navFilterApy`,
`navFilterTvl`, `tvl`, `planner.poolApy`, `planner.poolTvl` and — decisively — `tcpColApy`/`tcpColTvl`, the
token/chain-page column headers for those exact two acronyms.

> **Before "fixing" a new suspect, grep the allow-list for a SEMANTIC SIBLING of the key.** If the same value
> on a different surface is already exempt, you have found an allow-list that lags new key families — a
> two-line data fix — not untranslated copy. Editing `translations.js` here would have shipped a Korean gloss
> the EN side does not carry.

And then price the exemption set, per `guard-exemption-rate.md`: after the fix, **8 of 26 entries (30.8%)
are one repeated acronym pair**, and the next surface with an APY/TVL header adds a 9th. That ratio is over
the *allow-list*, not the population — the exemption **rate** is 8/391 string keys = **2.0%**, far under the
~⅓ threshold at which the mechanism itself is wrong. So the narrow per-key fix is correct today, and the
weaker mechanism (exempt by VALUE over the bounded set `{"APY","TVL"}`) is recorded as the thing to re-ask
when a 9th lands — **not** taken pre-emptively, because the exact-key-path rule is a deliberate
auditability choice (`audit-app.js:955-960`).

**Provenance:** items 248/249, heartbeat 2026-08-07. Found by auditing the *four new keys* item 225's merge
added to `translations.js` after the gate reported 2 suspects — the third identical pair was invisible to the
gate by type. Third narrowing found in this one gate's predicate (item **190** shipped half its conjunction;
item **198** fixed the predicate to key on the KO value alone; this is the first found in its *type* coverage
rather than its logic), which is itself the finding: a gate that has been narrowed three times is a gate
whose predicate should be re-derived from what it guards, not patched again.

---

## Addendum (item 256, 2026-08-10): does the defect SHRINK the gate's population?

**When:** you are building — or reviewing — any gate whose predicate is "X must not appear in POPULATION P",
where P is derived at run time from an artifact in the repo. Run this before writing the test, not after.

**Answer in one line:** if the defect you are guarding against is *a change to the artifact P is derived
from*, then P shrinks at exactly the moment the gate should fire, and the gate is guaranteed green — derive
a second leg from the CONSUMING side and union the two.

**Steps**

1. Name the artifact P is derived from (here: `translations.js`'s dictionary) and the defect class in one
   sentence (here: "a key is deleted/renamed while a call site still references it").
2. Ask the one question: **would the defect, once present, change P?** If the defect removes the very member
   that would match, stop — the gate is vacuous by construction, no matter how good the predicate is.
3. Find the CONSUMING side — the code whose execution produces the visible failure (here: `t('…')` /
   `rootT(…, '…')` call sites in the scripts the audited shells load). Derive a second leg from it. It is the
   leg that survives, because it does not read the artifact the defect edits.
4. Derive the second leg's own file population from the render mechanism too, never a hand list: parse the
   shells (`home.html`, `plan.html`) for local `<script src>` **and** for runtime `addScript('…')` injection
   (item 244's boot barrier — `app.js`/`PoolDetail.js` are in no static tag), and map `.min`/`.compiled`
   artifacts back to sources.
5. Union the legs. Record both sizes in the notes (256: Leg A 904, Leg B 284, union 904) and say plainly that
   equal legs on a healthy tree is expected — **they diverge only when something is broken, which is the
   whole point.**
6. Prove the red on the CONSUMING-side leg specifically: delete the key from the dictionary (and from the
   minified artifact the page actually loads — `home.html:201` serves `translations.min.js`, so mutating only
   `translations.js` changes nothing on screen), render, confirm the finding, restore, `md5sum` both files.

**Resolution:** ship only if the manufactured red fires on the leg that covers the real defect shape. A red
demonstrated on the *other* leg proves the path that already worked (249's type-level twin of this rule).

**Traps**

- *"The gate passed on the fixed tree, so it works."* A gate is only evidence once it has been seen red on
  the exact defect shape. 256's first implementation was green in both worlds.
- *Mutating the source but not the served artifact.* The page loads `translations.min.js` / `app.compiled.js`.
  A source-only mutation leaves the render untouched and the run "green" for the wrong reason.
- *Widening the predicate instead of the population.* The predicate (exact-line match) was never the problem
  in 256; the population was. Check which one your evidence actually indicts.

**Provenance:** item 256, build loop 2026-08-10. Found by building the spec literally (dictionary-derived
population), then running the manufactured defect against it: Playwright showed `"poolNotFoundTitle"` rendered
on the dead-pool surface while `node audit-app.js --only=dead-pool` returned `findings: []`. Fifth narrowing
in this checker family (190, 198, 212, 249) — and the first found *before* merge rather than by a later tick.

## The seventh axis: where did the population COME FROM — the declaration, or the executor? (added 2026-08-11, item 234)

Axis 3 asks *is the enumerated set the whole set?* This axis asks the question one step earlier and it is
not the same question: **which artifact did the guard read to learn the set?** A guard can enumerate its
declared population perfectly, prove set-equality in both directions, ship a self-defeat case — and still
be blind, because the thing it enumerated is a **declaration** (a table, a list, a manifest) while the
thing that decides real behavior is an **executor** (a dispatcher, a router, a runtime read). Every metric
the guard reports is then true of the declaration and says nothing about the executor.

Two instances, one shape:

- **Item 212** — `ANALYTICS_PARAMS` was built by scanning for literal `.get('key')` calls, and the drift
  test was built on the same scan. Blind to `app`, which `home.html:79` reads as
  `ANALYTICS_PARAMS.some(k => params.has(k))`. Guard green; `/?app=1` served the wrong artifact.
- **Item 234** — `edge/x402-core.js`'s `matchRoute()` derived its route ids from `PRICE_SCHEDULE`'s own
  keys, and the mirror test proved `PRICE_SCHEDULE` ↔ `ENDPOINTS` set-equality both directions. Both
  artifacts are declarations. `handleApiRequest`'s `if (path === '…')` chain is the executor. Adding a
  computed-KPI route to the dispatcher **only** — the exact thing the item's `DEFAULT_TIER = 'paid'` rule
  existed to catch — served it **free with the payment gate ON**, and every test in the suite stayed
  green. The default that the spec made load-bearing was unreachable from a real request.

**Answer in one line:** a guard is only as good as the artifact it enumerates — derive the population from
the code path that *runs*, and if the executor is not machine-readable, **making it machine-readable is the
task**, not an optional nicety.

### Steps

1. **Name the executor out loud.** For any guard over a set, write one sentence: *"at runtime, the thing
   that decides is `<file:function>`."* If that sentence names a different artifact than the one the test
   reads, stop — you have this defect before you have written a line.
2. **Test the gap with an injection, not an argument.** Add ONE member to the executor and nothing else
   (234: one `if (path === '/api/sharpe')` in the dispatcher; 212: one new `params.has()` read). Run the
   full suite. If it stays green, the gap is real and now has a reproduction.
3. **Decision rule.** Executor is already a data structure → point the guard at it and delete the
   declaration-derived copy. Executor is a code chain (`if/else`, `switch`, inline literals) → **refactor
   it into a declarative table** and derive the declaration FROM the table, rather than parsing the chain
   with a regex. Parsing is the fallback (RAZOR ex. 5's "making it parseable IS the task"), not the goal:
   a parser is one more artifact that can drift from what runs.
4. **Then prove three-way set-equality, each direction separately**, between executor ids, the declared
   table, and whatever consumer set exists (234: dispatcher ids ↔ `ENDPOINTS` ↔ `PRICE_SCHEDULE`, 3 pairs
   × 2 directions, each with its own self-defeat case). One combined assertion hides which leg is dead.
5. **Re-run step 2's injection as a permanent test**, driving the real executor end-to-end, labelled as
   what it simulates ("a future computed-KPI endpoint someone forgot to price").

**Resolution:** the guard reads the executor; the declaration is derived; the default branch that the spec
leans on is reachable from a real request and has a test that proves it fires.

**Traps**

- *"Both directions are tested, so the mirror is sound."* Both directions between two **declarations** is
  a closed loop. Direction count is not provenance.
- *A hardcoded exception literal in the expected set* (`ENDPOINTS.map(…).concat(['/api/pricing'])`) is the
  tell that a real member exists outside the table the guard mirrors. Fix the source, never the expectation
  — this is `guard-exemption-rate.md`'s rule applied to a one-element exemption.
- *The unreachable default.* A `DEFAULT_TIER`/fallback branch that no runtime path can reach reads as
  protection in every review. Ask which input produces it, then produce that input.
- *Skipping the gate on "not in my set" instead of on "the executor serves nothing".* 234's gate skipped
  when `matchRoute()` returned `null`, conflating "unpriced" with "nonexistent". Key the skip on the
  executor's own answer (a 404), not on schedule membership.

**Provenance:** item 234 (agentic commerce / x402), verifier round 1, 2026-08-11 — the verifier reproduced
the gap by injecting `/api/sharpe` into the dispatcher and watching five test files exit 0. Distilled
together with item 212 (LEARNINGS 2026-07-30, `RAZOR.md` example 5), which is the same shape one year of
loop earlier in this file's lineage.

## AXIS 8 — does the detector read the MECHANISM, or the motivating instance's PUNCTUATION? (2026-08-11, item 266)

**When:** you are building (or reviewing) any guard that finds defects by matching **source text** —
regex over `.js`/`.html`, a grep-shaped scanner, an "is this literal hardcoded?" check. Distinct from axis 7:
axis 7 asks whether the guard watches the *executor* or a *declaration*. This axis assumes it watches the
right artifact and asks whether it can **parse** it.

**Answer in one line:** a regex over source text can only ever see punctuation, so it will encode the
punctuation of whatever instance motivated it — widen it once and the next shape is already there; the
durable fix is to parse, not to match.

**The evidence.** Item 266's guard (hardcoded trust-rail copies) was written *explicitly to honour* `RAZOR.md`,
and three consecutive verifier rounds each found it keyed on the two known instances' punctuation:

| round | shapes that scored GREEN | what they had in common |
|---|---|---|
| 1 | `1e5` exponent, wrapped condition, missing `;` (ASI), `{ K: 100000 }`, `o.K = 1000` | the two known instances were single-line, decimal, semicolon-terminated |
| 2 | wrapped *declaration*, multi-line object literal | only the comparison scanner had been de-lined; three others still `split('\n')` |
| 3 | `(pool.tvlUsd \|\| 0) >= X` — **the repo's house idiom**, and the exact form at the three enforcement lines the item had just repaired | the operand had been assumed to be a bare identifier |

**The one that matters most, and the reason this axis exists.** Closing round 3 surfaced a defect no amount of
pattern-widening would have found: the comment/string stripper **had no notion of a JS regex literal**. A regex
containing an odd number of quote characters (`.replace(/("generatedAt":\s*)"[^"]*"/g, …)`) desynced quote
tracking and **blanked the rest of six whole files from the scan**. The guard was reporting zero findings over
files it had stopped reading — and every green run, every non-vacuity proof and every allowlist set-equality
assertion still passed, because they all draw from the same blinded scan.

**Steps**

1. **Ask what the detector's tokenizer is.** If the answer is "regex + `split('\n')` + a hand-rolled
   comment/string stripper", you have a tokenizer, and it is unvalidated. Validate it *separately from* the
   patterns: feed it a file containing a regex literal with an odd quote count, a template literal with a
   nested `}`, an escaped quote, and a `//` inside a string, and assert the surviving text is what you expect.
2. **Prove the scan reaches the whole file, not just its top.** For each populated file assert a per-file
   non-vacuity signal — e.g. that the stripped text length is a plausible fraction of the source, or that a
   known token near EOF is still visible. Six blinded files were invisible precisely because coverage was
   only ever asserted in aggregate.
3. **Write the predicate against the repo's OWN idiom, not the bug's.** Grep how the codebase actually
   expresses the thing (`(x || 0) >= N`, `Number(x) || 0`, `1e6`) and make those first-class. The instance
   that motivated the item is the positive control, never the grammar.
4. **Attack it before the verifier does**, and name at least three shapes you have not tried. Record the
   result whether they escape or not — an attack that *fails* to escape is evidence; an unlisted shape is not.
5. **If widening the grammar is unbounded, say so with the measurement, not with a hedge.** 266 kept a
   `SCREAMING_SNAKE` key restriction because relaxing it measured 1040 raw / 107 net sites — that is a
   defensible narrowing. The same restriction on a *different* detector cost only 4 sites and was therefore
   indefensible; it was relaxed. Measure per detector.

**Resolution:** the tokenizer has its own tests; per-file reach is asserted; the grammar covers the idioms
the repo actually uses; every remaining shape is named with a number in the guard's own header AND in the
spec's open-residue list.

**Traps**

- *"Three rounds of widening, so it must be tight now."* Each widening bought exactly one shape. Count the
  rounds: if every round found a new one, the ceiling is the method, not the patterns — escalate to parsing.
- *Aggregate non-vacuity hides per-file blindness.* "The scan finds 55 sites" is compatible with six files
  contributing zero because they were never read.
- *The guard's own header is source text too.* 266's header quotes `const DEFAULT_MIN_TVL = 100000;` as
  prose; without comment-stripping the guard reports itself. Assert that it does not.
- *A closure claim written before the last attack.* 266's "class closed: yes" was falsified three times. Write
  the claim as a **list of shapes proven red**, and the residue as a list of shapes proven green — both
  falsifiable, neither a verdict.

**Provenance:** item 266 (WebMCP trust-rail derivation), verifier rounds 1-3, 2026-08-11 — the round-3
counter-example was `test_pool_twins.js:117-118`, two adjacent lines comparing the same quantity to the same
literal where only one was visible to the scan. Extends axis 7 (item 234/212) from *which artifact* to
*whether it is read at all*.
