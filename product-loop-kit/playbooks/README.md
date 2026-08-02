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
- `archetype-coherence.md` — a planner surface shows copy/numbers built for a different goal archetype (item 146)
- `pre-existing-red-triage.md` — a test is red on `main` and isn't yours: product regression vs stale test vs sandbox vs external drift vs stale proxy metric vs deleted-fixture control (items 147, 181, 185)
- `loop-container-contention.md` — a subagent reports files changing under it / a "second session" on the tree (item 162)
- `test-gate-observability.md` — before saying "tests green": count what ran, tell environmental reds from real ones, and — when the gate's own helper *parses* what it measures — instrument it instead of grepping, because "dormant" is a claim about the shape you thought to look for (items 163, 185/186)
- `mode-enumeration-staleness.md` — an element is dead/duplicated on ONE route because a mode-conditional rule enumerates only the modes that existed when it was written (item 179)
- `third-party-render-dependency.md` — a user-facing element is conditionally rendered on data from a host we don't control, and the fetch is documented as allowed to fail (item 182); extended with the CSS-`@import` variant, where the dependency is inside a stylesheet and a blocked font CDN suppresses the `<link>` load event that applies the whole design system (item 187)
- `checker-by-design-classification.md` — a checker reports a BLOCKING finding on behaviour another repo artifact calls deliberate (audit says defect, report says working-as-designed): go to the upstream primary source, and if the by-design state and a real defect produce identical classifier inputs, the classifier is missing an INPUT, not a branch (item 194)
- `detector-signal-coverage.md` — a checker was green while a real bug shipped on a surface it covers; also the inverse, where a repair upstream blinds the detector without touching it (items 169/175/183)
- `dead-generated-link-repair.md` — a link on a generated surface (`tokens/`, `chains/`, `llms*.txt`, `sitemap-*.xml`) is routed but resolves to nothing: under-floor vs retarget vs omit vs threshold-ladder (items 173/175/180/181); extended with the case a pool-counting simulator cannot see — a URL *shape* the app has no branch to render, plus the rule that every simulator must learn a param value's semantics before you start emitting it (item 188)

- `ecosystem-shaped-predicate.md` — a render treats one chain family well and every other one badly because the predicate tests "is this an *Ethereum* thing?" while being named "is this a thing?"; split it into shape-vs-resolvability, derive the catch-all boundary from a measured population, and never guess an explorer (item 195, originated by 193)
- `dual-source-logic-divergence.md` — the same derived value is computed by two forked copies of one helper and they have drifted: grid vs pool-detail badge (item 130), and the build-script variant where a *generator* forks the product's classifier, poisoning both its own quality gate and every checker that requires it, with no rendered symptom anywhere (item 189)

- `compiled-artifact-mutation-proof.md` — you are proving a rendered test is non-vacuous (or judging such a proof) and the mutation appears to have no effect: `home.html` loads the COMPILED bundle, so every mutate/restore cycle needs `npm run compile && npm run minify` or the browser never sees the change — plus the transient-observation rules a single post-settle DOM sample cannot satisfy (item 207)

<!-- Index gap, noted not fixed (item 188, 2026-07-31; one line closed by item 189, 2026-07-31):
     18 playbook files exist, 13 are listed here. Still unindexed: ci-signal-honesty,
     derived-number-rails, seo-surface-regen-delta, stated-threshold-copy, plus this README itself.
     Out of scope for 189 — a candidate ticket for the next heartbeat. -->

