# fixed-overlay-occlusion — playbook

**When:** a user reports content "cut off", "sliced mid-sentence", or a bar
"on top of" the page — OR you are auditing any view that renders
`.app-footer` / any `position: fixed` / `position: sticky` element. Also when a
CTA "doesn't work" or "isn't there" on a phone but is fine on desktop.

**Answer in one line:** it is almost never the overlay that is wrong — it is a
view-specific rule that CANCELLED the shared clearance the overlay depends on,
and the giveaway is that the defect exists on exactly one route.

## Steps

1. **Find the overlay and confirm it is opaque.** `grep -n "position: fixed" style.css`
   → `.app-footer` (`style.css:2513-2524`): `fixed; bottom: 0; z-index: 100;`
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
- **Mid-page element under the overlay (item 218):** clearance cannot help — the
  element is not at the end of the document. This is a layout or
  overlay-behaviour change (hero-card height budget, sticky-at-end footer on
  short viewports, hide-on-scroll) and deserves its own spec and risk call.
- **Fixed on one route only:** grep for the same pattern on every OTHER route
  before closing. Item 179 fixed this class on bare `/` and nobody ported it;
  217 then paid for it on pool-detail 20 days later.

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
- **The DOM-only blind spot.** `audit-app.js` renders real pages but every
  check is a DOM read — `grep screenshot audit-app.js` = 0 hits — so it scored
  "82 surfaces, 0 blocking" on the same page and the same day a human found
  217 by eye. Geometry assertions only catch what someone already suspected;
  see backlog 219.

## Provenance

Distilled from item **217** (pool-detail's `padding: 0` cancelling the footer
clearance; human-reported 2026-08-03 with an iPhone screenshot), its verifier's
attempt-1 FAIL which uncovered item **218** (the `garden_cta` north-star CTA
fully behind the footer and click-intercepted at 360×780, pre-existing), and
item **179** (the same class on bare `/`, fixed there and never ported). Process
gap filed as **219**. Full write-up: `specs/217.md`, `specs/217-notes.md`,
LOG.md 2026-08-03 build | 217.
