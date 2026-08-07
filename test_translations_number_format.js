/* test_translations_number_format.js — spec 241 guard: every count-interpolating
   translation renders en-US grouped numbers, never a bare digit run, no matter
   which of the 306 function-valued dictionary entries is invoked or at which
   parameter position a raw number lands.

   Evidence (UX audit F6): app.js's `.google-results-count` rendered
   "1,976 results" (toLocaleString('en-US')) two inches above translations.js's
   `showingResults` rendering "1976 pools found" (bare `${count}` interpolation)
   — same number, two formats.

   Measured territory (see product-loop-kit/specs/241-notes.md): 306
   function-valued entries across both language trees, flattened (en + ko,
   including the nested .planner and .landing subtrees). 293 of the 306 would
   emit a bare digit run if probed with a raw number BEFORE this fix — a
   per-entry allowlist would need ~293 keys, which is vacuous as a guard. The
   real fix sits at the ACCESSOR CHOKEPOINT (createTranslationFunction's
   returned t(), and planner.js's makeT()), where every numeric argument is
   mapped through the one shared formatCount() before the dictionary entry
   ever sees it — so this test invokes entries THROUGH those accessors (or a
   documented mirror of them), never the raw dictionary functions directly.

   Two accessors are exercised:
     - createTranslationFunction(lang) — the real translations.js export, used
       for every top-level key (and, by construction, echoes any nested
       .landing key back unchanged, since createTranslationFunction only ever
       resolves TOP-LEVEL keys — landing.js reads translations[lang].landing
       directly, bypassing both accessors; see product-loop-kit/specs/
       241-notes.md's landing.js audit for why that's correct and out of
       scope here).
     - a makeT()-shaped MIRROR for the nested .planner subtree. planner.js's
       real makeT() lives inside an IIFE and is not exported (documented
       precedent: test_planner.js:1065-1066 mirrors the SAME translations[lang]
       .planner accessor pattern for the same reason). Because this is a
       mirror, not the real thing, it reuses the SAME translations.js
       formatCount export directly — so it cannot by itself prove planner.js's
       real makeT() still calls the shared formatter if that call site were
       ever deleted. A separate source-level assertion below (the
       "mirror-guard") closes exactly that gap, and only that gap — see its
       comment for what it can and cannot catch.

   Run: node test_translations_number_format.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { translations, createTranslationFunction, formatCount } = require('./translations.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const PROBE = 1976;
const NEUTRAL = 'X';

// ---------------------------------------------------------------------------
// (a) Flatten BOTH language trees, recursing into nested subtrees, collecting
//     every function-valued key. translations.js currently nests exactly two
//     subtrees per language (`.landing`, `.planner`) — this walks arbitrarily
//     deep so a future third subtree is picked up automatically.
// ---------------------------------------------------------------------------
function flatten(node, subPath) {
  const out = [];
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (typeof v === 'function') {
      out.push({ key, subPath, fn: v, arity: v.length });
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flatten(v, subPath ? subPath + '.' + key : key));
    }
  }
  return out;
}

const entries = [];
for (const lang of ['en', 'ko']) {
  for (const e of flatten(translations[lang], '')) {
    entries.push({ lang, ...e });
  }
}

// Population number — a measured fact, not a hardcoded expectation. Printed
// so a future addition/removal to the dictionary is visible in test output.
console.log(`population: ${entries.length} function-valued translation entries ` +
  '(flattened en+ko, including nested .landing/.planner subtrees; expect ~306)');

test('population is a real, non-trivial sweep (> 250 entries collected)', () => {
  assert.ok(entries.length > 250, `expected > 250 entries, got ${entries.length} — the flatten walk enumerated almost nothing`);
});

test('every collected entry has arity >= 1 (sanity check on the measured territory note: zero are zero-arg)', () => {
  const zeroArg = entries.filter((e) => e.arity === 0).map((e) => `${e.lang}.${e.subPath ? e.subPath + '.' : ''}${e.key}`);
  assert.deepStrictEqual(zeroArg, [], `expected no zero-arg function-valued entries, found: ${JSON.stringify(zeroArg)}`);
});

// ---------------------------------------------------------------------------
// Accessors under test.
// ---------------------------------------------------------------------------
const T = { en: createTranslationFunction('en'), ko: createTranslationFunction('ko') };

// makeT()-shaped mirror for the .planner subtree — see the file header for
// why this exists and what its accompanying mirror-guard assertion covers.
function makeTMirror(lang) {
  return function (key, ...args) {
    const mapped = args.map(formatCount);
    const dict = (translations[lang] && translations[lang].planner) || translations.en.planner;
    const fallback = translations.en.planner;
    let v = dict[key];
    if (v == null) v = fallback[key];
    if (typeof v === 'function') return v.apply(null, mapped);
    return v == null ? key : v;
  };
}
const PLANNER_T = { en: makeTMirror('en'), ko: makeTMirror('ko') };

function accessorFor(entry) {
  return entry.subPath === 'planner' ? PLANNER_T[entry.lang] : T[entry.lang];
}

// A bare (ungrouped) occurrence of the exact probe value — not embedded in a
// larger digit run, and not already comma-grouped (a grouped "1,976" cannot
// match this: the comma breaks the run into "1" and "976", neither of which
// is "1976"). Scoped to the PROBED VALUE specifically, not a blanket
// /\d{4,}/ scan of the whole rendered string — several entries carry a
// static, non-count literal (the APY_SANITY_LIMIT threshold, "…exclude
// anomalous (>1000% APY) pools…", translations.js:697/711/1396/1404) that
// would false-positive a blanket 4+-digit-run scan on EVERY invocation,
// regardless of the probe or the fix under test. See 241-notes.md.
function containsBareProbe(output, probe) {
  const re = new RegExp('(?<!\\d)' + probe + '(?!\\d)');
  return re.test(String(output));
}

// ---------------------------------------------------------------------------
// (d) The allowlist — real, keyed, EMPTY. A future exemption must be added
//     here deliberately, with a reason, not silently.
// ---------------------------------------------------------------------------
const ALLOWLIST = {
  // (intentionally empty — the accessor-chokepoint fix needs no per-entry
  // exemptions; see product-loop-kit/specs/241-notes.md)
};

console.log(`allowlist size: ${Object.keys(ALLOWLIST).length} (design point: the accessor fix needs none)`);

test('allowlist is empty', () => {
  assert.deepStrictEqual(Object.keys(ALLOWLIST), [], 'the allowlist should stay empty — the whole point of the accessor-chokepoint fix is that no per-entry exemption is needed');
});

// ---------------------------------------------------------------------------
// (b)/(c) The sweep: every collected entry, every parameter position, probed
//         with 1976 (other positions filled with the neutral string 'X'),
//         invoked THROUGH the appropriate accessor.
// ---------------------------------------------------------------------------
let sweepInvocations = 0;
test('every function-valued entry renders the probe grouped (1,976), never bare, at every parameter position', () => {
  const failures = [];
  for (const entry of entries) {
    const allowKey = `${entry.lang}.${entry.subPath ? entry.subPath + '.' : ''}${entry.key}`;
    if (ALLOWLIST[allowKey]) continue;
    const accessor = accessorFor(entry);
    const n = Math.max(entry.arity, 1);
    for (let pos = 0; pos < n; pos++) {
      const args = [];
      for (let i = 0; i < n; i++) args.push(i === pos ? PROBE : NEUTRAL);
      sweepInvocations++;
      let output;
      try {
        output = accessor(entry.key, ...args);
      } catch (err) {
        failures.push(`${allowKey} [param ${pos}] threw invoking with ${JSON.stringify(args)}: ${err.message}`);
        continue;
      }
      if (containsBareProbe(output, PROBE)) {
        failures.push(`${allowKey} [param ${pos}] rendered a bare ${PROBE} — expected "1,976". Output: ${JSON.stringify(output)}`);
      }
    }
  }
  if (failures.length) {
    throw new Error(`${failures.length} bare-number failure(s):\n  ` + failures.slice(0, 25).join('\n  ') +
      (failures.length > 25 ? `\n  …and ${failures.length - 25} more` : ''));
  }
});
console.log(`sweep invocations: ${sweepInvocations}`);

// ---------------------------------------------------------------------------
// (c) Mirror-guard: proves the .planner mirror above and planner.js's REAL
//     makeT() apply the SAME shared formatter. This is a SOURCE-LEVEL check —
//     it can prove the call site to the shared formatter is still present in
//     makeT(), and that applyPinnedCounts() still reaches for the shared
//     window.formatCount global rather than a silently-reimplemented
//     duplicate. It CANNOT prove the shared formatter behaves correctly at
//     runtime in a real browser (translations.min.js load-order, minification
//     survival, etc.) — that is what test_translations_fallback.js (the
//     minified-artifact assertions) and the rendered Playwright leg cover.
// ---------------------------------------------------------------------------
test('mirror-guard: planner.js\'s real makeT() still calls the shared formatter (source-level)', () => {
  const plannerSrc = fs.readFileSync(path.join(__dirname, 'planner.js'), 'utf8');
  const helperStart = plannerSrc.indexOf('function applyPinnedCounts');
  assert.ok(helperStart >= 0, 'could not locate function applyPinnedCounts(...) in planner.js — has the 241 fix been removed?');
  const makeTStart = plannerSrc.indexOf('function makeT(lang)');
  assert.ok(makeTStart > helperStart, 'applyPinnedCounts() must be defined before makeT(lang) in planner.js');
  const makeTEnd = plannerSrc.indexOf('function rootT(lang, key)');
  assert.ok(makeTEnd > makeTStart, 'could not locate the end of makeT (function rootT) in planner.js');

  const helperBlock = plannerSrc.slice(helperStart, makeTStart);
  assert.ok(helperBlock.includes('window.formatCount'),
    'applyPinnedCounts() no longer reaches for the shared window.formatCount global — it may have been silently reimplemented');

  const makeTBlock = plannerSrc.slice(makeTStart, makeTEnd);
  assert.ok(makeTBlock.includes('applyPinnedCounts('),
    'makeT() no longer calls applyPinnedCounts() — numeric args would reach dictionary entries unformatted');
});

// ---------------------------------------------------------------------------
// (e) Named-instance assertions — positive controls, not the definition.
// ---------------------------------------------------------------------------
console.log('named-instance assertions (positive controls)');

test("t_en('showingResults', 1976) === '1,976 pools found'", () => {
  assert.strictEqual(T.en('showingResults', 1976), '1,976 pools found');
});
test("t_ko('showingResults', 1976) === '1,976개 풀 발견'", () => {
  assert.strictEqual(T.ko('showingResults', 1976), '1,976개 풀 발견');
});
test("t_en('showingResults', 1) === '1 pool found' (pluralization regression guard)", () => {
  assert.strictEqual(T.en('showingResults', 1), '1 pool found');
});
test("plannerT_en('years', 1) === '1 yr'", () => {
  assert.strictEqual(PLANNER_T.en('years', 1), '1 yr');
});
test("plannerT_en('years', 1976) starts with '1,976 yr'", () => {
  assert.ok(PLANNER_T.en('years', 1976).startsWith('1,976 yr'), `got: ${JSON.stringify(PLANNER_T.en('years', 1976))}`);
});
test("plannerT_en('reportElapsedDays', 1) === 'Planted 1 day ago'", () => {
  assert.strictEqual(PLANNER_T.en('reportElapsedDays', 1), 'Planted 1 day ago');
});
test("plannerT_ko('reportElapsedDays', 1) === '심은 지 1일 됐어요'", () => {
  assert.strictEqual(PLANNER_T.ko('reportElapsedDays', 1), '심은 지 1일 됐어요');
});

// ---------------------------------------------------------------------------
// (f) Non-numeric params pass through untouched (identity).
// ---------------------------------------------------------------------------
test("non-numeric params are unchanged: t_en('tokenYields', 'USDC', 'Ethereum')", () => {
  assert.strictEqual(T.en('tokenYields', 'USDC', 'Ethereum'), 'Yields for USDC on Ethereum');
});
test('formatCount is identity on non-finite-number values (string, NaN, undefined, object)', () => {
  assert.strictEqual(formatCount('X'), 'X');
  assert.strictEqual(Number.isNaN(formatCount(NaN)), true);
  assert.strictEqual(formatCount(undefined), undefined);
  const obj = {};
  assert.strictEqual(formatCount(obj), obj);
});

console.log(`\n${passed} translations-number-format assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));
