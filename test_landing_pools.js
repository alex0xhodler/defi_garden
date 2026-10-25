/* Unit gate for generate-landing-pools.js — the landing hero's data slice.
   Run: node test_landing_pools.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildLandingPools, LANDING_POOL_IDS } = require('./generate-landing-pools');

const score = { score: 92.3, rating: 'AAA', pillarsPct: { stability: 99.6, sustainability: 88, stickiness: 85, liquidity: 94 }, breakdown: { stability: 1, sustainability: 2, stickiness: 3, liquidity: 4 }, secret: 'x' };
const snapshot = {
  generatedAt: '2026-09-27T07:41:44.000Z',
  pools: [
    { pool: 'b', symbol: 'B', project: 'pb', chain: 'Ethereum', tvlUsd: 2e9, apyBase: 3.1, apyReward: 0.456, defiScore: score, forecast: { p50: 3.5 } },
    { pool: 'a', symbol: 'A', project: 'pa', chain: 'Base', tvlUsd: 1e9, apyBase: 4, apyReward: null, defiScore: score },
    { pool: 'unscored', symbol: 'U', project: 'pu', chain: 'Base', tvlUsd: 1e9, apyBase: 9 },
    { pool: 'other', symbol: 'O', project: 'po', chain: 'Base', tvlUsd: 1e9, apyBase: 9, defiScore: score }
  ]
};

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

const out = buildLandingPools(snapshot, ['a', 'missing', 'unscored', 'b']);

check('keeps curated order and only curated ids', () => {
  assert.deepStrictEqual(out.pools.map(p => p.pool), ['a', 'b']);
});
check('omits pools absent from the snapshot or without a defiScore', () => {
  assert.ok(!out.pools.some(p => p.pool === 'missing' || p.pool === 'unscored'));
});
check('apy = apyBase + apyReward, nulls treated as 0, rounded to 2dp', () => {
  assert.strictEqual(out.pools[0].apy, 4);
  assert.strictEqual(out.pools[1].apy, 3.56);
});
check('forecast passes through, null when absent', () => {
  assert.strictEqual(out.pools[0].forecast, null);
  assert.deepStrictEqual(out.pools[1].forecast, { p50: 3.5 });
});
check('defiScore is serialized publicly: score, rating, integer pillarsPct only', () => {
  assert.deepStrictEqual(out.pools[0].defiScore, { score: 92.3, rating: 'AAA', pillarsPct: { stability: 100, sustainability: 88, stickiness: 85, liquidity: 94 } });
  const noPct = buildLandingPools({ pools: [{ pool: 'a', defiScore: { score: 50, rating: 'BBB', breakdown: { stability: 1 } } }] }, ['a']);
  assert.deepStrictEqual(noPct.pools[0].defiScore, { score: 50, rating: 'BBB' });
});
check('carries the snapshot generatedAt', () => {
  assert.strictEqual(out.generatedAt, snapshot.generatedAt);
});

check('coverage counts only scored pools, distinct protocols and chains', () => {
  assert.deepStrictEqual(out.coverage, { scoredPools: 3, protocols: 3, chains: 2, minTvlUsd: null });
});
check('coverage carries no per-category counts (the snapshot has no category field)', () => {
  assert.deepStrictEqual(Object.keys(out.coverage).sort(), ['chains', 'minTvlUsd', 'protocols', 'scoredPools']);
});

const committed = path.join(__dirname, 'data', 'landing-pools.json');
check('committed data/landing-pools.json matches the curated list and is scored', () => {
  const data = JSON.parse(fs.readFileSync(committed, 'utf8'));
  assert.ok(data.pools.length > 0);
  data.pools.forEach(p => {
    assert.ok(LANDING_POOL_IDS.includes(p.pool), p.pool + ' not curated');
    assert.strictEqual(typeof p.defiScore.score, 'number');
    assert.ok(!('breakdown' in p.defiScore), 'raw pillar points must not be served');
  });
});

const { PERMISSIONED_PROJECT_LIST } = require('./permissioned-projects.js');
check('LANDING_POOL_IDS never overlaps PERMISSIONED_PROJECT_LIST', () => {
  const data = JSON.parse(fs.readFileSync(committed, 'utf8'));
  data.pools.forEach(p => {
    assert.ok(!PERMISSIONED_PROJECT_LIST.has(String(p.project || '').toLowerCase()),
      `Hero landing pool ${p.symbol} (${p.project}) must not be on PERMISSIONED_PROJECT_LIST`);
  });
});

console.log(passed + ' landing-pools assertions passed');
