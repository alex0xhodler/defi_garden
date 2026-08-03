# 217 notes: pool-detail cancels the fixed footer's clearance

## What changed

### `pool-detail-styles.css:1065-1072`
Deleted the `padding: 0` declaration from `.app.pool-detail-view` (it existed
solely to cancel `.app`'s `padding-bottom: 80px` footer clearance,
style.css:849-853) and left a comment explaining why the clearance must
survive on this view, referencing backlog 217 and `style.css:852`. The rule
became empty and was removed entirely rather than left as `.app.pool-detail-view
{}` (spec: "and the now-empty rule, if it becomes empty"). The sibling rule
`.app.pool-detail-view .container { max-width: none; padding: 0; }` directly
below is byte-unchanged.

### `pool-detail-styles.min.css` (regenerated)
`npm run minify` was re-run. This also touched `app.compiled.min.js`,
`PoolDetail.compiled.min.js`, `planner.min.js`, `translations.min.js`,
`style.min.css`, `planner-styles.min.css` (the script processes the whole
`JS_FILES`/`CSS_FILES` lists), but `git status` after the run shows **only
`pool-detail-styles.min.css` changed** — every other regenerated output came
back byte-identical to what was already committed, since no other source file
(`app.compiled.js`, `PoolDetail.compiled.js`, `planner.js`, `translations.js`,
`style.css`, `planner-styles.css`) was touched by this item. Confirmed via
`grep -o '.app.pool-detail-view[^}]*}' pool-detail-styles.min.css` → only
`.app.pool-detail-view .container{max-width:none;padding:0}` remains; the
cancelling `.app.pool-detail-view{padding:0}` rule is gone from the shipped
sheet.

### `test_footer_occlusion.js` (new)
Rendered Playwright acceptance test, `PORT = 8872` (8871 was the prior max).
Copies the house harness pattern verbatim from `test_earnings_dedup.js`: local
http server on ROOT, fixture-routed unpkg React/ReactDOM/Babel from
`node_modules`, `icons.llamao.fi` aborted, `**/data/pools-snapshot*` 404'd to
force the live path, `https://yields.llama.fi/pools` fulfilled with the same
lido/STETH fixture pool (`747c1d2a-c668-4682-b9f9-296708a3dd90`), `CHROMIUM_EXECUTABLE`
from `/opt/pw-browsers/chromium`, the same `IGNORABLE` console-error regex, the
`test()` helper, `process.exitCode = 1` on failure, and the "assert the pool id
exists in `data/pools-snapshot.json`" preflight.

### `package.json`
Appended `&& node test_footer_occlusion.js` to `test:serial`, placed directly
after `test_earnings_dedup.js` (the natural neighbour — both are rendered
pool-detail acceptance tests).

## Deviations from spec / conservative choices

- **Criterion (5)'s mechanism changed mid-build, deliberately.** The spec says
  "the `garden_cta` anchor ... can be scrolled to a position where its
  bounding box does not intersect the footer's". My first draft used Playwright's
  `locator.scrollIntoViewIfNeeded()`. That FAILED even with the fix applied:
  the CTA lives near the TOP of the page (inside the hero action card, not at
  the bottom), and at initial scroll (`scrollY=0`) its native layout position
  (`documentY` 703-750 at 360px) already falls within the browser's raw
  viewport bounds (0-780), so Chromium's own "is this in view" check considers
  it already visible and does not scroll at all — even though the OPAQUE fixed
  footer visually paints over viewport pixels 722-780 the whole time. This is
  not a bug in the fix; it is `scrollIntoViewIfNeeded()` being unaware of a
  fixed overlay, which is exactly the class of geometry mistake criterion (5)
  exists to catch. I replaced it with an explicit scroll-target computation
  (`page.evaluate` reads the CTA's document-relative bottom edge and the
  footer's viewport-relative top edge, computes the minimal `scrollY` that
  clears the CTA above the footer with a 4px margin, clamps it to the
  document's real `maxScrollY`, then scrolls there) and re-measures. This is a
  stronger, not weaker, form of the criterion: it doesn't rely on a browser
  API's opinion of "in view," it directly proves a clear scroll position
  exists and lands on it.
- **Test count in the trailer line**: the file has 8 `test()` calls (not 9 —
  an earlier draft's comment miscounted before the CTA-mechanism rewrite
  collapsed two sub-steps into one). Fixed to `8/8` before the final run.
- Everything else follows the spec literally: no new CSS value/token, no
  touching `.app-footer`/`.seo-hub-links`/JS, `.container` rule untouched,
  8872 port allocation, house harness copied verbatim.

## Measured before/after (this run, real Playwright render)

All figures are `.pool-detail-container`'s bounding-box bottom vs.
`.app-footer`'s bounding-box top, at the TRUE bottom of scroll (verified
reached, not assumed) — negative-looking margin = clearance in px
(`footerTop - containerBottom`).

| Viewport | Before fix (occluded) | After fix (clear) | Clearance after fix |
|---|---|---|---|
| 360px | container.bottom 740.5 > footer.top 722 → **occluded by ~18.5px** | container.bottom 660.5, footer.top 722 | 61.5px |
| 768px | container.bottom 855.4 > footer.top 842 → **occluded by ~13.4px** | container.bottom 775.4, footer.top 842 | 66.6px |
| 1280px | container.bottom 854.5 > footer.top 831 → **occluded by ~23.5px** | container.bottom 774.5, footer.top 831 | 56.5px |
| 360px dark | container.bottom 740.5 > footer.top 722 → **occluded by ~18.5px** | container.bottom 660.5, footer.top 722 | 61.5px |

(These numbers come from this test's own fixture/viewport setup, not the
spec's Evidence-section numbers, which were measured on the human's real
iPhone 1170×2532 render — the shape of the defect and the fix's effect is
identical; the exact pixel values differ because the fixture pool's rendered
content height differs from the human's report.)

## Criterion (5) finding: was the `garden_cta` CTA occluded?

**CORRECTED 2026-08-03 after the verifier falsified the original claim. The
first version of this section stated the CTA "was never occluded to begin with,
before or after this fix" and "was not part of this defect's blast radius."
That was asserted, not measured — the test's methodology computes a clear
scroll target and jumps to it, so it never examines the AT-REST state. The
verifier checked the at-rest state and found the opposite. The corrected
finding follows.**

**Criterion (5) as literally worded is MET:** a scroll position clearing the
CTA exists and the test lands on it (`targetScrollY≈32.3`, well under
`maxScrollY≈1487`), verified in the operator's own re-run. The CSS fix and the
passing assertion are sound and unchanged.

**But the CTA IS occluded at rest on small viewports — a separate, pre-existing
defect this item does not fix.** Operator re-measurement (real Chromium, dark,
`deviceScaleFactor: 2`, the human's own pool `8276be38…` morpho-blue/
SIRLOINUSDC/Base, `scrollY = 0`, i.e. first paint before any user action):

| Viewport | CTA rect | Footer rect | Result at rest |
|---|---|---|---|
| **360×780** | top 722.7 / bottom 769.7 (h 47) | top 722 / bottom 780 | **ENTIRE 47px button behind the footer** (+47.7px) |
| 390×844 | top 701.5 / bottom 748.5 | top 786 / bottom 844 | clear by 37.5px |
| 414×896 | top 664.4 / bottom 711.4 | top 838 / bottom 896 | clear by 126.6px |

At 360×780 this is not merely visual: `document.elementFromPoint()` at the
CTA's lower band returns **`P.app-footer-hub-links`**, not the anchor — the
fixed footer (`z-index: 100`) intercepts the click. **The north-star metric's
own emitter is invisible and unclickable at first paint at the narrowest
viewport in CLAUDE.md's design bar.** A screenshot at that viewport
(`cta-rest-360x780.png`, operator scratch) shows the hero card ending in the
rate-history note with the footer painted where the button should be.

Confirmed **pre-existing and unrelated to this item**: the verifier measured
identical CTA geometry with the 217 fix mutated back out, so 217 neither
introduced nor fixed it. It is the same ROOT CLASS as 217 (an opaque fixed
overlay covering content) at a different scroll position, which is why it
surfaced here.

**Filed as its own backlog row rather than absorbed into this item** — fixing
it means changing hero-card layout or footer behaviour on the north-star
surface, which is materially more than "restore the cancelled clearance" and
deserves its own spec, its own risk call and its own rendered acceptance.
Scope discipline (build.md: "smallest change that satisfies the acceptance
criteria; no scope creep") applies even when the neighbouring bug is worse
than the one in hand.

## Residual / follow-up candidates

- **`audit-app.js` still has no occlusion signal** — spec 217 explicitly
  scoped a new audit check as OUT of scope ("the row asks for rendered
  ACCEPTANCE here, not a new daily scanner check"). The daily audit still
  cannot catch a regression of this exact class (e.g. a future page re-adding
  a `padding: 0` canceller on `.app`) until a human report or this rendered
  test catches it. Filing this again here per the spec's instruction, as the
  spec did not file it in BACKLOG.md/LOG.md itself (operator-owned files, not
  touched by this item).
- **Class precedent note**: item 179 fixed the identical occlusion class on
  bare `/` only; this item ports the fix to pool-detail. No other view was
  audited for the same `padding: 0`-cancels-`.app`-clearance pattern in this
  pass — a grep sweep of every `.app { padding` / `.app.<view> { padding`
  declaration across the whole design system, done once, would close this
  class out permanently rather than fixing it view-by-view as reports arrive.

## Full test run — real output

### `node test_footer_occlusion.js` (NEW)
```
  ✓ 360px: pool-detail renders with no page errors
  ✓ (1) 360px: scrolled to true bottom, .pool-detail-container is NOT occluded by .app-footer
  ✓ (2) 768px: scrolled to true bottom, .pool-detail-container is NOT occluded by .app-footer
  ✓ (3) 1280px: scrolled to true bottom, .pool-detail-container is NOT occluded by .app-footer
  ✓ (5) 360px: garden_cta CTA can be scrolled clear of the footer
  ✓ no unexpected page/console errors (real page)
  ✓ (4) 360px dark mode: scrolled to true bottom, .pool-detail-container is NOT occluded by .app-footer
  ✓ (6) positive control: with the fix mutated away in-page, occlusion IS reported (proves the check can fail)
test_footer_occlusion.js: 8/8 tests passed
EXIT: 0
```

### Proof-it-fails run (CSS fix reverted via `git stash push -- pool-detail-styles.css pool-detail-styles.min.css`)
```
  ✓ 360px: pool-detail renders with no page errors
  ✗ (1) 360px: content occluded — .pool-detail-container.bottom 740.515625 > .app-footer.top 722
  ✗ (2) 768px: content occluded — .pool-detail-container.bottom 855.4375 > .app-footer.top 842
  ✗ (3) 1280px: content occluded — .pool-detail-container.bottom 854.546875 > .app-footer.top 831
  ✓ (5) 360px: garden_cta CTA can be scrolled clear of the footer   [unaffected — see finding above]
  ✓ no unexpected page/console errors (real page)
  ✗ (4) 360px dark mode: content occluded — .pool-detail-container.bottom 740.515625 > .app-footer.top 722
  ✓ (6) positive control: still passes (it injects its own mutation independently of the source fix)
test_footer_occlusion.js: 4/8 tests passed
EXIT: 1
```
Fix restored via `git stash pop`; re-run confirmed green (8/8, EXIT 0) — see above.

### Neighbours (this run)
```
$ node test_mobile_cta_clip.js       → 4/4 tests passed, EXIT 0
$ node test_earnings_dedup.js        → 8/8 tests passed, EXIT 0
$ node test_northstar_cta_fires.js   → 7/7 tests passed, EXIT 0
$ node test_minified_assets.js       → 9/9 assertions passed, EXIT 0
$ node test_test_registry.js         → 5/5 assertions passed, EXIT 0
$ node test_css_minified_render.js   → 2/2 assertions passed, EXIT 0
```
Zero new reds. `test_minified_assets.js`'s pass confirms
`pool-detail-styles.min.css` is byte-identical to a fresh minify of the edited
`pool-detail-styles.css` — the min asset is not stale.

## Operator visual check — actually looking at the pixels (added 2026-08-03)

Prompted by a direct human challenge during this run ("do you do any actual UX
audit... how can these changes pass multiple audits without any agents capturing
what is the user seeing in the browser"), the operator rendered the **human's own
reported pool** — `8276be38-acc6-4005-ab0d-62680f49f4df` (morpho-blue /
SIRLOINUSDC / Base), present in the committed snapshot — at **390×844 dark,
deviceScaleFactor 2**, scrolled to the true bottom, BEFORE and AFTER the fix, and
**inspected the resulting PNGs as images** rather than only asserting on numbers:

| Render | container.bottom | footer.top | overlap |
|---|---|---|---|
| BEFORE (clearance cancelled) | 802 | 786 | **+16px — occluded** |
| AFTER (clearance restored) | 722 | 786 | **−64px — clear** |

Visual reading of the two captures: BEFORE, the Pool Information card's lower
edge runs into the opaque footer band with no gap. AFTER, the card terminates
with visible breathing room above the footer and the full card border is
readable. This is the first time in this item's lifecycle that an agent looked
at a rendered image rather than a DOM rectangle.

**The honest process gap this exposes** (recorded here because it is bigger than
this item): the loop's two verification mechanisms — rendered Playwright
assertions and `audit-app.js` — both read the DOM. Neither renders a screenshot
and judges it, and `audit-app.js` has no occlusion signal at all. A defect that
is geometrically expressible (this one) is catchable only if someone already
suspected it; a purely visual defect (misalignment, clipped text, contrast,
dead whitespace) is catchable by nobody in this loop today. That is precisely
why 217 was found by a human on a phone and not by 82 daily audited surfaces,
and it is why NORTH_STAR.md's 2026-07-10 entry appends "needs human visual
spot-check" to render-path merges — the trade was recorded, not solved. See
"Residual / follow-up candidates" below.

## Not verified / could not prove

- **Full `test:serial` (~140 files)** was not run in one shot within the
  5-minute-per-command timebox; only the 6 spec-named neighbours plus the new
  test were run, per the task's explicit instruction to run those specific
  neighbours and report exact pass/fail. No other file in the chain touches
  `pool-detail-styles.css`, `pool-detail-styles.min.css`, or `package.json`'s
  `test:serial` string outside the single line edited, so the blast radius is
  believed fully covered by what was run.
- **Real device / visual screenshot spot-check** on an actual iPhone (the
  human report's device class) — not available in this sandbox; the rendered
  Playwright assertions at 360/768/1280/360-dark are the acceptance mechanism
  this spec requires in place of that.
