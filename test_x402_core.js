/* Unit tests for edge/x402-core.js (backlog 234, spec 234). Plain Node,
   plain lane (no browser-driving test framework anywhere in this file or in
   anything it requires — see run-tests.js's transitive-require lane
   classifier), no network — every `fetchImpl` this file passes into
   verifyPayment() is a hand-written fake, never a real `fetch`.

   Population comes from the REAL, committed edge/api-core.js `ENDPOINTS`
   list, the REAL edge/mcp-core.js `TOOLS` array, and the REAL
   data/pools-snapshot.json pool ids — never a hardcoded stand-in list, per
   product-loop-kit/RAZOR.md's weakest-hypothesis rule: assert invariants
   over the population, not a handful of hand-picked instances.

   Run: node test_x402_core.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let total = 0;
function ok(cond, msg) { total++; assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { total++; assert.strictEqual(a, b, msg); passed++; }
function deepEq(a, b, msg) { total++; assert.deepStrictEqual(a, b, msg); passed++; }

const ROOT = __dirname;
const EDGE_DIR = path.join(ROOT, 'edge');

const x402 = require(path.join(EDGE_DIR, 'x402-core.js'));
const apiCore = require(path.join(EDGE_DIR, 'api-core.js'));
const mcpCore = require(path.join(EDGE_DIR, 'mcp-core.js'));

// ===========================================================================
// A. Population.
// ===========================================================================
console.log('A. population — api-core ENDPOINTS, mcp-core TOOLS, data/pools-snapshot.json');

const SNAPSHOT_PATH = path.join(ROOT, 'data', 'pools-snapshot.json');
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
ok(snapshot && Array.isArray(snapshot.pools), 'sanity: data/pools-snapshot.json has a .pools array');
const POPULATION = snapshot.pools;
ok(POPULATION.length > 1000, `sanity: expected a real, large population, got ${POPULATION.length}`);

ok(Array.isArray(apiCore.ENDPOINTS) && apiCore.ENDPOINTS.length > 0, 'sanity: api-core.js exports a non-empty ENDPOINTS array');
ok(Array.isArray(mcpCore.TOOLS) && mcpCore.TOOLS.length > 0, 'sanity: mcp-core.js exports a non-empty TOOLS array');
console.log(`  loaded ${POPULATION.length} pools, ${apiCore.ENDPOINTS.length} api-core endpoints, ${mcpCore.TOOLS.length} mcp tools`);

// ===========================================================================
// B. Mirror rule, BOTH DIRECTIONS: PRICE_SCHEDULE route-id set <-> the REAL
//    api-core ENDPOINTS path set. No hardcoded exception literal — as of
//    backlog 234's follow-up fix, `/api/pricing` is a genuine ENDPOINTS
//    entry (see product-loop-kit/specs/234-notes.md, "Deviation 1 —
//    reversed"), so the old `.concat(['/api/pricing'])` would now produce a
//    SPURIOUS duplicate and mask a real drift instead of catching one —
//    exactly the mirror-drift failure mode this section exists to prevent
//    (product-loop-kit/RAZOR.md example 5, item 212).
// ===========================================================================
console.log('\nB. mirror rule — PRICE_SCHEDULE route ids <-> the REAL api-core ENDPOINTS paths');

// ENDPOINTS integrity first: no duplicate paths. A duplicate here would let
// a mismatched-length ENDPOINTS array still sort-and-deepEqual "correctly"
// against a schedule that happened to carry a matching duplicate key set —
// this is the exact gap the old `.concat()` exception could have masked.
const endpointPathCounts = {};
for (const e of apiCore.ENDPOINTS) {
  endpointPathCounts[e.path] = (endpointPathCounts[e.path] || 0) + 1;
}
const duplicateEndpointPaths = Object.keys(endpointPathCounts).filter((p) => endpointPathCounts[p] > 1);
deepEq(duplicateEndpointPaths, [], 'api-core ENDPOINTS must contain no duplicate path — duplicates found: ' + JSON.stringify(duplicateEndpointPaths));

const scheduleRouteIds = Array.from(new Set(Object.keys(x402.PRICE_SCHEDULE))).sort();
const expectedRouteIds = Array.from(new Set(apiCore.ENDPOINTS.map((e) => e.path))).sort();

// Direction 1: every real api-core route has a schedule entry.
const missingFromSchedule = expectedRouteIds.filter((r) => scheduleRouteIds.indexOf(r) === -1);
deepEq(missingFromSchedule, [], 'every real api-core ENDPOINTS route must have a PRICE_SCHEDULE entry — missing route(s): ' + JSON.stringify(missingFromSchedule));

// Direction 2: every schedule entry corresponds to a real, existing route
// (no price entry for a route that doesn't exist in ENDPOINTS).
const extraInSchedule = scheduleRouteIds.filter((r) => expectedRouteIds.indexOf(r) === -1);
deepEq(extraInSchedule, [], 'PRICE_SCHEDULE must not contain an entry for a route that does not exist in api-core.js ENDPOINTS — extra route(s): ' + JSON.stringify(extraInSchedule));

// Set-equality, restated directly (belt-and-braces on the two directional
// checks above) — this is the real route table, not a resemblance of it.
deepEq(scheduleRouteIds, expectedRouteIds, 'PRICE_SCHEDULE route-id set must equal api-core ENDPOINTS paths, exactly — no hardcoded /api/pricing exception literal');

console.log(`  PRICE_SCHEDULE has ${scheduleRouteIds.length} route ids, set-equal to api-core's ${apiCore.ENDPOINTS.length} REAL ENDPOINTS paths (both directions); ENDPOINTS carries no duplicate path`);

// ===========================================================================
// B2. THREE-WAY mirror, guarding the CLASS section B's two-way check does
//    not (verifier round 1, backlog 234, FAILURE 1): the REAL dispatcher's
//    route ids (api-core.js's `ROUTES` table — the SAME table
//    `handleApiRequest` and `matchRouteId` both walk, and nothing else) <->
//    `ENDPOINTS`' paths <-> `PRICE_SCHEDULE`'s keys, all three pairs, BOTH
//    directions each (6 checks). Section B only ever compared ENDPOINTS
//    against PRICE_SCHEDULE — it could not see a route that reached a real
//    request through the dispatcher but was never added to ENDPOINTS at
//    all (exactly the verifier's reproduction: `if (path === '/api/sharpe')
//    return {...}` spliced directly into the old if-chain, invisible to
//    ENDPOINTS, invisible to the schedule, and — because x402-core.js's old
//    matchRoute() derived its id list from PRICE_SCHEDULE's own keys, not
//    from the dispatcher — invisible to the payment gate too). With
//    `ENDPOINTS` now DERIVED from `ROUTES` (api-core.js's own change), the
//    dispatcher<->ENDPOINTS direction is structurally guaranteed (same
//    array, same map) — this section still asserts it explicitly, with a
//    genuine self-defeat case proving the check is not vacuous, rather than
//    relying on "it's derived, so it must be fine" as an argument.
// ===========================================================================
console.log('\nB2. three-way mirror — dispatcher ROUTES ids <-> ENDPOINTS paths <-> PRICE_SCHEDULE keys, both directions each');

/** Pure, reusable across the real check and every self-defeat case below —
 * six directional gap lists, any non-empty one is a real drift. */
function computeThreeWayMirrorGaps(dispatcherIds, endpointPaths, scheduleKeys) {
  const d = Array.from(new Set(dispatcherIds));
  const e = Array.from(new Set(endpointPaths));
  const s = Array.from(new Set(scheduleKeys));
  return {
    dispatcherNotInEndpoints: d.filter((r) => e.indexOf(r) === -1),
    endpointsNotInDispatcher: e.filter((r) => d.indexOf(r) === -1),
    dispatcherNotInSchedule: d.filter((r) => s.indexOf(r) === -1),
    scheduleNotInDispatcher: s.filter((r) => d.indexOf(r) === -1),
    endpointsNotInSchedule: e.filter((r) => s.indexOf(r) === -1),
    scheduleNotInEndpoints: s.filter((r) => e.indexOf(r) === -1),
  };
}

const realDispatcherIds = apiCore.ROUTES.map((r) => r.id);
const realGapsThreeWay = computeThreeWayMirrorGaps(realDispatcherIds, apiCore.ENDPOINTS.map((e) => e.path), Object.keys(x402.PRICE_SCHEDULE));
deepEq(realGapsThreeWay, {
  dispatcherNotInEndpoints: [], endpointsNotInDispatcher: [],
  dispatcherNotInSchedule: [], scheduleNotInDispatcher: [],
  endpointsNotInSchedule: [], scheduleNotInEndpoints: [],
}, 'the REAL dispatcher route ids, ENDPOINTS paths, and PRICE_SCHEDULE keys are set-equal, all three pairs, both directions — no gap in any of the six directions: ' + JSON.stringify(realGapsThreeWay));

console.log(`  ${realDispatcherIds.length} real dispatcher route ids, set-equal to ENDPOINTS and PRICE_SCHEDULE in all six directions`);

// Self-defeat, THREE separate broken inputs, one per collection — each
// proves the specific direction(s) that collection's absence would break
// actually DOES fail, not just that the happy path passes.
{
  // (i) A route the dispatcher serves but ENDPOINTS/PRICE_SCHEDULE never
  // heard of — the verifier's EXACT reproduction shape.
  const brokenDispatcher = realDispatcherIds.concat(['/api/sharpe']);
  const gaps = computeThreeWayMirrorGaps(brokenDispatcher, apiCore.ENDPOINTS.map((e) => e.path), Object.keys(x402.PRICE_SCHEDULE));
  deepEq(gaps.dispatcherNotInEndpoints, ['/api/sharpe'], 'self-defeat (i): a dispatcher-only route is reported as dispatcherNotInEndpoints');
  deepEq(gaps.dispatcherNotInSchedule, ['/api/sharpe'], 'self-defeat (i): a dispatcher-only route is reported as dispatcherNotInSchedule');
  deepEq(gaps.endpointsNotInDispatcher, [], 'self-defeat (i): no spurious endpointsNotInDispatcher report');
  deepEq(gaps.scheduleNotInDispatcher, [], 'self-defeat (i): no spurious scheduleNotInDispatcher report');
}
{
  // (ii) A route ENDPOINTS lists but the dispatcher/schedule don't (a stale
  // ENDPOINTS entry left behind after a route was removed).
  const brokenEndpoints = apiCore.ENDPOINTS.map((e) => e.path).concat(['/api/stale-removed-route']);
  const gaps = computeThreeWayMirrorGaps(realDispatcherIds, brokenEndpoints, Object.keys(x402.PRICE_SCHEDULE));
  deepEq(gaps.endpointsNotInDispatcher, ['/api/stale-removed-route'], 'self-defeat (ii): an ENDPOINTS-only route is reported as endpointsNotInDispatcher');
  deepEq(gaps.endpointsNotInSchedule, ['/api/stale-removed-route'], 'self-defeat (ii): an ENDPOINTS-only route is reported as endpointsNotInSchedule');
  deepEq(gaps.dispatcherNotInEndpoints, [], 'self-defeat (ii): no spurious dispatcherNotInEndpoints report');
  deepEq(gaps.scheduleNotInEndpoints, [], 'self-defeat (ii): no spurious scheduleNotInEndpoints report');
}
{
  // (iii) A route PRICE_SCHEDULE prices but the dispatcher/ENDPOINTS don't
  // serve (a schedule entry for a route that was never actually built).
  const brokenSchedule = Object.keys(x402.PRICE_SCHEDULE).concat(['/api/never-built']);
  const gaps = computeThreeWayMirrorGaps(realDispatcherIds, apiCore.ENDPOINTS.map((e) => e.path), brokenSchedule);
  deepEq(gaps.scheduleNotInDispatcher, ['/api/never-built'], 'self-defeat (iii): a schedule-only route is reported as scheduleNotInDispatcher');
  deepEq(gaps.scheduleNotInEndpoints, ['/api/never-built'], 'self-defeat (iii): a schedule-only route is reported as scheduleNotInEndpoints');
  deepEq(gaps.dispatcherNotInSchedule, [], 'self-defeat (iii): no spurious dispatcherNotInSchedule report');
  deepEq(gaps.endpointsNotInSchedule, [], 'self-defeat (iii): no spurious endpointsNotInSchedule report');
}

console.log('  three-way self-defeat confirmed: each of the three collections, broken independently, is caught in exactly the directions it should be — no false negatives, no spurious false positives');

// Direct probe of matchRoute's DELEGATION mechanism (no Worker needed): push
// a synthetic, unscheduled route onto the REAL api-core.js `ROUTES` table
// and confirm `x402.matchRoute` recognizes it immediately. This is the
// specific regression FAILURE 1 was — `matchRoute` deriving its own static
// id list from PRICE_SCHEDULE's own keys instead of delegating to the live
// dispatcher — and the real ENDPOINTS/PRICE_SCHEDULE population above can
// never exercise it (every real route is already in the schedule, so the
// old, broken derivation and the new, correct delegation agree on all of
// them). Only an unscheduled-but-dispatched route tells the two apart.
{
  const probeId = '/api/three-way-mirror-probe';
  eq(apiCore.matchRouteId(probeId), null, 'sanity: probe route id does not exist in the real dispatcher yet');
  eq(x402.matchRoute(probeId), null, 'sanity: x402.matchRoute agrees — probe route id not recognized yet');
  const probeRoute = {
    id: probeId,
    method: 'GET',
    description: 'test_x402_core.js section B2 probe fixture only — popped back out immediately below.',
    match: function (path) { return path === probeId; },
    handle: function () { return { status: 200, body: {} }; },
  };
  apiCore.ROUTES.push(probeRoute);
  try {
    eq(apiCore.matchRouteId(probeId), probeId, 'the live dispatcher recognizes the probe route the instant it is pushed onto ROUTES');
    eq(x402.matchRoute(probeId), probeId, 'x402.matchRoute recognizes it too — proving it DELEGATES to the live dispatcher rather than deriving a static id list from PRICE_SCHEDULE\'s own keys (PRICE_SCHEDULE has no entry for this probe route at all)');
  } finally {
    apiCore.ROUTES.splice(apiCore.ROUTES.indexOf(probeRoute), 1);
  }
  eq(apiCore.matchRouteId(probeId), null, 'probe route popped back out cleanly — dispatcher no longer recognizes it');
  eq(x402.matchRoute(probeId), null, 'x402.matchRoute agrees after cleanup');
}

console.log('  matchRoute delegation probe confirmed: a route pushed onto the live ROUTES table is recognized immediately, with no PRICE_SCHEDULE entry required');

// ===========================================================================
// C. Every mcp-core TOOL's `route` resolves to a schedule entry, and
//    classifyMcpTool agrees with classifyRoute(tool.route) for every tool.
// ===========================================================================
console.log('\nC. mcp-core TOOLS route resolution + classifyMcpTool agreement');

for (const tool of mcpCore.TOOLS) {
  ok(typeof tool.route === 'string' && tool.route.length > 0, `tool "${tool.name}" declares a non-empty route field`);
  ok(Object.prototype.hasOwnProperty.call(x402.PRICE_SCHEDULE, tool.route), `tool "${tool.name}"'s route "${tool.route}" resolves to a PRICE_SCHEDULE entry`);

  const viaTool = x402.classifyMcpTool(tool.name, mcpCore.TOOLS);
  const viaRoute = x402.classifyRoute(tool.route);
  ok(viaTool !== null, `classifyMcpTool("${tool.name}", TOOLS) must not be null for a real tool`);
  deepEq(viaTool, viaRoute, `classifyMcpTool("${tool.name}", TOOLS) must agree exactly with classifyRoute("${tool.route}")`);
}
console.log(`  ${mcpCore.TOOLS.length}/${mcpCore.TOOLS.length} mcp-core tools resolve to a schedule entry, all agree with classifyRoute`);

// Unknown tool name -> null.
eq(x402.classifyMcpTool('this_tool_does_not_exist', mcpCore.TOOLS), null, 'classifyMcpTool on an unknown tool name returns null');
eq(x402.classifyMcpTool('find_pools', []), null, 'classifyMcpTool against an empty tools array returns null (tool cannot be found)');

// ===========================================================================
// D. Boundary, both directions, population-derived. Positive controls, not
//    definitions — the assertions below are ABOUT the schedule's declared
//    tiers, checked against classifyRoute, never a hardcoded restatement of
//    the schedule itself.
// ===========================================================================
console.log('\nD. boundary — free/paid classification, both directions');

const scheduleFreeRoutes = Object.keys(x402.PRICE_SCHEDULE).filter((r) => x402.PRICE_SCHEDULE[r].tier === 'free');
const schedulePaidRoutes = Object.keys(x402.PRICE_SCHEDULE).filter((r) => x402.PRICE_SCHEDULE[r].tier === 'paid');
ok(scheduleFreeRoutes.length > 0, 'sanity: at least one free route exists in the schedule');
ok(schedulePaidRoutes.length > 0, 'sanity: at least one paid route exists in the schedule');

for (const r of scheduleFreeRoutes) {
  eq(x402.classifyRoute(r).tier, 'free', `every free-tier schedule route classifies as free: ${r}`);
}
for (const r of schedulePaidRoutes) {
  eq(x402.classifyRoute(r).tier, 'paid', `every paid-tier schedule route classifies as paid: ${r}`);
}

// The human's boundary itself (NORTH_STAR 2026-08-05), asserted directly as
// a positive control: current-APY routes free, the computed-KPI route paid.
eq(x402.classifyRoute('/api/pools').tier, 'free', 'boundary: current-APY route /api/pools is free');
eq(x402.classifyRoute('/api/pools/:id').tier, 'free', 'boundary: current-APY route /api/pools/:id is free');
eq(x402.classifyRoute('/api/forever-number').tier, 'paid', 'boundary: computed-KPI route /api/forever-number is paid');
eq(x402.classifyRoute('/api/pricing').tier, 'free', 'boundary: the pricing document itself is free (must be discoverable without paying)');

console.log(`  ${scheduleFreeRoutes.length} free routes, ${schedulePaidRoutes.length} paid route(s), both directions hold; the named boundary positive controls hold`);

// ===========================================================================
// E. Default-paid: an existing-but-unlisted route classifies PAID with
//    explicit:false. Then the SEPARATE self-defeat case: construct a
//    schedule-shaped object missing an entry and show the mirror check
//    (section B's own logic) reports it — proving the guard is real, not
//    just proving classifyRoute's fallback fires (the test_test_registry.js
//    pattern).
// ===========================================================================
console.log('\nE. default-paid fallback + mirror-guard self-defeat case');

const unlistedResult = x402.classifyRoute('/api/some-future-computed-kpi');
eq(unlistedResult.tier, 'paid', 'an existing-but-unlisted route classifies PAID');
eq(unlistedResult.explicit, false, 'an existing-but-unlisted route classification carries explicit:false');
ok(typeof unlistedResult.priceUsdcAtomic === 'string' && unlistedResult.priceUsdcAtomic.length > 0, 'an unlisted route still carries a real price string (never null while tier is paid)');

// Self-defeat: rebuild the mirror check's own logic (section B's) against a
// deliberately broken schedule-shaped object missing one real endpoint, and
// prove the check reports exactly that gap. No `.concat(['/api/pricing'])`
// exception here either — matches section B's real logic exactly.
function computeMirrorGaps(scheduleKeys, endpointPaths) {
  const missing = endpointPaths.filter((r) => scheduleKeys.indexOf(r) === -1);
  const extra = scheduleKeys.filter((r) => endpointPaths.indexOf(r) === -1);
  return { missing, extra };
}

const realEndpointPaths = apiCore.ENDPOINTS.map((e) => e.path);
const brokenScheduleKeys = Object.keys(x402.PRICE_SCHEDULE).filter((r) => r !== '/api/forever-number');
const brokenGaps = computeMirrorGaps(brokenScheduleKeys, realEndpointPaths);
deepEq(brokenGaps.missing, ['/api/forever-number'], 'self-defeat: a schedule missing /api/forever-number is reported as missing that exact route by the same mirror-check logic section B uses');
deepEq(brokenGaps.extra, [], 'self-defeat: removing an entry produces no spurious "extra" report');

const brokenScheduleKeysWithExtra = Object.keys(x402.PRICE_SCHEDULE).concat(['/api/this-route-does-not-exist']);
const brokenGaps2 = computeMirrorGaps(brokenScheduleKeysWithExtra, realEndpointPaths);
deepEq(brokenGaps2.missing, [], 'self-defeat: adding a bogus extra key produces no spurious "missing" report');
deepEq(brokenGaps2.extra, ['/api/this-route-does-not-exist'], 'self-defeat: a schedule with a bogus extra route is reported as extra by the same mirror-check logic');

// And the REAL schedule, run back through the exact same function, reports
// no gaps at all — confirming (e)'s harness matches (b)'s real assertions.
const realGaps = computeMirrorGaps(Object.keys(x402.PRICE_SCHEDULE), realEndpointPaths);
deepEq(realGaps, { missing: [], extra: [] }, 'the real PRICE_SCHEDULE, run through the same mirror-check logic, reports zero gaps');

console.log('  default-paid fallback confirmed; mirror-guard self-defeat case confirmed in both directions');

// ===========================================================================
// F. matchRoute — pool-id collapsing (real ids + hostile segments), and
//    null for unknown /api/* paths.
// ===========================================================================
console.log('\nF. matchRoute — pool-id collapsing + unknown-route null');

const REAL_POOL_ID_SAMPLE = [POPULATION[0].pool, POPULATION[1].pool, POPULATION[Math.floor(POPULATION.length / 2)].pool, POPULATION[POPULATION.length - 1].pool];
for (const id of REAL_POOL_ID_SAMPLE) {
  eq(x402.matchRoute('/api/pools/' + id), '/api/pools/:id', `matchRoute collapses a real pool id (${id}) to /api/pools/:id`);
}

const HOSTILE_SEGMENTS = [
  '100%', '%', '%E0%A4%A', '%zz', '%%', 'x'.repeat(500), 'abc%0adef',
  encodeURIComponent('weird id with spaces'), '..', '%00', 'emoji-' + encodeURIComponent('\u{1F600}'),
];
for (const seg of HOSTILE_SEGMENTS) {
  eq(x402.matchRoute('/api/pools/' + seg), '/api/pools/:id', `matchRoute collapses hostile segment ${JSON.stringify(seg)} to /api/pools/:id without throwing`);
}

// The static routes themselves.
for (const r of scheduleRouteIds.filter((r) => r !== '/api/pools/:id')) {
  eq(x402.matchRoute(r), r, `matchRoute recognizes the static route ${r}`);
}

// Unknown /api/* paths -> null (this is what tells the Worker "let api-core
// answer its own honest 404, ungated" — see x402-core.js's header comment).
// Note: '/api/' (bare, trailing slash) is deliberately NOT in this list —
// matchRoute reuses api-core.js's own normalizePath(), which strips a
// trailing slash exactly like api-core's dispatcher does, so '/api/'
// legitimately resolves to the real '/api' route, not to null.
const UNKNOWN_PATHS = ['/api/bogus', '/api/pools/extra/segments', '/api/Pools', '/apis/pools', '/api/forever-number/extra'];
for (const p of UNKNOWN_PATHS) {
  eq(x402.matchRoute(p), null, `matchRoute returns null for unknown path ${p}`);
}
// And a completely unrelated, non-/api path.
eq(x402.matchRoute('/'), null, 'matchRoute returns null for a non-/api path');
eq(x402.matchRoute('/plan.html'), null, 'matchRoute returns null for a non-/api path (plan.html)');

console.log(`  ${REAL_POOL_ID_SAMPLE.length} real pool ids + ${HOSTILE_SEGMENTS.length} hostile segments all collapse correctly; ${UNKNOWN_PATHS.length + 2} unknown paths return null`);

// ===========================================================================
// G. Challenge conformance.
// ===========================================================================
console.log('\nG. buildChallenge — x402 v1 shape conformance');

const RESOURCE_URL = 'https://www.defi.garden/api/forever-number?monthly=20';

function buildUnconfiguredChallenge() {
  return x402.buildChallenge({
    resourceUrl: RESOURCE_URL,
    routeId: '/api/forever-number',
    config: x402.readConfig({}), // nothing set -> payTo/asset both null
  });
}

const unconfiguredChallenge = buildUnconfiguredChallenge();

deepEq(Object.keys(unconfiguredChallenge).sort(), ['accepts', 'error', 'x402Version'], 'buildChallenge body has EXACTLY the three protocol-level top keys');
eq(unconfiguredChallenge.x402Version, 1, 'x402Version is 1');
ok(typeof unconfiguredChallenge.error === 'string' && unconfiguredChallenge.error.length > 0, 'error is a non-empty string');
ok(Array.isArray(unconfiguredChallenge.accepts) && unconfiguredChallenge.accepts.length === 1, 'accepts is a one-element array');

const acc = unconfiguredChallenge.accepts[0];
const REQUIRED_ACCEPTS_FIELDS = ['scheme', 'network', 'maxAmountRequired', 'resource', 'description', 'mimeType', 'payTo', 'maxTimeoutSeconds', 'asset', 'extra'];
for (const f of REQUIRED_ACCEPTS_FIELDS) {
  ok(Object.prototype.hasOwnProperty.call(acc, f), `accepts[0] carries required field "${f}"`);
}
eq(acc.scheme, 'exact', 'accepts[0].scheme is "exact"');
eq(acc.mimeType, 'application/json', 'accepts[0].mimeType is application/json');
eq(acc.maxTimeoutSeconds, 60, 'accepts[0].maxTimeoutSeconds is 60');
eq(acc.resource, RESOURCE_URL, 'accepts[0].resource is the absolute request URL passed in');
eq(acc.maxAmountRequired, x402.DEFAULT_PRICE_USDC_ATOMIC, 'accepts[0].maxAmountRequired matches the schedule price for /api/forever-number');

// No invented address when unconfigured.
eq(acc.payTo, null, 'unconfigured challenge: payTo is null, never invented');
eq(acc.asset, null, 'unconfigured challenge: asset is null, never invented');
ok(/not configured|X402_PAY_TO/i.test(unconfiguredChallenge.error), 'unconfigured challenge error string honestly says payment is not configured');

// freeAlternatives set-equals the schedule's free routes, derived, not hardcoded.
deepEq((acc.extra.freeAlternatives || []).slice().sort(), x402.freeRoutes().slice().sort(), 'extra.freeAlternatives set-equals x402.freeRoutes() (schedule-derived)');
deepEq(acc.extra.freeAlternatives.slice().sort(), scheduleFreeRoutes.slice().sort(), 'extra.freeAlternatives also set-equals the schedule\'s own free-tier keys, independently derived in this file (section D)');

// Configured case: payTo/asset ARE echoed when config actually carries them
// (using an obviously-fake, clearly-labeled test placeholder — never a real
// address, and this is a TEST-SUPPLIED config value, not anything hardcoded
// in edge/x402-core.js itself).
const FAKE_TEST_CONFIG = x402.readConfig({
  X402_PAY_TO: '0xTEST0000000000000000000000000000000000',
  X402_ASSET: '0xTESTASSET000000000000000000000000000000',
  X402_NETWORK: 'base-sepolia',
});
const configuredChallenge = x402.buildChallenge({ resourceUrl: RESOURCE_URL, routeId: '/api/forever-number', config: FAKE_TEST_CONFIG });
eq(configuredChallenge.accepts[0].payTo, FAKE_TEST_CONFIG.payTo, 'configured challenge: payTo is echoed from config when present');
eq(configuredChallenge.accepts[0].asset, FAKE_TEST_CONFIG.asset, 'configured challenge: asset is echoed from config when present');
eq(configuredChallenge.accepts[0].network, 'base-sepolia', 'configured challenge: network is echoed from config');

console.log('  challenge shape conformant; no address invented when unconfigured; freeAlternatives derived correctly');

// ===========================================================================
// G2. DECLARED route <-> DISPATCHED pathname mirror (verifier round 2,
//    backlog 234, FINDING 2 — detector-signal-coverage.md axis 7, one layer
//    below the round-1 defect on this same item). Section C above proved
//    `classifyMcpTool` agrees with `classifyRoute(tool.route)` — but
//    `tool.route` is a DECLARATION, a label a tool author writes down.
//    What actually gets served is whatever pathname `tool.argsToRequest(args)`
//    builds (mcp-core.js's `handleToolsCall`, the ONLY place a tool call is
//    actually dispatched — see edge/mcp-core.js:350-355). Nothing tied the
//    two together before this round: a future tool could declare a FREE
//    route while its argsToRequest resolved a PAID pathname (the verifier's
//    reproduction — a `budget_helper` tool declaring `/api/pools` while
//    dispatching `/api/forever-number`, served 200 with the full paid body,
//    gate ON, no payment). This section asserts, for EVERY real tool, that
//    the declared route id equals what the SAME live dispatcher /api itself
//    walks (`apiCore.matchRouteId`) resolves the dispatched pathname to —
//    sample args derived from each tool's OWN `inputSchema.required` fields,
//    never a hand-written fixture per tool, so a future tool is covered by
//    construction (RAZOR's population rule, applied to fixture generation
//    rather than a file list).
// ===========================================================================
console.log('\nG2. declared route <-> dispatched pathname mirror (mcp-core TOOLS, every tool)');

/** Generic placeholder value per the property's declared JSON-Schema
 * `type` — good enough to make argsToRequest() build a REAL pathname
 * without needing per-tool domain knowledge (a real pool id, a real
 * dollar amount, etc.) — dispatch only needs a syntactically valid
 * argument, not a semantically meaningful one, for this check's purpose. */
function sampleValueForSchema(propSchema) {
  return (propSchema && propSchema.type === 'number') ? 42 : 'x402-core-mirror-sample';
}

/** Pure — builds the MINIMAL args object satisfying `tool.inputSchema`'s
 * required fields only (optional fields are deliberately omitted — they
 * never change WHICH route a tool dispatches to, only its query params).
 * Reused by both the real-population loop and the self-defeat case below. */
function buildSampleArgs(tool) {
  const schema = (tool && tool.inputSchema) || {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = schema.properties || {};
  const args = {};
  for (const key of required) {
    args[key] = sampleValueForSchema(properties[key]);
  }
  return args;
}

/** Pure — the exact assertion FINDING 2 requires. Returns null on
 * agreement, or a problem string on mismatch/throw. Reused by both the
 * real-population loop and the self-defeat case, so the self-defeat case
 * proves the SAME logic the real check trusts. */
function checkToolDispatchMirror(tool) {
  let dispatchedPathname;
  try {
    const req = tool.argsToRequest(buildSampleArgs(tool));
    dispatchedPathname = req && req.pathname;
  } catch (err) {
    return 'argsToRequest threw: ' + (err && err.message);
  }
  const dispatchedRouteId = apiCore.matchRouteId(dispatchedPathname);
  if (dispatchedRouteId !== tool.route) {
    return 'declared route "' + tool.route + '" does not match the dispatched pathname "' + dispatchedPathname +
      '" (apiCore.matchRouteId resolves it to ' + JSON.stringify(dispatchedRouteId) + ')';
  }
  return null;
}

for (const tool of mcpCore.TOOLS) {
  const problem = checkToolDispatchMirror(tool);
  eq(problem, null, 'tool "' + tool.name + '": declared route === dispatched pathname\'s resolved route id' + (problem ? (' — ' + problem) : ''));
}
console.log(`  ${mcpCore.TOOLS.length}/${mcpCore.TOOLS.length} real mcp-core tools: declared route === dispatched pathname's resolved route id (sample args derived from each tool's own inputSchema.required)`);

// Self-defeat: two synthetic tools, never added to the real TOOLS array,
// proving checkToolDispatchMirror can actually fail — a check never shown
// to fail is not evidence it works (LEARNINGS 2026-07-27).
{
  // (i) The verifier's exact reproduction shape: declares itself as the
  // FREE pools route, but its argsToRequest actually dispatches the PAID
  // forever-number route.
  const decoyPaidDispatchTool = {
    name: 'x402_core_mirror_selfdefeat_decoy_tool',
    route: '/api/pools',
    inputSchema: { type: 'object', properties: {}, required: [] },
    argsToRequest: function () {
      return { pathname: '/api/forever-number', searchParams: new URLSearchParams('monthly=20') };
    },
  };
  const decoyProblem = checkToolDispatchMirror(decoyPaidDispatchTool);
  ok(typeof decoyProblem === 'string' && decoyProblem.length > 0, 'self-defeat (i): a tool whose declared route disagrees with its dispatched pathname IS reported as a mismatch (the verifier\'s exact reproduction shape)');
  ok(/does not match the dispatched pathname/.test(decoyProblem), 'self-defeat (i): the reported problem names the mismatch');

  // (ii) A tool whose argsToRequest THROWS is also reported, not silently OK.
  const throwingTool = {
    name: 'x402_core_mirror_selfdefeat_throwing_tool',
    route: '/api/pools',
    inputSchema: { type: 'object', properties: {}, required: [] },
    argsToRequest: function () { throw new Error('synthetic throw'); },
  };
  const throwProblem = checkToolDispatchMirror(throwingTool);
  ok(typeof throwProblem === 'string' && /threw/.test(throwProblem), 'self-defeat (ii): a tool whose argsToRequest throws is reported, not silently treated as agreeing');

  // Control: a tool whose declared route genuinely matches its dispatched
  // pathname must still report null (proves the check isn't just "always
  // fail on a synthetic tool").
  const agreeingTool = {
    name: 'x402_core_mirror_selfdefeat_agreeing_tool',
    route: '/api/pools',
    inputSchema: { type: 'object', properties: {}, required: [] },
    argsToRequest: function () { return { pathname: '/api/pools', searchParams: new URLSearchParams() }; },
  };
  eq(checkToolDispatchMirror(agreeingTool), null, 'self-defeat control: a tool whose declared route genuinely matches its dispatched pathname reports null (no false positive)');
}
console.log('  self-defeat confirmed: a declared/dispatched mismatch is caught, a throwing argsToRequest is caught, a genuinely-agreeing tool is not flagged');

// ===========================================================================
// G2b. `argsToRequest` PURITY guard (verifier round 3, backlog 234, FINDING
//    2). The check above proves the DECLARED route agrees with ONE call to
//    `argsToRequest`. But the real gate (edge/agent-log.mjs's `handleMcp`)
//    calls `tool.argsToRequest(args)` a SECOND, separate time — once in its
//    own probe to decide whether to charge, once again inside
//    edge/mcp-core.js's `handleToolsCall` to actually dispatch — and
//    silently assumes both calls agree. Nothing before this round checked
//    that assumption: an impure `argsToRequest` (e.g. one that alternates
//    its output across calls) could show the gate's probe a FREE pathname
//    while the real dispatch serves the PAID one — reproduced by the
//    verifier: a tool returning `/api/pools` on the first call and
//    `/api/forever-number` on the second got a 200 with the full paid
//    body, gate ON, no payment. This section asserts, for EVERY real tool,
//    that calling `argsToRequest` TWICE with the identical args object
//    yields the identical pathname AND identical search params — over the
//    REAL, shipped `mcpCore.TOOLS` population, not a synthetic stand-in.
// ===========================================================================
console.log('\nG2b. argsToRequest PURITY — two calls, same args, same result (mcp-core TOOLS, every tool)');

/** Pure — calls `tool.argsToRequest` twice with the SAME sample args and
 * asserts the resulting pathname and search-params string are identical.
 * Returns null on agreement, or a problem string describing the mismatch.
 * Reused by both the real-population loop and the self-defeat case below,
 * so the self-defeat case proves the SAME logic the real check trusts. */
function checkArgsToRequestPure(tool) {
  const args = buildSampleArgs(tool);
  let first;
  try {
    first = tool.argsToRequest(args);
  } catch (err) {
    return 'argsToRequest threw on the FIRST call: ' + (err && err.message);
  }
  let second;
  try {
    second = tool.argsToRequest(args);
  } catch (err) {
    return 'argsToRequest threw on the SECOND call: ' + (err && err.message);
  }
  const firstPathname = first && first.pathname;
  const secondPathname = second && second.pathname;
  if (firstPathname !== secondPathname) {
    return 'two calls to argsToRequest with the IDENTICAL args returned different pathnames: "' +
      firstPathname + '" (call 1) vs "' + secondPathname + '" (call 2)';
  }
  const firstParams = (first && first.searchParams) ? first.searchParams.toString() : '';
  const secondParams = (second && second.searchParams) ? second.searchParams.toString() : '';
  if (firstParams !== secondParams) {
    return 'two calls to argsToRequest with the IDENTICAL args returned different search params: "' +
      firstParams + '" (call 1) vs "' + secondParams + '" (call 2)';
  }
  return null;
}

for (const tool of mcpCore.TOOLS) {
  const problem = checkArgsToRequestPure(tool);
  eq(problem, null, 'tool "' + tool.name + '": argsToRequest(sampleArgs) is pure across two calls' + (problem ? (' — ' + problem) : ''));
}
console.log(`  ${mcpCore.TOOLS.length}/${mcpCore.TOOLS.length} real mcp-core tools: argsToRequest is pure across two identical calls (FINDING 2's undocumented assumption, now enforced)`);

// Self-defeat: an impure tool that alternates its dispatched pathname
// across calls — the verifier's exact leak shape (/api/pools then
// /api/forever-number) — never added to the real TOOLS array.
{
  let callCount = 0;
  const impurePathnameTool = {
    name: 'x402_core_purity_selfdefeat_impure_pathname_tool',
    route: '/api/pools',
    inputSchema: { type: 'object', properties: {}, required: [] },
    argsToRequest: function () {
      callCount++;
      return callCount === 1
        ? { pathname: '/api/pools', searchParams: new URLSearchParams() }
        : { pathname: '/api/forever-number', searchParams: new URLSearchParams('monthly=20') };
    },
  };
  const impurePathnameProblem = checkArgsToRequestPure(impurePathnameTool);
  ok(
    typeof impurePathnameProblem === 'string' && /different pathnames/.test(impurePathnameProblem),
    'self-defeat (i): an argsToRequest that alternates PATHNAME across calls (the verifier\'s exact leak shape) IS reported, not silently trusted'
  );

  // (ii) Same pathname both times, but the search params drift — a second
  // way "the gate's probe and the real dispatch disagree" could happen
  // without the pathname itself changing.
  let paramCallCount = 0;
  const impureParamsTool = {
    name: 'x402_core_purity_selfdefeat_impure_params_tool',
    route: '/api/pools',
    inputSchema: { type: 'object', properties: {}, required: [] },
    argsToRequest: function () {
      paramCallCount++;
      return { pathname: '/api/pools', searchParams: new URLSearchParams(paramCallCount === 1 ? 'monthly=20' : 'monthly=50') };
    },
  };
  const impureParamsProblem = checkArgsToRequestPure(impureParamsTool);
  ok(
    typeof impureParamsProblem === 'string' && /different search params/.test(impureParamsProblem),
    'self-defeat (ii): an argsToRequest that keeps the same pathname but drifts its SEARCH PARAMS across calls IS reported'
  );

  // (iii) A tool whose argsToRequest throws is reported, not silently OK.
  const throwingPureTool = {
    name: 'x402_core_purity_selfdefeat_throwing_tool',
    route: '/api/pools',
    inputSchema: { type: 'object', properties: {}, required: [] },
    argsToRequest: function () { throw new Error('synthetic throw'); },
  };
  const throwingPureProblem = checkArgsToRequestPure(throwingPureTool);
  ok(
    typeof throwingPureProblem === 'string' && /threw/.test(throwingPureProblem),
    'self-defeat (iii): a tool whose argsToRequest throws is reported, not silently treated as pure'
  );

  // Control: a genuinely pure argsToRequest must still report null (proves
  // this isn't just "always fail on a synthetic tool").
  const genuinelyPureTool = {
    name: 'x402_core_purity_selfdefeat_pure_tool',
    route: '/api/pools',
    inputSchema: { type: 'object', properties: {}, required: [] },
    argsToRequest: function () { return { pathname: '/api/pools', searchParams: new URLSearchParams('monthly=20') }; },
  };
  eq(checkArgsToRequestPure(genuinelyPureTool), null, 'self-defeat control: a genuinely pure argsToRequest reports null (no false positive)');
}
console.log('  self-defeat confirmed: an impure pathname is caught, drifting search params are caught, a throwing argsToRequest is caught, a genuinely-pure tool is not flagged');

// ===========================================================================
// G2. Prose pricing contracts derive their complete populations from the
//     REAL schedule/tool tables. Marked regions make stale generated docs a
//     deterministic failure rather than a review-time wording guess.
// ===========================================================================
console.log('\nG2. generated prose boundary — schedule/routes/tools stay singular');

const ROUTE_REGION_BEGIN = '<!-- BEGIN GENERATED PRICING ROUTES -->';
const ROUTE_REGION_END = '<!-- END GENERATED PRICING ROUTES -->';
const TOOL_REGION_BEGIN = '<!-- BEGIN GENERATED MCP PRICING -->';
const TOOL_REGION_END = '<!-- END GENERATED MCP PRICING -->';

function expectedRouteBoundaryMarkdown() {
  const entries = Object.values(x402.PRICE_SCHEDULE);
  const free = entries.filter((entry) => entry.tier === 'free').map((entry) => '`GET ' + entry.route + '`');
  const paid = entries.filter((entry) => entry.tier === 'paid').map((entry) => '`GET ' + entry.route + '`');
  return '**Free routes:** ' + free.join(', ') + '.\n\n' +
    '**Paid routes:** ' + paid.join(', ') + '.\n\n' +
    'Any API route not explicitly listed as free defaults to paid.';
}

function expectedToolBoundaryMarkdown() {
  const free = [];
  const paid = [];
  for (const tool of mcpCore.TOOLS) {
    const classification = x402.classifyMcpTool(tool.name, mcpCore.TOOLS);
    (classification.tier === 'free' ? free : paid).push('`' + tool.name + '`');
  }
  return '**Free tools:** ' + free.join(', ') + '.\n\n' +
    '**Paid tools:** ' + paid.join(', ') + '.\n\n' +
    'Any tool whose API route is not explicitly listed as free defaults to paid.';
}

function generatedRegion(file, begin, end) {
  const source = fs.readFileSync(path.join(EDGE_DIR, file), 'utf8');
  eq(source.split(begin).length - 1, 1, `${file}: exactly one ${begin} marker`);
  eq(source.split(end).length - 1, 1, `${file}: exactly one ${end} marker`);
  return source.slice(source.indexOf(begin) + begin.length, source.indexOf(end)).trim();
}

for (const file of ['X402.md', 'API.md']) {
  eq(
    generatedRegion(file, ROUTE_REGION_BEGIN, ROUTE_REGION_END),
    expectedRouteBoundaryMarkdown(),
    `${file}: generated route boundary matches every real PRICE_SCHEDULE row`
  );
}
eq(
  generatedRegion('MCP.md', TOOL_REGION_BEGIN, TOOL_REGION_END),
  expectedToolBoundaryMarkdown(),
  'MCP.md: generated tool boundary matches every real TOOLS row through PRICE_SCHEDULE'
);

const originalHealthTier = x402.PRICE_SCHEDULE['/api/health'];
x402.PRICE_SCHEDULE['/api/health'] = Object.assign({}, originalHealthTier, {
  tier: 'paid',
  priceUsdcAtomic: x402.DEFAULT_PRICE_USDC_ATOMIC,
});
const mutatedBoundary = x402.buildPricingDoc({
  endpoints: apiCore.ENDPOINTS,
  tools: mcpCore.TOOLS,
  enabled: false,
  mode: 'test',
}).boundary;
x402.PRICE_SCHEDULE['/api/health'] = originalHealthTier;
ok(
  mutatedBoundary.includes('Paid routes:') && mutatedBoundary.includes('GET /api/health'),
  'self-defeat: changing a schedule tier changes the machine-readable boundary route list'
);

const invalidHealthTier = x402.PRICE_SCHEDULE['/api/health'];
x402.PRICE_SCHEDULE['/api/health'] = Object.assign({}, invalidHealthTier, {
  tier: 'complimentary',
});
total++;
try {
  assert.throws(
    () => x402.buildBoundarySentence(),
    /\/api\/health.*complimentary/,
    'an invalid schedule tier must fail with its route and value instead of disappearing from both lists'
  );
  passed++;
} finally {
  x402.PRICE_SCHEDULE['/api/health'] = invalidHealthTier;
}

const x402ContractSource = fs.readFileSync(path.join(EDGE_DIR, 'X402.md'), 'utf8');
ok(
  x402ContractSource.includes(`"boundary": "${x402.buildBoundarySentence()}"`),
  'X402.md: published pricing response example shows the real generated boundary contract'
);

console.log('  docs and machine boundary derive route/tool populations from the real schedule');

// ===========================================================================
// H-K run inside an async function (verifyPayment is async) — Node cannot
// mix top-level `require()` with top-level `await` unambiguously in a
// CommonJS file, so everything needing `await` lives below this point,
// same discipline test_api_worker.js's own `runWorkerTests()` wrapper uses.
// ===========================================================================
async function runAsyncSections() {

// ===========================================================================
// H. verifyPayment — every branch, using injected fake fetchImpl only.
// ===========================================================================
console.log('\nH. verifyPayment — every branch, no network');

function b64(obj) { return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64'); }

const testChallenge = x402.buildChallenge({ resourceUrl: RESOURCE_URL, routeId: '/api/forever-number', config: x402.readConfig({}) });
const req0 = testChallenge.accepts[0];

function validPayload(overrides) {
  return Object.assign({
    x402Version: 1,
    scheme: req0.scheme,
    network: 'base-sepolia',
    resource: req0.resource,
    amount: req0.maxAmountRequired,
  }, overrides || {});
}

async function h(header, config, fetchImpl) {
  return x402.verifyPayment({ header, challenge: testChallenge, config: config || x402.readConfig({}), fetchImpl });
}

// H1. missing/empty header.
for (const missing of [undefined, null, '']) {
  const r = await h(missing);
  eq(r.paid, false, `missing header (${JSON.stringify(missing)}): paid false`);
  eq(r.status, 'none', `missing header (${JSON.stringify(missing)}): status "none"`);
}

// H2. malformed base64 (bytes that don't decode to valid UTF-8 JSON at all).
{
  const r = await h('!!!not-base64!!!\x00\x01\x02');
  eq(r.paid, false, 'malformed base64: paid false');
  eq(r.status, 'rejected', 'malformed base64: status rejected');
  ok(typeof r.reason === 'string' && r.reason.length > 0, 'malformed base64: has a reason');
}

// H3. malformed JSON (valid base64, garbage inside).
{
  const r = await h(Buffer.from('{not valid json', 'utf8').toString('base64'));
  eq(r.paid, false, 'malformed JSON: paid false');
  eq(r.status, 'rejected', 'malformed JSON: status rejected');
}

// H4. scheme/network/resource mismatch (three separate cases).
{
  const r = await h(b64(validPayload({ scheme: 'wrong-scheme' })));
  eq(r.status, 'rejected', 'scheme mismatch: rejected');
}
{
  // Deliberately mismatched against a DIFFERENT test-shaped network (not a
  // mainnet name): testChallenge's requirement.network is "base-sepolia";
  // "ethereum-sepolia" is itself also a valid test network (contains
  // "sepolia"), so this case is rejected ONLY if the network-MATCH check
  // itself is live — a mainnet mismatch here would be indistinguishable
  // from the separate test-vs-mainnet gate (H6) rejecting it for its own,
  // different reason, which would make this assertion pass even with the
  // match check neutered (caught by this file's own non-vacuity pass; see
  // product-loop-kit/specs/234-notes-x402core.md, mutation (b)).
  const r = await h(b64(validPayload({ network: 'ethereum-sepolia' })));
  eq(r.status, 'rejected', 'network mismatch vs challenge requirement (both sides test-network-shaped, so only the MATCH check can catch this): rejected');
}
{
  const r = await h(b64(validPayload({ resource: 'https://www.defi.garden/api/pools' })));
  eq(r.status, 'rejected', 'resource mismatch: rejected');
}

// H5. underpayment.
{
  const under = (BigInt(req0.maxAmountRequired) - 1n).toString();
  const r = await h(b64(validPayload({ amount: under })));
  eq(r.status, 'rejected', 'underpayment: rejected');
  eq(r.paid, false, 'underpayment: paid false');
}
// Exact amount required is enough (>= , not strictly >).
{
  const r = await h(b64(validPayload({ amount: req0.maxAmountRequired })));
  eq(r.status, 'paid_test', 'exact required amount in test mode on a test network: paid_test');
}
// Overpayment is also accepted.
{
  const over = (BigInt(req0.maxAmountRequired) + 1000n).toString();
  const r = await h(b64(validPayload({ amount: over })));
  eq(r.status, 'paid_test', 'overpayment in test mode on a test network: still paid_test');
}

// H6. mainnet-in-test-mode -> rejected, and various test-network spellings
// -> accepted. The scheme/network/resource MATCH gate (H4) runs before the
// test-vs-mainnet gate and requires payload.network === requirement.network
// exactly, so each case below builds its OWN challenge whose requirement
// network is the network under test — otherwise varying only the payload's
// network would just re-exercise H4's mismatch gate, never reach the
// test-network gate this sub-section is actually about.
async function verifyOnNetwork(network, config) {
  const challengeForNetwork = x402.buildChallenge({
    resourceUrl: RESOURCE_URL,
    routeId: '/api/forever-number',
    config: x402.readConfig(Object.assign({ X402_NETWORK: network }, config || {})),
  });
  const requirement = challengeForNetwork.accepts[0];
  const payload = {
    x402Version: 1,
    scheme: requirement.scheme,
    network: requirement.network,
    resource: requirement.resource,
    amount: requirement.maxAmountRequired,
  };
  return x402.verifyPayment({
    header: b64(payload),
    challenge: challengeForNetwork,
    config: x402.readConfig(Object.assign({ X402_NETWORK: network }, config || {})),
  });
}

{
  const r = await verifyOnNetwork('base'); // mainnet-shaped: no "sepolia", not exactly "test"
  eq(r.status, 'rejected', 'a mainnet network name in test mode is rejected, not silently accepted');
  eq(r.paid, false, 'mainnet-in-test-mode: paid false');
}
{
  const r = await verifyOnNetwork('ethereum-mainnet');
  eq(r.status, 'rejected', 'a second mainnet-shaped network name in test mode is also rejected');
}
// "test" network name literally, and sepolia-named testnets, all accepted in test mode.
{
  const r = await verifyOnNetwork('test');
  eq(r.status, 'paid_test', 'network name exactly "test" is accepted as a test network');
}
{
  const r = await verifyOnNetwork('ethereum-sepolia');
  eq(r.status, 'paid_test', 'a network name containing "sepolia" (not just "base-sepolia") is accepted as a test network');
}
{
  const r = await verifyOnNetwork('base-sepolia');
  eq(r.status, 'paid_test', 'base-sepolia (the module default) is accepted as a test network');
}

// H7. well-formed, matching test-mode payload -> paid_test.
{
  const r = await h(b64(validPayload()));
  eq(r.paid, true, 'well-formed matching test payload: paid true');
  eq(r.status, 'paid_test', 'well-formed matching test payload: status paid_test (test mode never settles)');
}

// H8. live mode without a configured facilitator -> fail closed.
{
  const liveCfgNoFacilitator = x402.readConfig({ X402_MODE: 'live' });
  const r = await h(b64(validPayload()), liveCfgNoFacilitator, async () => ({ ok: true, json: async () => ({ isValid: true }) }));
  eq(r.status, 'rejected', 'live mode with no X402_FACILITATOR_URL configured: rejected (fail closed)');
  eq(r.paid, false, 'live mode with no facilitator: paid false');
}

const liveCfg = x402.readConfig({ X402_MODE: 'live', X402_FACILITATOR_URL: 'https://facilitator.example.test' });

// H9. live mode, facilitator returns isValid:false -> rejected.
{
  const r = await h(b64(validPayload()), liveCfg, async () => ({ ok: true, json: async () => ({ isValid: false }) }));
  eq(r.status, 'rejected', 'live mode, facilitator isValid:false: rejected');
}

// H10. live mode, facilitator non-OK response -> rejected.
{
  const r = await h(b64(validPayload()), liveCfg, async () => ({ ok: false, status: 500, json: async () => ({ isValid: true }) }));
  eq(r.status, 'rejected', 'live mode, facilitator non-OK http status (even claiming isValid:true in the body): rejected');
}

// H11. live mode, facilitator body unparseable -> rejected.
{
  const r = await h(b64(validPayload()), liveCfg, async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }));
  eq(r.status, 'rejected', 'live mode, facilitator response body unparseable: rejected');
}

// H12. live mode, fetchImpl throws -> rejected, never escapes.
{
  let threw = null;
  let r;
  try {
    r = await h(b64(validPayload()), liveCfg, async () => { throw new Error('synthetic network failure'); });
  } catch (err) {
    threw = err;
  }
  ok(!threw, 'a throwing fetchImpl must not escape verifyPayment (verifyPayment never throws)');
  eq(r.status, 'rejected', 'live mode, fetchImpl throws: rejected');
}

// H13. live mode, facilitator returns an ambiguous truthy-but-not-strictly-true isValid -> rejected (ONLY explicit true counts).
{
  const r = await h(b64(validPayload()), liveCfg, async () => ({ ok: true, json: async () => ({ isValid: 'true' }) }));
  eq(r.status, 'rejected', 'live mode, facilitator isValid as the STRING "true" (not boolean true): rejected — only explicit boolean true counts');
}

// H14. live mode, facilitator returns isValid:true -> paid (real settlement, distinct status from paid_test).
{
  const r = await h(b64(validPayload()), liveCfg, async (url, opts) => {
    eq(url, 'https://facilitator.example.test/verify', 'live-mode fetchImpl is called against X402_FACILITATOR_URL + "/verify"');
    const sentBody = JSON.parse(opts.body);
    eq(sentBody.x402Version, 1, 'facilitator POST body carries x402Version');
    ok(sentBody.paymentPayload && sentBody.paymentPayload.amount === req0.maxAmountRequired, 'facilitator POST body carries paymentPayload');
    ok(sentBody.paymentRequirements && sentBody.paymentRequirements.scheme === 'exact', 'facilitator POST body carries paymentRequirements');
    return { ok: true, json: async () => ({ isValid: true }) };
  });
  eq(r.paid, true, 'live mode, facilitator isValid:true: paid true');
  eq(r.status, 'paid', 'live mode, facilitator isValid:true: status "paid" (a real settlement, distinct from paid_test)');
}

console.log('  all verifyPayment branches exercised (H1-H14), fetchImpl always injected, no network touched');

// ===========================================================================
// I. paymentResponseHeader — honesty of the settlement statement.
// ===========================================================================
console.log('\nI. paymentResponseHeader');

// backlog 234, verifier round 1: this Worker never calls a facilitator's
// /settle endpoint (verifyPayment() only ever POSTs to /verify — see that
// function's own comment) — so `settled` is `false` on EVERY branch,
// including 'paid' (a real live-mode payment that verified but was never
// settled by this Worker). `verified` is the honest distinguishing fact —
// and (coordinator spot-check follow-up) it means something DIFFERENT per
// mode: 'paid' (live) really did get an isValid:true from a facilitator,
// but 'paid_test' only ever passed a STRUCTURAL match against the challenge
// (well-formed payload, scheme/network/resource/amount, test network) —
// verifyPayment() never calls a facilitator, checks a signature, or
// touches a chain in test mode — so 'paid_test' must NOT claim
// verified=true; it gets checked=structural instead.
eq(x402.paymentResponseHeader({ status: 'paid_test' }), 'settled=false; verified=false; checked=structural; mode=test', 'paid_test never claims settlement or verification — only a structural payload match');
eq(x402.paymentResponseHeader({ status: 'paid' }), 'settled=false; verified=true; mode=live', 'paid (live) is verified but never claims settlement — this Worker never calls /settle');
eq(x402.paymentResponseHeader({ status: 'rejected' }), 'settled=false; verified=false; mode=rejected', 'rejected never claims settlement or verification');
eq(x402.paymentResponseHeader({ status: 'none' }), 'settled=false; verified=false; mode=none', 'none never claims settlement or verification');

// Invariant, not a second copy of the literal: the test-mode header must
// NEVER assert verified=true — no facilitator call, no signature check, no
// chain interaction happens in test mode, so the string itself must not be
// able to say otherwise.
ok(!/verified=true/.test(x402.paymentResponseHeader({ status: 'paid_test' })), 'invariant: the test-mode X-PAYMENT-RESPONSE header never contains verified=true');

// ===========================================================================
// J. buildPricingDoc.
// ===========================================================================
console.log('\nJ. buildPricingDoc');

const disabledDoc = x402.buildPricingDoc({ endpoints: apiCore.ENDPOINTS, tools: mcpCore.TOOLS, enabled: false, mode: 'test' });
eq(disabledDoc.availability.enabled, false, 'disabled doc: availability.enabled is false');
ok(/DISABLED/.test(disabledDoc.availability.statement), 'disabled doc: statement says DISABLED');
ok(!/cloudflare\.pay/i.test(disabledDoc.availability.statement) || /no cloudflare\.pay/i.test(disabledDoc.availability.statement), 'disabled doc: any cloudflare.pay mention is in the negative ("no cloudflare.pay ... live")');
ok(disabledDoc.protocol.name === x402.PROTOCOL_NAME && disabledDoc.protocol.version === x402.PROTOCOL_VERSION, 'disabled doc: protocol name/version present and correct');

// Every route in the doc matches classifyRoute's own verdict — the doc is
// GENERATED from the schedule, not a second hand-typed table.
for (const r of disabledDoc.routes) {
  const c = x402.classifyRoute(r.route);
  eq(r.tier, c.tier, `pricing doc route ${r.route}: tier matches classifyRoute`);
  eq(r.priceUsdcAtomic, c.priceUsdcAtomic, `pricing doc route ${r.route}: price matches classifyRoute`);
}
// Every real api-core ENDPOINT is present in the doc, set-equal, both directions.
const docRouteIds = disabledDoc.routes.map((r) => r.route).sort();
deepEq(docRouteIds, expectedRouteIds, 'pricing doc routes set-equal api-core ENDPOINTS, both directions');

// mcpTools mapping matches classifyMcpTool for every real tool.
for (const t of mcpCore.TOOLS) {
  const docEntry = disabledDoc.mcpTools.find((e) => e.tool === t.name);
  ok(docEntry, `pricing doc mcpTools includes ${t.name}`);
  const c = x402.classifyMcpTool(t.name, mcpCore.TOOLS);
  eq(docEntry.tier, c.tier, `pricing doc mcpTools[${t.name}].tier matches classifyMcpTool`);
}

// enabled/live doc: statement changes, never claims a state it wasn't told about.
const enabledLiveDoc = x402.buildPricingDoc({ endpoints: apiCore.ENDPOINTS, tools: mcpCore.TOOLS, enabled: true, mode: 'live' });
eq(enabledLiveDoc.availability.enabled, true, 'enabled/live doc: availability.enabled is true');
eq(enabledLiveDoc.availability.mode, 'live', 'enabled/live doc: mode is live');
ok(!/DISABLED/.test(enabledLiveDoc.availability.statement), 'enabled/live doc: statement does not say DISABLED');

const enabledTestDoc = x402.buildPricingDoc({ endpoints: apiCore.ENDPOINTS, tools: mcpCore.TOOLS, enabled: true, mode: 'test' });
ok(/test-network|nothing settles/i.test(enabledTestDoc.availability.statement), 'enabled/test doc: statement is honest that test mode does not settle');

console.log('  pricing doc generated correctly from the schedule; availability state is taken as an argument, never assumed');

// ===========================================================================
// K. No credential/address is hardcoded anywhere in edge/x402-core.js.
//    (Cheap in-file grep-style guard, distinct from the diff-wide grep the
//    coordinator's verifier pass runs separately — this one just makes sure
//    this test file itself would catch an obvious regression.)
// ===========================================================================
console.log('\nK. no hardcoded credential in edge/x402-core.js');

const x402Src = fs.readFileSync(path.join(EDGE_DIR, 'x402-core.js'), 'utf8');
ok(!/0x[a-fA-F0-9]{40}/.test(x402Src), 'edge/x402-core.js source contains no literal 40-hex-char address (Ethereum-shaped)');
ok(!/payTo\s*[:=]\s*['"][^'"]+['"]/.test(x402Src), 'edge/x402-core.js source contains no hardcoded payTo string literal');

} // end runAsyncSections

runAsyncSections()
  .then(() => {
    // `passed`/`total` incremented together by ok()/eq()/deepEq() (total
    // first, then passed only once the assertion itself didn't throw), so
    // on a clean run they are equal by construction — this prints the real
    // total attempted, mirroring test_api_worker.js's own discipline.
    console.log(`\ntest_x402_core.js: ${passed}/${total} assertions passed`);
    if (passed !== total) {
      process.exitCode = 1;
    }
  })
  .catch((err) => {
    console.error(`test_x402_core.js: FAILED after ${passed}/${total} assertions passed`);
    console.error(err);
    process.exitCode = 1;
  });
