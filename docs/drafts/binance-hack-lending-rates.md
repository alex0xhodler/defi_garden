# Stablecoin lending pool rates around the Binance hack

**Hack date:** October 29, 2026 ([Wikipedia](https://en.wikipedia.org/wiki/2026_Binance_hack))

How much did stablecoin lending rates move in the week around the Binance hack? One dataset answers it: DeFi Garden's daily pool history for October 27 through November 2, 2026, with pool names and chains from the published pools snapshot. Scope: pools from twelve lending projects (Aave V3, Aave V4, Kamino Lend, SparkLend, Fluid Lending, Jupiter Lend, Compound V2, Compound V3, Morpho Blue, Maple, Sky Lending, JustLend V1) whose symbols start with USDC, USDT, DAI, USDe, FDUSD, PYUSD, TUSD, GUSD, USDS, USDY, BUIDL, USAT or RLUSD. 141 pools matched. A move is a pool's APY on one day minus its APY the day before, counted only when that pool's TVL on the later day is at least $10M. The window holds 777 day-over-day changes; 246 clear the TVL bar.

## The five biggest moves

| Pool | Chain | Day | APY before | APY after | Move | TVL that day |
|---|---|---|---|---|---|---|
| Kamino Lend USDC (pool A) | Solana | Oct 31 | 21.23% | 3.84% | -17.39 pp | $20.50M |
| Kamino Lend USDC (pool B) | Solana | Oct 31 | 18.42% | 3.78% | -14.64 pp | $16.68M |
| Kamino Lend USDC (pool B) | Solana | Oct 30 | 4.17% | 18.42% | +14.25 pp | $18.15M |
| Jupiter Lend USDC | Solana | Oct 30 | 6.17% | 14.98% | +8.81 pp | $419.96M |
| Jupiter Lend USDC | Solana | Oct 31 | 14.98% | 6.97% | -8.01 pp | $443.19M |

All five are USDC markets on Solana; two different Kamino Lend USDC pools share a name, so the table labels them A and B. Pool A fell 17.39 pp on Oct 31, from 21.23% to 3.84%. Pool B made a round trip: up 14.25 pp to 18.42% on Oct 30, then down 14.64 pp to 3.78% on Oct 31. The Jupiter Lend USDC pool, the largest in the table by TVL, did the same at scale: up 8.81 pp to 14.98% on Oct 30 with $419.96M TVL, back down 8.01 pp to 6.97% on Oct 31 with $443.19M TVL.

## Day by day: the median absolute move

| Day | Counted moves | Median absolute move |
|---|---|---|
| Oct 28 | 44 | 0.04 pp |
| Oct 29 | 44 | 0.11 pp |
| Oct 30 | 36 | 0.43 pp |
| Oct 31 | 39 | 0.55 pp |
| Nov 1 | 40 | 0.05 pp |
| Nov 2 | 43 | 0.09 pp |

Moves run Oct 28–Nov 2; Oct 27 anchors the window. The median absolute move was 0.04 pp on Oct 28 and 0.11 pp on Oct 29, the hack date. Oct 30 and Oct 31, the two days immediately after the hack date, are the only days above 0.11 pp, at 0.43 pp and 0.55 pp. By Nov 1 it was back to 0.05 pp; Nov 2 read 0.09 pp. That is what backs any claim of "more than usual": the median pool moved 0.43–0.55 pp on Oct 30–31, against 0.04–0.11 pp on the other four days.

## What the TVL floor left out

The $10M bar excluded some large moves. Seventeen pools' largest spike was bigger than the smallest table move (-8.01 pp) yet landed on a sub-$10M day — the floor, not the move's size, kept them out:

- Aave V3 PYUSD (Ethereum): +31.51 pp on Oct 28, TVL $0.21M — the largest move in the whole window, counted or not
- Fluid Lending USDT0 (Polygon): -15.76 pp on Nov 1, TVL $0.43M
- Aave V3 USDC (Monad): -14.77 pp on Oct 31, TVL $9.29M
- Fluid Lending USDC (Base): +9.37 pp on Oct 30, TVL $6.94M
- Compound V3 USDC (OP Mainnet): -9.44 pp on Nov 2, TVL $1.90M
- two Kamino Lend USDT pools (Solana): -16.78 pp and -9.64 pp on Nov 1, TVL $1.97M and $2.59M
- ten Kamino Lend USDC pools (Solana): moves from -17.22 to +16.58 pp on Oct 30–31, TVL $0.12M–$7.47M

In all, 100 pools had their largest spike land on a sub-$10M day. Apart from the seventeen above, the biggest was +7.71 pp — Kamino Lend USDC, Solana, Oct 30, TVL $1.58M — and the rest were smaller.

## Notes

- Every APY, move, median, TVL and count comes from the daily files; each TVL is that pool's TVL on the day discussed, never a snapshot or current value.
- Pools A and B are the two same-named Kamino Lend USDC pools on Solana in the table. Numbers are rounded to two decimals at most. Draft for review; no causal claims.
