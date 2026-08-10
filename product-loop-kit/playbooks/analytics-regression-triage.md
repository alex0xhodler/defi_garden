# analytics-regression-triage — playbook

**When:** a Mixpanel property looks wrong or "undefined" (referrer, utm, a custom prop), or an event seems
missing, and someone calls it a tracking bug.

**Answer in one line:** first prove it's actually broken — "undefined" is frequently the CORRECT value
(referrer-less/direct/bot traffic, or a param simply absent), not a capture bug. Confirm before "fixing."

## Steps
1. **Is the value even capturable for that traffic?** `$referrer`/`utm_*` are legitimately empty for direct,
   bookmark, and crawler hits. Cross-check with `traffic-quality-classification.md` — if the sessions are
   bot-shaped, undefined referrer is expected, full stop.
2. **Is the property actually stripped?** Check for a stripping cause before assuming a code bug:
   - `vercel.json` `Referrer-Policy` — `strict-origin-when-cross-origin` is STANDARD and does NOT strip
     `document.referrer` (a real referral still populates ≥ the origin). `no-referrer` WOULD strip it.
   - `<meta name="referrer">` / `rel=noreferrer` on links — grep `home.html`/`plan.html`.
3. **What does the code already capture?** Read `analytics.js`: `getBaseContext()` sends
   `referrer: document.referrer || 'direct'` (never literally undefined) + spreads `this.acquisition`
   (utm_*/ref/click-ids/referring_domain, captured once at landing — item 120). The official Mixpanel lib
   ALSO auto-captures `$referrer`/`$referring_domain`/`utm_*` (confirmed from mixpanel-js `_.info.campaignParams`);
   `track_pageview:false` does NOT disable that.
4. **Decision rule:**
   - Value is empty because the traffic has no referrer/utm → **NOT a bug.** Say so plainly; it corroborates
     the traffic read. Don't ship a change to the measurement surface on a false premise.
   - A KNOWN-referral visit of ours shows `direct`, OR events don't arrive at all → **real bug.** Likely
     causes: the lib CDN `cdn.mxpnl.com` ad-blocked (drops whole users, not just referrers), the
     `mp.defi.garden` proxy, or a `no-referrer` policy. Get a concrete example event before changing code.

## Resolution
- Not-a-bug → explain with evidence; if there's a forward-looking hardening (e.g. explicit utm capture for
  an upcoming campaign), scope it honestly as hardening, NOT a bug fix.
- Real bug → fix at the single choke point (`analytics.js track()`/`getBaseContext()`), keep it ADDITIVE and
  GUARDED (a throw in getBaseContext breaks EVERY event — item 044/096 precedent), and verify (measurement
  surface = independent verifier).

## Traps
- The measurement surface is trust-sensitive: an "obvious" fix that throws or double-registers silently
  breaks all tracking. Additive + try/catch + independent verifier, always.
- localhost/preview is host-gated to no-send (item 096) — you can't verify capture there; use a prod-host
  preview with `?utm_source=test&ref=abc`.

**Provenance:** item 120 (specs/120.md — the "undefined referrer" investigation); items 044 (window.Analytics
guard), 096 (host gate).

## Addendum (122, 2026-07-23): derived-KPI numeric blow-ups (division by near-zero)
When a computed KPI renders an absurd value (e.g. rate-stability Sharpe = -900,719,925,474,097.9):
1. It's usually a divide-by-near-zero, not a data bug. Sharpe = (mean-RF)/stdev; a FLAT series gives
   stdev = float dust (~1e-16), not exactly 0, so a `> 0` guard misses it.
2. Fix in TWO layers: (a) compute — require a MEANINGFUL denominator (epsilon floor, e.g. sd>=0.05) +
   cap the result magnitude + Number.isFinite; (b) render — gate on `Math.abs(x) <= CAP` (NOT just
   isFinite — an astronomical value is still finite) so a stale committed artifact can't render.
3. Latency trap: these stay dormant until real history/scale arrives (122 surfaced only after the D1
   backfill gave the KPI 10 real days to divide across). New data = new edge cases.

## Addendum (214, 2026-08-03): the call site passes it, the emitter drops it

**When:** you are about to claim a property is queryable in Mixpanel — writing an acceptance criterion,
a north-star query definition, or a "we already track that" answer to the human.

**Answer in one line:** a correct call site is NOT evidence the property reaches Mixpanel; read the
wrapper function's body and confirm it actually forwards the key.

Found in 214: `app.js`'s two `data_load_time` call sites have passed `{ source, pools_count }` since
item 059, and `analytics.js:352` `trackPerformance(metric, value, context)` forwarded only
`metric_name`/`metric_value`/`metric_category`/`page_context`/`connection_type`/`is_slow_device` —
`context.source` and `context.pools_count` were dropped one function later. **Every `data_load_time`
event ever emitted was missing `source`.** Spec 214 asserted "(it already carries `source`)" as an
unverified parenthetical; the builder's first test spied on the `trackPerformance` call boundary and
went green against the broken code. The verifier caught it.

### Steps
1. **Name the emitter, not the call site.** Every `trackX()` helper in `analytics.js` is a *projection*
   of its `context` argument, not a passthrough. Read the helper's body and list the keys it actually
   writes into the object handed to `this.track(...)`.
2. **Diff the two key sets**: what call sites pass vs what the helper forwards. Anything in the first
   set and not the second is invisible in Mixpanel, no matter how correct the call site looks.
3. **Spy at the delivered boundary.** A test that wraps the helper proves only the argument. Wrap
   `Analytics.track` — the payload assembled there is what ships. (The localhost host gate, item 096,
   runs *inside* `track()`'s body, after a wrapper has captured `eventData`, so this is non-vacuous
   under suppression. Verify that ordering still holds before relying on it.)
4. **Falsify.** Revert the emitter fix alone and confirm the assertion goes RED. An assertion that
   passes against the broken emitter is measuring nothing — that is exactly how this survived.

### Decision rule
- Property missing from the emitter's projection → **real defect**, and it is retroactive: every
  historical event lacks it, so no backfill is possible and any saved report built on it was empty.
- Fixing it inside another item is **in scope, not drive-by**, when a listed acceptance criterion
  cannot otherwise be true — but justify it explicitly and bound the blast radius by grepping the
  helper's call sites (214: `trackPerformance(` had exactly 3 hits repo-wide).
- Fix shape: **explicit keys, guarded** (`if (context.k !== undefined) payload.k = context.k`). Never a
  wholesale `...context` spread — it collides with reserved/`$`-prefixed Mixpanel props and silently
  reshapes future events. Additive only; renaming or reordering an existing key breaks saved reports.

### Traps
- A spec's parenthetical is not evidence. "(it already carries X)" written by the spec author is an
  assumption until someone reads the emitter — and specs are graded against, so a false premise there
  produces an unsatisfiable criterion nobody can pass honestly.
- The fix is allowed to correct the spec, but only by making the criterion **true**, never easier. A
  spec quietly reworded to match what was built is a verifier FAIL.

**Provenance:** item 214 (specs/214.md AC7 + Territory notes, specs/214-pr.md); verifier FAIL 6/7 on
attempt 1 → PASS 7/7 on attempt 2. Related: items 044 (`window.Analytics` guard — instrumentation that
shipped but never fired), 096 (host gate).

## Addendum (257, 2026-08-10): the transition happens and no call site exists at all

**When:** you are about to trust a count of *how often something happened* — a denominator, a funnel step, a
"views" number — or to write/accept a claim of the form *"X fires once per Y"*.

**Answer in one line:** the 214 addendum asks whether the emitter forwards the key; this one asks whether an
emitter is **there at all**. Enumerate the STATE TRANSITIONS the metric claims to count and set-equal them
against the emit sites — both directions. Do not trust the paths someone already verified.

Found in 257: `pool_view` is the north star's denominator. `grep -n "setCurrentView('pool-detail')" app.js`
returns **three** sites; `trackPoolView` has **two** emit sites repo-wide. `handleCalculateYield`
(`app.js:2787`) does a full pool-detail render and emits only a `pool_click`. Prod on 2026-08-09 shows the
consequence directly: `pool_click` 1, `pool_view` **0** — a page rendered and nothing recorded it.
`NORTH_STAR.md:37` said *"`pool_view` fires exactly once per pool-detail render (verified for both current
paths; test asserts no double-fire)"* — true of what it verified, and **narrower than the class it guards**.
`test_northstar_cta_fires.js` covered `url_direct` and `card_click`, the two paths the author had in mind;
the third had been un-instrumented since it existed. Note the double-fire assertion was the *stricter*-looking
one, and strictness on the covered paths bought nothing on the uncovered one.

### Steps
1. **Name the transition, not the handler.** Write down the state change the metric claims to count
   ("the app enters pool-detail"), then grep for **every** way the code makes that change — the state setter,
   the route change, the mount — not for handlers you can name.
2. **Grep the emit sites** for the event, across every file that could emit it (`app.js`, the component,
   `analytics.js`).
3. **Set-equal the two sets, both directions.** A transition with no emit is an undercount; an emit with no
   transition is a double-fire. Both are defects and only the second one usually gets a test.
4. **Derive both sets at TEST time from the source.** A hand-typed list of line numbers is a mirror and rots
   exactly like `MIN_TVL_USD = 10000000 // mirrors app.js:801` (item 212/254). The point is that a fourth
   entry path added next month fails the gate without anyone remembering this playbook.
5. **Falsify.** Delete the new emit and confirm the gate goes RED; restore byte-identically and confirm GREEN.

### Decision rule
- Transition set ⊋ emit set → **real defect, and it is retroactive**: the historical series is a lower bound
  of unknown tightness. Say that with the one confirmed instance if you have one; never retro-correct a past
  number, and never present the old series as if the fix repaired it.
- Any ratio built on the incomplete count (a CTR, a conversion rate) is **not bounded by 1** while the gap is
  open — check whether the numerator can fire on a path the denominator misses, and say so.
- A doc or spec sentence of the form *"verified for both current paths"* is a **scope statement, not a
  guarantee**. When you read one, the next move is to count the paths yourself.

### Traps
- Fixing it by adding one call to one handler closes the instance and leaves the class open. The item is not
  done until the set-equality gate exists.
- The measurement surface is trust-sensitive (items 044/096): additive, guarded, spied at the
  `Analytics.track` boundary — the same rules as the 214 addendum.

**Provenance:** item 257 (specs/257.md), found by the 2026-08-10 heartbeat while following a single prod
`pool_click` to its origin; `signals/2026-08-10.md` §2b(i). Related: 212 (mirror rule), 214 (emitter drops the
key), RAZOR.md worked example 5.
