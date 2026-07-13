# 063 build notes

## What shipped
Three new Mixpanel events instrumenting the gap between `waitlist_opened` and `waitlist_submitted` (009), across BOTH waitlist entry points (the bloom-moment modal in `submitWaitlist`/`ctaElement` and the SEO quick-entry modal in `submitQuickWaitlist`, backlog 062):

- `waitlist_email_entered` — fires once per modal open, on first `onFocus` of the email input (ref-guarded so repeated focus/blur doesn't spam events; ref resets each time the modal is opened via `setWaitlistOpen(true)`/URL param).
- `waitlist_submit_attempt` — fires right before the `fetch()` to Formspree, after client-side validation passes (non-empty + regex-valid email).
- `waitlist_error({ reason })` — fires on every rejection path: `empty_email` (blocked before submit), `invalid_email` (blocked before submit), `formspree_error` (non-OK response), `network` (fetch rejects/throws). Reasons match the spec's exact list.

`waitlist_opened`/`waitlist_submitted` (009) are unchanged — same call sites, same payload shape.

## Deviations from spec
- The spec's phrasing is "first focus/keystroke". Both waitlist email inputs have `autoFocus: true`, so a plain `onFocus` handler fires immediately on mount (browser autofocus), before any real user action — this was caught by the Playwright test below (`waitlist_email_entered` landed before `waitlist_opened` in the tracked-event order, an impossible funnel step). Switched to firing on first `onChange` (first keystroke) instead — a genuine user-engagement signal, immune to autofocus false-positives, still ref-guarded to fire once per modal open.
- `empty_email`/`invalid_email` are effectively unreachable via mouse click today (the submit button is `disabled` when `!emailValid`), but a `<form onSubmit>` can still fire via Enter-key in some edge cases before React state settles, and HTML5 `required`/`type=email` validation isn't 100% consistent across browsers/autofill paths — kept the reasons per spec rather than assuming they're truly dead code.
- Regenerated `planner.min.js` via `npm run minify` (plan.html loads the minified file, not planner.js directly) — this is the exact gap that bit backlog 061 (translations.min.js shipped stale). Verified via `test_minified_assets.js` (byte-identical check) before shipping.

## No UX/behavior change
Confirmed: no new DOM elements, no new copy/translation keys, no change to validation/disabled-state logic — purely additive `Analytics.track*` calls.

## Verification (Playwright, real rendered UI, not fixtures)
New `test_waitlist_funnel.js` (fixture-routed local server + mocked formspree endpoint, same pattern as `test_waitlist_seo_entry.js`) drives the real quick-waitlist modal (`plan.html?waitlist=1&src=seo_token`) end to end:
1. First keystroke in the email field → `waitlist_email_entered` fires exactly once (further edits don't re-fire); submit → `waitlist_submit_attempt` fires, then `waitlist_submitted(success=true)`; event order `opened → email_entered → submit_attempt → submitted` verified; no `waitlist_error`.
2. Formspree responds 500 → `waitlist_error(reason=formspree_error)` + `waitlist_submitted(success=false)`.
3. Formspree request aborted (network failure) → `waitlist_error(reason=network)` + `waitlist_submitted(success=false)`.

This caught a real bug before shipping: the initial implementation used `onFocus` for `waitlist_email_entered`, but both email inputs have `autoFocus: true`, so the browser's automatic mount-time focus fired the event immediately — before `waitlist_opened` even landed in the tracked-event queue (impossible funnel order, and every modal open would "enter email" with zero user action). Fixed by moving the (still once-per-open, ref-guarded) tracking to the first `onChange` (first keystroke) instead — verified fix via the order assertion above.

Full `npm test` chain: `test_smoke.js` (and downstream tests gated behind it in the `&&` chain) fail in this sandbox on the pre-existing, extensively-documented network limitation (Chromium can't reach `unpkg.com`/`yields.llama.fi` — NORTH_STAR.md 2026-07-12 entry; same failure mode noted on ~15 prior shipped items). Confirmed unrelated to this diff: this change touches only `planner.js` (waitlist modals) and `analytics.js` (new track methods) — no `home.html`/router/app.js changes, and the bare-`/`/`?token=` failures are the same fixture-independent smoke checks that fail identically on `main` today. `test_planner.js` (190 assertions), `test_minified_assets.js` (7 assertions), `test_waitlist_seo_entry.js` (4 assertions), and the new `test_waitlist_funnel.js` (3 assertions) all pass clean — the only tests that touch this change's actual surface.
