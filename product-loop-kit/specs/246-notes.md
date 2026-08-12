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
- **Leg (a) named instance ($/day cell), re-confirmed as NOT reproducing — but only for the
  NON-anomalous subpopulation (correction, attempt 2, verifier finding 1a)**: `getQuickPreview()`
  (`app.js:2929-2937`) computes `dailyEarnings` from raw `apyBase + apyReward` with **no clamp** to
  `APY_SANITY_LIMIT`, and `.pool-apy-preview` (`app.js:3050-3058`) renders for every pool with nonzero
  yield, anomalous or not — `isAnomalousApy()` (`app.js:2524`) only changes the sibling `.pool-apy-hero`'s
  className/glyph, it never suppresses or clamps `.pool-apy-preview`. So the widest `$X.XX/day` string is
  bounded (`$1000 * (999.99%/100/365) ≈ $27.37/day`, well under the 110px list-view APY track) **only for
  pools with `apyBase + apyReward <= APY_SANITY_LIMIT`**. For the anomalous subpopulation the string is
  **unbounded**: this session's own Trial 2 (below) rendered `$998.70/day` from a 36,452.38% fixture, and
  the live `data/pools-snapshot.json` (7,339 pools, `APY_SANITY_LIMIT = 1000`, `app.js:800`) currently
  contains **17 pools above that limit (0.23% of the total)**, the worst of which
  (`6cf96588-3d2a-47b3-a2da-8e4e25d5a5fa`, project `zeebu`) would render **`$10,800.22/day`** at the
  $1,000 preview amount — 394× the non-anomalous bound, and there is no ceiling on how much higher a
  future anomalous pool's raw APY could push that string. `.pool-apy-preview`'s `white-space: nowrap`
  rule is therefore **not** merely pre-emptive for the class as a whole: it guards a genuinely unbounded
  string for the anomalous subpopulation, while remaining a durability guard (not a repair of a live wrap)
  for the non-anomalous majority, where the named `$X.XX/day` instance from `specs/246.md` still does not
  reproduce — see "Leg (a)" below for what this item actually ships for it.
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
`getBoundingClientRect()` overlap checks against every other numeral cell and (attempt 2, widened per
verifier finding 1b) every other rendered text-bearing leaf element in the same `.pool-card` — which
includes `.pool-context-inline` and `.pool-symbol`, and excludes only elements inside
`.pool-cta-section` (see `test_card_numeral_wrap.js`'s header comment and the derivation site for the
exact rule and what it leaves out) — across both views, both themes, all four viewports, with a fixture
that includes the anomaly-flagged pool and (attempt 2) a pool whose project is the longest slug in
`data/pools-snapshot.json` paired with a realistic APY. **Zero overflow and zero overlap across that
neighbour set, for the fixture population actually rendered** (RAZOR-scoped, not "anywhere"): this does
NOT hold for the pairing of a long project slug with an anomalous APY magnitude, which is a reproduced,
pre-existing, NOT-fixed collision between `.pool-apy-hero` and `.pool-context-inline` — see "Leg (a) —
pre-existing collision, not fixed" below. Specifically for the list-view APY
track (110px, `style.css` ~2779/~2821) that the spec flagged as the risk to measure rather than assume:
the anomaly hero's own box (`⚠ 36,452.38%`) measured `clientWidth === scrollWidth === 110px` at
768/1280/1540px in both themes — it fits the track exactly, with no measurable slack but also no
overflow. Grid view's box for the same text measured 103-121px depending on breakpoint, always within
its section. No `minmax(110px, max-content)` accommodation was needed anywhere, so `test_list_default.js`
and `test_list_polish.js` were not touched and needed no re-run for behavioral reasons (they were run
anyway as part of the required test list — both green, see "Test results" below).

## The three legs' honest outcomes

- **Leg (a) — guard for one subpopulation, live-defect repair for another.** The named $/day-cell instance
  from `specs/246.md` does not reproduce on `main` with realistic values **for the non-anomalous
  subpopulation** (bounded by `APY_SANITY_LIMIT`, ~$27.40/day max, well under the 110-130px tracks). It
  DOES reproduce, unbounded, for the anomalous subpopulation (17/7,339 = 0.23% of pools in the live
  snapshot today, up to $10,800.22/day currently and not ceilinged — see the correction above). What
  shipped is therefore two things at once, not one: for the non-anomalous majority, `.pool-apy-preview`
  and `.tvl-value`'s `nowrap` rules are a durability guard against the class the operator identified as
  still live, shipped pre-emptively before either cell gets bitten at realistic magnitudes; for the
  anomalous subpopulation, the SAME `.pool-apy-preview` rule is closing a currently-unbounded, currently
  reachable (0.23% of live pools) string — a real guard against a real, already-occurring input, not a
  pre-emptive one. `.pool-apy-hero`'s rule separately closes the actual reproducing wrap defect (the
  anomaly-flagged hero wrapping and separating "⚠" from its number). Never claimed as a repair of a
  currently-live wrap in the non-anomalous instance named by `specs/246.md` — it wasn't one there.
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

## Attempt 2 (2026-08-11) — verifier finding 1b: widened guard, longest slug, pre-existing collision

The verifier (attempt 1 review) reproduced a genuine `getBoundingClientRect()` intersection at 768px
between `.pool-apy-hero` and `.pool-context-inline` (the "on `<project>` · `<chain>`" byline) using a
**real live project slug**, `hamilton-lane-senior-credit-opportunities-securitize-fund`, paired with
`apyBase: 9999999.99`. `test_card_numeral_wrap.js`'s check E previously compared numeral cells only
against each other and `.pool-symbol` — narrower than the class it guards (RAZOR). Three things done in
response, per the operator's brief:

**1. Widened neighbour derivation.** Check E's neighbour set is now DERIVED from the rendered card: every
element with no child elements and non-empty trimmed text is a candidate neighbour of every numeral cell,
so `.pool-context-inline` and `.pool-symbol` are covered automatically — as would any future text element
added to `.pool-card` — rather than needing a new hardcoded class added by hand. ONE exclusion, stated
explicitly rather than silently applied: elements inside `.pool-cta-section` (the "Calculate Yield"
button) are left out of the neighbour set, because an interactive control's action label is a different
semantic class from passive identity/numeral text, and this item's scope is the text-vs-numeral collision
class, not interactive controls. That exclusion is not academic: including the CTA button in an early
draft of the derivation surfaced a real, DIFFERENT overlap — `.tvl-value` "$950000000.0B" (the pre-existing
non-vacuity stress fixture for the TVL cell, `tvlUsd: 950e15`, already in the fixture before this attempt)
overlapping `.calculate-yield-btn-new` "View & calculate →" in **grid view at 1280px/1540px, both themes**.
This is unrelated to either of the two findings in this attempt and is **not fixed, not further
investigated** — recorded here only, per RAZOR, so the exclusion isn't laundering it. If a future item
widens the neighbour set to include interactive controls, this is where it should start.

**2. Realistic long-slug fixture.** The longest project slug in `data/pools-snapshot.json` is computed at
test run time (not hardcoded) — `test_card_numeral_wrap.js` reads the snapshot, finds the longest
`project` value, and prints it every run. Currently: `hamilton-lane-senior-credit-opportunities-securitize-fund`
(**57 characters** — not 59; recomputed independently of the verifier's report, `String.length` on the
exact value read from the snapshot). This slug now labels the `usdc-poly-aave` fixture pool (chosen because
relabeling an existing filler pool, rather than appending a 12th pool, was the only way to add this
fixture without silently pushing `usdc-daypreview-glitch` — the Trial-2 non-vacuity stress fixture for
`.pool-apy-preview` — off page 1: `itemsPerPage = 9` in `app.js`, and the default `sortBy: 'tvl'` sort
already filled page 1's 9 slots with the 11-pool fixture; appending a 12th competing pool changes which 9
of the 11+1 pools rank into that top 9, not the total shown). It keeps its original realistic APY (3.1%,
non-anomalous) — pairing the longest real slug with a realistic magnitude, exercising the widened check on
a real-world-shaped worst case rather than an invented one. **Result: GREEN** — `node test_card_numeral_wrap.js`
passes 18/18 with this fixture in place (full output below, "Test results, attempt 2").

**3. The pre-existing collision — reproduced, NOT fixed, NOT laundered.** Per the operator's instruction,
this pairing (long slug × anomalous APY magnitude) is deliberately NOT part of the officially-asserted
green fixture population — asserting it there would make this file permanently red for a defect this
attempt is not authorized to fix (no `style.css` changes). Reproduced instead as a one-off session
verification, mirroring this file's own Trial methodology: same 11-pool fixture, `usdc-poly-aave`'s
`apyBase` temporarily changed from `3.1` to `9999999.99` (matching the verifier's own reproduction magnitude)
in a scratch copy of the harness — never committed, `git diff --stat` confirms `test_card_numeral_wrap.js`
in the repo is unaffected by this step.

```
✗ list/light/768px: numeral-cell class scan
    list/light/768px: 1 failure(s) across 27 numeral cells / 9 cards:
    card[4] .pool-apy-hero "⚠ 9,999,999.99%" overlaps .pool-context-inline "hamilton-lane-senior-credit-opportunities-securitize-fund · Polygon"
✗ list/dark/768px: numeral-cell class scan
    list/dark/768px: 1 failure(s) across 27 numeral cells / 9 cards:
    card[4] .pool-apy-hero "⚠ 9,999,999.99%" overlaps .pool-context-inline "hamilton-lane-senior-credit-opportunities-securitize-fund · Polygon"
```
360px, 1280px, 1540px and both grid-view passes stayed green at this magnitude — the collision is
specific to **768px, list view, both themes** (the width where the byline column is narrow enough for a
57-char slug to run under the APY column). This is a genuine, live, pre-existing defect: the widened check
sees it, the shipped `.pool-apy-hero { white-space: nowrap }` rule does not prevent it (nowrap stops the
hero's OWN text from wrapping, it does not stop a neighbour's box from growing into the hero's space), and
this attempt does not fix it (no `style.css` changes authorized). It is pre-existing on `main`, not
introduced by 246: it depends only on `.pool-context-inline`'s existing layout (`style.css:4081`,
predates 246) and a long slug × high-APY combination that could occur on `main` today independent of any
246 CSS change.

**Non-vacuity of the widened check itself** (required separately from the collision reproduction above,
per the operator's instruction — "a widened check nobody has seen fail is not evidence that the widening
did anything"): using the REALISTIC (green) fixture — no anomalous magnitude, no CSS file touched at all —
at 768px, the live `.pool-context-inline` element of the long-slug card was translated via inline
`element.style.transform` (an in-page DOM mutation, not a stylesheet edit; `home.html` loads
`style.min.css` and this attempt makes no CSS changes, so there is no file to re-minify or checksum here)
onto `.pool-apy-hero`'s box:
```
STEP 1 (baseline): GREEN (27 numeral cells, 9 cards)
STEP 2 (mutated — .pool-context-inline translated onto .pool-apy-hero's box): RED
  card[4] .pool-apy-hero "3.10%" overlaps .pool-context-inline "hamilton-lane-senior-credit-opportunities-securitize-fund · Polygon"
  card[4] .tvl-value "$30.0M" overlaps .pool-context-inline "hamilton-lane-senior-credit-opportunities-securitize-fund · Polygon"
STEP 3 (mutation removed): GREEN (27 numeral cells, 9 cards) — restored
```
The RED explicitly NAMES `.pool-context-inline` as the overlapping neighbour — the exact class the
original (narrow) check could never have seen, because `.pool-context-inline` was not in its neighbour
set at all. `git diff --stat style.css` was empty throughout this step (no file was touched) and
`test_card_numeral_wrap.js` itself was not modified during the mutation (it happened in a separate
scratch script against the widened `SCAN_FN` logic, then verified against the shipped file directly, "Test
results, attempt 2" below).

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

## Test results, attempt 2 (2026-08-11 — fixes for verifier findings 1a/1b only)

- `node test_card_numeral_wrap.js` → **18/18 passed**, **414 numeral cells scanned** (unchanged from
  attempt 1 — relabeling `usdc-poly-aave`'s project to the longest slug doesn't change which/how many
  numeral cells render, only the byline text next to them). Longest slug printed by the run itself:
  `hamilton-lane-senior-credit-opportunities-securitize-fund` (57 chars).
- `node test_test_registry.js` → **5/5 passed** (registration still holds; `test_card_numeral_wrap.js` is
  the only file this attempt touched, and it's a diff to an already-registered file, not a new one).
- `git diff --stat` (this attempt) → `test_card_numeral_wrap.js | 94 ++++++++++++++++++++++++++++++++++++++++++-----`
  only. `style.css`/`style.min.css`/`app.js` untouched — confirmed via `git status --short` and (for the
  two CSS files, which were temporarily edited and restored to double-check the pre-existing collision
  reproduces without the shipped `nowrap` rule, then abandoned per this attempt's own constraint that
  re-minifying "should not come up") `md5sum style.css` → `eef4743878f930665c9a489ebb5f1cc0`, matching
  attempt 1's baseline checksum, both before and after that abandoned check.

## What could not be done

Nothing in the required test list was skipped. The only deviation from a literal first pass was the
minify-before-each-trial correction described in the non-vacuity section above, caught and fixed within
this session before any result was reported as evidence.

**Attempt 2 addendum**: one path considered and abandoned — independently reproducing the pre-existing
collision (long slug × anomalous APY) with the shipped `.pool-apy-hero` `nowrap` rule temporarily removed,
to directly verify the verifier's "reproduces with AND without the rule" claim rather than relying on it.
Started (temporarily deleted the rule, re-minified, confirmed the collision still reproduces), then
reverted before use: this attempt's constraints explicitly note that re-minifying "should not come up"
for a test-only fix, and the collision was already reproduced WITH the shipped rule present (which is the
only state relevant to "is this fixed by 246" — it isn't). `git checkout -- style.css style.min.css
app.compiled.min.js PoolDetail.compiled.min.js planner.min.js translations.min.js planner-styles.min.css
pool-detail-styles.min.css` restored all seven files; `git status --short` after showed only
`test_card_numeral_wrap.js` modified.
