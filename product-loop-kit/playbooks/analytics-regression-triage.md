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
