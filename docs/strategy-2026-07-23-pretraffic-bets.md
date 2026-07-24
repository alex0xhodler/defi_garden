# Pre-traffic strategy: from "not broken" to "worth visiting, worth trusting, worth returning"

Date: 2026-07-23 · Author: loop operator (Fable) session, human-directed deep dive
Inputs: full code UX audit (planner/PoolDetail/app.js/landing.js, spec-vs-code delta) + evidence review of fintech/financial-education playbooks (primary sources; citations inline).

## 1. Situation

- **Traffic ≈ 0.** ~130 sessions/30d (tracking live since 2026-07-09), `plan_created` 5, shares 0, north-star CTA clicks unbaselined. The funnel is unmeasurable (NORTH_STAR minimum-sample rule).
- **The loop is quality-only.** Heartbeat §2b product-audit mode finds and fixes broken things (122/126/132…). Nothing in the loop generates *bets* on acquisition, conversion design, education, or retention. "Good product" is currently defined as "not broken."
- **The product is better-built than assumed** — but its three loops are each severed at one specific point:

| Loop | State | Severed at |
|---|---|---|
| Acquisition | SEO generators + stories + sitemap exist; landing/analytics faces live | No educational content surface (glossary/guides) = tiny keyword footprint; analytics face speaks analyst jargon to novice SEO landers |
| Conversion | Planner conversation is genuinely excellent (chips, live math, honest ladders, Ask box) | **Terminal CTA for EVERY archetype is the card waitlist, with subscription-only copy** — a retirement/iPhone plan ends on "your garden's yield pays your subscription automatically through a simple card." The v2-spec'd "Start growing on <top pool> →" primary CTA was never implemented. On PoolDetail, "Start Earning ↗" is a blind `window.open` eject with zero wallet/onramp guidance |
| Retention | Garden stages, revisit report with real rate deltas, ahead/behind status — all implemented and honest | **No external trigger exists.** Only a manually-downloaded .ics file. No email list beyond the card waitlist |

- **Doc/spec drift:** bare `/` serves `landing.js` (a third face), not the planner; CLAUDE.md and v2 spec both say planner-first. The card-waitlist ending is documented nowhere in the spec docs.

## 2. Key evidence from the playbook review (what's proven, what's disproven)

**Proven & buildable with zero/near-zero infra:**
- **Wirecutter methodology/trust box:** their own A/B — ~10% lift from a "why trust us / how we make money" box near the recommendation. Cheapest evidence-backed conversion lever found.
- **Investopedia/NerdWallet programmatic SEO:** ~37k pages, 4M+ non-branded keywords, traffic concentrated in `/terms/` glossary pages. The zero-traffic→traffic path for a static site; DeFi Garden's generator pipeline is half of it already.
- **Fresh-start effect** (Dai/Milkman/Riis, Mgmt Sci 2014): temporal landmarks measurably increase aspirational action; needs only the calendar date.
- **Goal-gradient** (Kivetz et al.): works for near goals (TARGET archetype), does NOT work at 10-year horizons — validates the archetype split; lean into item-fill progress for TARGET only.
- **Coinbase Earn education-gate:** "short lesson unlocks understanding before the ask" — the mechanic transfers without the paid reward.
- **Fogg B=MAP:** raise ability (fewer/easier steps), not motivation (hype). The planner already embodies this; the *post-planner* path violates it completely.
- **BlockFi $100M SEC postmortem:** disclosure discipline (name the risk that produces the rate, never imply insurance, explain what happens to funds) — direct validation of the existing trust rails, and a checklist for all new copy.

**Disproven / channel-gated (do NOT build):**
- **Credit Karma's "your number changed" loop and Duolingo streak boosts require push/email by construction** (Duolingo's published data: the retention gains came from notification-adjacent interventions). A streak UI with no channel is decoration. Also: daily streaks mismatch a monthly-cadence product.
- **Social-proof copy:** the one rigorous field experiment (retail bank) moved stated intentions, NOT actual savings behavior. Treat as tone/trust lever only; expect no conversion movement.
- **Long Game:** shutdown never publicly explained — no safe lesson to extract beyond "gamification-only standalone apps got absorbed by banks."

## 3. The bet portfolio (ranked)

Ordering logic: trust bugs first (broken beats persuasion — NORTH_STAR's own rule), then the conversion bridge, then acquisition compounding, then the one human-gated infra decision, then polish.

### BET A — Coherent endings: archetype-aware terminal CTA (P0, ~free, fixes a trust bug)
The planner's biggest button must never contradict the goal the user just described. Keep the card waitlist as THE ending for SUBSCRIPTION archetype (it *is* the business model, 2026-07-12 interview). For TARGET and GROWTH: primary CTA = the v2-spec'd "Start growing on <top pool's project> →" deep-link into PoolDetail (which is also the north-star surface!), waitlist demoted to secondary with archetype-appropriate copy ("Want this automated one day? Get early access…"). This simultaneously: repairs goal-incoherent copy, implements a spec regression, and routes planner-completers onto the north-star metric surface. Frameworks: Fogg (ability), Hook (action), spec §4.4.

### BET B — The bridge, not the cliff: "Your first deposit, step by step" (P0 for conversion)
The ICP cannot cross from "Start Earning ↗" to a live protocol unaided; today that click is an abandonment event with good intentions. Build a static, per-persona guided path (one page, linked from both CTAs, shown as an interstitial choice not a forced gate): wallet in plain words → getting USDC → what depositing does → how to verify → how to withdraw → what can go wrong (self-custody honesty, no insurance, smart-contract risk, the BlockFi-informed disclosure list). Coinbase-Earn mechanic minus the payout. EN+KO. This is the missing product between the planner and the money.

### BET C — Trust surface: methodology box + "Where these numbers come from" page (evidence-backed ~10%)
A compact trust box on PoolDetail near the CTAs + a full static page: how numbers derive from live DefiLlama data through the sanity filters; what "✓ Verified" actually means (passed our rails, NOT an audit — currently misleadable); what we never do (custody funds, take placement money — if true); the explicit "Is this insured like my bank? No — here's what protects you instead and what doesn't" answer the audit found missing. Wirecutter/Bankrate pattern; BlockFi copy discipline.

### BET D — Glossary as programmatic SEO (education + acquisition in one)
Static `/learn/<term>` pages generated via the existing generator pipeline (APY, TVL, impermanent loss, stablecoin, self-custody, lending vs LP, Sharpe/risk-adjusted, degen haircut…), each in the planner's plain-language voice, each linking to live relevant pools. Then link every jargon term on PoolDetail/app.js to its page. Investopedia's `/terms/` concentration is the model. Fixes gap #6 and #8 (analytics-face vocabulary cliff) while compounding the SEO engine that is currently the ONLY working acquisition channel.

### BET E — The owned trigger channel (HUMAN DECISION — the single highest-leverage infra call)
Everything retention-shaped (Credit Karma delta digest, tending reminders, fresh-start prompts, waitlist nurture) is unbuildable without email. The pieces exist: Formspree capture is live (card waitlist), GardenReport already computes the exact "your rates moved, you're 2 weeks ahead" content a digest would contain. Decision needed: adopt an email service (Buttondown/ConvertKit tier) and add a second, honest capture: "Email me my plan + a monthly tending update." Not a backend; a deliberate scope call only the human can make. Until then, ship the channel-free substitutes (.ics is built; fresh-start framing in BET F).

### BET F — Behavioral polish pack (zero infra, post-A/B/C/D)
- Fresh-start date framing on planner entry + revisit ("Start your August garden") — calendar-only.
- Goal-gradient emphasis for TARGET goals (item-fill bar exists; make progress-to-item the revisit hero for TARGET; never for 10y GROWTH).
- Monthly "tending ritual" naming for the revisit flow; garden-stage change moments made legible.
- Copy pass with loss-frame-on-the-alternative only ("buy it outright and the money's gone" — already the house frame; keep gain-frame for the product itself, per pension-framing evidence and the cautious ICP).

### BET G — Router/doc truth: decide what bare `/` is
Code serves `landing.js`; CLAUDE.md + v2 spec say planner. Either is defensible pre-traffic; what's not defensible is the drift. Recommend: keep landing (it hosts trust rails + both faces) but make "Plant a garden" the unmistakable primary and update CLAUDE.md/spec to match reality. One-line human confirmation wanted.

## 4. What the loop itself needs (so this doesn't depend on ad-hoc sessions)
1. **A bets lane.** heartbeat.md §2b finds bugs; add §2c: each tick must also carry forward the top open bet from this document's portfolio (or its successor file) — one bug wave, one bet per cycle, bets outrank polish-grade audit findings but never P0 breakage.
2. **NORTH_STAR weekly theme is stale** (2026-07-12, "Distribution + card funnel"). Proposed new theme: "Coherent endings + the deposit bridge" (BETS A+B), then "Trust + learn surface" (C+D).
3. **Backlog seeds:** A–D and F decompose into ~10 loop-sized tickets; the heartbeat should ticket them from this doc rather than a session hand-writing them (per the human's directive that backlog execution belongs to the loop).
4. **Two open human gates:** BET E (email service adoption) and BET G (bare-`/` identity). Plus existing gates 133/097/118.

## 5. Explicit non-goals (evidence-based)
No streaks, no daily mechanics, no manufactured urgency (channel-gated per Duolingo's own data + banned by house rules). No social-proof numbers expecting conversion lift (field-experiment null on behavior; also there are no users to cite honestly). No new backend. No promising safety — only explaining protections and their limits.
