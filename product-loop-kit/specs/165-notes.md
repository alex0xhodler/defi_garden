# 165 notes — anomalous pools: rail the DERIVED DOLLAR projections on pool-detail

## Summary of the fix

Four render sites in `PoolDetail.js` compute a dollar amount from `totalApy` with no gate. All four
are now conditioned on the existing `isAnomalous` const (unchanged: `totalApy > APY_SANITY_LIMIT_LOCAL`,
`APY_SANITY_LIMIT_LOCAL = 1000`):

| node | file:line (post-fix) | anomalous behavior |
|---|---|---|
| projection card body | `PoolDetail.js:628-637` | new `t('projectionBodyOutOfRange')` line, no numbers |
| daily quick-metric value | `PoolDetail.js:696-701` | `—` (skips `AnimatedNumber` entirely) |
| monthly quick-metric value | `PoolDetail.js:731-736` | `—` (skips `AnimatedNumber` entirely) |
| yield-calculator amount | `PoolDetail.js:1095-1098` | `—` |

Two new translation keys added to both `en` and `ko` blocks of `translations.js` in the same edit:
`projectionBodyOutOfRange` (EN: "This rate is too far outside normal ranges to project a dollar
amount from — the number would be fiction, not a forecast."; KO: natural Korean, not a
transliteration — see below). No other translation key was touched.

## Deviations from the spec

None substantive. Two small implementation choices the spec left to my judgment:

1. **Placeholder `'—'` is a bare literal, not routed through `t()`.** CLAUDE.md's "every
   user-facing string goes through translations.js" rule is about *language-bearing* copy; `—` is
   language-neutral punctuation, and the codebase already treats it that way in ~15 call sites
   (`planner.js:2224,2227,2230,2244,2248,2927,2930,2939,3692,3708,3714,4735`,
   `generate-chain-pages.js`, `generate-token-pages.js` — all bare `'—'`, never `t('emdash')`).
   Following that precedent rather than inventing a `dashPlaceholder` key that would just resolve
   to `'—'` in both languages anyway.
2. **`projectionBodyOutOfRange` is a static string, not an interpolated template function** (unlike
   its sibling `projectionBody`). There is nothing honest left to interpolate — the whole point is
   that no number derived from the rate should render — so a plain string was simplest and avoids
   accidentally re-introducing a number later via an unused parameter.

## Conservative choices

- **Did not touch `activeCalculatorTab`, `investmentAmount`, or any other calculator state** — the
  gate is purely a render-time ternary on `isAnomalous`, so switching tabs on an anomalous pool
  keeps showing `—` for every tab, which is correct (all three tab formulas derive from the same
  railed `totalApy`).
- **Did not add a gate to the "Garden this pool" CTA** — it was already gated by `showConcreteCta`
  (`= !isAnomalous`, item 025), which the spec explicitly says stays read-only. Left both CTA sites
  (`:574-577` hero, `:1645-1648` repeat footer) byte-identical.
- **Left `applyDegenHaircut`/`poolDegenHaircutNote` untouched.** For the anomalous fixture used in
  the test, `getRiskAssessment()`'s anomalous-override forces `score: 100`, which makes
  `gardenPersona` resolve to `'degen'` (score > 50), which makes `applyDegenHaircut` true, so the
  projection card *also* renders the pre-existing degen-haircut `calc-warning` line above the new
  out-of-range line. That line only prints a *percentage* (`_formatApy(totalApy)`), never a dollar
  figure, so it doesn't violate the "no derived dollars" rule and I left it alone rather than
  special-casing it — it's an existing, unrelated rail (degen honesty) doing its own job.
- **Did not add a new CSS class or style.** The out-of-range line renders inside the exact same
  `<div>` (same inline style object) that used to hold `projectionBody`'s text — a content swap
  only, per "surgical diff" and "no new CSS one-offs".

## KO translation — natural Korean, not transliteration

`projectionBodyOutOfRange` (ko): "이 수익률은 정상 범위를 크게 벗어나 있어 금액을 예측해 보여드리지
않습니다 — 그런 숫자는 예측이 아니라 허구에 가깝기 때문입니다." This mirrors the register and
sentence structure already used by the neighboring `calcAnomalyWarning`/`projectionKeepNote` KO
strings in the same file (formal-polite `-습니다` register, em-dash clause break), not a literal
word-for-word rendering of the English.

## Per-criterion verification table

All commands run from `/home/user/defi_garden` on branch `claude/loop-165`. `node_modules` did not
exist at session start (`npm run compile` failed with `MODULE_NOT_FOUND: @babel/core`); ran
`npm install` first (not itself part of the acceptance evidence, just a prerequisite — 5s, 67
packages, no lockfile change needed since `package-lock.json` was already committed).

| # | criterion | command | result (verbatim) |
|---|---|---|---|
| 1-6 | new test's own assertions | `node test_pool_detail_anomaly_projection.js` | see full transcript below — **9/9 passed**, exit 0, `real 0m45.222s` |
| 7 | positive control alive | `node test_audit_app.js` | **3 passed, 0 failed**, exit 0, `real 0m21.542s` |
| 8 | production load path | `npm run compile && npm run minify`, then non-vacuity check (below) | bundles regenerated and committed to working tree; non-vacuity check confirms the test exercises them |
| 9 | rails untouched | `git diff PoolDetail.js` inspected by eye + grep | no line touching `APY_SANITY_LIMIT_LOCAL`, `DEFAULT_MIN_TVL`, `isAnomalous`, `showConcreteCta`, `applyDegenHaircut`, `getRiskAssessment`, or the hero/`Base APY`/`Reward APY` render sites (`:540-546`, `:1210-1259` in the new line numbering) — full diff is 4 hunks, all inside the 4 scoped nodes |

### Full transcript — the new test (criteria 1-6), final run

```
$ time timeout 300 node test_pool_detail_anomaly_projection.js
network: unpkg.com/browser-external HTTPS BLOCKED (home.html vendors React/ReactDOM/PoolDetail/app locally), yields.llama.fi BLOCKED (DefiLlama-shaped fixture)
  ✓ criterion 1: anomalous pool renders NO $-figure >= $1,000,000,000 anywhere
  ✓ criterion 2a: projection card renders the honest out-of-range line, not projectionBody
  ✓ criterion 2b: daily + monthly quick-metric values render "—", not a $ figure
  ✓ criterion 2c: yield-calculator amount renders "—", not a $ figure
  ✓ criterion 3: ⚠ anomaly warning renders and Risk Assessment reads High
  ✓ criterion 4: hero still renders the pool's own rate (345,079.06%) — datum not hidden
  ✓ criterion 5: healthy pool renders real $ figures on all four surfaces + the normal projectionBody sentence
  ✓ criterion 6: KO anomalous pool renders the new line in Korean, no raw t('...') key leak, still no $1B+ figure
  ✓ zero page errors across all renders
9/9 pool-detail anomaly-projection assertions passed

real	0m45.222s
user	0m3.195s
sys	0m1.035s
```

### Full transcript — `test_audit_app.js` (criterion 7)

```
$ time timeout 300 node test_audit_app.js
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes findings JSON
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ positive control: injected 900T Base APY renders into pool-detail → P0 number-sanity finding
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ negative control: injected 900T 30d-Mean APY is suppressed on pool-detail (backlog 144 rail holds)

test_audit_app.js: 3 passed, 0 failed

real	0m21.542s
```

### Directly-related pool-detail render tests (not required by the spec's minimum list, run anyway
because they're the closest-blast-radius siblings — same component, same money-honesty/CTA/anomaly
surfaces)

| test | result | wall-clock |
|---|---|---|
| `test_ko_pool_money_honesty.js` | 7/7 passed | `0m26.741s` |
| `test_mean30d_sanity.js` | 8/8 passed | `1m35.708s` |
| `test_dead_pool.js` | 5/5 assertions passed | `0m6.699s` |
| `test_garden_cta_arrival.js` | PASS (all assertions) | `0m4.182s` |
| `test_repeat_cta.js` | 5/5 passed | `0m14.176s` |
| `test_projection_lead.js` | 7/7 passed | `0m26.857s` |

All six were run individually, each under the 5-minute foreground timebox, all green.

## Production load path — non-vacuity proof (criterion 8)

`home.html` loads `PoolDetail.compiled.min.js` as a plain `<script>` tag when `__APP_MODE ===
'analytics'` (`home.html:354-355`), never `PoolDetail.js` — confirmed by reading `home.html:330-359`
before writing the test. The new test's `renderPool()` navigates to `home.html?pool=...`, i.e. the
exact same load path a real browser takes; it does not load `PoolDetail.js` directly or inject it
via `@babel/standalone`.

Proved this isn't accidental: after `npm run compile && npm run minify`, I string-mangled
`projectionBodyOutOfRange` → `projectionBodyOutOfRangeXXX` **only inside the committed
`PoolDetail.compiled.min.js`** (source `PoolDetail.js` untouched) and re-ran the new test:

```
  ✓ criterion 1: anomalous pool renders NO $-figure >= $1,000,000,000 anywhere
  ✗ criterion 2a: projection card renders the honest out-of-range line, not projectionBody
    expected exact projectionBodyOutOfRange text, got: "projectionBodyOutOfRangeXXX"
  ✓ criterion 2b: daily + monthly quick-metric values render "—", not a $ figure
  ✓ criterion 2c: yield-calculator amount renders "—", not a $ figure
  ✓ criterion 3: ⚠ anomaly warning renders and Risk Assessment reads High
  ✓ criterion 4: hero still renders the pool's own rate (345,079.06%) — datum not hidden
  ✓ criterion 5: healthy pool renders real $ figures on all four surfaces + the normal projectionBody sentence
  ✗ criterion 6: KO anomalous pool renders the new line in Korean, no raw t('...') key leak, still no $1B+ figure
    expected exact KO projectionBodyOutOfRange text, got: "projectionBodyOutOfRangeXXX"
  ✓ zero page errors across all renders
7/9 pool-detail anomaly-projection assertions passed
```

RED as expected (2a/6 fail, since the mutated compiled bundle is what actually reached the browser).
Restored via `git checkout -- PoolDetail.compiled.min.js` then re-ran `npm run minify` to regenerate
the correct bundle from the real source (git checkout reverts to the pre-165 committed version, not
to my regenerated one — re-minifying was necessary, not optional, after this probe). Re-ran the test
afterward: back to 9/9 green (see transcript above, which is the *final* run, taken after this
restore).

## Rails untouched — mechanical check (criterion 9)

```
$ git diff PoolDetail.js | grep -n "^[+-]" | grep -v "^+++\|^---"
```
Full diff is reproduced here for the record — 4 hunks, all inside the 4 scoped nodes, net +18/-10
lines (see `git diff --stat`: `PoolDetail.js | 26 +++++++++++++++++---------`):

1. Projection card body (`t ? t('projectionBody', ...) : ...` → `isAnomalous ? t('projectionBodyOutOfRange') : (...)`)
2. Daily metric value (`AnimatedNumber ? ... : ...` → `isAnomalous ? '—' : (AnimatedNumber ? ... : ...)`)
3. Monthly metric value (same pattern)
4. Calculator amount (`activeCalculatorTab === ... ? ... : ...` → `isAnomalous ? '—' : (...)`)

No line touches `APY_SANITY_LIMIT_LOCAL`, `DEFAULT_MIN_TVL`, `mean30dSane`, `getRiskAssessment`,
`isAnomalous`'s own definition, `showConcreteCta`, `applyDegenHaircut`, the hero APY block
(`:536-554` post-fix), or the Base/Reward APY info cards (`:1210-1259` post-fix). Confirmed the
`git diff --stat` line count (26 changed lines in `PoolDetail.js`) matches exactly the 4 hunks
listed above and nothing else.

## What I could NOT verify in this sandbox

- **The full `npm test` / `npm run test:serial` chain was not run** — per the task's own instruction
  ("known never to complete in this sandbox"). Ran the new test + `test_audit_app.js` +  six
  directly-related pool-detail tests individually instead (all green, see table above). I did not
  run the other ~80 tests in the serial list (sitemap, token/chain pages, waitlist, spotlight,
  planner, etc.) — none of them touch `PoolDetail.js`/`translations.js`'s `projectionBody*` family
  or `package.json`'s script string beyond the one line I inserted, so blast radius is judged low,
  but this is a genuine gap, not a claim of a green full run.
- **`test_minified_assets.js` was not run.** It's on the serial list right after `test_compiled_assets.js`
  and checks minify-idempotency across all `JS_FILES`/`CSS_FILES`; I regenerated
  `translations.min.js` and `PoolDetail.compiled.min.js` via the sanctioned `npm run minify` path
  (never hand-edited), which should keep it green, but I did not execute it to confirm.
- **`test_compiled_assets.js` was not run** for the analogous reason on the compile side
  (`npm run compile` output freshness).
- **Live DefiLlama data was not re-fetched this session** — the spec's own evidence (75 anomalous
  pools, 2026-07-28 tick) was taken as given; I did not independently re-curl `yields.llama.fi/pools`
  to reconfirm the zeebu pool's live shape. The test fixture reproduces the spec's own numbers
  (345,079.06% APY, $577,957 TVL) rather than re-deriving them from a fresh live fetch.
- **No visual/screenshot review** (Playwright screenshot diffing) was done — verification was
  DOM-assertion-based only, per the test file's own design (the task brief privileges rendered
  DOM assertions over screenshots for this kind of correctness gate).

## Risk-tier guess

**LOW.** Source diff is 4 small, structurally-identical ternary wraps in one file (+18/-10 lines,
`PoolDetail.js` `git diff --stat`), 2 new translation keys (+3 lines, `translations.js`), and a
1-line `package.json` script-string insertion — no new dependency, no touched threshold constant, no
touched CTA/hero/Base+Reward render site, no CSS change. The compiled/minified bundle diffs
(`PoolDetail.compiled.js` +14/-8-ish, `PoolDetail.compiled.min.js`/`translations.min.js` 1-line each)
are 100% generated output from the sanctioned `compile`/`minify` scripts, never hand-edited. The
author's own spec-header risk guess was HIGH (score 7.6) on account of the *bug* being high-severity
(trust-surface fiction), not the *fix* being architecturally risky — the fix itself is a narrow,
mechanical render gate reusing an existing, already-computed boolean (`isAnomalous`) that three
other call sites in the same file already condition on.
