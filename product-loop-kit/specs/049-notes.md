# 049 build notes

## What shipped
- `generate-token-pages.js`: `chainLinksFor` (token → chain cross-links, filtered
  against a real generated-chain-slug set) + `categoryLinksFor` (folds in 043 —
  distinct pool-type categories on the page, linked to the existing
  `?token=<SYM>&poolTypes=<cat>` app view) + a shared `renderLinkNavHtml` helper.
  `renderTokenPage` takes a new 4th `chainLinks` param.
- `generate-chain-pages.js`: symmetric `topTokensOnChain` (chain → token
  cross-links) + reuses `categoryLinksFor`/`renderLinkNavHtml` from the token
  module. `renderChainPage` takes a new 4th `tokenLinks` param.
- `generate-sitemap.js`: exported the existing `getPoolType` classifier so
  both generators reuse it instead of re-implementing pool-type detection
  (standing decision: reuse before inventing).
- Tests added to `test_token_pages.js`/`test_chain_pages.js`: dedupe/cap,
  the no-dead-link invariant (checked against the REAL cross-fixture ranking
  from the other module, not just hand-built fixtures), and rendering checks.

## Deviations / choices

1. **Category leg target (spec's open question)**: used the INTERIM
   `?token=/chain=&poolTypes=<cat>` app-view target, not a deferred no-op.
   The spec explicitly left this to the builder pending 045's category
   pillar pages, which don't exist yet — the interim app view is a real,
   working page today, so shipping it now is strictly better than nothing.

2. **Cross-link scope is the DISPLAYED pool table, not all qualifying
   pools.** Both `chainLinksFor`/`categoryLinksFor` (token side) and
   `topTokensOnChain`/`categoryLinksFor` (chain side) only look at
   `rec.pools` — the already-sliced top-`POOLS_PER_PAGE`-by-TVL set the
   page actually renders — not the full qualifying pool set. This matches
   033's existing philosophy (the page's quality gate itself only considers
   what's shown) and means a token/chain that only co-occurs via a
   truncated, off-page pool won't get cross-linked. Conservative and
   consistent, not a new inconsistency.

3. **Pre-existing bug fixed as a prerequisite**: `generate-token-pages.js`
   had `if (require.main === module) { main()... }` BEFORE `module.exports
   = {...}` in the file. This was harmless before (nothing required this
   module from inside its own `main()`), but 049's token→chain direction
   needs `main()` to lazily `require('./generate-chain-pages.js')` — which
   requires this module right back. With the old ordering, that circular
   require observed `module.exports` still at its default `{}` (verified
   via a stripped-down repro), breaking `rankTopChains` on the other side.
   Fixed by moving the `module.exports` assignment above the
   `require.main` check — a 4-line reorder, no behavior change otherwise.
   The chain → token direction needed no such require (generate-chain-
   pages.js already imports the token module unconditionally at its own
   top level, before its own `main()` runs), so no equivalent fix was
   needed there.

4. **Nav markup reuses `.related`/`.related-links` CSS via an added class
   token** (`class="related xlink-chains"` etc.) instead of new CSS, so the
   pre-existing tests that assert on the exact `class="related"` string
   (the original related-tokens/chains nav) keep passing untouched while
   the new navs still pick up the existing neuro-token styling for free.

## Verified
- `node test_token_pages.js` / `test_chain_pages.js`: all pass (71 + 63
  assertions), including new no-dead-link invariants checked against the
  real cross-module ranking on the shared fixture.
- Ran both generators end-to-end on the token fixture (`--fixture
  test_fixtures/pools-sample.json`) and inspected the emitted HTML by hand:
  BIG token page links Ethereum + Base (both real chain pages) and Lending;
  Ethereum chain page links BIG (only token whose pool is in Ethereum's
  displayed top-8) and Lending + Yield Farming.
- Full `npm test` chain: all scripts pass except the pre-existing
  `test_smoke.js` Playwright failures, which are the documented sandbox
  network restriction (unpkg.com/yields.llama.fi blocked via the proxy,
  confirmed via curl — 403 CONNECT tunnel failed) — unrelated to this diff,
  which never touches `home.html`/`app.js`/`planner.js`.
