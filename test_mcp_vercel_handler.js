/* test_mcp_vercel_handler.js — offline harness for api/mcp.js, the Vercel
   function that serves POST/GET /mcp (and /api/mcp) in production.

   Invokes the exported handler with mock req/res objects (no HTTP server, no
   network). Pins the live defects fixed on fix/mcp-option-b-unified-and-live-smoke:
     L1 notifications -> 202 empty        L5 forever_number.rateMethod
     L3 exact-symbol asset lookup         L6 not-in-snapshot wording
     L4 forever_number input validation   L7 -32602 on missing params
     L8 as_of on every tool result        + GET/SSE/no-store/protocol version
   and the rails that must never weaken (anomalous / sub-floor flagging and
   exclusion, access label).

   Run: node test_mcp_vercel_handler.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const HANDLER_PATH = path.join(__dirname, 'api', 'mcp.js');
const EXPECTED_TOOLS = ['find_pools', 'get_pool', 'get_pool_score', 'forever_number', 'explain_rails'];
const OPEN_ACCESS = 'Open access (not on our restricted list; protocol terms and regional limits may apply)';

let passed = 0;
let failed = 0;
// Tests run strictly in order: the synthetic-data scenarios patch fs.readFileSync.
let queue = Promise.resolve();
function test(name, fn) {
  queue = queue.then(() => Promise.resolve().then(fn)).then(
    () => { passed++; console.log('  ✓ ' + name); },
    (err) => { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
  );
}

// --- mock req/res ----------------------------------------------------------
function loadHandler() {
  delete require.cache[HANDLER_PATH];
  return require(HANDLER_PATH);
}

function invoke(handler, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const res = {
      status: null,
      headers: {},
      writeHead(status, hdrs) {
        this.status = status;
        for (const [k, v] of Object.entries(hdrs || {})) this.headers[k.toLowerCase()] = v;
      },
      end(chunk) {
        const text = chunk === undefined ? '' : String(chunk);
        let json = null;
        try { json = JSON.parse(text); } catch (_e) { /* not JSON */ }
        resolve({ status: this.status, headers: this.headers, text, json });
      }
    };
    try {
      handler(req, res);
    } catch (err) { reject(err); return; }
    if (method === 'POST') {
      if (body !== undefined) req.emit('data', typeof body === 'string' ? body : JSON.stringify(body));
      req.emit('end');
    }
  });
}

let nextId = 1;
const rpc = (handler, method, params) =>
  invoke(handler, { body: { jsonrpc: '2.0', id: nextId++, method, params } });
const callTool = (handler, name, args) => rpc(handler, 'tools/call', { name, arguments: args });
const payloadOf = (r) => JSON.parse(r.json.result.content[0].text);

// --- synthetic data scenario (rails must hold on data we control) -----------
function withData(files, fn) {
  const realRead = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    const base = typeof p === 'string' ? path.basename(p) : '';
    if (Object.prototype.hasOwnProperty.call(files, base)) {
      const v = files[base];
      if (v === null) { const e = new Error('ENOENT: ' + base); e.code = 'ENOENT'; throw e; }
      return JSON.stringify(v);
    }
    return realRead.call(this, p, ...rest);
  };
  const restore = () => { fs.readFileSync = realRead; };
  let out;
  try { out = fn(loadHandler()); } catch (e) { restore(); throw e; }
  return Promise.resolve(out).then((v) => { restore(); return v; }, (e) => { restore(); throw e; });
}

const mk = (pool, extra) => Object.assign({ pool, chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC', tvlUsd: 1000000, apyBase: 4, apyReward: 0, apyMean30d: 4 }, extra);
const SYNTH_AS_OF = '2026-01-02T03:04:05.000Z';
const SYNTH = {
  'pools-snapshot.json': {
    generatedAt: SYNTH_AS_OF,
    pools: [
      mk('ok-big', { symbol: 'USDC', tvlUsd: 9000000, apyBase: 5, defiScore: { score: 80, breakdown: { stability: 1 } }, forecast: { horizonDays: 14, p10: 4, p50: 5, p90: 6 } }),
      mk('ok-small', { symbol: 'USDC', chain: 'Base', project: 'morpho-blue', tvlUsd: 2000000, apyBase: 3 }),
      mk('ok-lower', { symbol: 'USDC', chain: 'Arbitrum', tvlUsd: 500000, apyBase: 7 }),
      mk('anomalous', { symbol: 'FOO', tvlUsd: 5000000, apyBase: 900, apyReward: 300 }),
      mk('subfloor', { symbol: 'BAR', tvlUsd: 50000, apyBase: 6 }),
      mk('anom-usdc', { symbol: 'USDC', tvlUsd: 99000000, apyBase: 1500 }),
      mk('weth-usdc', { symbol: 'USDC-WETH', tvlUsd: 500000000, apyBase: 2 }),
      mk('restricted', { symbol: 'BUIDL', project: 'blackrock-buidl', tvlUsd: 3000000, apyBase: 4.5 })
    ]
  },
  'pools-snapshot-meta.json': { generatedAt: '2000-01-01T00:00:00.000Z' },
  'forecast-evaluations.json': {
    summary: { totalRuns: 4, medianSkillScore: -0.25 },
    resolvedRuns: [
      { overall: { skillScore: -0.4 } }, { overall: { skillScore: 0.2 } },
      { overall: { skillScore: 0 } }, { overall: { skillScore: -0.1 } }
    ]
  }
};

console.log('test_mcp_vercel_handler.js — api/mcp.js with mock req/res\n');

// ===========================================================================
console.log('A. standalone + literal data paths (Vercel file tracing)');
const SOURCE = fs.readFileSync(HANDLER_PATH, 'utf8');
test('api/mcp.js never requires anything under edge/ (edge/ is not deployed)', () => {
  assert.ok(!/require\([^)]*edge[\\/]/.test(SOURCE), 'api/mcp.js must not require edge/ modules');
});
test('data files are read via literal path.join(__dirname, "../data/<file>") paths', () => {
  for (const f of ['pools-snapshot.json', 'pools-snapshot-meta.json']) {
    assert.ok(SOURCE.includes(`path.join(__dirname, '../data/${f}')`), `missing literal path for ${f}`);
  }
});
test('handler shape: module.exports is a (req, res) function', () => {
  const h = loadHandler();
  assert.strictEqual(typeof h, 'function');
  assert.ok(h.length >= 2, 'handler must accept (req, res)');
});

// ===========================================================================
console.log('B. protocol: notifications, initialize, tools/list, errors');
const real = loadHandler();

test('L1: notification (no id) -> 202 with empty body', async () => {
  const r = await invoke(real, { body: { jsonrpc: '2.0', method: 'notifications/initialized' } });
  assert.strictEqual(r.status, 202);
  assert.strictEqual(r.text, '');
});
test('L1: any notification (even unknown method) -> 202 empty; client response -> 202 empty', async () => {
  const a = await invoke(real, { body: { jsonrpc: '2.0', method: 'notifications/cancelled', params: {} } });
  assert.strictEqual(a.status, 202); assert.strictEqual(a.text, '');
  const b = await invoke(real, { body: { jsonrpc: '2.0', id: 7, result: {} } });
  assert.strictEqual(b.status, 202); assert.strictEqual(b.text, '');
});
test('initialize echoes a supported protocolVersion, else falls back to 2025-06-18', async () => {
  for (const [asked, expected] of [['2025-03-26', '2025-03-26'], ['2025-06-18', '2025-06-18'], ['2024-11-05', '2025-06-18'], [undefined, '2025-06-18']]) {
    const r = await rpc(real, 'initialize', asked === undefined ? {} : { protocolVersion: asked });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.result.protocolVersion, expected, `asked ${asked}`);
    assert.ok(r.json.result.serverInfo && r.json.result.serverInfo.name);
  }
});
test('tools/list -> exactly the 5 tools', async () => {
  const r = await rpc(real, 'tools/list');
  assert.deepStrictEqual(r.json.result.tools.map(t => t.name), EXPECTED_TOOLS);
});
test('unknown method with id -> -32601; invalid JSON -> 400 -32700', async () => {
  const r = await rpc(real, 'resources/list');
  assert.strictEqual(r.json.error.code, -32601);
  const bad = await invoke(real, { body: '{not json' });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.json.error.code, -32700);
});

// ===========================================================================
console.log('C. GET / SSE / OPTIONS / caching');
test('GET with Accept: text/event-stream -> 405 with Allow: POST (no stream offered)', async () => {
  const r = await invoke(real, { method: 'GET', headers: { Accept: 'text/event-stream' } });
  assert.strictEqual(r.status, 405);
  assert.strictEqual(r.headers['allow'], 'POST');
});
test('GET info document: canonical endpoint, streamable-http only, real tool list, as_of', async () => {
  const r = await invoke(real, { method: 'GET', headers: { Accept: 'application/json' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.endpoint, 'https://www.defi.garden/mcp');
  assert.strictEqual(r.json.canonical_endpoint, 'https://www.defi.garden/mcp');
  assert.deepStrictEqual(r.json.transports, ['streamable-http']);
  assert.deepStrictEqual(r.json.tools.map(t => t.name), EXPECTED_TOOLS);
  assert.ok(r.json.as_of, 'as_of missing');
  assert.ok(!/\bsse\b|event-stream/i.test(r.text), 'GET info must not claim SSE');
});
test('every response carries Cache-Control: no-store (GET, POST, 202, 400, 405, OPTIONS)', async () => {
  const responses = [
    await invoke(real, { method: 'GET' }),
    await invoke(real, { method: 'GET', headers: { Accept: 'text/event-stream' } }),
    await invoke(real, { method: 'OPTIONS' }),
    await invoke(real, { method: 'PUT' }),
    await invoke(real, { body: { jsonrpc: '2.0', method: 'notifications/initialized' } }),
    await invoke(real, { body: '{bad' }),
    await rpc(real, 'tools/list'),
    await callTool(real, 'explain_rails', {}),
    await callTool(real, 'get_pool', {})
  ];
  for (const r of responses) assert.strictEqual(r.headers['cache-control'], 'no-store', `status ${r.status}`);
});

// ===========================================================================
console.log('D. real snapshot: tool behavior');
test('L8: every tool result (incl. errors) carries as_of equal to the snapshot generatedAt', async () => {
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'pools-snapshot.json'), 'utf8'));
  const first = snap.pools.find(p => p.tvlUsd >= 100000 && (p.apyBase || 0) + (p.apyReward || 0) <= 1000);
  const calls = [
    ['find_pools', { token: 'USDC', limit: 2 }],
    ['get_pool', { pool_id: first.pool }],
    ['get_pool', { pool_id: 'does-not-exist' }],
    ['get_pool_score', { pool_id: first.pool }],
    ['forever_number', { monthly: 20 }],
    ['forever_number', { monthly: -1 }],
    ['explain_rails', {}]
  ];
  for (const [name, args] of calls) {
    const r = await callTool(real, name, args);
    assert.ok(payloadOf(r).as_of, `${name} ${JSON.stringify(args)} lacks as_of`);
    assert.strictEqual(payloadOf(r).as_of, snap.generatedAt);
  }
});
test('L3: get_pool_score asset "E" is an exact match, never a substring (no Lido stETH)', async () => {
  const r = await callTool(real, 'get_pool_score', { asset: 'E' });
  const body = payloadOf(r);
  if (r.json.result.isError) assert.strictEqual(body.error, 'not_found');
  else assert.strictEqual(String(body.symbol).toUpperCase(), 'E');
  assert.ok(!/steth/i.test(r.json.result.content[0].text), 'substring match leaked stETH');
});
test('L3: get_pool_score asset USDC -> symbol exactly USDC, highest-TVL railed, candidates (<=5) incl. the pick', async () => {
  const r = await callTool(real, 'get_pool_score', { asset: 'usdc' });
  assert.strictEqual(r.json.result.isError, false);
  const b = payloadOf(r);
  assert.strictEqual(b.symbol.toUpperCase(), 'USDC');
  assert.ok(Array.isArray(b.candidates) && b.candidates.length >= 1 && b.candidates.length <= 5);
  assert.strictEqual(b.candidates[0].pool_id, b.pool_id);
  for (const k of ['pool_id', 'project', 'chain', 'tvl_usd']) assert.ok(k in b.candidates[0], `candidate lacks ${k}`);
  for (let i = 1; i < b.candidates.length; i++) assert.ok(b.candidates[i - 1].tvl_usd >= b.candidates[i].tvl_usd, 'candidates must be TVL-descending');
});
test('L4: forever_number rejects apy 5000 / 0 / negative / >1000 / NaN-ish; monthly 0 / negative / missing / non-numeric', async () => {
  for (const args of [
    { monthly: 20, apy: 5000 }, { monthly: 20, apy: 0 }, { monthly: 20, apy: -3 }, { monthly: 20, apy: 1000.01 }, { monthly: 20, apy: 'abc' },
    { monthly: 0 }, { monthly: -5 }, { apy: 5 }, { monthly: 'lots' }, { monthly: null }
  ]) {
    const r = await callTool(real, 'forever_number', args);
    assert.strictEqual(r.json.result.isError, true, `expected isError for ${JSON.stringify(args)}`);
    assert.ok(payloadOf(r).message && payloadOf(r).message.length > 10, `clear message for ${JSON.stringify(args)}`);
  }
});
test('L4/L5: forever_number accepts apy in (0, 1000]; reports rateMethod for param and blended', async () => {
  const p = payloadOf(await callTool(real, 'forever_number', { monthly: 20, apy: 5 }));
  assert.strictEqual(p.foreverNumber, 4800);
  assert.strictEqual(p.apySource, 'param');
  assert.ok(p.rateMethod, 'rateMethod missing on caller-supplied rate');
  const edge = payloadOf(await callTool(real, 'forever_number', { monthly: 20, apy: 1000 }));
  assert.strictEqual(edge.foreverNumber, 24);
  const blended = payloadOf(await callTool(real, 'forever_number', { monthly: 20 }));
  assert.strictEqual(blended.rateMethod, 'tvl_weighted_mean_of_railed_pools');
  assert.strictEqual(blended.apySource, 'blended');
  assert.ok(blended.apyPct > 0 && blended.apyPct <= 1000 && blended.foreverNumber > 0);
});
test('L6: unknown pool id -> isError true, "not in DeFi Garden\'s railed snapshot" wording', async () => {
  for (const tool of ['get_pool', 'get_pool_score']) {
    const r = await callTool(real, tool, { pool_id: '00000000-0000-0000-0000-000000000000' });
    assert.strictEqual(r.json.result.isError, true);
    const m = payloadOf(r).message;
    assert.ok(m.includes("not in DeFi Garden's railed snapshot"), m);
    assert.ok(m.includes('$100K TVL floor'), m);
    assert.ok(!m.startsWith('No pool with id'), m);
  }
});
test('L7: missing pool_id / asset -> JSON-RPC -32602 (not a tool result about "undefined")', async () => {
  for (const [tool, args] of [['get_pool', {}], ['get_pool', { pool_id: '  ' }], ['get_pool', undefined],
    ['get_pool_score', {}], ['get_pool_score', { chain: 'Base' }]]) {
    const r = await callTool(real, tool, args);
    assert.ok(r.json.error, `${tool} ${JSON.stringify(args)} must be a JSON-RPC error`);
    assert.strictEqual(r.json.error.code, -32602);
    assert.strictEqual(r.json.result, undefined);
    assert.ok(!/undefined/.test(r.json.error.message));
  }
});
test('find_pools applies the rails on the real snapshot', async () => {
  const b = payloadOf(await callTool(real, 'find_pools', { token: 'USDC', limit: 100 }));
  assert.ok(b.pools.length > 0);
  for (const p of b.pools) { assert.ok(p.tvlUsd >= 100000); assert.ok(p.totalApy <= 1000); }
  assert.strictEqual(b.railsApplied.apySanityLimit, 1000);
});

// ===========================================================================
console.log('E. synthetic snapshot: rails and forecast status');
test('as_of prefers the snapshot generatedAt; falls back to meta when absent', async () => {
  await withData(SYNTH, async (h) => {
    assert.strictEqual(payloadOf(await callTool(h, 'explain_rails', {})).as_of, SYNTH_AS_OF);
  });
  const noGen = JSON.parse(JSON.stringify(SYNTH));
  delete noGen['pools-snapshot.json'].generatedAt;
  await withData(noGen, async (h) => {
    assert.strictEqual(payloadOf(await callTool(h, 'explain_rails', {})).as_of, '2000-01-01T00:00:00.000Z');
  });
});
test('rails: anomalous pools flagged by id, excluded from find_pools and asset searches', async () => {
  await withData(SYNTH, async (h) => {
    const g = payloadOf(await callTool(h, 'get_pool', { pool_id: 'anomalous' }));
    assert.strictEqual(g.anomalous, true);
    assert.ok(g.reason.includes('1000'));
    const s = payloadOf(await callTool(h, 'get_pool_score', { pool_id: 'anomalous' }));
    assert.strictEqual(s.anomalous, true);
    assert.strictEqual(s.current_apy.total, 1200);
    const f = payloadOf(await callTool(h, 'find_pools', { limit: 100 }));
    assert.ok(!f.pools.some(p => p.pool === 'anomalous' || p.pool === 'anom-usdc'), 'anomalous pool listed');
    const byAsset = payloadOf(await callTool(h, 'get_pool_score', { asset: 'USDC' }));
    assert.strictEqual(byAsset.pool_id, 'ok-big', 'anomalous 99M USDC pool must not win the asset search');
    assert.ok(!byAsset.candidates.some(c => c.pool_id === 'anom-usdc'));
    const foo = await callTool(h, 'get_pool_score', { asset: 'FOO' });
    assert.strictEqual(foo.json.result.isError, true, 'anomalous-only asset must not resolve');
  });
});
test('rails: sub-floor pools flagged by id, excluded from find_pools and asset searches', async () => {
  await withData(SYNTH, async (h) => {
    const g = payloadOf(await callTool(h, 'get_pool', { pool_id: 'subfloor' }));
    assert.strictEqual(g.belowMinTvl, true);
    assert.ok(g.belowMinTvlReason.includes('$100,000'));
    assert.strictEqual(payloadOf(await callTool(h, 'get_pool_score', { pool_id: 'subfloor' })).below_min_tvl, true);
    assert.ok(!payloadOf(await callTool(h, 'find_pools', { limit: 100 })).pools.some(p => p.pool === 'subfloor'));
    const low = payloadOf(await callTool(h, 'find_pools', { min_tvl: 1, limit: 100 }));
    assert.ok(!low.pools.some(p => p.pool === 'subfloor'), 'min_tvl must clamp up to the $100K floor');
    assert.strictEqual((await callTool(h, 'get_pool_score', { asset: 'BAR' })).json.result.isError, true);
  });
});
test('asset search: exact symbol (USDC-WETH is not USDC), chain filter, TVL order, access label', async () => {
  await withData(SYNTH, async (h) => {
    const b = payloadOf(await callTool(h, 'get_pool_score', { asset: 'USDC' }));
    assert.strictEqual(b.pool_id, 'ok-big');
    assert.deepStrictEqual(b.candidates.map(c => c.pool_id), ['ok-big', 'ok-small', 'ok-lower']);
    assert.strictEqual(b.access_restriction.is_restricted, false);
    assert.strictEqual(b.access_restriction.status, OPEN_ACCESS);
    const base = payloadOf(await callTool(h, 'get_pool_score', { asset: 'USDC', chain: 'base' }));
    assert.strictEqual(base.pool_id, 'ok-small');
    const r = payloadOf(await callTool(h, 'get_pool_score', { pool_id: 'restricted' }));
    assert.strictEqual(r.access_restriction.is_restricted, true);
    assert.ok(r.access_restriction.status.startsWith('PERMISSIONED'));
  });
});
test('forecast status is generic and carries NO track-record numbers (they live only on /forecast-accuracy)', async () => {
  await withData(SYNTH, async (h) => {
    const s = payloadOf(await callTool(h, 'get_pool_score', { pool_id: 'ok-big' })).forecast.status;
    assert.ok(s.startsWith('Experimental'), s);
    assert.ok(s.includes('/forecast-accuracy'), s);
    assert.ok(!/resolved test runs|\d+ of \d+|-0\.25|skill/i.test(s), s);
  });
});
test('get_pool_score never serves raw pillar points: pillars_pct only, plus the band name', async () => {
  const withScore = JSON.parse(JSON.stringify(SYNTH));
  withScore['pools-snapshot.json'].pools.forEach(p => { p.defiScore = { score: 80, rating: 'AA', breakdown: { stability: 30, sustainability: 20, stickiness: 20, liquidity: 10 }, pillarsPct: { stability: 86, sustainability: 80, stickiness: 80, liquidity: 67 } }; });
  await withData(withScore, async (h) => {
    const d = payloadOf(await callTool(h, 'get_pool_score', { pool_id: 'ok-big' })).defi_score;
    assert.strictEqual(d.rating, 'AA');
    assert.deepStrictEqual(d.pillars_pct, { stability: 86, sustainability: 80, stickiness: 80, liquidity: 67 });
    assert.ok(!('breakdown' in d), 'raw pillar points must not be served');
  });
});
test('missing snapshot degrades to empty results, not a crash; as_of is null', async () => {
  await withData(Object.assign({}, SYNTH, { 'pools-snapshot.json': null, 'pools-snapshot-meta.json': null }), async (h) => {
    const r = await callTool(h, 'find_pools', { token: 'USDC' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(payloadOf(r).count, 0);
    assert.strictEqual(payloadOf(r).as_of, null);
  });
});

queue.then(() => {
  console.log(`\ntest_mcp_vercel_handler.js: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
});
