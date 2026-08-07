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
   → the **`.app-footer` block** (find it with `grep -n '^\.app-footer {' style.css`,
   never by a remembered line number — see the trap below): `fixed; bottom: 0;
   z-index: 100;` with `background: var(--color-background)`. Opaque + fixed +
   high z-index = it can hide content AND intercept clicks.
   **Citation rot, fixed 2026-08-04 (item 230).** This step used to read
   `style.css:2513-2524`; the block had drifted to `:2577` and the playbook was
   wrong by 64 lines with nobody noticing. Item 221 was PARKED for the same
   failure in the opposite direction — its in-file comment cited positions
   BELOW itself, so editing the comment invalidated its own citations, three
   attempts running. **Rule: cite SELECTORS for anything inside a file that
   this class's fixes routinely edit; keep line numbers only for other files.**
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
3c. **If the clearance IS inherited and IS correct, check that the view is in
   the LAYOUT STATE its content implies** (added 2026-08-04, item 230). Steps 3
   and 3b cover "clearance taken away" and "clearance never applied". There is
   a fourth root cause: the clearance applies correctly and is simply the wrong
   tool, because the root's **class predicate is narrower than the predicate
   that renders the content**. `app.js:3001` sets `has-results` from
   `(selectedToken || (chainMode && selectedChain))`; `app.js:3299` renders the
   whole `.results-section` from the WIDER `(… || deadPoolResolved)`. Two
   copies of one idea, disagreeing on one term — so the dead-`?pool=` view
   renders results markup while rooting at `.app` *without* `.has-results`,
   lands in the centred-homepage flex layout, and is missed by every fix that
   keys on a results class.
   **Decision rule:** whenever a root class and a render branch both encode
   "are we showing X", diff the two predicates before reading any CSS. If they
   disagree, the states in the gap are the defect surface — and prefer a
   selector derived from the RENDER (`:has(.results-section)`) over a second
   hand-maintained class, which is just a third copy of the same predicate
   (item 212's mirror lesson).
   **Cheap detector:** `grep -n "className: \`app " app.js` next to
   `grep -n "results-section" app.js` and compare the two conditions by eye —
   it is a 30-second check that would have caught this before any browser ran.
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
  is closed as of 2026-08-04~~ — **RETRACTED THE SAME DAY, twice over: item 221
  found the `.app.has-results` grid occluded (a `calculate-yield-btn-new` 98.8%
  covered at 1280×780) and item 230 found the dead-`?pool=` state occluded at
  every design width. The sweep was sound and its conclusion was still wrong,
  because it asked the wrong question.** It enumerated RENDER SITES (3) and
  checked each root against the clearance SELECTOR — and both `app.js` roots
  passed, because they genuinely do match `.app` and genuinely do inherit the
  80px. What it never asked is the question step 4 asks: **does that clearance
  actually protect this view's content, at rest?** Clearance only ever protects
  the END of the document, so "the root matches `.app`" is not a proof of
  anything for mid-document content. **The population is not render sites, it is
  render sites × `.app` STATES** — `.app.has-results`, `.app.pool-detail-view`,
  `.app` bare with a `.results-section` (dead-pool), `.app` bare without one
  (search-home) — and the state, not the site, is what decides the layout the
  footer lands in. Enumerate states and MEASURE each; never close this class
  from a selector match again.
- **Clearance correct, layout state wrong (item 230, RESOLVED 2026-08-04):** the
  view inherits the 80px properly and is still occluded mid-document, because
  its root class predicate is narrower than its render predicate (step 3c). The
  218 resolution applies again, but scoped by what the view RENDERS rather than
  by a class somebody has to remember to set:
  ```css
  .app:not(.has-results):has(.results-section) .app-footer { position: static; }
  .app:not(.has-results):has(.results-section) { padding-bottom: 0; }
  ```
  **Three things worth knowing before you copy it:** (a) `:has()` is the point —
  it derives the guard from the render, so the next state that shows results
  without setting `has-results` is covered with no code change; `style.css`
  already shipped `:has()` elsewhere and `minify-assets.js` preserves it.
  (b) `margin-top: auto` — mandatory in 218/220 — is **wrong here**, and this is
  the first route where the sticky-footer idiom is live yet still loses: the
  state is a `justify-content: center` flex column, so an auto top margin eats
  all the free space and top-aligns the empty-state message by **300px** on a
  short-content page, against **6px** for `position: static` alone. Measure both
  on a short-content fixture (all alternatives below the TVL floor → empty grid)
  before choosing; the long-content case cannot tell them apart, since free
  space is zero there and the two variants render identically.
  (c) In flow the footer becomes a **centred ~356px block, not a full-width
  bar** — expected, not a regression: pool-detail has shipped exactly
  `{x:462, w:356, h:69}` at 1280 since 218. Diff against that surface, not
  against the fixed-bar look, or you will file your own fix as a bug.

## Traps

- **Probe this family IN CLASS, or your non-vacuity proof proves nothing**
  (item 225, 2026-08-04). Step 0 above already names two lens blind spots
  (≥80%-viewport overlays; top-anchored overlays at bottom-of-scroll). A probe
  that lands in either one produces a green that is *documented behaviour*, so
  it can neither prove nor disprove the gate. 225's first probe —
  `.app-footer{top:0;height:100vh}` — was both at once, and the "four gates are
  blind!" finding drafted from it was retracted before filing.
  **The valid probe, and what it showed:** `.app-footer { height: 340px }`
  (bottom-anchored, opaque, **44%** of the 780px viewport — outside both blind
  spots, same geometry as this whole class). An independent measurement — own
  Playwright script, `?pool=` at 1280×780, scrolled to bottom, no repo gate
  involved — found a real P0-shaped victim: interactive `<a class="planner-entry">`
  **82% covered**, `elementFromPoint` at its lower band returning `.app-footer`
  (click stolen). Under that exact break, `test_audit_app.js`,
  `test_audit_occlusion_lens.js`, `test_footer_occlusion.js` and
  `test_cta_at_rest_occlusion.js` **all stayed green**; restore was
  md5-verified and everything stayed green.
  **Open question for item 231 (do NOT state it more strongly than this):**
  either the lens misses an in-class overlay, or the audit's own fixture render
  never contains that victim — a coverage gap, not a detection gap. 225 did not
  distinguish them. Until it is settled, treat a green from this family as
  evidence about the surfaces+geometry it has actually been shown to catch, and
  run your own probe in the shape of the defect you are chasing.
- **`git checkout -- <file>` is the WRONG restore in a non-vacuity cycle** (item
  230). Every fix in this class mutates the shipped `style.min.css` to prove the
  new gate can go red — but at that moment the fix itself is still uncommitted,
  so `git checkout` restores the PRE-FIX file and silently throws the fix away.
  The subsequent "green" then measures a different tree than the one you are
  shipping. Take a `cp` backup right after the pre-mutation `md5sum`, restore
  from that, and `md5sum` both.
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

- **Hiding an element can DELETE the clearance nobody knew it was providing.**
  The most expensive trap on this list, and the one that turned item 222's
  attempt 1 into a verifier FAIL. On the analytics grid, `.app.has-results`'s
  mobile clearance was only `padding-top: var(--space-20)` (20px) against a
  120-127px fixed header — arithmetic that should have buried the page's own
  `.results-title`. It didn't, because two unrelated, *broken* in-flow buttons
  (the standalone `.theme-toggle`/`.language-toggle`, themselves the defect
  being fixed) sat above the content and contributed ~92px of margin. Hiding
  them was correct AND it dropped `.container` from `y:112` to `y:20`, putting
  the heading under the header at 360/480/640px. **Rule: before you
  `display:none` anything that sits between a fixed overlay and the content,
  measure the content's position before and after — on a real render, against a
  true `git checkout <base> -- <sheet>` baseline, not against your memory of it.
  If the declared clearance alone doesn't explain why the content is clear
  today, something undeclared is holding it up and you are about to remove it.**
  Corollary for reviewers: an item's own acceptance criteria will not catch
  this — 222's attempt 1 passed 17/17 of its own rendered assertions while
  introducing the regression. Ask separately what ELSE moved.
- **A fixed overlay can occlude by CLIPPING, not just by covering.** The usual
  signature is `elementFromPoint` returning the overlay. The other one is
  `elementFromPoint` returning **`null`** while `documentElement.scrollWidth ===
  innerWidth`: the victim's centre is outside the viewport and the row it lives
  in cannot scroll, so it is unreachable rather than buried. Item 222's headline
  P0 was this variant — a flex row (`.google-header-content`) with no `@media`
  override and no `min-width: 0` on its `flex: 1` children, so it could not
  shrink below its input's intrinsic width and pushed its own controls past the
  edge at ≤640px. A lens that only looks for "hit resolves to the overlay"
  scores this page clean. Check for `null` hits too.

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
2026-08-04 when **221** fixed the P0 that lens found on the analytics grid —
four theme/language controls rendering and none pressable at 360/480px — adding
the two traps above: the clipped-not-covered (`elementFromPoint → null`)
variant, and the accidental-clearance trap its own attempt 1 fell into:
`specs/222.md` (see its attempt-2 ADDENDUM), `specs/222-notes.md`,
`specs/222-pr.md`, `test_mobile_controls_reachable.js`,
LOG.md 2026-08-04 build | 222. (That paragraph's item numbers are as filed —
the control-pressability work shipped as **222**; **221** is the separate
grid-footer item, PARKED at its attempt budget with PR #386 open.) Updated
2026-08-04 by **230**, the sixth member and the one that retracted this
playbook's own "class closed" claim: the dead-`?pool=` empty state inherits the
clearance correctly and is occluded anyway, because the root's class predicate
(`app.js:3001`) is narrower than its render predicate (`app.js:3299`). Added
the layout-state root cause (step 3c), its `:has()`-scoped resolution, the
`margin-top: auto` disqualification with numbers, the retraction of the
render-site-enumeration sweep in favour of enumerating `.app` STATES, the
`git checkout` non-vacuity trap, and the citation-rot rule (this playbook's own
`.app-footer` line reference had been wrong by 64 lines; item 221 was parked
over the same rot in `style.css`): `specs/230.md`, `specs/230-notes.md`,
`specs/230-pr.md`, `test_dead_pool.js`, LOG.md 2026-08-04 build | 230.
 Updated
2026-08-04 by **225** (the design reset), which did not fix a member of this
class but measured its GATES: two structurally different deliberate breaks —
an in-class bottom-anchored 340px opaque footer (44% of viewport) with an
independently measured 82%-covered, click-stolen victim left four gates green,
adding the "probe this family IN CLASS" trap above — including the retraction
of a stronger claim drafted from an out-of-class probe — with the exact probe
CSS, results and md5-verified restore:
`specs/225-notes.md` (§Non-vacuity proof), `specs/225-pr.md`, LOG.md
2026-08-04 build | 225.
