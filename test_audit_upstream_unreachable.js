/* Acceptance tests for backlog 194 (specs/194.md) not already covered by the
   extended test_audit_cta_provenance.js (criteria 1/2/3/4, pure classifier
   fixtures) — this file covers:

   - criterion 5: generate-protocol-urls.js's buildArtifact()/buildUnreachable()
     over hand-built fixtures, no network — the blank-url key IS unreachable,
     the valid-url key is NOT, and a key with no upstream protocol entry at
     all is NOT (that's a genuine coverage gap, still a `defect` downstream).
   - criterion 7: RENDERED, real Chromium via runAudit() over the real sdai
     pool (13392973-be6e-4b2f-bce9-4f7dd53d1c3a, spec 183 T2 / this item's own
     evidence) — the false P1 is gone: severity P2, detail carries
     kind=upstream-null, and blockingFindings() has nothing for this pool.
   - criterion 8 (non-vacuity guard): the SAME rendered path, but with the
     `unreachable` evidence withheld from the artifact the classifier reads
     (a tmpdir copy, via the opts.protocolUrlsPath/AUDIT_PROTOCOL_URLS_PATH
     override added alongside readBakedProtocolUrls() for exactly this test —
     the committed data/protocol-urls.json is never written to) — the P1
     `defect` finding must come back.

   Run: node test_audit_upstream_unreachable.js
   Timebox: each runAudit() invocation below is scoped to a single
   `only: ['pool-detail']` surface and prescan/rotation are inert (poolIds
   override mode) — both real-Chromium tests together run in low tens of
   seconds, comfortably inside the 5-minute-per-invocation budget spec 194 §4
   sets. */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const SDAI_POOL_ID = '13392973-be6e-4b2f-bce9-4f7dd53d1c3a'; // real pool, spec 194 §2 evidence #1

const { buildArtifact } = require('./generate-protocol-urls.js');
const { runAudit, blockingFindings } = require('./audit-app.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assertTrue(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-upstreamnull-${tag}-${process.pid}.json`); }

async function main() {
  // ===========================================================================
  // Criterion 5 — generator, over fixtures, no network.
  // ===========================================================================

  await test('194 criterion 5: buildArtifact() over fixtures — blank-url key is unreachable, valid-url key is not, upstream-absent key is not', () => {
    const protocols = [
      { name: 'Valid Protocol', slug: 'valid-protocol', url: 'https://valid.example.com', category: 'Yield' },
      { name: 'Blank Protocol', slug: 'blank-protocol', url: '', category: 'Yield' }
      // deliberately no entry for 'absent-protocol' — it must never appear in
      // `unreachable` (spec 194 §3(A): "A key absent from the upstream feed
      // entirely must NOT appear here — that is a genuine coverage gap").
    ];
    const pools = [
      { pool: 'p1', project: 'valid-protocol' },
      { pool: 'p2', project: 'blank-protocol' },
      { pool: 'p3', project: 'absent-protocol' }
    ];
    const artifact = buildArtifact(protocols, pools, '2026-07-31T00:00:00.000Z');

    assertTrue(artifact.schemaVersion === 1, `expected schemaVersion 1 unchanged, got ${artifact.schemaVersion}`);
    assertTrue(Object.prototype.hasOwnProperty.call(artifact.urls, 'valid-protocol'), `expected 'valid-protocol' present in urls, got ${JSON.stringify(artifact.urls)}`);
    assertTrue(!Object.prototype.hasOwnProperty.call(artifact.urls, 'blank-protocol'), `expected 'blank-protocol' absent from urls (blank url must not bake), got ${JSON.stringify(artifact.urls)}`);

    assertTrue(Array.isArray(artifact.unreachable), `expected artifact.unreachable to be an array, got ${JSON.stringify(artifact.unreachable)}`);
    assertTrue(artifact.unreachable.includes('blank-protocol'), `expected 'blank-protocol' (present upstream, blank url) IN unreachable, got ${JSON.stringify(artifact.unreachable)}`);
    assertTrue(!artifact.unreachable.includes('valid-protocol'), `expected 'valid-protocol' (present upstream, valid url) NOT in unreachable, got ${JSON.stringify(artifact.unreachable)}`);
    assertTrue(!artifact.unreachable.includes('absent-protocol'), `expected 'absent-protocol' (no upstream entry at all — a real coverage gap, not by-design) NOT in unreachable, got ${JSON.stringify(artifact.unreachable)}`);

    const sorted = artifact.unreachable.slice().sort();
    assertTrue(JSON.stringify(sorted) === JSON.stringify(artifact.unreachable), `expected unreachable sorted (byte-stable output), got ${JSON.stringify(artifact.unreachable)}`);
  });

  // ===========================================================================
  // Criterion 7 — RENDERED, real Chromium, the real sdai pool: the false P1
  // is gone.
  // ===========================================================================

  await test('194 criterion 7: runAudit() over the real sdai pool renders a P2 degraded-cta with kind=upstream-null, and it is NOT in blockingFindings()', async () => {
    const outPath = tmpOut('criterion7');
    try {
      // poolIds is a BARE COMMA-STRING (buildPoolSurfaces does
      // overrideRaw.split(',')) — the array form throws
      // "overrideRaw.split is not a function" (193's lesson, spec 194 §4
      // criterion 7, mirrored from test_audit_pool_prescan.js:199). Single id
      // -> that pool becomes the anchor; prescan/rotation are off in this
      // mode (buildPoolSurfaces' override branch), so this is a fast, fully
      // deterministic render against the real committed
      // data/pools-snapshot.json (which carries this exact pool, spec 194
      // evidence) and the real committed data/protocol-urls.json (just
      // regenerated by this item, carries sdai in `unreachable`).
      const result = await runAudit({
        port: 8990, poolIds: SDAI_POOL_ID, only: ['pool-detail'], outPath
      });
      const degraded = result.findings.filter((f) => f.surface === 'pool-detail' && f.check === 'degraded-cta');
      assertTrue(degraded.length === 1, `expected exactly one degraded-cta finding for the anchor pool-detail surface, got ${JSON.stringify(degraded)}`);
      const f = degraded[0];
      assertTrue(f.severity === 'P2', `expected severity P2 for the sdai degraded-cta finding, got ${f.severity}: ${f.detail}`);
      assertTrue(f.detail.includes('kind=upstream-null'), `expected detail to carry kind=upstream-null, got: ${f.detail}`);
      assertTrue(f.detail.includes('project="sdai"'), `expected detail to name project="sdai", got: ${f.detail}`);

      const blocking = blockingFindings(result.findings);
      const blockingForThisPool = blocking.filter((bf) => bf.surface === 'pool-detail');
      assertTrue(blockingForThisPool.length === 0, `expected ZERO blocking findings for the pool-detail surface (P2 is non-blocking), got ${JSON.stringify(blockingForThisPool)}`);
    } finally {
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  // ===========================================================================
  // Criterion 8 (non-vacuity guard) — the SAME rendered path, with the
  // unreachable evidence withheld, must still fire the P1 defect.
  // ===========================================================================

  await test('194 criterion 8 (non-vacuity): with the unreachable evidence withheld from the artifact, the SAME rendered sdai pool comes back as a P1 defect', async () => {
    // A tmpdir COPY of the real committed artifact, with the `unreachable`
    // field stripped — simulates "evidence withheld" (an old/pre-194
    // artifact shape) without ever writing to the committed
    // data/protocol-urls.json. readBakedProtocolUrls() already treats an
    // absent field as unreachable:null (undeterminable-by-design), which is
    // exactly the tri-state classifyCtaKind() must NOT let through as
    // upstream-null (strict `=== true`).
    const realArtifactPath = path.join(ROOT, 'data', 'protocol-urls.json');
    const realArtifact = JSON.parse(fs.readFileSync(realArtifactPath, 'utf8'));
    const withheld = Object.assign({}, realArtifact);
    delete withheld.unreachable;
    assertTrue(!Object.prototype.hasOwnProperty.call(withheld.urls, 'sdai'), 'fixture wiring check: expected the real artifact to still carry no url for "sdai" (spec 183 T2) — this test only withholds the NEW unreachable evidence, not the pre-existing tier absence');

    const tmpArtifactPath = path.join(os.tmpdir(), `audit-protocol-urls-withheld-194-${process.pid}.json`);
    fs.writeFileSync(tmpArtifactPath, JSON.stringify(withheld));
    const outPath = tmpOut('criterion8');
    try {
      const result = await runAudit({
        port: 8991, poolIds: SDAI_POOL_ID, only: ['pool-detail'], outPath,
        protocolUrlsPath: tmpArtifactPath
      });
      const degraded = result.findings.filter((f) => f.surface === 'pool-detail' && f.check === 'degraded-cta');
      assertTrue(degraded.length === 1, `expected exactly one degraded-cta finding, got ${JSON.stringify(degraded)}`);
      const f = degraded[0];
      assertTrue(f.severity === 'P1', `THE NON-VACUITY GUARD: expected severity P1 (defect) once the unreachable evidence is withheld, got ${f.severity}: ${f.detail}`);
      assertTrue(f.detail.includes('kind=defect'), `expected detail to carry kind=defect, got: ${f.detail}`);

      const blocking = blockingFindings(result.findings);
      const blockingForThisPool = blocking.filter((bf) => bf.surface === 'pool-detail');
      assertTrue(blockingForThisPool.length === 1, `expected the P1 defect to be counted as blocking, got ${JSON.stringify(blockingForThisPool)}`);
    } finally {
      try { fs.unlinkSync(tmpArtifactPath); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  console.log(`\ntest_audit_upstream_unreachable.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
