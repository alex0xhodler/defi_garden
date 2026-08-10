# 257 — build notes

Built 2026-08-10, branch `claude/loop-257`, parent `8724cc8375` (= `origin/main` at pickup).
Implementation dispatched to a Sonnet 5 agent per the 2026-07-13 execution-model split; operator
(Opus 5) selected the item, wrote the brief, re-ran every gate independently, and judged the baseline.

## Pickup decision — why 257 and not the higher-scored rows

build.md §1 says take the highest-scored READY item. Two rows outscore 257; both were skipped, and the
reasons are recorded here because a silent skip would make the next run re-derive them.

- **234 (9.3)** — its status field literally reads "build after 227/228". Neither 227 nor 228 is built.
  Dependency unmet; nothing to decide.
- **238 (8.8)** — skipped for two independent reasons. Attempt 1 of this item ALSO edited 238's BACKLOG.md
  status row (READY → BLOCKED); the verifier called that out-of-scope twice, categorically, and **the row
  edit has been reverted — 238's row on main is untouched by this commit.** The verifier is right on the
  process rule (build.md step 7 authorizes editing *the item's own* row, not another item's), and the
  finding stands recorded rather than argued away. The consequence is stated plainly so it is not lost:
  **238 still reads READY on main, and the next build run will pick it up as the top-scored item and build
  against a spec whose measurements no longer describe the files.** That is now a question for the human
  (carried in this run's push notification and LOG entry), not a row this item may fix.
  (1) **The spec's evidence is stale.** `specs/238.md` was measured on branch `claude/loop-225` and cites
  `style-225.css:3259/3389/3463/3696` and `style.css:1644`. Item 247's design world landed on main
  2026-08-07 (PR #409, 9,869 files) — the stylesheet rewrite 238's own row anticipated as a "sequencing
  caveat". Re-measured on this branch's parent `8724cc8375`: `grep -c 'SF Mono' style.css` = **0** (spec
  says 4), `text-transform: uppercase` in style.css = **6** (spec says 11), and `style.css:1644` is no
  longer `.logo:hover`. Its acceptance criteria would guard numbers that have already moved.
  (2) **It is design work**, and standing decision 2026-08-05 (DESIGN QUALITY BAR + PROCESS) requires design
  to ship through screenshot-first increments each approved by the human before the next. An autonomous
  build run cannot supply that approval, so 238 has no auto-merge path regardless of verifier verdict.
  Recorded as a question for the human on the row: re-spec 238 against the 247 world, or cull it as absorbed?

The re-measurement evidence is kept here (it is this run's own pickup reasoning, which belongs in this
item's notes) while the row itself is left alone (it belongs to 238).

## What shipped

1. `app.js` `handleCalculateYield` (+16 lines) — sets `urlDirectPoolViewFiredRef.current = pool.pool`
   (the pre-existing anti-double-fire mechanism `handlePoolClick` already uses at `app.js:2669`) and
   emits `Analytics.trackPoolView(pool, {source: 'yield_calculator', search_query, selected_chain,
   selected_token, protocolCtaPresent})`. Purely additive. `Analytics.trackPoolClick(pool,
   'yield_calculator')` is untouched; the `url_direct` and `card_click` emit payloads are untouched
   (`git diff origin/main HEAD -- app.js` is 16 added lines, 0 deleted, 0 modified).
2. `test_pool_view_coverage.js` (new, plain lane) — the mirror gate.
3. `test_pool_view_calculator_fires.js` (new, browser lane, port 8979) — the rendered leg.
4. `package.json` `test:serial` — both files appended (required by `test_test_registry.js`).
5. `app.compiled.js` / `app.compiled.min.js` — regenerated (`npm run compile && npm run minify`).

## Three attempts, two verifier FAILs (the substantive history, not smoothed over)

The product change (`app.js`, +16 lines) was correct and unchanged from attempt 1 onward; every verifier
finding was against **the gate**, and each one was the same error in a different rule: a predicate that
watched something RESEMBLING the mechanism instead of the mechanism (RAZOR worked example 5) — committed
inside the very item whose test file cites that example as its governing precedent. Worth reading as three
data points on how hard the weak-form discipline is to actually execute, not as three tidy iterations.

| attempt | what the gate claimed | how a verifier broke it |
|---|---|---|
| 1 | rule (b): a transition is covered if a setter's variable name appears anywhere in an emitting function | two mutations — a fabricated `setPool`, and the REAL `setSelectedChain` — both reported covered while emitting nothing |
| 2 | rule (b) hardened to a three-part mechanism check; rule (a) untouched | rule (a) was plain textual co-occurrence: a transition inside an early-return guard, with the emit later in the same function, made the **entire suite** green — count check, coverage check and orphan check all passed |
| 3 | rule (a) gains a dominance check (offset order + enclosing-block prefix) | survived — verifier PASS, LOW, 7/7. It re-ran its own attempt-2 mutation, built fresh attacks against both rules, and found no undocumented fail-silent hole |

**Attempt 3's fix.** Rule (a) now requires the emit to DOMINATE the transition, not merely co-occur: the
emit's offset must precede the transition's, AND the emit's stack of enclosing `{...}` blocks within the
function body must be a **prefix** of the transition's — same block, or a block that encloses it, never a
sibling branch. Both facts come from the brace-pair list the scanner already builds; no dependency added.
Four new permanent assertions guard it: the verifier's exact early-return mutation; a mirror-image
sibling-branch mutation (emit textually EARLIER but in a non-ancestor block — proves the block-prefix half
is load-bearing, not just offset order); a **positive control** (transition nested in an `if`, dominated by
a top-level emit before it, must still be covered — proves the rule doesn't over-reject); and an assertion
that count-equality and coverage are independent, since the verifier's mutation kept counts equal (3→4 on
both sides) while a real gap existed. The gate went 7 → 14 → **18** assertions.

## Attempt 1's rule-(b) hole, in detail

Attempt 1 shipped a rule (b) that was a **textual name-collision heuristic**: a transition was "covered" if
its function called `setX(...)` and the bare word `x` appeared anywhere inside some function containing a
`trackPoolView(` call. The verifier broke it with two constructed mutations, both plausible shapes for a
real future entry path, both reported `covered:true` while emitting nothing:

- `(pool) => { setPool(pool); setCurrentView('pool-detail'); }` — `setPool` is not even a real setter; the
  bare word `pool` occurs all over `handlePoolClick`.
- `(pool, chain) => { setSelectedChain(chain); setCurrentView('pool-detail'); }` — `setSelectedChain` IS a
  real setter, and `selectedChain` appears bare inside `handleCalculateYield`'s own emit context.

This is precisely RAZOR worked example 5 — a guard aimed at a resemblance of the mechanism, which is worse
than no guard because it launders the gap as coverage — committed inside the very item whose test file cites
that example as its governing precedent. Recorded plainly because the loop's value depends on it.

**Attempt 2 re-derived rule (b) from the mechanism** as a three-part conjunction, each part checked against
`app.js`'s own text: (i) `setX` is a real `[x, setX] = useState(...)` binding; (ii) `x` is the **first
argument** of an `Analytics.trackPoolView(` call — the pool being reported, not a word nearby; (iii) that
call sits in a `useEffect` whose **dependency array contains `x`**. Truth table, verified in-test:

| setter | (i) real useState | (ii) first arg of trackPoolView | (iii) in effect deps | attempt 1 | attempt 2 |
|---|---|---|---|---|---|
| `setPendingUrlDirectPool` (real `url_direct` handoff) | yes | yes | yes | covered/b | covered/b ✓ |
| `setPool` (verifier mutation 1) | **no** | n/a | n/a | covered/b — FALSE POSITIVE | **uncovered** ✓ |
| `setSelectedChain` (verifier mutation 2) | yes | **no** | n/a | covered/b — FALSE POSITIVE | **uncovered** ✓ |

Both verifier mutations are now **permanent assertions** in the file, and each of the three sub-conditions is
neutered separately in a truth-table drill — so "three working sub-rules" is distinguishable from "one
working sub-rule and two dead ones" (build.md test rule). The gate went from 7 to 14 assertions.

**What can still slip through after all three attempts** (also written into the test file's docstring).
Attempt 2's notes listed two residuals and read as if that were the whole list; a verifier then found a
third, worse one. So this list is written as *what has been examined*, not *what exists* — the honest
epistemic status after two consecutive misses:

- **Rule (a), dominance is textual, not a control-flow graph.** A **loop** body's emit counts as dominating
  code after the loop even at zero iterations; a **`try`/`finally`** emit reads as always-running even if
  the `try` threw first; a **callback** (`setTimeout`, `.then`) that is textually earlier and in the same
  block is not synchronous but scores as dominating; **early returns nested two or more levels deep**, and
  `switch` fallthrough, are not exercised beyond the single-level guard clause tested; **ternaries and
  `&&`/`||` short-circuits** open no `{` block, so conditional execution is invisible to the block-stack
  check.
- **Rule (b), shadowing.** Matching is by bare identifier text, not binding resolution. A future local
  `const` or parameter spelled like a genuine state variable is textually indistinguishable in checks
  (ii)/(iii).
- **Rule (b), wiring vs. reachability.** The rule proves the state slot exists, is the emit's first
  argument, and is a declared effect dependency. It does not evaluate the consuming effect's guard body.

None of these shapes exist in `app.js` today — the three real sites are two straight-line handlers and one
documented two-`useEffect` handoff — so this is about future entry paths, not a hidden current gap.

## Deviations from the spec

- **The set-equality predicate is weaker than acceptance-criterion bullet 1's paraphrase, and
  deliberately so.** That bullet says each transition site must have an emit site "within its own
  function body". Applied literally it would FAIL a correct path: `url_direct` (app.js ~1293, inside a
  `useEffect`) does not emit in its own body — spec 182 deliberately parks the pool into
  `pendingUrlDirectPool` and a sibling `useEffect` emits once the baked protocol-URL artifact has
  settled. The spec's own §Change text anticipates this and is the operative instruction. The gate
  therefore implements the mechanism, not its resemblance (RAZOR worked example 5): a transition is
  covered iff its enclosing function (a) calls `Analytics.trackPoolView(` itself, or (b) satisfies the
  three-part parked-state conjunction in the section above. Both directions are asserted, so a stray emit
  cannot launder coverage. The test additionally asserts that **both** rules are exercised by the real file
  — otherwise "two working rules" would be indistinguishable from "one working rule and one dead one"
  (build.md test rule).
- `position` is omitted from the new emit's context. `handlePoolClick` has a card position argument;
  `handleCalculateYield` does not. Omitted rather than invented — `trackPoolView` already defaults it
  to `-1`.
- The spec asked for `source: 'yield_calculator'`; that is what shipped, reusing the `pool_click`
  vocabulary so the two events join on one property (spec §Open questions).

## Non-vacuity (build.md test rule — mutate → red → restore → green, byte-identical)

`md5sum app.js` before mutation: `031451d9729627363a0655162ccb6b3b`

- Deleted the new `trackPoolView` call from `handleCalculateYield`, recompiled/minified:
  - `node test_pool_view_coverage.js` → **RED** (exit 1): count mismatch 3 ≠ 2, `handleCalculateYield`'s
    transition reported uncovered, and both self-defeat sub-assertions failed too (the condition they
    simulate had become real).
  - `node test_pool_view_calculator_fires.js` → **RED** (exit 1): `expected exactly one pool_view, got 0`.
- Restored, recompiled/minified. `md5sum app.js` after restore: `031451d9729627363a0655162ccb6b3b` —
  **byte-identical**. Both tests → **GREEN**.

The gate also carries two in-file self-defeat mutations that run on every invocation, against in-memory
copies (never written to disk), through the same pure `analyze(source)` the real file goes through:
(A) remove the calculator emit → its transition must flip to uncovered; (B) inject a synthetic FOURTH
uninstrumented `setCurrentView('pool-detail')` → must be reported uncovered. (B) is the proof the
population is derived, not hardcoded to the three sites known on 2026-08-10.

## Gates re-run by the operator (not taken on the agent's word)

| command | result |
|---|---|
| `node test_pool_view_coverage.js` | **18/18** assertions passed (attempt 3; 7/7 attempt 1, 14/14 attempt 2 — each raise came from a verifier finding, not from adding coverage voluntarily) — population printed: 3 transitions, 3 emits; line 1293 covered by rule **b**, 2683 and 2803 by rule **a** |
| `node test_pool_view_calculator_fires.js` | 2/2 passed |
| `node test_northstar_cta_fires.js` | 12/12 passed (no regression on `url_direct` / `card_click` / chain+minTvl arrival) |
| `node test_test_registry.js` | 5/5 passed (both new files registered) |
| `node run-tests.js --lane=plain --timeout=120` (agent, ~118s, inside the 5-min timebox) | 54 pass / 1 fail — see below |

## A live pre-existing failure on main, NOT caused by this item

`test_translations_number_format.js` fails. **Verified pre-existing** rather than assumed: a detached
worktree at this branch's parent `8724cc8375` reproduces the identical failure with an identical
`translations.js` (`md5 70255066140191a8dcfe0038aa734d2e` in both trees):

```
✗ every collected entry has arity >= 1
  expected no zero-arg function-valued entries, found:
  ["en.landing.trustFloor","en.planner.personaDegenDesc","ko.landing.trustFloor","ko.planner.personaDegenDesc"]
```

Introduced by `1484ead80a fix(trust-rails): derive every stated TVL floor from DEFAULT_MIN_TVL (254)`,
which made `trustFloor` a zero-arg function-valued entry — a shape that gate's arity sanity check
forbids. `git diff origin/main HEAD -- translations.js` is empty, so item 257 cannot be the cause.
Recorded here and in `LOG.md`, and carried to the human in this run's push notification. **Deliberately
NOT filed as a new BACKLOG row**: the verifier ruled (twice, categorically) that a build item's diff may
touch only its own row, so filing a ticket for an unrelated defect is the heartbeat's job, not this run's.

An earlier baseline attempt was wrong and is recorded rather than hidden: `git worktree add <path>
origin/main` DWIM-resolved to the stale local `main` branch (`9ab58d99`), which predates 254 and
therefore passed. The baseline above uses `--detach 8724cc8375` and is the one that counts.

## Class

**Instance of:** the 212 mirror class — a fact that must exist in two places where only one is read at
runtime. Here the two places are "the set of ways to reach pool-detail" and "the set of places that
report reaching it".

**Class closed:** **for pool-detail, yes with a stated boundary** — not the unconditional "a fourth entry
path added tomorrow must fail the gate" of spec acceptance bullet 7. What is actually true: the gate derives
its population from `app.js` at test time, so a fourth *uninstrumented* transition is reported uncovered
(proven by self-defeat mutation B, by the two verifier-found rule-(b) false positives, and by the verifier-found rule-(a) early-return mutation plus its sibling-branch mirror — all now guarded permanently);
and a fourth transition that parks its pool into a state variable consumed as an emit's first argument under
that effect's dependency array passes — correctly, because that path genuinely does fire `pool_view`. The
boundary the gate cannot see is stated above (shadowing; wiring-vs-reachability). Attempt 1 claimed soundness unconditionally and was wrong; attempt 2 named two residuals as if they were
the whole list and was also wrong. This claim is scoped to what has been adversarially tested, and the
unexamined shapes are enumerated above rather than implied absent. **No for the general
case:** the same transition-vs-emission gap can exist for any other tracked view. Population of that
residual, counted on this branch: `grep -c "setCurrentView(" app.js` → **8** call sites, of which
**3 are `'pool-detail'` (now gated) and 5 are `'search'` (not gated by anything)**; the planner's own
view transitions live in `planner.js` and are outside this count entirely. So the gate covers 3 of 8
`setCurrentView` sites in `app.js` — 37.5%. Stated with a number rather than pretended away, per
build.md's class rule.
Not ticketed — a run that wants it should file it, not widen this one (spec 257 §Hypothesis says the same).

## Territory notes for whoever touches this next

- `home.html` boots the analytics app from `app.compiled.js` / `app.compiled.min.js`, **not** raw
  `app.js`. Any `app.js` edit needs `npm run compile && npm run minify` or every rendered test measures
  the old bundle and passes for the wrong reason.
- `node_modules` is absent in a fresh cloud clone; `npm ci` is required before any browser-lane test.
- The historical `pool_view` series is a lower bound of unknown tightness (spec 257). Exactly one prod
  render is confirmed missed (2026-08-09). Nothing was retroactively "corrected".

## Verifier's attempt-3 findings, recorded even though it PASSED

The final verifier ran its own fresh attacks and confirmed the residual list above is accurate — the
ternary, `switch`-fallthrough and expression-bodied-callback shapes each do slip through as documented, and
the rule-(b) shadowing case does too. Two corrections it volunteered, both recorded rather than quietly
absorbed:

1. **The notes over-warned on one shape, in the safe direction.** A *block-bodied* callback
   (`setTimeout(() => { Analytics.trackPoolView(...) }, 0)`) is in fact handled correctly — the callback
   gets its own function span, so rule (a)'s same-function check excludes it. Only the *expression-bodied*
   (braceless) form slips through. The residual list said "callbacks" flatly; the accurate statement is
   "expression-bodied callbacks".
2. **One undocumented gap, fail-LOUD.** A duplicate `useState` declaration reusing an existing setter name
   in another scope overwrites the scanner's setter→variable map (last-write-wins), which can make the real,
   correctly-instrumented `url_direct` transition report *uncovered*. That breaks CI visibly on a working
   path rather than letting a real gap through silently — the opposite direction from the two findings that
   failed attempts 1 and 2, which is why it did not block the PASS. Named here so it is not rediscovered as
   a mystery: it is a scanner robustness gap, not a coverage gap.

Also verified independently by the final verifier: two-level nested sibling branches and two-level nested
early returns are handled CORRECTLY — the residual list flagged them as "not exercised", which was an honest
"untested", and testing resolved them in the gate's favour.

## Compound step

New playbook: `product-loop-kit/playbooks/source-relation-guard.md` — how to build a gate that relates two
sets of source-code sites without watching a resemblance. Written because this item burned three attempts
and two verifier FAILs on exactly that, and the next such gate should start from the checklist instead of
the same three holes. No existing playbook covered it (`detector-signal-coverage.md` is about a checker's
signal SET, `detector-detection-rate.md` about a covered signal's firing rate,
`checker-by-design-classification.md` about miscategorised findings) — so this is a new file, not a
duplicate.
