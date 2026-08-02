# 206-notes: pool-detail rotation candidate population widening

Build-loop item 206, branch `claude/loop-206`. Notes written as I went, per the
brief.

## Summary of the change

`prescanStaticPages()` (audit-app.js) already scanned every generated SEO
page for `?pool=` deep links (for the 184 pool-link-liveness signal). Item
206 hoists that single per-page extraction into a named helper
(`extractDeepLinkPoolIds(html)`), calls it unconditionally for every
non-`ko/` page (accumulating a scan-level, shape-filtered `deepLinkPoolIds`
Set), and threads that population through `buildStaticSurfaces()` →
`runAudit()` → `buildPoolSurfaces()`, where the pool-detail rotation's
candidate population becomes `snapshot ids ∪ (deep-linked ids ∩ live ids)`
instead of the snapshot alone. The `∩ live` step is enforced in
`buildPoolSurfaces()` itself (not left to the caller) so a fixture-less id
can never enter the rotation. `ROTATION_SEEN_CAP` raised 2000 → 12000
(union is ~3,985 on this checkout, comfortably under the new cap with
>=2x headroom). A second LIVE-shape fixture body (`subRailLiveBody`,
additive — `liveBody` is untouched) is built once per run and served only to
surfaces `buildPoolSurfaces()` marks `subRail: true` (rotation/lens picks
whose id is absent from the snapshot); `poolsById` is extended with the same
records so the pool-detail driver's `project` lookup resolves for them too.

## Measured numbers (this checkout, 2026-08-02)

All measured directly against the real, committed `data/pools-snapshot.json`
and the real generated estate — never hand-typed.

| quantity | value |
|---|---|
| `data/pools-snapshot.json` pool count | **736** |
| estate `?pool=` deep-linked ids (`prescanStaticPages().deepLinkPoolIds.length`) | **3,669** |
| union (snapshot ∪ deep-linked, deduped) | **3,985** |
| `poolRotation.candidateCount` (union − anchor, no promotion) | **3,984** |
| `ROTATION_SEEN_CAP` (raised) | **12,000** (>3x the union — comfortable headroom) |
| `deepLinkIds` field in the "nothing filtered" test scenario (net-new beyond snapshot) | **3,249** |
| sub-rail picks in one default-`poolSample`(32) rotation tick (pure-function test) | **26 of 32** |
| sub-rail picks in a REAL full `runAudit()` run (no `only`, default config) | **27 of 32** |
| `prescanStaticPages()` real-estate scan wall time (no browser) | **~1.0s** (4,304 pages scanned: tokens+chains+ko/tokens+ko/chains) |
| full default `runAudit()` wall time (82 surfaces, incl. the widened rotation) | **~3m20s** (well under the 5-minute `FOREGROUND_CAP_MS`/`DEFAULT_TIME_BUDGET_MS`), `status: "OK"`, `truncated: false`, **0** blocking findings |
| real-corpus `deepLinkSource` on that same full run | `"3666 of 3669 deep-linked ids confirmed live, 3247 net-new beyond the snapshot"` (3 dead links — matches the pre-existing pool-link-liveness signal's own `deadIds=3` reading from the same tick) |

These numbers match specs/206.md's evidence table almost exactly (3,669
deep-linked ids identical; snapshot 736 vs the spec's 736; union computed
here as 3,985 vs the spec's implied ~3,985) — the small day-to-day variance
(3,985 vs 3,983 between two different runs a few minutes apart) is ordinary
live-feed churn (a pool going in/out of the live `yields.llama.fi/pools`
feed), not measurement error.

## Design deviations / conservative choices (with reasons)

1. **`deepLinkIds` field redefined as NET-NEW, not raw-intersection.** The
   spec's Change item 4 just says `poolRotation: {snapshotIds, deepLinkIds,
   union, reachable}` without pinning an exact formula for `deepLinkIds`. My
   first pass defined it as `deep-linked ids ∩ live ids` (raw), which broke
   test criterion 4's requirement ("livePoolIds = snapshot ids only → …
   deepLinkIds is 0") — because ~420 of the estate's deep-linked ids ARE
   snapshot ids, so the raw intersection is ~420, not 0, even when the
   deep-linked leg adds ZERO new candidates. Redefining `deepLinkIds` as the
   **net-new** contribution (`subRailOnlyIds.size` — live-confirmed AND
   absent from the snapshot) makes `union === snapshotIds + deepLinkIds`
   hold as a clean, always-true invariant, and matches criterion 4's literal
   expectation. `deepLinkSource` (a free-text field) still reports BOTH
   numbers ("N of M deep-linked ids confirmed live, K net-new beyond the
   snapshot") so nothing is lost, just relocated to prose.
2. **`opts.deepLinkPoolIds` accepted at the `runAudit()` level as a direct
   test-injection override**, preferred over `staticResult.prescan.deepLinkPoolIds`
   when supplied. Not explicitly named as a `runAudit()`-level opt in the
   spec's "Change" section (§1-4), but the spec's own Tests §5 requires it
   ("inject it via … opts.deepLinkPoolIds: [syntheticId]") — a synthetic id
   the real static estate could never actually link to has no other way to
   reach the widened population without this override. Same convention as
   every other `opts.X` test-injection knob already in this file
   (`opts.rotationState`, `opts.livePools`, `opts.snapshot`, …).
3. **`test_audit_cta_provenance.js`'s 8 fixture-snapshot `runAudit()` calls
   now pass `poolLiveness: false`.** Not requested by the spec, but required:
   without it, every one of those calls — which use tiny synthetic
   snapshots (6-13 fake `p0000000`-style pool ids) specifically to keep the
   183/191/192 wall-clock-guard tests fast, deterministic, and
   network-isolated — would, under this item's new DEFAULT behaviour, pull
   in the REAL committed estate's ~3,669 deep-linked ids intersected with a
   REAL `cta181.loadPools()` fetch (network/cache) as additional rotation
   candidates. That silently breaks the fixture-only population two of those
   tests depend on (their `only:` allowlists are computed from a PURE
   `buildPoolSurfaces()` call against the SAME tiny fixture, so real-world
   uuids picked instead never match, and the wall-clock-guard assertions
   about `truncated`/`renderedCount` go wrong for a completely unrelated
   reason). `poolLiveness: false` is the documented kill switch (spec §4)
   for exactly this scenario, so this is a one-line addition per call site,
   not a rewrite. Measured before/after (see Test results): with the fix,
   this file goes from **31/35 → 33/35** passing, i.e. the fix recovers the
   2 tests genuinely broken by widening, leaving 2 that are pre-existing red
   on `origin/main` (proof below).
4. **`ROTATION_SEEN_CAP` set to 12,000, not the minimum-sufficient ~4,000.**
   Mirrors `STATIC_ROTATION_SEEN_CAP`'s own already-established ">=2x
   headroom" convention (backlog 196's comment) rather than picking a tighter
   number — the same trap (a cap that clears TODAY's population but not
   tomorrow's growth) has now recurred three times in this file's history
   (183 → 196 → 206), so headroom is the documented house style, not a new
   judgment call.
5. **Lens surfaces (`lensPick: true`) also get marked `subRail: true`** when
   built from a sub-rail rotation pick (spec's §7 example sentence only
   mentions the 1280px rotation surface explicitly). Left unmarked, a lens
   render of a sub-rail pool would still hit the plain `liveBody` (no record
   for that id) and produce a fabricated dead-end/empty-state finding on the
   `@360px`/`@dark`/`@ko` variant — exactly the failure mode item 206 exists
   to prevent, just one surface later. Conservative extension, not a
   deviation from intent.
6. **Static prescan (`opts.prescan`) left ON by default** for the widened
   population's data source (`staticResult.prescan.deepLinkPoolIds`) — i.e.
   nothing in `buildPoolSurfaces()`/`runAudit()` special-cases "disable
   prescan to save time" for the widening itself. The full real-estate scan
   measured at ~1.0s (see table above), so there was no wall-clock reason
   to special-case it. The NEW test file's own two rendered runs (criterion
   5) DO pass `prescan: false`, purely to shave the (already-small) static
   scan cost off two runs whose synthetic id doesn't need it anyway (they
   inject `deepLinkPoolIds` directly) — documented in the test file's own
   header comment, not a change to the production default.
7. **No new npm dependency, no change to `sampleBySeed`/`computeRotation`/
   the wall-clock guard/the `audit-rotation.json` schema.** The widened ids
   join the exact same rotation machinery (same `computeRotation()`, same
   `rotationPick`/`lensPick` markers, same seen-cap trim, same
   `AUDIT_TIME_BUDGET_MS` guard) — confirmed by the full real run above
   completing with `truncated: false` well inside budget.

## Positive-control transcripts (criterion 5, spec's mandatory rendered proof)

Both runs use a **one-real-pool temp snapshot** (so the anchor consumes the
snapshot's only id and the union's lone OTHER candidate is the synthetic
id — `poolSample: 1` then deterministically renders it, no seed-hunting) and
inject a synthetic pool id `abcdef01-2345-6789-abcd-ef0123456789` (valid
uuid shape, confirmed absent from the real snapshot) via `opts.livePools` +
`opts.deepLinkPoolIds`.

### Injected run — apyBase = 900719925474097.9, apyReward = 1

```
=== INJECTED RUN (apyBase=900719925474097.9, apyReward=1) ===
[audit] playwright resolved from global (1.56.1) at /opt/node22/lib/node_modules
surfacesCovered: [ 'pool-detail:abcdef01' ]
findings on pool-detail:abcdef01 : [
  {
    "surface": "pool-detail:abcdef01",
    "viewport": "1280px",
    "check": "number-sanity",
    "severity": "P0",
    "detail": "astronomical value \"287,689,543,248,392.5\" (|value| = 2.88e+14)"
  },
  {
    "surface": "pool-detail:abcdef01",
    "viewport": "1280px",
    "check": "number-sanity",
    "severity": "P0",
    "detail": "astronomical value \"900,719,925,474,097.9\" (|value| = 9.01e+14)"
  },
  {
    "surface": "pool-detail:abcdef01",
    "viewport": "1280px",
    "check": "number-sanity",
    "severity": "P0",
    "detail": "astronomical value \"900,719,925,474,098.9\" (|value| = 9.01e+14)"
  },
  {
    "surface": "pool-detail:abcdef01",
    "viewport": "1280px",
    "check": "number-sanity",
    "severity": "P0",
    "detail": "astronomical value \"900,719,925,474,097.9\" (|value| = 9.01e+14)"
  },
  {
    "surface": "pool-detail:abcdef01",
    "viewport": "1280px",
    "check": "number-sanity",
    "severity": "P0",
    "detail": "astronomical value \"900,719,925,474,098.9\" (|value| = 9.01e+14)"
  }
]
poolRotation split: {
  snapshotIds: 1,
  deepLinkIds: 1,
  union: 2,
  reachable: 1,
  subRailPicked: 1,
  deepLinkSource: '1 of 1 deep-linked ids confirmed live, 1 net-new beyond the snapshot'
}
```

(Multiple P0 hits because the absurd `apyBase` value flows into several
rendered figures on PoolDetail.js — the Base APY card and a couple of
derived sums — each independently caught by `scanNumbers()`'s astronomical-
magnitude gate. The surface DID render (`.pool-detail-view` appeared,
`surfacesCovered` includes it) — this is a real, live-rendered finding, not
a dead-end.)

### Control run — same pool, apyBase = 2.5, apyReward = 1.0 (sane)

```
=== CONTROL RUN (apyBase=2.5, apyReward=1.0, sane) ===
[audit] playwright resolved from global (1.56.1) at /opt/node22/lib/node_modules
surfacesCovered: [ 'pool-detail:abcdef01' ]
findings on pool-detail:abcdef01 : []
```

Zero findings, in particular **zero `dead-end`** — proves the LIVE-shape
sub-rail fixture body reaches the pool correctly (the failure mode this item
exists to prevent would show up as exactly one `dead-end` P1 finding here,
since `.pool-detail-view` would never appear for an id with no live record).

## Test results (verbatim summaries)

All run with `timeout 300 node <file>.js` (well inside the 5-minute
foreground budget; longest single run — the new file's two Chromium
renders — completed in well under a minute).

- **`node test_audit_pool_population.js`** (new file, this item):
  `6 passed, 0 failed`. All 6 criteria green: union > 3,000, cap invariant,
  sub-rail actually picked, `∩ live` collapse-to-snapshot-only, and both
  halves of the mandatory rendered positive control.
- **`node test_audit_app.js`**: `3 passed, 0 failed` — clean run, positive
  control, negative control (144's mean30d rail) all green. Determinism +
  clean-run contract intact.
- **`node test_audit_prescan.js`**: `51 passed, 0 failed` — every existing
  prescan/link-target-integrity/pool-link-liveness assertion still holds
  after hoisting the extractor; the real-corpus true-negative case
  (`checkedIds=3,669`) still passes.
- **`node test_audit_pool_link_liveness.js`**: `11 passed, 1 failed`. The
  one failure — **"REAL PAGE, backdated copy: swapping one live id …"** —
  is **PRE-EXISTING RED on `origin/main`**, confirmed by `git stash`-ing this
  item's full diff and re-running: identical failure, identical message
  (`fixture wiring check: tokens/usdc.html must contain at least one
  class="tp-pool-link" href="…" anchor — its shape moved out from under this
  test`). Unrelated to backlog 206 — a fixture assumption about
  `tokens/usdc.html`'s current anchor markup, broken by ordinary content
  drift. Not touched by this item.
- **`node test_audit_cta_provenance.js`**: `33 passed, 2 failed` (after the
  `poolLiveness: false` fix described in deviation #3 above — without that
  fix it was `31 passed, 4 failed`). The remaining 2 failures — **"192
  guard: an artificially tiny AUDIT_TIME_BUDGET_MS …"** and **"192 honesty
  (baseSeen protection, verifier attack-192-2) …"** — are **PRE-EXISTING RED
  on `origin/main`**, same `git stash` proof: identical failure count (2),
  identical messages (`fixture wiring check: expected 3 pre-computed
  rotation picks, got 6: […lens surfaces…]` and `fixture wiring check:
  expected every extraSurfaces entry to carry rotationPick:true, got […lens
  surfaces…]`). Root cause (pre-206, not investigated further — out of this
  item's scope): backlog 199's lens-surface feature added `lensPick:true`
  extraSurfaces alongside `rotationPick:true` ones, and these two 192-era
  tests' fixture wiring never accounted for that, independent of 206.
- **`node test_test_registry.js`**: `5/5 assertions passed` — confirms
  `test_audit_pool_population.js` is correctly wired into `test:serial`
  (no orphans/ghosts/duplicates), and the self-defeat check still proves the
  guard itself can go red.
- **`node test_audit_pool_prescan.js`**: `14 passed, 0 failed`.
- **`node test_audit_static_rotation.js`**: `21 passed, 0 failed` — the
  static-rotation leg (unrelated machinery, but shares `buildStaticSurfaces()`)
  is fully unaffected; several of its `runAudit()` calls now print the new
  `[audit] pool-detail rotation: deep-linked leg degraded …` stderr line
  (expected — those calls use `AUDIT_STATIC_PAGES` override / fixture
  snapshots with no `deepLinkPoolIds` supplied, so the leg correctly
  degrades to snapshot-only and says so).

## Residual / filed-not-fixed

- **CORRECTED BY THE VERIFIER (2026-08-02): the tally above is short by two.**
  The builder counted 3 pre-existing reds (1 in `test_audit_pool_link_liveness.js`,
  2 in `test_audit_cta_provenance.js`). The verifier ran the FULL audit-test
  set on both the branch and an `origin/main` worktree and found **5**
  pre-existing reds, zero new ones. The two the builder never ran, and so
  never mentioned:
  - `test_audit_planner_flow.js` — 10/11 on the branch AND 10/11 on
    unmodified `origin/main`, identical message ("bloom branch missing the
    360-scoped responsive check").
  - `test_seo_surface_audit.js` — 7/8 on the branch AND 7/8 on unmodified
    `origin/main`, identical message ("digit-LEADING real tickers … expected
    both override pages to have actually run"). This is item 185's own
    still-open red, so it has a documented owner already.
  Recorded here so a later reader never attributes either to 206. Branch vs
  main is **zero new reds** on all 20 audit-test files the verifier ran.
- All 5 pre-existing reds are unrelated to this item and were NOT fixed —
  per the brief's own instruction ("a pre-existing red must be reported as
  pre-existing... never claimed as yours or hidden"), left as-is for a
  future item to address (all shallow fixture-wiring drift, not product
  defects). Deliberately no drive-by fix: the verifier confirmed the diff
  contains nothing beyond what spec 206 called for.
- **Durable side effect, filed not fixed** (verifier observation, not a
  defect): `ROTATION_SEEN_CAP` at 12,000 means
  `product-loop-kit/signals/audit-rotation.json` — committed and rewritten
  daily — can grow to roughly **480 KB** as the rotation works through the
  3,984-candidate population, against ~90 KB at the old 2,000 cap. That is
  the honest price of the never-audited-first memory covering the widened
  population (a cap below the population would make `computeRotation()`'s
  wrap branch dead code — the exact trap `STATIC_ROTATION_SEEN_CAP`'s
  comment documents). If the daily-commit cost of that file ever matters,
  the fix is a compact id encoding, never a cap below the population.
- **Coverage arithmetic, worth a future reader's attention:** at the
  unchanged `DEFAULT_POOL_SAMPLE` of 32 picks/tick, a full rotation cycle
  over 3,984 candidates now takes ~125 daily ticks (~4 months), against ~23
  ticks before. This item deliberately did NOT raise the sample budget —
  that trades against the wall-clock cap and is a separate decision. The
  spec's own decision rule anticipates this by accepting "≥1 finding on a
  non-snapshot pool" as the keep-signal, not a completed cycle.
- `product-loop-kit/signals/audit-static-rotation.json` gets touched as a
  side effect of running `test_audit_static_rotation.js`'s own
  `persistRotationState:true` criteria (pre-existing behaviour of that test
  file, confirmed unrelated to this item) — reverted with `git checkout --`
  after every verification run so the final diff stays scoped to this item's
  actual changes.

## Files touched

- `audit-app.js` — the implementation (see `git diff --stat`: +347/-70
  lines net across the whole file's diff, this item's actual footprint
  concentrated in: the new `extractDeepLinkPoolIds()` helper,
  `prescanStaticPages()`'s hoisted loop + `deepLinkPoolIds` return field,
  `emptyPrescanResult()`, `buildStaticSurfaces()`'s `prescan.deepLinkPoolIds`
  thread-through, `ROTATION_SEEN_CAP` raise + comment, `loadLivePoolIds()`'s
  additive `pools` field, `buildPoolSurfaces()`'s widening block +
  `poolRotation`'s 6 new fields + `emptyPoolRotationResult()`, `runAudit()`'s
  reorder + `subRailLiveBody`/`poolsById` extension, `setupRoutes()`'s
  per-surface body selection, and the CLI summary's new population-split
  line).
- `test_audit_pool_population.js` — new, 245 lines, the required test file.
- `package.json` — `test:serial` gained `node test_audit_pool_population.js`
  (registered right after `test_audit_pool_link_liveness.js`).
- `test_audit_cta_provenance.js` — 8 `runAudit()` call sites gained
  `poolLiveness: false` (see deviation #3), +42/-6 lines (comments +
  the opt itself).

Hard invariants verified: `git diff --stat` against
`data/pools-snapshot.json app.js PoolDetail.js planner.js translations.js
compute-kpis.js home.html style.css vercel.json generate-*.js` is empty —
every one of those files is byte-untouched.
