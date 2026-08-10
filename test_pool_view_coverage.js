/* test_pool_view_coverage.js — spec 257: the pool-detail transition/emit
   mirror gate.

   `app.js` has N sites that call `setCurrentView('pool-detail')` (ways to
   REACH the pool-detail render) and M sites that call
   `Analytics.trackPoolView(` (ways to REPORT reaching it). Spec 257's own
   evidence: on `main` @ 24f31de724 these were 3 and 2 — `handleCalculateYield`
   rendered a full pool-detail page and reported nothing, and nothing related
   the two sets to catch it. This is the 212 mirror class ("when a fact must
   exist in two places and only one is read at runtime, the other is a
   mirror; mirrors get an equality test against the original in the same
   commit") applied to a transition/emission pair instead of two data copies.

   RAZOR worked example 5 is the operative lesson: a guard that watches a
   RESEMBLANCE of the real mechanism (e.g. "emit call textually inside the
   same function as the transition") is strictly worse than no guard, because
   it launders a real gap as coverage. The real mechanism here is NOT
   uniform: `url_direct` (app.js ~1280-1320, inside a `useEffect`) does not
   call `Analytics.trackPoolView(` in its own function body at all — spec 182
   deliberately PARKS the found pool into `pendingUrlDirectPool` (via
   `setPendingUrlDirectPool`) and a SECOND, sibling `useEffect` (~1330-1336)
   reads that state variable and fires the emit once the baked protocol-URL
   artifact has settled. "Emit in the same enclosing function" is therefore
   too strong a predicate — it would false-positive-FAIL a correct,
   intentional design.

   REVISION HISTORY (this section, honestly — three attempts, each closed by
   a verifier finding the NEXT hole, never by the build run declaring
   victory):

   Attempt 1 (rule (b) name-collision hole, verifier-found). The first
   shipped version of rule (b) read "calls a state setter setX(...) whose
   corresponding state variable x (setter name minus `set`, first letter
   lowercased) is referenced inside the body of some function that DOES call
   Analytics.trackPoolView(". That is a NAME-COLLISION heuristic, not the
   mechanism — it never checked that `x` was a real `useState` binding, that
   it was the value actually reported, or that the emitting function's
   relationship to `x` was anything more than the bare word appearing
   somewhere in its text. An independent verifier broke it with two
   `analyze()`-level mutations, both still on the file as permanent
   regression guards below ("false-positive (1)" / "false-positive (2)"):
     1. `const handleGenuinelyUninstrumentedEntry999 = (pool) => {
        setPool(pool); setCurrentView('pool-detail'); }` scored
        `covered:true, rule:'b'` — `setPool` is not even a real setter in
        this file (there is no `const [pool, setPool] = useState(...)`
        binding); the bare word `pool` merely occurs inside
        `handlePoolClick`'s body for unrelated reasons.
     2. `const handleSwitchChainThenViewPool999 = (pool, chain) => {
        setSelectedChain(chain); setCurrentView('pool-detail'); }` also
        scored `covered:true, rule:'b'` using the REAL `setSelectedChain`
        setter, because `selectedChain` appears as a bare word inside
        `handleCalculateYield`'s emit-context object — nothing to do with
        reporting a pool_view.
   Both are plausible shapes for a real future uninstrumented entry path.
   The old rule silently passed them, which is worse than no guard — it
   laundered the gap as coverage. Attempt 2 replaced rule (b) with the
   three-part real-`useState`/first-argument/reactive-dependency mechanism
   below and left rule (a) untouched, on the (unstated, and wrong)
   assumption that plain textual co-occurrence was fine for the "direct
   emit" case because both of app.js's real rule-(a) matches happen to be a
   bare top-level emit immediately followed by a bare top-level transition.

   Attempt 2 (rule (a) reachability hole, verifier-found, MORE SEVERE than
   attempt 1's). Rule (a) read "the transition's enclosing function itself
   calls Analytics.trackPoolView(" — textual co-occurrence anywhere in the
   function, no offset comparison, no control-flow reasoning whatsoever. An
   independent verifier defeated the entire suite with one mutation, cited
   verbatim as a permanent regression guard below ("rule (a) dominance (1)
   [verifier-found, self-defeat]"):
     `const handleWeirdPathVERIFY = (pool, skip) => { if (skip) {
     setCurrentView('pool-detail'); return; } Analytics.trackPoolView(pool,
     { source: 'weird_path_verify' }); };`
   This scored `covered:true, rule:'a'` — transitionCount and emitCount both
   went 3->4 so the top-level count-equality check ALSO stayed green,
   uncoveredTransitions was `[]`, orphanedEmits was `[]`, everything green —
   while containing a genuinely uninstrumented pool-detail render behind the
   most ordinary code shape there is, an early-return guard clause. This was
   worse than attempt 1's hole: it defeated BOTH the count check and the
   coverage check simultaneously, and it is a shape a real future entry path
   is more likely to take than either of attempt 1's fixtures (guard clauses
   are everywhere; the two name-collision shapes were comparatively
   contrived).

   Attempt 3 (this version) gives rule (a) a DOMINANCE check in place of bare
   co-occurrence — see `emitDominatesTransition()`/`blockStackFor()` in the
   scanner below for the exact predicate (textual order + block-stack
   prefix, both computed from the same brace-pair list rule (b) already
   built). What it covers, concretely: the verifier's exact mutation (now
   uncovered, guarded permanently), a mirror-image sibling-branch mutation
   this attempt added on its own initiative ("rule (a) dominance (2)"), and
   a positive control proving the new predicate does not over-reject nested-
   but-dominated transitions. What it does NOT cover is stated in full,
   concretely, in "THE REMAINING BOUNDARY" below — read it before treating
   this file as exhaustive; it explicitly is not.

   THE MECHANISM, restated as two independently-checkable parts (each
   verified against `app.js`'s own text, never a hand-typed list):

     A transition site is COVERED iff its enclosing function either
       (a) contains an emit that DOMINATES it — same enclosing function,
           `emit.pos < transition.pos`, AND the emit's stack of enclosing
           `{...}` blocks (within the function body, outermost first) is a
           PREFIX of the transition's stack (same block, or an ancestor
           block — never a sibling branch). See `emitDominatesTransition()`.
           Approximates "runs on every control-flow path that reaches the
           transition" without a parser; sound for straight-line code and
           single-level guard clauses, the shapes actually present in
           app.js today — see the boundary section for where it stops being
           sound. Or
       (b) calls a real state setter `setX(...)` such that ALL of:
           (i)   `setX` is backed by an actual `useState` (or
                 `React.useState`) destructuring declaration in app.js of
                 the exact shape `const [x, setX] = useState(...)` — parsed
                 from the declaration itself, not assumed from the setter's
                 spelling. (`useRef`-style declarations never match, because
                 they don't destructure a `[value, setter]` pair off
                 `useState(`.)
           (ii)  that same `x` is the FIRST ARGUMENT of some
                 `Analytics.trackPoolView(` call in app.js — i.e. `x` is the
                 pool being reported, not merely a word appearing nearby.
           (iii) that `trackPoolView` call sits inside a `useEffect(() => {
                 ... }, [deps])` callback whose dependency array literally
                 contains `x` — the handoff is a declared reactive
                 dependency, not a coincidence of two unrelated snippets
                 both mentioning the same word.
       Each of (i)/(ii)/(iii) is checked independently; all three must hold
       for the setter's target function to count as the transition's rule-b
       cover.

   Both directions are asserted: every transition is covered (no
   uninstrumented entry path), AND every emit is "reachable" from some
   transition under the same relation (no stray/orphaned emit can launder
   coverage by existing without actually pairing to a real transition).

   Both sets are DERIVED from `app.js`'s own text at test time via a small
   brace-matching scanner (`analyze()`, pure — same function runs on the real
   file and on in-memory mutated copies below). No line numbers, no hardcoded
   list of handler names anywhere in this file — a fourth entry path added
   tomorrow is picked up automatically by the same `findAll()` calls that
   find today's three.

   THE REMAINING BOUNDARY — stated honestly, not claimed away, and NOT
   presented as exhaustive (attempt 2's docstring made that mistake once
   already; this one names concrete unhandled shapes instead of a closed
   list). This rule verifies that WIRING exists — for rule (a), that some
   emit runs on a textually-linear path before the transition and inside an
   enclosing-or-same block; for rule (b), that a real state slot, the emit
   reading that exact slot, and a declared reactive dependency all line up.
   It verifies approximated structure, never runtime semantics, never real
   control flow. Concrete ways it could still be wrong in a future file:

     Rule (a) — the dominance approximation (offset order + block-stack
     prefix) has no model of:
     - LOOPS. An emit inside a `for`/`while`/`.forEach` body that only
       conditionally executes (e.g. zero iterations) would still satisfy
       "same-or-ancestor block, earlier offset" and be scored as dominating
       a transition after the loop, even on an iteration count of zero.
     - `try`/`catch`. An emit in a `try` block whose transition sits in the
       `catch` (or vice versa) — different blocks, so today's prefix check
       correctly rejects it, but an emit in a `finally` that the checker
       would rank as an ancestor block runs whether or not the `try` body
       threw before reaching its own transition; the checker cannot tell
       "always runs" from "runs because nothing exploded."
     - CALLBACKS. An emit passed as a callback to `setTimeout`, a promise
       `.then(...)`, or any function that stores-and-calls-later is textually
       "before" a later transition and can even share a block, but does not
       execute synchronously — the checker has no notion of deferred
       execution and would score it as dominating regardless.
     - Early returns in shapes deeper than the single-level guard clause
       tested here. Two or three levels of nested `if`/`else` with a `return`
       partway down, or a `switch` with `case` fallthrough, are shapes the
       block-stack-prefix check has NOT been exercised against beyond the
       one-level cases in this file's own guards below; they may or may not
       resolve correctly depending on how the nesting lines up.
     - TERNARIES (`cond ? Analytics.trackPoolView(pool, {...}) : x`) and
       `&&`/`||` SHORT-CIRCUITS (`cond && Analytics.trackPoolView(pool,
       {...})`) never open a `{` block at all, so `blockStackFor` sees them
       as sitting in whatever block already contains the whole expression —
       the checker cannot distinguish "always evaluated" from "evaluated
       only when `cond` is truthy." A transition in the same block guarded
       by the opposite branch of such a conditional could be misclassified
       as dominated.
     None of these shapes exist in app.js today (confirmed: app.js's three
     rule-(a)/(b) sites are two bare top-level straight-line handlers and one
     documented two-`useEffect` parked-state handoff — no loops, try/catch,
     callbacks, or ternaries touch any transition or emit site). The residual
     above is about what a FUTURE file could introduce, not a known hole in
     the current one.

     Rule (b) — unchanged from attempt 2, restated: name-based matching is
     defeated by SHADOWING (an unrelated local spelled identically to a real
     state variable defeats the textual `\bx\b` checks in (ii)/(iii); no such
     collision exists in app.js today, confirmed by false-positive test 1),
     and the check does not execute the consuming `useEffect`'s BODY beyond
     the dependency array (an early-return or extra guard condition inside
     that effect could prevent the emit from ever firing for the transition
     that parked the value, and rule (b) would still call it covered because
     the wiring is present — distinguishing "wired" from "wired AND always
     reached" needs guard evaluation, out of scope for a static text check).

   Self-defeat (house pattern — see test_test_registry.js check (e),
   test_mean30d_mirror.js's non-vacuity section): a check never shown to fail
   is not evidence of health. Mutations are constructed on in-memory COPIES
   of the real source (never written to disk) and analyze() is proven to go
   red on each:
     (A) delete the `handleCalculateYield` emit -> its transition must go
         from covered to uncovered.
     (B) inject a synthetic fourth `setCurrentView('pool-detail')` inside a
         brand-new, deliberately uninstrumented function (a state variable
         name unique to this test, guaranteed to appear nowhere else in
         app.js) -> that transition must be reported uncovered too.
     (false-positive 1 & 2) the two verifier-found rule-(b) mutations from
         attempt 1, cited verbatim as permanent regression guards.
     (rule (a) dominance 1) the verifier's exact attempt-2-defeating
         mutation (`handleWeirdPathVERIFY`, an early-return guard clause),
         cited verbatim, asserted uncovered, PLUS a paired assertion that
         the top-level count-equality check stays green on that same
         mutated source (3->4 both sides) while the coverage check still
         goes red — the two checks are independent by construction; count-
         equality is a necessary population sanity check, never a proxy for
         coverage, and this drill is the permanent proof of that.
     (rule (a) dominance 2) a mirror-image mutation of this attempt's own
         devising: an emit inside a sibling `if` branch, textually EARLIER
         than the transition in the sibling `else`, asserted uncovered —
         proves the block-stack-prefix half of the predicate is load-bearing
         on its own, not merely the offset-order half.
     (rule (a) dominance, positive control) a transition nested inside an
         `if`, dominated by an emit at the enclosing function's top level
         BEFORE the `if`, asserted COVERED — without this, a dominance rule
         that rejected everything nested would pass every negative test
         above for the wrong reason.
   Plus a rule-(b) truth-table drill that neuters (i), (ii), (iii) each
   SEPARATELY (in memory, on the one real `url_direct` handoff) and shows
   the classification flips each time — proving three working sub-rules,
   not one working rule and two dead ones.

   Run: node test_pool_view_coverage.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('test_pool_view_coverage.js — spec 257: setCurrentView(\'pool-detail\') vs Analytics.trackPoolView( mirror\n');

// ---------------------------------------------------------------------------
// The scanner. Purpose-built for THIS file's need ("find the smallest
// enclosing function body for a text position, in a file that has strings,
// template literals, comments and one regex-with-braces constant"), not a
// general JS parser. fs/assert/path only, per spec ("no new dependency, this
// repo has no parser dependency you may add").
// ---------------------------------------------------------------------------

const IDENT_RE = /[A-Za-z0-9_$]/;
// Standard "does a `/` here start a regex, or is it division" heuristic:
// look at the last significant token. Good enough for this file's one
// brace-bearing regex literal (POOL_ARTIFACT_UUID_RE), which sits at module
// top level far from any of the spans this test cares about.
const REGEX_PRECEDING_PUNCT = new Set(['(', '{', '[', ',', ';', ':', '!', '&', '|', '?', '=', '+', '-', '*', '%', '^', '~', '<', '>']);
const REGEX_PRECEDING_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
function isRegexContext(last) {
  return last === '' || REGEX_PRECEDING_PUNCT.has(last) || REGEX_PRECEDING_KEYWORDS.has(last);
}

// Scans [start,end) of `src` in "code" mode, pushing {ch,pos} for every real
// (non-string/comment/regex/template-raw) brace into `braces`. When
// `exprTerminator` is true (called from inside a template literal's `${`),
// returns the index just past the '}' that closes THIS depth-0 expression,
// without pushing that closing brace (it is a template delimiter, not a
// code-block brace paired with anything). Recursion (via scanTemplate calling
// back into scanCode, and vice versa) handles arbitrarily nested
// `` `...${ `...${x}...` }...` `` without a hand-rolled stack.
function scanCode(src, start, end, braces, exprTerminator) {
  let i = start;
  let lastSignificant = '';
  let localDepth = 0;
  while (i < end) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      i += 2;
      while (i < end && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < end && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '\'' || c === '"') {
      const q = c;
      i++;
      while (i < end && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      lastSignificant = 'str';
      continue;
    }
    if (c === '`') {
      i = scanTemplate(src, i + 1, end, braces);
      lastSignificant = 'str';
      continue;
    }
    if (c === '/' && isRegexContext(lastSignificant)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < end) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') { inClass = true; j++; continue; }
        if (src[j] === ']') { inClass = false; j++; continue; }
        if (src[j] === '/' && !inClass) { j++; closed = true; break; }
        if (src[j] === '\n') break;
        j++;
      }
      if (closed) {
        while (j < end && /[a-z]/i.test(src[j])) j++;
        i = j;
        lastSignificant = 'regex';
        continue;
      }
      // Unterminated before end-of-line: not actually a regex; fall through
      // and let '/' be treated as ordinary punctuation below.
    }
    if (IDENT_RE.test(c)) {
      let j = i;
      while (j < end && IDENT_RE.test(src[j])) j++;
      lastSignificant = src.slice(i, j);
      i = j;
      continue;
    }
    if (c === '{') {
      braces.push({ ch: '{', pos: i });
      localDepth++;
      lastSignificant = '{';
      i++;
      continue;
    }
    if (c === '}') {
      if (exprTerminator && localDepth === 0) return i + 1;
      braces.push({ ch: '}', pos: i });
      localDepth--;
      lastSignificant = '}';
      i++;
      continue;
    }
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }
  return i;
}

function scanTemplate(src, start, end, braces) {
  let i = start;
  while (i < end) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && src[i + 1] === '{') {
      i = scanCode(src, i + 2, end, braces, true);
      continue;
    }
    i++;
  }
  return i; // unterminated template — shouldn't happen in a valid file.
}

function scanBraces(source) {
  const braces = [];
  scanCode(source, 0, source.length, braces, false);
  return braces;
}

// Pairs the balanced, in-document-order brace token list into
// {openPos, closePos} spans via a plain stack.
function pairBraces(braces) {
  const pairs = [];
  const stack = [];
  for (const b of braces) {
    if (b.ch === '{') stack.push(b.pos);
    else {
      const openPos = stack.pop();
      if (openPos === undefined) throw new Error(`unmatched '}' at pos ${b.pos}`);
      pairs.push({ openPos, closePos: b.pos });
    }
  }
  if (stack.length) throw new Error(`unmatched '{' at pos(es) ${stack.join(',')}`);
  return pairs;
}

// A brace-pair is a FUNCTION BODY if the text immediately preceding its
// opening '{' (trimmed of whitespace) ends in "=>" (any arrow function —
// this is what makes a `useEffect(() => { ... })` callback's OWN body
// recognized correctly, with no useEffect-specific casing needed: the arrow
// itself is the function) or matches a `function <name?>(...)` declaration.
const FUNCTION_DECL_RE = /function\s*[A-Za-z0-9_$]*\s*\([^()]*\)\s*$/;
const ARROW_RE = /=>\s*$/;
const LOOKBACK = 600; // generous for any real parameter list in this file.
function isFunctionBodyOpen(source, openPos) {
  const before = source.slice(Math.max(0, openPos - LOOKBACK), openPos);
  return ARROW_RE.test(before) || FUNCTION_DECL_RE.test(before);
}

// The raw setter identifiers CALLED inside a function body (e.g. "setPool",
// "setPendingUrlDirectPool") — no naming-convention derivation here. What a
// setter actually parks into which state variable is looked up from the
// real `useState` DECLARATION via `useStateBindings()` below, never guessed
// from the setter's own spelling (that guess is exactly what let the old
// rule (b) name-collision heuristic through).
const SETTER_CALL_RE = /\b(set[A-Z]\w*)\s*\(/g;
function settersCalledIn(bodyText) {
  const out = new Set();
  let m;
  SETTER_CALL_RE.lastIndex = 0;
  while ((m = SETTER_CALL_RE.exec(bodyText))) {
    out.add(m[1]);
  }
  return out;
}

// Rule (b) sub-condition (i): a real useState/React.useState destructuring
// declaration of the exact shape `const [x, setX] = useState(...)` /
// `[x, setX] = React.useState(...)`. Returns a Map setterName -> stateVar
// built purely from parsing app.js's own declarations — a `useRef(...)`
// declaration never matches this pattern (it doesn't destructure a
// two-element `[value, setter]` array off a call literally named
// `useState`), so useRef bindings are automatically excluded, not
// special-cased.
const USESTATE_DECL_RE = /\[\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*(set[A-Za-z_$][A-Za-z0-9_$]*)\s*\]\s*=\s*(?:React\.)?useState\(/g;
function useStateBindings(source) {
  const map = new Map(); // setterName -> stateVar
  let m;
  USESTATE_DECL_RE.lastIndex = 0;
  while ((m = USESTATE_DECL_RE.exec(source))) {
    map.set(m[2], m[1]);
  }
  return map;
}

// Rule (b) sub-condition (ii): is `identifierName` the FIRST ARGUMENT of the
// `Analytics.trackPoolView(` call at `emitPos`? Reads only the bare
// identifier immediately following the opening paren (before the next `,`
// or `)`) — if the first argument isn't a plain identifier (a literal, a
// call, an expression), this simply returns null and never matches anything,
// which is the correct (conservative) behavior for a structural check.
function firstArgIdentifier(source, emitPos) {
  const after = source.slice(emitPos + EMIT_NEEDLE.length, emitPos + EMIT_NEEDLE.length + 200);
  const m = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*[,)]/.exec(after);
  return m ? m[1] : null;
}

// Rule (b) sub-condition (iii): is `fnSpan` the direct `() => { ... }`
// callback argument of a `useEffect(` call? Checked by looking at the text
// immediately preceding the callback's opening brace (every useEffect in
// this file uses the zero-arg `useEffect(() => {` idiom — confirmed by grep
// against app.js; a future differently-shaped callback simply won't match,
// which is conservative, not silently permissive).
const USE_EFFECT_ARROW_RE = /\buseEffect\(\s*\(\s*\)\s*=>\s*$/;
function isUseEffectCallback(source, fnSpan) {
  const before = source.slice(Math.max(0, fnSpan.openPos - LOOKBACK), fnSpan.openPos);
  return USE_EFFECT_ARROW_RE.test(before);
}

// If `fnSpan` is a useEffect callback, returns the RAW TEXT of its
// dependency array literal (e.g. "[protocolUrlsSettled, pendingUrlDirectPool]"),
// read from immediately after the callback's closing brace
// (`}, [deps]);`). Returns null if the shape doesn't match (e.g. no deps
// array — an effect with no second argument can never satisfy rule (b)'s
// dependency requirement, correctly).
const EFFECT_DEPS_RE = /^\s*,\s*(\[[^\]]*\])\s*\)/;
function useEffectDepsText(source, fnSpan) {
  const after = source.slice(fnSpan.closePos + 1, fnSpan.closePos + 1 + 2000);
  const m = EFFECT_DEPS_RE.exec(after);
  return m ? m[1] : null;
}

function findAll(source, needle) {
  const out = [];
  let idx = source.indexOf(needle);
  while (idx !== -1) {
    out.push(idx);
    idx = source.indexOf(needle, idx + 1);
  }
  return out;
}

function lineOf(source, pos) {
  return source.slice(0, pos).split('\n').length;
}

const TRANSITION_NEEDLE = "setCurrentView('pool-detail')";
const EMIT_NEEDLE = 'Analytics.trackPoolView(';

// The pure checker. Same code path for the real file and every mutated
// in-memory string below.
function analyze(source) {
  const pairs = pairBraces(scanBraces(source));
  const fnSpans = pairs
    .filter((p) => isFunctionBodyOpen(source, p.openPos))
    .sort((a, b) => (a.closePos - a.openPos) - (b.closePos - b.openPos)); // smallest (innermost) first

  function enclosingFunctionFor(pos) {
    for (const span of fnSpans) {
      if (span.openPos <= pos && pos <= span.closePos) return span;
    }
    return null;
  }

  const transitionPositions = findAll(source, TRANSITION_NEEDLE);
  const emitPositions = findAll(source, EMIT_NEEDLE);

  const transitions = transitionPositions.map((pos) => ({ pos, line: lineOf(source, pos), fn: enclosingFunctionFor(pos) }));
  const emits = emitPositions.map((pos) => ({ pos, line: lineOf(source, pos), fn: enclosingFunctionFor(pos) }));

  // Group emits by their OWN nearest enclosing function ("direct emitter"
  // functions) — the set a transition's rule (a) checks membership in, and
  // whose bodies rule (b) searches for a parked state variable.
  const emitsByFnOpen = new Map();
  for (const e of emits) {
    if (!e.fn) continue;
    if (!emitsByFnOpen.has(e.fn.openPos)) emitsByFnOpen.set(e.fn.openPos, { fn: e.fn, emits: [] });
    emitsByFnOpen.get(e.fn.openPos).emits.push(e);
  }

  function fnBody(fn) { return source.slice(fn.openPos, fn.closePos + 1); }

  // rule (b) sub-condition (i): real useState-backed setters only.
  const stateBindings = useStateBindings(source); // setterName -> stateVar

  // rule (b) sub-conditions (ii)/(iii), precomputed once per emit: is this
  // emit's first argument a bare identifier, and (if it sits in a useEffect
  // callback) what does that effect's dependency array literally contain.
  const emitMechanism = emits.map((e) => ({
    ...e,
    firstArg: firstArgIdentifier(source, e.pos),
    depsText: e.fn && isUseEffectCallback(source, e.fn) ? useEffectDepsText(source, e.fn) : null,
  }));

  // rule (a) dominance check (attempt 3 — RAZOR worked example 5 / the
  // verifier's early-return mutation). "Itself calls Analytics.trackPoolView("
  // used to mean textual co-occurrence anywhere in the enclosing function —
  // an emit sitting AFTER a `return` that the transition's own branch takes
  // was scored as covering it. Rule (a) now requires the candidate emit to
  // DOMINATE the transition, approximated (no parser, brace-matching only)
  // by two independently-checkable conditions on top of "same enclosing
  // function":
  //   - textual order: emit.pos < transition.pos. An emit that can only run
  //     AFTER the transition (e.g. following the `return` in an early-exit
  //     guard) has not fired yet at the moment the transition happens.
  //   - block containment: the emit's stack of enclosing `{...}` blocks
  //     WITHIN the function body (outermost — the function body itself —
  //     first) is a PREFIX of the transition's stack. This means the emit
  //     sits in the exact same block as the transition, or in a block that
  //     textually ENCLOSES the transition's block (an ancestor `if`, the
  //     function body itself). An emit that sits in a *different* block at
  //     the same or an ancestor depth (a sibling `if`/`else` branch the
  //     transition's own branch never reaches) fails this even when it is
  //     textually earlier — prefix-of-stack, not merely "smaller offset",
  //     is what rules that shape out.
  // This is sound for straight-line code and single-level guard clauses (the
  // shapes actually present in app.js today: rule (a)'s two real matches are
  // both a bare top-level emit followed by a bare top-level transition, same
  // block, so both conditions hold trivially). It is NOT real control-flow /
  // reachability analysis — see the docstring's "remaining boundary" section
  // for the shapes it still cannot see.
  function blockStackFor(pos, fn) {
    // All brace pairs (not just function bodies) that contain `pos` and lie
    // within this function's own body — i.e. every nested block scope pos
    // is textually inside, from the function body itself down to the
    // innermost block. Sorted outermost-first by span size: for properly
    // nested braces, "contains pos AND has the larger span" is exactly
    // "is the ancestor", so this needs no separate parent-pointer structure.
    return pairs
      .filter((p) => p.openPos >= fn.openPos && p.closePos <= fn.closePos && p.openPos <= pos && pos <= p.closePos)
      .sort((a, b) => (b.closePos - b.openPos) - (a.closePos - a.openPos));
  }
  function isBlockStackPrefix(stackE, stackT) {
    if (stackE.length > stackT.length) return false;
    return stackE.every((p, i) => stackT[i].openPos === p.openPos);
  }
  function emitDominatesTransition(em, t) {
    if (em.pos >= t.pos) return false; // must run strictly before the transition
    return isBlockStackPrefix(blockStackFor(em.pos, t.fn), blockStackFor(t.pos, t.fn));
  }

  const transitionResults = transitions.map((t) => {
    if (!t.fn) return { ...t, coveredBy: [], covered: false, rule: null };
    const coveredBy = new Set();
    let rule = null;
    // rule (a): the transition's own enclosing function contains an emit
    // that DOMINATES it (see emitDominatesTransition above) — not merely an
    // emit that co-occurs somewhere in the same function body.
    const directEmits = emitsByFnOpen.get(t.fn.openPos);
    if (directEmits && directEmits.emits.some((em) => emitDominatesTransition(em, t))) {
      coveredBy.add(t.fn.openPos);
      rule = 'a';
    }

    // rule (b): the transition calls a state setter `setX(...)` that is (i)
    // backed by a real `useState` declaration, whose state variable `x` is
    // (ii) the first argument of some `Analytics.trackPoolView(` call that
    // (iii) sits inside a `useEffect` depending on that same `x`. All three
    // must hold — this is the actual spec-182 parked-state handoff
    // mechanism, not a name collision (see file header for the two
    // verifier-found false positives this replaces).
    const settersCalled = settersCalledIn(fnBody(t.fn));
    for (const setterName of settersCalled) {
      if (!stateBindings.has(setterName)) continue; // (i) fails: not a real useState setter
      const stateVar = stateBindings.get(setterName);
      for (const em of emitMechanism) {
        if (!em.fn || em.fn.openPos === t.fn.openPos) continue; // parking implies a hand-off to a DIFFERENT function
        if (em.firstArg !== stateVar) continue; // (ii) fails: not the reported pool
        if (!em.depsText || !new RegExp(`\\b${stateVar}\\b`).test(em.depsText)) continue; // (iii) fails: not a declared reactive dependency
        coveredBy.add(em.fn.openPos);
        if (!rule) rule = 'b';
      }
    }

    return { ...t, coveredBy: [...coveredBy], covered: coveredBy.size > 0, rule };
  });

  const reachedFnOpens = new Set();
  for (const t of transitionResults) for (const o of t.coveredBy) reachedFnOpens.add(o);

  const emitResults = emits.map((e) => ({ ...e, reachable: e.fn ? reachedFnOpens.has(e.fn.openPos) : false }));

  return {
    transitions: transitionResults,
    emits: emitResults,
    uncoveredTransitions: transitionResults.filter((t) => !t.covered),
    orphanedEmits: emitResults.filter((e) => !e.reachable),
  };
}

// ---------------------------------------------------------------------------
// Real app.js
// ---------------------------------------------------------------------------
const APP_JS_PATH = path.join(__dirname, 'app.js');
const realSource = fs.readFileSync(APP_JS_PATH, 'utf8');

test('sanity/non-vacuity: app.js contains at least one transition and one emit site (population is non-empty)', () => {
  const transitionCount = findAll(realSource, TRANSITION_NEEDLE).length;
  const emitCount = findAll(realSource, EMIT_NEEDLE).length;
  assert.ok(transitionCount > 0, 'expected at least one setCurrentView(\'pool-detail\') site in app.js');
  assert.ok(emitCount > 0, 'expected at least one Analytics.trackPoolView( site in app.js');
});

test('setCurrentView(\'pool-detail\') count === Analytics.trackPoolView( count in app.js', () => {
  const transitionCount = findAll(realSource, TRANSITION_NEEDLE).length;
  const emitCount = findAll(realSource, EMIT_NEEDLE).length;
  assert.strictEqual(transitionCount, emitCount,
    `transition sites (${transitionCount}) and emit sites (${emitCount}) counts diverged`);
});

const realAnalysis = analyze(realSource);

test('every setCurrentView(\'pool-detail\') site is covered (no uninstrumented pool-detail entry path)', () => {
  const gaps = realAnalysis.uncoveredTransitions.map((t) => `line ${t.line} (pos ${t.pos})`);
  assert.deepStrictEqual(gaps, [],
    `${gaps.length} transition site(s) have no reachable Analytics.trackPoolView( emit: ${gaps.join(', ')}`);
});

test('every Analytics.trackPoolView( site is reachable from a transition (no orphaned emit laundering coverage)', () => {
  const orphans = realAnalysis.orphanedEmits.map((e) => `line ${e.line} (pos ${e.pos})`);
  assert.deepStrictEqual(orphans, [],
    `${orphans.length} emit site(s) are not reachable from any transition: ${orphans.join(', ')}`);
});

test('non-vacuity of the RELATION itself: at least one transition is covered via rule (a) [direct] and at least one via rule (b) [parked state] — a checker that only ever exercises one rule hasn\'t proven the other exists', () => {
  const rules = realAnalysis.transitions.map((t) => t.rule);
  assert.ok(rules.includes('a'), 'expected at least one transition covered directly (rule a) — got: ' + JSON.stringify(rules));
  assert.ok(rules.includes('b'), 'expected at least one transition covered via the parked-state relation (rule b, the url_direct/spec-182 handoff) — got: ' + JSON.stringify(rules));
});

console.log(`\n  population: ${realAnalysis.transitions.length} transition site(s), ${realAnalysis.emits.length} emit site(s)`);
console.log('  ' + realAnalysis.transitions.map((t) => `line ${t.line}: covered=${t.covered} rule=${t.rule || 'none'}`).join('\n  '));

// ---------------------------------------------------------------------------
// Self-defeat (A): delete the handleCalculateYield emit from an in-memory
// COPY — analyze() must report its transition uncovered. Locates the call
// generically (by its distinguishing source:'yield_calculator' value, which
// spec 257 mandates and which is unique to this one call site) rather than
// by hardcoding a line number or the call's exact formatted text — a
// reformat of the surrounding code must not silently break this drill.
// ---------------------------------------------------------------------------
function findMatchingParen(source, openParenPos) {
  // Simple paren-depth walk, string-naive by design: this helper only ever
  // runs against a known, simple `Analytics.trackPoolView(pool, { ... })`
  // call site in THIS file's own test fixtures, never against arbitrary
  // untrusted source, so it doesn't need scanCode's string/comment handling.
  let depth = 0;
  for (let i = openParenPos; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') { depth--; if (depth === 0) return i; }
  }
  throw new Error('findMatchingParen: unbalanced parens from pos ' + openParenPos);
}

function removeCalculatorEmit(source) {
  let idx = source.indexOf(EMIT_NEEDLE);
  while (idx !== -1) {
    const openParen = idx + EMIT_NEEDLE.length - 1; // index of the '(' itself
    const closeParen = findMatchingParen(source, openParen);
    const callText = source.slice(idx, closeParen + 1);
    if (callText.includes("'yield_calculator'")) {
      let end = closeParen + 1;
      if (source[end] === ';') end++;
      return source.slice(0, idx) + source.slice(end);
    }
    idx = source.indexOf(EMIT_NEEDLE, idx + 1);
  }
  throw new Error('removeCalculatorEmit: could not find the yield_calculator Analytics.trackPoolView( call to remove — did the source value change?');
}

test('self-defeat (A): removing the handleCalculateYield emit makes its transition go RED (uncovered)', () => {
  const mutated = removeCalculatorEmit(realSource);
  assert.notStrictEqual(mutated, realSource, 'sanity: the mutation must actually change the source text');

  const mutatedAnalysis = analyze(mutated);
  assert.ok(mutatedAnalysis.uncoveredTransitions.length > 0,
    'expected at least one uncovered transition after deleting the yield_calculator emit, got none — the checker cannot go red, which is not evidence it works');

  // Match transitions by ORDINAL position (both lists are found via the same
  // left-to-right findAll(), and the deletion removes a span entirely BEFORE
  // the calculator's own transition without adding/removing any transition
  // site) — never by raw character offset, which the deletion shifts for
  // everything after it. The transition count itself must also be unchanged
  // (this drill removes an emit, not a transition).
  assert.strictEqual(mutatedAnalysis.transitions.length, realAnalysis.transitions.length,
    'sanity: removing an emit must not change the number of transition sites');
  const flippedToUncovered = realAnalysis.transitions.filter((t, i) => t.covered && !mutatedAnalysis.transitions[i].covered);
  assert.ok(flippedToUncovered.length > 0,
    `expected at least one transition to flip from covered to uncovered; real=${JSON.stringify(realAnalysis.transitions.map((t) => ({ line: t.line, covered: t.covered })))} mutated=${JSON.stringify(mutatedAnalysis.transitions.map((t) => ({ line: t.line, covered: t.covered })))}`);
  // And it must be the RIGHT one — the calculator's transition specifically
  // (identified by being the transition whose ordinal-matched real entry sat
  // in the same function as the deleted emit, i.e. line 2803 in the current
  // file — found generically here via "the one whose line moved down",
  // since removing text before it shifts its position/line but not its
  // relative order).
  assert.ok(flippedToUncovered.some((t) => t.rule === 'a'),
    `expected the flipped transition to be the one previously covered via rule (a) (the calculator's own direct emit); got ${JSON.stringify(flippedToUncovered.map((t) => ({ line: t.line, rule: t.rule })))}`);

  // Restore proof: the REAL (unmutated) source, re-analyzed fresh, must
  // still be fully covered — the mutation lived only in the local `mutated`
  // string, never touched the file on disk or module-level state.
  const reCheck = analyze(realSource);
  assert.deepStrictEqual(reCheck.uncoveredTransitions, [],
    'sanity: re-analyzing the real (unmutated) source after the mutation drill must still show zero uncovered transitions');
});

// ---------------------------------------------------------------------------
// Self-defeat (B): inject a synthetic FOURTH, deliberately uninstrumented
// setCurrentView('pool-detail') transition inside a brand-new function, on
// an in-memory copy. Proves the population isn't hardcoded to "3" or "4" —
// a transition the checker has never seen before must still be caught. The
// synthetic function calls a setter whose derived state-variable name
// (`syntheticFourthEntryPoolMarker257`) is constructed to be unique to this
// test and guaranteed absent from the rest of app.js, so rule (b) cannot
// accidentally "cover" it through an unrelated coincidental match.
// ---------------------------------------------------------------------------
const SYNTHETIC_VAR = 'syntheticFourthEntryPoolMarker257';
const SYNTHETIC_FN = `\nconst handleSyntheticFourthEntry257 = (pool) => {\n  set${SYNTHETIC_VAR[0].toUpperCase()}${SYNTHETIC_VAR.slice(1)}(pool);\n  setCurrentView('pool-detail');\n};\n`;

test('self-defeat (B): a synthetic fourth, uninstrumented transition is reported uncovered (population is derived, not hardcoded to 3)', () => {
  assert.ok(!realSource.includes(SYNTHETIC_VAR),
    `sanity: "${SYNTHETIC_VAR}" must not already appear in app.js, or this drill proves nothing`);

  const mutated = realSource + SYNTHETIC_FN;
  const mutatedAnalysis = analyze(mutated);

  assert.strictEqual(
    findAll(mutated, TRANSITION_NEEDLE).length,
    findAll(realSource, TRANSITION_NEEDLE).length + 1,
    'sanity: the synthetic function must add exactly one new transition site'
  );

  const syntheticPos = mutated.lastIndexOf(TRANSITION_NEEDLE);
  const syntheticGap = mutatedAnalysis.uncoveredTransitions.find((t) => t.pos === syntheticPos);
  assert.ok(syntheticGap, `expected the synthetic transition (pos ${syntheticPos}) to be reported uncovered; got uncovered=${JSON.stringify(mutatedAnalysis.uncoveredTransitions.map((t) => t.pos))}`);

  // And the other three (real) transitions must remain covered — the
  // synthetic addition must not accidentally perturb unrelated coverage.
  const realPositions = new Set(findAll(realSource, TRANSITION_NEEDLE));
  const realStillCovered = mutatedAnalysis.transitions.filter((t) => realPositions.has(t.pos) && t.covered);
  assert.strictEqual(realStillCovered.length, realPositions.size,
    `expected all ${realPositions.size} real transitions to remain covered alongside the synthetic gap; only ${realStillCovered.length} did`);
});

// ---------------------------------------------------------------------------
// Rule (a) dominance guards (permanent — spec 257 attempt 3, verifier-found).
//
// The SECOND shipped version of rule (a) was pure textual co-occurrence:
// "the transition's enclosing function itself calls
// Analytics.trackPoolView(" — no offset comparison, no block reasoning. An
// independent verifier broke it with the mutation below, through the
// exported analyze(): it scored `covered:true, rule:'a'` (transitionCount
// and emitCount both went 3->4, everything green) while containing a
// genuinely uninstrumented pool-detail transition, behind an ordinary
// early-return guard clause. This is the same "worse than no guard" failure
// as the rule-(b) false positives above — a check that watches a
// RESEMBLANCE of the mechanism (same function, don't care about order or
// branch) launders the gap as coverage.
// ---------------------------------------------------------------------------

const WEIRD_PATH_VERIFY_MUTATION = `
const handleWeirdPathVERIFY = (pool, skip) => {
  if (skip) {
    setCurrentView('pool-detail');
    return;                                  // never reaches the emit below
  }
  Analytics.trackPoolView(pool, { source: 'weird_path_verify' });
};
`;

test('rule (a) dominance (1) [verifier-found, self-defeat]: an emit that only runs AFTER an early-return the transition already took (same function, textually later, guard clause) must not cover the transition', () => {
  assert.ok(!realSource.includes('handleWeirdPathVERIFY'), 'sanity: the verifier fixture name must not already appear in app.js');

  const mutated = realSource + WEIRD_PATH_VERIFY_MUTATION;
  const before = realAnalysis; // reuse — the real file, unmutated
  const after = analyze(mutated);

  const pos = mutated.lastIndexOf(TRANSITION_NEEDLE);
  const t = after.transitions.find((x) => x.pos === pos);
  assert.ok(t, 'sanity: the injected transition must be found by the scanner');
  assert.strictEqual(t.covered, false,
    `verifier-found false positive reopened: the early-return guard's transition was reported covered=${t.covered} rule=${t.rule} — rule (a) is matching on textual co-occurrence again instead of dominance`);

  // Before/after classification, stated explicitly (spec requirement): the
  // real file has zero uncovered transitions; the mutated copy must have
  // at least one, and it must be this exact transition.
  assert.deepStrictEqual(before.uncoveredTransitions, [], 'sanity: the unmutated real file must be fully covered before the mutation is applied');
  assert.ok(after.uncoveredTransitions.length > 0, 'expected the mutation to produce at least one uncovered transition');
  assert.ok(after.uncoveredTransitions.some((u) => u.pos === pos), 'expected the specific injected transition to be the one reported uncovered');
});

test('count-equality alone does not imply coverage: the verifier\'s mutation adds one transition AND one emit (counts stay equal, 3->4 both) while the aggregate coverage check still goes red — the two checks are intentionally independent, count-equality is NOT a proxy for coverage', () => {
  const mutated = realSource + WEIRD_PATH_VERIFY_MUTATION;
  const mutatedTransitionCount = findAll(mutated, TRANSITION_NEEDLE).length;
  const mutatedEmitCount = findAll(mutated, EMIT_NEEDLE).length;
  const realTransitionCount = findAll(realSource, TRANSITION_NEEDLE).length;
  const realEmitCount = findAll(realSource, EMIT_NEEDLE).length;
  assert.strictEqual(mutatedTransitionCount, realTransitionCount + 1, 'sanity: mutation adds exactly one transition site');
  assert.strictEqual(mutatedEmitCount, realEmitCount + 1, 'sanity: mutation adds exactly one emit site');
  assert.strictEqual(mutatedTransitionCount, mutatedEmitCount,
    'sanity: the count-equality check stays green on the mutated source (this is the point — it is not enough on its own)');

  const a = analyze(mutated);
  assert.ok(a.uncoveredTransitions.length > 0,
    'expected the coverage check to catch what the count-equality check, by construction, cannot: a real gap with matching cardinality on both sides');
});

test('rule (a) dominance (2) [sibling-branch, mirror-image of the verifier\'s mutation]: an emit inside a sibling if/else branch that the transition\'s own branch never reaches must not cover the transition, even though it is textually EARLIER in the function', () => {
  const SIBLING_BRANCH_MUTATION = `
const handleSiblingBranchVERIFY257 = (pool, useOtherBranch) => {
  if (useOtherBranch) {
    Analytics.trackPoolView(pool, { source: 'sibling_branch_verify_257' });
  } else {
    setCurrentView('pool-detail');
  }
};
`;
  assert.ok(!realSource.includes('handleSiblingBranchVERIFY257'), 'sanity: the fixture name must not already appear in app.js');

  const mutated = realSource + SIBLING_BRANCH_MUTATION;
  const a = analyze(mutated);
  const pos = mutated.lastIndexOf(TRANSITION_NEEDLE);
  const t = a.transitions.find((x) => x.pos === pos);
  assert.ok(t, 'sanity: the injected transition must be found by the scanner');
  // Sanity: the emit really is textually before the transition here — this
  // drill is only interesting if a naive "emit.pos < transition.pos" rule
  // (with no block check) would have wrongly called it covered.
  const emitPos = mutated.indexOf(EMIT_NEEDLE, mutated.indexOf('handleSiblingBranchVERIFY257'));
  assert.ok(emitPos > -1 && emitPos < pos, 'sanity: the sibling-branch emit must be textually earlier than the transition, or this drill is not exercising the interesting case');
  assert.strictEqual(t.covered, false,
    `expected the sibling-branch emit (different block, same depth, textually earlier) to NOT cover the transition; got covered=${t.covered} rule=${t.rule} — offset order alone is not dominance`);
});

test('rule (a) dominance positive control: a transition nested inside an if-block, whose emit sits at the enclosing function\'s top level BEFORE the if, must still be reported covered (proves the dominance rule does not over-reject)', () => {
  const POSITIVE_CONTROL_MUTATION = `
const handleNestedButDominatedVERIFY257 = (pool, cond) => {
  Analytics.trackPoolView(pool, { source: 'nested_but_dominated_verify_257' });
  if (cond) {
    setCurrentView('pool-detail');
  }
};
`;
  assert.ok(!realSource.includes('handleNestedButDominatedVERIFY257'), 'sanity: the fixture name must not already appear in app.js');

  const mutated = realSource + POSITIVE_CONTROL_MUTATION;
  const a = analyze(mutated);
  const pos = mutated.lastIndexOf(TRANSITION_NEEDLE);
  const t = a.transitions.find((x) => x.pos === pos);
  assert.ok(t, 'sanity: the injected transition must be found by the scanner');
  assert.strictEqual(t.covered, true,
    `expected the nested transition, dominated by a top-level emit before the if, to be covered; got covered=${t.covered} — a dominance rule that rejects everything nested would wrongly fail this`);
  assert.strictEqual(t.rule, 'a', `expected coverage via rule (a); got rule=${t.rule}`);
});

// ---------------------------------------------------------------------------
// False-positive regression guards (permanent — spec 257 follow-up).
//
// The FIRST shipped version of rule (b) was a name-collision heuristic ("the
// setter's derived variable name appears as a bare word somewhere in an
// emitting function"). An independent verifier broke it with these two
// concrete mutations through the exported analyze() — both scored
// `covered:true, rule:'b'` under the old rule, which is the exact "worse
// than no guard" failure RAZOR worked example 5 warns about (a check that
// watches a RESEMBLANCE of the mechanism launders the gap as coverage).
// These are the positive controls for the new three-part rule (b): without
// them, a future edit could silently reintroduce the same name-collision
// shortcut and this file would go green again while the hole reopens.
// ---------------------------------------------------------------------------

test('false-positive (1) [verifier-found]: a setter that is NOT a real useState binding (setPool, no [pool, setPool] = useState(...) declaration exists) must not cover its transition, even though the bare word "pool" appears throughout app.js', () => {
  const FALSE_POSITIVE_1_VAR = 'GenuinelyUninstrumentedEntry999';
  const fn = `\nconst handle${FALSE_POSITIVE_1_VAR} = (pool) => { setPool(pool); setCurrentView('pool-detail'); };\n`;
  assert.ok(!realSource.includes(FALSE_POSITIVE_1_VAR), `sanity: "${FALSE_POSITIVE_1_VAR}" must not already appear in app.js`);
  assert.ok(!/\[\s*pool\s*,\s*setPool\s*\]\s*=\s*(?:React\.)?useState\(/.test(realSource),
    'sanity: app.js must not (yet) declare a real [pool, setPool] = useState(...) binding, or this drill proves nothing');

  const mutated = realSource + fn;
  const a = analyze(mutated);
  const pos = mutated.lastIndexOf(TRANSITION_NEEDLE);
  const t = a.transitions.find((x) => x.pos === pos);
  assert.ok(t, 'sanity: the injected transition must be found by the scanner');
  assert.strictEqual(t.covered, false,
    `verifier-found false positive reopened: setPool(pool) was reported covered=${t.covered} rule=${t.rule} — rule (b) is matching on the bare word "pool" again instead of a real useState binding`);
});

test('false-positive (2) [verifier-found]: a REAL setter (setSelectedChain) whose state variable merely appears as a bare word near an unrelated emit must not cover an unrelated transition', () => {
  const FALSE_POSITIVE_2_VAR = 'SwitchChainThenViewPool999';
  const fn = `\nconst handle${FALSE_POSITIVE_2_VAR} = (pool, chain) => { setSelectedChain(chain); setCurrentView('pool-detail'); };\n`;
  assert.ok(!realSource.includes(FALSE_POSITIVE_2_VAR), `sanity: "${FALSE_POSITIVE_2_VAR}" must not already appear in app.js`);
  assert.ok(/\[\s*selectedChain\s*,\s*setSelectedChain\s*\]\s*=\s*(?:React\.)?useState\(/.test(realSource),
    'sanity: setSelectedChain must be a REAL useState setter in app.js, or this drill is not exercising the interesting case');
  assert.ok(!realAnalysis.emits.some((e) => firstArgIdentifier(realSource, e.pos) === 'selectedChain'),
    'sanity: no real trackPoolView( call reports selectedChain as its first argument — the old rule\'s match was a coincidence, not a mechanism');

  const mutated = realSource + fn;
  const a = analyze(mutated);
  const pos = mutated.lastIndexOf(TRANSITION_NEEDLE);
  const t = a.transitions.find((x) => x.pos === pos);
  assert.ok(t, 'sanity: the injected transition must be found by the scanner');
  assert.strictEqual(t.covered, false,
    `verifier-found false positive reopened: setSelectedChain(chain) was reported covered=${t.covered} rule=${t.rule} — rule (b) is matching on a bare-word coincidence again instead of the first-argument/dependency mechanism`);
});

// ---------------------------------------------------------------------------
// Rule (b) truth table — build.md's test rule: "each sub-rule neutered
// separately so 'three working rules' is distinguishable from 'one working
// rule and two dead ones'." Applied to the one REAL rule-(b) pairing in
// app.js (the url_direct handoff: setPendingUrlDirectPool -> the sibling
// useEffect's trackPoolView(pendingUrlDirectPool, ...)). Each mutator below
// breaks exactly ONE of (i)/(ii)/(iii) in an in-memory copy, leaving the
// other two intact, and the url_direct transition must flip to uncovered
// every time — proving each sub-condition is independently load-bearing,
// not merely along for the ride.
// ---------------------------------------------------------------------------

function assertUniqueFixture(source, needle, label) {
  const first = source.indexOf(needle);
  assert.notStrictEqual(first, -1, `truth-table fixture (${label}): could not find "${needle}" in app.js — did the url_direct handoff shape change?`);
  assert.strictEqual(source.indexOf(needle, first + 1), -1, `truth-table fixture (${label}): "${needle}" is not unique in app.js`);
  return first;
}

// Neuters (i): the setter call site is untouched, but the declaration no
// longer reads `useState(` (a fake hook name instead) — stateBindings can no
// longer recognize setPendingUrlDirectPool as a real setter.
function neuterSubconditionI(source) {
  const needle = '[pendingUrlDirectPool, setPendingUrlDirectPool] = useState(';
  assertUniqueFixture(source, needle, '(i) useState declaration');
  return source.replace(needle, '[pendingUrlDirectPool, setPendingUrlDirectPool] = useFakeState257(');
}

// Neuters (ii): the emit still reports the right pool at runtime (parens are
// semantically inert), but the first argument is no longer a BARE
// identifier, so firstArgIdentifier() no longer matches pendingUrlDirectPool.
function neuterSubconditionII(source) {
  const needle = 'Analytics.trackPoolView(pendingUrlDirectPool, {';
  assertUniqueFixture(source, needle, '(ii) first-argument identity');
  return source.replace(needle, 'Analytics.trackPoolView((pendingUrlDirectPool), {');
}

// Neuters (iii): drops pendingUrlDirectPool from the dependency array (the
// declaration and the first-argument identity are both untouched).
function neuterSubconditionIII(source) {
  const needle = '[protocolUrlsSettled, pendingUrlDirectPool]';
  assertUniqueFixture(source, needle, '(iii) dependency-array membership');
  return source.replace(needle, '[protocolUrlsSettled]');
}

test('rule (b) truth table: baseline — the real url_direct transition is covered via rule (b)', () => {
  const urlDirect = realAnalysis.transitions[0];
  assert.strictEqual(urlDirect.line, 1293, `sanity: expected the url_direct transition to be the first found (line 1293), got line ${urlDirect.line} — has app.js reordered?`);
  assert.strictEqual(urlDirect.rule, 'b', `expected the url_direct transition covered via rule (b); got rule=${urlDirect.rule}`);
  assert.strictEqual(urlDirect.covered, true);
});

for (const [subCondition, mutator] of [
  ['(i) setX backed by a real useState declaration', neuterSubconditionI],
  ['(ii) x is the first argument of the trackPoolView( call', neuterSubconditionII],
  ['(iii) x is in that useEffect\'s dependency array', neuterSubconditionIII],
]) {
  test(`rule (b) truth table: neutering ONLY sub-condition ${subCondition} flips the url_direct transition to uncovered`, () => {
    const mutated = mutator(realSource);
    assert.notStrictEqual(mutated, realSource, 'sanity: the mutator must actually change the source text');

    const a = analyze(mutated);
    // Ordinal match (index 0), same reasoning as self-defeat (A): these
    // mutations only ever replace text, never add/remove a transition site,
    // so document order (and therefore array index) is preserved even
    // though character offsets shift for text after the edit.
    assert.strictEqual(a.transitions.length, realAnalysis.transitions.length,
      'sanity: neutering a sub-condition must not change the number of transition sites');
    const urlDirect = a.transitions[0];
    assert.strictEqual(urlDirect.covered, false,
      `expected the url_direct transition to be UNCOVERED with sub-condition ${subCondition} neutered (the other two intact); got covered=${urlDirect.covered} rule=${urlDirect.rule} — this sub-condition is not load-bearing`);
  });
}

test('rule (b) truth table: sanity re-check — the real (unmutated) source is still fully covered after the truth-table drills', () => {
  const reCheck = analyze(realSource);
  assert.deepStrictEqual(reCheck.uncoveredTransitions, [],
    'sanity: re-analyzing the real (unmutated) source after the truth-table drills must still show zero uncovered transitions');
});

console.log(`\n${passed} assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));

module.exports = { analyze, findAll, TRANSITION_NEEDLE, EMIT_NEEDLE, firstArgIdentifier };
