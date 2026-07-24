# 135 — build notes

## What changed
- `app.js` `updateUrl` (line ~945): guard changed from `if (minTvl > 0)` to
  `if (minTvl > 0 && minTvl !== DEFAULT_MIN_TVL)` — the default $10M floor is no
  longer serialized into generated URLs. Read path (app.js:927) already defaults
  an absent `minTvl` to `DEFAULT_MIN_TVL`, so the change is behavior-preserving.
- Regenerated `app.compiled.js` + `app.compiled.min.js` (`npm run compile && npm run minify`).
- New rendered-Playwright acceptance `test_minttvl_clean_url.js` (3 cases), wired
  into `npm test` after `test_plan_clean_url.js`.

## Conservative choices / deviations
- **Non-default floors untouched.** Only the value equal to `DEFAULT_MIN_TVL` is
  omitted; the $10k/$50k presets and any user-chosen TVL chip still serialize
  (they are `!== DEFAULT_MIN_TVL`). Test C proves `minTvl=50000` survives.
- **Trust rail intact.** `DEFAULT_MIN_TVL` value unchanged; a bare `/?token=USDC`
  still applies the $10M floor via the read path (Test B renders only >$10M pools).
- **Backward compatible.** Pre-existing `?minTvl=10000000` links in the wild keep
  working — the read path treats the explicit value identically to its absence.
- **Test selector = `.pool-card`** (not a `.pools-grid`-scoped selector): the
  default results view renders list mode, so `.pools-grid` is not in the DOM;
  `.pool-card` is what `test_smoke.js` / `test_search.js` use.
- Build agent ran `npm install` first (node_modules absent in sandbox; compile
  needs `@babel/core`).

## Verifier outcome
PASS, 6/6 acceptance criteria. Verifier independently assigned risk tier **HIGH**
(overriding the builder's LOW guess) — `updateUrl` is the parameterized-URL
generation path, which NORTH_STAR.md line 63 places in the HIGH lane. Verifier
proved the test bites (reverting the guard in the min bundle makes Test A fail
with `?token=USDC&minTvl=10000000`) and re-hashed both bundles byte-identical to a
fresh build. pr.md upgraded LOW→HIGH (full explainer + 5-question quiz). Not on the
NEVER list (no rail weakening, no SEO deletion; existing links still resolve) →
HIGH auto-merges under autonomy level (c).

## Test results (operator-reverified, not just agent-reported)
- `test_minttvl_clean_url.js` — 3/3 PASS (operator ran it directly).
- `test_compiled_assets.js` — 4/4 PASS (app.compiled.js byte-identical to fresh
  compile; the bundle-regen risk is closed).
- `test_northstar_cta_fires.js` — 7/7 PASS (agent-run; north-star surface no regression).
- `test_plan_clean_url.js` — 3/3 PASS (agent-run).

## Pre-existing failures (NOT caused by 135 — independently confirmed by operator)
- `test_minified_assets.js` exits 1 at **baseline HEAD** (verified by stashing all
  135 changes and re-running: identical 2 failures — `home.html` loads
  `translations.js` raw, `plan.html` loads `planner.js` raw). This is a repo-wide
  config condition unrelated to URL serialization and out of scope for 135; it
  halts the `&&`-chained `npm test` before the full suite completes at baseline
  too. Recent items (136/137/…) shipped under the same baseline. "Tests green" for
  this item = new acceptance passes + no new failures introduced.
- `test_smoke.js` `bare / renders planner UI` — environmental (external font fetch
  blocked in sandbox); `/?token=USDC renders pool cards` (the analytics path this
  item touches) passes at all 3 viewports.
