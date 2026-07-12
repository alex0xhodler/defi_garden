# 040 build notes

## Judgment calls (spec left these to the builder)

1. **`WebSite`/`Organization` sitewide vs planner-only** — went sitewide (static
   block in `home.html`'s `<head>`, outside the IA router's script). It's the
   same brand entity regardless of `__APP_MODE`, and it never conflicts with
   the router's canonical/title rewrite (different mechanism, same page load).
   Two separate `<script type="application/ld+json">` tags (not one `@graph`)
   so each type is independently parseable/testable, matching how the
   acceptance criteria phrases them as two blocks.

2. **`BreadcrumbList` "Tokens" node has no `item` URL** — verified there is no
   `/tokens` hub/index page anywhere in the repo (no `vercel.json` rewrite, no
   generated index, `grep` for `/tokens` outside `/tokens/<slug>` turns up
   nothing). schema.org's `ListItem.item` is optional; Google's own guidance
   says structured data must reflect actual page content, and linking a
   middle breadcrumb crumb at a URL that would 404 is worse than an unlinked
   label. Home and the current page (`<SYMBOL>`) both get real, existing
   URLs. Documented as a deliberate deviation from "correct item URLs" being
   read as "every item has a URL" — read instead as "every URL present is
   correct," which is the more literal and honest interpretation.

3. **`PoolDetail.js` breadcrumb mirrors the actual visual breadcrumb**, which
   is 2 levels ("Search Results" -> "`<SYMBOL>` Pool"), not 3 — there is no
   separate "Home" crumb in the rendered UI at this view, so the JSON-LD
   doesn't invent one. "Search Results" links to `?app=1` (forces analytics
   mode with no filters — the generic search-results root), matching what
   "Search Results" conceptually means since the actual back-navigation
   target depends on ephemeral filter state that isn't part of the page's
   static identity.

4. **JSON-LD script bodies use raw (unescaped) source text, not the
   HTML-escaped strings used for visible rendering**, with a `<` ->
   `<` substitution over the whole serialized JSON to prevent
   `</script>` breakout. This is deliberate: JSON escaping and HTML escaping
   are different, and a browser does not decode HTML entities inside
   `<script>` content — using the HTML-escaped strings would have produced
   literal `&amp;`/`&lt;` inside the parsed JSON-LD values, which is wrong
   and would NOT byte-for-byte match the visible (entity-decoded) rendered
   text, violating the FAQPage acceptance criterion.

## Pre-existing gap found, NOT fixed here (out of scope)

`generate-token-pages.js`'s `renderAnalyticsBootstrap` (shipped in 039)
`JSON.stringify`s its `properties` object — which includes the raw token
`symbol` — directly into a plain `<script>` tag with no `</script>`-breakout
guard. A token symbol containing a literal `</script>` sequence (not
currently possible from real DefiLlama data, but not structurally
prevented either) would break out of that script tag. This is a distinct,
pre-existing script tag from the one this spec adds, and fixing it is a
drive-by refactor outside 040's scope (040 is JSON-LD only, "no new
computation"). Flagging for a future backlog item — a test in
`test_token_pages.js` (`'malicious symbol cannot break out of the ld+json
script tag'`) documents and isolates this so it doesn't silently regress
further, but only asserts on the JSON-LD block this diff owns.

## Test coverage added
- `test_token_pages.js`: BreadcrumbList presence/shape/values, XSS-safety of
  the JSON-LD block for a malicious symbol.
- `test_stories.js`: FAQPage presence + byte-for-byte match to `p.faq` for
  kevin; absence for tomoko/lucia (no `faq` array).
- `test_smoke.js`: static check of `home.html`'s Organization/WebSite blocks
  (valid JSON, required properties); Playwright check that the live
  pool-detail view (`?pool=<id>`, reached by clicking a real `.pool-card`)
  renders a `BreadcrumbList` block.

## Manual Rich-Results property checklist (no live Rich Results Test in this
sandbox — network egress to Google's tool isn't available here)
- `Organization`: requires `name` (✓), recommends `url` (✓) + `logo` (✓, reuses
  `og-image.png` — no new asset).
- `WebSite`: requires `name` (✓) + `url` (✓). (No `SearchAction` — the app has
  no dedicated internal search-results URL scheme to point one at; out of
  scope, not fabricated.)
- `BreadcrumbList`: each `ListItem` needs `position` + `name` (✓ all); `item`
  required except optionally the last — here Home and the current page have
  `item`, "Tokens" deliberately omits it (see judgment call #2).
- `FAQPage`: `mainEntity` array of `Question`, each with `name` + one
  `acceptedAnswer` (`Answer` with `text`) — all present, sourced 1:1 from
  `p.faq` (✓).
