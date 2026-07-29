# 171 — build notes

Item: a prescan alarm must respect its own rendered verdict — after the
rendered pass, reconcile each aggregate `pool-prescan:<signal>` /
`static-prescan:<signal>` finding against what its own promoted suspects
actually rendered; downgrade to `P2` (non-blocking) iff every suspect was
promoted AND every promoted surface rendered zero findings.
Spec: `product-loop-kit/specs/171.md` (pre-existing, untracked in this
checkout — not authored here). Branch: `claude/loop-171`, already checked
out at `origin/main` (`0bce2cb43`) when this build started — no commits made
by this build (working tree only, per the build brief).

Scope actually touched: `audit-app.js`, `test_audit_pool_prescan.js`,
`test_audit_prescan.js`. `product-loop-kit/signals/audit-findings.json` was
also modified, but only as the unavoidable side effect of running
`node audit-app.js` for the required measurements (see "A10" below for the
honest accounting — it is a generated CI artifact, not a hand-edit).
`package.json` was NOT touched — both test files were already wired into
`test:serial` by earlier items (167/157), so no chain-position change was
needed. This file (`171-notes.md`) is new.

## What shipped

`audit-app.js`:

- `buildStaticSurfaces()` (~line 618): return shape gained `prescanSuspects`
  — the same anchor-excluded suspect list (`{rel, signal, severity, detail}`)
  the aggregate `prescanFindings` were counted from, exposed so `runAudit()`
  can reconcile against exactly what was counted (not a fresh re-scan, which
  could theoretically diverge). Also exported (`buildStaticSurfaces` was not
  previously in `module.exports`) so tests can drive it directly if needed —
  none of the new tests ended up needing it, but it's a harmless, honest
  addition given `buildPoolSurfaces` was already exported.
- `buildPoolSurfaces()` (~line 869): same shape addition —
  `poolPrescanSuspects` — mirroring the static leg exactly.
- `reconcilePrescanFindings(aggregateFindings, opts)` (new, ~line 1531): the
  shared helper, exported. Takes `{ prefix, suspects, suspectKey,
  promotedKeys, keyToSurface, coveredSurfaces, findingsBySurface }`. For each
  aggregate finding whose `surface === prefix` and `check` starts with
  `${prefix}:`, it derives the signal, finds every suspect carrying that
  signal, and:
  - if any such suspect's key is absent from `promotedKeys` → **unchanged**
    (unverified ≠ clean — the load-bearing branch, checked FIRST).
  - else, for every promoted suspect's surface: if the surface is absent
    from `coveredSurfaces` (never actually rendered THIS run — e.g.
    `opts.only` scoped it away after promotion) OR has ≥1 entry in
    `findingsBySurface` → **unchanged**.
  - else (every promoted suspect's surface was covered AND clean) →
    `severity = 'P2'`, `detail` gains a `— reconciled: … downgraded to
    non-blocking.` suffix naming the cleared surface(s).
  Mutates the finding objects in place (they are the same references already
  living in the caller's combined `findings` array via array spread), so no
  splice-back is needed.
- `runAudit()` (~line 1721, right after the render `finally` block, before
  building `result`): builds `surfacesCoveredSet` (from `surfacesCovered`,
  post-render) and `findingsBySurface` (a count map over the just-finished
  `findings` array, which by construction can never collide with
  `'static-prescan'`/`'pool-prescan'`/`'text-surfaces'` surface names), then
  calls `reconcilePrescanFindings` exactly twice:
  - `prefix: 'static-prescan'`, `suspects: staticResult.prescanSuspects`,
    `suspectKey: (s) => slugFromRel(s.rel)`, `promotedKeys: new
    Set(staticResult.prescan.promoted)` (already slugs — `buildStaticSurfaces`
    stores `promoted` as `promotedRels.map(slugFromRel)`), `keyToSurface:
    (slug) => \`static-page:${slug}\``.
  - `prefix: 'pool-prescan'`, `suspects: poolResult.poolPrescanSuspects`,
    `suspectKey: (s) => s.poolId`, `promotedKeys: new
    Set(poolResult.poolPrescan.promoted)` (already full pool ids, per 167's
    own comment at that field), `keyToSurface: (id) =>
    \`pool-detail:${poolIdPrefix(id)}\``.
  Both calls run AFTER the `opts.only` allowlist filtering of
  `prescanFindings`/`poolPrescanFindings` (that filtering was already earlier
  in the function, at the pre-existing lines building those two `let`
  variables) and AFTER the render loop, per the spec's two ordering
  constraints. `textSurfaceFindings` is never passed to the helper — the
  text-surface leg has no promotion mechanism at all, so nothing there is
  ever reconciled (enforced by omission, not by a branch inside the helper —
  see the A6 test pair below for why that distinction is tested explicitly).
- Exports added: `buildStaticSurfaces`, `reconcilePrescanFindings` (alongside
  the pre-existing export list — nothing renamed or removed).

`test_audit_pool_prescan.js` — new "spec 171" section (5 new tests, all
driving `reconcilePrescanFindings` DIRECTLY as pure-function fixtures, per
the build brief's "Export the helper so tests can drive it directly" — no
Chromium involved, so this whole file still runs in well under a minute):

- **A3**: one suspect, promoted, its surface covered+clean →
  `severity: 'P2'`, `detail` includes `'reconciled'` and names
  `pool-detail:meanA001`.
- **A4** (load-bearing): two suspects sharing a signal, only one promoted →
  severity stays `'P0'`, detail untouched — proves "not all promoted" wins
  even though both surfaces would have been clean if checked.
- **A4b**: a promoted suspect whose surface was never actually rendered in
  THIS run (`coveredSurfaces` doesn't contain it — the `opts.only`
  interaction called out in the spec's Territory notes) also leaves severity
  unchanged — "promoted" and "covered by this run" are checked as two
  separate conditions, not conflated.
- **A5**: both suspects promoted, one promoted surface has ≥1 rendered
  finding (of any kind — not necessarily the same signal) → severity stays
  `'P0'`.
- **A7**: `buildPoolSurfaces({ poolPrescan: false })` against a fixture that
  DOES contain a real suspect (`railBreachPool`) → zero `poolPrescanFindings`
  AND zero `poolPrescanSuspects` (never scanned at all, not just never
  promoted) → reconciling the empty array is asserted to be a genuine no-op.

`test_audit_prescan.js` — new "spec 171" section (2 new tests, also pure,
no extra Chromium renders beyond what criteria 3–6 already pay for):

- **A6a** (non-vacuity): calls `reconcilePrescanFindings` directly with
  `prefix: 'text-surfaces'` and the exact same "fully promoted + rendered
  clean" shape A3 uses, on the signal `'apy-rail-breach'` — which is a REAL
  key in both `TEXT_SURFACE_SIGNALS` and `POOL_PRESCAN_SIGNALS`
  (`audit-app.js:195`/`:208`), not a hypothetical collision. Asserts the
  finding DOES flip to `'P2'`. This is deliberate: it proves the helper has
  no built-in "never downgrade text-surfaces" logic, so A6b's guarantee is
  real (rests on the call sites never doing this) rather than vacuous (a
  helper that could never downgrade anything would pass a naive "text
  surfaces are never P2" check trivially).
- **A6b**: a source-text assertion (matching `test_audit_runner.js`'s
  existing "CLI source still gates its exit" pattern) — exactly 3
  occurrences of `reconcilePrescanFindings(` in `audit-app.js` (1 definition
  + 2 call sites), `'reconcilePrescanFindings(textSurfaceFindings'` is never
  a substring of the file, and the two real call sites carry
  `prefix: 'static-prescan'` / `prefix: 'pool-prescan'` respectively.

## Design choices / deviations from a literal reading of the spec

1. **A3/A4/A5/A6/A7 are pure unit tests against the exported helper, not
   real-Chromium end-to-end fixtures**, even though the sibling test files
   (`test_audit_app.js`, `test_audit_prescan.js`'s own pre-existing criteria
   3–7) do real renders for their own acceptance criteria. This is a
   deliberate reading of the build brief's own words — "Export the helper so
   tests can drive it directly" — combined with the spec's own framing that
   fixtures exist because "a single live run cannot reach" every branch,
   while A1/A2 (run for real, see below) are the mandated end-to-end proof
   that the wiring (field names like `.prescan.promoted`,
   `.poolPrescanSuspects`, the two call sites' argument shapes) is actually
   correct in production. A pure-fixture approach also means these five new
   tests added ~0 seconds of Chromium time to a file family that already had
   real timebox pressure (170-notes.md documents `test_kpi_momentum.js` at
   108s, `test_pool_logo.js` at ~87s elsewhere in this repo's browser lane) —
   `test_audit_pool_prescan.js` still runs with ZERO real renders at all
   (unchanged from before this item; every case in it, old and new, uses
   `only: ['pool-prescan']` or calls the pure helper directly).
2. **`buildStaticSurfaces` is newly exported** even though nothing in the
   final test suite ends up requiring it (the A3–A7 fixtures construct
   suspects/findings by hand rather than going through the builder). Left in
   because it's a one-line, harmless addition consistent with
   `buildPoolSurfaces` already being exported, and a plausible future test
   would want it; not reverted since removing it would be churn without
   benefit.
3. **The "unpromoted" check runs before the "covered/clean" check** inside
   `reconcilePrescanFindings`, and the two are genuinely separate conditions
   (A4 vs A4b), not folded into one "was it verified" boolean. This wasn't
   strictly demanded by the spec's prose (which describes them as two
   separate acceptance bullets, A4 and the Territory note about `opts.only`)
   but keeping them as two distinct `if` exits made the non-vacuity intent
   of each branch legible in the code, and let A4/A4b be two independent,
   individually-falsifiable tests instead of one compound one.
4. **`findingsBySurface` counts ALL findings by surface name, including the
   aggregate `static-prescan`/`pool-prescan`/`text-surfaces` entries
   themselves** — this is safe, not an oversight: `keyToSurface` only ever
   produces `static-page:<slug>` or `pool-detail:<prefix>` strings, which by
   construction (157/167's own surface-naming convention) can never equal
   `'static-prescan'`/`'pool-prescan'`/`'text-surfaces'`. Building one
   combined map (rather than two) was simpler and carries no risk of
   self-counting.
5. **`product-loop-kit/signals/audit-findings.json` is left in its
   post-verification state (reflecting today's `5 blocking` run), not
   reverted to `origin/main`'s committed copy.** This file is `DEFAULT_OUT`
   — every `node audit-app.js` invocation overwrites it unconditionally, and
   the build brief's own required verification steps (A1, A8's two
   re-verification runs) necessarily ran the CLI at the repo root multiple
   times. Reverting it would (a) require an extra, purposeless run-and-diff
   cycle, and (b) leave the repo holding a STALE artifact that
   contradicts what the code on disk actually produces — the opposite of
   `ci-signal-honesty`. See the A10 section below for the exact diff.

## Candidate tickets (noticed, not fixed — out of scope for 171)

- **`reconcilePrescanFindings`'s `keyToSurface`/`suspectKey` contract is
  duck-typed, not validated.** If a future third prescan family were added
  with a suspect shape that doesn't carry `.signal`, or a `keyToSurface` that
  collides with an existing real surface name, the helper would silently
  misbehave rather than throwing. Not a live risk today (only two call sites
  exist, both covered by A6b's exact-count assertion), but worth a defensive
  comment or a runtime shape-check if a third leg is ever added.
- **The "no promoted surface produced a finding" check treats ALL findings
  on that surface as disqualifying, regardless of severity** — a promoted
  pool-detail surface that only ever produces a `P2` `responsive`/`i18n`
  finding (unrelated to the signal under reconciliation) would still block
  the downgrade. This matches the spec's literal wording ("zero rendered
  findings", no severity qualifier) and is almost certainly the right
  conservative default, but is worth flagging: it means reconciliation is
  strictly harder to trigger than "zero BLOCKING findings" would be. Not
  changed — the spec is explicit and this build errs toward the
  spec's literal text over a looser interpretation.
- **A6's real committed `llms.txt`/`llms-full.txt` currently produce ZERO
  text-surface findings of any signal** (confirmed by
  `test_audit_text_surfaces.js`'s own pre-existing "real surface" criterion),
  so there is no live scenario today where a text-surface finding's severity
  could even be OBSERVED to stay unchanged end-to-end via a real
  `node audit-app.js` run. The A6a/A6b pair proves the guarantee
  structurally (no built-in immunity + never invoked that way); a live
  positive-control equivalent to A1's real bug would need either a
  deliberately-mutated committed text-surface file (risk of leaving the repo
  dirty if a test crashes mid-run — the existing static-prescan tests
  mitigate this with a `finally`-block probe-file cleanup, but that pattern
  writes a NEW untracked file rather than editing a TRACKED one) or an
  `opts.files` override threaded through `runAudit()` (which does not
  currently exist — `runAudit()`'s text-surface block always scans the real
  `TEXT_SURFACE_FILES`, unlike `prescanTextSurfaces()` itself which already
  supports `opts.files`). Worth doing if a future item wants a live A6
  proof, but out of scope here.

## Verification

### A1/A2 — the live run (this branch, working tree)

```
$ time timeout 200 node audit-app.js
...
[audit] surfaces covered: text-surfaces, grid-token, pool-detail, grid-chain, dead-pool, grid-loading, pool-detail-360, grid-360, pool-detail-dark, pool-detail-ko, pool-detail:201e5f6e, pool-detail:87c8ee0d, pool-detail:0715f02b, landing, planner, planner-360, planner-ko, plan-bloom-growth, plan-bloom-target, plan-bloom-subscription, plan-bloom-360, plan-bloom-ko, static-page, static-page:tokens/20261231, static-page:tokens/2027, static-page:tokens/67, static-page:tokens/8oct2026, static-page:tokens/feusd, static-page:tokens/synusdx
[audit] findings: 6 total, 5 blocking (P0/P1)

real	1m43.820s
exit=1
```

Matches spec A1's own prediction exactly (`6 total, 5 blocking`) — live data
had NOT moved since the spec was written (same run day, 2026-07-29). The
`pool-prescan:mean30d-rail-breach` finding in the written JSON:

```json
{
  "surface": "pool-prescan",
  "viewport": "n/a",
  "check": "pool-prescan:mean30d-rail-breach",
  "severity": "P2",
  "detail": "1 of 745 snapshot pools match mean30d-rail-breach — examples: 201e5f6e — reconciled: all 1 promoted suspect(s) rendered with zero findings on pool-detail:201e5f6e; downgraded to non-blocking."
}
```

`severity: 'P2'`, `detail` names `pool-detail:201e5f6e` — exactly A1's
acceptance text. The `static-prescan:junk-slug` finding in the same run:

```json
{
  "surface": "static-prescan",
  "viewport": "n/a",
  "check": "static-prescan:junk-slug",
  "severity": "P1",
  "detail": "7 of 2181 static SEO pages match junk-slug — examples: tokens/00, tokens/01, tokens/17dec2026, tokens/20261231, tokens/2027, tokens/67, tokens/8oct2026"
}
```

Still `P1`, `detail` untouched (no `reconciled` text) — A2 holds: 7 real
junk-slug suspects exist, `surfacesCovered` shows only 4 promoted
(`tokens/20261231`, `tokens/2027`, `tokens/67`, `tokens/8oct2026` render;
`tokens/00`, `tokens/01`, `tokens/17dec2026` do not appear in
`surfacesCovered` at all in this run), so "not all promoted" correctly wins.
`exit=1` — the run stays red while item 148 is unfixed, per the spec's
explicit non-goal ("Making `audit-app.js` exit 0" is out of scope).

The full 6-finding list this run (in order): `static-prescan:junk-slug` (P1),
`pool-prescan:mean30d-rail-breach` (P2), and 4× rendered `junk-slug` (P1
each, on the 4 promoted static pages) — `5` of `6` are P0/P1 → `5 blocking`,
matching the printed line exactly.

### Baseline comparison — `origin/main` in an isolated worktree

```
$ git worktree add /tmp/.../scratchpad/base171 origin/main
HEAD is now at 0bce2cb43 170: make the browser lane safely parallel (#327)
$ ln -s /home/user/defi_garden/node_modules /tmp/.../scratchpad/base171/node_modules
$ cd /tmp/.../scratchpad/base171 && time timeout 200 node audit-app.js
...
[audit] surfaces covered: text-surfaces, grid-token, pool-detail, grid-chain, dead-pool, grid-loading, pool-detail-360, grid-360, pool-detail-dark, pool-detail-ko, pool-detail:201e5f6e, pool-detail:87c8ee0d, pool-detail:0715f02b, landing, planner, planner-360, planner-ko, plan-bloom-growth, plan-bloom-target, plan-bloom-subscription, plan-bloom-360, plan-bloom-ko, static-page, static-page:tokens/20261231, static-page:tokens/2027, static-page:tokens/67, static-page:tokens/8oct2026, static-page:tokens/feusd, static-page:tokens/synusdx
[audit] findings: 6 total, 6 blocking (P0/P1)

real	1m42.954s
exit=1
```

Identical `surfacesCovered` (same seed-derived rotation, same snapshot), same
`6 total`, but `6 blocking` — the `pool-prescan:mean30d-rail-breach` finding
in this baseline's written JSON is `"severity": "P0"` with
`"detail": "1 of 745 snapshot pools match mean30d-rail-breach — examples:
201e5f6e"` (no `reconciled` suffix). This is exactly the `6/6` figure spec
171's own "Why this item exists" section reports having measured against
`main` — reproduced independently here, in a clean worktree, not copied from
the spec text. **Delta: `origin/main` → this branch is exactly `6 blocking →
5 blocking`, isolating this item's one intended effect.**

### A8 — non-vacuity (neuter → red → restore → green)

Neutered `reconcilePrescanFindings` with a bare early `return;` as its first
statement (`audit-app.js`, one-line insertion, reverted immediately after):

```
$ time timeout 200 node audit-app.js     # NEUTERED
...
[audit] findings: 6 total, 6 blocking (P0/P1)

real	1m43.051s
exit=1
```

Confirmed the neuter was reverted with no stray diff (`git diff --stat --
audit-app.js` before/after the neuter-and-restore cycle showed the same
totals as a from-scratch diff against `origin/main`). Re-ran on the restored
file:

```
$ time timeout 200 node audit-app.js     # RESTORED
...
[audit] findings: 6 total, 5 blocking (P0/P1)

real	1m42.355s
exit=1
```

`6/6` with the mechanism disabled, `6/5` with it enabled, on the identical
unmodified snapshot/seed — the mechanism is doing real, falsifiable work,
not passing by construction.

### `node run-tests.js --lane=plain`

```
$ time timeout 290 node run-tests.js --lane=plain
run-tests.js: 36 file(s) selected (lane=plain, plain=36, browser=0, timeout=plain:120s/browser:600s, plain-jobs=3, browser-jobs=3)
...
TOTAL pass=36 fail=0 timeout=0 total=36

real	0m5.017s
```

36/36 pass (includes `test_run_tests.js` itself, unaffected by this item).

### The `test_audit_*` family — all 7 files, run individually

```
$ time timeout 290 node test_audit_runner.js
...
9 assertions passed.
PASS test_audit_runner (9 assertions)
real	0m0.529s

$ time timeout 290 node test_audit_app.js
...
test_audit_app.js: 3 passed, 0 failed
real	0m20.921s

$ time timeout 290 node test_audit_text_surfaces.js
...
test_audit_text_surfaces.js: 32 passed, 0 failed
real	0m1.174s

$ time timeout 290 node test_audit_planner_surface.js
...
test_audit_planner_surface.js: 9 passed, 0 failed
real	1m36.967s

$ time timeout 290 node test_audit_planner_flow.js
...
test_audit_planner_flow.js: 11 passed, 0 failed
real	0m2.829s

$ time timeout 120 node test_audit_pool_prescan.js
...
test_audit_pool_prescan.js: 14 passed, 0 failed
[no `time` wrapper on this one specific invocation — re-run without timing
capture after the earlier timed baseline confirmed the same 14/0 result;
completed well inside its 120s cap in every run, no timeout observed]

$ time timeout 240 node test_audit_prescan.js
...
test_audit_prescan.js: 9 passed, 0 failed
real	2m9.381s
```

All 7 files green, 87 total assertions/tests across the family (9 + 3 + 32 +
9 + 11 + 14 + 9), none timed out, none skipped. `test_audit_pool_prescan.js`
went from 9 → 14 tests (+5, all new spec-171 fixtures); `test_audit_prescan.js`
went from 7 → 9 (+2, the A6 pair).

### What was NOT run

- **The full 64-file browser lane was NOT run**, and no subset of it beyond
  the 7 `test_audit_*.js` files was attempted (the build brief's own
  instruction: "do NOT attempt the full 64-file browser lane"). The other 57
  browser-lane files (everything under `run-tests.js --list` with lane
  `browser` except the 7 `test_audit_*` files) were not executed in this
  build and their current pass/fail status on this branch is unknown from
  this session — though this item touches nothing they import (only
  `audit-app.js`'s own exports changed, additively), so no regression is
  expected, but that is an inference, not a measurement.
- `run-tests.js --lane=browser` (the scheduler itself, item 170's own
  concurrency machinery) was not exercised in this build — only direct
  `node test_audit_*.js` invocations, matching the build brief's "and the
  `test_audit_*` family" phrasing literally rather than routing through the
  scheduler.
- No coverage/lint pipeline exists in this repo (per `CLAUDE.md`) — nothing
  of that kind was skipped, there is nothing to run.
- A live, real-`runAudit()` positive-control equivalent of A6 (a genuinely
  mutated committed text-surface file proving a live text-surface finding
  stays unchanged post-reconciliation) was NOT built — see "Candidate
  tickets" above for why, and A6a/A6b's structural proof for what WAS
  measured instead.

## Acceptance criteria — self-check (see final report for the authoritative version)

1. A1 MET (measured, not asserted from the spec) — `6 total, 5 blocking`,
   `pool-prescan:mean30d-rail-breach` is `P2` with a `detail` naming
   `pool-detail:201e5f6e`.
2. A2 MET — `static-prescan:junk-slug` stays `P1` and blocking in the same
   run (3 of 7 suspects unpromoted, matching the spec's own count).
3. A3 MET — fixture, `test_audit_pool_prescan.js`.
4. A4 MET (+A4b, an extra fixture for the `opts.only`-interaction edge the
   Territory notes call out specifically) — `test_audit_pool_prescan.js`.
5. A5 MET — fixture, `test_audit_pool_prescan.js`.
6. A6 MET (as a structural non-vacuity pair, A6a+A6b — see "What was NOT
   run" for the live-positive-control gap disclosed honestly) —
   `test_audit_prescan.js`.
7. A7 MET — fixture, `test_audit_pool_prescan.js`; the "byte-identical to
   main's" half of A7's claim is additionally evidenced by the baseline
   worktree comparison above (identical `surfacesCovered` and identical
   non-prescan findings between this branch and `origin/main` on the same
   seed/snapshot).
8. A8 MET — both transcripts captured above (neutered → 6/6, restored →
   6/5), same unmodified snapshot/seed both times.
9. A9 MET for what was run (`run-tests.js --lane=plain` 36/36,
   `test_audit_*` family 87/87 across 7 files) — the full 64-file browser
   lane explicitly NOT attempted, stated plainly above, not implied green.
10. A10 MET — `git diff --name-only origin/main` (working-tree vs
    `origin/main`, since this build made no commits) shows exactly
    `audit-app.js`, `test_audit_pool_prescan.js`, `test_audit_prescan.js`,
    and `product-loop-kit/signals/audit-findings.json` (the generated
    `DEFAULT_OUT` artifact — see "Design choices" #5 for why this is
    expected, not a hand-edit). `git diff -S APY_SANITY_LIMIT origin/main`
    is empty. `package.json` is byte-identical
    (`git diff origin/main -- package.json` empty — both test files were
    already in `test:serial` from earlier items). `PoolDetail.js`, `app.js`,
    `planner.js`, `home.html` do not appear in the diff at all.
