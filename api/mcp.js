/**
 * DeFi Garden Model Context Protocol (MCP) Serverless Endpoint
 * Vercel Serverless Function — Zero dependencies, zero invented data.
 * Queries data/pools-snapshot.json directly.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PERMISSIONED_PROJECT_LIST } = require('../permissioned-projects.js');

let _cachedPools = null;
function getPools() {
  if (_cachedPools) return _cachedPools;
  try {
    const snapshotPath = path.join(__dirname, '../data/pools-snapshot.json');
    if (fs.existsSync(snapshotPath)) {
      const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      _cachedPools = raw.pools || raw.data || [];
      return _cachedPools;
    }
  } catch (_e) {}
  return [];
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

const MCP_TOOLS = [
  {
    name: "find_pools",
    description: "Search DeFi Garden's railed pool list by token symbol, chain, project, and minimum TVL floor. Excludes anomalous rates (>1000% APY) and pools below $100K TVL. All data derives from live pool snapshots.",
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
    description: "Look up a single DeFi liquidity venue by its DefiLlama pool UUID, returning live APY, base/reward breakdown, TVL, and anomaly status.",
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
    description: "Retrieve quantitative yield quality score (DeFi Score 0-100), 4-pillar breakdown (stability, fee sustainability, depositor stickiness, exit liquidity), 14-day forward yield forecast bands (p10/p50/p90), and retail access restrictions. Note: forecast is experimental.",
    inputSchema: {
      type: "object",
      properties: {
        pool_id: { type: "string", description: "DefiLlama pool UUID" },
        asset: { type: "string", description: "Optional asset symbol to query if pool_id is unknown (e.g. 'USDC', 'ETH')" },
        chain: { type: "string", description: "Optional blockchain filter (e.g. 'Base', 'Ethereum')" }
      }
    }
  },
  {
    name: "forever_number",
    description: "Computes the lump-sum capital whose yield alone covers a recurring monthly bill forever, derived from a TVL-weighted blended rate of railed pools.",
    inputSchema: {
      type: "object",
      properties: {
        monthly: { type: "number", description: "Positive USD/month the capital must cover" },
        apy: { type: "number", description: "Optional annual rate percent. When omitted, uses live TVL-weighted blended rate." }
      },
      required: ["monthly"]
    }
  },
  {
    name: "explain_rails",
    description: "Returns DeFi Garden active platform filtering rules, sanity ceilings, and pool qualification criteria for autonomous agent safety.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

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
      const totalApy = (Number(p.apyBase) || 0) + (Number(p.apyReward) || 0);
      if (totalApy > TRUST_RAILS.apy_sanity_limit_percent) return false;

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
        totalApy: (Number(p.apyBase) || 0) + (Number(p.apyReward) || 0),
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
    const pid = String(args.pool_id || '').trim().toLowerCase();
    const pool = pools.find(p => p && p.pool && p.pool.toLowerCase() === pid);
    if (!pool) {
      return { error: "not_found", message: `No pool with id "${args.pool_id}".` };
    }
    const totalApy = (Number(pool.apyBase) || 0) + (Number(pool.apyReward) || 0);
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
      belowMinTvlReason: belowMinTvl ? `TVL ($${(Number(pool.tvlUsd) || 0).toLocaleString()}) is below $100,000 floor.` : null
    };
  }

  if (name === "get_pool_score") {
    let pool = null;
    if (args.pool_id) {
      const pid = String(args.pool_id).trim().toLowerCase();
      pool = pools.find(p => p && p.pool && p.pool.toLowerCase() === pid);
    }
    if (!pool && (args.asset || args.chain)) {
      const asset = args.asset ? String(args.asset).toUpperCase() : null;
      const chain = args.chain ? String(args.chain).toLowerCase() : null;

      const candidates = pools.filter(p => {
        const tvl = Number(p.tvlUsd) || 0;
        if (tvl < TRUST_RAILS.min_tvl_usd) return false;
        const totalApy = (Number(p.apyBase) || 0) + (Number(p.apyReward) || 0);
        if (totalApy > TRUST_RAILS.apy_sanity_limit_percent) return false;

        if (asset && !(p.symbol || '').toUpperCase().includes(asset)) return false;
        if (chain && (p.chain || '').toLowerCase() !== chain) return false;
        return true;
      }).sort((a, b) => (Number(b.tvlUsd) || 0) - (Number(a.tvlUsd) || 0));

      pool = candidates[0] || null;
    }

    if (!pool) {
      return { error: "not_found", message: "Pool not found matching specified criteria clearing trust rails." };
    }

    const isRestricted = PERMISSIONED_PROJECT_LIST.has(String(pool.project || '').toLowerCase());
    const totalApy = (Number(pool.apyBase) || 0) + (Number(pool.apyReward) || 0);
    const anomalous = totalApy > TRUST_RAILS.apy_sanity_limit_percent;
    const belowMinTvl = (Number(pool.tvlUsd) || 0) < TRUST_RAILS.min_tvl_usd;

    return {
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
        status: "Experimental forward forecast: In our first 10 test runs, assuming today's rate holds was more accurate than this forecast."
      } : null
    };
  }

  if (name === "forever_number") {
    const monthly = Number(args.monthly);
    if (!Number.isFinite(monthly) || monthly <= 0) {
      throw new Error('Argument "monthly" must be a positive number.');
    }

    let rate = Number(args.apy);
    let apySource = "param";

    if (!Number.isFinite(rate) || rate <= 0) {
      // Derive TVL-weighted blended rate across railed pools
      const railed = pools.filter(p => {
        const tvl = Number(p.tvlUsd) || 0;
        const total = (Number(p.apyBase) || 0) + (Number(p.apyReward) || 0);
        return tvl >= TRUST_RAILS.min_tvl_usd && total <= TRUST_RAILS.apy_sanity_limit_percent;
      });

      let tvlSum = 0;
      let weighted = 0;
      for (const p of railed) {
        const tvl = Number(p.tvlUsd) || 0;
        const total = (Number(p.apyBase) || 0) + (Number(p.apyReward) || 0);
        weighted += total * tvl;
        tvlSum += tvl;
      }
      rate = tvlSum > 0 ? (weighted / tvlSum) : 0;
      apySource = "blended";
    }

    const foreverNumber = rate > 0 ? (monthly * 12) / (rate / 100) : null;

    return {
      monthly,
      apyPct: Number(rate.toFixed(4)),
      apySource,
      financeable: foreverNumber !== null,
      foreverNumber: foreverNumber !== null ? Math.round(foreverNumber) : null
    };
  }

  if (name === "explain_rails") {
    return {
      rails: TRUST_RAILS,
      timestamp: new Date().toISOString()
    };
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, x-mcp-version',
};

module.exports = function handleMcpRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, MCP_CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const acceptHeader = req.headers['accept'] || '';
    if (acceptHeader.includes('text/event-stream')) {
      res.writeHead(200, Object.assign({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }, MCP_CORS_HEADERS));
      res.write(`event: endpoint\ndata: /api/mcp\n\n`);
      return;
    }

    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS));
    res.end(JSON.stringify({
      name: "DeFi Garden Model Context Protocol (MCP) Server",
      version: "0.2.0",
      protocol_version: "2025-06-18",
      transports: ["streamable-http", "sse"],
      endpoint: "https://www.defi.garden/api/mcp",
      canonical_endpoint: "https://www.defi.garden/mcp",
      documentation: "https://www.defi.garden/mcp",
      llms_txt: "https://www.defi.garden/llms.txt",
      tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description }))
    }, null, 2));
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
        res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS));
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: invalid JSON." } }));
        return;
      }

      const id = rpcReq.id !== undefined ? rpcReq.id : null;
      const method = rpcReq.method;

      if (method === 'initialize') {
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS));
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "defi-garden-mcp", version: "0.2.0" }
          }
        }));
        return;
      }

      if (method === 'tools/list') {
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS));
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: id,
          result: { tools: MCP_TOOLS }
        }));
        return;
      }

      if (method === 'tools/call') {
        const params = rpcReq.params || {};
        const pools = getPools();
        try {
          const result = handleToolCall(params.name, params.arguments, pools);
          res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS));
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
              isError: !!(result && result.error)
            }
          }));
        } catch (err) {
          res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS));
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            result: {
              content: [{ type: "text", text: `Error: ${err.message}` }],
              isError: true
            }
          }));
        }
        return;
      }

      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS));
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: id,
        error: { code: -32601, message: `Method '${method}' not found` }
      }));
    });
    return;
  }

  res.writeHead(405, Object.assign({ 'Content-Type': 'text/plain' }, MCP_CORS_HEADERS));
  res.end('Method Not Allowed');
};
