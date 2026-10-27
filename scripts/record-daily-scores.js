#!/usr/bin/env node
/**
 * scripts/record-daily-scores.js  (DeFi Garden Terminal, P1 groundwork)
 *
 * Builds the SQL that upserts today's per-pool DeFi Score, band and pillar TIERS
 * into the Terminal D1 table `score_daily` (see docs/terminal-spec.md). This is PAID
 * data: the output is written ONLY to the path given with --out (use $RUNNER_TEMP in
 * CI) and is never committed or published. There is deliberately no default output
 * path inside the repo tree, because anything in the repo or site tree is public.
 *
 * Applied in CI (once the owner has created the D1 database and token) with:
 *   wrangler d1 execute <db> --remote --file "$RUNNER_TEMP/score-daily.sql"
 *
 * Reads only: score, rating (band name) and pillarsTier. It never reads exact pillar
 * numbers or raw pillar points (owner decision 2026-10-26).
 *
 * Usage: node scripts/record-daily-scores.js --out <file.sql> [--date YYYY-MM-DD]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '../data/pools-snapshot.json');
const BANDS = new Set(['AAA', 'AA', 'A', 'BBB', 'HIGH RISK']);
const PILLAR_ORDER = ['stability', 'sustainability', 'stickiness', 'liquidity'];
const TIER_CODE = { High: 'H', Medium: 'M', Low: 'L' };
const POOL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,99}$/;
const BATCH = 200;

const SCHEMA_SQL = 'CREATE TABLE IF NOT EXISTS score_daily (\n' +
  '  pool_id TEXT NOT NULL,\n  day TEXT NOT NULL,\n  score REAL NOT NULL,\n  band TEXT NOT NULL,\n  tiers TEXT,\n' +
  '  PRIMARY KEY (pool_id, day)\n) WITHOUT ROWID;\n';

function tiersCode(pt) {
  if (!pt || typeof pt !== 'object') return null;
  let out = '';
  for (const k of PILLAR_ORDER) {
    if (!TIER_CODE[pt[k]]) return null;
    out += TIER_CODE[pt[k]];
  }
  return out;
}

/** Pure: pools array + day -> list of validated rows (same rails as the public forecast ledger). */
function buildRows(pools, day) {
  const rows = [];
  for (const p of pools) {
    if (!p || !POOL_RE.test(String(p.pool || ''))) continue;
    const ds = p.defiScore;
    if (!ds || typeof ds.score !== 'number' || !Number.isFinite(ds.score) || !BANDS.has(ds.rating)) continue;
    if (Number(p.tvlUsd || 0) < 100000) continue;
    if ((Number(p.apyBase) || 0) + (Number(p.apyReward) || 0) > 1000) continue;
    rows.push({ pool_id: p.pool, day, score: Math.round(ds.score * 10) / 10, band: ds.rating, tiers: tiersCode(ds.pillarsTier) });
  }
  return rows;
}

function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

function buildSql(rows) {
  let sql = SCHEMA_SQL;
  for (let i = 0; i < rows.length; i += BATCH) {
    const vals = rows.slice(i, i + BATCH).map((r) =>
      '(' + [sqlStr(r.pool_id), sqlStr(r.day), r.score, sqlStr(r.band), r.tiers ? sqlStr(r.tiers) : 'NULL'].join(',') + ')');
    sql += 'INSERT OR REPLACE INTO score_daily (pool_id, day, score, band, tiers) VALUES\n' + vals.join(',\n') + ';\n';
  }
  return sql;
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const out = arg('--out');
  if (!out) { console.error('--out <file.sql> is required (paid data is never written inside the repo tree by default)'); process.exit(2); }
  const day = arg('--date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { console.error('bad --date'); process.exit(2); }
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const rows = buildRows(raw.pools || raw.data || [], day);
  fs.writeFileSync(out, buildSql(rows), 'utf8');
  console.log('Wrote ' + rows.length + ' score rows for ' + day + ' to ' + out);
}

if (require.main === module) main();
module.exports = { buildRows, buildSql, tiersCode, SCHEMA_SQL };
