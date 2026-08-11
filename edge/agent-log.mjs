/*
 * Cloudflare Worker: edge agent-read telemetry (backlog 224, spec 224) +
 * public read-only Yield API (backlog 227, spec 227), same Worker, one
 * deploy — spec 227's Change section: "same Worker as 224's logger".
 *
 * API DISPATCH (227): `fetch()` checks `/api` and `/api/*` FIRST, before
 * ANYTHING else runs — including the pass-through line below. This is an
 * ADDITIONAL branch, not a restructuring of the existing pass-through path:
 * every other URL falls through to the exact same
 * `const response = await fetch(request); return response;` this file has
 * always run, byte-for-byte, so the pre-227 "PASS-THROUGH FIRST" contract
 * (see below) holds for every non-`/api` request BY CONSTRUCTION — asserted
 * by test_api_worker.js via Response-object identity, the same technique
 * test_agent_log.js already uses for its own byte-parity cases. `/api`
 * requests never reach the pass-through line at all: they are answered
 * entirely from edge/api-core.js (pure, railed) plus one live fetch of
 * https://yields.llama.fi/pools (edge-cached + in-isolate memoized — see
 * getPools() below), never from origin (Vercel). A pool-data fetch failure
 * returns a 503 JSON carrying api-core.js's own `rails` block — never a
 * thrown error, never the pass-through path. Full contract: edge/API.md.
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

const INSERT_SQL =
  'INSERT INTO agent_reads (ts, path, ua, ua_family, accept, referer, status, bot_score, path_class) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

export default {
  async fetch(request, env, ctx) {
    // 227: dispatch /api and /api/* to the API handler BEFORE the
    // pass-through — see this file's header comment. `new URL(request.url)`
    // only READS request.url; it cannot affect the pass-through fetch()
    // below in any way, so this check is safe to run unconditionally.
    const url = new URL(request.url);
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
  'Access-Control-Allow-Headers': 'Content-Type',
};

// In-isolate memo (module-level — persists for the isolate's lifetime,
// across requests, exactly like a normal Worker global). Cleared implicitly
// by TTL expiry, never by a failed fetch (a stale-but-present memo is
// preferred over hammering the upstream on every failure — the NEXT
// request past the TTL will retry). `__resetPoolsMemoForTests` exists ONLY
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
 * so no method-specific branching beyond OPTIONS is needed). */
async function handleApi(request, url, env, ctx) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: API_CORS_HEADERS });
  }

  const responseHeaders = Object.assign(
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=' + POOLS_CACHE_TTL_SECONDS,
      'X-Defi-Garden-Api-Version': apiCore.API_VERSION,
    },
    API_CORS_HEADERS
  );

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
    const errRes = new Response(JSON.stringify(body), { status: 503, headers: responseHeaders });
    try { logAgentRead(request, errRes, env, ctx); } catch (_e) { /* never break serving — see logAgentRead's own header note */ }
    return errRes;
  }

  const result = apiCore.handleApiRequest({
    pathname: url.pathname,
    searchParams: url.searchParams,
    pools: pools,
  });

  const apiResponse = new Response(JSON.stringify(result.body), { status: result.status, headers: responseHeaders });

  // 227 acceptance: "Keep the existing agent-read logging behavior working
  // for /api paths too." classifyRequest() already classifies every /api
  // path as pathClass 'api' (agent-log-core.js:82-84, written ahead of time
  // for this item) — reuse logAgentRead exactly as the pass-through path
  // does, same swallow-everything discipline, same waitUntil scheduling.
  try {
    logAgentRead(request, apiResponse, env, ctx);
  } catch (_err) {
    // never break serving — identical discipline to fetch()'s own try/catch above.
  }

  return apiResponse;
}

/**
 * Best-effort: classify the request and, if it's agent surface and a DB
 * binding exists, schedule (never await) an INSERT via ctx.waitUntil.
 * Any synchronous throw here (env.DB missing/broken, classifyRequest
 * throwing, prepare()/bind() throwing) propagates to the caller's try/catch
 * in fetch() above, by design — this function does not double-guard that.
 */
function logAgentRead(request, response, env, ctx) {
  if (!env || !env.DB) return; // no binding configured (e.g. local/dev) — nothing to log

  const url = new URL(request.url);
  const accept = request.headers.get('accept') || '';
  const classification = core.classifyRequest({ pathname: url.pathname, accept });
  if (!classification) return; // not agent surface — nothing to log

  const row = core.buildRow({
    tsSeconds: Math.floor(Date.now() / 1000),
    pathname: url.pathname,
    userAgent: request.headers.get('user-agent') || '',
    accept,
    referer: request.headers.get('referer') || null,
    status: response.status,
    // request.cf is a Cloudflare-only, best-effort property — read
    // defensively, since it's absent outside the real edge runtime (local
    // dev, this file's own tests) and Bot Management may not be on-plan.
    botScore: request.cf && request.cf.botManagement ? request.cf.botManagement.score : null,
  });

  const stmt = env.DB.prepare(INSERT_SQL).bind(
    row.ts, row.path, row.ua, row.ua_family, row.accept, row.referer, row.status, row.bot_score, row.path_class
  );

  // Wrapped in Promise.resolve().then(...) so that even a SYNCHRONOUS throw
  // from stmt.run() (not just an async rejection) is caught by the trailing
  // .catch and never surfaces as an unhandled rejection under waitUntil.
  const write = Promise.resolve().then(() => stmt.run()).catch(() => {});

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(write);
  }
  // If ctx/ctx.waitUntil is unavailable for any reason, `write` still runs
  // (it's already a live promise with its own .catch) — it just isn't
  // guaranteed to finish before the isolate is recycled, which is an
  // acceptable, honest degradation, never a thrown error.
}
