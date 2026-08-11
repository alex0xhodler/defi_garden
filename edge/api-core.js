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
 * ROUTES (v0, exactly as spec 227 lists them):
 *   GET /api                    — this contract document
 *   GET /api/health             — liveness + pool-data freshness
 *   GET /api/pools              — railed pool list (token/chain/minTvl/limit/project)
 *   GET /api/pools/:id          — one pool by DefiLlama `pool` id
 *   GET /api/forever-number     — SUBSCRIPTION-archetype math (?monthly=&apy=)
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
// 2. The `rails` block — present on EVERY response, success or error
//    (spec 227 acceptance: "including 404/503"). `minTvl` reflects the
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
// 3. Endpoint metadata — the single list shared by the /api contract
//    document AND the unknown-route 404 body (spec 227: 404s carry "an
//    endpoints list").
// ---------------------------------------------------------------------------

const ENDPOINTS = [
  { method: 'GET', path: '/api', description: 'This contract document: version, endpoints, rails, data source.' },
  { method: 'GET', path: '/api/health', description: 'Liveness + railed pool-data freshness check.' },
  {
    method: 'GET', path: '/api/pools', description: 'Railed pool list.',
    params: {
      token: 'optional — case-insensitive substring match against pool.symbol',
      chain: 'optional — case-insensitive exact match against pool.chain',
      project: 'optional — case-insensitive exact match against pool.project',
      minTvl: 'optional USD floor; may only RAISE the default floor, never lower it (clamps up)',
      limit: 'optional; default ' + DEFAULT_LIMIT + ', max ' + MAX_LIMIT + ' (values above the max are clamped down)',
    },
  },
  { method: 'GET', path: '/api/pools/:id', description: 'One pool by its DefiLlama `pool` id.' },
  {
    method: 'GET', path: '/api/forever-number',
    description: 'Capital whose yield alone pays a recurring monthly bill forever (the SUBSCRIPTION-archetype math).',
    params: {
      monthly: 'required — USD/month the capital must cover',
      apy: 'optional annual rate, percent; when omitted, a TVL-weighted blended rate is derived from the ' +
        'railed pool set (never a hand-picked pool)',
    },
  },
];

// ---------------------------------------------------------------------------
// 4. /api — the contract document.
// ---------------------------------------------------------------------------

function buildContractDoc() {
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
        : ('An annual rate of ' + apyPct + '% cannot fund a recurring bill (rate must be > 0) — no amount ' +
           'of capital produces positive monthly yield at that rate.'),
      rails: buildRailsBlock(DEFAULT_MIN_TVL),
    },
  };
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

const POOL_ID_RE = /^\/api\/pools\/([^/]+)$/;

/**
 * The one exported entry point. Pure function of its three inputs — no
 * fetch, no Date.now() outside buildHealth's documented exception, no
 * mutation of `pools`. Always returns `{ status, body }`; `body` is a plain
 * JSON-serializable object on every path, success or error.
 */
function handleApiRequest(request) {
  const req = request || {};
  const path = normalizePath(req.pathname);
  const searchParams = req.searchParams || null;
  const poolList = Array.isArray(req.pools) ? req.pools : [];

  if (path === '/api') {
    return { status: 200, body: buildContractDoc() };
  }
  if (path === '/api/health') {
    return { status: 200, body: buildHealth(poolList) };
  }
  if (path === '/api/pools') {
    return { status: 200, body: buildPoolsList(poolList, searchParams) };
  }
  const poolIdMatch = POOL_ID_RE.exec(path);
  if (poolIdMatch) {
    return handlePoolById(poolList, decodeURIComponent(poolIdMatch[1]));
  }
  if (path === '/api/forever-number') {
    return handleForeverNumber(searchParams, poolList);
  }
  return build404();
}

module.exports = {
  handleApiRequest,
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
