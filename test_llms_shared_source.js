/* test_llms_shared_source.js — backlog 113.
 *
 * Proves generate-llms.js folds onto the shared $1000-floored SEO transient
 * (the same $RUNNER_TEMP/seo-pools.json the token/chain/sitemap generators
 * already consume) so the daily CI makes ONE fewer live DefiLlama /pools fetch.
 *
 *   MECHANISM (identity given identical inputs): running generate-llms.js
 *   end-to-end TWICE over the SAME fixture emits byte-identical llms.txt and
 *   llms-full.txt (modulo the volatile timestamp lines, normalized via the
 *   module's own normalizeLlmsContent). Reading pools from the transient is
 *   faithful & deterministic.
 *
 *   DOCUMENTED EXCLUDED-DUST DIVERGENCE: the transient is $1000-TVL-floored, so
 *   analyzeYieldData over it legitimately EXCLUDES sub-$1000 "dust" pools vs a
 *   full-payload run. This is a KNOWN, HUMAN-SIGNED-OFF divergence (backlog 113,
 *   human decision 2026-07-15: EXCLUDE), NOT a regression. A future dust pool
 *   landing in a top-N bucket is accepted, not a bug to guard against.
 *
 *   FAIL-SAFE (C1): loadFixturePools returns the pool array for a good non-empty
 *   fixture and null for missing / empty / malformed (main() then live-fetches).
 *
 * Pure Node, network-free (all data from inline fixtures), writes ONLY under
 * os.tmpdir(). Run: node test_llms_shared_source.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const llmsGen = require('./generate-llms.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// --- setup -----------------------------------------------------------------

const REPO = __dirname;
const LLMS_GEN = path.join(REPO, 'generate-llms.js');
const SITEMAP = path.join(REPO, 'sitemap.xml');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'llms-shared-'));
// Baseline git state — the test must not introduce ANY repo change (it writes
// only under os.tmpdir()). Captured before any generator runs; re-checked after.
let gitBaseline = '';
try { gitBaseline = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString(); }
catch (e) { gitBaseline = null; }

function writeTmp(dir, name, contents) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

try {
  // Real-looking pools ALL >= $1M on a couple of chains/protocols/tokens ...
  const bigPools = [
    { symbol: 'USDC', project: 'aave-v3',   chain: 'Ethereum', tvlUsd: 5000000, apyBase: 4.1, apyReward: 0, pool: 'usdc-aave-eth' },
    { symbol: 'USDT', project: 'aave-v3',   chain: 'Ethereum', tvlUsd: 3000000, apyBase: 3.8, apyReward: 0, pool: 'usdt-aave-eth' },
    { symbol: 'ETH',  project: 'uniswap-v3', chain: 'Base',    tvlUsd: 2000000, apyBase: 6.0, apyReward: 0, pool: 'eth-uni-base' },
    { symbol: 'DAI',  project: 'curve',     chain: 'Arbitrum', tvlUsd: 4000000, apyBase: 2.9, apyReward: 0, pool: 'dai-curve-arb' }
  ];
  // ... PLUS 3 injected sub-$1000 "dust" pools concentrating on ONE chain
  // (Ethereum) + ONE protocol (dustproto) + ONE token (DUST). tvl 500/999/250.
  const DUST_CHAIN = 'Ethereum';
  const DUST_PROTOCOL = 'dustproto';
  const dust = [
    { symbol: 'DUST', project: DUST_PROTOCOL, chain: DUST_CHAIN, tvlUsd: 500, apyBase: 5.0, apyReward: 0, pool: 'dust-1' },
    { symbol: 'DUST', project: DUST_PROTOCOL, chain: DUST_CHAIN, tvlUsd: 999, apyBase: 7.2, apyReward: 0, pool: 'dust-2' },
    { symbol: 'DUST', project: DUST_PROTOCOL, chain: DUST_CHAIN, tvlUsd: 250, apyBase: 9.9, apyReward: 0, pool: 'dust-3' }
  ];
  const DUST_TOTAL = dust.reduce((s, p) => s + p.tvlUsd, 0); // 1749

  const full = bigPools.concat(dust);
  const filtered = full.filter(p => Number(p.tvlUsd) >= 1000);

  // === MECHANISM: two identical-input runs emit byte-identical output ========
  console.log('MECHANISM — same fixture in => byte-identical llms.txt / llms-full.txt out');
  const fixture = writeTmp(tmpRoot, 'fixture.json', JSON.stringify(full));

  function runLlms(outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    execFileSync('node', [LLMS_GEN], {
      cwd: REPO,
      stdio: 'pipe',
      env: { ...process.env, LLMS_OUTPUT_DIR: outDir, SITEMAP_PATH: SITEMAP, POOLS_FIXTURE: fixture }
    });
    return {
      concise: fs.readFileSync(path.join(outDir, 'llms.txt'), 'utf8'),
      full: fs.readFileSync(path.join(outDir, 'llms-full.txt'), 'utf8')
    };
  }

  const runA = runLlms(path.join(tmpRoot, 'run-a'));
  const runB = runLlms(path.join(tmpRoot, 'run-b'));

  test('MECHANISM: llms.txt byte-identical across two same-fixture runs (normalized)', () => {
    assert.strictEqual(
      llmsGen.normalizeLlmsContent(runA.concise),
      llmsGen.normalizeLlmsContent(runB.concise),
      'llms.txt differed between identical-input runs');
  });
  test('MECHANISM: llms-full.txt byte-identical across two same-fixture runs (normalized)', () => {
    assert.strictEqual(
      llmsGen.normalizeLlmsContent(runA.full),
      llmsGen.normalizeLlmsContent(runB.full),
      'llms-full.txt differed between identical-input runs');
  });
  test('MECHANISM: output non-empty (both files have content)', () => {
    assert.ok(runA.concise.length > 0 && runA.full.length > 0, 'expected non-empty llms output');
  });

  // === DOCUMENTED DUST DIVERGENCE (accepted content change) ==================
  // KNOWN, human-signed-off divergence (backlog 113): analyzeYieldData over the
  // $1000-floored transient legitimately drops sub-$1000 dust. NOT a regression.
  console.log('DIVERGENCE — analyzeYieldData over $1000-floored transient drops exactly the dust');

  const anaFull = llmsGen.analyzeYieldData(full);
  const anaFiltered = llmsGen.analyzeYieldData(filtered);
  const chainTvl = (ana, chain) => {
    const e = ana.topChainsByTvl.find(x => x.chain === chain);
    return e ? e.tvl : 0;
  };
  const protoTvl = (ana, proto) => {
    const e = ana.topProtocols.find(x => x.protocol === proto);
    return e ? e.tvl : 0;
  };

  test('DIVERGENCE: floor drops exactly the 3 dust pools (accepted, signed-off — not a regression)', () => {
    assert.strictEqual(full.length - filtered.length, 3,
      'the $1000 floor must drop exactly the 3 dust pools — KNOWN backlog-113 divergence, not a regression');
  });
  test('DIVERGENCE: dust-chain TVL(full) exceeds TVL(filtered) by EXACTLY total dust TVL', () => {
    const diff = chainTvl(anaFull, DUST_CHAIN) - chainTvl(anaFiltered, DUST_CHAIN);
    assert.strictEqual(diff, DUST_TOTAL,
      'transient legitimately excludes $' + DUST_TOTAL + ' of dust from the dust chain — ' +
      'KNOWN, human-signed-off divergence (backlog 113), not a regression');
  });
  test('DIVERGENCE: dust-protocol TVL(full) exceeds TVL(filtered) by EXACTLY total dust TVL', () => {
    const diff = protoTvl(anaFull, DUST_PROTOCOL) - protoTvl(anaFiltered, DUST_PROTOCOL);
    assert.strictEqual(diff, DUST_TOTAL,
      'transient legitimately excludes $' + DUST_TOTAL + ' of dust from the dust protocol — ' +
      'KNOWN, human-signed-off divergence (backlog 113), not a regression');
  });

  // === FAIL-SAFE (C1) ========================================================
  console.log('C1 — loadFixturePools fails SAFE to live (null) on missing/empty/malformed');
  const emptyPath = writeTmp(tmpRoot, 'empty.json', '[]');
  const malformedPath = writeTmp(tmpRoot, 'bad.json', 'not json{{');
  const missingPath = '/nonexistent/never.json';

  test('C1: good non-empty fixture -> array of fixture length (uses transient)', () => {
    const arr = llmsGen.loadFixturePools(fixture);
    assert.ok(Array.isArray(arr), 'expected an array');
    assert.strictEqual(arr.length, full.length, 'array length must equal fixture length');
  });
  test('C1: missing fixture -> null (live fallback)', () => {
    assert.strictEqual(llmsGen.loadFixturePools(missingPath), null);
  });
  test('C1: empty [] fixture -> null (live fallback)', () => {
    assert.strictEqual(llmsGen.loadFixturePools(emptyPath), null);
  });
  test('C1: malformed fixture -> null (live fallback)', () => {
    assert.strictEqual(llmsGen.loadFixturePools(malformedPath), null);
  });
  test('C1: parseFixtureArg reads --fixture / defaults to env-or-null', () => {
    assert.strictEqual(llmsGen.parseFixtureArg(['--fixture', '/x.json']), '/x.json');
    assert.strictEqual(llmsGen.parseFixtureArg([]), process.env.POOLS_FIXTURE || null);
  });

  // === guardrail: the test wrote nothing into the repo ======================
  console.log('guardrail — no repo artifact written (test writes only under os.tmpdir())');
  test('git status unchanged from baseline (no stray llms.txt/llms-full.txt churn)', () => {
    if (gitBaseline == null) { console.log('    (git unavailable — skipped)'); return; }
    const after = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString();
    assert.strictEqual(after, gitBaseline, 'the test introduced a repo change:\n' + after);
  });
} catch (err) {
  console.error('  ✗ unexpected failure\n    ' + (err && err.stack || err));
  process.exitCode = 1;
} finally {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${passed} assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));
}
