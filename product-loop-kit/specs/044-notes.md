# 044 build notes

## Finding: the Mixpanel zeros were a wiring bug, not a traffic gap
Both acceptance checks were run as live headless renders (not fixture-string
assertions):

- `?pool=<id>` url_direct `pool_view` — already live-render-verified by
  test_search.js's existing "?pool= deep link fires pool_view(source=url_direct)…"
  test (added under 020). Reran it standalone: passes (20/20 in test_search.js).
  **This half was already sound.**
- `/tokens/<slug>` `page_view` — no live-render test existed; the only
  coverage (test_token_pages.js/test_chain_pages.js/test_stories.js) grepped
  the generator's output string for `Analytics.trackPageView(...)`. Wrote
  `test_analytics_fires.js`, which serves a real generated token page and
  intercepts `Analytics.track` in a real Chromium load. **It failed on the
  unmodified generator: zero events captured.**

Root cause: `renderAnalyticsBootstrap()` in `generate-token-pages.js` (and
the duplicate copy in `generate-stories.js`) gated the tracking call behind
`if (window.Analytics && typeof Analytics.trackPageView === 'function')`.
`analytics.js` declares `const Analytics = {...}` at the top level of a
classic (non-module) `<script>`. Top-level `const`/`let` in a classic script
creates a binding in the shared global *lexical* environment, visible to
later classic `<script>` tags as a bare identifier — but it is **not**
installed as a property of `window`. So `window.Analytics` is always
`undefined` on every generated static page, the `if` guard always failed,
and `Analytics.trackPageView` never ran — on any of the ~2,045 `/tokens/*`
pages, the ~88 `/chains/*` pages, or the hub pages that share the same
bootstrap function. (`app.js` calls `Analytics.trackPageView` unguarded —
a bare identifier reference — which is why the app's own page views tracked
fine; this bug only affected the generator-injected bootstrap's own guard.)

This fully explains `signals/2026-07-12.md`'s `/tokens/* page_view = 0`
independent of organic traffic — the event could never have fired even with
visitors.

## Fix
`generate-token-pages.js` and `generate-stories.js`: changed the guard from
`window.Analytics` to `typeof Analytics !== 'undefined'` in
`renderAnalyticsBootstrap()`. Verified fixed by rerunning
`test_analytics_fires.js` against the patched generator — passes.

`generate-chain-pages.js` requires `renderAnalyticsBootstrap` from
`generate-token-pages.js` rather than defining its own copy, so chain pages
and the `/tokens`, `/tokens/az/*` hub pages are fixed by the same edit.

## Deviation from spec
Spec's OUT OF SCOPE said "if it fires, close as verified... if not, this
spec's build loop fixes the wiring." It fired for pool_view, did not fire
for page_view — so per spec this became a real (small, generator-only) fix,
not a pure verification pass. Diff is confined to the two `renderAnalyticsBootstrap`
functions, as the spec's contingency anticipated.

## Residual: checked-in static pages are stale until next regen
The fix is in the generator source. The 2,045 `tokens/*.html` + 88
`chains/*.html` files already committed to the repo still carry the broken
guard until regenerated — `.github/workflows/sitemap-update.yml` triggers on
push-to-main touching `generate-token-pages.js`/`generate-chain-pages.js`
and will regenerate + commit real pages with the fix on the next run (same
pattern items 041/045 relied on; this sandbox's `yields.llama.fi` egress is
blocked, confirmed via curl/proxy status, so a live regen isn't possible
here).

`stories/*.html` (3 files: kevin/tomoko/lucia) are separately stale —
`generate-stories.js` has no offline/fixture mode and no CI workflow
regenerates it automatically (`CLAUDE.md` documents this as a manual
"re-run and commit" step). The checked-in `stories/*.html` currently predate
039's analytics bootstrap entirely (no Mixpanel/analytics.js there at all,
confirmed by grep) — that staleness is pre-existing and independent of this
fix. `generate-stories.js`'s source now has the same `typeof Analytics`
guard fix; a human/future loop with network access needs to run
`node generate-stories.js` and commit the regenerated files.

## Tests
Added `test_analytics_fires.js` (live Chromium render of a real generated
`/tokens/<slug>` page, intercepts `Analytics.track`, asserts one
`page_view` with `path`/`page_type` correct). Wired into `npm test`.
`test_smoke.js` fails in this sandbox (unpkg.com egress blocked) — confirmed
pre-existing on the unmodified branch too (same failure, `git stash` verified),
not a regression from this change.
