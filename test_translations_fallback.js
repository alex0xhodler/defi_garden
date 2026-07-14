/* Regression test for spec 082: the planner must not throw
   `ReferenceError: translations is not defined` at the funnel top when the
   deferred translations.min.js global is unavailable at call time (transient
   load failure / interrupted request / deploy race).

   makeT()/rootT() in planner.js are NOT exported on the module API (and adding
   them would be an out-of-scope surface change), so this exercises them at the
   fixture level: the three i18n functions (safeTranslations/makeT/rootT) are
   sliced out of planner.js source and evaluated in a `node:vm` context. The
   vm's global either has NO `translations` binding (the failure mode) or a
   `translations` stub (the normal path) — proving the guard degrades to
   key-echo without throwing, recovers if the global loads late, and behaves
   identically when translations IS present.

   Also asserts the guard survived minification and that re-minifying is
   idempotent (planner.min.js == a fresh minify of planner.js), reusing
   test_minified_assets.js's exact transformJs comparison.

   No new deps, no hardcoded absolute/scratchpad paths (repo-relative only).
   Run: node test_translations_fallback.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformJs } = require('./minify-assets.js');

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('  ✓ ' + name); })
    .catch((err) => { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; });
}

// --- Extract the i18n block (safeTranslations + makeT + rootT) from source ---
const PLANNER = path.join(__dirname, 'planner.js');
const src = fs.readFileSync(PLANNER, 'utf8');
const start = src.indexOf('function safeTranslations');
const end = src.indexOf('var prefersReducedMotion');
assert.ok(start >= 0 && end > start, 'could not locate the i18n block in planner.js');
const block = src.slice(start, end);
// The block declares the three functions; the trailing expression returns them.
const code = block + '\n;({ safeTranslations: safeTranslations, makeT: makeT, rootT: rootT });';

// A translations stub mirroring the real shape: en/ko dicts, a nested
// `.planner` section, a function-valued entry, and a root-level key.
function makeStub() {
  return {
    en: {
      planner: {
        greeting: 'Hello',
        withArgs: function (n) { return 'n=' + n; }
      },
      loadingError: 'Something went wrong'
    },
    ko: {
      planner: { greeting: '안녕하세요' }
    }
  };
}

// Build a fresh vm context; optionally seed a `translations` global and/or a
// `window` object. Returns { fns, ctx } so callers can mutate ctx afterwards
// (to prove late-load recovery).
function buildContext(opts) {
  opts = opts || {};
  const ctx = {};
  if (opts.window !== undefined) ctx.window = opts.window;
  if (opts.translations !== undefined) ctx.translations = opts.translations;
  vm.createContext(ctx);
  const fns = vm.runInContext(code, ctx);
  return { fns, ctx };
}

async function main() {
  console.log('safeTranslations / makeT / rootT graceful degradation (spec 082)');

  await test('makeT does not throw and key-echoes when translations is undefined', () => {
    const { fns } = buildContext({ window: {} }); // no translations global
    assert.strictEqual(fns.safeTranslations(), null);
    let t;
    assert.doesNotThrow(() => { t = fns.makeT('en'); });
    assert.strictEqual(t('greeting'), 'greeting', 'expected key-echo, not a throw');
    assert.strictEqual(t('withArgs', 5), 'withArgs', 'key-echo even for function-valued keys');
  });

  await test('rootT does not throw and returns the key when translations is undefined', () => {
    const { fns } = buildContext({ window: {} });
    let v;
    assert.doesNotThrow(() => { v = fns.rootT('en', 'loadingError'); });
    assert.strictEqual(v, 'loadingError', 'expected the key string as text-safe fallback');
  });

  await test('makeT lazily recovers when translations loads late', () => {
    const { fns, ctx } = buildContext({}); // no translations, no window
    const t = fns.makeT('en');
    assert.strictEqual(t('greeting'), 'greeting'); // global still missing -> key-echo
    ctx.translations = makeStub();                 // deferred script finally ran
    assert.strictEqual(t('greeting'), 'Hello', 'same t() must pick up the late global');
  });

  await test('safeTranslations falls back to window.translations', () => {
    const stub = makeStub();
    const { fns } = buildContext({ window: { translations: stub } }); // only on window
    assert.strictEqual(fns.safeTranslations(), stub);
    assert.strictEqual(fns.makeT('en')('greeting'), 'Hello');
  });

  console.log('normal path is identical when translations IS defined');

  await test('makeT resolves dict, ko value, en fallback, function-valued entry, key-echo', () => {
    const { fns } = buildContext({ translations: makeStub() });
    assert.strictEqual(fns.makeT('en')('greeting'), 'Hello');
    assert.strictEqual(fns.makeT('ko')('greeting'), '안녕하세요');
    // ko.planner lacks withArgs -> en.planner fallback -> function applied with args
    assert.strictEqual(fns.makeT('ko')('withArgs', 7), 'n=7');
    // unknown key -> echoes the key (unchanged pre-082 behavior)
    assert.strictEqual(fns.makeT('en')('nope'), 'nope');
  });

  await test('rootT resolves lang, en fallback, and stays undefined for a truly-missing key', () => {
    const { fns } = buildContext({ translations: makeStub() });
    assert.strictEqual(fns.rootT('en', 'loadingError'), 'Something went wrong');
    // ko lacks loadingError -> en fallback
    assert.strictEqual(fns.rootT('ko', 'loadingError'), 'Something went wrong');
    // missing in both -> undefined preserved (callers tolerate undefined; the
    // key-echo path only fires when translations is entirely absent)
    assert.strictEqual(fns.rootT('en', 'missingRoot'), undefined);
  });

  console.log('minified artifact carries the guard and is idempotent');

  await test('planner.min.js contains the `typeof translations` guard (survived minification)', () => {
    const min = fs.readFileSync(path.join(__dirname, 'planner.min.js'), 'utf8');
    assert.ok(min.includes('typeof translations'), 'the safeTranslations guard did not survive minify');
  });

  await test('planner.min.js == a fresh minify of planner.js (re-minify is idempotent)', async () => {
    const committed = fs.readFileSync(path.join(__dirname, 'planner.min.js'), 'utf8');
    const fresh = await transformJs('planner.js', src);
    assert.strictEqual(committed, fresh, 'planner.min.js is stale — run `npm run minify` and commit');
  });

  console.log(`\n${passed} translations-fallback assertions passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('test_translations_fallback crashed: ' + err.message);
  process.exit(1);
});
