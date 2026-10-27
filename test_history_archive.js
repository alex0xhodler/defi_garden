/* Unit + CLI tests for the history archive v2 (scripts/history-archive-core.js,
   history-archive-io.js, history-archive.js, history-backfill.js). Pure Node, fixtures
   and a local-directory store only: NO network, NO wrangler (the CLI runs get a fake
   `npx` first on PATH that records any call).

   Run: node test_history_archive.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const core = require('./scripts/history-archive-core.js');
const io = require('./scripts/history-archive-io.js');
const pollerCore = require('./src/poller-core.js');

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); passed++; }
function deep(a, b, msg) { assert.deepStrictEqual(a, b, msg); passed++; }
function throws(fn, re) { assert.throws(fn, re); passed++; }
const T = (iso) => Date.parse(iso) / 1000;

// --- keys at UTC boundaries -------------------------------------------------------
eq(core.monthKey(T('2026-10-31T23:59:59Z')), '2026-10', 'last second of Oct');
eq(core.monthKey(T('2026-11-01T00:00:00Z')), '2026-11', 'first second of Nov');
eq(core.dayKey(T('2026-10-31T23:59:59Z')), '2026-10-31', 'day last second');
eq(core.dayKey(T('2026-11-01T00:00:00Z')), '2026-11-01', 'day first second');
eq(core.monthKey(T('2026-12-31T23:59:59Z')), '2026-12', 'year end month');
eq(core.dayKey(T('2027-01-01T00:00:00Z')), '2027-01-01', 'year rollover day');
eq(core.APY_SANITY_LIMIT, pollerCore.APY_SANITY_LIMIT, 'rail mirrors poller-core');
eq(core.totalApy, pollerCore.totalApy, 'totalApy is reused, not re-derived');

// --- mergeRaw ----------------------------------------------------------------------
const R = (ts, pool_id, apy, src = 'samples', tvl_usd = 1000) => ({ ts, pool_id, apy, tvl_usd, src });
const a = [R(20, 'b', 1), R(10, 'z', 2), R(10, 'a', 3, 'legacy_hourly')];
const b = [R(10, 'a', 3, 'samples'), R(20, 'b', 9), R(5, 'q', 4)];
const merged = core.mergeRaw(a, b);
deep(merged.map((r) => [r.ts, r.pool_id, r.src, r.apy]),
  [[5, 'q', 'samples', 4], [10, 'a', 'legacy_hourly', 3], [10, 'a', 'samples', 3], [10, 'z', 'samples', 2], [20, 'b', 'samples', 9]],
  'sorted by (ts,pool_id,src); dedupe on (ts,pool_id,src), incoming wins');
deep(core.mergeRaw(merged, b), merged, 'idempotent');
deep(core.mergeRaw(merged, []), merged, 'empty incoming is a no-op');
deep(core.mergeRaw(b, a), core.mergeRaw(b, a), 'deterministic');
throws(() => core.mergeRaw([], [{ ts: 1, pool_id: 'a', apy: NaN, tvl_usd: 1, src: 'samples' }]), /non-finite/);
throws(() => core.mergeRaw([], [R(1, 'a', 1, 'bogus')]), /unknown src/);
const withBase = core.mergeRaw([], [{ ...R(1, 'a', 3), apy_base: 2, apy_reward: 1, extra: 'drop' }]);
deep(Object.keys(withBase[0]), ['ts', 'pool_id', 'apy', 'tvl_usd', 'src', 'apy_base', 'apy_reward'], 'canonical key order, unknown keys dropped');

// --- ndjson.gz ---------------------------------------------------------------------
const gz1 = core.serializeNdjsonGz(merged); const gz2 = core.serializeNdjsonGz(merged);
ok(gz1.equals(gz2), 'serialization is deterministic');
deep(core.parseNdjsonGz(gz1), merged, 'round trip');
deep(core.parseNdjsonGz(null), [], 'null buffer -> no rows');
eq(core.parseNdjsonGz(core.serializeNdjsonGz([])).length, 0, 'empty file');

// --- rollupDaily --------------------------------------------------------------------
const D0 = T('2026-10-20T00:00:00Z');
const day1 = core.rollupDaily([
  R(D0 + 3600, 'p', 4, 'samples', 200), R(D0 + 7200, 'p', 2, 'samples', 300), R(D0 + 100, 'p', 6, 'samples', 100),
  R(D0 + 50, 'p', 99, 'legacy_hourly'), R(D0 + 60, 'p', 99, 'git_snapshot'), R(D0 + 70, 'p', 99, 'ci_snapshot')
], []);
eq(day1.length, 1, 'one row per pool-day');
deep(day1[0], { day: '2026-10-20', pool_id: 'p', open: 6, close: 2, min: 2, max: 6, mean: 4, n: 3, tvl_close: 300, src: 'samples' },
  'samples beats everything; open=first, close=last by ts, stats');
eq(core.rollupDaily([R(D0 + 1, 'p', 1, 'legacy_hourly'), R(D0 + 2, 'p', 5, 'git_snapshot'), R(D0 + 3, 'p', 5, 'ci_snapshot')], [])[0].src, 'legacy_hourly', 'legacy beats git_snapshot/ci');
eq(core.rollupDaily([R(D0 + 2, 'p', 5, 'git_snapshot'), R(D0 + 3, 'p', 5, 'ci_snapshot')], [])[0].src, 'git_snapshot', 'git_snapshot beats ci');
eq(core.rollupDaily([R(D0 + 3, 'p', 5, 'ci_snapshot')], [{ day: '2026-10-20', pool_id: 'p', apy: 9, tvl_usd: 1 }])[0].src, 'ci_snapshot', 'ci beats git_history');
const hist = core.rollupDaily([], [{ day: '2026-10-19', pool_id: 'h', apy: 3.5, tvl_usd: 77 }]);
deep(hist[0], { day: '2026-10-19', pool_id: 'h', open: 3.5, close: 3.5, min: 3.5, max: 3.5, mean: 3.5, n: 1, tvl_close: 77, src: 'git_history' }, 'git_history row');
const mixed = core.rollupDaily([R(D0, 'z', 1), R(D0 + 86400, 'a', 1), R(D0, 'a', 1)], []);
deep(mixed.map((r) => r.day + r.pool_id), ['2026-10-20a', '2026-10-20z', '2026-10-21a'], 'sorted by (day,pool_id)');
const split = core.rollupDaily([R(D0 + 86399, 'p', 1), R(D0 + 86400, 'p', 2)], []);
eq(split.length, 2, 'UTC midnight splits days');
// anomalous
const anomMix = core.rollupDaily([R(D0 + 1, 'p', 5000), R(D0 + 2, 'p', 4), R(D0 + 3, 'p', 6), R(D0 + 4, 'p', 1000.0001)], [])[0];
deep([anomMix.open, anomMix.close, anomMix.min, anomMix.max, anomMix.mean, anomMix.n, anomMix.anomalous], [4, 6, 4, 6, 5, 4, undefined], 'out-of-rail points excluded from stats');
const anomAll = core.rollupDaily([R(D0 + 1, 'p', 5000, 'samples', 11), R(D0 + 2, 'p', 7000, 'samples', 22)], [])[0];
deep(anomAll, { day: '2026-10-20', pool_id: 'p', open: null, close: null, min: null, max: null, mean: null, n: 2, tvl_close: 22, src: 'samples', anomalous: true }, 'all-anomalous: nulls + flag');
eq(core.rollupDaily([R(D0, 'p', 1000)], [])[0].anomalous, undefined, 'exactly 1000 is in rail');
eq(core.rollupDaily([], [{ day: '2026-10-19', pool_id: 'h', apy: 5000, tvl_usd: 1 }])[0].anomalous, true, 'anomalous git_history entry');
const fromDaily = core.gitHistoryFromDaily([...hist, ...day1]);
deep(core.rollupDaily([], fromDaily), hist, 'git_history rows survive a rebuild from the daily file');

// --- pointsFromSnapshot --------------------------------------------------------------
const oldShape = { generatedAt: '2026-10-21T07:04:32.500Z', pools: [
  { pool: 'x1', tvlUsd: 5e6, apyBase: 2.225, apyReward: null },
  { pool: 'x2', tvlUsd: 100, apyBase: 1.11111, apyReward: 2.22225 },
  { pool: 'x3', tvlUsd: 100, apyBase: 4000 },
  { pool: 'bad-tvl' }, { pool: 'bad-tvl2', tvlUsd: 'abc' }, { tvlUsd: 1 }, null, { pool: 7, tvlUsd: 1 }] };
const pts = core.pointsFromSnapshot(oldShape, 'git_snapshot');
deep(pts.map((p) => p.pool_id), ['x1', 'x2', 'x3'], 'only valid pools');
eq(pts[0].ts, T('2026-10-21T07:04:32Z'), 'ts = floor(generatedAt)');
oldShape.pools.slice(0, 3).forEach((p, i) => eq(Object.is(pts[i].apy, pollerCore.totalApy(p)), true, 'totalApy parity #' + i));
deep(pts[0], { ts: pts[0].ts, pool_id: 'x1', apy: 2.225, tvl_usd: 5e6, src: 'git_snapshot', apy_base: 2.225 }, 'apy_base kept, null reward omitted');
eq(pts[1].apy_reward, 2.22225, 'apy_reward kept');
const newShape = { schemaVersion: 1, generatedAt: '2026-10-22T07:00:00.000Z', count: 1, pools: [
  { pool: 'n1', chain: 'Ethereum', tvlUsd: 3e6, apyBase: 1, apyReward: 1, kpis: { historyPoints: 3 }, underlyingTokens: ['0x0'] }] };
deep(core.pointsFromSnapshot(newShape, 'ci_snapshot').map((p) => [p.src, p.apy, p.apy_base, p.apy_reward]), [['ci_snapshot', 2, 1, 1]], 'new-shape snapshot');
deep(core.pointsFromSnapshot({ pools: [{ pool: 'a', tvlUsd: 1 }] }, 'ci_snapshot'), [], 'no generatedAt -> nothing');
deep(core.pointsFromSnapshot(null, 'ci_snapshot'), [], 'null snapshot');

// --- pointsFromHistoryFile -----------------------------------------------------------
deep(core.pointsFromHistoryFile({ date: '2026-09-01', pools: { a: [1.5, 100], b: [NaN, 1], c: 'x', '': [1, 1] } }),
  [{ day: '2026-09-01', pool_id: 'a', apy: 1.5, tvl_usd: 100 }], 'history entries');
deep(core.pointsFromHistoryFile({ pools: { a: [1, 1] } }), [], 'no date -> nothing');
eq(core.pointsFromHistoryFile({ pools: { a: [1, 1] } }, '2026-09-02')[0].day, '2026-09-02', 'fallback date');

// --- parseD1ExportSql ----------------------------------------------------------------
const sqlText = `PRAGMA defer_foreign_keys=TRUE;
INSERT INTO "pool_history" VALUES('pool-1',1784800000,3.5,1000000);
INSERT INTO "pool_history" ("pool_id","ts","apy","tvl_usd") VALUES('it''s, (odd)',1784803600,-0.25,2.5e6),('pool-2',1784807200,1E-7,3.1e+10);
INSERT INTO "pool_history" VALUES('nul',1784807200,NULL,5);
INSERT INTO "pool_history" ("ts","pool_id","apy","tvl_usd") VALUES (1784810800, 'reordered', 8, 9);
INSERT INTO "other_table" VALUES('ignored',1,1,1);
INSERT INTO pool_history VALUES
  ('multi-a',1784814400,0,0),
  ('multi-b',1784814400,12.3456,987654321.123);
`;
const parsed = core.parseD1ExportSql(sqlText);
deep(parsed.rows, [
  { ts: 1784800000, pool_id: 'pool-1', apy: 3.5, tvl_usd: 1000000 },
  { ts: 1784803600, pool_id: "it's, (odd)", apy: -0.25, tvl_usd: 2500000 },
  { ts: 1784807200, pool_id: 'pool-2', apy: 1e-7, tvl_usd: 3.1e10 },
  { ts: 1784810800, pool_id: 'reordered', apy: 8, tvl_usd: 9 },
  { ts: 1784814400, pool_id: 'multi-a', apy: 0, tvl_usd: 0 },
  { ts: 1784814400, pool_id: 'multi-b', apy: 12.3456, tvl_usd: 987654321.123 }], 'rows incl. quotes, exponents, negatives, multi-row, column list, other tables ignored');
eq(parsed.skipped, 1, 'NULL row skipped and counted');
deep(core.parseD1ExportSql('').rows, [], 'empty export');
throws(() => core.parseD1ExportSql("INSERT INTO \"pool_history\" VALUES('open"), /unterminated/);

// --- manifest ------------------------------------------------------------------------
const m0 = core.emptyManifest();
const m1 = core.updateManifest(m0, '2026-10', { raw: { rows: 1, bytes: 2, sha256: 'a' }, daily: { rows: 3, bytes: 4, sha256: 'b' } }, 'NOW');
const m2 = core.updateManifest(m1, '2026-09', { raw: { rows: 1, bytes: 2, sha256: 'c' }, daily: { rows: 3, bytes: 4, sha256: 'd' } }, 'NOW');
deep(Object.keys(m2.months), ['2026-09', '2026-10'], 'months key-sorted');
deep(m0.months, {}, 'input not mutated');
eq(m2.updatedAt, 'NOW', 'updatedAt set');
eq(m0.schemaVersion, 1, 'schemaVersion 1');

// --- trim SQL ------------------------------------------------------------------------
const NOW = T('2026-10-22T09:30:00Z');
const cutoff = NOW - 120 * 86400;
eq(core.buildTrimSql(NOW, NOW - 3600), `DELETE FROM samples WHERE ts < ${cutoff} AND ts < ${NOW - 3600}`, 'trim SQL shape');
eq(core.buildTrimSql(NOW, 0), null, 'nothing archived -> no trim');
eq(core.buildTrimSql(NOW, null), null, 'no watermark -> no trim');
const lowWm = T('2026-01-01T00:00:00Z');
ok(core.buildTrimSql(NOW, lowWm).includes(`ts < ${lowWm}`), 'bound by the watermark when older than the retention cutoff');
const m = core.buildTrimSql(NOW, lowWm).match(/ts < (\d+) AND ts < (\d+)/);
ok(Number(m[1]) <= cutoff && Number(m[2]) <= lowWm, 'neither bound exceeds the watermark or the retention cutoff');
throws(() => core.buildSamplesPageSql('1; DROP', 'x', 10), /integer/);
eq(core.buildSamplesPageSql(5, "o'k", 100),
  "SELECT ts, pool_id, apy, tvl_usd FROM samples WHERE ts > 5 OR (ts = 5 AND pool_id > 'o''k') ORDER BY ts, pool_id LIMIT 100", 'keyset page SQL, quote-escaped');

// --- d1Samples paging (fake query) ----------------------------------------------------
const universe = Array.from({ length: 7 }, (_, i) => ({ ts: 100 + Math.floor(i / 3), pool_id: 'p' + (i % 3), apy: 1, tvl_usd: 1 }));
const seenSql = [];
const fakeQuery = (sql) => {
  seenSql.push(sql);
  const [, t, t2, id, lim] = sql.match(/ts > (\d+) OR \(ts = (\d+) AND pool_id > '([^']*)'\).*LIMIT (\d+)/);
  return [{ results: universe.filter((r) => r.ts > +t || (r.ts === +t && r.pool_id > id)).slice(0, +lim) }];
};
const pages = Array.from(io.d1Samples({ sinceTs: 0, sincePoolId: '', pageSize: 3, query: fakeQuery }));
deep(pages.map((p) => p.length), [3, 3, 1], 'paged 3+3+1, stops on a short page');
eq(pages.flat().length, 7, 'all rows seen exactly once');
ok(/ts > 101 OR \(ts = 101 AND pool_id > 'p2'\)/.test(seenSql[2]), 'keyset advances to last (ts,pool_id)');
deep(Array.from(io.d1Samples({ pageSize: 3, query: () => [{ results: [] }] })), [], 'empty table');

// --- r2Wrangler (fake run, no real wrangler) -------------------------------------------
const r2calls = [];
const r2 = io.r2Wrangler('bkt', { run: (cmd, argv) => {
  r2calls.push([cmd, ...argv]);
  if (argv.includes('get') && argv.includes('bkt/missing')) { const e = new Error('failed'); e.stderr = 'The specified key does not exist. [code: 10007]'; throw e; }
  if (argv.includes('get') && argv.includes('bkt/boom')) { const e = new Error('network down'); e.stderr = 'ECONNRESET'; throw e; }
  return Buffer.from('data');
} });
eq(r2.get('missing'), null, 'r2 get: not found -> null');
throws(() => r2.get('boom'), /network down/);
eq(r2.get('ok').toString(), 'data', 'r2 get returns buffer');
r2.put('raw/2026-10.ndjson.gz', Buffer.from('x'));
ok(r2calls.some((c) => c.join(' ').startsWith('npx -y wrangler@4.151.3 r2 object get bkt/ok --remote --pipe')), 'get uses --remote --pipe');
ok(r2calls.some((c) => c.slice(0, 7).join(' ') === 'npx -y wrangler@4.151.3 r2 object put bkt/raw/2026-10.ndjson.gz' && c.includes('--remote') && c.includes('--file')), 'put uses --remote --file');

// --- commitMonths: manifest last / untouched on failure -------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'history-archive-test-'));
const mkMonth = (month, rows) => {
  const raw = core.mergeRaw([], rows);
  const daily = core.rollupDaily(raw, []);
  return { month, raw: { rows: raw.length, buf: core.serializeNdjsonGz(raw), changed: true }, daily: { rows: daily.length, buf: core.serializeNdjsonGz(daily), changed: true } };
};
const cdir = path.join(tmp, 'commit');
const cstore = io.localDir(cdir);
const base = { ...core.emptyManifest(), updatedAt: 'OLD' };
io.commitMonths(cstore, core.emptyManifest(), [mkMonth('2026-10', [R(D0, 'a', 1)])], { watermark: { samples_ts: 5 }, now: 'OLD' });
const oldManifestBytes = cstore.get('manifest.json');
const oldM = io.loadManifest(cstore);
eq(oldM.watermark.samples_ts, 5, 'first commit wrote the manifest');
let puts = [];
const failing = { name: 'f', get: (k) => cstore.get(k), put(k, buf) { puts.push(k); if (k === 'daily/2026-11.ndjson.gz') throw new Error('simulated upload failure'); cstore.put(k, buf); } };
throws(() => io.commitMonths(failing, oldM, [mkMonth('2026-10', [R(D0, 'a', 1), R(D0 + 1, 'a', 2)]), mkMonth('2026-11', [R(T('2026-11-02T00:00:00Z'), 'a', 1)])], { watermark: { samples_ts: 99 } }), /simulated/);
ok(!puts.includes('manifest.json'), 'manifest never uploaded after a failure');
ok(cstore.get('manifest.json').equals(oldManifestBytes), 'previous manifest bytes untouched');
const lying = { name: 'l', get: () => Buffer.from('wrong'), put() {} };
throws(() => io.commitMonths(lying, base, [mkMonth('2026-10', [R(D0, 'a', 1)])]), /read-back mismatch/);
puts = [];
const order = { name: 'o', get: (k) => cstore.get(k), put(k, buf) { puts.push(k); cstore.put(k, buf); } };
io.commitMonths(order, oldM, [mkMonth('2026-12', [R(T('2026-12-02T00:00:00Z'), 'a', 1)])], { watermark: { samples_ts: 7 } });
eq(puts[puts.length - 1], 'manifest.json', 'manifest is the LAST put');
deep(puts, ['raw/2026-12.ndjson.gz', 'daily/2026-12.ndjson.gz', 'manifest.json'], 'month files then manifest');

// --- integrity guards ------------------------------------------------------------------
const ansiErr = (m) => { const e = new Error('failed'); e.stderr = `\u001b[31m✘ \u001b[41;31m[ERROR]\u001b[49m\u001b[39m \u001b[1m${m}\u001b[22m\n`; return e; };
const r2g = io.r2Wrangler('bkt', { run: (cmd, argv) => { throw ansiErr(argv.includes('bkt/nf') ? 'The specified key does not exist.' : argv.includes('bkt/cmd') ? 'npx: command not found' : 'The specified bucket does not exist.'); } });
eq(r2g.get('nf'), null, 'exact "key does not exist" (ANSI-wrapped) -> null');
throws(() => r2g.get('cmd'), /failed/);
throws(() => r2g.get('bucket'), /failed/);   // bucket error must NOT be read as an empty object
const cmdNotFound = io.r2Wrangler('bkt', { run: () => { const e = new Error('spawn npx ENOENT'); e.code = 'ENOENT'; throw e; } });
throws(() => cmdNotFound.get('x'), /ENOENT/);
const gdir = path.join(tmp, 'guard'); const gstore = io.localDir(gdir);
io.commitMonths(gstore, core.emptyManifest(), [mkMonth('2026-10', [R(D0, 'a', 1)])], { watermark: { samples_ts: 5 } });
const gman = io.loadManifest(gstore);
ok(io.buildMonth(gstore, gman, '2026-10', [R(D0 + 1, 'a', 2)]).raw.rows === 2, 'verified month rebuilds');
ok(io.buildMonth(gstore, gman, '2026-11', [R(T('2026-11-02T00:00:00Z'), 'a', 2)]).raw.rows === 1, 'month absent from manifest starts empty');
const gbytes = (k) => gstore.get(k);
const gSnapshot = ['manifest.json', 'raw/2026-10.ndjson.gz', 'daily/2026-10.ndjson.gz'].map(gbytes);
const gcount = { puts: 0 };
const spy = { name: 's', get: (k) => gstore.get(k), put() { gcount.puts++; } };
fs.renameSync(path.join(gdir, 'raw/2026-10.ndjson.gz'), path.join(gdir, 'raw-moved'));
throws(() => io.buildMonth(spy, gman, '2026-10', []), /raw\/2026-10\.ndjson\.gz missing or does not match manifest; refusing to rebuild/);
fs.renameSync(path.join(gdir, 'raw-moved'), path.join(gdir, 'raw/2026-10.ndjson.gz'));
fs.renameSync(path.join(gdir, 'daily/2026-10.ndjson.gz'), path.join(gdir, 'daily-moved'));
throws(() => io.buildMonth(spy, gman, '2026-10', []), /daily\/2026-10\.ndjson\.gz missing or does not match manifest/);
fs.renameSync(path.join(gdir, 'daily-moved'), path.join(gdir, 'daily/2026-10.ndjson.gz'));
fs.writeFileSync(path.join(gdir, 'raw/2026-10.ndjson.gz'), core.serializeNdjsonGz([R(D0, 'a', 1), R(D0 + 5, 'x', 1)]));   // valid gzip, wrong sha
throws(() => io.buildMonth(spy, gman, '2026-10', []), /does not match manifest; refusing to rebuild/);
fs.writeFileSync(path.join(gdir, 'raw/2026-10.ndjson.gz'), gSnapshot[1]);
fs.writeFileSync(path.join(gdir, 'raw/2026-12.ndjson.gz'), 'orphan');
throws(() => io.buildMonth(spy, gman, '2026-12', []), /orphan/);
fs.rmSync(path.join(gdir, 'raw/2026-12.ndjson.gz'));
eq(gcount.puts, 0, 'nothing uploaded by any refused rebuild');
ok(gbytes('manifest.json').equals(gSnapshot[0]), 'manifest untouched');
// CLI: a manifest month whose file vanished -> exit 1, nothing uploaded, manifest untouched
const wj = (name, obj) => { const f = path.join(tmp, name); fs.writeFileSync(f, JSON.stringify(obj)); return f; };
const runNode0 = (script, args) => spawnSync(process.execPath, [path.join(__dirname, 'scripts', script), ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
const gcli = ['--store', 'local:' + gdir, '--samples-fixture', wj('g.json', [{ ts: S0_G(), pool_id: 'q', apy: 1, tvl_usd: 1 }]), '--snapshot-fixture', wj('gs.json', {})];
function S0_G() { return T('2026-10-05T00:00:00Z'); }
fs.rmSync(path.join(gdir, 'daily/2026-10.ndjson.gz'));
const gr = runNode0('history-archive.js', gcli);
eq(gr.status, 1, 'archive CLI refuses when a manifest file is missing');
ok(/refusing to rebuild/.test(gr.stderr), gr.stderr);
ok(gbytes('manifest.json').equals(gSnapshot[0]), 'manifest still untouched after CLI refusal');

// --- archive CLI end to end -------------------------------------------------------------
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin);
const marker = path.join(tmp, 'npx-called');
fs.writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\necho "$@" >> "${marker}"\nexit 1\n`, { mode: 0o755 });
const w = (name, obj) => { const f = path.join(tmp, name); fs.writeFileSync(f, JSON.stringify(obj)); return f; };
const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, GITHUB_STEP_SUMMARY: '' };
const runNode = (script, args, cwd) => spawnSync(process.execPath, [path.join(__dirname, 'scripts', script), ...args], { encoding: 'utf8', env, cwd });

const S0 = T('2026-10-31T21:00:00Z');
const samplesF = w('samples.json', [
  { ts: S0, pool_id: 'a', apy: 3, tvl_usd: 1e6 }, { ts: S0, pool_id: 'b', apy: 4, tvl_usd: 2e6 },
  { ts: S0 + 10800, pool_id: 'a', apy: 5, tvl_usd: 1e6 }, { ts: S0 + 10800, pool_id: 'b', apy: 6000, tvl_usd: 2e6 },
  { ts: S0 + 2 * 10800, pool_id: 'a', apy: null, tvl_usd: 1 }]);   // null apy = junk row
const snapF = w('snap.json', { generatedAt: '2026-11-01T07:00:00.000Z', pools: [{ pool: 'a', tvlUsd: 1e6, apyBase: 2, apyReward: 1 }, { pool: 'c', tvlUsd: 5e5, apyBase: 7 }] });
const storeDir = path.join(tmp, 'store');
const cli = ['--store', 'local:' + storeDir, '--samples-fixture', samplesF, '--snapshot-fixture', snapF];
const noInit = runNode('history-archive.js', cli);
eq(noInit.status, 1, 'missing manifest without --init -> exit 1');
ok(/no manifest: run the backfill with --init first/.test(noInit.stderr), 'clear message: ' + noInit.stderr);
ok(!fs.existsSync(storeDir), 'nothing written without --init');
const INIT = ['--init'];
const dry = runNode('history-archive.js', [...cli, ...INIT, '--dry-run']);
eq(dry.status, 0, 'dry-run exit 0: ' + dry.stderr);
ok(!fs.existsSync(storeDir), 'dry-run writes nothing');
const run1 = runNode('history-archive.js', [...cli, ...INIT]);
eq(run1.status, 0, 'run 1 exit 0: ' + run1.stderr);
ok(/newSamples=4 ciPoints=2 months=2026-10,2026-11 uploadedFiles=4 .*manifest=written trimmed=skipped/.test(run1.stdout), 'summary: ' + run1.stdout);
const st = io.localDir(storeDir);
const man = io.loadManifest(st);
deep(man.watermark, { samples_ts: S0 + 2 * 10800, samples_pool_id: 'a', ci_snapshot_generatedAt: '2026-11-01T07:00:00.000Z' }, 'watermarks (advance past the skipped junk row)');
deep(Object.keys(man.months), ['2026-10', '2026-11'], 'months split at UTC month boundary');
const octRaw = core.parseNdjsonGz(st.get('raw/2026-10.ndjson.gz'));
const novRaw = core.parseNdjsonGz(st.get('raw/2026-11.ndjson.gz'));
deep([octRaw.length, novRaw.length], [2, 4], 'raw rows per month (invalid sample skipped)');
eq(man.months['2026-11'].raw.sha256, core.sha256(st.get('raw/2026-11.ndjson.gz')), 'manifest sha256 matches the file');
const novDaily = core.parseNdjsonGz(st.get('daily/2026-11.ndjson.gz'));
const dA = novDaily.find((r) => r.pool_id === 'a');
deep([dA.src, dA.n], ['samples', 1], 'Nov 1 pool a: samples beat ci_snapshot');
eq(novDaily.find((r) => r.pool_id === 'c').src, 'ci_snapshot', 'pool c only in ci snapshot');
eq(novDaily.find((r) => r.pool_id === 'b').anomalous, true, 'anomalous pool-day flagged');
ok(novRaw.some((r) => r.pool_id === 'b' && r.apy === 6000), 'out-of-rail apy KEPT in raw');
const before = ['manifest.json', 'raw/2026-10.ndjson.gz', 'raw/2026-11.ndjson.gz', 'daily/2026-10.ndjson.gz', 'daily/2026-11.ndjson.gz'].map((k) => st.get(k));
const mtimeBefore = fs.statSync(path.join(storeDir, 'manifest.json')).mtimeMs;
const run2 = runNode('history-archive.js', cli);
eq(run2.status, 0, 'run 2 exit 0: ' + run2.stderr);
ok(/newSamples=0 ciPoints=0 months=- uploadedFiles=0 bytes=0 manifest=unchanged/.test(run2.stdout), 'run 2 is a no-op: ' + run2.stdout);
['manifest.json', 'raw/2026-10.ndjson.gz', 'raw/2026-11.ndjson.gz', 'daily/2026-10.ndjson.gz', 'daily/2026-11.ndjson.gz'].forEach((k, i) => ok(st.get(k).equals(before[i]), 'byte-identical after run 2: ' + k));
eq(fs.statSync(path.join(storeDir, 'manifest.json')).mtimeMs, mtimeBefore, 'manifest not rewritten');
ok(!fs.existsSync(marker), 'no wrangler/npx call with fixtures');
// a later run adds only the new slot
const samples2 = w('samples2.json', [...JSON.parse(fs.readFileSync(samplesF, 'utf8')), { ts: S0 + 3 * 10800, pool_id: 'a', apy: 8, tvl_usd: 3 }]);
const run3 = runNode('history-archive.js', ['--store', 'local:' + storeDir, '--samples-fixture', samples2, '--snapshot-fixture', snapF]);
ok(/newSamples=1 ciPoints=0 months=2026-11 uploadedFiles=2 /.test(run3.stdout), 'incremental run: ' + run3.stdout + run3.stderr);
ok(st.get('raw/2026-10.ndjson.gz').equals(before[1]), 'untouched month file unchanged');
// failure before manifest -> exit 1, manifest untouched
const badStore = path.join(tmp, 'bad');
fs.mkdirSync(badStore); fs.mkdirSync(path.join(badStore, 'raw'));
fs.writeFileSync(path.join(badStore, 'raw', '2026-10.ndjson.gz'), 'not gzip');
const run4 = runNode('history-archive.js', ['--init', '--store', 'local:' + badStore, '--samples-fixture', samplesF, '--snapshot-fixture', snapF]);
eq(run4.status, 1, 'corrupt existing month -> exit 1');
ok(!fs.existsSync(path.join(badStore, 'manifest.json')), 'no manifest written on failure');
eq(runNode('history-archive.js', ['--bogus']).status, 1, 'unknown arg -> exit 1');
eq(runNode('history-archive.js', ['--store', 'nope']).status, 1, 'bad store -> exit 1');

// --- backfill end to end (tiny temporary git repo) ---------------------------------------
const repo = path.join(tmp, 'repo'); fs.mkdirSync(path.join(repo, 'data', 'history'), { recursive: true });
const gitIn = (args, date) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8',
  env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
    ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) } });
const commit = (msg, date) => { gitIn(['add', '-A'], date); gitIn(['commit', '-q', '-m', msg], date); };
const wr = (rel, obj) => fs.writeFileSync(path.join(repo, rel), JSON.stringify(obj));
gitIn(['init', '-q']);
const snap = (gen, pools) => ({ schemaVersion: 1, generatedAt: gen, source: 's', minTvlUsd: 1, count: pools.length, pools });
wr('data/pools-snapshot.json', snap('2026-10-01T07:00:00.000Z', [{ pool: 'a', tvlUsd: 100, apyBase: 1, apyReward: 1 }, { pool: 'b', tvlUsd: 200, apyBase: 4 }]));
wr('data/history/2026-09-30.json', { schemaVersion: 1, date: '2026-09-30', pools: { a: [9, 90], h: [2.5, 25] } });
commit('v1', '2026-10-01T07:05:00Z');
wr('data/pools-snapshot.json', snap('2026-10-01T15:00:00.000Z', [{ pool: 'a', tvlUsd: 110, apyBase: 3, apyReward: 1 }, { pool: 'b', tvlUsd: 210, apyBase: 5000 }]));
wr('data/history/2026-09-30.json', { schemaVersion: 1, date: '2026-09-30', pools: { a: [8, 80], h: [3, 30] } });   // later content wins
wr('data/history/2026-10-01.json', { schemaVersion: 1, date: '2026-10-01', pools: { a: [7, 70], h: [4, 40] } });
commit('v2', '2026-10-01T15:05:00Z');
wr('data/pools-snapshot.json', snap('2026-10-02T07:00:00.000Z', [{ pool: 'a', tvlUsd: 120, apyBase: 2 }]));
commit('v3', '2026-10-02T07:05:00Z');
fs.rmSync(path.join(repo, 'data', 'pools-snapshot.json'));
commit('untrack snapshot', '2026-10-03T07:05:00Z');   // like the real 2026-10-21 deletion: must be skipped

const T1 = T('2026-10-01T10:00:00Z');
const legacyF = path.join(tmp, 'legacy.sql');
fs.writeFileSync(legacyF, `INSERT INTO "pool_history" VALUES('a',${T1},2.5,150);\nINSERT INTO "pool_history" VALUES('a',${T1 + 3600},3.5,160),('l',${T1},1,1);\n`);
const bstore = path.join(tmp, 'bstore');
const bargs = ['--repo', repo, '--store', 'local:' + bstore, '--legacy-sql', legacyF, '--init'];
eq(runNode('history-backfill.js', bargs.slice(0, -1)).status, 1, 'backfill without --init and no manifest -> exit 1');
ok(!fs.existsSync(bstore), 'nothing written');
const bdry = runNode('history-backfill.js', [...bargs, '--dry-run']);
eq(bdry.status, 0, 'backfill dry-run: ' + bdry.stderr);
ok(!fs.existsSync(bstore), 'backfill dry-run writes nothing');
ok(/git_snapshot=5 points \(3 versions, 1 skipped\) git_history=4 entries legacy_hourly=3/.test(bdry.stdout), 'per-source counts: ' + bdry.stdout);
const b1 = runNode('history-backfill.js', bargs);
eq(b1.status, 0, 'backfill run 1: ' + b1.stderr);
const bst = io.localDir(bstore);
const bman = io.loadManifest(bst);
deep(Object.keys(bman.months), ['2026-09', '2026-10'], 'manifest months (history file reaches into Sept)');
deep(bman.watermark, core.emptyManifest().watermark, 'watermarks untouched by the backfill');
const bRaw = core.parseNdjsonGz(bst.get('raw/2026-10.ndjson.gz'));
deep(bRaw.map((r) => `${r.src}:${r.pool_id}`).sort(),
  ['git_snapshot:a', 'git_snapshot:a', 'git_snapshot:a', 'git_snapshot:b', 'git_snapshot:b', 'legacy_hourly:a', 'legacy_hourly:a', 'legacy_hourly:l'], 'raw rows by source');
eq(bRaw.find((r) => r.src === 'git_snapshot' && r.pool_id === 'a' && r.tvl_usd === 110).apy_base, 3, 'git_snapshot keeps apy_base');
const bDaily = core.parseNdjsonGz(bst.get('daily/2026-10.ndjson.gz'));
const dRow = (day, id) => bDaily.find((r) => r.day === day && r.pool_id === id);
deep([dRow('2026-10-01', 'a').src, dRow('2026-10-01', 'a').n, dRow('2026-10-01', 'a').mean], ['legacy_hourly', 2, 3], 'legacy beats git_snapshot and git_history for a/10-01');
eq(dRow('2026-10-01', 'b').src, 'git_snapshot', 'b/10-01 from git_snapshot');
deep([dRow('2026-10-01', 'b').anomalous, dRow('2026-10-01', 'b').mean, dRow('2026-10-01', 'b').n], [undefined, 4, 2], 'b/10-01: anomalous point excluded from stats, row not flagged');
eq(dRow('2026-10-01', 'h').src, 'git_history', 'h/10-01 only in the history file');
eq(dRow('2026-10-02', 'a').src, 'git_snapshot', 'a/10-02 from v3');
const sepDaily = core.parseNdjsonGz(bst.get('daily/2026-09.ndjson.gz'));
deep(sepDaily.map((r) => [r.pool_id, r.src, r.close, r.tvl_close]), [['a', 'git_history', 8, 80], ['h', 'git_history', 3, 30]], 'last committed history content wins');
const bFiles = ['manifest.json', 'raw/2026-10.ndjson.gz', 'daily/2026-10.ndjson.gz', 'daily/2026-09.ndjson.gz'];
const bBefore = bFiles.map((k) => bst.get(k));
const b2 = runNode('history-backfill.js', bargs);
eq(b2.status, 0, 'backfill run 2');
ok(/uploadedFiles=0 bytes=0 manifest=unchanged/.test(b2.stdout), 'second backfill is a no-op: ' + b2.stdout);
bFiles.forEach((k, i) => ok(bst.get(k).equals(bBefore[i]), 'byte-identical after re-run: ' + k));
// the daily job after a backfill must keep the git_history rows
const archiveAfter = runNode('history-archive.js', ['--store', 'local:' + bstore, '--samples-fixture', w('s3.json', [{ ts: T('2026-10-04T00:00:00Z'), pool_id: 'z', apy: 1, tvl_usd: 1 }]), '--snapshot-fixture', w('nosnap.json', {})]);
eq(archiveAfter.status, 0, 'archive after backfill: ' + archiveAfter.stderr);
ok(bst.get('daily/2026-09.ndjson.gz').equals(bBefore[3]), 'archive job leaves git_history daily rows alone');
// since/until filters
const bstore2 = path.join(tmp, 'bstore2');
const bf = runNode('history-backfill.js', ['--init', '--repo', repo, '--store', 'local:' + bstore2, '--since', '2026-10-02', '--until', '2026-10-02']);
ok(/git_snapshot=1 points \(1 versions, 0 skipped\) git_history=0 entries legacy_hourly=0/.test(bf.stdout), '--since/--until filter: ' + bf.stdout + bf.stderr);
eq(runNode('history-backfill.js', ['--since', 'yesterday']).status, 1, 'bad date -> exit 1');
ok(!fs.existsSync(marker), 'no wrangler/npx call anywhere in the CLI tests');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`test_history_archive: ${passed} assertions passed`);
