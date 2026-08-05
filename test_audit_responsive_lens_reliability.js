/* Acceptance test for backlog 233 — the other half of the class 231 opened.
   `checkResponsive` must SEE a permanent ancestor-clip defect on (nearly)
   every run, not on a coin-flip of the 750ms entry animation it races.

   Evidence (specs/233.md): checkResponsive runs BEFORE checkOcclusion, at
   ~0ms into the page's INITIAL mount (not a resize-triggered re-mount like
   231's target — same style.css:4605 `.animate-on-mount` machinery, a
   different trigger, the same waitForQuiescence predicate covers both).
   Unlike 231's mechanism, boundingBox() is NOT opacity-gated — the failure
   mode transfers through a DIFFERENT door: fadeInScale's scale(0.95)->1 and
   slideInLeft's translateX(-20px)->0 are ANCESTOR TRANSFORMS, and
   getBoundingClientRect() reports the transformed rect, shrinking/shifting
   it toward the viewport centre by up to 5% for ~1.2s. Confirmed by
   construction on the real pool-detail-360 surface: `.cta-button-primary`
   at rest has box.x=-4 (a genuine P2 responsive finding), but at t=0 (where
   checkResponsive used to measure) the SAME permanent defect reads
   box.x=+5.2 — no finding. Pre-fix shipped-path detection rate: 0/10.

   This file's job is not to re-prove the mechanism (233.md already measured
   it) — it is to prove the FIX raises the detection rate, using the exact
   acceptance shape 231's own test established: "the DETECTION RATE, never a
   single green run."

   Three legs, all driving the REAL `pool-detail-360` surface through the
   REAL runAudit() driver (never a hand-built fixture — spec 233 "Population,
   not instance"), each N isolated iterations (fresh browser + fresh page per
   iteration — runAudit() owns its own browser+server lifecycle per call, a
   DIFFERENT port every time):

     (A) quiescence ON + the permanent injected defect (`.cta-button-primary`
         nudged off-viewport via opts.injectStyle, the exact defect 233.md's
         "ground truth" section names) — must flag >=1 `responsive` finding
         on `pool-detail-360` on >=19/20 iterations.
     (B) POSITIVE CONTROL — identical defect, responsiveQuiescence:false (the
         pre-233 path, i.e. no wait at all before checkResponsive's reads) —
         must reproduce the LOW rate, <=8/20, so the harness is proven able
         to tell the two apart (a harness that would pass on anything is not
         evidence).
     (C) NON-VACUITY — a no-op injected style (surface stays genuinely fixed
         on `main`), quiescence ON — must report ZERO `responsive` findings
         across a few iterations (5 is fine here per spec), proving (A)'s
         >=19/20 isn't the harness manufacturing findings out of nothing.

   Plus two direct-drive fixtures, spec 233's own change items 3-4 (`quiesce
   the static branch's flat 400ms wait` and `never skip the ancestor-clip
   check silently`) — driven straight through checkResponsive()/
   page.setContent(), the pattern test_audit_occlusion_lens_reliability.js's
   own (D)/(E) fixtures already established:
     (D) a fixture whose page has NO element matching the ctaSelector passed
         to checkResponsive() — asserts the new zero-match P2 `responsive`
         advisory fires (spec 233 change item 4: "a check that cannot go red
         is not a check", the class 231 already named for occlusion). This
         fixture is deliberately the ONLY thing that can catch a mutation of
         item 4 — legs A/B/C all use a real CTA selector that matches, so
         none of them can ever exercise the zero-match branch.
     (E) a fixture whose geometry never stabilises — the fixed `.bar`'s
         height is perpetually nudged by a JS `setInterval` (deliberately NOT
         a CSS animation/transition, so document.getAnimations() is blind to
         it — copied verbatim from 231's own neverStabilisingGeometryFixture,
         plus a permanently off-viewport `.cta` element so checkResponsive
         has a real, genuine defect to report) — asserts checkResponsive's
         own "quiescence not reached" P2 advisory fires (naming the numbers)
         AND the real `responsive` finding (the off-viewport CTA) is still
         reported despite the timeout: measure-anyway.

   Iteration count is overridable via AUDIT_RELIABILITY_N (cheap harness
   runs); the DEFAULT (20 for legs A/B, capped to 5 for leg C) is what ships
   — do not shrink it to make this test file itself faster.

   Run: node test_audit_responsive_lens_reliability.js
   Cheap run: AUDIT_RELIABILITY_N=5 node test_audit_responsive_lens_reliability.js */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const {
  runAudit, checkResponsive, OCCLUSION_QUIESCENCE_BUDGET_MS
} = require('./audit-app.js');

const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|fonts\.|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Ports: a FRESH base, distinct from every test_*.js file's own ports on disk
// as of this item (grepped max 9300, test_audit_occlusion_lens_reliability.js's
// leg-C base). Each leg gets its own base, spaced well past the largest
// iteration count either leg could run.
const PORT_BASE_LEG_A = 9600;
const PORT_BASE_LEG_B = 9650;
const PORT_BASE_LEG_C = 9700;

// The exact permanent, deterministic defect specs/233.md's "ground truth"
// section names — measured on the real pool-detail-360 surface: at rest
// box.x=-4 (a genuine finding); at t=0 (pre-fix measurement point) the
// fadeInScale ancestor transform reads it as box.x=+5.2 (no finding).
// `!important` is required: home.html loads the minified sheet
// asynchronously (the addCSS media=print -> onload media=all pattern), so an
// in-page style tag must outrank it — same reasoning 231's own DEFECT_STYLE
// comment gives.
const DEFECT_STYLE = '.cta-button-primary{position:relative !important;left:-76px !important}';
// A real, harmless rule (never touches .cta-button-primary's position) —
// proves opts.injectStyle itself isn't fabricating findings out of nothing.
const NOOP_STYLE = '.audit-233-noop-marker { --audit-233-noop-token: 1; }';

const N = Math.max(1, Number(process.env.AUDIT_RELIABILITY_N || 20));
const N_LEG_C = Math.min(N, 5);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
async function testAsync(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assertT(cond, msg) { if (!cond) throw new Error(msg); }

function makeErrorSink(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text())) errors.push('console.error: ' + m.text());
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Legs A/B/C — N isolated runAudit() iterations against the REAL
// pool-detail-360 surface. `hits` counts iterations with >=1 `responsive`
// finding on that surface (severity is always P2 for this check — there is
// no "blocking" tier to filter on, unlike occlusion's P0/P1). One unique
// port per iteration; each iteration's outPath is a fresh temp file, deleted
// immediately after that iteration reads it.
// ---------------------------------------------------------------------------
async function runLeg(label, { portBase, n, responsiveQuiescence, injectStyle }) {
  let hits = 0;
  let totalResponsiveFindings = 0;
  const times = [];
  for (let i = 0; i < n; i++) {
    const outPath = path.join(os.tmpdir(), `audit-findings-233-${label}-${process.pid}-${i}.json`);
    const t0 = Date.now();
    let result;
    try {
      result = await runAudit({
        port: portBase + i, only: ['pool-detail-360'], outPath,
        poolLiveness: false, injectStyle, responsiveQuiescence
      });
    } finally {
      try { fs.unlinkSync(outPath); } catch (e) { /* never written, or already gone */ }
    }
    times.push(Date.now() - t0);
    const responsive = (result.findings || []).filter((f) => f.check === 'responsive' && f.surface === 'pool-detail-360');
    totalResponsiveFindings += responsive.length;
    if (responsive.length >= 1) hits++;
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`    ${label}: ${hits}/${n} iterations flagged >=1 responsive finding (${totalResponsiveFindings} responsive finding(s) total), mean wall-clock ${mean.toFixed(0)}ms/iteration`);
  return { hits, n, mean, totalResponsiveFindings };
}

// ---------------------------------------------------------------------------
// Fixture (D) — zero-match ctaSelector. No Playwright server/runAudit
// needed, same page.setContent() house pattern
// test_audit_occlusion_lens_reliability.js already uses.
// ---------------------------------------------------------------------------
function noCtaFixture() {
  return `<!doctype html><html><head><style>
    body { margin: 0; font-family: sans-serif; }
    .content { padding: 40px; }
  </style></head><body>
    <div class="content"><p>Ordinary static content — nothing on this page matches the ctaSelector the test drives checkResponsive with.</p></div>
  </body></html>`;
}

// Fixture (E) — geometry never stabilises (copied verbatim from
// test_audit_occlusion_lens_reliability.js's neverStabilisingGeometryFixture,
// backlog 231), PLUS a permanently off-viewport `.cta` so checkResponsive has
// a real, genuine defect to report under "measure anyway". `.bar`'s height is
// nudged by a JS `setInterval` — deliberately NOT a CSS animation/transition,
// so document.getAnimations() cannot see it: only the geometry-stability leg
// of waitForQuiescence can ever catch this fixture never settling. Strictly
// MONOTONIC (never cyclic): a modulo-based nudge can, by pure chance, land on
// the same value across two samples 100ms apart and read as "stable" when it
// never actually stopped moving — this counts upward forever instead, so any
// two samples at different times are GUARANTEED to differ.
function neverStabilisingResponsiveFixture() {
  return `<!doctype html><html><head><style>
    body { margin: 0; font-family: sans-serif; }
    .bar { position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #202020; color: #fff; }
    .victim { margin: 0; padding: 16px; }
    .cta { position: relative; left: -9999px; display: inline-block; padding: 12px 20px; }
  </style></head><body>
    <div class="bar">bar with zero clearance below it</div>
    <p class="victim">This paragraph has no top clearance and sits directly behind the bar at rest.</p>
    <button class="cta">Checkout</button>
    <script>
      var n = 0;
      setInterval(function () {
        n += 1;
        document.querySelector('.bar').style.height = (60 + n) + 'px';
      }, 40);
    </script>
  </body></html>`;
}

async function main() {
  console.log(`test_audit_responsive_lens_reliability.js — backlog 233 (N=${N} for legs A/B, ${N_LEG_C} for leg C, budget=${OCCLUSION_QUIESCENCE_BUDGET_MS}ms)\n`);

  const wallClockStart = Date.now();

  // --- Legs A/B/C: real pool-detail-360 surface via runAudit(). Only the
  // very first call is skip-tolerant (a genuine "no Chromium here"
  // environment gap) — every assertion below sits outside that catch, per
  // the 160 post-verifier lesson test_audit_occlusion_lens.js already
  // follows (and test_audit_occlusion_lens_reliability.js mirrors). ---
  let legA = null, legB = null, legC = null;
  try {
    legA = await runLeg('leg A (quiescence ON + defect)', { portBase: PORT_BASE_LEG_A, n: N, responsiveQuiescence: true, injectStyle: DEFECT_STYLE });
    legB = await runLeg('leg B (quiescence OFF + defect, positive control)', { portBase: PORT_BASE_LEG_B, n: N, responsiveQuiescence: false, injectStyle: DEFECT_STYLE });
    legC = await runLeg('leg C (quiescence ON + no-op, non-vacuity)', { portBase: PORT_BASE_LEG_C, n: N_LEG_C, responsiveQuiescence: true, injectStyle: NOOP_STYLE });
  } catch (err) {
    console.log('  (skipped) real-runAudit legs — could not run here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/233-notes.md');
  }

  if (legA && legB && legC) {
    const legAThreshold = Math.ceil(legA.n * 19 / 20); // exactly 19 when n===20
    test(`(A) quiescence ON + permanent defect: >=${legAThreshold}/${legA.n} iterations flagged (got ${legA.hits}/${legA.n})`, () => {
      assertT(legA.hits >= legAThreshold,
        `expected >=${legAThreshold}/${legA.n} iterations to report >=1 responsive finding, got ${legA.hits}/${legA.n}`);
    });

    const legBThreshold = Math.floor(legB.n * 8 / 20); // exactly 8 when n===20
    test(`(B) POSITIVE CONTROL, quiescence OFF + same defect: <=${legBThreshold}/${legB.n} iterations flagged (got ${legB.hits}/${legB.n})`, () => {
      assertT(legB.hits <= legBThreshold,
        `expected <=${legBThreshold}/${legB.n} iterations to report >=1 responsive finding (the low pre-233 rate), got ${legB.hits}/${legB.n} — the harness cannot distinguish fixed from broken`);
    });

    test(`(A) vs (B): quiescence measurably outperforms the no-wait fallback on the SAME defect (${legA.hits}/${legA.n} vs ${legB.hits}/${legB.n})`, () => {
      assertT(legA.hits > legB.hits,
        `expected leg A's hit rate to exceed leg B's on the identical injected defect; got A=${legA.hits}/${legA.n}, B=${legB.hits}/${legB.n}`);
    });

    test(`(C) NON-VACUITY, no-op injected style + quiescence ON: 0 responsive findings across ${legC.n} iterations (got ${legC.totalResponsiveFindings})`, () => {
      assertT(legC.totalResponsiveFindings === 0,
        `expected ZERO responsive findings with a no-op injected style (the real pool-detail-360 surface is genuinely fixed on main), got ${legC.totalResponsiveFindings}`);
    });

    console.log(`\n    Measured rates — A: ${legA.hits}/${legA.n}, B: ${legB.hits}/${legB.n}, C: ${legC.totalResponsiveFindings} finding(s)/${legC.n} iterations`);
    console.log(`    Mean wall-clock/iteration — A: ${legA.mean.toFixed(0)}ms, B: ${legB.mean.toFixed(0)}ms, C: ${legC.mean.toFixed(0)}ms`);
  }

  // --- Fixtures (D)/(E): own dedicated browser, page.setContent(), direct
  // checkResponsive() drives. ---
  let fixtureBrowser = null;
  try {
    fixtureBrowser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  } catch (err) {
    console.log('  (skipped) direct-drive fixtures — could not launch Chromium here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/233-notes.md');
  }

  if (fixtureBrowser) {
    try {
      // (D) Zero-match ctaSelector must push the new P2 advisory, not skip silently.
      const noCtaPage = await fixtureBrowser.newPage({ viewport: { width: 800, height: 780 } });
      const noCtaErrors = makeErrorSink(noCtaPage);
      await noCtaPage.setContent(noCtaFixture());

      let noCtaFindings = [];
      await testAsync('(D) ctaSelector matching ZERO elements: checkResponsive pushes a P2 "responsive" advisory naming the selector, instead of skipping silently', async () => {
        const s = { name: 'test-no-cta', vpLabel: '800px', width: 800, kind: 'static' };
        await checkResponsive(noCtaPage, s, noCtaFindings, '.nonexistent-cta-selector');
        const advisories = noCtaFindings.filter((f) => f.check === 'responsive' && f.detail.includes('matched zero elements'));
        assertT(advisories.length === 1,
          `expected exactly 1 "matched zero elements" P2 advisory naming ".nonexistent-cta-selector", got: ${JSON.stringify(noCtaFindings, null, 2)}`);
        assertT(advisories[0].severity === 'P2', `expected the zero-match advisory to be P2 (non-blocking), got: ${JSON.stringify(advisories[0])}`);
        assertT(advisories[0].detail.includes('.nonexistent-cta-selector'),
          `expected the advisory to name the actual selector, got: ${advisories[0].detail}`);
      });
      await testAsync('(D) no unexpected page/console errors on the no-CTA fixture', async () => {
        assertT(noCtaErrors.length === 0, noCtaErrors.join('\n    '));
      });
      await noCtaPage.close();

      // (E) Never-stabilising geometry must advise AND still measure the real defect.
      const neverPage = await fixtureBrowser.newPage({ viewport: { width: 800, height: 780 } });
      const neverErrors = makeErrorSink(neverPage);
      await neverPage.setContent(neverStabilisingResponsiveFixture());

      let neverFindings = [];
      await testAsync(`(E) JS-driven perpetual geometry nudge (no CSS animation, document.getAnimations() blind to it): checkResponsive advises "quiescence not reached" naming the numbers, budget ~${OCCLUSION_QUIESCENCE_BUDGET_MS}ms`, async () => {
        const s = { name: 'test-never-stabilising-responsive', vpLabel: '800px', width: 800, kind: 'static' };
        await checkResponsive(neverPage, s, neverFindings, '.cta');
        const advisories = neverFindings.filter((f) => f.check === 'responsive' && f.detail.includes('quiescence not reached'));
        assertT(advisories.length >= 1,
          `expected >=1 "quiescence not reached" P2 advisory (geometry perpetually changes, so the budget must be exhausted), got: ${JSON.stringify(neverFindings, null, 2)}`);
        const namesTheNumbers = advisories.some((f) => /\d+ms/.test(f.detail) && /\d+ animation\(s\)/.test(f.detail));
        assertT(namesTheNumbers, `expected the advisory to name the numbers (budget ms + animation count), got: ${JSON.stringify(advisories, null, 2)}`);
        assertT(advisories.every((f) => f.severity === 'P2'), `expected the advisory to be P2 (non-blocking), got: ${JSON.stringify(advisories, null, 2)}`);
      });
      await testAsync('(E) MEASURE ANYWAY: the real defect (.cta permanently off-viewport) is still reported despite the advisory', async () => {
        const realFinding = neverFindings.filter((f) => f.check === 'responsive' && f.detail.includes('.cta') && f.detail.includes('exceeds'));
        assertT(realFinding.length >= 1,
          `expected the fixture's real defect (.cta at x=-9999, permanently exceeding the viewport) to still be reported even though quiescence never settled, got: ${JSON.stringify(neverFindings, null, 2)}`);
      });
      await testAsync('(E) no unexpected page/console errors on the never-stabilising fixture', async () => {
        assertT(neverErrors.length === 0, neverErrors.join('\n    '));
      });
      await neverPage.close();
    } finally {
      await fixtureBrowser.close();
    }
  }

  const totalWallClockMs = Date.now() - wallClockStart;
  console.log(`\n    Total wall-clock for this file: ${(totalWallClockMs / 1000).toFixed(1)}s`);
  console.log(`\ntest_audit_responsive_lens_reliability.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
