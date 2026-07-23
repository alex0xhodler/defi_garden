# 123 — notes (P0 north-star instrumentation, DEFINE + verify)

## a) Confirmed both CTAs fire on real renders, both entry paths
Rendered-Playwright test (`test_northstar_cta_fires.js`), real Chromium, fixture-routed live pools fetch
(browser-originated external HTTPS is blocked in this sandbox — NORTH_STAR.md 2026-07-12 standing
decision — same pattern as `test_search.js`/`test_token_loading_state.js`):
- **url_direct** (`/?pool=<id>` landing, real id from `data/pools-snapshot.json`: `747c1d2a-c668-4682-b9f9-296708a3dd90`, lido stETH): `pool_view(source=url_direct)` fires once; "Garden this pool" fires `pool_click(source=garden_cta)`; "Start Earning on lido" fires `pool_click(source=protocol_link)`.
- **card_click** (`/?token=USDC` grid → click a card): `pool_view(source=card_click)` fires once; both CTAs fire the same as above.
- All 7 assertions pass. Full output in the final report.

## b) Segmentation props — one real gap found and fixed
`enrichPoolData()` (analytics.js) already attaches `pool_id`, `pool_project`, `pool_chain`, `total_apy` to
every `pool_view`/`pool_click`. **`source` was missing from `pool_click`** — `trackPoolClick(pool,
clickType, context)` only ever emitted `click_type: clickType`, never `source`. NORTH_STAR.md's own
pre-123 definition text ("`pool_click` events with `source ∈ {garden_cta, protocol_link}`") described a
property that didn't exist on the wire — the ticket's brief (and the human's NORTH_STAR edit) got ahead of
the code. Fix: `analytics.js` now also emits `source: clickType` (kept `click_type` too, for backward
compat with anything already built against it — additive, not a rename).

No call-site changes needed (PoolDetail.js:497/517 unchanged) — `enrichPoolData` derives everything from
the `pool` object already passed in.

## TDD proof (brief step "prove it bites")
Stashed the `source: clickType` line in analytics.js and reran `test_northstar_cta_fires.js`:
```
✓ url_direct: landing on /?pool=<id> fires pool_view(source=url_direct) ...
✗ url_direct: "Garden this pool" CTA fires pool_click(source=garden_cta) ...  expected exactly one pool_click(source=garden_cta), got []
✗ url_direct: "Start Earning on <protocol>" link fires pool_click(source=protocol_link) ...  expected exactly one pool_click(source=protocol_link), got []
✓ card_click: clicking a pool card fires pool_view(source=card_click) ...
✗ card_click: "Garden this pool" CTA fires pool_click(source=garden_cta) ...  expected exactly one pool_click(source=garden_cta), got []
✗ card_click: "Start Earning on <protocol>" link fires pool_click(source=protocol_link) ...  expected exactly one pool_click(source=protocol_link), got []
✓ no unexpected page/console errors across either path
3/7 tests passed
```
(pool_view assertions still pass — pool_view already had `source`; only the four `pool_click` assertions,
one per CTA per path, fail — exactly the gap.) Restored the fix (`git stash pop`); reran → 7/7 pass.
Never committed the broken state.

## c) Documented Mixpanel query
Written into `product-loop-kit/NORTH_STAR.md` under "### North-star Mixpanel query (item 123 …)" —
event names verified from `analytics.js` source (`trackPoolClick`/`trackPoolView` → `this.track('pool_click'
/'pool_view', …)`), not guessed. Copy-pasteable: Insights/Formulas report, Line A = `pool_click` filtered
`source` is one of `garden_cta`/`protocol_link` (Total events), Line B = `pool_view` (Total events),
Formula `A/B`, weekly time unit. Denominator caveat and available breakdown dimensions documented too.

## d) Emitter audit + rename decision
Grepped `analytics.js`/`app.js`/`PoolDetail.js`/`planner.js` for every `pool_click` emitter (only
`trackPoolClick` ever calls `this.track('pool_click', …)` — no other raw `'pool_click'` string anywhere):
1. `PoolDetail.js:497` — `garden_cta` (north star)
2. `PoolDetail.js:517` — `protocol_link` (north star)
3. `app.js:2546` (`handleCalculateYield`) — `yield_calculator`, a pool-card "calculate yield" affordance
   that jumps straight into pool-detail. Not part of the north star; excluded by the `source` filter.

**Decision: keep `pool_click`, isolate via `source`** (brief's conservative default). `source` now has
three fully disjoint values across all three emitters — nothing the property can't disambiguate, so no
case for promoting to distinct event names. Renaming would fragment any pre-2026-07-23 `pool_click`
history in Mixpanel for zero query-time benefit.

## Deviations from the brief
- None substantive. One correction to the brief's own assumption: it stated both CTAs "already fire...
  with segmentation props attached" — true for `pool_view` but not `pool_click`'s `source` prop
  specifically (see b above). Treated as the exact kind of gap step (b) exists to catch, not a deviation
  from what to build.
- Test port 8818 (no collision with any existing `test_*.js` — checked all `const PORT` declarations
  first).

## Environment note (not a regression)
`test_compiled_assets.js`/`test_minified_assets.js` fail in this checkout with `Cannot find module
'@babel/core'` — the worktree has no local `node_modules/`; Node resolves up to the parent repo's
`node_modules` (10 packages: playwright/react/react-dom/@babel/standalone — enough for every Playwright
test used here) which lacks `@babel/core`/terser used by `compile-app.js`/`minify-assets.js`. Pre-existing
environment gap, unrelated to this diff — verified: this item does not touch `app.js`/`PoolDetail.js` at
all (only `analytics.js`, a plain non-compiled script per CLAUDE.md), so the hard-constraint's
`npm install && compile && minify` step does not apply here.

`test_waitlist_funnel.js` also fails (3/3 assertions) on this checkout — confirmed identical failure on
unmodified `origin/main` (stashed my diff, reran, same 3 failures) — pre-existing, unrelated to this item.
