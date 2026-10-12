/* Unit gate for generate-stocks-snapshot.js — the /stocks terminal's data slice,
   plus integrity checks on data/stocks-registry.json and the committed
   data/stocks-snapshot.json. Pure: no network.
   Run: node test_stocks_snapshot.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gen = require('./generate-stocks-snapshot');
const { buildStocksSnapshot, headlineApy, honestProjection, tierFor } = gen;

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MSTRC = '0xb2000000000000000000004884b426556b92883d';
const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';

const registry = {
  tokens: {
    ['Base:' + MSTRC]: { symbol: 'MSTRC', underlying: 'MSTR', assetClass: 'equity', issuer: 'unverified', issuerBasis: 'address-prefix', chain: 'Base', address: MSTRC },
    ['Solana:' + NVDAX]: { symbol: 'NVDAX', underlying: 'NVDA', assetClass: 'equity', issuer: 'xStocks (Backed)', issuerBasis: 'poolMeta', chain: 'Solana', address: NVDAX }
  }
};

function pool(over) {
  return Object.assign({
    pool: 'p-' + Math.random().toString(36).slice(2), chain: 'Base', project: 'aerodrome-slipstream', symbol: 'USDC-MSTRC',
    tvlUsd: 1700045, apyBase: 47.72533, apyReward: 253.26485, apyMean30d: 100, poolMeta: 'CL10 - 0.05%',
    exposure: 'multi', ilRisk: 'yes', underlyingTokens: [USDC_BASE, MSTRC],
    forecast: { horizonDays: 14, p10: 43.06, p50: 1651.98, p90: 3896.8 },
    defiScore: { score: 51.5, rating: 'BBB', breakdown: { stability: 10, sustainability: 16.6, stickiness: 21.2, liquidity: 3.6 } }
  }, over || {});
}
const build = pools => buildStocksSnapshot({ generatedAt: '2026-10-11T08:18:18.526Z', pools: pools }, registry, { generatedAt: '2026-10-12T00:00:00.000Z' });

check('headline = apyBase + apyReward, nulls as 0, 2dp', () => {
  assert.strictEqual(headlineApy({ apyBase: 3.1, apyReward: 0.456 }), 3.56);
  assert.strictEqual(headlineApy({ apyBase: null, apyReward: null }), 0);
  assert.strictEqual(headlineApy({ apyBase: 4 }), 4);
});

check('MSTRC-like case: 47.7 + 253.3 -> projection 216.57, below 301 headline', () => {
  const out = build([pool()]);
  const p = out.pools[0];
  assert.strictEqual(p.headlineApy, 300.99);
  assert.strictEqual(p.honestProjection, 216.57);
  assert.ok(p.honestProjection <= p.headlineApy);
});

check('haircut projection never exceeds the headline (grid incl. nulls, zeros, negatives)', () => {
  const vals = [null, 0, 0.01, 1, 3.3, 10.8, 47.7, 100, 253.3, 499.99, -2];
  vals.forEach(b => vals.forEach(r => {
    const p = { apyBase: b, apyReward: r };
    assert.ok(honestProjection(p) <= Math.max(0, headlineApy(p)) + 1e-9, 'base=' + b + ' reward=' + r);
    assert.ok(honestProjection(p) >= 0);
    assert.ok(Number.isFinite(honestProjection(p)));
  }));
});

check('pure-base pools (reward 0) project at the headline; the haircut only bites emissions', () => {
  assert.strictEqual(honestProjection({ apyBase: 10.8, apyReward: 0 }), 10.8);
  assert.strictEqual(honestProjection({ apyBase: 10, apyReward: 30 }), 30);
});

check('forecast band passes through labelled experimental and may exceed headline without changing the projection', () => {
  const p = build([pool()]).pools[0];
  assert.strictEqual(p.forecastBand.label, 'experimental');
  assert.strictEqual(p.forecastBand.p50, 1651.98);
  assert.ok(p.flags.indexOf('forecastAboveHeadline') >= 0);
  assert.ok(p.honestProjection <= p.headlineApy);
});

check('forecast band is null when absent or non-finite', () => {
  assert.strictEqual(build([pool({ forecast: null })]).pools[0].forecastBand, null);
  assert.strictEqual(build([pool({ forecast: { p10: 1, p50: NaN, p90: 3 } })]).pools[0].forecastBand, null);
});

check('headline above the 500% equity cap is excluded and counted, never listed', () => {
  const out = build([pool({ apyBase: 100, apyReward: 400.01 }), pool({ apyBase: 100, apyReward: 400 })]);
  assert.strictEqual(out.pools.length, 1);
  assert.strictEqual(out.pools[0].headlineApy, 500);
  assert.strictEqual(out.excluded.length, 1);
  assert.strictEqual(out.excluded[0].reason, 'apy-above-cap');
  assert.strictEqual(out.counts.excludedByReason['apy-above-cap'], 1);
});

check('tier boundaries: <100K none, 100K-500K=3, 500K-2M=2, >=2M=1', () => {
  [[99999, null], [100000, 3], [499999.99, 3], [500000, 2], [1999999, 2], [2000000, 1], [5e9, 1], [NaN, null]].forEach(([tvl, tier]) => {
    assert.strictEqual(tierFor(tvl), tier, 'tvl ' + tvl);
  });
});

check('pools under the $100K floor are excluded; tier-3 pools are flagged thinLiquidity', () => {
  const out = build([pool({ tvlUsd: 99999 }), pool({ tvlUsd: 100000 }), pool({ tvlUsd: 2000000 })]);
  assert.deepStrictEqual(out.pools.map(p => p.tier), [1, 3]);
  assert.ok(out.pools[1].flags.indexOf('thinLiquidity') >= 0);
  assert.ok(out.pools[0].flags.indexOf('thinLiquidity') < 0);
  assert.strictEqual(out.excluded[0].reason, 'below-tvl-floor');
});

check('memecoin lookalikes are never matched (address-only matching, no ticker substring)', () => {
  const fart = pool({ symbol: 'WSOL-FARTCOIN', chain: 'Solana', project: 'raydium-amm', underlyingTokens: ['So11111111111111111111111111111111111111112', '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump'] });
  const pepe = pool({ symbol: 'PEPECOIN-WETH', chain: 'Ethereum', underlyingTokens: ['0xa9e8acf069c58aec8825542845fd754e41a9489a', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'] });
  const coin = pool({ symbol: 'USDC-COINBASE-CLONE', underlyingTokens: [USDC_BASE, '0xdeadbeef00000000000000000000000000000000'] });
  const out = build([fart, pepe, coin]);
  assert.strictEqual(out.pools.length, 0);
  assert.strictEqual(out.excluded.length, 0);
});

check('EVM addresses match case-insensitively; Solana base58 is case-exact', () => {
  const evm = build([pool({ underlyingTokens: [USDC_BASE.toUpperCase().replace('0X', '0x'), MSTRC.toUpperCase().replace('0X', '0x')] })]);
  assert.strictEqual(evm.pools.length, 1);
  const sol = pool({ chain: 'Solana', project: 'raydium-amm', symbol: 'NVDAX-USDC', poolMeta: 'Concentrated - 0.1%', underlyingTokens: [NVDAX, USDC_SOL] });
  assert.strictEqual(build([sol]).pools.length, 1);
  const lowered = pool({ chain: 'Solana', project: 'raydium-amm', symbol: 'NVDAX-USDC', underlyingTokens: [NVDAX.toLowerCase(), USDC_SOL] });
  assert.strictEqual(build([lowered]).pools.length, 0);
});

check('multi-exposure pools are forced High IL; single-exposure lending is not', () => {
  const lp = build([pool({ ilRisk: 'no' })]).pools[0];
  assert.strictEqual(lp.ilRisk, 'high');
  assert.ok(lp.flags.indexOf('forcedHighIL') >= 0);
  const lend = build([pool({ chain: 'Solana', project: 'kamino-lend', symbol: 'NVDAX', poolMeta: 'xStocks Market', exposure: 'single', ilRisk: 'no', apyBase: 0, apyReward: null, underlyingTokens: [NVDAX] })]).pools[0];
  assert.strictEqual(lend.ilRisk, 'no');
  assert.strictEqual(lend.poolType, 'lending');
  assert.ok(lend.flags.indexOf('nearZeroYield') >= 0);
  assert.strictEqual(lend.heuristicClip.depthFactor, 0.05);
});

check('heuristic clip = TVL x factor (CL 0.005, AMM 0.0025, lending 0.05), labelled estimate', () => {
  const cl = build([pool({ tvlUsd: 1700045 })]).pools[0];
  assert.deepStrictEqual(cl.heuristicClip, { usd: 8500, method: 'tvl-heuristic', depthFactor: 0.005, estimate: true });
  const amm = build([pool({ project: 'raydium-amm', chain: 'Solana', symbol: 'NVDAX-USDC', poolMeta: 'Standard - 0.25%', underlyingTokens: [NVDAX, USDC_SOL], tvlUsd: 1000000 })]).pools[0];
  assert.strictEqual(amm.poolType, 'amm');
  assert.strictEqual(amm.heuristicClip.usd, 2500);
});

check('vault wrappers and unrecognised counterparties are excluded with a reason', () => {
  const vault = pool({ project: 'beefy', symbol: 'MSTR-USDC', underlyingTokens: [MSTRC, USDC_BASE] });
  const memeQuote = pool({ symbol: 'MSTRC-BLUECHIP', underlyingTokens: [MSTRC, '0xb200000000000000000000cfbdf64a8706a94a01'] });
  const out = build([vault, memeQuote]);
  assert.strictEqual(out.pools.length, 0);
  assert.deepStrictEqual(out.excluded.map(e => e.reason).sort(), ['unrecognized-counterparty', 'vault-wrapper']);
});

check('defiScore passes through unchanged; onchain hints carry chain, tokens, AMM type, tick spacing', () => {
  const src = pool();
  const p = build([src]).pools[0];
  assert.deepStrictEqual(p.defiScore, src.defiScore);
  assert.strictEqual(p.onchain.chain, 'Base');
  assert.strictEqual(p.onchain.chainId, 8453);
  assert.strictEqual(p.onchain.ammType, 'slipstream-cl');
  assert.strictEqual(p.onchain.tickSpacing, 10);
  assert.strictEqual(p.onchain.feeTierPct, 0.05);
  assert.strictEqual(p.onchain.poolAddress, null);
  assert.deepStrictEqual(p.onchain.tokens.map(t => t.role), ['stable', 'equity']);
});

check('output is deterministic and sorted by TVL desc', () => {
  const a = pool({ pool: 'a', tvlUsd: 300000 }), b = pool({ pool: 'b', tvlUsd: 900000 }), c = pool({ pool: 'c', tvlUsd: 900000 });
  const o1 = build([a, b, c]), o2 = build([c, a, b]);
  assert.strictEqual(JSON.stringify(o1), JSON.stringify(o2));
  assert.deepStrictEqual(o1.pools.map(p => p.pool), ['b', 'c', 'a']);
});

// ---- integrity of the committed data (skipped if a file is absent) ----
function walk(v, visit, trail) {
  visit(v, trail);
  if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], visit, trail + '.' + k));
}
const registryPath = path.join(__dirname, 'data', 'stocks-registry.json');
const snapshotPath = path.join(__dirname, 'data', 'pools-snapshot.json');
const outputPath = path.join(__dirname, 'data', 'stocks-snapshot.json');

if (fs.existsSync(registryPath)) {
  const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  check('registry: keys are chain:address, EVM addresses lowercase, issuer verified or "unverified"', () => {
    Object.keys(reg.tokens).forEach(k => {
      const t = reg.tokens[k];
      assert.strictEqual(k, t.chain + ':' + t.address);
      if (t.chain !== 'Solana') assert.strictEqual(t.address, t.address.toLowerCase(), k);
      assert.ok(t.symbol && t.underlying && t.issuer && t.issuerBasis, k);
      if (t.issuer === 'unverified') assert.ok(t.issuerHint, k + ' unverified issuer needs a hint');
    });
  });
  check('registry: no memecoin-lookalike symbol is listed as a token', () => {
    const bad = /FARTCOIN|PEPECOIN|BITCOIN|TONCOIN|BOTCOIN|STONK/i;
    Object.keys(reg.tokens).forEach(k => assert.ok(!bad.test(reg.tokens[k].symbol), k));
  });
  if (fs.existsSync(snapshotPath)) {
    const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    check('registry: every token address is justified by an underlyingTokens entry in the pools snapshot', () => {
      const seen = new Set();
      snap.pools.forEach(p => (p.underlyingTokens || []).forEach(a => seen.add(p.chain + ':' + gen.normalizeAddress(p.chain, a))));
      Object.keys(reg.tokens).forEach(k => assert.ok(seen.has(k), k + ' not present in pools-snapshot.json'));
    });
    check('generator on the real snapshot: no NaN/undefined/Infinity anywhere, haircut <= headline, tiers match TVL', () => {
      const out = buildStocksSnapshot(snap, reg, { generatedAt: 'x' });
      assert.ok(out.pools.length > 0);
      walk(out, (v, trail) => {
        if (typeof v === 'number') assert.ok(Number.isFinite(v), 'non-finite at ' + trail);
        assert.ok(v !== undefined, 'undefined at ' + trail);
      }, '$');
      out.pools.forEach(p => {
        assert.ok(p.honestProjection <= p.headlineApy, p.symbol);
        assert.ok(p.headlineApy <= 500, p.symbol);
        assert.strictEqual(p.tier, tierFor(p.tvlUsd), p.symbol);
        assert.ok(p.tvlUsd >= 100000, p.symbol);
        if (p.exposure === 'multi') assert.strictEqual(p.ilRisk, 'high', p.symbol);
        if (p.forecastBand) assert.strictEqual(p.forecastBand.label, 'experimental');
      });
      assert.ok(!out.pools.some(p => /FARTCOIN|PEPECOIN|BITCOIN|TONCOIN|BOTCOIN/.test(p.symbol)));
    });
  }
}
if (fs.existsSync(outputPath)) {
  check('committed data/stocks-snapshot.json: schema, rails and no NaN', () => {
    const out = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.strictEqual(out.schemaVersion, 1);
    assert.strictEqual(out.rails.minTvl, 100000);
    assert.strictEqual(out.rails.equityApyCap, 500);
    assert.strictEqual(out.rails.haircut, 'reward×2/3, capped at headline');
    assert.strictEqual(out.counts.pools, out.pools.length);
    out.pools.forEach(p => assert.ok(p.honestProjection <= p.headlineApy, p.symbol));
    walk(out, (v, trail) => { if (typeof v === 'number') assert.ok(Number.isFinite(v), trail); }, '$');
  });
}

// ── slim client payload (data/stocks-pools.json) ───────────────────────────
const { buildStocksPools, parseForecastEval, verifiedIssuer } = gen;
const slimPath = path.join(__dirname, 'data', 'stocks-pools.json');

check('slim payload: carries only rendered fields (no onchain hints, trajectories, p50 or exclusion list)', () => {
  const full = build([pool(), pool({ chain: 'Solana', project: 'raydium-amm', symbol: 'NVDAX-USDC', poolMeta: 'Concentrated - 0.1%', underlyingTokens: [NVDAX, USDC_SOL] })]);
  const slim = buildStocksPools(full, { forecastStatus: 'Experimental forward forecast: In 8 of 15 test runs, assuming today\'s rate holds was more accurate than this forecast.' });
  assert.strictEqual(slim.pools.length, 2);
  const json = JSON.stringify(slim);
  ['onchain', 'trajectory', 'p50', 'excluded":[', 'poolAddress', 'heuristicClip'].forEach(k => assert.ok(json.indexOf(k) < 0, k));
  assert.deepStrictEqual(slim.forecast.eval, { baselineWins: 8, runs: 15 });
  const p = slim.pools[0];
  assert.strictEqual(p.id, full.pools[0].pool);
  assert.strictEqual(p.proj, full.pools[0].honestProjection);
  assert.strictEqual(p.clip, full.pools[0].heuristicClip.usd);
  assert.deepStrictEqual(p.band, [43.06, 3896.8]);
});

check('slim payload: issuer is named only when every equity token has a verified issuer', () => {
  const full = build([pool(), pool({ chain: 'Solana', project: 'raydium-amm', symbol: 'NVDAX-USDC', poolMeta: 'Concentrated - 0.1%', underlyingTokens: [NVDAX, USDC_SOL] })]);
  const slim = buildStocksPools(full, null);
  const base = slim.pools.find(p => p.chain === 'Base'), sol = slim.pools.find(p => p.chain === 'Solana');
  assert.strictEqual(base.issuer, null);
  assert.strictEqual(sol.issuer, 'xStocks (Backed)');
  assert.strictEqual(verifiedIssuer({ equityTokens: [{ issuer: 'xStocks (Backed)' }, { issuer: 'unverified' }] }), null);
  assert.strictEqual(verifiedIssuer({ equityTokens: [] }), null);
  assert.strictEqual(slim.forecast, null);
});

check('slim payload: forecast label parsing is strict (no numbers invented)', () => {
  assert.deepStrictEqual(parseForecastEval('In 3 of 12 test runs'), { baselineWins: 3, runs: 12 });
  assert.strictEqual(parseForecastEval('No evaluation yet'), null);
  assert.strictEqual(parseForecastEval(null), null);
  assert.strictEqual(parseForecastEval('In 3 of 0 test runs'), null);
});

if (fs.existsSync(slimPath) && fs.existsSync(outputPath)) {
  check('committed data/stocks-pools.json: no NaN, every id exists in the full snapshot, rails hold, <= 40 KB', () => {
    const raw = fs.readFileSync(slimPath, 'utf8');
    assert.ok(Buffer.byteLength(raw) <= 40000, 'slim payload is ' + Buffer.byteLength(raw) + ' bytes');
    assert.ok(!/NaN|undefined|Infinity/.test(raw));
    const slim = JSON.parse(raw);
    const full = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const fullById = new Map(full.pools.map(p => [p.pool, p]));
    assert.strictEqual(slim.schemaVersion, 1);
    assert.strictEqual(slim.pools.length, full.pools.length);
    assert.strictEqual(slim.counts.pools, slim.pools.length);
    assert.deepStrictEqual(slim.rails.tierMinTvl, { 1: 2000000, 2: 500000, 3: 100000 });
    walk(slim, (v, trail) => { if (typeof v === 'number') assert.ok(Number.isFinite(v), 'non-finite at ' + trail); }, '$');
    slim.pools.forEach(p => {
      const f = fullById.get(p.id);
      assert.ok(f, 'slim pool id missing from the full snapshot: ' + p.id);
      assert.strictEqual(p.tvl, f.tvlUsd);
      assert.strictEqual(p.proj, f.honestProjection);
      assert.strictEqual(p.apy, f.headlineApy);
      assert.ok(p.proj <= p.apy, p.symbol);
      assert.ok(p.apy <= 500 && p.tvl >= 100000, p.symbol);
      assert.ok([1, 2, 3].indexOf(p.tier) >= 0, p.symbol);
      assert.ok(Number.isFinite(p.clip) && p.clip >= 0, p.symbol);
      if (p.issuer !== null) assert.notStrictEqual(p.issuer, 'unverified', p.symbol);
      if (p.band) assert.ok(p.band.length === 2 && p.band[0] <= p.band[1], p.symbol);
    });
  });
}

console.log('\n' + passed + ' checks passed');
