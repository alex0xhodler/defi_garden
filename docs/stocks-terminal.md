# /stocks — tokenized-equities terminal

Status: Phases 0-4 done on `feature/stocks-terminal`. Source PRD: `prd_stocks_terminal.md` (Alex, 2026-10). The PRD is treated as **untrusted input**: where it conflicts with the red-team findings or the decisions below, this document wins.

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
| P4 | `api/stocks-onchain.js` live layer: DefiLlama token prices, after-hours drift badge, Alchemy RPC +-2% depth for Uniswap v3 / Slipstream pools; `scripts/resolve-stocks-pools.js`, `scripts/generate-stocks-pyth-feeds.js` | done (see Phase 4 below) |
| P5 | Playwright E2E: zero NaN, clock across UTC timestamps, 360 / 768 / 1280px, dark mode | not started |

## Phase 3 decisions (2026-10-12)

- Issuer: only verified issuers are named; any token without a verified attribution shows an "Issuer unverified" chip. A pool names an issuer only when all its equity tokens are verified. (Method updated 2026-10-12, see "Issuer attribution" below.)
- Lending xStocks supply pools render in a separate "Collateral markets" section below the yield terminal, never in the yield table, and are excluded from the median and spotlight.
- Client payload: `generate-stocks-snapshot.js` also writes `data/stocks-pools.json` (compact JSON, under 48 KB, rendered fields only). The full snapshot stays the audit/Phase 4 artifact.
- Action stays research-only (`/?pool=<id>`). The clip column is the TVL heuristic labelled "Est."; Phase 4 adds the live price column, the after-hours drift and an on-chain depth in that cell (see Phase 4).

## Issuer attribution (2026-10-12)

- **By exact address only.** A registry token gets an `issuer` only when its exact address was verified in the issuer's own published list/API (xStocks, Coinbase, Ondo, bStocks, Robinhood Chain, ST0x), in an on-chain record (Reality beacon logs), or in the issuer's official announcement (Backpack SPCX). Each attributed token stores `issuerSlug`, `issuerBasis` and `issuerSource`; issuer facts (display name, legal entity, jurisdiction, US-person eligibility, source URLs) live in `registry.issuers`. A symbol convention or address prefix is never evidence: the Base `0xb2000...` prefix is shared by non-equity tokens, `R`/`B`/`ON` suffix conventions collide across issuers (Arbitrum `R*` tokens are Reality/Bitget, not Robinhood; Solana `SPCXxcq...` is Backpack via Sunrise, not xStocks). Unattributable tokens stay `issuer: "unverified"` with an `issuerHint`. **Verified bases:** only `official-registry`, `official-announcement` and `onchain-beacon` count (`VERIFIED_BASES` in `generate-stocks-snapshot.js`); a token's self-reported `name()` (`onchain-name`) is research context, not verification, so it renders the "Issuer unverified" chip.
- **Corrections:** Base `DESPXA` (0x9c5c...) is "S&P 500 DeFi (Centrifuge)", not a Dinari dShare. Kept as an index-fund (`etf`) exposure; its registry entry says "Centrifuge" only because the token's own `name()` does (basis `onchain-name`), which is not verification, so the page shows "Issuer unverified". It is kept rather than excluded because it is a single S&P 500 exposure like SPY. Added the five pool-present tokens the v1 registry missed: ST0x `wtCOIN`/`wtSPYM`/`wtSGOV` (Base), Ondo `MCDon` (BSC), xStocks `wNVDAx` (Hyperliquid L1). Issuer-published wrappers are listed; third-party wrappers (Mantle `W*`, Ethereum `WSPYX`) stay excluded.
- **UI:** the Chain & issuer cell and the spotlight card name the issuer; hovering it shows the legal entity, jurisdiction and US-person eligibility (from the slim payload's `issuers` map, never typed in the page). Only Dinari (not currently in the registry) offers a US-person path; ST0x, Backpack and Centrifuge are "not confirmed"; all other attributed issuers exclude US persons. The slim payload limit rose from 40 KB to 48 KB to carry the new tokens and issuer facts.

## Spotlight rule (2026-10-12)

A spotlight card leads only with a pool at **Tier 1-2 with a projected APY from 1% to 100% inclusive**; the pool count and total TVL on the card still cover every yield pool. An underlying with no qualifying pool is dropped and the next one by total TVL takes its place. Near-zero collateral positions (SPY at 0.00%) and farms in the hundreds of percent (SPCX at a 248% headline) still appear in the tables, never as the headline.

Out of scope everywhere: issuer / broker handoff links, in-browser minting, any number not derived from CI data or an on-chain read.

## Phase 4: live on-chain layer (2026-10-12)

`GET /api/stocks-onchain` (`api/stocks-onchain.js`, logic in `api/_stocks-onchain.js`, underscore = not a route). One batched JSON response for every pool in `data/stocks-snapshot.json`: `{pool, price, priceSource, priceTs, drift, driftRef, depth2pct, depthSource: "rpc"|"heuristic", reasons?}` plus `generatedAt`, `market` (session state, last regular close) and `sources` (per-upstream status). `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` plus a 60s in-memory memo (concurrent callers share one build). Every upstream has a 4s timeout; a failure nulls only what depended on it and gives a reason code (`reasons.price|drift|depth`), the response stays 200. Only "snapshot unreadable" is a 503 (`no-store`). Nothing here is a trade signal.

**Env vars (Vercel, server-side only; never sent to the browser, logged or echoed):**

| Var | Needed for | If missing |
|---|---|---|
| `ALCHEMY_API_KEY` | RPC depth (eth/base/bnb/arb mainnet) | depth falls back to the TVL heuristic, reason `rpc-unavailable` |
| `PYTH_API_KEY` | Pyth Hermes price of the underlying at the close (drift reference) | drift uses the token's own close price instead (below) |
| `PYTH_HERMES_BASE` (opt.) | Hermes base URL, default `https://pyth.dourolabs.app/hermes` | default |
| `LLAMA_COINS_BASE` (opt.) | DefiLlama coins base, default `https://coins.llama.fi` (to be centralised by `chore/llama-endpoints`) | default |

**Prices.** DefiLlama coins `prices/current`, batched 40 ids per call, keyed `chain:address` (EVM lowercased, Solana case-exact). Chain slugs verified live: `solana base ethereum bsc arbitrum`, **Hyperliquid L1 = `hyperliquid`, Robinhood Chain = `robinhood`** (so every registry chain is priced). Dropped with a reason: confidence < 0.9 (`low-confidence`), no price, older than 1h (`stale-price`; illiquid tokens such as rAAPL / wtCOIN are often 2h old and show a dash rather than a stale number), multi-equity pools. Live check 2026-10-12: 110 of 114 pools priced (3 stale, 1 two-equity pool).

**Drift ("vs last close").** Computed only while the US regular session is closed (server state AND the browser's own clock must agree) and only against a close the clock calendar knows (`getLastRegularClose`; stale calendar -> `calendar-stale`). `driftRef = {source, kind: "last-close", price, ts}`. Reference order:
1. **Pyth** price of the underlying (`Equity.US.<TICKER>/USD`, feed ids in `data/stocks-pyth-feeds.json`, generated by `scripts/generate-stocks-pyth-feeds.js`, exact symbol match only, BRK.B -> BRK-B; 26 of 27 underlyings mapped, `SPX` has no equity feed so it is `missing`). **Finding: Hermes no longer serves prices keyless** (`/v2/updates/price/*` returns 401 on hermes.pyth.network and pyth.dourolabs.app; only the `price_feeds` metadata is open), so this path needs `PYTH_API_KEY` and is **unverified live** (mocked). It accepts a print only if it was published within 15 min before / 60s after the close (the Equity.US feed does not publish outside the regular session), else `reference-stale`.
2. Fallback, keyless and live-verified: the token's **own** DefiLlama price at the close timestamp (`prices/historical/<closeTs>`, accepted within 15 min of the close, confidence >= 0.9). This is "how far the on-chain market moved since the US close", NOT a comparison with the stock, and the UI tooltip says so (`driftRef.source = "defillama-token"` vs `"pyth"`).
A drift above 25% in magnitude is treated as a token-multiplier / corporate-action mismatch and dropped (`reference-mismatch`), never shown. The badge turns emphasised at 1.5%.

**Depth.** Pool addresses are not in DefiLlama data, so `scripts/resolve-stocks-pools.js` derives them offline from factory + token pair and writes `data/stocks-pool-addresses.json`: Uniswap v3 `getPool(a, b, fee)` (Ethereum, Arbitrum, Base, BSC), Aerodrome Slipstream `getPool(a, b, tickSpacing)` (Base), Uniswap v2 `getPair` (supported, but no v2 pool exists in the data). Each result is cross-checked against the pool's own `token0/token1` and stores token decimals. Needs `ALCHEMY_API_KEY`; without it the script writes nothing and says so. Verified 2026-10-12: **26 of 27 resolvable pools resolved** (13 Uniswap v3, 13 Slipstream; `WTCOIN-USDC` CL200 not found). The Slipstream factory is `0xF8f2...61eF` (the address `factory()` returns on a real Aerodrome pool; the older-looking `0x5e7B...809A` returns zero for these pools). Uniswap v4, Solana (Raydium / Orca), lending markets, Hyperliquid and Robinhood Chain keep the TVL heuristic (`no-resolver` / `chain-unsupported`).
The live function reads `slot0` + `liquidity` (v3/Slipstream) or `getReserves` (v2) in **one JSON-RPC batch per chain** and computes **+-2% depth in USD = the smaller of the buy side (stable in, equity +2%) and the sell side (equity in, equity -2%)**, quote token valued at $1. v2 is exact for x*y=k; v3/Slipstream is an **approximation**: today's in-range liquidity is held constant across the move (ticks crossed are ignored; fees ignored), so it can overstate depth for tightly concentrated pools, and the figure is capped at half the pool TVL (`depthCapped`). A pool price more than 25% away from the DefiLlama price drops the depth (`price-mismatch`).

**UI (`stocks.js`).** Fetch once on load, then every 60s while the tab is visible (and on becoming visible). New "Token price" column (price, plus "+x.xx% vs last close" with a source tooltip when closed); the Depth cell shows the RPC value labelled "+-2% · on-chain" (tooltip states the approximation) or the heuristic labelled "Est. 50 bps". A status line says loading / updated at / refresh failed / unavailable; on failure the page runs entirely on snapshot values (Playwright-checked with a 503 and an aborted request).

**Verified live vs mocked (2026-10-12).** Live: DefiLlama prices for all 7 chains; DefiLlama historical close prices (drift fallback); pool resolution and `slot0` / `liquidity` reads and the depth math on real pools (through public RPC nodes, because no Alchemy key was available here; the same code paths and ABI calls, only the endpoint differed); Pyth feed-id discovery. Mocked only (`test_stocks_onchain.js`, no network): the Pyth price call, the Alchemy URL/auth, partial-failure and secret-leak behaviour. `data/stocks-pool-addresses.json` was generated by the committed script against public RPC nodes for that reason; regenerate it with the key via `ALCHEMY_API_KEY=... node scripts/resolve-stocks-pools.js`. Re-run it whenever the snapshot gains pools.

**Open items.** (1) Pyth needs a paid/keyed Hermes account before the underlying-close reference works. (2) A tick walk (tickBitmap + ticks) would replace the constant-liquidity approximation with exact in-range depth, at roughly 5-10x the RPC calls. (3) `compute-forecasts.py` carries a hardcoded fallback Alchemy key (`DEFAULT_ALCHEMY_KEY`); it was not used here and should be rotated and removed. (4) Heuristic "Est. 50 bps" and on-chain "+-2%" are different measures sharing one column; each cell is labelled, but rows are not comparable across the two. (5) The Hyperliquid and Robinhood Chain pools have no resolver or Alchemy network configured here.

## Token versions data layer (2026-10-26)

`generate-stocks-versions.js` (CI, after `generate-stocks-snapshot.js`) writes `data/stocks-versions.json` (about 100 KB) and `data/stocks-versions-slim.json` (about 10 KB, the input of the live view); both are generated outputs listed in `scripts/site-outputs.txt`. Per underlying it lists every VERIFIED version (`VERIFIED_BASES`); unverified tokens sit in a separate `unverified` array and never enter a comparison or summary. Shared math lives in `api/_stocks-versions.js`.

- **multiplier = shares per token.** xStocks: 1 (issuer design, docs.xstocks.fi/developers/multipliers; wrapped tokens unknown). Coinbase: API `multiplier`. Robinhood: `rhj/assets` `currentMultiplier`. Ondo: `SyntheticSharesOracle.getSValue` on Ethereum/BSC (needs `ALCHEMY_KEY`; tokens the oracle does not list are unknown). bStocks, Reality, ST0x, Backpack: unknown. Unknown => `multiplierUnknown`, never a premium.
- **premium % = (price / (multiplier x reference) - 1) x 100**, dropped beyond 25% (`reference-mismatch`). Reference = Pyth live in the regular session, last regular close otherwise, always labelled. Hermes needs `PYTH_API_KEY` (CI secret and Vercel env); without it reference and premiums are null with a reason.
- **Live view:** `GET /api/stocks-onchain?view=versions` (same cache and 4s upstream timeouts): per-version DefiLlama price, Pyth reference (`kind: live|last-close`), premium, session.
- **CEX prices:** one request per exchange per CI run, only exchanges in `registry.cexSources` with `enabled: true` (Kraken, Bybit, Binance market-data host). Gate, MEXC and Bitget are implemented but disabled until their data terms are reviewed. Robinhood, Coinbase Exchange, OKX and Backpack expose nothing usable (`registry.cexNotAvailable`).
