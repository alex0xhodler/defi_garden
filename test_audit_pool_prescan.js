/* Acceptance tests for the pool-snapshot prescan + promotion mechanism
   (backlog 167). `prescanPools()` (audit-app.js) is a pure fs-free scan over
   an in-memory `pools` array (already parsed by runAudit() from the
   snapshot); `buildPoolSurfaces()` promotes up to `poolPrescanMax` of its
   suspects into `pool-detail:<id-prefix>` surfaces, additive to a seeded
   `poolSample` rotation, both excluding the fixed 4-surface anchor
   (pool-detail/-360/-dark/-ko, unchanged — see test_audit_app.js).

   This file covers spec 167's acceptance criteria A3/A5/A6 on FIXTURES (its
   own scope, per the build instructions — A1/A2/A4/A7/A8/A9 are evidenced
   directly against the real snapshot/full suite and recorded in
   product-loop-kit/specs/167-notes.md, not duplicated here).

   Fixtures are plain JS objects, not files on disk — prescanPools()/
   buildPoolSurfaces() take an already-parsed `pools` array, exactly the
   shape runAudit() hands them after JSON.parse(fs.readFileSync(snapshot)).
   A3's runAudit()-level case additionally writes a temp snapshot FILE so the
   full `runAudit({ only: ['pool-prescan'] })` path (fast — matches no real
   surface name, so nothing renders) is exercised too, not just the pure
   function.

   Run: node test_audit_pool_prescan.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAudit, prescanPools, buildPoolSurfaces, reconcilePrescanFindings, DEFAULT_POOL_SAMPLE } = require('./audit-app.js');
// backlog 215 — the same rail the prescan predicates check against
// (audit-app.js requires it verbatim from here too), reused by value/import
// rather than a re-typed literal, so the positive control below is provably
// "> the real rail", not just "> some big number".
const { APY_SANITY_LIMIT } = require('./src/poller-core.js');

const ROOT = __dirname;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-poolprescan-${tag}-${process.pid}.json`); }

// ---------------------------------------------------------------------------
// Fixture builder — plain pool objects in the exact shape
// data/pools-snapshot.json's `pools[]` entries carry (verified against a real
// entry, 2026-07-28: pool/chain/project/symbol/tvlUsd/apyBase/apyReward/
// apyMean30d/kpis). `cleanPool(i)` never trips any POOL_PRESCAN_SIGNALS
// predicate by construction — every field is inside the trust rail.
// ---------------------------------------------------------------------------
function cleanPool(i) {
  // Id shape deliberately varies WITHIN the first 8 characters ('p0000007',
  // not 'clean-pool-007') — audit-app.js's `pool-detail:<prefix>` naming
  // truncates to POOL_ID_PREFIX_LEN(8), and real snapshot pool ids are UUIDs
  // (effectively random in their first 8 hex chars, so a same-run collision
  // is astronomically unlikely); a fixture using a shared long common prefix
  // would make every promoted/rotated entry render the SAME surface name
  // regardless of which distinct pool was actually picked — a fixture
  // artifact, not something this test should be measuring.
  return {
    pool: `p${String(i).padStart(7, '0')}`,
    chain: 'Ethereum', project: 'clean-project', symbol: 'CLEAN',
    tvlUsd: 10_000_000 + i * 1000, apyBase: 3.5, apyReward: 1.2, apyMean30d: 4.1,
    kpis: { historyPoints: 15, apyMomentum: 0.02, apyStdev: 0.1, apyMean: 4.0, apySharpe: 1.1, tvlTrend: 0.01 }
  };
}
function railBreachPool(id) {
  // apyBase+apyReward = 50,000% — well over the 1000% rail (apy-rail-breach).
  return Object.assign(cleanPool(0), { pool: id, apyBase: 49000, apyReward: 1000, apyMean30d: 4.1 });
}
// The real PREFERRED_POOL_ID (audit-app.js — Lido stETH), not exported.
// Every fixture below includes a clean pool AT this id so anchor resolution
// succeeds normally instead of falling back to pools[0] — if a fixture's
// suspect/rotation-candidate pool happened to sit at index 0, an absent
// anchor would silently make THAT pool the anchor and exclude it from
// promotion/rotation, which is a fixture bug, not a production one (mirrors
// buildPoolSurfaces's real fallback, which only ever fires when the true
// Lido id is genuinely missing from the live snapshot).
const REAL_ANCHOR_ID = '747c1d2a-c668-4682-b9f9-296708a3dd90';
function anchorPool() {
  return Object.assign(cleanPool(999), { pool: REAL_ANCHOR_ID });
}

async function main() {
  // ---- Criterion A3 (fixture, non-vacuity target) --------------------------
  await test('A3a: prescanPools() on a fixture with exactly one apy-rail-breach pool returns exactly that suspect', () => {
    const pools = [anchorPool(), railBreachPool('breach-pool-A'), cleanPool(1), cleanPool(2)];
    const result = prescanPools(pools);
    assert(result.scanned === 4, `expected scanned === 4, got ${result.scanned}`);
    const hits = result.suspects.filter((s) => s.signal === 'apy-rail-breach');
    assert(hits.length === 1, `expected exactly 1 apy-rail-breach suspect, got ${hits.length}: ${JSON.stringify(result.suspects)}`);
    assert(hits[0].poolId === 'breach-pool-A', `expected the breach pool to be flagged, got poolId ${hits[0].poolId}`);
    assert(hits[0].severity === 'P0', `apy-rail-breach must be P0, got ${hits[0].severity}`);
    assert(result.bySignal['apy-rail-breach'] === 1, `bySignal.apy-rail-breach should be 1, got ${result.bySignal['apy-rail-breach']}`);
    // Every OTHER signal must be zero on this fixture — a real non-vacuity
    // proof needs a predicate that fires on exactly the one pool it should,
    // not a permissive one that flags everything.
    for (const sig of Object.keys(result.bySignal)) {
      if (sig === 'apy-rail-breach') continue;
      assert(result.bySignal[sig] === 0, `expected zero ${sig} suspects on this clean-otherwise fixture, got ${result.bySignal[sig]}`);
    }
  });

  await test('A3b: runAudit({only:["pool-prescan"]}) against a fixture snapshot file emits the P0 pool-prescan:apy-rail-breach aggregate finding', async () => {
    const pools = [anchorPool(), railBreachPool('breach-pool-B'), cleanPool(1), cleanPool(2), cleanPool(3)];
    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-a3-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const outPath = tmpOut('a3b');
    try {
      // backlog 215: `poolLiveness: false` deliberately degrades the
      // deep-linked leg so this test stays scoped to exactly the 5-pool
      // fixture snapshot it wrote above — without it, runAudit() would do a
      // REAL live fetch + a real estate deep-link scan and widen the prescan
      // to the union of those (thousands of pools), which is what
      // test_audit_pool_prescan.js's own new "215 …" cases and
      // test_audit_pool_population.js already cover on purpose; this test's
      // job is only "does runAudit() wire poolPrescan through end to end",
      // which needs a deterministic, tiny population to assert against.
      const result = await runAudit({ port: 8940, snapshotPath: snapPath, only: ['pool-prescan'], outPath, poolLiveness: false });
      assert(result.surfacesCovered.length === 0, `only:['pool-prescan'] matches no real surface name — expected zero rendered surfaces, got ${JSON.stringify(result.surfacesCovered)}`);
      const hit = result.findings.find((f) => f.surface === 'pool-prescan' && f.check === 'pool-prescan:apy-rail-breach');
      assert(hit, `expected a pool-prescan:apy-rail-breach finding; got: ${JSON.stringify(result.findings)}`);
      assert(hit.severity === 'P0', `pool-prescan:apy-rail-breach must be P0, got ${hit.severity}`);
      assert(hit.detail.includes('breach-p'), `finding detail should reference the breaching pool id's 8-char prefix "breach-p": ${hit.detail}`);
      assert(result.poolPrescan.scanned === 5, `result.poolPrescan.scanned should be 5, got ${result.poolPrescan.scanned}`);
      assert(result.poolPrescan.bySignal['apy-rail-breach'] === 1, `result.poolPrescan.bySignal['apy-rail-breach'] should be 1, got ${JSON.stringify(result.poolPrescan.bySignal)}`);
      assert(result.poolPrescan.scannedByLeg.snapshot === 5 && result.poolPrescan.scannedByLeg.deepLinkedLive === 0,
        `expected scannedByLeg {snapshot:5, deepLinkedLive:0} with the deep-linked leg degraded; got ${JSON.stringify(result.poolPrescan.scannedByLeg)}`);
    } finally {
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  // ---- Criterion A5 (determinism, pure — no rendering needed) --------------
  await test('A5: same seed -> identical extraSurfaces + poolPrescan.promoted across two calls', () => {
    const pools = [anchorPool(), railBreachPool('breach-pool-C')].concat(Array.from({ length: 20 }, (_, i) => cleanPool(i)));
    const r1 = buildPoolSurfaces({ pools, poolSeed: 'audit-poolprescan-seed-A' });
    const r2 = buildPoolSurfaces({ pools, poolSeed: 'audit-poolprescan-seed-A' });
    assert(JSON.stringify(r1.poolPrescan.promoted) === JSON.stringify(r2.poolPrescan.promoted),
      `same seed must give identical promoted: ${JSON.stringify(r1.poolPrescan.promoted)} vs ${JSON.stringify(r2.poolPrescan.promoted)}`);
    assert(JSON.stringify(r1.extraSurfaces) === JSON.stringify(r2.extraSurfaces),
      `same seed must give identical extraSurfaces: ${JSON.stringify(r1.extraSurfaces)} vs ${JSON.stringify(r2.extraSurfaces)}`);
  });

  await test('A5: different seed, suspects <= cap -> promotion set unchanged (promotion is suspicion-driven, not seed-driven)', () => {
    // Exactly 1 suspect (breach-pool-D), well under DEFAULT_POOL_PRESCAN_MAX
    // (2) — promotion must be the SAME set regardless of seed.
    const pools = [anchorPool(), railBreachPool('breach-pool-D')].concat(Array.from({ length: 20 }, (_, i) => cleanPool(i)));
    const rA = buildPoolSurfaces({ pools, poolSeed: 'audit-poolprescan-seed-B1' });
    const rB = buildPoolSurfaces({ pools, poolSeed: 'audit-poolprescan-seed-B2' });
    assert(rA.poolPrescan.promoted.length === 1, `expected exactly 1 promoted suspect, got ${JSON.stringify(rA.poolPrescan.promoted)}`);
    assert(JSON.stringify(rA.poolPrescan.promoted) === JSON.stringify(rB.poolPrescan.promoted),
      `a different seed must still promote the same SET when suspects <= cap: ${JSON.stringify(rA.poolPrescan.promoted)} vs ${JSON.stringify(rB.poolPrescan.promoted)}`);
    // A1 (spec 167): poolPrescan.promoted holds the FULL pool id, not the
    // 8-char prefix `pool-detail:<…>` surface names truncate to — a real
    // production check would do `promoted.includes(fullId)`, so the fixture
    // assertion must use the same shape, not a prefix.
    assert(rA.poolPrescan.promoted[0] === 'breach-pool-D', `poolPrescan.promoted must contain the FULL pool id ("breach-pool-D"), not a truncated prefix; got ${JSON.stringify(rA.poolPrescan.promoted)}`);
  });

  await test('A5: different seed -> ROTATION may differ (coverage actually accumulates, not just promotion)', () => {
    // No suspects at all here (all-clean fixture) — every extraSurfaces entry
    // is a rotation pick, so this isolates rotation's own seed-sensitivity.
    // Candidate count MUST exceed DEFAULT_POOL_SAMPLE (interpolated, never a
    // re-typed literal — item-159 rule) or computeRotation() picks EVERY
    // candidate regardless of seed (Math.min(sampleSize, candidates.length)),
    // which would pass this assertion for the wrong reason — backlog 192
    // raised the default 6 -> 32, so the old fixed "30 pools" (comfortably
    // above 191's default of 6) silently stopped proving anything here.
    const nonAnchorCount = DEFAULT_POOL_SAMPLE + 20;
    const pools = [anchorPool()].concat(Array.from({ length: nonAnchorCount }, (_, i) => cleanPool(i)));
    const rA = buildPoolSurfaces({ pools, poolSeed: 'audit-poolprescan-rot-seed-1' });
    const rB = buildPoolSurfaces({ pools, poolSeed: 'audit-poolprescan-rot-seed-2' });
    assert(rA.poolPrescan.promoted.length === 0 && rB.poolPrescan.promoted.length === 0, 'fixture must be suspect-free for this case');
    const namesA = rA.extraSurfaces.map((s) => s.name).sort();
    const namesB = rB.extraSurfaces.map((s) => s.name).sort();
    assert(JSON.stringify(namesA) !== JSON.stringify(namesB),
      `expected rotation picks to differ across seeds on a ${nonAnchorCount}-pool candidate pool; got identical sets both times: ${JSON.stringify(namesA)}`);
  });

  // ---- Criterion A6 (kill switches) -----------------------------------------
  await test('A6: opts.poolPrescan === false -> no promotion, no pool-prescan findings, rotation still fills its own budget', () => {
    // Fixture size interpolates DEFAULT_POOL_SAMPLE (never a re-typed
    // literal, item-159 rule) plus margin — backlog 192 raised the default
    // 6 -> 32, and a fixture sized "comfortably above 6" (191's own margin)
    // silently under-tests this the moment the constant is raised again:
    // computeRotation() caps `picked.length`/`extraSurfaces.length` at the
    // candidate count when candidates < sampleSize, so a too-small fixture
    // makes this assertion pass for the wrong reason.
    const pools = [anchorPool(), railBreachPool('breach-pool-E')].concat(Array.from({ length: DEFAULT_POOL_SAMPLE + 10 }, (_, i) => cleanPool(i)));
    const r = buildPoolSurfaces({ pools, poolSeed: 'audit-poolprescan-kill-seed', poolPrescan: false });
    assert(r.poolPrescan.promoted.length === 0, `expected zero promoted with poolPrescan:false, got ${JSON.stringify(r.poolPrescan.promoted)}`);
    assert(r.poolPrescanFindings.length === 0, `expected zero pool-prescan findings with poolPrescan:false, got ${JSON.stringify(r.poolPrescanFindings)}`);
    // backlog 199: `extraSurfaces.length` alone stopped being a proxy for
    // "rotation filled its own budget" the moment lens surfaces (marked
    // `lensPick`, never `rotationPick`) started riding along in the same
    // array — filter to `rotationPick` surfaces so this keeps measuring the
    // guarantee it names, not an array length 199 legitimately grows.
    const rotationOnlySurfaces = r.extraSurfaces.filter((s) => s.rotationPick);
    assert(rotationOnlySurfaces.length === DEFAULT_POOL_SAMPLE, `rotation (DEFAULT_POOL_SAMPLE=${DEFAULT_POOL_SAMPLE}) must still fill its own budget when only promotion is killed; got ${rotationOnlySurfaces.length} rotationPick surfaces: ${JSON.stringify(rotationOnlySurfaces.map((s) => s.name))}`);
    // The breach pool must not sneak in via rotation either (it IS a real
    // suspect, prescan is just turned off — but sampleBySeed draws from ALL
    // non-anchor pools when prescan is off, so absence isn't guaranteed by
    // construction; assert the MECHANISM instead: zero pool-prescan:* findings).
  });

  await test('A6: AUDIT_POOL_PRESCAN=0 env var has the same effect as opts.poolPrescan:false', () => {
    const pools = [anchorPool(), railBreachPool('breach-pool-F')].concat(Array.from({ length: 20 }, (_, i) => cleanPool(i)));
    process.env.AUDIT_POOL_PRESCAN = '0';
    try {
      const r = buildPoolSurfaces({ pools, poolSeed: 'audit-poolprescan-envkill-seed' });
      assert(r.poolPrescan.promoted.length === 0, `expected zero promoted with AUDIT_POOL_PRESCAN=0, got ${JSON.stringify(r.poolPrescan.promoted)}`);
    } finally {
      delete process.env.AUDIT_POOL_PRESCAN;
    }
  });

  await test('A6: poolIds override -> exactly that pool as anchor, prescan off, no extraSurfaces from a single id', () => {
    const pools = [anchorPool(), railBreachPool('breach-pool-G')].concat(Array.from({ length: 20 }, (_, i) => cleanPool(i)));
    const r = buildPoolSurfaces({ pools, poolIds: 'clean-pool-005' });
    assert(r.anchorPoolId === 'clean-pool-005', `expected anchorPoolId === 'clean-pool-005', got ${r.anchorPoolId}`);
    assert(r.extraSurfaces.length === 0, `a single-id override should produce zero extraSurfaces (nothing beyond the anchor), got ${JSON.stringify(r.extraSurfaces)}`);
    assert(r.poolPrescan.scanned === 0 && r.poolPrescan.promoted.length === 0, `override mode must run with prescan OFF, got ${JSON.stringify(r.poolPrescan)}`);
    assert(r.poolPrescanFindings.length === 0, `override mode must emit zero pool-prescan findings, got ${JSON.stringify(r.poolPrescanFindings)}`);
  });

  await test('A6: poolIds override with multiple ids -> first is the anchor, the rest become pool-detail:<prefix> extraSurfaces verbatim', () => {
    // Distinct 8-char prefixes on purpose ("poolid-a"/"poolid-b") so the
    // assertion actually distinguishes the two entries.
    const r = buildPoolSurfaces({ pools: [], poolIds: 'anchor-id-XYZ,poolid-alpha-111,poolid-beta-222' });
    assert(r.anchorPoolId === 'anchor-id-XYZ', `expected anchor-id-XYZ as anchor, got ${r.anchorPoolId}`);
    const names = r.extraSurfaces.map((s) => s.name);
    assert(JSON.stringify(names) === JSON.stringify(['pool-detail:poolid-a', 'pool-detail:poolid-b']),
      `expected the two extra ids as pool-detail:<8-char-prefix> surfaces in order given; got ${JSON.stringify(names)}`);
    for (const s of r.extraSurfaces) assert(s.kind === 'pool' && s.width === 1280, `override extraSurfaces must use kind:'pool', width:1280 — got ${JSON.stringify(s)}`);
  });

  // ---------------------------------------------------------------------------
  // spec 171 — prescan/rendered reconciliation. `reconcilePrescanFindings()`
  // is a pure, exported helper (audit-app.js) — driven DIRECTLY here rather
  // than through a real Chromium render, per the build brief ("Export the
  // helper so tests can drive it directly"): these fixtures prove the exact
  // branch logic that a single live run (specs/171.md A1/A2, verified against
  // the real snapshot separately) cannot reach on demand. `poolId`/`rel` are
  // the real shape prescanPools()/prescanStaticPages() suspects carry
  // (`{poolId, signal}` for the pool leg); `agg()` below builds a
  // `<prefix>:<signal>` aggregate finding in the exact shape
  // buildPoolSurfaces()/buildStaticSurfaces() emit.
  // ---------------------------------------------------------------------------
  function agg(prefix, signal, severity, detail) {
    return { surface: prefix, viewport: 'n/a', check: `${prefix}:${signal}`, severity, detail };
  }
  const poolSurfaceOf = (id) => `pool-detail:${id.slice(0, 8)}`;

  await test('A3 (spec 171): every suspect for the signal promoted AND every promoted surface rendered zero findings -> aggregate downgraded to P2 with a reason naming the surface', () => {
    const f = agg('pool-prescan', 'mean30d-rail-breach', 'P0', '1 of 40 snapshot pools match mean30d-rail-breach — examples: meanA001');
    const suspects = [{ poolId: 'meanA001', signal: 'mean30d-rail-breach' }];
    reconcilePrescanFindings([f], {
      prefix: 'pool-prescan',
      suspects,
      suspectKey: (s) => s.poolId,
      promotedKeys: new Set(['meanA001']),
      keyToSurface: poolSurfaceOf,
      coveredSurfaces: new Set([poolSurfaceOf('meanA001')]),
      findingsBySurface: new Map() // no entries anywhere == zero rendered findings
    });
    assert(f.severity === 'P2', `expected downgrade to P2, got ${f.severity}`);
    assert(f.detail.includes('reconciled'), `detail must gain an explicit reconciliation reason: ${f.detail}`);
    assert(f.detail.includes(poolSurfaceOf('meanA001')), `detail must name the surface that cleared it: ${f.detail}`);
  });

  await test('A4 (spec 171, load-bearing): same as A3 but ONE suspect left unpromoted -> severity unchanged (unverified != clean)', () => {
    const f = agg('pool-prescan', 'mean30d-rail-breach', 'P0', '2 of 40 snapshot pools match mean30d-rail-breach — examples: meanA001, meanB002');
    const suspects = [{ poolId: 'meanA001', signal: 'mean30d-rail-breach' }, { poolId: 'meanB002', signal: 'mean30d-rail-breach' }];
    reconcilePrescanFindings([f], {
      prefix: 'pool-prescan',
      suspects,
      suspectKey: (s) => s.poolId,
      // meanB002 never made it into promotedKeys (promotion cap / disabled / whatever reason).
      promotedKeys: new Set(['meanA001']),
      keyToSurface: poolSurfaceOf,
      coveredSurfaces: new Set([poolSurfaceOf('meanA001'), poolSurfaceOf('meanB002')]),
      findingsBySurface: new Map() // both surfaces would be "clean" IF checked — must not matter
    });
    assert(f.severity === 'P0', `expected severity UNCHANGED (P0) when one suspect was never promoted, got ${f.severity}`);
    assert(!f.detail.includes('reconciled'), `detail must be untouched when not downgraded: ${f.detail}`);
  });

  await test('A4b (spec 171): a promoted suspect whose surface was never actually rendered in THIS run (opts.only scoped it away) counts as unverified, not clean', () => {
    const f = agg('pool-prescan', 'mean30d-rail-breach', 'P0', '1 of 40 snapshot pools match mean30d-rail-breach — examples: meanA001');
    const suspects = [{ poolId: 'meanA001', signal: 'mean30d-rail-breach' }];
    reconcilePrescanFindings([f], {
      prefix: 'pool-prescan',
      suspects,
      suspectKey: (s) => s.poolId,
      promotedKeys: new Set(['meanA001']), // promoted by the builder...
      keyToSurface: poolSurfaceOf,
      coveredSurfaces: new Set(), // ...but this run's opts.only never rendered it
      findingsBySurface: new Map()
    });
    assert(f.severity === 'P0', `a promoted-but-not-covered surface must not count as clean; expected P0, got ${f.severity}`);
    assert(!f.detail.includes('reconciled'), `detail must be untouched when not downgraded: ${f.detail}`);
  });

  await test('A5 (spec 171): all suspects promoted but ONE promoted surface produced >=1 rendered finding -> severity unchanged', () => {
    const f = agg('pool-prescan', 'mean30d-rail-breach', 'P0', '2 of 40 snapshot pools match mean30d-rail-breach — examples: meanA001, meanB002');
    const suspects = [{ poolId: 'meanA001', signal: 'mean30d-rail-breach' }, { poolId: 'meanB002', signal: 'mean30d-rail-breach' }];
    reconcilePrescanFindings([f], {
      prefix: 'pool-prescan',
      suspects,
      suspectKey: (s) => s.poolId,
      promotedKeys: new Set(['meanA001', 'meanB002']),
      keyToSurface: poolSurfaceOf,
      coveredSurfaces: new Set([poolSurfaceOf('meanA001'), poolSurfaceOf('meanB002')]),
      // meanA001 clean, meanB002 rendered a real (unrelated) finding of its own.
      findingsBySurface: new Map([[poolSurfaceOf('meanB002'), 1]])
    });
    assert(f.severity === 'P0', `expected severity UNCHANGED (P0) when a promoted surface has a rendered finding, got ${f.severity}`);
    assert(!f.detail.includes('reconciled'), `detail must be untouched when not downgraded: ${f.detail}`);
  });

  await test('A7 (spec 171): prescan disabled -> zero aggregate findings exist to reconcile in the first place; reconciling the empty set is a true no-op', () => {
    const pools = [anchorPool(), railBreachPool('meanZ099')].concat(Array.from({ length: 20 }, (_, i) => cleanPool(i)));
    const r = buildPoolSurfaces({ pools, poolSeed: 'audit-171-a7-seed', poolPrescan: false });
    assert(r.poolPrescan.promoted.length === 0, `expected zero promoted with poolPrescan:false, got ${JSON.stringify(r.poolPrescan.promoted)}`);
    assert(r.poolPrescanFindings.length === 0, `expected zero pool-prescan findings with poolPrescan:false, got ${JSON.stringify(r.poolPrescanFindings)}`);
    assert(r.poolPrescanSuspects.length === 0, `expected zero poolPrescanSuspects with poolPrescan:false (never scanned, not just never promoted), got ${JSON.stringify(r.poolPrescanSuspects)}`);
    // Reconciling an empty aggregate-findings array must not throw and must
    // leave it empty — nothing to downgrade because nothing was ever emitted.
    reconcilePrescanFindings(r.poolPrescanFindings, {
      prefix: 'pool-prescan', suspects: r.poolPrescanSuspects, suspectKey: (s) => s.poolId,
      promotedKeys: new Set(), keyToSurface: poolSurfaceOf, coveredSurfaces: new Set(), findingsBySurface: new Map()
    });
    assert(r.poolPrescanFindings.length === 0, 'reconciliation must not have added or mutated anything on an empty findings array');
  });

  // ---------------------------------------------------------------------------
  // backlog 215 — the prescan input widens from the snapshot alone to the
  // union the pool-detail rotation already draws from (snapshot ∪ live
  // records for deep-linked ids not in the snapshot). All fixtures below are
  // pure buildPoolSurfaces() calls (no rendering) — the union/promotion/
  // marking logic is fully exercised without Chromium.
  // ---------------------------------------------------------------------------

  // A live-shape record: NO `kpis` field (loadLivePoolIds()'s own note — live
  // records never carry kpis), otherwise the same fields prescanPools() reads.
  function liveSubRailPool(id, apyMean30d) {
    return {
      pool: id, chain: 'Ethereum', project: 'sub-rail-project', symbol: 'SUBRAIL',
      tvlUsd: 12_000_000, apyBase: 2.0, apyReward: 0.5, apyMean30d
    };
  }
  const SUB_RAIL_ID = 'subrail0-live-only-0000001'; // absent from every fixture `pools` array below

  await test('215 positive control: a sub-rail-only live record with apyMean30d > APY_SANITY_LIMIT is scanned, flagged, PROMOTED, and its surface carries subRail:true', () => {
    const pools = [anchorPool()].concat(Array.from({ length: 20 }, (_, i) => cleanPool(i)));
    const snapshotIdsSet = new Set(pools.map((p) => p.pool));
    assert(!snapshotIdsSet.has(SUB_RAIL_ID), 'sanity: SUB_RAIL_ID collided with a snapshot fixture id');

    const r = buildPoolSurfaces({
      pools, poolSeed: 'audit-215-positive-seed',
      deepLinkPoolIds: [SUB_RAIL_ID],
      livePoolIds: new Set([SUB_RAIL_ID]),
      livePoolRecords: [liveSubRailPool(SUB_RAIL_ID, APY_SANITY_LIMIT + 5000)]
    });

    // Appears as a suspect.
    const hit = r.poolPrescanSuspects.find((s) => s.poolId === SUB_RAIL_ID && s.signal === 'mean30d-rail-breach');
    assert(hit, `expected a mean30d-rail-breach suspect for ${SUB_RAIL_ID}; got poolPrescanSuspects: ${JSON.stringify(r.poolPrescanSuspects)}`);
    assert(hit.severity === 'P0', `mean30d-rail-breach must be P0, got ${hit.severity}`);

    // Promoted into the render sample.
    assert(r.poolPrescan.promoted.includes(SUB_RAIL_ID), `expected ${SUB_RAIL_ID} in poolPrescan.promoted; got ${JSON.stringify(r.poolPrescan.promoted)}`);

    // Its surface carries subRail:true (the correctness trap this item exists to close).
    const surface = r.extraSurfaces.find((s) => s.poolId === SUB_RAIL_ID);
    assert(surface, `expected an extraSurfaces entry for ${SUB_RAIL_ID}; got ${JSON.stringify(r.extraSurfaces)}`);
    assert(surface.subRail === true, `expected the promoted sub-rail surface to carry subRail:true; got ${JSON.stringify(surface)}`);

    // Scanned the union, not the snapshot alone — cross-checked against the
    // run's OWN reported figures (167/206/215's disk-derived-count rule),
    // never a hardcoded literal.
    assert(r.poolPrescan.scanned === pools.length + 1, `expected poolPrescan.scanned === snapshot(${pools.length}) + 1 sub-rail record, got ${r.poolPrescan.scanned}`);
    assert(r.poolPrescan.scanned === r.poolRotation.union, `expected poolPrescan.scanned (${r.poolPrescan.scanned}) === poolRotation.union (${r.poolRotation.union}) — same population, one scan`);
    assert(r.poolPrescan.scannedByLeg.snapshot === pools.length, `expected scannedByLeg.snapshot === ${pools.length}, got ${r.poolPrescan.scannedByLeg.snapshot}`);
    assert(r.poolPrescan.scannedByLeg.deepLinkedLive === 1, `expected scannedByLeg.deepLinkedLive === 1, got ${r.poolPrescan.scannedByLeg.deepLinkedLive}`);
  });

  await test('215 positive control, removed: same sub-rail id with a SANE apyMean30d -> clean (not a suspect, not promoted, not marked subRail)', () => {
    const pools = [anchorPool()].concat(Array.from({ length: 20 }, (_, i) => cleanPool(i)));
    const r = buildPoolSurfaces({
      pools, poolSeed: 'audit-215-negative-seed',
      deepLinkPoolIds: [SUB_RAIL_ID],
      livePoolIds: new Set([SUB_RAIL_ID]),
      livePoolRecords: [liveSubRailPool(SUB_RAIL_ID, 4.2)]
    });
    assert(r.poolPrescanSuspects.every((s) => s.poolId !== SUB_RAIL_ID), `expected zero suspects for ${SUB_RAIL_ID} on a sane record; got ${JSON.stringify(r.poolPrescanSuspects.filter((s) => s.poolId === SUB_RAIL_ID))}`);
    assert(!r.poolPrescan.promoted.includes(SUB_RAIL_ID), `expected ${SUB_RAIL_ID} NOT promoted on a sane record; got ${JSON.stringify(r.poolPrescan.promoted)}`);
    assert(r.poolPrescan.bySignal['mean30d-rail-breach'] === 0, `expected zero mean30d-rail-breach hits, got ${r.poolPrescan.bySignal['mean30d-rail-breach']}`);
    // Still scanned (the union widening itself is unconditional) — only the
    // SUSPICION is gone, not the coverage.
    assert(r.poolPrescan.scanned === pools.length + 1, `expected the sub-rail record to still be SCANNED (clean != unscanned); got scanned=${r.poolPrescan.scanned}`);
  });

  await test('215: kpi-nonfinite applicability is explicit — live sub-rail records (no kpis) are "not applicable", not "checked and clean"', () => {
    const pools = [anchorPool()].concat(Array.from({ length: 5 }, (_, i) => cleanPool(i)));
    const r = buildPoolSurfaces({
      pools, poolSeed: 'audit-215-kpi-seed',
      deepLinkPoolIds: [SUB_RAIL_ID],
      livePoolIds: new Set([SUB_RAIL_ID]),
      livePoolRecords: [liveSubRailPool(SUB_RAIL_ID, 4.2)] // sane, no kpis field
    });
    // Every snapshot pool (anchor + 5 clean) carries `kpis`; the sub-rail
    // live record does not — kpiApplicable must count only the former.
    assert(r.poolPrescan.kpiApplicable === pools.length, `expected kpiApplicable === ${pools.length} (snapshot records only, sub-rail live record excluded); got ${r.poolPrescan.kpiApplicable}`);
    assert(r.poolPrescan.scanned === pools.length + 1, `expected scanned === ${pools.length + 1} (kpiApplicable must stay a STRICT subset of scanned); got ${r.poolPrescan.scanned}`);
    assert(typeof r.poolPrescan.kpiApplicableNote === 'string' && r.poolPrescan.kpiApplicableNote.length > 0,
      `expected a non-empty kpiApplicableNote explaining the applicability split; got ${JSON.stringify(r.poolPrescan.kpiApplicableNote)}`);
    assert(/not applicable|no kpis|not checked-and-clean|skipped/i.test(r.poolPrescan.kpiApplicableNote),
      `expected kpiApplicableNote to explicitly distinguish "not applicable" from "checked, clean"; got: ${r.poolPrescan.kpiApplicableNote}`);
  });

  await test('215: degraded-live tick (no deep-linked ids supplied) -> prescan falls back to snapshot-only AND reports the degrade reason', () => {
    const pools = [anchorPool()].concat(Array.from({ length: 5 }, (_, i) => cleanPool(i)));
    const r = buildPoolSurfaces({ pools, poolSeed: 'audit-215-degrade-seed' }); // no deepLinkPoolIds/livePoolIds supplied
    assert(r.poolPrescan.scanned === pools.length, `expected a degraded tick to fall back to snapshot-only scanned (${pools.length}); got ${r.poolPrescan.scanned}`);
    assert(r.poolPrescan.scannedByLeg.deepLinkedLive === 0, `expected scannedByLeg.deepLinkedLive === 0 on a degraded tick, got ${r.poolPrescan.scannedByLeg.deepLinkedLive}`);
    assert(typeof r.poolPrescan.deepLinkSource === 'string' && r.poolPrescan.deepLinkSource.length > 0,
      `expected a non-empty poolPrescan.deepLinkSource degrade-reason string; got ${JSON.stringify(r.poolPrescan.deepLinkSource)}`);
    // Never silently narrower — the SAME reason poolRotation already reports (no second copy of the prose).
    assert(r.poolPrescan.deepLinkSource === r.poolRotation.deepLinkSource,
      `expected poolPrescan.deepLinkSource to be the SAME string as poolRotation.deepLinkSource (one degrade reason, not two); got poolPrescan="${r.poolPrescan.deepLinkSource}" vs poolRotation="${r.poolRotation.deepLinkSource}"`);
  });

  await test('215 (spec 171 applies identically to the new leg): a promoted SUB-RAIL suspect whose surface renders clean -> auto-downgrade; reconciliation keys off poolId/surface name, not snapshot membership', () => {
    const poolSurfaceOf = (id) => `pool-detail:${id.slice(0, 8)}`;
    const f = { surface: 'pool-prescan', viewport: 'n/a', check: 'pool-prescan:mean30d-rail-breach', severity: 'P0',
      detail: `1 of 26 union pools (25 snapshot + 1 deep-linked-live) match mean30d-rail-breach — examples: ${SUB_RAIL_ID.slice(0, 8)}` };
    const suspects = [{ poolId: SUB_RAIL_ID, signal: 'mean30d-rail-breach' }];
    reconcilePrescanFindings([f], {
      prefix: 'pool-prescan',
      suspects,
      suspectKey: (s) => s.poolId,
      promotedKeys: new Set([SUB_RAIL_ID]),
      keyToSurface: poolSurfaceOf,
      coveredSurfaces: new Set([poolSurfaceOf(SUB_RAIL_ID)]),
      findingsBySurface: new Map() // rendered zero findings
    });
    assert(f.severity === 'P2', `expected the sub-rail suspect to reconcile down to P2 exactly like a snapshot suspect would, got ${f.severity}`);
    assert(f.detail.includes('reconciled'), `detail must gain the reconciliation reason: ${f.detail}`);
  });

  console.log(`\ntest_audit_pool_prescan.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
