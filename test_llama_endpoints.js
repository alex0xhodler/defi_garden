/* test_llama_endpoints.js — gate for llama-endpoints.js, the single registry of
   DefiLlama API URLs (docs/defillama-api.md).

   Asserts:
     (a) default builders emit EXACTLY the URLs the product used before the
         refactor (so nothing user-visible or request-shaped changed);
     (b) env overrides (LLAMA_YIELDS_BASE / API / COINS) work, trailing slashes
         are normalised;
     (c) LLAMA_PRO_API_KEY switches pools()/chart() to the Pro v1 paths, with
         the key URL-encoded, while protocols()/coinsPrices() stay free;
     (d) the BROWSER build (loaded as a plain <script>, no `module`) returns the
         free URLs even when a key is sitting in a `process.env` — a key must
         never reach client code;
     (e) HTML pages load llama-endpoints.js synchronously and BEFORE every
         script that calls window.LLAMA_ENDPOINTS;
     (f) no source file outside the allow-list hard-codes a DefiLlama API URL
         string literal (grep-style guard, so the one-file switch stays true).

   Run: node test_llama_endpoints.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'llama-endpoints.js');
const L = require('./llama-endpoints.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const POOL = 'd8c4eff5-c8a9-46fc-a888-057c4c668e72';

// --- (a) defaults ----------------------------------------------------------
test('default builders produce exactly the pre-refactor URLs', () => {
  const d = L.build({});
  assert.strictEqual(d.pools(), 'https://yields.llama.fi/pools');
  assert.strictEqual(d.chart(POOL), 'https://yields.llama.fi/chart/' + POOL);
  assert.strictEqual(d.protocols(), 'https://api.llama.fi/protocols');
  assert.strictEqual(d.coinsPrices('ethereum:0xabc'), 'https://coins.llama.fi/prices/current/ethereum:0xabc');
  assert.strictEqual(d.coinsPrices(['ethereum:0xabc', 'bsc:0xdef']), 'https://coins.llama.fi/prices/current/ethereum:0xabc,bsc:0xdef');
  assert.strictEqual(d.YIELDS_BASE, 'https://yields.llama.fi');
  assert.strictEqual(d.usesPro, false);
});

test('the required instance matches defaults unless the process env overrides them', () => {
  const touched = ['LLAMA_YIELDS_BASE', 'LLAMA_API_BASE', 'LLAMA_COINS_BASE', 'LLAMA_PRO_API_KEY', 'LLAMA_PRO_BASE']
    .some((k) => process.env[k]);
  if (!touched) assert.strictEqual(L.pools(), 'https://yields.llama.fi/pools');
  assert.strictEqual(typeof L.build, 'function');
});

// --- (b) env overrides -----------------------------------------------------
test('LLAMA_YIELDS_BASE overrides pools()/chart() and strips trailing slashes', () => {
  const o = L.build({ LLAMA_YIELDS_BASE: ' https://proxy.example.com/llama/// ' });
  assert.strictEqual(o.pools(), 'https://proxy.example.com/llama/pools');
  assert.strictEqual(o.chart(POOL), 'https://proxy.example.com/llama/chart/' + POOL);
  assert.strictEqual(o.protocols(), 'https://api.llama.fi/protocols');
});

test('LLAMA_API_BASE / LLAMA_COINS_BASE override protocols() / coinsPrices()', () => {
  const o = L.build({ LLAMA_API_BASE: 'https://a.example', LLAMA_COINS_BASE: 'https://c.example/' });
  assert.strictEqual(o.protocols(), 'https://a.example/protocols');
  assert.strictEqual(o.coinsPrices('x:y'), 'https://c.example/prices/current/x:y');
});

test('empty / whitespace overrides fall back to defaults', () => {
  const o = L.build({ LLAMA_YIELDS_BASE: '  ', LLAMA_API_BASE: '' });
  assert.strictEqual(o.pools(), 'https://yields.llama.fi/pools');
  assert.strictEqual(o.protocols(), 'https://api.llama.fi/protocols');
});

// --- (c) Pro key mode ------------------------------------------------------
test('LLAMA_PRO_API_KEY switches pools()/chart() to Pro v1 paths', () => {
  const p = L.build({ LLAMA_PRO_API_KEY: 'k3y' });
  assert.strictEqual(p.usesPro, true);
  assert.strictEqual(p.pools(), 'https://pro-api.llama.fi/k3y/yields/v1/pools');
  assert.strictEqual(p.chart(POOL), 'https://pro-api.llama.fi/k3y/yields/v1/chart/' + POOL);
  // not part of the yields move: stays on the free hosts
  assert.strictEqual(p.protocols(), 'https://api.llama.fi/protocols');
  assert.strictEqual(p.coinsPrices('x:y'), 'https://coins.llama.fi/prices/current/x:y');
});

test('Pro key is URL-encoded and LLAMA_PRO_BASE is honoured', () => {
  const p = L.build({ LLAMA_PRO_API_KEY: 'a/b c', LLAMA_PRO_BASE: 'https://pro.example/' });
  assert.strictEqual(p.pools(), 'https://pro.example/a%2Fb%20c/yields/v1/pools');
});

// --- (d) browser build never sees a key ------------------------------------
test('browser build (no `module`) ignores process.env and returns free URLs', () => {
  const sandbox = {
    window: {},
    process: { env: { LLAMA_PRO_API_KEY: 'SECRET', LLAMA_YIELDS_BASE: 'https://evil.example' } }
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(fs.readFileSync(SRC, 'utf8'), sandbox);
  const api = sandbox.window.LLAMA_ENDPOINTS;
  assert.ok(api, 'window.LLAMA_ENDPOINTS must be defined');
  assert.strictEqual(api.pools(), 'https://yields.llama.fi/pools');
  assert.strictEqual(api.chart(POOL), 'https://yields.llama.fi/chart/' + POOL);
  assert.strictEqual(api.usesPro, false);
  assert.ok(!/SECRET/.test(JSON.stringify([api.pools(), api.chart('x'), api.YIELDS_BASE])));
});

// --- (e) HTML load order ---------------------------------------------------
test('home.html and plan.html load llama-endpoints.js synchronously, before its consumers', () => {
  const consumers = {
    'home.html': ['landing.js', 'planner.min.js', 'PoolDetail.compiled.min.js', 'app.compiled.min.js'],
    'plan.html': ['planner.min.js']
  };
  for (const [file, scripts] of Object.entries(consumers)) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const tag = html.match(/<script\b([^>]*)\bsrc="llama-endpoints\.js"([^>]*)>/);
    assert.ok(tag, file + ' must include <script src="llama-endpoints.js">');
    assert.ok(!/\b(defer|async)\b/.test(tag[1] + tag[2]), file + ': llama-endpoints.js must be synchronous');
    const at = html.indexOf(tag[0]);
    for (const s of scripts) {
      const m = html.match(new RegExp('<script\\b[^>]*\\bsrc="[^"]*' + s.replace(/\./g, '\\.') + '"'));
      assert.ok(!m || html.indexOf(m[0]) > at, file + ': ' + s + ' loads before llama-endpoints.js');
    }
  }
});

// --- (f) no hard-coded DefiLlama API URLs ----------------------------------
const SKIP_DIRS = new Set(['node_modules', '.git', 'tokens', 'ko', 'pt', 'es', 'pools', 'for', 'stories', 'chains',
  'spotlights', 'guide', 'risk', 'data', 'docs', 'product-loop-kit', 'telegram-bot', 'fixtures', 'test-fixtures',
  'assets', 'fonts', 'og', 'i18n', 'tests', '.claude', '.agent-reviews']);
// Files that may legitimately spell the hosts, and why.
const ALLOWED = new Set([
  'llama-endpoints.js',   // the registry itself
  'compute-forecasts.py', // Python mirror (cannot import JS); asserted separately below
  'audit-app.js'          // test harness: Playwright routes mock the exact production URL
]);
const LITERAL = /['"`]https?:\/\/(?:yields|api|coins|pro-api)\.llama\.fi/;

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name), out);
    } else if (ent.isFile() && /\.(js|mjs|py)$/.test(ent.name)) {
      if (/\.min\.js$|\.compiled\.js$/.test(ent.name) || /^test_/.test(ent.name)) continue;
      out.push(path.join(dir, ent.name));
    }
  }
  return out;
}

test('no source file outside the allow-list hard-codes a DefiLlama API URL', () => {
  const offenders = [];
  for (const f of walk(ROOT, [])) {
    const rel = path.relative(ROOT, f);
    if (ALLOWED.has(rel)) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*(\*|\/\/|\/\*|#)/.test(line)) return; // comments may name the hosts
      if (LITERAL.test(line)) offenders.push(rel + ':' + (i + 1) + '  ' + line.trim().slice(0, 100));
    });
  }
  assert.deepStrictEqual(offenders, [], 'hard-coded DefiLlama URLs (use llama-endpoints.js):\n    ' + offenders.join('\n    '));
});

test('walker actually sees the consumer files (guard is not vacuous)', () => {
  const seen = walk(ROOT, []).map((f) => path.relative(ROOT, f));
  for (const f of ['app.js', 'landing.js', 'planner.js', 'PoolDetail.js', 'generate-sitemap.js', 'api/mcp.js',
    'edge/agent-log.mjs', 'src/poller.js']) {
    assert.ok(seen.includes(f), f + ' not scanned');
  }
});

test('compute-forecasts.py mirrors the registry env vars and defaults', () => {
  const py = fs.readFileSync(path.join(ROOT, 'compute-forecasts.py'), 'utf8');
  for (const needle of ['LLAMA_YIELDS_BASE', 'LLAMA_PRO_API_KEY', 'LLAMA_PRO_BASE',
    'https://yields.llama.fi', 'https://pro-api.llama.fi', '/yields/v1/chart/']) {
    assert.ok(py.includes(needle), 'compute-forecasts.py missing ' + needle);
  }
});

test('browser/edge consumers go through LLAMA_ENDPOINTS / the registry', () => {
  const need = {
    'app.js': 'LLAMA_ENDPOINTS.pools()',
    'landing.js': 'LLAMA_ENDPOINTS.chart(',
    'planner.js': 'LLAMA_ENDPOINTS.pools()',
    'PoolDetail.js': 'LLAMA_ENDPOINTS.coinsPrices(',
    'edge/agent-log.mjs': 'llama.pools()',
    'src/poller.js': 'llama.pools()'
  };
  for (const [f, s] of Object.entries(need)) {
    assert.ok(fs.readFileSync(path.join(ROOT, f), 'utf8').includes(s), f + ' should use ' + s);
  }
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ' (with failures)' : ''));
