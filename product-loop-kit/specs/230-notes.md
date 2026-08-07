# Item 230 — build notes

> **Renumbered 230 (was 224), 2026-08-04.** This item was specced and built as `224` — the id
> item 221's verifier filed it under. Mid-build, a human-directed strategy heartbeat landed items
> **224-229** on `main` (`5a5ac601cb`). Those are human-authorised and already on `main`, so they
> keep their ids and this item moved to **230**; its follow-on lens ticket moved 225 → **231**.
> Nothing on `main` was modified. Two consequences worth knowing while reading this file: the git
> branch is still `claude/loop-224` (renaming it costs a second Vercel preview deployment, the
> exact thing the 2026-07-13 quota decision exists to prevent), and the throwaway probe script
> referenced below was named `probe_224_variants.js` at the time it ran — the name is left as it
> was rather than retro-edited into something that never existed.


## Step 1 — pre-registered variant measurement (probe script, deleted before finishing)

Probe: `probe_224_variants.js` at repo root, port 8877 (grep of all `test_*.js`
`const PORT` values showed 8791-8876 taken; 8877 free). Same server + fixture-
routing pattern as `test_dead_pool.js`. Deleted after use — `git status` at the
end of the build shows only `style.css`, `style.min.css`, `test_dead_pool.js`
modified plus this notes file added.

Fixtures:
- **long-content**: 5 above-`DEFAULT_MIN_TVL` stable pools (matches the spec's
  evidence table), measured at 1280×780.
- **short-content**: 2 stable pools, both **below** the $10M floor, so
  `deadPoolAlternatives.items.length === 0` and the alternatives grid never
  renders — measured at 1280×1400 (free vertical space exists).

Applied via `page.addStyleTag` with `!important` overrides after each variant's
selectors (baseline = no injected CSS at all).

### Long-content @ 1280×780 (free space ≈ 0 — spec predicts variants converge)

| | `.empty-state` rect | `.app-footer` rect | victims (footer-overlap or hit-test) |
|---|---|---|---|
| **Baseline** (no fix) | `{x:366.1,y:389.4,w:547.8,h:792.2}` | `{x:0,y:711,w:1280,h:69}` (fixed) | **20** — incl. 3× `calculate-yield-btn-new` at 31.0–33.3% covered, 3× `tvl-label`/`tvl-value` at 100% covered + `hitInFooter:true` |
| **Variant 1** (`position:static` only) | `{x:365.0,y:387.7,w:550.1,h:795.5}` | `{x:462.2,y:1307.2,w:355.7,h:69}` (in flow, at true doc bottom) | **0** |
| **Variant 2** (`+ margin-top:auto`) | `{x:364.4,y:387.0,w:551.2,h:797.0}` | `{x:462.2,y:1307.2,w:355.7,h:69}` (in flow, at true doc bottom) | **0** |

`.empty-state` delta baseline→V1: Δy ≈ 1.7px, Δh ≈ 3.3px. Delta V1→V2: Δy ≈
0.8px, Δh ≈ 1.5px — as predicted, **the two variants are visually identical**
here because there is no free vertical space to distribute differently.

### Short-content @ 1280×1400 (free space exists — the decision case)

| | `.empty-state` rect | `.app-footer` rect | victims |
|---|---|---|---|
| **Baseline** (no fix) | `{x:365.5,y:648.8,w:549.0,h:230.2}` | `{x:0,y:1331,w:1280,h:69}` (fixed, pinned to viewport bottom) | **0** (nothing below the fold at this height) |
| **Variant 1** (`position:static` only) — **WINNER** | `{x:366.1,y:654.5,w:547.8,h:223.8}` | `{x:462.2,y:1024.4,w:355.7,h:69}` (in flow, **floats mid-page** — the message+footer group centres together inside the flex column) | **0** |
| **Variant 2** (`+ margin-top:auto`) — **LOSER** | `{x:367.2,y:348.4,w:545.5,h:222.8}` | `{x:462.2,y:1331,w:355.7,h:69}` (in flow, pinned to the bottom — matches the baseline footer position) | **0** |

`.empty-state` Δy vs baseline: **Variant 1 = +5.7px** (648.8 → 654.5).
**Variant 2 = −300.4px** (648.8 → 348.4, message pushed to the top of the
viewport). Both variants clear all occlusion in both fixtures (criterion (a)
of the decision rule is satisfied by both). Criterion (b) — smaller change to
today's rendered `.empty-state` geometry — is decided by ~6px vs ~300px, not
close.

**Decision, per the pre-registered rule: ship Variant 1 (`position: static`
only).** Variant 2 is disqualified: although it keeps the footer visually
pinned to the bottom (arguably nicer for a mostly-empty page), it does so by
top-aligning the empty-state message, a ~300px change to where users see the
"pool no longer tracked" headline today — the rule explicitly weighs
geometry-change size, not aesthetic preference, and Variant 1 wins on that
literal metric.

## Step 2 — shipped change

`style.css`, placed directly after `.app-footer a:hover` and before the
"Hub nav inside the disclosure footer (086)" comment (i.e. with the
`.app-footer` block, per the task's line-2577 pointer — the file grew by 30
lines above that point during this session so the rule now sits a bit further
down; anchored by selector, not by line number, per the item-221 house rule):

```css
.app:not(.has-results):has(.results-section) .app-footer { position: static; }
.app:not(.has-results):has(.results-section) { padding-bottom: 0; }
```

with a comment (full text in `style.css`) explaining: the mechanism (root
class vs results-render predicate disagreement leaves this state without
clearance, mid-document occlusion that padding cannot reach), the shipped
precedent (`pool-detail-styles.css`'s `.app.pool-detail-view .app-footer`
block, `landing-styles.css`'s `.landing-app .app-footer` block), the measured
and rejected `margin-top: auto` alternative with the ~6px vs ~300px numbers
from Step 1, the `:has()` scoping guarantee (only fires on states that render
a `.results-section`), and why `padding-bottom: 0` is not a revert of the
shared clearance.

`npm run minify` regenerated `style.min.css`. Confirmed present and correctly
minified (`:has()` survives):

```
$ grep -o '\.app:not(\.has-results):has(\.results-section)[^}]*}[^}]*{[^}]*}' style.min.css
.app:not(.has-results):has(.results-section) .app-footer{position:static}.app:not(.has-results):has(.results-section){padding-bottom:0}
```

## Step 3 — `test_dead_pool.js` extension

Added (without touching any pre-existing assertion):
- `newCtx(browser, viewport)` gained an optional `viewport` param, defaulting
  to the pre-existing `{width:1280,height:900}` — every pre-existing call site
  is unchanged, so all 5 of spec 072's criteria run byte-identically to before.
- `scrollToTrueBottom(page)` — loops `scrollTo`, asserts arrival (throws if
  never reached), same shape as `test_footer_occlusion.js`'s helper.
- `findOcclusionVictims(page)` — queries `.empty-state, .empty-state-alternatives`
  (de-duplicated via a `Set`, since alternatives nests inside `.empty-state`),
  `querySelectorAll('*')` within each, skips zero-area elements, and for every
  remaining element computes BOTH geometric overlap with `.app-footer`'s rect
  AND an `elementFromPoint` hit-test at the element's lower band (`r.bottom -
  2`, horizontal centre). A victim is any element with `coveredPct > 0` OR
  `hitInFooter`.
- `assertNoOcclusion(page, label)` — throws naming every victim's selector,
  its rect, `.app-footer`'s rect, the covered percentage, and the hit-test
  result (element or `null`) — never a bare count.
- New `test()` cases: at-rest occlusion at 1280×780/768×780/360×780 (asserts
  `scrollY === 0` first), true-bottom-of-scroll occlusion at the same three
  viewports (via `scrollToTrueBottom`), and the collateral check on
  `?app=analytics` (search-home, no query) asserting `.results-section` is
  absent, `.app` lacks `.has-results`, `getComputedStyle(footer).position ===
  'fixed'`, and `getComputedStyle(app).paddingBottom === '80px'`.

Population is derived from the DOM at test time — no hardcoded victim list;
running against the shipped fixture pool set the discovered victims include
`.pool-tvl-section`, `.tvl-label`, `.tvl-value`, `.pool-cta-section`,
`.calculate-yield-btn-new`, `.pool-card`, `.pools-grid`,
`.empty-state-alternatives` — matching the spec's evidence table without being
copied from it.

## Step 4 — non-vacuity proof (raw output)

**(a) GREEN before mutation** (`node test_dead_pool.js`):
```
  ✓ dead ?pool= renders honest empty state (EN title), no all-pools grid, robots=noindex
  ✓ alternatives render above the floor; clicking one -> pool detail + robots restored
  ✓ valid ?pool= renders pool detail and robots stays "index, follow" (never noindexed)
  ✓ dead ?pool=&lang=ko renders the KO poolNotFoundTitle string
  ✓ valid ?token= still renders pool cards and stays indexable (dead-pool path does not disturb token path)
  ✓ item 230: 1280x780 at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer
  ✓ item 230: 768x780 at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer
  ✓ item 230: 360x780 at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer
  ✓ item 230: 1280x780 true bottom of scroll — arrival asserted, zero .empty-state* occlusion
  ✓ item 230: 768x780 true bottom of scroll — arrival asserted, zero .empty-state* occlusion
  ✓ item 230: 360x780 true bottom of scroll — arrival asserted, zero .empty-state* occlusion
  ✓ item 230: analytics search-home (no .results-section) keeps .app-footer fixed + .app padding-bottom:80px

12 dead-pool assertions passed (EN: "This pool is no longer tracked", KO: "더 이상 추적되지 않는 풀입니다")
```

**(b) `md5sum style.min.css` before mutation:**
```
2a6e441d1b96e05839e3e3fcc9f1f3de  style.min.css
```

**Mutation** (the pre-fix state, per the playbook's rotted-control rule —
restore `position: fixed`, the protection the product used *before* this
item, on the SHIPPED minified rule):
```
sed -i 's/\.app:not(\.has-results):has(\.results-section) \.app-footer{position:static}/.app:not(.has-results):has(.results-section) .app-footer{position:fixed}/' style.min.css
```
resulting rule: `.app:not(.has-results):has(.results-section) .app-footer{position:fixed}.app:not(.has-results):has(.results-section){padding-bottom:0}`

**(c) RED after mutation** (`node test_dead_pool.js`) — real occlusion
signature, not a timeout, naming victims + `.app-footer` hit-test resolutions:
```
  ✓ dead ?pool= renders honest empty state (EN title), no all-pools grid, robots=noindex
  ✓ alternatives render above the floor; clicking one -> pool detail + robots restored
  ✓ valid ?pool= renders pool detail and robots stays "index, follow" (never noindexed)
  ✓ dead ?pool=&lang=ko renders the KO poolNotFoundTitle string
  ✓ valid ?token= still renders pool cards and stays indexable (dead-pool path does not disturb token path)
  ✗ item 230: 1280x780 at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer
    1280x780 at rest: 20 occluded element(s) in .empty-state / .empty-state-alternatives:
    victim ".empty-state-alternatives" rect={"x":400.6,"y":545.4,"w":478.8,"h":537.1} vs .app-footer rect={"x":0,"y":711,"w":1280,"h":69} covered=12.8% hitTest=clear (resolved "null")
    victim ".pools-grid" ... covered=13.7% hitTest=clear (resolved "null")
    victim ".pool-card animate-on-mount clickable" ... covered=28.4% hitTest=clear (resolved "null")
    victim ".pool-tvl-section" ... covered=100% hitTest=INSIDE .app-footer (resolved "app-footer-hub-links")
    victim ".tvl-label" ... covered=100% hitTest=INSIDE .app-footer (resolved "P")
    victim ".tvl-value" ... covered=100% hitTest=INSIDE .app-footer (resolved "P")
    victim ".pool-cta-section" ... covered=24.5% hitTest=clear (resolved "null")
    victim ".calculate-yield-btn-new" ... covered=10.7% hitTest=clear (resolved "null")
    [... repeated for the 2nd and 3rd alternative pool-cards, 20 total victims ...]
  ✗ item 230: 768x780 at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer
    768x780 at rest: 8 occluded element(s) in .empty-state / .empty-state-alternatives:
    victim ".pool-tvl-section" rect={"x":84.7,"y":705.0,"w":598.5,"h":36.1} vs .app-footer rect={"x":0,"y":722,"w":768,"h":58} covered=52.9% hitTest=INSIDE .app-footer (resolved "P")
    victim ".tvl-label" ... covered=56.7% hitTest=INSIDE .app-footer (resolved "app-footer")
    victim ".tvl-value" ... covered=56.1% hitTest=INSIDE .app-footer (resolved "app-footer")
    victim ".calculate-yield-btn-new" rect={"x":84.7,"y":763.9,"w":598.5,"h":28.5} vs .app-footer rect={"x":0,"y":722,"w":768,"h":58} covered=56.5% hitTest=clear (resolved "null")
    [... 4 more victims ...]
  ✗ item 230: 360x780 at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer
    360x780 at rest: 6 occluded element(s) in .empty-state / .empty-state-alternatives:
    victim ".pool-context-inline" rect={"x":70.75,"y":719.6,"w":141.1,"h":50.3} vs .app-footer rect={"x":0,"y":722,"w":360,"h":58} covered=95.3% hitTest=INSIDE .app-footer (resolved "A")
    [... 5 more victims ...]
  ✓ item 230: 1280x780 true bottom of scroll — arrival asserted, zero .empty-state* occlusion
  ✓ item 230: 768x780 true bottom of scroll — arrival asserted, zero .empty-state* occlusion
  ✓ item 230: 360x780 true bottom of scroll — arrival asserted, zero .empty-state* occlusion
  ✓ item 230: analytics search-home (no .results-section) keeps .app-footer fixed + .app padding-bottom:80px

9 dead-pool assertions passed (EN: "This pool is no longer tracked", KO: "더 이상 추적되지 않는 풀입니다")
```
(Full untruncated output was captured in the session transcript; each victim
line names the selector, both rects, covered %, and the hit-test resolution —
per the spec's failure-message requirement.)

**Restore.** Note: the shipped `style.min.css` is itself an *uncommitted*
change in this branch (the fix isn't landed on `HEAD` yet), so `git checkout
-- style.min.css` is NOT the correct restore here — it would discard the fix
entirely and roll back to the pre-230 committed file (confirmed this the hard
way: first attempt used `git checkout` and had to re-run `npm run minify` to
recover). The correct restore is undoing only the `sed` mutation, verified
against a pre-mutation backup copy taken with `cp`:

```
$ cp style.min.css /tmp/.../scratchpad/style.min.css.backup   # taken right after (b)'s md5sum
$ cp /tmp/.../scratchpad/style.min.css.backup style.min.css   # restore
```

**(d) `md5sum` after restore, compared to the pre-mutation backup:**
```
2a6e441d1b96e05839e3e3fcc9f1f3de  style.min.css
2a6e441d1b96e05839e3e3fcc9f1f3de  /tmp/claude-0/.../scratchpad/style.min.css.backup
```
Byte-identical to (b). Also independently confirmed by `node
test_minified_assets.js` (Step 5 below): "style.min.css is byte-identical to a
fresh minify of style.css" — PASS.

**(e) GREEN after restore** (`node test_dead_pool.js`):
```
  ✓ dead ?pool= renders honest empty state (EN title), no all-pools grid, robots=noindex
  ✓ alternatives render above the floor; clicking one -> pool detail + robots restored
  ✓ valid ?pool= renders pool detail and robots stays "index, follow" (never noindexed)
  ✓ dead ?pool=&lang=ko renders the KO poolNotFoundTitle string
  ✓ valid ?token= still renders pool cards and stays indexable (dead-pool path does not disturb token path)
  ✓ item 230: 1280x780 at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer
  ✓ item 230: 768x780 at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer
  ✓ item 230: 360x780 at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer
  ✓ item 230: 1280x780 true bottom of scroll — arrival asserted, zero .empty-state* occlusion
  ✓ item 230: 768x780 true bottom of scroll — arrival asserted, zero .empty-state* occlusion
  ✓ item 230: 360x780 true bottom of scroll — arrival asserted, zero .empty-state* occlusion
  ✓ item 230: analytics search-home (no .results-section) keeps .app-footer fixed + .app padding-bottom:80px

12 dead-pool assertions passed (EN: "This pool is no longer tracked", KO: "더 이상 추적되지 않는 풀입니다")
```

## Step 5 — regression run

| test | result |
|---|---|
| `test_dead_pool.js` | 12/12 passed (5 pre-existing spec-072 criteria + 7 new item-230 criteria) |
| `test_smoke.js` | 11/11 passed |
| `test_minified_assets.js` | 9/9 passed |
| `test_css_minified_render.js` | 2/2 passed |
| `test_footer_occlusion.js` | 8/8 passed |
| `test_cta_at_rest_occlusion.js` | 12/12 passed |
| `test_landing_footer_occlusion.js` | 21/21 passed |
| `test_audit_occlusion_lens.js` | 24/24 passed |

None of these were failing before this change — every one ran green with the
fix applied on the FIRST attempt (no pre-existing failure encountered, so no
stash-and-baseline-run was needed per the spec's "prove it" instruction; that
instruction only applies when a test is ALREADY red before touching it).

## Deviation from spec

None of substance. The spec's line-2577 pointer for where to place the new
rule in `style.css` predates this session's ~30-line comment addition, so the
rule now sits a bit further down the file than "line 2577" literally — it is
still directly adjacent to the `.app-footer` cluster (`.app-footer`,
`.app-footer p`, `.app-footer a`, `.app-footer a:hover`), which is what the
instruction actually asked for. No selector or scope was changed from the
spec's pre-written CSS snippet.

## What I did NOT do (spec's explicit out-of-scope list, restated)

- Did not touch `.app.has-results` or `.app.has-results .app-footer` — that
  is item 221's territory (PR #386, open/unmerged, parked pending a human
  decision). The P0 on `?token=`/`?chain=` stays open; this item does not
  attempt to close it.
- Did not unify `app.js:3001`'s root-class predicate with `app.js:3299`'s
  results-render predicate — recorded below under "Deeper defect, not built"
  instead of fixed, per the spec's explicit reasoning (routing dead-pool into
  `.has-results` would hand it the wrong grid layout AND land it in gap 1's
  still-broken footer state).
- Did not touch the `occlusion` lens's 15% detection rate — that is item 231.
- Did not add `margin-top: auto` — measured and disqualified in Step 1 above,
  per the pre-registered rule.
- Did not touch `app.js`, `.app.has-results`, or any file outside
  `style.css`/`style.min.css`/`test_dead_pool.js`/this notes file.
- Did not hand-edit `style.min.css` outside of the throwaway Step-4 mutation
  (which was restored from a pre-mutation backup, confirmed byte-identical,
  and independently re-verified via `test_minified_assets.js`).
- Did not commit, push, or touch `BACKLOG.md`/`LOG.md` — left for the operator.

## Deeper defect, not built

`app.js:3001` computes the `.app` root's class as ``app
${(selectedToken || (chainMode && selectedChain)) ? 'has-results' : ''}`` —
a predicate that checks only token/chain selection — while `app.js:3299`
decides whether to render the `.results-section` block using a DIFFERENT,
wider predicate: ``(selectedToken || (chainMode && selectedChain) ||
deadPoolResolved)``. `deadPoolResolved` is included in the second check but
not the first, so the dead-pool view is the one state where these two copies
of "are we showing results" disagree: it renders full results markup while
its root stays `.app` without `.has-results`. This item's `:has()` selector
works around the split by deriving from the render instead of trying to keep
two hand-maintained predicates in sync (RAZOR side 2, item 212's precedent),
but the underlying two-copies-of-one-predicate problem is untouched — a
future state that adds a new "show results without setting has-results"
branch would be silently caught by this item's `:has(.results-section)` guard
(no code change needed there), but anyone reading `app.js:3001` in isolation
would still conclude, incorrectly, that dead-pool has no results state. Worth
collapsing into one predicate someday, but doing so now would (per the spec)
risk handing dead-pool the `.has-results` grid layout and padding-top meant
for the Google-header results view, and would land it inside gap 1's
still-open `.app.has-results` footer occlusion (item 221, PR #386, parked).

## Verifier findings, applied (round 1 — VERDICT: PASS, HIGH, 9/9)

The verifier re-ran everything independently (all suites, the full non-vacuity
cycle, plus extension probes the builder never ran: dark mode, `&lang=ko`,
900px/1400px heights, an empty-alternatives fixture, KO+dark+empty combined,
and the three inverse-direction "must NOT match" states). It found no
counter-example to the central claim and no cascade divergence between the
`addStyleTag`/`!important` instrument used for the Step-1 variant measurement
and the real shipped stylesheet — it re-measured the winner directly against
the shipped file to check exactly that.

Two findings worth recording rather than papering over:

**1. `padding-bottom: 0` is NOT load-bearing per this test suite.** The
verifier did something the builder's non-vacuity cycle did not: it neutered the
two shipped declarations SEPARATELY.

- `position: static` removed (keeping `padding-bottom: 0`) → **RED**, real
  occlusion signature at all three viewports. Load-bearing.
- `padding-bottom: 0` removed (keeping `position: static`) → **GREEN, 12/12.**

So one of the two shipped declarations is invisible to the gate that ships with
it. This is NOT a reason to drop it — its purpose is real and is stated in the
CSS comment (once the footer is in flow, the inherited 80px protects nothing
and would leave a band of dead background beneath a footer that carries a top
box-shadow) — but that purpose is a **dead-space** claim, and every assertion
in this suite is an **occlusion** claim (overlap + hit-test). The suite
therefore cannot see the difference, and "all acceptance criteria pass" must
not be read as "both declarations are verified". Recorded as a coverage gap,
following the item-222 precedent where the verifier reported one CSS block as
not-load-bearing-per-the-suite and it was logged rather than quietly dropped.
Anyone extending this: the missing assertion is a *gap* check — measure the
vertical distance between the last `.empty-state*` element's bottom and the
footer's top and assert it is not ~80px larger than the in-flow spacing.

**2. Process ordering bug in this run's own bookkeeping, fixed before push.**
The first draft of the `LOG.md` entry (written into local commit `7c1c8c3d98`,
never pushed) said the item's PR was "opened + merged by this run after
verifier PASS" — written while the verifier was still running, so at the moment
of writing it was false on all three counts. The verifier caught it and flagged
it as exactly the class of overstatement it exists to catch; it was right, and
the entry was rewritten to describe only what had actually happened at commit
time before anything left this machine. The commit was amended, not
supplemented, so the record contains no version of the false claim. Worth
carrying forward as a rule: **bookkeeping may be drafted early, but any
sentence about a verdict or a merge gets written only after the event it
describes** — the one-commit rule makes it tempting to write the whole entry up
front, and that is where anticipated outcomes leak into the permanent record.
