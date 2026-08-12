/* test_agent_surface_rail_claims.js — backlog 261 (spec 261 Leg A), widened
   in attempt 2 to fix verifier finding 1, widened again in attempt 3 to fix
   verifier finding on attempt 2 (see product-loop-kit/specs/261-notes.md,
   "Attempt 2" and "Attempt 3" sections).

   The machine-readable agent surface (the manifests/specs an agent actually
   parses, as opposed to the human-facing prose test_rail_floor_derivation.js
   already guards) stated the TVL floor as "$10M" in two places
   (openapi.json:17, tools/get_curated_pools.json:5) while the real,
   enforced floor had been $100K since commit 6fceca79bb — see
   product-loop-kit/specs/261.md's Evidence section. This is the machine-
   surface COUNTERPART to test_rail_floor_derivation.js (backlog 254's
   guard): same idea (derive the population at test time, assert every
   found claim against trust-rails.js, never a re-typed literal), applied to
   a different population and a different claim-shape (see below), matching
   that file's style/idiom rather than inventing a second one.

   ===========================================================================
   POPULATION — an explicit, enumerated boundary (attempt 3: this replaces
   attempt 2's framing, which stated the product-loop-kit/** exclusion as a
   side effect of a non-recursive glob rather than a deliberate boundary —
   exactly the gap that let docs/ slip through undetected for two attempts).
   ===========================================================================

   Population = every one of these, swept and enumerated by directory
   (attempt 3 checked every top-level directory in the repo for *.md/*.json
   content — see 261-notes.md's "Attempt 3" section for the full per-
   directory sweep log):

     INCLUDED, machine-manifest role (JSON/txt an agent parses as structured
     data; matched with the FULL claim-shape set, see below):
       - openapi.json
       - tools/*.json
       - .well-known/** (recursive) *.json
       - llms.txt, llms-full.txt

     INCLUDED, human-prose-doc role (hand-authored Markdown describing the
     product/system; matched with the NARROWER, anchored claim-shape set,
     see "PROSE vs MANIFEST claim shapes" below):
       - *.md (repo root ONLY — no `**`, so this does NOT recurse; kept
         non-recursive on purpose, see EXCLUDED below)
       - docs/** (recursive) *.md (attempt 3: NEW. `docs/` is present-tense product/
         architecture documentation, not an archive — see EXCLUDED's
         product-loop-kit entry for the contrast)
       - edge/*.md (attempt 3: widened from the hand-typed single file
         `edge/API.md` attempt 1/2 used, to also cover `edge/DEPLOY.md`
         and any future `edge/*.md` doc without editing this test)

   EXCLUDED, BY ROLE (each checked in attempt 3's sweep and confirmed to
   carry either zero rail-figure claims today, or claims that are not
   statements about DeFi Garden's own trust rails — see 261-notes.md
   "Attempt 3" for the grep evidence per directory):

     - product-loop-kit/** — the loop's own historical record (`LOG.md`,
       `BACKLOG.md`, `specs/*.md`). It quotes past rail values verbatim AS
       HISTORY (this very item's own spec, `specs/261.md`, quotes "$10M" in
       its Evidence section describing the bug; `specs/226.md` and
       `specs/104-notes.md` do too). Rewriting history there to satisfy this
       scanner would itself be a defect. Achieved by the root-only `*.md`
       pattern (not recursive), NOT by a hand-typed exclude — if it were
       convenience, root `*.md` would never have been added to the
       population at all.
     - pools/**, tokens/**, chains/**, ko/** (≈7,900 files combined) — CI-
       generated SEO pages (`generate-pool-pages.js`, `generate-token-
       pages.js`, `generate-chain-pages.js`; `ko/` is their Korean mirror).
       These are build ARTIFACTS regenerated from `trust-rails.js`/live data
       on every run, not hand-typed prose — the exact opposite failure mode
       this test guards against (a human typing a stale literal). Verified
       in attempt 3: `grep -rl '\$10M' pools/ tokens/ chains/ ko/` → zero
       hits: every one of these ~7,900 files already correctly states
       $100K/omits the figure. Including them would inflate the population
       >300× to guard a class of file that self-heals on every regen.
     - spotlights/** — same generated-artifact role (`generate-spotlight.js`
       writes `CADENCE.md`; header says "do not hand-edit"); its dollar
       figures are per-pool TVL data points (like llms.txt's per-chain
       figures), not rail claims. Zero rail-shaped claims found.
     - .well-known/agent-skills/** (recursive) *.md — a third-party generic agent-skill
       reference package (Hermes Agent's "agentic-readiness" skill), not
       DeFi-Garden-specific product documentation. Zero DeFi-Garden rail
       claims found (the one dollar figure present, "$200M TVL" in
       `references/ai-visibility-audit.md`, is a marketing claim about an
       unrelated third-party site, confirmed in attempt 1).
     - .claude/**, .github/**, .impeccable/** — agent/CI operational tooling
       and design-critique logs, not product documentation. Zero rail claims
       found in any (`.claude/agents/verifier.md`, `.impeccable/critique/
       *.md`, `.github/** (recursive) *.md`).
     - data/, assets/, fonts/, og/, src/, stories/, telegram-bot/,
       test-fixtures/, test_fixtures/, workers/ — confirmed to contain zero
       `*.md` files (`find <dir> -name '*.md'`), so there is nothing to
       include or exclude; listed here so this boundary is genuinely
       enumerated rather than silently assumed.

   A file added tomorrow inside any INCLUDED glob is covered automatically,
   without editing this test (see VERIFY step 3 / attempt-3 non-vacuity
   proof in 261-notes.md).

   ===========================================================================
   CLAIM-SHAPED SCAN — two shape sets, by population role (attempt 3: new)
   ===========================================================================

   A TVL-floor claim is a money figure immediately adjacent to a floor
   phrase; an APY-limit claim is a percent immediately adjacent to a ceiling
   phrase. This is what keeps llms.txt's/llms-full.txt's hundreds of
   legitimate per-chain TVL figures (e.g. "Ethereum ($86.9B TVL)") OUT of
   the population WITHOUT excluding either file — an exclusion list would be
   exactly the too-narrow check the spec's RAZOR reference warns against.

   Attempt 3 finding (surfaced by the docs/ widening itself, fixed the same
   day, not shipped broken): the FULL shape set's two most generic patterns —
   bare `TVL >= $X` / `TVL ≥ $X` and bare `APY <= X%` / `capped at X%` — are
   safe against every MACHINE-MANIFEST file (they only ever describe the
   platform's own default floor there) but are NOT safe against human prose:
   `docs/garden-planner-v2-spec.md` legitimately uses the identical bare
   shape to state THREE DIFFERENT, intentional, feature-specific curation
   thresholds that are not DEFAULT_MIN_TVL/APY_SANITY_LIMIT at all —
   "TVL ≥ $50M" (the established-stablecoin tier), "TVL ≥ $10M, APY ≤ 20%"
   (the RWA-fallback tier) — see CLAUDE.md's "Plan archetypes". Matching
   these against DEFAULT_MIN_TVL/APY_SANITY_LIMIT would be a false positive:
   these values are supposed to differ from the platform floor; they are not
   an out-of-sync mirror of it. `docs/organic-traffic-loop-of-loops.md`
   similarly states "APY <= 0.01%" for the unrelated SEO-hygiene gate (a
   real, different, correctly-$1000/0.01%-floored filter — see
   `docs/discovery-data-layer-134.md`'s $1000 CI-transient row).

   So: MACHINE-MANIFEST files (openapi.json, tools/*.json,
   .well-known/** (recursive) *.json, llms.txt, llms-full.txt) are scanned with the FULL
   pattern set (includes the generic bare shapes — safe there because these
   files only ever describe the one served API's own floor/ceiling).
   PROSE-DOC files (every `*.md`, root/docs/edge alike) are scanned with a
   NARROWER set that keeps only the shapes anchored to an explicit
   "default"/"minimum"/named-constant phrase (`DEFAULT_MIN_TVL = $X`,
   `$X default TVL floor`, `minimum TVL … $X`, `TVL of at least $X`,
   `APY_SANITY_LIMIT = X%`, `APY sanity limit X%`) and drops the two bare,
   context-free shapes that collide with feature-specific thresholds in
   prose. Verified in attempt 3 (see test below): the persona-tier lines in
   `garden-planner-v2-spec.md` are confirmed NOT captured; `CLAUDE.md` and
   `PRODUCT.md`'s real claims (anchored shapes) are still captured.

   Trade-off, disclosed: a *future* markdown doc that states the platform's
   real floor using the bare "TVL >= $X" shape (rather than one of the
   anchored phrasings) would not be caught. This is a deliberate, narrower
   coverage than the machine-manifest population gets, chosen because no
   current prose doc uses that shape to describe the actual platform floor
   (verified by grep in attempt 3), and the anchored shapes are what every
   real current site actually uses.

   KNOWN LIMITATION (unchanged from attempt 2, same shape as
   test_rail_floor_derivation.js's own documented one): a rail figure
   written as a bare, unformatted `NAME = value` with no `$`/`%` marker
   (`edge/API.md:50`'s `DEFAULT_MIN_TVL = 100000` / `APY_SANITY_LIMIT =
   1000`) is not flagged either way. Coverage limitation of the DETECTOR,
   not a vacuity bug in the SCAN — the anti-vacuity assertions below prove
   the scan finds real claims via the shapes it DOES cover. Also uncovered:
   rail SEMANTICS (a document describing rail *behaviour* wrongly in prose,
   as opposed to misstating its number, is not machine-checkable here at
   all). Both recorded per product-loop-kit/specs/261.md's residue bullet
   and 261-notes.md.

   Run: node test_agent_surface_rail_claims.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { DEFAULT_MIN_TVL, APY_SANITY_LIMIT, formatTvlFloor } = require('./trust-rails.js');

const ROOT = __dirname;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('agent-facing surface rail-claim scan — backlog 261\n');

const EXPECTED_TVL_TEXT = formatTvlFloor(DEFAULT_MIN_TVL);
const EXPECTED_APY = APY_SANITY_LIMIT;

// ---------------------------------------------------------------------------
// Population — globbed at test time, never a hand-typed file list. See
// header comment for the full enumerated INCLUDED/EXCLUDED boundary.
// ---------------------------------------------------------------------------

const MANIFEST_GLOB_PATTERNS = [
  'openapi.json',
  'tools/*.json',
  '.well-known/**/*.json',
  'llms.txt',
  'llms-full.txt',
];

const PROSE_GLOB_PATTERNS = [
  // Root-ONLY (no `**`) is deliberate — see header comment's EXCLUDED
  // section for why this is what keeps `product-loop-kit/**` out.
  '*.md',
  // Attempt 3: docs/ is present-tense product/architecture documentation,
  // not an archive — recurses (`**`) since docs/ has no nested subdirs
  // today, but should stay covered if it grows one.
  'docs/**/*.md',
  // Attempt 3: widened from the attempt-1/2 hand-typed single file
  // `edge/API.md` to the whole directory.
  'edge/*.md',
];

function globPopulation(patterns) {
  const matches = fs.globSync(patterns, { cwd: ROOT });
  return Array.from(new Set(matches))
    .filter((rel) => fs.statSync(path.join(ROOT, rel)).isFile())
    .sort();
}

const manifestPopulation = globPopulation(MANIFEST_GLOB_PATTERNS);
const prosePopulation = globPopulation(PROSE_GLOB_PATTERNS);
const population = Array.from(new Set([...manifestPopulation, ...prosePopulation])).sort();

console.log(`population: ${population.length} file(s) globbed (${manifestPopulation.length} manifest, ${prosePopulation.length} prose-doc)`);
console.log(JSON.stringify(population, null, 2));

test('population is non-vacuous and includes both known defect sites', () => {
  assert.ok(population.length >= 4, `expected >=4 agent-facing files globbed, got ${population.length}`);
  assert.ok(population.includes('openapi.json'), 'openapi.json must be in the globbed population');
  assert.ok(population.includes(path.join('tools', 'get_curated_pools.json')), 'tools/get_curated_pools.json must be in the globbed population');
  assert.ok(population.includes('llms.txt') && population.includes('llms-full.txt'), 'llms.txt/llms-full.txt must be in the globbed population');
  assert.ok(population.includes(path.join('edge', 'API.md')), 'edge/API.md must be in the globbed population');
});

test('attempt 2 (verifier finding 1): root-level project markdown is in the population, including the two files that stated the wrong figure', () => {
  assert.ok(population.includes('CLAUDE.md'), 'CLAUDE.md must be in the globbed population (was the un-caught finding-1 defect site)');
  assert.ok(population.includes('PRODUCT.md'), 'PRODUCT.md must be in the globbed population (was the un-caught finding-1 defect site)');
  assert.ok(population.includes('README.md') && population.includes('DESIGN.md'), 'other root *.md project docs must be swept in by the same glob, not hand-listed');
});

test('attempt 3 (verifier finding): docs/**/*.md and edge/*.md are in the population, including the two docs/ files that stated the wrong figure', () => {
  assert.ok(population.includes(path.join('docs', 'discovery-data-layer-134.md')), 'docs/discovery-data-layer-134.md must be in the globbed population (attempt-3 defect site)');
  assert.ok(population.includes(path.join('docs', 'feasibility-data-layer.md')), 'docs/feasibility-data-layer.md must be in the globbed population (attempt-3 defect site)');
  assert.ok(population.includes(path.join('docs', 'garden-planner-v2-spec.md')), 'docs/garden-planner-v2-spec.md must be in the globbed population (it has NO wrong claim — it exercises the prose-shape false-positive guard below)');
  assert.ok(population.includes(path.join('edge', 'DEPLOY.md')), 'edge/DEPLOY.md must be in the globbed population now that edge/*.md replaced the hand-typed edge/API.md-only pattern');
});

test('attempt 2/3: product-loop-kit/** and the generated SEO/spotlight trees are excluded from the population BY ROLE (see header comment), never leaked in by any widening', () => {
  const excludedRoots = ['product-loop-kit', 'pools', 'tokens', 'chains', 'ko', 'spotlights'];
  const leaked = population.filter((rel) => excludedRoots.some((r) => rel === r || rel.startsWith(r + path.sep)));
  assert.deepStrictEqual(leaked, [], `these roots must never appear in the population: ${JSON.stringify(leaked)}`);
});

// ---------------------------------------------------------------------------
// Claim-shaped scan — two shape sets, by population role. See header
// comment ("CLAIM-SHAPED SCAN") for why prose gets the narrower set.
// ---------------------------------------------------------------------------

// TVL: captures the money-figure TEXT as written (e.g. "$100K"), compared
// below as a STRING against formatTvlFloor(DEFAULT_MIN_TVL) — never parsed
// back into a number, which would require a second formatter (exactly what
// trust-rails.js's own header comment warns against).
const TVL_GENERIC_PATTERNS = [
  // Bare shapes — safe only on machine-manifest files (see header comment;
  // in prose these collide with feature-specific, intentionally-different
  // thresholds like docs/garden-planner-v2-spec.md's persona tiers).
  /TVL\s*(?:>=|≥)\s*(\$[\d,.]+[KMBkmb]?)/gi,
];
const TVL_ANCHORED_PATTERNS = [
  // Anchored shapes — explicit "at least"/"minimum"/named-constant/"default"
  // framing, safe on both populations.
  /TVL of at least\s*(\$[\d,.]+[KMBkmb]?)/gi,
  /minimum TVL[^$\n]{0,24}?(\$[\d,.]+[KMBkmb]?)/gi,
  // Attempt 2: CLAUDE.md's "`DEFAULT_MIN_TVL = $100K` everywhere". Requires
  // a `$`-formatted value — deliberately does NOT match edge/API.md:50's
  // bare-number "DEFAULT_MIN_TVL = 100000" (see header comment, KNOWN
  // LIMITATION — that shape stays a known, documented gap).
  /DEFAULT_MIN_TVL\s*=\s*(\$[\d,.]+[KMBkmb]?)/gi,
  // Attempt 2: PRODUCT.md's "$100K default TVL floor".
  /(\$[\d,.]+[KMBkmb]?)\s+default TVL floor/gi,
];

// APY: captures the percent NUMBER, compared below numerically against
// APY_SANITY_LIMIT.
const APY_GENERIC_PATTERNS = [
  // Bare shapes — machine-manifest only, same reasoning as TVL above
  // (docs/garden-planner-v2-spec.md's "APY ≤ 20%" RWA-tier cap and
  // docs/organic-traffic-loop-of-loops.md's "APY <= 0.01%" SEO-hygiene gate
  // are real, intentional, DIFFERENT thresholds, not APY_SANITY_LIMIT).
  /APY\s*(?:<=|≤)\s*([\d,.]+)\s*%/gi,
  /capped at\s*([\d,.]+)\s*%/gi,
];
const APY_ANCHORED_PATTERNS = [
  // Attempt 2: CLAUDE.md's "`APY_SANITY_LIMIT = 1000%`". Requires a
  // `%`-marked value — deliberately does NOT match edge/API.md:50's bare
  // "APY_SANITY_LIMIT = 1000 (percent)" (same documented gap as above).
  /APY_SANITY_LIMIT\s*=\s*([\d,.]+)\s*%/gi,
  // Attempt 2: PRODUCT.md's "APY sanity limit 1000%".
  /APY sanity limit\s*([\d,.]+)\s*%/gi,
];

function patternsFor(rel, generic, anchored) {
  // Prose (*.md, anywhere) gets the narrower, anchored-only set; every
  // other populated file (the machine-manifest population) gets the full
  // set. Decided by extension, not a per-file list — see header comment.
  return rel.endsWith('.md') ? anchored : [...generic, ...anchored];
}

function findClaims(patterns, content) {
  const found = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of patterns) {
      for (const m of line.matchAll(re)) {
        found.push({ line: i + 1, text: m[0].trim(), value: m[1].trim() });
      }
    }
  }
  return found;
}

const tvlClaims = [];
const apyClaims = [];

for (const rel of population) {
  const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const tvlPatterns = patternsFor(rel, TVL_GENERIC_PATTERNS, TVL_ANCHORED_PATTERNS);
  const apyPatterns = patternsFor(rel, APY_GENERIC_PATTERNS, APY_ANCHORED_PATTERNS);
  for (const c of findClaims(tvlPatterns, content)) tvlClaims.push({ file: rel, ...c });
  for (const c of findClaims(apyPatterns, content)) apyClaims.push({ file: rel, ...c });
}

console.log(`\nclaims found: ${tvlClaims.length} TVL-floor claim(s), ${apyClaims.length} APY-limit claim(s)`);

// --- The claim-shaped scan must not degrade into a whole-file number scan:
// a per-chain TVL figure ("Ethereum ($86.9B TVL)", llms.txt's/llms-full.txt's
// literal shape) must never match a TVL-FLOOR pattern. Proven directly
// against the exact quoted shape (deterministic, independent of the live
// data the committed files carry on any given day). ---
test('claim-shaped regex does not match a per-chain TVL figure shape (e.g. "Ethereum ($86.9B TVL)") — proves this is not a whole-file number scan', () => {
  const sample = '- Ethereum ($86.9B TVL) — https://www.defi.garden/?chain=Ethereum';
  for (const re of [...TVL_GENERIC_PATTERNS, ...TVL_ANCHORED_PATTERNS]) {
    re.lastIndex = 0;
    assert.ok(!re.test(sample), `pattern ${re} incorrectly matched a per-chain TVL figure: "${sample}"`);
  }
});

test('the real, committed llms.txt carries per-chain TVL figures yet none were captured as floor claims (the exclusion is shape-based, not a file exclusion)', () => {
  // llms-full.txt's "full estate" format lists bare URLs, not per-chain TVL
  // figures (only llms.txt's curated "Top Chains by TVL" section does) — so
  // this real-content check runs against llms.txt, the file that actually
  // exercises it; the synthetic test above already proves the pattern
  // itself rejects the shape regardless of which file it appears in.
  const perChainRe = /\(\$[\d,.]+[KMBkmb]?\s*TVL\)/;
  assert.ok(population.includes('llms.txt'), 'sanity: llms.txt must be in the globbed population for this check to mean anything');
  const content = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
  assert.ok(perChainRe.test(content), 'sanity: expected llms.txt to still contain a per-chain "($X TVL)" figure to test the exclusion against');
  // Every TVL claim actually captured from llms.txt must be the floor claim
  // (a bare money figure), never a "(...)"-wrapped per-chain one.
  const perChainLeaked = tvlClaims.filter((c) => c.file === 'llms.txt' && /^\(/.test(c.text));
  assert.deepStrictEqual(perChainLeaked, [], `a per-chain TVL figure was incorrectly captured as a floor claim: ${JSON.stringify(perChainLeaked)}`);
});

// --- Attempt 3: prove the prose-vs-manifest shape split actually prevents
// the false positive it exists to prevent, on the real committed file that
// exposed it (not just a synthetic sample). ---
test('attempt 3: docs/garden-planner-v2-spec.md\'s persona-tier TVL/APY thresholds ($50M, $10M, 20%) are NOT captured as rail claims — proves prose gets the narrower, anchored-only shape set', () => {
  assert.ok(population.includes(path.join('docs', 'garden-planner-v2-spec.md')), 'sanity: the file must be in the population for this guard to mean anything');
  const content = fs.readFileSync(path.join(ROOT, 'docs', 'garden-planner-v2-spec.md'), 'utf8');
  assert.ok(/TVL\s*(?:>=|≥)\s*\$50M/.test(content), 'sanity: expected the file to still state the established-stablecoin tier\'s $50M threshold');
  assert.ok(/APY\s*(?:<=|≤)\s*20%/.test(content), 'sanity: expected the file to still state the RWA tier\'s 20% APY cap');
  const leaked = [...tvlClaims, ...apyClaims].filter((c) => c.file === path.join('docs', 'garden-planner-v2-spec.md'));
  assert.deepStrictEqual(leaked, [], `persona-tier thresholds were incorrectly captured as platform rail claims: ${JSON.stringify(leaked)}`);
});

// --- Anti-vacuity, in-file (spec 261 §Change Leg A item 2's own bullet +
// Acceptance criteria): a scan that silently matches nothing must not read
// as green. ---
test('anti-vacuity: at least 2 TVL-floor claims found across the population', () => {
  assert.ok(tvlClaims.length >= 2, `expected >=2 TVL-floor claims, found ${tvlClaims.length}: ${JSON.stringify(tvlClaims)}`);
});
test('anti-vacuity: at least 2 APY-limit claims found across the population', () => {
  assert.ok(apyClaims.length >= 2, `expected >=2 APY-limit claims, found ${apyClaims.length}: ${JSON.stringify(apyClaims)}`);
});

// --- Every found claim is asserted equal to the value derived from
// trust-rails.js, with file:line in the failure message. -------------------
test(`every TVL-floor claim equals formatTvlFloor(DEFAULT_MIN_TVL) ("${EXPECTED_TVL_TEXT}")`, () => {
  const wrong = tvlClaims.filter((c) => c.value !== EXPECTED_TVL_TEXT);
  assert.deepStrictEqual(
    wrong,
    [],
    wrong.map((c) => `${c.file}:${c.line}: stated "${c.text}" (found "${c.value}", expected "${EXPECTED_TVL_TEXT}" per formatTvlFloor(DEFAULT_MIN_TVL))`).join('\n')
  );
});

test(`every APY-limit claim equals APY_SANITY_LIMIT (${EXPECTED_APY})`, () => {
  const wrong = apyClaims.filter((c) => Number(c.value.replace(/,/g, '')) !== EXPECTED_APY);
  assert.deepStrictEqual(
    wrong,
    [],
    wrong.map((c) => `${c.file}:${c.line}: stated "${c.text}" (found ${c.value}, expected ${EXPECTED_APY} per APY_SANITY_LIMIT)`).join('\n')
  );
});

console.log(`\n${passed} assertions passed (population: ${population.length} files; TVL claims: ${tvlClaims.length}; APY claims: ${apyClaims.length}; expected TVL floor: ${EXPECTED_TVL_TEXT}; expected APY limit: ${EXPECTED_APY})`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
