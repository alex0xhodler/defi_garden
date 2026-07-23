# traffic-quality-classification — playbook

**When:** a day/window shows sessions but the north star (`waitlist_submitted`) and engagement stay ~0, and
you need to decide "is this real traffic worth acting on, or bots?" before proposing any opportunity.

**Answer in one line:** at current scale it is almost always crawler/bot traffic — do NOT treat a session
count as demand until it clears the real-user bar below.

## Steps
1. Pull the sessions for the window (Mixpanel, prod-host filtered: `$current_url contains www.defi.garden`
   / `yield.garden` — the item-096 host gate already suppresses localhost/preview, but filter anyway).
2. Score each session against the **bot signature**. A session is bot-shaped if it hits most of:
   - **No acquisition:** `referrer`=`direct`/`$referrer` empty AND no `utm_*`/`ref` (post item-120 these
     are captured, so a real referral/campaign visit now WOULD carry them — undefined is real evidence,
     not a gap).
   - **One-hit:** a single event, no `page_view`→interaction progression, `is_returning_user=false`.
   - **Garbage long-tail params:** deep/odd URLs like `?token=20)`, malformed values — crawler URL fuzzing.
   - **Zero engagement:** no `search_*`, `plan_*`, `pool_view`, or dwell.
   - **Uniform fingerprint:** many "unique users" sharing one UA / one-hit shape.
3. **Decision rule:**
   - ≥3 of the above across ~100% of the window → **crawler traffic.** Report "N sessions, bot-shaped, not
     distribution." No opportunity; the binding lever stays human-owned distribution (069).
   - A session with an acquisition source (utm/ref/real referrer) + multi-step engagement → **real user.**
     THAT is signal; if `waitlist_*` still 0 below it, the funnel step is the problem, not traffic.

## Resolution
- Bot window → honest no-op; do not manufacture a surface to "fix" phantom demand.
- Real engaged sessions ≥ the minimum-sample rule (NORTH_STAR: ≥30 events/claim) → now you may reason about
  the funnel step where they drop.

## Traps
- "Sessions went up" is not "demand went up" — a crawler burst reads identically to a launch spike on the
  raw count. Always classify before scoring.
- Do NOT read "undefined referrer" as a tracking bug — see `analytics-regression-triage.md`; it is the
  correct value for referrer-less bot/direct traffic.

**Provenance:** distilled from the 07-16→07-22 daily heartbeats + reports (07-20 "16-session bot-shaped day",
07-22 "7 crawler sessions, undefined referrer, garbage params like token=20)"); item 096 (host gate), 120.
