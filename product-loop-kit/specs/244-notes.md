# Item 244 — build notes

## Blindspot check (spec §2)

Read the full analytics-mode boot chain before touching anything: `home.html:173-204` (the six
`<script defer>` tags in `<head>`), `home.html:350-364` (the dynamically-inserted-bundle block),
and the first ~20 lines of both `PoolDetail.compiled.min.js` and `app.compiled.min.js` (confirmed
both destructure `React` in their very first statement; `app.compiled.min.js` additionally calls
`ReactDOM.render(...)` unconditionally at the bottom of the file and reads `createTranslationFunction`
— from `translations.min.js` — inside a `useMemo` that fires on the same synchronous render pass).
`grep -o "createTranslationFunction\|ReactDOM\." *.compiled.min.js` confirmed exactly which of the
six deferred globals the two dynamically-appended bundles actually consume: `React` (both files),
`ReactDOM` (app only), `createTranslationFunction` (app only, from `translations.min.js`).
`analytics.js` and `planner.min.js`/`landing.js` are also `defer`-loaded but neither compiled
bundle reads a global from them at the point they execute (`Analytics.*` calls in both files are
inside functions invoked later — click handlers / `useEffect` — never at top-level parse time).

## What shipped

- `home.html` (+22/-4): the analytics-mode dynamic-bundle-injection block (`:350-378` after the
  edit) now wraps its `addScript(...)` calls in a `bootAnalyticsBundles` function invoked from
  `document.addEventListener('DOMContentLoaded', bootAnalyticsBundles)` instead of calling it
  directly at parse time. Comment above the block explains the mechanism and why it's derived
  from the HTML spec's `DOMContentLoaded` guarantee ("fires only after every `defer` script has
  finished executing, in order") rather than a hand-picked list of globals.
- `test_boot_barrier.js` (new, 8 assertions): rendered Playwright test, house pattern from
  `test_min_asset_boot.js`. Two source-derived population checks (never a hand-typed list):
  (1) parses `home.html` for every `<script defer src="...">` and asserts the set is non-empty and
  contains `react.production.min.js`/`react-dom.production.min.js`/`translations.min.js`;
  (2) parses the analytics-mode loader block itself and asserts it's gated by
  `document.addEventListener('DOMContentLoaded', ...)` — a structural proof that the barrier
  covers every entry in (1), not a subset, because `DOMContentLoaded`'s semantics are defined by
  the HTML spec, not by anything this repo has to enumerate correctly. Then three rendered legs
  (`?token=`, `?chain=`, `?pool=`) with `react.production.min.js`, `react-dom.production.min.js`
  and `translations.min.js` all artificially delayed 600ms via `page.route`, asserting zero
  `pageerror`, zero `console.error`, and the expected content renders.

## Instance of / class closed

Per spec: *"a dynamically-inserted script that reads a global supplied by a `defer` tag, with no
barrier between them."* Population = every consumer of every deferred global in the analytics-mode
boot path. **Deferred-global count: 6** (`react.production.min.js`, `react-dom.production.min.js`,
`translations.min.js`, `analytics.js`, `planner.min.js`, `landing.js`) — enumerated by the test at
run time via regex over `home.html`'s actual `<script defer>` tags, never hand-typed.
**Dynamically-inserted consumers guarded: 2** (`PoolDetail.compiled.min.js`, `app.compiled.min.js`
— the only two scripts `home.html` inserts via `document.createElement('script')`/`appendChild`;
confirmed by grep, no third dynamic-insertion site exists).

The fix does not enumerate which of the 6 deferred globals the 2 consumers read — it gates on
`DOMContentLoaded`, which by HTML-spec definition cannot fire until **all 6** have finished
executing. That is what makes this the weak form per RAZOR rather than a resemblance of it (item
212's trap): a future 7th `<script defer>` tag, or a future dynamically-inserted bundle that reads
a 4th global, is covered automatically with zero further edits — the barrier's coverage is a
consequence of the browser's `DOMContentLoaded` contract, not of this repo's bookkeeping.

**Class closed:** yes, for the analytics-mode boot path. Planner mode
(`__APP_MODE !== 'analytics'`) does not use this loader at all — confirmed by
`grep -n "window.__APP_MODE === 'analytics'" home.html`, which returns exactly the one guarded
block; planner's own scripts (`planner.min.js`, `landing.js`) are static `<script defer>` tags
that never go through `document.createElement('script')`, so they were never subject to this race.

## Deviations from the spec, and why

None. The spec's "builder chooses the mechanism, criterion is what must hold" left `DOMContentLoaded`
as an explicit example and it is what shipped, with the full 6/2 coverage the acceptance criteria
require.

## Non-vacuity — byte-identical restore proven

Pre-fix baseline (`git stash` isolating the `home.html` edit; `test_boot_barrier.js` itself was
untracked so it survives the stash):
```
e39fdb173d0595b60e9b2c6ae8cc52bd  home.html   (fixed)
975ba0a2ae317c493d78cc826223d6f6  home.html   (pre-fix, via git stash)
```
`node test_boot_barrier.js` against the pre-fix tree:
```
✓ home.html has a non-empty, machine-derived set of <script defer> globals
✗ analytics-mode dynamic loader is gated on DOMContentLoaded (covers every deferred global above, not a hand-picked subset)
    expected the analytics-mode loader to be gated by document.addEventListener('DOMContentLoaded', ...)
page.waitForSelector: Timeout 15000ms exceeded.   (the /?token= rendered leg never got a .pool-card
    — the exact "[P1] dead-end" class audit-app.js caught live — and the run aborted nonzero)
```
RED confirmed on both the structural check and the rendered check. `git stash pop` restored the
fix; `md5sum home.html` → `e39fdb173d0595b60e9b2c6ae8cc52bd` — **byte-identical** to the
pre-mutation fixed state. `node test_boot_barrier.js` afterward: 8/8 green again.

## Verification runs (all within the 5-minute-per-command timebox; none killed by timeout)

Environment note: `node_modules/` did not exist at session start — `npm install` (network open,
proxy reachable) pulled all declared dependencies including `playwright`, which every rendered
test in this repo needs to even load.

```
node test_boot_barrier.js                              → 8/8 assertions passed, exit 0
node test_min_asset_boot.js                             → 18/18 assertions passed, exit 0 (both
                                                             router paths: bare / -> planner via
                                                             /?fresh=1 stand-in per that file's own
                                                             documented IA-drift note, /?token=USDC
                                                             -> analytics app with pool cards)
node test_smoke.js                                      → 11/11 assertions passed, exit 0
node test_planner.js                                    → 208/208 assertions evaluated, exit 0
node test_protocol_parsing.js                           → 9/9 passed, exit 0
node test_qualifier_fix.js                               → 9/9 passed, exit 0
node audit-app.js --only=grid-token,grid-chain,grid-360,grid-768
                                                          → 6 findings, 6 blocking — ALL are the
                                                             pre-existing item-221 `.app-footer`
                                                             occlusion class (P0 on grid-token/
                                                             grid-chain's `.calculate-yield-btn-new`,
                                                             P1 on grid-360/grid-768 text elements).
                                                             Zero `page-error`, zero `dead-end`
                                                             findings — the two classes this item's
                                                             acceptance criteria require to be
                                                             absent. Not silenced, per spec.
```

## Instrumentation

None new, per spec — `analytics.js:690`'s existing `window.addEventListener('error')` handler
already emits `error_occurred` for this class. That is the only prod witness and it is currently
unexercised (~0 real analytics-mode human loads in the 14d window, per `signals/2026-08-06.md`'s
§2a prediction). Prod occurrence rate before this fix is unknown and unmeasurable, as the spec
states; the fix ships on the rendered gate, not on a traffic read.

## Residual class left open

None identified within the analytics-mode boot path itself (closed, per "Instance of / class
closed" above). Out of scope, per spec, and left untouched: the item-221 `.app-footer` occlusion
findings (still 6, confirmed live above — a different defect class, a different item), the
planner-768 P2 (item 235), and any perf tuning of the barrier itself (no measurable first-paint
regression was found; the barrier only delays two scripts that were already contingent on the
same defer tags completing in practice).
