#!/usr/bin/env node
/* scripts/history-archive.js — daily history archive job (GitHub Actions, see
 * .github/workflows/history-archive.yml).
 *
 * D1 `samples` (new rows after the manifest watermark) + the published pools-snapshot.json
 * -> merge into R2 raw/YYYY-MM.ndjson.gz, rebuild daily/YYYY-MM.ndjson.gz, upload + verify,
 * write manifest.json LAST, then trim D1 rows older than 120 days that are already archived.
 *
 * Usage: node scripts/history-archive.js [--dry-run] [--store local:<dir>|r2]
 *          [--samples-fixture <json>] [--snapshot-fixture <json>] [--no-trim]
 *   A --samples-fixture replaces the D1 read and also disables the trim (no D1 is touched).
 * Auth comes from CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID; nothing secret is printed.
 */
'use strict';

const fs = require('fs');
const core = require('./history-archive-core.js');
const io = require('./history-archive-io.js');

const SNAPSHOT_URL = 'https://www.defi.garden/data/pools-snapshot.json';
const ATTEMPTS = 3;
const TIMEOUT_MS = 120000;
const PAGE_SIZE = 5000;

function parseArgs(argv) {
  const args = { dryRun: false, store: 'r2', samplesFixture: null, snapshotFixture: null, trim: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--store') args.store = argv[++i];
    else if (a === '--samples-fixture') args.samplesFixture = argv[++i];
    else if (a === '--snapshot-fixture') args.snapshotFixture = argv[++i];
    else if (a === '--no-trim') args.trim = false;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

async function getJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'defi-garden-history-archive' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

/** New samples after the watermark as raw points; also the last (ts, pool_id) seen. */
function loadSamples(args, wm) {
  const pages = args.samplesFixture
    ? [io.fixtureSamples(readJson(args.samplesFixture), { sinceTs: wm.samples_ts, sincePoolId: wm.samples_pool_id })]
    : io.d1Samples({ sinceTs: wm.samples_ts, sincePoolId: wm.samples_pool_id, pageSize: PAGE_SIZE });
  const points = []; let last = null; let skipped = 0;
  for (const page of pages) {
    for (const r of page) {
      const { ts, apy, tvl_usd: tvl } = r;   // D1 returns JSON numbers; null / strings are junk
      if (!Number.isSafeInteger(ts) || typeof r.pool_id !== 'string' || !r.pool_id || !Number.isFinite(apy) || !Number.isFinite(tvl)) { skipped++; continue; }
      points.push({ ts, pool_id: r.pool_id, apy, tvl_usd: tvl, src: 'samples' });
    }
    if (page.length) last = page[page.length - 1];
  }
  return { points, last: last ? { ts: last.ts, pool_id: last.pool_id } : null, skipped };
}

async function loadCiSnapshot(args, wm) {
  let json;
  try { json = args.snapshotFixture ? readJson(args.snapshotFixture) : await getJson(SNAPSHOT_URL); }
  catch (err) {
    console.warn(`WARN snapshot: could not load pools-snapshot.json (${err.message}); no ci_snapshot points this run`);
    return { points: [], generatedAt: null };
  }
  const ts = core.snapshotTs(json);
  if (ts === null) { console.warn('WARN snapshot: no usable generatedAt; skipped'); return { points: [], generatedAt: null }; }
  const prev = Date.parse(wm.ci_snapshot_generatedAt);
  if (Number.isFinite(prev) && Math.floor(prev / 1000) >= ts) return { points: [], generatedAt: null };   // already archived
  return { points: core.pointsFromSnapshot(json, 'ci_snapshot'), generatedAt: json.generatedAt };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const store = io.openStore(args.store);
  const manifest = io.loadManifest(store);
  const wm = manifest.watermark;

  const samples = loadSamples(args, wm);
  const ci = await loadCiSnapshot(args, wm);
  if (samples.skipped) console.warn(`WARN samples: ${samples.skipped} invalid rows skipped`);

  const byMonth = new Map();
  [...samples.points, ...ci.points].forEach((p) => {
    const m = core.monthKey(p.ts);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(p);
  });

  const months = Array.from(byMonth.keys()).sort().map((m) => io.buildMonth(store, m, byMonth.get(m)));
  const patch = {};
  if (samples.last) { patch.samples_ts = samples.last.ts; patch.samples_pool_id = samples.last.pool_id; }
  if (ci.generatedAt) patch.ci_snapshot_generatedAt = ci.generatedAt;

  let res = { uploaded: 0, bytes: 0, manifestWritten: false, manifest };
  if (!args.dryRun) {
    try { res = io.commitMonths(store, manifest, months, { watermark: patch }); }
    catch (err) { console.error(`history-archive: upload failed, manifest untouched: ${err.message}`); process.exit(1); }
  }

  let trimmed = 'skipped';
  const doTrim = !args.dryRun && args.trim && !args.samplesFixture;
  if (doTrim) {
    const sql = core.buildTrimSql(Date.now() / 1000, res.manifest.watermark.samples_ts);
    if (sql) {
      try {
        const out = io.d1Json(sql);
        const changes = out && out[0] && out[0].meta && out[0].meta.changes;
        trimmed = Number.isFinite(changes) ? `${changes} rows` : 'done';
      } catch (err) { console.error(`history-archive: trim failed (archive itself is complete): ${err.message}`); process.exit(1); }
    } else trimmed = 'nothing archived yet';
  }

  const summary = `history-archive store=${store.name} newSamples=${samples.points.length} ciPoints=${ci.points.length} ` +
    `months=${months.map((m) => m.month).join(',') || '-'} uploadedFiles=${res.uploaded} bytes=${res.bytes} ` +
    `manifest=${res.manifestWritten ? 'written' : 'unchanged'} trimmed=${trimmed}${args.dryRun ? ' (dry-run, nothing written)' : ''}`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${summary}\n`);
}

main().catch((err) => { console.error(`history-archive: ${err.message}`); process.exit(1); });
