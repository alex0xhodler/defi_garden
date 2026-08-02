/* Acceptance tests for the level-2 `?pool=` deep-link liveness signal
   (backlog 184) — prescanStaticPages()'s new `poolLinkLiveness` sub-rule and
   buildStaticSurfaces()'s `static-prescan:pool-link-liveness-unrun` finding.

   Node-only, no Playwright, no real Chromium render — every case here is a
   pure fs+regex scan (prescanStaticPages()) or a pure-fs surface build
   (buildStaticSurfaces()), same shape as test_audit_prescan.js's non-rendered
   criteria 1/2/5/7. (This file still requires audit-app.js, so run-tests.js's
   own content-based lane classifier — see its header comment — sweeps it
   into the browser lane anyway, same as every other test_audit_*.js file;
   that is a mechanical classification quirk, not a claim that this file
   drives a browser. It does not.)

   Item 181's own classifier/constants (test_seo_cta_targets.js, required
   here as `cta181`) are reused verbatim, never re-typed (174's rule) — see
   audit-app.js's own header comment on the `cta181` require for why.

   Run: node test_audit_pool_link_liveness.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cta181 = require('./test_seo_cta_targets.js');
const { prescanStaticPages, buildStaticSurfaces } = require('./audit-app.js');

const ROOT = __dirname;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------------------
// Scratch-dir fixture helpers — every fixture lives under os.tmpdir(),
// removed in a top-level finally. tokens/ and chains/ are NEVER written to
// (only ever read from, for the real-corpus + backdated-copy cases below).
// ---------------------------------------------------------------------------
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit184-'));
function writeScratch(name, html) {
  const file = path.join(scratchDir, name);
  fs.writeFileSync(file, html);
  return file;
}
function cleanupScratch() {
  try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch (e) {}
}

// Deterministic, syntactically-valid pool-id-shaped UUIDs (POOL_ID_UUID_RE in
// audit-app.js only requires the 8-4-4-4-12 hex shape, not a real UUID
// version/variant nibble) — `uuid(n)` never collides for distinct n.
function uuid(n) {
  const hex = n.toString(16).padStart(12, '0');
  return `aaaaaaaa-bbbb-4ccc-8ddd-${hex}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function lastUpdatedLine(utcMs) {
  const d = new Date(utcMs);
  return `<p class="note">Last updated ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}</p>`;
}

// A fixed, injected `today` (never the real clock) for every synthetic case —
// item 184's own requirement. Matches this checkout's actual date, but is
// never read from Date.now(); it is a literal.
const TODAY = Date.UTC(2026, 6, 30); // 2026-07-30 UTC
const FRESH_LINE = lastUpdatedLine(TODAY - 1 * MS_PER_DAY); // 1 day old at TODAY
const STALE_LINE = lastUpdatedLine(TODAY - (cta181.STALE_AFTER_DAYS + 10) * MS_PER_DAY); // well past the budget
const UNPARSEABLE_LINE = '<p class="note">Last updated whenever</p>';

// Minimal page builder. `anchors` are real tp-pool-link pool-row anchors
// (backed); `bareLinks` are owned home-path hrefs carrying `?pool=` with NO
// backing anchor (used to trigger the "unbacked" contract case). Neither
// list needs real table markup — prescanStaticPages()'s pool-link-liveness
// sub-rule (unlike level 3's own `parsePageOwnPools()`) never reads TVL/APY
// cells, only href="..." attributes and anchor class/href.
function buildPage({ anchors = [], bareLinks = [], updatedLine = FRESH_LINE }) {
  const anchorHtml = anchors
    .map((id) => `<a class="tp-pool-link" href="https://www.defi.garden/?pool=${id}&src=seo_token">x &rarr;</a>`)
    .join('\n');
  const bareHtml = bareLinks
    .map((id) => `<a href="https://www.defi.garden/?pool=${id}">y &rarr;</a>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head><title>Test</title></head>
<body>
<h1>Test Yields</h1>
${anchorHtml}
${bareHtml}
${updatedLine}
</body>
</html>`;
}

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

function poolLinkSuspects(result) {
  return result.suspects.filter((s) => s.signal === 'pool-link-liveness');
}

async function main() {
  console.log('backlog 184 — level-2 ?pool= deep-link liveness signal\n');

  try {
    // -------------------------------------------------------------------
    // Class 1: healthy — live id, backed by a tp-pool-link anchor, fresh.
    // -------------------------------------------------------------------
    await test('healthy: live id, anchor-backed, fresh page → 0 suspects, ok=true', () => {
      const id = uuid(1);
      const f = writeScratch('healthy.html', buildPage({ anchors: [id], updatedLine: FRESH_LINE }));
      const result = prescanStaticPages({ pages: [f], livePoolIds: new Set([id]), today: TODAY });
      assert(result.scanned === 1, `expected scanned === 1, got ${result.scanned}`);
      assert(poolLinkSuspects(result).length === 0, `expected 0 pool-link-liveness suspects; got ${JSON.stringify(poolLinkSuspects(result))}`);
      const pll = result.poolLinkLiveness;
      assert(pll.ran === true, `expected ran === true; got ${JSON.stringify(pll)}`);
      assert(pll.checkedIds === 1 && pll.contract === 0 && pll.stale === 0 && pll.drift === 0,
        `expected checkedIds=1, contract=0, stale=0, drift=0; got ${JSON.stringify(pll)}`);
      assert(pll.ok === true, `expected ok === true; got ${JSON.stringify(pll)}`);
    });

    // -------------------------------------------------------------------
    // Class 2a: contract — malformed uuid. Fatal at count 1.
    // -------------------------------------------------------------------
    await test('contract (malformed uuid): fatal at count 1', () => {
      const badId = 'not-a-uuid-at-all';
      const f = writeScratch('contract_malformed.html', buildPage({ anchors: [badId], updatedLine: FRESH_LINE }));
      const result = prescanStaticPages({ pages: [f], livePoolIds: new Set(), today: TODAY });
      const hits = poolLinkSuspects(result);
      assert(hits.length === 1, `expected exactly 1 pool-link-liveness suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/contract/.test(hits[0].detail) && hits[0].detail.includes(badId),
        `expected the malformed id named as a contract failure; got: ${hits[0].detail}`);
      const pll = result.poolLinkLiveness;
      assert(pll.contract === 1, `expected poolLinkLiveness.contract === 1; got ${JSON.stringify(pll)}`);
      assert(pll.ok === false, `contract must fail the gate at ANY count; got ok=${pll.ok}`);
    });

    // -------------------------------------------------------------------
    // Class 2b: contract — a valid uuid whose id the page's own body never
    // backs (a bare href, no tp-pool-link/cp-pool-link anchor). Fatal at
    // count 1.
    // -------------------------------------------------------------------
    await test('contract (unbacked): a well-formed uuid with no matching pool-row anchor is fatal at count 1', () => {
      const id = uuid(2);
      const f = writeScratch('contract_unbacked.html', buildPage({ bareLinks: [id], updatedLine: FRESH_LINE }));
      // Even if the id IS live, an unbacked link is a repo bug (contract),
      // invariant to live data — so it stays live to prove that.
      const result = prescanStaticPages({ pages: [f], livePoolIds: new Set([id]), today: TODAY });
      const hits = poolLinkSuspects(result);
      assert(hits.length === 1, `expected exactly 1 pool-link-liveness suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/contract/.test(hits[0].detail) && hits[0].detail.includes(id),
        `expected the unbacked id named as a contract failure; got: ${hits[0].detail}`);
      const pll = result.poolLinkLiveness;
      assert(pll.contract === 1, `expected poolLinkLiveness.contract === 1; got ${JSON.stringify(pll)}`);
      assert(pll.ok === false, `contract must fail the gate at ANY count; got ok=${pll.ok}`);
    });

    // -------------------------------------------------------------------
    // Class 3a: stale — dead id + backdated page. Fatal at count 1.
    // -------------------------------------------------------------------
    await test('stale (backdated): dead id on a page whose "Last updated" is well past the budget → fatal at count 1', () => {
      const id = uuid(3);
      const f = writeScratch('stale_backdated.html', buildPage({ anchors: [id], updatedLine: STALE_LINE }));
      const result = prescanStaticPages({ pages: [f], livePoolIds: new Set(), today: TODAY });
      const hits = poolLinkSuspects(result);
      assert(hits.length === 1, `expected exactly 1 pool-link-liveness suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/stale/.test(hits[0].detail) && hits[0].detail.includes(id),
        `expected the dead id named as a stale failure; got: ${hits[0].detail}`);
      const pll = result.poolLinkLiveness;
      assert(pll.stale === 1 && pll.deadIds === 1 && pll.pagesAffected === 1,
        `expected stale=1, deadIds=1, pagesAffected=1; got ${JSON.stringify(pll)}`);
      assert(pll.ok === false, `stale must fail the gate at ANY count; got ok=${pll.ok}`);
    });

    // -------------------------------------------------------------------
    // Class 3b: stale — dead id + unparseable "Last updated" (conservative
    // default: cannot prove freshness).
    // -------------------------------------------------------------------
    await test('stale (unparseable date): dead id + unparseable "Last updated" → fatal (conservative default)', () => {
      const id = uuid(4);
      const f = writeScratch('stale_unparseable.html', buildPage({ anchors: [id], updatedLine: UNPARSEABLE_LINE }));
      const result = prescanStaticPages({ pages: [f], livePoolIds: new Set(), today: TODAY });
      const hits = poolLinkSuspects(result);
      assert(hits.length === 1, `expected exactly 1 pool-link-liveness suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/stale/.test(hits[0].detail) && /unparseable/.test(hits[0].detail),
        `expected the unparseable date named as a stale failure; got: ${hits[0].detail}`);
      const pll = result.poolLinkLiveness;
      assert(pll.stale === 1, `expected poolLinkLiveness.stale === 1; got ${JSON.stringify(pll)}`);
      assert(pll.ok === false, `stale must fail the gate; got ok=${pll.ok}`);
    });

    // -------------------------------------------------------------------
    // Class 4a: drift under budget — reported, never a suspect, gate green.
    // 199 distinct live ids + 1 dead-but-fresh id on ONE page ⇒
    // checkedIds=200, allowance=200*1.0%=2.0, driftCount=1 <= 2.0.
    // -------------------------------------------------------------------
    await test('drift under budget: 0 suspects, poolLinkLiveness.drift >= 1, ok === true', () => {
      const liveIds = [];
      for (let i = 0; i < 199; i++) liveIds.push(uuid(1000 + i));
      const driftId = uuid(9999);
      const f = writeScratch('drift_under.html', buildPage({ anchors: liveIds.concat([driftId]), updatedLine: FRESH_LINE }));
      const result = prescanStaticPages({ pages: [f], livePoolIds: new Set(liveIds), today: TODAY });
      assert(poolLinkSuspects(result).length === 0, `expected 0 pool-link-liveness suspects (under budget); got ${JSON.stringify(poolLinkSuspects(result))}`);
      const pll = result.poolLinkLiveness;
      assert(pll.checkedIds === 200, `expected checkedIds === 200; got ${pll.checkedIds}`);
      assert(pll.drift >= 1, `expected poolLinkLiveness.drift >= 1; got ${JSON.stringify(pll)}`);
      assert(pll.contract === 0 && pll.stale === 0, `expected contract=0, stale=0; got ${JSON.stringify(pll)}`);
      assert(pll.ok === true, `expected ok === true (drift within the ${(cta181.DRIFT_BUDGET_FRACTION * 100).toFixed(1)}% budget); got ${JSON.stringify(pll)}`);
    });

    // -------------------------------------------------------------------
    // Class 4b: drift over budget — suspect(s), gate red.
    // 1 dead-but-fresh id alone ⇒ checkedIds=1, allowance=0.01,
    // driftCount=1 > 0.01.
    // -------------------------------------------------------------------
    await test('drift over budget: suspect(s) emitted, ok === false', () => {
      const driftId = uuid(9998);
      const f = writeScratch('drift_over.html', buildPage({ anchors: [driftId], updatedLine: FRESH_LINE }));
      const result = prescanStaticPages({ pages: [f], livePoolIds: new Set(), today: TODAY });
      const hits = poolLinkSuspects(result);
      assert(hits.length === 1, `expected exactly 1 pool-link-liveness suspect (over budget); got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/drift/.test(hits[0].detail) && hits[0].detail.includes(driftId),
        `expected the drift id named and "drift" mentioned; got: ${hits[0].detail}`);
      const pll = result.poolLinkLiveness;
      assert(pll.drift === 1 && pll.contract === 0 && pll.stale === 0, `expected drift=1, contract=0, stale=0; got ${JSON.stringify(pll)}`);
      assert(pll.ok === false, `expected ok === false (1/1 = 100% exceeds the ${(cta181.DRIFT_BUDGET_FRACTION * 100).toFixed(1)}% budget); got ${JSON.stringify(pll)}`);
    });

    // -------------------------------------------------------------------
    // Class 5: unrun — a live-pool fetch failure must not silently pass.
    // -------------------------------------------------------------------
    await test('unrun: livePoolsError set → ran=false, reason=<error>, and buildStaticSurfaces() emits the P1 unrun finding', () => {
      const id = uuid(5);
      const f = writeScratch('unrun.html', buildPage({ anchors: [id], updatedLine: FRESH_LINE }));
      const direct = prescanStaticPages({ pages: [f], livePoolsError: 'simulated fetch failure', today: TODAY });
      assert(direct.poolLinkLiveness.ran === false, `expected ran === false; got ${JSON.stringify(direct.poolLinkLiveness)}`);
      assert(direct.poolLinkLiveness.reason === 'simulated fetch failure',
        `expected reason to be the injected error; got ${JSON.stringify(direct.poolLinkLiveness)}`);
      assert(poolLinkSuspects(direct).length === 0, `an unrun scan must emit zero pool-link-liveness suspects (it never ran); got ${JSON.stringify(poolLinkSuspects(direct))}`);

      // Smallest real path to the buildStaticSurfaces() finding: force the
      // prescan block to actually execute (prescan:true, cap>0) against the
      // real committed tokens/+chains/ corpus (buildStaticSurfaces() has no
      // opts.pages passthrough of its own), with the error forwarded.
      const built = buildStaticSurfaces({ staticPages: undefined, prescan: true, prescanMax: 1, staticSample: 1, livePoolsError: 'simulated fetch failure' });
      assert(built.prescan.poolLinkLiveness.ran === false, `expected built prescan.poolLinkLiveness.ran === false; got ${JSON.stringify(built.prescan.poolLinkLiveness)}`);
      const unrunFinding = built.prescanFindings.find((fnd) => fnd.check === 'static-prescan:pool-link-liveness-unrun');
      assert(unrunFinding, `expected a static-prescan:pool-link-liveness-unrun finding; got: ${JSON.stringify(built.prescanFindings)}`);
      assert(unrunFinding.severity === 'P1', `expected the unrun finding to be P1; got ${unrunFinding.severity}`);
      assert(unrunFinding.detail.includes('simulated fetch failure'), `expected the finding detail to quote the error; got: ${unrunFinding.detail}`);
    });

    // -------------------------------------------------------------------
    // Class 6: not requested — the default, off, silent state.
    // -------------------------------------------------------------------
    await test('not requested: no livePoolIds, no livePoolsError → ran=false, reason="not requested", ZERO suspects, ZERO findings', () => {
      const id = uuid(6);
      const f = writeScratch('not_requested.html', buildPage({ anchors: [id], updatedLine: FRESH_LINE }));
      const direct = prescanStaticPages({ pages: [f], today: TODAY });
      assert(direct.poolLinkLiveness.ran === false && direct.poolLinkLiveness.reason === 'not requested',
        `expected ran=false, reason="not requested"; got ${JSON.stringify(direct.poolLinkLiveness)}`);
      assert(poolLinkSuspects(direct).length === 0, `expected 0 pool-link-liveness suspects; got ${JSON.stringify(poolLinkSuspects(direct))}`);

      const built = buildStaticSurfaces({ staticPages: undefined, prescan: true, prescanMax: 1, staticSample: 1 });
      assert(built.prescan.poolLinkLiveness.ran === false && built.prescan.poolLinkLiveness.reason === 'not requested',
        `expected built prescan.poolLinkLiveness ran=false reason="not requested"; got ${JSON.stringify(built.prescan.poolLinkLiveness)}`);
      const unrunFinding = built.prescanFindings.find((fnd) => fnd.check === 'static-prescan:pool-link-liveness-unrun');
      assert(!unrunFinding, `"not requested" must NEVER emit the unrun finding (that would conflate the normal off state with a real failure); got: ${JSON.stringify(unrunFinding)}`);
      const anyPoolLinkFinding = built.prescanFindings.find((fnd) => fnd.check === 'static-prescan:pool-link-liveness');
      assert(!anyPoolLinkFinding, `"not requested" must emit ZERO pool-link-liveness findings; got: ${JSON.stringify(anyPoolLinkFinding)}`);
    });

    // =====================================================================
    // Real-corpus non-vacuity (the headline case, spec 184 acceptance
    // criteria 2/5). Loads the REAL live pool set via cta181.loadPools()
    // (POOLS_FIXTURE / 6h cache / live fetch — same as test_seo_cta_targets.js
    // itself) and scans the REAL committed tokens/+chains/ corpus. If the
    // pool set cannot be loaded, this FAILS LOUDLY — it never passes
    // vacuously (no try/catch swallowing the throw).
    // =====================================================================
    const usdcAbs = path.join(ROOT, 'tokens', 'usdc.html');
    const usdcMd5Before = md5(usdcAbs);

    const livePools = await cta181.loadPools();
    assert(Array.isArray(livePools) && livePools.length > 0, 'cta181.loadPools() returned an empty/invalid pool set — refusing to proceed vacuously');
    const liveIdsSet = new Set(livePools.map((p) => p.pool));
    console.log(`  (real pool set: ${livePools.length} pools, ${liveIdsSet.size} distinct ids)`);

    let realResult;
    await test('REAL CORPUS true negative: today\'s committed tokens/+chains/ ?pool= deep links are GREEN (contract=0, stale=0, drift within budget)', () => {
      realResult = prescanStaticPages({ livePoolIds: liveIdsSet });
      assert(realResult.scanned >= 2000, `expected scanned >= 2000, got ${realResult.scanned}`);
      const pll = realResult.poolLinkLiveness;
      assert(pll.ran === true, `expected the real-corpus scan to have run; got ${JSON.stringify(pll)}`);
      console.log(`  real-corpus pool-link-liveness: checkedIds=${pll.checkedIds.toLocaleString('en-US')}, ` +
        `deadIds=${pll.deadIds}, pagesAffected=${pll.pagesAffected}, contract=${pll.contract}, stale=${pll.stale}, ` +
        `drift=${pll.drift} (allowance=${pll.allowance.toLocaleString('en-US', { maximumFractionDigits: 2 })}, ` +
        `${pll.checkedIds > 0 ? ((pll.drift / pll.checkedIds) * 100).toFixed(3) : '0.000'}% of checked ids), ok=${pll.ok}`);
      console.log('  (spec 184 hand-measurement on 2026-07-30: 3,677 distinct links, 4 dead, 5 pages affected — ' +
        'today\'s numbers above will differ by ordinary churn + the daily bake; see spec 184\'s own delta note)');
      assert(pll.contract === 0, `expected contract === 0 on the real committed corpus; got ${pll.contract}`);
      assert(pll.stale === 0, `expected stale === 0 on the real committed corpus; got ${pll.stale}`);
      assert(pll.drift <= pll.allowance, `expected drift (${pll.drift}) <= allowance (${pll.allowance}); got ok=${pll.ok}`);
      assert(pll.ok === true, `expected the real-corpus gate to be GREEN today; got ${JSON.stringify(pll)}`);
      assert(poolLinkSuspects(realResult).length === 0, `a GREEN gate must emit zero pool-link-liveness suspects; got ${JSON.stringify(poolLinkSuspects(realResult))}`);
    });

    // ---- The stale branch, on a REAL page copied to scratch (181's method verbatim) ----
    // Group 3 is an arbitrary post-id query tail (e.g. "&src=seo_token", item
    // 203) — tolerated AND preserved through the id swap below, so this stays
    // a STALE failure (the id is still backed by its own tp-pool-link anchor,
    // tail intact) and never degrades into a CONTRACT failure.
    const ANCHOR_HREF_RE = /(class="tp-pool-link" href="https:\/\/www\.defi\.garden\/\?pool=)([0-9a-f-]+)([^"]*)(")/i;
    let backdatedFile;
    await test('REAL PAGE, backdated copy: swapping one live id for a syntactically-valid nonexistent uuid + backdating "Last updated" flips the gate RED with a stale suspect', () => {
      const sourceHtml = fs.readFileSync(usdcAbs, 'utf8');
      const m = sourceHtml.match(ANCHOR_HREF_RE);
      assert(m, 'fixture wiring check: tokens/usdc.html must contain at least one class="tp-pool-link" href="https://www.defi.garden/?pool=<id>" anchor — its shape moved out from under this test');
      const originalTail = m[3];
      const fakeId = '00000000-0000-4000-8000-000000000000';
      assert(!liveIdsSet.has(fakeId), 'fixture wiring check: the synthetic dead id must genuinely not be live right now');

      let modified = sourceHtml.replace(ANCHOR_HREF_RE, `$1${fakeId}$3$4`);
      assert(modified !== sourceHtml, 'fixture construction did not actually replace the anchor href');
      assert(modified.includes(`class="tp-pool-link" href="https://www.defi.garden/?pool=${fakeId}${originalTail}"`),
        'the swapped id must still be backed by its own tp-pool-link anchor, its query tail intact (this must be a stale failure, never a contract failure)');

      // Backdate "Last updated" well past the budget, relative to the REAL
      // clock (this scan intentionally does NOT inject `today` — it must
      // reflect actual runtime freshness, matching how the real corpus
      // itself is judged; see the header comment for why the synthetic
      // cases above pin `today` and this real-page case does not).
      const now = new Date();
      const realToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const backdated = lastUpdatedLine(realToday - (cta181.STALE_AFTER_DAYS + 10) * MS_PER_DAY);
      const beforeBackdate = modified;
      modified = modified.replace(/<p class="note">Last updated [^<]*<\/p>/, backdated);
      assert(modified !== beforeBackdate, 'fixture construction did not actually backdate the "Last updated" line');

      backdatedFile = writeScratch('usdc_backdated.html', modified);
      const result = prescanStaticPages({ pages: [backdatedFile], livePoolIds: liveIdsSet });
      const hits = poolLinkSuspects(result);
      const staleHit = hits.find((s) => /stale/.test(s.detail) && s.detail.includes(fakeId));
      assert(staleHit, `expected a stale pool-link-liveness suspect naming the swapped id; got: ${JSON.stringify(hits)}`);
      assert(result.poolLinkLiveness.stale >= 1, `expected poolLinkLiveness.stale >= 1; got ${JSON.stringify(result.poolLinkLiveness)}`);
      assert(result.poolLinkLiveness.ok === false, `expected the gate to go RED; got ${JSON.stringify(result.poolLinkLiveness)}`);

      // Non-vacuity (spec 184 acceptance criteria): neuter the signal on the
      // IDENTICAL broken copy — it must stop reddening, proving the redness
      // above was caused by the sub-rule actually running, not by anything
      // else about this fixture.
      const neutered = prescanStaticPages({ pages: [backdatedFile] });
      assert(neutered.poolLinkLiveness.ran === false && neutered.poolLinkLiveness.reason === 'not requested',
        `expected the neutered scan to be "not requested"; got ${JSON.stringify(neutered.poolLinkLiveness)}`);
      assert(poolLinkSuspects(neutered).length === 0,
        `neutering the signal must stop the broken copy from reddening; got ${JSON.stringify(poolLinkSuspects(neutered))}`);
    });

    await test('tokens/usdc.html is byte-untouched (md5) — only a scratch-dir COPY was ever modified', () => {
      const usdcMd5After = md5(usdcAbs);
      assert(usdcMd5After === usdcMd5Before, `tokens/usdc.html changed! before=${usdcMd5Before} after=${usdcMd5After}`);
    });
  } finally {
    cleanupScratch();
  }

  console.log(`\ntest_audit_pool_link_liveness.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
