# Base Builder Grant Proposal: Agentic Yield Intelligence & On-Chain Keeper Infrastructure

**Project:** defi.garden (`https://www.defi.garden`)  
**Track:** Agentic Tooling, Developer Infrastructure & On-Chain AI  
**Requested Amount:** $30,000 in OP / ETH (Gas Subsidies & Core Open-Source Infrastructure)  
**Target Deployment:** Base Mainnet  
**Contact / Lead:** Alex (`alex@0xhodler.nl`) / GitHub: `alex0xhodler`  
**Wallet Address (Base):** `0x0d79860366926b7685428dcd2b2d1eefcbd45178`

---

## 1. Executive Summary

Autonomous on-chain agents (e.g., Hermes, Coinbase AgentKit, ElizaOS, Goat SDK) and autonomous wallets require real-time, deterministic yield intelligence to execute treasury rebalancing, collateral optimization, and yield-funded subscriptions. Today, agents consuming raw DeFi APIs face critical failures: hallucinatory rates from illiquid scam pools, broken unstructured JSON schemas, and gas-prohibitive execution costs.

**defi.garden** provides a hardened, machine-native yield discovery and execution intelligence engine for the Base ecosystem. Through our **Streamable HTTP Model Context Protocol (MCP)** endpoint (`https://www.defi.garden/mcp`), structured `llms.txt`, and deterministic on-chain keeper rails, AI agents can query, filter, and route liquidity into top Base yield primitives (Morpho Blue, Aave v3, Aerodrome, Moonwell) with cryptographic sanity checks and zero rate hallucinations.

---

## 2. Technical Architecture & Base Integration

```
                 ┌──────────────────────────────────────────────┐
                 │       Autonomous AI Agents & Wallets         │
                 │   (Coinbase AgentKit, Hermes, Claude, Eliza) │
                 └──────────────────────┬───────────────────────┘
                                        │ Streamable HTTP MCP / JSON-RPC
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │          defi.garden Yield Engine            │
                 │   - APY Sanity Ceiling (≤ 1000%)             │
                 │   - Base TVL Hard Floor (≥ $100K)            │
                 │   - Dual-Oracle Tripwire (Spread ≤ 15 bps)   │
                 └──────────────────────┬───────────────────────┘
                                        │ Verified Yield Routing & Signals
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                           Base On-Chain Execution                           │
 │  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
 │  │   Morpho Blue Vaults  │  │   Aerodrome LP DEX    │  │ Rain Card Sweep │  │
 │  │  (USDC/cbBTC Lending) │  │  (Slipstream CL Pools) │  │ (Yield Funding) │  │
 │  └───────────────────────┘  └───────────────────────┘  └─────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Deterministic Trust Rails
1. **Machine-Native Rate Clamping:** Any pool exceeding $1000\%$ APY or experiencing unconfirmed outlier spikes ($>2.5\sigma$) is quarantined and excluded from agent recommendation payloads.
2. **Base TVL Floor:** Hard minimum TVL threshold of $\$100\text{K}$ (default $\$10\text{M}$ for retail plans) prevents sandwich and low-liquidity slippage attacks.
3. **Dual-Oracle Sanity Checks:** Real-time cross-validation between Chainlink and secondary feeds (Pyth/Redstone) with a 15 bps spread ceiling to protect autonomous looping strategies.

### 2.2. Base-Specific Primitives Supported
- **Lending & Money Markets:** Morpho Blue (Seamless & Gauntlet USDC/WETH vaults), Aave v3 Base, Moonwell.
- **DEX & Concentrated Liquidity:** Aerodrome Slipstream CL pools (USDC-USD+, WETH-USDC).
- **Yield-Funded Real World Execution:** Rain Card Program automated Base USDC sweeps, funding physical and virtual payment cards via non-custodial yield routing ($\Delta \text{Principal} \equiv 0$).

---

## 3. Scope of Work & Grant Milestones

The $30,000 grant will be allocated across 3 verifiable milestones over 12 weeks:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Milestone 1: Base Agent MCP & Open-Source Toolkit         ($10,000 / Mo 1)  │
│  - Streamable HTTP MCP server optimized for Base yield discovery            │
│  - Coinbase AgentKit plugin: @defi-garden/agentkit-action-provider          │
│  - Sub-150ms latency endpoint SLA with live Base pool indexing              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Milestone 2: On-Chain Keeper & Gas Rebate Infrastructure   ($12,000 / Mo 2)  │
│  - Deploy gas-sponsored keeper bot contracts on Base                        │
│  - Automated deleverage & compounding engine (<15 Gwei execution gates)      │
│  - Zero-cost rebalancing relay for verified agent wallet integrations       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Milestone 3: Self-Paying Subscription & Yield Planner SDK  ($8,000 / Mo 3)  │
│  - Public SDK & React/TypeScript components for Base ecosystem builders     │
│  - Native integration with Rain programmatic card sweeps on Base            │
│  - Documentation, comprehensive unit test suites, and public launch         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Milestone Deliverables & Verification Criteria

| Milestone | Deliverables | Verification Metric |
| :--- | :--- | :--- |
| **M1: Agent MCP & Tooling** | • `https://www.defi.garden/mcp` live with Base pool tools (`get_base_yields`, `find_lending_rate`, `get_looping_params`).<br>• Open-source NPM package for Coinbase AgentKit & LangChain. | • MCP response latency $<150$ms.<br>• 100% test coverage on Base filter schemas. |
| **M2: Keeper & Gas Sponsorship** | • Production keeper contracts on Base Mainnet.<br>• Gas sponsorship pool funding automated auto-compound & emergency unwinds at $\le 15$ Gwei. | • >5,000 automated keeper transactions executed on Base.<br>• $\Delta \text{Principal} \equiv 0$ invariant maintained across 100% of sweeps. |
| **M3: Yield-Funded Card & SDK** | • Complete developer documentation and interactive Playground on Base.<br>• Turnkey TypeScript SDK for "Self-Paying Subscriptions" powered by Base Morpho/Aave vaults. | • >10 active developer projects integrating MCP/SDK.<br>• $500K+ in Base TVL routed via autonomous agents. |

---

## 4. Budget Breakdown

| Category | Allocation | Description |
| :--- | :--- | :--- |
| **Base Keeper Gas Subsidy Pool** | **$14,000** | Dedicated on-chain gas sponsorship contract to execute autonomous auto-compounds, risk deleveraging, and Rain card sweeps for users at zero gas overhead. |
| **Infrastructure & RPCs** | **$6,000** | High-throughput dedicated Base node infrastructure (Alchemy/QuickNode), Redis caching cluster, and global edge CDN for sub-150ms MCP stream responses. |
| **Core Protocol & SDK Engineering** | **$10,000** | Full-time engineering hours for AgentKit provider integration, smart contract keeper deployment, and formal verification of risk tripwires. |
| **Total** | **$30,000** | |

---

## 5. Ecosystem Impact & Alignment with Base

1. **Driving High-Velocity Base Transactions:** Every autonomous agent relying on defi.garden for treasury rebalancing and yield-funded card spending drives recurring, high-frequency transactions to Base contracts (Morpho, Aerodrome, Aave).
2. **Standardizing Agent Financial Intelligence:** Base is the premier chain for on-chain AI. defi.garden provides the mission-critical data layer preventing agent exploits and rate hallucination.
3. **100% Open-Source & Public Good:** All MCP server schemas, AgentKit connectors, and keeper engine code are permissively licensed (MIT) for any builder on Base to fork, integrate, or inspect.

---

## 6. Verification Links & Repositories

- **Live Yield Engine & Planner:** [https://www.defi.garden](https://www.defi.garden)
- **MCP Endpoint:** `https://www.defi.garden/mcp`
- **Agent Intelligence Manifest:** `https://www.defi.garden/llms.txt`
- **Keeper Engine Source:** `defi_garden/keeper/keeper_engine.py`
- **Risk Gate Specification:** `defi_garden/docs/risk_parameters_boosted_mode.md`
- **Rain KYB Integration:** `defi_garden/docs/rain_kyb_application_packet.md`
