/* Unit tests for compute-kpis.js (spec 087 B4/E1). Pure Node, fixture input,
   NO network, NO browser. Covers: slim projection math, population stdev,
   computeKpis (<2 points → null deltas; ≥2 points → correct momentum/stdev/
   tvlTrend; tvlTrend null when earliest TVL is 0), appendHistory freshness +
   pruning, enrich end-to-end (snapshot + slices gain kpis, pools never
   reordered/dropped), idempotency, and the 059 churn-trap regression (a
   kpi-enriched committed snapshot does NOT trigger a 059 rewrite).

   Scratch dirs use os.tmpdir()/fs.mkdtempSync (the 083-fixed pattern — never a
   hardcoded session path).

   Run: node test_compute_kpis.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const k = require('./compute-kpis.js');
const g = require('./generate-pools-snapshot.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.stack); process.exitCode = 1; }
}
function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-kpis-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// A minimal snapshot envelope (13-field pools) for enrich tests.
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

console.log('compute-kpis — slim / stdev / kpis / history / enrich / churn-trap');

test('slimPoint — apyBase+apyReward rounded to 4dp; nulls coerce to 0', () => {
  assert.deepStrictEqual(k.slimPoint({ apyBase: 4.11115, apyReward: 0.5, tvlUsd: 12345 }), [4.6112, 12345]);
  assert.deepStrictEqual(k.slimPoint({ apyBase: null, apyReward: null, tvlUsd: null }), [0, 0]);
  assert.deepStrictEqual(k.slimPoint({ apyBase: 2, apyReward: undefined, tvlUsd: '99' }), [2, 99]);
});

test('stdevPop — population stdev of a known array', () => {
  // [2,4,4,4,5,5,7,9]: mean 5, variance 4, stdev 2 (classic textbook example).
  assert.strictEqual(k.stdevPop([2, 4, 4, 4, 5, 5, 7, 9]), 2);
  assert.strictEqual(k.stdevPop([]), 0);
  assert.strictEqual(k.stdevPop([5]), 0);
});

test('computeKpis — <2 points → momentum/stdev/tvlTrend null; count/firstSeen set', () => {
  const kpis = k.computeKpis({}, [{ date: '2026-07-10', apyTotal: 4.5, tvlUsd: 1000 }]);
  assert.strictEqual(kpis.historyPoints, 1);
  assert.strictEqual(kpis.firstSeen, '2026-07-10');
  assert.strictEqual(kpis.apyMomentum, null);
  assert.strictEqual(kpis.apyStdev, null);
  assert.strictEqual(kpis.tvlTrend, null);
});

test('computeKpis — ≥2 points → correct momentum, stdev, tvlTrend', () => {
  const series = [
    { date: '2026-07-10', apyTotal: 4.0, tvlUsd: 1000 },
    { date: '2026-07-12', apyTotal: 5.0, tvlUsd: 1200 }
  ];
  const kpis = k.computeKpis({}, series);
  assert.strictEqual(kpis.historyPoints, 2);
  assert.strictEqual(kpis.firstSeen, '2026-07-10');
  assert.strictEqual(kpis.apyMomentum, 1);          // 5.0 - 4.0
  assert.strictEqual(kpis.apyStdev, 0.5);           // stdevPop([4,5]) = 0.5
  assert.strictEqual(kpis.tvlTrend, 0.2);           // (1200-1000)/1000
});

test('computeKpis — tvlTrend null when earliest TVL is 0 (division guard)', () => {
  const series = [
    { date: '2026-07-10', apyTotal: 4.0, tvlUsd: 0 },
    { date: '2026-07-12', apyTotal: 5.0, tvlUsd: 1200 }
  ];
  const kpis = k.computeKpis({}, series);
  assert.strictEqual(kpis.tvlTrend, null, 'earliest tvl 0 → null, never Infinity/fabricated');
  assert.strictEqual(kpis.apyMomentum, 1, 'other deltas still computed');
});

test('computeKpis — apyMean is the mean of the apy series (any point count, incl. 1)', () => {
  assert.strictEqual(k.computeKpis({}, [{ date: '2026-07-10', apyTotal: 4.5, tvlUsd: 1000 }]).apyMean, 4.5);
  const two = k.computeKpis({}, [
    { date: '2026-07-10', apyTotal: 4.0, tvlUsd: 1000 },
    { date: '2026-07-12', apyTotal: 5.0, tvlUsd: 1200 }
  ]);
  assert.strictEqual(two.apyMean, 4.5); // mean([4,5])
});

test('computeKpis — apySharpe null for <8 points (too noisy → no track record)', () => {
  // 7 points, non-zero dispersion — still below SHARPE_MIN_POINTS(8) → null.
  const series = [2, 4, 4, 4, 5, 5, 7].map((a, i) => ({ date: '2026-07-0' + (i + 1), apyTotal: a, tvlUsd: 1000 }));
  const kpis = k.computeKpis({}, series);
  assert.strictEqual(kpis.historyPoints, 7);
  assert.strictEqual(kpis.apySharpe, null);
  assert.strictEqual(kpis.apyMean, 4.43); // mean([2,4,4,4,5,5,7]) = 31/7 = 4.4285… → 4.43
});

test('computeKpis — apySharpe computed for ≥8 points with non-zero stdev', () => {
  // Textbook series [2,4,4,4,5,5,7,9]: mean 5, population stdev 2.
  // apySharpe = (5 − RISK_FREE_APY 4) / 2 = 0.5.
  const series = [2, 4, 4, 4, 5, 5, 7, 9].map((a, i) => ({ date: '2026-07-' + String(i + 1).padStart(2, '0'), apyTotal: a, tvlUsd: 1000 }));
  const kpis = k.computeKpis({}, series);
  assert.strictEqual(kpis.historyPoints, 8);
  assert.strictEqual(kpis.apyMean, 5);
  assert.strictEqual(kpis.apyStdev, 2);
  assert.strictEqual(kpis.apySharpe, 0.5, '(mean 5 − riskfree 4) / stdev 2 = 0.5');
});

test('computeKpis — apySharpe null when stdev is 0 even with ≥8 points (division guard)', () => {
  // 8 identical points → sd 0 → Sharpe undefined → null, never Infinity.
  const series = Array.from({ length: 8 }, (_, i) => ({ date: '2026-07-' + String(i + 1).padStart(2, '0'), apyTotal: 6, tvlUsd: 1000 }));
  const kpis = k.computeKpis({}, series);
  assert.strictEqual(kpis.historyPoints, 8);
  assert.strictEqual(kpis.apyMean, 6);
  assert.strictEqual(kpis.apySharpe, null);
});

test('computeKpis — 122: NEAR-constant rate (float-dust stdev) → apySharpe null, NOT -9e14', () => {
  // The real SUSDS bug: a flat 3.6% rate gives sd ≈ 1e-16 (not exactly 0), which passed
  // the old `sd > 0` guard and blew (mean-RF)/sd up to -900,719,925,474,097.9. Now the
  // SHARPE_MIN_STDEV floor catches it → null.
  const series = Array.from({ length: 10 }, (_, i) => ({
    date: '2026-07-' + String(i + 1).padStart(2, '0'),
    apyTotal: 3.6 + (i % 2 === 0 ? 0 : 1e-13), // sub-epsilon jitter → sd ~1e-14, well under 0.05
    tvlUsd: 1000
  }));
  const kpis = k.computeKpis({}, series);
  assert.strictEqual(kpis.historyPoints, 10);
  assert.strictEqual(kpis.apySharpe, null, 'flat rate → null, never an astronomical score');
  assert.ok(kpis.apyStdev != null && kpis.apyStdev < 0.05, 'stdev is real but below the floor');
});

test('computeKpis — 122: |Sharpe| beyond SHARPE_ABS_MAX(50) → null (noise/anomalous)', () => {
  // mean ~500, tiny-but-above-floor stdev 0.06 → (500-4)/0.06 ≈ 8266 → over the cap → null.
  const series = [500, 500.06, 500, 500.06, 500, 500.06, 500, 500.06]
    .map((a, i) => ({ date: '2026-07-' + String(i + 1).padStart(2, '0'), apyTotal: a, tvlUsd: 1000 }));
  const kpis = k.computeKpis({}, series);
  assert.strictEqual(kpis.apySharpe, null, 'absurd-magnitude Sharpe suppressed');
});

test('computeKpis — 122: stdev just above the floor still scores (not over-suppressed)', () => {
  // stdev ~0.5 (meaningful move), mean 5 → (5-4)/0.5 = 2.0, a sane displayable Sharpe.
  const series = [4.5, 5.5, 4.5, 5.5, 4.5, 5.5, 4.5, 5.5]
    .map((a, i) => ({ date: '2026-07-' + String(i + 1).padStart(2, '0'), apyTotal: a, tvlUsd: 1000 }));
  const kpis = k.computeKpis({}, series);
  assert.strictEqual(kpis.apyMean, 5);
  assert.strictEqual(kpis.apySharpe, 2, '(5-4)/0.5 = 2.0 — real variation still scores');
});

test('computeKpis — RISK_FREE_APY and SHARPE_MIN_POINTS are exported constants', () => {
  assert.strictEqual(k.RISK_FREE_APY, 4.0);
  assert.strictEqual(k.SHARPE_MIN_POINTS, 8);
});

test('buildSeriesByPool — ascending entries yield ascending per-pool series', () => {
  const entries = [
    { date: '2026-07-10', pools: { a: [4, 100], b: [1, 50] } },
    { date: '2026-07-12', pools: { a: [5, 120] } }
  ];
  const map = k.buildSeriesByPool(entries);
  assert.deepStrictEqual(map.get('a'), [
    { date: '2026-07-10', apyTotal: 4, tvlUsd: 100 },
    { date: '2026-07-12', apyTotal: 5, tvlUsd: 120 }
  ]);
  assert.deepStrictEqual(map.get('b'), [{ date: '2026-07-10', apyTotal: 1, tvlUsd: 50 }]);
});

test('appendHistory — first append writes a dated file', () => {
  withTmpDir(dir => {
    const r = k.appendHistory(dir, '2026-07-10', { a: [4, 100] }, '2026-07-10T00:00:00.000Z');
    assert.strictEqual(r.appended, true);
    const file = readJson(path.join(dir, 'history', '2026-07-10.json'));
    assert.strictEqual(file.schemaVersion, 1);
    assert.strictEqual(file.date, '2026-07-10');
    assert.strictEqual(file.count, 1);
    assert.deepStrictEqual(file.pools, { a: [4, 100] });
  });
});

test('appendHistory — identical data on a later date writes NOTHING', () => {
  withTmpDir(dir => {
    k.appendHistory(dir, '2026-07-10', { a: [4, 100] });
    const r = k.appendHistory(dir, '2026-07-11', { a: [4, 100] });
    assert.strictEqual(r.appended, false, 'unchanged data → no new point');
    const files = fs.readdirSync(path.join(dir, 'history'));
    assert.deepStrictEqual(files.sort(), ['2026-07-10.json'], 'only the original file exists');
  });
});

test('appendHistory — changed data writes a new dated file', () => {
  withTmpDir(dir => {
    k.appendHistory(dir, '2026-07-10', { a: [4, 100] });
    const r = k.appendHistory(dir, '2026-07-11', { a: [4, 120] });
    assert.strictEqual(r.appended, true, 'changed data → new point');
    assert.deepStrictEqual(
      fs.readdirSync(path.join(dir, 'history')).sort(),
      ['2026-07-10.json', '2026-07-11.json']
    );
  });
});

test('appendHistory — pruning keeps only the 30 newest; oldest is gone', () => {
  withTmpDir(dir => {
    const hdir = path.join(dir, 'history');
    fs.mkdirSync(hdir, { recursive: true });
    // Seed 31 fake dated files (2026-06-01 .. 2026-07-01), each distinct data.
    for (let d = 1; d <= 31; d++) {
      const date = '2026-06-' + String(d).padStart(2, '0');
      fs.writeFileSync(path.join(hdir, date + '.json'),
        JSON.stringify({ schemaVersion: 1, date, generatedAt: date + 'T00:00:00.000Z', count: 1, pools: { a: [d, d * 10] } }));
    }
    // A changed append on the newest-yet date triggers a write + prune (32 → 30).
    const r = k.appendHistory(dir, '2026-07-02', { a: [999, 9990] });
    assert.strictEqual(r.appended, true);
    assert.ok(r.pruned >= 1, 'at least one old file pruned');
    const remaining = fs.readdirSync(hdir).filter(f => f.endsWith('.json')).sort();
    assert.strictEqual(remaining.length, 30, 'exactly 30 files retained');
    assert.ok(!remaining.includes('2026-06-01.json'), 'oldest file pruned away');
    assert.ok(remaining.includes('2026-07-02.json'), 'newest file retained');
  });
});

test('enrich — end-to-end: snapshot + slices gain kpis; pools not reordered/dropped', () => {
  withTmpDir(dir => {
    const pools = [
      makePool({ pool: 'p1', symbol: 'USDC', apyBase: 4, apyReward: 0.5, tvlUsd: 50_000_000 }),
      makePool({ pool: 'p2', symbol: 'STETH', chain: 'Ethereum', apyBase: 3, apyReward: 0, tvlUsd: 30_000_000 }),
      makePool({ pool: 'p3', symbol: 'DAI', chain: 'Base', apyBase: 6, apyReward: 1, tvlUsd: 20_000_000 })
    ];
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'pools-snapshot.json'), JSON.stringify(envelope(pools, '2026-07-13T00:00:00.000Z')));
    // Slice files the enrich must also enrich (chain + token).
    const chainDir = path.join(dir, 'pools', 'chain');
    const tokenDir = path.join(dir, 'pools', 'token');
    fs.mkdirSync(chainDir, { recursive: true });
    fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(path.join(chainDir, 'ethereum.json'), JSON.stringify(envelope([pools[0], pools[1]], '2026-07-13T00:00:00.000Z')));
    fs.writeFileSync(path.join(tokenDir, 'usdc.json'), JSON.stringify(envelope([pools[0]], '2026-07-13T00:00:00.000Z')));
    // A PRIOR history point with different apy/tvl → ≥2 points → non-null deltas.
    const hdir = path.join(dir, 'history');
    fs.mkdirSync(hdir, { recursive: true });
    fs.writeFileSync(path.join(hdir, '2026-07-12.json'), JSON.stringify({
      schemaVersion: 1, date: '2026-07-12', generatedAt: '2026-07-12T00:00:00.000Z', count: 3,
      pools: { p1: [4.0, 40_000_000], p2: [3.0, 30_000_000], p3: [7.0, 20_000_000] }
    }));

    const r = k.enrich(dir, '2026-07-14T09:00:00.000Z');
    assert.strictEqual(r.changed, true, 'first enrich writes');
    assert.strictEqual(r.enriched, 3);
    assert.strictEqual(r.appended, true, 'today differs from prior point → appended');

    const snap = readJson(path.join(dir, 'pools-snapshot.json'));
    assert.deepStrictEqual(snap.pools.map(p => p.pool), ['p1', 'p2', 'p3'], 'order + ids unchanged');
    snap.pools.forEach(p => {
      assert.ok(p.kpis && typeof p.kpis === 'object', `pool ${p.pool} has kpis`);
      ['historyPoints', 'firstSeen', 'apyMomentum', 'apyStdev', 'tvlTrend'].forEach(f =>
        assert.ok(f in p.kpis, `kpis.${f} present on ${p.pool}`));
      assert.strictEqual(p.kpis.historyPoints, 2, 'prior + today = 2 points');
      assert.strictEqual(p.kpis.firstSeen, '2026-07-12');
    });
    // p1: apyTotal 4.0 → 4.5 momentum 0.5; tvl 40M → 50M trend 0.25.
    const p1 = snap.pools.find(p => p.pool === 'p1');
    assert.strictEqual(p1.kpis.apyMomentum, 0.5);
    assert.strictEqual(p1.kpis.tvlTrend, 0.25);
    // Slices enriched too.
    const eth = readJson(path.join(chainDir, 'ethereum.json'));
    eth.pools.forEach(p => assert.ok(p.kpis, 'chain slice pool has kpis'));
    const usdc = readJson(path.join(tokenDir, 'usdc.json'));
    assert.ok(usdc.pools[0].kpis, 'token slice pool has kpis');
    assert.deepStrictEqual(usdc.pools[0].kpis, p1.kpis, 'slice kpis match snapshot kpis by id');
  });
});

test('enrich — pool absent from history falls back to synthetic today-point (null deltas)', () => {
  withTmpDir(dir => {
    const pools = [makePool({ pool: 'fresh', apyBase: 5, apyReward: 0, tvlUsd: 25_000_000 })];
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'pools-snapshot.json'), JSON.stringify(envelope(pools, '2026-07-14T00:00:00.000Z')));
    const r = k.enrich(dir, '2026-07-14T00:00:00.000Z');
    assert.strictEqual(r.changed, true);
    const snap = readJson(path.join(dir, 'pools-snapshot.json'));
    const kpis = snap.pools[0].kpis;
    assert.strictEqual(kpis.historyPoints, 1);
    assert.strictEqual(kpis.firstSeen, '2026-07-14');
    assert.strictEqual(kpis.apyMomentum, null);
    assert.strictEqual(kpis.apyStdev, null);
    assert.strictEqual(kpis.tvlTrend, null);
  });
});

test('enrich — idempotency: second run, same data/date writes nothing', () => {
  withTmpDir(dir => {
    const pools = [makePool({ pool: 'p1' }), makePool({ pool: 'p2', symbol: 'DAI' })];
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'pools-snapshot.json'), JSON.stringify(envelope(pools, '2026-07-14T00:00:00.000Z')));
    const first = k.enrich(dir, '2026-07-14T00:00:00.000Z');
    assert.strictEqual(first.changed, true, 'first enrich writes');
    const second = k.enrich(dir, '2026-07-14T12:34:56.000Z');
    assert.strictEqual(second.changed, false, 'no underlying change → no write');
    assert.strictEqual(second.appended, false, 'no new history point');
    // Committed generatedAt from the first run is preserved (file not rewritten).
    const snap = readJson(path.join(dir, 'pools-snapshot.json'));
    assert.strictEqual(snap.generatedAt, '2026-07-14T00:00:00.000Z', 'old generatedAt preserved on skip');
  });
});

test('enrich — missing snapshot is a no-op (exit-0 semantics)', () => {
  withTmpDir(dir => {
    const r = k.enrich(dir, '2026-07-14T00:00:00.000Z');
    assert.strictEqual(r.changed, false);
    assert.strictEqual(r.reason, 'no-snapshot');
  });
});

test('CHURN-TRAP regression — kpi-enriched snapshot does NOT trigger a 059 rewrite', () => {
  withTmpDir(dir => {
    // Raw pools with a couple non-allowlisted fields (to exercise projection).
    const raw = [
      { pool: 'a', chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC', tvlUsd: 55_000_000,
        apyBase: 4.2, apyReward: 0.5, apyMean30d: 4.0, poolMeta: null, url: 'https://x',
        exposure: 'single', ilRisk: 'no', underlyingTokens: ['0xusdc'], apy: 4.7 },
      { pool: 'b', chain: 'Base', project: 'sushi', symbol: 'DAI', tvlUsd: 22_000_000,
        apyBase: 6, apyReward: 1, apyMean30d: 6, poolMeta: 'LP', url: 'https://y',
        exposure: 'multi', ilRisk: 'yes', underlyingTokens: ['0xdai'] }
    ];
    // 1) 059 builds the kpis-less snapshot + slices.
    const built = g.generateSnapshot(raw, dir, '2026-07-14T00:00:00.000Z');
    assert.strictEqual(built.changed, true);
    // 2) compute-kpis writes kpis INTO the committed snapshot + slices.
    const e = k.enrich(dir, '2026-07-14T06:00:00.000Z');
    assert.strictEqual(e.changed, true, 'enrich adds kpis');
    const snap = readJson(path.join(dir, 'pools-snapshot.json'));
    assert.ok(snap.pools.every(p => p.kpis), 'committed snapshot now carries kpis');
    // 3) 059 runs AGAIN over the SAME raw pools → must report changed:false
    //    (normalizeSnapshotContent strips kpis so the enriched file compares equal).
    const rerun = g.generateSnapshot(raw, dir, '2026-07-15T00:00:00.000Z');
    assert.strictEqual(rerun.changed, false, 'kpi-enriched committed file must NOT churn the 059 generator');
    assert.strictEqual(rerun.written, 0, 'no files rewritten');
    // The kpis survive (059 didn't strip them off disk).
    const after = readJson(path.join(dir, 'pools-snapshot.json'));
    assert.ok(after.pools.every(p => p.kpis), 'kpis still present after 059 rerun (no rewrite)');
    assert.strictEqual(after.generatedAt, '2026-07-14T06:00:00.000Z', 'enrich generatedAt preserved (059 skipped)');
  });
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) { console.error('\nFAILED'); process.exit(1); }
