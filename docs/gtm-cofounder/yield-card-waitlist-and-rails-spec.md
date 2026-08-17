# Yield-Funded Virtual Card: GTM Waitlist & Neobank Rail Spec

## 1. Product Concept: The Yield-Funded Subscription Card

Users search for yields on tokens/chains (e.g. USDC on Base, SOL on Solana, BUIDL on Ethereum) and discover they can lock principal into high-scoring risk-adjusted pools to automatically generate disposable virtual cards that pay for recurring subscriptions (Dev tools, AI compute, gaming, streaming) without ever spending their deposit.

---

## 2. High-Conversion Waitlist UI Architecture

Instead of an abstract "Join Waitlist" email box, the conversion flow is an **Interactive Goal Calculator** placed directly inside `/tokens`, `/search/USDC`, and `/plan.html`.

### Step 1: Goal / Subscription Picker
Presets with recognizable everyday bills:
- **AI & Dev Stack:**
  - Codex Pro ($20/mo)
  - Claude Pro ($20/mo)
  - Cursor Pro ($20/mo)
  - OpenAI API ($50/mo)
  - GitHub Copilot ($10/mo)
- **Gaming & Lifestyle:**
  - Xbox Game Pass ($17/mo)
  - Spotify Premium ($11/mo)
  - YouTube Premium ($14/mo)
- **Custom Goal:** Any `$X/mo` input.

### Step 2: Live Yield & Deposit Calculation
Pulls real blended rates from the daily risk-scored pool engine:
- *Formula:* $\text{Deposit Required} = \frac{\text{Monthly Cost} \times 12}{\text{Risk-Adjusted APY}}$
- *Example:* For Codex Pro ($20/mo = $240/yr) at 6.2% USDC APY on Base:
  - **Required Deposit:** **$3,871 USDC**
  - **Principal Safety:** 100% self-custodial deposit.
  - **Monthly Payout:** $20 auto-routed to a virtual card.

### Step 3: High-Intent Capture Form
- **Form Fields:**
  1. `email` (required)
  2. `preferred_chain` (Base, Arbitrum, Solana, Ethereum)
  3. `selected_goal` (Codex, Claude, Xbox, etc.)
  4. `deposit_bracket` (<$1k, $1k-$5k, $5k-$20k, $20k+)
- **CTA:** *"Reserve My Virtual Card"*
- **Instant Hook / Variable Reward:** Generates a shareable virtual card preview (e.g. "Alex's Codex-Funded Card — 0x4178...") with a viral referral bump for queue priority.

---

## 3. Card Issuing & Neobank Rail Feasibility Matrix

| Partner / Provider | Architecture | Cost / Fee Model | Strengths | Constraints / Fit |
|---|---|---|---|---|
| **Bridge (Bridge.xyz / Stripe)** | REST API + PCI iframe for stablecoin-backed virtual cards. | Low per-transaction cost, interchange split. | Built natively for stablecoins (Base, Solana, ETH). Programmatic card creation with merchant locks (e.g. OpenAI only) and monthly spend limits. | **Top Recommendation:** Cleanest developer API and direct Stripe compliance umbrella. |
| **Gnosis Pay** | Smart contract / Safe Smart Account + Visa card. | Zero monthly fees, standard Visa interchange. | 100% self-custodial onchain architecture. Strong brand credibility in Web3. | Requires user to hold Safe account; virtual card API rollouts vary by region. |
| **Lithic** | Programmable FinTech Card API (Mastercard/Visa). | Free Tier (0 platform fee), interchange revenue share. | Instant programmatic creation of merchant-locked disposable cards. Fast sandbox. | Requires fiat off-ramp settlement buffer (e.g. USDC -> USD via Bridge/Stripe or Zero Hash). |
| **Holyheld / Rain** | Web3 Neobank card issuing API. | Card issuance fee + FX spreads. | Turnkey crypto card UX, support for multichain top-ups. | Higher friction for white-label embedded integration compared to Bridge/Lithic. |

---

## 4. Immediate Execution Plan

1. **GTM / Frontend:**
   - Embed the **Yield-Funded Subscription Card Calculator** into the `/tokens` header and pool cards.
   - Replace the leaking generic waitlist modal with the 3-step goal picker + email capture.
   - Track full conversion funnel in Mixpanel (`subscription_selected` -> `deposit_calculated` -> `card_reserved`).

2. **Partnership / Tech Rail:**
   - Request Bridge.xyz Card Issuing Sandbox access (`api.sandbox.bridge.xyz/v0/cards`).
   - Request Lithic developer sandbox to test instant disposable card generation with $20/month limits.
