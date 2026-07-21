#!/usr/bin/env node

/**
 * Per-pool KPI computation + slim history retention for DeFi Garden (backlog 087
 * — data-layer movement leg 2, phase 0). Runs AFTER generate-pools-snapshot.js
 * (059) in the daily CI job.
 *
 * WHAT IT DOES
 *   1. Appends a slim per-date history point (`data/history/<YYYY-MM-DD>.json`)
 *      derived from the current `data/pools-snapshot.json` — ONLY when the slim
 *      pool data differs from the most-recent retained point (freshness
 *      discipline; identical data day-over-day adds no file, no commit). Keeps
 *      the last HISTORY_RETENTION dated files, prunes older (031 pattern).
 *   2. Computes a derived, null-safe `kpis` object per pool from the retained
 *      window and writes it INTO the snapshot AND every per-chain/per-token
 *      slice, under its own all-or-nothing freshness gate (081/083 discipline).
 *
 * TRUST RAILS / INVARIANTS (BINDING — 087 §Territory notes 4, 058 §5):
 *   - KPIs are DERIVED, DISCLOSED, and NULL-SAFE (null = "no track record yet",
 *     never a fabricated 0). They rank WITHIN already-passing pools only.
 *   - This script NEVER filters, drops, reorders, or re-weights a pool. It only
 *     ADDS a `kpis` object. The pool set and order in every output file is
 *     exactly what the 059 generator produced.
 *   - This script NEVER reads or relaxes the trust rails (APY_SANITY_LIMIT,
 *     DEFAULT_MIN_TVL, anomaly flags) — those are applied UPSTREAM by the 059
 *     generator and stay byte-untouched here.
 *   - History piggybacks the existing daily commit and only appends on a REAL
 *     data change, so it adds no extra Vercel deploy.
 *
 * DETERMINISM: the pure core NEVER calls `new Date()` — dates/generatedAt are
 * injected as args (main() supplies them). slimMaps are serialized in snapshot
 * pool order (JSON.stringify preserves insertion order) so byte-compare between
 * the committed history point and a fresh one is reliable.
 *
 * Usage:
 *   node compute-kpis.js                     # enrich ./data in place
 *   node compute-kpis.js --out /tmp/scratch  # operate on an isolated data dir
 *   node compute-kpis.js --date 2026-07-14   # inject the run date (midnight UTC)
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const HISTORY_RETENTION = 30; // keep the 30 most-recent dated history points
const DB_WINDOW_DAYS = 90;      // 110: days requested from the D1 /history endpoint
const DB_FETCH_TIMEOUT_MS = 15000; // never hang CI on an unreachable endpoint
const RISK_FREE_APY = 4.0;      // 117: disclosed risk-free benchmark (~US T-bill), configurable
const SHARPE_MIN_POINTS = 8;    // 117: below this the rate-stability Sharpe is too noisy → null

// --- helpers ---------------------------------------------------------------

/** Round `n` to `dp` decimal places. Null/NaN pass through unchanged (guard). */
function round(n, dp) {
  if (n == null || Number.isNaN(n)) return n;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function tryRead(absPath) {
  try { return fs.readFileSync(absPath, 'utf8'); } catch (e) { return null; }
}

// --- pure core (unit-testable, no network/browser) -------------------------

/** Slim projection of a pool for history/KPIs: `[apyTotal, tvlUsd]` where
 * apyTotal = round((apyBase||0)+(apyReward||0), 4) and tvlUsd = Number||0. */
function slimPoint(pool) {
  const apyTotal = round((Number(pool.apyBase) || 0) + (Number(pool.apyReward) || 0), 4);
  const tvlUsd = Number(pool.tvlUsd) || 0;
  return [apyTotal, tvlUsd];
}

/** `{ "<pool.pool>": [apyTotal, tvlUsd], … }`, iterated in snapshot pool order
 * so JSON.stringify produces a stable (byte-comparable) key order. */
function buildSlimMap(pools) {
  const out = {};
  (pools || []).forEach(p => { out[p.pool] = slimPoint(p); });
  return out;
}

/** Population standard deviation (divide by N). Empty → 0. */
function stdevPop(nums) {
  const n = nums.length;
  if (n === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

/** Derived, null-safe KPIs for one pool given its ascending-by-date `series`
 * (`[{date, apyTotal, tvlUsd}, …]`). Deltas are null when there is <2 points
 * (honest "no track record yet"), and tvlTrend is also null when the earliest
 * TVL is 0 (division guard). Also returns `apyMean` (plain mean of the apy
 * series, any point count) and the rate-stability `apySharpe` (null for <8 pts
 * or sd=0). */
function computeKpis(pool, series) {
  const first = series[0];
  const last = series[series.length - 1];
  const enough = series.length >= 2;
  const apys = series.map(s => s.apyTotal);
  const sd = stdevPop(apys);                              // population stdev of the apy series
  const mean = apys.reduce((a, b) => a + b, 0) / apys.length;
  // 117 rate-stability Sharpe: (mean apy − risk-free) / apy volatility. NO √T —
  // apyTotal is already an annualized rate. Rewards steady yields, penalizes erratic
  // ones. Captures ONLY yield-rate volatility, NOT principal risk (IL/depeg/exploit/
  // TVL-flight) — never surface it as a "safety score". null when <8 points (too
  // noisy → "not enough history") or sd===0 (flat rate → Sharpe undefined, not ∞).
  const apySharpe = (series.length >= SHARPE_MIN_POINTS && sd > 0)
    ? round((mean - RISK_FREE_APY) / sd, 2)
    : null;
  return {
    historyPoints: series.length,
    firstSeen: first.date,
    apyMomentum: enough ? round(last.apyTotal - first.apyTotal, 2) : null,
    apyStdev: enough ? round(sd, 2) : null,
    apyMean: round(mean, 2),
    apySharpe,
    tvlTrend: (!enough || first.tvlUsd === 0)
      ? null
      : round((last.tvlUsd - first.tvlUsd) / first.tvlUsd, 4)
  };
}

/** Given history file objects `{date, pools:{id:[apy,tvl]}}` sorted ascending by
 * date, produce `Map<poolId, Array<{date,apyTotal,tvlUsd}>>` (each series stays
 * ascending because the input entries are ascending). */
function buildSeriesByPool(historyEntries) {
  const map = new Map();
  (historyEntries || []).forEach(entry => {
    const pools = entry.pools || {};
    Object.keys(pools).forEach(id => {
      const pt = pools[id];
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ date: entry.date, apyTotal: pt[0], tvlUsd: pt[1] });
    });
  });
  return map;
}

// --- history IO ------------------------------------------------------------

function historyDir(dataDir) { return path.join(dataDir, 'history'); }

/** Read all `*.json` under the history dir, parse, return ascending by `date`.
 * Missing dir / unreadable files → skipped (missing dir → []). */
function readHistory(dataDir) {
  const dir = historyDir(dataDir);
  let files;
  try { files = fs.readdirSync(dir); } catch (e) { return []; }
  const out = [];
  files.filter(f => f.endsWith('.json')).forEach(f => {
    const c = tryRead(path.join(dir, f));
    if (c == null) return;
    try { out.push(JSON.parse(c)); } catch (e) { /* skip corrupt */ }
  });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// --- DB (Cloudflare D1 /history) read path (110) ---------------------------

/** PURE: reshape the flat `/history` rows (`[{pool_id, ts, apy, tvl_usd}, …]`
 * ascending by ts, unix SECONDS) into the SAME `[{date, pools:{id:[apy,tvl]}}]`
 * shape `readHistory()` returns and `buildSeriesByPool()` consumes.
 *
 * Determinism: `date` derives ONLY from each row's `ts` (a pure function of the
 * input), NEVER a wall-clock `new Date()` — the pure-core determinism discipline
 * (see file header) holds. Rows are ascending by ts, so within a UTC day the
 * LATER row overwrites the earlier per pool → one point-per-day per pool, making
 * daily-cadence DB data byte-equivalent to the file path's slimPoint output. */
function reshapeDbRows(rows) {
  if (!Array.isArray(rows)) return [];
  const byDate = new Map(); // date → { date, pools:{} } (insertion order = ts order)
  rows.forEach(r => {
    if (!r || r.pool_id == null || r.ts == null) return; // skip malformed
    // PURE date-of-ts: unix seconds → UTC calendar day. NOT `new Date()` wall clock.
    const date = new Date(Number(r.ts) * 1000).toISOString().slice(0, 10);
    let entry = byDate.get(date);
    if (!entry) { entry = { date, pools: {} }; byDate.set(date, entry); }
    // round is idempotent on already-4dp apy; matches slimPoint output exactly.
    entry.pools[r.pool_id] = [round(Number(r.apy), 4), Number(r.tvl_usd) || 0];
  });
  const out = Array.from(byDate.values());
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** Fetch `${endpoint}?days=<days>` from the D1 /history Worker (Bearer-guarded
 * when a token is provided) and reshape into history entries. Aborts after
 * DB_FETCH_TIMEOUT_MS so CI never hangs on an unreachable endpoint. Throws on a
 * non-2xx status (caller in main() catches → local file fallback). */
async function fetchDbHistory(endpoint, token, days) {
  const url = endpoint + (endpoint.includes('?') ? '&' : '?') + 'days=' + days;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DB_FETCH_TIMEOUT_MS);
  try {
    const headers = {};
    if (token) headers.authorization = 'Bearer ' + token;
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error('history endpoint ' + res.status);
    const rows = await res.json();
    return reshapeDbRows(rows);
  } finally {
    clearTimeout(timer);
  }
}

/** Keep the HISTORY_RETENTION most-recent dated files (lexicographic on the
 * `YYYY-MM-DD.json` name), delete older ones. Returns the count pruned. */
function pruneHistory(dataDir) {
  const dir = historyDir(dataDir);
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { return 0; }
  if (files.length <= HISTORY_RETENTION) return 0;
  files.sort(); // fixed-width YYYY-MM-DD prefix → lexicographic == chronological
  const toDelete = files.slice(0, files.length - HISTORY_RETENTION);
  let pruned = 0;
  toDelete.forEach(f => { try { fs.rmSync(path.join(dir, f)); pruned++; } catch (e) {} });
  return pruned;
}

/** Append today's slim point ONLY if it differs from the most-recent retained
 * point (compare the `pools` maps; identical data → no write, no commit). On a
 * real change, write `history/<date>.json` (overwriting a same-date file) then
 * prune. `generatedAt` defaults to midnight-UTC of `date` (deterministic, never
 * `new Date()`), so the pure core stays test-reproducible. */
function appendHistory(dataDir, date, slimMap, generatedAt) {
  generatedAt = generatedAt || (date + 'T00:00:00.000Z');
  const existing = readHistory(dataDir);
  const mostRecent = existing.length ? existing[existing.length - 1] : null;
  // Stable byte-compare: both sides serialize a slimMap built in snapshot order.
  if (mostRecent && JSON.stringify(mostRecent.pools) === JSON.stringify(slimMap)) {
    return { appended: false, pruned: 0 };
  }
  const dir = historyDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = {
    schemaVersion: SCHEMA_VERSION,
    date,
    generatedAt,
    count: Object.keys(slimMap).length,
    pools: slimMap
  };
  fs.writeFileSync(path.join(dir, date + '.json'), JSON.stringify(file));
  const pruned = pruneHistory(dataDir);
  return { appended: true, pruned };
}

// --- KPI enrichment + write (freshness-gated) ------------------------------

function resolveDataPaths(dataDir) {
  return {
    snapshot: path.join(dataDir, 'pools-snapshot.json'),
    chainDir: path.join(dataDir, 'pools', 'chain'),
    tokenDir: path.join(dataDir, 'pools', 'token')
  };
}

/** Strip only the volatile `generatedAt` value for the enrich freshness compare
 * (both sides carry kpis after the first run, so the timestamp is the only
 * volatile field left to ignore). */
function normalize(content) {
  if (typeof content !== 'string') return content;
  return content.replace(/("generatedAt":\s*)"[^"]*"/g, '$1"<TS>"');
}

/**
 * Orchestrator: append today's history point, then compute + write per-pool
 * KPIs into the snapshot and every slice under an all-or-nothing freshness gate.
 * `generatedAt` is injected (main() supplies `new Date().toISOString()`); the
 * run date is `generatedAt.slice(0,10)`. Returns { changed, enriched, appended }.
 * `historyOverride` (110): when non-null, use it as the retained-window history
 * (the D1 /history path) instead of reading `data/history/*.json`. All KPI math /
 * snapshot / slice baking stays byte-identical either way.
 */
function enrich(dataDir, generatedAt, historyOverride) {
  const paths = resolveDataPaths(dataDir);
  const snapContent = tryRead(paths.snapshot);
  if (snapContent == null) {
    return { changed: false, enriched: 0, appended: false, reason: 'no-snapshot' };
  }
  const snapshot = JSON.parse(snapContent);
  const dateStr = generatedAt.slice(0, 10); // YYYY-MM-DD

  // 1. Slim map + history append (piggybacks the daily commit; no-op if same).
  const slimMap = buildSlimMap(snapshot.pools);
  const appendResult = appendHistory(dataDir, dateStr, slimMap, generatedAt);

  // 2. Build per-pool series from the retained window (now including today's
  //    point if appended, else the identical most-recent point).
  const history = (historyOverride != null) ? historyOverride : readHistory(dataDir);
  const seriesByPool = buildSeriesByPool(history);

  // 3. Enrich each snapshot pool in place (never reorder/drop). A pool not yet
  //    in history falls back to a single synthetic today-point (deltas null).
  const kpisByPool = new Map();
  (snapshot.pools || []).forEach(p => {
    let series = seriesByPool.get(p.pool);
    if (!series || !series.length) {
      const sp = slimPoint(p);
      series = [{ date: dateStr, apyTotal: sp[0], tvlUsd: sp[1] }];
    }
    const kpis = computeKpis(p, series);
    p.kpis = kpis;
    kpisByPool.set(p.pool, kpis);
  });

  // 4. Assemble every intended file (snapshot + each existing slice, kpis added
  //    by pool-id lookup). Preserve envelope key order; stamp fresh generatedAt.
  const intended = [{
    absPath: paths.snapshot,
    content: JSON.stringify(Object.assign({}, snapshot, { generatedAt }))
  }];
  [paths.chainDir, paths.tokenDir].forEach(dir => {
    let files;
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { files = []; }
    files.forEach(f => {
      const abs = path.join(dir, f);
      const c = tryRead(abs);
      if (c == null) return;
      const slice = JSON.parse(c);
      (slice.pools || []).forEach(p => {
        const k = kpisByPool.get(p.pool);
        if (k) p.kpis = k;
      });
      intended.push({ absPath: abs, content: JSON.stringify(Object.assign({}, slice, { generatedAt })) });
    });
  });

  // 5. All-or-nothing freshness gate: only write if ANY intended file differs
  //    from disk modulo generatedAt (059 whole-run pattern).
  let changed = false;
  for (let i = 0; i < intended.length && !changed; i++) {
    const existing = tryRead(intended[i].absPath);
    if (existing == null || normalize(existing) !== normalize(intended[i].content)) changed = true;
  }
  const enriched = (snapshot.pools || []).length;
  if (!changed) {
    return { changed: false, enriched, appended: appendResult.appended };
  }
  intended.forEach(f => fs.writeFileSync(f.absPath, f.content));
  return { changed: true, enriched, appended: appendResult.appended };
}

// --- CLI (only runs as a script) -------------------------------------------

function parseArgs(argv) {
  const args = { out: null, date: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--date') args.date = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Default dataDir = <repo>/data (resolved against this script, never
  // process.cwd() — 076 lesson). --out isolates all writes into the given dir.
  const dataDir = args.out ? path.resolve(args.out) : path.resolve(__dirname, 'data');
  // --date injects a deterministic run date at midnight UTC; else wall clock.
  const generatedAt = args.date ? (args.date + 'T00:00:00.000Z') : new Date().toISOString();

  // 110: prefer the D1 /history endpoint when provisioned (HISTORY_ENDPOINT set),
  // else fall back to the local file history. Unset endpoint (current production
  // reality — 108 not yet provisioned) → historyOverride stays null → file path →
  // byte-identical to today. Any error here degrades honestly to the file path.
  let historyOverride = null;
  const endpoint = process.env.HISTORY_ENDPOINT;
  if (endpoint) {
    try {
      const dbEntries = await fetchDbHistory(endpoint, process.env.HISTORY_TOKEN, DB_WINDOW_DAYS);
      if (dbEntries && dbEntries.length) {
        historyOverride = dbEntries;
        console.log(`📡 KPI history source: D1 /history (${dbEntries.length} day-buckets, days=${DB_WINDOW_DAYS})`);
      } else {
        console.log('📡 HISTORY_ENDPOINT set but /history returned no rows — falling back to local file history');
      }
    } catch (e) {
      console.log(`📡 HISTORY_ENDPOINT unreachable (${e.message}) — falling back to local file history`);
    }
  }

  const result = enrich(dataDir, generatedAt, historyOverride);
  if (result.reason === 'no-snapshot') {
    console.log('⚠️  No data/pools-snapshot.json found — nothing to enrich. Run generate-pools-snapshot.js first.');
    return;
  }
  const appended = result.appended ? 'appended today\'s history point' : 'history unchanged (no new point)';
  if (!result.changed) {
    console.log(`♻️  KPIs unchanged — ${appended}. Nothing written (${result.enriched} pools).`);
    return;
  }
  console.log(`📈 Enriched ${result.enriched} pools with KPIs across snapshot + slices — ${appended}.`);
}

module.exports = {
  round, slimPoint, buildSlimMap, stdevPop, computeKpis, buildSeriesByPool,
  historyDir, readHistory, pruneHistory, appendHistory, resolveDataPaths,
  normalize, enrich, HISTORY_RETENTION, SCHEMA_VERSION, RISK_FREE_APY, SHARPE_MIN_POINTS,
  reshapeDbRows, fetchDbHistory, DB_WINDOW_DAYS
};

if (require.main === module) {
  main();
}
