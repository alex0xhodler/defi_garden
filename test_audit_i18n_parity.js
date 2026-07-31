/* Acceptance tests for the i18n en/ko value-honesty + key-parity prescan
   (item 190). `prescanI18n()` (audit-app.js) is a pure fs+require scan over
   translations.js's flattened en/ko dictionaries — no render, no network.
   Modeled on test_audit_prescan.js's plain-assertion shape (no browser
   needed; run: node test_audit_i18n_parity.js).

   Spec 190's whole point: "a filter returning zero is not evidence of health
   until it is shown able to return non-zero" (LEARNINGS 2026-07-27 takeaway
   2). The positive-control cases below are therefore not optional coverage —
   they are the acceptance criterion that makes the real-dictionary
   zero-suspects result (further down) mean anything. */

const { prescanI18n, I18N_IDENTICAL_ALLOWLIST } = require('./audit-app.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

function findSuspect(suspects, key) {
  return suspects.find((s) => s.key === key);
}

// ---------------------------------------------------------------------------
// Positive control (the point of the item): both directions of key parity,
// plus a non-allowlisted untranslated value, all in one fixture — proves the
// signal CAN fire, and fires on everything it should in a single pass.
// ---------------------------------------------------------------------------
test('positive control: a KO-missing key AND a non-allowlisted identical-no-Hangul KO value are BOTH reported', () => {
  const dict = {
    en: { landing: { onlyInEn: 'Only in EN', untranslated: 'Ordinary English prose' } },
    ko: { landing: { untranslated: 'Ordinary English prose' } }
  };
  const result = prescanI18n({ dict });
  const missing = findSuspect(result.suspects, 'landing.onlyInEn');
  assert(missing, `expected a suspect for the missing-in-ko key landing.onlyInEn; got: ${JSON.stringify(result.suspects)}`);
  assert(missing.signal === 'en-ko-parity' && missing.severity === 'P1', `missing-key suspect must be en-ko-parity/P1; got ${JSON.stringify(missing)}`);
  assert(/missing in ko/.test(missing.detail), `expected detail to say "missing in ko"; got: ${missing.detail}`);

  const untranslated = findSuspect(result.suspects, 'landing.untranslated');
  assert(untranslated, `expected a suspect for the untranslated key landing.untranslated; got: ${JSON.stringify(result.suspects)}`);
  assert(untranslated.signal === 'en-ko-parity' && untranslated.severity === 'P1', `untranslated-value suspect must be en-ko-parity/P1; got ${JSON.stringify(untranslated)}`);
  assert(/byte-identical/.test(untranslated.detail), `expected detail to describe the byte-identical value; got: ${untranslated.detail}`);
});

test('missing-in-EN direction is also reported (ko has an extra key en does not)', () => {
  const dict = {
    en: { planner: { a: 'A' } },
    ko: { planner: { a: 'A 코리안', extraInKo: '한국어 전용' } }
  };
  const result = prescanI18n({ dict });
  const extra = findSuspect(result.suspects, 'planner.extraInKo');
  assert(extra, `expected a suspect for planner.extraInKo (present in ko, missing in en); got: ${JSON.stringify(result.suspects)}`);
  assert(/missing in en/.test(extra.detail), `expected detail to say "missing in en"; got: ${extra.detail}`);
  // The properly-translated shared key must NOT be reported at all.
  assert(!findSuspect(result.suspects, 'planner.a'), 'planner.a is translated and key-complete — must not be reported');
});

test('allowlist does not swallow real findings: keys that ARE on the real allowlist stay silent, a non-allowlisted untranslated value in the same scan still fires', () => {
  // The allowlist is module-level data (not opts-injectable, per spec 190 —
  // "as data, keyed by the EXACT flattened key path"), so this fixture reuses
  // two REAL allowlisted key paths (top-level `tvl`, `planner.goalMax`) plus
  // one made-up, definitely-not-allowlisted key with an untranslated value.
  assert(Object.prototype.hasOwnProperty.call(I18N_IDENTICAL_ALLOWLIST, 'tvl'), 'test assumption broken: "tvl" must be on the real seeded allowlist');
  assert(Object.prototype.hasOwnProperty.call(I18N_IDENTICAL_ALLOWLIST, 'planner.goalMax'), 'test assumption broken: "planner.goalMax" must be on the real seeded allowlist');
  assert(!Object.prototype.hasOwnProperty.call(I18N_IDENTICAL_ALLOWLIST, 'top.realBug'), 'test assumption broken: "top.realBug" must not be on the real seeded allowlist');
  const dict = {
    en: { tvl: 'TVL', planner: { goalMax: 'Max' }, top: { realBug: 'Untranslated prose' } },
    ko: { tvl: 'TVL', planner: { goalMax: 'Max' }, top: { realBug: 'Untranslated prose' } }
  };
  const result = prescanI18n({ dict });
  assert(!findSuspect(result.suspects, 'tvl'), 'tvl IS allowlisted — must not be reported');
  assert(!findSuspect(result.suspects, 'planner.goalMax'), 'planner.goalMax IS allowlisted — must not be reported');
  const bug = findSuspect(result.suspects, 'top.realBug');
  assert(bug, `expected top.realBug (not allowlisted) to still be reported even though other keys in the same scan are legitimately allowlisted; got: ${JSON.stringify(result.suspects)}`);
});

test('allowlist is exact-key-path, not prefix/substring: allowlisting planner.goalMax must NOT silence planner.goalMaxPlus', () => {
  assert(Object.prototype.hasOwnProperty.call(I18N_IDENTICAL_ALLOWLIST, 'planner.goalMax'),
    'test assumption broken: planner.goalMax must be on the real seeded allowlist');
  assert(!Object.prototype.hasOwnProperty.call(I18N_IDENTICAL_ALLOWLIST, 'planner.goalMaxPlus'),
    'test assumption broken: planner.goalMaxPlus must NOT be on the real seeded allowlist (fixture would be vacuous otherwise)');
  const dict = {
    en: { planner: { goalMax: 'Max', goalMaxPlus: 'Max' } },
    ko: { planner: { goalMax: 'Max', goalMaxPlus: 'Max' } }
  };
  const result = prescanI18n({ dict });
  assert(!findSuspect(result.suspects, 'planner.goalMax'), 'planner.goalMax IS allowlisted (real brand) — must not be reported');
  const plus = findSuspect(result.suspects, 'planner.goalMaxPlus');
  assert(plus, `planner.goalMaxPlus is NOT allowlisted (a distinct key path, mere prefix of an allowlisted one) — must still be reported; got: ${JSON.stringify(result.suspects)}`);
});

test('nested namespaces flatten correctly (landing.x / planner.y style key paths)', () => {
  const dict = {
    en: { landing: { x: '자연스러운 한국어' }, planner: { y: { z: '중첩된 값' } } },
    ko: { landing: { x: '자연스러운 한국어' }, planner: { y: { z: '중첩된 값' } } }
  };
  const result = prescanI18n({ dict });
  assert(result.scanned === 2, `expected 2 flattened keys (landing.x, planner.y.z); got ${result.scanned}`);
  assert(result.suspects.length === 0, `both values are genuinely identical KO (translated the same both languages is fine when it IS Korean); got: ${JSON.stringify(result.suspects)}`);
});

test('function-valued and non-string leaves never produce a value-honesty finding (only key parity applies)', () => {
  const sameFn = (date) => `Planted ${date}`;
  const dict = {
    en: { landing: { returnStatus: sameFn, count: 5, tags: ['a', 'b'] } },
    ko: { landing: { returnStatus: sameFn, count: 5, tags: ['a', 'b'] } }
  };
  const result = prescanI18n({ dict });
  assert(result.suspects.length === 0, `function/number/array leaves must never trip value-honesty even when identical; got: ${JSON.stringify(result.suspects)}`);
  assert(result.scanned === 3, `expected 3 flattened keys; got ${result.scanned}`);
});

test('a KO value that differs from EN is NOT reported, even with no Hangul', () => {
  const dict = {
    en: { top: { a: 'English text' } },
    ko: { top: { a: 'Different English text' } } // still no Hangul, but NOT byte-identical
  };
  const result = prescanI18n({ dict });
  assert(result.suspects.length === 0, `a differing (even if untranslated-looking) value must not be flagged — only byte-identical values are; got: ${JSON.stringify(result.suspects)}`);
});

test('a KO value that contains Hangul is NOT reported, even if byte-identical would otherwise be suspicious', () => {
  const dict = {
    en: { top: { a: '한글' } }, // contrived: EN itself happens to contain Hangul (e.g. a brand name)
    ko: { top: { a: '한글' } }
  };
  const result = prescanI18n({ dict });
  assert(result.suspects.length === 0, `a KO value containing Hangul must never be flagged regardless of EN-identity; got: ${JSON.stringify(result.suspects)}`);
});

// ---------------------------------------------------------------------------
// Against the REAL translations.js (no injection): the whole point of Leg A.
// ---------------------------------------------------------------------------
test('against the REAL translations.js: suspects === 0 after Leg A, and allowlistSize equals the seeded allowlist size', () => {
  const result = prescanI18n();
  assert(result.suspects.length === 0, `expected 0 suspects against the real dictionary after Leg A; got: ${JSON.stringify(result.suspects)}`);
  const realAllowlistSize = Object.keys(I18N_IDENTICAL_ALLOWLIST).length;
  assert(result.allowlistSize === realAllowlistSize, `expected allowlistSize === ${realAllowlistSize}, got ${result.allowlistSize}`);
  assert(result.scanned > 0, `expected a non-zero scanned count against the real dictionary; got ${result.scanned}`);
});

// ---------------------------------------------------------------------------
// Loader robustness: never throws, even on garbage input.
// ---------------------------------------------------------------------------
test('loader robustness: prescanI18n({ dict: null }) returns the unrun shape without throwing', () => {
  let result;
  try {
    result = prescanI18n({ dict: null });
  } catch (e) {
    throw new Error('prescanI18n must never throw on dict: null; threw: ' + e.message);
  }
  assert(result.scanned === 0, `expected scanned === 0 for an unusable dictionary; got ${result.scanned}`);
  assert(Array.isArray(result.suspects) && result.suspects.length === 0, `expected an empty suspects array; got ${JSON.stringify(result.suspects)}`);
  assert(typeof result.allowlistSize === 'number' && result.allowlistSize > 0, `expected allowlistSize to still be reported even on an unrun scan; got ${result.allowlistSize}`);
});

test('loader robustness: prescanI18n({ dict: "garbage string" }) returns the unrun shape without throwing', () => {
  let result;
  try {
    result = prescanI18n({ dict: 'garbage string' });
  } catch (e) {
    throw new Error('prescanI18n must never throw on a garbage-string dict; threw: ' + e.message);
  }
  assert(result.scanned === 0, `expected scanned === 0; got ${result.scanned}`);
  assert(result.suspects.length === 0, `expected zero suspects; got: ${JSON.stringify(result.suspects)}`);
});

test('loader robustness: prescanI18n({ dict: {} }) (missing en/ko namespaces entirely) returns the unrun shape without throwing', () => {
  let result;
  try {
    result = prescanI18n({ dict: {} });
  } catch (e) {
    throw new Error('prescanI18n must never throw on a dict missing en/ko; threw: ' + e.message);
  }
  assert(result.scanned === 0, `expected scanned === 0; got ${result.scanned}`);
  assert(result.suspects.length === 0, `expected zero suspects; got: ${JSON.stringify(result.suspects)}`);
});

test('loader robustness: prescanI18n({ dict: { en: {}, ko: null } }) (malformed ko namespace) returns the unrun shape without throwing', () => {
  let result;
  try {
    result = prescanI18n({ dict: { en: {}, ko: null } });
  } catch (e) {
    throw new Error('prescanI18n must never throw on a malformed ko namespace; threw: ' + e.message);
  }
  assert(result.scanned === 0, `expected scanned === 0; got ${result.scanned}`);
  assert(result.suspects.length === 0, `expected zero suspects; got: ${JSON.stringify(result.suspects)}`);
});

console.log(`\ntest_audit_i18n_parity.js: ${passed} passed, ${failed} failed`);
if (process.exitCode) process.exit(process.exitCode);
