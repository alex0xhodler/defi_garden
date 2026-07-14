# Feasibility study — DefiLlama data wrapper / cache layer

Backlog item 058. STUDY only — this document is a decision doc, not an implementation. It answers the questions in `product-loop-kit/specs/058.md`. **No product code is changed by this item.** The recommended build is human-owned because it touches the foundational no-backend, static-hosting tenet (CLAUDE.md, NORTH_STAR.md).

## Sandbox limitation (read first)

This study was written in a build-loop sandbox where outbound network access to `yields.llama.fi` is policy-denied at the proxy layer (confirmed via `curl` → `CONNECT tunnel failed, response 403`, and `$HTTPS_PROXY/__agentproxy/status` logging `connect_rejected` for `yields.llama.fi:443` at request time). This is the same restriction every prior loop touching live DefiLlama data has hit (010, 013, 018, 040, 044, 045, 052-055). Two consequences:

- The payload-size comparison below (§4) is **estimated from field cardinality and public knowledge of the `/pools` endpoint's shape, not measured against a live response**. It is marked ASSUMED and the phased plan's first step is to take a real measurement, which any environment with network access can do in five minutes (`curl -s https://yields.llama.fi/pools | wc -c`, then compare against a `jq` projection onto the used-fields list in §1).
- The DefiLlama ToS answer (§3) is written from documented public API conventions and must be confirmed by a human reading the current terms before any build proceeds — it is a gating question and this study does not have live access to re-verify it.

## 0. What the app actually uses today

Grepping `app.js`, `PoolDetail.js`, and `planner.js` for `pool.<field>` accesses, the union of fields actually read from a pool object is:

```
pool, chain, project, symbol, tvlUsd, apyBase, apyReward, apyMean30d,
poolMeta, url, exposure, ilRisk, underlyingTokens
```

That's 13 fields. The public `/pools` response ships each pool with roughly 30-35 fields (id, chain, project, symbol, tvlUsd, apy, apyBase, apyReward, apyPct1D/7D/30D, apyMean30d, volumeUsd1d/7d, il7d, apyBaseInception, mu, sigma, count, outlier, underlyingTokens, poolMeta, url, category, rewardTokens, apyBase7d, stablecoin, ilRisk, exposure, predictions, and more) — the app currently downloads and discards more than half of every pool record on every page load.

## 1. Architecture options matrix

| | (a) Static snapshot via CI/cron | (b) Serverless + edge DB | (c) Hybrid |
|---|---|---|---|
| **What it is** | A scheduled job (reuse the existing `sitemap-update.yml` GitHub Actions pattern) polls DefiLlama, filters to qualifying pools (same `DEFAULT_MIN_TVL`/`APY_SANITY_LIMIT` rails), keeps only the 13 used fields, computes any derived KPIs, and publishes `pools-snapshot.json` (+ per-chain/per-token slices) to the CDN alongside the existing generated `/tokens/`, `/chains/` output. | Vercel Cron + Vercel KV/Postgres, **or** Cloudflare Worker + D1 + Cron Triggers, **or** Turso/libSQL with a scheduled writer. Poll → store → serve via an edge function with real query support. | Edge DB holds history for KPIs/queries; the hot "current pools for the FE" payload is still published as a static snapshot (same as (a)) for speed and CDN cacheability. |
| **Complexity** | Low — same shape as generators the repo already runs daily | Medium-high — new service, new auth/secrets, new deploy target | Medium — two moving parts, but each is individually simple |
| **$ cost** | ~$0 (GitHub Actions minutes already used; static file is free on Vercel/CDN) | Low but nonzero — Turso free tier covers this scale; Cloudflare D1 free tier likewise; cost risk is in overage/paid tiers if traffic grows | Low — same as (b) for the DB piece, $0 for the static piece |
| **Latency (FE)** | Best — static JSON served from CDN edge, no cold start, no query round-trip | Good but strictly worse than (a) for the hot path — edge function invocation + DB read, even if fast, beats a static file only on freshness, not speed | Best for hot path (inherits (a)'s static serving), good for history/KPI reads |
| **Ops burden** | Minimal — it's a CI job like the ones that already exist; failure mode is "stale snapshot," which is safe by design | Real — a live service to monitor, secrets to rotate, an outage class that doesn't exist today | Real, but scoped to the DB half only; the FE-critical path stays ops-free |
| **Fits static-hosting tenet?** | **Yes** — no backend, no server, no DB; it's a build artifact like `sitemap-*.xml` | **No** — this is a backend by definition; reverses CLAUDE.md's "no-backend, no-build-step" framing | **Partially** — the FE stays static; the KPI/history feature introduces a backend, so the tenet is reversed for that feature only, not the whole app |
| **Gives history/ad-hoc queries?** | No — one current snapshot, no time series, no query language | Yes — this is the whole point of a real DB | Yes, for the KPI feature; no, for the hot FE path (by design) |
| **5-min-cron granularity** | GitHub Actions cron has no SLA and commonly runs 5-20+ min late; acceptable for "pools refresh every few minutes" only if the product doesn't promise minute-level freshness (it doesn't today — the FE already fetches live and shows whatever DefiLlama has at page-load time, no freshness promise beyond that) | Native — Cloudflare Cron Triggers and Vercel Cron support true ~1-5 min schedules with an SLA | Same as (b) for the DB leg |

## 2. "sqlite" reality check

A raw `sqlite` file on serverless (Vercel functions, Cloudflare Workers) is ephemeral — each invocation may get a fresh filesystem, so a committed or locally-written `.sqlite` file does not survive between requests and cannot be the store. The viable options that answer to "sqlite" in a serverless-compatible way are:

- **Turso/libSQL** — a hosted, serverless-friendly fork of SQLite with an HTTP/embedded-replica client; the closest match to "sqlite" the human floated, and has a free tier that comfortably covers polling ~15-20K pool rows every 5 minutes.
- **Cloudflare D1** — SQLite running at Cloudflare's edge, paired naturally with Workers + Cron Triggers.

**Concrete recommendation if the DB leg is ever built: Turso/libSQL**, because it can be read from a Vercel Edge Function without also migrating the rest of the stack to Cloudflare Workers — smaller blast radius on a codebase that's Vercel-hosted today.

## 3. DefiLlama ToS / attribution / rate limits (GATING — human must confirm)

*(ASSUMED — confirm against the current terms before building; not independently verifiable from this sandbox.)* Based on documented public conventions for the DefiLlama yields API as of prior training knowledge:

- The `/pools` endpoint (`yields.llama.fi`) is DefiLlama's free, public, no-API-key yields API, intended for exactly this kind of third-party consumption (dashboards, bots, aggregators already do this widely).
- DefiLlama does not, to public knowledge, prohibit caching or re-serving derived/filtered data — the widespread ecosystem of yield aggregators built on this endpoint would not exist otherwise.
- Attribution ("data from DeFiLlama" / link back) is the common courtesy convention in the space rather than a documented hard requirement, but the app should keep doing it regardless (cheap, and consistent with the trust-first positioning in NORTH_STAR.md).
- No published hard rate limit is known for the free tier; DefiLlama also sells a Pro API for higher-volume/committed use — a ~5-minute poll cadence for one aggregate endpoint is far below anything that would need Pro.
- **This is a legal/business-terms question, not a technical one. A human must read the current DefiLlama terms (defillama.com or their docs) before any build proceeds on this item** — this study cannot fetch or verify that page from this sandbox.

## 4. Payload win — estimated (network-blocked; needs a real measurement)

*(ASSUMED — confirm with a live measurement; see Sandbox limitation above.)*

- Full `/pools` response: on the order of several thousand pool records × ~30-35 fields each, including verbose fields the app never reads (`predictions`, `apyPct1D/7D/30D`, `mu`, `sigma`, `count`, `rewardTokens` arrays, etc.). This is the well-known "download everything, use a fraction" pattern that makes the endpoint multi-MB.
- A filtered snapshot keeping only: the 13 used fields (§0), only pools passing the existing trust rails (`tvlUsd >= DEFAULT_MIN_TVL` and not anomalous per `APY_SANITY_LIMIT`) — which is also the subset the FE actually renders today — would cut both **row count** (trust-rail filtering already discards a large share of listed pools) and **field count** (roughly 13/33 ≈ 40% of the per-row bytes) at the same time. Directionally this is very likely a >50% reduction in transferred bytes, plausibly more once verbose array fields (`predictions`, `rewardTokens`) are dropped.
- **This estimate is not a substitute for measurement.** Phase 1 of the recommendation below is exactly that measurement, and it requires no architecture decision to run.

## §4a — Measured (2026-07-14, live in-session)

The §4 estimate is now replaced with a REAL measurement, taken live from `https://yields.llama.fi/pools` in this repo's sandbox (Node + zlib) during the 059 build. This supersedes §4's ASSUMED numbers.

| payload | rows | raw bytes | gzip bytes |
|---|---|---|---|
| full `/pools` (what the FE downloads today) | 15,416 | 10,575,356 | 2,095,248 |
| 13-field projection, ALL rows | 15,416 | 4,820,471 | 1,285,267 |
| 13-field, `tvlUsd >= $10M` (anomalous KEPT) — the shipped snapshot | 712 | 202,268 | 50,962 |

- The railed snapshot is a **97.6% cut on the wire** (2,095 KB → 51 KB gzip) versus what the FE downloads today.
- Anomalous pools (`apyBase + apyReward > 1000%`) above the $10M floor: **0** on measurement day — the keep-and-flag rule (§5) still applies structurally; the generator filters on TVL only and never drops flagged pools.
- The railed set spans **40 chains / 371 distinct symbols** (~411 slice files: per-chain + per-token).
- Confirmation from the actual 059 generator run over the same live payload: 15,416 fetched → 712 railed pools, 219,891-byte snapshot envelope (51,763-byte gzip), 412 files written (1 snapshot + 1 meta + 40 chain slices + 370 token slices). The small deltas vs the raw projection above are the envelope wrapper (`schemaVersion`/`generatedAt`/`source`/`minTvlUsd`/`count` keys) and one slug collision merge on the token side.

## 5. Trust rails

Whichever option ships, the snapshot/cache layer becomes the natural **server-side enforcement point** for the trust rails that today run client-side in `app.js`/`planner.js`:

- `APY_SANITY_LIMIT = 1000%` and `DEFAULT_MIN_TVL = $10M` would be applied once, at snapshot-build time, instead of (or in addition to) client-side — same outcome, one fewer place a future change could accidentally skip the filter.
- The layer must **never** be the place these rails get relaxed; it must remain exactly as auditable as today — every displayed number still traces to a live DefiLlama pool through the same two filters, just applied upstream. Any future spec for this build must repeat NORTH_STAR's NEVER-weaken language verbatim.
- Anomalous/demoted pools (⚠-flagged, forced High risk) — that demotion logic currently lives in the FE; if it moves to the snapshot builder it must ship the same flags through, not silently drop flagged pools (the app's design intent is "show flagged, not hide flagged").

## 6. Custom KPIs unlocked by storing snapshots over time

Only available once snapshots are retained across polls (options b/c, not a single-current-snapshot (a)):

- **Rate momentum** — Δapy over the last N snapshots per pool, surfaced as "rate rising/falling" without extra DefiLlama calls. Directly useful to the planner's "you're 2 weeks ahead of plan" hook-model language (NORTH_STAR / CLAUDE.md hook model) and the Degen-honesty ⅓-haircut framing (real decay data instead of a flat haircut).
- **N-day mean APY computed from our own history** — a cross-check against DefiLlama's own `apyMean30d`, useful for the "honest numbers" trust positioning.
- **New-pool detection** — first-seen timestamp per pool id, useful for token/chain page freshness signals (item 048's "Last updated" work) and for flagging brand-new pools as higher-risk by default (no track record yet).
- **TVL trend** — growing/shrinking TVL as a lightweight independent signal alongside the static floor.
- **An honest "trust score"** — a composite of age-in-snapshot-history + TVL trend + rate stability, which is exactly the kind of number CLAUDE.md's "honest numbers beat exciting numbers" principle wants: derived, disclosed, and never used to override the hard sanity/TVL rails, only to rank within pools that already pass them.

None of these require the hot FE path to change — they're an additive layer on top of (a) or the DB half of (c).

## 7. Failure / staleness design

Non-negotiable regardless of which option ships: **if the layer is stale or down, the FE falls back to calling DefiLlama directly and never presents stale numbers as live.**

- Every snapshot carries a `generatedAt` timestamp.
- The FE reads the snapshot's age on load; past a threshold (proposed: 15 minutes — 3x the intended ~5-min poll cadence, generous enough to absorb CI/cron lateness) it treats the snapshot as stale and falls back to `fetch('https://yields.llama.fi/pools')` directly, exactly as it does today, with no visible degradation to the user.
- A visible "data as of HH:MM" freshness stamp (same instinct as item 048's freshness-signal work) makes the staleness state honest rather than silent, in keeping with the "trust is the conversion currency" positioning.
- The fallback path must be tested the same way the primary path is — this is a place a future build's acceptance criteria should require an explicit "kill the snapshot, confirm live fallback still renders" check.

## 8. SEO generator simplification

`generate-token-pages.js`, `generate-chain-pages.js`, and `generate-sitemap.js` (014/021/041) each independently hit DefiLlama in CI today. If a static snapshot (option a, or the static half of option c) exists, these three generators could all read from one shared snapshot file instead of three independent live fetches — fewer CI network calls, one source of truth, and the generators would no longer need to duplicate the same trust-rail filtering logic three times (it would already be applied at snapshot-build time). This is a real simplification win independent of whether the KPI/history feature (option b/c) ever ships.

## Recommendation

**Ship option (a) first — a static snapshot via the existing CI/generator pattern — and treat (b)/(c)'s edge-DB leg as a separate, later, explicitly human-approved decision, not a default next step.**

Reasoning:
- (a) is the only option that doesn't reverse the no-backend tenet at all — it's the same shape as work already shipped (sitemaps, `/tokens/`, `/chains/`, OG images: CI computes, commits/publishes a static artifact, done).
- (a) alone captures the two performance wins (§4 payload cut, one shared source for the three SEO generators, §8) with zero new ops burden and zero new cost.
- (a) alone does **not** unlock the KPI/history feature (§6) — that genuinely needs (b) or (c)'s DB leg, which genuinely does reverse the tenet, which is exactly why NORTH_STAR/CLAUDE.md gate this as a human decision rather than something a build loop should infer its way into.
- Sequencing this way means the reversible, cheap, high-confidence part ships now, and the harder architectural commitment (real backend + DB + ops + cost) is made later, deliberately, by a human, with (a) already in production as a fallback-safe base to build the DB leg on top of if that's the call.

### Phased plan
1. **Measure, don't estimate** (no architecture decision needed): in an environment with DefiLlama network access, run `curl -s https://yields.llama.fi/pools | wc -c` and compare against a `jq` projection onto the 13-field list in §0, to replace §4's estimate with a real number. Cheap, unblocks everything else with confidence.
2. **Human reads current DefiLlama ToS** (§3) and confirms caching/re-serving is fine — gating, must happen before step 3.
3. **Build option (a)**: a `generate-pools-snapshot.js` CI generator (same pattern as the existing `generate-*.js` scripts) producing `pools-snapshot.json` + per-chain/token slices, with a `generatedAt` stamp, trust rails applied at build time, wired into `sitemap-update.yml`. FE fallback logic (§7) ships in the same item, tested by explicitly breaking the snapshot fetch and confirming live DefiLlama fallback still renders. This is a normal-sized build-loop item, HIGH risk tier (touches data the FE renders), and should get its own spec once a human signs off on this recommendation.
4. **Only after (3) is live and stable**: human decides whether the KPI/history feature is worth the backend reversal (b/c). If yes, scope a separate item for the Turso/libSQL leg, gated on trust-rail auditability (§5) exactly as strictly as today.

## Follow-up BUILD item (drafted, BLOCKED on human approval — do not promote without it)

> **059** — Ship a static `pools-snapshot.json` data layer (feasibility-058 option (a)): a `generate-pools-snapshot.js` CI generator producing a trust-rail-filtered, 13-field snapshot + per-chain/token slices with a `generatedAt` freshness stamp, wired into `sitemap-update.yml`; FE (`app.js`/`planner.js`/`PoolDetail.js`) reads the snapshot first and falls back to a direct `yields.llama.fi` fetch when the snapshot is stale (>15 min) or missing. Depends on: a human confirming the DefiLlama ToS/attribution question (§3) and signing off on this study's recommendation. **BLOCKED — do not build until both are confirmed.** Score: 8.0 (perf win + one-source-of-truth for three SEO generators), Risk: HIGH (changes what data the FE and 3 generators render from; must preserve trust rails and the live-fallback path exactly).

## Acceptance criteria — status

- [x] `docs/feasibility-data-layer.md` written: options matrix, size comparison (estimated + honestly caveated, live measurement deferred to phase 1), ToS/attribution answer (ASSUMED, flagged for human confirmation), KPI list, fallback/staleness design, RECOMMENDATION + phased plan.
- [x] Follow-up BUILD item drafted above (059), marked BLOCKED on human approval.
- [x] No product code changed — this commit touches only this doc, the BACKLOG/LOG bookkeeping, and this item's notes file. Trust rails explicitly addressed in §5 and in the follow-up item's risk framing.
