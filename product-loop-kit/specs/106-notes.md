# 106 — build notes (plan-level projection confidence)

Built exactly per spec 106.md §A–F. Summary of choices, deviations, and the Korean copy.

## Deviations from the spec

None material. The implementation follows §A–F precisely. Two conservative, spec-permitted choices worth recording:

1. **Test drive URL.** Spec §F says "e.g. `plan.html?goal=claude&pace=stable`". The test drives
   `plan.html?goal=claude&pace=stable&capital=5000&fm=capital` — the same capital-path parameters the
   sibling harness `test_share_mix_roundtrip.js` uses to land a clean subscription bloom. The extra params
   do not affect the note (it renders after `heroElement` in the subscription tree regardless of
   capital/monthly path). Purely a determinism choice ("e.g." left this open).

2. **Pools-loaded gate in the test.** To make F4's "note ABSENT" an honest hide (curated actually
   populated, not merely still-loading), each case waits until `.gp-sub-customize-rate` shows a real
   blended rate (not the pre-load "0.00%") before asserting on `.gp-plan-confidence`. This is a
   subscription-bloom element always present once pools resolve, in both the snapshot and live paths.

Fixture TVL is 60,000,000 (>= the spec's 50M `stable` rail floor; spec text also cited "tvlUsd >= 60M").
Ports 8791–8816 were taken, so the test uses **8817** as the spec suggested.

## Korean strings chosen (with one-line back-translations)

- `planConfidenceSteady` (fn `days =>`):
  `이 정원은 저희가 지켜본 ${days}일 동안 수익률이 꾸준히 유지된 풀들로 이루어져 있어요 — 수익률이 안정적일수록 계획을 믿기 쉬워집니다.`
  Back-translation: "This garden is made up of pools whose rates stayed steady over the {days} days we've
  watched — the more stable the rate, the easier the plan is to trust."

- `planConfidencePartial` (fn `(n, total) =>`):
  `이 계획을 떠받치는 풀 ${total}개 중 ${n}개는 지금까지 꾸준한 기록을 보여줬어요; 나머지는 아직 기록을 쌓아가는 중이에요.`
  Back-translation: "Of the {total} pools behind this plan, {n} have shown a steady track record so far;
  the rest are still building history."

- `planConfidenceBuilding` (string):
  `이 계획을 떠받치는 풀들의 기록을 아직 쌓아가는 중이에요 — 기록이 길수록 혼합 수익률을 믿기 쉬워집니다.`
  Back-translation: "We're still building the track record for the pools behind this plan — the longer the
  history, the easier the blended rate is to trust."

Note: `혼합 수익률` ("blended rate") reuses the exact term already used by the neighbouring
`blendedBadge` key, keeping the KO planner vocabulary consistent. Tone matches the calm cautious-saver,
"education not advice" register; no hype, no "save up / afford / budget"; counts come only from args.

## Verification run (all green)

- `node test_plan_confidence.js` → 6/6 (F1 STEADY, F2 PARTIAL, F3 BUILDING, F4 live-absent, F5 KO, F6 no page errors).
- `node test_minified_assets.js` → 9/9; `node test_css_minified_render.js` → 2/2 (proves `npm run minify` ran).
- `node test_planner.js` → 208 assertions, all pass (no regression).
- `git diff` shows ZERO changes to `APY_SANITY_LIMIT` / `DEFAULT_MIN_TVL` / degen ⅓ haircut logic; no JSX added.

Regenerated artifacts committed via `npm run minify`: `planner.min.js`, `translations.min.js`,
`planner-styles.min.css`.
