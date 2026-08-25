# Spend Your Yield: ICP Due Diligence & Positioning Framework

## 1. Executive Summary & Product Positioning
- **Product Definition:** An embeddable Web3 widget (`<SpendYieldWidget />`) and standalone terminal allowing users to deposit stablecoins into audited DeFi protocols (Morpho, Aave, Ethena) and automatically sweep net realized yield to a dedicated Rain Visa virtual card to pay recurring subscriptions and real-world expenses.
- **Core Value Proposition:** *"Deposit Once. Subscribe Forever."* — Zero monthly bills, zero off-ramping fees, and 100% principal preservation ($\Delta \text{Principal} \equiv 0$).

---

## 2. Ideal Customer Profiles (ICPs) & Due Diligence

### ICP 1: The Remote Web3 Developer / Freelancer (Primary B2C Wedge)
- **Profile:** Software engineers, smart contract devs, and remote contractors earning income primarily in USDC/USDT on Base, Arbitrum, or Solana.
- **Current Workflow & Friction:**
  1. Receives monthly compensation in USDC.
  2. Off-ramps a portion to local banks (paying 1.5%–3.0% in exchange spreads, bank fees, and wire delays).
  3. Uses traditional credit cards to pay for developer tooling (Cursor, GitHub Copilot, OpenAI API, AWS, Vercel).
  4. Constantly worries about local banking freezes, tax accounting mismatches, and currency devaluation.
- **Key Value Drivers:**
  - **Zero Off-Ramping Friction:** Direct crypto-to-card subscription payment with zero banking intermediary.
  - **Capital Efficiency:** $1,500–$3,500 USDC locked once perpetually covers their core developer stack ($70–$150/mo).
- **Messaging Hook:** *"Stop selling your USDC every month just to pay for Cursor and ChatGPT. Park $2,000 once and let on-chain yield pay your dev stack forever."*

---

### ICP 2: Web3 Startups, Boutique Agencies & DAOs (B2B SaaS Wedge)
- **Profile:** 5–25 person crypto-native teams holding treasury reserves in stablecoins.
- **Current Workflow & Friction:**
  1. Finance leads manually off-ramp treasury stablecoins monthly to fund corporate cards (Brex, Ramp) for team SaaS bills ($500–$2,500/mo across Slack, Figma, Notion, Google Workspace, AWS).
  2. Recurring manual reconciliation and operational overhead.
- **Key Value Drivers:**
  - **Automated Treasury Utility:** Allocating $50k–$150k stablecoins once from treasury into isolated lending vaults permanently covers team software burn.
  - **Non-Custodial Balance Sheet Safety:** Full on-chain custody; strategy deposits remain on corporate balance sheet as earning assets.
- **Messaging Hook:** *"Eliminate team software invoices permanently. Fund your company’s SaaS stack from treasury yield without burning operational cash."*

---

### ICP 3: Everyday Crypto Savers & Retail Yield Farmers (Secondary Wedge)
- **Profile:** Passive crypto holders who want tangible real-world rewards rather than speculative token farming.
- **Key Value Drivers:**
  - Tangible everyday utility (Spotify, Netflix, Gym memberships, Phone bills).
  - Clear, stress-free "Forever Number" targets instead of complex APY tracking.
- **Messaging Hook:** *"Turn your idle crypto into free streaming and phone bills. Deposit once, keep your principal intact."*

---

## 3. Customer Pain Points, Churn Triggers & Mitigations

| Pain Point / Risk | Root Cause | Spend Your Yield Mitigation |
|---|---|---|
| **Banking Freezes & Off-Ramp Scrutiny** | TradFi banks flagging incoming crypto exchange wires. | Rain virtual Visa card funded directly on-chain via automated yield sweeps. No local bank wire needed. |
| **Yield Volatility / Subscription Shortfall** | DeFi borrow/lending APYs fluctuate over time. | Built-in 10% safety buffer on deposit calculation + automated alert when blended yield dips below monthly threshold. |
| **Fear of Principal Loss** | Historical DeFi exploits and bad debt. | Strict non-custodial invariant ($\Delta \text{Principal} \equiv 0$), Tier 1 curated pools only ($>\$10\text{M}$ TVL), and 78% LLTV auto-deleverage triggers. |
| **Complex Multi-Step UX** | Multiple transactions for approval, deposit, strategy routing, and card management. | 1-click bundled EIP-712 transaction handling via `<SpendYieldWidget />`. |

---

## 4. User Research & Customer Discovery Interview Framework

### Discovery Script for Remote Devs & Founders (15-Min Structure)
1. **Current Workflow (3 mins):**
   - *"How do you currently pay for your recurring software tools (Cursor, OpenAI, cloud hosting) from your crypto earnings?"*
   - *"What are the biggest headaches or costs you face when converting crypto to pay these expenses?"*
2. **Value Validation (5 mins):**
   - *"If you could park $2,000–$3,000 USDC in an audited Morpho/Aave vault on Base and receive a virtual Visa card that automatically pays those tools each month without touching your principal, would you use it?"*
   - *"What would be your biggest hesitation in setting this up?"*
3. **Economics & Risk Tolerance (4 mins):**
   - *"Would you prefer a 100% conservative 6% APY bluechip pool, or a Boosted Mode ⚡ (12% APY with leverage safeguards) that cuts your required deposit in half?"*
4. **Referral & Willingness to Pay (3 mins):**
   - *"Would you share this with your developer network or teammates if you had early access?"*

---

## 5. Go-To-Market Distribution Channels

1. **Ecosystem Developer Communities:** Targeted developer briefings across Farcaster, Base Developer channels, and GitHub READMEs for popular AI agent/dev repositories.
2. **B2B Protocol Co-Marketing:** Co-branded distribution with Morpho vault curators (Steakhouse, Gauntlet) and Aerodrome liquidity providers via the embeddable `<SpendYieldWidget />`.
3. **Programmatic AEO / SEO:** Targeting high-intent search queries (*"pay subscriptions with crypto yield"*, *"self paying ChatGPT subscription"*, *"crypto virtual card for developers"*).
