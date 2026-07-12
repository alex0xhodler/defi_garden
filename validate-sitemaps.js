#!/usr/bin/env node
/**
 * Portable sitemap XML validator (replaces the CI `xmllint` step, which was a
 * no-op: xmllint isn't installed on ubuntu-latest runners, so it printed
 * "❌ invalid" for EVERY run regardless of the actual XML and never failed the
 * job — a validation gate that could not catch a real malformation).
 *
 * This uses fast-xml-parser (already a production dependency, so no `apt
 * install` and no system binary), runs identically in CI and in `npm test`,
 * and — unlike the old step — exits non-zero on genuinely malformed XML so a
 * broken sitemap can never be published.
 *
 * The check is deliberately structural, not string-exact (so it never goes
 * brittle as pool data changes): each file must be well-formed XML AND contain
 * at least one <url>/<sitemap> entry (an empty or truncated write is a defect
 * too). An unescaped `&`/`<`/`>` in a <loc> — the classic sitemap bug — makes
 * fast-xml-parser's validator reject the document, which is exactly what we
 * want to surface in testing rather than in production.
 */
const fs = require('fs');
const path = require('path');
const { XMLValidator } = require('fast-xml-parser');

/**
 * Validate a single XML string. Returns { valid: true } or
 * { valid: false, error: <message>, line: <number|undefined> }.
 */
function validateXmlString(xml, label = '<string>') {
  if (typeof xml !== 'string' || xml.trim() === '') {
    return { valid: false, error: `${label}: empty output` };
  }
  const result = XMLValidator.validate(xml, { allowBooleanAttributes: true });
  if (result !== true) {
    return { valid: false, error: `${label}: ${result.err.msg}`, line: result.err.line };
  }
  // Well-formed but empty-of-content is still a defect for a sitemap.
  if (!/<url>|<sitemap>/.test(xml)) {
    return { valid: false, error: `${label}: well-formed but contains no <url>/<sitemap> entries` };
  }
  return { valid: true };
}

/** Validate a list of file paths. Returns { ok, results: [{file, ...}] }. */
function validateFiles(files) {
  const results = files.map(file => {
    let xml;
    try {
      xml = fs.readFileSync(file, 'utf8');
    } catch (e) {
      return { file, valid: false, error: `cannot read: ${e.message}` };
    }
    return { file, ...validateXmlString(xml, path.basename(file)) };
  });
  return { ok: results.every(r => r.valid), results };
}

/** All sitemap*.xml files in a directory (the index + every child sitemap). */
function findSitemapFiles(dir = process.cwd()) {
  return fs.readdirSync(dir)
    .filter(f => /^sitemap.*\.xml$/.test(f))
    .sort()
    .map(f => path.join(dir, f));
}

module.exports = { validateXmlString, validateFiles, findSitemapFiles };

// CLI: `node validate-sitemaps.js [file ...]` — defaults to every sitemap*.xml
// in the working directory. Exits 1 if any file is invalid.
if (require.main === module) {
  const args = process.argv.slice(2);
  const files = args.length ? args : findSitemapFiles();
  if (files.length === 0) {
    console.error('❌ No sitemap*.xml files found to validate');
    process.exit(1);
  }
  const { ok, results } = validateFiles(files);
  results.forEach(r => {
    if (r.valid) {
      console.log(`✅ ${path.basename(r.file)}`);
    } else {
      console.log(`❌ ${r.error}${r.line ? ` (line ${r.line})` : ''}`);
    }
  });
  if (!ok) {
    console.error(`\n❌ Sitemap XML validation failed (${results.filter(r => !r.valid).length}/${results.length} invalid)`);
    process.exit(1);
  }
  console.log(`\n✅ All ${results.length} sitemap file(s) valid`);
}
