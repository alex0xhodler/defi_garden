# 258 — build notes (2026-08-10)

## Why this item, when four rows score higher

Highest-scored READY rows, and why each was unavailable this run (checked against `main`, not
assumed from the row text):

- **234 (9.3)** — its own row says "build after 227/228"; neither exists (227 waits on **PARKED 224**,
  per LOG 2026-08-05). Its payment/custody/handle legs are NEVER-class besides.
- **238 (8.8)** — design/typography sweep. Two independent blockers: (a) the **2026-08-05 DESIGN
  QUALITY BAR** standing decision requires design work to ship as screenshot-first increments each
  approved by the human *before the next* — an autonomous merge would violate it; (b) its evidence is
  **stale**: the spec's headline count is "4 hardcoded `'SF Mono'…` stacks", and
  `grep -rn "SF Mono" --include=*.css --include=*.js --include=*.html` on this checkout returns **0**
  (item 247's visual-world replacement, PRs #409/#412/#413, landed after 238 was written). Re-deriving
  its population is a design pass on Fable under a human gate, not a build-loop item as specified.
- **246 (7.8)** — same design gate; its evidence is likewise pre-247 (the "Underlying Assets" mono-caps
  chip it targets sits on a page 247 restyled).
- **151 (7.5)** — scores *below* 258 anyway.

258 is the highest-scored row that is READY, unblocked, spec'd, and inside the loop's autonomous
lane — and it is the one that most directly serves the live north star: leg (B) is
`pool_click{source ∈ garden_cta, protocol_link}`, and this item is about that event's **attributability**.
(The dependency 258 itself names — item 257 — landed on `main` as `76f7316c4d`, so the `pool_view` leg
needed no scoping down.)

## What shipped

`surface` — the *rendering context* of the pool card that emitted the event — is now attached to
`pool_click` and `pool_view`, with three values: `results` | `empty_state_alternatives` |
`dead_pool_alternatives`.

- `app.js`: `renderPoolCard(pool, key, position, delayBase, surface)`; threaded into
  `handlePoolClick(pool, e, position, surface)` (fires `pool_view`) and
  `handleCalculateYield(pool, e, surface)` (fires **both** `pool_click` and `pool_view`; its
  `trackPoolClick` call previously passed **no context object at all**, so a context was added carrying
  only `surface`). Three call sites labelled.
- `analytics.js`: `trackPoolView`/`trackPoolClick` assemble a named `payload` and forward the key
  **explicitly and guarded** — `if (context.surface !== undefined) payload.surface = context.surface;`
  — never a `...context` spread (`playbooks/analytics-regression-triage.md`, 214 addendum). An emitter
  that passes no surface produces a payload with **no `surface` key at all** (absence, not `null`).
- `app.compiled.js` / `app.compiled.min.js` regenerated (`npm run compile`, `npm run minify`).
- `test_pool_click_surface.js` (new, registered in `package.json`'s `test:serial`).

## The test, and why it is shaped that way

Two legs, because the two failure modes are different:

- **LEG A — source-derived population (no browser).** Parses `app.js` at test time for every
  `renderPoolCard(` **call site** (depth- and string-aware argument splitting, so a comma inside
  `(currentPage - 1) * itemsPerPage + index` never mis-splits), and asserts each passes a literal-string
  surface argument. The surface **value set is read from those literals**, never hardcoded. This is the
  RAZOR-shaped half: **a fourth grid added later as a direct call with no surface argument turns this
  RED**, with no fixture and no browser.
  **What LEG A cannot see** — verifier experiment, recorded before merge rather than found later: the
  scan is *lexical*, keyed on the literal substring `renderPoolCard(`. A call routed through an alias,
  `.call`/`.apply`/`.bind`, or any indirection is invisible to it, and LEG A then reports the smaller
  population **without flagging the shrink** (the verifier aliased one real call site and watched the
  count go 3 → 2). It asserts *"every call site I found passes a literal surface"*, not *"I found every
  call site"*. For the three grids that exist today the gap is closed by LEG B, whose payload-shape
  assertion demands `surface` on every context it drives regardless of LEG A's prediction — but a new
  grid that is **both** indirectly called **and** outside LEG B's three URLs would be caught by neither
  leg. Closing that needs an AST parse or a population-shrink assertion; neither is built, so the claim
  stays the narrow one. The expected pre-existing key sets are derived the same way — parsed out of
  `enrichPoolData()`'s and the two `track*` helpers' own object literals in `analytics.js` — so
  `surface` being *the only added key* is checked against a derived set, not a golden list.
- **LEG B — rendered, spying at the `Analytics.track` boundary.** Not at the helper's arguments: the
  214 defect was correct call sites sitting above an emitter that dropped the key, and only the
  choke-point can see that. Drives the real app in Chromium across all three contexts —
  `?token=USDC` (results), `?token=ZZZNOPE258` (empty-state rescue grid), `?pool=<dead id>` (dead-pool
  rescue grid) — clicking `.calculate-yield-btn-new`, the one interaction that fires **both** events.

8/8 green. Adjacent gates re-run green: `test_test_registry.js` 5/5,
`test_pool_view_calculator_path.js` 5/5, `test_northstar_cta_fires.js` 12/12, `test_dead_pool.js` 12,
`test_analytics_fires.js` 1/1, `test_compiled_assets.js` 4/4, `test_minified_assets.js` 9/9,
`test_min_asset_boot.js` 18/18, `test_css_minified_render.js` 2/2.

## Non-vacuity — both legs seen RED, restored byte-identical

**Leg 1 (the 214 mutation): remove the `surface` forwarding from `analytics.js` only, leaving every
call site intact.**
```
md5sum analytics.js        → becaf5c8ca15844ec78c5dd9df9cfe85
(remove both `if (context.surface !== undefined) …` lines — 2 occurrences)
node test_pool_click_surface.js
  ✗ results grid (surface="results"): expected exactly one added key ("surface"), got added key(s) []
  ✗ empty-state alternatives: … got added key(s) []
  ✗ dead-pool alternatives: … got added key(s) []
  5/8 passed, exit 1
(restore from file copy)
md5sum analytics.js        → becaf5c8ca15844ec78c5dd9df9cfe85   ← identical
node test_pool_click_surface.js → 8/8, exit 0
```

**Leg 2 (the population mutation): drop the surface argument from ONE `renderPoolCard` call site.**
```
md5sum app.js              → df8bdeb99f5aeb0396cb8ab91e3eaaa4
(strip `, 'results'` from the results-grid call site — 1 occurrence)
node test_pool_click_surface.js
  ✗ LEG A population: 1/3 renderPoolCard( call site(s) have no literal-string surface argument
  ✗ LEG A population: derived surface values are non-empty distinct strings
  ✗ results grid (surface="null")
  5/8 passed, exit 1
(restore from file copy)
md5sum app.js              → df8bdeb99f5aeb0396cb8ab91e3eaaa4   ← identical
node test_pool_click_surface.js → 8/8, exit 0
```
`test_compiled_assets.js` / `test_minified_assets.js` re-run green after both restores.

**Recorded because it happened, not because it mattered in the end:** the build agent's first restore
attempt used `git checkout -- analytics.js`, which reverted to pre-258 `HEAD` and destroyed the real
edits along with the mutation. Caught immediately, the edit was re-applied by hand and md5-verified
against the pre-mutation hash before the cycle was redone with a file-copy backup. Net effect on the
final diff: none — the hashes above are the proof, not the narrative.

## Deviations from the spec

1. **"The assembled payload"** is read at the object `trackPoolView`/`trackPoolClick` hand to
   `Analytics.track(...)` — *before* `track()`'s own `getBaseContext()` merge — because `Analytics.track`
   is wrapped before its body runs. So session/base-context keys added *inside* `track()` are not visible
   to the spy and are not diffed. This is the same boundary `test_pool_view_calculator_path.js` and the
   214 addendum already use, and it is the object the code this spec touches actually assembles. Stated
   rather than glossed: the criterion "every pre-existing property byte-identical" is verified over the
   **emitter-assembled** payload, not over the final Mixpanel-delivered event.
2. Nothing else. No scope was widened; `PoolDetail.js`, the `url_direct` `pool_view`, and `source`
   itself are untouched.

## Class — answered honestly, with the number

**The class is NOT closed.** This item closes the surface question for **pool cards only**: 3 of 3
`renderPoolCard` call sites now carry a surface, and LEG A keeps that at 3-of-3 as the population grows.
The general class — *an event property names the component rather than the context it was rendered in* —
remains open across the rest of the app. Measured, not estimated: of the **32** event names the repo can
emit (the population `test_analytics_insider.js` derives from every root `*.js` containing a `track('…')`
call), exactly **2** (`pool_click`, `pool_view`) now carry a surface property; the other **30** carry no
context-of-render property of any kind, and nothing guards them. Not ticketed here — widening this spec
to chase it is the thing RAZOR forbids.

## Territory notes (found while building, none blocking)

- `renderPoolCard` has exactly **3** call sites today; no fourth grid exists (confirmed by grep *and* by
  the test's own parse).
- `handlePoolClick` (card body) fires **only** `pool_view`; `handleCalculateYield` (calculator button)
  fires **both**. The spec's "`pool_click` AND `pool_view` from a card" criterion is therefore only
  jointly satisfiable through the calculator button — which is the path LEG B drives for all three
  surfaces.
- The two rescue grids (`empty_state_alternatives`, `dead_pool_alternatives`) render inside an
  **identically classed** `div.empty-state-alternatives` — there is no DOM-level discriminator between
  them. They are never rendered simultaneously, which is what the test relies on. Anyone later trying to
  tell them apart from the DOM alone will not be able to; `surface` is now the only thing that does.
- Unrelated pre-existing doc/constant mismatch, noted and **not** touched: `CLAUDE.md` says
  `DEFAULT_MIN_TVL = $10M` "everywhere", while `app.js`'s constant is `$100,000`. Not this item's scope;
  recorded so the next reader does not trust the doc over the code.

## Measurement

**Build leg (calendar): green** — the three-context rendered test proves emission today.
**Traffic-gated leg (do not conflate):** *does the rescue empty state convert?* opens at **≥30 real**
`pool_view` carrying `surface: 'empty_state_alternatives'`; crawler-classified never count. Real count
today: **0**. 60-day UNEXERCISED backstop applies (ledger closes it 2026-10-09 if unopened). The one
event that motivated this spec was itself crawler-classified — **one crawler click is not demand**, and
nothing here claims the rescue surface works.
