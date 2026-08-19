/* Unit and integration test for .well-known/acp.json manifest and
   Agentic Readiness validation script (9/9 pass).

   Run: node test_acp_manifest.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let passed = 0;
let total = 0;
function ok(cond, msg) { total++; assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { total++; assert.strictEqual(a, b, msg); passed++; }
function deepEq(a, b, msg) { total++; assert.deepStrictEqual(a, b, msg); passed++; }

const ROOT = __dirname;
const ACP_PATH = path.join(ROOT, '.well-known', 'acp.json');

console.log('A. .well-known/acp.json existence and schema integrity');

ok(fs.existsSync(ACP_PATH), '.well-known/acp.json must exist on disk');

const raw = fs.readFileSync(ACP_PATH, 'utf8');
let acp;
try {
  acp = JSON.parse(raw);
} catch (err) {
  assert.fail('.well-known/acp.json must be valid JSON: ' + err.message);
}

ok(acp && typeof acp === 'object', 'acp.json root is an object');
ok(typeof acp.protocol === 'string' && acp.protocol.length > 0, 'acp.json declares protocol version string');
ok(acp.serverInfo && typeof acp.serverInfo.name === 'string', 'acp.json declares serverInfo.name');
ok(acp.endpoints && typeof acp.endpoints === 'object', 'acp.json declares endpoints object');
ok(typeof acp.endpoints.api_base === 'string', 'acp.json endpoints.api_base is string');
ok(typeof acp.endpoints.mcp === 'string', 'acp.json endpoints.mcp is string');
ok(typeof acp.endpoints.auth === 'string', 'acp.json endpoints.auth is string');
ok(typeof acp.endpoints.openapi === 'string', 'acp.json endpoints.openapi is string');
ok(acp.capabilities && typeof acp.capabilities === 'object', 'acp.json declares capabilities');
ok(acp.payment && typeof acp.payment === 'object', 'acp.json declares payment info');
eq(acp.payment.free, true, 'acp.json payment.free must be true (free agent access)');

console.log('  .well-known/acp.json schema validated successfully');

console.log('\nB. validate_readiness.py execution against mock local server');

// Spawn a local test HTTP server serving all 9 endpoints to verify validate_readiness.py passes 9/9
const server = http.createServer((req, res) => {
  const url = req.url;
  const accept = req.headers['accept'] || '';

  if (url === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('User-agent: *\nAllow: /\nContent-signal: search=yes, ai-train=no');
    return;
  }
  if (url === '/' && accept.includes('text/markdown')) {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Vary': 'Accept' });
    res.end('# DeFi Garden\nReal-time DeFi yield intelligence');
    return;
  }
  if (url === '/.well-known/api-catalog') {
    res.writeHead(200, { 'Content-Type': 'application/linkset+json; charset=utf-8' });
    const content = fs.existsSync(path.join(ROOT, '.well-known', 'api-catalog.json'))
      ? fs.readFileSync(path.join(ROOT, '.well-known', 'api-catalog.json'), 'utf8')
      : '{"linkset":[]}';
    res.end(content);
    return;
  }
  if (url === '/auth.md') {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    res.end(fs.readFileSync(path.join(ROOT, 'auth.md'), 'utf8'));
    return;
  }
  if (url === '/openapi.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(fs.readFileSync(path.join(ROOT, 'openapi.json'), 'utf8'));
    return;
  }
  if (url === '/.well-known/acp.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(fs.readFileSync(ACP_PATH, 'utf8'));
    return;
  }
  if (url === '/mcp' || url === '/api/mcp') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ jsonrpc: '2.0', result: { serverInfo: { name: 'DeFi Garden MCP Server' } } }));
    return;
  }
  if (url === '/.well-known/agent-skills/index.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(fs.readFileSync(path.join(ROOT, '.well-known', 'agent-skills', 'index.json'), 'utf8'));
    return;
  }
  if (url === '/.well-known/agent-skills/agentic-readiness/SKILL.md') {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    res.end(fs.readFileSync(path.join(ROOT, '.well-known', 'agent-skills', 'agentic-readiness', 'SKILL.md'), 'utf8'));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const pyScript = path.join(ROOT, '.well-known', 'agent-skills', 'agentic-readiness', 'scripts', 'validate_readiness.py');

  const proc = spawn('python3', [pyScript, baseUrl]);
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (d) => { stdout += d.toString(); });
  proc.stderr.on('data', (d) => { stderr += d.toString(); });

  proc.on('close', (status) => {
    server.close();
    console.log(stdout);
    if (stderr) console.error(stderr);

    eq(status, 0, 'validate_readiness.py exit code must be 0');
    ok(!stdout.includes('[FAIL]'), 'validate_readiness.py output must have no [FAIL] markers');
    ok(!stdout.includes('[WARN]'), 'validate_readiness.py output must have no [WARN] markers (clean 9/9 PASS)');
    ok(stdout.includes('Verifying ' + baseUrl + '/.well-known/acp.json...'), 'validate_readiness.py verified .well-known/acp.json');

    console.log(`\ntest_acp_manifest.js: ${passed}/${total} assertions passed`);
  });
});
