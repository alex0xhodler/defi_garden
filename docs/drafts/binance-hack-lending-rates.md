# How lending pool rates moved around the Binance hack

**Hack date:** [needs source]

**Status:** draft · **Data window:** 2026-10-27 → 2026-11-02 · **Author:** DeFi Garden

## The window

This draft looks at how stablecoin lending pool rates moved across the days bracketing the
Binance hack. The analysis uses DeFi Garden's own pool history archive — daily points
ingested from the yields source (`yields.llama.fi/pools`) between **2026-10-27** and
**2026-11-02**, 2026, and published through the pools snapshot generated at
`2026-11-02T08:57:30Z`.

The scope was stablecoin lending pools with at least **$10M TVL** at the time of the reading.
Within that set, rates are the pool's reported APY for the UTC day, and a "rate move" is the
plain difference between one day's APY and the previous day's APY.

## What the data shows

The headline number is not a single rogue pool. Across the window, a cluster of stablecoin
lending markets moved sharply — most visibly between **2026-10-29** and **2026-10-31** — and the
pattern is worth reading as a sequence rather than as an event stamp.

- **Kamino Lend USDC (Solana, first pool):** the largest move in the set. The first Kamino pool
  had **$2.8M TVL** on 2026-10-30 when it spiked, so APY rose from **4.41%** on 2026-10-29 to
  **21.23%** on 2026-10-30 (+16.81 pp), then fell back to **3.84%** by 2026-10-31 (−17.39 pp).
  Because the pool was small at the time, that day is left out of the table.
- **Aave V3 USDC (Monad):** APY jumped from **5.61%** to **20.27%** on 2026-10-30 (+14.65 pp),
  unwinding to **5.50%** by 2026-10-31. Aave V3 USDC on Monad had **$1.3M TVL** that day, so the
  spike is a small-pool move and is left out of the table.
- **Kamino Lend USDC (Solana, ~$19.3M TVL):** APY moved from **4.17%** to **18.42%** on 2026-10-30
  (+14.25 pp), back down to **3.78%** on 2026-10-31.

Bigger pools moved too, though by smaller percentages: Jupiter Lend USDC (Solana, ~$448.7M TVL)
went **6.17% → 14.98%** on 2026-10-30 (+8.81 pp), and Fluid Lending USDC (Ethereum, ~$129.6M TVL)
went **6.36% → 13.42%** on 2026-10-30 (+7.06 pp).

Across the same window, most tracked pools moved less than half a percentage point a day, which
makes the handful of double-digit moves stand out rather than the average. The moves cluster in
time — the largest of them land on 2026-10-30 — and they are not spread evenly across chains or
venues, which is the part of the pattern a reader should notice before anyone assigns a cause.

## The five biggest rate moves

| # | Pool | Chain | Day | Daily APY | Move | TVL that day |
|---|------|-------|-----|-----------|------|--------------|
| 1 | Kamino Lend USDC | Solana | 2026-10-31 | 21.23% → 3.84% | −17.39 pp | $20.5M |
| 2 | Kamino Lend USDC (second pool) | Solana | 2026-10-31 | 18.42% → 3.78% | −14.64 pp | $16.7M |
| 3 | Kamino Lend USDC (second pool) | Solana | 2026-10-30 | 4.17% → 18.42% | +14.25 pp | $18.2M |
| 4 | Jupiter Lend USDC | Solana | 2026-10-30 | 6.17% → 14.98% | +8.81 pp | $420.0M |
| 5 | Jupiter Lend USDC | Solana | 2026-10-31 | 14.98% → 6.97% | −8.01 pp | $443.2M |

## What this can't show

The archive can show movement; it does not, by itself, show cause. The numbers above are daily
APY observations reconciled through the yields source, not an attribution of the Binance hack
to any particular pool. A sharp lending-rate move can reflect utilization shifting, reward
emissions, liquidity conditions, pricing, or broader market stress — and any of those could be
the dominant driver, or several at once.

This draft therefore makes no causal claim about the hack. The honest statement the data supports
is narrower: within the stablecoin lending pools tracked at $10M+ TVL, rates moved more than
usual in the days around the event, in both directions, and the moves were not limited to a
single venue.

## Next steps

Re-run the same extraction over a wider window and over the pools snapshot to see whether the
pattern holds, and check the forecast layer (`data/forecasts/`) for the same dates. Nothing here
should be published as an explanation the data does not support.
