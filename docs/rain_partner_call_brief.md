# Rain Partner Call: 1-Page Executive Brief & Talking Points

## 1. Executive Summary & Company Overview
- **Company:** defi.garden (open-source yield discovery & non-custodial savings infrastructure on Base).
- **Integration Target:** Programmatic virtual Visa card issuing via Rain’s developer API (`use-dev.raincards.xyz`) to power the `<SpendYieldWidget />`.
- **Core Mechanism:** Users deposit stablecoins (USDC) on Base into audited lending pools (Seamless / Morpho). Automated keepers harvest net realized yield and sweep it directly into Rain card deposit balances to perpetually pay recurring SaaS/AI subscriptions ($\Delta \text{Principal} \equiv 0$).

---

## 2. Key Talking Points for Tomorrow's Call

### A. Commercial Alignment & Unit Economics
- **Zero Fixed SaaS Fee Model:** Confirm onboarding to Rain’s zero-monthly-SaaS startup tier funded via interchange revenue share.
- **Projected Card Volume:** 
  - Pilot phase: $150k–$300k monthly card spend across ~1,500 developer & agency accounts.
  - Scale phase (6–12 mo): $1.5M+ monthly card volume ($15M–$25M locked deposit TVL on Base).
- **High-Velocity Recurring Merchant Categories:** Tech/Software SaaS (MCC 5734/7372: Cursor, OpenAI, Anthropic, AWS, GitHub, Vercel, Slack, Figma).

---

### B. Technical & Compliance Requirements to Request
1. **Developer Sandbox API Keys:** Immediate access to create test users, issue virtual test cards, and simulate transaction authorizations.
2. **Webhook Event Listeners:** Real-time webhooks for `card.authorized`, `card.settled`, and `card.declined` with balance shortfall metadata.
3. **BIN Classification & 3DS Frictionless Verification:** Confirm Tier-1 commercial/consumer BIN issuance to prevent merchant declines on Stripe, AWS, and OpenAI, with native 3D Secure verification.
4. **Apple Pay / Google Pay Push-Provisioning:** SDK / API endpoints to push virtual cards directly into user mobile wallets.

---

### C. Compliance & KYB Structure
- Non-custodial on-chain architecture: defi.garden never holds user principal or acts as a money transmitter; Rain operates as the licensed card issuing and fiat settlement rail.
- Corporate entity documentation and UBO verification ready for submission.
