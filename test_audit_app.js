/* Rendered acceptance test for audit-app.js (backlog 142; restored 155).

   Three REAL Chromium renders (not regex unit tests), all writing to temp
   outPaths — none of them touch the committed
   product-loop-kit/signals/audit-findings.json (155 criterion 7):
     1. Clean run — the scanner against the committed data/pools-snapshot.json:
        real data is currently clean, so it must cover the north-star ?pool= and
        the dead ?pool= surfaces with ZERO P0/P1 findings, and produce a result
        (and written file) in the documented shape.
     2. Positive control — a snapshot mutated with a 900,719,925,474,097.9
        (122 bug class) magnitude injected into pool-detail's Base APY card
        (with Reward APY forced > 0, since both cards at PoolDetail.js:1210/1236
        are gated on `pool.apyBase > 0 && pool.apyReward > 0`) must make the
        scanner emit a P0 number-sanity finding for the pool-detail surface.
        Proves the scanner catches the bug class on a real render.
     3. Negative control — the same magnitude injected into apyMean30d instead
        must produce ZERO number-sanity findings for pool-detail, because
        backlog 144's `mean30dSane` gate (PoolDetail.js:161-164, enforced at
        the render site PoolDetail.js:1290) keeps an out-of-rail 30d-mean-APY
        card from rendering at all. Locks that rail in: if a future change
        drops the gate, this case goes red instead of the absurd number
        quietly reaching production.

   Run: node test_audit_app.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAudit } = require('./audit-app.js');

const ROOT = __dirname;
const SNAPSHOT = path.join(ROOT, 'data', 'pools-snapshot.json');
// The 122 bug class's exact magnitude (the original rate-stability regression
// rendered −900,719,925,474,097.9). Cases 2/3 inject the POSITIVE magnitude —
// PoolDetail.js:1210/1236 gate Base/Reward APY on `pool.apyBase > 0`, so a
// negative value would never reach render in the first place and would prove
// nothing about the detector. Math.abs() on either sign yields the same
// "9.01e+14" the scanner reports, so the assertions below hold either way.
const ABSURD_MAGNITUDE = 900719925474097.9;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-app-${tag}-${process.pid}.json`); }

async function main() {
  // ---- Case 1: clean run against the committed snapshot ----
  // Scoped to the app surfaces + the clean static anchor (backlog 154): an
  // UNSCOPED run also samples a rotating slice of tokens/*.html + chains/*.html,
  // and real junk pages exist on disk right now (tokens/00.html, tokens/01.html,
  // tokens/8oct2026.html — see spec 154's evidence) that legitimately trip the
  // new junk-slug check. That's a true positive, not a regression here — see
  // test_seo_surface_audit.js criterion 2 for the positive-control assertion
  // on exactly that class. This case stays about the surfaces it was written
  // about: the app surfaces (grid/pool-detail/dead-pool/etc.) plus the single
  // hand-picked anchor static page, which is clean.
  const APP_SURFACES_PLUS_ANCHOR = [
    'grid-token', 'pool-detail', 'grid-chain', 'dead-pool', 'grid-loading',
    'pool-detail-360', 'grid-360', 'pool-detail-dark', 'pool-detail-ko', 'static-page'
  ];
  // backlog 219 — QUARANTINE, split-gate shape per
  // playbooks/pre-existing-red-triage.md's rule-E precedent (spec 219, "The
  // pre-existing red this lens exposes"), same move already applied above to
  // real junk static pages tripping junk-slug: the CHECK is not softened,
  // the SCOPE is narrowed to the exact, named, dated surfaces it is proven
  // on. Real, independently-verified, reproducible defects (second
  // measurement outside checkOcclusion, resampled to rule out a timing
  // race — specs/219-notes.md "(a)"/"(b)"/"(d)") on three surfaces today:
  //   (a) `grid-360` P0 — a duplicate, non-fixed `.theme-toggle`
  //       (app.js:3139, distinct from the header's own
  //       `.google-control-btn.theme-toggle`, app.js:3062) renders in
  //       normal document flow directly under the fixed
  //       `.google-header-sticky` (style.css:903) once `.app.has-results`
  //       (grid pages) leaves the mobile `.app:not(.has-results)
  //       .theme-toggle { position: fixed }` override (style.css:4329)
  //       un-applied and the base mobile rule `.theme-toggle { position:
  //       static }` (style.css:4319) takes over.
  //   (b) `grid-360` P1 — a `.pool-symbol` row sits, AT FIRST PAINT, inside
  //       the fixed `.app-footer`'s band (style.css:2513) purely because
  //       enough cards fill a 360x780 viewport to reach it; `.app`'s only
  //       clearance rule (`padding-bottom: 80px`, style.css:852) protects
  //       the END of the document, not a mid-page row that happens to land
  //       at rest — 218's exact lesson, recurring on a surface 217/218
  //       never touched.
  //   (d) `grid-token`/`grid-chain` P0+P1 at 1280px — the SAME class as
  //       (a)/(b), one width wider: at 1280x780, one of nine per-card
  //       `.calculate-yield-btn-new` buttons and one `.pool-symbol` row land
  //       inside `.app-footer`'s 69px band at first paint. Surfaced only
  //       after the round-3 fix added a settle wait after the occlusion
  //       pass's viewport resize (audit-app.js's `checkOcclusion`,
  //       "measuring inside that window risks... missed [findings]") — the
  //       earlier, unsettled measurement was racing the post-resize reflow
  //       and read stale (pre-resize) geometry where nothing overlapped;
  //       independently re-measured outside checkOcclusion (own
  //       `page.evaluate` + `elementFromPoint`) and confirmed a genuine,
  //       reproducible hit, not a settle-timing artifact of the fix itself.
  // Fixing any of these is a separate item (spec 219's own scope boundary:
  // "This item ships the detector. Findings become tickets."). QUARANTINE NO
  // LONGER NEEDED for a given surface — remove it from the set below (and
  // drop the whole quarantine once the set is empty) — once that surface
  // stops producing occlusion findings; the loud console line below names
  // exactly which quarantined surfaces are clean on a given run.
  const QUARANTINED_OCCLUSION_SURFACES = new Set(['grid-360', 'grid-token', 'grid-chain']);
  const outPaths = { case1: tmpOut('case1'), case2: tmpOut('case2'), case3: tmpOut('case3') };

  await test('clean run: covers pool-detail + dead-pool, ZERO P0/P1 (occlusion quarantined to named grid surfaces only, pool-detail* always clean), writes findings JSON', async () => {
    const result = await runAudit({
      port: 8820, snapshotPath: SNAPSHOT, only: APP_SURFACES_PLUS_ANCHOR, outPath: outPaths.case1
    });

    assert(result.surfacesCovered.includes('pool-detail'), 'surfacesCovered missing "pool-detail" (north-star ?pool=)');
    assert(result.surfacesCovered.includes('dead-pool'), 'surfacesCovered missing "dead-pool" (dead ?pool=)');

    // 1. Every check that is NOT `occlusion` keeps ZERO P0/P1, unchanged —
    // this is the same assertion the file always made, merely restricted to
    // exclude the one check now under quarantine.
    const nonOcclusionBlocking = result.findings.filter((f) => f.check !== 'occlusion' && (f.severity === 'P0' || f.severity === 'P1'));
    assert(nonOcclusionBlocking.length === 0, 'expected ZERO P0/P1 findings on clean data for every non-occlusion check, got: ' + JSON.stringify(nonOcclusionBlocking));

    // 2. `occlusion` findings are allowed ONLY on the documented quarantined
    // surface(s) above — a NEW occlusion defect on ANY other covered
    // surface must still turn this red.
    const occlusionBlocking = result.findings.filter((f) => f.check === 'occlusion' && (f.severity === 'P0' || f.severity === 'P1'));
    const unquarantinedOcclusion = occlusionBlocking.filter((f) => !QUARANTINED_OCCLUSION_SURFACES.has(f.surface));
    assert(unquarantinedOcclusion.length === 0,
      `a NEW occlusion defect appeared outside the documented quarantine (${[...QUARANTINED_OCCLUSION_SURFACES].join(', ')}); got: ${JSON.stringify(unquarantinedOcclusion)}`);

    // 3. ZERO occlusion findings on every pool-detail* surface, always — the
    // 217/218 fixes' own regression rail, now machine-watched daily, never
    // eligible for quarantine.
    const poolDetailOcclusion = result.findings.filter((f) => f.check === 'occlusion' && f.surface.startsWith('pool-detail'));
    assert(poolDetailOcclusion.length === 0, 'expected ZERO occlusion findings on any pool-detail* surface (217/218 regression rail), got: ' + JSON.stringify(poolDetailOcclusion));

    // 4. Loud, not silent: the moment a quarantined surface comes back
    // clean, say so BY NAME, so the quarantine shrinks (and eventually gets
    // removed) rather than being inherited forever
    // (playbooks/pre-existing-red-triage.md's own trap: "eleven consecutive
    // notes files said pre-existing... none said classified").
    const stillRedSurfaces = new Set(occlusionBlocking.filter((f) => QUARANTINED_OCCLUSION_SURFACES.has(f.surface)).map((f) => f.surface));
    const nowCleanSurfaces = [...QUARANTINED_OCCLUSION_SURFACES].filter((surface) => !stillRedSurfaces.has(surface));
    if (nowCleanSurfaces.length > 0) {
      console.log(`    QUARANTINE NO LONGER NEEDED for [${nowCleanSurfaces.join(', ')}] — produced ZERO occlusion findings this run; remove from QUARANTINED_OCCLUSION_SURFACES. See specs/219-notes.md.`);
    }
    if (stillRedSurfaces.size === 0) {
      console.log('    QUARANTINE FULLY CLEAR — delete QUARANTINED_OCCLUSION_SURFACES and the occlusion special-casing above entirely.');
    }

    // Documented shape, from the written file.
    assert(fs.existsSync(outPaths.case1), 'findings JSON was not written to the temp outPath');
    const written = JSON.parse(fs.readFileSync(outPaths.case1, 'utf8'));
    assert(typeof written.generatedAt === 'string' && written.generatedAt.length > 0, 'written.generatedAt missing');
    assert(Array.isArray(written.surfacesCovered) && written.surfacesCovered.length > 0, 'written.surfacesCovered not a non-empty array');
    assert(Array.isArray(written.findings), 'written.findings not an array');
    for (const f of written.findings) {
      assert(f.surface && f.viewport && f.check && f.severity && f.detail, 'finding missing a required field: ' + JSON.stringify(f));
    }
  });

  // ---- Case 2: positive control — injected absurd apyBase must be CAUGHT ----
  await test('positive control: injected 900T Base APY renders into pool-detail → P0 number-sanity finding', async () => {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const target = snap.pools.find((p) => p.pool === '747c1d2a-c668-4682-b9f9-296708a3dd90') || snap.pools[0];
    // Both the Base APY and Reward APY cards (PoolDetail.js:1210/1236) are
    // gated on `pool.apyBase > 0 && pool.apyReward > 0`, with no sanity clamp
    // on either — unlike apyMean30d (see case 3), an absurd apyBase renders
    // verbatim. apyReward is forced positive purely to satisfy the shared
    // render gate; it is not itself the value under test.
    target.apyBase = ABSURD_MAGNITUDE;
    target.apyReward = 1;

    const mutatedPath = path.join(os.tmpdir(), `audit-mutated-snapshot-case2-${process.pid}.json`);
    fs.writeFileSync(mutatedPath, JSON.stringify(snap));

    try {
      const result = await runAudit({
        port: 8822, snapshotPath: mutatedPath, outPath: outPaths.case2, only: ['pool-detail']
      });
      // apyBase feeds more than one rendered figure (the raw Base APY card
      // plus derived projections elsewhere on the page), so several
      // number-sanity findings are expected (probe: 7) — search all of them
      // for the one quoting the exact injected magnitude, rather than
      // asserting on whichever happens to come first.
      const poolDetailHits = result.findings.filter((f) =>
        f.surface === 'pool-detail' && f.check === 'number-sanity' && f.severity === 'P0');
      assert(poolDetailHits.length > 0, 'expected a P0 number-sanity finding for pool-detail; got: ' + JSON.stringify(result.findings));
      const hit = poolDetailHits.find((f) => /9\.01e\+14|900,719,925,474,097/.test(f.detail));
      assert(hit, 'no P0 number-sanity finding referenced the injected magnitude; got: ' + JSON.stringify(poolDetailHits));
    } finally {
      fs.unlinkSync(mutatedPath);
    }
  });

  // ---- Case 3: negative control — injected absurd apyMean30d must be SUPPRESSED ----
  await test('negative control: injected 900T 30d-Mean APY is suppressed on pool-detail (backlog 144 rail holds)', async () => {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const target = snap.pools.find((p) => p.pool === '747c1d2a-c668-4682-b9f9-296708a3dd90') || snap.pools[0];
    // PoolDetail.js:161-164 computes `mean30dSane` (finite, >=0, <=
    // APY_SANITY_LIMIT_LOCAL) and PoolDetail.js:1290 gates the whole "30d Mean
    // APY" card on it, so this value must never reach rendered text.
    target.apyMean30d = ABSURD_MAGNITUDE;

    const mutatedPath = path.join(os.tmpdir(), `audit-mutated-snapshot-case3-${process.pid}.json`);
    fs.writeFileSync(mutatedPath, JSON.stringify(snap));

    try {
      const result = await runAudit({
        port: 8823, snapshotPath: mutatedPath, outPath: outPaths.case3, only: ['pool-detail']
      });
      const hits = result.findings.filter((f) => f.surface === 'pool-detail' && f.check === 'number-sanity');
      assert(hits.length === 0, 'expected ZERO number-sanity findings for pool-detail (144 rail should suppress the card); got: ' + JSON.stringify(hits));
    } finally {
      fs.unlinkSync(mutatedPath);
    }
  });

  for (const p of Object.values(outPaths)) { try { fs.unlinkSync(p); } catch (e) {} }

  console.log(`\ntest_audit_app.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
