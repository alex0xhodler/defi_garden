/* Acceptance tests for the pool-detail rotation's LENS dimension (backlog 199).

   183/191/192/196 fixed WHICH pool-details get audited (never-audited-first
   rotation), HOW MANY (2 -> 6 -> 32, bounded by the clock), and gave the
   static estate the same memory. None of them touched WHICH LENS: the
   360px/dark/ko checks (checkResponsive() + the KO i18n check) only ever saw
   the single hardcoded PREFERRED_POOL_ID anchor, because the four named
   anchor surfaces (pool-detail-360/-dark/-ko) were the only place those
   flags were ever set. This item gives a bounded subset of the FIRST
   `lensSample` rotation picks (never promotedIds, never the anchor) one
   extra render each, one lens each — buildPoolSurfaces() emits them marked
   `lensPick: true`, deliberately NOT `rotationPick` (spec 199 §4: a lens
   surface is a SECOND render of an already-counted pool; carrying
   `rotationPick` would double-count it in renderedRotationCount / the
   throughput line 192 exists to keep honest).

   Every test below drives buildPoolSurfaces() directly as a PURE function
   (in-memory `pools` fixture + explicit `rotationState`, mirroring
   test_audit_pool_prescan.js/test_audit_static_rotation.js's own convention)
   — no fs read of, and no fs write to, the committed
   product-loop-kit/signals/audit-rotation.json, so this file can never touch
   it. The two runAudit() cases use `only: ['__no_such_surface_199__']`
   (test_audit_pool_prescan.js's A3b trick) so no surface — including the
   lens surfaces themselves — actually renders; that is deliberately what
   proves the "planned vs honestly-rendered" split (spec 199 §5) without
   paying for a real Chromium launch in this file. The full end-to-end
   `node audit-app.js` runs proving surfaces actually render at all three
   lenses (spec 199 acceptance criteria 1-4) are recorded in
   specs/199-notes.md, not duplicated here.

   Criteria (a)-(f) below map onto spec 199 acceptance criterion 5(a)-(f).

   Run: node test_audit_pool_lens.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runAudit, buildPoolSurfaces,
  LENSES, DEFAULT_POOL_LENS_SAMPLE, MAX_POOL_LENS_SAMPLE,
  DEFAULT_POOL_SAMPLE, MAX_POOL_SAMPLE
} = require('./audit-app.js');

const ROOT = __dirname;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-poollens-${tag}-${process.pid}.json`); }
function freshState() { return { cycle: 0, seen: [] }; }

// Same fixture shape as test_audit_pool_prescan.js's cleanPool(): varies
// WITHIN the first 8 characters (real snapshot pool ids are UUIDs — random
// in their first 8 hex chars) so distinct fixture pools never collide on the
// `pool-detail:<8-char-prefix>` surface name, and every field sits inside
// every trust rail by construction (never trips a POOL_PRESCAN_SIGNALS
// predicate, so poolPrescan:false isn't even load-bearing here — it's set
// anyway, for the same "prove the leg under test in isolation" reason every
// sibling audit test file sets it).
function cleanPool(i) {
  return {
    pool: `lens${String(i).padStart(4, '0')}xx`, // distinct 8-char prefix per i
    chain: 'Ethereum', project: 'clean-project', symbol: 'CLEAN',
    tvlUsd: 10_000_000 + i * 1000, apyBase: 3.5, apyReward: 1.2, apyMean30d: 4.1,
    kpis: { historyPoints: 15, apyMomentum: 0.02, apyStdev: 0.1, apyMean: 4.0, apySharpe: 1.1, tvlTrend: 0.01 }
  };
}
// The real PREFERRED_POOL_ID (audit-app.js — Lido stETH), not exported.
// Included so anchor resolution succeeds normally instead of falling back to
// pools[0] (mirrors test_audit_pool_prescan.js's anchorPool()).
const REAL_ANCHOR_ID = '747c1d2a-c668-4682-b9f9-296708a3dd90';
function anchorPool() { return Object.assign(cleanPool(9999), { pool: REAL_ANCHOR_ID }); }

async function main() {
  assert(LENSES.length === 3 && LENSES.join(',') === '360px,dark,ko',
    `expected the fixed lens order ['360px','dark','ko'], got ${JSON.stringify(LENSES)}`);

  // ---------------------------------------------------------------------------
  // (a)+(b) — lens surfaces exist with the three shapes, correct width/dark/
  // ko flags and the &lang=ko url, marked lensPick and NOT rotationPick.
  // Exactly LENSES.length (3) non-anchor candidates with poolSample:3 forces
  // rotationPicks.length === 3 === lensSampleSize (default 6, clamped down to
  // the candidate count), so ALL THREE lenses are guaranteed to appear —
  // not a seed-lucky subset.
  // ---------------------------------------------------------------------------
  await test('(a)+(b): three rotation picks each get one lens surface — correct width/dark/ko/url per lens, lensPick set, rotationPick NOT set', () => {
    const pools = [anchorPool()].concat(Array.from({ length: 3 }, (_, i) => cleanPool(i)));
    const r = buildPoolSurfaces({
      pools, poolPrescan: false, poolSample: 3, poolSeed: 'lens199-shape-seed',
      rotationState: freshState()
    });
    assert(r.poolRotation.picked.length === 3, `fixture wiring check: expected 3 rotation picks, got ${JSON.stringify(r.poolRotation.picked)}`);
    assert(r.poolRotation.lensSampleSize === 3, `expected lensSampleSize === 3 (clamped to rotationPicks.length), got ${r.poolRotation.lensSampleSize}`);

    const rotationSurfaces = r.extraSurfaces.filter((s) => s.rotationPick);
    const lensSurfaces = r.extraSurfaces.filter((s) => s.lensPick);
    assert(rotationSurfaces.length === 3, `expected 3 plain rotationPick surfaces, got ${rotationSurfaces.length}: ${JSON.stringify(r.extraSurfaces.map((s) => s.name))}`);
    assert(lensSurfaces.length === 3, `expected 3 lensPick surfaces, got ${lensSurfaces.length}: ${JSON.stringify(r.extraSurfaces.map((s) => s.name))}`);
    for (const s of rotationSurfaces) assert(!s.lensPick, `a rotationPick surface must NOT also carry lensPick: ${JSON.stringify(s)}`);
    for (const s of lensSurfaces) assert(!s.rotationPick, `a lensPick surface must NOT carry rotationPick (spec 199 §4 — would double-count it): ${JSON.stringify(s)}`);

    const seenLenses = new Set();
    for (const s of lensSurfaces) {
      assert(s.kind === 'pool', `lens surface kind must stay 'pool', got ${JSON.stringify(s)}`);
      assert(typeof s.poolId === 'string' && s.poolId.length > 0, `lens surface must carry the FULL poolId (192's rule — never re-derive from the prefix): ${JSON.stringify(s)}`);
      const prefix = s.poolId.slice(0, 8);
      if (s.name.endsWith('@360px')) {
        seenLenses.add('360px');
        assert(s.name === `pool-detail:${prefix}@360px`, `unexpected 360px lens surface name: ${s.name}`);
        assert(s.width === 360, `360px lens must have width:360, got ${JSON.stringify(s)}`);
        assert(!s.dark && !s.ko, `360px lens must not set dark/ko: ${JSON.stringify(s)}`);
        assert(!s.url.includes('lang=ko'), `360px lens url must not carry &lang=ko: ${s.url}`);
      } else if (s.name.endsWith('@dark')) {
        seenLenses.add('dark');
        assert(s.name === `pool-detail:${prefix}@dark`, `unexpected dark lens surface name: ${s.name}`);
        assert(s.width === 1280, `dark lens must have width:1280, got ${JSON.stringify(s)}`);
        assert(s.dark === true, `dark lens must set dark:true, got ${JSON.stringify(s)}`);
        assert(!s.ko, `dark lens must not set ko: ${JSON.stringify(s)}`);
        assert(!s.url.includes('lang=ko'), `dark lens url must not carry &lang=ko: ${s.url}`);
      } else if (s.name.endsWith('@ko')) {
        seenLenses.add('ko');
        assert(s.name === `pool-detail:${prefix}@ko`, `unexpected ko lens surface name: ${s.name}`);
        assert(s.width === 1280, `ko lens must have width:1280, got ${JSON.stringify(s)}`);
        assert(s.ko === true, `ko lens must set ko:true, got ${JSON.stringify(s)}`);
        assert(!s.dark, `ko lens must not set dark: ${JSON.stringify(s)}`);
        assert(s.url === `/home.html?pool=${encodeURIComponent(s.poolId)}&lang=ko`, `ko lens url must append &lang=ko exactly like the anchor's pool-detail-ko surface: ${s.url}`);
      } else {
        throw new Error(`lens surface name matched none of the three expected suffixes: ${s.name}`);
      }
    }
    assert(seenLenses.size === 3, `expected all three lens shapes (360px/dark/ko) to appear across the 3 picks, got ${JSON.stringify([...seenLenses])}`);

    // r.poolRotation.lenses is the {poolIdPrefix: lens} map actually emitted.
    assert(Object.keys(r.poolRotation.lenses).length === 3, `expected poolRotation.lenses to carry 3 entries, got ${JSON.stringify(r.poolRotation.lenses)}`);
    for (const [prefix, lens] of Object.entries(r.poolRotation.lenses)) {
      const surf = lensSurfaces.find((s) => s.name === `pool-detail:${prefix}@${lens}`);
      assert(surf, `poolRotation.lenses entry ${prefix}->${lens} does not match any emitted lens surface: ${JSON.stringify(r.extraSurfaces.map((s) => s.name))}`);
    }
  });

  // ---------------------------------------------------------------------------
  // (c) — sample clamped by MAX_POOL_LENS_SAMPLE (ceiling) and by
  // rotationPicks.length (never more lens surfaces than pools picked).
  // ---------------------------------------------------------------------------
  await test('(c): opts.poolLensSample above MAX_POOL_LENS_SAMPLE clamps to the ceiling when enough rotation picks exist', () => {
    const nonAnchorCount = MAX_POOL_LENS_SAMPLE + 10;
    const pools = [anchorPool()].concat(Array.from({ length: nonAnchorCount }, (_, i) => cleanPool(i)));
    const r = buildPoolSurfaces({
      pools, poolPrescan: false, poolSample: nonAnchorCount, poolLensSample: MAX_POOL_LENS_SAMPLE * 5,
      poolSeed: 'lens199-ceiling-seed', rotationState: freshState()
    });
    assert(r.poolRotation.picked.length >= MAX_POOL_LENS_SAMPLE, `fixture wiring check: expected >= ${MAX_POOL_LENS_SAMPLE} rotation picks, got ${r.poolRotation.picked.length}`);
    assert(r.poolRotation.lensSampleSize === MAX_POOL_LENS_SAMPLE, `expected lensSampleSize clamped to MAX_POOL_LENS_SAMPLE (${MAX_POOL_LENS_SAMPLE}), got ${r.poolRotation.lensSampleSize}`);
    assert(r.extraSurfaces.filter((s) => s.lensPick).length === MAX_POOL_LENS_SAMPLE, `expected exactly ${MAX_POOL_LENS_SAMPLE} lensPick surfaces, got ${r.extraSurfaces.filter((s) => s.lensPick).length}`);
  });

  await test('(c): lens sample clamps to rotationPicks.length when fewer pools were picked than the lens budget', () => {
    const pools = [anchorPool()].concat(Array.from({ length: 2 }, (_, i) => cleanPool(i)));
    const r = buildPoolSurfaces({
      pools, poolPrescan: false, poolSample: 2, poolSeed: 'lens199-small-seed',
      rotationState: freshState()
    });
    assert(r.poolRotation.picked.length === 2, `fixture wiring check: expected exactly 2 rotation picks, got ${r.poolRotation.picked.length}`);
    assert(DEFAULT_POOL_LENS_SAMPLE > 2, `fixture assumption broken: DEFAULT_POOL_LENS_SAMPLE (${DEFAULT_POOL_LENS_SAMPLE}) must exceed this fixture's 2 rotation picks for the clamp to be exercised`);
    assert(r.poolRotation.lensSampleSize === 2, `expected lensSampleSize clamped down to rotationPicks.length (2), got ${r.poolRotation.lensSampleSize}`);
    assert(r.extraSurfaces.filter((s) => s.lensPick).length === 2, `expected exactly 2 lensPick surfaces, got ${r.extraSurfaces.filter((s) => s.lensPick).length}`);
  });

  // ---------------------------------------------------------------------------
  // (d) — AUDIT_POOL_LENS_SAMPLE=0 disables the leg entirely: zero lens
  // surfaces, and the surviving extraSurfaces are byte-identical in SHAPE to
  // what buildPoolSurfaces() emitted before this item (spec 199 acceptance
  // criterion 3 — proven here at the buildPoolSurfaces() level; the CLI-level
  // proof against a real `node audit-app.js` run is in specs/199-notes.md).
  // ---------------------------------------------------------------------------
  await test('(d): AUDIT_POOL_LENS_SAMPLE=0 -> zero lens surfaces, rotationPick surfaces unaffected', () => {
    const pools = [anchorPool()].concat(Array.from({ length: 10 }, (_, i) => cleanPool(i)));
    const priorEnv = process.env.AUDIT_POOL_LENS_SAMPLE;
    process.env.AUDIT_POOL_LENS_SAMPLE = '0';
    try {
      const r = buildPoolSurfaces({
        pools, poolPrescan: false, poolSample: 10, poolSeed: 'lens199-off-seed',
        rotationState: freshState()
      });
      assert(r.poolRotation.lensSampleSize === 0, `expected lensSampleSize === 0 with AUDIT_POOL_LENS_SAMPLE=0, got ${r.poolRotation.lensSampleSize}`);
      assert(Object.keys(r.poolRotation.lenses).length === 0, `expected an empty lenses map, got ${JSON.stringify(r.poolRotation.lenses)}`);
      const lensSurfaces = r.extraSurfaces.filter((s) => s.lensPick);
      assert(lensSurfaces.length === 0, `expected zero lensPick surfaces with the leg disabled, got ${JSON.stringify(lensSurfaces)}`);
      // Every surviving surface must be the pre-199 shape: plain
      // `pool-detail:<8-char-prefix>` with rotationPick:true, no @ suffix.
      assert(r.extraSurfaces.length === 10, `expected exactly 10 surviving surfaces (== rotation picks, promotion is off), got ${r.extraSurfaces.length}`);
      for (const s of r.extraSurfaces) {
        assert(/^pool-detail:[a-z0-9]{8}$/.test(s.name), `expected a pre-199-shaped surface name, got ${s.name}`);
        assert(s.rotationPick === true, `expected rotationPick:true on the surviving surface, got ${JSON.stringify(s)}`);
      }
    } finally {
      if (priorEnv === undefined) delete process.env.AUDIT_POOL_LENS_SAMPLE; else process.env.AUDIT_POOL_LENS_SAMPLE = priorEnv;
    }
  });

  // ---------------------------------------------------------------------------
  // (e) — lens assignment varies across seeds while staying deterministic per
  // seed. Isolated from rotation's OWN seed-sensitivity by fixing the
  // candidate pool to exactly 1 non-anchor id: sampleBySeed() with a
  // single-item list always returns that one item regardless of the hash
  // (start index 0 mod list-length-1 is always 0), so rotationPicks is the
  // SAME single pool for every seed below — any variation in the assigned
  // lens can only come from the lens leg's own tickOffset hash.
  // ---------------------------------------------------------------------------
  await test('(e): the lens assigned to a fixed rotation pick varies across seeds, and is stable for a repeated seed', () => {
    const pools = [anchorPool(), cleanPool(0)];
    const seeds = ['lens199-e1', 'lens199-e2', 'lens199-e3', 'lens199-e4', 'lens199-e5', 'lens199-e6', 'lens199-e7', 'lens199-e8'];
    const lensBySeed = {};
    for (const seed of seeds) {
      const r = buildPoolSurfaces({ pools, poolPrescan: false, poolSample: 1, poolSeed: seed, rotationState: freshState() });
      assert(r.poolRotation.picked.length === 1, `fixture wiring check: expected exactly 1 rotation pick for seed "${seed}", got ${JSON.stringify(r.poolRotation.picked)}`);
      assert(r.poolRotation.picked[0] === cleanPool(0).pool, `fixture wiring check: expected the single candidate to be picked regardless of seed; seed "${seed}" picked ${r.poolRotation.picked[0]}`);
      const lensSurf = r.extraSurfaces.find((s) => s.lensPick);
      assert(lensSurf, `expected exactly one lens surface for seed "${seed}", got extraSurfaces=${JSON.stringify(r.extraSurfaces)}`);
      lensBySeed[seed] = lensSurf.name.split('@')[1];

      // Determinism: same seed, same prior state -> identical lens, twice.
      const r2 = buildPoolSurfaces({ pools, poolPrescan: false, poolSample: 1, poolSeed: seed, rotationState: freshState() });
      const lensSurf2 = r2.extraSurfaces.find((s) => s.lensPick);
      assert(lensSurf2.name === lensSurf.name, `seed "${seed}" must give an identical lens surface across two calls: ${lensSurf.name} vs ${lensSurf2.name}`);
    }
    const distinctLenses = new Set(Object.values(lensBySeed));
    assert(distinctLenses.size >= 2, `expected the assigned lens to vary across ${seeds.length} different seeds (accumulating coverage over cycles, spec 199 §2), got the SAME lens every time: ${JSON.stringify(lensBySeed)}`);
  });

  // ---------------------------------------------------------------------------
  // (f) — seen / thisRunPoolIds / renderedCount / candidateCount / picked /
  // truncated bookkeeping is byte-unchanged whether the lens leg is on or
  // off (spec 199 §4's central hard constraint).
  // ---------------------------------------------------------------------------
  await test('(f): rotation bookkeeping (seen, renderedCount, candidateCount, picked, truncated, wrapped) is identical with the lens leg on vs off', () => {
    const pools = [anchorPool()].concat(Array.from({ length: 12 }, (_, i) => cleanPool(i)));
    const stateOn = freshState();
    const stateOff = freshState();
    const rOn = buildPoolSurfaces({ pools, poolPrescan: false, poolSample: 8, poolSeed: 'lens199-bookkeeping-seed', rotationState: stateOn });
    assert(rOn.poolRotation.lensSampleSize > 0, 'fixture wiring check: expected the lens leg to be ON (lensSampleSize > 0) in the "on" run');

    const priorEnv = process.env.AUDIT_POOL_LENS_SAMPLE;
    process.env.AUDIT_POOL_LENS_SAMPLE = '0';
    let rOff;
    try {
      rOff = buildPoolSurfaces({ pools, poolPrescan: false, poolSample: 8, poolSeed: 'lens199-bookkeeping-seed', rotationState: stateOff });
    } finally {
      if (priorEnv === undefined) delete process.env.AUDIT_POOL_LENS_SAMPLE; else process.env.AUDIT_POOL_LENS_SAMPLE = priorEnv;
    }
    assert(rOff.poolRotation.lensSampleSize === 0, 'fixture wiring check: expected the lens leg to be OFF (lensSampleSize === 0) in the "off" run');

    // The pre-199 fields must be byte-identical between the two runs.
    for (const field of ['cycle', 'seenCount', 'candidateCount', 'wrapped', 'sampleSize', 'renderedCount', 'truncated']) {
      assert(JSON.stringify(rOn.poolRotation[field]) === JSON.stringify(rOff.poolRotation[field]),
        `poolRotation.${field} must be unaffected by the lens leg: on=${JSON.stringify(rOn.poolRotation[field])} off=${JSON.stringify(rOff.poolRotation[field])}`);
    }
    assert(JSON.stringify(rOn.poolRotation.picked) === JSON.stringify(rOff.poolRotation.picked),
      `poolRotation.picked must be identical: on=${JSON.stringify(rOn.poolRotation.picked)} off=${JSON.stringify(rOff.poolRotation.picked)}`);
    assert(JSON.stringify(rOn.rotationState) === JSON.stringify(rOff.rotationState),
      `rotationState (the committed {cycle,seen} shape) must be identical: on=${JSON.stringify(rOn.rotationState)} off=${JSON.stringify(rOff.rotationState)}`);
    assert(JSON.stringify(rOn.baseSeen) === JSON.stringify(rOff.baseSeen),
      `baseSeen must be identical: on=${JSON.stringify(rOn.baseSeen)} off=${JSON.stringify(rOff.baseSeen)}`);
    // thisRunPoolIds isn't returned directly, but it feeds rotationState.seen
    // above, already proven identical — and the rotationPick-marked surfaces
    // (the only surfaces whose poolId feeds `seen`) must match 1:1 too.
    const idsOn = rOn.extraSurfaces.filter((s) => s.rotationPick).map((s) => s.poolId).sort();
    const idsOff = rOff.extraSurfaces.filter((s) => s.rotationPick).map((s) => s.poolId).sort();
    assert(JSON.stringify(idsOn) === JSON.stringify(idsOff), `rotationPick poolIds must be identical: on=${JSON.stringify(idsOn)} off=${JSON.stringify(idsOff)}`);
  });

  // ---------------------------------------------------------------------------
  // Honest-overwrite mechanism (mirrors 192's own reconciliation, extended to
  // the lens leg): a run whose opts.only scopes every surface away never
  // enters the render loop at all, so the OPTIMISTIC lensSampleSize (the
  // build-time plan) must survive untouched while lensRendered/lensSkipped
  // (the honest post-render read) both settle at zero — neither field may
  // silently claim a render that never happened.
  // ---------------------------------------------------------------------------
  await test('runAudit({only: [non-existent]}) reports the planned lensSampleSize but an honest lensRendered:0, lensSkipped:0', async () => {
    const pools = [anchorPool()].concat(Array.from({ length: 10 }, (_, i) => cleanPool(i)));
    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-lens199-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const rotationStatePath = path.join(os.tmpdir(), `audit-rotation-lens199-unused-${process.pid}.json`); // never written (persistRotationState defaults false)
    const outPath = tmpOut('honest-overwrite');
    try {
      const result = await runAudit({
        port: 8971, snapshotPath: snapPath, poolSample: 10, poolSeed: 'lens199-honest-seed',
        rotationStatePath, only: ['__no_such_surface_199__'], outPath
      });
      assert(result.surfacesCovered.length === 0, `opts.only matching no real name should render nothing, got ${JSON.stringify(result.surfacesCovered)}`);
      assert(result.poolRotation.lensSampleSize > 0, `expected the build-time PLAN to survive (lensSampleSize > 0), got ${result.poolRotation.lensSampleSize}`);
      assert(result.poolRotation.lensRendered === 0, `expected an honest lensRendered:0 when nothing actually rendered, got ${result.poolRotation.lensRendered}`);
      assert(result.poolRotation.lensSkipped === 0, `expected lensSkipped:0 (filtered-away is not the same as guard-skipped), got ${result.poolRotation.lensSkipped}`);
      assert(result.poolRotation.renderedCount === 0, `sanity check: the pre-199 renderedCount must also read 0 here, got ${result.poolRotation.renderedCount}`);
    } finally {
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(rotationStatePath); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  console.log(`\ntest_audit_pool_lens.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
