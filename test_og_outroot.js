/* Regression tests for spec 076 — the OG-image generator must follow --out.

   Before 076, generate-token-pages.js / generate-chain-pages.js called
   generateOgImages(..., process.cwd()) regardless of --out, so ANY scratch
   run (even one pointed at a throwaway dir) rewrote — and stale-deleted —
   the repo's committed og/tokens/*.png / og/chains/*.png. These tests drive
   each generator as a child process from a *temp* cwd (never the repo root)
   and assert the OG PNGs land in the og/ sibling of --out, leaving a decoy
   og dir in the temp cwd byte-identical. Fixture-driven, no network.

   Run: node test_og_outroot.js */
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
const TOKEN_FIXTURE = path.join(__dirname, 'test_fixtures', 'pools-sample.json');
const CHAIN_FIXTURE = path.join(__dirname, 'test_fixtures', 'pools-chain-sample.json');

function isPng(buf) {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
function pngsIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.png'));
}
function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-outroot-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
// Never run a generator with cwd === repo root; the whole point of 076 is that
// a scratch run must not touch committed og/ files. Guard the harness itself.
function runGen(script, cwd, outArg, fixture) {
  assert.notStrictEqual(path.resolve(cwd), __dirname, 'refusing to run generator with cwd === repo root');
  execFileSync('node', [script, '--fixture', fixture, '--out', outArg, '--no-sitemap'], {
    cwd, stdio: 'pipe',
  });
}

// AC1/AC2 — scratch isolation. Temp cwd holds a decoy og/<kind>/decoy.png;
// --out points at a *separate* scratch dir; the decoy must survive untouched
// and the OG PNGs must appear under <scratch>/og/<kind>/.
function scratchIsolationCase(kind, script, fixture) {
  return () => withTmpDir(cwd => withTmpDir(scratch => {
    const decoyDir = path.join(cwd, 'og', kind);
    fs.mkdirSync(decoyDir, { recursive: true });
    const decoyPath = path.join(decoyDir, 'decoy.png');
    const decoyBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    fs.writeFileSync(decoyPath, decoyBytes);
    const decoyListBefore = fs.readdirSync(decoyDir).sort();

    runGen(script, cwd, path.join(scratch, kind), fixture);

    // (a) OG PNGs landed under <scratch>/og/<kind>/
    const scratchOg = path.join(scratch, 'og', kind);
    const written = pngsIn(scratchOg);
    assert.ok(written.length > 0, `no OG PNGs written under ${scratchOg}`);
    assert.ok(isPng(fs.readFileSync(path.join(scratchOg, written[0]))), 'written file is not a PNG');

    // (b) the decoy og dir in the temp cwd is byte-identical / untouched
    assert.deepStrictEqual(fs.readdirSync(decoyDir).sort(), decoyListBefore,
      'decoy og dir gained/lost files — scratch run leaked into the cwd og dir');
    assert.ok(fs.readFileSync(decoyPath).equals(decoyBytes), 'decoy.png bytes were modified');
  }));
}

console.log('scratch isolation — OG images follow --out, repo og/ dir untouched (076 AC1/AC2)');
test('chains: --out <scratch>/chains writes <scratch>/og/chains, cwd og/chains untouched', scratchIsolationCase('chains', CHAIN_GEN, CHAIN_FIXTURE));
test('tokens: --out <scratch>/tokens writes <scratch>/og/tokens, cwd og/tokens untouched', scratchIsolationCase('tokens', TOKEN_GEN, TOKEN_FIXTURE));

// AC3 — production invariance. CI runs from the repo root with --out chains /
// --out tokens, so path.dirname(path.resolve('<kind>')) === cwd and the OG
// PNGs must still land under <cwd>/og/<kind>/. Reproduce with a temp cwd.
function productionShapeCase(kind, script, fixture) {
  return () => withTmpDir(cwd => {
    runGen(script, cwd, kind, fixture); // --out <kind> (bare), CI's exact shape
    const og = path.join(cwd, 'og', kind);
    const written = pngsIn(og);
    assert.ok(written.length > 0, `CI-shape run wrote no OG PNGs under ${og}`);
    assert.ok(isPng(fs.readFileSync(path.join(og, written[0]))), 'written file is not a PNG');
  });
}

console.log('production invariance — --out <kind> from cwd still writes cwd/og/<kind> (076 AC3)');
test('chains: --out chains from a repo-shaped cwd writes cwd/og/chains', productionShapeCase('chains', CHAIN_GEN, CHAIN_FIXTURE));
test('tokens: --out tokens from a repo-shaped cwd writes cwd/og/tokens', productionShapeCase('tokens', TOKEN_GEN, TOKEN_FIXTURE));

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
