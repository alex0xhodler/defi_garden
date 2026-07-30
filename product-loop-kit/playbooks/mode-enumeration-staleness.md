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

## Provenance

Item 179 (2026-07-30) — the static `.seo-hub-links` crawler footer was dead on bare `/` (measured: 2 visible
`/tokens` links, static click `Timeout 3000ms`) because the 086 dedup rule named only `analytics` and the
2026-07-15 landing pivot added a landing-mode `.app-footer` with the same links; `/plan.html` had no hub-link
surface at all. Verifier PASS 9/9, HIGH. `specs/179.md`, `specs/179-notes.md`, BACKLOG row 179 (filed by item
176's browser-lane triage). Related: `dual-source-logic-divergence.md` covers two FORKED copies of the same
logic drifting; this one covers ONE rule that never learned about a new mode.
