#!/usr/bin/env node

/**
 * Landing hero data slice.
 *
 * The landing's underwriting card shows a short curated list of pools with their
 * DeFi Score and 14d forecast. Those fields only exist in data/pools-snapshot.json
 * (~11 MB, written by generate-pools-snapshot.js and enriched in place by
 * compute-kpis.js + compute-forecasts.py), which is far too heavy for the landing
 * route. This script extracts the curated pools into data/landing-pools.json
 * (a few KB). Run it AFTER compute-forecasts.py.
 *
 * APY/TVL here are the snapshot values; landing.js overlays live values from
 * yields.llama.fi/chart/<pool> and only falls back to these when that fails.
 * Pools missing from the snapshot, or without a defiScore, are omitted — the
 * landing never renders a score it cannot source.
 *
 * Freshness discipline (081/083 pattern): nothing is written when the output is
 * identical to what's on disk modulo `generatedAt`.
 *
 * Usage:
 *   node generate-landing-pools.js                 # read ./data/pools-snapshot.json, write ./data
 *   node generate-landing-pools.js --out <dir>     # write <dir>/landing-pools.json
 */

const fs = require('fs');
const path = require('path');

// Display order of the landing card's pool tabs.
const LANDING_POOL_IDS = [
  'ac61ee82-2fe4-4f9b-a9cd-7fb33f598859', // USDY · ondo-yield-assets · Ethereum
  'd8c4eff5-c8a9-46fc-a888-057c4c668e72', // SUSDS · sky-lending · Ethereum
  '43641cf5-a92e-416b-bce9-27113d3c0db6', // USDC · maple · Ethereum
  '747c1d2a-c668-4682-b9f9-296708a3dd90'  // STETH · lido · Ethereum
];

function buildLandingPools(snapshot, ids) {
  const byId = new Map();
  (snapshot.pools || []).forEach(p => { if (p && p.pool) byId.set(p.pool, p); });
  const pools = [];
  ids.forEach(id => {
    const p = byId.get(id);
    if (!p || !p.defiScore || typeof p.defiScore.score !== 'number') return;
    pools.push({
      pool: p.pool,
      symbol: p.symbol,
      project: p.project,
      chain: p.chain,
      tvlUsd: p.tvlUsd,
      apy: Math.round(((Number(p.apyBase) || 0) + (Number(p.apyReward) || 0)) * 100) / 100,
      defiScore: p.defiScore,
      forecast: p.forecast || null
    });
  });
  return { schemaVersion: 1, generatedAt: snapshot.generatedAt, pools: pools };
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, 'data');
  const snapshotPath = path.join(__dirname, 'data', 'pools-snapshot.json');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const result = buildLandingPools(snapshot, LANDING_POOL_IDS);
  if (result.pools.length === 0) {
    console.error('generate-landing-pools: no curated pool found in snapshot — refusing to write an empty file');
    process.exit(1);
  }

  const outPath = path.join(outDir, 'landing-pools.json');
  const next = JSON.stringify(result, null, 2) + '\n';
  if (fs.existsSync(outPath)) {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const strip = o => JSON.stringify(Object.assign({}, o, { generatedAt: null }));
    if (strip(prev) === strip(result)) {
      console.log('generate-landing-pools: no data change, not writing');
      return;
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, next);
  console.log('generate-landing-pools: wrote ' + result.pools.length + ' pools to ' + outPath);
}

if (require.main === module) main();

module.exports = { buildLandingPools, LANDING_POOL_IDS };
