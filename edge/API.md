# DeFi Garden read-only Yield API — contract (backlog 227, spec 227)

**Status:** code-complete, not yet deployed. This document describes what
ships once a human runs the deploy delta in `edge/DEPLOY.md`. Until then,
every URL below 404s at the origin (Vercel serves the static site directly;
nothing intercepts `/api/*` yet).

Version: `0.1.0` (also returned in every response's `X-Defi-Garden-Api-Version`
header and in the `/api` document body's `version` field). This is a v0
contract — routes may gain fields; existing fields won't change meaning
without a version bump.

## Why this exists

DefiLlama's `/pools` firehose is raw: ~16k pools, no curation, no floor, no
anomaly handling. This API is a **curated, railed, explainable** subset of
that same data — the differentiator for an agent that wants to *cite* a
number, not just consume one. Every response with a body carries a `rails`
object stating, in prose, exactly what was filtered out and why. See
`CLAUDE.md`'s "Trust rails are the moat" and NORTH_STAR.md's Q4a.

## The rails (non-negotiable)

Both values below are read from `trust-rails.js` at request time — this API
has no rail constant of its own, so it can never drift from the analytics
app's own `app.js:800-801`.

1. **Anomaly exclusion.** Any pool whose total APY
   (`apyBase + apyReward`, missing values read as 0) exceeds
   `APY_SANITY_LIMIT` is **excluded from every `/api/pools` list response**.
   `GET /api/pools/:id` still returns it, but with `"anomalous": true` and a
   `reason` string — an anomalous rate can never reach a caller presented as
   sane.
2. **TVL floor.** `/api/pools` defaults to a `minTvl` of `DEFAULT_MIN_TVL`.
   A caller-supplied `minTvl` may only **raise** this floor — a lower value
   is clamped up to the default, and the response reports
   `railsApplied.minTvlClamped: true`. This is **stricter** than the
   analytics app, which lets an interactive user set `minTvl=0`; a curated
   endpoint agents cite does not offer that escape hatch.
3. **Every response with a body carries a `rails` object** — success or
   error, 200 through 503 — with `apySanityLimit` (number), `minTvl`
   (number, the *effective* floor for that response), and
   `apySanityLimitExplanation` / `minTvlExplanation` (prose). This is not
   optional per-route. (The one body-less response is `OPTIONS`'s `204`
   CORS preflight, below — there is no body for a `rails` object to live
   in.)

The current live values (subject to a human changing `app.js:800-801` and
`trust-rails.js` together, per that file's own header comment):
`APY_SANITY_LIMIT = 1000` (percent), `DEFAULT_MIN_TVL = 100000` (USD).
Always read the actual response's `rails` block rather than hardcoding these
— that's the whole point of shipping them on every response.

## Caching / CORS

- Every `/api/*` response: `Access-Control-Allow-Origin: *`,
  `X-Defi-Garden-Api-Version: 0.1.0`, and a `Cache-Control` that depends on
  status — `public, max-age=300` for 2xx/4xx, `no-store` for any 5xx (503,
  500 — see those sections below): an outage answer must never be publicly
  cached past the outage.
- `OPTIONS /api/*` → `204 No Content` with
  `Access-Control-Allow-Methods: GET, OPTIONS` and
  `Access-Control-Allow-Headers: Content-Type` (CORS preflight; generous by
  design — this is a public, read-only surface).
- Pool data itself is fetched from `https://yields.llama.fi/pools` with
  Cloudflare edge caching (`cf: { cacheTtl: 300, cacheEverything: true }`)
  plus an in-isolate memo, so most requests never hit the upstream directly.

## Endpoints

### `GET /api`

The contract document: `name`, `version`, `description`, `dataSource`
(`upstream`, `attribution`, `cacheTtlSeconds`), `endpoints` (this same list,
machine-readable), and `rails`.

### `GET /api/health`

```json
{
  "ok": true,
  "version": "0.1.0",
  "poolsAvailable": 7322,
  "generatedAt": "2026-08-11T00:13:04.696Z",
  "rails": { "...": "..." }
}
```

`poolsAvailable` is the count of pools currently passing BOTH rails (the
floor and the anomaly exclusion) — i.e. how many pools `/api/pools` could
ever return right now, before any `token`/`chain`/`project`/`minTvl` filter
narrows it further. `generatedAt` is response-build time (ISO-8601, UTC).

### `GET /api/pools`

Railed pool list.

| param     | required | default | notes |
|-----------|----------|---------|-------|
| `token`   | no       | —       | case-insensitive substring match against `symbol` |
| `chain`   | no       | —       | case-insensitive exact match against `chain` |
| `project` | no       | —       | case-insensitive exact match against `project` |
| `minTvl`  | no       | `DEFAULT_MIN_TVL` | may only raise the floor; a lower value clamps up |
| `limit`   | no       | `50`    | max `200`; values above the max clamp down |

Response:

```json
{
  "pools": [
    {
      "pool": "747c1d2a-c668-4682-b9f9-296708a3dd90",
      "chain": "Ethereum",
      "project": "lido",
      "symbol": "STETH",
      "tvlUsd": 17692623961,
      "apyBase": 2.171,
      "apyReward": null,
      "totalApy": 2.171,
      "apyMean30d": 2.19579,
      "poolMeta": null,
      "exposure": "single",
      "ilRisk": "no",
      "url": null
    }
  ],
  "count": 7322,
  "returned": 50,
  "railsApplied": { "minTvl": 100000, "minTvlClamped": false, "limit": 50, "limitClamped": false },
  "rails": { "...": "..." }
}
```

`count` is the total number of pools matching every filter (before `limit`
truncates the `pools` array); `returned` is `pools.length`. Results are
sorted by `tvlUsd` descending — deterministic, reproducible pagination-free
ordering (there is no `offset`/cursor param in v0).

### `GET /api/pools/:id`

One pool by its DefiLlama `pool` id (the same id `?pool=` uses on
`www.defi.garden`). `404` (with `rails`, no `endpoints`) if the id isn't
found in the current pool set.

On a match, the same fields as a list-response pool, plus:

- `anomalous` (boolean) + `reason` (string, non-null only when anomalous):
  the anomaly rail's flag-not-exclude treatment for single-pool lookups
  (spec 227's Change section, rail 1).
- `belowMinTvl` (boolean) + `belowMinTvlReason` (string, non-null only when
  true): transparency beyond the spec's literal ask — a pool below
  `DEFAULT_MIN_TVL` is still returned by id (the floor only ever gates *list
  discovery*), but honestly labeled as something `/api/pools` would never
  surface.

### `GET /api/forever-number?monthly=X[&apy=Y]`

The SUBSCRIPTION-archetype math: the lump-sum capital `C` such that
`C * apy/12 >= monthly` — i.e. capital whose yield alone pays a recurring
monthly bill forever. Formula and edge-case semantics (`rate <= 0` → "not
financeable") are `planner.js:162`'s `foreverNumber(monthlyTarget,
annualRatePct)`, called directly (not re-derived — see `edge/api-core.js`'s
header comment).

| param     | required | notes |
|-----------|----------|-------|
| `monthly` | yes      | positive USD/month |
| `apy`     | no       | annual rate, percent. Omitted → a TVL-weighted blended rate is derived from the currently-railed pool set (never a hand-picked pool) |

```json
{
  "monthly": 20,
  "apyPct": 2.7623341291886128,
  "apySource": "blended",
  "financeable": true,
  "foreverNumber": 8688.304483661279,
  "notFinanceableReason": null,
  "rails": { "...": "..." }
}
```

(`apyPct`/`foreverNumber` above are real output against the committed
`data/pools-snapshot.json` at the time this doc was written — the actual
blended rate moves with the live pool set.)

`400` (with `rails`) if `monthly` is missing/non-positive, or `apy` is
given but not a number.

### Unknown `/api/*`

`404`:

```json
{
  "error": "not_found",
  "message": "Unknown API route. See \"endpoints\" for the routes this API serves.",
  "endpoints": [ "...same list as GET /api..." ],
  "rails": { "...": "..." }
}
```

### `503` — upstream pool data unavailable

If the `yields.llama.fi` fetch fails (network error, non-2xx, unparseable
body) and no in-isolate memo is still within its 300s TTL, every route
returns:

```json
{
  "error": "upstream_unavailable",
  "message": "Could not fetch live pool data from yields.llama.fi right now; please try again shortly. ...",
  "rails": { "...": "..." }
}
```

This response is never publicly cached: `Cache-Control: no-store` (unlike the
`public, max-age=300` every other `/api/*` response carries), since an outage
answer must not keep being served after the outage ends.

### `500` — internal handler error (defense in depth)

If the routing/railing logic in `edge/api-core.js` throws for any reason
(a defensive catch — the one known-throwing input, a malformed `/api/pools/:id`
percent-escape, is guarded directly inside `api-core.js` and never reaches
this branch), `edge/agent-log.mjs`'s `handleApi()` catches it and returns:

```json
{
  "error": "internal_error",
  "message": "This API handler failed unexpectedly while answering this request. ...",
  "rails": { "...": "..." }
}
```

also with `Cache-Control: no-store`. Together with the 503 above, these are
the only two cases where this API cannot give a normal answer — both still
return real JSON with a `rails` block, both are logged like any other `/api`
request, and neither ever falls back to the pass-through/origin path (that
would mean an `/api/*` request receiving the STATIC SITE's HTML, not JSON)
or fabricates pool data. `handleApiRequest` itself never throws by
construction (every input it's documented to accept, including hostile
`:id` segments, resolves to `{ status, body }`); this 500 branch exists as a
second line of defense so that even an undiscovered future bug in the
handler cannot escape `fetch()` as an unhandled exception (which, on
Cloudflare, would render as an opaque 1101 error page with no body — the
one thing this API's "every response carries `rails`" contract exists to
rule out).

## What this API deliberately does NOT do (v0)

- No auth, no write path, no pricing/x402 (that's item 234).
- No pagination beyond `limit` (no `offset`/cursor).
- No MCP tool wrapper (item 228, explicitly built *after* this item).
- Not yet linked from `llms.txt` or the site itself — see spec 227's
  "Explicitly OUT of scope": advertising a URL that isn't live yet would be
  a false claim on the agent surface. A follow-up item does that once this
  is deployed and verified.
