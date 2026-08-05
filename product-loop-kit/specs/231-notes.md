# Item 231 — build notes

## Verifier attempt 1 — FAIL, and the fix (2026-08-05)

The verifier's own mutation-testing pass (`playbooks/detector-detection-rate.md` "Trap 3": neuter each
condition of a compound gate SEPARATELY, never together) found that fixtures (D)/(E) alone did not
prove `waitForQuiescence`'s **animation-count leg** load-bearing:

- **M1** (whole `waitForQuiescence` short-circuited to `{reached:true}` immediately) → RED across the
  suite, as expected.
- **M3** (geometry leg neutered — `lastGeometryChanged` forced `false`) → legs A/B/C stayed green, but
  fixture **(E) went RED** (its "quiescence not reached" advisory disappears, since with the geometry
  leg neutered `reached` becomes `animCount === 0` alone, and (E)'s fixture is deliberately
  CSS-animation-free so `animCount` is already 0 there). So the geometry leg WAS proven load-bearing.
- **M2** (animation leg neutered — `quiescenceSampleEval`'s `animCount` forced to always return `0`) →
  **everything stayed GREEN, 9/9**, at N=8 and N=10. Root cause: `.pool-card.animate-on-mount` uses
  `fadeInUp` (`style.css:4568-4578`, `transform: translateY(20px)->0`), which moves the card's own
  `getBoundingClientRect()` for the whole animation — so on the real `dead-pool` fixture (legs A/B/C)
  the GEOMETRY leg alone gates correctly and masks a completely dead animation leg. Fixture (D) only
  exercises the `iterations:Infinity` EXCLUSION (never `animCount > 0` gating anything — an excluded
  effect never counts either way), and fixture (E) is deliberately CSS-animation-free by design, so
  its `animCount` is already 0 regardless of the mutation.

**Fix: added fixture (F)**, isolating the animation-count leg independent of geometry — a
`page.setContent()` page whose overlay (`.bar`, fixed) and victim (`.victim`, a paragraph occluded
from the first frame) have COMPLETELY STATIC geometry for the page's entire lifetime, while a real,
FINITE (non-infinite), opacity-only CSS animation (`.pulser`, `animation: pulse 1500ms linear 1
forwards`) runs for longer than the budget passed. `.pulser` is positioned off-screen
(`top/left: -9999px`), carries no text and no interactive role, so it is excluded from the geometry
signature by construction (not fixed/sticky -> never an overlay; outside the viewport -> filtered out
of the candidate-victim scan too) — only `document.getAnimations()` can ever see it running. (F) drives
`waitForQuiescence()` **directly** (not through `checkOcclusion`, for the cleanest isolation) and
asserts, mid-animation: `reached === false`, `animCount >= 1`, **and `geometryChanged === false`** —
the last one is what proves a red here cannot be explained by the geometry leg — then, post-animation:
`reached === true`; then runs `checkOcclusion` on the same page and confirms the real occlusion is
still reported (measure-anyway holds here too).

**Re-proof, this attempt:**

| Mutation | (D) | (E) | (F) mid-animation | Legs A/B/C |
|---|---|---|---|---|
| none (baseline) | green | green | green | green |
| M2 (animCount forced 0) | green | green | **RED** — `got {"reached":true,"animCount":0,"geometryChanged":false}`, expected `reached:false` | green |
| M3 (geometryChanged forced false) | green | **RED** — advisory disappears | green | green |

M2 and M3 each turn exactly one fixture red and leave the other (plus the real-surface legs) green —
the two legs of the compound gate are now each caught by a fixture the other does not cover.
`md5sum audit-app.js` before any mutation: `31f16b3ee21a0b4b0137377166db3382` (matches the verifier's
recorded baseline). After the M2 mutation, restored via `cp` from a pre-mutation copy and re-hashed:
`31f16b3ee21a0b4b0137377166db3382` — byte-identical. Same restore-and-rehash after M3:
`31f16b3ee21a0b4b0137377166db3382` — byte-identical. `waitForQuiescence`'s logic itself was not
touched; the fix is proof-only (a new fixture in the test file).

## What shipped

- `audit-app.js`:
  - `quiescenceSampleEval(args)` — self-contained (Playwright `toString()`-serialised) per-sample
    collector: counts running CSS animations/transitions excluding `iterations === Infinity` effects
    (guarded behind `typeof document.getAnimations === 'function'`), and builds a geometry signature
    string from the rounded rects of every visible fixed/sticky overlay plus every occlusion
    candidate victim (same interactive-or-text-bearing gate `occlusionPassEval` uses, minus the
    hit-test).
  - `waitForQuiescence(page, budgetMs)` — polls (via the existing `pollFor` helper, not a hand-rolled
    loop) until two consecutive samples ≥`OCCLUSION_QUIESCENCE_SAMPLE_GAP_MS` (100ms) apart show
    `animCount === 0` and identical geometry. Bounded by `budgetMs`; on timeout returns
    `{reached:false, animCount, geometryChanged}` so the caller can advise with real numbers.
  - `checkOcclusion` calls `waitForQuiescence` before EACH of its two passes (replacing the old flat
    `await page.waitForTimeout(150)` before pass 1; added fresh before pass 2's own measurement).
    Push a P2 `occlusion` finding naming the numbers on timeout, then measures anyway either way.
  - Kill switch: `s.occlusionQuiescence !== false && process.env.AUDIT_OCCLUSION_QUIESCENCE !== '0'`.
    `runAudit()` resolves `opts.occlusionQuiescence`/env once into `ctx.occlusionQuiescence`, and
    `main()` stamps it onto the per-surface object (`s.occlusionQuiescence = ctx.occlusionQuiescence`)
    the same way it already sets `s.vpLabel` — see "Deviation 1" below for why.
  - `opts.injectStyle` — threaded the same way (`ctx.injectStyle`), applied via
    `page.addStyleTag({content})` immediately after both of `main()`'s `page.goto(...)` call sites
    (the `loading`-kind branch's own `goto` and the shared one every other kind uses), wrapped in
    `try/catch` so a page that navigated away never throws.
  - New constants `OCCLUSION_QUIESCENCE_BUDGET_MS = 3000`, `OCCLUSION_QUIESCENCE_SAMPLE_GAP_MS = 100`,
    exported alongside `waitForQuiescence` (item-159 rule).
- `test_audit_occlusion_lens_reliability.js` — the detection-rate acceptance test (legs A/B/C against
  the real `dead-pool` surface via `runAudit()`, plus fixtures D/E/F for budget honesty — F added in
  response to the verifier's attempt-1 finding, see below).
- `package.json` — registered the new test in `test:serial`, immediately after
  `test_audit_occlusion_lens.js`.
- Nothing in `home.html`/`style.css`/`app.js`/`PoolDetail.js`/any other product file touched.
  `checkResponsive` (backlog 233 — renumbered from 232 after a concurrent heartbeat claimed 232 on `main`)
  untouched, as scoped.

## Deviations from the spec, and why

1. **`checkOcclusion`'s signature could not gain a 4th parameter.** The spec's own "reach it the same
   way `opts.poolLiveness`/`opts.only` are threaded" leaves room for either "as a parameter" or "via
   the surface object", but `test_audit_occlusion_lens.js` (pinned green by the acceptance criteria)
   asserts the literal source string `function checkOcclusion(page, s, findings)` — a 4th parameter
   would fail that regex and break a test explicitly required to stay green. Conservative choice:
   `runAudit()` resolves the kill switch once and carries it through `ctx` (the same vehicle
   `ctx.protocolUrlsPath` already uses to reach `main()`), and `main()` stamps it onto `s`
   (`s.occlusionQuiescence = ctx.occlusionQuiescence`) — the exact pattern `main()` already uses for
   `s.vpLabel`. `checkOcclusion` reads `s.occlusionQuiescence` plus `process.env.AUDIT_OCCLUSION_QUIESCENCE`
   directly, so both opts- and env-driven kill switches work, and every existing direct-call test site
   (which passes a hand-built `s` without this field) gets the default (`undefined !== false` → ON).
2. **Advisory wording extends the spec's example.** The spec's example text is `quiescence not reached
   in Nms: A animations still running, geometry still changing`. Shipped wording adds the viewport
   (matching every other `occlusion` P2's own convention), a pass label (`at-rest pass` /
   `bottom-of-scroll pass` — needed because both passes can independently time out on the same
   surface and a reader must be able to tell them apart), and a trailing `— measuring anyway` (states
   the budget-honesty guarantee explicitly rather than leaving it implicit). All the numbers the spec
   names are present verbatim.
3. **The quiescence sample never short-circuits on `animCount > 0`.** An earlier design returned
   `false` immediately once the first of the two samples showed a running animation, skipping the
   second geometry sample entirely. Rewritten to always take both samples (100ms apart) every poll
   iteration regardless of animation state, so the P2 advisory (on timeout) always has a real
   `geometryChanged` value to report, not a stale one from whichever branch happened to short-circuit
   last. Costs a minimum ~100-150ms per `waitForQuiescence` call even on an already-quiescent page
   (previously a single fast animation check could exit sooner) — judged worth it for honest advisory
   numbers over the small extra latency.
4. **`quiescenceSampleEval`'s overlay selection omits the `bottomAnchor` exclusion**
   `occlusionPassEval`'s bottom-of-scroll pass uses (excluding overlays not anchored to the viewport
   bottom). The geometry signature is taken identically before EITHER pass — an overlay that would be
   excluded from a bottom-of-scroll *measurement* still matters for "has anything on screen moved",
   so including it in both signatures is the weaker, more conservative predicate (never a source of a
   missed instability, only possibly of a few extra poll iterations on a page whose top header is
   independently still settling).
5. **Positive control (leg B) measured 0/20 across this build's own two independent runs, not the
   historically-observed ~15-20% — but the verifier's own independent N=20 re-run measured 1/20.**
   221's own evidence: 3/20 (15%); this item's own pre-build re-measure: 2/10 (20%); this build's two
   own full runs: 0/20 and 0/20; the verifier's independent re-run: **1/20**. All five measurements sit
   comfortably inside the required `<=8/20` bound and all are strictly below leg A's rate (the required
   A>B comparison holds in every one of them). The verifier's 1/20 nudges the reading toward
   **sample-size variance** as the primary explanation (0-3 hits out of 20 at a true ~15-20% rate is
   well within a binomial's normal spread — a 1/20 draw from that same distribution is unremarkable)
   over "the 1280px `dead-pool` surface's own control measures something structurally different from
   221's 360px case." Both readings remain plausible and are not mutually exclusive (surface-dependent
   stagger timing could shift the true rate somewhat while sampling variance still dominates which
   exact count any given N=20 draw lands on) — recorded with all five numbers on the record rather
   than collapsed into a single restated claim.

## Measured rates (N=20 for legs A/B, N=5 for leg C — the shipped default; this run is the
## post-fixture-(F) re-run, after the verifier's attempt-1 finding)

| Leg | Condition | Result | Requirement |
|---|---|---|---|
| A | quiescence ON + permanent defect (`injectStyle` mutating away item 230's fix) | **20/20** flagged | ≥19/20 |
| B | quiescence OFF (`occlusionQuiescence:false`) + same defect (positive control) | **0/20** flagged (this build's runs; verifier's independent re-run: 1/20 — see Deviation 5) | ≤8/20 |
| C | quiescence ON + no-op `injectStyle` (non-vacuity) | **0** occlusion findings across 5 iterations | 0 |

Budget-honesty fixtures (direct `checkOcclusion()`/`waitForQuiescence()` calls, `page.setContent()`):
- **(D)** infinite CSS animation (opacity-only pulse, `iterations: Infinity`, geometry never moves):
  completed well under the 3000ms budget, **zero** "quiescence not reached" advisories — confirms the
  infinite-effect exclusion works and such a fixture can never itself cause a hang.
- **(E)** JS-driven (never a CSS animation — `document.getAnimations()` is blind to it) perpetually
  growing fixed-bar height, occluding a real paragraph: **advised** "quiescence not reached" naming
  both numbers (elapsed ms, animation count) at P2, **and** still reported the real P1 occlusion
  finding for the covered paragraph — proves "measure anyway." Proven load-bearing for the GEOMETRY
  leg specifically by the M3 mutation (see verifier section above): goes RED when the geometry leg is
  neutered, green otherwise.
- **(F)** (added in response to verifier attempt 1) real, finite, opacity-only CSS animation running
  off-screen (excluded from the geometry signature by construction) over a page with completely static
  overlay+victim geometry from the first frame: mid-animation, `waitForQuiescence(500ms)` returned
  `reached:false, animCount:1, geometryChanged:false`; post-animation (after the real 1500ms duration
  elapsed), returned `reached:true`; `checkOcclusion` on the same page still reported the real
  occlusion. Proven load-bearing for the ANIMATION-COUNT leg specifically by the M2 mutation: its
  mid-animation assertion goes RED when `animCount` is forced to 0, green otherwise — and unaffected by
  M3 (geometry neutering), since its own gate never depends on the geometry leg.

## Wall-clock

- `test_audit_occlusion_lens_reliability.js` total run, post-fixture-(F) (N=20/20/5 + all three
  fixtures D/E/F): **174.6s** internal (`time node test_audit_occlusion_lens_reliability.js` measured
  **2m55.1s** real, including Node startup/require overhead outside the file's own internal timer) —
  inside the 5-minute foreground timebox with headroom. (Pre-(F) run for reference: 176.2s / 2m56.8s —
  fixture (F) adds negligible wall-clock, ~2.5s, since its mid-animation budget is a small 500ms and
  its post-animation wait is a fixed 1700ms.)
- Leg A (quiescence ON) mean: **4407ms/iteration** (full `runAudit()` call: browser launch + server +
  snapshot read + the `dead-pool` surface render + both occlusion passes).
- Leg B (quiescence OFF, pre-231 path) mean: **3143ms/iteration**, same scope.
- **Per-surface delta this item adds: ~1200-1400ms** on the `dead-pool` surface specifically,
  measured directly with a focused benchmark isolating `checkOcclusion()` alone (10 repeated fresh
  navigations, quiescence ON vs OFF, same real unmutated page, no `runAudit()` overhead in the
  timing): **1589ms mean with quiescence ON vs 375ms mean with the flat 150ms path — a ~1214ms
  delta.** This is not overhead in the wasteful sense: `dead-pool`'s alternatives grid stacks up to
  10 `.pool-card.animate-on-mount` entries with per-card staggered delays
  (`--entry-delay-base * 4 + --entry-delay-stagger * (n-1)`, i.e. up to `400ms + 450ms = 850ms` delay
  before the last card's own `400ms` fade-in duration even starts), so the *genuine* settle time for
  this specific surface is close to **1250ms** — the old 150ms settle was measuring roughly 8x too
  early, which is exactly the mechanism 231's diagnosis names. Surfaces with fewer staggered
  `.animate-on-mount` elements (most static pages, the grid pages with the header/search/results
  sections only) will see a smaller delta; this number should not be read as a flat per-surface tax
  across the whole 83-surface tick.

## Acceptance criteria not satisfied

None. All checkboxes in specs/231.md's "Acceptance criteria" section are met, plus the verifier's
attempt-1 mutation-proof requirement (each leg of the compound quiescence gate caught by a fixture the
other does not cover):
- Detection rate (not a single green run): leg A 20/20 ≥ 19/20. ✓
- Positive control: leg B 0/20 (this build) / 1/20 (verifier's independent re-run) ≤ 8/20, strictly
  below leg A in every measurement. ✓
- Non-vacuity of the injection: leg C 0 findings / 5 iterations. ✓
- No false positives: `node test_audit_occlusion_lens.js` — 24/24 passed, unchanged from pre-231. ✓
- Budget honesty: fixtures D (no hang, no advisory), E (advises + still measures), and F (isolates the
  animation leg: false/animCount>=1/geometryChanged:false mid-animation, true post-animation, still
  measures) all pass. ✓
- Each leg of `waitForQuiescence`'s compound gate independently proven load-bearing: M2 (animCount
  forced 0) turns ONLY (F) red; M3 (geometryChanged forced false) turns ONLY (E) red; legs A/B/C stay
  green under both mutations (masked by the real surface's own `fadeInUp` transform, which is exactly
  why (F) had to be a dedicated fixture rather than relying on the real surface). `audit-app.js`
  restored byte-identical after each mutation (md5 `31f16b3ee21a0b4b0137377166db3382`, matching the
  verifier's recorded baseline, both times). ✓
- Population, not instance: legs A/B/C drive the real `dead-pool` surface through the real
  `runAudit()` driver; the assertion is `>=1 blocking occlusion finding`, never a specific rect or
  alternative pool. ✓
- Wall-clock: printed by the test, recorded above with the delta. ✓

## Other verification run

- `node test_dead_pool.js` — 12/12 passed (unaffected; drives its own independent Playwright flow
  against `home.html`, never touches `audit-app.js`).
- `node test_audit_app.js` — 3/3 passed (clean run's occlusion assertions — zero on every
  non-quarantined surface including `dead-pool` and every `pool-detail*` surface — hold unchanged on
  the real, unmutated `data/pools-snapshot.json`).
- `node test_test_registry.js` — 5/5 passed after registering the new file in `package.json`'s
  `test:serial` (browser lane, verified via `node run-tests.js --list --lane=browser`).
- `test_audit_occlusion_lens_reliability.js` itself, final full-default run after adding fixture (F):
  **13/13 passed** (N=20/20/5), `audit-app.js` unmodified from baseline for this run.
