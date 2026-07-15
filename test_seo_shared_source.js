/* test_seo_shared_source.js — backlog 112.
 *
 * Proves the "one-source-of-truth transient" for the 3 SEO generators:
 *
 *   B1 (byte-identical superset): for each generator, output rendered from the
 *   FULL live-shaped payload === output rendered from the $1000-FILTERED payload
 *   (exactly what the CI transient is), modulo lastmod/date placeholders. The
 *   $1000 floor is a SUPERSET gate: it only drops sub-$1000 "dust" pools that
 *   NONE of the generators keep (token/chain floor at $100K, sitemap skips
 *   < $1000), so feeding the transient is output-identical to feeding live.
 *
 *   C1 (fail-safe fallback): each generator's exported loadFixturePools returns
 *   the pool array for a good non-empty fixture, and null for a missing / empty
 *   / malformed one. A null return means the generator's main() falls through to
 *   fetchPoolData() (live) — deterministic proof of the "never a truncated run"
 *   guarantee without needing a network fetch.
 *
 * Pure Node, network-free (all data from local fixtures), writes ONLY under
 * os.tmpdir(). Run: node test_seo_shared_source.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tokenGen = require('./generate-token-pages.js');
const chainGen = require('./generate-chain-pages.js');
const sitemapGen = require('./generate-sitemap.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// --- helpers ---------------------------------------------------------------

// Normalize the two volatile bits that legitimately vary run-to-run: sitemap
// <lastmod> values and any human/ISO date the pages stamp ("Last updated
// July 15, 2026", dateModified, YYYY-MM-DD). Everything else must be byte-equal.
const DATE = '__DATE__';
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
function normalize(s) {
  return s
    .replace(/<lastmod>[^<]*<\/lastmod>/g, '<lastmod>' + DATE + '</lastmod>')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, DATE)          // ISO timestamp
    .replace(/\d{4}-\d{2}-\d{2}/g, DATE)                    // YYYY-MM-DD
    .replace(new RegExp('(' + MONTHS + ')\\s+\\d{1,2},\\s+\\d{4}', 'g'), DATE); // human date
}

const TEXT_EXT = new Set(['.html', '.xml', '.txt', '.json', '.js', '.css']);
function isTextFile(rel) { return TEXT_EXT.has(path.extname(rel).toLowerCase()); }

// Recursively read every file under root into { relPath: Buffer }.
function readTree(root) {
  const out = {};
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs);
      else out[path.relative(root, abs).split(path.sep).join('/')] = fs.readFileSync(abs);
    }
  }
  walk(root);
  return out;
}

// Assert two trees have the same file set and the same (normalized) contents.
function assertTreesIdentical(a, b, label) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  assert.deepStrictEqual(ka, kb, label + ': file lists differ');
  for (const k of ka) {
    if (isTextFile(k)) {
      assert.strictEqual(normalize(a[k].toString('utf8')), normalize(b[k].toString('utf8')),
        label + ': content differs for ' + k);
    } else {
      assert.ok(a[k].equals(b[k]), label + ': bytes differ for ' + k);
    }
  }
}

function countFiles(tree, predicate) {
  return Object.keys(tree).filter(predicate).length;
}

function writeTmp(dir, name, contents) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

// --- setup -----------------------------------------------------------------

const REPO = __dirname;
const TOKEN_GEN = path.join(REPO, 'generate-token-pages.js');
const CHAIN_GEN = path.join(REPO, 'generate-chain-pages.js');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-shared-'));
// Baseline git state — the test must not introduce ANY repo change (it writes
// only under os.tmpdir()). Captured before any generator runs; re-checked after.
let gitBaseline = '';
try { gitBaseline = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString(); }
catch (e) { gitBaseline = null; }
const originalCwd = process.cwd();

async function run() {
  // Combined fixture = token sample + chain sample, so BOTH generators emit a
  // non-empty surface from one payload. Then inject sub-$1000 "dust" pools that
  // otherwise look real — these are EXACTLY what the $1000 transient drops.
  const tokenSample = JSON.parse(fs.readFileSync(path.join(REPO, 'test_fixtures', 'pools-sample.json'), 'utf8'));
  const chainSample = JSON.parse(fs.readFileSync(path.join(REPO, 'test_fixtures', 'pools-chain-sample.json'), 'utf8'));
  const dust = [
    { symbol: 'DUSTX', project: 'realproto', chain: 'Ethereum', tvlUsd: 500, apyBase: 5.0, apyReward: 0, pool: 'dustx-realproto-d1' },
    { symbol: 'DUSTY', project: 'realproto', chain: 'Ethereum', tvlUsd: 999, apyBase: 7.2, apyReward: 0, pool: 'dusty-realproto-d2' },
    { symbol: 'DUSTZ', project: 'realproto', chain: 'Base',     tvlUsd: 250, apyBase: 9.9, apyReward: 0, pool: 'dustz-realproto-d3' }
  ];
  const combined = tokenSample.concat(chainSample, dust);
  const full = combined;
  const filtered = combined.filter(p => (Number(p.tvlUsd) || 0) >= 1000);

  const fFull = writeTmp(tmpRoot, 'full.json', JSON.stringify(full));
  const fFiltered = writeTmp(tmpRoot, 'filtered.json', JSON.stringify(filtered));

  // Sanity: the floor really dropped the 3 dust pools and nothing else.
  assert.strictEqual(full.length - filtered.length, dust.length, 'floor must drop exactly the dust pools');

  // === B1: token + chain generators (child_process, real emitted files) =====
  function runGen(gen, fixture, root) {
    fs.mkdirSync(root, { recursive: true });
    const out = path.join(root, 'out');
    const sm = path.join(root, 'sm.xml');
    execFileSync('node', [gen, '--fixture', fixture, '--out', out, '--sitemap', sm],
      { cwd: REPO, stdio: 'pipe' });
    return readTree(root);
  }

  const tokFull = runGen(TOKEN_GEN, fFull, path.join(tmpRoot, 'tok-full'));
  const tokFiltered = runGen(TOKEN_GEN, fFiltered, path.join(tmpRoot, 'tok-filtered'));
  const chnFull = runGen(CHAIN_GEN, fFull, path.join(tmpRoot, 'chn-full'));
  const chnFiltered = runGen(CHAIN_GEN, fFiltered, path.join(tmpRoot, 'chn-filtered'));

  // === B1: sitemap generator (programmatic suite, chdir into a temp cwd) =====
  const smA = path.join(tmpRoot, 'sm-full');
  const smB = path.join(tmpRoot, 'sm-filtered');
  fs.mkdirSync(smA, { recursive: true });
  fs.mkdirSync(smB, { recursive: true });
  let smTreeFull, smTreeFiltered;
  try {
    process.chdir(smA);
    await sitemapGen.generateSitemapSuite(full);
    smTreeFull = readTree(smA);
    process.chdir(smB);
    await sitemapGen.generateSitemapSuite(filtered);
    smTreeFiltered = readTree(smB);
  } finally {
    process.chdir(originalCwd);
  }

  // --- B1 assertions --------------------------------------------------------
  console.log('B1 — shared ($1000-filtered) output === live (full) output, byte-identical');

  test('B1 token: full vs $1000-filtered emit identical trees', () => {
    assertTreesIdentical(tokFull, tokFiltered, 'token');
  });
  test('B1 token: output non-empty (>=1 token page)', () => {
    const n = countFiles(tokFull, k => k.startsWith('out/') && k.endsWith('.html') && k !== 'out/index.html');
    assert.ok(n >= 1, 'expected >=1 token page, got ' + n);
  });

  test('B1 chain: full vs $1000-filtered emit identical trees', () => {
    assertTreesIdentical(chnFull, chnFiltered, 'chain');
  });
  test('B1 chain: output non-empty (>=1 chain page)', () => {
    const n = countFiles(chnFull, k => k.startsWith('out/') && k.endsWith('.html') && k !== 'out/index.html');
    assert.ok(n >= 1, 'expected >=1 chain page, got ' + n);
  });

  test('B1 sitemap: full vs $1000-filtered emit identical sitemap*.xml', () => {
    // Restrict to sitemap*.xml (the suite's own output); ignore any incidental file.
    const pick = t => Object.fromEntries(Object.entries(t).filter(([k]) => /^sitemap.*\.xml$/.test(k)));
    assertTreesIdentical(pick(smTreeFull), pick(smTreeFiltered), 'sitemap');
  });
  test('B1 sitemap: output non-empty (>0 <loc> entries)', () => {
    const allXml = Object.entries(smTreeFull)
      .filter(([k]) => /^sitemap.*\.xml$/.test(k))
      .map(([, v]) => v.toString('utf8')).join('');
    const locs = (allXml.match(/<loc>/g) || []).length;
    assert.ok(locs > 0, 'expected >0 <loc>, got ' + locs);
  });

  // === C1: fail-safe fallback for all three exported loaders ================
  console.log('C1 — loadFixturePools fails SAFE to live (null) on missing/empty/malformed');
  const goodPath = fFull; // non-empty array on disk
  const emptyPath = writeTmp(tmpRoot, 'empty.json', '[]');
  const malformedPath = writeTmp(tmpRoot, 'bad.json', 'not json{{');
  const missingPath = '/nonexistent/never.json';

  [['token', tokenGen], ['chain', chainGen], ['sitemap', sitemapGen]].forEach(([label, mod]) => {
    test('C1 ' + label + ': good non-empty fixture -> array of fixture length (uses transient)', () => {
      const arr = mod.loadFixturePools(goodPath);
      assert.ok(Array.isArray(arr), 'expected an array');
      assert.strictEqual(arr.length, full.length, 'array length must equal fixture length');
    });
    test('C1 ' + label + ': missing fixture -> null (live fallback)', () => {
      assert.strictEqual(mod.loadFixturePools(missingPath), null);
    });
    test('C1 ' + label + ': empty [] fixture -> null (live fallback)', () => {
      assert.strictEqual(mod.loadFixturePools(emptyPath), null);
    });
    test('C1 ' + label + ': malformed fixture -> null (live fallback)', () => {
      assert.strictEqual(mod.loadFixturePools(malformedPath), null);
    });
  });

  // sitemap also exposes parseFixtureArg (the CLI reader wiring main() uses).
  test('C1 sitemap: parseFixtureArg reads --fixture', () => {
    assert.strictEqual(sitemapGen.parseFixtureArg(['--fixture', '/x/y.json']), '/x/y.json');
    assert.strictEqual(sitemapGen.parseFixtureArg([]), process.env.POOLS_FIXTURE || null);
  });

  // === guardrail: the test wrote nothing into the repo ======================
  console.log('guardrail — no repo artifact written (test writes only under os.tmpdir())');
  test('git status unchanged from baseline (no stray tokens/chains/data/sitemap/og)', () => {
    if (gitBaseline == null) { console.log('    (git unavailable — skipped)'); return; }
    const after = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString();
    assert.strictEqual(after, gitBaseline, 'the test introduced a repo change:\n' + after);
  });
}

run()
  .catch(err => { console.error('  ✗ unexpected failure\n    ' + (err && err.stack || err)); process.exitCode = 1; })
  .finally(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
    console.log(`\n${passed} assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));
  });
