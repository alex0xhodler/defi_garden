# 155 build notes — restore the audit scanner's positive control

## Files changed

- `test_audit_app.js` — rewritten (+82/-33 lines per `git diff --stat`). Case 2
  re-pointed from `apyMean30d` to `apyBase` (with `apyReward` forced `> 0`);
  case 3 added as a negative control on `apyMean30d`; both `outPath`s (and
  case 1's) routed to `os.tmpdir()`; the trailing "restore a clean signals
  file" run removed entirely.
- `package.json` — `test` script string only: inserted
  `&& node test_audit_app.js` immediately after `node test_audit_runner.js`
  and before `node test_seo_surface_audit.js`. `dependencies` /
  `devDependencies` untouched (confirmed via `git diff package.json`, shown
  below — only the `test` line changed).
- `product-loop-kit/specs/155-notes.md` — this file (new).

No other tracked file has a diff. `git status --porcelain` at the end of this
run:

```
 M package.json
 M test_audit_app.js
?? product-loop-kit/specs/155.md
```

(`product-loop-kit/specs/155.md` was already untracked at pickup — not
created or touched by this build.)

## Deviations from the spec, and why

1. **Case 2's assertion searches all matching findings, not just the first.**
   The spec's example assertion pattern (mirrored from the old case 2) took
   the *first* `{surface:'pool-detail', check:'number-sanity', severity:'P0'}`
   finding and asserted its `detail` against the magnitude regex. In practice
   `apyBase` feeds more than one rendered number on the pool-detail page (the
   raw Base APY card plus at least one derived projection elsewhere on the
   page), so the injected value produced multiple number-sanity findings and
   the *first* one in `result.findings` order was a different computed
   magnitude (`287,695,208,825,959.1`), not the injected
   `900,719,925,474,097.9`. Fixed by filtering to all pool-detail
   number-sanity P0 findings and asserting that *one of them* matches the
   magnitude regex — this still satisfies acceptance criterion 1 exactly
   (\"≥1 finding … whose detail matches …\") and is a closer reading of the
   criterion's own wording (\"≥1 finding\", not \"the first finding\").
2. **Injected magnitude is positive, not the historical negative
   `-900719925474097.9`.** `PoolDetail.js:1210/1236` gate both APY cards on
   `pool.apyBase > 0 && pool.apyReward > 0`; a negative `apyBase` would fail
   that gate and never render, which would prove nothing about the detector.
   The spec's own probe table (§Evidence 4) used the positive magnitude
   `9.007e14` for the `apyBase` row, so this matches the spec's own evidence,
   not just the acceptance-criteria regex (which accepts either sign via
   `Math.abs()` in the scanner's message and the regex's own `900,719,...`
   without a leading `-`). Case 3 uses the same positive magnitude for
   `apyMean30d`, for the same reason and to match the probe table's row 1
   convention.
3. Everything else matches the spec's §Change 1-4 as written.

## `node test_audit_app.js` (final clean-tree run, post-restore)

```
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes findings JSON
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ positive control: injected 900T Base APY renders into pool-detail → P0 number-sanity finding
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ negative control: injected 900T 30d-Mean APY is suppressed on pool-detail (backlog 144 rail holds)

test_audit_app.js: 3 passed, 0 failed
EXIT=0
```

`git status --porcelain product-loop-kit/signals/audit-findings.json` immediately
after this run: **empty** (criterion 7 satisfied). The file was already dirty
at pickup from an earlier, unrelated run in this checkout; it was restored
with `git checkout -- product-loop-kit/signals/audit-findings.json` before any
test in this build ran, and stayed clean through every subsequent run because
every `runAudit()` call in `test_audit_app.js` now takes an explicit
`os.tmpdir()` `outPath`.

## `node test_audit_runner.js` (unchanged file, re-run to confirm still green)

```
require('./audit-app.js') — must not throw with no node_modules present
  ✓ require succeeds and exports runAudit, scanNumbers, resolvePlaywright, blockingFindings
resolvePlaywright — override root paths (no browser launch)
  ✓ resolvePlaywright({ root: <empty dir> }) returns null (no throw)
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ resolvePlaywright() with no override resolves: chromium.launch, non-empty source, version string
child process — forced-unresolvable playwright writes a DID_NOT_RUN artifact, no repo writes
  ✓ node audit-app.js with AUDIT_PLAYWRIGHT_ROOT + AUDIT_OUT pointed at an empty dir: exits non-zero, writes DID_NOT_RUN artifact
  ✓ after the forced-failure child run, git status --porcelain is unchanged from before it (no repo writes)
blockingFindings — P0/P1 filter contract
  ✓ blockingFindings returns only P0/P1 from a mixed fixture list
  ✓ blockingFindings([]) === []
  ✓ blockingFindings(undefined) === []
  ✓ CLI source still gates its exit on blockingFindings(result.findings) and the item-142 exit contract

9 assertions passed.
PASS test_audit_runner (9 assertions)
EXIT=0
```

## `node test_seo_surface_audit.js` (unchanged file, re-run to confirm still green)

```
[audit] playwright resolved from local (1.61.1) at local node_modules
[audit] playwright resolved from local (1.61.1) at local node_modules
[audit] playwright resolved from local (1.61.1) at local node_modules
[audit] playwright resolved from local (1.61.1) at local node_modules
[audit] playwright resolved from local (1.61.1) at local node_modules
[audit] playwright resolved from local (1.61.1) at local node_modules
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ criterion 1: default run covers static-page + >=1 static-page:<slug>, writes findings JSON
  ✓ criterion 2 (positive control): tokens/00.html real render -> junk-slug P1 quoting the rendered <h1>
  ✓ criterion 3 (negative control): tokens/usdc.html yields no junk-slug/zero-yield-claim/empty-table
  ✓ criterion 4 (false-positive guard): digit-LEADING real tickers (0X0, 1INCH) do not trip junk-slug
  ✓ criterion 5: same AUDIT_STATIC_SEED selects the same sample; a different seed selects a different one

test_seo_surface_audit.js: 5 passed, 0 failed
EXIT=0
```

## Mutation kill A (criterion 2 — non-vacuity of the restored positive control)

Baseline confirmed clean first: `git diff --stat audit-app.js` → empty.

Edit applied to the real `audit-app.js` (scratch mutation, not committed),
neutering `scanNumbers`'s absurd-magnitude branch at line 349:

```diff
-    if (Number.isFinite(val) && Math.abs(val) >= ABSURD_MAGNITUDE) {
+    if (false && Number.isFinite(val) && Math.abs(val) >= ABSURD_MAGNITUDE) {
```

`node test_audit_app.js` against the mutated scanner:

```
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes findings JSON
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✗ positive control: injected 900T Base APY renders into pool-detail → P0 number-sanity finding
    expected a P0 number-sanity finding for pool-detail; got: []
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ negative control: injected 900T 30d-Mean APY is suppressed on pool-detail (backlog 144 rail holds)

test_audit_app.js: 2 passed, 1 failed
EXIT_CODE=1
```

Case 2 goes RED, as required. Restored: `git checkout -- audit-app.js`.
Confirmed byte-clean: `git diff --stat audit-app.js` → empty.

## Mutation kill B (criterion 3 — load-bearing negative control)

Baseline confirmed clean first: `git diff --stat PoolDetail.js` → empty.

**Important finding during this proof:** editing `PoolDetail.js` source alone
has *zero* effect on what the audit renders. `home.html` (lines 330-357)
loads the analytics app from the CI-compiled, minified bundles
(`PoolDetail.compiled.min.js` then `app.compiled.min.js`), not the raw
`text/babel` source — backlog 052/053 moved the analytics app off the
in-browser Babel pipeline for PageSpeed reasons. `audit-app.js`'s local
static file server serves whatever's on disk, so the mutation had to be
recompiled to actually reach the rendered page. This is worth flagging: the
spec's mutation-kill instruction ("remove the `mean30dSane &&` gate at
PoolDetail.js:1290 → case 3 must go RED") is correct in outcome but implicitly
assumes the compiled bundle is regenerated, which the spec text doesn't say
explicitly. Handled as a scratch-copy mutation of all three touched files
(`PoolDetail.js`, `PoolDetail.compiled.js`, `PoolDetail.compiled.min.js`, via
`node compile-app.js && node minify-assets.js`), all reverted byte-clean
afterward. No other file changed — `git status --porcelain` after
recompile/minify showed only those three plus this build's own
`package.json`/`test_audit_app.js` changes.

Edit applied to `PoolDetail.js:1290`:

```diff
-          mean30dSane && React.createElement('div', {
+          true && React.createElement('div', {
```

Then `node compile-app.js && node minify-assets.js` to regenerate
`PoolDetail.compiled.js` / `PoolDetail.compiled.min.js` from the mutated
source (only those two compiled files changed, confirmed via
`git status --porcelain`).

`node test_audit_app.js` against the mutated, recompiled bundle:

```
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes findings JSON
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ positive control: injected 900T Base APY renders into pool-detail → P0 number-sanity finding
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✗ negative control: injected 900T 30d-Mean APY is suppressed on pool-detail (backlog 144 rail holds)
    expected ZERO number-sanity findings for pool-detail (144 rail should suppress the card); got: [{"surface":"pool-detail","viewport":"1280px","check":"number-sanity","severity":"P0","detail":"astronomical value \"900,719,925,474,097.9\" (|value| = 9.01e+14)"}]

test_audit_app.js: 2 passed, 1 failed
EXIT_CODE=1
```

Case 3 goes RED, as required — proving 144's rail is what the negative
control is actually locking in. Restored:
`git checkout -- PoolDetail.js PoolDetail.compiled.js PoolDetail.compiled.min.js`.
Confirmed byte-clean:
`git diff --stat PoolDetail.js PoolDetail.compiled.js PoolDetail.compiled.min.js`
→ empty.

## Criterion 7 check (tracked-file side effect)

`product-loop-kit/signals/audit-findings.json` was already dirty at pickup
(from an earlier, unrelated run in this checkout — not this build's doing).
Restored once with `git checkout -- product-loop-kit/signals/audit-findings.json`
before running any test. After every subsequent `node test_audit_app.js` run
in this build (including both mutation-kill runs, which also invoke
`runAudit` through the same test file), `git status --porcelain
product-loop-kit/signals/audit-findings.json` was empty every time — the file
is never touched because every `runAudit()` call in the rewritten
`test_audit_app.js` passes an explicit `outPath` under `os.tmpdir()`, and each
temp file is deleted in a `finally`/cleanup block.

## Things noticed but NOT fixed (for the heartbeat to ticket)

Per spec §Non-goals, recorded verbatim:

> **Absurd `apyBase`/`apyReward` render verbatim on pool-detail** (probe row
> 2/3: the raw `900,719,925,474,097.9`, plus a `$2.4e65` projection string).
> The trust rails *do* fire on this path — `PoolDetail.js:250/1108/651` flag
> the pool as anomalous above `APY_SANITY_LIMIT_LOCAL` — so it is flagged,
> never hyped, which is why this is not a rails breach. But the rendered
> magnitude is still 122-class ugly. Ticket-worthy separately (it means
> editing `PoolDetail.js` rail logic = HIGH tier and a second item); **out of
> scope here** under the one-item rule. Record it in the notes for the
> heartbeat.

Additionally, worth flagging for whoever picks up that ticket: this build's
mutation-kill B proof surfaced that `PoolDetail.js` edits alone don't affect
the audited render — any fix there will also need `npm run compile && npm run
minify` (and the regenerated `PoolDetail.compiled.js` /
`PoolDetail.compiled.min.js` committed) to actually reach production/audit
parity, per `home.html`'s documented compiled-bundle loading (lines 330-357).
