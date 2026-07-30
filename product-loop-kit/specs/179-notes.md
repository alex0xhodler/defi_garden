# Item 179 — build notes

Status: in progress, written as the build proceeds (per instructions this file is the one
exception to "don't touch product-loop-kit/").

## What was built (summary — full detail below as sections fill in)

- **Leg A**: extended the 086 `html[data-app-mode="analytics"] .seo-hub-links { display: none }`
  dedup rule to also match `data-app-mode="landing"`, in both `style.css` (~line 2589) and the
  byte-identical inline critical-CSS copy in `home.html` (~line 148). Updated both comments that
  previously said "Planner mode has no fixed `.app-footer`" without accounting for landing mode
  duplicating the same links since the 2026-07-15 landing pivot.
- **Leg B**: added the same static `<footer class="seo-hub-links">` block (identical markup/class)
  to `plan.html`, outside `#planner-root`. Localized the two anchors after planner mount via a new
  `useEffect` in `Planner()` (`planner.js`), keyed on `lang`, using the EXISTING
  `footerBrowseTokens`/`footerBrowseChains` keys. No new translation keys added.
- Extended `test_footer_hub_links.js` with cases A1, A2, A5, A6, A7 (spec naming), kept every
  existing case (a, b, b2, c, d, e) passing and unmodified in meaning — only their header-comment
  documentation was updated to stop saying "/plan.html never carried this markup" (now false).
- Regenerated minified assets via `npm run minify` (`style.min.css`, `planner.min.js` changed;
  `app.compiled.min.js`/`PoolDetail.compiled.min.js`/`translations.min.js`/
  `planner-styles.min.css`/`pool-detail-styles.min.css` regenerated but byte-identical since their
  sources were untouched — confirmed via `git status --short` showing no diff for those files).

## Deviation from the spec (one, corrected before it shipped)

The spec said to localize the footer anchors "from the **existing** keys `footerBrowseTokens` /
`footerBrowseChains` (`translations.js:188-189` EN, `:910-911` KO)". My first implementation used
planner.js's existing `t()` helper (`makeT`), which only reads `tr[lang].planner[key]` (falling
back to `tr.en.planner[key]`). Reading the actual translations.js structure showed those two keys
live under `tr[lang].landing`, not `tr[lang].planner` — `t('footerBrowseTokens')` would have
silently key-echoed the string `"footerBrowseTokens"` instead of translating, in EN and KO both
(the KO failure would have been caught by A7 before shipping either way — this is recorded so the
mechanism of the near-miss is visible, not just the fact a test existed to catch it). Fixed by
reading `translations[lang].landing` directly in the new `useEffect`, with the same
graceful-degradation shape (`safeTranslations()`, `tr.en` fallback) `makeT`/`rootT` already use
elsewhere in the file — no new translation keys, no new i18n helper pattern introduced.

## Conservative choices

- Placed the new `useEffect` immediately after `t` is computed in `Planner()` (before the theme
  effect), grouping it with the other i18n-adjacent setup rather than mixing it into an unrelated
  block.
- Did not add a live in-app language-switch control (none exists in `planner.js` today — no
  `setLang` call anywhere in the file; `lang` is set once via `useState(detectLang())` and never
  mutated). The `useEffect`'s `[lang]` dependency array is what the spec asked for ("hook it where
  planner.js already handles language so both `?lang=ko` and a live language switch land") — it
  fires on mount for `?lang=ko` today, and would also fire automatically if a live switch is ever
  added later, without further changes.
- Left `home.html`'s own `.seo-hub-links` static footer completely alone (no localization added
  there) — it is superseded/hidden by the 086/179 CSS rule in every mode that renders it
  (analytics, landing), so localizing it would be dead code. `plan.html` is the only static file
  where the block is ever visible, matching the spec's Leg B scope exactly (no change to
  `landing.js`/`app.js`/`planner.js` render logic beyond the one new effect).

## Measurements

### Baseline (defect proven before any change), throwaway script at
`/tmp/claude-0/-home-user-defi-garden/ff1f1792-f722-5d00-af9a-a60393f2d3dc/scratchpad/baseline.js`,
driving real Chromium (`/opt/pw-browsers/chromium`) against bare `/` served the same way
`test_footer_hub_links.js` does (static file server + fixture-routed `yields.llama.fi/pools`):

| Measurement | Baseline (pre-fix) |
|---|---|
| `grep -c seo-hub-links plan.html` | 0 |
| `a[href="/tokens"]:visible` count on bare `/` | 2 |
| `a[href="/chains"]:visible` count on bare `/` | 2 |
| `.seo-hub-links` computed `display` on bare `/` | `flex` (not hidden) |
| `data-app-mode` on bare `/` | `landing` |
| Playwright click on the STATIC footer's `/tokens` anchor | **failed**: `locator.click: Timeout 3000ms exceeded` (occluded by the fixed `.app-footer`) |

### After (post-fix)

Same throwaway script, re-run against the fixed code (bare `/`):

| Measurement | Baseline (pre-fix) | After (post-fix) |
|---|---|---|
| `grep -c seo-hub-links plan.html` | 0 | 1 |
| `a[href="/tokens"]:visible` count on bare `/` | 2 | **1** |
| `a[href="/chains"]:visible` count on bare `/` | 2 | **1** |
| `.seo-hub-links` computed `display` on bare `/` | `flex` | **`none`** |
| `data-app-mode` on bare `/` | `landing` | `landing` (unchanged) |
| Playwright click on the STATIC footer's `/tokens` anchor | failed (occluded, `display:flex`) | failed (now `display:none` — superseded by design, same failure reason 086 already established for analytics mode) |

`/plan.html` (not separately scripted — covered by the A5/A6/A7 Playwright cases below, which are the
authoritative rendered-product proof per the spec): static footer now present in raw source, visible,
clickable, and localized to KO under `?lang=ko`.

## Mutation table (non-vacuity proof)

All three mutations applied one at a time; restored byte-identically after each, verified via
`md5sum -c` against a captured "good" checksum manifest (`home.html`, `plan.html`, `style.css`,
`planner.js`, `style.min.css`, `planner.min.js`, `test_footer_hub_links.js`) — all `OK` after each
restore.

| # | Mutation | Case(s) that reddened | Everything else |
|---|---|---|---|
| (i) | Reverted the landing selector in BOTH `style.css` and `home.html` (dropped `html[data-app-mode="landing"] .seo-hub-links`), re-ran `npm run minify` | **A1** ("bare / (landing): exactly one visible /tokens + /chains pair" — found 2) and **A2** ("bare / (landing): inline critical CSS hides static footer pre-swap" — got `block` instead of `none`) | 9/11 stayed green |
| (ii) | Deleted the `plan.html` footer block | **A6** (fs-level, "plan.html raw source contains both static hub anchors" — missing anchor) and **A5** ("/plan.html: static hub links visible + clickable" — `waitForFunction` timeout since `.seo-hub-links` no longer exists). A7 also reddened as an expected side effect (its target element doesn't exist either) — not a case the spec required to redden for this mutation, but consistent with it. | 8/11 stayed green |
| (iii) | Broke the KO localization (`landingDict` lookup forced to always read `tr.en.landing`, ignoring `lang`) | **A7 only** ("/plan.html?lang=ko: static hub links localized to KO after mount" — got `"Browse tokens"` instead of `토큰 둘러보기`) | 10/11 stayed green, including A5 (still visible/clickable — content-only mutation) |

Each mutation reddened exactly the case(s) it should have and nothing else — the assertions are not
vacuous.

## Test commands run

1. `node test_footer_hub_links.js` (baseline pre-fix, via a throwaway copy of the file's own server
   pattern) — see baseline table above.
2. `npm run minify` — regenerated `style.min.css`, `planner.min.js` (both changed); also touched
   `app.compiled.min.js`, `PoolDetail.compiled.min.js`, `translations.min.js`,
   `planner-styles.min.css`, `pool-detail-styles.min.css` but those came out byte-identical (their
   sources were untouched) — confirmed via `git status --short` showing no diff for them.
3. `node test_footer_hub_links.js` (post-fix, full file including new A1/A2/A5/A6/A7 cases) —
   **11/11 passed** (`11 footer-hub-link assertions passed`), run 3× total across the fix iteration
   (once catching the `t()`-vs-`.landing` namespace bug, once after the source fix, once as the
   final re-confirmation after all three mutations were restored).
4. 3× mutation run/restore cycles (table above), each via `node test_footer_hub_links.js` after the
   mutation, then `md5sum -c` after restore (mutation i also re-ran `npm run minify` before and
   after, since it touches minified CSS/JS the page actually loads).
5. `node run-tests.js --lane=plain` — **PASS 38 / FAIL 0 / TIMEOUT 0 / TOTAL 38**.
6. `node run-tests.js --only=test_footer_hub_links.js,test_landing.js,test_smoke.js,test_css_minified_render.js,test_minified_assets.js,test_min_asset_boot.js`
   — **PASS 6 / FAIL 0 / TIMEOUT 0 / TOTAL 6** (test_css_minified_render.js 3.59s, test_minified_assets.js
   4.42s, test_landing.js 40.45s, test_min_asset_boot.js 68.10s, test_smoke.js 135.50s,
   test_footer_hub_links.js 132.53s).
7. `git diff origin/main --stat` — confirmed only the 7 intended files changed (A8): `home.html`,
   `plan.html`, `planner.js`, `planner.min.js`, `style.css`, `style.min.css`,
   `test_footer_hub_links.js`. None of `app.js`, `planner-styles.css`, `landing.js`, any
   `generate-*.js`, `tokens/`, `chains/`, `ko/`, `sitemap*.xml`, `llms*.txt`, `package.json` appear
   in the diff. `git diff origin/main -- planner.js` inspected directly: the only change is the new
   14-line `useEffect` block; no trust-rail code (`APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, etc., which
   don't live in `planner.js`'s changed region at all) was touched.

No single foreground command exceeded the 5-minute timebox; the two commands that ran close to it
(`node test_footer_hub_links.js` standalone runs, ~130s each) were run via `run_in_background` and
awaited via notification rather than a blocking foreground call, per the "never wait unbounded,
but do time-box" guidance — none were killed or truncated.

## Anything not verified

- The full 60+-file browser lane was NOT run (out of scope per the timebox instructions — explicitly
  told not to attempt it). Only the 6 files named in the task instructions were run as the targeted
  browser-lane gate.
- No visual/screenshot review was done (not requested by the spec's acceptance criteria, which are
  all Playwright-assertion-based); the rendered-behavior proof is the 11 Playwright cases in
  `test_footer_hub_links.js`, which is the same evidentiary bar the spec's own precedent (086, 131)
  used.
- PSI/Lighthouse was not re-run — no perceptible new render-blocking cost was added (Leg A is a
  handful of extra bytes on an already-inline critical-CSS rule; Leg B adds one static `<footer>` to
  `plan.html`, no new blocking resource).
- `APY_SANITY_LIMIT` / `DEFAULT_MIN_TVL` byte-identity: verified —
  `git diff origin/main -- planner.js app.js planner-styles.css | grep -c "APY_SANITY_LIMIT\|DEFAULT_MIN_TVL"`
  = 0.
