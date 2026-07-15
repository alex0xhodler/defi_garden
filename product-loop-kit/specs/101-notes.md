# 101 build notes — deviations & conservative choices

Item: subscription share link must reproduce the full multi-service mix (`selectedSubs`), not just the anchor `goal`.
Build loop 2026-07-15. Product code authored by dispatched Opus coding agent per the 2026-07-13 execution-model standing decision.

## Decisions locked before build (spec + blindspot pass)
- Pure serialization gap: the mix (`selectedSubs`) is already modeled + stored (planner.js:1767/1795); only the wire format is missing. Encode `mix` on `encodePlanToUrl`, decode+validate+seed on arrival with `mixTouched=true`.
- Regression guard: single-pick / anchor-only / non-subscription URLs stay byte-identical (no `mix` param) — no share-URL churn.
- Honest degradation: unknown/garbage mix ids dropped, fall back to valid remainder or anchor `[goal]`, never crash, `error_occurred` must not fire.
- Trust rails + 099 capital/coverage consistency untouched — this only restores WHICH services, not any number.

## Deviations from spec
- Seeded `selectedSubs`/`mixTouched` from the decoded mix via the INITIAL `useState`
  value (Bloom, planner.js ~1501) rather than a first-mount effect near the 1506
  anchor-seed effect. Reason: an effect that calls `setMixTouched(true)` cannot win
  a same-commit race against the existing anchor-seed effect (which reads the stale
  `mixTouched=false` in the same effect flush and would clobber the restored mix).
  Initializing the state directly makes `mixTouched=true` before first render, so
  the `!mixTouched`-guarded anchor effect never fires. Same seam the spec intended
  (seed + mixTouched=true, anchor-seed preserved for the no-mix case), race-free.
- `encodePlanToUrl` takes a single trailing `mixIds` array param (I pass
  `selectedSubs`) and computes `goalArchetype(goal) === 'subscription'` internally,
  instead of also threading `archetype`. archetype is a pure function of `goal`
  which the encoder already has, so a second param would be redundant.

## Conservative choices
- Encode regression guard is exact: `mix` is written ONLY when the goal is a
  subscription AND the mix is not the bare `[goal]` anchor (`length===1 && [0]===goal`).
  Anchor-only, single-pick, and ALL non-subscription URLs `delete('mix')` → stay
  byte-identical to pre-101 (verified by test (a-guard)).
- Decode wraps `mix` parsing in try/catch and validates every id through a new
  `isSubscriptionId` helper (SUBSCRIPTION_LADDER rungs + subscription-archetype
  GOALS). Unknown/garbage ids are dropped; if none remain, `mix: null` → anchor
  fallback. Never throws on a hand-edited URL (guards `trackShareLinkOpened` /
  error_occurred). No dedupe / order-normalization — order is preserved verbatim
  so the round-trip is faithful.
- Threaded the decoded mix through the SAME prop path as 060's `initialChain`/
  `initialToken`: `decodePlanFromUrl` → `sharedPlan.mix` → `initialMix` prop on the
  Bloom instantiation (~4407). No new plumbing pattern introduced.
- Trust rails and the 099 slideCapital⇄neededCapital sync untouched: `mixTouched=true`
  on a restored mix is exactly what lets `currentMixStats.neededCapital` recompute
  coverage from the full mix (verified — restored $50/mo mix, not the $20 anchor).
- Only `planner.min.js` changed on `npm run minify`; the other bundles rebuilt
  byte-identical. No translations touched (zero new user-facing strings).

## Process note (run context)
This run first raced item 094 from a stale base (built + verifier-PASS) before the pre-push audit found 094 already merged as #223; discarded that duplicate, reset to latest main, and picked up 101 (newly promoted READY by the 07-15 evening heartbeat). See LOG.md 2026-07-15 entries.
