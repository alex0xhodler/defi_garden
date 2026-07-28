/* Unit tests for prescanTextSurfaces() — the non-HTML generated text-surface
   pass over llms.txt/llms-full.txt (backlog 160). Fs+regex only, no
   Playwright, no browser — this file must run in ~1s (same fast-harness
   convention as test_llms_rails.js).

   Evidence this closes (spec 160): item 159 shipped 353,114.2% APY live on
   llms.txt with NO automated gate catching it — found by hand during a
   heartbeat scan. prescanStaticPages() (backlog 157) already proves the
   pure-fs approach at 2,197 files; this applies the same shape to the ~2
   text surfaces it never covered.

   NOTE (spec 160 Territory note): item 159 has already merged on this
   checkout, so the COMMITTED llms.txt/llms-full.txt are clean — the positive
   control below uses a FIXTURE reproducing the pre-159 shape, and a separate
   case asserts the real committed files are clean today (see "real surface"
   cases).

   Run: node test_audit_text_surfaces.js */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { prescanTextSurfaces, runAudit } = require('./audit-app.js');

const ROOT = __dirname;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assertT(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------------------
// Fixture helpers — every fixture is written under os.tmpdir() and removed
// immediately after use (even on assertion failure, via try/finally at each
// call site below).
// ---------------------------------------------------------------------------
let fixtureDirs = [];
function writeFixture(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-text-surfaces-'));
  fixtureDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}
function cleanupFixtures() {
  for (const d of fixtureDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
  fixtureDirs = [];
}

// A pool line both files actually use: "<label> — <apy>% APY, <tvl> TVL — <url>".
function poolLine(apyStr, tvlStr) {
  return `- Base · uniswap-v3 · WETH-USDC — ${apyStr}% APY, ${tvlStr} TVL — https://www.defi.garden/?token=WETH-USDC&chain=Base`;
}

console.log('prescanTextSurfaces() — backlog 160 text-surface pass\n');

// ---------------------------------------------------------------------------
// Positive control — a fixture reproducing the pre-159 llms.txt shape: the
// real 353,114.2% APY / $576,877 TVL anomaly from spec 159's own evidence,
// plus a stated TVL floor the same anomaly also violates.
// ---------------------------------------------------------------------------
test('positive control (pre-159 fixture): 353114.2% APY / $576,877 TVL breaches BOTH apy-rail-breach and tvl-floor-claim', () => {
  const file = writeFixture('llms.txt', [
    '# DeFi Garden',
    '',
    '## Current Top Yields',
    'TL;DR: Live highest APY opportunities (updated daily, TVL ≥ $10M).',
    poolLine('353114.2', '$576,877'),
    poolLine('47.7', '$112,870,949'),
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(result.scanned === 1, `expected scanned === 1, got ${result.scanned}`);
    const apySuspect = result.suspects.find((s) => s.signal === 'apy-rail-breach');
    assertT(apySuspect, `expected an apy-rail-breach suspect; got: ${JSON.stringify(result.suspects)}`);
    assertT(apySuspect.severity === 'P0', `apy-rail-breach must be P0, got ${apySuspect.severity}`);
    assertT(/353114\.2% APY/.test(apySuspect.detail), `detail must quote the real offending figure verbatim: ${apySuspect.detail}`);
    const tvlSuspect = result.suspects.find((s) => s.signal === 'tvl-floor-claim');
    assertT(tvlSuspect, `expected a tvl-floor-claim suspect; got: ${JSON.stringify(result.suspects)}`);
    assertT(tvlSuspect.severity === 'P1', `tvl-floor-claim must be P1, got ${tvlSuspect.severity}`);
    assertT(tvlSuspect.detail.includes('$576,877'), `tvl-floor-claim detail must quote the sub-floor figure: ${tvlSuspect.detail}`);
  } finally { cleanupFixtures(); }
});

test('real surface: the CURRENT committed llms.txt + llms-full.txt produce ZERO apy-rail-breach (159 already merged)', () => {
  const result = prescanTextSurfaces();
  assertT(result.scanned === 2, `expected scanned === 2 (llms.txt + llms-full.txt), got ${result.scanned}`);
  const apyHits = result.suspects.filter((s) => s.signal === 'apy-rail-breach');
  assertT(apyHits.length === 0, `expected zero apy-rail-breach suspects on the real committed surfaces; got: ${JSON.stringify(apyHits)}`);
});

// ---------------------------------------------------------------------------
// Negative control — every figure in-rail, floor respected: zero findings.
// ---------------------------------------------------------------------------
test('negative control: an all-in-rail fixture produces zero findings of any signal', () => {
  const file = writeFixture('llms.txt', [
    '## Current Top Yields',
    'TL;DR: Live highest APY opportunities (updated daily, TVL ≥ $10M).',
    poolLine('47.7', '$112,870,949'),
    // Distinct URL from the line above (backlog 169: poolLine()'s fixed
    // WETH-USDC/Base URL would otherwise make two DIFFERENT figures share
    // one URL, which is now a real link-target-integrity rule-(c) defect —
    // not a false positive, but not what THIS pre-existing case is testing).
    poolLine('12.3', '$25,000,000').replace('WETH-USDC&chain=Base', 'SOL-USDC&chain=Solana'),
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(result.suspects.length === 0, `expected zero suspects, got: ${JSON.stringify(result.suspects)}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// Boundary — exactly 1000.0% APY must NOT trigger; 1000.1% APY must.
// ---------------------------------------------------------------------------
test('boundary: exactly 1000.0% APY does not trigger apy-rail-breach', () => {
  const file = writeFixture('llms.txt', poolLine('1000.0', '$50,000,000') + '\n');
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(!result.suspects.some((s) => s.signal === 'apy-rail-breach'),
      `1000.0% APY must not trigger apy-rail-breach; got: ${JSON.stringify(result.suspects)}`);
  } finally { cleanupFixtures(); }
});

test('boundary: 1000.1% APY DOES trigger apy-rail-breach', () => {
  const file = writeFixture('llms.txt', poolLine('1000.1', '$50,000,000') + '\n');
  try {
    const result = prescanTextSurfaces({ files: [file] });
    const hit = result.suspects.find((s) => s.signal === 'apy-rail-breach');
    assertT(hit, `1000.1% APY must trigger apy-rail-breach; got: ${JSON.stringify(result.suspects)}`);
    assertT(/1000\.1% APY/.test(hit.detail), `detail must quote the offending figure: ${hit.detail}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// empty-surface — headings but zero pool lines.
// ---------------------------------------------------------------------------
test('empty-surface: a fixture with headings but zero pool lines emits P1 empty-surface', () => {
  const file = writeFixture('llms.txt', [
    '# DeFi Garden',
    '## Homepage',
    'TL;DR: Main dashboard.',
    '- https://www.defi.garden/',
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    const hit = result.suspects.find((s) => s.signal === 'empty-surface');
    assertT(hit, `expected an empty-surface suspect; got: ${JSON.stringify(result.suspects)}`);
    assertT(hit.severity === 'P1', `empty-surface must be P1, got ${hit.severity}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// broken-number-literal — NaN/undefined where a number belongs.
// ---------------------------------------------------------------------------
test('broken-number-literal: NaN in a pool line emits P0 quoting the token', () => {
  const file = writeFixture('llms.txt', poolLine('NaN', '$50,000,000') + '\n');
  try {
    const result = prescanTextSurfaces({ files: [file] });
    const hit = result.suspects.find((s) => s.signal === 'broken-number-literal');
    assertT(hit, `expected a broken-number-literal suspect; got: ${JSON.stringify(result.suspects)}`);
    assertT(hit.severity === 'P0', `broken-number-literal must be P0, got ${hit.severity}`);
    assertT(hit.detail.includes('NaN'), `detail must quote the matched token: ${hit.detail}`);
  } finally { cleanupFixtures(); }
});

test('broken-number-literal: undefined where a number belongs emits P0', () => {
  const file = writeFixture('llms.txt', '- Base · x · Y — undefined% APY, $50,000,000 TVL — https://x\n');
  try {
    const result = prescanTextSurfaces({ files: [file] });
    const hit = result.suspects.find((s) => s.signal === 'broken-number-literal');
    assertT(hit, `expected a broken-number-literal suspect; got: ${JSON.stringify(result.suspects)}`);
    assertT(hit.detail.includes('undefined'), `detail must quote the matched token: ${hit.detail}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// Aggregate shape — many (>10) breaching figures in one file still yields
// exactly ONE apy-rail-breach suspect, quoted list capped at 3.
// ---------------------------------------------------------------------------
test('aggregate shape: >10 breaching figures in one file still yields exactly ONE apy-rail-breach suspect, capped at 3 quoted', () => {
  const lines = [];
  for (let i = 0; i < 15; i++) lines.push(poolLine((1000 + i + 0.5).toFixed(1), '$50,000,000'));
  const file = writeFixture('llms.txt', lines.join('\n') + '\n');
  try {
    const result = prescanTextSurfaces({ files: [file] });
    const apyHits = result.suspects.filter((s) => s.signal === 'apy-rail-breach');
    assertT(apyHits.length === 1, `expected exactly ONE apy-rail-breach suspect regardless of figure count, got ${apyHits.length}`);
    const quoted = (apyHits[0].detail.match(/% APY"/g) || []).length;
    assertT(quoted <= 3, `expected at most 3 quoted figures in the suspect detail, got ${quoted}: ${apyHits[0].detail}`);
    assertT(apyHits[0].detail.startsWith('15 APY figures'), `detail must state the real total count (15): ${apyHits[0].detail}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// tvl-floor-claim scoping — a stated floor with no violation, and the
// deliberate "aggregate chain TVL is not a pool-floor claim" exclusion.
// ---------------------------------------------------------------------------
test('tvl-floor-claim: a stated floor respected by every listed figure in its own section emits nothing', () => {
  const file = writeFixture('llms.txt', [
    '## Current Top Yields',
    'TL;DR: Live highest APY opportunities (updated daily, TVL ≥ $10M).',
    poolLine('47.7', '$112,870,949'),
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(!result.suspects.some((s) => s.signal === 'tvl-floor-claim'),
      `expected no tvl-floor-claim suspect; got: ${JSON.stringify(result.suspects)}`);
  } finally { cleanupFixtures(); }
});

test('tvl-floor-claim: a sub-floor figure in a DIFFERENT section (e.g. aggregate chain TVL) does not count against the floor', () => {
  const file = writeFixture('llms.txt', [
    '## Top Chains by TVL',
    'TL;DR: Highest liquidity blockchain networks.',
    '- SomeSmallChain ($1M TVL) — https://www.defi.garden/?chain=SomeSmallChain',
    '',
    '## Current Top Yields',
    'TL;DR: Live highest APY opportunities (updated daily, TVL ≥ $10M).',
    poolLine('47.7', '$112,870,949'),
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(!result.suspects.some((s) => s.signal === 'tvl-floor-claim'),
      `an aggregate chain TVL in a different section must not count against the pool floor; got: ${JSON.stringify(result.suspects)}`);
  } finally { cleanupFixtures(); }
});

test('tvl-floor-claim: no stated floor emits nothing (not a defect)', () => {
  const file = writeFixture('llms.txt', poolLine('12.3', '$500,000') + '\n');
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(!result.suspects.some((s) => s.signal === 'tvl-floor-claim'),
      `no stated floor must not be flagged; got: ${JSON.stringify(result.suspects)}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// Missing file — never throws, does not count toward scanned.
// ---------------------------------------------------------------------------
test('missing file: opts.files pointing at a nonexistent path does not throw, scanned === 0', () => {
  let result;
  assert.doesNotThrow(() => { result = prescanTextSurfaces({ files: ['does-not-exist-160.txt'] }); });
  assertT(result.scanned === 0, `expected scanned === 0, got ${result.scanned}`);
  assertT(result.suspects.length === 0, `expected zero suspects, got: ${JSON.stringify(result.suspects)}`);
});

// ---------------------------------------------------------------------------
// Runtime — the pass over the two REAL committed files completes in < 1s.
// ---------------------------------------------------------------------------
test('runtime: prescanTextSurfaces() over the real committed files completes in < 1000ms', () => {
  const start = Date.now();
  prescanTextSurfaces();
  const elapsed = Date.now() - start;
  assertT(elapsed < 1000, `expected < 1000ms, took ${elapsed}ms`);
});

// ---------------------------------------------------------------------------
// link-target-integrity (backlog 169) — three sub-rules over defi.garden
// links only: (a) unrouted query key (parsed live out of home.html), (b)
// pool row -> bare origin, (c) one URL stating two different figure sets.
//
// Positive control uses REAL pre-166 bytes (`git show 3935e8d05:llms.txt` /
// `:llms-full.txt`, the commit immediately before aff271c79's fix), TRIMMED
// under test-fixtures/pre166/ (llms-full.txt pre-166 is 209KB — too large to
// commit whole) with a provenance header comment in each fixture. A separate
// "opportunistic full-file control" below re-derives the FULL files straight
// from `git show` at test time and asserts the exact measured ground truth
// (spec 169 Evidence table) whenever git is available in this harness.
// ---------------------------------------------------------------------------
const PRE166_SHA = '3935e8d05'; // commit immediately before aff271c79 (166's fix)
const PRE166_DIR = path.join(ROOT, 'test-fixtures', 'pre166');
const PRE166_LLMS = path.join(PRE166_DIR, 'llms-pre166.txt');
const PRE166_LLMS_FULL = path.join(PRE166_DIR, 'llms-full-pre166.txt');

// Extracts the "e.g. "..." | "..."" example list out of a suspect's detail
// string (the shared join format all three sub-rules use below), so tests
// can assert on the real example COUNT without retyping the whole string.
// Strips ALL trailing "(+... more ...)" tails (rule (c) can append TWO —
// one for extra figures on the worst URL, one for extra conflicting URLs —
// not just the single tail (a)/(b) use).
function detailExampleCount(detail) {
  const idx = detail.indexOf('e.g. ');
  if (idx === -1) return 0;
  const rest = detail.slice(idx + 'e.g. '.length).replace(/(?: \(\+[^)]*\))+$/, '');
  return rest.split(' | ').length;
}

test('link-target-integrity: positive control (committed pre-166 llms.txt excerpt) — rule (a) fires on the unrouted "search" key, rule (c) fires on the shared WETH-USDC/Base URL, rule (b) stays clean', () => {
  const result = prescanTextSurfaces({ files: [PRE166_LLMS] });
  const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
  assertT(hits.length === 2, `expected exactly 2 link-target-integrity suspects (rules a+c; b is clean on llms.txt), got ${hits.length}: ${JSON.stringify(hits)}`);
  for (const h of hits) assertT(h.severity === 'P1', `link-target-integrity must be P1, got ${h.severity}`);
  const ruleA = hits.find((h) => /outside ANALYTICS_PARAMS/.test(h.detail));
  assertT(ruleA, `expected a rule-(a) suspect; got: ${JSON.stringify(hits)}`);
  assertT(/^7 /.test(ruleA.detail), `expected the real measured count (7 search= links), got: ${ruleA.detail}`);
  assertT(ruleA.detail.includes('"search"'), `detail must quote the offending key "search": ${ruleA.detail}`);
  const ruleC = hits.find((h) => /stating DIFFERENT figures/.test(h.detail));
  assertT(ruleC, `expected a rule-(c) suspect; got: ${JSON.stringify(hits)}`);
  assertT(ruleC.detail.includes('?token=WETH-USDC&chain=Base'), `detail must quote the shared URL: ${ruleC.detail}`);
  assertT(/^1 /.test(ruleC.detail), `expected exactly 1 conflicting URL in this file (the leading total, not the figure-set count), got: ${ruleC.detail}`);
  assertT(ruleC.detail.includes('(2 distinct figure sets)'), `expected the worst URL's own figure-set count (2) quoted, got: ${ruleC.detail}`);
  assertT(!hits.some((h) => /bare defi\.garden origin/.test(h.detail)), 'rule (b) must stay clean on llms.txt (its bare-origin links sit on non-pool-shaped lines)');
});

test('link-target-integrity: positive control (committed pre-166 llms-full.txt excerpt) — all three sub-rules fire matching the measured ground truth (10/15/15), detail capped at <=3 examples', () => {
  const result = prescanTextSurfaces({ files: [PRE166_LLMS_FULL] });
  const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
  assertT(hits.length === 3, `expected exactly 3 link-target-integrity suspects (one per sub-rule), got ${hits.length}: ${JSON.stringify(hits)}`);
  const ruleA = hits.find((h) => /outside ANALYTICS_PARAMS/.test(h.detail));
  const ruleB = hits.find((h) => /bare defi\.garden origin/.test(h.detail));
  const ruleC = hits.find((h) => /stating DIFFERENT figures/.test(h.detail));
  assertT(ruleA && ruleB && ruleC, `expected all three sub-rules to fire; got: ${JSON.stringify(hits)}`);
  assertT(/^10 /.test(ruleA.detail), `expected the real measured count (10 search= links), got: ${ruleA.detail}`);
  assertT(ruleA.detail.includes('"search"'), `detail must quote the offending key: ${ruleA.detail}`);
  assertT(/^15 /.test(ruleB.detail), `expected the real measured count (15 bare-origin pool rows), got: ${ruleB.detail}`);
  assertT(detailExampleCount(ruleB.detail) <= 3, `expected <=3 quoted examples, got: ${ruleB.detail}`);
  assertT(ruleB.detail.includes('(+12 more)'), `expected the overflow note for the remaining 12 rows: ${ruleB.detail}`);
  assertT(/^1 /.test(ruleC.detail), `expected exactly 1 conflicting URL in this file (the bare origin alone), got: ${ruleC.detail}`);
  assertT(ruleC.detail.includes('(15 distinct figure sets)'), `expected the worst URL's own figure-set count (15) quoted, got: ${ruleC.detail}`);
  assertT(ruleC.detail.includes('"https://www.defi.garden"'), `detail must quote the shared (bare-origin) URL: ${ruleC.detail}`);
  assertT(detailExampleCount(ruleC.detail) <= 3, `expected <=3 quoted examples, got: ${ruleC.detail}`);
  assertT(!/more conflicting URL/.test(ruleC.detail), `only 1 conflicting URL exists here — no "more conflicting URLs" tail should appear: ${ruleC.detail}`);
});

test('link-target-integrity: TRUE NEGATIVE — the real committed llms.txt + llms-full.txt on this branch produce ZERO link-target-integrity suspects', () => {
  const result = prescanTextSurfaces();
  const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
  assertT(hits.length === 0, `expected zero link-target-integrity suspects on the real committed surfaces; got: ${JSON.stringify(hits)}`);
});

// Opportunistic full-file control: re-derives the FULL pre-166 bytes at test
// time via `git show` (never re-typed, never trimmed) and asserts on the
// exact measured ground truth. Only the `git show` calls are skippable (a
// git-less harness) — a git failure prints a note and returns without ever
// touching `passed`/`failed`, exactly like the browser integration case
// below; a genuine assertion failure once git succeeds must still go RED.
function tryPre166FullFileControl() {
  let llmsFull, llmsFullFullPath;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-text-surfaces-pre166-full-'));
  try {
    const llmsContent = execSync(`git show ${PRE166_SHA}:llms.txt`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 });
    const llmsFullContent = execSync(`git show ${PRE166_SHA}:llms-full.txt`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 });
    const llmsPath = path.join(dir, 'llms.txt');
    llmsFullFullPath = path.join(dir, 'llms-full.txt');
    fs.writeFileSync(llmsPath, llmsContent);
    fs.writeFileSync(llmsFullFullPath, llmsFullContent);
    llmsFull = llmsPath;
  } catch (err) {
    console.log('  (skipped) opportunistic full-file pre-166 control — git unavailable in this harness: ' + err.message.split('\n')[0]);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    return;
  }

  test(`opportunistic full-file control: the REAL git show ${PRE166_SHA}:llms.txt (full bytes) matches the measured ground truth (7 search=, 1 shared URL w/ 2 figure sets, clean under rule b)`, () => {
    const result = prescanTextSurfaces({ files: [llmsFull] });
    const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
    assertT(hits.length === 2, `expected exactly 2 suspects (a+c), got ${hits.length}: ${JSON.stringify(hits)}`);
    assertT(hits.some((h) => /^7 /.test(h.detail) && h.detail.includes('"search"')), `expected a rule-(a) suspect quoting 7 and "search": ${JSON.stringify(hits)}`);
    assertT(hits.some((h) => /^1 /.test(h.detail) && h.detail.includes('(2 distinct figure sets)') && h.detail.includes('?token=WETH-USDC&chain=Base')), `expected a rule-(c) suspect: 1 conflicting URL total, worst = the WETH-USDC/Base URL with 2 figure sets: ${JSON.stringify(hits)}`);
  });

  // Both fixture files share one tmpdir (`dir`) — cleanup waits until AFTER
  // the second case, not in the first case's own finally (that deleted the
  // still-needed llms-full.txt out from under this test on the first pass).
  test(`opportunistic full-file control: the REAL git show ${PRE166_SHA}:llms-full.txt (full 209KB bytes) matches the measured ground truth (10 search=, 15 bare-origin rows, 15 figure sets sharing the bare origin)`, () => {
    try {
      const result = prescanTextSurfaces({ files: [llmsFullFullPath] });
      const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
      assertT(hits.length === 3, `expected exactly 3 suspects (a+b+c), got ${hits.length}: ${JSON.stringify(hits)}`);
      assertT(hits.some((h) => /^10 /.test(h.detail) && h.detail.includes('"search"')), `expected a rule-(a) suspect quoting 10 and "search": ${JSON.stringify(hits)}`);
      assertT(hits.some((h) => /^15 /.test(h.detail) && /bare defi\.garden origin/.test(h.detail)), `expected a rule-(b) suspect quoting 15: ${JSON.stringify(hits)}`);
      assertT(hits.some((h) => /^1 /.test(h.detail) && h.detail.includes('(15 distinct figure sets)') && h.detail.includes('"https://www.defi.garden"')), `expected a rule-(c) suspect: 1 conflicting URL total, worst = the bare origin with 15 figure sets: ${JSON.stringify(hits)}`);
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  });
}
tryPre166FullFileControl();

// ---------------------------------------------------------------------------
// Rule (a) isolated — clean when every query key is a real router param;
// caps its quoted key list at 3 distinct keys.
// ---------------------------------------------------------------------------
test('link-target-integrity rule (a): every query key a real router param emits nothing', () => {
  const file = writeFixture('llms.txt', [
    '## Current Top Yields',
    poolLine('12.3', '$50,000,000').replace('WETH-USDC&chain=Base', 'WETH-USDC&chain=Base&pool=abc123'),
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(!result.suspects.some((s) => s.signal === 'link-target-integrity'),
      `expected no link-target-integrity suspect for all-routed keys; got: ${JSON.stringify(result.suspects)}`);
  } finally { cleanupFixtures(); }
});

test('link-target-integrity rule (a): more than 3 distinct unrouted keys caps the quoted list at 3 with a "(+N more)" note', () => {
  const file = writeFixture('llms.txt', [
    '- https://www.defi.garden/?zzz1=1',
    '- https://www.defi.garden/?zzz2=1',
    '- https://www.defi.garden/?zzz3=1',
    '- https://www.defi.garden/?zzz4=1',
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    const hit = result.suspects.find((s) => s.signal === 'link-target-integrity' && /outside ANALYTICS_PARAMS/.test(s.detail));
    assertT(hit, `expected a rule-(a) suspect; got: ${JSON.stringify(result.suspects)}`);
    assertT(/^4 /.test(hit.detail), `expected the real link count (4), got: ${hit.detail}`);
    const quoted = (hit.detail.match(/"zzz\d"/g) || []).length;
    assertT(quoted === 3, `expected exactly 3 quoted keys, got ${quoted}: ${hit.detail}`);
    assertT(hit.detail.includes('(+1 more)'), `expected the overflow note for the 4th distinct key: ${hit.detail}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// Rule (b) isolated — a bare-origin pool row is a defect; a pool row linking
// anywhere else (even just a trailing path/query) is not.
// ---------------------------------------------------------------------------
test('link-target-integrity rule (b): a pool-shaped line whose only defi.garden link is the bare origin emits exactly one suspect quoting that row', () => {
  const file = writeFixture('llms.txt', [
    '- Base · uniswap-v3 · WETH-USDC — 47.7% APY, $112,870,949 TVL — https://www.defi.garden',
    '- Solana · orca-dex · SOL-USDC — 12.3% APY, $25,000,000 TVL — https://www.defi.garden/?pool=real-id-1',
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /bare defi\.garden origin/.test(s.detail));
    assertT(hits.length === 1, `expected exactly one rule-(b) suspect for the file, got ${hits.length}: ${JSON.stringify(hits)}`);
    assertT(/^1 /.test(hits[0].detail), `expected the real bare-origin row count (1), got: ${hits[0].detail}`);
    assertT(hits[0].detail.includes('WETH-USDC'), `detail must quote the offending row: ${hits[0].detail}`);
    assertT(!hits[0].detail.includes('SOL-USDC'), `the properly-linked row must not be quoted as an offender: ${hits[0].detail}`);
  } finally { cleanupFixtures(); }
});

test('link-target-integrity rule (b): a pool-shaped line linking to the bare origin WITH a trailing slash also counts', () => {
  const file = writeFixture('llms.txt', poolLine('47.7', '$112,870,949').replace(/https:\/\/www\.defi\.garden\/\?.*$/, 'https://www.defi.garden/') + '\n');
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(result.suspects.some((s) => s.signal === 'link-target-integrity' && /bare defi\.garden origin/.test(s.detail)),
      `expected the trailing-slash bare origin to count as bare; got: ${JSON.stringify(result.suspects)}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// Rule (c) isolated — two DIFFERENT figure sets sharing a URL is a defect;
// verbatim-identical rows sharing a URL are explicitly NOT (spec 169 §c).
// ---------------------------------------------------------------------------
test('link-target-integrity rule (c): two pool rows sharing one URL with DIFFERENT figures emits a suspect quoting the URL', () => {
  const url = 'https://www.defi.garden/?token=WETH-USDC&chain=Base';
  const file = writeFixture('llms.txt', [
    `- Base · uniswap-v3 · WETH-USDC — 91.5% APY, $110,855,239 TVL — ${url}`,
    `- Base · uniswap-v3 · WETH-USDC — 31.1% APY, $10,191,604 TVL — ${url}`,
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    const hit = result.suspects.find((s) => s.signal === 'link-target-integrity' && /stating DIFFERENT figures/.test(s.detail));
    assertT(hit, `expected a rule-(c) suspect; got: ${JSON.stringify(result.suspects)}`);
    assertT(hit.detail.includes(url), `detail must quote the shared URL: ${hit.detail}`);
    assertT(/^1 /.test(hit.detail), `expected exactly 1 conflicting URL (the leading total), got: ${hit.detail}`);
    assertT(hit.detail.includes('(2 distinct figure sets)'), `expected the worst URL's own figure-set count (2), got: ${hit.detail}`);
  } finally { cleanupFixtures(); }
});

test('link-target-integrity rule (c): two pool rows sharing one URL with VERBATIM-IDENTICAL figures is NOT a defect', () => {
  const url = 'https://www.defi.garden/?token=WETH-USDC&chain=Base';
  const file = writeFixture('llms.txt', [
    `- Base · uniswap-v3 · WETH-USDC — 47.7% APY, $112,870,949 TVL — ${url}`,
    `- Base · uniswap-v3 · WETH-USDC — 47.7% APY, $112,870,949 TVL — ${url}`,
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(!result.suspects.some((s) => s.signal === 'link-target-integrity' && /stating DIFFERENT figures/.test(s.detail)),
      `two verbatim-identical rows repeating one URL must not be flagged; got: ${JSON.stringify(result.suspects)}`);
  } finally { cleanupFixtures(); }
});

test('link-target-integrity rule (c): two pool rows with DIFFERENT figures pointing at DIFFERENT URLs emits nothing (not a shared-URL case)', () => {
  const file = writeFixture('llms.txt', [
    poolLine('91.5', '$110,855,239'),
    '- Solana · orca-dex · SOL-USDC — 54.8% APY, $25,485,395 TVL — https://www.defi.garden/?token=SOL-USDC&chain=Solana',
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    assertT(!result.suspects.some((s) => s.signal === 'link-target-integrity' && /stating DIFFERENT figures/.test(s.detail)),
      `two different pools at two different URLs must not be flagged; got: ${JSON.stringify(result.suspects)}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// Verifier-found gap (post-ship): rule (c) used to `break` at the FIRST
// conflicting URL group, silently dropping any additional ones — no count,
// no "+N more". This pins the fix: TWO INDEPENDENT conflicting-URL groups in
// one file must still yield exactly ONE rule-(c) suspect, but its detail
// must name the TRUE TOTAL (2), not just the first group found. Asserted on
// the total number itself (not substring presence) — that is the whole
// point: the second group is no longer invisible.
// ---------------------------------------------------------------------------
test('link-target-integrity rule (c): TWO independent conflicting-URL groups in one file still yield exactly ONE suspect, whose detail states the TRUE TOTAL (2) and the worst (largest) group', () => {
  const urlA = 'https://www.defi.garden/?token=WETH-USDC&chain=Base'; // 3 distinct figure sets -> the "worst" group
  const urlB = 'https://www.defi.garden/?token=SOL-USDC&chain=Solana'; // 2 distinct figure sets -> the smaller group
  const file = writeFixture('llms.txt', [
    `- Base · uniswap-v3 · WETH-USDC — 91.5% APY, $110,855,239 TVL — ${urlA}`,
    `- Base · uniswap-v3 · WETH-USDC — 31.1% APY, $10,191,604 TVL — ${urlA}`,
    `- Base · uniswap-v3 · WETH-USDC — 47.7% APY, $50,000,000 TVL — ${urlA}`,
    `- Solana · orca-dex · SOL-USDC — 54.8% APY, $25,485,395 TVL — ${urlB}`,
    `- Solana · orca-dex · SOL-USDC — 12.3% APY, $10,000,000 TVL — ${urlB}`,
    ''
  ].join('\n'));
  try {
    const result = prescanTextSurfaces({ files: [file] });
    const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity' && /stating DIFFERENT figures/.test(s.detail));
    assertT(hits.length === 1, `expected exactly ONE rule-(c) suspect (one-suspect-per-file-per-sub-rule), got ${hits.length}: ${JSON.stringify(hits)}`);
    const detail = hits[0].detail;
    // The number itself, not just "some mention of 2" — this is the gap: the
    // OLD code's leading number was the winning URL's figure-set count (3),
    // which would have silently matched an assertion for "3" here too. The
    // real fix is that the LEADING number is the total conflicting-URL count.
    assertT(/^2\b/.test(detail), `expected the leading total to be 2 (both conflicting URL groups counted), got: ${detail}`);
    assertT(detail.includes(urlA), `expected the worst (largest) group's URL quoted: ${detail}`);
    assertT(detail.includes('(3 distinct figure sets)'), `expected the worst group's own figure-set count (3): ${detail}`);
    assertT(/\(\+1 more conflicting URL\)/.test(detail), `expected a "+1 more conflicting URL" tail naming the second group's existence: ${detail}`);
  } finally { cleanupFixtures(); }
});

// ---------------------------------------------------------------------------
// Coupling proof (spec 169's own required test) — rule (a)'s allowlist is
// LIVE-parsed from home.html, not a second hardcoded copy: appending a param
// to a COPIED home.html's ANALYTICS_PARAMS must flip a URL using that param
// from suspect to clean, with no other change.
// ---------------------------------------------------------------------------
test('link-target-integrity rule (a) coupling proof: appending a param to a copied home.html flips a URL using it from suspect to clean', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-text-surfaces-coupling-'));
  const homeHtmlCopy = path.join(dir, 'home.html');
  const homeHtmlOriginal = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8');
  const ORIGINAL_DECL = "var ANALYTICS_PARAMS = ['token', 'chain', 'pool', 'poolTypes', 'protocols', 'minTvl', 'minApy', 'app'];";
  assertT(homeHtmlOriginal.includes(ORIGINAL_DECL), 'fixture wiring check: home.html:77 must match the literal ANALYTICS_PARAMS declaration this test rewrites — home.html moved out from under this test');
  const surfaceFile = writeFixture('llms.txt', '- Base · uniswap-v3 · WETH-USDC — 12.3% APY, $50,000,000 TVL — https://www.defi.garden/?token=WETH-USDC&zzzCustomParam=1\n');
  try {
    fs.writeFileSync(homeHtmlCopy, homeHtmlOriginal);
    const before = prescanTextSurfaces({ files: [surfaceFile], homeHtml: homeHtmlCopy });
    const beforeHit = before.suspects.find((s) => s.signal === 'link-target-integrity' && s.detail.includes('zzzCustomParam'));
    assertT(beforeHit, `expected zzzCustomParam to be flagged before it is added to ANALYTICS_PARAMS; got: ${JSON.stringify(before.suspects)}`);

    const modified = homeHtmlOriginal.replace(ORIGINAL_DECL,
      "var ANALYTICS_PARAMS = ['token', 'chain', 'pool', 'poolTypes', 'protocols', 'minTvl', 'minApy', 'app', 'zzzCustomParam'];");
    fs.writeFileSync(homeHtmlCopy, modified);
    const after = prescanTextSurfaces({ files: [surfaceFile], homeHtml: homeHtmlCopy });
    const afterHit = after.suspects.find((s) => s.signal === 'link-target-integrity' && s.detail.includes('zzzCustomParam'));
    assertT(!afterHit, `zzzCustomParam must be clean once it is a real ANALYTICS_PARAMS member — parsing must be LIVE, not hardcoded; got: ${JSON.stringify(after.suspects)}`);
  } finally {
    cleanupFixtures();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
});

// ---------------------------------------------------------------------------
// Degrade safely (spec 169's own required behavior) — an unreadable or
// unparseable home.html skips rule (a) with a stderr note, never throws,
// and leaves rules (b)/(c) and all four pre-existing signals working.
// ---------------------------------------------------------------------------
test('link-target-integrity rule (a) degrades safely: an UNREADABLE home.html skips rule (a) (stderr note, no throw); rule (b) and apy-rail-breach still fire', () => {
  const file = writeFixture('llms.txt', [
    poolLine('1500.0', '$50,000,000'), // apy-rail-breach (pre-existing signal)
    '- Base · uniswap-v3 · WETH-USDC — 12.3% APY, $50,000,000 TVL — https://www.defi.garden', // rule (b): bare origin
    '- https://www.defi.garden/?zzzUnrouted=1', // would be rule (a) if home.html were readable
    ''
  ].join('\n'));
  const originalError = console.error;
  const stderrLines = [];
  console.error = (msg) => { stderrLines.push(String(msg)); };
  try {
    let result;
    assert.doesNotThrow(() => {
      result = prescanTextSurfaces({ files: [file], homeHtml: path.join(ROOT, 'does-not-exist-169-home.html') });
    });
    assertT(stderrLines.some((l) => /link-target-integrity rule \(a\) skipped/.test(l)), `expected a stderr note naming rule (a); got: ${JSON.stringify(stderrLines)}`);
    assertT(result.suspects.some((s) => s.signal === 'apy-rail-breach'), `pre-existing apy-rail-breach must still fire; got: ${JSON.stringify(result.suspects)}`);
    assertT(result.suspects.some((s) => s.signal === 'link-target-integrity' && /bare defi\.garden origin/.test(s.detail)), `rule (b) must still fire; got: ${JSON.stringify(result.suspects)}`);
    assertT(!result.suspects.some((s) => s.signal === 'link-target-integrity' && /outside ANALYTICS_PARAMS/.test(s.detail)), `rule (a) must NOT fire (home.html was unreadable) — a bad key must not be silently checked against an empty/default allowlist; got: ${JSON.stringify(result.suspects)}`);
  } finally {
    console.error = originalError;
    cleanupFixtures();
  }
});

test('link-target-integrity rule (a) degrades safely: an UNPARSEABLE home.html (no ANALYTICS_PARAMS/PLANNER_PARAMS) skips rule (a); rules (b)/(c) still work', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-text-surfaces-badhome-'));
  const badHomeHtml = path.join(dir, 'home.html');
  fs.writeFileSync(badHomeHtml, '<html><body>no router arrays here</body></html>');
  const file = writeFixture('llms.txt', '- https://www.defi.garden/?zzzUnrouted=1\n');
  const originalError = console.error;
  const stderrLines = [];
  console.error = (msg) => { stderrLines.push(String(msg)); };
  try {
    let result;
    assert.doesNotThrow(() => {
      result = prescanTextSurfaces({ files: [file], homeHtml: badHomeHtml });
    });
    assertT(stderrLines.some((l) => /link-target-integrity rule \(a\) skipped/.test(l)), `expected a stderr note naming rule (a); got: ${JSON.stringify(stderrLines)}`);
    assertT(!result.suspects.some((s) => s.signal === 'link-target-integrity' && /outside ANALYTICS_PARAMS/.test(s.detail)), `rule (a) must NOT fire when home.html can't be parsed; got: ${JSON.stringify(result.suspects)}`);
  } finally {
    console.error = originalError;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    cleanupFixtures();
  }
});

// ---------------------------------------------------------------------------
// One-suspect-per-file-per-sub-rule cap, proven directly (not just implied
// by the pre-166 fixtures above): a fixture with defects in ALL three
// sub-rules yields exactly 3 link-target-integrity suspects, never more.
// ---------------------------------------------------------------------------
test('link-target-integrity: a file breaching all three sub-rules yields exactly 3 suspects (one per sub-rule), never a suspect per bad row', () => {
  const result = prescanTextSurfaces({ files: [PRE166_LLMS_FULL] });
  const hits = result.suspects.filter((s) => s.signal === 'link-target-integrity');
  assertT(hits.length === 3, `expected exactly 3 (never 25 = 10+15+15), got ${hits.length}: ${JSON.stringify(hits)}`);
});

// ---------------------------------------------------------------------------
// Integration — runAudit({ only: ['text-surfaces'] }) end-to-end, IF chromium
// can launch in this sandbox (spec 160 step 4: try it with a hard timeout;
// drop it rather than let it hang if chromium is unavailable here).
// ---------------------------------------------------------------------------
async function tryIntegrationCase() {
  const outPath = path.join(os.tmpdir(), `audit-findings-text-surfaces-${process.pid}.json`);
  const timeoutMs = 90000;
  let timer;
  let result;

  // ONLY the run itself may be skipped, and only for an environment gap
  // (playwright unresolvable / chromium won't launch / the hard timeout).
  // The assertions below deliberately sit OUTSIDE this catch: a wiring
  // regression — 'text-surfaces' missing from surfacesCovered, an unpopulated
  // result.textSurfaces, or opts.only leakage — must go RED, not report
  // itself as "(skipped)". A check that cannot fail is the exact defect class
  // this whole item exists to close (verifier note, 2026-07-27).
  try {
    result = await Promise.race([
      runAudit({ port: 8940, only: ['text-surfaces'], outPath }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('integration case exceeded 90s hard timeout')), timeoutMs); })
    ]);
  } catch (err) {
    console.log('  (skipped) integration case — could not run the audit here: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/160-notes.md');
    return;
  } finally {
    clearTimeout(timer);
  }

  test('integration: runAudit({ only: [\'text-surfaces\'] }) covers text-surfaces and populates result.textSurfaces', () => {
    try {
      assertT(result.surfacesCovered.includes('text-surfaces'),
        `expected surfacesCovered to include "text-surfaces"; got ${JSON.stringify(result.surfacesCovered)}`);
      assertT(result.textSurfaces && typeof result.textSurfaces.scanned === 'number',
        `expected result.textSurfaces to be populated; got ${JSON.stringify(result.textSurfaces)}`);
      // only:['text-surfaces'] matches no rendered surface name, so nothing else runs.
      assertT(result.surfacesCovered.length === 1,
        `expected only the text-surfaces entry when scoped via opts.only; got ${JSON.stringify(result.surfacesCovered)}`);
    } finally {
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });
}

async function main() {
  await tryIntegrationCase();
  console.log(`\ntest_audit_text_surfaces.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
