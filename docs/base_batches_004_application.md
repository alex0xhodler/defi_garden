# Base Batches 004 Application: defi.garden v2

**Program:** Base Batches 004 (Fall 2026 Cohort)  
**Investment / Grant:** $100,000  
**Project Name:** defi.garden (`https://www.defi.garden`)  
**Core Product:** v2 Intent-Resolved Yield Execution Layer & Embeddable `<SpendYieldWidget />` for Autonomous Agents & Protocols  
**Team Lead:** Alex (`alex@0xhodler.nl`) | GitHub: `alex0xhodler`  
**Base Address:** `0x0d79860366926b7685428dcd2b2d1eefcbd45178`

---

## 1. What are you building? (100 words max)
**defi.garden v2** transforms raw DeFi yields into automated real-world expense settlement for AI agents and Web3 builders. Instead of navigating confusing pool tables, users access **Zero-Distance Intent Portals** (`/for/claude`, `/for/cursor`, `/for/treasury`) that collapse monthly liabilities directly into over-collateralized Base yield vaults (Morpho Blue, Auto Finance `baseEUR`, Moonwell).

Through our **Two-Stage Activation** (Stage 1: instant on-chain deposit, zero KYC; Stage 2: 60s async virtual card provisioning or x402 streaming), users and agents lock capital once to perpetually fund software and compute without ever consuming their principal ($\Delta \text{Principal} \equiv 0$).

---

## 2. Why Base? (50 words max)
Base is the execution hub for on-chain AI and agentic commerce. defi.garden powers high-frequency autonomous keeper transactions, integrates seamlessly with Coinbase AgentKit, and locks sticky, low-churn TVL across Base lending and liquidity primitives.

---

## 3. What makes your solution 10x better than existing alternatives?
1. **Zero-Distance Intent Resolution:** Replaces complex APY calculators with deterministic liability collapse ($P = \frac{12 \cdot \text{Bill} \cdot 1.20}{r_{\text{conservative}}} \cdot 1.25$ with a 1-month liquid escrow buffer).
2. **Two-Stage Non-Custodial Activation:** Users get immediate on-chain confirmation and yield accrual in 0 seconds, with zero upfront KYC barriers for vault creation.
3. **Machine-Native Trust Rails:** Hardened Streamable HTTP MCP server (`/mcp`) enforcing $\text{TVL} \ge \$100\text{K}$, $\text{APY} \le 1000\%$, and 15 bps dual-oracle circuit breakers preventing agent rate hallucinations.
4. **B2B Protocol Composability:** Standalone `@defi-garden/spend-yield-widget` SDK that any Base DEX or lending market embeds in 5 minutes to convert mercenary liquidity into permanent, sticky deposits.

---

## 4. Current Traction & Live Artifacts
- **Production Engine & Planner:** `https://www.defi.garden`
- **Streamable MCP Server:** `https://www.defi.garden/mcp` (Streamable HTTP / SSE JSON-RPC)
- **Agent Manifest:** `https://www.defi.garden/llms.txt`
- **Reown AppKit Web3 dApp:** `spend-yield-app` (Base Mainnet `8453` & Base Sepolia `84532`)
- **Automated Keeper Engine:** `defi_garden/keeper/keeper_engine.py` (100% test coverage)
- **Open-Source Repository:** [github.com/alex0xhodler/defi_garden](https://github.com/alex0xhodler/defi_garden)

---

## 5. How will you use the $100K Base Batches investment?
- **$40,000 — Keeper Gas Subsidy & Execution Infrastructure:** Fund on-chain keeper contracts to sponsor 50,000+ non-custodial harvest sweeps on Base at zero user gas cost.
- **$35,000 — Core Protocol & AgentKit SDK Engineering:** Expand open-source action providers for Coinbase AgentKit, LangChain, Hermes Agent, and ElizaOS.
- **$25,000 — Ecosystem Co-Incentives & Pilot Vault Seeding:** Seed initial protocol routing vaults (Moonwell, Auto Finance `baseEUR`, Morpho) for early intent portal depositors.
