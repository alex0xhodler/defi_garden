# mode-enumeration-staleness — playbook

**When:** you find a UI element that is present in the DOM but dead — invisible, unclickable, duplicated, or
silently superseded — on ONE route/mode only, and the rule that was supposed to handle it names modes
explicitly (`html[data-app-mode="analytics"] …`, `if (mode === 'planner')`, `__APP_MODE === 'landing'`).
Also: any time you ADD a mode/route, run this as a checklist before shipping it.

**Answer in one line:** the rule is not wrong, it is *incomplete* — it enumerates the modes that existed
when it was written, and a mode added later was never decided for. Extend the enumeration (or invert it),
don't invent a new mechanism.

## Steps

1. **Name the element and every surface that renders its content.** `grep -rn "<class-or-id>" *.html *.css
   *.js`. In this repo the pair is the static `<footer class="seo-hub-links">` in `home.html`/`plan.html`
   vs the React `.app-footer .app-footer-hub-links` rendered by `app.js` and `landing.js:356-367`.
2. **Find the mode-conditional rule and read its comment as evidence, not as truth.** `style.css:2589` and
   its render-blocking twin at `home.html:148`. A comment that explains WHY a mode was excluded ("planner
   mode has no fixed `.app-footer`") is exactly where staleness hides: it was true, then a new mode arrived.
3. **Enumerate the modes that actually exist NOW, from the router, not from memory.** `home.html`'s IA router
   computes `analytics | planner | landing` and mirrors it onto `<html data-app-mode>` before paint. Add the
   static files that bypass the router: `plan.html` sets `window.__APP_MODE` but no `data-app-mode` at all,
   so mode-attribute rules never match there.
4. **Decision rule, per mode:** does that mode render its OWN copy of the same content in a `position: fixed`
   container? YES → the static copy is occluded/duplicated; it must be hidden there. NO → the static copy is
   the only copy; it must stay visible. Anything you cannot answer from the code is a question for the human,
   not a guess.
5. **Prove the deadness before fixing it.** A real Playwright `click()` on the element is the cheapest proof:
   it refuses to click an occluded target, so a `Timeout … exceeded` IS the occlusion evidence. Count
   `a[href="…"]:visible` too — "2" is the duplication, "1" is the fix.

## Resolution

- Extend the existing selector/condition to the new mode; keep every duplicated copy of the rule
  byte-consistent (this repo deliberately inlines the CSS rule in `home.html`'s `<head>` as
  render-blocking critical CSS AND in `style.css` — item 131; both must be edited together, and
  `npm run minify` re-run or the page loads the old `style.min.css`).
- Update the stale comment in the same commit. The comment is what made the next reader trust the gap.
- Acceptance is rendered, not textual: assert exactly ONE visible copy per mode, the static copy still
  PRESENT in the DOM (crawlers), and a real click navigating. Mutate the rule back and confirm only those
  cases redden.

## Traps

- **Hiding is not deleting — but prove it on both crawler paths.** `display:none` keeps the anchors in the
  served source (non-JS crawlers never get `data-app-mode`), and a JS-executing crawler sees the mode's own
  visible copy. If EITHER path would lose the link, it is SEO deletion and NEVER-list, not a dedup.
- A file that bypasses the router (`plan.html`) has no mode attribute, so it silently takes the "no rule
  matched" branch. That is the branch to check first, not last.
- The translation keys for a duplicated element may live under a different namespace than the surface you
  are editing: `footerBrowseTokens` is under `translations[lang].landing`, and `planner.js`'s `t()` only
  reads `.planner`, so `t('footerBrowseTokens')` key-echoes instead of translating. Read the dict, don't
  assume the helper reaches it.
- Do not "fix" occlusion with padding so both copies are visible — two identical link pairs on one page is
  the duplication the rule exists to prevent.

## Variant: the enumeration lives OUTSIDE the app (edge config, CI, a generator)

Same failure, one layer down — and worth its own checklist because the app-side habits do not transfer.
`vercel.json` cannot express "no query string at all" (`source` matches the path only; `has`/`missing`
predicates are per-key), so an edge rule that must know "does this URL select specific content?" is
*forced* to re-enumerate the router's params in a second file that the router never reads.

1. **Find the definition and mirror it, don't re-derive it.** The router's own arrays are the definition
   — `home.html:77-78`'s `ANALYTICS_PARAMS` / `PLANNER_PARAMS`. Anything you assemble by reading the app
   "carefully" is a second, weaker definition that will disagree eventually.
2. **Guard with SET EQUALITY against the definition, both directions.** Parse the array literals out of
   the defining file in the test and assert the mirrored list equals their union exactly: no member
   unlisted, no listed key that is not a member. A subset check passes forever while the mirror rots; an
   equality check also catches typos and stale removals.
3. **Check what mechanism the definition actually uses before writing the guard.** This is the trap that
   burned 212: the first guard regex-scanned for literal `.get('key')` calls and was *structurally blind*
   to `app`, which the router reads as `ANALYTICS_PARAMS.some(k => params.has(k))`. The guard looked
   thorough, passed, and was watching a mechanism that resembled the real one. A guard aimed at the wrong
   mechanism is worse than none — it launders the gap as coverage, and the notes then *claim* protection
   against exactly the class it cannot see.
4. **Then prove the mechanism list is closed.** Sweep the defining file for any *other* literal
   `params.has('…')`/`searchParams.get('…')` outside the arrays. Zero hits = the arrays are provably the
   whole set. Say the result explicitly in the notes; "no other mechanism" left implied is not a finding.
5. **The mirror may not FIT — check the platform's schema limits before designing around a long list.**
   Vercel hard-caps `has` and `missing` at **16 entries** and rejects the whole deployment above that
   (`vercel.json` schema validation failed … should NOT have more than 16 items). Valid JSON, green local
   tests, and a correct rule set are all compatible with a deploy that never happens — **this class of
   failure is only visible from a real deployment**, so never treat "local gates green" as ship-ready for
   edge config. When the mirror overflows the cap, move the overflow to *positive* rules rather than
   trimming the list: one `{source, has:[{query:K}], destination:<the normal target>}` placed BEFORE the
   negative rule short-circuits it deterministically (rewrites are first-match-wins). Headers have no
   short-circuit — all matching rules apply, later overriding — so a header override is a weaker
   mechanism; move the param with the smallest blast radius there, and say which one and why. Then widen
   the equality guard to `missing ∪ positive-rule keys` and add a test asserting no array in the file
   exceeds the cap.
6. **Escaped-path traps in edge config.** A path param is greedier than it looks: Vercel's bare `:slug`
   matches `[^/]+` **including dots**, so `/tokens/:slug` also matches `/tokens/usdc.md` and rewrites it
   to `…​.md.md`. Constrain to `:slug([^/.]+)` once you have confirmed no real slug contains a dot
   (`ls tokens/ | sed 's/\.html$//' | grep -c '\.'` → 0). Sibling paths that match the pattern but have no
   target (`/tokens/index`) need an explicit passthrough rule placed BEFORE it — rewrites are
   first-match-wins.

**Decision rule:** if a list of names exists in two files and only one of them is read at runtime, the
other is a mirror; mirrors get an equality test against the original, in the same commit that creates
them. If you cannot write that test because the original is not machine-readable, that is the finding —
make the original parseable rather than hand-maintaining the copy.

## Provenance

Item 179 (2026-07-30) — the static `.seo-hub-links` crawler footer was dead on bare `/` (measured: 2 visible
`/tokens` links, static click `Timeout 3000ms`) because the 086 dedup rule named only `analytics` and the
2026-07-15 landing pivot added a landing-mode `.app-footer` with the same links; `/plan.html` had no hub-link
surface at all. Verifier PASS 9/9, HIGH. `specs/179.md`, `specs/179-notes.md`, BACKLOG row 179 (filed by item
176's browser-lane triage). Related: `dual-source-logic-divergence.md` covers two FORKED copies of the same
logic drifting; this one covers ONE rule that never learned about a new mode.

The "enumeration lives outside the app" variant: item 212 (2026-08-03) — `vercel.json`'s markdown-negotiation
`missing` list had to mirror `home.html`'s `ANALYTICS_PARAMS`/`PLANNER_PARAMS`. Attempt 1 assembled the list
by scanning for `.get('key')` calls, missed `app` (read via `.some(k => params.has(k))`, and linked live from
`planner.js:3863` as `/?app=1`), and shipped a drift guard blind to that whole mechanism — verifier FAIL.
Attempt 2 rebuilt the guard as exact set equality against the two array literals — and then the PR's first
deploy was rejected outright by Vercel's 16-entry cap on `has`/`missing`, with every local gate green,
forcing the positive-rule overflow pattern in step 5. `specs/212.md`, `specs/212-notes.md`.
