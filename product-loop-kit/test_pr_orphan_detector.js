/* test_pr_orphan_detector.js — spec 245 acceptance criteria.
 *
 * Loop tooling, not product code — deliberately NOT in package.json's
 * test:serial chain (that chain is the site's own gate; run-tests.js /
 * test_test_registry.js only ever scan the repo ROOT for test_*.js, and
 * this file lives under product-loop-kit/, so it is invisible to both —
 * no risk of drifting the site's registry).
 *
 * Run: node product-loop-kit/test_pr_orphan_detector.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DETECTOR_PATH = path.join(__dirname, 'pr-orphan-detector.js');
const detector = require(DETECTOR_PATH);
const {
  parseStatusLegend,
  parseBacklogStatusById,
  extractItemId,
  classifyPR,
  classifyAll,
  computeNextId,
  detectIdCollisions,
  MARKER_CLASS_MAP,
  BACKLOG_PATH,
} = detector;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('test_pr_orphan_detector.js — spec 245\n');

// ---------------------------------------------------------------------------
// Fixture BACKLOG.md — a small, self-contained markdown string covering the
// legend plus one row per classifier outcome. Independent of the real
// product-loop-kit/BACKLOG.md so these tests never depend on live backlog
// state drifting under them (only the legend-parity test below reads the
// real file, precisely because it must).
// ---------------------------------------------------------------------------

const FIXTURE_BACKLOG = `# BACKLOG — written by the heartbeat, culled by the human, consumed by build loops.
# Statuses: READY → IN_PROGRESS → IN_REVIEW → SHIPPED (measuring) → DONE
#           PARKED (3 strikes) · BLOCKED (question for the human) · CULLED (human said no)
#           GATED(<measurable precondition>) (payoff needs an unmet gate, e.g. ≥30 real waitlist_opened;
#           the heartbeat re-checks every gate each tick and promotes to READY when met — never pings the
#           human; crawler-classified events never count toward a gate. Added 2026-08-04, loop v2 Q2a.)

| ID | Title | Score | Status | Risk | Spec | Attempts | Measure until |
|----|-------|-------|--------|------|------|----------|---------------|
| 900 | fixture: merged already | 5.0 | DONE (shipped) | LOW | specs/900.md | 1 | — |
| 901 | fixture: parked via legend row | 5.0 | PARKED (3-attempt budget spent) | LOW | specs/901.md | 3 | — |
| 902 | fixture: blocked via legend row | 5.0 | BLOCKED (question for the human) | LOW | specs/902.md | 1 | — |
| 903 | fixture: culled but PR left open (anomalous, still surfaced) | 5.0 | CULLED (human said no) | LOW | — | 0 | — |
| 904 | fixture: the #399 shape — mid-pipeline, no terminal marker | 5.0 | IN_REVIEW — build finished, nothing has flagged it | LOW | specs/904.md | 1 | — |
`;

// ---------------------------------------------------------------------------
// Leg A(1) — legend parsing.
// ---------------------------------------------------------------------------

test('parseStatusLegend: extracts exactly the 9 legend words, in order, from lines 2-6', () => {
  const legend = parseStatusLegend(FIXTURE_BACKLOG);
  assert.deepStrictEqual(legend, [
    'READY', 'IN_PROGRESS', 'IN_REVIEW', 'SHIPPED', 'DONE', 'PARKED', 'BLOCKED', 'CULLED', 'GATED',
  ]);
});

test('parseStatusLegend: does not leak all-caps words from outside the legend block (e.g. table rows)', () => {
  const withNoise = FIXTURE_BACKLOG + '\n| 999 | some title with a stray SHOUTY WORD | 1.0 | READY | LOW | — | 0 | — |\n';
  const legend = parseStatusLegend(withNoise);
  assert.ok(!legend.includes('SHOUTY') && !legend.includes('WORD'), 'legend leaked a word from a table row, not the "# Statuses:" block');
});

test('MARKER_CLASS_MAP keys set-equal parseStatusLegend() output on the REAL BACKLOG.md, both directions (item 212 rule: a status added to the legend without updating this map must fail here, not silently misclassify)', () => {
  const realBacklog = fs.readFileSync(BACKLOG_PATH, 'utf8');
  const legendMarkers = new Set(parseStatusLegend(realBacklog));
  const mapKeys = new Set(Object.keys(MARKER_CLASS_MAP));
  const missingFromMap = [...legendMarkers].filter((m) => !mapKeys.has(m));
  const extraInMap = [...mapKeys].filter((m) => !legendMarkers.has(m));
  assert.deepStrictEqual(missingFromMap, [], `BACKLOG.md legend has marker(s) MARKER_CLASS_MAP does not know about: ${JSON.stringify(missingFromMap)}`);
  assert.deepStrictEqual(extraInMap, [], `MARKER_CLASS_MAP has key(s) no longer in BACKLOG.md's legend: ${JSON.stringify(extraInMap)}`);
});

// ---------------------------------------------------------------------------
// Leg A(2) — per-row status parsing + id extraction.
// ---------------------------------------------------------------------------

test('parseBacklogStatusById: reads the Status cell for every fixture row', () => {
  const byId = parseBacklogStatusById(FIXTURE_BACKLOG);
  assert.ok(byId.get('900').startsWith('DONE'));
  assert.ok(byId.get('901').startsWith('PARKED'));
  assert.ok(byId.get('902').startsWith('BLOCKED'));
  assert.ok(byId.get('903').startsWith('CULLED'));
  assert.ok(byId.get('904').startsWith('IN_REVIEW'));
});

test('extractItemId: reads the leading "<id>: " title convention', () => {
  assert.strictEqual(extractItemId({ title: '245: some title', head: { ref: 'claude/loop-245' } }), '245');
});

test('extractItemId: falls back to the claude/loop-<id> branch name when the title has no leading id', () => {
  assert.strictEqual(extractItemId({ title: 'Pendle direction docs', head: { ref: 'claude/loop-161' } }), '161');
});

test('extractItemId: returns null when neither the title nor the branch names an id (the #309 shape)', () => {
  assert.strictEqual(extractItemId({ title: 'Pendle/fixed-yield direction → backlog 150-153', head: { ref: 'claude/pendle-direction' } }), null);
});

// ---------------------------------------------------------------------------
// Leg A(3) — classifyPR / classifyAll: the 5-class fixture set.
// ---------------------------------------------------------------------------

function pr(overrides) {
  return { number: 0, title: '', body: '', state: 'open', merged: false, head: { ref: '' }, ...overrides };
}

test('classifyPR: merged PR → "merged"', () => {
  const r = classifyPR(pr({ number: 1, title: '900: fixture', merged: true, state: 'closed', head: { ref: 'claude/loop-900' } }), FIXTURE_BACKLOG);
  assert.strictEqual(r.class, 'merged');
});

test('classifyPR: open PR whose BACKLOG row is PARKED → "PARKED"', () => {
  const r = classifyPR(pr({ number: 2, title: '901: fixture', head: { ref: 'claude/loop-901' } }), FIXTURE_BACKLOG);
  assert.strictEqual(r.class, 'PARKED');
});

test('classifyPR: open PR whose BACKLOG row is BLOCKED → "BLOCKED"', () => {
  const r = classifyPR(pr({ number: 3, title: '902: fixture', head: { ref: 'claude/loop-902' } }), FIXTURE_BACKLOG);
  assert.strictEqual(r.class, 'BLOCKED');
});

test('classifyPR: open PR whose BACKLOG row is CULLED → "human-gated" (anomalous-but-open, surfaced rather than silently ORPHANed)', () => {
  const r = classifyPR(pr({ number: 4, title: '903: fixture', head: { ref: 'claude/loop-903' } }), FIXTURE_BACKLOG);
  assert.strictEqual(r.class, 'human-gated');
});

test('classifyPR: open PR with no legend marker but "human" in the body → "human-gated" via the fallback heuristic', () => {
  const r = classifyPR(pr({ number: 5, title: '904: fixture', body: 'NEEDS YOUR MERGE — this is a human decision.', head: { ref: 'claude/loop-904' } }), FIXTURE_BACKLOG);
  assert.strictEqual(r.class, 'human-gated');
});

test('classifyPR: the #399 shape — open, loop-authored, BACKLOG row is IN_REVIEW only, no "human" text, no verdict → "ORPHAN"', () => {
  const r = classifyPR(pr({ number: 399, title: '904: fixture', body: 'Complete, self-tested build. No verifier verdict yet.', head: { ref: 'claude/loop-904' } }), FIXTURE_BACKLOG);
  assert.strictEqual(r.class, 'ORPHAN');
});

test('classifyPR: returns exactly one class per PR across a fixture set covering all 5 classes', () => {
  const prs = [
    pr({ number: 1, title: '900: fixture', merged: true, state: 'closed', head: { ref: 'claude/loop-900' } }),
    pr({ number: 2, title: '901: fixture', head: { ref: 'claude/loop-901' } }),
    pr({ number: 3, title: '902: fixture', head: { ref: 'claude/loop-902' } }),
    pr({ number: 4, title: '903: fixture', head: { ref: 'claude/loop-903' } }),
    pr({ number: 399, title: '904: fixture', body: 'no verdict yet', head: { ref: 'claude/loop-904' } }),
  ];
  const { results } = classifyAll(prs, FIXTURE_BACKLOG);
  assert.strictEqual(results.length, 5);
  for (const r of results) assert.ok(typeof r.class === 'string' && r.class.length > 0, `PR #${r.pr.number} got no class`);
  assert.deepStrictEqual(results.map((r) => r.class), ['merged', 'PARKED', 'BLOCKED', 'human-gated', 'ORPHAN']);
});

// ---------------------------------------------------------------------------
// Non-vacuity (LEARNINGS 2026-07-27: a gate nobody has seen fail is not
// evidence). Two fixtures: all-terminal → 0 orphans; the #399 shape alone
// → 1 orphan. Both asserted in the same test so neither can silently drift.
// ---------------------------------------------------------------------------

test('non-vacuity: an all-terminal PR set returns 0 orphans, AND the #399-shape fixture returns exactly 1', () => {
  const allTerminal = [
    pr({ number: 1, title: '900: fixture', merged: true, state: 'closed', head: { ref: 'claude/loop-900' } }),
    pr({ number: 2, title: '901: fixture', head: { ref: 'claude/loop-901' } }),
    pr({ number: 3, title: '902: fixture', head: { ref: 'claude/loop-902' } }),
    pr({ number: 4, title: '903: fixture', head: { ref: 'claude/loop-903' } }),
  ];
  const cleanRun = classifyAll(allTerminal, FIXTURE_BACKLOG);
  assert.strictEqual(cleanRun.orphanCount, 0, 'a properly-terminal PR set must classify to 0 orphans');

  const withOrphan = classifyAll([
    ...allTerminal,
    pr({ number: 399, title: '904: fixture', body: 'no verdict yet', head: { ref: 'claude/loop-904' } }),
  ], FIXTURE_BACKLOG);
  assert.strictEqual(withOrphan.orphanCount, 1, 'adding the #399 shape must flip the count to exactly 1 orphan');
  assert.strictEqual(withOrphan.orphans[0].pr.number, 399);
});

test('classifyPR: a PR whose id no longer resolves in BACKLOG.md (renumbered away) and has no "human" text → "ORPHAN", reason names the missing row', () => {
  const r = classifyPR(pr({ number: 309, title: '161: stale id, row long gone', head: { ref: 'claude/loop-161' } }), FIXTURE_BACKLOG);
  assert.strictEqual(r.class, 'ORPHAN');
  assert.ok(/no row for id 161/.test(r.reason), `reason should name the missing row; got: ${r.reason}`);
});

// ---------------------------------------------------------------------------
// Leg B — the ID-collision guard.
// ---------------------------------------------------------------------------

test('computeNextId: accounts for BOTH main’s max id and ids claimed by open PR branches', () => {
  assert.strictEqual(computeNextId(245, []), 246);
  assert.strictEqual(computeNextId(245, [242]), 246); // open PR claims a LOWER id than main's max — main wins.
  assert.strictEqual(computeNextId(245, [246, 250]), 251); // open PR claims a HIGHER id than main's max — PR wins.
});

test('detectIdCollisions: main max id = N, an open PR branch’s diff adds a row with id ≤ N → reports the collision, naming both items', () => {
  const mainStatusById = parseBacklogStatusById(FIXTURE_BACKLOG); // main's max fixture id is 904
  const collisions = detectIdCollisions(mainStatusById, [
    { pr: { number: 399, title: '904: fixture' }, addedIds: [903] }, // #399's diff (re)claims id 903, which main already shipped
  ]);
  assert.strictEqual(collisions.length, 1);
  assert.strictEqual(collisions[0].id, '903');
  assert.strictEqual(collisions[0].pr.number, 399);
  assert.ok(collisions[0].mainStatus.startsWith('CULLED'), 'collision must name what main already has at that id');
});

test('detectIdCollisions: an open PR branch adding a genuinely NEW id (above main’s max) is NOT a collision', () => {
  const mainStatusById = parseBacklogStatusById(FIXTURE_BACKLOG);
  const collisions = detectIdCollisions(mainStatusById, [
    { pr: { number: 400, title: '905: fixture' }, addedIds: [905] },
  ]);
  assert.deepStrictEqual(collisions, []);
});

// Self-defeat / red-then-green proof for Leg B, same shape as
// test_test_registry.js's (e): prove the collision check CAN go red before
// trusting that it reports 0 on the clean case.
test('non-vacuity (Leg B): the collision check goes RED when a claimed id truly collides, and is clean (green) otherwise — same input set, only the claimed id differs', () => {
  const mainStatusById = parseBacklogStatusById(FIXTURE_BACKLOG);
  const claimColliding = [{ pr: { number: 1, title: 'x' }, addedIds: [901] }]; // 901 exists in FIXTURE_BACKLOG
  const claimClean = [{ pr: { number: 1, title: 'x' }, addedIds: [999] }]; // 999 does not exist in FIXTURE_BACKLOG

  const red = detectIdCollisions(mainStatusById, claimColliding);
  assert.strictEqual(red.length, 1, 'expected the collision check to go red on a genuinely colliding id');

  const green = detectIdCollisions(mainStatusById, claimClean);
  assert.deepStrictEqual(green, [], 'expected the collision check to report clean on a genuinely non-colliding id');
});

// ---------------------------------------------------------------------------
// Offline guarantee — no network access anywhere in this module.
// ---------------------------------------------------------------------------

test('pr-orphan-detector.js source contains no fetch/http/https require — the live-GitHub path is injected by the caller, never called from here', () => {
  const src = fs.readFileSync(DETECTOR_PATH, 'utf8');
  assert.ok(!/require\(\s*['"]https?['"]\s*\)/.test(src), 'detector must not require the http/https modules');
  assert.ok(!/\bfetch\(/.test(src), 'detector must not call fetch()');
});

console.log(`\n${passed} assertion group(s) passed` + (process.exitCode ? ' (FAILURES above)' : ''));
