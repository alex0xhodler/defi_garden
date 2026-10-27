/* test_terminal_history_api.js: offline harness for GET /api/v1/history (Terminal P1).
   Mock req/res, temp-dir fixtures for the forecast ledger + outcome tree, injected fetch / x402.
   Covers: flag off 404, no key 401 + guidance, bad key 401, valid key 200 + schema, x402 path
   delegated to a gate mock (and the real edge/x402-core.js wiring), input validation, cache
   headers, score history over D1 REST (mocked), no pillar numbers / model names in output,
   vercel.json + .vercelignore wiring, record-daily-scores.js.

   Run: node test_terminal_history_api.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('./api/_terminal-history.js');
const handlerModule = require('./api/v1/history.js');
const recorder = require('./scripts/record-daily-scores.js');

let passed = 0;
let queue = Promise.resolve();
function test(name, fn) {
  queue = queue.then(() => fn()).then(
    () => { passed++; console.log('  ✓ ' + name); },
    (err) => { console.error('  ✗ ' + name + '\n    ' + (err && err.stack || err)); process.exitCode = 1; }
  );
}

const POOL = '747c1d2a-c668-4682-b9f9-296708a3dd90';
const KEY = 'tk_test_0123456789abcdef';
const KEY_HASH = core.sha256Hex(KEY);
const NOW = Date.parse('2026-10-27T12:00:00Z');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'term-hist-'));
const fdir = path.join(tmp, 'forecasts');
const hdir = path.join(tmp, 'history');
fs.mkdirSync(fdir); fs.mkdirSync(hdir);
function day(n) { return new Date(Date.parse('2026-10-01T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
for (let i = 0; i < 10; i++) {
  fs.writeFileSync(path.join(fdir, day(i) + '.json'), JSON.stringify({ date: day(i), forecasts: { [POOL]: [2.1, 2.2 + i / 100, 2.3, 2.2, 1e9, 1], 'other-pool-aaaaaa': [1, 2, 3, 2, 5e5, 0] } }));
}
// outcome tree: day(14) is the outcome of day(0), which lies in range; day(15) outside (above p90)
fs.writeFileSync(path.join(hdir, day(14) + '.json'), JSON.stringify({ schemaVersion: 1, pools: { [POOL]: [2.25, 1e9] } }));
fs.writeFileSync(path.join(hdir, day(15) + '.json'), JSON.stringify({ schemaVersion: 1, pools: { [POOL]: [9.5, 1e9] } }));

function invoke(handler, { method = 'GET', url = '/api/v1/history?pool=' + POOL, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, url, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) };
    const res = {
      writeHead(status, h) { this.status = status; this.headers = Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), v])); },
      end(text) { let json = null; try { json = JSON.parse(text); } catch (_e) { /* */ } resolve({ status: this.status, headers: this.headers, text, json }); }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
function make(extra) {
  const env = Object.assign({ TERMINAL_HISTORY_ENABLED: '1', TERMINAL_API_KEYS_SHA256: 'deadbeef,' + KEY_HASH.toUpperCase() }, (extra && extra.env) || {});
  return core.createHandler(Object.assign({ env, forecastsDir: fdir, historyDir: hdir, now: () => NOW, x402: null }, extra || {}, { env }));
}
const auth = { authorization: 'Bearer ' + KEY };

console.log('flag');
test('flag unset -> 404 for everything, even with a valid key', async () => {
  for (const v of [undefined, '', '0', 'false', 'no']) {
    const h = core.createHandler({ env: v === undefined ? {} : { TERMINAL_HISTORY_ENABLED: v, TERMINAL_API_KEYS_SHA256: KEY_HASH }, forecastsDir: fdir, historyDir: hdir, x402: null });
    const r = await invoke(h, { headers: auth });
    assert.strictEqual(r.status, 404);
    assert.deepStrictEqual(r.json, { error: 'not_found' });
  }
});
test('default export (api/v1/history.js) reads process.env: flag off -> 404', async () => {
  const prev = process.env.TERMINAL_HISTORY_ENABLED; delete process.env.TERMINAL_HISTORY_ENABLED;
  try { assert.strictEqual((await invoke(handlerModule)).status, 404); } finally { if (prev !== undefined) process.env.TERMINAL_HISTORY_ENABLED = prev; }
});

console.log('auth');
test('no credentials -> 401 with guidance and WWW-Authenticate', async () => {
  const r = await invoke(make());
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.json.error, 'authentication_required');
  assert.ok(r.json.how_to_get_access.api_key && r.json.how_to_get_access.x402 && r.json.how_to_get_access.free_alternatives.length);
  assert.ok(/Bearer/.test(r.headers['www-authenticate']));
});
test('bad key, malformed header, and empty allowlist -> 401', async () => {
  assert.strictEqual((await invoke(make(), { headers: { authorization: 'Bearer nope' } })).status, 401);
  assert.strictEqual((await invoke(make(), { headers: { authorization: 'Basic abc' } })).status, 401);
  assert.strictEqual((await invoke(make({ env: { TERMINAL_API_KEYS_SHA256: '' } }), { headers: auth })).status, 401);
  const r = await invoke(make(), { headers: { authorization: 'Bearer nope' } });
  assert.strictEqual(r.json.error, 'invalid_api_key');
});
test('a bad key never falls through to payment', async () => {
  let called = false;
  const x = { readConfig: () => ({ enabled: true }), buildChallenge: () => { called = true; return { accepts: [{}] }; }, verifyPayment: async () => { called = true; return { paid: true }; } };
  const r = await invoke(make({ x402: x }), { headers: { authorization: 'Bearer nope', 'x-payment': 'abc' } });
  assert.strictEqual(r.status, 401); assert.strictEqual(called, false);
});

console.log('valid key');
test('200, schema, private no-store, ledger rows and realized track record', async () => {
  const r = await invoke(make(), { headers: auth, url: '/api/v1/history?pool=' + POOL + '&from=' + day(0) + '&to=' + day(9) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['cache-control'], 'private, no-store');
  assert.ok(/Authorization/.test(r.headers['vary']));
  const j = r.json;
  assert.strictEqual(j.schema, core.SCHEMA); assert.strictEqual(j.pool, POOL); assert.strictEqual(j.access, 'api_key');
  assert.strictEqual(j.forecast_history.rows.length, 10);
  const r0 = j.forecast_history.rows[0];
  assert.deepStrictEqual(Object.keys(r0).sort(), ['apy_at_issue', 'date', 'in_range', 'p10', 'p50', 'p90', 'realized_apy', 'realized_on', 'stable', 'tvl_usd']);
  assert.strictEqual(r0.realized_apy, 2.25); assert.strictEqual(r0.in_range, true); assert.strictEqual(r0.realized_on, day(14));
  assert.strictEqual(j.forecast_history.rows[1].realized_apy, 9.5); assert.strictEqual(j.forecast_history.rows[1].in_range, false);
  assert.strictEqual(j.forecast_history.rows[2].realized_apy, null); assert.strictEqual(j.forecast_history.rows[2].in_range, null);
  assert.strictEqual(j.score_history.available, false);
  assert.strictEqual(j.score_history.unavailable_reason, 'not_yet_collected');
});
test('range filter, unknown pool -> empty rows, default window', async () => {
  const r = await invoke(make(), { headers: auth, url: '/api/v1/history?pool=' + POOL + '&from=' + day(3) + '&to=' + day(4) });
  assert.deepStrictEqual(r.json.forecast_history.rows.map((x) => x.date), [day(3), day(4)]);
  const u = await invoke(make(), { headers: auth, url: '/api/v1/history?pool=no-such-pool-1' });
  assert.strictEqual(u.status, 200); assert.deepStrictEqual(u.json.forecast_history.rows, []);
  assert.strictEqual(u.json.to, '2026-10-27'); assert.strictEqual(u.json.from, '2026-09-27');
});
test('HEAD allowed; POST -> 405 (after auth flag)', async () => {
  assert.strictEqual((await invoke(make(), { headers: auth, method: 'HEAD' })).status, 200);
  assert.strictEqual((await invoke(make(), { headers: auth, method: 'POST' })).status, 405);
});

console.log('validation');
test('input validation -> 400', async () => {
  const bad = [
    '', '?pool=', '?pool=x', '?pool=' + 'a'.repeat(101), '?pool=../../etc/passwd', '?pool=ab cdef', "?pool=abc'defg",
    '?pool=' + POOL + '&from=2026-13-01', '?pool=' + POOL + '&from=2026-02-30', '?pool=' + POOL + '&to=yesterday',
    '?pool=' + POOL + '&from=2026-10-10&to=2026-10-01',
    '?pool=' + POOL + '&from=2025-01-01&to=2026-10-01', // > 365 days
    '?pool=' + POOL + '&extra=1', '?pool=' + POOL + '&pool=' + POOL
  ];
  for (const q of bad) {
    const r = await invoke(make(), { headers: auth, url: '/api/v1/history' + q });
    assert.strictEqual(r.status, 400, q + ' -> ' + r.status);
    assert.strictEqual(r.json.error, 'invalid_request');
  }
});
test('exactly 365 days is accepted, 366 is not', async () => {
  assert.strictEqual((await invoke(make(), { headers: auth, url: '/api/v1/history?pool=' + POOL + '&from=2025-10-27&to=2026-10-27' })).status, 200);
  assert.strictEqual((await invoke(make(), { headers: auth, url: '/api/v1/history?pool=' + POOL + '&from=2025-10-26&to=2026-10-27' })).status, 400);
});
test('validation never runs before auth (no oracle for anonymous callers)', async () => {
  assert.strictEqual((await invoke(make(), { url: '/api/v1/history?pool=' })).status, 401);
});

console.log('x402');
test('x402 enabled, no payment -> 402 challenge at the terminal price', async () => {
  const x = require('./api/_edge/x402-core.js');
  const env = { X402_ENABLED: 'true', X402_PAY_TO: '0x0000000000000000000000000000000000000001', X402_ASSET: '0x0000000000000000000000000000000000000002' };
  const r = await invoke(make({ x402: x, env }));
  assert.strictEqual(r.status, 402);
  assert.strictEqual(r.json.x402Version, 1);
  assert.strictEqual(core.X402_PRICE_USDC_ATOMIC, '50000'); // $0.05, owner-confirmed 2026-10-27
  assert.strictEqual(r.json.accepts[0].maxAmountRequired, '50000');
  assert.ok(/\/api\/v1\/history/.test(r.json.accepts[0].resource));
  assert.strictEqual(r.headers['cache-control'], 'private, no-store');
});
test('x402 gate mock: paid -> 200 access=x402 with X-PAYMENT-RESPONSE; unpaid -> 402 with reason', async () => {
  let seen;
  const mk = (paid) => ({
    readConfig: () => ({ enabled: true, mode: 'test' }),
    buildChallenge: ({ routeId }) => { seen = routeId; return { x402Version: 1, error: 'pay', accepts: [{ scheme: 'exact', extra: {} }] }; },
    verifyPayment: async ({ header }) => (paid && header === 'good' ? { paid: true, status: 'verified' } : { paid: false, status: 'rejected', reason: 'bad payment' }),
    paymentResponseHeader: () => 'receipt'
  });
  const ok = await invoke(make({ x402: mk(true) }), { headers: { 'x-payment': 'good' } });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.json.access, 'x402'); assert.strictEqual(ok.headers['x-payment-response'], 'receipt');
  assert.strictEqual(seen, core.ROUTE_ID);
  const no = await invoke(make({ x402: mk(true) }), { headers: { 'x-payment': 'bad' } });
  assert.strictEqual(no.status, 402); assert.strictEqual(no.json.error, 'bad payment');
});
test('x402 module unavailable or disabled -> plain 401 for anonymous callers', async () => {
  assert.strictEqual((await invoke(make({ x402: null }))).status, 401);
  assert.strictEqual((await invoke(make({ x402: require('./api/_edge/x402-core.js') }))).status, 401); // X402_ENABLED unset
});

console.log('score history (D1 REST, mocked)');
test('rows are mapped to tiers only; bad rows dropped; fetch failure degrades', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ success: true, result: [{ results: [
      { day: '2026-10-26', score: 90.54, band: 'AAA', tiers: 'HMLH' },
      { day: '2026-10-27', score: 80, band: 'NOT A BAND', tiers: 'HHHH' },
      { day: '2026-10-25', score: 70, band: 'A', tiers: 'zzzz' }
    ] }] }) };
  };
  const env = { CLOUDFLARE_ACCOUNT_ID: 'acct', TERMINAL_SCORES_D1_DATABASE_ID: 'db', TERMINAL_SCORES_D1_TOKEN: 'tok' };
  const r = await invoke(make({ env, fetchImpl }), { headers: auth });
  assert.strictEqual(r.json.score_history.available, true);
  assert.deepStrictEqual(r.json.score_history.rows, [
    { date: '2026-10-26', score: 90.5, band: 'AAA', tiers: { stability: 'High', sustainability: 'Medium', stickiness: 'Low', liquidity: 'High' } },
    { date: '2026-10-25', score: 70, band: 'A', tiers: null }
  ]);
  assert.ok(/\/accounts\/acct\/d1\/database\/db\/query$/.test(calls[0].url));
  assert.ok(/\?/.test(JSON.parse(calls[0].init.body).sql) && !/747c1d2a/.test(JSON.parse(calls[0].init.body).sql), 'pool id must be a bound parameter');
  const down = await invoke(make({ env, fetchImpl: async () => { throw new Error('boom'); } }), { headers: auth });
  assert.strictEqual(down.status, 200); assert.strictEqual(down.json.score_history.unavailable_reason, 'source_unavailable');
});

console.log('proprietary surface');
test('response and sources carry no pillar numbers or model names', async () => {
  const r = await invoke(make(), { headers: auth, url: '/api/v1/history?pool=' + POOL + '&from=' + day(0) + '&to=' + day(9) });
  assert.ok(!/pillarsPct|pillars_pct|breakdown|timesfm|alchemy/i.test(r.text));
  for (const f of ['api/_terminal-history.js', 'api/v1/history.js', 'scripts/record-daily-scores.js']) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    assert.ok(!/pillarsPct|pillars_pct|\.breakdown|timesfm|alchemy/i.test(src), f);
  }
});

console.log('wiring');
test('vercel.json bundles the data for the function and marks /api/v1 no-store', () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
  const fn = v.functions['api/v1/history.js'];
  assert.ok(fn && /data\/\{forecasts,history\}/.test(fn.includeFiles));
  const rule = v.headers.find((h) => h.source === '/api/v1/(.*)');
  assert.ok(rule && rule.headers.some((h) => h.key === 'Cache-Control' && /no-store/.test(h.value)));
});
test('.vercelignore excludes all of edge/; the x402 gate the function needs is bundled from api/_edge/, never a public path', () => {
  const lines = fs.readFileSync(path.join(__dirname, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  assert.ok(lines.includes('/edge/'), 'edge/ is excluded wholesale');
  assert.ok(!lines.some((l) => /^\/?api\//.test(l)), 'api/ must not be ignored: the function and api/_edge/ must stay in the bundle');
  for (const f of ['api-core.js', 'x402-core.js']) assert.ok(fs.existsSync(path.join(__dirname, 'api', '_edge', f)), 'api/_edge/' + f + ' exists');
  const src = fs.readFileSync(path.join(__dirname, 'api', '_terminal-history.js'), 'utf8');
  assert.ok(/require\('\.\/_edge\/x402-core\.js'\)/.test(src) && !/require\('\.\.\/edge\//.test(src), 'the function must not require anything under edge/ (it is not deployed)');
  assert.strictEqual(require('./edge/x402-core.js'), require('./api/_edge/x402-core.js'), 'edge shim re-exports the canonical module');
  assert.ok(lines.includes('/scripts/'), 'scripts/ (incl. record-daily-scores.js) stays off the CDN');
});

console.log('record-daily-scores.js');
test('rows: rails, band whitelist, tiers only; SQL escapes and batches', () => {
  const pools = [
    { pool: POOL, tvlUsd: 5e6, apyBase: 2, defiScore: { score: 90.56, rating: 'AAA', pillarsTier: { stability: 'High', sustainability: 'Medium', stickiness: 'Low', liquidity: 'High' }, pillarsPct: { stability: 99 } } },
    { pool: 'abcdef-low-tvl', tvlUsd: 5e4, defiScore: { score: 80, rating: 'A' } },
    { pool: 'abcdef-anomaly', tvlUsd: 5e6, apyBase: 2000, defiScore: { score: 80, rating: 'A' } },
    { pool: 'abcdef-badband', tvlUsd: 5e6, defiScore: { score: 80, rating: 'XYZ' } },
    { pool: "abc'; DROP TABLE x;--", tvlUsd: 5e6, defiScore: { score: 80, rating: 'A' } },
    { pool: 'abcdef-notier', tvlUsd: 5e6, defiScore: { score: 71, rating: 'BBB' } }
  ];
  const rows = recorder.buildRows(pools, '2026-10-27');
  assert.deepStrictEqual(rows.map((r) => r.pool_id), [POOL, 'abcdef-notier']);
  assert.strictEqual(rows[0].tiers, 'HMLH'); assert.strictEqual(rows[0].score, 90.6); assert.strictEqual(rows[1].tiers, null);
  const sql = recorder.buildSql(rows);
  assert.ok(/INSERT OR REPLACE INTO score_daily/.test(sql) && /NULL/.test(sql) && !/99|pillarsPct/.test(sql.replace(POOL, '')));
});

queue.then(() => { console.log('\n' + passed + ' passed'); fs.rmSync(tmp, { recursive: true, force: true }); });
