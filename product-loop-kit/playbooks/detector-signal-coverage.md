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

**Provenance:** distilled from item 169 (`specs/169.md`, `169-notes.md`) — the `link-target-integrity` signal —
generalising the pattern named in its backlog row and previously hit by items 148 → 159/160 → 166/167.
Extended by item 175 (`specs/175.md` Territory notes T1–T8, `175-notes.md`): the three-level model, the
population-completeness rule, and the stale-clean-assertion trap. Extended by item 183 (`specs/183.md`
Territory notes T1, `183-notes.md`): the repair-blinds-the-detector inverse case and the shape-first
severity rule.
