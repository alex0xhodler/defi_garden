# Deep On-Chain Pool & Vault Underwriting with Herd MCP
## The Andrew Hong Playbook: SOTA Institutional KPIs for B2B & B2C

**Document ID**: DG-SPEC-HERD-2026-v1.0  
**Status**: Approved Architecture Blueprint  
**Authors**: DeFi Garden Quantitative Research & Systems Architecture  
**Reference Docs**: [Herd MCP Documentation](https://docs.herd.eco/herd-mcp/introduction) · [Andrew Hong (@andrewhong5297) On-Chain Vault Analytics](https://x.com/andrewhong5297)  

---

## 1. Executive Summary & Core Thesis

DeFi Garden has established high-conviction macroeconomic yield discovery via DefiLlama and TimesFM 3.0 predictive forecasting. However, macroscopic rate time-series alone cannot verify **atomic on-chain contract mechanics**:
- Who owns the admin keys to the vault? Can an unannounced proxy upgrade drain depositor funds?
- Is the advertised \$50M TVL owned by 2,000 retail savers or 2 anonymous whale addresses that could trigger an instantaneous liquidity crunch upon withdrawal?
- Does the vault maintain sufficient unborrowed atomic liquidity on-chain to handle a 30% bank run without freezing redemptions?

By integrating the **Herd.eco MCP (Model Context Protocol) server** (`https://mcp.herd.eco/v1`), DeFi Garden connects autonomous AI agents and backend ingestion pipelines directly to institutional-grade, low-latency on-chain RPC and trace infrastructure across Ethereum and Base.

Following the quantitative methodology pioneered by **Andrew Hong (@andrewhong5297)**, this blueprint defines how Herd MCP's contract, role, transaction, and wallet tools transform raw on-chain events into **standardized, SOTA-grade underwriting KPIs** for institutional treasuries (B2B) and retail goal planners (B2C).

---

## 2. The Andrew Hong Playbook: On-Chain Vault Analytics

Andrew Hong's groundbreaking on-chain vault research establishes five non-negotiable dimensions for judging decentralized lending markets, ERC-4626 yield aggregators, and staking vaults:

### 2.1. Whale Concentration & Herfindahl-Hirschman Index (HHI)
Headline TVL is deceptive. A \$100M vault with 90% concentration among two depositors carries extreme liquidity risk:
$$\text{HHI} = \sum_{i=1}^{N} \left(\frac{\text{Depositor Balance}_i}{\text{Total Vault TVL}} \times 100\right)^2$$
- **HHI < 1,500**: Unconcentrated, healthy retail distribution.
- **1,500 ≤ HHI ≤ 2,500**: Moderately concentrated.
- **HHI > 2,500**: High whale vulnerability (a single exit precipitates a run).

### 2.2. Capital Dwell Time & Cohort Retention
Distinguishing between **sticky, productive capital** and **mercenary farming capital**:
- **30d / 60d Depositor Retention Rate**: Percentage of capital retained after emissions halve.
- **Average Deposit Age**: The weighted average block duration tokens remain in the vault contract.

### 2.3. Liquidity Strain & Run-on-the-Bank Ratio (Atomic Buffer)
Evaluating instantaneous exit capability under stress:
$$\text{Atomic Exit Ratio} = \frac{\text{Unborrowed Cash} + \text{Instant DEX Pool Liquidity}}{\text{Top 3 Depositor Balance}}$$
- When ratio < 1.0, the vault is structurally vulnerable to a redemption freeze if the top whales exit simultaneously.

### 2.4. Smart Contract Governance & Admin Key Topology
Assessing contract upgradeability and human centralization vectors:
- Safe multisig threshold vs EOA key (e.g. 3-of-5 Safe vs single private key).
- Timelock buffer: Delay between upgrade announcement and execution (0-delay = instant exploit risk).
- Privileged roles: Separation between `PAUSER`, `MINTER`, `ORACLE_SETTER`, and `UPGRADER`.

---

## 3. Mapping Herd MCP Tools to DeFi Garden Underwriting Pillars

Herd MCP exposes specialized tools tailored for deep contract due diligence. Below is the operational mapping into DeFi Garden's quantitative pipeline:

| Underwriting Pillar | Herd MCP Tool | Tool Call Signature | Extracted Intelligence |
| :--- | :--- | :--- | :--- |
| **Governance & Security** | `roleTopologyTool` | `roleTopologyTool({ contractAddress, blockchain })` | Complete hierarchy of `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, `UPGRADE_ROLE`, signer threshold, timelock duration. |
| **Upgrade History** | `diffContractVersions` | `diffContractVersions({ contractAddress, blockchain })` | AST diff between active implementation and prior versions. Detects unexpected fee hikes, fee on transfer, or altered withdrawal logic. |
| **Contract Auditing** | `codeAnalysisTool` | `codeAnalysisTool({ contractAddress, regexPattern, blockchain })` | Scans for reentrancy guards, emergency pause hooks, flashloan fee parameters, and oracle staleness checks. |
| **Whale Concentration** | `tokenActivityTool` & `walletOverviewTool` | `tokenActivityTool({ tokenAddress, blockchain, limit })` | Net token flows, top holder wallet classification (Safe multisig vs institutional custody vs individual EOA). |
| **Exit Depth & Traces** | `queryTransactionTool` | `queryTransactionTool({ txHash, blockchain })` | Decodes trace logs of recent massive withdrawals, detecting slippage, liquidation penalties, and queue settlement times. |
| **Recent Activity** | `latestTransactionsTool` | `latestTransactionsTool({ contractAddress, functionName, blockchain })` | Real-time monitoring of `withdraw()`, `deposit()`, `rebalance()`, and `liquidate()` frequency and gas impact. |
| **Interactive Simulation** | `halActionsTool` | `halActionsTool.simulate({ action, params })` | Simulates custom ticket sizes on-chain to measure exact price impact and post-execution share price dilution. |

---

## 4. SOTA Quantitative KPIs for B2B & B2C

DeFi Garden synthesizes these on-chain reads into five standardized KPIs displayed across the **Institutional Decision Terminal** and user-facing **Pool Detail Hero**:

### 4.1. Whale Vulnerability Ratio (WVR)
- **Definition**: Percentage of total vault shares controlled by the top 5 non-protocol addresses.
- **Data Source**: Herd `tokenActivityTool` & `walletOverviewTool`.
- **Target**: `< 35%` (Low), `35–60%` (Medium), `> 60%` (High).

### 4.2. Governance Centralization Index (GCI)
- **Definition**: Evaluates whether the contract implementation can be modified unilaterally.
- **Data Source**: Herd `roleTopologyTool` + `contractMetadataTool`.
- **Scoring**:
  - **AAA (Safe)**: Timelocked (≥48h) multi-sig (≥3/5) or immutable contract.
  - **BBB (Moderate)**: Multi-sig without timelock.
  - **C (High Risk)**: Single EOA owner or 0-delay proxy upgradeable.

### 4.3. Atomic Cash Headroom (ACH)
- **Definition**: Exact token balance currently liquid in the contract minus utilization obligations.
- **Data Source**: Herd `contractMetadataTool` + HAL read expressions.
- **Display**: Explicit dollar value (e.g. `$411.2M available`).

### 4.4. Code Invariant Score (CIS)
- **Definition**: Automated verification of ERC-4626 share-to-asset invariants and absence of fee extraction backdoors.
- **Data Source**: Herd `diffContractVersions` & `codeAnalysisTool`.
- **Display**: `✓ Verified Share Invariants (v1.4.2)`.

---

## 5. Technical Implementation Architecture

```
                                    ┌────────────────────────┐
                                    │    DefiLlama Yields    │ (Macro APY & TVL)
                                    └───────────┬────────────┘
                                                │
┌─────────────────────────┐                     ▼
│  Herd.eco MCP Server    ├────────►┌────────────────────────┐
│  (https://mcp.herd.eco) │         │  DeFi Garden Underwrite│
│  - roleTopology         │         │  Quantitative Engine   │
│  - diffContractVersions │         └───────────┬────────────┘
│  - tokenActivity        │                     │
│  - queryTransaction     │                     ▼
└─────────────────────────┘         ┌────────────────────────┐
                                    │  TimesFM 3.0 Forecast  │ (Multivariate 14d)
                                    └───────────┬────────────┘
                                                │
                                                ▼
                                    ┌────────────────────────┐
                                    │  DeFi Health Score     │ (0-100 & AAA)
                                    │  Decision Terminal     │ (Liquid exit gauges)
                                    └────────────────────────┘
```

### 5.1. Agent Configuration
To run deep due diligence on any vault or pool contract within Claude Code or local agents:
```bash
claude mcp add --transport http herd-mcp https://mcp.herd.eco/v1
```

### 5.2. Automated Scheduled Ingestion
Add a scheduled job in `.github/workflows/sitemap-update.yml` or backend worker:
1. Extract top 100 pools by TVL on Ethereum and Base.
2. Query `roleTopologyTool` and `diffContractVersions` via Herd TypeScript SDK (`@herd-labs/sdk`).
3. Store role structure and whale concentration index directly in `data/pools-snapshot.json`.
4. Surface verified badge `✓ Verified Timelock & Roles` on pool detail pages.

---

## 6. Phased Implementation Roadmap

- [x] **Phase 1: Architecture Blueprint & PRD** (This specification, aligned with Andrew Hong's vault methodology).
- [ ] **Phase 2: Local CLI / MCP Integration** (Add `herd-mcp` to development harnesses for real-time vault inspection).
- [ ] **Phase 3: Automated On-Chain Role Verification** (Automate checking `DEFAULT_ADMIN_ROLE` and proxy implementations for top 100 pools).
- [ ] **Phase 4: Institutional Decision Terminal Live Feed** (Replace heuristic depth estimates with live on-chain atomic cash balances and Safe multi-sig signer counts).
- [ ] **Phase 5: B2B Vault Auditing API** (Expose `/api/pools/:id/underwriting` with complete role topology and HHI concentration scores).
