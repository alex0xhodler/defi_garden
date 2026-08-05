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
| E | `CLAUDE.md`, `225-screenshots/` | verifier-FAIL remediation: the spec-required CLAUDE.md design-section rewrite (dropped in attempt 1) + a corrected, assertion-backed screenshot set |

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
- Rendered verification: 24-shot matrix (4 surfaces × 3 widths × 2 themes), **0 page errors and 0
  capture failures** — this is the CORRECTED set; the first one was broken for 12 of 24 images (see
  "Verifier attempt 1" above and `225-screenshots/README.md`).

## Verifier attempt 1 → FAIL → two fixes (both findings were correct)

The verifier failed this branch on its first pass. Both findings stand; neither was disputed.

**Finding 1 — a required deliverable was silently dropped.** `specs/225.md` §Change says the CLAUDE.md
design section is REWRITTEN in the same commit (the "keep it neumorphic" mandate is overridden by the
2026-08-04 standing decision). The first commit did not touch CLAUDE.md at all, and the omission appeared
in none of the four logged deviations — so the repo's own `IMPORTANT … MUST follow exactly as written`
instruction file still mandated the skin this item had just removed. **Fixed:** CLAUDE.md's design
section is rewritten around the `--ui-*` system, the one-shadow rule, the one-of-each rule, the
filter-chip exception, the new press physics, and an explicit "never use a `--neuro-*` name in a new
rule" line pointing at the alias layer.

**Finding 2 — the human review artifact was broken for 2 of 4 surfaces.** In the first `after/` set,
all six `grid-*` images showed `"Loading live pools…" / 0 results` and all six `pool-*` images showed the
LANDING page — 12 of 24 images did not depict the surface they were labelled as, while the notes claimed
an unqualified "24-shot matrix … 0 page errors". A human approving off that set could not have evaluated
the grid or pool-detail redesign at all, which is the entire safety mechanism for this HIGH-risk item.
**That claim was wrong as written and is corrected here.** Two independent causes, both now fixed and
written up in `225-screenshots/README.md`:
- the capture script asserted nothing (fixed 2.5s wait → any state got screenshotted). It now waits on a
  per-surface content selector, counts grid cards, and records a hard capture failure rather than
  shipping an image it cannot vouch for;
- `SNAPSHOT_MAX_AGE_MS` is 6h and the committed snapshot's `generatedAt` was `16:23Z`, so every capture
  after ~22:23Z fell through to the network-blocked live endpoint. Earlier captures the same session
  rendered fine, which is precisely why the breakage was invisible without an assertion. The capture now
  routes the committed snapshot the way the repo's tests do.

The replacement set is 24/24 with **0 page errors and 0 capture failures**, and `capture-shots.js` is
committed so the artifact can be regenerated and audited rather than trusted.

## Verifier attempt 2 → FAIL → a real accessibility fix (the doc was right, the CSS was wrong)

Attempt 2 confirmed the screenshot set fully remediated (all 24 images independently inspected) but failed
the branch again on TWO inaccuracies in the CLAUDE.md rewrite itself — the deliverable that had just fixed
attempt 1's Finding 1. Both were true, and the second was not a doc problem at all:

1. **"Exactly ONE shadow token exists"** was false as shipped. A legacy teal `--focus-ring` token
   (`style.css:77`) is still live on `.btn`, `.seo-hub-links a`, `.reset-filters-btn`, `.filter-pill`
   `:focus-visible` in parallel with the new `--ui-focus-ring`, and literal inset shadows drive the
   scroll-edge fade inside the filter dropdowns. **Fixed by scoping the claim honestly** (one ELEVATION
   token; focus rings and scroll-affordance fades are outside it) and by recording the split focus-token
   families as named debt in both CLAUDE.md and the design spec. Not migrated in this item: focus is a
   trust rail and a four-call-site token migration is its own change, not a doc fix.
2. **"no transform under reduced motion" was a REAL ACCESSIBILITY DEFECT**, not an overstatement. The
   only reduced-motion carve-out in `style.css` covered the selected-chip re-press; the base press rule
   (`.app-nav-tab/.app-filter-btn/.view-toggle-btn/.theme-toggle/.language-toggle/.pagination-btn/`
   `.filter-pill/.filter-chip:active`) had none, so the 1px sink still animated for reduced-motion users
   on the shared header and the whole analytics grid. `pool-detail-styles.css` and `planner-styles.css`
   already did this correctly — `style.css` was the gap. **Fixed in the CSS, not the doc**: a
   `prefers-reduced-motion: reduce` block now neutralises the transform for the base rule's full selector
   list PLUS four controls with their own local `:active` transform that the base list never covered
   (`.pool-card`, `.reset-filters-btn`, `.modal-close`, `.detail-header-btn`). The press stays
   perceivable — the background swap is untouched.

Proven with both controls, in a real browser (`reducedMotion: 'reduce'` vs `'no-preference'` contexts,
actual `mouse.down()` presses, committed-snapshot routing):
- positive control (no preference): `.app-nav-tab`, `.theme-toggle`, `.language-toggle`,
  `.app-control-btn`, `.filter-pill` → `matrix(1,0,0,1,0,1)`; `.reset-filters-btn` → `…,0.9248`;
  `.detail-header-btn` → `…,0.9971`; `.modal-close` → `matrix(0.95,0,0,0.95,0,0)`;
- reduced motion: every one of those → `none`.
`test_minified_assets.js`, `test_filter_dropdown_polish.js`, `test_nav_rail_ia.js` all PASS afterwards.

Cosmetic residue left alone deliberately: the base press rule carries the same `transform: translateY(1px)`
twice (once `!important`, once not) from the leg-A pass. Identical values, so there is no cascade ambiguity
— unlike the attempt-1 filter-chip case where a soft value silently overrode a filled one. Noted, not
touched, because hand-editing shipped CSS to tidy a no-op is a worse trade than leaving it.

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
