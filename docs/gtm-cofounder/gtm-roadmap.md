# GTM Roadmap: DeFi Garden

## Diagnosis
You have steady organic search traffic (~130 monthly visitors) viewing pool data, but the core "yield-funded subscription card" value proposition is an unvalidated assumption with zero developer interviews.

## Now
- **Move:** Run customer discovery interviews with 5 to 10 crypto-native developers paying for AI/dev subscriptions (Codex Pro, Claude, Cursor, GitHub).
- **Mapped skill:** `talk-to-users`
- **Done looks like:** 5 completed conversations identifying how developers currently pay for SaaS, whether they keep stablecoins idle, and whether they would lock $4,000 to save $20/month.

## Next
- **Move 1:** Refine the exact ICP profile based on interview findings (e.g. indie hackers vs. agency devs vs. onchain degens).
  - **Mapped skill:** `who-is-this-for`
- **Move 2:** Rewrite the homepage headline and value proposition around the strongest validated pain point.
  - **Mapped skill:** `positioning-and-story` / `value-prop-that-converts`
- **Move 3:** Instrument Mixpanel to understand what the 130 organic visitors are currently clicking and filtering for on the pool grid.
  - **Mapped skill:** `know-if-its-working`

## Later
- Virtual card issuing / off-ramp partner agreements (Gnosis Pay, Holyheld, Rain, Stripe Issuing).
- Launch campaign across crypto-dev communities and Product Hunt (`launch-it`).
- Public pricing and fee take-rate structure (`pricing`).

## Log
- **2026-08-14:** Initial founder brief created via `start-here`. Documented risk-adjusted pool scoring as core asset, identified developer subscription payment loop as primary hypothesis.
- **2026-08-14:** Stood up `talk-to-users` Technical Advisory Board (TAB) Interview Kit in `docs/gtm-cofounder/tab-interview-kit.md` with locked 7-question discovery framework and non-pitch outreach template.
- **2026-08-14:** Ran full 30-day external Mixpanel audit (`know-if-its-working`) excluding internal/NL/localhost traffic. Documented in `docs/gtm-cofounder/mixpanel-audit.md`: 205 genuine external visitors (69% US), top landing surface is `/tokens` programmatic SEO hub via DuckDuckGo/Bing/Perplexity, 16 waitlist modal opens from US/IT/LT with 0 submissions.
- **2026-08-14:** Structured Yield-Funded Subscription Card GTM Waitlist & Neobank Rail Feasibility Spec in `docs/gtm-cofounder/yield-card-waitlist-and-rails-spec.md`. Identified Bridge (Stripe), Gnosis Pay, and Lithic as top 3 partner rail candidates.
- **2026-08-14:** Delivered 3 interactive design archetypes in `designs-subscription-card.html` (served on port 8001). Selected Design 3 (Contextual Pool Yield Arbitrage) and authored full implementation PRD in `docs/prd-yield-card-contextual-arbitrage.md` for engineering build.
