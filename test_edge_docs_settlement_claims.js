/* test_edge_docs_settlement_claims.js — backlog 234, verifier round 2,
   FINDING 1(b): "Guard the class, because the prose is unguarded" (this is
   the same root as backlog row 267). No file in edge/*.md may claim, in an
   un-negated sentence, that this Worker settles a payment or moves real
   value — `verifyPayment()` (edge/x402-core.js:472-ish) only ever POSTs
   `<facilitator>/verify`; no `/settle` call exists anywhere in this repo
   (grep-provable — see the K-section below). edge/X402.md's "What this
   deliberately does NOT do" already states this correctly; edge/DEPLOY.md
   did not (verifier round 2 finding 1 — DEPLOY.md:336/352/339, all fixed
   this round, see product-loop-kit/specs/234-notes.md).

   WHY A NEW FILE, NOT test_agent_surface_rail_claims.js (the finding gave a
   choice): that file's claim shape is a NUMBER adjacent to a floor/ceiling
   phrase (a TVL/APY rail figure); this finding's claim shape is a VERB
   PHRASE asserting an action occurred (settles / moves value) — negated or
   not. These are different axes with different predicates and different
   failure modes; folding a verb-phrase-and-negation check into a number-
   extraction file would make ONE test file police two unrelated claim
   classes that can drift independently under a single shared "passed"
   banner — the resemblance-guard trap RAZOR.md example 5 (item 212) warns
   against one layer up. A second, narrowly-scoped file keeps each guard's
   population and predicate legible and independently red-provable.

   POPULATION — fs.readdirSync('edge') filtered to `.md`, NEVER a hardcoded
   file list, so a future edge/*.md doc is covered by construction the
   moment it exists (axis 3 / RAZOR's population rule; the exact axis the
   round-1 defect on this same item lived one layer below — axis 7,
   declaration vs executor — this one is the population-enumeration half of
   the same discipline).

   THE PREDICATE (widened, verifier round 3, backlog 234, FINDING 1) — see
   section B below for the full design note. Short version: text is split
   into clause-level chunks at `.`/`!`/`?`/`;` followed by whitespace
   UNCONDITIONALLY (no longer gated on the next character looking like a
   new sentence — round 2's gate on a capital/digit/quote/backtick/`*`/`(`
   is exactly what let a lowercase continuation slip through as one chunk,
   below), and additionally at `, but`/`, and`/`, so`; splitting never cuts
   inside a backtick-delimited inline-code span, so a code-shaped fragment
   like `` `settled=false; verified=false` `` stays one atomic chunk instead
   of being torn apart at its internal semicolons. A chunk is a VIOLATION
   iff it matches a settlement/value-movement claim pattern AND the claim
   is not excused — excused means a negation token appears BEFORE the
   claim within the chunk (not merely anywhere in the chunk, which is what
   round 2's whole-chunk check got wrong, below), OR a negation token is
   directly ATTACHED to the claim as its predicate value (`` `settled` is
   `false` ``, `settled=false` — negation grammatically after the claim
   word, not a separate, unrelated clause's negation bleeding forward).

   VERIFIER ROUND 2's TWO MISSES (both self-defeated in section D below,
   (vi) and (vii)) — the round-2 predicate split only when the character
   AFTER a terminator looked like a new sentence, and treated negation as
   "present anywhere in the chunk", both of which round 3 found holes in
   using the guard's own core verb:
     - `` `X402_MODE` "test" never settles; live mode can move real
       value.`` — MISSED: the `;` was followed by a lowercase `l` (not a
       capital/digit/quote/backtick/`*`/`(`), so round 2's next-char gate
       never split it, leaving one chunk whose
       "never" (from the FIRST clause) excused the SECOND clause's real,
       un-negated claim under round 2's whole-chunk negation check.
     - `Live mode settles the payment, and no retry is needed.` — MISSED:
       no comma-conjunction split existed at all, so "no" (negating an
       unrelated "retry", not the "settles" claim) excused the whole
       chunk under the same whole-chunk check.
   Round 3 fixes both: unconditional terminator splitting separates the
   first case into two chunks (the second chunk has NO negation token at
   all); the new `, and`/`, but`/`, so` split separates the second case
   into two chunks the same way. Given that clause-level splitting alone
   resolves both misses, section B further scopes the negation check to
   "before the claim within its own chunk" (rather than "anywhere in the
   chunk") specifically so an unrelated negation earlier in a chunk that
   ISN'T fully clause-split (a conjunction outside the `but`/`and`/`so`
   list, e.g. `yet`/`though`/`while`/`or` — see the residual-gap paragraph
   below) cannot silently excuse a later, different claim in the same
   chunk.

   RESIDUAL GAP (stated honestly, not fixed — natural-language negation
   is not solvable by a regex predicate): (1) conjunctions other than
   `, but`/`, and`/`, so` (e.g. `, yet`/`, though`/`, while`/`, or`) do not
   create a split point, so a negation in an earlier clause joined by one
   of THOSE words can still satisfy the "before the claim, same chunk"
   test even though it modifies a different clause — this predicate cannot
   distinguish that case from a genuine same-clause negation. (2) negation
   expressed through words/phrases outside the fixed `NEGATION_TOKENS_RE`
   list (e.g. "unable to", "fails to", "far from", or "won't" specifically
   — its `n't` does not register as the `n't` token because the apostrophe
   breaks word-boundary matching against the preceding "wo") is not
   recognized at all, so a real negation phrased that way would be
   FALSE-FLAGGED as a violation. Confirmed against the current, real
   edge/*.md population (section C): zero sentences trip either gap today.

   WHAT WIDENING THE PREDICATE TRIPPED, AND HOW IT WAS RESOLVED — two real,
   compliant constructions in edge/X402.md initially false-flagged under an
   earlier draft of this round's "negation before the verb" rule, both
   FIXED IN THE PREDICATE, not by rephrasing the docs (both are accurate,
   necessary descriptions of the literal `X-PAYMENT-RESPONSE` header
   fields and are not being softened): (1) `` `settled=false` `` and
   "`settled` is `false`" put the negation grammatically AFTER the claim
   word, not before it — the ATTACHED_NEGATION_RE carve-out (section B)
   recognizes this specific "claim, then its own predicate value" shape
   without reopening round 2's "negation anywhere in the chunk" hole (see
   self-defeat (viii)/(ix) for both the carve-out and its own anti-
   overreach proof). (2) "a test-mode payment is neither verified nor
   settled" used "neither"/"nor", which round 2's `NEGATION_TOKENS_RE` list
   never included — added to the list (a strict, additive widening of
   recognized negation vocabulary, catching a real construction the
   pre-round-3 list silently mis-handled by accident of an unrelated
   distant "never" rather than by actually recognizing "neither/nor").
   Neither fix weakens detection of the two round-3 misses above: both
   misses have ZERO negation tokens anywhere near the violating clause
   (proven by self-defeat (vi)/(vii)), so no attachment or vocabulary
   carve-out could ever excuse them.

   Run: node test_edge_docs_settlement_claims.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0;
let total = 0;
function ok(cond, msg) { total++; assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { total++; assert.strictEqual(a, b, msg); passed++; }
function deq(a, b, msg) { total++; assert.deepStrictEqual(a, b, msg); passed++; }

const ROOT = __dirname;
const EDGE_DIR = path.join(ROOT, 'edge');

// ===========================================================================
// A. Population — derived from disk, never a hardcoded list.
// ===========================================================================
function listMarkdownFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .sort();
}

const POPULATION = listMarkdownFiles(EDGE_DIR);
ok(POPULATION.length > 0, 'sanity: edge/ contains at least one .md file to scan');
ok(POPULATION.includes('X402.md'), 'sanity: population includes X402.md (real disk read, not an empty/broken glob)');
ok(POPULATION.includes('DEPLOY.md'), 'sanity: population includes DEPLOY.md (the finding-1 defect site)');
console.log(`A. population — ${POPULATION.length} edge/*.md file(s), read from disk: ${POPULATION.join(', ')}`);

// ===========================================================================
// B. The predicate.
//
// "Chunk" = a coarse, markdown-aware split: paragraphs are joined across
// wrapped source lines first (so a claim wrapped across two lines is not
// artificially split at the line break), THEN cut on `|` (table cells,
// unchanged from round 2 — see below), THEN cut UNCONDITIONALLY on `.`,
// `!`, `?`, or `;` followed by whitespace, and ALSO on `, but`/`, and`/
// `, so` (verifier round 3, backlog 234, FINDING 1). Round 2's splitter
// only cut a sentence terminator when the NEXT character looked like a new
// clause (capital/digit/quote/backtick/`*`/`(`) — that gate is exactly what
// let both of round 3's misses through (see the header comment above):
// `never settles; live mode can move real value.` was never split at the
// `;` because `l` is lowercase, and `settles the payment, and no retry is
// needed.` was never split at all, because round 2 had no comma-conjunction
// rule. Splitting is deliberately NOT allowed to cut inside a backtick-
// delimited inline-code span — `` `settled=false; verified=false;
// checked=structural; mode=test` `` is one atomic code token describing an
// X-PAYMENT-RESPONSE header's fields, not three prose sentences, and
// splitting on its internal semicolons would tear a compliant, honest
// assertion (`settled` IS `false`) into pieces whose negation ("false")
// no longer looks attached to the claim it modifies (see the ATTACHED
// check below, and section C's real-population run, which is what
// surfaced this specific false-positive risk during development).
//
// A chunk that is over-split (e.g. a semicolon inside an unrelated
// abbreviation) can only make chunks SMALLER — it can never merge an
// un-negated claim into an unrelated chunk that happens to carry a
// negation word, so an over-split never manufactures a false negative; it
// can occasionally produce a false POSITIVE (a legitimate long sentence
// split so its negation lands in the "wrong" chunk) — the true-negative
// check in section C is what proves that isn't happening on the real,
// current population.
// ===========================================================================

/** Splits `text` on `.`/`!`/`?`/`;`+whitespace and on `, but`/`, and`/
 * `, so`, UNCONDITIONALLY — except never while inside a backtick-delimited
 * inline-code span (tracked by toggling `inCode` on every literal `` ` ``).
 * A manual scanner, not a single split-regex, because "don't split inside
 * backticks" needs state (am I currently inside a span?) that a stateless
 * regex alternation can't carry across the string. */
function splitOnSentenceBoundaries(text) {
  const parts = [];
  let cur = '';
  let inCode = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '`') {
      inCode = !inCode;
      cur += ch;
      i++;
      continue;
    }
    if (!inCode) {
      if (/[.!?;]/.test(ch) && /\s/.test(text[i + 1] || '')) {
        cur += ch;
        parts.push(cur);
        cur = '';
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        i = j;
        continue;
      }
      const conjunctionMatch = text.slice(i).match(/^,\s+(?:but|and|so)\s+/i);
      if (conjunctionMatch) {
        parts.push(cur);
        cur = '';
        i += conjunctionMatch[0].length;
        continue;
      }
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function splitIntoChunks(text) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  const paragraphs = normalized.split(/\n\s*\n/);
  const chunks = [];
  for (const para of paragraphs) {
    const collapsed = para.replace(/\s+/g, ' ').trim();
    if (!collapsed) continue;
    // Markdown TABLE CELLS (`|`-delimited) do not continue a sentence
    // across the pipe — a claim in one cell and an unrelated negation in a
    // DIFFERENT cell of the same table row must never be allowed to
    // cross-qualify each other (this is the actual mechanism that made
    // DEPLOY.md's env-var table hide its own violation from an earlier,
    // paragraph-only version of this splitter: every row shares one
    // paragraph with no blank lines between them, so a `.`/`;`/`?`/`!`-only
    // split still left the claim and a LATER row's unrelated "no address
    // invented" sharing one chunk). Split on `|` unconditionally, before
    // the sentence-terminator split — `|` appears in this repo's edge/*.md
    // only as table syntax or inside a fenced shell-pipe example (`curl …
    // | head -5`), neither of which carries settlement-shaped prose, so
    // this can only ever make chunks smaller, never merge two real claims.
    for (const cell of collapsed.split('|')) {
      const cellTrimmed = cell.trim();
      if (!cellTrimmed) continue;
      for (const p of splitOnSentenceBoundaries(cellTrimmed)) {
        const t = p.trim();
        if (t) chunks.push(t);
      }
    }
  }
  return chunks;
}

// A claim that settlement, or a movement of real value/funds, ACTUALLY
// HAPPENS. Deliberately excludes:
//  - the literal API path segment "/settle" (negative lookbehind for "/")
//    — naming the facilitator's /settle ENDPOINT is not itself a claim
//    that this Worker calls it;
//  - the noun "settlement" (the word-boundary \b immediately after
//    "settle"/"settled"/"settles" never matches inside "settlement" —
//    "settle" is followed by "ment", not a boundary, so the noun form is
//    structurally exempt without a separate exception rule).
//
// Each pattern carries a capturing group around the VERB morpheme itself
// ("settle*"/"move*") and is compiled with the `d` (hasIndices) flag so
// `matchedClaims` below can recover that group's own start index — for the
// two "value ... moves" / "funds ... move" (noun-first) patterns, the verb
// sits partway through the match, not at its start, and the "negation
// before the claim" check (below) needs the VERB's position, not the whole
// phrase's.
const CLAIM_PATTERNS = [
  { re: () => /(?<!\/)\b(settle(?:s|d|ing)?)\b/gdi, verbGroup: 1 },
  // "moves value" / "move real value" / "moving actual value" — up to 3
  // filler words between the verb and the noun, either order, plus the
  // "funds" synonym in both orders too.
  { re: () => /\b(move(?:s|d|ing)?)\s+(?:\S+\s+){0,3}?(?:real\s+)?value\b/gdi, verbGroup: 1 },
  { re: () => /\b(?:real\s+)?value\s+(?:\S+\s+){0,3}?(move(?:s|d|ing)?)\b/gdi, verbGroup: 1 },
  { re: () => /\b(move(?:s|d|ing)?)\s+(?:\S+\s+){0,3}?funds?\b/gdi, verbGroup: 1 },
  { re: () => /\bfunds?\s+(?:\S+\s+){0,3}?(move(?:s|d|ing)?)\b/gdi, verbGroup: 1 },
];

const NEGATION_TOKENS_RE = /\b(never|no|not|n't|none|nobody|nothing|neither|nor|without|false|zero|cannot)\b/gi;

// A negation token counts as ATTACHED to a claim when it directly follows
// the claim as its predicate value — `` `settled` is `false` `` or
// `settled=false` — rather than belonging to a separate, possibly
// unrelated clause. Deliberately narrow: up to a few punctuation/backtick/
// whitespace characters, an optional copula ("is"/"was"/"are"), then the
// negation token, with NO other word in between — this cannot reach across
// an intervening claim or clause the way "negation anywhere in the chunk"
// (round 2's bug) could.
const ATTACHED_NEGATION_RE = /^[\s`:=\-—]{0,4}(?:is|was|are)?[\s`:=\-—]{0,4}\b(never|no|not|n't|none|nobody|nothing|neither|nor|without|false|zero|cannot)\b/i;

/** Returns the list of { text, verbIndex, matchEnd } claim hits in `chunk`
 * — `verbIndex` is the START index of the matched VERB morpheme itself
 * (not the whole phrase, for the noun-first "value ... moves" patterns);
 * `matchEnd` is the END index of the whole match, used by the ATTACHED
 * check to look at what immediately follows the claim. */
function matchedClaims(chunk) {
  const hits = [];
  for (const spec of CLAIM_PATTERNS) {
    const re = spec.re();
    let m;
    while ((m = re.exec(chunk)) !== null) {
      const verbIndex = (spec.verbGroup && m.indices && m.indices[spec.verbGroup])
        ? m.indices[spec.verbGroup][0]
        : m.index;
      hits.push({ text: m[0], verbIndex, matchEnd: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++; // defensive: never used by the patterns above, kept for safety
    }
  }
  return hits;
}

/** Returns the list of { chunk, claims } violations in `content`. A claim
 * is EXCUSED (not a violation) iff a negation token appears BEFORE the
 * claim's verb within the same chunk, OR a negation token is directly
 * ATTACHED to the claim as its predicate value (see ATTACHED_NEGATION_RE
 * above) — "somewhere in the chunk" (round 2's rule) is deliberately no
 * longer sufficient on its own, since that is exactly what let an
 * unrelated negation from a different claim/clause excuse a real one (the
 * header comment's two round-3 misses). Pure, reused by both the
 * real-population scan (section C) and every self-defeat case (section D)
 * so both exercise the identical logic. */
function findSettlementViolations(content) {
  const violations = [];
  for (const chunk of splitIntoChunks(content)) {
    const claims = matchedClaims(chunk);
    if (claims.length === 0) continue;
    const negationIndices = [];
    NEGATION_TOKENS_RE.lastIndex = 0;
    let negMatch;
    while ((negMatch = NEGATION_TOKENS_RE.exec(chunk)) !== null) negationIndices.push(negMatch.index);
    const unexcusedClaims = claims.filter((claim) => {
      const negatedBefore = negationIndices.some((i) => i < claim.verbIndex);
      const negatedAttached = ATTACHED_NEGATION_RE.test(chunk.slice(claim.matchEnd));
      return !negatedBefore && !negatedAttached;
    });
    if (unexcusedClaims.length > 0) {
      violations.push({ chunk, claims: unexcusedClaims.map((c) => c.text) });
    }
  }
  return violations;
}

// ===========================================================================
// C. The real population, real bytes: zero violations today.
// ===========================================================================
console.log('\nC. real edge/*.md content — zero settlement/value-movement claims outside negation');

let realViolations = [];
let totalChunks = 0;
for (const name of POPULATION) {
  const content = fs.readFileSync(path.join(EDGE_DIR, name), 'utf8');
  totalChunks += splitIntoChunks(content).length;
  for (const v of findSettlementViolations(content)) {
    realViolations.push({ file: name, chunk: v.chunk, claims: v.claims });
  }
}
deq(
  realViolations,
  [],
  'no edge/*.md file may claim, in an un-negated chunk, that this Worker settles a payment or moves real value/funds — violation(s): ' +
    JSON.stringify(realViolations, null, 2)
);
console.log(`  0 violations across ${POPULATION.length} files (${totalChunks} chunks scanned)`);

// Anti-vacuity for the SCAN itself (distinct from section D's self-defeat
// of the PREDICATE): the population must actually contain settlement-shaped
// language for a "zero violations" result to mean "correctly compliant"
// rather than "the scan never looked at anything settlement-related at
// all". At least one CLAIM pattern must fire somewhere (in a NEGATED
// chunk — e.g. X402.md's "never settled" residue notes), proving the
// pattern set is exercised by real content, not just theoretically capable
// of matching.
{
  let claimMatchingChunks = 0;
  for (const name of POPULATION) {
    const content = fs.readFileSync(path.join(EDGE_DIR, name), 'utf8');
    for (const chunk of splitIntoChunks(content)) {
      if (matchedClaims(chunk).length > 0) claimMatchingChunks++;
    }
  }
  ok(claimMatchingChunks >= 3, `anti-vacuity: expected >=3 chunks to match a CLAIM pattern (negated, hence compliant) across the real population, found ${claimMatchingChunks} — a count of 0 would mean this scan never actually exercises its own patterns against real content`);
  console.log(`  ${claimMatchingChunks} chunks matched a CLAIM pattern (all correctly negated, hence 0 violations above) — proves the scan isn't vacuously silent`);
}

// ===========================================================================
// D. Self-defeat — inject settlement-claiming text into TEMP fixtures
//    (never the real edge/ files) and prove the SAME check function
//    (findSettlementViolations, unmodified) reports it. A green run in
//    section C is not evidence this guard works until this fires.
// ===========================================================================
console.log('\nD. self-defeat — injected settlement/value-movement claims ARE caught; negated ones are NOT');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-docs-settlement-selfdefeat-'));
try {
  // (i) A straightforwardly bad, un-negated sentence.
  const badContent =
    '# Injected fixture\n\n' +
    'In live mode this Worker verifies the payment and settles it, moving real value on-chain.\n';
  const badViolations = findSettlementViolations(badContent);
  ok(badViolations.length >= 1, 'self-defeat (i): an injected un-negated settlement claim IS reported as a violation');
  ok(/settles it/i.test(badViolations[0].chunk), 'self-defeat (i): the reported violation carries the offending chunk text');

  // (ii) The identical claim words, properly negated — must NOT be
  // flagged (proves this isn't a bare keyword match on "settle").
  const goodContent =
    '# Injected fixture\n\n' +
    'This Worker never settles a payment and no value ever moves on our side.\n';
  const goodViolations = findSettlementViolations(goodContent);
  deq(goodViolations, [], 'self-defeat (ii): the same claim words, properly negated, are NOT flagged');

  // (iii) THE ACTUAL historical defect, verbatim (pre-fix DEPLOY.md:336):
  // one semicolon-joined sentence, negated in its first clause ("never
  // settles"), un-negated in its second ("can move real value"). Proves
  // clause-level (not whole-sentence, not whole-line) splitting is what
  // makes this guard non-vacuous against the EXACT defect this finding
  // named — a naive "does this whole sentence contain a negation word
  // anywhere" check would have let "never" in the first clause excuse the
  // second clause's real claim, and would have stayed green on the actual
  // pre-fix bytes.
  const historicalBadLine =
    '`X402_MODE` | `"test"` (never defaults to live) | `"test"` accepts a well-formed TEST-network payment ' +
    'but never settles; `"live"` verifies against a real facilitator and can move real value.';
  const historicalViolations = findSettlementViolations(historicalBadLine);
  ok(
    historicalViolations.length >= 1,
    'self-defeat (iii): the EXACT pre-fix DEPLOY.md:336 wording is caught even though "never" appears earlier in the same source line — proves clause-level, not line/sentence-level, splitting'
  );
  ok(
    historicalViolations.every((v) => !/never settles/i.test(v.chunk)),
    'self-defeat (iii): the reported violation is the SECOND clause ("can move real value"), not the first, negated clause ("never settles") — the split genuinely separated them'
  );

  // (iv) The exact pre-fix DEPLOY.md:352 wording (also historical, also
  // now fixed) — an un-negated "once ready to actually settle" phrase.
  const historicalBadLine2 =
    'Flip `X402_ENABLED` to `true` (and, separately, `X402_MODE` to `"live"` once ready to actually settle) ' +
    '— the literal act of turning pricing on.';
  const historicalViolations2 = findSettlementViolations(historicalBadLine2);
  ok(historicalViolations2.length >= 1, 'self-defeat (iv): the EXACT pre-fix DEPLOY.md:352 wording ("once ready to actually settle") is caught');

  // (v) Negative control confirming the "/settle" ENDPOINT NAME and the
  // "settlement" NOUN are correctly exempt — a naive bare "settle"
  // substring match would over-flag both and force every honest residue
  // note in edge/X402.md into a rewrite it does not need.
  const endpointNameOnly =
    'This Worker never calls a facilitator\'s /settle endpoint; a real settlement path is a separate, ' +
    'future, human-owned decision.';
  const endpointViolations = findSettlementViolations(endpointNameOnly);
  deq(endpointViolations, [], 'self-defeat (v): the literal "/settle" endpoint name and the "settlement" noun, both properly negated/hedged, are NOT flagged');

  // (vi) VERIFIER ROUND 3's FIRST MISS, verbatim: a semicolon-joined
  // sentence where the character AFTER the `;` is lowercase, not a
  // capital/digit/quote/backtick/`*`/`(` — round 2's next-char-gated
  // splitter never cut here at all, so "never" (from clause 1) excused
  // clause 2's real, un-negated "can move real value" claim under round
  // 2's whole-chunk negation check. Round 3's unconditional `;`+whitespace
  // split must separate the two clauses regardless of what follows.
  const round3Miss1 =
    '`X402_MODE` "test" never settles; live mode can move real value.';
  const round3Miss1Violations = findSettlementViolations(round3Miss1);
  ok(
    round3Miss1Violations.length >= 1,
    'self-defeat (vi): VERIFIER ROUND 3 MISS 1, verbatim ("never settles; live mode can move real value.") — now caught, even though the character after `;` is lowercase'
  );
  ok(
    round3Miss1Violations.every((v) => !/never settles/i.test(v.chunk)),
    'self-defeat (vi): the reported violation is the SECOND clause ("can move real value"), not the negated first clause ("never settles")'
  );

  // (vii) VERIFIER ROUND 3's SECOND MISS, verbatim: a `, and`-joined
  // sentence where the negation ("no") belongs to an UNRELATED noun
  // ("retry"), not to the "settles" claim — round 2 had no comma-
  // conjunction split at all, so the whole-chunk check let "no" (anywhere
  // in the chunk) excuse a claim it never actually modified. Round 3's
  // `, and` split must separate the two clauses so "no retry is needed"
  // cannot excuse "Live mode settles the payment".
  const round3Miss2 =
    'Live mode settles the payment, and no retry is needed.';
  const round3Miss2Violations = findSettlementViolations(round3Miss2);
  ok(
    round3Miss2Violations.length >= 1,
    'self-defeat (vii): VERIFIER ROUND 3 MISS 2, verbatim ("settles the payment, and no retry is needed.") — now caught, even though "no" appears later in the same original sentence'
  );
  ok(
    round3Miss2Violations.every((v) => !/no retry/i.test(v.chunk)),
    'self-defeat (vii): the reported violation is the FIRST clause ("settles the payment"), and does not itself carry the unrelated "no retry" text — the comma-conjunction split genuinely separated them'
  );

  // (viii) Regression guard for the ATTACHED-negation carve-out itself
  // (the thing that keeps this widened predicate from false-flagging
  // edge/X402.md's own honest `` `settled` is `false` `` / `settled=false`
  // language — see section C, which runs this same logic over the real
  // files and gets zero violations). Both idioms must stay compliant.
  const attachedIdioms = findSettlementViolations(
    'The header states `settled=false` on every branch. ' +
    'In other words, `settled` is `false` even in live mode.'
  );
  deq(attachedIdioms, [], 'self-defeat (viii): `settled=false` and "`settled` is `false`" — negation grammatically ATTACHED to the claim as its predicate value, even though it appears AFTER the claim word — are NOT flagged');

  // (ix) Anti-overreach control for (viii): a negation that merely
  // appears SOMEWHERE AFTER the claim, but is not attached to it as a
  // predicate value (a different word sits between them), must still be
  // flagged — proves the (viii) carve-out is narrowly scoped to true
  // adjacency, not a reopening of round 2's "negation anywhere in the
  // chunk, in either direction" hole.
  const notActuallyAttached = findSettlementViolations(
    'This Worker settles the payment yet reports false telemetry elsewhere in the log.'
  );
  ok(
    notActuallyAttached.length >= 1,
    'self-defeat (ix): a "false" that appears later in the chunk but is NOT directly attached to the claim ("settles ... yet reports false telemetry") is still flagged — the (viii) carve-out does not overreach into round 2\'s whole-chunk hole'
  );
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
ok(!fs.existsSync(tmpDir), 'self-defeat scratch dir cleaned up');

console.log(`\ntest_edge_docs_settlement_claims.js: ${passed}/${total} assertions passed`);
if (passed !== total) {
  process.exitCode = 1;
}
