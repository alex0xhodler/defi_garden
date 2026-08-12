/* test_token_depth_section.js — item 232 (specs/232.md): the "How this rate
   has behaved" depth section on head-set static token pages.

   130 head pages carry the ENTIRE Google sitemap bet (item 226's close-out)
   and had received zero per-page depth. This item adds ONE data-derived
   depth section, rendered ONLY for head-set pages (the same `selectHeadTokens`
   predicate item 226 already exports — never a second copy, the mirror rule).

   Runs the REAL generator (generate-token-pages.js) as a child process into a
   scratch temp dir — mirrors test_markdown_twins.js's own harness pattern
   (child process, --fixture/--out/--sitemap, cwd !== repo root). This file
   builds its OWN custom fixture (rather than the repo's shared
   test_fixtures/pools-sample.json, which resolves to exactly ONE head token
   under the real $10M/2-pool head gate — too thin a population to exercise
   assertion 3's "distinct across >=80% of head pages" or the branch mix of
   the depth section's own conditional sentences) — same reasoning
   test_markdown_twins.js already applied to its own 24-token synthetic fixture.

   Assertions:
     1. Set equality (mirror rule), BOTH directions: sitemap head-slug set ==
        set of tokens/*.html whose page contains the depth section. EN, then KO.
     2. Same equality for the .md twins.
     3. Non-placeholder, non-identical content across head pages.
     4. Rail behavior on a SEPARATE crafted fixture: an insane apyMean30d
        (item 144's real 36452.38798 instance) renders an em dash and never
        appears in the section; an anomalous pool never appears in the
        section at all.
     5. Selection untouched: sitemap <loc> set == selectHeadTokens(pools).
     6. KO depth sections contain Hangul; EN depth sections contain none.

   Run: node test_token_depth_section.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tp = require('./generate-token-pages.js');
const gs = require('./generate-sitemap.js');
const { createTranslationFunction } = require('./translations.js');
const { extractLocs } = require('./indexnow-ping.js'); // house pattern, never a second regex

const TOKEN_GEN = path.join(__dirname, 'generate-token-pages.js');
const SITE_URL = tp.SITE_URL;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Never run a generator with cwd === repo root (territory note 4 + spec 076
// convention) — a scratch run must not touch committed tokens/ko/og output.
function runGen(cwd, outArg, sitemapArg, fixturePath) {
  assert.notStrictEqual(path.resolve(cwd), __dirname, 'refusing to run generator with cwd === repo root');
  execFileSync('node', [TOKEN_GEN, '--fixture', fixturePath, '--out', outArg, '--sitemap', sitemapArg], {
    cwd, stdio: 'pipe',
  });
}

function withTmpDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// Main population fixture: 15 head-worthy tokens (>=2 pools each >= the
// sitemap's $10M rail, non-anomalous) with a rich, varying mix of
// apyReward/apyMean30d/ilRisk/chain — enough real per-token variety to prove
// assertion 3's distinctness — plus 5 tail tokens (1 pool each, below the
// $10M head rail but above the $100K page-eligibility floor) that must still
// generate a normal page WITHOUT the depth section.
// ---------------------------------------------------------------------------
const CHAINS = ['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Avalanche'];
const HEAD_COUNT = 15;
const TAIL_COUNT = 5;

function buildMainFixturePools() {
  const pools = [];
  for (let i = 0; i < HEAD_COUNT; i++) {
    const symbol = `HD${i}`;
    // Pool A
    pools.push({
      symbol, project: `proja${i}`, chain: CHAINS[i % CHAINS.length],
      tvlUsd: 10000000 + i * 500000,
      apyBase: 3 + (i % 5),
      apyReward: (i % 3 === 0) ? 1.2 : 0,
      apyMean30d: (i % 4 !== 3) ? (3 + (i % 5) + 0.3) : undefined,
      ilRisk: (i % 3 === 1) ? 'yes' : 'no',
      pool: `${symbol.toLowerCase()}-a-${i}`,
    });
    // Pool B — different chain/project/rate mix, so each token's OWN spread
    // is real, not a repeated single number. ilRisk pattern is INDEPENDENT of
    // pool A's (i%5===2, not i%3===1) so ilCount takes 0, 1, AND 2 across the
    // population (item 232 defect-1 fix needs a numerator>1 case for the IL
    // sentence too, not just incentives/mean).
    pools.push({
      symbol, project: `projb${i}`, chain: CHAINS[(i + 2) % CHAINS.length],
      tvlUsd: 11000000 + i * 400000,
      apyBase: 4 + (i % 6),
      apyReward: (i % 4 === 0) ? 2.5 : 0,
      apyMean30d: (i % 5 !== 4) ? (4 + (i % 6) - 0.2) : undefined,
      ilRisk: (i % 5 === 2) ? 'yes' : 'no',
      pool: `${symbol.toLowerCase()}-b-${i}`,
    });
  }
  for (let i = 0; i < TAIL_COUNT; i++) {
    const symbol = `TL${i}`;
    pools.push({
      symbol, project: `tailproj${i}`, chain: 'Polygon',
      tvlUsd: 500000 + i * 300000, // below the $10M head rail, above the $100K page floor
      apyBase: 5 + i,
      apyReward: 0,
      pool: `${symbol.toLowerCase()}-${i}`,
    });
  }
  return pools;
}

// ---------------------------------------------------------------------------
// Rail-behavior fixture (assertion 4): a SEPARATE, small, crafted fixture —
// never the shared/main one. Both tokens are head-worthy (2 railed pools
// each, >= $10M TVL, non-anomalous).
// ---------------------------------------------------------------------------
function buildRailFixturePools() {
  return [
    // MEANX: one sane 30d mean, one INSANE 30d mean (item 144's real
    // 36452.38798 instance, 36x the 1000% rail) — the insane one must never
    // reach the page.
    { symbol: 'MEANX', project: 'goodmean', chain: 'Ethereum', tvlUsd: 15000000, apyBase: 5, apyReward: 0, apyMean30d: 4.8, ilRisk: 'no', pool: 'meanx-good' },
    { symbol: 'MEANX', project: 'badmean', chain: 'Base', tvlUsd: 12000000, apyBase: 6, apyReward: 0, apyMean30d: 36452.38798, ilRisk: 'no', pool: 'meanx-bad' },
    // ANOMHEAD: two clean railed pools (head-worthy) + one ANOMALOUS pool
    // (total APY 1500% > APY_SANITY_LIMIT) that must never appear anywhere
    // in the section (or count toward the head gate).
    { symbol: 'ANOMHEAD', project: 'anomgood1', chain: 'Arbitrum', tvlUsd: 15000000, apyBase: 5, apyReward: 0, pool: 'anomhead-good1' },
    { symbol: 'ANOMHEAD', project: 'anomgood2', chain: 'Optimism', tvlUsd: 12000000, apyBase: 6, apyReward: 0, pool: 'anomhead-good2' },
    { symbol: 'ANOMHEAD', project: 'anombad', chain: 'Solana', tvlUsd: 20000000, apyBase: 1500, apyReward: 0, pool: 'anomhead-bad' },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const HTML_DEPTH_MARKER = '<section class="tp-depth"';
const tEn = createTranslationFunction('en');
const tKo = createTranslationFunction('ko');
const MD_DEPTH_HEADING_EN = `## ${tEn('tcpDepthHeading')}`;
const MD_DEPTH_HEADING_KO = `## ${tKo('tcpDepthHeading')}`;

/** Set<slug> of files in `dir` (top-level only, so `index.<ext>` and the
 * `az/` subdirectory are naturally excluded — readdir returns 'az' as a bare
 * name with no matching extension) whose content passes `containsFn`. */
function slugsWithMarker(dir, ext, containsFn) {
  const out = new Set();
  fs.readdirSync(dir).forEach(f => {
    if (!f.endsWith(ext) || f === `index${ext}`) return;
    const slug = f.slice(0, -ext.length);
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    if (containsFn(content)) out.add(slug);
  });
  return out;
}

/** Set<slug> of every /tokens/<slug> or /ko/tokens/<slug> <loc> in a
 * sitemap XML file — excludes the hub (`/tokens`) and A–Z sub-hub
 * (`/tokens/az/<letter>`) URLs. */
function sitemapTokenSlugs(sitemapPath) {
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const out = new Set();
  const enPrefix = `${SITE_URL}/tokens/`;
  const koPrefix = `${SITE_URL}/ko/tokens/`;
  extractLocs(xml).forEach(loc => {
    let rest = null;
    if (loc.startsWith(enPrefix)) rest = loc.slice(enPrefix.length);
    else if (loc.startsWith(koPrefix)) rest = loc.slice(koPrefix.length);
    if (rest == null || rest === '' || rest.startsWith('az/')) return;
    out.add(rest);
  });
  return out;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
function setDiff(a, b) {
  return [...a].filter(v => !b.has(v));
}

function extractSection(html, tagOpenMarker) {
  const start = html.indexOf(tagOpenMarker);
  if (start === -1) return null;
  const end = html.indexOf('</section>', start);
  return end === -1 ? html.slice(start) : html.slice(start, end + '</section>'.length);
}

const HANGUL_RE = /[가-힣]/;

// ===========================================================================
console.log('test_token_depth_section.js — item 232: token-page depth section\n');

withTmpDir('dg-232-depth-', (scratch) => {
  const fixturePath = path.join(scratch, 'fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify({ data: buildMainFixturePools() }));
  const outDir = path.join(scratch, 'tokens');
  const sitemapPath = path.join(scratch, 'sitemap-token-pages.xml');
  const koSitemapPath = path.join(scratch, 'sitemap-token-pages-ko.xml');
  runGen(scratch, outDir, sitemapPath, fixturePath);

  const koOutDir = path.join(scratch, 'ko', 'tokens');

  console.log('scratch run wiring sanity');
  test('EN tokens dir was written with the expected 20 pages', () => {
    const htmlFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.html') && f !== 'index.html');
    assert.strictEqual(htmlFiles.length, HEAD_COUNT + TAIL_COUNT, `expected ${HEAD_COUNT + TAIL_COUNT} pages, got ${htmlFiles.length}`);
  });
  test('KO tokens dir was written with the expected 20 pages', () => {
    const htmlFiles = fs.readdirSync(koOutDir).filter(f => f.endsWith('.html') && f !== 'index.html');
    assert.strictEqual(htmlFiles.length, HEAD_COUNT + TAIL_COUNT, `expected ${HEAD_COUNT + TAIL_COUNT} pages, got ${htmlFiles.length}`);
  });

  // -------------------------------------------------------------------------
  // (1) Set equality, both directions, EN + KO — HTML.
  // -------------------------------------------------------------------------
  console.log('\n(1) set equality (mirror rule): sitemap head slugs == depth-rendering html slugs');
  const enSitemapSlugs = sitemapTokenSlugs(sitemapPath);
  const koSitemapSlugs = sitemapTokenSlugs(koSitemapPath);
  const enHtmlDepthSlugs = slugsWithMarker(outDir, '.html', c => c.includes(HTML_DEPTH_MARKER));
  const koHtmlDepthSlugs = slugsWithMarker(koOutDir, '.html', c => c.includes(HTML_DEPTH_MARKER));

  test(`sanity: EN sitemap head set is non-empty and a strict subset of the 20 generated pages (got ${enSitemapSlugs.size})`, () => {
    assert.ok(enSitemapSlugs.size > 0, 'expected at least one head token in this fixture');
    assert.ok(enSitemapSlugs.size < HEAD_COUNT + TAIL_COUNT, 'expected the head set to be a strict subset (tail tokens must be excluded)');
  });
  test('EN: sitemap head-slug set == html depth-rendering slug set (both directions)', () => {
    assert.ok(setsEqual(enSitemapSlugs, enHtmlDepthSlugs),
      `sitemap-only: ${JSON.stringify(setDiff(enSitemapSlugs, enHtmlDepthSlugs))}; depth-only: ${JSON.stringify(setDiff(enHtmlDepthSlugs, enSitemapSlugs))}`);
  });
  test('KO: sitemap head-slug set == html depth-rendering slug set (both directions)', () => {
    assert.ok(setsEqual(koSitemapSlugs, koHtmlDepthSlugs),
      `sitemap-only: ${JSON.stringify(setDiff(koSitemapSlugs, koHtmlDepthSlugs))}; depth-only: ${JSON.stringify(setDiff(koHtmlDepthSlugs, koSitemapSlugs))}`);
  });
  test('EN and KO sitemap head-slug sets are identical to each other (sanity)', () => {
    assert.ok(setsEqual(enSitemapSlugs, koSitemapSlugs));
  });

  // -------------------------------------------------------------------------
  // (2) Same equality for the .md twins.
  // -------------------------------------------------------------------------
  console.log('\n(2) set equality for the .md twins');
  const enMdDepthSlugs = slugsWithMarker(outDir, '.md', c => c.includes(MD_DEPTH_HEADING_EN));
  const koMdDepthSlugs = slugsWithMarker(koOutDir, '.md', c => c.includes(MD_DEPTH_HEADING_KO));
  test('EN: sitemap head-slug set == md depth-rendering slug set (both directions)', () => {
    assert.ok(setsEqual(enSitemapSlugs, enMdDepthSlugs),
      `sitemap-only: ${JSON.stringify(setDiff(enSitemapSlugs, enMdDepthSlugs))}; depth-only: ${JSON.stringify(setDiff(enMdDepthSlugs, enSitemapSlugs))}`);
  });
  test('KO: sitemap head-slug set == md depth-rendering slug set (both directions)', () => {
    assert.ok(setsEqual(koSitemapSlugs, koMdDepthSlugs),
      `sitemap-only: ${JSON.stringify(setDiff(koSitemapSlugs, koMdDepthSlugs))}; depth-only: ${JSON.stringify(setDiff(koMdDepthSlugs, koSitemapSlugs))}`);
  });

  // -------------------------------------------------------------------------
  // (3) Non-placeholder, non-identical content.
  // -------------------------------------------------------------------------
  console.log('\n(3) non-placeholder, non-identical depth-section content across head pages');
  const PLACEHOLDER_RE = /undefined|NaN|null|%s/;
  const EMPTY_NUM_CELL_RE = /<td class="num"><\/td>/;

  function checkNoPlaceholders(dir, ext, slugs, labelPrefix) {
    slugs.forEach(slug => {
      const content = fs.readFileSync(path.join(dir, slug + ext), 'utf8');
      const section = ext === '.html' ? extractSection(content, HTML_DEPTH_MARKER) : content;
      assert.ok(section, `${labelPrefix} ${slug}: sanity, depth section/content must exist`);
      assert.ok(!PLACEHOLDER_RE.test(section), `${labelPrefix} ${slug}: depth section contains a placeholder token (undefined/NaN/null/%s)`);
      if (ext === '.html') {
        assert.ok(!EMPTY_NUM_CELL_RE.test(section), `${labelPrefix} ${slug}: depth section has an empty numeric cell`);
      }
    });
  }
  test('EN html head pages: no placeholder tokens, no empty numeric cells', () => {
    checkNoPlaceholders(outDir, '.html', enHtmlDepthSlugs, 'en html');
  });
  test('KO html head pages: no placeholder tokens, no empty numeric cells', () => {
    checkNoPlaceholders(koOutDir, '.html', koHtmlDepthSlugs, 'ko html');
  });
  test('EN md head pages: no placeholder tokens', () => {
    checkNoPlaceholders(outDir, '.md', enMdDepthSlugs, 'en md');
  });
  test('KO md head pages: no placeholder tokens', () => {
    checkNoPlaceholders(koOutDir, '.md', koMdDepthSlugs, 'ko md');
  });

  test(`depth-section content is distinct across >=80% of the ${enHtmlDepthSlugs.size} EN head pages`, () => {
    const bodies = [...enHtmlDepthSlugs].map(slug => {
      const content = fs.readFileSync(path.join(outDir, slug + '.html'), 'utf8');
      return extractSection(content, HTML_DEPTH_MARKER);
    });
    const distinct = new Set(bodies).size;
    assert.ok(distinct / bodies.length >= 0.8,
      `only ${distinct}/${bodies.length} distinct depth sections (need >=80%)`);
  });

  // -------------------------------------------------------------------------
  // (5) Selection untouched.
  // -------------------------------------------------------------------------
  console.log('\n(5) selection untouched: sitemap <loc>s == selectHeadTokens(pools)');
  const fixturePools = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).data;
  const expectedHeadSymbols = gs.selectHeadTokens(fixturePools); // Set<UPPERCASE symbol>
  const allRanked = tp.rankTopTokens(fixturePools, 0);
  const slugToSymbol = new Map(allRanked.map(r => [r.slug, r.symbol.toUpperCase()]));
  const actualHeadSymbols = new Set([...enSitemapSlugs].map(slug => slugToSymbol.get(slug)));
  test('every sitemap head slug maps to a known ranked symbol (sanity)', () => {
    assert.ok(![...actualHeadSymbols].some(s => s === undefined), 'a sitemap slug did not map to any ranked token');
  });
  test('sitemap head-symbol set == selectHeadTokens(pools) (both directions)', () => {
    assert.ok(setsEqual(actualHeadSymbols, expectedHeadSymbols),
      `sitemap-only: ${JSON.stringify(setDiff(actualHeadSymbols, expectedHeadSymbols))}; selectHeadTokens-only: ${JSON.stringify(setDiff(expectedHeadSymbols, actualHeadSymbols))}`);
  });

  // -------------------------------------------------------------------------
  // (6) KO depth sections contain Hangul; EN contain none.
  // -------------------------------------------------------------------------
  console.log('\n(6) KO depth sections contain Hangul; EN depth sections contain none');
  test('every EN head html depth section has NO Hangul', () => {
    enHtmlDepthSlugs.forEach(slug => {
      const content = fs.readFileSync(path.join(outDir, slug + '.html'), 'utf8');
      const section = extractSection(content, HTML_DEPTH_MARKER);
      assert.ok(!HANGUL_RE.test(section), `${slug}: EN depth section contains Hangul`);
    });
  });
  test('every KO head html depth section CONTAINS Hangul', () => {
    koHtmlDepthSlugs.forEach(slug => {
      const content = fs.readFileSync(path.join(koOutDir, slug + '.html'), 'utf8');
      const section = extractSection(content, HTML_DEPTH_MARKER);
      assert.ok(HANGUL_RE.test(section), `${slug}: KO depth section has no Hangul`);
    });
  });

  // -------------------------------------------------------------------------
  // (7) Defect 1 (coordinator review): verb agreement keys on the NUMERATOR
  // (rewardCount/meanCount/ilCount), never the denominator poolCount.
  // "1 of 8 pools blends", "2 of 8 pools blend" — population-derived over
  // every EN head page, with both numerator==1 and numerator>1 required to
  // actually occur (non-vacuity of the fixture itself, not just the check).
  // -------------------------------------------------------------------------
  console.log('\n(7) defect 1: verb agreement keys on the numerator, not poolCount');
  const AGREEMENT_PATTERNS = [
    { name: 'incentives', re: /(\d+) of (\d+) pools? (blends|blend) in incentive/, singularVerb: 'blends' },
    { name: 'mean', re: /(\d+) of these (\d+) pools? (has|have) a trustworthy 30-day average/, singularVerb: 'has' },
    { name: 'il', re: /(\d+) of (\d+) pools? (carries|carry) impermanent-loss risk/, singularVerb: 'carries' },
  ];
  function checkVerbAgreement(text, label, counts) {
    AGREEMENT_PATTERNS.forEach(({ name, re, singularVerb }) => {
      const m = re.exec(text);
      if (!m) return; // this sentence is conditionally absent on this page — fine
      const numerator = parseInt(m[1], 10);
      const verb = m[3];
      const expectSingular = numerator === 1;
      assert.strictEqual(verb === singularVerb, expectSingular,
        `${label} [${name}]: numerator=${numerator} but verb="${verb}" (expected ${expectSingular ? 'singular' : 'plural'})`);
      if (counts) counts[name][expectSingular ? 'one' : 'many']++;
    });
  }
  test('EN html: every head page\'s verb agrees with its numerator, both singular AND plural cases occur', () => {
    const counts = { incentives: { one: 0, many: 0 }, mean: { one: 0, many: 0 }, il: { one: 0, many: 0 } };
    enHtmlDepthSlugs.forEach(slug => {
      const content = fs.readFileSync(path.join(outDir, slug + '.html'), 'utf8');
      const section = extractSection(content, HTML_DEPTH_MARKER);
      checkVerbAgreement(section, `en html ${slug}`, counts);
    });
    Object.entries(counts).forEach(([name, c]) => {
      assert.ok(c.one > 0, `sanity: fixture must produce a numerator===1 case for "${name}" (got 0)`);
      assert.ok(c.many > 0, `sanity: fixture must produce a numerator>1 case for "${name}" (got 0)`);
    });
  });
  test('EN md: every head page\'s verb agrees with its numerator (same sentences as the html twin)', () => {
    enMdDepthSlugs.forEach(slug => {
      const content = fs.readFileSync(path.join(outDir, slug + '.md'), 'utf8');
      checkVerbAgreement(content, `en md ${slug}`, null);
    });
  });

  // -------------------------------------------------------------------------
  // (8) Defect 2 (coordinator review): the .tp-depth CSS rules are gated on
  // isHead exactly like the section itself — a tail page's <style> block
  // must carry NONE of them; a head page's must carry all of them.
  // -------------------------------------------------------------------------
  console.log('\n(8) defect 2: .tp-depth CSS rules are gated on isHead, not emitted unconditionally');
  test('every tail (non-head) page has NO .tp-depth CSS rule, en + ko', () => {
    const enTailSlugs = [...new Set(fs.readdirSync(outDir)
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .map(f => f.replace(/\.html$/, '')))].filter(s => !enHtmlDepthSlugs.has(s));
    assert.ok(enTailSlugs.length > 0, 'sanity: need at least one tail page to check');
    enTailSlugs.forEach(slug => {
      const enHtml = fs.readFileSync(path.join(outDir, slug + '.html'), 'utf8');
      const koHtml = fs.readFileSync(path.join(koOutDir, slug + '.html'), 'utf8');
      assert.ok(!enHtml.includes('.tp-depth {'), `${slug}: tail EN page must not emit the .tp-depth CSS rule`);
      assert.ok(!koHtml.includes('.tp-depth {'), `${slug}: tail KO page must not emit the .tp-depth CSS rule`);
    });
  });
  test('every head page HAS the .tp-depth CSS rule, en + ko', () => {
    assert.ok(enHtmlDepthSlugs.size > 0, 'sanity: need at least one head page to check');
    enHtmlDepthSlugs.forEach(slug => {
      const enHtml = fs.readFileSync(path.join(outDir, slug + '.html'), 'utf8');
      assert.ok(enHtml.includes('.tp-depth {'), `${slug}: head EN page must emit the .tp-depth CSS rule`);
    });
    koHtmlDepthSlugs.forEach(slug => {
      const koHtml = fs.readFileSync(path.join(koOutDir, slug + '.html'), 'utf8');
      assert.ok(koHtml.includes('.tp-depth {'), `${slug}: head KO page must emit the .tp-depth CSS rule`);
    });
  });

  // -------------------------------------------------------------------------
  // (9) Defect 3 (coordinator review): no rendered KO depth section may
  // contain an ambiguous slashed-particle pair — population-derived over
  // every generated KO head page, never a fixture-string check.
  // -------------------------------------------------------------------------
  console.log('\n(9) defect 3: no KO depth section contains an ambiguous slashed particle pair');
  const AMBIGUOUS_PARTICLE_RE = /은\(는\)|을\(를\)|이\(가\)/;
  test('no KO head page\'s depth section contains an ambiguous 은(는)/을(를)/이(가) particle pair', () => {
    assert.ok(koHtmlDepthSlugs.size > 0, 'sanity: need at least one KO head page to check');
    koHtmlDepthSlugs.forEach(slug => {
      const content = fs.readFileSync(path.join(koOutDir, slug + '.html'), 'utf8');
      const section = extractSection(content, HTML_DEPTH_MARKER);
      assert.ok(!AMBIGUOUS_PARTICLE_RE.test(section), `${slug}: KO depth section contains an ambiguous particle pair`);
    });
  });

  // -------------------------------------------------------------------------
  // (tail sanity) a sampled tail page must NOT render the section.
  // -------------------------------------------------------------------------
  console.log('\n(tail sanity) a sampled non-head page renders no depth section, in either language');
  test('tail token TL0 (below the $10M head rail) has a page but NO depth section, en + ko, html + md', () => {
    const enHtml = fs.readFileSync(path.join(outDir, 'tl0.html'), 'utf8');
    const koHtml = fs.readFileSync(path.join(koOutDir, 'tl0.html'), 'utf8');
    const enMd = fs.readFileSync(path.join(outDir, 'tl0.md'), 'utf8');
    const koMd = fs.readFileSync(path.join(koOutDir, 'tl0.md'), 'utf8');
    assert.ok(!enHtml.includes(HTML_DEPTH_MARKER), 'tail EN html must not render the depth section');
    assert.ok(!koHtml.includes(HTML_DEPTH_MARKER), 'tail KO html must not render the depth section');
    assert.ok(!enMd.includes(MD_DEPTH_HEADING_EN), 'tail EN md must not render the depth section');
    assert.ok(!koMd.includes(MD_DEPTH_HEADING_KO), 'tail KO md must not render the depth section');
  });

  console.log(`\n  (measured this run) EN head slugs=${enSitemapSlugs.size} of ${HEAD_COUNT + TAIL_COUNT} generated`);
});

// ===========================================================================
// (4) Rail behavior — a SEPARATE crafted fixture.
// ===========================================================================
console.log('\n(4) rail behavior on a separate crafted fixture');
withTmpDir('dg-232-rail-', (scratch) => {
  const fixturePath = path.join(scratch, 'rail-fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify({ data: buildRailFixturePools() }));
  const outDir = path.join(scratch, 'tokens');
  const sitemapPath = path.join(scratch, 'sitemap-token-pages.xml');
  runGen(scratch, outDir, sitemapPath, fixturePath);

  const sitemapSlugs = sitemapTokenSlugs(sitemapPath);
  test('both MEANX and ANOMHEAD are head tokens in this rail fixture (sanity)', () => {
    assert.ok(sitemapSlugs.has('meanx'), 'MEANX must be head-worthy (2 railed pools >= $10M)');
    assert.ok(sitemapSlugs.has('anomhead'), 'ANOMHEAD must be head-worthy (2 railed pools >= $10M, the anomalous 3rd pool excluded)');
  });

  test('MEANX: the insane 36452.38798 apyMean30d renders an em dash and appears NOWHERE in the section', () => {
    const html = fs.readFileSync(path.join(outDir, 'meanx.html'), 'utf8');
    const section = extractSection(html, HTML_DEPTH_MARKER);
    assert.ok(section, 'sanity: MEANX must render a depth section');
    assert.ok(!section.includes('36452'), 'the insane apyMean30d value must never appear in the section');
    // The 'badmean' row must show an em dash in its mean cell, not a formatted number.
    const rowMatch = section.match(/<td>badmean<\/td>\s*<td class="num">[^<]*<\/td>\s*<td class="num">([^<]*)<\/td>/);
    assert.ok(rowMatch, 'sanity: could not locate the badmean table row');
    assert.strictEqual(rowMatch[1], '—', `badmean's mean cell must be an em dash, got "${rowMatch[1]}"`);

    const md = fs.readFileSync(path.join(outDir, 'meanx.md'), 'utf8');
    assert.ok(!md.includes('36452'), 'the insane apyMean30d value must never appear in the md twin either');
  });

  test('ANOMHEAD: the anomalous pool ("anombad", 1500% APY) never appears in the section', () => {
    const html = fs.readFileSync(path.join(outDir, 'anomhead.html'), 'utf8');
    const section = extractSection(html, HTML_DEPTH_MARKER);
    assert.ok(section, 'sanity: ANOMHEAD must render a depth section');
    assert.ok(!section.includes('anombad'), 'the anomalous pool must never appear in the section');
    assert.ok(section.includes('anomgood1') && section.includes('anomgood2'), 'sanity: the two clean pools must appear');

    const md = fs.readFileSync(path.join(outDir, 'anomhead.md'), 'utf8');
    assert.ok(!md.includes('anombad'), 'the anomalous pool must never appear in the md twin either');
  });

  test('ANOMHEAD depth section poolCount reads 2, not 3 (the anomalous pool never counted)', () => {
    const html = fs.readFileSync(path.join(outDir, 'anomhead.html'), 'utf8');
    const section = extractSection(html, HTML_DEPTH_MARKER);
    assert.ok(section.includes('2 pools') || section.includes('shows up in 2'), `expected a "2 pools" spread sentence, section: ${section.slice(0, 300)}`);
  });
});

console.log(`\n${passed} assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));
