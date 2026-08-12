# agent-surface deploy verification — playbook

**When to use:** any tick after the edge Worker (224/227/228/234 stack) is deployed, redeployed, or
a route/pricing/discovery change ships — verify the LIVE surface, never infer it from merged code.
First derived 2026-08-12, the tick that found the deploy live and its discovery cards pointing at a
404 (item 265).

## The checklist (all curl, ~15 requests, no credentials needed)

1. **Deploy detection**: `GET /api/health` — 200 with a JSON body containing `rails` = Worker is
   intercepting; a Vercel-shaped 404 (`iad1::` error id) = not deployed. Do not read docs to answer
   this; probe.
2. **Rails in the body**: health/pools responses must carry `apySanityLimit` and `minTvl` equal to
   `trust-rails.js` values, with explanations. `poolsAvailable`/`generatedAt` sane and fresh.
3. **Every routed endpoint**, from `edge/api-core.js`'s ROUTES (never from openapi.json — 262 is
   the drift precedent): `/api`, `/api/health`, `/api/pools?limit=1`, `/api/pools/:id`,
   `/api/forever-number?monthly=<n>`, `/api/pricing`.
   - TRAP: forever-number's param is `monthly`, not `monthly_cost`. A 400 from a wrong param is
     NOT a broken route — read the error body; the railed 400 with a param-naming message is the
     healthy path.
4. **MCP is POST-only JSON-RPC**: `GET /mcp` → 405 is EXPECTED, not a failure. Verify with three
   POSTs: `initialize` (check `serverInfo` + capabilities), `tools/list` (4 tools), one real
   `tools/call` (e.g. `find_pools {token: USDC, limit: 1}`) and confirm the payload matches
   `/api/pools` output (mcp-core delegates verbatim — divergence = P0).
5. **x402 state**: `/api/pricing` → `availability.enabled` must match what the human has flipped
   (false = dark: paid routes serve FREE; a 402 while dark, or a free serve while live, is a P0).
6. **Discovery cross-check — the step 2026-08-12 caught the live bug with**: fetch every
   `.well-known` card the `Link:` response header advertises (curl -sI on `/`), then PROBE THE URL
   AND TRANSPORT EACH CARD DECLARES. A card is only true if its target answers in the declared
   transport. Same for `openapi.json`'s declared paths and llms.txt's endpoint mentions:
   advertised-set ↔ served-set, both directions.
7. **Telemetry caveat for everything above**: your own probes are Worker-logged rows in
   `agent_reads`. Operator/curl traffic never counts toward any gate (crawler-rule extension) —
   say in the snapshot that the probes ran, so the first D1 read can subtract them.
8. **Readout boundary**: D1 reads (`wrangler d1 execute`, DEPLOY.md §6) are credential-gated,
   human-owned. In-session you can verify the surface WORKS but not that it LOGS — state which of
   the two every claim covers. Fail-open logging means "zero rows" and "logger silently broken"
   look identical until the first read; the first read is therefore a logging-path test, not a
   demand measurement.

## Reporting rule
Scope every claim: name the endpoints probed (the population), the verbs, and which legs
(serve-side vs log-side) each verdict covers. "The API works" is malformed; "6 routes + 3 MCP
methods live-probed 200/valid, log-side unverified (credential-gated)" is a claim.
