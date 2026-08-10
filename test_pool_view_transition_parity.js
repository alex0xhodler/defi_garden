/* test_pool_view_transition_parity.js — spec 257: the set-equality gate for
   the north star's `pool_view` denominator.

   PLAIN lane (no browser). Everything here is derived from app.js's SOURCE
   TEXT at test time — never a hand-typed list of line numbers (that mistake
   is the exact class this item exists to close; see
   playbooks/analytics-regression-triage.md's 257 addendum and
   product-loop-kit/specs/257.md's Acceptance criteria).

   THE CLAIM UNDER TEST: every place app.js transitions the app into
   `currentView === 'pool-detail'` (every `setCurrentView('pool-detail')` /
   `setCurrentView("pool-detail")` / `` setCurrentView(`pool-detail`) `` call
   — see "EXHAUSTIVE DELIMITER ENUMERATION" below for why those three are
   the whole space a textual scan can cover) has, inside the SAME enclosing
   named function/handler, a paired `trackPoolView(` emit — and vice versa
   (an emit inside a function that never transitions would be a double-fire
   risk on some other path). Both directions, both derived from the source,
   every run.

   POST-VERIFIER-FAIL REVISION, ATTEMPT 2 (see specs/257-pr.md "What the
   verifier found" and specs/257-notes.md "Attempt 2"): the first version of
   this file matched the transition and emit text with a fixed-spelling
   `String.prototype.indexOf` scan — a single-quoted, fixed-spacing byte
   string. The verifier mutated app.js with a fourth entry path written as
   `setCurrentView("pool-detail")` (double quotes) with no paired emit, and
   the old indexOf scan did not see it: GREEN, 4/4, on a source that should
   have failed. The fix widened the transition scan to `(['"])` — single AND
   double quotes — and the emit scan to a prefix-agnostic
   `\btrackPoolView\s*\(`.

   POST-VERIFIER-FAIL REVISION, ATTEMPT 3 (this revision — see
   specs/257-notes.md "Attempt 3" for the full verifier transcript): the
   verifier's own closing note on attempt 2 was the important finding, not
   the specific miss — *"Two attempts have now each closed exactly the one
   variant the previous verifier demonstrated... Do not now widen to exactly
   ['"`] and stop."* Concretely, attempt 2's `(['"])` still had no backtick
   branch, so `` setCurrentView(`pool-detail`) `` (a template-literal
   delimiter used with no interpolation, functionally a plain string) was
   STILL invisible — and independently, the attempt-1/2 scrubber blanked
   template-literal BODIES to protect the brace-depth walk, which would have
   erased a backtick transition's text even if the regex had covered it.
   Two bugs, not one; both fixed here (see scrubForPatternScan's own header
   comment below for the scrubber half). `TRANSITION_RE` now covers all
   three JS string delimiters plus an optional single trailing comma
   (`setCurrentView('pool-detail',)` is legal JS).

   EXHAUSTIVE DELIMITER ENUMERATION — the textual scan's boundary, stated
   precisely rather than left to be re-discovered by a third verifier pass:
   JavaScript has EXACTLY THREE string-literal delimiters: `'`, `"`, and
   `` ` `` (backtick/template literal). There is no fourth. All three are
   now covered by `TRANSITION_RE`, both directions, permanently regression-
   locked (variants A/C/D below). The syntactic slack AROUND the call —
   whitespace, newlines, and a legal single trailing comma — is also
   covered (`\s*` matches newlines; `,?` before the close-paren). That is
   the FULL extent of what a textual/regex scan can address for a call
   written as literal source text with a literal string argument.

   WHAT IS OUTSIDE THAT BOUNDARY — disclosed, not silently left standing
   (RAZOR: "no claim more specific than the evidence supports"). None of the
   following are string-DELIMITER variants — they are cases where the call
   is not literal source text at all, which is a different axis entirely
   and is NOT closable by widening a regex, only by a real parser (out of
   scope here — see specs/257-notes.md "Attempt 3" for why acorn was not
   reached for):
     - ALIASED SETTER: `const setViewAlias = setCurrentView; setViewAlias('pool-detail');`
       — the call site text is `setViewAlias(`, not `setCurrentView(`.
     - STRING CONCATENATION / COMPUTED ARGUMENT: `setCurrentView('pool' + '-detail')`,
       or `setCurrentView(['pool', 'detail'].join('-'))` — the literal
       "pool-detail" byte sequence never appears contiguously as a single
       quoted argument.
     - NAMED CONSTANT: `setCurrentView(POOL_DETAIL_VIEW)` where
       `const POOL_DETAIL_VIEW = 'pool-detail'` is declared elsewhere —
       the call site carries an identifier, not a string literal.
     - ALIASED / COMPUTED EMIT (the same class, mirrored on the emit side):
       `const tpv = Analytics.trackPoolView; tpv(pool, {...})`;
       `Analytics['trackPoolView'](pool, {...})` (computed member access —
       the identifier "trackPoolView" appears as a quoted property key
       followed by `]`, not `(`, so `\btrackPoolView\s*\(` does not match);
       `Analytics.trackPoolView.call(this, pool, {...})` / `.apply(...)` /
       `.bind(...)()` (the identifier is followed by `.call(`/`.apply(`/
       `.bind(`, not `(`, so the same regex misses it).
     - NESTED TEMPLATE LITERAL: a backtick string containing ANOTHER
       backtick inside its own `${...}` interpolation (e.g.
       `` `${`nested`}` ``) would defeat scrubForPatternScan's char-walk,
       which finds the FIRST unescaped backtick as the string's close.
       Verified absent from app.js today (a dedicated one-off scan, see
       specs/257-notes.md "Attempt 3") but this is a genuine limit of a
       non-tokenizing walker, not a proof that holds for all future edits.
   None of these five shapes is required to be caught — the spec's own
   Population criterion is about the SET of `setCurrentView('pool-detail')`
   call sites as literal text, and the verifier does not require catching
   non-literal call forms — but they are real, and a claim of "closed" that
   didn't name them would be exactly the over-claim this file exists to
   avoid making about app.js's own instrumentation gap.

   ALSO STILL TRUE (attempt-2 finding, unchanged by attempt 3): the gate's
   resolution is PER NAMED FUNCTION, not per transition. If a fourth
   `setCurrentView('pool-detail')` call (in ANY of the three delimiters) is
   added inside a function that *already* has its own `trackPoolView(` call
   elsewhere in its body (e.g. a second transition added inside `App`'s
   existing anonymous effect, or inside `handlePoolClick`), set-equality
   alone sees no new owner and stays green — only the plain COUNT assertion
   (transition count === emit count) catches that shape, because it adds a
   transition without adding an emit. Keep both assertions; neither
   subsumes the other. Permanently regression-locked below (variant B).

   ATTRIBUTION METHOD (documented per the spec's requirement):
   1. TWO scrubbers now, not one (attempt-3 change — see
      scrubForDepth()/scrubForPatternScan()'s own header comment in the code
      below for the full reasoning; summarized here):
        - `scrubForDepth()` walks app.js char-by-char and blanks out
          (replaces with spaces, same length, so all string offsets stay
          valid) every line comment, block comment, and template-literal
          BODY. This keeps `{`/`}` inside comments/templates from being
          mistaken for real code braces during the brace-depth walk. This is
          the ORIGINAL `scrub()` from attempts 1-2, renamed (its behavior is
          unchanged).
        - `scrubForPatternScan()` blanks line/block comments the same way,
          but does NOT blank template-literal bodies — only walks past them
          (same treatment single/double-quoted strings already got). This is
          the attempt-3 fix: the attempt-1/2 scrubber blanked template
          bodies unconditionally, which made a backtick-delimited
          `` setCurrentView(`pool-detail`) `` invisible to ANY regex, no
          matter how the regex itself was widened — a second, independent
          bug alongside the missing backtick branch in the regex. This
          scrubber is what `TRANSITION_RE`/`EMIT_RE` now run against.
      Both scrubbers keep a comment that happens to mention "trackPoolView"
      from producing a false-positive occurrence (explicitly verified below
      — see the "does not inflate the emit count" test, added because the
      verifier specifically asked whether the `// … trackPoolView call …`
      comment near app.js:2788 could inflate the count under the looser
      `\btrackPoolView\s*\(` emit regex — it cannot, because both scrubbers
      blank comments before either regex ever sees them). Single/double/
      backtick-quoted strings are DELIBERATELY left un-scrubbed in
      `scrubForPatternScan()`: the transition text itself is a quoted string
      literal that is part of the pattern being searched for — blanking it
      would blank away the very thing under test. This is only safe because
      app.js contains zero string literals (of any of the three delimiter
      kinds) with a `{` or `}` byte inside them and zero containing the
      substrings "trackPoolView"/"setCurrentView"/"pool-detail" (verified by
      a one-off scan when this file was first written, RE-VERIFIED when the
      scan switched from literal indexOf to regex in attempt 2, and
      RE-VERIFIED AGAIN for the backtick/template case in attempt 3 — a
      dedicated scan of every template-literal body in app.js found zero
      matches and zero nested backticks; see specs/257-notes.md "Attempt 3"
      for the transcript). One further known wrinkle: a regex literal
      containing brace quantifiers or character classes is NOT scrubbed
      either — app.js has exactly FOUR such literals: `app.js:230`, `:321`,
      `:474` (three copies of `/[.*+?^${}()|[\]\\]/g`) and `:808`
      (`/^[0-9a-f]{8}-.../i`). All four are brace-balanced within their own
      statement (each `{`/`}` pair opens and closes on the same line, inside
      the same regex literal), so none of them ever desyncs the depth
      counter. Documented, not hidden.
   2. `findFunctionStarts()` regex-scans the depth-scrubbed source for the two
      shapes this codebase actually uses to name a function (CLAUDE.md: no
      JSX, `React.createElement` + plain functions/arrows only):
        (a) `function NAME(...) {`
        (b) `const|let|var NAME = [async] (...) => {`
            `const|let|var NAME = [async] ident => {`
            `const|let|var NAME = [async] function(...) {`
      Each match's parameter list is paren-matched with `matchParens()` (not
      a naive `[^)]*` regex, so nested-paren default values don't break it),
      and the record is kept only if a `{` immediately follows (i.e. it has
      a real body to attribute occurrences into — arrow one-liners with no
      braces can't contain a nested `setCurrentView`/`trackPoolView` call
      anyway).
   3. `analyze()` makes ONE forward pass over the scrubbed source tracking
      brace depth (over `scrubForDepth()`'s output) and a stack of
      {name, depth}. Entering a named function's `{` pushes; leaving the `}`
      that returns depth to the pushed value pops. At every occurrence index
      of the transition regex (`TRANSITION_RE`, run over
      `scrubForPatternScan()`'s output) or the emit regex (`EMIT_RE`, same),
      the current stack top (or `(top-level)` if the stack is empty) is
      recorded as that occurrence's OWNER — the nearest enclosing NAMED
      function, skipping anonymous wrapper closures (e.g. a
      `useEffect(() => {...})` callback attributes to whatever named
      function contains the `useEffect(...)` call, exactly matching how a
      human would describe "which handler does this belong to"). Both
      scrubbers preserve source length and only replace characters (never
      insert/delete), so an index found via `scrubForPatternScan()`'s output
      lines up 1:1 with the SAME index in `scrubForDepth()`'s output — this
      is what makes it safe to search one and walk-depth on the other. See
      the header note above for the one thing this owner-resolution level
      still cannot see (a same-owner double transition — variant B below),
      and for the full, disclosed list of shapes no textual scan can see at
      all (alias/concat/named-constant/computed-emit/nested-template).

   Run: node test_pool_view_transition_parity.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let totalTests = 0;
function test(name, fn) {
  totalTests++;
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const REPO_ROOT = __dirname;
const APP_JS_PATH = path.join(REPO_ROOT, 'app.js');

// Regex-based, ALL-THREE-DELIMITER tolerant (spec-257 attempt-3 fix — see
// header comment's "ATTEMPT 3" section for the exhaustive delimiter
// enumeration). Matches `setCurrentView('pool-detail')`,
// `setCurrentView("pool-detail")`, or `` setCurrentView(`pool-detail`) ``,
// with incidental internal whitespace/newlines, and an optional single
// trailing comma before the close-paren (`setCurrentView('pool-detail',)`
// is legal JS — a lone trailing comma in a call with one argument).
const TRANSITION_RE = /setCurrentView\s*\(\s*(['"`])pool-detail\1\s*,?\s*\)/g;
// Drops the mandatory "Analytics." prefix and the fixed-spacing assumption
// of the old `'Analytics.trackPoolView('` literal — any call to a function
// named trackPoolView, however it's reached, counts as an emit site. (Note:
// unlike TRANSITION_RE this has no string-delimiter surface to widen — see
// header comment's "ATTEMPT 3" section for what a textual scan cannot catch
// on the emit side, and why.)
const EMIT_RE = /\btrackPoolView\s*\(/g;

// Frozen copy of the ATTEMPT-1 (pre-verifier-fail) literal-string transition
// scan, kept ONLY to prove the attempt-2 regex fix was non-vacuous — never
// used by the real assertions. This is exactly `TRANSITION_TEXT` /
// `findAllIndices` from the version of this file the FIRST verifier
// reviewed (single-quoted, fixed-spacing, indexOf-based).
const LEGACY_TRANSITION_TEXT = "setCurrentView('pool-detail')";
function legacyFindAllIndices(haystack, needle) {
  const out = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}
function legacyCountTransitions(source) {
  return legacyFindAllIndices(source, LEGACY_TRANSITION_TEXT).length;
}

// Frozen copy of the ATTEMPT-2 (pre-attempt-3) regex — quote-tolerant for
// `'`/`"` only, NO backtick, NO trailing-comma allowance. This is exactly
// `TRANSITION_RE` from the version of this file the SECOND verifier
// reviewed. Kept ONLY to prove the attempt-3 widening (backtick +
// trailing-comma) is non-vacuous, the same way LEGACY_TRANSITION_TEXT proves
// the attempt-2 widening was non-vacuous.
const PREV_ATTEMPT2_TRANSITION_RE = /setCurrentView\s*\(\s*(['"])pool-detail\1\s*\)/g;
function prevAttempt2CountTransitions(source) {
  return findAllRegexIndices(scrubForPatternScan(source), PREV_ATTEMPT2_TRANSITION_RE).length;
}

// ---------------------------------------------------------------------------
// Scrubbers — see header comment step 1 AND the "ATTEMPT 3" section.
//
// TWO variants, both position-preserving (same length as input, characters
// only ever replaced by a space, never inserted/deleted, so indices from
// either one line up 1:1 with the original source and with each other):
//
// scrubForDepth(source) — blanks line comments, block comments, AND
//   template-literal BODIES (the backtick delimiters themselves survive,
//   only what's between them is blanked). Used for the brace-depth walk /
//   named-function attribution, where a literal `{`/`}` byte sitting inside
//   a template literal (e.g. a CSS-in-JS or JSON-shaped template string)
//   would desync the depth counter if left in. This is exactly the ORIGINAL
//   `scrub()` from attempts 1-2, renamed.
//
// scrubForPatternScan(source) — blanks line/block comments only. Does NOT
//   blank ANY quoted-string content (single, double, OR backtick) — it only
//   walks past each one (handling escapes) so a stray `{`/`}`/`//`/`` ` ``
//   byte inside one can't desync the walk. This is what TRANSITION_RE and
//   EMIT_RE run against: the attempt-1/2 scrubber blanked template bodies,
//   which made a backtick-delimited `` setCurrentView(`pool-detail`) `` call
//   INVISIBLE to any regex no matter how the regex itself was widened — the
//   verifier's backtick finding was two bugs, not one (see header). This
//   scrubber fixes the second one.
//
// Both rest on the SAME verified assumption (re-checked for this attempt,
// see below): app.js contains no quoted string literal (of any of the three
// delimiter kinds) whose contents include a `{`, `}`, or the substrings
// "trackPoolView"/"setCurrentView"/"pool-detail" — if that ever stops
// holding, both scrubbers need a real tokenizer instead of a char-walk.
// scrubForPatternScan additionally assumes no NESTED template literals
// (a backtick string containing another backtick inside its own `${...}`
// interpolation) — its char-walk finds the FIRST unescaped backtick as the
// close, which a nested template would defeat. Verified absent from app.js
// today (a dedicated one-off scan; see 257-notes.md Attempt 3) but this is
// a real, disclosed limit of the textual approach, not a proof for all time.
// ---------------------------------------------------------------------------
function scrubForDepth(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];
    if (c === '/' && c2 === '/') {
      let j = i;
      while (j < n && source[j] !== '\n') j++;
      out += source.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      let j = source.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      out += source.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    // Single/double-quoted strings are intentionally NOT blanked here — see
    // the header comment step 1 for why (the transition text under test is
    // itself a string literal). We still have to WALK past them without
    // treating their contents as code, or a stray `{`/`}`/`//`/`` ` `` byte
    // inside one would desync everything downstream.
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === quote) { j++; break; }
        if (source[j] === '\n') break; // unterminated-on-line guard; shouldn't occur in valid JS
        j++;
      }
      out += source.slice(i, j);
      i = j;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '`') { j++; break; }
        j++;
      }
      out += source.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function scrubForPatternScan(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];
    if (c === '/' && c2 === '/') {
      let j = i;
      while (j < n && source[j] !== '\n') j++;
      out += source.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      let j = source.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      out += source.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    // Single/double-quoted strings: walk past, contents preserved (same as
    // scrubForDepth — see its comment).
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === quote) { j++; break; }
        if (source[j] === '\n') break;
        j++;
      }
      out += source.slice(i, j);
      i = j;
      continue;
    }
    // Backtick strings: walk past, contents preserved (UNLIKE
    // scrubForDepth). This is the load-bearing difference — a
    // backtick-delimited `setCurrentView(\`pool-detail\`)` transition must
    // survive as live text for TRANSITION_RE to see it.
    if (c === '`') {
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '`') { j++; break; }
        j++;
      }
      out += source.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Paren/whitespace helpers.
// ---------------------------------------------------------------------------
function matchParens(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function matchBraces(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function skipWs(str, i) {
  while (i < str.length && /\s/.test(str[i])) i++;
  return i;
}

// ---------------------------------------------------------------------------
// Function-start finder — see header comment step 2.
// ---------------------------------------------------------------------------
function findFunctionStarts(scrubbed) {
  const starts = [];

  {
    const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(scrubbed))) {
      const openParen = m.index + m[0].length - 1;
      const closeParen = matchParens(scrubbed, openParen);
      if (closeParen === -1) continue;
      const braceIdx = skipWs(scrubbed, closeParen + 1);
      if (scrubbed[braceIdx] === '{') starts.push({ name: m[1], braceIndex: braceIdx });
    }
  }

  {
    const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
    let m;
    while ((m = re.exec(scrubbed))) {
      const name = m[1];
      let i = m.index + m[0].length;
      const asyncMatch = /^async\s+/.exec(scrubbed.slice(i));
      if (asyncMatch) i += asyncMatch[0].length;

      if (scrubbed[i] === '(') {
        const closeParen = matchParens(scrubbed, i);
        if (closeParen === -1) continue;
        let j = skipWs(scrubbed, closeParen + 1);
        if (scrubbed.slice(j, j + 2) === '=>') {
          j = skipWs(scrubbed, j + 2);
          if (scrubbed[j] === '{') starts.push({ name, braceIndex: j });
        }
        continue;
      }

      const fnMatch = /^function\s*[A-Za-z_$]*\s*\(/.exec(scrubbed.slice(i));
      if (fnMatch) {
        const openParen = i + fnMatch[0].length - 1;
        const closeParen = matchParens(scrubbed, openParen);
        if (closeParen === -1) continue;
        const braceIdx = skipWs(scrubbed, closeParen + 1);
        if (scrubbed[braceIdx] === '{') starts.push({ name, braceIndex: braceIdx });
        continue;
      }

      const identMatch = /^([A-Za-z_$][\w$]*)\s*=>/.exec(scrubbed.slice(i));
      if (identMatch) {
        let j = skipWs(scrubbed, i + identMatch[0].length);
        if (scrubbed[j] === '{') starts.push({ name, braceIndex: j });
      }
    }
  }

  return starts;
}

function findAllIndices(haystack, needle) {
  const out = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}

// Regex-based occurrence finder — the general form the analyzer uses for
// both TRANSITION_RE and EMIT_RE. `regex` must carry the `g` flag (or a
// fresh one is built with `g` added) so `exec` advances `lastIndex`.
function findAllRegexIndices(haystack, regex) {
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  const out = [];
  let m;
  while ((m = re.exec(haystack))) {
    out.push(m.index);
    if (m[0].length === 0) re.lastIndex++; // guard against zero-length-match infinite loop
  }
  return out;
}

// ---------------------------------------------------------------------------
// analyze() — the analyzer under test. Pure: string in, data out. Reused
// verbatim by both the real-repo assertions and the self-defeat sub-check
// below, so the self-defeat proves the SAME logic the real assertions trust
// (test_test_registry.js precedent, checker (e)).
// ---------------------------------------------------------------------------
function analyze(source) {
  // Two scrub passes over the SAME source, same length, indices aligned
  // (see the scrubber comment above for why two are needed): one for the
  // named-function/brace-depth walk, one for finding transition/emit
  // occurrences without losing backtick-delimited content.
  const scrubbedDepth = scrubForDepth(source);
  const scrubbedPatterns = scrubForPatternScan(source);
  const funcStarts = findFunctionStarts(scrubbedDepth);
  const funcStartMap = new Map(funcStarts.map((f) => [f.braceIndex, f.name]));

  const transitionIndices = findAllRegexIndices(scrubbedPatterns, TRANSITION_RE);
  const emitIndices = findAllRegexIndices(scrubbedPatterns, EMIT_RE);
  const wanted = new Set([...transitionIndices, ...emitIndices]);

  const ownerAt = new Map();
  const stack = [];
  let depth = 0;
  for (let i = 0; i < scrubbedDepth.length; i++) {
    if (wanted.has(i)) {
      ownerAt.set(i, stack.length ? stack[stack.length - 1].name : '(top-level)');
    }
    const ch = scrubbedDepth[i];
    if (ch === '{') {
      depth++;
      const nm = funcStartMap.get(i);
      if (nm) stack.push({ name: nm, depth });
    } else if (ch === '}') {
      if (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
      depth--;
    }
  }

  return {
    scrubbed: scrubbedDepth,
    scrubbedPatterns,
    funcStarts,
    transitionIndices,
    emitIndices,
    transitionOwners: transitionIndices.map((i) => ownerAt.get(i)),
    emitOwners: emitIndices.map((i) => ownerAt.get(i))
  };
}

function lineOf(source, idx) {
  return source.slice(0, idx).split('\n').length;
}

// ---------------------------------------------------------------------------
// Removes the spec-257 `trackPoolView(...)` call from handleCalculateYield,
// in memory, for the self-defeat sub-check. Locates it via the `source:
// 'yield_calculator'` marker (only the new call carries this exact
// key/value — the pre-existing `trackPoolClick(pool, 'yield_calculator')`
// call passes it positionally, not as `source:`), regex-tolerant on quote
// style and whitespace for the same reason as TRANSITION_RE/EMIT_RE above
// (spec-257 FAILURE 1: a fixed-spelling scan is exactly the gap the
// verifier found), then paren-matches outward to the statement's own
// `[Analytics.]trackPoolView(` and forward to its closing `);`.
// ---------------------------------------------------------------------------
function removeYieldCalculatorTrackPoolView(source) {
  const markerRe = /source\s*:\s*(['"`])yield_calculator\1/g;
  const markerMatch = markerRe.exec(source);
  assert(markerMatch, 'self-defeat setup: no marker matching /source\\s*:\\s*([\'"`])yield_calculator\\1/ found in app.js — did the spec-257 emit move or get renamed?');
  const markerIdx = markerMatch.index;
  assert(markerRe.exec(source) === null, 'self-defeat setup: the yield_calculator source: marker is not unique in app.js');

  // Nearest trackPoolView( call at or before the marker.
  const callRe = /\btrackPoolView\s*\(/g;
  let lastCall = null;
  let cm;
  while ((cm = callRe.exec(source)) && cm.index <= markerIdx) {
    lastCall = cm;
  }
  assert(lastCall, 'self-defeat setup: could not find the enclosing trackPoolView( before the marker');

  const openParen = lastCall.index + lastCall[0].length - 1;
  assert(source[openParen] === '(', 'self-defeat setup: expected "(" at the end of the matched trackPoolView(...) text');
  const closeParen = matchParens(source, openParen);
  assert(closeParen !== -1, 'self-defeat setup: unbalanced parens locating the call to remove');

  // Walk the removal start back over an optional "Analytics." (or any
  // ident + '.') caller prefix so the whole call expression is removed, not
  // just its trackPoolView(...) tail.
  let statementStart = lastCall.index;
  const prefixMatch = /[A-Za-z_$][\w$]*\.\s*$/.exec(source.slice(0, statementStart));
  if (prefixMatch) statementStart -= prefixMatch[0].length;

  let end = closeParen + 1;
  if (source[end] === ';') end += 1;

  return source.slice(0, statementStart) + source.slice(end);
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
console.log('test_pool_view_transition_parity.js — spec 257 guard: transition sites vs. pool_view emit sites\n');

const realSource = fs.readFileSync(APP_JS_PATH, 'utf8');

test('regex counts (quote-style tolerant): setCurrentView([\'"]pool-detail[\'"]) and trackPoolView( occur equally often in app.js', () => {
  const { transitionIndices, emitIndices } = analyze(realSource);
  assert.strictEqual(
    transitionIndices.length,
    emitIndices.length,
    `expected equal counts, got ${transitionIndices.length} transition site(s) and ${emitIndices.length} emit site(s)`
  );
  // Sanity: as of this item, 3 of each. Not asserted as a hard-coded
  // population size (the point of this file is that a 4th site added later
  // must still pass, or fail honestly) — just logged for visibility.
  console.log(`    (found ${transitionIndices.length} of each, at this tick)`);
});

test('set-equality both directions: every transition-site owner has a paired emit-site owner, and vice versa', () => {
  const { transitionOwners, emitOwners, transitionIndices, emitIndices } = analyze(realSource);
  const setA = new Set(transitionOwners);
  const setB = new Set(emitOwners);

  const missingEmit = [...setA].filter((o) => !setB.has(o));
  const missingTransition = [...setB].filter((o) => !setA.has(o));

  if (missingEmit.length || missingTransition.length) {
    const detail = [];
    if (missingEmit.length) {
      detail.push(`owner(s) that transition into pool-detail but have NO trackPoolView emit in their own body: ${missingEmit.join(', ')}`);
    }
    if (missingTransition.length) {
      detail.push(`owner(s) that emit trackPoolView but never transition into pool-detail in their own body: ${missingTransition.join(', ')}`);
    }
    throw new Error(detail.join('; '));
  }

  assert.deepStrictEqual([...setA].sort(), [...setB].sort());
  console.log(`    owners: ${[...setA].sort().join(', ')}`);
  console.log(`    transition sites -> owners: ${transitionIndices.map((idx, i) => `L${lineOf(realSource, idx)}:${transitionOwners[i]}`).join(', ')}`);
  console.log(`    emit sites -> owners: ${emitIndices.map((idx, i) => `L${lineOf(realSource, idx)}:${emitOwners[i]}`).join(', ')}`);
});

test('handleCalculateYield fires exactly one trackPoolView( and exactly one trackPoolClick( — no double-fire', () => {
  const scrubbed = scrubForDepth(realSource);
  const starts = findFunctionStarts(scrubbed);
  const hcy = starts.find((s) => s.name === 'handleCalculateYield');
  assert(hcy, 'could not locate handleCalculateYield\'s function body start in app.js');
  const closeBrace = matchBraces(scrubbed, hcy.braceIndex);
  assert(closeBrace !== -1, 'unbalanced braces locating handleCalculateYield\'s body');
  const body = realSource.slice(hcy.braceIndex, closeBrace); // slice the ORIGINAL text (indices align with scrubbed 1:1)

  const trackPoolViewCount = findAllIndices(body, 'trackPoolView(').length;
  const trackPoolClickCount = findAllIndices(body, 'trackPoolClick(').length;
  assert.strictEqual(trackPoolViewCount, 1, `expected exactly 1 trackPoolView( in handleCalculateYield, got ${trackPoolViewCount}`);
  assert.strictEqual(trackPoolClickCount, 1, `expected exactly 1 trackPoolClick( in handleCalculateYield, got ${trackPoolClickCount}`);
});

test('SELF-DEFEAT: with the spec-257 trackPoolView call surgically removed in memory, the analyzer REPORTS the gap', () => {
  const mutated = removeYieldCalculatorTrackPoolView(realSource);
  assert.notStrictEqual(mutated, realSource, 'mutation was a no-op — removal failed silently');

  const real = analyze(realSource);
  const broken = analyze(mutated);

  // Count parity must now be VIOLATED (3 transitions, 2 emits).
  assert.notStrictEqual(
    broken.transitionIndices.length,
    broken.emitIndices.length,
    'analyzer failed to detect the count mismatch on the mutated source — the gate is vacuous'
  );
  assert.strictEqual(broken.transitionIndices.length, real.transitionIndices.length, 'mutation should not have touched any transition site');
  assert.strictEqual(broken.emitIndices.length, real.emitIndices.length - 1, 'mutation should have removed exactly one emit site');

  // Set-equality must now be VIOLATED, specifically: handleCalculateYield is
  // a transition owner with no paired emit owner.
  const setA = new Set(broken.transitionOwners);
  const setB = new Set(broken.emitOwners);
  const missingEmit = [...setA].filter((o) => !setB.has(o));
  assert(
    missingEmit.includes('handleCalculateYield'),
    `expected 'handleCalculateYield' to be reported as missing its emit after mutation, but the gap detector found: [${missingEmit.join(', ')}]`
  );
  console.log(`    confirmed RED on mutated source: missing-emit owner(s) = [${missingEmit.join(', ')}]`);
});

test('the "// … trackPoolView call …" comment near app.js:2788 does not inflate the emit-site count (relative, not hardcoded — spec-257 FAILURE 2 fix)', () => {
  // Verifier-requested explicit check (spec-257 attempt-2 FAILURE 1, step 2):
  // since EMIT_RE dropped the mandatory "Analytics." prefix, it is now loose
  // enough that IF comment-scrubbing ever regressed, a comment merely
  // mentioning "trackPoolView" near a stray "(" could inflate the count.
  // Confirm the comment exists, confirm scrubForDepth() removes it, and
  // confirm no emit site is attributed to its line.
  //
  // ATTEMPT-3 FIX (spec-257 FAILURE 2): the previous version of this
  // assertion was `assert.strictEqual(emitIndices.length, 3, ...)` — a
  // hard-coded population count, exactly the mistake this whole item exists
  // to eliminate on the transition/emit side, and it fires RED on a
  // CORRECTLY instrumented 4th entry path (see the POSITIVE CONTROL test
  // below — a legitimately paired 4th transition+emit makes emitIndices.length
  // === 4, which is CORRECT, and the old hard-coded "3" would have failed
  // it). Replaced with a RELATIVE comparison: deleting the comment's own
  // line must not change the emit count, whatever that count currently is.
  // The two assertions immediately below already prove the comment is
  // scrubbed and no emit attributes to its line; this is a second,
  // independent proof via an actual before/after diff of the source.
  const commentNeedle = 'trackPoolView call';
  const rawIdx = realSource.indexOf(commentNeedle);
  assert(rawIdx !== -1, 'expected the known trackPoolView-mentioning comment near app.js:2788 to still exist — if it moved/was reworded, this check is stale rather than meaningfully green');
  assert(realSource.indexOf(commentNeedle, rawIdx + 1) === -1, 'expected the comment needle to be unique in app.js');

  const { scrubbed, emitIndices } = analyze(realSource);
  assert.strictEqual(scrubbed.indexOf(commentNeedle), -1, 'comment scrubbing failed to blank the trackPoolView-mentioning comment — it is live text the emit regex could match against');

  const rawLine = lineOf(realSource, rawIdx);
  const emitLines = emitIndices.map((i) => lineOf(realSource, i));
  assert(!emitLines.includes(rawLine), `expected no emit site attributed to the comment's own line (${rawLine}), got emit sites on lines: ${emitLines.join(', ')}`);

  // Relative proof: delete the comment's own line entirely and re-analyze.
  // The emit count must be IDENTICAL before and after — not equal to a
  // hard-coded literal.
  const lineStart = realSource.lastIndexOf('\n', rawIdx) + 1;
  let lineEnd = realSource.indexOf('\n', rawIdx);
  if (lineEnd === -1) lineEnd = realSource.length; else lineEnd += 1;
  const sourceWithCommentLineDeleted = realSource.slice(0, lineStart) + realSource.slice(lineEnd);
  assert.notStrictEqual(sourceWithCommentLineDeleted, realSource, 'comment-line deletion was a no-op — could not isolate the comment line');
  const withoutComment = analyze(sourceWithCommentLineDeleted);
  assert.strictEqual(
    withoutComment.emitIndices.length,
    emitIndices.length,
    `deleting only the comment line changed the emit count (${emitIndices.length} -> ${withoutComment.emitIndices.length}) — the comment WAS being counted`
  );
  assert.strictEqual(
    withoutComment.transitionIndices.length,
    analyze(realSource).transitionIndices.length,
    'deleting the comment line unexpectedly changed the transition count too — the line-deletion isolation is not clean'
  );
  console.log(`    comment at L${rawLine} confirmed scrubbed; emit count unaffected by its removal (${emitIndices.length} -> ${withoutComment.emitIndices.length})`);
});

test('REGRESSION (variant A, single-quoted): a 4th, un-paired setCurrentView(\'pool-detail\') is caught by the analyzer', () => {
  // Permanent lock for the shape the ORIGINAL (pre-verifier-fail) scan
  // already caught correctly — kept here so a future edit to TRANSITION_RE
  // can't silently regress the single-quoted case while "fixing" something
  // else.
  const injected = "\nfunction injectedVariantAHandler() {\n  setCurrentView('pool-detail');\n}\n";
  const mutated = realSource + injected;
  assert.notStrictEqual(mutated, realSource);

  const real = analyze(realSource);
  const broken = analyze(mutated);

  assert.strictEqual(broken.transitionIndices.length, real.transitionIndices.length + 1, 'expected exactly one new transition site after injecting variant A');
  assert.strictEqual(broken.emitIndices.length, real.emitIndices.length, 'injecting a transition with no emit must not change the emit count');

  const missingEmit = [...new Set(broken.transitionOwners)].filter((o) => !new Set(broken.emitOwners).has(o));
  assert(
    missingEmit.includes('injectedVariantAHandler'),
    `expected 'injectedVariantAHandler' to be reported as missing its emit, but the gap detector found: [${missingEmit.join(', ')}]`
  );

  // The legacy (pre-fix) single-quoted-only scan also catches this shape —
  // confirms variant A was never the gap; only variant C (below) was.
  const legacyDelta = legacyCountTransitions(mutated) - legacyCountTransitions(realSource);
  assert.strictEqual(legacyDelta, 1, 'expected the legacy literal scan to also see variant A (single-quoted) — if it does not, this fixture is no longer testing variant A');
  console.log('    variant A caught by both the legacy scan and the current regex scan (never the gap)');
});

test('REGRESSION (variant C, double-quoted): a 4th, un-paired setCurrentView("pool-detail") is caught by the analyzer, and PROVEN non-vacuous against the pre-fix scan', () => {
  // This is the exact shape the verifier used to prove the pre-fix version
  // of this file was blind (FAILURE 1, "Variant C ... GREEN 4/4, exit=0 —
  // MISSED"). Permanent regression lock.
  const injected = '\nfunction injectedVariantCHandler() {\n  setCurrentView("pool-detail");\n}\n';
  const mutated = realSource + injected;
  assert.notStrictEqual(mutated, realSource);

  // --- Non-vacuity: prove the OLD (pre-fix) literal single-quote scan is
  // BLIND to this exact mutation — i.e. that this regression case would
  // have been RED-required (old scan GREEN/vacuous) before the fix, and is
  // caught only because TRANSITION_RE is now quote-tolerant.
  const legacyBefore = legacyCountTransitions(realSource);
  const legacyAfter = legacyCountTransitions(mutated);
  assert.strictEqual(
    legacyAfter,
    legacyBefore,
    'expected the legacy single-quote-only scan to MISS the double-quoted variant (this is FAILURE 1 as the verifier found it) — if this now fails, the legacy fixture is not reproducing the original gap'
  );

  // --- The current, fixed analyzer must catch it.
  const real = analyze(realSource);
  const broken = analyze(mutated);
  assert.strictEqual(broken.transitionIndices.length, real.transitionIndices.length + 1, 'expected exactly one new transition site after injecting variant C');
  assert.strictEqual(broken.emitIndices.length, real.emitIndices.length, 'injecting a transition with no emit must not change the emit count');

  const missingEmit = [...new Set(broken.transitionOwners)].filter((o) => !new Set(broken.emitOwners).has(o));
  assert(
    missingEmit.includes('injectedVariantCHandler'),
    `expected 'injectedVariantCHandler' to be reported as missing its emit, but the gap detector found: [${missingEmit.join(', ')}]`
  );
  console.log(`    variant C: legacy scan missed it (${legacyBefore} -> ${legacyAfter}, unchanged); current regex scan caught it (owner reported: injectedVariantCHandler)`);
});

test('REGRESSION (variant D, BACKTICK): a 4th, un-paired setCurrentView(`pool-detail`) is caught by the analyzer, and PROVEN non-vacuous against the attempt-2 scan', () => {
  // spec-257 attempt-3, FAILURE 1(a)+(b)+(d). This is the exact shape the
  // SECOND verifier demonstrated against the attempt-2 fix: a backtick
  // (template-literal) delimiter is the third and last string-literal
  // delimiter JS has (single, double, backtick — enumerated exhaustively in
  // this file's header comment's "ATTEMPT 3" section). The attempt-2 regex
  // was quote-tolerant for `'`/`"` only; it had no backtick branch, AND
  // (independently) the attempt-1/2 scrubber blanked template-literal
  // BODIES before either regex ever ran, so a backtick transition was
  // invisible for two separate reasons, not one — see scrubForPatternScan's
  // header comment. Permanent regression lock for both fixes together.
  const injected = '\nfunction injectedVariantDHandler() {\n  setCurrentView(`pool-detail`);\n}\n';
  const mutated = realSource + injected;
  assert.notStrictEqual(mutated, realSource);

  // --- Non-vacuity, TWO separate pre-fix baselines:
  // (1) the attempt-1 legacy indexOf scan (single-quoted literal text) never
  //     saw quote variants at all.
  const legacyBefore = legacyCountTransitions(realSource);
  const legacyAfter = legacyCountTransitions(mutated);
  assert.strictEqual(legacyAfter, legacyBefore, 'expected the attempt-1 legacy literal scan to MISS the backtick variant — if this now fails, the legacy fixture is not reproducing the original gap');

  // (2) the attempt-2 regex (quote-tolerant for '/" only, run against the
  //     OLD scrubber that blanked template bodies) must ALSO miss it — this
  //     is the specific claim the second verifier disproved.
  const prevAttempt2Before = prevAttempt2CountTransitions(realSource);
  const prevAttempt2After = prevAttempt2CountTransitions(mutated);
  assert.strictEqual(
    prevAttempt2After,
    prevAttempt2Before,
    'expected the attempt-2 regex (no backtick branch) to MISS the backtick variant when run against the pattern-scrub text — if this now fails, the attempt-2 fixture is not reproducing the backtick gap'
  );
  // And explicitly: even the attempt-2 regex WOULD have matched backtick
  // syntax if the OLD (template-blanking) scrubber hadn't erased the
  // content first — proving the scrubber bug was real and independent of
  // the regex bug, not merely restating the same fact twice.
  const attempt2RegexOverPatternText = findAllRegexIndices(scrubForPatternScan(mutated), PREV_ATTEMPT2_TRANSITION_RE).length
    - findAllRegexIndices(scrubForPatternScan(realSource), PREV_ATTEMPT2_TRANSITION_RE).length;
  assert.strictEqual(attempt2RegexOverPatternText, 0, 'the attempt-2 regex has no backtick alternation, so it must still miss the injected backtick call even over content-preserving scrub text');

  // --- The current, fixed analyzer must catch it.
  const real = analyze(realSource);
  const broken = analyze(mutated);
  assert.strictEqual(broken.transitionIndices.length, real.transitionIndices.length + 1, 'expected exactly one new transition site after injecting variant D');
  assert.strictEqual(broken.emitIndices.length, real.emitIndices.length, 'injecting a transition with no emit must not change the emit count');

  const missingEmit = [...new Set(broken.transitionOwners)].filter((o) => !new Set(broken.emitOwners).has(o));
  assert(
    missingEmit.includes('injectedVariantDHandler'),
    `expected 'injectedVariantDHandler' to be reported as missing its emit, but the gap detector found: [${missingEmit.join(', ')}]`
  );
  console.log(`    variant D (backtick): attempt-1 scan missed it (${legacyBefore} -> ${legacyAfter}); attempt-2 scan missed it (${prevAttempt2Before} -> ${prevAttempt2After}); current analyzer caught it (owner reported: injectedVariantDHandler)`);
});

test('REGRESSION (variant E, TRAILING COMMA): a 4th, un-paired setCurrentView(\'pool-detail\',) is caught by the analyzer, and PROVEN non-vacuous against the attempt-2 scan', () => {
  // spec-257 attempt-3, FAILURE 1(a). `setCurrentView('pool-detail',)` is
  // legal JS (a single trailing comma in a one-argument call). The
  // attempt-2 regex had no `,?` before its closing `\)`, so a call written
  // with a trailing comma would not match even though its quote style was
  // covered. Permanent regression lock, proven non-vacuous the same way as
  // variant D.
  const injected = "\nfunction injectedVariantEHandler() {\n  setCurrentView('pool-detail',);\n}\n";
  const mutated = realSource + injected;
  assert.notStrictEqual(mutated, realSource);

  const prevAttempt2Before = prevAttempt2CountTransitions(realSource);
  const prevAttempt2After = prevAttempt2CountTransitions(mutated);
  assert.strictEqual(
    prevAttempt2After,
    prevAttempt2Before,
    'expected the attempt-2 regex (no trailing-comma allowance) to MISS the trailing-comma variant — if this now fails, the attempt-2 fixture is not reproducing the trailing-comma gap'
  );

  const real = analyze(realSource);
  const broken = analyze(mutated);
  assert.strictEqual(broken.transitionIndices.length, real.transitionIndices.length + 1, 'expected exactly one new transition site after injecting variant E');
  assert.strictEqual(broken.emitIndices.length, real.emitIndices.length, 'injecting a transition with no emit must not change the emit count');

  const missingEmit = [...new Set(broken.transitionOwners)].filter((o) => !new Set(broken.emitOwners).has(o));
  assert(
    missingEmit.includes('injectedVariantEHandler'),
    `expected 'injectedVariantEHandler' to be reported as missing its emit, but the gap detector found: [${missingEmit.join(', ')}]`
  );
  console.log(`    variant E (trailing comma): attempt-2 scan missed it (${prevAttempt2Before} -> ${prevAttempt2After}); current analyzer caught it (owner reported: injectedVariantEHandler)`);
});

test('REGRESSION (variant B, same-owner): a 2nd transition inside an already-instrumented function is caught ONLY by the count assertion, never set-equality alone — documents the gate\'s known resolution limit', () => {
  // This is the shape the FIRST verifier demonstrated (specs/257-pr.md /
  // 257-notes.md "Variant B"): the gate's owner-attribution resolves to the
  // nearest enclosing NAMED function, not to the individual transition
  // statement. A second, un-paired `setCurrentView('pool-detail')` added
  // inside `handlePoolClick` (which already owns one paired emit) adds a
  // transition with no matching NEW emit, but the owner SETS themselves
  // don't change (handlePoolClick is already in both sets), so set-equality
  // alone stays green. Only the plain count assertion (test 1, "regex
  // counts") notices the extra transition. This fixture pins that
  // documented limit as a permanent, executable proof rather than prose.
  const injected = realSource.replace(
    "setCurrentView('pool-detail');\n    setSearchInput",
    "setCurrentView('pool-detail');\n    setCurrentView('pool-detail'); // injected variant-B: 2nd transition, same owner (handlePoolClick), no new emit\n    setSearchInput"
  );
  assert.notStrictEqual(injected, realSource, 'variant-B injection anchor text not found in app.js — handlePoolClick\'s body shape changed; update the anchor');

  const real = analyze(realSource);
  const broken = analyze(injected);

  // Count assertion: MUST be violated (this is what a full test run's first
  // assertion would catch — RED via the count check).
  assert.strictEqual(broken.transitionIndices.length, real.transitionIndices.length + 1, 'expected exactly one new transition site after injecting variant B');
  assert.strictEqual(broken.emitIndices.length, real.emitIndices.length, 'variant B must not add a new emit');
  assert.notStrictEqual(broken.transitionIndices.length, broken.emitIndices.length, 'variant B should desync the plain count assertion — if counts are still equal, this is not exercising the same-owner gap');

  // Set-equality: MUST stay green (this is the documented limit — the whole
  // point of the fixture).
  const setA = new Set(broken.transitionOwners);
  const setB = new Set(broken.emitOwners);
  assert.deepStrictEqual([...setA].sort(), [...setB].sort(), 'variant B was expected to leave set-equality green (the owner sets are unchanged) — if this now fails, the same-owner resolution limit changed and the documentation needs updating, not this fixture');
  console.log(`    variant B (same-owner, handlePoolClick): count assertion would go RED (${broken.transitionIndices.length} transitions vs ${broken.emitIndices.length} emits); set-equality alone stays GREEN as documented`);
});

test('POSITIVE CONTROL: a correctly-paired 4th entry path (new transition + real trackPoolView emit, same owner) keeps the gate GREEN — spec-257 FAILURE 2 fix', () => {
  // spec-257 attempt-3, FAILURE 2. The attempt-2 version of this file added
  // a hard-coded `assert.strictEqual(emitIndices.length, 3, ...)` to the
  // "does not inflate" test, which the SECOND verifier proved fires RED on
  // a legitimately, correctly instrumented 4th path — exactly the
  // population the spec's own Population criterion forbids hardcoding
  // against, and the file's own comment ("a 4th site added later must still
  // pass") already promised not to do. That hard-coded assertion has been
  // replaced with a relative one (see the "does not inflate" test above);
  // this fixture is the positive-control half of the fix: proof that a
  // *correctly paired* 4th path is NOT flagged by anything in this file.
  // A gate that fires on correct code is worse than no gate.
  const injected = [
    '',
    'function handleOpenDetailFromNewSurface(pool) {',
    "  Analytics.trackPoolClick(pool, 'new_surface');",
    '  setDetailPool(pool);',
    "  setCurrentView('pool-detail');",
    "  Analytics.trackPoolView(pool, { source: 'new_surface' });",
    '  setSearchInput(pool.project + \' \' + pool.symbol);',
    '}',
    ''
  ].join('\n');
  const mutated = realSource + injected;
  assert.notStrictEqual(mutated, realSource);

  const real = analyze(realSource);
  const control = analyze(mutated);

  // Both counts go up by exactly one, TOGETHER — the count assertion stays
  // satisfied (unlike variants A/B/C/D/E, where only the transition count
  // moves).
  assert.strictEqual(control.transitionIndices.length, real.transitionIndices.length + 1, 'expected exactly one new transition site');
  assert.strictEqual(control.emitIndices.length, real.emitIndices.length + 1, 'expected exactly one new emit site');
  assert.strictEqual(control.transitionIndices.length, control.emitIndices.length, 'a correctly-paired 4th path must keep transition count === emit count');

  // Set-equality must ALSO stay satisfied: the new owner
  // (handleOpenDetailFromNewSurface) appears in BOTH sets, nowhere as an
  // orphan.
  const setA = new Set(control.transitionOwners);
  const setB = new Set(control.emitOwners);
  assert.deepStrictEqual([...setA].sort(), [...setB].sort(), 'a correctly-paired 4th path must not break set-equality in either direction');
  assert(setA.has('handleOpenDetailFromNewSurface'), 'expected the new owner to appear in the transition-owner set');
  assert(setB.has('handleOpenDetailFromNewSurface'), 'expected the new owner to appear in the emit-owner set');

  // Deliberately NO `assert.strictEqual(control.emitIndices.length, <N>)`
  // here — that would be the exact FAILURE-2 mistake (a hardcoded
  // population count) reintroduced in the one test whose entire purpose is
  // proving hardcoded counts are the wrong tool. The relative checks above
  // (both counts +1, counts still equal, set-equality holds, new owner in
  // both sets) are what "correctly instrumented and still green" means,
  // independent of how many real sites exist today.
  console.log(`    correctly-paired 4th path (handleOpenDetailFromNewSurface): transitions ${real.transitionIndices.length}->${control.transitionIndices.length}, emits ${real.emitIndices.length}->${control.emitIndices.length}, counts stay equal, set-equality holds, new owner present in both sets — GREEN as required`);
});

console.log(`\ntest_pool_view_transition_parity.js: ${passed}/${totalTests} tests passed`);
if (process.exitCode) process.exit(process.exitCode);
