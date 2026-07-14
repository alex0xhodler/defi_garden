# 085 — implementation notes

## The fix (planner.js)

Mix seed effect (was ~1507-1513). Changed the SEED only:

```js
// before
useEffect(function () {
  if (!mixTouched && apy > 0) {
    var ids = coveredBundle(slideCapital, apy, goal).covered.map(function (r) { return r.id; });
    if (!ids.length) ids = [goal];
    setSelectedSubs(ids);
  }
}, [apy, goal, slideCapital, mixTouched]);

// after
useEffect(function () {
  if (!mixTouched && apy > 0 && goal) {
    setSelectedSubs([goal]);
  }
}, [apy, goal, mixTouched]);
```

- Seeds exactly `[goal]` (the user's anchor pick) instead of every capital-covered ladder rung.
- Kept the `!mixTouched && apy > 0` gating (per spec + operator directive). Added a `goal`
  truthiness guard — belt-and-braces; `mixStats` already ignores an unresolvable id (the safety net,
  left untouched).
- `buildLadder` / `coveredBundle` / the toggle path (2093) / the capital-sync effect (1521) are all
  unchanged. `coveredBundle` still drives the unlocked/pct visual states, the report/dashboard
  progress block (3286), and the share bundles.

### Dependency array — trimmed `slideCapital`
With the fix the seeded value no longer reads `slideCapital`, so it was removed from the deps
(`[apy, goal, slideCapital, mixTouched]` → `[apy, goal, mixTouched]`). Rationale:
- The deps now list exactly the reactive values the effect reads (`apy`, `goal`, `mixTouched`) —
  correct per hooks rules.
- Keeping `slideCapital` would only cause redundant `[goal]` re-seeds on every capital-slider move
  while the mix is untouched (churn), and — matching the operator's caution — avoids any re-seed that
  could clobber a value after arrival. There is no prop-supplied mix to clobber (see trace below), so
  this is purely churn-avoidance + correctness.
- The capital-SYNC effect (1521, gated on `mixTouched === true`) is the mirror image and is untouched;
  the two effects remain mutually exclusive on the `mixTouched` flag.

## Share / restore trace (the load-bearing investigation)

**Conclusion: the share URL format does NOT carry the mix at all. The Bloom mix is always
RE-DERIVED on arrival by the seed effect. There is no prop/param path that feeds an explicit mix into
`selectedSubs`, so nothing to regress.**

Evidence:
- `encodePlanToUrl` (planner.js:903) writes only `goal`, `capital`/`monthly`, `fm`, `years`, `dl`,
  `pace`, `chain`, `token`. No `mix` param. All three share methods (copy/native/image, 1870/1899/1922)
  call this same encoder.
- `decodePlanFromUrl` (planner.js:930) correspondingly reads none. `sharedPlan` therefore has no `mix`
  field; `answers` (3734) has no `mix` field; the Bloom component receives `props.capital` /
  `.fundingMode` / `.deadline` but **no mix prop**.
- The localStorage-saved plan DOES persist `mix: selectedSubs` (1747 analytics sig, 1775 saved plan),
  but that field is consumed ONLY by the returning-visitor GardenReport view (`plan.mix` at 3326) — it
  is never fed back into the Bloom's `selectedSubs`. The Bloom seeds fresh every mount.

Therefore:
- Shared multi-subscription gardens were ALREADY not faithfully reproduced pre-fix — arrival re-derived
  the mix from `coveredBundle(capital, apy, goal)`, a capital-coverage approximation that (a) frequently
  added Spotify (the exact bug) and (b) can't reproduce an arbitrary non-prefix bundle anyway.
- The user pick that IS carried through a share link is the anchor `goal` (`?goal=`). Post-fix the
  arrival seed is exactly `[goal]` — so the preserved sender pick (the anchor) is reproduced, and Spotify
  no longer auto-tags-along. This is the "minimal correct behavior" and it does not change share
  semantics (no new params, encoder/decoder untouched).
- Per the operator directive ("an explicitly-carried mix wins over the [goal] seed"): there is no
  explicitly-carried mix in the current format, so there is nothing to make win. Adding mix-to-URL would
  change share semantics and exceed spec 085's "smallest change" + "covered-bundle math / share bundles
  out of scope" scoping, and would touch the encoder/decoder — so it was deliberately NOT done. If a
  future ticket wants faithful multi-sub share reproduction, the place to add it is `encodePlanToUrl`
  (write `mix`) + `decodePlanFromUrl` (read it) + a new `props.mix` that seeds `selectedSubs` and wins
  over `[goal]` — the seed effect's `!mixTouched` gate is already the right hook for that precedence.

AC #2 is asserted by test case (d): a share-style subscription URL arrives with ONLY the anchor
selected (Spotify OFF) — i.e. the sender's anchor pick preserved, the bug gone.

## Test — test_subscription_mix_seed.js (PORT 8802, fixture-routed, no live network)

Mirrors test_growth_capital_projection.js. One stable USDC pool @ 8.5% clears the `stable` persona
rails (minTvl 50M, stableOnly). 8.5% + the default $5,000 capital is the exact pre-fix trigger:
forever(chatgpt 20/mo) ≈ $2,824 and forever(anchor+Spotify 32/mo) ≈ $4,517, both ≤ $5,000 → old seed
was `[chatgpt, spotify]`.

- (a) goal=chatgpt bloom → ChatGPT ON, Spotify/Netflix/Claude/Amazon OFF (asserted on rendered
  `is-on` class + `aria-pressed`, not internal state).
- (b) goal=netflix (own fresh context) → only Netflix ON.
- (c) same page as (a): click Spotify row → row flips ON, ChatGPT stays ON, combined monthly updates
  `$20/mo` → `$32/mo` (rendered `.gp-mix-total`).
- (d) share-style URL (fresh context, empty storage) → ONLY the anchor selected.

Fresh contexts per independent goal: a bloom that auto-saved a plan to localStorage would route the
NEXT navigation into the returning-visitor report view (no mix rows). (a)+(c) intentionally share one
context (c toggles the seed from a); (b) and (d) each get their own.

## Verification (all green)
- `node test_planner.js` — All 208 assertions evaluated, green (no planner test touched).
- `node test_minified_assets.js` — 9/9 (planner.min.js byte-identical to fresh minify).
- `node test_translations_fallback.js` — 8/8 (planner.min.js consumer).
- `node test_subscription_mix_seed.js` — 4/4.
- `npm run minify` regenerated planner.min.js (only planner.min.js changed; other .min outputs
  byte-idempotent).

## Changed files
planner.js · planner.min.js · package.json (test chain append, last position) ·
test_subscription_mix_seed.js · product-loop-kit/specs/085-notes.md

## No EN/KO copy change. No product surface outside planner.js/planner.min.js touched.
