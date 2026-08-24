const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testMcpPage() {
  console.log('Testing DeFi Garden MCP Landing Page (mcp.html)...');
  const filePath = path.join(__dirname, 'mcp.html');
  assert.ok(fs.existsSync(filePath), 'mcp.html must exist on disk');

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
  assert.ok(content.includes('get_base_yields'), 'get_base_yields tool item required');
  assert.ok(content.includes('find_lending_rate'), 'find_lending_rate tool item required');
  assert.ok(content.includes('get_looping_params'), 'get_looping_params tool item required');
  assert.ok(content.includes('get_trust_rails'), 'get_trust_rails tool item required');
  assert.ok(content.includes('testTool') || content.includes('runTool'), 'Interactive execution function required');

  console.log('  ✓ mcp.html: SEO, AEO/GEO JSON-LD schemas, and interactive tool components validated');
  console.log('All MCP Landing Page tests passed successfully.');
}

testMcpPage();
