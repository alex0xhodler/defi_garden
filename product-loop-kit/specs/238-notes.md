# 238 build notes — retire the terminal skin

Risk tier: HIGH (per spec). Scope: `style.css` typography only (font-family,
text-transform) + the one named `.logo:hover` scale-pop. No geometry,
spacing, color, or markup touched. No translations.js edits (checked, none
needed — see below).

## Already fixed before this pass (stale evidence, confirmed not re-touched)

- `grep -c "SF Mono" style.css` was already 0 on `main`.
- `.pool-symbol` / `.pool-context-inline` (the spec's named "ON LIDO •
  ETHEREUM" mono-uppercase badges) already carry no `text-transform` and no
  mono font — a prior round's comment ("225 round 3 (a)") documents the
  fix. Left untouched.

## text-transform: uppercase — selector-by-selector

10 rules found pre-change. 8 REMOVED (label/badge prose → sentence case,
body stack), 2 ALLOWED (data-display, not prose) and now the test file's
allowlist.

| selector | verdict | reason |
|---|---|---|
| `.sota-popover-title` | REMOVE | popover section title, prose label |
| `.sota-section-subtitle` | REMOVE | popover subtitle, prose label |
| `.filter-label` | REMOVE | filter panel label, prose |
| `.pool-detail-label` | REMOVE | field label above APY/TVL numerals, prose |
| `.seo-eyebrow` | REMOVE | renders `translations.js` `seoEyebrow` = "Live On-Chain Rates" (EN) / "실시간 온체인 금리" (KO) — already sentence/title case at the source; spec's own Change section names "badges" as things that drop uppercase. Kept `font-family: var(--font-family-mono)` as-is: it's a correctly tokenized value (not flagged by the audit's font list) and the eyebrow-chip pattern intentionally mirrors `.landing-spotlight-eyebrow` (a different, out-of-scope file — see Residuals below). |
| `.pool-logo-monogram` | **ALLOW** | single-character protocol-avatar glyph (`monogram = project[0]`, `app.js:851`); the JS already calls `.toUpperCase()` on that one character independently of this CSS. Data-display glyph, not prose — matches the "data, keyed, reported by size" allowlist shape from `I18N_UNTRANSLATED_ALLOWLIST` (audit-app.js). |
| `.pool-left-section::after` | **ALLOW** | confirmed dead: `grep -rn "data-pool-type" *.js` → zero hits, no JS ever sets the attribute the rule's `content: attr(data-pool-type)` reads, and the rule sits at `opacity: 0`. Pre-existing, flagged out-of-scope by the comment directly above it ("225 round... left as-is, out of this round's scope"). Left the rule alone per that comment, but it is now accounted for explicitly in the allowlist rather than silently ignored, per the task brief. |
| `.start-earning-btn` | REMOVE | live CTA (`app.js:4480`, renders `'Start Earning →'`), not the shared `.btn`/`.btn--primary` family (style.css:480–520, which is already lowercase/sentence-case). Joined the uppercase-kill: prose CTA text, and CLAUDE.md's "one button" rule argues against a bespoke uppercase treatment existing as a silent variant. (Its geometry/color/one-button consolidation is a separate, larger change — out of scope here; only the uppercase transform was touched.) |
| `.value-filter-label` | REMOVE | same family as `.filter-label`, prose |
| `.section-label` (mobile drawer, `@media` block) | REMOVE | drawer/section label, prose |

Net: 10 → 2 (both allowlisted with reasons, both mechanically enforced by
`test_typography_tokens.js`).

## font-family token fixes

- `.pool-score-chip` (was line 3656): `font-family: var(--font-mono, monospace)` →
  `var(--font-family-mono)`. `--font-mono` is not defined anywhere in
  style.css (only `--font-family-mono`, style.css:103 was), so this always
  silently fell back to the bare `monospace` keyword.
- `.pool-info-item .value.token-pair` (was line 5651): bare
  `font-family: monospace;` → `var(--font-family-mono)`.
- No other non-token `font-family:` declarations exist outside `@font-face`
  — verified by `test_typography_tokens.js`'s enumeration (it derives the
  population from style.css at test time, not a hand-picked list) and
  spot-confirmed against the grep list handed down in the task brief
  (`inherit` occurrences and the `--font-family-display, "Besley", Georgia,
  serif` fallback chain are both valid and untouched).
- The three `@font-face { font-family: 'FKGroteskNeue' | 'Besley' | 'Public
  Sans' }` blocks are face-name declarations, not token usage — excluded by
  the parser (`atFontFace` flag) and left untouched.

## `.logo:hover` scale-pop deletion

Deleted the `.logo { transition: transform 300ms var(--entry-easing); }` +
`.logo:hover { transform: scale(1.02); }` pair (was style.css:6377–6383).
This is the exact rule the spec's Evidence section names (line number had
drifted from `:1644` to `:6381` since the spec was written against an
earlier branch state — content matches verbatim).

Note on why this mattered in practice, not just cosmetically: an earlier,
already-shipped "225 round 3c" pass added a *second*, non-conflicting
`.logo:hover` rule higher up in the file (style.css:2686, color-shift only,
comment: "the wordmark is a mark, not a button — no pill hover, no lift")
and a `.logo:active { transform: none; }`. Because CSS rules with disjoint
properties both apply, the later `.logo:hover { transform: scale(1.02) }`
block was still winning on `transform` and firing the banned scale-pop on
every hover, silently defeating round 3c's stated intent. Deleting it
finishes what round 3c only partially did.

Also removed the now-orphaned `.logo { transition: transform 300ms
var(--entry-easing); }` sibling rule — with the scale transform gone there
was nothing left for it to transition, and leaving a transition rule with
no corresponding transform is exactly the kind of inert leftover this spec
exists to clean up. This is a 2-line deletion directly adjacent to the
named rule, not a new scope expansion.

Verification: `grep -n "transform: scale" style.css planner-styles.css
pool-detail-styles.css landing-styles.css stories/stories.css` and manually
checked every hit's enclosing selector. Remaining `style.css` hits are all
inside `@keyframes` blocks (`fadeInScale`, `loading-progress`,
`yieldBounce`, `pulse-op`) or non-hover states
(`.modal-close:active`/`:focus`-adjacent `amount-input:focus`) — **except
one residual, documented below**.

### Round 2: `.modal-close:hover` and `.landing-page-dot:hover` fixed; `hype-harvest.css` fixed too

Round-1 verifier FAIL correctly rejected this section's original framing: the
spec's own acceptance criterion reads "no `transform: scale` on any `:hover`
rule **repo-wide**... **now machine-enforced**" — not scoped to `.logo:hover`
alone, so `.modal-close:hover { transform: scale(1.05); }` (style.css) and
`.landing-page-dot:hover { transform: scale(1.15); }` (landing-styles.css)
were genuinely blocking, not optional follow-ups. Both fixed in round 2;
`test_typography_tokens.js` extended with a repo-wide scan.

Round-2 verifier then ran its own extension attack — `find . -name "*.css"`
against the *actual* file system rather than the hand-picked five the round-2
scan listed — and found a sixth live stylesheet the list missed:
`hype-harvest.css` (added 2026-08-26, PR #488, after this repo's CSS-file
inventory had last been enumerated anywhere), containing
`.quiet-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }`,
rendered live on `hype-harvest.html`. Fixed in round 3, and the weak form of
the fix this time: the scanned-file list is no longer hand-maintained at all
— `test_typography_tokens.js` now derives it from `fs.readdirSync(__dirname,
{recursive: true})` filtered to `*.css` minus `*.min.css`, so a *seventh*
new stylesheet added tomorrow is in scope automatically rather than needing
a fourth round to discover it the same way.

`.modal-close:active`'s duplicate-property oddity right below the fixed
`:hover` rule — `transform: translateY(1px);` immediately followed by
`transform: scale(0.95);`, the second silently winning — is a *different*
defect class (`:active`, not `:hover`; a duplicate-declaration bug, not a
scale-pop-on-hover) and remains genuinely out of this item's scope, per both
verifier rounds' agreement. One-line follow-up for whichever spec next
touches `.modal-close` or does a duplicate-CSS-property sweep.

`.landing-spotlight-eyebrow`
(`landing-styles.css:448–461`) still carries both `font-family:
var(--font-family-mono)` and `text-transform: uppercase` — the exact twin
`.seo-eyebrow` used to be before this pass. Since `.seo-eyebrow` dropped its
uppercase in this round and `.landing-spotlight-eyebrow` didn't (different,
out-of-scope file), the two "mirrored" eyebrow chips are now visually
inconsistent with each other (mono lowercase-title-case vs. mono uppercase)
until a follow-up touches `landing-styles.css`. Worth a line in whatever
spec picks that file up next.

## translations.js

Not touched. Checked every uppercase-removal call site's source string
(`seoEyebrow`, the filter/pool-detail labels are all short CSS-only
`t()`-driven or static labels) and none were hardcoded ALL-CAPS prose that
the CSS uppercase was merely amplifying — they were already sentence/title
case and only rendered uppercase because of the CSS. No JS string literal
needed a case fix.

## Verification run

- `npm run minify` regenerated `style.min.css` (also regenerated the other
  five already-current `.min.` bundles as a side effect of running the full
  script; they came back byte-identical since only `style.css` changed —
  confirmed via `git status`, only `style.css`/`style.min.css` are dirty
  besides an unrelated pre-existing `product-loop-kit/BACKLOG.md` change
  that was already present before this session started and was not made or
  reverted by this pass, per the "don't touch BACKLOG.md" constraint).
- `node test_typography_tokens.js` — **9/9 passed** (new test, this item).
- `node test_minified_assets.js` — **9/9 passed** (style.min.css freshness
  + home.html/plan.html reference the `.min.` files).
- `node test_compiled_assets.js` — **4/4 passed**.
- `node test_css_minified_render.js` — **2/2 passed** (Playwright: real
  router load, planner + analytics mode both request/apply the minified
  sheets).
- Supplementary ad-hoc Playwright check (throwaway, not committed): loaded
  `home.html?token=USDC` fixtured, 1280px, light+dark. `.pool-symbol`
  computed `font-family` matches `getComputedStyle(document.body)`,
  `text-transform: none` — confirms the grid-row gap from the spec's
  Evidence is closed. Did not click through to `.pool-detail-label`/
  `.filter-label` live (no reachable fixture in time budget) — relied on
  the CSS diff + `test_typography_tokens.js` enumeration for those instead.
  Full 360/768/1280 × light/dark harness (`capture-shots.js`) not run —
  time budget, per the task brief's explicit fallback allowance.

## Class-rule honesty check (per build.md)

*"If this exact defect (a hardcoded font stack, a stray uppercase
transform) appeared elsewhere tomorrow, would anything catch it?"*

Yes — `test_typography_tokens.js`. It derives both populations (every
`text-transform: uppercase` declaration and every `font-family:`
declaration) from `style.css` **at test time** via a brace-depth parser, not
from a hardcoded line-number snapshot, so a new rule anywhere in the file
is automatically in scope the next time the test runs:

- A new hardcoded stack (`font-family: 'SF Mono', Monaco, monospace;` or a
  bare `font-family: monospace;`) on any selector fails "every font-family
  declaration outside @font-face is inherit or a --font-family-* token" —
  proven non-vacuous by the test's own in-memory mutation
  (`reintroducing a hardcoded mono stack ... fails the check`).
- A new stray `text-transform: uppercase` on any selector not already in
  `UPPERCASE_ALLOWLIST` fails "every surviving text-transform: uppercase
  rule is on an allowlisted data-display selector" — proven non-vacuous the
  same way (stripping an allowlist entry in memory flips the check red).
- `test_minified_assets.js` independently catches the case where `style.css`
  is edited but `npm run minify` wasn't re-run before commit (byte-diff
  against a fresh minify).

As of round 3, it also catches a new `transform: scale` on any `:hover`
rule in any `.css` file the repo ships (population derived from disk at
test time, not a hand-maintained array — see the round-2/round-3 note
above), which is what round 2's own verifier used to find the
`hype-harvest.css` gap this repo's earlier round-2 fix had left. It would
not catch the same defect shape on a property other than `transform`, or
on a pseudo-class other than `:hover` (e.g. the `.modal-close:active`
duplicate-declaration bug noted above) — that is a different, narrower
class than 238 was scoped to close.
