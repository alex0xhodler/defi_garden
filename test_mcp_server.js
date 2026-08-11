/* Unit + integration tests for edge/mcp-core.js + edge/agent-log.mjs's /mcp
   dispatch + edge/agent-log-core.js's 'mcp' classification (backlog 228,
   spec 228). Plain Node, plain lane (no browser-driving test framework
   anywhere in this file or in anything it requires — see run-tests.js's
   transitive-require lane classifier), no network. Copies test_api_worker.js
   and test_agent_log.js's harness style deliberately (same population
   discipline, same fake-fetch/DB/ctx technique, same Response-object
   identity check for the pass-through path).

   Population comes from the REAL, committed data/pools-snapshot.json —
   never a hardcoded pool list, per spec 228's acceptance criteria. As with
   test_api_worker.js, the snapshot's ANOMALY positive control is NATURAL
   (genuine pools over APY_SANITY_LIMIT) and its TVL-floor positive control
   is DERIVED (the snapshot is pre-floored upstream by
   generate-pools-snapshot.js, so no natural sub-floor pool currently
   exists — this file prefers a natural one if a future snapshot ever has
   one, and states in its own console output which kind it used).

   Run: node test_mcp_server.js */

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
const mcpCore = require(path.join(EDGE_DIR, 'mcp-core.js'));
const apiCore = require(path.join(EDGE_DIR, 'api-core.js'));
const agentLogCore = require(path.join(EDGE_DIR, 'agent-log-core.js'));
const trustRails = require(path.join(ROOT, 'trust-rails.js'));

// ===========================================================================
// A. Population — load the REAL snapshot, never a fixture.
// ===========================================================================
console.log('A. population — data/pools-snapshot.json');

const SNAPSHOT_PATH = path.join(ROOT, 'data', 'pools-snapshot.json');
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
ok(snapshot && Array.isArray(snapshot.pools), 'sanity: data/pools-snapshot.json has a .pools array');
const POPULATION = snapshot.pools;
ok(POPULATION.length > 1000, `sanity: expected a real, large population, got ${POPULATION.length}`);
console.log(`  loaded ${POPULATION.length} pools, snapshot.minTvlUsd=${snapshot.minTvlUsd}`);

function independentTotalApy(p) {
  return (Number(p && p.apyBase) || 0) + (Number(p && p.apyReward) || 0);
}

// ===========================================================================
// B. edge/mcp-core.js declares NO rail constant, NO filter, NO formula of
//    its own — grep-provable, asserted here (not just eyeballed).
// ===========================================================================
console.log('\nB. mcp-core.js declares no rail literal, no arithmetic on pool fields');

const mcpCoreSrc = fs.readFileSync(path.join(EDGE_DIR, 'mcp-core.js'), 'utf8');

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// B1. Forbidden rail literals — DERIVED from trust-rails.js at test time
// (RAZOR: no check narrower than the class it guards). A hardcoded
// `/\b1000\b/`/`/\b100000\b/` only guards TODAY's values; if a human ever
// changes a rail in trust-rails.js/app.js, a hardcoded copy of the NEW
// value in mcp-core.js would pass a hardcoded gate silently. Building the
// regex from trustRails.* means the gate tracks whatever the rail actually
// is, not what it was when this test was written.
const RAIL_CHECKS = [
  ['APY_SANITY_LIMIT', trustRails.APY_SANITY_LIMIT],
  ['DEFAULT_MIN_TVL', trustRails.DEFAULT_MIN_TVL],
];
for (const [railName, railValue] of RAIL_CHECKS) {
  if (!Number.isFinite(railValue) || railValue <= 0) {
    throw new Error(`VACUITY GUARD TRIPPED: trustRails.${railName} is not a positive finite number ` +
      `(got ${railValue}) — the forbidden-literal regex derived from it would guard nothing. ` +
      'This must not pass silently; investigate trust-rails.js before trusting this test run.');
  }
  const railRegex = new RegExp('\\b' + escapeRegExp(String(railValue)) + '\\b');
  ok(!railRegex.test(mcpCoreSrc),
    `mcp-core.js must not contain the literal ${railValue} anywhere (trustRails.${railName} lives only in trust-rails.js, derived at test time — not a hardcoded copy of today's value)`);
}

// B2. Forbidden pool-field access — DERIVED from the field names
// edge/api-core.js's projectPool() actually reads off a pool object (both
// `pool.field` dot-access and `pool['field']`/`pool["field"]`
// bracket-access), not a hand-listed set. A hand-listed set silently stops
// guarding a field the moment projectPool starts reading a new one (it
// already missed apyMean30d, poolMeta, exposure, ilRisk, url, chain,
// project, symbol, and the bracket-access form entirely).
const apiCoreSrc = fs.readFileSync(path.join(EDGE_DIR, 'api-core.js'), 'utf8');

function extractBalancedBraceBody(src, headPattern) {
  const m = headPattern.exec(src);
  if (!m) return null;
  const openBraceIdx = m.index + m[0].length - 1;
  if (src[openBraceIdx] !== '{') return null;
  let depth = 0;
  for (let j = openBraceIdx; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(openBraceIdx, j + 1);
    }
  }
  return null;
}

const projectPoolSrc = extractBalancedBraceBody(apiCoreSrc, /function\s+projectPool\s*\([^)]*\)\s*\{/);
ok(typeof projectPoolSrc === 'string' && projectPoolSrc.length > 0,
  'sanity: edge/api-core.js\'s projectPool() function body was extracted (brace-balanced) for field derivation');

const POOL_FIELD_PATTERN = /\bpool(?:\.([A-Za-z_$][\w$]*)|\[\s*(['"])([A-Za-z_$][\w$]*)\2\s*\])/g;
const projectedFields = new Set();
{
  let fm;
  while ((fm = POOL_FIELD_PATTERN.exec(projectPoolSrc)) !== null) {
    projectedFields.add(fm[1] || fm[3]);
  }
}
if (projectedFields.size < 3) {
  throw new Error('VACUITY GUARD TRIPPED: fewer than 3 pool field names were derived from api-core.js\'s ' +
    `projectPool() (got ${projectedFields.size}: ${JSON.stringify([...projectedFields])}) — the ` +
    'derived forbidden-field-access regex would guard almost nothing. This must not pass silently; ' +
    'investigate the extraction (or api-core.js\'s projectPool) before trusting this test run.');
}
console.log(`  derived ${projectedFields.size} forbidden pool fields from api-core.js's projectPool(): ${[...projectedFields].sort().join(', ')}`);

const fieldAlternation = [...projectedFields].map(escapeRegExp).join('|');
// Scoped to a `pool` receiver (mirrors the extraction pattern above, and
// the finding's own bracket-access examples `pool['apyBase']`/
// `pool["apyBase"]`) — NOT a bare `.fieldname` substring check, because
// several derived field names (chain/project/symbol/url) are also
// legitimate property names on OTHER objects mcp-core.js touches (e.g. a
// find_pools args object's `a.chain`/`a.project`). Scoping by receiver
// catches real reads off a pool object while leaving those unrelated,
// legitimate accesses (and honest prose in tool descriptions) untouched.
const forbiddenDotAccess = new RegExp('\\bpool\\.(' + fieldAlternation + ')\\b');
const forbiddenBracketAccess = new RegExp('\\bpool\\[\\s*([\'"])(' + fieldAlternation + ')\\1\\s*\\]');
ok(!forbiddenDotAccess.test(mcpCoreSrc),
  `mcp-core.js must never dot-access (pool.field) any pool field read by projectPool() (${[...projectedFields].sort().join('/')}) — those names may only appear as prose in tool descriptions; no code here may compute anything from a pool object`);
ok(!forbiddenBracketAccess.test(mcpCoreSrc),
  `mcp-core.js must never bracket-access (pool['field'] / pool["field"]) any pool field read by projectPool() (${[...projectedFields].sort().join('/')})`);
ok(!/require\(['"]\.\.\/trust-rails\.js['"]\)/.test(mcpCoreSrc), 'mcp-core.js must not even require trust-rails.js directly — it reaches rails ONLY through api-core.js');

// ===========================================================================
// C. JSON-RPC protocol basics — core level, no network, no Worker.
// ===========================================================================
console.log('\nC. JSON-RPC protocol basics (initialize / notifications / ping / errors)');

function call(message) {
  return mcpCore.handleMcpMessage({ message, pools: POPULATION });
}

// C1. initialize — no protocolVersion given -> server's newest.
{
  const res = call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  eq(res.status, 200, 'initialize -> 200');
  eq(res.body.jsonrpc, '2.0', 'initialize response is jsonrpc 2.0');
  eq(res.body.id, 1, 'initialize response echoes the request id');
  eq(res.body.result.protocolVersion, mcpCore.SUPPORTED_PROTOCOL_VERSIONS[0], 'no protocolVersion given -> falls back to the server\'s newest');
  deq(res.body.result.capabilities, { tools: {} }, 'capabilities advertise tools only — no resources/prompts/sampling/logging (none implemented)');
  eq(res.body.result.serverInfo.name, mcpCore.SERVER_INFO.name, 'serverInfo.name present');
  ok(typeof res.body.result.serverInfo.version === 'string' && res.body.result.serverInfo.version.length > 0, 'serverInfo.version present');
}

// C2. initialize — a SUPPORTED version is echoed back.
{
  const requested = mcpCore.SUPPORTED_PROTOCOL_VERSIONS[0];
  const res = call({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: requested } });
  eq(res.body.result.protocolVersion, requested, 'a supported client-requested protocolVersion is echoed back exactly');
}

// C3. initialize — an UNSUPPORTED version falls back to the server's newest.
{
  const bogus = 'not-a-real-mcp-protocol-version';
  ok(mcpCore.SUPPORTED_PROTOCOL_VERSIONS.indexOf(bogus) === -1, 'sanity: the bogus version really is unsupported');
  const res = call({ jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: bogus } });
  eq(res.body.result.protocolVersion, mcpCore.SUPPORTED_PROTOCOL_VERSIONS[0], 'an unsupported protocolVersion falls back to the server\'s newest supported version');
}

// C4. notifications/initialized -> 202, no body, not a null-id response.
{
  const res = call({ jsonrpc: '2.0', method: 'notifications/initialized' });
  eq(res.status, 202, 'notifications/initialized -> 202');
  eq(res.body, null, 'notifications/initialized carries NO body (not {jsonrpc, id:null, ...})');
}

// C5. Generalization: ANY notification (no "id" member) gets no response,
// not just the one method name called out by the row — proves the rule is
// general, not a special case hardcoded to one string.
{
  const res = call({ jsonrpc: '2.0', method: 'some/arbitrary/unknown/notification' });
  eq(res.status, 202, 'an arbitrary notification (no id) still gets 202, regardless of method name');
  eq(res.body, null, 'an arbitrary notification still carries no body');
}

// C6. ping.
{
  const res = call({ jsonrpc: '2.0', id: 'ping-1', method: 'ping' });
  eq(res.status, 200, 'ping -> 200');
  deq(res.body.result, {}, 'ping result is an empty object');
  eq(res.body.id, 'ping-1', 'ping echoes a string id correctly (ids are not assumed to be numeric)');
}

// C7. Unknown method (a REQUEST, has an id) -> -32601.
{
  const res = call({ jsonrpc: '2.0', id: 7, method: 'totally/unknown/method' });
  eq(res.status, 200, 'unknown method -> 200 (JSON-RPC error response, not an HTTP-level failure)');
  eq(res.body.error.code, -32601, 'unknown method -> JSON-RPC -32601');
  eq(res.body.id, 7, 'error response still echoes the request id');
  ok(!('result' in res.body), 'an error response must not also carry a "result"');
}

// C8. Malformed envelope population — a non-vacuous set of distinct ways a
// message can fail to be a well-formed JSON-RPC 2.0 envelope.
const MALFORMED_ENVELOPES = [
  { label: 'not-an-object (string)', message: 'hello' },
  { label: 'not-an-object (array)', message: [1, 2, 3] },
  { label: 'not-an-object (number)', message: 42 },
  { label: 'null', message: null },
  { label: 'missing jsonrpc', message: { id: 1, method: 'ping' } },
  { label: 'wrong jsonrpc value', message: { jsonrpc: '1.0', id: 1, method: 'ping' } },
  { label: 'missing method', message: { jsonrpc: '2.0', id: 1 } },
  { label: 'non-string method', message: { jsonrpc: '2.0', id: 1, method: 42 } },
  { label: 'empty-string method', message: { jsonrpc: '2.0', id: 1, method: '' } },
  { label: 'id is an object', message: { jsonrpc: '2.0', id: {}, method: 'ping' } },
  { label: 'id is an array', message: { jsonrpc: '2.0', id: [], method: 'ping' } },
];
ok(MALFORMED_ENVELOPES.length >= 10, 'sanity: malformed-envelope population has at least 10 distinct cases');
for (const { label, message } of MALFORMED_ENVELOPES) {
  const res = call(message);
  const isObjNoId = message !== null && typeof message === 'object' && !Array.isArray(message) && !('id' in message);
  if (isObjNoId) {
    eq(res.status, 202, `malformed envelope (${label}): an object with no "id" is treated as a notification -> 202, no body`);
    eq(res.body, null, `malformed envelope (${label}): notification-shaped malformed envelope carries no body`);
  } else {
    eq(res.status, 200, `malformed envelope (${label}) -> 200`);
    eq(res.body.error.code, -32600, `malformed envelope (${label}) -> JSON-RPC -32600`);
  }
}
console.log(`  verified ${MALFORMED_ENVELOPES.length} malformed-envelope cases + notifications/initialized + a generic notification + ping + unknown-method`);

// ===========================================================================
// D. tools/list — exactly the 4 row-named tools, each well-formed.
// ===========================================================================
console.log('\nD. tools/list — exactly the 4 row-named tools, each well-formed');

const EXPECTED_TOOL_NAMES = ['find_pools', 'get_pool', 'forever_number', 'explain_rails'];
{
  const res = call({ jsonrpc: '2.0', id: 'tl', method: 'tools/list' });
  eq(res.status, 200, 'tools/list -> 200');
  const names = res.body.result.tools.map((t) => t.name).sort();
  deq(names, EXPECTED_TOOL_NAMES.slice().sort(), 'tools/list returns EXACTLY the 4 row-named tools, no more, no fewer');

  for (const tool of res.body.result.tools) {
    ok(typeof tool.description === 'string' && tool.description.length > 40, `${tool.name}: description is non-trivial prose`);
    ok(/rail|APY|TVL/i.test(tool.description), `${tool.name}: description STATES the rails (mentions rail/APY/TVL), not only the mechanics`);
    ok(tool.inputSchema && tool.inputSchema.type === 'object', `${tool.name}: inputSchema.type is "object"`);
    ok(tool.inputSchema.properties && typeof tool.inputSchema.properties === 'object', `${tool.name}: inputSchema.properties is an object`);
    ok(Array.isArray(tool.inputSchema.required), `${tool.name}: inputSchema.required is an array`);
    for (const req of tool.inputSchema.required) {
      ok(req in tool.inputSchema.properties, `${tool.name}: required field "${req}" is described in properties`);
    }
  }
}
// Required-ness is marked correctly for the two tools with a mandatory arg.
{
  const res = call({ jsonrpc: '2.0', id: 'tl2', method: 'tools/list' });
  const byName = Object.fromEntries(res.body.result.tools.map((t) => [t.name, t]));
  deq(byName.get_pool.inputSchema.required, ['pool_id'], 'get_pool.inputSchema.required === ["pool_id"]');
  deq(byName.forever_number.inputSchema.required, ['monthly'], 'forever_number.inputSchema.required === ["monthly"]');
  deq(byName.find_pools.inputSchema.required, [], 'find_pools.inputSchema.required === [] (every arg optional)');
  deq(byName.explain_rails.inputSchema.required, [], 'explain_rails.inputSchema.required === [] (no args)');
}

// ===========================================================================
// E. tools/call — protocol-level error branches (-32602).
// ===========================================================================
console.log('\nE. tools/call error branches (-32602)');

function callTool(name, args, id) {
  return call({ jsonrpc: '2.0', id: id === undefined ? 'call' : id, method: 'tools/call', params: { name, arguments: args } });
}

{
  const res = callTool('not_a_real_tool', {}, 'e1');
  eq(res.status, 200, 'unknown tool name -> 200 (JSON-RPC error)');
  eq(res.body.error.code, -32602, 'unknown tool name -> -32602');
}
{
  const res = callTool('get_pool', {}, 'e2');
  eq(res.body.error.code, -32602, 'get_pool with no pool_id -> -32602');
}
{
  const res = callTool('get_pool', { pool_id: 12345 }, 'e3');
  eq(res.body.error.code, -32602, 'get_pool with a non-string pool_id -> -32602');
}
{
  const res = callTool('forever_number', {}, 'e4');
  eq(res.body.error.code, -32602, 'forever_number with no monthly -> -32602');
}
{
  const res = callTool('forever_number', { monthly: '100' }, 'e5');
  eq(res.body.error.code, -32602, 'forever_number with monthly as a STRING (not a JSON number) -> -32602');
}
{
  const res = callTool('find_pools', { minTvl: 'a lot' }, 'e6');
  eq(res.body.error.code, -32602, 'find_pools with a wrong-typed optional arg (minTvl as a string) -> -32602');
}
{
  // tools/call itself missing a "name" param entirely.
  const res = call({ jsonrpc: '2.0', id: 'e7', method: 'tools/call', params: {} });
  eq(res.body.error.code, -32602, 'tools/call with no "name" param -> -32602');
}

// ===========================================================================
// F. DELEGATION — structural proof (spy on apiCore.handleApiRequest) +
//    tool<->route parity, both directions, over arg combos DERIVED from the
//    snapshot at test time (never hand-picked constants).
// ===========================================================================
console.log('\nF. delegation (structural) + tool<->route parity, both directions');

// F0. Every tool's declared route is a real api-core.js route, and every
// route this item's row names is reachable from some tool (both
// directions of "reachable"/"maps to a real route").
const API_ROUTE_PATHS = apiCore.ENDPOINTS.map((e) => e.path);
const TOOL_ROUTES = mcpCore.TOOLS.map((t) => t.route);
for (const route of TOOL_ROUTES) {
  ok(API_ROUTE_PATHS.includes(route), `tool route "${route}" must be one of api-core.js's real ENDPOINTS`);
}
const ROW_NAMED_ROUTES = ['/api', '/api/pools', '/api/pools/:id', '/api/forever-number'];
for (const route of ROW_NAMED_ROUTES) {
  ok(TOOL_ROUTES.includes(route), `route "${route}" must be reachable from some tool in TOOLS`);
}

/** Runs `fn` with apiCore.handleApiRequest replaced by a recording spy that
 * still delegates to the real implementation, restoring the original
 * afterward even on throw. Proves DELEGATION IS STRUCTURAL: if a future
 * edit made a tool compute its own answer instead of calling
 * apiCore.handleApiRequest, `calls` would be empty (or wrong) here — this
 * is the assertion the mandatory non-vacuity proof neuters. */
function withDelegationSpy(fn) {
  const original = apiCore.handleApiRequest;
  const calls = [];
  apiCore.handleApiRequest = function (req) {
    calls.push(req);
    return original(req);
  };
  try {
    fn();
  } finally {
    apiCore.handleApiRequest = original;
  }
  return calls;
}

function callToolResultBody(name, args, id) {
  const res = callTool(name, args, id);
  eq(res.status, 200, `${name}(${JSON.stringify(args)}): expected a successful JSON-RPC response (protocol level)`);
  ok(res.body.result && Array.isArray(res.body.result.content) && res.body.result.content[0], `${name}(${JSON.stringify(args)}): result.content[0] exists`);
  return { parsed: JSON.parse(res.body.result.content[0].text), isError: res.body.result.isError };
}

// Real chain/project/token/pool-id, DERIVED from the snapshot, not
// hardcoded constants — RAZOR's weakest-hypothesis rule applied to fixture
// selection: whatever the population happens to contain today is what
// gets exercised, so this test keeps working as the snapshot changes.
const railedPopulation = POPULATION.filter((p) => apiCore.meetsFloor(p, trustRails.DEFAULT_MIN_TVL) && !apiCore.isAnomalous(p));
ok(railedPopulation.length > 100, 'sanity: a non-trivial railed population exists to derive test fixtures from');
const sortedByTvl = railedPopulation.slice().sort((a, b) => (Number(b.tvlUsd) || 0) - (Number(a.tvlUsd) || 0));
const topPool = sortedByTvl[0];
ok(topPool && typeof topPool.pool === 'string' && topPool.pool.length > 0, 'sanity: a real top-TVL railed pool exists to derive fixtures from');
console.log(`  derived fixture pool from the live snapshot: pool=${topPool.pool} chain=${topPool.chain} project=${topPool.project} symbol=${topPool.symbol}`);

const FIND_POOLS_ARG_COMBOS = [
  {},
  { chain: topPool.chain },
  { project: topPool.project },
  { token: topPool.symbol.slice(0, Math.max(1, Math.ceil(topPool.symbol.length / 2))) },
  { minTvl: trustRails.DEFAULT_MIN_TVL * 2 },
  { limit: 9 },
  { chain: topPool.chain, project: topPool.project, limit: 5 },
  { limit: apiCore.MAX_LIMIT },
];

function buildFindPoolsSearchParams(args) {
  const sp = new URLSearchParams();
  if (args.token !== undefined) sp.set('token', String(args.token));
  if (args.chain !== undefined) sp.set('chain', String(args.chain));
  if (args.project !== undefined) sp.set('project', String(args.project));
  if (args.minTvl !== undefined) sp.set('minTvl', String(args.minTvl));
  if (args.limit !== undefined) sp.set('limit', String(args.limit));
  return sp;
}

function expectedPoolsRoute(args) {
  return apiCore.handleApiRequest({ pathname: '/api/pools', searchParams: buildFindPoolsSearchParams(args), pools: POPULATION });
}

FIND_POOLS_ARG_COMBOS.forEach((args, i) => {
  const expected = expectedPoolsRoute(args);
  const expectedSearchParamsString = buildFindPoolsSearchParams(args).toString();
  const spyCalls = withDelegationSpy(() => {
    const { parsed, isError } = callToolResultBody('find_pools', args, 'fp-' + i);
    deq(parsed, expected.body, `find_pools(${JSON.stringify(args)}): MCP tool body must be deep-equal to GET /api/pools's body for the same args (direction 1: tool -> route)`);
    eq(isError, expected.status >= 400, `find_pools(${JSON.stringify(args)}): isError must equal (delegated status >= 400)`);
  });
  eq(spyCalls.length, 1, `find_pools(${JSON.stringify(args)}): must call apiCore.handleApiRequest EXACTLY ONCE (structural delegation, not a re-implementation)`);
  eq(spyCalls[0].pathname, '/api/pools', `find_pools(${JSON.stringify(args)}): delegates to pathname "/api/pools"`);
  eq(spyCalls[0].searchParams.toString(), expectedSearchParamsString, `find_pools(${JSON.stringify(args)}): argsToRequest builds the exact expected URLSearchParams, no more, no fewer`);
});

// get_pool: a real, existing pool id (direction 1 + 2) and an id that does
// NOT exist (proves the flagged-not-hidden / 404-isError path too).
{
  const expected = apiCore.handleApiRequest({ pathname: '/api/pools/' + topPool.pool, searchParams: new URLSearchParams(), pools: POPULATION });
  const spyCalls = withDelegationSpy(() => {
    const { parsed, isError } = callToolResultBody('get_pool', { pool_id: topPool.pool }, 'gp-real');
    deq(parsed, expected.body, 'get_pool(real id): MCP tool body deep-equal to GET /api/pools/:id\'s body');
    eq(isError, false, 'get_pool(real id): isError false (a real, railed pool resolves cleanly)');
  });
  eq(spyCalls.length, 1, 'get_pool(real id): calls apiCore.handleApiRequest exactly once');
  eq(spyCalls[0].pathname, '/api/pools/' + topPool.pool, 'get_pool(real id): delegates to the exact expected pathname');

  const unknownId = 'mcp-parity-unknown-' + topPool.pool;
  ok(!POPULATION.some((p) => p.pool === unknownId), 'sanity: the unknown-id fixture does not collide with a real pool id');
  const expectedUnknown = apiCore.handleApiRequest({ pathname: '/api/pools/' + unknownId, searchParams: new URLSearchParams(), pools: POPULATION });
  const { parsed: parsedUnknown, isError: isErrorUnknown } = callToolResultBody('get_pool', { pool_id: unknownId }, 'gp-unknown');
  deq(parsedUnknown, expectedUnknown.body, 'get_pool(unknown id): MCP tool body deep-equal to GET /api/pools/:id\'s 404 body');
  eq(isErrorUnknown, true, 'get_pool(unknown id): isError true (delegated status 404 >= 400) — a SUCCESSFUL JSON-RPC response, never a protocol error');
}

// forever_number.
const FOREVER_NUMBER_ARG_COMBOS = [{ monthly: 20 }, { monthly: 100, apy: 5 }, { monthly: 9.99 }, { monthly: 0.01, apy: 0.001 }];
FOREVER_NUMBER_ARG_COMBOS.forEach((args, i) => {
  const sp = new URLSearchParams();
  sp.set('monthly', String(args.monthly));
  if (args.apy !== undefined) sp.set('apy', String(args.apy));
  const expected = apiCore.handleApiRequest({ pathname: '/api/forever-number', searchParams: sp, pools: POPULATION });
  const spyCalls = withDelegationSpy(() => {
    const { parsed, isError } = callToolResultBody('forever_number', args, 'fn-' + i);
    deq(parsed, expected.body, `forever_number(${JSON.stringify(args)}): MCP tool body deep-equal to GET /api/forever-number's body`);
    eq(isError, expected.status >= 400, `forever_number(${JSON.stringify(args)}): isError matches delegated status`);
  });
  eq(spyCalls.length, 1, `forever_number(${JSON.stringify(args)}): calls apiCore.handleApiRequest exactly once`);
  eq(spyCalls[0].pathname, '/api/forever-number', `forever_number(${JSON.stringify(args)}): delegates to "/api/forever-number"`);
});

// explain_rails.
{
  const expected = apiCore.handleApiRequest({ pathname: '/api', searchParams: new URLSearchParams(), pools: POPULATION });
  const spyCalls = withDelegationSpy(() => {
    const { parsed, isError } = callToolResultBody('explain_rails', {}, 'er-1');
    deq(parsed, expected.body, 'explain_rails: MCP tool body deep-equal to GET /api\'s body');
    eq(isError, false, 'explain_rails: isError false');
  });
  eq(spyCalls.length, 1, 'explain_rails: calls apiCore.handleApiRequest exactly once');
  eq(spyCalls[0].pathname, '/api', 'explain_rails: delegates to "/api"');
}

console.log(`  verified tool<->route parity (both directions) + structural delegation over ${FIND_POOLS_ARG_COMBOS.length} find_pools combos, get_pool (real+unknown), ${FOREVER_NUMBER_ARG_COMBOS.length} forever_number combos, and explain_rails`);

// ===========================================================================
// G. Full-population invariant, over ALL pools returned by find_pools
//    across every combo above — not a sample.
// ===========================================================================
console.log('\nG. full-population invariant over ALL find_pools-returned pools');

let checkedPoolCount = 0;
FIND_POOLS_ARG_COMBOS.forEach((args) => {
  const { parsed } = callToolResultBody('find_pools', args, 'inv-' + JSON.stringify(args));
  ok(Array.isArray(parsed.pools), `find_pools(${JSON.stringify(args)}): body.pools is an array`);
  for (const returnedPool of parsed.pools) {
    checkedPoolCount++;
    ok(independentTotalApy(returnedPool) <= trustRails.APY_SANITY_LIMIT,
      `find_pools(${JSON.stringify(args)}): returned pool ${returnedPool.pool} must not exceed APY_SANITY_LIMIT (got ${independentTotalApy(returnedPool)}%)`);
    ok((Number(returnedPool.tvlUsd) || 0) >= trustRails.DEFAULT_MIN_TVL,
      `find_pools(${JSON.stringify(args)}): returned pool ${returnedPool.pool} must meet the TVL floor (got $${returnedPool.tvlUsd})`);
  }
});
ok(checkedPoolCount > 100, `sanity: the invariant was actually checked over a non-trivial number of pools (got ${checkedPoolCount})`);
console.log(`  checked the sanity-limit + TVL-floor invariant over ${checkedPoolCount} pools returned across ${FIND_POOLS_ARG_COMBOS.length} find_pools calls`);

// ===========================================================================
// H. Positive controls — anomaly (natural, vacuity-guarded) + TVL floor
//    (derived; prefers a natural instance, states which kind was used).
// ===========================================================================
console.log('\nH. positive controls (anomaly + TVL floor)');

const expectedAnomalous = POPULATION.filter((p) => independentTotalApy(p) > trustRails.APY_SANITY_LIMIT);
if (expectedAnomalous.length === 0) {
  throw new Error('VACUITY GUARD TRIPPED: data/pools-snapshot.json contains ZERO pools above APY_SANITY_LIMIT — ' +
    'the anomaly positive control cannot be tested from real data. This must not pass silently; investigate the ' +
    'snapshot before trusting this test run.');
}
console.log(`  found ${expectedAnomalous.length} NATURAL anomalous pools in the snapshot (max total APY ` +
  `${Math.max(...expectedAnomalous.map(independentTotalApy)).toFixed(2)}%) — using ALL of them as the find_pools anomaly positive control.`);

for (const anomPool of expectedAnomalous) {
  const { parsed } = callToolResultBody('find_pools', { project: anomPool.project, chain: anomPool.chain, limit: apiCore.MAX_LIMIT }, 'anom-' + anomPool.pool);
  const ids = parsed.pools.map((p) => p.pool);
  ok(!ids.includes(anomPool.pool), `find_pools via MCP: known-anomalous pool ${anomPool.pool} (${anomPool.project}/${anomPool.chain}, total APY ${independentTotalApy(anomPool).toFixed(2)}%) must be ABSENT from its own project+chain query`);
}
for (const anomPool of expectedAnomalous) {
  const { parsed, isError } = callToolResultBody('get_pool', { pool_id: anomPool.pool }, 'anom-single-' + anomPool.pool);
  eq(isError, false, `get_pool via MCP on a known-anomalous pool: isError must be FALSE (flagged, not a delegated error status)`);
  eq(parsed.anomalous, true, `get_pool via MCP on a known-anomalous pool: body.anomalous must be true`);
  ok(typeof parsed.reason === 'string' && parsed.reason.length > 10, `get_pool via MCP on a known-anomalous pool: body.reason is real prose`);
}
console.log(`  verified all ${expectedAnomalous.length} natural anomalous pools absent from find_pools AND flagged (not hidden) via get_pool`);

const expectedSubFloor = POPULATION.filter((p) => (Number(p.tvlUsd) || 0) < trustRails.DEFAULT_MIN_TVL);
let floorControlPool;
let floorControlPopulation;
if (expectedSubFloor.length > 0) {
  floorControlPool = expectedSubFloor[0];
  floorControlPopulation = POPULATION;
  console.log(`  TVL-floor positive control: using a NATURAL sub-floor pool (${floorControlPool.pool}) — unexpected but preferred over synthetic.`);
} else {
  const template = POPULATION[0];
  floorControlPool = Object.assign({}, template, {
    pool: '228-mcp-derived-sub-floor-control',
    project: '228-mcp-derived-sub-floor-project',
    chain: template.chain,
    symbol: template.symbol,
    tvlUsd: trustRails.DEFAULT_MIN_TVL - 1,
    apyBase: 1, apyReward: 0, // deliberately far from the anomaly limit — isolates the floor rail specifically
  });
  ok(!POPULATION.some((p) => p.pool === floorControlPool.pool), 'sanity: synthetic sub-floor id does not collide with a real pool id');
  floorControlPopulation = POPULATION.concat([floorControlPool]);
  console.log('  TVL-floor positive control: using a SYNTHETIC pool derived by cloning a real population member and perturbing only tvlUsd — no natural sub-floor pool exists in the current snapshot (generate-pools-snapshot.js already floors upstream, mirroring test_api_worker.js\'s own documented finding).');
}
ok((Number(floorControlPool.tvlUsd) || 0) < trustRails.DEFAULT_MIN_TVL, 'sanity: the floor control pool is genuinely below the floor');
ok(independentTotalApy(floorControlPool) <= trustRails.APY_SANITY_LIMIT, 'sanity: the floor control pool is NOT also anomalous (isolates the floor rail specifically)');

{
  const floorMsg = { jsonrpc: '2.0', id: 'floor-scoped', method: 'tools/call', params: { name: 'find_pools', arguments: { project: floorControlPool.project, limit: apiCore.MAX_LIMIT } } };
  const floorRes = mcpCore.handleMcpMessage({ message: floorMsg, pools: floorControlPopulation });
  eq(floorRes.status, 200, 'find_pools via MCP over the floor-control population -> 200');
  const floorBody = JSON.parse(floorRes.body.result.content[0].text);
  ok(!floorBody.pools.map((p) => p.pool).includes(floorControlPool.pool), 'find_pools via MCP: the floor-control pool must be ABSENT from its own scoped query');

  const floorSingleMsg = { jsonrpc: '2.0', id: 'floor-single', method: 'tools/call', params: { name: 'get_pool', arguments: { pool_id: floorControlPool.pool } } };
  const floorSingleRes = mcpCore.handleMcpMessage({ message: floorSingleMsg, pools: floorControlPopulation });
  eq(floorSingleRes.status, 200, 'get_pool via MCP on the floor-control pool -> 200 (still resolves)');
  const floorSingleBody = JSON.parse(floorSingleRes.body.result.content[0].text);
  eq(floorSingleBody.belowMinTvl, true, 'get_pool via MCP on the floor-control pool: body.belowMinTvl must be true');
  eq(floorSingleRes.body.result.isError, false, 'get_pool via MCP on the floor-control pool: isError false (flagged, not a delegated error status)');
}

// ===========================================================================
// I. explain_rails <-> trust-rails.js, both directions.
// ===========================================================================
console.log('\nI. explain_rails <-> trust-rails.js parity, both directions');
{
  const { parsed } = callToolResultBody('explain_rails', {}, 'rails-parity');
  eq(parsed.rails.apySanityLimit, trustRails.APY_SANITY_LIMIT, 'direction 1: explain_rails.rails.apySanityLimit === trust-rails.js APY_SANITY_LIMIT');
  eq(trustRails.APY_SANITY_LIMIT, parsed.rails.apySanityLimit, 'direction 2 (reverse): trust-rails.js APY_SANITY_LIMIT === explain_rails.rails.apySanityLimit');
  eq(parsed.rails.minTvl, trustRails.DEFAULT_MIN_TVL, 'direction 1: explain_rails.rails.minTvl === trust-rails.js DEFAULT_MIN_TVL');
  eq(trustRails.DEFAULT_MIN_TVL, parsed.rails.minTvl, 'direction 2 (reverse): trust-rails.js DEFAULT_MIN_TVL === explain_rails.rails.minTvl');
}

// ===========================================================================
// J. /mcp classification (new) + a re-run of PRE-EXISTING classifier cases,
//    proving they are unchanged by this item's edit to agent-log-core.js.
// ===========================================================================
console.log('\nJ. /mcp classification + pre-existing classifier cases (unchanged)');

// J1. The new class itself.
eq(agentLogCore.classifyRequest({ pathname: '/mcp', accept: 'application/json' }).pathClass, 'mcp', 'bare /mcp classifies as mcp');
eq(agentLogCore.classifyRequest({ pathname: '/mcp/', accept: '*/*' }).pathClass, 'mcp', '/mcp/ classifies as mcp');
eq(agentLogCore.classifyRequest({ pathname: '/mcp/tools/call', accept: '*/*' }).pathClass, 'mcp', 'a deeper /mcp/* path classifies as mcp');
eq(agentLogCore.classifyRequest({ pathname: '/mcp?x=1', accept: '*/*' }).pathClass, 'mcp', 'a stray query string must not defeat /mcp classification');
eq(agentLogCore.classifyRequest({ pathname: '/mcp/x.md', accept: '*/*' }).pathClass, 'mcp',
  'precedence proof: a path under /mcp/ that happens to end .md must classify mcp (checked before md_twin), mirroring the well_known-vs-md_twin precedence proof in test_agent_log.js');
const notMcp = agentLogCore.classifyRequest({ pathname: '/mcpx', accept: '*/*' });
ok(notMcp === null, '/mcpx (neither equal to "/mcp" nor starting with "/mcp/") must NOT classify as mcp — negative control against an over-broad prefix match');
eq(agentLogCore.classifyRequest({ pathname: '/api/mcp', accept: '*/*' }).pathClass, 'api', 'a literal path under /api/ that happens to contain "mcp" is still classified api (precedence: api is checked before mcp)');

// J2. Re-run of PRE-EXISTING cases (small but real population, drawn from
// disk — same technique test_agent_log.js's section A uses), proving the
// insertion of the mcp branch did not disturb anything checked before it.
function sampleArray(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

eq(agentLogCore.classifyRequest({ pathname: '/llms.txt', accept: '*/*' }).pathClass, 'llms', 'pre-existing: /llms.txt still classifies llms');
eq(agentLogCore.classifyRequest({ pathname: '/llms-full.txt', accept: '*/*' }).pathClass, 'llms', 'pre-existing: /llms-full.txt still classifies llms');
eq(agentLogCore.classifyRequest({ pathname: '/openapi.json', accept: 'application/json' }).pathClass, 'well_known', 'pre-existing: /openapi.json still classifies well_known');
eq(agentLogCore.classifyRequest({ pathname: '/api/whatever', accept: '*/*' }).pathClass, 'api', 'pre-existing: /api/* still classifies api');
eq(agentLogCore.classifyRequest({ pathname: '/api', accept: '*/*' }).pathClass, 'api', 'pre-existing: bare /api still classifies api');
eq(agentLogCore.classifyRequest({ pathname: '/', accept: 'text/markdown' }).pathClass, 'markdown_negotiation', 'pre-existing: / + Accept:text/markdown still classifies markdown_negotiation');
eq(agentLogCore.classifyRequest({ pathname: '/tokens/usdc.md', accept: 'text/markdown' }).pathClass, 'md_twin', 'pre-existing: a literal .md URL with a markdown Accept header is still md_twin (path-specific outranks the generic Accept rule)');

const poolMdSample = sampleArray(fs.readdirSync(path.join(ROOT, 'pools')).filter((f) => f.endsWith('.md')).sort(), 8).map((f) => '/pools/' + f);
const tokenMdSample = sampleArray(fs.readdirSync(path.join(ROOT, 'tokens')).filter((f) => f.endsWith('.md')).sort(), 8).map((f) => '/tokens/' + f);
const chainMdSample = sampleArray(fs.readdirSync(path.join(ROOT, 'chains')).filter((f) => f.endsWith('.md')).sort(), 8).map((f) => '/chains/' + f);
const MD_TWIN_RECHECK = [...poolMdSample, ...tokenMdSample, ...chainMdSample];
ok(MD_TWIN_RECHECK.length >= 15, `sanity: expected >=15 re-sampled .md twins, got ${MD_TWIN_RECHECK.length}`);
MD_TWIN_RECHECK.forEach((p) => {
  ok(fs.existsSync(path.join(ROOT, p.replace(/^\//, ''))), `sanity: re-sampled twin ${p} must be a real file on disk`);
  eq(agentLogCore.classifyRequest({ pathname: p, accept: 'text/plain' }).pathClass, 'md_twin', `pre-existing: ${p} still classifies md_twin`);
});

const wellKnownSample = sampleArray(
  fs.readdirSync(path.join(ROOT, '.well-known'), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => '/.well-known/' + e.name),
  6
);
ok(wellKnownSample.length >= 3, `sanity: expected >=3 re-sampled .well-known files, got ${wellKnownSample.length}`);
wellKnownSample.forEach((p) => {
  eq(agentLogCore.classifyRequest({ pathname: p, accept: 'application/json' }).pathClass, 'well_known', `pre-existing: ${p} still classifies well_known`);
});

const rootAssetNegativeSample = sampleArray(
  fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)
    .filter((name) => /\.(html|css|js)$/.test(name)).filter((name) => !name.startsWith('test_')),
  10
);
ok(rootAssetNegativeSample.length >= 8, `sanity: expected >=8 re-sampled negative root assets, got ${rootAssetNegativeSample.length}`);
rootAssetNegativeSample.forEach((name) => {
  eq(agentLogCore.classifyRequest({ pathname: '/' + name, accept: 'text/html,application/xhtml+xml' }), null, `pre-existing negative: /${name} still classifies null (not agent surface)`);
});

console.log(`  re-verified ${MD_TWIN_RECHECK.length} md twins, ${wellKnownSample.length} well_known files, ${rootAssetNegativeSample.length} negatives, plus llms/api/markdown_negotiation/precedence cases — all UNCHANGED`);

// ===========================================================================
// K. The real Worker (edge/agent-log.mjs): /mcp dispatch, CORS/OPTIONS/405,
//    JSON parse failure, 503 on upstream failure, agent-read logging as
//    path_class "mcp", and the pass-through identity proof RE-STATED for
//    the new (non-/api, non-/mcp) boundary.
// ===========================================================================

function makeFakeDB() {
  const calls = [];
  const db = {
    prepare(sql) {
      return { bind(...args) { return { run() { calls.push({ sql, args }); return Promise.resolve({ success: true }); } }; } };
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

/** Same string-vs-Request-object stub technique test_api_worker.js uses:
 * distinguishes getPools()'s upstream fetch (string URL) from the
 * pass-through path's `fetch(request)` (a Request-like object). */
function makeWorkerFetchStub({ poolsFail, poolsBody, passthroughResponse, onCall } = {}) {
  return async (input) => {
    if (onCall) onCall(input);
    if (typeof input === 'string') {
      if (poolsFail) return new Response('upstream broke', { status: 500 });
      return new Response(JSON.stringify({ status: 'success', data: poolsBody || [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return passthroughResponse;
  };
}

async function runWorkerTests() {
  console.log('\nK. edge/agent-log.mjs — /mcp dispatch + pass-through boundary restated');

  const workerUrl = pathToFileURL(path.join(EDGE_DIR, 'agent-log.mjs')).href;
  const workerModule = await import(workerUrl);
  const worker = workerModule.default;
  ok(worker && typeof worker.fetch === 'function', 'sanity: the real edge/agent-log.mjs exports a default object with fetch()');
  ok(typeof workerModule.__resetPoolsMemoForTests === 'function', 'sanity: the test-only pools-memo reset hook is exported (shared with /api\'s getPools() memo)');

  const originalFetch = global.fetch;
  function setFetch(fn) { global.fetch = fn; }
  function restoreFetch() { global.fetch = originalFetch; }

  console.log('\nK1. POST /mcp initialize -> 200 JSON-RPC result, correct headers, agent-read logged as path_class "mcp"');
  {
    workerModule.__resetPoolsMemoForTests();
    setFetch(makeWorkerFetchStub({ poolsBody: POPULATION.slice(0, 20) }));
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: mcpCore.SUPPORTED_PROTOCOL_VERSIONS[0] } });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody, headers: { 'content-type': 'application/json', 'user-agent': 'Claude-User/1.0', accept: 'application/json' } });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'POST /mcp initialize -> 200');
    eq(res.headers.get('access-control-allow-origin'), '*', 'CORS header present on POST /mcp');
    eq(res.headers.get('cache-control'), 'no-store', '/mcp responses are never publicly cached (call-specific JSON-RPC results)');
    eq(res.headers.get('content-type'), 'application/json; charset=utf-8', 'JSON content-type on POST /mcp');
    const body = await res.json();
    eq(body.jsonrpc, '2.0', 'response is jsonrpc 2.0');
    eq(body.result.serverInfo.name, mcpCore.SERVER_INFO.name, 'initialize result carries the real server name through the real Worker');
    eq(calls.length, 1, 'exactly one agent_reads row written for a POST /mcp request');
    eq(calls[0].args[8], 'mcp', `agent_reads row's path_class must be "mcp" for /mcp (got ${calls[0].args[8]})`);
    eq(calls[0].args[6], 200, 'agent_reads row status matches the actual 200 response');
  }

  console.log('\nK2. OPTIONS /mcp -> 204 with CORS headers, no pool fetch');
  {
    workerModule.__resetPoolsMemoForTests();
    let fetchCalled = false;
    setFetch(async () => { fetchCalled = true; return new Response('should not be reached', { status: 599 }); });
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'OPTIONS' });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 204, 'OPTIONS /mcp -> 204');
    eq(res.headers.get('access-control-allow-origin'), '*', 'OPTIONS /mcp carries CORS allow-origin');
    eq(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS', 'OPTIONS /mcp carries CORS allow-methods (POST, OPTIONS — no GET, this server offers no SSE stream)');
    eq(fetchCalled, false, 'OPTIONS preflight must never touch pool data (no fetch call)');
    eq(res.body, null, 'OPTIONS 204 preflight Response has a null body');
    const preflightText = await res.text();
    eq(preflightText, '', 'OPTIONS 204 preflight body reads as empty');
  }

  console.log('\nK3. GET /mcp -> 405 JSON, no pool fetch');
  {
    workerModule.__resetPoolsMemoForTests();
    let fetchCalled = false;
    setFetch(async () => { fetchCalled = true; return new Response('should not be reached', { status: 599 }); });
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'GET' });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 405, 'GET /mcp -> 405 (MCP\'s Streamable HTTP transport permits 405 for a server with no server->client SSE stream)');
    eq(fetchCalled, false, 'GET /mcp must never touch pool data');
    const body = await res.json();
    eq(body.error, 'method_not_allowed', 'GET /mcp body carries error:"method_not_allowed"');
    eq(calls.length, 1, 'GET /mcp is still logged as an agent read');
    eq(calls[0].args[8], 'mcp', 'GET /mcp agent_reads row is classified path_class "mcp"');
    eq(calls[0].args[6], 405, 'agent_reads row records the real 405 status');

    // Also PUT/DELETE -> 405, same discipline, no hardcoded assumption that
    // GET is the only "other" method.
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const { db: db2 } = makeFakeDB();
      const { ctx: ctx2, waited: waited2 } = makeFakeCtx();
      const req2 = makeRequest('https://www.defi.garden/mcp', { method });
      const res2 = await worker.fetch(req2, { DB: db2 }, ctx2);
      await Promise.allSettled(waited2);
      eq(res2.status, 405, `${method} /mcp -> 405`);
    }
  }

  console.log('\nK4. malformed JSON body -> 400, JSON-RPC -32700, no pool fetch attempted (parse happens before any pool-data fetch)');
  {
    workerModule.__resetPoolsMemoForTests();
    let fetchCalled = false;
    setFetch(async (input) => { if (typeof input === 'string') fetchCalled = true; return new Response('unexpected', { status: 599 }); });
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: '{not valid json', headers: { 'content-type': 'application/json' } });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 400, 'malformed JSON body -> 400');
    eq(fetchCalled, false, 'a JSON parse failure must never trigger a pool-data fetch');
    const body = await res.json();
    eq(body.jsonrpc, '2.0', 'parse-error body is still a JSON-RPC envelope');
    eq(body.id, null, 'parse-error body has id:null (no request could be identified)');
    eq(body.error.code, -32700, 'parse-error body carries JSON-RPC -32700');
    eq(calls.length, 1, 'a parse-error request is still logged as an agent read');
    eq(calls[0].args[8], 'mcp', 'parse-error agent_reads row is classified path_class "mcp"');
    eq(calls[0].args[6], 400, 'agent_reads row records the real 400 status');
  }

  console.log('\nK5. upstream pool-data fetch failure -> 503 JSON carrying rails, never a throw');
  {
    workerModule.__resetPoolsMemoForTests();
    setFetch(makeWorkerFetchStub({ poolsFail: true }));
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'explain_rails', arguments: {} } });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody });
    let threw = null, res;
    try { res = await worker.fetch(req, { DB: db }, ctx); } catch (err) { threw = err; }
    await Promise.allSettled(waited);
    ok(!threw, `upstream failure must not throw (threw: ${threw && threw.message})`);
    eq(res.status, 503, 'upstream pool-data failure on /mcp -> 503');
    const body = await res.json();
    eq(body.error, 'upstream_unavailable', '503 body carries error:"upstream_unavailable" (the same shape 227 established for /api)');
    ok(body.rails && typeof body.rails.apySanityLimit === 'number', '503 body carries a rails block (apiCore.buildRailsBlock())');
    eq(res.headers.get('cache-control'), 'no-store', 'a 503 /mcp response must not be publicly cacheable');
    eq(calls.length, 1, 'the 503 itself is still logged as an agent read');
    eq(calls[0].args[6], 503, 'agent_reads row records the real 503 status');
    eq(calls[0].args[8], 'mcp', '503 agent_reads row is still classified path_class "mcp"');
  }

  console.log('\nK6. tools/call find_pools through the REAL Worker == direct apiCore.handleApiRequest (end-to-end delegation proof)');
  {
    workerModule.__resetPoolsMemoForTests();
    setFetch(makeWorkerFetchStub({ poolsBody: POPULATION }));
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'find_pools', arguments: { limit: 5 } } });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'Worker-level tools/call find_pools -> 200');
    const body = await res.json();
    const parsed = JSON.parse(body.result.content[0].text);
    const expected = apiCore.handleApiRequest({ pathname: '/api/pools', searchParams: new URLSearchParams('limit=5'), pools: POPULATION });
    deq(parsed, expected.body, 'Worker-level find_pools body deep-equal to the direct api-core.js call over the full population');
  }

  console.log('\nK7. notifications/initialized through the REAL Worker -> 202, empty body');
  {
    workerModule.__resetPoolsMemoForTests();
    setFetch(makeWorkerFetchStub({ poolsBody: POPULATION.slice(0, 5) }));
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 202, 'Worker-level notifications/initialized -> 202');
    const text = await res.text();
    eq(text, '', 'Worker-level notifications/initialized has an empty body');
    eq(calls.length, 1, 'a notification is still logged as an agent read');
    eq(calls[0].args[6], 202, 'agent_reads row records the real 202 status');
    eq(calls[0].args[8], 'mcp', 'notification agent_reads row is classified path_class "mcp"');
  }

  console.log('\nK8. tools/list through the REAL Worker -> 200 with the 4 tools');
  {
    workerModule.__resetPoolsMemoForTests();
    setFetch(makeWorkerFetchStub({ poolsBody: POPULATION.slice(0, 5) }));
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'Worker-level tools/list -> 200');
    const body = await res.json();
    eq(body.result.tools.length, 4, 'Worker-level tools/list returns exactly 4 tools');
  }

  console.log('\nK9. non-/api, non-/mcp request: PASS-THROUGH RESTATED for the new boundary — SAME Response object, identity-checked');
  {
    workerModule.__resetPoolsMemoForTests();
    const sentinel = new Response('sentinel body', { status: 200, headers: { 'content-type': 'text/plain' } });
    setFetch(makeWorkerFetchStub({ passthroughResponse: sentinel }));
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/style.css', { headers: { accept: 'text/css' } });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    ok(res === sentinel, 'a non-/api, non-/mcp request must return the EXACT SAME Response instance fetch(request) produced — the pass-through contract, re-stated for the boundary AFTER 228 added the /mcp branch');
  }

  console.log('\nK10. /mcp request: NOT the pass-through sentinel (identity must differ) — the /mcp-specific half of the restated boundary proof');
  {
    workerModule.__resetPoolsMemoForTests();
    const sentinel = new Response('sentinel body', { status: 200, headers: { 'content-type': 'text/plain' } });
    setFetch(makeWorkerFetchStub({ passthroughResponse: sentinel, poolsBody: [] }));
    const { db } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
    const req = makeRequest('https://www.defi.garden/mcp', { method: 'POST', body: reqBody });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    ok(res !== sentinel, '/mcp must NEVER return the pass-through sentinel Response — it is always answered from mcp-core.js, regardless of what getPools()\'s upstream fetch receives');
  }

  restoreFetch();
}

runWorkerTests()
  .then(() => {
    console.log(`\ntest_mcp_server.js: ${passed}/${total} assertions passed`);
  })
  .catch((err) => {
    console.error(`test_mcp_server.js: FAILED after ${passed}/${total} assertions passed`);
    console.error(err);
    process.exitCode = 1;
  });
