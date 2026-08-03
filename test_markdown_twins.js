/* Unit tests for the Markdown twins of the static token/chain pages (spec 212).
   Runs the REAL generators (generate-token-pages.js / generate-chain-pages.js)
   as child processes against a synthetic fixture, into a scratch temp dir —
   never the repo's tracked tokens/, chains/, ko/, og/ directories (territory
   note 4: twins must not be committed by this PR). Mirrors test_og_outroot.js's
   child-process --fixture/--out pattern and test_token_pages.js's 174 scratch-
   run harness (patch MIN_POOL_TVL, re-render, assert the copy moves with it).

   Run: node test_markdown_twins.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const TOKEN_GEN = path.join(__dirname, 'generate-token-pages.js');
const CHAIN_GEN = path.join(__dirname, 'generate-chain-pages.js');

// ---------------------------------------------------------------------------
// Synthetic fixture: >=20 distinct qualifying tokens across several chains,
// so both the token-page twin sample (>=20 slugs) and a handful of chain
// pages exist from one fixture. Every pool clears the $100K floor, is
// non-anomalous, and has a real (non-zero-rounding) APY so every token/chain
// qualifies for a page under the existing 030/032/033 quality gates.
// ---------------------------------------------------------------------------
const CHAINS = ['Ethereum', 'Base', 'Arbitrum', 'Polygon', 'Optimism'];
const TOKEN_COUNT = 24;
function buildFixturePools() {
  const pools = [];
  for (let i = 0; i < TOKEN_COUNT; i++) {
    pools.push({
      symbol: `TWIN${i}`,
      project: `proj${i}`,
      chain: CHAINS[i % CHAINS.length],
      tvlUsd: 1000000 + i * 50000,
      apyBase: 3 + (i % 7),
      apyReward: 0,
      pool: `twin-pool-${i}`,
    });
  }
  return pools;
}

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-212-twins-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Never run a generator with cwd === repo root — a scratch run must not touch
// committed tokens/chains/ko/og output (territory note 4 + spec 076 convention).
function runGen(script, cwd, outArg, fixturePath) {
  assert.notStrictEqual(path.resolve(cwd), __dirname, 'refusing to run generator with cwd === repo root');
  execFileSync('node', [script, '--fixture', fixturePath, '--out', outArg, '--no-sitemap'], {
    cwd, stdio: 'pipe',
  });
}

// ---------------------------------------------------------------------------
// One shared scratch run — reused across most tests below (expensive: OG
// image generation + two full generator invocations x2 langs).
// ---------------------------------------------------------------------------
let scratch; // cwd
let fixturePath;
function setup() {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-212-twins-'));
  fixturePath = path.join(scratch, 'fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify({ data: buildFixturePools() }));
  runGen(TOKEN_GEN, scratch, 'tokens', fixturePath);
  runGen(CHAIN_GEN, scratch, 'chains', fixturePath);
}
function teardown() {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
}

setup();
try {
  const tokensDir = path.join(scratch, 'tokens');
  const koTokensDir = path.join(scratch, 'ko', 'tokens');
  const chainsDir = path.join(scratch, 'chains');
  const koChainsDir = path.join(scratch, 'ko', 'chains');

  const tokenSlugs = fs.readdirSync(tokensDir)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => f.replace(/\.html$/, ''));
  const chainSlugs = fs.readdirSync(chainsDir)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => f.replace(/\.html$/, ''));

  console.log('scratch run wiring sanity');
  test(`>=20 token slugs were generated (got ${tokenSlugs.length})`, () => {
    assert.ok(tokenSlugs.length >= 20, `expected >=20 token slugs, got ${tokenSlugs.length}`);
  });
  test('>=1 chain slug was generated', () => {
    assert.ok(chainSlugs.length >= 1);
  });

  console.log('every generated token/chain page (en + ko) has a sibling .md; hub/az pages do not');
  test('every token .html (en) has a sibling .md', () => {
    tokenSlugs.forEach(slug => {
      assert.ok(fs.existsSync(path.join(tokensDir, slug + '.md')), `missing tokens/${slug}.md`);
    });
  });
  test('every token .html (ko) has a sibling .md', () => {
    tokenSlugs.forEach(slug => {
      assert.ok(fs.existsSync(path.join(koTokensDir, slug + '.md')), `missing ko/tokens/${slug}.md`);
    });
  });
  test('every chain .html (en + ko) has a sibling .md', () => {
    chainSlugs.forEach(slug => {
      assert.ok(fs.existsSync(path.join(chainsDir, slug + '.md')), `missing chains/${slug}.md`);
      assert.ok(fs.existsSync(path.join(koChainsDir, slug + '.md')), `missing ko/chains/${slug}.md`);
    });
  });
  test('hub pages (index.html) get NO .md twin', () => {
    assert.ok(fs.existsSync(path.join(tokensDir, 'index.html')));
    assert.ok(!fs.existsSync(path.join(tokensDir, 'index.md')), 'tokens hub must not get a Markdown twin');
    assert.ok(!fs.existsSync(path.join(chainsDir, 'index.md')), 'chains hub must not get a Markdown twin');
    assert.ok(!fs.existsSync(path.join(koTokensDir, 'index.md')));
    assert.ok(!fs.existsSync(path.join(koChainsDir, 'index.md')));
  });
  test('A-Z pages get NO .md twin', () => {
    const azDir = path.join(tokensDir, 'az');
    assert.ok(fs.existsSync(azDir), 'sanity: expected an az/ dir');
    const azFiles = fs.readdirSync(azDir);
    assert.ok(azFiles.some(f => f.endsWith('.html')), 'sanity: expected some A-Z html pages');
    assert.ok(!azFiles.some(f => f.endsWith('.md')), 'A-Z pages must not get a Markdown twin');
  });

  console.log('markdown shape — real table, headings, not prose');
  function assertShape(md, label) {
    assert.ok(md.startsWith('# '), `${label}: must start with an H1`);
    assert.ok(/^\|---\|/m.test(md) || /\|---\|---\|/.test(md), `${label}: must contain a |---| table separator row`);
    assert.ok(/\| [^\n|]+ \| [^\n|]+ \|/.test(md), `${label}: must contain a labelled table header row`);
    assert.ok(/^## /m.test(md), `${label}: must contain a "## " heading`);
    assert.ok(/^### /m.test(md), `${label}: must contain a "### " heading (FAQ questions)`);
  }
  test('token twin (en) has H1 + real table + headings', () => {
    const md = fs.readFileSync(path.join(tokensDir, tokenSlugs[0] + '.md'), 'utf8');
    assertShape(md, 'token md');
  });
  test('chain twin (en) has H1 + real table + headings', () => {
    const md = fs.readFileSync(path.join(chainsDir, chainSlugs[0] + '.md'), 'utf8');
    assertShape(md, 'chain md');
  });

  console.log('KO twins are actually Korean (Hangul, matching the sibling KO HTML)');
  const HANGUL_RE = /[가-힣]/;
  test('KO token twin body contains Hangul, matching a real string from the sibling KO HTML', () => {
    const slug = tokenSlugs[0];
    const koMd = fs.readFileSync(path.join(koTokensDir, slug + '.md'), 'utf8');
    const koHtml = fs.readFileSync(path.join(koTokensDir, slug + '.html'), 'utf8');
    assert.ok(HANGUL_RE.test(koMd), 'KO token .md has no Hangul at all — English body copy leaked through');
    // The FAQ heading ("자주 묻는 질문") is baked straight from translations.js
    // and must appear byte-for-byte in BOTH the KO html and the KO md.
    assert.ok(koHtml.includes('자주 묻는 질문'), 'sanity: sibling KO html missing the expected FAQ heading');
    assert.ok(koMd.includes('자주 묻는 질문'), 'KO md missing the FAQ heading translation present in its own sibling KO html');
  });
  test('KO chain twin body contains Hangul, matching a real string from the sibling KO HTML', () => {
    const slug = chainSlugs[0];
    const koMd = fs.readFileSync(path.join(koChainsDir, slug + '.md'), 'utf8');
    const koHtml = fs.readFileSync(path.join(koChainsDir, slug + '.html'), 'utf8');
    assert.ok(HANGUL_RE.test(koMd));
    assert.ok(koHtml.includes('자주 묻는 질문'));
    assert.ok(koMd.includes('자주 묻는 질문'));
  });
  test('EN token twin body has NO Hangul', () => {
    const slug = tokenSlugs[0];
    const enMd = fs.readFileSync(path.join(tokensDir, slug + '.md'), 'utf8');
    assert.ok(!HANGUL_RE.test(enMd), 'EN md should contain no Hangul');
  });

  console.log('fact parity — pool count / top APY / TVL floor identical in .html and .md, for >=20 slugs');
  function extractLdJsonBlocks(html, type) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
      const parsed = JSON.parse(m[1]);
      if (!type || parsed['@type'] === type) blocks.push(parsed);
    }
    return blocks;
  }
  // tcpFaqA1 (EN): "<apy>% APY on <project> (<chain>), based on live DefiLlama data."
  // tcpFaqA2 (EN): "<count> live pool(s) clear this page's <floor> TVL floor, <tvl> in total."
  // Both templates are literal, from translations.js — parsing them mechanically
  // (not eyeballing) is exactly what spec 212's acceptance criterion asks for.
  function parseApy(text) {
    const m = text.match(/([\d,]+\.\d{2}%) APY on/);
    return m && m[1];
  }
  function parseCountAndFloor(text) {
    const m = text.match(/(\d+) live pools? clear this page's (\$[\d.,]+[A-Za-z]*) TVL floor/);
    return m ? { count: m[1], floor: m[2] } : null;
  }
  function factsFromHtml(html) {
    const faq = extractLdJsonBlocks(html, 'FAQPage')[0].mainEntity;
    const apy = parseApy(faq[0].acceptedAnswer.text);
    const cf = parseCountAndFloor(faq[1].acceptedAnswer.text);
    assert.ok(apy, 'could not parse APY out of the html FAQ');
    assert.ok(cf, 'could not parse count/floor out of the html FAQ');
    return { apy, count: cf.count, floor: cf.floor };
  }
  function factsFromMd(md) {
    const apy = parseApy(md);
    const cf = parseCountAndFloor(md);
    assert.ok(apy, 'could not parse APY out of the md');
    assert.ok(cf, 'could not parse count/floor out of the md');
    return { apy, count: cf.count, floor: cf.floor };
  }
  test(`token fact parity holds for all ${tokenSlugs.length} generated slugs`, () => {
    assert.ok(tokenSlugs.length >= 20, 'sanity: need >=20 slugs for this criterion');
    tokenSlugs.forEach(slug => {
      const html = fs.readFileSync(path.join(tokensDir, slug + '.html'), 'utf8');
      const md = fs.readFileSync(path.join(tokensDir, slug + '.md'), 'utf8');
      const hf = factsFromHtml(html);
      const mf = factsFromMd(md);
      assert.strictEqual(mf.apy, hf.apy, `${slug}: top pool APY drifted between .md and .html`);
      assert.strictEqual(mf.count, hf.count, `${slug}: pool count drifted between .md and .html`);
      assert.strictEqual(mf.floor, hf.floor, `${slug}: TVL floor figure drifted between .md and .html`);
    });
  });
  test('chain fact parity holds for all generated chain slugs', () => {
    chainSlugs.forEach(slug => {
      const html = fs.readFileSync(path.join(chainsDir, slug + '.html'), 'utf8');
      const md = fs.readFileSync(path.join(chainsDir, slug + '.md'), 'utf8');
      const hf = factsFromHtml(html);
      const mf = factsFromMd(md);
      assert.strictEqual(mf.apy, hf.apy, `${slug}: top pool APY drifted between .md and .html`);
      assert.strictEqual(mf.count, hf.count, `${slug}: pool count drifted between .md and .html`);
      assert.strictEqual(mf.floor, hf.floor, `${slug}: TVL floor figure drifted between .md and .html`);
    });
  });

  console.log('stale-cleanup — a junk .md left in the out dir is removed on the next run');
  test('re-running the generator removes an orphaned .md file', () => {
    const junkPath = path.join(tokensDir, 'zzz-not-a-token.md');
    fs.writeFileSync(junkPath, '# junk twin of a page that no longer exists\n');
    assert.ok(fs.existsSync(junkPath), 'sanity: junk file was written');
    runGen(TOKEN_GEN, scratch, 'tokens', fixturePath);
    assert.ok(!fs.existsSync(junkPath), 'stale .md must be removed by the next generator run');
  });
} finally {
  teardown();
}

// ---------------------------------------------------------------------------
// 159/174 rule: mutate MIN_POOL_TVL in a scratch COPY of the generator source
// (never the real module), re-render, and prove the Markdown floor figure
// moves WITH the constant — the same harness test_token_pages.js/
// test_chain_pages.js already use for the HTML templates, extended to cover
// the new Markdown templates.
// ---------------------------------------------------------------------------
console.log('159/174 rule — the Markdown floor figure is never a re-typed literal');
function rewriteRequiresToAbsolute(src, dir, overrides) {
  return src.replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (m, q, relPath) => {
    const abs = (overrides && overrides[relPath]) || path.join(dir, relPath);
    return `require(${q}${abs.replace(/\\/g, '/')}${q})`;
  });
}
function loadScratchGenerators(newFloor) {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-212-scratch-'));
  const tokenSrc = fs.readFileSync(path.join(__dirname, 'generate-token-pages.js'), 'utf8');
  const patchedMarker = `const MIN_POOL_TVL = ${newFloor};`;
  const patchedTokenSrc = rewriteRequiresToAbsolute(
    tokenSrc.replace('const MIN_POOL_TVL = 100000;', patchedMarker), __dirname);
  assert.ok(patchedTokenSrc.includes(patchedMarker), 'failed to patch MIN_POOL_TVL in the scratch token generator');
  const tokenScratchPath = path.join(scratchDir, 'generate-token-pages.js');
  fs.writeFileSync(tokenScratchPath, patchedTokenSrc);

  const chainSrc = fs.readFileSync(path.join(__dirname, 'generate-chain-pages.js'), 'utf8');
  const patchedChainSrc = rewriteRequiresToAbsolute(chainSrc, __dirname,
    { './generate-token-pages.js': tokenScratchPath.replace(/\\/g, '/') });
  const chainScratchPath = path.join(scratchDir, 'generate-chain-pages.js');
  fs.writeFileSync(chainScratchPath, patchedChainSrc);

  return { tokenGen: require(tokenScratchPath), chainGen: require(chainScratchPath), scratchDir };
}
function cleanupScratch(scratchDir) {
  Object.keys(require.cache).forEach(k => { if (k.startsWith(scratchDir)) delete require.cache[k]; });
  fs.rmSync(scratchDir, { recursive: true, force: true });
}

test('mutating MIN_POOL_TVL moves the Markdown floor figure on token + chain twins, with zero stale $100K literal', () => {
  const { tokenGen, chainGen, scratchDir } = loadScratchGenerators(250000);
  try {
    const newFloorStr = tokenGen.formatUsd(250000);
    assert.strictEqual(newFloorStr, '$250K', 'sanity: the mutated floor formats to $250K');

    const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-sample.json'), 'utf8'));
    const scratchRanked = tokenGen.rankTopTokens(pools);
    const big = scratchRanked.find(r => r.symbol === 'BIG');
    assert.ok(big, 'BIG must still qualify at the mutated $250K floor');
    const tokenMd = tokenGen.renderTokenPageMarkdown(big, [], '2026-08-03');
    assert.ok(tokenMd.includes(newFloorStr), 'token Markdown twin must show the MUTATED floor, not a fixed literal');
    assert.ok(!tokenMd.includes('$100K'), 'token Markdown twin must not retain the stale $100K literal once the constant changes');

    const scratchChainRanked = chainGen.rankTopChains(pools);
    assert.ok(scratchChainRanked.length > 0, 'expected at least one qualifying chain at the mutated floor');
    const chainRec = scratchChainRanked[0];
    const chainMd = chainGen.renderChainPageMarkdown(chainRec, [], '2026-08-03');
    assert.ok(chainMd.includes(newFloorStr), 'chain Markdown twin must show the MUTATED floor');
    assert.ok(!chainMd.includes('$100K'), 'chain Markdown twin must not retain the stale $100K literal');
  } finally {
    cleanupScratch(scratchDir);
  }
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) { console.error('\n❌ some assertions failed'); }
