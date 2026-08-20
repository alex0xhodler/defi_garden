/*
 * Cloudflare Worker: edge agent-read telemetry (backlog 224, spec 224) +
 * public read-only Yield API (backlog 227, spec 227) + MCP server (backlog
 * 228, spec 228) — same Worker, one deploy, per both items' Change
 * sections ("same Worker as 224's logger" / "same Cloudflare Worker as
 * 224's logger and 227's API, one deploy").
 *
 * API DISPATCH (227): `fetch()` checks `/api` and `/api/*` FIRST, before
 * ANYTHING else runs — including the pass-through line below. This is an
 * ADDITIONAL branch, not a restructuring of the existing pass-through path:
 * every other URL falls through to the exact same
 * `const response = await fetch(request); return response;` this file has
 * always run, byte-for-byte, so the pre-227 "PASS-THROUGH FIRST" contract
 * (see below) holds for every non-`/api`, non-`/mcp` request BY
 * CONSTRUCTION — asserted by test_api_worker.js via Response-object
 * identity, the same technique test_agent_log.js already uses for its own
 * byte-parity cases. `/api` requests never reach the pass-through line at
 * all: they are answered entirely from edge/api-core.js (pure, railed) plus
 * one live fetch of https://yields.llama.fi/pools (edge-cached + in-isolate
 * memoized — see getPools() below), never from origin (Vercel). A
 * pool-data fetch failure returns a 503 JSON carrying api-core.js's own
 * `rails` block — never a thrown error, never the pass-through path. Full
 * contract: edge/API.md.
 *
 * MCP DISPATCH (228): `fetch()` also checks `/mcp` and `/mcp/*`, right
 * beside the `/api` check and equally before the pass-through — a THIRD,
 * separate branch, not folded into `/api/*`, so agent-log-core.js can
 * classify it as its own `pathClass: 'mcp'` (NORTH_STAR leg (A) counts
 * "read-only API calls" and "MCP invocations" as two separable terms — see
 * edge/agent-log-core.js's precedence comment). `POST /mcp` hand-rolls a
 * JSON-RPC 2.0 dispatch (edge/mcp-core.js, pure, delegates every tool call
 * back to api-core.js's `handleApiRequest` verbatim — no second rail
 * copy); `OPTIONS /mcp` is a CORS preflight; every other method (`GET`
 * included — MCP's Streamable HTTP transport permits a server offering no
 * server→client SSE stream to answer `GET` with 405) is a 405 JSON error.
 * `/mcp` reuses the SAME `getPools()` memo `/api` uses — no second fetch
 * path — and returns the same honest 503 shape on an upstream failure.
 * Full contract: edge/MCP.md.
 *
 * NAMING NOTE (deviation from the spec's literal "edge/agent-log.js"):
 * this file is `.mjs`, not `.js`. The house pattern (src/poller.js) is a
 * plain `.js` file using `import`/`export default`, safe because it is
 * NEVER loaded natively by Node — only bundled by wrangler's esbuild step,
 * which detects ESM syntax directly and ignores file extension / any
 * package.json "type" field entirely. This item is different: spec 224
 * requires test_agent_log.js to `import()` THIS FILE DIRECTLY, natively, in
 * plain Node (no wrangler, no bundler). Node's native loader decides ESM vs
 * CommonJS per-file from extension (or an inherited package.json "type"),
 * and this repo's root package.json has (and must keep) no "type" field —
 * every other `.js` file in the repo is implicitly CommonJS. A same-directory
 * package.json can't split the difference either: it would apply to EVERY
 * `.js` sibling, breaking agent-log-core.js's required CJS/`module.exports`
 * shape (the same shape src/poller-core.js uses, deliberately mirrored here
 * so the plain-Node test harness can `require()` it). `.mjs` is Node's
 * documented, unambiguous, per-file way to say "this one file is a real ES
 * module" without touching anything else — no root package.json edit, no
 * new directory-scoped package.json, and it is Wrangler's own recommended
 * extension for a "modules"-format Worker entry point. Wrangler bundles
 * `.mjs` exactly the same way it would bundle `.js` with `import`/`export`
 * syntax; nothing about the deployed behavior changes.
 *
 * Sits in front of origin on route www.defi.garden/* (see wrangler.toml).
 * fetch(): PASS-THROUGH FIRST — `const response = await fetch(request)` — and
 *   the exact same Response object is returned, untouched: no clone, no body
 *   read, no header rebuild. Byte-parity holds BY CONSTRUCTION, not by care.
 *   This is safe from a self-invocation loop precisely because a Worker's
 *   OWN subrequest to the route it is itself bound to does not re-enter the
 *   Worker — Cloudflare routes a Worker's outbound `fetch()` to the next hop
 *   in line (here: the origin, Vercel), never back through the same script.
 *   That is what makes "fetch(request) then return it unmodified" a correct
 *   proxy and not infinite recursion.
 *
 * AFTER the response is captured (never before — logging must not add
 * latency to what a visitor/agent receives), classify the request via
 * agent-log-core.js. If it's agent surface AND env.DB is bound, an INSERT is
 * scheduled with `ctx.waitUntil()` so it runs after the response has already
 * been handed back — it can never delay or block serving.
 *
 * The whole logging path is wrapped so ANY failure — missing DB binding, a
 * thrown classifier, D1 rejecting the write, a malformed request — is
 * swallowed silently. This Worker's ONE job that must never fail is serving
 * the pass-through response; logging is a pure side effect that is allowed
 * to be lossy but never allowed to be load-bearing.
 *
 * Store-only, like src/poller.js: nothing in this app's front end calls or
 * depends on this Worker, so the no-backend tenet holds. This is a SECOND,
 * independent Worker from src/poller.js — it shares the D1 database
 * (defi-garden-history) but has its own wrangler.toml/deploy/route and must
 * never be merged into the root one.
 */

import core from './agent-log-core.js';
import apiCore from './api-core.js';
import mcpCore from './mcp-core.js';
import x402Core from './x402-core.js';
import webBotAuth from './web-bot-auth-core.js';

// backlog 234 (spec 234): the extended (12-column) INSERT is attempted
// FIRST on every write; INSERT_SQL_LEGACY is the byte-identical original
// 9-column statement, used ONLY as a fallback when the extended statement
// fails (Territory note 4 — the human provisions the three new columns by
// hand via edge/schema.sql's ALTER TABLE block, and until that runs, a
// Worker that only ever issued the extended INSERT would silently lose
// EVERY row, not just the three new fields). See insertRow() below.
const INSERT_SQL_EXTENDED =
  'INSERT INTO agent_reads (ts, path, ua, ua_family, accept, referer, status, bot_score, path_class, agent_identity, identity_status, payment_status) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
const INSERT_SQL_LEGACY =
  'INSERT INTO agent_reads (ts, path, ua, ua_family, accept, referer, status, bot_score, path_class) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

export default {
  async fetch(request, env, ctx) {
    // 227: dispatch /api and /api/* to the API handler BEFORE the
    // pass-through — see this file's header comment. `new URL(request.url)`
    // only READS request.url; it cannot affect the pass-through fetch()
    // below in any way, so this check is safe to run unconditionally.
    const url = new URL(request.url);
    // MCP endpoint: dispatch /mcp, /mcp/*, /api/mcp, and /api/mcp/* to the
    // MCP JSON-RPC handler before general REST API and pass-through.
    if (
      url.pathname === '/mcp' ||
      url.pathname.startsWith('/mcp/') ||
      url.pathname === '/api/mcp' ||
      url.pathname.startsWith('/api/mcp/')
    ) {
      return handleMcp(request, url, env, ctx);
    }

    // 227: dispatch /api and /api/* to the API handler BEFORE the
    // pass-through — see this file's header comment. `new URL(request.url)`
    // only READS request.url; it cannot affect the pass-through fetch()
    // below in any way, so this check is safe to run unconditionally.
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(request, url, env, ctx);
    }

    // PASS-THROUGH FIRST. This is the entire contract with every visitor and
    // agent hitting www.defi.garden — everything below this line is a
    // best-effort side effect on a response that has ALREADY been decided.
    const response = await fetch(request);

    try {
      logAgentRead(request, response, env, ctx);
    } catch (_err) {
      // Logging must never break serving — swallow synchronous failures
      // (missing/broken env.DB, a thrown classifier, a malformed request)
      // right here. Async failures (a rejected D1 .run()) are swallowed
      // inside logAgentRead's own promise chain — see the `.catch` there.
    }

    return response;
  },
};

// ---------------------------------------------------------------------------
// 227: public read-only Yield API — pool-data fetch/memo, routing, response
// shaping. Everything ABOVE (agent-read logging, pass-through) is 224's and
// is untouched by any of this.
// ---------------------------------------------------------------------------

const POOLS_UPSTREAM = 'https://yields.llama.fi/pools';
const POOLS_CACHE_TTL_SECONDS = 300; // matches the Cache-Control this Worker sends on /api responses
const POOLS_MEMO_TTL_MS = POOLS_CACHE_TTL_SECONDS * 1000;

const API_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // backlog 234 (verifier round 1): a browser-origin agent constructing the
  // documented payment flow (X402.md's "How to pay") sends `X-PAYMENT` as a
  // real request header and needs to READ `X-PAYMENT-RESPONSE` back off the
  // response — CORS blocks both by default unless explicitly allowed/
  // exposed here, regardless of `Access-Control-Allow-Origin: *`.
  'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT, Authorization, PAYMENT-REQUIRED',
  'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE, PAYMENT-REQUIRED, WWW-Authenticate',
};

// In-isolate memo (module-level — persists for the isolate's lifetime,
// across requests, exactly like a normal Worker global). NOT cleared by a
// failed fetch — a stale entry, if any, is simply left sitting in
// `poolsMemo` untouched — but it is also NEVER served once its TTL has
// elapsed: the freshness check above is a strict `< POOLS_MEMO_TTL_MS`, so
// once POOLS_CACHE_TTL_SECONDS (300s) pass since the last successful fetch,
// every subsequent request re-fetches upstream regardless of whether a
// stale value is sitting in `poolsMemo`. There is no stale-serving fallback:
// during a sustained upstream outage, every request past the TTL hits
// upstream itself and gets its own 503 (Cloudflare's edge cache in front of
// the upstream fetch, `cf: { cacheTtl, cacheEverything }`, may still absorb
// some of that — but this in-isolate memo specifically does not).
// `__resetPoolsMemoForTests` exists ONLY
// so test_api_worker.js can exercise "fetch succeeds" and "fetch fails"
// scenarios back-to-back within one process without one polluting the
// other via this shared module-level state (Node's ESM loader caches this
// module by URL, so re-`import()`-ing it in the same test run returns the
// SAME instance — this reset hook is the surgical fix for that, not a
// production code path).
let poolsMemo = null; // { pools: Array, fetchedAt: number(ms) } | null

export function __resetPoolsMemoForTests() {
  poolsMemo = null;
}

/** Fetches https://yields.llama.fi/pools (Cloudflare edge cache + this
 * in-isolate memo) and returns the raw pool array. Throws on any failure
 * (non-OK status, network error, unparseable/unexpected-shape body) —
 * callers (handleApi) turn that into the 503 JSON response; this function
 * itself never returns a fallback/empty array, which would silently look
 * like "zero pools exist" instead of honestly failing. */
async function getPools() {
  const now = Date.now();
  if (poolsMemo && (now - poolsMemo.fetchedAt) < POOLS_MEMO_TTL_MS) {
    return poolsMemo.pools;
  }
  const res = await fetch(POOLS_UPSTREAM, {
    cf: { cacheTtl: POOLS_CACHE_TTL_SECONDS, cacheEverything: true },
  });
  if (!res.ok) {
    throw new Error('yields.llama.fi responded ' + res.status);
  }
  const json = await res.json();
  const pools = Array.isArray(json && json.data) ? json.data : (Array.isArray(json) ? json : null);
  if (!pools) {
    throw new Error('yields.llama.fi response had no recognizable pool array');
  }
  poolsMemo = { pools, fetchedAt: now };
  return pools;
}

/** Answers one /api or /api/* request. OPTIONS is a pure CORS preflight —
 * answered without touching pool data at all. Every other method is routed
 * through api-core.js's handleApiRequest (this API is read-only end to end,
 * so no method-specific branching beyond OPTIONS is needed).
 *
 * backlog 234 (spec 234): a payment gate sits between OPTIONS and the pool
 * fetch. `x402Core.readConfig(env)` is read ONCE per request; when
 * `!config.enabled`, `gateApplies` is unconditionally false for every route
 * and every branch below behaves byte-identically to pre-234 — this is the
 * "ships with the live-pricing flag OFF, gate is DARK" acceptance criterion.
 * The gate runs BEFORE `getPools()` so an unpaid request to a paid route
 * never costs an upstream fetch. `matchRoute()` returning `null` (an
 * unknown /api/* path) is deliberately never gated — see x402-core.js's own
 * header comment ("NULL MEANS NO SUCH RESOURCE") and Territory note 3: a
 * 404 answers nothing, so charging for it would be charging for nothing. */
function toBase64Utf8(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(_match, p1) {
    return String.fromCharCode(parseInt(p1, 16));
  }));
}

async function handleApi(request, url, env, ctx) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: API_CORS_HEADERS });
  }

  const x402Config = x402Core.readConfig(env);

  // ---- x402 gate --------------------------------------------------------
  const routeId = x402Core.matchRoute(url.pathname);
  const routeClassification = routeId ? x402Core.classifyRoute(routeId) : null;
  const gateApplies = x402Config.enabled && !!routeClassification && routeClassification.tier === 'paid';

  // `Cache-Control` depends on the eventual status AND on whether the gate
  // applied to this request: a 5xx (upstream unavailable, or the
  // internal-error fallback below) is an OUTAGE answer, not a stable one,
  // and must never be publicly cacheable — a CDN caching "please try again
  // shortly" for 5 minutes would keep serving it long after the outage
  // ends. Ordinary 2xx/4xx keep the existing 300s public caching. backlog
  // 234 (spec 234): a 402 is call-specific (its `accepts[0]` carries THIS
  // request's exact resource URI) and must never be publicly cacheable
  // either — caching a stale 402 could keep demanding an amount that's
  // since changed, or keep denying a route a human later made free.
  //
  // FAILURE 3 (verifier round 1, backlog 234): a 200 on a GATED request
  // (`gateApplies` true — a paid route, gate enabled, payment verified)
  // must ALSO be `no-store`, not the ordinary public 300s caching. Without
  // this, a shared/CDN cache sitting in front of this Worker could serve
  // the paid response it just cached to the NEXT (unpaid) requester for
  // that same URL — the payment gate would apply only to the request that
  // happened to populate the cache. `no-store` (rather than `private` +
  // `Vary: X-PAYMENT`) is the conservative choice: `private` still permits
  // a browser's own local cache to retain paid data keyed loosely on the
  // request, and `Vary: X-PAYMENT` is fragile (the header's value differs
  // per payment payload, so it does not collapse to a clean cache key the
  // way `Vary: Accept-Encoding` does) — `no-store` is unambiguous and
  // matches the existing 402/5xx discipline on this same route. This does
  // NOT affect a FREE route or a paid route with the gate DARK
  // (`gateApplies` false in both cases) — those keep the pre-234
  // `public, max-age=300` caching unchanged.
  function headersFor(status, extraHeaders) {
    return Object.assign(
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': (status >= 500 || status === 402 || gateApplies) ? 'no-store' : ('public, max-age=' + POOLS_CACHE_TTL_SECONDS),
        'X-Defi-Garden-Api-Version': apiCore.API_VERSION,
      },
      API_CORS_HEADERS,
      extraHeaders || {}
    );
  }

  let paymentResult = null; // set only when gateApplies
  if (gateApplies) {
    const challenge = x402Core.buildChallenge({ routeId: routeId, resourceUrl: url.toString(), config: x402Config });
    const paymentHeader = request.headers.get('X-PAYMENT');
    paymentResult = await x402Core.verifyPayment({ header: paymentHeader, challenge: challenge, config: x402Config, fetchImpl: fetch });
    if (!paymentResult.paid) {
      // 402, never publicly cacheable, same CORS headers /api always sends,
      // body is x402Core.buildChallenge()'s own protocol-conformant shape —
      // see x402Core's own tests (test_x402_core.js) for the shape proof.
      const challengeStr = JSON.stringify(challenge);
      const base64Challenge = toBase64Utf8(challengeStr);
      const challengeHeaders = {
        'PAYMENT-REQUIRED': base64Challenge,
        'WWW-Authenticate': 'X402 requirements="' + base64Challenge + '"',
      };
      const res402 = new Response(challengeStr, { status: 402, headers: headersFor(402, challengeHeaders) });
      try {
        logAgentRead(request, res402, env, ctx, { paymentStatus: core.mapPaymentStatus(paymentResult, true) });
      } catch (_e) { /* never break serving */ }
      return res402;
    }
  }

  let pools;
  try {
    pools = await getPools();
  } catch (_err) {
    const body = {
      error: 'upstream_unavailable',
      message: 'Could not fetch live pool data from yields.llama.fi right now; please try again shortly. ' +
        'This API never fabricates pool data, so a failed upstream fetch is reported honestly rather than ' +
        'served from stale/fake data.',
      rails: apiCore.buildRailsBlock(),
    };
    const errRes = new Response(JSON.stringify(body), { status: 503, headers: headersFor(503) });
    try {
      logAgentRead(request, errRes, env, ctx, { paymentStatus: core.mapPaymentStatus(paymentResult, gateApplies) });
    } catch (_e) { /* never break serving — see logAgentRead's own header note */ }
    return errRes;
  }

  // Defense in depth (verifier round 1, item 227): `apiCore.handleApiRequest`
  // is guarded internally against the one input class known to throw (a
  // malformed `:id` percent-escape — see api-core.js's decode guard), but
  // this try/catch exists so that literally NOTHING thrown by the handler,
  // known or not-yet-discovered, can ever escape `fetch()` unhandled. An
  // uncaught throw here previously meant an empty-body, non-JSON response
  // straight out of the Worker (a Cloudflare 1101 error page in production)
  // — the one thing this API's whole `rails`-on-every-response contract
  // promises never happens.
  let result;
  try {
    result = apiCore.handleApiRequest({
      pathname: url.pathname,
      searchParams: url.searchParams,
      pools: pools,
      // backlog 234: the ONLY route that reads this field is /api/pricing
      // (edge/api-core.js's own buildPricingRoute()) — every other route
      // ignores it entirely. Defaulting the shape here (never reading env
      // inside api-core.js) is what keeps handleApiRequest a pure function.
      pricing: { enabled: x402Config.enabled, mode: x402Config.mode },
    });
  } catch (_err) {
    result = {
      status: 500,
      body: {
        error: 'internal_error',
        message: 'This API handler failed unexpectedly while answering this request. This should never ' +
          'happen and never fabricates or omits the rails block below — please report it if you see it.',
        rails: apiCore.buildRailsBlock(),
      },
    };
  }

  const extraHeaders = (paymentResult && paymentResult.paid)
    ? { 'X-PAYMENT-RESPONSE': x402Core.paymentResponseHeader(paymentResult) }
    : null;
  const apiResponse = new Response(JSON.stringify(result.body), { status: result.status, headers: headersFor(result.status, extraHeaders) });

  // 227 acceptance: "Keep the existing agent-read logging behavior working
  // for /api paths too." classifyRequest() already classifies every /api
  // path as pathClass 'api' (agent-log-core.js:82-84, written ahead of time
  // for this item) — reuse logAgentRead exactly as the pass-through path
  // does, same swallow-everything discipline, same waitUntil scheduling.
  try {
    logAgentRead(request, apiResponse, env, ctx, { paymentStatus: core.mapPaymentStatus(paymentResult, gateApplies) });
  } catch (_err) {
    // never break serving — identical discipline to fetch()'s own try/catch above.
  }

  return apiResponse;
}

// ---------------------------------------------------------------------------
// 228: MCP server — hand-rolled JSON-RPC 2.0 over a single POST endpoint.
// Delegates every tool call to api-core.js via edge/mcp-core.js; owns only
// the transport concerns (HTTP method/status/CORS, JSON.parse of the raw
// body) exactly as handleApi() does for /api. See edge/MCP.md.
// ---------------------------------------------------------------------------

const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // backlog 234 (verifier round 1): same reasoning as API_CORS_HEADERS
  // above — a browser-origin agent calling a paid `tools/call` needs to
  // SEND `X-PAYMENT` and READ `X-PAYMENT-RESPONSE` back.
  'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT, Authorization, PAYMENT-REQUIRED',
  'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE, PAYMENT-REQUIRED, WWW-Authenticate',
};

/** Every /mcp JSON response is call-specific (a JSON-RPC result/error tied
 * to one request body) — never publicly cacheable, unlike /api's stable
 * 300s caching. */
function mcpJsonHeaders(extraHeaders) {
  return Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    MCP_CORS_HEADERS,
    extraHeaders || {}
  );
}

function mcpMethodNotAllowed(request, env, ctx) {
  const body = {
    error: 'method_not_allowed',
    message: 'This endpoint accepts POST (JSON-RPC 2.0 messages) and OPTIONS (CORS preflight) only. ' +
      'GET is not offered because this server never opens a server→client SSE stream (MCP\'s Streamable ' +
      'HTTP transport permits 405 in that case).',
  };
  const res = new Response(JSON.stringify(body), { status: 405, headers: mcpJsonHeaders() });
  try { logAgentRead(request, res, env, ctx); } catch (_err) { /* never break serving */ }
  return res;
}

/** Answers one /mcp request. OPTIONS is a pure CORS preflight — answered
 * without touching pool data. POST is the only method that speaks
 * JSON-RPC; every other method (GET included) is a 405.
 *
 * backlog 234 (spec 234), Territory note 2: a `tools/call` for a tool whose
 * underlying route classifies 'paid' gets the SAME payment check `/api`
 * applies, and on rejection the SAME transport-level 402 body
 * (`x402Core.buildChallenge()`'s own shape, literally the same function
 * /api calls) at HTTP status 402 — not a JSON-RPC-shaped error. Leaving
 * `/mcp` ungated would be a free bypass of the exact data
 * `/api/forever-number` charges for, since `forever_number` delegates to
 * that same route. `tools/list`, `initialize`, `ping`, notifications, and
 * any tool that isn't paid-tier stay open, ungated, exactly as before.
 *
 * FINDING 2 (verifier round 2, backlog 234) — DECLARED route vs DISPATCHED
 * pathname (RAZOR / detector-signal-coverage.md axis 7, one layer below the
 * round-1 defect on this same item): the tool's DECLARED `tool.route`
 * (classified via `x402Core.classifyMcpTool`) is only a LABEL a tool
 * author writes down — what actually gets served is whatever pathname
 * `tool.argsToRequest(args)` builds (edge/mcp-core.js's `handleToolsCall`,
 * the ONLY place a tool call is actually dispatched). Nothing tied the two
 * together: a `budget_helper`-shaped tool could declare `route:
 * '/api/pools'` (free) while its `argsToRequest` resolves a pathname of
 * `/api/forever-number` (paid) — verified: it served 200 with the full
 * paid body, gate ON, no payment. The gate below now classifies BOTH the
 * DECLARED route and the DISPATCHED pathname (via `apiCore.matchRouteId`
 * — the same live dispatch table `/api` itself walks, never a second
 * derivation) and gates if EITHER is paid — the STRICTER of the two, so
 * a mis-DECLARED tool (its `route` label disagreeing with what
 * `argsToRequest` actually dispatches) cannot be used to bypass or
 * over-charge. If `argsToRequest` throws, or its pathname resolves to no
 * real route (`matchRouteId` returns null — malformed args, an
 * unresolvable id, etc.), this falls back to the DECLARED classification
 * ONLY, rather than failing closed to "paid": a malformed-args call to a
 * FREE tool must still reach mcp-core.js's own `-32602` JSON-RPC
 * validation error, never get turned into an unrelated 402 — while any
 * tool that WOULD dispatch a paid pathname is gated no matter what its own
 * `route` field claims. See test_x402_core.js's mirror-of-dispatch section
 * and test_x402_gate.js's injected-tool non-vacuity section for the guards
 * that prove this.
 *
 * UNDOCUMENTED-UNTIL-NOW ASSUMPTION (verifier round 3, backlog 234, FINDING
 * 2): this probe calls `tool.argsToRequest(args)` here to DECIDE the gate;
 * mcp-core.js's `handleToolsCall` calls the SAME tool's `argsToRequest`
 * again, separately, to actually DISPATCH. The stricter-of rule above only
 * closes the mis-DECLARED-route case (`route` disagreeing with what
 * `argsToRequest` builds) — it silently assumes `argsToRequest` is a PURE
 * function that returns the same pathname/params both times it is called
 * with the same args. An impure `argsToRequest` (e.g. one that alternates
 * output across calls, or reads mutable state) could show this probe a
 * free pathname and the real dispatch a paid one, or vice versa, and this
 * gate has no way to detect that from here — it never sees the dispatch's
 * own call. That purity assumption is NOT enforced by anything in this
 * file; it is enforced, over the real shipped `mcp-core.js` `TOOLS`
 * population, by `test_x402_core.js`'s purity-guard section (calls
 * `argsToRequest` twice per tool with identical args and asserts the two
 * results agree, with a self-defeat case proving the assertion can fail).
 * Exploiting the gap requires committing an impure `argsToRequest` into
 * `TOOLS` — the same prerequisite as FINDING 2 itself. */
async function handleMcp(request, url, env, ctx) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return mcpMethodNotAllowed(request, env, ctx);
  }

  // JSON parsing is owned by THIS Worker layer, not edge/mcp-core.js (see
  // that file's header comment) — a body that isn't valid JSON can never
  // even be handed to handleMcpMessage, so the -32700 Parse error is raised
  // right here.
  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch (_err) {
    rawBody = '';
  }
  let message;
  try {
    if (rawBody.length === 0) throw new Error('empty request body');
    message = JSON.parse(rawBody);
  } catch (_err) {
    const parseErrorBody = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error: the request body is not valid JSON.' },
    };
    const parseErrRes = new Response(JSON.stringify(parseErrorBody), { status: 400, headers: mcpJsonHeaders() });
    try { logAgentRead(request, parseErrRes, env, ctx); } catch (_e) { /* never break serving */ }
    return parseErrRes;
  }

  // ---- x402 gate (tools/call on a paid tool, only) -----------------------
  const x402Config = x402Core.readConfig(env);
  let paymentResult = null; // set only when the gate actually applies
  let gateApplies = false;
  if (
    x402Config.enabled &&
    message && typeof message === 'object' && !Array.isArray(message) &&
    message.method === 'tools/call'
  ) {
    const toolName = message.params && message.params.name;
    const tool = (typeof toolName === 'string' && toolName.length > 0)
      ? mcpCore.findTool(toolName)
      : null;
    // The DECLARED classification — tool.route is a label, checked the
    // same way it always was.
    const declaredClassification = tool ? x402Core.classifyRoute(tool.route) : null;
    // The DISPATCHED classification — what argsToRequest() would actually
    // build and hand to apiCore.handleApiRequest, classified via the SAME
    // live dispatch table /api itself uses (apiCore.matchRouteId), never a
    // second guess. Best-effort: a throw or an unresolvable pathname
    // leaves this null, which is exactly the "fall back to declared only"
    // case the header comment above documents.
    let dispatchedClassification = null;
    if (tool) {
      try {
        const argsForDispatch = (message.params && message.params.arguments) || {};
        const dispatchedRequest = tool.argsToRequest(argsForDispatch);
        const dispatchedRouteId = apiCore.matchRouteId(dispatchedRequest && dispatchedRequest.pathname);
        dispatchedClassification = dispatchedRouteId ? x402Core.classifyRoute(dispatchedRouteId) : null;
      } catch (_argsErr) {
        dispatchedClassification = null;
      }
    }
    // The STRICTER of the two: if the dispatched pathname is paid, that IS
    // what's being charged for (use it — it's the real resource). Else if
    // only the declared route is paid, gate on that (a tool that would
    // dispatch free/unresolvable but still DECLARES itself paid must not
    // quietly become a free ride). Only when NEITHER is paid does the gate
    // stay off.
    const toolClassification = (dispatchedClassification && dispatchedClassification.tier === 'paid')
      ? dispatchedClassification
      : ((declaredClassification && declaredClassification.tier === 'paid') ? declaredClassification : null);
    if (toolClassification && toolClassification.tier === 'paid') {
      gateApplies = true;
      // The resource being purchased is the underlying REST route, not the
      // shared /mcp transport URL — many different tool calls share that
      // one URL, so the challenge/payment must key on the route the tool
      // actually delegates to (toolClassification.route, e.g.
      // "/api/forever-number"), same origin as this request.
      const resourceUrl = url.origin + toolClassification.route;
      const challenge = x402Core.buildChallenge({ routeId: toolClassification.route, resourceUrl: resourceUrl, config: x402Config });
      const paymentHeader = request.headers.get('X-PAYMENT');
      paymentResult = await x402Core.verifyPayment({ header: paymentHeader, challenge: challenge, config: x402Config, fetchImpl: fetch });
      if (!paymentResult.paid) {
        const challengeStr = JSON.stringify(challenge);
        const base64Challenge = toBase64Utf8(challengeStr);
        const challengeHeaders = {
          'PAYMENT-REQUIRED': base64Challenge,
          'WWW-Authenticate': 'X402 requirements="' + base64Challenge + '"',
        };
        const res402 = new Response(challengeStr, { status: 402, headers: mcpJsonHeaders(challengeHeaders) });
        try {
          logAgentRead(request, res402, env, ctx, { paymentStatus: core.mapPaymentStatus(paymentResult, true) });
        } catch (_e) { /* never break serving */ }
        return res402;
      }
    }
  }

  // Same pool-data source as /api — the EXISTING getPools() memo, no second
  // fetch path — and the same honest 503 shape on an upstream failure
  // (spec 228's Change section: "the same honest 503 shape 227 established,
  // carrying apiCore.buildRailsBlock()").
  let pools;
  try {
    pools = await getPools();
  } catch (_err) {
    const body = {
      error: 'upstream_unavailable',
      message: 'Could not fetch live pool data from yields.llama.fi right now; please try again shortly. ' +
        'This server never fabricates pool data, so a failed upstream fetch is reported honestly rather than ' +
        'served from stale/fake data.',
      rails: apiCore.buildRailsBlock(),
    };
    const errRes = new Response(JSON.stringify(body), { status: 503, headers: mcpJsonHeaders() });
    try {
      logAgentRead(request, errRes, env, ctx, { paymentStatus: core.mapPaymentStatus(paymentResult, gateApplies) });
    } catch (_e) { /* never break serving */ }
    return errRes;
  }

  // Defense in depth (same discipline as handleApi()'s own try/catch above):
  // mcpCore.handleMcpMessage is documented never to throw, but if some
  // undiscovered future bug escapes it anyway, this still answers with real
  // JSON instead of an unhandled exception (a Cloudflare 1101 error page).
  //
  // `pricing` (verifier round 2, backlog 234, FINDING 3): the SAME
  // already-computed `x402Config` this function's own gate above used —
  // never re-read from env, never a second derivation — threaded through
  // exactly like handleApi() already threads it to `apiCore.handleApiRequest`.
  // Without this, `explain_rails` (which delegates to `GET /api`) could
  // only ever see the DARK default, so MCP's own contract document could
  // falsely report `pricing.availability.enabled:false` while the real
  // gate was live and charging — the exact contradiction this finding
  // named. mcp-core.js stays pure: it takes this as an input, it never
  // reads `env` itself.
  let result;
  try {
    result = mcpCore.handleMcpMessage({ message, pools, pricing: { enabled: x402Config.enabled, mode: x402Config.mode } });
  } catch (_err) {
    const extractedId = (message && typeof message === 'object' && !Array.isArray(message) && 'id' in message)
      ? message.id
      : null;
    result = {
      status: 500,
      body: {
        jsonrpc: '2.0',
        id: extractedId,
        error: { code: -32603, message: 'This MCP handler failed unexpectedly while answering this request.' },
      },
    };
  }

  // A JSON-RPC notification (result.body === null) has no HTTP body at all
  // — same "204/202 preflight-shaped" treatment /api's OPTIONS 204 gets.
  const mcpExtraHeaders = (paymentResult && paymentResult.paid)
    ? { 'X-PAYMENT-RESPONSE': x402Core.paymentResponseHeader(paymentResult) }
    : null;
  const mcpResponse = (result.body === null)
    ? new Response(null, { status: result.status, headers: MCP_CORS_HEADERS })
    : new Response(JSON.stringify(result.body), { status: result.status, headers: mcpJsonHeaders(mcpExtraHeaders) });

  try {
    logAgentRead(request, mcpResponse, env, ctx, { paymentStatus: core.mapPaymentStatus(paymentResult, gateApplies) });
  } catch (_err) {
    // never break serving — identical discipline to handleApi()'s own try/catch above.
  }

  return mcpResponse;
}

/**
 * backlog 234 (spec 234, Territory note 4): attempts the extended
 * (12-column) INSERT first; if — and only if — it fails, falls back to the
 * byte-identical legacy 9-column statement. This is the load-bearing fix
 * for "the human provisions D1 by hand": if the Worker started issuing the
 * extended INSERT before the ALTER TABLE migration (edge/schema.sql) has
 * been run against the live database, EVERY insert would fail and 224/227's
 * whole telemetry stream would go silently dark (logging failures are
 * swallowed by design — see this file's own header comment — so there
 * would be no error to notice, just an empty table). Never throws past its
 * own two attempts; a failure of the LEGACY statement too (e.g. a genuine
 * D1 outage) propagates to the caller, which is `logAgentRead`'s own
 * swallow-everything wrapper below.
 */
async function insertRow(env, row) {
  try {
    await env.DB.prepare(INSERT_SQL_EXTENDED).bind(
      row.ts, row.path, row.ua, row.ua_family, row.accept, row.referer, row.status, row.bot_score, row.path_class,
      row.agent_identity, row.identity_status, row.payment_status
    ).run();
    return;
  } catch (_extendedErr) {
    // Extended insert failed — most likely the three new columns don't
    // exist yet on the live table (pre-migration). Fall through to the
    // legacy statement rather than losing the row entirely.
  }
  await env.DB.prepare(INSERT_SQL_LEGACY).bind(
    row.ts, row.path, row.ua, row.ua_family, row.accept, row.referer, row.status, row.bot_score, row.path_class
  ).run();
}

/**
 * Best-effort: classify the request and, if it's agent surface and a DB
 * binding exists, schedule (never await) an INSERT via ctx.waitUntil.
 * Any synchronous throw here (env.DB missing/broken, classifyRequest
 * throwing) propagates to the caller's try/catch in fetch()/handleApi()/
 * handleMcp() above, by design — this function does not double-guard that
 * synchronous prefix. Everything after it (identity verification, the
 * INSERT itself) runs inside the deferred `write` promise below, so it is
 * NEVER awaited before a response is returned — correctness (getting the
 * right row) without adding latency to what a visitor/agent receives (spec
 * 234: "never await [identity] on the free path in a way that adds latency
 * you can avoid").
 *
 * `extra.paymentStatus` (backlog 234, spec 234): the caller-computed
 * `core.mapPaymentStatus(...)` result for this request, or absent for the
 * plain pass-through path (non-/api, non-/mcp) — `core.buildRow()` itself
 * defaults an unrecognized/absent value to `'none'`.
 */
function logAgentRead(request, response, env, ctx, extra) {
  if (!env || !env.DB) return; // no binding configured (e.g. local/dev) — nothing to log

  const url = new URL(request.url);
  const accept = request.headers.get('accept') || '';
  const classification = core.classifyRequest({ pathname: url.pathname, accept });
  if (!classification) return; // not agent surface — nothing to log

  const status = response.status;
  // request.cf is a Cloudflare-only, best-effort property — read
  // defensively, since it's absent outside the real edge runtime (local
  // dev, this file's own tests) and Bot Management may not be on-plan.
  const botScore = request.cf && request.cf.botManagement ? request.cf.botManagement.score : null;
  const userAgent = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer') || null;
  const paymentStatus = (extra && extra.paymentStatus) || undefined;

  // backlog 234 (spec 234, Change §3): Web Bot Auth verification runs ONLY
  // for /api and /mcp requests (Territory note 6 — identity is telemetry,
  // it never unlocks paid data, so there is no reason to pay its cost on
  // any other path class). It is computed INSIDE this deferred promise
  // (never before `write` is scheduled), which is what keeps it off the
  // critical path — the response has already been built/returned by the
  // time this async function body ever runs.
  const needsIdentityCheck = classification.pathClass === 'api' || classification.pathClass === 'mcp';

  const write = Promise.resolve().then(async () => {
    let identity = { status: null, keyid: null };
    if (needsIdentityCheck) {
      try {
        identity = await webBotAuth.verifyRequestIdentity({
          request: request,
          keyring: webBotAuth.readKeyring(env),
          nowSeconds: Math.floor(Date.now() / 1000),
        });
      } catch (_identityErr) {
        // Never let an identity-verification failure break logging — the
        // row still lands, just without an identity verdict (honest null,
        // not a fabricated 'unverified').
        identity = { status: null, keyid: null };
      }
    }

    const row = core.buildRow({
      tsSeconds: Math.floor(Date.now() / 1000),
      pathname: url.pathname,
      userAgent: userAgent,
      accept: accept,
      referer: referer,
      status: status,
      botScore: botScore,
      agentIdentity: identity.keyid,
      identityStatus: identity.status,
      paymentStatus: paymentStatus,
    });

    await insertRow(env, row);
  }).catch(() => {});
  // Wrapped in Promise.resolve().then(...) (rather than an immediately-
  // invoked async function) so that this shape matches the pre-234 file's
  // own documented reasoning: even were something above to throw
  // synchronously in a future edit, it would still be caught by the
  // trailing .catch and never surface as an unhandled rejection under
  // waitUntil.

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(write);
  }
  // If ctx/ctx.waitUntil is unavailable for any reason, `write` still runs
  // (it's already a live promise with its own .catch) — it just isn't
  // guaranteed to finish before the isolate is recycled, which is an
  // acceptable, honest degradation, never a thrown error.
}
