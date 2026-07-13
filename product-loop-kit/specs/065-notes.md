# Spec 065 — implementation notes

## Summary
Waitlist pitch-variant system shipped: 8 new translation keys (B/C framings, EN+KO),
URL-param `pitch` resolution in planner.js applied at all six modal render sites,
`pitch_variant` stamped on all five analytics waitlist trackers and every call site
in both modals, new Playwright test `test_waitlist_pitch.js`, extended ICP copy suite.

## Deviations from spec
- **No `analytics.min.js`.** The spec (Change §4) lists a regenerated `analytics.min.js`.
  That file does not exist and is not produced by `minify-assets.js` (its `JS_FILES` is
  `['app.compiled.js', 'PoolDetail.compiled.js', 'planner.js', 'translations.js']`).
  Both `plan.html` and `home.html` load `analytics.js` **raw** (`<script defer src="analytics.js">`),
  so editing `analytics.js` ships directly — no minification step for it. Only
  `planner.min.js` and `translations.min.js` were regenerated (the two shipped min files
  that actually changed). `app.compiled.min.js`, `PoolDetail.compiled.min.js`, and
  `style.min.css` re-minified byte-identically (not in the diff).
- Had to run `npm install` first — `node_modules` was absent in the fresh worktree, so
  `terser`/`clean-css` (needed by `npm run minify`) and `playwright` were missing. This is
  environment setup, not a source change.

## Conservative choices
- `PITCH_VARIANT` is a module-scope IIFE wrapped in try/catch (defensive against a missing
  `window`/URLSearchParams), mirroring the existing constants block style; falls back to `'a'`.
- `pitchKey(base)` returns the base key unchanged for variant `'a'`, so variant-A resolves
  the exact same `t('waitlistTitle')`/`t('waitlistBenefits')` calls as before — default copy
  is byte-identical (verified by test: rendered text `=== enP.waitlistTitle`).
- `pitchVariant` appended at the END of each tracker context object (never reordering existing
  props); analytics trackers read `context.pitchVariant || null` (never undefined), matching the
  existing `|| null` whitelist convention.
- Kept variant benefit values as plain strings so the ignored `archetype` arg passed by the
  bloom modal (`t(pitchKey('waitlistBenefits'), archetype)`) is harmless.
- ICP suite extension is a `['B','C'].forEach` loop reusing the existing `tEn`/`tKo` wrappers.

## Test results (all exit 0)
- `node --check planner.js && node --check translations.js && node --check analytics.js` — clean
- `node test_planner.js` — 208 assertions, all pass (incl. 12 new B/C × EN/KO ICP tests)
- `node test_protocol_parsing.js` — exit 0
- `node test_qualifier_fix.js` — exit 0
- `node test_waitlist_pitch.js` — 7/7 assertions pass (pitch=b, pitch=c, uppercase B,
  no-pitch=A, pitch=zzz=A, ko pitch=b, submit carries variant)
- `node test_waitlist_funnel.js` — 3/3 pass (no regression)
- `node test_waitlist_seo_entry.js` — 4/4 pass
- `node test_minified_assets.js` — 7/7 pass

## Diff integrity
- `git diff --numstat translations.js` → `8  0  translations.js` (8 insertions, 0 deletions).
  `git diff translations.js | grep '^-'` (excluding `---`) is empty — **additions only**,
  variant-A keys byte-untouched (061 window integrity preserved).
- All 21 `Analytics.trackWaitlist*` call sites in planner.js carry `pitchVariant: PITCH_VARIANT`.
- All five trackers in analytics.js add `pitch_variant: context.pitchVariant || null`.

## For the verifier to scrutinize
- The `analytics.min.js` deviation above (spec inaccuracy vs. actual load path).
- Property-order choice (pitchVariant appended last) — cosmetic, does not affect Mixpanel props.
- Pre-existing working-tree changes not mine: `product-loop-kit/BACKLOG.md` (loop bookkeeping)
  and untracked `product-loop-kit/specs/065.md` (the spec itself).
