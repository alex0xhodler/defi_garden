# 142 — build notes / deviations

Builder: loop-142. Two new files only (`audit-app.js`, `test_audit_app.js`); zero
product-code changes. All deviations below are mechanic choices inside the new
tooling — none touch product code, trust rails, or dependencies.

## Deviations & decisions

1. **`waitUntil: 'domcontentloaded'` (not `'load'`).** In-sandbox the blocked
   fonts/analytics never let the `load` event fire — the static SEO page hung to
   the 20s timeout on `'load'`. Switched all navigations to `domcontentloaded`;
   readiness is asserted by polling the real rendered selectors (`.pool-card`,
   `.pool-detail-view`, `.empty-state`), which is the true "did it render"
   signal and honours trap #2 (poll up to 10–12s). Cut full-run time from
   ~2m06s to ~18s.

2. **Absurd-magnitude threshold = `1e11`, not the playbook's literal `1e4`.**
   A bare `>1e4` scan would FALSE-POSITIVE on legitimate rendered money: the
   pool-detail calculator has a `$100,000` preset and its 5y projection lands
   near `$110,000+` — both bare, un-abbreviated 6-figure numbers. The 122 bug
   class is `−900,719,925,474,097.9` (~9e14). The largest legitimate RAW figure
   is an individual pool TVL (~1.7e10) and it is ALWAYS rendered abbreviated
   (`$17.3B`), never as a raw >1e11 token. `1e11` therefore catches the entire
   −900T class with provably zero false positives on real data (the clean-run
   acceptance). Suffix-abbreviated figures (`$11.2K`/`$273.3M`) are skipped
   before the magnitude test, satisfying trap #3.

3. **Loading-flash (check 3) is structural, not copy-matching.** On a
   forced-live delayed grid surface, the check flags a P1 only if the RESOLVED
   empty-state's `.empty-submessage` renders before `.pool-card` appears — the
   exact 132 signature (empty-state ternary gated on `filteredPools.length`
   instead of `loading`). The loading variant renders a bare `.empty-message`
   with no submessage, so this is low-false-positive and i18n-independent
   (no reliance on matching "no results" strings across EN/KO).

4. **KO currency-truth (check 5) is a conservative byte-identical compare.**
   Flags P0 only when a `<n>원` figure equals an unconverted `$<n>` figure on
   the same page — the exact 137 signature (raw USD relabeled 원). Dormant on
   current data (which renders `$`), correct on the regression. Mere presence
   of `원` is never flagged.

5. **Injection point for the positive control = `pool.apyMean30d`.** Root-caused:
   `PoolDetail.js` renders `pool.apyMean30d` verbatim through `_formatApy` in the
   "30d Mean APY" card, gated only on `typeof … === 'number'`, with no sanity
   clamp — so an absurd value lands in visible pool-detail text exactly like the
   122 rate-stability number did. The mutated snapshot is served on both the
   snapshot route and the live `yields.llama.fi/pools` route (a `?pool=` deep
   link always goes live — app.js:1141), so the injected pool renders on the
   real pool-detail surface. This is a REAL Chromium render, not a regex unit.

## Surface rotation (default)
`grid-token` (?token=USDC), `pool-detail` (?pool=<lido id>, north-star),
`grid-chain` (?chain=Ethereum), `dead-pool` (?pool=bogus → 072 empty state,
asserted positive), `grid-loading` (forced-live delayed, check 3),
`pool-detail-360` + `grid-360` (check 7 responsive/clip),
`pool-detail-dark` (check 4/7 dark), `pool-detail-ko` (check 5 i18n),
`static-page` (/tokens/usdc.html, checks 1 & 4; skip-with-log if absent).

## Verification
- `node audit-app.js` → exit 0 on committed snapshot, 10 surfaces, 0 findings, ~18s.
- `node test_audit_app.js` → 2/2 pass (clean + positive control).
- Representative `npm test` subset (smoke/search/northstar/dead_pool) green except
  `test_smoke.js`, which fails on an unrelated planner `#planner-root [class*="gp-"]`
  render timeout — CONFIRMED red at HEAD too (reproduced with the two new files
  moved aside), i.e. pre-existing/environmental, not caused by this item.
- No product file modified (`git status`: only untracked `audit-app.js`,
  `test_audit_app.js`, `signals/audit-findings.json`, and pre-existing loop-kit
  bookkeeping).
