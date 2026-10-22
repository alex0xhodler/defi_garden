#!/usr/bin/env node
/* scripts/history-backfill.js — ONE-TIME history backfill, run locally by a human.
 *
 * Folds three historical sources into the R2 archive (same layout as history-archive.js):
 *   git_snapshot   every committed version of data/pools-snapshot.json (git log + git show)
 *   git_history    last committed content of every data/history/<date>.json (daily level only)
 *   legacy_hourly  rows of D1 table pool_history, from a `wrangler d1 export --no-schema` file
 * Idempotent: merges with what the store already holds, re-running yields byte-identical files.
 * Never touches watermark.samples_ts / ci_snapshot_generatedAt.
 *
 * Usage: node scripts/history-backfill.js [--repo <path>] [--legacy-sql <file>]
 *          [--store local:<dir>|r2] [--dry-run] [--since YYYY-MM-DD] [--until YYYY-MM-DD]
 *   --init  allow a missing manifest.json (first run on an empty store ONLY; without it a missing
 *           manifest is treated as a failed read and the job exits 1). The workflow never passes it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const core = require('./history-archive-core.js');
const io = require('./history-archive-io.js');

const SNAPSHOT_PATH = 'data/pools-snapshot.json';
const HISTORY_DIR = 'data/history/';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv) {
  const args = { repo: process.cwd(), legacySql: null, store: 'r2', init: false, dryRun: false, since: null, until: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = argv[++i];
    else if (a === '--legacy-sql') args.legacySql = argv[++i];
    else if (a === '--store') args.store = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--init') args.init = true;
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--until') args.until = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  [args.since, args.until].forEach((d) => { if (d && !DATE_RE.test(d)) throw new Error(`bad date: ${d}`); });
  return args;
}

const inRange = (args, day) => (!args.since || day >= args.since) && (!args.until || day <= args.until);

function git(repo, argv) {
  return execFileSync('git', ['-C', repo, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 });
}
const gitShowJson = (repo, spec) => JSON.parse(git(repo, ['show', spec]));

function main() {
  const args = parseArgs(process.argv.slice(2));
  const store = io.openStore(args.store);
  const manifest = io.loadManifest(store, { init: args.init });
  const byMonth = new Map();          // month -> raw points
  const histByMonth = new Map();      // month -> git_history entries
  const counts = { git_snapshot: 0, git_history: 0, legacy_hourly: 0, snapshotVersions: 0, snapshotVersionsSkipped: 0, legacySkipped: 0 };
  const add = (p) => {
    const m = core.monthKey(p.ts);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(p);
  };

  // 1. committed snapshot versions, one at a time (bounded memory)
  const versions = git(args.repo, ['log', '--format=%H%x09%cI', '--', SNAPSHOT_PATH]).split('\n').filter(Boolean)
    .map((l) => { const [sha, iso] = l.split('\t'); return { sha, day: new Date(iso).toISOString().slice(0, 10) }; })
    .filter((v) => inRange(args, v.day));
  for (const v of versions) {
    let snap;
    try { snap = gitShowJson(args.repo, `${v.sha}:${SNAPSHOT_PATH}`); }
    catch (err) { counts.snapshotVersionsSkipped++; continue; }   // e.g. the commit that untracked the file
    const pts = core.pointsFromSnapshot(snap, 'git_snapshot');
    if (!pts.length) { counts.snapshotVersionsSkipped++; continue; }
    counts.snapshotVersions++; counts.git_snapshot += pts.length;
    pts.forEach(add);
  }

  // 2. last committed content of every data/history/<date>.json
  const perFile = new Map();   // path -> shas, newest first
  let cur = null;
  git(args.repo, ['log', '--format=%H', '--name-only', '--', HISTORY_DIR]).split('\n').forEach((line) => {
    if (/^[0-9a-f]{40}$/.test(line)) cur = line;
    else if (cur && line.startsWith(HISTORY_DIR) && line.endsWith('.json')) {
      if (!perFile.has(line)) perFile.set(line, []);
      perFile.get(line).push(cur);
    }
  });
  for (const [file, shas] of Array.from(perFile).sort()) {
    const day = path.basename(file, '.json');
    if (!DATE_RE.test(day) || !inRange(args, day)) continue;
    for (const sha of shas) {   // newest commit that still has content wins
      let json;
      try { json = gitShowJson(args.repo, `${sha}:${file}`); } catch (err) { continue; }
      const entries = core.pointsFromHistoryFile(json, day);
      const m = day.slice(0, 7);
      if (!histByMonth.has(m)) histByMonth.set(m, []);
      entries.forEach((e) => histByMonth.get(m).push(e));
      counts.git_history += entries.length;
      break;
    }
  }

  // 3. legacy hourly rows from the D1 export
  if (args.legacySql) {
    const parsed = core.parseD1ExportSql(fs.readFileSync(args.legacySql, 'utf8'));
    counts.legacySkipped = parsed.skipped;
    parsed.rows.forEach((r) => {
      if (!inRange(args, core.dayKey(r.ts))) return;
      counts.legacy_hourly++;
      add({ ts: r.ts, pool_id: r.pool_id, apy: r.apy, tvl_usd: r.tvl_usd, src: 'legacy_hourly' });
    });
  }

  // 4. merge with the store, rollup, upload, verify, manifest
  const monthKeys = Array.from(new Set([...byMonth.keys(), ...histByMonth.keys()])).sort();
  const months = monthKeys.map((m) => {
    const built = io.buildMonth(store, manifest, m, byMonth.get(m) || [], histByMonth.get(m) || []);
    byMonth.delete(m); histByMonth.delete(m);
    return built;
  });

  let res = { uploaded: 0, bytes: 0, manifestWritten: false };
  if (!args.dryRun) res = io.commitMonths(store, manifest, months);

  console.log(`sources: git_snapshot=${counts.git_snapshot} points (${counts.snapshotVersions} versions, ${counts.snapshotVersionsSkipped} skipped) ` +
    `git_history=${counts.git_history} entries legacy_hourly=${counts.legacy_hourly} (${counts.legacySkipped} unparseable rows skipped)`);
  months.forEach((m) => console.log(`  ${m.month}: raw=${m.raw.rows} rows ${m.raw.buf.length} B, daily=${m.daily.rows} rows ${m.daily.buf.length} B` +
    `${m.raw.changed || m.daily.changed ? '' : ' (unchanged)'}`));
  console.log(`history-backfill store=${store.name} months=${months.length} uploadedFiles=${res.uploaded} bytes=${res.bytes} ` +
    `manifest=${res.manifestWritten ? 'written' : 'unchanged'}${args.dryRun ? ' (dry-run, nothing written)' : ''}`);
}

try { main(); } catch (err) { console.error(`history-backfill: ${err.message}`); process.exit(1); }
