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

console.log('v3 yield-funded math');
test('cumulativeYield at 6% for 22 months on $10k covers $1,100', () => {
  const y = gp.cumulativeYield(10000, 6, 22);
  assert.ok(y >= 1100, 'should cover $1,100 iPhone: got ' + y.toFixed(2));
});
test('cumulativeYield zero rate returns 0', () => {
  assert.strictEqual(gp.cumulativeYield(10000, 0, 12), 0);
});
test('monthsUntilYieldCoversTarget iPhone $1,100 at 6% with $10k ~ 22 months (±1)', () => {
  const m = gp.monthsUntilYieldCoversTarget(10000, 6, 1100);
  assert.ok(Math.abs(m - 22) <= 1, 'expected ~22 months, got ' + m);
});
test('monthsUntilYieldCoversTarget iPhone at 10% with $10k ~ 13 months (±1)', () => {
  const m = gp.monthsUntilYieldCoversTarget(10000, 10, 1100);
  assert.ok(Math.abs(m - 13) <= 1, 'expected ~13 months, got ' + m);
});
test('monthsUntilYieldCoversTarget zero capital returns Infinity', () => {
  assert.strictEqual(gp.monthsUntilYieldCoversTarget(0, 6, 1100), Infinity);
});
test('capitalForDeadline iPhone 5 months at 6% ~ $44k (±5%)', () => {
  const c = gp.capitalForDeadline(6, 1100, 5);
  assert.ok(Math.abs(c - 44000) / 44000 < 0.05, 'expected ~$44k, got ' + c.toFixed(0));
});
test('capitalForDeadline zero rate returns Infinity', () => {
  assert.strictEqual(gp.capitalForDeadline(0, 1100, 5), Infinity);
});
test('foreverNumber Claude $20/mo at 5.5% ~ $4,364 (±5%)', () => {
  const fn = gp.foreverNumber(20, 5.5);
  assert.ok(Math.abs(fn - 4364) / 4364 < 0.05, 'expected ~$4364, got ' + fn.toFixed(0));
});
test('foreverNumber Spotify $12/mo at 5.5% ~ $2,618 (±5%)', () => {
  const fn = gp.foreverNumber(12, 5.5);
  assert.ok(Math.abs(fn - 2618) / 2618 < 0.05, 'expected ~$2618, got ' + fn.toFixed(0));
});
test('dailyYield $10k at 6% ~ $1.644/day (±0.01)', () => {
  const d = gp.dailyYield(10000, 6);
  assert.ok(Math.abs(d - 1.644) < 0.01, 'got ' + d.toFixed(3));
});
test('dailyYield zero capital returns 0', () => {
  assert.strictEqual(gp.dailyYield(0, 6), 0);
});

console.log('migratePlan');
test('v2 monthly plan migrates to v3 with archetype and hero.kind=projection', () => {
  const v2plan = { version: 2, goal: 'retirement', monthly: 500, years: 10, persona: 'stable', temperament: 'sleep', pools: [], blendedApy: 5, effectiveApy: 5, projection: 81939, savedAt: '2026-01-01' };
  const result = gp.migratePlan(v2plan);
  assert.ok(result !== null, 'should return non-null');
  assert.strictEqual(result.version, 3, 'version should be 3');
  assert.strictEqual(result.archetype, 'growth', 'archetype should be growth for retirement');
  assert.strictEqual(result.fundingMode, 'monthly', 'fundingMode should be monthly');
  assert.strictEqual(result.capital, null, 'capital should be null');
  assert.ok(result.hero && result.hero.kind === 'projection', 'hero.kind should be projection');
});
test('v3 plan passthrough — valid capital plan returns itself', () => {
  const v3plan = { version: 3, goal: 'iphone', capital: 10000, monthly: null, fundingMode: 'capital', archetype: 'target', target: 1100, hero: { kind: 'flipDate', months: 22 }, pools: [], savedAt: '2026-01-01' };
  const result = gp.migratePlan(v3plan);
  assert.ok(result === v3plan, 'should return the same object for valid v3');
});
test('version 99 returns null', () => {
  const result = gp.migratePlan({ version: 99, goal: 'retirement', monthly: 500 });
  assert.strictEqual(result, null, 'unknown version should return null');
});
test('v3 with no monthly and no capital returns null', () => {
  const result = gp.migratePlan({ version: 3, goal: 'iphone', monthly: null, capital: null });
  assert.strictEqual(result, null, 'no funding source should return null');
});
test('v2 with no monthly returns null', () => {
  const result = gp.migratePlan({ version: 2, goal: 'retirement', monthly: 0 });
  assert.strictEqual(result, null, 'v2 with zero monthly should return null');
});
test('null input returns null', () => {
  assert.strictEqual(gp.migratePlan(null), null);
});

console.log('buildPlanHero');
test('subscription $5000 @ 5.5% target $20 -> progressPct 100 (5000 > 4364)', () => {
  const hero = gp.buildPlanHero({ archetype: 'subscription', fundingMode: 'capital', capital: 5000, monthly: null, years: 10, target: 20, apy: 5.5 });
  assert.strictEqual(hero.kind, 'forever');
  assert.strictEqual(hero.progressPct, 100, 'progressPct should be 100 since 5000 > foreverNum(20, 5.5)~4364');
});
test('subscription $1000 @ 5.5% target $20 -> progressPct in 21..25', () => {
  const hero = gp.buildPlanHero({ archetype: 'subscription', fundingMode: 'capital', capital: 1000, monthly: null, years: 10, target: 20, apy: 5.5 });
  assert.strictEqual(hero.kind, 'forever');
  assert.ok(hero.progressPct >= 21 && hero.progressPct <= 25, 'expected ~23%, got ' + hero.progressPct);
});
test('target capital $10000 target $1100 @ 6% -> months in 21..23', () => {
  const hero = gp.buildPlanHero({ archetype: 'target', fundingMode: 'capital', capital: 10000, monthly: null, years: 10, target: 1100, apy: 6 });
  assert.strictEqual(hero.kind, 'flipDate');
  assert.ok(hero.months >= 21 && hero.months <= 23, 'expected ~22 months, got ' + hero.months);
});
test('growth archetype -> kind projection matching futureValue', () => {
  const hero = gp.buildPlanHero({ archetype: 'growth', fundingMode: 'monthly', capital: null, monthly: 500, years: 10, target: null, apy: 6 });
  assert.strictEqual(hero.kind, 'projection');
  const expected = gp.futureValue(500, 6, 10);
  assert.ok(Math.abs(hero.projection - expected) < 1, 'projection mismatch');
});

console.log('chipHintsFor');
test('subscription capital chips [1000,2500,5000,10000,25000] @ 5.5% target 20 -> exactly one featured (value 5000)', () => {
  const hints = gp.chipHintsFor([1000, 2500, 5000, 10000, 25000], { archetype: 'subscription', target: 20, apy: 5.5, mode: 'capital' });
  const featured = hints.filter(function(h) { return h.featured; });
  assert.strictEqual(featured.length, 1, 'should have exactly one featured chip');
  assert.strictEqual(featured[0].value, 5000, 'featured chip should be 5000 (first chip >= foreverNum)');
});
test('subscription $1000 chip pct in 21..25 at 5.5% target 20', () => {
  const hints = gp.chipHintsFor([1000], { archetype: 'subscription', target: 20, apy: 5.5, mode: 'capital' });
  assert.ok(hints[0].pct >= 21 && hints[0].pct <= 25, 'expected ~23%, got ' + hints[0].pct);
});
test('apy=0 -> no Infinity or NaN fields in chips', () => {
  const hints = gp.chipHintsFor([1000, 5000, 10000], { archetype: 'subscription', target: 20, apy: 0, mode: 'capital' });
  hints.forEach(function(h) {
    Object.keys(h).forEach(function(k) {
      const v = h[k];
      if (typeof v === 'number') {
        assert.ok(isFinite(v), 'field ' + k + ' should be finite, got ' + v);
        assert.ok(!isNaN(v), 'field ' + k + ' should not be NaN');
      }
    });
  });
});
test('target capital chips include months field when finite', () => {
  const hints = gp.chipHintsFor([10000], { archetype: 'target', target: 1100, apy: 6, mode: 'capital' });
  assert.ok('months' in hints[0], 'should have months field');
  assert.ok(isFinite(hints[0].months), 'months should be finite');
});

console.log('buildLadder');
// Real SUBSCRIPTION_LADDER shape (mirrored from planner.js)
const SUBSCRIPTION_LADDER = [
  { id: 'spotify',   emoji: '🎵', labelKey: 'ladderSpotify',   monthly: 12 },
  { id: 'netflix',   emoji: '🍿', labelKey: 'ladderNetflix',   monthly: 18 },
  { id: 'claude',    emoji: '🤖', labelKey: 'ladderClaude',    monthly: 20 },
  { id: 'gym',       emoji: '🏋️', labelKey: 'ladderGym',       monthly: 40 },
  { id: 'phonebill', emoji: '📱', labelKey: 'ladderPhoneBill', monthly: 70 }
];

test('buildLadder returns array with one entry per item', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  assert.strictEqual(result.length, SUBSCRIPTION_LADDER.length, 'wrong length');
});

test('buildLadder entries sorted by monthly ascending', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i].monthly >= result[i-1].monthly, 'not sorted asc at index ' + i);
  }
});

test('buildLadder cumMonthly sequence is [12,30,50,90,160]', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  const expected = [12, 30, 50, 90, 160];
  result.forEach(function(r, i) {
    assert.strictEqual(r.cumMonthly, expected[i], 'cumMonthly[' + i + '] expected ' + expected[i] + ' got ' + r.cumMonthly);
  });
});

test('buildLadder first foreverAmt ~ foreverNumber(12, 5.5) within ±5%', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  const expected = gp.foreverNumber(12, 5.5); // ~2618
  const pct = Math.abs(result[0].foreverAmt - expected) / expected;
  assert.ok(pct < 0.05, 'first foreverAmt expected ~' + expected.toFixed(0) + ' got ' + result[0].foreverAmt.toFixed(0));
});

test('buildLadder cumulative foreverAmts are strictly increasing', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i].foreverAmt > result[i-1].foreverAmt, 'foreverAmt not strictly increasing at index ' + i);
  }
});

test('buildLadder capital=3000: spotify unlocked, netflix rung NOT unlocked', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, 3000);
  // spotify cumMonthly=12 -> foreverAmt~2618; 3000>=2618 -> unlocked
  assert.ok(result[0].unlocked, 'spotify (cum $12/mo) should be unlocked at $3000');
  // netflix cumMonthly=30 -> foreverAmt~6545; 3000<6545 -> NOT unlocked
  assert.ok(!result[1].unlocked, 'netflix rung (cum $30/mo) should NOT be unlocked at $3000');
});

test('buildLadder capital=null: no entry is unlocked', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  result.forEach(function(r, i) {
    assert.ok(!r.unlocked, 'rung ' + i + ' should not be unlocked when capital=null');
  });
});

test('buildLadder capital=null: pct is 0 for all rungs', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  result.forEach(function(r, i) {
    assert.strictEqual(r.pct, 0, 'rung ' + i + ' pct should be 0 when capital=null, got ' + r.pct);
  });
});

test('buildLadder capital=null: no NaN foreverAmt', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  result.forEach(function(r, i) {
    assert.ok(!isNaN(r.foreverAmt), 'rung ' + i + ' foreverAmt is NaN');
  });
});

test('buildLadder carries through id, emoji, labelKey, monthly from each item', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  result.forEach(function(r) {
    assert.ok(r.id, 'missing id');
    assert.ok(r.emoji, 'missing emoji');
    assert.ok(r.labelKey, 'missing labelKey');
    assert.ok(typeof r.monthly === 'number', 'monthly not a number');
  });
});

test('buildLadder apy=0: foreverAmt is Infinity for all rungs', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 0, null);
  result.forEach(function(r, i) {
    assert.ok(!isFinite(r.foreverAmt), 'rung ' + i + ' foreverAmt should be Infinity when apy=0, got ' + r.foreverAmt);
  });
});

test('buildLadder apy=0: pct is 0 (no Infinity/NaN in pct)', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 0, 5000);
  result.forEach(function(r, i) {
    assert.strictEqual(r.pct, 0, 'rung ' + i + ' pct should be 0 when apy=0, got ' + r.pct);
    assert.ok(!isNaN(r.pct), 'rung ' + i + ' pct is NaN');
  });
});

// ---------------------------------------------------------------------------
// curatePools — opts extension (chain / token / exclude filters)
// ---------------------------------------------------------------------------
console.log('curatePools — opts (chain/token/exclude)');

// Extend fixture with multi-chain and token variety
const POOLS2 = [
  { pool: 'a', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 5, apyReward: 0, tvlUsd: 800000000 },
  { pool: 'b', symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 6, apyReward: 0, tvlUsd: 200000000 },
  { pool: 'c', symbol: 'DAI', project: 'sky', chain: 'Ethereum', apyBase: 4.5, apyReward: 0, tvlUsd: 120000000 },
  { pool: 'd', symbol: 'USDC', project: 'aave-v3', chain: 'Base', apyBase: 5.2, apyReward: 0, tvlUsd: 90000000 },
  { pool: 'e', symbol: 'USDC-USDT', project: 'curve', chain: 'Base', apyBase: 5.8, apyReward: 0, tvlUsd: 70000000 },
  { pool: 'f', symbol: 'USDC', project: 'morpho', chain: 'Arbitrum', apyBase: 5.5, apyReward: 0, tvlUsd: 60000000 },
  { pool: 'anom', symbol: 'USDC', project: 'scam', chain: 'Ethereum', apyBase: 5000, apyReward: 0, tvlUsd: 100000000 },
  { pool: 'small', symbol: 'USDC', project: 'tiny', chain: 'Ethereum', apyBase: 9, apyReward: 0, tvlUsd: 1000 }
];

test('3-arg call (no opts) is backward-compatible — same pool ids as before', () => {
  const r3 = gp.curatePools(POOLS2, 'stable', 3);
  const rOpts = gp.curatePools(POOLS2, 'stable', 3, {});
  assert.deepStrictEqual(r3.map(p => p.pool), rOpts.map(p => p.pool), '4-arg {} call must match 3-arg call');
});

test('opts.chain filters to that chain only (case-insensitive)', () => {
  const res = gp.curatePools(POOLS2, 'stable', 3, { chain: 'base' });
  assert.ok(res.length > 0, 'should find pools on Base');
  assert.ok(res.every(p => p.chain.toLowerCase() === 'base'), 'all results must be on Base');
});

test('opts.chain does not bypass anomaly rail', () => {
  // 'anom' pool is on Ethereum and anomalous
  const res = gp.curatePools(POOLS2, 'stable', 3, { chain: 'ethereum' });
  assert.ok(!res.some(p => p.pool === 'anom'), 'anomalous pool must not appear even with chain filter');
});

test('opts.chain does not bypass TVL floor', () => {
  const res = gp.curatePools(POOLS2, 'stable', 3, { chain: 'ethereum' });
  assert.ok(!res.some(p => p.pool === 'small'), 'sub-TVL pool must not appear even with chain filter');
});

test('opts.token matches exact symbol', () => {
  const res = gp.curatePools(POOLS2, 'stable', 5, { token: 'USDC' });
  assert.ok(res.length > 0, 'should find USDC pools');
  assert.ok(res.every(p => p.symbol.toUpperCase().indexOf('USDC') !== -1), 'all results must contain USDC');
});

test('opts.token matches LP leg (USDC-USDT contains USDC)', () => {
  const res = gp.curatePools(POOLS2, 'stable', 5, { token: 'USDC' });
  // Pool 'e' has symbol USDC-USDT — should appear since USDC is in it
  assert.ok(res.some(p => p.pool === 'e'), 'USDC-USDT LP pool should match token=USDC');
});

test('opts.token is case-insensitive', () => {
  const upper = gp.curatePools(POOLS2, 'stable', 5, { token: 'USDC' });
  const lower = gp.curatePools(POOLS2, 'stable', 5, { token: 'usdc' });
  assert.deepStrictEqual(upper.map(p => p.pool), lower.map(p => p.pool), 'token filter is case-insensitive');
});

test('opts.exclude drops specified pool ids', () => {
  const res = gp.curatePools(POOLS2, 'stable', 5, { exclude: ['a', 'b'] });
  assert.ok(!res.some(p => p.pool === 'a'), 'pool a should be excluded');
  assert.ok(!res.some(p => p.pool === 'b'), 'pool b should be excluded');
});

test('opts.chain + opts.token combined narrow correctly', () => {
  const res = gp.curatePools(POOLS2, 'stable', 3, { chain: 'base', token: 'USDC' });
  assert.ok(res.every(p => p.chain.toLowerCase() === 'base'), 'all on Base');
  assert.ok(res.every(p => p.symbol.toUpperCase().indexOf('USDC') !== -1), 'all contain USDC');
});

test('opts with no matches returns empty array (not crash)', () => {
  const res = gp.curatePools(POOLS2, 'stable', 3, { chain: 'nonexistent-chain-xyz' });
  assert.ok(Array.isArray(res), 'should return array');
  assert.strictEqual(res.length, 0, 'should be empty for unknown chain');
});

// ---------------------------------------------------------------------------
// poolAlternatives
// ---------------------------------------------------------------------------
console.log('poolAlternatives');

const POOLS3 = [
  { pool: 'a1', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 5, apyReward: 0, tvlUsd: 800000000 },
  { pool: 'a2', symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 6, apyReward: 0, tvlUsd: 200000000 },
  { pool: 'a3', symbol: 'DAI', project: 'sky', chain: 'Ethereum', apyBase: 4.5, apyReward: 0, tvlUsd: 120000000 },
  { pool: 'a4', symbol: 'USDC', project: 'morpho', chain: 'Ethereum', apyBase: 5.5, apyReward: 0, tvlUsd: 60000000 },
  { pool: 'a5', symbol: 'USDC', project: 'spark', chain: 'Ethereum', apyBase: 5.2, apyReward: 0, tvlUsd: 80000000 },
  { pool: 'anom', symbol: 'USDC', project: 'scam', chain: 'X', apyBase: 5000, apyReward: 0, tvlUsd: 100000000 },
  { pool: 'small', symbol: 'USDC', project: 'tiny', chain: 'Z', apyBase: 9, apyReward: 0, tvlUsd: 1000 }
];

test('poolAlternatives never returns an excluded id', () => {
  const alts = gp.poolAlternatives(POOLS3, 'stable', {}, ['a1', 'a2'], 5);
  assert.ok(!alts.some(p => p.pool === 'a1'), 'a1 should be excluded');
  assert.ok(!alts.some(p => p.pool === 'a2'), 'a2 should be excluded');
});

test('poolAlternatives never returns anomalous pool', () => {
  const alts = gp.poolAlternatives(POOLS3, 'stable', {}, [], 5);
  assert.ok(!alts.some(p => p.pool === 'anom'), 'anomalous pool must not appear');
});

test('poolAlternatives never returns sub-TVL pool', () => {
  const alts = gp.poolAlternatives(POOLS3, 'stable', {}, [], 5);
  assert.ok(!alts.some(p => p.pool === 'small'), 'sub-TVL pool must not appear');
});

test('poolAlternatives respects limit', () => {
  const alts = gp.poolAlternatives(POOLS3, 'stable', {}, [], 2);
  assert.ok(alts.length <= 2, 'should respect limit of 2');
});

test('poolAlternatives excludeIds=[] returns in-band pools sorted by APY', () => {
  const alts = gp.poolAlternatives(POOLS3, 'stable', {}, [], 5);
  assert.ok(alts.length > 0, 'should have results');
  for (var i = 1; i < alts.length; i++) {
    const a = (alts[i-1].apyBase || 0) + (alts[i-1].apyReward || 0);
    const b = (alts[i].apyBase || 0) + (alts[i].apyReward || 0);
    assert.ok(a >= b, 'should be sorted desc by APY at index ' + i);
  }
});

test('poolAlternatives with opts.chain filters to that chain', () => {
  const POOLS4 = POOLS3.concat([
    { pool: 'b1', symbol: 'USDC', project: 'euler', chain: 'Base', apyBase: 5.1, apyReward: 0, tvlUsd: 55000000 }
  ]);
  const alts = gp.poolAlternatives(POOLS4, 'stable', { chain: 'base' }, [], 5);
  assert.ok(alts.every(p => p.chain.toLowerCase() === 'base'), 'all alts should be on Base');
});

test('poolAlternatives returns empty array when all alternatives are excluded', () => {
  // Exclude all stable, in-band pools
  const alts = gp.poolAlternatives(POOLS3, 'stable', {}, ['a1', 'a2', 'a3', 'a4', 'a5'], 5);
  assert.ok(Array.isArray(alts), 'should return array');
  assert.strictEqual(alts.length, 0, 'should be empty');
});

// ---------------------------------------------------------------------------
// reportStats
// ---------------------------------------------------------------------------
console.log('reportStats');

// Capital path: $5000 capital, 5.5% APY, 30 days elapsed
// Expected earnedEstimate ≈ dailyYield(5000, 5.5) * 30 within $0.50 tolerance
test('capital path 30 days: earnedEstimate ≈ dailyYield*30 (within $0.50)', () => {
  const plan = {
    capital: 5000, monthly: null, fundingMode: 'capital',
    savedAt: '2026-05-15T00:00:00.000Z'
  };
  const nowIso = '2026-06-14T00:00:00.000Z'; // 30 days later
  const stats = gp.reportStats(plan, 5.5, nowIso);
  assert.strictEqual(stats.days, 30, 'days should be 30');
  const expected = gp.dailyYield(5000, 5.5) * 30;
  assert.ok(Math.abs(stats.earnedEstimate - expected) < 0.50,
    'earnedEstimate expected ~' + expected.toFixed(4) + ' got ' + stats.earnedEstimate.toFixed(4));
});

// Capital path: earnedEstimate >= 0 and is finite
test('capital path: earnedEstimate is finite and >= 0', () => {
  const plan = { capital: 10000, monthly: null, fundingMode: 'capital', savedAt: '2026-01-01T00:00:00.000Z' };
  const stats = gp.reportStats(plan, 6, '2026-06-01T00:00:00.000Z');
  assert.ok(isFinite(stats.earnedEstimate), 'earnedEstimate should be finite');
  assert.ok(stats.earnedEstimate >= 0, 'earnedEstimate should be >= 0');
  assert.ok(stats.days > 0, 'days should be > 0');
});

// Monthly path: earnedEstimate is finite and >= 0
test('monthly path: earnedEstimate is finite and >= 0', () => {
  const plan = { capital: null, monthly: 300, fundingMode: 'monthly', savedAt: '2026-01-01T00:00:00.000Z' };
  const stats = gp.reportStats(plan, 5.5, '2026-06-01T00:00:00.000Z');
  assert.ok(isFinite(stats.earnedEstimate), 'earnedEstimate should be finite');
  assert.ok(stats.earnedEstimate >= 0, 'earnedEstimate should be >= 0');
});

// Zero rate -> earnedEstimate is 0
test('zero rate returns earnedEstimate 0 (capital path)', () => {
  const plan = { capital: 5000, monthly: null, fundingMode: 'capital', savedAt: '2026-01-01T00:00:00.000Z' };
  const stats = gp.reportStats(plan, 0, '2026-06-01T00:00:00.000Z');
  assert.strictEqual(stats.earnedEstimate, 0, 'zero rate should give earnedEstimate 0');
  assert.ok(!isNaN(stats.earnedEstimate), 'earnedEstimate should not be NaN');
});

test('zero rate returns earnedEstimate 0 (monthly path)', () => {
  const plan = { capital: null, monthly: 300, fundingMode: 'monthly', savedAt: '2026-01-01T00:00:00.000Z' };
  const stats = gp.reportStats(plan, 0, '2026-06-01T00:00:00.000Z');
  assert.strictEqual(stats.earnedEstimate, 0, 'zero rate should give earnedEstimate 0');
});

// Zero capital and zero monthly -> earnedEstimate 0
test('zero capital and zero monthly returns earnedEstimate 0', () => {
  const plan = { capital: 0, monthly: 0, fundingMode: 'capital', savedAt: '2026-01-01T00:00:00.000Z' };
  const stats = gp.reportStats(plan, 5.5, '2026-06-01T00:00:00.000Z');
  assert.strictEqual(stats.earnedEstimate, 0, 'should be 0 with no capital or monthly');
  assert.ok(!isNaN(stats.earnedEstimate), 'earnedEstimate should not be NaN');
});

// Negative elapsed (nowIso earlier than savedAt) -> days 0, earnedEstimate 0
test('negative elapsed clamps to days=0 and earnedEstimate=0', () => {
  const plan = { capital: 5000, monthly: null, fundingMode: 'capital', savedAt: '2026-12-01T00:00:00.000Z' };
  const stats = gp.reportStats(plan, 5.5, '2026-06-01T00:00:00.000Z'); // now is before savedAt
  assert.strictEqual(stats.days, 0, 'days should be 0 for negative elapsed');
  assert.strictEqual(stats.earnedEstimate, 0, 'earnedEstimate should be 0 for negative elapsed');
  assert.ok(!isNaN(stats.earnedEstimate), 'earnedEstimate should not be NaN');
});

// No NaN or Infinity in any returned field
test('reportStats never returns NaN or Infinity fields', () => {
  const plan = { capital: 5000, monthly: null, fundingMode: 'capital', savedAt: '2026-05-01T00:00:00.000Z' };
  const stats = gp.reportStats(plan, 5.5, '2026-06-14T00:00:00.000Z');
  Object.keys(stats).forEach(function(k) {
    var v = stats[k];
    if (typeof v === 'number') {
      assert.ok(isFinite(v), 'field ' + k + ' should be finite, got ' + v);
      assert.ok(!isNaN(v), 'field ' + k + ' should not be NaN, got ' + v);
    }
  });
});

// months field is days/30.4375
test('months field equals days/30.4375', () => {
  const plan = { capital: 5000, monthly: null, fundingMode: 'capital', savedAt: '2026-05-15T00:00:00.000Z' };
  const nowIso = '2026-06-14T00:00:00.000Z'; // 30 days
  const stats = gp.reportStats(plan, 5.5, nowIso);
  const expectedMonths = stats.days / 30.4375;
  assert.ok(Math.abs(stats.months - expectedMonths) < 0.001, 'months should be days/30.4375');
});

console.log('\nAll ' + passed + ' assertions evaluated.');
