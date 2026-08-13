/* Regression test for item 277: both generated LLM discovery surfaces must
 * publish one shared, inventory-derived API & MCP section. This test requires
 * real module exports and never invokes the generator's network-backed main().
 *
 * Run: node test_llms_agent_endpoints.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const apiCore = require('./edge/api-core.js');
const mcpCore = require('./edge/mcp-core.js');
const trustRails = require('./trust-rails.js');
const llms = require('./generate-llms.js');

const BASE_URL = 'https://agent-test.defi.garden';
const HEADING = '## API & MCP';
const API_PREFIX = '- API route: ';
const TOOL_PREFIX = '- MCP tool: ';
const MCP_PREFIX = '- MCP endpoint (Streamable HTTP): ';
const RAIL_PREFIX = '- Trust rails: ';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exitCode = 1;
  }
}

function asText(value, label) {
  assert.ok(
    typeof value === 'string' || Array.isArray(value),
    `${label} must return a string or an array of lines`
  );
  return Array.isArray(value) ? value.join('\n') : value;
}

function extractSingleSection(text, label) {
  const lines = text.split('\n');
  const headingIndexes = [];
  lines.forEach((line, index) => {
    if (line === HEADING) headingIndexes.push(index);
  });
  assert.strictEqual(
    headingIndexes.length,
    1,
    `${label} must contain exactly one ${HEADING} heading`
  );

  const start = headingIndexes[0];
  let end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  if (end === -1) end = lines.length;
  const sectionLines = lines.slice(start, end);
  while (sectionLines[sectionLines.length - 1] === '') sectionLines.pop();
  return { lines: sectionLines, text: sectionLines.join('\n') };
}

function linesWithPrefix(section, prefix) {
  return section.lines.filter(line => line.startsWith(prefix));
}

function assertExactInventory(actual, expected, label) {
  assert.strictEqual(
    new Set(actual).size,
    actual.length,
    `${label} must not contain duplicate entries`
  );
  const missing = expected.filter(item => !actual.includes(item));
  const unexpected = actual.filter(item => !expected.includes(item));
  assert.deepStrictEqual(missing, [], `${label} is missing: ${missing.join(', ')}`);
  assert.deepStrictEqual(unexpected, [], `${label} has stale entries: ${unexpected.join(', ')}`);
  assert.strictEqual(actual.length, expected.length, `${label} must contain every inventory entry exactly once`);
}

function assertAgentSection(section, label, expectedRoutes, expectedTools, expectedBaseUrl = BASE_URL) {
  const apiLines = linesWithPrefix(section, API_PREFIX);
  const actualRoutes = apiLines.map(line => {
    const body = line.slice(API_PREFIX.length);
    const match = /^([A-Z]+) (https?:\/\/\S+?)(?: — .*)?$/.exec(body);
    assert.ok(match, `${label} has a malformed API role bullet: ${line}`);
    const url = new URL(match[2]);
    assert.strictEqual(url.origin, new URL(expectedBaseUrl).origin, `${label} API route must use the absolute base URL`);
    assert.strictEqual(url.search, '', `${label} API inventory routes must not carry query parameters`);
    assert.strictEqual(url.hash, '', `${label} API inventory routes must not carry fragments`);
    return `${match[1]} ${url.pathname}`;
  });
  assertExactInventory(actualRoutes, expectedRoutes, `${label} API inventory`);

  const toolLines = linesWithPrefix(section, TOOL_PREFIX);
  const actualTools = toolLines.map(line => {
    const body = line.slice(TOOL_PREFIX.length);
    const match = /^([a-z][a-z0-9_]*)(?: — .*)?$/.exec(body);
    assert.ok(match, `${label} has a malformed MCP-tool role bullet: ${line}`);
    return match[1];
  });
  assertExactInventory(actualTools, expectedTools, `${label} MCP tool inventory`);

  const mcpLines = linesWithPrefix(section, MCP_PREFIX);
  assert.strictEqual(mcpLines.length, 1, `${label} must contain one Streamable HTTP MCP endpoint`);
  const mcpUrl = mcpLines[0].slice(MCP_PREFIX.length);
  assert.doesNotThrow(() => new URL(mcpUrl), `${label} MCP endpoint must be absolute`);
  assert.strictEqual(mcpUrl, `${expectedBaseUrl}/mcp`, `${label} must advertise the canonical /mcp endpoint`);

  const railLines = linesWithPrefix(section, RAIL_PREFIX);
  assert.strictEqual(railLines.length, 1, `${label} must contain one trust-rails bullet`);
  assert.ok(
    railLines[0].includes(trustRails.formatTvlFloor(trustRails.DEFAULT_MIN_TVL)),
    `${label} trust rails must use the formatted current TVL floor`
  );
  assert.ok(
    railLines[0].includes(String(trustRails.APY_SANITY_LIMIT)),
    `${label} trust rails must use the current APY sanity cap`
  );
}

console.log('llms.txt / llms-full.txt API & MCP discovery — item 277');

test('one shared inventory-derived API & MCP section is emitted by both builders', () => {
  assert.strictEqual(
    typeof llms.buildAgentEndpointsSection,
    'function',
    'generate-llms.js must export shared buildAgentEndpointsSection(meta)'
  );

  assert.ok(Array.isArray(apiCore.ENDPOINTS), 'api-core.js must export ENDPOINTS');
  assert.ok(Array.isArray(mcpCore.TOOLS), 'mcp-core.js must export TOOLS');

  const expectedRoutes = apiCore.ENDPOINTS.map(endpoint => `${endpoint.method} ${endpoint.path}`);
  const expectedTools = mcpCore.TOOLS.map(tool => tool.name);
  assert.strictEqual(new Set(expectedRoutes).size, expectedRoutes.length, 'source API inventory must be unique');
  assert.strictEqual(new Set(expectedTools).size, expectedTools.length, 'source MCP tool inventory must be unique');
  ['/api', '/api/pools', '/api/forever-number'].forEach(path => {
    assert.ok(apiCore.ENDPOINTS.some(endpoint => endpoint.path === path), `positive-control route missing: ${path}`);
  });
  assert.strictEqual(expectedTools.length, 4, 'positive control: the actual MCP inventory currently has four tools');

  const meta = {
    baseUrl: BASE_URL,
    updatedAt: '2026-08-14T00:00:00.000Z',
    defiLlamaFetchedAt: '2026-08-14T00:00:00.000Z',
    totalUrls: 1,
  };
  const categories = {
    homepage: [`${BASE_URL}/`],
    tokens: [],
    chains: [],
    poolTypes: [],
    highValue: [],
    other: [],
  };
  const highYield = { top: [], byChain: {} };
  const yieldAnalysis = {
    topChainsByTvl: [],
    topProtocols: [],
    popularTokens: [],
    topTokenChainCombos: [],
  };

  const shared = extractSingleSection(
    asText(llms.buildAgentEndpointsSection(meta), 'buildAgentEndpointsSection'),
    'buildAgentEndpointsSection'
  );
  const concise = extractSingleSection(
    llms.buildConcise(meta, categories, highYield, yieldAnalysis, null, { highApyStakingUrl: null }),
    'buildConcise'
  );
  const full = extractSingleSection(
    llms.buildFull(meta, categories, highYield, yieldAnalysis, null),
    'buildFull'
  );

  assertAgentSection(shared, 'shared helper', expectedRoutes, expectedTools);
  assert.strictEqual(concise.text, shared.text, 'buildConcise must embed the shared section unchanged');
  assert.strictEqual(full.text, shared.text, 'buildFull must embed the shared section unchanged');
  assertAgentSection(concise, 'buildConcise', expectedRoutes, expectedTools);
  assertAgentSection(full, 'buildFull', expectedRoutes, expectedTools);
});

test('committed llms.txt and llms-full.txt contain the generated section', () => {
  const expectedRoutes = apiCore.ENDPOINTS.map(endpoint => `${endpoint.method} ${endpoint.path}`);
  const expectedTools = mcpCore.TOOLS.map(tool => tool.name);
  const productionBaseUrl = 'https://www.defi.garden';

  ['llms.txt', 'llms-full.txt'].forEach(file => {
    const section = extractSingleSection(fs.readFileSync(file, 'utf8'), file);
    assertAgentSection(section, file, expectedRoutes, expectedTools, productionBaseUrl);
  });
});

if (!process.exitCode) console.log(`\n${passed} test passed.`);
