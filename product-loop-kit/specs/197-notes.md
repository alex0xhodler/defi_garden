# 197 — build notes

## Change made

`audit-app.js` only, plus the two named test files (`test_audit_prescan.js`, `test_audit_static_rotation.js`).
No product file, no generator, no file under `ko/`, `tokens/`, or `chains/`, no `package.json` edit,
no new dependency.

1. **Prescan leg** (`prescanStaticPages()`) — default population extended:
   `listLeafPages('tokens').concat(listLeafPages('chains')).concat(listLeafPages('ko/tokens')).concat(listLeafPages('ko/chains'))`.
   `opts.pages` override behaviour is unchanged (verified: `listLeafPages(dir)` already joins under
   `ROOT`, so `'ko/tokens'`/`'ko/chains'` needed no change to `listLeafPages()` itself).
2. **Per-family reporting** — `prescanStaticPages()` now tracks `scannedByFamily = {tokens, chains,
   koTokens, koChains}`, incremented per scanned rel by path-prefix classification (`ko/` tested
   before the bare EN prefixes — same ordering rule as `routeToLeg()`, see below). Threaded into the
   `prescan` object `buildStaticSurfaces()` builds (`scanned` stays the single combined total; the
   breakdown is additive). `emptyPrescanResult()` grew a zeroed `scannedByFamily` for the same
   never-null-check contract its other fields already have.
3. **`poolLinkLiveness` stays EN-only, DELIBERATE OMISSION.** The per-page level-2 pool-link-liveness
   accumulation block is now guarded `if (poolLinkRan && !rel.startsWith('ko/'))` — a `ko/` page never
   contributes an id to `poolLinkScanIds`/`poolLinkIdClass`/`poolLinkDeadPages`, and never emits a
   `pool-link-liveness` suspect. Both `poolLinkLiveness` result shapes (`ran:false` and `ran:true`)
   gained a `scope: 'en'` field, with an in-code comment citing spec 197 evidence 5 at both the guard
   and the two shapes, so the omission is legible in the findings JSON, not silent.
4. **Rotation legs — option (a), per-family** (see "Rotation design choice" below).
   `buildStaticSurfaces()` gained `koTokens`/`koChains` legs, each with its own `computeRotation()`
   call (`${seed}:koTokens` / `${seed}:koChains` — distinct seed namespaces), own candidate list
   (`listLeafPages('ko/tokens')` / `listLeafPages('ko/chains')`), own `seen` accumulation capped at
   `STATIC_ROTATION_SEEN_CAP`, own entry in `staticRotationState`/`staticRotation`. The override-mode
   (`AUDIT_STATIC_PAGES`) disabled shape gained the same two legs via `emptyStaticRotationLegResult()`,
   so no caller ever needs to null-check the new keys.
5. **Budget** — `DEFAULT_STATIC_SAMPLE` 6→12, `MAX_STATIC_SAMPLE` 12→24. `remainingSampleSize` (after
   prescan promotion) is now split `enSampleSize = Math.ceil(remaining/2)`, `koSampleSize = remaining -
   enSampleSize`, and EACH half keeps the pre-existing 2:1 token:chain ratio
   (`tokenCount = Math.ceil(half*2/3)`, `chainCount = half - tokenCount`). At the new default 12 this
   gives EN 4 tokens + 2 chains (byte-identical to origin/main's pre-197 output) and KO 4 tokens + 2
   chains for the first time — verified directly by test_audit_static_rotation.js's updated criterion 2.
6. **State file schema** — `readStaticRotationState()` now normalizes four legs via the existing
   `normalizeRotationLeg()`, unchanged and un-duplicated. A state file with only the old two EN keys
   (`parsed.koTokens`/`parsed.koChains` both `undefined`) degrades those two legs to fresh
   cycle-0/empty-seen via `normalizeRotationLeg(undefined)`'s own pre-existing fallback — no new
   special-casing was needed, this is 196's factored helper doing exactly the job it was built for.
   `schemaVersion` stays `1` (purely additive). `buildStaticSurfaces()` also re-normalizes whatever
   `opts.staticRotationState` it's handed (test-injected or file-read) through the same helper, so a
   pre-197-shaped test fixture (`{tokens, chains}` only — every pre-197 test in this file's own suite)
   degrades safely instead of throwing on `undefined.seen`.
7. **`STATIC_ROTATION_SEEN_CAP` stays 6000**, comment updated to name all four legs and state the
   per-leg (not combined) invariant explicitly. `test_audit_static_rotation.js` gained a dedicated
   test asserting the cap exceeds each of the four legs' real disk-read population individually,
   alongside the pre-existing combined tokens+chains assertion (left in place, not removed).
8. **`routeToLeg()`** (anchor + promoted-rel routing into `seen`) now checks `ko/chains/` and
   `ko/tokens/` BEFORE the bare `chains/`/`tokens/` prefixes, with a comment calling out why the order
   is load-bearing (a naive bare-prefix-first fallthrough would misfile every KO anchor/promoted rel
   into the EN `tokens` leg). Same ordering was applied to `scannedByFamily`'s classification and to
   the true-negative test's Korean-lead-token probe below.
9. Surface names: unchanged mechanism — `slugFromRel('ko/tokens/usdc.html')` already produces
   `ko/tokens/usdc` with zero special-casing (it's a generic `.replace(/\.html$/, '')`), so surfaces
   render as `static-page:ko/tokens/usdc` for free.
10. CLI summary (`require.main === module` block): added one more `[audit] static rotation (ko): …`
    line mirroring the pre-existing `[audit] static rotation: …` line, so KO coverage is readable from
    plain CLI output, not just the findings JSON. Not covered by any test (no test drives the CLI
    entry point directly — same as every other summary line in this file); purely a readability add
    consistent with the item's own "a reader must tell EN-clean from KO-clean" acceptance bar.

## Rotation design choice: (a) per-family legs, and why

The spec explicitly delegated this choice to the builder with a recommended default. I implemented
**(a) — two extra rotation legs (`koTokens`, `koChains`) with their own `seen` sets**, mirroring
`tokens`/`chains` exactly, for the two reasons the spec itself gave and that held up under
implementation:

- **Per-leg seen-cap checkability.** `STATIC_ROTATION_SEEN_CAP` is asserted against each leg's own
  real disk-read population (test: "seen-cap invariant, per leg"). Under option (b) — one merged
  candidate list per family with `seen` keyed by the full rel path — the SAME cap would need to clear
  a population up to ~4,360 (both languages combined) instead of ~2,186 per leg; today's 6000 still
  clears that, but the invariant becomes "cap exceeds the COMBINED population", a weaker and less
  legible statement than "cap exceeds THIS leg's population", and it silently loses headroom as the
  estate grows (a future language add under (b) would need to clear an ever-larger single number; under
  (a) each new language is its own independently-sized leg with its own cap check).
- **Separately reportable KO coverage.** `staticRotation.koTokens.seenCount`/`.cycle`/`.wrapped` are
  directly readable without re-deriving "how many of the seen ids were KO" from a merged list — this
  is the same "EN-clean vs KO-clean must be tellable without a code read" bar the spec's acceptance
  criteria apply to `prescan.scannedByFamily`, applied consistently to the rotation report too.
- **No architecture change either way** (the spec's own "open questions" note) — (a) was a strictly
  mechanical transplant of the existing `tokens`/`chains` leg pattern onto two new directories, with
  zero new abstractions: `computeRotation()`, `normalizeRotationLeg()`, `emptyStaticRotationLegResult()`
  are all reused verbatim, called with different arguments. This matches the spec's own framing (a
  "call, not a build") more literally than (b) would have — (b) would have required a NEW keying
  scheme (`seen` by full rel path across mixed language dirs) that doesn't exist anywhere else in this
  file, where (a) requires none.

## Budget decision — measured numbers

`DEFAULT_STATIC_SAMPLE` 6→12 and `MAX_STATIC_SAMPLE` 12→24 were chosen so EN throughput is
byte-identical to origin/main (EN half of the new default = 6 = the old whole default; same 2:1 split
= 4 tokens + 2 chains, unchanged) while KO gets an equal-size slice for the first time. This was
**measured**, not estimated, on this exact checkout, before and after the change, each timeboxed at
`timeout 280 …` (⩽5 min foreground wall-clock per the task's instruction):

| Command | Before (origin/main) | After (this diff) |
|---|---|---|
| `node test_audit_prescan.js` | 1m51.854s (48 passed) | 3m15.602s (51 passed) |
| `node test_audit_static_rotation.js` | 6.336s (13 passed) | 3m2.693s (17 passed) |
| `node audit-app.js` (full CLI) | 1m58.941s, `status: "OK"` | 3m16.842s, `status: "OK"` |

All three stayed comfortably inside `FOREGROUND_CAP_MS` (300000ms) both before and after.

**Honest attribution, not a re-estimate of item 192's figure.** Item 192's ~0.19s/surface was measured
for *pool-detail* renders, a different, faster-loading surface class. This file's own header comment
already documents that every **static SEO leaf page** holds `DOMContentLoaded` for ~10s in this sandbox
(a blocked absolute `analytics.js` defer tag) — so the ~78s delta in the full CLI run (118.9s → 196.8s)
is consistent with the ~6 additional real static-page renders this item adds per default tick (13 total
static surfaces post-197 vs 7 pre-197: anchor(1) + EN(4+2) + KO(4+2), vs anchor(1) + EN(4+2)), at
roughly that per-page cost, not with item 192's pool-detail figure — I did not extrapolate from 192's
number and say so in-code (the `DEFAULT_STATIC_SAMPLE`/`MAX_STATIC_SAMPLE` comment in `audit-app.js`
states this explicitly). The `test_audit_prescan.js`/`test_audit_static_rotation.js` deltas are
additionally inflated by their own new pure-fs tests, each of which calls `prescanStaticPages()` with
no `opts.pages` override — now a ~4,360-page regex scan instead of ~2,180 — plus, for
`test_audit_static_rotation.js`, one new real-render `runAudit({staticOnly:true})` call added
specifically to prove the `static-page:ko/…` surface reaches `surfacesCovered` end-to-end (see
"Deviations" below for why that test needed `staticOnly:true` rather than a full unfiltered run).

The full CLI run's own JSON output confirms the budget arithmetic landed exactly as designed:
`prescan.scanned: 4360`, `prescan.scannedByFamily: {tokens: 2093, chains: 87, koTokens: 2093, koChains:
87}` (matches `fs.readdirSync` counts exactly), and `surfacesCovered` included
`static-page:ko/tokens/zeus`, `…/dydx`, `…/min`, `…/stapt`, `static-page:ko/chains/mantle`,
`…/zksync-era` (4 KO tokens + 2 KO chains, alongside the unchanged 4 EN tokens + 2 EN chains) — the
exact 4+2/4+2 split the spec's own worked example describes.

## `poolLinkLiveness` omission — evidence behind it

Spec 197 evidence 5 measured the KO half emitting an **identical** `?pool=` id set to EN (42,604 links,
3,696 distinct ids) — re-resolving those same ids a second time against the live DefiLlama pool set
buys zero additional liveness coverage and would double the live-fetch cost for a duplicate verdict.
This checkout's own real-corpus run (`prescan.poolLinkLiveness` in the full CLI output above) measured
`checkedIds: 3693` (ordinary daily-churn drift from the spec's 3,696, same as `test_audit_pool_link_
liveness.js`'s own "REAL CORPUS true negative" test already tolerates for the EN-only figure) — i.e.
the EN-only count this item's `scope: 'en'` guard produces matches the pre-existing EN-only baseline,
confirming the guard didn't accidentally under- or over-count. `test_audit_pool_link_liveness.js` (run
unmodified, 12/12 passed) further confirms none of its existing assertions — which all drive
`prescanStaticPages()` with `opts.pages` pointed at non-`ko/` scratch fixtures — were disturbed by the
new guard, since none of their fixture paths ever start with `ko/`.

## `package.json` / test-lane confirmation

**Confirmed, no edit made.** Both `test_audit_prescan.js` and `test_audit_static_rotation.js` are
already present in `package.json`'s `test:serial` chain (verified with `grep -n "test_audit_prescan\|
test_audit_static_rotation" package.json` before starting any edit). `run-tests.js` classifies lanes by
a transitive-require scan for anything mentioning "playwright" (its own header comment); both files
`require('./audit-app.js')`, which does, so both land in the `browser` lane — unchanged by this item,
same pre-existing classification `test_seo_surface_audit.js` already gets.

## Deviations from the spec / conservative choices

- **The new `runAudit()`-driven KO-surface test uses `staticOnly: true`, not a full unfiltered run.**
  My first attempt drove a full default `runAudit({staticSeed, outPath})` and it failed with
  `browser.newPage: Target page, context or browser has been closed` — a full run renders ~60 surfaces
  (grid, pool-detail rotation ×32, planner, lenses, plus the 13 static pages), which is expensive
  enough in this sandbox to risk browser/context exhaustion when run alongside sibling test processes
  on adjacent ports. `opts.staticOnly` (an existing, pre-197 knob — `surfaces = surfaces.filter((s) =>
  s.kind === 'static')`) still proves the full wiring (`buildStaticSurfaces()` → `runAudit()` → a real
  Playwright render → `surfacesCovered`) end-to-end, just without also rendering everything unrelated
  to this item's own claim. This is the same convention every other real-render test in this file
  already uses to stay fast/reliable, not a new pattern.
- **`test_audit_prescan.js`'s `deriveJunkSlugRelsFromDisk()` (an independent, non-imported
  re-derivation of the junk-slug predicate used by criteria 1 and 5) was extended from
  `tokens/`+`chains/` to all four dirs.** This was necessary, not optional: `prescanStaticPages()`
  itself now scans EN+KO by default, so criterion 1's "scan output equals independently-re-derived
  disk ground truth" assertion would otherwise only be correct by the coincidence that KO currently has
  zero junk-slug pages (true today per evidence 5, but not a standing guarantee the test itself should
  rely on). This also means criterion 5 (aggregate `static-prescan:junk-slug` count) continues to
  validate correctly against the full post-197 population with no separate change needed there.
- **Criterion 7 in `test_audit_prescan.js` ("budget unchanged") had its literal numbers updated
  in-place** (6→12 sample, 7→13 max surfaces), with a comment explaining that the invariant it actually
  protects (promoted pages replace uniform picks, never grow the total budget) is unchanged — only the
  total moved because raising the budget was a deliberate, spec-mandated decision (design decision 5),
  not a side effect. Similarly, criterion 2 in `test_audit_static_rotation.js` ("the 2:1 split
  survives") had its total-surface-count assertion updated 7→13, with the EN-half assertions
  (`tokens.sampleSize === 4`, `chains.sampleSize === 2`) left completely unchanged to make the
  "EN throughput is byte-identical" claim directly checkable, not just asserted in prose.
- **Local `MAX_STATIC_SAMPLE` mirror constants in both test files were updated 12→24**, following this
  file's own pre-existing convention of re-typing (not importing) the ceiling for use in the
  guarantee-not-luck test-sizing rigs (criteria 3/4/6 in `test_audit_prescan.js`, criterion 6 in
  `test_audit_static_rotation.js`) — `audit-app.js` does not currently export `DEFAULT_STATIC_SAMPLE`/
  `MAX_STATIC_SAMPLE` (only `STATIC_ROTATION_SEEN_CAP`/`readStaticRotationState` are exported for
  backlog 196's own needs), and adding new exports purely to avoid re-typing two integers seemed like
  unnecessary surface area for this item; the existing file already accepts this tradeoff for the same
  constant pre-197.
- **Diff size crosses the spec's own 150-line HIGH-risk trigger.** `git diff --stat` shows 495
  insertions / 56 deletions across the three files (audit-app.js alone: 286 lines changed). The spec's
  own risk-tier section names this as one of two things that would flip the item from LOW to HIGH and
  asks the verifier to check it independently — flagged here explicitly rather than left for the
  verifier to discover unannounced. The size is consistent with the sibling items 154/157/166 the spec
  itself cites as precedent, and is proportional to threading two additional legs through every
  existing per-leg code path (candidate lists, rotation calls, seen accumulation, return shapes) rather
  than any complexity beyond a mechanical transplant.

## True-negative result

**Green, matching spec evidence 5.** `prescanStaticPages({pages: listLeaf('ko/tokens').concat(listLeaf
('ko/chains'))})` against the real, unmodified, committed KO estate (2,180 pages on this checkout)
returned **zero suspects of any signal** — verified both by a dedicated new test
("spec 197 true negative (evidence 5), EXECUTED") and, more broadly, by the pre-existing
"link-target-integrity: TRUE NEGATIVE" test (updated to describe, and now actually exercising, the
full EN+KO combined default population) also returning zero link-target-integrity suspects across all
~4,360 pages. No relaxation of any signal and no emitter change was needed — the finding predicted by
the spec's own hypothesis ("we expect it to ship green") held.

## Positive control — executed

A real KO page (`ko/tokens/usdc.html`) was copied to a temporary probe file directly under
`ko/tokens/` (mirroring, verbatim, the existing EN positive-control pattern in this file — same
`<h1>` lead-token-swap-to-a-date-shaped-junk-token technique, same pid-suffixed temp filename, same
`finally`-block cleanup), with its `<h1>` mutated to `9NOV2026 코 DeFi Yields`. A default
(no-`opts.pages`) `prescanStaticPages()` call correctly flagged the probe as a `junk-slug` suspect at
its real `ko/tokens/…` rel, `scannedByFamily.koTokens` counted it, and — critically — the ORIGINAL
`ko/tokens/usdc.html`'s md5 was asserted unchanged before vs. after the test (proof the detection came
from the scratch probe file, never from editing the committed estate). Probe file removed in a
`finally` regardless of test outcome.

## Test results (exact commands run)

All timeboxed `timeout 280 …` (⩽5 min foreground wall-clock), run from `/home/user/defi_garden`.

```
node test_audit_prescan.js           # 51/51 passed (48 pre-existing + 3 new)
node test_audit_static_rotation.js   # 17/17 passed (13 pre-existing + 4 new)
node audit-app.js                    # status: "OK", 1 finding (pre-existing, unrelated P2, downgraded)
node test_audit_app.js               # 3/3 passed
node test_seo_surface_audit.js       # 8/8 passed
node test_audit_pool_link_liveness.js # 12/12 passed
node test_audit_pool_prescan.js      # 14/14 passed
node test_audit_text_surfaces.js     # 49/49 passed
```

No failures anywhere. The last five files were not named in the build instructions' minimum but were
run as additional confidence: they are the only other `test_*.js` files that reference
`prescanStaticPages`/`buildStaticSurfaces`/`staticSample`/`STATIC_ROTATION_SEEN_CAP`/
`readStaticRotationState` (found via `grep -l` across all `test_*.js`), so they were the highest-risk
candidates for an unintended regression from this item's changes.

## Things not verified / not run

- The full ~100-file `test:serial`/`npm test` chain was **not** run in full — each command was
  individually timeboxed at 5 minutes of foreground wall-clock per the task's explicit instruction, and
  running the full chain (which itself takes considerably longer than 5 minutes based on the individual
  file timings above) was out of that budget. The eight files run above are, by direct `grep` search,
  every file in the repo that touches the functions/constants this item changed.
- Did not attempt a multi-hundred-day rotation simulation for the new KO legs (mirroring the EN legs'
  own 180-day criterion 10) — out of scope for this item's acceptance criteria, which ask only for a
  two-tick threaded-state proof (delivered) plus the seen-cap invariant (delivered), not a long-horizon
  wrap simulation for the new legs specifically.

## Final `git status --porcelain` (this diff only)

```
 M audit-app.js
 M test_audit_prescan.js
 M test_audit_static_rotation.js
```

`product-loop-kit/signals/audit-findings.json`, `audit-rotation.json`, and `audit-static-rotation.json`
were incidentally rewritten by the real `runAudit()`/`node audit-app.js` invocations above (every one
that used `persistRotationState: true` or ran as the literal CLI entry point) and were reverted via
`git checkout --` after each such run, so the final diff contains only the three files this item
intentionally changed.

## Verification rounds

**Round 1 — verifier FAIL (honest, and worth the round).** All 9 spec-literal acceptance criteria passed
and the verifier reproduced every claimed test count independently (51/51 prescan, 17/17 rotation, 12/12
pool-link-liveness) — but it then did what the criteria could not: it **mutated the built code** and found
that two of the nine were non-vacuous only in name.

1. **`routeToLeg()`'s `ko/`-before-bare-prefix ordering had no regression test.** The verifier deleted both
   `ko/` branches — restoring exactly the naive fallthrough the code's own comment (and this item's PR quiz
   question 2) calls load-bearing — and **both test files stayed 100% green**. The ordering was correct in
   the code and completely unprotected.
2. **The KO legs' rotation-state threading was proven only by luck.** The two-tick test used two *different*
   seeds and asserted non-overlap. The verifier hardcoded the KO `computeRotation()` calls to ignore prior
   state entirely and the test **still passed** — it printed the picks to confirm the non-overlap was
   seed-hash coincidence. The EN legs had a rigorous held-out-pool test for exactly this; the KO legs, the
   ones this item exists to add, never got the equivalent.

This is the transplant trap in its purest form: the *code* was a faithful transplant of the EN legs, but the
*tests* were not — and a test suite that mirrors a feature without mirroring its proofs reports coverage it
does not have. Recorded in `playbooks/detector-signal-coverage.md` under the axis-3 build traps.

**Round 2 — fixes, test-file-only (`test_audit_static_rotation.js`, +138 lines, no product-code change).**
Four tests added, each a transplant of the EN test that already proved the same property:

| new test | closes | technique transplanted from |
|---|---|---|
| `routeToLeg ordering, koTokens` / `koChains` | gap 1 | criterion 6's probe/promotion rig (real-suspect-count+1 sizing ⇒ promotion is guaranteed, not seed luck) |
| `held-out pool, koTokens` / `koChains` | gap 2 | criterion 1's held-out-pool rig, same 6 seeds, same `opts.staticRotationState` injection |

Both fixes were mutation-proved by the builder before being handed back, each restored byte-exact
(`git diff --stat audit-app.js` confirming the mutation, `git checkout --`, `git status --porcelain` clean):

- naive-fallthrough mutation → **19 passed / 2 failed**, the two `routeToLeg ordering` tests red *by name*;
  every other test, criterion 6 included, stayed green (the mutation touches only KO-rel routing).
- KO-legs-ignore-prior-state mutation → **19 passed / 2 failed**, the two `held-out pool` tests red *by name*
  — and the pre-existing luck-prone two-tick test **stayed green under that same mutation**, independently
  reproducing the verifier's finding rather than taking it on trust.

Clean run after both fixes: **21 passed / 0 failed, 3m8.569s** (was 17 passed / 3m2.693s — the four new
tests cost ≈6s combined; two are in-memory sweeps, two each pay one ~1.6s real fs/regex scan of the
~4,360-page estate).
