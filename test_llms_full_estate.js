/* test_llms_full_estate.js — item 226 post-verifier fix: generate-llms.js
   used to derive its ENTIRE URL population by parsing sitemap.xml, which is
   now HEAD-only for the static /tokens|/chains page families (Google
   head-curation). CI runs generate-sitemap.js then generate-llms.js off the
   SAME repo-root sitemap.xml on the daily cron, so the unfixed generator
   would collapse llms.txt/llms-full.txt to the head too — an unauthorized
   de-indexing of the AGENT surface (Q3b's authorization is scoped to
   Google's sitemap view; agents keep everything).

   Fix: generate-llms.js's full URL population is now sitemap-main.xml's
   small, stable, NEVER-shrunk set (home, /plan.html, /stories/*, the
   item-188 `?chain=All...` browse rungs) UNION collectEstateUrls()
   (indexnow-ping.js) — the SAME single source of truth IndexNow's own
   full-estate submission uses (mirror rule, never a second "what is the
   full estate" scanner). See generate-llms.js's buildFullUrlPopulation().

   Modelled directly on test_indexnow_full_estate.js. Population is the
   LIVE DefiLlama pool feed (never a hand-written fixture — same reasoning
   as the sibling item-226 tests). generate-og-images.js's canvas rendering
   is stubbed for the CLI child-process runs (irrelevant to this fix, turns
   a multi-minute run into seconds — see test_sitemap_head_curation.js's
   header for the full rationale).

   Asserts:
     - the llms URL population (scanned from the REAL generated llms.txt/
       llms-full.txt, via the same bare `- https://...` line shape
       categorizeUrls()'s callers emit) is a STRICT superset of the head
       sitemap URL set;
     - it contains a count-1 railed TAIL token (SKY, the same tail example
       test_sitemap_head_curation.js already establishes) that the head
       sitemap does NOT carry;
     - total population clears a floor (>=1000) the head alone (bounded at
       500 by spec) could never satisfy on its own;
     - non-vacuity: a scratch mutant of generate-llms.js reverted to the
       pre-fix "urls = sitemapUrls" (head-only) population makes the
       floor assertion AND the tail-token assertion go RED (the superset-
       of-headUrls relation alone can't discriminate here — see the
       non-vacuity section's own comment for why); the real file is proved
       byte-identical (md5) before/after, never touched.

   Run: node test_llms_full_estate.js */
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

async function generateQuietly(fn) {
  const realLog = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = realLog; }
}

// Same OG-rendering stub as the sibling item-226 tests — irrelevant to this
// fix, turns a multi-minute real-population CLI run into seconds.
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

// llms.txt/llms-full.txt emit every URL as a bare `- <url>` line
// (categorizeUrls()'s callers in buildConcise/buildFull) — the same
// extraction shape test_llms_link_integrity.js's own scans use.
function extractLlmsUrls(content) {
  const out = new Set();
  const re = /^- (https:\/\/\S+)$/gm;
  let m;
  while ((m = re.exec(content))) out.add(m[1]);
  // Also catches "- label — https://..." trailer-link lines (Top Chains,
  // Popular Token-Chain Combinations, etc.) so the population reflects
  // every URL genuinely present in the file, not just bare-link sections.
  const trailerRe = /(https:\/\/\S+)/g;
  let t;
  while ((t = trailerRe.exec(content))) out.add(t[1].replace(/[)\].,]+$/, ''));
  return out;
}

function runLlmsCli(env, extraArgs) {
  execFileSync(process.execPath, [path.join(REPO, 'generate-llms.js'), ...(extraArgs || [])], {
    cwd: REPO,
    env: Object.assign({}, process.env, env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  console.log('test_llms_full_estate.js — item 226 fix: llms.txt/llms-full.txt keep the FULL estate\n');

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

  await withTmpDir('llms-full-estate-', async (scratchDir) => {
    const preloadPath = writeOgStubPreload(scratchDir);
    const tokensOut = path.join(scratchDir, 'tokens');
    const chainsOut = path.join(scratchDir, 'chains');
    const tokenSitemapPath = path.join(scratchDir, 'sitemap-token-pages.xml');
    const chainSitemapPath = path.join(scratchDir, 'sitemap-chain-pages.xml');
    const tokenKoSitemapPath = path.join(scratchDir, 'sitemap-token-pages-ko.xml');
    const chainKoSitemapPath = path.join(scratchDir, 'sitemap-chain-pages-ko.xml');
    const mainSitemapPath = path.join(scratchDir, 'sitemap-main.xml');
    const sitemapIndexPath = path.join(scratchDir, 'sitemap.xml');

    const fixturePath = path.join(scratchDir, 'pools-fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify(pools));

    // Build the estate FIRST (token/chain pages + their sitemaps), THEN the
    // suite — matches the real CI step order (sitemap-update.yml: token
    // pages, chain pages, ... sitemap LAST) so sitemap.xml's index correctly
    // discovers the already-written child sitemaps via its existsSync guards.
    runGeneratorCli('generate-token-pages.js', [
      '--fixture', fixturePath, '--out', tokensOut, '--sitemap', tokenSitemapPath,
    ], preloadPath);
    runGeneratorCli('generate-chain-pages.js', [
      '--fixture', fixturePath, '--out', chainsOut, '--sitemap', chainSitemapPath,
    ], preloadPath);

    const originalCwd = process.cwd();
    process.chdir(scratchDir);
    try {
      await generateQuietly(() => gs.generateSitemapSuite(pools));
    } finally {
      process.chdir(originalCwd);
    }
    check('sitemap.xml + sitemap-main.xml + token/chain sitemaps all exist',
      fs.existsSync(sitemapIndexPath) && fs.existsSync(mainSitemapPath) &&
      fs.existsSync(tokenSitemapPath) && fs.existsSync(chainSitemapPath));

    const headUrls = new Set([
      ...locsFromFile(tokenSitemapPath), ...locsFromFile(tokenKoSitemapPath),
      ...locsFromFile(chainSitemapPath), ...locsFromFile(chainKoSitemapPath),
    ]);
    check('head sitemap URL set is non-empty (precheck against a vacuous pass)', headUrls.size > 0,
      `headUrls.size=${headUrls.size}`);

    // --- run the REAL (fixed) generate-llms.js against this scratch estate -
    const llmsEnv = {
      SITEMAP_PATH: sitemapIndexPath,
      LLMS_OUTPUT_DIR: scratchDir,
      LLMS_ESTATE_ROOT: scratchDir,
      POOLS_FIXTURE: fixturePath,
    };
    runLlmsCli(llmsEnv);
    const llmsTxtPath = path.join(scratchDir, 'llms.txt');
    const llmsFullPath = path.join(scratchDir, 'llms-full.txt');
    check('generate-llms.js wrote llms.txt and llms-full.txt', fs.existsSync(llmsTxtPath) && fs.existsSync(llmsFullPath));

    const llmsFullContent = fs.readFileSync(llmsFullPath, 'utf8');
    const llmsUrls = extractLlmsUrls(llmsFullContent);
    check('llms-full.txt URL population is non-empty (precheck)', llmsUrls.size > 0, `got ${llmsUrls.size}`);

    // --- strict superset: every head URL present, AND more besides --------
    const missingFromLlms = [...headUrls].filter(u => !llmsUrls.has(u));
    check('every head sitemap URL is present in llms-full.txt (superset, half)',
      missingFromLlms.length === 0, `${missingFromLlms.length} missing: ${JSON.stringify(missingFromLlms.slice(0, 10))}`);
    check(`llms-full.txt's population (${llmsUrls.size}) is STRICTLY larger than the head (${headUrls.size}) — agents keep what Google no longer gets`,
      llmsUrls.size > headUrls.size);

    // --- floor the head alone could never satisfy (spec caps head at 500) -
    check(`llms-full.txt population (${llmsUrls.size}) clears a floor (>=1000) the head alone could never satisfy (spec bounds the head at 500)`,
      llmsUrls.size >= 1000);

    // --- a tail token (exactly 1 railed pool) is present, absent from head -
    const tokenCounts = gs.railedTokenPoolCounts(pools);
    const allRankedTokens = tp.rankTopTokens(pools, 0);
    const tailCandidate = allRankedTokens.find(r => (tokenCounts.get(r.symbol.toUpperCase()) || 0) === 1);
    check('a tail token (exactly 1 railed pool) exists in the generated page population', !!tailCandidate,
      'no count-1 token found in this live pull');
    if (tailCandidate) {
      const tailUrl = `${SITE_URL}/tokens/${tailCandidate.slug}`;
      check(`tail example "${tailCandidate.symbol}" IS in llms-full.txt (agents keep it)`, llmsUrls.has(tailUrl));
      check(`tail example "${tailCandidate.symbol}" is NOT in the head sitemap (Google no longer gets it)`, !headUrls.has(tailUrl));
    }

    console.log(`\n  (measured this run) head=${headUrls.size} llms-full.txt population=${llmsUrls.size}`);

    // -----------------------------------------------------------------
    // Non-vacuity: scratch mutant reverted to the pre-fix "urls = sitemapUrls"
    // (head-only) population — the superset/floor assertions must go RED.
    // -----------------------------------------------------------------
    console.log('\nnon-vacuity: a scratch mutant of generate-llms.js reverted to head-only population must go RED');

    const realLlmsPath = path.join(REPO, 'generate-llms.js');
    const realSrc = fs.readFileSync(realLlmsPath, 'utf8');
    const realMd5Before = crypto.createHash('md5').update(realSrc).digest('hex');

    const mutatedSrc = realSrc.replace(
      'const urls = buildFullUrlPopulation(sitemapUrls, ESTATE_ROOT);',
      'const urls = sitemapUrls; // MUTANT (item 226 non-vacuity): reverted to pre-fix head-only population'
    );
    if (mutatedSrc === realSrc) {
      check('non-vacuity mutant anchor found in generate-llms.js (source transform was not a no-op)', false);
    } else {
      const mutantPath = path.join(REPO, `generate-llms.226-mutant-${process.pid}-${Date.now()}.js`);
      fs.writeFileSync(mutantPath, mutatedSrc);
      try {
        await withTmpDir('llms-full-estate-mutant-', async (mutantOutDir) => {
          execFileSync(process.execPath, [mutantPath], {
            cwd: REPO,
            env: Object.assign({}, process.env, {
              SITEMAP_PATH: sitemapIndexPath,
              LLMS_OUTPUT_DIR: mutantOutDir,
              LLMS_ESTATE_ROOT: scratchDir,
              POOLS_FIXTURE: fixturePath,
            }),
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          const mutantFullContent = fs.readFileSync(path.join(mutantOutDir, 'llms-full.txt'), 'utf8');
          const mutantUrls = extractLlmsUrls(mutantFullContent);
          const mutantClearsFloor = mutantUrls.size >= 1000;
          check(`mutant (head-only population): floor assertion goes RED (population=${mutantUrls.size} < 1000, vs real fix's ${llmsUrls.size})`,
            !mutantClearsFloor);
          // The superset-of-headUrls relation alone can't discriminate here —
          // headUrls is BY CONSTRUCTION a subset of sitemapUrls (both are
          // parsed from the SAME token/chain sitemap files), so the mutant's
          // head-only population trivially still contains it. The tail-token
          // absence is the assertion that actually distinguishes "reverted to
          // sitemap-derived" from "the real fix" — this is what item 226's
          // whole contract is actually about (agents keep the tail, Google doesn't).
          if (tailCandidate) {
            const mutantHasTail = mutantUrls.has(`${SITE_URL}/tokens/${tailCandidate.slug}`);
            check(`mutant (head-only population): tail token "${tailCandidate.symbol}" assertion goes RED (mutant population does NOT contain it)`,
              !mutantHasTail);
          }
        });
      } finally {
        fs.rmSync(mutantPath, { force: true });
      }
    }

    const realMd5After = crypto.createHash('md5').update(fs.readFileSync(realLlmsPath, 'utf8')).digest('hex');
    check('generate-llms.js is byte-identical before/after the mutant (md5 match)',
      realMd5Before === realMd5After, `before=${realMd5Before} after=${realMd5After}`);
  });

  console.log(`\n${failed === 0 ? '✅' : '❌'} test_llms_full_estate.js: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('test_llms_full_estate.js crashed: ' + (err && err.stack || err));
  process.exit(1);
});
