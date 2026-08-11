/*
 * Pure, network/Worker-free core for the DeFi Garden MCP server (backlog
 * 228, spec 228). CommonJS, mirroring edge/api-core.js's and
 * edge/agent-log-core.js's shape exactly, for the same reason: the
 * plain-Node test harness (test_mcp_server.js) must `require()` this file
 * directly, and edge/agent-log.mjs (ESM) `import`s it the same way it
 * already imports `./api-core.js` and `./agent-log-core.js`.
 *
 * THE DEFINING CONSTRAINT (RAZOR / item 212's mirror rule): this file
 * exposes 227's already-railed reads as MCP tools by DELEGATING to
 * `edge/api-core.js`'s `handleApiRequest`, never by re-implementing any
 * rail, filter, or formula. Every entry in `TOOLS` carries the api-core
 * route it resolves to plus a pure `argsToRequest(args)` that builds
 * `{ pathname, searchParams }` — a real `URLSearchParams`, never a hand-
 * built query string. `tools/call` then calls
 * `apiCore.handleApiRequest({ pathname, searchParams, pools })` and returns
 * its `body` VERBATIM, wrapped as MCP tool content. There is therefore no
 * second copy of any rail to drift: this file contains NO rail constant
 * (grep-provable — neither trust-rails.js numeric literal appears anywhere
 * below) and NO arithmetic on a pool field. The `pools` array this file receives
 * is passed straight through to api-core.js and is never itself inspected,
 * filtered, mapped, or reduced here.
 *
 * WHY HAND-ROLLED JSON-RPC, NOT @modelcontextprotocol/sdk: see
 * product-loop-kit/specs/228.md's "Territory notes" — no new dependency is
 * the house rule for `edge/`, and the subset of MCP this server needs
 * (five methods, no SSE, no sessions, no sampling/resources/prompts) is a
 * small, fully-testable dispatch table.
 *
 * JSON-RPC 2.0 semantics implemented here (the transport-level concerns —
 * HTTP method/status/CORS, JSON.parse of the raw body — belong to the
 * Worker, edge/agent-log.mjs, exactly as `handleApiRequest` vs. `handleApi`
 * split those concerns for 227):
 *   - A message with an `id` member is a REQUEST: always answered with a
 *     JSON-RPC response object (a `result` or an `error`), `status: 200`.
 *   - A message with NO `id` member is a NOTIFICATION: JSON-RPC forbids a
 *     response to a notification, regardless of success or failure inside
 *     it — `handleMcpMessage` returns `{ status: 202, body: null }` for
 *     every notification, `notifications/initialized` included (this is
 *     the one method name the row calls out explicitly, but the rule is
 *     general, not special-cased past that).
 *   - Malformed envelope (not an object; missing/wrong `jsonrpc`; missing/
 *     non-string `method`; an `id` of the wrong type) -> `-32600`,
 *     `status: 200` if a response can be attempted (id extractable or
 *     absent-but-present-as-object), because a malformed message can still
 *     be structurally close enough to answer.
 *   - Unknown `method` -> `-32601`. Missing/invalid `tools/call` args, or
 *     an unknown tool `name` -> `-32602`. Any unexpected throw inside a
 *     method handler -> `-32603` (caught here; a SECOND, outer catch lives
 *     in the Worker for defense in depth, mirroring 227's two-layer guard).
 *   - A DELEGATED route returning `status >= 400` (e.g. `/api/pools/:id`
 *     404, `/api/forever-number` 400) is a *successful* JSON-RPC response
 *     carrying `result.isError: true` — per MCP's contract, a tool-level
 *     failure is not a protocol error.
 *   - Parse failure (`-32700`) is NOT produced here — the Worker owns
 *     `JSON.parse` of the raw request body and never calls this function
 *     with unparseable input.
 *
 * PROTOCOL VERSION: `SUPPORTED_PROTOCOL_VERSIONS` lists only the one
 * version this server has actually been built and tested against
 * (`2025-06-18`) — the weakest claim the evidence supports (RAZOR.md): this
 * file does not claim compatibility with an older/newer MCP protocol
 * revision it has never been exercised against. `initialize` echoes the
 * client's requested version when it's in that list, otherwise falls back
 * to the list's first (newest) entry, per the MCP initialization handshake.
 */

'use strict';

const apiCore = require('./api-core.js');

// ---------------------------------------------------------------------------
// 1. Protocol/server identity.
// ---------------------------------------------------------------------------

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18'];

const SERVER_INFO = {
  name: 'defi-garden-mcp',
  version: '0.1.0',
};

// This server implements tools only — no resources, prompts, sampling, or
// logging capability is advertised, because none is implemented.
// Advertising an unimplemented capability would be a false claim on the
// exact surface (agent-facing trust) whose whole differentiator is honesty.
const SERVER_CAPABILITIES = { tools: {} };

// ---------------------------------------------------------------------------
// 2. TOOLS — the single table tying each MCP tool to the api-core route it
//    delegates to. Descriptions state the RAILS (what's excluded/floored
//    and why), not just the mechanics — the differentiator NORTH_STAR's
//    Q4a names. Deliberately no numeric rail value is hardcoded in any
//    description: the actual current thresholds live in `explain_rails`'s
//    response (read from trust-rails.js via api-core.js), never here.
// ---------------------------------------------------------------------------

function findPoolsArgsToRequest(args) {
  const a = args || {};
  const searchParams = new URLSearchParams();
  if (a.token !== undefined && a.token !== null) searchParams.set('token', String(a.token));
  if (a.chain !== undefined && a.chain !== null) searchParams.set('chain', String(a.chain));
  if (a.project !== undefined && a.project !== null) searchParams.set('project', String(a.project));
  if (a.minTvl !== undefined && a.minTvl !== null) searchParams.set('minTvl', String(a.minTvl));
  if (a.limit !== undefined && a.limit !== null) searchParams.set('limit', String(a.limit));
  return { pathname: '/api/pools', searchParams: searchParams };
}

function getPoolArgsToRequest(args) {
  const a = args || {};
  return { pathname: '/api/pools/' + encodeURIComponent(String(a.pool_id)), searchParams: new URLSearchParams() };
}

function foreverNumberArgsToRequest(args) {
  const a = args || {};
  const searchParams = new URLSearchParams();
  if (a.monthly !== undefined && a.monthly !== null) searchParams.set('monthly', String(a.monthly));
  if (a.apy !== undefined && a.apy !== null) searchParams.set('apy', String(a.apy));
  return { pathname: '/api/forever-number', searchParams: searchParams };
}

function explainRailsArgsToRequest(_args) {
  return { pathname: '/api', searchParams: new URLSearchParams() };
}

const TOOLS = [
  {
    name: 'find_pools',
    route: '/api/pools',
    description:
      'Search DeFi Garden\'s railed, curated pool list by token symbol, chain, project, and/or a minimum TVL ' +
      'floor. Every pool this tool can return has already passed both of DeFi Garden\'s trust rails: any pool ' +
      'whose total APY (apyBase + apyReward) exceeds the platform\'s sanity limit is excluded entirely, never ' +
      'silently included with an inflated number; and every pool meets a minimum USD TVL floor — a ' +
      'caller-supplied minTvl argument may only RAISE that floor, never lower it (a lower value is clamped up). ' +
      'Call explain_rails to see the exact current threshold values. Delegates verbatim to GET /api/pools — no ' +
      'filtering or computation happens in this tool itself.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Case-insensitive substring match against the pool\'s token symbol, e.g. "USDC".' },
        chain: { type: 'string', description: 'Case-insensitive exact match against the pool\'s chain, e.g. "Ethereum".' },
        project: { type: 'string', description: 'Case-insensitive exact match against the pool\'s project/protocol name, e.g. "lido".' },
        minTvl: { type: 'number', description: 'Minimum USD TVL. May only raise the platform\'s floor, never lower it — a lower value is clamped up to the floor.' },
        limit: { type: 'number', description: 'Maximum number of pools to return. A server-side default and cap apply.' },
      },
      required: [],
    },
    argsToRequest: findPoolsArgsToRequest,
  },
  {
    name: 'get_pool',
    route: '/api/pools/:id',
    description:
      'Look up a single DeFi Garden pool by its DefiLlama pool id. Unlike find_pools, this never hides an ' +
      'anomalous or below-floor pool from a direct lookup — if the pool\'s total APY exceeds the sanity limit, ' +
      'or its TVL is below the minimum floor, the pool is still returned, but explicitly flagged ("anomalous" / ' +
      '"belowMinTvl", each paired with a prose "reason") so a caller can never mistake a flagged number for a ' +
      'railed one. Delegates verbatim to GET /api/pools/:id.',
    inputSchema: {
      type: 'object',
      properties: {
        pool_id: { type: 'string', description: 'The DefiLlama pool id — the same id defi.garden\'s "?pool=" query param uses.' },
      },
      required: ['pool_id'],
    },
    argsToRequest: getPoolArgsToRequest,
  },
  {
    name: 'forever_number',
    route: '/api/forever-number',
    description:
      'Computes the lump-sum capital whose yield alone would cover a recurring monthly bill forever ' +
      '(capital * rate/12 >= monthly), the SUBSCRIPTION-archetype math. Uses either a caller-supplied annual ' +
      'rate, or — when omitted — a TVL-weighted blended rate derived from DeFi Garden\'s currently-RAILED pool ' +
      'set (never a hand-picked pool, and never a pool that failed the sanity-limit or TVL-floor rails, so the ' +
      'blended rate can never be skewed by an anomalous or untrustworthy pool). Delegates verbatim to ' +
      'GET /api/forever-number.',
    inputSchema: {
      type: 'object',
      properties: {
        monthly: { type: 'number', description: 'Positive USD/month the capital must cover.' },
        apy: { type: 'number', description: 'Optional annual rate, percent. When omitted, a TVL-weighted blended rate is derived from the railed pool set.' },
      },
      required: ['monthly'],
    },
    argsToRequest: foreverNumberArgsToRequest,
  },
  {
    name: 'explain_rails',
    route: '/api',
    description:
      'Returns DeFi Garden\'s full API contract document: the exact CURRENT trust-rail values (the APY sanity ' +
      'limit and the minimum TVL floor, read live, never hardcoded), prose explanations of what each rail ' +
      'excludes and why, the upstream data source, and the endpoint list. Call this first to learn the actual ' +
      'current thresholds before interpreting any other tool\'s output. Delegates verbatim to GET /api.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    argsToRequest: explainRailsArgsToRequest,
  },
];

function findTool(name) {
  for (let i = 0; i < TOOLS.length; i++) {
    if (TOOLS[i].name === name) return TOOLS[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Minimal, hand-rolled JSON-Schema-shaped arg validation. Only checks
//    what TOOLS' own inputSchema declares (required-ness + a `type` of
//    "string"/"number") — enough to produce an honest -32602 on a missing
//    required arg or an obviously-wrong-typed one, without a validation
//    library dependency.
// ---------------------------------------------------------------------------

const TYPE_CHECKERS = {
  string: function (v) { return typeof v === 'string'; },
  number: function (v) { return typeof v === 'number' && Number.isFinite(v); },
};

/** Returns a human-readable problem string, or null if `args` satisfies
 * `tool.inputSchema`. */
function validateArgs(tool, args) {
  const schema = tool.inputSchema;
  const isPlainObject = args !== null && typeof args === 'object' && !Array.isArray(args);
  const required = schema.required || [];

  if (!isPlainObject) {
    if (required.length > 0) {
      return 'Tool "' + tool.name + '" requires arguments (' + required.join(', ') + '); none were provided.';
    }
    return null; // no required args, and no/empty arguments object is fine
  }

  for (let i = 0; i < required.length; i++) {
    const key = required[i];
    if (!(key in args) || args[key] === null || args[key] === undefined) {
      return 'Tool "' + tool.name + '" is missing required argument "' + key + '".';
    }
  }

  const properties = schema.properties || {};
  const keys = Object.keys(args);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const propSchema = properties[key];
    if (!propSchema) continue; // unknown property — tolerated, not this validator's concern
    const value = args[key];
    if (value === null || value === undefined) continue;
    const checker = TYPE_CHECKERS[propSchema.type];
    if (checker && !checker(value)) {
      return 'Tool "' + tool.name + '" argument "' + key + '" must be of type "' + propSchema.type + '" (got ' + typeof value + ').';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 4. JSON-RPC envelope helpers.
// ---------------------------------------------------------------------------

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id: id, result: result };
}

function jsonRpcError(id, code, message, data) {
  const error = { code: code, message: message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: error };
}

/** Returns a problem string if `message` is not a well-formed JSON-RPC 2.0
 * envelope, else null. Deliberately narrow: this only checks the envelope
 * shape (jsonrpc/method/id), never anything method-specific — that's each
 * method handler's own job below. */
function envelopeProblem(message) {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return 'Request must be a JSON object.';
  }
  if (message.jsonrpc !== '2.0') {
    return 'Request must have "jsonrpc": "2.0".';
  }
  if (typeof message.method !== 'string' || message.method.length === 0) {
    return 'Request must have a non-empty string "method".';
  }
  if ('id' in message) {
    const idType = typeof message.id;
    if (message.id !== null && idType !== 'string' && idType !== 'number') {
      return 'Request "id", when present, must be a string, a number, or null.';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. Method handlers.
// ---------------------------------------------------------------------------

function negotiateProtocolVersion(requested) {
  if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.indexOf(requested) !== -1) {
    return requested;
  }
  return SUPPORTED_PROTOCOL_VERSIONS[0];
}

function handleInitialize(params) {
  const requested = params && params.protocolVersion;
  return {
    protocolVersion: negotiateProtocolVersion(requested),
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
  };
}

function handleToolsList() {
  return {
    tools: TOOLS.map(function (t) {
      return { name: t.name, description: t.description, inputSchema: t.inputSchema };
    }),
  };
}

/** THE DEFINING DELEGATION (see header comment): builds {pathname,
 * searchParams} purely from the tool's own argsToRequest, then hands off
 * to apiCore.handleApiRequest verbatim. Returns null on success (caller
 * wraps it in a JSON-RPC result) or a jsonRpcError-shaped object directly
 * on a -32602-class problem (unknown tool / bad args), so the caller never
 * has to re-derive that distinction.
 *
 * `pricing` (verifier round 2, backlog 234, FINDING 3): the SAME optional
 * `{ enabled, mode }` shape `/api` itself receives — passed straight
 * through to `apiCore.handleApiRequest`'s own `pricing` field, never read
 * from `env` here (this file stays pure; see header comment's "delegates
 * verbatim" discipline and the module-level note below). Without this, a
 * `tools/call` for `explain_rails` (which delegates to `GET /api`) could
 * only ever see the DARK default — falsifying its own pricing block even
 * while the real Worker's payment gate was live, the exact contradiction
 * this finding named. `handleApiRequest` already treats an absent/
 * undefined `pricing` as fully disabled ("dark") — this function does the
 * same by simply passing whatever it was given, never assuming a state
 * nobody told it about. */
function handleToolsCall(id, params, pools, pricing) {
  const name = params && params.name;
  if (typeof name !== 'string' || name.length === 0) {
    return { error: jsonRpcError(id, -32602, 'tools/call requires a string "name" parameter.') };
  }
  const tool = findTool(name);
  if (!tool) {
    return { error: jsonRpcError(id, -32602, 'Unknown tool: "' + name + '". Call tools/list for the available tools.') };
  }
  const args = params && params.arguments;
  const validationProblem = validateArgs(tool, args);
  if (validationProblem) {
    return { error: jsonRpcError(id, -32602, validationProblem) };
  }

  const request = tool.argsToRequest(args || {});
  const delegated = apiCore.handleApiRequest({
    pathname: request.pathname,
    searchParams: request.searchParams,
    pools: pools,
    pricing: pricing,
  });

  return {
    result: {
      content: [{ type: 'text', text: JSON.stringify(delegated.body, null, 2) }],
      isError: delegated.status >= 400,
    },
  };
}

// ---------------------------------------------------------------------------
// 6. handleMcpMessage — the one exported entry point. Pure function of its
//    inputs; no fetch, no Date, no mutation of `pools` or `message`.
//    `pricing` (verifier round 2, backlog 234, FINDING 3) is a THIRD,
//    OPTIONAL input, carrying the same `{ enabled, mode }` shape `/api`
//    receives — this file NEVER reads `env` itself (that would break the
//    "delegates verbatim, no rail copy" purity this whole module is built
//    on); the Worker (edge/agent-log.mjs) computes it once via
//    `x402Core.readConfig(env)` and passes it in, exactly as it already
//    does for `/api` itself. Only `tools/call` (via handleToolsCall) ever
//    reads it — every other method ignores it entirely, same discipline
//    `apiCore.handleApiRequest`'s own `pricing` field already documents.
// ---------------------------------------------------------------------------

function handleMcpMessage(input) {
  const message = input && input.message;
  const pools = (input && Array.isArray(input.pools)) ? input.pools : [];
  const pricing = input && input.pricing;

  const problem = envelopeProblem(message);
  if (problem) {
    const isObj = message !== null && typeof message === 'object' && !Array.isArray(message);
    const hasId = isObj && ('id' in message);
    if (isObj && !hasId) {
      // Structurally close enough to a notification (an object with no
      // "id") that JSON-RPC forbids a response even though it's malformed
      // in some other way (e.g. wrong "jsonrpc" value).
      return { status: 202, body: null };
    }
    const id = (isObj && message.id !== undefined) ? message.id : null;
    return { status: 200, body: jsonRpcError(id, -32600, 'Invalid Request: ' + problem) };
  }

  const isNotification = !('id' in message);
  const method = message.method;
  const params = message.params;
  const id = message.id;

  // notifications/initialized is called out by name in the spec, but the
  // rule is general (see header comment): NO notification ever gets a
  // response body, regardless of method name or validity.
  if (method === 'notifications/initialized' || isNotification) {
    return { status: 202, body: null };
  }

  try {
    if (method === 'initialize') {
      return { status: 200, body: jsonRpcResult(id, handleInitialize(params)) };
    }
    if (method === 'tools/list') {
      return { status: 200, body: jsonRpcResult(id, handleToolsList()) };
    }
    if (method === 'tools/call') {
      const outcome = handleToolsCall(id, params, pools, pricing);
      return { status: 200, body: outcome.error || jsonRpcResult(id, outcome.result) };
    }
    if (method === 'ping') {
      return { status: 200, body: jsonRpcResult(id, {}) };
    }
    return { status: 200, body: jsonRpcError(id, -32601, 'Method not found: "' + method + '".') };
  } catch (err) {
    return { status: 200, body: jsonRpcError(id, -32603, 'Internal error: ' + (err && err.message ? err.message : String(err))) };
  }
}

module.exports = {
  handleMcpMessage,
  TOOLS,
  SUPPORTED_PROTOCOL_VERSIONS,
  SERVER_INFO,
  SERVER_CAPABILITIES,
  negotiateProtocolVersion,
  validateArgs,
  findTool,
};
