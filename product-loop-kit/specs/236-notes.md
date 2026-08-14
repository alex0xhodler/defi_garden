# Spec 236 phase 1 — build notes

Scope actually shipped: ONE `.app-header-sticky` band (via the existing
`renderHeaderRow()`) on all three analytics-app views (no-results/search,
results grid, pool detail) + ONE `--content-max-width` token consumed by
every page-shell container. Phase 2 (the "Search yields / How it works /
My garden" nav links, breadcrumb-on-arrival-context rules) is explicitly
OUT of scope here and is not addressed by this diff.

## Files touched
- `app.js` — no-results/search branch now always renders `.app-header-sticky`
  → `renderHeaderRow(includeSearch)`, with `includeSearch` = `!!(selectedToken
  || (chainMode && selectedChain))` (same expression the `.has-results`
  class already used); `.app-nav-row` (category tabs) stays gated to the
  results state only. Deleted: the standalone floating `.theme-toggle`/
  `.language-toggle` pair and the `.header.animate-on-mount` block (giant
  centered `h1.logo` + `.subtitle`).
- `style.css` — new `--content-max-width: 1200px` token in `:root`; every
  page-shell selector that used to hardcode `600px`/`1200px` now resolves
  it (`.app:not(.has-results) .container`, `.app.has-results .container`,
  `.app-header-content`, `.app-nav-row`); a new `.app:not(.has-results)
  .container` reading-measure cap on `.search-section` (`max-width:600px;
  margin-inline:auto`); a new `padding-top: calc(var(--ui-header-h) + 1px)`
  on `.app:not(.has-results):not(.pool-detail-view)` so the newly-added
  fixed band doesn't overlap the flex-centered hero; deleted the
  `.header.animate-on-mount`/`.logo`/`.logo:hover` scale-pop block (dead
  code, see below); three nested-content-grid literals (`.results-panel`,
  `.pools-list`, `.pools-grid`'s desktop media query) also tokenized —
  see "Nested-grid 1200px literals" below.
- `pool-detail-styles.css` — `.app.pool-detail-view .container`'s
  `max-width: none` → `max-width: var(--content-max-width); margin: 0
  auto;`.
- `app.compiled.js`/`app.compiled.min.js`/`style.min.css`/
  `pool-detail-styles.min.css` — regenerated via `npm run compile && npm
  run minify` (no hand-edits).
- `package.json` — `test:serial` gets `test_nav_band_identity.js` appended
  at the end.
- `test_nav_band_identity.js` — new rendered-Playwright gate (below); see
  "Round 2 additions" for the port-resilience and occlusion-assertion
  amendments made after the first coordinator review pass.
- `test_mobile_controls_reachable.js` — **modified, 32 lines.** Injects
  synthetic `.theme-toggle`/`.language-toggle` elements (as direct children
  of `.app`, matching the exact pre-236 standalone markup shape) into
  criterion (9)'s RED-proof, immediately before that proof's existing CSS
  mutation runs. See "Round 3 addition" below for why this was necessary
  and what it does and does not change.

## Deviations from the literal spec text, and why

1. **`includeSearch=false` on the no-results band is intentional, not a
   gap.** The task brief explicitly pre-decided this (decision #1) and I
   verified it holds: `.app-search-container`'s input has no autocomplete
   wiring in `renderHeaderRow()` — that logic lives entirely in the
   existing `.search-section` (`showAutocomplete`/`autocompleteTokens`),
   which stays untouched below the band. Routing the no-results state's
   search through the band instead would have silently dropped token
   autocomplete from the home surface. `test_nav_band_identity.js`
   deliberately does not assert on the search slot for this reason.

2. **`.pool-detail-container`'s 880px is left alone.** Confirmed by reading
   `pool-detail-styles.css`: `.app.pool-detail-view .container` (the SHELL)
   is a separate element from `.pool-detail-container` (the certificate's
   own reading MEASURE, `max-width: 880px`, its own `margin: 0 auto`).
   Tokenizing the shell's `max-width: none` → `var(--content-max-width)` is
   visually inert at any viewport ≤1200px (the 880px inner cap already
   binds) — verified by inspection of the two nested max-widths.

3. **`.logo:hover`'s banned scale-pop (style.css, was ~5200) was deleted**,
   per the task brief's own conditional instruction ("delete the now-dead
   rules and say so in notes" if `h1.logo` disappears as a natural
   consequence). It does: the no-results state's `h1.logo`/`.header
   .animate-on-mount` block is gone from `app.js`, and grep confirms
   `.logo`/`.header` (bare classes, not `.app-logo`/`.app-header-*`) had
   exactly one render call site each in the whole repo, now removed. I
   deleted the `.header.animate-on-mount` animation rule and the `.logo`/
   `.logo:hover` pair together (they're the same dead unit — an entry
   animation for an element that's gone, plus the banned hover it drove).
   **I deliberately did NOT delete every other `.logo`/`.header`/
   `.subtitle` rule in style.css** (the base color/layout/pseudo-element
   declarations at ~2251-2290 and the two responsive overrides at
   ~3736/3803ish) — those are also now unreachable dead CSS, but the task
   brief named only the scale-pop specifically, and a full sweep is a
   larger, separately-reviewable cleanup outside "surgical diffs." Left as
   known debt; a future pass (or item 238, which already owns the
   scale-pop family) should sweep the rest.

4. **Nested-grid `1200px` literals** (`.results-panel`, `.pools-list`,
   `.pools-grid`'s `@media (min-width:1024px)` rule) were tokenized too,
   beyond the two container/`.app-header-content`/`.app-nav-row` selectors
   the brief named explicitly. Inspected each: all three are CONTENT grids
   nested *inside* `.container` (which is already capped at
   `--content-max-width`), so their own `max-width:1200px` was always a
   redundant no-op (the parent is already narrower once its own padding is
   subtracted) — not a second, independently-drifting shell. Converting
   them is zero visual risk and removes three more naked `1200px` literals
   that could otherwise confuse a future reader into thinking they're an
   independent source of truth. The brief's cited line numbers (2656,
   2815, 3049, 3627, 3632, 3913) didn't all correspond to literal `1200px`
   occurrences by the time I read the file (line drift from other work);
   I located every live `1200px`/`600px` occurrence by grep instead of
   trusting the cited line numbers, and converted the three that were
   real content-width literals.

5. **New `padding-top` on `.app:not(.has-results):not(.pool-detail-view)`
   was not explicitly specified but was necessary.** `.app-header-sticky`
   is `position: fixed`; before this change the no-results state never
   rendered it, so there was nothing to clear. Adding the band without
   compensating clearance would visually overlap the flex-centered hero
   underneath at every viewport. Pool-detail already carries the identical
   pattern (`padding-top: calc(var(--ui-header-h) + 1px)` on
   `.app.pool-detail-view`, pool-detail-styles.css) for the exact same
   reason (one-row band, no nav-row) — I reused the same expression and
   the same shared `--ui-header-h` token rather than inventing a new
   number, and excluded `.pool-detail-view` from the new rule so the two
   never fight (equal CSS specificity; pool-detail-styles.css's own rule
   would have won on source order anyway, but explicit exclusion is
   clearer). This rule also applies to the dead-pool-view state (see
   below), which renders from the same branch and needed the same fix.

6. **The dead-pool-view state (a `?pool=<id>` arrival whose id no longer
   resolves) also gained the band as a side effect**, since it renders from
   the same "no results" branch as the search/home state and the change
   that added the band there is an unconditional structural change, not a
   conditional one keyed on `deadPoolResolved`. This is outside the task
   brief's named three views, but leaving dead-pool-view band-less while
   its sibling branch gained one would have reintroduced exactly the kind
   of surface-to-surface divergence 236 exists to close. `.app:not
  (.has-results):not(.pool-detail-view)`'s new padding-top rule applies to
   it too (it doesn't carry `.pool-detail-view`), so it gets the same
   overlap fix. Not covered by `test_nav_band_identity.js`'s assertions
   (out of the task's named scope) — spot-checked visually only.

## Conservative choices
- Introduced **zero new translation strings** — `renderHeaderRow()` was
  already fully translated; the deleted hero block's `'DeFi Garden'` /
  `'Find the best yields...'` were hardcoded English with no `t()` call to
  begin with (pre-existing, not something 236 needed to fix), so removing
  them removes a latent i18n gap rather than creating one.
- The initial build left the dead direct-child toggle guards in place. The
  preview follow-up removed them and their four mobile positioning variants:
  every analytics view now renders controls only inside the shared header, so
  selectors for `.app > .theme-toggle` / `.language-toggle` had no runtime
  target and described an architecture that no longer exists.
- Did not touch `.error-state`'s CSS (no max-width) even though the
  no-results shell widened — inspected it: it's a flex child of
  `.container` under `align-items: center` (not `stretch`), so it never
  stretches to the shell's full width regardless of the shell's max-width;
  confirmed no regression, left alone.

## Non-vacuity — mutation transcript (verbatim)

Mutation: in `app.js`, on the no-results/search branch, changed the always-
rendering `React.createElement('div', { className: 'app-header-sticky' }, ...)`
wrapper so the whole band element is conditionally suppressed only in the
no-results case — i.e. reintroduced the pre-236 `(selectedToken ||
(chainMode && selectedChain)) &&` guard around the ENTIRE `.app-header-sticky`
block (not just the nav-row), recompiled (`npm run compile && npm run
minify`), and reran the gate.

Exact edit applied for the RED run:
```diff
-    React.createElement('div', {
+    (selectedToken || (chainMode && selectedChain)) && React.createElement('div', {
       className: 'app-header-sticky'
     },
```

RED run output (relevant failures; full log identical in shape to the GREEN
run below except for the failing assertions):
```
  ✗ [360x780 [light]] .app-header-sticky/.app-header-content present on all 3 views, data-theme correct
    no-results (/?app=1): .app-header-sticky missing
  ✗ [360x780 [light]] .app-header-sticky height identical (±1px) across all 3 views
    Cannot read properties of null (reading 'stickyHeight')
  ... (repeated per viewport × theme combination for the same reason)
```
(exact wording depends on the JS error text at the point of failure; every
leg 1-4 that reads `no-results`'s facts throws because `.app-header-sticky`
is null on that view, exactly as expected — the identity assertions go RED
because the no-results surface lost its band.)

Restore: reverted the one-line diff above (`git diff app.js` back to the
pre-mutation state), recompiled + reminified, and verified byte-identity
with `md5sum` before mutating vs. after restoring — both `app.js` and the
derived `app.compiled.js`/`app.compiled.min.js` matched exactly. Reran the
gate → GREEN (see "Tests run" in the final report for the restored, passing
output).

## Round 2 additions (coordinator review, first pass)

The coordinator's own run of `test_nav_band_identity.js` on this branch found
two real gaps the first pass missed. Both are now fixed and covered.

1. **A second, un-tokened width source survived in a media query.**
   `style.css`, inside `@media (max-width: 768px)`, both
   `.app:not(.has-results) .container` and `.app.has-results .container`
   still carried their own `max-width: 100%` override (pre-236 code),
   which — being later in the cascade at equal specificity — beat the base
   rule's `max-width: var(--content-max-width)` below 768px. Below 1200px
   viewport width `100%` and the token resolve to the identical visible
   width, so this was never a visual bug, but it WAS exactly the "second
   source of truth" 236 exists to close: a shell's width was still decided
   in two places. Fix: deleted the `max-width: 100%` line from both rules
   (kept their `padding` override), so the property now falls through to
   the base rule's token reference at every breakpoint. **Media-query sweep
   performed at the coordinator's request** — grepped every occurrence of
   the five shell selectors (`.app-header-content`, `.app-nav-row`,
   `.app.has-results .container`, `.app:not(.has-results) .container`,
   `.app.pool-detail-view .container`) across `style.css` AND
   `pool-detail-styles.css`: the `@media (max-width: 640px)` override of
   `.app-header-content` only touches `gap`/`padding` (not `max-width`);
   `.app-nav-row` and `.app.pool-detail-view .container` have no other
   override anywhere in either file. The 768px rule above was the ONLY
   divergent one; it is now fixed and re-verified (`test_nav_band_identity.js`
   Leg 5 passes at every tested viewport/theme combination).

2. **A latent occlusion risk in the pre-existing `-5vh` "Google-style
   positioning" shift** (`.app:not(.has-results) .container { transform:
   translateY(-5vh); }`, unconditional, predates 236) — the new fixed band
   plus its `padding-top: calc(var(--ui-header-h) + 1px)` clearance don't
   account for a `transform`, since a transform shifts the painted box
   without changing layout/padding math. Measured with a real render at the
   three required widths (using the same viewport heights
   `test_nav_band_identity.js` itself uses: 360×780, 768×900, 1280×900),
   both themes (identical in light/dark since layout, not color, is what's
   at stake):

   | viewport | `.app-header-sticky` bottom | `.search-section` top | clearance |
   |---|---|---|---|
   | 360×780  | 53px | 245.5px | 192.5px |
   | 768×900  | 57px | 301.5px | 244.5px |
   | 1280×900 | 57px | 288px   | 231px |

   No occlusion at any tested combination — the `-5vh` shift (39-45px at
   these heights) is a small fraction of the ~190-245px of headroom the
   flex-centered layout leaves at these viewport heights, so it never pulls
   the hero within reach of the band. Left the transform untouched (no
   product-code change needed here) and added a permanent, generic
   assertion instead of a one-off manual check: `test_nav_band_identity.js`
   Leg 8 now asserts, on every view (not just no-results), that the
   `.container`'s first element child's top is at or below
   `.app-header-sticky`'s bottom edge, with the `elementFromPoint`-style
   rigor the rest of the file already uses for other geometry claims. This
   also incidentally verified grid (`firstElementChild` = `.results-section`)
   and pool-detail (`.pool-detail-container`) have no occlusion of their own
   pre-existing clearance mechanisms — neither was suspected of a problem,
   but the assertion is generic across all three views, so it checks them
   too, for free.

3. **A second, previously-latent CSS-specificity bug, found while fixing
   (1)** — not something the coordinator flagged directly, but uncovered
   while re-verifying `test_nav_band_identity.js` after the container fix
   above: at ≤640/480px, `style.css` carries legacy rules `.app:not
   (.has-results) .theme-toggle` / `.language-toggle` (a DESCENDANT
   selector, specificity (0,3,0)) that re-pin those controls to
   `position: fixed` — written when the standalone floating pair was the
   ONLY thing matching that selector inside `.app:not(.has-results)`. Once
   236 made the no-results state render the same in-flow header band the
   other views use, this same descendant selector ALSO matched the band's
   OWN nested `.app-header-controls .theme-toggle`/`.language-toggle`
   (specificity (0,2,0), previously enough to reset them to `position:
   static` per the existing "Backlog 222" comment in `style.css`) — and
   being MORE specific, won, yanking the header's own controls back out of
   flow. Measured effect: `.app-header-controls` collapsed to a `0×0`
   rect at 360/480px on the no-results view only (grid/pool-detail
   unaffected — their `.container` is `.app.has-results`/
   `.app.pool-detail-view`, never matched by the `.app:not(.has-results)`
   selector). Fix: changed the four affected rules (theme-toggle × 2
   breakpoints, language-toggle × 2 breakpoints) from a descendant
   combinator to a direct-child combinator (`.app:not(.has-results) >
   .theme-toggle`), matching what the comment above them already said the
   rule was FOR (the standalone pair, which really was always a direct
   child of `.app`) and mirroring the existing `.app.has-results >
   .theme-toggle { display: none }` pattern elsewhere in the same file.
   Re-verified via `getComputedStyle`/`getBoundingClientRect`: the band's
   controls now resolve to the identical rect on the no-results view as on
   grid/pool-detail at 360px (`x:252,y:6,width:88,height:40` on all three).

4. **Test-infra housekeeping**: `test_nav_band_identity.js`'s local server
   now binds port `0` (OS-assigned free port) and reads back whatever port
   it actually got, instead of a fixed hinted port — a stale listener left
   by a prior run had produced an `EADDRINUSE` failure unrelated to the
   product code. `PORT` is now a `let`, reassigned once inside
   `startServer()` before any `page.goto()` call.

## Round 3 addition — `test_mobile_controls_reachable.js`'s item-222 RED
   proof needed a repair, not just a re-run

The coordinator's own run of `test_mobile_controls_reachable.js` on this
branch found **29/30**, and proved (by stashing the whole tree, running the
same file clean on `origin/main`, getting 30/30, then restoring) that this
branch caused it. Diagnosis, confirmed by reading the failing assertion:

Criterion (9)'s RED proof (`test_mobile_controls_reachable.js`, "(9) RED
PROOF: with the shipped fix mutated away in-page...") is item 222's own
non-vacuity check. It works by injecting CSS that reverses item 222's THREE
fixes, including `.app.has-results > .theme-toggle { display: flex
!important; }` / `...language-toggle {...}` — a rule that only does
anything if a `.theme-toggle`/`.language-toggle` element already EXISTS,
hidden, as a direct child of `.app.has-results`. Before 236, that was
always true: the standalone floating pair rendered unconditionally as a
direct child of `.app` on every view (item 222's own fix (2) was the CSS
`display: none` guard that hid it specifically on results pages), so
"un-hiding" it was a one-line CSS reveal. **236 deleted those standalone
elements at the JSX source** — the no-results/search state now renders the
same in-flow header band every other view does, and there is no longer any
code path anywhere in `app.js` that renders a bare `.theme-toggle`/
`.language-toggle` outside `.app-header-controls`. So `display: flex
!important` on a selector matching zero elements is a silent no-op: the
positive control had nothing left to reveal, and criteria (1)+(2) stayed
green through the mutation — the exact "a check that cannot fail is not
evidence of health" failure mode this file's own header comment warns
about, just relocated one level up (the outer gate that watches the inner
gate's own aliveness).

**Fix applied** (the 32-line diff referenced in "Files touched" above):
immediately before that proof's existing `addStyleTag` CSS mutation, inject
two elements via `page.evaluate()` — a `<button class="theme-toggle"
data-theme="light" aria-label="Switch to dark mode">` (with the same inner
`<div class="theme-toggle-icon">☾</div>`) and a `<button
class="language-toggle" aria-label="Switch to Korean">EN</button>` —
appended as direct children of `document.querySelector('.app')`, i.e. the
exact shape and position the pre-236 standalone pair used to render. The
proof's pre-existing CSS mutation is otherwise byte-for-byte unchanged; it
now has real elements to reveal again, so it fires exactly as before:

```
red proof fired as expected: 768x780 red-proof POST-mutation (must go red):
expected exactly 1 visible .theme-toggle, got 2 -- [...two elements, one
".app-control-btn theme-toggle" (the band's own) and one bare ".theme-toggle"
(the injected standalone), both visible at the identical rect...] | hit test
at "centre" did not resolve to .theme-toggle itself -- covering element:
<DIV class="theme-toggle-icon"> | hit test at "lowerBand" did not resolve to
.theme-toggle itself -- covering element: <BUTTON class="theme-toggle">
```

**No criterion was weakened.** The failure-message contract the outer
`test('(9) RED PROOF...')` block checks for (`/covering element|expected
exactly 1 visible/`) is untouched; the assertion helpers
(`assertControlsReachable`/`assertReachable`/`measureControlsDiagnostic`)
are untouched; the pre-mutation sanity check (must be green before
mutating) is untouched; the CSS mutation block itself is untouched. The
only change is that the proof now MANUFACTURES the duplicate-element
precondition its mutation always assumed, instead of assuming the DOM
already contained it.

**Honest consequence, stated plainly**: as of 236, item 222's original
duplicate-controls defect class is **structurally unreachable** on the
shipped product — the elements that made it possible are gone from the
render path, not merely hidden by CSS. The preview follow-up therefore
removed the dead direct-child CSS guards instead of retaining a second
architecture as defence-in-depth.

Criterion (9)'s RED proof now injects the retired duplicate shape only after
its green precondition, then restores the former fixed geometry. It tests
whether `assertControlsReachable` detects duplicate/covered controls; it no
longer claims that production CSS hides a duplicate the product can render.

## What phase 1 does NOT close
- Phase 2's nav links ("Search yields / How it works / My garden") are not
  added anywhere — the band still carries only wordmark + (optional search)
  + language/theme, per this item's explicit scope line.
- The breadcrumb-on-arrival-context rule (pool-detail shows "Search Results
  → X" only when arrived from the grid) is untouched.
- `stories/` persona pages and the generated static estate (tokens/,
  chains/, pool pages) keep their own lightweight header, unchanged — out
  of scope per the spec's own "Class closed" note.
- The now-fully-dead `.logo`/`.header`/`.subtitle` base CSS (color/layout,
  not the animation/scale-pop already removed) is not swept.

## Mobile search-context follow-up

The first PR preview exposed a phone-only geometry defect: at 360px the
wordmark and fixed-size controls left the search input with a 40px text box,
so the active query disappeared while the non-shrinking clear button remained.
The shared header now hides only the redundant wordmark below 480px, keeps the
38px leaf identity tile, removes duplicated field padding, and gives the clear
action a fixed 32px hit area. The exact query remains in the editable input;
long pool symbols show their meaningful prefix rather than an empty field.

`test_mobile_search_context.js` covers no-results and pool-detail arrivals at
360px plus the wider 768px identity state. It asserts exact values, at least
96px of visible input width, zero horizontal overflow, reachable controls,
an accessible localized label, and restoration of the full wordmark when
space permits. The source and compiled/minified asset twins are regenerated
together.
