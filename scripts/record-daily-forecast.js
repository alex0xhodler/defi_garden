#!/usr/bin/env node
/**
 * scripts/record-daily-forecast.js
 *
 * Emits a lightweight, point-in-time snapshot of 14-day forecasts emitted
 * during today's CI run. Stores only single-sided lending/vault/staking venues
 * clearing trust rails into data/forecasts/YYYY-MM-DD.json (~150 KB).
 *
 * Format:
 * {
 *   "date": "2026-10-05",
 *   "commit": "...",
 *   "forecasts": {
 *     "<pool_id>": [p10, p50, p90, apy_at_issue, tvl_usd, is_stable]
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '../data/pools-snapshot.json');
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
  // Only record on scheduled workflow runs (GITHUB_EVENT_NAME === 'schedule')
  // or when explicitly run with --force. Never overwrite an existing daily file.
  const isScheduled = process.env.GITHUB_EVENT_NAME === 'schedule';
  const isForce = process.argv.includes('--force');

  const dateStr = new Date().toISOString().split('T')[0];
  const outPath = path.join(FORECASTS_DIR, `${dateStr}.json`);

  if (!isScheduled && !isForce) {
    console.log(`ℹ️ Skipping daily forecast record: workflow event '${process.env.GITHUB_EVENT_NAME || 'local'}' is not scheduled. Use --force to record manually.`);
    return;
  }

  if (fs.existsSync(outPath) && !isForce) {
    console.log(`ℹ️ Skipping daily forecast record: ${outPath} already exists for today. Write-once invariant enforced.`);
    return;
  }

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error('❌ pools-snapshot.json not found');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const pools = raw.pools || raw.data || [];

  if (!fs.existsSync(FORECASTS_DIR)) {
    fs.mkdirSync(FORECASTS_DIR, { recursive: true });
  }

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
    generatedAt: new Date().toISOString(),
    event: process.env.GITHUB_EVENT_NAME || 'manual',
    commit: process.env.GITHUB_SHA || 'local',
    totalRecorded: count,
    forecasts: ledger
  };

  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf8');
  console.log(`✅ Recorded ${count} point-in-time forecasts to ${outPath} (${(Buffer.byteLength(JSON.stringify(payload))/1024).toFixed(1)} KB)`);
}

if (require.main === module) {
  main();
}
