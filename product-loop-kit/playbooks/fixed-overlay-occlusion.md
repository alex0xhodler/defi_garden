# fixed-overlay-occlusion — playbook

**When:** a user reports content "cut off", "sliced mid-sentence", or a bar
"on top of" the page — OR you are auditing any view that renders
`.app-footer` / any `position: fixed` / `position: sticky` element. Also when a
CTA "doesn't work" or "isn't there" on a phone but is fine on desktop.

**Answer in one line:** it is almost never the overlay that is wrong — it is a
view-specific rule that CANCELLED the shared clearance the overlay depends on,
and the giveaway is that the defect exists on exactly one route.

## Steps

0. **Ask the machine before you ask the CSS** (added 2026-08-04, item 219 leg
   (a)). `audit-app.js` now carries an `occlusion` lens: on every audited
   surface it measures at rest (`scrollY = 0`) and at bottom-of-scroll, at
   360/768/1280 × **780px tall** (`OCCLUSION_HEIGHT`), and reports a victim
   only when geometry AND `elementFromPoint` agree. So:
   - `grep -n '"check": "occlusion"' product-loop-kit/signals/audit-findings.json`
     → **P0** = an interactive element (a CTA) is buried or click-intercepted;
     **P1** = prose is painted over; **P2** = advisory (bottom of scroll
     unreachable / candidate scan truncated / the check threw — read these,
     they mean the lens did NOT look, not that the surface is clean).
   - The finding's detail already names the overlay, the victim, both rects,
     the covered fraction and the hit-point that resolved to the overlay —
     start at step 3 (who cancels the clearance) rather than re-deriving it.
   - **Decision rule:** a human report with NO matching `occlusion` finding is
     a lens gap, not a clean page — reproduce by hand at the reporter's real
     viewport, then extend the lens (its two documented blind spots are
     overlays covering ≥80% of the viewport, and content covered by a
     *top*-anchored overlay at bottom-of-scroll, which is revealable by
     scrolling up and deliberately not flagged).
1. **Find the overlay and confirm it is opaque.** `grep -n "position: fixed" style.css`
   → `.app-footer` (`style.css:2616-2627`, was `:2513-2524` before item 221's
   comment block shifted everything below `style.css:938` by +103): `fixed;
   bottom: 0; z-index: 100;`
   with `background: var(--color-background)`. Opaque + fixed + high z-index =
   it can hide content AND intercept clicks.
2. **Find the shared clearance.** `grep -n "Space for footer" style.css` →
   `.app { padding-bottom: 80px }` (`style.css:849-853`). This is the ONLY
   padding `.app` carries anywhere in the design system — verify with
   `grep -n '\.app {' style.css pool-detail-styles.css` (expect `:849` and
   `:5227`, the latter a `transition` rule).
3. **Find who cancels it.** `grep -rn "padding: 0" *-styles.css | grep "\.app"`
   → a view override like `.app.pool-detail-view { padding: 0 }`.
   **Decision rule:** if the view's own container padding (e.g.
   `.pool-detail-container` 16-20px) is smaller than the measured overlay
   height (58px ≤768px, 69px at 1280px), the bottom band of that view is
   permanently occluded.
3b. **If NOBODY cancels it, do not conclude the view is safe — check that the
   view MATCHES the clearance selector at all** (added 2026-08-04, item 220).
   Step 3 assumes the clearance was inherited and then taken away. There is a
   third root cause it cannot see: a route whose root element carries a
   DIFFERENT class, so the shared rule never applied in the first place and
   there is no canceller to grep for. `.app { padding-bottom: 80px }` is
   class-scoped; the landing route roots at `<div class="landing-app">`
   (`landing.js:244`) while rendering the very same `.app-footer`
   (`landing.js:356`), and `grep -n "\.landing-app" style.css` returns
   **zero matches** — no rule in the shared sheet targets it at all.
   **Decision rule:** for each route, get the root element's real class list
   from the RENDER (`document.querySelector('[data-mode]').className`, or read
   the `e('div', { className: … })` at the route's mount), then confirm that
   class actually matches the clearance selector. A route rendering `.app-footer`
   whose root is not `.app` has **zero** clearance, at every scroll position —
   the worst version of this defect, and the one with the quietest signature
   (nothing to grep, nothing that ever regressed; it was born broken).
4. **Measure BOTH scroll positions — this is the step that gets skipped.**
   - `scrollY = 0` (first paint, what the user sees before touching anything)
   - true bottom (`scrollTo(0, documentElement.scrollHeight)`, looped until
     `scrollTop + innerHeight >= scrollHeight`, and **assert you got there** —
     a test that silently failed to scroll passes vacuously)
   At each: compare the content element's `getBoundingClientRect().bottom`
   against the overlay's `.top`.
5. **Hit-test, don't just paint-test.** `document.elementFromPoint(cx, cy)` at
   the element's lower band. If it returns the overlay instead of your element,
   the overlay is stealing the CLICK — strictly worse than hiding it, and
   invisible to any geometry-only assertion.
6. **Check every width in the design bar** (CLAUDE.md: 360/768/1280 + dark).
   Occlusion is viewport-dependent: item 218's CTA is fully buried at 360×780
   and completely clear at 390×844. Testing one width proves nothing.

## Resolution

- **Cancelled clearance (item 217):** delete the cancelling declaration; do NOT
  restate the pixel value. `.app`'s own `padding-bottom` then applies, so there
  is one source of truth and no drift. Regenerate the MIN sheet
  (`npm run minify`) — `home.html:167` injects `pool-detail-styles.min.css` in
  analytics mode, so a raw-only fix ships dead (item 136's trap).
- **Mid-page element under the overlay (item 218, RESOLVED 2026-08-03):**
  clearance cannot help — the element is not at the end of the document, and
  where it lands in the viewport at rest depends on the height of the content
  above it, which varies per record (the same CTA sat 28.3px under the footer
  on one pool and fully buried on another). **That rules out every layout
  tweak** — hero-card height budget, extra margin, a bigger clearance value.
  What shipped instead — take the overlay out of the fixed layer *on that view
  only*:
  ```css
  .app.pool-detail-view .app-footer { position: static; margin-top: auto; }
  .app.pool-detail-view            { padding-bottom: 0; }
  ```
  `margin-top: auto` is the flex sticky-footer idiom and needs no new layout
  mode if the view is already a flex column (`.app:not(.has-results)` in
  `style.css` makes pool-detail one). `padding-bottom: 0` is NOT a revert of
  the clearance fix above — once the footer is in flow it protects nothing and
  would render 80px of dead background below a footer carrying a top
  box-shadow. **Prove that difference rather than assert it:** keep the
  clearance test's bottom-of-scroll cases byte-identical and still green.
- **When a fix supersedes a mechanism, the old test's POSITIVE CONTROL rots
  first.** 217's control cancelled clearance and asserted occlusion returned;
  after 218 put the footer in flow, that same injection exposes the page to no
  overlay — the control keeps passing while measuring nothing, which is worse
  than a control that cannot go red, because it still looks like a check.
  Rule: **a control must mutate away the protection the product uses TODAY.**
  Rewrite it to reproduce the full pre-fix state (here: `position: fixed`
  restored AND clearance cancelled) and leave every other assertion in that
  file untouched, so the diff shows exactly one hunk to scrutinise.
- **Never inherited the clearance (item 220, RESOLVED 2026-08-04):** the route's
  root is a different class, so there is no canceller and no regression — the
  view never had clearance. Both defect shapes are present at once: content
  occluded at REST *and* at bottom-of-scroll. Because the at-rest half is
  mid-document, the 218 resolution above is the one that applies — clearance
  alone cannot fix it, so the overlay leaves the fixed layer on that view:
  ```css
  .landing-app .app-footer { position: static; margin-top: auto; }
  ```
  **Two things that differ from 218, both worth knowing before you copy it:**
  (a) there is NO companion `padding-bottom: 0` here, and its absence is correct
  rather than an omission — 218 needed one only to cancel the 80px item 217 had
  just restored, whereas a never-inherited route has nothing to cancel. Say so
  in the notes; a reviewer diffing against 218's shape will otherwise read it as
  a missing line. (b) Check whether the route's sheet even HAS a `.min` twin
  before reaching for `npm run minify`: `landing-styles.css` is absent from
  `minify-assets.js`'s `CSS_FILES` and `home.html` injects the RAW sheet for
  landing mode, so the 136/061 minify trap does not apply on this one route.
  Verify per route; do not generalise either way.
- **Inherited but insufficient (item 221, RESOLVED 2026-08-04):** the route
  matches the clearance selector and carries the full 80px, and content is STILL
  occluded at rest because the victim is mid-document (step 3c). Same resolution
  as 218/220 — the footer leaves the fixed layer on that view — but **do not
  copy their declarations verbatim**, because the idiom has a precondition:
  ```css
  .app.has-results .app-footer { position: static; }   /* no margin-top: auto */
  .app.has-results            { padding-bottom: 0; }
  ```
  `margin-top: auto` is a FLEX sticky-footer idiom. 218/220 could use it because
  their views were already flex columns (`.app:not(.has-results)`,
  `.landing-app`); `.app.has-results` is `display: block` (`style.css:865`), so
  the same line would be **inert** there — a declaration that reads as
  protection and fires never. **Decision rule: before copying `margin-top: auto`,
  confirm the view is a flex column; if it is not, either make it one and PROVE
  the switch moves nothing else, or omit the line.** 221 measured the switch and
  it was NOT free: flexing `.app.has-results` moved `.container` at 360×780 by
  +6px, because `.theme-toggle`/`.language-toggle` are in-flow siblings there
  (item 222's own defect) and flex items never margin-collapse. So it shipped
  without the idiom, and the omission is documented rather than silent — the
  short-content consequence (in-flow footer sits after content instead of pinned
  to the viewport bottom) was measured on a 1-pool fixture and is ordinary
  end-of-document behaviour, not the occlusion failure mode. The
  `padding-bottom: 0` companion IS required here (unlike 220, like 218) because
  this route really did inherit the 80px. Use the `padding-bottom` longhand
  rather than the `padding` shorthand — not for any cascade reason, but because
  the shorthand resets all four sides to change one, which is silently wrong the
  moment the selector gains horizontal padding.
  **Do NOT repeat the reason item 221 first gave for this** (it shipped the claim
  and a verifier killed it, twice-propagated, on attempt 3): the shorthand does
  *not* "wipe the `padding-top` overrides later in the cascade." Longhand and
  shorthand are equivalent to the cascade — each longhand property is resolved by
  source order among equal-specificity declarations, so a later `padding-top`
  wins regardless of how an earlier rule set it. Verified in a real render.
  **Meta-rule, the real lesson of 221's two documentation FAILs:** when the honest
  reason for a choice is taste or defensive style, write *that*. An invented
  mechanism reads more authoritative and is the only version a reviewer can
  falsify — and one will.
  **And renumber your own citations last.** A long explanatory comment shifts
  every line below its insertion point (221's block moved five of its own
  `style.css:NNNN` references by 103 lines); write the citations against the
  file's POST-insertion state, and re-check them after any later edit to the
  comment itself.
- **Fixed on one route only:** grep for the same pattern on every OTHER route
  before closing. Item 179 fixed this class on bare `/` and nobody ported it;
  217 then paid for it on pool-detail 20 days later; 218 the day after that; and
  **220 paid for it a third time on bare `/` itself** — the very route 179 filed.
  The port was never done because step 3's "who cancels it" grep comes back
  EMPTY on a never-inherited route (step 3b), so the route reads clean.
  **The check that actually closes this class is step 3b run over every route
  that renders `.app-footer`, not a grep for cancellers.**
  **Swept 2026-08-04 (item 220), result recorded so nobody repeats it:**
  `grep -n "app-footer" *.js *.html | grep className` gives exactly THREE render
  sites — `app.js:2981` (rooted `div.app.pool-detail-view`, `app.js:2955`),
  `app.js:3533` (rooted ``div.app ${…has-results}``, `app.js:3001`) and
  `landing.js:356` (rooted `div.landing-app`, `landing.js:244`). The two app.js
  roots DO match `.app`, so they carry the shared clearance; landing was the
  only never-inherited route, and 220 fixed it. Planner mode renders no fixed
  `.app-footer` at all (`style.css`'s `seo-hub-links` comment). ~~So this class
  is closed as of 2026-08-04~~ — **that conclusion was WRONG, and item 221 (the
  same day) paid for it. See step 3c below: the sweep proved the two app.js
  roots INHERIT the clearance and then read that as "therefore safe". Inheriting
  it is not the same as being protected by it.** The sweep's grep is still the
  right first move — re-run it when a new route is added — but its output only
  tells you which root cause you are NOT looking at.

3c. **A route that DOES inherit the clearance can still be defective — and this
   is the variant the sweep above mis-read as clean** (added 2026-08-04, item
   221, the FOURTH recurrence). Steps 3 and 3b between them cover "clearance was
   cancelled" and "clearance never applied". Both are questions about whether
   the 80px is *present*. Neither asks the question that actually matters:
   **does the clearance protect the victim?** It only ever protects the END of
   the document. Any element that sits inside the fixed band *at scroll 0* is
   mid-document, and no `padding-bottom` value can move it — lengthening the
   document does not move content that is already there. 218 recorded this wall
   on pool-detail; 221 is the same wall on the analytics grid, where
   `.app.has-results` matches `.app { padding-bottom: 80px }` perfectly and a
   `.calculate-yield-btn-new` was still 98.8% covered and click-intercepted at
   1280×780.
   **Decision rule: never conclude "clearance present ⇒ route safe" from CSS
   alone.** The only thing that settles it is step 4's at-rest measurement on a
   real render. Treat the three root causes as a checklist you finish, not a
   ladder you stop climbing: cancelled (3) → never-inherited (3b) → inherited
   but insufficient (3c). The last one has no CSS tell at all — the sheet looks
   correct — so it is invisible to every grep in this playbook and shows up
   ONLY in step 0's lens or a hand measurement.
   **Corollary for the sweep:** enumerate render sites to know where to MEASURE,
   never to decide which sites need measuring. A "closed" verdict is only ever
   as good as the last at-rest render you actually looked at.

## Traps

- **"Scrolled to the bottom" usually hasn't.** `document.body.scrollHeight`
  ≠ `documentElement.scrollHeight`; content settles after mount. Loop the
  scroll, then assert arrival.
- **`scrollIntoViewIfNeeded()` is blind to fixed overlays.** Chromium considers
  an element "in view" if it is within the raw viewport box — even when an
  opaque fixed footer is painting over exactly those pixels. It will refuse to
  scroll and your test will pass while the user sees nothing. Compute the
  target `scrollY` yourself.
- **Computing a clear scroll target hides the at-rest bug.** This is precisely
  how item 218 stayed invisible through item 217's build: the test jumped to a
  position where the CTA was clear and never asked what happens at
  `scrollY = 0`. **Always assert the at-rest state too.**
- **Mid-scroll overlap is NOT the bug.** An opaque fixed footer necessarily
  paints over content scrolling past it, on every view. The defects are
  (a) content occluded at EVERY scroll position (no clearance) and (b) content
  occluded at REST that the user must discover by scrolling.
- **The DOM-only blind spot — HALF CLOSED, know which half.** `audit-app.js`
  renders real pages but every check is a DOM read, so it scored "82 surfaces,
  0 blocking" on the same page and the same day a human found 217 by eye.
  Item **219 leg (a)** closed the *occlusion* half (step 0 above): burial and
  click-interception are now machine-checked daily. Leg **(b)** — a screenshot
  a model actually looks at — is **NOT built**, so the defect classes no
  assertion can express (clipped pills, dead whitespace, misalignment; e.g. the
  `Risk Assessment: Low` pill overflowing its hero column in the human's
  2026-08-03 screenshot) are still invisible to the tick. Do not read a green
  audit as "a human would like this page".

## Provenance

Distilled from item **217** (pool-detail's `padding: 0` cancelling the footer
clearance; human-reported 2026-08-03 with an iPhone screenshot), its verifier's
attempt-1 FAIL which uncovered item **218** (the `garden_cta` north-star CTA
fully behind the footer and click-intercepted at 360×780, pre-existing), and
item **179** (the same class on bare `/`, fixed there and never ported). Process
gap filed as **219**. Full write-up: `specs/217.md`, `specs/217-notes.md`,
LOG.md 2026-08-03 build | 217. Updated 2026-08-03 when **218** shipped its own
fix (footer in flow on pool-detail + the positive-control rot rule):
`specs/218.md`, `specs/218-notes.md`, `specs/218-pr.md`,
`test_cta_at_rest_occlusion.js`, LOG.md 2026-08-03 build | 218. Updated
2026-08-04 when **219 leg (a)** turned this playbook's manual method into a
daily machine lens (step 0 + the amended DOM-blind-spot trap):
`specs/219.md`, `specs/219-notes.md`, `specs/219-pr.md`,
`test_audit_occlusion_lens.js`, LOG.md 2026-08-04 build | 219. Updated
2026-08-04 when **220** fixed the FIRST defect that lens found on a real
surface — the landing route, whose root class never matched the shared
clearance selector at all — adding the never-inherited root cause (step 3b),
its resolution, and the reason the 179 port kept failing:
`specs/220.md`, `specs/220-notes.md`, `specs/220-pr.md`,
`test_landing_footer_occlusion.js`, LOG.md 2026-08-04 build | 220. Updated
2026-08-04 when **221** fixed the analytics grid — the FOURTH recurrence, and
the one that falsified this playbook's own "class closed" verdict written hours
earlier: the grid root inherits the clearance correctly and was defective
anyway. Added the inherited-but-insufficient root cause (step 3c), its
resolution and the `margin-top: auto` precondition, and struck the sweep's
false-clean conclusion: `specs/221.md`, `specs/221-notes.md`, `specs/221-pr.md`,
`test_grid_footer_occlusion.js`, LOG.md 2026-08-04 build | 221.
