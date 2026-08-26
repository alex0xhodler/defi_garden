# Moonwell DAO Governance RFC: Native Spend-Yield Vaults & Co-Incentive Alliance

**Status:** Proposed / Stage 1 RFC  
**Target Program:** Moonwell DAO Ecosystem Co-Incentive Grant  
**Requested Allocation:** $15,000 USD (in WELL tokens or USDC equivalent)  
**Target Chain:** Base (Chain ID: 8453)  
**Target Vaults:** Moonwell mUSDC & mEURC Lending Markets  
**Proposer:** DeFi Garden (`https://www.defi.garden`)  
**Core Maintainer:** Alex (`alex@0xhodler.nl`) | Base Address: `0x0d79860366926b7685428dcd2b2d1eefcbd45178`

---

## 1. Executive Summary & Proposal Overview

DeFi Garden v2 proposes a joint liquidity and user acquisition initiative with **Moonwell DAO** on Base. 

By integrating Moonwell's flagship `mUSDC` and `mEURC` lending markets as primary yield-generating engines within DeFi Garden's **Zero-Distance Intent Portals** (`/for/claude`, `/for/cursor`, `/for/treasury`), we convert retail SaaS liabilities and DAO operational expenses into **permanent, low-churn onchain liquidity for Moonwell**.

### The Value Proposition to Moonwell DAO:
1. **Sticky, Low-Churn TVL:** Unlike mercenary liquidity that hops protocols for yield deltas, DeFi Garden depositors park stablecoins to perpetually pay real-world recurring bills (e.g. $20/mo Claude Pro, $500/mo team SaaS). Once deposited, capital churn is near zero.
2. **Autonomous Keeper Routing:** 1st-of-the-month keeper sweeps continuously harvest mUSDC supply interest to settle virtual card liabilities while retaining 100% of underlying mUSDC principal.
3. **Co-Incentive Matching:** The $15,000 grant will be deployed 100% towards APY boost subsidies on Moonwell-routed intent vaults, accelerating retail and B2B treasury onboarding on Base.

---

## 2. Technical Architecture & Integration Spec

```
┌────────────────────────────────────────────────────────────────────────┐
│ DEPOSITOR / AGENT INTENT                                               │
│ Lock $7,200 USDC on Base (via Passkey / Safe Multisig)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Non-custodial deposit
┌───────────────────────────────────▼────────────────────────────────────┐
│ DEFI GARDEN v2 VAULT (`YieldCardVault.sol`)                            │
│ Routes 100% of underlying USDC directly into Moonwell `mUSDC` on Base   │
│ Invariants:                                                            │
│ • 1.25x Over-collateralization Buffer                                  │
│ • 1-Month Liquid Escrow Reserve                                        │
│ • Dual-Oracle Divergence Tripwire (<15 bps)                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Accrues Moonwell Supply APY
┌───────────────────────────────────▼────────────────────────────────────┐
│ AUTONOMOUS KEEPER HARVEST ENGINE (1st of Month)                        │
│ • Sweeps accrued mUSDC yield                                           │
│ • Funds Fiat24 / Kulipa virtual Visa deposit proxy                     │
│ • Net Principal Invariant Preserved: ΔPrincipal ≡ 0                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Risk & Solvency Parameters

- **Underlying Market:** Moonwell mUSDC (Base Mainnet).
- **Oracle Infrastructure:** Primary Chainlink USDC feed + Secondary Pyth/Redstone with automated 15 bps divergence tripwire.
- **Over-Collateralization Multiplier:** 1.25x baseline buffer backstops market-wide lending rate dips.
- **Surplus Sponge:** Excess yield during high-utilization spikes is trapped in the user's escrow reserve (up to 3 months) before surplus distribution.
- **Custody Invariant:** Depositor retains unconditional withdrawal rights at all times directly from the Moonwell pool.

---

## 4. Grant Budget Allocation & Milestone Breakdown ($15,000 Total)

| Milestone | Deliverable | Allocation | Target Date |
| :--- | :--- | :--- | :--- |
| **Phase 1: Routing & Integration** | Moonwell mUSDC & mEURC adapters deployed and tested in `defi_garden/adapters/` with 100% test coverage. | $5,000 USD | Sept 25, 2026 |
| **Phase 2: UI Intent Portals & Co-Marketing** | Dedicated Moonwell-badged intent portal (`/for/moonwell-treasury` & `/for/claude?route=moonwell`) + joint co-announcement on Warpcast/X. | $5,000 USD | Oct 10, 2026 |
| **Phase 3: $1M TVL Milestone** | Achieve $1,000,000 in sticky USDC locked in Moonwell-routed intent vaults. | $5,000 USD | Nov 15, 2026 |

---

## 5. Next Steps

1. Community discussion and feedback on the Moonwell Governance Forum (`gov.moonwell.fi`).
2. Move proposal to Snapshot vote.
3. Deploy Moonwell adapter on Base Mainnet.
