# 225 round 3 — design brief (written after the human REJECTED round 2's preview, 2026-08-05)

## The verdict this answers
Human, reviewing the `claude/loop-225` Vercel preview (dark, pool detail STEAKUSDC + grid "Yields for
USDC on Base"), verbatim: *"still below amateuristic ux ... makes it look even more uglier than before
and non coheseve and non sota grade with no attention to details what so ever and all over the place
styling."* This is the #393 pre-merge gate returning FAIL. Rounds 1-2 unified GEOMETRY (measured: one
radius, one height, one token layer) and that is worth keeping — but consistency ≠ design, and the
acceptance criteria never asked for design. Round 3's deliverable is visual design QUALITY, judged on
screenshots by the human, increment by increment.

## Concrete critique — what reads amateur in the round-2 preview (from the human's own screenshots)

**Pool detail (dark):**
1. ~200px of empty space between header and hero — the page starts with nothing.
2. Hero is a sparse left column (title / protocol / chips) facing a detached top-right "TOTAL APY"
   number — no compositional relationship between the two.
3. Chips are undesigned outline rectangles; "✓ Verified" wraps to two lines inside one; "$587.6M TVL"
   and "Risk Assessment: Low" have different internal structures side by side.
4. H1 is mono-uppercase (STEAKUSDC) — terminal skin on the page's most prominent glyphs.
5. Two stacked full-width CTAs, both loud (solid glow-blue + full-width outline) — no hierarchy between
   the primary action and the secondary escape hatch.
6. The stability sentence sits in a flat gray well with no relationship to the APY it explains.
7. No vertical rhythm: hero, calculator, info cards are equal-weight boxes separated by arbitrary gaps.

**Grid (dark):**
8. Row cards are ~130px tall for one line of information — density is off by 2×.
9. Four unaligned columns per row: icon+name (left), APY pill (floating mid-row), TVL (right-ish),
   "View & calculate →" (far right). No shared baseline, no column grid.
10. Numerals in mono inside glowing pill wells — dated, and the glow fights the near-black bg.
11. Card borders are near-invisible against the background; rows read as floating blobs.
12. The results-header card ("Yields for USDC on Base · 19 pools found · sort") is a separate box
    disconnected from the rows it controls.
13. ALL-CAPS mono badges ("ON MORPHO-BLUE • BASE") under every row — noise at data scale.

**Cross-cutting:**
14. Boxes-in-boxes-in-boxes: every element is a bordered rounded rectangle; nothing is allowed to be
    plain text on the page.
15. The blue accent is spent on everything — numbers, links, buttons, pills, selected states — so
    nothing is primary. An accent that highlights everything highlights nothing.
16. Type has size but no hierarchy system: no consistent scale, weight pairing, or secondary-text color
    discipline across surfaces.

## The bar (what "SOTA grade" means here, so a builder and the human share one definition)
Reference class: the restrained data-product school — Linear's settings/dashboards, Stripe Dashboard,
Vercel's dashboard. Principles to apply, not screenshots to copy:
- **8pt spacing rhythm** everywhere; section gaps from the scale, never eyeballed.
- **Type system**: one family; 3 text colors max (primary / secondary / disabled); a defined scale
  (e.g. 13/14/16/20/28) with weights doing hierarchy, not size alone. Numerals via
  `font-variant-numeric: tabular-nums` on the body family — the full mono skin goes (item 238 merges
  into this round).
- **Accent discipline**: blue for the ONE primary action per view and (sparingly) the headline metric.
  Links, selected states, secondary numbers: neutral grays/weights. No glows, no filled pills around
  plain data.
- **The grid becomes a real table**: aligned columns on one grid, one row = one visual line (~56-64px),
  borders OR background alternation (not both), header row attached to its rows, badges demoted to
  plain secondary text ("morpho-blue · Base").
- **Pool detail composes**: hero = title block + APY as one composed unit, chips as quiet metadata
  text-with-icon (not boxes), ONE primary CTA + one text-level secondary, stability note attached
  visually to the APY it qualifies, dead space closed.
- **Boxes earn their borders**: a container only when grouping is needed; plain text on background is
  the default. Dark mode: raise contrast steps deliberately (border and text tokens per elevation),
  never the same near-invisible border everywhere.

## Process (this is the part that prevents round 4 being round 2 again)
1. Increments of ONE composed surface at a time: (a) grid rows+header, (b) pool-detail hero,
   (c) pool-detail calculator+info, (d) landing alignment pass. Each increment = a branch commit +
   rendered screenshots (360/768/1280 × light/dark, the `specs/225-screenshots/capture-shots.js`
   harness) posted for the HUMAN's review. **No increment starts before the previous one is approved.**
2. The operator (Fable) reviews screenshots with design judgment BEFORE the human sees them — the
   round-2 failure included the operator recommending a branch off its metrics without looking.
3. Builders: Sonnet 5 per the execution split, one increment per dispatch, this brief verbatim in the
   dispatch prompt plus the increment's surface only.
4. Machine gates stay (occlusion, pressability, contrast/a11y, reduced-motion, EN+KO) — they are
   necessary, and round 2 proved they are not sufficient. The human's screenshot approval is the
   acceptance criterion for every increment.
5. Base: `claude/loop-225` (conflicts with main resolved 2026-08-05; the token layer from rounds 1-2 is
   the starting material, not the deliverable).

## Relationship to the 2026-08-05 UX-audit items
238 (terminal skin) is absorbed by this round's type system. 236 (nav contract), 237 (CTA dedupe) can
land inside increments (b)/(d) if the increment's diff stays reviewable — otherwise they follow. 239,
240, 241 (ranking honesty, footer voice, count formatting) are independent and may ship meanwhile.
