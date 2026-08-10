/* test_rail_floor_derivation.js — backlog 254 (spec 254 acceptance criterion 1
   and the non-vacuity requirement).

   The repo-wide scan: asserts ZERO occurrences of a hand-typed rail figure in
   a floor-claiming context, over a population DERIVED AT TEST TIME — never a
   hand-listed set of the nine sites spec 254's evidence table named. Two
   populations, matching the spec's own measurement method:

     1) The WHOLE translations.js dictionary (en + ko), walked recursively at
        test time (Object.keys, not a hand-typed key list). Every function
        leaf is INVOKED (with zero args, relying on the same default-
        parameter mechanism translations.js's four backlog-254 leaves use) so
        its INTERPOLATED output is inspected, not just its source text — a
        leaf could otherwise hide a bug a source-text grep would miss.
     2) Every served surface reachable by walking the filesystem: every root
        *.html, llms.txt/llms-full.txt, stories/*.html.

   Both populations feed the SAME shape-matcher audit-app.js's tvl-floor-claim
   rail-relative arm uses (findStatedTvlFloorAnyShape) — one detector, reused,
   never a second regex set that could drift from what leg 3 actually checks.

   PRINCIPLED EXCLUSION (not a hand-list of stating sites): a persona/story
   can state its OWN, deliberately-higher curation floor without that being a
   claim about the platform's DEFAULT_MIN_TVL rail — e.g. planner.js's
   personaStableDesc ("TVL ≥ $50M") and generate-stories.js's tomoko/lucia
   ("$50M+ TVL", TEMPERAMENTS.sleep.minTvl) are a persona's own bar, not the
   platform's. Excluded by a NAME-PATTERN rule (any `persona<X>Desc` leaf
   other than `personaDegenDesc`; the tomoko.html/lucia.html story files),
   generalizing to any future persona rather than naming today's specific
   leaves — audit-app.js's own leg-3 comment documents the identical
   reasoning for the story-file half of this exclusion.

   KNOWN LIMITATION (recorded per the spec's own "record it in the item's
   notes" allowance, see product-loop-kit/specs/254-notes.md): the shape
   matcher (5 fixed prose shapes) does not parse arbitrary natural language,
   so a floor claim phrased in some OTHER shape than the five spec 254's
   evidence table exhibits would not be flagged. This is a coverage
   limitation of the DETECTOR, not a vacuity bug in the SCAN — the non-
   vacuity test below proves the scan goes red on a real rail change via the
   shapes it DOES cover, which are the ones every current stating site uses.

   Run: node test_rail_floor_derivation.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { translations } = require('./translations.js');
const { DEFAULT_MIN_TVL, formatTvlFloor } = require('./trust-rails.js');
const { findStatedTvlFloorAnyShape } = require('./audit-app.js');

const ROOT = __dirname;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('repo-wide rail-floor derivation scan — backlog 254\n');

const EXPECTED = DEFAULT_MIN_TVL;
const EXPECTED_TEXT = formatTvlFloor(DEFAULT_MIN_TVL);

// ---------------------------------------------------------------------------
// Population 1: the dictionary — walked at test time, never a hand-list.
// ---------------------------------------------------------------------------

// Persona-family exclusion (see header comment). Matches ANY `persona<X>Desc`
// leaf name except `personaDegenDesc` — a naming-convention rule, not a list
// of today's specific leaves.
function isExcludedPersonaKey(leafName) {
  return /^persona[A-Z][A-Za-z]*Desc$/.test(leafName) && leafName !== 'personaDegenDesc';
}

function collectLeaves(obj, pathParts, out) {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const here = pathParts.concat(key);
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      collectLeaves(val, here, out);
    } else {
      out.push({ path: here, leafName: key, value: val });
    }
  }
}

const allLeaves = [];
for (const lang of Object.keys(translations)) {
  collectLeaves(translations[lang], [lang], allLeaves);
}

const dictSuspects = [];
let dictLeavesChecked = 0;
for (const leaf of allLeaves) {
  if (isExcludedPersonaKey(leaf.leafName)) continue;
  let rendered;
  if (typeof leaf.value === 'function') {
    // Zero-arg invocation: every OTHER function leaf either (a) has no `$`
    // in its output when its params are undefined (never a hardcoded
    // literal, so nothing to check), or (b) is one of the backlog-254 leaves
    // whose default parameter derives the real value — exactly the case this
    // scan exists to verify. A leaf whose zero-arg call throws (a few call
    // .toUpperCase()/.toLowerCase() on a required, non-defaulted arg) is
    // skipped, not asserted on — it carries no floor claim to check either
    // way, and is not this scan's concern.
    try { rendered = leaf.value(); } catch (e) { continue; }
  } else if (typeof leaf.value === 'string') {
    rendered = leaf.value;
  } else {
    continue; // numbers/arrays/etc. — never floor-claiming prose
  }
  dictLeavesChecked++;
  const found = findStatedTvlFloorAnyShape(rendered);
  if (found && found.val !== EXPECTED) {
    dictSuspects.push({ key: leaf.path.join('.'), text: found.text, statedVal: found.val });
  }
}

test(`dictionary population is non-vacuous (walked ${allLeaves.length} leaves across en+ko — spec 254's own evidence measured "1,106 leaves")`, () => {
  assert.ok(allLeaves.length >= 900, `expected >=900 leaves walked, got ${allLeaves.length}`);
});

test('dictionary mechanism sanity: the scan actually DETECTS a floor claim in the four backlog-254 leaves (a scan blind to them would pass vacuously)', () => {
  const en = translations.en, ko = translations.ko;
  assert.strictEqual(typeof en.landing.trustFloor, 'function', 'landing.trustFloor (en) must be a function leaf');
  assert.strictEqual(typeof ko.landing.trustFloor, 'function', 'landing.trustFloor (ko) must be a function leaf');
  assert.strictEqual(typeof en.planner.personaDegenDesc, 'function', 'planner.personaDegenDesc (en) must be a function leaf');
  assert.strictEqual(typeof ko.planner.personaDegenDesc, 'function', 'planner.personaDegenDesc (ko) must be a function leaf');
  assert.ok(findStatedTvlFloorAnyShape(en.landing.trustFloor()), 'detector must find a floor claim in landing.trustFloor (en)');
  assert.ok(findStatedTvlFloorAnyShape(ko.landing.trustFloor()), 'detector must find a floor claim in landing.trustFloor (ko)');
  assert.ok(findStatedTvlFloorAnyShape(en.planner.personaDegenDesc()), 'detector must find a floor claim in personaDegenDesc (en)');
  assert.ok(findStatedTvlFloorAnyShape(ko.planner.personaDegenDesc()), 'detector must find a floor claim in personaDegenDesc (ko)');
});

test(`dictionary: zero leaves (of ${dictLeavesChecked} carrying inspectable text) state a TVL floor differing from DEFAULT_MIN_TVL (${EXPECTED_TEXT})`, () => {
  assert.deepStrictEqual(dictSuspects, [], `stale/wrong dictionary floor claims: ${JSON.stringify(dictSuspects)}`);
});

// ---------------------------------------------------------------------------
// Population 2: served surfaces — walked off the filesystem at test time.
// ---------------------------------------------------------------------------

// tomoko/lucia/kevin each state their OWN, independent persona curation
// floor (TEMPERAMENTS.<key>.minTvl in generate-stories.js — "$50M+ TVL" /
// "$50M+ TVL" / "$10M+ TVL" respectively), never the platform's
// DEFAULT_MIN_TVL rail — same exclusion audit-app.js's rail-relative arm
// documents for the identical reason (see its own header comment above
// findStatedTvlFloorAnyShape). Kevin was added here in the 254 fix pass
// (verifier finding 1): his temperamentLabel used to hand-derive from
// DEFAULT_MIN_TVL, which was itself the bug — it now derives from his OWN
// TEMPERAMENTS.balanced.minTvl, exactly like tomoko/lucia already did, so he
// is excluded on the same footing as them, not a special case.
const STORY_FLOOR_EXCLUDE = new Set(['tomoko.html', 'lucia.html', 'kevin.html']);

function walkSurfaceFiles() {
  const files = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (/^[^.][^/]*\.html$/.test(f)) files.push(f);
  }
  for (const f of ['llms.txt', 'llms-full.txt']) {
    if (fs.existsSync(path.join(ROOT, f))) files.push(f);
  }
  const storiesDir = path.join(ROOT, 'stories');
  if (fs.existsSync(storiesDir)) {
    for (const f of fs.readdirSync(storiesDir)) {
      if (f.endsWith('.html') && !STORY_FLOOR_EXCLUDE.has(f)) files.push(path.join('stories', f));
    }
  }
  return files;
}

const surfaceFiles = walkSurfaceFiles();
const surfaceSuspects = [];
for (const rel of surfaceFiles) {
  let content;
  try { content = fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
  catch (e) { continue; }
  const found = findStatedTvlFloorAnyShape(content);
  if (found && found.val !== EXPECTED) {
    surfaceSuspects.push({ file: rel, text: found.text, statedVal: found.val });
  }
}

test(`served-surface population is non-vacuous (walked ${surfaceFiles.length} files: root *.html + llms*.txt + stories/*.html)`, () => {
  assert.ok(surfaceFiles.length >= 4, `expected >=4 files walked, got ${surfaceFiles.length}: ${JSON.stringify(surfaceFiles)}`);
  assert.ok(surfaceFiles.includes('home.html'), 'home.html must be in the walked population');
  assert.ok(surfaceFiles.includes('llms.txt') && surfaceFiles.includes('llms-full.txt'), 'llms.txt/llms-full.txt must be in the walked population');
  // stories/kevin.html is intentionally NOT in the walked population — see
  // STORY_FLOOR_EXCLUDE above (254 fix pass: kevin states his own persona
  // curation floor, same exclusion as tomoko/lucia, not the platform rail).
  assert.ok(!surfaceFiles.includes(path.join('stories', 'kevin.html')), 'stories/kevin.html must be excluded, same as tomoko/lucia');
});

test(`served surfaces: zero files (of ${surfaceFiles.length} walked) state a TVL floor differing from DEFAULT_MIN_TVL (${EXPECTED_TEXT})`, () => {
  assert.deepStrictEqual(surfaceSuspects, [], `stale/wrong surface floor claims: ${JSON.stringify(surfaceSuspects)}`);
});

console.log(`\n${passed} assertions passed (dictionary leaves walked: ${allLeaves.length}, checked: ${dictLeavesChecked}; surface files walked: ${surfaceFiles.length}; expected floor: ${EXPECTED_TEXT})`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
