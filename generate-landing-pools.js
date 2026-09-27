#!/usr/bin/env node

/**
 * Landing leaderboard data slice.
 *
 * The landing ranks the best-scored pools and reads each one on an instrument panel (DeFi Score,
 * APY with its 30-day band, 14d forecast, depth, exit liquidity, crash risk). Those fields only
 * exist in data/pools-snapshot.json (~11 MB, written by generate-pools-snapshot.js and enriched in
 * place by compute-kpis.js + compute-forecasts.py), far too heavy for the landing route. This
 * script extracts the top LEADERBOARD_SIZE eligible pools into data/landing-pools.json (tens of
 * KB). Run it AFTER compute-forecasts.py.
 *
 * Eligibility: a DeFi Score and a forecast, TVL >= LEADERBOARD_MIN_TVL, and a total APY above zero
 * and within the APY sanity rail. Ranking: score desc, ties by TVL desc. APY/TVL here are snapshot
 * values; landing.js overlays live values for the visible rows and re-applies the trust rails.
 *
 * Freshness discipline (081/083 pattern): nothing is written when the output is identical to what's
 * on disk modulo `generatedAt`.
 *
 * Usage:
 *   node generate-landing-pools.js                 # read ./data/pools-snapshot.json, write ./data
 *   node generate-landing-pools.js --out <dir>     # write <dir>/landing-pools.json
 */

const fs = require('fs');
const path = require('path');
const TRUST_RAILS = require('./trust-rails.js');

const LEADERBOARD_SIZE = 50;
const LEADERBOARD_MIN_TVL = 10000000;

// Mirrors app.js STABLE_SYMBOLS (no module system links the browser scripts).
const STABLE_SYMBOLS = ['USDC', 'USDT', 'DAI', 'USDS', 'FRAX', 'TUSD', 'USDP', 'GUSD',
  'LUSD', 'USDD', 'PYUSD', 'USDE', 'SUSD', 'CRVUSD', 'GHO', 'USD0', 'FDUSD', 'USDB',
  'BUSD', 'MIM', 'DOLA', 'USDX', 'EURC', 'EURS', 'RLUSD', 'USDL', 'DEUSD', 'SDAI'];
const ETH_SYMBOLS = ['ETH', 'WETH', 'STETH', 'WSTETH', 'RETH', 'CBETH', 'WEETH', 'EETH', 'EZETH',
  'RSETH', 'METH', 'SFRXETH', 'FRXETH', 'OSETH', 'ETHX', 'SWETH', 'ANKRETH', 'PUFETH', 'WBETH', 'LSETH'];
const BTC_SYMBOLS = ['BTC', 'WBTC', 'CBBTC', 'TBTC', 'LBTC', 'SOLVBTC', 'FBTC', 'EBTC', 'UNIBTC',
  'PUMPBTC', 'BTCB', 'SBTC', 'RENBTC', 'XSOLVBTC'];

function categoryOf(symbol) {
  const parts = String(symbol || '').toUpperCase().split(/[-_\/\s+]/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return 'other';
  const all = list => parts.every(p => list.indexOf(p) !== -1);
  if (all(STABLE_SYMBOLS)) return 'stable';
  if (all(ETH_SYMBOLS)) return 'eth';
  if (all(BTC_SYMBOLS)) return 'btc';
  return 'other';
}

function totalApy(p) {
  return Math.round(((Number(p.apyBase) || 0) + (Number(p.apyReward) || 0)) * 100) / 100;
}

function isEligible(p) {
  if (!p || !p.defiScore || typeof p.defiScore.score !== 'number' || !p.forecast) return false;
  const apy = totalApy(p);
  return Number(p.tvlUsd) >= LEADERBOARD_MIN_TVL && apy > 0 && apy <= TRUST_RAILS.APY_SANITY_LIMIT;
}

function buildLeaderboard(snapshot, opts) {
  const size = (opts && opts.size) || LEADERBOARD_SIZE;
  const eligible = (snapshot.pools || []).filter(isEligible);
  eligible.sort((a, b) => (b.defiScore.score - a.defiScore.score) || (b.tvlUsd - a.tvlUsd));
  const pools = eligible.slice(0, size).map((p, i) => {
    const f = p.forecast;
    const k = p.kpis || {};
    return {
      rank: i + 1,
      pool: p.pool,
      symbol: p.symbol,
      project: p.project,
      chain: p.chain,
      category: categoryOf(p.symbol),
      tvlUsd: p.tvlUsd,
      apy: totalApy(p),
      band30d: (typeof k.apyMean === 'number' && typeof k.apyStdev === 'number')
        ? { mean: k.apyMean, stdev: k.apyStdev } : null,
      defiScore: { score: p.defiScore.score, rating: p.defiScore.rating, breakdown: p.defiScore.breakdown },
      forecast: { p10: f.p10, p50: f.p50, p90: f.p90, crashRisk: f.crashRisk, trajectory: f.trajectory || [] }
    };
  });
  return {
    schemaVersion: 2,
    generatedAt: snapshot.generatedAt,
    minTvlUsd: LEADERBOARD_MIN_TVL,
    eligibleCount: eligible.length,
    pools: pools
  };
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, 'data');
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'pools-snapshot.json'), 'utf8'));
  const result = buildLeaderboard(snapshot);
  if (result.pools.length === 0) {
    console.error('generate-landing-pools: no eligible pool in snapshot — refusing to write an empty leaderboard');
    process.exit(1);
  }
  const outPath = path.join(outDir, 'landing-pools.json');
  if (fs.existsSync(outPath)) {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const strip = o => JSON.stringify(Object.assign({}, o, { generatedAt: null }));
    if (strip(prev) === strip(result)) {
      console.log('generate-landing-pools: no data change, not writing');
      return;
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result) + '\n');
  console.log('generate-landing-pools: wrote ' + result.pools.length + ' of ' + result.eligibleCount + ' eligible pools to ' + outPath);
}

if (require.main === module) main();

module.exports = { buildLeaderboard, categoryOf, isEligible, LEADERBOARD_SIZE, LEADERBOARD_MIN_TVL };
