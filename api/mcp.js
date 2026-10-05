/**
 * DeFi Garden Model Context Protocol (MCP) Serverless Endpoint
 * Vercel Serverless Function — Zero dependencies, zero invented data.
 * Queries data/pools-snapshot.json directly.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PERMISSIONED_PROJECT_LIST } = require('../permissioned-projects.js');

// Every data file is read through a literal path.join(__dirname, '../data/<file>')
// so Vercel's file tracer bundles it with the function. Do not build these paths
// dynamically.
function readJsonSafe(read) {
  try { return JSON.parse(read()); } catch (_e) { return null; }
}

let _snapshot = null;
function getSnapshot() {
  if (_snapshot) return _snapshot;
  const raw = readJsonSafe(() => fs.readFileSync(path.join(__dirname, '../data/pools-snapshot.json'), 'utf8'));
  const meta = readJsonSafe(() => fs.readFileSync(path.join(__dirname, '../data/pools-snapshot-meta.json'), 'utf8'));
  const pools = raw ? (raw.pools || raw.data || []) : [];
  const asOf = (raw && raw.generatedAt) || (meta && meta.generatedAt) || null;
  // Only cache a successful load so a transient read failure can recover.
  if (raw) _snapshot = { pools, asOf };
  return { pools, asOf };
}

let _forecastEval;
function getForecastEvaluations() {
  if (_forecastEval !== undefined) return _forecastEval;
  _forecastEval = readJsonSafe(() => fs.readFileSync(path.join(__dirname, '../data/forecast-evaluations.json'), 'utf8'));
  return _forecastEval;
}

/** Forecast status sentence, built from data/forecast-evaluations.json (never typed in). */
function forecastStatus() {
  const generic = "Experimental forward forecast: not shown to be more accurate than assuming today's rate holds.";
  const ev = getForecastEvaluations();
  const summary = ev && ev.summary;
  if (!summary || !Number.isFinite(Number(summary.totalRuns)) || Number(summary.totalRuns) <= 0) return generic;
  const totalRuns = Number(summary.totalRuns);
  let sentence = `Experimental forward forecast: across ${totalRuns} resolved test runs`;
  if (Number.isFinite(Number(summary.medianSkillScore))) {
    sentence += `, median skill score vs. assuming today's rate holds was ${Number(summary.medianSkillScore)} (at or below 0 means no better)`;
  }
  const runs = Array.isArray(ev.resolvedRuns) ? ev.resolvedRuns : null;
  if (runs && runs.length) {
    const noBetter = runs.filter(r => r && r.overall && Number(r.overall.skillScore) <= 0).length;
    sentence += `; in ${noBetter} of ${runs.length} runs assuming today's rate holds was at least as accurate`;
  }
  return sentence + '.';
}

const TRUST_RAILS = {
  apy_sanity_limit_percent: 1000.0,
  min_tvl_usd: 100000.0,
  rules: {
    sanity_cap: "Excludes any pool whose total APY exceeds 1000%",
    tvl_floor: "Excludes any pool under $100,000 USD TVL",
    anomaly_flagging: "Direct lookups flag anomalous rates and sub-floor pools explicitly"
  }
};

const SERVER_VERSION = "0.3.0";
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"];
const ENDPOINT = "https://www.defi.garden/mcp";

const MCP_TOOLS = [
  {
    name: "find_pools",
    description: "Search DeFi Garden's railed pool list by token symbol, chain, project, and minimum TVL floor. Excludes anomalous rates (>1000% APY) and pools below $100K TVL. Data is a daily snapshot of DefiLlama's pool feed.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Case-insensitive substring match against pool token symbol, e.g. 'USDC'" },
        chain: { type: "string", description: "Case-insensitive match against pool blockchain, e.g. 'Base', 'Ethereum'" },
        project: { type: "string", description: "Case-insensitive match against protocol name, e.g. 'morpho-blue', 'aave-v3'" },
        min_tvl: { type: "number", description: "Minimum TVL floor in USD (clamps up to $100,000 minimum)" },
        limit: { type: "number", description: "Maximum pools to return (default: 20, max: 100)" }
      }
    }
  },
  {
    name: "get_pool",
    description: "Look up a single pool by its DefiLlama pool UUID, returning APY (base/reward breakdown), TVL, and anomaly / below-floor flags. Data is a daily snapshot of DefiLlama's pool feed.",
    inputSchema: {
      type: "object",
      properties: {
        pool_id: { type: "string", description: "DefiLlama pool UUID (e.g. 'ba68527f-8ec2-4c55-827a-8f4673ae047c')" }
      },
      required: ["pool_id"]
    }
  },
  {
    name: "get_pool_score",
    description: "Retrieve the DeFi Score (0-100) with its 4-pillar breakdown (stability, fee sustainability, depositor stickiness, exit liquidity), the experimental 14-day forward yield forecast bands (p10/p50/p90), and retail access restrictions. Look up by pool_id, or by exact asset symbol (highest-TVL railed match, with candidates listed). The forecast is experimental.",
    inputSchema: {
      type: "object",
      properties: {
        pool_id: { type: "string", description: "DefiLlama pool UUID" },
        asset: { type: "string", description: "Optional exact, case-insensitive pool symbol to query if pool_id is unknown (e.g. 'USDC', 'STETH'). Not a substring match." },
        chain: { type: "string", description: "Optional blockchain filter used with asset (e.g. 'Base', 'Ethereum')" }
      }
    }
  },
  {
    name: "forever_number",
    description: "Computes the lump-sum capital whose yield alone covers a recurring monthly bill forever, using a TVL-weighted blended rate of railed pools (or a caller-supplied APY between 0 and 1000 percent).",
    inputSchema: {
      type: "object",
      properties: {
        monthly: { type: "number", description: "Positive USD/month the capital must cover" },
        apy: { type: "number", description: "Optional annual rate percent, greater than 0 and at most 1000. When omitted, uses the TVL-weighted blended rate of railed pools." }
      },
      required: ["monthly"]
    }
  },
  {
    name: "explain_rails",
    description: "Returns DeFi Garden's active filtering rules (1000% APY sanity cap, $100K TVL floor, anomaly flagging) and the data source, for autonomous agent safety.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

/** JSON-RPC protocol error raised from a tool (e.g. -32602 Invalid params). */
class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.rpcCode = code;
  }
}

function totalApyOf(p) {
  return (Number(p.apyBase) || 0) + (Number(p.apyReward) || 0);
}

function isRailed(p) {
  return (Number(p.tvlUsd) || 0) >= TRUST_RAILS.min_tvl_usd
    && totalApyOf(p) <= TRUST_RAILS.apy_sanity_limit_percent;
}

function hasText(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function notInSnapshotMessage(id) {
  return `Pool id "${id}" is not in DeFi Garden's railed snapshot (pools below the $100K TVL floor or otherwise untracked are excluded).`;
}

function handleToolCall(name, args, pools) {
  args = args || {};

  if (name === "find_pools") {
    const token = args.token ? String(args.token).toUpperCase() : null;
    const chain = args.chain ? String(args.chain).toLowerCase() : null;
    const project = args.project ? String(args.project).toLowerCase() : null;
    const minTvl = Math.max(Number(args.min_tvl) || 0, TRUST_RAILS.min_tvl_usd);
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

    let filtered = pools.filter(p => {
      const tvl = Number(p.tvlUsd) || 0;
      if (tvl < minTvl) return false;
      if (totalApyOf(p) > TRUST_RAILS.apy_sanity_limit_percent) return false;

      if (chain && String(p.chain || '').toLowerCase() !== chain) return false;
      if (project && String(p.project || '').toLowerCase() !== project) return false;
      if (token && !String(p.symbol || '').toUpperCase().includes(token)) return false;

      return true;
    });

    filtered.sort((a, b) => (Number(b.tvlUsd) || 0) - (Number(a.tvlUsd) || 0));

    return {
      pools: filtered.slice(0, limit).map(p => ({
        pool: p.pool,
        chain: p.chain,
        project: p.project,
        symbol: p.symbol,
        tvlUsd: p.tvlUsd,
        apyBase: p.apyBase,
        apyReward: p.apyReward,
        totalApy: totalApyOf(p),
        apyMean30d: p.apyMean30d,
        exposure: p.exposure,
        ilRisk: p.ilRisk
      })),
      count: filtered.length,
      returned: Math.min(filtered.length, limit),
      railsApplied: { minTvl, apySanityLimit: TRUST_RAILS.apy_sanity_limit_percent }
    };
  }

  if (name === "get_pool") {
    if (!hasText(args.pool_id)) {
      throw new RpcError(-32602, 'Invalid params: "pool_id" (string) is required.');
    }
    const pid = args.pool_id.trim().toLowerCase();
    const pool = pools.find(p => p && p.pool && p.pool.toLowerCase() === pid);
    if (!pool) {
      return { error: "not_found", message: notInSnapshotMessage(args.pool_id) };
    }
    const totalApy = totalApyOf(pool);
    const anomalous = totalApy > TRUST_RAILS.apy_sanity_limit_percent;
    const belowMinTvl = (Number(pool.tvlUsd) || 0) < TRUST_RAILS.min_tvl_usd;

    return {
      pool: pool.pool,
      chain: pool.chain,
      project: pool.project,
      symbol: pool.symbol,
      tvlUsd: pool.tvlUsd,
      apyBase: pool.apyBase,
      apyReward: pool.apyReward,
      totalApy,
      apyMean30d: pool.apyMean30d,
      exposure: pool.exposure,
      ilRisk: pool.ilRisk,
      anomalous,
      reason: anomalous ? `Total APY (${totalApy.toFixed(2)}%) exceeds ${TRUST_RAILS.apy_sanity_limit_percent}% sanity limit.` : null,
      belowMinTvl,
      belowMinTvlReason: belowMinTvl ? `TVL ($${(Number(pool.tvlUsd) || 0).toLocaleString('en-US')}) is below $100,000 floor.` : null
    };
  }

  if (name === "get_pool_score") {
    const hasPoolId = hasText(args.pool_id);
    const hasAsset = hasText(args.asset);
    if (!hasPoolId && !hasAsset) {
      throw new RpcError(-32602, 'Invalid params: provide "pool_id" or "asset" (string).');
    }

    let pool = null;
    let candidates = null;
    if (hasPoolId) {
      const pid = args.pool_id.trim().toLowerCase();
      pool = pools.find(p => p && p.pool && p.pool.toLowerCase() === pid);
    }
    if (!pool && hasAsset) {
      const asset = args.asset.trim().toUpperCase();
      const chain = hasText(args.chain) ? args.chain.trim().toLowerCase() : null;

      // Exact (case-insensitive) symbol match among railed pools, highest TVL first.
      const matches = pools.filter(p => {
        if (!p || !isRailed(p)) return false;
        if (String(p.symbol || '').toUpperCase() !== asset) return false;
        if (chain && String(p.chain || '').toLowerCase() !== chain) return false;
        return true;
      }).sort((a, b) => (Number(b.tvlUsd) || 0) - (Number(a.tvlUsd) || 0));

      pool = matches[0] || null;
      candidates = matches.slice(0, 5).map(p => ({
        pool_id: p.pool,
        project: p.project,
        chain: p.chain,
        tvl_usd: p.tvlUsd
      }));
    }

    if (!pool) {
      if (hasPoolId && !hasAsset) {
        return { error: "not_found", message: notInSnapshotMessage(args.pool_id) };
      }
      return { error: "not_found", message: "No railed pool matched that exact asset symbol (and chain, if given). Pools above the 1000% APY cap or below the $100K TVL floor are excluded from asset searches." };
    }

    const isRestricted = PERMISSIONED_PROJECT_LIST.has(String(pool.project || '').toLowerCase());
    const totalApy = totalApyOf(pool);
    const anomalous = totalApy > TRUST_RAILS.apy_sanity_limit_percent;
    const belowMinTvl = (Number(pool.tvlUsd) || 0) < TRUST_RAILS.min_tvl_usd;

    const result = {
      pool_id: pool.pool,
      symbol: pool.symbol,
      project: pool.project,
      chain: pool.chain,
      tvl_usd: pool.tvlUsd,
      current_apy: {
        total: totalApy,
        base: pool.apyBase || 0,
        reward: pool.apyReward || 0
      },
      anomalous,
      reason: anomalous ? `Total APY (${totalApy.toFixed(2)}%) exceeds ${TRUST_RAILS.apy_sanity_limit_percent}% sanity limit.` : null,
      below_min_tvl: belowMinTvl,
      access_restriction: {
        is_restricted: isRestricted,
        status: isRestricted
          ? "PERMISSIONED / ACCREDITED ONLY (KYC)"
          : "Open access (not on our restricted list; protocol terms and regional limits may apply)"
      },
      defi_score: pool.defiScore ? {
        score: pool.defiScore.score,
        breakdown: pool.defiScore.breakdown,
        note: "Yield quality score based on stability, fee sustainability, depositor stickiness, and exit liquidity. Not a smart-contract or exploit safety audit."
      } : null,
      forecast: pool.forecast ? {
        horizon_days: pool.forecast.horizonDays,
        p10_apy: pool.forecast.p10,
        p50_apy: pool.forecast.p50,
        p90_apy: pool.forecast.p90,
        crash_risk: pool.forecast.crashRisk,
        forward_delta: pool.forecast.forwardDelta,
        status: forecastStatus()
      } : null
    };
    if (candidates) result.candidates = candidates;
    return result;
  }

  if (name === "forever_number") {
    const monthly = Number(args.monthly);
    if (args.monthly === null || args.monthly === undefined || args.monthly === '' || !Number.isFinite(monthly) || monthly <= 0) {
      return { error: "invalid_argument", message: 'Argument "monthly" must be a finite number greater than 0 (USD per month).' };
    }

    let rate;
    let apySource;
    let rateMethod;

    if (args.apy !== undefined && args.apy !== null) {
      rate = Number(args.apy);
      if (args.apy === '' || !Number.isFinite(rate) || rate <= 0 || rate > TRUST_RAILS.apy_sanity_limit_percent) {
        return { error: "invalid_argument", message: `Argument "apy" must be a finite percent greater than 0 and at most ${TRUST_RAILS.apy_sanity_limit_percent} (the APY sanity limit). Omit it to use the blended rate of railed pools.` };
      }
      apySource = "param";
      rateMethod = "caller_supplied";
    } else {
      // Derive TVL-weighted blended rate across railed pools
      let tvlSum = 0;
      let weighted = 0;
      for (const p of pools) {
        if (!p || !isRailed(p)) continue;
        const tvl = Number(p.tvlUsd) || 0;
        weighted += totalApyOf(p) * tvl;
        tvlSum += tvl;
      }
      rate = tvlSum > 0 ? (weighted / tvlSum) : 0;
      apySource = "blended";
      rateMethod = "tvl_weighted_mean_of_railed_pools";
    }

    const foreverNumber = rate > 0 ? (monthly * 12) / (rate / 100) : null;

    return {
      monthly,
      apyPct: Number(rate.toFixed(4)),
      apySource,
      rateMethod,
      financeable: foreverNumber !== null,
      foreverNumber: foreverNumber !== null ? Math.round(foreverNumber) : null
    };
  }

  if (name === "explain_rails") {
    return {
      rails: TRUST_RAILS,
      data_source: "DefiLlama pools feed (https://yields.llama.fi/pools), snapshotted daily; all chains DefiLlama tracks are covered.",
      timestamp: new Date().toISOString()
    };
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, MCP-Protocol-Version, x-mcp-version',
  'Cache-Control': 'no-store'
};

function send(res, status, body, extraHeaders) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS, extraHeaders || {}));
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function rpcError(res, status, id, code, message) {
  send(res, status, { jsonrpc: "2.0", id: id, error: { code, message } });
}

module.exports = function handleMcpRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, MCP_CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const acceptHeader = String((req.headers && req.headers['accept']) || '');
    if (acceptHeader.includes('text/event-stream')) {
      // We do not offer a server-initiated SSE stream (Streamable HTTP allows 405).
      res.writeHead(405, Object.assign({ 'Content-Type': 'text/plain', 'Allow': 'POST' }, MCP_CORS_HEADERS));
      res.end('Method Not Allowed: this server does not offer a server-initiated stream; use POST.');
      return;
    }

    send(res, 200, {
      name: "DeFi Garden Model Context Protocol (MCP) Server",
      version: SERVER_VERSION,
      protocol_version: SUPPORTED_PROTOCOL_VERSIONS[0],
      transports: ["streamable-http"],
      endpoint: ENDPOINT,
      canonical_endpoint: ENDPOINT,
      documentation: ENDPOINT,
      llms_txt: "https://www.defi.garden/llms.txt",
      as_of: getSnapshot().asOf,
      tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description }))
    });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });

    req.on('end', () => {
      let rpcReq;
      try {
        rpcReq = JSON.parse(body || '{}');
      } catch (_err) {
        rpcError(res, 400, null, -32700, "Parse error: invalid JSON.");
        return;
      }

      if (!rpcReq || typeof rpcReq !== 'object' || Array.isArray(rpcReq)) {
        rpcError(res, 400, null, -32600, "Invalid Request: expected a single JSON-RPC message object.");
        return;
      }

      // Streamable HTTP: a notification (no id) or a client response gets 202 with no body.
      const isNotification = typeof rpcReq.method === 'string' && rpcReq.id === undefined;
      const isClientResponse = rpcReq.method === undefined && rpcReq.id !== undefined
        && (rpcReq.result !== undefined || rpcReq.error !== undefined);
      if (isNotification || isClientResponse) {
        res.writeHead(202, MCP_CORS_HEADERS);
        res.end();
        return;
      }

      const id = rpcReq.id !== undefined ? rpcReq.id : null;
      const method = rpcReq.method;

      if (method === 'initialize') {
        const requested = rpcReq.params && rpcReq.params.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
        send(res, 200, {
          jsonrpc: "2.0",
          id: id,
          result: {
            protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: "defi-garden-mcp", version: SERVER_VERSION }
          }
        });
        return;
      }

      if (method === 'ping') {
        send(res, 200, { jsonrpc: "2.0", id: id, result: {} });
        return;
      }

      if (method === 'tools/list') {
        send(res, 200, { jsonrpc: "2.0", id: id, result: { tools: MCP_TOOLS } });
        return;
      }

      if (method === 'tools/call') {
        const params = rpcReq.params || {};
        const snapshot = getSnapshot();
        try {
          const result = handleToolCall(params.name, params.arguments, snapshot.pools);
          const payload = Object.assign({ as_of: snapshot.asOf }, result);
          send(res, 200, {
            jsonrpc: "2.0",
            id: id,
            result: {
              content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
              isError: !!(result && result.error)
            }
          });
        } catch (err) {
          if (err instanceof RpcError) {
            rpcError(res, 200, id, err.rpcCode, err.message);
            return;
          }
          const payload = { as_of: snapshot.asOf, error: "tool_error", message: err.message };
          send(res, 200, {
            jsonrpc: "2.0",
            id: id,
            result: {
              content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
              isError: true
            }
          });
        }
        return;
      }

      rpcError(res, 200, id, -32601, `Method '${method}' not found`);
    });
    return;
  }

  res.writeHead(405, Object.assign({ 'Content-Type': 'text/plain', 'Allow': 'GET, POST, OPTIONS' }, MCP_CORS_HEADERS));
  res.end('Method Not Allowed');
};

// Exposed so generators (generate-llms.js) read the real tool list instead of a copy.
module.exports.MCP_TOOLS = MCP_TOOLS;
