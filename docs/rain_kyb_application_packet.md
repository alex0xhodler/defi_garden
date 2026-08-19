# Rain Cards (rain.xyz) Commercial & KYB Application Packet

**Document Version:** 1.0.0  
**Target Partner:** Rain Cards (Rain Financial Inc. / Visa Principal Member)  
**Product:** DeFi Garden (www.defi.garden) — Self-Paying Subscription Engine  
**Date:** August 17, 2026  
**Primary Contact / UBO:** Alex (Founder & Operator)  

---

## 1. Executive Summary & Partnership Objectives

DeFi Garden is integrating Rain's Web3-native Visa virtual issuing API to power **"Self-Paying Subscriptions"**—a non-custodial yield-to-card debit rail. Users deposit stablecoins (USDC) into audited bluechip yield strategies (Morpho, Aave) on Base. As yield accrues, an autonomous keeper harvests the net yield and programmatically sweeps funds into the user's dedicated Rain virtual card deposit address on Base without touching underlying principal.

### Commercial Tier Structure
- **Monthly Platform SaaS:** $0.00 / mo (Zero fixed subscription overhead).
- **Revenue Model:** Pure interchange share (Rain / DeFi Garden split on settled Visa volume) + FX spread on non-USD settlement.
- **Card Type:** Instant Programmatic Virtual Visa cards (Apple Pay / Google Pay push-provisioning enabled).
- **Funding Asset:** USDC on Base L2 network.

---

## 2. Technical & Fund Flow Architecture

```
+------------------+         +-------------------------+         +----------------------+
|   User Wallet    | ------> |  DeFi Garden Strategy   | ------> | Yield Accrual Pool   |
| (Deposits USDC)  |         | (Aave/Morpho on Base)   |         | (Principal Locked)   |
+------------------+         +-------------------------+         +----------------------+
                                         |                                  |
                                         | (Yield >= $50 USDC)              |
                                         v                                  |
                             +------------------------+                     |
                             |  Autonomous Keeper     |                     |
                             |  (ΔPrincipal ≡ 0 Gate) |                     |
                             +------------------------+                     |
                                         |                                  |
                                         v (Automated Sweep)                v
                             +------------------------+         +----------------------+
                             | Rain Card Funding Proxy|         | Net Principal Safely |
                             | (User Virtual Card)    |         | Retained in Vault    |
                             +------------------------+         +----------------------+
                                         |
                                         v
                             +------------------------+
                             | Visa Merchant Debits   |
                             | (ChatGPT, AWS, Netflix)|
                             +------------------------+
```

### Invariant & Custody Disclosures
- **Non-Custodial Architecture:** Underlying principal is held directly in ERC-4626 vault proxies controlled by user signing keys.
- **Sweep Condition:** Sweeps occur exclusively on realized yield exceeding user-configured funding targets ($\Delta \text{Principal} \ge 0$).
- **Deterministic Settlement:** Rain API provisioned virtual card IDs map 1:1 to user deposit proxy addresses on Base.

---

## 3. KYB Entity & Verification Checklist

| Document Item | Status | Verification Authority / Source |
| :--- | :--- | :--- |
| **Certificate of Incorporation** | Ready for Submission | Official National Commercial Registry |
| **Articles of Association / Bylaws** | Ready for Submission | Corporate Governance Filing |
| **Register of Directors & Officers** | Ready for Submission | Corporate Secretary File |
| **Ultimate Beneficial Owner (UBO) Registry** | Verified (>25% Equity Holder) | Alex Passport / Proof of Address |
| **Corporate Proof of Address** | Ready for Submission | Bank Statement / Utility (<90 days) |
| **AML / CFT Policy Document** | Standard Policy Prepared | DeFi Garden Compliance Policy v1.0 |
| **Sanctions & PEP Screening Protocol** | Implemented | Chainalysis / Elliptic API Screen |

---

## 4. Projected Card Volume & Commercial Economics

- **Target Launch Users (Cohort 1):** 500 active subscription vaults.
- **Average Subscription Burn per Card:** $85.00 / month (e.g. ChatGPT Pro + Claude + GitHub Copilot).
- **Cohort 1 Monthly Settled Volume:** $42,500 / month.
- **Projected Q4 2026 Volume (Post-Scaling):** $350,000+ / month settled Visa volume.
- **Interchange Distribution:** Standard interchange basis split per Visa Core Rules.

---

## 5. Next Actions & Integration Sign-Off

1. **Submit KYB Documentation** through Rain Enterprise Partner Portal.
2. **Provision Sandbox API Keys** (`client_id`, `client_secret`) for staging environment testing.
3. **Execute Webhook Sweep Dry-Run** on Base Sepolia testnet.
