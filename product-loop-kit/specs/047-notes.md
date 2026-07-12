# 047 build notes

## What shipped
- `generate-token-pages.js`: added `buildAnswerAndFaq`, `renderAnswerBlockHtml`,
  `renderFaqBlockHtml`, `renderFaqJsonLd` (exported, reused by
  `generate-chain-pages.js` — same reuse pattern as 041's chain-page work
  reusing token-page helpers).
- Both `renderTokenPage`/`renderChainPage` now render: a 2-sentence
  direct-answer block right after `<h1>`, a visible FAQPage Q&A block (3
  items) after the pool table, and a matching `FAQPage` JSON-LD block in
  `<head>`.

## Judgment calls (spec left these to the builder)
1. **3 FAQ items, not 2 or 4** — spec allows "2-4 Q&A"; 3 covers the exact
   three example questions the spec itself suggests ("highest yield today",
   "how many pools clear the floor", "are these rates safe") without padding.
2. **Trust rail enforced structurally, not by a separate filter** —
   `buildAnswerAndFaq` only ever reads `rec.pools[0]` (`topPool`) and
   `rec.qualifyingCount`/`rec.totalTvl`, all already gated by
   `rankTopTokens`/`rankTopChains` before this function is ever called (same
   data the visible table already renders from). There is no code path where
   an anomalous or sub-floor pool can reach the answer/FAQ — verified with the
   ANOM/Anom fixtures (real $2M pool + excluded $900M@2100% pool): neither the
   project name nor the anomalous APY appears anywhere in the rendered page.
3. **Escaping**: reused the exact 040/`generate-stories.js` FAQ pattern —
   visible HTML uses `escapeHtml`, JSON-LD uses raw `JSON.stringify` +
   `.replace(/</g, '\\u003c')` (`</script>`-breakout guard only, no HTML-entity
   escaping) since JSON-LD text must byte-for-byte equal the HTML-entity-
   *decoded* visible text, not the escaped source. Verified via a decode-and-
   compare test (matches the format the 040 kevin-page tests already use).
4. **Placement**: answer block goes immediately after `<h1>`, before the
   existing `.sub`/`.intro`/CTA/table — satisfies "after H1, before the
   table" literally without displacing pre-existing content order. FAQ block
   goes after the pool table, before the related-links nav (natural reading
   order: data table → questions about the data → related pages).
5. **EN-only, structured for 050** (per spec's open question default): all
   FAQ/answer copy lives in one function (`buildAnswerAndFaq`) rather than
   scattered inline strings, so a future i18n pass (050) can swap it for a
   language-keyed lookup without restructuring the callers.

## Verification
- `node test_token_pages.js` (59 assertions) / `node test_chain_pages.js` (53
  assertions) — full suites pass, including new 047 sections: placement,
  content correctness, FAQPage↔visible byte-match, trust-rail exclusion via
  the ANOM/Anom anomaly fixtures, XSS-safety of the new ld+json block,
  additive-only (no pre-existing content moved).
- `node test_planner.js && node test_protocol_parsing.js && node
  test_qualifier_fix.js` (NORTH_STAR's canonical "Test:" command) — all pass,
  unaffected.
- `node --check` on both touched generator files — syntax valid.
- Manually generated fixture pages (`--fixture test_fixtures/pools-sample.json`
  / `pools-chain-sample.json`) and inspected the rendered answer/FAQ HTML +
  parsed JSON-LD by hand — matches spec's own example copy shape.

## Environment limitation hit during verification (documented, not a code
defect — matches the 040-notes.md precedent exactly)
This sandbox has no `node_modules` (no `playwright` installed) and no network
egress to `yields.llama.fi`/CDN hosts, so `npm test`'s Playwright-driven
suites (`test_smoke.js`, `test_search.js`) cannot run in this session —
confirmed pre-existing and unrelated to this diff (both fail identically on a
clean checkout with `Cannot find module 'playwright'`, before this diff's
changes). Spec 047's acceptance criteria only require fixture-generated-page
and programmatic (JSON-LD-vs-visible-text) verification — both done above,
neither depends on a live browser or the DefiLlama API. Per NORTH_STAR's
timebox rule, documenting here and proceeding rather than blocking
indefinitely on an unavailable browser install.
