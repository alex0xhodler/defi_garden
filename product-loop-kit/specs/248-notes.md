# 248 — build notes

No deviations from spec. Built exactly as specced: two lines added to `I18N_UNTRANSLATED_ALLOWLIST`
in `audit-app.js`, `translations.js` byte-unchanged.

## Verification performed

- Baseline confirmed live before the fix: `prescanI18n()` against the real dictionary reported
  `scanned: 544, suspects: 2 (resultsColApy, resultsColTvl), allowlistSize: 24` — matches the spec's
  evidence section exactly.
- After the fix: `scanned: 544, suspects: 0, allowlistSize: 26`.
- Non-vacuity (spec's mandated leg): removed `resultsColApy` from the allowlist → suspect count
  went to 1, naming `resultsColApy` exactly. Restored the file → `md5sum` byte-identical
  (`1e86deac88d90980d600ab85ac9737a1` before and after the mutate/restore cycle).
- `git diff --stat` after the real fix names only `audit-app.js` — `translations.js` untouched, per
  acceptance criterion.
- Mandated suite green: `test_planner.js` (208 assertions), `test_protocol_parsing.js` (9/9),
  `test_qualifier_fix.js` (9/9).
- `test_audit_i18n_parity.js`: 16/17 passed. The one failure (`positive control on real historical
  bytes: 648401297:...`) is a pre-existing environment limitation — this session's checkout is a
  **shallow clone** (`git rev-parse --is-shallow-repository` → true), so `git show 648401297:...`
  can't resolve regardless of this change. Confirmed pre-existing by stashing the fix and re-running
  the same file against unmodified `main`: 15/17 passed there (both the target suspects test AND
  this same historical-bytes test failed) — this item's fix is what moved 15→16, the shallow-clone
  failure is orthogonal and unaffected either way.
- `allowlistSize` assertions in `test_audit_i18n_parity.js` (line 219-220) are already self-deriving
  (`Object.keys(I18N_UNTRANSLATED_ALLOWLIST).length`), so no test file needed editing for the size
  bump 24→26 — grepped `allowlistSize`/`I18N_UNTRANSLATED_ALLOWLIST` across `test_*.js` first, per
  the acceptance criterion, and confirmed no hardcoded count exists anywhere.

## Class status (unchanged from spec)

Not closed — 8 of 26 allowlist entries are now "the acronym APY or TVL on some surface" (30.8% of
the allowlist, 6.6% of the 391 string-key population). Spec's open question (exempt by value over
`{"APY","TVL"}` vs. exact key path) stays open, not resolved by this item. Item 249 is the adjacent
territory (function-leaf blind spot in the same gate) — untouched here.
