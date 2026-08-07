/* Rendered acceptance test for the sampled static SEO surface (backlog 154).

   Five REAL Chromium renders (not regex unit tests), covering spec 154's
   acceptance criteria 1-5:
     1. a default run (no env/opts override) covers `static-page` (the
        unchanged usdc/ethereum anchor) PLUS at least one `static-page:<slug>`
        rotated entry, and still writes the documented findings JSON.
     2. positive control (backlog 185: self-provisioning fixture) — a scratch
        copy of the real, committed tokens/usdc.html with only its <h1>
        replaced by a junk-slug one ("00 DeFi Yields") is written under ROOT
        at run time, pointed at via the same AUDIT_STATIC_PAGES-equivalent
        override, and removed in a `finally`. The control no longer depends on
        a junk page permanently existing in the estate (item 148 removed the
        last one, tokens/00.html, for good — see specs/185.md).
     3. negative control — the anchor page (tokens/usdc.html) yields none of
        junk-slug / zero-yield-claim / empty-table.
     4. false-positive guard — digit-LEADING real tickers on disk
        (tokens/0x0.html "0X0 DeFi Yields", tokens/1inch.html "1INCH DeFi
        Yields") yield NO junk-slug finding.
     5. determinism — two runAudit() calls with the same AUDIT_STATIC_SEED
        (passed as opts.staticSeed, same override convention as every other
        knob in audit-app.js) select the same sample; a different seed selects
        a different one.

   Timing note: each static SEO leaf page's <script defer
   src="https://www.defi.garden/analytics.js"> is an ABSOLUTE production URL
   (unlike home.html's relative `analytics.js` tag, which the local test
   server serves instantly) — the sandbox proxy can't resolve it, and because
   the tag is `defer` it holds up DOMContentLoaded for ~10s per static page
   before giving up (CLAUDE.md's documented "external font/analytics fetches
   fail locally" — ignorable, not a page-error). To stay inside the 5-minute
   foreground timebox despite that fixed per-page cost, every runAudit() call
   below runs on its own port/server/browser and all seven are dispatched
   concurrently via Promise.all — independent processes, so wall time is
   bounded by the slowest single run, not the sum of all of them.

   Run: node test_seo_surface_audit.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { runAudit, buildStaticSurfaces } = require('./audit-app.js');

const ROOT = __dirname;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-seo-${tag}-${process.pid}.json`); }

async function main() {
  const outPaths = {
    c1: tmpOut('c1'), c2: tmpOut('c2'), c3: tmpOut('c3'), c4: tmpOut('c4'),
    da1: tmpOut('da1'), da2: tmpOut('da2'), db: tmpOut('db'), c6missing: tmpOut('c6missing')
  };

  // ---------------------------------------------------------------------------
  // backlog 185 Leg B — criterion 2's positive control self-provisions its own
  // fixture instead of depending on a junk page permanently living in the
  // committed estate (item 148 removed the last one, tokens/00.html, for
  // good). The fixture is a COPY of a real, committed page (tokens/usdc.html)
  // with only its <h1> replaced by a junk-slug one, written under ROOT at
  // depth 1 (same nesting as tokens/x.html, so relative asset refs resolve
  // identically) but NEVER inside tokens/ or chains/ (those are the SEO
  // estate; adding junk there is the defect item 148 just spent an item
  // removing). pid-suffixed so concurrent runs cannot collide; removed in a
  // `finally` even on failure. The copied source page's md5 is asserted
  // unchanged after the run (below), and buildStaticSurfaces()'s
  // path.join(ROOT, s.url) / startServer()'s path.join(ROOT, urlPath) +
  // `!filePath.startsWith(ROOT)` 403 guard both resolve against ROOT, so a
  // fixture outside ROOT would be unreachable by construction.
  // ---------------------------------------------------------------------------
  const controlSourceRel = 'tokens/usdc.html';
  const controlSourceAbs = path.join(ROOT, controlSourceRel);
  const controlDirRel = `_audit_seo_fixture_185_${process.pid}`;
  const controlDirAbs = path.join(ROOT, controlDirRel);
  const controlRel = `${controlDirRel}/control.html`;
  const controlAbs = path.join(ROOT, controlRel);

  const controlSourceHtmlBefore = fs.readFileSync(controlSourceAbs, 'utf8');
  const controlSourceMd5Before = crypto.createHash('md5').update(controlSourceHtmlBefore).digest('hex');
  const controlHtml = controlSourceHtmlBefore.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '<h1>00 DeFi Yields</h1>');
  assert(controlHtml !== controlSourceHtmlBefore,
    `fixture wiring check: replacing <h1> in ${controlSourceRel} did not change its content — source page shape moved out from under this test`);

  let r1, r2, r3, r4, dA1, dA2, dB;
  try {
    fs.mkdirSync(controlDirAbs, { recursive: true });
    fs.writeFileSync(controlAbs, controlHtml);

    // ---- Dispatch all seven runs concurrently (see timing note above) ----
    const pCriterion1 = runAudit({ port: 8901, outPath: outPaths.c1 });

    // Positive control (criterion 2, backlog 185): the self-provisioned
    // fixture above renders "<h1>00 DeFi Yields</h1>" — a scratch COPY of a
    // real committed page, junk-slugged only in the copy, never the
    // committed tokens/usdc.html itself.
    const pCriterion2 = runAudit({
      port: 8902, staticPages: controlRel, only: ['static-page'], outPath: outPaths.c2
    });

    // Negative control (criterion 3): the anchor page itself.
    const pCriterion3 = runAudit({
      port: 8903, staticPages: 'tokens/usdc.html', only: ['static-page'], outPath: outPaths.c3
    });

    // False-positive guard (criterion 4): digit-LEADING real tickers present in
    // this checkout (grepped: tokens/0x0.html -> "0X0 DeFi Yields",
    // tokens/1inch.html -> "1INCH DeFi Yields"). Neither JUNK_SLUG_NUMERIC
    // (pure-digit) nor JUNK_SLUG_DATE (digit+month+digit) can match a leading
    // token containing a letter, so these must NOT fire junk-slug.
    const pCriterion4 = runAudit({
      port: 8904,
      staticPages: 'tokens/0x0.html,tokens/1inch.html',
      only: ['static-page', 'static-page:tokens/1inch'],
      outPath: outPaths.c4
    });

    // Determinism (criterion 5): staticOnly skips the 9 app surfaces so each of
    // these three runs only drives the anchor + 1 sampled page — same idea as
    // criterion 1/2/3/4 above, just parameterized to isolate the seed→sample
    // relationship instead of a specific page.
    const pDetA1 = runAudit({ port: 8905, staticOnly: true, staticSample: 1, staticSeed: 'seo-audit-seed-A', outPath: outPaths.da1 });
    const pDetA2 = runAudit({ port: 8906, staticOnly: true, staticSample: 1, staticSeed: 'seo-audit-seed-A', outPath: outPaths.da2 });
    const pDetB = runAudit({ port: 8907, staticOnly: true, staticSample: 1, staticSeed: 'seo-audit-seed-B', outPath: outPaths.db });

    [r1, r2, r3, r4, dA1, dA2, dB] = await Promise.all([
      pCriterion1, pCriterion2, pCriterion3, pCriterion4, pDetA1, pDetA2, pDetB
    ]);
  } finally {
    // Self-cleaning even on failure (spec 185 acceptance 5).
    try { fs.rmSync(controlDirAbs, { recursive: true, force: true }); } catch (e) {}
  }

  await test('criterion 1: default run covers static-page + >=1 static-page:<slug>, writes findings JSON', async () => {
    assert(r1.surfacesCovered.includes('static-page'), 'surfacesCovered missing the unchanged anchor "static-page": ' + JSON.stringify(r1.surfacesCovered));
    const sampled = r1.surfacesCovered.filter((n) => n.startsWith('static-page:'));
    assert(sampled.length >= 1, 'surfacesCovered has no rotated static-page:<slug> entry: ' + JSON.stringify(r1.surfacesCovered));
    assert(fs.existsSync(outPaths.c1), 'findings JSON was not written for the criterion-1 run');
    const written = JSON.parse(fs.readFileSync(outPaths.c1, 'utf8'));
    assert(Array.isArray(written.surfacesCovered) && written.surfacesCovered.some((n) => n.startsWith('static-page:')),
      'written findings JSON does not reflect the rotated sample');
  });

  await test('criterion 2 (positive control, self-provisioned fixture, backlog 185): control page real render -> junk-slug P1 quoting the rendered <h1>, control surface covered', async () => {
    const hit = r2.findings.find((f) => f.check === 'junk-slug' && f.severity === 'P1');
    assert(hit, 'expected a junk-slug P1 finding for the self-provisioned control page; got: ' + JSON.stringify(r2.findings));
    assert(/00 DeFi Yields/.test(hit.detail), 'finding detail does not quote the rendered <h1>: ' + hit.detail);
    // Acceptance 6 (this run's positive half): surfacesCovered must contain
    // the control surface, so a future silent override-drop can never be
    // mistaken for a clean run. See the non-vacuity case below for the proof
    // that this assertion is capable of FAILING on a dropped override.
    assert(r2.surfacesCovered.includes('static-page'),
      `expected the control surface "static-page" in surfacesCovered; got ${JSON.stringify(r2.surfacesCovered)}`);
  });

  await test('criterion 2 fixture hygiene (backlog 185): source page md5 unchanged, fixture fully removed', () => {
    const sourceAfter = fs.readFileSync(controlSourceAbs, 'utf8');
    const md5After = crypto.createHash('md5').update(sourceAfter).digest('hex');
    assert(md5After === controlSourceMd5Before,
      `${controlSourceRel} must be byte-identical after being copied for the fixture; md5 before=${controlSourceMd5Before} after=${md5After}`);
    assert(!fs.existsSync(controlDirAbs), `expected the fixture directory to be fully removed after the run; still present at ${controlDirAbs}`);
    assert(!fs.existsSync(controlAbs), `expected the fixture file to be removed; still present at ${controlAbs}`);
  });

  await test('criterion 6 non-vacuity (backlog 185): "surfacesCovered contains the control surface" CAN fail — a deliberately nonexistent override page drops silently and surfacesCovered lacks "static-page"', async () => {
    const missingRel = `_audit_seo_fixture_185_missing_${process.pid}.html`;
    assert(!fs.existsSync(path.join(ROOT, missingRel)),
      'fixture wiring check: the deliberately-nonexistent scratch page must genuinely not exist');
    const rMissing = await runAudit({
      port: 8908, staticOnly: true, staticPages: missingRel, only: ['static-page'], outPath: outPaths.c6missing
    });
    assert(!rMissing.surfacesCovered.includes('static-page'),
      `non-vacuity proof: a dropped override must leave "static-page" OUT of surfacesCovered (proving criterion 2's assertion is capable of failing, not vacuously true); got ${JSON.stringify(rMissing.surfacesCovered)}`);
    // Restored: the real criterion-2 run above already proves the positive
    // direction with the real self-provisioned control page.
  });

  await test('buildStaticSurfaces() override branch (backlog 185 Leg C): a dropped nonexistent override entry is named on stderr; behaviour otherwise unchanged (still dropped, no throw, no finding)', () => {
    const missingRel = `_audit_seo_fixture_185_legc_missing_${process.pid}.html`;
    assert(!fs.existsSync(path.join(ROOT, missingRel)),
      'fixture wiring check: the deliberately-nonexistent scratch page must genuinely not exist');
    const stderrLines = [];
    const origErr = console.error;
    console.error = (...a) => stderrLines.push(a.join(' '));
    let result;
    try {
      result = buildStaticSurfaces({ staticPages: `tokens/usdc.html,${missingRel}` });
    } finally { console.error = origErr; }
    assert(stderrLines.some((l) => l.includes(missingRel)),
      `expected a stderr note naming the dropped path "${missingRel}"; got: ${JSON.stringify(stderrLines)}`);
    assert(result.surfaces.length === 1 && result.surfaces[0].url === '/tokens/usdc.html' && result.surfaces[0].name === 'static-page',
      `behaviour must be otherwise unchanged: the existing entry still becomes the only (anchor-named) surface, dropped entry absent, no throw; got ${JSON.stringify(result.surfaces)}`);
    assert(result.prescanFindings.length === 0, 'the drop itself must still emit zero findings (a stderr note only, no finding, no exit-code path)');
  });

  await test('criterion 3 (negative control): tokens/usdc.html yields no junk-slug/zero-yield-claim/empty-table', async () => {
    const bad = r3.findings.filter((f) => ['junk-slug', 'zero-yield-claim', 'empty-table'].includes(f.check));
    assert(bad.length === 0, 'expected none of the 154 checks to fire on the clean anchor page, got: ' + JSON.stringify(bad));
  });

  await test('criterion 4 (false-positive guard): digit-LEADING real tickers (0X0, 1INCH) do not trip junk-slug', async () => {
    const junk = r4.findings.filter((f) => f.check === 'junk-slug');
    assert(junk.length === 0, 'digit-leading real ticker slugs must never trip junk-slug, got: ' + JSON.stringify(junk));
    assert(r4.surfacesCovered.includes('static-page') && r4.surfacesCovered.includes('static-page:tokens/1inch'),
      'expected both override pages to have actually run: ' + JSON.stringify(r4.surfacesCovered));
  });

  await test('criterion 5: same AUDIT_STATIC_SEED selects the same sample; a different seed selects a different one', async () => {
    const namesA1 = dA1.surfacesCovered.filter((n) => n.startsWith('static-page:'));
    const namesA2 = dA2.surfacesCovered.filter((n) => n.startsWith('static-page:'));
    const namesB = dB.surfacesCovered.filter((n) => n.startsWith('static-page:'));
    assert(namesA1.length >= 1 && namesA2.length >= 1 && namesB.length >= 1,
      'expected each determinism run to sample at least one page: ' + JSON.stringify({ namesA1, namesA2, namesB }));
    assert(JSON.stringify(namesA1) === JSON.stringify(namesA2),
      `same AUDIT_STATIC_SEED must select the same sample: ${JSON.stringify(namesA1)} vs ${JSON.stringify(namesA2)}`);
    assert(JSON.stringify(namesA1) !== JSON.stringify(namesB),
      `a different AUDIT_STATIC_SEED should select a different sample; both were ${JSON.stringify(namesA1)}`);
  });

  for (const p of Object.values(outPaths)) { try { fs.unlinkSync(p); } catch (e) {} }

  console.log(`\ntest_seo_surface_audit.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
