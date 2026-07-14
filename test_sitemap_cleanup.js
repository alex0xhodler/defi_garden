/* Regression tests for spec 080 — generate-sitemap.js must delete stale
   generator-owned root sitemap-*.xml children it did NOT write this run, while
   never touching: the index (sitemap.xml), files it DID write, the four foreign
   page-sitemaps (owned by generate-token-pages.js / generate-chain-pages.js), or
   any non-sitemap file.

   Before 080 the CI regenerated ~106 children but only committed the index +
   page-sitemaps, so orphaned lists (sitemap-combos.xml, dead sitemap-chain-*.xml)
   deployed forever and desynced from the index. This drives cleanupStaleSitemaps
   in a temp dir with a fixed cast of files and asserts exactly what survives.
   Fixture-driven, no network.

   Run: node test_sitemap_cleanup.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cleanupStaleSitemaps, FOREIGN_PAGE_SITEMAPS } = require('./generate-sitemap.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-cleanup-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log('sitemap stale-child cleanup — 080');

// The core case: one stale generator-owned child, one foreign page-sitemap, one
// fresh-written child, the index, and a non-sitemap file. Only the stale child
// must be deleted.
test('deletes only the stale generator-owned child, keeps everything else', () => {
  withTmpDir(dir => {
    const files = {
      'sitemap-chain-Fake.xml': '<urlset></urlset>',      // stale generator-owned → delete
      'sitemap-token-pages.xml': '<urlset></urlset>',      // foreign page-sitemap → keep
      'sitemap-chain-Kept.xml': '<urlset></urlset>',       // fresh-written this run → keep
      'sitemap.xml': '<sitemapindex></sitemapindex>',      // index → keep
      'robots.txt': 'ok',                                  // non-sitemap → keep
    };
    Object.entries(files).forEach(([f, c]) => fs.writeFileSync(path.join(dir, f), c));

    const deleted = cleanupStaleSitemaps(['sitemap-chain-Kept.xml'], dir);

    const exists = f => fs.existsSync(path.join(dir, f));
    assert.ok(!exists('sitemap-chain-Fake.xml'), 'stale generator-owned child should be deleted');
    assert.ok(exists('sitemap-token-pages.xml'), 'foreign page-sitemap must never be deleted');
    assert.ok(exists('sitemap-chain-Kept.xml'), 'fresh-written child must be kept');
    assert.ok(exists('sitemap.xml'), 'index sitemap.xml must never be deleted');
    assert.ok(exists('robots.txt'), 'non-sitemap file must never be touched');

    assert.deepStrictEqual(deleted, ['sitemap-chain-Fake.xml'],
      'exactly the stale child should be reported deleted');
  });
});

// None of the four foreign page-sitemaps may ever be deleted, even when absent
// from writtenFilenames (they are, by design — this generator does not own them).
test('never deletes any of the four foreign page-sitemaps', () => {
  withTmpDir(dir => {
    FOREIGN_PAGE_SITEMAPS.forEach(f => fs.writeFileSync(path.join(dir, f), '<urlset></urlset>'));
    const deleted = cleanupStaleSitemaps([], dir);
    assert.deepStrictEqual(deleted, [], 'no page-sitemap should be deleted');
    FOREIGN_PAGE_SITEMAPS.forEach(f =>
      assert.ok(fs.existsSync(path.join(dir, f)), `${f} must survive cleanup`));
  });
});

// Empty dir / nothing to delete is a clean no-op.
test('no-op when there is nothing stale to delete', () => {
  withTmpDir(dir => {
    fs.writeFileSync(path.join(dir, 'sitemap.xml'), '<sitemapindex></sitemapindex>');
    const deleted = cleanupStaleSitemaps([], dir);
    assert.deepStrictEqual(deleted, [], 'no deletions expected');
    assert.ok(fs.existsSync(path.join(dir, 'sitemap.xml')), 'index untouched');
  });
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
