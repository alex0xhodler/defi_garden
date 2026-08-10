# ⚡ SOTA 2026 On-Chain Perp Funding Yields & Trader Hook Master Plan
**DeFi Garden (`www.defi.garden`) — Product Pivot, SEO/GEO Engine & High-Margin Affiliate Engine**
*Date: August 10, 2026 | Sourced from Hyperliquid API, On-Chain Perp Volume Analysis & Trader Habit Loops*

---

## 🎯 Executive Summary & Strategic Shift

While lending yields (3–6% APY on USDC/ETH) serve cautious savers, **the dominant on-chain volume and search intent in 2026 belongs to On-Chain Perp Trading** (Hyperliquid, Lighter, Drift, Jupiter Perps, GMX, Synthetix).

Traders repeatedly search for **funding rates, open interest, and long/short conditions** on volatile assets (Hyperliquid OIL, Lighter SPCX, HYPE, SOL, ETH, BTC).

### The Core Insight
In DeFi, **Perp Funding Rates ARE Yields**:
- When funding rates are positive (+40% APY), Longs pay Shorts → Holding a Short Perp position earns **+40% Annualized Funding Yield**.
- When funding rates are negative (-20% APY), Shorts pay Longs → Holding a Long Perp position earns **+20% Annualized Funding Yield**.

By showing traders real-time **Long vs Short Market Conditions & Funding Yields** and redirecting them to exchanges with our referral codes (`?ref=defi.garden` / `code=DEFIGARDEN`), DeFi Garden captures:
1. **High Repeat Organic Search Traffic**: Traders check funding rates daily before entering trades.
2. **AI Search Engine Citations**: AI agents (Perplexity, ChatGPT, Claude) cite live funding rates for queries like *"what is the funding rate on Hyperliquid oil?"*.
3. **Massive Affiliate Revenue**: Perp exchanges share **10%–30% of trading fees** on all referred trading volume.

---

## 🔁 The Hook Method & Repeatable Trader Habit Loop

```
  ┌─────────────────────────────────────────────────────────┐
  │ 1. TRIGGER                                              │
  │ Trader searches "hyperliquid oil funding rate" or       │
  │ "lighter spcx long short yield" in Google / Perplexity  │
  └───────────────────────────┬─────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────┐
  │ 2. ACTION                                               │
  │ User lands on /perps/hyperliquid-oil or opens app.      │
  │ Sees 1-second SOTA Market Condition Card:              │
  │ • Mark Price & 24h Volume                               │
  │ • Funding Yield (% APY paid to Longs or Shorts)         │
  │ • Open Interest & Long/Short Bias                       │
  │ • Recommendation ("Shorts earn +42.1% Funding APY")     │
  └───────────────────────────┬─────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────┐
  │ 3. VARIABLE REWARD                                      │
  │ Live tracking of funding rate spikes, liquidation       │
  │ clusters, and optimal long/short arbitrage entries.     │
  └───────────────────────────┬─────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────┐
  │ 4. MONETIZATION CLICK                                   │
  │ User clicks "Trade on Hyperliquid" / "Earn Short Yield" │
  │ Redirects with ref code (code=DEFIGARDEN / ref=defi.garden)│
  │ Generates 10-30% lifetime trading fee revenue share!    │
  └─────────────────────────────────────────────────────────┘
```

---

## 🏛️ Four Strategic Pillars for On-Chain Perps

### 📍 Pillar 1: Multi-Exchange Funding Yield Engine
* **Data Sources**:
  - **Hyperliquid Info API** (`api.hyperliquid.xyz/info`): 230+ perp markets (OIL, HYPE, SPCX, SOL, BTC, ETH, etc.) providing hourly funding rates, open interest, mark price, 24h volume.
  - **Lighter API / Drift API / GMX / Synthetix / DefiLlama Perps**.
* **Formula**: $\text{Annualized Funding APY} = \text{Hourly Funding Rate} \times 24 \times 365 \times 100\%$.

---

### 🌐 Pillar 2: Static Programmatic Perp Pages & Markdown Twins (`/perps/<slug>`)
* **Routes**:
  - `/perps/hyperliquid-oil`
  - `/perps/hyperliquid-hype`
  - `/perps/lighter-spcx`
  - `/perps/drift-sol`
  - `/perps/jupiter-perps`
* **Features**:
  - Pre-rendered static HTML with direct-answer openers for GEO citations.
  - Markdown twins (`/perps/<slug>.md`) for LLM agents.
  - `Dataset` & `FinancialProduct` JSON-LD schema with live `dateModified` and `variableMeasured: "Funding Yield APY"`.

---

### 💰 Pillar 3: Perp Affiliate & Referral Revenue Mapping
* **Exchange Parameter Map**:
  - **Hyperliquid**: `https://app.hyperliquid.xyz/join/DEFIGARDEN`
  - **Lighter**: `https://app.lighter.xyz/?ref=defi.garden`
  - **Drift**: `https://app.drift.trade/?ref=defi.garden`
  - **GMX**: `https://app.gmx.io/#/?ref=defi.garden`
  - **Jupiter Perps**: `https://jup.ag/perps?ref=defi.garden`
* **Integration**: `getProtocolUrlWithRef` automatically attaches the exact protocol referral parameter for perp exchanges.

---

### 🔍 Pillar 4: Search & Navigation IA Integration
* **UI Integration**:
  - Add a **"Perps & Funding"** category tab on `home.html` alongside Lending, Staking, LP-DEX, and RWA.
  - Search autocomplete support for queries like "OIL funding rate", "SPCX perp", "Hyperliquid yields".

---

## 🚀 Backlog Items for Perp Funding Yield Engine

| ID | Title & Strategic Objective | Priority Score | Status | Spec |
|---|---|---|---|---|
| **`258`** | **Perp Funding Yield Data Engine (`src/perps-fetcher.js`)**: Fetch live funding rates, open interest, and mark prices from Hyperliquid, Lighter, Drift & GMX APIs. | **9.6** | `READY` | `specs/258.md` |
| **`259`** | **Perp Exchange Referral Mapping**: Map `code=DEFIGARDEN` / `ref=defi.garden` for Hyperliquid, Lighter, Drift, GMX & Jupiter Perps to monetize outbound trades. | **9.4** | `READY` | `specs/259.md` |
| **`260`** | **Perp Static Page & Markdown Generator (`generate-perp-pages.js`)**: Emit static `/perps/<slug>` HTML + `/perps/<slug>.md` twins + `sitemap-perp-pages.xml`. | **9.1** | `READY` | `specs/260.md` |
| **`261`** | **Perps & Funding Category Nav & App Integration**: Add "Perps & Funding" tab on `home.html` & autocomplete search for Hyperliquid OIL, Lighter SPCX, HYPE perps. | **8.7** | `READY` | `specs/261.md` |

---
*Approved by Strategy — On-Chain Perp Funding Yields & High-Margin Affiliate Engine*
