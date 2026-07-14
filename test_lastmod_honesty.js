/* Regression tests for spec 081 — generate-sitemap.js must preserve a URL
   entry's committed <lastmod> as long as the rest of the entry is byte-identical,
   and only stamp `now` on genuinely changed/new entries. Index <lastmod> = the max
   URL lastmod of the child file. Net effect: a no-data-change CI run produces
   byte-identical sitemaps → the workflow's porcelain gate skips the commit → no
   deploy (the lastmod-churn class from commit 8fee9e9ba).

   Drives the exported helpers (parseExistingUrlEntries / resolveLastmods /
   maxLastmodFromFile) against on-disk fixtures in a scratch dir. Fixture-driven,
   no network. Designed to fail under an always-return-now mutation (case a).

   Run: node test_lastmod_honesty.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseExistingUrlEntries,
  resolveLastmods,
  maxLastmodFromFile,
  LASTMOD_PLACEHOLDER,
} = require('./generate-sitemap.js');

const SCRATCH = '/tmp/claude-0/-home-user-defi-garden/655ed55a-51d8-5e18-8b0e-9a8b20a351d6/scratchpad';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(SCRATCH, 'lastmod-honesty-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Build a <url> block in generate-sitemap.js's exact emitted shape. Passing
// LASTMOD_PLACEHOLDER as the lastmod yields the "freshly built" entry that
// resolveLastmods compares against the committed (normalized) one.
function block(loc, lastmod, priority) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n` +
         `    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}
function wrap(blocks) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    blocks.join('') + '</urlset>';
}

const OLD1 = '2026-07-10T01:02:03.004Z';
const OLD2 = '2026-07-12T05:06:07.008Z';
const NOW = '2026-07-14T09:09:09.009Z';
const LOC_A = 'https://www.defi.garden/?token=AAVE';
const LOC_B = 'https://www.defi.garden/?token=USDC';

console.log('sitemap lastmod honesty — 081');

// (a) An entry byte-identical (modulo lastmod) to the committed one keeps the
// committed lastmod. This is the assert an always-return-now mutation fails.
test('unchanged entry preserves the committed lastmod', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'sitemap-tokens-all.xml');
    fs.writeFileSync(file, wrap([block(LOC_A, OLD1, '0.50')]));
    const existing = parseExistingUrlEntries(file);
    const fresh = [block(LOC_A, LASTMOD_PLACEHOLDER, '0.50')];
    const { entries, maxLastmod } = resolveLastmods(fresh, existing, NOW);
    assert.ok(entries[0].includes(`<lastmod>${OLD1}</lastmod>`),
      'unchanged entry must reuse the committed lastmod, not `now`');
    assert.ok(!entries[0].includes(NOW), 'must not stamp `now` on an unchanged entry');
    assert.strictEqual(maxLastmod, OLD1, 'maxLastmod reflects the preserved value');
  });
});

// (b) A changed attribute (priority delta) makes the entry no longer byte-identical
// → it earns a fresh `now` timestamp.
test('changed entry (priority delta) gets the new timestamp', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'sitemap-tokens-all.xml');
    fs.writeFileSync(file, wrap([block(LOC_A, OLD1, '0.50')]));
    const existing = parseExistingUrlEntries(file);
    const fresh = [block(LOC_A, LASTMOD_PLACEHOLDER, '0.70')]; // priority changed
    const { entries } = resolveLastmods(fresh, existing, NOW);
    assert.ok(entries[0].includes(`<lastmod>${NOW}</lastmod>`),
      'a changed entry must get `now`');
    assert.ok(!entries[0].includes(OLD1), 'a changed entry must not keep the old lastmod');
  });
});

// (c) A loc not present in the committed file is new → `now`.
test('new loc gets the new timestamp', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'sitemap-tokens-all.xml');
    fs.writeFileSync(file, wrap([block(LOC_A, OLD1, '0.50')]));
    const existing = parseExistingUrlEntries(file);
    const fresh = [block(LOC_B, LASTMOD_PLACEHOLDER, '0.50')]; // brand-new loc
    const { entries } = resolveLastmods(fresh, existing, NOW);
    assert.ok(entries[0].includes(`<lastmod>${NOW}</lastmod>`), 'a new loc must get `now`');
  });
});

// (d) Missing or unparseable old file → empty map → all entries fall back to `now`
// (the pre-081 all-new behavior).
test('missing old file → empty map → all-new timestamps', () => {
  withTmpDir(dir => {
    const missing = path.join(dir, 'does-not-exist.xml');
    const existing = parseExistingUrlEntries(missing);
    assert.strictEqual(existing.size, 0, 'missing file yields an empty map');
    const fresh = [block(LOC_A, LASTMOD_PLACEHOLDER, '0.50'), block(LOC_B, LASTMOD_PLACEHOLDER, '0.60')];
    const { entries } = resolveLastmods(fresh, existing, NOW);
    entries.forEach(e => assert.ok(e.includes(`<lastmod>${NOW}</lastmod>`),
      'every entry gets `now` when there is no committed file'));
  });
});

test('unparseable old file → empty map → all-new timestamps', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'garbage.xml');
    fs.writeFileSync(file, 'not xml at all — no url blocks here');
    const existing = parseExistingUrlEntries(file);
    assert.strictEqual(existing.size, 0, 'garbage file yields an empty map');
    const { entries } = resolveLastmods([block(LOC_A, LASTMOD_PLACEHOLDER, '0.50')], existing, NOW);
    assert.ok(entries[0].includes(`<lastmod>${NOW}</lastmod>`), 'gets `now` on unparseable file');
  });
});

// (e) Index lastmod = max URL lastmod of the child (ISO compares lexicographically).
test('maxLastmodFromFile / resolveLastmods return the max of child lastmods', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'sitemap-chain-Base.xml');
    fs.writeFileSync(file, wrap([
      block(LOC_A, OLD1, '0.50'),
      block(LOC_B, OLD2, '0.60'), // OLD2 > OLD1 lexicographically
    ]));
    assert.strictEqual(maxLastmodFromFile(file, NOW), OLD2,
      'index lastmod must be the max URL lastmod in the child');
    // And resolveLastmods surfaces the same max when both entries are unchanged.
    const existing = parseExistingUrlEntries(file);
    const fresh = [block(LOC_A, LASTMOD_PLACEHOLDER, '0.50'), block(LOC_B, LASTMOD_PLACEHOLDER, '0.60')];
    const { maxLastmod } = resolveLastmods(fresh, existing, NOW);
    assert.strictEqual(maxLastmod, OLD2, 'resolveLastmods maxLastmod = max of preserved entries');
  });
});

test('maxLastmodFromFile falls back when no lastmod is parseable', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'empty.xml');
    fs.writeFileSync(file, '<?xml version="1.0"?>\n<urlset></urlset>');
    assert.strictEqual(maxLastmodFromFile(file, NOW), NOW, 'falls back to `now` when nothing parses');
  });
});

// A mixed child (one preserved, one changed) → index max = max(old, now) = now.
test('mixed child: index max includes a changed entry’s new timestamp', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'sitemap-tokens-all.xml');
    fs.writeFileSync(file, wrap([block(LOC_A, OLD1, '0.50'), block(LOC_B, OLD2, '0.60')]));
    const existing = parseExistingUrlEntries(file);
    const fresh = [
      block(LOC_A, LASTMOD_PLACEHOLDER, '0.50'), // unchanged → OLD1
      block(LOC_B, LASTMOD_PLACEHOLDER, '0.99'), // changed → NOW
    ];
    const { entries, maxLastmod } = resolveLastmods(fresh, existing, NOW);
    assert.ok(entries[0].includes(OLD1), 'unchanged entry preserved');
    assert.ok(entries[1].includes(NOW), 'changed entry stamped now');
    assert.strictEqual(maxLastmod, NOW, 'index max reflects the newest resolved lastmod');
  });
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
