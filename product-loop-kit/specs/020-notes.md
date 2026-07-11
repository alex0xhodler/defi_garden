# 020 build notes

## Deviations from spec

1. **`results_count` timing.** The spec allowed either computing the count synchronously
   at parse time or "fire/patch the event once results settle (e.g. a follow-up effect
   keyed on the search)". `filteredPools` is derived state (set via `setFilteredPools`
   inside a `useEffect` that depends on `selectedToken`/`selectedChain`/etc.), so it is
   still stale in the same tick the Enter handler sets those values. Went with the
   follow-up-effect option: the Enter handler stashes `{query, selectedResult, context}`
   in a ref (`pendingNlSearchTrackRef`), and a new `useEffect` keyed on `[filteredPools]`
   fires `Analytics.trackSearchSuccess(...)` with the real `filteredPools.length` once it
   settles, then clears the ref so unrelated later filter changes (TVL slider, etc.)
   don't re-fire it.

2. **`pool_view` `source` property.** `trackPoolView`/`pool_view` had no `source` field
   before this change (only `source_view`, a different, pre-existing property). Added
   `source: context.source || 'card_click'` to `analytics.js`'s `trackPoolView` — default
   preserves existing semantics for the one pre-existing call site (`handlePoolClick`),
   which now also passes `source: 'card_click'` explicitly. The new `?pool=` URL-driven
   effect passes `source: 'url_direct'`, per spec.

3. **Dedupe guard.** In practice the URL-driven effect only ever runs while
   `detailPool` is `null` (its own `if` guard), and any card click sets `detailPool`
   synchronously first — so the two paths can't naturally double-fire for the same
   pool. Added a ref (`urlDirectPoolViewFiredRef`, storing the last-tracked pool id) as
   defense-in-depth anyway, set from both call sites, matching the spec's explicit ask
   ("guard on a ref/prev-pool id").

4. **Test coverage added beyond the spec's bare acceptance bullets** (in `test_search.js`,
   since it already has DefiLlama-shaped fixture data + network-mocking, unlike
   `test_smoke.js`):
   - `search_success.resultsCount` polled (short deadline) and asserted `> 0` for every
     existing positive `QUERIES` case — replaces the previous synchronous immediate
     check, since the event now fires from a follow-up effect (async relative to Enter).
   - New test: card click → `pool_view(source=card_click)` (exactly one), then a fresh
     `?pool=<id>` navigation on the same pool id → `pool_view(source=url_direct)`
     (exactly one). Pool id is discovered dynamically from the card-click's own pushed
     URL rather than hardcoded, so it's correct whether the run used live
     `yields.llama.fi` data or the local fixture.

## Out of scope (per spec, confirmed unchanged)

- `handleChainSelect` / `handleTokenSelect` (chip/autocomplete search paths) still call
  `Analytics.trackSearch(...)` with the pre-existing hardcoded-0 wrapper. Spec 020 scoped
  the fix to "the NL-Enter path" specifically (`app.js:1933`, the code path spec 018's
  measurement plan actually commits to) — widening to the chip paths would exceed the
  diff budget and wasn't asked for.
- No `?pool=`/canonical render or routing behavior changed — the URL-driven effect's
  existing `setDetailPool`/`setCurrentView`/`document.title` logic is untouched; only an
  analytics call was added after it.

5. **Two real bugs surfaced by writing the Playwright coverage itself** (per the
   2026-07-11 standing decision — UX/behavior acceptance is Playwright on the real UI,
   never fixtures alone; these would not have been caught by a unit test):
   - `search_success.results_count` intermittently reported `0` for a query that
     genuinely had results ("CRV LP on Curve" — 1/1 flake observed). Root cause: the
     filter effect that produces `filteredPools` can pass through more than one value
     while a search settles (this file's own pre-existing DOM-polling comment already
     documented "filtering settles across a render + a follow-up effect pass" for the
     rendered grid), and the naive `useEffect(() => {...}, [filteredPools])` fired on
     the *first* change, occasionally an intermediate one, not the final settled one.
     Fixed by debouncing the fire (`setTimeout(..., 250)`, cleared/reset on every
     `filteredPools` change) so it only reads the value once it stops changing.
   - `pool_view` never fired on a **fresh** `?pool=<id>` navigation in the Playwright
     test, even though manual verification showed the product code firing it correctly.
     Root cause was in the *test*, not the product: `?pool=` triggers `trackPoolView`
     automatically as soon as the (mocked, near-instant) pools fetch resolves — no user
     interaction to time against — so installing the spy via `page.evaluate` after
     `page.goto` resolves raced the event and regularly lost. Fixed by adding
     `installPoolViewSpyBeforeLoad`, which uses Playwright's `page.addInitScript` (runs
     before any of the page's own scripts, on every subsequent navigation) instead.

## Test run notes

- `node test_planner.js`, `node test_protocol_parsing.js`, `node test_qualifier_fix.js`,
  `node test_canonical.js`: all pass.
- `node test_search.js` (Playwright, drives real UI per the 2026-07-11 standing decision):
  20/20 assertions pass, including the two new ones for this spec (results_count > 0,
  pool_view source dedupe). Sandbox blocks `unpkg.com` and `yields.llama.fi` (proxy
  403), so it ran in the file's existing vendored-React/fixture-data fallback mode —
  logged as "network: unpkg.com BLOCKED ... yields.llama.fi BLOCKED" at the top of its
  own output, expected per the file's own header comment, not a failure.
- `node test_smoke.js`: pre-existing, **unrelated to this diff** — errors immediately on
  `browserType.launch` because the `playwright` version in `package.json`
  (`^1.61.1`, resolved fresh by `npm install` in this session) expects
  `chromium_headless_shell-1228`, but the sandbox's pre-provisioned browser at
  `/opt/pw-browsers` is `chromium-1194`/`chromium_headless_shell-1194`. Unlike
  `test_search.js`, `test_smoke.js` calls `chromium.launch()` with no explicit
  `executablePath` fallback, so it can't fall back to the pinned `/opt/pw-browsers/chromium`
  the way `test_search.js` does. This is an environment/tooling version mismatch that
  predates this change (test_smoke.js is untouched) — documented per the 2026-07-11
  "timebox, document and proceed" standing decision rather than fixed here (out of
  spec 020's scope: analytics.js + app.js only, plus the test coverage the acceptance
  criteria asked for).

## Diff size

Total diff (app.js + analytics.js + test_search.js, excluding BACKLOG.md bookkeeping):
141 changed lines — under the LOW-tier 150-line cap, but close to it. Breakdown:
app.js + analytics.js (product code) = 49 lines; test_search.js (coverage) = 92 lines.
The spec's "analytics.js + app.js only" note is read as scoping *product-code* changes
(consistent with its own acceptance criteria requiring new Playwright assertions in
test_search.js) — flagging the split here so the verifier can judge the product-code
diff and test-coverage diff separately if that reading matters for the tier call.
