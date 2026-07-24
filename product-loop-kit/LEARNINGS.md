# LEARNINGS — validated results only. Numbers or it didn't happen.
# The heartbeat closes experiments here; scoring of future items leans on these.

<!-- Format:
## <date> · <item-id> · <title>
Hypothesis: … → Result: MOVED / DIDN'T / INCONCLUSIVE (before → after, n=…)
Decision: kept / reverted. Takeaway for future scoring: …
-->

## 2026-07-24 · 005 · One share hub at bloom — image-first, link always travels
Hypothesis: one image-first share hub at bloom (every path carries the plan URL) produces the first organic shares and makes each loop-closable. → Result: **INCONCLUSIVE** — window 07-10→07-24: `share_link_created` = 0 (never fired), `share_link_opened` = 1, `plan_created` = 2, planner sessions reaching bloom ≈ 1 real session (07-19). n far below the ≥30 rule.
Decision: kept (no revert — the spec's "0 shares = revert-candidate" rule presumed an exercised funnel; zero share-ORIGINATION traffic means the hypothesis was never tested, and the old redundant share card has no evidence in its favor either). Takeaway for future scoring: share-UX experiments are worthless without distribution — do not open another share-surface measurement window until 069 (or any distribution) actually lands traffic; gate such items on a traffic precondition instead of a calendar window.

## 2026-07-24 · 007 · Arrival moment for share-link recipients
Hypothesis: a warm explicit arrival state ("Someone sent you this garden — make it yours") converts opened share links into `plan_created` at a measurable rate. → Result: **INCONCLUSIVE** — window 07-10→07-24: `share_link_opened` = 1 (the sole possible arrival, 07-19), `plan_created` same-day = 1 (cannot attribute: same session cluster as the sender-side activity; n=1). No recipient cohort ever formed.
Decision: kept (funnel-readiness change; costless while dormant). Takeaway: same as 005 — recipient-side UX can only be measured after share origination exists; couple future arrival-UX windows to observed `share_link_opened` volume (≥30), not to ship date.

## 2026-07-24 · 008 · Checkout CTA hierarchy: one action per intent level
Hypothesis: collapsing the share card to ONE hero action (share image) with the link demoted increases share initiation without hurting waitlist clicks. → Result: **INCONCLUSIVE** — window 07-10→07-24: share initiations = 0, `waitlist_opened`/`waitlist_submitted` = 0 (events never fired), bloom reached in ≈1 real session. Neither side of the tradeoff was exercised.
Decision: kept. Takeaway: with a ~1-real-session/week funnel top, EVERY bloom-surface experiment closes data-starved; the 2026-07-23 pre-traffic mandate (quality > conversion experiments until traffic is measurable) is the right standing correction — score future bloom experiments near-zero until distribution lands.
