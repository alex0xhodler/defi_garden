/*
 * Pure, network/Worker-free core for the public read-only Yield API
 * (backlog 227, spec 227). CommonJS, mirroring edge/agent-log-core.js's
 * shape exactly, for the same reason: `test_api_worker.js` (plain Node, no
 * Wrangler) must be able to `require()` this file directly, and
 * `edge/agent-log.mjs` (ESM) imports it the same way it already imports
 * `./agent-log-core.js` — Wrangler's bundler handles CJS/ESM interop, and
 * Node's native ESM loader does too (already proven by agent-log-core.js's
 * own `import core from './agent-log-core.js'`).
 *
 * This file answers "what does the API say" with NO side effects: no
 * fetch, no D1, no Cloudflare API, no Date-dependent branching outside the
 * one documented exception below. `handleApiRequest({ pathname,
 * searchParams, pools })` is a pure function of its three inputs — the
 * Worker (edge/agent-log.mjs) is responsible for everything impure: fetching
 * live pool data from yields.llama.fi (with edge caching + an in-isolate
 * memo), turning `{ status, body }` into a real Response with CORS/
 * Cache-Control/version headers, and serving a 503 (carrying this module's
 * own `rails` shape) when that fetch fails.
 *
 * RAILS — single source, never re-implemented (RAZOR / item 212's mirror
 * rule): this file `require()`s `../trust-rails.js` for both
 * `APY_SANITY_LIMIT` and `DEFAULT_MIN_TVL` and declares NEITHER numeric
 * literal itself. (Grep-provable — see product-loop-kit/specs/227-notes.md
 * for the exact command. `DEFAULT_LIMIT`/`MAX_LIMIT` below are a DIFFERENT,
 * API-shape concern — the page-size defaults for `/api/pools` — not trust
 * rails, and are declared here because nothing else owns them.)
 *
 * TOTAL APY — also never re-implemented as a THIRD copy of the formula.
 * app.js computes total APY as `(pool.apyBase || 0) + (pool.apyReward || 0)`
 * at every call site that touches the sanity limit (confirmed identical at
 * app.js:1965, :2066, :2166, :2524, :2930, :3694 this session — there is no
 * `apy` field on the pool objects this API reads). `totalApy()` below is
 * that exact expression, so it is the same computation, not a rewrite of it.
 *
 * FOREVER-NUMBER MATH — same discipline, taken one step further: rather
 * than hand-copying planner.js:162's `foreverNumber(monthlyTarget,
 * annualRatePct)` formula (which would create a THIRD place that formula
 * lives, free to drift from the other two), this file `require()`s
 * `../planner.js` directly and calls its exported `foreverNumber`.
 * planner.js already carries a UMD guard (`if (typeof module !== 'undefined'
 * && module.exports) module.exports = api;`) making it safely
 * `require()`-able in plain Node with no React/DOM present — confirmed this
 * session (`node -e "require('./planner.js').foreverNumber(100, 5)"` →
 * `24000`) and already relied on by `test_planner.js`. This is a read-only
 * require: planner.js itself is never written to, and stays off every
 * `git diff --stat` this item produces.
 *
 * ROUTES (v0, spec 227's list, plus /api/pricing added by backlog 234):
 *   GET /api                    — this contract document
 *   GET /api/health             — liveness + pool-data freshness
 *   GET /api/pools              — railed pool list (token/chain/minTvl/limit/project)
 *   GET /api/pools/:id          — one pool by DefiLlama `pool` id
 *   GET /api/pricing            — the machine-readable agentic-commerce pricing document
 *   GET /api/forever-number     — SUBSCRIPTION-archetype math (?monthly=&apy=), PAID
 *   unknown /api/*              — 404 JSON, still carrying `rails` + `endpoints`
 */

'use strict';

const trustRails = require('../trust-rails.js');
const planner = require('../planner.js');

const APY_SANITY_LIMIT = trustRails.APY_SANITY_LIMIT;
const DEFAULT_MIN_TVL = trustRails.DEFAULT_MIN_TVL;

// Contract version — carried in the /api document body and (by the Worker)
// in the `X-Defi-Garden-Api-Version` response header. Bump on any
// backward-incompatible shape change to a response this doc describes.
const API_VERSION = '0.1.0';

// /api/pools pagination defaults. Not trust rails (see header comment) —
// an API-shape concern with no app.js analogue to mirror.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ---------------------------------------------------------------------------
// 1. Rail predicates — the exact arithmetic, applied everywhere below.
// ---------------------------------------------------------------------------

/** Total APY = apyBase + apyReward, treating a missing/null value as 0 —
 * byte-identical to app.js's own expression at every site that touches
 * APY_SANITY_LIMIT (see header comment for the exact line numbers). */
function totalApy(pool) {
  return (Number(pool && pool.apyBase) || 0) + (Number(pool && pool.apyReward) || 0);
}

/** A pool is anomalous when its total APY exceeds the sanity limit — never
 * admitted to a list response; on the single-pool route it is returned but
 * flagged (see handlePoolById). */
function isAnomalous(pool) {
  return totalApy(pool) > APY_SANITY_LIMIT;
}

/** Whether `pool` meets a given USD TVL floor. Missing/non-numeric tvlUsd
 * reads as 0 (fails the floor), never as "unknown, let it through". */
function meetsFloor(pool, minTvl) {
  return (Number(pool && pool.tvlUsd) || 0) >= minTvl;
}

// ---------------------------------------------------------------------------
// 2. The `rails` block — present on EVERY response with a body, success or
//    error (spec 227 acceptance: "including 404/503"). Body-less responses
//    (the OPTIONS 204 preflight, handled outside this module) carry no
//    body and therefore no rails block. `minTvl` reflects the
//    EFFECTIVE floor for the response it's attached to (the request's own
//    clamped-up value on /api/pools, DEFAULT_MIN_TVL everywhere else).
// ---------------------------------------------------------------------------

function buildRailsBlock(effectiveMinTvl) {
  const minTvl = Number.isFinite(effectiveMinTvl) ? effectiveMinTvl : DEFAULT_MIN_TVL;
  return {
    apySanityLimit: APY_SANITY_LIMIT,
    minTvl: minTvl,
    apySanityLimitExplanation:
      'Any pool whose total APY (apyBase + apyReward) exceeds ' + APY_SANITY_LIMIT + '% is treated ' +
      'as anomalous. It is excluded from every /api/pools list response; on /api/pools/:id it is still ' +
      'returned, but carries "anomalous": true plus a reason string, so an anomalous rate can never reach ' +
      'a caller presented as sane.',
    minTvlExplanation:
      'Every /api/pools list response applies a minimum pool TVL of $' + minTvl.toLocaleString('en-US') + '. ' +
      'A caller-supplied minTvl query param may only RAISE this floor, never lower it — a value below the ' +
      '$' + DEFAULT_MIN_TVL.toLocaleString('en-US') + ' default is clamped up to it, and the response reports ' +
      '"railsApplied": { "minTvlClamped": true }.',
  };
}

// ---------------------------------------------------------------------------
// 3. ROUTES — the ONE declarative dispatch table (backlog 234, verifier
//    round 1 fix — see the root-cause note below). Every route this API
//    serves — its id, HTTP method, description, optional documented params,
//    a `match(path)` predicate, and the `handle(ctx)` function that answers
//    it — lives HERE and ONLY here. `handleApiRequest` (section 10) does
//    nothing but walk this table; `matchRouteId` (also section 10) walks the
//    EXACT SAME table to answer "which route, if any, does this path
//    resolve to", with no fetch/pool access at all. `ENDPOINTS` (the public
//    metadata list `/api`'s contract document and the unknown-route 404 body
//    both carry — spec 227) is DERIVED from ROUTES below, never a second,
//    independently-maintained list.
//
//    ROOT-CAUSE NOTE (verifier round 1, backlog 234): before this table
//    existed, `handleApiRequest` was a chain of bare
//    `if (path === '/some/route') return {...}` branches, and
//    `edge/x402-core.js`'s `matchRoute()` derived its OWN static id list
//    from `PRICE_SCHEDULE`'s own keys — a route added directly to that
//    if-chain (e.g. a new computed-KPI endpoint) was invisible to
//    `ENDPOINTS`, invisible to `matchRoute()`, and therefore classified
//    `null` ("no such resource") by the payment gate instead of hitting
//    `classifyRoute()`'s default-paid fallback — DEFAULT_TIER = 'paid' could
//    never fire on a route added this way, so it shipped free by
//    construction despite every test staying green (the whole population
//    those tests iterate is ENDPOINTS/PRICE_SCHEDULE, which the new route
//    was never added to). With ROUTES as the single source, `handleApiRequest`
//    has no dispatch code outside this table, so a new route can only ever
//    be added AS a ROUTES entry — which means it automatically appears in
//    `ENDPOINTS` (derived below) and is automatically recognized by
//    `matchRouteId`, and therefore by `x402-core.js`'s `classifyRoute()`
//    default-paid fallback, since that file's `matchRoute` now delegates to
//    `matchRouteId` directly instead of re-deriving its own id list (see
//    that file's own header comment). See test_x402_core.js's three-way
//    mirror section and test_x402_gate.js's injected-route non-vacuity
//    section for the guards that prove this.
// ---------------------------------------------------------------------------

const POOL_ID_RE = /^\/api\/pools\/([^/]+)$/;

/** Resolves the `:id` segment for a path already confirmed to match
 * POOL_ID_RE, or null if it somehow doesn't (defensive; `handle` below only
 * calls this after `match` has already confirmed a match). */
function resolvePoolIdFromPath(path) {
  const m = POOL_ID_RE.exec(path);
  if (!m) return null;
  // `decodeURIComponent` throws `URIError: URI malformed` on a bare "%", an
  // incomplete percent-escape, or an invalid hex pair (e.g. "100%", "%zz",
  // "%E0%A4%A") — and `new URL(request.url).pathname` (the caller's usual
  // source for `pathname`) does NOT reject or decode these; it preserves
  // them verbatim, so a hostile/malformed id routinely reaches this line.
  // Falling back to the raw, still-percent-encoded segment on a decode
  // failure never risks matching a real pool id (DefiLlama pool ids are
  // plain UUID-shaped strings that never contain "%"), so this simply flows
  // into handlePoolById's existing 404-with-rails path instead of throwing.
  try {
    return decodeURIComponent(m[1]);
  } catch (_err) {
    return m[1];
  }
}

const ROUTES = [
  {
    id: '/api',
    method: 'GET',
    description: 'This contract document: version, endpoints, rails, data source.',
    match: function (path) { return path === '/api'; },
    handle: function (ctx) { return { status: 200, body: buildContractDoc(ctx.pricing) }; },
  },
  {
    id: '/api/health',
    method: 'GET',
    description: 'Liveness + railed pool-data freshness check.',
    match: function (path) { return path === '/api/health'; },
    handle: function (ctx) { return { status: 200, body: buildHealth(ctx.poolList) }; },
  },
  {
    id: '/api/pools',
    method: 'GET',
    description: 'Railed pool list.',
    params: {
      token: 'optional — case-insensitive substring match against pool.symbol',
      chain: 'optional — case-insensitive exact match against pool.chain',
      project: 'optional — case-insensitive exact match against pool.project',
      minTvl: 'optional USD floor; may only RAISE the default floor, never lower it (clamps up)',
      limit: 'optional; default ' + DEFAULT_LIMIT + ', max ' + MAX_LIMIT + ' (values above the max are clamped down)',
    },
    match: function (path) { return path === '/api/pools'; },
    handle: function (ctx) { return { status: 200, body: buildPoolsList(ctx.poolList, ctx.searchParams) }; },
  },
  {
    id: '/api/pools/:id',
    method: 'GET',
    description: 'One pool by its DefiLlama `pool` id.',
    match: function (path) { return POOL_ID_RE.test(path); },
    handle: function (ctx) { return handlePoolById(ctx.poolList, resolvePoolIdFromPath(ctx.path)); },
  },
  {
    id: '/api/pricing',
    method: 'GET',
    description: 'The machine-readable agentic-commerce pricing document (backlog 234): which routes/MCP ' +
      'tools are free vs. paid, why, and the current enabled/mode state. Reading this document is itself ' +
      'always free — an agent must be able to discover what costs money without first probing a route and ' +
      'getting a 402.',
    match: function (path) { return path === '/api/pricing'; },
    handle: function (ctx) { return buildPricingRoute(ctx.pricing); },
  },
  {
    id: '/api/forever-number',
    method: 'GET',
    description: 'Capital whose yield alone pays a recurring monthly bill forever (the SUBSCRIPTION-archetype math).',
    params: {
      monthly: 'required — USD/month the capital must cover',
      apy: 'optional annual rate, percent; when omitted, a TVL-weighted blended rate is derived from the ' +
        'railed pool set (never a hand-picked pool)',
    },
    match: function (path) { return path === '/api/forever-number'; },
    handle: function (ctx) { return handleForeverNumber(ctx.searchParams, ctx.poolList); },
  },
];

/** ENDPOINTS — the single list shared by the /api contract document AND the
 * unknown-route 404 body (spec 227: 404s carry "an endpoints list").
 * DERIVED from ROUTES above, never a second hand-typed list — see ROUTES'
 * own header comment for why this is the load-bearing fix. */
const ENDPOINTS = ROUTES.map(function (route) {
  const entry = { method: route.method, path: route.id, description: route.description };
  if (route.params) entry.params = route.params;
  return entry;
});

// ---------------------------------------------------------------------------
// 4. /api — the contract document.
// ---------------------------------------------------------------------------

/** Builds the `pricing` block on the `/api` contract document (backlog 234,
 * spec 234 §2: the pricing doc must be discoverable "without a probe
 * request"). DERIVED from x402-core.js's `PRICE_SCHEDULE` via the same lazy
 * `require()` discipline `buildPricingRoute()` below already uses (see its
 * comment, and the module header's circular-require explanation) — never a
 * second, hand-typed guess at the free/paid split. Deliberately small: a
 * pointer at `/api/pricing` plus the derived route lists, not a second copy
 * of the pricing document itself (that document is `buildPricingRoute()`'s
 * job). `pricingState` is the same optional `{ enabled, mode }` shape
 * `request.pricing` carries; absent/undefined is treated as fully
 * disabled/"dark", exactly like `buildPricingRoute()` — this function must
 * never assume a state nobody told it about. */
function buildContractDocPricingBlock(pricingState) {
  const x402Core = require('./x402-core.js');
  const state = pricingState || {};
  const enabled = state.enabled === true;
  const mode = state.mode === 'live' ? 'live' : 'test';
  const freeRoutes = x402Core.freeRoutes().slice().sort();
  const paidRoutes = Object.keys(x402Core.PRICE_SCHEDULE)
    .filter(function (routeId) { return x402Core.PRICE_SCHEDULE[routeId].tier === 'paid'; })
    .sort();
  return {
    document: '/api/pricing',
    boundary: 'Current APY data (GET /api/pools, GET /api/pools/:id) is free; the historical series and ' +
      'every other computed KPI (forever-number math today, more over time) is paid — see GET /api/pricing ' +
      'for the full machine-readable schedule and reasons.',
    freeRoutes: freeRoutes,
    paidRoutes: paidRoutes,
    availability: { enabled: enabled, mode: mode },
  };
}

function buildContractDoc(pricingState) {
  return {
    name: 'DeFi Garden read-only Yield API',
    version: API_VERSION,
    description:
      'A railed, self-describing, read-only JSON API over live DefiLlama pool data. Every number this API ' +
      'returns has already passed the same trust rails DeFi Garden\'s analytics app applies — an anomaly ' +
      'exclusion and a TVL floor — sourced from one shared module (trust-rails.js), never re-implemented ' +
      'here. See the "rails" object on every response, including this one.',
    dataSource: {
      upstream: 'https://yields.llama.fi/pools',
      attribution: 'Pool data is DefiLlama\'s; this API adds curation (the rails) on top of it, not new data.',
      cacheTtlSeconds: 300,
    },
    endpoints: ENDPOINTS,
    rails: buildRailsBlock(DEFAULT_MIN_TVL),
    pricing: buildContractDocPricingBlock(pricingState),
  };
}

// ---------------------------------------------------------------------------
// 5. /api/health.
// ---------------------------------------------------------------------------

function buildHealth(poolList) {
  const railedCount = poolList.reduce(function (n, p) {
    return (meetsFloor(p, DEFAULT_MIN_TVL) && !isAnomalous(p)) ? n + 1 : n;
  }, 0);
  return {
    ok: true,
    version: API_VERSION,
    poolsAvailable: railedCount,
    // The one wall-clock read in this otherwise-pure module — see the
    // header's "FOREVER-NUMBER MATH" note's sibling concern: `generatedAt`
    // here is response-build time, not an input the caller supplies, and
    // no OTHER behavior in this file depends on it. Tests assert it's a
    // valid, recent ISO timestamp, never an exact value.
    generatedAt: new Date().toISOString(),
    rails: buildRailsBlock(DEFAULT_MIN_TVL),
  };
}

// ---------------------------------------------------------------------------
// 6. /api/pools — railed list, with token/chain/project/minTvl/limit params.
// ---------------------------------------------------------------------------

function getParam(searchParams, name) {
  if (!searchParams || typeof searchParams.get !== 'function') return null;
  const v = searchParams.get(name);
  return (v === null || v === undefined || v === '') ? null : v;
}

/** Parses `minTvl`. Absent/invalid -> not provided (default floor, not
 * clamped). A provided-but-lower-than-default value is still returned
 * (the CALLER decides whether that counts as "clamped", since the caller
 * also needs to know the raw requested value to report it accurately). */
function parseMinTvlParam(searchParams) {
  const raw = getParam(searchParams, 'minTvl');
  if (raw === null) return { provided: false, value: DEFAULT_MIN_TVL };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { provided: false, value: DEFAULT_MIN_TVL };
  return { provided: true, value: n };
}

/** Parses `limit`. Absent/invalid/non-positive -> DEFAULT_LIMIT. Above
 * MAX_LIMIT -> clamped down to MAX_LIMIT (the response reports this via
 * railsApplied.limitClamped). */
function parseLimitParam(searchParams) {
  const raw = getParam(searchParams, 'limit');
  if (raw === null) return { requested: null, value: DEFAULT_LIMIT, clamped: false };
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return { requested: raw, value: DEFAULT_LIMIT, clamped: false };
  if (n > MAX_LIMIT) return { requested: raw, value: MAX_LIMIT, clamped: true };
  return { requested: raw, value: n, clamped: false };
}

/** Projects a raw snapshot/live pool onto the fields this API returns for
 * list + single-pool responses, adding the derived `totalApy`. Never
 * widens beyond what the pool object actually carries (missing optional
 * fields surface as null, mirroring generate-pools-snapshot.js's
 * "null preserved, absent key omitted becomes null" discipline). */
function projectPool(pool) {
  return {
    pool: pool.pool,
    chain: pool.chain,
    project: pool.project,
    symbol: pool.symbol,
    tvlUsd: (Number(pool.tvlUsd) || 0),
    apyBase: (pool.apyBase === undefined ? null : pool.apyBase),
    apyReward: (pool.apyReward === undefined ? null : pool.apyReward),
    totalApy: totalApy(pool),
    apyMean30d: (pool.apyMean30d === undefined ? null : pool.apyMean30d),
    poolMeta: (pool.poolMeta === undefined ? null : pool.poolMeta),
    exposure: (pool.exposure === undefined ? null : pool.exposure),
    ilRisk: (pool.ilRisk === undefined ? null : pool.ilRisk),
    url: (pool.url === undefined ? null : pool.url),
  };
}

function buildPoolsList(poolList, searchParams) {
  const minTvlParam = parseMinTvlParam(searchParams);
  const effectiveMinTvl = Math.max(DEFAULT_MIN_TVL, minTvlParam.value);
  const minTvlClamped = minTvlParam.provided && minTvlParam.value < DEFAULT_MIN_TVL;

  const limitParam = parseLimitParam(searchParams);

  const token = getParam(searchParams, 'token');
  const chain = getParam(searchParams, 'chain');
  const project = getParam(searchParams, 'project');

  let filtered = poolList.filter(function (p) {
    return meetsFloor(p, effectiveMinTvl) && !isAnomalous(p);
  });
  if (chain !== null) {
    const chainLower = chain.toLowerCase();
    filtered = filtered.filter(function (p) { return String(p.chain || '').toLowerCase() === chainLower; });
  }
  if (project !== null) {
    const projectLower = project.toLowerCase();
    filtered = filtered.filter(function (p) { return String(p.project || '').toLowerCase() === projectLower; });
  }
  if (token !== null) {
    const tokenUpper = token.toUpperCase();
    filtered = filtered.filter(function (p) { return String(p.symbol || '').toUpperCase().indexOf(tokenUpper) !== -1; });
  }

  // Deterministic ordering (highest TVL first) so pagination/limit behavior
  // is reproducible — no route in this API ever depends on upstream array order.
  filtered.sort(function (a, b) { return (Number(b.tvlUsd) || 0) - (Number(a.tvlUsd) || 0); });

  const totalMatched = filtered.length;
  const page = filtered.slice(0, limitParam.value).map(projectPool);

  return {
    pools: page,
    count: totalMatched,
    returned: page.length,
    railsApplied: {
      minTvl: effectiveMinTvl,
      minTvlClamped: minTvlClamped,
      limit: limitParam.value,
      limitClamped: limitParam.clamped,
    },
    rails: buildRailsBlock(effectiveMinTvl),
  };
}

// ---------------------------------------------------------------------------
// 7. /api/pools/:id — single pool, anomaly-flagged rather than excluded.
// ---------------------------------------------------------------------------

function handlePoolById(poolList, id) {
  const pool = poolList.find(function (p) { return p && p.pool === id; });
  if (!pool) {
    return {
      status: 404,
      body: {
        error: 'not_found',
        message: 'No pool with id "' + id + '".',
        rails: buildRailsBlock(DEFAULT_MIN_TVL),
      },
    };
  }

  const anomalous = isAnomalous(pool);
  const belowMinTvl = !meetsFloor(pool, DEFAULT_MIN_TVL);
  const body = projectPool(pool);
  body.anomalous = anomalous;
  body.reason = anomalous
    ? ('Total APY (' + totalApy(pool).toFixed(2) + '%) exceeds the ' + APY_SANITY_LIMIT + '% sanity limit — ' +
       'this pool is excluded from every /api/pools list response and should be treated as unreliable.')
    : null;
  // Extra transparency beyond the spec's literal ask (which only requires
  // the anomaly flag here) — never REQUIRED to hide this pool, but a caller
  // that looked it up by id deserves to know it wouldn't have surfaced in
  // /api/pools either. Never weakens the floor: the pool is still returned,
  // just honestly labeled, exactly as the anomaly flag is.
  body.belowMinTvl = belowMinTvl;
  body.belowMinTvlReason = belowMinTvl
    ? ('TVL ($' + (Number(pool.tvlUsd) || 0).toLocaleString('en-US') + ') is below the $' +
       DEFAULT_MIN_TVL.toLocaleString('en-US') + ' floor DeFi Garden applies to /api/pools list results; ' +
       'returned here only because it was requested directly by id.')
    : null;
  body.rails = buildRailsBlock(DEFAULT_MIN_TVL);

  return { status: 200, body: body };
}

// ---------------------------------------------------------------------------
// 8. /api/forever-number — mirrors planner.js:162 via a direct require,
//    never a re-implementation (see header comment).
// ---------------------------------------------------------------------------

/** TVL-weighted average total APY across an already-railed pool set. Choice
 * of weighting (documented in product-loop-kit/specs/227-notes.md): a plain
 * mean would let a single tiny, high-APY pool skew the "blended" rate an
 * agent might finance a real plan against; weighting by TVL favors the rate
 * capital actually earns at scale, the same intuition planner.js's own
 * blendedApy() serves (a curated-set MEDIAN) for a *rendered* headline rate.
 * Returns 0 (not financeable) for an empty/zero-TVL set — never a fake rate. */
function blendedRate(railedPools) {
  if (!railedPools || !railedPools.length) return 0;
  let tvlSum = 0;
  let weighted = 0;
  for (let i = 0; i < railedPools.length; i++) {
    const p = railedPools[i];
    const tvl = Number(p.tvlUsd) || 0;
    weighted += totalApy(p) * tvl;
    tvlSum += tvl;
  }
  if (tvlSum <= 0) return 0;
  return weighted / tvlSum;
}

function handleForeverNumber(searchParams, poolList) {
  const monthlyRaw = getParam(searchParams, 'monthly');
  const monthly = monthlyRaw === null ? NaN : Number(monthlyRaw);
  if (!Number.isFinite(monthly) || monthly <= 0) {
    return {
      status: 400,
      body: {
        error: 'bad_request',
        message: 'Query param "monthly" is required and must be a positive number (USD/month).',
        rails: buildRailsBlock(DEFAULT_MIN_TVL),
      },
    };
  }

  const apyRaw = getParam(searchParams, 'apy');
  let apyPct;
  let apySource;
  if (apyRaw !== null) {
    const parsed = Number(apyRaw);
    if (!Number.isFinite(parsed)) {
      return {
        status: 400,
        body: {
          error: 'bad_request',
          message: 'Query param "apy", when given, must be a number (annual rate, percent).',
          rails: buildRailsBlock(DEFAULT_MIN_TVL),
        },
      };
    }
    apyPct = parsed;
    apySource = 'param';
  } else {
    const railed = poolList.filter(function (p) { return meetsFloor(p, DEFAULT_MIN_TVL) && !isAnomalous(p); });
    apyPct = blendedRate(railed);
    apySource = 'blended';
  }

  // planner.js:162 — foreverNumber(monthlyTarget, annualRatePct): rate =
  // annualRatePct/100; rate<=0 -> Infinity ("not financeable"); else
  // monthlyTarget*12/rate. Called directly, not re-derived.
  const raw = planner.foreverNumber(monthly, apyPct);
  const financeable = Number.isFinite(raw);

  return {
    status: 200,
    body: {
      monthly: monthly,
      apyPct: apyPct,
      apySource: apySource,
      financeable: financeable,
      foreverNumber: financeable ? raw : null,
      notFinanceableReason: financeable
        ? null
        : (apyPct <= 0
            ? ('An annual rate of ' + apyPct + '% cannot fund a recurring bill (rate must be > 0) — no amount ' +
               'of capital produces positive monthly yield at that rate.')
            : ('The capital required to fund $' + monthly + '/month at ' + apyPct + '% annually exceeds the ' +
               'representable number range (monthly*12/rate overflowed) — the rate itself is positive and ' +
               'valid, this input combination just has no finite answer.')),
      rails: buildRailsBlock(DEFAULT_MIN_TVL),
    },
  };
}

// ---------------------------------------------------------------------------
// 8b. /api/pricing (backlog 234, spec 234) — the machine-readable pricing
//    document, generated by x402-core.js's `buildPricingDoc()` from
//    PRICE_SCHEDULE. `/api/pricing` IS listed in `ENDPOINTS` above (see
//    item 234's follow-up fix, product-loop-kit/specs/234-notes.md
//    "Deviation 1 — reversed"): an earlier build of this item deliberately
//    left it out of `ENDPOINTS` to dodge a hardcoded `.concat(['/api/pricing'])`
//    exception literal in test_x402_core.js's mirror test — that was the
//    wrong trade (spec 234 §2 requires the pricing doc be discoverable
//    "without a probe request", and `GET /api` — the contract document a
//    caller reads first — had no mention of pricing at all). The mirror
//    test itself was fixed instead, to assert genuine set equality against
//    the real `ENDPOINTS` table with no exception literal, so the route
//    could be added here honestly.
//
// Reaches x402-core.js/mcp-core.js via a LAZY `require()` inside the
// function body below, never at this file's top level. Both of those files
// already `require('./api-core.js')` at THEIR top level; a top-level
// `require()` back from here would create a circular require that
// CommonJS's `module.exports = {...}` (whole-object reassignment, the
// pattern every file in this trio uses) resolves incorrectly — whichever
// side captures the reference first keeps a stale, empty `{}` forever, since
// reassignment doesn't update an already-captured reference. A LAZY require,
// invoked only when `/api/pricing` is actually dispatched (i.e., only after
// the entire static require graph that got this file loaded has already
// finished), never observes a partially-loaded module and is safe.
// ---------------------------------------------------------------------------

/** `pricingState` is the `req.pricing` field `handleApiRequest` receives
 * (see its own header) — `{ enabled, mode }` as computed by the Worker via
 * `x402Core.readConfig(env)`, or absent/undefined on any caller that hasn't
 * wired x402 at all (this file's own tests, MCP's `explain_rails`-style
 * delegation, etc.), in which case this treats it as fully disabled/"dark"
 * — the doc must never claim a state nobody told it about. */
function buildPricingRoute(pricingState) {
  const x402Core = require('./x402-core.js');
  const mcpCore = require('./mcp-core.js');
  const state = pricingState || {};
  const enabled = state.enabled === true;
  const mode = state.mode === 'live' ? 'live' : 'test';
  const doc = x402Core.buildPricingDoc({
    endpoints: ENDPOINTS,
    tools: mcpCore.TOOLS,
    enabled: enabled,
    mode: mode,
  });
  return { status: 200, body: doc };
}

// ---------------------------------------------------------------------------
// 9. Unknown /api/* -> 404, still carrying rails + endpoints.
// ---------------------------------------------------------------------------

function build404() {
  return {
    status: 404,
    body: {
      error: 'not_found',
      message: 'Unknown API route. See "endpoints" for the routes this API serves.',
      endpoints: ENDPOINTS,
      rails: buildRailsBlock(DEFAULT_MIN_TVL),
    },
  };
}

// ---------------------------------------------------------------------------
// 10. Routing — normalize the path, dispatch, always return { status, body }.
// ---------------------------------------------------------------------------

/** Strips query/fragment (callers are expected to pass searchParams
 * separately, but defend anyway — same discipline as agent-log-core.js's
 * barePathname) and a trailing slash (except the bare "/api" itself never
 * has one to strip past length 1). */
function normalizePath(pathname) {
  let p = String(pathname === null || pathname === undefined ? '' : pathname);
  const qIdx = p.indexOf('?');
  if (qIdx !== -1) p = p.slice(0, qIdx);
  const hIdx = p.indexOf('#');
  if (hIdx !== -1) p = p.slice(0, hIdx);
  if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
  return p;
}

/** pathname -> route id, or null when this API serves no such resource (the
 * "let api-core answer its own honest 404, ungated" case — see
 * x402-core.js's header comment, "NULL MEANS NO SUCH RESOURCE", and
 * Territory note 3). Walks the SAME ROUTES table `handleApiRequest` itself
 * dispatches through, in the same order — by construction, these two can
 * never recognize a different set of paths, which is the root fix for
 * backlog 234's verifier round-1 finding (see ROUTES' own header comment).
 * `edge/x402-core.js`'s `matchRoute()` delegates to this function directly. */
function matchRouteId(pathname) {
  const path = normalizePath(pathname);
  for (let i = 0; i < ROUTES.length; i++) {
    if (ROUTES[i].match(path)) return ROUTES[i].id;
  }
  return null;
}

/**
 * The one exported entry point. Pure function of its inputs — no fetch, no
 * Date.now() outside buildHealth's documented exception, no mutation of
 * `pools`. Always returns `{ status, body }`; `body` is a plain
 * JSON-serializable object on every path, success or error — including a
 * malformed/hostile `:id` segment on `/api/pools/:id` (guarded above), which
 * is the one input class that used to throw a `URIError` out of this
 * function before it was caught here (see resolvePoolIdFromPath's comment).
 *
 * DISPATCH: walks ROUTES (section 3) in order and calls the first matching
 * entry's `handle`; falls through to `build404()` when nothing matches.
 * There is NO other dispatch code in this function — see ROUTES' own header
 * comment for why that is load-bearing, not stylistic.
 *
 * `request.pricing` (backlog 234, spec 234): an OPTIONAL `{ enabled, mode }`
 * field the Worker passes in, carrying the x402 payment-gate state it read
 * from `env` via `x402Core.readConfig(env)`. This function never reads
 * `env` itself (it has no access to it, by design — see this file's own
 * header discipline) and never assumes a state it wasn't told: absent
 * `pricing` is treated as fully disabled ("dark"), never as "enabled" —
 * `/api/pricing` and `/api` (its own `pricing` summary block, see
 * `buildContractDoc`) are the only two routes that consume this field;
 * every other route ignores it entirely, unaffected by whether the gate is
 * on or off (gating itself is the Worker's job, before this function is
 * ever called for a paid route without a valid payment — see
 * edge/agent-log.mjs).
 */
function handleApiRequest(request) {
  const req = request || {};
  const path = normalizePath(req.pathname);
  const ctx = {
    path: path,
    searchParams: req.searchParams || null,
    poolList: Array.isArray(req.pools) ? req.pools : [],
    pricing: req.pricing,
  };
  for (let i = 0; i < ROUTES.length; i++) {
    if (ROUTES[i].match(path)) return ROUTES[i].handle(ctx);
  }
  return build404();
}

module.exports = {
  handleApiRequest,
  matchRouteId,
  ROUTES,
  API_VERSION,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ENDPOINTS,
  totalApy,
  isAnomalous,
  meetsFloor,
  blendedRate,
  buildRailsBlock,
  normalizePath,
};
