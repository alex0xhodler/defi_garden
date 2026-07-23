# 124 — build notes

## What was built
Swapped the pool-detail "Start Earning on <protocol> ↗" affordance from the muted
text-link class `pool-action-protocol-link` to the **already-existing but orphaned**
neuro secondary-button class `cta-button-protocol`. No new CSS authored (build.md §1b
reuse rule): `.cta-button-protocol` was defined in `pool-detail-styles.css` with zero
render-code usages — the intended secondary-CTA style, wired up now.

## Files
- `PoolDetail.js` — one className change on the protocol `<button>` (`pool-action-protocol-link` → `cta-button-protocol`). onClick (tracking + `window.open(..,noopener,noreferrer)`), the label, the ` ↗` glyph, and the "Opens protocol • Wallet required" sublabel all unchanged.
- `pool-detail-styles.css` — removed the two now-dead `.pool-action-protocol-link` rules (grep-confirmed no other usage). `.cta-button-protocol` (bg `--color-surface`, `--neuro-shadow-raised`, `--neuro-radius-lg`, press physics + hover already present) left intact.
- `PoolDetail.compiled.js`, `PoolDetail.compiled.min.js`, `pool-detail-styles.min.css` — regenerated via `node compile-app.js` + `node minify-assets.js` (runtime loads the compiled+minified assets; source-only edits would not take effect — this is a real compile step, superseding CLAUDE.md's stale "no build step" line for the analytics app, per backlog 052/053).
- `test_northstar_cta_fires.js` — updated the Playwright selector from `.pool-action-protocol-link` to `.cta-button-protocol` (the render test that gates this CTA).

## Deviations from spec
None material. Spec offered the option to leave the dead `.pool-action-protocol-link` CSS; removed it instead (trivially safe, keeps CSS tidy — the spec's preferred branch).

## Verification
- `test_northstar_cta_fires.js` (rendered Playwright, real UI, both entry paths) → 7/7 PASS with the new selector: the protocol CTA renders as a `cta-button-protocol` button, is visible, and clicking it fires `pool_click{source=protocol_link}` with no navigation.
- `test_compiled_assets.js` PASS (compiled output re-derivable from source, home.html loads minified, PoolDetail before app).
- `test_minified_assets.js` — the 7 byte-identity assertions PASS; its 2 pre-existing failures (`home.html` not loading `translations.min.js`; `plan.html` loading raw `planner.js`) reproduce identically on `main` (verified by stash + `git checkout main -- test_minified_assets.js`) → NOT caused by this diff.

## Fixture limitation (recorded, not a defect)
A throwaway screenshot/computed-style probe showed the `:root` design tokens
(`--color-primary`, `--neuro-shadow-*`, `--color-surface`, `--font-size-*`) are NOT
applied in the `test_northstar_cta_fires` fixture render — the **primary** button also
computes `background: transparent; box-shadow: none` there, proving the token layer is
absent fixture-wide (pre-existing, orthogonal to this change), so the fixture can't be
used to eyeball button chrome. Block-level button geometry IS applied (padding 11×24 on
the secondary vs the old 4px text-link padding), and production applies the tokens
(human's own backlog-124 screenshot shows the filled-blue primary + neuro cards
rendering), so the two-tier hierarchy holds in prod: filled-`--color-primary` primary
vs raised-`--color-surface` secondary. Probe scripts removed (not committed).
