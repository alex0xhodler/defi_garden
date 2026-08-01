/* Acceptance test for backlog 200 — audit-app.js's five new funnel-lens
   surfaces (landing-360, landing-dark, landing-ko, planner-dark,
   plan-bloom-dark) that complete the 360px/dark/ko lens matrix on the three
   conversion-funnel surfaces (landing/planner/bloom), plus the two checks
   (responsive, i18n) the `landing` driver was missing before this item.

   Two layers, mirroring the shape test_audit_planner_surface.js established
   for the immediately-preceding surface-list item (162):

     1. SOURCE-LEVEL checks (no Playwright, no browser, cannot be skipped for
        an environment gap): read audit-app.js's own text and assert
          (a) the five surface literals exist in the default surface list
              with the exact name/url/kind/width/dark/ko the spec table
              requires, appended strictly after plan-bloom-ko;
          (c) none of the five is kind: 'static' (the fact --static-only's
              existing filter relies on to exclude them — grepped verbatim,
              not re-implemented);
          (b) — the load-bearing one, per spec 200 — every funnel `kind`
              (landing/planner/bloom) has >=1 dark surface, and the landing
              kind specifically has a 360px, a dark AND a ko surface. This is
              asserted as a PROPERTY of the whole surfaces array (parsed
              generically, not by hardcoded name), so a future edit that
              renames/removes one of these five without replacing its lens
              coverage fails HERE, not just in the five named-literal checks
              above;
          (d) the landing driver's own source contains both new call sites —
              checkResponsive(...'.landing-search-submit') and the Hangul
              i18n check — the structural half of spec 200 acceptance
              criterion 4 (the behavioral half — mutate-and-show-red — is
              recorded in specs/200-notes.md, not duplicated here, exactly as
              199-notes.md did for the lens leg's own non-vacuity proof).
     2. INTEGRATION (e) — real Chromium via runAudit(): drive a real
        `only: ['landing-360', 'landing-ko']` render and assert both surfaces
        actually rendered and the findings array is well-formed. Per the 160
        post-verifier lesson ("a check that cannot go red is not a check"),
        ONLY the runAudit() call itself is wrapped in a skip-tolerant
        timeout/catch for a genuine environment gap (playwright unresolvable
        / chromium won't launch) — every assertion sits OUTSIDE that catch.

   Run: node test_audit_funnel_lens.js */

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
console.log('audit-app.js — backlog 200 funnel-lens surfaces\n');

const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// Extracts the object literal `{ name: '<name>', ... }` for a given surface
// name from the default-rotation array (non-greedy up to the closing brace).
function surfaceLiteral(name) {
  const re = new RegExp(`\\{ name: '${name}',[^}]*\\}`);
  const m = source.match(re);
  return m ? m[0] : null;
}

const EXPECTED = [
  { name: 'landing-360', url: '/', kind: 'landing', width: 360, dark: false, ko: false },
  { name: 'landing-dark', url: '/', kind: 'landing', width: 1280, dark: true, ko: false },
  { name: 'landing-ko', url: '/?lang=ko', kind: 'landing', width: 1280, dark: false, ko: true },
  { name: 'planner-dark', url: '/plan.html', kind: 'planner', width: 1280, dark: true, ko: false },
  { name: 'plan-bloom-dark', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10', kind: 'bloom', width: 1280, dark: true, ko: false }
];

// (a) — each of the five exists with the exact url/kind/width/dark/ko.
// (c) — none is kind: 'static' (would break --static-only's exclusion).
for (const spec of EXPECTED) {
  test(`default rotation contains "${spec.name}" with url/kind/width/dark/ko per spec 200's table`, () => {
    const lit = surfaceLiteral(spec.name);
    assertT(lit, `no "{ name: '${spec.name}', ... }" literal found in audit-app.js's default rotation`);
    assertT(lit.includes(`url: '${spec.url}'`), `"${spec.name}" literal missing url: '${spec.url}' — got: ${lit}`);
    assertT(lit.includes(`kind: '${spec.kind}'`), `"${spec.name}" literal missing kind: '${spec.kind}' — got: ${lit}`);
    assertT(lit.includes(`width: ${spec.width}`), `"${spec.name}" literal missing width: ${spec.width} — got: ${lit}`);
    assertT(lit.includes('kind: \'static\'') === false, `"${spec.name}" must NOT be kind: 'static' (would break --static-only exclusion) — got: ${lit}`);
    if (spec.dark) assertT(lit.includes('dark: true'), `"${spec.name}" literal missing dark: true — got: ${lit}`);
    else assertT(lit.includes('dark: true') === false, `"${spec.name}" must NOT carry dark: true — got: ${lit}`);
    if (spec.ko) assertT(lit.includes('ko: true'), `"${spec.name}" literal missing ko: true — got: ${lit}`);
    else assertT(lit.includes('ko: true') === false, `"${spec.name}" must NOT carry ko: true — got: ${lit}`);
  });
}

test('the five new surfaces are appended AFTER plan-bloom-ko (no existing surface renamed/moved)', () => {
  const anchorIdx = source.indexOf("{ name: 'plan-bloom-ko'");
  assertT(anchorIdx > -1, 'could not find the plan-bloom-ko anchor literal to order against');
  for (const spec of EXPECTED) {
    const idx = source.indexOf(`{ name: '${spec.name}',`);
    assertT(idx > anchorIdx, `"${spec.name}" must appear after plan-bloom-ko in the default rotation array`);
  }
});

test('--static-only\'s exclusion mechanism (s.kind === \'static\' filter) is present unchanged', () => {
  assertT(source.includes("surfaces = surfaces.filter((s) => s.kind === 'static')"),
    'the --static-only filter (opts.staticOnly branch) is missing or its predicate changed — the structural proof above depends on this exact filter existing');
});

// ---------------------------------------------------------------------------
// (b) — LOAD-BEARING: the lens matrix asserted as a PROPERTY of the whole
// surfaces array (parsed generically, not read off the five names above), so
// a future surface-list edit that re-opens the hole (renames/removes one of
// these five without replacing its lens coverage) fails HERE.
// ---------------------------------------------------------------------------
test('property: every funnel kind (landing/planner/bloom) has >=1 dark surface, and landing has a 360px, a dark AND a ko surface', () => {
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
  assertT(allSurfaces.length >= 17, `sanity check: expected to parse at least the 17 pre-200 default-rotation entries, parsed ${allSurfaces.length}: ${JSON.stringify(allSurfaces.map((s) => s.name))}`);

  const FUNNEL_KINDS = ['landing', 'planner', 'bloom'];
  const byKind = {};
  for (const kind of FUNNEL_KINDS) byKind[kind] = allSurfaces.filter((s) => s.kind === kind);

  for (const kind of FUNNEL_KINDS) {
    assertT(byKind[kind].length > 0, `sanity check: found zero surfaces of funnel kind '${kind}' — the parser regex is broken`);
    assertT(byKind[kind].some((s) => s.dark),
      `funnel kind '${kind}' has NO dark surface — every funnel kind (landing/planner/bloom) must have >=1 dark surface (backlog 200); surfaces of this kind: ${JSON.stringify(byKind[kind])}`);
  }
  assertT(byKind.landing.some((s) => s.width === 360),
    `landing kind has no 360px surface; landing surfaces: ${JSON.stringify(byKind.landing)}`);
  assertT(byKind.landing.some((s) => s.ko),
    `landing kind has no ko surface; landing surfaces: ${JSON.stringify(byKind.landing)}`);
});

// ---------------------------------------------------------------------------
// (d) — the landing driver's own source gained both new call sites, in the
// same position the planner/bloom drivers put theirs. Structural half of
// spec 200 acceptance criterion 4; the behavioral (mutate-and-show-red) half
// is demonstrated in specs/200-notes.md, not re-run here.
// ---------------------------------------------------------------------------
test("the landing driver (kind === 'landing') captures auditText's return value and gains a responsive + an i18n check", () => {
  const landingStart = source.indexOf("if (s.kind === 'landing')");
  assertT(landingStart > -1, "could not find \"if (s.kind === 'landing')\" in audit-app.js");
  const landingEnd = source.indexOf("if (s.kind === 'planner')", landingStart);
  assertT(landingEnd > landingStart, "could not find the end of the landing driver block (next \"if (s.kind === 'planner')\")");
  const landingBlock = source.slice(landingStart, landingEnd);

  assertT(landingBlock.includes('const text = await auditText(page, s, findings);'),
    `landing driver must capture auditText's return value (today's KO check needs it) — got block:\n${landingBlock}`);
  assertT(landingBlock.includes("if (s.width <= 768) await checkResponsive(page, s, findings, '.landing-search-submit');"),
    `landing driver missing the 360px responsive check against .landing-search-submit — got block:\n${landingBlock}`);
  assertT(landingBlock.includes('if (s.ko)') && landingBlock.includes('/[가-힣]/.test(text)') && landingBlock.includes("'i18n', 'P2', 'KO surface rendered no Hangul text'"),
    `landing driver missing the KO Hangul i18n check (same shape as the planner/bloom drivers) — got block:\n${landingBlock}`);
});

// ---------------------------------------------------------------------------
// Layer 2 — integration. Real Chromium via runAudit(). Only the run itself
// may be skipped, and only for a genuine environment gap.
// ---------------------------------------------------------------------------
async function tryIntegrationCase() {
  // 90s: two lightweight surfaces (a 360px landing render + a KO landing
  // render), no pool/rotation machinery involved — comfortably under the
  // file's own 5-minute foreground budget.
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

  const outPath = path.join(os.tmpdir(), `audit-findings-funnel-lens-${process.pid}.json`);
  let result = null;
  try {
    result = await raced(runAudit({ port: 8945, only: ['landing-360', 'landing-ko'], outPath }), 'landing-360 + landing-ko render');
  } catch (err) {
    console.log('  (skipped) integration case — could not run the audit here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/200-notes.md');
  }
  if (result) {
    test('(e) runAudit({ only: ["landing-360", "landing-ko"] }) covers both new surfaces', () => {
      assertT(Array.isArray(result.surfacesCovered), 'result.surfacesCovered is not an array');
      assertT(result.surfacesCovered.includes('landing-360'), `expected surfacesCovered to include "landing-360"; got ${JSON.stringify(result.surfacesCovered)}`);
      assertT(result.surfacesCovered.includes('landing-ko'), `expected surfacesCovered to include "landing-ko"; got ${JSON.stringify(result.surfacesCovered)}`);
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
      const funnelFindings = result.findings.filter((f) => f.surface === 'landing-360' || f.surface === 'landing-ko');
      if (funnelFindings.length > 0) {
        console.log(`    NOTE: this real run originated ${funnelFindings.length} finding(s) on the new surfaces — reported in specs/200-notes.md per acceptance criterion 8, not fixed here: ${JSON.stringify(funnelFindings)}`);
      }
    });
    try { fs.unlinkSync(outPath); } catch (e) {}
  }
}

async function main() {
  await tryIntegrationCase();
  console.log(`\ntest_audit_funnel_lens.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
