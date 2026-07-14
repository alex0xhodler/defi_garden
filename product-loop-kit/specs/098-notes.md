# Spec 098 — build notes (2026-07-14)

## The change
One guard at the end of `parseNaturalLanguageQuery` (app.js), before the return:
```js
if (token && protocols.some(p => p.toLowerCase() === token.toLowerCase())) {
  token = '';
}
```

## Why here (not the handler)
The token is a false positive at the PARSE layer — "pendle" is a protocol name that also happens to be a token symbol. Clearing it in the parser keeps a single source of truth and means every consumer of the parser (search Enter handler, URL builder, autocomplete) gets the corrected result. The handler already routes a token-less + protocol query into "All chains" mode filtered by the protocol, so no handler change was needed.

## Scope of "drop the token"
Only fires when the extracted token's lowercase EQUALS a detected protocol's friendly-name lowercase. So:
- "pendle" (token PENDLE == protocol Pendle) → token dropped ✓
- "aave" (token AAVE == protocol Aave) → token dropped ✓ (bare protocol name → protocol pools, more useful than the AAVE governance-token pools)
- "usdc on aave" (token USDC ≠ protocol Aave) → token USDC KEPT ✓ (verified non-regression)
This is intentionally narrow: a token is only discarded when it is literally the same word as a protocol we matched.

## ID history
Originally drafted as "096" then "098" in comments while parallel loops consumed 096 (Mixpanel env-gate, #218) and 097 (yield.garden mirror decision, added to BACKLOG on main). Settled on 098 for this fix; the human's planner value-inconsistency ticket (separate) is backlog item 099 (READY, HIGH).

## Verification
- test_category_taxonomy.js: 8/8 parser-unit (incl. the 3 new token/protocol asserts) + 5/5 rendered Playwright (incl. the new "type pendle → PT-USDE shows" regression guard). The rendered search test drives the input via `page.keyboard` (the analytics header's animated placeholder re-renders the input node, so a bound locator for `.press()` can detach — keyboard events are node-independent).
- Regression: test_protocol_parsing 9/9, test_qualifier_fix 9/9.
- Artifacts app.compiled.js/app.compiled.min.js regenerated via `npm run compile && npm run minify` (home.html loads the min).
- Trust rails (APY_SANITY_LIMIT/DEFAULT_MIN_TVL/anomaly/degen) untouched — grep-clean; this only reassigns a local `token` variable in the parser.

## Deviations from spec
None.
</content>
