# Yield Forecast Evaluation Methodology & Operational Protocol

**Effective Date:** 2026-10-05  
**Version:** 1.0.0 (Pre-registered & Immutable)  
**Evaluator:** DeFi Garden Research (`scripts/evaluate-forecast-accuracy.js`)  
**Data Sources:** Point-in-time daily snapshots (`data/forecasts/YYYY-MM-DD.json`) and verified outcomes (`data/history/YYYY-MM-DD.json`).

---

## 1. Objective

To provide an empirical, reproducible, and verifiable public track record of DeFi Garden's 14-day forward yield forecast distributions ($[p10, p50, p90]$), benchmarked against a naive "no-change" baseline.

Our core operating principle: **Honest numbers beat exciting numbers.**

---

## 2. Invariable Pre-Locked Evaluation Filters

The following qualification gates are locked prior to outcome evaluation and must never be altered retroactively based on observed error deltas:

1. **Emission Schedule (Point-in-Time Integrity):**
   - Exactly one evaluation snapshot is emitted per calendar day, tied to the 02:00 UTC daily CI execution (`data/forecasts/YYYY-MM-DD.json`).
   - Forecasts are immutable: only forecasts recorded on the exact date of emission are ever evaluated against future outcomes.
   - The issue-time APY ($APY_0$) is derived strictly from the same snapshot (`apyBase + apyReward`).

2. **Capital Significance Floor:**
   - Evaluated venues must clear the standard trust rail: $\text{TVL} \ge \$100,000$ at issue time.

3. **Sanity Cap:**
   - Evaluated venues must clear the sanity ceiling: $APY_0 \le 1000\%$ at issue time.

4. **Venue Archetype Scope (LP & Impermanent Loss Exclusion):**
   - Excludes multi-asset liquidity pairs, AMMs, and DEX liquidity pools (e.g. Uniswap, Aerodrome, Curve, Balancer, Orca, Raydium, PancakeSwap) subject to impermanent loss and ve(3,3) emission migrations.
   - Restricts evaluation to single-sided lending money markets, yield-bearing vaults, and native/liquid staking venues.

---

## 3. Metrics & Statistical Baselines

For each 14-day evaluation horizon ($D_0 \to D_{14}$):

1. **Band Capture Rate:**
   $$\text{Capture Rate} = \frac{\sum \mathbf{1}[p10_i \le APY_{14,i} \le p90_i]}{N}$$
   Target: **80.0%** (theoretical nominal coverage of an 80% $[p10, p90]$ interval).

2. **Model Mean Absolute Error (MAE):**
   $$\text{MAE}_{\text{model}} = \frac{1}{N} \sum_{i=1}^N |APY_{14,i} - p50_i|$$

3. **Naive "No-Change" Baseline MAE:**
   $$\text{MAE}_{\text{naive}} = \frac{1}{N} \sum_{i=1}^N |APY_{14,i} - APY_{0,i}|$$

4. **Forecast Skill Score:**
   $$\text{Skill} = 1 - \frac{\text{MAE}_{\text{model}}}{\text{MAE}_{\text{naive}}}$$
   - $\text{Skill} > 0$: Model adds predictive value over assuming rates stay unchanged.
   - $\text{Skill} \le 0$: Model fails to outperform a naive static projection.

5. **Sub-Cohort Segmentation:**
   - **Overall Qualified Venues** ($\ge \$100\text{K}$ TVL)
   - **Stablecoins Only** (USDC, USDT, USDS, DAI, EURC, etc.)
   - **High-Liquidity Venues** ($\text{TVL} \ge \$10,000,000$)

6. **Dropout Transparency:**
   - Pools that delist, experience feed gaps, or break sanity limits between $D_0$ and $D_{14}$ are tallied and reported as dropouts rather than silently erased.

---

## 4. Policy on Empirical Skill Outperformance

If the median Skill Score across resolved runs is $\le 0$, DeFi Garden policy mandates:
1. Public forecast outputs must be labeled: *"Experimental forward directional forecast (currently benchmarking against naive baseline)"*.
2. The Research Report must explicitly lead with this finding: *"Testing our forecasting engine against 'nothing changes' revealed that the naive baseline remains difficult to beat in steady-state lending."*
