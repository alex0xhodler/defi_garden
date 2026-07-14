# Red-team log — UX/flow directive batch (tickets 090-094) — 2026-07-14

Process per the human's directive: critic argues the plan is wrong → each objection logged with impact
and status → builder/operator fixes and verifies each HIGH-impact weakness or documents acceptance →
critic may reopen unsupported answers → stop when no HIGH-impact objection remains or issues repeat two
rounds without new evidence.

Plan under review: tickets 090 (standardized footer), 091 (cold-load intro), 092 (?app=1 transition),
093 (category-true flows), 094 (checkout CTA set). Original proposed order: 090→094→091→092→093.

---

## Round 1 (critic) → Round 1 resolutions (operator)

### O1 — 094 misreads the directive; 3-CTA shape violates 008 · IMPACT: HIGH · STATUS: RESOLVED (spec fixed + human question filed)
Critic: "join the waitlist, start saving or get a free savings card" is plausibly a rename with three
candidate labels, not three stacked CTAs; 094's own shape has primary and tertiary opening the SAME
waitlist modal — the anti-pattern 008 shipped to kill, inside 008's live window.
Resolution: 094 respecced — AT MOST ONE control opens the waitlist modal. Working interpretation
(recorded as operator inference): the "or" list enumerates the user-facing choice set where "join the
waitlist" and "get the card" are one choice → exactly TWO controls (card CTA → waitlist modal; "start
saving" → in-app pool path). CTA count + labels are now an explicit HUMAN QUESTION in the spec and the
report; 094 implementation is GATED on the answer. Evidence: specs/094.md rewritten (see file).

### O2 — "Get a free savings card" = fake availability; "free" unverified · IMPACT: HIGH · STATUS: RESOLVED (label rule in spec; "free"+label = human-gated)
Critic: a button verb promising receipt of a nonexistent product violates the 2026-07-12 no-fake-
availability decision; a disclaimer under a lying label documents the lie; "we pocket card fees" makes
"free" unverified.
Resolution: ACCEPTED in full. Spec now bans receipt-promising verbs for the card CTA; candidate honest
labels ("Join the card waitlist", "Get early access to the savings card" — access, not card) listed;
the word "free" may not ship without the human confirming the user-side fee structure. Both = the same
human question set as O1. Evidence: specs/094.md §Honesty rail rewritten.

### O3 — Batch torches live measurement windows (005/007/008→07-24, 061/065→07-26, 068→07-27) · IMPACT: HIGH · STATUS: RESOLVED (declared-void-and-restart policy in each spec; human veto surfaced)
Critic: five overlapping funnel-surface changes make waitlist_submitted movement unattributable — the
exact un-measurable change NORTH_STAR forbids; 065 was built specifically to keep 061's window clean.
Resolution: ACCEPTED with a policy rather than a freeze: the human directed these changes today
(and today's 085/089 bug fixes already touch the same surfaces under the "bug outranks experiment"
rule). Each spec now DECLARES the windows it voids and sets the restart date at its merge; the batch
report surfaces this as an operator inference the human may veto ("hold 093/094 until 07-26/27 instead"
is the alternative). Windows measuring an empty funnel (~0 entrants, critic's own O11) lose little real
signal, but the declaration requirement is what keeps us honest. Evidence: void-and-restart blocks
added to specs/090/091/092/093/094.

### O4 — 093 collides with in-flight 085/089 on the same code · IMPACT: HIGH · STATUS: RESOLVED (093 gated on 089 landing; respec required)
Critic: 089 rewrites pickGoal/pickPersona capital seeding; 085 rewrote the mix seed; 093's flow table is
written against pre-089 reality and a builder would clobber the 089 invariant.
Resolution: ACCEPTED. 093 status → BLOCKED until 085+089 are merged; its flow table must be rewritten
against the post-089 tree; new acceptance criterion "089 capital invariant preserved (its test stays
green)". Evidence: specs/093.md updated.

### O5 — Order builds the checkout twice (094 before 093) · IMPACT: HIGH · STATUS: RESOLVED (reordered)
Critic: 094 depends on 093's per-archetype table; building 094 first ships archetype-blind CTAs then
093 rewrites the same surface.
Resolution: ACCEPTED. New order: 091 (verify-first cold-load) → 090 (additive footer, after 091 so the
entrance treatment includes it) → 092 (rescoped, builds only if a symptom survives 091) → 093a
(design-table DOC + human questions — no code) → 093b+094 implementation adjacent, one shared window
reset. Evidence: this log + spec sequencing notes.

### O6 — 093 inflated AND under-decided; its real question belongs to the human · IMPACT: MEDIUM-HIGH · STATUS: RESOLVED (split; questions filed)
Resolution: ACCEPTED. 093 split: (a) 093a design-table doc + the two questions (subscription monthly
path: dead vs "top up toward the forever number"; target: capital-first default confirmation) — asked
in the report today; (b) 093b subscription copy/dead-path cleanup (loop-sized); (c) 093c target
capital-first gap audit. Evidence: specs/093.md restructured.

### O7 — "Start saving" crosses education→advice for this ICP · IMPACT: MEDIUM-HIGH · STATUS: RESOLVED (in-app destination + honest label rule; positioning ownership = human)
Critic: verb-as-action navigation toward a deposit path is solicitation; "users deposit with us"
describes a future product.
Resolution: PARTIALLY ACCEPTED. The control (if the human confirms it) navigates ONLY to the plan's
in-app pool-detail page (education surface, existing garden_cta instrumentation) — never directly to a
protocol deposit; label must describe what it does (candidates: "See this plan's pools"), and the
"start saving" phrasing ships only if the human owns the positioning. Folded into the 094 human
question set. Evidence: specs/094.md §Start-saving rewritten.

### O8 — 091's inline-critical-CSS is a drift factory; perf trade unquantified · IMPACT: MEDIUM-HIGH · STATUS: RESOLVED (spec hardened)
Resolution: ACCEPTED. Spec now: root-cause trace is BLOCKING before any fix; preferred mechanisms are
render-blocking the small planner-critical CSS in planner mode or gating the mount on stylesheet load;
hand-inlined critical CSS only with a mandatory sync-check test; hard PSI floor mobile ≥85 in
acceptance (baseline 88). Evidence: specs/091.md rewritten.

### O9 — 092 prefetch harms the many; exit-fade is fake latency; may be voided by 091 · IMPACT: MEDIUM · STATUS: RESOLVED (rescoped)
Resolution: ACCEPTED. 092 rescoped to destination-side paint continuity only (pre-CSS background/theme
continuity, both themes); no blanket prefetch (pointerdown/hover prefetch at most); no exit fade;
modifier-click semantics explicitly protected; hard gate: re-triage after 091 — if no symptom remains,
092 closes as superseded. Evidence: specs/092.md rewritten.

### O10 — 090 creeps into 086's just-shipped fixed footer + deletes a trust signal · IMPACT: MEDIUM · STATUS: RESOLVED (rescoped additive)
Resolution: ACCEPTED. 090: strictly additive content parity; analytics footer position untouched (086
awaits human spot-check); bloom's in-content press mention untouched (checkout credibility signal inside
live windows); planner footer coordinated with 091's entrance treatment (091 ships first). Evidence:
specs/090.md rewritten.

### O11 — Zero distribution work while distribution is the binding constraint · IMPACT: LOW-MEDIUM · STATUS: ACCEPTED (noted, not fixed)
Resolution: The human explicitly directed this batch; the operator's report pairs it with the standing
reminder that 069's three spotlight packs await the first human post and every measurement plan above
is traffic-gated. No spec change.

---

## Round 2 (critic review of resolutions) — see below


---
NOTE (operator): committed mirror of the repository-local .agent-reviews/redteam.md (gitignored, ephemeral in cloud containers). Round 2 (critic audit of resolutions) was killed by the session limit before returning a verdict — round 2 must re-run before 091+ builds. Restore this file to .agent-reviews/redteam.md at session start.
