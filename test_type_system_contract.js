/* Plain-lane machine-enforced contract for backlog 238 — "retire the terminal
   skin, one type system on the Quiet base."

   Territory notes (product-loop-kit/specs/238.md, "added at build time,
   2026-08-10") re-measured the spec's hypothesis on main (the spec was
   written against claude/loop-225, a tree that no longer exists) and found:
   the font-stack half was real (3 hardcoded stacks survived: style.css
   .pool-info-item .value.token-pair, planner-styles.css
   .gp-waitlist-link-text, .gp-journey-status's dead fallback — all fixed in
   this same diff) but the UPPERCASE half of the spec's hypothesis was
   FALSIFIED: git blame shows the 247 "certificate" world (#409/#412/#413,
   2026-08-07) deliberately AUTHORED several of the 23 uppercase micro-label
   rules as a serif/wide-tracking convention, not terminal-skin residue. This
   loop will not silently revert a human design directive on a guess, so
   Rule 2 below enforces the CLASS ("no un-reasoned uppercase rule can be
   added") via a reasoned allowlist rather than asserting zero uppercase.

   Three independently-failing sub-rules, each with its own non-vacuity
   mutation documented in the build report (not re-run here — see the PR/
   session notes for the md5sum-verified red/restore transcript):

   Rule 1 — no hardcoded font stacks outside the token layer.
   Rule 2 — every `text-transform: uppercase` rule is in a reasoned,
            set-equal (both directions) allowlist seeded below.
   Rule 3 — absolute ban on `transform: scale(...)` inside any `:hover`
            selector, repo-wide, no allowlist.

   The population is DERIVED at test time (never a hardcoded file list): every
   root-level `*.css` that is not `*.min.css`, plus `stories/stories.css`
   (spec's explicit population definition). A glob that returns fewer than 4
   files fails loudly — a broken glob must never read as a clean pass.

   Run: node test_type_system_contract.js */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Population: derived by glob, not a hardcoded file list. Root-level *.css
// excluding *.min.css, plus stories/stories.css. node_modules/ and .github/
// are excluded defensively (the root-only glob can't reach them today, but
// the exclusion is spelled out per the spec so a future recursive glob stays
// safe).
// ---------------------------------------------------------------------------
function resolvePopulation() {
  const rootEntries = fs.readdirSync(ROOT, { withFileTypes: true });
  const files = rootEntries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => /\.css$/i.test(name) && !/\.min\.css$/i.test(name))
    .filter((name) => !name.includes('node_modules') && !name.includes('.github'))
    .sort();
  const extra = 'stories/stories.css';
  if (fs.existsSync(path.join(ROOT, extra)) && !extra.includes('node_modules') && !extra.includes('.github')) {
    files.push(extra);
  }
  return files;
}

const POPULATION = resolvePopulation();

test('population glob: >= 4 product stylesheets found (a broken glob must not read as a clean pass)', () => {
  console.log('    population (' + POPULATION.length + '): ' + POPULATION.join(', '));
  assert.ok(POPULATION.length >= 4,
    `glob returned only ${POPULATION.length} file(s): ${JSON.stringify(POPULATION)} — expected >= 4`);
  for (const f of POPULATION) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `population file does not exist: ${f}`);
  }
});

// ---------------------------------------------------------------------------
// CSS-aware tokenizer shared by all three rules. Tracks brace depth so
// declarations are correctly scoped to their owning rule (leaf selector,
// @font-face descriptor block, or @keyframes percentage/from/to frame) and
// so a string value containing `{`/`}`/`;`/`/*` never desyncs parsing.
// Comments are skipped entirely (never enter header/declaration text) but
// still advance the line counter, so reported line numbers stay accurate.
// ---------------------------------------------------------------------------
function parseCss(text) {
  const frames = [];
  const stack = [];
  let buffer = '';
  let segStartLine = 1;
  let segHasContent = false;
  let line = 1;
  let i = 0;
  const len = text.length;

  function flushDecl(targetFrame, raw, atLine) {
    const decl = raw.trim();
    if (!decl) return;
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) return; // stray text, not a property:value pair
    const prop = decl.slice(0, colonIdx).trim();
    const value = decl.slice(colonIdx + 1).trim();
    if (!prop) return;
    targetFrame.decls.push({ prop, value, line: atLine });
  }

  while (i < len) {
    const ch = text[i];
    if (ch === '\n') { line++; buffer += ch; i++; continue; }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? len : end + 2;
      for (let k = i; k < stop; k++) if (text[k] === '\n') line++;
      i = stop;
      continue; // comment text never enters buffer, never starts a segment
    }
    if (ch === '"' || ch === "'") {
      if (!segHasContent) { segStartLine = line; segHasContent = true; }
      const quote = ch;
      buffer += ch; i++;
      while (i < len && text[i] !== quote) {
        if (text[i] === '\n') line++;
        buffer += text[i]; i++;
      }
      if (i < len) { buffer += text[i]; i++; }
      continue;
    }
    if (ch === '{') {
      const header = buffer.trim();
      const frame = { header, startLine: segStartLine, decls: [], ancestors: stack.map((f) => f.header) };
      stack.push(frame);
      frames.push(frame);
      buffer = ''; segHasContent = false;
      i++; continue;
    }
    if (ch === '}') {
      const topFrame = stack[stack.length - 1];
      if (topFrame) flushDecl(topFrame, buffer, segStartLine);
      if (stack.length) stack.pop();
      buffer = ''; segHasContent = false;
      i++; continue;
    }
    if (ch === ';') {
      const topFrame = stack[stack.length - 1];
      if (topFrame) flushDecl(topFrame, buffer, segStartLine);
      buffer = ''; segHasContent = false;
      i++; continue;
    }
    if (/\s/.test(ch)) { buffer += ch; i++; continue; }
    if (!segHasContent) { segStartLine = line; segHasContent = true; }
    buffer += ch;
    i++;
  }
  return frames;
}

function loadFrames(relPath) {
  const text = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  return parseCss(text);
}

// ---------------------------------------------------------------------------
// Rule 1 — no hardcoded font stacks outside the token layer.
//
// Population: every declaration whose property is the real CSS property
// `font-family`, OR a custom-property definition whose name contains "font"
// or starts with "cert-" (`--font-family-mono`, `--cert-serif`, ... — "allow
// any `--*font*`/`--cert-*` property definition, don't hardcode five names").
// Allowed: (a) value is a `var(--...)` reference; (b) declaration lives
// inside an `@font-face` block (a descriptor, not a stack); (c) the
// declaration IS a custom-property token definition (by construction, the
// place a concrete stack is legitimately allowed to live).
// ---------------------------------------------------------------------------
function collectFontFamilyViolations() {
  const violations = [];
  for (const relPath of POPULATION) {
    const frames = loadFrames(relPath);
    for (const frame of frames) {
      const insideFontFace = /^@font-face/i.test(frame.header) ||
        frame.ancestors.some((a) => /^@font-face/i.test(a));
      for (const d of frame.decls) {
        const isRealFontFamilyProp = d.prop === 'font-family';
        const isCustomFontTokenDef = /^--/.test(d.prop) && (/font/i.test(d.prop) || /^--cert-/i.test(d.prop));
        if (!isRealFontFamilyProp && !isCustomFontTokenDef) continue;
        if (isCustomFontTokenDef) continue; // (c) token definition — always allowed
        if (insideFontFace) continue; // (b) @font-face descriptor — allowed
        if (/^var\(--/.test(d.value)) continue; // (a) references the token — allowed
        violations.push({ file: relPath, line: d.line, prop: d.prop, value: d.value, selector: frame.header });
      }
    }
  }
  return violations;
}

test('Rule 1: every font-family declaration in the population is a token reference, an @font-face descriptor, or a token definition', () => {
  const violations = collectFontFamilyViolations();
  if (violations.length) {
    const detail = violations
      .map((v) => `${v.file}:${v.line}  selector="${v.selector}"  ${v.prop}: ${v.value}`)
      .join('\n    ');
    throw new Error(`${violations.length} hardcoded font-family declaration(s) found:\n    ${detail}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 2 — reasoned allowlist for `text-transform: uppercase` (the 189
// pattern). Keyed by file + selector text.
//
// Seeded 2026-08-10 with the CURRENT population on this branch (derived by
// reading the files, not assumed from the spec's headline "23" — the glob
// population here also includes stories/stories.css, which the spec's count
// did not, so the true total enforced below is 24: the 23 across the four
// product stylesheets the spec named, plus 1 in stories/stories.css).
//
// Category legend (put ONE of these three literal phrases in every reason,
// so a human can scan and answer the open question the spec leaves — "of the
// N, which are the 247 certificate world's intended micro-label convention
// and which are terminal-skin residue?" — by grep-ing for the phrase):
//   - "247-world micro-label": uppercase + wide letter-spacing (~0.14–0.22em)
//     eyebrow/plate labels using --font-family-display or --cert-serif — the
//     certificate convention #409/#412/#413 introduced or matched.
//   - "data": the rendered string is inherently uppercase (a monogram/ticker
//     derived from data, not a styling choice).
//   - "unreviewed residue": cannot be confirmed either way from source alone
//     (git blame resolves only to a squashed boundary commit with no design
//     rationale in the message) — said plainly rather than inventing intent.
//
// IMPORTANT for whoever answers the open question: flipping a reason string
// to explicitly say "residue" (i.e. deciding a currently-"unreviewed
// residue" or even a currently-"247-world micro-label" entry should in fact
// go sentence-case) does NOT by itself change any rendering — it only marks
// intent. The actual sentence-case sweep is a separate, purely mechanical
// follow-up once every entry below has an intentional (non-"unreviewed")
// reason: delete `text-transform: uppercase` (and, where present, the wide
// `letter-spacing`) from each rule marked residue, then delete its row here
// so Rule 2's reverse (stale-entry) check keeps the list truthful.
// ---------------------------------------------------------------------------
const UPPERCASE_ALLOWLIST = [
  // style.css (6) — all blame to the pre-247 Quiet-reset squash commit
  // (d730a7dcc3, 2026-08-06 03:47, "229 compound step..."); none carry the
  // certificate convention's display-serif + wide-tracking signature.
  { file: 'style.css', selector: '.filter-label',
    reason: 'unreviewed residue — predates the 247 certificate world (blame: pre-247 Quiet-reset squash), modest 1.8px tracking, no --cert-serif/--font-family-display; cannot confirm intent from source alone.' },
  { file: 'style.css', selector: '.pool-detail-label',
    reason: 'unreviewed residue — predates 247, no display-serif or wide tracking (0.05em); cannot confirm intent from source alone.' },
  { file: 'style.css', selector: '.pool-logo-monogram',
    reason: 'data — renders a single-letter protocol monogram already produced via .toUpperCase() in app.js (String(project||"").trim()[0]); the CSS transform is redundant with the data itself, not a styling choice.' },
  { file: 'style.css', selector: '.pool-left-section::after',
    reason: 'unreviewed residue — dead rule (repo comment: "dead weight kept inert (opacity: 0, no attribute ever sets data-pool-type)"); out of this round\'s scope per the build brief, listed here only so Rule 2 sees the live CSS text and does not orphan-flag it.' },
  { file: 'style.css', selector: '.start-earning-btn',
    reason: 'unreviewed residue — predates 247, sans body font + narrow 0.025em tracking (button label, not a display-serif eyebrow); cannot confirm intent from source alone.' },
  { file: 'style.css', selector: '.value-filter-label',
    reason: 'unreviewed residue — predates 247, modest 1px tracking, no display-serif; cannot confirm intent from source alone.' },

  // planner-styles.css (11)
  { file: 'planner-styles.css', selector: '.gp-checkout-price-label',
    reason: 'unreviewed residue — predates 247, sans body font + 0.06em tracking; cannot confirm intent from source alone.' },
  { file: 'planner-styles.css', selector: '.gp-checkout-mode-btn',
    reason: 'unreviewed residue — predates 247, sans body font + 0.05em tracking (a mode-toggle button label, not an eyebrow); cannot confirm intent from source alone.' },
  { file: 'planner-styles.css', selector: '.gp-whatif-label',
    reason: 'unreviewed residue — predates 247, sans body font + 0.04em tracking; cannot confirm intent from source alone.' },
  { file: 'planner-styles.css', selector: '.gp-engine-filter-label',
    reason: '247-world micro-label — uses --font-family-display with 0.18em tracking, matching the certificate eyebrow-label recipe used elsewhere in this file.' },
  { file: 'planner-styles.css', selector: '.gp-makeit-label',
    reason: '247-world micro-label — --font-family-display + 0.22em tracking, the exact certificate convention.' },
  { file: 'planner-styles.css', selector: '.gp-goal-cat-label',
    reason: '247-world micro-label — from #413 (60278d4d47a, 2026-08-07); repo comment on this rule literally reads "Plate-label voice — pool-detail\'s serif micro-caps recipe."' },
  { file: 'planner-styles.css', selector: '.gp-sub-ladder-title',
    reason: '247-world micro-label — from #413 (60278d4d47a, 2026-08-07), same "plate-label voice" recipe as .gp-goal-cat-label immediately above it.' },
  { file: 'planner-styles.css', selector: '.gp-plan-card-title',
    reason: '247-world micro-label — --font-family-display + 0.22em tracking, the certificate eyebrow convention.' },
  { file: 'planner-styles.css', selector: '.gp-makeit-compact-label',
    reason: '247-world micro-label — --font-family-display + 0.18em tracking, the certificate eyebrow convention.' },
  { file: 'planner-styles.css', selector: '.gp-waitlist-label',
    reason: 'unreviewed residue — predates 247, sans body font + 0.05em tracking; cannot confirm intent from source alone.' },
  { file: 'planner-styles.css', selector: '.gp-waitlist-step',
    reason: 'unreviewed residue — predates 247, sans body font + 0.06em tracking; cannot confirm intent from source alone.' },

  // pool-detail-styles.css (4) — all four blame to 514b4ba2368 (#409,
  // 2026-08-07 12:55), the certificate skin's own launch commit; all use
  // --cert-serif at 0.22em tracking, the convention itself.
  { file: 'pool-detail-styles.css', selector: '.pool-action-apy-label',
    reason: '247-world micro-label — --cert-serif + 0.22em tracking, from the certificate skin\'s launch commit (#409/#412, 2026-08-07); this IS the convention.' },
  { file: 'pool-detail-styles.css', selector: '.pool-projection-label',
    reason: '247-world micro-label — --cert-serif + 0.22em tracking, same certificate skin launch commit.' },
  { file: 'pool-detail-styles.css', selector: '.calc-readout-label',
    reason: '247-world micro-label — --cert-serif + 0.22em tracking, same certificate skin launch commit.' },
  { file: 'pool-detail-styles.css', selector: '.pool-tokens-label',
    reason: '247-world micro-label — --cert-serif + 0.22em tracking, same certificate skin launch commit.' },

  // landing-styles.css (2)
  { file: 'landing-styles.css', selector: '.landing-examples-label',
    reason: '247-world micro-label — repo comment reads "Plate-label voice — same recipe as pool-detail\'s .pool-action-apy-label (serif 11px/600, .22em tracked caps)"; --font-family-display + 0.22em tracking.' },
  { file: 'landing-styles.css', selector: '.landing-card-caption',
    reason: '247-world micro-label — from #413 (60278d4d47a, 2026-08-07); --font-family-display + 0.14em tracking, same family as the other certificate eyebrow labels though slightly narrower tracked.' },

  // stories/stories.css (1) — NOT counted in the spec's headline "23" (which
  // only summed the four product stylesheets by name); included here because
  // this test's population glob explicitly adds stories/stories.css.
  { file: 'stories/stories.css', selector: '.st-eyebrow',
    reason: 'unreviewed residue — predates 247, no --cert-serif/--font-family-display, class literally named "eyebrow" but never referenced by the 238 territory notes or the design-system spec; cannot confirm intent from source alone.' }
];

const REASON_CATEGORIES = ['247-world micro-label', 'data', 'unreviewed residue'];

function collectUppercaseRules() {
  const rules = [];
  for (const relPath of POPULATION) {
    const frames = loadFrames(relPath);
    for (const frame of frames) {
      if (/^@/.test(frame.header)) continue; // at-rule container itself, not a rule
      const insideKeyframes = frame.ancestors.some((a) => /^@keyframes/i.test(a));
      if (insideKeyframes) continue;
      for (const d of frame.decls) {
        if (d.prop === 'text-transform' && /^uppercase$/i.test(d.value)) {
          rules.push({ file: relPath, selector: frame.header, line: d.line });
        }
      }
    }
  }
  return rules;
}

function ruleKey(r) { return r.file + ' ' + r.selector; }

test('Rule 2: uppercase-rule reasons all name one of the three seeded categories, and no allowlist entry is malformed', () => {
  for (const entry of UPPERCASE_ALLOWLIST) {
    assert.ok(entry.file && entry.selector, `allowlist entry missing file/selector: ${JSON.stringify(entry)}`);
    assert.ok(typeof entry.reason === 'string' && entry.reason.trim().length > 0,
      `allowlist entry ${entry.file} / "${entry.selector}" has an empty reason`);
    const namesCategory = REASON_CATEGORIES.some((c) => entry.reason.includes(c));
    assert.ok(namesCategory,
      `allowlist entry ${entry.file} / "${entry.selector}" reason does not name one of the three categories (${REASON_CATEGORIES.join(', ')}): "${entry.reason}"`);
  }
});

test('Rule 2 (forward): every live text-transform:uppercase rule appears in the reasoned allowlist', () => {
  const live = collectUppercaseRules();
  console.log(`    live uppercase rules found: ${live.length} (style.css ${live.filter((r) => r.file === 'style.css').length}, planner-styles.css ${live.filter((r) => r.file === 'planner-styles.css').length}, pool-detail-styles.css ${live.filter((r) => r.file === 'pool-detail-styles.css').length}, landing-styles.css ${live.filter((r) => r.file === 'landing-styles.css').length}, stories/stories.css ${live.filter((r) => r.file === 'stories/stories.css').length})`);
  const allowedKeys = new Set(UPPERCASE_ALLOWLIST.map(ruleKey));
  const unlisted = live.filter((r) => !allowedKeys.has(ruleKey(r)));
  if (unlisted.length) {
    const detail = unlisted.map((r) => `${r.file}:${r.line} selector="${r.selector}"`).join('\n    ');
    throw new Error(`${unlisted.length} un-reasoned uppercase rule(s) not in UPPERCASE_ALLOWLIST:\n    ${detail}`);
  }
});

test('Rule 2 (reverse / stale-entry): every allowlist entry has a matching live rule (set-equality mirror, RAZOR.md)', () => {
  const live = collectUppercaseRules();
  const liveKeys = new Set(live.map(ruleKey));
  const stale = UPPERCASE_ALLOWLIST.filter((e) => !liveKeys.has(ruleKey(e)));
  if (stale.length) {
    const detail = stale.map((e) => `${e.file} selector="${e.selector}"`).join('\n    ');
    throw new Error(`${stale.length} stale allowlist entr(y/ies) with no matching live CSS rule:\n    ${detail}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 3 — absolute ban on scale-pop hovers. No allowlist. Must not match
// @keyframes bodies, and must not be fooled by a comma-separated selector
// list spanning multiple lines (each individual selector in the list is
// checked for `:hover`).
// ---------------------------------------------------------------------------
function collectHoverScaleViolations() {
  const violations = [];
  for (const relPath of POPULATION) {
    const frames = loadFrames(relPath);
    for (const frame of frames) {
      if (/^@/.test(frame.header)) continue;
      const insideKeyframes = frame.ancestors.some((a) => /^@keyframes/i.test(a));
      if (insideKeyframes) continue;
      const individualSelectors = frame.header.split(',').map((s) => s.trim());
      const hasHover = individualSelectors.some((s) => s.includes(':hover'));
      if (!hasHover) continue;
      for (const d of frame.decls) {
        if (d.prop === 'transform' && /scale\s*\(/.test(d.value)) {
          violations.push({ file: relPath, line: d.line, selector: frame.header, value: d.value });
        }
      }
    }
  }
  return violations;
}

test('Rule 3: no transform:scale(...) inside any :hover selector, repo-wide, no allowlist', () => {
  const violations = collectHoverScaleViolations();
  if (violations.length) {
    const detail = violations
      .map((v) => `${v.file}:${v.line}  selector="${v.selector}"  transform: ${v.value}`)
      .join('\n    ');
    throw new Error(`${violations.length} scale-pop hover(s) found:\n    ${detail}`);
  }
});

console.log(`\ntest_type_system_contract.js: ${passed}/${total} tests passed`);
if (process.exitCode) process.exit(process.exitCode);
