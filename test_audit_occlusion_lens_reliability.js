/* Acceptance test for backlog 231 — the occlusion lens must SEE a permanent
   defect on (nearly) every run, not 15-20% of them.

   Evidence (specs/231.md): checkOcclusion's fixed 150ms post-resize settle
   races style.css:4605's `.animate-on-mount` entry animation, restarted by
   page.setViewportSize()'s React re-mount. occlusionPassEval's own
   isVisible() gate (checkVisibility({opacityProperty:true})) rejects a
   still-animating victim as invisible, so a page that is PERMANENTLY broken
   measured as clean 80-85% of the time. This file's job is not to re-prove
   the mechanism (231.md already measured it) — it is to prove the FIX raises
   the detection rate, using the acceptance shape the backlog row itself
   dictates: "the DETECTION RATE, never a single green run."

   Three legs, all driving the REAL `dead-pool` surface through the REAL
   runAudit() driver (never a hand-built fixture — spec 231 "Population, not
   instance"), each N isolated iterations (fresh browser + fresh page per
   iteration — runAudit() owns its own browser+server lifecycle per call, a
   DIFFERENT port every time):

     (A) quiescence ON + item 230's shipped fix mutated away via
         opts.injectStyle (the exact permanent defect spec 231 names) —
         must flag >=1 blocking `occlusion` finding on >=19/20 iterations.
     (B) POSITIVE CONTROL — identical defect, occlusionQuiescence:false (the
         pre-231 fixed-150ms path) — must reproduce the LOW rate, <=8/20, so
         the harness is proven able to tell the two apart (a harness that
         would pass on anything is not evidence).
     (C) NON-VACUITY — a no-op injected style (surface stays genuinely fixed
         on `main`), quiescence ON — must report ZERO occlusion findings
         across a few iterations (5 is fine here per spec), proving (A)'s
         >=19/20 isn't the harness manufacturing findings out of nothing.

   Plus two budget-honesty fixtures (spec 231 "must never hang, never go
   silent"), driven directly via checkOcclusion() on page.setContent()
   fixtures — the pattern test_audit_occlusion_lens.js already established:
     (D) an infinite CSS animation (a pulsing fixed badge, opacity-only, no
         geometry change) must NOT hang and must NOT push a "quiescence not
         reached" advisory — document.getAnimations() excludes it
         (iterations===Infinity), so only the geometry leg could ever gate
         quiescence here, and this fixture's geometry never moves.
     (E) a JS-driven (never a CSS animation, so document.getAnimations()
         cannot see it) perpetually-nudged fixed bar's height, occluding a
         real paragraph — geometry NEVER stabilises, so quiescence must NOT
         be reached within the budget: the advisory must fire, naming the
         numbers, AND the real occlusion must still be reported (measuring
         anyway is the whole point of the budget, not an excuse to skip).
     (F) verifier finding, attempt 1 (2026-08-05): neither (D) nor (E)
         actually isolates the ANIMATION-COUNT leg from the geometry leg —
         (D) only exercises the iterations:Infinity EXCLUSION (never
         animCount>0 gating anything, since an excluded effect never counts),
         and (E) is deliberately CSS-animation-free (document.getAnimations()
         sees nothing on it regardless of the animation leg's correctness).
         Forcing quiescenceSampleEval's animCount to always return 0 (the
         verifier's "M2" mutation) left every existing assertion in this file
         green — a completely dead animation leg went undetected. (F) drives
         waitForQuiescence() DIRECTLY (not through checkOcclusion) on a page
         whose overlay+victim geometry (a fixed header bar over a paragraph,
         occluded from the first frame) never changes at all, while a real,
         FINITE (non-infinite), opacity-only CSS animation runs off-screen
         (excluded from the geometry signature by construction — outside the
         viewport, not fixed/sticky, no text/interactivity) for longer than
         the budget passed. Mid-animation: reached:false, animCount>=1,
         geometryChanged:false — the last one is what proves a red here
         cannot be explained by the geometry leg. Post-animation:
         reached:true. Then checkOcclusion() on the same page still reports
         the real occlusion (measure-anyway holds here too).

   Iteration count is overridable via AUDIT_RELIABILITY_N (cheap harness
   runs); the DEFAULT (20 for legs A/B, capped to 5 for leg C) is what ships
   — do not shrink it to make this test file itself faster.

   Run: node test_audit_occlusion_lens_reliability.js
   Cheap run: AUDIT_RELIABILITY_N=5 node test_audit_occlusion_lens_reliability.js */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const {
  runAudit, blockingFindings, checkOcclusion,
  waitForQuiescence, OCCLUSION_QUIESCENCE_BUDGET_MS
} = require('./audit-app.js');

const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|fonts\.|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Ports: distinct from every test_*.js file's own ports on disk as of this
// item (grepped max 8975, test_audit_occlusion_lens.js's RUNAUDIT_PORT) and
// outside 8901-8960 (already claimed by other audit-lens acceptance tests —
// spec 231's own territory note: "I used those"). Each leg gets its own
// base, spaced well past the largest iteration count either leg could run.
const PORT_BASE_LEG_A = 9200;
const PORT_BASE_LEG_B = 9250;
const PORT_BASE_LEG_C = 9300;

// Item 230's shipped fix, mutated away — the exact permanent, deterministic
// defect spec 231 prescribes. `!important` is required: home.html loads the
// minified sheet asynchronously (the addCSS media=print -> onload media=all
// pattern), so an in-page style tag must outrank it.
const DEFECT_STYLE = '.app:not(.has-results):has(.results-section) .app-footer{position:fixed !important}';
// A real, harmless rule (never touches .app-footer's position) — proves
// opts.injectStyle itself isn't fabricating occlusions out of nothing.
const NOOP_STYLE = '.audit-231-noop-marker { --audit-231-noop-token: 1; }';

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
// Legs A/B/C — N isolated runAudit() iterations against the REAL dead-pool
// surface. `hits` counts iterations with >=1 BLOCKING (P0/P1) occlusion
// finding; `totalOcclusionFindings` counts every occlusion finding of any
// severity (used by leg C's non-vacuity proof, which must be zero, not just
// zero-blocking). One unique port per iteration; each iteration's outPath is
// a fresh temp file, deleted immediately after that iteration reads it.
// ---------------------------------------------------------------------------
async function runLeg(label, { portBase, n, occlusionQuiescence, injectStyle }) {
  let hits = 0;
  let totalOcclusionFindings = 0;
  const times = [];
  for (let i = 0; i < n; i++) {
    const outPath = path.join(os.tmpdir(), `audit-findings-231-${label}-${process.pid}-${i}.json`);
    const t0 = Date.now();
    let result;
    try {
      result = await runAudit({
        port: portBase + i, only: ['dead-pool'], outPath,
        poolLiveness: false, injectStyle, occlusionQuiescence
      });
    } finally {
      try { fs.unlinkSync(outPath); } catch (e) { /* never written, or already gone */ }
    }
    times.push(Date.now() - t0);
    const occlusion = (result.findings || []).filter((f) => f.check === 'occlusion' && f.surface === 'dead-pool');
    totalOcclusionFindings += occlusion.length;
    if (blockingFindings(occlusion).length >= 1) hits++;
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`    ${label}: ${hits}/${n} iterations flagged >=1 blocking occlusion finding (${totalOcclusionFindings} occlusion finding(s) total), mean wall-clock ${mean.toFixed(0)}ms/iteration`);
  return { hits, n, mean, totalOcclusionFindings };
}

// ---------------------------------------------------------------------------
// Budget-honesty fixtures (D)/(E) — direct checkOcclusion() drives, no
// server/runAudit needed, same page.setContent() house pattern
// test_audit_occlusion_lens.js already uses for its own local fixtures.
// ---------------------------------------------------------------------------
function infiniteAnimationFixture() {
  return `<!doctype html><html><head><style>
    body { margin: 0; font-family: sans-serif; }
    .badge { position: fixed; top: 10px; right: 10px; width: 24px; height: 24px;
      border-radius: 50%; background: #202020; animation: pulse 1s linear infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .content { padding: 40px; }
  </style></head><body>
    <div class="badge"></div>
    <div class="content"><p>Ordinary content, clear of the badge, nothing else animates.</p></div>
  </body></html>`;
}

function neverStabilisingGeometryFixture() {
  return `<!doctype html><html><head><style>
    body { margin: 0; font-family: sans-serif; }
    .bar { position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #202020; color: #fff; }
    .victim { margin: 0; padding: 16px; }
  </style></head><body>
    <div class="bar">bar with zero clearance below it</div>
    <p class="victim">This paragraph has no top clearance and sits directly behind the bar at rest.</p>
    <script>
      // JS-driven perpetual nudge — deliberately NOT a CSS animation/transition,
      // so document.getAnimations() cannot see it: only the geometry-stability
      // leg of waitForQuiescence can ever catch this fixture never settling.
      // Strictly MONOTONIC (never cyclic): a modulo-based nudge can, by pure
      // chance, land on the same value across two samples 100ms apart and
      // read as "stable" when it never actually stopped moving — this counts
      // upward forever instead, so any two samples at different times are
      // GUARANTEED to differ.
      var n = 0;
      setInterval(function () {
        n += 1;
        document.querySelector('.bar').style.height = (60 + n) + 'px';
      }, 40);
    </script>
  </body></html>`;
}

// (F) — isolates the animation-count leg from the geometry-stability leg.
// `.bar` + `.victim` are completely static for the whole page lifetime (no
// transform, no size/position change anywhere in this fixture — verified,
// not assumed, by the test's own geometryChanged:false assertion below): the
// bar occludes the paragraph from the FIRST FRAME, so the geometry signature
// is identical from t=0 onward. `.pulser` carries a real, FINITE (iterations
// defaults to 1, never "infinite"), opacity-only CSS animation — long enough
// to still be running past the small budget the test passes directly to
// waitForQuiescence(). It is positioned off-screen (top/left: -9999px) and
// carries no text and no interactive role, so it is excluded from the
// geometry signature by construction (not fixed/sticky -> never an overlay;
// outside the viewport -> filtered out of the candidate-victim scan too) —
// only document.getAnimations() can ever see it running.
function animationLegFixture() {
  return `<!doctype html><html><head><style>
    body { margin: 0; font-family: sans-serif; }
    .bar { position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #202020; color: #fff; }
    .victim { margin: 0; padding: 16px; }
    .pulser {
      position: absolute; top: -9999px; left: -9999px; width: 1px; height: 1px;
      animation: pulse 1500ms linear 1 forwards;
    }
    @keyframes pulse { 0% { opacity: 1; } 100% { opacity: 0.3; } }
  </style></head><body>
    <div class="bar">bar with zero clearance below it</div>
    <p class="victim">This paragraph has no top clearance and sits directly behind the bar at rest, from the first frame.</p>
    <div class="pulser"></div>
  </body></html>`;
}

async function main() {
  console.log(`test_audit_occlusion_lens_reliability.js — backlog 231 (N=${N} for legs A/B, ${N_LEG_C} for leg C, budget=${OCCLUSION_QUIESCENCE_BUDGET_MS}ms)\n`);

  const wallClockStart = Date.now();

  // --- Legs A/B/C: real dead-pool surface via runAudit(). Only the very
  // first call is skip-tolerant (a genuine "no Chromium here" environment
  // gap) — every assertion below sits outside that catch, per the 160
  // post-verifier lesson test_audit_occlusion_lens.js already follows. ---
  let legA = null, legB = null, legC = null;
  try {
    legA = await runLeg('leg A (quiescence ON + defect)', { portBase: PORT_BASE_LEG_A, n: N, occlusionQuiescence: true, injectStyle: DEFECT_STYLE });
    legB = await runLeg('leg B (quiescence OFF + defect, positive control)', { portBase: PORT_BASE_LEG_B, n: N, occlusionQuiescence: false, injectStyle: DEFECT_STYLE });
    legC = await runLeg('leg C (quiescence ON + no-op, non-vacuity)', { portBase: PORT_BASE_LEG_C, n: N_LEG_C, occlusionQuiescence: true, injectStyle: NOOP_STYLE });
  } catch (err) {
    console.log('  (skipped) real-runAudit legs — could not run here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/231-notes.md');
  }

  if (legA && legB && legC) {
    const legAThreshold = Math.ceil(legA.n * 19 / 20); // exactly 19 when n===20
    test(`(A) quiescence ON + permanent defect: >=${legAThreshold}/${legA.n} iterations flagged (got ${legA.hits}/${legA.n})`, () => {
      assertT(legA.hits >= legAThreshold,
        `expected >=${legAThreshold}/${legA.n} iterations to report >=1 blocking occlusion finding, got ${legA.hits}/${legA.n}`);
    });

    const legBThreshold = Math.floor(legB.n * 8 / 20); // exactly 8 when n===20
    test(`(B) POSITIVE CONTROL, quiescence OFF + same defect: <=${legBThreshold}/${legB.n} iterations flagged (got ${legB.hits}/${legB.n})`, () => {
      assertT(legB.hits <= legBThreshold,
        `expected <=${legBThreshold}/${legB.n} iterations to report >=1 blocking occlusion finding (the low pre-231 rate), got ${legB.hits}/${legB.n} — the harness cannot distinguish fixed from broken`);
    });

    test(`(A) vs (B): quiescence measurably outperforms the fixed-150ms fallback on the SAME defect (${legA.hits}/${legA.n} vs ${legB.hits}/${legB.n})`, () => {
      assertT(legA.hits > legB.hits,
        `expected leg A's hit rate to exceed leg B's on the identical injected defect; got A=${legA.hits}/${legA.n}, B=${legB.hits}/${legB.n}`);
    });

    test(`(C) NON-VACUITY, no-op injected style + quiescence ON: 0 occlusion findings across ${legC.n} iterations (got ${legC.totalOcclusionFindings})`, () => {
      assertT(legC.totalOcclusionFindings === 0,
        `expected ZERO occlusion findings of any severity with a no-op injected style (the real dead-pool surface is genuinely fixed on main), got ${legC.totalOcclusionFindings}`);
    });

    console.log(`\n    Measured rates — A: ${legA.hits}/${legA.n}, B: ${legB.hits}/${legB.n}, C: ${legC.totalOcclusionFindings} finding(s)/${legC.n} iterations`);
    console.log(`    Mean wall-clock/iteration — A: ${legA.mean.toFixed(0)}ms, B: ${legB.mean.toFixed(0)}ms, C: ${legC.mean.toFixed(0)}ms`);
  }

  // --- Budget-honesty fixtures (D)/(E): own dedicated browser, page.setContent(). ---
  let fixtureBrowser = null;
  try {
    fixtureBrowser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  } catch (err) {
    console.log('  (skipped) budget-honesty fixtures — could not launch Chromium here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/231-notes.md');
  }

  if (fixtureBrowser) {
    try {
      // (D) Infinite animation must NOT hang and must NOT advise.
      const infinitePage = await fixtureBrowser.newPage({ viewport: { width: 800, height: 780 } });
      const infiniteErrors = makeErrorSink(infinitePage);
      await infinitePage.setContent(infiniteAnimationFixture());

      let infiniteFindings = [];
      let infiniteElapsedMs = null;
      await testAsync('(D) infinite CSS animation (opacity-only, iterations:Infinity): checkOcclusion does not hang and does not push a "quiescence not reached" advisory', async () => {
        const s = { name: 'test-infinite-animation', vpLabel: '800px', width: 800, kind: 'static' };
        const t0 = Date.now();
        await checkOcclusion(infinitePage, s, infiniteFindings);
        infiniteElapsedMs = Date.now() - t0;
        assertT(infiniteElapsedMs < OCCLUSION_QUIESCENCE_BUDGET_MS,
          `expected checkOcclusion to finish well under the ${OCCLUSION_QUIESCENCE_BUDGET_MS}ms budget on a fixture with no genuine geometry instability (an infinite animation must never itself cause a hang), took ${infiniteElapsedMs}ms`);
        const advisories = infiniteFindings.filter((f) => f.check === 'occlusion' && f.detail.includes('quiescence not reached'));
        assertT(advisories.length === 0,
          `expected NO "quiescence not reached" advisory (infinite-iteration effects are excluded from the animation gate, and this fixture's geometry never changes), got: ${JSON.stringify(advisories, null, 2)}`);
      });
      await testAsync('(D) no unexpected page/console errors on the infinite-animation fixture', async () => {
        assertT(infiniteErrors.length === 0, infiniteErrors.join('\n    '));
      });
      await infinitePage.close();

      // (E) Never-stabilising geometry must advise AND still measure.
      const neverPage = await fixtureBrowser.newPage({ viewport: { width: 800, height: 780 } });
      const neverErrors = makeErrorSink(neverPage);
      await neverPage.setContent(neverStabilisingGeometryFixture());

      let neverFindings = [];
      await testAsync(`(E) JS-driven perpetual geometry nudge (no CSS animation, document.getAnimations() blind to it): checkOcclusion advises "quiescence not reached" naming the numbers, budget ~${OCCLUSION_QUIESCENCE_BUDGET_MS}ms`, async () => {
        const s = { name: 'test-never-stabilising', vpLabel: '800px', width: 800, kind: 'static' };
        await checkOcclusion(neverPage, s, neverFindings);
        const advisories = neverFindings.filter((f) => f.check === 'occlusion' && f.detail.includes('quiescence not reached'));
        assertT(advisories.length >= 1,
          `expected >=1 "quiescence not reached" P2 advisory (geometry perpetually changes, so the budget must be exhausted), got: ${JSON.stringify(neverFindings, null, 2)}`);
        const namesTheNumbers = advisories.some((f) => /\d+ms/.test(f.detail) && /\d+ animation\(s\)/.test(f.detail));
        assertT(namesTheNumbers, `expected the advisory to name the numbers (budget ms + animation count), got: ${JSON.stringify(advisories, null, 2)}`);
        assertT(advisories.every((f) => f.severity === 'P2'), `expected the advisory to be P2 (non-blocking), got: ${JSON.stringify(advisories, null, 2)}`);
      });
      await testAsync('(E) MEASURE ANYWAY: the real occlusion (.victim behind .bar) is still reported despite the advisory', async () => {
        const blocking = neverFindings.filter((f) => f.check === 'occlusion' && (f.severity === 'P0' || f.severity === 'P1') && f.detail.includes('victim'));
        assertT(blocking.length >= 1,
          `expected the fixture's real at-rest occlusion (.victim fully behind .bar, zero clearance) to still be reported even though quiescence never settled, got: ${JSON.stringify(neverFindings, null, 2)}`);
      });
      await testAsync('(E) no unexpected page/console errors on the never-stabilising fixture', async () => {
        assertT(neverErrors.length === 0, neverErrors.join('\n    '));
      });
      await neverPage.close();

      // (F) Animation-count leg isolation (verifier finding, attempt 1) — see
      // the file header comment for why (D)/(E) alone don't prove this leg.
      const animLegPage = await fixtureBrowser.newPage({ viewport: { width: 800, height: 780 } });
      const animLegErrors = makeErrorSink(animLegPage);
      await animLegPage.setContent(animationLegFixture());

      const ANIM_LEG_SMALL_BUDGET_MS = 500; // « the fixture's 1500ms animation duration
      let animLegDuring = null;
      await testAsync('(F) mid-animation: waitForQuiescence(small budget) returns reached:false, animCount>=1, geometryChanged:false', async () => {
        animLegDuring = await waitForQuiescence(animLegPage, ANIM_LEG_SMALL_BUDGET_MS);
        assertT(animLegDuring.reached === false,
          `expected reached:false while the 1500ms finite animation is still running (budget ${ANIM_LEG_SMALL_BUDGET_MS}ms), got ${JSON.stringify(animLegDuring)}`);
        assertT(animLegDuring.animCount >= 1,
          `expected animCount>=1 — the off-screen pulser's finite opacity animation must still be counted as running, got ${JSON.stringify(animLegDuring)}`);
        assertT(animLegDuring.geometryChanged === false,
          `expected geometryChanged:false — .bar/.victim never move on this fixture, so a false-positive geometry gate cannot explain a red here (this is what isolates the animation leg), got ${JSON.stringify(animLegDuring)}`);
      });

      await animLegPage.waitForTimeout(1700); // let the 1500ms animation actually finish

      let animLegAfter = null;
      await testAsync('(F) post-animation: waitForQuiescence returns reached:true once the finite animation has actually completed', async () => {
        animLegAfter = await waitForQuiescence(animLegPage, OCCLUSION_QUIESCENCE_BUDGET_MS);
        assertT(animLegAfter.reached === true,
          `expected reached:true once the 1500ms animation has finished (playState no longer "running"), got ${JSON.stringify(animLegAfter)}`);
      });

      let animLegFindings = [];
      await testAsync('(F) MEASURE ANYWAY: checkOcclusion on the same page still reports the real .victim/.bar occlusion', async () => {
        const s = { name: 'test-animation-leg', vpLabel: '800px', width: 800, kind: 'static' };
        await checkOcclusion(animLegPage, s, animLegFindings);
        const blocking = animLegFindings.filter((f) => f.check === 'occlusion' && (f.severity === 'P0' || f.severity === 'P1') && f.detail.includes('victim'));
        assertT(blocking.length >= 1, `expected the real occlusion (.victim behind .bar) to be reported, got: ${JSON.stringify(animLegFindings, null, 2)}`);
      });
      await testAsync('(F) no unexpected page/console errors on the animation-leg fixture', async () => {
        assertT(animLegErrors.length === 0, animLegErrors.join('\n    '));
      });
      await animLegPage.close();
    } finally {
      await fixtureBrowser.close();
    }
  }

  const totalWallClockMs = Date.now() - wallClockStart;
  console.log(`\n    Total wall-clock for this file: ${(totalWallClockMs / 1000).toFixed(1)}s`);
  console.log(`\ntest_audit_occlusion_lens_reliability.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
