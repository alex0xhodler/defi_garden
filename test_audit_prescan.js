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
const crypto = require('crypto');
const { runAudit, prescanStaticPages, buildStaticSurfaces, reconcilePrescanFindings } = require('./audit-app.js');

const ROOT = __dirname;
const MAX_STATIC_SAMPLE = 24; // mirrors audit-app.js's own ceiling (backlog 154, raised 12->24 by backlog 197 to make room for the KO half without halving EN throughput)

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-prescan-${tag}-${process.pid}.json`); }

// ---------------------------------------------------------------------------
// Fixture helpers for backlog 172 (link-target-integrity on the HTML static
// surface) — every fixture is written under os.tmpdir() and removed via
// cleanupLinkFixtures() below, same convention as
// test_audit_text_surfaces.js's writeFixture()/cleanupFixtures() (169).
// ---------------------------------------------------------------------------
let linkFixtureDirs = [];
function writeLinkFixture(name, html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit172-'));
  linkFixtureDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, html);
  return file;
}
function cleanupLinkFixtures() {
  for (const d of linkFixtureDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
  linkFixtureDirs = [];
}
// A minimal, deliberately boring leaf page: a real (non-junk) <h1>, a
// plausible APY line inside the sanity rail, and nothing else — so a
// fixture only ever trips the ONE link-target-integrity sub-rule its own
// `bodyExtra` snippet adds, never a coincidental hit from one of the four
// pre-existing signals (junk-slug/zero-yield-claim/broken-number-literal/
// absurd-magnitude all require specific unrelated shapes this template
// never produces).
function minimalPage(bodyExtra) {
  return `<!doctype html>
<html lang="en">
<head><title>Test USDC</title></head>
<body>
<h1>USDC Yields</h1>
<p>Real content here, 5.2% APY, no junk.</p>
${bodyExtra || ''}
</body>
</html>`;
}

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

// backlog 197 — extended to the four-dir population prescanStaticPages()
// itself now scans by default (tokens/chains + ko/tokens/ko/chains), so
// criteria 1/5 keep proving the scan against ground truth for the WHOLE
// default population, not just its EN half. Spec 197 evidence 5 measured
// zero KO junk-slug suspects; if that ever stops being true, this function
// (independent of audit-app.js's own implementation) will legitimately
// start returning KO rels too, and criterion 1 below will correctly reflect it.
const STATIC_LEAF_DIRS_197 = ['tokens', 'chains', 'ko/tokens', 'ko/chains'];
function deriveJunkSlugRelsFromDisk() {
  return STATIC_LEAF_DIRS_197.reduce((acc, dir) => acc.concat(listLeaf(dir)), []).filter((rel) => {
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

  // ---------------------------------------------------------------------------
  // backlog 197 — the KO half of the estate (`ko/tokens/` + `ko/chains/`,
  // spec 197 evidence 2) enters the default population for the first time.
  // Every count below is DERIVED FROM DISK the same way listLeafPages()
  // itself derives it (isFile() && .endsWith('.html') && name !== 'index.html'),
  // never a hardcoded literal — spec 197's own acceptance requirement, so
  // this survives daily estate churn instead of lying tomorrow.
  // ---------------------------------------------------------------------------
  await test('spec 197 criterion: prescanStaticPages() with no opts.pages scans EN+KO combined — scanned equals the sum of all four dirs\' real leaf counts, and scannedByFamily matches each dir individually', () => {
    const diskCounts = {
      tokens: listLeaf('tokens').length,
      chains: listLeaf('chains').length,
      koTokens: listLeaf('ko/tokens').length,
      koChains: listLeaf('ko/chains').length
    };
    const expectedTotal = diskCounts.tokens + diskCounts.chains + diskCounts.koTokens + diskCounts.koChains;
    const result = prescanStaticPages();
    assert(result.scanned === expectedTotal,
      `expected result.scanned (${result.scanned}) to equal the disk-derived EN+KO total (${expectedTotal} = ${diskCounts.tokens} tokens + ${diskCounts.chains} chains + ${diskCounts.koTokens} ko/tokens + ${diskCounts.koChains} ko/chains)`);
    assert(result.scannedByFamily, `expected result.scannedByFamily to be present; got ${JSON.stringify(result)}`);
    assert(result.scannedByFamily.tokens === diskCounts.tokens, `scannedByFamily.tokens (${result.scannedByFamily.tokens}) should equal the disk count (${diskCounts.tokens})`);
    assert(result.scannedByFamily.chains === diskCounts.chains, `scannedByFamily.chains (${result.scannedByFamily.chains}) should equal the disk count (${diskCounts.chains})`);
    assert(result.scannedByFamily.koTokens === diskCounts.koTokens, `scannedByFamily.koTokens (${result.scannedByFamily.koTokens}) should equal the disk count (${diskCounts.koTokens})`);
    assert(result.scannedByFamily.koChains === diskCounts.koChains, `scannedByFamily.koChains (${result.scannedByFamily.koChains}) should equal the disk count (${diskCounts.koChains})`);
  });

  await test('spec 197 true negative (evidence 5), EXECUTED: the unmodified committed ko/tokens/ + ko/chains/ estate scans clean — 0 suspects of any signal', () => {
    const koPages = listLeaf('ko/tokens').concat(listLeaf('ko/chains'));
    assert(koPages.length > 1000, `fixture wiring check: expected a large real ko/tokens+ko/chains population, got ${koPages.length}`);
    const result = prescanStaticPages({ pages: koPages });
    assert(result.scanned === koPages.length, `expected scanned === ${koPages.length}, got ${result.scanned}`);
    assert(result.suspects.length === 0,
      `expected ZERO suspects on the unmodified committed KO estate (matches spec 197 evidence 5); got ${result.suspects.length}: ${JSON.stringify(result.suspects.slice(0, 5))}. ` +
      'If this is genuinely red, this is a REAL finding — per spec 197, do not relax the signal and do not fix the emitter here; report it back so it can be filed as a new backlog item.');
  });

  await test('spec 197 positive control, EXECUTED: a scratch COPY of a real KO page carrying a known junk-slug signal is detected by the KO leg, and the original committed page is byte-unchanged', () => {
    // Mirrors the EN positive-control pattern used later in this file
    // (criterion 3's probe: a real page copied, its <h1> lead token swapped
    // for a date-shaped junk token) verbatim, aimed at ko/tokens/ instead —
    // written under ko/tokens/ itself (not a random scratch dir) so
    // listLeafPages('ko/tokens')'s own real directory-scan predicate is what
    // gets exercised, same as the EN probe below exercises listLeafPages('tokens').
    const sourceAbs = path.join(ROOT, 'ko', 'tokens', 'usdc.html');
    const probeRel = `ko/tokens/_audit197_probe_${process.pid}.html`;
    const probeAbs = path.join(ROOT, probeRel);
    const probeSlug = probeRel.replace(/\.html$/, '');
    const origMd5Before = crypto.createHash('md5').update(fs.readFileSync(sourceAbs)).digest('hex');
    try {
      const sourceHtml = fs.readFileSync(sourceAbs, 'utf8');
      const probeHtml = sourceHtml.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '<h1>9NOV2026 코 DeFi Yields</h1>');
      assert(probeHtml !== sourceHtml, 'probe construction did not actually replace the <h1> — ko/tokens/usdc.html shape must have changed upstream');
      fs.writeFileSync(probeAbs, probeHtml);

      const result = prescanStaticPages(); // no opts.pages — exercises the REAL default population, including the new probe file on disk
      const hit = result.suspects.find((s) => s.rel === probeRel && s.signal === 'junk-slug');
      assert(hit, `expected the KO probe page "${probeRel}" to be detected as a junk-slug suspect by the default (unfiltered) scan; got suspects matching that rel: ${JSON.stringify(result.suspects.filter((s) => s.rel === probeRel))}`);
      assert(result.scannedByFamily.koTokens >= 1, `expected scannedByFamily.koTokens to count the probe (and every other ko/tokens page); got ${JSON.stringify(result.scannedByFamily)}`);
    } finally {
      try { fs.unlinkSync(probeAbs); } catch (e) {}
    }
    const origMd5After = crypto.createHash('md5').update(fs.readFileSync(sourceAbs)).digest('hex');
    assert(origMd5After === origMd5Before,
      `expected the original committed ko/tokens/usdc.html to be byte-unchanged (md5 before=${origMd5Before}, after=${origMd5After}) — proof the detection above came from the scratch probe file, never from editing the real KO estate`);
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

  // backlog 197 — this criterion's own numbers moved WITH the item: the
  // budget was deliberately raised (DEFAULT_STATIC_SAMPLE 6->12) so the new
  // KO half gets an equal share without halving EN throughput (spec 197
  // design decision 5 — EN still gets exactly 4 tokens + 2 chains, byte-
  // identical to pre-197; KO gets the same 4+2 alongside it). "Budget
  // unchanged" now means "anchor(1) + sampleSize(12) = 13", not the pre-197
  // "anchor(1) + sampleSize(6) = 7" — the invariant this criterion actually
  // protects (promoted pages replace uniform picks, never grow the total
  // static-page render budget) is unchanged; only the total moved with the
  // deliberate budget raise.
  await test('criterion 7 (updated by spec 197): budget unchanged in SHAPE — default-config (prescanMax=4, sampleSize=12 post-197) static surfaces stay within anchor + sampleSize', async () => {
    assert(r7.surfacesCovered.includes('static-page'), `expected the anchor surface "static-page" in a default run; got ${JSON.stringify(r7.surfacesCovered)}`);
    assert(r7.surfacesCovered.length <= 13,
      `default static surface count ${r7.surfacesCovered.length} exceeds anchor(1) + sampleSize(12) = 13 (post-197 default); got ${JSON.stringify(r7.surfacesCovered)}`);
    const koSurfaces = r7.surfacesCovered.filter((s) => s.includes('ko/'));
    assert(koSurfaces.length > 0, `expected at least one rendered "ko/" static surface in a default run (backlog 197's own point); got ${JSON.stringify(r7.surfacesCovered)}`);
  });

  for (const p of Object.values(outPaths)) { try { fs.unlinkSync(p); } catch (e) {} }

  // ---------------------------------------------------------------------------
  // spec 171 — A6: text-surface prescan is never downgraded, even when its
  // signal name is IDENTICAL to a pool/static signal that IS downgradable
  // ('apy-rail-breach' is a real key in both TEXT_SURFACE_SIGNALS and
  // POOL_PRESCAN_SIGNALS, audit-app.js — not a hypothetical). The guarantee
  // is architectural (runAudit() simply never calls reconcilePrescanFindings
  // against textSurfaceFindings), not a rule inside the helper itself — so
  // this is two tests, not one: a non-vacuity proof that the helper has no
  // built-in text-surface immunity (A6a), and a source-level assertion that
  // runAudit()'s only two call sites never hand it textSurfaceFindings (A6b).
  // Without A6a, A6b alone would be unfalsifiable — a helper that could never
  // downgrade ANYTHING would also pass A6b trivially.
  // ---------------------------------------------------------------------------
  await test('A6a (spec 171, non-vacuity): reconcilePrescanFindings has no built-in text-surface exemption — the identical "apy-rail-breach" signal, fully promoted + rendered clean, WOULD downgrade under prefix:"text-surfaces" if it were ever called that way', () => {
    const f = { surface: 'text-surfaces', viewport: 'n/a', check: 'text-surfaces:apy-rail-breach', severity: 'P0',
      detail: '1 of 2 text surfaces match apy-rail-breach — examples: llms.txt' };
    const suspects = [{ rel: 'llms.txt', signal: 'apy-rail-breach' }];
    reconcilePrescanFindings([f], {
      prefix: 'text-surfaces',
      suspects,
      suspectKey: (s) => s.rel,
      promotedKeys: new Set(['llms.txt']),
      keyToSurface: (rel) => `static-page:${rel}`,
      coveredSurfaces: new Set(['static-page:llms.txt']),
      findingsBySurface: new Map()
    });
    assert(f.severity === 'P2',
      `expected the helper itself to downgrade under these fully-clean conditions regardless of prefix; got ${f.severity}. ` +
      'If this assertion fails because the helper now special-cases a prefix, A6b (below) needs re-reading, not deletion — the real ' +
      'guarantee must stay "never called this way", not "called but ignored".');
  });

  // ---------------------------------------------------------------------------
  // backlog 185 Leg A — A6b must count REAL invocations of
  // "reconcilePrescanFindings(", never raw-text mentions: items 183/184 both
  // added PROSE that contains that literal substring inside a comment
  // (audit-app.js:2741, :3127 — "Mirrors reconcilePrescanFindings()'s..." /
  // "...reconcilePrescanFindings() is already exported...") without adding a
  // real call site, which drifted a bare src.match() count from 3 to 5. This
  // strips line comments, block comments and string/template literals BEFORE
  // counting, so only real source structure remains. Hand-written as a small
  // character scanner (not a single regex) specifically so a `//` or `/*`
  // sequence living INSIDE a string literal is consumed as string content
  // first and can never be mis-parsed as a comment start — see
  // specs/185-notes.md for how this was checked against this exact file's
  // regex literals (none contain an un-escaped "//"/"/*" outside a string).
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // backlog 186 — the comment/string scanner above had no regex-literal
  // state, so it misread two LIVE shapes: (a) a regex character class
  // containing a literal `/*`, e.g. `/[/*]/`, was read as a block-comment
  // start with no closing `*/`, silently swallowing the rest of the file (any
  // real call site added afterwards goes uncounted — A6b stays green on
  // exactly the event it exists to catch); (b) a `"` inside a regex
  // character class (LIVE at audit-app.js:324/771/811 before this fix) was
  // read as a string opener, eating real code up to the next literal `"`
  // (a `while` loop and several statements — see specs/186.md Evidence for
  // the exact spans measured, and specs/186-notes.md for the before/after
  // re-measurement). Leg A below teaches the scanner regex-literal state:
  // whether a `/` opens a regex or is division/`/=` is decided by the
  // previous significant emitted character — the standard heuristic every
  // real JS tokenizer uses (`//`/`/*` themselves can never legally OPEN a
  // regex — an empty regex body and a bare leading `*` quantifier are both
  // invalid JS — so they always fall through to the ordinary comment
  // branches unchanged, regardless of position). Leg B (further down, in the
  // tail-survival tests) adds an invariant so any FUTURE whole-file swallow
  // of this shape fails loudly instead of silently under-counting.
  // ---------------------------------------------------------------------------
  const REGEX_PREV_PUNCT = /[(,=:\[!&|?{};+\-*%~^<>]$/;
  const REGEX_PREV_KEYWORDS = /(?:^|[^A-Za-z0-9_$])(return|typeof|case|in|of|new|delete|void|do|else|yield|await)$/;
  function isRegexPosition(emittedSoFar) {
    const trimmed = emittedSoFar.replace(/\s+$/, '');
    if (trimmed.length === 0) return true; // nothing emitted yet
    if (REGEX_PREV_PUNCT.test(trimmed)) return true;
    if (REGEX_PREV_KEYWORDS.test(trimmed)) return true;
    return false;
  }
  function stripJsCommentsAndStrings(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      const ch = src[i];
      // Leg A: the regex-literal check runs BEFORE the `//`/`/*` comment
      // branches below, so `/[/*]/` at a regex position is parsed as one
      // regex literal, never mis-read as a comment start.
      if (ch === '/' && src[i + 1] !== '/' && src[i + 1] !== '*' && isRegexPosition(out)) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const c = src[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '\n') break; // unterminated regex literal — bail defensively, never run to EOF
          if (c === '[') { inClass = true; j++; continue; }
          if (c === ']') { inClass = false; j++; continue; }
          if (c === '/' && !inClass) { j++; break; }
          j++;
        }
        while (j < n && /[a-zA-Z]/.test(src[j])) j++; // trailing regex flags
        i = j;
        continue;
      }
      const two = src.slice(i, i + 2);
      if (two === '//') {
        const nl = src.indexOf('\n', i);
        i = nl === -1 ? n : nl;
        continue;
      }
      if (two === '/*') {
        const end = src.indexOf('*/', i + 2);
        i = end === -1 ? n : end + 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        let j = i + 1;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === quote) { j++; break; }
          j++;
        }
        i = j;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }
  function countReconcileCallSites(src) {
    return (stripJsCommentsAndStrings(src).match(/reconcilePrescanFindings\(/g) || []).length;
  }

  // ---------------------------------------------------------------------------
  // backlog 186 criterion 3 — FROZEN REFERENCE IMPLEMENTATION, NOT LIVE CODE.
  // This is 185's PRE-FIX scanner, copied verbatim (character for character)
  // from `git show origin/main:test_audit_prescan.js` (the state of this repo
  // immediately BEFORE backlog 186's fix, lines ~313-345). It has no
  // regex-literal state at all — a `/` is only ever division/an ordinary
  // character, `//`/`/*` are unconditionally comment starts, `"`/`'`/`` ` ``
  // are unconditionally string openers — exactly the bug this item exists to
  // fix. Its ONLY job below is to prove, on scratch mutations, that the OLD
  // behavior really was silently wrong (specs/186.md criteria 3/4/8): the old
  // code stays green (count stuck at 3, tail marker dropped) on a change it
  // should have caught. Never used by A6b itself. Do not "improve" this
  // function — changing it defeats the non-vacuity proof it exists for.
  // ---------------------------------------------------------------------------
  function legacyStrip(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      const two = src.slice(i, i + 2);
      if (two === '//') {
        const nl = src.indexOf('\n', i);
        i = nl === -1 ? n : nl;
        continue;
      }
      if (two === '/*') {
        const end = src.indexOf('*/', i + 2);
        i = end === -1 ? n : end + 2;
        continue;
      }
      const ch = src[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        let j = i + 1;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === quote) { j++; break; }
          j++;
        }
        i = j;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }
  function countReconcileCallSitesLegacy(src) {
    return (legacyStrip(src).match(/reconcilePrescanFindings\(/g) || []).length;
  }

  // Leg B — the tail-survival marker is derived from audit-app.js's OWN final
  // executable line at run time (never hardcoded blind), so the invariant
  // cannot rot into a vacuous truth if that line is ever rewritten or moved
  // (specs/186.md Change, Leg B).
  function deriveTailMarker(src) {
    const lines = src.split('\n');
    for (let idx = lines.length - 1; idx >= 0; idx--) {
      const trimmed = lines[idx].trim();
      if (trimmed.startsWith('process.exit(')) return trimmed.replace(/;\s*$/, '');
    }
    return null;
  }

  // Shared mutation builder for the regex-literal non-vacuity tests below:
  // inserts `regexSnippet` immediately before the tail-marker line (i.e.
  // AFTER audit-app.js's 3 pre-existing real call sites, which all sit well
  // before the marker) and appends a genuine new call site after the marker.
  // This exact placement is load-bearing, not arbitrary: audit-app.js's LAST
  // literal `*/` occurs well before the tail marker, with none after it —
  // inserting the mutated regex anywhere after that point and before EOF is
  // what makes the PRE-FIX scanner's fake block-comment/string search find no
  // further closing token and run away to true EOF, reproducing the exact
  // "swallows the rest of the file" symptom from specs/186.md's Evidence
  // section, while leaving the 3 pre-existing call sites (all scanned before
  // the injection point is reached) uncorrupted. Verified empirically against
  // several placements before landing here — see specs/186-notes.md §6 for
  // why an earlier-in-file placement does NOT defeat the pre-fix scanner (it
  // recovers at a nearby unrelated `*/` and the old count stays 4, not 3,
  // which would make criterion 3 unfalsifiable).
  function buildTailMutation(origSrc, marker, regexSnippet, newCallSite) {
    const markerIdx = origSrc.indexOf(marker);
    assert(markerIdx !== -1, 'tail marker not found in audit-app.js — cannot build the 186 mutation fixture');
    const before = origSrc.slice(0, markerIdx);
    const from = origSrc.slice(markerIdx);
    return before + regexSnippet + '\n' + from + '\n' + newCallSite + '\n';
  }

  await test('A6b (spec 171): runAudit() never passes textSurfaceFindings to reconcilePrescanFindings — only prescanFindings (prefix static-prescan) and poolPrescanFindings (prefix pool-prescan)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    // backlog 185 leg A: count only REAL call sites (comments/strings
    // stripped first) — see countReconcileCallSites() above.
    const occurrences = countReconcileCallSites(src);
    assert(occurrences === 3,
      `expected exactly 3 REAL invocations of "reconcilePrescanFindings(" (1 function definition + 2 runAudit() call sites), comments/strings excluded — ` +
      `a new call site changes this count and needs its own A6-equivalent proof it never targets text-surfaces; got ${occurrences}`);
    assert(!src.includes('reconcilePrescanFindings(textSurfaceFindings'),
      'textSurfaceFindings must never be passed to reconcilePrescanFindings — text-surface prescan has no promotion mechanism (no `promoted` array) and must never be reconciled/downgraded');

    const staticCallIdx = src.indexOf('reconcilePrescanFindings(prescanFindings, {');
    const poolCallIdx = src.indexOf('reconcilePrescanFindings(poolPrescanFindings, {');
    assert(staticCallIdx !== -1, 'expected a reconcilePrescanFindings(prescanFindings, {...}) call site (the static leg)');
    assert(poolCallIdx !== -1, 'expected a reconcilePrescanFindings(poolPrescanFindings, {...}) call site (the pool leg)');
    assert(src.slice(staticCallIdx, staticCallIdx + 400).includes("prefix: 'static-prescan'"),
      'the static-leg call site must pass prefix: \'static-prescan\'');
    assert(src.slice(poolCallIdx, poolCallIdx + 400).includes("prefix: 'pool-prescan'"),
      'the pool-leg call site must pass prefix: \'pool-prescan\'');
  });

  await test('A6b non-vacuity (spec 185, direction a): a scratch COPY of audit-app.js gaining a GENUINE third call site trips the real-call-site count (3 -> 4)', () => {
    const origSrc = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    const origMd5Before = crypto.createHash('md5').update(origSrc).digest('hex');
    const baseline = countReconcileCallSites(origSrc);
    assert(baseline === 3, `test assumption broken: expected the real baseline count to be 3 before mutation, got ${baseline}`);

    const scratchFile = path.join(os.tmpdir(), `audit-app-185-a6b-scratch-a-${process.pid}.js`);
    try {
      const mutated = origSrc + "\nreconcilePrescanFindings(someOtherAggregateFindings, { prefix: 'other-prescan' });\n";
      fs.writeFileSync(scratchFile, mutated);
      const mutatedSrc = fs.readFileSync(scratchFile, 'utf8');
      const mutatedCount = countReconcileCallSites(mutatedSrc);
      assert(mutatedCount === 4, `expected a genuine third call site to move the count 3 -> 4 on the scratch copy; got ${mutatedCount}`);
      assert(mutatedCount !== 3, "the mutated copy must trip A6b's ===3 assertion (non-vacuity direction a)");
    } finally {
      try { fs.unlinkSync(scratchFile); } catch (e) {}
    }

    const origAfter = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    assert(crypto.createHash('md5').update(origAfter).digest('hex') === origMd5Before,
      'the real audit-app.js must be byte-identical after mutating only the scratch copy');
  });

  await test('A6b non-vacuity (spec 185, direction b): a scratch COPY gaining only a COMMENT mentioning reconcilePrescanFindings( does NOT trip the count (stays 3)', () => {
    const origSrc = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    const origMd5Before = crypto.createHash('md5').update(origSrc).digest('hex');

    const scratchFile = path.join(os.tmpdir(), `audit-app-185-a6b-scratch-b-${process.pid}.js`);
    try {
      const mutated = origSrc + "\n// another prose mention of reconcilePrescanFindings( added by the 185 non-vacuity test (direction b), not a call site\n";
      fs.writeFileSync(scratchFile, mutated);
      const mutatedSrc = fs.readFileSync(scratchFile, 'utf8');
      const mutatedCount = countReconcileCallSites(mutatedSrc);
      assert(mutatedCount === 3, `expected a comment-only mention to leave the real-call-site count unchanged at 3; got ${mutatedCount} (comment stripping regressed)`);
    } finally {
      try { fs.unlinkSync(scratchFile); } catch (e) {}
    }

    const origAfter = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    assert(crypto.createHash('md5').update(origAfter).digest('hex') === origMd5Before,
      'the real audit-app.js must be byte-identical after mutating only the scratch copy');
  });

  await test("A6b regex-literal non-vacuity (backlog 186, shape a): a scratch COPY carrying a regex character class containing a literal '/*' ( const RE_186 = /[/*]/; ) plus a genuine appended call site counts 4 under the FIXED scanner — and the frozen pre-fix legacyStrip stays silently green at 3, proving the regression this item exists to prevent", () => {
    const origSrc = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    const origMd5Before = crypto.createHash('md5').update(origSrc).digest('hex');
    const marker = deriveTailMarker(origSrc);
    assert(marker, 'expected to derive a process.exit(...) tail marker from audit-app.js');

    const scratchFile = path.join(os.tmpdir(), `audit-app-186-a6b-scratch-slashstar-${process.pid}.js`);
    try {
      const mutated = buildTailMutation(
        origSrc, marker,
        'const RE_186 = /[/*]/;',
        "reconcilePrescanFindings(someOtherAggregateFindings186a, { prefix: 'other-186-prescan-a' });"
      );
      fs.writeFileSync(scratchFile, mutated);
      const mutatedSrc = fs.readFileSync(scratchFile, 'utf8');

      const fixedCount = countReconcileCallSites(mutatedSrc);
      assert(fixedCount === 4, `expected the FIXED scanner to count 4 (3 real + 1 genuine new) on the /[/*]/  mutation; got ${fixedCount}`);

      const legacyCount = countReconcileCallSitesLegacy(mutatedSrc);
      assert(legacyCount === 3,
        `expected the frozen pre-fix legacyStrip to stay silently green at 3 on this exact mutation (the regression this item exists to prevent) — got ${legacyCount}. ` +
        'If this is no longer 3, the mutation fixture no longer reproduces the pre-186 bug and needs re-deriving, not deleting.');
    } finally {
      try { fs.unlinkSync(scratchFile); } catch (e) {}
    }

    const origAfter = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    assert(crypto.createHash('md5').update(origAfter).digest('hex') === origMd5Before,
      'the real audit-app.js must be byte-identical after mutating only the scratch copy');
  });

  await test('A6b regex-literal non-vacuity (backlog 186, shape b — the LIVE audit-app.js:324/771/811 shape): a scratch COPY carrying a regex character class containing a `"` plus a genuine appended call site counts 4 under the FIXED scanner, and 3 under legacyStrip', () => {
    const origSrc = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    const origMd5Before = crypto.createHash('md5').update(origSrc).digest('hex');
    const marker = deriveTailMarker(origSrc);
    assert(marker, 'expected to derive a process.exit(...) tail marker from audit-app.js');

    const scratchFile = path.join(os.tmpdir(), `audit-app-186-a6b-scratch-quoteclass-${process.pid}.js`);
    try {
      const mutated = buildTailMutation(
        origSrc, marker,
        'const RE_186B = /[^\\s"]*/;', // same shape as the LIVE audit-app.js:324/771/811 regexes: a `"` inside a character class
        "reconcilePrescanFindings(someOtherAggregateFindings186b, { prefix: 'other-186-prescan-b' });"
      );
      fs.writeFileSync(scratchFile, mutated);
      const mutatedSrc = fs.readFileSync(scratchFile, 'utf8');

      const fixedCount = countReconcileCallSites(mutatedSrc);
      assert(fixedCount === 4, `expected the FIXED scanner to count 4 (3 real + 1 genuine new) on the quote-in-character-class mutation; got ${fixedCount}`);

      const legacyCount = countReconcileCallSitesLegacy(mutatedSrc);
      assert(legacyCount === 3,
        `expected the frozen pre-fix legacyStrip to undercount at 3 on this exact mutation (the live audit-app.js:324/771/811 shape) — got ${legacyCount}.`);
    } finally {
      try { fs.unlinkSync(scratchFile); } catch (e) {}
    }

    const origAfter = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    assert(crypto.createHash('md5').update(origAfter).digest('hex') === origMd5Before,
      'the real audit-app.js must be byte-identical after mutating only the scratch copy');
  });

  await test('backlog 186 criterion 5 — division is not mistaken for a regex: synthetic `a / b`, `a /= b`, `(x + y) / 2` leave a division on the near side untouched, and a real call site on the FAR side of a division stays counted', () => {
    const stripped1 = stripJsCommentsAndStrings('const z = a / b;');
    assert(stripped1.includes('a / b') || stripped1.includes('a/b') || /a\s*\/\s*b/.test(stripped1),
      `expected the division in "a / b" to survive stripping untouched; got ${JSON.stringify(stripped1)}`);

    const stripped2 = stripJsCommentsAndStrings('let a = 10;\na /= b;');
    assert(/a\s*\/=\s*b/.test(stripped2), `expected the "/=" operator to survive stripping untouched; got ${JSON.stringify(stripped2)}`);

    const stripped3 = stripJsCommentsAndStrings('const avg = (x + y) / 2;');
    assert(/\(x \+ y\)\s*\/\s*2/.test(stripped3), `expected "(x + y) / 2" to survive stripping untouched (division after a closing paren); got ${JSON.stringify(stripped3)}`);

    const divisionThenCall = 'const avg = (x + y) / 2;\nreconcilePrescanFindings(foo, { prefix: "far-side" });\n';
    const count = countReconcileCallSites(divisionThenCall);
    assert(count === 1, `expected the real call site on the far side of a division to still be counted; got ${count}`);
  });

  await test('backlog 186 Leg B — tail-survival invariant: the real audit-app.js\'s own final-line marker is present in the raw source AND survives the FIXED stripper', () => {
    const origSrc = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    const marker = deriveTailMarker(origSrc);
    assert(marker, 'expected to derive a process.exit(...) tail marker from audit-app.js\'s own final lines');
    assert(origSrc.includes(marker), `expected the derived tail marker "${marker}" to actually be present in the raw source (invariant would be vacuous otherwise)`);
    const stripped = stripJsCommentsAndStrings(origSrc);
    assert(stripped.includes(marker), `expected the FIXED stripper's output to still contain the tail marker "${marker}" — a whole-file swallow would drop it`);
  });

  await test('backlog 186 Leg B non-vacuity: on the /[/*]/  -mutated scratch copy, the frozen pre-fix legacyStrip DROPS the tail marker; the FIXED stripper KEEPS it', () => {
    const origSrc = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    const origMd5Before = crypto.createHash('md5').update(origSrc).digest('hex');
    const marker = deriveTailMarker(origSrc);
    assert(marker, 'expected to derive a process.exit(...) tail marker from audit-app.js');
    assert(origSrc.includes(marker), 'sanity check: the marker must be present in the unmutated source first');

    const scratchFile = path.join(os.tmpdir(), `audit-app-186-legb-scratch-${process.pid}.js`);
    try {
      const mutated = buildTailMutation(
        origSrc, marker,
        'const RE_186 = /[/*]/;',
        "reconcilePrescanFindings(someOtherAggregateFindings186c, { prefix: 'other-186-prescan-c' });"
      );
      fs.writeFileSync(scratchFile, mutated);
      const mutatedSrc = fs.readFileSync(scratchFile, 'utf8');

      const legacyOut = legacyStrip(mutatedSrc);
      assert(!legacyOut.includes(marker),
        `expected the frozen pre-fix legacyStrip to DROP the tail marker on this mutation (proving the tail-survival invariant is non-vacuous — this is the exact "swallows the rest of the file" symptom from specs/186.md); marker was still present, so this mutation no longer reproduces the pre-186 bug`);

      const fixedOut = stripJsCommentsAndStrings(mutatedSrc);
      assert(fixedOut.includes(marker),
        `expected the FIXED stripper to KEEP the tail marker on this same mutation; it was dropped, meaning Leg A's regex-literal handling regressed`);
    } finally {
      try { fs.unlinkSync(scratchFile); } catch (e) {}
    }

    const origAfter = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    assert(crypto.createHash('md5').update(origAfter).digest('hex') === origMd5Before,
      'the real audit-app.js must be byte-identical after mutating only the scratch copy');
  });

  // ---------------------------------------------------------------------------
  // backlog 172 — link-target-integrity on the HTML static surface. Same
  // three sub-rules 169 shipped for llms.txt/llms-full.txt (prescanTextSurfaces()),
  // re-aimed at prescanStaticPages()'s own raw HTML. All cases below are
  // pure fs+regex (no runAudit(), no Playwright, no network) except where
  // explicitly noted.
  // ---------------------------------------------------------------------------
  try {
    await test('link-target-integrity: TRUE NEGATIVE — the real committed tokens/*.html + chains/*.html + ko/tokens/*.html + ko/chains/*.html pages (backlog 197: default population now covers all four) produce ZERO link-target-integrity suspects', () => {
      const result = prescanStaticPages();
      assert(result.scanned >= 4000, `expected scanned >= 4000 (EN+KO combined, backlog 197), got ${result.scanned}`);
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
      assert(hits.length === 0, `expected zero link-target-integrity suspects on the real committed surface (EN+KO); got: ${JSON.stringify(hits)}`);
    });

    await test('link-target-integrity: a clean minimal fixture (no owned links beyond the boilerplate) produces zero suspects of ANY signal', () => {
      const f = writeLinkFixture('clean.html', minimalPage(''));
      const result = prescanStaticPages({ pages: [f] });
      assert(result.scanned === 1, `expected scanned === 1, got ${result.scanned}`);
      assert(result.suspects.length === 0, `expected zero suspects of any signal; got: ${JSON.stringify(result.suspects)}`);
    });

    await test('link-target-integrity rule (a) positive control: an unrouted query key on a home-path link is a suspect, ALONE (b/c stay clean)', () => {
      const f = writeLinkFixture('rule_a.html', minimalPage('<a href="https://www.defi.garden/?search=lido">bad</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
      assert(hits.length === 1, `expected exactly 1 link-target-integrity suspect (rule a only); got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/outside the allowed set/.test(hits[0].detail) && /"search"/.test(hits[0].detail),
        `expected rule (a)'s detail to name the "search" key; got: ${hits[0].detail}`);
      assert(hits[0].detail.includes('https://www.defi.garden/?search=lido'), `expected the offending URL quoted in detail; got: ${hits[0].detail}`);
    });

    await test('link-target-integrity rule (a) positive control: an unrouted query key on a /plan.html link is a suspect, ALONE', () => {
      const f = writeLinkFixture('rule_a_plan.html', minimalPage('<a href="/plan.html?waitlist=1&amp;bogus=xyz">bad</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
      assert(hits.length === 1, `expected exactly 1 link-target-integrity suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/"bogus"/.test(hits[0].detail), `expected the planner-unread key "bogus" to be named (not "waitlist", which planner.js DOES read); got: ${hits[0].detail}`);
    });

    await test('link-target-integrity rule (a): entity decoding — "&amp;" is decoded before parsing, never a phantom "amp;src" key', () => {
      // Both waitlist and src ARE read by planner.js (item 062) — a scanner
      // that splits the RAW attribute on "&" would see keys {waitlist,
      // "amp;src"} and wrongly flag "amp;src" as unrouted. Decoded correctly,
      // the keys are {waitlist, src}, both allowed, and this must be CLEAN.
      const f = writeLinkFixture('entity.html', minimalPage('<a href="/plan.html?waitlist=1&amp;src=seo_token">ok</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
      assert(hits.length === 0, `expected zero suspects — "&amp;" must decode to "&" before key-splitting; got: ${JSON.stringify(hits)}`);
    });

    await test('link-target-integrity rule (a): more than 3 distinct unrouted keys caps the quoted list at 3 with a "(+N more keys)" note', () => {
      const links = ['search', 'foo', 'bar', 'baz'].map((k) => `<a href="https://www.defi.garden/?${k}=1">x</a>`).join('\n');
      const f = writeLinkFixture('cap.html', minimalPage(links));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /outside the allowed set/.test(s.detail));
      assert(hits.length === 1, `expected exactly 1 rule-(a) suspect (one suspect per file per sub-rule); got ${hits.length}`);
      const quoted = (hits[0].detail.match(/"[a-z]+"/g) || []).length;
      assert(quoted === 3, `expected exactly 3 quoted keys, got ${quoted}: ${hits[0].detail}`);
      assert(/\(\+1 more keys?\)/.test(hits[0].detail), `expected a "(+1 more keys)" tail; got: ${hits[0].detail}`);
      assert(hits[0].detail.startsWith('4 defi.garden links'), `expected the leading count to be the TRUE total (4 links), not the capped quote count; got: ${hits[0].detail}`);
    });

    // Note (backlog 175): minimalPage()'s pool-row anchors below are bare
    // <a class="tp-pool-link"> tags with no surrounding <tr><td class="num">
    // table markup — a shape no real generated page ever has (029's
    // templates always emit the full row). That means these fixtures ALSO
    // legitimately trip level 3's anti-vacuity rail (T8: "pool-row anchors
    // present, zero parseable TVL rows" — literally true of them), which is
    // an orthogonal, correct, NEW finding, not a false positive. Rule (b)'s
    // own assertions below filter to rule (b)'s OWN detail phrase to stay
    // isolated on the sub-rule they were written for (same convention rule
    // (c)'s negative controls already use, see /resolve/ below) — level 3's
    // own behavior against these exact fixtures is pinned separately in the
    // "level 3 anti-vacuity" cases further down.
    const RULE_B_DETAIL_RE = /not target a "\?pool=<id>" URL/;

    await test('link-target-integrity rule (b) positive control: a pool-row anchor linking to the bare origin is a suspect, ALONE', () => {
      const f = writeLinkFixture('rule_b_bare.html', minimalPage('<a class="tp-pool-link" href="https://www.defi.garden/">bad</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && RULE_B_DETAIL_RE.test(s.detail));
      assert(hits.length === 1, `expected exactly 1 rule-(b) suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/tp-pool-link\/cp-pool-link/.test(hits[0].detail), `expected rule (b)'s detail; got: ${hits[0].detail}`);
    });

    await test('link-target-integrity rule (b) positive control: a pool-row anchor linking to a "?token=" grid URL is a suspect', () => {
      const f = writeLinkFixture('rule_b_grid.html', minimalPage('<a class="cp-pool-link" href="https://www.defi.garden/?chain=Ethereum">bad</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && RULE_B_DETAIL_RE.test(s.detail));
      assert(hits.length === 1, `expected exactly 1 rule-(b) suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(hits[0].detail.includes('?chain=Ethereum'), `expected the grid URL quoted; got: ${hits[0].detail}`);
    });

    await test('link-target-integrity rule (b) positive control: a pool-row anchor with a MISSING href is a suspect', () => {
      const f = writeLinkFixture('rule_b_missing.html', minimalPage('<a class="tp-pool-link">bad</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && RULE_B_DETAIL_RE.test(s.detail));
      assert(hits.length === 1, `expected exactly 1 rule-(b) suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(hits[0].detail.includes('(missing href)'), `expected "(missing href)" named; got: ${hits[0].detail}`);
    });

    await test('link-target-integrity rule (b) negative: a pool-row anchor correctly targeting "?pool=<id>" is clean (of rule (b) itself)', () => {
      const f = writeLinkFixture('rule_b_ok.html', minimalPage('<a class="tp-pool-link" href="https://www.defi.garden/?pool=abc-123">ok</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const ruleBHits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && RULE_B_DETAIL_RE.test(s.detail));
      assert(ruleBHits.length === 0, `expected zero rule-(b) suspects; got: ${JSON.stringify(ruleBHits)}`);
    });

    await test('link-target-integrity rule (c) positive control: an internal link target with no file on disk is a suspect, ALONE', () => {
      const f = writeLinkFixture('rule_c.html', minimalPage('<a href="https://www.defi.garden/tokens/doesnotexist999">bad</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
      assert(hits.length === 1, `expected exactly 1 suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(hits[0].detail.includes('/tokens/doesnotexist999'), `expected the broken path quoted; got: ${hits[0].detail}`);
      assert(!fs.existsSync(path.join(ROOT, 'tokens', 'doesnotexist999.html')), 'fixture wiring check: tokens/doesnotexist999.html must genuinely not exist');
    });

    await test('link-target-integrity rule (c) negative: an internal link target that DOES exist on disk ("/style.css") is not a suspect', () => {
      assert(fs.existsSync(path.join(ROOT, 'style.css')), 'fixture wiring check: style.css must exist at ROOT for this to be a real negative control');
      const f = writeLinkFixture('rule_c_ok.html', minimalPage('<a href="/style.css">ok</a>'));
      const result = prescanStaticPages({ pages: [f] });
      assert(result.suspects.length === 0, `expected zero suspects; got: ${JSON.stringify(result.suspects)}`);
    });

    await test('link-target-integrity rule (c) negative: an internal link target resolving via <path>/index.html ("/chains") is not a suspect', () => {
      assert(fs.existsSync(path.join(ROOT, 'chains', 'index.html')), 'fixture wiring check: chains/index.html must exist at ROOT');
      const f = writeLinkFixture('rule_c_index.html', minimalPage('<a href="https://www.defi.garden/chains">ok</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /resolve/.test(s.detail));
      assert(hits.length === 0, `expected zero rule-(c) suspects (chains/index.html exists); got: ${JSON.stringify(hits)}`);
    });

    await test('link-target-integrity: a fixture tripping rules (a)/(b)/(c) yields exactly 3 suspects for those (one per sub-rule), never one per bad link — PLUS the level-3 anti-vacuity finding this exact anchor-without-a-table shape also legitimately trips (backlog 175)', () => {
      const body = [
        '<a href="https://www.defi.garden/?search=lido">a</a>',
        '<a class="tp-pool-link" href="https://www.defi.garden/">b</a>',
        '<a href="https://www.defi.garden/tokens/doesnotexist999">c</a>'
      ].join('\n');
      const f = writeLinkFixture('all_three.html', minimalPage(body));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
      const legacyHits = hits.filter((h) => !/unparseable/.test(h.detail));
      assert(legacyHits.length === 3, `expected exactly 3 rule-(a)/(b)/(c) suspects (one per sub-rule); got ${legacyHits.length}: ${JSON.stringify(legacyHits)}`);
      assert(hits.length === 4, `expected exactly 4 total (rules a/b/c + the level-3 anti-vacuity finding this bare-anchor-no-table fixture legitimately trips); got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(hits.every((h) => h.severity === 'P1'), `link-target-integrity must be P1; got: ${JSON.stringify(hits.map((h) => h.severity))}`);
    });

    await test('link-target-integrity rule (a) coupling proof (home.html): appending a param to a copied home.html flips a home-path URL using it from suspect to clean', () => {
      const homeOriginal = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8');
      const ORIGINAL_DECL = "var ANALYTICS_PARAMS = ['token', 'chain', 'pool', 'poolTypes', 'protocols', 'minTvl', 'minApy', 'app'];";
      assert(homeOriginal.includes(ORIGINAL_DECL), 'fixture wiring check: home.html:77 must match the literal ANALYTICS_PARAMS declaration this test rewrites — home.html moved out from under this test');

      const homeCopy = writeLinkFixture('home.html', homeOriginal);
      const pageFile = writeLinkFixture('coupling_page.html', minimalPage('<a href="https://www.defi.garden/?zzzCustomParam=1">test</a>'));

      const before = prescanStaticPages({ pages: [pageFile], homeHtml: homeCopy });
      const beforeHit = before.suspects.find((s) => s.signal === 'link-target-integrity' && s.detail.includes('zzzCustomParam'));
      assert(beforeHit, `expected zzzCustomParam to be flagged before it is added to ANALYTICS_PARAMS; got: ${JSON.stringify(before.suspects)}`);

      const modified = homeOriginal.replace(ORIGINAL_DECL, ORIGINAL_DECL.replace("'app']", "'app', 'zzzCustomParam']"));
      fs.writeFileSync(homeCopy, modified);
      const after = prescanStaticPages({ pages: [pageFile], homeHtml: homeCopy });
      const afterHit = after.suspects.find((s) => s.signal === 'link-target-integrity' && s.detail.includes('zzzCustomParam'));
      assert(!afterHit, `expected zzzCustomParam to be CLEAN once added to ANALYTICS_PARAMS in the copied home.html; got: ${JSON.stringify(after.suspects)}`);
    });

    await test('link-target-integrity rule (a) coupling proof (planner.js): adding a urlParams.get() call site to a copied planner.js flips a /plan.html URL using that key from suspect to clean', () => {
      const plannerOriginal = fs.readFileSync(path.join(ROOT, 'planner.js'), 'utf8');
      const plannerCopy = writeLinkFixture('planner.js', plannerOriginal);
      const pageFile = writeLinkFixture('coupling_planner_page.html', minimalPage('<a href="/plan.html?zzzPlannerParam=1">test</a>'));

      const before = prescanStaticPages({ pages: [pageFile], plannerJs: plannerCopy });
      const beforeHit = before.suspects.find((s) => s.signal === 'link-target-integrity' && s.detail.includes('zzzPlannerParam'));
      assert(beforeHit, `expected zzzPlannerParam to be flagged before planner.js reads it; got: ${JSON.stringify(before.suspects)}`);

      fs.writeFileSync(plannerCopy, plannerOriginal + "\nvar __test172 = urlParams.get('zzzPlannerParam');\n");
      const after = prescanStaticPages({ pages: [pageFile], plannerJs: plannerCopy });
      const afterHit = after.suspects.find((s) => s.signal === 'link-target-integrity' && s.detail.includes('zzzPlannerParam'));
      assert(!afterHit, `expected zzzPlannerParam to be CLEAN once planner.js reads it via urlParams.get(); got: ${JSON.stringify(after.suspects)}`);
    });

    await test('link-target-integrity rule (a) degrades safely: an UNREADABLE home.html skips the home-path half (stderr note, no throw); rule (b)/(c) and the other three signals still work', () => {
      const stderrLines = [];
      const origErr = console.error;
      console.error = (...a) => stderrLines.push(a.join(' '));
      let result;
      try {
        const f = writeLinkFixture('degrade_home.html', minimalPage([
          '<a href="https://www.defi.garden/?search=lido">a</a>', // rule (a), home half — must be SKIPPED, not a false negative report
          '<a class="tp-pool-link" href="https://www.defi.garden/">b</a>', // rule (b) — must still fire
          '<a href="https://www.defi.garden/tokens/doesnotexist999">c</a>' // rule (c) — must still fire
        ].join('\n')));
        result = prescanStaticPages({ pages: [f], homeHtml: path.join(ROOT, 'does-not-exist-172-home.html') });
      } finally { console.error = origErr; }
      assert(stderrLines.some((l) => /link-target-integrity rule \(a\) \[home\.html half\] skipped/.test(l)),
        `expected a stderr note naming the home.html half; got: ${JSON.stringify(stderrLines)}`);
      assert(!result.suspects.some((s) => s.signal === 'link-target-integrity' && /outside the allowed set/.test(s.detail)),
        'rule (a) home-path half must NOT fire when home.html is unreadable — a bad key must not be silently checked against an empty/default allowlist');
      assert(result.suspects.some((s) => s.signal === 'link-target-integrity' && /tp-pool-link/.test(s.detail)), 'rule (b) must still fire');
      assert(result.suspects.some((s) => s.signal === 'link-target-integrity' && /resolve/.test(s.detail)), 'rule (c) must still fire');
      assert(result.scanned === 1, `expected the page to still be scanned (no throw); got scanned=${result.scanned}`);
    });

    await test('link-target-integrity rule (a) degrades safely: an UNREADABLE planner.js skips the /plan.html half (stderr note, no throw); the home-path half still works', () => {
      const stderrLines = [];
      const origErr = console.error;
      console.error = (...a) => stderrLines.push(a.join(' '));
      let result;
      try {
        const f = writeLinkFixture('degrade_planner.html', minimalPage([
          '<a href="/plan.html?bogus=1">a</a>', // planner half — must be SKIPPED
          '<a href="https://www.defi.garden/?search=lido">b</a>' // home half — must still fire
        ].join('\n')));
        result = prescanStaticPages({ pages: [f], plannerJs: path.join(ROOT, 'does-not-exist-172-planner.js') });
      } finally { console.error = origErr; }
      assert(stderrLines.some((l) => /link-target-integrity rule \(a\) \[planner\.js half\] skipped/.test(l)),
        `expected a stderr note naming the planner.js half; got: ${JSON.stringify(stderrLines)}`);
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
      assert(hits.length === 1, `expected exactly 1 suspect (home-path half only); got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/"search"/.test(hits[0].detail) && !/bogus/.test(hits[0].detail),
        `expected only the home-path "search" key flagged, never "bogus" (planner.js was unreadable); got: ${hits[0].detail}`);
    });

    await test('prescanStaticPages() degrades safely: an unreadable page in the list is skipped (stderr note, no throw) and does not block link-target-integrity on the other page', () => {
      const stderrLines = [];
      const origErr = console.error;
      console.error = (...a) => stderrLines.push(a.join(' '));
      let result;
      try {
        const validFile = writeLinkFixture('degrade_valid.html', minimalPage('<a class="cp-pool-link" href="https://www.defi.garden/">bad</a>'));
        result = prescanStaticPages({ pages: [path.join(ROOT, 'tokens', 'does-not-exist-172.html'), validFile] });
      } finally { console.error = origErr; }
      assert(stderrLines.some((l) => /skipping unreadable\/unparseable/.test(l)), `expected an unreadable-page stderr note; got: ${JSON.stringify(stderrLines)}`);
      assert(result.scanned === 1, `expected scanned === 1 (only the valid page counts); got ${result.scanned}`);
      assert(result.suspects.some((s) => s.signal === 'link-target-integrity'), 'expected link-target-integrity to still fire on the valid page');
    });

    await test('AUDIT_STATIC_PAGES override disables prescan entirely (spec 157 B.2, unchanged) — prescan.scanned/bySignal/prescanFindings all empty', () => {
      const before = process.env.AUDIT_STATIC_PAGES;
      try {
        const result = buildStaticSurfaces({ staticPages: 'tokens/usdc.html' });
        assert(result.prescan.scanned === 0, `expected prescan.scanned === 0 with an override, got ${result.prescan.scanned}`);
        assert(Object.keys(result.prescan.bySignal).length === 0, `expected prescan.bySignal === {}, got ${JSON.stringify(result.prescan.bySignal)}`);
        assert(result.prescanFindings.length === 0, `expected zero prescan findings, got ${JSON.stringify(result.prescanFindings)}`);
        assert(result.prescanSuspects.length === 0, `expected zero prescan suspects, got ${JSON.stringify(result.prescanSuspects)}`);
        // Also exercise the env-var form (opts.staticPages is the same code
        // path but proving the actual env var still works, not just opts).
        process.env.AUDIT_STATIC_PAGES = 'tokens/usdc.html';
        const resultEnv = buildStaticSurfaces({});
        assert(resultEnv.prescan.scanned === 0, `env-var form: expected prescan.scanned === 0, got ${resultEnv.prescan.scanned}`);
      } finally {
        if (before === undefined) delete process.env.AUDIT_STATIC_PAGES; else process.env.AUDIT_STATIC_PAGES = before;
      }
    });
    // ---------------------------------------------------------------------------
    // backlog 175 — link-target-integrity LEVELS 2 ("resolvable") and 3
    // ("non-empty") on the HTML static surface. Same fixture conventions as
    // above. Level 2 uses REAL values from the committed snapshot/planner.js
    // ("aave-v3", "kevin") for its negative controls — those are structural
    // facts (a real project/preset existing) unlikely to disappear, same risk
    // profile the pre-166 fixtures above already accept for rules (a)/(b)/(c).
    // ---------------------------------------------------------------------------
    function poolTableHtml(rows) {
      return '<table>' + rows.map((r, i) =>
        `<tr><td><a class="tp-pool-link" href="https://www.defi.garden/?pool=level3-${i}">P${i}</a></td><td class="num">${r.apy}</td><td class="num">${r.tvl}</td></tr>`
      ).join('') + '</table>';
    }

    await test('LEVEL 2 protocols: an injected "?protocols=<not-a-real-project>" on a home-path link is a suspect', () => {
      const f = writeLinkFixture('level2_protocols_bad.html', minimalPage('<a href="https://www.defi.garden/?protocols=not-a-real-project-xyz">bad</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /"protocols" value/.test(s.detail));
      assert(hits.length === 1, `expected exactly 1 level-2 protocols suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(hits[0].detail.includes('"not-a-real-project-xyz"'), `expected the bad slug quoted; got: ${hits[0].detail}`);
    });

    await test('LEVEL 2 protocols: a real project slug (aave-v3, currently in the snapshot) is clean', () => {
      const f = writeLinkFixture('level2_protocols_ok.html', minimalPage('<a href="https://www.defi.garden/?protocols=aave-v3">ok</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /"protocols" value/.test(s.detail));
      assert(hits.length === 0, `expected zero level-2 protocols suspects for a real slug; got: ${JSON.stringify(hits)}`);
    });

    await test('LEVEL 2 preset: an injected "?preset=<not-a-real-preset>" on a /plan.html link is a suspect', () => {
      const f = writeLinkFixture('level2_preset_bad.html', minimalPage('<a href="/plan.html?preset=not-a-real-preset-xyz">bad</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /"preset" value/.test(s.detail));
      assert(hits.length === 1, `expected exactly 1 level-2 preset suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(hits[0].detail.includes('"not-a-real-preset-xyz"'), `expected the bad preset value quoted; got: ${hits[0].detail}`);
    });

    await test('LEVEL 2 preset: a real PRESETS key (kevin, planner.js:1119) is clean', () => {
      const f = writeLinkFixture('level2_preset_ok.html', minimalPage('<a href="/plan.html?preset=kevin">ok</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /"preset" value/.test(s.detail));
      assert(hits.length === 0, `expected zero level-2 preset suspects for a real PRESETS key; got: ${JSON.stringify(hits)}`);
    });

    await test('LEVEL 2/3 non-goal (the 4,233-false-positive class-10 trap): a "?pool=<id-not-in-the-snapshot>" link is NEVER flagged — pool liveness stays offline-unvalidated by design', () => {
      const f = writeLinkFixture('level_pool_liveness.html', minimalPage('<a class="tp-pool-link" href="https://www.defi.garden/?pool=definitely-not-a-real-pool-id-999">x</a>'));
      const result = prescanStaticPages({ pages: [f] });
      const badPoolHits = result.suspects.filter((s) => s.signal === 'link-target-integrity' &&
        (/"protocols" value/.test(s.detail) || /"preset" value/.test(s.detail) || /resolve.*ZERO pools/.test(s.detail)));
      assert(badPoolHits.length === 0, `expected zero level-2/3 suspects for an unresolvable ?pool= id; got: ${JSON.stringify(badPoolHits)}`);
    });

    await test('LEVEL 3 static positive: a home-path grid link whose page rows are ALL below its effective (default $10M) floor is a suspect', () => {
      const body = poolTableHtml([{ apy: '3.2%', tvl: '$500,000' }, { apy: '4.1%', tvl: '$800,000' }]) +
        '\n<a href="https://www.defi.garden/?token=LEVEL3TEST">See all LEVEL3TEST yields</a>';
      const f = writeLinkFixture('level3_static_dead.html', minimalPage(body));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /resolve.*ZERO pools/.test(s.detail));
      assert(hits.length === 1, `expected exactly 1 level-3 suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(hits[0].detail.includes('?token=LEVEL3TEST'), `expected the dead grid URL quoted; got: ${hits[0].detail}`);
    });

    await test('LEVEL 3 static negative: a home-path grid link whose page rows CLEAR its effective floor is clean', () => {
      const body = poolTableHtml([{ apy: '3.2%', tvl: '$15,000,000' }]) +
        '\n<a href="https://www.defi.garden/?token=LEVEL3TEST">See all LEVEL3TEST yields</a>';
      const f = writeLinkFixture('level3_static_clean.html', minimalPage(body));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /resolve.*ZERO pools/.test(s.detail));
      assert(hits.length === 0, `expected zero level-3 suspects (a row clears the floor); got: ${JSON.stringify(hits)}`);
    });

    await test('LEVEL 3 static minTvl semantics (spec 175 acceptance criterion 5): an explicit "?minTvl=" BELOW DEFAULT_MIN_TVL is honoured, never clamped up to the $10M default', () => {
      const body = poolTableHtml([{ apy: '3.2%', tvl: '$500,000' }]) +
        '\n<a href="https://www.defi.garden/?token=LEVEL3TEST&minTvl=100000">See all LEVEL3TEST yields (>=$100K)</a>';
      const f = writeLinkFixture('level3_static_mintvl.html', minimalPage(body));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /resolve.*ZERO pools/.test(s.detail));
      assert(hits.length === 0, `expected zero level-3 suspects — a simulation that wrongly applies the $10M default instead of the explicit $100K floor would flag this (this is exactly 173's own fix); got: ${JSON.stringify(hits)}`);
    });

    await test('LEVEL 3 anti-vacuity rail (T8): a page with a pool-row anchor but an UNPARSEABLE TVL cell emits the "population unparseable" suspect, never goes dark silently', () => {
      const body = '<table><tr><td><a class="tp-pool-link" href="https://www.defi.garden/?pool=x">P</a></td><td class="num">3.2%</td><td class="num">N/A</td></tr></table>' +
        '\n<a href="https://www.defi.garden/?token=LEVEL3TEST">See all</a>';
      const f = writeLinkFixture('level3_static_vacuous.html', minimalPage(body));
      const result = prescanStaticPages({ pages: [f] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /unparseable/.test(s.detail));
      assert(hits.length === 1, `expected exactly 1 anti-vacuity suspect; got ${hits.length}: ${JSON.stringify(hits)}`);
      assert(/1 pool-row anchor/.test(hits[0].detail), `expected the anchor count named; got: ${hits[0].detail}`);
    });

    await test('LEVEL 2 degrades safely: an UNREADABLE snapshot skips the "protocols" rule (stderr note, no throw); level 1 and other signals still work', () => {
      const stderrLines = [];
      const origErr = console.error;
      console.error = (...a) => stderrLines.push(a.join(' '));
      let result;
      try {
        const f = writeLinkFixture('degrade_snapshot.html', minimalPage([
          '<a href="https://www.defi.garden/?protocols=not-a-real-project-xyz">a</a>', // level 2 protocols — must be SKIPPED
          '<a href="https://www.defi.garden/?search=lido">b</a>' // level 1 rule (a) — must still fire
        ].join('\n')));
        result = prescanStaticPages({ pages: [f], snapshot: path.join(ROOT, 'does-not-exist-175-snapshot.json') });
      } finally { console.error = origErr; }
      assert(stderrLines.some((l) => /link-target-integrity level 2 \(protocols\) skipped/.test(l)), `expected a stderr note naming level 2 protocols; got: ${JSON.stringify(stderrLines)}`);
      assert(!result.suspects.some((s) => s.signal === 'link-target-integrity' && /"protocols" value/.test(s.detail)), 'level-2 protocols must NOT fire when the snapshot is unreadable — a bad value must not be silently checked against an empty/default allowlist');
      assert(result.suspects.some((s) => s.signal === 'link-target-integrity' && /outside the allowed set/.test(s.detail)), 'level 1 rule (a) must still fire');
      assert(result.scanned === 1, `expected the page to still be scanned (no throw); got scanned=${result.scanned}`);
    });

    await test('LEVEL 2 degrades safely: an UNPARSEABLE PRESETS block skips the "preset" rule (stderr note, no throw); the protocols rule still works', () => {
      const plannerOriginal = fs.readFileSync(path.join(ROOT, 'planner.js'), 'utf8');
      const strippedPlanner = plannerOriginal.replace(/var PRESETS = \{[\s\S]*?\};/, '/* PRESETS removed for backlog 175 degrade test */');
      assert(strippedPlanner !== plannerOriginal, 'fixture wiring check: the PRESETS block must actually have been stripped — planner.js:1119 moved out from under this test');
      const badPlanner = writeLinkFixture('planner.js', strippedPlanner);
      const stderrLines = [];
      const origErr = console.error;
      console.error = (...a) => stderrLines.push(a.join(' '));
      let result;
      try {
        const f = writeLinkFixture('degrade_presets.html', minimalPage([
          '<a href="/plan.html?preset=not-a-real-preset-xyz">a</a>', // level 2 preset — must be SKIPPED
          '<a href="https://www.defi.garden/?protocols=not-a-real-project-xyz">b</a>' // level 2 protocols — must still fire
        ].join('\n')));
        result = prescanStaticPages({ pages: [f], plannerJs: badPlanner });
      } finally { console.error = origErr; }
      assert(stderrLines.some((l) => /link-target-integrity level 2 \(preset\) skipped/.test(l)), `expected a stderr note naming level 2 preset; got: ${JSON.stringify(stderrLines)}`);
      assert(!result.suspects.some((s) => s.signal === 'link-target-integrity' && /"preset" value/.test(s.detail)), 'level-2 preset must NOT fire when PRESETS is unparseable');
      assert(result.suspects.some((s) => s.signal === 'link-target-integrity' && /"protocols" value/.test(s.detail)), 'level-2 protocols must still fire (independent failure paths)');
    });

    await test('LEVEL 3 degrades safely: an UNREADABLE app.js skips level 3 (stderr note, no throw); level 1/2 still work', () => {
      const stderrLines = [];
      const origErr = console.error;
      console.error = (...a) => stderrLines.push(a.join(' '));
      let result;
      try {
        const body = poolTableHtml([{ apy: '3.2%', tvl: '$500,000' }]) +
          '\n<a href="https://www.defi.garden/?token=LEVEL3TEST">See all</a>';
        const f = writeLinkFixture('degrade_appjs.html', minimalPage(body));
        result = prescanStaticPages({ pages: [f], appJs: path.join(ROOT, 'does-not-exist-175-app.js') });
      } finally { console.error = origErr; }
      assert(stderrLines.some((l) => /link-target-integrity level 3 \(non-empty\) skipped/.test(l)), `expected a stderr note naming level 3; got: ${JSON.stringify(stderrLines)}`);
      assert(!result.suspects.some((s) => s.signal === 'link-target-integrity' && (/resolve.*ZERO pools/.test(s.detail) || /unparseable/.test(s.detail))), 'level 3 must NOT fire when app.js (DEFAULT_MIN_TVL) is unreadable');
      assert(result.scanned === 1, `expected the page to still be scanned (no throw); got scanned=${result.scanned}`);
    });
  } finally {
    cleanupLinkFixtures();
  }

  console.log(`\ntest_audit_prescan.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
