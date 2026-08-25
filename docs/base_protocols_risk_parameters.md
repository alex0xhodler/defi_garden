# Base Protocol Risk Tiers & Solvency Gates

**Author:** `@risk-quant`  
**Status:** Active Production Specification  
**Version:** 1.0.0  
**Target:** `<SpendYieldWidget />` & Keeper Harvesting Engine  

---

## 1. Moonwell (`mUSDC`) — Conservative Standard Tier
- **Strategy Type:** Supply-only lending vault on Base.
- **Borrow Risk:** $0.0\%$ (no leverage looping).
- **Bad Debt Tripwire:** Trigger freeze if platform-wide uncollateralized bad debt exceeds $\$50,000$.
- **Sanity Limits:** APY capped at $20.0\%$; minimum supply TVL floor $\$5.0\text{M}$.

---

## 2. Seamless Protocol (`ILM`) — Boosted Mode ⚡ Tier
- **Strategy Type:** Looped lending via Integrated Liquidity Markets (ILMs).
- **Max Permitted Leverage:** $4.0\text{x}$ (Max Borrow LTV $75.0\%$).
- **Automated Deleverage Trigger:** $70.0\%$ LTV (rebalances to $60.0\%$ target).
- **Borrow Rate Volatility Gate:** Demote strategy if rolling $7\text{d}$ borrow rate standard deviation $> 2.0\sigma$ or if borrow rate spikes $> 25.0\%$ APY.

---

## 3. Overnight Finance (`USD+`) — Rebase Yield Tier
- **Strategy Type:** Rebase collateral with daily yield distributions.
- **Depeg Circuit-Breaker:** Halt card sweeps immediately if USD+ secondary price drops below $\$0.9990$ ($>10\text{ bps}$ spread from $\$1.0000$).
- **Negative Rebase Tripwire:** Any negative rebase event halts sweeps and alerts keeper ops.

---

## 4. Aerodrome Concentrated Liquidity (`USDC/USDT`) — LP Fee Tier
- **Strategy Type:** Tight-range concentrated liquidity pool.
- **Range Bound:** $\pm 0.20\%$ of parity price.
- **Out-of-Range Freeze:** If spot price moves outside tick range for $>12\text{ hours}$, disable auto-harvesting to prevent gas burn on zero-fee cycles.
- **Impermanent Loss Cap:** $25\text{ bps}$ max tolerated divergence before auto-withdrawing to pure USDC spot.
