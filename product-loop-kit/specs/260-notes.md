# 260 — build notes (2026-08-11)

CSS-only fix (two legs) + one widened guard test. Written as the item was built; all
measurements below are from real Chromium runs against the fixture-routed harness
(`test_card_numeral_wrap.js`'s pattern — local http server, vendored React/Babel,
stale-stubbed snapshot, `CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`), plus a
scratch measurement script (`measure.js`, not shipped — lived in the session scratchpad)
built to get raw `getBoundingClientRect()` numbers beyond pass/fail. `npm install` was
required first (`node_modules/` was absent in this session's checkout).

## What was measured before the change

**AC-1, instance (i), live worst case.** `data/pools-snapshot.json` (7,334 pools,
generated 2026-08-11T02:11:39Z — one tick newer than 246's 7,339-pool snapshot):
highest `apyBase + apyReward` is **zeebu / BSC / 394,208.17%** (`tvlUsd: $555,125`,
the value lives entirely in `apyReward`, `apyBase: null`). Rendered at 768px list view
with this pool's REAL project/chain/APY (TVL bumped only where needed for a *different*
fixture further down — this exact pairing renders fine at its real $555,125 TVL since
that already clears the app's actual `DEFAULT_MIN_TVL` constant, 100,000, not the
$10M figure CLAUDE.md/this spec state — see "Deviations" below):

```
apyTrack: left=347 right=457 width=110   (the 110px track, exactly — animation-settled)
hero:     left=324.953125 right=457 width=132.046875  ("⚠ 394,208.17%")
ctx:      left=89 right=160.6875  ("zeebu · BSC")
hero-vs-ctx overlap: false
```

The hero box (132.05px) DOES exceed its 110px track — spills 22.05px left of the
track's own left edge (324.95 vs 347) — but the byline is only 71.69px wide (a short
"zeebu · BSC"), leaving a 164px gap before the spilled hero region. **Reachable, not
colliding**: confirms 246-notes' characterization exactly, one snapshot generation
later, same live pool. Per spec, this pairing is asserted anyway (see "Population"
below) — the point is a real snapshot-derived worst case stays in the guard, not that
it demonstrates the collision.

**AC-1 positive control** (57-char slug × `apyBase: 9999999.99`, the verifier's
246-attempt-2 reproduction magnitude), same methodology:

```
apyTrack: left=347 right=457 width=110
hero:     left=308.953125 right=457 width=148.046875  ("⚠ 9,999,999.99%")
ctx:      left=89 right=335  ("hamilton-lane-…-fund · Polygon")
hero-vs-ctx overlap: true  (byline right edge 335 > hero left edge 308.95, 26.05px overlap)
```

Reproduced cleanly, matching 246-notes' finding exactly (same magnitude, same
768px-only, both-themes-only footprint; 360/1280/1540 and grid stayed green at this
magnitude, confirmed again this session).

**Instance (ii), grid view, TVL-glitch stress fixture** (`tvlUsd: 950e15`), 1280/1540px:

```
tvlTrack (pre-fix, minmax(0,1fr)): left=74 right=222.34 width=148.34
tvl:  left=100.84 right=222.34  ("$950000000.0B")
cta:  left=210.73 right=322.5   ("View & calculate →")
tvl-vs-cta overlap: true  (11.6px)
```

Both instances measured and reproduced exactly as `specs/246-notes.md` and
`specs/260.md`'s evidence table describe.

## The change

`style.css` only (plus regenerated `style.min.css` via `npm run minify`). Net diff:
111 lines (`git diff --stat style.css`) — under the 150-line NORTH_STAR threshold, so
risk tier stays LOW per the spec's own rule. Two legs, four surviving CSS rules (two
more were tried and removed after being measured inert — see "Dead rules" below).

### Leg A — list view (instance i)

- `.pool-columns` (`style.css:2787`) and `.pools-list .pool-card` (`style.css:2833`):
  `grid-template-columns` changed from `40px 1fr 110px 130px 120px` to
  `40px minmax(0, 1fr) auto auto 120px`. Tracks 3 (APY) and 4 (TVL) are now
  content-sized (`auto`): an oversized numeral grows its own track instead of
  overflowing past a fixed 110/130px boundary into the byline.
- `.pools-list .pool-tvl-section` gets `min-width: 130px` inside
  `@media (min-width: 768px)` (`style.css:2911-2915`). This is the ONLY floor that
  survived measurement (see "Dead rules" — a matching floor on `.pool-apy-section` was
  tried and proven to do nothing). It is scoped to `>=768px` because
  `@media (max-width: 767px)` (`style.css:2995` in the current file) re-templates the
  list row to a THIRD shared `auto` column (icon / name+ctx / apy+tvl stacked) that an
  unconditional floor would widen for every normal mobile row.

### Leg B — grid view (instance ii)

- `.pools-grid .pool-card` (`style.css:3114`): `grid-template-columns` swapped from
  `minmax(0, 1fr) auto` to `auto minmax(0, 1fr)`. Track 1 (TVL) is now content-sized
  (claims exactly what `.tvl-value` needs); track 2 (CTA) is the flexible track that
  yields.
- `.pools-grid .pool-cta-section` (`style.css:3159-3165`): `justify-self: end` REMOVED
  (defaults to grid's `stretch`, so the item's box IS the resolved track width instead
  of rendering at its own max-content width regardless of the track — this was the
  actual mechanism keeping the CTA from ever visually shrinking, found only by
  measuring `getComputedStyle`, see "How Leg B was actually found" below);
  `justify-content: flex-end` kept (right-aligns the label inside the now-stretched
  box); `min-width: 0` added.
- `.pools-grid .pool-cta-section .calculate-yield-btn-new` (`style.css:3176-3193`):
  `min-width: 0; display: block; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;` added. The `display: block` override was necessary because the
  shared "Button, primary" family rule makes this button `inline-flex; justify-content:
  center` — `text-overflow: ellipsis` does not engage on a centered flex item; measured
  directly (see below) that without it, an overflowing label just clips symmetrically
  off BOTH edges with no `…` shown at all ("iew & calculc…" — losing the leading "V").

No truncation/ellipsis was added to any numeral. `.pool-cta-section .calculate-
yield-btn-new`'s ellipsis is on the CTA's own action LABEL, explicitly authorized by
the spec ("ellipsis on a control label is allowed; ellipsis on a numeral is a
trust-rail violation").

### How Leg B was actually found (measured, not assumed — as the spec required)

First attempt: just swapping the grid-template-columns and adding
`min-width:0`/`overflow:hidden`/`text-overflow:ellipsis` to the button. Result,
measured via `getComputedStyle`: `.pool-cta-section`'s rendered box stayed at
`width: 111.766px` (its own max-content) even though `getComputedStyle(card)
.gridTemplateColumns` correctly reported the squeezed track at `92.1562px` — the
section's `justify-self: end` was sizing the box to its OWN preferred width regardless
of the resolved track, so it kept overflowing left onto the TVL track exactly as
before, just on the opposite side. Removing `justify-self: end` (letting the item
default to `stretch`) was the fix — confirmed the section's rendered width then
tracked the resolved track exactly (`92.1562px` both ways). This is recorded because
it is the clearest instance in this item of the spec's own warning: "MEASURE it, do
not assume the browser resolves it the way you expect."

### Dead rules — measured, then removed

Two rules from an earlier draft were kept only long enough to measure that they did
nothing, then removed rather than shipped as unprovable/inert code:

1. **`.pools-list .pool-apy-section { min-width: 110px }`** (candidate (a) from the
   spec, applied symmetrically to both APY and TVL sections). Measured effect: **none**,
   for either purpose. With `.pools-list .pool-card`'s tracks already `40px
   minmax(0,1fr) auto auto 120px`, track 3's own floor is a no-op because track 3's
   right edge is anchored by tracks 4+5 (both fixed or floored), not by its own
   minimum: removing the floor shrank track 3's WIDTH (110px → 61.4px, matching
   `.pool-apy-hero`'s realistic content) but left its RIGHT edge unchanged (457px both
   ways, `.pool-apy-section` and `.pool-cta-section` unaffected) — a direct consequence
   of column2 being the only `fr` track (freed space always flows there, not
   rightward). Confirmed both via `test_card_numeral_wrap.js` (18/18 either way) and
   via the AC-3 measurement script (right edges match to the pixel). Removed.
2. **`.pools-grid .pool-left-section { min-width: 0 }`** (spec's own candidate, meant
   to neutralize the header row's spanning min-content contribution to track 1).
   Measured effect: **none** — `getComputedStyle(card).gridTemplateColumns` was
   byte-identical (`82.8906px 197.109px` @ 1024px, longest-slug fixture) with and
   without the rule, and the header-vs-card-edge geometry (see "What could not be
   done" below) was also byte-identical. Root cause: the actual blocker is TWO flex
   levels up — `.pool-name-group`'s own `min-width: auto` — and a `min-width: 0` on a
   NESTED flex descendant does not retroactively shrink an ancestor's min-content
   query when that ancestor is itself asked for ITS OWN intrinsic size by a
   grandparent. (This is a distinct CSS mechanism from the one `minmax(0, 1fr)`
   solved at the grid-track level pre-fix; the two don't transfer.) Removed.

Both removals are the "smaller diff, weaker unjustified claim removed" move RAZOR
argues for: a rule whose own comment claims a benefit that measurement disproves is
worse than no rule.

## AC-1 outcome

**Latent-not-live**, exactly as `specs/260.md` anticipated as an acceptable outcome.
The live worst-total-APY pool (zeebu/BSC, 394,208.17%) DOES exceed its 110px track
(132.05px vs 110px, 22.05px overflow) but its 11-character byline ("zeebu · BSC") is
far too short to reach the spilled region (164px gap) — no collision, pre-fix or
post-fix. The positive control (57-char slug × `apyBase: 9999999.99`, the verifier's
own reproduction magnitude) DOES reproduce the collision pre-fix (26.05px overlap,
768px, both themes) and is fully closed post-fix (see AC-2).

## AC-2 outcome — PASS, leg B shipped, no exclusion retained

`node test_card_numeral_wrap.js` is green (18/18) with the widened neighbour set — the
`.pool-cta-section` exclusion at the old `test_card_numeral_wrap.js:304` is REMOVED
(`const allEls = Array.from(card.querySelectorAll('*'));`, no filter). Additionally,
the officially shipped fixture population now DIRECTLY exercises the exact instance-(i)
repro pairing: `usdc-daypreview-glitch`'s `project` was relabeled from the placeholder
`'glitch-farm'` to `LONGEST_PROJECT_SLUG` (same 57-char slug `usdc-poly-aave` carries
at a realistic APY), keeping its existing anomalous `apyBase: 9999999.99` — this is the
literal long-slug × anomalous-magnitude pairing that collided pre-fix. Non-vacuity
transcript below shows this pairing goes RED pre-fix and GREEN post-fix inside the
shipped test file itself, not only in the scratch script.

## AC-3 outcome — PASS

Methodology: `measure.js` (scratch, not shipped) captures every numeral/text/CTA
`getBoundingClientRect()` for the SAME 3-pool "normal" fixture (no anomalous/stress
pools) across list 360/768/1280 and grid 360/768/1280/1540, before (git-stashed clean
`style.css`) and after (shipped `style.css`), 1700ms settle wait added specifically
because the first naive before/after diff showed ~0.3-0.9px noise traced to
`AnimatedNumber`'s 1200ms+delay count-up not having finished — after adding the
settle wait, the diff is **exactly 0px** for every list-view numeral cell right edge
across all three list viewports, and for every grid-view numeral/context/CTA text
element across all four grid viewports. The only rects that moved between before/after
are `.pool-tvl-section`'s own WRAPPER box in GRID view (an implementation-detail
container, not the numeral text itself) — expected and correct, since leg B changed
which grid track that wrapper occupies; `.tvl-value`'s own text box inside it did not
move. No horizontal page scroll (`scrollWidth <= innerWidth`) at 360/768/1280/1540 in
either view, for the normal fixture AND for both stress fixtures (long-slug ×
anomalous, TVL-glitch) — confirmed via the same script's `pageOverflow` field, all
`false`.

## AC-4 outcome — PASS

Added to `test_card_numeral_wrap.js`'s `SCAN_FN` (new check, labeled H in the header
comment): for every numeral cell, `getComputedStyle(el).textOverflow !== 'ellipsis'`.
Green across all 16 view×theme×viewport combinations post-fix. Verified this assertion
is not vacuous the same way as the others (Trial 9 below: neutering the CTA button's
`text-overflow: ellipsis` rule doesn't trip THIS specific assertion since it's scoped
to numeral cells only — by design, per the spec: "a CTA button label ellipsizing is
fine … and is asserted separately, not here" — the CTA's own ellipsis is proven by the
visual/geometric non-vacuity in Trial 9, not by H).

## Non-vacuity transcript (per shipped rule, separately)

Methodology: `edit style.css` → `npm run minify` (regenerates `style.min.css`, which
`home.html` actually loads) → `node test_card_numeral_wrap.js` → observe → restore →
`npm run minify` → `md5sum style.css style.min.css` to confirm byte-identical restore.
Baseline checksum used for every restore-confirmation below:
`a53a0e48c9ab99a1cea676414d5fd79e style.css` /
`55f0fade9e71aa649c92471f32b3129c style.min.css`.

**Trial 1 — neuter `.pools-list .pool-card`'s `grid-template-columns`** (reverted to
`40px 1fr 110px 130px 120px`):
```
✗ list/light/768px: card[8] .pool-apy-hero "⚠ 9,999,999.99%" overlaps .pool-context-inline
                     "hamilton-lane-senior-credit-opportunities-securitize-fund · Ethereum"
✗ list/dark/768px:  (identical)
numeral cells scanned: 360
✓ 16/18 card-numeral-wrap assertions passed
```
Restored; checksums matched.

**Trial 2 — neuter `.pool-columns`'s `grid-template-columns`** (same revert, header
label row only):
```
✓ 18/18 card-numeral-wrap assertions passed  (UNCHANGED — see "Left uncovered" below)
```
This rule's non-vacuity CANNOT be shown via this guard — `.pool-columns` is a sibling
row outside any `.pool-card`, and check E only compares elements WITHIN the same
`.pool-card`. Its actual job (keeping header labels aligned with the now-`auto`-sized
data-row tracks) is a visual-alignment concern this file's population never touches.
Restored; checksums matched.

**Trial 3 — neuter `.pools-list .pool-apy-section`'s `min-width: 110px`** (before
removal — this trial is why it was removed, see "Dead rules"): stayed 18/18 green AND
the AC-3 script showed the hero's right edge unchanged (457px both ways) — proved
inert for both purposes, then deleted from the shipped CSS rather than kept.

**Trial 4 — neuter `.pools-list .pool-tvl-section`'s `min-width: 130px`** (before
confirming it WAS necessary — this trial is why the mirror-symmetric assumption from
Trial 3 was wrong): stayed 18/18 green via `test_card_numeral_wrap.js`, but the AC-3
script showed `.pool-apy-hero`'s right edge DRIFT from 457px to 530.95px (a 73.95px
shift) — this floor protects the APY hero's position, not its own section's position
(see "Dead rules" / the shipped comment at `style.css:2892-2910` for the full
conservation-equation explanation). This is the one shipped rule whose non-vacuity
proof lives OUTSIDE `test_card_numeral_wrap.js` entirely.

**Trial 5 (renumbered from the above; the shipped `.pool-tvl-section` floor,
re-confirmed on the FINAL shipped CSS after the dead-rule removal):**
```
node test_card_numeral_wrap.js: 18/18 green (unchanged)
measure.js AC-3 script: hero right edge 457px -> 530.953125px (drift confirmed again)
```
Restored; checksums matched.

**Trial 6 — neuter `.pools-grid .pool-card`'s `grid-template-columns`** (reverted to
`minmax(0, 1fr) auto`):
```
✗ grid/light/1280px, grid/light/1540px, grid/dark/1280px, grid/dark/1540px:
    card[0] .tvl-value "$950000000.0B" overlaps .calculate-yield-btn-new "View & calculate →"
numeral cells scanned: 306
✓ 14/18 card-numeral-wrap assertions passed
```
Restored; checksums matched.

**Trial 7 — neuter `.pools-grid .pool-left-section`'s `min-width: 0`** (before
removal — see "Dead rules"): `test_card_numeral_wrap.js` stayed 18/18 green either
way, AND `getComputedStyle(card).gridTemplateColumns` was byte-identical
(`82.8906px 197.109px`) with the rule present vs. `min-width: auto` — proved fully
inert, then deleted.

**Trial 8 — neuter `.pools-grid .pool-cta-section`'s `justify-content: flex-end;
min-width: 0` (reverted to the pre-fix `justify-self: end; justify-content:
flex-end`)**:
```
✗ grid/light/1280px, grid/light/1540px, grid/dark/1280px, grid/dark/1540px:
    card[0] .tvl-value "$950000000.0B" overlaps .calculate-yield-btn-new "View & calculate →"
numeral cells scanned: 306
✓ 14/18 card-numeral-wrap assertions passed
```
Restored; checksums matched.

**Trial 9 — neuter `.pools-grid .pool-cta-section .calculate-yield-btn-new`'s
`min-width: 0; display: block; overflow: hidden; text-overflow: ellipsis;`** (kept
`white-space: nowrap`, which is redundant with the sibling rule and doesn't change
computed style alone):
```
✗ grid/light/1280px, grid/light/1540px, grid/dark/1280px, grid/dark/1540px:
    card[0] .tvl-value "$950000000.0B" overlaps .calculate-yield-btn-new "View & calculate →"
numeral cells scanned: 306
✓ 14/18 card-numeral-wrap assertions passed
```
Restored; checksums matched.

**Widened-neighbour-set non-vacuity** (mandatory measurement 4, shipped CSS in place,
no stylesheet edit — a scratch script duplicating `SCAN_FN`'s exact logic, run against
the REAL shipped page): grid view, first card, `.calculate-yield-btn-new` translated
via inline `element.style.transform` onto its own card's `.tvl-value` box.
```
STEP 1 (baseline): GREEN
STEP 2 (mutated -- .calculate-yield-btn-new translated onto .tvl-value): RED
  card[0] .tvl-value "$40.0M" overlaps .calculate-yield-btn-new "View & calculate →"
STEP 3 (mutation removed): GREEN
```
RED explicitly NAMES `.calculate-yield-btn-new` — the exact class the OLD (246-shipped)
exclusion could never see. `git diff --stat style.css` was empty throughout this step
(scratch script, no stylesheet touched).

## Leg B: shipped, not abandoned

Leg B shipped in full. No `.pool-cta-section` exclusion remains in the guard.

## Test results (verbatim, timeboxed at 5 min foreground each)

- `node test_card_numeral_wrap.js` → **18/18 passed**, 414 numeral cells scanned.
  Printed derivations: `hamilton-lane-senior-credit-opportunities-securitize-fund`
  (57 chars, unchanged from 246), `zeebu / BSC @ 394208.17%` (new, spec 260 AC-1).
- `node test_list_default.js` → **3/3 passed**.
- `node test_list_polish.js` → first TWO attempts timed out on `page.goto`/
  `page.reload` with `waitUntil: 'load'` (exact sandbox flakiness the file's own header
  comment warns about — not modified by this item); third attempt (and a subsequent
  clean-HEAD re-run for the pre-existing check below) → **6/6 passed**. Re-ran once
  more after the dead-rule cleanup to be safe → **6/6 passed** again.
- `node test_test_registry.js` → **5/5 passed**.
- `node test_minified_assets.js` → **9/9 passed** (all 7 minified artifacts
  byte-identical to a fresh minify; only `style.min.css`'s SOURCE changed this item,
  the other 6 are unaffected and still match).
- `node test_css_minified_render.js` → **2/2 passed**.
- `node run-tests.js --lane=plain --timeout=90` → completed well within the timebox.
  **55 pass / 1 fail** (56 files selected for the plain lane): the one failure is
  `test_translations_number_format.js`.

### Pre-existing-failure re-confirmation (not inherited from 246-notes)

Per instruction, did NOT inherit 246-notes' claim that both
`test_translations_number_format.js` AND `test_vercelignore.js` were failing on
`main` — re-ran both against a git-stashed clean HEAD this session:

- `test_translations_number_format.js`: **FAILS identically on clean HEAD** (same
  `[] vs []`-shaped diff, exit 1). Confirmed pre-existing, unrelated to this item
  (touches only `style.css`/`style.min.css`/`test_card_numeral_wrap.js`, none of which
  this test exercises).
- `test_vercelignore.js`: **PASSES on clean HEAD** (155/155 assertions, exit 0) — this
  is a CORRECTION to 246-notes' claim, not a re-confirmation of it. Whatever caused it
  to fail at 246's merge no longer reproduces in this session's checkout (possibly a
  `.vercelignore`/file-count drift fixed by an intervening commit — not investigated
  further, out of this item's scope). It also passes with this item's changes applied.
  Reported here exactly as measured, per the instruction not to inherit an unconfirmed
  claim.

No other failures anywhere in the full plain-lane run.

## Class statement

*If this exact defect (a numeral cell's box exceeding its grid track, spilling onto a
sibling) appeared in a different member of the same population tomorrow, would
anything catch it?*

**Inside `.pool-card`, in the SAME collision shape (numeral vs. any element of the same
card): yes, unconditionally.** `test_card_numeral_wrap.js`'s check E derives its
neighbour set from the RENDERED DOM (every leaf text element, no class exclusion as of
this item) — a third numeral-vs-anything collision mechanism inside `.pool-card`,
should one appear, is caught by the SAME guard without a new hardcoded case. This is
the concrete improvement this item makes to the class the guard covers: the
`.pool-cta-section` blind spot 246 shipped is gone.

**Outside `.pool-card`: no, nothing here catches it — same boundary specs/260.md
already named, with the number restated.** The guard's population is `.pool-card`
only. The planner (`planner.js`/`plan.html`), the pool-detail page body
(`PoolDetail.js`), and the generated token/chain/pool pages (~4,400 static pages per
CLAUDE.md) render numerals under different classes/components entirely and are
covered by nothing in this file. Not ticketed as a new item — no evidence of a live
defect there, per RAZOR's "ship the narrow fix and state the class it leaves open with
a number."

**A THIRD thing left open, found DURING this item's own measurement (new since
specs/260.md was written) — the header-row-vs-card-edge overflow.** In GRID view, a
long project slug (currently only the 57-char `hamilton-lane-…-fund` slug reaches it)
paired with grid cards narrow enough (measured at 1024/1100/1280px, 4-column auto-fill
width) causes `.pool-name-group` (icon + symbol + byline) to render at its own
max-content width (437.6px measured) regardless of the header's actual available width
(288px measured) — a PRE-EXISTING defect (confirmed byte-identical on clean `main`,
not introduced by this item) that neither the shipped fix nor the widened guard
touches:
- Not a NEW defect: `.pools-grid .pool-card`'s OLD template (`minmax(0, 1fr) auto`)
  only ever protected the GRID TRACK's own minimum sizing from this contribution — it
  never protected the INTERNAL flex layout inside `.pool-header-new`, which has its own
  separate, unrelated overflow mechanism (a flexbox "automatic minimum size" chain that
  needs `min-width: 0` at EVERY nested flex level between the shrinking content and the
  ancestor doing the intrinsic-size query — `.pool-left-section`'s min-width:0 alone,
  which this item tried and measured inert, does not reach far enough up that chain to
  matter; see "Dead rules").
- Not caught by the widened guard: the overflowing elements (`.pool-context-inline`,
  `.pool-apy-hero`) sit ADJACENT to each other (butted together, not overlapping check
  E's pairwise-intersection test), and `.pool-card`'s own `overflow: hidden`
  (pre-existing, `style.css` general `.pool-card` rule) absorbs the excess before it
  becomes a page-level horizontal scroll (check C never fires either). The content is
  visually clipped hard at the card's own edge with no ellipsis — a real rendering
  defect, invisible to every check in this file.
- Scope, with the number: reachable ONLY by the single 57-character slug currently in
  the live snapshot (`aerodrome-slipstream`, the longest slug among today's 21
  anomalous-APY pools, is only 20 chars and does not reach it) at grid-view card widths
  <=~1280px. Not one of the two named instances in `specs/260.md`; not fixed here, not
  silently swallowed by a rule that claims to fix it (the tried rule was removed
  specifically because it does not). Recorded here, not ticketed, per the same RAZOR
  instruction as the ~4,400-page boundary above — no evidence this is hitting live
  traffic today, but the mechanism is real and durable.

## What could not be done

Nothing in the required test list was skipped or left unresolved. Two deviations from
a literal-first-pass build, both already folded into the sections above rather than
hidden:

1. Two of the four min-width floor rules the spec's candidate (a) suggested (one per
   list-view section, one for grid-view's header neutralization) were shipped in a
   first draft, then MEASURED (per the spec's own repeated instruction) to do nothing,
   and removed. This is not a shortfall against the spec — "MEASURE it, do not assume"
   is precisely what produced this outcome, and RAZOR prefers the smaller, honestly
   justified diff over keeping unprovable rules for symmetry with the spec's own
   candidate text.
2. The pre-existing grid-view header-overflow defect (see "Class statement" above) was
   found while verifying the spec's OWN warning about `.pools-grid .pool-left-section`
   ("MEASURE that the card does not overflow with the 57-char-slug fixture pool") —
   the card does not PAGE-overflow (measured, `pageOverflow: false` throughout), but
   its HEADER internally does, pre-existing and out of this item's two-instance scope.
   Not fixed (would require touching `.pool-name-group`, a shared component used by
   both grid and effectively-inert-in-list-view via `display:contents`, and is a
   distinct mechanism from either of this item's two instances — a new item's worth of
   scope, not a leg-B footnote).

## Deviations from the spec, recorded as data

- **`DEFAULT_MIN_TVL` discrepancy.** CLAUDE.md and `specs/260.md` both state the floor
  is "$10M" (specs/260.md: "TVL of that fixture must be >= $10M (DEFAULT_MIN_TVL) or
  trust-rail filtering hides it"). The actual constant in `app.js:801` is
  `const DEFAULT_MIN_TVL = 100000; // $100K default floor`. This item did not change
  that constant (out of scope, not touched) — new/relabeled fixture pools in this
  item's changes to `test_card_numeral_wrap.js` were all given TVL >= $10M anyway (the
  stricter of the two values), so this discrepancy never affected what was built or
  tested. Flagged here because CLAUDE.md is supposed to be authoritative and isn't, for
  this one constant.

## Files changed

- `style.css`: 111 lines changed (`git diff --stat`), two grid-template-columns
  changes + one surviving min-width floor + one grid `justify-self`/`min-width` change
  + one CTA-button display/overflow/ellipsis change, each with an inline comment citing
  this item and, where relevant, the measurement that justified or killed it.
- `style.min.css`: regenerated via `npm run minify` after every `style.css` edit
  throughout this session (never hand-edited).
- `test_card_numeral_wrap.js`: 170 lines changed (`git diff --stat`) — widened
  neighbour derivation (exclusion removed), new AC-4 check (H), new
  `WORST_LIVE_APY_POOL` derivation + fixture pool, `usdc-daypreview-glitch` relabeled
  to directly exercise the instance-(i) repro pairing in the shipped green suite, and
  the file's header comment rewritten to describe the new coverage boundary.
- `product-loop-kit/specs/260-notes.md`: this file (new).

## Attempt 2 (verifier findings 1-4)

The attempt-1 verifier returned FAIL with four findings. All four are addressed below.
Every number in this section was re-measured against attempt-2's own tree — none of
attempt 1's numbers were carried over or assumed to still hold, per the build
instructions.

### Finding 1 — leg B abandoned (operator decision, not re-argued)

The operator's ruling: leg B's grid-view CSS change (attempt 1's
`.pools-grid .pool-card` template swap + `.pool-cta-section`
`justify-self`/`min-width` change + the CTA button's ellipsis rules) moved the
`.pools-grid` closing-line hairline boundary — a "Quiet" design-system separator
rendered on every card of the analytics grid, the surface every `?token=`/`?chain=`
sitemap URL serves — by up to 89px @360, 497px @768, ~46px @1280/1540, on completely
NORMAL (non-anomalous) cards, in both themes. That is a visible design regression
that was never in the spec's Change section and never got the human screenshot-review
the standing 2026-08-05 decision requires for design changes. It was traded for a fix
to instance (ii), which is unreachable from live data (0 of 7,334 live pools; max live
TVL $17,707,651,767 → `formatCurrency` renders "$17.7B", 6 characters, nowhere near a
CTA). The spec's own Change section pre-authorized exactly this outcome ("if leg B has
no CSS remedy that satisfies the constraints, ship leg A, state leg B open with the
number, and do NOT widen the guard's neighbour set past what stays green").

**What was done:**

1. `style.css`'s `.pools-grid .pool-card`, `.pools-grid .pool-cta-section`, and
   `.pools-grid .pool-cta-section .calculate-yield-btn-new` were reverted, rule body
   for rule body, to their `6a5092661b` (pre-260) text — `grid-template-columns:
   minmax(0, 1fr) auto` restored, `justify-self: end` restored, `min-width: 0` /
   `display: block` / `overflow: hidden` / `text-overflow: ellipsis` / `white-space:
   nowrap` all removed from the CTA button rule. Verified byte-for-byte: `awk` extraction
   of each rule body from both `git show 6a5092661b:style.css` and the final
   `style.css` diffed to empty (`diff` exit 0) for all three selectors.
2. `test_card_numeral_wrap.js`'s check-E neighbour derivation had the
   `!el.closest('.pool-cta-section')` exclusion RESTORED (it was removed in attempt 1).
   The file's header comment was rewritten: a new "Leg B: ABANDONED" section states the
   operator's reasoning, the measured pixel numbers, the live-reachability number, and
   that instance (ii) is reproduced-not-fixed-not-guarded; the "Coverage boundary of
   check E" section was rewritten to name the `.pool-cta-section` blind spot explicitly
   instead of claiming "NO class exclusion remains"; the inline comment beside the
   restored `el.closest('.pool-cta-section')` line explains why in ~12 lines, pointing
   here for the full pixel numbers.

**Proof the CSS revert is real** (`git diff 6a5092661b -- style.css`, reproduced in
full below under "git diff confirmation"): the diff touches ONLY `.pool-columns`,
`.pools-list .pool-card`, and the new `.pools-list .pool-tvl-section` media-query
block — all three are leg-A, list-view-only. Zero lines of the diff touch any
`.pools-grid` selector.

**Proof grid view is now pixel-identical to pre-260 `main`** (AC-3, re-run for BOTH
views this attempt — see "AC-3 re-measurement" below): 0px drift across all 16
view×theme×viewport combinations on a normal (non-anomalous) 5-pool fixture, both list
and grid.

**Proof instance (ii) still genuinely reproduces (not a phantom the exclusion is
hiding for nothing):** with the shipped `.pool-cta-section` exclusion temporarily
deleted from a scratch copy of the check, the shipped `usdc-tvl-glitch` fixture pool
(`tvlUsd: 950e15` → `.tvl-value` "$950000000.0B") overlaps
`.calculate-yield-btn-new` "View & calculate →" at grid/light/1280px,
grid/light/1540px, grid/dark/1280px, grid/dark/1540px — 4/18 assertions fail, exactly
instance (ii)'s named footprint. Restoring the exclusion returns the suite to 18/18.
Full transcript below under "Non-vacuity — leg B reproduction (unguarded, by design)".

### Finding 2 — fixture population gap, fixed (not just documented)

Root cause, confirmed empirically (not by TVL arithmetic — the spec's own warning):
`itemsPerPage` is 9 (`app.js:929`); default sort is TVL-desc EXCEPT 0-yield pools sort
after EVERY yielding pool in the fixture regardless of their own TVL
(`app.js:2003-2008` for the flagship/default view, `app.js:2193-2196` for the
token/chain-filtered view this test actually drives) — so raising a 0-yield fixture's
TVL can never move it onto page 1 while 9+ yielding pools exist ahead of it; only
shrinking the total yielding-pool count does that.

Attempt 1's 11-pool fixture had 10 yielding pools + 1 zero-yield pool
(`usdc-base-collateral`), so the zero-yield pool was permanently rank 11 (off page 1)
no matter its TVL, and the near-zero yielding pool (`usdc-near-zero`, lowest TVL among
the 10 yielding) was rank 10 (also off page 1). `.pool-apy-tag` (rendered only by a
0-yield pool) was scanned zero times across the whole 18-assertion run, despite the
file's header comment claiming the scan "enumerates every numeral cell that exists in
every rendered `.pool-card`".

**Fix:** the fixture was cut from 11 pools to exactly 9 (== `itemsPerPage`), so ALL of
them render on page 1 with no ranking arithmetic needed. The two interchangeable plain
`aave-v3` fillers (`usdc-opt-aave`, `usdc-avax-aave`) were removed outright — their
only job was padding the `[4,4,1]` grid-row count, which `usdc-near-zero` and
`usdc-base-collateral` now do instead. Every stress fixture
(`usdc-anomaly`, `usdc-poly-aave`, `usdc-worst-live-apy`, `usdc-daypreview-glitch`,
`usdc-tvl-glitch`) is kept verbatim (same id/TVL/APY), plus the two remaining plain
fillers (`usdc-eth-morpho`, `usdc-arb-aave`).

**Rendered page-1 roster** (printed by the test's own `console.log`, real DOM order —
not derived on paper):

```
rendered page-1 roster (9 cards):
  [0] USDC — glitch-vault · Ethereum              (usdc-tvl-glitch, TVL 950e15 — rank 1, huge TVL)
  [1] USDC — aave-v3 · Arbitrum                    (usdc-arb-aave, 70M)
  [2] USDC — morpho-blue · Ethereum                (usdc-eth-morpho, 55M)
  [3] USDC — hamilton-lane-…-fund · Polygon        (usdc-poly-aave, 30M, LONGEST_PROJECT_SLUG @ realistic APY)
  [4] USDC — weird-farm · Ethereum                 (usdc-anomaly, 20M, APY 36,452.38% anomalous)
  [5] USDC — zeebu · BSC                           (usdc-worst-live-apy, 18M, live-worst APY 394,208.17%)
  [6] USDC — hamilton-lane-…-fund · Ethereum       (usdc-daypreview-glitch, 15M, LONGEST_PROJECT_SLUG @ anomalous APY — the instance-(i) repro pairing)
  [7] USDC — quiet-vault · Ethereum                (usdc-near-zero, 12M, APY 0.01% — smallest realistic .pool-apy-preview magnitude)
  [8] USDC — some-lend · Base (0-yield, .pool-apy-tag)   (usdc-base-collateral, 0-yield, sorts last unconditionally)
```

All 9 fixture pools render; nothing is off-page (the fixture has no 10th pool).

**Per-class scan counts across all 16 view×theme×viewport combinations of the main
listing page** (printed by the run):

```
.pool-apy-hero=144  .pool-apy-preview=112  .pool-apy-tag=14  .tvl-value=144
```

All four `NUMERAL_CLASSES` are now non-vacuously scanned; `.pool-apy-tag` (14
observations, one 0-yield card × 16 combinations minus the 2 mobile-360 combinations
where `.pool-apy-tag` is `display:none` in the `<768px` re-templated row) went from 0
to 14.

**New enforcement, not just a printed number:** `main()` now sums `classCounts` across
every `runScanAssertion` call into a run-level `RUN_CLASS_COUNTS`, and after the whole
run asserts every one of the 4 `NUMERAL_CLASSES` has a nonzero count — printing
`✗ NUMERAL_CLASS_COVERAGE: class(es) never scanned...` and setting `process.exitCode = 1`
if any class is still unobserved. This makes a future regression of this exact kind
(a fixture reshuffle that silently drops a class off page 1) fail the gate instead of
passing with partial, unstated coverage.

### Finding 3 — false/excessive comments, corrected

- The false claim that the header-row guard "now lives on `.pools-grid
  .pool-left-section`'s `min-width: 0` below" is GONE — the entire leg-B comment block
  it lived in was deleted along with the leg-B CSS revert (Finding 1).
- The ~22-line orphaned narration about the never-shipped `.pools-grid
  .pool-left-section { min-width: 0 }` candidate rule is GONE (same revert).
- The `.pools-list .pool-tvl-section` min-width-floor comment was trimmed from 19
  lines to 4 lines + a pointer to `specs/260-notes.md` for the full conservation-
  equation derivation and dead-rule trials (which already live in this file's "Dead
  rules" section above, unchanged from attempt 1).
- Bonus (found while re-reading, not explicitly named in finding 3 but the same class
  of defect): the `.pool-columns` and `.pools-list .pool-card` comments both claimed a
  min-width floor exists on "`.pool-apy-section`/`.pool-tvl-section`" — false, only
  `.pool-tvl-section` ever got a floor (the `.pool-apy-section` floor was tried and
  measured inert in attempt 1's "Dead rules," never shipped). Both comments corrected
  to name only `.pool-tvl-section`.
- Every remaining `style.css` comment for this item is now 2-6 lines, matching the
  surrounding house style, with a pointer to `specs/260-notes.md` for anything longer.

### Finding 4 — risk tier: HIGH (was mis-declared LOW in the spec's own builder's-guess)

Product diff, re-measured on the final attempt-2 tree (`git diff 6a5092661b`,
excluding this notes file and the new `260-pr.md`, since those are documentation, not
product code):

```
style.css                 |  21 insertions(+), 3 deletions(-)   = 24 lines
style.min.css              |   1 insertion(+), 1 deletion(-)     = 2 lines (generated)
test_card_numeral_wrap.js |  226 insertions(+), 74 deletions(-)  = 300 lines
--------------------------------------------------------------------------
total product diff                                               = 326 lines
```

326 > 150 (the LOW-tier cap, `NORTH_STAR.md` risk policy) → **HIGH**. The item also
edits shared `.pools-list .pool-card`/`.pool-columns` grid templates on the
parameterized-URL render path (every `?token=`/`?chain=` SEO page), an independent
HIGH trigger per the same policy ("`home.html` IA router... and any parameterized-URL
behavior"). `product-loop-kit/specs/260-pr.md` was written per the HIGH-tier
requirement: full explainer + 5-question quiz, answers base64-encoded at the bottom.

### AC-3 re-measurement, both views (Finding 1's mandate)

Methodology: a scratch Playwright script (`measure_ac3.js`, not shipped — lived in the
session scratchpad, mirrors attempt-1's `measure.js` pattern) captures every numeral
cell's `getBoundingClientRect()` plus `.pool-tvl-section`/`.pool-cta-section`'s own
rects, for a NORMAL (non-anomalous) 5-pool fixture (aave-v3/morpho-blue realistic
TVLs/APYs, no stress/anomalous pools), across list+grid views × light+dark themes ×
360/768/1280/1540px, with a 1800ms settle wait for `AnimatedNumber` count-ups (per
attempt-1's finding that <1700ms produces 0.3-0.9px animation noise). Run twice:
once against a clean `git worktree` checked out at `6a5092661b`, once against the
final attempt-2 tree.

```
compared 390 cell-rects across 16 view/theme/viewport combinations
max drift observed: 0.000px
✓ ALL RECTS EQUAL WITHIN 1px
```

Zero drift across BOTH views this time (attempt 1 could only claim this for list view
plus grid-view TEXT elements, with the `.pool-tvl-section` WRAPPER box in grid view
moving as an accepted implementation-detail consequence of leg B; with leg B fully
reverted, the wrapper box itself is now included in the capture and is ALSO 0px drift
— full pixel identity, which is the entire point of the revert). No horizontal page
scroll at any viewport in either view, for the normal fixture and both stress
fixtures (long-slug × anomalous, TVL-glitch) — confirmed via `test_card_numeral_wrap.js`
check C, 18/18 green.

### Non-vacuity — leg-A rules (re-run on attempt-2's tree; each rule neutered
separately, `npm run minify` before and after every trial, `md5sum` confirms
byte-identical restore)

Baseline checksums used for every restore-confirmation below:
`757b9b66913512e375ed99445e01ba2f style.css` /
`61ae8c69da48b222ad2d4554667ca692 style.min.css`.

**Trial 1 — neuter `.pools-list .pool-card`'s `grid-template-columns`** (reverted to
`40px 1fr 110px 130px 120px`):
```
✗ list/light/768px: card[6] .pool-apy-hero "⚠ 9,999,999.99%" overlaps .pool-context-inline
    "hamilton-lane-senior-credit-opportunities-securitize-fund · Ethereum"
✗ list/dark/768px:  (identical)
numeral cells scanned: 360
✓ 16/18 card-numeral-wrap assertions passed
```
Restored; `md5sum style.css style.min.css` matched the baseline above.

**Trial 2 — neuter `.pool-columns`'s `grid-template-columns`** (same revert, header
label row only):
```
✓ 18/18 card-numeral-wrap assertions passed  (UNCHANGED, as attempt 1 found — this
  rule's non-vacuity cannot be shown via this guard; it is a sibling row outside any
  `.pool-card`)
```
Restored; checksums matched.

**Trial 3 — neuter `.pools-list .pool-tvl-section`'s `min-width: 130px`:** stayed
18/18 green via `test_card_numeral_wrap.js` (this guard cannot see it, same as attempt
1), but the AC-3 scratch script showed real drift when diffed against the shipped
(floor-intact) capture:
```
compared 390 cell-rects across 16 view/theme/viewport combinations
max drift observed: 73.953px
✗ 150 property-drift(s) exceeding 1px
  e.g. list/dark/1540 card[0] .pool-apy-hero.left: base=1005.83 final=1079.78 drift=73.95px
```
Matches attempt 1's Trial 4/5 measurement (73.95px) exactly. Restored; checksums
matched.

### Non-vacuity — leg B reproduction (unguarded, by design)

With the shipped `.pool-cta-section` exclusion temporarily deleted (a one-line
comment-out, no other change) from `test_card_numeral_wrap.js`'s check E:
```
STEP 1: exclusion removed → RUN
✗ grid/light/1280px, grid/light/1540px, grid/dark/1280px, grid/dark/1540px:
    card[0] .tvl-value "$950000000.0B" overlaps .calculate-yield-btn-new "View & calculate →"
numeral cells scanned: 306
✓ 14/18 card-numeral-wrap assertions passed
STEP 2: exclusion restored → RUN
✓ 18/18 card-numeral-wrap assertions passed
```
Confirms instance (ii) is a real, reproducible collision in the shipped page — the
exclusion is genuinely hiding a live defect-shape, not a dead no-op — and that
restoring the exclusion returns the shipped suite to green.

### git diff confirmation (Finding 1's mandate)

`git diff 6a5092661b -- style.css` — full text, 24 lines changed, ALL inside leg-A
(list-view) selectors (`.pool-columns`, `.pools-list .pool-card`, the new
`.pools-list .pool-tvl-section` media-query block). Zero touches to any
`.pools-grid`-prefixed selector. `awk`-extracted rule bodies for
`.pools-grid .pool-card`, `.pools-grid .pool-cta-section`, and
`.pools-grid .pool-cta-section .calculate-yield-btn-new` diffed to empty against
`git show 6a5092661b:style.css`.

### Test results, re-run on attempt-2's tree (verbatim, timeboxed at 5 min foreground
each)

- `node test_card_numeral_wrap.js` → **18/18 passed**, 414 numeral cells scanned,
  per-class counts `.pool-apy-hero=144 .pool-apy-preview=112 .pool-apy-tag=14
  .tvl-value=144`, `✓ NUMERAL_CLASS_COVERAGE: all 4 numeral classes scanned at least
  once`.
- `node test_list_default.js` → **3/3 passed**.
- `node test_list_polish.js` → first two attempts crashed on `page.goto`/`page.reload`
  `Timeout 20000ms exceeded` (the same pre-existing sandbox flakiness attempt 1's
  header comment warns about, unrelated to this item — neither attempt touched this
  file); third attempt → **6/6 passed**.
- `node test_test_registry.js` → **5/5 passed**.
- `node test_minified_assets.js` → **9/9 passed**.
- `node test_css_minified_render.js` → **2/2 passed**.
- `node run-tests.js --lane=plain --timeout=90` → **55 pass / 1 fail** (56 files),
  well within the 90s-per-file timebox. The one failure is
  `test_translations_number_format.js`.

**Pre-existing-failure re-confirmation** (per instruction, re-checked against a clean
`6a5092661b` worktree rather than inherited from attempt 1's claim):
`test_translations_number_format.js` **FAILS identically on clean `6a5092661b`**
(`+ ]` / `- []`-shaped diff, exit 1) — confirmed pre-existing, unrelated to this item
(this item's changes touch only `style.css`/`style.min.css`/`test_card_numeral_wrap.js`,
none of which that test exercises). No other failures anywhere in the plain-lane run.

### Class statement, rewritten (Finding 1's mandate — say plainly what is guarded and
what is not)

**Inside `.pool-card`, EXCLUDING `.pool-cta-section`: yes, unconditionally.**
`test_card_numeral_wrap.js`'s check E derives its neighbour set from the rendered DOM
— any passive-text element of the card (byline, symbol, or a future text element) that
a numeral cell intersects turns the gate red, with no hardcoded case needed.

**Inside `.pool-card`, WITHIN `.pool-cta-section`: no.** This is instance (ii)'s exact
footprint (`.tvl-value` × `.calculate-yield-btn-new`, grid view, 1280/1540px, both
themes) and it is REPRODUCED-NOT-FIXED-NOT-GUARDED, by explicit operator decision
(Finding 1). The number: **0 of 7,334 live pools can reach it** (max live TVL
$17,707,651,767 → "$17.7B", 6 characters — the CTA's own closing-line track has far
more than 6 characters of room under the pre-260 `minmax(0, 1fr) auto` template). The
reason it is open: the only CSS remedy attempt 1 found moved the `.pools-grid`
closing-line hairline on every normal card by up to 497px, an unapproved visible
design regression on the surface every `?token=`/`?chain=` SEO URL renders — not a
trade the spec authorized making unilaterally. If a future live pool's TVL ever
approaches $17.7B-plus-margin territory (durability defect, item 122's precedent: a
garbage-magnitude TVL-shaped number DID render on this product once), this exact
collision reappears, unguarded, exactly as documented here.

**Outside `.pool-card`: no change from attempt 1.** The planner (`planner.js`), the
pool-detail page body (`PoolDetail.js`), and the ~4,400 generated static
token/chain/pool pages render numerals under different classes/components and are
covered by nothing in this file — recorded, not ticketed, per RAZOR, unchanged from
attempt 1's statement.

### What could not be done

Nothing in the required test list was skipped. Leg B — a design-system-approved CSS
remedy for instance (ii) — could not be attempted this session (the operator's
decision was to abandon it, not to try again with different constraints); it remains
open, with the number, exactly as this section states.

## Attempt 3 (verifier finding: header/row column misalignment)

The attempt-2 verifier returned FAIL on exactly one finding (AC-1/AC-2/AC-4 passed by
independent reproduction). This section fixes that finding only — no other file was
touched beyond what closing its guard gap requires.

### The regression

Attempt 2's leg-A fix changed **both** `.pool-columns` (the slim column-label header
row) and `.pools-list .pool-card` (the data rows) from the shared fixed-px template
`40px 1fr 110px 130px 120px` to `40px minmax(0, 1fr) auto auto 120px`, and added
`.pools-list .pool-tvl-section { min-width: 130px }` (`@media (min-width: 768px)`) so a
normal row's track 4 floors back to the header's fixed 130px.

`.pool-columns` and `.pools-list` are **sibling grids** (app.js:3541-3548, two separate
top-level `React.createElement` calls) — the `.pools-list .pool-tvl-section` min-width
floor is scoped to data rows and structurally cannot match `.pool-columns .col-tvl`.
Changing `.pool-columns`'s own track 4 to `auto` therefore let it resolve to the
intrinsic width of the word "TVL" (a handful of px) instead of staying pinned at 130px
like every data row. Track 5 stays fixed at 120px in both grids, which anchors track
4's *right* edge identically either way — that's why the "TVL" label itself didn't
visibly drift — but track 3's right edge (= track 4's left edge − gap) is a function of
track 4's *width*, and track 4's width now differed by ~96-97px between the two grids.
Net effect: the "APY" header label sat **~107px** to the right of the APY numerals it
labels, on completely normal (non-anomalous) rows, at 768px and 1280px, in the default
list view, on every `?token=`/`?chain=` sitemap URL. This shipped as attempt 2's
`style.css`.

### Why neither attempt 1's nor attempt 2's AC-3 methodology caught it

Both attempts' rect-drift comparisons (the "AC-3 re-measurement" sections above)
captured only `.pool-card`'s own numeral-cell rects (`.pool-apy-hero`, `.tvl-value`)
against the baseline worktree's `.pool-card` rects. Neither ever captured
`.pool-columns`'s header-label rects at all — so a change that moved the header's own
track sizing relative to the row's was structurally invisible to that comparison, even
though the spec's own AC-3 wording ("the numerals' right edges — and therefore their
alignment with the `.pool-columns` header labels — must be unchanged") named header
alignment explicitly. `test_card_numeral_wrap.js`'s checks A/B/D/E/H are all
per-numeral-cell or per-card checks too — none of them look outside `.pool-card` at
all, so `.pool-columns` was untested by the committed gate in any attempt through
attempt 2. This is exactly the guard gap the verifier flagged.

### The fix

`.pool-columns` was reverted to its exact baseline (`6a5092661b`) text — both the
`grid-template-columns` value and the doc comment above it:

```diff
 .pool-columns {
   display: grid;
-  grid-template-columns: 40px minmax(0, 1fr) auto auto 120px;
+  grid-template-columns: 40px 1fr 110px 130px 120px;
   column-gap: 12px;
```

`git diff 6a5092661b -- style.css` now contains **zero** `.pool-columns` hunks — the
only remaining diff is `.pools-list .pool-card`'s `auto auto` template and the new
`.pools-list .pool-tvl-section` min-width floor, both leg-A, both data-row-only, exactly
as attempt 2 shipped them. The `.pool-card` rule's doc comment was rewritten (it
previously said "see `.pool-columns` above", which became stale/wrong once
`.pool-columns` stopped changing) to explain the two-grid mechanism standalone.

**The arithmetic, verified by measurement, not assumed:** with `.pool-columns`'s track 4
fixed at 130px again, and a normal data row's track 4 floored to exactly 130px by the
(unchanged) `.pools-list .pool-tvl-section` rule, and track 5 fixed at 120px with equal
12px gaps in both grids, track 4's left edge — and therefore track 3's right edge —
lands at the same x in both grids **regardless of track 3's own content width**,
because track 2 (`minmax(0, 1fr)`) is the sole flexible column and absorbs the
difference: `track2 + track3 = R − track4` where `R` is the fixed total available width
(shared by both grids at any given viewport), so as long as `track4` matches between
header and row, `track3`'s right edge is pinned no matter how track 2/track 3 split the
remainder. This was confirmed with real `getComputedStyle().gridTemplateColumns`
readings (not just rect deltas) on a 768px anomalous-APY row: header
`40px 246px 110px 130px 120px` vs. row `40px 235.141px 120.859px 130px 120px` — track 3
grew by 10.859px, track 2 shrank by the *same* 10.859px, track 4/5 held at 130/120 in
both, and track 3's right edge (420px in both) was untouched.

### Re-measured drift (fresh, per this attempt's own instructions — attempt 2's numbers do not carry over)

A `git worktree` of `6a5092661b` was built and compared against this attempt's tree
using a 3-pool NORMAL (non-anomalous) fixture, covering `.pool-card` numeral cells
**and** `.pool-columns` header labels, list and grid view, all 4 viewports
(360/768/1280/1540), both themes. (First pass showed spurious sub-to-double-digit px
"drift" at the very first-measured combo — traced to `AnimatedNumber`'s mount-time
count-up animation being sampled mid-transition on one of the two independent browser
instances; a 2s settle wait before the first rect read eliminated it, confirming it was
a measurement-timing artifact, not a layout difference.)

**Result: 0.00px drift, every combination, both the header labels and the row
numerals.** Full transcript retained; excerpt:

```
list/light/768 HEADER colApyDrift=0.00 colTvlDrift=0.00
list/light/768 ROW[USDC|aave-v3 · Arbitrum] heroDrift=0.00 tvlDrift=0.00
list/light/1280 HEADER colApyDrift=0.00 colTvlDrift=0.00
list/light/1280 ROW[USDC|aave-v3 · Arbitrum] heroDrift=0.00 tvlDrift=0.00
...
=== SUMMARY (branch vs baseline 6a5092661b, all combos, normal fixture) ===
max |header col-apy right drift|: 0.00px
max |header col-tvl right drift|: 0.00px
max |row pool-apy-hero right drift|: 0.00px
max |row tvl-value right drift|: 0.00px
```

Screenshots (768px and 1280px, both themes, 3 normal rows + 1 anomalous row for
context) confirm this visually — header labels sit directly above their numerals in
every shot:
`/tmp/claude-0/-home-user-defi-garden/f5c4fab3-b010-5c41-8c64-eb76898ed144/scratchpad/260-attempt3-light-768.png`,
`.../260-attempt3-light-1280.png`, `.../260-attempt3-dark-768.png`,
`.../260-attempt3-dark-1280.png`.

### This settles the "was leg A's `.pool-columns` change inert dead code" question — no, it was actively harmful

It was not a no-op. It was the direct cause of the ~107px drift measured above. The fix
is a straight revert, not a modification, precisely because `.pool-columns` never
needed to change in the first place — leg A's actual mechanism (letting a data row's
own track grow to fit an oversized numeral, protected by the `min-width: 130px` floor
so normal rows still match the header) only requires touching `.pools-list .pool-card`
and `.pools-list .pool-tvl-section`. Touching `.pool-columns` was surplus to that
mechanism and broke the very alignment AC-3 exists to protect.

### The anomalous-row trade, stated plainly (not hidden)

On an **anomalous** row (an APY far enough past `APY_SANITY_LIMIT` to overflow track 2
to its 0px floor, or a pool whose TVL string is wide enough to blow past the 130px
floor), `.pool-apy-hero`'s track can grow enough that track 3's right edge shifts away
from the header's fixed 110px-track right edge. In practice, across every row currently
in `test_card_numeral_wrap.js`'s stress fixture — including `usdc-anomaly` (36,452.38%),
`usdc-worst-live-apy` (the real live-snapshot worst pool, zeebu/BSC @ 394,208.17%),
`usdc-daypreview-glitch` (the 57-char longest live project slug paired with
9,999,999.99%), and `usdc-tvl-glitch` (a 950-quadrillion-dollar TVL, "$950000000.0B") —
this trade did **not** manifest: track 2 always had enough slack at 768-1540px to absorb
the growth without hitting its floor, so even every anomalous/glitch row in the fixture
measured 0px header/row drift too (see the check-I run below). The trade is real and
inherent to leg A's design (an even more extreme string, or a narrower viewport, would
exhaust track 2's slack and produce visible drift on that one row) — it is the accepted
cost of leg A never truncating the numeral (AC-4/check H) and never overflowing it into
the byline (the original 246 defect) — but it is not hidden: `test_card_numeral_wrap.js`
now states it explicitly (file header, check I description, and the new "Coverage
boundary of check I" section) and check I deliberately does not assert on anomalous
rows, rather than papering over the trade with a wider tolerance.

### The new check — Check I: header/row column alignment

Added to `test_card_numeral_wrap.js`. For every view×theme×viewport combination where
`.pool-columns` is rendered — **derived from the DOM each run**
(`getComputedStyle(cols).display !== 'none'`), never hardcoded as "only ≥768px" even
though that's where the `@media (max-width: 767px) { .pool-columns { display: none } }`
rule happens to put it — it asserts, for every **non-anomalous** `.pool-card` (a card
whose hero does not also carry the `apy-anomalous` class app.js:3034 adds to the
anomaly-flagged hero — derived from the rendered DOM, not from fixture ids):
`.pool-columns .col-apy`'s right edge === `.pool-apy-hero`'s right edge, and
`.pool-columns .col-tvl`'s right edge === `.tvl-value`'s right edge, within 1px. Grid
view combinations are also exercised (the check self-detects `.pool-columns` isn't in
the DOM there at all — `viewMode !== 'list'` means React never renders it — and asserts
that non-applicability explicitly, rather than skipping the combination silently) and
360px list-view is exercised too (self-detects the `<768px` display:none). A run-total
non-vacuity assertion (`COLUMN_ALIGNMENT_COVERAGE`, mirroring attempt 2's
`NUMERAL_CLASS_COVERAGE` pattern) fails the whole run if check I never actually asserted
on any applicable combination.

**Non-vacuity transcript 1 — re-apply the shipped `.pool-columns` regression:**

```
$ # .pool-columns grid-template-columns: 40px 1fr 110px 130px 120px
$ #                                   -> 40px minmax(0, 1fr) auto auto 120px
$ npm run minify   # style.min.css md5 61ae8c69da48b222ad2d4554667ca692
$ node test_card_numeral_wrap.js
  ✓ list/light/768px: numeral-cell class scan
  ✗ list/light/768px: header/row column alignment (check I)
    list/light/768px: 6 header/row column alignment failure(s) across 12 non-anomalous numeral cells:
    .pool-apy-hero vs .col-apy "2.94%": right=456.78 vs header col right=563.71 -> drift=-106.94px
    .pool-apy-hero vs .col-apy "4.65%": right=456.78 vs header col right=563.71 -> drift=-106.94px
    ...
  ✗ list/light/1280px: header/row column alignment (check I)
    list/light/1280px: 6 header/row column alignment failure(s) across 12 non-anomalous numeral cells:
    .pool-apy-hero vs .col-apy "2.99%": right=929.00 vs header col right=1036.27 -> drift=-107.27px
    ...
  ✗ list/light/1540px / list/dark/768px / list/dark/1280px / list/dark/1540px: same shape, ~-107px
header/row column alignment (check I): 0 non-anomalous numeral cells checked across 0 applicable view x theme x viewport combinations
✗ COLUMN_ALIGNMENT_COVERAGE: check I never asserted on any applicable combination (vacuous, spec 260 attempt-3)
✓ 28/34 card-numeral-wrap assertions passed   [exit code 1]
$ # restore .pool-columns to 40px 1fr 110px 130px 120px
$ npm run minify   # style.min.css md5 024a4f9abb3f75ae7b875906f1e2746c (byte-identical restore)
$ node test_card_numeral_wrap.js   # all 34/34 pass, exit 0
```

Names the APY column, ~107px drift — matches the verifier's ~108px measurement — and
fires on **every** applicable list-view combination, all normal rows, exactly the shape
of the regression that shipped in attempt 2. This proves check I would have caught it.

**Non-vacuity transcript 2 — neuter the `.pools-list .pool-tvl-section` min-width floor
(the verifier's open point (a): "the floor's only demonstrated effect is preventing a
rect drift no committed test asserts"):**

```
$ # .pools-list .pool-tvl-section { min-width: 130px; }
$ #                              -> { /* min-width: 130px; */ }   (commented out)
$ npm run minify   # style.min.css md5 a7cf24149aa769c8a1f972cf1bd89349
$ node test_card_numeral_wrap.js
  ✗ list/light/768px: header/row column alignment (check I)
    list/light/768px: 6 header/row column alignment failure(s) across 12 non-anomalous numeral cells:
    .pool-apy-hero vs .col-apy "2.94%": right=465.29 vs header col right=456.81 -> drift=8.48px
    .pool-apy-hero vs .col-apy "4.66%": right=530.57 vs header col right=456.81 -> drift=73.76px
    ...
  ✗ list/light/1280px / list/light/1540px / list/dark/768px / list/dark/1280px / list/dark/1540px: same shape
header/row column alignment (check I): 0 non-anomalous numeral cells checked across 0 applicable view x theme x viewport combinations
✗ COLUMN_ALIGNMENT_COVERAGE: check I never asserted on any applicable combination (vacuous, spec 260 attempt-3)
✓ 28/34 card-numeral-wrap assertions passed   [exit code 1]
$ # restore min-width: 130px
$ npm run minify   # style.min.css md5 024a4f9abb3f75ae7b875906f1e2746c (byte-identical restore)
```

Removing the floor lets a normal row's TVL track collapse to its own content (e.g.
"$70.0M" ≈ 61px instead of the floored 130px) while the header's TVL track stays fixed
at 130px — a genuine mismatch, and because track 4's width feeds directly into track
3's right-edge position (the same `track2 + track3 = R − track4` relationship above),
the APY column drifts too (8-74px depending on row) even though nothing about the APY
content changed. This makes the `min-width: 130px` floor a rule the committed gate can
now see break — closing the verifier's open point (a).

**Trial re-run — neuter `.pools-list .pool-card`'s template (the original AC-3 defect
reproduction, confirming check I doesn't regress this coverage):**

```
$ # .pools-list .pool-card grid-template-columns: 40px minmax(0, 1fr) auto auto 120px
$ #                                             -> 40px 1fr 110px 130px 120px
$ npm run minify
$ node test_card_numeral_wrap.js
  ✗ list/dark/768px: numeral-cell class scan
    list/dark/768px: 1 failure(s) across 27 numeral cells / 9 cards:
    card[6] .pool-apy-hero "⚠ 9,999,999.99%" overlaps .pool-context-inline "hamilton-lane-senior-credit-opportunities-securitize-fund · Ethereum"
  ✓ list/dark/768px: header/row column alignment (check I)
  ...
✓ 32/34 card-numeral-wrap assertions passed   [exit code 1]
$ # restore, npm run minify -> style.min.css md5 024a4f9abb3f75ae7b875906f1e2746c (byte-identical)
```

Still goes red on check E (the overlap check, the original 246/leg-A defect) as
expected — check I itself correctly stays green here (`.pool-columns`/floor unchanged,
so header/row alignment genuinely holds even while the overlap regresses), confirming
check I is additive, not a replacement for the existing coverage.

### Files touched this attempt

Exactly the files the build instructions allowed: `style.css` (the `.pool-columns`
revert + the `.pool-card` doc-comment rewrite), `style.min.css` (via `npm run minify`
only), `test_card_numeral_wrap.js` (check I + its doc updates), this notes file, and
`260-pr.md`.

### Re-measured test results (this attempt's own run, not carried over)

- `node test_card_numeral_wrap.js`: **34/34 pass** (added check I's 6 new alignment
  assertions across list/light+dark × 768/1280/1540, plus 8 "expect not-applicable"
  assertions across grid/light+dark × all 4 widths — 360px list-view's check I call
  self-detects non-applicability and passes trivially, same as grid).
- `node test_list_default.js`: 3/3 pass.
- `node test_list_polish.js`: **crashes** with `page.reload: Timeout 20000ms exceeded`
  (`waitUntil: 'load'`) — reproduced **identically** against a clean `6a5092661b`
  worktree (same crash, same call site). Pre-existing sandbox flakiness (the
  `'load'`-event-never-fires issue `test_card_numeral_wrap.js`'s own header comment
  documents for `page.goto`), not caused by this attempt; `test_list_polish.js` is not
  in this attempt's allowed-files list.
- `node test_test_registry.js`: 5/5 pass.
- `node test_minified_assets.js`: 9/9 pass.
- `node test_css_minified_render.js`: 2/2 pass.
- `node run-tests.js --lane=plain --timeout=90`: 55 pass / 1 fail / 0 timeout. The one
  failure is `test_translations_number_format.js` — the explicitly known pre-existing
  failure (fails identically on clean `6a5092661b`, per the build instructions).
