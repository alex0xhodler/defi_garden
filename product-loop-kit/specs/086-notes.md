# 086 — build notes: footer hub links moved into the Defillama disclosure footer

## What changed

- **translations.js** — new keys `browseTokens` / `browseChains` in BOTH `en`
  ("Browse tokens" / "Browse chains") and `ko` ("토큰 둘러보기" / "체인 둘러보기"),
  placed in the existing `// Footer` block right after `madeWith`.
- **app.js** — BOTH `.app-footer` instances (the pool-detail view at ~2486 and
  the main search view at ~3009) gained a second `<p class="app-footer-hub-links">`
  after the Powered-by sentence, containing `<a href="/tokens">{t('browseTokens')}</a>`
  ` · ` `<a href="/chains">{t('browseChains')}</a>`. Uses the in-scope `t` (App
  component, defined at app.js:813) so the links honor `?lang`. Reuses the
  existing `.app-footer a` styling — no new visual language.
- **style.css** — added `.app-footer-hub-links { margin-top: var(--space-4); }`
  (token-only spacing) and the mode-hide rule
  `html[data-app-mode="analytics"] .seo-hub-links { display: none; }`.
- **home.html** — the IA router now also sets
  `document.documentElement.setAttribute('data-app-mode', window.__APP_MODE)`,
  immediately after `window.__APP_MODE` is decided. The static
  `<footer class="seo-hub-links">` stays in the raw markup unchanged.
- Regenerated `app.compiled.js`, `app.compiled.min.js`, `translations.min.js`,
  `style.min.css` via `npm run compile` + `npm run minify`. (The same minify
  run re-emits planner/PoolDetail/other artifacts byte-identically, so they show
  no git diff — the only planner.* diff in the tree is 085's untouched work.)
- **package.json** — appended `&& node test_footer_hub_links.js` LAST in the
  test chain, after 085's `test_subscription_mix_seed.js`.
- **test_footer_hub_links.js** — new Playwright gate (PORT 8803).

## Mode-hiding mechanism chosen (spec step 3)

`<html data-app-mode="…">`, set in home.html's head IA router — NOT a
`body.analytics-mode` class. Rationale: chose the smallest mechanism consistent
with the router. The head router is where `window.__APP_MODE` is already
decided, and it *already* stamps a pre-paint attribute on `documentElement`
(`data-theme`) two lines below — so `data-app-mode` mirrors an established
pattern, sets before first paint (zero flash / zero FOUC of the static footer in
analytics mode), and needs no `document.body` (which doesn't exist yet at head
time; a body-class approach would have to live in the deferred analytics
bootstrap at the bottom of `<body>`, i.e. later and flash-prone). One attribute +
one CSS rule. The attribute is also generically useful for any future
mode-scoped CSS.

## PoolDetail footer answer (spec step: "does ?pool= render a fixed .app-footer?")

Yes — indirectly. `?pool=` is an analytics param → `__APP_MODE = analytics` →
app.js mounts. PoolDetail.js itself renders NO footer; app.js wraps the
`PoolDetail` element in its pool-detail-view branch (return at app.js:2460) and
renders the `.app-footer` right after it (the ~2486 instance). So the pool-detail
view has the same fixed disclosure footer as the search view, and BOTH footers
therefore needed the links. The `data-app-mode="analytics"` hide rule covers
`?pool=` too (same mode), so the static crawler footer is correctly suppressed
there as well. No change to PoolDetail.js was needed.

## Planner-mode visibility answer (spec step 4)

Planner mode (bare `/`, `data-app-mode="planner"`) mounts NO analytics app and
renders NO `.app-footer`, so nothing is position:fixed over the document end.
The static `.seo-hub-links` sits in normal flow below the planner content, stays
`display:flex` (the hide rule is analytics-scoped), and is visible + clickable.
Verified live via Playwright (test case b): the static `/tokens` link is visible,
scrolls into view, and a real click navigates to `/tokens`. No planner-mode fix
was required. (plan.html is planner-only and, like the bare-`/` planner, is out
of scope for adding links — not touched.)

## Deviation: test harness CSS-application quirk

home.html loads `style.min.css` with the async
`media="print" onload="this.media='all'"` pattern. In headless Chromium that
onload media-swap is unreliable for the *static* `<link>` (JS-injected sheets
like `pool-detail-styles.min.css` do apply; the static print-media link often
stays on `media=print`), so none of style.css applies and `.app-footer` never
becomes position:fixed under test — meaning neither the occlusion bug nor the
`display:none` hide rule is observable out of the box. Existing suites
(test_smoke) sidestep this by only asserting DOM presence, not computed style.
Real Chrome performs the swap (the production site is styled), so the test
includes `applyPrintStylesheets()` which flips any `media="print"` stylesheet
link to `all` after load and waits for the cascade to land (`.seo-hub-links`
computed display leaving the unstyled `block` default). This evaluates the
production-applied CSS — the fixed footer + the analytics hide rule — rather than
faking a result. Navigations to `/tokens` use `waitUntil: 'commit'` because the
generated token index page's external resources never reach `load` in-sandbox;
`commit` proves the click navigated without waiting on blocked fetches.

## Test coverage (test_footer_hub_links.js, PORT 8803, all green)

- (a) `/?token=USDC` (analytics): both hub links present INSIDE `.app-footer`,
  both visible, EN text correct; static `.seo-hub-links` is `display:none`; a
  real Playwright click on "Browse tokens" (which refuses an occluded target)
  navigates to `/tokens`.
- (b) bare `/` (planner): static `.seo-hub-links` `/tokens` anchor present +
  visible, scroll-into-view + click navigates to `/tokens`.
- (c) `?lang=ko&token=USDC`: rendered footer links show "토큰 둘러보기" /
  "체인 둘러보기" (guards the EN+KO rule).
- (d) fs-level: home.html raw source still contains both `<a href="/tokens">`
  and `<a href="/chains">` static anchors (045 crawler surface preserved).

The fixture static server resolves extension-less paths (`/tokens`, `/chains`)
to their generated `index.html` so the links have real 200 navigation targets.

## Guardrail runs (this branch)

- test_footer_hub_links.js — 4/4 passed
- test_smoke.js — 8/8 (both sacred router paths render)
- test_compiled_assets.js — 4/4
- test_minified_assets.js — 9/9
- test_css_minified_render.js — 2/2
- test_subscription_mix_seed.js — 4/4 (085's work intact through the shared
  minify pipeline)
