/*
 * Pure core for the history archive v2 (scripts/history-archive.js daily job and
 * scripts/history-backfill.js one-time backfill): no network, no fs, only zlib/crypto.
 * CommonJS so `node test_history_archive.js` can unit-test it directly.
 *
 * R2 layout (bucket defi-garden-history-archive, keep-forever):
 *   raw/YYYY-MM.ndjson.gz    one line per point {ts,pool_id,apy,tvl_usd,src[,apy_base,apy_reward]}
 *                            sorted by (ts, pool_id, src), dedupe key (ts, pool_id, src)
 *   daily/YYYY-MM.ndjson.gz  one line per (pool_id, UTC day), built from the single
 *                            highest-precedence source present for that pool-day
 *   manifest.json            watermarks + per-month {rows, bytes, sha256}; written LAST
 * Trust rails: APYs above APY_SANITY_LIMIT are KEPT in raw (flag, never hide) and only
 * excluded from the daily statistics.
 */

'use strict';

const zlib = require('zlib');
const crypto = require('crypto');
const { totalApy, APY_SANITY_LIMIT } = require('../src/poller-core.js');

const RAW_SOURCES = ['samples', 'legacy_hourly', 'git_snapshot', 'ci_snapshot'];
const SOURCE_PRECEDENCE = [...RAW_SOURCES, 'git_history'];   // index 0 wins
const RETENTION_DAYS = 120;
const MANIFEST_SCHEMA_VERSION = 1;

// ---- keys ---------------------------------------------------------------------
/** 'YYYY-MM' of a unix-seconds timestamp, UTC. */
function monthKey(ts) { return new Date(Number(ts) * 1000).toISOString().slice(0, 7); }
/** 'YYYY-MM-DD' of a unix-seconds timestamp, UTC. */
function dayKey(ts) { return new Date(Number(ts) * 1000).toISOString().slice(0, 10); }

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ---- raw rows -----------------------------------------------------------------
/** Canonical raw row (fixed key order => deterministic bytes). Throws on garbage. */
function normalizeRaw(r) {
  if (!r || typeof r.pool_id !== 'string' || !r.pool_id) throw new Error('history-archive: raw row without pool_id');
  const ts = Math.floor(Number(r.ts));
  if (!Number.isFinite(ts)) throw new Error(`history-archive: raw row with bad ts: ${r.ts}`);
  if (!isNum(r.apy) || !isNum(r.tvl_usd)) throw new Error(`history-archive: raw row with non-finite apy/tvl_usd (${r.pool_id} @ ${ts})`);
  if (!RAW_SOURCES.includes(r.src)) throw new Error(`history-archive: raw row with unknown src: ${r.src}`);
  const out = { ts, pool_id: r.pool_id, apy: r.apy, tvl_usd: r.tvl_usd, src: r.src };
  if (isNum(r.apy_base)) out.apy_base = r.apy_base;
  if (isNum(r.apy_reward)) out.apy_reward = r.apy_reward;
  return out;
}

const compareRaw = (a, b) => (a.ts - b.ts) || cmp(a.pool_id, b.pool_id) || cmp(a.src, b.src);

/** Union of two raw-row arrays: normalized, deduped on (ts,pool_id,src) with `incoming` winning, sorted. */
function mergeRaw(existing, incoming) {
  const all = [];
  (existing || []).forEach((r) => all.push(normalizeRaw(r)));
  (incoming || []).forEach((r) => all.push(normalizeRaw(r)));
  all.sort(compareRaw);                  // stable: on equal keys the later (incoming) row stays last
  const out = [];
  for (const r of all) {
    const prev = out[out.length - 1];
    if (prev && compareRaw(prev, r) === 0) out[out.length - 1] = r;
    else out.push(r);
  }
  return out;
}

// ---- ndjson.gz ----------------------------------------------------------------
/** Deterministic gzip of one JSON line per row (fixed level; Node writes mtime 0). */
function serializeNdjsonGz(rows) {
  const text = rows.length ? rows.map((r) => JSON.stringify(r)).join('\n') + '\n' : '';
  return zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
}

function parseNdjsonGz(buf) {
  if (!buf || !buf.length) return [];
  const text = zlib.gunzipSync(buf).toString('utf8');
  const rows = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    if (end > start) rows.push(JSON.parse(text.slice(start, end)));
    start = end + 1;
  }
  return rows;
}

// ---- daily rollup -------------------------------------------------------------
const round6 = (n) => Math.round(n * 1e6) / 1e6;

function dailyFromPoints(day, poolId, src, points) {
  const sorted = points.slice().sort((a, b) => a.ts - b.ts);
  const valid = sorted.filter((p) => p.apy <= APY_SANITY_LIMIT);
  if (!valid.length) {
    const last = sorted[sorted.length - 1];
    return { day, pool_id: poolId, open: null, close: null, min: null, max: null, mean: null,
      n: sorted.length, tvl_close: last.tvl_usd, src, anomalous: true };
  }
  let min = Infinity; let max = -Infinity; let sum = 0;
  valid.forEach((p) => { if (p.apy < min) min = p.apy; if (p.apy > max) max = p.apy; sum += p.apy; });
  const first = valid[0]; const last = valid[valid.length - 1];
  return { day, pool_id: poolId, open: first.apy, close: last.apy, min, max, mean: round6(sum / valid.length),
    n: sorted.length, tvl_close: last.tvl_usd, src };
}

/** A git_history entry ({day,pool_id,apy,tvl_usd}) or a preformed `row` (see gitHistoryFromDaily) as a daily row. */
function dailyFromHistoryEntry(e) {
  if (e.row) return e.row;
  const pts = [{ ts: 0, apy: e.apy, tvl_usd: e.tvl_usd }];
  return dailyFromPoints(e.day, e.pool_id, 'git_history', pts);
}

/**
 * Daily rows for the given raw rows (+ daily-level git_history entries). For each pool-day only
 * the points of the highest-precedence raw source are used; git_history fills pool-days no raw source covers.
 */
function rollupDaily(rawRows, gitHistoryDaily) {
  const groups = new Map();   // day\0pool -> { rank, src, day, pool, points }
  for (const r of rawRows || []) {
    const rank = SOURCE_PRECEDENCE.indexOf(r.src);
    if (rank === -1 || rank >= RAW_SOURCES.length) throw new Error(`history-archive: unknown src in rollup: ${r.src}`);
    const day = dayKey(r.ts);
    const key = day + '\0' + r.pool_id;
    const g = groups.get(key);
    if (!g || rank < g.rank) groups.set(key, { rank, src: r.src, day, pool: r.pool_id, points: [r] });
    else if (rank === g.rank) g.points.push(r);
  }
  const rows = [];
  groups.forEach((g) => rows.push(dailyFromPoints(g.day, g.pool, g.src, g.points)));
  const hist = new Map();
  for (const e of gitHistoryDaily || []) hist.set(e.day + '\0' + e.pool_id, e);   // last wins
  hist.forEach((e, key) => { if (!groups.has(key)) rows.push(dailyFromHistoryEntry(e)); });
  rows.sort((a, b) => cmp(a.day, b.day) || cmp(a.pool_id, b.pool_id));
  return rows;
}

/** Recover the git_history entries from an existing daily file so a rebuild never drops them. */
function gitHistoryFromDaily(dailyRows) {
  return (dailyRows || []).filter((r) => r && r.src === 'git_history')
    .map((r) => ({ day: r.day, pool_id: r.pool_id, row: r }));
}

// ---- snapshot / history file readers -------------------------------------------
/** Unix seconds of a snapshot's generatedAt, or null. */
function snapshotTs(snapshot) {
  const ms = Date.parse(snapshot && snapshot.generatedAt);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** Raw points for every pool of a pools-snapshot.json, at ts = floor(generatedAt). apy = totalApy (never re-derived). */
function pointsFromSnapshot(snapshot, src) {
  const ts = snapshotTs(snapshot);
  const pools = snapshot && Array.isArray(snapshot.pools) ? snapshot.pools : [];
  if (ts === null) return [];
  const out = [];
  for (const p of pools) {
    if (!p || typeof p.pool !== 'string' || !p.pool) continue;
    if (p.tvlUsd === null || p.tvlUsd === undefined) continue;
    const apy = totalApy(p);
    const tvl = Number(p.tvlUsd);
    if (!isNum(apy) || !isNum(tvl)) continue;
    const row = { ts, pool_id: p.pool, apy, tvl_usd: tvl, src };
    if (isNum(p.apyBase)) row.apy_base = p.apyBase;
    if (isNum(p.apyReward)) row.apy_reward = p.apyReward;
    out.push(row);
  }
  return out;
}

/** Daily-level git_history entries from a data/history/<date>.json ({date, pools:{id:[apy,tvl]}}). */
function pointsFromHistoryFile(json, fallbackDate) {
  const day = json && /^\d{4}-\d{2}-\d{2}$/.test(String(json.date)) ? json.date
    : (/^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate)) ? fallbackDate : null);
  const pools = json && json.pools && typeof json.pools === 'object' ? json.pools : null;
  if (!day || !pools) return [];
  const out = [];
  Object.keys(pools).forEach((id) => {
    const v = pools[id];
    if (!id || !Array.isArray(v) || !isNum(v[0]) || !isNum(v[1])) return;
    out.push({ day, pool_id: id, apy: v[0], tvl_usd: v[1] });
  });
  return out;
}

// ---- wrangler d1 export parser ---------------------------------------------------
/**
 * Rows of table pool_history from `wrangler d1 export --table pool_history --no-schema` output.
 * Tolerant: single- or multi-row VALUES, optional column list (default order pool_id, ts, apy, tvl_usd),
 * quoted ids with '' escapes, ints / negatives / exponents, NULLs (row skipped), other statements ignored.
 * Returns { rows: [{ts,pool_id,apy,tvl_usd}], skipped }.
 */
function parseD1ExportSql(text) {
  const rows = [];
  let skipped = 0;
  const head = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(?:"pool_history"|`pool_history`|\[pool_history\]|pool_history)\s*(\([^)]*\))?\s*VALUES\s*/gi;
  let m;
  while ((m = head.exec(text)) !== null) {
    const cols = m[1] ? m[1].slice(1, -1).split(',').map((c) => c.trim().replace(/^["`\[]|["`\]]$/g, '')) : ['pool_id', 'ts', 'apy', 'tvl_usd'];
    let i = head.lastIndex;
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] !== '(') break;
      i++;
      const vals = [];
      for (;;) {
        while (i < text.length && /\s/.test(text[i])) i++;
        if (text[i] === "'") {
          let s = '';
          i++;
          for (;;) {
            if (i >= text.length) throw new Error('history-archive: unterminated string in D1 export');
            if (text[i] === "'") {
              if (text[i + 1] === "'") { s += "'"; i += 2; continue; }
              i++; break;
            }
            s += text[i++];
          }
          vals.push(s);
        } else {
          let j = i;
          while (j < text.length && text[j] !== ',' && text[j] !== ')') j++;
          const tok = text.slice(i, j).trim();
          vals.push(/^null$/i.test(tok) ? null : (tok === '' ? NaN : Number(tok)));
          i = j;
        }
        while (i < text.length && /\s/.test(text[i])) i++;
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ')') { i++; break; }
        throw new Error(`history-archive: malformed VALUES tuple near offset ${i}`);
      }
      const rec = {};
      cols.forEach((c, k) => { rec[c] = vals[k]; });
      const ts = Math.floor(rec.ts);
      if (typeof rec.pool_id === 'string' && rec.pool_id && Number.isFinite(ts) && isNum(rec.apy) && isNum(rec.tvl_usd)) {
        rows.push({ ts, pool_id: rec.pool_id, apy: rec.apy, tvl_usd: rec.tvl_usd });
      } else skipped++;
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] === ',') { i++; continue; }
      break;
    }
    head.lastIndex = i;
  }
  return { rows, skipped };
}

// ---- manifest -----------------------------------------------------------------
function emptyManifest() {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION, updatedAt: null,
    watermark: { samples_ts: 0, samples_pool_id: '', ci_snapshot_generatedAt: null },
    months: {}
  };
}

/** File stats for one month file: {rows, bytes, sha256} (`rows` = line count). */
function fileStats(rows, buf) { return { rows, bytes: buf.length, sha256: sha256(buf) }; }

/** New manifest with `month` set to {raw, daily} (input untouched, months key-sorted). */
function updateManifest(manifest, month, { raw, daily }, updatedAt) {
  const base = manifest || emptyManifest();
  const months = { ...base.months, [month]: { raw: { ...raw }, daily: { ...daily } } };
  const sorted = {};
  Object.keys(months).sort().forEach((k) => { sorted[k] = months[k]; });
  return { ...base, updatedAt: updatedAt || base.updatedAt, months: sorted };
}

function withWatermark(manifest, patch) {
  return { ...manifest, watermark: { ...manifest.watermark, ...patch } };
}

// ---- D1 sql builders ---------------------------------------------------------------
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sqlInt = (n, label) => {
  const v = Number(n);
  if (!Number.isSafeInteger(v)) throw new Error(`history-archive: ${label} must be an integer, got ${n}`);
  return String(v);
};

/** Keyset page over D1 `samples` after (sinceTs, sincePoolId). */
function buildSamplesPageSql(sinceTs, sincePoolId, pageSize) {
  const t = sqlInt(sinceTs, 'sinceTs');
  const n = sqlInt(pageSize, 'pageSize');
  if (Number(n) < 1) throw new Error('history-archive: pageSize must be >= 1');
  return `SELECT ts, pool_id, apy, tvl_usd FROM samples WHERE ts > ${t} OR (ts = ${t} AND pool_id > ${sqlStr(sincePoolId || '')}) ORDER BY ts, pool_id LIMIT ${n}`;
}

/**
 * Retention delete: only rows older than `retentionDays` AND strictly before the archived watermark
 * (the watermark's own slot may be only partly archived, so it is never deleted). null = nothing to trim.
 */
function buildTrimSql(nowSeconds, watermarkTs, retentionDays = RETENTION_DAYS) {
  const wm = Number(watermarkTs);
  if (!Number.isSafeInteger(wm) || wm <= 0) return null;
  const cutoff = Math.floor(Number(nowSeconds)) - retentionDays * 86400;
  if (!Number.isSafeInteger(cutoff)) throw new Error('history-archive: bad now for trim');
  return `DELETE FROM samples WHERE ts < ${sqlInt(cutoff, 'cutoff')} AND ts < ${sqlInt(wm, 'watermark')}`;
}

module.exports = {
  RAW_SOURCES, SOURCE_PRECEDENCE, RETENTION_DAYS, MANIFEST_SCHEMA_VERSION, APY_SANITY_LIMIT,
  totalApy, sha256, monthKey, dayKey, normalizeRaw, mergeRaw, compareRaw,
  serializeNdjsonGz, parseNdjsonGz, rollupDaily, gitHistoryFromDaily,
  snapshotTs, pointsFromSnapshot, pointsFromHistoryFile, parseD1ExportSql,
  emptyManifest, fileStats, updateManifest, withWatermark, buildSamplesPageSql, buildTrimSql
};
