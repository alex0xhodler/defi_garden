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
- `pre-existing-red-triage.md` — a test is red on `main` and isn't yours: product regression vs stale test vs sandbox (item 147)
- `loop-container-contention.md` — a subagent reports files changing under it / a "second session" on the tree (item 162)
- `test-gate-observability.md` — before saying "tests green": count what ran, and tell environmental reds from real ones (item 163)
- `mode-enumeration-staleness.md` — an element is dead/duplicated on ONE route because a mode-conditional rule enumerates only the modes that existed when it was written (item 179)
- `third-party-render-dependency.md` — a user-facing element is conditionally rendered on data from a host we don't control, and the fetch is documented as allowed to fail (item 182)
