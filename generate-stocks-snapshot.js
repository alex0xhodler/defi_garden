#!/usr/bin/env node

/**
 * /stocks terminal data slice (tokenized equities).
 *
 * Reads data/pools-snapshot.json (written by generate-pools-snapshot.js and
 * enriched in place by compute-kpis.js + compute-forecasts.py) and the
 * hand-curated data/stocks-registry.json, and writes data/stocks-snapshot.json:
 * only the pools that hold at least one registry token, each with the
 * equity-specific trust rails already applied. Run it AFTER compute-forecasts.py.
 *
 * Matching is by token ADDRESS against the registry (never by ticker
 * substring), so memecoin lookalikes (FARTCOIN, PEPECOIN, BITCOIN, ...) cannot
 * match. See docs/stocks-terminal.md for the red-team findings behind each rule.
 *
 * Equity rails (stricter than the global ones, which is allowed):
 *   - TVL floor $100K. Tier 3 (sandbox / thin) $100K-$500K, Tier 2 $500K-$2M,
 *     Tier 1 >= $2M.
 *   - APY sanity cap 500% (global is 1000%). Pools above it are EXCLUDED and
 *     counted, never displayed as normal.
 *   - honestProjection = min(headline, apyBase + apyReward * 2/3): the existing
 *     degen one-third haircut on emissions. It can never exceed today's rate.
 *     the forecast low-high range passes through ONLY as a band labelled "experimental"
 *     (its p50 is frequently ABOVE today's rate for equity LPs).
 *   - Forced High IL on any multi-exposure pair.
 *   - heuristicClip is TVL x constant, an ESTIMATE, not tick depth (Phase 4
 *     replaces it with on-chain reads).
 *
 * Headline APY = apyBase + apyReward (nulls as 0), the same rule as
 * generate-landing-pools.js.
 *
 * It ALSO writes data/stocks-pools.json: the slim client payload that
 * stocks.js fetches (only the fields the page renders, minified; no
 * trajectories, no onchain hints). The full snapshot stays the audit artifact
 * and the Phase 4 input.
 *
 * Freshness discipline (081/083 pattern): neither file is written when its
 * output is identical to what's on disk modulo `generatedAt`.
 *
 * Usage:
 *   node generate-stocks-snapshot.js                 # read ./data, write ./data/stocks-{snapshot,pools}.json
 *   node generate-stocks-snapshot.js --out <dir>     # write <dir>/stocks-{snapshot,pools}.json
 */

const fs = require('fs');
const path = require('path');

const MIN_TVL = 100000;
const EQUITY_APY_CAP = 500;
const REWARD_HAIRCUT = 2 / 3;
const NEAR_ZERO_YIELD = 1;

const TIERS = [
  { tier: 1, minTvl: 2000000, maxTvl: null, label: 'Core depth', plannerEligible: true },
  { tier: 2, minTvl: 500000, maxTvl: 2000000, label: 'Emerging', plannerEligible: true },
  { tier: 3, minTvl: MIN_TVL, maxTvl: 500000, label: 'Sandbox / thin liquidity', plannerEligible: false }
];

// Heuristic depth: max ~50bps clip as a fraction of TVL. ESTIMATES (see header).
// 'other' (CDP positions, PT markets, single-side credit pools) uses the AMM
// factor, the more conservative of the two pool-style values.
const DEPTH_FACTORS = { cl: 0.005, amm: 0.0025, lending: 0.05, other: 0.0025 };

// Wrapper / vault projects: their underlying LP is already listed directly and
// the vault layer adds unscored strategy risk, so they are excluded.
const VAULT_PROJECTS = ['beefy', 'superform', 'yearn-finance', 'harvest-finance'];

const LENDING_RE = /lend|morpho|venus|aave|compound|euler|spark|silo|fluid/;
const CL_PROJECTS = ['aerodrome-slipstream', 'uniswap-v3', 'uniswap-v4', 'orca-dex', 'alandale-v3', 'nest-cl', 'pancakeswap-amm-v3'];
const AMM_PROJECTS = ['uniswap-v2', 'aerodrome-v1', 'omnipair', 'sushiswap', 'pancakeswap-amm'];

// Known quote assets, by chain, keyed by normalised address. Anything else paired
// with an equity token (memecoins, SI, STONK, BLUECHIP...) is unrecognised and
// the pool is excluded.
const QUOTES = {
  Solana: {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'stable',
    'So11111111111111111111111111111111111111112': 'native'
  },
  Base: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'stable',
    '0x4200000000000000000000000000000000000006': 'native',
    '0x0000000000000000000000000000000000000000': 'native'
  },
  Ethereum: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'stable',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'stable',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'native',
    '0x0000000000000000000000000000000000000000': 'native'
  },
  Arbitrum: {
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'stable',
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'native',
    '0x0000000000000000000000000000000000000000': 'native'
  },
  BSC: {
    '0x55d398326f99059ff775485246999027b3197955': 'stable',
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'stable'
  },
  'Robinhood Chain': {
    // USDG: the Alandale SPY-USDG pair's quote token (symbol from the pool name).
    '0x5fc5360d0400a0fd4f2af552add042d716f1d168': 'stable'
  },
  'Hyperliquid L1': {
    // HyperEVM native USDC: the nest-cl WNVDAX-USDC pair's quote token (symbol from the pool name).
    '0xb88339cb7199b77e23db6e890353e22632ba630f': 'stable'
  }
};

// EVM chain ids (null = not asserted; Phase 4 must supply them, not guess).
const CHAIN_IDS = { Ethereum: 1, Base: 8453, Arbitrum: 42161, BSC: 56, Solana: null, 'Robinhood Chain': null, 'Hyperliquid L1': null };

const AMM_TYPES = {
  'aerodrome-slipstream': { ammType: 'slipstream-cl', strategy: 'factory-getPool' },
  'uniswap-v3': { ammType: 'uniswap-v3', strategy: 'factory-getPool' },
  'uniswap-v2': { ammType: 'uniswap-v2', strategy: 'factory-getPair' },
  'uniswap-v4': { ammType: 'uniswap-v4', strategy: 'v4-pool-id' },
  'alandale-v3': { ammType: 'v3-like', strategy: 'factory-getPool' },
  'orca-dex': { ammType: 'orca-whirlpool', strategy: 'solana-program-account' },
  'kamino-lend': { ammType: 'kamino-lend', strategy: 'market-lookup' },
  'jupiter-lend': { ammType: 'jupiter-lend', strategy: 'market-lookup' },
  'venus-core-pool': { ammType: 'venus-core', strategy: 'market-lookup' },
  'morpho-blue': { ammType: 'morpho-blue', strategy: 'market-lookup' },
  'frankencoin': { ammType: 'frankencoin-position', strategy: 'market-lookup' },
  'pendle-v2': { ammType: 'pendle-pt', strategy: 'market-lookup' },
  'native-credit-pool': { ammType: 'native-credit-pool', strategy: 'market-lookup' }
};

function isEvmChain(chain) {
  return chain !== 'Solana';
}

// EVM addresses are case-insensitive (lowercase). Solana base58 is case-sensitive
// and must stay exact.
function normalizeAddress(chain, address) {
  if (typeof address !== 'string') return '';
  return isEvmChain(chain) ? address.toLowerCase() : address;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function headlineApy(pool) {
  return round2(num(pool.apyBase) + num(pool.apyReward));
}

// Never exceeds the headline: compared after rounding, floored at 0.
function honestProjection(pool) {
  const headline = headlineApy(pool);
  const haircut = round2(num(pool.apyBase) + num(pool.apyReward) * REWARD_HAIRCUT);
  return Math.max(0, Math.min(headline, haircut));
}

function tierFor(tvlUsd) {
  if (!Number.isFinite(tvlUsd) || tvlUsd < MIN_TVL) return null;
  for (let i = 0; i < TIERS.length; i++) {
    if (tvlUsd >= TIERS[i].minTvl) return TIERS[i].tier;
  }
  return null;
}

function poolTypeFor(pool) {
  const project = String(pool.project || '');
  const meta = String(pool.poolMeta || '');
  if (LENDING_RE.test(project)) return 'lending';
  if (CL_PROJECTS.indexOf(project) >= 0) return 'cl';
  if (/^CL\d+/.test(meta)) return 'cl';
  if (project === 'raydium-amm') return /concentrated/i.test(meta) ? 'cl' : 'amm';
  if (AMM_PROJECTS.indexOf(project) >= 0) return 'amm';
  return 'other';
}

function heuristicClip(tvlUsd, poolType) {
  const factor = DEPTH_FACTORS[poolType] != null ? DEPTH_FACTORS[poolType] : DEPTH_FACTORS.other;
  return { usd: Math.round(tvlUsd * factor), method: 'tvl-heuristic', depthFactor: factor, estimate: true };
}

function forecastBand(forecast) {
  if (!forecast) return null;
  const p10 = Number(forecast.p10), p50 = Number(forecast.p50), p90 = Number(forecast.p90);
  if (![p10, p50, p90].every(Number.isFinite)) return null;
  return { p10: round2(p10), p50: round2(p50), p90: round2(p90), horizonDays: forecast.horizonDays || 14, label: 'experimental' };
}

function parseFeeTierPct(poolMeta) {
  const m = String(poolMeta || '').match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

function parseTickSpacing(poolMeta) {
  const m = String(poolMeta || '').match(/^CL(\d+)/);
  return m ? Number(m[1]) : null;
}

function onchainHints(pool, poolType, tokens) {
  const project = String(pool.project || '');
  let info = AMM_TYPES[project];
  if (project === 'raydium-amm') {
    info = { ammType: poolType === 'cl' ? 'raydium-clmm' : 'raydium-amm-v4', strategy: 'solana-program-account' };
  }
  if (!info) info = { ammType: 'unknown', strategy: 'unknown' };
  return {
    chain: pool.chain,
    chainId: CHAIN_IDS[pool.chain] != null ? CHAIN_IDS[pool.chain] : null,
    // DefiLlama pool ids are UUIDs, not contract addresses: the pool address is
    // NOT in the data and must be derived by Phase 4 using `poolAddressStrategy`.
    poolAddress: null,
    poolAddressStrategy: info.strategy,
    ammType: info.ammType,
    feeTierPct: parseFeeTierPct(pool.poolMeta),
    tickSpacing: parseTickSpacing(pool.poolMeta),
    tokens: tokens
  };
}

function tokenKey(chain, address) {
  return chain + ':' + normalizeAddress(chain, address);
}

function indexRegistry(registry) {
  const byKey = new Map();
  const tokens = (registry && registry.tokens) || {};
  Object.keys(tokens).forEach(k => {
    const t = tokens[k];
    byKey.set(tokenKey(t.chain, t.address), t);
  });
  return byKey;
}

function classifyQuote(chain, address, registryIndex) {
  if (registryIndex.has(tokenKey(chain, address))) return 'equity';
  const table = QUOTES[chain] || {};
  return table[normalizeAddress(chain, address)] || (table[address] || null);
}

// Issuer metadata for the pools that name one, keyed by display name (the
// same string a pool carries in `issuer`). Pure projection of registry.issuers.
function issuersByName(registry, names) {
  const out = {};
  const all = (registry && registry.issuers) || {};
  Object.keys(all).sort().forEach(slug => {
    const i = all[slug];
    if (!i || !i.name || names.indexOf(i.name) < 0) return;
    out[i.name] = {
      slug: slug,
      legalEntity: i.legalEntity == null ? null : i.legalEntity,
      jurisdiction: i.jurisdiction == null ? null : i.jurisdiction,
      usPersons: i.usPersons === true || i.usPersons === false ? i.usPersons : null,
      sources: Array.isArray(i.sources) ? i.sources.slice() : []
    };
  });
  return out;
}

function sortKey(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function buildStocksSnapshot(snapshot, registry, opts) {
  const options = opts || {};
  const registryIndex = indexRegistry(registry);
  const pools = [];
  const excluded = [];

  (snapshot.pools || []).forEach(p => {
    if (!p || !p.pool || !Array.isArray(p.underlyingTokens)) return;
    const equityTokens = [];
    p.underlyingTokens.forEach(addr => {
      const reg = registryIndex.get(tokenKey(p.chain, addr));
      if (reg) equityTokens.push(reg);
    });
    if (equityTokens.length === 0) return;

    const tvlUsd = Number(p.tvlUsd);
    const headline = headlineApy(p);
    const base = { pool: p.pool, symbol: p.symbol, project: p.project, chain: p.chain, tvlUsd: Number.isFinite(tvlUsd) ? Math.round(tvlUsd) : null };
    const exclude = (reason, extra) => excluded.push(Object.assign(base, extra || {}, { reason: reason }));

    if (!Number.isFinite(tvlUsd)) return exclude('invalid-data');
    if (VAULT_PROJECTS.indexOf(String(p.project)) >= 0) return exclude('vault-wrapper');
    if (tvlUsd < MIN_TVL) return exclude('below-tvl-floor');
    if (headline > EQUITY_APY_CAP) return exclude('apy-above-cap', { headlineApy: headline });

    const tokens = p.underlyingTokens.map(addr => {
      const reg = registryIndex.get(tokenKey(p.chain, addr));
      const role = classifyQuote(p.chain, addr, registryIndex);
      return {
        address: normalizeAddress(p.chain, addr),
        role: reg ? 'equity' : role,
        symbol: reg ? reg.symbol : null
      };
    });
    if (tokens.some(t => t.role === null)) return exclude('unrecognized-counterparty');

    const poolType = poolTypeFor(p);
    const multi = p.exposure === 'multi' || p.underlyingTokens.length >= 2;
    const flags = [];
    const tier = tierFor(tvlUsd);
    if (tier === 3) flags.push('thinLiquidity');
    if (multi) flags.push('forcedHighIL');
    if (headline < NEAR_ZERO_YIELD) flags.push('nearZeroYield');
    const band = forecastBand(p.forecast);
    if (band && band.p50 > headline) flags.push('forecastAboveHeadline');
    flags.sort();

    const quoteToken = tokens.find(t => t.role !== 'equity');
    const eq = equityTokens[0];
    pools.push({
      pool: p.pool,
      symbol: p.symbol,
      project: p.project,
      chain: p.chain,
      poolMeta: p.poolMeta == null ? null : p.poolMeta,
      poolType: poolType,
      exposure: multi ? 'multi' : 'single',
      underlying: eq.underlying,
      quote: quoteToken ? quoteToken.role : (tokens.length > 1 ? 'equity' : null),
      equityTokens: equityTokens.map(t => ({
        symbol: t.symbol, underlying: t.underlying, assetClass: t.assetClass,
        issuer: t.issuer, issuerBasis: t.issuerBasis, issuerSource: t.issuerSource || null, address: t.address
      })),
      tvlUsd: Math.round(tvlUsd),
      tier: tier,
      apyBase: round2(num(p.apyBase)),
      apyReward: round2(num(p.apyReward)),
      headlineApy: headline,
      apyMean30d: p.apyMean30d == null || !Number.isFinite(Number(p.apyMean30d)) ? null : round2(Number(p.apyMean30d)),
      honestProjection: honestProjection(p),
      forecastBand: band,
      ilRisk: multi ? 'high' : (p.ilRisk || 'no'),
      flags: flags,
      heuristicClip: heuristicClip(tvlUsd, poolType),
      defiScore: publicDefiScore(p.defiScore),
      onchain: onchainHints(p, poolType, tokens)
    });
  });

  pools.sort((a, b) => (b.tvlUsd - a.tvlUsd) || sortKey(a.pool, b.pool));
  excluded.sort((a, b) => sortKey(a.reason, b.reason) || sortKey(a.symbol, b.symbol) || sortKey(a.pool, b.pool));

  const byTier = { 1: 0, 2: 0, 3: 0 };
  const byChain = {};
  pools.forEach(p => {
    byTier[p.tier]++;
    byChain[p.chain] = (byChain[p.chain] || 0) + 1;
  });
  const excludedByReason = {};
  excluded.forEach(e => { excludedByReason[e.reason] = (excludedByReason[e.reason] || 0) + 1; });

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    sourceGeneratedAt: snapshot.generatedAt || null,
    rails: {
      minTvl: MIN_TVL,
      equityApyCap: EQUITY_APY_CAP,
      tiers: TIERS,
      haircut: 'reward×2/3, capped at headline',
      depthFactors: DEPTH_FACTORS,
      redemptionNotice: 'Primary redemption subject to issuer/broker hours'
    },
    issuers: issuersByName(registry, equityIssuerNames(pools)),
    counts: { pools: pools.length, byTier: byTier, byChain: sortObject(byChain), excluded: excluded.length, excludedByReason: sortObject(excludedByReason) },
    pools: pools,
    excluded: excluded
  };
}

function equityIssuerNames(pools) {
  const names = [];
  pools.forEach(p => p.equityTokens.forEach(t => {
    if (isVerifiedToken(t) && names.indexOf(t.issuer) < 0) names.push(t.issuer);
  }));
  return names;
}

function sortObject(o) {
  const out = {};
  Object.keys(o).sort().forEach(k => { out[k] = o[k]; });
  return out;
}

const VERIFIED_ISSUER_NONE = 'unverified';
// Only these attribution bases verify an issuer. A token's self-reported
// on-chain name() ('onchain-name') is NOT verification: any contract can set it.
const VERIFIED_BASES = ['official-registry', 'official-announcement', 'onchain-beacon'];

function isVerifiedToken(t) {
  return !!t && !!t.issuer && t.issuer !== VERIFIED_ISSUER_NONE && VERIFIED_BASES.indexOf(t.issuerBasis) >= 0;
}
const SLIM_FLAGS = ['forcedHighIL', 'thinLiquidity', 'nearZeroYield', 'forecastAboveHeadline'];

// A pool names an issuer only when EVERY equity token in it has a verified one;
// otherwise null (the page then shows "Issuer unverified").
function verifiedIssuer(pool) {
  const toks = pool.equityTokens || [];
  if (!toks.length) return null;
  if (toks.some(t => !isVerifiedToken(t))) return null;
  const names = [];
  toks.forEach(t => { if (names.indexOf(t.issuer) < 0) names.push(t.issuer); });
  return names.join(' + ');
}

// "In 8 of 15 test runs, ..." -> { baselineWins: 8, runs: 15 } so the page can
// localize the sentence without re-typing the numbers. Null when it doesn't parse.
// PUBLIC serialization of a DeFi Score (2026-10-25 proprietary decision): total, band
// name and the per-pillar 0-100 `pillarsPct` only. Raw pillar points are never copied.
function publicDefiScore(ds) {
  if (!ds || typeof ds !== 'object') return null;
  const out = { score: ds.score, rating: ds.rating };
  if (ds.pillarsPct && typeof ds.pillarsPct === 'object') out.pillarsPct = ds.pillarsPct;
  return out;
}

function parseForecastEval(label) {
  const m = String(label || '').match(/(\d+)\s+of\s+(\d+)\s+test runs/i);
  if (!m) return null;
  const wins = Number(m[1]), runs = Number(m[2]);
  return Number.isFinite(wins) && Number.isFinite(runs) && runs > 0 ? { baselineWins: wins, runs: runs } : null;
}

function slimIssuers(issuers, pools) {
  const used = [];
  pools.forEach(p => String(p.issuer || '').split(' + ').forEach(n => { if (n && used.indexOf(n) < 0) used.push(n); }));
  const out = {};
  used.sort().forEach(n => {
    const i = (issuers || {})[n];
    if (i) out[n] = { e: i.legalEntity, j: i.jurisdiction, us: i.usPersons };
  });
  return out;
}

/**
 * Slim client payload: pure function of the full snapshot (+ the optional
 * data/pool-scores.json `labels` block). Contains exactly what stocks.js
 * renders, short keys, no onchain hints / forecast p50 / exclusion list.
 */
function buildStocksPools(full, scoreLabels) {
  const label = scoreLabels && typeof scoreLabels.forecastStatus === 'string' ? scoreLabels.forecastStatus : null;
  const pools = (full.pools || []).map(p => {
    const first = (p.equityTokens && p.equityTokens[0]) || {};
    const score = p.defiScore && Number.isFinite(Number(p.defiScore.score)) ? p.defiScore : null;
    const b = score && score.pillarsPct ? score.pillarsPct : {}; // 0-100 per pillar (no raw points)
    return {
      id: p.pool,
      symbol: p.symbol,
      project: p.project,
      chain: p.chain,
      type: p.poolType,
      underlying: p.underlying,
      // Only the non-default asset class is carried ('etf'); absent = single stock.
      ...(first.assetClass && first.assetClass !== 'equity' ? { assetClass: first.assetClass } : {}),
      issuer: verifiedIssuer(p),
      tvl: p.tvlUsd,
      tier: p.tier,
      apy: p.headlineApy,
      // Emission split, only when there are emissions (absent reward = 0, base = apy).
      ...(p.apyReward > 0 ? { base: p.apyBase, reward: p.apyReward } : {}),
      proj: p.honestProjection,
      // [low, high] of the experimental forecast band; null when absent or all-zero.
      band: p.forecastBand && p.forecastBand.p90 > 0 ? [p.forecastBand.p10, p.forecastBand.p90] : null,
      flags: (p.flags || []).filter(f => SLIM_FLAGS.indexOf(f) >= 0),
      clip: p.heuristicClip.usd,
      score: score ? {
        v: score.score, r: score.rating == null ? null : score.rating,
        st: num(b.stability), su: num(b.sustainability), sk: num(b.stickiness), li: num(b.liquidity)
      } : null
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: full.generatedAt,
    sourceGeneratedAt: full.sourceGeneratedAt,
    rails: {
      minTvl: full.rails.minTvl,
      equityApyCap: full.rails.equityApyCap,
      haircut: full.rails.haircut,
      redemptionNotice: full.rails.redemptionNotice,
      // Tier floors (tier 1 = deepest) so the page never hard-codes the cut-offs.
      tierMinTvl: full.rails.tiers.reduce((o, t) => { o[t.tier] = t.minTvl; return o; }, {})
    },
    // Track-record numbers live only on /forecast-accuracy (2026-10-25): never carry run counts here.
    forecast: label ? { label: label, eval: null } : null,
    counts: { pools: pools.length, excluded: full.counts.excluded },
    // Issuer facts for the names pools carry (tooltip: legal entity, jurisdiction, US-person eligibility).
    issuers: slimIssuers(full.issuers, pools),
    pools: pools
  };
}

// Write `result` to outPath unless it equals what is on disk modulo generatedAt.
function writeIfChanged(outPath, result, indent, name) {
  const next = JSON.stringify(result, null, indent) + '\n';
  if (fs.existsSync(outPath)) {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const strip = o => JSON.stringify(Object.assign({}, o, { generatedAt: null }));
    if (strip(prev) === strip(result)) {
      console.log('generate-stocks-snapshot: no data change in ' + name + ', not writing');
      return false;
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, next);
  console.log('generate-stocks-snapshot: wrote ' + name + ' (' + Buffer.byteLength(next) + ' bytes) to ' + outPath);
  return true;
}

function readScoreLabels() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'pool-scores.json'), 'utf8')).labels || null;
  } catch (err) {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, 'data');
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'pools-snapshot.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'stocks-registry.json'), 'utf8'));
  const result = buildStocksSnapshot(snapshot, registry);
  if (result.pools.length === 0) {
    console.error('generate-stocks-snapshot: no registry token matched any pool — refusing to write an empty file');
    process.exit(1);
  }

  writeIfChanged(path.join(outDir, 'stocks-snapshot.json'), result, 2, 'stocks-snapshot.json');
  // Slim payload is derived from the in-memory snapshot (not the file on disk),
  // so it is rewritten even when the full snapshot was unchanged but the slim
  // file is missing or stale. Compact JSON: it ships to every /stocks visitor.
  writeIfChanged(path.join(outDir, 'stocks-pools.json'), buildStocksPools(result, readScoreLabels()), 0, 'stocks-pools.json');
}

if (require.main === module) main();

module.exports = {
  buildStocksSnapshot, buildStocksPools, parseForecastEval, publicDefiScore, verifiedIssuer, isVerifiedToken, VERIFIED_BASES, headlineApy, honestProjection, tierFor, poolTypeFor, heuristicClip,
  forecastBand, normalizeAddress, indexRegistry,
  MIN_TVL, EQUITY_APY_CAP, REWARD_HAIRCUT, TIERS, DEPTH_FACTORS
};
