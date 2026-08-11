# 246 — build notes (2026-08-11)

Three legs, one CSS-only change, one new guard test. Written as the item was built.

## What was measured before the change (re-run of the operator's numbers, this session)

Rendered Chromium, fixture-routed (`test_card_numeral_wrap.js`'s harness pattern — local http
server, vendored React/Babel, stale-stubbed snapshot, `CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`),
9-pool USDC fixture, card (grid) + list view, both themes, 360/768/1280/1540.

- **Leg (a) positive control, re-confirmed**: with the anomaly-flagged pool's `.pool-apy-hero` rule
  temporarily deleted, the "⚠ 36,452.38%" hero wraps to 2 lines at list/768px and list/1280px
  (measured directly: `height=37.6, lineHeight=19.2` → `Math.round(37.6/19.2) = 2`). Grid view showed
  the same 2-line wrap at 360/768/1280/1540 once the rule was removed. This reproduces the operator's
  original finding exactly — see the non-vacuity transcript below for the actual red output.
- **Leg (a) named instance ($/day cell), re-confirmed as NOT reproducing with realistic values**:
  measured `.pool-apy-preview` text width for the widest value reachable under `APY_SANITY_LIMIT`
  (1000%): `$1000 * (999.99%/100/365) ≈ $27.37/day`, well under the 110px list-view APY track (the same
  track `.pool-apy-hero` sits in) and nowhere near wrapping. Confirms the operator's finding: this named
  instance is not a live defect on `main` at realistic magnitudes — see "Leg (a)" below for what this
  item actually ships for it.
- **Leg (b), re-confirmed already closed**: `.pool-token-chip` computed `font-family` resolves through
  `--cert-sans → var(--font-family-base)` (`pool-detail-styles.css:111`), i.e. the same stack as
  `body`'s computed `font-family` (`"Public Sans", …`); computed `text-transform` is unset (`none`).
  Matches `PoolDetail.js:1049`'s comment that 247's world rewrite retired the mono-caps chip.
- **Leg (c), re-confirmed open**: 9-pool fixture → grid rows `[4, 4, 1]` at 1280px and 1540px
  (`repeat(auto-fill, minmax(280px,1fr))`, `max-width:1200px`, `gap:12px` — 4 columns at ≥1280px, 3
  columns at 1024–1279px). Left open; see "Leg (c)" below.
- **Sibling instance, re-confirmed open**: `.pool-symbol` (list view, long chain-suffixed symbols such
  as `USDC-WBETH-WSTETH-RETH-SFRXETH`) wraps to 2–3 lines at 768/360px. Not touched by this item (it is
  text, not a numeral cell) — recorded below.

## The change

`style.css` only, three `white-space: nowrap;` additions, each with a short comment referencing 246 and
the `⚠ 36,452.38%` positive control:

- `.tvl-value` (was ~line 4156, now 4156-4165)
- `.pool-apy-preview` (was ~line 4166, now 4168-4177)
- `.pool-apy-hero` (was ~line 4217, now 4224-4232)

`.pool-apy-tag` already carried `white-space: nowrap` and was left untouched. No ellipsis/truncation
was added anywhere — a truncated number is a trust-rail violation (CLAUDE.md), so a wrap discipline was
the only acceptable shape for this fix. Regenerated: `style.min.css` (`npm run minify`); the other six
minified artifacts came out byte-identical to their committed versions (no source changes), confirmed by
`test_minified_assets.js`.

## Overflow measurement — which of the three paths was taken, and why

**Path taken: A — no accommodation needed.** Measured `document.documentElement.scrollWidth <=
window.innerWidth` and, per numeral cell, `scrollWidth <= clientWidth + 1` plus pairwise
`getBoundingClientRect()` overlap checks against every other numeral cell and the pool-symbol text in
the same `.pool-card`, across both views, both themes, all four viewports, with a fixture that includes
the anomaly-flagged pool. Zero overflow and zero overlap anywhere. Specifically for the list-view APY
track (110px, `style.css` ~2779/~2821) that the spec flagged as the risk to measure rather than assume:
the anomaly hero's own box (`⚠ 36,452.38%`) measured `clientWidth === scrollWidth === 110px` at
768/1280/1540px in both themes — it fits the track exactly, with no measurable slack but also no
overflow. Grid view's box for the same text measured 103-121px depending on breakpoint, always within
its section. No `minmax(110px, max-content)` accommodation was needed anywhere, so `test_list_default.js`
and `test_list_polish.js` were not touched and needed no re-run for behavioral reasons (they were run
anyway as part of the required test list — both green, see "Test results" below).

## The three legs' honest outcomes

- **Leg (a) — guard, not repair.** The named $/day-cell instance from `specs/246.md` does not reproduce
  on `main` with realistic values (bounded by `APY_SANITY_LIMIT`, ~$27.40/day max, well under the
  110-130px tracks). What shipped is a durability guard against the class the operator identified as
  still live: the `.pool-apy-hero` rule closes the actual reproducing defect (the anomaly-flagged hero
  wrapping and separating "⚠" from its number); `.pool-apy-preview` and `.tvl-value` close the same class
  pre-emptively for the two sibling numeral cells that share the geometry, before either one gets bitten.
  Never claimed as a repair of a currently-live wrap in those two cells — it wasn't one.
- **Leg (b) — already closed by 247, pinned only.** No CSS change. `PoolDetail.js:1049`'s existing
  comment already records that the 247 world rewrite retired the mono-caps remnant. This item adds
  `test_card_numeral_wrap.js`'s assertions F/G (computed `font-family` === body's, computed
  `text-transform !== 'uppercase'`) as a permanent pin, with a real red/green demonstration (below) that
  the pin actually catches a regression.
- **Leg (c) — left open, with the number.** `N mod cols == 1` (9 pools, 4 columns at ≥1280px, 3 columns
  at 1024-1279px) produces the single-orphan row regardless of which pool population is used — it is a
  property of any responsive `auto-fill`/`minmax` grid at that item count, not a defect specific to this
  fixture. Every CSS-only remedy available inside spec 246's stated constraints ("no layout
  recomposition", "no new layout system", no behavior change) trades a benign grid remainder for a worse
  asymmetry (a full-bleed or double-width last card); the only real fix — making the result count divide
  by the column count — is a behavior change the spec explicitly excludes. Not touched.

## Open sibling instance (not fixed, recorded per RAZOR)

`.pool-symbol` in **list view** wraps to 2-3 lines at 768/360px for long chain-suffixed symbols (e.g.
`USDC-WBETH-WSTETH-RETH-SFRXETH`). It is text, not a numeral cell, so it is outside this item's scope and
outside the new guard's population (see "Class statement" below). No ticket invented — stated here only,
per the operator's instruction.

## Non-vacuity transcript (per sub-rule, each of the three CSS rules + the leg-(b) pin)

Methodology note: `home.html` loads `style.min.css`, not `style.css` — every trial below is
`edit style.css` → `npm run minify` (regenerates `style.min.css`) → `node test_card_numeral_wrap.js` →
observe → restore `style.css` → `npm run minify` → `md5sum style.css` to confirm byte-identical restore.
(The first attempt at this session's non-vacuity pass skipped the minify step and produced a false
green — caught and corrected before any trial was accepted as evidence.)

Baseline checksum used for every restore-confirmation below: `eef4743878f930665c9a489ebb5f1cc0  style.css`.

**Trial 1 — delete `.tvl-value`'s `white-space: nowrap;`:**
```
✗ list/light/360px: numeral-cell class scan
    list/light/360px: 9 failure(s) across 18 numeral cells / 9 cards:
    card[0] .tvl-value "$303375794.7B": white-space="normal" !== "nowrap"
    card[1] .tvl-value "$6.4M": white-space="normal" !== "nowrap"
    ... (all 9 cards, every viewport/view/theme combination — 16/16 combinations red)
numeral cells scanned across all combinations: 0
✓ 2/18 card-numeral-wrap assertions passed
```
Restored; `md5sum style.css` → `eef4743878f930665c9a489ebb5f1cc0` (byte-identical).

**Trial 2 — delete `.pool-apy-preview`'s `white-space: nowrap;`:**
```
✓ list/light/360px: numeral-cell class scan
✗ list/light/768px: numeral-cell class scan
    list/light/768px: 9 failure(s) across 27 numeral cells / 9 cards:
    card[0] .pool-apy-preview "$0.07/day": white-space="normal" !== "nowrap"
    ...
    card[6] .pool-apy-preview "$998.70/day": white-space="normal" !== "nowrap"
    card[8] .pool-apy-preview "$273,972.60/day": white-space="normal" !== "nowrap"
```
(360px stayed green here because `.pool-apy-preview` is `display:none` in the <768px mobile list row —
correctly excluded from the scan population, not a false negative; 768/1280/1540 and grid view all went
red.) Restored; `md5sum style.css` → `eef4743878f930665c9a489ebb5f1cc0` (byte-identical).

**Trial 3 — delete `.pool-apy-hero`'s `white-space: nowrap;`:**
```
✗ list/light/360px: numeral-cell class scan
    list/light/360px: 9 failure(s) across 18 numeral cells / 9 cards:
    card[0] .pool-apy-hero "1.47%": white-space="normal" !== "nowrap"
    ...
    card[6] .pool-apy-hero "⚠ 36,452.38%": white-space="normal" !== "nowrap"
    card[8] .pool-apy-hero "⚠ 9,999,999.99%": white-space="normal" !== "nowrap"
✗ list/light/768px: numeral-cell class scan
    list/light/768px: 11 failure(s) across 27 numeral cells / 9 cards:
    ...
    card[6] .pool-apy-hero "⚠ 36,452.38%": white-space="normal" !== "nowrap"
    card[6] .pool-apy-hero "⚠ 36,452.38%": 2 lines (height=37.6, lineHeight=19.2)
    ...
    card[8] .pool-apy-hero "⚠ 9,999,999.99%": 2 lines (height=37.6, lineHeight=19.2)
```
This is the live-defect reproduction itself, not just a property check: both the `white-space`
assertion AND the geometric "rendered on one line" assertion fire, on the exact positive-control text
the operator measured. Restored; `md5sum style.css` → `eef4743878f930665c9a489ebb5f1cc0` (byte-identical).

**Trial 4 — leg (b) pin: temporarily add `text-transform: uppercase;` to `.pool-token-chip`
(`pool-detail-styles.css`):**
```
  ✓ F. .pool-token-chip computed font-family === body computed font-family
  ✗ G. .pool-token-chip computed text-transform !== "uppercase"
    text-transform is "uppercase" (238 mono-caps remnant regressed)
```
Restored; `md5sum pool-detail-styles.css` → `c4a5f5bf79ae04266ce37ac27a08e786` (byte-identical to
`git show HEAD:pool-detail-styles.css`, confirmed both via checksum and `git diff --stat` showing no
change).

**On why Trials 1-3 needed a stress fixture to fire red at all**: realistic TVL (`formatCurrency`
abbreviates to a few characters, never wide) and realistic $/day (`APY_SANITY_LIMIT`-bounded, ~$27.40/day
max) never reach the 110-130px tracks regardless of the CSS rule — the first non-vacuity attempt with
only the spec-required realistic fixture (anomaly pool, 0-yield pool, near-zero pool, five normal pools)
stayed green even with the rules deleted. Two more fixture pools were added (`usdc-daypreview-glitch`,
`apyBase: 9999999.99`; `usdc-tvl-glitch`, `tvlUsd: 950e15`) to genuinely stress the two cells. These are
not invented extremes: the `$/day` calculation (`getQuickPreview`, app.js) is **not** clamped to
`APY_SANITY_LIMIT` even though the hero display is separately flagged, so a sufficiently glitched
`apyBase` still produces an oversized `$/day` string; `formatCurrency` has no upper bound either. Both
scenarios mirror real documented failure modes in this codebase's own history (RAZOR.md worked example
2: a garbage-magnitude `apyMean30d` card sailing through unflagged; item 122: a garbage-magnitude
TVL-shaped number). Once added, `white-space` alone was sufficient to demonstrate red for all three
rules without even needing the geometric wrap to manifest (Trials 1-2); Trial 3's positive control
additionally reproduces the actual 2-line wrap.

## Class statement

If this defect (a numeral cell missing a wrap discipline) appeared in a **different** numeral cell of a
`.pool-card` tomorrow, `test_card_numeral_wrap.js`'s population scan catches it automatically — it derives
the population from the rendered DOM at test time (every `.pool-apy-hero` / `.pool-apy-preview` /
`.pool-apy-tag` / `.tvl-value` that exists as a child of a rendered `.pool-card`, in whichever view/theme/
viewport is under test), not from a fixed list of instances. This session's runs scanned **414 numeral
cells** across the 16 view×theme×viewport combinations (9 pools × up to 3 rendered numeral cells per card,
since `.pool-apy-hero` and either `.pool-apy-preview` or `.pool-apy-tag` are mutually exclusive per pool,
plus `.tvl-value` — with the <768px list-view mobile row correctly excluding the two `display:none` cells
from the count).

**What the scan does NOT cover, stated with the boundary**: cells outside `.pool-card` entirely — the
planner (`planner.js`/`plan.html`), the pool-detail page body (`PoolDetail.js`, e.g. TVL/APY figures
rendered there under different classes), and the generated token/chain pages' own numeral renderings. A
wrap defect in any of those surfaces would not be caught by this guard. Within `.pool-card` itself, the
scan's four-class enumeration (`pool-apy-hero`, `pool-apy-preview`, `pool-apy-tag`, `tvl-value`) is
itself a finite list — a fifth numeral-cell class added to the card in the future would need to be added
to `NUMERAL_CLASSES` in `test_card_numeral_wrap.js` to be covered; the RAZOR-weak form here is "scan every
numeral cell of a `.pool-card` that exists at render time", and the class-list is the current best
enumeration of what "numeral cell" means on that component, not a guarantee against a wholly new numeral
element type appearing under a different class name.

## Test results (verbatim, timeboxed at 5 min foreground each)

- `node test_card_numeral_wrap.js` → **18/18 passed**, 414 numeral cells scanned.
- `node test_list_default.js` → **3/3 passed**.
- `node test_list_polish.js` → first attempt timed out on `page.goto(..., {waitUntil:'load'})` (the exact
  sandbox flakiness this item's own harness notes warn about — that test file predates this item and was
  not modified); retry → **6/6 passed**.
- `node test_test_registry.js` → **5/5 passed** (confirms `test_card_numeral_wrap.js` is correctly wired
  into `test:serial`, appended at the end per the spec).
- `node test_minified_assets.js` → **9/9 passed** (style.min.css byte-identical to a fresh minify of
  style.css; the other six artifacts unchanged and still byte-identical since their sources didn't
  change).
- `node test_css_minified_render.js` → **2/2 passed**.
- `node run-tests.js --lane=plain --timeout=90` → ran within the timebox (~2 min). **53 pass / 2 fail**:
  `test_translations_number_format.js` and `test_vercelignore.js`. Both confirmed **pre-existing on clean
  HEAD** (re-ran both against `git stash`-ed HEAD before this item's changes — identical failures),
  unrelated to this item (this item touches only `style.css`, `style.min.css`, `package.json`, and the new
  test file — none of which either failing test exercises).

## What could not be done

Nothing in the required test list was skipped. The only deviation from a literal first pass was the
minify-before-each-trial correction described in the non-vacuity section above, caught and fixed within
this session before any result was reported as evidence.
