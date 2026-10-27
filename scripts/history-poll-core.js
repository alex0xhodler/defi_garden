/*
 * Pure core for the v2 history poller (scripts/history-poll.js): no network, no fs.
 * CommonJS so `node test_history_poll.js` can unit-test it directly.
 *
 * Selection rule per pool (first match wins):
 *   tracked  tvl >= TRACK_MIN_TVL ($1M)
 *   sticky   was in the previous slot AND tvl >= KEEP_MIN_TVL ($500K) — hysteresis,
 *            so pools hovering near $1M do not get gappy series
 *   watch    on the /stocks watchlist, at ANY tvl
 * Trust rails: anomalous APYs (> 1000%) are KEPT, exactly like src/poller-core.js —
 * flag downstream, never hide. Rows with non-finite apy/tvl are skipped and counted.
 */

'use strict';

const { totalApy } = require('../src/poller-core.js');

const SLOT_SECONDS = 10800;          // 3 hours
const TRACK_MIN_TVL = 1_000_000;
const KEEP_MIN_TVL = 500_000;
const MAX_STATEMENT_BYTES = 90_000;  // D1 caps a statement at 100 KB; stay well under

/** Start of the 3-hour UTC slot containing `nowSeconds` (re-runs in a slot hit the same PKs). */
function slotTs(nowSeconds) {
  return Math.floor(Number(nowSeconds) / SLOT_SECONDS) * SLOT_SECONDS;
}

function selectPools(pools, { prevIds = new Set(), watchIds = new Set() } = {}) {
  const byId = new Map();
  const counts = { tracked: 0, sticky: 0, watch: 0, total: 0, skippedInvalid: 0 };
  (Array.isArray(pools) ? pools : []).forEach((p) => {
    if (!p || typeof p.pool !== 'string' || !p.pool) return;   // need a stable id
    const id = p.pool;
    if (byId.has(id)) return;                                   // de-duplicate
    const apy = totalApy(p);
    const tvl = Number(p.tvlUsd) || 0;
    if (!Number.isFinite(apy) || !Number.isFinite(tvl)) { counts.skippedInvalid++; return; }
    let reason = null;
    if (tvl >= TRACK_MIN_TVL) reason = 'tracked';
    else if (prevIds.has(id) && tvl >= KEEP_MIN_TVL) reason = 'sticky';
    else if (watchIds.has(id)) reason = 'watch';
    if (!reason) return;
    counts[reason]++;
    byId.set(id, { pool_id: id, apy, tvl_usd: tvl });
  });
  const rows = Array.from(byId.values()).sort((a, b) => (a.pool_id < b.pool_id ? -1 : a.pool_id > b.pool_id ? 1 : 0));
  counts.total = rows.length;
  return { rows, counts: { tracked: counts.tracked, sticky: counts.sticky, watch: counts.watch, total: counts.total }, skippedInvalid: counts.skippedInvalid };
}

function num(n, label) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`history-poll: non-finite ${label}: ${n}`);
  return String(n);   // JS number -> shortest round-trip decimal
}

/** INSERT OR REPLACE statements for one slot, chunked so each stays under D1's statement limit. */
function buildInsertSql(ts, rows, { rowsPerStatement = 400 } = {}) {
  const t = Math.floor(Number(ts));
  if (!Number.isFinite(t)) throw new Error(`history-poll: bad ts: ${ts}`);
  const stmts = [];
  for (let i = 0; i < rows.length; i += rowsPerStatement) {
    const values = rows.slice(i, i + rowsPerStatement).map((r) =>
      `(${t},'${String(r.pool_id).replace(/'/g, "''")}',${num(r.apy, 'apy')},${num(r.tvl_usd, 'tvl_usd')})`);
    const sql = `INSERT OR REPLACE INTO samples (ts, pool_id, apy, tvl_usd) VALUES ${values.join(',')};`;
    if (Buffer.byteLength(sql) > MAX_STATEMENT_BYTES) {
      throw new Error(`history-poll: statement ${Buffer.byteLength(sql)} bytes exceeds ${MAX_STATEMENT_BYTES}; lower rowsPerStatement`);
    }
    stmts.push(sql);
  }
  return stmts.length ? stmts.join('\n') + '\n' : '';
}

/** SQL for the fallback-run skip check: does slot `ts` already have any row? */
function slotExistsSql(ts) {
  const t = Math.floor(Number(ts));
  if (!Number.isFinite(t)) throw new Error(`history-poll: bad ts: ${ts}`);
  return `SELECT COUNT(*) AS n FROM (SELECT 1 FROM samples WHERE ts = ${t} LIMIT 1)`;
}

/** n from wrangler's `d1 execute --json` output ([{ results: [{ n }] }]); throws if unparseable. */
function countFromD1Json(json) {
  const first = Array.isArray(json) ? json[0] : null;
  const row = first && Array.isArray(first.results) ? first.results[0] : null;
  const n = row ? Number(row.n) : NaN;
  if (!Number.isFinite(n)) throw new Error('history-poll: unexpected D1 count output');
  return n;
}

/** Pool ids from the published /data/stocks-pools.json ({ pools: [{ id }] }); tolerant of junk. */
function watchIdsFromStocksPools(json) {
  const out = new Set();
  const list = json && Array.isArray(json.pools) ? json.pools : [];
  list.forEach((p) => { if (p && typeof p.id === 'string' && p.id) out.add(p.id); });
  return out;
}

module.exports = {
  SLOT_SECONDS, TRACK_MIN_TVL, KEEP_MIN_TVL, MAX_STATEMENT_BYTES,
  slotTs, totalApy, selectPools, buildInsertSql, watchIdsFromStocksPools,
  slotExistsSql, countFromD1Json
};
