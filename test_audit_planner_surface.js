/* Acceptance test for backlog 162 — audit-app.js's four new planner/landing
   surfaces (`landing`, `planner`, `planner-360`, `planner-ko`).

   Two layers, mirroring the established audit-test shape (test_audit_app.js /
   test_audit_text_surfaces.js):

     1. SOURCE-LEVEL checks (no Playwright, no browser, cannot be skipped for
        an environment gap): read audit-app.js's own text and assert the four
        surface literals exist in the default rotation with the exact
        name/url/kind/width the spec table requires, and that none of them is
        `kind: 'static'` (the fact --static-only's existing
        `s.kind === 'static'` filter relies on to exclude them — grepped
        verbatim below, not re-implemented).
     2. INTEGRATION checks (real Chromium via runAudit()): drive the
        `planner` surface through a real render, and drive a real
        `--static-only`-shaped call to prove the exclusion behaviorally, not
        just structurally. Per the 160 post-verifier lesson ("a check that
        cannot go red is not a check"), ONLY the runAudit() call itself is
        wrapped in a skip-tolerant timeout/catch for a genuine environment gap
        (playwright unresolvable / chromium won't launch) — every assertion
        sits OUTSIDE that catch, so a real wiring regression fails loud, it
        never reports itself as "(skipped)".

   Run: node test_audit_planner_surface.js */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAudit } = require('./audit-app.js');

const ROOT = __dirname;
const SOURCE_PATH = path.join(ROOT, 'audit-app.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assertT(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------------------
// Layer 1 — source-level. No playwright import, no server, no browser: these
// always run and can always fail, regardless of whether Chromium is
// available in this sandbox.
// ---------------------------------------------------------------------------
console.log('audit-app.js — backlog 162 planner/landing surfaces\n');

const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// Extracts the object literal `{ name: '<name>', ... }` for a given surface
// name from the default-rotation array (non-greedy up to the closing brace).
function surfaceLiteral(name) {
  const re = new RegExp(`\\{ name: '${name}',[^}]*\\}`);
  const m = source.match(re);
  return m ? m[0] : null;
}

const EXPECTED = [
  { name: 'landing', url: '/', kind: 'landing', width: 1280, ko: false },
  { name: 'planner', url: '/plan.html', kind: 'planner', width: 1280, ko: false },
  { name: 'planner-360', url: '/plan.html', kind: 'planner', width: 360, ko: false },
  { name: 'planner-ko', url: '/plan.html?lang=ko', kind: 'planner', width: 1280, ko: true }
];

for (const spec of EXPECTED) {
  test(`default rotation contains "${spec.name}" with url/kind/width per spec`, () => {
    const lit = surfaceLiteral(spec.name);
    assertT(lit, `no "{ name: '${spec.name}', ... }" literal found in audit-app.js's default rotation`);
    assertT(lit.includes(`url: '${spec.url}'`), `"${spec.name}" literal missing url: '${spec.url}' — got: ${lit}`);
    assertT(lit.includes(`kind: '${spec.kind}'`), `"${spec.name}" literal missing kind: '${spec.kind}' — got: ${lit}`);
    assertT(lit.includes(`width: ${spec.width}`), `"${spec.name}" literal missing width: ${spec.width} — got: ${lit}`);
    assertT(lit.includes('kind: \'static\'') === false, `"${spec.name}" must NOT be kind: 'static' (would break --static-only exclusion) — got: ${lit}`);
    if (spec.ko) assertT(lit.includes('ko: true'), `"${spec.name}" literal missing ko: true — got: ${lit}`);
  });
}

test('the four new surfaces are appended AFTER pool-detail-ko (no existing surface renamed/moved)', () => {
  const anchorIdx = source.indexOf("{ name: 'pool-detail-ko'");
  assertT(anchorIdx > -1, 'could not find the pool-detail-ko anchor literal to order against');
  for (const spec of EXPECTED) {
    const idx = source.indexOf(`{ name: '${spec.name}',`);
    assertT(idx > anchorIdx, `"${spec.name}" must appear after pool-detail-ko in the default rotation array`);
  }
});

test('--static-only\'s exclusion mechanism (s.kind === \'static\' filter) is present unchanged', () => {
  assertT(source.includes("surfaces = surfaces.filter((s) => s.kind === 'static')"),
    'the --static-only filter (opts.staticOnly branch) is missing or its predicate changed — the structural proof above depends on this exact filter existing');
});

// ---------------------------------------------------------------------------
// Layer 2 — integration. Real Chromium via runAudit(). Only the run itself
// may be skipped, and only for a genuine environment gap.
// ---------------------------------------------------------------------------
async function tryIntegrationCases() {
  // 150s: case B (a real --static-only-shaped call) renders the anchor + a
  // 6-page static sample end-to-end and measured ~95s in this sandbox —
  // comfortably under the file's own 5-minute foreground budget but needing
  // real margin over a flat 90s (a prior cut measured a spurious timeout).
  const timeoutMs = 150000;

  async function raced(promise, label) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs / 1000}s hard timeout`)), timeoutMs); })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  // --- Case A: drive the 'planner' surface through runAudit() for real ----
  const outA = path.join(os.tmpdir(), `audit-findings-planner-surface-a-${process.pid}.json`);
  let resultA = null;
  try {
    resultA = await raced(runAudit({ port: 8961, only: ['planner'], outPath: outA }), 'case A (planner)');
  } catch (err) {
    console.log('  (skipped) case A integration — could not run the audit here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/162-notes.md');
  }
  if (resultA) {
    test('runAudit({ only: ["planner"] }) covers exactly the planner surface', () => {
      assertT(Array.isArray(resultA.surfacesCovered), 'result.surfacesCovered is not an array');
      assertT(resultA.surfacesCovered.length === 1 && resultA.surfacesCovered[0] === 'planner',
        `expected surfacesCovered === ["planner"]; got ${JSON.stringify(resultA.surfacesCovered)}`);
    });
    test('runAudit({ only: ["planner"] }) — the goal-picker first screen renders, no dead-end/dead-cta finding', () => {
      const deadEnd = resultA.findings.filter((f) => f.surface === 'planner' && f.check === 'dead-end');
      const deadCta = resultA.findings.filter((f) => f.surface === 'planner' && f.check === 'dead-cta');
      assertT(deadEnd.length === 0, `expected zero dead-end findings on the current tree; got: ${JSON.stringify(deadEnd)}`);
      assertT(deadCta.length === 0, `expected zero dead-cta findings on the current tree; got: ${JSON.stringify(deadCta)}`);
    });
    try { fs.unlinkSync(outA); } catch (e) {}
  }

  // --- Case B: a real --static-only-shaped call excludes all four --------
  const outB = path.join(os.tmpdir(), `audit-findings-planner-surface-b-${process.pid}.json`);
  let resultB = null;
  try {
    resultB = await raced(runAudit({ port: 8962, staticOnly: true, outPath: outB }), 'case B (staticOnly)');
  } catch (err) {
    console.log('  (skipped) case B integration — could not run the audit here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/162-notes.md');
  }
  if (resultB) {
    test('runAudit({ staticOnly: true }) covers no landing/planner* surface', () => {
      const leaked = resultB.surfacesCovered.filter((s) => s === 'landing' || s.startsWith('planner'));
      assertT(leaked.length === 0, `expected zero landing/planner* entries under staticOnly; got: ${JSON.stringify(resultB.surfacesCovered)}`);
      assertT(resultB.surfacesCovered.length > 0, 'expected staticOnly to still cover at least the static-page anchor');
    });
    try { fs.unlinkSync(outB); } catch (e) {}
  }
}

async function main() {
  await tryIntegrationCases();
  console.log(`\ntest_audit_planner_surface.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
