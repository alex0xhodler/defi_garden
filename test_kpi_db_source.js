/* Unit tests for the 110 DB-history read path in compute-kpis.js (Cloudflare D1
   /history). Pure Node, fixture input, localhost-only HTTP stub (NO external
   host). Covers: reshapeDbRows shape / intraday collapse / guards / apy-rounding
   + tvl coercion, the load-bearing BYTE-EQUIVALENCE of the DB path vs the file
   path over identical data, and fetchDbHistory happy-path (auth header + ?days)
   and fail-closed-on-non-200 behaviour (the fallback trigger).

   Scratch dirs use os.tmpdir()/fs.mkdtempSync (the 083-fixed pattern — never a
   hardcoded session path).

   Run: node test_kpi_db_source.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const k = require('./compute-kpis.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.stack); process.exitCode = 1; }
}
async function atest(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.stack); process.exitCode = 1; }
}
function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-db-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// Same helpers as test_compute_kpis.js (13-field pool envelope) for enrich tests.
function makePool(over) {
  return Object.assign({
    pool: 'p', chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC',
    tvlUsd: 50_000_000, apyBase: 4, apyReward: 0.5, apyMean30d: 4,
    poolMeta: null, url: 'https://x', exposure: 'single', ilRisk: 'no',
    underlyingTokens: ['0x']
  }, over);
}
function envelope(pools, generatedAt) {
  return {
    schemaVersion: 1, generatedAt, source: 'https://yields.llama.fi/pools',
    minTvlUsd: 10_000_000, count: pools.length, pools
  };
}

// Unix SECONDS at midnight UTC for the fixture dates.
const T12 = Math.floor(Date.parse('2026-07-12T00:00:00Z') / 1000);
const T13 = Math.floor(Date.parse('2026-07-13T00:00:00Z') / 1000);
const T14 = Math.floor(Date.parse('2026-07-14T00:00:00Z') / 1000);
const T15 = Math.floor(Date.parse('2026-07-15T00:00:00Z') / 1000);

console.log('compute-kpis 110 — reshapeDbRows / byte-equivalence / fetchDbHistory');

test('reshapeDbRows — flat rows → date-bucketed [{date,pools}] ascending', () => {
  const rows = [
    { pool_id: 'a', ts: T14, apy: 4, tvl_usd: 100 },
    { pool_id: 'b', ts: T14, apy: 1, tvl_usd: 50 },
    { pool_id: 'a', ts: T15, apy: 5, tvl_usd: 120 }
  ];
  assert.deepStrictEqual(k.reshapeDbRows(rows), [
    { date: '2026-07-14', pools: { a: [4, 100], b: [1, 50] } },
    { date: '2026-07-15', pools: { a: [5, 120] } }
  ]);
});

test('reshapeDbRows — intraday collapse: later ts wins per pool per day', () => {
  const rows = [
    { pool_id: 'a', ts: T14, apy: 4, tvl_usd: 100 },
    { pool_id: 'a', ts: T14 + 3600, apy: 9, tvl_usd: 900 }
  ];
  assert.deepStrictEqual(k.reshapeDbRows(rows), [
    { date: '2026-07-14', pools: { a: [9, 900] } }
  ]);
});

test('reshapeDbRows — guards: [], null, undefined → []; malformed rows skipped', () => {
  assert.deepStrictEqual(k.reshapeDbRows([]), []);
  assert.deepStrictEqual(k.reshapeDbRows(null), []);
  assert.deepStrictEqual(k.reshapeDbRows(undefined), []);
  const rows = [
    null,
    { pool_id: null, ts: T14, apy: 4, tvl_usd: 100 },   // missing pool_id
    { pool_id: 'a', ts: null, apy: 4, tvl_usd: 100 },   // missing ts
    { pool_id: 'a', ts: T14, apy: 4, tvl_usd: 100 }     // the only good row
  ];
  assert.deepStrictEqual(k.reshapeDbRows(rows), [
    { date: '2026-07-14', pools: { a: [4, 100] } }
  ]);
});

test('reshapeDbRows — apy rounded to 4dp; null tvl coerced to 0', () => {
  const rows = [{ pool_id: 'a', ts: T14, apy: 4.61115, tvl_usd: null }];
  assert.deepStrictEqual(k.reshapeDbRows(rows), [
    { date: '2026-07-14', pools: { a: [4.6112, 0] } }
  ]);
});

test('BYTE-EQUIVALENCE — DB path KPIs == file path KPIs over identical data', () => {
  // Snapshot pools (slimPoint: p1 [4.5,50M], p2 [3,30M], p3 [7,20M]).
  const mkPools = () => [
    makePool({ pool: 'p1', symbol: 'USDC', apyBase: 4, apyReward: 0.5, tvlUsd: 50_000_000 }),
    makePool({ pool: 'p2', symbol: 'STETH', apyBase: 3, apyReward: 0, tvlUsd: 30_000_000 }),
    makePool({ pool: 'p3', symbol: 'DAI', chain: 'Base', apyBase: 6, apyReward: 1, tvlUsd: 20_000_000 })
  ];
  // Two prior daily points (2026-07-12, 2026-07-13); today's (2026-07-14) point
  // equals what the file path appends = the snapshot's slimPoint values.
  const prior = {
    '2026-07-12': { p1: [4.0, 40_000_000], p2: [3.0, 30_000_000], p3: [7.0, 20_000_000] },
    '2026-07-13': { p1: [4.2, 45_000_000], p2: [3.1, 31_000_000], p3: [6.8, 21_000_000] }
  };
  const today = { p1: [4.5, 50_000_000], p2: [3, 30_000_000], p3: [7, 20_000_000] };

  let fileSnap, dbSnap;

  // Path FILE: seed history files, let enrich append today + read files.
  withTmpDir(dirFile => {
    fs.mkdirSync(dirFile, { recursive: true });
    fs.writeFileSync(path.join(dirFile, 'pools-snapshot.json'),
      JSON.stringify(envelope(mkPools(), '2026-07-13T00:00:00.000Z')));
    const hdir = path.join(dirFile, 'history');
    fs.mkdirSync(hdir, { recursive: true });
    Object.keys(prior).forEach(date => {
      fs.writeFileSync(path.join(hdir, date + '.json'), JSON.stringify({
        schemaVersion: 1, date, generatedAt: date + 'T00:00:00.000Z',
        count: Object.keys(prior[date]).length, pools: prior[date]
      }));
    });
    const r = k.enrich(dirFile, '2026-07-14T09:00:00.000Z');
    assert.strictEqual(r.changed, true, 'file path enrich writes');
    assert.strictEqual(r.appended, true, 'today differs from 2026-07-13 → appended');
    fileSnap = readJson(path.join(dirFile, 'pools-snapshot.json'));
  });

  // Path DB: build flat rows for the SAME three dates (incl. today = slimPoint),
  // reshape, and pass as historyOverride.
  withTmpDir(dirDb => {
    fs.mkdirSync(dirDb, { recursive: true });
    fs.writeFileSync(path.join(dirDb, 'pools-snapshot.json'),
      JSON.stringify(envelope(mkPools(), '2026-07-13T00:00:00.000Z')));
    const rows = [];
    const push = (ts, map) => Object.keys(map).forEach(id =>
      rows.push({ pool_id: id, ts, apy: map[id][0], tvl_usd: map[id][1] }));
    push(T12, prior['2026-07-12']);
    push(T13, prior['2026-07-13']);
    push(T14, today);
    const dbEntries = k.reshapeDbRows(rows);
    assert.strictEqual(dbEntries.length, 3, 'three day-buckets');
    const r = k.enrich(dirDb, '2026-07-14T09:00:00.000Z', dbEntries);
    assert.strictEqual(r.changed, true, 'db path enrich writes');
    dbSnap = readJson(path.join(dirDb, 'pools-snapshot.json'));
  });

  assert.deepStrictEqual(dbSnap.pools.map(p => p.pool), ['p1', 'p2', 'p3']);
  dbSnap.pools.forEach((p, i) => {
    assert.deepStrictEqual(
      p.kpis, fileSnap.pools[i].kpis,
      `pool ${p.pool} kpis byte-identical across DB vs file path`
    );
  });
  // Sanity: the deltas are non-null (3 points), i.e. we really exercised the math.
  const p1 = dbSnap.pools.find(p => p.pool === 'p1');
  assert.strictEqual(p1.kpis.historyPoints, 3);
  assert.strictEqual(p1.kpis.firstSeen, '2026-07-12');
});

// --- fetchDbHistory (localhost stub only, NO external host) -----------------

function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      try { await fn(port); resolve(); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

(async () => {
  await atest('fetchDbHistory — happy path: sends Bearer + ?days, reshapes rows', async () => {
    let seenAuth = null, seenUrl = null;
    await withServer((req, res) => {
      seenAuth = req.headers['authorization'];
      seenUrl = req.url;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ pool_id: 'x', ts: T14, apy: 5, tvl_usd: 1000 }]));
    }, async (port) => {
      const entries = await k.fetchDbHistory('http://127.0.0.1:' + port, 'tok', 90);
      assert.deepStrictEqual(entries, [{ date: '2026-07-14', pools: { x: [5, 1000] } }]);
      assert.strictEqual(seenAuth, 'Bearer tok', 'Authorization: Bearer tok forwarded');
      assert.ok(/[?&]days=90(&|$)/.test(seenUrl), 'query carried ?days=90, got ' + seenUrl);
    });
  });

  await atest('fetchDbHistory — fails closed on non-200 (rejects → file fallback)', async () => {
    await withServer((req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
    }, async (port) => {
      await assert.rejects(
        () => k.fetchDbHistory('http://127.0.0.1:' + port, null, 90),
        /history endpoint 401/,
        'non-200 must reject so main() catches → local file history'
      );
    });
  });

  console.log(`\n${passed} assertions passed`);
  if (process.exitCode) { console.error('\nFAILED'); process.exit(1); }
})();
