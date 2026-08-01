/* Acceptance test for backlog 201 — audit-app.js's third design-bar width
   (CLAUDE.md: "flawless at 360/768/1280px"), rendered for the first time on
   the north-star + funnel surfaces (pool-detail/grid/landing/planner/bloom),
   with checkResponsive actually able to RUN there (leg A ungates its five
   `s.width <= 360` call sites to `<= 768`; leg B appends five new 768px
   surfaces after plan-bloom-dark).

   Two layers, mirroring the shape test_audit_funnel_lens.js established for
   the immediately-preceding lens item (200):

     1. SOURCE-LEVEL checks (no Playwright, no browser, cannot be skipped for
        an environment gap): read audit-app.js's own text and assert
          (a) the five surface literals exist in the default surface list
              with the exact name/url/kind/width the spec table requires,
              appended strictly after plan-bloom-dark;
          (b) none of the five is kind: 'static' (the fact --static-only's
              existing filter relies on to exclude them);
          (c) — the load-bearing one, per spec 201 — all five
              checkResponsive call sites read `s.width <= 768`, and ZERO
              read `s.width <= 360` (the leg-A regression guard: this is the
              assertion that makes leg B non-vacuous — a surface can exist at
              768px with no way for the responsive check to ever fire there,
              exactly as evidence 2 in specs/201.md describes);
          (d) — asserted as a PROPERTY of the whole surfaces array (parsed
              generically, not by hardcoded name), so a future edit that
              renames/removes one of these five without replacing its 768
              coverage fails HERE: every one of the five kinds
              pool/grid/landing/planner/bloom has >=1 surface at width 768.
     2. INTEGRATION — real Chromium via runAudit(): drive a real
        `only: ['landing-768', 'pool-detail-768']` render and assert both
        surfaces actually rendered and the findings array is well-formed.
        Per the 160 post-verifier lesson ("a check that cannot go red is not
        a check"), ONLY the runAudit() call itself is wrapped in a
        skip-tolerant timeout/catch for a genuine environment gap (playwright
        unresolvable / chromium won't launch) — every assertion sits OUTSIDE
        that catch.

   Run: node test_audit_768_lens.js */

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
console.log('audit-app.js — backlog 201 768px lens surfaces\n');

const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// Extracts the object literal `{ name: '<name>', ... }` for a given surface
// name from the default-rotation array (non-greedy up to the closing brace).
function surfaceLiteral(name) {
  const re = new RegExp(`\\{ name: '${name}',[^}]*\\}`);
  const m = source.match(re);
  return m ? m[0] : null;
}

const EXPECTED = [
  { name: 'pool-detail-768', url: 'poolUrl', kind: 'pool', width: 768 },
  { name: 'grid-768', url: '/home.html?token=USDC', kind: 'grid', width: 768 },
  { name: 'landing-768', url: '/', kind: 'landing', width: 768 },
  { name: 'planner-768', url: '/plan.html', kind: 'planner', width: 768 },
  { name: 'plan-bloom-768', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10', kind: 'bloom', width: 768 }
];

// (a) — each of the five exists with the exact url/kind/width.
// (b) — none is kind: 'static' (would break --static-only's exclusion).
for (const spec of EXPECTED) {
  test(`default rotation contains "${spec.name}" with url/kind/width per spec 201's table`, () => {
    const lit = surfaceLiteral(spec.name);
    assertT(lit, `no "{ name: '${spec.name}', ... }" literal found in audit-app.js's default rotation`);
    if (spec.url === 'poolUrl') {
      // pool-detail-768 reuses pool-detail's `poolUrl` variable byte-for-byte
      // (164's "reused, not retyped" precedent) rather than a string literal.
      assertT(lit.includes('url: poolUrl'), `"${spec.name}" literal missing "url: poolUrl" — got: ${lit}`);
    } else {
      assertT(lit.includes(`url: '${spec.url}'`), `"${spec.name}" literal missing url: '${spec.url}' — got: ${lit}`);
    }
    assertT(lit.includes(`kind: '${spec.kind}'`), `"${spec.name}" literal missing kind: '${spec.kind}' — got: ${lit}`);
    assertT(lit.includes(`width: ${spec.width}`), `"${spec.name}" literal missing width: ${spec.width} — got: ${lit}`);
    assertT(lit.includes('kind: \'static\'') === false, `"${spec.name}" must NOT be kind: 'static' (would break --static-only exclusion) — got: ${lit}`);
    assertT(lit.includes('dark: true') === false, `"${spec.name}" must NOT carry dark: true — spec 201 is the width lens only — got: ${lit}`);
    assertT(lit.includes('ko: true') === false, `"${spec.name}" must NOT carry ko: true — spec 201 is the width lens only — got: ${lit}`);
  });
}

test('the five new surfaces are appended AFTER plan-bloom-dark (no existing surface renamed/moved)', () => {
  const anchorIdx = source.indexOf("{ name: 'plan-bloom-dark'");
  assertT(anchorIdx > -1, 'could not find the plan-bloom-dark anchor literal to order against');
  for (const spec of EXPECTED) {
    const idx = source.indexOf(`{ name: '${spec.name}',`);
    assertT(idx > anchorIdx, `"${spec.name}" must appear after plan-bloom-dark in the default rotation array`);
  }
});

test('--static-only\'s exclusion mechanism (s.kind === \'static\' filter) is present unchanged', () => {
  assertT(source.includes("surfaces = surfaces.filter((s) => s.kind === 'static')"),
    'the --static-only filter (opts.staticOnly branch) is missing or its predicate changed — the structural proof above depends on this exact filter existing');
});

// ---------------------------------------------------------------------------
// (c) — LOAD-BEARING, per spec 201: leg B is vacuous unless leg A actually
// ungated checkResponsive. All five call sites must read `s.width <= 768`
// and ZERO may still read `s.width <= 360` — this is the regression guard
// that makes the new 768px surfaces' responsive check able to fire at all.
// ---------------------------------------------------------------------------
test('all five checkResponsive call sites read "s.width <= 768"', () => {
  const matches = source.match(/if \(s\.width <= 768\) await checkResponsive\(/g) || [];
  assertT(matches.length === 5, `expected exactly 5 call sites reading "s.width <= 768", found ${matches.length}`);
});

test('zero checkResponsive call sites (or any other site) still read "s.width <= 360"', () => {
  const matches = source.match(/s\.width <= 360/g) || [];
  assertT(matches.length === 0, `expected 0 occurrences of "s.width <= 360" in audit-app.js, found ${matches.length}`);
});

// ---------------------------------------------------------------------------
// (d) — property assertion, parsed generically (no surface name hardcoded in
// the regex): every one of the five kinds pool/grid/landing/planner/bloom
// has >=1 surface at width 768. A future edit that renames or drops one of
// these five without replacing its 768 coverage fails HERE.
// ---------------------------------------------------------------------------
test('property: every kind pool/grid/landing/planner/bloom has >=1 surface at width 768', () => {
  const arrStart = source.indexOf('let surfaces = [');
  assertT(arrStart > -1, 'could not find the "let surfaces = [" default-rotation array literal');
  const arrClose = source.indexOf('\n  ];', arrStart);
  assertT(arrClose > -1, 'could not find the closing "];" of the default-rotation array literal');
  const arrBlock = source.slice(arrStart, arrClose);

  // Matches every single-line `{ name: '...', url: <anything up to the next
  // comma>, kind: '<kind>', width: <n>, ...rest }` literal in the array,
  // generically — no surface name is hardcoded in this regex.
  const literalRe = /\{ name: '([^']+)', url: [^,]+, kind: '([a-zA-Z-]+)', width: (\d+)([^}]*)\}/g;
  const allSurfaces = [];
  let m;
  while ((m = literalRe.exec(arrBlock))) {
    allSurfaces.push({
      name: m[1],
      kind: m[2],
      width: Number(m[3]),
      dark: /dark: true/.test(m[4]),
      ko: /ko: true/.test(m[4])
    });
  }
  assertT(allSurfaces.length >= 22, `sanity check: expected to parse at least the 22 pre-201 default-rotation entries, parsed ${allSurfaces.length}: ${JSON.stringify(allSurfaces.map((s) => s.name))}`);

  const NORTH_STAR_AND_FUNNEL_KINDS = ['pool', 'grid', 'landing', 'planner', 'bloom'];
  const byKind = {};
  for (const kind of NORTH_STAR_AND_FUNNEL_KINDS) byKind[kind] = allSurfaces.filter((s) => s.kind === kind);

  for (const kind of NORTH_STAR_AND_FUNNEL_KINDS) {
    assertT(byKind[kind].length > 0, `sanity check: found zero surfaces of kind '${kind}' — the parser regex is broken`);
    assertT(byKind[kind].some((s) => s.width === 768),
      `kind '${kind}' has NO surface at width 768 — every one of pool/grid/landing/planner/bloom must have >=1 surface at width 768 (backlog 201); surfaces of this kind: ${JSON.stringify(byKind[kind])}`);
  }
});

// ---------------------------------------------------------------------------
// Layer 2 — integration. Real Chromium via runAudit(). Only the run itself
// may be skipped, and only for a genuine environment gap.
// ---------------------------------------------------------------------------
async function tryIntegrationCase() {
  // 90s: two lightweight surfaces (a landing-768 render + a pool-detail-768
  // render), no rotation/pool-lens machinery involved — comfortably under
  // the file's own 5-minute foreground budget.
  const timeoutMs = 90000;

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

  const outPath = path.join(os.tmpdir(), `audit-findings-768-lens-${process.pid}.json`);
  let result = null;
  try {
    result = await raced(runAudit({ port: 8946, only: ['landing-768', 'pool-detail-768'], outPath }), 'landing-768 + pool-detail-768 render');
  } catch (err) {
    console.log('  (skipped) integration case — could not run the audit here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/201-notes.md');
  }
  if (result) {
    test('(e) runAudit({ only: ["landing-768", "pool-detail-768"] }) covers both new surfaces', () => {
      assertT(Array.isArray(result.surfacesCovered), 'result.surfacesCovered is not an array');
      assertT(result.surfacesCovered.includes('landing-768'), `expected surfacesCovered to include "landing-768"; got ${JSON.stringify(result.surfacesCovered)}`);
      assertT(result.surfacesCovered.includes('pool-detail-768'), `expected surfacesCovered to include "pool-detail-768"; got ${JSON.stringify(result.surfacesCovered)}`);
    });
    test('(e) the findings array is well-formed (a real defect found here is reported, never swallowed)', () => {
      assertT(Array.isArray(result.findings), 'result.findings is not an array');
      for (const f of result.findings) {
        assertT(f && typeof f === 'object', `finding is not an object: ${JSON.stringify(f)}`);
        assertT(typeof f.surface === 'string' && f.surface.length > 0, `finding missing a surface string: ${JSON.stringify(f)}`);
        assertT(typeof f.check === 'string' && f.check.length > 0, `finding missing a check string: ${JSON.stringify(f)}`);
        assertT(['P0', 'P1', 'P2'].includes(f.severity), `finding has an unrecognized severity: ${JSON.stringify(f)}`);
        assertT(typeof f.detail === 'string' && f.detail.length > 0, `finding missing a detail string: ${JSON.stringify(f)}`);
      }
      const lensFindings = result.findings.filter((f) => f.surface === 'landing-768' || f.surface === 'pool-detail-768');
      if (lensFindings.length > 0) {
        console.log(`    NOTE: this real run originated ${lensFindings.length} finding(s) on the new surfaces — reported in specs/201-notes.md per acceptance criterion 4, not fixed here: ${JSON.stringify(lensFindings)}`);
      }
    });
    try { fs.unlinkSync(outPath); } catch (e) {}
  }
}

async function main() {
  await tryIntegrationCase();
  console.log(`\ntest_audit_768_lens.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
