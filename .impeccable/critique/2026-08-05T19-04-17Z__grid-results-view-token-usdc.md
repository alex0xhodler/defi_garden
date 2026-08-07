---
target: grid results view (/?token=USDC) - control band + rows
total_score: 18
max_score: 24
na_heuristics: 5,7,9,10
p0_count: 0
p1_count: 2
timestamp: 2026-08-05T19-04-17Z
slug: grid-results-view-token-usdc
---
⚠️ DEGRADED: single-context (no sub-agent/Task tool exposed in this session; ran Assessment A then Assessment B sequentially in this one context per critique.md's degraded fallback). Interactive "Ask the User" step also substituted: this session is a non-interactive coordinator-directed pass (see context.mjs's AUTONOMY_DIRECTIVE_CHECK) — priorities were inferred from the human's stated complaint ("a lot of styles, not a cohesive design feeling") rather than probed live.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Selected filters, active sort, and open dropdowns all have a visible state; minor: two different visual grammars signaled "active" before this pass (see #4). |
| 2 | Match Between System and Real World | 3 | Plain-language labels (Chains/TVL/Protocols/APY), sentence case, honest counts. |
| 3 | User Control and Freedom | 3 | Filters clear via the pill itself; sort/view toggle is one click; no forced flow. |
| 4 | Consistency and Standards | 2 → target 3 | **Primary finding.** Three shape/selection languages coexisted on one screen for "make a choice" controls: flat underline tabs, pill filter-chips (two blue intensities), and a 12px-radius segmented sort control. Controls of the same height class (tabs vs. filter pills) also rendered 11px apart. |
| 5 | Error Prevention | n/a | No destructive actions on this surface. |
| 6 | Recognition Rather Than Recall | 4 | Column headers sit directly above their column; icons + text label every filter. |
| 7 | Flexibility and Efficiency of Use | n/a | Data-browse surface, not a power-user editing tool; not applicable. |
| 8 | Aesthetic and Minimalist Design | 3 | Numbers-first table reads clean at rest; pre-pass, three control languages and mixed-precision numerals (fixed in round3a) were the noise. |
| 9 | Error Recovery | n/a | No error states on this read-only surface. |
| 10 | Help and Documentation | n/a | Self-evident data table; no help affordance needed or expected. |
| **Total** | | **18/24** (75%) | **Good** (applicable max 24; 5 heuristics n/a for this surface type) |

## Design Specificity Verdict

**LLM assessment**: The grid itself (post round3a) is well-authored for this product: tabular-nums, one composed panel, honest zero-yield handling. The control band ABOVE it (tabs + filter chips + search) was the generic part — every SaaS dashboard has "tabs, then filter chips, then a sort dropdown," and here the three pieces were visibly built by different passes: underline tabs (nav convention), pill chips with a two-tier blue system (filter convention), a rounded-rect segmented control (settings-panel convention). None is wrong in isolation; stacked on one screen with no shared height or shape rule, they read as three components from three different libraries rather than one system.

**Deterministic scan**: `detect.mjs --json` returned `[]` on both `app.js` and `home.html` — expected, not a clean bill of health: this app's DOM is entirely `React.createElement`-generated at runtime, so the static scanner (which reads markup in source files) has nothing to match against. No browser-injection detector pass was run this session (would require the live-server + injection flow); the findings below come from direct source/computed-style inspection instead, called out here as a substitution, not silently.

## Overall Impression

The table itself already reads calm and considered. The strip of controls sitting on top of it did not: three different corner-radius languages, two different blue intensities on one button, and an 11px height mismatch between two rows of controls sitting side by side. Closing those three gaps was the single highest-leverage fix available without touching the parts of the screen that already work.

## What's Working

- **The composed table** (round3a): one bordered panel, tabular-nums, honest 2dp precision, quiet action link. This is the part of the screen doing its job.
- **The already-selected filter chip** (solid blue fill): a legitimate, well-scoped exception to "no fill" — it's the one place on the page a user needs an unambiguous "this is engaged" signal, and it reads that way.
- **Sentence-case labels throughout**: no uppercase badge-speak anywhere in the control band.

## Priority Issues

**[P1] Three shape languages for "make a choice" controls on one screen**
- **Why it matters**: A user's eye has to re-learn "this means selected" three times in one glance (underline, filled pill, bordered rounded-rect) — this is the direct, nameable cause of "a lot of styles, not cohesive."
- **Fix**: Move the sort/view segmented control to the same pill radius as the filter chips (both are "choice" controls); leave the category tabs as the one deliberately different shape (navigation, not filtering) — two intentional languages instead of three accidental ones.
- **Status**: Fixed this pass (`.view-toggles`/`.sort-toggles`/`.sort-toggle-btn` → `--ui-radius-pill`).
- **Suggested command**: /impeccable layout

**[P1] Height mismatch between adjacent controls (29px tabs vs. 40px filter pills)**
- **Why it matters**: Measured, not eyeballed — an 11px gap between two rows of controls in the same horizontal band reads as misalignment, not as "two different components," even though `align-items: center` was already centering them.
- **Fix**: Bring `.app-nav-tab` to the same ~40px control band via padding, without adding a fill/border (keeps the tab's flat identity).
- **Status**: Fixed this pass (padding `--space-6`→`--space-10`, 29px→37px).
- **Suggested command**: /impeccable layout

**[P2] Blue at two intensities for two different meanings on one component**
- **Why it matters**: `.app-filter-btn` used a soft accent-tint fill for "this dropdown is currently open" AND a solid accent fill for "this filter has a value" — a user can't distinguish "open" from "engaged" by color alone, and it doubles the accent's footprint on screen for no added clarity.
- **Fix**: Reserve blue on this component for exactly one meaning (has a value); give "open" the same neutral border-strong step every other toggle on this screen already uses for transient/open state.
- **Status**: Fixed this pass.
- **Suggested command**: /impeccable colorize (in "reduce," not "add," direction)

**[P3] Icon-only view-toggle vs. plain-text action link — different chrome philosophies, same screen**
- **Why it matters**: Correct categorically (persistent control vs. per-row action should look different) but worth naming: nothing currently ties their interaction language together beyond "no glow."
- **Fix**: Not touched this pass — lower confidence this is what the human meant, and the two are legitimately different roles; flagging for a future pass rather than guessing at a change with no clear direction.
- **Suggested command**: /impeccable critique (re-run after the human sees this pass, to confirm whether this is still read as inconsistent)

## Persona Red Flags

**Alex (data-heavy power user)**: None new. Sort/filter state is one click, no keyboard shortcuts existed before or after this pass (out of scope).

**Sam (accessibility-dependent)**: The blue-intensity fix is a net accessibility win — removing a same-hue two-shade distinction that relied on subtle saturation differences most useful to users with typical color vision. Focus rings and hit targets were untouched (already passing per test_mobile_controls_reachable.js's 28/28).

## Minor Observations

- The vertical divider between the tabs and filter clusters (`.app-nav-divider`, fixed 20px) doesn't scale with the tabs' new 37px height — a follow-up could stretch it to match, but it reads as a thin visual separator either way and wasn't part of the "many styles" complaint.
- `.app-filter-btn`'s `has-selection` and the dropdown-internal `.filter-pill.active`/`.chain-pill.active` already shared one consistent solid-fill treatment before this pass — that part of the system was not broken and was left untouched.

## Questions to Consider

- Does the category-tabs row need to look this different from the filter-chips row, or would the whole band read more like "one toolbar" if tabs also became pills (a bigger, riskier change than this pass attempted)?
- Now that sort/view-toggle share the chip pill language, does the divider between "primary rail" (tabs) and "secondary cluster" (filters) still read as the right IA boundary, or does it need its own visual treatment to stay legible?
