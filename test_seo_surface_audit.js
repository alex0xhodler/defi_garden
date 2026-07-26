/* Rendered acceptance test for the sampled static SEO surface (backlog 154).

   Five REAL Chromium renders (not regex unit tests), covering spec 154's
   acceptance criteria 1-5:
     1. a default run (no env/opts override) covers `static-page` (the
        unchanged usdc/ethereum anchor) PLUS at least one `static-page:<slug>`
        rotated entry, and still writes the documented findings JSON.
     2. positive control — AUDIT_STATIC_PAGES-equivalent override pointed at
        tokens/00.html yields a `junk-slug` P1 finding whose detail quotes the
        rendered <h1> ("00 DeFi Yields").
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
const { runAudit } = require('./audit-app.js');

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
    da1: tmpOut('da1'), da2: tmpOut('da2'), db: tmpOut('db')
  };

  // ---- Dispatch all seven runs concurrently (see timing note above) ----
  const pCriterion1 = runAudit({ port: 8901, outPath: outPaths.c1 });

  // Positive control (criterion 2): tokens/00.html renders "<h1>00 DeFi
  // Yields</h1>" verbatim on disk (grepped, this checkout) — a real junk page.
  const pCriterion2 = runAudit({
    port: 8902, staticPages: 'tokens/00.html', only: ['static-page'], outPath: outPaths.c2
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

  const [r1, r2, r3, r4, dA1, dA2, dB] = await Promise.all([
    pCriterion1, pCriterion2, pCriterion3, pCriterion4, pDetA1, pDetA2, pDetB
  ]);

  await test('criterion 1: default run covers static-page + >=1 static-page:<slug>, writes findings JSON', async () => {
    assert(r1.surfacesCovered.includes('static-page'), 'surfacesCovered missing the unchanged anchor "static-page": ' + JSON.stringify(r1.surfacesCovered));
    const sampled = r1.surfacesCovered.filter((n) => n.startsWith('static-page:'));
    assert(sampled.length >= 1, 'surfacesCovered has no rotated static-page:<slug> entry: ' + JSON.stringify(r1.surfacesCovered));
    assert(fs.existsSync(outPaths.c1), 'findings JSON was not written for the criterion-1 run');
    const written = JSON.parse(fs.readFileSync(outPaths.c1, 'utf8'));
    assert(Array.isArray(written.surfacesCovered) && written.surfacesCovered.some((n) => n.startsWith('static-page:')),
      'written findings JSON does not reflect the rotated sample');
  });

  await test('criterion 2 (positive control): tokens/00.html real render -> junk-slug P1 quoting the rendered <h1>', async () => {
    const hit = r2.findings.find((f) => f.check === 'junk-slug' && f.severity === 'P1');
    assert(hit, 'expected a junk-slug P1 finding for tokens/00.html; got: ' + JSON.stringify(r2.findings));
    assert(/00 DeFi Yields/.test(hit.detail), 'finding detail does not quote the rendered <h1>: ' + hit.detail);
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
