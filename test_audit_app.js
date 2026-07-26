/* Rendered acceptance test for audit-app.js (backlog 142).

   Two REAL Chromium renders (not regex unit tests):
     1. Clean run — the scanner against the committed data/pools-snapshot.json:
        real data is currently clean, so it must cover the north-star ?pool= and
        the dead ?pool= surfaces with ZERO P0/P1 findings, and write
        product-loop-kit/signals/audit-findings.json in the documented shape.
     2. Positive control — a snapshot mutated with a −900,719,925,474,097.9
        (122 bug class) injected into the pool-detail's 30d-mean-APY render must
        make the scanner emit a P0 number-sanity finding for the pool-detail
        surface. Proves the scanner catches the bug class on a real render.

   Run: node test_audit_app.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAudit } = require('./audit-app.js');

const ROOT = __dirname;
const SNAPSHOT = path.join(ROOT, 'data', 'pools-snapshot.json');
const SIGNALS = path.join(ROOT, 'product-loop-kit', 'signals', 'audit-findings.json');
// −900,719,925,474,097.9 is the exact 122 rate-stability value; injecting it
// into a rendered pool field is the faithful reproduction of that bug class.
const ABSURD = -900719925474097.9;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

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
  await test('clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes signals JSON', async () => {
    const result = await runAudit({ port: 8820, snapshotPath: SNAPSHOT, only: APP_SURFACES_PLUS_ANCHOR });

    assert(result.surfacesCovered.includes('pool-detail'), 'surfacesCovered missing "pool-detail" (north-star ?pool=)');
    assert(result.surfacesCovered.includes('dead-pool'), 'surfacesCovered missing "dead-pool" (dead ?pool=)');

    const blocking = result.findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
    assert(blocking.length === 0, 'expected ZERO P0/P1 findings on clean data, got: ' + JSON.stringify(blocking));

    // Documented shape, from the written file.
    assert(fs.existsSync(SIGNALS), 'signals/audit-findings.json was not written');
    const written = JSON.parse(fs.readFileSync(SIGNALS, 'utf8'));
    assert(typeof written.generatedAt === 'string' && written.generatedAt.length > 0, 'written.generatedAt missing');
    assert(Array.isArray(written.surfacesCovered) && written.surfacesCovered.length > 0, 'written.surfacesCovered not a non-empty array');
    assert(Array.isArray(written.findings), 'written.findings not an array');
    for (const f of written.findings) {
      assert(f.surface && f.viewport && f.check && f.severity && f.detail, 'finding missing a required field: ' + JSON.stringify(f));
    }
  });

  // ---- Case 2: positive control — injected absurd number must be CAUGHT ----
  await test('positive control: injected −900T renders into pool-detail → P0 number-sanity finding', async () => {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    // Root-cause: PoolDetail.js renders pool.apyMean30d verbatim via _formatApy
    // in the "30d Mean APY" card (gated only on `typeof pool.apyMean30d ===
    // 'number'`), with no sanity clamp — so an absurd apyMean30d lands in
    // visible pool-detail text exactly like the 122 rate-stability value did.
    const target = snap.pools.find((p) => p.pool === '747c1d2a-c668-4682-b9f9-296708a3dd90') || snap.pools[0];
    target.apyMean30d = ABSURD;

    const mutatedPath = path.join(os.tmpdir(), `audit-mutated-snapshot-${process.pid}.json`);
    const mutatedOut = path.join(os.tmpdir(), `audit-findings-mutated-${process.pid}.json`);
    fs.writeFileSync(mutatedPath, JSON.stringify(snap));

    try {
      const result = await runAudit({ port: 8822, snapshotPath: mutatedPath, outPath: mutatedOut, only: ['pool-detail'] });
      const hit = result.findings.find((f) =>
        f.surface === 'pool-detail' && f.check === 'number-sanity' && f.severity === 'P0');
      assert(hit, 'expected a P0 number-sanity finding for pool-detail; got: ' + JSON.stringify(result.findings));
      assert(/9\.01e\+14|900,719,925,474,097/.test(hit.detail), 'finding detail did not reference the injected magnitude: ' + hit.detail);
    } finally {
      fs.unlinkSync(mutatedPath);
      if (fs.existsSync(mutatedOut)) fs.unlinkSync(mutatedOut);
    }
  });

  // Restore a clean signals file so the committed artifact reflects real data.
  await runAudit({ port: 8820, snapshotPath: SNAPSHOT, only: ['grid-token', 'pool-detail', 'dead-pool'] });

  console.log(`\ntest_audit_app.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
