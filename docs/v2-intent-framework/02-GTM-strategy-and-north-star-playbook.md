# GTM Strategy & North Star Execution Playbook: DeFi Garden v2

**Document Version:** `1.0.0-PROD`  
**Target Horizon:** 90 Days to Seed / Series Pre-Seed  
**Core North Star Metrics:**
1. **Active Monthly Liabilities Eradicated:** $> \$100,000 / \text{month}$
2. **24-Hour External Card Verification Rate:** $> 65\% \text{ of minted cards}$
3. **Active Deposited TVL (Sticky Rails):** $> \$25,000,000 \text{ USDC}$

---

## 1. Mathematical Reverse-Engineering of North Star Targets

$$\text{Required TVL} = \frac{\text{Annual Liabilities}}{\text{Net APY}} = \frac{\$100,000 \times 12}{0.048} = \mathbf{\$25,000,000 \text{ USDC}}$$

To achieve this, the protocol targets **1,600 high-conviction accounts** across two distinct commercial segments:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               THE 1,600-ACCOUNT PORTFOLIO TO $25M TVL                            │
├────────────────────────────────┬───────────────┬────────────────┬────────────────┬───────────────┤
│ Cohort                         │ Account Count │ Avg. Bill/mo   │ Avg. Deposit   │ Total TVL     │
├────────────────────────────────┼───────────────┼────────────────┼────────────────┼───────────────┤
│ 1. AI Builders & Freelancers   │ 1,500 users   │ $40/mo (AI)    │ $10,000 USDC   │ $15,000,000   │
│ 2. Web3 Startups & DAOs        │ 100 teams     │ $400/mo (SaaS) │ $100,000 USDC  │ $10,000,000   │
├────────────────────────────────┼───────────────┼────────────────┼────────────────┼───────────────┤
│ TOTALS                         │ 1,600 accounts│ $100,000/mo    │ —              │ $25,000,000   │
└────────────────────────────────┴───────────────┴────────────────┴────────────────┴───────────────┘
```

---

## 2. The 3-Phase Execution Roadmap

```
Stage 1: The AI Dev Wedge ───────> Stage 2: Startup Treasury ───────> Stage 3: Protocol Flywheel
(0 to $2M TVL | 200 Users)         ($2M to $10M TVL | 50 Teams)       ($10M to $25M TVL | Scale)
"Free Claude & Cursor"             "Eliminate Team SaaS P&L"          "Base Ecosystem Co-Marketing"
```

### Stage 1: The AI Builder Wedge (Weeks 1–4: $0 $\to$ $2M TVL)
* **Target Audience:** Engineers and creators paying $40–$100/mo out-of-pocket for Claude Pro, Cursor, ChatGPT Plus, and GitHub Copilot.
* **Core Distribution Tactics:**
  1. **Zero-Distance Presets on Social:** Launch `/for/cursor` and `/for/claude` with 1-click execution cards.
  2. **The "Proof of Zero Spend" Receipt Engine:** Every settlement generates an onchain verifiable share card:
     * *"My Cursor and Claude are 100% funded by Base yield. I haven't paid a software bill since August. Clone my setup: `defi.garden/?preset=claude&ref=0xalex`"*.
  3. **Hacker House & Grant Seeding:** Seed 50 prominent Base builders with $100 yield-subsidy cards.

### Stage 2: Web3 Startup & Agency Treasury Pilots (Weeks 5–8: $2M $\to$ $10M TVL)
* **Target Audience:** Founders and finance leads at Series A/Seed crypto startups holding $200k–$2M in idle stablecoins.
* **The Pitch:** *"You burn $600–$1,500/mo on Slack, Notion, GitHub, and AWS. Allocate $150k of your idle treasury to a dedicated Garden Vault. Wipe software burn off your P&L forever while retaining 100% principal."*
* **Distribution Channel:** Outbound campaign to 250 Base/Optimism/Arbitrum portfolio companies. (Target: 50 teams @ $100k avg deposit = $5M net TVL).

### Stage 3: Base Ecosystem & Protocol Liquidity Co-Marketing (Weeks 9–12: $10M $\to$ $25M TVL)
* **The Pitch to Protocols (Aave, Morpho, Aerodrome):**
  * Eliminate *mercenary TVL*. Garden TVL is permanent because withdrawing breaks real-world merchant subscriptions.
* **The Strategy:**
  * Apply for Base Ecosystem Grants (Base Batches).
  * Co-market with Morpho & Aave as their official **Consumer Spending & Cashflow Layer**.

---

## 3. The Activation Playbook (>65% 24h Card Auth Rate)

To prevent users from depositing and abandoning their card without merchant connection:

```
[ 1. Deposit Confirmed (0s) ] ──> [ 2. Push to Apple Pay (5s) ] ──> [ 3. Merchant Concierge Modal (15s) ]
                                                                             │
[ 5. Verified Celebration ] <─── [ 4. Webhook Catch: $0 Ping ] <─────────────┘
```

1. **Merchant Deep-Link Modal:** Automatically copies PAN, EXP, CVV to clipboard and opens the exact billing URL:
   * Claude: `https://console.anthropic.com/settings/plans`
   * Cursor: `https://www.cursor.com/settings`
   * Spotify: `https://www.spotify.com/account/change-plan/`
2. **Automated Abandonment Telemetry:** If no authorization ping is detected within 4 hours, dispatch an automated Telegram / Email reminder with 1-click instructions.
3. **Instant Verification Ping Celebration:** Catch the merchant's $0.00 authorization webhook in real time and deliver immediate positive reinforcement.

---

## 4. Venture Capital & Positioning Blueprint

### 4.1 The Pitch Narrative
> **"The Consumer Spending & Cashflow Layer for the Onchain Economy."**
> 
> *TradFi neobanks (Revolut, Chime, Brex) won on UX, but their unit economics are trapped in 0.5% bank spreads and heavy regulatory overhead. DeFi protocols built $100B in deep yield, but have zero consumer distribution. DeFi Garden bridges the two: turning non-custodial onchain yield into self-paying real-world Visa cards.*

### 4.2 Target Investor Matrix

| Tier | Target Funds | Strategic Alignment |
| :--- | :--- | :--- |
| **Tier 1 (Lead)** | **Base Ecosystem Fund / Coinbase Ventures** | Drives USDC velocity, daily consumer transactions, and Base Smart Wallet adoption. |
| **Tier 2 (Crypto-Consumer)** | **Variant Fund, 1kx, Archetype, Haun Ventures** | High-conviction theses in consumer crypto apps with real revenue and zero token-emission dependencies. |
| **Tier 3 (Fintech / Web3 Hybrid)** | **Castle Island Ventures, Slow Ventures, BoxGroup** | Investing in non-custodial infrastructure replacing traditional subscription management. |
