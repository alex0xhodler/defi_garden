# Spec 017 — build notes

## Advertised examples pinned as fixtures
From `app.js` `searchPhrases` (~line 776, was ~572 in the pre-edit file):
`t('searchPlaceholder')` (generic, not a parseable example — excluded), "USDC on Base", "Lending on Plasma", "CRV LP on Curve", "Kamino lending". All four pinned verbatim in `test_search.js`.

Human's classes, also pinned: bare chains ("solana", "base"), protocol names ("kamino", "curve", "convex"), protocol+category combo ("kamino lenders" → protocol Kamino + poolTypes Lending).

Novel same-class fixtures (prove root-cause, not per-string hacks): "arbitrum", "morpho lending", "aave".

No advertised example was unfixable / swapped — all four pass after the root-cause fixes below.

## Extraction
`parseNaturalLanguageQuery` (previously app.js:129-445) is fully self-contained — all its helper maps (chainAliases, protocolAliases fallback, protocolKeywords, etc.) were already local to the function body, so no separate "helper maps" needed exporting alongside it. Moved verbatim into `search-parser.js` with the same UMD guard as `canonical.js` (`module.exports` for node / `window.parseNaturalLanguageQuery` for browser).

app.js's two call sites (`useMemo` autocomplete suggestions, `handleKeyDown` Enter handler) already referenced the bare identifier `parseNaturalLanguageQuery(...)` — no call-site changes needed, they now resolve to the global set by `search-parser.js`.

## Root-cause bugs fixed (in search-parser.js, not as app.js per-string hacks)
1. **Missing Kamino in the protocol fallback map.** The "dynamic" protocol-alias branch (built from `availableProtocols.all`) is empty for every freshly-typed NL query in practice — no token/chain is selected yet at that point, so `availableProtocols.all` is always `[]` and the code always falls to the static fallback dict. That dict never had a Kamino entry, so "kamino"/"kamino lending" always failed protocol detection. Added `'Kamino': ['kamino', 'kamino-lend', 'kamino lend', 'kamino-finance']`.
2. **`lowerQuery.includes('lending')` missed "lenders".** The human's own example — "kamino lenders" — doesn't contain the substring "lending". Changed to a `\blend/i` stem match so lend/lending/lender/lenders all set the Lending poolType.
3. **Chain alias table is a fixed list; new chains (e.g. "Plasma") could never match even if present in live `allChains`.** Added a fallback pass after the alias-table loop that matches any live chain name directly via word-boundary regex against the query, so new chains DefiLlama adds work without a future code change here.
4. **`'aerodrome'/'uniswap'/'curve'` auto-chain-map didn't cover Kamino.** Added `'kamino': 'Solana'` alongside the existing entries for consistency (Kamino is Solana-only) — kept minimal, did not touch the other three.
5. **Stray token leak on bare chain queries** ("solana" → was returning `token: 'SOL'` in addition to `chain: 'Solana'`). The token-fallback loop's "isn't this a chain name" double-check compared the wrong string (`tokenLower`, the candidate token's own name, e.g. "sol") against the chain-name list instead of the actual candidate text being matched (e.g. "solana"). Fixed to check `tokenCandidateText` — the string the loop is actually testing — against the chain/qualifier lists. This is a matching-order/normalization fix per the spec, not new scope; added as a regression fixture in test_search.js.

No other behavior changed. Chain-not-in-live-data query behavior, protocol context-keyword parsing (Method 1), and Method 3 protocol-first detection are untouched.

## Deviations from spec
- None of the deviation triggers applied: no advertised example needed swapping, and the "helper maps" extraction turned out to be a no-op since the function was already fully self-contained (documented above rather than treated as a deviation).
- Conservative choice: the auto-chain-map addition for Kamino→Solana was not explicitly requested by the spec's acceptance criteria, but follows the same pattern the existing map already uses for Aerodrome/Uniswap/Curve, so it was included for consistency rather than leaving Kamino as the only protocol without a home-chain default. Reversible with a one-line removal if the human disagrees.

## home.html diff
Exactly one added line: `addScript('search-parser.js');` inserted before the existing `addScript('PoolDetail.js', 'text/babel');` call, inside the existing `if (window.__APP_MODE === 'analytics')` block. Router block and `ANALYTICS_PARAMS` are byte-identical (verified via `git diff home.html`).

## Test chain
`test_planner.js`, `test_protocol_parsing.js`, `test_qualifier_fix.js`, `test_search.js` (new, 14 assertions), `test_smoke.js`, `test_canonical.js` — `test_search.js` inserted into `package.json`'s `test` script between `test_qualifier_fix.js` and `test_smoke.js`. `test_protocol_parsing.js` and `test_qualifier_fix.js` now `require('./search-parser.js')` instead of keeping inline copies — their own dead `getFriendlyProtocolName` mock (unused by the parser, never called in either file) was removed from `test_protocol_parsing.js` as part of the swap since it was already unreachable code in the file being edited.
