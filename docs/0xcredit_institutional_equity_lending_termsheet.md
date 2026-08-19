# 0x Credit — Institutional Tokenized Equity Lending Facility Term Sheet

**Facility Name:** 0x Credit Institutional Stock-Backed Borrow/Lend Vaults  
**Asset Class:** Real-World Assets (RWA) — Tokenized US Equities & Treasury ETFs  
**Date:** August 17, 2026  
**Issuer / Protocol:** 0x Credit Protocol  
**Target Counterparties:** Crypto-Native Prop Trading Desks, Family Offices, Prime Brokers, Web3 Foundation Treasuries  

---

## 1. Facility Overview & Core Value Proposition

0x Credit offers institutional-grade isolated lending markets allowing holders of tokenized US equities (bNVDA, dAAPL, bIB01) to borrow liquid stablecoins (USDC/USDT) against their equity collateral without triggering taxable capital gains events or liquidating core equity exposures.

---

## 2. Key Terms & Collateral Risk Parameters

| Parameter | Tier 1 (Tokenized Mega-Cap Equities) | Tier 2 (Tokenized ETFs / RWA) |
| :--- | :--- | :--- |
| **Eligible Collateral** | bNVDA (Backed NVDA), dAAPL (Dinari AAPL), bMSFT, bTSLA | bIB01 (iShares $ Treasury Bond), USDY (Ondo), bSPY |
| **Borrow Asset** | USDC, USDT (Base / Arbitrum / Ethereum) | USDC, USDT (Base / Arbitrum / Ethereum) |
| **Max Loan-to-Value (Max LTV)** | **65.0%** | **80.0%** |
| **Liquidation LTV (LLTV)** | **75.0%** | **85.0%** |
| **Liquidation Incentive / Penalty** | **4.0%** | **2.5%** |
| **Min Facility Size** | $250,000 USDC | $500,000 USDC |
| **Max Single-Borrower Cap** | $5,000,000 USDC | $10,000,000 USDC |

---

## 3. Interest Rate & Utilization Model

Borrow rates are computed algorithmically via a kinked utilization curve:

$$\text{Borrow APR} = \begin{cases} R_0 + \frac{U}{U_{\text{kink}}} \cdot R_{\text{slope1}} & \text{if } U \le U_{\text{kink}} \\ R_0 + R_{\text{slope1}} + \frac{U - U_{\text{kink}}}{1 - U_{\text{kink}}} \cdot R_{\text{slope2}} & \text{if } U > U_{\text{kink}} \end{cases}$$

- **Base Rate ($R_0$):** 1.50% APR
- **Optimal Utilization ($U_{\text{kink}}$):** 80.0%
- **Slope 1 ($R_{\text{slope1}}$):** 4.00% APR (yielding 5.50% borrow APR at 80% utilization)
- **Slope 2 ($R_{\text{slope2}}$):** 25.00% APR (protective steep slope above 80% to incentivize repayments)
- **Protocol Performance Fee:** 10.0% of accrued borrow interest.

---

## 4. Oracle & Risk Engine Architecture

- **Primary Oracle Feed:** Chainlink Tokenized RWA Feeds (AggregatorV3) with off-market circuit breakers.
- **Secondary Oracle Feed:** Pyth Network real-time equity feeds for low-latency market-hours cross-validation.
- **Market Hours Handling:** During traditional US equity market closure (weekends and overnight hours), collateral valuation is clamped to the official Friday NYSE 4:00 PM EST closing mark. Margin calls and liquidations are throttled until pre-market trading commences, preventing artificial out-of-hours flash liquidations.
- **Dual-Oracle Divergence Guard:** Trading and rebalances freeze if the spread between Chainlink and Pyth exceeds **25 bps**.

---

## 5. Settlement & Custody

- **Smart Contract Layer:** Isolated Morpho Blue / Euler v2 vault architecture on Base and Arbitrum.
- **Underlying Custody:** Tokenized share certificates back 1:1 with regulated custodians (e.g. Backed Finance AG under Swiss DLT Act, Dinari SEC-registered transfer agent).
- **Execution Mode:** Direct non-custodial smart contract interaction or programmatic API access via 0x Credit Institutional SDK.

---

## 6. Pilot Allocation Program

0x Credit is opening a **$20,000,000 Pilot Allocation Window** for qualified institutional participants:
- **Zero Origination Fees** for first 5 pilot borrowers.
- **Guaranteed Lending Spread:** Priority stablecoin allocation from 0x Credit curated vaults.
- **Direct Integration Support:** Dedicated technical onboarding and risk manager dashboard.
