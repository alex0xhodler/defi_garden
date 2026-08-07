# 236 — build notes (phase 1)

## Scope actually built
Phase 1 only, per the spec's ADDENDUM 2026-08-06: one header band (wordmark + lang/theme controls,
identical geometry) rendered unconditionally on all three surfaces (landing, analytics grid, pool-detail),
and one `--content-max-width` token (reuses the existing `--container-xl` = 1280px, no new number) that
all three surfaces' primary content container resolves to. Phase 2 (Search yields / How it works / My
garden nav links added to grid + pool-detail) is explicitly deferred — landing keeps its existing nav
links unchanged; grid and pool-detail get none, same as before.

## Build sequence (4 commits, 1 build-loop pickup, 3 verifier rounds)
1. `ccd4c47ac3` — initial implementation (Sonnet build agent).
2. Verifier round 1: **FAIL**.
   - Landing's two mobile media-query overrides (760px/440px breakpoints) hardcoded their own width
     formula and weren't migrated to `--content-max-width`, so at 360px `.landing-header` (328px/16px
     inset) didn't match `.app-header-content` (312px/24px inset) — falsifying "all three containers
     resolve the SAME token."
   - The no-results ("search"/`?app=1`) state's header rendered vertically centered (top ≈245px at
     360×900) instead of pinned to y=0 like the results state and landing/pool-detail.
3. `f2e4f1d4ab` — fixed both (removed the two surfaces from the media-query override lists; moved
   `justify-content: center` off `.app:not(.has-results)` onto its `.container` child instead of the
   whole column). Also proactively fixed the non-blocking background-parity note from round 1
   (pool-detail's header band had no surface-color fill; added `background: var(--color-surface)`,
   matching the token the other two bands already use).
4. Verifier round 2: **FAIL** (new finding, not a regression from step 3's fix — present since commit 1,
   missed by both the original build and round 1's verification because neither checked pool-detail
   against landing/grid three-way, only landing-vs-grid pairwise). Pool-detail's header band was 40px
   narrower / 20px more inset / 5px too high than landing/grid at every viewport, from two stacked bugs:
   the container's width formula AND its own 20px padding both applying an inset (double-counted), and a
   shared `.container` centering rule (added in step 3's fix) unintentionally also matching pool-detail's
   route and pulling the whole block ~45px up the page.
5. `04f5771b15` — fixed both root causes: `margin: -40px -20px 8px` + `width: auto` on
   `.pool-detail-topbar` to cancel the inherited padding without duplicating the width formula against an
   already-narrowed box (a generic `.header { width: 100% }` rule elsewhere in style.css was also silently
   pinning the topbar's width and had to be overridden); and `.app.pool-detail-view .container`
   (`display:block; transform:none`) to opt pool-detail out of the shared no-results-state centering rule
   without touching that rule's own scoping for the state it was written for.
6. Verifier round 3 (final, of the 3-attempt budget): **PASS**. Independent Playwright re-measurement of
   the three-way `{top, left, width}` match found exact 0px agreement across landing/grid/pool-detail at
   360/768/1280px, both themes — plus an extension-attack check at 320/480/640/900/1920px (untested by
   any prior round) that also matched exactly, evidence the fix is an algebraic cancellation rather than a
   breakpoint-specific patch. Full regression suite green (12 required test files) except the one
   pre-existing, pre-accepted vacuous line in `test_mobile_controls_reachable.js` (a round-222 "red proof"
   whose mutation target — the standalone floating toggle-button pair — this diff deleted from the DOM
   entirely; the defect class it guarded is now structurally impossible rather than merely patched, not a
   live regression).

## Deviations from the literal brief
- The button-class consolidation across `.landing-icon-button`/`.app-control-btn`/`.detail-header-btn`
  was already done pre-existing (spec 225 §7's shared icon-only-button rule) — verified, not re-done.
- The pool-detail background-parity item (verifier round 1's non-blocking note #3) was folded into the
  round-1 fix rather than left for later, since it was a one-line, low-risk addition using an existing
  token.
- `pool-detail-styles.css`'s pre-existing comment claiming the container's padding was "how the OTHER
  bands get theirs too" was factually wrong (confirmed while diagnosing round 2's finding) — landing/grid
  get their inset from the width formula alone, no enclosing padding. Left the comment corrected in place
  rather than silently rewritten with no trace.

## Class left open (counted, per RAZOR.md's rule to state what a fix leaves open with a number)
- No persisted automated test asserts the three-way header geometry match — all three verification rounds
  measured it ad-hoc with Playwright and threw the script away. A future change to any of the three
  surfaces' header/container CSS could silently reintroduce a geometry mismatch and nothing in
  `node test_*.js` would catch it. Population: 3 surfaces, 1 untested invariant (geometry identity),
  0 regression coverage. Not required by the phase-1 addendum's literal acceptance text, but worth a
  follow-up backlog item if the human wants this guarded going forward rather than re-verified by hand
  each time the chrome changes.
- Phase 2 (nav links on grid + pool-detail) is explicitly out of scope here and remains unbuilt — landing
  is the only surface with "Search yields / How it works / My garden" today.

## Risk tier
HIGH, independently confirmed by the verifier across all three rounds — render-path change to `App()`
(app.js) and `PoolDetail()` (PoolDetail.js), both of which execute unconditionally on the sacred
`?token=`/`?chain=`/`?pool=` parameterized URLs.

## Ship path note
This item is left as an OPEN PR rather than auto-merged, despite verifier PASS + tests green (which would
normally auto-merge under NORTH_STAR.md's autonomy policy). NORTH_STAR.md's 2026-08-05 DESIGN QUALITY BAR
+ PROCESS standing decision requires design-taste-sensitive work to ship through human-approved
screenshot-first review, layered on top of (not replaced by) the general auto-merge autonomy line — the
verifier independently flagged this in both round 2 and round 3's reports. This mirrors the precedent set
by item 225's PR #393 ("NEEDS YOUR SCREENSHOT REVIEW BEFORE MERGE").
