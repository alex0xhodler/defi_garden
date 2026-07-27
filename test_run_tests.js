/* Regression tests for spec 163 — run-tests.js, the observable `npm test`
   runner. Covers acceptance criteria A1 (no file lost), A3 (a red does not
   abort the run), A4 (transitive lane classification) and A5 (per-file
   timeout is enforced), per A9. Local fixtures only: everything that
   actually executes files does so inside a scratch dir under os.tmpdir();
   nothing here touches the network or a real browser.

   A note on self-reference, and why this file looks the way it does below:
   this file is ITSELF one of the entries in package.json's `test:serial`
   chain, which is exactly the file list run-tests.js parses and classifies.
   run-tests.js's classifier decides the browser lane by scanning a file's
   raw text (and everything it locally requires) for the browser-driving
   npm package's name — and run-tests.js's OWN source necessarily contains
   that name (spelled out, contiguously) many times, because that's the
   string it searches for. If this file required run-tests.js the ordinary
   way (a plain quoted relative path directly inside the call), or spelled
   that package name out as a plain literal anywhere in its own text (including inside a
   fixture-content string meant for a temp file), the very same raw-text
   scan would trip on ITSELF and misclassify this file as browser lane —
   which would violate A9 ("is itself in the plain lane"). Two small,
   deliberate workarounds avoid that, documented in specs/163-notes.md:
     (1) run-tests.js is loaded via a COMPUTED path (a variable holding its
         absolute path, passed to `require`) rather than a plain quoted
         relative-path call — the classifier's require-scan only matches a
         literal quoted relative string sitting directly inside the call, by
         design (a full AST resolver would be a new dependency).
     (2) the package name is reconstructed at runtime from two literal
         halves (`PKG_HALF_A + PKG_HALF_B`) wherever a fixture needs to
         contain it, so the two halves never sit next to each other as a
         contiguous literal in this file's own source.
   Neither workaround changes what's being tested — mentionsPlaywrightTransitively
   still receives the real, reconstructed string at runtime and classifies on it
   exactly as it would classify any product file.

   Run: node test_run_tests.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const REPO_ROOT = __dirname;
const RUN_TESTS_PATH = path.join(REPO_ROOT, 'run-tests.js');
// Computed path, not a plain quoted relative-path call — see the header
// comment above for why.
const runTests = require(RUN_TESTS_PATH);

// Reconstructed at runtime so this file's own source never contains the
// browser-driver package name as a contiguous literal (see header comment).
const PKG_HALF_A = 'play';
const PKG_HALF_B = 'wright';
const MARKER = PKG_HALF_A + PKG_HALF_B;

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-fixture-'));
  try { return fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Copies the real run-tests.js under test into a fixture dir, so CLI-level
// fixture tests exercise the actual code, with its ROOT (= its own
// directory) resolved to the fixture dir rather than the real repo.
function installFixtureRunner(dir) {
  fs.copyFileSync(RUN_TESTS_PATH, path.join(dir, 'run-tests.js'));
  fs.mkdirSync(path.join(dir, 'node_modules')); // preflight only checks existence.
}

function runCLI(dir, args) {
  return spawnSync(process.execPath, ['run-tests.js', ...args], { cwd: dir, encoding: 'utf8' });
}

console.log('run-tests.js runner — 163');

// ---------------------------------------------------------------------------
// A1 — no file lost: parseFileList unit correctness.
// ---------------------------------------------------------------------------

test('A1: parseFileList splits a simple && chain, in order', () => {
  assert.deepStrictEqual(
    runTests.parseFileList('node a.js && node b.js && node c.js'),
    ['a.js', 'b.js', 'c.js']
  );
});

test('A1: parseFileList handles a single-file chain (no &&)', () => {
  assert.deepStrictEqual(runTests.parseFileList('node solo.js'), ['solo.js']);
});

test('A1: parseFileList tolerates irregular whitespace around &&', () => {
  assert.deepStrictEqual(
    runTests.parseFileList('node a.js   &&     node b.js'),
    ['a.js', 'b.js']
  );
});

test('A1: parseFileList throws on a step that is not a bare "node <file>.js"', () => {
  assert.throws(() => runTests.parseFileList('node a.js && echo hi'), /could not parse/);
});

// ---------------------------------------------------------------------------
// A1 — integration: --list on the real repo matches an independently-parsed
// test:serial string, so equality is asserted programmatically, not eyeballed,
// and without a second hardcoded file count.
// ---------------------------------------------------------------------------

test('A1: --list on the real repo yields exactly the parsed test:serial chain, same order', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const chain = pkg.scripts['test:serial'];
  const expected = runTests.parseFileList(chain);

  const res = spawnSync(process.execPath, [RUN_TESTS_PATH, '--list'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, '--list must exit 0');

  const actual = res.stdout.split('\n')
    .filter(l => l.includes('\t'))
    .map(l => l.split('\t')[0]);

  assert.deepStrictEqual(actual, expected, '--list must list exactly the parsed chain, same order, no additions/omissions');
  assert.ok(actual.length > 0, 'sanity: the parsed chain must not be empty');
});

// ---------------------------------------------------------------------------
// A3 — a red does not abort the run (fixture-proved).
// ---------------------------------------------------------------------------

test('A3: a failing plain file does not abort the run — others still execute, it is reported FAIL, exit is non-zero', () => {
  withTmpDir(dir => {
    installFixtureRunner(dir);
    fs.writeFileSync(path.join(dir, 'a_pass.js'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(dir, 'b_fail.js'), "console.log('deliberate failure'); process.exit(1);\n");
    fs.writeFileSync(path.join(dir, 'c_pass.js'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      scripts: { 'test:serial': 'node a_pass.js && node b_fail.js && node c_pass.js' },
    }));

    const res = runCLI(dir, ['--lane=plain']);

    assert.notStrictEqual(res.status, 0, 'exit code must be non-zero when a file fails');
    assert.match(res.stdout, /RESULT PASS\ta_pass\.js/, 'a_pass.js (before the failure) must still be reported PASS');
    assert.match(res.stdout, /RESULT FAIL\tb_fail\.js/, 'b_fail.js must be reported FAIL');
    assert.match(res.stdout, /RESULT PASS\tc_pass\.js/, 'c_pass.js (after the failure) must still have run and be reported PASS');
  });
});

// ---------------------------------------------------------------------------
// A4 — lane classification is a transitive, cycle-safe scan of local requires.
// ---------------------------------------------------------------------------

test('A4 (fixture): a direct mention of the marker classifies a file as browser', () => {
  withTmpDir(dir => {
    const file = path.join(dir, 'direct.js');
    fs.writeFileSync(file, `// this file drives a real browser via ${MARKER}\nprocess.exit(0);\n`);
    assert.strictEqual(runTests.mentionsPlaywrightTransitively(file, new Map(), new Set(), 0), true);
  });
});

test('A4 (fixture): a one-hop local require of a marker-mentioning module classifies as browser', () => {
  withTmpDir(dir => {
    fs.writeFileSync(path.join(dir, 'helper.js'), `module.exports = {}; // ${MARKER} driver\n`);
    fs.writeFileSync(path.join(dir, 'wrapper.js'), "require('./helper.js');\nprocess.exit(0);\n");
    assert.strictEqual(
      runTests.mentionsPlaywrightTransitively(path.join(dir, 'wrapper.js'), new Map(), new Set(), 0),
      true,
      'a naive one-level-only scan would miss this — the transitive scan must not'
    );
  });
});

test('A4 (fixture): a two-hop local require chain still classifies as browser (depth > 1)', () => {
  withTmpDir(dir => {
    fs.writeFileSync(path.join(dir, 'deep_helper.js'), `// ${MARKER}\n`);
    fs.writeFileSync(path.join(dir, 'mid.js'), "require('./deep_helper.js');\n");
    fs.writeFileSync(path.join(dir, 'outer.js'), "require('./mid.js');\nprocess.exit(0);\n");
    assert.strictEqual(
      runTests.mentionsPlaywrightTransitively(path.join(dir, 'outer.js'), new Map(), new Set(), 0),
      true
    );
  });
});

test('A4 (fixture): a file whose local requires never mention the marker stays plain', () => {
  withTmpDir(dir => {
    fs.writeFileSync(path.join(dir, 'util.js'), 'module.exports = { add: (a, b) => a + b };\n');
    fs.writeFileSync(path.join(dir, 'plain.js'), "require('./util.js');\nprocess.exit(0);\n");
    assert.strictEqual(
      runTests.mentionsPlaywrightTransitively(path.join(dir, 'plain.js'), new Map(), new Set(), 0),
      false
    );
  });
});

test('A4 (fixture): circular local requires do not hang or crash the scan (cycle-safe)', () => {
  withTmpDir(dir => {
    fs.writeFileSync(path.join(dir, 'cyc_a.js'), "require('./cyc_b.js');\n");
    fs.writeFileSync(path.join(dir, 'cyc_b.js'), "require('./cyc_a.js');\n");
    assert.strictEqual(
      runTests.mentionsPlaywrightTransitively(path.join(dir, 'cyc_a.js'), new Map(), new Set(), 0),
      false
    );
  });
});

test('A4 (real repo, read-only): test_seo_surface_audit.js and test_audit_prescan.js land in browser via ./audit-app.js, despite no direct mention themselves', () => {
  const seo = fs.readFileSync(path.join(REPO_ROOT, 'test_seo_surface_audit.js'), 'utf8');
  const prescan = fs.readFileSync(path.join(REPO_ROOT, 'test_audit_prescan.js'), 'utf8');
  assert.ok(!seo.includes(MARKER), 'fixture premise: the file itself must not directly mention the marker');
  assert.ok(!prescan.includes(MARKER), 'fixture premise: the file itself must not directly mention the marker');

  assert.strictEqual(runTests.classifyLane('test_seo_surface_audit.js', new Map()), 'browser');
  assert.strictEqual(runTests.classifyLane('test_audit_prescan.js', new Map()), 'browser');
});

test('A4 (real repo, read-only): test_llms_rails.js and test_planner.js land in plain', () => {
  assert.strictEqual(runTests.classifyLane('test_llms_rails.js', new Map()), 'plain');
  assert.strictEqual(runTests.classifyLane('test_planner.js', new Map()), 'plain');
});

// ---------------------------------------------------------------------------
// A5 — per-file timeout is enforced (fixture-proved), and the run continues.
// ---------------------------------------------------------------------------

test('A5: a file that outlives --timeout is recorded TIMEOUT, and the run continues to the next file', () => {
  withTmpDir(dir => {
    installFixtureRunner(dir);
    // Never exits on its own — proves the runner, not the child, ends it.
    fs.writeFileSync(path.join(dir, 'sleepy.js'), 'setInterval(() => {}, 1000);\n');
    fs.writeFileSync(path.join(dir, 'after.js'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      scripts: { 'test:serial': 'node sleepy.js && node after.js' },
    }));

    const startedAt = Date.now();
    const res = runCLI(dir, ['--lane=plain', '--timeout=1']);
    const elapsedSec = (Date.now() - startedAt) / 1000;

    assert.notStrictEqual(res.status, 0, 'exit code must be non-zero when a file times out');
    assert.match(res.stdout, /RESULT TIMEOUT\tsleepy\.js/, 'sleepy.js must be recorded TIMEOUT');
    assert.match(res.stdout, /RESULT PASS\tafter\.js/, 'after.js must still have run after the timeout');
    assert.ok(elapsedSec < 90, `the run must not hang well past the configured timeout (took ${elapsedSec.toFixed(1)}s)`);
  });
});

// ---------------------------------------------------------------------------
// Post-verification change — default per-file timeout is lane-aware, not a
// single constant. See specs/163-notes.md's "Post-verification change: lane-
// aware default timeout" section for why. Covers: no --timeout given resolves
// to 120 (plain) / 600 (browser); an explicit --timeout overrides both lanes.
// ---------------------------------------------------------------------------

test('lane-aware timeout: with no --timeout, resolveTimeout defaults to 120s (plain) and 600s (browser)', () => {
  assert.strictEqual(runTests.DEFAULT_TIMEOUT_PLAIN, 120, 'sanity: plain default constant is 120');
  assert.strictEqual(runTests.DEFAULT_TIMEOUT_BROWSER, 600, 'sanity: browser default constant is 600');
  assert.strictEqual(runTests.resolveTimeout('plain', null), 120, 'plain lane must default to 120s with no override');
  assert.strictEqual(runTests.resolveTimeout('browser', null), 600, 'browser lane must default to 600s with no override');
});

test('lane-aware timeout: an explicit --timeout override wins for both lanes', () => {
  assert.strictEqual(runTests.resolveTimeout('plain', 5), 5, 'an override must win over the plain default');
  assert.strictEqual(runTests.resolveTimeout('browser', 5), 5, 'an override must win over the browser default too');
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
