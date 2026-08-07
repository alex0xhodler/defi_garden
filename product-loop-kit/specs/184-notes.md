# 184 — build notes (deviations, conservative choices, and why)

Item: automate level-2 (`?pool=` deep-link liveness) checking on the HTML estate.
Branch: `claude/loop-184`. Built 2026-07-30.

---

## 1. The numbers moved between the spec and the build — stated, not silently reconciled

Spec 184's hand-measurement (same day, earlier tick) vs this build's measurement:

| | spec 184 | this build |
|---|---|---|
| live DefiLlama pools | 15,992 | 15,927 |
| pages scanned (`tokens/` + `chains/`) | 2,181 | 2,178 |
| globally-distinct `?pool=<uuid>` deep links | 3,677 | **3,670** |
| dead ids | 4 (0.11%) | **1 (0.027%)** |
| pages affected | 5 (`aeon`, `harambe`, `robinhood`, `solna`) | **1 (`tokens/loop.html`)** |
| verdict | drift, inside budget | drift, inside budget (allowance 36.7) |

The delta is exactly what the spec predicted would happen: *"They are drift; the next daily bake resolves
them."* Between the heartbeat's hand-run and this build, `chore: update sitemap and LLM files with latest
yields` (f89bcab99) re-baked the estate and the four ids the spec listed resolved. The one that remains
(`cc7ada00-66ed-5eb6-a582-e70b2adda23a` on `tokens/loop.html`) is a *different* id from all four the spec
named — the drift set shares zero members with the spec's, which is the same non-membership property item
181 documented across its own four measurements (specs/181.md §2-3). That is the strongest available
evidence that this class is churn, not a repo defect.

**The estate was NOT regenerated to make the gate green.** `git diff origin/main -- tokens/ chains/` = 0
lines. Regenerating would have been "the opposite of this item" in the spec's own words.

**Third measurement, ~20 minutes later, by the verifier:** 15,921 live pools, the same 3,670 distinct deep
links, **2** dead ids on 2 pages — `cc7ada00-…` (the one this build found) plus one *new* id that went dead
in the interval. Still 0.05% against a 36.7-id allowance, still green. Recorded here because it is the
cleanest possible demonstration of the thing the gate is built around: three measurements of the same
unchanged tree, three different dead sets, no diff in between. That is churn, and it is exactly why this
class must be *bounded* rather than *repaired*.

## 2. The gate ships GREEN, as a proven true negative

`checkedIds=3,670, deadIds=1, pagesAffected=1, contract=0, stale=0, drift=1 (allowance=36.7, 0.027%),
ok=true`.

Non-vacuity is proven three separate ways, all inside `test_audit_pool_link_liveness.js`:
- 9 synthetic cases drive each class to red independently (`contract` ×2 sub-rules, `stale` ×2 sub-rules,
  `drift` under/over budget, plus `unrun` and `not requested`).
- The real corpus is scanned against the real live pool set and asserted green.
- A **copy** of a real committed page (`tokens/usdc.html`) is written to a scratch dir, one live id swapped
  for a syntactically-valid nonexistent uuid (its `tp-pool-link` anchor kept, so it is *not* a contract
  failure) and its `Last updated` backdated — the gate flips RED with a `stale` suspect. The test then
  asserts `tokens/usdc.html`'s md5 is unchanged, so the proof can never have come from editing the estate.

## 3. Contract sub-rules shipped fatal-at-count-1, after verifying they hold at 100% today

181's branch condition ("if it holds for 100% today, ship it as a contract rule") was checked before the
rule was written, over all 2,178 pages / 4,343 per-page-distinct link instances:
- ids failing the UUID shape: **0**
- ids in a `?pool=` href with no matching `tp-pool-link`/`cp-pool-link` anchor on the same page: **0**

Both therefore ship as FATAL at any count. Neither ever consults live data, so neither can redden for a
reason no diff can fix — the property item 181 built the three-class split to guarantee.

## 4. Deviations from the brief / spec

**(a) `package.json` was edited — one line, to register the new test.** The build brief handed to the
coding agent listed `package.json` as untouchable, which was stricter than the spec: acceptance criterion 8
explicitly reads *"= 0 lines **beyond any test registration**"*. `run-tests.js` does not glob `test_*.js` —
it parses the exact chain out of `package.json`'s `test:serial` script — so an unregistered file is a gate
that never runs, which would have defeated the item. The operator (not the coding agent) added
`node test_audit_pool_link_liveness.js` to the chain, between its two nearest siblings
(`test_audit_text_surfaces.js` and `test_audit_planner_surface.js`). That is the whole `package.json` diff:
1 insertion, 1 deletion, no dependency change.

**(b) Lane: `browser`, not `plain` — and this is correct, not a miss.** `run-tests.js`'s `classifyLane()`
is *transitive* (`mentionsPlaywrightTransitively`): the new test `require`s `audit-app.js`, which mentions
playwright, so it classifies `browser` — exactly like all nine existing `test_audit_*.js` files, none of
which is plain either. The test itself launches no browser and needs no server; it runs in ~15s standalone.
So the spec's "Node-only item — browser-lane 'unrun' is the expected honest answer" holds for the *item*,
while the *file* still runs under a full `npm test`. Stated plainly rather than reported as plain-lane
coverage it does not have.

**(c) `MS_PER_DAY_184` is a new constant in `audit-app.js`.** It is a units conversion
(`24*60*60*1000`), not a threshold. 181's own `MS_PER_DAY` is not exported (the spec's export list is the
four items 184 actually needs), so restating the units conversion was the alternative to widening 181's
export surface. **No threshold is restated**: `DRIFT_BUDGET_FRACTION` and `STALE_AFTER_DAYS` are only ever
read through `cta181.*`. `grep -n "DRIFT_BUDGET" audit-app.js` shows the require comment and
`cta181.DRIFT_BUDGET_FRACTION` uses only — no second numeric literal, per 174's one-constant rule.

**(d) `cta181.verdictFor()` is reused verbatim, with its parameter fed a different unit.** 181's
`scannedWithCta` counts *pages*; here it is fed the count of *globally distinct deep-link ids*, because
that is the denominator this spec measures against ("4 dead of 3,677 distinct links"). Reusing the function
was judged strictly better than copying its three lines of arithmetic — but the mismatch is named in a
comment at the call site and here, rather than left for a reader to discover. The printed budget text
inherited from `verdictFor` says "scanned-with-CTA pages"; the audit's own `poolLinkLiveness` summary
reports the correct units.

**(e) `runAudit()` now performs a live (or ≤6h-cached) pool fetch by default.** This is what spec section
"Change" asks for — the check must run in the audit, and level 2 is not decidable offline (that is exactly
the class-10 trap item 175 refused to walk into with the snapshot). Consequences, accepted deliberately:
- Every pre-existing `test_audit_*.js` that calls `runAudit()` now also resolves the pool set. All nine
  were re-run (see §5); the added cost is a cache read after the first fetch.
- A kill switch exists — `opts.poolLiveness === false` / `AUDIT_POOL_LIVENESS=0` — and it produces
  `reason: 'not requested'` (silent), never `'unrun'` (blocking). Only a *requested-but-failed* fetch is
  blocking, which is the spec's "must not silently pass the gate" requirement.

**(f) One suspect per page per class, but counts are per distinct id.** Suspects follow 169/172's
convention (a systemic breach is one suspect quoting ≤3 examples, never one finding per link); the
`poolLinkLiveness` counts are per distinct id with worst-class-wins, because the budget's denominator is
ids. The asymmetry is intentional and both halves are commented.

## 5. Test results, stated in full

- `node test_audit_pool_link_liveness.js` → **12 passed, 0 failed**.
- `node test_seo_cta_targets.js` (181, the file 184 modified) → unchanged behaviour, PASS.
- `node -e "require('./test_seo_cta_targets.js')"` → requires clean, runs no scan (the `require.main`
  guard).
- `node run-tests.js --lane=plain --timeout=240` → **`TOTAL pass=39 fail=0 timeout=0 total=39`** (re-run by
  the operator, verbatim).
- **All nine pre-existing `runAudit()` callers re-run individually** (this item changes `runAudit`, so
  running only the plain lane would have been dishonest coverage):

  | file | result |
  |---|---|
  | `test_audit_app.js` | 3 passed, 0 failed |
  | `test_audit_text_surfaces.js` | 46 passed, 0 failed |
  | `test_audit_pool_prescan.js` | 14 passed, 0 failed |
  | `test_audit_cta_provenance.js` | 20 passed, 0 failed |
  | `test_audit_runner.js` | 9 assertions passed |
  | `test_audit_planner_surface.js` | 9 passed, 0 failed |
  | `test_audit_planner_flow.js` | 11 passed, 0 failed |
  | `test_audit_prescan.js` | 40 passed, **1 failed** — pre-existing, see §6 |
  | `test_seo_surface_audit.js` | 4 passed, **1 failed** — pre-existing, see §6 |

## 6. Two pre-existing failures, proven pre-existing — NEITHER caused by this item

Both were reproduced on a clean `origin/main` checkout via `git stash -u`, with identical tallies.

**(a) `test_audit_prescan.js` → `A6b (spec 171)`.** The case counts occurrences of the literal string
`"reconcilePrescanFindings("` in `audit-app.js`'s source and expects exactly 3, getting 5. Baseline
`grep -c` = **5** and baseline result = the identical **40 passed, 1 failed**. Item 184 adds zero
occurrences of that string. The assertion went stale on `main` when two of the five occurrences became
*comments* (`audit-app.js:2741`, `:3127`) rather than call sites, and the assertion counts raw text.

**(b) `test_seo_surface_audit.js` → `criterion 2 (positive control)`.** It expects a `junk-slug` P1 for
`tokens/00.html`; got `[]`. Cause: **`tokens/00.html` no longer exists** (`ls` → no such file) — the
generator stopped emitting that junk slug, so the positive control has nothing to render. Baseline result =
the identical **4 passed, 1 failed**.

Both are recorded here rather than fixed: fixing either is a second item, and the build loop does exactly
one. Both are candidates for the next backlog grooming pass — (b) is the more interesting one, since a
positive control that silently has no subject is a gate quietly proving nothing, which is the same failure
class this very item exists to prevent.
