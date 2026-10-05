/**
 * DeFi Garden Model Context Protocol (MCP) Serverless Endpoint
 * Supports Streamable HTTP, SSE handshake, and JSON-RPC 2.0.
 *
 * CANONICAL IMPLEMENTATION:
 * Delegates directly to edge/mcp-core.js and the shared data/pools-snapshot.json
 * layer. Zero invented yield rates, zero hard-coded baselines, zero phantom mechanisms.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mcpCore = require('../edge/mcp-core.js');

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

const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, x-mcp-version',
};

module.exports = function handleMcpRequest(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, MCP_CORS_HEADERS);
    res.end();
    return;
  }

  // Handle SSE handshake on GET
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

    // Default GET info payload
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS));
    res.end(JSON.stringify({
      name: "DeFi Garden Model Context Protocol (MCP) Server",
      version: "0.1.0",
      protocol_version: "2025-06-18",
      transports: ["streamable-http", "sse"],
      endpoint: "https://www.defi.garden/api/mcp",
      canonical_endpoint: "https://www.defi.garden/mcp",
      documentation: "https://www.defi.garden/mcp",
      llms_txt: "https://www.defi.garden/llms.txt",
      tools: mcpCore.TOOLS.map(t => ({ name: t.name, description: t.description }))
    }, null, 2));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      let rpcReq;
      try {
        rpcReq = JSON.parse(body || '{}');
      } catch (_err) {
        res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, MCP_CORS_HEADERS));
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: the request body is not valid JSON." } }));
        return;
      }

      const pools = getPools();
      const result = mcpCore.handleMcpMessage({ message: rpcReq, pools: pools });

      if (result.body === null) {
        res.writeHead(result.status, MCP_CORS_HEADERS);
        res.end();
        return;
      }

      res.writeHead(result.status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, MCP_CORS_HEADERS));
      res.end(JSON.stringify(result.body));
    });
    return;
  }

  res.writeHead(405, Object.assign({ 'Content-Type': 'text/plain' }, MCP_CORS_HEADERS));
  res.end('Method Not Allowed');
};
