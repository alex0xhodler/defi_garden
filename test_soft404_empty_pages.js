/* test_soft404_empty_pages.js — item 226 (specs/226.md): the soft-404
   predicate, made machine-checked. Per this item's territory notes, the
   ranking gates (rankTopTokens/rankTopChains) already admit a record only
   with >=1 railed pool AND a visible non-zero yield (030/032/033) — so the
   expected count of empty-table generated pages is 0 today. The value this
   test adds is that the invariant is now ENFORCED and MEASURED at
   generation, not that it removes any existing page (it removes none).

   Two legs:
   (1) Generates the full estate (tokens/ + chains/, en + ko) from the LIVE
       DefiLlama pool feed and scans every LEAF *.html and *.md page (not the
       hub/A-Z index pages, which have no single "main data table") for an
       empty main data table — 0 body rows. Asserts 0 across the whole run.
   (2) Positive control: a hand-built record with an empty pool list MUST
       make assertNonEmptyPages() throw — proves the check itself can fail,
       not just pass vacuously (playbooks/derived-number-rails.md Step 0b).

   Run: node test_soft404_empty_pages.js */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const tp = require('./generate-token-pages.js');

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

// Leaf pages only: `<slug>.html`/`<slug>.md` directly under the out dir —
// excludes index.html (the hub) and everything under az/ (A-Z sub-hubs),
// neither of which has a single "main data table" of pools.
function leafPagesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => (f.endsWith('.html') || f.endsWith('.md')) && f !== 'index.html')
    .map(f => path.join(dir, f));
}

function countHtmlTableRows(html) {
  const m = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!m) return null; // no table at all — treated as a failure by the caller
  return (m[1].match(/<tr>/g) || []).length;
}

function countMarkdownTableRows(md) {
  const lines = md.split('\n');
  const headerIdx = lines.findIndex(l => /^\|[-|]+\|$/.test(l.trim()));
  if (headerIdx < 0) return null; // no table at all
  let count = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') break;
    if (line.startsWith('|')) count++;
  }
  return count;
}

async function main() {
  console.log('test_soft404_empty_pages.js — item 226: soft-404 predicate, machine-checked\n');

  // ---------------------------------------------------------------------
  // (2) Positive control — proves the check itself can fail.
  // ---------------------------------------------------------------------
  console.log('(2) positive control: assertNonEmptyPages throws on an empty pool list');
  {
    const goodRecord = { symbol: 'USDC', slug: 'usdc', pools: [{ pool: 'p1', tvlUsd: 1e7 }] };
    const emptyRecord = { symbol: 'GHOST', slug: 'ghost', pools: [] };
    let threw = false, message = '';
    try {
      tp.assertNonEmptyPages([goodRecord, emptyRecord], 'positive-control');
    } catch (err) {
      threw = true; message = err.message;
    }
    check('assertNonEmptyPages throws when a record has an empty pool list', threw);
    check('the thrown error names the offending slug ("ghost")', message.includes('ghost'), message);
    check('the thrown error does NOT name the healthy slug ("usdc")', !message.includes('usdc'), message);

    let threwOnGoodOnly = false;
    try { tp.assertNonEmptyPages([goodRecord], 'positive-control-clean'); } catch (e) { threwOnGoodOnly = true; }
    check('assertNonEmptyPages does NOT throw when every record has >=1 pool', !threwOnGoodOnly);
  }

  // ---------------------------------------------------------------------
  // (1) Full-estate scan — 0 empty main data tables.
  // ---------------------------------------------------------------------
  console.log('\n(1) full-estate scan: 0 generated leaf pages have an empty main data table');

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

  await withTmpDir('soft404-scan-', async (scratchDir) => {
    const preloadPath = writeOgStubPreload(scratchDir);
    const tokensOut = path.join(scratchDir, 'tokens');
    const chainsOut = path.join(scratchDir, 'chains');
    const koTokensOut = path.join(scratchDir, 'ko', 'tokens');
    const koChainsOut = path.join(scratchDir, 'ko', 'chains');

    const fixturePath = path.join(scratchDir, 'pools-fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify(pools));

    // --no-sitemap: this test only cares about the generated pages themselves.
    runGeneratorCli('generate-token-pages.js', [
      '--fixture', fixturePath, '--out', tokensOut, '--no-sitemap',
    ], preloadPath);
    runGeneratorCli('generate-chain-pages.js', [
      '--fixture', fixturePath, '--out', chainsOut, '--no-sitemap',
    ], preloadPath);

    const leafPages = [
      ...leafPagesIn(tokensOut), ...leafPagesIn(koTokensOut),
      ...leafPagesIn(chainsOut), ...leafPagesIn(koChainsOut),
    ];
    check('at least 100 leaf pages were generated to scan (non-vacuity)', leafPages.length >= 100,
      `got ${leafPages.length}`);

    const empties = [];
    const noTableAtAll = [];
    for (const p of leafPages) {
      const content = fs.readFileSync(p, 'utf8');
      const rows = p.endsWith('.md') ? countMarkdownTableRows(content) : countHtmlTableRows(content);
      if (rows === null) noTableAtAll.push(p);
      else if (rows === 0) empties.push(p);
    }
    check(`every scanned page (${leafPages.length}) has a table at all (parser sanity)`,
      noTableAtAll.length === 0, `${noTableAtAll.length} without a table: ${JSON.stringify(noTableAtAll.slice(0, 5))}`);
    check(`0 of ${leafPages.length} generated leaf pages have an empty main data table (soft-404)`,
      empties.length === 0, `${empties.length} empty: ${JSON.stringify(empties.slice(0, 10))}`);

    console.log(`\n  (measured this run) leaf pages scanned=${leafPages.length}, empty=${empties.length}`);
  });

  console.log(`\n${failed === 0 ? '✅' : '❌'} test_soft404_empty_pages.js: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('test_soft404_empty_pages.js crashed: ' + (err && err.stack || err));
  process.exit(1);
});
