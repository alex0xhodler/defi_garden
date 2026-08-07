/* Plain-lane test for backlog 182 — the CI-baked protocol-URL artifact
   (data/protocol-urls.json, generate-protocol-urls.js) that removes the
   north-star CTA's dependency on the runtime `api.llama.fi/protocols` fetch.

   Three legs, none of which duplicate a hardcoded copy of anything that
   already lives in source:

   (1) Key-transform parity, proven BEHAVIOURALLY and TEXTUALLY. app.js's
       runtime key expression (marked `PROTOCOL_KEY_TRANSFORM`, at the
       dynamic-protocols fetch that builds dynamicProtocolUrls) is located,
       extracted as a string, and turned into a real callable via
       `new Function` — never re-typed by hand. It's run against a battery of
       adversarial names and compared to generate-protocol-urls.js's exported
       `protocolUrlKey`. The two source expressions are also compared as
       normalized text, so a future edit that changes ONE side but not the
       other fails loudly even if some inputs happen to coincide.

   (2) Artifact validity — data/protocol-urls.json parses, has the right
       schema, every URL is https, and keys are sorted (byte-stable output).

   (3) Coverage, measured on the real corpus and PRINTED, with PROTOCOL_URLS
       parsed OUT of app.js (never re-typed): reproduces getProtocolUrl()'s
       tier order with the dynamic (api.llama.fi) tier forced empty — the
       documented degraded path — over every pool in the committed
       data/pools-snapshot.json. Asserts baked+static coverage >= 99%, AND
       (non-vacuity) that removing the baked tier drops coverage to <= 75%,
       so the >=99% assertion is proven load-bearing by this file, not just a
       one-off manual measurement.

   Run: node test_protocol_url_keys.js */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APP_JS_PATH = path.join(ROOT, 'app.js');
const GEN_PATH = path.join(ROOT, 'generate-protocol-urls.js');
const ARTIFACT_PATH = path.join(ROOT, 'data', 'protocol-urls.json');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'pools-snapshot.json');

const MARKER = '// PROTOCOL_KEY_TRANSFORM (single source of truth — test_protocol_url_keys.js asserts app.js and generate-protocol-urls.js agree)';

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exitCode = 1;
  }
}

// --- (1) Key-transform parity ----------------------------------------------

function extractAppExpression() {
  const src = fs.readFileSync(APP_JS_PATH, 'utf8');
  const markerIdx = src.indexOf(MARKER);
  assert.ok(markerIdx >= 0, `marker not found in app.js: ${MARKER}`);
  const after = src.slice(markerIdx + MARKER.length);
  const m = after.match(/const key = (.+);/);
  assert.ok(m, 'could not find "const key = <expr>;" after the marker in app.js');
  return m[1]; // e.g. "protocol.name.toLowerCase().replace(/\s+/g, '-')"
}

function extractGeneratorExpression() {
  const src = fs.readFileSync(GEN_PATH, 'utf8');
  const markerIdx = src.indexOf(MARKER);
  assert.ok(markerIdx >= 0, `marker not found in generate-protocol-urls.js: ${MARKER}`);
  const after = src.slice(markerIdx);
  const m = after.match(/function protocolUrlKey\(name\)\s*\{\s*return (.+);\s*\}/);
  assert.ok(m, 'could not find "function protocolUrlKey(name) { return <expr>; }" after the marker');
  return m[1]; // e.g. "name.toLowerCase().replace(/\s+/g, '-')"
}

const ADVERSARIAL_NAMES = [
  'Multi   Space  Name',
  'MiXeD CaSe Protocol',
  'dots.in.name.io',
  'already-hyphenated-name',
  '',
  'Ünïcödé Nàmé',
  '  Leading And Trailing  ',
  'Tab\tSeparated\tName',
  'Single'
];

test('app.js key-transform expression located at the PROTOCOL_KEY_TRANSFORM marker', () => {
  const expr = extractAppExpression();
  assert.ok(expr.includes('toLowerCase'), `expected a toLowerCase() call, got: ${expr}`);
});

test('generate-protocol-urls.js protocolUrlKey() body located at the PROTOCOL_KEY_TRANSFORM marker', () => {
  const expr = extractGeneratorExpression();
  assert.ok(expr.includes('toLowerCase'), `expected a toLowerCase() call, got: ${expr}`);
});

test('the two source expressions are the same normalized expression (textual parity)', () => {
  const appExpr = extractAppExpression();
  const genExpr = extractGeneratorExpression();
  // Normalize by rewriting the app.js expression's subject identifier
  // (protocol.name) to the generator's parameter name (name) — the only
  // textual difference a correct, non-duplicated pair of call sites can have.
  const appNormalized = appExpr.replace(/protocol\.name/g, 'name').trim();
  const genNormalized = genExpr.trim();
  assert.strictEqual(appNormalized, genNormalized,
    `app.js expression (normalized) "${appNormalized}" !== generator expression "${genNormalized}"`);
});

test('the extracted app.js expression, built into a callable, behaves identically to the generator\'s protocolUrlKey across adversarial names', () => {
  const appExpr = extractAppExpression();
  const appExprAsFn = appExpr.replace(/protocol\.name/g, 'name');
  // eslint-disable-next-line no-new-func
  const appFn = new Function('name', `return ${appExprAsFn};`);
  const { protocolUrlKey } = require(GEN_PATH);

  for (const name of ADVERSARIAL_NAMES) {
    const a = appFn(name);
    const b = protocolUrlKey(name);
    assert.strictEqual(a, b, `mismatch for name=${JSON.stringify(name)}: app-derived="${a}" vs generator="${b}"`);
  }
});

// --- (2) Artifact validity ---------------------------------------------------

let artifact;
test('data/protocol-urls.json exists and parses', () => {
  const raw = fs.readFileSync(ARTIFACT_PATH, 'utf8');
  artifact = JSON.parse(raw);
});

test('schemaVersion === 1', () => {
  assert.strictEqual(artifact.schemaVersion, 1);
});

test('generatedAt is a valid ISO date', () => {
  assert.strictEqual(typeof artifact.generatedAt, 'string');
  const t = Date.parse(artifact.generatedAt);
  assert.ok(Number.isFinite(t), `generatedAt "${artifact.generatedAt}" did not parse as a date`);
  assert.strictEqual(new Date(t).toISOString(), artifact.generatedAt, 'generatedAt is not a canonical ISO string');
});

test('urls is a plain object with only https:// string values', () => {
  assert.ok(artifact.urls && typeof artifact.urls === 'object' && !Array.isArray(artifact.urls));
  const keys = Object.keys(artifact.urls);
  assert.ok(keys.length > 0, 'expected at least one URL entry');
  for (const k of keys) {
    const v = artifact.urls[k];
    assert.strictEqual(typeof v, 'string', `value for key "${k}" is not a string`);
    assert.ok(v.startsWith('https://'), `value for key "${k}" is not an https:// URL: ${v}`);
  }
});

test('keys are sorted (byte-stable output)', () => {
  const keys = Object.keys(artifact.urls);
  const sorted = [...keys].sort();
  assert.deepStrictEqual(keys, sorted, 'artifact.urls keys are not in sorted order');
});

// --- (3) Coverage, measured on the real corpus and printed -----------------

function extractProtocolUrlsConst() {
  const src = fs.readFileSync(APP_JS_PATH, 'utf8');
  const startMarker = 'const PROTOCOL_URLS = {';
  const startIdx = src.indexOf(startMarker);
  assert.ok(startIdx >= 0, 'could not find "const PROTOCOL_URLS = {" in app.js');
  const braceStart = startIdx + startMarker.length - 1;
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.ok(depth === 0, 'could not find the matching closing brace for PROTOCOL_URLS');
  const literal = src.slice(braceStart, i + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${literal};`)();
}

test('coverage: baked+static >= 99% on the real snapshot corpus, non-vacuous vs static-only (<=75%)', () => {
  const { protocolUrlKey } = require(GEN_PATH);
  const PROTOCOL_URLS = extractProtocolUrlsConst();
  const bakedUrls = artifact.urls;
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const pools = snap.pools;
  assert.ok(Array.isArray(pools) && pools.length > 0, 'snapshot has no pools');

  // Reproduces getProtocolUrl()'s tier order with the dynamic
  // (api.llama.fi/protocols) tier forced empty — the documented degraded
  // path this item exists to fix:
  //   pool.url -> dynamicProtocolUrls (forced {}) -> bakedProtocolUrls -> PROTOCOL_URLS -> null
  function resolves(pool, includeBaked) {
    if (pool.url && typeof pool.url === 'string' && pool.url.startsWith('http')) return true;
    if (!pool.project) return false;
    const key = protocolUrlKey(pool.project);
    // dynamicProtocolUrls forced empty — nothing to check here.
    if (includeBaked && (bakedUrls[key] || bakedUrls[pool.project])) return true;
    if (PROTOCOL_URLS[key]) return true;
    return false;
  }

  let coveredStaticOnly = 0;
  let coveredBakedPlusStatic = 0;
  for (const pool of pools) {
    if (resolves(pool, false)) coveredStaticOnly++;
    if (resolves(pool, true)) coveredBakedPlusStatic++;
  }

  const n = pools.length;
  const pctBefore = ((coveredStaticOnly / n) * 100).toFixed(1);
  const pctAfter = ((coveredBakedPlusStatic / n) * 100).toFixed(1);
  console.log(`    before (static only) ${coveredStaticOnly}/${n} (${pctBefore}%) → after (baked+static) ${coveredBakedPlusStatic}/${n} (${pctAfter}%)`);

  assert.ok(coveredBakedPlusStatic / n >= 0.99,
    `expected baked+static coverage >= 99%, got ${pctAfter}% (${coveredBakedPlusStatic}/${n})`);
  // Non-vacuity: without the baked tier, coverage must fall back down near the
  // documented 70.9% static-only baseline — proving the >=99% assertion above
  // is actually load-bearing on the baked tier, not vacuously true.
  assert.ok(coveredStaticOnly / n <= 0.75,
    `expected static-only coverage <= 75% (non-vacuity check), got ${pctBefore}% (${coveredStaticOnly}/${n}) — the >=99% assertion above would not be load-bearing`);
});

console.log(`\ntest_protocol_url_keys.js: ${passed}/${total} tests passed`);
if (process.exitCode) process.exit(process.exitCode);
