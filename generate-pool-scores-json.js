#!/usr/bin/env node
/**
 * generate-pool-scores-json.js
 *
 * Generates a compact index of scored pool metrics (scores, forecast bands,
 * and retail access flags) in data/pool-scores.json.
 *
 * Compact Array Schema:
 * [score, [stability, sustainability, stickiness, liquidity] (each 0-100, from defiScore.pillarsPct, or null), [low, central, high, crashRisk, forwardDelta], isRestricted]
 * Shared disclaimer and access text are stored once at top-level.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PERMISSIONED_PROJECT_LIST } = require('./permissioned-projects.js');

const SNAPSHOT_PATH = path.join(__dirname, 'data/pools-snapshot.json');
const OUT_PATH = path.join(__dirname, 'data/pool-scores.json');

const PILLAR_ORDER = ['stability', 'sustainability', 'stickiness', 'liquidity'];
function pillarsPctOf(ds) {
  const pp = ds && ds.pillarsPct;
  if (!pp || !PILLAR_ORDER.every(k => Number.isFinite(pp[k]))) return null;
  return PILLAR_ORDER.map(k => Math.max(0, Math.min(100, Math.round(pp[k]))));
}

function main() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error('❌ pools-snapshot.json not found');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const pools = raw.pools || raw.data || [];

  // Track-record numbers live ONLY on /forecast-accuracy (owner decision 2026-10-25).
  const forecastDisclaimer = "Experimental forward forecast: not yet shown to be more accurate than assuming today's rate holds. The public track record is at https://www.defi.garden/forecast-accuracy.";

  const scores = {};
  for (const p of pools) {
    if (!p.defiScore && !p.forecast) continue;
    const isRestricted = PERMISSIONED_PROJECT_LIST.has(String(p.project || '').toLowerCase());
    scores[p.pool] = [
      p.defiScore ? Number(p.defiScore.score.toFixed(1)) : null,
      pillarsPctOf(p.defiScore),
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
    schemaVersion: 3,
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
