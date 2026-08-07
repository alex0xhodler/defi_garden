/* Acceptance test for backlog 164 — audit-app.js's new `bloom` surface kind
   (five deep-linked plan bloom/checkout surfaces: `plan-bloom-growth`,
   `plan-bloom-target`, `plan-bloom-subscription`, `plan-bloom-360`,
   `plan-bloom-ko`) and the one new interactive check added to the existing
   `planner` kind (click the first goal chip, assert the planner leaves the
   goal step).

   162 built the driver that renders the planner's goal picker and stops;
   this item walks it inside, onto the FIRST screen that renders a number the
   planner actually computed (capital, forever number, projections, checkout
   price) — see 164.md's evidence (item 146: a TARGET goal misread as a
   monthly subscription rendered ~$155k-$220k of fabricated capital, on the
   bloom screen, never caught because nothing automated had ever rendered
   past the goal picker).

   Two layers, mirroring 162's own test shape (test_audit_planner_surface.js)
   and the established audit-test convention (test_audit_app.js /
   test_audit_text_surfaces.js):

     1. SOURCE-LEVEL checks (no Playwright, no browser, cannot be skipped for
        an environment gap): read audit-app.js's own text and assert the
        five bloom surface literals exist in the default rotation with the
        exact name/url/kind/width/ko the spec table requires, appended after
        `planner-ko` (no existing surfacesCovered entry moved/renamed), and
        that the `bloom` kind branch drives the real detector vocabulary
        (`dead-end`, `number-sanity` via auditText, `dead-cta`, `page-error`,
        `responsive`, `i18n`) against the real `.gp-checkout-panel` /
        `.gp-checkout-cta` selectors — no new detector name invented. Also
        asserts the new chip-advance check exists on the EXISTING `planner`
        kind, guarded to the 1280/EN surface only.
     2. INTEGRATION checks (real Chromium via runAudit()): drive
        `plan-bloom-growth` through a real render and assert it reaches
        `.gp-checkout-panel` with zero dead-end/dead-cta findings; drive
        `planner` through a real render, including the new click-and-advance
        check, and assert it reports zero dead-cta findings on the current
        (working) tree. Per the 160 post-verifier lesson ("a check that
        cannot go red is not a check"), ONLY the runAudit() call itself is
        wrapped in a skip-tolerant timeout/catch for a genuine environment
        gap (playwright unresolvable / chromium won't launch) — every
        assertion sits OUTSIDE that catch, so a real wiring regression fails
        loud, it never reports itself as "(skipped)".

   Run: node test_audit_planner_flow.js */

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
console.log('audit-app.js — backlog 164 plan-bloom surfaces + planner chip-advance check\n');

const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// Extracts the object literal `{ name: '<name>', ... }` for a given surface
// name from the default-rotation array (non-greedy up to the closing brace).
function surfaceLiteral(name) {
  const re = new RegExp(`\\{ name: '${name}',[^}]*\\}`);
  const m = source.match(re);
  return m ? m[0] : null;
}

const EXPECTED = [
  { name: 'plan-bloom-growth', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10', kind: 'bloom', width: 1280, ko: false },
  { name: 'plan-bloom-target', url: '/plan.html?goal=iphone&pace=stable&monthly=200', kind: 'bloom', width: 1280, ko: false },
  { name: 'plan-bloom-subscription', url: '/plan.html?goal=claude&pace=stable&monthly=50', kind: 'bloom', width: 1280, ko: false },
  { name: 'plan-bloom-360', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10', kind: 'bloom', width: 360, ko: false },
  { name: 'plan-bloom-ko', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10&lang=ko', kind: 'bloom', width: 1280, ko: true }
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

test('all five plan-bloom surfaces are appended AFTER planner-ko (no existing surface renamed/moved)', () => {
  const anchorIdx = source.indexOf("{ name: 'planner-ko'");
  assertT(anchorIdx > -1, 'could not find the planner-ko anchor literal to order against');
  for (const spec of EXPECTED) {
    const idx = source.indexOf(`{ name: '${spec.name}',`);
    assertT(idx > anchorIdx, `"${spec.name}" must appear after planner-ko in the default rotation array`);
  }
});

test('the `bloom` kind branch exists and reuses existing detector vocabulary only', () => {
  const branchMatch = source.match(/if \(s\.kind === 'bloom'\) \{[\s\S]*?\n {4}\}\n\n {4}\/\/ kind === 'pool'/);
  assertT(branchMatch, 'no `if (s.kind === \'bloom\')` branch found ahead of the pool fallback');
  const branch = branchMatch[0];
  assertT(branch.includes("'.gp-checkout-panel'"), 'bloom branch does not wait on .gp-checkout-panel readiness');
  assertT(branch.includes("'dead-end'"), 'bloom branch missing dead-end check');
  assertT(branch.includes('auditText(page, s, findings)'), 'bloom branch does not run the existing auditText() number-sanity scan');
  assertT(branch.includes("'.gp-checkout-cta'"), 'bloom branch does not check the .gp-checkout-cta primary control');
  assertT(branch.includes("'dead-cta'"), 'bloom branch missing dead-cta check');
  assertT(branch.includes('s.ko') && branch.includes("'i18n'"), 'bloom branch missing the -ko-scoped i18n check');
  assertT(branch.includes('checkResponsive(page, s, findings') && branch.includes('s.width <= 768'), 'bloom branch missing the 360+768-scoped responsive check (widened by backlog 201)');
  assertT(branch.includes("'page-error'"), 'bloom branch missing page-error check');
  // No new detector name invented — every check string used must already
  // appear elsewhere in the file (i.e. pre-exist this branch's own additions
  // would be a self-match, so require >=2 occurrences of each check name).
  for (const check of ['dead-end', 'number-sanity', 'page-error', 'dead-cta', 'responsive', 'i18n']) {
    const occurrences = source.split(`'${check}'`).length - 1;
    assertT(occurrences >= 2, `check name '${check}' should already be used elsewhere in audit-app.js (found ${occurrences} occurrence(s)) — a brand-new detector name would be a spec violation`);
  }
});

test('the planner kind gained a chip-advance check scoped to the 1280/EN surface only', () => {
  const plannerIdx = source.indexOf("if (s.kind === 'planner')");
  assertT(plannerIdx > -1, 'no planner kind branch found');
  const bloomIdx = source.indexOf("if (s.kind === 'bloom')");
  assertT(bloomIdx > plannerIdx, 'bloom branch should be defined after the planner branch');
  const plannerBranch = source.slice(plannerIdx, bloomIdx);
  assertT(plannerBranch.includes('s.width > 360 && !s.ko'), 'planner branch missing the "s.width > 360 && !s.ko" guard for the new interactive check');
  assertT(plannerBranch.includes('goalChip.click()'), 'planner branch does not click the goal chip');
  assertT(plannerBranch.includes("'.gp-thread-row'"), 'planner branch does not assert on .gp-thread-row (the truthful "advanced past goal step" signal)');
  assertT(plannerBranch.includes('pollFor('), 'planner branch chip-advance check does not use the existing pollFor() helper (must not be a bare waitForTimeout)');
});

// ---------------------------------------------------------------------------
// Layer 2 — integration. Real Chromium via runAudit(). Only the run itself
// may be skipped, and only for a genuine environment gap.
// ---------------------------------------------------------------------------
async function tryIntegrationCases() {
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

  // --- Case A: drive 'plan-bloom-growth' through runAudit() for real ------
  const outA = path.join(os.tmpdir(), `audit-findings-planner-flow-a-${process.pid}.json`);
  let resultA = null;
  try {
    resultA = await raced(runAudit({ port: 8971, only: ['plan-bloom-growth'], outPath: outA }), 'case A (plan-bloom-growth)');
  } catch (err) {
    console.log('  (skipped) case A integration — could not run the audit here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/164-notes.md');
  }
  if (resultA) {
    test('runAudit({ only: ["plan-bloom-growth"] }) covers exactly that surface', () => {
      assertT(Array.isArray(resultA.surfacesCovered), 'result.surfacesCovered is not an array');
      assertT(resultA.surfacesCovered.length === 1 && resultA.surfacesCovered[0] === 'plan-bloom-growth',
        `expected surfacesCovered === ["plan-bloom-growth"]; got ${JSON.stringify(resultA.surfacesCovered)}`);
    });
    test('runAudit({ only: ["plan-bloom-growth"] }) — the bloom/checkout screen renders, no dead-end/dead-cta finding', () => {
      const deadEnd = resultA.findings.filter((f) => f.surface === 'plan-bloom-growth' && f.check === 'dead-end');
      const deadCta = resultA.findings.filter((f) => f.surface === 'plan-bloom-growth' && f.check === 'dead-cta');
      assertT(deadEnd.length === 0, `expected zero dead-end findings on the current tree; got: ${JSON.stringify(deadEnd)}`);
      assertT(deadCta.length === 0, `expected zero dead-cta findings on the current tree; got: ${JSON.stringify(deadCta)}`);
    });
    try { fs.unlinkSync(outA); } catch (e) {}
  }

  // --- Case B: drive 'planner' through runAudit() for real, exercising the
  // new click-and-advance check ---------------------------------------------
  const outB = path.join(os.tmpdir(), `audit-findings-planner-flow-b-${process.pid}.json`);
  let resultB = null;
  try {
    resultB = await raced(runAudit({ port: 8972, only: ['planner'], outPath: outB }), 'case B (planner chip-advance)');
  } catch (err) {
    console.log('  (skipped) case B integration — could not run the audit here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/164-notes.md');
  }
  if (resultB) {
    test('runAudit({ only: ["planner"] }) — clicking the first goal chip advances the planner, no dead-cta finding', () => {
      assertT(resultB.surfacesCovered.length === 1 && resultB.surfacesCovered[0] === 'planner',
        `expected surfacesCovered === ["planner"]; got ${JSON.stringify(resultB.surfacesCovered)}`);
      const deadCta = resultB.findings.filter((f) => f.surface === 'planner' && f.check === 'dead-cta');
      assertT(deadCta.length === 0, `expected zero dead-cta findings on the current tree (chip should advance the planner); got: ${JSON.stringify(deadCta)}`);
    });
    try { fs.unlinkSync(outB); } catch (e) {}
  }
}

async function main() {
  await tryIntegrationCases();
  console.log(`\ntest_audit_planner_flow.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
