# Item 273 — build notes

## Risk tier
Spec guessed LOW (CSS-only, ≤150 lines) unless `app.js` header *structure*
changes, in which case HIGH (≤200 lines). This PR's `app.js` change is a
one-line wrapper (bare text -> `<span className="app-brand-wordmark">`)
plus an `aria-label`, not a structural change to the header row's layout or
behavior — but to be safe this file targets the HIGH cap (200 lines) rather
than LOW's 60, since the required content (verbatim red output, the
desktop-stability diff, the instrument-gap reasoning) doesn't fit in 60
lines without cutting evidence the spec explicitly asks to keep.

## Root cause (measured, not guessed)
At exactly 320–359px the row's non-negotiable floors — `.app-logo` (147px;
its wordmark was a bare text node, no `min-width: 0`) + `.app-header-controls`
(88px; both icon buttons carry `min-width: var(--ui-control-h)`, the shared
icon-only-button rule) + this row's own padding/gaps — leave
`.app-search-container` only ~29px at 320px (measured). `.app-search-input`'s
own horizontal padding (`var(--space-20)` each side = 40px) is a floor
`min-width: 0` cannot remove (shrinking only takes the content box to 0,
padding stays), so the input's real layout box is *wider* than its
allotment (measured: input box 40px, right edge at x=232, while
`.app-header-controls` starts at x=212 — a real 20px geometric overlap, not
a rendering artifact). Nothing between the input and `.app-header-controls`
clips that overflow (`.app-search-bar`'s `overflow: hidden`, added by item
225, only stops a child from bleeding past *its own* box — that box isn't
what's overflowing here), so the input's box paints on top of the controls:
the human's exact report. Confirmed clean at 360px+ by direct measurement
(`.app-search-container` gets 69px+ there, comfortably above every floor).

## Fix
1. `app.js` (~3096-3113 in `renderHeaderRow`): wrapped the bare
   `'DeFi Garden'` text child in
   `React.createElement('span', {className: 'app-brand-wordmark'}, ...)` and
   added `aria-label: 'DeFi Garden'` to the `.app-logo` div, so hiding the
   wordmark doesn't remove the button's accessible name (the icon is already
   `aria-hidden`). Brand name stays untranslated in KO too — matches every
   existing KO string in translations.js, which never translates "DeFi
   Garden" either — so no translations.js change was needed.
2. `style.css` (new block after the existing `@media (max-width: 480px)`
   search-button rule, ~line 1751): one new `@media (max-width: 359px)`
   block (chosen tight, not 480/640, because 360px measured clean already)
   that (a) hides `.app-brand-wordmark` — recovers ~120px, by far the
   biggest lever — and (b) shrinks `.app-search-input`/`.app-search-clear`
   horizontal padding, cutting their combined floor from ~66px to ~30px so
   a query plus the ✕ clear button both fit inside what (a) frees.
3. Ran `npm install` (repo had no `node_modules/`, so `compile-app.js`/
   `minify-assets.js` couldn't run until dependencies were installed) then
   `node compile-app.js && node minify-assets.js` — `home.html`'s analytics
   mode boots `app.compiled.min.js`, not raw `app.js`/`style.css` (item
   136's minify trap, confirmed by grepping `home.html`'s script-injection
   block). `git status` afterward showed exactly the 5 expected files
   touched: `app.js`, `style.css`, `app.compiled.js`, `app.compiled.min.js`,
   `style.min.css` — no hand-edits to generated output.

## Deviations from spec
None material. Scope stayed CSS + one small, accessibility-preserving JS
wrapper; no new components, no token outside `--ui-*`/`--space-*`. The one
thing not anticipated going in: fixing this required touching `.app-logo`
(shrinking the wordmark), which isn't literally "the header controls" named
in the spec's hypothesis — but the math is unambiguous (logo + controls'
combined hard floors already exceed the 320px viewport before the search
box gets anything), so no CSS-only fix confined to `.app-search-*`/
`.app-header-controls` could have worked; recorded here rather than treated
as scope creep.

## Why audit-app.js missed this (required sentence)
`audit-app.js`'s occlusion rotation's narrowest width is 360px
(`'360px': { width: 360 }`, audit-app.js:3660) — `grep -n '"320"'
audit-app.js` returns zero matches anywhere in the file, so the lens has
never once rendered at 320px. The defect only exists in the 320–359px band
(measured: clean at 360px), so the lens never rendered at a width where it
could see it. Not an interactive-vs-interactive exemption, not a
state-dependent miss — a pure width-rotation gap.

Extending the lens to add a 320px tier is not the ≤30-line change the spec
allows for in-PR: `LENS_SHAPE`/`lensAssignments` (audit-app.js:3659-3677) is
a *sampled* rotation — one lens per pool per tick, budgeted to avoid
tripling render cost — shared across every `kind` branch, and a real fix
needs a new width tier reasoned about across all of them plus a decision on
sample-budget impact. That's a scoped follow-up, not a same-PR add. Naming
the gap per the spec's explicit permission to skip when not cheap.

## Non-vacuity proof (red -> green, verbatim)
Reverted with `git stash push -- app.js style.css app.compiled.js
app.compiled.min.js style.min.css` (not `git checkout --`, which would have
silently discarded the uncommitted fix — the exact trap this playbook's own
"Traps" section warns about; `git stash` is reversible and was popped back
after). md5sums of all 5 files were taken before stashing and compared
after `git stash pop` — byte-identical, confirmed twice (once for the
overlap re-run, once for the desktop-geometry re-run below).

Single-combo check (320px, dark, "STETH" — the human's exact repro) against
the stashed (pre-fix) tree:
```
[prefix] {"inputRect":{"x":192.03125,"y":4.5,"width":40,"height":43,...,"right":232.03125,...},
  "overlaps":[{"cls":"app-control-btn language-toggle","overlap":true},
              {"cls":"app-control-btn theme-toggle","overlap":false}],
  "anyOverlap":true}
[prefix] anyOverlap=true
```

Full 40-combo suite against the same pre-fix tree:
```
FAIL [overlap] w=320 theme=light lang=en q=STETH: [{"cls":"app-control-btn language-toggle","overlap":true},{"cls":"app-control-btn theme-toggle","overlap":false}] inputRect= {"x":192.03125,"y":4.5,"width":40,"height":43,"top":4.5,"right":232.03125,"bottom":47.5,"left":192.03125}
FAIL [overlap] w=320 theme=light lang=en q=AAAAAAAAAAAAAAAAAAAA: [{"cls":"app-control-btn language-toggle","overlap":true},{"cls":"app-control-btn theme-toggle","overlap":false}] inputRect= {"x":192.03125,"y":4.5,"width":40,"height":43,...}
FAIL [overlap] w=320 theme=light lang=ko q=STETH: [...same overlap...]
FAIL [overlap] w=320 theme=light lang=ko q=AAAAAAAAAAAAAAAAAAAA: [...same overlap...]
FAIL [overlap] w=320 theme=dark lang=en q=STETH: [...same overlap...]
FAIL [overlap] w=320 theme=dark lang=en q=AAAAAAAAAAAAAAAAAAAA: [...same overlap...]
FAIL [overlap] w=320 theme=dark lang=ko q=STETH: [...same overlap...]
FAIL [overlap] w=320 theme=dark lang=ko q=AAAAAAAAAAAAAAAAAAAA: [...same overlap...]
32/40 passed
```
Exactly the 8 failures are the 320px x {light,dark} x {en,ko} x {5-char,
20-char query} combos — every other width/theme/lang/query combo already
passed even pre-fix, isolating the defect to the 320px band precisely as
the root-cause analysis predicted. `git stash pop` restored the fix
byte-identically (md5 diff empty); full 40-combo suite re-run: 40/40 green.

## Desktop stability proof (768/1280, no regression)
Captured `.app-header-content`/`.app-logo`/`.app-search-container`/
`.app-search-input`/`.app-header-controls`/`.language-toggle`/
`.theme-toggle` `getBoundingClientRect()` at 768 and 1280 both pre-fix
(stashed) and post-fix (restored). Diffed the two JSON captures: every rect
at both widths is byte-identical; the only difference is the new
`.app-brand-wordmark` node's own `display` value itself
(`"NO-WORDMARK-EL"` pre-fix, since the span didn't exist yet, vs `"block"`
post-fix) — expected, not a regression, and confirms the wordmark stays
visible (not hidden) at 768/1280 as intended, since `max-width: 359px`
never matches there.

## Verification
Playwright against a real render (`python3 -m http.server 8000`,
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), 5 widths (320/360/
480/768/1280) x 2 themes x 2 langs x 2 query lengths ("STETH", a 20-char
string) = 40 combos: bounding-box disjointness (0px tolerance, controls
enumerated live from `.app-header-controls > *` at test time, not
hardcoded), plus `elementFromPoint` at the input's and each control's
visual center resolving to itself (the 219 lens technique), plus the typed
query round-tripping into `input.value` unmangled. 40/40 passed post-fix.
(External network calls — the DefiLlama pools fetch, fonts, analytics — were
routed to `abort()` in the harness only, to keep the sandboxed proxy from
adding minutes of retry latency per page load; this has no bearing on
header/search DOM geometry, which never depends on pool data.)

## Tests run
`node test_planner.js && node test_protocol_parsing.js &&
node test_qualifier_fix.js` — all passed (208 + 9 + 9 assertions), nothing
broken.
