# Build notes — 062: waitlist entry point on the static SEO pages

## What shipped
1. `generate-token-pages.js` / `generate-chain-pages.js`: one honest waitlist
   CTA block per generated `/tokens/<slug>` and `/chains/<slug>` page (EN+KO),
   reusing each page's existing `.tp-cta`/`.cp-cta` button style and the
   neuro tokens already in use — no new colors/gradients. New shared helpers
   `renderWaitlistCtaHtml`/`renderWaitlistCtaStyle` live in
   generate-token-pages.js and are reused (not duplicated) by
   generate-chain-pages.js, matching this repo's existing
   "chain generator reuses token generator's exports" pattern.
2. CTA deep-links to `plan.html?waitlist=1&src=seo_token` or `src=seo_chain`.
3. `planner.js`: `?waitlist=1&src=...` auto-opens a waitlist modal on load
   and fires `Analytics.trackWaitlistOpened({ source })`.
4. `analytics.js`: `trackWaitlistOpened`/`trackWaitlistSubmitted` both gained
   an optional `source` field (submit's wasn't strictly required by the spec,
   but the funnel metric — `waitlist_opened(source=seo_*) → submitted` — is
   cleaner to compute if both ends carry it; trivial, zero-risk addition).

## Deviation from the spec — the waitlist modal is a NEW lightweight component, not Bloom's
The spec suggested "open the waitlist modal" as if it were a small addition
to the existing one. In practice, Bloom's waitlist modal (planner.js, inside
`Bloom(props)`) is deeply coupled to a completed plan: `currentMixStats`,
`selectedSubs`, `archetype`, `pk`, `ladderDates`, etc. — all only computed
once a user has answered goal/monthly/persona and Bloom has mounted. A
landing from a token/chain SEO page has none of that.

Two options were on the table:
- **(rejected)** Synthesize a default plan (fake goal/monthly/persona) and
  fast-forward to Bloom like the `?preset=` flow does, so the *existing*
  modal could be reused unmodified. Rejected: this would show the visitor a
  fully personalized-looking plan (concrete pool picks, projections) they
  never asked for — dishonest by the product's own trust-rail standard, and
  a materially bigger/riskier diff than "small planner.js addition."
- **(shipped)** A standalone, plan-independent "quick waitlist" modal at the
  top of `Planner()`, reusing the exact same `gp-waitlist-*` CSS classes and
  copy keys (`waitlistTitle`, `waitlistBenefits`, `waitlistEmailPlaceholder`,
  etc. — already EN+KO) as Bloom's modal, posting to the same Formspree
  endpoint. It skips Bloom's step-2 share/download actions (those need
  `selectedSubs`/`ladderDates`, which don't exist pre-plan) — step 2 is just
  the honest "you're on the list" confirmation.

This keeps the diff honest (no fake plan) and small (no new CSS, only two
small `useEffect`s + one `useState`-driven modal reusing existing tokens).

## Translation-key scoping bug caught during build
First pass tried to reuse `waitlistTitle`/`ctaWaitlist`/`ctaWaitlistMicro`
directly from the Node-side generators via `createTranslationFunction`.
Those keys live nested under `translations.js`'s `planner: {...}` object
(client-only), while `createTranslationFunction` (used by
generate-token/chain-pages.js) only does a flat, single-level
`translations[lang][key]` lookup — every other generator-facing string in
this file (`tcpTokenCta`, `tcpTrustNote`, etc.) is deliberately flat for
exactly this reason. The nested lookup silently fell back to returning the
literal key string (`"waitlistTitle"` rendered as visible page text) instead
of throwing — caught by a new committed test assertion
(`test_token_pages.js`/`test_chain_pages.js`, "062" section), not by manual
inspection. Fixed by adding three new flat `tcpWaitlistHeading` /
`tcpWaitlistCta` / `tcpWaitlistMicro` keys (EN+KO) with copy identical to
their `planner.*` counterparts, rather than restructuring the shared
lookup helper (out of scope, touches every other tcp* call site).

## Playwright acceptance test — waitUntil choice
`test_waitlist_seo_entry.js` (new, wired into `npm test`) drives the real
rendered `plan.html` UI per the 2026-07-11 standing decision (rendered
behavior, not fixtures alone). It uses `waitUntil: 'domcontentloaded'`
instead of this repo's usual `waitUntil: 'load'`
(test_smoke.js/test_search.js/test_spotlight_url.js/test_analytics_fires.js
all use `load`). Root-caused in this build: `plan.html`'s Mixpanel snippet
inserts an async `<script src="https://mp.defi.garden/lib.min.js">`, and in
this sandbox that request doesn't fail fast — it hangs until Playwright's
own per-goto timeout, which is why the `load`-based test files' full runs
take minutes here (confirmed by isolating a bare `domcontentloaded` goto:
338ms; a `load` goto: hangs to its 15s timeout). This is the same
"browser-originated HTTPS blocked at the proxy connection level" limitation
NORTH_STAR.md's 2026-07-12 standing decision already documents for
unpkg.com/yields.llama.fi — confirmed here to affect mp.defi.garden too, via
git-stash comparison showing test_smoke.js/test_search.js/
test_analytics_fires.js hang identically on the unmodified tree (not a
regression from this diff). The waitlist modal's auto-open effect needs
none of that resource, so `domcontentloaded` + an explicit
`waitForSelector('.gp-waitlist-backdrop')` is both faster and the more
precise wait condition for what this test actually checks. The test also
reads `Analytics.trackWaitlistOpened`'s effect via the Mixpanel stub's
queued-call array (`window.mixpanel` holds `['track', eventName, data]`
entries before the real lib loads) rather than needing the real lib to load
— sidesteps the network dependency for the assertion entirely, not just the
page load.

## Fix after verifier review
The verifier caught a real, reproducible defect: `renderWaitlistCtaHtml`'s
`pitch` argument (the token/chain-specific line built from `t('tcpWaitlistPitchToken'|'tcpWaitlistPitchChain', rec.symbol|rec.chain)`)
was interpolated into the page unescaped, unlike every other interpolation
in these two files (`escapeHtml(rec.symbol)`, `escapeHtml(t('tcpTokenHeading', rec.symbol))`,
etc.). Token symbols are constrained by `TOKEN_REGEX`, but chain names have
no equivalent character-safety regex and flow straight from the live
DefiLlama `/pools` API's `chain` field — external data — into HTML on a
public SEO surface. Fixed by wrapping the interpolation with `escapeHtml(pitch)`
in `renderWaitlistCtaHtml` (generate-token-pages.js), matching the function's
own pattern for the heading/CTA/micro lines. Added a dedicated regression
test to both `test_token_pages.js` and `test_chain_pages.js` ("waitlist pitch
line escapes a malicious token symbol / chain name") asserting a `<script>`
payload in `rec.symbol`/`rec.chain` renders escaped inside the waitlist div,
not raw.

## Verification run
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` (NORTH_STAR's canonical set): PASS
- `node test_compiled_assets.js`, `node test_minified_assets.js`: PASS (planner.min.js/translations.min.js regenerated via `npm run minify`)
- `node test_token_pages.js`, `node test_chain_pages.js`: PASS, including new "062" assertion groups (CTA presence/count, honest-copy reuse, per-token/chain pitch text, neuro-token-only styling, EN+KO coverage across every generated record)
- `node test_i18n_pages.js`: PASS (en/ko `tcp*` key-set parity holds with the 5 new keys)
- `node test_waitlist_seo_entry.js` (new): PASS — real rendered `plan.html?waitlist=1&src=seo_token`/`seo_chain` auto-opens the modal, fires `trackWaitlistOpened` with the right `source`, and a plain `plan.html` load does NOT auto-open
- `node test_hub_pages.js`, `node test_sitemap_xml.js`, `node test_canonical.js`, `node test_indexnow.js`, `node test_cache_headers.js`, `node test_og_images.js`, `node test_spotlight.js`: PASS (unaffected surfaces, spot-checked for export/import regressions since generate-token-pages.js's export list changed)
- `node test_smoke.js`, `node test_search.js`, `node test_analytics_fires.js`: pre-existing sandbox network-hang (confirmed via `git stash` on the unmodified tree — identical failure, not caused by this diff); documented sandbox limitation per NORTH_STAR.md 2026-07-12
- `npm run minify`: re-run after every translations.js/planner.js edit; `test_minified_assets.js` confirms byte-identical output

## Trust rails
Untouched. No pool ranking, TVL floor, APY sanity limit, or anomaly-flag
logic touched. The CTA pitch text never states or implies a specific yield
number — it's a generic "spends your yield, not your principal" framing,
same honesty bar as the existing `ctaWaitlistMicro` disclosure
("Card doesn't exist yet") which this build reuses verbatim in spirit
(new `tcpWaitlistMicro` key, identical copy).

## Residual / needs human spot-check
Real `/tokens/<slug>` and `/chains/<slug>` pages with the waitlist CTA land
on the next `sitemap-update.yml` CI run (this sandbox's `yields.llama.fi`
fetch for a live production run is out of scope for this build, same
precedent as every prior token/chain-page item). Render-path merge —
flagged for human visual spot-check per NORTH_STAR.md until 003's smoke gate
covers this class of change end-to-end in CI.
