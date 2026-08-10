# 238 — implementation notes (build loop, 2026-08-10, branch `claude/loop-238`)

## The headline: this spec was written against a tree that no longer exists

Spec 238 measured `claude/loop-225` on 2026-08-05. Between then and pickup, item **247's design world**
shipped to main across three human-merged PRs — #409 `514b4ba236`, #412 `6c33899fee`, #413 `60278d4d47`
(all 2026-08-07) — under the human directive *"ONLY SOTA GRADE WORK given the ICP"*. The BACKLOG row's
"247 sequencing caveat" turned out to be the whole story, so the first act of this build was to
**re-measure every number in the spec on main** and write the result into the spec as Territory notes
before touching code.

What re-measurement found, leg by leg:

| Spec's claim (on the 225 tree) | Measured on main at pickup |
|---|---|
| 4 hardcoded `'SF Mono',…` stacks | **0** — `grep -c "SF Mono" style.css` → 0. Criterion 1 passed *vacuously*. |
| — | 3 *other* hardcoded stacks survived (bare `monospace` ×2, one dead fallback) — fixed here |
| 11 `text-transform: uppercase` rules, all terminal-skin residue | **24** rules, and blame shows 247 **authored** many of them |
| `.logo:hover` scale-pop | still present — plus 2 more instances of the same banned class |

## Deviation 1 (the significant one): the uppercase half was NOT built as specced

The spec's hypothesis was that uppercase labels are terminal-skin residue the Quiet reset failed to
clear, and its criterion said to *remove* them. `git blame` falsifies that on main:

- `pool-detail-styles.css:654` `.pool-action-apy-label` ← #412 (`514b4ba2368`)
- `planner-styles.css:1929/1934` `.gp-goal-cat-label` / `.gp-sub-ladder-title` ← #413 (`60278d4d47a`)
- one of those rules carries the repo's own comment: *"Plate-label voice — pool-detail's serif
  micro-caps recipe."*

Uppercase-with-wide-tracking on `--font-family-display` / `--cert-serif` is a **deliberate convention of
the certificate world**, not a leftover. Stripping it would have been this loop silently reverting the
newest human design directive on a guess — precisely what build.md §1 forbids.

**What was built instead:** the criterion was re-scoped (in the spec, before coding) from *"remove
uppercase"* to *"no un-reasoned uppercase rule can exist"*. `test_type_system_contract.js` seeds a
reasoned allowlist with all 24 live rules and enforces **set-equality in both directions** — an
unlisted live rule fails forward, an allowlist entry with no live rule fails in reverse (the RAZOR
mirror rule; a one-directional check would have been a verifier FAIL). **Zero rendering change to
uppercase in this diff.**

Each allowlist entry carries a category in its reason string, so the human answers the design question
by scanning one file:

- **12 `247-world micro-label`** — 4 in pool-detail-styles.css (all from the #409 certificate-skin
  commit), 6 in planner-styles.css (2 blame directly to #413), 2 in landing-styles.css. Signature:
  `--cert-serif`/`--font-family-display` + 0.14–0.22em tracking.
- **1 `data`** — `.pool-logo-monogram`, a single-letter protocol monogram already uppercased in JS
  (`String(project||"").trim()[0]`); the CSS transform is redundant with the data, not a style choice.
- **11 `unreviewed residue`** — 5 style.css (incl. the dead `.pool-left-section::after`), 5
  planner-styles.css, 1 stories.css. All blame to a pre-247 squashed boundary commit with no recorded
  rationale. The reasons say *"cannot confirm intent from source alone"* rather than inventing intent.

Flip any reason to residue and the sweep becomes a mechanical follow-up ticket.

## Deviation 2: the count was wrong in both directions, and the instrument won

The spec said 11. My hand survey at pickup said 23. The enumeration test derived **24** — my survey had
omitted `stories/stories.css` (`.st-eyebrow`), which the spec's own population definition includes. The
spec and BACKLOG row were corrected to 24 with the miss recorded. This is the argument for deriving the
population at test time rather than listing it, made against my own number.

## Deviation 3: the render test asserts on `/?app`, not `/?token=USDC`

The brief said to hover `.logo` on `/?token=USDC`. Reading `app.js`, the `.logo` `<h1>` wordmark renders
only when `!(selectedToken || (chainMode && selectedChain))` — the analytics app's blank/search state.
On `/?token=USDC` that condition is false and a differently-classed `.app-logo` compact header renders
instead. The test uses `/?app` (a legitimate analytics URL — `app` is in `ANALYTICS_PARAMS`,
`home.html:79`) and asserts `data-app-mode === 'analytics'` alongside the selector, so the surface is
still provably the analytics app. Documented in the test file's own header.

## Deviation 4: one fixed selector has no render call site

`.gp-waitlist-link-text` was tokenized, but it has **zero render call sites anywhere in current JS** —
grep finds it only in `planner-styles.css`, its min twin, and the spec. It is dead/reserved CSS. The
render test therefore asserts the mono-token leg on `.gp-journey-status` only, prints the unreachability
as an `(info)` line each run, and says so in its header rather than faking coverage. The stack was still
tokenized so that a rule going live later cannot reintroduce a hardcoded stack.

## Deviation 5: `npm install` was run

`node_modules` did not exist in the build session — every `require('playwright')` would have failed,
including pre-existing tests (`test_footer_contract.js` failed identically before the install,
confirming it was environmental and not caused by this diff).

## Non-vacuity proof — 3 sub-rules neutered SEPARATELY, plus both directions of the mirror

A gate nobody has seen fail is not evidence (LEARNINGS 2026-07-27). Each mutation turned exactly ONE
rule red while the others stayed green, so "three working rules" is distinguishable from "one working
rule and two dead ones":

| # | Mutation | Red | Others | Restore proof |
|---|---|---|---|---|
| 1 | `.value.token-pair` font-family back to bare `monospace` | Rule 1 (`style.css:4471`) | 2, 3 green | `md5sum style.css` before = after = `2fd3f50d2cde463962d461a4aba1c56e` |
| 2 | throwaway `.nonvacuity-mutation-throwaway { text-transform: uppercase }` added to landing-styles.css | Rule 2 **forward** (25 live, 1 unlisted) | 1, 3 green | `git status --short landing-styles.css` clean after restore |
| 2b | deleted `text-transform: uppercase` from `.st-eyebrow` (stories.css) | Rule 2 **reverse / stale-entry** (23 live, 1 stale entry) | 1, 2-fwd, 3 green | `md5sum stories/stories.css` before = after = `c67d2d0c6b4af1aced6673bc5c82d19b` |
| 3 | re-added `transform: scale(1.02)` to `.logo:hover` | Rule 3 (`style.css:2252`) | 1, 2 green | `md5sum style.css` before = after = `2fd3f50d2cde463962d461a4aba1c56e`, `git status` clean |

Final run after all restores: **6/6 pass**. `npm run minify` re-run post-restore produced a zero diff,
confirming the mutate/restore cycle left no stale min asset.

## Class left OPEN, with a number (RAZOR class rule)

This item closes the **hover half** of the banned-motion class only. `@keyframes yieldBounce`
(`style.css`, applied via `.yield-pulse-active`) is a `scale(1.02)` pop on a bounce easing
`cubic-bezier(0.34, 1.56, 0.64, 1)` — **both** banned by CLAUDE.md — but it is not a `:hover` rule, so it
sits outside rule 3's predicate and outside this diff. **1 rule / 1 keyframe block, unguarded**, ticketed
for its own item. Rule 3 as written would NOT catch a banned scale-pop introduced as a keyframe
animation tomorrow, and this item does not claim otherwise.

The font-stack class **is** closed for the current population: Rule 1 derives the population by glob
(root `*.css` minus `*.min.css`, plus `stories/stories.css`; a glob returning <4 files fails loudly), so
a stylesheet added tomorrow is covered on the day it lands, and a hardcoded stack in it fails the gate.

## Tests

Written: `test_type_system_contract.js` (plain lane, 406 lines, brace-depth-aware CSS tokenizer handling
multi-line selector lists, quoted strings with embedded braces, and `@font-face`/`@keyframes` nesting) and
`test_type_system_render.js` (browser lane, 265 lines, real chromium, both themes). Both registered in
`package.json`'s `test:serial`; `test_test_registry.js` (spec 205) green afterwards — no orphans, no
ghosts, no duplicates, parse integrity intact.

| Command | Result | Duration |
|---|---|---|
| `node test_type_system_contract.js` | 6/6 pass | 0.14s |
| `node test_type_system_render.js` | 6/6 pass, both themes | 1m20s |
| `run-tests.js --only=test_minified_assets,test_css_minified_render,test_min_asset_boot,test_type_system_contract` (×2) | 4/4 pass both runs | ~66s |
| `node test_run_tests.js` | 26/26 pass | 1.5s |
| `node test_test_registry.js` | 5/5 pass | 0.05s |

Nothing timed out; the 5-minute foreground timebox was never hit (the render test was run under
`timeout 280`).
