# 273 — build notes

## Mechanism (measured on the rendered DOM, not guessed)
The spec's hypothesis (`.app-header-content` not reserving space) is WRONG — 222 already fixed that
row; measured `?token=STETH` at 320/360/480/768/1280 it is disjoint and pressable. The defect is on
the OTHER analytics surface: `.app.pool-detail-view` (`?pool=`, given the identical sticky bar by
spec 247, pre-filled with the query — hence "STETH") is **not** `.has-results`. The mobile
"initial homepage state only" overrides `.app:not(.has-results) .theme-toggle` /
`… .language-toggle` (style.css, `<=640px` and `<=480px` tiers) are **descendant** selectors at
specificity (0,3,0) — `:not(.has-results)` counts as a class — which beats item 222's reset
`.app-header-controls .theme-toggle, …` at (0,2,0), so on `?pool=` they reached the HEADER's own
grandchildren and pinned them to the standalone pair's fixed coordinates.

Measured pre-fix, `?pool=` 360x780 dark: `.app-search-input` {x:192, right:288.9, y:4.5,
bottom:47.5}; `.language-toggle` **position:fixed** {x:256, right:296, y:16, bottom:56} — 32.9 x
31.5px ON the input (1036.3px²); `.theme-toggle` fixed {x:304, right:344} over the ✕ clear (952px²
on the bar); `.app-header-controls` collapsed to 0x0 at {x:340,y:26}. Same at 320/480. 222's comment
asserts `:not(.has-results)` "never matches on a results page by construction" — true, and why it
reasoned only about results pages, missing the one non-`has-results` route that renders a header.

## Fix — style.css, 4 selectors, CSS-only
`.app:not(.has-results) > .theme-toggle` / `> .language-toggle` in both mobile tiers (style.css
:4828, :4846, :5126, :5153; +18 comment lines). `>` restricts them to the STANDALONE pair (direct
children of `.app`, the homepage's only toggles), never the header's grandchildren — the argument
already written above `.app.has-results > .theme-toggle {display:none}` in the same sheet. `npm run
minify` regenerated `style.min.css` (136 trap: home.html injects the MIN sheet); nothing else moved.

## Box-compare vs baseline (git stash, same fixture, same run)
`?token=` identical at 320/360/480/768/1280. `?pool=` unchanged at 768/1280, changed only at
320/360/480 as intended (controls rejoin flow, `[300,26,0,0] -> [212,6,88,40]` at 320). `?app=1`
homepage pair unchanged at all widths. Sticky header height unchanged everywhere.

## Guard + non-vacuity
`test_header_controls_overlap.js` (new, wired into `test:serial` after
`test_mobile_controls_reachable.js`; `test_test_registry.js` 5/5 green). Population derived at test
time from `.app-header-controls`'s children, never a hardcoded pair. 110/110 green over
320/360/480/768/1280 x light/dark x EN/KO on `?pool=`; `?token=` every width + 360 dark KO; two
20-char-query surfaces every width; `?app=1` homepage guard. Non-vacuity, repo-level: `git stash`
of style.css+style.min.css (mutated md5 `555b43e06ae0bd3dc981ebc0dcebdceb` /
`024a4f9abb3f75ae7b875906f1e2746c`) → **90/110, 20 RED**, all at 320/360/480 on `?pool=`, naming
`language-toggle (pos:fixed) intersects .app-search-input by 1036.3px²`; `git stash pop` → md5 back
to `b729b44bac1e4687503e0c71f4979515` / `c99f75299f983c0bf9faf9398b2e6c72`, byte-identical, 110/110.
It also carries an in-page red proof so it cannot rot vacuous. Ratio: 321 test lines vs 26 CSS lines,
over §0's 2:1 LOW cap — ~150 are the house harness floor shared with the siblings (682/367 lines).

## Deviation: the box the guard compares
Victim rects = border box ∩ every CLIPPING ancestor, because `.app-search-bar` is `overflow: hidden`
at `<=640px` (225's net for this family) and raw rects there report pixels neither painted nor
hit-testable: at 320px on `?token=` the input's raw box overhangs its clipped bar by 23px and
"intersects" the KO button by 800px² nobody can see or touch — pre-existing, in the baseline too,
unchanged here. A fixed victim is never clipped (that IS the defect shape), so the red proof still
goes red. The 320px bar at ~29px wide is a separate squeeze defect, left to 274.

## Instrument gap
The lens DID rotate over this surface (`pool-detail-360`, audit-app.js:5181); it missed the overlap
because its victim scan exempts by construction anything itself fixed/sticky (`audit-app.js:4652`)
or living inside another overlay (`:4654-4658`) — the search input is inside `.app-header-sticky`, a

**Concurrent-run addendum (operator):** a second run fixed a SECOND real mechanism — ≤359px flex-floor
overflow (input padding is a floor `min-width:0` cannot remove; their analysis rebuts our clipping deviation (1)) — full write-up in commit 17686cd827; both fixes co-exist on this branch.
