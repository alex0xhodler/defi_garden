# 149 — build notes (`audit-app.js` must not fail silently in a fresh clone)

Branch: `claude/loop-149` · Built 2026-07-26 · Type INFRA/BUGFIX · Risk LOW (spec's own guess; single non-product file + one new test, no dependency change, no user-facing surface)

## What changed

### `audit-app.js` (the only product/tooling file touched, per spec)
- **Removed** the module-level `const { chromium } = require('playwright');` (line ~35). No module-level `chromium` binding survives anywhere in the file.
- **Added** `function resolvePlaywright(opts = {})` (new section right after the `ABSURD_MAGNITUDE` constant, before `NM`/`UNPKG_VENDOR`), returning `{ chromium, version, source, resolvedFrom }` or `null`:
  - `overrideRoot = opts.root || process.env.AUDIT_PLAYWRIGHT_ROOT || ''`. If set, attempts ONLY `require(path.join(overrideRoot, 'playwright'))`; on any failure, records the reason and returns `null` immediately (no further fallback) — this is the single documented override the spec calls for.
  - Otherwise, in order, stopping at first success: (1) bare `require('playwright')` (`source: 'local'`), (2) `require(path.join(execSync('npm root -g'), 'playwright'))` (`source: 'global'`), (3) hardcoded `/opt/node22/lib/node_modules` (`source: 'global-fallback'`, skipped if identical to the resolved npm global root — which it is in this environment, so step 3 never actually fires here; kept for portability to environments where `npm root -g` disagrees with the hardcoded path).
  - Each failed attempt's reason is collected into `resolvePlaywright.lastAttempts` (an array), read by the caller for the `attempts` field of the `DID_NOT_RUN` artifact.
  - Version lookup (`versionFromRoot`/`versionFromBareRequire`) never throws — always falls back to `'unknown'` on any error, per spec.
  - Logs `[audit] playwright resolved from <source> (<version>) at <resolvedFrom>` to stderr on success.
- **`runAudit()`** now resolves playwright as its first action (before the snapshot read / server start): on `null`, throws `Error('playwright unresolvable: ...')` with `.code = 'AUDIT_PLAYWRIGHT_UNRESOLVED'` and `.attempts = resolvePlaywright.lastAttempts`. `chromium.launch(...)` is now `pw.chromium.launch(...)`.
- **`outPath`** now `opts.outPath || process.env.AUDIT_OUT || DEFAULT_OUT` (was `opts.outPath || DEFAULT_OUT`).
- **Success result shape**: `{ generatedAt, status: 'OK', playwright: { source, version }, surfacesCovered, findings }` — `surfacesCovered`/`findings` untouched in content/order; only `status` and `playwright` are new fields, inserted between `generatedAt` and `surfacesCovered`.
- **New exported helper** `function blockingFindings(findings) { return (findings||[]).filter(f => f && (f.severity === 'P0' || f.severity === 'P1')); }`, used by the CLI block in place of the old inline `.filter(...)`.
- **`module.exports`** is now `{ runAudit, scanNumbers, resolvePlaywright, blockingFindings }`.
- **CLI block (`require.main === module`)**: `.catch` now inspects `err.code`; on `AUDIT_PLAYWRIGHT_UNRESOLVED` writes `{ generatedAt, status: 'DID_NOT_RUN', reason: 'playwright unresolvable', attempts, surfacesCovered: [], findings: [] }` and exits `3`; on any other fatal error writes the same shape with `reason: err.message` and exits `2`. The write is wrapped in its own try/catch (`writeFailureArtifact`) so a write failure still exits non-zero; the error is also printed to stderr via the pre-existing `console.error(err)`. The success branch's `process.exit(blocking.length > 0 ? 1 : 0)` (now fed by `blockingFindings(result.findings)`) is unchanged in behavior — exit code `1` for P0/P1 findings, `0` clean.
- **Header comment** updated: documents `AUDIT_PLAYWRIGHT_ROOT` and `AUDIT_OUT` alongside the existing `AUDIT_SNAPSHOT_PATH`/`AUDIT_PORT`, plus a one-line summary of the lazy-resolution approach, the `DID_NOT_RUN` contract, and all four exit codes (0 clean / 1 P0-P1 / 2 fatal / 3 playwright unresolvable).
- Nothing else in the file changed: check logic, surface rotation (all 10 surfaces, same names/order), and finding shape (`{surface, viewport, check, severity, detail}`) are byte-identical to before.

### New test — `test_audit_runner.js` (repo root, house style: `assert` + counter + `✓`/`✗` print, matching `test_indexnow.js`'s pure-function-test style since this test also needs no browser)
Fast (no browser launch, no full audit run — confirmed under 2s wall time). Covers, in order:
1. `require('./audit-app.js')` succeeds with no `node_modules` present and exports all four functions.
2. `resolvePlaywright({ root: <fs.mkdtempSync empty dir> })` returns `null`, no throw.
3. `resolvePlaywright()` with no override: truthy, `chromium.launch` is a function, `source`/`version` are non-empty strings.
4. Spawns `node audit-app.js` via `child_process.spawnSync` with `AUDIT_PLAYWRIGHT_ROOT` pointed at a fresh empty temp dir and `AUDIT_OUT` pointed at a temp JSON path, `timeout: 60000`. Asserts: non-zero exit, the temp JSON exists and parses, `status === 'DID_NOT_RUN'`, `surfacesCovered` and `findings` are both `[]`, `reason` is a non-empty string.
5. Asserts `git status --porcelain` is **unchanged** (before vs. after the child run — see deviation #1 below) — proves the script wrote nothing into the repo beyond the explicitly redirected `AUDIT_OUT` path.
6. `blockingFindings` contract: P0/P1-only filter on a mixed `[P0,P1,P2,P3]` fixture, `[]` for `[]` and for `undefined`; plus a source-text assertion that `audit-app.js` contains both `blockingFindings(result.findings)` and `process.exit(blocking.length > 0 ? 1 : 0)` verbatim.

All temp dirs/files are cleaned up (`fs.rmSync(..., {recursive:true,force:true})`) at the end of each test / in a final loop. Prints `PASS test_audit_runner (9 assertions)` on success; on failure it prints each `✗` and exits non-zero via `process.exitCode`/explicit `process.exit(1)`.

### `package.json`
Appended ` && node test_audit_runner.js` at the very end of the `test` script chain. No dependency change.

## Deviations from the spec / conservative choices

1. **AC #5 / test item 5 ("assert `git status --porcelain` output is EMPTY") implemented as a before/after diff, not an absolute-empty check.** The literal instruction ("assert `git status --porcelain` output is EMPTY") is unsatisfiable while this very item's own changes (`audit-app.js`, `package.json` modified; `test_audit_runner.js` untracked) are legitimately uncommitted on the branch — which they must be, since the task explicitly forbids committing. I captured `git status --porcelain` immediately before spawning the child process and asserted it is byte-identical immediately after. This proves exactly the property the criterion cares about (the audit script itself writes nothing into the repo beyond the redirected `AUDIT_OUT` path) without being sensitive to this branch's own pending work. Verified this still catches a real regression: temporarily editing the test to call `fs.writeFileSync(path.join(ROOT, 'scratch-leak.txt'), 'x')` inside the child-spawn step made this assertion fail as expected, then reverted — not left in the diff, just confirmed and undone as a sanity check.
2. **`GLOBAL_FALLBACK_ROOT` (`/opt/node22/lib/node_modules`) never actually fires as the resolution source in this environment**, because `npm root -g` also resolves to that exact path here (confirmed: `npm root -g` → `/opt/node22/lib/node_modules`), so step 2 (`source: 'global'`) always succeeds first and step 3 is skipped by the "skip if identical" rule the spec calls for. This is correct per spec, just noting it so the verifier doesn't expect to see `source: 'global-fallback'` in this environment's real run — it's exercised structurally (the `if (globalRoot !== GLOBAL_FALLBACK_ROOT)` branch exists and is reachable in an environment where the two differ) but not empirically hit in this checkout.
3. **`resolvePlaywright.lastAttempts` used as the channel for the `attempts` array** (a property stamped onto the function) rather than returning `{ result, attempts }` from a single call, since the spec's success-path return shape (`{ chromium, version, source, resolvedFrom }`) is fixed and `attempts` is only meaningful on the failure path. `runAudit()` reads `resolvePlaywright.lastAttempts` right after a `null` return, before anything else can invoke `resolvePlaywright()` again — no observed re-entrancy risk since `runAudit()` calls it exactly once per process.
4. **Diff size**: `audit-app.js`'s diff is 154 changed lines (`+142/-12` roughly), slightly over the spec's own "well under the 150-line LOW cap" guess. This is still a single-file diff with no dependency/config/product-file changes; flagging for the verifier to weigh, not something I trimmed further since every added line traces to an explicit spec requirement (resolver, header doc, failure-artifact writer, `blockingFindings` extraction).
5. No other file besides `audit-app.js`, `package.json` (test-chain line), and the new `test_audit_runner.js` was touched. `product-loop-kit/signals/audit-findings.json` was regenerated by running the real audit (see verification §3) and its refreshed content was **kept** (decision explained there), not reverted.

## Verification (all commands timeboxed to 5 minutes; none exceeded it)

### 1. Non-vacuity proof — `git stash push -- audit-app.js`, run, `git stash pop`, run again

**Stashed (pre-change `audit-app.js`, i.e. `origin/main`'s version) — RED, verbatim:**
```
require('./audit-app.js') — must not throw with no node_modules present
  ✗ require succeeds and exports runAudit, scanNumbers, resolvePlaywright, blockingFindings
    Cannot find module 'playwright'
Require stack:
- /home/user/defi_garden/audit-app.js
- /home/user/defi_garden/test_audit_runner.js
resolvePlaywright — override root paths (no browser launch)
  ✗ resolvePlaywright({ root: <empty dir> }) returns null (no throw)
    Got unwanted exception.
Actual message: "Cannot read properties of undefined (reading 'resolvePlaywright')"
  ✗ resolvePlaywright() with no override resolves: chromium.launch, non-empty source, version string
    Cannot read properties of undefined (reading 'resolvePlaywright')
child process — forced-unresolvable playwright writes a DID_NOT_RUN artifact, no repo writes
  ✗ node audit-app.js with AUDIT_PLAYWRIGHT_ROOT + AUDIT_OUT pointed at an empty dir: exits non-zero, writes DID_NOT_RUN artifact
    AUDIT_OUT path must exist after the run
  ✓ after the forced-failure child run, git status --porcelain is unchanged from before it (no repo writes)
blockingFindings — P0/P1 filter contract
  ✗ blockingFindings returns only P0/P1 from a mixed fixture list
    Cannot read properties of undefined (reading 'blockingFindings')
  ✗ blockingFindings([]) === []
    Cannot read properties of undefined (reading 'blockingFindings')
  ✗ blockingFindings(undefined) === []
    Cannot read properties of undefined (reading 'blockingFindings')
  ✗ CLI source still gates its exit on blockingFindings(result.findings) and the item-142 exit contract
    CLI block must call blockingFindings(result.findings)

1 assertions passed.

❌ some assertions failed
EXIT=1
```
(8/9 failed, as expected — only the git-status-unchanged check trivially passes since nothing ran to change it.)

**After `git stash pop` — GREEN, verbatim:**
```
require('./audit-app.js') — must not throw with no node_modules present
  ✓ require succeeds and exports runAudit, scanNumbers, resolvePlaywright, blockingFindings
resolvePlaywright — override root paths (no browser launch)
  ✓ resolvePlaywright({ root: <empty dir> }) returns null (no throw)
[audit] playwright resolved from global (1.56.1) at /opt/node22/lib/node_modules
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

### 2. `node test_audit_runner.js` — full output
Identical to the "after `git stash pop`" block above: **9/9 passed, `EXIT=0`.**

### 3. `node audit-app.js`, no special env, timeboxed to 5 minutes
Did **not** exceed the timebox (completed well within it). Verbatim tail:
```
[audit] playwright resolved from global (1.56.1) at /opt/node22/lib/node_modules
{
  "generatedAt": "2026-07-26T15:21:17.406Z",
  "status": "OK",
  "playwright": {
    "source": "global",
    "version": "1.56.1"
  },
  "surfacesCovered": [
    "grid-token",
    "pool-detail",
    "grid-chain",
    "dead-pool",
    "grid-loading",
    "pool-detail-360",
    "grid-360",
    "pool-detail-dark",
    "pool-detail-ko",
    "static-page"
  ],
  "findings": []
}

[audit] surfaces covered: grid-token, pool-detail, grid-chain, dead-pool, grid-loading, pool-detail-360, grid-360, pool-detail-dark, pool-detail-ko, static-page
[audit] findings: 0 total, 0 blocking (P0/P1)
EXIT=0
```
Exit code **0**; `[audit] playwright resolved from global (1.56.1) at /opt/node22/lib/node_modules`; `status: "OK"`; all 10 surfaces covered, 0 findings — this exactly matches the spec's own evidence section ("10 surfaces covered, 0 findings").

**Decision on `product-loop-kit/signals/audit-findings.json`**: it changed (`generatedAt` bumped, `status`/`playwright` fields added — `surfacesCovered`/`findings` content identical). I **kept** this fresh result rather than `git checkout --`-ing it back: it is a legitimate, reproducible, clean run (built entirely from the committed `data/pools-snapshot.json`, no network access), and it is the first real demonstration of the new `status`/`playwright` fields this item adds to the artifact — reverting it would leave the tracked signals file in the old pre-149 schema despite the fix being live. Left as a modified-but-uncommitted file for the reviewer to inspect (`git diff --stat` below shows it).

### 4. Targeted test subset (5-minute timebox each)
- **`node test_dead_pool.js`** — **pre-existing failure, unrelated to this item**: throws `Error: Cannot find module 'playwright'` at its own top-level `require('playwright')` (`test_dead_pool.js:19`). This is the identical missing-`node_modules` class of bug the spec describes, but in a *different* file that this item's scope explicitly excludes from editing (spec: "audit-app.js ... is the ONLY product/tooling file you may modify"). Confirmed this is not something I introduced — I did not touch `test_dead_pool.js`.
- **`node test_planner.js`** — **208/208 assertions passed, `EXIT=0`.** Pure-logic suite (translations, `formatProjectName`, `planSavedSignature`, persona projections) with no playwright dependency, unaffected by node_modules absence.
- **`node test_token_pages.js`** — **pre-existing failure, unrelated to this item**: throws `Error: Cannot find module '@napi-rs/canvas'` via its require chain (`test_token_pages.js` → `generate-chain-pages.js` → `generate-og-images.js`). Same missing-`node_modules` root cause, different dependency, different file, out of this item's scope.

Per the task brief, `test_smoke.js`/`test_hub_pages.js` were not run (documented pre-existing failures per PR #306); `test_dead_pool.js` and `test_token_pages.js` turned out to be additional pre-existing, environment-only failures (missing `node_modules`) not previously called out in the task brief, but equally out of scope for a single-file (`audit-app.js`) fix — noted here for the verifier's awareness rather than silently skipped.

### 5. Final repo state
```
$ git status --porcelain
 M audit-app.js
 M package.json
 M product-loop-kit/signals/audit-findings.json
?? test_audit_runner.js

$ git diff --stat
 audit-app.js                                 | 154 +++++++++++++++++++++++++--
 package.json                                 |   2 +-
 product-loop-kit/signals/audit-findings.json |   7 +-
 3 files changed, 151 insertions(+), 12 deletions(-)
```

## Acceptance criteria status

| AC | Status |
|----|--------|
| `node audit-app.js` completes in a no-`node_modules` checkout; `status: "OK"`, non-empty `surfacesCovered` | ✅ verification §3 |
| Playwright unresolvable from both local and global (simulated via `AUDIT_PLAYWRIGHT_ROOT` pointed at an empty dir): exits non-zero, `signals/audit-findings.json`-shaped artifact has `status: "DID_NOT_RUN"`, `surfacesCovered: []` | ✅ `test_audit_runner.js` assertion 4 (using `AUDIT_OUT` to redirect away from the real signals file, per spec's testing-hygiene requirement) |
| A successful run still exits non-zero on P0/P1 (item-142 contract unchanged) | ✅ `blockingFindings`/exit-line unchanged in behavior; source-text assertion in `test_audit_runner.js` pins the exact CLI lines |
| Script writes no file outside `product-loop-kit/signals/`; modifies no product file | ✅ verification §1's git-status-unchanged assertion (child-process run); confirmed no product file (`home.html`, `app.js`, etc.) in the diff |
| `test_audit_runner.js` non-vacuous, red before / green after | ✅ verification §1 |
| Full `npm test` chain green, or every failure proven pre-existing | Not run in full (would exceed the 5-minute timebox per the task's own framing — ~90 files); targeted subset run instead per task instructions (§4), with `test_dead_pool.js`/`test_token_pages.js` failures shown to be pre-existing missing-`node_modules` issues in files outside this item's editable scope |
| No instrumentation added | ✅ none added |

## Anything the verifier should double-check
- The before/after `git status --porcelain` comparison (deviation #1) is a deliberate, documented reinterpretation of the literal spec wording ("assert ... is EMPTY"), made necessary by the task's own no-commit constraint. Worth an independent read of `test_audit_runner.js`'s comment at that assertion to confirm the reasoning holds.
- `product-loop-kit/signals/audit-findings.json` was left in its freshly-regenerated (uncommitted) state rather than reverted — confirm this matches the reviewer's expectation before any commit.
- `GLOBAL_FALLBACK_ROOT` is unreachable in this exact environment (see deviation #2) since `npm root -g` already equals it; if the verifier wants to see `source: 'global-fallback'` actually fire, that requires an environment where the two diverge, or a temporary monkeypatch of `execSync` (not something I added a hook for, to avoid growing the diff further).
