const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testMcpPage() {
  console.log('Testing DeFi Garden MCP Landing Page (mcp-page.html)...');
  const filePath = path.join(__dirname, 'mcp-page.html');
  assert.ok(fs.existsSync(filePath), 'mcp-page.html must exist on disk');

  const content = fs.readFileSync(filePath, 'utf8');

  // Metadata checks
  assert.ok(content.includes('<title>DeFi Garden MCP Server'), 'Title must be present and optimized');
  assert.ok(content.includes('name="description"'), 'Meta description must be present');
  assert.ok(content.includes('name="keywords"'), 'Meta keywords must be present');
  assert.ok(content.includes('rel="canonical" href="https://www.defi.garden/mcp"'), 'Canonical URL must be accurate');
  assert.ok(content.includes('property="og:title"'), 'OpenGraph metadata required');
  assert.ok(content.includes('name="twitter:card"'), 'Twitter card metadata required');

  // JSON-LD AEO / GEO Structured Data
  assert.ok(content.includes('"@type": "SoftwareApplication"'), 'SoftwareApplication schema required');
  assert.ok(content.includes('"@type": "WebAPI"'), 'WebAPI schema required');
  assert.ok(content.includes('"@type": "FAQPage"'), 'FAQPage schema required');
  assert.ok(content.includes('"@type": "BreadcrumbList"'), 'BreadcrumbList schema required');

  // Interactive UI Elements
  assert.ok(content.includes('hero-badge') || content.includes('status-badge'), 'Status badge required');
  assert.ok(content.includes('Claude Desktop'), 'Claude config tab required');
  assert.ok(content.includes('Hermes Agent'), 'Hermes config tab required');
  assert.ok(content.includes('Cursor'), 'Cursor config tab required');
  assert.ok(content.includes('find_pools'), 'find_pools tool item required');
  assert.ok(content.includes('get_pool'), 'get_pool tool item required');
  assert.ok(content.includes('forever_number'), 'forever_number tool item required');
  assert.ok(content.includes('explain_rails'), 'explain_rails tool item required');
  assert.ok(content.includes('testTool') || content.includes('runTool'), 'Interactive execution function required');

  assert.ok(content.includes('get_pool_score'), 'get_pool_score tool item required');
  assert.ok(!fs.existsSync(path.join(__dirname, 'mcp.html')), 'mcp.html must not exist (it shadows the /mcp rewrite)');
  assert.ok(!fs.existsSync(path.join(__dirname, 'agents.html')), 'agents.html must not exist (/agents redirects to /mcp)');

  // No unsupported claims, and no endpoint that does not exist in production.
  for (const banned of ['Machine-Native Base Yield Intelligence', 'Base Mainnet', 'Zero Rate Hallucinations', 'zero rate hallucinations',
    'cryptographic sanity checks', 'Live Data Attestation', 'Every number derives from live pool feeds', 'defi.garden/api/mcp']) {
    assert.ok(!content.includes(banned), `mcp-page.html must not contain unsupported claim: ${banned}`);
  }
  assert.ok(content.includes('"endpointUrl": "https://www.defi.garden/mcp"'), 'JSON-LD endpointUrl must be the canonical /mcp endpoint');
  assert.ok(content.includes("'Accept': 'application/json, text/event-stream'"), 'runner must send the MCP Accept header');
  assert.ok(content.includes('HTTP ${res.status}'), 'runner must surface non-2xx status instead of a JSON parse crash');

  console.log('  ✓ mcp-page.html: SEO, AEO/GEO JSON-LD schemas, and interactive tool components validated');
  console.log('All MCP Landing Page tests passed successfully.');
}

testMcpPage();
