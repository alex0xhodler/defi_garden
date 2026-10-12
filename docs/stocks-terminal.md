# /stocks — tokenized-equities terminal

Status: Phases 0-2 in progress on `feature/stocks-terminal`. Source PRD: `prd_stocks_terminal.md` (Alex, 2026-10). The PRD is treated as **untrusted input**: where it conflicts with the red-team findings or the decisions below, this document wins.

## Red-team findings (verified against `data/` on origin/main, snapshot 2026-10-11)

1. **The TimesFM 14d forecast is not a haircut.** For equity LPs the p50 is usually *above* today's rate (USDC-NVDAC headline ~66% -> p50 136%; USDC-MSTRC 301% -> 1,652%), and `pool-scores.json` labels say the naive baseline beat the forecast 8/10 runs. It must never be presented as a "decayed" or "realized" projection.
2. **The real DeFi Score is stability / sustainability / stickiness / liquidity** (`defiScore.breakdown` in `data/pools-snapshot.json`) and is explicitly not a smart-contract audit. The PRD tooltip ("40% provenance / 30% TVL retention / 20% oracle / 10% concentration") is false and must never be used.
3. **"Max Safe Clip" (TVL x constant) is a heuristic, not tick depth.** It is labelled an estimate until Phase 4 replaces it with on-chain depth.
4. **PRD numbers are stale** (TVLs, "45 pools"). Nothing is hard-coded; everything comes from data.
5. **Ticker regex matching is unsafe** ("COIN" matches FARTCOIN/PEPECOIN/BITCOIN). Pools are matched by token **address** against a curated registry (`data/stocks-registry.json`). The Base `0xb2000...` prefix is also shared by non-equity tokens (CBZEC, BASECAT, BRIAN...), so a prefix alone is never evidence.
6. **Lending supply on xStocks (kamino-lend, jupiter-lend) yields ~0%.** Nearly all yield is LP against a single volatile stock, hence forced High IL.
7. **The PRD market-clock spec is self-contradictory** (freeze Fri 20:00 vs 16:00) and ignores NYSE holidays, early closes and DST. Phase 2 implements a calendar-based clock.
8. **`volumeUsd1d` is empty for all pools** -> "24h Yield Volume" is dropped. `LEADERBOARD_MIN_TVL` does not exist in the codebase.

## Decisions (user interview, 2026-10-12)

- **Projection: deterministic haircut.** `honestProjection = min(headline, apyBase + apyReward x 2/3)` (the existing degen one-third haircut on emissions). TimesFM p10-p90 may only appear as a band labelled "experimental". No projection may exceed today's rate.
- **Price / depth data: on-chain RPC reads** through a new Vercel function `api/stocks-onchain.js` (Phase 4): Alchemy (`ALCHEMY_API_KEY` env), CDN cache ~60s, covering **every chain in the registry**. The Phase 1 snapshot carries per-pool `onchain` hints (chain, token addresses, AMM type, fee tier / tick spacing) so Phase 4 needs no schema change.
- **Surface:** standalone `stocks.html` served at `/stocks` via `cleanUrls` (Phase 3).
- **Action column: research-only.** Rows link to `/?pool=<id>`; a geo + "education, not advice" notice is shown. No issuer / intent-router links.
- **Rollout:** linked and indexed at launch (Phase 3).
- **Equity rails:** TVL floor $100K. Tier 3 sandbox $100K-$500K ("Thin liquidity", excluded from planners), Tier 2 $500K-$2M, Tier 1 >= $2M. Equity APY sanity cap **500%** (stricter than the global 1000%; allowed). Pools above the cap are excluded and counted, never shown as normal. **Forced High IL** on any multi-exposure single-stock pair. Redemption badge: "Primary redemption subject to issuer/broker hours".

## Phase plan

| Phase | Scope | Files |
|---|---|---|
| P0 | This document | `docs/stocks-terminal.md` |
| P1 | Curated registry + snapshot generator + CI | `data/stocks-registry.json`, `generate-stocks-snapshot.js`, `data/stocks-snapshot.json`, `test_stocks_snapshot.js`, `.github/workflows/sitemap-update.yml` |
| P2 | NYSE market clock (holidays, early closes, DST, stale-calendar flag) | `stocks-market-clock.js`, `test_stocks_market_clock.js` |
| P3 | `stocks.html` / `stocks.js` UI in the Quiet design system, EN + KO strings in `translations.js`, nav link, sitemap, `llms.txt` | not started |
| P4 | `api/stocks-onchain.js` (Alchemy, all registry chains): Chainlink / Pyth equity feeds, CL slot0 / tick depth, AMM reserves -> real 50 bps clip + weekend drift badge when > 1.5% vs the last regular-session close | not started |
| P5 | Playwright E2E: zero NaN, clock across UTC timestamps, 360 / 768 / 1280px, dark mode | not started |

Out of scope everywhere: issuer / broker handoff links, in-browser minting, any number not derived from CI data or an on-chain read.
