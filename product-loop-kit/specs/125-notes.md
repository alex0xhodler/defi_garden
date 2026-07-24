# 125 — build notes (deviations & conservative choices)

## Deviations from spec
- **`analytics.js` `trackPoolClick` adaptation (spec-authorized).** The third arg is named `context` (not `extraProps`) and did NOT previously spread into the emitted event — it cherry-picked only specific keys, so `ctaPlacement` would have been silently dropped. Added ONE additive line to the `track('pool_click', {...})` payload: `ctaPlacement: context.ctaPlacement || null`. The property now reaches the event under key `ctaPlacement` (values `'hero'` / `'repeat_footer'` / `null`). `source` unchanged, no rename, no event-name change — the north-star query (filters on `source`) is unaffected; `ctaPlacement` is a secondary breakdown only. The spec explicitly anticipated and authorized this.
- **`npm install` run** before compile/minify because dependencies were absent in the fresh checkout. No hand-editing of compiled files.

## Conservative choices
- Built the **repeat inline CTA only**, NOT the sticky mobile bar (the item's "and/or"). Reuses `.pool-action-card` + existing button classes with ZERO new CSS — no fixed-position/overlap/reduced-motion risk. Sticky bar deferred as a possible follow-up.
- Repeat block inherits `showConcreteCta = !isAnomalous`, so anomalous pools get the generic CTA in the repeat block too — no anomalous projection leaks (trust rail preserved).

## Test results (verbatim from build)
- `test_repeat_cta.js`: 5/5 passed
- `test_northstar_cta_fires.js`: 7/7 passed (no regression)
- `test_compiled_assets.js`: 4 assertions passed, exit 0
- `test_minified_assets.js`: 7 assertions passed + 2 PRE-EXISTING reds ("home.html does not load translations.min.js", "plan.html still loads raw planner.js") — confirmed pre-existing via `git stash` on the clean tree (same 2 reds), unrelated to this diff (they concern which asset variant the HTML `<script>` tags reference, untouched here). Documented in specs/117.1-notes.md as a known structural gap.

## Assets regenerated (byte-changed)
`PoolDetail.compiled.js`, `PoolDetail.compiled.min.js`, `translations.min.js` — via `npm run compile && npm run minify` (idempotent). Min output verified to contain 2× `repeat_footer`, 2× hero `ctaPlacement`, 2× `repeatCtaHeading`.
