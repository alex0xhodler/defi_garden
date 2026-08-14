# DeFi Garden MCP server — contract + quickstart (backlog 228, spec 228)

**Status: code-complete, NOT yet deployed.** This document describes what
ships once a human runs the deploy delta below. Until then, `POST
https://www.defi.garden/mcp` 404s at the origin (Vercel serves the static
site directly; nothing intercepts `/mcp` yet — same standing gap
`edge/API.md` documents for `/api`). Everything on this page is real, tested
code (`edge/mcp-core.js`, `test_mcp_server.js`) — it just isn't live traffic
yet.

This server exposes the exact same railed reads as the
[read-only Yield API](API.md) (item 227), as **installable MCP tools** — the
same Cloudflare Worker, one more endpoint (`/mcp`), zero new data, zero new
rails. Server name: `defi-garden-mcp`, version `0.1.0`.

## Why this exists

An agent that can *install* a tool reaches for it by default; a REST
endpoint must first be discovered and hand-wired. Every number this server
returns has already passed DeFi Garden's trust rails — an anomaly exclusion
and a TVL floor, sourced from one shared module (`trust-rails.js`) all the
way through `edge/api-core.js`. This server adds **no second copy** of
either rail: every tool call is a pure pass-through to
`apiCore.handleApiRequest(...)`, and its response body is returned
**verbatim**. See `CLAUDE.md`'s "Trust rails are the moat".

## Transport

`POST /mcp` — a single JSON-RPC 2.0 message per request/response, exactly
[MCP's Streamable HTTP transport](https://modelcontextprotocol.io/) with no
server→client SSE stream (this server never needs one — it has no
long-running operations, no server-initiated messages, no subscriptions).
Because there is no SSE stream to open, `GET /mcp` returns `405` (the
transport spec explicitly permits this for a server with nothing to stream)
and `OPTIONS /mcp` answers a CORS preflight (`204`, `Access-Control-Allow-*`
generous by design — this is a public, read-only surface, same posture as
`/api`).

No sessions, no auth, no batching in v0 — one JSON-RPC message in, one
JSON-RPC message (or, for a notification, a bare `202`) out.

## Methods

| method | notes |
|---|---|
| `initialize` | Returns `protocolVersion`, `capabilities: { tools: {} }`, `serverInfo: { name: "defi-garden-mcp", version: "0.1.0" }`. Echoes the client's requested `protocolVersion` if supported; otherwise falls back to this server's newest supported version. |
| `notifications/initialized` | A JSON-RPC *notification* (no `id`) — per JSON-RPC 2.0, notifications never get a response body. `POST /mcp` answers `202` with an empty body. |
| `tools/list` | Returns the four tools below, each with a full `inputSchema`. |
| `tools/call` | Runs one tool; see "Tools" below for the delegation contract. |
| `ping` | Returns an empty result object (`{}`) — liveness check. |

**Supported protocol version(s):** `2025-06-18`. This is the one version
this server has actually been built and tested against — not a claim of
compatibility with any other MCP protocol revision.

**Capabilities:** `{ tools: {} }` only. This server is read-only: it
advertises no `resources`, `prompts`, `sampling`, or `logging` capability,
because none is implemented. Advertising a capability with nothing behind
it would be a false claim on the exact surface whose whole differentiator
is honesty.

### Errors (JSON-RPC 2.0 standard codes)

| code | meaning here |
|---|---|
| `-32700` | Parse error — the POSTed body isn't valid JSON. Raised by the Worker (`edge/agent-log.mjs`), before any JSON-RPC handling. |
| `-32600` | Invalid Request — the body parsed as JSON but isn't a well-formed JSON-RPC 2.0 envelope. |
| `-32601` | Method not found. |
| `-32602` | Invalid params — an unknown `tools/call` tool name, or a missing/wrong-typed required argument. |
| `-32603` | Internal error — an unexpected throw inside a method handler. |

A **tool-level** failure (e.g. `get_pool` with an id that doesn't exist,
`forever_number` with a missing `monthly`) is **not** a JSON-RPC protocol
error — MCP's own contract makes it a *successful* JSON-RPC response whose
`result` carries `isError: true` and the delegated API's error body as
`content`. Only a problem with the JSON-RPC envelope or the tool-call
request itself (not the underlying data) uses the codes above.

## Tools

Every tool carries the exact `api-core` route it delegates to
(`edge/mcp-core.js`'s `TOOLS` table) — a tool computes nothing; it builds a
`{ pathname, searchParams }` pair from its arguments and hands off to
[`edge/api-core.js`](API.md)'s `handleApiRequest`, returning that route's
response body **verbatim** as `{ content: [{ type: "text", text:
"<JSON>" }], isError }`. This is why the tool descriptions below can state
the rails without hardcoding their current numeric values — the actual
threshold values live in one place (`trust-rails.js`, read at request time),
never duplicated here.

### `find_pools` → `GET /api/pools`

Search the railed pool list by token, chain, project, and/or a minimum TVL
floor. Every returned pool has already passed both trust rails: the
anomaly exclusion (total APY over the sanity limit is never returned) and
the TVL floor (a caller-supplied `minTvl` may only raise it, never lower
it).

| arg | required | type |
|---|---|---|
| `token` | no | string — substring match on symbol |
| `chain` | no | string — exact match |
| `project` | no | string — exact match |
| `minTvl` | no | number — may only raise the floor |
| `limit` | no | number |

### `get_pool` → `GET /api/pools/:id`

Look up one pool by its DefiLlama `pool` id. Unlike `find_pools`, a
flagged pool (anomalous total APY, or below the TVL floor) is still
returned here — never hidden — but explicitly labeled `anomalous` /
`belowMinTvl` with a prose `reason`, so a caller can never mistake a
flagged number for a railed one.

| arg | required | type |
|---|---|---|
| `pool_id` | **yes** | string |

### `forever_number` → `GET /api/forever-number`

The SUBSCRIPTION-archetype math: the lump-sum capital whose yield alone
covers a recurring monthly bill forever. Uses a caller-supplied rate, or —
when omitted — a TVL-weighted blended rate derived from the currently
**railed** pool set only (never a hand-picked or anomalous/below-floor
pool).

| arg | required | type |
|---|---|---|
| `monthly` | **yes** | number — positive USD/month |
| `apy` | no | number — annual rate, percent |

### `explain_rails` → `GET /api`

Returns the full API contract document: the exact current trust-rail
values, prose explanations, the data source, and the endpoint list. Call
this first to learn the live threshold values before interpreting any
other tool's output.

| arg | required | type |
|---|---|---|
| *(none)* | — | — |

## Pricing (backlog 234, spec 234)

**Status: code-complete, pricing DARK.** `X402_ENABLED` ships unset — every
tool below is callable free today, `forever_number` included. Full
contract: [`X402.md`](X402.md).

<!-- BEGIN GENERATED MCP PRICING -->
**Free tools:** `find_pools`, `get_pool`, `explain_rails`.

**Paid tools:** `forever_number`.

Any tool whose API route is not explicitly listed as free defaults to paid.
<!-- END GENERATED MCP PRICING -->

A `tools/call` for a paid tool without a valid payment header gets the same
x402 payment-required response as its underlying REST route. `tools/list`,
`initialize`, `ping`, notifications, and every free tool are never gated.

Tool pricing is derived from the exact same schedule
`edge/x402-core.js`'s `PRICE_SCHEDULE` encodes, via each tool's own
declared `route` field (`edge/mcp-core.js`'s `TOOLS` table) — never a
second, hand-typed tool→price map (`x402Core.classifyMcpTool(name, TOOLS)`,
asserted against `classifyRoute(tool.route)` by `test_x402_core.js`).

## Quickstart — installing this server (once deployed)

The snippets below use `https://www.defi.garden/mcp`, the URL this server
will answer at once deployed. **They will 404 until then** — see "Status"
above.

### Claude Desktop / Claude Code (remote MCP server)

```json
{
  "mcpServers": {
    "defi-garden": {
      "url": "https://www.defi.garden/mcp"
    }
  }
}
```

### ChatGPT (custom connector / remote MCP)

Add a connector pointing at `https://www.defi.garden/mcp` using ChatGPT's
remote-MCP connector flow (Settings → Connectors → Add). No auth, no API
key — this is a public, read-only server.

### Raw JSON-RPC (any client, for debugging)

```bash
curl -sS -X POST https://www.defi.garden/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"explain_rails","arguments":{}}}'
```

## What this server deliberately does NOT do yet (v0)

- **No public MCP registry listing.** The backlog row asks for one, but a
  registry submission is an outward-facing account action naming a URL
  that 404s until deploy — human-owned, follows the deploy runbook below.
- **The `.well-known/` discovery cards are correct (fixed by item 265, 2026-08-12).**
  228 shipped this server, then its verifier found all three discovery cards
  pointed agents at a dead `/api/mcp` with a phantom `sse` transport and an
  unimplemented `prompts` capability — filed as 265 and fixed once the human's
  deploy made the mismatch live. Current state, all three verified
  byte-identical (md5 recomputed at fix time) and enumerated by globbing
  `.well-known/**` for `mcp`, never a hand-typed list: `url` is
  `https://www.defi.garden/mcp`, `type` is `streamable-http`, capabilities are
  `tools` only (matching `edge/mcp-core.js`'s `SERVER_CAPABILITIES` — the
  parity test in `test_mcp_discovery_cards.js` derives the expected values
  from that export rather than hand-typing them, so the two can't drift
  silently again). The two further hardcoded `/api/mcp` artifacts 265 also
  found (`validate_readiness.py:62`, `dns-aid-zone.txt:14`) and the SKILL.md
  restatement are corrected too.
  - `vercel.json:171` emits a `Link: </.well-known/mcp/server-card.json>;
    rel="mcp-server-card"` header on source `/(.*)` — i.e. on **every response
    the site serves** — and `.vercelignore` keeps all of `.well-known/` in the
    deploy, so the corrected card now reaches every consumer.
- **Not advertised in `llms.txt` or the sitemaps.** Publishing a URL that
  isn't live would be a false claim on the agent surface this product's
  whole pitch is built on — a follow-up item adds that once this is
  deployed and verified, exactly as item 227 recorded for `/api`.
- **No auth, no write path, no pricing/x402** — that's item 234 (blocked on
  this item).
- **No sessions, no batching, no resources/prompts/sampling.**
- **This is NOT the only MCP-branded surface this site serves.** `home.html:227-343`
  registers **WebMCP** tools on every page load —
  `window.navigator.modelContext.provideContext({ tools: [...] })` exposing
  `search_yield_pools` and `calculate_savings_projection` to any browser-hosted
  agent. It is live today on `/` and `plan.html`, it is unrelated to this
  Worker, and it does **not** go through `api-core.js`: its `search_yield_pools`
  fetches DefiLlama directly and re-implements both trust rails as **hardcoded
  literals** (`home.html:269-270` — `p.tvlUsd < 100000`, `p.apy > 1000`). Those
  happen to be correct today and are correct only by coincidence: they are a
  third copy of rules that `trust-rails.js` exists to keep singular, and this
  is precisely the drift class item 261 shipped a fix for. Filed as **backlog
  266**; deliberately not touched here, because `home.html` is the IA router
  and editing it from an edge-Worker item would be a drive-by on a HIGH-risk
  render path.

## Deploy

Same Worker, same command, no new binding — see `edge/DEPLOY.md` §7's
pattern for item 227; item 228 adds `edge/mcp-core.js` and a new `/mcp`
branch in `edge/agent-log.mjs`, but no new D1 table, no new `wrangler.toml`
entry, no new route (the Worker already owns `www.defi.garden/*`; `/mcp` is
just one more path it branches on). `wrangler deploy -c edge/wrangler.toml`
picks up this diff the same way it already picks up 227's.

After deploy, verify:

```bash
curl -sS -X POST https://www.defi.garden/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'
```

Expect a `200` JSON-RPC result carrying `serverInfo.name: "defi-garden-mcp"`.
Then re-confirm the sacred pass-through still holds (same check `edge/DEPLOY.md`
§7 already runs for 227):

```bash
curl -sS "https://www.defi.garden/?token=USDC" | head -5
```
