/* Acceptance tests for the i18n raw-rendered-key detector (item 256).
   `collectI18nKeyNames()` / `scanRawRenderedKeys()` (audit-app.js) close the
   *rendered* leg of the class opened by item 190/198's `prescanI18n()` (the
   *source* leg — a key missing/mistranslated in translations.js itself).
   This item catches the sibling failure: the key IS present in the
   dictionary, but a `t()` lookup misses at RENDER time and the app prints
   the key's own name as if it were copy. Item 253's live defect —
   `.empty-state .empty-message` rendering the literal string
   `poolNotFoundTitle` — is the motivating instance, used below as a POSITIVE
   CONTROL, not as the definition of the check: the predicate is general over
   every key in both namespaces, on every surface, not a `poolNotFoundTitle`-
   or `dead-pool`-specific string match (spec 256's "Population" acceptance
   criterion).

   No browser, no network — pure fs+require+string scanning, exactly the
   test_audit_i18n_parity.js shape (run: node test_audit_raw_key_rendered.js).

   Spec 190's whole point, restated for this item: a filter returning zero is
   not evidence of health until it is shown able to return non-zero. Case 8
   below is the inverse of that: a filter returning zero on REAL rendered
   copy is not evidence of a well-tuned predicate until real copy is actually
   thrown at it — so that control uses every string VALUE in the real EN
   dictionary, not a hand-picked sample.

   2026-08-10 follow-up (leg B): a real Playwright run proved the
   dictionary-only population above is blind to a key DELETED from
   translations.js — the exact defect this item exists to catch (item 253's
   shape). Deleting `poolNotFoundTitle` from both namespaces (+
   translations.min.js) made `.empty-message` render the literal text
   "poolNotFoundTitle", and `node audit-app.js --only=dead-pool` returned
   `findings: []` — the population shrank exactly when the defect appeared.
   collectRenderedScriptSources()/collectReferencedKeyNames()/
   collectRawKeyPopulation() (also audit-app.js) close that gap: a second,
   independently-derived leg that reads t()/rootT() CALL SITES in the
   rendered product source, which survives a key being deleted from the
   dictionary because it never reads the dictionary. Cases 11-16 below cover
   it; cases 1-10 above are unchanged and still exercise leg A alone via
   collectI18nKeyNames()/scanRawRenderedKeys(). */

const {
  collectI18nKeyNames, scanRawRenderedKeys, I18N_RAW_KEY_SIGNALS,
  collectRenderedScriptSources, collectReferencedKeyNames, collectRawKeyPopulation,
} = require('./audit-app.js');
const { translations } = require('./translations.js');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// Tiny local walker — deliberately NOT the same function under test
// (flattenI18nDict), so case 8 below isn't just calling the implementation
// against itself.
function flattenValues(obj, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenValues(v, out);
    else out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Positive control — the motivating instance (item 253), as a control,
//    not a definition. Derived from the REAL dictionary at test time: if
//    poolNotFoundTitle is ever renamed/removed, this test fails loudly
//    instead of silently passing on a stale hardcoded string.
// ---------------------------------------------------------------------------
test('positive control: a real key name rendered raw (poolNotFoundTitle) is flagged, detail quotes it', () => {
  const keyNames = collectI18nKeyNames();
  assert(keyNames.has('poolNotFoundTitle'),
    'test assumption broken: poolNotFoundTitle must exist in the real dictionary for this control to mean anything');
  const rendered = 'Some heading\npoolNotFoundTitle\nSome other line';
  const hits = scanRawRenderedKeys(rendered, keyNames);
  assert(hits.length === 1, `expected exactly one finding; got ${JSON.stringify(hits)}`);
  assert(hits[0].includes('poolNotFoundTitle'), `expected the detail to quote the offending key; got: ${hits[0]}`);
});

// ---------------------------------------------------------------------------
// 2. Population invariant — the key set is large and spans both shapes
//    (dotted path + bare leaf) in both namespaces, not just one key.
// ---------------------------------------------------------------------------
test('population invariant: real key set is non-trivially sized and both shapes fire for both namespaces', () => {
  const keyNames = collectI18nKeyNames();
  assert(keyNames.size > 100, `expected > 100 derived key names against the real dictionary; got ${keyNames.size}`);

  // A top-level key (identical shape to its own leaf).
  assert(keyNames.has('tvl'), 'test assumption broken: "tvl" must be a real top-level key');
  assert(scanRawRenderedKeys('tvl', keyNames).length === 1, 'a line equal to the real top-level key "tvl" must fire');

  // A nested dotted path under planner.* ...
  assert(keyNames.has('planner.goalClaude'), 'test assumption broken: "planner.goalClaude" must be a real nested key path');
  assert(scanRawRenderedKeys('planner.goalClaude', keyNames).length === 1,
    'a line equal to the full nested dotted path "planner.goalClaude" must fire');

  // ...and that same key's bare leaf segment, the shape planner.js's makeT()
  // actually echoes on a miss.
  assert(keyNames.has('goalClaude'), 'test assumption broken: "goalClaude" (bare leaf of planner.goalClaude) must be in the derived set');
  assert(scanRawRenderedKeys('goalClaude', keyNames).length === 1,
    'a line equal to the bare leaf "goalClaude" must fire');
});

// ---------------------------------------------------------------------------
// 3. Runtime derivation — adding a key to the dictionary needs zero change
//    to audit-app.js. Proven via opts.dict injection, the same convention
//    prescanI18n() already uses.
// ---------------------------------------------------------------------------
test('runtime derivation: a synthetic key injected via opts.dict is caught with no code change', () => {
  const injected = collectI18nKeyNames({
    dict: {
      en: { brandNewKeyNobodyHasEverSeen: 'x' },
      ko: { brandNewKeyNobodyHasEverSeen: 'x' }
    }
  });
  assert(injected.has('brandNewKeyNobodyHasEverSeen'), 'the injected key must appear in the derived set');
  const hits = scanRawRenderedKeys('brandNewKeyNobodyHasEverSeen', injected);
  assert(hits.length === 1, `expected the injected key to fire; got ${JSON.stringify(hits)}`);
  // And it must NOT be present in the real (non-injected) set — proves this
  // isn't leaking module-level state between calls.
  const real = collectI18nKeyNames();
  assert(!real.has('brandNewKeyNobodyHasEverSeen'), 'the injected key must not leak into the real dictionary derivation');
});

// ---------------------------------------------------------------------------
// 4. Exact-match-only — no substring matching. The spec's own example: an
//    English sentence containing the word "plan" must not fire.
// ---------------------------------------------------------------------------
test('exact-match only: a key mentioned inside a longer line never fires (no substring matching)', () => {
  const keyNames = collectI18nKeyNames();
  assert(keyNames.has('poolNotFoundTitle'), 'test assumption broken');
  const hits1 = scanRawRenderedKeys('Plan your garden with poolNotFoundTitle inside', keyNames);
  assert(hits1.length === 0, `a key merely appearing inside a longer line must not fire; got: ${JSON.stringify(hits1)}`);

  // "plan" alone, where "plan" itself is not a key name.
  assert(!keyNames.has('plan'), 'test assumption broken: bare "plan" must not itself be a real key name');
  const hits2 = scanRawRenderedKeys('plan is not a key on its own line, oh wait it is the whole line', keyNames);
  assert(hits2.length === 0, `a non-key line must never fire; got: ${JSON.stringify(hits2)}`);

  // The spec's own worked example: ordinary English prose containing "plan".
  const hits3 = scanRawRenderedKeys('Garden your savings with a plan that works for you.', keyNames);
  assert(hits3.length === 0, `an English sentence containing the word "plan" must never fire; got: ${JSON.stringify(hits3)}`);
});

// ---------------------------------------------------------------------------
// 5. Trim — a line padded with whitespace still matches after trim.
// ---------------------------------------------------------------------------
test('trim: leading/trailing whitespace around an otherwise-exact key line still fires', () => {
  const keyNames = collectI18nKeyNames();
  const hits = scanRawRenderedKeys('   poolNotFoundTitle   ', keyNames);
  assert(hits.length === 1, `expected the padded line to fire after trim; got: ${JSON.stringify(hits)}`);
});

// ---------------------------------------------------------------------------
// 6. Case sensitivity — an all-caps or all-lowercase rendering of a real
//    camelCase key must not fire (exact, case-sensitive match only).
// ---------------------------------------------------------------------------
test('case sensitivity: differently-cased renderings of a real key do not fire', () => {
  const keyNames = collectI18nKeyNames();
  assert(keyNames.has('poolNotFoundTitle'), 'test assumption broken');
  const upper = scanRawRenderedKeys('POOLNOTFOUNDTITLE', keyNames);
  assert(upper.length === 0, `an all-caps rendering must not fire (case-sensitive); got: ${JSON.stringify(upper)}`);
  const lower = scanRawRenderedKeys('poolnotfoundtitle', keyNames);
  assert(lower.length === 0, `an all-lowercase rendering must not fire (case-sensitive); got: ${JSON.stringify(lower)}`);
});

// ---------------------------------------------------------------------------
// 7. Dedup — the same offending key repeated across multiple lines yields
//    exactly one finding for that surface.
// ---------------------------------------------------------------------------
test('dedup: the same key on three separate lines yields exactly one finding', () => {
  const keyNames = collectI18nKeyNames();
  const rendered = 'poolNotFoundTitle\nSome unrelated line\npoolNotFoundTitle\n\npoolNotFoundTitle';
  const hits = scanRawRenderedKeys(rendered, keyNames);
  assert(hits.length === 1, `expected exactly one deduped finding; got ${JSON.stringify(hits)}`);
});

// ---------------------------------------------------------------------------
// 8. Real-copy false-positive control — the important one. Every string
//    value in the real EN dictionary, one per line, must produce ZERO hits.
//    If this fails, DO NOT weaken the predicate or add an allowlist: STOP
//    and report the colliding value(s) back — that's a design decision for
//    a human, not something to silently patch around here.
// ---------------------------------------------------------------------------
test('real-copy false-positive control: every real EN string value, rendered one-per-line, produces zero hits', () => {
  const values = flattenValues(translations.en, []).filter((v) => typeof v === 'string');
  assert(values.length > 100, `expected a large real EN value population; got ${values.length}`);
  const rendered = values.join('\n');
  const keyNames = collectI18nKeyNames();
  const hits = scanRawRenderedKeys(rendered, keyNames);
  assert(hits.length === 0,
    `REAL EN COPY COLLIDES WITH A KEY NAME — this is a design decision, not a bug to patch here. ` +
    `Colliding value(s): ${JSON.stringify(hits)}`);
});

// ---------------------------------------------------------------------------
// 9. Severity/signal wiring — the constant, and the literal check name used
//    in audit-app.js's finding() call (item-159 rule: read the source, don't
//    re-derive it by hand).
// ---------------------------------------------------------------------------
test('severity/signal wiring: I18N_RAW_KEY_SIGNALS is P1, and the exact check name is wired into audit-app.js', () => {
  assert(I18N_RAW_KEY_SIGNALS['i18n:raw-key-rendered'] === 'P1',
    `expected I18N_RAW_KEY_SIGNALS['i18n:raw-key-rendered'] === 'P1'; got ${JSON.stringify(I18N_RAW_KEY_SIGNALS)}`);
  const source = fs.readFileSync(path.join(__dirname, 'audit-app.js'), 'utf8');
  assert(source.includes("'i18n:raw-key-rendered'"),
    'expected the literal check name \'i18n:raw-key-rendered\' to appear in audit-app.js');
  assert(/finding\(s\.name, s\.vpLabel, 'i18n:raw-key-rendered'/.test(source),
    'expected the check to be wired into a finding(...) call inside auditText (or an equivalent surface driver)');
});

// ---------------------------------------------------------------------------
// 10. Malformed dictionary is inert — never throws, never noisy findings.
// ---------------------------------------------------------------------------
test('malformed dictionary is inert: dict:null returns an empty set without throwing', () => {
  let keyNames;
  try {
    keyNames = collectI18nKeyNames({ dict: null });
  } catch (e) {
    throw new Error('collectI18nKeyNames must never throw on dict: null; threw: ' + e.message);
  }
  assert(keyNames instanceof Set && keyNames.size === 0, `expected an empty Set; got size ${keyNames.size}`);
  assert(scanRawRenderedKeys('poolNotFoundTitle', keyNames).length === 0,
    'an empty key set must never produce findings, even for text that would otherwise match a real key');
});

test('malformed dictionary is inert: dict:{en:{}} (missing ko namespace) returns an empty set without throwing', () => {
  let keyNames;
  try {
    keyNames = collectI18nKeyNames({ dict: { en: {} } });
  } catch (e) {
    throw new Error('collectI18nKeyNames must never throw on a dict missing ko; threw: ' + e.message);
  }
  assert(keyNames instanceof Set && keyNames.size === 0, `expected an empty Set; got size ${keyNames.size}`);
});

// ---------------------------------------------------------------------------
// 11. THE regression — leg B catches a key deleted from the dictionary. This
//    is the finding that motivated leg B: build a population from an
//    injected dictionary that does NOT contain `poolNotFoundTitle`, plus an
//    injected source file whose content contains the real call-site shape
//    `t('poolNotFoundTitle')`, and confirm a rendered line of that key
//    fires. The dictionary-only population (leg A alone) went blind at
//    exactly the moment the key was deleted — measured on a real render,
//    2026-08-10 (see this file's header comment and audit-app.js's
//    "2026-08-10 measurement" comment on I18N_RAW_KEY_SIGNALS).
// ---------------------------------------------------------------------------
test('regression: a key deleted from the dictionary is still caught via its t() call site (leg B)', () => {
  const dict = { en: { someUnrelatedKey: 'x' }, ko: { someUnrelatedKey: 'x' } }; // poolNotFoundTitle deliberately absent
  const files = [{ path: '/fake/app.js', source: "function render(pool) { if (!pool) return t('poolNotFoundTitle'); }" }];

  const dictOnly = collectI18nKeyNames({ dict });
  assert(!dictOnly.has('poolNotFoundTitle'),
    'test assumption broken: the injected dictionary must NOT contain poolNotFoundTitle');
  assert(scanRawRenderedKeys('poolNotFoundTitle', dictOnly).length === 0,
    'test assumption broken: leg A alone must NOT fire once the key is gone from the dictionary (this is the exact blind spot leg B closes)');

  const union = collectRawKeyPopulation({ dict, files });
  const hits = scanRawRenderedKeys('poolNotFoundTitle', union);
  assert(hits.length === 1, `expected leg B (the referenced-call-site leg) to catch the deleted key; got ${JSON.stringify(hits)}`);
  assert(hits[0].includes('poolNotFoundTitle'), `expected the detail to quote the offending key; got: ${hits[0]}`);
});

// ---------------------------------------------------------------------------
// 12. Leg B against the real repo — derived, not hardcoded. A non-trivial
//    referenced-key population that contains the real app.js:3587 call site.
// ---------------------------------------------------------------------------
test('collectReferencedKeyNames() against the real repo: non-trivial size, contains the real poolNotFoundTitle call site', () => {
  const refs = collectReferencedKeyNames();
  assert(refs instanceof Set, 'expected a Set');
  assert(refs.size > 50, `expected > 50 referenced key names against the real product source; got ${refs.size}`);
  assert(refs.has('poolNotFoundTitle'), 'expected the real app.js:3587 call site t(\'poolNotFoundTitle\') to be captured');
});

// ---------------------------------------------------------------------------
// 13. The file population leg B scans — derived from the render mechanism
//    (script tags + the addScript(...) dynamic-injection shape), never a
//    hand-maintained file list. Must include app.js (loaded dynamically by
//    home.html, not a static <script src> tag — item 244's boot-order
//    barrier) and planner.js, and must prefer the SOURCE over a minified/
//    compiled artifact whenever that source exists on disk.
// ---------------------------------------------------------------------------
test('collectRenderedScriptSources() against the real repo: includes app.js and planner.js, prefers source over .min/.compiled', () => {
  const files = collectRenderedScriptSources();
  assert(Array.isArray(files) && files.length > 0, 'expected a non-empty file list');
  const basenames = files.map((f) => path.basename(f.path));
  assert(basenames.includes('app.js'),
    `expected a file ending in app.js (home.html's dynamically-injected analytics bundle, mapped back to source); got: ${basenames.join(', ')}`);
  assert(basenames.includes('planner.js'),
    `expected a file ending in planner.js; got: ${basenames.join(', ')}`);
  for (const f of files) {
    if (/\.(?:min|compiled)\.js$/.test(f.path)) {
      // Independently strip infixes (not calling the implementation under
      // test) to check whether a source existed that should have been
      // preferred instead.
      let stripped = f.path, prev;
      do { prev = stripped; stripped = stripped.replace(/\.(?:compiled|min)\.js$/, '.js'); } while (stripped !== prev);
      assert(!fs.existsSync(stripped),
        `expected ${f.path} to have been replaced by its source ${stripped}, which exists on disk`);
    }
  }
});

// ---------------------------------------------------------------------------
// 14. Union is a real superset, sizes and membership all derived at test
//    time — never hardcoded counts.
// ---------------------------------------------------------------------------
test('collectRawKeyPopulation() is a superset of both legs against the real repo', () => {
  const legA = collectI18nKeyNames();
  const legB = collectReferencedKeyNames();
  const union = collectRawKeyPopulation();
  assert(union.size >= legA.size, `union (${union.size}) must be >= leg A (${legA.size})`);
  assert(union.size >= legB.size, `union (${union.size}) must be >= leg B (${legB.size})`);
  for (const k of legA) assert(union.has(k), `union missing leg A key: ${k}`);
  for (const k of legB) assert(union.has(k), `union missing leg B key: ${k}`);
});

// ---------------------------------------------------------------------------
// 15. Real-copy false-positive control, re-run against the WIDER (union)
//    population — the important one for leg B specifically, since it adds
//    brand-new candidate strings (referenced-but-not-dictionary key names)
//    that could in principle collide with real English copy. If this fails,
//    STOP and report the colliding values — do not weaken the predicate and
//    do not add an allowlist (same rule as case 8 above).
// ---------------------------------------------------------------------------
test('real-copy false-positive control (wider population): every real EN string value produces zero hits against collectRawKeyPopulation()', () => {
  const values = flattenValues(translations.en, []).filter((v) => typeof v === 'string');
  assert(values.length > 100, `expected a large real EN value population; got ${values.length}`);
  const rendered = values.join('\n');
  const union = collectRawKeyPopulation();
  const hits = scanRawRenderedKeys(rendered, union);
  assert(hits.length === 0,
    `REAL EN COPY COLLIDES WITH THE WIDER (union) POPULATION — this is a design decision, not a bug to patch here. ` +
    `Colliding value(s): ${JSON.stringify(hits)}`);
});

// ---------------------------------------------------------------------------
// 16. Inertness — absent/unreadable shells and an empty files array never
//    throw and never fabricate findings.
// ---------------------------------------------------------------------------
test('inertness: an absent shell path and an empty files array both return empty without throwing', () => {
  let files;
  try { files = collectRenderedScriptSources({ shells: ['/nonexistent/x.html'] }); }
  catch (e) { throw new Error('collectRenderedScriptSources must never throw on an absent shell; threw: ' + e.message); }
  assert(Array.isArray(files) && files.length === 0, `expected an empty array; got ${JSON.stringify(files)}`);

  let refs;
  try { refs = collectReferencedKeyNames({ files: [] }); }
  catch (e) { throw new Error('collectReferencedKeyNames must never throw on files: []; threw: ' + e.message); }
  assert(refs instanceof Set && refs.size === 0, `expected an empty Set; got size ${refs.size}`);
});

// ---------------------------------------------------------------------------
// 17. Computed/interpolated keys are NOT collected — a documented blind
//    spot, asserted here so it stays visible rather than silently relied on.
// ---------------------------------------------------------------------------
test('computed keys are not collected (documented blind spot)', () => {
  const files = [{ path: '/fake/computed.js', source: "t(someVar); t('a' + 'b'); t('realKey');" }];
  const refs = collectReferencedKeyNames({ files });
  assert(refs.has('realKey'), 'sanity: a normal single-literal call site must still be collected');
  assert(!refs.has('a'), 'a computed concatenation must not contribute its first literal fragment as a key');
  assert(!refs.has('b'), 'a computed concatenation must not contribute its second literal fragment as a key');
  assert(refs.size === 1, `expected exactly one collected key from this source; got ${JSON.stringify([...refs])}`);
});

console.log(`\ntest_audit_raw_key_rendered.js: ${passed} passed, ${failed} failed`);
if (process.exitCode) process.exit(process.exitCode);
