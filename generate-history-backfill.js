/*
 * generate-history-backfill.js — one-time backfill of the D1 pool-history store
 * (ticket 108/109/110) from the committed file-history in data/history/*.json.
 *
 * WHY: compute-kpis.js (110) switches to the D1 /history endpoint the moment it
 * returns ANY rows, and then ignores the file history. D1 starts empty, so without
 * a backfill the KPI window would collapse from the ~N committed file-days to 1,
 * nulling the 117 Sharpe / stability surfaces for ~8 days until D1 re-accrues.
 * This emits SQL that seeds D1 with the exact same day-buckets the files hold, so
 * the switch is seamless — reshapeDbRows(these rows) === the file history entries,
 * hence identical KPI values from either source.
 *
 * Each file `{date, pools:{pool_id:[apy,tvl]}}` becomes rows
 * `(pool_id, ts, apy, tvl_usd)` where ts = midnight-UTC of `date` — reshapeDbRows
 * buckets ts back to that same UTC calendar day. Same schema, columns, and
 * `INSERT OR REPLACE` semantics as the Worker poller (src/poller.js), so re-running
 * the backfill or overlapping with a live poll is idempotent on PK (pool_id, ts).
 *
 * Usage (from your CLI):
 *   node generate-history-backfill.js                 # writes ./backfill.sql
 *   node generate-history-backfill.js --out backfill.sql --data data
 *   wrangler d1 execute defi-garden-history --file=backfill.sql --remote
 */

'use strict';
const fs = require('fs');
const path = require('path');

const ROWS_PER_INSERT = 200; // keep each statement well under SQLite's compound-VALUES limit

/** Midnight-UTC of a `YYYY-MM-DD` date as integer unix seconds. Null if unparseable. */
function midnightUtcSeconds(date) {
  const ms = Date.parse(String(date) + 'T00:00:00.000Z');
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function round4(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1e4) / 1e4;
}

/** SQL-escape a text literal (pool ids are hex/uuid but escape defensively). */
function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

/** Flatten history file objects `{date, pools:{id:[apy,tvl]}}` → rows
 * `{pool_id, ts, apy, tvl_usd}`, mirroring the poller's slim row exactly. */
function rowsFromHistory(entries) {
  const rows = [];
  (entries || []).forEach((entry) => {
    if (!entry || !entry.date || !entry.pools) return;
    const ts = midnightUtcSeconds(entry.date);
    if (ts == null) return;
    Object.keys(entry.pools).forEach((poolId) => {
      const pt = entry.pools[poolId];
      if (!Array.isArray(pt) || pt.length < 2) return;
      rows.push({ pool_id: poolId, ts, apy: round4(pt[0]), tvl_usd: Number(pt[1]) || 0 });
    });
  });
  return rows;
}

/** Render rows as chunked `INSERT OR REPLACE` statements (same table/columns as the poller). */
function toSql(rows) {
  const header =
    '-- backfill for pool_history (generate-history-backfill.js). Idempotent on PK (pool_id, ts).\n' +
    'PRAGMA foreign_keys=OFF;\n';
  if (!rows.length) return header + '-- (no history rows found)\n';
  const parts = [header];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const values = chunk
      .map((r) => `(${sqlStr(r.pool_id)},${r.ts},${r.apy},${r.tvl_usd})`)
      .join(',');
    parts.push(
      'INSERT OR REPLACE INTO pool_history (pool_id, ts, apy, tvl_usd) VALUES ' + values + ';');
  }
  return parts.join('\n') + '\n';
}

function readHistoryDir(dataDir) {
  const dir = path.join(dataDir, 'history');
  let files;
  try { files = fs.readdirSync(dir); } catch (e) { return []; }
  const out = [];
  files.filter((f) => f.endsWith('.json')).forEach((f) => {
    try { out.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); }
    catch (e) { /* skip corrupt */ }
  });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
  const dataDir = get('--data', 'data');
  const outPath = get('--out', 'backfill.sql');

  const entries = readHistoryDir(dataDir);
  const rows = rowsFromHistory(entries);
  const sql = toSql(rows);
  fs.writeFileSync(outPath, sql);

  const days = entries.map((e) => e && e.date).filter(Boolean);
  console.log(`📦 Wrote ${outPath}: ${rows.length} rows across ${days.length} day(s) ` +
    `(${days[0] || '-'} … ${days[days.length - 1] || '-'}).`);
  console.log(`   Load it:  wrangler d1 execute defi-garden-history --file=${outPath} --remote`);
}

module.exports = { midnightUtcSeconds, round4, sqlStr, rowsFromHistory, toSql, readHistoryDir };

if (require.main === module) main();
