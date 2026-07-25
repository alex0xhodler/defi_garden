# 144 — build notes (`apyMean30d` sanity gate on pool-detail)

Branch: `claude/loop-144` · Built 2026-07-25 · Type BUGFIX · Risk HIGH (render path on the north-star surface)

## What changed

### `PoolDetail.js` (5 edits, one added const + 4 gate swaps)
- **`PoolDetail.js:158-164`** — new derived boolean immediately after `APY_SANITY_LIMIT_LOCAL` (`:156`), verbatim from the spec:
  ```js
  const mean30dSane = typeof pool.apyMean30d === 'number' &&
    Number.isFinite(pool.apyMean30d) &&
    pool.apyMean30d >= 0 &&
    pool.apyMean30d <= APY_SANITY_LIMIT_LOCAL;
  ```
- **`PoolDetail.js:1290`** — "30d Mean APY" stat card gate: `(typeof pool.apyMean30d === 'number')` → `mean30dSane` (honest omission, no clamped/fabricated number).
- **`PoolDetail.js:1376`** — 071 rate-volatility note: first term of the divergence boolean swapped to `mean30dSane`.
- **`PoolDetail.js:1404` (track-record 088.1), `:1452` (momentum 103), `:1498` (tvl-trend)** — the three *negated* sibling copies of the same divergence boolean: only the `typeof …` term replaced, `!( … )` structure and every other term untouched, so the siblings keep their yield-to-071 semantics and simply become eligible when 071 goes quiet.

No other term, no restyling, no refactor of the repeated boolean into a helper (explicitly out of scope). No trust-rail constant changed — this *adds* a bound.

### Regenerated artifacts
- `PoolDetail.compiled.js` and `PoolDetail.compiled.min.js` via `npm run compile && npm run minify`. `app.compiled.*` came out byte-identical (unchanged in git status), so only the PoolDetail pair is in the diff. `home.html` loads `PoolDetail.compiled.min.js`, so the artifacts are what the acceptance test actually exercises.

### New test — `test_mean30d_sanity.js` (8 rendered assertions)
Structure copied verbatim from `test_rate_volatility.js`: local `http` static server (port **8796**, distinct from 8794), `chromium` at `/opt/pw-browsers/chromium`, `IGNORABLE_ERROR_PATTERN` unchanged, and identical fixture routing for `unpkg` React/ReactDOM/Babel, `icons.llamao.fi` (abort), `**/data/pools-snapshot*` (stale 200 → forces the live path), and `https://yields.llama.fi/pools`. Every assertion is on the settled DOM / `document.body.innerText` of a real `/?pool=<id>` render.

| # | Fixture | Assertion |
|---|---------|-----------|
| 1 | `absurd-mean-pool` — the live balancer-v2 WSTETH-AAVE numbers (`apyBase 0.24482`, `apyReward null`, `apyMean30d 36452.38798`, TVL `$12,412,471`) | card absent **and** page text contains neither `36,452` nor `36452` (AC 1) |
| 2 | same | `.rate-volatility-note` absent; `.cta-button-primary` ≥ 1; stat grid ("Pool Type" card) present; real `0.24%` still rendered (AC 2) |
| 3 | `sane-stable-pool` (`apyMean30d 5.0`) | card present, text contains `5%` (AC 3, no over-suppression) |
| 4 | `sane-divergent-pool` (`142.84` vs `405.32`) | card present with `405.32%` **and** 071 note present with both figures (AC 3, item 071 preserved) |
| 5 | `nan-mean-pool` | card absent; no `NaN`; no `999%` (AC 4) |
| 6 | `negative-mean-pool` (`-12.5`) | card absent; no `-12.5%` (AC 4) |
| 7 | `infinite-mean-pool` (`1e999` → `Infinity`) | card absent; no `∞` (AC 4) |
| 8 | all of the above | zero page errors (AC 2) |

### `package.json`
`node test_mean30d_sanity.js` appended to the end of the `test` chain, same `&& node …` style. No dependency added or changed.

## Deviations from the spec / conservative choices

1. **NaN cannot travel through JSON.** `JSON.stringify({apyMean30d: NaN})` emits `null`, which `typeof`-fails on its own and would have made AC 4's NaN half a vacuous test. Deviation: the NaN fixture ships a **sane** value (`999`) in the routed JSON and a small `page.addInitScript` shim rewrites `apyMean30d` to a real `NaN` for that one pool id after the routed response is parsed and before React renders. The shim only touches the `yields.llama.fi/pools` response (everything else passes through untouched) and returns `{ ok, status, json }` — the exact surface `app.js:1096-1108` (`loadLive`) consumes. The test is **self-verifying**: if the shim ever stops applying, the card renders `999%` and assertion 5 fails loudly rather than passing vacuously. The render under test is still 100% real DOM.
2. **Added a third junk case (`Infinity`) beyond the spec's two.** `1e999` in the raw JSON body parses to `Infinity` with zero trickery, giving a pure fixture-routed proof of the `Number.isFinite` term. Additive only.
3. **Baseline rendering discovered while writing the test** (worth recording, it changes what "the bug" looks like): `_formatApy` is `Number(pct || 0).toLocaleString(...)`, so pre-fix `NaN` rendered as **`0%`** — a *fabricated* number, arguably worse than a visibly-broken one — and `Infinity` rendered as `∞%`. The spec's "no `NaN%`" wording is therefore satisfied trivially; the load-bearing assertion in both cases is *card absent*, which is what the test asserts.
4. **`node_modules/` was absent from the working tree**, so `npm run compile` and Playwright both failed. Ran plain `npm install` (no `--save`, no new package, `package.json` dependency blocks untouched) to materialise the already-declared deps. `node_modules/` is gitignored and does not appear in `git status`.
5. **No translations churn** — pure suppression, no new user-facing string (AC 7). KO path untouched; `test_rate_volatility.js`'s `?lang=ko` assertion still passes.
6. **Sibling-note gap check**: the fixtures carry no `kpis`, so no sibling note fires on the absurd pool — assertion 2 confirms the page has no visual gap and no crash where 071 used to be.

## Follow-up candidates observed (NOT built — spec non-goals)

- `compute-kpis.js`: the same pool has `kpis.apyMean = 21731`, `apyStdev = 72072` yet `apySharpe = 0.3`, passing 122's `|Sharpe| <= 50` gate — a stability score derived from out-of-rail history. Ticket-worthy separately.
- Anomaly **risk classification** still keys off `totalApy` only (`PoolDetail.js:164`), so this pool is still not `⚠`-flagged / forced High risk despite carrying an out-of-rail 30d mean. Extending flagging to `apyMean30d` changes rendered risk app-wide — its own item.
- The 071 divergence boolean is now duplicated **four** times with a 5-term body. A shared `const rateDiverges = …` would be a clean, behavior-neutral cleanup; deliberately not done here (out of scope, surgical diff).
- `test_minified_assets.js` has 2 **pre-existing** failures (see proof below) — `home.html` does not load `translations.min.js` and `plan.html` still loads raw `planner.js`. Unrelated to this item but the freshness gate is red on `main` today.

## Verification (verbatim)

### 1. `node test_mean30d_sanity.js`
```
network: unpkg.com BLOCKED (local vendored React/Babel), yields.llama.fi BLOCKED (DefiLlama-shaped fixture snapshot)
  ✓ absurd apyMean30d (36452.38798) renders no 30d Mean APY card and no 36,452 anywhere
  ✓ absurd pool suppresses the 071 note but still renders CTAs and the stat grid
  ✓ sane apyMean30d (5.0) still renders the 30d Mean APY card with its value
  ✓ sane divergent pool (142.84% vs 405.32%) still renders card + 071 note with both figures
  ✓ NaN apyMean30d renders no card, no "NaN%" and no fabricated value
  ✓ negative apyMean30d (-12.5) renders no card and no negative percent
  ✓ non-finite apyMean30d (Infinity) renders no card and no "∞%"
  ✓ zero page errors across all renders
8/8 mean30d sanity behavior assertions passed
```

**Negative control** (`git stash` → run → `git stash pop`) — proves the test actually catches the shipped bug rather than passing vacuously, and confirms the spec's live-case claim renders:
```
network: unpkg.com BLOCKED (local vendored React/Babel), yields.llama.fi BLOCKED (DefiLlama-shaped fixture snapshot)
  ✗ absurd apyMean30d (36452.38798) renders no 30d Mean APY card and no 36,452 anywhere
    expected no "30d Mean APY" card, got: 30d Mean APY36,452.39%
  ✗ absurd pool suppresses the 071 note but still renders CTAs and the stat grid
    expected no .rate-volatility-note, got: This pool's rate moves a lot: 0.24% right now vs a 36,452.39% 30-day average. Reward emissions change daily — projections on this page use the current rate and will move with it.
  ✓ sane apyMean30d (5.0) still renders the 30d Mean APY card with its value
  ✓ sane divergent pool (142.84% vs 405.32%) still renders card + 071 note with both figures
  ✗ NaN apyMean30d renders no card, no "NaN%" and no fabricated value
    expected no "30d Mean APY" card, got: 30d Mean APY0%
  ✗ negative apyMean30d (-12.5) renders no card and no negative percent
    expected no "30d Mean APY" card, got: 30d Mean APY-12.5%
  ✗ non-finite apyMean30d (Infinity) renders no card and no "∞%"
    expected no "30d Mean APY" card, got: 30d Mean APY∞%
  ✓ zero page errors across all renders
3/8 mean30d sanity behavior assertions passed
EXIT=1
```
The two "sane" assertions pass on baseline **and** after the fix — that is the no-over-suppression control.

### 2. `node test_rate_volatility.js` (071 regression gate)
```
network: unpkg.com BLOCKED (local vendored React/Babel), yields.llama.fi BLOCKED (DefiLlama-shaped fixture snapshot)
  ✓ divergent pool (142.84% vs 405.32%) renders .rate-volatility-note with both numbers
  ✓ stable pool (5.20% vs 5.00%) renders no .rate-volatility-note
  ✓ pool with no apyMean30d renders no .rate-volatility-note
  ✓ ?lang=ko divergent pool renders Korean note copy
  ✓ zero page errors across all renders
5/5 rate-volatility behavior assertions passed
EXIT=0
```

### 3. `npm run compile && npm run minify` then the freshness gates
```
> defi-garden@1.0.0 compile
> node compile-app.js
compiled app.js -> app.compiled.js
compiled PoolDetail.js -> PoolDetail.compiled.js

> defi-garden@1.0.0 minify
> node minify-assets.js
minified -> app.compiled.min.js
minified -> PoolDetail.compiled.min.js
minified -> planner.min.js
minified -> translations.min.js
minified -> style.min.css
minified -> planner-styles.min.css
minified -> pool-detail-styles.min.css

compiled assets match source (backlog 052)
  ✓ app.compiled.js is byte-identical to a fresh compile of app.js
  ✓ PoolDetail.compiled.js is byte-identical to a fresh compile of PoolDetail.js
home.html loads compiled output, no Babel
  ✓ home.html does not load @babel/standalone or use type="text/babel"
  ✓ home.html loads the (minified) compiled output, PoolDetail before app

4 compiled-asset assertions passed
EXIT_COMPILED=0

minified assets match source (backlog 053)
  ✓ app.compiled.min.js is byte-identical to a fresh minify of app.compiled.js
  ✓ PoolDetail.compiled.min.js is byte-identical to a fresh minify of PoolDetail.compiled.js
  ✓ planner.min.js is byte-identical to a fresh minify of planner.js
  ✓ translations.min.js is byte-identical to a fresh minify of translations.js
  ✓ style.min.css is byte-identical to a fresh minify of style.css
  ✓ planner-styles.min.css is byte-identical to a fresh minify of planner-styles.css
  ✓ pool-detail-styles.min.css is byte-identical to a fresh minify of pool-detail-styles.css
home.html / plan.html reference minified assets, not raw sources
  ✗ home.html loads style.min.css, translations.min.js, planner.min.js, *.compiled.min.js
    home.html does not load translations.min.js
  ✗ plan.html loads style.min.css, translations.min.js, planner.min.js, planner-styles.min.css
    plan.html still loads raw planner.js

7 minified-asset assertions passed
EXIT_MIN=1
```
**The 2 `test_minified_assets.js` failures are PRE-EXISTING.** Every freshness assertion that concerns this item (both `PoolDetail` byte-identity checks) is green; the 2 failures are about `home.html`/`plan.html` script tags, which this item does not touch. Baseline proof (`git stash` → run → `git stash pop`) — byte-for-byte the same 2 failures with no changes applied:
```
minified assets match source (backlog 053)
  ✓ app.compiled.min.js is byte-identical to a fresh minify of app.compiled.js
  ✓ PoolDetail.compiled.min.js is byte-identical to a fresh minify of PoolDetail.compiled.js
  ✓ planner.min.js is byte-identical to a fresh minify of planner.js
  ✓ translations.min.js is byte-identical to a fresh minify of translations.js
  ✓ style.min.css is byte-identical to a fresh minify of style.css
  ✓ planner-styles.min.css is byte-identical to a fresh minify of planner-styles.css
  ✓ pool-detail-styles.min.css is byte-identical to a fresh minify of pool-detail-styles.css
home.html / plan.html reference minified assets, not raw sources
  ✗ home.html loads style.min.css, translations.min.js, planner.min.js, *.compiled.min.js
    home.html does not load translations.min.js
  ✗ plan.html loads style.min.css, translations.min.js, planner.min.js, planner-styles.min.css
    plan.html still loads raw planner.js

7 minified-asset assertions passed
BASELINE_EXIT=1
```

### 4. Surrounding suites
```
$ node test_planner.js            → All 208 assertions evaluated.        EXIT=0
$ node test_protocol_parsing.js   → 9/9 passed                           EXIT=0
$ node test_qualifier_fix.js      → 9/9 passed                           EXIT=0
$ node test_northstar_cta_fires.js
  ✓ url_direct: landing on /?pool=<id> fires pool_view(source=url_direct) with segmentation props
  ✓ url_direct: "Garden this pool" CTA fires pool_click(source=garden_cta) with segmentation props
  ✓ url_direct: "Start Earning on <protocol>" link fires pool_click(source=protocol_link) with segmentation props, no navigation
  ✓ card_click: clicking a pool card fires pool_view(source=card_click) with segmentation props
  ✓ card_click: "Garden this pool" CTA fires pool_click(source=garden_cta) with segmentation props
  ✓ card_click: "Start Earning on <protocol>" link fires pool_click(source=protocol_link) with segmentation props, no navigation
  ✓ no unexpected page/console errors across either path
test_northstar_cta_fires.js: 7/7 tests passed                            EXIT=0
$ node test_dead_pool.js
  ✓ dead ?pool= renders honest empty state (EN title), no all-pools grid, robots=noindex
  ✓ alternatives render above the floor; clicking one -> pool detail + robots restored
  ✓ valid ?pool= renders pool detail and robots stays "index, follow" (never noindexed)
  ✓ dead ?pool=&lang=ko renders the KO poolNotFoundTitle string
  ✓ valid ?token= still renders pool cards and stays indexable (dead-pool path does not disturb token path)
5 dead-pool assertions passed                                            EXIT=0
```

No command exceeded the 5-minute timebox (longest was ~25s).

## Acceptance criteria status

| AC | Status |
|----|--------|
| 1 — absurd case: card absent, no `36,452`/`36452` anywhere | ✅ assertion 1 |
| 2 — 071 note suppressed, CTAs + stat grid render, zero page errors | ✅ assertions 2, 8 |
| 3 — no over-suppression (sane card renders; 071 divergent case preserved) | ✅ assertions 3, 4 + `test_rate_volatility.js` 5/5 |
| 4 — junk values (NaN, negative; plus Infinity) → card absent, no junk text | ✅ assertions 5, 6, 7 |
| 5 — `test_rate_volatility.js` fully passes | ✅ 5/5 |
| 6 — compiled + minified regenerated, freshness gates | ✅ `test_compiled_assets.js` 4/4; `test_minified_assets.js` — all PoolDetail assertions green, 2 pre-existing unrelated failures proven by baseline |
| 7 — no trust-rail constant changed, no dependency, no new user-facing string | ✅ |
