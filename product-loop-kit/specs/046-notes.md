# 046 build notes

## What shipped
- `generate-token-pages.js` / `generate-chain-pages.js`: added `ItemList` + `Dataset` JSON-LD, additive only.
- New shared helpers in `generate-token-pages.js` (exported, reused by `generate-chain-pages.js` per the repo's existing reuse pattern for `tp.*`):
  - `poolHrefFor(p, fallbackUrl)` — the exact `p.pool ? /?pool=<id> : fallbackUrl` link-resolution logic that table rows already used inline. Factored out and used by BOTH the visible `<tr>` rendering and the `ItemList` JSON-LD, so the two literally cannot drift (this directly satisfies the spec's "verified programmatically, byte-for-byte" requirement — enforced by construction, not just by a test).
  - `renderItemListJsonLd(pools, appUrl)` — builds the `ItemList` block from the same `pools` array the table renders, same order, `position` = row index + 1, `name` = `"<project> on <chain>"`, `url` via `poolHrefFor`.
  - `renderDatasetJsonLd(name, description, pageUrl, generatedDate)` — generic Dataset block, `creator`/`publisher` = DeFi Garden Organization, `url` = the page's own canonical URL.
- `renderTokenPage`/`renderChainPage` gained an optional third param `generatedDate` (defaults to `new Date().toISOString().slice(0,10)` when omitted) so `Dataset.dateModified` reflects the actual generation run without requiring a CI wiring change this cycle.
- Inserted both new `<script type="application/ld+json">` blocks immediately after the existing `BreadcrumbList` block in `<head>` — no other markup touched.

## Deviations from spec
- **`dateModified` source**: spec said "coordinate with 048's freshness work if it lands first, else emit the CI generation date." 048 (freshness signals) is still READY, not shipped, so this ships with `new Date()` at generation time (same pattern `generate-sitemap.js`/`generate-token-pages.js` already use for `lastmod`). When 048 ships, it can pass its own generation timestamp through the new `generatedDate` param instead of introducing a new one — no rework needed, just wiring.
- **ItemList `name` field for chain pages**: the spec's literal example (`name = "<project> on <chain>"`) reads token-page-flavored, since every pool on a chain page is already on that one chain — the field is slightly redundant there ("aave-v3 on Base" repeated for every row on the Base page). Kept the identical format anyway so `renderItemListJsonLd` is one shared, provably-correct function reused by both generators (CLAUDE.md "reuse before inventing") rather than two near-duplicate implementations. Flagging as a conscious call, not an oversight — a chain-specific label (e.g. `"<project> (<token>)"`) would need its own function and its own drift risk.
- **Rich Results Test**: per 040's precedent, no live Google Rich Results Test is available in this sandbox (no network to the API and no browser-side render of a real published page). Manual property checklist applied instead (see below), matching the acceptance criterion's own fallback language.

## Manual property checklist (no live Rich Results Test available, per 040 precedent)
`ItemList` (google.com/search/docs/appearance/structured-data/carousel — required properties):
- `@type: "ItemList"` ✓
- `itemListElement`: array of `ListItem` ✓, each with `position` (1-indexed, sequential) ✓, `name` ✓, `url` (must resolve, must match the visible link) ✓

`Dataset` (google.com/search/docs/appearance/structured-data/dataset — required properties):
- `@type: "Dataset"` ✓
- `name` ✓ (required)
- `description` ✓ (required)
- recommended: `url`, `creator`/`publisher` — included for completeness even though not strictly required, mirroring the Organization already established by 040.

## Test coverage added
`test_token_pages.js` / `test_chain_pages.js`, mirroring the existing 040 BreadcrumbList test pattern:
- exactly one `ItemList` block; item count, order, `name`, and `url` match the rendered table 1:1 (asserts the JSON-LD url string literally appears as a rendered `href=` in the page — the strongest drift check available without a DOM parser)
- exactly one `Dataset` block with all required + the extra recommended properties present and correctly typed
- `Dataset` content is record-specific (not a fixed template) — token/chain name appears, differs across records
- `generatedDate` param controls `dateModified`, defaults sanely when omitted
- XSS: a malicious `project` string cannot break out of the `ItemList` `<script>` tag (same escape-and-assert pattern as 040's BreadcrumbList test)
- additive-only: stripping all `ld+json` blocks reproduces the pre-046 page (title/canonical/robots/related-nav/analytics bootstrap all present, unchanged)

All new + pre-existing `test_token_pages.js` (51 assertions) and `test_chain_pages.js` (45 assertions) pass.

## Test run (full suite, timeboxed)
`node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` — pass (NORTH_STAR's canonical Test command).
Ran the full `npm test` chain after `npm install` (playwright wasn't installed in this session's container). Pre-existing, diff-unrelated failures observed, all previously documented by earlier loops in this exact sandbox:
- `test_smoke.js`: `bare /` and `/?token=USDC` Playwright renders time out — `yields.llama.fi` is network-blocked in-sandbox (confirmed via `curl`/proxy status by 040's notes; identical failure mode already logged for those same two checks in 040/045's ship notes — not a regression from this diff, which touches neither `home.html` nor the live-fetch path).
- `test_search.js`: 19/20 pass; 1 flake (`page.waitForTimeout: Target page, context or browser has been closed`) — a Playwright browser-lifecycle flake in an unrelated search test, not touched by this diff.
- `test_canonical.js`, `test_hub_pages.js`, `test_indexnow.js`, `test_stories.js`, `test_token_pages.js`, `test_chain_pages.js`: all pass (24, 22, 10, 15, 51, 45 assertions respectively) when run directly (the `npm test` `&&` chain stops at the first failure, `test_smoke.js`, so these ran individually to confirm).

## Risk tier
Builder's guess: HIGH (per spec, matches NORTH_STAR's generated-SEO-surface rule). No trust-rail, canonical, ranking, or visible-content change — additive JSON-LD only.
