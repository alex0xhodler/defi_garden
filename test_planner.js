/* Unit tests for Garden Planner pure helpers. Run: node test_planner.js */
const assert = require('assert');
const gp = require('./planner.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('futureValue / totalDeposited');
test('zero rate is plain sum of deposits', () => {
  assert.strictEqual(gp.futureValue(100, 0, 1), 1200);
});
test('positive rate beats plain deposits', () => {
  const fv = gp.futureValue(1000, 7, 20);
  assert.ok(fv > gp.totalDeposited(1000, 20), 'FV should exceed deposits');
});
test('matches monthly-compounding annuity formula', () => {
  // P=500, r=6%, 10y -> known annuity-due/ordinary FV ~ 81,939.67 (ordinary)
  const fv = gp.futureValue(500, 6, 10);
  assert.ok(Math.abs(fv - 81939.67) < 1, 'got ' + fv);
});
test('totalDeposited is monthly*months', () => {
  assert.strictEqual(gp.totalDeposited(250, 5), 250 * 60);
});

console.log('median');
test('odd-length median', () => assert.strictEqual(gp.median([3, 1, 2]), 2));
test('even-length median', () => assert.strictEqual(gp.median([1, 2, 3, 4]), 2.5));
test('empty median is 0', () => assert.strictEqual(gp.median([]), 0));

console.log('isStableSymbol');
test('USDC is stable', () => assert.ok(gp.isStableSymbol('USDC')));
test('USDC-USDT LP is stable (all legs stable)', () => assert.ok(gp.isStableSymbol('USDC-USDT')));
test('ETH-USDC is NOT all-stable', () => assert.ok(!gp.isStableSymbol('ETH-USDC')));
test('WBTC is not stable', () => assert.ok(!gp.isStableSymbol('WBTC')));

console.log('curatePools — sanity rails');
const POOLS = [
  { pool: 'a', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 5, apyReward: 0, tvlUsd: 800000000 },
  { pool: 'b', symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 6, apyReward: 0, tvlUsd: 200000000 },
  { pool: 'c', symbol: 'DAI', project: 'sky', chain: 'Ethereum', apyBase: 4.5, apyReward: 0, tvlUsd: 120000000 },
  { pool: 'd', symbol: 'USDC', project: 'aave-v3', chain: 'Base', apyBase: 5.2, apyReward: 0, tvlUsd: 90000000 }, // dup project
  { pool: 'anom', symbol: 'USDC', project: 'scam', chain: 'X', apyBase: 5000, apyReward: 0, tvlUsd: 100000000 }, // anomalous
  { pool: 'eth', symbol: 'WETH', project: 'lido', chain: 'Ethereum', apyBase: 3, apyReward: 0, tvlUsd: 9000000000 },
  { pool: 'small', symbol: 'USDC', project: 'tiny', chain: 'Z', apyBase: 9, apyReward: 0, tvlUsd: 1000 }
];

test('anomalous pool NEVER enters any plan', () => {
  ['sleep', 'balanced', 'bold'].forEach((tk) => {
    const res = gp.curatePools(POOLS, tk, 3);
    assert.ok(!res.some((p) => p.pool === 'anom'), tk + ' leaked anomalous pool');
  });
});
test('sleep = stablecoins only, TVL >= 50M', () => {
  const res = gp.curatePools(POOLS, 'sleep', 3);
  assert.ok(res.every((p) => gp.isStableSymbol(p.symbol)), 'non-stable in sleep band');
  assert.ok(res.every((p) => p.tvlUsd >= 50000000), 'low TVL in sleep band');
  assert.ok(!res.some((p) => p.pool === 'eth'), 'WETH should not appear in sleep');
});
test('dedupes by project', () => {
  const res = gp.curatePools(POOLS, 'sleep', 3);
  const projects = res.map((p) => p.project.toLowerCase());
  assert.strictEqual(new Set(projects).size, projects.length, 'duplicate project leaked');
});
test('respects limit', () => {
  assert.ok(gp.curatePools(POOLS, 'balanced', 3).length <= 3);
});
test('sorted by total APY desc within band (balanced ignoring preferTypes)', () => {
  const res = gp.curatePools(POOLS, 'balanced', 3);
  for (let i = 1; i < res.length; i++) {
    const a = (res[i - 1].apyBase || 0) + (res[i - 1].apyReward || 0);
    const b = (res[i].apyBase || 0) + (res[i].apyReward || 0);
    assert.ok(a >= b, 'not sorted desc');
  }
});

console.log('blendedApy');
test('blended is median of curated total APYs', () => {
  const curated = gp.curatePools(POOLS, 'sleep', 3);
  const expected = gp.median(curated.map((p) => (p.apyBase || 0) + (p.apyReward || 0)));
  assert.strictEqual(gp.blendedApy(curated), expected);
});
test('blended of empty is 0', () => assert.strictEqual(gp.blendedApy([]), 0));

console.log('matchGoalFromText');
test('retire -> retirement', () => assert.strictEqual(gp.matchGoalFromText('I want to retire someday'), 'retirement'));
test('house -> home', () => assert.strictEqual(gp.matchGoalFromText('saving for a house'), 'home'));
test('gibberish -> null', () => assert.strictEqual(gp.matchGoalFromText('zxqw'), null));
test('korean 은퇴 -> retirement', () => assert.strictEqual(gp.matchGoalFromText('은퇴 준비'), 'retirement'));

console.log('formatUsdRounded sanity (en-US)');
test('millions formatted with M', () => assert.ok(/M$/.test(gp.formatUsdRounded(1234567))));

console.log('\nAll ' + passed + ' assertions evaluated.');
