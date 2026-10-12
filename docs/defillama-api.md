# DefiLlama API: what we use, what is deprecated, how to switch

Verified 2026-10-12 against DefiLlama's spec (api-docs.defillama.com) and live requests.

## The rule

Every DefiLlama API URL is built in one file: `llama-endpoints.js` (browser global
`window.LLAMA_ENDPOINTS`, Node `require('./llama-endpoints.js')`, Python mirror in
`compute-forecasts.py`). `test_llama_endpoints.js` fails if any other source file
hard-codes one. Do not add a literal `yields.llama.fi` / `api.llama.fi` / `coins.llama.fi`
string anywhere else.

| Helper | Today's URL | Used by |
| --- | --- | --- |
| `pools()` | `https://yields.llama.fi/pools` | app.js, planner.js, home.html (WebMCP tool), all `generate-*.js`, `src/poller.js`, `edge/agent-log.mjs` |
| `chart(id)` | `https://yields.llama.fi/chart/{id}` | landing.js (live APY/TVL overlay), compute-forecasts.py |
| `protocols()` | `https://api.llama.fi/protocols` | app.js (CTA URLs), generate-protocol-urls.js |
| `coinsPrices(keys)` | `https://coins.llama.fi/prices/current/{keys}` | PoolDetail.js |

## Status of the endpoints

| Endpoint | Status |
| --- | --- |
| `https://yields.llama.fi/pools` | Free, documented, 200. **Not deprecated.** We use this. |
| `https://yields.llama.fi/chart/{pool}` | Free, documented, 200. **Not deprecated.** |
| `https://api.llama.fi/protocols`, `https://coins.llama.fi/prices/current/...` | Free, 200. |
| `https://yields.llama.fi/poolsEnriched?pool={id}` | 200, unused by us. |
| `https://api.llama.fi/pools` | **404** (still listed in DefiLlama's `llms-free.txt`; do not use). |
| `https://yields.llama.fi/pools/{id}` | **404** (only referenced from `telegram-bot/dist/`). |
| Pro `/yields/pools`, `/yields/poolsOld` | **"Legacy"** (paid Pro paths). Replaced by Pro v1 below. |
| Pro `https://pro-api.llama.fi/{API_KEY}/yields/v1/pools` | Replacement for the above; same frozen response shape and the same pool UUIDs. |
| Pro `https://pro-api.llama.fi/{API_KEY}/yields/v1/chart/{pool}` | Chart equivalent. |

"Legacy" in DefiLlama's announcement refers to the paid Pro paths, not the free hosts we call.

## CI canary

`scripts/llama-canary.js` runs first in `.github/workflows/sitemap-update.yml` (after
`npm install`, before any generator). It GETs the free `/pools` and one `/chart/{id}` and fails the
job unless: HTTP 200, `status === "success"`, `data` is an array with more than 5000 pools,
>= 99% of pools carry `pool, chain, project, symbol, tvlUsd, apy, apyBase, apyReward`, and the
chart's last point has numeric `apy`/`tvlUsd`. It warns on `Deprecation`/`Sunset` headers. It
intentionally ignores `LLAMA_PRO_API_KEY` so it keeps watching the free endpoint production
depends on. It is fail-fast on purpose: every later step bakes pages from this feed and commits to
main, so a degraded feed must stop the run (the next daily cron retries).

## Switching to Pro v1 (build/CI side)

Node and Python processes pick this up from the environment; nothing else changes.

1. Create a DefiLlama Pro key. Store it ONLY as a GitHub Actions secret
   (`LLAMA_PRO_API_KEY`) and, if a deployed function needs it, as a Vercel/Cloudflare
   environment secret. Never commit it, never put it in `vercel.json`, HTML or any file under
   the static root.
2. Expose it to the job that regenerates data, e.g. in `sitemap-update.yml`:
   ```yaml
   env:
     LLAMA_PRO_API_KEY: ${{ secrets.LLAMA_PRO_API_KEY }}
   ```
   `pools()` / `chart()` then return `https://pro-api.llama.fi/{key}/yields/v1/pools` and
   `.../yields/v1/chart/{id}`; `compute-forecasts.py` does the same. `protocols()` and
   `coinsPrices()` stay on the free hosts (they are not part of the yields move).
3. Point a proxy instead of using a key: `LLAMA_YIELDS_BASE=https://your-proxy.example` rewrites the
   free base (`/pools`, `/chart/{id}`). `LLAMA_API_BASE` / `LLAMA_COINS_BASE` do the same for the
   other two hosts. `LLAMA_PRO_BASE` overrides `https://pro-api.llama.fi`.
4. Do not run the canary against the key. It should stay on the free URL until that URL is
   actually gone, then edit `scripts/llama-canary.js` to the new source of truth.

## Browser constraint

The browser build of `llama-endpoints.js` NEVER reads or accepts a key: it always returns the free
URLs (asserted by `test_llama_endpoints.js`). A Pro key must not ship to clients, so if the free
`/pools` ever goes away the browser apps need one of:

- the CI-baked snapshot `data/pools-snapshot.json` (app.js and planner.js already read it first,
  snapshot-first, and only fall through to the live fetch when it is stale or missing), or
- a same-origin proxy/edge function that holds the key, with the browser base repointed in
  `llama-endpoints.js` (change the `yields` default for the browser branch; it is the only file to touch).

`landing.js`'s live `chart()` overlay degrades to the labelled snapshot values on any failure.

## Edge Workers and Vercel

`edge/` (Cloudflare) and `src/poller.js` import `../llama-endpoints.js`; Wrangler bundles it like
`trust-rails.js`. Workers have no `process.env`, so they always use the free default unless the
registry's defaults are edited. `api/mcp.js` (Vercel) only prints the keyless base in a
description string (never `pools()`, which could contain a key). `edge/api-core.js` does the same
for its public contract document.

## Intentionally left as-is

- Generated static output (`tokens/`, `ko|pt|es/tokens/`, `for/`, `stories/`, `pools/`) and
  `telegram-bot/dist/` still contain old URLs; they are regenerated or are a separate deploy.
- `<link rel="preconnect|dns-prefetch" href="https://yields.llama.fi">` in `home.html` / `plan.html`
  (static resource hints; update if the browser host ever changes).
- Icon/CDN hosts (`icons.llamao.fi`, `icons.llama.fi`) and `defillama.com` / `api-docs.defillama.com`
  links: not API endpoints.
- Test files and `audit-app.js`, which mock the production URLs in the browser.
