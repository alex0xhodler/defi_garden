/* Unit tests for the planner Sharpe near-tie-break in curatePools (spec 117.3).
   Pure Node, no network/browser. Run: node test_planner_sharpe_pick.js */
const assert = require('assert');
const gp = require('./planner.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function totalApy(p) { return (p.apyBase || 0) + (p.apyReward || 0); }
function ids(res) { return res.map((p) => p.pool); }

// Oracle: replicate the PRE-117.3 ordering (primary keys only, pure poolTotalApy
// DESC, no Sharpe) so the all-null no-op can be proved byte-identical. Mirrors
// curatePools L590-632 for the two branch shapes we exercise (else + preferTypes).
const LENDING = ['aave', 'compound', 'morpho', 'spark', 'radiant', 'euler', 'venus', 'fluid', 'kamino', 'save', 'strike'];
const STAKING = ['lido', 'rocket', 'ether.fi', 'jito', 'marinade', 'stader', 'frax', 'binance-staked', 'mantle-staked'];
function kind(p) {
  const proj = String(p.project || '').toLowerCase();
  for (const l of LENDING) if (proj.indexOf(l) !== -1) return 'lending';
  for (const s of STAKING) if (proj.indexOf(s) !== -1) return 'staking';
  return 'other';
}
function oracleOrder(pools, personaKey, limit) {
  const band = gp.PERSONAS[({ sleep: 'stable', balanced: 'rwa', bold: 'degen' }[personaKey]) || personaKey] || gp.PERSONAS.stable;
  const lim = limit == null ? 3 : limit;
  let eligible = pools.filter((p) => {
    if (!p || !p.symbol || !p.project) return false;
    const apy = totalApy(p);
    if (apy > gp.APY_SANITY_LIMIT) return false;
    if (apy <= 0) return false;
    if (apy > band.maxApy) return false;
    if ((p.tvlUsd || 0) < band.minTvl) return false;
    if (band.stableOnly && !gp.isStableSymbol(p.symbol)) return false;
    return true;
  });
  // Stable sort mirroring the old comparator (membership key, then apy desc).
  eligible = eligible.map((p, i) => ({ p, i })).sort((x, y) => {
    if (band.preferTypes) {
      const ap = band.preferTypes.indexOf(kind(x.p)) !== -1 ? 0 : 1;
      const bp = band.preferTypes.indexOf(kind(y.p)) !== -1 ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    const d = totalApy(y.p) - totalApy(x.p);
    return d !== 0 ? d : x.i - y.i; // stable tie-break by original index
  }).map((o) => o.p);
  const seen = {};
  const out = [];
  for (let i = 0; i < eligible.length && out.length < lim; i++) {
    const key = String(eligible[i].project).toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(eligible[i]);
  }
  return out;
}

console.log('117.3 Sharpe near-tie-break — ordering rules');

// Rule 1: near-equal APY, steadier (higher Sharpe) wins the near-tie.
test('near-tie APY: higher apySharpe pool comes first', () => {
  const pools = [
    { pool: 'lo', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 5.00, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: 0.5 } },
    { pool: 'hi', symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 5.05, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: 2.0 } }
  ];
  // eps = max(0.10, 0.02*5.05)=0.101; |5.05-5.00|=0.05 <= eps -> near-tie.
  const res = gp.curatePools(pools, 'bold', 3);
  assert.strictEqual(res[0].pool, 'hi', 'steadier (Sharpe 2.0) pool should lead');
  assert.strictEqual(res[1].pool, 'lo');
});

// Rule 2: materially higher APY never demoted regardless of Sharpe.
test('material APY gap: higher-APY pool leads regardless of Sharpe', () => {
  const pools = [
    { pool: 'fast', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 9.0, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: 0.1 } },
    { pool: 'steady', symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 5.0, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: 5.0 } }
  ];
  // eps = max(0.10, 0.02*9)=0.18; |9-5|=4 > eps -> Sharpe has no say.
  const res = gp.curatePools(pools, 'bold', 3);
  assert.strictEqual(res[0].pool, 'fast', 'no leapfrog on rate');
  assert.strictEqual(res[1].pool, 'steady');
});

// Rule 3: null / undefined / missing-kpis Sharpe — no crash, numeric wins near-tie, null-vs-null keeps order.
test('numeric Sharpe wins a near-tie against a null-Sharpe pool', () => {
  const pools = [
    { pool: 'nullp', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 5.02, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: null } },
    { pool: 'nump', symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 5.00, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: 1.5 } }
  ];
  const res = gp.curatePools(pools, 'bold', 3);
  assert.strictEqual(res[0].pool, 'nump', 'numeric Sharpe should win near-tie over null');
});
test('undefined / missing kpis produce no crash or NaN', () => {
  const pools = [
    { pool: 'p1', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 5.00, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: undefined } },
    { pool: 'p2', symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 5.01, apyReward: 0, tvlUsd: 500e6 }, // no kpis
    { pool: 'p3', symbol: 'DAI', project: 'sky', chain: 'Ethereum', apyBase: 4.99, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: 'NaNish' } }
  ];
  const res = gp.curatePools(pools, 'bold', 3);
  assert.strictEqual(res.length, 3);
  res.forEach((p) => assert.ok(!Number.isNaN(totalApy(p))));
  // All Sharpe non-numeric -> pure APY desc: p2(5.01), p1(5.00), p3(4.99).
  assert.deepStrictEqual(ids(res), ['p2', 'p1', 'p3']);
});
test('null-vs-null near-tie keeps prior (APY-desc, stable) order', () => {
  const pools = [
    { pool: 'x', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 5.02, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: null } },
    { pool: 'y', symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 5.00, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: null } }
  ];
  const res = gp.curatePools(pools, 'bold', 3);
  assert.deepStrictEqual(ids(res), ['x', 'y'], 'null-vs-null must not reorder');
});

// Rule 4 (load-bearing): all-null Sharpe -> byte-identical to pre-change ordering + blendedApy.
const NOOP_POOLS = [
  { pool: 'a', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 5.0, apyReward: 0, tvlUsd: 500e6, kpis: { apySharpe: null } },
  { pool: 'b', symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 6.0, apyReward: 0, tvlUsd: 300e6 },
  { pool: 'c', symbol: 'DAI', project: 'sky', chain: 'Ethereum', apyBase: 7.0, apyReward: 0, tvlUsd: 120e6, kpis: {} },
  { pool: 'd', symbol: 'USDC', project: 'morpho-blue', chain: 'Base', apyBase: 4.0, apyReward: 0, tvlUsd: 90e6, kpis: { apySharpe: undefined } },
  { pool: 'e', symbol: 'USDT', project: 'curve', chain: 'Ethereum', apyBase: 8.0, apyReward: 0, tvlUsd: 200e6 },
  { pool: 'f', symbol: 'USDC', project: 'fluid', chain: 'Ethereum', apyBase: 5.5, apyReward: 0, tvlUsd: 150e6 }
];
test('all-null no-op: else branch (bold) order + blendedApy byte-identical', () => {
  const res = gp.curatePools(NOOP_POOLS, 'bold', 3);
  const expected = oracleOrder(NOOP_POOLS, 'bold', 3);
  assert.deepStrictEqual(ids(res), ids(expected), 'else-branch order drifted from pre-change');
  assert.strictEqual(gp.blendedApy(res), gp.blendedApy(expected), 'blendedApy drifted');
});
test('all-null no-op: preferTypes branch (sleep) order + blendedApy byte-identical', () => {
  const res = gp.curatePools(NOOP_POOLS, 'sleep', 3);
  const expected = oracleOrder(NOOP_POOLS, 'sleep', 3);
  assert.deepStrictEqual(ids(res), ids(expected), 'preferTypes-branch order drifted from pre-change');
  assert.strictEqual(gp.blendedApy(res), gp.blendedApy(expected), 'blendedApy drifted');
});
test('all-null no-op holds at a larger limit too (full order)', () => {
  const res = gp.curatePools(NOOP_POOLS, 'bold', 10);
  const expected = oracleOrder(NOOP_POOLS, 'bold', 10);
  assert.deepStrictEqual(ids(res), ids(expected));
});

console.log('\n' + passed + ' passed');
