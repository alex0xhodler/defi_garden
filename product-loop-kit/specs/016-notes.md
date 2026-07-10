# 016 notes — re-brand empty-state action buttons (executed 2026-07-10)

## Verdict
Re-tokened `.reset-filters-btn` in place (style.css:2445-2477). No existing button class was
reusable "as-is" without either a semantic mismatch (toggle/pagination/heavy-CTA classes) or a
layout-model risk (`display:flex` vs the button's current `display:inline-flex`) that would have
touched the empty-state layout — 012's territory, explicitly OUT of scope per spec 016. Zero
changes to app.js; both buttons keep the exact same `className: 'reset-filters-btn'` they had
before.

## Reuse candidates hunted (style.css + pool-detail-styles.css)
Grepped both files for every button-shaped class, then cross-checked each against actual
`className` usage in app.js/PoolDetail.js (not just CSS presence — a class defined but never
rendered isn't "used elsewhere in the app").

| Class | Where actually used | Rest-state tokens | Why not a fit |
|---|---|---|---|
| `.btn` / `.btn--primary` (style.css:450-509, redefined 4854-4901 with `!important`) | Nowhere — zero `className` matches for `'btn'` in app.js or PoolDetail.js | bg `--color-background`, shadow `--neuro-shadow-flat` | Dead CSS, vestigial from the pre-neumorphic "Perplexity Design System" section (its own end-marker comment is at style.css:790). Not "used elsewhere in the app" in any real sense — adopting it means reviving dead code, not reusing a working pattern. |
| `.filter-pill` / `.filter-button` (style.css:4529, 4606) | Chain/token/pool-type filter chip rows | bg `--color-surface`, shadow `--neuro-shadow-subtle`, 36px pill, `.active` fills with `--color-primary` | Toggle/selection semantics (has its own `.active` "currently selected" fill state), shaped/sized as a chip for a horizontal scroll row. Styling a recovery-action button like a filter chip risks reading as "another filter," which cuts against the spec's own guardrail: "don't reduce the affordances' clarity — they're the recovery path out of a dead-end state." |
| `.pagination-button` (style.css:2290) | Previous/Next pagination controls | bg `--color-background`, shadow subtle→flat→pressed | Pagination-specific semantics plus its own `.active` (current-page) fill state; not a generic action-button precedent. |
| `.search-button` (style.css:3937) | The original "Search" / "I'm Feeling Degen" pair (app.js:2556-2570) — literally the button `.reset-filters-btn`'s own stale comment said it was "styled like" | bg `--color-background`, shadow subtle→flat→pressed, `display:flex`, `min-width:160px` | Closest visual/role match: a centered pair of standalone CTA buttons, same app. Rejected only because `display:flex` (vs. `.reset-filters-btn`'s current `display:inline-flex`) changes whether the two buttons can share a line — a real layout difference, and the empty-state layout is explicitly OUT of scope for this item ("012 owns it"). Combining classes to cherry-pick just the colors also risks a cascade fight: `.search-button` sits later in source order, so its `display:flex` would win over `.reset-filters-btn`'s `display:inline-flex` on a shared element — fragile, and still two rule blocks to maintain. |
| `.start-earning-btn` (style.css:3575, Yield Calculator modal CTA, app.js:2844) | The modal's single CTA, immediately adjacent in JSX order right after the empty state | bg `--color-primary` (filled), shadow raised→flat→pressed(+translateY 1px), uppercase, letter-spaced | Interaction curve is right (raised→flat→pressed — I borrowed this) but the visual weight is wrong: filled primary-color + uppercase reads as "the one big action," conflicting with spec bullet 2 ("both stay calm"). Using it as-is would overstate a recovery action's importance. |
| `pool-detail-styles.css`: `.back-to-results-btn`, `.quick-amount-btn` | Pool detail page only | bg `--color-background`, shadow subtle→flat→pressed | Same design language (corroborates the token vocabulary chosen below) but a different stylesheet/page — not loaded for the analytics search-grid empty state, so not a real candidate, only supporting evidence that the chosen tokens are idiomatic. |

None of the six matched spec 016's own fallback recipe (`--color-surface` + `--neuro-shadow-raised`
+ `--neuro-radius-md` at rest) as-is, and the closest in *role* (`.search-button`) differs in
`display` — a property that actually matters for the layout this item must not touch. "Reusable
as-is" would mean adopting a class wholesale with no follow-on CSS surgery; none qualified, so I
used the spec's own fallback instructions verbatim rather than force-fitting a class and papering
over the mismatch.

## Decision: re-token in place
Followed the spec's exact recipe: `--color-surface` background, `--neuro-shadow-raised` resting
shadow, `--neuro-radius-md` corners, `--color-text` type color, `:active` → `--neuro-shadow-pressed`
+ `translateY(1px)` (the documented global press-physics convention — CLAUDE.md: "controls sink 1px
into `--neuro-shadow-pressed` on `:active`"), explicit `:focus-visible` → `outline: none; box-shadow:
var(--focus-ring)` (mirrors `.filter-pill:focus-visible` / `.btn:focus-visible`, the two places in
this file that already give a neumorphic control its own focus treatment instead of the bare global
outline). `:hover` → `--neuro-shadow-flat` + `translateY(-2px)`: shadow direction matches
`.start-earning-btn`'s raised→flat hover curve, lift magnitude matches `.search-button`'s `-2px` —
no new easing, duration, or magnitude invented.

All layout-affecting properties — `display:inline-flex`, `gap`, `padding`, `margin-top`,
`min-width:auto` — are untouched, so the empty-state layout (012's territory) cannot have shifted.

Note on the focus ring specifically: even before this change, `.reset-filters-btn` already inherited
a working ring for free from the sitewide `:focus-visible { outline: var(--focus-outline);
outline-offset: 2px; }` rule (style.css:773-776) — it never overrode `outline`. The explicit rule
added here isn't fixing a missing ring; it upgrades it to the box-shadow style the other neumorphic
controls in this file use, and makes the acceptance criterion directly grep-able against
`.reset-filters-btn` itself rather than resting on an un-scoped global selector a verifier might not
think to check.

## Skipped: optional visual-hierarchy nuance
Spec bullet 2: the primary action ("Show pools with lower TVL," when present) "may use the accent
text color." Phrased as optional ("may"). Implementing it needs either a new modifier class (spec
bullet 3 caps this item at "no new classes unless replacing the old one 1:1" — a second, new class
would violate that) or a positional selector — `:first-of-type` is actually wrong here, not just
inelegant: when `minTvl === 0`, "Reset Filters" renders alone and would become "first," wrongly
acquiring accent styling meant only for the TVL button. Skipped; both buttons render identically
calm, which the spec explicitly allows ("both stay calm").

## Before / after (style.css:2445-2477)

Before:
```css
/* Reset Filters Button - styled like "I'm Feeling Degen" */
.reset-filters-btn {
  margin-top: var(--space-20);
  display: inline-flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-16) var(--space-24);
  border: none;
  background: linear-gradient(135deg, var(--color-primary), var(--color-teal-600));
  color: white;
  border-radius: var(--neuro-radius-lg);
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--neuro-shadow-raised), 0 4px 15px rgba(33, 128, 141, 0.3);
  min-width: auto;
}

.reset-filters-btn:hover {
  background: linear-gradient(135deg, var(--color-teal-600), var(--color-teal-700));
  box-shadow: var(--neuro-shadow-raised), 0 8px 25px rgba(33, 128, 141, 0.4);
  transform: translateY(-3px);
}

.reset-filters-btn:active {
  box-shadow: var(--neuro-shadow-flat);
  transform: translateY(0);
}
```

After:
```css
/* Reset Filters Button - neumorphic recovery action (empty state) */
.reset-filters-btn {
  margin-top: var(--space-20);
  display: inline-flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-16) var(--space-24);
  border: none;
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--neuro-radius-md);
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--neuro-shadow-raised);
  min-width: auto;
}

.reset-filters-btn:hover {
  box-shadow: var(--neuro-shadow-flat);
  transform: translateY(-2px);
}

.reset-filters-btn:active {
  box-shadow: var(--neuro-shadow-pressed);
  transform: translateY(1px);
}

.reset-filters-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
```

## Dark mode / responsive — reasoning
No px-based color and no breakpoint-specific rule was added or removed; every value on the button is
a `var(--...)` token already resolved for both themes (`--color-surface`, `--color-text`,
`--neuro-shadow-raised/-flat/-pressed`, `--neuro-radius-md`, `--focus-ring` all have separate
light/dark definitions — style.css:57-321 light, 195-234/3888-3925 dark). 360/768/1280 unaffected:
no width, padding, font-size, or `@media` rule was touched, so responsive behavior is inherited
unchanged from before this edit.

## Verification performed
- `grep -n "reset-filters-btn" style.css` — 4 rule blocks (`base`, `:hover`, `:active`,
  `:focus-visible`), no stray leftovers.
- `grep -n "gradient\|rgba(" style.css` scoped to lines 2445-2477 — zero matches; every declared
  value is a `var(--...)` token or a structural keyword (`none`, `pointer`, `all 0.3s ease`, etc.).
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js && node
  test_canonical.js` — exit 0 (190 planner assertions + 24 canonical assertions pass; both parsing
  scripts run to completion). These are logic/data tests; none exercise CSS, so they're a regression
  guard confirming this change didn't break unrelated app logic, not evidence the button renders
  correctly. No browser/Playwright tool is available in this sandbox (task's own environment facts:
  read-only bash mount, file-tool-only edits) — visual/dark-mode/breakpoint spot-check is a human or
  Playwright follow-up, consistent with this repo's standing "needs human visual spot-check" note for
  render-path merges until 003 ships.
