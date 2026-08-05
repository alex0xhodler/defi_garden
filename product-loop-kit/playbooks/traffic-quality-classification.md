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

## The JS-executing, CTA-following crawler (2026-08-03 case — the burst the old signature under-calls)
The biggest prod day on record (92 sessions vs 3–9/day baseline) was crawler traffic that DEFEATS two
assumptions the signature above quietly makes:
- **Bots execute JS now.** `session_start` is a JS event and it fired 92× (13 "uniques"; one bare-`Mozilla`
  UA carried 27 events alone; Chrome 63 events / 10 uniques = headless-farm shape). "It fired a Mixpanel
  event" is zero evidence of a human.
- **Bots follow CTAs, and URL-triggered events read as intent.** 9 sessions followed the tokens-hub
  waitlist link to `/plan?waitlist=1&src=seo_tokens_hub`; `?waitlist=1` auto-opens the modal, so
  `waitlist_opened` fired 9× — the first time that event EVER fired in prod — with zero human intent.
  **Rule: an event fired unconditionally on arrival or by URL param (session_start, page_view,
  waitlist_opened via `?waitlist=1`) is NOT engagement.** Only typed/multi-step actions count:
  `search_input`, `waitlist_email_entered`, `plan_created`, a `pool_view` FOLLOWED by a CTA click.
  **Corollary: crawler-fired events do not count toward traffic gates** (the ≥30 `waitlist_opened` gate
  stayed at 0 real events on a day with 9 fired).
- **`src`/`utm` attribution does not imply a human either.** Internal `src=` tags ride on any crawler that
  follows the tagged link — attribution proves the INSTRUMENT works, never that the traffic is real.
- **A useful extra fingerprint: `session_start` ≫ `page_view` on the same day** (92 vs 23; bare `/` fired
  58 session_starts and zero page_views). Most "sessions" never reached any content event.

## Which instrument reads `src` (2026-08-04 correction — the 064/08-02 check was aimed wrong)
Read the distribution check off **`session_start` broken down by `src`** (or any event — acquisition
params are captured once at landing and attached to EVERY event as base context, `analytics.js:32-56`),
**never off `page_view` alone**: `trackPageView` is called only from app.js (analytics mode), so
planner-bound arrivals — the waitlist path, the exact conversion path SEO CTAs drive — never appear in a
`page_view`-by-`src` breakdown. Measured 08-03: `page_view`-by-src returned `undefined`-only on the same
day `waitlist_opened` carried `src=seo_tokens_hub` ×5.

## Traps
- "Sessions went up" is not "demand went up" — a crawler burst reads identically to a launch spike on the
  raw count. Always classify before scoring.
- Do NOT read "undefined referrer" as a tracking bug — see `analytics-regression-triage.md`; it is the
  correct value for referrer-less bot/direct traffic.
- A garbage param can still be OURS: `/plan?lang=ko%60`'s backtick came from a template literal in a
  test file the prod domain serves (item 223) — run the class-9 provenance grep before writing
  "crawler-invented", and include SERVED NON-HTML files (raw JS) in "ours".
- **A fixed mint keeps producing arrivals: classify them RESIDUAL REPLAY, not a regression (2026-08-05).**
  The day after 223's `.vercelignore` shipped (all five previously-200 repo files curl-verified 404),
  6 of 08-04's 8 prod sessions still landed on scrape-minted fuzz URLs — `` /?token=USDC` `` ×3 (template
  literal + closing backtick, 10 repo JS files carry that literal) and `/?pool=` ×3 (the static prefix of
  `` ?pool=${…} ``; grep over the whole generated estate emits it 0×). Crawlers replay URLs from their own
  caches long after the source stops serving. Decision rule: if the minting file now 404s AND the estate
  grep is 0, the arrival is a replay of an already-closed mint — expect decay, do not re-ticket, and file
  the decay as the weakest-form prediction (outcome: the class reaches zero; witnesses: ANY event broken
  down by `$current_url` matching the mint strings, filtered and control both). Re-open only if a NEW mint
  string appears that the current tree can produce.

**Provenance:** distilled from the 07-16→07-22 daily heartbeats + reports (07-20 "16-session bot-shaped day",
07-22 "7 crawler sessions, undefined referrer, garbage params like token=20)"); item 096 (host gate), 120.
JS-executing-crawler section + src-instrument correction: 2026-08-04 heartbeat (the 92-session 08-03 burst,
queries `830837ff`/`6fcb43a9`/`a1bb6ebf`/`abea84a5`/`ac34d5cd`).
