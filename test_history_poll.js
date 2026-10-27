/* Unit + CLI tests for the v2 history poller (scripts/history-poll-core.js,
   scripts/history-poll.js). Pure Node, fixtures only, NO network, NO wrangler:
   the CLI tests put a fake `npx` first on PATH that records any call.

   Run: node test_history_poll.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const core = require('./scripts/history-poll-core.js');
const pollerCore = require('./src/poller-core.js');

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); passed++; }
function deep(a, b, msg) { assert.deepStrictEqual(a, b, msg); passed++; }

// --- slotTs ------------------------------------------------------------------
const MIDNIGHT = Date.parse('2026-10-22T00:00:00Z') / 1000;
eq(core.SLOT_SECONDS, 10800, 'slot is 3h');
eq(core.slotTs(MIDNIGHT), MIDNIGHT, 'boundary maps to itself');
eq(core.slotTs(MIDNIGHT + 10799), MIDNIGHT, 'last second of slot');
eq(core.slotTs(MIDNIGHT + 10800), MIDNIGHT + 10800, 'next boundary');
eq(core.slotTs(MIDNIGHT + 10800 * 3 + 5.9), MIDNIGHT + 10800 * 3, 'fractional seconds floor');
eq(core.slotTs(MIDNIGHT + 7 * 60), MIDNIGHT, 'cron delay stays in the same slot');

// --- totalApy parity with the Worker's core ----------------------------------
[{ apyBase: 3, apyReward: 2 }, { apyBase: 1.111111, apyReward: 0 }, {}, { apyBase: null, apyReward: 2.33335 },
 { apyBase: '4.5', apyReward: undefined }, { apyBase: 4000 }].forEach((p, i) => {
  eq(Object.is(core.totalApy(p), pollerCore.totalApy(p)), true, 'totalApy parity #' + i);
});

// --- selectPools -------------------------------------------------------------
const P = (pool, tvlUsd, apyBase, apyReward) => ({ pool, tvlUsd, apyBase, apyReward });
const sel = core.selectPools([
  P('big', 5e6, 4, 1),
  P('edge', 1e6, 2, 0),             // == track floor
  P('hover-prev', 7e5, 3, 0),       // sticky only if in prevIds
  P('hover-new', 7e5, 3, 0),        // not in prevIds -> dropped
  P('low-prev', 4e5, 3, 0),         // below keep floor -> dropped even if in prevIds
  P('stock', 5e4, 6, 0),            // watch at any tvl
  P('anom', 2e6, 4000, 0),          // anomalous APY KEPT
  P('bad-apy', 2e6, Infinity, 0),   // invalid
  P('bad-tvl', Infinity, 1, 0),     // invalid
  P('big', 9e9, 1, 0),              // duplicate id ignored
  { tvlUsd: 9e9 }, null, P(42, 9e9, 1, 0)   // no usable id
], { prevIds: new Set(['hover-prev', 'low-prev']), watchIds: new Set(['stock']) });
deep(sel.rows.map((r) => r.pool_id), ['anom', 'big', 'edge', 'hover-prev', 'stock'], 'selected ids, sorted');
deep(sel.counts, { tracked: 3, sticky: 1, watch: 1, total: 5 }, 'counts by reason');
eq(sel.skippedInvalid, 2, 'invalid skipped and counted');
eq(sel.rows.find((r) => r.pool_id === 'big').apy, 5, 'first duplicate wins, apy = base+reward');
eq(sel.rows.find((r) => r.pool_id === 'anom').apy, 4000, 'anomalous APY kept');
const watchLow = core.selectPools([P('low-prev', 4e5, 3, 0)], { prevIds: new Set(['low-prev']), watchIds: new Set(['low-prev']) });
eq(watchLow.counts.watch, 1, 'watchlist rescues a pool below the keep floor');
const shuffled = core.selectPools([P('b', 2e6, 1, 0), P('a', 2e6, 1, 0), P('c', 2e6, 1, 0)]);
deep(shuffled.rows.map((r) => r.pool_id), ['a', 'b', 'c'], 'deterministic order');
deep(core.selectPools(null).rows, [], 'non-array input -> no rows');

// --- buildInsertSql ----------------------------------------------------------
const sql1 = core.buildInsertSql(MIDNIGHT, [{ pool_id: "it's", apy: 1.5, tvl_usd: 2e6 }]);
eq(sql1, `INSERT OR REPLACE INTO samples (ts, pool_id, apy, tvl_usd) VALUES (${MIDNIGHT},'it''s',1.5,2000000);\n`, 'escaping + shape');
const many = Array.from({ length: 1000 }, (_, i) => ({ pool_id: 'pool-' + i, apy: 1.2345, tvl_usd: 1e6 + i }));
const chunked = core.buildInsertSql(MIDNIGHT, many).trim().split('\n');
eq(chunked.length, 3, '1000 rows / 400 = 3 statements');
ok(chunked.every((s) => s.startsWith('INSERT OR REPLACE INTO samples') && s.endsWith(';')), 'each chunk is one statement');
eq(core.buildInsertSql(MIDNIGHT, many, { rowsPerStatement: 100 }).trim().split('\n').length, 10, 'custom chunk size');
assert.throws(() => core.buildInsertSql(MIDNIGHT, [{ pool_id: 'x'.repeat(95000), apy: 1, tvl_usd: 1 }]), /exceeds/); passed++;
assert.throws(() => core.buildInsertSql(MIDNIGHT, [{ pool_id: 'a', apy: NaN, tvl_usd: 1 }]), /non-finite/); passed++;
assert.throws(() => core.buildInsertSql(MIDNIGHT, [{ pool_id: 'a', apy: 1, tvl_usd: Infinity }]), /non-finite/); passed++;
eq(core.buildInsertSql(MIDNIGHT, []), '', 'no rows -> empty sql');
eq(core.buildInsertSql(MIDNIGHT, [{ pool_id: 'a', apy: 1e-7, tvl_usd: 1 }]).includes('1e-7'), true, 'numbers use round-trip form');

// --- watchIdsFromStocksPools ---------------------------------------------------
deep(Array.from(core.watchIdsFromStocksPools({ pools: [{ id: 'a' }, { id: 'b' }, { id: '' }, {}, null, { id: 5 }] })).sort(), ['a', 'b'], 'valid shape');
[undefined, null, 'x', {}, { pools: 'no' }, []].forEach((j, i) => eq(core.watchIdsFromStocksPools(j).size, 0, 'invalid input #' + i));

// --- CLI (dry-run) -------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'history-poll-test-'));
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin);
const marker = path.join(tmp, 'npx-called');
fs.writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\necho "$@" >> "${marker}"\nexit 1\n`, { mode: 0o755 });
const w = (name, obj) => { const f = path.join(tmp, name); fs.writeFileSync(f, JSON.stringify(obj)); return f; };
const bulk = Array.from({ length: 1200 }, (_, i) => P('p' + String(i).padStart(4, '0'), i < 10 ? 2e6 : 1e4, 3, 1));
bulk.push(P('stock-1', 2e4, 7, 0), P('sticky-1', 6e5, 2, 0));
const poolsF = w('pools.json', { status: 'success', data: bulk });
const stocksF = w('stocks.json', { pools: [{ id: 'stock-1' }] });
const prevF = w('prev.json', [{ results: [{ pool_id: 'sticky-1' }] }]);
const run = (args) => spawnSync(process.execPath, [path.join(__dirname, 'scripts', 'history-poll.js'), ...args],
  { encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, GITHUB_STEP_SUMMARY: '' } });

const outF = path.join(tmp, 'out.sql');
const r = run(['--dry-run', '--out', outF, '--pools-fixture', poolsF, '--stocks-fixture', stocksF, '--prev-ids-file', prevF]);
eq(r.status, 0, 'dry-run exits 0: ' + r.stderr);
const outSql = fs.readFileSync(outF, 'utf8');
eq((outSql.match(/\(\d+,'/g) || []).length, 12, '10 tracked + 1 watch + 1 sticky rows');
ok(outSql.includes("'stock-1',7,20000") && outSql.includes("'sticky-1',2,600000"), 'watch and sticky rows present');
ok(!outSql.includes("'p0500'"), 'small unwatched pool excluded');
ok(/rows=12 tracked=10 sticky=1 watch=1 skippedInvalid=0 watchlist=1 prevIds=1 /.test(r.stdout), 'summary line: ' + r.stdout);
ok(/^INSERT OR REPLACE INTO samples \(ts, pool_id, apy, tvl_usd\) VALUES \((\d+),/.test(outSql) && Number(RegExp.$1) % 10800 === 0, 'slot-floored ts');
ok(!fs.existsSync(marker), 'no wrangler/npx call in dry-run');

const r2 = run(['--dry-run', '--out', path.join(tmp, 'o2.sql'), '--pools-fixture', poolsF, '--stocks-fixture', path.join(tmp, 'missing.json')]);
eq(r2.status, 0, 'missing stocks fixture does not fail the poll');
ok(/WARN watchlist/.test(r2.stderr) && /prevIds=0 /.test(r2.stdout), 'warns, empty watchlist and prev ids');
ok(!fs.existsSync(marker), 'still no wrangler call without --prev-ids-file in dry-run');

const small = w('small.json', { data: bulk.slice(0, 999) });
const r3 = run(['--dry-run', '--out', path.join(tmp, 'o3.sql'), '--pools-fixture', small, '--stocks-fixture', stocksF]);
eq(r3.status, 1, '<1000 pools aborts with exit 1');
ok(/ABORT/.test(r3.stderr) && !fs.existsSync(path.join(tmp, 'o3.sql')), 'abort writes nothing');

// --- fallback skip (GITHUB_EVENT_NAME=schedule), fake npx answering the count query ---
const bin2 = path.join(tmp, 'bin2'); fs.mkdirSync(bin2);
const marker2 = path.join(tmp, 'npx2-called');
const fakeNpx2 = (json) => fs.writeFileSync(path.join(bin2, 'npx'), `#!/bin/sh\necho "$@" >> "${marker2}"\necho '${json}'\n`, { mode: 0o755 });
const runSched = (evt, extra) => spawnSync(process.execPath, [path.join(__dirname, 'scripts', 'history-poll.js'), '--out', path.join(tmp, 'o4.sql'), '--pools-fixture', poolsF, '--stocks-fixture', stocksF, '--prev-ids-file', prevF, ...extra],
  { encoding: 'utf8', env: { ...process.env, PATH: bin2 + path.delimiter + process.env.PATH, GITHUB_STEP_SUMMARY: '', GITHUB_EVENT_NAME: evt } });
fakeNpx2('[{"results":[{"n":1}],"success":true}]');
const s1 = runSched('schedule', []);
eq(s1.status, 0, 'skipped fallback exits 0: ' + s1.stderr);
ok(/already written, fallback run skipped/.test(s1.stdout) && !/history-poll slot=/.test(s1.stdout), 'fallback skipped when slot has rows');
ok(/SELECT COUNT\(\*\) AS n FROM \(SELECT 1 FROM samples WHERE ts = \d+ LIMIT 1\)/.test(fs.readFileSync(marker2, 'utf8')), 'count query sent to wrangler');
fs.rmSync(marker2);
const s2 = runSched('workflow_dispatch', []);
ok(!fs.existsSync(marker2) || !/COUNT/.test(fs.readFileSync(marker2, 'utf8')), 'dispatched run does not run the skip check');
ok(!/fallback run skipped/.test(s2.stdout), 'dispatched run always polls');
fs.rmSync(marker2, { force: true });
const s3 = runSched('schedule', ['--dry-run']);
ok(!/fallback run skipped/.test(s3.stdout) && !fs.existsSync(marker2), 'dry-run never skips');
fakeNpx2('[{"results":[{"n":0}],"success":true}]');
const s4 = runSched('schedule', []);
ok(!/fallback run skipped/.test(s4.stdout), 'empty slot: fallback polls on');
fs.writeFileSync(path.join(bin2, 'npx'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
const s5 = runSched('schedule', []);
ok(/WARN skip check/.test(s5.stderr) && !/fallback run skipped/.test(s5.stdout), 'failed check warns and continues polling');

// --- fallback skip check helpers ---------------------------------------------
eq(core.slotExistsSql(MIDNIGHT), `SELECT COUNT(*) AS n FROM (SELECT 1 FROM samples WHERE ts = ${MIDNIGHT} LIMIT 1)`, 'slotExistsSql shape');
eq(core.slotExistsSql(MIDNIGHT + 0.9), core.slotExistsSql(MIDNIGHT), 'slotExistsSql floors ts');
assert.throws(() => core.slotExistsSql('x'), /bad ts/); passed++;
eq(core.countFromD1Json([{ results: [{ n: 1 }], success: true }]), 1, 'count 1');
eq(core.countFromD1Json([{ results: [{ n: 0 }] }]), 0, 'count 0');
assert.throws(() => core.countFromD1Json([]), /unexpected/); passed++;
assert.throws(() => core.countFromD1Json([{ results: [] }]), /unexpected/); passed++;
assert.throws(() => core.countFromD1Json({ n: 1 }), /unexpected/); passed++;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`test_history_poll: ${passed} assertions passed`);
