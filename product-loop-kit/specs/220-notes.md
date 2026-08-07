# 220 — build notes

## Files changed, one line each

- `landing-styles.css` — added `.landing-app .app-footer { position: static; margin-top: auto; }` directly below `.landing-app`'s own block (line 4-11), with a ~35-line comment (same style as 217/218's blocks in `pool-detail-styles.css`) citing item 220, item 179's lineage, the measured before-numbers, and why clearance alone is insufficient. 44 lines added, 0 removed (`git diff --numstat`: `44 0 landing-styles.css`).
- `package.json` — inserted `node test_landing_footer_occlusion.js` into `test:serial` immediately after `node test_cta_at_rest_occlusion.js` (its sibling occlusion test) and before `node test_kpi_rail_history.js`. 1 line changed.
- `test_landing_footer_occlusion.js` — new file, 430 lines. Backlog 220's gate: at-rest + true-bottom-of-scroll occlusion + hit-tests at 360×780/768×780/1280×780/768×780-dark, footer-presence/hub-link checks, one positive control, page-error-clean.
- No other product files touched. `style.css`, `pool-detail-styles.css`, the `html[data-app-mode="landing"] .seo-hub-links` rule, and `home.html` all have zero diff (confirmed via `git status --short` after the final run — only the three files above plus this notes file are non-`origin/main`).

## Deliverable 2 (minified twin) — N/A, verified rather than assumed

Spec's own Territory Notes flagged this as a thing to check, not to assume.
Read `home.html:160-169`: the mode-conditional CSS injector does
`else { addCSS('landing-styles.css', true); }` for landing mode — the RAW
sheet, loaded synchronously (`blocking=true`), not `landing-styles.min.css`.
Read `minify-assets.js:21`: `CSS_FILES = ['style.css', 'planner-styles.css',
'pool-detail-styles.css']` — `landing-styles.css` is not in that list, and
`ls landing-styles*` on disk shows no `.min` twin exists. So `npm run
minify` was **not** run — there is nothing for it to regenerate, and running
it would have been a no-op on this file (it isn't a minify input). Confirmed
by both `node test_minified_assets.js` and `node test_css_minified_render.js`
staying green with zero mention of landing-styles.css (neither test's
assertion list references it, by design — it was never one of the assets
those tests police, which is consistent with it having no `.min` twin at
all).

## Deviation from the 218 pattern (documented, not a mistake)

218's fix needed a companion `.app.pool-detail-view { padding-bottom: 0; }`
because 217 had already restored `.app`'s 80px clearance on that view; once
218 put the footer back in flow, that 80px became dead space the footer no
longer needed protection from, so it had to be cancelled back to 0. The
landing route never had this problem: `grep -n "\.landing-app" style.css`
returns zero matches (spec's own root-cause paragraph) and grep-verified
again this run — `.landing-app` never carried a `padding-bottom` anywhere,
in `style.css` or `landing-styles.css`, before this fix. So there is no
vestigial padding to cancel on this view; the two-line `position: static;
margin-top: auto;` pair is the complete fix. Recorded here because a
verifier comparing byte-for-byte against 218's shape would otherwise read
the missing `padding-bottom: 0` line as an omission — it is a correct
absence, not a mistake.

## BEFORE measurement (unmodified origin/main @ d7c9b79729, 768x780, real render)

Ran a throwaway Playwright script (`_scratch_before_measure.js`, deleted
after use — not part of the deliverable, not committed) against the
UNMODIFIED landing route before making any edit. Real numbers:

**At rest (`scrollY = 0`):**
```
footerRect:  {x:0,   y:722,   width:768, height:58}
victim ("Live DefiLlama data"):
             {x:449.7, y:760.5, width:110.9, height:18}
hit test at victim's lower band -> <footer class="app-footer">
resolvedToFooter: true
lastTrustSection descendant: {x:609.4, y:810.5, width:120.6, height:18}
```

**True bottom of scroll** (confirmed reached: `scrollTop 100 + innerHeight
780 = 880 = scrollHeight`):
```
footerRect:  {x:0,  y:722, width:768, height:58}
hero-body paragraph ("Clear entry points, honest numbers, ..."):
             {x:24, y:704, width:254.3, height:36}
hit test at paragraph's lower band -> <footer class="app-footer">
resolvedToFooter: true
```

Both blocks match spec 220's quoted findings **exactly** (same rects, same
hit-test outcome), proving the defect is real and reproducible on this
checkout, not just asserted from the spec text.

## AFTER measurement (fix applied, same script, same viewport)

```
At rest:      footer.getComputedStyle().position === "static"
              footerRect: {x:0, y:880, width:768, height:58}  (below the
                780px viewport — the footer moved to the true end of the
                in-flow document, out of the fixed layer)
              victim rect UNCHANGED: {x:449.7, y:760.5, w:110.9, h:18}
              hit test at victim's lower band -> <span> (not the footer)
              resolvedToFooter: false

Bottom of scroll (reached: scrollTop 158, innerHeight 780,
  scrollHeight 938 — the document grew by ~58px, the footer's own height,
  because it now occupies real document flow instead of overlaying it):
              footerRect: {x:0, y:722, width:768, height:58}
              hero-body paragraph rect: {x:24, y:646, width:254.3, h:36}
                (moved up 58px vs BEFORE, no longer under the footer)
              hit test at paragraph's lower band -> <p> (not the footer)
              resolvedToFooter: false
              hub links: /tokens hitsSelf=true, /chains hitsSelf=true
```

## Non-vacuity proof (mutate-away cycle, recorded live)

1. Ran `node test_landing_footer_occlusion.js` against the fix as shipped:
   **21/21 passed.**
2. Edited `landing-styles.css` in place, replacing the fix's two
   declarations with an empty rule body (`.landing-app .app-footer {
   /* MUTATED-AWAY ... */ }`) — i.e. no `position`/`margin-top` at all, so
   the footer falls back to `style.css`'s own `.app-footer { position:
   fixed; bottom: 0; ... }`, exactly the pre-fix defect.
3. Re-ran `node test_landing_footer_occlusion.js`: **15/21 passed, 6
   failed** — the RED failures were exactly the expected ones:
   - `(1-4) 768x780 AT REST` — victim rect intersects footer at
     `{x:449.7,y:760.5}` vs footer `{y:722}` (same numbers as the BEFORE
     measurement, confirming the mutation reproduced the real defect, not a
     synthetic one).
   - `(1-4) 1280x780 AT REST`, `(1-4) 768x780 dark AT REST` — same failure
     mode at their own viewports.
   - `(5-8) 360x780`, `(5-8) 768x780`, `(5-8) 768x780 dark` TRUE BOTTOM OF
     SCROLL — the last `.landing-trust-section` descendant intersecting the
     footer.
   - The four `(13-16)` footer-presence checks and the `(17)` positive
     control still passed even under the mutation (expected — those don't
     test this fix's mechanism, and the footer stays visible/hit-testable
     whether it's fixed or static).
4. Restored `landing-styles.css` to the shipped fix (`Edit` reverting the
   mutation back to `position: static; margin-top: auto;`).
5. Confirmed `git diff landing-styles.css` shows only the intended 44-line
   addition (no leftover mutation artifact) — verified via `git diff
   --stat`: `44 insertions(+), 0 deletions`.
6. Re-ran `node test_landing_footer_occlusion.js`: **21/21 passed** again.

This proves the new test is not vacuous — it goes red on exactly the defect
it exists to catch, and green once the real fix is restored.

## Commands run, with real exit codes / tails

| command | result |
|---|---|
| `node test_landing_footer_occlusion.js` (fix applied) | `21/21 tests passed`, exit 0 |
| `node test_landing_footer_occlusion.js` (fix mutated away) | `15/21 tests passed`, exit 1 (expected RED) |
| `node test_landing_footer_occlusion.js` (fix restored) | `21/21 tests passed`, exit 0 |
| `node test_test_registry.js` | `5/5 assertions passed`, exit 0 |
| `node run-tests.js --list --lane=browser \| grep landing_footer_occlusion` | `test_landing_footer_occlusion.js	browser` — confirms correct lane classification (the file requires `playwright`) |
| `node -e "require('./audit-app.js').runAudit({ only: ['landing-768','landing-360'], port: 8997, outPath: <tmp> })"` | `surfacesCovered: ["landing-360","landing-768"]`, `total findings: 0`, `OCCLUSION_COUNT=0`, exit 0. Live network to `yields.llama.fi` reached fine (node-originated HTTPS, not browser-originated — matches the brief's expectation), pools source logged as a live/cached fetch (15700 pools). |
| `node test_landing.js` | `5 landing assertions passed`, exit 0 |
| `node test_landing_return.js` | `5 landing-return assertions passed`, exit 0 |
| `node test_ko_landing_footer.js` | `2 assertions passed`, exit 0 |
| `node test_footer_hub_links.js` | `11 footer-hub-link assertions passed`, exit 0 |
| `node test_footer_occlusion.js` | `test_footer_occlusion.js: 8/8 tests passed`, exit 0 |
| `node test_cta_at_rest_occlusion.js` | `test_cta_at_rest_occlusion.js: 12/12 tests passed`, exit 0 |
| `node test_audit_occlusion_lens.js` | `24 passed, 0 failed`, exit 0 |
| `node test_minified_assets.js` | `9 minified-asset assertions passed`, exit 0 |
| `node test_css_minified_render.js` | `2 css-minified-render assertions passed`, exit 0 |

No command exceeded the 5-minute foreground timebox; the longest
(`runAudit`'s two-surface integration call, which does a live pools fetch)
completed in well under a minute.

## Side effect caught and reverted

My first `runAudit(...)` invocation for acceptance criterion 7 omitted
`outPath`, so it wrote to the default `product-loop-kit/signals/audit-
findings.json` (a tracked file, unrelated to this ticket's scope) and left
it modified (`generatedAt` timestamp + a narrower `surfacesCovered` list,
since `opts.only` scoped that run to two surfaces). Caught via `git status`
before finishing, reverted with `git checkout -- product-loop-kit/signals/
audit-findings.json`, and re-ran the same audit call with an explicit
`outPath` under `os.tmpdir()` so it can't happen again. Confirmed via
`git status --short` immediately after that only `landing-styles.css`,
`package.json`, and the new test file are non-`origin/main`.

## What I did NOT verify

- Behavior at viewport widths outside CLAUDE.md's design bar (e.g. 390x844,
  414x896) — not required by the acceptance criteria, not measured.
- KO-localized render of the "Live DefiLlama data" trust text — acceptance
  criterion 1 explicitly says the KO twin is not required, EN render is
  enough; I did not additionally check it.
- `runAudit`'s full default rotation (every surface, not just
  `landing-768`/`landing-360`) — out of scope per the brief ("plus
  `landing-360` if cheap"); I ran both scoped to just those two names, which
  is what the brief asked for, not a full run.
- Whether any OTHER route in the codebase besides landing/pool-detail
  (already fixed by 217/218) still has this defect class — the playbook's
  "fixed on one route only" trap says to grep every other route before
  closing, but the spec's own "Explicitly OUT of scope" section restricts
  this ticket to the landing route only, so I did not extend the audit or
  grep beyond what 220 itself covers.
