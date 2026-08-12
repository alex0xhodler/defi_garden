/* Unit tests for generate-pools-snapshot.js (spec 059 E1). Pure Node, fixture
   input, NO network. Covers: 13-field projection exactness (no extra/missing
   fields), the $10M TVL floor, anomalous pools KEPT, meta + per-chain/per-token
   slices correct, idempotency (second run over same data → zero writes),
   --out isolation (writes nothing outside the out dir), and stale-slice
   deletion for chains/tokens that disappear.

   Scratch dirs use os.tmpdir()/fs.mkdtempSync (the 083-fixed pattern — never a
   hardcoded session path).

   Run: node test_pools_snapshot.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const g = require('./generate-pools-snapshot.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pools-snapshot-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const FIELDS = ['pool', 'chain', 'project', 'symbol', 'tvlUsd', 'apyBase', 'apyReward',
  'apyMean30d', 'poolMeta', 'url', 'exposure', 'ilRisk', 'underlyingTokens'];

// Fixture pools: two above the $10M floor, one below (must be dropped), one
// ANOMALOUS but above floor (must be KEPT). Each above-floor pool carries a
// couple of non-allowlisted fields (apy, il7d, predictions) that must NOT
// survive the projection. `poolMeta: null` on one to prove null is preserved.
const FIXTURE = { data: [
  { pool: 'usdc-eth-aave', chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC',
    tvlUsd: 55_000_000, apyBase: 4.2, apyReward: 0.5, apyMean30d: 4.0, poolMeta: null,
    url: 'https://aave.com', exposure: 'single', ilRisk: 'no', underlyingTokens: ['0xusdc'],
    apy: 4.7, il7d: 0, predictions: { predictedClass: 'Stable' } },
  { pool: 'eth-eth-lido', chain: 'Ethereum', project: 'lido', symbol: 'STETH',
    tvlUsd: 20_000_000, apyBase: 3.1, apyReward: 0, apyMean30d: 3.2, poolMeta: 'Staking',
    url: 'https://lido.fi', exposure: 'single', ilRisk: 'no', underlyingTokens: ['0xsteth'],
    apy: 3.1, rewardTokens: [] },
  { pool: 'below-floor', chain: 'Base', project: 'sushi', symbol: 'USDC',
    tvlUsd: 50_000, apyBase: 9, apyReward: 0, apyMean30d: 8, url: 'x',
    exposure: 'multi', ilRisk: 'yes', underlyingTokens: ['a', 'b'] },
  { pool: 'anomalous-kept', chain: 'Solana', project: 'degen-farm', symbol: 'MOON-SOL',
    tvlUsd: 15_000_000, apyBase: 1200, apyReward: 500, apyMean30d: 900, poolMeta: 'LP',
    url: 'https://x', exposure: 'multi', ilRisk: 'yes', underlyingTokens: ['0xmoon', '0xsol'] }
] };

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

console.log('generate-pools-snapshot — projection / floor / anomaly / slices');

test('13-field projection is exact — no extra fields, allowlist only', () => {
  const projected = g.projectPool(FIXTURE.data[0]);
  const keys = Object.keys(projected);
  keys.forEach(k => assert.ok(FIELDS.includes(k), `unexpected field survived projection: ${k}`));
  assert.ok(!('apy' in projected), 'raw `apy` must be dropped');
  assert.ok(!('il7d' in projected), 'raw `il7d` must be dropped');
  assert.ok(!('predictions' in projected), 'raw `predictions` must be dropped');
  assert.strictEqual(projected.poolMeta, null, 'null poolMeta preserved (present key)');
  assert.strictEqual(projected.pool, 'usdc-eth-aave');
});

test('$100K floor applied; anomalous pool KEPT; sub-floor DROPPED', () => {
  withTmpDir(dir => {
    g.generateSnapshot(FIXTURE.data, dir, '2026-07-14T00:00:00.000Z');
    const snap = readJson(path.join(dir, 'pools-snapshot.json'));
    assert.strictEqual(snap.count, 3, 'expected 3 railed pools (2 normal + 1 anomalous, sub-floor dropped)');
    assert.strictEqual(snap.pools.length, 3);
    const ids = snap.pools.map(p => p.pool);
    assert.ok(ids.includes('anomalous-kept'), 'anomalous pool above floor must be KEPT');
    assert.ok(!ids.includes('below-floor'), 'sub-floor pool must be dropped');
    snap.pools.forEach(p => assert.ok(p.tvlUsd >= 100_000, 'every pool >= $100K'));
    // No projected pool carries a non-allowlisted field.
    snap.pools.forEach(p => Object.keys(p).forEach(k =>
      assert.ok(FIELDS.includes(k), `snapshot pool has stray field ${k}`)));
  });
});

test('envelope shape correct (schemaVersion/source/minTvlUsd/count/pools)', () => {
  withTmpDir(dir => {
    g.generateSnapshot(FIXTURE.data, dir, '2026-07-14T00:00:00.000Z');
    const snap = readJson(path.join(dir, 'pools-snapshot.json'));
    assert.strictEqual(snap.schemaVersion, 1);
    assert.strictEqual(snap.source, 'https://yields.llama.fi/pools');
    assert.strictEqual(snap.minTvlUsd, 100_000);
    assert.strictEqual(snap.count, snap.pools.length);
    assert.strictEqual(snap.generatedAt, '2026-07-14T00:00:00.000Z');
  });
});

test('meta file is tiny and matches (schemaVersion/generatedAt/count/bytes)', () => {
  withTmpDir(dir => {
    g.generateSnapshot(FIXTURE.data, dir, '2026-07-14T00:00:00.000Z');
    const meta = readJson(path.join(dir, 'pools-snapshot-meta.json'));
    const snapContent = fs.readFileSync(path.join(dir, 'pools-snapshot.json'), 'utf8');
    assert.strictEqual(meta.schemaVersion, 1);
    assert.strictEqual(meta.generatedAt, '2026-07-14T00:00:00.000Z');
    assert.strictEqual(meta.count, 3);
    assert.strictEqual(meta.bytes, Buffer.byteLength(snapContent, 'utf8'), 'meta.bytes = snapshot file byte length');
    assert.ok(!('pools' in meta), 'meta must not carry the full pools array');
  });
});

test('per-chain and per-token slices carry the right pools in the same envelope', () => {
  withTmpDir(dir => {
    g.generateSnapshot(FIXTURE.data, dir, '2026-07-14T00:00:00.000Z');
    const eth = readJson(path.join(dir, 'pools', 'chain', 'ethereum.json'));
    assert.strictEqual(eth.schemaVersion, 1);
    assert.strictEqual(eth.count, 2, 'Ethereum slice has the 2 ETH pools');
    eth.pools.forEach(p => assert.strictEqual(p.chain, 'Ethereum'));
    const usdc = readJson(path.join(dir, 'pools', 'token', 'usdc.json'));
    assert.strictEqual(usdc.count, 1, 'USDC slice: only the above-floor USDC pool');
    assert.strictEqual(usdc.pools[0].pool, 'usdc-eth-aave');
    // Anomalous pool's token slice exists (kept).
    const moon = readJson(path.join(dir, 'pools', 'token', 'moon-sol.json'));
    assert.strictEqual(moon.pools[0].pool, 'anomalous-kept');
    // Slice counts: 3 chains (Ethereum/Solana; Base dropped w/ sub-floor pool), 3 tokens.
    assert.strictEqual(fs.readdirSync(path.join(dir, 'pools', 'chain')).length, 2, 'Ethereum + Solana slices only');
    assert.strictEqual(fs.readdirSync(path.join(dir, 'pools', 'token')).length, 3, 'USDC + STETH + MOON-SOL slices');
  });
});

test('idempotency — second run over identical data writes nothing', () => {
  withTmpDir(dir => {
    const first = g.generateSnapshot(FIXTURE.data, dir, '2026-07-14T00:00:00.000Z');
    assert.strictEqual(first.changed, true);
    // A later run with a DIFFERENT timestamp but identical data must skip.
    const second = g.generateSnapshot(FIXTURE.data, dir, '2026-07-15T11:11:11.111Z');
    assert.strictEqual(second.changed, false, 'no data change → changed:false');
    assert.strictEqual(second.written, 0, 'no data change → zero writes');
    // Committed generatedAt preserved (file not rewritten).
    const snap = readJson(path.join(dir, 'pools-snapshot.json'));
    assert.strictEqual(snap.generatedAt, '2026-07-14T00:00:00.000Z', 'old generatedAt preserved on skip');
  });
});

test('a real data change (added pool) DOES rewrite', () => {
  withTmpDir(dir => {
    g.generateSnapshot(FIXTURE.data, dir, '2026-07-14T00:00:00.000Z');
    const more = FIXTURE.data.concat([{ pool: 'new-eth', chain: 'Ethereum', project: 'x',
      symbol: 'WETH', tvlUsd: 40_000_000, apyBase: 2, apyReward: 0, apyMean30d: 2,
      poolMeta: null, url: 'y', exposure: 'single', ilRisk: 'no', underlyingTokens: ['0x'] }]);
    const r = g.generateSnapshot(more, dir, '2026-07-16T00:00:00.000Z');
    assert.strictEqual(r.changed, true, 'added pool → changed');
    assert.ok(r.written > 0, 'files rewritten');
    const snap = readJson(path.join(dir, 'pools-snapshot.json'));
    assert.strictEqual(snap.generatedAt, '2026-07-16T00:00:00.000Z', 'fresh generatedAt on real change');
    assert.strictEqual(snap.count, 4);
  });
});

test('--out isolation — writes nothing outside the out dir', () => {
  withTmpDir(parent => {
    const outDir = path.join(parent, 'nested', 'data');
    const sentinelDir = path.join(parent, 'sibling');
    fs.mkdirSync(sentinelDir, { recursive: true });
    fs.writeFileSync(path.join(sentinelDir, 'keep.txt'), 'untouched');
    g.generateSnapshot(FIXTURE.data, outDir, '2026-07-14T00:00:00.000Z');
    // Everything written lives under outDir.
    assert.ok(fs.existsSync(path.join(outDir, 'pools-snapshot.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'pools', 'chain', 'ethereum.json')));
    // The sibling dir is exactly as we left it (nothing leaked out of outDir).
    assert.deepStrictEqual(fs.readdirSync(sentinelDir), ['keep.txt']);
    // The nested parent only contains the intended out subtree, not stray files.
    assert.deepStrictEqual(fs.readdirSync(path.join(parent, 'nested')).sort(), ['data']);
    // Resolved paths are all under outDir.
    const paths = g.resolvePaths(outDir);
    [paths.snapshot, paths.meta, paths.chainDir, paths.tokenDir].forEach(p =>
      assert.ok(p.startsWith(outDir + path.sep), `${p} must be under outDir`));
  });
});

test('stale-slice deletion — a chain/token that disappears is removed', () => {
  withTmpDir(dir => {
    g.generateSnapshot(FIXTURE.data, dir, '2026-07-14T00:00:00.000Z');
    assert.ok(fs.existsSync(path.join(dir, 'pools', 'chain', 'solana.json')), 'Solana slice exists initially');
    assert.ok(fs.existsSync(path.join(dir, 'pools', 'token', 'moon-sol.json')), 'MOON-SOL slice exists initially');
    // Drop the Solana (anomalous) pool → its chain + token slices are now stale.
    const withoutSolana = FIXTURE.data.filter(p => p.chain !== 'Solana');
    const r = g.generateSnapshot(withoutSolana, dir, '2026-07-17T00:00:00.000Z');
    assert.strictEqual(r.changed, true);
    assert.ok(r.deleted >= 2, `expected >=2 stale slices deleted, got ${r.deleted}`);
    assert.ok(!fs.existsSync(path.join(dir, 'pools', 'chain', 'solana.json')), 'stale Solana chain slice deleted');
    assert.ok(!fs.existsSync(path.join(dir, 'pools', 'token', 'moon-sol.json')), 'stale MOON-SOL token slice deleted');
    // Surviving slices remain.
    assert.ok(fs.existsSync(path.join(dir, 'pools', 'chain', 'ethereum.json')));
  });
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) { console.error('\nFAILED'); process.exit(1); }
