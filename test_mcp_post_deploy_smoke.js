#!/usr/bin/env node

/**
 * test_mcp_post_deploy_smoke.js
 *
 * Post-deploy smoke test for the live production MCP endpoint (Option B).
 * Executes real requests against the live URL:
 *   1. GET /api/mcp -> metadata & tool list (200)
 *   2. POST /mcp with Content-Type: application/json -> initialize handshake (200)
 *   3. POST /mcp -> notifications/initialized (expecting 200/202)
 *   4. POST /mcp -> tools/list (200)
 *   5. POST /mcp -> tools/call for every registered tool:
 *      - find_pools
 *      - get_pool
 *      - get_pool_score
 *      - forever_number
 *      - explain_rails
 *
 * Usage:
 *   node test_mcp_post_deploy_smoke.js [--target https://www.defi.garden]
 */

const assert = require('assert');

const TARGET_HOST = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : (process.env.MCP_TARGET_HOST || 'https://www.defi.garden');

async function testEndpoint(targetOverride) {
  const targetHost = targetOverride || TARGET_HOST;
  console.log(`🚀 Running Live MCP Smoke Test against: ${targetHost}`);

  // Test 1: GET /api/mcp
  console.log('\n1. Probing GET /api/mcp...');
  const getRes = await fetch(`${targetHost}/api/mcp`, {
    headers: { 'Accept': 'application/json' }
  });
  assert.strictEqual(getRes.status, 200, `GET /api/mcp must return 200, got ${getRes.status}`);
  const meta = await getRes.json();
  assert.ok(meta.tools && Array.isArray(meta.tools), 'Must return tools array');
  console.log(`  ✓ GET /api/mcp responded with ${meta.tools.length} registered tools`);

  // Test 2: POST /api/mcp initialize
  console.log('\n2. Probing POST /api/mcp initialize...');
  const initRes = await fetch(`${targetHost}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'smoke-init',
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' }
    })
  });
  assert.strictEqual(initRes.status, 200, `POST /api/mcp initialize must return 200, got ${initRes.status}`);
  const initData = await initRes.json();
  assert.strictEqual(initData.jsonrpc, '2.0');
  assert.ok(initData.result && initData.result.serverInfo, 'Must return serverInfo');
  console.log(`  ✓ POST /api/mcp initialize succeeded (server: ${initData.result.serverInfo.name})`);

  // Test 3: POST /api/mcp tools/list
  console.log('\n3. Probing POST /api/mcp tools/list...');
  const listRes = await fetch(`${targetHost}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'smoke-list',
      method: 'tools/list',
      params: {}
    })
  });
  assert.strictEqual(listRes.status, 200, `POST /api/mcp tools/list must return 200, got ${listRes.status}`);
  const listData = await listRes.json();
  assert.ok(listData.result && listData.result.tools, 'Must return tools array');
  const toolNames = listData.result.tools.map(t => t.name);
  console.log(`  ✓ Tools exposed: ${toolNames.join(', ')}`);

  const expectedTools = ['find_pools', 'get_pool', 'get_pool_score', 'forever_number', 'explain_rails'];
  for (const expected of expectedTools) {
    assert.ok(toolNames.includes(expected), `Tool "${expected}" must be in tools/list`);
  }

  // Test 4: Call each tool via POST /api/mcp
  console.log('\n4. Executing live tool queries via POST /api/mcp...');

  // 4a. find_pools
  const findRes = await fetch(`${targetHost}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'smoke-find',
      method: 'tools/call',
      params: { name: 'find_pools', arguments: { token: 'USDC', chain: 'Base', limit: 3 } }
    })
  });
  assert.strictEqual(findRes.status, 200);
  const findData = await findRes.json();
  assert.strictEqual(findData.result.isError, false);
  const findBody = JSON.parse(findData.result.content[0].text);
  assert.ok(findBody.pools.length > 0, 'find_pools must return pools');
  const samplePoolId = findBody.pools[0].pool;
  console.log(`  ✓ find_pools returned ${findBody.pools.length} USDC pools on Base`);

  // 4b. get_pool
  const getPoolRes = await fetch(`${targetHost}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'smoke-get-pool',
      method: 'tools/call',
      params: { name: 'get_pool', arguments: { pool_id: samplePoolId } }
    })
  });
  assert.strictEqual(getPoolRes.status, 200);
  const getPoolData = await getPoolRes.json();
  assert.strictEqual(getPoolData.result.isError, false);
  console.log(`  ✓ get_pool returned pool data for ${samplePoolId}`);

  // 4c. get_pool_score
  const scoreRes = await fetch(`${targetHost}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'smoke-score',
      method: 'tools/call',
      params: { name: 'get_pool_score', arguments: { pool_id: samplePoolId } }
    })
  });
  assert.strictEqual(scoreRes.status, 200);
  const scoreData = await scoreRes.json();
  assert.strictEqual(scoreData.result.isError, false);
  const scoreBody = JSON.parse(scoreData.result.content[0].text);
  assert.ok(scoreBody.defi_score && scoreBody.defi_score.score > 0, 'Must have score');
  console.log(`  ✓ get_pool_score returned score ${scoreBody.defi_score.score} / 100`);

  // 4d. forever_number
  const fnRes = await fetch(`${targetHost}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'smoke-fn',
      method: 'tools/call',
      params: { name: 'forever_number', arguments: { monthly: 100 } }
    })
  });
  assert.strictEqual(fnRes.status, 200);
  const fnData = await fnRes.json();
  assert.strictEqual(fnData.result.isError, false);
  console.log(`  ✓ forever_number returned calculation for $100/mo`);

  // 4e. explain_rails
  const railsRes = await fetch(`${targetHost}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'smoke-rails',
      method: 'tools/call',
      params: { name: 'explain_rails', arguments: {} }
    })
  });
  assert.strictEqual(railsRes.status, 200);
  const railsData = await railsRes.json();
  assert.strictEqual(railsData.result.isError, false);
  console.log(`  ✓ explain_rails returned active filtering rules`);

  console.log('\n✅ All Live MCP smoke tests passed successfully!');
}

if (require.main === module) {
  testEndpoint().catch(err => {
    console.error('\n❌ MCP Live Smoke Test Failed:', err.message);
    process.exit(1);
  });
}

module.exports = { testEndpoint };
