/* Acceptance tests for the i18n en/ko value-honesty + key-parity prescan
   (item 190, predicate fixed by item 198). `prescanI18n()` (audit-app.js) is
   a pure fs+require scan over translations.js's flattened en/ko
   dictionaries — no render, no network. Modeled on test_audit_prescan.js's
   plain-assertion shape (no browser needed; run: node test_audit_i18n_parity.js).

   Item 198: 190's value-honesty rule (Rule 2) required the KO value to be
   byte-identical to EN before it even looked for Hangul — a property of the
   PAIR, not of the KO value alone. That made it a drift detector that
   switches itself off on drift: reword the EN string and the pair stops
   being identical, so a stale-English KO value goes silent. 198 replaced the
   identity gate with a property of the KO value alone — no Hangul AND at
   least one Latin letter (ruling out bare figures like "$100" without an
   allowlist entry) AND not on the exact-key-path allowlist — and renamed the
   exported allowlist constant from I18N_IDENTICAL_ALLOWLIST to
   I18N_UNTRANSLATED_ALLOWLIST to match. The tests below cover both the fixed
   predicate (miss cases 198 closes, the false positive it removes) and a
   positive control against the REAL historical bytes that caused item 190.

   Spec 190's whole point: "a filter returning zero is not evidence of health
   until it is shown able to return non-zero" (LEARNINGS 2026-07-27 takeaway
   2). The positive-control cases below are therefore not optional coverage —
   they are the acceptance criterion that makes the real-dictionary
   zero-suspects result (further down) mean anything. */

const { prescanI18n, I18N_UNTRANSLATED_ALLOWLIST } = require('./audit-app.js');

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
  assert(Object.prototype.hasOwnProperty.call(I18N_UNTRANSLATED_ALLOWLIST, 'tvl'), 'test assumption broken: "tvl" must be on the real seeded allowlist');
  assert(Object.prototype.hasOwnProperty.call(I18N_UNTRANSLATED_ALLOWLIST, 'planner.goalMax'), 'test assumption broken: "planner.goalMax" must be on the real seeded allowlist');
  assert(!Object.prototype.hasOwnProperty.call(I18N_UNTRANSLATED_ALLOWLIST, 'top.realBug'), 'test assumption broken: "top.realBug" must not be on the real seeded allowlist');
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
  assert(Object.prototype.hasOwnProperty.call(I18N_UNTRANSLATED_ALLOWLIST, 'planner.goalMax'),
    'test assumption broken: planner.goalMax must be on the real seeded allowlist');
  assert(!Object.prototype.hasOwnProperty.call(I18N_UNTRANSLATED_ALLOWLIST, 'planner.goalMaxPlus'),
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

// Item 198, acceptance criterion 3. This REPLACES the old (now-wrong) test
// that asserted the opposite — "a KO value that differs from EN is NOT
// reported, even with no Hangul" — which encoded the exact bug item 198
// fixes: reword the EN string and the old predicate went silent even though
// the KO value is stale English prose.
test('the reworded-English case IS flagged: EN reworded, KO left as the old English, no Hangul', () => {
  const dict = {
    en: { landing: { x: 'Powered by' } },
    ko: { landing: { x: 'Powered by the DefiLlama feed' } } // stale English, EN has since been reworded
  };
  const result = prescanI18n({ dict });
  const suspect = findSuspect(result.suspects, 'landing.x');
  assert(suspect, `expected landing.x to be flagged — KO is stale English prose even though it no longer matches EN byte-for-byte; got: ${JSON.stringify(result.suspects)}`);
  assert(suspect.signal === 'en-ko-parity' && suspect.severity === 'P1', `expected en-ko-parity/P1; got ${JSON.stringify(suspect)}`);
});

// Item 198, acceptance criterion 2: the miss is proven fixed, AND proven to
// have been a miss. A single trailing space is enough to break byte-identity
// while leaving the KO value exactly as untranslated as before.
test('the trailing-space miss is closed: KO differs from EN by one trailing space', () => {
  const dict = {
    en: { landing: { x: 'Powered by' } },
    ko: { landing: { x: 'Powered by ' } } // one trailing space — NOT byte-identical to EN
  };
  const result = prescanI18n({ dict });
  const suspect = findSuspect(result.suspects, 'landing.x');
  assert(suspect, `expected landing.x to be flagged by the new (KO-value-only) predicate; got: ${JSON.stringify(result.suspects)}`);
  assert(suspect.signal === 'en-ko-parity' && suspect.severity === 'P1', `expected en-ko-parity/P1; got ${JSON.stringify(suspect)}`);

  // Prove this was actually a miss under the OLD predicate (en === ko),
  // computed inline against the same fixture — documents the class of bug
  // this closes (a trailing-space-or-any-other-edit KO value that stays
  // stale English forever because it merely stopped being byte-identical to
  // a since-reworded EN string), not merely that the new test passes.
  assert(dict.en.landing.x !== dict.ko.landing.x,
    'test assumption broken: the fixture must NOT be byte-identical (that is the whole point — the old en===ko predicate would have missed it)');
});

// Item 198, acceptance criterion 4: the false positive is gone, and requires
// no allowlist entry — a bare figure carries no Latin-letter prose so the
// Latin-letter conjunct excludes it before the allowlist is ever consulted.
test('the false positive is gone: a bare figure identical in both languages is NOT a suspect and needs no allowlist entry', () => {
  const dict = {
    en: { landing: { price: '$100' } },
    ko: { landing: { price: '$100' } }
  };
  const result = prescanI18n({ dict });
  assert(!findSuspect(result.suspects, 'landing.price'), `a bare figure must never be a suspect; got: ${JSON.stringify(result.suspects)}`);
  assert(!Object.prototype.hasOwnProperty.call(I18N_UNTRANSLATED_ALLOWLIST, 'landing.price'),
    'landing.price must not need an allowlist entry — it is definitely not on the real seeded allowlist');
});

// Item 198, acceptance criterion 7 (non-vacuity per sub-rule), added after
// the round-1 verifier found this exact hole: swapping the Latin-letter
// conjunct from koVal to enVal left the whole suite green, so nothing pinned
// down WHICH value that conjunct must read. It must read the KO value —
// "does this leaf carry translatable prose" is a question about the string
// that is supposed to be Korean, exactly like the Hangul check beside it.
// The fixture inverts the two sides: EN carries no Latin letter, KO carries
// nothing but. Under the koVal-reading (correct) rule this fires; under an
// enVal-reading (mutated) rule the bare-figure EN value short-circuits the
// loop and the finding is lost.
test('the Latin-letter conjunct reads the KO value, not EN: EN is a bare figure, KO is untranslated English', () => {
  const dict = {
    en: { landing: { x: '$100' } },        // no Latin letter on the EN side
    ko: { landing: { x: 'Powered by' } }   // untranslated English, no Hangul
  };
  const result = prescanI18n({ dict });
  const suspect = findSuspect(result.suspects, 'landing.x');
  assert(suspect, `expected landing.x to be flagged — the KO value is untranslated English prose; a conjunct that read the EN value ("$100", no Latin letters) instead would silently drop this finding; got: ${JSON.stringify(result.suspects)}`);
  assert(suspect.signal === 'en-ko-parity' && suspect.severity === 'P1', `expected en-ko-parity/P1; got ${JSON.stringify(suspect)}`);
  assert(!/byte-identical/.test(suspect.detail),
    `the pair is NOT byte-identical, so the detail must not claim it is; got: ${suspect.detail}`);
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
  const realAllowlistSize = Object.keys(I18N_UNTRANSLATED_ALLOWLIST).length;
  assert(result.allowlistSize === realAllowlistSize, `expected allowlistSize === ${realAllowlistSize}, got ${result.allowlistSize}`);
  assert(result.scanned > 0, `expected a non-zero scanned count against the real dictionary; got ${result.scanned}`);
});

// ---------------------------------------------------------------------------
// Positive control on REAL historical bytes (item 198, acceptance criterion
// 1 — the load-bearing one). Not a hand-written fixture: a fixture is
// written from the same mental model that missed the bug in the first
// place. This feeds the actual translations.js content from the commit
// that shipped the live bug (648401297, the parent of dc2f947cc — "190:
// nothing checked whether the Korean was Korean") to the real prescanI18n().
// If `git show` fails (shallow clone, no git), this test FAILS LOUDLY — it
// must never silently skip, because a skipped positive control is exactly
// the failure mode item 198 exists to prevent.
// ---------------------------------------------------------------------------
test('positive control on real historical bytes: 648401297:translations.js flags both footerPoweredBy and footerMadeWith', () => {
  const { execFileSync } = require('child_process');
  const fs = require('fs'), os = require('os'), path = require('path');

  let historicalSource;
  try {
    historicalSource = execFileSync('git', ['show', '648401297:translations.js'], {
      cwd: __dirname, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
    });
  } catch (e) {
    throw new Error(
      'POSITIVE CONTROL COULD NOT BE EXECUTED — this is a hard failure, not a skip. ' +
      '`git show 648401297:translations.js` failed (shallow clone? no git available?): ' + e.message
    );
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n198-'));
  try {
    const historicalPath = path.join(dir, 'translations.js');
    fs.writeFileSync(historicalPath, historicalSource);
    // The historical file ends with `module.exports = { translations, ... }`,
    // so a plain require() works exactly like it does for the live file.
    const historical = require(historicalPath);
    const result = prescanI18n({ dict: historical.translations });

    const poweredBy = findSuspect(result.suspects, 'landing.footerPoweredBy');
    assert(poweredBy, `expected landing.footerPoweredBy to be flagged against the real historical dictionary; got: ${JSON.stringify(result.suspects)}`);
    assert(poweredBy.signal === 'en-ko-parity' && poweredBy.severity === 'P1', `expected en-ko-parity/P1; got ${JSON.stringify(poweredBy)}`);

    const madeWith = findSuspect(result.suspects, 'landing.footerMadeWith');
    assert(madeWith, `expected landing.footerMadeWith to be flagged against the real historical dictionary; got: ${JSON.stringify(result.suspects)}`);
    assert(madeWith.signal === 'en-ko-parity' && madeWith.severity === 'P1', `expected en-ko-parity/P1; got ${JSON.stringify(madeWith)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
