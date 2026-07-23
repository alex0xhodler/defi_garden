/* Unit test for generate-history-backfill.js. Pure Node, no network, no D1.
   THE key assertion: the rows the converter emits, fed through the REAL
   compute-kpis.js `reshapeDbRows`, reproduce the file-history entries exactly —
   so KPIs are byte-identical whether sourced from D1 or the files (no gap, no
   drift when 110 switches source). Also covers ts=midnight-UTC, escaping,
   INSERT OR REPLACE / column shape, chunking, and empty input.

   Run: node test_history_backfill.js */

'use strict';
const assert = require('assert');
const bf = require('./generate-history-backfill.js');
const { reshapeDbRows } = require('./compute-kpis.js'); // the real 110 reshaper

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, m); passed++; };
const deep = (a, b, m) => { assert.deepStrictEqual(a, b, m); passed++; };

// --- midnight-UTC seconds ----------------------------------------------------
eq(bf.midnightUtcSeconds('2026-07-14'), Date.parse('2026-07-14T00:00:00.000Z') / 1000, 'midnight-UTC secs');
eq(bf.midnightUtcSeconds('garbage'), null, 'unparseable date → null');
// reshapeDbRows must bucket that ts back to the SAME calendar day
eq(new Date(bf.midnightUtcSeconds('2026-07-14') * 1000).toISOString().slice(0, 10), '2026-07-14', 'ts→date round-trips');

// --- THE round-trip: rows → reshapeDbRows === original file entries ----------
const files = [
  { schemaVersion: 1, date: '2026-07-14', generatedAt: 'x', count: 2,
    pools: { 'aaa-111': [2.209, 17890675676], 'bbb-222': [0, 50000000] } },
  { schemaVersion: 1, date: '2026-07-15', generatedAt: 'y', count: 1,
    pools: { 'aaa-111': [4000.1234, 12345678] } },  // anomalous kept, apy preserved
];
const rows = bf.rowsFromHistory(files);
eq(rows.length, 3, 'flattened 3 pool-rows across 2 days');

const reshaped = reshapeDbRows(rows);
// reshapeDbRows returns [{date, pools:{id:[apy,tvl]}}] — compare to the files' date+pools
const expected = files.map((f) => ({ date: f.date, pools: f.pools }));
deep(reshaped, expected, 'rows → reshapeDbRows reproduces the file entries EXACTLY (identical KPI input)');

// --- row shape mirrors the poller -------------------------------------------
const r0 = rows.find((r) => r.pool_id === 'aaa-111' && r.tvl_usd === 17890675676);
eq(r0.apy, 2.209, 'apy preserved (4dp)');
eq(r0.ts, bf.midnightUtcSeconds('2026-07-14'), 'ts = midnight-UTC of its date');
ok(Number.isInteger(r0.ts), 'ts integer seconds');

// --- SQL output --------------------------------------------------------------
const sql = bf.toSql(rows);
ok(sql.includes('INSERT OR REPLACE INTO pool_history (pool_id, ts, apy, tvl_usd) VALUES'), 'INSERT OR REPLACE, matching columns');
ok(sql.includes("('aaa-111'"), 'pool id quoted');
ok(!sql.includes('undefined') && !sql.includes('NaN'), 'no undefined/NaN literals');

// escaping: a pool id containing a quote must be doubled
const esc = bf.toSql([{ pool_id: "o'brien", ts: 1, apy: 1, tvl_usd: 2 }]);
ok(esc.includes("'o''brien'"), "single quote escaped by doubling");

// chunking: >200 rows → multiple INSERT statements
const many = Array.from({ length: 450 }, (_, i) => ({ pool_id: 'p' + i, ts: 1, apy: 1, tvl_usd: 1 }));
const chunkSql = bf.toSql(many);
eq((chunkSql.match(/INSERT OR REPLACE/g) || []).length, 3, '450 rows → 3 chunked inserts (200 each)');

// empty input → valid no-op SQL, no throw
ok(bf.toSql([]).includes('no history rows'), 'empty → honest no-op SQL');
eq(bf.rowsFromHistory(null).length, 0, 'null entries → []');
eq(bf.rowsFromHistory([{ date: '2026-07-14' }]).length, 0, 'entry with no pools → no rows');

console.log(`test_history_backfill.js: ${passed}/${passed} assertions passed`);
