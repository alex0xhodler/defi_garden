# Surplus: stablecoin lending pool rates around the Binance hack

**Hack date:** October 29, 2026 ([Wikipedia](https://en.wikipedia.org/wiki/2026_Binance_hack))

How much did stablecoin lending rates move in the week around the Binance hack? One dataset answers it: DeFi Garden's daily pool history for October 27 through November 2, 2026, with pool names and chains from the published pools snapshot. Scope: pools from twelve lending projects (aave-v3, aave-v4, kamino-lend, sparklend, fluid-lending, jupiter-lend, compound-v2, compound-v3, morpho-blue, maple, sky-lending, justlend-v1) whose symbols start with USDC, USDT, DAI, USDe, FDUSD, PYUSD, TUSD, GUSD, USDS, USDY, BUIDL, USAT or RLUSD. 141 pools matched. A move is a pool's APY on one day minus its APY the day before, counted only when that pool's TVL on the later day is at least $10M. The window holds 777 day-over-day changes; 246 clear the TVL bar.

## The five biggest moves

| Pool | Chain | Day | APY before | APY after | Move | TVL that day |
|---|---|---|---|---|---|---|
| kamino-lend USDC — d2141a59-c199-4be7-8d4b-c8223954836b | Solana | Oct 31 | 21.23% | 3.84% | -17.39 pp | $20.50M |
| kamino-lend USDC — 058afa77-d1cc-537c-9c28-1da002b45631 | Solana | Oct 31 | 18.42% | 3.78% | -14.64 pp | $16.68M |
| kamino-lend USDC — 058afa77-d1cc-537c-9c28-1da002b45631 | Solana | Oct 30 | 4.17% | 18.42% | +14.25 pp | $18.15M |
| jupiter-lend USDC — d783c8df-e2ed-44b4-8317-161ccc1b5f06 | Solana | Oct 30 | 6.17% | 14.98% | +8.81 pp | $419.96M |
| jupiter-lend USDC — d783c8df-e2ed-44b4-8317-161ccc1b5f06 | Solana | Oct 31 | 14.98% | 6.97% | -8.01 pp | $443.19M |

All five are USDC markets on Solana; two different kamino-lend USDC pools share a name, so the table carries pool ids. Pool d2141a59 fell 17.39 pp on Oct 31, from 21.23% to 3.84%. Pool 058afa77 made a round trip: up 14.25 pp to 18.42% on Oct 30, then down 14.64 pp to 3.78% on Oct 31. The jupiter-lend USDC pool, the largest in the table by TVL, did the same at scale: up 8.81 pp to 14.98% on Oct 30 with $419.96M TVL, back down 8.01 pp to 6.97% on Oct 31 with $443.19M TVL.

## Day by day: the median absolute move

| Day | Counted moves | Median absolute move |
|---|---|---|
| Oct 28 | 44 | 0.04 pp |
| Oct 29 | 44 | 0.11 pp |
| Oct 30 | 36 | 0.43 pp |
| Oct 31 | 39 | 0.55 pp |
| Nov 1 | 40 | 0.05 pp |
| Nov 2 | 43 | 0.09 pp |

Moves run Oct 28–Nov 2; Oct 27 anchors the window. The median absolute move was 0.04 pp on Oct 28 and 0.11 pp on Oct 29, the hack date. Oct 30 and Oct 31, the two days immediately after the hack date, are the only days above 0.11 pp, at 0.43 pp and 0.55 pp. By Nov 1 it was back to 0.05 pp; Nov 2 read 0.09 pp. That is what backs any claim of "more than usual": the middle pool moved 0.43–0.55 pp on Oct 30–31, against 0.04–0.11 pp on the other four days.

## What the TVL floor left out

The $10M bar excluded some large moves. Seventeen pools' largest spike was bigger than the smallest table move (-8.01 pp) yet landed on a sub-$10M day — the floor, not the move's size, kept them out:

- aave-v3 PYUSD (Ethereum) — d118f505-e75f-4152-bad3-49a2dc7482bf: +31.51 pp on Oct 28, TVL $0.21M — the largest move in the whole window, counted or not
- fluid-lending USDT0 (Polygon) — 4a61f9bc-3e9a-4849-8b2c-67574dd22a86: -15.76 pp on Nov 1, TVL $0.43M
- aave-v3 USDC (Monad) — 0a1131e6-a59d-537c-b18f-826b9583f01f: -14.77 pp on Oct 31, TVL $9.29M
- fluid-lending USDC (Base) — 7372edda-f07f-4598-83e5-4edec48c4039: +9.37 pp on Oct 30, TVL $6.94M
- compound-v3 USDC (OP Mainnet) — b828f0cb-853d-4b32-aebb-2e20d7fd70a8: -9.44 pp on Nov 2, TVL $1.90M
- two kamino-lend USDT pools (Solana) — 546b3c0c-138d-4190-b46b-efa1765f1dd3 and bbe7776a-b8fe-545e-9db0-434e64324c10: -16.78 pp and -9.64 pp on Nov 1, TVL $1.97M and $2.59M
- ten kamino-lend USDC pools (Solana) — 8c396f90-3c88-51f5-b7f7-3f84664f5a88, a6001d7c-3048-583f-86af-00e7d1b7e2cc, 032e07e3-23ff-57d1-9d75-6a747622a40d, 9ec93e24-3335-527b-9c99-ebf58a2daba3, a406e89e-284a-5b9c-b55c-6a617d745d38, cd4f4933-151b-594b-9bd0-cb65f18af5f1, 8106c0ce-8759-5af6-9f62-584fdc01a4bc, d7cc2733-ecd6-5278-9d50-4525a016a166, 3041157b-9715-5afc-b1a8-737d31e8bbed, 0ba9f678-063d-57ec-8afd-bb9a36e55657: moves from -17.22 to +16.58 pp on Oct 30–31, TVL $0.12M–$7.47M

In all, 100 pools had their largest spike land on a sub-$10M day. Apart from the seventeen above, the biggest was +7.71 pp — kamino-lend USDC, Solana, pool b40352c0-0a7d-5426-98b3-e59f74073500, Oct 30, TVL $1.58M — and the rest were smaller.

## Notes

- Every APY, move, median, TVL and count comes from the daily files; each TVL is that pool's TVL on the day discussed, never a snapshot or current value.
- Pool ids disambiguate the same-named Solana USDC pools. Numbers are rounded to two decimals at most. Draft for review; no causal claims.
