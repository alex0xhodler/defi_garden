# 068 — Implementation notes

Planner hero-copy CRO swap (V01 outcome headline, V02 mechanism sub, V03 live-derived proof anchor).

## Files changed
- `translations.js` — EN + KO `title`, `tagline` swapped; new function-valued `splashHookLive` added next to the untouched static `splashHook` (both languages).
- `planner.js` — one line (splash-hook render at :4002): live variant when `stableGuidanceApy` exists, else static fallback.
- `planner.min.js`, `translations.min.js` — regenerated via `npm run minify` (plan.html loads the `.min` — 061's caught bug class).
- `test_hero_copy.js` — new Playwright acceptance gate.
- `package.json` — appended `&& node test_hero_copy.js` to the test chain.

## Exact strings shipped
EN
- title: `Pay your bills with yield, forever`
- tagline: `Tell us what you need. Live DeFi yield covers it automatically.`
- splashHook (unchanged fallback): `Park money once — its yield pays the bill forever, and you keep every dollar.`
- splashHookLive: `` (apy) => `Park money once — at today's ${apy} blended rate, the yield pays your bill forever and you keep every dollar.` ``

KO
- title: `수익이 요금을 내줘요 — 영원히`
- tagline: `필요한 걸 알려주세요. 실시간 DeFi 수익이 알아서 내드려요.`
- splashHook (unchanged fallback): `한 번 넣어두면 — 수익이 요금을 영원히 내주고, 원금은 고스란히 남아요.`
- splashHookLive: `` (apy) => `한 번 넣어두면 — 오늘 기준 혼합 수익률 ${apy}로 수익이 요금을 영원히 내주고, 원금은 고스란히 남아요.` ``

## KO refinements / choices
- Used the spec's exact KO drafts. The one intentional alignment: `splashHookLive` renders the rate as `혼합 수익률 ${apy}` ("blended rate ${apy}"), matching the existing `blendedBadge: (apy) => 혼합 수익률: ${apy}` (translations.js:839) so the number carries the same "blended rate" framing the KO product already uses. Politeness level (해요체) and the "-면 … 남아요" cadence mirror the untouched static `splashHook`. Meaning is identical to EN; EN/KO stay in sync.

## Deviations from spec
- None material. Spec §1 line references (~123-134 / ~710-718 / :264/:839) matched the tree exactly.
- Spec §4(a) wording says fixture TVL "well above $10M"; the `stable` persona band floor is actually `minTvl = $50M` (planner.js:533), so the fixture uses TVLs $250M–$800M to genuinely clear stable curation. Noted here per instruction to report conservative choices.
- `formatApy` is not on planner.js's exported `api`, so the test replicates its one-line formula (planner.js:67) with an in-comment sync note; the expected rate itself is derived through the REAL exported `curatePools` + `blendedApy` on the same fixture (not hardcoded), so live-derivation is genuinely proved.

## Fixture design rationale (test_hero_copy.js)
6 pools total. 3 clear the `stable` rails (USDC/USDT/DAI, lending projects aave/compound/morpho, TVL ≫ $50M, APY 5/6/7%). 3 decoys each trip a distinct rail so exclusion is exercised: `WETH-USDC` (non-stable symbol), a $20M-TVL pool (sub-floor), and a 5000% pool (> `APY_SANITY_LIMIT`). Curated `stable` top-3 = the 3 qualifiers; `blendedApy` = median([5,6,7]) = 6 → `formatApy` → `6%`. Because exactly the 3 qualifiers survive, the derived median is unaffected by the top-3 cutoff, keeping the expected value deterministic.

Assertions: (a) fixture route fulfilled → h1 == new EN title, tagline p == new EN tagline, `.gp-splash-hook` matches `/\d+(\.\d+)?%/`, ≠ static fallback, and contains the independently-derived `6%`; planner hero renders (piggybacks router-path check); zero pageerrors. (b) pools route 500 → hook == exact number-free fallback, no digit-%, zero pageerrors. (b') pools route aborted → same fallback. Guard test asserts the fixture yields a non-null rate so the live path isn't vacuous.

Route interception: `**yields.llama.fi/pools**` fulfilled/failed per scenario; all other non-local requests aborted (fonts/analytics CDN are connection-blocked in-sandbox regardless). Same fixture-routing pattern as test_waitlist_pitch.js. Port 8799 (8791-8798 already claimed).

## Test results (exact commands + exit codes)
- `node test_hero_copy.js` → exit 0 (4 assertions, derived rate 6%)
- `node test_planner.js` → exit 0
- `node test_protocol_parsing.js` → exit 0
- `node test_qualifier_fix.js` → exit 0
- `node test_minified_assets.js` → exit 0 (min freshness confirmed after regen)
- `node test_waitlist_pitch.js` → exit 0 (7 assertions; unaffected — it asserts the waitlist MODAL title/benefits, not the hero title/tagline, so no test-expectation edits were needed)

No unrelated assertions weakened; no test hardcoded the OLD hero strings.
