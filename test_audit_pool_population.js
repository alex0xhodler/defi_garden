/* Acceptance tests for backlog 206: the pool-detail rotation's candidate
   population is widened from `data/pools-snapshot.json` alone (736 pools,
   $10M-railed) to the union of the snapshot and the estate's own `?pool=`
   deep links (3,669 ids on this checkout, only 420 of which overlap the
   snapshot — see specs/206.md's evidence table), intersected with the live
   feed so a fixture-less id never renders a fabricated dead-end.

   Follows test_audit_number_boundary.js's file shape: same test()/assert()
   harness, tmp `outPath`s under os.tmpdir() so
   product-loop-kit/signals/audit-findings.json is NEVER written by this
   file, and every pool id used is DERIVED from the real, committed snapshot
   at runtime — never hardcoded (the snapshot churns daily).

   Criteria 1-4 are pure functions, no browser (prescanStaticPages() is a
   fs+regex scan; buildPoolSurfaces() is pure over its `pools`/opts args) —
   see test_audit_prescan.js / test_audit_pool_link_liveness.js's own
   "no Playwright" precedent for this shape.

   Criterion 5 is the MANDATORY rendered positive control (spec 206
   acceptance criterion 3: "a widened population that finds nothing proves
   nothing") — two real Chromium renders via runAudit(), fixture-routed
   exactly like test_audit_number_boundary.js's own criteria 6-7: a synthetic
   sub-rail pool id (valid-shaped uuid, NOT in the snapshot) injected via
   opts.livePools + opts.deepLinkPoolIds, `poolPrescan: false`,
   `poolSample: 1`, `prescan: false` (the STATIC prescan — irrelevant here
   since opts.deepLinkPoolIds overrides it directly; skipped only to keep
   this file inside its own wall-clock budget, not because it would break
   anything), an in-memory `rotationState`, `only: ['pool-detail:<prefix>']`,
   and a tmp `outPath`. The candidate population is pinned to EXACTLY the
   synthetic id (a one-real-pool temp snapshot, so the anchor consumes the
   only snapshot id and the union's lone OTHER member is the synthetic one)
   so `poolSample: 1` deterministically renders it — no seed-hunting, no
   probability.

   TIMEBOX (206's own instruction): no single run here may exceed 5
   foreground minutes; run this file itself with `timeout 300 node
   test_audit_pool_population.js`. Criteria 1-4 measured at ~1s total on this
   checkout (prescanStaticPages() over the real ~4,300-page estate); the two
   renders in criterion 5 are the only slow part, and skip the static/i18n/
   text-surface passes to stay well inside budget.

   Run: node test_audit_pool_population.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runAudit, prescanStaticPages, buildPoolSurfaces, blockingFindings, ROTATION_SEEN_CAP
} = require('./audit-app.js');

const ROOT = __dirname;
const SNAPSHOT = path.join(ROOT, 'data', 'pools-snapshot.json');

// The 193/206-documented 122-bug-class magnitude (test_audit_number_boundary.js's
// own ABSURD_MAGNITUDE, reused by value/knowledge — not exported as a module
// constant from that file, so restated here per this item's own instruction
// to "reuse its constant and its knowledge rather than guessing"):
// PoolDetail.js:1210/1236 gate the Base/Reward APY cards on
// `pool.apyBase > 0 && pool.apyReward > 0`, so setting apyBase to this and
// apyReward to a sane positive number is the proven recipe to get an absurd
// figure onto the rendered page via a card the scanner actually reads.
const ABSURD_MAGNITUDE = 900719925474097.9;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-poolpop-${tag}-${process.pid}.json`); }

async function main() {
  const realSnap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const pools = realSnap.pools;
  assert(Array.isArray(pools) && pools.length > 0, 'sanity: real snapshot has no pools — cannot run this file');

  // One real fs+regex scan over the estate, shared by criteria 1/2/3/4 so
  // this file pays its ~1s cost once, not four times.
  const prescan = prescanStaticPages();
  const snapshotIdsSet = new Set(pools.map((p) => p.pool));
  const unionSet = new Set(snapshotIdsSet);
  for (const id of prescan.deepLinkPoolIds) unionSet.add(id);

  // ---- Criterion 1 ----
  let built1;
  await test('criterion 1: real estate deep-link population > 3,000, and the widened union > 3,000 candidates, internally consistent', () => {
    assert(Array.isArray(prescan.deepLinkPoolIds), `expected prescanStaticPages().deepLinkPoolIds to be an array; got ${JSON.stringify(prescan.deepLinkPoolIds)}`);
    assert(prescan.deepLinkPoolIds.length > 3000,
      `expected the real estate's deep-linked pool population to exceed 3,000 ids (spec 206 evidence: 3,669 measured); got ${prescan.deepLinkPoolIds.length}`);

    built1 = buildPoolSurfaces({
      pools, deepLinkPoolIds: prescan.deepLinkPoolIds, livePoolIds: unionSet,
      poolPrescan: false, rotationState: { schemaVersion: 1, cycle: 0, seen: [] }
    });
    const rot = built1.poolRotation;
    assert(rot.candidateCount > 3000,
      `expected poolRotation.candidateCount > 3000 (union minus anchor/promoted exclusion) with livePoolIds = the full union (nothing filtered); got ${rot.candidateCount}`);

    // Internal consistency (spec 206 test criterion 1's own requirement).
    assert(rot.snapshotIds === snapshotIdsSet.size,
      `expected poolRotation.snapshotIds === real snapshot population (${snapshotIdsSet.size}); got ${rot.snapshotIds}`);
    assert(rot.union === unionSet.size,
      `expected poolRotation.union === the test's own independently-computed union (${unionSet.size}); got ${rot.union}`);
    assert(rot.union === rot.snapshotIds + rot.deepLinkIds,
      `expected the clean invariant union === snapshotIds + deepLinkIds (deepLinkIds is the NET-NEW, post-snapshot-overlap count); got union=${rot.union}, snapshotIds=${rot.snapshotIds}, deepLinkIds=${rot.deepLinkIds}`);
    assert(rot.reachable === rot.candidateCount,
      `expected poolRotation.reachable === poolRotation.candidateCount (both are "after anchor/promoted exclusion"); got reachable=${rot.reachable}, candidateCount=${rot.candidateCount}`);
    // Anchor is always a snapshot pool, no promotion (poolPrescan:false), so
    // reachable must be EXACTLY union - 1 (the anchor), never off by more.
    assert(rot.reachable === rot.union - 1,
      `expected reachable === union - 1 (only the anchor is excluded — no promotion under poolPrescan:false); got reachable=${rot.reachable}, union=${rot.union}`);
  });

  // ---- Criterion 2 ----
  await test('criterion 2: ROTATION_SEEN_CAP exceeds the REAL union population (read from disk/estate at test time)', () => {
    assert(ROTATION_SEEN_CAP > unionSet.size,
      `ROTATION_SEEN_CAP (${ROTATION_SEEN_CAP}) must exceed the real union population (${unionSet.size} = ${snapshotIdsSet.size} snapshot + ${prescan.deepLinkPoolIds.length} deep-linked ids, deduped) or computeRotation()'s wrap branch can never fire on real data (the exact trap ROTATION_SEEN_CAP's own comment documents on its 183->196->206 fourth occurrence) — RAISE THE CAP (audit-app.js's ROTATION_SEEN_CAP constant) before this ships.`);
  });

  // ---- Criterion 3 ----
  await test('criterion 3: sub-rail pools (absent from data/pools-snapshot.json) actually get picked', () => {
    assert(built1, 'criterion 1 must have run first to build built1');
    const picked = built1.poolRotation.picked;
    const subRailPickedIds = picked.filter((id) => !snapshotIdsSet.has(id));
    assert(subRailPickedIds.length > 0,
      `expected at least one of this tick's ${picked.length} rotation picks to be ABSENT from data/pools-snapshot.json (a sub-rail pool); got zero — picks: ${JSON.stringify(picked)}`);
    // Cross-check against the field buildPoolSurfaces() itself reports, so a
    // drift between the two would fail loudly rather than being masked.
    assert(built1.poolRotation.subRailPicked === subRailPickedIds.length,
      `expected poolRotation.subRailPicked (${built1.poolRotation.subRailPicked}) to match this test's own independent count (${subRailPickedIds.length})`);
    // And the surfaces themselves must carry the subRail marker (spec §7).
    const subRailSurfaces = built1.extraSurfaces.filter((s) => s.rotationPick && s.subRail);
    const subRailSurfaceIds = new Set(subRailSurfaces.map((s) => s.poolId));
    for (const id of subRailPickedIds) {
      assert(subRailSurfaceIds.has(id), `expected a subRail:true extraSurface for picked sub-rail id ${id}, found none`);
    }
  });

  // ---- Criterion 4: the ∩ live safety rule ----
  await test('criterion 4: livePoolIds = snapshot ids only -> candidateCount collapses to the snapshot-only count, deepLinkIds = 0 with a reason', () => {
    const built2 = buildPoolSurfaces({
      pools, deepLinkPoolIds: prescan.deepLinkPoolIds, livePoolIds: snapshotIdsSet,
      poolPrescan: false, rotationState: { schemaVersion: 1, cycle: 0, seen: [] }
    });
    const rot2 = built2.poolRotation;
    const expectedSnapshotOnlyCandidateCount = pools.length - 1; // anchor excluded, no promotion
    assert(rot2.candidateCount === expectedSnapshotOnlyCandidateCount,
      `expected candidateCount to collapse back to today's snapshot-only figure (${expectedSnapshotOnlyCandidateCount}) when no deep-linked id is confirmed live beyond the snapshot itself; got ${rot2.candidateCount}`);
    assert(rot2.deepLinkIds === 0,
      `expected poolRotation.deepLinkIds === 0 (no sub-rail pool is live); got ${rot2.deepLinkIds}`);
    assert(typeof rot2.deepLinkSource === 'string' && rot2.deepLinkSource.length > 0,
      `expected a non-empty poolRotation.deepLinkSource reason string; got ${JSON.stringify(rot2.deepLinkSource)}`);
    // None of this tick's picks may be sub-rail either, under this rule.
    const anySubRail = built2.extraSurfaces.some((s) => s.subRail);
    assert(!anySubRail, 'expected zero subRail-marked surfaces when livePoolIds is snapshot-only');
  });

  // ---- Criterion 5: rendered positive control (mandatory, spec 206 acceptance 3) ----
  // A valid-shaped uuid guaranteed (checked below) absent from the real
  // snapshot. Fixed literal is fine here — it is not a snapshot id read from
  // disk, it is a value THIS test invents and injects.
  const SYNTHETIC_POOL_ID = 'abcdef01-2345-6789-abcd-ef0123456789';
  assert(!snapshotIdsSet.has(SYNTHETIC_POOL_ID), 'sanity: the synthetic pool id collided with a real snapshot id — pick another literal');
  const SYNTHETIC_PREFIX = SYNTHETIC_POOL_ID.slice(0, 8); // mirrors poolIdPrefix()'s own POOL_ID_PREFIX_LEN=8 (test_audit_pool_prescan.js/test_audit_pool_lens.js use the same literal)
  const SUB_RAIL_SURFACE = `pool-detail:${SYNTHETIC_PREFIX}`;

  // A ONE-real-pool temp snapshot: the anchor consumes that single snapshot
  // id, and (with poolPrescan:false, no promotion) the union's only OTHER
  // member is the synthetic id — so poolSample:1 deterministically renders
  // the synthetic pool, no seed-hunting and no reliance on chance.
  const anchorSourcePool = pools.find((p) => p && p.pool) || pools[0];
  const tinySnap = Object.assign({}, realSnap, { pools: [anchorSourcePool], count: 1 });
  const tinySnapPath = path.join(os.tmpdir(), `audit-tiny-snapshot-poolpop-${process.pid}.json`);
  fs.writeFileSync(tinySnapPath, JSON.stringify(tinySnap));

  // The anchor's own live-shape record (so the live feed is internally
  // consistent — a real run always sees its own snapshot pools live too).
  const anchorLivePool = Object.assign({}, anchorSourcePool, {
    apy: (anchorSourcePool.apyBase || 0) + (anchorSourcePool.apyReward || 0)
  });
  delete anchorLivePool.kpis; // live-shape pools carry no kpis (product-audit.md's own note)

  function syntheticLivePool(apyBase, apyReward) {
    const p = Object.assign({}, anchorSourcePool, {
      pool: SYNTHETIC_POOL_ID,
      apyBase, apyReward, apy: apyBase + apyReward
    });
    delete p.kpis;
    return p;
  }

  const outPaths = { injected: tmpOut('injected'), control: tmpOut('control') };
  const runOpts = (livePool, port, outPath) => ({
    port, snapshotPath: tinySnapPath, outPath,
    only: [SUB_RAIL_SURFACE],
    poolPrescan: false, poolSample: 1, prescan: false,
    rotationState: { schemaVersion: 1, cycle: 0, seen: [] },
    deepLinkPoolIds: [SYNTHETIC_POOL_ID],
    livePools: [anchorLivePool, livePool]
  });

  let injectedResult, controlResult;
  try {
    // ---- Injected run ----
    await test('criterion 5a (rendered, injected): sub-rail pool with an absurd apyBase -> P0 number-sanity finding ON that surface', async () => {
      injectedResult = await runAudit(runOpts(syntheticLivePool(ABSURD_MAGNITUDE, 1), 8996, outPaths.injected));
      assert(injectedResult.surfacesCovered.includes(SUB_RAIL_SURFACE),
        `expected surfacesCovered to include "${SUB_RAIL_SURFACE}"; got ${JSON.stringify(injectedResult.surfacesCovered)}`);
      const hits = injectedResult.findings.filter((f) =>
        f.surface === SUB_RAIL_SURFACE && f.check === 'number-sanity' && f.severity === 'P0');
      assert(hits.length > 0,
        `expected a P0 number-sanity finding on "${SUB_RAIL_SURFACE}"; got findings for that surface: ${JSON.stringify(injectedResult.findings.filter((f) => f.surface === SUB_RAIL_SURFACE))}`);
      const hit = hits.find((f) => /9\.01e\+14|900,719,925,474,097/.test(f.detail));
      assert(hit, 'no P0 number-sanity finding referenced the injected magnitude; got: ' + JSON.stringify(hits));
      // Not a dead-end: the surface rendered the pool-detail view for real —
      // proves the LIVE-shape sub-rail fixture reached it (the failure mode
      // this whole item exists to avoid would show up as `dead-end`, not
      // `number-sanity`).
      const deadEnd = injectedResult.findings.filter((f) => f.surface === SUB_RAIL_SURFACE && f.check === 'dead-end');
      assert(deadEnd.length === 0, `expected zero dead-end findings on the injected run (proves the sub-rail fixture reached the pool); got ${JSON.stringify(deadEnd)}`);
    });

    // ---- Control run (same pool, sane values) ----
    await test('criterion 5b (rendered, control): same sub-rail pool with SANE values -> zero P0/P1 findings on that surface, in particular no dead-end', async () => {
      controlResult = await runAudit(runOpts(syntheticLivePool(2.5, 1.0), 8997, outPaths.control));
      assert(controlResult.surfacesCovered.includes(SUB_RAIL_SURFACE),
        `expected surfacesCovered to include "${SUB_RAIL_SURFACE}"; got ${JSON.stringify(controlResult.surfacesCovered)}`);
      const surfaceFindings = controlResult.findings.filter((f) => f.surface === SUB_RAIL_SURFACE);
      const blocking = blockingFindings(surfaceFindings);
      assert(blocking.length === 0,
        `expected ZERO P0/P1 findings on "${SUB_RAIL_SURFACE}" for a SANE sub-rail pool (proves the LIVE-shape fixture, not the injected value, is what the injected run's finding depended on); got: ${JSON.stringify(surfaceFindings)}`);
      const deadEnd = surfaceFindings.filter((f) => f.check === 'dead-end');
      assert(deadEnd.length === 0,
        `expected zero dead-end findings — a dead-end here would mean the sub-rail LIVE-shape fixture failed to reach the pool (the exact snapshot-shape trap this item exists to avoid); got ${JSON.stringify(deadEnd)}`);
    });
  } finally {
    for (const p of Object.values(outPaths)) { try { fs.unlinkSync(p); } catch (e) {} }
    try { fs.unlinkSync(tinySnapPath); } catch (e) {}
  }

  console.log(`\ntest_audit_pool_population.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
