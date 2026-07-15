# 111 — implementation notes / deviations

Implemented exactly per the edit plan. Two conservative choices were made in the
NEW test (`test_filter_dropdown_polish.js`); no product-code deviations.

## Note 1 — deferred-CSS activation nudge in the new test (not a product change)
`home.html` loads `style.min.css` perf-deferred: `media="print" onload="this.media='all'"`.
Production browsers fire that `onload` swap near-instantly, but headless chromium
lazy-loads non-matching-media (print) stylesheets, so in-sandbox the swap can lag
arbitrarily — before it fires, `:root` tokens like `--color-primary` are unresolved
and the neuro styling (chip fill, scrim tint) is not applied. `test_nav_rail_ia.js`
only avoids this because ~7 prior interactive assertions elapse before its first
CSS-dependent check.

To make `test_filter_dropdown_polish.js` deterministic, after load it does exactly
what the prod `onload` handler does — flip any `link[media="print"]` to `media="all"`
— then waits for `--color-primary` to resolve before asserting computed styles. This
changes nothing about the product or the CSS content; it only removes reliance on
chromium's lazy print-load timing. This is the same class of harness accommodation
the spec already sanctions (fixture routing, stale-snapshot stub).

## Note 2 — B2 asserted via robust invariants rather than exact --color-primary match
The spec's B2 wording is "active chip bg equals resolved `--color-primary`". Per the
edit plan's "robust approach", the test instead asserts the active `$10M+` chip's
computed background (a) is not transparent, (b) differs from a non-active chip's
background, and (c) the active chip's text color is white `rgb(255, 255, 255)`. This
proves the unmistakable filled-primary state without brittle rgb-string equality
against a token that can be defined as teal or blue depending on theme scope.

## icons.llamao.fi
Added `icons\.llamao\.fi` to `IGNORABLE_ERROR_PATTERN` in both `test_nav_rail_ia.js`
and the new test, per spec (external pool/chain logo CDN, connection-reset in sandbox;
same class as the already-ignored fontshare/mixpanel).

## Note 3 — attempt-1 → attempt-2 CSS re-scoping (verifier-required fix)
Verifier attempt-1 FAILed on two items: (1) the required HIGH-tier `specs/111-pr.md` gate
artifact was missing (now written), and (2) the shared rule
`.global-filter-dropdown .filter-pill.active, .filter-chip.active` had its transform/box-shadow
changed from `translateY(-1px)`/`neuro-shadow-raised` to `translateY(0)`/`neuro-shadow-subtle`,
which also altered the active lift of `.chain-pill.active`/`.protocol-pill.active` inside the
dropdown — beyond what §B2 authorized ("chain/protocol pills keep their existing filled/brand
look"). Fix (verifier's option b): the shared rule is restored to its ORIGINAL
`translateY(-1px)`/`neuro-shadow-raised`, and the transform/box-shadow override now lives inside
the `.filter-chip.active`-only rule alongside the background/color/font-weight. Net effect: pills
(chain/protocol) are byte-unchanged in the active state; only `.filter-chip` (TVL/APY) gets the
full filled-primary has-selection look. `test_filter_dropdown_polish.js` re-run 7/7 after the fix;
`style.min.css` regenerated.

## Note 4 — 2 pre-existing `test_search.js` failures (NOT caused by this diff)
Timeboxed `test_search.js` run: 18/20, with two protocol-false-match assertions failing —
`"comparison of yields" does not false-match a protocol` and `"balance my portfolio" does not
false-match a protocol`. These exercise `parseNaturalLanguageQuery`'s protocol matcher in `app.js`
(~L277), which this diff does NOT touch: `git diff app.compiled.js` has exactly 3 hunks, all in
the nav/effect/scrim region (L1208 outside-click, L2709 navIcon removal, L3108 scrim), so the
compiled parser is byte-identical to HEAD. Definitionally pre-existing — consistent with the
documented `test_search` protocol-matching fragility (070-notes: "protocol matching hits external
api.llama.fi, connection-reset"). All change-relevant tests are green (nav 10/10, dropdown 7/7,
category_taxonomy 8/8+5/5, smoke 8/8, compiled/min freshness). Disclosed per the timebox +
pre-existing-failure discipline; not worked around by weakening the test.

## Verification (all in-sandbox, all green)
- `node test_nav_rail_ia.js` → 10/10 (incl. rewritten assertion #4: category tabs
  text-only, filter buttons keep exactly one svg).
- `node test_filter_dropdown_polish.js` → 7/7.
- `node test_compiled_assets.js && node test_minified_assets.js && node test_css_minified_render.js`
  → all pass (compiled/min byte-identical to source).
