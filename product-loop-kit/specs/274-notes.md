# 274 — build notes (HIGH tier, attempt 1)

## Root cause, verified (not assumed)

Spec 274's hypothesis named `.pool-card`'s grid columns; the actual measured mechanism
is one level up. `.pool-header-new` (grid view: `grid-column: 1/-1`, spanning both of
`.pool-card`'s tracks) is a `display:flex; justify-content:space-between` row holding
`.pool-name-group` and `.pool-apy-section`. Both children carry 246's `white-space:
nowrap` numerals with no width bound; the header's default `flex-wrap: nowrap` means
neither child can shrink below its own nowrap min-content, so a wide APY string forces
the row past the card's inner width, and `.pool-card`'s `overflow: hidden` clips the
excess. Confirmed with a Playwright probe (not by reading CSS): a 128,000.00% fixture
at 1280px measured `card.scrollWidth=315 > clientWidth=281`, hero `rect.right=373.1` vs
`card.rect.right=339.5` — 33.6px clipped, matching the screenshot.

## Fix

1. `.pools-grid .pool-header-new { flex-wrap: wrap; row-gap: var(--space-8); }` — lets
   `.pool-apy-section` (hero + $/day, already a column-stacked unit) drop to its own
   line below `.pool-name-group` only when it doesn't fit. 246's `nowrap` on
   `.pool-apy-hero`/`.pool-apy-preview` is untouched, so ⚠+number never split.
2. `.pools-grid .pool-apy-section { margin-left: auto; }` — keeps it flush right in
   both the unwrapped (one line) and wrapped (own line) cases; on one line this
   resolves to the exact same gap `justify-content: space-between` already produced
   (2 children, trailing auto-margin absorbs 100% of remaining space before
   `justify-content` has anything left to distribute), so it's a pixel-identical
   no-op for normal cards.
3. `.pools-grid { align-items: start; }` — a change beyond the header itself, added
   after pixel-drift measurement (below) showed CSS Grid's default cross-axis stretch
   was inflating perfectly normal same-row siblings of a now-taller wrapped card.
   Necessary for the zero-drift acceptance criterion to actually hold; without it,
   normal cards sharing a grid row with an overflowing card measured 42.58px of height
   drift they have no defect of their own to justify.

## Root-cause note: a second, PRE-EXISTING, OUT-OF-SCOPE defect found by measurement

While measuring, the existing `LONGEST_PROJECT_SLUG` fixture (`usdc-poly-aave`, a
non-anomalous ~3%-APY pool with a 57-char project name) turned out to ALREADY overflow
`.pool-card` in grid view, via a completely different, classic flexbox `min-width:
auto` mechanism on `.pool-left-section`/`.pool-name-group` — the byline's own
min-content width (unwrapped, ~400px) exceeds the card, independent of any numeral.
Reproduced byte-identically on a clean pre-274 `origin/main` worktree, so it predates
this item and sits outside spec 274's stated scope ("grid-card containment [for
numerals] only", "NO redesign of the card"). Left OPEN and UNGUARDED beyond logging
(check J's `excusedByline`, see below) — same treatment 260 gave leg B. Not filed as a
new backlog row per the ceremony-cap steer; flagged here for the human/next audit tick.

Practical effect on this item's fix: because `.pool-name-group` is already wider than
the container in this specific fixture, `flex-wrap: wrap` (item 1 above) ALSO makes
`usdc-poly-aave`'s apy-section wrap to its own line — a side effect of fixing the
unrelated sibling overflow, not of the numeral's own width. This is a net improvement
(pre-fix, that card's hero/preview were themselves NOT contained — see non-vacuity
below), so it's correctly excluded from the "normal card" zero-drift population (its
numeral already overflowed pre-fix; see Measurement).

## Measurement: pixel drift (playbook: sibling-grid-column-alignment.md)

Clean `origin/main` worktree (`fcc1b1784a`) vs this branch, same 9-pool fixture, grid
view, all 4 viewports × 2 themes, rects captured RELATIVE to each card's own top-left
(not raw page position — an earlier sibling growing taller legitimately shifts every
later card's absolute page position in single-column layout; that's page flow, not a
change to that card's own geometry, so the drift proof measures shape, not position).

- "Normal" = a card whose numeral was ALREADY fully contained in baseline (derived from
  measurement, not from APY digit count/anomaly flag alone — this correctly excludes
  `usdc-poly-aave`, whose hero was NOT contained in baseline for the unrelated reason
  above).
- **42 normal-card instances measured (7 pools × 6 applicable combos). MAX drift: 0.044px**
  (sub-pixel rounding noise from `getBoundingClientRect()`/animation-settle timing —
  effectively zero, and 100x below the 1px tolerance every other check in this file
  uses).
- Before `align-items: start` was added: MAX drift among the same 42-card population
  was 250.531px (driven entirely by `.card.height` stretch on siblings sharing a row
  with a wrapped card — a real regression the first CSS draft would have shipped).
- All non-zero drift after the fix is confined to the `usdc-poly-aave`-shaped card
  (correctly excluded from "normal") across 6 combos, matching its own wrap — exactly
  the change the fix is supposed to make, nothing else moved.

## Non-vacuity (required by spec)

`git stash push -- style.css style.min.css` (temporarily reverting ONLY the CSS, test
file kept), `npm run minify`, ran `test_card_numeral_wrap.js`:

- **RED**: 36/42 (6 failures) — `grid/light/360,1280,1540px` + `grid/dark/360,1280,1540px`
  "card containment (check J)", 8 numeral-containment failures per failing 1280/1540
  combo (⚠3,385.12%, ⚠36,452.38%, ⚠9,999,999.99%, and — the byline side effect above —
  `usdc-poly-aave`'s plain "3.10%"), 4 at 360px. 768px stayed green at both themes (this
  fixture set's overflow amounts don't reach the wider single-column 768px card).

`git stash pop`, `npm run minify`, reran:

- **GREEN**: 42/42, including 12 logged-not-failed `excusedByline` cards (the
  pre-existing byline defect, unaffected by this fix in either direction — same 2
  cards × 6 combos where it's reproducible, 0 at 768px both themes).

## Fixture changes (for check J's required digit-count population)

Spec's AC1 asks for 6-digit anomalous / 4-digit anomalous / 3-digit / normal 2-digit
fixtures. Retargeted 3 existing "generic control" pools' `apyBase` (no historically-pinned
comments on their old values, verified by grep) rather than adding a 10th pool and
disturbing the file's exactly-9/`itemsPerPage` page-1 discipline (spec 260 attempt-2
finding 2):
- `usdc-eth-morpho`: 5.9 → 45.67 (2-digit normal control)
- `usdc-arb-aave`: 4.8 → 705.51 (3-digit, matches the human's exact "705.51" report)
- `usdc-tvl-glitch`: 3.0 → 3385.12 (4-digit anomalous, matches "⚠ 3,385.12%" report;
  doubles as its existing TVL-glitch/leg-B role, unaffected — that's about `.tvl-value`
  string width, not `apyBase`)
- 6-digit-anomalous bucket satisfied by the existing dynamic `usdc-worst-live-apy`
  (currently 425,964.88% from the live snapshot — a "128,000%+"-class lower bound, not
  literal-value pinned) and `usdc-daypreview-glitch` (9,999,999.99%, pre-existing).
- `usdc-anomaly` (36,452.38%, the 246 positive control referenced by many other
  comments in the file) was deliberately left untouched.

## Test counts

- `test_card_numeral_wrap.js`: **42/42** (was 34/34 before this item — 8 new check-J
  assertions: 4 widths × 2 themes, all in grid view). Check I's non-anomalous count
  dropped 72→60 (the `usdc-tvl-glitch` retarget moved one more row into "anomalous",
  correctly excluded per check I's own documented scope).
- `test_planner.js`: 208/208 assertions, unchanged.
- `test_protocol_parsing.js`: 9/9, unchanged.
- `test_qualifier_fix.js`: 9/9, unchanged.
- Full run stayed under the 5-minute timebox throughout (longest single run ~50s).

## Deviations from spec

- Spec's Change section suggested a container query or letting the whole line wrap as
  a unit; shipped `flex-wrap` + `margin-left:auto`, functionally the "let it wrap as a
  unit" option, chosen because it's a 2-property change with no new breakpoint/query
  and measured zero-drift.
- Added `.pools-grid { align-items: start }`, not named in the spec's practical-approach
  list — required by measurement (see above), scoped to the exact container the spec
  already names as in-scope (`.pools-grid`, grid-card containment).
- Did not fix the pre-existing byline/`min-width:auto` overflow (documented above and
  in the test file) — out of this item's stated scope; logged, not silently dropped.
- Spec/task text said check counts were "18/18"; the file was actually at 34/34 before
  this item (post-260). Reported here so the discrepancy isn't silently absorbed.
