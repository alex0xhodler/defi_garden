# numeral-cell-track-escape — playbook

**When:** a rendered number visually collides with, prints over, or sits on top of a neighbouring
element in a card/row/table cell — OR you are about to "fix" a number that wraps, clips, or overlaps
by adding `white-space: nowrap`, `overflow: hidden`, or a `min-width` to the numeral itself. Also
whenever a ticket tells you the fix is to shrink or truncate the *text* beside a number.

**Answer in one line:** the number is almost never growing *into* its neighbour because the
neighbour misbehaved — it is the numeral's own box **escaping the track it was allotted**, and
`nowrap` (usually added by a previous item to fix wrapping) is what made the box un-shrinkable in the
first place.

## Steps

1. **Reproduce and MEASURE before you believe the ticket.** Drive the real rendered UI and dump
   `getBoundingClientRect()` for the numeral, its section/container, the neighbour, and the card —
   plus computed `min-width`, `max-width`, `overflow`, `white-space`, `flex`, and the container's
   `grid-template-columns`. Item 260's ticket named the wrong culprit; one measurement refuted it.
   The pattern to look for:
   - neighbour's `right` ≈ its own track edge, `scrollWidth > clientWidth`, ellipsis working
     → **the neighbour is innocent**;
   - numeral's `width` > its track width, `scrollWidth === clientWidth`
     → **the numeral escaped**. Direction follows alignment: right-aligned escapes LEFT,
     left-aligned in a row flex escapes RIGHT.

2. **Decision rule — where did it escape from?**
   - **Escaped its own flex container, and that container holds a LABEL too** → fixable. The label is
     text and may yield. Go to step 3.
   - **Escaped a fixed grid TRACK, and its container holds only numerals** → *not* fixable by CSS
     inside the row. Go to step 4.

3. **Fix: the label yields, the numeral never does.** Give the label `min-width: 0` (or
   `overflow: hidden` — see Traps) plus `text-overflow: ellipsis; white-space: nowrap`, and state
   `flex-shrink: 0` on the numeral as intent. **Then quantify the bound**: the fix buys exactly the
   label's width in headroom, once. Compute the magnitude at which it stops working and write that
   number into the spec — this fix is a bounded headroom purchase, never a width discipline, and
   claiming otherwise is the exact overstatement a verifier will catch (item 260, finding 1).

4. **Not fixable in-row: check the four constraints before proposing anything.** For an *unbounded*
   numeral width these are jointly unsatisfiable — (a) never truncate a numeral (trust rail);
   (b) never wrap it (the previous item's rule); (c) rows stay aligned with each other, which in a
   per-row grid means the track cannot be content-sized; (d) no overlap. Only two escapes exist and
   **both are human-gated**: shared column sizing (one grid + `subgrid` rows, so `max-content`
   resolves across all rows at once) or bounding how the out-of-rail value is *displayed*. Do not
   guess between them — mark the sub-class open, print it, and ask.

5. **Size the population with the product's own rail, not the instance.** Escapes cluster on
   out-of-rail data (anomalous APYs, garbage TVLs), so the residual is usually tiny and computable.
   Derive it with the app's own predicate (`app.js` `isAnomalousApy`, `APY_SANITY_LIMIT`) over
   `data/pools-snapshot.json`, and check the **conjunction** — item 260's instance (i) needs an
   anomalous APY *and* a wide enough byline, and no real pool satisfied both, so it is latent rather
   than live.

   **Measure the rendered composite string, not the field you assume dominates it.** Item 260 first
   ranked candidates by project-slug length and got the wrong answer: the byline is
   `<project> · <chain>`, so the longest slug (`aerodrome-slipstream`, 20 chars) is NOT the widest
   byline (`kyberswap-fairflow · Robinhood Chain`, from an 18-char slug on a long chain name). The
   two rankings disagree, which is exactly when a field-length proxy fails.

   Never copy a population number forward from a previous item's write-up — the snapshot churns
   daily (260 inherited a stale "17 of 7,339" that was really 18 of 7,340). **And read the rail's
   value from the code, not from the docs**: 260 asserted a TVL-floor safety argument sourced from
   `CLAUDE.md`'s "`DEFAULT_MIN_TVL = $10M` everywhere" when `app.js:801` sets `100000` ($100K) — the
   claim was false three ways, including an inverted comparison (`tvlUsd >= minTvl` means clearing
   the floor puts a pool ON the surface, not off it).

## Resolution

- **Fixable (step 3):** ship the label-yields fix, state the bound with a number, and widen the
  guard to the neighbour set the fix makes assertable.
- **Not fixable (step 4):** ship nothing for that sub-class, reproduce it in the test file and
  **PRINT** it on every run (never assert it — that ships a permanently red suite; never footnote it
  in a notes file either — that is how a gap becomes "covered"). Assert that the reproduction's own
  fixture override actually applied, or the print can rot into a silent no-op.

## Traps

- **A self-overflow check cannot see this class.** `scrollWidth <= clientWidth` passes on every
  escape, because the element's box grows to fit its text — nothing is clipped *inside* it. The
  oversize is relative to the **track**.
- **The weakest predicate is CONTAINMENT, not neighbour-intersection.** "No numeral box intersects a
  neighbour box" is magnitude- and neighbour-*dependent*: an escape with nothing adjacent at that
  magnitude is invisible. "Every numeral's border box is contained within its own section's content
  box" strictly contains it. If you ship the narrower one, say so and say why (item 260 did:
  containment goes red on day one for the open sub-class).
- **`min-width: 0` and `overflow: hidden` are redundant, not complementary.** A flex item's automatic
  minimum size only contributes its content-based minimum while `overflow` is `visible`, so either
  declaration alone zeroes the effective minimum. A non-vacuity mutation that removes only one will
  stay GREEN and tell you nothing — remove both.
- **Don't apply the discipline "everywhere for consistency."** Relaxing `min-width` on a container
  that has no label to yield just lets the container collapse and the numerals escape *further*.
  Item 260 measured this: the same discipline on the APY section took failures from 3 to **14**.
- **Trial candidates against the live page, not in your head.** Every conclusion above that mattered
  came from a rendered trial; two plausible-sounding fixes were wrong.
- **`home.html` loads `style.min.css`.** Every CSS trial needs `npm run minify` or you get a false
  green. Confirm restores with `md5sum style.css`.
- **A vanished label is erasure, not truncation.** At garbage magnitudes the yielding label can be
  squashed to ~1px rather than ellipsized. That is acceptable for a label and never for a number —
  but name it plainly instead of calling it graceful degradation.

## Provenance

Item 260 (2026-08-11) — distilled from two live instances found by item 246's widened guard and left
unfixed there, plus a verifier round-1 FAIL whose 7 findings were **all** against claims rather than
code. Related: `derived-number-rails.md` (out-of-rail figures), `detector-signal-coverage.md`
(a checker green while a real bug ships), `pre-existing-red-triage.md`.
