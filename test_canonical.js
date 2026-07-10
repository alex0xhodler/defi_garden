/* Unit tests for the canonical-URL pure function (spec 011: "Stop the
   canonical lie"). Run: node test_canonical.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const canonicalFor = require('./canonical.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const ROOT = 'https://www.defi.garden/';

console.log('canonicalFor — analytics mode (self-canonical)');
test('?token=USDC -> self-canonical', () => {
  assert.strictEqual(canonicalFor('?token=USDC'), ROOT + '?token=USDC');
});
test('?chain=Base -> self-canonical', () => {
  assert.strictEqual(canonicalFor('?chain=Base'), ROOT + '?chain=Base');
});
test('?pool=abc-123 -> self-canonical', () => {
  assert.strictEqual(canonicalFor('?pool=abc-123'), ROOT + '?pool=abc-123');
});
test('?poolTypes=single&protocols=aave-v3&minTvl=10000000&minApy=5 -> all kept', () => {
  assert.strictEqual(
    canonicalFor('?poolTypes=single&protocols=aave-v3&minTvl=10000000&minApy=5'),
    ROOT + '?poolTypes=single&protocols=aave-v3&minTvl=10000000&minApy=5'
  );
});

console.log('canonicalFor — lang stripped');
test('?token=USDC&lang=ko -> same canonical as no lang', () => {
  assert.strictEqual(canonicalFor('?token=USDC&lang=ko'), canonicalFor('?token=USDC'));
  assert.strictEqual(canonicalFor('?token=USDC&lang=ko'), ROOT + '?token=USDC');
});
test('?lang=ko alone -> root (no analytics-defining param present)', () => {
  assert.strictEqual(canonicalFor('?lang=ko'), ROOT);
});

console.log('canonicalFor — stable param order');
test('?chain=Base&token=USDC === ?token=USDC&chain=Base', () => {
  const a = canonicalFor('?chain=Base&token=USDC');
  const b = canonicalFor('?token=USDC&chain=Base');
  assert.strictEqual(a, b);
  assert.strictEqual(a, ROOT + '?token=USDC&chain=Base'); // token always precedes chain
});
test('all 7 canonical params, scrambled input order -> fixed output order', () => {
  const scrambled = '?minApy=5&pool=p1&minTvl=1000&token=USDC&protocols=aave&chain=Base&poolTypes=single';
  const expected = ROOT + '?token=USDC&chain=Base&pool=p1&poolTypes=single&protocols=aave&minTvl=1000&minApy=5';
  assert.strictEqual(canonicalFor(scrambled), expected);
});

console.log('canonicalFor — planner-mode URLs collapse to root');
test('bare (empty string) -> root', () => {
  assert.strictEqual(canonicalFor(''), ROOT);
});
test('no argument -> root', () => {
  assert.strictEqual(canonicalFor(), ROOT);
});
test('?goal=retirement&pace=balanced -> root', () => {
  assert.strictEqual(canonicalFor('?goal=retirement&pace=balanced'), ROOT);
});
test('?fresh=1 -> root', () => {
  assert.strictEqual(canonicalFor('?fresh=1'), ROOT);
});
test('?preset=tomoko -> root', () => {
  assert.strictEqual(canonicalFor('?preset=tomoko'), ROOT);
});
test('full planner share URL (goal/monthly/years/pace/capital/fm/dl) -> root', () => {
  assert.strictEqual(
    canonicalFor('?goal=iphone&monthly=200&years=2&pace=stable&capital=5000&fm=capital&dl=2027-01-01'),
    ROOT
  );
});
test('?app=1 (header-icon link to the unfiltered analytics grid) -> root', () => {
  // 'app' forces analytics mode in window.__APP_MODE (home.html's ANALYTICS_PARAMS)
  // but is not a content-defining param here, so the honest canonical for the
  // unfiltered grid is the site root — see canonical.js's design note.
  assert.strictEqual(canonicalFor('?app=1'), ROOT);
});

console.log('canonicalFor — unknown/junk params stripped');
test('?utm_source=twitter&foo=bar -> root', () => {
  assert.strictEqual(canonicalFor('?utm_source=twitter&foo=bar'), ROOT);
});
test('?token=USDC&utm_source=twitter&ref=abc -> junk stripped, token kept', () => {
  assert.strictEqual(canonicalFor('?token=USDC&utm_source=twitter&ref=abc'), ROOT + '?token=USDC');
});
test('?token=USDC&app=1 -> app stripped (not a canonical param), token kept', () => {
  assert.strictEqual(canonicalFor('?token=USDC&app=1'), ROOT + '?token=USDC');
});

console.log('canonicalFor — robustness');
test('leading ? is optional (URLSearchParams handles both forms identically)', () => {
  assert.strictEqual(canonicalFor('token=USDC'), canonicalFor('?token=USDC'));
});
test('idempotent — re-running canonicalFor on its own output query is stable', () => {
  const once = canonicalFor('?chain=Base&token=USDC&lang=ko');
  const queryOnly = once.slice(ROOT.length); // '?token=USDC&chain=Base'
  const twice = canonicalFor(queryOnly);
  assert.strictEqual(once, twice);
});
test('value containing special characters round-trips through encode/decode', () => {
  const result = canonicalFor('?protocols=aave%2Ccompound');
  assert.strictEqual(result, ROOT + '?protocols=aave%2Ccompound');
});

console.log('home.html — no static canonical tag pre-JS (acceptance criterion #1)');
const homeHtml = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
test('home.html source has no static <link rel="canonical"> tag', () => {
  assert.ok(!/<link\s+rel=["']canonical["']/i.test(homeHtml),
    'home.html must not contain a static canonical link — the router must be the only source');
});
// Marker for the REAL invocation (not just any mention of the function name —
// home.html's own explanatory comments legitimately say "calls
// window.__canonicalFor()" too, so indexOf('window.__canonicalFor(') alone
// would false-match prose. This exact assignment only appears at the call site.
const REAL_CALL_SITE = 'var canonicalUrl = window.__canonicalFor(';

test('home.html loads canonical.js synchronously (no defer/async) before the router', () => {
  const scriptTagMatch = homeHtml.match(/<script\s+src=["']canonical\.js["']><\/script>/);
  assert.ok(scriptTagMatch, 'home.html must load canonical.js with a plain synchronous <script src> tag');
  const canonicalIdx = homeHtml.indexOf(scriptTagMatch[0]);
  const routerCallIdx = homeHtml.indexOf(REAL_CALL_SITE);
  assert.ok(routerCallIdx > -1, 'router must call window.__canonicalFor(...)');
  assert.ok(canonicalIdx > -1 && canonicalIdx < routerCallIdx,
    'canonical.js script tag must appear before the router calls window.__canonicalFor');
});
test('router sets canonical unconditionally (not gated inside if(needsAnalytics))', () => {
  const callIdx = homeHtml.indexOf(REAL_CALL_SITE);
  const analyticsGateIdx = homeHtml.indexOf('if (needsAnalytics)');
  assert.ok(callIdx > -1 && analyticsGateIdx > -1, 'both markers must be present');
  assert.ok(callIdx < analyticsGateIdx,
    'window.__canonicalFor(...) must run before the if(needsAnalytics) title/description gate, i.e. unconditionally for both modes');
});

console.log('\nAll ' + passed + ' assertions evaluated.');
