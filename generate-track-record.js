#!/usr/bin/env node

/**
 * Public forecast track record.
 *
 * compute-forecasts.py publishes, per pool, a 14-day forecast whose p50 is the mean predicted APY
 * over the next 14 days (p10/p90: the daily quantile bands, averaged the same way). This script
 * keeps a compact rolling log of what we predicted and what the APY actually was, and scores every
 * forecast once its 14-day window has passed:
 *
 *   actual   = mean of the logged APYs in (forecast day, forecast day + 14]
 *   covered  = p10 <= actual <= p90
 *   error    = |p50 - actual|          (the forecast)
 *   naive    = |APY on forecast day - actual|   (baseline: "today's rate persists")
 *
 * The naive baseline is published next to the forecast error on purpose: a forecast that does not
 * beat it has no skill, and the page must be able to say so.
 *
 * data/forecast-log.json  — the rolling log (LOG_RETENTION_DAYS). Rows are [poolIndex, apy, p10, p50, p90];
 *                           forecast fields are null on rows that only record an actual. A pool with an
 *                           open forecast keeps being logged after it leaves the eligible set, so the
 *                           score has no survivorship bias.
 * data/track-record.json  — the published summary the landing reads.
 *
 * CI checks out shallow, so it cannot read snapshot history: it appends today's snapshot. A one-time
 * local backfill seeds the log from real committed snapshots:
 *   node generate-track-record.js --backfill-git 2026-09-10
 *
 * Usage:
 *   node generate-track-record.js                  # append today's snapshot, write both files
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const TRUST_RAILS = require('./trust-rails.js');

const HORIZON_DAYS = 14;
const LOG_RETENTION_DAYS = 45;
const MIN_TVL = 10000000;          // same floor as the landing leaderboard
const MIN_OBSERVATIONS = 7;        // realized APYs needed inside a window to score it
const DATA_DIR = path.join(__dirname, 'data');
const LOG_PATH = path.join(DATA_DIR, 'forecast-log.json');
const RECORD_PATH = path.join(DATA_DIR, 'track-record.json');

function emptyLog() {
  return { schemaVersion: 1, horizonDays: HORIZON_DAYS, pools: [], days: [] };
}

function utcDate(iso) { return String(iso).slice(0, 10); }
function addDays(date, n) {
  const d = new Date(date + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function round(n, dp) { const f = Math.pow(10, dp); return Math.round(n * f) / f; }
function totalApy(p) { return round((Number(p.apyBase) || 0) + (Number(p.apyReward) || 0), 4); }
function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function openForecastPools(log, date) {
  const open = new Set();
  const since = addDays(date, -HORIZON_DAYS);
  log.days.forEach(d => {
    if (d.date >= since && d.date < date) d.rows.forEach(r => { if (r[3] !== null) open.add(log.pools[r[0]]); });
  });
  return open;
}

function appendDay(log, snapshot) {
  const next = { schemaVersion: log.schemaVersion, horizonDays: log.horizonDays, pools: log.pools.slice(), days: log.days.slice() };
  const date = utcDate(snapshot.generatedAt);
  const open = openForecastPools(next, date);
  const index = new Map(next.pools.map((id, i) => [id, i]));
  const rows = [];
  (snapshot.pools || []).forEach(p => {
    const apy = totalApy(p);
    if (!(apy >= 0) || apy > TRUST_RAILS.APY_SANITY_LIMIT) return;
    const f = p.forecast;
    const forecastable = f && typeof f.p50 === 'number' && Number(p.tvlUsd) >= MIN_TVL;
    if (!forecastable && !open.has(p.pool)) return;
    if (!index.has(p.pool)) { index.set(p.pool, next.pools.length); next.pools.push(p.pool); }
    rows.push(forecastable
      ? [index.get(p.pool), apy, f.p10, f.p50, f.p90]
      : [index.get(p.pool), apy, null, null, null]);
  });
  next.days = next.days.filter(d => d.date !== date);
  next.days.push({ date: date, rows: rows });
  next.days.sort((a, b) => (a.date < b.date ? -1 : 1));
  const cutoff = addDays(next.days[next.days.length - 1].date, -LOG_RETENTION_DAYS);
  next.days = next.days.filter(d => d.date >= cutoff);
  return next;
}

function scoreLog(log) {
  const days = log.days;
  const first = days.length ? days[0].date : null;
  const latest = days.length ? days[days.length - 1].date : null;
  const apyByPoolDay = new Map();
  days.forEach(d => d.rows.forEach(r => apyByPoolDay.set(r[0] + '|' + d.date, r[1])));

  const forecastErrors = [];
  const naiveErrors = [];
  let covered = 0;
  const forecastDates = new Set();
  days.forEach(d => {
    const matures = addDays(d.date, HORIZON_DAYS);
    if (!latest || matures > latest) return;
    d.rows.forEach(r => {
      if (r[3] === null) return;
      const actuals = [];
      let lastObserved = null;
      for (let i = 1; i <= HORIZON_DAYS; i++) {
        const day = addDays(d.date, i);
        const v = apyByPoolDay.get(r[0] + '|' + day);
        if (typeof v === 'number') { actuals.push(v); lastObserved = day; }
      }
      if (actuals.length < MIN_OBSERVATIONS) return;
      if (lastObserved < addDays(d.date, HORIZON_DAYS - 2)) return;
      const actual = actuals.reduce((a, b) => a + b, 0) / actuals.length;
      forecastErrors.push(Math.abs(r[3] - actual));
      naiveErrors.push(Math.abs(r[1] - actual));
      if (actual >= r[2] && actual <= r[4]) covered++;
      forecastDates.add(d.date);
    });
  });
  const n = forecastErrors.length;
  const beats = forecastErrors.filter((e, i) => e < naiveErrors[i]).length;
  return {
    schemaVersion: 1,
    horizonDays: HORIZON_DAYS,
    minTvlUsd: MIN_TVL,
    loggingSince: first,
    firstMaturityDate: first ? addDays(first, HORIZON_DAYS) : null,
    latestLogDate: latest,
    matured: {
      n: n,
      forecastDates: Array.from(forecastDates).sort(),
      coverage: n ? round(covered / n, 4) : null,
      medianAbsErrorForecast: n ? round(median(forecastErrors), 4) : null,
      medianAbsErrorNaive: n ? round(median(naiveErrors), 4) : null,
      forecastBeatsNaiveShare: n ? round(beats / n, 4) : null
    }
  };
}

function readLog() {
  return fs.existsSync(LOG_PATH) ? JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')) : emptyLog();
}

function writeOutputs(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log) + '\n');
  const record = scoreLog(log);
  fs.writeFileSync(RECORD_PATH, JSON.stringify(record, null, 2) + '\n');
  console.log('generate-track-record: ' + log.days.length + ' logged days, ' + record.matured.n + ' matured forecasts scored');
}

function backfillFromGit(since) {
  const out = execFileSync('git', ['log', '--reverse', '--format=%H %cI', '--since=' + since, '--', 'data/pools-snapshot.json'], { cwd: __dirname, encoding: 'utf8' });
  const lastCommitPerDay = new Map();
  out.trim().split('\n').filter(Boolean).forEach(line => {
    const parts = line.split(' ');
    lastCommitPerDay.set(parts[1].slice(0, 10), parts[0]);
  });
  let log = readLog();
  lastCommitPerDay.forEach((sha) => {
    const raw = execFileSync('git', ['show', sha + ':data/pools-snapshot.json'], { cwd: __dirname, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const snap = JSON.parse(raw);
    log = appendDay(log, snap);
    console.log('  backfilled ' + utcDate(snap.generatedAt) + ' from ' + sha.slice(0, 11));
  });
  return log;
}

function main() {
  const args = process.argv.slice(2);
  const bf = args.indexOf('--backfill-git');
  let log;
  if (bf >= 0) {
    log = backfillFromGit(args[bf + 1]);
  } else {
    const snapshot = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'pools-snapshot.json'), 'utf8'));
    log = appendDay(readLog(), snapshot);
  }
  writeOutputs(log);
}

if (require.main === module) main();

module.exports = { appendDay, scoreLog, emptyLog, HORIZON_DAYS, MIN_OBSERVATIONS };
