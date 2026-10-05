const fs = require('fs');
const path = require('path');
const { PERMISSIONED_PROJECT_LIST } = require('./permissioned-projects.js');

const SNAPSHOT_PATH = path.join(__dirname, 'data/pools-snapshot.json');
const OUT_PATH = path.join(__dirname, 'data/pool-scores.json');

function main() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error('❌ pools-snapshot.json not found');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const pools = raw.pools || raw.data || [];

  const scores = {};
  for (const p of pools) {
    if (!p.defiScore && !p.forecast) continue;
    const isRestricted = PERMISSIONED_PROJECT_LIST.has(String(p.project || '').toLowerCase());
    scores[p.pool] = {
      score: p.defiScore ? Number(p.defiScore.score.toFixed(1)) : null,
      breakdown: p.defiScore && p.defiScore.breakdown ? {
        stability: Number((p.defiScore.breakdown.stability || 0).toFixed(1)),
        sustainability: Number((p.defiScore.breakdown.sustainability || 0).toFixed(1)),
        stickiness: Number((p.defiScore.breakdown.stickiness || 0).toFixed(1)),
        liquidity: Number((p.defiScore.breakdown.liquidity || 0).toFixed(1))
      } : null,
      forecast: p.forecast ? {
        horizonDays: p.forecast.horizonDays || 14,
        p10Apy: Number(p.forecast.p10.toFixed(2)),
        p50Apy: Number(p.forecast.p50.toFixed(2)),
        p90Apy: Number(p.forecast.p90.toFixed(2)),
        crashRisk: p.forecast.crashRisk || 'LOW',
        forwardDelta: Number((p.forecast.forwardDelta || 0).toFixed(2)),
        status: "Experimental forward forecast: In our first 10 test runs, assuming today's rate holds was more accurate than this forecast."
      } : null,
      isRestricted: isRestricted,
      accessStatus: isRestricted
        ? "PERMISSIONED / ACCREDITED ONLY (KYC)"
        : "Open access (not on our restricted list; protocol terms and regional limits may apply)"
    };
  }

  const payload = {
    generatedAt: raw.generatedAt || new Date().toISOString(),
    totalScores: Object.keys(scores).length,
    scores: scores
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload), 'utf8');
  console.log(`✅ Generated ${OUT_PATH} (${Object.keys(scores).length} pools, ${(Buffer.byteLength(JSON.stringify(payload))/1024).toFixed(1)} KB)`);
}

if (require.main === module) {
  main();
}
