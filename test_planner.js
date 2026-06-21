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

// ---------------------------------------------------------------------------
// buildLadder — anchor (optional 4th arg)
// ---------------------------------------------------------------------------
console.log('buildLadder — anchor');

// No-anchor call must deep-equal previous 3-arg output (backward-compat guard)
test('buildLadder no-anchor 4-arg {} deep-equals 3-arg call', () => {
  const r3 = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  const r4 = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, null);
  assert.deepStrictEqual(r4, r3, '4-arg null anchorId must be identical to 3-arg call');
});

// anchor='spotify' — spotify is already cheapest, result identical to no-anchor
test('buildLadder anchor=spotify is identical to no-anchor (spotify already cheapest)', () => {
  const rBase = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  const rAnchored = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'spotify');
  assert.deepStrictEqual(rAnchored, rBase, 'anchor=spotify should not change order');
});

// anchor='claude' — order should be [claude, spotify, netflix, gym, phonebill]
test('buildLadder anchor=claude: first rung id is claude', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'claude');
  assert.strictEqual(result[0].id, 'claude', 'first rung should be claude');
});

test('buildLadder anchor=claude: remaining rungs sorted asc by monthly', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'claude');
  // After claude (monthly=20), remaining sorted asc: spotify(12), netflix(18), gym(40), phonebill(70)
  const ids = result.map(function(r) { return r.id; });
  assert.deepStrictEqual(ids, ['claude', 'spotify', 'netflix', 'gym', 'phonebill'],
    'order should be [claude, spotify, netflix, gym, phonebill], got ' + ids.join(','));
});

test('buildLadder anchor=claude: cumMonthly sequence is [20,32,50,90,160]', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'claude');
  const expected = [20, 32, 50, 90, 160];
  result.forEach(function(r, i) {
    assert.strictEqual(r.cumMonthly, expected[i],
      'cumMonthly[' + i + '] expected ' + expected[i] + ' got ' + r.cumMonthly);
  });
});

test('buildLadder anchor=claude: rung0 foreverAmt ~ foreverNumber(20, 5.5) within ±5%', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'claude');
  const expected = gp.foreverNumber(20, 5.5); // ~4364
  const pct = Math.abs(result[0].foreverAmt - expected) / expected;
  assert.ok(pct < 0.05, 'rung0 foreverAmt expected ~' + expected.toFixed(0) + ' got ' + result[0].foreverAmt.toFixed(0));
});

test('buildLadder anchor=claude: foreverAmts strictly increasing', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'claude');
  for (var i = 1; i < result.length; i++) {
    assert.ok(result[i].foreverAmt > result[i-1].foreverAmt,
      'foreverAmt not strictly increasing at index ' + i);
  }
});

test('buildLadder anchor=claude capital=5000: claude rung unlocked (5000 > ~4364), spotify rung NOT unlocked (cumMonthly=32 -> ~6982)', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, 5000, 'claude');
  assert.ok(result[0].unlocked, 'claude rung should be unlocked at $5000');
  assert.ok(!result[1].unlocked, 'spotify rung (cumMonthly=32, ~6982) should NOT be unlocked at $5000');
});

test('buildLadder anchor=claude capital=null: no rung unlocked', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'claude');
  result.forEach(function(r, i) {
    assert.ok(!r.unlocked, 'rung ' + i + ' should not be unlocked when capital=null');
  });
});

// anchor='phonebill' — rung0 is phonebill (70), rest sorted asc
test('buildLadder anchor=phonebill: first rung id is phonebill', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'phonebill');
  assert.strictEqual(result[0].id, 'phonebill', 'first rung should be phonebill');
});

test('buildLadder anchor=phonebill: cumMonthly sequence starts at 70', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'phonebill');
  assert.strictEqual(result[0].cumMonthly, 70, 'rung0 cumMonthly should be 70');
});

// Unknown anchorId falls back to normal sort (no crash)
test('buildLadder unknown anchorId falls back to normal ascending sort (no crash)', () => {
  const result = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null, 'unknown-id-xyz');
  const base = gp.buildLadder(SUBSCRIPTION_LADDER, 5.5, null);
  assert.deepStrictEqual(result, base, 'unknown anchor should produce same result as no-anchor');
});

// ---------------------------------------------------------------------------
// coveredBundle
// ---------------------------------------------------------------------------
console.log('coveredBundle');

// anchor='spotify', apy=5.5 (standard illustrative rate in codebase)
// spotify rung cumMonthly=12  foreverAmt ~ 2618
// netflix rung cumMonthly=30  foreverAmt ~ 6545
// claude  rung cumMonthly=50  foreverAmt ~ 10909
// gym     rung cumMonthly=90  foreverAmt ~ 19636
// phonebill rung cumMonthly=160 foreverAmt ~ 34909

test('coveredBundle capital=2700 anchor=spotify: covered=[spotify], surplus~82, nextRung=amazonprime', function () {
  // New ladder: spotify(12) cumForever~2618; amazonprime(27) cumForever~5891
  var b = gp.coveredBundle(2700, 5.5, 'spotify');
  assert.strictEqual(b.coveredCount, 1, 'coveredCount should be 1');
  assert.strictEqual(b.covered[0].id, 'spotify', 'first covered should be spotify');
  assert.strictEqual(b.combinedMonthly, 12, 'combinedMonthly should be 12');
  assert.ok(b.surplus >= 0, 'surplus should be >= 0');
  assert.ok(b.nextRung && b.nextRung.id === 'amazonprime', 'nextRung should be amazonprime');
  assert.ok(b.nextPct > 0 && b.nextPct <= 100, 'nextPct should be in 0..100');
});

test('coveredBundle capital=11300 anchor=spotify: covered ids=[spotify,amazonprime,netflix], combinedMonthly=45', function () {
  // New ladder sorted: spotify(12)~2618, amazonprime(27)~5891, netflix(45)~9818, claude/chatgpt(65/85)~14182/18545
  // 11300 >= 2618, >= 5891, >= 9818, < 14182 -> covered=[spotify,amazonprime,netflix], combinedMonthly=45
  var b = gp.coveredBundle(11300, 5.5, 'spotify');
  var ids = b.covered.map(function (r) { return r.id; });
  assert.ok(ids.indexOf('spotify') !== -1, 'spotify should be covered');
  assert.ok(ids.indexOf('amazonprime') !== -1, 'amazonprime should be covered');
  assert.ok(ids.indexOf('netflix') !== -1, 'netflix should be covered');
  assert.strictEqual(b.combinedMonthly, 45, 'combinedMonthly for spotify+amazonprime+netflix should be 45');
  assert.ok(b.nextRung && b.nextRung.id === 'claude', 'nextRung should be claude');
});

test('coveredBundle capital=1500 anchor=spotify: coveredCount=0, combinedForever=0, nextRung=spotify', function () {
  var b = gp.coveredBundle(1500, 5.5, 'spotify');
  assert.strictEqual(b.coveredCount, 0, 'coveredCount should be 0');
  assert.strictEqual(b.combinedForever, 0, 'combinedForever should be 0');
  assert.ok(b.nextRung && b.nextRung.id === 'spotify', 'nextRung should be spotify');
  var expectedPct = Math.round(1500 / b.nextRung.foreverAmt * 100);
  assert.strictEqual(b.nextPct, Math.min(100, expectedPct), 'nextPct should match');
});

test('coveredBundle capital=8000 anchor=spotify: covered=[spotify,amazonprime], surplus>0, nextRung=netflix', function () {
  // New ladder: spotify(12)~2618, amazonprime(27)~5891, netflix(45)~9818
  // 8000 >= 2618, >= 5891, < 9818 -> covered=[spotify,amazonprime], nextRung=netflix
  var b = gp.coveredBundle(8000, 5.5, 'spotify');
  var ids = b.covered.map(function (r) { return r.id; });
  assert.ok(ids.indexOf('spotify') !== -1, 'spotify should be covered');
  assert.ok(ids.indexOf('amazonprime') !== -1, 'amazonprime should be covered');
  assert.ok(ids.indexOf('netflix') === -1, 'netflix should NOT be covered');
  assert.ok(b.surplus > 0, 'surplus should be > 0 when capital between tiers');
  assert.ok(b.nextRung && b.nextRung.id === 'netflix', 'nextRung should be netflix');
});

test('coveredBundle anchor=claude capital=4600: covered=[claude], combinedMonthly=20', function () {
  var b = gp.coveredBundle(4600, 5.5, 'claude');
  // With anchor=claude, rung0 is claude (monthly=20, cumMonthly=20)
  // foreverNumber(20, 5.5) = (20*12)/0.055 ~ 4364 — 4600 should unlock it
  assert.ok(b.coveredCount >= 1, 'should have at least 1 covered rung');
  assert.strictEqual(b.covered[0].id, 'claude', 'first covered should be claude');
});

test('coveredBundle apy=0: no NaN/Infinity in output', function () {
  var b = gp.coveredBundle(5000, 0, 'spotify');
  assert.ok(!isNaN(b.coveredCount), 'coveredCount not NaN');
  assert.ok(!isNaN(b.combinedMonthly), 'combinedMonthly not NaN');
  assert.ok(!isNaN(b.surplus), 'surplus not NaN');
  assert.ok(isFinite(b.coveredCount), 'coveredCount finite');
  assert.ok(isFinite(b.surplus), 'surplus finite');
  assert.strictEqual(b.coveredCount, 0, 'apy=0 means infinite forever numbers — nothing unlocked');
});

test('coveredBundle capital=0: coveredCount=0, no NaN', function () {
  var b = gp.coveredBundle(0, 5.3, 'spotify');
  assert.strictEqual(b.coveredCount, 0, 'coveredCount should be 0');
  assert.ok(!isNaN(b.surplus), 'surplus not NaN');
  assert.strictEqual(b.surplus, 0, 'surplus should be 0');
});

test('coveredBundle nextPct clamped to 100 max', function () {
  // capital exactly at tier boundary should give nextPct <= 100
  var b = gp.coveredBundle(100000, 5.3, 'spotify');
  assert.ok(b.nextPct === null || b.nextPct <= 100, 'nextPct should be clamped to 100 or null');
});

test('coveredBundle fields present: covered, coveredCount, combinedMonthly, combinedForever, surplus, nextRung, nextPct', function () {
  var b = gp.coveredBundle(5000, 5.3, 'spotify');
  assert.ok('covered' in b, 'missing covered');
  assert.ok('coveredCount' in b, 'missing coveredCount');
  assert.ok('combinedMonthly' in b, 'missing combinedMonthly');
  assert.ok('combinedForever' in b, 'missing combinedForever');
  assert.ok('surplus' in b, 'missing surplus');
  assert.ok('nextRung' in b, 'missing nextRung');
  assert.ok('nextPct' in b, 'missing nextPct');
});

// ---------------------------------------------------------------------------
// joinBundle
// ---------------------------------------------------------------------------
console.log('joinBundle');

test('joinBundle 1 label: returns the label directly', function () {
  assert.strictEqual(gp.joinBundle(['Spotify']), 'Spotify');
});

test('joinBundle 2 labels: "Spotify + Netflix"', function () {
  assert.strictEqual(gp.joinBundle(['Spotify', 'Netflix']), 'Spotify + Netflix');
});

test('joinBundle 3 labels: "Spotify, Netflix + Claude Pro"', function () {
  assert.strictEqual(gp.joinBundle(['Spotify', 'Netflix', 'Claude Pro']), 'Spotify, Netflix + Claude Pro');
});

test('joinBundle 5 labels: first 3 + "2 more"', function () {
  var result = gp.joinBundle(['Spotify', 'Netflix', 'Claude Pro', 'Gym', 'Phone bill']);
  assert.ok(result.indexOf('Spotify') !== -1, 'should include Spotify');
  assert.ok(result.indexOf('2 more') !== -1, 'should say 2 more');
});

test('joinBundle empty array: returns empty string', function () {
  assert.strictEqual(gp.joinBundle([]), '');
});

// ---------------------------------------------------------------------------
// subscriptionLadder
// ---------------------------------------------------------------------------
console.log('subscriptionLadder');

// disney is NOT in SUBSCRIPTION_LADDER (which has spotify/netflix/claude/gym/phonebill)
test('subscriptionLadder(disney): first item id is disney', function () {
  var ladder = gp.subscriptionLadder('disney');
  assert.strictEqual(ladder[0].id, 'disney', 'first item should be disney');
});

test('subscriptionLadder(disney): length is SUBSCRIPTION_LADDER.length + 1', function () {
  var base = gp.SUBSCRIPTION_LADDER;
  var ladder = gp.subscriptionLadder('disney');
  assert.strictEqual(ladder.length, base.length + 1, 'should have base+1 items');
});

test('subscriptionLadder(disney): contains all everyday-set ids', function () {
  var ladder = gp.subscriptionLadder('disney');
  var ids = ladder.map(function (x) { return x.id; });
  ['spotify', 'netflix', 'claude', 'chatgpt', 'amazonprime'].forEach(function (id) {
    assert.ok(ids.indexOf(id) !== -1, id + ' should be in ladder');
  });
});

test('subscriptionLadder(disney): each item has monthly field', function () {
  var ladder = gp.subscriptionLadder('disney');
  ladder.forEach(function (item) {
    assert.ok(typeof item.monthly === 'number' && item.monthly > 0, 'item ' + item.id + ' missing monthly');
  });
});

test('subscriptionLadder(netflix): identical to SUBSCRIPTION_LADDER (already in base)', function () {
  var base = gp.SUBSCRIPTION_LADDER;
  var ladder = gp.subscriptionLadder('netflix');
  assert.deepStrictEqual(ladder, base, 'netflix ladder should equal SUBSCRIPTION_LADDER');
});

test('subscriptionLadder(null): identical to SUBSCRIPTION_LADDER', function () {
  var base = gp.SUBSCRIPTION_LADDER;
  var ladder = gp.subscriptionLadder(null);
  assert.deepStrictEqual(ladder, base, 'null ladder should equal SUBSCRIPTION_LADDER');
});

test('subscriptionLadder(undefined): identical to SUBSCRIPTION_LADDER', function () {
  var base = gp.SUBSCRIPTION_LADDER;
  var ladder = gp.subscriptionLadder(undefined);
  assert.deepStrictEqual(ladder, base, 'undefined ladder should equal SUBSCRIPTION_LADDER');
});

test('subscriptionLadder(unknown-xyz): identical to SUBSCRIPTION_LADDER', function () {
  var base = gp.SUBSCRIPTION_LADDER;
  var ladder = gp.subscriptionLadder('unknown-xyz');
  assert.deepStrictEqual(ladder, base, 'unknown id ladder should equal SUBSCRIPTION_LADDER');
});

test('subscriptionLadder(spotify): identical to SUBSCRIPTION_LADDER (already in base)', function () {
  var base = gp.SUBSCRIPTION_LADDER;
  var ladder = gp.subscriptionLadder('spotify');
  assert.deepStrictEqual(ladder, base, 'spotify ladder should equal SUBSCRIPTION_LADDER');
});

test('subscriptionLadder(disney): disney item has monthly=16', function () {
  var ladder = gp.subscriptionLadder('disney');
  assert.strictEqual(ladder[0].monthly, 16, 'disney monthly should be 16');
});

// ---------------------------------------------------------------------------
// coveredBundle with non-ladder anchor (disney)
// ---------------------------------------------------------------------------
console.log('coveredBundle with non-ladder anchor');

// disney monthly=16, apy=5.3
// foreverNumber(16, 5.3) = (16*12)/0.053 ~ 3622
// subscriptionLadder('disney') = [{id:'disney',monthly:16}, ...SUBSCRIPTION_LADDER]
// buildLadder with anchor='disney': rung0 cumMonthly=16, foreverAmt~3622

test('coveredBundle(disneyForever, 5.3, disney): covered[0].id===disney', function () {
  var disneyMonthly = 16;
  var apy = 5.3;
  var fn = gp.foreverNumber(disneyMonthly, apy);
  var capital = Math.ceil(fn);
  var b = gp.coveredBundle(capital, apy, 'disney');
  assert.ok(b.coveredCount >= 1, 'should have at least 1 covered rung');
  assert.strictEqual(b.covered[0].id, 'disney', 'first covered rung should be disney');
});

test('coveredBundle(belowDisney, 5.3, disney): coveredCount=0, nextRung.id===disney', function () {
  var disneyMonthly = 16;
  var apy = 5.3;
  var fn = gp.foreverNumber(disneyMonthly, apy);
  var capital = Math.floor(fn) - 1; // just below
  var b = gp.coveredBundle(capital, apy, 'disney');
  assert.strictEqual(b.coveredCount, 0, 'coveredCount should be 0 below disney threshold');
  assert.ok(b.nextRung && b.nextRung.id === 'disney', 'nextRung should be disney');
});

test('coveredBundle(0, 5.3, disney): coveredCount=0, nextRung.id===disney', function () {
  var b = gp.coveredBundle(0, 5.3, 'disney');
  assert.strictEqual(b.coveredCount, 0);
  assert.ok(b.nextRung && b.nextRung.id === 'disney', 'nextRung should be disney');
});

// ---------------------------------------------------------------------------
// mixStats
// ---------------------------------------------------------------------------
console.log('mixStats');

test('mixStats([spotify,claude], 5.5): combinedMonthly=32', function () {
  var s = gp.mixStats(['spotify', 'claude'], 5.5);
  assert.strictEqual(s.combinedMonthly, 32, 'combinedMonthly should be 32');
});

test('mixStats([spotify,claude], 5.5): neededCapital is finite, multiple of 100, equals ceil(foreverNumber(32,5.5)/100)*100', function () {
  var s = gp.mixStats(['spotify', 'claude'], 5.5);
  var expected = Math.ceil(gp.foreverNumber(32, 5.5) / 100) * 100;
  assert.ok(isFinite(s.neededCapital), 'neededCapital should be finite');
  assert.ok(!isNaN(s.neededCapital), 'neededCapital should not be NaN');
  assert.strictEqual(s.neededCapital % 100, 0, 'neededCapital should be multiple of 100');
  assert.strictEqual(s.neededCapital, expected, 'neededCapital should equal ceil(foreverNumber(32,5.5)/100)*100');
});

test('mixStats([spotify], 5.5): combinedMonthly=12', function () {
  var s = gp.mixStats(['spotify'], 5.5);
  assert.strictEqual(s.combinedMonthly, 12, 'combinedMonthly should be 12');
});

test('mixStats([amazonprime,chatgpt], 5.5): combinedMonthly=35', function () {
  var s = gp.mixStats(['amazonprime', 'chatgpt'], 5.5);
  assert.strictEqual(s.combinedMonthly, 35, 'combinedMonthly should be 35 (15+20)');
});

test('mixStats([], 5.5): count=0, combinedMonthly=0, neededCapital=0', function () {
  var s = gp.mixStats([], 5.5);
  assert.strictEqual(s.count, 0, 'count should be 0');
  assert.strictEqual(s.combinedMonthly, 0, 'combinedMonthly should be 0');
  assert.strictEqual(s.neededCapital, 0, 'neededCapital should be 0');
});

test('mixStats([spotify,claude], 0): neededCapital=0, no NaN/Infinity', function () {
  var s = gp.mixStats(['spotify', 'claude'], 0);
  assert.strictEqual(s.neededCapital, 0, 'neededCapital should be 0 when apy=0');
  assert.ok(!isNaN(s.neededCapital), 'neededCapital should not be NaN');
  assert.ok(isFinite(s.neededCapital), 'neededCapital should be finite');
});

test('mixStats([spotify,bogus], 5.5): ignores bogus, combinedMonthly=12, count=1', function () {
  var s = gp.mixStats(['spotify', 'bogus'], 5.5);
  assert.strictEqual(s.combinedMonthly, 12, 'combinedMonthly should be 12 ignoring bogus');
  assert.strictEqual(s.count, 1, 'count should be 1 ignoring bogus');
  assert.ok(s.ids.indexOf('bogus') === -1, 'bogus should not be in ids');
});

test('mixStats([disney], 5.5): combinedMonthly=16 (via GOALS target)', function () {
  var s = gp.mixStats(['disney'], 5.5);
  assert.strictEqual(s.combinedMonthly, 16, 'disney monthly via goalById target should be 16');
  assert.strictEqual(s.count, 1, 'count should be 1');
  assert.ok(s.ids.indexOf('disney') !== -1, 'ids should contain disney');
});

test('mixStats ids field contains only resolved ids', function () {
  var s = gp.mixStats(['spotify', 'bogus', 'claude'], 5.5);
  assert.deepStrictEqual(s.ids.sort(), ['claude', 'spotify'], 'ids should only contain resolved ids');
});

// ---------------------------------------------------------------------------
// disciplinedSpeedup
// ---------------------------------------------------------------------------
console.log('disciplinedSpeedup');

test('adding monthly principal reaches target sooner than lump-sum yield alone', function () {
  var r = gp.disciplinedSpeedup({ capital: 10000, monthly: 50, annualRatePct: 6, target: 1100 });
  assert.ok(r.baseMonths != null && r.disciplinedMonths != null, 'both months should be defined');
  assert.ok(r.disciplinedMonths < r.baseMonths, 'disciplined should be faster than lump-sum alone');
  assert.strictEqual(r.monthsSooner, r.baseMonths - r.disciplinedMonths, 'monthsSooner = base - disciplined');
  assert.ok(r.monthsSooner > 0, 'monthsSooner should be positive');
});

test('zero monthly => no speedup, disciplined equals base', function () {
  var r = gp.disciplinedSpeedup({ capital: 10000, monthly: 0, annualRatePct: 6, target: 1100 });
  assert.strictEqual(r.monthsSooner, 0, 'monthsSooner should be 0 with no monthly');
  assert.strictEqual(r.disciplinedMonths, r.baseMonths, 'disciplined should equal base with no monthly');
});

test('baseMonths matches monthsUntilYieldCoversTarget', function () {
  var r = gp.disciplinedSpeedup({ capital: 10000, monthly: 50, annualRatePct: 6, target: 1100 });
  assert.strictEqual(r.baseMonths, gp.monthsUntilYieldCoversTarget(10000, 6, 1100), 'baseMonths should match monthsUntilYieldCoversTarget');
});

test('high monthly + zero rate still finite (pure principal)', function () {
  var r = gp.disciplinedSpeedup({ capital: 0, monthly: 100, annualRatePct: 0, target: 1100 });
  assert.strictEqual(r.disciplinedMonths, 11, '100*11=1100, so disciplinedMonths=11');
});

test('zero target => monthsSooner 0', function () {
  var r = gp.disciplinedSpeedup({ capital: 1000, monthly: 50, annualRatePct: 6, target: 0 });
  assert.strictEqual(r.monthsSooner, 0, 'zero target should give 0 monthsSooner');
});

// ---------------------------------------------------------------------------
// New goals taxonomy (requires GOALS + goalArchetype exports)
// ---------------------------------------------------------------------------
console.log('new goals — taxonomy');

function findGoal (id) { return (gp.GOALS || []).filter(function (g) { return g.id === id; })[0]; }

test('rent goal exists', function () {
  var g = findGoal('rent');
  assert.ok(g, 'rent goal should exist in GOALS');
});

test('rent is subscription archetype, bills category, isMonthly', function () {
  var g = findGoal('rent');
  assert.ok(g, 'rent goal should exist');
  assert.strictEqual(g.archetype, 'subscription', 'rent archetype should be subscription');
  assert.strictEqual(g.category, 'bills', 'rent category should be bills');
  assert.strictEqual(g.isMonthly, true, 'rent isMonthly should be true');
  assert.ok(g.target > 0, 'rent target should be > 0');
});

test('phonebill is subscription archetype, bills category', function () {
  var g = findGoal('phonebill');
  assert.ok(g, 'phonebill goal should exist');
  assert.strictEqual(g.archetype, 'subscription', 'phonebill archetype should be subscription');
  assert.strictEqual(g.category, 'bills', 'phonebill category should be bills');
  assert.strictEqual(g.isMonthly, true, 'phonebill isMonthly should be true');
  assert.ok(g.target > 0, 'phonebill target should be > 0');
});

test('watches is target archetype, gadget category, has price', function () {
  var g = findGoal('watches');
  assert.ok(g, 'watches goal should exist');
  assert.strictEqual(g.archetype, 'target', 'watches archetype should be target');
  assert.strictEqual(g.category, 'gadget', 'watches category should be gadget');
  assert.ok(g.target > 0, 'watches target should be > 0');
});

test('goalArchetype helper agrees for new goals', function () {
  assert.strictEqual(gp.goalArchetype('rent'), 'subscription', 'goalArchetype(rent) should be subscription');
  assert.strictEqual(gp.goalArchetype('phonebill'), 'subscription', 'goalArchetype(phonebill) should be subscription');
  assert.strictEqual(gp.goalArchetype('watches'), 'target', 'goalArchetype(watches) should be target');
});

// ---------------------------------------------------------------------------
// matchGoalFromText — new keywords
// ---------------------------------------------------------------------------
console.log('matchGoalFromText — new keywords');

test('rent -> rent', function () {
  assert.strictEqual(gp.matchGoalFromText('saving for rent'), 'rent');
});

test('watch -> watches', function () {
  assert.strictEqual(gp.matchGoalFromText('I want a nice watch'), 'watches');
});

test('phone bill -> phonebill (not iphone) [keyword-ordering guard]', function () {
  assert.strictEqual(gp.matchGoalFromText('cover my phone bill'), 'phonebill');
});

test('iphone still -> iphone', function () {
  assert.strictEqual(gp.matchGoalFromText('new iphone'), 'iphone');
});

test('korean 월세 -> rent', function () {
  assert.strictEqual(gp.matchGoalFromText('월세 내기'), 'rent');
});

test('korean 시계 -> watches', function () {
  assert.strictEqual(gp.matchGoalFromText('고급 시계 사고 싶어'), 'watches');
});

// ---------------------------------------------------------------------------
// translations — personaProj and monthlyChipHint keys (Proposals 3 & 4)
// ---------------------------------------------------------------------------
const { translations: tr2 } = require('./translations.js');
const enP2 = tr2.en.planner;
const koP2 = tr2.ko.planner;

console.log('\ntranslations: personaProj');
test('personaProj exists in EN as a function', function () {
  assert.strictEqual(typeof enP2.personaProj, 'function');
});
test('personaProj EN: contains amount, years, apy', function () {
  const s = enP2.personaProj('$16k', 5, '5.4');
  assert.ok(s.includes('$16k'), 'missing amount: ' + s);
  assert.ok(s.includes('5'), 'missing years: ' + s);
  assert.ok(s.includes('5.4'), 'missing apy: ' + s);
});
test('personaProj KO: exists as a function', function () {
  assert.strictEqual(typeof koP2.personaProj, 'function');
});
test('personaProj KO: contains amount', function () {
  const s = koP2.personaProj('$16k', 5, '5.4');
  assert.ok(s.includes('$16k'), 'missing amount in KO: ' + s);
});
test('personaProj KO: different string from EN', function () {
  const en = enP2.personaProj('$16k', 5, '5.4');
  const ko = koP2.personaProj('$16k', 5, '5.4');
  assert.notStrictEqual(en, ko, 'KO should differ from EN');
});

console.log('\ntranslations: monthlyChipHint');
test('monthlyChipHint exists in EN as a function', function () {
  assert.strictEqual(typeof enP2.monthlyChipHint, 'function');
});
test('monthlyChipHint EN: contains amount and years', function () {
  const s = enP2.monthlyChipHint('$16k', 5);
  assert.ok(s.includes('$16k'), 'missing amount: ' + s);
  assert.ok(s.includes('5'), 'missing years: ' + s);
});
test('monthlyChipHint KO: exists as a function', function () {
  assert.strictEqual(typeof koP2.monthlyChipHint, 'function');
});
test('monthlyChipHint KO: contains amount', function () {
  const s = koP2.monthlyChipHint('$16k', 5);
  assert.ok(s.includes('$16k'), 'missing amount in KO: ' + s);
});

console.log('\nAll ' + passed + ' assertions evaluated.');
