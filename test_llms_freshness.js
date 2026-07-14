/* Regression tests for spec 083 — generate-llms.js must stop churning
   llms.txt / llms-full.txt when the content is unchanged. New output is
   compared against the on-disk file MODULO the three volatile timestamp lines
   (`- Last Updated: <iso>` in both files; the `(fetched: <iso-or-unavailable>)`
   value inside `- Data Sources: …` in llms-full.txt). Equal → skip the write so
   the committed file (and its timestamps) stay byte-identical; different / no
   file / unparseable → write fresh. Net effect: a no-data-change CI run leaves
   the files untouched → the workflow's porcelain gate skips the commit → no
   Vercel deploy (the same class 081 fixed for sitemap <lastmod>).

   Drives the exported helpers (normalizeLlmsContent / writeIfContentChanged /
   LLMS_TS_PLACEHOLDER) against on-disk fixtures in a scratch dir. Fixture-driven,
   no network. Designed to fail under both always-changed and always-unchanged
   mutations of the compare (cases a and b).

   Run: node test_llms_freshness.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  normalizeLlmsContent,
  writeIfContentChanged,
  LLMS_TS_PLACEHOLDER,
} = require('./generate-llms.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'llms-freshness-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Minimal stand-ins for the real emitted files, exercising the exact volatile
// lines normalizeLlmsContent targets. `fetchedAt` may be an ISO string or the
// literal 'unavailable'.
function concise(updatedAt, urls) {
  return [
    '# Find the Best Yields for Your Tokens Across All Chains | DeFi Garden',
    '',
    `- Last Updated: ${updatedAt}`,
    '- Canonical: https://www.defi.garden',
    '- Data Sources: sitemap.xml, DefiLlama API',
    `- Total URLs: ${urls.length}`,
    '',
    '## Homepage',
    ...urls.map(u => `- ${u}`),
  ].join('\n');
}
function full(updatedAt, fetchedAt, urls) {
  return [
    '# Complete DeFi Yield Index: Best Token Yields Across All Blockchains | DeFi Garden',
    '',
    `- Last Updated: ${updatedAt}`,
    '- Canonical: https://www.defi.garden',
    `- Data Sources: sitemap.xml, DefiLlama API (fetched: ${fetchedAt})`,
    `- Total URLs: ${urls.length}`,
    '',
    '## Token Pages',
    ...urls.map(u => `- ${u}`),
  ].join('\n');
}

const OLD_UPDATED = '2026-07-10T01:02:03.004Z';
const OLD_FETCHED = '2026-07-10T01:02:00.000Z';
const NEW_UPDATED = '2026-07-14T09:09:09.009Z';
const NEW_FETCHED = '2026-07-14T09:09:08.000Z';
const URLS = ['https://www.defi.garden/?token=USDC', 'https://www.defi.garden/?token=ETH'];

console.log('llms.txt / llms-full.txt freshness — 083');

// (a) New content equal-modulo-timestamps to the committed file → NOT rewritten,
// byte-identical, old timestamps preserved. (Fails an always-changed mutation.)
test('unchanged content → file not rewritten, committed timestamps preserved', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'llms-full.txt');
    const committed = full(OLD_UPDATED, OLD_FETCHED, URLS);
    fs.writeFileSync(file, committed);
    const before = fs.statSync(file).mtimeMs;
    const wrote = writeIfContentChanged(file, full(NEW_UPDATED, NEW_FETCHED, URLS), NEW_UPDATED);
    assert.strictEqual(wrote, false, 'unchanged content must not be written');
    const after = fs.readFileSync(file, 'utf8');
    assert.strictEqual(after, committed, 'file must stay byte-identical');
    assert.ok(after.includes(`- Last Updated: ${OLD_UPDATED}`), 'old Last Updated preserved');
    assert.ok(after.includes(`(fetched: ${OLD_FETCHED})`), 'old fetched timestamp preserved');
    assert.strictEqual(fs.statSync(file).mtimeMs, before, 'file mtime unchanged (no rewrite)');
  });
});

// (b) A real content change (URL added) → rewritten, carrying the new timestamp.
// (Fails an always-unchanged mutation.)
test('content change (URL added) → file rewritten with new timestamp', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'llms-full.txt');
    fs.writeFileSync(file, full(OLD_UPDATED, OLD_FETCHED, URLS));
    const moreUrls = URLS.concat('https://www.defi.garden/?token=DAI');
    const wrote = writeIfContentChanged(file, full(NEW_UPDATED, NEW_FETCHED, moreUrls), NEW_UPDATED);
    assert.strictEqual(wrote, true, 'changed content must be written');
    const after = fs.readFileSync(file, 'utf8');
    assert.ok(after.includes(`- Last Updated: ${NEW_UPDATED}`), 'new Last Updated stamped');
    assert.ok(after.includes('?token=DAI'), 'new URL present');
    assert.ok(!after.includes(OLD_UPDATED), 'old timestamp gone');
  });
});

// llms.txt (no fetched line) also skips on an unchanged content run.
test('llms.txt unchanged (Last Updated only) → not rewritten', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'llms.txt');
    const committed = concise(OLD_UPDATED, URLS);
    fs.writeFileSync(file, committed);
    const wrote = writeIfContentChanged(file, concise(NEW_UPDATED, URLS), NEW_UPDATED);
    assert.strictEqual(wrote, false, 'unchanged llms.txt must not be written');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), committed, 'llms.txt byte-identical');
  });
});

// (c) No existing file → written fresh.
test('no existing file → written fresh', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'llms-full.txt');
    const content = full(NEW_UPDATED, NEW_FETCHED, URLS);
    const wrote = writeIfContentChanged(file, content, NEW_UPDATED);
    assert.strictEqual(wrote, true, 'missing file must be written');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), content, 'fresh content written verbatim');
  });
});

// (d) Existing file without recognizable timestamp lines → written fresh (fallback).
test('existing file without timestamp lines → written fresh (fallback)', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'llms-full.txt');
    fs.writeFileSync(file, 'garbage content with no recognizable header lines at all');
    const content = full(NEW_UPDATED, NEW_FETCHED, URLS);
    const wrote = writeIfContentChanged(file, content, NEW_UPDATED);
    assert.strictEqual(wrote, true, 'unparseable existing file must be written fresh');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), content, 'fresh content written');
  });
});

// (e) The `(fetched: unavailable)` form normalizes correctly: a run whose only
// deltas are Last Updated AND fetched (iso ↔ unavailable) is still "unchanged".
test('(fetched: unavailable) form normalizes to the placeholder', () => {
  const isoForm = full(OLD_UPDATED, OLD_FETCHED, URLS);
  const unavailForm = full(NEW_UPDATED, 'unavailable', URLS);
  assert.strictEqual(
    normalizeLlmsContent(isoForm), normalizeLlmsContent(unavailForm),
    'iso and unavailable fetched forms must normalize equal (modulo timestamps)');
  assert.ok(normalizeLlmsContent(unavailForm).includes(`(fetched: ${LLMS_TS_PLACEHOLDER})`),
    'unavailable value is replaced by the placeholder');
  assert.ok(!normalizeLlmsContent(unavailForm).includes('unavailable'),
    'literal "unavailable" removed by normalization');
});

test('(fetched: unavailable) unchanged run → file not rewritten', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'llms-full.txt');
    const committed = full(OLD_UPDATED, 'unavailable', URLS);
    fs.writeFileSync(file, committed);
    const wrote = writeIfContentChanged(file, full(NEW_UPDATED, NEW_FETCHED, URLS), NEW_UPDATED);
    assert.strictEqual(wrote, false, 'unavailable→iso with no content delta must not rewrite');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), committed, 'file byte-identical');
  });
});

// Normalizer does not touch content lines that merely resemble the metadata.
test('normalizer only rewrites the volatile metadata lines', () => {
  const content = full(OLD_UPDATED, OLD_FETCHED, URLS);
  const normalized = normalizeLlmsContent(content);
  assert.ok(normalized.includes(`- Last Updated: ${LLMS_TS_PLACEHOLDER}`), 'Last Updated placeholdered');
  assert.ok(normalized.includes('- Canonical: https://www.defi.garden'), 'Canonical untouched');
  assert.ok(normalized.includes('- Total URLs: 2'), 'Total URLs untouched');
  URLS.forEach(u => assert.ok(normalized.includes(`- ${u}`), 'URL rows untouched'));
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
