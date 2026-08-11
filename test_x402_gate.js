/* Acceptance harness for the x402 + Web Bot Auth WIRING (backlog 234, spec
   234) — the gate itself, as wired into the real edge/agent-log.mjs Worker.
   Plain Node, plain lane (no browser-driving test framework anywhere in
   this file or in anything it requires — see run-tests.js's transitive-
   require lane classifier), no network — the one place a live network call
   would occur (a live-mode x402 facilitator /verify POST) is never
   exercised here; every payment in this file is TEST-network, verified
   locally with no fetchImpl invocation past the injected stub `fetch`.

   No wrangler in this sandbox and browser-originated HTTPS is blocked at
   the proxy (standing decision 2026-07-12, restated in spec 234's Territory
   note 5) — this file drives the REAL Worker (`edge/agent-log.mjs`'s
   default export) exactly the way test_api_worker.js/test_mcp_server.js
   already do: a genuine dynamic `import()` of the file on disk, `fetch()`
   called with real `Request`-shaped objects, a stubbed global `fetch` for
   the pool-data upstream, a fake `env.DB`/`ctx.waitUntil`.

   Populations are DERIVED, never hardcoded:
     - free/paid ROUTE population: `x402Core.PRICE_SCHEDULE`'s own keys,
       via `x402Core.freeRoutes()` and a same-shaped paid-side filter.
     - free/paid TOOL population: `mcpCore.TOOLS`, classified via
       `x402Core.classifyMcpTool()` against that SAME schedule.
     - pool data: the real, committed `data/pools-snapshot.json`.

   Run: node test_x402_gate.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
let total = 0;
function ok(cond, msg) { total++; assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { total++; assert.strictEqual(a, b, msg); passed++; }
function deq(a, b, msg) { total++; assert.deepStrictEqual(a, b, msg); passed++; }

const ROOT = __dirname;
const EDGE_DIR = path.join(ROOT, 'edge');

const apiCore = require(path.join(EDGE_DIR, 'api-core.js'));
const mcpCore = require(path.join(EDGE_DIR, 'mcp-core.js'));
const x402Core = require(path.join(EDGE_DIR, 'x402-core.js'));
const webBotAuth = require(path.join(EDGE_DIR, 'web-bot-auth-core.js'));
const agentLogCore = require(path.join(EDGE_DIR, 'agent-log-core.js'));

const subtle = globalThis.crypto.subtle;

// ===========================================================================
// A. Population.
// ===========================================================================
console.log('A. population — PRICE_SCHEDULE, mcp-core TOOLS, data/pools-snapshot.json');

const SNAPSHOT_PATH = path.join(ROOT, 'data', 'pools-snapshot.json');
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
ok(snapshot && Array.isArray(snapshot.pools), 'sanity: data/pools-snapshot.json has a .pools array');
const POPULATION = snapshot.pools;
ok(POPULATION.length > 1000, `sanity: expected a real, large population, got ${POPULATION.length}`);
const REAL_POOL_ID = POPULATION[0].pool;

const FREE_ROUTE_IDS = x402Core.freeRoutes().slice().sort();
const PAID_ROUTE_IDS = Object.keys(x402Core.PRICE_SCHEDULE).filter((r) => x402Core.PRICE_SCHEDULE[r].tier === 'paid').sort();
ok(FREE_ROUTE_IDS.length > 0, 'sanity: at least one free route derived from PRICE_SCHEDULE');
ok(PAID_ROUTE_IDS.length > 0, 'sanity: at least one paid route derived from PRICE_SCHEDULE');

const FREE_TOOLS = mcpCore.TOOLS.filter((t) => {
  const c = x402Core.classifyMcpTool(t.name, mcpCore.TOOLS);
  return c && c.tier === 'free';
});
const PAID_TOOLS = mcpCore.TOOLS.filter((t) => {
  const c = x402Core.classifyMcpTool(t.name, mcpCore.TOOLS);
  return c && c.tier === 'paid';
});
ok(PAID_TOOLS.length > 0, 'sanity: at least one paid MCP tool derived from classifyMcpTool');
console.log(`  ${FREE_ROUTE_IDS.length} free routes, ${PAID_ROUTE_IDS.length} paid route(s); ${FREE_TOOLS.length} free tools, ${PAID_TOOLS.length} paid tool(s)`);

// Sanity: the D1-column values this file asserts against are drawn from
// the SAME single exported enums the Worker itself uses — never a second
// hand-typed guess at what those strings are.
ok(agentLogCore.PAYMENT_STATUSES.includes('required'), 'sanity: agent-log-core.js PAYMENT_STATUSES includes "required"');
ok(agentLogCore.PAYMENT_STATUSES.includes('paid_test'), 'sanity: agent-log-core.js PAYMENT_STATUSES includes "paid_test"');
ok(webBotAuth.IDENTITY_STATUSES.includes('verified'), 'sanity: web-bot-auth-core.js IDENTITY_STATUSES includes "verified"');

/** Concretizes a route id into a real, resolvable GET request path — a
 * pattern route (`/api/pools/:id`) gets a REAL pool id from the population;
 * `/api/forever-number` gets a valid `monthly` query param; every static
 * route is used as-is. Never a hardcoded pool id or a magic monthly value
 * disconnected from the population/route table. */
function concretePathFor(routeId) {
  if (routeId === '/api/pools/:id') return '/api/pools/' + REAL_POOL_ID;
  if (routeId === '/api/forever-number') return '/api/forever-number?monthly=20';
  return routeId;
}

// ===========================================================================
// B. Harness — Worker loading, fakes, stubs. Mirrors test_api_worker.js /
//    test_mcp_server.js's own technique exactly (same fake-DB/ctx/fetch
//    shapes), extended with a Web Bot Auth signing helper.
// ===========================================================================

function makeFakeDB(behavior) {
  behavior = behavior || {};
  const calls = [];
  const db = {
    prepare(sql) {
      // `rejectExtended`: simulate the pre-migration D1 table — the
      // extended (12-column) INSERT fails (real D1 would say "no such
      // column: agent_identity"), the legacy (9-column) one succeeds.
      // Detected by SQL text, exactly the shape a real column-mismatch
      // failure has (this file never inspects the Worker's private
      // INSERT_SQL_EXTENDED/INSERT_SQL_LEGACY constants directly — those
      // aren't exported, by design; SQL-text sniffing is the black-box
      // equivalent).
      const isExtended = /agent_identity/.test(sql);
      return {
        bind(...args) {
          return {
            run() {
              if (behavior.rejectExtended && isExtended) {
                return Promise.reject(new Error('D1 error: no such column: agent_identity'));
              }
              if (behavior.rejectAll) {
                return Promise.reject(new Error('D1 outage: run() rejected'));
              }
              calls.push({ sql, args, isExtended });
              return Promise.resolve({ success: true });
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

function makeFakeCtx() {
  const waited = [];
  return { ctx: { waitUntil(p) { waited.push(p); } }, waited };
}

function makeRequest(url, opts) {
  opts = opts || {};
  const bodyText = opts.body !== undefined ? opts.body : '';
  return {
    url,
    method: opts.method || 'GET',
    headers: new Headers(opts.headers || {}),
    cf: opts.cf,
    async text() { return bodyText; },
  };
}

/** Same string-vs-Request-object stub technique test_api_worker.js and
 * test_mcp_server.js both use: distinguishes getPools()'s upstream fetch
 * (a string URL) from the pass-through path's `fetch(request)` (a
 * Request-like object). */
function makeWorkerFetchStub({ poolsFail, poolsBody, passthroughResponse } = {}) {
  return async (input) => {
    if (typeof input === 'string') {
      if (poolsFail) return new Response('upstream broke', { status: 500 });
      return new Response(JSON.stringify({ status: 'success', data: poolsBody || POPULATION }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return passthroughResponse || new Response('unexpected pass-through', { status: 599 });
  };
}

let workerModule;
let worker;
async function loadWorker() {
  const workerUrl = pathToFileURL(path.join(EDGE_DIR, 'agent-log.mjs')).href;
  workerModule = await import(workerUrl);
  worker = workerModule.default;
}

const originalFetch = global.fetch;
function setFetch(fn) { global.fetch = fn; }
function restoreFetch() { global.fetch = originalFetch; }

async function withFetch(stub, fn) {
  workerModule.__resetPoolsMemoForTests();
  setFetch(stub);
  try {
    return await fn();
  } finally {
    restoreFetch();
  }
}

// ---- Web Bot Auth signing helpers (self-contained copy of
// test_web_bot_auth.js's own technique — that file is fixed API and cannot
// be imported from, so the minimal signing logic this file needs is
// reproduced here rather than shared). ----------------------------------

async function generateKeypair() {
  return subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
}
async function publicKeyToKeyringValue(publicKey) {
  const raw = await subtle.exportKey('raw', publicKey);
  return webBotAuth.bytesToBase64Url(new Uint8Array(raw));
}
function sigInputParams({ components, created, expires, keyid, alg, tag }) {
  const compList = components.map((c) => `"${c}"`).join(' ');
  const parts = [`(${compList})`];
  if (created !== undefined) parts.push(`created=${created}`);
  if (expires !== undefined) parts.push(`expires=${expires}`);
  if (keyid !== undefined) parts.push(`keyid="${keyid}"`);
  if (alg !== undefined) parts.push(`alg="${alg}"`);
  if (tag !== undefined) parts.push(`tag="${tag}"`);
  return parts.join(';');
}
async function signRequest({ request, components, privateKey, created, expires, keyid, alg = 'ed25519', tag = webBotAuth.SIGNATURE_TAG, label = 'sig1' }) {
  const paramsRaw = sigInputParams({ components, created, expires, keyid, alg, tag });
  const base = webBotAuth.buildSignatureBase({ coveredComponents: components, signatureParamsRaw: paramsRaw, request });
  const sigBytes = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, privateKey, new TextEncoder().encode(base)));
  const sigB64 = Buffer.from(sigBytes).toString('base64');
  return { signatureInput: `${label}=${paramsRaw}`, signature: `${label}=:${sigB64}:` };
}

// ---- x402 payment-header helpers ---------------------------------------

function b64Payload(obj) { return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64'); }

/** Builds a valid X-PAYMENT header value for `challenge` (as produced by
 * x402Core.buildChallenge) — the exact required amount, on a test network,
 * matching scheme/network/resource. */
function validPaymentHeaderFor(challenge) {
  const req0 = challenge.accepts[0];
  return b64Payload({ x402Version: 1, scheme: req0.scheme, network: req0.network, resource: req0.resource, amount: req0.maxAmountRequired });
}
function underpaidHeaderFor(challenge) {
  const req0 = challenge.accepts[0];
  const under = (BigInt(req0.maxAmountRequired) - 1n).toString();
  return b64Payload({ x402Version: 1, scheme: req0.scheme, network: req0.network, resource: req0.resource, amount: under });
}
function mismatchedResourceHeaderFor(challenge) {
  const req0 = challenge.accepts[0];
  return b64Payload({ x402Version: 1, scheme: req0.scheme, network: req0.network, resource: 'https://www.defi.garden/api/pools', amount: req0.maxAmountRequired });
}

function assertConformant402Body(body, label) {
  eq(body.x402Version, 1, `${label}: x402Version is 1`);
  ok(typeof body.error === 'string' && body.error.length > 0, `${label}: error is a non-empty string`);
  ok(Array.isArray(body.accepts) && body.accepts.length === 1, `${label}: accepts is a one-element array`);
  const acc = body.accepts[0];
  const REQUIRED_FIELDS = ['scheme', 'network', 'maxAmountRequired', 'resource', 'description', 'mimeType', 'payTo', 'maxTimeoutSeconds', 'asset', 'extra'];
  for (const f of REQUIRED_FIELDS) {
    ok(Object.prototype.hasOwnProperty.call(acc, f), `${label}: accepts[0] carries required field "${f}"`);
  }
  eq(acc.scheme, 'exact', `${label}: accepts[0].scheme is "exact"`);
}

const ENABLED_TEST_ENV = { X402_ENABLED: 'true', X402_MODE: 'test' };

// Mirrors edge/agent-log.mjs's own (private, unexported) POOLS_CACHE_TTL_SECONDS
// constant — the pre-234 public-caching duration every ungated /api/*
// response has always used. Not re-derived from the Worker (nothing to
// import it from — it's a private module-level const), so this is a
// documented literal, checked here so a future edit to either side surfaces
// as a failing assertion rather than a silent drift.
const CACHE_MAX_AGE_SECONDS = 300;

async function main() {
  await loadWorker();
  ok(worker && typeof worker.fetch === 'function', 'sanity: the real edge/agent-log.mjs exports a default object with fetch()');

  // =========================================================================
  // C. Gate DARK by default (no env / X402_ENABLED unset): every route,
  //    free AND paid, returns 200. Proven two ways: (1) every route id from
  //    the schedule resolves 200 through the Worker with no
  //    X-PAYMENT-RESPONSE header; (2) the response body is IDENTICAL to
  //    calling apiCore.handleApiRequest directly WITHOUT a `pricing` field
  //    at all — proving the new `pricing` input has zero effect on the
  //    output of any route OTHER than /api and /api/pricing (both of which
  //    happen to also match here, in dark mode specifically, because an
  //    absent `pricing` field and an explicit `{enabled:false,mode:'test'}`
  //    both read as "disabled" to buildContractDoc/buildPricingRoute — see
  //    api-core.js's own header comment; this is NOT a general claim that
  //    `pricing` never matters for those two routes).
  //
  //    NOTE (verifier round 1, backlog 234): this section does NOT diff
  //    against `origin/main` (pre-234 code) — it only compares the CURRENT
  //    file's two call shapes (Worker vs. direct call with no `pricing`
  //    field) against each other. The exact origin/main byte-identity scope
  //    (which real surfaces match pre-234 code and which three don't:
  //    GET /api, the unknown-route 404, and GET /api/pricing) is recorded
  //    in edge/DEPLOY.md's "Deploy delta — x402 + Web Bot Auth" section and
  //    product-loop-kit/specs/234-notes.md, not asserted here.
  // =========================================================================
  console.log('\nC. gate DARK by default — every route (free + paid) returns 200, no payment header, no-`pricing`-field-passed body matches the Worker\'s own dark-mode output');

  const ALL_STATIC_ROUTE_IDS = FREE_ROUTE_IDS.concat(PAID_ROUTE_IDS).filter((r) => r !== '/api/pricing');
  for (const routeId of ALL_STATIC_ROUTE_IDS) {
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const req = makeRequest('https://www.defi.garden' + concretePathFor(routeId));
      const res = await worker.fetch(req, { DB: db }, ctx);
      await Promise.allSettled(waited);
      eq(res.status, 200, `DARK: GET ${routeId} -> 200 (no env at all)`);
      eq(res.headers.get('x-payment-response'), null, `DARK: GET ${routeId} carries no X-PAYMENT-RESPONSE header`);
      // FAILURE 3 (verifier round 1): with the gate DARK, EVERY route —
      // including the one that will become paid once the gate is enabled —
      // keeps the pre-234 public 300s caching. This is the other half of
      // the "gated 200 is never public" assertion (see section E below for
      // the gate-ENABLED, payment-verified half on this SAME route).
      eq(res.headers.get('cache-control'), 'public, max-age=' + CACHE_MAX_AGE_SECONDS, `DARK: GET ${routeId} keeps the pre-234 public, max-age=${CACHE_MAX_AGE_SECONDS} caching (gate never applied)`);

      if (routeId !== '/api/pools/:id') {
        // Direct byte-identity check against the pre-234 call shape (no
        // `pricing` field on the request object at all).
        const searchParams = routeId === '/api/forever-number' ? new URLSearchParams('monthly=20') : new URLSearchParams();
        const expected = apiCore.handleApiRequest({ pathname: routeId, searchParams, pools: POPULATION });
        const body = await res.json();
        // /api/health carries `generatedAt` — response-build wall-clock
        // time (api-core.js's own documented one wall-clock exception, see
        // its header comment) — which can genuinely differ by a
        // millisecond between the Worker's own call and this file's
        // separate direct call. Strip it from BOTH sides before comparing;
        // every other field, including every rail figure, is still
        // compared byte-for-byte.
        const bodyForCompare = Object.assign({}, body);
        const expectedForCompare = Object.assign({}, expected.body);
        if (routeId === '/api/health') {
          ok(typeof bodyForCompare.generatedAt === 'string', `DARK: GET ${routeId} carries a generatedAt timestamp`);
          delete bodyForCompare.generatedAt;
          delete expectedForCompare.generatedAt;
        }
        deq(bodyForCompare, expectedForCompare, `DARK: GET ${routeId} body matches apiCore.handleApiRequest() called WITHOUT a pricing field (proves the pricing field is a no-op on this route's output while the gate is dark)`);
      }
    });
  }

  // /api/pricing itself always resolves too (it's a NEW route, not a
  // pre-existing one, so there's no "pre-234 shape" to compare against —
  // just confirm it answers honestly that pricing is disabled).
  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/api/pricing');
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'DARK: GET /api/pricing -> 200');
    const body = await res.json();
    eq(body.availability.enabled, false, 'DARK: /api/pricing honestly reports availability.enabled:false');
  });

  // The `/api` contract document itself names the pricing document and its
  // free/paid split matches PRICE_SCHEDULE — the discovery path spec 234 §2
  // requires ("discoverable without a probe request") is guarded here, not
  // just present. Derived from PRICE_SCHEDULE at test time, both
  // directions — never a hardcoded restatement of the schedule.
  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/api');
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'DARK: GET /api -> 200');
    const body = await res.json();
    ok(body.pricing && typeof body.pricing === 'object', 'GET /api contract document carries a "pricing" block');
    eq(body.pricing.document, '/api/pricing', 'GET /api pricing block names the pricing document at /api/pricing');
    eq(body.pricing.availability.enabled, false, 'DARK: GET /api pricing block honestly reports availability.enabled:false');

    const docFree = (body.pricing.freeRoutes || []).slice().sort();
    const docPaid = (body.pricing.paidRoutes || []).slice().sort();
    // Direction 1: every route the doc calls free/paid really is, per PRICE_SCHEDULE.
    const docFreeNotSchedule = docFree.filter((r) => FREE_ROUTE_IDS.indexOf(r) === -1);
    const docPaidNotSchedule = docPaid.filter((r) => PAID_ROUTE_IDS.indexOf(r) === -1);
    deq(docFreeNotSchedule, [], 'GET /api pricing.freeRoutes must not name a route PRICE_SCHEDULE does not classify free — extra: ' + JSON.stringify(docFreeNotSchedule));
    deq(docPaidNotSchedule, [], 'GET /api pricing.paidRoutes must not name a route PRICE_SCHEDULE does not classify paid — extra: ' + JSON.stringify(docPaidNotSchedule));
    // Direction 2: every route PRICE_SCHEDULE classifies free/paid appears in the doc.
    const scheduleFreeNotDoc = FREE_ROUTE_IDS.filter((r) => docFree.indexOf(r) === -1);
    const schedulePaidNotDoc = PAID_ROUTE_IDS.filter((r) => docPaid.indexOf(r) === -1);
    deq(scheduleFreeNotDoc, [], 'every PRICE_SCHEDULE free route must be named in GET /api pricing.freeRoutes — missing: ' + JSON.stringify(scheduleFreeNotDoc));
    deq(schedulePaidNotDoc, [], 'every PRICE_SCHEDULE paid route must be named in GET /api pricing.paidRoutes — missing: ' + JSON.stringify(schedulePaidNotDoc));
  });

  // A paid MCP tool also resolves normally when dark.
  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forever_number', arguments: { monthly: 20 } } });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json' } });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'DARK: /mcp tools/call forever_number -> 200 (paid tool, gate dark)');
    eq(res.headers.get('x-payment-response'), null, 'DARK: /mcp tools/call forever_number carries no X-PAYMENT-RESPONSE header');
  });

  console.log(`  ${ALL_STATIC_ROUTE_IDS.length} static routes + /api/pricing + 1 paid MCP tool all confirmed DARK-mode 200, no-\`pricing\`-field bodies matching where comparable (see edge/DEPLOY.md for the actual origin/main byte-identity scope)`);

  // =========================================================================
  // D. Gate ENABLED: every free route -> 200, no payment header; every
  //    paid route -> conformant 402.
  // =========================================================================
  console.log('\nD. gate ENABLED — free routes stay 200, paid routes 402');

  for (const routeId of FREE_ROUTE_IDS) {
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const req = makeRequest('https://www.defi.garden' + concretePathFor(routeId));
      const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
      await Promise.allSettled(waited);
      eq(res.status, 200, `ENABLED: free route GET ${routeId} -> 200`);
      eq(res.headers.get('x-payment-response'), null, `ENABLED: free route GET ${routeId} carries no X-PAYMENT-RESPONSE header (never gated)`);
      eq(res.headers.get('cache-control'), 'public, max-age=' + CACHE_MAX_AGE_SECONDS, `ENABLED: free route GET ${routeId} keeps public caching (gate never applies to a free route, even enabled)`);
    });
  }

  for (const routeId of PAID_ROUTE_IDS) {
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db, calls } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const req = makeRequest('https://www.defi.garden' + concretePathFor(routeId));
      const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
      await Promise.allSettled(waited);
      eq(res.status, 402, `ENABLED: paid route GET ${routeId} without payment -> 402`);
      eq(res.headers.get('cache-control'), 'no-store', `ENABLED: 402 for ${routeId} is never publicly cacheable`);
      eq(res.headers.get('access-control-allow-origin'), '*', `ENABLED: 402 for ${routeId} carries the same CORS headers /api always sends`);
      // FAILURE 4 (verifier round 1): a browser-origin agent must be able to
      // SEND X-PAYMENT (Allow-Headers) and READ X-PAYMENT-RESPONSE back
      // (Expose-Headers) on the exact response that tells it payment is
      // required — otherwise the documented flow (X402.md "How to pay")
      // can't complete from a browser at all.
      ok((res.headers.get('access-control-allow-headers') || '').toLowerCase().includes('x-payment'), `ENABLED: 402 for ${routeId} Access-Control-Allow-Headers includes X-PAYMENT`);
      ok((res.headers.get('access-control-expose-headers') || '').toLowerCase().includes('x-payment-response'), `ENABLED: 402 for ${routeId} Access-Control-Expose-Headers includes X-PAYMENT-RESPONSE`);
      const body = await res.json();
      assertConformant402Body(body, `ENABLED: paid route ${routeId} 402 body`);
      await Promise.allSettled(waited);
      eq(calls.length, 1, `ENABLED: paid route GET ${routeId} without payment still logs exactly one agent_reads row`);
      eq(calls[0].args[11], 'required', `ENABLED: paid route GET ${routeId} without payment logs payment_status "required"`);
    });
  }

  console.log(`  ${FREE_ROUTE_IDS.length} free routes stayed 200 with no payment header; ${PAID_ROUTE_IDS.length} paid route(s) returned conformant 402`);

  // =========================================================================
  // E. Valid test-mode payment -> 200 + data + X-PAYMENT-RESPONSE; invalid/
  //    underpaid/mismatched -> 402, never data.
  // =========================================================================
  console.log('\nE. valid vs. invalid payment on a paid route');

  const FOREVER_NUMBER_URL = 'https://www.defi.garden/api/forever-number?monthly=20';
  const foreverNumberChallenge = x402Core.buildChallenge({
    routeId: '/api/forever-number',
    resourceUrl: FOREVER_NUMBER_URL,
    config: x402Core.readConfig(ENABLED_TEST_ENV),
  });

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest(FOREVER_NUMBER_URL, { headers: { 'X-PAYMENT': validPaymentHeaderFor(foreverNumberChallenge) } });
    const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'valid test payment on /api/forever-number -> 200');
    const body = await res.json();
    ok(typeof body.foreverNumber === 'number' || body.foreverNumber === null, 'valid payment: real forever-number data is returned');
    eq(res.headers.get('x-payment-response'), 'settled=false; verified=false; checked=structural; mode=test', 'valid payment: X-PAYMENT-RESPONSE honestly reports a structural test-mode match, never verification or settlement');
    // FAILURE 3 (verifier round 1): THIS is the "gated 200 is never public"
    // half of the pair — section C's DARK-mode loop above already proved
    // this SAME route (/api/forever-number) keeps public, max-age=300
    // caching while the gate is dark; here, gate ENABLED + payment
    // VERIFIED, the 200 must be no-store instead, or a shared cache in
    // front of this Worker could serve this exact paid response to the
    // NEXT (unpaid) requester of the same URL.
    eq(res.headers.get('cache-control'), 'no-store', 'valid payment: a gated 200 (paid route, payment verified) is NEVER publicly cacheable');
    // FAILURE 4: same CORS completeness check as the 402 case above, now on
    // the successful 200 — a browser-origin agent needs to read
    // X-PAYMENT-RESPONSE off THIS response too.
    ok((res.headers.get('access-control-expose-headers') || '').toLowerCase().includes('x-payment-response'), 'valid payment: 200 response Access-Control-Expose-Headers includes X-PAYMENT-RESPONSE');
    eq(calls.length, 1, 'valid payment: exactly one agent_reads row logged');
    eq(calls[0].args[11], 'paid_test', 'valid payment: agent_reads row logs payment_status "paid_test"');
  });

  const INVALID_CASES = [
    ['no header at all', () => undefined],
    ['underpaid', () => underpaidHeaderFor(foreverNumberChallenge)],
    ['mismatched resource', () => mismatchedResourceHeaderFor(foreverNumberChallenge)],
    ['garbage base64', () => 'not-valid-base64-payment!!!'],
  ];
  for (const [label, buildHeader] of INVALID_CASES) {
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db, calls } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const headers = {};
      const headerVal = buildHeader();
      if (headerVal !== undefined) headers['X-PAYMENT'] = headerVal;
      const req = makeRequest(FOREVER_NUMBER_URL, { headers });
      const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
      await Promise.allSettled(waited);
      eq(res.status, 402, `invalid payment (${label}) -> 402, never data`);
      const body = await res.json();
      ok(body.foreverNumber === undefined, `invalid payment (${label}): response body never carries the paid data field`);
      assertConformant402Body(body, `invalid payment (${label})`);
      eq(calls.length, 1, `invalid payment (${label}): exactly one agent_reads row logged`);
      const expectedStatus = label === 'no header at all' ? 'required' : 'rejected';
      eq(calls[0].args[11], expectedStatus, `invalid payment (${label}): agent_reads row logs payment_status "${expectedStatus}"`);
    });
  }

  console.log(`  1 valid test payment -> 200+data+header; ${INVALID_CASES.length} invalid payment shapes -> 402, never data`);

  // =========================================================================
  // F. /mcp tools/call gating: paid tool -> 402 (same conformant body,
  //    transport-level, not JSON-RPC-wrapped); free tools + tools/list ->
  //    normal JSON-RPC. Valid payment on the paid tool -> 200 + real result.
  // =========================================================================
  console.log('\nF. /mcp tools/call gating — paid tool 402, free tools + tools/list normal');

  for (const tool of PAID_TOOLS) {
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db, calls } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const args = tool.name === 'forever_number' ? { monthly: 20 } : {};
      const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool.name, arguments: args } });
      const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json' } });
      const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
      await Promise.allSettled(waited);
      eq(res.status, 402, `/mcp tools/call ${tool.name} (paid) without payment -> 402`);
      eq(res.headers.get('content-type'), 'application/json; charset=utf-8', `/mcp 402 for ${tool.name} is real JSON`);
      // FAILURE 4 (verifier round 1): same CORS completeness check as /api's
      // 402 above, on the /mcp transport-level 402.
      ok((res.headers.get('access-control-allow-headers') || '').toLowerCase().includes('x-payment'), `/mcp 402 for ${tool.name} Access-Control-Allow-Headers includes X-PAYMENT`);
      ok((res.headers.get('access-control-expose-headers') || '').toLowerCase().includes('x-payment-response'), `/mcp 402 for ${tool.name} Access-Control-Expose-Headers includes X-PAYMENT-RESPONSE`);
      const body = await res.json();
      // Same shape /api's 402 uses — NOT a JSON-RPC envelope (no "jsonrpc" key).
      ok(!('jsonrpc' in body), `/mcp tools/call ${tool.name} 402 body is transport-level, NOT JSON-RPC-wrapped`);
      assertConformant402Body(body, `/mcp tools/call ${tool.name} 402 body`);
      eq(calls.length, 1, `/mcp tools/call ${tool.name} without payment logs exactly one agent_reads row`);
      eq(calls[0].args[11], 'required', `/mcp tools/call ${tool.name} without payment logs payment_status "required"`);
      eq(calls[0].args[8], 'mcp', `/mcp tools/call ${tool.name} 402 row is classified path_class "mcp"`);
    });
  }

  for (const tool of FREE_TOOLS) {
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const args = tool.name === 'get_pool' ? { pool_id: REAL_POOL_ID } : (tool.name === 'forever_number' ? { monthly: 20 } : {});
      const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool.name, arguments: args } });
      const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json' } });
      const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
      await Promise.allSettled(waited);
      eq(res.status, 200, `/mcp tools/call ${tool.name} (free) -> 200, ungated even with gate ENABLED`);
      const body = await res.json();
      eq(body.jsonrpc, '2.0', `/mcp tools/call ${tool.name}: normal JSON-RPC envelope`);
    });
  }

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json' } });
    const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'tools/list -> 200, never gated (gate ENABLED)');
    const body = await res.json();
    eq(body.result.tools.length, mcpCore.TOOLS.length, 'tools/list returns every tool, gate ENABLED does not hide the paid one');
  });

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const paymentHeader = validPaymentHeaderFor(x402Core.buildChallenge({
      routeId: '/api/forever-number',
      resourceUrl: 'https://www.defi.garden/api/forever-number',
      config: x402Core.readConfig(ENABLED_TEST_ENV),
    }));
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'forever_number', arguments: { monthly: 20 } } });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json', 'X-PAYMENT': paymentHeader } });
    const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, '/mcp tools/call forever_number WITH valid test payment -> 200');
    eq(res.headers.get('x-payment-response'), 'settled=false; verified=false; checked=structural; mode=test', 'valid /mcp payment: X-PAYMENT-RESPONSE header present, honest structural test-mode check (never verification or settlement)');
    ok((res.headers.get('access-control-expose-headers') || '').toLowerCase().includes('x-payment-response'), 'valid /mcp payment: 200 response Access-Control-Expose-Headers includes X-PAYMENT-RESPONSE');
    const body = await res.json();
    eq(body.jsonrpc, '2.0', 'valid /mcp payment: still a real JSON-RPC result');
    ok(body.result && Array.isArray(body.result.content), 'valid /mcp payment: real tool result content returned');
    eq(calls[0].args[11], 'paid_test', 'valid /mcp payment: agent_reads row logs payment_status "paid_test"');
  });

  console.log(`  ${PAID_TOOLS.length} paid tool(s) -> 402 transport-level; ${FREE_TOOLS.length} free tools + tools/list -> normal; valid payment -> 200+result`);

  // =========================================================================
  // G. Unknown /api/... path stays a 404 carrying rails+endpoints, never a
  //    402 — even with the gate ENABLED (matchRoute() returning null means
  //    "ungated", per x402-core.js's own header comment).
  // =========================================================================
  console.log('\nG. unknown /api/* path -> 404, never 402, even with gate ENABLED');

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/api/this-route-does-not-exist');
    const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 404, 'unknown /api/* path -> 404, not 402, gate ENABLED');
    const body = await res.json();
    eq(body.error, 'not_found', '404 body carries error:"not_found"');
    ok(Array.isArray(body.endpoints), '404 body carries an endpoints list');
    ok(body.rails && typeof body.rails.apySanityLimit === 'number', '404 body carries a rails block');
  });

  // =========================================================================
  // H. Pass-through for non-/api, non-/mcp URLs is untouched — Response-
  //    identity technique, gate ENABLED (proving the gate never leaks past
  //    the /api and /mcp dispatch branches).
  // =========================================================================
  console.log('\nH. pass-through untouched, gate ENABLED — Response-object identity');

  {
    workerModule.__resetPoolsMemoForTests();
    const sentinel = new Response('sentinel body', { status: 200, headers: { 'content-type': 'text/plain' } });
    setFetch(makeWorkerFetchStub({ passthroughResponse: sentinel }));
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/style.css', { headers: { accept: 'text/css' } });
    const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
    await Promise.allSettled(waited);
    ok(res === sentinel, 'a non-/api, non-/mcp request returns the EXACT SAME Response instance fetch(request) produced, even with the x402 gate ENABLED');
    restoreFetch();
  }

  // =========================================================================
  // I. Logging — identity: verified / invalid / unverified (unsigned), and
  //    "never checked" for a non-/api,/mcp path.
  // =========================================================================
  console.log('\nI. logging — identity_status / agent_identity');

  const kp = await generateKeypair();
  const KEYID = 'x402-gate-test-key';
  const KEYRING_ENV = { WEB_BOT_AUTH_KEYS: JSON.stringify({ [KEYID]: await publicKeyToKeyringValue(kp.publicKey) }) };

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const url = 'https://www.defi.garden/api/pools';
    const req = makeRequest(url);
    const nowSec = Math.floor(Date.now() / 1000);
    const { signatureInput, signature } = await signRequest({
      request: req, components: ['@authority', '@method', '@path'], privateKey: kp.privateKey,
      created: nowSec, expires: nowSec + 600, keyid: KEYID,
    });
    req.headers.set('Signature-Input', signatureInput);
    req.headers.set('Signature', signature);
    const res = await worker.fetch(req, Object.assign({ DB: db }, KEYRING_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'signed /api request still serves normally (identity never gates data)');
    eq(calls.length, 1, 'signed request logs exactly one row');
    eq(calls[0].args[9], KEYID, 'signed, verified request logs agent_identity = the real keyid');
    eq(calls[0].args[10], 'verified', 'signed, verified request logs identity_status "verified"');
  });

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/api/pools');
    // No Signature/Signature-Input headers at all -> honestly 'unverified'.
    const res = await worker.fetch(req, Object.assign({ DB: db }, KEYRING_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'unsigned /api request serves normally');
    eq(calls[0].args[9], null, 'unsigned request logs agent_identity = null');
    eq(calls[0].args[10], 'unverified', 'unsigned request logs identity_status "unverified"');
  });

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/api/pools');
    req.headers.set('Signature-Input', 'sig1=("@authority" "@method" "@path");created=1;expires=2;keyid="' + KEYID + '";alg="ed25519";tag="web-bot-auth"');
    req.headers.set('Signature', 'sig1=:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==:'); // garbage signature bytes, will not verify
    const res = await worker.fetch(req, Object.assign({ DB: db }, KEYRING_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'invalidly-signed /api request still serves normally (invalid identity never blocks free data)');
    eq(calls[0].args[10], 'invalid', 'a garbage/non-verifying signature logs identity_status "invalid", never "verified"');
  });

  await withFetch(makeWorkerFetchStub({ passthroughResponse: new Response('llms body', { status: 200, headers: { 'content-type': 'text/plain' } }) }), async () => {
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/llms.txt', { headers: { accept: '*/*' } });
    const res = await worker.fetch(req, Object.assign({ DB: db }, KEYRING_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'a non-/api, non-/mcp agent-surface request (/llms.txt) still serves and logs normally');
    eq(calls.length, 1, '/llms.txt still logs exactly one row');
    eq(calls[0].args[9], null, '/llms.txt: agent_identity is null — identity is NEVER checked outside /api and /mcp');
    eq(calls[0].args[10], null, '/llms.txt: identity_status is null (never checked), NOT "unverified" (that would falsely claim a check happened)');
    eq(calls[0].args[11], 'none', '/llms.txt: payment_status is "none" (payment is not a concept on this path)');
  });

  console.log('  identity logging verified: verified / unverified (unsigned) / invalid (bad signature) / never-checked (non-/api,/mcp) — all four distinguished');

  // =========================================================================
  // J. Logging — the legacy-INSERT fallback: a stub DB that REJECTS the
  //    extended (12-column) SQL specifically but ACCEPTS the legacy
  //    (9-column) one. A row must still land, via the legacy statement.
  // =========================================================================
  console.log('\nJ. logging — legacy-INSERT fallback when the extended statement fails (pre-migration D1)');

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db, calls } = makeFakeDB({ rejectExtended: true });
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/api/pools');
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'response still serves normally even when the extended INSERT would fail pre-migration');
    eq(calls.length, 1, 'exactly one row lands, via the fallback');
    eq(calls[0].isExtended, false, 'the row that landed was written via the LEGACY (9-column) statement, not the extended one');
    eq(calls[0].args.length, 9, 'the legacy statement binds exactly 9 positional args');
    eq(calls[0].args[8], 'api', 'the fallback row still carries the correct path_class');
  });

  // Both-succeed control (the ordinary case): the extended statement is
  // used, never the legacy one — proves the fallback path is only taken
  // on failure, not "always legacy" or "always extended, ignoring".
  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/api/pools');
    await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(calls.length, 1, 'control: exactly one row lands when both statements would succeed');
    eq(calls[0].isExtended, true, 'control: the EXTENDED (12-column) statement is used when it does not fail — the fallback is not silently preferred');
    eq(calls[0].args.length, 12, 'control: the extended statement binds exactly 12 positional args');
  });

  console.log('  legacy-INSERT fallback confirmed: extended attempted first, legacy used only on failure, a row always lands');

  // =========================================================================
  // K. Non-vacuity, end-to-end — FAILURE 1 (verifier round 1, backlog 234):
  //    a route added to api-core.js's live `ROUTES` dispatch table WITHOUT a
  //    PRICE_SCHEDULE entry classifies PAID (default-paid) and the REAL
  //    Worker returns 402 for it with the gate ENABLED, never 200. This is
  //    the verifier's own reproduction, driven end-to-end against the real
  //    Worker rather than just against the pure classifier: the injected
  //    entry below is spliced directly into `apiCore.ROUTES` — the SAME
  //    table `handleApiRequest`/`matchRouteId` walk, and the ONLY dispatch
  //    code either of them has — SIMULATING a future computed-KPI endpoint
  //    (a Sharpe-ratio route) someone forgot to add to PRICE_SCHEDULE.
  //    Popped back out (and re-verified gone) before this section returns.
  // =========================================================================
  console.log('\nK. non-vacuity — a dispatcher route with no PRICE_SCHEDULE entry classifies paid, and the real Worker 402s it (simulating a forgotten-to-price computed-KPI endpoint)');

  const INJECTED_ROUTE_ID = '/api/sharpe';
  eq(apiCore.matchRouteId(INJECTED_ROUTE_ID), null, 'sanity: /api/sharpe does not exist yet');
  ok(!Object.prototype.hasOwnProperty.call(x402Core.PRICE_SCHEDULE, INJECTED_ROUTE_ID), 'sanity: /api/sharpe has no PRICE_SCHEDULE entry');

  const injectedRoute = {
    id: INJECTED_ROUTE_ID,
    method: 'GET',
    description: 'NON-VACUITY TEST FIXTURE ONLY (test_x402_gate.js section K) — simulates a future computed-KPI ' +
      'endpoint (a Sharpe-ratio route) someone forgot to add to PRICE_SCHEDULE. Popped back out of ROUTES ' +
      'before this section returns; never present outside this one section\'s scope.',
    match: function (path) { return path === INJECTED_ROUTE_ID; },
    handle: function () { return { status: 200, body: { sharpe: 1.23, note: 'test fixture data, never real' } }; },
  };
  apiCore.ROUTES.push(injectedRoute);

  try {
    eq(apiCore.matchRouteId(INJECTED_ROUTE_ID), INJECTED_ROUTE_ID, 'the injected route is now recognized by the real dispatcher (matchRouteId)');
    eq(x402Core.matchRoute(INJECTED_ROUTE_ID), INJECTED_ROUTE_ID, 'x402Core.matchRoute delegates to the SAME dispatcher, so it also recognizes the injected route');
    const injectedClassification = x402Core.classifyRoute(INJECTED_ROUTE_ID);
    eq(injectedClassification.tier, 'paid', 'the injected route, absent from PRICE_SCHEDULE, classifies PAID by default (DEFAULT_TIER)');
    eq(injectedClassification.explicit, false, 'the injected route classification carries explicit:false (not an explicit schedule entry)');

    // Drive the REAL Worker: gate ENABLED, no payment -> must 402, never 200.
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db, calls } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const req = makeRequest('https://www.defi.garden' + INJECTED_ROUTE_ID);
      const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
      await Promise.allSettled(waited);
      eq(res.status, 402, 'ENABLED: the injected, unpriced route -> 402, NOT 200 — default-paid actually enforced end-to-end through the real Worker (this is the exact scenario FAILURE 1 reproduced: a route reachable through the dispatcher but never added to PRICE_SCHEDULE)');
      const body = await res.json();
      assertConformant402Body(body, 'injected unpriced route 402 body');
      await Promise.allSettled(waited);
      eq(calls.length, 1, 'the injected route without payment still logs exactly one agent_reads row');
      eq(calls[0].args[11], 'required', 'the injected route without payment logs payment_status "required"');
    });

    // Gate DARK: the injected route still serves its (fixture) 200
    // normally — the DARK-by-default guarantee holds for an injected route
    // exactly as it does for a real one, proving the gate's dark-mode
    // behavior does not depend on the route being a pre-known one.
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const req = makeRequest('https://www.defi.garden' + INJECTED_ROUTE_ID);
      const res = await worker.fetch(req, { DB: db }, ctx);
      await Promise.allSettled(waited);
      eq(res.status, 200, 'DARK: the injected route still serves 200 with the gate dark (fixture data)');
    });
  } finally {
    // Restore: pop the injected route back out, regardless of outcome above.
    const poppedIndex = apiCore.ROUTES.indexOf(injectedRoute);
    ok(poppedIndex !== -1, 'sanity: the injected route is still the one we pushed (nothing else mutated ROUTES concurrently)');
    apiCore.ROUTES.splice(poppedIndex, 1);
  }

  eq(apiCore.matchRouteId(INJECTED_ROUTE_ID), null, 'restored: /api/sharpe no longer exists after the injected route is popped back out');
  eq(x402Core.matchRoute(INJECTED_ROUTE_ID), null, 'restored: x402Core.matchRoute agrees — no longer recognized');

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden' + INJECTED_ROUTE_ID);
    const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 404, 'restored: the Worker now answers /api/sharpe with the ordinary honest 404 again, not 402 and not the fixture 200');
  });

  console.log('  non-vacuity confirmed end-to-end: an unpriced dispatcher route classifies paid and the real Worker 402s it; ROUTES fully restored after');

  // =========================================================================
  // L. Non-vacuity, end-to-end — FINDING 2 (verifier round 2, backlog 234):
  //    an MCP tool whose DECLARED route is free but whose DISPATCHED
  //    pathname (argsToRequest()'s own output) is paid must still 402 with
  //    the gate ENABLED, never serve the paid body for free. This is the
  //    verifier's own reproduction, driven end-to-end against the real
  //    Worker: the injected tool below is spliced directly into
  //    mcpCore.TOOLS — the SAME array handleMcp()'s gate and
  //    mcp-core.js's own dispatcher both read — SIMULATING a future tool
  //    (a "budget_helper"-shaped tool) whose author declared it against
  //    the wrong/stale route. Popped back out (and re-verified gone)
  //    before this section returns.
  // =========================================================================
  console.log('\nL. non-vacuity — an MCP tool with a FREE declared route but a PAID dispatched pathname 402s (simulating a mis-declared future tool)');

  const INJECTED_TOOL_NAME = 'budget_helper_selfdefeat_fixture';
  ok(!mcpCore.TOOLS.some((t) => t.name === INJECTED_TOOL_NAME), 'sanity: the injected tool name does not already exist');

  const decoyPaidDispatchTool = {
    name: INJECTED_TOOL_NAME,
    route: '/api/pools', // DECLARES itself as the FREE pools route...
    description: 'NON-VACUITY TEST FIXTURE ONLY (test_x402_gate.js section L) — simulates a future tool ' +
      '(e.g. a "budget_helper") whose declared route is free but whose argsToRequest() actually dispatches a ' +
      'PAID pathname. Popped back out of mcpCore.TOOLS before this section returns; never present outside this ' +
      'one section\'s scope.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    argsToRequest: function () {
      // ...but actually dispatches the PAID forever-number route — the
      // verifier's exact reproduction: served 200 with the full paid body,
      // gate ON, no payment, before this finding's fix.
      return { pathname: '/api/forever-number', searchParams: new URLSearchParams('monthly=20') };
    },
  };
  mcpCore.TOOLS.push(decoyPaidDispatchTool);

  try {
    // Gate ENABLED, no payment -> must 402 (keyed on the DISPATCHED paid
    // pathname), never 200 with the paid forever-number body.
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db, calls } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: INJECTED_TOOL_NAME, arguments: {} } });
      const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json' } });
      const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
      await Promise.allSettled(waited);
      eq(res.status, 402, 'ENABLED: the mis-declared (free-labelled, paid-dispatching) tool -> 402, NOT 200 — the gate keys on the DISPATCHED pathname, not the tool\'s own declared route (this is FINDING 2\'s exact reproduction: a free-declared tool serving paid data for free)');
      const body = await res.json();
      ok(!('jsonrpc' in body), 'ENABLED: mis-declared tool 402 body is transport-level, NOT JSON-RPC-wrapped (same shape every other /mcp 402 uses)');
      assertConformant402Body(body, 'mis-declared tool 402 body');
      eq(body.accepts[0].resource, 'https://www.defi.garden/api/forever-number', 'ENABLED: the 402 challenge resource names the DISPATCHED route (/api/forever-number), not the declared one (/api/pools)');
      await Promise.allSettled(waited);
      eq(calls.length, 1, 'the mis-declared tool without payment still logs exactly one agent_reads row');
      eq(calls[0].args[11], 'required', 'the mis-declared tool without payment logs payment_status "required"');
    });

    // Gate DARK: the injected tool still serves its (real, dispatched)
    // forever-number data normally — the DARK-by-default guarantee holds
    // for a mis-declared tool exactly as it does for an honestly-declared
    // one, proving this fix did not change dark-mode behavior at all.
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: INJECTED_TOOL_NAME, arguments: {} } });
      const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json' } });
      const res = await worker.fetch(req, { DB: db }, ctx);
      await Promise.allSettled(waited);
      eq(res.status, 200, 'DARK: the mis-declared tool still serves 200 with the gate dark (no payment concept applies at all when X402_ENABLED is unset)');
      const body = await res.json();
      eq(body.jsonrpc, '2.0', 'DARK: still a normal JSON-RPC envelope');
      ok(body.result && Array.isArray(body.result.content), 'DARK: real dispatched (forever-number) content returned');
    });
  } finally {
    // Restore: pop the injected tool back out, regardless of outcome above.
    const poppedIndex = mcpCore.TOOLS.indexOf(decoyPaidDispatchTool);
    ok(poppedIndex !== -1, 'sanity: the injected tool is still the one we pushed (nothing else mutated TOOLS concurrently)');
    mcpCore.TOOLS.splice(poppedIndex, 1);
  }

  ok(!mcpCore.TOOLS.some((t) => t.name === INJECTED_TOOL_NAME), 'restored: the injected tool no longer exists in mcpCore.TOOLS');

  await withFetch(makeWorkerFetchStub({}), async () => {
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: INJECTED_TOOL_NAME, arguments: {} } });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json' } });
    const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'restored: the Worker now answers with the ordinary "unknown tool" JSON-RPC error again (status 200 — a JSON-RPC error, not a transport 402)');
    const body = await res.json();
    eq(body.error && body.error.code, -32602, 'restored: unknown-tool error code -32602, matching mcp-core.js\'s own ordinary behavior');
  });

  console.log('  non-vacuity confirmed end-to-end: a free-declared, paid-dispatching tool 402s with the gate enabled and serves normally when dark; TOOLS fully restored after');

  // =========================================================================
  // M. The fallback half of FINDING 2's fix: when the dispatched-pathname
  //    probe itself THROWS (a broken/future tool's argsToRequest blows up),
  //    the gate must fall back to the DECLARED classification only — never
  //    fail closed to "paid". A FREE-declared tool whose argsToRequest
  //    always throws must still reach mcp-core.js's own ordinary error
  //    handling (a JSON-RPC -32603 Internal error, since the SAME throw
  //    happens again inside the real dispatch), never an unrelated 402.
  // =========================================================================
  console.log('\nM. fallback — a FREE-declared tool whose argsToRequest() throws falls back to the declared (free) classification, never fails closed to paid');

  const THROWING_TOOL_NAME = 'always_throws_selfdefeat_fixture';
  const throwingArgsTool = {
    name: THROWING_TOOL_NAME,
    route: '/api/pools', // declared FREE
    description: 'NON-VACUITY TEST FIXTURE ONLY (test_x402_gate.js section M) — argsToRequest always throws, ' +
      'simulating a broken/future tool implementation. Popped back out before this section returns.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    argsToRequest: function () { throw new Error('synthetic argsToRequest failure (test fixture only)'); },
  };
  mcpCore.TOOLS.push(throwingArgsTool);

  try {
    await withFetch(makeWorkerFetchStub({}), async () => {
      const { db } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: THROWING_TOOL_NAME, arguments: {} } });
      const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json' } });
      const res = await worker.fetch(req, Object.assign({ DB: db }, ENABLED_TEST_ENV), ctx);
      await Promise.allSettled(waited);
      ok(res.status !== 402, 'ENABLED: a FREE-declared tool whose dispatched-pathname probe throws is NOT gated to 402 (fails open to the declared classification, not closed to paid)');
      eq(res.headers.get('x-payment-response'), null, 'ENABLED: no X-PAYMENT-RESPONSE header — the gate never applied to this request at all');
      const body = await res.json();
      eq(body.jsonrpc, '2.0', 'ENABLED: still a normal JSON-RPC envelope (the SAME argsToRequest throw happens again in the real dispatch, caught by mcp-core.js\'s own -32603 handling)');
      eq(body.error && body.error.code, -32603, 'ENABLED: the real dispatch\'s own throw surfaces as an ordinary JSON-RPC Internal error, not a fabricated payment requirement');
    });
  } finally {
    const poppedIndex = mcpCore.TOOLS.indexOf(throwingArgsTool);
    ok(poppedIndex !== -1, 'sanity: the throwing-tool fixture is still the one we pushed');
    mcpCore.TOOLS.splice(poppedIndex, 1);
  }
  ok(!mcpCore.TOOLS.some((t) => t.name === THROWING_TOOL_NAME), 'restored: the throwing-tool fixture no longer exists in mcpCore.TOOLS');

  console.log('  fallback confirmed: a throwing dispatched-pathname probe on a FREE-declared tool never fails closed to paid');

  // =========================================================================
  // N. FINDING 3 (verifier round 2, backlog 234) — MCP `explain_rails`'s
  //    `pricing.availability` must deep-equal `GET /api`'s `pricing` block,
  //    in BOTH the DARK state AND the ENABLED/live state — driven against
  //    the REAL Worker with real env vars on both sides, never a pure-
  //    function-level comparison alone (that would not catch the Worker
  //    forgetting to THREAD the state through, which is exactly what this
  //    finding was). One direction alone (dark) passed before this fix by
  //    COINCIDENCE — an absent `pricing` field and an explicit
  //    `{enabled:false,mode:'test'}` both read as "disabled" to
  //    `buildContractDoc`/`buildPricingDoc` — so both states must be
  //    asserted for this to be real evidence (per the finding's own
  //    instruction: "assert BOTH — one direction alone passes today").
  // =========================================================================
  console.log('\nN. explain_rails pricing.availability === GET /api pricing.availability, both DARK and ENABLED/live');

  async function fetchApiPricingBlock(env) {
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/api');
    const res = await worker.fetch(req, Object.assign({ DB: db }, env || {}), ctx);
    await Promise.allSettled(waited);
    const body = await res.json();
    return body.pricing;
  }

  async function fetchExplainRailsPricingBlock(env) {
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'explain_rails', arguments: {} } });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json' } });
    const res = await worker.fetch(req, Object.assign({ DB: db }, env || {}), ctx);
    await Promise.allSettled(waited);
    const body = await res.json();
    const parsed = JSON.parse(body.result.content[0].text);
    return parsed.pricing;
  }

  await withFetch(makeWorkerFetchStub({}), async () => {
    const apiPricing = await fetchApiPricingBlock({});
    const mcpPricing = await fetchExplainRailsPricingBlock({});
    eq(apiPricing.availability.enabled, false, 'sanity: DARK GET /api really reports availability.enabled:false');
    deq(mcpPricing, apiPricing, 'DARK: explain_rails\' pricing block deep-equals GET /api\'s pricing block');
  });

  const ENABLED_LIVE_ENV = { X402_ENABLED: 'true', X402_MODE: 'live', X402_FACILITATOR_URL: 'https://facilitator.example.test' };
  await withFetch(makeWorkerFetchStub({}), async () => {
    const apiPricing = await fetchApiPricingBlock(ENABLED_LIVE_ENV);
    eq(apiPricing.availability.enabled, true, 'sanity: ENABLED/live GET /api really reports availability.enabled:true');
    eq(apiPricing.availability.mode, 'live', 'sanity: ENABLED/live GET /api really reports availability.mode:"live"');
    const mcpPricing = await fetchExplainRailsPricingBlock(ENABLED_LIVE_ENV);
    // THIS is the assertion that was false before the fix: explain_rails
    // reported {enabled:false, mode:'test'} (the DARK default,
    // unconditionally) for the SAME env, same instant, GET /api reported
    // {enabled:true, mode:'live'} for.
    deq(mcpPricing, apiPricing, 'ENABLED/live: explain_rails\' pricing block deep-equals GET /api\'s pricing block — the actual FINDING 3 regression (MCP falsely stuck reporting the DARK default while GET /api correctly reported live)');
  });

  console.log('  pricing-state threading confirmed: explain_rails and GET /api agree in both the dark and the enabled/live state');

  restoreFetch();

  console.log(`\ntest_x402_gate.js: ${passed}/${total} assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`test_x402_gate.js: FAILED after ${passed}/${total} assertions passed`);
  console.error(err);
  process.exitCode = 1;
});
