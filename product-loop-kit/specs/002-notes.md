# 002 notes — share-loop instrumentation truth check (executed 2026-07-10, in-session with the human)

## Verdict
Share instrumentation is SOUND. The 30-day zeros had a simpler root cause: **tracking only went live 2026-07-09** (human confirmed), and in the ~1 active day nobody used share (0 shares across 5 plans / 167 sessions). "Broken" hypothesis refuted by code audit.

## Audit trail (file:line)
- `share_link_created`: fires in `doCopyLink` (planner.js:1737) and `doNativeShare` (planner.js:1760) — synchronous, before clipboard/native-share, correct.
- `share_link_opened`: fires in mount effect (planner.js:3293) when `decodePlanFromUrl` yields a shared plan — correct.
- Encode/decode round-trip symmetric: `encodePlanToUrl` (planner.js:848) sets `goal/monthly|capital/pace(+fm/years/dl)`; `decodePlanFromUrl` (planner.js:868) requires `goal+pace+(monthly|capital)` — matches.
- Router: `home.html:61` ANALYTICS_PARAMS allowlist = token/chain/pool/poolTypes/protocols/minTvl/minApy/app — `goal/pace` fall through to planner. Share URLs from bare `/` DO reach the planner. No routing bug.
- Early-fire race: Mixpanel official inline stub loads in `<head>` (home.html:122, plan.html:82) — `window.mixpanel` defined synchronously, events queue in stub. `Analytics.track`'s `typeof mixpanel` guard never drops on these pages.

## Bug found & fixed while auditing (the plan_saved double-count)
- Root cause: persist effect (planner.js:1611) has `curated`/`apy` in deps; rate settling re-ran it, and `trackPlanSaved` fired on every run while `trackPlanCreated` was ref-guarded → plan_saved = exactly 2× plan_created.
- Fix: `planSavedSignature()` pure helper (planner.js, exported in api) — dedupe key over user-meaningful fields (archetype/goal/monthly/years/persona/capital/fundingMode/deadline/poolFilters/slotPicks/mix), rate churn excluded. Effect fires plan_saved only when the signature changes. localStorage persistence unchanged (still every settle).
- Tests: 5 new assertions in test_planner.js (TDD: failed first, then green). Full suite: 190 assertions, 3 files, all exit 0.

## Residual (flagged, not silently decided)
- One live-fire confirmation after deploy: create a plan in prod, confirm Mixpanel live view shows 1× plan_saved per meaningful change.
- SEMANTIC QUESTION for the human (report Q-c): both `plan_created` and `plan_saved` re-fire on every page revisit of a saved plan (refs reset on remount). Reloading your own plan should probably not count as plan_created — this inflates the north-star numerator's input. Needs a decision on event semantics before instrumenting a fix.
