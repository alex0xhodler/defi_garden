# Yield Forecast Evaluation Methodology & Operational Protocol

**Effective Date:** 2026-10-05  
**Version:** 1.0.0 (Locked as of October 5, 2026)  
**Evaluator:** DeFi Garden Research (`scripts/evaluate-forecast-accuracy.js`)  
**Data Sources:** Point-in-time daily snapshots (`data/forecasts/YYYY-MM-DD.json`) and verified outcomes (`data/history/YYYY-MM-DD.json`).

---

## 1. Objective

To provide an empirical, reproducible, and verifiable public track record of DeFi Garden's 14-day forward yield forecast distributions ([p10, p90]), benchmarked against a naive "no-change" baseline.

Our core operating principle: **Honest numbers beat exciting numbers.**

---

## 2. Invariable Pre-Locked Evaluation Filters

The following qualification gates were locked as of v1.0 on October 5, 2026. The first prospective forecast runs under these locked rules resolve on **October 20, 2026**.

1. **Emission Schedule & Point-in-Time Integrity:**
   - Exactly one evaluation snapshot is emitted per calendar day, tied to the scheduled daily CI execution (`data/forecasts/YYYY-MM-DD.json`).
   - Forecasts are immutable: only forecasts recorded on the exact date of emission are ever evaluated against future outcomes.
   - The issue-time APY (APY at Day 0) is derived strictly from the same snapshot (`apyBase + apyReward`).
   - **Audit Note on Backfilled Runs (Sep 12 – Oct 4):** Historical snapshots were recovered from the daily git commit log for `data/pools-snapshot.json` (executed between 06:58 and 07:34 UTC daily). Individual run commit hashes are documented in the evaluation ledger.

2. **Capital Significance Floor:**
   - Evaluated venues must clear the standard trust rail: TVL >= $100,000 at issue time.

3. **Sanity Cap:**
   - Evaluated venues must clear the sanity ceiling: APY at Day 0 <= 1000% at issue time.

4. **Venue Archetype Scope (LP & Impermanent Loss Exclusion):**
   - Excludes multi-asset liquidity pairs, AMMs, and DEX liquidity pools (e.g. Uniswap, Aerodrome, Curve, Balancer, Orca, Raydium, PancakeSwap) subject to impermanent loss and ve(3,3) emission migrations.
   - Restricts evaluation to single-sided lending money markets, yield-bearing vaults, and native/liquid staking venues.

---

## 3. Metrics & Statistical Baselines

For each 14-day evaluation horizon (Day 0 -> Day 14):

1. **Band Capture Rate:**
   Percentage of pools whose realized 14-day rate falls inside the [p10, p90] interval. Target: **80.0%** (theoretical nominal coverage of an 80% [p10, p90] interval).

2. **Model Mean Absolute Error (MAE):**
   Average absolute delta between actual Day 14 APY and the model's median prediction (p50).

3. **Naive "No-Change" Baseline MAE:**
   Average absolute delta between actual Day 14 APY and the issue-time APY (Day 0).

4. **Forecast Skill Score:**
   1 - (Model MAE / Naive MAE)
   - Skill > 0: Model adds predictive value over assuming rates stay unchanged.
   - Skill <= 0: Model fails to outperform assuming rates stay unchanged.

5. **Sub-Cohort Segmentation:**
   - **Overall Qualified Venues** (>= $100K TVL)
   - **Stablecoins Only** (USDC, USDT, USDS, DAI, EURC, etc.)
   - **High-Liquidity Venues** (TVL >= $10,000,000)

6. **Dropout Transparency:**
   - Pools that delist, experience feed gaps, or break sanity limits between Day 0 and Day 14 are tallied and reported as dropouts rather than silently erased.

---

## 4. Policy on Empirical Skill Outperformance

If the median Skill Score across resolved runs is <= 0:
1. Public forecast outputs must be labeled: *"Experimental forward forecast: In our first 10 test runs, assuming today's rate holds was more accurate than this forecast."*
2. The Research Report must lead with this finding: *"60% of DeFi yields didn't move; our model handled those fine and missed the ones that moved."*
