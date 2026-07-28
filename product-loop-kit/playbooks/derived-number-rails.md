# derived-number-rails — playbook

**When:** a number the product *computes* (rather than reads straight from DefiLlama) is suspect, or you
are auditing a new derived field. Especially when the number **looks fine** — this playbook exists because
the whole class hides behind plausible-looking output. Sibling of `product-audit.md` check 1: that one
scans *rendered* surfaces; this one is for the *compute* layer behind them.

**Answer in one line:** the trust rails are enforced per-field and at display time, so any field DERIVED
from a rate — at any depth — is unrailed until someone rails it, and a magnitude guard on the OUTPUT
cannot see a poisoned INPUT.

## The recurring shape (four items, same root)

| Item | Field | What it rendered | Why the existing guard missed it |
|------|-------|------------------|----------------------------------|
| 122 | `kpis.apySharpe` | `-900,719,925,474,097.9` | `sd > 0` passed on float dust (~1e-16) |
| 144 | `apyMean30d` | `36,452.4%` as a trusted "30d average" | gate was `typeof === 'number'`, no bound |
| 145 | `apyMean` / `apyStdev` / `apySharpe` | an innocuous **`0.3`** | every guard was a MAGNITUDE guard on the OUTPUT |
| 159 | `pool.apy` in `llms.txt` | `353,114.2% APY` on live prod | **the surface had no guard at all** — the rail was never wired into that generator |
| 165 | `projectionAmount`, daily/monthly/calculator $ | `~$49,002,948,093,727,200,000 in 5y` | the rail existed and fired — on the **rate** and on ONE node (`showConcreteCta`); the other four nodes compounded the same rate unguarded |

145 is the important one for *inputs*; **159 is the important one for *surfaces***. It is not a subtle
numeric failure — `generate-llms.js` simply contains zero occurrences of `SANITY`, uses a `$10k` TVL floor
against the product's `$10M`, and sorts APY-descending, making the file a ranked list of the dataset's worst
anomalies. Nothing was computed wrong. The rail was just somewhere else.

145 is the important one to internalise: `apyMean 21,731` ÷ `apyStdev 72,072` = `0.3`. Both 122's
`|Sharpe| ≤ 50` cap and 144's rail bound wave it straight through, and `audit-app.js`'s
`ABSURD_MAGNITUDE = 1e11` never sees it. **A small number computed from big garbage is still garbage.**

## Step 0 — enumerate the SURFACES before you audit the number (added 2026-07-27, item 159)

**A rail is a property of a surface, not of a codebase.** `APY_SANITY_LIMIT` being defined in `app.js:800`
and `planner.js:19` says *nothing* about whether any other emitter applies it. Before checking whether a
railed value is computed correctly, check who publishes it:

```
grep -rnE "\.apy\b|APY" --include='generate-*.js' --include='*.js' . | grep -v test_
grep -Lc "APY_SANITY_LIMIT" generate-*.js     # generators with NO rail — the suspect list
```

Known emitters of rate values, and their rail status as of 2026-07-27:
`app.js` ✅ · `planner.js` ✅ · `PoolDetail.js` ✅ (`mean30dSane`, all four consumers verified; **derived $
nodes railed 2026-07-28, item 165** — before that, ✅ meant "the rate is railed", which is not the same
claim) ·
`compute-kpis.js` ✅ (145) · `generate-token-pages.js` / `generate-chain-pages.js` ✅ (own floors) ·
**`generate-llms.js` ❌ — item 159.**

If a surface is not on that list, it has not been checked — that is exactly how `llms.txt` published
353,114% APY unnoticed for the life of the surface. `llms.txt` was never *decided* to be out of scope; it
simply never entered anyone's field of view because it is a text file, not a page.

## Step 0b — prove your check can fail before you believe it passed

**A filter that returns zero is not evidence of health until you have shown it can return non-zero.**
The live trap, hit by the 2026-07-27 heartbeat's own first data-layer scan:

```js
pools.filter(p => p.apy > 1000).length   // → 0, on every pool, forever
```

`data/pools-snapshot.json` **has no `apy` field.** Its keys are `apyBase`, `apyReward`, `apyMean30d`.
Total APY must be derived: `(p.apyBase || 0) + (p.apyReward || 0)`. The vacuous version reads as a clean
rail and would have done so indefinitely.

**Dual-source schema divergence is the underlying fact:** the live `/pools` payload *does* carry `apy`;
the committed snapshot does not. Code reading `pool.apy` works against one source and silently yields
`undefined` against the other — which is precisely why `generate-llms.js:236/462/576` reads `apy`
successfully (it consumes the live-fetch/SEO-transient shape) while a snapshot-shaped check sees nothing.
Any fixture must match the shape of the source the code under test actually reads. See also
`dual-source-logic-divergence.md`.

Rule: run every rail check against a **known-bad value first**. If it does not fire, the check is broken,
not the data.

## Step 0c — separate the DATUM from the DERIVATION (added 2026-07-28, item 165)

"The rail fires on this surface" is **two** claims, and the product answers them differently:

- **The datum** (the pool's own reported rate) — house convention is **demote + flag, never hide**. The
  ⚠, the forced High risk and the visible rate are the honest treatment. Leave it rendering.
- **Anything DERIVED from the datum** (a compounded projection, a $/day figure, a calculator amount) —
  there is no honest version. Compounding an out-of-rail rate does not produce an exciting number, it
  produces a fictional one. **Suppress it, and say why in words.**

So when you find a flagged-but-absurd surface, do not "fix the flag" — enumerate every node downstream of
the rate and check each one separately:

```
grep -nE "totalApy|apyBase \|\| 0" PoolDetail.js | grep -vE "^\s*//"     # every consumer
```

165's exposure was four unguarded derived-$ nodes sitting next to ONE guarded one (`showConcreteCta`,
item 025) — the principle had been written down in a code comment for weeks and applied to a single
button. **A rail applied at one node is a rail you have not finished applying.**

Two traps when you suppress:

1. **Suppressing the datum can blind your own detector.** `test_audit_app.js` case 2 injects a 9e14
   magnitude into `apyBase` and asserts `audit-app.js` catches it on a real render. Item 144 killed that
   control by suppressing the card it rendered in; item 155 had to restore it. Before gating a render
   node, `grep` the test suite for a control that depends on it rendering.
2. **`?pool=` bypasses the snapshot.** `app.js:1141` always fetches live, so a $10M-railed snapshot proves
   nothing about pool-detail. Measure exposure against `curl https://yields.llama.fi/pools`
   (2026-07-28: 75 of 16,050 pools above the 1000% limit, 3 of them ≥$1M TVL).

## Steps

1. **Find the field's provenance, not just its render site.** `grep` the raw property name across
   `compute-kpis.js`, `src/poller-core.js`, `app.js`, `planner.js`, `PoolDetail.js`, `generate-*.js`. Ask:
   is this read from the API, or computed? If computed, from *what inputs*?
2. **Rail the INPUTS, not only the output.** Decision rule: *if any input to a derived number violates a
   trust rail, the output is not credible regardless of how the output looks.* For rates the rail is
   `APY_SANITY_LIMIT = 1000` (`app.js:800`); for TVL it is `DEFAULT_MIN_TVL`.
3. **Bound each KPI by the points it actually reads** — do not blanket-null. Worked example, `computeKpis()`
   (`compute-kpis.js:127-146`): `apyMean`/`apyStdev`/`apySharpe` read the whole series → null if ANY point
   is out of rail; `apyMomentum` reads only first/last → null only if an ENDPOINT is; `tvlTrend` is
   rate-independent → untouched; `historyPoints`/`firstSeen` are tracking facts → untouched. Over-nulling
   destroys true numbers (the 145 pool's `-0.55` momentum is real — its glitch is mid-series).
4. **Omit, never clamp or clean.** House precedent (122 → 144 → 145): `null` the field and let the
   null-gated render hide it. Do NOT clamp to the rail, and do NOT drop the bad points and recompute — that
   presents a score as though the history were clean. Note `Number.isFinite()` alone is NOT a bound:
   `36452.38798` and `0.3` are both perfectly finite.
5. **Check every consumer for the new null path** before shipping — a field that never had one will have
   readers that assume a number. `grep` the property; confirm each site is `typeof … === 'number'` gated.
   (145 gained a null path on `apyMean`; it turned out to be write-only, but that had to be *checked*.)
6. **Regenerating the data? Diff the churn, don't trust the file count.** `node compute-kpis.js` currently
   rewrites ~428 files and drifts ~1,596 pools' KPIs from *pre-existing* snapshot-vs-history skew. Prove
   what is yours with a `git stash` baseline run of the UNMODIFIED script, then diff `kpis` object-by-object
   against `git show HEAD:<file>` rather than eyeballing `git diff --stat`.
7. **If you hand-apply a generated value, it must be byte-identical to generator output — every field.**
   145's first cut nulled the three poisoned fields correctly but kept HEAD's *stale* `apyMomentum`/
   `tvlTrend`; the item's own new unit test asserted the true value, so the committed snapshot contradicted
   the test. **Trap: a passing test suite does not check the committed data file.** Re-derive the whole
   object from committed history and compare field by field.

## Resolution

Null the poisoned derived fields at the compute layer, regenerate only the affected records, add a unit
assertion for the rail rule plus a rendered assertion that the surface degrades honestly (neutral copy, no
`NaN`/`undefined`/`null`, zero page errors). Risk tier is HIGH whenever the field feeds ranking
(`app.js`'s Risk-adjusted sort, `planner.js`'s tie-break) even though the change only ADDS a bound —
strengthening a rail is not on the NEVER list, but its blast radius is app-wide.

## Traps

- **Output-magnitude guards are structurally blind to poisoned inputs.** This is the whole class. If your
  only defence is "the number looks reasonable", you have no defence.
- **`audit-app.js` cannot find these.** It scans rendered text for absurd magnitude (1e11). A poisoned
  ranking input that renders as `0.3` — or does not render at all yet still orders the grid — is invisible
  to it. This class needs a data-layer read: load the snapshot and cross-check derived fields against the
  history that produced them.
- **A field that renders nowhere can still be load-bearing.** 127 removed the Sharpe *display* line; the
  number kept ranking pools in two places. "Not rendered" ≠ "not user-facing".
- **The upstream question is separate.** Rails on the derived value do not stop the poisoned point being
  *recorded*. Fixing the poller/snapshot ingestion is its own ticket — say so rather than implying the
  data is now clean.
- **`audit-app.js` reads rendered HTML only.** Non-HTML generated surfaces — `llms.txt`, `llms-full.txt`,
  `og/*.png` — are committed, publicly served and read by *nothing* automated (item 160). Two P0/P1
  defects in two consecutive days (148, 159) were both hand-found in this gap. Until 160 ships, a clean
  `audit-findings.json` means "the HTML is clean", not "the product is clean" — write it that way in the
  report.
- **Tightening a rail can empty a surface.** 159's own fix could silently reduce `llms.txt` to zero pool
  lines, which is a different failure wearing the same "no violations" badge. Always pair a
  rail-tightening acceptance criterion with a non-empty/floor assertion.
- **When two rails fire together, the headline fixture proves neither** (added 2026-07-27 from 159's
  build — the second flavour of vacuity, and the one Step 0b's mutation test exists to catch). The
  natural fixture is the pool from the evidence: 159's was `zeebu/ZBU`, `353,114.2%` APY on `$576,877`
  TVL. It is excluded by the **TVL floor alone** — so with `apy <= APY_SANITY_LIMIT` deleted outright,
  that assertion stays **green**. A fixture that survives the mutation is testing the other rail.
  Rule: when a fix applies N rails at once, every rail needs a fixture that **only that rail** can
  reject — here, a second pool at 50,000% APY on $500M TVL. Confirm by deleting each rail
  independently and checking a *different* assertion goes red each time. 159's mutation run:
  strip the APY ceiling → exactly 2 of 14 red (huge-TVL anomaly + the `1000.01` boundary), while the
  headline fixture stayed green. That green is the receipt.

## Provenance

Step 0/0b and the 159 row added 2026-07-27 by the heartbeat that found the `llms.txt` breach — the
vacuous `p.apy > 1000` check in its own data-layer scan is what led to it; asking *"who else reads
`pool.apy`, then?"* produced the finding. Original written 2026-07-26 from item 145 (`specs/145.md`, `145-notes.md`, `145-pr.md`), generalising items 122 and
144. Live case: pool `201e5f6e-cf75-4d0e-b07f-d58da3cee23a` (balancer-v2 WSTETH-AAVE), one 2026-07-20
history point of `260768.6404` among eleven ~0.15–1.25% days. Step 7's trap comes from the verifier's
finding on 145's first cut. Complements `product-audit.md` check 1 (render-site bounds) and
`analytics-regression-triage.md`.
