/*
 * Pure, network/Worker-free core for x402 agentic commerce (backlog 234,
 * spec 234). CommonJS, mirroring edge/api-core.js's and edge/mcp-core.js's
 * shape exactly, for the same reason: the plain-Node test harness
 * (test_x402_core.js) must `require()` this file directly, and
 * edge/agent-log.mjs (ESM) can `import` it the same way it already imports
 * `./api-core.js` and `./mcp-core.js`.
 *
 * THIS FILE OWNS TWO THINGS ONLY: the price schedule (what costs what, and
 * why) and the 402 challenge/payment-verification LOGIC. It performs NO
 * fetch itself — `verifyPayment()` is the one function that needs the
 * network (to reach a facilitator in live mode), and it takes `fetchImpl`
 * as an injected argument rather than importing/calling a global `fetch`,
 * exactly so this file stays a pure function of its inputs and
 * `test_x402_core.js` never has to touch a real network. The Worker
 * (edge/agent-log.mjs, wired by a parallel item) owns everything impure:
 * reading `env` into a real Request-side decision, calling `fetch` for the
 * live-mode facilitator check, and turning this module's plain return
 * values into a real `Response` with headers.
 *
 * THE BOUNDARY (human directive, NORTH_STAR standing decision 2026-08-05,
 * verbatim): "free stops at getting the apy data, not the historical ones
 * that we are computing and all other computed kpis." So: CURRENT APY data
 * (the live railed rates edge/api-core.js already serves) is FREE; the
 * historical series DeFi Garden computes + retains, and every other
 * COMPUTED KPI (Sharpe, stability, forever-number math, any future computed
 * field) is PAID. Today that means exactly one route is paid:
 * `/api/forever-number` (computed KPI math). Everything else — including
 * the brand-new `/api/pricing` route this file classifies but does not
 * itself serve (a parallel item adds the route to the Worker) — is free.
 * `PRICE_SCHEDULE` below is the SINGLE place this boundary is encoded as
 * DATA; nothing in this file, or anywhere else, re-derives it from a
 * heuristic ("does the path contain /forever-number") — a heuristic would
 * silently misclassify the next computed-KPI route added under a
 * boundary-agnostic name. `classifyRoute()`'s default-paid fallback (see
 * its own comment) is what enforces "a new computed-KPI endpoint must
 * default into the paid class" — the schedule lists the free routes
 * explicitly and treats everything else as guilty (paid) until proven
 * innocent (added to the schedule as free), never the other way round.
 * WHAT ACTUALLY MAKES THIS REACHABLE (verifier round 1, backlog 234, fixed
 * this round): `classifyRoute()`'s fallback only fires for a routeId that
 * something actually asks it to classify. `matchRoute()` below is that
 * something for a real HTTP request — and it now delegates to
 * `api-core.js`'s own `matchRouteId()`, which walks `api-core.js`'s single
 * declarative `ROUTES` dispatch table (the table `handleApiRequest` itself
 * is dispatched by — there is no OTHER dispatch code in that function). So
 * a route added to that table — priced or not — is recognized by
 * `matchRoute()` and therefore classified (paid, by default, unless the
 * schedule explicitly says otherwise) BY CONSTRUCTION. Before this fix,
 * `matchRoute()` recognized only the paths already present in
 * `PRICE_SCHEDULE`'s own keys — so a route reachable through
 * `handleApiRequest` but absent from the schedule (e.g. added as a bare
 * `if` branch, the exact shape a future computed-KPI endpoint would take if
 * someone forgot to price it) matched nothing, `matchRoute()` returned
 * `null`, and `null` means ungated (see "NULL MEANS NO SUCH RESOURCE"
 * below) — so `DEFAULT_TIER = 'paid'` never actually ran for that route,
 * and it served free by omission despite this file's own claim otherwise.
 * See test_x402_core.js's three-way mirror section and test_x402_gate.js's
 * injected-route non-vacuity section for the guards that now prove this
 * can't recur silently.
 *
 * WHY `/api/pricing` IS FREE: an agent must be able to discover what costs
 * money without first paying to find out — gating the price list itself
 * would be self-defeating (and arguably deceptive: a 402 with no visible
 * price list gives an agent nothing to act on). `/api` (the contract doc)
 * and `/api/health` (liveness) are free for the same "this is
 * self-description, not data" reason `/api/pricing` is.
 *
 * NULL MEANS "NO SUCH RESOURCE" (`matchRoute`): an unknown `/api/<path>`
 * does not correspond to any route this schedule (or api-core.js's own
 * dispatcher) knows about. The Worker's gate must treat that `null` as "let
 * api-core answer its own honest 404" — NOT as "paid" and NOT as "free".
 * api-core.js's 404 body carries `rails` + `endpoints` but serves zero
 * actual data (no pool, no computed figure, nothing an agent could act on),
 * so gating it behind a paywall would charge for literally nothing —
 * deliberately never paywalled, by construction: `matchRoute` returning
 * `null` is the only signal the Worker needs to skip the gate entirely on
 * that path.
 *
 * WHY THIS FILE `require()`s `./api-core.js`: `matchRoute()` must recognize
 * exactly the same paths api-core.js's own dispatcher does (spec 234's
 * literal ask), and the ONE way to guarantee that without a second,
 * independently-drifting path-normalization implementation is to reuse
 * api-core.js's own `normalizePath()` rather than re-writing a lookalike —
 * same discipline mcp-core.js already applies one layer up (delegating to
 * `handleApiRequest` rather than re-implementing any rail). This is the
 * only require() in this file; it introduces no new dependency (api-core.js
 * is itself dependency-free CommonJS, safe in plain Node and inside the
 * Worker bundle) and no rail/route literal from api-core.js is copied here
 * — `PRICE_SCHEDULE`'s route-id keys are asserted, by test, to set-equal
 * api-core.js's own `ENDPOINTS` path list (plus `/api/pricing`), never
 * hand-typed as a second guess at what api-core.js serves.
 *
 * PAYMENT PAYLOAD SHAPE (the JSON the `X-PAYMENT` header base64-encodes):
 * `{ x402Version, scheme, network, resource, amount, payer? }` — a
 * deliberately minimal subset of the full x402 `PaymentPayload` (which in
 * the wild carries an EIP-3009 `authorization` + `signature` for on-chain
 * settlement). This module never verifies a cryptographic signature itself
 * — TEST mode never settles anything (by definition, see `verifyPayment`'s
 * mode:'test' branch), and LIVE mode delegates the entire validity
 * question, signature included, to the configured facilitator's `/verify`
 * endpoint (fail CLOSED on anything short of an explicit `isValid:true`).
 * This file's own job is only the cheap, local checks a facilitator round
 * trip shouldn't be spent on: does the payload even claim to match what was
 * asked for, and is the claimed amount enough.
 *
 * NO WALLET/HANDLE/CREDENTIAL LIVES HERE: `X402_PAY_TO`/`X402_ASSET`/
 * `X402_FACILITATOR_URL` are read from `env` at call time by `readConfig()`
 * — never a literal in this file. When unset, `buildChallenge()` says so
 * honestly in its `error` string and emits `payTo: null` / `asset: null`
 * rather than inventing a placeholder value that could be mistaken for a
 * real one.
 *
 * ROUTES this file classifies (mirrors api-core.js's ENDPOINTS, plus the
 * pricing route a parallel item is adding to the Worker — see PRICE_SCHEDULE):
 *   FREE  /api                    — contract document (self-description)
 *   FREE  /api/health             — liveness + pool-data freshness
 *   FREE  /api/pools              — current APY data (railed pool list)
 *   FREE  /api/pools/:id          — current APY data (one pool)
 *   FREE  /api/pricing            — this module's own machine-readable pricing doc
 *   PAID  /api/forever-number     — computed KPI (SUBSCRIPTION-archetype math)
 *   ANY OTHER /api/* path         — matchRoute() returns null; ungated 404
 */

'use strict';

const apiCore = require('./api-core.js');

// ---------------------------------------------------------------------------
// 1. Protocol/asset constants — declared as data, never a magic literal
//    buried inside a handler.
// ---------------------------------------------------------------------------

const PROTOCOL_NAME = 'x402';
const PROTOCOL_VERSION = 1;

const ASSET_SYMBOL = 'USDC';
const ASSET_DECIMALS = 6;

// $0.001 at 6 decimals. A string (not a number) throughout this file — atomic
// token amounts are integers that can exceed Number's safe range for other
// assets/denominations, so every amount in this module is carried and
// compared as a decimal-digit string / BigInt, never a JS number.
const DEFAULT_PRICE_USDC_ATOMIC = '1000';

const DEFAULT_NETWORK = 'base-sepolia';

// ---------------------------------------------------------------------------
// 2. PRICE_SCHEDULE — the single source for pricing, as data. Keyed by the
//    same route-id strings edge/api-core.js's ENDPOINTS `path` fields and
//    edge/mcp-core.js's TOOLS `route` fields use. See header comment for the
//    boundary this table encodes and why `/api/pricing` is free.
// ---------------------------------------------------------------------------

const PRICE_SCHEDULE = {
  '/api': {
    route: '/api',
    tier: 'free',
    reason: 'The API contract document — self-description of the API, not data.',
  },
  '/api/health': {
    route: '/api/health',
    tier: 'free',
    reason: 'Liveness + pool-data freshness check — no APY or computed figure is returned.',
  },
  '/api/pools': {
    route: '/api/pools',
    tier: 'free',
    reason: 'Current APY data — the live railed pool list. The free half of the human\'s 2026-08-05 boundary.',
  },
  '/api/pools/:id': {
    route: '/api/pools/:id',
    tier: 'free',
    reason: 'Current APY data for a single pool — same boundary as /api/pools.',
  },
  '/api/pricing': {
    route: '/api/pricing',
    tier: 'free',
    reason: 'This machine-readable pricing document itself — an agent must be able to discover what costs ' +
      'money without first paying to find out.',
  },
  '/api/forever-number': {
    route: '/api/forever-number',
    tier: 'paid',
    priceUsdcAtomic: DEFAULT_PRICE_USDC_ATOMIC,
    reason: 'A computed KPI — the forever-number math (capital such that capital*rate/12 >= a monthly bill) ' +
      'is derived from the railed pool set, not passthrough current-APY data. The paid half of the human\'s ' +
      '2026-08-05 boundary.',
  },
};

const DEFAULT_TIER = 'paid';

// ---------------------------------------------------------------------------
// 3. classifyRoute — the one function anything (a route id, an MCP tool, a
//    future caller) goes through to learn tier/price/reason. An unlisted
//    route id is NEVER free — see header comment's boundary-enforcement note.
// ---------------------------------------------------------------------------

function classifyRoute(routeId) {
  const entry = PRICE_SCHEDULE[routeId];
  if (entry) {
    return {
      route: routeId,
      tier: entry.tier,
      priceUsdcAtomic: entry.tier === 'paid' ? (entry.priceUsdcAtomic || DEFAULT_PRICE_USDC_ATOMIC) : null,
      reason: entry.reason,
      explicit: true,
    };
  }
  return {
    route: routeId,
    tier: DEFAULT_TIER,
    priceUsdcAtomic: DEFAULT_TIER === 'paid' ? DEFAULT_PRICE_USDC_ATOMIC : null,
    reason: 'This route is not in PRICE_SCHEDULE. An unlisted route defaults to PAID, never free — a new ' +
      'computed-KPI route must be added to PRICE_SCHEDULE explicitly (and justified against the free/paid ' +
      'boundary) before it can ever ship free.',
    explicit: false,
  };
}

/** The route ids currently classified free — derived from PRICE_SCHEDULE,
 * never a second hardcoded list. Used by buildChallenge() (extra.freeAlternatives)
 * and buildPricingDoc(); exported so tests can assert set-equality against
 * this exact derivation rather than re-deriving it themselves. */
function freeRoutes() {
  return Object.keys(PRICE_SCHEDULE).filter(function (routeId) {
    return PRICE_SCHEDULE[routeId].tier === 'free';
  });
}

// ---------------------------------------------------------------------------
// 4. matchRoute — recognizes exactly the paths api-core.js's own live
//    dispatch table recognizes, by DELEGATING to api-core.js's own
//    `matchRouteId()` (which walks the SAME `ROUTES` table
//    `handleApiRequest` itself dispatches by) rather than re-deriving a
//    static id list from PRICE_SCHEDULE's own keys. This is the root fix
//    for backlog 234's verifier round-1 finding (see this file's header
//    comment, "WHAT ACTUALLY MAKES THIS REACHABLE"): a route can now be
//    recognized here — and therefore classified by `classifyRoute()`,
//    default-paid included — the moment it exists in api-core.js's real
//    dispatcher, whether or not PRICE_SCHEDULE has ever heard of it.
// ---------------------------------------------------------------------------

/** pathname -> route id, or null when no such resource exists (see header
 * comment's "NULL MEANS NO SUCH RESOURCE"). Pure delegation to
 * `api-core.js`'s `matchRouteId()` — collapsing a pool-id segment to
 * '/api/pools/:id', decoding nothing, throwing on nothing — is entirely
 * that function's job now; this wrapper exists only so callers keep using
 * `x402Core.matchRoute()` as their entry point. */
function matchRoute(pathname) {
  return apiCore.matchRouteId(pathname);
}

// ---------------------------------------------------------------------------
// 5. classifyMcpTool — derives a tool's tier from the SAME PRICE_SCHEDULE,
//    via the tool's own declared `route` field. Never a second hardcoded
//    tool->price list (the mirror rule, spec 234's Change §2).
// ---------------------------------------------------------------------------

function classifyMcpTool(toolName, tools) {
  const list = Array.isArray(tools) ? tools : [];
  let tool = null;
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].name === toolName) { tool = list[i]; break; }
  }
  if (!tool) return null;
  return classifyRoute(tool.route);
}

// ---------------------------------------------------------------------------
// 6. Config — normalised Worker env vars. Everything optional; everything
//    OFF by default (spec 234 acceptance: "ships with the live-pricing flag
//    OFF"). No literal wallet/handle/credential is read from or defaulted
//    to anywhere in this function — payTo/asset/facilitatorUrl are null
//    unless the Worker's own env explicitly sets them.
// ---------------------------------------------------------------------------

function readConfig(env) {
  const e = env || {};
  const enabled = e.X402_ENABLED === true || e.X402_ENABLED === 'true' || e.X402_ENABLED === '1';
  const modeRaw = typeof e.X402_MODE === 'string' ? e.X402_MODE.toLowerCase() : '';
  const mode = modeRaw === 'live' ? 'live' : 'test'; // default 'test' — never defaults to 'live'
  return {
    enabled: enabled,
    mode: mode,
    network: (typeof e.X402_NETWORK === 'string' && e.X402_NETWORK.length > 0) ? e.X402_NETWORK : DEFAULT_NETWORK,
    asset: (typeof e.X402_ASSET === 'string' && e.X402_ASSET.length > 0) ? e.X402_ASSET : null,
    payTo: (typeof e.X402_PAY_TO === 'string' && e.X402_PAY_TO.length > 0) ? e.X402_PAY_TO : null,
    facilitatorUrl: (typeof e.X402_FACILITATOR_URL === 'string' && e.X402_FACILITATOR_URL.length > 0)
      ? e.X402_FACILITATOR_URL
      : null,
  };
}

// ---------------------------------------------------------------------------
// 7. buildChallenge — the x402 v1-conformant 402 body. Exactly three
//    top-level keys (the protocol's own shape); anything of ours lives
//    inside accepts[0].extra, which the protocol leaves free-form.
// ---------------------------------------------------------------------------

function buildChallenge(args) {
  const a = args || {};
  const routeId = a.routeId;
  const resourceUrl = a.resourceUrl;
  const cfg = a.config || {};

  const classification = classifyRoute(routeId);
  const priceAtomic = classification.priceUsdcAtomic || DEFAULT_PRICE_USDC_ATOMIC;
  const network = (typeof cfg.network === 'string' && cfg.network.length > 0) ? cfg.network : DEFAULT_NETWORK;

  // No invented address, ever: payTo/asset are only populated when the
  // Worker's own config actually carries them. See header comment.
  const configured = !!(cfg.payTo && cfg.asset);

  const errorMsg = configured
    ? ('Payment required for ' + routeId + '. ' + classification.reason)
    : ('Payment required for ' + routeId + ', but no payment recipient is configured yet (X402_PAY_TO / ' +
       'X402_ASSET unset) — this route cannot actually be paid for right now. ' + classification.reason);

  return {
    x402Version: PROTOCOL_VERSION,
    error: errorMsg,
    accepts: [
      {
        scheme: 'exact',
        network: network,
        maxAmountRequired: priceAtomic,
        resource: resourceUrl,
        description: classification.reason,
        mimeType: 'application/json',
        payTo: configured ? cfg.payTo : null,
        maxTimeoutSeconds: 60,
        asset: configured ? cfg.asset : null,
        extra: {
          name: 'DeFi Garden read-only Yield API',
          version: apiCore.API_VERSION,
          docs: '/api/pricing',
          freeAlternatives: freeRoutes(),
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 8. verifyPayment — the trust rail of this file. Never throws; every path
//    returns { paid, status, reason }. See header comment for the payload
//    shape and the "fail closed" discipline in live mode.
// ---------------------------------------------------------------------------

function decodePaymentHeader(header) {
  if (header === null || header === undefined || header === '' || typeof header !== 'string') {
    return { ok: false, empty: true, reason: null };
  }
  let jsonStr;
  try {
    jsonStr = Buffer.from(header, 'base64').toString('utf8');
  } catch (_err) {
    return { ok: false, empty: false, reason: 'X-PAYMENT header is not decodable base64' };
  }
  let payload;
  try {
    payload = JSON.parse(jsonStr);
  } catch (_err) {
    return { ok: false, empty: false, reason: 'X-PAYMENT header did not decode to valid JSON' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, empty: false, reason: 'X-PAYMENT payload must be a JSON object' };
  }
  return { ok: true, empty: false, reason: null, payload: payload };
}

/** Parses a non-negative integer atomic-amount value (string or number) to
 * a BigInt, or null if it cannot be parsed as one — atomic token amounts
 * are integers and are never compared as floating-point numbers. */
function toBigIntAmount(v) {
  try {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v)) {
      return BigInt(v);
    }
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
      return BigInt(v.trim());
    }
    return null;
  } catch (_err) {
    return null;
  }
}

/** A "test" network per this module's rule: the network name contains
 * "sepolia" (case-insensitive), or is exactly "test". Anything else
 * (including a bare mainnet name) is NOT a test network. */
function isTestNetwork(network) {
  const n = String(network || '').toLowerCase();
  return n.indexOf('sepolia') !== -1 || n === 'test';
}

async function verifyPayment(args) {
  const a = args || {};
  const header = a.header;
  const challenge = a.challenge;
  const config = a.config || {};
  const fetchImpl = a.fetchImpl;

  try {
    const decoded = decodePaymentHeader(header);
    if (!decoded.ok) {
      if (decoded.empty) return { paid: false, status: 'none', reason: null };
      return { paid: false, status: 'rejected', reason: decoded.reason };
    }
    const payload = decoded.payload;

    const requirement = (challenge && Array.isArray(challenge.accepts) && challenge.accepts[0])
      ? challenge.accepts[0]
      : null;
    if (!requirement) {
      return { paid: false, status: 'rejected', reason: 'no payment requirement to verify against (malformed challenge)' };
    }

    if (payload.scheme !== requirement.scheme) {
      return { paid: false, status: 'rejected', reason: 'scheme mismatch: expected "' + requirement.scheme + '", got ' + JSON.stringify(payload.scheme) };
    }
    if (payload.network !== requirement.network) {
      return { paid: false, status: 'rejected', reason: 'network mismatch: expected "' + requirement.network + '", got ' + JSON.stringify(payload.network) };
    }
    if (payload.resource !== requirement.resource) {
      return { paid: false, status: 'rejected', reason: 'resource mismatch: expected "' + requirement.resource + '", got ' + JSON.stringify(payload.resource) };
    }

    const paidAmount = toBigIntAmount(payload.amount);
    const requiredAmount = toBigIntAmount(requirement.maxAmountRequired);
    if (paidAmount === null || requiredAmount === null || paidAmount < requiredAmount) {
      return {
        paid: false,
        status: 'rejected',
        reason: 'amount too low: required ' + requirement.maxAmountRequired + ', got ' + JSON.stringify(payload.amount),
      };
    }

    const mode = config.mode === 'live' ? 'live' : 'test';

    if (mode === 'test') {
      // Test mode NEVER settles anything, and only ever accepts a payload
      // whose network actually IS a test network — a mainnet network
      // presented in test mode is rejected, not silently waved through.
      if (!isTestNetwork(payload.network)) {
        return {
          paid: false,
          status: 'rejected',
          reason: 'test mode only accepts a test network (name containing "sepolia", or exactly "test"); got ' +
            JSON.stringify(payload.network),
        };
      }
      return { paid: true, status: 'paid_test', reason: null };
    }

    // mode === 'live' — fail CLOSED on anything short of an explicit
    // { isValid: true } from the configured facilitator. No facilitator
    // configured, or no fetchImpl injected: rejected, never silently
    // treated as "trust it".
    if (!config.facilitatorUrl || typeof fetchImpl !== 'function') {
      return {
        paid: false,
        status: 'rejected',
        reason: 'live mode requires a configured X402_FACILITATOR_URL and an injected fetchImpl; neither may be assumed present — fail closed',
      };
    }

    let res;
    try {
      res = await fetchImpl(config.facilitatorUrl.replace(/\/+$/, '') + '/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x402Version: PROTOCOL_VERSION,
          paymentPayload: payload,
          paymentRequirements: requirement,
        }),
      });
    } catch (_err) {
      return { paid: false, status: 'rejected', reason: 'facilitator request threw (network error) — fail closed' };
    }

    if (!res || !res.ok) {
      return { paid: false, status: 'rejected', reason: 'facilitator responded non-OK — fail closed' };
    }

    let body;
    try {
      body = await res.json();
    } catch (_err) {
      return { paid: false, status: 'rejected', reason: 'facilitator response body was not parseable JSON — fail closed' };
    }

    if (!body || body.isValid !== true) {
      return { paid: false, status: 'rejected', reason: 'facilitator did not return an explicit isValid:true — fail closed' };
    }

    return { paid: true, status: 'paid', reason: null };
  } catch (_err) {
    // Belt-and-braces: verifyPayment must NEVER throw (spec 234). Anything
    // unexpected anywhere above becomes a rejection, not an escaped
    // exception — same discipline api-core.js's handleApiRequest applies to
    // its own callers.
    return { paid: false, status: 'rejected', reason: 'unexpected internal error during payment verification — fail closed' };
  }
}

// ---------------------------------------------------------------------------
// 9. paymentResponseHeader — the honest X-PAYMENT-RESPONSE value.
//
// `settled` is ALWAYS false, on every branch, including live mode (verifier
// round 1, backlog 234): `verifyPayment()`'s live-mode branch POSTs only to
// the facilitator's `/verify` endpoint (see its own comment above) — it
// never calls `/settle`, so no on-chain transfer is ever broadcast by this
// Worker. In the x402 protocol, `/verify` validates a payload; `/settle`
// broadcasts the transfer — this module implements the former only.
// Claiming `settled=true` for the `paid` (live) status would say value moved
// when nothing did.
//
// `verified` means something DIFFERENT per mode, and the header must say so
// (coordinator spot-check follow-up to verifier round 1, backlog 234): in
// LIVE mode, `verified=true` means the configured facilitator's `/verify`
// endpoint was actually called and returned an explicit `isValid:true` — a
// real third party vouched for the payload. In TEST mode, `verifyPayment()`
// never calls a facilitator or checks a signature or touches a chain at
// all — it only checks that the payload is STRUCTURALLY well-formed
// (decodable, scheme/network/resource match the challenge, amount >=
// required, network is a test network), so `paid_test` gets
// `verified=false; checked=structural` instead of `verified=true`: nobody
// verified anything, we merely matched fields against our own challenge.
// `rejected`/`none` stay `verified=false` with no `checked` field (there is
// nothing to have structurally checked when the payload was rejected or
// absent). See edge/X402.md's "What this deliberately does NOT do" for the
// residue note this header's honesty depends on: settlement is
// human/off-Worker, never implemented here, by design (money-movement is
// NEVER-list).
// ---------------------------------------------------------------------------

function paymentResponseHeader(result) {
  const r = result || {};
  if (r.status === 'paid_test') return 'settled=false; verified=false; checked=structural; mode=test';
  if (r.status === 'paid') return 'settled=false; verified=true; mode=live';
  if (r.status === 'rejected') return 'settled=false; verified=false; mode=rejected';
  return 'settled=false; verified=false; mode=none';
}

// ---------------------------------------------------------------------------
// 10. buildPricingDoc — the machine-readable pricing document served at
//     /api/pricing (by a parallel item's Worker route), generated entirely
//     from PRICE_SCHEDULE. Takes the enabled/mode state as an argument
//     (never reads env itself) so the document can never claim a live state
//     it cannot actually see — the 2026-07-12 "no fake availability" precedent.
// ---------------------------------------------------------------------------

function buildPricingDoc(args) {
  const a = args || {};
  const endpointList = Array.isArray(a.endpoints) ? a.endpoints : [];
  const toolList = Array.isArray(a.tools) ? a.tools : [];
  const enabled = a.enabled === true;
  const mode = a.mode === 'live' ? 'live' : 'test';

  const routes = endpointList.map(function (ep) {
    const c = classifyRoute(ep.path);
    return {
      route: ep.path,
      method: ep.method || 'GET',
      tier: c.tier,
      priceUsdcAtomic: c.priceUsdcAtomic,
      reason: c.reason,
    };
  });
  // /api/pricing IS an ENDPOINTS entry in api-core.js as of backlog 234's
  // follow-up fix (see product-loop-kit/specs/234-notes.md, "Deviation 1 —
  // reversed"), so this branch is now a defensive fallback only — for any
  // caller that hands buildPricingDoc() an `endpoints` list that doesn't
  // already carry the route (e.g. a hand-built test fixture). The pricing
  // doc must always describe itself either way.
  if (!routes.some(function (r) { return r.route === '/api/pricing'; })) {
    const pricingSelf = classifyRoute('/api/pricing');
    routes.push({
      route: '/api/pricing',
      method: 'GET',
      tier: pricingSelf.tier,
      priceUsdcAtomic: pricingSelf.priceUsdcAtomic,
      reason: pricingSelf.reason,
    });
  }

  const mcpTools = toolList.map(function (t) {
    const c = classifyMcpTool(t.name, toolList);
    return {
      tool: t.name,
      route: t.route,
      tier: c ? c.tier : null,
      priceUsdcAtomic: c ? c.priceUsdcAtomic : null,
    };
  });

  const availabilityStatement = enabled
    ? ('Pricing is ENABLED (mode: ' + mode + '). ' + (mode === 'test'
        ? 'A well-formed test-network payment is accepted, but nothing settles — no real value moves in test mode.'
        : 'Payments are verified against the configured facilitator (fail-closed on anything short of an ' +
          'explicit isValid:true), but this Worker never calls a facilitator\'s /settle endpoint — a verified ' +
          'live-mode payment is NOT settled by this Worker, so no funds move on our side. See X402.md for the ' +
          'full residue note.'))
    : ('Pricing is currently DISABLED. Every route above is served FREE today regardless of the tier listed ' +
       'for it — no cloudflare.pay handle or Monetization Gateway is live yet, so no agent is being charged ' +
       'right now. This document describes the priced state the platform will move to when a human flips ' +
       'X402_ENABLED, not the state it is in today.');

  return {
    name: 'DeFi Garden agentic-commerce pricing document',
    protocol: { name: PROTOCOL_NAME, version: PROTOCOL_VERSION },
    asset: { symbol: ASSET_SYMBOL, decimals: ASSET_DECIMALS },
    boundary:
      'Current APY data is free — the live railed rates DeFi Garden already serves (GET /api/pools, ' +
      'GET /api/pools/:id) cost nothing. The historical series DeFi Garden computes and retains, and every ' +
      'other computed KPI (Sharpe, stability scores, forever-number math, and any future computed field), ' +
      'are paid. An endpoint not explicitly listed as free in this document defaults to paid.',
    routes: routes,
    mcpTools: mcpTools,
    availability: {
      enabled: enabled,
      mode: mode,
      statement: availabilityStatement,
    },
  };
}

// ---------------------------------------------------------------------------
// 11. Exports.
// ---------------------------------------------------------------------------

module.exports = {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  ASSET_SYMBOL,
  ASSET_DECIMALS,
  DEFAULT_PRICE_USDC_ATOMIC,
  DEFAULT_NETWORK,
  DEFAULT_TIER,
  PRICE_SCHEDULE,
  classifyRoute,
  freeRoutes,
  matchRoute,
  classifyMcpTool,
  readConfig,
  buildChallenge,
  verifyPayment,
  paymentResponseHeader,
  buildPricingDoc,
};
