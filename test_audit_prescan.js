/* Acceptance tests for the static-SEO prescan + promotion mechanism (backlog 157).

   `prescanStaticPages()` (audit-app.js) is a pure fs+regex scan over EVERY
   tokens/*.html + chains/*.html leaf page; `buildStaticSurfaces()` promotes
   up to `prescanMax` of its suspects into the rendered sample AHEAD of the
   uniform rotation. This file covers spec 157's acceptance criteria 1-7
   (criterion 8 — the pre-existing test_audit_app.js/test_seo_surface_audit.js
   staying green — is verified by just running those files, not here).

   Criteria 1/2/5/7 are non-rendered: they re-derive expected values FROM DISK
   independently of prescanStaticPages()'s own implementation (a fresh regex
   scan written in THIS file, not an import), because the junk-page set
   churns daily — hardcoding today's slugs would make the test lie tomorrow.

   Criteria 3/4/6 are REAL Chromium renders (a probe page is written into
   `tokens/` and removed in `finally`, even on failure), dispatched
   concurrently on separate ports/servers/browsers exactly like
   test_seo_surface_audit.js, for the same reason documented there: every
   static leaf page holds DOMContentLoaded ~10s (sandbox-blocked absolute
   `analytics.js` defer tag) — sequential dispatch would blow the 5-minute
   foreground timebox once >1 run needs >1 static page.

   Guarantee-not-luck sizing (criteria 3/4/6): rather than hoping a probe
   page gets promoted by chance, `prescanMax`/`staticSample` are sized at
   runtime to `(today's real pre-existing suspect count) + 1` so the
   promotion cap covers EVERY suspect, including the probe — promotion of the
   probe is then certain (cap >= suspect count => sampleBySeed returns the
   whole set), not a seed-lucky pick among competitors. If that count ever
   exceeds the static-sample ceiling (12), the setup assertion below fails
   loudly instead of flaking silently.

   Run: node test_audit_prescan.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAudit, prescanStaticPages } = require('./audit-app.js');

const ROOT = __dirname;
const MAX_STATIC_SAMPLE = 12; // mirrors audit-app.js's own ceiling (backlog 154)

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-prescan-${tag}-${process.pid}.json`); }

// ---------------------------------------------------------------------------
// Independent re-derivation of the junk-slug set straight from disk. This
// mirrors (does NOT import) audit-app.js's JUNK_SLUG_NUMERIC/JUNK_SLUG_DATE
// predicate, so criteria 1/5 prove prescanStaticPages()'s output against
// ground truth instead of comparing its own output to itself.
// ---------------------------------------------------------------------------
const JUNK_NUMERIC = /^[0-9]+$/;
const JUNK_DATE = /^[0-9]{1,2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[0-9]{2,4}$/i;

function listLeaf(dir) {
  let entries;
  try { entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); }
  catch (e) { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html') && e.name !== 'index.html')
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

function h1LeadToken(rel) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = (m ? m[1] : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return h1.split(/\s+/)[0] || '';
}

function deriveJunkSlugRelsFromDisk() {
  return listLeaf('tokens').concat(listLeaf('chains')).filter((rel) => {
    const lead = h1LeadToken(rel);
    return !!lead && (JUNK_NUMERIC.test(lead) || JUNK_DATE.test(lead));
  });
}

async function main() {
  // ---- Criteria 1/2 (non-rendered, pure fs) --------------------------------
  await test('criterion 1: scanned >= 2000 and junk-slug suspects exactly match the on-disk junk predicate', () => {
    const result = prescanStaticPages();
    assert(result.scanned >= 2000, `expected scanned >= 2000, got ${result.scanned}`);
    const junkFromScan = result.suspects.filter((s) => s.signal === 'junk-slug').map((s) => s.rel).sort();
    const junkFromDisk = deriveJunkSlugRelsFromDisk().sort();
    assert(JSON.stringify(junkFromScan) === JSON.stringify(junkFromDisk),
      `junk-slug suspect set does not match the independently re-derived on-disk set.\n  scan: ${JSON.stringify(junkFromScan)}\n  disk: ${JSON.stringify(junkFromDisk)}`);
  });

  await test('criterion 2: digit-leading real tickers (0x0, 1inch, 3crv, a0t) appear in NO suspect list', () => {
    const result = prescanStaticPages();
    const guarded = ['tokens/0x0.html', 'tokens/1inch.html', 'tokens/3crv.html', 'tokens/a0t.html'];
    for (const rel of guarded) {
      const hit = result.suspects.find((s) => s.rel === rel);
      assert(!hit, `${rel} must never appear as a prescan suspect (a0t specifically guards the tightened absurd-magnitude regex); got: ${JSON.stringify(hit)}`);
    }
  });

  // ---- Criteria 3/4/5/6/7 (REAL Chromium renders + result-shape checks) ----
  const probeRel = `tokens/_audit_probe_${process.pid}.html`;
  const probeAbs = path.join(ROOT, probeRel);
  const probeSlug = `tokens/_audit_probe_${process.pid}`;
  const sourceAbs = path.join(ROOT, 'tokens', 'usdc.html');

  const outPaths = {
    c3: tmpOut('c3'), c4: tmpOut('c4'), c5: tmpOut('c5'), c7: tmpOut('c7'),
    c6a1: tmpOut('c6a1'), c6a2: tmpOut('c6a2'), c6b: tmpOut('c6b')
  };

  let r3, r4, r5, r7, c6a1, c6a2, c6b;
  let diskJunkCountBeforeProbe;
  try {
    // Size prescanMax/staticSample so the cap covers every real suspect PLUS
    // the probe — see header note. Re-derived from disk, not hardcoded.
    diskJunkCountBeforeProbe = deriveJunkSlugRelsFromDisk().length;
    const preExisting = prescanStaticPages().suspects;
    const preExistingRelCount = new Set(preExisting.map((s) => s.rel)).size;
    const totalWithProbe = preExistingRelCount + 1;
    assert(totalWithProbe <= MAX_STATIC_SAMPLE,
      `test assumption broken: ${totalWithProbe} real suspects (incl. probe) exceed the ${MAX_STATIC_SAMPLE}-page static-sample ceiling — criteria 3/4/6 can no longer guarantee promotion by sizing prescanMax alone; needs redesign, not a hardcoded skip.`);
    const prescanMax = totalWithProbe;
    const staticSample = totalWithProbe;

    // Probe: a copy of a real token page with its <h1> lead token swapped for
    // a DATE-shaped junk token (spec 157 explicitly calls for a date-shaped
    // lead). Obviously-temporary filename; removed in `finally` below even
    // on failure.
    const sourceHtml = fs.readFileSync(sourceAbs, 'utf8');
    const probeHtml = sourceHtml.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '<h1>9NOV2026 DeFi Yields</h1>');
    assert(probeHtml !== sourceHtml, 'probe construction did not actually replace the <h1> — tokens/usdc.html shape must have changed upstream');
    fs.writeFileSync(probeAbs, probeHtml);

    // Criterion 3 (positive) / 4 (non-vacuity): identical config except
    // prescan on vs off.
    const pC3 = runAudit({
      port: 8930, staticOnly: true, prescan: true, prescanMax, staticSample,
      staticSeed: 'audit-prescan-c3c4-seed', outPath: outPaths.c3
    });
    const pC4 = runAudit({
      port: 8931, staticOnly: true, prescan: false, prescanMax, staticSample,
      staticSeed: 'audit-prescan-c3c4-seed', outPath: outPaths.c4
    });

    // Criterion 5: aggregate findings. `only: ['static-prescan']` matches no
    // real surface name, so nothing actually renders (fast) while the
    // aggregate findings (not tied to a rendered surface) survive the
    // `opts.only` allowlist applied to them.
    const pC5 = runAudit({ port: 8932, prescan: true, only: ['static-prescan'], outPath: outPaths.c5 });

    // Criterion 6: determinism. Same seed twice -> identical prescan.promoted
    // + surfacesCovered; a different seed, with suspects <= cap (guaranteed
    // by the sizing above), still promotes the same SET (order may differ).
    const pC6a1 = runAudit({ port: 8933, staticOnly: true, prescan: true, prescanMax, staticSample, staticSeed: 'audit-prescan-c6-seed-A', outPath: outPaths.c6a1 });
    const pC6a2 = runAudit({ port: 8934, staticOnly: true, prescan: true, prescanMax, staticSample, staticSeed: 'audit-prescan-c6-seed-A', outPath: outPaths.c6a2 });
    const pC6b = runAudit({ port: 8935, staticOnly: true, prescan: true, prescanMax, staticSample, staticSeed: 'audit-prescan-c6-seed-B', outPath: outPaths.c6b });

    // Criterion 7: budget unchanged, at the REAL default sizing (prescanMax=4,
    // staticSample=6) — deliberately NOT reusing the c3/c4/c6 custom sizing,
    // since this criterion is about the shipped defaults, not this file's
    // guarantee-not-luck test rig.
    const pC7 = runAudit({ port: 8936, staticOnly: true, prescan: true, outPath: outPaths.c7 });

    [r3, r4, r5, c6a1, c6a2, c6b, r7] = await Promise.all([pC3, pC4, pC5, pC6a1, pC6a2, pC6b, pC7]);
  } finally {
    try { fs.unlinkSync(probeAbs); } catch (e) {}
  }

  await test('criterion 3: promotion, REAL render — probe page covered + rendered junk-slug P1 finding', async () => {
    const probeSurface = `static-page:${probeSlug}`;
    assert(r3.surfacesCovered.includes(probeSurface),
      `expected surfacesCovered to include the promoted probe surface "${probeSurface}"; got ${JSON.stringify(r3.surfacesCovered)}`);
    const hit = r3.findings.find((f) => f.surface === probeSurface && f.check === 'junk-slug' && f.severity === 'P1');
    assert(hit, `expected a rendered junk-slug P1 finding for the probe surface; got: ${JSON.stringify(r3.findings.filter((f) => f.surface === probeSurface))}`);
  });

  await test('criterion 4: non-vacuity — identical config with prescan:false does NOT cover the probe slug', async () => {
    const probeSurface = `static-page:${probeSlug}`;
    assert(!r4.surfacesCovered.includes(probeSurface),
      `prescan:false must not cover the probe surface (that would mean criterion 3 passed by a lucky uniform pick, not promotion); got ${JSON.stringify(r4.surfacesCovered)}`);
  });

  await test('criterion 5: aggregate static-prescan:junk-slug count matches the independently re-derived on-disk count; clean signals emit nothing', async () => {
    // r5 ran concurrently with the OTHER rendered cases, i.e. WHILE the
    // date-shaped probe page existed on disk — so the on-disk junk count at
    // r5's scan time is the pre-probe count (re-derived above, before the
    // probe was written) PLUS the probe itself (its <h1> is date-shaped by
    // construction, so it legitimately IS on-disk junk for the duration of
    // this run — this is not a fudge, it is what was really on disk then).
    const expectedCount = diskJunkCountBeforeProbe + 1;
    const agg = r5.findings.find((f) => f.surface === 'static-prescan' && f.check === 'static-prescan:junk-slug');
    assert(agg, `expected an aggregate static-prescan:junk-slug finding; got: ${JSON.stringify(r5.findings)}`);
    assert(agg.severity === 'P1', `static-prescan:junk-slug must be P1, got ${agg.severity}`);
    assert(agg.detail.includes(String(expectedCount)),
      `aggregate finding detail does not reference the expected count ${expectedCount} (pre-probe ${diskJunkCountBeforeProbe} + probe): ${agg.detail}`);
    for (const sig of ['zero-yield-claim', 'broken-number-literal', 'absurd-magnitude']) {
      const bad = r5.findings.find((f) => f.check === `static-prescan:${sig}`);
      assert(!bad, `expected NO aggregate finding for a zero-suspect signal (${sig}); got: ${JSON.stringify(bad)}`);
    }
    assert(r5.prescan && r5.prescan.bySignal && r5.prescan.bySignal['junk-slug'] === expectedCount,
      `result.prescan.bySignal['junk-slug'] should equal ${expectedCount}, got ${JSON.stringify(r5.prescan)}`);
    assert(r5.prescan.scanned >= 2000, `result.prescan.scanned should be >= 2000, got ${r5.prescan.scanned}`);
  });

  await test('criterion 6: determinism — same seed gives identical prescan.promoted + surfacesCovered; a different seed (suspects<=cap) promotes the same SET', async () => {
    assert(JSON.stringify(c6a1.prescan.promoted) === JSON.stringify(c6a2.prescan.promoted),
      `same seed must give identical prescan.promoted: ${JSON.stringify(c6a1.prescan.promoted)} vs ${JSON.stringify(c6a2.prescan.promoted)}`);
    assert(JSON.stringify(c6a1.surfacesCovered) === JSON.stringify(c6a2.surfacesCovered),
      `same seed must give identical surfacesCovered: ${JSON.stringify(c6a1.surfacesCovered)} vs ${JSON.stringify(c6a2.surfacesCovered)}`);
    const setA = [...c6a1.prescan.promoted].sort();
    const setB = [...c6b.prescan.promoted].sort();
    assert(setA.length > 0, 'expected at least one promoted suspect in the determinism run');
    assert(JSON.stringify(setA) === JSON.stringify(setB),
      `suspects <= cap: a different seed must still promote the same SET (suspicion-driven, not seed-driven): ${JSON.stringify(setA)} vs ${JSON.stringify(setB)}`);
  });

  await test('criterion 7: budget unchanged — default-config (prescanMax=4, sampleSize=6) static surfaces stay within anchor + sampleSize', async () => {
    assert(r7.surfacesCovered.includes('static-page'), `expected the anchor surface "static-page" in a default run; got ${JSON.stringify(r7.surfacesCovered)}`);
    assert(r7.surfacesCovered.length <= 7,
      `default static surface count ${r7.surfacesCovered.length} exceeds anchor(1) + sampleSize(6) = 7; got ${JSON.stringify(r7.surfacesCovered)}`);
  });

  for (const p of Object.values(outPaths)) { try { fs.unlinkSync(p); } catch (e) {} }

  console.log(`\ntest_audit_prescan.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
