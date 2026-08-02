/* Acceptance tests for spec 203 — "tag the static estate's `?pool=` deep
   links, and teach the link gate that the router is not the only thing that
   reads a query param."

   Leg A (audit-app.js): loadRouterAllowedParams() unions in the attribution
   keys PARSED OUT OF analytics.js's captureAcquisition() array — never a
   hardcoded literal.
   Leg B (generate-token-pages.js / generate-chain-pages.js): poolHrefFor()
   gains an optional third argument, tagging the visible row links only
   ('seo_token' / 'seo_chain'); the ItemList JSON-LD path stays clean.

   This file covers acceptance criteria 3, 4, 6, 7 (criteria 1/2/5 live in
   test_token_pages.js / test_chain_pages.js, next to the generator tests
   they extend). Criteria 3/4 run prescanStaticPages() over REAL generator
   output written to a temp dir — never hand-written HTML strings.

   Run: node test_seo_src_attribution.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { prescanStaticPages } = require('./audit-app.js');
const tokenGen = require('./generate-token-pages.js');
const chainGen = require('./generate-chain-pages.js');

const ROOT = __dirname;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// Real generator output, written to a temp dir (never fixtures/hand-written
// HTML) — the SAME test_fixtures/pools-sample.json every other generator
// test file uses, rendered through the real, unmodified renderTokenPage()/
// renderChainPage() exports.
// ---------------------------------------------------------------------------
const pools = JSON.parse(fs.readFileSync(path.join(ROOT, 'test_fixtures', 'pools-sample.json'), 'utf8'));
const rankedTokens = tokenGen.rankTopTokens(pools);
const rankedChains = chainGen.rankTopChains(pools);
assert.ok(rankedTokens.length > 0 && rankedChains.length > 0, 'fixture wiring check: expected >=1 ranked token and chain');

let genDir;
let generatedPages = [];
function writeGeneratedOutput() {
  genDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-203-gen-'));
  const tokensDir = path.join(genDir, 'tokens');
  const chainsDir = path.join(genDir, 'chains');
  fs.mkdirSync(tokensDir);
  fs.mkdirSync(chainsDir);
  const pages = [];
  rankedTokens.forEach((rec) => {
    const file = path.join(tokensDir, `${rec.slug}.html`);
    fs.writeFileSync(file, tokenGen.renderTokenPage(rec));
    pages.push(file);
  });
  rankedChains.forEach((rec) => {
    const file = path.join(chainsDir, `${rec.slug}.html`);
    fs.writeFileSync(file, chainGen.renderChainPage(rec));
    pages.push(file);
  });
  return pages;
}
function cleanupGeneratedOutput() {
  if (genDir) { try { fs.rmSync(genDir, { recursive: true, force: true }); } catch (e) {} }
}
generatedPages = writeGeneratedOutput();

// Rule (a) only ("a query key outside the allowed set for its path" —
// audit-app.js:1688) — the sub-rule spec 203 changes and criterion 3 names
// ("the narrowest real entry point that runs rule (a)"). Rule (c)'s
// resolves-to-a-file check runs against ROOT (the real repo checkout), not
// against wherever the scanned HTML happens to live on disk — writing fixture
// pages (BIG/MID/ANOM/SMALL, which are not real tokens with real
// tokens/<slug>.html files under ROOT) to a scratch temp dir legitimately
// trips rule (c)'s canonical/breadcrumb self-links, orthogonal to this spec's
// query-key change. Filtering to rule (a) is not a weaker test — it is the
// specific mechanism this item edits, isolated from a pre-existing,
// unrelated artifact of testing generator output outside its real ROOT/
// tokens|chains location.
function ruleAHits(suspects) {
  return suspects.filter((s) => s.signal === 'link-target-integrity' && /outside the allowed set/.test(s.detail));
}

console.log('203 criterion 3 — the gate accepts the new links');
test('prescanStaticPages() over real generated token+chain output produces ZERO rule-(a) link-target-integrity findings', () => {
  const result = prescanStaticPages({ pages: generatedPages });
  assert.strictEqual(result.scanned, generatedPages.length, `expected every generated page to be scanned; got ${result.scanned}/${generatedPages.length}`);
  const hits = ruleAHits(result.suspects);
  assert.strictEqual(hits.length, 0, `expected zero rule-(a) link-target-integrity findings on freshly generated (203) output; got ${JSON.stringify(hits)}`);
});

console.log('203 criterion 4(a) — non-vacuity: an unlisted key still fires rule (a)');
test('a page whose pool link carries a key on NO list ("&bogus=1") still produces a link-target-integrity finding', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-203-bogus-'));
  try {
    const bogusFile = path.join(dir, 'bogus.html');
    const bogusHtml = `<!DOCTYPE html><html><head><title>t</title></head><body>
      <h1>Bogus Token</h1>
      <table><tr><td><a class="tp-pool-link" href="https://www.defi.garden/?pool=abc-123&src=seo_token&bogus=1">aave &rarr;</a></td>
      <td>Base</td><td class="num">5.00%</td><td class="num">$1,000,000</td></tr></table>
      </body></html>`;
    fs.writeFileSync(bogusFile, bogusHtml);
    const result = prescanStaticPages({ pages: [bogusFile] });
    const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /bogus/.test(s.detail));
    assert.ok(hits.length >= 1, `expected an unlisted "bogus" key to still be flagged; got: ${JSON.stringify(result.suspects)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log('203 criterion 4(b) — non-vacuity: MUTATION proof (real output pasted, see specs/203-notes.md)');
test('removing \'src\' from a SCRATCH COPY of analytics.js\'s capture array flips criterion 3\'s clean run RED', () => {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-203-mutate-'));
  try {
    const realAnalyticsJs = fs.readFileSync(path.join(ROOT, 'analytics.js'), 'utf8');
    const ORIGINAL_ARR = "['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',\n        'ref', 'gclid', 'fbclid', 'twclid', 'src']";
    assert.ok(realAnalyticsJs.includes(ORIGINAL_ARR),
      'fixture wiring check: analytics.js\'s captureAcquisition() array text moved out from under this test — update ORIGINAL_ARR');
    const mutatedArr = ORIGINAL_ARR.replace(", 'src']", "]"); // remove 'src' only
    const mutatedAnalyticsJs = realAnalyticsJs.replace(ORIGINAL_ARR, mutatedArr);
    assert.ok(!mutatedAnalyticsJs.includes("'src']") && mutatedAnalyticsJs.includes("'twclid']"),
      'fixture wiring check: mutation did not cleanly remove \'src\' from the capture array');
    const mutatedPath = path.join(scratchDir, 'analytics.js');
    fs.writeFileSync(mutatedPath, mutatedAnalyticsJs);

    // BEFORE (real analytics.js, src present) — criterion 3's own green.
    const before = prescanStaticPages({ pages: generatedPages });
    const beforeHits = ruleAHits(before.suspects);
    assert.strictEqual(beforeHits.length, 0, `sanity: criterion 3 must be green before mutation; got ${JSON.stringify(beforeHits)}`);

    // AFTER (scratch analytics.js, src removed) — must go RED.
    const after = prescanStaticPages({ pages: generatedPages, analyticsJs: mutatedPath });
    const afterHits = ruleAHits(after.suspects).filter((s) => /"src"/.test(s.detail));
    assert.ok(afterHits.length > 0,
      `MUTATION must flip the gate red once 'src' is no longer a recognised attribution key; got zero "src" hits: ${JSON.stringify(after.suspects.slice(0, 5))}`);

    console.log(`    [mutation evidence] before: ${beforeHits.length} link-target-integrity findings; after (src removed from scratch analytics.js): ${afterHits.length} findings citing "src"`);
    console.log(`    [mutation evidence] sample after-finding: ${JSON.stringify(after.suspects.find((s) => /"src"/.test(s.detail)))}`);
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
});

console.log('203 criterion 6 — no hardcoded literal');
test('grep -n "\'src\'|\\"src\\"" audit-app.js: every hit predates this diff (none is a hardcoded attribution-key literal added by 203)', () => {
  // Real grep, real output — pasted into specs/203-notes.md too. This test
  // asserts the substantive claim: none of the matched lines is a bare
  // string literal 'src' used AS a param name/allow-list entry (which is
  // exactly the bug class item 166 shipped) — the only 'src' occurrences in
  // audit-app.js are inside comments/prose explaining the mechanism.
  const out = execSync(`grep -n "'src'\\|\\"src\\"" ${JSON.stringify(path.join(ROOT, 'audit-app.js'))} || true`, { encoding: 'utf8' });
  const lines = out.split('\n').filter(Boolean);
  const codeLines = lines.filter((l) => {
    const afterLineNo = l.replace(/^\d+:/, '');
    const trimmed = afterLineNo.trim();
    return !trimmed.startsWith('//') && !trimmed.startsWith('*');
  });
  assert.strictEqual(codeLines.length, 0,
    `expected every 'src'/"src" occurrence in audit-app.js to be inside a comment (never live code); got: ${JSON.stringify(codeLines)}`);
});

console.log('203 criterion 7 — never-throws preserved (analytics.js unreadable)');
test('with analytics.js unreadable, the scan still completes, prints the note once, and rules (b)/(c) still report', () => {
  const stderrLines = [];
  const origErr = console.error;
  console.error = (...a) => stderrLines.push(a.join(' '));
  let result;
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-203-degrade-'));
    try {
      const f = path.join(dir, 'degrade.html');
      const html = `<!DOCTYPE html><html><head><title>t</title></head><body>
        <h1>Degrade Token</h1>
        <a class="tp-pool-link" href="https://www.defi.garden/">bad rule (b)</a>
        <a href="https://www.defi.garden/tokens/doesnotexist999">bad rule (c)</a>
        </body></html>`;
      fs.writeFileSync(f, html);
      result = prescanStaticPages({ pages: [f], analyticsJs: path.join(ROOT, 'does-not-exist-203-analytics.js') });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } finally { console.error = origErr; }
  assert.ok(stderrLines.some((l) => /link-target-integrity rule \(a\) \[home\.html half\] skipped/.test(l) && /analytics\.js unreadable/.test(l)),
    `expected exactly-once stderr note naming analytics.js unreadable; got: ${JSON.stringify(stderrLines)}`);
  assert.strictEqual(stderrLines.filter((l) => /link-target-integrity rule \(a\) \[home\.html half\] skipped/.test(l)).length, 1,
    'the skip note must print exactly once per scan, not once per file');
  assert.ok(result.suspects.some((s) => s.signal === 'link-target-integrity' && /tp-pool-link/.test(s.detail)), 'rule (b) must still fire');
  assert.ok(result.suspects.some((s) => s.signal === 'link-target-integrity' && /resolve/.test(s.detail)), 'rule (c) must still fire');
  assert.strictEqual(result.scanned, 1, `expected the page to still be scanned (no throw); got scanned=${result.scanned}`);
});

console.log('203 — coupling proof: analytics.js is the real 3rd source (not a fudge)');
test('appending a key to a copied analytics.js\'s capture array flips a home-path URL using that key from suspect to clean', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-203-coupling-'));
  try {
    const realAnalyticsJs = fs.readFileSync(path.join(ROOT, 'analytics.js'), 'utf8');
    const ORIGINAL_ARR = "['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',\n        'ref', 'gclid', 'fbclid', 'twclid', 'src']";
    assert.ok(realAnalyticsJs.includes(ORIGINAL_ARR), 'fixture wiring check: analytics.js array text moved out from under this test');
    const analyticsCopy = path.join(dir, 'analytics.js');
    fs.writeFileSync(analyticsCopy, realAnalyticsJs);
    const pageFile = path.join(dir, 'coupling.html');
    fs.writeFileSync(pageFile, '<!DOCTYPE html><html><head><title>t</title></head><body><a href="https://www.defi.garden/?zzzAttrParam=1">test</a></body></html>');

    const before = prescanStaticPages({ pages: [pageFile], analyticsJs: analyticsCopy });
    const beforeHit = before.suspects.find((s) => s.signal === 'link-target-integrity' && s.detail.includes('zzzAttrParam'));
    assert.ok(beforeHit, `expected zzzAttrParam to be flagged before it is added to analytics.js's capture array; got: ${JSON.stringify(before.suspects)}`);

    const modified = realAnalyticsJs.replace(ORIGINAL_ARR, ORIGINAL_ARR.replace("'src']", "'src', 'zzzAttrParam']"));
    fs.writeFileSync(analyticsCopy, modified);
    const after = prescanStaticPages({ pages: [pageFile], analyticsJs: analyticsCopy });
    const afterHit = after.suspects.find((s) => s.signal === 'link-target-integrity' && s.detail.includes('zzzAttrParam'));
    assert.ok(!afterHit, `expected zzzAttrParam to be CLEAN once added to analytics.js's own capture array; got: ${JSON.stringify(after.suspects)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

cleanupGeneratedOutput();

console.log(`\ntest_seo_src_attribution.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
