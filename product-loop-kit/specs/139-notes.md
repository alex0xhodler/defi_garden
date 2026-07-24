# 139 — build notes (deviations & conservative choices)

## Deviations from spec / from docs/strategy-2026-07-23-pretraffic-bets.md's Bet A description
- **`analytics.js` `trackPoolClick` adaptation (spec-authorized, same pattern as item 125's
  `ctaPlacement`).** The third arg is named `context` and does NOT spread generically into the emitted
  event — it cherry-picks specific keys. Added one additive line: `archetype: context.archetype || null`.
  `source` unchanged; no rename; north-star `source` filter unaffected; `archetype` is a new,
  always-null-unless-`plan_checkout` segmentation field.
- **Waitlist-modal copy for TARGET/GROWTH uses ONE honest key pair, not per-goal-personalized text.**
  The brief said "references growing toward their goal" — interpreted as a generic-but-honest reference
  ("growing toward your goal") rather than interpolating the literal goal label into the sentence. Tried
  interpolating `goalLabel(t, goal)` first (e.g. "toward your iPhone goal") but several goal labels
  don't sit grammatically inside that frame in either language ("A home" already carries its own
  article; KO labels vary in trailing consonant, which changes the required particle — 을/를 — and no
  existing string in translations.js does the "을(를)" literal-both-particles workaround, so introducing
  one here would be a new, unreviewed convention). Kept the sentence generic instead — still satisfies
  "references growing toward their goal," stays grammatically correct in both languages, no new pattern
  invented. `waitlistBenefitsEarlyAccess` therefore takes no arguments.
- **Pitch-variant (A/B/C) system left untouched for TARGET/GROWTH.** The existing `pitchKey()` A/B/C
  copy-test machinery only applies to the SUBSCRIPTION waitlist framing (`?pitch=b/c` URL param); the
  new TARGET/GROWTH early-access copy is a single variant, no A/B — out of scope per YAGNI (the brief
  didn't ask for early-access copy variants, and it's a demoted secondary CTA, not the primary
  conversion lever being tested).
- **Gated the pre-existing `waitlistGarden` subscription-mix line to `archetype === 'subscription'`**
  inside the waitlist modal (previously gated only on `currentMixStats.count > 0`, which could be
  nonzero for TARGET goals due to the `mixStats`/`GOALS[].target` field-reuse quirk documented in
  specs/139.md's Territory notes). This is a minimal, directly-in-scope fix — the SAME modal, the SAME
  class of goal-incoherent-copy bug this bet exists to fix — not a new feature. The deeper root cause
  (mixStats misreading a TARGET price as a monthly cost) is NOT fixed here; flagged as a follow-up task
  (see below) since fixing it properly means either renaming the shared `target` field across ~5 call
  sites or adding an archetype guard inside `mixStats` itself, and auditing whether the mix-seeding
  effect should even run for non-subscription archetypes — a larger, separate change.
- **`npm install` run** before minify because `node_modules` was absent in the fresh worktree (same gap
  every recent item's notes document, e.g. 125/128/136).

## Conservative choices
- Reused `.gp-share-textlink` verbatim for the demoted secondary CTA (adds a second, purely semantic
  `gp-checkout-waitlist-secondary` class for test/future-styling hooks — zero new CSS rules; `git diff
  --stat planner-styles.css` is empty).
- Reused `.gp-primary-cta gp-checkout-cta` verbatim on the new `<a>` element — no new button variant,
  no new visual style. `.gp-checkout-panel`'s existing `display:flex; flex-direction:column; gap` rule
  absorbs the extra secondary-link child with zero new layout rules needed.
- Left the SUBSCRIPTION branch's waitlist-open handler and modal-title/benefits call byte-identical in
  substance (extracted into a shared `openCheckoutWaitlist()` function used by both the SUBSCRIPTION
  primary button and the TARGET/GROWTH secondary link, but the SUBSCRIPTION code path's actual behavior
  — same state updates, same `trackWaitlistOpened` call with the same args — is unchanged).
- Did NOT touch `home.html`/`plan.html`'s script tags (which currently load raw `planner.js` instead of
  `planner.min.js` — a pre-existing gap, confirmed identical on unmodified origin/main via `git stash`).
  Out of scope for this bet; also risks the analytics.js-load-order off-limits rule if touched carelessly.

## Follow-up flagged (not built here)
Spawned a background-task suggestion: `mixStats()` (planner.js ~276) reads `GOALS[].target` as a
monthly subscription cost, but TARGET-archetype goals use the same field for a one-time item price
(e.g. iphone target=1100 = $1,100 total, not $1,100/mo). The mix-seeding effect
(`if (!mixTouched && apy > 0 && goal) setSelectedSubs([goal])`, planner.js ~1680) runs for every
archetype, so a TARGET goal ends up in `selectedSubs` and `mixStats` computes a nonsensical
"forever capital" figure from it. This item's fix (gating the modal's `waitlistGarden` line to
`archetype === 'subscription'`) hides the symptom everywhere it's currently rendered, but the
underlying miscalculation still happens silently and would resurface if any future UI reads
`currentMixStats.neededCapital`/`combinedMonthly` without an archetype guard.

## Test results (verbatim from build)
- **TDD proof — RED before GREEN.** `git stash` the 3 modified source files (planner.js/
  translations.js/analytics.js), ran `test_plan_checkout_cta.js` against the unmodified origin/main
  checkout: **4/13 passed** (only the SUBSCRIPTION-unchanged assertions [3] + the empty-pool-list
  fallback assertion [1], which describe pre-existing behavior that this item doesn't change; the other
  9 — pool-primary CTA rendering/href, secondary link presence, `pool_click(source=plan_checkout)`
  firing, and archetype-branched modal copy — failed as expected, since none of that existed yet).
  `git stash pop` restored the implementation; regenerated `planner.min.js`/`translations.min.js` (the
  first post-restore run failed one assertion — `t('startGrowingCta', ...)` key-echoed instead of
  interpolating — because `plan.html` loads `translations.min.js`, which was still stale; regenerating
  fixed it). Full rerun: **13/13 passed**.
- `test_plan_checkout_cta.js`: 13/13 passed, exit 0.
- `test_planner.js`: 208/208 assertions passed (pure-logic tests — planner.js's helper functions
  untouched by this item's UI-layer diff).
- `test_northstar_cta_fires.js`: 7/7 passed — no regression on the existing north-star
  `garden_cta`/`protocol_link` instrumentation (this item's `analytics.js` change is additive-only).
- `test_search.js`: 20/20 passed — no regression.
- `test_repeat_cta.js`: 5/5 passed — no regression (spot-checked since it also exercises
  `trackPoolClick`'s `context` handling, which this item touched).
- `test_translations_fallback.js`: 8/8 passed, incl. `planner.min.js == a fresh minify of planner.js`
  (idempotent regen confirmed).
- `test_minified_assets.js`: 7/9 assertions passed. The 2 reds ("home.html does not load
  translations.min.js", "plan.html still loads raw planner.js") are PRE-EXISTING — confirmed identical
  via `git stash` on the unmodified origin/main checkout before any of this item's changes existed
  (same 2 reds, same messages). Diff-independent; documented in prior items (e.g. 125-notes.md,
  136-notes.md) as a known structural gap, not introduced or worsened here. This item's own two
  regenerated files pass their freshness check (`planner.min.js is byte-identical...`,
  `translations.min.js is byte-identical...`).
