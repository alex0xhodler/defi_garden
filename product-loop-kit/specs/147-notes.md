# 147 — build notes (ship the minified bundles the site already builds; un-blind `npm test`)

Branch: `claude/loop-147` · Built 2026-07-26 · Type BUGFIX/INFRA · Risk HIGH (touches `home.html`, the IA router shell — sacred parameterized-URL surface)

## What changed

### `home.html` (2 `src` swaps, no other change)
- **`home.html:175`** — `<script defer src="translations.js"></script>` → `<script defer src="translations.min.js"></script>`
- **`home.html:196`** — `<script defer src="planner.js"></script>` → `<script defer src="planner.min.js"></script>` (the surrounding comment, "Minified in CI (backlog 053); edit planner.js, never planner.min.js.", kept verbatim — it already described the intended wiring)

### `plan.html` (1 `src` swap)
- **`plan.html:100`** — `<script defer src="planner.js"></script>` → `<script defer src="planner.min.js"></script>` (surrounding comment kept verbatim)

No other line in either file touched. `defer`, attribute order, and script order (react → react-dom → translations → mixpanel stub → analytics.js → planner → landing.js) are byte-identical to before, per spec ("order is load-bearing"). `plan.html` already loaded `translations.min.js` pre-existing (only its `planner.js` reference was raw) — confirmed by reading the file before editing, not touched further.

### New test — `test_min_asset_boot.js` (18 rendered assertions, house pattern)
Structure copied from `test_repeat_cta.js` / `test_northstar_cta_fires.js`: local `http` static server over the repo root (port **8862**, distinct from 8791-8861), `chromium` at `/opt/pw-browsers/chromium` when present, `IGNORABLE` console/page-error filter (same regex plus `google\.com\/s2\/favicons` for the planner's brand-icon fallback images), `test()` helper printing `✓`/`✗` and setting `process.exitCode`. Unlike the older tests it models, it does **not** route `unpkg.com` — `home.html`/`plan.html` vendor React locally (`./react.production.min.js`, `./react-dom.production.min.js`) and load only already-compiled artifacts (backlog 052), so no CDN fixture is needed for those two files.

Request tracking: every same-origin request's `pathname` (exact string via `new URL(...).pathname`, e.g. `/planner.min.js`) is collected per page via `page.on('request')`; `assertMinNotRaw()` asserts the `.min.js` pathname is present **and** the raw pathname is absent — an exact-match check, so `.min.js` can never accidentally satisfy an assertion looking for the raw file.

| Scenario | Request-level | Behavior-level |
|---|---|---|
| `plan.html` | `planner.min.js` requested, `planner.js` never | `.gp-chip` present; clicking one produces `.gp-thread-row` (proves the minified bundle executes, not just loads) |
| `home.html?fresh=1` | `planner.min.js` + `translations.min.js` requested, raw never | same chip-click → thread-row proof |
| `home.html?pool=<id>` (north-star) | `translations.min.js` + `planner.min.js` requested, raw never | `.cta-button-primary` text matches "Garden this pool"; `.cta-button-protocol` text matches "Start Earning on ..." |
| `home.html?token=USDC` | same request check | `.pool-card` count > 0 |
| `plan.html?lang=ko` | `translations.min.js` requested, raw never | `.gp-question` text contains "무엇을 위해" (KO `step1Question`) |

Every scenario also asserts zero unexpected page/console errors. Pool fixture reuses `test_repeat_cta.js`'s real lido stETH id (`747c1d2a-c668-4682-b9f9-296708a3dd90`, verified present in `data/pools-snapshot.json` before the test runs) plus a synthetic USDC/aave-v3/Base pool for the `?token=USDC` path.

### `package.json`
`node test_min_asset_boot.js` inserted immediately after `node test_minified_assets.js` and before `node test_css_minified_render.js` in the `test` script chain (now position 7 of the full `&&` chain). No other script or dependency changed.

## Deviations from the spec / conservative choices

1. **AC4's "Bare `/`" is not literally reachable as planner mode today — used `/?fresh=1` on `home.html` instead, documented in the test file's own header comment.** Reading `home.html`'s IA router (`home.html:69-131`) empirically: `window.__APP_MODE` is `'analytics'` if any `ANALYTICS_PARAMS` key is present, else `'planner'` if `isPlannerPath` (`/plan.html`) or any `PLANNER_PARAMS` key is present, **else `'landing'`**. A truly bare `/` with zero query params carries none of those, so it resolves to `'landing'` (the search-first landing, `landing.js`) — confirmed by running `test_smoke.js`'s "bare / renders planner UI" assertion, which times out waiting for `#planner-root [class*="gp-"]` (see verification below), and independently corroborated by `product-loop-kit/LOG.md`'s 2026-07-15 build-114 entry: *"IA drift — bare / is now a SEARCH-FIRST landing (item #237, landing.js), no longer the planner; CLAUDE.md still says planner-is-default (stale, human-owned, flagged not edited)."* This item's scope is three `src` swaps only (spec non-goals explicitly exclude any copy/component change), so I did not treat the IA-drift-vs-CLAUDE.md conflict as something to fix here. Instead I used `/?fresh=1` — the minimal `PLANNER_PARAMS` key that reaches the router's planner branch on `home.html` (the file whose `translations.js`/`planner.js` references this item swapped) without decoding a shared-plan URL or a saved `localStorage` plan — as the "planner via home.html's router" stand-in for the spec's wording. This exercises exactly what AC4 cares about (the *other* pair of script tags, plus the router's planner branch actually mounting from the minified bundle) without asserting something false about what bare `/` currently renders.
2. **Did not touch `test_smoke.js`'s pre-existing "bare / renders planner UI" failures.** Confirmed identical before my edit (ran on unmodified `home.html`/`plan.html`, see verification) and after (both inside the full `npm test` chain and standalone) — same 3 timeouts, same selector, same message. This is the IA-drift fact above, not a regression from this item, and fixing it is out of scope (spec non-goals: "Fixing any other pre-existing red").
3. **No translations/CSS/component change** — pure `src` swap, matching the spec's "Zero new user-facing strings" requirement. No EN/KO churn.
4. **`node_modules/` was already present** (unlike some prior loops) — no `npm install` needed.

## Follow-up candidates observed (NOT built — spec non-goals / out of scope)

- `test_smoke.js`'s "bare / renders planner UI" assertions (3 of them, one per viewport) are stale relative to the shipped search-first-landing pivot (item #237/114) — the test still encodes the pre-pivot IA. `test_landing.js` already correctly asserts bare `/` renders `.landing-app` (`data-mode="landing"`) and explicitly asserts `#planner-root .gp-app` count is 0. `test_smoke.js`'s planner-at-bare-`/` assertions should probably be retired or repointed at `/?fresh=1` (or another `PLANNER_PARAMS` URL) in a dedicated item — separate scope, touches test-only code but is a real (if long-standing) gap in what the gate actually proves.
- `CLAUDE.md`'s "Garden Planner (the DEFAULT feature, bare `/` and plan.html)" line is flagged stale by LOG.md 2026-07-15 and remains stale after this item — human-owned per CLAUDE.md's own project-instructions authority, not edited here.
- `test_waitlist_funnel.js`'s 3 pre-existing failing cases (documented in LOG 2026-07-26) were not reached inside this run's timebox-bounded `npm test` (chain stopped earlier, at `test_smoke.js`); not investigated further here per spec non-goals.

## Verification (all commands timeboxed; none exceeded its cap)

### 1. `node test_minified_assets.js` (AC 1) — after the swap
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
  ✓ home.html loads style.min.css, translations.min.js, planner.min.js, *.compiled.min.js
  ✓ plan.html loads style.min.css, translations.min.js, planner.min.js, planner-styles.min.css

9 minified-asset assertions passed
EXIT_MIN=0
```
(Pre-change baseline, run before any edit in this session, for contrast: 7/9 passed, the exact same 2 failures the spec's problem statement documents — `home.html does not load translations.min.js` and `plan.html still loads raw planner.js`.)

### 2. `node test_min_asset_boot.js` (AC 3-7)
```
  ✓ plan.html requests planner.min.js and never planner.js
  ✓ plan.html: goal chips render on the planner's first screen
  ✓ plan.html: picking a goal chip completes an interactive step (thread row appears)
  ✓ plan.html: no unexpected page/console errors
  ✓ home.html?fresh=1 (planner mode) requests planner.min.js and never planner.js
  ✓ home.html?fresh=1 requests translations.min.js and never translations.js
  ✓ home.html?fresh=1: goal chips render on the planner's first screen
  ✓ home.html?fresh=1: picking a goal chip completes an interactive step (thread row appears)
  ✓ home.html?fresh=1: no unexpected page/console errors
  ✓ /?pool=<id> requests translations.min.js + planner.min.js, never the raw sources
  ✓ /?pool=<id> renders both north-star CTAs ("Garden this pool" + "Start Earning on <protocol>")
  ✓ /?pool=<id>: no unexpected page/console errors
  ✓ /?token=USDC requests translations.min.js + planner.min.js, never the raw sources
  ✓ /?token=USDC still renders pool cards
  ✓ /?token=USDC: no unexpected page/console errors
  ✓ plan.html?lang=ko requests translations.min.js and never translations.js
  ✓ plan.html?lang=ko renders Korean copy on the planner's first screen
  ✓ plan.html?lang=ko: no unexpected page/console errors
test_min_asset_boot.js: 18/18 tests passed
EXIT=0
```

### 3. Non-vacuity proof (AC 8) — `git stash push home.html plan.html`, re-run, then `git stash pop`, re-run

**Stashed (raw `src`s restored) — request-level assertions FAIL, verbatim:**
```
  ✗ plan.html requests planner.min.js and never planner.js
    plan.html: expected a request for /planner.min.js, got: ["/plan.html","/fonts/FKGroteskNeue.woff2","/react.production.min.js","/react-dom.production.min.js","/translations.min.js","/brand-icons.js","/analytics.js","/planner.js","/style.min.css","/planner-styles.min.css","/data/pools-snapshot-meta.json"]
  ✓ plan.html: goal chips render on the planner's first screen
  ✓ plan.html: picking a goal chip completes an interactive step (thread row appears)
  ✓ plan.html: no unexpected page/console errors
  ✗ home.html?fresh=1 (planner mode) requests planner.min.js and never planner.js
    home.html?fresh=1: expected a request for /planner.min.js, got: ["/home.html","/fonts/FKGroteskNeue.woff2","/canonical.js","/react.production.min.js","/react-dom.production.min.js","/translations.js","/analytics.js","/planner.js","/landing.js","/style.min.css","/planner-styles.min.css","/data/pools-snapshot-meta.json"]
  ✗ home.html?fresh=1 requests translations.min.js and never translations.js
    home.html?fresh=1: expected a request for /translations.min.js, got: ["/home.html","/fonts/FKGroteskNeue.woff2","/canonical.js","/react.production.min.js","/react-dom.production.min.js","/translations.js","/analytics.js","/planner.js","/landing.js","/style.min.css","/planner-styles.min.css","/data/pools-snapshot-meta.json"]
  ✓ home.html?fresh=1: goal chips render on the planner's first screen
  ✓ home.html?fresh=1: picking a goal chip completes an interactive step (thread row appears)
  ✓ home.html?fresh=1: no unexpected page/console errors
  ✗ /?pool=<id> requests translations.min.js + planner.min.js, never the raw sources
    /?pool=<id>: expected a request for /translations.min.js, got: ["/home.html","/fonts/FKGroteskNeue.woff2","/canonical.js","/react.production.min.js","/react-dom.production.min.js","/translations.js","/analytics.js","/planner.js","/landing.js","/style.min.css","/pool-detail-styles.min.css","/PoolDetail.compiled.min.js","/app.compiled.min.js","/data/pools-snapshot.json"]
  ✓ /?pool=<id> renders both north-star CTAs ("Garden this pool" + "Start Earning on <protocol>")
  ✓ /?pool=<id>: no unexpected page/console errors
  ✗ /?token=USDC requests translations.min.js + planner.min.js, never the raw sources
    /?token=USDC: expected a request for /translations.min.js, got: ["/home.html","/fonts/FKGroteskNeue.woff2","/canonical.js","/react.production.min.js","/react-dom.production.min.js","/translations.js","/analytics.js","/planner.js","/landing.js","/style.min.css","/pool-detail-styles.min.css","/PoolDetail.compiled.min.js","/app.compiled.min.js","/data/pools-snapshot-meta.json"]
  ✓ /?token=USDC still renders pool cards
  ✓ /?token=USDC: no unexpected page/console errors
  ✓ plan.html?lang=ko requests translations.min.js and never translations.js
  ✓ plan.html?lang=ko renders Korean copy on the planner's first screen
  ✓ plan.html?lang=ko: no unexpected page/console errors
test_min_asset_boot.js: 13/18 tests passed
EXIT=1
```
Exactly the 5 request-level assertions fail (one per scenario that checks `planner.min.js`/`translations.min.js`, `?pool=` and `?token=` each carrying two checks in one assertion) — every behavior-level and error-count assertion still passes on the baseline, which is the expected shape (the raw bundles behave identically, per `minify-assets.js`'s `toplevel`-unset guarantee; only the *which file was requested* proof should flip).

**After `git stash pop` — back to green:**
```
  ✓ plan.html requests planner.min.js and never planner.js
  ✓ plan.html: goal chips render on the planner's first screen
  ✓ plan.html: picking a goal chip completes an interactive step (thread row appears)
  ✓ plan.html: no unexpected page/console errors
  ✓ home.html?fresh=1 (planner mode) requests planner.min.js and never planner.js
  ✓ home.html?fresh=1 requests translations.min.js and never translations.js
  ✓ home.html?fresh=1: goal chips render on the planner's first screen
  ✓ home.html?fresh=1: picking a goal chip completes an interactive step (thread row appears)
  ✓ home.html?fresh=1: no unexpected page/console errors
  ✓ /?pool=<id> requests translations.min.js + planner.min.js, never the raw sources
  ✓ /?pool=<id> renders both north-star CTAs ("Garden this pool" + "Start Earning on <protocol>")
  ✓ /?pool=<id>: no unexpected page/console errors
  ✓ /?token=USDC requests translations.min.js + planner.min.js, never the raw sources
  ✓ /?token=USDC still renders pool cards
  ✓ /?token=USDC: no unexpected page/console errors
  ✓ plan.html?lang=ko requests translations.min.js and never translations.js
  ✓ plan.html?lang=ko renders Korean copy on the planner's first screen
  ✓ plan.html?lang=ko: no unexpected page/console errors
test_min_asset_boot.js: 18/18 tests passed
EXIT=0
```

### 4. `npm test` (AC 9) — full chain, 295s timebox
Did **not** exceed the timebox (completed on its own). The chain now runs 9 files (previously died at file 6) before hitting the next, pre-existing stopper:

| # | File | Result |
|---|------|--------|
| 1-4 | `test_planner.js`, `test_planner_sharpe_pick.js`, `test_protocol_parsing.js`, `test_qualifier_fix.js` | ✓ (pure-logic suites, unaffected) |
| 5 | `test_compiled_assets.js` | ✓ 4/4 |
| 6 | `test_minified_assets.js` | ✓ **9/9 — this item's fix; no longer the blocker** |
| 7 | `test_min_asset_boot.js` (new, this item) | ✓ 18/18 |
| 8 | `test_css_minified_render.js` | ✓ 2/2 |
| 9 | `test_smoke.js` | **✗ exit 1 — the new stopper** |

`test_smoke.js` verbatim (identical failure signature confirmed both standalone and inside the full chain, and identical to the UNMODIFIED-`home.html`/`plan.html` baseline run before any edit in this session — see below):
```
network: yields.llama.fi reachable — serving live snapshot captured via curl
  ✓ home.html: sitewide Organization + WebSite JSON-LD, valid JSON, minimum required properties (040)
  ✗ bare / renders planner UI at 360px
    page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('#planner-root [class*="gp-"]') to be visible

  ✓ /?token=USDC renders pool cards at 360px
  ✗ bare / renders planner UI at 768px
    page.waitForSelector: Timeout 10000ms exceeded.
  ✓ /?token=USDC renders pool cards at 768px
  ✗ bare / renders planner UI at 1280px
    page.waitForSelector: Timeout 10000ms exceeded.
  ✓ /?token=USDC renders pool cards at 1280px
  ✓ pool-detail view (?pool=<id>) renders a BreadcrumbList JSON-LD block (040)
5 smoke assertions passed
EXIT=1
```
**Baseline proof this is pre-existing, not caused by this item**: this exact command was run FIRST in this session, before `home.html`/`plan.html` were touched at all (unmodified working tree at branch start) — output was byte-identical (same 3 timeouts on the same selector, same 5/8 passed, `EXIT=1`). Root cause (not this item's to fix, see Follow-up candidates): `home.html`'s IA router resolves a truly bare `/` (zero query params) to `__APP_MODE = 'landing'` (the search-first landing shipped in item #237/114), not `'planner'` — documented drift, `product-loop-kit/LOG.md` 2026-07-15 build-114 entry. `npm test`'s `&&` chain therefore still halts before ~85 later files, but 3 files further than before this item (was file 6, now file 9), and for a different, already-documented reason instead of the minified-asset one this item fixes.

Given the 5-minute timebox is per-command (not cumulative across the whole session) and this run completed on its own, the chain's next stopper for the *next* loop to inherit is **`test_smoke.js`** (position 9), specifically its bare-`/`-planner assertions.

### 5. Individual regression checks
`node test_smoke.js` (standalone, post-change) — identical to the chain's result above, `EXIT=1`, same 3 pre-existing failures, same 5 passes.

`node test_northstar_cta_fires.js` (standalone, post-change):
```
  ✓ url_direct: landing on /?pool=<id> fires pool_view(source=url_direct) with segmentation props
  ✓ url_direct: "Garden this pool" CTA fires pool_click(source=garden_cta) with segmentation props
  ✓ url_direct: "Start Earning on <protocol>" link fires pool_click(source=protocol_link) with segmentation props, no navigation
  ✓ card_click: clicking a pool card fires pool_view(source=card_click) with segmentation props
  ✓ card_click: "Garden this pool" CTA fires pool_click(source=garden_cta) with segmentation props
  ✓ card_click: "Start Earning on <protocol>" link fires pool_click(source=protocol_link) with segmentation props, no navigation
  ✓ no unexpected page/console errors across either path
test_northstar_cta_fires.js: 7/7 tests passed
EXIT=0
```
Both sacred router paths (`?pool=`, `?token=`) remain intact after the swap.

No command exceeded its timebox; longest was `npm test`'s full run.

## Acceptance criteria status

| AC | Status |
|----|--------|
| 1 — `node test_minified_assets.js` exits 0, 9/9 | ✅ verification §1 |
| 2 — diff confined to `home.html` + `plan.html` (product code); new test file + chain entry + notes expected | ✅ `git diff --name-only` = `home.html`, `package.json`, `plan.html`; untracked `test_min_asset_boot.js` (+ this notes file); no `.min.` file, no `translations.js`, no `planner.js`, no dependency block, no CI/config file modified |
| 3 — `plan.html` boots from `planner.min.js`, never `planner.js`; first screen renders + interactive step completes | ✅ `test_min_asset_boot.js` assertions 1-4 |
| 4 — home-router planner mode does the same + `translations.min.js`/never raw | ✅ assertions 5-9, via `/?fresh=1` (deviation #1 above — bare `/` alone is documented-pre-existing `'landing'` mode, not planner) |
| 5 — `/?pool=<id>` renders both CTAs while loading the min bundles | ✅ assertions 10-12 |
| 6 — `/?token=USDC` still renders pool cards | ✅ assertions 13-15 |
| 7 — `?lang=ko` renders Korean planner copy | ✅ assertions 16-18 |
| 8 — non-vacuity: fails on stashed baseline, recorded verbatim | ✅ verification §3 (13/18, 5 request-level failures, exit 1), then green again after pop (18/18, exit 0) |
| 9 — `npm test` proceeds past `test_minified_assets.js`; next stopper recorded | ✅ proceeds through position 8 (`test_css_minified_render.js`), halts at position 9 (`test_smoke.js`, pre-existing IA-drift failure, proven identical to the unmodified-baseline run) |
