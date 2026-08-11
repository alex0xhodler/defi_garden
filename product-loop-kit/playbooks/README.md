# Playbooks — the compound step

> Idea borrowed from Every's compound-engineering plugin (2026-07-22): *"each unit of work should make
> the next one easier."* Our loop already plans → builds → verifies → learns; this is the missing piece —
> **codify a non-trivial investigation ONCE so the next occurrence follows a checklist instead of
> re-deriving it.**

## What a playbook is
A short, reusable **how-to for a recurring investigation** — not a spec (that's per-item) and not an
experiment result (that's `LEARNINGS.md`). A playbook answers *"when I see X again, how do I diagnose /
classify / fix it?"* with the exact files, functions, and decision rules, so a future heartbeat or build
tick can just follow it.

## Playbooks are the loop's non-uniform prior (added 2026-08-04, `RAZOR.md`)
These files encode the defect distribution this repo has actually measured — the fixed-overlay-occlusion
class alone landed four times (179 → 217 → 218 → 220). **Follow them FIRST**: inside a class already
documented here, exploiting the prior beats re-deriving it. **When you are inducing BEYOND them** — a new
class, an unclassified signal, a check born from a fresh bug — apply `RAZOR.md`'s weakness rule and adopt the
weakest predicate consistent with the evidence, not the shape of the instance in front of you. And when an
update narrows a playbook to its latest instance, that is **rot** — re-widen it in the same edit.

## When to write or update one (the compound trigger)
At the END of any non-trivial **investigation** — a bug root-caused, a signal classified, a
"is-this-a-bug-or-expected" judgment, an audit of where something is emitted. NOT for routine feature
work (that's just a spec). If a playbook for the topic already exists, **update it** — never duplicate.
Both `prompts/build.md` (step 6) and `prompts/heartbeat.md` carry this rule.

## Format (keep it a checklist, not an essay)
```
# <topic> — playbook
When: <the trigger — what you're seeing that sent you here>
Answer in one line: <the usual verdict, so a reader knows the likely outcome before digging>
Steps:
  1. Look at <file:line / function> for <what>
  2. Decision rule: <if A → …, if B → …>
Resolution: <what to do for each branch>
Traps: <the gotchas that waste time>
Provenance: <the LOG/spec entry this was distilled from>
```

## Current playbooks
- `traffic-quality-classification.md` — real users vs crawler/bot traffic (distilled from every status read)
- `gsc-noindex-triage.md` — GSC "Excluded by noindex" intentional vs regression (item 118)
- `analytics-regression-triage.md` — "a Mixpanel property looks wrong/undefined" bug vs expected (item 120)
- `product-audit.md` — drive the real app + find bug classes without traffic (the pre-traffic heartbeat mandate)
- `guard-exemption-rate.md` — a guard you are about to build wants an allowlist: measure the exemption rate against the population FIRST (item 241 — 293 of 306 would have been exempt)
- `headline-figure-provenance.md` — a surface states a "best/highest" figure and names an entity beside it: the figure is selected by extremity and the name often comes from a DIFFERENT record (item 242 — 421 of 2,102 token pages named a protocol that does not pay the stated rate)
- `archetype-coherence.md` — a planner surface shows copy/numbers built for a different goal archetype (item 146)
- `pre-existing-red-triage.md` — a test is red on `main` and isn't yours: product regression vs stale test vs sandbox vs external drift vs stale proxy metric vs deleted-fixture control vs a *widening* the guard's literal never learned about (items 147, 181, 185, 209)
- `loop-container-contention.md` — a subagent reports files changing under it / a "second session" on the tree (item 162)
- `test-gate-observability.md` — before saying "tests green": count what ran, tell environmental reds from real ones, and — when the gate's own helper *parses* what it measures — instrument it instead of grepping, because "dormant" is a claim about the shape you thought to look for (items 163, 185/186)
- `mode-enumeration-staleness.md` — an element is dead/duplicated on ONE route because a mode-conditional rule enumerates only the modes that existed when it was written (item 179)
- `third-party-render-dependency.md` — a user-facing element is conditionally rendered on data from a host we don't control, and the fetch is documented as allowed to fail (item 182); extended with the CSS-`@import` variant, where the dependency is inside a stylesheet and a blocked font CDN suppresses the `<link>` load event that applies the whole design system (item 187)
- `checker-by-design-classification.md` — a checker reports a BLOCKING finding on behaviour another repo artifact calls deliberate (audit says defect, report says working-as-designed): go to the upstream primary source, and if the by-design state and a real defect produce identical classifier inputs, the classifier is missing an INPUT, not a branch (item 194)
- `detector-signal-coverage.md` — a checker was green while a real bug shipped on a surface it covers; also the inverse, where a repair upstream blinds the detector without touching it (items 169/175/183). Six axes now: signal set · rate+memory · population · lens · consumer-enumeration · **value TYPE** — the last added 2026-08-07 (items 248/249), where the predicate is guarded by a `typeof` test and silently evaluates 391 of 544 keys, carrying the general rule: **size a blind region with the checker's own predicate before you score it** (it measured clean, so a 28.1% gap was filed as latent coverage rather than the P1 it resembled)
- `dead-generated-link-repair.md` — a link on a generated surface (`tokens/`, `chains/`, `llms*.txt`, `sitemap-*.xml`) is routed but resolves to nothing: under-floor vs retarget vs omit vs threshold-ladder (items 173/175/180/181); extended with the case a pool-counting simulator cannot see — a URL *shape* the app has no branch to render, plus the rule that every simulator must learn a param value's semantics before you start emitting it (item 188)

- `ecosystem-shaped-predicate.md` — a render treats one chain family well and every other one badly because the predicate tests "is this an *Ethereum* thing?" while being named "is this a thing?"; split it into shape-vs-resolvability, derive the catch-all boundary from a measured population, and never guess an explorer (item 195, originated by 193)
- `dual-source-logic-divergence.md` — the same derived value is computed by two forked copies of one helper and they have drifted: grid vs pool-detail badge (item 130), and the build-script variant where a *generator* forks the product's classifier, poisoning both its own quality gate and every checker that requires it, with no rendered symptom anywhere (item 189)
- `numeral-cell-track-escape.md` — a rendered number collides with or prints over a neighbour: it is almost never the neighbour growing, it is the numeral escaping the track it was allotted, and a previous item's `white-space: nowrap` is usually what made its box un-shrinkable. Carries the four-constraint test for when the row cannot be fixed in CSS at all, the label-yields fix and its BOUND (a one-time headroom purchase, never a width discipline), and why a self-overflow check is structurally blind to the class (item 260)

- `compiled-artifact-mutation-proof.md` — you are proving a rendered test is non-vacuous (or judging such a proof) and the mutation appears to have no effect: `home.html` loads the COMPILED bundle, so every mutate/restore cycle needs `npm run compile && npm run minify` or the browser never sees the change — plus the transient-observation rules a single post-settle DOM sample cannot satisfy (item 207)

- `load-time-event-test-race.md` — a rendered analytics test intermittently misses an event fired from a page-lifecycle (`load`) handler while React-fired events are seen 5/5: instrument `patchedAt` vs `loadAt` + `_suppressionLogged` to tell a harness race from a real bug, and never loosen an assertion without a mutation proving the rest still goes red (item 252 — `session_start` seen 4/5 on planner, 1/5 on landing)

- `cost-gate-measurement.md` — a *measure-then-decide* item hands you a threshold ("< 5 MB, < 250 KB gzipped") and you have to produce the number and apply the rule: size the cheapest **implementable** variant (union / additive sidecar), never the headline population; settle raw-vs-gzipped from the ticket's own wording; and before writing NO-GO, check whether a cheaper *shape* exists that the ticket never considered (item 208)

<!-- Index gap, RE-MEASURED 2026-08-07 (heartbeat) — the old note said "18 files exist, 13 listed"
     and had drifted: 27 playbook files exist, 19 are listed. Still unindexed (8):
     agent-readability-audit, ci-signal-honesty, derived-number-rails, detector-detection-rate,
     fixed-overlay-occlusion, seo-surface-regen-delta, shallow-clone-push-413, stated-threshold-copy.
     Counted by script, not by hand — the previous figure was stale by 9 files, which is the same
     "a written-down number nobody re-measures" failure this kit keeps finding in the product.
     Still not fixed: a candidate ticket, deliberately not filed this tick (the backlog already
     carries 2 new rows and 5 status changes; indexing is bookkeeping, not a defect). -->

