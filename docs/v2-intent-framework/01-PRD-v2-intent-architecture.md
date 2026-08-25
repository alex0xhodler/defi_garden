# PRD-002: DeFi Garden v2 — Intent-Resolved Yield & Spending Architecture

**Document Version:** `2.1.0-SOTA`  
**Status:** `APPROVED FOR IMPLEMENTATION`  
**Target Platform:** `www.defi.garden` (Base L2 & Multi-Chain)  
**Design System:** `Quiet` (`--ui-*` tokens, 1px hairline borders, monospaced tabular numerals, zero neumorphism)  

---

## 1. Executive Summary & Problem Space

### 1.1 The Thesis
Traditional Web3 fintech suffers from the **Tollbooth Fallacy**: treating wallet connection, contract approvals, and liquidity deposits as the destination. Furthermore, analytical aggregators trap users in **feature-usage proxies** (dragging sliders, comparing 10 volatile lending pools, saving drafts to `localStorage`).

**DeFi Garden v2** transforms the product from an informational yield aggregator into an autonomous **Intent-Execution Engine**. It collapses the distance between a user's real-world liability (*"my $20/mo Claude bill"* or *"my team's $500/mo SaaS burn"*) and onchain capital to **zero**.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   THE 4-LEVEL MATURITY MODEL                                     │
├────────────────────────────────┬─────────────────────────────────────────────────────────────────┤
│ Level 1: Engagement Events     │ ❌ Vanity: "Users dragged sliders and compared APYs"            │
│ Level 2: Feature Proxies       │ ❌ Vanity: "Users created and saved 3 custom plans"             │
│ Level 3: External Impact       │ ⚠️ Incomplete: "Users minted a generic virtual card"            │
│ Level 4: INTENT SEGMENTS (v2)  │ ✅ Value: "User's Claude bill is 100% paid by Base yield"       │
└────────────────────────────────┴─────────────────────────────────────────────────────────────────┘
```

### 1.2 Core Value Proposition
> **"Buy it outright and the money's gone. Garden it and you keep the money AND get the thing."**
> 
> Deposit USDC/EURC once into audited Base lending vaults. Realized yield perpetually settles recurring merchant charges via virtual Visa cards and Apple Pay. Principal remains 100% self-custodial and redeemable at any time.

---

## 2. Hardened Architecture (Post Red-Team Mitigations)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FRONT-END CLIENT (Static / Vercel / Cloudflare Pages)                                  │
│ • React 18 UMD (Quiet System tokens, en-US / ko, <360px responsive)                    │
│ • Zero-Distance Intent Portals (/for/claude, /for/cursor, /for/spotify)                │
│ • Dual-Mode Operating Engine: Autopilot Mode vs. Pro Mode (Quiet Ledger)               │
│ • Passkey / Coinbase Smart Wallet Onboarding (Zero gas, session keys)                  │
└───────────────────────────────────┬────────────────────────────────────────────────────┘
                                    │ (Non-custodial deposit & read)
┌───────────────────────────────────▼────────────────────────────────────────────────────┐
│ ONCHAIN CORE (Base L2 Smart Contracts)                                                 │
│ • `YieldCardVault.sol`: Non-custodial ERC-4626 vault routing to Aave V3 & Morpho Blue  │
│ • `SafetyReserve`: 1.25x Over-collateralization + 1-Month Yield Escrow buffer          │
│ • `SurplusSponge`: Traps excess bull-market yield to backstop bear-market dips         │
│ • Emergency Exit: User retains unconditional withdrawal authority at all times         │
└───────────────────────────────────┬────────────────────────────────────────────────────┘
                                    │ (Yield sweep & settlement)
┌───────────────────────────────────▼────────────────────────────────────────────────────┐
│ MIDDLEWARE & CARD ISSUANCE (Cloudflare Workers + Rain BaaS)                            │
│ • Raincards API (`use-dev.raincards.xyz`): Tier-1 Commercial Visa BIN & Apple Pay push │
│ • Automated Keeper Worker: 1st-of-month yield harvesting and USD settlement sweeps     │
│ • Webhook Ingestion: Listens for `card.authorized`, `card.settled`, `$0 auth ping`     │
│ • Agent Commerce & x402: Programmatic card provisioning & HTTP 402 micro-billing       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Critical Red-Team Mitigations Implemented in v2

1. **Floating APY Decay & Shortfall Cascade Mitigation:**
   * **The 1.25x Baseline Buffer:** All Forever Number calculations enforce an over-collateralization multiplier:
     $$C_{\text{required}} = \frac{12 \times (\text{Monthly Bill} \times 1.20_{\text{Tax}})}{r_{\text{conservative}}} \times 1.25$$
   * **The 1-Month Yield Escrow:** The vault retains an initial 1-month liquid yield buffer ($20 USDC) upon deposit.
   * **The Surplus Sponge:** Yield above the required bill threshold is auto-diverted into the user's Escrow Reserve (capped at 3 months runway) before any surplus distribution.
   * **Bounded Grace Tap:** If catastrophic market-wide yield collapse drains the escrow, the smart contract permits a temporary, bounded 1-month principal tap while firing a Telegram/Email alert to top up or apply a permanent bill discount.

2. **Tax & VAT Slippage Mitigation:**
   * Automated **+20% Tax/VAT Headroom** baked into default preset calculations (e.g., $20/mo Claude calculates against $24.00/mo actual billing liability to prevent NY tax or EU VAT card declines).

3. **KYC & Two-Stage Activation Pipeline:**
   * **Stage 1 (0s - Instant Onchain):** User deposits USDC into `YieldCardVault.sol` via Passkey. Funds immediately begin compounding. (Zero KYC required for onchain vault).
   * **Stage 2 (60s - Asynchronous BaaS Provisioning):** Embedded lightweight identity modal (Rain BaaS). Once verified, card credentials push instantly to Apple Wallet / Google Pay.
   * **Zero-KYC Fallback:** Users failing or declining KYC receive an x402-streaming API proxy or prepaid voucher rail.

---

## 3. IA Router & Zero-Distance Intent Portals

The router in `home.html` is upgraded to preserve all existing SEO/sitemap URLs while dynamically hydrating intent slugs and presets.

### 3.1 Routing Specification (`window.__APP_MODE`)

```javascript
// Upgraded IA Router in home.html (runs synchronously before paint)
(function () {
    var params = new URLSearchParams(window.location.search);
    var path = window.location.pathname;
    
    var ANALYTICS_PARAMS = ['token', 'chain', 'pool', 'poolTypes', 'protocols', 'minTvl', 'minApy', 'app'];
    var PLANNER_PARAMS = ['goal', 'monthly', 'years', 'pace', 'preset', 'fresh', 'capital', 'fm', 'dl'];
    var INTENT_PATHS = ['/for/claude', '/for/cursor', '/for/spotify', '/for/netflix', '/for/rent-shield', '/for/treasury'];
    
    var isIntentRoute = INTENT_PATHS.some(function(p) { return path.indexOf(p) === 0; });
    var hasIntentPreset = params.has('preset') || params.has('bill');
    var isAnalyticsRoute = ANALYTICS_PARAMS.some(function(k) { return params.has(k); });
    var isPlannerRoute = /(?:^|\/)plan\.html$/.test(path) || PLANNER_PARAMS.some(function(k) { return params.has(k); });
    
    if (isIntentRoute || hasIntentPreset) {
        window.__APP_MODE = 'intent_portal';
    } else if (isAnalyticsRoute) {
        window.__APP_MODE = 'analytics'; // Pro Mode (The Quiet Ledger)
    } else if (isPlannerRoute) {
        window.__APP_MODE = 'planner';
    } else {
        window.__APP_MODE = 'landing';
    }
    
    document.documentElement.setAttribute('data-app-mode', window.__APP_MODE);
})();
```

---

## 4. Onboarding, Concierge & "Quiet Settlement" Engine

```
[ 1. Inbound Preset ] ──> [ 2. Passkey Deposit ] ──> [ 3. Apple Pay Push ] ──> [ 4. Deep-Link Billing ] ──> [ 5. $0 Auth Ping ]
  (?preset=claude)          (Base L2 Vault)           (Native Push API)          (Anthropic Settings)         (External Proof)
```

### 4.1 Step-by-Step UX Specifications

* **Step 1: The Pre-Solved Voucher (`intent_portal` mode)**
  * Displays: Item Name, Price, Tax Buffer, Required Principal, Live Pool (e.g. Aave V3 Base @ 5.05% APY).
  * CTA: **`[ Deposit $4,750 & Mint Card ]`** or **`[ Deposit $500 for 10.5% Discount ]`**.
* **Step 2: Instant Apple Pay / Google Wallet Push**
  * Invokes Card BaaS Push Provisioning SDK immediately upon deposit confirmation.
* **Step 3: Merchant Concierge Handoff**
  * Renders: 1-Click Copy for Card Number, EXP, and CVV.
  * Direct Action: **`[ Open Anthropic Billing Settings ↗ ]`** (`https://console.anthropic.com/settings/plans`).
* **Step 4: Real-Time Verification Webhook**
  * When Anthropic runs a $0/$1 verification auth test, Cloudflare Worker catches `card.authorized` and triggers an instant confirmation modal and Telegram notification:
    ```text
    🟢 Connection Verified!
    Anthropic successfully tested your Garden Card.
    Your $20/mo subscription is officially yield-funded. Balance touched: $0.00.
    ```
* **Step 5: Monthly "Quiet Settlement" Receipts**
  * Automated 1st-of-the-month yield sweep pays the statement balance. User receives a silent receipt:
    ```text
    [DeFi Garden Settlement • Sep 1, 2026]
    ──────────────────────────────────────────
    • Bill Settled:     Claude Pro ($20.00)
    • Yield Harvested:  $20.18 (Aave V3 Base)
    • Principal Intact: $4,750.18 USDC (+$0.18 surplus)
    • Bank Out-of-Pocket: $0.00
    ──────────────────────────────────────────
    [+ Slay Your Next Bill: Spotify | Cursor | Custom]
    ```

---

## 5. File-by-File Implementation Roadmap

| File | Component | Specific Changes |
| :--- | :--- | :--- |
| `trust-rails.js` | Math Engine | Export `calculateForeverNumber()` with `SAFETY_BUFFER_MULTIPLIER = 1.25`, `TAX_HEADROOM_MULTIPLIER = 1.20`. |
| `home.html` | IA Router | Support `intent_portal` mode, preserve `analytics` mode for SEO parameters. |
| `landing.js` | UI Entry Shell | Render Dual-Mode Fork: `[ ⚡ Autopilot: Kill a Bill ]` vs `[ 🛠 Pro Mode: Explore Pools ]`. |
| `contracts/YieldCardVault.sol` | Onchain Vault | Base ERC-4626 vault with Aave/Morpho yield routing, escrow accounting, and emergency exit. |
| `edge/card-middleware.js` | Cloudflare Worker | Raincards API webhooks (`card.authorized`, `card.settled`), Telegram receipt alerts. |
| `translations.js` | Localization | Add EN + KO strings for all vouchers, concierge modals, and settlement receipts. |
