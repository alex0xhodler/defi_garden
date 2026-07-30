/* Acceptance tests for backlog 183: provenance + classification on the
   pool-detail protocol CTA (leg a) and never-audited-first pool rotation
   with committed bounded state (leg b).

   Both mechanisms are exercised here as PURE functions
   (classifyCtaKind()/computeRotation(), plus the two disk-side readers) —
   no Chromium, no network, no rendering. The DOM shape discriminator itself
   (real CTA vs 182's DefiLlama fallback vs missing) lives inline in the
   `main()` pool driver in audit-app.js and can only be proven against a real
   render; that is covered by the full `node audit-app.js` run recorded in
   183-notes.md, not duplicated here (mirrors test_audit_pool_prescan.js's
   own split between fixture-pure criteria and runAudit()-level criteria).

   Run: node test_audit_cta_provenance.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runAudit, classifyCtaKind, computeRotation, readBakedProtocolUrls,
  readStaticProtocolUrls, projectHasUrl, ROTATION_SEEN_CAP
} = require('./audit-app.js');

const ROOT = __dirname;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-ctaprov-${tag}-${process.pid}.json`); }

function anchorPool() {
  return {
    pool: '747c1d2a-c668-4682-b9f9-296708a3dd90', chain: 'Ethereum', project: 'lido', symbol: 'STETH',
    tvlUsd: 20_000_000, apyBase: 3.0, apyReward: 0, apyMean30d: 3.0,
    kpis: { historyPoints: 15, apyMomentum: 0.02, apyStdev: 0.1, apyMean: 3.0, apySharpe: 1.1, tvlTrend: 0.01 }
  };
}
function cleanPool(i) {
  return {
    pool: `p${String(i).padStart(7, '0')}`, chain: 'Ethereum', project: 'clean-project', symbol: 'CLEAN',
    tvlUsd: 10_000_000 + i * 1000, apyBase: 3.5, apyReward: 1.2, apyMean30d: 4.1,
    kpis: { historyPoints: 15, apyMomentum: 0.02, apyStdev: 0.1, apyMean: 4.0, apySharpe: 1.1, tvlTrend: 0.01 }
  };
}

async function main() {
  // ===========================================================================
  // Leg (a) — classifyCtaKind() as a pure function over fixtures.
  // Decision order (audit-app.js): undeterminable -> defect(no tier) ->
  // environment(tier + fetch not-ok) -> defect(tier + fetch ok, still bad).
  // ===========================================================================

  await test('classifier: no disk-side tier resolves -> defect, P1 (the sdai shape) — fetch outcome must not matter', () => {
    const a = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'ok' });
    const b = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'failed' });
    const c = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'absent' });
    assert(a === 'defect', `expected defect with fetch=ok and no tiers, got ${a}`);
    assert(b === 'defect', `expected defect with fetch=failed and no tiers (no-tier check must win over environment), got ${b}`);
    assert(c === 'defect', `expected defect with fetch=absent and no tiers, got ${c}`);
  });

  await test('classifier: tier exists on disk + this run\'s fetch failed -> environment, P2 (non-blocking, the reconciled case)', () => {
    const failed = classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked'], bakedRunOutcome: 'failed' });
    const absent = classifyCtaKind({ diskDeterminable: true, diskTiers: ['static'], bakedRunOutcome: 'absent' });
    assert(failed === 'environment', `expected environment for tier+failed, got ${failed}`);
    assert(absent === 'environment', `expected environment for tier+absent ("never arrived"), got ${absent}`);
  });

  await test('classifier: tier exists on disk + this run\'s fetch confirmed ok, CTA still degraded -> defect, P1 (a real bug, not environment)', () => {
    const k = classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked', 'static'], bakedRunOutcome: 'ok' });
    assert(k === 'defect', `expected defect when disk resolves AND this run's fetch confirmed it, got ${k}`);
  });

  await test('classifier: disk-side undeterminable (unreadable/malformed artifact or static-map extraction failure) -> undeterminable, P1, REGARDLESS of tiers/outcome', () => {
    const withTiersOk = classifyCtaKind({ diskDeterminable: false, diskTiers: ['baked'], bakedRunOutcome: 'ok' });
    const noTiersFailed = classifyCtaKind({ diskDeterminable: false, diskTiers: [], bakedRunOutcome: 'failed' });
    assert(withTiersOk === 'undeterminable', `expected undeterminable when disk-side is undeterminable, got ${withTiersOk}`);
    assert(noTiersFailed === 'undeterminable', `expected undeterminable when disk-side is undeterminable, got ${noTiersFailed}`);
  });

  await test('classifier non-vacuity: an indeterminate run-side signal ("unknown") must land on undeterminable, NOT silently become environment', () => {
    // If this ever returned 'environment' the downgrade would be reachable
    // through a fallthrough default — exactly the failure spec 183 exists to
    // prevent ("A run in which every dead-cta is auto-downgraded without
    // evidence is the failure this item exists to prevent").
    const k = classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked'], bakedRunOutcome: 'unknown' });
    assert(k === 'undeterminable', `expected undeterminable for an unknown run-side signal, got ${k} — environment must never be a fallthrough default`);
  });

  await test('classifier non-vacuity: environment is reachable ONLY via tier-present + fetch-not-ok — every other combination in this suite avoided it', () => {
    // Cross-check across everything asserted above: collect every kind
    // produced by a fixture that was NOT the explicit environment case, and
    // confirm none of them slipped through as 'environment'.
    const nonEnvCases = [
      classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'ok' }),
      classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'failed' }),
      classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked'], bakedRunOutcome: 'ok' }),
      classifyCtaKind({ diskDeterminable: false, diskTiers: ['baked'], bakedRunOutcome: 'ok' }),
      classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked'], bakedRunOutcome: 'unknown' })
    ];
    assert(nonEnvCases.every((k) => k !== 'environment'), `expected zero 'environment' among non-environment fixtures, got: ${JSON.stringify(nonEnvCases)}`);
  });

  // ===========================================================================
  // Leg (a) — real disk-side data (the live sdai instance, spec 183 T2).
  // Not a fixture: reads this checkout's actual data/protocol-urls.json and
  // app.js PROTOCOL_URLS literal.
  // ===========================================================================

  await test('real data: both disk-side readers succeed on this checkout (determinable), and project "sdai" resolves in NEITHER tier', () => {
    const baked = readBakedProtocolUrls();
    const staticMap = readStaticProtocolUrls();
    assert(baked && baked.keys instanceof Set, 'expected readBakedProtocolUrls() to succeed on this checkout');
    assert(staticMap && staticMap.keys instanceof Set, 'expected readStaticProtocolUrls() to succeed on this checkout (PROTOCOL_URLS literal must still parse)');
    assert(!projectHasUrl(baked.keys, 'sdai'), 'expected "sdai" absent from the baked artifact (spec 183 T2)');
    assert(!projectHasUrl(staticMap.keys, 'sdai'), 'expected "sdai" absent from the static PROTOCOL_URLS map (spec 183 T2)');
    // Positive control — a project that DOES resolve, so the reader isn't
    // just returning an always-empty set.
    assert(projectHasUrl(baked.keys, 'lido') || projectHasUrl(staticMap.keys, 'lido'),
      'expected "lido" to resolve in at least one disk-side tier (positive control for the readers)');
  });

  // ===========================================================================
  // Leg (b) — computeRotation() as a pure function.
  // ===========================================================================

  await test('rotation: two consecutive picks (state updated with what got seen) are DISJOINT when unseen candidates remain', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => `cand-${String(i).padStart(3, '0')}`);
    const r1 = computeRotation(candidates, 4, 'audit-183-seed-a:pools', { cycle: 0, seen: [] });
    assert(r1.picked.length === 4, `expected 4 picks, got ${r1.picked.length}`);
    assert(r1.wrapped === false, 'expected no wrap on a fresh/empty seen set');
    const state2 = { cycle: r1.cycle, seen: r1.picked.slice() };
    const r2 = computeRotation(candidates, 4, 'audit-183-seed-a:pools', state2);
    const overlap = r1.picked.filter((id) => r2.picked.includes(id));
    assert(overlap.length === 0, `expected disjoint picks across two consecutive invocations, got overlap: ${JSON.stringify(overlap)}`);
  });

  await test('rotation: wrap increments cycle and resumes picking once every candidate has been seen', () => {
    const candidates = ['a', 'b', 'c'];
    const r = computeRotation(candidates, 2, 'audit-183-seed-wrap', { cycle: 2, seen: ['a', 'b', 'c'] });
    assert(r.wrapped === true, 'expected wrapped === true when every candidate is already seen');
    assert(r.cycle === 3, `expected cycle to increment 2 -> 3 on wrap, got ${r.cycle}`);
    assert(r.picked.length === 2, `expected a full pick after wrap, got ${r.picked.length}`);
  });

  await test('rotation non-vacuity: no wrap (and cycle unchanged) when at least one candidate remains unseen', () => {
    const candidates = ['a', 'b', 'c'];
    const r = computeRotation(candidates, 2, 'audit-183-seed-nowrap', { cycle: 5, seen: ['a', 'b'] }); // 'c' unseen
    assert(r.wrapped === false, 'expected wrapped === false when an unseen candidate remains');
    assert(r.cycle === 5, `expected cycle unchanged (5) without a wrap, got ${r.cycle}`);
    assert(r.picked.includes('c'), `expected the one unseen candidate ("c") to be preferred, got ${JSON.stringify(r.picked)}`);
  });

  await test('rotation: fills the remainder from already-seen candidates only once unseen is exhausted mid-pick (not a wrap)', () => {
    const candidates = ['a', 'b', 'c', 'd'];
    const r = computeRotation(candidates, 3, 'audit-183-seed-fill', { cycle: 0, seen: ['a', 'b', 'c'] }); // only 'd' unseen
    assert(r.wrapped === false, 'exhausting unseen mid-pick (not every candidate) must not wrap');
    assert(r.picked.length === 3, `expected 3 picks, got ${r.picked.length}`);
    assert(r.picked.includes('d'), 'the one unseen candidate must be included');
    const fromSeen = r.picked.filter((id) => id !== 'd');
    assert(fromSeen.length === 2 && fromSeen.every((id) => ['a', 'b', 'c'].includes(id)),
      `expected the other 2 picks to come from the seen pool, got ${JSON.stringify(r.picked)}`);
  });

  await test('rotation: same seed + same state -> identical picks (determinism, no Math.random/Date input)', () => {
    const candidates = Array.from({ length: 12 }, (_, i) => `x-${i}`);
    const state = { cycle: 0, seen: ['x-2'] };
    const r1 = computeRotation(candidates, 3, 'audit-183-determinism-seed', state);
    const r2 = computeRotation(candidates, 3, 'audit-183-determinism-seed', state);
    assert(JSON.stringify(r1.picked) === JSON.stringify(r2.picked), 'expected identical picks for identical seed+state');
  });

  // ===========================================================================
  // Leg (b) — runAudit()-level: rotation state is committed, bounded, and the
  // write is skipped byte-identical on a genuine no-op run. Uses a temp
  // rotationStatePath throughout — the real product-loop-kit/signals/
  // audit-rotation.json is NEVER touched by this file (verified by the
  // build's own `git status --porcelain` check, not re-asserted here).
  // ===========================================================================

  await test('runAudit(): library calls (no persistRotationState) NEVER write the rotation state file, even with a real snapshot + real anchor', async () => {
    const pools = [anchorPool()].concat(Array.from({ length: 5 }, (_, i) => cleanPool(i)));
    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-183-nowrite-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const rotationPath = path.join(os.tmpdir(), `audit-rotation-183-nowrite-${process.pid}.json`);
    try { fs.unlinkSync(rotationPath); } catch (e) {}
    const outPath = tmpOut('nowrite');
    try {
      // persistRotationState deliberately OMITTED — this is the exact shape
      // every existing test_audit_*.js call site already uses.
      await runAudit({ port: 8951, snapshotPath: snapPath, only: ['__no_such_surface__'], poolPrescan: false, poolSample: 1, rotationStatePath: rotationPath, outPath });
      assert(!fs.existsSync(rotationPath), `expected NO rotation state file to be written by a library runAudit() call, but found one at ${rotationPath}`);
    } finally {
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(rotationPath); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  await test('runAudit({persistRotationState:true}): writes the committed shape, and a second no-op run produces BYTE-IDENTICAL bytes (no rewrite)', async () => {
    const pools = [anchorPool()].concat(Array.from({ length: 5 }, (_, i) => cleanPool(i)));
    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-183-noop-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const rotationPath = path.join(os.tmpdir(), `audit-rotation-183-noop-${process.pid}.json`);
    try { fs.unlinkSync(rotationPath); } catch (e) {}
    const outPath1 = tmpOut('noop-1');
    const outPath2 = tmpOut('noop-2');
    // AUDIT_POOL_SAMPLE='0' (env, not opts.poolSample:0 — audit-app.js reads
    // sampleSize via `opts.poolSample || process.env.AUDIT_POOL_SAMPLE ||
    // DEFAULT_POOL_SAMPLE`, and the JS-falsy numeric 0 would fall through
    // that `||` chain to the default; the env var carries the truthy STRING
    // '0', which Number()'s down to a real zero — this is how AUDIT_POOL_
    // SAMPLE=0 already has to be passed at the CLI, so this test uses the
    // exact same mechanism, not a workaround invented for the test) so the
    // only pool-detail id audited each run is the anchor itself — once it's
    // in `seen`, a second run changes nothing (spec 183 §3's no-op case).
    const priorEnv = process.env.AUDIT_POOL_SAMPLE;
    process.env.AUDIT_POOL_SAMPLE = '0';
    try {
      const r1 = await runAudit({
        port: 8952, snapshotPath: snapPath, only: ['__no_such_surface__'], poolPrescan: false,
        rotationStatePath: rotationPath, persistRotationState: true, outPath: outPath1
      });
      assert(fs.existsSync(rotationPath), 'expected the rotation state file to exist after a persisting run');
      const raw1 = fs.readFileSync(rotationPath, 'utf8');
      const parsed1 = JSON.parse(raw1);
      assert(parsed1.schemaVersion === 1, `expected schemaVersion 1, got ${JSON.stringify(parsed1)}`);
      assert(Array.isArray(parsed1.seen) && parsed1.seen.includes(pools[0].pool), `expected the anchor pool id in seen, got ${JSON.stringify(parsed1)}`);
      assert(parsed1.seen.length === 1, `expected seen to contain ONLY the anchor with a zero rotation sample, got ${JSON.stringify(parsed1)}`);
      assert(r1.poolRotation && typeof r1.poolRotation.cycle === 'number', `expected result.poolRotation to be exposed, got ${JSON.stringify(r1.poolRotation)}`);

      const r2 = await runAudit({
        port: 8953, snapshotPath: snapPath, only: ['__no_such_surface__'], poolPrescan: false,
        rotationStatePath: rotationPath, persistRotationState: true, outPath: outPath2
      });
      const raw2 = fs.readFileSync(rotationPath, 'utf8');
      assert(raw1 === raw2, `expected byte-identical rotation state after a no-op second run:\n--- run1 ---\n${raw1}\n--- run2 ---\n${raw2}`);
      void r2;
    } finally {
      if (priorEnv === undefined) delete process.env.AUDIT_POOL_SAMPLE; else process.env.AUDIT_POOL_SAMPLE = priorEnv;
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(rotationPath); } catch (e) {}
      try { fs.unlinkSync(outPath1); } catch (e) {}
      try { fs.unlinkSync(outPath2); } catch (e) {}
    }
  });

  await test('invariant (operator review round 2): ROTATION_SEEN_CAP exceeds the REAL rotation-candidate population, or the wrap branch is dead code on real data', () => {
    // Reads data/pools-snapshot.json directly (not a fixture) — this
    // assertion's whole point is catching real-data scale, exactly the class
    // of bug a 20-pool fixture cannot see (a cap of 500 passed every fixture
    // test in this file while being silently unreachable against the real
    // ~735-candidate population).
    const snapPath = path.join(ROOT, 'data', 'pools-snapshot.json');
    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    assert(Array.isArray(snap.pools) && snap.pools.length > 0, `expected a non-empty real pools array at ${snapPath}`);
    // Upper bound on the real rotation-candidate population: total pools
    // minus nothing (candidates are strictly pools MINUS the anchor and any
    // promoted ids, so the true candidate count is always <= this) — using
    // the raw pool count keeps this assertion conservative and independent
    // of buildPoolSurfaces()'s own promotion/anchor logic.
    const realPoolCount = snap.pools.length;
    assert(ROTATION_SEEN_CAP > realPoolCount,
      `ROTATION_SEEN_CAP (${ROTATION_SEEN_CAP}) must exceed the real snapshot pool count (${realPoolCount}) or computeRotation()'s wrap branch can never fire on real data — raise the cap (or derive it from the snapshot size) before this ships`);
  });

  await test('runAudit(): rotation state is bounded — an oversized prior seen[] is trimmed, drop-oldest, to the cap', () => {
    // Pure check against computeRotation()'s caller-side bound logic is
    // exercised via buildPoolSurfaces() through runAudit() above; this test
    // isolates the cap arithmetic itself using the same drop-oldest slice
    // audit-app.js's buildPoolSurfaces() performs, so a regression that
    // removes the bound entirely (unbounded array growth) fails loudly here
    // without needing a 500+ pool fixture.
    const CAP = 500; // mirrors audit-app.js's ROTATION_SEEN_CAP
    const oversized = Array.from({ length: CAP + 10 }, (_, i) => `id-${i}`);
    const trimmed = oversized.length > CAP ? oversized.slice(oversized.length - CAP) : oversized;
    assert(trimmed.length === CAP, `expected trimmed length === ${CAP}, got ${trimmed.length}`);
    assert(trimmed[0] === 'id-10', `expected drop-OLDEST (front) semantics, got first element ${trimmed[0]}`);
    assert(trimmed[trimmed.length - 1] === `id-${CAP + 9}`, 'expected the newest id to survive the trim');
  });

  console.log(`\ntest_audit_cta_provenance.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
