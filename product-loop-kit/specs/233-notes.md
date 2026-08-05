# Item 233 — build notes

## What shipped

- `audit-app.js`:
  - `checkResponsive(page, s, findings, ctaSelector)` now calls the **existing**
    `waitForQuiescence(page, OCCLUSION_QUIESCENCE_BUDGET_MS)` (231's function, reused —
    never re-implemented) before its first read. On `!reached` it pushes a P2 `responsive`
    advisory naming the real numbers (`quiescence not reached in ${budget}ms at ${s.width}px:
    ${animCount} animation(s) still running, geometry ${changing|stable} — measuring anyway`),
    mirroring the wording shape `checkOcclusion`'s own advisory already uses. Then it
    **measures anyway** unconditionally — the scrollWidth check and the ancestor-clip check
    both run regardless of whether quiescence was reached, the switch is off, or neither.
  - Kill switch, same house convention as 231's `occlusionQuiescence`: `s.responsiveQuiescence
    !== false && process.env.AUDIT_RESPONSIVE_QUIESCENCE !== '0'`. `runAudit()` resolves
    `opts.responsiveQuiescence`/env once into `ctx.responsiveQuiescence`; `main()` stamps it
    onto the surface object (`s.responsiveQuiescence = ctx.responsiveQuiescence`) right next to
    the existing `s.occlusionQuiescence` line, reusing the exact "enrich the surface object"
    pattern `s.vpLabel` already established. Default ON. When OFF, `checkResponsive` takes NO
    wait of any kind before its reads — byte-equivalent to the pre-233 shipped behaviour, which
    is what leg B (the positive control) drives.
  - The `kind: 'static'` branch's `await page.waitForTimeout(400)` (was `audit-app.js:3642`) is
    replaced by the same `waitForQuiescence` call, gated by the SAME `s.responsiveQuiescence`
    switch (there is one switch, not one per call site — spec 233's own change item 2 language,
    "resolved once ... stamped onto the surface object", read as covering both call sites since
    they share the identical mechanism). On timeout it pushes a P2 advisory under a **new** check
    name, `quiescence` — see "Deviations" below for why a new name was used and why that is safe.
    When OFF, the exact pre-233 `page.waitForTimeout(400)` fallback runs, unchanged.
  - Zero-match advisory (change item 4): when `ctaSelector` matches zero elements,
    `checkResponsive` now pushes a P2 `responsive` finding (`"${ctaSelector} matched zero
    elements at ${s.width}px — ancestor-clip check has nothing to measure"`) instead of silently
    skipping the whole ancestor-clip leg — 231's "a check that cannot go red is not a check",
    generalised. This branch is NOT gated by the quiescence switch (it fires whether or not
    quiescence was awaited); this is deliberate, not an oversight — see "gap discovered" below,
    which found it firing for real on the real default rotation.
  - `checkResponsive` is now exported from `module.exports` (it previously was not), so the
    acceptance test can drive it directly against `page.setContent()` fixtures, the same
    precedent `checkOcclusion`'s own export set for 231.
- `test_audit_responsive_lens_reliability.js` — the detection-rate acceptance test (legs A/B/C
  against the real `pool-detail-360` surface via `runAudit()`, plus fixtures D/E for the two
  change-item-4/change-item-1 proofs).
- `package.json` — registered the new test in `test:serial`, immediately after
  `test_audit_occlusion_lens_reliability.js`.
- Nothing in `style.css`/`app.js`/`home.html`/`planner.js`/`PoolDetail.js`/`translations.js`
  touched. `git diff 86b998e599..HEAD --stat` (the commit immediately before this item's own
  three commits): only `audit-app.js` (+82/-4), `package.json` (+1/-1),
  `product-loop-kit/BACKLOG.md` (the pre-existing IN_PROGRESS status stamp, not written by this
  build), `product-loop-kit/specs/233.md` (the operator's spec, not written by this build), and
  the new test file.

## Deviations from the spec, and why

1. **Check name for the static branch's advisory: `quiescence` (spec's own open decision,
   resolved as instructed).** The spec text walked through several rejected options out loud
   (`responsive` is wrong for a text-only static branch with no CTA selector; `number-sanity`
   doesn't fit either) and landed on: "use check name **`quiescence`**... and add a one-line
   comment saying the name is new because no existing check owns 'the page never settled' outside
   the occlusion/responsive lenses" — plus "grep for a check-name allowlist first and extend it if
   one exists." I grepped for one (`grep -rn "check.*allowlist\|KNOWN_CHECK\|VALID_CHECK" test_*.js
   audit-app.js`, plus a scan of every `test_*.js` file that filters on `f.check ===`) and found
   **no enumerated allowlist of check names anywhere in the repo** — every test that reads
   `f.check` either matches a specific literal it cares about (e.g. `f.check === 'occlusion'`) or
   asserts the generic shape `typeof f.check === 'string' && f.check.length > 0`
   (`test_audit_768_lens.js`'s own findings-well-formedness assertion, which the new check name
   satisfies trivially). So there was nothing to extend — recorded here as the honest result of
   doing the grep the spec asked for, not skipped.
2. **The zero-match advisory (change item 4) is not gated by the quiescence switch.** The spec
   describes it as its own, independent fix ("A P2 advisory when `ctaSelector` matches **zero**
   elements. Today that branch skips the entire ancestor-clip check **silently**"), separate from
   change items 1-3's quiescence-wait class. Read literally, gating it behind
   `s.responsiveQuiescence` would mean a caller who turns quiescence off (the positive-control
   leg, or a future caller) also loses the "don't skip silently" guarantee for a completely
   unrelated failure mode — that reads as accidentally coupling two independent fixes, so it was
   NOT gated. Consequence, confirmed by the full-tick diff below: this surfaced a real,
   previously-silent finding on the live default rotation (`planner-768`'s `.gp-chip` selector
   matches zero elements) — see "Gap discovered," not glossed over.
3. **Fixture (E)'s HTML is not a byte-for-byte reuse of 231's `neverStabilisingGeometryFixture()`
   function body** — the spec says "copy `neverStabilisingGeometryFixture()` from the 231 test."
   The exact JS-driven monotonic-nudge mechanism (the `setInterval` growing `.bar`'s height,
   strictly monotonic so two samples can never coincidentally match) is copied verbatim,
   character-for-character, from 231's fixture. What's added on top is a permanently
   off-viewport `.cta` element (`position: relative; left: -9999px`), because unlike 231's
   occlusion fixture — whose `.bar`/`.victim` pair IS the real defect the "measure anyway"
   assertion needs — `checkResponsive` has no notion of occlusion at all, so the never-stabilising
   `.bar`/`.victim` pair alone gives `checkResponsive` nothing to report. The `.cta` addition is
   what makes "the real responsive finding is still reported (measure-anyway)" a provable
   assertion for this lens, exactly as spec change item 1 requires. Named
   `neverStabilisingResponsiveFixture()` in the test file to distinguish it from the (unused-here)
   pure copy.
4. **Fixture (D) uses a plain empty-CTA static page rather than reusing any 231 fixture** — spec
   change item 4 has no 231 precedent to mirror (231's occlusion lens never had a
   "selector matched nothing" branch), so this fixture is new, in the same
   `page.setContent()`/house style as every other direct-drive fixture in this file.

## Non-vacuity mutation matrix (Trap 3 — each condition neutered SEPARATELY)

All mutations run at `AUDIT_RELIABILITY_N=5` (cheap), `audit-app.js` restored via `cp` from a
pre-mutation copy and re-hashed after **every** mutation.

| Step | md5sum audit-app.js |
|---|---|
| Baseline (this item's shipped code, clean) | `9f1eaf3e5680f3c0218eed2a9d81fd3d` |
| M1 applied | `7e63c3643d1147c24b5aab2fef69e033` |
| M1 restored | `9f1eaf3e5680f3c0218eed2a9d81fd3d` ✓ byte-identical |
| M2 applied | `8c6310239a48a656ecc7456c240be10d` |
| M2 restored | `9f1eaf3e5680f3c0218eed2a9d81fd3d` ✓ byte-identical |
| M3 applied | `cd3fb365826d58f6ccb7098d187b320d` |
| M3 restored | `9f1eaf3e5680f3c0218eed2a9d81fd3d` ✓ byte-identical (final `diff` against baseline copy: empty) |

| Mutation | What was neutered | (A) | (B) | (C) | (D) | (E)-advisory | (E)-measure-anyway |
|---|---|---|---|---|---|---|---|
| none (baseline) | — | green | green | green | green | green | green |
| **M1** | `checkResponsive`'s own `waitForQuiescence` call short-circuited to `{reached:true, animCount:0, geometryChanged:false}` immediately (no real wait) | **RED** — 0/5, expected ≥5/5 | green (already low, unaffected) | green | green | **RED** (side effect — E's advisory is generated by the same call path M1 disables; not required to stay green by the spec, and it doesn't) | green — the real `.cta` defect is unconditional, still reported |
| **M2** | The zero-match `if (ctaCount === 0) { findings.push(...) }` branch's push removed (branch becomes a no-op) | green — 5/5 | green | green | **RED** — expected 1 advisory, got `[]` | green | green |
| **M3** | `checkResponsive`'s own "quiescence not reached" advisory push removed (the `waitForQuiescence` call itself is untouched, so timing/leg-A rate is unaffected) | green — 5/5 | green | green | green | **RED** — expected ≥1 advisory, got `[]` | green — the real `.cta` defect is still reported despite the advisory being silenced |

M1 turns leg A red (spec's stated requirement). M2 turns *only* fixture (D) red, legs A/B/C and
fixture (E) all stay green. M3 turns *only* fixture (E)'s advisory assertion red — its
measure-anyway assertion, fixture (D), and legs A/B/C all stay green. This is the isolation the
spec's own acceptance criterion demands: change item 4 (zero-match) and the "quiescence not
reached" advisory inside `checkResponsive` are each caught by a fixture the other mutation cannot
touch.

## Measured rates (N=20 for legs A/B, N=5 for leg C — the shipped default)

| Leg | Condition | Result | Requirement |
|---|---|---|---|
| A | quiescence ON + permanent defect (`.cta-button-primary{position:relative !important;left:-76px !important}` via `injectStyle` on `pool-detail-360`) | **20/20** flagged | ≥19/20 |
| B | quiescence OFF (`responsiveQuiescence:false`, pre-233 no-wait path) + same defect (positive control) | **0/20** flagged | ≤8/20 |
| C | quiescence ON + no-op `injectStyle` (non-vacuity) | **0** responsive findings across 5 iterations | 0 |

Leg B's 0/20 matches the operator's own pre-build measurement (0/10, "not sometimes — never") —
the shipped, un-instrumented `checkResponsive` genuinely never caught this defect before this item.
Leg A > Leg B holds (20/20 vs 0/20). All three legs' own assertions plus the A-vs-B comparison
passed on the final clean run (`AUDIT_RELIABILITY_N=20`, defaults). Mean wall-clock: leg A
3957ms/iteration, leg B 3922ms/iteration, leg C 3886ms/iteration (full `runAudit()` call each:
browser launch + server + snapshot read + the `pool-detail-360` surface render + `checkResponsive`
+ `checkOcclusion`).

Fixture (D) (zero-match `ctaSelector`) and fixture (E) (never-stabilising geometry, real
off-viewport `.cta` defect) both pass at the shipped code, as tabulated above.

## Cost measurement

Two measurements, per the spec's own instruction ("measure the per-surface wall-clock delta ...
via `runAudit`, and state the extrapolated per-83-surface-tick cost").

**(1) Per-surface, the 5 named `width<=768` surfaces `checkResponsive` actually runs on**
(isolated `runAudit({ only: [name], poolLiveness: false })` calls, `responsiveQuiescence` ON vs
OFF, same real unmutated pages):

| surface | ON | OFF | delta |
|---|---|---|---|
| `pool-detail-360` | 4727ms | 3813ms | **+914ms** |
| `grid-360` | 3793ms | 3724ms | +69ms |
| `landing-360` | 3584ms | 3598ms | −14ms |
| `planner-360` | 3438ms | 3076ms | +362ms |
| `plan-bloom-360` | 4253ms | 4172ms | +81ms |

Mean per-surface delta: **+282ms**. `pool-detail-360`'s own +914ms is close to the operator's
pre-build measurement of the surface's genuine settle time (~1200ms) minus the time the checks
preceding `checkResponsive` on that page (auditText, junk-slug, zero-yield-claim reads) already
spend, which independently lets some of the entry animation finish before `checkResponsive` is
even called — this is a plausible reading of why the other 4 surfaces show a much smaller delta
than a naive "0 to ~1200ms" estimate would predict, not a contradiction of the mechanism.

**(2) Full-tick, before/after on the same commit** (`runAudit()` with no `only` filter,
`poolLiveness:false` on both sides, default surface rotation — 82 `surfacesCovered` both times):

- BEFORE (`responsiveQuiescence:false`, reproduces the pre-233 path exactly): **313,022ms**
- AFTER (default, this item's fix ON): **313,656ms**
- **Delta: +634ms** across the whole tick.

Extrapolated against `DEFAULT_TIME_BUDGET_MS = 300,000ms`: this item's own addition is
**~0.2% of the budget**, far smaller than 231's measured ~1.4s/surface / ~2min/tick. Both the
BEFORE and AFTER full-tick runs independently already ran to ~313s — **over** the 300s budget —
but this is a pre-existing sandbox-speed characteristic, not something this item introduced: it
shows up identically in the BEFORE leg (`responsiveQuiescence:false`, i.e. the code path
byte-equivalent to what shipped before this item). Both `poolRotation.truncated` and every
`staticRotation.*.wrapped` flag read `false` in both runs' written findings JSON (checked
directly, not inferred) — the rotation guard did **not** silently truncate anything; the runner is
honest about its own budget state either way. Per the spec's own decision rule ("revert-candidate
if the tick cost pushes an 83-surface tick past `DEFAULT_TIME_BUDGET_MS` without the runner
reporting TRUNCATED honestly") — the runner DOES report truthfully (no false "clean" claim), so
this is not a revert-candidate; it's evidence this particular sandbox is simply slower than the
300s budget assumes, independent of this item.

## Full-tick finding diff (the acceptance criterion item 231 owed)

Same before/after runs as the cost measurement above, findings arrays diffed by
`(surface, viewport, check, severity, detail)`:

- **Missing (present before, gone after): 0**
- **Added (new after, absent before): 0**
- BEFORE total: 8 findings. AFTER total: 8 findings. **Identical sets.**

The delta being exactly zero additions (not just zero regressions) on the CURRENT default
rotation is consistent with the measured rates above: none of the 82 real, unmutated surfaces in
today's default rotation happen to carry an ancestor-transform-hidden responsive defect the way
the deliberately-injected `pool-detail-360` defect does — so there was nothing new for the fixed
lens to newly catch on this particular run of the real rotation. (The rotation is seeded/rotating
— a different `cycle`/pick would sample different surfaces; this run's own `poolRotation.picked`
and `staticRotation.*.picked` arrays are recorded byte-identically between BEFORE/AFTER, confirming
the same 32+4+2+4+2 surfaces were compared, not two different samples.)

## Gap discovered — and CORRECTED by the verifier (the notes had it wrong)

One of the 8 findings present in BOTH runs: `planner-768`, check `responsive`, P2 —
`".gp-chip matched zero elements at 768px — ancestor-clip check has nothing to measure"`. This is
change item 4's own zero-match advisory firing for real, on a real surface, in the default
rotation — not a fixture. Because the branch is unconditional (Deviation 2 above), it fired
identically with `responsiveQuiescence` ON and OFF.

**The build's first write-up of this was wrong and is struck here rather than quietly edited.** It
framed the cause as an open product question — *"is `.gp-chip` conditionally absent at 768px, or a
stale selector?"* — and left it at that. It is **neither**. The verifier read the adjacent code and
named the mechanism, which was fully discoverable without running anything:

- `audit-app.js:~3778` — the planner driver's backlog-164 interactive check **clicks the first
  `.gp-chip`** and waits for the flow to advance past the goal step. It is gated on
  `s.width > 360 && !s.ko`.
- `audit-app.js:~3804` — `checkResponsive(page, s, findings, '.gp-chip')`, gated on `s.width <= 768`.
- `planner-768` is the **only** surface where both gates fire: `planner` (1280) skips
  `checkResponsive`, `planner-360` skips the click, `planner-ko` skips both. Verified directly with
  Playwright: `.gp-chip` count is **24** before the click, **0** after.

So the harness's own prior click, inside the same driver, destroys the very selector it later
measures. This is **deterministic test-harness self-interference**, not a product signal and not an
ambiguity — and it means `checkResponsive`'s ancestor-clip leg has been measuring **nothing** on
`planner-768` since item 201 widened the check to 768px. The P2 will now fire on **every future
tick, forever**. (Note also that 164's own comment claims the click is "scoped to the 1280/EN
surface only" — that stopped being true when 201 added the 768 surfaces, and nobody noticed,
because the check it broke was silent by construction.)

Not fixed here: reordering a surface driver is a behaviour change to the scanner beyond this item's
"smallest change" scope. **Filed as backlog 235** (renumbered from 234 at merge time — a concurrent heartbeat claimed 234 on `main` for agentic commerce while this built; `main`'s ids win, per the 230/231 precedent) with both acceptable outcomes named (reorder so
`checkResponsive` runs before the state-advancing click, or accept it as permanent expected noise
and say so where the finding is emitted). What this item ships is the advisory that made a
years-silent hole visible at all — which is the point of change item 4.

## Existing tests — all green

| File | Result |
|---|---|
| `test_audit_app.js` | 3/3 passed (clean run on the real, unmutated `pool-detail`/`dead-pool` surfaces: zero P0/P1, unaffected by this item's changes) |
| `test_audit_768_lens.js` | 12/12 passed (all five `checkResponsive` call sites still read `s.width <= 768`, unchanged) |
| `test_audit_runner.js` | 9/9 passed |
| `test_test_registry.js` | 5/5 passed (confirms `test_audit_responsive_lens_reliability.js` is correctly registered in `test:serial` — no orphans, no ghosts, no duplicates) |
| `test_run_tests.js` | 26/26 passed |
| `test_audit_occlusion_lens.js` | 24/24 passed (231's lens untouched by this item) |
| `test_audit_responsive_lens_reliability.js` (this item's own acceptance test) | 9/9 passed at the shipped default (N=20/20/5) |

None of these were red on `main`/this branch before this item's changes — all were run against the
already-clean baseline first (the mutation-matrix restores above independently reprove
`audit-app.js`'s byte-identity to that baseline after every experiment).

## What could NOT be done / honest gaps

- **The full-tick "before" leg is not literally the pre-233 shipped code** — it is this item's
  own shipped code with `responsiveQuiescence:false`, which reproduces the pre-233 *behaviour*
  exactly (byte-equivalent, per Deviation/change-item-2's own guarantee) but is not a checkout of
  a prior commit. This is the same interpretation 231's own acceptance work used implicitly and is
  what the spec's phrasing ("before and after **on the same commit**") calls for; noted so the
  distinction is explicit rather than assumed.
  Both full-tick runs used `poolLiveness:false` (deterministic snapshot-only, no live network
  dependency) — a real, live-network full tick was not additionally run, matching every rate leg's
  own choice (`poolLiveness:false`) for the same determinism-over-realism reason.
- **The 5-surface cost measurement and the full-tick diff were run sequentially, not
  concurrently with the mutation matrix** — no cost/diff numbers were captured mid-mutation
  (e.g. "cost while M1 is applied"); only the shipped, clean code's cost was measured, which is
  what the spec's cost criterion asks for.
- No product file was touched, verified twice: `git diff --stat` at the time of the change (clean
  working tree, nothing but `audit-app.js`/`package.json`/`test_audit_responsive_lens_reliability.js`
  staged) and again via `git diff 86b998e599..HEAD --stat` against the pre-item commit once this
  item's own commits existed on the branch — both show zero touches to
  `style.css`/`app.js`/`home.html`/`planner.js`/`PoolDetail.js`/`translations.js`.
- **Unplanned observation from the build agent, RESOLVED by the operator — not an anomaly:**
  partway through the build, `git log` showed three commits already on `claude/loop-233` (and on
  `origin/claude/loop-233`) matching this item's work (spec / fix / test), despite the build agent
  never invoking `git commit` or `git push` itself. **Those commits were the operator's**, made
  while the agent was still running: this session's stop hook flags any uncommitted or untracked
  file at every turn boundary, so rather than leave the branch holding a subagent's in-flight work
  across many turns, the operator committed each artifact as it became complete and
  syntactically valid (`f0498a1ab1` spec, `8c1cc0034c` implementation, `9bf5a6ce44` test). Nothing
  automatic or environmental was involved. The build agent was right to flag it rather than
  silently accept an unexplained write to its own branch — that instinct is correct and should be
  kept; the explanation simply lands outside its context. **Process note for the next run:** the
  2026-07-13 "docs ship in the same commit as the code" rule was still honoured (the spec landed
  FIRST, ahead of the code it describes), but this item ships as **four commits rather than one**,
  which is a deviation from the single-commit shape items 226/231 used. If the stop hook stays in
  place, either brief the build agent that the operator commits underneath it, or have the agent
  work in a git worktree so the branch stays untouched until it reports.
