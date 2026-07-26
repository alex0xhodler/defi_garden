/* Unit/integration tests for audit-app.js's lazy-playwright-resolution and
   findings-artifact contract (backlog 149). FAST: no browser launch, no full
   audit run — only module load, resolvePlaywright() unit checks, one
   child-process spawn of the full CLI against a forced-unresolvable root, and
   a source-text assertion of the CLI's exit-gating call. Run: node test_audit_runner.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = __dirname;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('require(\'./audit-app.js\') — must not throw with no node_modules present');
let audit;
test('require succeeds and exports runAudit, scanNumbers, resolvePlaywright, blockingFindings', () => {
  // This is the red-against-main assertion: on the unmodified file, the
  // top-level `require('playwright')` throws MODULE_NOT_FOUND here (no
  // node_modules in this checkout), so this bare require would already fail.
  audit = require('./audit-app.js');
  assert.strictEqual(typeof audit.runAudit, 'function', 'runAudit must be exported');
  assert.strictEqual(typeof audit.scanNumbers, 'function', 'scanNumbers must be exported');
  assert.strictEqual(typeof audit.resolvePlaywright, 'function', 'resolvePlaywright must be exported');
  assert.strictEqual(typeof audit.blockingFindings, 'function', 'blockingFindings must be exported');
});

console.log('resolvePlaywright — override root paths (no browser launch)');
const emptyRoots = [];
function mkEmptyDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-pw-empty-'));
  emptyRoots.push(d);
  return d;
}

test('resolvePlaywright({ root: <empty dir> }) returns null (no throw)', () => {
  const empty = mkEmptyDir();
  let result;
  assert.doesNotThrow(() => { result = audit.resolvePlaywright({ root: empty }); });
  assert.strictEqual(result, null, 'an empty override root must resolve to null, not throw');
});

test('resolvePlaywright() with no override resolves: chromium.launch, non-empty source, version string', () => {
  const result = audit.resolvePlaywright();
  assert.ok(result, 'resolvePlaywright() must resolve in this environment (global playwright at /opt/node22/lib/node_modules)');
  assert.strictEqual(typeof result.chromium, 'object', 'result.chromium must be present');
  assert.strictEqual(typeof result.chromium.launch, 'function', 'result.chromium.launch must be a function');
  assert.ok(typeof result.source === 'string' && result.source.length > 0, 'result.source must be a non-empty string');
  assert.ok(typeof result.version === 'string' && result.version.length > 0, 'result.version must be a non-empty string');
});

console.log('child process — forced-unresolvable playwright writes a DID_NOT_RUN artifact, no repo writes');
// Captured before the child run so the "no repo writes" assertion below is a
// before/after diff, not an absolute "must be clean" check — robust to this
// branch's own legitimate uncommitted work-in-progress (this very item's
// changes to audit-app.js/package.json, and this untracked test file), while
// still catching the real regression it targets: the audit script itself
// writing anything into the repo beyond the redirected AUDIT_OUT path.
const gitStatusBefore = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });

test('node audit-app.js with AUDIT_PLAYWRIGHT_ROOT + AUDIT_OUT pointed at an empty dir: exits non-zero, writes DID_NOT_RUN artifact', () => {
  const emptyRoot = mkEmptyDir();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-out-'));
  const outPath = path.join(outDir, 'audit-findings.json');

  const result = spawnSync(process.execPath, [path.join(ROOT, 'audit-app.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { AUDIT_PLAYWRIGHT_ROOT: emptyRoot, AUDIT_OUT: outPath }),
    encoding: 'utf8',
    timeout: 60000
  });

  assert.notStrictEqual(result.status, 0, `expected non-zero exit, got ${result.status}\nstderr: ${result.stderr}`);
  assert.ok(fs.existsSync(outPath), 'AUDIT_OUT path must exist after the run');

  const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.strictEqual(written.status, 'DID_NOT_RUN', `expected status DID_NOT_RUN, got ${written.status}`);
  assert.deepStrictEqual(written.surfacesCovered, [], 'surfacesCovered must be empty on a DID_NOT_RUN artifact');
  assert.deepStrictEqual(written.findings, [], 'findings must be empty on a DID_NOT_RUN artifact');
  assert.ok(typeof written.reason === 'string' && written.reason.length > 0, 'reason must be a non-empty string');

  fs.rmSync(outDir, { recursive: true, force: true });
});

test('after the forced-failure child run, git status --porcelain is unchanged from before it (no repo writes)', () => {
  const gitStatusAfter = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(gitStatusAfter, gitStatusBefore,
    `expected git status --porcelain to be unchanged by the audit-app.js run.\nbefore:\n${gitStatusBefore}\nafter:\n${gitStatusAfter}`);
});

console.log('blockingFindings — P0/P1 filter contract');
test('blockingFindings returns only P0/P1 from a mixed fixture list', () => {
  const fixture = [
    { severity: 'P0', detail: 'a' },
    { severity: 'P1', detail: 'b' },
    { severity: 'P2', detail: 'c' },
    { severity: 'P3', detail: 'd' }
  ];
  const blocking = audit.blockingFindings(fixture);
  assert.strictEqual(blocking.length, 2, `expected 2 blocking findings, got ${blocking.length}`);
  assert.deepStrictEqual(blocking.map((f) => f.severity), ['P0', 'P1']);
});
test('blockingFindings([]) === []', () => {
  assert.deepStrictEqual(audit.blockingFindings([]), []);
});
test('blockingFindings(undefined) === []', () => {
  assert.deepStrictEqual(audit.blockingFindings(undefined), []);
});
test('CLI source still gates its exit on blockingFindings(result.findings) and the item-142 exit contract', () => {
  const src = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
  assert.ok(src.includes('blockingFindings(result.findings)'), 'CLI block must call blockingFindings(result.findings)');
  assert.ok(src.includes('process.exit(blocking.length > 0 ? 1 : 0)'), 'CLI block must preserve the item-142 exit contract verbatim');
});

// Cleanup any temp dirs left over (mkEmptyDir dirs whose owning test didn't
// already remove them — the empty-root dirs are never written to, so a plain
// rm is safe).
for (const d of emptyRoots) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
}

console.log(`\n${passed} assertions passed.`);
if (process.exitCode) { console.error('\n❌ some assertions failed'); process.exit(1); }
console.log('PASS test_audit_runner (' + passed + ' assertions)');
