# Spec 011 — build notes

Builder: Sonnet 5 (build-loop iteration). Territory: `home.html` head + IA router only,
plus two new files (`canonical.js`, `test_canonical.js`) and one line of `package.json`.
Files touched: exactly these four. No git operations performed (per dispatch envelope);
working-tree edits only. Did not touch `app.js` or `translations.js` (explicitly forbidden
— another agent's concurrent territory) and did not touch `plan.html` (verified correct,
see below).

## Territory findings (actual vs. hinted line numbers)

- Spec 011's own territory notes said "home.html:8 title, :15 static canonical, :54-80
  router + canonical/OG rewrite." Confirmed accurate pre-edit: title at line 8, static
  canonical at line 15 exactly, router IIFE at lines 54-87 (spec said "54-80" — close;
  the block actually runs to line 87 pre-edit, 86 lines counting the closing `})();`
  and `</script>`, minor undercount in the spec, not a real discrepancy).
- `ANALYTICS_PARAMS` was at line 61 pre-edit (spec said :61 — exact match). Confirmed
  **byte-for-byte untouched** post-edit (now at line 69, shifted by 8 lines because of
  the new `canonical.js` script tag + its explanatory comment inserted above it — content
  identical, diffed by hand against the pre-edit read).
- No other file references a static canonical tag pattern relevant to this spec; grepped
  `plan.html`, `app.js`, `PoolDetail.js`, `generate-sitemap.js`, `generate-stories.js` for
  `rel="canonical"` — only `plan.html` has one (see verdict below), everything else is
  either the JS selector string `'link[rel="canonical"]'` (a lookup, not markup) or
  unrelated.

## Design: why `canonical.js` never reads `ANALYTICS_PARAMS`

The dispatch envelope was explicit that `window.__canonicalFor(search)` takes **one**
argument (not a pre-computed mode flag), which means the pure function has to decide
"is this an analytics URL" on its own — while spec 011 also explicitly forbids touching
or duplicating `ANALYTICS_PARAMS` (8 params: token, chain, pool, poolTypes, protocols,
minTvl, minApy, **app**). The spec's own normalized-query allow-list is only **7** params
— it drops `app`. Grepped for real `app=` usage before assuming it was dead: `planner.js:3319`
uses `href: '/?app=1'` for the header icon's "back to analytics" link (CLAUDE.md: "reached
from the planner via the header icon"). So `?app=1` is a live, real, user-facing URL that
*is* analytics mode per `window.__APP_MODE`, and any implementation has to get it right.

`canonical.js` resolves this by using **only** the 7-item `CANONICAL_PARAMS` list for
*both* "does this look like an analytics URL" and "what goes in the query" — it never
reads or restates `ANALYTICS_PARAMS`. This is provably equivalent to a hypothetical
"mode-aware" implementation that checks the real 8-item list first:

- If any of the 7 `CANONICAL_PARAMS` are present → both approaches agree: analytics mode,
  same normalized query (built from the same 7 either way) → same output.
- If none of the 7 are present but `app` is → the real `ANALYTICS_PARAMS` check says
  "analytics mode," but the normalized query (still built from the same 7-item list) is
  empty either way → output is the bare root regardless of which list decided "mode."
- If none of the 8 are present → both agree: planner mode → root.

So for every possible input, the two approaches produce byte-identical output. This is
exercised directly by `test_canonical.js`'s `?app=1` and `?token=USDC&app=1` cases.

**Known residual risk for future maintainers** (flagging per house style — "flag when you
don't know something," not hiding this): the equivalence above only holds because `app` is
the *only* item in `ANALYTICS_PARAMS` that isn't also in `CANONICAL_PARAMS`, and `app` is a
mode-only flag with no content of its own. If a future spec adds a new param to
`ANALYTICS_PARAMS` that **is** content-defining (e.g. a hypothetical `sortBy`) without also
adding it to `CANONICAL_PARAMS`, the equivalence breaks silently — `canonicalFor` would
canonicalize a real, distinct analytics view to root. This isn't fixable now (there's no
such param today, so there's nothing to encode), but any future edit to `ANALYTICS_PARAMS`
should trigger a review of `CANONICAL_PARAMS` in the same pass. Left a pointer comment in
`canonical.js` itself; not adding a runtime check because that would mean duplicating
`ANALYTICS_PARAMS` after all, which is what the spec forbids.

## `plan.html` verdict: correct, not touched

Spec 011 asked me to verify `plan.html`'s canonical while in territory and fix only if
wrong. Read the full file: static `<link rel="canonical" href="https://www.defi.garden/plan.html">`
(line 13), static `og:url` same value (line 24), no inline router, no JS anywhere in the
file that ever touches either tag — `plan.html` is a dedicated, always-planner entry point
(no `__APP_MODE` branching exists there at all).

The question is whether a **static, query-stripped** canonical is correct given `plan.html`
*does* receive query params in real traffic — confirmed via grep, not assumed:
- `generate-stories.js:489` links `../plan.html?preset=${slug}` (persona landing pages)
- `app.js:2468` / `PoolDetail.js:448` link `plan.html?lang=ko` and `plan.html?fresh=1`
- `planner.js`'s `encodePlanToUrl` (line 848) builds share URLs from `window.location.href`,
  so a plan saved while on `plan.html` produces share links like
  `plan.html?goal=...&monthly=...&pace=...&years=...`

None of these query variants change what's server-delivered — `plan.html` is one static
HTML shell always; personalization happens client-side via `planner.js` reading the query
into React state. This is the exact same shape as bare-root planner mode, where spec 011
itself mandates share-URL variants (`?goal=&pace=`, `?preset=`, `?fresh=1`) collapse to one
root canonical. A static, always-identical `plan.html` canonical (already stripped of any
query, by construction — it never varies) achieves precisely that collapsing behavior for
free, with zero JS needed. **Verdict: correct as-is. Not modified.**

## Self-caught test bug (documenting because it's a real finding, not a non-event)

First version of `test_canonical.js` had two tests asserting ordering in `home.html`'s
source via `homeHtml.indexOf('window.__canonicalFor(')`. That string also appears in the
explanatory comment I added directly above the `<script src="canonical.js">` tag ("...calls
`window.__canonicalFor()`. No defer:..."), which sits *before* the real call site — so the
search matched my own prose, not the code, and one of the two tests failed for the wrong
reason (a real ordering bug would also have failed the same way, so this wasn't silently
wrong, just imprecise). Root-caused rather than papered over: changed the marker to the
exact call-site substring `'var canonicalUrl = window.__canonicalFor('`, which is unique to
the real assignment and cannot appear in prose. Both tests pass for the right reason now.
This is the kind of thing an independent verifier should be able to re-derive by reading the
diff; documenting it here so it doesn't look like it was missed.

## Deviations / judgment calls

1. **`module.exports` shape**: exported `canonicalFor` as a bare function
   (`module.exports = canonicalFor`), not wrapped in a namespace object like `planner.js`'s
   `module.exports = api`. Planner.js's object-of-many-functions shape exists because it
   exports ~25 helpers; `canonical.js` exports exactly one, so `const canonicalFor =
   require('./canonical.js')` reads more directly than `const c = require(...); c.canonicalFor(...)`.
   The browser-side global still matches the dispatch envelope's literal spec,
   `window.__canonicalFor(search)`, in both shape and call signature.
2. **Extra tests beyond the "at minimum" list**: added stable-order-with-all-7-scrambled,
   `?app=1` (the real header-icon URL), idempotence, and a home.html-source regression pair
   (no static tag; script-before-router ordering) on top of the spec's minimum list. All are
   direct, falsifiable assertions about acceptance criteria or a genuine edge case surfaced
   during design (the `app` param), not padding.
3. **`og:url` meta**: left the static default (`https://www.defi.garden/`, line 28) in the
   HTML as a no-JS fallback — the router now unconditionally overwrites `.content` in both
   modes at runtime, so the static value only matters for zero-JS crawlers, for which it's
   already the correct planner-mode value.
4. **Twitter card tags untouched**: spec only mandates canonical + og:url; `twitter:title`/
   `twitter:description` were never dynamically rewritten before this change either (static
   only, in both the old and new code), so this is a pre-existing condition, not a regression
   introduced here. Not in scope per spec's explicit "OUT of scope" list; flagging for
   awareness only, not fixing.
5. **hreflang alternate tags** (lines 20-22): untouched — spec doesn't mention them, and
   spec explicitly lists "any URL semantics" as out of scope.

## Verification run (read-only mount, per dispatch envelope)

```
$ node -c canonical.js && node -c test_canonical.js
canonical.js: OK
test_canonical.js: OK

$ (extracted all 4 inline <script> blocks from home.html, node -c'd each)
block 0 (canonical/router): OK
block 1 (mode-conditional CSS): OK
block 2 (Mixpanel stub): OK
block 3 (WebMCP + body analytics-app loader): OK

$ grep -nE '<link[[:space:]]+rel="canonical"' home.html
(no match, exit 1) — PASS: no static canonical tag in raw markup (acceptance criterion #1)

$ node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js && node test_canonical.js
→ 190/190 in test_planner.js, both parsing scripts ran clean, 24/24 in test_canonical.js
→ combined exit 0
```

Full verbatim output is in the build-loop's final summary message, not reproduced twice
here.
