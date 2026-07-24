# 137 — build notes

## What shipped
KO pool-detail money honesty. The 5 KO strings that ran USD through `formatKoreanCurrency()` (→ `원`/만/억) now render honest `$`-prefixed en-US USD, mirroring their already-correct EN counterparts. The buggy helper + its `module.exports` entry were deleted (zero remaining callers). `translations.min.js` regenerated via `npm run minify`.

## Deviations from spec
- None material. Followed the spec's recommended fix exactly (display USD honestly, no FX).

## Conservative choices
- **No FX conversion** — display USD as `$`, per CLAUDE.md trust-rail / no-new-dependency rules and the BACKLOG operator recommendation. A live-FX number can't be put through the trust rails.
- **Particles left as-is** in `projectionBody` (`…을 넣으면`, `약 $X이 됩니다`). The original ended on `원을`/`원이`; ending on a `$`-number matches how the KO block already writes `$10M 기준` (lines 771/774) and is common in KO fintech copy. Rewording for perfect josa agreement would be scope creep beyond the money-honesty bug.
- **EN untouched** — EN already rendered honest `$` USD; this is a KO→EN-parity bug fix, not a new string, so the EN+KO-together rule is satisfied (both languages now honest).

## Evidence
- New rendered Playwright acceptance `test_ko_pool_money_honesty.js` (added to `npm test` after `test_i18n_pages.js`): 7/7 green after fix; proven RED on the pre-fix baseline (`git checkout origin/main -- translations.js` → `1,000원 기준`, `약 1,113원`, KO figures null vs EN `$1,000`) — a genuine regression test.
- `test_northstar_cta_fires.js` 7/7 — both north-star CTAs still render + fire on both entry paths.
- `test_translations_fallback.js` 8/8, `test_i18n_pages.js` 19/19, `test_minified_assets.js` byte-identical-minify assertions all pass.
- NORTH_STAR core test command (`test_planner.js && test_protocol_parsing.js && test_qualifier_fix.js`) green.
- Live render screenshot (KO, lido pool, 420px mobile): daily `$1,000 기준 → $0.06`, monthly `$1,000 기준 → $1.80`, projection `이 풀에 $1,000을 넣으면 5년 후 … 약 $1,113이 됩니다`, `$1,000 투자 기준` — no `원` anywhere on money figures.

## Pre-existing (NOT caused by this item)
- `test_minified_assets.js` has 2 failing assertions on `main` (home.html doesn't load translations.min.js; plan.html loads raw planner.js — the "minified in CI / backlog 053" setup main doesn't satisfy). `home.html`/`plan.html` are byte-identical to `origin/main` (empty `git diff`), so these reproduce identically on the base branch. The byte-identical-minify assertion (the one this item could affect) passes.
