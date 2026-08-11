/* test_item_inflight_check.js — spec 263 acceptance criteria (the gate for
 * check-item-inflight.js).
 *
 * Loop tooling, not product code — deliberately NOT in package.json's
 * test:serial chain (run-tests.js / test_test_registry.js only ever scan the
 * repo ROOT for test_*.js, and this file lives under product-loop-kit/, so
 * it is invisible to both — same placement test_pr_orphan_detector.js
 * already uses; see specs/263.md "OUT of scope").
 *
 * "Never call the matcher to check the matcher" (spec 263's population
 * requirement): the POPULATION and NEGATIVE-CONTROL sections below verify
 * every match check-item-inflight.js reports against a SECOND, deliberately
 * different re-extraction (independentRefHasId / independentExtractLeadId,
 * defined in this file, char-scanning rather than the module's regexes) —
 * not by re-calling extractLeadingId/boundedIdInString from the module
 * under test. If those functions agreed by construction, a broken matcher
 * that always returns true would sail through every assertion.
 *
 * Run: node product-loop-kit/test_item_inflight_check.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const KIT_DIR = __dirname;
const REPO_ROOT = path.join(KIT_DIR, '..');
const CLI_PATH = path.join(KIT_DIR, 'check-item-inflight.js');
const BACKLOG_PATH = path.join(KIT_DIR, 'BACKLOG.md');

const checker = require(CLI_PATH);
const {
  matchLegA,
  weakLegACandidates,
  matchLegB,
  matchLegC,
  checkInFlight,
  computeExitCode,
  parseGitRefs,
  parseGitSubjects,
  extractLeadingId,
} = checker;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exitCode = 1;
  }
}

console.log('test_item_inflight_check.js — spec 263\n');

// ---------------------------------------------------------------------------
// Independent re-extraction — a SEPARATE implementation from the module's
// own extractLeadingId()/refHasLoopIdToken(), used to verify every match the
// module reports rather than trusting the module's own claim about itself.
// Updated 2026-08-11 (verifier round 1 FAIL — see specs/263-notes.md) to
// track the FIXED leg A / leg B / leg C rules, not the original ones.
// ---------------------------------------------------------------------------

/** Leg A's new rule, independently re-implemented via a manual `indexOf`
 * scan for the literal substring "loop-" (rather than the module's global
 * regex `/loop-(\d+)/g`), reading the digit run that follows by hand and
 * comparing it NUMERICALLY to the queried id (so zero-padded ids agree). */
function independentRefHasLoopId(ref, id) {
  const s = ref || '';
  const idNum = Number(id);
  const marker = 'loop-';
  let searchFrom = 0;
  for (;;) {
    const idx = s.indexOf(marker, searchFrom);
    if (idx === -1) return false;
    let p = idx + marker.length;
    const digitsStart = p;
    while (p < s.length && s[p] >= '0' && s[p] <= '9') p++;
    if (p > digitsStart && Number(s.slice(digitsStart, p)) === idNum) return true;
    searchFrom = idx + marker.length;
  }
}

/** Leg A's WEAK-bucket rule, independently re-implemented: true if `ref`
 * carries `id` as a bounded digit run ANYWHERE (split-on-non-digit, unlike
 * the module's lookaround regex) but is NOT a genuine loop-<id> token per
 * independentRefHasLoopId above. */
function independentRefIsWeakCandidate(ref, id) {
  const tokens = (ref || '').split(/\D+/).filter(Boolean);
  const boundedAnywhere = tokens.includes(String(Number(id)));
  return boundedAnywhere && !independentRefHasLoopId(ref, id);
}

/** Leading-id extraction for commit subjects / PR titles, via manual
 * character scanning rather than the module's regexes. Implements the SAME
 * F1/F2/F3 predicate as extractLeadingId (see check-item-inflight.js file
 * header), by a genuinely different technique (no regex at all — hand
 * character-walking), so it can catch a regression in the module's regex
 * logic rather than merely restating it. Returns the leading id string, or
 * null. */
function independentExtractLeadId(text) {
  const s = text || '';

  const skipWs = (from) => {
    let k = from;
    while (k < s.length && /\s/.test(s[k])) k++;
    return k;
  };

  // F1: bounded leading digit run, whatever follows.
  const tryLeadingDigits = (from) => {
    const i = skipWs(from);
    let j = i;
    while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
    return j > i ? s.slice(i, j) : null;
  };

  const f1 = tryLeadingDigits(0);
  if (f1 !== null) return f1;

  // F2: word immediately followed by '(', a LEADING digit run (the scope's
  // remaining content, up to the ')', may be anything — widened 2026-08-11,
  // verifier round 2 FAIL, "design(247 world):" — the scope only has to
  // START with the digits, not equal them), ')', optional '!', optional
  // whitespace, ':'.
  const i0 = skipWs(0);
  const openParen = s.indexOf('(', i0);
  if (openParen > i0) {
    const word = s.slice(i0, openParen);
    if (/^[\w.-]+$/.test(word)) {
      let p = openParen + 1;
      const digitsStart = p;
      while (p < s.length && s[p] >= '0' && s[p] <= '9') p++;
      const closeParen = s.indexOf(')', p);
      if (p > digitsStart && closeParen !== -1) {
        let q = closeParen + 1;
        if (s[q] === '!') q++;
        q = skipWs(q);
        if (s[q] === ':') return s.slice(digitsStart, p);
      }
    }
  }

  // F3: strip ONE optional leading conventional-commit prefix ("type:" or
  // "type(scope):"), then re-try F1 on the remainder.
  const colonIdx = s.indexOf(':', i0);
  if (colonIdx > i0) {
    let head = s.slice(i0, colonIdx);
    if (head.endsWith('!')) head = head.slice(0, -1);
    const isPlainPrefix = /^[\w.-]+$/.test(head);
    const isScopedPrefix = /^[\w.-]+\([\w.-]+\)$/.test(head);
    if (isPlainPrefix || isScopedPrefix) {
      const rest = tryLeadingDigits(colonIdx + 1);
      if (rest !== null) return rest;
    }
  }

  return null;
}

/**
 * A THIRD implementation — distinct in PURPOSE from independentExtractLeadId
 * above, not just in technique. independentExtractLeadId mirrors the SAME
 * F1/F2/F3 predicate the shipped module implements, so it can catch a
 * regression in the module's own regex logic (its job is agreement).
 * permissiveLeadingIdCandidate does the opposite job on purpose: it answers
 * "does a HUMAN reading this text see an item id named at/near the lead?",
 * using a rule DELIBERATELY WIDER than F1/F2/F3, and it is used ONLY to
 * DERIVE the residue set below (never to assert agreement with the module —
 * disagreement is the expected, useful signal here).
 *
 * Three strategies, each returning the FIRST bounded, non-zero digit run
 * found "at/near the lead":
 *   (0) F1-equivalent — a leading digit run at the very start of the string.
 *   (a) a conventional-commit-shaped scope whose content STARTS with a digit
 *       run, however malformed what follows inside the parens is (the exact
 *       shape check-item-inflight.js's F2 was widened to catch this round —
 *       kept here too, independently, so agreement with the fixed module on
 *       this shape is a genuine cross-check rather than a shared
 *       implementation coincidence).
 *   (b) after optionally stripping ONE leading conventional-commit-shaped
 *       prefix (same optional strip as F3), exactly ONE bare free word
 *       (no colon, no parens inside it) immediately followed by a bounded
 *       digit run. THIS is the one shape F1/F2/F3 structurally cannot
 *       reach — a free word is not a digit run and is not a
 *       conventional-commit prefix, so no rung of the shipped ladder ever
 *       looks past it. A candidate that reduces to numeric ZERO (e.g. the
 *       "00" in "...full 00K TVL floor alignment...", a real, unrelated
 *       origin/main subject) is rejected — no BACKLOG id is ever 0, and no
 *       human reads "00K" as naming an item; without this filter the
 *       permissive rule would manufacture a phantom residue entry out of a
 *       subject that names no item at all (this is the exact false-positive
 *       risk flagged, but never measured, in the prior round's notes).
 * Deliberately does NOT: skip more than one free word (residue is scoped to
 * what a human sees "near" the lead, not anywhere in the subject — an id
 * five words in, e.g. "docs(loop): file the Pendle/fixed-yield direction as
 * backlog 150-153", is a genuine mid-sentence mention, not a lead, exactly
 * like the module's own "123: fix inspired by 263" exclusion); or match a
 * digit run that isn't the word's IMMEDIATE neighbour (rules out ids buried
 * later in the same subject, e.g. the trailing "(item 237)"/"(252)"/"(PR
 * #397 / Item 232)" parentheticals scattered through the real corpus, none
 * of which a human reads as the subject's LEAD item).
 */
function permissiveLeadingIdCandidate(text) {
  const s = text || '';
  const trimStart = (str) => str.replace(/^\s+/, '');
  const leadingDigits = (str) => {
    const m = str.match(/^(\d+)/);
    return m ? m[1] : null;
  };
  const nonZero = (digits) => digits !== null && Number(digits) !== 0;

  const head = trimStart(s);

  // (0) F1-equivalent.
  const f1 = leadingDigits(head);
  if (nonZero(f1)) return { id: f1, via: 'permissive-leading-digit' };

  // (a) conventional-commit-shaped scope whose content starts with digits.
  const scopeMatch = head.match(/^[\w.-]+\((\d+)[^)]*\)!?\s*:/);
  if (scopeMatch && nonZero(scopeMatch[1])) return { id: scopeMatch[1], via: 'permissive-scope' };

  // Optionally strip ONE leading conventional-commit-shaped prefix, same as
  // the shipped F3, before trying (b).
  let remainder = head;
  const prefixMatch = head.match(/^[\w.-]+(?:\([\w.-]+\))?!?\s*:\s*/);
  if (prefixMatch) remainder = head.slice(prefixMatch[0].length);

  // (b) exactly ONE bare free word, then a bounded digit run immediately.
  const wordThenDigits = remainder.match(/^([^\s:()]+)\s+(\d+)(?!\d)/);
  if (wordThenDigits && nonZero(wordThenDigits[2])) {
    return { id: wordThenDigits[2], via: 'permissive-free-word' };
  }

  return null;
}

/** Human-readable shape name per permissiveLeadingIdCandidate `via` tag —
 * used to GROUP the derived residue set below, so a claim like "both the
 * same shape" is a printed, test-derived fact, never a hand-written one. */
const RESIDUE_SHAPE_NAMES = {
  'permissive-free-word': 'FREE_WORD_PRECEDES_DIGIT (a bare word, not a conventional-commit prefix or scope, immediately precedes the id — the shipped F1/F2/F3 ladder has no rung that looks past a free word)',
};

// ---------------------------------------------------------------------------
// Real PR data — COPIED rows from the real GitHub PR list (fetched live,
// spot-checked 2026-08-11; the source scratch file
// /tmp/.../scratchpad/prs-real.json is NOT read here and is not a runtime
// dependency of this test — these rows are inline data). Covers both
// positive controls the spec names (266 -> #434, 227 -> #425) plus enough
// of the real population for the leg C arm of the population test below.
// ---------------------------------------------------------------------------

const REAL_PR_FIXTURE = [
  { number: 434, state: 'open', title: "266: WebMCP surface derives both trust rails from trust-rails.js + three-leg guard — PARKED at the attempt budget, do not merge as-is" },
  { number: 433, state: 'closed', title: '268: x402 protocol-conformance gaps (found while 234 merged concurrently)' },
  { number: 432, state: 'closed', title: '234: agentic commerce — x402 payment layer + Web Bot Auth identity on the agent Worker (ships dark)' },
  { number: 431, state: 'closed', title: "228: MCP server exposing 227's railed reads as agent-installable tools" },
  { number: 430, state: 'closed', title: '261: the machine-readable agent surface stated a trust rail 100× wrong — $10M vs the real $100K floor' },
  { number: 429, state: 'open', title: '260: instance (ii) fixed + guarded, instance (i) left open. Complementary to claude/loop-260' },
  { number: 425, state: 'closed', title: '227: public read-only railed Yield API on the edge Worker — the curated-answer endpoint agents cite' },
  { number: 424, state: 'open', title: '236 phase 1: one header band + one content-width token across all three analytics views' },
  { number: 419, state: 'open', title: '257: pool_view on the third pool-detail entry path — verifier PASS, but COLLIDES with a concurrent run on claude/loop-257 (do not merge blind)' },
  { number: 408, state: 'closed', title: '245: PR-orphan detector + BACKLOG id-collision guard' },
  { number: 414, state: 'closed', title: "docs(loop): record 177 CULLED — $10M default floor stays (bookkeeping for closed #332)" },
  { number: 396, state: 'closed', title: '231: occlusion-lens detection rate — PARKED (3 attempts) + CONCURRENT-BUILD COLLISION, defers to claude/loop-231. Do not merge as-is.' },
];

// ---------------------------------------------------------------------------
// Real git-side data, fetched ONCE and reused across tests below (a single
// `git ls-remote --heads origin` + `git log origin/main` — no repeated
// network calls per assertion). `git fetch origin main` is NOT re-run here;
// the harness invocation of this session already fetched, and this test
// suite is explicitly allowed to read whatever origin/main currently
// resolves to locally (leg B's own CLI re-fetches at run time; the point
// under test is the matching logic, not freshness).
// ---------------------------------------------------------------------------

const REAL_REFS = parseGitRefs(execFileSync('git', ['ls-remote', '--heads', 'origin'], { cwd: REPO_ROOT, encoding: 'utf8' }));
const REAL_SUBJECTS = parseGitSubjects(execFileSync('git', ['log', '--format=%H%x09%s', 'origin/main'], { cwd: REPO_ROOT, encoding: 'utf8' }));

// ---------------------------------------------------------------------------
// Section 1 — bounded-token matching, unit level (spec 263 "Change").
// ---------------------------------------------------------------------------

test('legA: claude/loop-263 matches id 263', () => {
  const m = matchLegA([{ ref: 'refs/heads/claude/loop-263', sha: 'aaa' }], '263');
  assert.strictEqual(m.length, 1);
});

test('legA: claude/loop-263-operator matches id 263 (id is a bounded token, suffix after it is not another digit)', () => {
  const m = matchLegA([{ ref: 'refs/heads/claude/loop-263-operator', sha: 'aaa' }], '263');
  assert.strictEqual(m.length, 1);
});

test('NEGATIVE CONTROL: legA does NOT match claude/loop-2630 against id 263 (263 followed by another digit)', () => {
  const m = matchLegA([{ ref: 'refs/heads/claude/loop-2630', sha: 'aaa' }], '263');
  assert.deepStrictEqual(m, []);
});

test('NEGATIVE CONTROL: legA does NOT match claude/loop-1263 against id 263 (263 preceded by another digit)', () => {
  const m = matchLegA([{ ref: 'refs/heads/claude/loop-1263', sha: 'aaa' }], '263');
  assert.deepStrictEqual(m, []);
});

// ---------------------------------------------------------------------------
// Section 1b — leg A "verifier round 1 FAIL" regression tests: the id must
// appear as a loop-<id> TOKEN, not merely as a bounded digit run anywhere in
// the ref (see specs/263-notes.md "Verifier round 1 FAIL"). A ref that is a
// bounded-digit-run coincidence, but NOT a loop-<id> token, must land in the
// weak bucket and must NEVER be reported by matchLegA.
// ---------------------------------------------------------------------------

test('FIX (leg A false positive): claude/inspiring-meitner-fs065n does NOT match id "065" via matchLegA (no loop-<id> token) — it is a bounded-digit-run COINCIDENCE, not a match', () => {
  const refs = [{ ref: 'refs/heads/claude/inspiring-meitner-fs065n', sha: 'aaa' }];
  assert.deepStrictEqual(matchLegA(refs, '065'), [], 'this ref must never be reported as a legA MATCH');
  const weak = weakLegACandidates(refs, '065');
  assert.strictEqual(weak.length, 1, 'this ref must appear in the weak/informational bucket instead');
  assert.strictEqual(weak[0].ref, 'refs/heads/claude/inspiring-meitner-fs065n');
});

test('legA: zero-padded id "065" matches both claude/loop-65 and claude/loop-065 (numeric equality, not string equality)', () => {
  assert.strictEqual(matchLegA([{ ref: 'refs/heads/claude/loop-65', sha: 'a' }], '065').length, 1);
  assert.strictEqual(matchLegA([{ ref: 'refs/heads/claude/loop-065', sha: 'a' }], '065').length, 1);
});

test('weakLegACandidates: a genuine loop-<id> token match is NOT also reported as weak (matched refs never double as weak candidates)', () => {
  const refs = [{ ref: 'refs/heads/claude/loop-263', sha: 'aaa' }];
  assert.deepStrictEqual(matchLegA(refs, '263').length, 1);
  assert.deepStrictEqual(weakLegACandidates(refs, '263'), []);
});

test('legB: leading "<id>: " subject matches (e.g. "268: file the x402 ... (#433)")', () => {
  const m = matchLegB([{ sha: 'x', subject: '268: file the x402 protocol-conformance gaps (#433)' }], '268');
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].via, 'leading-id');
});

test('legB: conventional-commit scope "fix(<id>): " matches (e.g. "fix(266): derive WebMCP trust rails ...")', () => {
  const m = matchLegB([{ sha: 'x', subject: 'fix(266): derive WebMCP trust rails from trust-rails.js' }], '266');
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].via, 'conventional-scope');
});

test('legB: conventional-commit breaking-change scope "type(<id>)!: " matches', () => {
  const m = matchLegB([{ sha: 'x', subject: 'feat(263)!: rewrite the in-flight check' }], '263');
  assert.strictEqual(m.length, 1);
});

test('NEGATIVE CONTROL: legB does NOT match a subject where the id appears mid-sentence ("123: fix inspired by 263")', () => {
  const m = matchLegB([{ sha: 'x', subject: '123: fix inspired by 263' }], '263');
  assert.deepStrictEqual(m, []);
});

// ---------------------------------------------------------------------------
// Section 1c — leg B/C "verifier round 1 FAIL" regression tests: F1 (leading
// digit run, ANY punctuation/words after) and F3 (strip one conventional-
// commit prefix, then F1). All eight are REAL PR titles named in the failure
// report (specs/263.md), quoted verbatim, that the pre-fix two-convention
// rule returned null for.
// ---------------------------------------------------------------------------

const REAL_PREVIOUSLY_MISSED_LEGB_EXAMPLES = [
  ['246 follow-up (docs only): point the collision references at row 260, not 259', '246'], // PR #427
  ["224 close-out: restore 19 BACKLOG rows destroyed by the merge that landed #392", '224'], // PR #415
  ['229 compound step: a green test run before commit is not evidence', '229'], // PR #404
  ['246 (HIGH): numeral cells in pool cards never wrap — repairs the anomaly hero splitting ⚠ from its number', '246'], // PR #426
  ['110 — KPI read-from-DB: ship the dashboard off canned numbers no more', '110'], // PR #272
  ["117.3 — planner “prefer steadier yield” toggle wired to the live blended rate", '117'], // PR #271
  ['145 (compound step) — playbook: derived-number-rails', '145'], // PR #303
  ['docs(loop): 118 — GSC "Excluded by noindex" diagnosis', '118'], // PR #269
];

for (const [subject, id] of REAL_PREVIOUSLY_MISSED_LEGB_EXAMPLES) {
  test(`FIX (leg B/C false negative): "${subject}" now matches id ${id} (was null under the old two-convention rule)`, () => {
    const m = matchLegB([{ sha: 'x', subject }], id);
    assert.strictEqual(m.length, 1, `expected a match for id ${id}; got none for subject "${subject}"`);
  });
}

test('legB F1: a leading digit run followed by arbitrary punctuation/words matches (not only immediately by ":")', () => {
  const m = matchLegB([{ sha: 'x', subject: '224 close-out: restore 19 BACKLOG rows' }], '224');
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].via, 'leading-id');
});

test('legB F3: stripping ONE leading conventional-commit prefix then applying F1 matches (e.g. "docs(loop): 118 — ...")', () => {
  const m = matchLegB([{ sha: 'x', subject: 'docs(loop): 118 — GSC diagnosis' }], '118');
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].via, 'conventional-prefix+leading-id');
});

// ---------------------------------------------------------------------------
// Section 1d — leg B/C "verifier round 2 FAIL" regression test: F2 widened
// to accept a MALFORMED conventional-commit scope whose leading token is the
// id, not only a scope equal to the id (see specs/263-notes.md "Verifier
// round 2 FAIL"). REAL commit subject, present in origin/main and as real
// PR #412's title.
// ---------------------------------------------------------------------------

test('FIX (leg B/C round 2 — malformed scope): "design(247 world): certificate button skin app-wide ... (#412)" now matches id 247 (was null before the round-2 F2 widening — the scope\'s leading token is the id, but the scope is not JUST the id)', () => {
  const subject = 'design(247 world): certificate button skin app-wide — the pool-detail counterfoil look on every action button (#412)';
  const m = matchLegB([{ sha: 'x', subject }], '247');
  assert.strictEqual(m.length, 1, `expected id 247 to match "${subject}"`);
  assert.strictEqual(m[0].via, 'conventional-scope');
});

test('KNOWN-BAD CONTROL (must still NOT match): "123: fix inspired by 263" does not match id 263 (mid-sentence mention, F1 finds id 123 which is a different id)', () => {
  assert.deepStrictEqual(matchLegB([{ sha: 'x', subject: '123: fix inspired by 263' }], '263'), []);
});

test('KNOWN-BAD CONTROL (must still NOT match): a free word leading the id, not a conventional-commit prefix, does not match ("loop: stop the build picker ... (148 was built twice today)")', () => {
  const subject = 'loop: stop the build picker re-taking items whose PR is already open (148 was built twice today)';
  assert.deepStrictEqual(matchLegB([{ sha: 'x', subject }], '148'), []);
});

test('RESIDUE (deliberately NOT special-cased, per RAZOR): "loop 102: RESOLVED …" does not match id 102 (a word precedes the id — F1/F2/F3 do not cover this shape)', () => {
  assert.deepStrictEqual(matchLegB([{ sha: 'x', subject: 'loop 102: RESOLVED …' }], '102'), []);
});

test('NEGATIVE CONTROL: legC does NOT match a PR title mentioning the id mid-sentence', () => {
  const m = matchLegC([{ number: 1, title: 'refactor: touches code near 263 but is not that item', state: 'open' }], '263');
  assert.deepStrictEqual(m, []);
});

test('legC: matches regardless of PR state (open/closed both match a leading id)', () => {
  const open = matchLegC([{ number: 1, title: '263: open pr', state: 'open' }], '263');
  const closed = matchLegC([{ number: 2, title: '263: closed pr', state: 'closed' }], '263');
  assert.strictEqual(open.length, 1);
  assert.strictEqual(closed.length, 1);
});

// ---------------------------------------------------------------------------
// Section 2 — computeExitCode, pure logic.
// ---------------------------------------------------------------------------

test('computeExitCode: any match -> 1 (COLLISION), even if leg C is unavailable', () => {
  const result = checkInFlight({ id: '1', refs: [{ ref: 'refs/heads/claude/loop-1' }], subjects: [], prs: undefined });
  assert.strictEqual(computeExitCode(result), 1);
});

test('computeExitCode: no match, leg C unavailable -> 3 (CLEAR-WITH-UNAVAILABLE-LEG)', () => {
  const result = checkInFlight({ id: '999999', refs: [], subjects: [], prs: undefined });
  assert.strictEqual(computeExitCode(result), 3);
});

test('computeExitCode: no match, leg C ran empty -> 0 (CLEAR)', () => {
  const result = checkInFlight({ id: '999999', refs: [], subjects: [], prs: [] });
  assert.strictEqual(computeExitCode(result), 0);
});

// ---------------------------------------------------------------------------
// Section 3 — POSITIVE CONTROLS against the REAL repo (spec 263 acceptance
// criteria: instances of the invariant, never its definition).
// ---------------------------------------------------------------------------

test('POSITIVE CONTROL: id 266 — legA matches refs/heads/claude/loop-266 against the REAL ls-remote output', () => {
  const m = matchLegA(REAL_REFS, '266');
  assert.ok(m.some((r) => r.ref === 'refs/heads/claude/loop-266'), `expected refs/heads/claude/loop-266 among matches; got ${JSON.stringify(m)}`);
});

test('POSITIVE CONTROL: id 266 — legC matches PR #434, with the real PR list injected (inline fixture)', () => {
  const m = matchLegC(REAL_PR_FIXTURE, '266');
  assert.ok(m.some((r) => r.number === 434), `expected PR #434 among matches; got ${JSON.stringify(m)}`);
});

test('POSITIVE CONTROL: id 227 — legB matches the merged commit subject on the REAL origin/main history', () => {
  const m = matchLegB(REAL_SUBJECTS, '227');
  assert.ok(m.some((r) => /^227:/.test(r.subject)), `expected a subject leading "227:" among matches; got ${JSON.stringify(m)}`);
});

test('POSITIVE CONTROL: id 227 — legC matches PR #425 in CLOSED (merged) state — proving leg C matches ANY state, not just open', () => {
  const m = matchLegC(REAL_PR_FIXTURE, '227');
  const hit = m.find((r) => r.number === 425);
  assert.ok(hit, `expected PR #425 among matches; got ${JSON.stringify(m)}`);
  assert.strictEqual(hit.state, 'closed', 'PR #425 fixture is CLOSED (merged) — the positive control specifically proves a non-open state still matches');
});

// ---------------------------------------------------------------------------
// Section 4 — NEGATIVE CONTROL: max(BACKLOG id) + 1 comes back CLEAR against
// the REAL repo (derived at test time, never hardcoded).
// ---------------------------------------------------------------------------

const backlogText = fs.readFileSync(BACKLOG_PATH, 'utf8');
const backlogIds = [...backlogText.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => m[1]);
const maxBacklogId = Math.max(...backlogIds.map(Number));
const unclaimedId = String(maxBacklogId + 1);

test('sanity: BACKLOG.md table parsed to a plausible population (>100 ids) before deriving max+1', () => {
  assert.ok(backlogIds.length > 100, `parsed only ${backlogIds.length} ids — the population parse is probably broken`);
});

test(`NEGATIVE CONTROL: id ${unclaimedId} (max BACKLOG id + 1, derived at test time) is CLEAR against real refs/subjects — no leg matches`, () => {
  const result = checkInFlight({ id: unclaimedId, refs: REAL_REFS, subjects: REAL_SUBJECTS, prs: [] });
  assert.strictEqual(result.anyMatch, false, `id ${unclaimedId} unexpectedly matched: ${JSON.stringify(result.allMatches)}`);
  assert.strictEqual(computeExitCode(result), 0);
});

// ---------------------------------------------------------------------------
// Section 5 — POPULATION invariant, derived at test time (spec 263's core
// requirement): every id from BACKLOG.md's table, crossed with the REAL
// git ls-remote refs and the REAL origin/main subject list (+ the inline PR
// fixture for leg C). For every match ANY leg reports, an INDEPENDENTLY
// re-extracted id (this file's own char-scanning functions, never the
// module's own extractLeadingId/refHasLoopIdToken) must equal the queried
// id. The 227/266 cases above are POSITIVE CONTROLS — instances, not the
// definition; this is the definition.
// ---------------------------------------------------------------------------

test('POPULATION invariant: every BACKLOG id x {real refs, real subjects, real PR fixture} match is independently re-verified to carry the queried id', () => {
  let legAMatchCount = 0;
  let legBMatchCount = 0;
  let legCMatchCount = 0;

  for (const id of backlogIds) {
    const result = checkInFlight({ id, refs: REAL_REFS, subjects: REAL_SUBJECTS, prs: REAL_PR_FIXTURE });

    for (const m of result.legA.matches) {
      legAMatchCount++;
      assert.ok(
        independentRefHasLoopId(m.ref, id),
        `legA reported a match for id ${id} on ref "${m.ref}", but the INDEPENDENT re-extraction disagrees — possible false positive`
      );
    }
    for (const m of result.legB.matches) {
      legBMatchCount++;
      const reExtracted = independentExtractLeadId(m.subject);
      assert.strictEqual(
        reExtracted, id,
        `legB reported a match for id ${id} on subject "${m.subject}", but independently re-extracted "${reExtracted}" — possible false positive`
      );
    }
    for (const m of result.legC.matches) {
      legCMatchCount++;
      const reExtracted = independentExtractLeadId(m.title);
      assert.strictEqual(
        reExtracted, id,
        `legC reported a match for id ${id} on PR #${m.number} title "${m.title}", but independently re-extracted "${reExtracted}" — possible false positive`
      );
    }
  }

  assert.ok(
    legAMatchCount > 0 && legBMatchCount > 0,
    `population sweep exercised ZERO real matches (legA=${legAMatchCount}, legB=${legBMatchCount}) — vacuous; the real repo has known landed/in-flight ids (227, 266, 268, ...) that must produce matches`
  );

  console.log(`    (population: ${backlogIds.length} BACKLOG ids × ${REAL_REFS.length} real refs / ${REAL_SUBJECTS.length} real subjects / ${REAL_PR_FIXTURE.length} PR fixture rows → legA=${legAMatchCount} legB=${legBMatchCount} legC=${legCMatchCount} matches, all independently re-verified)`);
});

// ---------------------------------------------------------------------------
// Section 5a — LEG A REAL POPULATION (verifier round 1 FAIL #1 — the gate the
// verifier said was missing): derived AT TEST TIME from the REAL
// `git ls-remote --heads origin` output, not fixtures. Two invariants:
//   1. For every BACKLOG id, no ref outside the loop-<id> convention is ever
//      reported as a legA MATCH (restates Section 5's per-match invariant
//      with the exact framing spec 263's fix-up asked for, scoped to leg A
//      alone so it can be read/verified independently of legB/legC).
//   2. The five known digit-coincidence refs that triggered the false
//      positive (claude/dazzling-ride-190iql, -198cif,
//      claude/inspiring-meitner-fs065n, -pcl159, claude/jolly-turing-240dvy)
//      are used ONLY as a positive control, never the definition: if still
//      present on the remote, each must land in the WEAK bucket for its id
//      and NEVER in matchLegA's results; if a ref has been deleted since,
//      that control is skipped with a printed note, not treated as a
//      silent pass.
// ---------------------------------------------------------------------------

test('LEG A REAL POPULATION: for every BACKLOG id, matchLegA never reports a ref outside the loop-<id> convention (independently re-verified)', () => {
  let legAMatchCount = 0;
  for (const id of backlogIds) {
    for (const m of matchLegA(REAL_REFS, id)) {
      legAMatchCount++;
      assert.ok(
        independentRefHasLoopId(m.ref, id),
        `legA reported ref "${m.ref}" as a match for id ${id}, but it carries no loop-<id> token — ` +
          `this is exactly the verifier-round-1 false-positive class (bounded-anywhere, not loop-token)`
      );
    }
  }
  assert.ok(legAMatchCount > 0, 'vacuous: legA found zero matches over the real refs, so this invariant tested nothing');
  console.log(`    (legA real-population: ${backlogIds.length} BACKLOG ids × ${REAL_REFS.length} real refs → ${legAMatchCount} matches, 0 false positives)`);
});

const KNOWN_LEGA_DIGIT_COINCIDENCES = [
  { branch: 'claude/dazzling-ride-190iql', id: '190' },
  { branch: 'claude/dazzling-ride-198cif', id: '198' },
  { branch: 'claude/inspiring-meitner-fs065n', id: '065' },
  { branch: 'claude/inspiring-meitner-pcl159', id: '159' },
  { branch: 'claude/jolly-turing-240dvy', id: '240' },
];

test('LEG A REAL POPULATION: the 5 known digit-coincidence refs (positive control, present-on-remote only) land in the weak bucket, never in matchLegA', () => {
  let present = 0;
  let skipped = 0;
  for (const { branch, id } of KNOWN_LEGA_DIGIT_COINCIDENCES) {
    const ref = REAL_REFS.find((r) => r.ref === `refs/heads/${branch}`);
    if (!ref) {
      skipped++;
      console.log(`    (skip: refs/heads/${branch} is no longer on the remote — control unavailable, not counted as a pass)`);
      continue;
    }
    present++;
    const matched = matchLegA([ref], id);
    assert.deepStrictEqual(matched, [], `refs/heads/${branch} must NOT be a legA match for id ${id} (digit-coincidence only, not a loop-<id> token)`);
    const weak = weakLegACandidates([ref], id);
    assert.strictEqual(weak.length, 1, `refs/heads/${branch} must appear in the weak bucket for id ${id}`);
  }
  console.log(`    (known digit-coincidence refs: ${present} present on remote / ${skipped} deleted since, of ${KNOWN_LEGA_DIGIT_COINCIDENCES.length} total)`);
  assert.ok(present + skipped === KNOWN_LEGA_DIGIT_COINCIDENCES.length);
});

// ---------------------------------------------------------------------------
// Section 5b — LEG B/C REAL POPULATION (verifier round 1 FAIL #2): merged PR
// titles become main subjects, so `git log --format=%s origin/main` IS the
// real population for both legs. Derived AT TEST TIME from that real log,
// crossed against a SECOND, independently-coded implementation of the SAME
// F1/F2/F3 predicate (independentExtractLeadId — manual character-walking,
// no regex, never calling the module's own extractLeadingId) to guard
// against a regression in the module's regex logic.
//
// The REAL_PR_FIXTURE rows (copied from the live GitHub PR list, same
// fixture Section 3's positive controls already rely on) stand in for "real
// PR titles" per this file's existing convention — a script cannot fetch
// PR data itself (245's precedent, see check-item-inflight.js file header).
//
// Residue (subjects/titles a human would read as carrying a leading id, but
// that F1/F2/F3 structurally cannot reach — a free word, not a
// conventional-commit prefix, precedes the digit run) is now TEST-DERIVED
// (see "RESIDUE (test-derived)" below), not hand-enumerated. Verifier round
// 2 FAIL (2026-08-11): the prior hand-enumerated list ("Enumerated residue
// count: 2") silently excluded a THIRD, structurally different real instance
// — a malformed conventional-commit scope (`design(247 world):`, PR #412) —
// from its own denominator, and mis-described the two it did list as "both
// the same shape" without a mechanism that could have caught a
// counter-example. `check-item-inflight.js`'s F2 was widened this round to
// cover the malformed-scope shape directly (so it is no longer residue at
// all — reducing the true miss count rather than just re-describing it);
// what genuinely remains is swept and asserted below, by a permissive
// SECOND extractor built for exactly this (permissiveLeadingIdCandidate,
// above) rather than remembered as prose. A naive auto-derivation without
// the zero-candidate filter would still produce noise (the real subject
// "feat: full 00K TVL floor alignment..." would falsely "candidate-match"
// id 00 under a one-extra-word skip); permissiveLeadingIdCandidate's
// nonZero() guard is exactly that filter, proven against this real subject
// by its absence from the derived residue set below.
// ---------------------------------------------------------------------------

test('LEG B REAL POPULATION: independent re-implementation agrees with the module for every real origin/main subject (0 expected disagreements)', () => {
  let withLeadingId = 0;
  let disagreements = [];
  for (const s of REAL_SUBJECTS) {
    const expected = independentExtractLeadId(s.subject);
    if (expected === null) continue;
    withLeadingId++;
    const m = matchLegB([s], expected);
    if (m.length !== 1) disagreements.push({ subject: s.subject, expected });
  }
  console.log(`    (legB real-population: ${REAL_SUBJECTS.length} real origin/main subjects, ${withLeadingId} carry a leading id per the independent implementation, ${disagreements.length} disagreement(s) with the module)`);
  assert.deepStrictEqual(disagreements, [], `module disagreed with the independent re-implementation on: ${JSON.stringify(disagreements)}`);
  assert.ok(withLeadingId > 0, 'vacuous: zero real subjects carried a leading id');
});

test('LEG C REAL POPULATION (PR-title fixture): independent re-implementation agrees with the module for every real PR title (0 expected disagreements)', () => {
  let withLeadingId = 0;
  let disagreements = [];
  for (const pr of REAL_PR_FIXTURE) {
    const expected = independentExtractLeadId(pr.title);
    if (expected === null) continue;
    withLeadingId++;
    const m = matchLegC([pr], expected);
    if (m.length !== 1) disagreements.push({ title: pr.title, expected });
  }
  console.log(`    (legC real-population: ${REAL_PR_FIXTURE.length} real PR titles, ${withLeadingId} carry a leading id per the independent implementation, ${disagreements.length} disagreement(s) with the module)`);
  assert.deepStrictEqual(disagreements, [], `module disagreed with the independent re-implementation on: ${JSON.stringify(disagreements)}`);
});

// KNOWN RESIDUE — a snapshot of what the TEST-DERIVED sweep below found the
// last time this list was hand-updated, kept only so a diff against it is
// legible in review; the assertion that governs is the DERIVED set, both
// directions, not this constant's mere existence (see the test below —
// "verifier round 2 FAIL" made exactly this mistake: a stale, undercounted
// snapshot stood in unchallenged for the real, live corpus). Both current
// entries are REAL (git log / a real PR title), and both independently land
// in the SAME derived shape bucket (FREE_WORD_PRECEDES_DIGIT) — a fact the
// test below re-derives and prints, never one this constant merely asserts.
const KNOWN_LEGBC_RESIDUE = [
  {
    text: "docs(loop): gate 150/152/153 on their open questions, keep 151's PT half READY",
    reason: 'REAL origin/main subject — after F3 strips "docs(loop): ", the word "gate" precedes the digit run "150", so F1 cannot reach it (151, also named later in the same subject, is a second, even-less-lead mention, not counted separately)',
  },
  {
    text: 'docs(loop): record 177 CULLED — $10M default floor stays (bookkeeping for closed #332)',
    reason: 'REAL PR #414 title — after F3 strips "docs(loop): ", the word "record" precedes the digit run, so F1 cannot reach it',
  },
];

test('RESIDUE (test-derived): sweep REAL_SUBJECTS + REAL_PR_FIXTURE with the permissive extractor; every text it flags where the shipped module disagrees (null or a different id) IS residue — asserted to equal KNOWN_LEGBC_RESIDUE exactly, both directions, grouped by shape, count and miss rate printed with their true denominator', () => {
  const derived = [];
  const sweep = (texts, getText) => {
    for (const item of texts) {
      const text = getText(item);
      const candidate = permissiveLeadingIdCandidate(text);
      if (!candidate) continue;
      const shipped = extractLeadingId(text);
      const disagrees = !shipped || Number(shipped.id) !== Number(candidate.id);
      if (disagrees) {
        derived.push({
          text,
          candidateId: candidate.id,
          shape: RESIDUE_SHAPE_NAMES[candidate.via] || candidate.via,
        });
      }
    }
  };
  sweep(REAL_SUBJECTS, (s) => s.subject);
  sweep(REAL_PR_FIXTURE, (pr) => pr.title);

  const derivedTexts = derived.map((d) => d.text).sort();
  const knownTexts = KNOWN_LEGBC_RESIDUE.map((k) => k.text).sort();

  // Both directions: nothing derived that KNOWN_LEGBC_RESIDUE doesn't list
  // (a genuinely new residue instance in history must fail loudly, not
  // silently accumulate), and nothing in KNOWN_LEGBC_RESIDUE that the sweep
  // no longer derives (a stale entry — e.g. one the F2/F3 widening now
  // covers — must also fail loudly, not linger as a falsified claim).
  const onlyInDerived = derivedTexts.filter((t) => !knownTexts.includes(t));
  const onlyInKnown = knownTexts.filter((t) => !derivedTexts.includes(t));
  assert.deepStrictEqual(onlyInDerived, [], `sweep derived NEW residue not in KNOWN_LEGBC_RESIDUE — update the constant (or, if this is a false positive, tighten permissiveLeadingIdCandidate): ${JSON.stringify(onlyInDerived)}`);
  assert.deepStrictEqual(onlyInKnown, [], `KNOWN_LEGBC_RESIDUE lists text(s) the sweep no longer derives as residue (the matcher may now cover them — remove the stale entry): ${JSON.stringify(onlyInKnown)}`);
  assert.strictEqual(derived.length, KNOWN_LEGBC_RESIDUE.length);

  // Every derived residue text must ALSO fail to match via matchLegB against
  // its own candidate id — the sweep's null/mismatch check restated at the
  // leg level, so a bug in the sweep itself (vs. a bug in extractLeadingId)
  // can't launder a false "residue" claim.
  for (const { text, candidateId } of derived) {
    const m = matchLegB([{ sha: 'x', subject: text }], candidateId);
    assert.deepStrictEqual(m, [], `expected "${text}" to remain unmatched by matchLegB for its own candidate id ${candidateId}`);
  }

  const byShape = {};
  for (const { shape } of derived) byShape[shape] = (byShape[shape] || 0) + 1;
  const denom = REAL_SUBJECTS.length + REAL_PR_FIXTURE.length;
  console.log(`    (leg B/C residue, TEST-DERIVED over the live corpus: ${derived.length} instance(s) out of ${denom} real subjects+titles examined this run — miss rate ${(100 * derived.length / denom).toFixed(1)}% of the corpus)`);
  for (const [shape, count] of Object.entries(byShape)) {
    console.log(`      shape "${shape.split(' (')[0]}": ${count} — ${shape}`);
  }
});

// ---------------------------------------------------------------------------
// Section 6 — self-defeat (in the spirit of test_test_registry.js's leg (e)):
// prove the independent-re-extraction assertion used by the population test
// above is not vacuously true by handing it a case it MUST reject.
// ---------------------------------------------------------------------------

test('(self-defeat) the population invariant’s independent-re-extraction check goes RED on a deliberately WRONG claimed match — proves the check can fail, not just pass', () => {
  // A hand-built "match" shaped exactly like what a BROKEN legA (e.g. one
  // that dropped the numeric-equality check on the loop-<digits> token)
  // would report: id "999" "matching" a ref that actually carries loop-9990,
  // not loop-999.
  const brokenLegAMatch = { ref: 'refs/heads/claude/loop-9990', sha: 'deadbeef' };
  assert.throws(
    () => assert.ok(independentRefHasLoopId(brokenLegAMatch.ref, '999'), 'independent re-extraction disagrees'),
    /independent re-extraction disagrees/,
    'expected the same assertion the population test relies on to THROW when handed a genuinely wrong match'
  );

  // Same proof for the OLD (verifier round 1 FAIL) leg A rule specifically:
  // a bounded-digit-run-anywhere coincidence must be rejected by the NEW
  // rule's independent re-implementation, even though the id is genuinely
  // present as a bounded token in the ref.
  const coincidenceRef = { ref: 'refs/heads/claude/inspiring-meitner-fs065n', sha: 'deadbeef' };
  assert.throws(
    () => assert.ok(independentRefHasLoopId(coincidenceRef.ref, '065'), 'independent re-extraction disagrees'),
    /independent re-extraction disagrees/,
    'a bounded-digit-run coincidence that is NOT a loop-<id> token must not independently verify as a match'
  );

  // Same proof for legB/legC's independent extractor: a broken matcher that
  // matched "263" against a subject actually leading with "2630".
  const brokenLegBMatch = { subject: '2630: not actually item 263', sha: 'deadbeef' };
  assert.throws(
    () => assert.strictEqual(independentExtractLeadId(brokenLegBMatch.subject), '263'),
    assert.AssertionError,
    'expected the same assertion the population test relies on to THROW when handed a genuinely wrong subject match'
  );
});

// ---------------------------------------------------------------------------
// Section 7 — exit-code assertions, driving the REAL CLI as a child process.
// ---------------------------------------------------------------------------

function runCliChild(args, opts) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: REPO_ROOT, encoding: 'utf8', ...opts });
}

test('CLI exit 2: usage error — no id argument at all', () => {
  const r = runCliChild([]);
  assert.strictEqual(r.status, 2);
});

test('CLI exit 2: usage error — non-numeric id', () => {
  const r = runCliChild(['not-a-number']);
  assert.strictEqual(r.status, 2);
});

test(`CLI exit 1: COLLISION — real id 266 (leg A alone), --no-fetch`, () => {
  const r = runCliChild(['266', '--no-fetch']);
  assert.strictEqual(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.ok(/claude\/loop-266/.test(r.stdout), 'expected the matching ref named in stdout');
});

test(`CLI exit 3: CLEAR-WITH-UNAVAILABLE-LEG — real id ${unclaimedId} (max+1), --no-fetch, no --prs`, () => {
  const r = runCliChild([unclaimedId, '--no-fetch']);
  assert.strictEqual(r.status, 3, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.ok(/UNAVAILABLE/.test(r.stdout));
});

test(`CLI exit 0: CLEAR — real id ${unclaimedId} (max+1), --no-fetch, --prs=- (empty array via stdin)`, () => {
  const r = runCliChild([unclaimedId, '--no-fetch', '--prs=-'], { input: '[]' });
  assert.strictEqual(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
});

test('CLI: running with no --prs NEVER returns 0, even on a genuinely clear id (spec 263 explicit requirement)', () => {
  const r = runCliChild([unclaimedId, '--no-fetch']);
  assert.notStrictEqual(r.status, 0, 'an id with no --prs data supplied must never exit 0 — leg C did not run, so "clean" cannot be claimed');
  assert.strictEqual(r.status, 3);
});

test('CLI: id 065 (verifier round 1 FAIL reproduction) prints the weak digit-coincidence line, never returns COLLISION on that ref alone, and the line never flips the exit code', () => {
  const withPrsEmpty = runCliChild(['065', '--no-fetch', '--prs=-'], { input: '[]' });
  const coincidenceRefPresent = REAL_REFS.some((r) => r.ref === 'refs/heads/claude/inspiring-meitner-fs065n');
  if (coincidenceRefPresent) {
    assert.ok(/weak digit-coincidence refs \(NOT counted as matches\)/.test(withPrsEmpty.stdout), `expected the weak-bucket line in stdout:\n${withPrsEmpty.stdout}`);
    assert.ok(/claude\/inspiring-meitner-fs065n/.test(withPrsEmpty.stdout), 'expected the coincidence ref named in the weak-bucket line');
  } else {
    console.log('    (skip: refs/heads/claude/inspiring-meitner-fs065n is no longer on the remote — CLI weak-line control unavailable)');
  }
  // Regardless of whether the coincidence ref is still present, id 065 must
  // not COLLIDE via this ref alone (it may still collide via a genuine
  // loop-65/loop-065 branch elsewhere — this assertion is scoped to proving
  // the coincidence ref itself never flips the verdict, not that id 065 is
  // globally clear).
  assert.notStrictEqual(withPrsEmpty.status, 2, `unexpected usage error:\n${withPrsEmpty.stdout}\n${withPrsEmpty.stderr}`);
});

test('CLI: --base=<sha> prints drift info and never changes the exit code (informational only)', () => {
  const withBase = runCliChild([unclaimedId, '--no-fetch', '--base=' + REAL_SUBJECTS[REAL_SUBJECTS.length - 1].sha]);
  const withoutBase = runCliChild([unclaimedId, '--no-fetch']);
  assert.strictEqual(withBase.status, withoutBase.status, 'adding --base must not change the verdict/exit code');
  assert.ok(/base drift/.test(withBase.stdout));
});

// ---------------------------------------------------------------------------
// Section 8 — offline guarantee for the GitHub-side leg (245's precedent):
// this script must never itself talk to the GitHub API.
// ---------------------------------------------------------------------------

test('check-item-inflight.js source contains no GitHub API call — leg C data is injected via --prs, never fetched here', () => {
  const src = fs.readFileSync(CLI_PATH, 'utf8');
  assert.ok(!/require\(\s*['"]https?['"]\s*\)/.test(src), 'must not require the http/https modules');
  assert.ok(!/\bfetch\(/.test(src), 'must not call fetch()');
  assert.ok(!/api\.github\.com/.test(src), 'must not hardcode the GitHub API host');
});

console.log(`\n${passed} assertion group(s) passed` + (process.exitCode ? ' (FAILURES above)' : ''));
