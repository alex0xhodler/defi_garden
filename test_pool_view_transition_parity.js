/* test_pool_view_transition_parity.js — spec 257: the set-equality gate for
   the north star's `pool_view` denominator.

   PLAIN lane (no browser). Everything here is derived from app.js's SOURCE
   TEXT at test time — never a hand-typed list of line numbers (that mistake
   is the exact class this item exists to close; see
   playbooks/analytics-regression-triage.md's 257 addendum and
   product-loop-kit/specs/257.md's Acceptance criteria).

   THE CLAIM UNDER TEST: every place app.js transitions the app into
   `currentView === 'pool-detail'` (every `setCurrentView('pool-detail')` /
   `setCurrentView("pool-detail")` call, either quote style) has, inside the
   SAME enclosing named function/handler, a paired `trackPoolView(` emit —
   and vice versa (an emit inside a function that never transitions would be
   a double-fire risk on some other path). Both directions, both derived
   from the source, every run.

   POST-VERIFIER-FAIL REVISION (see specs/257-pr.md "What the verifier
   found" and specs/257-notes.md "Attempt 2"): the first version of this
   file matched the transition and emit text with a fixed-spelling
   `String.prototype.indexOf` scan — a single-quoted, fixed-spacing byte
   string. The verifier mutated app.js with a fourth entry path written as
   `setCurrentView("pool-detail")` (double quotes) with no paired emit, and
   the old indexOf scan did not see it: GREEN, 4/4, on a source that should
   have failed. Both scans below are now regexes tolerant of quote style
   (and, for the emit side, of the caller prefix / internal spacing), so a
   quote-style variant can no longer hide from the gate. What this does NOT
   fix, and is stated plainly rather than implied away: the gate's
   resolution is PER NAMED FUNCTION, not per transition. If a fourth
   `setCurrentView('pool-detail')` call is added inside a function that
   *already* has its own `trackPoolView(` call elsewhere in its body (e.g.
   a second transition added inside `App`'s existing anonymous effect,
   which is itself attributed to the named function `App`), set-equality
   alone sees no new owner and stays green — only the plain COUNT assertion
   (transition count === emit count) catches that shape, because it adds a
   transition without adding an emit. Keep both assertions; neither
   subsumes the other.

   ATTRIBUTION METHOD (documented per the spec's requirement):
   1. `scrub()` walks app.js char-by-char and blanks out (replaces with
      spaces, same length, so all string offsets stay valid) every line
      comment, block comment, and template-literal body. This keeps `{`/`}`
      inside comments/templates from being mistaken for real code braces,
      and keeps a comment that happens to mention "trackPoolView" from
      producing a false-positive occurrence (explicitly verified below —
      see the "does not inflate the emit count" test, added because the
      verifier specifically asked whether the `// … trackPoolView call …`
      comment near app.js:2788 could inflate the count under the new,
      looser `\btrackPoolView\s*\(` emit regex — it cannot, because scrub()
      blanks it before either regex ever sees it). Single/double-quoted
      strings are DELIBERATELY left un-scrubbed: the transition text
      itself, `setCurrentView('pool-detail')` / `setCurrentView("pool-detail")`,
      contains a quoted string literal that is part of the pattern being
      searched for — blanking it would blank away the very thing under
      test. This is only safe because app.js contains zero single/
      double-quoted string literals with a `{` or `}` byte inside them and
      zero containing the substrings "trackPoolView"/"setCurrentView"
      (verified by a one-off scan when this file was written, and
      RE-VERIFIED when the scan switched from literal indexOf to regex —
      the regex change widens WHAT counts as a match, not WHERE the scanner
      looks, so the same string-content assumption still governs; the
      re-verification is the same one-off `grep`, re-run, and still finds
      none). One further known wrinkle: a regex literal containing brace
      quantifiers or character classes is NOT scrubbed either — app.js has
      exactly FOUR such literals, not one as an earlier version of this
      comment claimed (the verifier caught the miscount): `app.js:230`,
      `:321`, `:474` (three copies of `/[.*+?^${}()|[\]\\]/g`) and `:808`
      (`/^[0-9a-f]{8}-.../i`). All four are brace-balanced within their own
      statement (each `{`/`}` pair opens and closes on the same line, inside
      the same regex literal), so none of them ever desyncs the depth
      counter — the conclusion survives, only the count was wrong.
      Documented, not hidden.
   2. `findFunctionStarts()` regex-scans the scrubbed source for the two
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
      brace depth and a stack of {name, depth}. Entering a named function's
      `{` pushes; leaving the `}` that returns depth to the pushed value
      pops. At every occurrence index of the transition regex
      (`TRANSITION_RE`, quote-tolerant) or the emit regex (`EMIT_RE`,
      quote-tolerant is moot here but prefix/spacing-tolerant), the current
      stack top (or `(top-level)` if the stack is empty) is recorded as that
      occurrence's OWNER — the nearest enclosing NAMED function, skipping
      anonymous wrapper closures (e.g. a `useEffect(() => {...})` callback
      attributes to whatever named function contains the `useEffect(...)`
      call, exactly matching how a human would describe "which handler does
      this belong to"). See the header note above for the one thing this
      resolution level still cannot see (a same-owner double transition).

   Run: node test_pool_view_transition_parity.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const REPO_ROOT = __dirname;
const APP_JS_PATH = path.join(REPO_ROOT, 'app.js');

// Regex-based, quote-style tolerant (spec-257 FAILURE 1 fix). Matches
// `setCurrentView('pool-detail')` or `setCurrentView("pool-detail")`, with
// or without incidental internal whitespace — see header comment.
const TRANSITION_RE = /setCurrentView\s*\(\s*(['"])pool-detail\1\s*\)/g;
// Drops the mandatory "Analytics." prefix and the fixed-spacing assumption
// of the old `'Analytics.trackPoolView('` literal — any call to a function
// named trackPoolView, however it's reached, counts as an emit site.
const EMIT_RE = /\btrackPoolView\s*\(/g;

// Frozen copy of the PRE-FIX (verifier-FAILed) literal-string transition
// scan, kept ONLY to prove the regex fix above is non-vacuous — never used
// by the real assertions. This is exactly `TRANSITION_TEXT` /
// `findAllIndices` from the version of this file the verifier reviewed.
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

// ---------------------------------------------------------------------------
// Scrubber — see header comment step 1.
// ---------------------------------------------------------------------------
function scrub(source) {
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
  const scrubbed = scrub(source);
  const funcStarts = findFunctionStarts(scrubbed);
  const funcStartMap = new Map(funcStarts.map((f) => [f.braceIndex, f.name]));

  const transitionIndices = findAllRegexIndices(scrubbed, TRANSITION_RE);
  const emitIndices = findAllRegexIndices(scrubbed, EMIT_RE);
  const wanted = new Set([...transitionIndices, ...emitIndices]);

  const ownerAt = new Map();
  const stack = [];
  let depth = 0;
  for (let i = 0; i < scrubbed.length; i++) {
    if (wanted.has(i)) {
      ownerAt.set(i, stack.length ? stack[stack.length - 1].name : '(top-level)');
    }
    const ch = scrubbed[i];
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
    scrubbed,
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
// Removes the spec-257 `Analytics.trackPoolView(...)` call from
// handleCalculateYield, in memory, for the self-defeat sub-check. Locates it
// via the unique literal `source: 'yield_calculator'` (only the new call
// carries this exact key/value — the pre-existing `trackPoolClick(pool,
// 'yield_calculator')` call passes it positionally, not as `source:`),
// then paren-matches outward to the statement's own `Analytics.trackPoolView(`
// and forward to its closing `);`.
// ---------------------------------------------------------------------------
function removeYieldCalculatorTrackPoolView(source) {
  const marker = "source: 'yield_calculator'";
  const markerIdx = source.indexOf(marker);
  assert(markerIdx !== -1, 'self-defeat setup: marker "source: \'yield_calculator\'" not found in app.js — did the spec-257 emit move or get renamed?');
  assert(source.indexOf(marker, markerIdx + 1) === -1, 'self-defeat setup: marker "source: \'yield_calculator\'" is not unique in app.js');

  const callIdx = source.lastIndexOf(EMIT_TEXT, markerIdx);
  assert(callIdx !== -1, 'self-defeat setup: could not find the enclosing Analytics.trackPoolView( before the marker');

  const openParen = callIdx + 'Analytics.trackPoolView'.length;
  assert(source[openParen] === '(', 'self-defeat setup: expected "(" right after Analytics.trackPoolView');
  const closeParen = matchParens(source, openParen);
  assert(closeParen !== -1, 'self-defeat setup: unbalanced parens locating the call to remove');

  let end = closeParen + 1;
  if (source[end] === ';') end += 1;

  return source.slice(0, callIdx) + source.slice(end);
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
console.log('test_pool_view_transition_parity.js — spec 257 guard: transition sites vs. pool_view emit sites\n');

const realSource = fs.readFileSync(APP_JS_PATH, 'utf8');

test('grep-equivalent counts: setCurrentView(\'pool-detail\') and Analytics.trackPoolView( occur equally often in app.js', () => {
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
  const scrubbed = scrub(realSource);
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

console.log(`\ntest_pool_view_transition_parity.js: ${passed}/4 tests passed`);
if (process.exitCode) process.exit(process.exitCode);
