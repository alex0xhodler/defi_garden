# 116 — build notes

## Deviations from spec
- **Render placement**: chose spec option A — the share control is its own
  sibling `gp-report-reminder` block rendered directly *above* the existing
  tend-reminder block (not nested inside it). Inherits centering + note styling,
  zero new CSS.
- **`useState` alias**: used the file-local `useState` alias (= `React.useState`,
  aliased at planner.js:10) to match `GardenReport`'s surrounding style
  (`useMemo` alias). Functionally identical to `React.useState`.

## Conservative choices
- Reused the shipped `doCopyLink` clipboard pattern (planner.js:2048) verbatim —
  `navigator.clipboard.writeText` + textarea/`execCommand` fallback, wrapped in
  try/catch. No new share mechanic invented.
- `encodePlanToUrl` arg list is byte-identical to `reportTendReminder`'s call, so
  the copied link and the `.ics` reminder link rebuild the exact same garden.
- Analytics call is guarded by `typeof Analytics !== 'undefined'` (same guard the
  tend-reminder uses); `surface: 'report'` is additive context — `trackShareLinkCreated`
  spreads its arg, so bloom call sites are unaffected.
- Zero new CSS: reused `gp-share-textlink`, `gp-report-reminder`, `gp-tend-reminder-note`.

## Verification (independently re-run by the build loop, not just the coding agent)
- `node test_report_share.js` → **7/7 passed** (present+visible; click copies a
  `goal=` URL with no yields fetch + shows "Copied!"; EN CTA /Share my garden/i,
  no raw key; KO localized 공유/정원, no raw key; dark 360/768/1280 no h-scroll,
  zero page errors).
- `node test_minified_assets.js` → the 7 byte-identity assertions PASS, incl.
  "planner.min.js is byte-identical to a fresh minify of planner.js" and the
  translations.min.js equivalent (my regen is correct). The 2 failing assertions
  ("home.html loads …min.js", "plan.html loads …min.js") are **PRE-EXISTING** —
  confirmed identical (7 passed / same 2 fails) on a `git stash` baseline of
  planner.js/translations.js/*.min.js/package.json. Not this diff.
- `node test_smoke.js` → analytics-app assertions pass; the 2 `bare /` planner
  assertions fail on the known sandbox HTTPS block for the React UMD bundle
  (NORTH_STAR standing decision 2026-07-12) — sandbox limit, not a code bug.

## Minified assets
- `npm install` (deps weren't present) then `node minify-assets.js` (repo `minify`
  script) regenerated `planner.min.js` + `translations.min.js`. Verified they carry
  `trackShareLinkCreated({method:"copy",surface:"report"…` and both EN/KO
  `reportShareCta`/`reportShareNote` strings.

## Instrumentation
- `share_link_created { method: 'copy', surface: 'report', goal, persona }` — new
  report-surface share-origination point. Traffic-gated (north star 0 until the
  human posts 069 distribution); ships the mechanism so it exists when traffic lands.

## Attempt 1 → 2 (verifier FAIL, fixed)
- **Verifier caught a real, correct bug**: `analytics.js` `trackShareLinkCreated`
  (346-352) hardcodes `{method, goal, persona}` and does NOT spread `context`, so
  the call site's `surface:'report'` was silently dropped before Mixpanel — the
  measurement plan was unmeasurable (instrumentation-gate FAIL). The spec's
  territory note had the false premise that this function spreads context.
- **Fix**: added `surface: context.surface || null` to `trackShareLinkCreated`'s
  emitted payload (analytics.js, mirroring `trackTendReminderAdded` at line 365).
  analytics.js ships unminified (no min variant), loaded directly by plan.html →
  no min regen for it. Backward-compatible: bloom shares emit `surface:null`.
- **Closed the test's assertion gap**: `test_report_share.js` now patches the
  bare global `Analytics.track` and asserts the emitted `share_link_created`
  payload carries `surface:'report'` + `method:'copy'`. First attempt at this
  wrongly used `window.Analytics` (undefined — `Analytics` is a top-level `const`,
  a bare global, not a window property: item 044's lesson); fixed to reference the
  bare binding. Now **8/8** (was 7/7 — the 7-pass suite passed while the
  instrumentation was silently broken, which is exactly the false-confidence gap
  the verifier flagged).
