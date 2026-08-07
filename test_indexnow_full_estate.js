/* test_indexnow_full_estate.js — item 226 (specs/226.md): IndexNow (Bing/
   Yandex) keeps the FULL served estate even though Google's sitemap now only
   carries the curated head. `collectEstateUrls()` (indexnow-ping.js) is the
   DEFAULT source for IndexNow's submission list precisely so that shrinking
   sitemap-token-pages.xml/sitemap-chain-pages.xml to the head (item 226)
   never silently shrinks Bing/Yandex submission too — the whole point of the
   Q3b decision was "one artifact set serving two consumers with opposite
   size preferences" (specs/226.md).

   Generates a real scratch estate from the LIVE DefiLlama pool feed (same
   population/OG-stub technique as test_sitemap_head_curation.js — see that
   file's header for why OG rendering is stubbed) and asserts:
     - collectEstateUrls(scratchDir) is a STRICT superset of the head sitemap
       URL set (every head URL is in the estate, AND the estate has more).
     - the estate contains at least one TAIL token page — a token with
       exactly 1 railed pool (below HEAD_MIN_RAILED_POOLS, so it left
       Google's sitemap) that IndexNow still submits to Bing/Yandex.

   Run: node test_indexnow_full_estate.js */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const gs = require('./generate-sitemap.js');
const tp = require('./generate-token-pages.js');
const indexnow = require('./indexnow-ping.js');

const SITE_URL = tp.SITE_URL;

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

function fetchLivePools() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://yields.llama.fi/pools', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (err) { reject(new Error('failed to parse live pools response: ' + err.message)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('live pools fetch timed out after 60s')));
  });
}

async function withTmpDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Same OG-rendering stub as test_sitemap_head_curation.js — irrelevant to
// this item, turns a multi-minute real-population CLI run into ~10s.
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

function locsFromFile(p) {
  if (!fs.existsSync(p)) return [];
  return indexnow.extractLocs(fs.readFileSync(p, 'utf8')).map(l => l.replace(/&amp;/g, '&'));
}

async function main() {
  console.log('test_indexnow_full_estate.js — item 226: IndexNow keeps the FULL estate\n');

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

  await withTmpDir('indexnow-full-estate-', async (scratchDir) => {
    const preloadPath = writeOgStubPreload(scratchDir);
    const tokensOut = path.join(scratchDir, 'tokens');
    const chainsOut = path.join(scratchDir, 'chains');
    const tokenSitemapPath = path.join(scratchDir, 'sitemap-token-pages.xml');
    const chainSitemapPath = path.join(scratchDir, 'sitemap-chain-pages.xml');
    const tokenKoSitemapPath = path.join(scratchDir, 'sitemap-token-pages-ko.xml');
    const chainKoSitemapPath = path.join(scratchDir, 'sitemap-chain-pages-ko.xml');

    const fixturePath = path.join(scratchDir, 'pools-fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify(pools));

    runGeneratorCli('generate-token-pages.js', [
      '--fixture', fixturePath, '--out', tokensOut, '--sitemap', tokenSitemapPath,
    ], preloadPath);
    runGeneratorCli('generate-chain-pages.js', [
      '--fixture', fixturePath, '--out', chainsOut, '--sitemap', chainSitemapPath,
    ], preloadPath);

    check('generate-token-pages.js wrote the estate (tokens/ dir non-empty)',
      fs.existsSync(tokensOut) && fs.readdirSync(tokensOut).length > 0);
    check('generate-chain-pages.js wrote the estate (chains/ dir non-empty)',
      fs.existsSync(chainsOut) && fs.readdirSync(chainsOut).length > 0);

    // --- the head sitemap URL set (Google) --------------------------------
    const headUrls = new Set([
      ...locsFromFile(tokenSitemapPath), ...locsFromFile(tokenKoSitemapPath),
      ...locsFromFile(chainSitemapPath), ...locsFromFile(chainKoSitemapPath),
    ]);
    check('head sitemap URL set is non-empty (precheck against a vacuous pass)', headUrls.size > 0,
      `headUrls.size=${headUrls.size}`);

    // --- the full estate scanned from disk (Bing/Yandex) -------------------
    const estateUrls = indexnow.collectEstateUrls(scratchDir);
    const estateSet = new Set(estateUrls);
    check('collectEstateUrls returns a non-empty list', estateUrls.length > 0, `got ${estateUrls.length}`);
    check('collectEstateUrls has no duplicates', estateUrls.length === estateSet.size,
      `${estateUrls.length} entries, ${estateSet.size} unique`);

    // --- strict superset: every head URL present, AND more besides --------
    const missingFromEstate = [...headUrls].filter(u => !estateSet.has(u));
    check('every head sitemap URL is present in the full estate (superset, half)',
      missingFromEstate.length === 0, `${missingFromEstate.length} missing: ${JSON.stringify(missingFromEstate.slice(0, 10))}`);
    check(`the estate (${estateSet.size}) is STRICTLY larger than the head (${headUrls.size}) — Bing keeps what Google no longer gets`,
      estateSet.size > headUrls.size);

    // --- at least one tail token page (1 railed pool) is in the estate -----
    const tokenCounts = gs.railedTokenPoolCounts(pools);
    const allRankedTokens = tp.rankTopTokens(pools, 0);
    const tailCandidate = allRankedTokens.find(r => (tokenCounts.get(r.symbol.toUpperCase()) || 0) === 1);
    check('a tail token (exactly 1 railed pool) exists in the generated page population', !!tailCandidate,
      'no count-1 token found in this live pull');
    if (tailCandidate) {
      const tailUrl = `${SITE_URL}/tokens/${tailCandidate.slug}`;
      check(`tail example "${tailCandidate.symbol}" IS in the full estate (Bing keeps it)`, estateSet.has(tailUrl));
      check(`tail example "${tailCandidate.symbol}" is NOT in the head sitemap (Google no longer gets it)`, !headUrls.has(tailUrl));
    }

    console.log(`\n  (measured this run) head=${headUrls.size} estate=${estateSet.size}`);
  });

  console.log(`\n${failed === 0 ? '✅' : '❌'} test_indexnow_full_estate.js: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('test_indexnow_full_estate.js crashed: ' + (err && err.stack || err));
  process.exit(1);
});
