# Risk Engine & Parameter Spec: Boosted Mode ⚡ & Sweep Rails

**Author:** `@risk-quant`  
**Status:** Active / Production Gate  
**Version:** 1.0.0  
**Target Repos:** `defi_garden`, `Vibe-Trading`, Keeper Operations  

---

## 1. Morpho Blue & Collateral Leverage Caps
- **Max Permitted LLTV Cap:** `82.0%`
- **Automated Deleverage Trigger:** `78.0%` LLTV.
- **Target Post-Rebalance LTV:** `70.0%` (creates minimum `800 bps` safety buffer to liquidation point).
- **Max Leverage Multiplier:** `5.0x` for pegged pairs (e.g., wstETH/ETH, cbETH/ETH) and `3.0x` for yield-basis pairs (e.g., USDe/USDC).

---

## 2. USDe Basis Risk Circuit-Breaker
- **Metric:** Rolling 8-hour perp funding rate on underlying ETH/BTC short hedges.
- **Tripwire Threshold:** Funding rate $< 0.00\%$ APY for $\ge 2$ consecutive 8-hour settlement epochs.
- **Deterministic Action:** Trigger atomic deleveraging back to 100% spot USDC reserve holding without waiting for manual intervention.

---

## 3. Dual-Oracle Divergence & Staleness Gate
- **Oracles:** Primary = Chainlink Data Feeds; Secondary = Pyth Network / Redstone Core.
- **Max Divergence Spread:** `15 bps` ($0.15\%$).
- **Staleness Hard Limit:** $3,600$ seconds ($1\text{ hr}$) without a heartbeat update.
- **Deterministic Action:** Halt all compounding, leverage looping, and yield sweeps if spread $\ge 15\text{ bps}$ or either feed is stale. Flag position state as `ORACLE_DIVERGENCE_PAUSE`.

---

## 4. Boosted Mode Strategy Demotion Criteria
A strategy in Boosted Mode is demoted to Standard or excluded if:
1. **Borrow Rate Volatility:** Realized $7\text{d}$ borrow rate standard deviation $\sigma > 2.5\times$ the $30\text{d}$ historical baseline.
2. **Exit Liquidity Buffer:** Cumulative on-chain secondary liquidity (Aerodrome slip $< 100\text{ bps}$, Curve A-factor depth) $< 3.0\times$ the vault's total gross exposure.
3. **Anomaly / TVL Floors:** Vault TVL $< \$100,000$ or raw headline APY $> 1000\%$ (sanity threshold enforced).

---

## 5. Rain Card Sweep Yield Protection Rails
- **Harvest Minimum:** $\ge \$50.00\text{ USDC}$ net accrued yield.
- **Slippage Cap:** $30\text{ bps}$ ($0.30\%$) on any DEX swap / conversion.
- **Gas Ceiling:** $\le 15.0\text{ Gwei}$ on Base Mainnet ($0.15\text{ Gwei}$ on Arbitrum One).
- **Principal Invariance Check:** Principal balance must remain mathematically invariant: $\Delta \text{Principal} \equiv 0$. Only net accrued yield exceeding vault hurdle rate is swept to Rain card contract.
