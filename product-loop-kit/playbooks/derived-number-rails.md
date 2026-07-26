# derived-number-rails — playbook

**When:** a number the product *computes* (rather than reads straight from DefiLlama) is suspect, or you
are auditing a new derived field. Especially when the number **looks fine** — this playbook exists because
the whole class hides behind plausible-looking output. Sibling of `product-audit.md` check 1: that one
scans *rendered* surfaces; this one is for the *compute* layer behind them.

**Answer in one line:** the trust rails are enforced per-field and at display time, so any field DERIVED
from a rate — at any depth — is unrailed until someone rails it, and a magnitude guard on the OUTPUT
cannot see a poisoned INPUT.

## The recurring shape (three items, same root)

| Item | Field | What it rendered | Why the existing guard missed it |
|------|-------|------------------|----------------------------------|
| 122 | `kpis.apySharpe` | `-900,719,925,474,097.9` | `sd > 0` passed on float dust (~1e-16) |
| 144 | `apyMean30d` | `36,452.4%` as a trusted "30d average" | gate was `typeof === 'number'`, no bound |
| 145 | `apyMean` / `apyStdev` / `apySharpe` | an innocuous **`0.3`** | every guard was a MAGNITUDE guard on the OUTPUT |

145 is the important one to internalise: `apyMean 21,731` ÷ `apyStdev 72,072` = `0.3`. Both 122's
`|Sharpe| ≤ 50` cap and 144's rail bound wave it straight through, and `audit-app.js`'s
`ABSURD_MAGNITUDE = 1e11` never sees it. **A small number computed from big garbage is still garbage.**

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

## Provenance

Written 2026-07-26 from item 145 (`specs/145.md`, `145-notes.md`, `145-pr.md`), generalising items 122 and
144. Live case: pool `201e5f6e-cf75-4d0e-b07f-d58da3cee23a` (balancer-v2 WSTETH-AAVE), one 2026-07-20
history point of `260768.6404` among eleven ~0.15–1.25% days. Step 7's trap comes from the verifier's
finding on 145's first cut. Complements `product-audit.md` check 1 (render-site bounds) and
`analytics-regression-triage.md`.
