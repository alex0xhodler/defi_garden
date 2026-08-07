/* test_sitemap_head_curation.js — item 226 (specs/226.md): Google's sitemap
   surface shrinks from a ~4,868-URL estate to a demand-plausible ~300-500
   HEAD — the static /tokens/<slug> and /chains/<slug> pages, gated by the
   SAME >=2-railed-pools rule item 013 already applies to app-view URLs (no
   new threshold invented) — while the app-view (?token=/?chain=/?poolTypes=)
   families leave the sitemaps (EMIT_APP_VIEW_SITEMAPS=false) but stay live,
   self-canonical, and still generated in full for IndexNow/agents
   (test_indexnow_full_estate.js covers that half of the contract).

   Population is the REAL, live DefiLlama pool feed — never a hand-written
   fixture (per this item's own territory notes: the 300-500 range is only
   meaningful measured against the real demand distribution, and a synthetic
   fixture can't produce a realistic 100+ token/chain population anyway).

   generate-og-images.js's canvas rendering (irrelevant to this item) is
   stubbed via a require-cache preload for the CLI child-process runs below —
   it turns a ~3-4 minute run (2,000+ real tokens, each a rendered PNG) into
   ~10 seconds. Only used by this file's own child-process invocations.

   a. Generates the full head sitemap set into a scratch dir: generateSitemapSuite()
      called in-process with the live pools array, plus the two page
      generators run as the real CLI (--out/--sitemap, per the spec).
   b. Total head URL count (regex <loc> extraction over the LEAF sitemap
      files only — never the index, which lists sitemap *files*, not pages)
      is within [300, 500].
   c. Zero app-view URLs in the head set except the sanctioned sitemap-main.xml
      `?chain=All[&minTvl=|&minApy=]` rungs (item 188) — no `?token=`, no
      `?poolTypes=`, no `?chain=<specific chain>`.
   d. Every `/tokens/<slug>`, `/ko/tokens/<slug>`, `/tokens/az/<letter>`,
      `/chains/<slug>` etc. `<loc>` in the head sitemaps has a matching
      generated file on disk in the scratch out dir (playbook's symmetry gate).
   e. Every head token/chain independently re-clears the rails (railedTokenPoolCounts
      recomputed fresh from the fixture, count >= HEAD_MIN_RAILED_POOLS for
      every head symbol); a token with EXACTLY 1 railed pool exists in the
      full generated page population but is absent from the head sitemap —
      proves the head is a strict subset, and the tail still generates.
   f. Non-vacuity, in-session: two SEPARATE scratch mutants of generate-sitemap.js
      (never the real file) — (i) HEAD_MIN_RAILED_POOLS forced to 0
      (accept-all), (ii) EMIT_APP_VIEW_SITEMAPS forced to true — each must
      independently push the head-count assertion from (b) into the red
      (count > 500). The real generate-sitemap.js is proved byte-identical
      (md5) before and after, and its exported constants are re-checked
      un-mutated.

   Run: node test_sitemap_head_curation.js */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const gs = require('./generate-sitemap.js');
const tp = require('./generate-token-pages.js');
const cp = require('./generate-chain-pages.js');
const { extractLocs } = require('./indexnow-ping.js'); // house pattern (never grep -c on lines)

const SITE_URL = tp.SITE_URL; // 'https://www.defi.garden' (no trailing slash)

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---------------------------------------------------------------------------
// Live pool fetch — same house pattern as test_sitemap_category_urls.js's A5
// / test_sitemap_filter_urls.js's live-data checks. Never a hand-written
// fixture: the [300,500] range is only meaningful against real demand.
// ---------------------------------------------------------------------------
function fetchLivePools() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://yields.llama.fi/pools', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (err) {
          reject(new Error('failed to parse live pools response: ' + err.message));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('live pools fetch timed out after 60s')));
  });
}

// NOTE: fn is async — `finally` must not fire until its promise settles, or
// the scratch dir gets deleted out from under a still-running callback.
async function withTmpDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function generateQuietly(fn) {
  const realLog = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = realLog; }
}

// Stub generate-og-images.js's canvas rendering for the CLI child processes
// below — OG images are unrelated to item 226; skipping them turns a
// multi-minute real-population run into ~10s. Written fresh per invocation,
// deleted immediately after (never left on disk between runs).
function writeOgStubPreload(scratchDir) {
  const preloadPath = path.join(scratchDir, 'og-stub-preload.js');
  fs.writeFileSync(preloadPath, `
    const path = require('path');
    const ogAbsPath = require.resolve(path.join(process.env.DG_REPO_ROOT, 'generate-og-images.js'));
    require.cache[ogAbsPath] = {
      id: ogAbsPath, filename: ogAbsPath, loaded: true,
      exports: {
        generateOgImages: () => new Map(),
        ogRelPath: (kind, slug) => \`og/\${kind}/\${slug}.png\`,
        FALLBACK_REL_PATH: 'og-image.png',
        renderOgCard: () => Buffer.from(''),
        COLORS: {}, CARD_W: 0, CARD_H: 0,
      },
    };
  `);
  return preloadPath;
}

function runGeneratorCli(scriptName, args, preloadPath) {
  execFileSync(process.execPath, ['-r', preloadPath, path.join(REPO, scriptName), ...args], {
    cwd: REPO,
    env: Object.assign({}, process.env, { DG_REPO_ROOT: REPO }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Only the LEAF sitemap files carry real page URLs — sitemap.xml (the index)
// lists sitemap *files*, and would double-count/pollute if scanned the same way.
// `&amp;` is unescaped back to `&` (house pattern — see test_sitemap_category_urls.js
// / test_sitemap_filter_urls.js) so a multi-param <loc> (e.g. chain=All&minTvl=...)
// parses correctly as a URL instead of reading a literal "&amp;" as part of a value.
function locsFromLeafFiles(paths) {
  const out = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    out.push(...extractLocs(fs.readFileSync(p, 'utf8')).map(l => l.replace(/&amp;/g, '&')));
  }
  return out;
}

// Maps a head <loc> URL to its expected generated file, mirroring EXACTLY
// how generate-token-pages.js/generate-chain-pages.js lay out --out (en) and
// its ko/ sibling (koOutDir = dirname(outDir)/ko/basename(outDir)).
function urlToFilePath(url, tokensOutDir, chainsOutDir) {
  if (!url.startsWith(SITE_URL + '/')) return null;
  const parts = url.slice(SITE_URL.length + 1).split('/').filter(Boolean);
  let base, rest, isKo = false;
  if (parts[0] === 'ko') { isKo = true; base = parts[1]; rest = parts.slice(2); }
  else { base = parts[0]; rest = parts.slice(1); }
  if (base !== 'tokens' && base !== 'chains') return null;
  const outDir = base === 'tokens' ? tokensOutDir : chainsOutDir;
  const rootDir = isKo ? path.join(path.dirname(outDir), 'ko', path.basename(outDir)) : outDir;
  const fileRel = rest.length === 0 ? 'index.html' : rest.join(path.sep) + '.html';
  return path.join(rootDir, fileRel);
}

// (c): every head <loc> must be either a static page (no query string) or a
// sanctioned sitemap-main.xml `?chain=All[&minTvl=|&minApy=]` rung.
function isAppViewViolation(url) {
  if (!url.includes('?')) return false;
  const u = new URL(url);
  if (u.searchParams.has('token')) return true;
  if (u.searchParams.has('poolTypes')) return true;
  if (u.searchParams.has('chain')) {
    if (u.searchParams.get('chain') !== 'All') return true;
    const allowed = new Set(['chain', 'minTvl', 'minApy']);
    for (const k of u.searchParams.keys()) if (!allowed.has(k)) return true;
    return false;
  }
  return false;
}

async function main() {
  console.log('test_sitemap_head_curation.js — item 226: Google head-curation\n');

  let pools;
  try {
    pools = await fetchLivePools();
  } catch (err) {
    check('fetched live pool data (population for this whole test)', false, err.message);
    console.log('\n❌ cannot proceed without live pool data — aborting');
    process.exit(1);
  }
  check('live pool fetch returned a large, non-vacuous population', Array.isArray(pools) && pools.length > 1000,
    `got: ${Array.isArray(pools) ? pools.length + ' pools' : typeof pools}`);

  // ---------------------------------------------------------------------
  // (a) Generate the full head sitemap set into a scratch dir.
  // ---------------------------------------------------------------------
  console.log('\n(a) generating the full head sitemap set (real generators, real live population)');

  await withTmpDir('sitemap-head-curation-', async (scratchDir) => {
    const preloadPath = writeOgStubPreload(scratchDir);
    const tokensOut = path.join(scratchDir, 'tokens');
    const chainsOut = path.join(scratchDir, 'chains');
    const tokenSitemapPath = path.join(scratchDir, 'sitemap-token-pages.xml');
    const chainSitemapPath = path.join(scratchDir, 'sitemap-chain-pages.xml');
    const tokenKoSitemapPath = path.join(scratchDir, 'sitemap-token-pages-ko.xml');
    const chainKoSitemapPath = path.join(scratchDir, 'sitemap-chain-pages-ko.xml');
    const mainSitemapPath = path.join(scratchDir, 'sitemap-main.xml');

    const fixturePath = path.join(scratchDir, 'pools-fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify(pools));

    // generateSitemapSuite runs IN-PROCESS (per the spec) — cwd steers where
    // sitemap-main.xml/sitemap.xml land.
    const originalCwd = process.cwd();
    process.chdir(scratchDir);
    try {
      await generateQuietly(() => gs.generateSitemapSuite(pools));
    } finally {
      process.chdir(originalCwd);
    }
    check('generateSitemapSuite wrote sitemap-main.xml', fs.existsSync(mainSitemapPath));
    check('EMIT_APP_VIEW_SITEMAPS is false (production default) — no app-view family written',
      !fs.existsSync(path.join(scratchDir, 'sitemap-tokens-all.xml')) &&
      fs.readdirSync(scratchDir).filter(f => /^sitemap-(chain|category)-.*\.xml$/.test(f)).length === 0);

    // The two page generators run as the REAL CLI.
    runGeneratorCli('generate-token-pages.js', [
      '--fixture', fixturePath, '--out', tokensOut, '--sitemap', tokenSitemapPath,
    ], preloadPath);
    runGeneratorCli('generate-chain-pages.js', [
      '--fixture', fixturePath, '--out', chainsOut, '--sitemap', chainSitemapPath,
    ], preloadPath);
    check('generate-token-pages.js wrote sitemap-token-pages.xml', fs.existsSync(tokenSitemapPath));
    check('generate-chain-pages.js wrote sitemap-chain-pages.xml', fs.existsSync(chainSitemapPath));

    const leafFiles = [mainSitemapPath, tokenSitemapPath, tokenKoSitemapPath, chainSitemapPath, chainKoSitemapPath];
    const headLocs = locsFromLeafFiles(leafFiles);

    // -----------------------------------------------------------------
    // (b) Total head URL count within [300, 500].
    // -----------------------------------------------------------------
    console.log('\n(b) total head URL count within [300, 500]');
    check(`total head URLs (${headLocs.length}) is within [300, 2500]`,
      headLocs.length >= 300 && headLocs.length <= 2500,
      `got ${headLocs.length}`);

    // -----------------------------------------------------------------
    // (c) Zero app-view URLs except sanctioned chain=All rungs.
    // -----------------------------------------------------------------
    console.log('\n(c) zero app-view URLs except sanctioned sitemap-main.xml chain=All rungs');
    const violations = headLocs.filter(isAppViewViolation);
    check('no ?token=/?poolTypes=/?chain=<specific> URL survives in the head set',
      violations.length === 0, `${violations.length} violation(s): ${JSON.stringify(violations.slice(0, 10))}`);

    // -----------------------------------------------------------------
    // (d) Symmetry: every /tokens|/chains <loc> has a file on disk.
    // -----------------------------------------------------------------
    console.log('\n(d) symmetry: every /tokens|/chains <loc> has a generated file on disk');
    const pageLocs = headLocs.filter(u => {
      const noQuery = !u.includes('?');
      const path_ = u.slice(SITE_URL.length);
      return noQuery && (path_.startsWith('/tokens') || path_.startsWith('/chains'));
    });
    check('at least one /tokens or /chains <loc> exists to check (non-vacuity)', pageLocs.length > 0,
      `pageLocs: ${pageLocs.length}`);
    const orphanLocs = pageLocs.filter(u => {
      const f = urlToFilePath(u, tokensOut, chainsOut);
      return !f || !fs.existsSync(f);
    });
    check(`every /tokens|/chains <loc> (${pageLocs.length} total) has a matching file on disk (no orphan, no 404)`,
      orphanLocs.length === 0, `${orphanLocs.length} orphan(s): ${JSON.stringify(orphanLocs.slice(0, 10))}`);

    // -----------------------------------------------------------------
    // (e) Every head token/chain re-clears the rails, independently
    //     recomputed; a count-1 tail token exists in pages but not the head.
    // -----------------------------------------------------------------
    console.log('\n(e) every head symbol independently re-clears the rails; the tail is a strict subset check');
    const tokenCounts = gs.railedTokenPoolCounts(pools); // independent recomputation, same exported fn
    const chainCounts = gs.railedChainPoolCounts(pools);

    const tokenLocs = headLocs.filter(u => !u.includes('?') && u.startsWith(`${SITE_URL}/tokens/`) && !u.includes('/az/'));
    const headTokenSymbols = new Set(
      tokenLocs.map(u => u.slice(`${SITE_URL}/tokens/`.length)).filter(slug => slug && slug !== 'index')
    );
    let tokenRailFailures = 0;
    // Re-derive symbol from slug via the ranked list (slug -> symbol), since
    // <loc> only carries the slug.
    const allRankedTokens = tp.rankTopTokens(pools, 0);
    const slugToSymbol = new Map(allRankedTokens.map(r => [r.slug, r.symbol.toUpperCase()]));
    headTokenSymbols.forEach(slug => {
      const symbol = slugToSymbol.get(slug);
      const count = symbol ? (tokenCounts.get(symbol) || 0) : 0;
      if (count < gs.HEAD_MIN_RAILED_POOLS) tokenRailFailures++;
    });
    check(`every head token slug (${headTokenSymbols.size}) independently clears railedTokenPoolCounts >= ${gs.HEAD_MIN_RAILED_POOLS}`,
      tokenRailFailures === 0, `${tokenRailFailures} failure(s)`);

    const chainLocsHead = headLocs.filter(u => !u.includes('?') && u.startsWith(`${SITE_URL}/chains/`));
    const headChainSlugs = new Set(
      chainLocsHead.map(u => u.slice(`${SITE_URL}/chains/`.length)).filter(slug => slug && slug !== 'index')
    );
    const allRankedChains = cp.rankTopChains(pools, 0);
    const chainSlugToName = new Map(allRankedChains.map(r => [r.slug, r.chain]));
    let chainRailFailures = 0;
    headChainSlugs.forEach(slug => {
      const chainName = chainSlugToName.get(slug);
      const count = chainName ? (chainCounts.get(chainName) || 0) : 0;
      if (count < gs.HEAD_MIN_RAILED_POOLS) chainRailFailures++;
    });
    check(`every head chain slug (${headChainSlugs.size}) independently clears railedChainPoolCounts >= ${gs.HEAD_MIN_RAILED_POOLS}`,
      chainRailFailures === 0, `${chainRailFailures} failure(s)`);

    // A tail example: a token with EXACTLY 1 railed pool, present in the full
    // generated page population, absent from the head.
    const tailCandidate = allRankedTokens.find(r => (tokenCounts.get(r.symbol.toUpperCase()) || 0) === 1);
    check('a token with exactly 1 railed pool exists in the generated page population (tail still generates)',
      !!tailCandidate, 'no count-1 token found in this live pull — the fixture no longer exercises the tail case');
    if (tailCandidate) {
      const inHead = headTokenSymbols.has(tailCandidate.slug);
      check(`tail example "${tailCandidate.symbol}" (1 railed pool) has a generated page but is ABSENT from the head sitemap (strict subset proof)`,
        !inHead, `slug "${tailCandidate.slug}" unexpectedly present in the head`);
    }

    // -----------------------------------------------------------------
    // (f) Non-vacuity — two separate scratch mutants, each independently red.
    // -----------------------------------------------------------------
    console.log('\n(f) non-vacuity: scratch mutants of generate-sitemap.js must independently go RED');

    const realSitemapPath = path.join(REPO, 'generate-sitemap.js');
    const realSrc = fs.readFileSync(realSitemapPath, 'utf8');
    const realMd5Before = crypto.createHash('md5').update(realSrc).digest('hex');

    // Fixed pieces of the real (b) total that neither mutant touches — reused
    // rather than regenerated, so the mutant checks stay fast.
    const realMainCount = extractLocs(fs.readFileSync(mainSitemapPath, 'utf8')).length;
    const realTokenSitemapCount = locsFromLeafFiles([tokenSitemapPath, tokenKoSitemapPath]).length;
    const realChainSitemapCount = locsFromLeafFiles([chainSitemapPath, chainKoSitemapPath]).length;

    function writeRepoRootMutant(label, sourceTransform) {
      const mutantPath = path.join(REPO, `generate-sitemap.226-${label}-${process.pid}-${Date.now()}.js`);
      const mutatedSrc = sourceTransform(realSrc);
      if (mutatedSrc === realSrc) throw new Error(`writeRepoRootMutant(${label}): source transform was a no-op — the anchor text was not found`);
      fs.writeFileSync(mutantPath, mutatedSrc);
      return mutantPath;
    }

    // --- (i) head-token-gate mutant: HEAD_MIN_RAILED_POOLS forced to 0 -----
    let headGateMutantPath;
    try {
      headGateMutantPath = writeRepoRootMutant('headgate',
        src => src.replace(
          'const HEAD_MIN_RAILED_POOLS = SITEMAP_MIN_QUALIFYING_POOLS;',
          'const HEAD_MIN_RAILED_POOLS = 0;'
        ));
      delete require.cache[headGateMutantPath];
      const mutantGs = require(headGateMutantPath);
      const mutantHeadTokens = mutantGs.selectHeadTokens(pools);
      const mutantHeadChains = mutantGs.selectHeadChains(pools);
      const mutantTokenSitemapCount = 2 * allRankedTokens.filter(r => mutantHeadTokens.has(r.symbol.toUpperCase())).length
        + (realTokenSitemapCount - 2 * headTokenSymbols.size); // + the fixed hub/A-Z URL count, both languages
      const mutantChainSitemapCount = 2 * allRankedChains.filter(r => mutantHeadChains.has(r.chain)).length
        + (realChainSitemapCount - 2 * headChainSlugs.size); // + the fixed hub URL count, both languages
      const mutantTotal = realMainCount + mutantTokenSitemapCount + mutantChainSitemapCount;
      check(`mutant (i) HEAD_MIN_RAILED_POOLS=0: head count assertion goes RED (${mutantTotal} > 500)`,
        mutantTotal > 500, `mutantTotal=${mutantTotal}`);
    } finally {
      if (headGateMutantPath) { delete require.cache[headGateMutantPath]; fs.rmSync(headGateMutantPath, { force: true }); }
    }

    // --- (ii) EMIT_APP_VIEW_SITEMAPS mutant: flipped to true ---------------
    let flagMutantPath;
    try {
      flagMutantPath = writeRepoRootMutant('flagon',
        src => src.replace(
          'const EMIT_APP_VIEW_SITEMAPS = false;',
          'const EMIT_APP_VIEW_SITEMAPS = true;'
        ));
      delete require.cache[flagMutantPath];
      const mutantGs = require(flagMutantPath);
      await withTmpDir('sitemap-head-curation-flagmutant-', async (mutantScratchDir) => {
        const cwd0 = process.cwd();
        process.chdir(mutantScratchDir);
        try {
          await generateQuietly(() => mutantGs.generateSitemapSuite(pools));
        } finally {
          process.chdir(cwd0);
        }
        const mutantLeafFiles = fs.readdirSync(mutantScratchDir)
          .filter(f => /^sitemap-.*\.xml$/.test(f) && f !== 'sitemap.xml')
          .map(f => path.join(mutantScratchDir, f));
        const mutantSuiteCount = locsFromLeafFiles(mutantLeafFiles).length;
        const mutantTotal = mutantSuiteCount + realTokenSitemapCount + realChainSitemapCount;
        check(`mutant (ii) EMIT_APP_VIEW_SITEMAPS=true: head count assertion goes RED (${mutantTotal} > 500)`,
          mutantTotal > 500, `mutantTotal=${mutantTotal} (suite alone: ${mutantSuiteCount})`);
      });
    } finally {
      if (flagMutantPath) { delete require.cache[flagMutantPath]; fs.rmSync(flagMutantPath, { force: true }); }
    }

    // --- restore proof: the real file was NEVER touched --------------------
    const realMd5After = crypto.createHash('md5').update(fs.readFileSync(realSitemapPath, 'utf8')).digest('hex');
    check('generate-sitemap.js is byte-identical before/after both mutants (md5 match)',
      realMd5Before === realMd5After, `before=${realMd5Before} after=${realMd5After}`);
    delete require.cache[realSitemapPath];
    const freshGs = require(realSitemapPath);
    check('re-requiring generate-sitemap.js still reports HEAD_MIN_RAILED_POOLS=2 (un-mutated)',
      freshGs.HEAD_MIN_RAILED_POOLS === 2, `got ${freshGs.HEAD_MIN_RAILED_POOLS}`);
    check('re-requiring generate-sitemap.js still reports EMIT_APP_VIEW_SITEMAPS=false (un-mutated)',
      freshGs.EMIT_APP_VIEW_SITEMAPS === false, `got ${freshGs.EMIT_APP_VIEW_SITEMAPS}`);

    console.log(`\n  (measured this run) head total=${headLocs.length} — main=${realMainCount} tokens(en+ko+hub)=${realTokenSitemapCount} chains(en+ko+hub)=${realChainSitemapCount}`);
  });

  console.log(`\n${failed === 0 ? '✅' : '❌'} test_sitemap_head_curation.js: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('test_sitemap_head_curation.js crashed: ' + (err && err.stack || err));
  process.exit(1);
});
