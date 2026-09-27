/* Unit gate for generate-landing-pools.js — the landing leaderboard data slice.
   Run: node test_landing_pools.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildLeaderboard, categoryOf, LEADERBOARD_SIZE, LEADERBOARD_MIN_TVL } = require('./generate-landing-pools');

const score = (s, rating) => ({ score: s, rating: rating || 'AAA', breakdown: { stability: 30, sustainability: 20, stickiness: 20, liquidity: 12 } });
const fc = { horizonDays: 14, p10: 3, p50: 3.5, p90: 4, crashRisk: 'LOW', trajectory: [3.4, 3.5], organicApy: 3.5, rewardApy: 0, forwardDelta: 0.1 };
const pool = (id, over) => Object.assign({
  pool: id, symbol: 'USDC', project: 'p', chain: 'Ethereum', tvlUsd: 50e6, apyBase: 4, apyReward: 0,
  apyMean30d: 4.1, kpis: { apyMean: 4.1, apyStdev: 0.2, historyPoints: 30 }, defiScore: score(80), forecast: fc
}, over);

const snapshot = {
  generatedAt: '2026-09-27T07:41:44.000Z',
  pools: [
    pool('low', { defiScore: score(60, 'A') }),
    pool('top', { defiScore: score(92, 'AAA'), tvlUsd: 20e6 }),
    pool('tie-bigger', { defiScore: score(92, 'AAA'), tvlUsd: 900e6, symbol: 'WSTETH' }),
    pool('small', { defiScore: score(99), tvlUsd: 9e6 }),
    pool('anomalous', { defiScore: score(99), apyBase: 1500 }),
    pool('zero', { defiScore: score(99), apyBase: 0 }),
    pool('unscored', { defiScore: undefined }),
    pool('no-forecast', { defiScore: score(95), forecast: undefined }),
    pool('btc', { defiScore: score(70, 'AA'), symbol: 'WBTC' })
  ]
};

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

const out = buildLeaderboard(snapshot, { size: 3 });

check('ranks by DeFi Score, ties broken by TVL, capped at size', () => {
  assert.deepStrictEqual(out.pools.map(p => p.pool), ['tie-bigger', 'top', 'btc']);
});
check('excludes sub-floor, anomalous, zero-APY, unscored and unforecast pools', () => {
  const all = buildLeaderboard(snapshot, { size: 50 }).pools.map(p => p.pool);
  ['small', 'anomalous', 'zero', 'unscored', 'no-forecast'].forEach(id => assert.ok(!all.includes(id), id));
});
check('carries every field the instrument panel reads', () => {
  const p = out.pools[1];
  assert.strictEqual(p.apy, 4);
  assert.strictEqual(p.rank, 2);
  assert.deepStrictEqual(Object.keys(p.defiScore).sort(), ['breakdown', 'rating', 'score']);
  ['p10', 'p50', 'p90', 'crashRisk', 'trajectory'].forEach(k => assert.ok(k in p.forecast, k));
  assert.deepStrictEqual(p.band30d, { mean: 4.1, stdev: 0.2 });
});
check('categories: stablecoins, ETH family, BTC family, other', () => {
  assert.strictEqual(categoryOf('USDC-USDT'), 'stable');
  assert.strictEqual(categoryOf('WSTETH'), 'eth');
  assert.strictEqual(categoryOf('WEETH'), 'eth');
  assert.strictEqual(categoryOf('CBBTC'), 'btc');
  assert.strictEqual(categoryOf('SOL'), 'other');
  assert.strictEqual(categoryOf('USDC-ETH'), 'other');
});
check('records its own rules for the page to disclose', () => {
  assert.strictEqual(out.minTvlUsd, LEADERBOARD_MIN_TVL);
  assert.strictEqual(out.generatedAt, snapshot.generatedAt);
  assert.strictEqual(typeof out.eligibleCount, 'number');
});

const committed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'landing-pools.json'), 'utf8'));
check('committed data/landing-pools.json is a ranked, scored leaderboard', () => {
  assert.ok(committed.pools.length > 10 && committed.pools.length <= LEADERBOARD_SIZE);
  for (let i = 1; i < committed.pools.length; i++) {
    assert.ok(committed.pools[i - 1].defiScore.score >= committed.pools[i].defiScore.score, 'sorted at ' + i);
  }
  committed.pools.forEach(p => assert.ok(p.tvlUsd >= LEADERBOARD_MIN_TVL && p.forecast && p.apy > 0 && p.apy <= 1000));
  assert.ok(fs.statSync(path.join(__dirname, 'data', 'landing-pools.json')).size < 80 * 1024, 'stays small');
});

console.log(passed + ' landing-pools assertions passed');
