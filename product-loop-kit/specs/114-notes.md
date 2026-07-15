# 114 — build notes (deviations + conservative choices)

## What shipped
A "Welcome back" saved-garden re-entry card on the search-first landing (`landing.js`).
When `localStorage['garden-plan']` holds a valid plan with a recognizable goal, the
existing `.landing-garden-card` aside is swapped from the generic "Have a goal in mind? /
Plant a garden" prompt to a return card: leaf mark + "Welcome back" caption, the goal
label as the heading, an optional "Planted <Month YYYY>" status line, and a one-tap
"Tend your garden →" link to `plan.html` (report mode auto-loads there). First-time
visitors and any invalid/malformed plan keep the generic card unchanged.

## Deviations / conservative choices (data for the improve loop)
1. **Goal label via a duplicated static lookup map, not `goalById`.** planner.js owns the
   canonical GOALS list (id → `labelKey`), but planner.js is NOT loaded on the landing
   route and there is no shared module system (IIFEs, no build step). The id→labelKey
   mapping is irregular (`uber`→`goalUberOne`, `youtubepremium`→`goalYouTubePremium`,
   `appletv`→`goalAppleTV`), so it cannot be derived from the id by a transform. Chose a
   read-only `GOAL_LABEL_KEYS` map in landing.js (all 24 current goal ids) that resolves
   `translations[lang].planner[labelKey]`. This is a **static label lookup, not rate math**
   — the spec's "do NOT duplicate `gardenStage`" ban is about the stage/rate logic, which
   is fully avoided (no stage emoji, static leaf mark only). Drift risk: if planner.js adds
   a NEW goal id later, an unrecognized id **fails safe to the generic card** (no crash, no
   raw key) rather than showing a wrong label. Documented as an accepted, cosmetic-only
   drift. A future item could extract the goal metadata into a tiny shared script loaded by
   both surfaces if this map ever drifts.
2. **CTA arrow is the reused `ArrowIcon` SVG, not a literal "→" in the string.** The spec
   wrote the label as "Tend your garden →" / "정원 돌보기 →", but the existing landing card
   renders the arrow as a separate `ArrowIcon()` appended after the text (same pattern as
   `gardenCta`). Reused that pattern; the translation strings are "Tend your garden" /
   "정원 돌보기" with no literal arrow (avoids a doubled glyph). Same rendered result.
3. **No garden-stage emoji / no rate math on the landing.** Per the spec's explicit
   preference ("prefer not re-implementing rate math on the landing"), the card shows a
   static `LeafMark` and, when `savedAt` parses, a factual "Planted <Month YYYY>" line
   (reuses the exact `toLocaleDateString('en-US', { month: 'long', year: 'numeric' })`
   framing from the planner's `ReportJourney`). No "on track / ahead of plan" claim is made
   on the landing — that honest computation stays in report mode. If `savedAt` is
   missing/unparseable the status line is simply omitted (card still valid).
4. **Status line reuses the planner's `journeyPlanted` wording** ("Planted …" / "…에
   심었어요") for cross-surface consistency; the landing key is a function-valued entry
   (`returnStatus: (date) => …`), mirroring planner-subtree entries — safe (translations
   support function values; the fallback test uses a stub, does not scan the landing
   subtree for parity).
5. **Card swap, not a sibling card.** The spec allowed either; swapping the existing
   `.landing-garden-card` aside keeps exactly one card in the hero slot, reuses all
   existing neuro CSS classes (zero new CSS), and keeps the reveal/reduced-motion behavior.

## Reuse (standing decision 2026-07-10)
- Reused `.landing-garden-card`, `.landing-card-topline`, `.landing-seed-icon`,
  `.landing-card-caption`, `.landing-garden-link` CSS classes verbatim → **no CSS change**.
- Reused `LeafMark`, `ArrowIcon`, `PlantIllustration` components.
- Reused the `typeof Analytics !== 'undefined'` guard pattern (planner.js precedent; 044's
  `window.Analytics` bug fix — `Analytics` is a bare script global, never a window prop).

## Instrumentation
- `garden_reentry_shown` — fired once on mount when the card renders (effect keyed on
  `showReturnCard`). `garden_reentry_clicked` — on the CTA `onClick` (does not
  `preventDefault`; navigation proceeds). Both route through the existing `Analytics.track`
  choke point, which no-ops on non-production hosts and when `mixpanel` is undefined (so
  the Playwright tests never throw). Payload: `{ goal, archetype }` (no PII).
- Measurement: 14-day pre/post on returning-visitor → `plan.html` report-mode loads;
  below 30 events write "insufficient data". No isolable Mixpanel funnel metric until
  return traffic materializes (shares/bookmarks); this reconnects the investment→reward
  hook leg at the real front door.

## Risk
HIGH per spec (search-first landing adjacent to the sacred `__APP_MODE` IA router) — but
the change is **additive render only** inside the landing component. It does NOT touch
`home.html`'s router logic, canonical/OG, or any parameterized-URL behavior. No trust
rails, no credentials, no SEO deletion, no out-of-scope dirs. `translations.min.js`
regenerated via `npm run minify` (consumed by plan.html); landing.js is not a minify
target (loaded unminified).

## Test
New `test_landing_return.js` (rendered Playwright, house harness) wired into the `npm test`
chain: (1) valid plan → card + goal label + plan.html link; (2) no plan → generic card,
no re-entry element; (3) malformed `"{"` → fails safe, no pageerror; (4) EN + KO strings,
no raw keys; (5) dark mode at 360/768/1280, card visible, no horizontal body scroll.
**Result: 5/5 pass** in-sandbox.

### Test-harness robustness (sandbox-specific, done AFTER the first draft)
- **Single browser context, reused via `reload()`** instead of 7 fresh contexts. The
  first draft (one `browser.newContext()` per scenario) was SIGKILLed (137) — the
  sandbox cgroup memory cap (well below the host `free` figure) can't hold that many
  concurrent Chromium contexts. One context + `localStorage` set via `page.evaluate` +
  `reload` keeps memory flat and is the lighter `test_landing.js`-style pattern. The test
  never leaves the landing route (no analytics-app navigation), so it also side-steps the
  pre-existing search-nav sandbox failure below.
- **External-host stub + URL-aware error filter.** The sandbox blocks browser HTTPS to
  `mp.defi.garden` (analytics lib) and `api.fontshare.com` (fonts) → `ERR_CONNECTION_RESET`
  console errors. Chromium puts the blocked URL in `msg.location().url`, NOT `msg.text()`
  (which is only `"Failed to load resource: net::ERR_CONNECTION_RESET"`), so the house
  `IGNORABLE_ERROR_PATTERN.test(msg.text())` couldn't suppress them. Fix: `page.route` those
  hosts to an empty 200 (mixpanel then absent → `Analytics.track` no-ops, same as non-prod)
  AND widen the console filter to test `msg.location().url` too. Both changes are test-only.

### Pre-existing `npm test` chain halts (stash-baseline proven, NOT caused by 114)
- `test_landing.js` fails at its case-2 `waitForURL` (landing search → analytics app) —
  identical failure with my diff stashed (`git stash` baseline run), so it is a
  pre-existing sandbox limitation, not a regression. Its landing-card assertion (case 1)
  passes.
- `test_smoke.js` times out in-sandbox (>120s) — also pre-existing (Playwright/network),
  unrelated to this diff (touches app.js/home.html render path, none of which 114 changes).
- Because the chain is `&&`-joined and `test_smoke.js`/`test_landing.js` sit early, the full
  `npm test` cannot run green in-sandbox regardless of this item — the same condition prior
  items documented (074/077/081/087 notes). The 114-relevant gates that DO run green here:
  `test_landing_return.js` (5/5), `test_minified_assets` (7/7, proves `translations.min.js`
  == fresh minify), `test_translations_fallback` (8/8), `test_i18n_pages` (19/19),
  `test_css_minified_render` (2/2), `test_hero_copy` (4/4), `test_waitlist_microcopy` (6/6).
