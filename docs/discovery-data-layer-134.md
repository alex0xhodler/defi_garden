# Discovery data layer — serving obscure-token pools fast (study 134)

Backlog item 134. **STUDY only** — this is a decision doc, not an implementation. No product
code is changed by this item. It answers: *when a user searches an obscure token whose pools are
all below the $100K trust-rail floor, should we (a) serve a lower-floored "discovery" dataset from
our own layer, or (b) keep the live DefiLlama fallback for below-floor discovery?* The human
approves any build that follows.

Related: item 133 (the user-facing dead-end this studies), item 059 (the static snapshot),
items 108/109 (the CF Worker + D1 poller), item 112 (the CI $1000-floored transient),
`docs/feasibility-data-layer.md` (058, the parent data-layer study).

## TL;DR recommendation

**Option (b) — keep live DefiLlama for below-floor discovery.** But (b) is not "do nothing": the
real defect item 133 exposes is that the live fallback is **never triggered on an empty token
result** today — it fires only when the user manually drags the TVL slider below $100K
(`app.js:1159`). A `?token=X` landing whose pools are all sub-$100K resolves to an *instant* empty
state (`app.js:2343-2344`) that never touches the live path. The build (a small, separate,
human-approved item — see "Follow-up" below) is to wire the existing live refetch to fire when a
snapshot-sourced token search comes back empty, then re-filter against live pools.

Do **not** ship option (a) (a served lower-floored dataset). It regresses the hot-path payload
~20×, creates a second sub-floor "source of truth" that strains the $100K trust rail, and — if
built on the 112 transient or on D1 — reintroduces exactly the git-bloat / re-serve / no-backend
costs those layers were designed to avoid.

## 1. How pool data is served today (map, with citations)

Three data producers, one FE reader. **Every fast source floors at $100K by trust-rail design.**

| Layer | Floor | Where | Committed? | Served to FE? |
|---|---|---|---|---|
| Static snapshot (059) | **$100K** | `generate-pools-snapshot.js:52` (`DEFAULT_MIN_TVL=100000`), applied `:76` (`isRailedIn`), `:218` | Yes — `data/pools-snapshot.json` + per-chain/token slices in `data/pools/{chain,token}/` | **Yes** — the hot path |
| CF Worker poller → D1 (108/109) | **$100K** | `src/poller-core.js:19`, applied `:48` (`if (tvl < DEFAULT_MIN_TVL) return`) | No (D1 rows) | **No** — store-only; FE never reads D1 (`wrangler.toml:4-5`, `src/poller.js:11`) |
| CI SEO transient (112) | **$1000** | `generate-pools-snapshot.js:306` (bare literal `1000`, full raw fields) | No — written to `$RUNNER_TEMP/seo-pools.json` | **No** — CI-only, feeds 4 SEO generators via `--fixture`/`POOLS_FIXTURE` |

There is **no floor between $1000 and $100K anywhere, and nothing below $1000 is retained anywhere.**
The $1000 transient is the lowest-floored data the pipeline ever computes, and it is deliberately
ephemeral (`$RUNNER_TEMP`), uncommitted, and never served.

Trust-rail note: `DEFAULT_MIN_TVL = $100K` and `APY_SANITY_LIMIT = 1000%` are mirrored verbatim
across `app.js:800-801`, `generate-pools-snapshot.js:51-52`, `src/poller-core.js:18-19`. TVL is the
*only* drop; anomalous-APY pools are KEPT-and-flagged, never hidden. NORTH_STAR.md lists weakening
these rails on the NEVER-auto-merge list. **This study recommends nothing that lowers a served floor.**

### The FE read path (`app.js`, one effect at 1085-1150)
- Snapshot eligibility: `app.js:1133` — `snapshotEligible = !urlParams.pool && urlParams.minTvl >= DEFAULT_MIN_TVL`.
- Default `minTvl` is `DEFAULT_MIN_TVL` (`app.js:847`), so a `?token=X` landing (no `?pool=`) is
  snapshot-eligible → loads `data/pools-snapshot.json` behind a 15-min freshness gate
  (`app.js:1086,1104-1126`), falling back to live `fetch('https://yields.llama.fi/pools')`
  (`app.js:1088-1100`) only if the snapshot is stale/missing.
- A `?pool=<id>` deep link forces `snapshotEligible=false` → always live (`app.js:1077-1080`).

### The 133 dead-end (the problem)
When `?token=X` has no pool ≥ $100K, the snapshot (which only contains ≥$100K pools) has no matching
rows, so the empty state resolves **instantly, with no live fetch**:
- `app.js:2343-2344` — `emptyStateResolved = … pools.length > 0 && filteredPools.length === 0 && (selectedToken || …)`.
- It injects `noindex` (`app.js:2390-2404`) and suggests alternatives that **re-apply the $100K floor**
  (`getEmptyStateAlternatives`, `app.js:2359`: `pool.tvlUsd >= DEFAULT_MIN_TVL && !isAnomalousApy(pool)`).
- The one path that *would* pull sub-$100K pools — the escape-hatch live refetch (`app.js:1158-1175`)
  — is keyed on `[minTvl]` and early-returns while `minTvl >= DEFAULT_MIN_TVL` (`app.js:1159`). It
  fires only when the user drags the TVL slider below $100K, **not** when a token result is empty.

So a real token with only sub-$100K pools shows "no yields found" even though live DefiLlama has
pools for it — unless the user knows to lower the TVL filter by hand. That is the discovery gap.

## 2. Payload / latency — measured

From `docs/feasibility-data-layer.md` §4a (measured live 2026-07-14) plus a local gzip of the
current committed snapshot:

| payload | rows | raw bytes | gzip bytes |
|---|---|---|---|
| Full `/pools` (live-path download today) | 15,416 | 10,575,356 | 2,095,248 |
| 13-field projection, **all rows** (≈ a $1000-floored served slice, floor removed) | 15,416 | 4,820,471 | 1,285,267 |
| **$10M snapshot as shipped** (13 fields; committed file also carries injected `kpis`) | 736 | 327,520 on disk | **65,609** |

- The $10M snapshot is a **~97% cut on the wire** vs live — the win item 059 bought.
- A served **$1000-floored discovery dataset**, even projected to 13 fields, lands near the middle
  row: **~1.29 MB gzip — roughly 20× the current ~65 KB hot-path payload.** Serving that on every
  load erases 059's win. (Exact $1000-floored row count isn't recorded; the CI transient
  `generate-pools-snapshot.js:306` computes it each run if a precise number is wanted.)

Latency-wise, live `fetch('https://yields.llama.fi/pools')` is the slow path (multi-MB, no CDN edge
cache), but it is the **only** source of truthful sub-$100K data — by design, since the poller and
snapshot both floor at $100K and must never lower.

## 3. The options, scored

### (a) Serve a lower-floored discovery dataset
Three sub-variants, all rejected:

- **(a1) Serve the whole $1000-floored set to every FE load.** ~1.29 MB gzip, ~20× the current
  payload — wipes out 059's 97% win for every user to serve a rare case. **Rejected on payload.**
- **(a2) Precompute + commit per-token discovery slices ($1000-floored), fetched on-demand only
  when a token is empty.** Keeps the hot path small, but: (i) requires committing thousands of new
  slice files (the railed set already spans 371 symbols / ~411 slices at $10M; a $1000 floor
  multiplies token coverage and git churn), (ii) small pools churn fast, so a stale committed slice
  showing a dead sub-$100K pool is *worse* than a live fetch (a fresh trust hazard on the exact
  low-quality pools the $100K floor exists to gate), (iii) it re-serves far more DefiLlama data from
  our own CDN — the git-bloat + re-serve/ToS exposure that item 112 deliberately dodged by keeping
  its $1000 transient CI-only and uncommitted (`generate-pools-snapshot.js:301-308`). **Rejected on
  cost/staleness.**
- **(a3) Lower the poller/snapshot floor for a "discovery slice."** Directly touches a trust rail
  applied at the poller/snapshot ($100K is on NORTH_STAR's NEVER-weaken list). Even a "slice" creates
  a served, sub-$100K source of truth. Reading it FE-side either bloats the committed snapshot (a1)
  or requires reading D1 directly (reversing 108's no-backend-read-path — a human keystone, not a
  loop decision). **Rejected on trust-rail + 108.**

### (b) Keep live DefiLlama for below-floor discovery (recommended)
Sub-$100K pools stay on the explicit, on-demand live path, where the FE's existing client-side
anomaly/risk flags already handle them exactly as any live load does today. No new served dataset,
no floor lowered, no D1 read, no git bloat, no extra DefiLlama re-serve from our CDN. The hot-path
payload win (059) is fully preserved; only the rare empty-token case pays one live fetch — which is
unavoidable regardless, since truthful sub-floor data for that token exists *only* live.

| Axis | (a) served lower-floored dataset | (b) live fallback (recommended) |
|---|---|---|
| Hot-path payload | ~20× regression (a1) or thousands of new committed slices (a2) | Unchanged — 97% win preserved |
| Trust-framing | Second sub-$100K source of truth; strains the $100K rail | Rail untouched; sub-floor pools shown via existing live risk-flagging |
| 108 no-backend-read-path | (a3) reverses it (human keystone) | Untouched — reuses the live fetch already in `app.js` |
| 112 CI-transient design | (a2) reintroduces the git-bloat/re-serve it avoids | Untouched |
| Latency | Fast for the rare case, slow to build/maintain | One live fetch on the rare empty-token case only |
| Build size / risk | New data layer, HIGH | Small FE wiring, reuses existing paths |

## 4. Recommendation

**Ship (b).** Concretely, the follow-up build (item 133, human-approved) should:

1. Detect a snapshot-sourced token search that resolves empty for the token *before* committing to
   the empty state — i.e. `poolsSourceRef.current === 'snapshot'` and `filteredPools.length === 0`
   with a `selectedToken` set (the `app.js:2343-2344` condition).
2. Fire one live refetch by reusing the existing `loadLive` / escape-hatch machinery
   (`app.js:1088-1100`, `1158-1175`) — set `poolsSourceRef.current = 'live'`, `setPools(live)`,
   and re-run the token filter against live pools (which include sub-$100K).
3. Keep the honest empty state + `noindex` only if the token is **still** empty after the live pass
   (a genuinely unknown token). Guard against loops (one live attempt per token, like the existing
   `kpiEnrichedPoolRef` / escape-hatch `alive` guards).
4. Show any surfaced sub-$100K pools through the **existing** client-side anomaly/High-risk flags —
   never a relaxed floor. The $100K *default* filter stays; discovery is an explicit "we looked
   harder for this token" live pass, not a lowered served floor.

Acceptance for that build is UX-rendered (standing decision 2026-07-11): drive a real `?token=X`
for a token with only sub-$100K pools and assert the grid populates from live instead of dead-ending
— using the established fixture-routing test pattern (`test_search.js` / `test_snapshot_first.js`
style), since browser-originated external HTTPS is blocked in the loop sandbox.

### Why not defer to a lower floor "later"
The $100K floor is a trust rail, not a perf knob. The honest way to surface sub-floor pools is on an
explicit, flagged, on-demand live path — never by normalizing them into a default served dataset.
(b) is both the cheaper *and* the more trust-consistent answer; there is no payload or freshness
scenario in which (a) wins here.

## 5. Constraints honored
- Trust rails never weakened — no served floor is lowered; $100K stays the default filter and the
  poller/snapshot floor (NORTH_STAR NEVER list).
- `workers/` untouched; `src/poller.js` read-only in this study (out-of-scope for edits).
- No FE→D1-direct read introduced — 108's no-backend-read-path preserved (an option (a3) reversal is
  flagged as human-keystone, explicitly *not* recommended).
- Docs-only deliverable — no product code changed by item 134.

## Follow-up BUILD item (drafted — human approves before promotion)
> **133 build** — Wire the FE to escape the obscure-token dead-end via live fallback (study-134
> option b): when a `?token=X` search sourced from the $100K snapshot resolves empty for the token,
> fire one live `yields.llama.fi/pools` refetch (reuse `loadLive`/escape-hatch, `app.js:1088-1100`/
> `1158-1175`), re-filter against live pools (incl. sub-$100K, shown via existing anomaly/High-risk
> flags), and keep the `noindex` empty state only if still empty. No lowered served floor, no new
> dataset, no D1 read. Rendered-Playwright acceptance via the fixture-routing pattern. Risk: MEDIUM
> (FE data-load path; trust rails and hot-path payload untouched). Score: ~7 (unblocks obscure-token
> discovery — the 133 gap — with zero payload/trust cost).

## Acceptance criteria — status
- [x] Every TVL floor mapped with file:line + constant/value (§1 table).
- [x] (a) vs (b) quantified on payload/latency (§2, §3 table), trust-framing (§3), and the 108
      no-backend-read-path constraint (§3 (a3), §5).
- [x] The live-fetch path 133's dead-end takes today identified with file:line (§1 "The 133 dead-end").
- [x] One clear recommendation (b) with rationale + concrete follow-up item (§4, Follow-up).
- [x] Constraints respected: rails never weakened, `workers/` untouched, FE→D1 reversal flagged not
      adopted (§5). No product code changed.
