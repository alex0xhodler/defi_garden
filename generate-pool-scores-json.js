#!/usr/bin/env node
/**
 * generate-pool-scores-json.js
 *
 * Generates a compact index of scored pool metrics (scores, forecast bands,
 * and retail access flags) in data/pool-scores.json.
 *
 * Compact Array Schema:
 * [score, [stability, sustainability, stickiness, liquidity], [p10, p50, p90, crashRisk, forwardDelta], isRestricted]
 * Shared disclaimer and access text are stored once at top-level.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PERMISSIONED_PROJECT_LIST } = require('./permissioned-projects.js');

const SNAPSHOT_PATH = path.join(__dirname, 'data/pools-snapshot.json');
const EVALUATIONS_PATH = path.join(__dirname, 'data/forecast-evaluations.json');
const OUT_PATH = path.join(__dirname, 'data/pool-scores.json');

function main() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error('❌ pools-snapshot.json not found');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const pools = raw.pools || raw.data || [];

  // Generate disclaimer dynamically from forecast-evaluations.json
  let forecastDisclaimer = "Experimental forward forecast: In our initial test runs, assuming today's rate holds was more accurate than this forecast.";
  if (fs.existsSync(EVALUATIONS_PATH)) {
    try {
      const evals = JSON.parse(fs.readFileSync(EVALUATIONS_PATH, 'utf8'));
      const totalRuns = (evals.summary && evals.summary.totalRuns) || 0;
      const worseRuns = (evals.resolvedRuns || []).filter(r => r.overall && r.overall.skillScore < 0).length;
      if (totalRuns > 0) {
        forecastDisclaimer = `Experimental forward forecast: In ${worseRuns} of ${totalRuns} test runs, assuming today's rate holds was more accurate than this forecast.`;
      }
    } catch (_e) {}
  }

  const scores = {};
  for (const p of pools) {
    if (!p.defiScore && !p.forecast) continue;
    const isRestricted = PERMISSIONED_PROJECT_LIST.has(String(p.project || '').toLowerCase());
    scores[p.pool] = [
      p.defiScore ? Number(p.defiScore.score.toFixed(1)) : null,
      p.defiScore && p.defiScore.breakdown ? [
        Number((p.defiScore.breakdown.stability || 0).toFixed(1)),
        Number((p.defiScore.breakdown.sustainability || 0).toFixed(1)),
        Number((p.defiScore.breakdown.stickiness || 0).toFixed(1)),
        Number((p.defiScore.breakdown.liquidity || 0).toFixed(1))
      ] : null,
      p.forecast ? [
        Number(p.forecast.p10.toFixed(2)),
        Number(p.forecast.p50.toFixed(2)),
        Number(p.forecast.p90.toFixed(2)),
        p.forecast.crashRisk || 'LOW',
        Number((p.forecast.forwardDelta || 0).toFixed(2))
      ] : null,
      isRestricted ? 1 : 0
    ];
  }

  const payload = {
    schemaVersion: 2,
    generatedAt: raw.generatedAt || new Date().toISOString(),
    totalScores: Object.keys(scores).length,
    labels: {
      scoreNote: "Yield quality score based on stability, fee sustainability, depositor stickiness, and exit liquidity. Not a smart-contract or exploit safety audit.",
      forecastStatus: forecastDisclaimer,
      openAccess: "Open access (not on our restricted list; protocol terms and regional limits may apply)",
      restrictedAccess: "PERMISSIONED / ACCREDITED ONLY (KYC)"
    },
    scores: scores
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload), 'utf8');
  console.log(`✅ Generated ${OUT_PATH} (${Object.keys(scores).length} pools, ${(Buffer.byteLength(JSON.stringify(payload))/1024).toFixed(1)} KB)`);
}

if (require.main === module) {
  main();
}
