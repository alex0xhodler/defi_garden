# PRD-003: Zero-Distance Intent Portals (`/for/<slug>`) & Virtual Card Simulator

**Document Version:** `2.0.0-PROD`  
**Status:** `READY FOR AGENT IMPLEMENTATION`  
**Target Repository:** `defi_garden` (`www.defi.garden/for/*`)  
**Design System:** `Quiet` (1px hairline borders, `--ui-*` tokens, monospaced tabular numerals, zero neumorphism)  

---

## 1. Executive Summary & Intent Paradigm

Traditional Web3 DeFi forces users to calculate APY math in their head, search through dozens of volatile liquidity pools, and manage multi-step approvals before understanding what real-world value they receive.

**DeFi Garden v2 Intent Portals (`/for/<slug>`)** collapse the distance between a user's monthly real-world liability (e.g. *$20/mo Claude Pro*, *$20/mo Cursor Pro*, *$12/mo Spotify*) and onchain capital to **zero**.

### The Core Invariant
> **"Buy it outright and the money is gone. Garden it and you keep the money AND get the thing."**
> 
> A user deposits USDC once into an audited Base lending vault (Morpho Blue / Aave V3). Realized monthly yield perpetually settles their subscription invoice via a virtual card. Principal remains 100% self-custodial and withdrawable at any moment ($\Delta \text{Principal} \equiv 0$).

---

## 2. Target Route Matrix & Subscription Presets

| Route Slug | Target Subscription | Category | Base Monthly | Tax Buffer (+20%) | Required Deposit (5.0% APY w/ 1.25x Buffer) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/for/claude` | Anthropic Claude Pro | AI / Developer | $20.00 / mo | $24.00 / mo | **$7,200 USDC** |
| `/for/cursor` | Cursor Pro IDE | AI / Developer | $20.00 / mo | $24.00 / mo | **$7,200 USDC** |
| `/for/chatgpt` | OpenAI ChatGPT Plus | AI / Developer | $20.00 / mo | $24.00 / mo | **$7,200 USDC** |
| `/for/spotify` | Spotify Premium | Media Streaming | $11.99 / mo | $14.39 / mo | **$4,316 USDC** |
| `/for/netflix` | Netflix Standard | Media Streaming | $17.99 / mo | $21.59 / mo | **$6,476 USDC** |
| `/for/aws` | AWS Cloud Micro-Infra | Cloud Compute | $50.00 / mo | $60.00 / mo | **$18,000 USDC** |
| `/for/github` | GitHub Copilot Pro | AI / Developer | $10.00 / mo | $12.00 / mo | **$3,600 USDC** |
| `/for/youtube` | YouTube Premium | Media Streaming | $13.99 / mo | $16.79 / mo | **$5,036 USDC** |

---

## 3. UI/UX Specifications & Component Architecture

Every `/for/<slug>` page is rendered as a lightweight, static HTML file utilizing the **Quiet Design System** (`style.css`), ensuring instant first-contentful-paint (<150ms) and complete mobile responsiveness down to 360px.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ NAVBAR: Brand Logo (🌱 DeFi Garden) | Savings Planner | Analytics | Agents | llms.txt  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ HERO HEADER:                                                                           │
│ • Intent Badge: [🤖 AI & Developer Tooling · Intent Portal]                            │
│ • Headline: "Never pay for Claude Pro again."                                          │
│ • Subhead: "Lock $7,200 USDC on Base. Realized yield pays your $20/mo Claude invoice.  │
│             Keep 100% of your principal. Withdraw at any time."                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ INTERACTIVE TWO-COLUMN SIMULATOR GRID:                                                 │
│ ┌──────────────────────────────────────────┐ ┌───────────────────────────────────────┐ │
│ │ 💳 YIELD-FUNDED VIRTUAL CARD PREVIEW     │ │ ⚡ HOW INTENT RESOLUTION WORKS         │ │
│ │ ┌──────────────────────────────────────┐ │ │ 1. Deposit Once on Base               │ │
│ │ │ 🔲 CHIP                              │ │ │    Lock USDC in Morpho Blue via       │ │
│ │ │ •••• •••• •••• 8453                  │ │ │    Coinbase Smart Wallet / Passkey.   │ │
│ │ │ CARDHOLDER: CLAUDE-VAULT / AGENT-01  │ │ │                                       │ │
│ │ │ STATUS: 🟢 ACTIVE ($24.00/mo YIELD)   │ │ │ 2. Automated Yield Harvests           │ │
│ │ └──────────────────────────────────────┘ │ │    Keepers sweep realized yield to    │ │
│ │ Monthly Subscription: $20.00 USD        │ │    fund card spending power.          │ │
│ │ Tax/VAT Buffer (+20%): $4.00 USD         │ │                                       │ │
│ │ Base Net APY: 5.0% USDC                  │ │ 3. 100% Principal Protection          │ │
│ │ Required Deposit: $7,200 USDC            │ │    Your initial deposit remains       │ │
│ │                                          │ │    untouched forever (ΔP ≡ 0).        │ │
│ │ [ CTA: Simulate & Open Vault → ]         │ │                                       │ │
│ └──────────────────────────────────────────┘ └───────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PROTOCOL INVARIANTS:                                                                   │
│ • Over-collateralization: 1.25x base buffer backstops yield droughts                   │
│ • Liquid Escrow: 1-month upfront yield reserve prevents billing declines               │
│ • Self-Custodial: Smart contract withdrawal rights retained by user at all times       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Homepage Subscription Intent Hub Replacement (`landing.js`)

On the main landing page (`home.html` / `landing.js`), replace the legacy *"Plant a Garden"* second CTA card with the **Interactive Subscription Intent Grid**:

1. **Topline:** `⚡ Self-Paying Subscriptions (v2 Intent)`
2. **Interactive Selector Chips:** Instant tab switching across `Claude`, `Cursor`, `ChatGPT`, `Spotify`, `Netflix`, `AWS`, and `GitHub`.
3. **Dynamic Virtual Card Visualizer:** Updates cardholder name, required USDC deposit amount, and active monthly yield in real time based on the active chip.
4. **Direct Navigation CTA:** Links directly to `/for/<slug>` or `plan.html?goal=<slug>&capital=<deposit>&fm=capital`.

---

## 5. Machine-Native AEO & GEO Structured Data (JSON-LD)

Each `/for/<slug>` page embeds rich JSON-LD graph objects:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "@id": "https://www.defi.garden/for/claude#product",
      "name": "Claude Pro Perpetual Yield Vault",
      "description": "Self-paying Claude Pro subscription powered by Base USDC yield.",
      "category": "AI & Developer Tooling",
      "offers": {
        "@type": "Offer",
        "price": "7200",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock",
        "url": "https://www.defi.garden/for/claude"
      }
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.defi.garden/for/claude#app",
      "name": "DeFi Garden Claude Pro Intent Portal",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "All",
      "url": "https://www.defi.garden/for/claude"
    }
  ]
}
```

---

## 6. Implementation Checklist for Agent Execution

- [x] **Static Generator Script:** `generate-for-pages.js` compiled and executed (`/for/*.html`).
- [x] **Homepage Integration:** `landing.js` updated with interactive subscription selector chips and virtual card preview.
- [x] **Sitemap Indexing:** `sitemap-main.xml` and `generate-sitemap.js` updated to include all `/for/*` routes.
- [x] **Vercel Routing:** Clean URLs verified in `vercel.json`.
- [x] **Test Verification:** Unit and smoke tests passing (`test_smoke.js`, `test_landing.js`, `test_sitemap_xml.js`).
