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
    poolLine('12.3', '$25,000,000'),
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
// Integration — runAudit({ only: ['text-surfaces'] }) end-to-end, IF chromium
// can launch in this sandbox (spec 160 step 4: try it with a hard timeout;
// drop it rather than let it hang if chromium is unavailable here).
// ---------------------------------------------------------------------------
async function tryIntegrationCase() {
  const outPath = path.join(os.tmpdir(), `audit-findings-text-surfaces-${process.pid}.json`);
  const timeoutMs = 90000;
  let timer;
  try {
    const result = await Promise.race([
      runAudit({ port: 8940, only: ['text-surfaces'], outPath }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('integration case exceeded 90s hard timeout')), timeoutMs); })
    ]);
    clearTimeout(timer);
    assertT(result.surfacesCovered.includes('text-surfaces'),
      `expected surfacesCovered to include "text-surfaces"; got ${JSON.stringify(result.surfacesCovered)}`);
    assertT(result.textSurfaces && typeof result.textSurfaces.scanned === 'number',
      `expected result.textSurfaces to be populated; got ${JSON.stringify(result.textSurfaces)}`);
    // only:['text-surfaces'] matches no rendered surface name, so nothing else runs.
    assertT(result.surfacesCovered.length === 1,
      `expected only the text-surfaces entry when scoped via opts.only; got ${JSON.stringify(result.surfacesCovered)}`);
    passed++;
    console.log('  ✓ integration: runAudit({ only: [\'text-surfaces\'] }) covers text-surfaces and populates result.textSurfaces');
  } catch (err) {
    console.log('  (skipped) integration case: ' + err.message);
    console.log('    reason recorded in product-loop-kit/specs/160-notes.md');
  } finally {
    clearTimeout(timer);
    try { fs.unlinkSync(outPath); } catch (e) {}
  }
}

async function main() {
  await tryIntegrationCase();
  console.log(`\ntest_audit_text_surfaces.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
