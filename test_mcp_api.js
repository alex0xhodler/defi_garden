const assert = require('assert');
const http = require('http');
const mcpHandler = require('./api/mcp.js');

async function runTests() {
  console.log('Testing DeFi Garden MCP Serverless API (api/mcp.js)...');

  const server = http.createServer((req, res) => {
    mcpHandler(req, res);
  });

  await new Promise(resolve => server.listen(8999, resolve));

  try {
    // Test 1: GET /api/mcp JSON metadata
    const getRes = await fetch('http://localhost:8999/api/mcp');
    assert.strictEqual(getRes.status, 200, 'GET /api/mcp should return 200');
    const getData = await getRes.json();
    assert.strictEqual(getData.name, 'DeFi Garden Model Context Protocol (MCP) Server');
    assert.strictEqual(getData.tools.length, 5, 'Should expose 5 MCP tools');
    assert.strictEqual(getData.endpoint, 'https://www.defi.garden/mcp');
    assert.deepStrictEqual(getData.transports, ['streamable-http']);
    console.log('  ✓ GET /api/mcp returns valid MCP metadata');

    // Test 2: GET with Accept: text/event-stream -> 405 Allow: POST (no server-initiated stream offered)
    const sseRes = await fetch('http://localhost:8999/api/mcp', { headers: { 'Accept': 'text/event-stream' } });
    assert.strictEqual(sseRes.status, 405, 'GET with text/event-stream must be 405');
    assert.strictEqual(sseRes.headers.get('allow'), 'POST', '405 must carry Allow: POST');
    console.log('  ✓ GET /api/mcp with text/event-stream returns 405 Allow: POST');

    // Test 3: POST JSON-RPC initialize
    const initRes = await fetch('http://localhost:8999/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      })
    });
    assert.strictEqual(initRes.status, 200);
    const initData = await initRes.json();
    assert.strictEqual(initData.result.serverInfo.name, 'defi-garden-mcp');
    assert.strictEqual(initData.result.protocolVersion, '2025-06-18');
    console.log('  ✓ POST initialize handshake returns valid protocol & serverInfo');

    // Test 4: POST JSON-RPC tools/list
    const listRes = await fetch('http://localhost:8999/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      })
    });
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    const toolNames = listData.result.tools.map(t => t.name);
    assert.deepStrictEqual(toolNames.sort(), ['explain_rails', 'find_pools', 'forever_number', 'get_pool', 'get_pool_score'].sort());
    console.log('  ✓ POST tools/list returns all 5 canonical data-backed tools');

    // Test 5: POST JSON-RPC tools/call find_pools
    const callYieldsRes = await fetch('http://localhost:8999/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'find_pools',
          arguments: { token: 'USDC', chain: 'Base', limit: 3 }
        }
      })
    });
    assert.strictEqual(callYieldsRes.status, 200);
    const yieldsData = await callYieldsRes.json();
    const yieldContent = JSON.parse(yieldsData.result.content[0].text);
    assert.ok(yieldContent.pools.length > 0, 'Should find USDC pools on Base');
    assert.strictEqual(yieldContent.railsApplied.apySanityLimit, 1000, 'Sanity cap must be 1000%');
    console.log('  ✓ POST tools/call find_pools delegates to live data and enforces trust rails');

    // Test 6: POST JSON-RPC tools/call get_pool_score
    const callScoreRes = await fetch('http://localhost:8999/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_pool_score',
          arguments: { asset: 'USDC', chain: 'Base' }
        }
      })
    });
    assert.strictEqual(callScoreRes.status, 200);
    const scoreData = await callScoreRes.json();
    const scoreContent = JSON.parse(scoreData.result.content[0].text);
    assert.ok(scoreContent.defi_score && scoreContent.defi_score.score > 0, 'Must return DeFi Score');
    assert.ok(scoreContent.forecast && scoreContent.forecast.status.includes('Experimental'), 'Must include experimental status');
    console.log('  ✓ POST tools/call get_pool_score returns DeFi Score and experimental forecast disclaimer');

    // Test 7: POST JSON-RPC tools/call explain_rails
    const callTrustRes = await fetch('http://localhost:8999/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'explain_rails'
        }
      })
    });
    assert.strictEqual(callTrustRes.status, 200);
    const trustData = await callTrustRes.json();
    const trustContent = JSON.parse(trustData.result.content[0].text);
    assert.strictEqual(trustContent.rails.min_tvl_usd, 100000);
    assert.strictEqual(trustContent.rails.apy_sanity_limit_percent, 1000);
    console.log('  ✓ POST tools/call explain_rails returns active platform rails');

    console.log('All MCP API tests passed successfully (7/7).');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('MCP API Test Failure:', err);
  process.exit(1);
});
