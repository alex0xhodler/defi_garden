# 239 — build notes

## What was actually wrong (measured, not assumed)

The default browse is `/?chain=Popular` — `translations.js:37` renders its heading as
`Popular DeFi Yields`, exactly the screen in the human's screenshot. It is served by the FIRST of the
three duplicated `filtered.sort(...)` comparators in `app.js`'s big filter effect (the
`!selectedToken && (selectedChain === 'All' || selectedChain === 'Popular')` block, ~line 1966).

Item 092 shipped the no-supply-yield demotion, but only in that comparator's `sortBy === 'tvl'` branch.
The `sortBy === 'sharpe'` branch (the **Risk-Adjusted** toggle) never got it. With no
`kpis.apySharpe` history on any pool — the normal state today — every pool's Sharpe is `null`, so the
comparator falls straight through to its `b.tvlUsd - a.tvlUsd` tie-break. That is a pure TVL sort with
no yield partition at all, which is why the three biggest zero-yield collateral pools led the flagship
list.

Confirmed against live DefiLlama data in-session (`yields.llama.fi/pools`, 2026-08-05):

| measure | value |
|---|---|
| pools returned | 15,633 |
| above the `DEFAULT_MIN_TVL` $10M floor | 736 |
| of those, no displayable supply yield (`apyBase+apyReward < 0.01`) | **247** ($30.1B TVL, 28 chains) |
| top 5 by TVL | WSTETH/sparklend $2.40B · CBBTC/morpho-blue $2.36B · WEETH/aave-v3 $2.32B · WSTETH/aave-v3 $2.14B · WBTC/aave-v3 $2.08B |

The first three are precisely the rows in the audit screenshot (F4) — the instance is the positive
control, and the population behind it is 247 pools, not 3.

## The change

One hunk, 12 inserted lines, in comparator #1's `sharpe` branch only:

```js
if (anomA !== anomB) return anomA - anomB;   // pre-existing anomaly rail
+ const noA = hasNoSupplyYield(a) ? 1 : 0;   // 239
+ const noB = hasNoSupplyYield(b) ? 1 : 0;
+ if (noA !== noB) return noA - noB;
const shA = …                                 // Sharpe comparison unchanged
```

Deliberate ordering: the partition sits **after** the anomaly rail, so anomalous pools
(APY > `APY_SANITY_LIMIT`) stay demoted last of all. The three-tier order is
`sane-yielding → zero-yield → anomalous`. No trust rail was touched: `APY_SANITY_LIMIT`,
`DEFAULT_MIN_TVL`, `hasNoSupplyYield`, `NO_SUPPLY_YIELD_EPSILON`, the anomaly flag/demotion and the
degen haircut are byte-unchanged.

Predicate reuse, not re-typing: `hasNoSupplyYield` (`app.js:814`) is the *same* function that renders
the "No supply yield" tag at `app.js:~2915`. The row that is demoted is, by construction, exactly the
row that carries the honest label — they cannot drift apart.

Derived assets regenerated (`home.html` loads `app.compiled.min.js`, not raw `app.js`):
`npm run compile && npm run minify` → `app.compiled.js`, `app.compiled.min.js` committed alongside.

## Deviations from the spec

1. **The spec named "APY/TVL/risk-adjusted" as three fixes; only one branch needed code.** The `tvl`
   branch already carried 092's partition, and the `apy` branch satisfies the invariant structurally
   (the partition predicate is a threshold on the very quantity the branch sorts by, so all yielding
   pools already outrank all zero-yield pools). Rather than add two no-op partitions, all three toggles
   are **asserted** in the rendered test. Behaviour is covered; code is not duplicated.
2. **Test extended, not created.** `test_zero_yield_demote.js` (092's gate) already owned this class,
   so the new phases were appended to it — reuse-before-inventing, and it keeps the test registry
   (`test_test_registry.js`) unchanged.

## Class honesty (build.md §3 "Class rule")

**The class is NOT closed.** This item fixes the DEFAULT view only, because spec 239's acceptance
criterion 3 explicitly requires `?token=` / `?chain=<name>` views to be byte-order-unchanged. The same
defect therefore still exists in comparators #2 (chain-first, `?chain=Base`) and #3 (token-first,
`?token=USDC`) under the Risk-Adjusted toggle.

With a number: **247 no-supply-yield pools above the $10M floor, $30.1B TVL, spread over 28 chains**,
can still rank first in any `?chain=<name>` or `?token=<SYMBOL>` view sorted by Risk-Adjusted. Those
are the SEO landing surfaces, so the residual is not cosmetic. Filed as **backlog 242** with this
number; a test in this branch (`Population C` scope pin) pins the current behaviour so the residual is
recorded and visible rather than merely unmentioned.

## Verification evidence

Red-first, then green, then neutered-red, then restored-green — all on the REAL rendered UI
(http-server + chromium driving `app.compiled.min.js`), never on source strings:

1. **Red (positive control).** Test written first, run against unmodified `app.js` → `13/15`, with the
   two Risk-Adjusted assertions failing on the real rendered order:
   `order=["WSTUSDC-A7","CBUSDC-A8","WEUSDC-A9","USDC-A6",…]` — the three zero-yield rows on top,
   reproducing F4 exactly.
2. **Green.** Fix applied + assets recompiled → `15/15`.
3. **Neutered → red.** The single `if (noA !== noB) return noA - noB;` line commented out, assets
   recompiled, re-run → back to `13/15`, the same two failures.
4. **Restored → green,** byte-identical: `md5sum app.js` = `b5a93366b28ef0c744ce90251521ee26` before
   and after the neuter/restore cycle; `git diff --stat app.js` = 12 insertions, 0 deletions.

Final suite: **17/17** (the two added RAZOR mirror checks bring it from 15 to 17). Each mirror check was
neutered separately: drifting the test-side `ZERO_YIELD_EPSILON` 0.01 → 0.02 turned exactly that one
assertion red (`app.js NO_SUPPLY_YIELD_EPSILON = 0.01, but test-side literal = 0.02 — the mirror has
drifted`) with the other 16 green, and the restore was byte-identical
(`md5sum test_zero_yield_demote.js` = `a4578e0586851bfb1a49c6bcf52069fc` before and after). So the
17 assertions are distinguishable from "one working rule and sixteen dead ones".

The fixture partitions are derived at test time from the fixture population
(`(apyBase||0)+(apyReward||0) < 0.01`), never from a hardcoded symbol list — the WSTETH-shaped rows are
the positive control, not the definition. The two constants the test mirrors from `app.js`
(`NO_SUPPLY_YIELD_EPSILON`, `APY_SANITY_LIMIT`) are parsed out of `app.js` at test time and asserted
equal to the test-side literals, so the mirror cannot drift silently (RAZOR mirror rule).

## Test population

- **A** (9 pools, `/?chain=Popular`): 6 yielding ($20M–$90M TVL, 2.1–8.9%) + 3 zero-yield
  ($2.2B–$2.4B TVL). Sized to `itemsPerPage = 9` so the whole population renders on page 1 and DOM
  order is the full ranking. Absent the fix the three zero-yield rows top every TVL-tie-broken sort.
- **B** (7 pools): 4 sane-yielding + 2 zero-yield + 1 anomalous (`apyBase: 5000`) — proves the anomaly
  trust rail still outranks the new partition.
- **C**: population A viewed through `/?token=USDC` — the scope pin for criterion 3.

## Known-unrelated test result — PRE-EXISTING, measured not asserted

`test_search.js` does not complete inside the 5-minute foreground timebox in this sandbox. Rather than
claim "unrelated" from reasoning alone, it was measured against a pristine worktree of the base commit
(`git worktree add … origin/main`, HEAD `ca6c499b63` — the same commit this branch forks from, no stash
involved):

| tree | result |
|---|---|
| `claude/loop-239` | 19/20, fails on `"balance my portfolio" does not false-match a protocol` → `page.goto: Target page, context or browser has been closed`, `timeout 300` hit (exit 124) |
| pristine `origin/main` | **identical** — same 19/20, same assertion, same error, same 300s cap |

So the timeout pre-dates this branch. The worktree was removed afterwards
(`git worktree remove --force`, `git worktree list` shows only the main tree).

## Full suite results on this branch

| test | result |
|---|---|
| `test_zero_yield_demote.js` (this item's gate) | 17/17 |
| `test_default_sort.js` | 4/4 |
| `test_list_default.js` | 3/3 |
| `test_smoke.js` | 11/11 |
| `test_compiled_assets.js` | 4/4 |
| `test_minified_assets.js` | 9/9 |
| `test_analytics_fires.js` | 1/1 |
| `test_northstar_cta_fires.js` | 7/7 |
| `test_search.js` | 19/20 — pre-existing timebox failure, identical on base (above) |
