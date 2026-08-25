# Spend Your Yield: ICP Interview Synthesis & Product Requirements

## Executive Summary
Synthesized from 3 structured user discovery interviews with authentic ICP archetypes:
1. **Lucas** (Remote Fullstack Web3 Developer & Freelancer, Lisbon/Remote)
2. **Elena** (Agency Co-founder & Head of Operations, 8-person studio)
3. **Marcus** (Pragmatic Everyday Crypto Saver, $10k idle USDC)

---

## 1. Core Findings & High-Conviction Validation

| Metric / Dimension | Lucas (Freelancer) | Elena (Agency Ops) | Marcus (Everyday Saver) |
|---|---|---|---|
| **Product-Market Fit** | **9.5 / 10** | **9.5 / 10** | **8.5 / 10** |
| **Target Deposit Size** | $2,400 USDC (Personal Dev Stack: $120/mo) | $20,000 USDC (Team SaaS Stack: $650/mo) | $4,500 USDC (Lifestyle Subscriptions: $45/mo) |
| **Primary Value Wedge** | Bypasses 2.5% CEX off-ramping spreads & bank tax flags | Eliminates bi-monthly multisig off-ramp friction & 3hr Xero reconciliations | Tangible monthly cashflow utility over abstract APY numbers |
| **Mode Preference** | Standard Mode (6% APY) for critical tools; Boosted for secondary | Standard Mode (Bluechip Morpho/Aave on Base) | Standard Mode with transparent vault provenance |

---

## 2. Universal Non-Negotiables & UI Requirements

### A. Copy & Framing Rule (The Anti-Ponzi Filter)
- **Banned:** "Free Subscriptions Forever" (triggers post-2022 algorithmic stablecoin PTSD).
- **Approved:** **"Turn Idle USDC into Self-Paying Subscriptions. Keep 100% of Your Principal ($\Delta \text{Principal} \equiv 0$)."**

### B. Card Rail & BIN Quality
- **Stripe & AWS 3DS Acceptance:** Rain virtual Visa cards must pass Stripe/AWS/Vercel fraud filters and support seamless 3D Secure challenges.
- **Apple/Google Pay:** Instant 1-click push-provisioning directly from web/app.
- **Vendor-Level Spending Caps:** Ability to set sub-card limits (e.g. AWS capped at $40/mo, Linear at $20/mo) to prevent accidental cloud overages from draining yield.

### C. Yield Shortfall Cushion & Notifications
- **10% Safety Buffer:** Maintain a $10–$20 liquid yield cushion on the card balance so normal APY fluctuations never cause a subscription decline.
- **Telegram / Email Alerts:** Automated alert 48 hours prior to recurring billing if yield falls short.

### D. Governance & Accounting Integrations
- **Safe Multisig Native App:** Zodiac execution-only roles modifier for DAOs/agencies so keeper bots can only harvest and sweep, never transfer principal.
- **1-Click Tax / Subledger Export:** Monthly CSV/API export mapping on-chain interest income to off-chain SaaS debit line items for Cryptio, Xero, and Koinly.

### E. Viral Sharing Trigger
- **"First Successful Charge" Receipt:** Shareable visual receipt when a bill clears (*"Netflix paid: $22.99 • Funded by Base Morpho yield • Principal intact: $4,500 USDC"*).
