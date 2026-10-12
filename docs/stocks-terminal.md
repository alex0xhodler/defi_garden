# /stocks — tokenized-equities terminal

Status: Phases 0-3 done on `feature/stocks-terminal`. Source PRD: `prd_stocks_terminal.md` (Alex, 2026-10). The PRD is treated as **untrusted input**: where it conflicts with the red-team findings or the decisions below, this document wins.

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
| P3 | `stocks.html` / `stocks.js` / `stocks-styles.css` UI, slim client payload `data/stocks-pools.json`, EN + KO strings in `translations.js`, nav link, sitemap, `llms.txt` | done (see decisions below) |
| P4 | `api/stocks-onchain.js` (Alchemy, all registry chains): Chainlink / Pyth equity feeds, CL slot0 / tick depth, AMM reserves -> real 50 bps clip + weekend drift badge when > 1.5% vs the last regular-session close | not started |
| P5 | Playwright E2E: zero NaN, clock across UTC timestamps, 360 / 768 / 1280px, dark mode | not started |

## Phase 3 decisions (2026-10-12)

- Issuer: only verified issuers are named; any token without a verified attribution shows an "Issuer unverified" chip. A pool names an issuer only when all its equity tokens are verified. (Method updated 2026-10-12, see "Issuer attribution" below.)
- Lending xStocks supply pools render in a separate "Collateral markets" section below the yield terminal, never in the yield table, and are excluded from the median and spotlight.
- Client payload: `generate-stocks-snapshot.js` also writes `data/stocks-pools.json` (compact JSON, under 48 KB, rendered fields only). The full snapshot stays the audit/Phase 4 artifact.
- Action stays research-only (`/?pool=<id>`). The clip column is the TVL heuristic labelled "Est."; no price column yet. Phase 4 adds live price, a measured 50 bps clip and the weekend-drift badge per row (one `PoolRow` model in `stocks.js`).

## Issuer attribution (2026-10-12)

- **By exact address only.** A registry token gets an `issuer` only when its exact address was verified in the issuer's own published list/API (xStocks, Coinbase, Ondo, bStocks, Robinhood Chain, ST0x), in an on-chain record (Reality beacon logs), or in the issuer's official announcement (Backpack SPCX). Each attributed token stores `issuerSlug`, `issuerBasis` and `issuerSource`; issuer facts (display name, legal entity, jurisdiction, US-person eligibility, source URLs) live in `registry.issuers`. A symbol convention or address prefix is never evidence: the Base `0xb2000...` prefix is shared by non-equity tokens, `R`/`B`/`ON` suffix conventions collide across issuers (Arbitrum `R*` tokens are Reality/Bitget, not Robinhood; Solana `SPCXxcq...` is Backpack via Sunrise, not xStocks). Unattributable tokens stay `issuer: "unverified"` with an `issuerHint`. **Verified bases:** only `official-registry`, `official-announcement` and `onchain-beacon` count (`VERIFIED_BASES` in `generate-stocks-snapshot.js`); a token's self-reported `name()` (`onchain-name`) is research context, not verification, so it renders the "Issuer unverified" chip.
- **Corrections:** Base `DESPXA` (0x9c5c...) is "S&P 500 DeFi (Centrifuge)", not a Dinari dShare. Kept as an index-fund (`etf`) exposure; its registry entry says "Centrifuge" only because the token's own `name()` does (basis `onchain-name`), which is not verification, so the page shows "Issuer unverified". It is kept rather than excluded because it is a single S&P 500 exposure like SPY. Added the five pool-present tokens the v1 registry missed: ST0x `wtCOIN`/`wtSPYM`/`wtSGOV` (Base), Ondo `MCDon` (BSC), xStocks `wNVDAx` (Hyperliquid L1). Issuer-published wrappers are listed; third-party wrappers (Mantle `W*`, Ethereum `WSPYX`) stay excluded.
- **UI:** the Chain & issuer cell and the spotlight card name the issuer; hovering it shows the legal entity, jurisdiction and US-person eligibility (from the slim payload's `issuers` map, never typed in the page). Only Dinari (not currently in the registry) offers a US-person path; ST0x, Backpack and Centrifuge are "not confirmed"; all other attributed issuers exclude US persons. The slim payload limit rose from 40 KB to 48 KB to carry the new tokens and issuer facts.

## Spotlight rule (2026-10-12)

A spotlight card leads only with a pool at **Tier 1-2 with a projected APY from 1% to 100% inclusive**; the pool count and total TVL on the card still cover every yield pool. An underlying with no qualifying pool is dropped and the next one by total TVL takes its place. Near-zero collateral positions (SPY at 0.00%) and farms in the hundreds of percent (SPCX at a 248% headline) still appear in the tables, never as the headline.

Out of scope everywhere: issuer / broker handoff links, in-browser minting, any number not derived from CI data or an on-chain read.
