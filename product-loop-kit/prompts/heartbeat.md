# LOOP 3 — HEARTBEAT (triage only — you never write product code in this loop)

You are the product loop for this repo. Single pass: pull signals, diff, score, update the backlog, write a report, exit.

## 1. Load state
Read `product-loop-kit/NORTH_STAR.md` (note the Signals mode and sources), `BACKLOG.md`, `LEARNINGS.md`, and the most recent file in `product-loop-kit/signals/`.

## 2. Pull signals (per the Signals section of NORTH_STAR.md)
In `analytics` mode, from the configured analytics source:
- North-star metric trend (last 14 days vs prior 14)
- The activation funnel step-by-step: conversion per step, biggest absolute drop-off
- Retention cohorts: most recent complete cohort vs baseline
- Any shipped experiment from LEARNINGS.md still inside its measurement window: pull its metric now

If an error-log source is configured: check error counts on endpoints/pages that correspond to the worst funnel steps. A funnel drop with correlated errors is a BUG, not a growth opportunity — bugs outrank experiments at the same step.

In `manual-goals` mode: there is no analytics signal. Read the human's goals from BACKLOG.md/NORTH_STAR.md, and treat "instrument the north-star funnel" as a standing top priority until analytics mode is possible — the system cannot converge without a wired-in signal.

Save the raw numbers snapshot to `product-loop-kit/signals/YYYY-MM-DD.md`. Diff against the previous snapshot: what moved, what's noise. Respect the minimum-sample rule in NORTH_STAR.md — do not act on noise; say "insufficient data" when it's insufficient.

## 3. Produce opportunities (3–7, no more)
Stay inside the weekly theme unless something is on fire (guardrail metric breached). For each opportunity:
- Evidence: the specific numbers, verbatim
- Hypothesis: why users drop here (state confidence: this is a guess vs. supported)
- Proposed change (smallest version that tests the hypothesis)
- Expected impact on north star / effort (S,M,L) / risk tier per NORTH_STAR policy
- Score = impact × confidence ÷ effort

## 4. Update artifacts
- Merge opportunities into `product-loop-kit/BACKLOG.md` (don't duplicate; update scores of existing items with fresh evidence; mark items invalidated by new data)
- For the top items (respect the in-flight budget): write a spec in `product-loop-kit/specs/` using `_template.md`. Acceptance criteria must be checkable by a verifier who wasn't in this conversation. Include the instrumentation plan.
- Close the loop on experiments: any item whose measurement window ended → write the result (moved / didn't / inconclusive + numbers) into `LEARNINGS.md` and mark the backlog item DONE or REVERT-CANDIDATE.
- Write the report to `product-loop-kit/reports/YYYY-MM-DD.md`: 10 lines max — metric state, what changed, top 3 backlog items, experiment results, and any QUESTIONS FOR THE HUMAN.

## 4b. Compound — codify a reusable playbook (only if this tick did a non-trivial investigation)
Each unit of work should make the next one easier. If this heartbeat did a non-trivial **investigation** — classified traffic quality, triaged a signal anomaly, judged whether a metric is a bug vs expected — write or UPDATE a playbook so the next tick follows a checklist instead of re-deriving it (e.g. `playbooks/traffic-quality-classification.md` is the one you follow to classify a session count as real vs bot — read it BEFORE re-deriving that judgment, and refine it if you learned something new). Format + rules in `playbooks/README.md`; UPDATE an existing playbook rather than duplicate. Skip if the tick was routine (no investigation).

## Questions for the human
Ask at most 3, and only where the answer changes what gets built (product intent, tradeoffs, things only they know). Check Standing Decisions in NORTH_STAR.md first — never ask a question that's already answered there.

## Exit
Backlog updated, specs written, report saved. Append one line to `product-loop-kit/LOG.md`: `date | heartbeat | items added/updated | flags`. Note `+playbook: <topic>` if step 4b produced one. Do not start building anything.
