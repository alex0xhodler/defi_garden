# RAZOR — the weakest-hypothesis rule (loop v2)

> **No claim more specific than the evidence supports; no check narrower than the class it guards.**

Two sides of one razor. The first side governs what the loop **asserts** — snapshots, verdicts, PR
explainers, predictions. The second governs what the loop **builds to catch things** — detectors, guards,
tests, fixes. Both say: when you infer a rule from a handful of observations, adopt the WEAKEST hypothesis
consistent with the evidence — the one with the largest extension — not the most specific one that happens
to explain the instance in front of you.

Three weeks of this repo's history is one long argument for it. Every entry below is a case where the
loop induced the SHORTEST hypothesis (the last bug's exact shape) and the next defect landed just outside it.

## Worked examples — strong hypothesis → what it missed → the weak form

**1. `148 → 159 → 166 → 173` (then 212, then 219) — the detector chain.**
`product-audit.md`: *"a checker's signal set is always drawn from the last bug someone was bitten by, so
the next bug is in whatever class no one has been bitten by yet."* Four consecutive P0/P1s found **by hand
while the scanner was green**, each because the new check was induced as the most specific hypothesis of the
previous instance: a number bug produced number detectors, a one-page audit produced a one-page audit.
Weak form of the whole chain: enumerate what the surface **asserts**, not what the last bug contained.

**2. `122 → 144` — magnitude vs rail.**
Strong: `ABSURD_MAGNITUDE = 1e11` (induced from 122's `−900,719,925,474,097.9`). Missed:
`apyMean30d = 36452.38798` rendering as a trusted "30d Mean APY" card on balancer-v2 WSTETH-AAVE — only
3.6e4, so it sails through, while being **36× `APY_SANITY_LIMIT`**, and the pool's `totalApy = 0.24` keeps
it un-flagged. Weak form, and it strictly contains the strong one: **any rendered figure outside the bound
the product itself declares — rail-relative, per-field, every render site of the field.**

**3. `166 → 173` — parse vs deliver.**
Strong: "a link must parse" (is the query key in `ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}`?). 172 shipped
that signal and scored **0** on the 2,200 pages carrying the bug the same morning — `?chain=Cardano` is
perfectly routed, it just returns nothing. Weak form: **a link must deliver what its page claims** — simulate
the target under its OWN default filters and compare against the count the linking page states. It found
**1,749 dead CTAs across 2,200 indexed pages (79.5%)**. Level 3 is the only level that can see a defect where
both surfaces are individually correct and the CONTRACT between them is broken.

**4. Item 138 — the repair side of the same error (LEARNINGS 2026-07-30).**
Strong: add one `PROTOCOL_URLS` entry for `sky-lending`, ship a 2-fixture test guarding **that one
protocol**. Correct, verified, and it closed nothing: the map covers **70.9%** of pools, so
**216 pools / $8.9B TVL / 134 projects** lose half the north star whenever the runtime fetch doesn't land,
and the result is cached permanently so the first visit decides. Weak form: **ask what the entry is an
instance OF, and whether the mechanism that produced the gap is still producing it.** The test to apply
before calling such an item done: *if this exact defect appeared in a different member of the same
population tomorrow, would anything catch it?*

**5. Item 212 — a guard aimed at a resemblance.**
Strong: build the mirrored param list by scanning the app for literal `.get('key')` calls, and guard it with
a drift test built on the same scan. It passed. It was blind to `app`, which `home.html:79` reads as
`ANALYTICS_PARAMS.some(k => params.has(k))` — so `/?app=1`, the live target of the planner header's analytics
icon, kept serving the wrong artifact. LEARNINGS: *a guard watching a mechanism that RESEMBLES the real one
is strictly worse than no guard — it launders the gap as coverage.* Weak form: **tested set-equality against
the defining arrays themselves, both directions**; and if the original is not machine-readable, making it
parseable IS the task.

**6. Item 219 — buying a wider lens on purpose.**
Every audit check was a DOM read for a defect someone had already thought to name; `grep screenshot
audit-app.js` → zero. The tick scored **82 surfaces / 0 blocking findings** on a page whose bottom band was
permanently covered. The weakness move was to stop naming defect shapes and measure **what the user can see
and press** — geometry AND `elementFromPoint`, at rest and at bottom-of-scroll. Enormous extension; **4 real
defects on day one** (grid-360 P0 unpressable duplicate `.theme-toggle`, grid-360 P1, landing-768 P1 ×2 —
item 179's class still live — grid-token/grid-chain P0+P1).

**7. The 2026-08-02 `src` prediction (resolved 08-04) — the claim side.**
The prediction was stated at the strength of ONE instrument: `page_view` broken down by `src`. That
breakdown is still a single `undefined = 51` row, and reading it alone nearly filed a phantom P1 regression
against a chain that works — `trackPageView` is called only from `app.js`, so planner-bound arrivals (the
exact path the waitlist CTA drives) can never appear in it. The **weakest outcome-level form** — *"some prod
event will carry `src` ≠ undefined"* — had been TRUE days earlier via
`waitlist_opened{src=seo_tokens_hub} = 5`, the first non-`undefined` `src` on any prod event ever.
Rule: predict the OUTCOME and list EVERY instrument that could witness it.

**8. The waitlist cohort (LEARNINGS 2026-07-27) — the scoring side.**
062 / 063 / 066 / 068 / 075 / 079: **six experiment windows closed on one identical zero**, because each
item's payoff existed only under one specific unobserved future (a visited funnel). *"Six windows closing on
one identical zero is the strongest evidence yet that the loop's measurement discipline is being spent where
there is nothing to measure."* Confidence is not "how sure am I this is true" — it is **across how many
plausible futures does this item pay off**.

## Already ours — practices that were weakness moves before they had a name

- **Non-vacuity proofs.** *"A filter that returns zero is not evidence of health until you have proven it can
  return non-zero"* (LEARNINGS 2026-07-27). A green gate is the weakest possible evidence until the red is
  demonstrated.
- **"Insufficient data" verdicts** and the ≥30 minimum-sample rule — refusing to state a claim stronger than
  the sample.
- **Claims scoped to implemented classes** — *"treat 'the scanner is clean' as scoped to the classes it
  implements — write it that way in the report."*
- **Population-scoped denominators** — *"'clean' without a denominator is the claim this axis exists to
  break."*

## CRITICAL CAVEAT — this repo's defect distribution is NOT uniform

Bennett's theorem holds for **uniformly distributed tasks**. Ours are not uniform, and we have the counts:
the fixed-overlay-occlusion class landed **four times — 179 → 217 → 218 → 220** — with 221/222 still open on
it; generated surfaces produced most of the recent P0s (148, 159, 166, 173, 174). **The playbooks ARE the
accumulated non-uniform prior.** A pure weakness rule would throw that prior away and re-derive it every
tick, which is exactly the wrong trade.

**Two-regime rule:**
1. **PLAYBOOKS FIRST.** Inside a class the loop has already been bitten by, follow the playbook — it encodes
   the measured distribution. Exploit before you explore.
2. **WEAKNESS BEYOND THEM.** The moment you are inducing past the playbooks — a new class, an unclassified
   signal, a check born from a fresh bug, a prediction about an unobserved future — adopt the weakest
   hypothesis consistent with the evidence.

And the rot rule that connects them: when a playbook is UPDATED from a new instance, re-ask whether its
predicate is still the weakest form consistent with what is known. A playbook narrowed to its latest instance
has become the very failure it documents.

## Weakness ≠ small diff

Weakness governs which **HYPOTHESIS** to adopt — the predicate, the claim, the class a fix addresses. It says
nothing about diff size. **Surgical diffs over rewrites is unchanged** (CLAUDE.md hard rule), as is
"smallest change that satisfies the acceptance criteria" and "one surface family per item". The weakest
predicate is frequently the SMALLER diff (compare `36,452% > APY_SANITY_LIMIT` against enumerating magnitude
bands). When the weak form genuinely costs more, the honest move is to ship the narrow fix and state the
class it leaves open **with a number** — never to pretend the narrow hypothesis was the general one.

## Provenance

Bennett, *"The Optimal Choice of Hypothesis Is the Weakest, Not the Shortest"* (arXiv 2301.12987): among
hypotheses consistent with the evidence, the one with the largest extension maximises the probability of
correct generalisation; compression is neither necessary nor sufficient, weakness is both. Bennett's razor:
*"Explanations should be no more specific than necessary."* Adopted as loop v2's organising principle
**2026-08-04**, from this repo's own three-week record — not from the paper's authority.

Every rule added to `prompts/heartbeat.md`, `prompts/build.md`, `specs/_template.md`, `agents/verifier.md`,
`playbooks/product-audit.md` and `playbooks/README.md` under "loop v2" points back here. Companion file:
`VOCABULARY.md` — the lens inventory, i.e. which classes this loop's language can currently express.
