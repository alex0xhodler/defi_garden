# 099 — build notes

## What shipped
Single-line logic change in `planner.js`: dropped the `!mixTouched` early-return (and the `mixTouched` dep)
from the `slideCapital`⇄`currentMixStats.neededCapital` sync effect (was ~L1529, now ~L1537 after the
expanded comment), so the subscription checkout hero card, headline and forever line share one source of
truth from the initial seed on — not only after the user touches the mix. Regenerated `planner.min.js`.
Added `test_hero_number_consistency.js` (rendered Playwright) and wired it into the `npm test` chain.

## Deviations from spec
None material. The spec proposed dropping the gate; that is exactly what shipped.

## Conservative choices
- **State-level sync, not a `chkBaseCapital`-only patch.** I fixed the ROOT (`slideCapital` being stale)
  rather than only re-pointing the hero card at `neededCapital`. Reason: the strip (planner.js:2758) and the
  make-it-yours summary (2828) also read `slideCapital`; a hero-only patch would have left THOSE showing the
  stale seed — a new inconsistency. Syncing `slideCapital` fixes all `slideCapital` consumers at once and
  keeps the capital slider functional.
- **Left `chkBaseCapital` untouched.** It reads `slideCapital`, which is now correct; touching it as well
  would be redundant and could decouple the hero from the (still-functional) capital slider.
- **No translations change.** The fix adds/alters no user-facing string, so EN/KO stay as-is (both already
  correct). Confirmed no new `t('…')` keys.

## Accepted, intentional behavior (not a regression)
If the user expands "Make it yours" and drags the capital slider to a custom amount, `slideCapital` moves off
`neededCapital` while the headline/forever line stay on `neededCapital` (the minimum-to-cover / forever
number for the picked subs). This is an explicit user override of their deposit, not the reported bug — the
bug is the DEFAULT/untouched state, which now shows one consistent number across all three surfaces. The
sync effect is keyed on `neededCapital` (not `slideCapital`), so a slider drag does not refire it.

## Verification (timeboxed; 5-min/job cap honored)
- `test_hero_number_consistency.js` — 2/2 PASS on the fixed build; 0/2 FAIL (hero never converges,
  waitForFunction timeout) on a stash-baseline pre-fix build. Mutation-proven.
- Canonical NORTH_STAR Test line: `test_planner.js` (208 assertions), `test_protocol_parsing.js` 9/9,
  `test_qualifier_fix.js` 9/9 — all green.
- Adjacent same-page rendered tests: `test_subscription_mix_seed.js` 4/4, `test_hero_copy.js` 4/4,
  `test_waitlist_microcopy.js` 6/6 — all green. `test_minified_assets.js` 9/9 (plan.html/home.html load
  the min).
- `test_waitlist_funnel.js` + `test_waitlist_pitch.js` FAIL — **pre-existing & environmental**, NOT a
  regression: both fail IDENTICALLY on the stash-baseline pre-fix build (the sandbox blocks the formspree
  submission POST, so `waitlist_submitted`/`waitlist_error` never fire — consistent with the NORTH_STAR
  2026-07-12 "browser-originated HTTPS blocked at the proxy" note). Diff-independent of this change.

## Follow-up candidates (NOT built this run — one-item rule)
- The seed at planner.js:3863 still computes `capital` at `guidanceApy`; the bloom now corrects it, but the
  seed rate remains the source of the transient pre-load figure. A future item could seed at (or defer to)
  the live rate to remove the transient entirely. Low priority — the bloom sync now masks it.
