/* Unit gate for generate-track-record.js — the public forecast track record.
   Run: node test_track_record.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appendDay, scoreLog, emptyLog, HORIZON_DAYS } = require('./generate-track-record');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

// A pool whose APY sits flat at 4.0, forecast 4.0 [3.5, 4.5]; another that decays from 10 to 6,
// forecast 9 [8, 10] (the forecast is wrong, the naive baseline is worse).
function snap(date, pools) { return { generatedAt: date + 'T07:00:00.000Z', pools: pools }; }
function day(i) { const d = new Date(Date.UTC(2026, 8, 1 + i)); return d.toISOString().slice(0, 10); }
const flat = (i) => ({ pool: 'flat', symbol: 'USDC', project: 'a', chain: 'Ethereum', tvlUsd: 50e6, apyBase: 4, apyReward: 0,
  forecast: i === 0 ? { p10: 3.5, p50: 4, p90: 4.5 } : undefined });
const decay = (i) => ({ pool: 'decay', symbol: 'USDT', project: 'b', chain: 'Base', tvlUsd: 30e6,
  apyBase: i === 0 ? 10 : 6, apyReward: 0,
  // Drops below the eligibility floor after day 0: its actuals must still be logged.
  forecast: i === 0 ? { p10: 8, p50: 9, p90: 10 } : undefined });
const decayTvl = (i) => Object.assign(decay(i), { tvlUsd: i === 0 ? 30e6 : 1e6 });

let log = emptyLog();
for (let i = 0; i <= HORIZON_DAYS; i++) log = appendDay(log, snap(day(i), [flat(i), decayTvl(i)]));

check('appends one entry per UTC day and is idempotent for a repeated day', () => {
  const again = appendDay(log, snap(day(HORIZON_DAYS), [flat(1), decayTvl(1)]));
  assert.strictEqual(again.days.length, HORIZON_DAYS + 1);
});
check('keeps logging a pool with an open forecast after it leaves the eligible set', () => {
  const last = log.days[log.days.length - 1];
  const decayIdx = log.pools.indexOf('decay');
  assert.ok(last.rows.some(r => r[0] === decayIdx), 'decay still logged on the maturity day');
});

const rec = scoreLog(log);
check('scores forecasts that matured against the realized 14-day mean', () => {
  assert.strictEqual(rec.matured.n, 2);
  assert.strictEqual(rec.matured.coverage, 0.5); // flat inside its band; decay (actual 6) outside [8, 10]
});
check('reports forecast error next to the naive "rate persists" baseline', () => {
  // flat: forecast err 0, naive err 0. decay: forecast |9-6|=3, naive |10-6|=4.
  assert.strictEqual(rec.matured.medianAbsErrorForecast, 1.5);
  assert.strictEqual(rec.matured.medianAbsErrorNaive, 2);
});
check('dates are honest: logging start and first maturity', () => {
  assert.strictEqual(rec.loggingSince, day(0));
  assert.strictEqual(rec.firstMaturityDate, day(HORIZON_DAYS));
  assert.strictEqual(rec.horizonDays, HORIZON_DAYS);
});
check('nothing matured yet -> n = 0 and no metrics are invented', () => {
  let young = emptyLog();
  for (let i = 0; i < 5; i++) young = appendDay(young, snap(day(i), [flat(i)]));
  const r = scoreLog(young);
  assert.strictEqual(r.matured.n, 0);
  assert.strictEqual(r.matured.coverage, null);
  assert.strictEqual(r.matured.medianAbsErrorForecast, null);
});
check('a forecast without enough realized observations is not scored', () => {
  let sparse = emptyLog();
  sparse = appendDay(sparse, snap(day(0), [flat(0)]));
  sparse = appendDay(sparse, snap(day(HORIZON_DAYS), [flat(1)])); // 1 observation in window
  assert.strictEqual(scoreLog(sparse).matured.n, 0);
});

const committed = path.join(__dirname, 'data', 'track-record.json');
check('committed data/track-record.json has the published shape', () => {
  const r = JSON.parse(fs.readFileSync(committed, 'utf8'));
  ['loggingSince', 'firstMaturityDate', 'horizonDays', 'matured'].forEach(k => assert.ok(k in r, k));
  ['n', 'coverage', 'medianAbsErrorForecast', 'medianAbsErrorNaive'].forEach(k => assert.ok(k in r.matured, k));
});

console.log(passed + ' track-record assertions passed');
