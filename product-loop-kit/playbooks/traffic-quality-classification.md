# traffic-quality-classification — playbook

**When:** a window shows sessions — or, since 2026-08-08, *engagement* — and you need to decide whether it
counts toward a traffic gate before proposing any opportunity.

**Answer in one line (PREDICATE WIDENED 2026-08-08 — read this before the bot signature below):** the
question is **not** "is there a human behind this session?" but **"does this visit carry information we did
not already have?"** Crawlers fail that test for want of intent. **Insiders — anyone who can deploy — fail
it because we already knew they were looking.** Both are excluded by the one predicate; the bot signature
in step 2 is a sufficient test for the first class only, and it scores the second class as REAL on every
criterion. At current scale a window is almost always crawler traffic, operator traffic, or both.

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
3. **NEW — the insider cut, and it runs BEFORE the decision rule.** Anything that passes step 2 must still
   be checked against the party that generates traffic by shipping. Break the window's **engagement events**
   (not its sessions) down by `$region`, then by `$os`/`$browser`:
   - Datacenter regions (California/Oregon/Virginia + Android or headless-Chrome shapes) are the burst tail.
   - A single non-datacenter region carrying **100% of the engagement**, on operator-class devices
     (iOS/macOS), is the insider signature until an instrument says otherwise.
   - Cross-check the window against `git log --since=<window> origin/main`. Engagement that lands on the day
     the operator merged UI work, walking many surfaces with `search_input` = 0, is a **reviewer's sweep**,
     not a searcher's task.
   - Until item **252**'s `insider` flag ships there is no instrument here, only this forensic step —
     so state the attribution as circumstantial and state the *inability* as the finding.
4. **Decision rule:**
   - ≥3 bot-signature hits across ~100% of the window → **crawler traffic.** Report "N sessions, bot-shaped,
     not distribution." No opportunity; the binding lever stays human-owned distribution (069).
   - Engagement concentrated in one operator-shaped origin → **insider traffic. Does NOT count toward any
     gate.** Report it with its number; it is not a defect and not an opportunity.
   - A session with an acquisition source + multi-step engagement **that survives the insider cut** →
     **real user.** THAT is signal; if `waitlist_*` still 0 below it, the funnel step is the problem.
   - Report the decomposition every time: **"N sessions, of which C crawler, I insider, R real"** — a
     window reported without all three terms is a defect in the report.

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
  grep is 0, the arrival is a replay of an already-closed mint — **do not re-ticket**; re-open only if a NEW
  mint string appears that the current tree can produce.

- **DO NOT predict that a replay class "decays to zero" — the 2026-08-05 prediction was FALSIFIED on
  2026-08-10 and this rule replaces its advice.** That prediction ran **zero for five consecutive days**
  (08-05..08-08) across every named witness, filtered and control, and was one day from resolving TRUE. On
  **08-09 all three mint strings returned at once**: `?token=USDC%60` (1 session), `` ?token=USDC` ``
  (1 session + 2 `page_view`s) and `/?pool=` (1 session + 1 `page_view`) — and one of them produced a
  deliberate `pool_click`. The mint was still closed: `curl https://www.defi.garden/test_list_polish.js`
  → **404**, re-verified that morning; `.vercelignore`'s `/test_*.js` had shipped in `682cf824ae` five days
  earlier.
  **What was wrong was not the prediction's weakness — it named every witness correctly.** It predicted a
  *trend* over a **queue we cannot observe**. Crawler re-crawl schedules are an unknown inter-arrival
  distribution; N consecutive days at zero is a **sample** from it, never evidence the class ended.
  **Rules that follow:**
  - The observable, falsifiable fact is **mint closure** (a curl matrix + an estate grep), not decay. Predict
    and resolve on that. It resolved TRUE on 2026-08-04 and has stayed true.
  - Report replay arrivals as **expected residual of indefinite duration**. Known lower bound on persistence:
    **≥5 days past mint closure, with a ≥4-day silent gap in the middle.**
  - A returning fuzz string is a **regression only if the current tree can mint it** — run the class-9
    provenance grep and the curl before saying so, in that order.
  - Generalise past URLs: any arrival process fed by someone else's cache or queue (search-engine indexes,
    LLM training snapshots, RSS mirrors, a partner's stale link) inherits this rule.

## The insider — the class that scores REAL on every bot criterion (2026-08-08 case, the north star's first click)

On 2026-08-07 `pool_click{source=garden_cta}` fired for the **first time in the metric's history** —
breaking a 30-day zero — with `pool_view` 4, `plan_created` 1, `plan_saved` 2. Scored against the bot
signature above it is **REAL on all six criteria**: multi-step progression, no garbage params, no uniform
fingerprint (Mobile Safari 6 / Safari 2 / Chrome 9 across 9 distinct URLs), typed actions present,
`session_start`/`page_view` 1.6× (vs 3.3× on the 08-06 burst). Following this playbook as it was written,
the next step was to open the north star's first traffic gate.

Broken down by `$region` instead (Mixpanel `b1e1f283`): `pool_click` **1/1 Utrecht**, `pool_view` **4/4
Utrecht**, `plan_created` **1/1 Utrecht**, `plan_saved` **2/2 Utrecht** — **100% of the window's engagement
from one region**, on iOS/Mac, on the day the operator merged four design PRs (#409/#411/#412/#413), across
a 9-surface sweep with `search_input` = 0. Operator self-test. Gate stayed shut.

**Why the fix is a wider predicate and not a region filter.** "Exclude Utrecht" is the narrowest hypothesis
consistent with this one instance, and it is wrong the day the operator travels or a real Dutch visitor
arrives — the exact induction error `RAZOR.md`'s worked examples are made of. The weak form is the one at
the top of this file: *does this visit carry information we did not already have?* It **contains** the
crawler rule (a crawler carries no intent) rather than sitting beside it, and it survives the operator
changing continents.

**Rules that follow:**
- **An engagement event is not automatically a gate event.** The 2026-08-03 rule said an event fired
  unconditionally on arrival is not engagement. This adds: an event fired by *us* is not demand, however
  deliberate the click.
- **Break engagement down by region before reading any first-ever non-zero.** A metric's first non-zero
  reading is exactly when the loop most wants it to be real — that is when to run the cut, not after.
- **`src`/`utm` attribution still proves nothing** (2026-08-03 rule, restated because it fired again here):
  the operator's own sweep carried `src=seo_token` and `src=pool`.
- **Report the residual.** After item 252 ships, `insider` covers marked devices only — an unmarked device,
  a teammate or a contractor still lands in "real". Say so with a number; never let the flag's existence be
  read as proof the residual is zero.

## A crawler can click (2026-08-09)

The 08-09 window's single engagement event was a **deliberate button press** — `.calculate-yield-btn-new` on
a rescue card — from a crawler-classified session (Iowa/GCP, `$os` Windows, `$browser` Microsoft Edge, landing
on a scrape-minted fuzz URL). This extends the 2026-08-03 "bots follow CTAs" finding from *URL-triggered*
events to *DOM-interaction* events. **A click is not a human.** Nothing about gates changes; what changes is
that "zero engagement" can no longer be scored as a clean binary — score it as `partial` and let the other
criteria decide, then run the insider cut on the engagement event's `$region`/`$os`/`$browser` as usual.

**Corollary worth its own line:** the click was still *useful* — following it to its `pool_symbol` proved
which grid rendered it (`playbooks/README.md`'s compounding point). A crawler event carries no demand signal
and can still carry a **product** signal. Read it for the second, never the first.

**Provenance:** distilled from the 07-16→07-22 daily heartbeats + reports (07-20 "16-session bot-shaped day",
07-22 "7 crawler sessions, undefined referrer, garbage params like token=20)"); item 096 (host gate), 120.
JS-executing-crawler section + src-instrument correction: 2026-08-04 heartbeat (the 92-session 08-03 burst,
queries `830837ff`/`6fcb43a9`/`a1bb6ebf`/`abea84a5`/`ac34d5cd`).
Insider section + the widened predicate: 2026-08-08 heartbeat (the 08-07 first-ever `garden_cta` click,
queries `6ff51037`/`c58fd11f`/`e2cd57dc`/`e461b540`/`35b6e8fd`/`b1e1f283`); filed as item 252,
`specs/252.md`. **Predicate WIDENED, not narrowed** — per `RAZOR.md`'s rot rule, re-checked on this update:
the file's governing question moved from "is this a bot?" to "does this visit carry new information?", which
strictly contains every rule the playbook already held.
