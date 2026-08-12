/* test_mean30d_mirror.js — coordinator review, item 232 follow-up.

   generate-token-pages.js's `mean30dSane` is a THIRD physical copy of the
   predicate in generate-pool-pages.js:139 (itself a mirror of
   PoolDetail.js:283-288, item 144's rail) — deliberately NOT a require of
   generate-pool-pages.js, because that require is a plain string in this
   file's TEXT and run-tests.js's lane classifier does a static text scan:
   generate-pool-pages.js requires ./audit-app.js (the real "browser" marker
   source), and that one require silently re-laned 21 plain-lane files into
   browser (see generate-token-pages.js's own comment on `mean30dSane` for
   the full incident). Keeping the local copy is the right call given that
   blast radius — but per RAZOR.md side 2 / build.md's guard rule, a
   hand-maintained mirror of something machine-readable gets a tested
   set-equality against the original, both directions, in the same commit
   that creates it. Item 212 (Markdown-twin fact parity) is the precedent:
   an untested mirror launders a gap as coverage.

   THIS FILE deliberately requires generate-pool-pages.js (the mirror's
   original) — which means IT lands in the browser lane via the same
   audit-app.js edge. That is correct and expected: it is kept in its own
   file, separate from test_token_depth_section.js, precisely so the depth-
   section test can stay plain-lane fast while this one carries the
   necessarily-browser-laned require.

   Population: every pool in the committed data/pools-snapshot.json (the
   real estate, not a hand-picked sample) PLUS a crafted set of boundary
   values the snapshot may not contain: exactly APY_SANITY_LIMIT, just above
   it, exactly 0, negative, null, undefined, NaN, Infinity, a string, and
   item 144's real 36452.38798 instance.

   Run: node test_mean30d_mirror.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const gtp = require('./generate-token-pages.js'); // the local copy (this item)
const gpp = require('./generate-pool-pages.js');   // the original (item 144 / spec 139)

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('test_mean30d_mirror.js — mean30dSane agreement: generate-token-pages.js vs generate-pool-pages.js\n');

// ---------------------------------------------------------------------------
// Population: the real committed snapshot estate.
// ---------------------------------------------------------------------------
const SNAPSHOT_PATH = path.join(__dirname, 'data', 'pools-snapshot.json');
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
const snapshotPools = snapshot.pools || snapshot.data || snapshot;
assert.ok(Array.isArray(snapshotPools) && snapshotPools.length > 0,
  `sanity: data/pools-snapshot.json must yield a non-empty pool array, got ${typeof snapshotPools}`);

// Crafted boundary values, on top of (never replacing) the real estate —
// mean30dSane only reads `.apyMean30d`, so a minimal `{ apyMean30d: <v> }`
// stand-in is a faithful test subject for each case.
const LIMIT = gtp.APY_SANITY_LIMIT;
const BOUNDARY_CASES = [
  { label: 'exactly APY_SANITY_LIMIT', apyMean30d: LIMIT },
  { label: 'just above APY_SANITY_LIMIT', apyMean30d: LIMIT + 0.00001 },
  { label: 'exactly 0', apyMean30d: 0 },
  { label: 'negative', apyMean30d: -5 },
  { label: 'null', apyMean30d: null },
  { label: 'undefined (explicit)', apyMean30d: undefined },
  { label: 'NaN', apyMean30d: NaN },
  { label: 'Infinity', apyMean30d: Infinity },
  { label: 'a string', apyMean30d: '5' },
  { label: "item 144's real 36452.38798 instance", apyMean30d: 36452.38798 },
];
// A pool object without the key at all (as distinct from `apyMean30d: undefined`
// — the two are observably different to `typeof pool.apyMean30d === 'number'`
// only if a caller relies on `in`/hasOwnProperty, which mean30dSane does not,
// but it's a real shape live pool data can take, so it's worth covering too).
const KEY_ABSENT_CASE = { label: 'apyMean30d key absent entirely', pool: {} };

const boundaryPools = BOUNDARY_CASES.map(c => ({ label: c.label, pool: { apyMean30d: c.apyMean30d } }))
  .concat([KEY_ABSENT_CASE]);

const snapshotEntries = snapshotPools.map((p, i) => ({ label: `snapshot[${i}] (${p.project || '?'}/${p.symbol || '?'})`, pool: p }));
const population = snapshotEntries.concat(boundaryPools);

console.log(`  population: ${snapshotEntries.length} real snapshot pools + ${boundaryPools.length} crafted boundary cases = ${population.length} total\n`);

// ---------------------------------------------------------------------------
// (1) Agreement over the full population, both directions (a===b is
// symmetric, but the assertion message names which module disagreed).
// ---------------------------------------------------------------------------
test(`mean30dSane(generate-token-pages.js) === mean30dSane(generate-pool-pages.js) for all ${population.length} population members`, () => {
  const disagreements = [];
  population.forEach(({ label, pool }) => {
    const a = gtp.mean30dSane(pool);
    const b = gpp.mean30dSane(pool);
    if (a !== b) {
      disagreements.push(`${label}: apyMean30d=${JSON.stringify(pool.apyMean30d)} -> token-pages=${a}, pool-pages=${b}`);
    }
  });
  assert.deepStrictEqual(disagreements, [],
    `${disagreements.length}/${population.length} disagreement(s) found:\n    ` + disagreements.join('\n    '));
});

// ---------------------------------------------------------------------------
// (2) Both predicates read the SAME APY_SANITY_LIMIT value — a future edit
// to one rail can't pass the agreement test above while the two rails
// diverge underneath it (that test only proves behavioral agreement on
// TODAY's population; this proves the constants themselves match).
// ---------------------------------------------------------------------------
test('generate-token-pages.js.APY_SANITY_LIMIT === generate-pool-pages.js.APY_SANITY_LIMIT', () => {
  assert.strictEqual(typeof gtp.APY_SANITY_LIMIT, 'number', 'sanity: generate-token-pages.js must export a numeric APY_SANITY_LIMIT');
  assert.strictEqual(typeof gpp.APY_SANITY_LIMIT, 'number', 'sanity: generate-pool-pages.js must export a numeric APY_SANITY_LIMIT');
  assert.strictEqual(gtp.APY_SANITY_LIMIT, gpp.APY_SANITY_LIMIT,
    `rails diverged: token-pages=${gtp.APY_SANITY_LIMIT}, pool-pages=${gpp.APY_SANITY_LIMIT}`);
});

// ---------------------------------------------------------------------------
// (sanity) the boundary set actually exercises the true/false split — a
// population that never crosses the rail would make (1) vacuously true.
// ---------------------------------------------------------------------------
test('sanity: the population actually contains both mean30dSane()===true and ===false cases (non-vacuity of the population itself)', () => {
  const results = population.map(({ pool }) => gtp.mean30dSane(pool));
  assert.ok(results.some(r => r === true), 'population must contain at least one sane case');
  assert.ok(results.some(r => r === false), 'population must contain at least one insane/unsane case');
});

console.log(`\n${passed} assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));

// Exported for the non-vacuity mutation drill (not used by the test itself).
module.exports = { SNAPSHOT_PATH, md5OfFile: (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex') };
