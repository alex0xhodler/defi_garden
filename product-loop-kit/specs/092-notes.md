# 092 — build notes (deviations & conservative choices)

Built 2026-07-14. Source edits by dispatched Opus coding agent; spec, verification,
and ship by the operator session. All acceptance tests green.

## Deviations from spec
1. **CSS token substitution.** Spec suggested `color: var(--color-text-tertiary)`
   for `.pool-apy-tag`. That token does NOT exist in `style.css` (only
   `--color-text` and `--color-text-secondary` are defined). Substituted the
   closest existing token → `var(--color-text-secondary)`. No invented tokens,
   no hardcoded hex/px. Every other token used (`--color-border`,
   `--font-weight-medium`, `--space-4/-8/-2`, `--neuro-radius-sm`,
   `--font-size-sm`, `--color-surface`) verified present.

## Conservative / deliberate choices
- **Demote applies whenever `sortBy === 'tvl'`** (no `userSortedTvl` gate). There
  is no explicit-TVL-click flag today, and TVL becomes the default once 089
  ships. A saver sorting by size still should not see 0% collateral topping the
  list — honest default, forward-compatible with 089. Documented in the spec.
- **Number preserved (trust rail).** The `0.00%` APY hero is untouched; only the
  stark `$0.00/day` daily-earnings preview is swapped for the honest
  "No supply yield" tag. Nothing is hidden or fabricated.
- **Generic honest label.** Used "No supply yield" (provably true for any
  <0.01% pool) rather than the spec parenthetical "collateral" (we cannot
  truthfully assert every 0% pool is collateral).
- **Anomalous pools untouched.** APY > `APY_SANITY_LIMIT` (the ⚠ high-APY path)
  is disjoint from the 0% population — the anomaly branch in render + the
  `userSortedApy` demote in the APY sort are unchanged.
- **Default sort still `'apy'`** (089 not shipped) — the acceptance test
  explicitly clicks the TVL toggle to exercise the demote path.

## Build/verify mechanics
- `npm ci` (babel/terser absent) → `npm run compile` → `npm run minify`;
  compiled/min assets regenerated and committed with source.
- Tests green: `test_zero_yield_demote.js` 4/4, `test_list_default.js` 3/3
  (regression), `test_compiled_assets.js` 4, `test_minified_assets.js` 9,
  `test_css_minified_render.js` 2. All EXIT 0.
