# 071 — implementation notes

Status: implemented 2026-07-13 on branch `claude/dazzling-ride-rkywxh`. No commits made (operator commits later).

## What shipped

Pool-detail rate-volatility honesty note. When the current total APY and the
30-day mean both exist, are > 0, and diverge by ≥1.5× (max/min), one calm
full-width note renders inside the expanded `pool-info-content`, immediately
after the stats grid, before the Tokens section.

## Files changed

- `PoolDetail.js` — added the note element as a sibling AFTER the APY-breakdown
  grid div closes (grid closes at the former line ~1287; note inserted between
  the grid and the "Tokens Section" block).
- `translations.js` — new `rateVolatilityNote(current, mean)` function key in
  BOTH the `en` block (after `rewardApyBreakdown`, ~line 32) and the `ko` block
  (matching position, ~line 620). Same param mechanism as `baseApyBreakdown` /
  `gardenThisPoolCtaConcrete`.
- `package.json` — appended `&& node test_rate_volatility.js` to the end of the
  `test` script chain.
- Regenerated artifacts (via `npm run compile` + `npm run minify`):
  `PoolDetail.compiled.js`, `PoolDetail.compiled.min.js`, `translations.min.js`
  (also `app.compiled.js`, `app.compiled.min.js`, `planner.min.js`,
  `style.min.css` — the minify script rewrites all of them; only the three
  above carry semantic changes for this spec).
- New test: `test_rate_volatility.js`.
- `product-loop-kit/BACKLOG.md` — touched by the build-loop harness (not by this
  code change).

## Divergence trigger (as implemented, PoolDetail.js)

```js
(typeof pool.apyMean30d === 'number' &&
  ((pool.apyBase || 0) + (pool.apyReward || 0)) > 0 &&
  pool.apyMean30d > 0 &&
  (Math.max((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d) /
    Math.min((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d)) >= 1.5) &&
React.createElement('div', {
  className: 'rate-volatility-note',
  style: {
    background: 'var(--color-background)',
    borderRadius: 'var(--neuro-radius-sm)',
    boxShadow: 'var(--neuro-shadow-subtle)',
    color: 'var(--color-text-secondary)',
    fontSize: 'var(--font-size-sm)',
    lineHeight: '1.5',
    padding: '12px 16px',
    marginBottom: '20px'
  }
},
  t
    ? t('rateVolatilityNote', _formatApy((pool.apyBase || 0) + (pool.apyReward || 0)), _formatApy(pool.apyMean30d))
    : `This pool's rate moves a lot: ${_formatApy((pool.apyBase || 0) + (pool.apyReward || 0))} right now vs a ${_formatApy(pool.apyMean30d)} 30-day average. Reward emissions change daily — projections on this page use the current rate and will move with it.`
),
```

## Conservative choices

- Placed the note as a full-width SIBLING after the grid (not inside the grid
  with `gridColumn: '1 / -1'`) — spec explicitly says "immediately after the
  stats grid" and offered either option; a sibling is the simpler, clearer read.
- Font size uses `var(--font-size-sm)` (matches the sibling tile *values*),
  padding `12px 16px` (a touch more horizontal than the tiles' `12px` because
  this is a full-width prose line, not a centered stat), `marginBottom: '20px'`
  to match the grid's own bottom margin so the Tokens section spacing is
  unchanged. Only existing neuro tokens; no warning color, no emoji, no
  animation, no gradient.
- Numbers pass through `_formatApy` (en-US pinned) and are handed to the
  translation as fully-formatted strings incl. the `%`, so the copy template is
  language-agnostic and both EN/KO interpolate identically.
- Trigger is written inline (no new hoisted variable) to keep the diff surgical
  and touch nothing above/around the hero, calculator, or trust rails.

## Commands run

- `npm install` (deps were absent; needed for compile/minify + playwright).
- `npm run compile && npm run minify` — regenerated shipped artifacts.
- Grep verification: `rate-volatility-note` (1) and `rate moves a lot` (1)
  present in `PoolDetail.compiled.min.js`; `rateVolatilityNote` (1),
  `rate moves a lot`, and the KO substring `이 풀의 이율은 변동이 큽니다`
  present in `translations.min.js`.
- `node test_rate_volatility.js` → 5/5 green.
- `timeout 300 npm test` → chain stops at `test_smoke.js` (see below).

## Test results

New test `test_rate_volatility.js` — 5/5 assertions pass (spec criteria 1–5):
1. divergent (142.84% vs 405.32%) → note present, text contains both — PASS
2. stable (5.20% vs 5.00%) → no note — PASS
3. no apyMean30d → no note — PASS
4. `?lang=ko` divergent → Korean substring `이율은 변동이 큽니다` + both APYs — PASS
5. zero page errors across all renders — PASS

Full `npm test`: the chain short-circuits at `test_smoke.js`, which runs BEFORE
`test_rate_volatility.js` (appended at the end). The static tests ahead of it
passed (incl. `test_compiled_assets` / `test_minified_assets` byte-identical
checks and the 040 JSON-LD test, confirming my regenerated artifacts are
consistent).

### Pre-existing-failure proof (test_smoke.js)

`test_smoke.js` fails with repeated `net::ERR_CONNECTION_RESET` and then times
out waiting on `.pool-card` — it does NOT stub the external unpkg React/Babel
and yields.llama.fi hosts the way `test_search.js` and my test do, so it cannot
load in this proxy-blocked sandbox. Proven pre-existing via `git stash`:

- `git stash` (my changes removed) → `node test_smoke.js` → identical failure:
  `✗ bare / renders planner UI at 360px` followed by many
  `console.error: Failed to load resource: net::ERR_CONNECTION_RESET`, then the
  process hangs to the timeout (exit 124/143). Signature is byte-for-byte the
  same as with my changes applied.
- `git stash pop` → changes restored.

Conclusion: the only failing test in the chain is environmental and
independent of this change. My change adds no new failure; my own gate is green.

## Deviations from spec

None functional. The spec allowed either `gridColumn: '1 / -1'` inside the grid
or a sibling after it; chose the sibling (spec's stated primary phrasing:
"after the stats grid"). Added `lineHeight: '1.5'` (not enumerated but a neutral
prose readability property, no token needed, no design-system violation).
