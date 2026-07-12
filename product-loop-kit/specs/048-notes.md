# Notes: 048 — freshness signals

## Approach
- Added `todayGeneratedDate()` to generate-token-pages.js (en-US human date,
  `toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'})`
  — matches the existing convention in generate-stories.js:967) and exported
  it for reuse by generate-chain-pages.js (reuse-before-inventing).
- `renderTokenPage`/`renderChainPage`'s `genDate` default now uses this human
  format instead of the previous raw ISO fallback (`toISOString().slice(0,10)`).
  Existing tests that pass an explicit `generatedDate` string (e.g. `'2020-01-01'`,
  `'2026-07-12'`) are pass-through and unaffected by this default change.
- Added a shared `renderLastUpdatedHtml(genDate)` helper — one `.note`-styled
  paragraph, reused by both token and chain pages.
- `main()` in both generators now computes ONE `genDate` per CI run and passes
  it explicitly to every page render, so a whole batch agrees even if
  generation spans a date rollover.
- Dataset JSON-LD's `dateModified` (shipped in 046) already took a
  `generatedDate` param — no schema change needed there, just fed the same
  `genDate` used for the visible line, which is what makes them byte-for-byte
  identical (criterion 2).
- generate-stories.js: `plan.generatedDate` was already computed once per run
  and already rendered visibly (math section + disclaimer) — this diff adds
  an explicit "Last updated {date}" line to the footer (clearer freshness
  signal than the existing narrative sentences) and a `WebPage` JSON-LD block
  (`dateModified` = the same `plan.generatedDate` string) emitted for **every**
  persona, not just kevin (whose FAQPage already existed pre-048).

## Deviations from spec
- **Scope: hub/A-Z pages excluded.** Spec says "token/chain/story generators
  render a visible Last updated line" — read literally against
  `tokens/*.html chains/*.html` grep evidence that would include hub + A-Z
  pages too. Scoped this to the per-item content pages only (token/chain/story),
  matching the existing pattern where 046's Dataset/ItemList JSON-LD also
  never touched hub pages — hub pages are navigational indexes, not a
  "dataset" with its own freshness claim. Noting as a deviation, not blocking.
- **`datePublished` omitted**, per the spec's own default ("no stable
  first-publish date tracked").
- **WebPage node added for story pages** rather than reusing/extending
  FAQPage, since 2 of 3 personas have no FAQ — a type-agnostic WebPage node is
  the only one guaranteed present on every persona page.

## Verification
- `node test_token_pages.js`, `node test_chain_pages.js`, `node test_stories.js`
  — all green (new + pre-existing assertions).
- `npm test` run in full: only `test_smoke.js` fails, and only on the two
  cases needing a live `yields.llama.fi` fetch (`bare /` and `?token=USDC`
  Playwright checks) — network-blocked in this sandbox, documented pre-existing
  in prior loop notes (040/PR#133) as unrelated to this diff. Every other test
  file in the `npm test` chain (canonical, search, hub_pages, indexnow,
  analytics_fires) passed independently when run standalone.
- Live-verified (not fixture-only): ran `generate-token-pages.js` and
  `generate-chain-pages.js` against `test_fixtures/pools-sample.json` into a
  scratch dir — confirmed the real emitted HTML contains
  `<p class="note">Last updated July 12, 2026</p>` and
  `"dateModified":"July 12, 2026"`, byte-for-byte identical, then removed the
  scratch output (not committed).
