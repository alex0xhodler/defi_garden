/*
 * Unit tests for TimesFM 3.0 Forecasting & DeFi Score (top 100 pools).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing TimesFM 3.0 forecast & DeFi score schema...');

const snapshotPath = path.join(__dirname, 'data', 'pools-snapshot.json');
assert.ok(fs.existsSync(snapshotPath), 'pools-snapshot.json must exist');

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
assert.ok(Array.isArray(snapshot.pools), 'snapshot.pools must be an array');
assert.ok(snapshot.forecastMeta, 'forecastMeta must exist on snapshot');
assert.strictEqual(snapshot.forecastMeta.model, 'google/timesfm-3.0-pytorch');
assert.strictEqual(snapshot.forecastMeta.horizonDays, 14);

const enriched = snapshot.pools.filter(p => p.forecast !== null && p.forecast !== undefined);
console.log(`Verified ${enriched.length} pools with active forecasts.`);
assert.ok(enriched.length >= 10, `Expected at least 10 enriched pools, found ${enriched.length}`);

// Validate schema on enriched pools
enriched.forEach(p => {
  const f = p.forecast;
  assert.strictEqual(typeof f.horizonDays, 'number', `${p.pool}: horizonDays must be number`);
  assert.strictEqual(typeof f.p10, 'number', `${p.pool}: p10 must be number`);
  assert.strictEqual(typeof f.p50, 'number', `${p.pool}: p50 must be number`);
  assert.strictEqual(typeof f.p90, 'number', `${p.pool}: p90 must be number`);
  assert.strictEqual(typeof f.organicApy, 'number', `${p.pool}: organicApy must be number`);
  assert.strictEqual(typeof f.rewardApy, 'number', `${p.pool}: rewardApy must be number`);
  assert.strictEqual(typeof f.predictedTvlUsd, 'number', `${p.pool}: predictedTvlUsd must be number`);
  assert.strictEqual(typeof f.predictedTvlDelta, 'number', `${p.pool}: predictedTvlDelta must be number`);
  assert.strictEqual(typeof f.forwardDelta, 'number', `${p.pool}: forwardDelta must be number`);
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(f.crashRisk), `${p.pool}: crashRisk must be valid`);
  assert.strictEqual(typeof f.skew, 'number', `${p.pool}: skew must be number`);
  assert.ok(Array.isArray(f.trajectory), `${p.pool}: trajectory must be array`);
  assert.ok(f.p10 <= f.p90, `${p.pool}: p10 (${f.p10}) should be <= p90 (${f.p90})`);

  const s = p.defiScore;
  assert.ok(s, `${p.pool}: defiScore must exist`);
  assert.strictEqual(typeof s.score, 'number', `${p.pool}: score must be number`);
  assert.ok(s.score >= 0 && s.score <= 100, `${p.pool}: score must be between 0 and 100`);
  assert.ok(['AAA', 'AA', 'A', 'BBB', 'HIGH RISK'].includes(s.rating), `${p.pool}: rating must be valid`);
  assert.strictEqual(typeof s.breakdown.stability, 'number');
  assert.strictEqual(typeof s.breakdown.sustainability, 'number');
  assert.strictEqual(typeof s.breakdown.stickiness, 'number');
  assert.strictEqual(typeof s.breakdown.liquidity, 'number');
});

// Validate null-safety on unenriched pools
const unenriched = snapshot.pools.filter(p => p.forecast === null);
assert.ok(unenriched.length > 0, 'Some pools should remain null-safely unenriched');
unenriched.slice(0, 50).forEach(p => {
  assert.strictEqual(p.forecast, null);
  assert.strictEqual(p.defiScore, null);
});

console.log('✓ All TimesFM forecast & DeFi Score assertions passed successfully!');
