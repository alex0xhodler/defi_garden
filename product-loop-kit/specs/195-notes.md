# 195 — build notes

## Change made

`PoolDetail.js` only (plus its committed compile/minify output — see below).

1. Added a module-local pure helper `classifyUnderlyingToken(token, chain)` (placed directly
   above `function PoolDetail({` — the same spot `getPoolTypeShared` sits, the file's other
   top-level render helper). It implements the 6 ordered rules from spec §1 verbatim:
   chain-prefixed EVM → bare EVM → Solana mint → Tron address → generic opaque id (chip, no
   link) → everything else (not a chip). A comment above it explains why blockscan.com must
   never receive a non-EVM address, citing 195 and its 193 lineage, matching the file's
   existing comment density.
2. Rewrote the `pool.underlyingTokens.map(...)` block (was `PoolDetail.js:1611-1656`, now
   `:1658-1729`) to call the classifier instead of the inline `isAddress` boolean. One shared
   `chipStyle` object (the pre-existing EVM-anchor style, verbatim) is used for all three
   chip variants via `Object.assign`: linked `<a>` (`color: var(--color-primary)`, `target`,
   `rel`, ` ↗` suffix), unlinked `<span>` (rule 5, `color: var(--color-text)`, no `↗`), and
   the untouched plain `<span>` for non-address strings (rule 6, byte-identical to the
   pre-existing else-branch). `title` on both chip variants is the raw, untrimmed `token` —
   "the FULL original token string" per spec.
3. `addressCount` now filters on `classifyUnderlyingToken(t, pool.chain).chip` instead of the
   old `0x`-prefix-and-length-40 test. For EVM-only pools this is a no-op by construction:
   `classifyUnderlyingToken` returns `chip: true` for every token that would have passed the
   old `isAddress` test (rules 1–2 are the old test, unchanged), and `chip: false` for nothing
   that used to pass it — so the count is identical, verified by reasoning (not just assertion)
   and by `test_northstar_cta_fires.js` / `test_mobile_cta_clip.js` / `test_pool_detail_anomaly_projection.js`
   staying green against real EVM-only fixture pools (STETH, USDC-Base, etc.).

## Deviations from the spec / conservative choices

- **Test fixture symbols deliberately avoid the pre-existing symbol-derivation shortcut.**
  Spec §2's last bullet keeps and generalizes the existing behavior where a chip's truncated
  label is replaced by the matching `pool.symbol` part when `symbolParts.length === addressCount`.
  For a single-token pool with a plain one-word symbol (e.g. the real JITOSOL pool in
  `data/pools-snapshot.json`, `symbol: 'JITOSOL'`), that shortcut always fires — `'JITOSOL'.split(/[-\/]/)`
  has length 1, `addressCount` is 1, they match, and the chip would read `JITOSOL ↗`, not a
  truncated mint. That is correct, spec-sanctioned behavior, but it makes acceptance criterion
  1's literal truncation regex (`/^So11\S*\.\.\.\S*112 ↗$/`) unobservable on that exact
  real-world symbol. `test_pool_underlying_address.js`'s fixtures therefore use two-part
  symbols (`'JITOSOL/SOL'`, `'ETH/TRX'`, `'XLM/USDC'`, `'USDT/ETH'`, `'USDT0/PLASMA'`) so
  `symbolParts.length !== addressCount` and the truncation path is what's actually exercised
  and asserted. This is a test-fixture choice to make criterion 1/4/5/6 observable, not a
  product behavior difference — documented at the top of the test file itself. The symbol-swap
  path for single-token pools (pre-existing, unchanged by this item) is exercised implicitly by
  every other green test in the suite that renders a real single-token EVM pool (e.g. STETH in
  `test_mobile_cta_clip.js` / `test_northstar_cta_fires.js`), so it isn't uncovered — it just
  isn't what item 195's own new test targets, since 195's job is the truncation/classification
  behavior, not the symbol shortcut (which item predates 195 and is untouched).
- **Fixture pool ids are synthetic** (`test-195-solana-jitosol`, etc.), matching the
  `CARD_CLICK_POOL` precedent in `test_northstar_cta_fires.js` — only the `underlyingTokens`
  addresses need to be real per spec, and those are copied verbatim from
  `data/pools-snapshot.json` and verified present there before the test runs (fails loudly, not
  silently, if any of the three non-EVM addresses ever disappear from the snapshot).
- **Container reference for the criterion 8 layout check is the chip row itself** (the
  `display:flex; flexWrap:wrap` div created immediately after the "Underlying Assets" heading),
  located at runtime by walking the DOM for a leaf `<div>` whose text is exactly "Underlying
  Assets" and taking its `nextElementSibling`, rather than by a stable class name — the row has
  no class today and the spec didn't ask for one (adding one would be an unrequested CSS-surface
  change). This is a bit more brittle to future unrelated heading-text/DOM-shape changes than a
  class-based selector would be, but keeps the product diff to the spec's stated scope of zero
  new CSS/classes.
- **No new CSS, no new translation keys, no JSX** — confirmed by diff: only `PoolDetail.js`
  changed in application code; `translations.js`, `style.css`, `pool-detail-styles.css`,
  `app.js`, `audit-app.js` are untouched.

## Things not verified

- The full ~110-file `test:serial` suite was **not** run in full — only the 10 files the spec's
  "Regression suite to run inside the 5-minute timebox" section names (see Test results below),
  as the task instructions require. Stating this plainly per the spec's own instruction.
- Did not attempt to render every one of the 142 raw-rendered tokens the evidence table cites
  (e.g. Stacks principals) — only the shapes with dedicated fixtures (Solana, Tron, Stellar,
  chain-prefixed EVM, bare EVM, `coingecko:` slug). Stacks principals (`SP…`, 43–51 chars) fall
  under rule 5 (generic opaque id, same code path as Stellar) by construction, so they're
  covered by the same branch the Stellar fixture exercises, but there's no fixture with a real
  Stacks principal string specifically.

## Test results (exact commands run)

All run from `/home/user/defi_garden`, in order.

```
npm install                              # node_modules was absent; installed to get @babel/core, terser, playwright
npm run compile && npm run minify        # regenerated PoolDetail.compiled.js / PoolDetail.compiled.min.js (+ app/planner/translations/css siblings, all pre-existing sources unchanged so those siblings are byte-identical no-ops)

timeout 280 node test_pool_underlying_address.js   # NEW — 10/10 passed
timeout 280 node test_northstar_cta_fires.js       # 7/7 passed
timeout 280 node test_mobile_cta_clip.js           # 4/4 passed
timeout 280 node test_pool_type_badge.js           # 10/10 passed
timeout 280 node test_pool_detail_anomaly_projection.js  # 9/9 passed
timeout 280 node test_compiled_assets.js           # 4/4 passed
timeout 280 node test_minified_assets.js           # 9/9 passed
timeout 280 node test_min_asset_boot.js             # 18/18 passed
timeout 280 node test_audit_number_boundary.js      # 9/9 passed
timeout 280 node test_run_tests.js                  # 26/26 passed
```

All ten files pass, all green, no failures to explain away (nothing was broken by this change,
so there was no need to stash the diff and prove a pre-existing failure).

One operational note: the first `node test_pool_underlying_address.js` run under a 120s
`timeout` was killed mid-run (browser closed under it while criterion 8's three-viewport
layout check was still going) — raised to 280s and it passed cleanly (~35s of actual runtime
once Playwright/Chromium warm-up is accounted for; the 120s ceiling was simply too tight for
a first cold run in this sandbox, not a bug in the test).

`test_pool_underlying_address.js` was registered in `package.json`'s `test:serial` chain
immediately after `test_pool_detail_anomaly_projection.js` and before `test_kpi_rail_history.js`
(both are pool-detail-surface tests, keeping the new entry near its siblings), single-line
format preserved.

## Residuals

- None deliberately left inside spec's stated scope. Explorer coverage beyond
  Solana/Tron (Stellar Expert, Hiro for Stacks) is explicitly out of scope per spec §3 and not
  attempted.
