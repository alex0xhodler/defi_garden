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
const { runAudit, prescanStaticPages, buildStaticSurfaces, reconcilePrescanFindings } = require('./audit-app.js');

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

  await test('A6b (spec 171): runAudit() never passes textSurfaceFindings to reconcilePrescanFindings — only prescanFindings (prefix static-prescan) and poolPrescanFindings (prefix pool-prescan)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    const occurrences = (src.match(/reconcilePrescanFindings\(/g) || []).length;
    assert(occurrences === 3,
      `expected exactly 3 occurrences of "reconcilePrescanFindings(" (1 function definition + 2 runAudit() call sites) — ` +
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

  // ---------------------------------------------------------------------------
  // backlog 172 — link-target-integrity on the HTML static surface. Same
  // three sub-rules 169 shipped for llms.txt/llms-full.txt (prescanTextSurfaces()),
  // re-aimed at prescanStaticPages()'s own raw HTML. All cases below are
  // pure fs+regex (no runAudit(), no Playwright, no network) except where
  // explicitly noted.
  // ---------------------------------------------------------------------------
  try {
    await test('link-target-integrity: TRUE NEGATIVE — the real committed tokens/*.html + chains/*.html pages produce ZERO link-target-integrity suspects', () => {
      const result = prescanStaticPages();
      assert(result.scanned >= 2000, `expected scanned >= 2000, got ${result.scanned}`);
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
      assert(hits.length === 0, `expected zero link-target-integrity suspects on the real committed surface; got: ${JSON.stringify(hits)}`);
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
