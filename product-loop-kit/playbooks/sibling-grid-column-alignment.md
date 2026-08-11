# sibling-grid-column-alignment — playbook

When: you are about to change a `grid-template-columns` on a table-like surface where a **column-header
row and its data rows are SEPARATE grids** that only *look* like one table — or you are reviewing a diff
that does. In this repo that is `.pool-columns` (header) vs `.pools-list .pool-card` (rows), rendered as
siblings at `app.js:3541-3548`. Also applies whenever a cell is given a `min-width`/`max-content` floor to
stop it overflowing a neighbour.

Answer in one line: **two sibling grids stay visually aligned only where their tracks resolve to the same
widths, and a floor scoped to one grid's cell class never reaches the other's** — so a fix applied to the
rows alone silently unpins every column boundary that the rows' own tracks determine.

Steps:
  1. Identify which tracks are **anchored** and which are **derived**. A track's RIGHT edge is anchored if
     everything to its right is fixed-width: track 5 at `120px` + a fixed `column-gap` anchors track 4's
     right edge in BOTH grids regardless of track 4's own width. A track's right edge is *derived* when it
     equals the next track's LEFT edge — that depends on the next track's own resolved width, which is
     exactly what differs between the two grids.
  2. For every track you are changing from a fixed px to an intrinsic function (`auto`, `max-content`,
     `minmax(…, max-content)`), ask: **does this track's width feed a neighbour's derived edge?** If yes,
     the two grids must resolve it identically or the columns come apart.
  3. Decision rule:
     - **The floor lands on the ROW cell only** (e.g. `.pools-list .pool-tvl-section { min-width: 130px }`)
       → leave the HEADER grid on its baseline fixed-px template. The header's fixed `130px` and the row's
       floored `130px` resolve equal, so every derived edge coincides. **This is the shipped shape (260).**
     - **You "keep the templates in sync" by giving the header the same `auto` tracks** → the header's
       `auto` sizes to its *label text* ("TVL" ≈ 34px) while the row's is floored (130px). Every derived
       edge to the left of it shifts by the difference. In 260 that was **107.98px of APY-header drift on
       every normal row, at every viewport ≥768px, in the default view.** Do not do this.
  4. Verify by MEASURING BOTH GRIDS, never one: capture `.pool-columns .col-*` label rects **alongside**
     the row cells' rects, on a clean baseline worktree and on the branch, at every viewport where the
     header renders (it is `display:none` below 768px — read that from `getComputedStyle`, don't hardcode
     it), both themes. Assert right-edge equality within 1px.

Resolution:
  - Alignment restored → keep the row-scoped floor, revert the header template, and commit a check that
    asserts header-label right edge === its numeral's right edge (`test_card_numeral_wrap.js` check I is
    the reference implementation). Prove it non-vacuously **two independent ways**: re-apply the header
    template change (red, ~107px) and neuter the floor (red, ~74px).
  - Alignment still broken after reverting the header → the mechanism is not this one; measure the resolved
    `getComputedStyle(el).gridTemplateColumns` on both grids side by side before inventing a third remedy.

Traps:
  - **A "keep them identical" comment is not a mechanism.** `.pool-columns`'s own comment says it uses "the
    exact same grid the rows below use" — which made changing both look obviously correct. It is the
    resolved WIDTHS that must match, not the declared template.
  - **The TVL column staying aligned is a false all-clear.** Only the *derived* edges move, so the
    rightmost column looks perfect while the one beside it is ~108px off. Check every column, not one.
  - **An AC that measures only the thing you fixed cannot see this.** Two build attempts measured
    `.pool-card` numeral rects at 0px drift and reported "geometry unchanged" while the header floated
    108px away; the spec had explicitly named header alignment and the methodology still missed it. Derive
    the measured element set from the acceptance text, not from the file you edited.
  - **A media-query-scoped floor needs its boundary checked at both sides** (767px and 768px here) — a leak
    into a re-templated mobile layout is a regression nothing else asserts.
  - **Grid track sizing does not give a `minmax(0, 1fr)` track priority over an `auto` sibling.** If you
    need the numeral cell to win space from a control, the control's track must be the flexible one — and
    swapping which track is flexible MOVES the column boundary on every normal row (that is what killed
    260's leg B: a 46-497px shift of the closing hairline, for a defect no live pool could reach).

Provenance: item 260 (`specs/260.md`, `specs/260-notes.md` attempts 1-3, `LOG.md` 2026-08-11) — three build
attempts, three verifier rounds; both regressions were found by the verifier's extension attack, not by the
builder's own acceptance evidence. Related: `derived-number-rails.md` (never truncate a numeral),
`fixed-overlay-occlusion.md` (the other "boxes land on each other" class).
