# 🌱 DeFi Garden

**Calm, honest DeFi yield discovery and goal-based savings planning.**

DeFi Garden is a static, zero-backend, zero-build-step web application built on the DefiLlama yields API, designed for cautious savers and DeFi operators who value trust, realistic projections, and mathematical transparency over speculative hype.

[![Live Demo](https://img.shields.io/badge/Live-www.defi.garden-3B82F6?style=for-the-badge)](https://www.defi.garden)
[![MIT License](https://img.shields.io/badge/License-MIT-gray?style=for-the-badge)](LICENSE)
[![React 18 UMD](https://img.shields.io/badge/React-18%20UMD-blue?style=for-the-badge&logo=react)](https://reactjs.org/)

---

## 🌟 The Two Core Faces of DeFi Garden

DeFi Garden serves two distinct workflows through an inline, zero-flash IA router (`window.__APP_MODE` in `home.html`):

### 1. 🪴 Garden Planner (Default Experience — `/` and `plan.html`)
- **Goal-First Conversational Savings:** Plan savings around real-life goals (subscriptions, gadgets, life milestones) rather than chasing abstract APY numbers.
- **Yield-Funded Paradigm:** *"Buy it outright and the money's gone. Garden it and you keep the money AND get the thing."*
- **Blended Yield Rates:** Calculates honest "forever numbers" — the capital required so ongoing live yield pays recurring bills automatically.
- **Degen Honesty:** Applies a mandatory **⅓ decay haircut** to variable farm/reward emissions, ensuring users plan around realistic long-term carry.

### 2. 📊 Analytics & Yield Discovery (`/?token=`, `/?chain=`, `/?pool=`, `/?app=1`)
- **Multi-Chain Pool Explorer:** Real-time yield monitoring across 50+ blockchains (Ethereum, Arbitrum, Base, Hyperliquid, Solana, etc.) and all major protocol types (Lending, Staking, LP/DEX, Yield Farming).
- **Deep Pool Breakdown (`PoolDetail.js`):** In-depth pool analytics, 30-day mean APY tracking, base vs. reward emission separation, and impermanent loss risk indicators.
- **Funding Harvest Module (`/hype-harvest.html` / `/?module=hype-harvest`):** Delta-neutral cash-and-carry funding harvest calculator for Hyperliquid perps with live basis spread tracking and dual-oracle divergence tripwires.

---

## 🛡️ Trust Rails (The Core Moat)

Every metric rendered across DeFi Garden derives from live on-chain and API data through strict, non-negotiable trust rails:

1. **`APY_SANITY_LIMIT = 1000%`:** Anomalous, short-lived spikes can never enter a plan. In analytics, anomalous pools are demoted, flagged with `⚠`, and forced to high-risk classification.
2. **`DEFAULT_MIN_TVL = $100K`:** Low-liquidity pools below the safety floor are filtered out to protect savers from illiquid exits and sudden deprecations.
3. **Dual-Oracle Divergence Guard:** Modules verify mark vs. oracle price divergence ($<15\text{ bps}$ tripwire) to alert on basis dislocation and squeeze risk.
4. **Deterministic Math Layer:** LLMs may narrate or explain mechanisms, but numbers, projections, and compounded yields are calculated deterministically.

---

## 🎨 Design System — "Quiet"

DeFi Garden uses the **"Quiet"** design system — a restrained, clean-minimal, table-first interface designed for clarity and focus:

- **Surface Tokens (`--ui-*`):** 
  - Backgrounds: `--ui-bg` (`#F7F8FA` light / `#161A20` dark), `--ui-surface` (`#FFFFFF` / `#1E242C`), `--ui-surface-muted`, `--ui-surface-sunken`.
  - Separation: Single-pixel hairline borders (`--ui-border: #E4E7EE`, `--ui-border-strong: #CBD2DF`).
  - Text: High-contrast hierarchy (`--ui-text: #10151F`, `--ui-text-secondary: #5A6478`, `--ui-text-muted: #8A93A6`).
  - Accents: Fixed trust-blue palette (`--ui-accent: #3B82F6`, `--ui-accent-hover: #2563EB`, `--ui-accent-soft: #EFF5FF`).
  - Radii: Clean geometric squircles (`--ui-radius-sm: 8px`, `--ui-radius-md: 12px`, `--ui-radius-lg: 16px`, `--ui-radius-pill: 999px`).
- **No Heavy Shadows or Skeuomorphic Skeins:** Depth is created through crisp hairline borders and subtle surface tone steps, not artificial dual-direction shadows or background gradients.
- **Physical Press Physics:** Interactive controls sink 1px on `:active` (`transform: translateY(1px)`), respecting `prefers-reduced-motion`.
- **First-Class Bilingual Support (`translations.js`):** Complete English (`en`) and Korean (`ko`) localization synchronized across all user-facing strings.

---

## 🛠️ Architecture & Technology Stack

- **Zero Build Step:** Runs natively on vanilla web standards. React 18 UMD loaded via script tag; components written in pure `React.createElement` (no JSX compilation step required).
- **Data Ingestion:** Client-side integration with `https://yields.llama.fi/pools` and Hyperliquid Info API (`https://api.hyperliquid.xyz/info`).
- **State Management:**
  - Theme: `localStorage.getItem('theme')` with `data-theme="light|dark"` attribute on `<html>`.
  - Language: URL param `?lang=` + `localStorage.getItem('defi-garden-lang')`.
  - Saved Plan: `localStorage.getItem('garden-plan')`.
- **SEO & Machine Readability:**
  - Automated dynamic sitemaps (`generate-sitemap.js`).
  - AI Context endpoints: `llms.txt` and `llms-full.txt` (`generate-llms.js`).
  - Model Context Protocol (MCP) server integration (`mcp_server.js`).

---

## 📁 Repository Structure

```
defi_garden/
├── home.html                   # Master router & analytics app shell
├── plan.html                   # Standalone Garden Planner entry
├── hype-harvest.html           # HYPE Funding Harvest module
├── planner.js                  # Conversational Garden Planner engine
├── app.js                      # Core analytics grid & pool filtering
├── PoolDetail.js               # In-depth pool analytics & calculator
├── hype-harvest.js             # HYPE funding harvest React UMD module
├── translations.js             # Bilingual dictionary (EN + KO)
├── translations.min.js         # Production-minified translation dictionary
├── style.css                   # "Quiet" design system tokens & base styles
├── planner-styles.css          # Planner-specific layout styles
├── pool-detail-styles.css      # Pool detail drawer styles
├── hype-harvest.css            # Funding harvest layout styles
├── trust-rails.js              # Shared trust-rail constants
├── canonical.js                # URL canonicalization logic
├── keeper/                     # Autonomous execution & risk keeper scripts
│   ├── keeper_engine.py        # Core risk keeper engine
│   └── hype_funding_harvest.py # Hyperliquid HYPE funding rate worker
├── tests/                      # Python unit & integration test suite
│   ├── test_keeper_engine.py
│   └── test_keeper_hype_harvest.py
└── test_*.js                   # JavaScript offline test suite (71+ test files)
```

---

## 🧪 Development & Testing

DeFi Garden requires no build pipeline. Serve locally with any static HTTP server:

```bash
# Start local server
python3 -m http.server 8000
# Open in browser: http://localhost:8000
```

### Running Tests

```bash
# Run all unit tests in fast plain mode
npm run test:fast

# Run the complete test suite (plain + browser)
npm test

# Minify production assets
npm run minify
```

---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.
