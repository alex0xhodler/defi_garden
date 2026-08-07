# 208 — Phase 1 measurement notes (and the go/no-go it produced)

Branch `claude/loop-208`. **Verdict: NO-GO on Phase 2. Item PARKS at the end of Phase 1, per the spec's
own instruction — "Stopping at 207 is a successful outcome, not a failure."**

Phase 1 is measurement only, so no product code was written. The measurements were produced by a
dispatched Sonnet 5 agent (standing decision 2026-07-13) running a throwaway script kept OUT of the repo
(`scratchpad/measure-208.js`); the operator re-measured every number the verdict depends on with its own
commands (below), did the population/variant reasoning, applied the decision rule and wrote this file.
`git status --short` was empty after the agent's run — the repo was never touched by the measurement.

## Method (so the numbers are reproducible, not asserted)

- Live feed fetched **once** from `https://yields.llama.fi/pools` (10,836,142 bytes) and cached; every
  measurement reads that one cache, so all four populations are measured against the *same* instant.
- The widened history points are generated with the repo's **real** `slimPoint` (`require`d from
  `compute-kpis.js`, not reimplemented) into the **real** envelope — verified key-for-key against the
  committed point: `{schemaVersion, date, generatedAt, count, pools}`.
- Deep-linked ids extracted from the EN static estate exactly as `audit-app.js` does
  (`extractDeepLinkPoolIds` + `POOL_ID_UUID_RE`, `audit-app.js:251`), replicated because that helper is not
  `module.exports`ed; 2,193 EN pages scanned (2,106 `tokens/*.html` + 87 `chains/*.html`).
- Sizes: `stat -c%s <file>` for raw, `gzip -9 -c <file> | wc -c` for compressed. **The gzip figures below
  are the operator's own re-measurement**; the build agent reported values ~4-5% lower from a different
  gzip invocation. The discrepancy flips no verdict (see §Decision), and the larger — more conservative —
  numbers are the ones recorded.

### Population drift, recorded rather than smoothed over

The spec and `signals/2026-08-02.md` say **3,669** deep links and **736** snapshot pools. Measured on this
checkout today: **3,670** deep-linked uuid ids and **732** snapshot/history pools
(`data/pools-snapshot.json` and `data/history/2026-08-02.json` both self-report `count: 732`). Both
artifacts regenerate daily from the live feed, so a few pools crossing the floor between ticks is expected
drift, not a defect. Every figure below uses the **measured** counts. This matters for the verdict: the
population is not a fixed number a design can be sized against once, it *moves daily* — see §Decision.

## M1 — the widened history point, actually generated

| point | ids | raw bytes | `gzip -9` bytes |
|---|---|---|---|
| committed baseline `data/history/2026-08-02.json` | **732** | **40,704** | **22,461** |
| widened, deep-linked only | 3,670 | **203,038** | 110,934 |
| widened, **union** (deep-linked ∪ snapshot) | **3,979** | **219,610** | 119,793 |
| sub-rail-only sidecar (the marginal set) | 3,247 | **179,010** | 97,954 |

- **3,670 of 3,670** deep-linked ids resolved in the live feed; **0 unresolved** (consistent with
  `poolLinkLiveness`'s "3,669 ids, 0 dead" the same morning).
- Overlap deep-linked ∩ snapshot = **423**, so the union is 3,670 + 732 − 423 = 3,979. ✓
- Widened/baseline ratio: **4.99×** (deep-linked only), **5.40×** (union).

**The union row is the one that matters, and it is the row the spec did not ask for.** The spec frames the
cost as "~3,669 pools vs ~736". But 732 − 423 = **309 snapshot pools are not deep-linked**, and their
series is what every *shipped* KPI on the grid reads. A widened point containing only the deep-linked set
would silently destroy those 309 pools' track record. So the deep-linked-only figure is not the cost of
anything implementable; the union is the floor for a single-file design, and the sidecar is the floor for
an additive design.

## M2 — repo delta at `HISTORY_RETENTION = 30`

Current actual: **816,785 bytes across 20 files** (`du -sb data/history`) — the series has not yet reached
full retention. At full retention today's shape costs 40,704 × 30 = **1,221,120 B (1.221 MB)**.

| variant | total at ×30, raw | delta vs 1.221 MB, raw | delta, gzipped |
|---|---|---|---|
| deep-linked only (not implementable — see M1) | 6,091,140 B = **6.091 MB** | 4.870 MB | 2.655 MB |
| **union, single widened series** | 6,588,300 B = **6.588 MB** | **5.367 MB** (5.119 MiB) | 2.920 MB |
| **sub-rail-only sidecar** (new additive series, `data/history/*` untouched) | 5,370,300 B = **5.370 MB** | **5.370 MB** (5.122 MiB) — a new series, so total *is* the delta | 2.939 MB |

Commit cadence: the history append piggybacks the existing daily `sitemap-update.yml` commit (the KPI step
at `.github/workflows/sitemap-update.yml:82-89` runs inside the same job that already commits the
regenerated sitemap/pages), so widening adds **no extra Vercel deployment** — the 2026-07-13 quota
decision is not implicated on the cadence axis. It *is* implicated on the payload axis: ~180-220 KB of
churn added to a commit that fires every day.

## M3 — the lean `id → kpis` artifact, gzipped

Shape measured: `{schemaVersion, generatedAt, kpis: {"<pool-id>": {historyPoints, firstSeen, apyMomentum,
apyStdev, apyMean, apySharpe, tvlTrend}}}` — 182's baked-artifact envelope, `computeKpis`'s exact field set.

| artifact | entries | raw bytes | `gzip -9` bytes | vs 250 KB rule |
|---|---|---|---|---|
| all deep-linked | 3,670 | 615,652 | **128,370 B ≈ 125.4 KiB** | **PASSES** |
| sub-rail only | 3,247 | 544,568 | **113,381 B ≈ 110.7 KiB** | **PASSES** |

**Method disclosure, because it changes how much the number is worth:** no sub-rail pool *has* computed
KPIs, so the values cannot be real. Each entry's **key** is a real pool id; its **value** is one of the
**732 real committed `kpis` objects** from `data/pools-snapshot.json`, cycled (`snapshot.pools[i % 732]`).
Field presence, null density and numeric-string lengths therefore match production, but this is a measured
serialization of **real-shaped** values, not of real values. It is an upper-ish estimate of the truth: a
freshly-widened population would start at `historyPoints: 1` with `apyMomentum`/`apyStdev`/`apySharpe`/
`tvlTrend` all `null`, which serializes **smaller**. So the artifact passing is robust.

## M4 — can `compute-kpis.js` even source a series for sub-rail pools?

**The D1 half: NO, definitively — and this is the question the spec said could collapse the whole cost.**

`src/poller-core.js:48` — `if (tvl < DEFAULT_MIN_TVL) return;` with the comment **"$10M floor — the ONLY
drop"** (`:19`). The Cloudflare poller applies the **same $10M rail at write time**, so D1's population is
the same ~732-pool set the snapshot holds. `DB_WINDOW_DAYS = 90` buys a longer *window* and intraday
*granularity* over the same pools; it buys **zero** additional population. Corroborated by 108's own
provisioning note in BACKLOG.md ("the hourly poller's FIRST live batch fired 2026-07-23 15:00:57 UTC,
**~734 rows**") — 734 rows/hour is the railed set, not 3,670.

Measured size of the gap D1 cannot close, over the 3,670 resolved deep-linked ids at today's live TVL:

| | count | share |
|---|---|---|
| ≥ `DEFAULT_MIN_TVL` ($10M) — could ever have D1 history | **423** | **11.53%** |
| < $10M — no D1 history possible | **3,247** | **88.47%** |
| < $1M | 2,269 | 61.83% |

min **$52,938** · median **$516,638** · max **$17,432,476,484**.

**The other half: a real backfill source DOES exist, and this was not in the spec.** Probed once (not
looped) against a genuine sub-rail deep-linked pool — `067f95e9-6d10-45e0-af60-4dd957af46ce`
(uniswap-v2 0X0-WETH, Ethereum, **TVL $791,756**):

```
curl https://yields.llama.fi/chart/067f95e9-6d10-45e0-af60-4dd957af46ce
→ HTTP 200, 193,055 bytes, 1,190 data points, 2023-03-01 → 2026-08-02
  each: {timestamp, tvlUsd, apy, apyBase, apyReward, il7d, apyBase7d, pricePerShare}
```

So sub-rail KPIs would **not** have to accrue from today forward — ~3.5 years of real per-pool history is
fetchable now, for at least this sub-$1M pool. **This makes the blocker economic, not one of feasibility**,
which is a materially different thing to tell the human than "we can't".

## Decision — applying the rule

> *"proceed only if the widened history costs **< 5 MB** total across the 30 retained points **and** the
> lean pool-detail artifact is **< 250 KB gzipped** **and** the initial grid payload is provably
> unchanged."*

| criterion | measured | verdict |
|---|---|---|
| widened history < 5 MB across 30 points | **6.588 MB** total (union) / **5.370 MB** (cheapest implementable variant); as a *delta*: 5.367 MB / 5.370 MB | **FAILS** |
| lean artifact < 250 KB gzipped | 125.4 KiB / 110.7 KiB | passes |
| initial grid payload provably unchanged | Phase 2 acceptance item, not reached | n/a |

**One criterion fails, so the rule says stop.** Four things make that failure robust rather than marginal:

1. **It fails on every implementable variant.** Union single-series (6.588 MB total / 5.367 MB delta) and
   additive sub-rail sidecar (5.370 MB) both overshoot. The only variant that would come closer is the
   deep-linked-only point, which is not implementable at all (M1).
2. **It fails under both unit conventions.** 5.367 MB decimal = 5.119 MiB; 5.370 MB = 5.122 MiB. MB-vs-MiB
   does not flip it.
3. **It fails under both readings of "costs … total".** Read as total-at-retention: 6.588 MB / 5.370 MB.
   Read as marginal delta: 5.367 MB / 5.370 MB. Every cell is over 5.
4. **Raw bytes is the reading the spec intends.** Its §Change asks for the "byte cost of one widened
   `data/history/<date>.json` … × `HISTORY_RETENTION` (30) = the repo-size delta" — and asks for **gzipped**
   explicitly *only* for the lean artifact, one item later. The spec author distinguished the two on
   purpose. Recorded honestly: **on gzipped bytes the history criterion would pass** (2.92 MB / 2.94 MB
   delta, ~2 MB of headroom), so a human who reads "5 MB" as git-stored bytes would get the opposite
   verdict. That is the single assumption this NO-GO rests on, and it is stated rather than buried.

And the drift in §Method compounds it: the deep-linked estate is regenerated daily from the live feed at
the $100K floor, so the population that sets this cost **moves every day and trends with the market**. A
threshold cleared by ~2% of headroom on gzipped bytes is not a threshold a daily-growing artifact stays
inside.

**Outcome: stop at 207.** The blank on 88.5% of `?pool=` arrivals is now an honest note (207's
`rateHistoryUnavailable` tier, shipped today), and the three trust notes stay a ≥$10M feature — **a
deliberate, measured, documented limit rather than an unnoticed one**, which is exactly the disposition
the spec pre-authorized.

## What Phase 1 found that the spec did not anticipate (for the human, not built)

The spec assumed the shape must be *"widen the retained history, then derive KPIs from it"* — and that is
the shape whose cost fails. M4's probe suggests a third shape the spec never considered:

> **Compute sub-rail KPIs at CI time directly from `yields.llama.fi/chart/<id>` and retain only the lean
> artifact — never widening `data/history/` at all.** Storage cost collapses from ~5.4 MB of daily-churning
> retained history to a single ~110 KiB-gzipped artifact (M3), the existing history series stays
> byte-untouched, and the KPIs would be backed by ~3.5 years of *real* history instead of accruing from
> zero. The trade moves entirely to **CI time and API politeness: ~3,247 additional requests per daily
> run**, plus a dependency on an endpoint the repo does not currently use.

This is **deliberately not built**. It is a different architecture from the one specced, it changes the
data layer's external dependencies, and `prompts/build.md` §1 is explicit that an open question which
changes the architecture is never guessed. It is filed for the human alongside the spec's own still-open
question (is tracking ~3,670 sub-rail pools *desirable*, or is "we track the larger pools daily" a line
worth keeping as positioning?). Both questions now have a measured cost attached, which is what Phase 1
was for.

## Bookkeeping

- No product file, generator, generated surface, test or dependency is touched. The diff is this file,
  `208-pr.md`, a new playbook + its README index line, a `## Territory notes` append to `208.md`, the
  BACKLOG row and the LOG entry.
- `npm ci` then `npm run test:fast` (`run-tests.js --lane=plain`) → **42 pass / 0 fail / 0 timeout**, run on
  this branch. The 88-file browser lane was **not** run and is **not** claimed green — a docs-only diff
  cannot regress a rendered surface, and the 5-minute foreground timebox binds.
- No new instrumentation, deliberately: Phase 1 ships no user-visible change, so there is nothing to
  measure. The item's `Measure until` column is cleared rather than left pointing at a window that will
  never be read.
