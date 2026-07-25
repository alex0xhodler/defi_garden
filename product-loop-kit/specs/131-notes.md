# 131 — build notes (deviations, conservative choices)

## What was built
Item 131: dedupe the double-rendered "Browse tokens · Browse chains" on the north-star (pool-detail) page. Root-caused to the 086 dedup rule living only in `style.css`, which loads via the async `media="print"` swap — so before that swap fires (initial paint on the empty `#root`, and any headless renderer, incl. the 2026-07-23 audit that filed this item) the static `.seo-hub-links` footer shows alongside the React `.app-footer` copy → two visible link sets.

Fix = mirror the one dedup rule as **render-blocking inline critical CSS** in `home.html`'s `<head>`:
`<style>html[data-app-mode="analytics"] .seo-hub-links{display:none}</style>`.

## Files changed (3)
- `home.html` — inline critical `<style>` + explanatory comment, inserted after the `style.min.css` `<noscript>` line, before the mode-conditional CSS script. Router logic untouched; no param behavior change.
- `style.css` — one breadcrumb comment line before the existing 086 rule (keep-in-sync pointer). Existing rule left intact.
- `test_footer_hub_links.js` — new rendered-Playwright case (e) on `/?pool=usdc-base-aave`, asserting single-instance **without** forcing the async CSS swap (the exact regression).

## Deviations / conservative choices
- **Did NOT remove the style.css rule** (spec allowed either). Kept it + added a sync-pointer comment so no asset regeneration (`style.min.css`) was needed and the diff stays to `home.html` + test. The inline copy is deliberate critical-CSS mirroring, not a duplicated component.
- **Did NOT touch `app.js`** — the `.app-footer` hub links are the correct visible copy for JS users; unchanged.
- **Did NOT bundle the `playwright ^1.61.1 → ^1.62.0` bump** that `npm install` incidentally wrote to package.json/lock while setting up local test runs — reverted it; item 131's diff carries no dependency change.

## Test results (timeboxed, rendered Playwright on real UI)
- `node test_footer_hub_links.js`: NEW case (e) PASS — `.seo-hub-links` computes `display:none` pre-swap, exactly 1 visible `/tokens` + 1 `/chains`, both in `.app-footer-hub-links`. Analytics case (a) + KO case (c) + raw-source case (d) PASS.
- `node test_smoke.js`: all analytics + pool-detail cases PASS (`?token=` cards @360/768/1280, `?pool=` BreadcrumbList JSON-LD).
- **Pre-existing, unrelated env failures** (NOT caused by 131, proven by `git stash` baseline re-run — case (b) fails identically on clean `home.html`): every **planner-mode** browser assertion (`bare /` → `#planner-root [class*="gp-"]` timeout). Cause: the planner root needs external font/analytics fetches that fail in this headless sandbox (CLAUDE.md sandbox note). My change is analytics-mode-only (`data-app-mode="analytics"`) and cannot affect planner rendering.
- Full `npm test` (80+ Playwright tests) not run to completion: would exceed the 5-min timebox with more of the same environmental planner-mount failures. Verified the render paths the change actually touches instead.

## Risk
LOW — a single analytics-mode styling rule promoted to critical CSS; no new deps, no router-logic/param-behavior change, no i18n strings, diff well under 150 lines. (home.html is a sensitive file, so flagged for the verifier to independently tier; the change adds only a static `<style>` and does not alter `__APP_MODE` or parameterized-URL handling.)
