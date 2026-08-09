# 253 — build notes

## What happened

Confirmed the spec's evidence directly: `translations.js` had zero occurrences of `poolNotFoundTitle` in
either namespace at `HEAD` (deleted by `6fceca79bb`), while `app.js:3558` / `app.compiled.js:3492` still
call `t('poolNotFoundTitle')` for the dead-pool empty-state heading. `node test_dead_pool.js` was RED
(exit 1) before the fix, exactly as the spec documented.

## Change

Restored both strings verbatim from `git show 6f1d624451:translations.js`, at the position the deleting
diff removed them from (immediately before `poolNotFoundExplanation` in both namespaces) — no re-translation,
no rewording. `translations.min.js` was regenerated via `node minify-assets.js` (the repo's existing
minification path — `terser`/`clean-css` weren't installed in this checkout; ran `npm install` first,
which is dependency-install only, no `package.json` edit). Never hand-edited the minified file.

## Deviation from spec

None. Diff is exactly the two restored keys in `translations.js` plus the regenerated `translations.min.js` —
matches the spec's explicit scope guard ("if the builder touches anything beyond `translations.js` and its
minified twin, the tier is wrong").

## Verification performed

- `node test_dead_pool.js`: exit **0**, **12/12** assertions passing (read without a pipe, per the spec's
  own instrument-note warning about `tail` masking exit codes).
- `node test_snapshot_first.js`, `node test_translations_fallback.js`, `node test_planner.js`,
  `node test_protocol_parsing.js`, `node test_qualifier_fix.js`: all exit 0.
- `node test_pool_artifact_paint.js`: 10/11 (was 9/11 on `main` before this fix — scenario (c), which
  depends on the same dead-pool empty state, now passes). The one remaining failure, scenario (j)
  ("trust-rail invariant... at the default $10M floor"), reproduces byte-for-byte on unmodified `main`
  (verified via `git stash` + rerun) — a stale-`$10M`-copy issue, explicitly item 254's territory, not
  touched by this diff.
- `node audit-app.js --only=dead-pool`: exit 0, 0 findings on the `dead-pool` surface. (The run's
  side-effect writes to `product-loop-kit/signals/audit-*.json` were reverted with `git checkout --` to
  keep this diff scoped to the spec — those files are heartbeat-owned state, not part of this item.)
- Non-vacuity (spec-mandated): deleted `poolNotFoundTitle` from EN only → `test_dead_pool.js` went RED on
  exactly the EN assertion (11/12, `EN: "undefined"`). Restored, `md5sum translations.js` byte-identical
  to the pre-mutation file, reran green (12/12). Repeated for KO alone → RED on exactly the KO assertion
  (11/12, `KO: "undefined"`, EN still correct — proves KO isn't passing via EN fallback). Restored,
  byte-identical, reran green.

## Class (RAZOR "instance of")

Per the spec: this item restores one key and closes nothing structurally. The class — any `t('…')` call
site with no entry in either namespace, invisible to every gate because they all walk the parsed
dictionary — stays open, ticketed as item 255 (source-level dictionary integrity), unchanged from the
spec's own framing.
