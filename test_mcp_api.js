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
    assert.strictEqual(getData.tools.length, 4, 'Should expose 4 MCP tools');
    console.log('  ✓ GET /api/mcp returns valid MCP metadata');

    // Test 2: GET with Accept: text/event-stream (SSE Handshake) via http.get
    await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:8999/api/mcp', {
        headers: { 'Accept': 'text/event-stream' }
      }, (res) => {
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['content-type'], 'text/event-stream');
        res.on('data', chunk => {
          const text = chunk.toString();
          assert.ok(text.includes('event: endpoint'), 'SSE response must contain endpoint event');
          req.destroy();
          console.log('  ✓ GET /api/mcp with text/event-stream returns valid SSE handshake');
          resolve();
        });
      });
      req.on('error', (err) => {
        if (err.code === 'ECONNRESET') resolve(); // Destroyed intentionally
        else reject(err);
      });
    });

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
    assert.strictEqual(initData.result.protocolVersion, '2024-11-05');
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
    assert.ok(toolNames.includes('get_base_yields'));
    assert.ok(toolNames.includes('find_lending_rate'));
    assert.ok(toolNames.includes('get_looping_params'));
    assert.ok(toolNames.includes('get_trust_rails'));
    console.log('  ✓ POST tools/list returns all 4 registered Base yield tools');

    // Test 5: POST JSON-RPC tools/call get_base_yields
    const callYieldsRes = await fetch('http://localhost:8999/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_base_yields',
          arguments: { asset: 'USDC' }
        }
      })
    });
    assert.strictEqual(callYieldsRes.status, 200);
    const yieldsData = await callYieldsRes.json();
    const yieldContent = JSON.parse(yieldsData.result.content[0].text);
    assert.strictEqual(yieldContent.chain, 'base');
    assert.ok(yieldContent.pools.length > 0, 'Should find USDC pools on Base');
    assert.ok(yieldContent.trust_rails_applied.max_apy_sanity_cap <= 1000, 'Sanity cap must be enforced');
    console.log('  ✓ POST tools/call get_base_yields enforces trust rails');

    // Test 6: POST JSON-RPC tools/call get_trust_rails
    const callTrustRes = await fetch('http://localhost:8999/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_trust_rails'
        }
      })
    });
    assert.strictEqual(callTrustRes.status, 200);
    const trustData = await callTrustRes.json();
    const trustContent = JSON.parse(trustData.result.content[0].text);
    assert.strictEqual(trustContent.trust_rails.max_oracle_divergence_bps, 15);
    assert.strictEqual(trustContent.trust_rails.min_tvl_usd, 100000);
    console.log('  ✓ POST tools/call get_trust_rails returns active circuit breakers');

    console.log('All MCP API tests passed successfully (6/6).');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('MCP API Test Failure:', err);
  process.exit(1);
});
