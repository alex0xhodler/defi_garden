# 225 — build notes (deviations, conservative choices, and what the human must look at)

Branch `claude/loop-225`. Built 2026-08-04 by one operator session + four dispatched Sonnet 5 coding
agents (per the 2026-07-10/07-12 execution-model split: the operator plans, verifies and judges; agents
write the product code).

## What shipped

The written design spec is `specs/225-design-system.md` ("Quiet"): flat surfaces, 1px hairline borders,
ONE shadow token reserved for floating layers, one header / card / control / chip / input across every
surface, a real dark ramp, press physics via `translateY(1px)`.

| Leg | Files | Result |
|---|---|---|
| A | `style.css`, `app.js`, 4 test files | token layer installed; ~280 neuro usages converted; `.google-*` era renamed to `.app-*`; 4 dead rule sets + orphaned `slideDown` keyframes deleted |
| B | `planner-styles.css`, `landing-styles.css` | 239 + 19 usages converted; the planner's preset grid is now one chip component |
| C | `pool-detail-styles.css`, `PoolDetail.js`, `stories/stories.css` | 74 + 60 + 23 usages converted; the two north-star CTAs are now the spec's primary/secondary buttons |
| D | `style.css` (fix) | restored filled-primary selected state on the filter-chip family after it regressed `test_filter_dropdown_polish.js` |

Build artifacts regenerated in the same commit: `node compile-app.js && node minify-assets.js`.

## Deviation 1 — `--neuro-*` names survive as deprecated aliases (deliberate, spec-permitted)

225 acceptance #1 permits kept token definitions. We kept them and pointed them at the flat system
because the blindspot pass found they are a **published contract**, not just a skin: ~4,281 generated
static pages bake `var(--neuro-shadow-raised)` etc. into inline `<style>` blocks, and 7 assertions across
`test_chain_pages.js` / `test_token_pages.js` / `test_hub_pages.js` assert those literal strings appear in
generator output. Aliasing means the whole SEO estate inherits the reset with zero generator churn and
zero test churn. **Skin USAGES in the four hand-written stylesheets are at zero** — the acceptance
criterion's actual target.

Cost, stated plainly: the old names are still spellable. Nothing prevents a future rule from using one.
A follow-up ticket should add a cheap grep gate ("no `--neuro-` outside the alias block") — this item did
not build one, so **the class is open**: 6 files were converted by hand-audited passes; the next file that
reintroduces a neuro token will not be caught by anything.

## Deviation 2 — the sticky analytics header is flat at rest AND when scrolled

Design spec §3 says a sticky header gains `--ui-shadow-overlay` after scroll. No "scrolled" state class
exists on that header today, and adding one means touching `app.js` state/handlers — outside the
className-only scope this item allowed for `app.js`. Conservative choice: always flat. Visually fine;
noted so the reviewer knows it is a knowing gap, not an oversight.

## Deviation 3 — planner/landing headers are content-width, not edge-to-edge

`.gp-header` and `.landing-header` are 760px/1200px centred content boxes. They got the specified
surface + hairline bottom border, but they do not span the viewport edge because there is no wrapping
element to paint full-bleed without a `planner.js` / `landing.js` markup change. **This is the most
visible cosmetic inconsistency in the screenshot set** (planner at 1280 shows a white header box that
stops short of both edges). If the human wants a true app bar, it is a small markup change in a
follow-up item.

## Deviation 4 — the filter family keeps a filled-primary selected state

The uniform accent-soft selected treatment regressed `test_filter_dropdown_polish.js` B2, which asserts a
selected filter chip is "filled-primary (white text, distinct non-transparent bg)" — a deliberate product
decision from spec 111. Correct call is the older decision: inside a dropdown, accent-soft reads as
unselected. Filter chips now use the primary fill; every other chip family stays accent-soft. Recorded in
the design spec §3 so the exception is a rule, not a leftover.

## Two PRE-EXISTING test failures (not caused by this item — verified A/B)

`test_kpi_rail_history.js` and `test_pool_twin_parity.js` fail on this branch **and on the branch's parent
commit `979af4f2a1` (main's tip)**, run in a clean worktree with identical `data/` (md5-matched
snapshots). `test_filter_dropdown_polish.js` was the only true regression, and it is fixed.

Method note worth keeping: the first baseline run compared against a **stale** `origin/main` — this clone
is shallow (`.git/shallow`), and the local `origin/main` ref lagged the real tip by 2 commits, with
different committed `data/`. That produced a false "regression" reading on `test_kpi_rail_history.js`.
`git fetch --depth=50 origin main` first, then `git merge-base --is-ancestor <parent> origin/main` to
prove the baseline is the right one. Do this before ever calling a failure a regression in this repo.

## Numbers (population-scoped, per RAZOR)

- `--neuro-*` skin usages in hand-written stylesheets: **655 → 0** (style.css 340→13 alias defs,
  planner 239→0, pool-detail 74→0, landing 19→0, stories 23→0, PoolDetail.js 60→0).
- `google-*` occurrences: **109 → 0** (app.js 30→0, style.css 79→0).
- Surfaces re-skinned: 4 React surfaces (landing, planner, analytics grid, pool-detail) + the stories
  template. **~4,281 generated static pages inherit the reset via the alias layer and were NOT
  individually verified** — they regenerate on the next `sitemap-update.yml` CI run; a sampled static
  surface is covered by `test_seo_surface_audit.js` (PASS).
- Rendered verification: 24-shot matrix (4 surfaces × 3 widths × 2 themes), **0 page errors**.

## Non-vacuity proof — and a finding the proof itself produced

225 acceptance #5 asks for the occlusion + control-pressability gates proven red on a deliberately
broken render, then restored, then green. Run in this session, `style.css` backed up and restored
**byte-identically** (`md5sum` `2a6dbf9e25fd1fc7a0e4fa36d05e001a` before AND after, both probes):

| Probe (deliberate break) | Gate | Result |
|---|---|---|
| P2: `.app-footer { top:0; height:100vh; opaque }` | `test_mobile_controls_reachable.js` | **RED ✓ (gate works)** |
| P3: `.app{padding-bottom:0}` + `.pool-detail-container{padding-bottom:0;margin-bottom:0}` | `test_dead_pool.js` | **RED ✓ (gate works)** |
| P4: `.app-footer { height: 340px }` — bottom-anchored, opaque, **44%** of the 780px viewport | `test_audit_app.js`, `test_audit_occlusion_lens.js`, `test_footer_occlusion.js`, `test_cta_at_rest_occlusion.js` | **all four green** |
| Restore (md5 `2a6dbf9e25fd1fc7a0e4fa36d05e001a`, before AND after) | all of the above | **green ✓** |

**Two gates proven non-vacuous this session**: `test_mobile_controls_reachable.js` (control
pressability) and `test_dead_pool.js` (footer clearance rail) — plus `test_filter_dropdown_polish.js`,
which went red on a REAL regression this item introduced and green after the fix (the strongest form of
the proof: an unplanned red).

**Retracted before it was filed:** the first draft of these notes claimed the occlusion family was
"blind to a viewport-covering overlay", from probe P2. That claim is WRONG and was withdrawn on reading
`playbooks/fixed-overlay-occlusion.md` step 0, which already documents exactly two lens blind spots —
overlays covering ≥80% of the viewport, and top-anchored overlays at bottom-of-scroll. P2 was both. A
green there is documented behaviour, not a defect.

**What DOES survive, measured, in-class:** probe P4 is bottom-anchored, opaque, and 44% of the viewport
— outside both documented blind spots and the same geometry as the 179→…→230 chain. An independent
measurement (not using any repo gate: own Playwright script, `?pool=` at 1280×780, scrolled to bottom)
found a genuine P0-shaped victim under it — an interactive `<a class="planner-entry">`, **82% covered**,
with `document.elementFromPoint` at its lower band returning the footer, i.e. the click is stolen, which
is the lens's own P0 definition. All four occlusion gates stayed green on that break.

Residual uncertainty, stated rather than papered over: the audit harness renders its own snapshot
fixture and surface list, so it is possible (not established) that its `pool-detail` render does not
contain that victim element at all, in which case the green is honest and the gap is in surface
coverage rather than in the lens. **Settling which of the two it is belongs to backlog item 231**, and
that is the question its acceptance should answer — not only the 3/20 detection RATE it was filed for.
Evidence and repro CSS are in `playbooks/fixed-overlay-occlusion.md`.

This item does NOT fix that — one item per run — and it does not claim occlusion coverage it cannot
demonstrate. Recorded in `playbooks/fixed-overlay-occlusion.md`.

## Known cosmetic issues visible in the screenshot set (all pre-existing, verified against before-shots)

- Analytics grid at 360px clips the APY chip and `$/day` pill off the right edge — **identical in the
  before screenshots**; that is item 221's grid-360 territory, still quarantined in `test_audit_app.js`.
- Pool-card protocol logos render as empty squares in-sandbox (`icons.llamao.fi` blocked) — an offline
  artifact, not a design change.
- The analytics search submit is still a small round accent button rather than the spec's plain primary
  button. Cosmetic; not worth a `app.js` markup change inside this item.
