/* test_test_registry.js — spec 205: the guard that closes the "orphaned
   test_*.js file" class permanently.

   Measured on `main` @ a4dbd99cd: 120 files listed in package.json's
   `test:serial` chain, 127 test_*.js files on disk — 7 files existed, ran
   nowhere, and were counted by nothing (specs/205.md §Problem). Human memory
   (`playbooks/test-gate-observability.md` step 4, "if you add a test file,
   append it to test:serial") was the only thing enforcing the invariant, and
   it had already been violated seven times. This file makes the invariant
   self-checking instead of memory-checking.

   Asserts, against the REAL repo on disk and the REAL package.json:
     (a) no orphans     — every test_*.js in the repo root is in test:serial.
     (b) no ghosts      — every test:serial step names a file that exists.
     (c) no duplicates  — no file appears twice in the chain.
     (d) parse integrity — every step matches "node <file>.js", verified by
         reusing run-tests.js's OWN exported parseFileList()/readSerialChain()
         (never a second hand-rolled regex that could silently drift from the
         real one and pass while the real gate throws).
     (e) self-defeat    — constructs an in-memory chain STRING missing a known
         on-disk file and proves the orphan check reports it. A check never
         shown to fail is not evidence of health
         (playbooks/derived-number-rails.md Step 0b; test-gate-observability.md
         step 5).

   A NOTE ON WHY THIS FILE LOOKS THE WAY IT DOES (lane classification):
   run-tests.js classifies a file as browser-lane if ITS OWN TEXT, or any
   local module it requires (recursively), contains the browser-driving test
   framework's package name as a literal substring — because that is
   literally the string the classifier searches for, and run-tests.js's own
   source necessarily contains it many times over (it says so, describing the
   scan). Two deliberate workarounds, both already used by test_run_tests.js
   in this same repo, keep this file out of that trap:
     1. run-tests.js is loaded via a COMPUTED path (a variable holding its
        absolute path passed to `require`), never a bare quoted relative-path
        literal sitting directly inside the call — the classifier's local-
        require scan only matches a literal quoted string immediately inside
        require(...).
     2. This file never spells out the browser-driving package's name at all
        (not even in a comment) — it isn't needed here, since this file only
        exercises the file-list/parse machinery, never the lane classifier
        itself.
   Neither workaround changes what is tested. Lane placement must be verified
   after any edit with: node run-tests.js --list --lane=plain

   Run: node test_test_registry.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const REPO_ROOT = __dirname;

// Computed path, not a plain quoted relative-path literal directly inside
// require() — see the header comment above for why this matters.
const RUN_TESTS_PATH = path.join(REPO_ROOT, 'run-tests.js');
const runTests = require(RUN_TESTS_PATH);
const { parseFileList, readSerialChain } = runTests;

function diskTestFiles() {
  return fs.readdirSync(REPO_ROOT).filter((f) => /^test_.*\.js$/.test(f)).sort();
}

function getRealChainFiles() {
  return parseFileList(readSerialChain());
}

// --- pure checkers, shared between the real-repo assertions and (e)'s
//     self-defeat case, so (e) proves the SAME logic that (a) trusts. ------
function computeOrphans(diskFiles, chainFiles) {
  const chainSet = new Set(chainFiles);
  return diskFiles.filter((f) => !chainSet.has(f));
}
function computeGhosts(chainFiles, root) {
  return chainFiles.filter((f) => !fs.existsSync(path.join(root, f)));
}
function computeDuplicates(chainFiles) {
  const seen = new Set();
  const dups = new Set();
  for (const f of chainFiles) {
    if (seen.has(f)) dups.add(f);
    else seen.add(f);
  }
  return Array.from(dups);
}

console.log('test_test_registry.js — spec 205 guard: test:serial vs. disk\n');

test('(a) no orphans: every test_*.js file in the repo root appears in test:serial', () => {
  const diskFiles = diskTestFiles();
  const chainFiles = getRealChainFiles();
  const orphans = computeOrphans(diskFiles, chainFiles);
  assert.deepStrictEqual(orphans, [],
    `test:serial is missing ${orphans.length} file(s) present on disk: ${JSON.stringify(orphans)}`);
});

test('(b) no ghosts: every test:serial step names a file that exists on disk', () => {
  const chainFiles = getRealChainFiles();
  const ghosts = computeGhosts(chainFiles, REPO_ROOT);
  assert.deepStrictEqual(ghosts, [],
    `test:serial names ${ghosts.length} file(s) that do not exist on disk: ${JSON.stringify(ghosts)}`);
});

test('(c) no duplicates: no file appears twice in test:serial', () => {
  const chainFiles = getRealChainFiles();
  const dups = computeDuplicates(chainFiles);
  assert.deepStrictEqual(dups, [],
    `test:serial lists ${dups.length} file(s) more than once: ${JSON.stringify(dups)}`);
});

test('(d) parse integrity: every test:serial step matches "node <file>.js" via run-tests.js\'s own parseFileList()', () => {
  // Reused, not re-derived: run-tests.js exports parseFileList()/
  // readSerialChain(), and this calls the SAME parser the real gate uses.
  // parseFileList() throws on any step that isn't a bare "node <file>.js"
  // invocation, so reaching the assertions below without a throw already
  // proves every step conforms; the length check below additionally rules
  // out a parser that silently drops malformed steps instead of throwing.
  const chain = readSerialChain();
  const files = parseFileList(chain);
  assert.ok(Array.isArray(files) && files.length > 0, 'parseFileList() returned an empty or non-array result');
  const stepCount = chain.split('&&').map((s) => s.trim()).filter(Boolean).length;
  assert.strictEqual(files.length, stepCount,
    `parseFileList() returned ${files.length} file(s) but the chain has ${stepCount} "&&"-separated step(s) — a step was dropped rather than rejected`);
});

test('(e) self-defeat: the orphan check goes RED on an in-memory chain string missing a known file', () => {
  const diskFiles = diskTestFiles();
  assert.ok(diskFiles.length > 1, 'sanity: need more than one test_*.js file on disk to construct a self-defeat case');
  const knownFile = diskFiles[0];

  // An in-memory chain STRING — never package.json, never written to disk —
  // built in the exact "node <file>.js && node <file>.js && ..." shape
  // test:serial itself uses, with knownFile deliberately left out.
  const mutatedChainString = diskFiles
    .filter((f) => f !== knownFile)
    .map((f) => `node ${f}`)
    .join(' && ');
  const mutatedChainFiles = parseFileList(mutatedChainString); // same reused parser as (d)
  const orphans = computeOrphans(diskFiles, mutatedChainFiles);
  assert.deepStrictEqual(orphans, [knownFile],
    `expected the check to flag "${knownFile}" as an orphan once removed from an in-memory chain string; got ${JSON.stringify(orphans)} — a check that cannot go red is not evidence it works`);

  // Restore proof: the SAME real, unmutated chain must still be clean —
  // demonstrates the red above came from the deliberate removal, not from a
  // side effect of running this test.
  const realOrphans = computeOrphans(diskFiles, getRealChainFiles());
  assert.deepStrictEqual(realOrphans, [],
    `sanity: the real (unmutated) package.json chain must remain orphan-free after the self-defeat case ran; got ${JSON.stringify(realOrphans)}`);
});

console.log(`\n${passed}/5 assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));
