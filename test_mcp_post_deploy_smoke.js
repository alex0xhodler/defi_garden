#!/usr/bin/env node
/**
 * test_mcp_post_deploy_smoke.js
 *
 * Post-deploy smoke test for the MCP endpoint. Runs real HTTP requests against a
 * deployed base URL (production or a Vercel preview). It needs the network, so it
 * is NOT part of `npm test`; CI runs it from .github/workflows/post-deploy-smoke.yml.
 *
 * Usage:
 *   node test_mcp_post_deploy_smoke.js [baseUrl]
 *   SMOKE_BASE_URL=https://example.vercel.app node test_mcp_post_deploy_smoke.js
 *   (default: https://www.defi.garden)
 *
 * Exit code 1 if any check fails. A 401 on the very first request means Vercel
 * deployment protection is on; that is a SKIP (exit 0) only when
 * SMOKE_ALLOW_PROTECTED=1 (set by CI for non-Production deployments), else a failure.
 *
 * Node 18+ (global fetch), no dependencies.
 */
'use strict';

const BASE_URL = String(process.argv[2] || process.env.SMOKE_BASE_URL || 'https://www.defi.garden').replace(/\/+$/, '');
const EXPECTED_TOOLS = ['find_pools', 'get_pool', 'get_pool_score', 'forever_number', 'explain_rails'];
const MCP_HEADERS = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };

class Failure extends Error {}
function expect(cond, message) { if (!cond) throw new Failure(message); }

async function http(method, path, opts) {
  opts = opts || {};
  const res = await fetch(BASE_URL + path, {
    method,
    headers: opts.headers,
    body: opts.body,
    redirect: opts.redirect || 'follow'
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_e) { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

let rpcId = 0;
function rpc(path, method, params) {
  return http('POST', path, {
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params: params || {} })
  });
}

/** tools/call; returns { res, payload } where payload is the parsed text content (or null). */
async function callTool(name, args) {
  const res = await rpc('/mcp', 'tools/call', { name, arguments: args });
  expect(res.status === 200, `tools/call ${name}: expected HTTP 200, got ${res.status} ${res.text.slice(0, 200)}`);
  expect(res.json && res.json.jsonrpc === '2.0', `tools/call ${name}: response is not JSON-RPC 2.0: ${res.text.slice(0, 200)}`);
  let payload = null;
  const content = res.json.result && res.json.result.content;
  if (Array.isArray(content) && content[0] && typeof content[0].text === 'string') {
    try { payload = JSON.parse(content[0].text); } catch (_e) { /* leave null */ }
  }
  return { res, payload };
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, message: err.message });
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

async function main() {
  console.log(`MCP post-deploy smoke test against ${BASE_URL}\n`);

  // Deployment-protection probe. Vercel Authentication answers an anonymous
  // POST with 401 but REDIRECTS an anonymous HTML GET to a login page, so probe
  // with a POST and never follow redirects here.
  let probe;
  try {
    probe = await http('POST', '/mcp', {
      headers: MCP_HEADERS,
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }),
      redirect: 'manual'
    });
  } catch (err) {
    console.log(`  FAIL  first request to ${BASE_URL}/mcp\n        ${err.message}`);
    process.exit(1);
  }
  const protectedDeployment = probe.status === 401 ||
    ((probe.status >= 300 && probe.status < 400) && /vercel\.com/.test(probe.headers.get('location') || ''));
  if (protectedDeployment) {
    if (process.env.SMOKE_ALLOW_PROTECTED === '1') {
      console.log('SKIP: deployment protected');
      process.exit(0);
    }
    console.log('  FAIL  deployment returned 401 (protected) and SMOKE_ALLOW_PROTECTED is not 1');
    process.exit(1);
  }

  let first;
  try {
    first = await http('GET', '/mcp', { headers: { 'Accept': 'text/html' } });
  } catch (err) {
    console.log(`  FAIL  GET ${BASE_URL}/mcp\n        ${err.message}`);
    process.exit(1);
  }

  const state = { poolId: null };

  await check('GET /mcp (Accept: text/html) -> 200 text/html page mentioning "Model Context Protocol"', async () => {
    expect(first.status === 200, `expected 200, got ${first.status}`);
    const ct = first.headers.get('content-type') || '';
    expect(ct.includes('text/html'), `expected text/html content-type, got "${ct}"`);
    expect(first.text.includes('Model Context Protocol'), 'body does not contain "Model Context Protocol"');
  });

  await check('POST /mcp initialize -> 200 JSON with result.protocolVersion and serverInfo', async () => {
    const res = await rpc('/mcp', 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
    expect(res.status === 200, `expected 200, got ${res.status} ${res.text.slice(0, 200)}`);
    expect(res.json && res.json.result, `no JSON-RPC result: ${res.text.slice(0, 200)}`);
    expect(res.json.result.protocolVersion, 'result.protocolVersion missing');
    expect(res.json.result.serverInfo && res.json.result.serverInfo.name, 'result.serverInfo missing');
  });

  await check('POST /mcp notifications/initialized (no id) -> 202 with empty body', async () => {
    const res = await http('POST', '/mcp', {
      headers: MCP_HEADERS,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
    });
    expect(res.status === 202, `expected 202, got ${res.status} ${res.text.slice(0, 200)}`);
    expect(res.text === '', `expected empty body, got "${res.text.slice(0, 100)}"`);
  });

  await check('POST /mcp responses are Cache-Control: no-store', async () => {
    const res = await rpc('/mcp', 'tools/list');
    const cc = res.headers.get('cache-control') || '';
    expect(/no-store/i.test(cc), `expected no-store, got "${cc}"`);
  });

  await check('POST /mcp tools/list -> exactly the 5 tool names', async () => {
    const res = await rpc('/mcp', 'tools/list');
    expect(res.status === 200, `expected 200, got ${res.status} ${res.text.slice(0, 200)}`);
    const names = ((res.json && res.json.result && res.json.result.tools) || []).map(t => t.name);
    expect(names.length === EXPECTED_TOOLS.length && EXPECTED_TOOLS.every(n => names.includes(n)),
      `expected ${JSON.stringify(EXPECTED_TOOLS)}, got ${JSON.stringify(names)}`);
  });

  await check('tools/call find_pools {token:USDC, limit:3} -> no isError, as_of, every pool within rails', async () => {
    const { res, payload } = await callTool('find_pools', { token: 'USDC', limit: 3 });
    expect(res.json.result.isError !== true, `isError true: ${res.text.slice(0, 300)}`);
    expect(payload && payload.as_of, 'as_of missing');
    expect(Array.isArray(payload.pools) && payload.pools.length > 0, 'no pools returned');
    for (const p of payload.pools) {
      expect(Number(p.tvlUsd) >= 100000, `pool ${p.pool} tvlUsd ${p.tvlUsd} is below the $100K floor`);
      expect(Number(p.totalApy) <= 1000, `pool ${p.pool} totalApy ${p.totalApy} exceeds the 1000% cap`);
    }
    state.poolId = payload.pools[0].pool;
  });

  await check('tools/call get_pool {pool_id from find_pools} -> no isError, as_of', async () => {
    expect(state.poolId, 'no pool id (find_pools check failed)');
    const { res, payload } = await callTool('get_pool', { pool_id: state.poolId });
    expect(res.json.result.isError !== true, `isError true: ${res.text.slice(0, 300)}`);
    expect(payload && payload.as_of, 'as_of missing');
    expect(payload.pool === state.poolId, `expected pool ${state.poolId}, got ${payload.pool}`);
  });

  await check('tools/call get_pool_score {pool_id from find_pools} -> no isError, as_of', async () => {
    expect(state.poolId, 'no pool id (find_pools check failed)');
    const { res, payload } = await callTool('get_pool_score', { pool_id: state.poolId });
    expect(res.json.result.isError !== true, `isError true: ${res.text.slice(0, 300)}`);
    expect(payload && payload.as_of, 'as_of missing');
  });

  await check('tools/call forever_number {monthly:20} -> no isError, as_of, rateMethod', async () => {
    const { res, payload } = await callTool('forever_number', { monthly: 20 });
    expect(res.json.result.isError !== true, `isError true: ${res.text.slice(0, 300)}`);
    expect(payload && payload.as_of, 'as_of missing');
    expect(payload.rateMethod, 'rateMethod missing');
  });

  await check('tools/call explain_rails {} -> no isError, as_of', async () => {
    const { res, payload } = await callTool('explain_rails', {});
    expect(res.json.result.isError !== true, `isError true: ${res.text.slice(0, 300)}`);
    expect(payload && payload.as_of, 'as_of missing');
  });

  await check('tools/call forever_number {monthly:20, apy:5000} -> isError true', async () => {
    const { res } = await callTool('forever_number', { monthly: 20, apy: 5000 });
    expect(res.json.result.isError === true, `expected isError true, got ${res.text.slice(0, 300)}`);
  });

  await check('tools/call get_pool {} -> JSON-RPC error -32602', async () => {
    const res = await rpc('/mcp', 'tools/call', { name: 'get_pool', arguments: {} });
    expect(res.json && res.json.error && res.json.error.code === -32602,
      `expected JSON-RPC error -32602, got ${res.text.slice(0, 300)}`);
  });

  await check('POST /api/mcp tools/list -> 200 with the same 5 names', async () => {
    const res = await rpc('/api/mcp', 'tools/list');
    expect(res.status === 200, `expected 200, got ${res.status} ${res.text.slice(0, 200)}`);
    const names = ((res.json && res.json.result && res.json.result.tools) || []).map(t => t.name);
    expect(names.length === EXPECTED_TOOLS.length && EXPECTED_TOOLS.every(n => names.includes(n)),
      `expected ${JSON.stringify(EXPECTED_TOOLS)}, got ${JSON.stringify(names)}`);
  });

  await check('GET /agents (redirect: manual) -> 301/308 with Location ending in /mcp', async () => {
    const res = await http('GET', '/agents', { redirect: 'manual' });
    expect(res.status === 301 || res.status === 308, `expected 301 or 308, got ${res.status}`);
    const loc = res.headers.get('location') || '';
    expect(loc.endsWith('/mcp'), `expected Location ending in /mcp, got "${loc}"`);
  });

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${BASE_URL}`);
  if (failed.length) {
    console.log('Failed checks:');
    failed.forEach(f => console.log(`  - ${f.name}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
