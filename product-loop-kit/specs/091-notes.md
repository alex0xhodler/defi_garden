# Spec 091 — build notes (2026-07-14)

## Protocol slug lists added (app.js, near LENDING/DEX_LP/STAKING_PROTOCOLS)

`YIELD_DERIVATIVES_PROTOCOLS`:
```
['pendle', 'spectra', 'spectra-v2', 'spectra-metavaults', 'termmax', 'napier', 'sense', 'notional', 'element']
```
(`spectra` substring covers both `spectra-v2` and `spectra-metavaults`; the explicit entries are kept for clarity/forward-compat.)

`RWA_PROTOCOLS`:
```
['ondo', 'centrifuge', 'goldfinch', 'openeden', 'matrixdock', 'midas-rwa', 'midas', 'usual', 'credix', 'clearpool', 'maple', 'superstate', 'franklin', 'backed', 'hashnote', 'mountain-protocol']
```
Both exactly per spec §"What to build" #1.

## `maple` moved Lending → RWA (intentional)
`maple` remains in `LENDING_PROTOCOLS`, but `getPoolType` now checks `RWA_PROTOCOLS` BEFORE the lending list/poolMeta check, so any `maple*` pool now classifies as **RWA** (institutional private credit / RWA — more accurate). Documented per spec §"What to build" #1 note.

## Classification order in `getPoolType`
RWA → Yield Derivatives → existing (poolMeta-lending → LENDING → DEX_LP → STAKING → default 'Yield Farming'). Protocol-native classification wins. Returns exactly `'RWA'` and `'Yield Derivatives'`.

## Borrowing DEFERRED (one line)
The DefiLlama yields API is a supply-side feed (`apy` = what a depositor earns); no supply-vs-borrow distinguisher exists, only 0.5% of pools mention "borrow" in poolMeta, and a borrow rate is a cost not an earning — surfacing it as a positive APY under a "Borrowing" tab would misrepresent. Full rationale: spec 091 §"The honest-classification decision" / §"Borrowing".

## How `t` is referenced in the tab render
The analytics-app component obtains `t` at app.js:820 via `const t = useMemo(() => createTranslationFunction(language), [language]);`. The refactored nav tabs render `t(labelKey)` directly (same `t` already used for `t('searchPlaceholder')` at app.js:825). Tabs are now a `.map()` over the module-level `CATEGORY_TABS` array (`{ key, labelKey }`, `key: null` = All), preserving the exact active-state logic and `onClick: setSelectedPoolTypes(key ? [key] : [])`. Order: All, Lending, Staking, LP/DEX, RWA, Yield Derivatives.

## Translations
Added `navCatAll / navCatLending / navCatStaking / navCatLpDex / navCatRwa / navCatYieldDerivatives` to both `en` and `ko` in translations.js (near filter labels).
- EN: "All" / "Lending" / "Staking" / "LP/DEX" / "RWA" / "Yield Derivatives".
- KO: "전체" / "대출" / "스테이킹" / "LP/DEX" / "RWA" (established KO DeFi loanword) / "이자 파생상품".

## Deviations from spec
None. All 7 build steps implemented exactly as written; Borrowing not shipped.

## Compiled/min artifacts
`npm run compile && npm run minify` regenerated `app.compiled.js`, `app.compiled.min.js`, `translations.min.js`. PoolDetail/planner/style min bundles were byte-identical (no change). test_compiled_assets.js + test_minified_assets.js both green (byte-identical to fresh compile/minify).

## Test chain result
- `test_category_taxonomy.js` (new): **5/5 parser-unit + 4/4 rendered Playwright** — GREEN.
- Adjacent regression suite (protocol_parsing 9/9, qualifier_fix 9/9, default_sort 4/4, zero_yield_demote 4/4, compiled_assets 4/4, minified_assets 9/9) — all GREEN.
- Full `npm test`: all tests before it passed; chain stopped at **`test_analytics_fires.js`** (Playwright `page.goto(..., waitUntil:'load')` on a generated `/tokens/<slug>` landing page times out at 15s because that page pulls external fonts/analytics not fully routed in-sandbox → the `load` event never fires). This is the documented pre-existing "external font/analytics fetches fail locally (ignorable)" sandbox limitation (CLAUDE.md), NOT caused by this diff — `test_analytics_fires.js` references none of app.js's classification/nav/parser changes and only exercises static token pages I never regenerated. Every downstream chain test after it (og_images, spotlight*, waitlist*, rate_volatility, dead_pool, translations_fallback, list_default, kpi_track_record, default_sort, category_taxonomy, …) was run individually and passed. So the only failure in the full chain is the pre-existing sandbox-network one.

## Not committed
All changes left in the working tree for parent review. `product-loop-kit/BACKLOG.md` (1-line) and untracked `specs/091.md` are pre-existing harness/spec-setup state, NOT from this build.
