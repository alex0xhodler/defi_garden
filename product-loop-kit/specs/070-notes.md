# 070 — implementation notes

## What shipped

**`planner.js`** (2 edits, both inside `Bloom()`):
1. Deleted the dead `ctaElement` block (the `// CTA element (shared) — opens waitlist modal` declaration: `gp-cta-row` wrapper + `gp-primary-cta` button + `gp-cta-microcopy` p). It was built but never inserted into either JSX tree `Bloom()` returns (documented dead code per 009-notes / 061-notes). `grep -c '\bctaElement\b' planner.js` → **0**.
2. Added `e('p', { className: 'gp-cta-microcopy' }, t('ctaWaitlistMicro'))` inside `checkoutPanelElement`, directly after the `gp-primary-cta gp-checkout-cta` button and before the `gp-checkout-trust` pills div. One insertion point serves both bloom layouts (subscription branch at ~line 2724 and target/growth branch at ~line 2738 both mount `checkoutPanelElement`).

**`planner.min.js`** — regenerated via `npm run minify` (had to `npm install` first; `terser` and other deps were not present in the working tree). Verified: `grep -c gp-cta-microcopy planner.min.js` → 1, `grep -c gp-cta-row planner.min.js` → 0. `test_compiled_assets.js` confirms planner.min.js is byte-identical to a fresh minify of planner.js.

**`package.json`** — appended `&& node test_waitlist_microcopy.js` to the end of the npm `test` chain (after `test_hero_copy.js`, matching the test_hero_copy precedent).

**`test_waitlist_microcopy.js`** (new) — rendered Playwright gate mirroring the test_hero_copy.js / test_waitlist_pitch.js boilerplate (local static server on port 8800, `page.route` fixture for `**yields.llama.fi/pools**`, all other non-local requests aborted, chromium via `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` with `executablePath` fallback `/opt/pw-browsers/chromium`). Canonical EN/KO `ctaWaitlistMicro` strings are read at runtime from `translations.js` (`tr.en.planner.ctaWaitlistMicro` / `tr.ko.planner.ctaWaitlistMicro`), never hardcoded. 6 assertions:
- source-sanity guard (strings present),
- subscription bloom EN string renders in `.gp-checkout-panel .gp-cta-microcopy`, no page errors,
- growth bloom EN string renders, no page errors,
- subscription bloom `&lang=ko` KO string,
- growth bloom `&lang=ko` KO string,
- clicking `.gp-checkout-cta` still opens `.gp-waitlist-backdrop`.

**Not touched** (per spec): translations.js strings, analytics calls, the waitlist modal, CSS (`.gp-cta-microcopy` at planner-styles.css:1411 reused as-is; renders cleanly in the checkout panel, no spacing collision observed → no CSS change, so no min-CSS regen needed on that account). `.gp-cta-row` CSS left alone as instructed.

## Deviation from spec

- The spec's suggested subscription bloom URL `/plan.html?goal=claude&pace=stable&fm=monthly` does **not** reach a bloom: `decodePlanFromUrl` + the shared-plan→bloom effect (planner.js ~3791) require a `capital` **or** `monthly` value for a non-growth archetype to advance to `step='bloom'` (`if (arch !== 'growth' && !answers.capital && !answers.monthly) return;`). The bare URL yields `monthly: NaN` and stalls on the conversation step. Fixed in-test by using `goal=claude&pace=stable&fm=capital&capital=5000` (a capital-funded subscription "forever number" plan), which is the natural subscription bloom URL and reaches `.gp-checkout-panel`. The growth URL `goal=retirement&pace=rwa&capital=1000&fm=capital&years=5` (proven in test_growth_capital_projection.js) is used verbatim for the growth archetype. No product-code impact — this only affected the test's URL choice.

## Test results

Individually run, each timeboxed:
- `test_waitlist_microcopy.js` — **PASS**, 6/6, exit 0.
- `test_planner.js` — **PASS**, 208 assertions, exit 0.
- `test_protocol_parsing.js` — **PASS**, exit 0.
- `test_qualifier_fix.js` — **PASS**, exit 0.
- `test_minified_assets.js` — **PASS**, 7 assertions, exit 0.
- `test_compiled_assets.js` — **PASS**, 4 assertions (planner.min.js byte-identical), exit 0.

Full `npm test`: the `&&` chain stops at `test_smoke.js` (6th in chain), so the suites after it don't run in-chain. Ran every post-smoke suite individually to confirm no regression from this diff. **PASS** (exit 0): test_canonical (24), test_token_pages (88), test_chain_pages (69), test_sitemap_xml (25), test_hub_pages (22), test_indexnow (10), test_stories (21), test_i18n_pages (19), test_og_images (18), test_cache_headers (7), test_spotlight (38), test_spotlight_packs (11), test_spotlight_url (3/3), test_spotlight_attribution (3/3), test_growth_capital_projection (2/2), test_waitlist_seo_entry (4), test_waitlist_funnel (3), test_waitlist_pitch (7), test_hero_copy (4), test_waitlist_microcopy (6).

### Pre-existing environmental failures (NOT caused by this diff, not fixed)

Three suites fail because browser-originated HTTPS to external hosts is connection-blocked in this sandbox (documented in NORTH_STAR / CLAUDE.md), and these three are not fixture-routed for the resource they need. All three exercise the analytics-app / generated-page / smoke surface, none of which touches the planner bloom checkout code this spec changed:

- **test_smoke.js** — FAIL. home.html fetches live `https://yields.llama.fi/pools` (home.html:195) with no fixture route → `ERR_CONNECTION_RESET`, `.pool-card` never renders (15s timeout). 1/? assertions passed.
- **test_search.js** — FAIL / hangs. First 6/20 assertions pass, then the analytics search app stalls (protocol matching hits external `api.llama.fi`, connection-reset loop); does not finish even at 300s. 6/20 passed.
- **test_analytics_fires.js** — FAIL. `page.goto` on a generated `/tokens/<slug>` page times out at 15s (external CDN resources not routed). 0 passed.

## What a verifier should double-check

- `grep -c '\bctaElement\b' planner.js` → 0 (dead code gone). Acceptance criterion #2.
- `grep -c gp-cta-microcopy planner.min.js` → 1 and `grep -c gp-cta-row planner.min.js` → 0 (min bundle regenerated, not stale). test_compiled_assets.js enforces byte-identity.
- The three environmental failures above reproduce on a clean checkout (they depend on live external network, not on this diff). If the verifier's environment has external network, they may pass there; in this sandbox they cannot.
- The diff is confined to planner.js (2 edits), planner.min.js (regenerated), package.json (test-chain append), and the new test file. No translation-key, analytics, trust-rail, or CSS diffs.
