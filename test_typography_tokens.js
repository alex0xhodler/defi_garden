/* Tests for spec 238 ("retire the terminal skin — one type system on the
   Quiet base", product-loop-kit/specs/238.md). Machine-enforces the two
   acceptance criteria that are testable without a browser:

     1. Every `text-transform: uppercase` declaration left in style.css
        (outside @font-face, which never carries this property) must sit on
        a selector in a hardcoded ALLOWLIST with a one-line reason — the
        189-allowlist pattern (see I18N_UNTRANSLATED_ALLOWLIST in
        audit-app.js for the shape this follows). Anything else is a label
        or badge being visually uppercased, which 238 says must render
        sentence case with the body stack.
     2. Every `font-family:` declaration outside @font-face must be
        `inherit`, a `var(--font-family-*)` token, or a fallback chain
        starting with one — never a bare quoted family name, a bare generic
        keyword (`monospace`, `sans-serif`, ...), or a wrong token name like
        `var(--font-mono, ...)` (--font-mono is not defined anywhere; it
        silently fell back to the bare `monospace` keyword before this fix).

   Both populations are DERIVED from style.css at test time via a small
   brace-depth declaration parser below — nothing here is a hardcoded line-
   number snapshot, so the test can't go stale as the file is edited around
   it (238's own acceptance note: "enumerated by test, not hand-checked").

   Non-vacuity (238's own criterion: "reintroduce one hardcoded stack ->
   enumeration test red; restore -> green"): both checks are exercised twice
   against IN-MEMORY mutations of the parsed data (style.css on disk is
   never touched) — once with an allowlist entry/valid value removed
   (expect red), once against the real population (expect green). This
   proves the checks can actually fail, not just vacuously pass.

   Run: node test_typography_tokens.js */
const fs = require('fs');
const path = require('path');

const CSS_PATH = path.join(__dirname, 'style.css');
const css = fs.readFileSync(CSS_PATH, 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    console.error('  ✗ ' + name + '\n    ' + err.message);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------
// A small CSS declaration parser: brace-depth walk that, for every
// `prop: value;` it meets, records the selector text of the INNERMOST
// enclosing block (so a rule nested inside @media still reports its own
// selector, not the media query) and whether any ancestor block is
// @font-face (those `font-family: 'Name'` lines are name declarations,
// not token usage, and must be excluded from criterion 2). Quoted strings
// are tracked so a `content: "...;..."`-style value can't desync braces.
// ---------------------------------------------------------------------
function parseDeclarations(source) {
  // Blank out comments but preserve newlines so line numbers stay correct.
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const decls = [];
  const stack = [];
  let buf = '';
  let line = 1;
  let inString = null;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch === '\n') line++;
    if (inString) {
      buf += ch;
      if (ch === inString && noComments[i - 1] !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      buf += ch;
      continue;
    }
    if (ch === '{') {
      stack.push({ selector: buf.trim(), line });
      buf = '';
      continue;
    }
    if (ch === '}') {
      stack.pop();
      buf = '';
      continue;
    }
    if (ch === ';') {
      const decl = buf.trim();
      buf = '';
      if (decl && stack.length) {
        const m = decl.match(/^([a-zA-Z-]+)\s*:\s*([\s\S]+)$/);
        if (m) {
          const top = stack[stack.length - 1];
          decls.push({
            selector: top.selector,
            prop: m[1].trim().toLowerCase(),
            value: m[2].trim(),
            line,
            atFontFace: stack.some((s) => /^@font-face\b/.test(s.selector)),
          });
        }
      }
      continue;
    }
    buf += ch;
  }
  return decls;
}

const allDecls = parseDeclarations(css);
const upperDecls = allDecls.filter(
  (d) => d.prop === 'text-transform' && /uppercase/i.test(d.value) && !d.atFontFace
);
const fontFamilyDecls = allDecls.filter((d) => d.prop === 'font-family' && !d.atFontFace);

// ---------------------------------------------------------------------
// Criterion 1: text-transform: uppercase allowlist.
//
// Every entry here is a DATA-DISPLAY exception, never a label/badge left
// uppercased for looks — see 238-notes.md for the full selector-by-selector
// reasoning of everything that was NOT allowlisted (those had the
// `text-transform: uppercase` line removed from style.css instead).
// ---------------------------------------------------------------------
const UPPERCASE_ALLOWLIST = {
  '.pool-logo-monogram':
    'single-character protocol-avatar glyph (monogram = project[0]) rendered by app.js — data-display, not prose; the JS already calls .toUpperCase() on the source character independently of this CSS',
  '.pool-left-section::after':
    'dead/inert CSS — content: attr(data-pool-type) is never set by any JS anywhere in the repo and the rule sits at opacity: 0; pre-existing and explicitly out of scope per the 225-round comment directly above it in style.css',
};

function checkUppercaseAllowlist(selectors, allowlist) {
  const uniqueSelectors = Array.from(new Set(selectors));
  const violations = uniqueSelectors.filter(
    (s) => !Object.prototype.hasOwnProperty.call(allowlist, s)
  );
  return { ok: violations.length === 0, violations };
}

test('every surviving text-transform: uppercase rule is on an allowlisted data-display selector', () => {
  const selectors = upperDecls.map((d) => d.selector);
  const result = checkUppercaseAllowlist(selectors, UPPERCASE_ALLOWLIST);
  assert(
    result.ok,
    'unallowlisted uppercase selector(s) — a label/badge is being visually uppercased: ' +
      result.violations.join(', ')
  );
});

test('non-vacuity: the uppercase population and its allowlist are both non-empty', () => {
  assert(
    upperDecls.length > 0,
    'no text-transform: uppercase declarations found at all — the check above would pass vacuously on a zero population'
  );
  assert(Object.keys(UPPERCASE_ALLOWLIST).length > 0, 'the allowlist is empty');
});

test('non-vacuity: removing an allowlist entry (in memory only) fails the check; the real allowlist passes', () => {
  const selectors = upperDecls.map((d) => d.selector);
  const key = Object.keys(UPPERCASE_ALLOWLIST)[0];
  const mutated = Object.assign({}, UPPERCASE_ALLOWLIST);
  delete mutated[key];

  const mutatedResult = checkUppercaseAllowlist(selectors, mutated);
  assert(
    !mutatedResult.ok,
    `stripping "${key}" from the allowlist should have failed the check, but it still passed — the check is vacuous`
  );
  assert(
    mutatedResult.violations.includes(key),
    `expected "${key}" to be reported as the violation after it was stripped`
  );

  const restoredResult = checkUppercaseAllowlist(selectors, UPPERCASE_ALLOWLIST);
  assert(restoredResult.ok, 'the real (unmutated) allowlist should pass — style.css on disk was never touched');
});

// ---------------------------------------------------------------------
// Criterion 2: font-family tokens.
// ---------------------------------------------------------------------
const GENERIC_FONT_KEYWORDS = [
  'monospace',
  'sans-serif',
  'serif',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-monospace',
  'ui-sans-serif',
  'ui-serif',
];

function isValidFontFamilyValue(rawValue) {
  const v = rawValue.trim().replace(/;$/, '');
  if (v === 'inherit') return true;
  // A token reference, optionally followed by a fallback chain:
  // var(--font-family-mono) | var(--font-family-display, "Besley", Georgia, serif)
  return /^var\(\s*--font-family-[a-zA-Z0-9-]+/.test(v);
}

function checkFontFamilyDecls(decls) {
  const violations = decls.filter((d) => !isValidFontFamilyValue(d.value));
  return { ok: violations.length === 0, violations };
}

test('every font-family declaration outside @font-face is `inherit` or a --font-family-* token', () => {
  const result = checkFontFamilyDecls(fontFamilyDecls);
  assert(
    result.ok,
    'non-token font-family value(s): ' +
      result.violations.map((d) => `${d.selector} (line ${d.line}): ${d.value}`).join('; ')
  );
});

test('no bare generic font-family keyword (monospace/sans-serif/…) outside @font-face', () => {
  const bad = fontFamilyDecls.filter((d) =>
    GENERIC_FONT_KEYWORDS.includes(d.value.trim().replace(/;$/, '').toLowerCase())
  );
  assert(
    bad.length === 0,
    'bare generic keyword used as a font-family value: ' +
      bad.map((d) => `${d.selector} (line ${d.line}): ${d.value}`).join('; ')
  );
});

test('no wrong token name (e.g. var(--font-mono, …)) outside @font-face', () => {
  const bad = allDecls.filter(
    (d) => d.prop === 'font-family' && !d.atFontFace && /var\(\s*--font-mono\b/.test(d.value)
  );
  assert(
    bad.length === 0,
    '--font-mono is not a defined token (only --font-family-mono is); found: ' +
      bad.map((d) => `${d.selector} (line ${d.line})`).join(', ')
  );
});

test('acceptance criterion (literal): grep -c "SF Mono" style.css === 0', () => {
  const count = (css.match(/SF Mono/g) || []).length;
  assert(count === 0, `found ${count} "SF Mono" occurrence(s) in style.css`);
});

test('non-vacuity: the font-family population is non-empty', () => {
  assert(
    fontFamilyDecls.length > 0,
    'no font-family declarations found outside @font-face — the check above would pass vacuously'
  );
});

test('non-vacuity: reintroducing a hardcoded mono stack (in memory only) fails the check; the real population passes', () => {
  const idx = fontFamilyDecls.findIndex((d) => /^var\(--font-family-mono\)?$/.test(d.value.replace(/;$/, '')));
  assert(idx !== -1, 'expected at least one bare var(--font-family-mono) declaration to mutate for this proof');

  const mutated = fontFamilyDecls.slice();
  mutated[idx] = Object.assign({}, mutated[idx], { value: "'SF Mono', Monaco, monospace" });

  const mutatedResult = checkFontFamilyDecls(mutated);
  assert(
    !mutatedResult.ok,
    'reintroducing a hardcoded \'SF Mono\', Monaco, monospace stack should have failed the check, but it passed — the check is vacuous'
  );

  const restoredResult = checkFontFamilyDecls(fontFamilyDecls);
  assert(restoredResult.ok, 'the real (unmutated) population should pass — style.css on disk was never touched');
});

// ---------------------------------------------------------------------
// Criterion 3 (238's acceptance criteria, and BACKLOG.md's own item-238
// row, both state this twice independently): "no `transform: scale` on
// any `:hover` rule repo-wide (CLAUDE.md ban, now machine-enforced)".
// Scans every stylesheet CLAUDE.md's own box-shadow-grep precedent
// covers, not just style.css — a `:hover` scale-pop in planner/pool-
// detail/landing/stories CSS is the same banned pattern.
// ---------------------------------------------------------------------
const HOVER_SCALE_FILES = [
  'style.css',
  'planner-styles.css',
  'pool-detail-styles.css',
  'landing-styles.css',
  path.join('stories', 'stories.css'),
];

function findHoverScaleViolations(files) {
  const violations = [];
  for (const rel of files) {
    const full = path.join(__dirname, rel);
    if (!fs.existsSync(full)) continue;
    const decls = parseDeclarations(fs.readFileSync(full, 'utf8'));
    for (const d of decls) {
      if (
        d.prop === 'transform' &&
        /\bscale(x|y|z|3d)?\s*\(/i.test(d.value) &&
        /:hover\b/.test(d.selector)
      ) {
        violations.push({ file: rel, selector: d.selector, value: d.value, line: d.line });
      }
    }
  }
  return violations;
}

test('no `transform: scale(...)` on any `:hover` rule, repo-wide (CLAUDE.md ban)', () => {
  const violations = findHoverScaleViolations(HOVER_SCALE_FILES);
  assert(
    violations.length === 0,
    'banned scale-pop hover(s) found: ' +
      violations.map((v) => `${v.file}:${v.line} ${v.selector} { ${v.value} }`).join('; ')
  );
});

test('non-vacuity: a synthetic scale-pop hover (in a temp file) is detected; cleanup leaves no trace', () => {
  const tmpFile = path.join(__dirname, `.__tmp_hover_scale_check_${process.pid}.css`);
  fs.writeFileSync(tmpFile, '.tmp-probe:hover {\n  transform: scale(1.05);\n}\n');
  try {
    const violations = findHoverScaleViolations([path.relative(__dirname, tmpFile)]);
    assert(
      violations.length === 1 && violations[0].selector === '.tmp-probe:hover',
      'a synthetic scale-pop hover in a fresh file should have been detected — the check is vacuous'
    );
  } finally {
    fs.unlinkSync(tmpFile);
  }
  assert(!fs.existsSync(tmpFile), 'temp probe file was not cleaned up');

  const realViolations = findHoverScaleViolations(HOVER_SCALE_FILES);
  assert(realViolations.length === 0, 'the real repo-wide scan should pass — no files on disk were touched by this proof');
});

console.log(`\n${passed} passed, ${failed} failed (typography tokens, spec 238)`);
if (failed > 0) process.exit(1);
