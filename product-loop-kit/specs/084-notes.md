# 084 — notes: real assertions for test_protocol_parsing.js + test_qualifier_fix.js

Built 2026-07-14. Rewrote both stale console.log-only test files so they extract and
assert the REAL `parseNaturalLanguageQuery` from `app.js` source.

## Files changed / added

- `test_protocol_parsing.js` — rewritten (9 assertions, protocol parsing).
- `test_qualifier_fix.js` — rewritten (9 assertions, qualifier words + pool types).
- `test_helpers_parser.js` — NEW, shared, dependency-free extractor (`extractParser(appPath)`).
- `product-loop-kit/specs/084-notes.md` — this file.
- `app.js` — NOT modified (byte-identical; sha256 49fbd83f…f74f9be before and after; mutation
  checks were applied to the real file and reverted via `git checkout -- app.js`).

## Extraction territory

- Real parser is a self-contained top-level `const parseNaturalLanguageQuery = (query, ...) => {…};`
  at app.js:129, closing `};` at app.js:483, next top-level decl `const normalizeProtocolName` at 486.
- Slice strategy: `indexOf('const parseNaturalLanguageQuery = (query')` for the start, then the FIRST
  COLUMN-0 `\n};` after it for the end. Verified via `grep -n '^};' app.js`: the only column-0 `};`
  lines are 81, 109, 483, 490, 512, … — 483 is the first one after 129, and every object literal
  inside the body (protocolAliases, protocolChainMapping) closes with an INDENTED `};`, so the
  column-0 match can't land early. Backstop: the sliced source is evaluated in a `node:vm` context and
  `typeof` is asserted to be `function`, so any mis-slice fails loudly rather than silently.
- Loud-failure paths proven: renaming the declaration (`const parseNL_RENAMED = (query`) makes BOTH
  tests print `EXTRACTION FAILED: Could not locate …` and exit 1 (acceptance criterion 2).

## Probe-first: real outputs I locked in (fixtures TOKENS=['USDC','USDT','ETH','SOL'],
CHAINS=['Base','Ethereum','Arbitrum','Solana'])

- `usdc on aave` → {token:'USDC', protocols:['Aave']}  (static-fallback casing is 'Aave', the map key)
- `best yields on base` → {chain:'Base', protocols:[], token:''}  (Method-1 chain-name skip; qualifier not token)
- `compound yields` → {protocols:['Compound']}  (Method-2 direct)
- `aave on arbitrum` → {protocols:['Aave'], chain:'Arbitrum'}
- `kamino lenders` (allProtocols=[{friendlyName:'Kamino Lend',originalNames:['kamino-lend']}])
  → {protocols:['Kamino Lend'], poolTypes:['Lending']}  (the 018 fix — dynamic alias + lend-stem)
- `kamino lending` → same → {protocols:['Kamino Lend']}
- `usdc on aave` with dynamic list lacking aave → {protocols:[]}  (static fallback suppressed when
  allProtocols non-empty — this is the case that genuinely demonstrates allProtocols-driven matching)
- `aave on aave on aave` → {protocols:['Aave']}  (Method-1 pushes Aave twice pre-dedup; Set collapses)
- `top usdc yields` → {token:'USDC'}
- `highest apy on arbitrum` → {chain:'Arbitrum', token:''}
- `best yields on eth` → {chain:'Ethereum', token:''}  (token-after-"on" treated as chain via the
  wordsAfterChainIndicators skip)
- `usdt lending on venus` → {poolTypes:['Lending'], protocols:['Venus']}
- `yields` / `usdc yields` → {poolTypes:[]}  (generic yield does NOT add 'Yield Farming')
- `farming` → {poolTypes:['Yield Farming']}

## Deviation from the spec's suggested cases + SUSPECTED PARSER BUG (out of scope to fix)

- The spec suggested `highest apy on ethereum` → chain 'Ethereum' + token ''. REAL output is
  **token 'ETH'**, NOT '' — so I DROPPED that exact case and substituted `highest apy on arbitrum`
  (which does give token '').
  - Root cause (documented, not fixed): the token-parse FALLBACK block (app.js:211-231) uses
    `tokenCandidateText.includes(tokenLower)` — a bare substring test. For "highest apy on ethereum"
    the candidate text is "on ethereum"; `'on ethereum'.includes('eth')` is true, so token resolves to
    'ETH'. The `wordsAfterChainIndicators` skip (app.js:217) only rejects EXACT word matches
    ('ethereum' !== 'eth'), and the `chainNames` guard at :225 lists 'ethereum' but not 'eth', so the
    substring 'eth' inside 'ethereum' leaks through. Same class: `best yields on solana` → token 'SOL'
    (substring 'sol' inside 'solana').
  - Impact: benign-ish (query still gets the right chain), but a user searching "yields on ethereum"
    can get spuriously token-filtered to ETH pools. Candidate follow-up: make the fallback use a
    word-boundary regex like the primary path, and/or add the short chain aliases ('eth','sol','op',
    'arb'…) to the fallback's exclusion set. FIXING IS OUT OF SCOPE (spec 084 §Out-of-scope).
  - I deliberately used `arbitrum`/`eth`-after-`on` cases to cover the chain+empty-token behavior
    without tripping this bug.

- Spec suggested a static-fallback-only "usdt on venus" style case; I express the static-vs-dynamic
  contrast more sharply with the SAME query `usdc on aave` under empty vs dynamic allProtocols
  (['Aave'] vs []), which directly proves the fallback is gated on allProtocols being empty.

## Mutation check — how I proved the tests bite (all on the real app.js, reverted via git)

sha256(app.js) = 49fbd83f1ba8652984b96152d12710fc495f2ba9b1c89822fde9cfc18f74f9be before AND after
every mutation (verified with `sha256sum` each time; `git checkout -- app.js` restores byte-identical).

| # | Mutation (real app.js) | Result |
|---|------------------------|--------|
| 1 | lend-stem regex `/\blend(ing|ers?)?\b/` → `/\bzzzznever\b/` | test_qualifier_fix FAILS 7/9 (both lend cases), exit 1; protocol test still exit 0 |
| 2 | generic-yield guard `includes('farm')…` → add `includes('yield')` | test_qualifier_fix FAILS 7/9 (both generic-yields cases), exit 1 |
| 3 | comment out `protocols = [...new Set(protocols)]` (dedup) | test_protocol_parsing FAILS 8/9 (dedupe case), exit 1 |
| R | rename decl `const parseNaturalLanguageQuery` → `const parseNL_RENAMED` | BOTH tests print EXTRACTION FAILED, exit 1 |

- Mutation 4 (remove the Method-1 chain-name skip at app.js:396-398) did NOT bite my cases and I say so
  here: my fixtures have no chain name that coincides with a protocol alias, so `best yields on base`
  still yields protocols:[] with or without the skip. The equivalent chain-vs-token protection IS
  covered by `best yields on eth` (relies on the token-parse chain-indicator skip). Adding a
  chain==alias collision fixture would require a contrived dynamic allProtocols entry; the three biting
  mutations above already satisfy acceptance criterion 4 (a representative regression fails).

## Verification commands run (from /home/user/defi_garden)

- `node test_protocol_parsing.js` → 9/9, exit 0
- `node test_qualifier_fix.js` → 9/9, exit 0
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` → exit 0
  (NORTH_STAR verbatim gate; test_planner.js = 208 assertions)
- Mutation table above (each reverted; app.js byte-identical).
- `git status --porcelain` → only test_protocol_parsing.js, test_qualifier_fix.js modified;
  test_helpers_parser.js + 084-notes.md added. (BACKLOG.md/084.md pre-existing loop artifacts, untouched by me.)
