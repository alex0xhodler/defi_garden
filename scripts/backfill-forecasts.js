#!/usr/bin/env node
/**
 * scripts/backfill-forecasts.js
 *
 * Recovers exact point-in-time emitted daily snapshots from git history
 * (one snapshot per day at 02:00 UTC) from Sep 12 through Oct 04,
 * and writes them into data/forecasts/YYYY-MM-DD.json.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const FORECASTS_DIR = path.join(__dirname, '../data/forecasts');

const DEX_PROJECTS = [
  'uniswap', 'aerodrome', 'curve', 'pancakeswap', 'balancer',
  'raydium', 'orca', 'ramses', 'camelot', 'trader-joe', 'sushiswap',
  'velodrome', 'quickswap', 'spookyswap', 'ekubo', 'thruster',
  'ambient', 'meteora', 'fenix', 'blackhole-clmm', 'lynex', 'nile', 'thena'
];

const STABLE_SYMBOLS = new Set([
  'USDC', 'USDT', 'DAI', 'USDS', 'EURC', 'PYUSD', 'USDE', 'FDUSD', 'FRAX',
  'GHO', 'CRVUSD', 'LUSD', 'USD0', 'BUSD', 'TUSD', 'USD+', 'USDC.E', 'USDT.E'
]);

function isLp(p) {
  if (p.exposure === 'multi' || p.ilRisk === 'yes') return true;
  const sym = p.symbol || '';
  if (sym.includes('-') || sym.includes('/')) return true;
  const proj = (p.project || '').toLowerCase();
  return DEX_PROJECTS.some(d => proj.includes(d));
}

function isStable(symbol) {
  if (!symbol) return false;
  const s = String(symbol).toUpperCase().trim();
  if (STABLE_SYMBOLS.has(s)) return true;
  return s.includes('USD') || s.includes('EUR');
}

function main() {
  if (!fs.existsSync(FORECASTS_DIR)) {
    fs.mkdirSync(FORECASTS_DIR, { recursive: true });
  }

  // Get git commit history for data/pools-snapshot.json
  const lines = cp.execSync('git log --pretty=format:"%h %ci" data/pools-snapshot.json')
    .toString()
    .trim()
    .split('\n');

  // Choose the oldest commit of the day (closest to 02:00 UTC) for each date
  const byDate = new Map();
  for (const line of lines) {
    const [h, d, t] = line.split(' ');
    if (!byDate.has(d)) {
      byDate.set(d, { h, t });
    } else {
      // In git log (newest first), later occurrences are earlier in the day
      byDate.set(d, { h, t });
    }
  }

  const dates = Array.from(byDate.keys())
    .filter(d => d >= '2026-09-12' && d < '2026-10-05')
    .sort();

  console.log(`Backfilling ${dates.length} daily runs...`);

  for (const dateStr of dates) {
    const run = byDate.get(dateStr);
    const outPath = path.join(FORECASTS_DIR, `${dateStr}.json`);
    if (fs.existsSync(outPath)) {
      console.log(`- Skipping ${dateStr} (already exists)`);
      continue;
    }

    try {
      const jsonStr = cp.execSync(`git show ${run.h}:data/pools-snapshot.json`, { maxBuffer: 40 * 1024 * 1024 }).toString();
      const raw = JSON.parse(jsonStr);
      const pools = raw.pools || raw.data || [];
      const ledger = {};
      let count = 0;

      for (const p of pools) {
        if (!p.pool || !p.forecast || p.forecast.p10 === undefined || p.forecast.p50 === undefined || p.forecast.p90 === undefined) {
          continue;
        }
        const tvl = Number(p.tvlUsd || 0);
        if (tvl < 100000) continue;
        if (isLp(p)) continue;

        const apyAtIssue = (p.apyBase || 0) + (p.apyReward || 0);
        if (apyAtIssue > 1000) continue;

        ledger[p.pool] = [
          Number(p.forecast.p10.toFixed(2)),
          Number(p.forecast.p50.toFixed(2)),
          Number(p.forecast.p90.toFixed(2)),
          Number(apyAtIssue.toFixed(4)),
          Math.round(tvl),
          isStable(p.symbol) ? 1 : 0
        ];
        count++;
      }

      const payload = {
        date: dateStr,
        commit: run.h,
        commitTime: run.t,
        totalRecorded: count,
        forecasts: ledger
      };

      fs.writeFileSync(outPath, JSON.stringify(payload), 'utf8');
      console.log(`✓ Backfilled ${dateStr} (${run.h}) -> ${count} pools (${(Buffer.byteLength(JSON.stringify(payload))/1024).toFixed(1)} KB)`);
    } catch (e) {
      console.error(`❌ Error backfilling ${dateStr}:`, e.message);
    }
  }
  console.log('✅ Backfill completed');
}

if (require.main === module) {
  main();
}
