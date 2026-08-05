/**
 * test_sitemap_xml.js — catches malformed sitemap XML in `npm test`, before it
 * ever reaches production. The old defense was a CI `xmllint` step that could
 * never fire (xmllint isn't on the runner) and never failed the build; this
 * runs the real generators offline and validates every file they emit.
 *
 * Deliberately NOT brittle: it asserts structural well-formedness (via the same
 * validate-sitemaps.js used in CI), not exact byte output — pool data changes
 * daily, so a golden-string test would false-alarm constantly. What it DOES
 * pin is the one thing that must never regress: a multi-parameter <loc> like
 * `?token=USDC&chain=Ethereum` must XML-escape its `&` (→ `&amp;`). If any
 * generator emits a raw ampersand (the classic sitemap bug), the document is
 * no longer well-formed and this test goes red.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { validateFiles, findSitemapFiles, validateXmlString } = require('./validate-sitemaps.js');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// A fixture that exercises the real risk surface:
//  - USDC/STETH pools across chains, all well above the sitemap TVL floor —
//    together with item 188's chain=All rungs (sitemap-main.xml, untouched
//    by item 226) this is what forces the `&`-escaping path to run in a
//    written file (item 226: the app-view `?token=X&chain=Y` combo family
//    that used to be this test's escaping source no longer ships by default).
//  - Edge-case symbols with & < > " ' — must be sanitized/escaped, never
//    break the document.
const FIXTURE = [
  { pool: 'p1', chain: 'Ethereum', project: 'aave-v3',    symbol: 'USDC', tvlUsd: 5.0e8, apyBase: 4.2, apyReward: 0.3, apyMean30d: 4.1 },
  { pool: 'p2', chain: 'Ethereum', project: 'compound-v3', symbol: 'USDC', tvlUsd: 2.0e8, apyBase: 3.9, apyReward: 0.0, apyMean30d: 3.8 },
  { pool: 'p3', chain: 'Arbitrum', project: 'aave-v3',    symbol: 'USDC', tvlUsd: 1.5e8, apyBase: 5.1, apyReward: 0.4, apyMean30d: 5.0 },
  { pool: 'p4', chain: 'Arbitrum', project: 'radiant',    symbol: 'USDC', tvlUsd: 1.1e8, apyBase: 4.7, apyReward: 1.0, apyMean30d: 4.5 },
  { pool: 'p5', chain: 'Ethereum', project: 'lido',       symbol: 'STETH', tvlUsd: 9.0e8, apyBase: 3.6, apyReward: 0.0, apyMean30d: 3.6 },
  { pool: 'p6', chain: 'Ethereum', project: 'rocketpool', symbol: 'STETH', tvlUsd: 3.0e8, apyBase: 3.4, apyReward: 0.0, apyMean30d: 3.4 },
  // Nasty symbols — must never produce raw &/<//>/quotes in any <loc>.
  { pool: 'p7', chain: 'Ethereum', project: 'curve',   symbol: 'AT&T', tvlUsd: 1.2e8, apyBase: 6.0, apyReward: 0.0 },
  { pool: 'p8', chain: 'Base',     project: 'aero',    symbol: 'A<B>', tvlUsd: 9.0e7, apyBase: 8.0, apyReward: 2.0 },
  { pool: 'p9', chain: 'Solana',   project: 'kamino',  symbol: 'X"Y\'Z', tvlUsd: 8.0e7, apyBase: 5.5, apyReward: 0.0 },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-xml-'));
const fixturePath = path.join(tmp, 'fixture.json');
fs.writeFileSync(fixturePath, JSON.stringify(FIXTURE));
const repo = __dirname;
const originalCwd = process.cwd();
const realLog = console.log;

console.log('test_sitemap_xml: validating generated sitemap XML is well-formed\n');

(async () => {
try {
  // 1. Token + chain landing-page sitemaps (their own generators / code paths).
  //    cwd: tmp is REQUIRED — generateOgImages() writes to `<cwd>/og/...`, so
  //    without it the test would clobber the repo's committed OG PNGs. HTML and
  //    sitemap outputs use absolute --out/--sitemap paths, so cwd only steers
  //    the OG side effect into the temp dir where it's cleaned up.
  console.log('Generating token + chain sitemaps (offline fixture)...');
  execFileSync('node', [
    path.join(repo, 'generate-token-pages.js'),
    '--fixture', fixturePath,
    '--out', path.join(tmp, 'tokens'),
    '--sitemap', path.join(tmp, 'sitemap-token-pages.xml'),
  ], { stdio: 'ignore', cwd: tmp });
  execFileSync('node', [
    path.join(repo, 'generate-chain-pages.js'),
    '--fixture', fixturePath,
    '--out', path.join(tmp, 'chains'),
    '--sitemap', path.join(tmp, 'sitemap-chain-pages.xml'),
  ], { stdio: 'ignore', cwd: tmp });

  // 2. The main sitemap suite (index + vertical child sitemaps). Runs from the
  //    temp dir so it writes there and picks up the token/chain sitemaps above
  //    into its <sitemapindex> (existsSync-gated) — validating those <loc>s too.
  process.chdir(tmp);
  // Quiet the generator's console noise; restore after.
  console.log = () => {};
  const { generateSitemapSuite } = require('./generate-sitemap.js');
  await generateSitemapSuite(FIXTURE);
  console.log = realLog;
  process.chdir(originalCwd);

  // 3. Validate every sitemap*.xml the run produced.
  const files = findSitemapFiles(tmp);
  check('generators emitted sitemap files', files.length >= 3, `only ${files.length} found`);

  const { ok, results } = validateFiles(files);
  results.forEach(r => {
    check(`well-formed: ${path.basename(r.file)}`, r.valid, r.error);
  });
  check('all generated sitemaps are valid XML', ok);

  // 4. The escaping guard: at least one emitted <loc> is a multi-parameter URL,
  //    and every such `&` is escaped as `&amp;` (never a raw ampersand).
  //    item 226: `?token=USDC&chain=Ethereum` no longer exists anywhere — the
  //    app-view families that emitted token+chain combos are suppressed by
  //    default (EMIT_APP_VIEW_SITEMAPS=false). sitemap-main.xml's sanctioned
  //    `?chain=All&minTvl=...` rungs (item 188, untouched by 226) are now the
  //    multi-parameter URL source this guard exercises instead.
  const allXml = files.map(f => fs.readFileSync(f, 'utf8'));
  const combo = allXml.find(x => x.includes('chain=All') && x.includes('minTvl='));
  check('a multi-parameter chain=All+minTvl <loc> was generated', !!combo,
    'fixture should yield ?chain=All&minTvl=...');
  if (combo) {
    check('multi-parameter <loc> escapes & as &amp;', combo.includes('&amp;'));
    // A raw `&` NOT starting a valid entity (&amp; &lt; &gt; &quot; &apos; &#..)
    // would be malformed. Prove none slipped through.
    const rawAmp = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/;
    allXml.forEach((x, i) => {
      check(`no unescaped & in ${path.basename(files[i])}`, !rawAmp.test(x));
    });
  }

  // 5. Sanity: a deliberately malformed doc MUST be rejected (guards the guard —
  //    proves the validator isn't trivially passing everything).
  const bad = validateXmlString('<urlset><url><loc>https://x/?a=1&b=2</loc></url></urlset>', 'raw-amp');
  check('validator rejects a raw unescaped &', bad.valid === false);

} catch (e) {
  console.log = realLog; // restore if the generator threw while stubbed
  failed++;
  console.log(`  ✗ unexpected error — ${e && e.message}`);
} finally {
  console.log = realLog;
  process.chdir(originalCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${failed === 0 ? '✅' : '❌'} test_sitemap_xml: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
})();
