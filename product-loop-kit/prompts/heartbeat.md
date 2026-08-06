# LOOP 3 — HEARTBEAT (triage only — you never write product code in this loop)

You are the product loop for this repo. Single pass: pull signals, diff, score, update the backlog, write a report, exit.

## 1. Load state
Read `product-loop-kit/NORTH_STAR.md` (note the Signals mode and sources), `product-loop-kit/RAZOR.md` (the weakest-hypothesis rule — it governs every claim, score and prediction this tick writes), `BACKLOG.md`, `LEARNINGS.md`, and the most recent file in `product-loop-kit/signals/`.

## 2. Pull signals (per the Signals section of NORTH_STAR.md)
In `analytics` mode, from the configured analytics source:
- North-star metric trend (last 14 days vs prior 14)
- The activation funnel step-by-step: conversion per step, biggest absolute drop-off
- Retention cohorts: most recent complete cohort vs baseline
- Any shipped experiment from LEARNINGS.md still inside its measurement window: pull its metric now

If an error-log source is configured: check error counts on endpoints/pages that correspond to the worst funnel steps. A funnel drop with correlated errors is a BUG, not a growth opportunity — bugs outrank experiments at the same step.

In `manual-goals` mode: there is no analytics signal. Read the human's goals from BACKLOG.md/NORTH_STAR.md, and treat "instrument the north-star funnel" as a standing top priority until analytics mode is possible — the system cannot converge without a wired-in signal.

Save the raw numbers snapshot to `product-loop-kit/signals/YYYY-MM-DD.md`. Diff against the previous snapshot: what moved, what's noise. Respect the minimum-sample rule in NORTH_STAR.md — do not act on noise; say "insufficient data" when it's insufficient.

**Scope every "clean"/"zero" claim (RAZOR.md, claim side).** Any statement of health in the snapshot or in the §4 report names (a) the population it was computed over — with its denominator — and (b) the check classes that actually ran. "The audit is clean" is malformed; "clean over 3,987 pool records for the 5 prescan signals, 83 rendered surfaces, occlusion + DOM classes only" is a claim. A zero on an absence-of-failure metric additionally records the exercise count that gave the code a chance to fail (LEARNINGS 2026-07-28, item 082).

## 2a. Predictions
Any falsifiable prediction filed in a snapshot is stated in its **WEAKEST form**: predict the OUTCOME, then list EVERY instrument that could witness it. **A prediction naming a single instrument is malformed** — rewrite it before filing. Precedent (2026-08-02 `src`, resolved 2026-08-04): the prediction was stated at the strength of one instrument, `page_view`-by-`src`, which is structurally blind to planner-bound arrivals (`trackPageView` is called only from `app.js`), and reading it alone nearly filed a phantom P1 against a chain that works. The weakest outcome-level form — *"some prod event will carry `src` ≠ undefined"* — was already TRUE via `waitlist_opened{src=seo_tokens_hub} = 5`. When a prediction resolves, record which instrument witnessed it and which were blind; instrument blindness is a finding, not a regression.

## 2b. Product audit — the pre-traffic primary job (when the funnel is unmeasurable)
If traffic is below the minimum-sample threshold (no measurable funnel signal — the current reality), a metric-only tick has nothing to act on, and optimizing an unmeasurable funnel is premature (NORTH_STAR standing decision 2026-07-23). Do NOT no-op. Instead the tick's PRIMARY job is a **product audit**: follow `playbooks/product-audit.md` — drive the real rendered app across a rotating subset of surfaces (fixture-routed Playwright / the committed snapshot, since external HTTPS is sandbox-blocked) and find the bug classes that need NO traffic to find: broken/absurd numbers, dead-ends for valid queries, loading flashes, page/console errors, money/i18n format bugs, dead CTAs, responsive/dark breakage. These are exactly what the human keeps catching by hand (122/126/132/133…). Feed findings into §3/§4 as scored opportunities. The §2 metric read still runs — record the zero; a guardrail breach (e.g. an `error_occurred` spike) still outranks everything — it just no longer gates the tick to a no-op. When traffic becomes measurable, metric-triage resumes as primary and the audit drops to a rotating background check.

## 2c. Orphan-PR check (item 245 — every tick, no traffic dependency)
A loop-opened PR can finish work and then disappear from view: no verifier verdict, no PARKED/BLOCKED
title, nothing scheduled to finish it (precedent: #399/item 239, found stuck ~15h with a complete,
self-tested build and zero flags). Each tick:
1. `list_pull_requests` (state=open) for every open PR.
2. Read `product-loop-kit/BACKLOG.md`.
3. Feed both into `product-loop-kit/pr-orphan-detector.js`'s `classifyAll(prs, backlogText)` (or its CLI,
   `node product-loop-kit/pr-orphan-detector.js --prs=<path-to-json>`) — classifies every open PR into
   `{merged, PARKED, BLOCKED, human-gated, ORPHAN}`. Read the module's header comment before touching it —
   it documents a named, deliberate detection gap (no legend marker exists for "verified, awaiting a human
   merge action"; the fallback heuristic can miss one that never says the word "human").
4. Append the count + list to the signals snapshot (see §1's "Save the raw numbers snapshot" — add a line:
   `Orphan PRs: <N> (#<num>, #<num>, ...)` or `Orphan PRs: 0`). A non-zero count is a report line in §4.
5. Detection only — do not merge, re-verify, or renumber anything here (loop-container-contention.md's
   "renumbering mid-run" trap). An ORPHAN's disposition (run the verifier, or close and re-file) is a
   question for a build run or the human, surfaced in the report, never resolved inside the heartbeat.
6. Leg B, only when this tick is about to allocate a new BACKLOG id (heartbeat or build): compute it via
   `computeNextId(mainMaxId, openPrBranchIds)`, not `main`'s max alone — `openPrBranchIds` comes from
   `git ls-remote 'refs/heads/claude/loop-*'` cross-referenced against each branch's added BACKLOG row ids.
   If a collision is detected (`detectIdCollisions`), name both items in the report rather than silently
   renumbering.

## 3. Produce opportunities (3–7, no more)
Opportunities come from the metric signal (§2) OR the product audit (§2b) — whichever the tick has. Stay inside the weekly theme unless something is on fire (guardrail breached, or a P0 audit finding — a broken/absurd number or page error on a live surface outranks the theme). For each:
- Evidence: the specific numbers verbatim (metric) OR the rendered repro — surface + what shows (audit)
- Hypothesis: why users drop here / why it's broken (state confidence: this is a guess vs. supported)
- Proposed change (smallest version that tests the hypothesis)
- Expected impact on north star / effort (S,M,L) / risk tier per NORTH_STAR policy
- Score = impact × confidence ÷ effort

**Confidence means EXTENSION, not conviction (RAZOR.md).** Confidence = *across how many plausible futures does this item pay off?* An item that pays off under many futures scores high even if the mechanism is a guess; an item whose payoff exists ONLY under one specific unobserved condition — distribution lands, a funnel gets real visitors, an unposted campaign gets posted — is **not scored and queued**. File it **GATED(\<measurable precondition\>)** (e.g. `GATED(≥30 real waitlist_opened)`; `GATED(≥30 pool_view{url_direct})`), never as a calendar window. GATED is not BLOCKED: BLOCKED means the human owes an answer and pings them; GATED pings nobody — the heartbeat re-checks every gate each tick and promotes to READY the tick the gate is met (human decision 2026-08-04, interview Q2a). Precedent: the waitlist cohort — 062/063/066/068/075/079, **six experiment windows closed on one identical zero**, every event absent from the result set for the full 14 days (LEARNINGS 2026-07-27); and crawler-fired events never count toward a gate (signals 2026-08-04, NORTH_STAR experiment discipline).

## 4. Update artifacts
- Merge opportunities into `product-loop-kit/BACKLOG.md` (don't duplicate; update scores of existing items with fresh evidence; mark items invalidated by new data)
- **Re-check every GATED row's gate against this tick's signals** (real events only — crawler-classified never count): gate met → promote to READY and note it in the report; gate unmet → leave it, silently.
- For the top items (respect the in-flight budget): write a spec in `product-loop-kit/specs/` using `_template.md`. Acceptance criteria must be checkable by a verifier who wasn't in this conversation. Include the instrumentation plan.
- Close the loop on experiments: any item whose TRAFFIC GATE has opened and whose measurement window ended → write the result (moved / didn't / inconclusive + numbers) into `LEARNINGS.md` and mark the backlog item DONE or REVERT-CANDIDATE. Any shipped item whose gate has NOT opened within 60 days of ship → close it in `LEARNINGS.md` as "UNEXERCISED — re-measure when the gate opens" and mark it DONE (NORTH_STAR experiment discipline, 2026-08-04 — the ledger backstop; six dead windows carried at once is the precedent never to repeat).
- Write the report to `product-loop-kit/reports/YYYY-MM-DD.md`: 10 lines max — metric state, what changed, top 3 backlog items, experiment results, and any QUESTIONS FOR THE HUMAN. Every "clean"/"zero" line here carries its population and check classes per §2 — an unscoped clean claim in a report is a defect in the report.

## 4b. Compound — codify a reusable playbook (only if this tick did a non-trivial investigation)
Each unit of work should make the next one easier. If this heartbeat did a non-trivial **investigation** — classified traffic quality, triaged a signal anomaly, judged whether a metric is a bug vs expected — write or UPDATE a playbook so the next tick follows a checklist instead of re-deriving it (e.g. `playbooks/traffic-quality-classification.md` is the one you follow to classify a session count as real vs bot — read it BEFORE re-deriving that judgment, and refine it if you learned something new). Format + rules in `playbooks/README.md`; UPDATE an existing playbook rather than duplicate. Skip if the tick was routine (no investigation). **When you UPDATE a playbook from a new instance, re-ask whether the playbook's predicate is still the weakest form consistent with everything it now covers (RAZOR.md)** — an update that narrows a playbook to its latest instance is rot, and it is the exact failure the playbook exists to document.

## Questions for the human
Ask at most 3, and only where the answer changes what gets built (product intent, tradeoffs, things only they know). Check Standing Decisions in NORTH_STAR.md first — never ask a question that's already answered there.

## Exit
Backlog updated, specs written, report saved. Append one line to `product-loop-kit/LOG.md`: `date | heartbeat | items added/updated | flags`. Note `+playbook: <topic>` if step 4b produced one. Do not start building anything.
