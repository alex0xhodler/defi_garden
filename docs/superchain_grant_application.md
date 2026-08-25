# Superchain & Base Ecosystem Grant Proposal: defi.garden v2 Intent-Resolved Execution & <SpendYieldWidget />

**Project:** defi.garden v2 (`https://www.defi.garden`)  
**Track:** Superchain Developer Tooling, Public Goods & Autonomous Agent UX  
**Requested Amount:** 25,000 OP / Base Builder Allocation  
**Target Chains:** Base (Primary), OP Mainnet, Mode, Ink, Fraxtal  
**Lead Developer:** Alex (`alex@0xhodler.nl`) / GitHub: `alex0xhodler`  
**Recipient Address:** `0x0d79860366926b7685428dcd2b2d1eefcbd45178`

---

## 1. Executive Summary

Decentralized finance suffers from extreme depositor churn because on-chain yield remains disconnected from everyday real-world expenses. **defi.garden v2** introduces the **Intent-Resolved Execution Framework** and the open-source **`<SpendYieldWidget />` SDK** to bridge Superchain liquidity directly into automated expense settlement.

Through zero-distance intent portals (`/for/claude`, `/for/cursor`, `/for/treasury`) and non-custodial ERC-4626 proxies, users and autonomous agents collapse monthly liabilities into over-collateralized yield vaults. With our **Two-Stage Activation** model (Stage 1: instant 0s on-chain deposit, zero KYC; Stage 2: async card provisioning or x402 streaming fallback), capital is deposited once and perpetually pays software and compute bills while keeping the principal permanently intact ($\Delta \text{Principal} \equiv 0$).

---

## 2. Technical Architecture & Public Goods Deliverables

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                       Partner Protocol Frontends                            │
 │         (Moonwell, Morpho, Auto Finance baseEUR, Aerodrome)                 │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ Embeds Drop-In SDK
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                <SpendYieldWidget /> & Zero-Distance Intent Portals           │
 │   - Stage 1: 0s On-Chain Vault Deposit (Zero KYC, EIP-712 Delegation)       │
 │   - Stage 2: Async Card Provisioning & x402 Streaming Payment Fallback      │
 │   - Solvency Engine: 1.25x Over-Collateralization + 1-Mo Escrow Reserve     │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ Interacts On-Chain
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                     Superchain Non-Custodial Execution                      │
 │  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
 │  │ Moonwell / Morpho     │  │  Gas-Sponsored Keeper  │  │ Kulipa / Fiat24 │  │
 │  │ (ERC-4626 Vaults)     │  │  (<15 Gwei Execution)  │  │ (USDC/EUR)      │  │
 │  └───────────────────────┘  └───────────────────────┘  └─────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

### Key Open-Source Modules:
1. **`@defi-garden/spend-yield-widget`:** Embeddable Web3 component supporting Reown AppKit, Wagmi, and RainbowKit with quiet design tokens and zero vendor lock-in.
2. **Deterministic Solvency Engine:** Hard mathematical rails ($C_{\text{req}} = \frac{12 \cdot \text{Bill} \cdot 1.20}{r} \cdot 1.25$ + 1-month liquid yield buffer) preventing under-funded bill default.
3. **Streamable HTTP MCP (`/mcp`):** Public Model Context Protocol endpoint enabling AI agents (Hermes, Claude Desktop, Cursor, AgentKit) to discover and route yields deterministically.

---

## 3. Milestones & Fund Allocation

| Milestone | Deliverables | Allocation | Timeline |
| :--- | :--- | :--- | :--- |
| **Milestone 1: v2 Intent SDK & MCP Suite** | Publish `@defi-garden/spend-yield-widget` NPM package with Reown AppKit integration, quiet token design, and intent portal schemas (`/for/claude`, `/for/cursor`). | 8,000 OP | 4 Weeks |
| **Milestone 2: Protocol Routing & BaaS Adapters** | Deploy turnkey adapters for Moonwell, Morpho Blue, and Auto Finance `baseEUR`, integrated with zero-upfront BaaS rails (Kulipa/Fiat24). | 9,000 OP | 4 Weeks |
| **Milestone 3: Gas Sponsorship & Keeper Daemon** | Fund on-chain keeper gas subsidy pool to execute 10,000+ automated non-custodial harvest sweeps for Superchain users at zero gas cost. | 8,000 OP | 4 Weeks |

---

## 4. Superchain Alignment & Impact

1. **Sticky TVL Retention:** Protocols embedding `<SpendYieldWidget />` transform mercenary liquidity into long-term, low-churn deposits that perpetually settle user expenses.
2. **High-Frequency Block Velocity:** Autonomous keeper sweeps create verifiable, recurring L2 activity across Base and OP Mainnet.
3. **Public Good Infrastructure:** 100% permissively licensed (MIT) code for protocol teams and agent builders across the Superchain.
