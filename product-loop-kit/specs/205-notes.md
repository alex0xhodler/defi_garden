# 205-notes — Seven orphaned test_*.js files wired into test:serial + a guard test

Written as the build proceeded, per spec instruction. All work stayed inside the allowlist:
`package.json` (the `test:serial` string only), `test_list_polish.js`, `test_test_registry.js` (new),
`product-loop-kit/playbooks/test-gate-observability.md`, this file.

## Trap hit immediately: local `main` is stale — used `origin/main` instead

The spec's verification list says `git diff main -- test_list_polish.js`. The local `main` ref in this
checkout points at `9ab9a2432` (112 `test:serial` steps), which is **behind** the branch point
(`a4dbd99cd`, 120 steps) that both the spec and `HEAD`'s own ancestry agree on — i.e. local `main` is
not an ancestor state consistent with the spec's stated baseline. `git merge-base HEAD main` even
resolved to `main`'s own tip, confirming local `main` is stale relative to `HEAD`, not a diverged
sibling. This is exactly the trap named in
`playbooks/test-gate-observability.md` ("`origin/main` in a cloud checkout is often stale... `git fetch
origin main` *before* any scope check"). I ran `git fetch origin main` and diffed against `origin/main`
(`a4dbd99cd`, matching `HEAD` exactly) for every comparison in this task, including the `package.json`
structural-diff and the `test_list_polish.js` diff below. All reported diffs in this file and in my
final report are against `origin/main`, not local `main`.

## 1. `test:serial` wiring — placement reasoning (not specified exactly by the spec)

The spec says "place each new step next to its topical neighbours where one obviously exists...
otherwise append." Five had a clear neighbor; two did not. Recorded here since this is a judgment call:

- `test_helpers_parser.js` → inserted immediately before `test_protocol_parsing.js` (was: after
  `test_planner_sharpe_pick.js`). Not just topical — `test_helpers_parser.js` exports `extractParser()`,
  which `test_protocol_parsing.js` and `test_qualifier_fix.js` both consume; placing it directly before
  its first consumer is the closest thing to an "obvious" neighbor here.
- `test_seo_src_attribution.js` → inserted after `test_seo_app_link_attribution.js`, before
  `test_seo_cta_targets.js`. Chose this seo_* cluster (position ~24) over the other two (`test_seo_shared_source.js`
  at ~89, `test_seo_surface_audit.js` at ~106) because it's the only one that is itself an *attribution*
  test, matching `test_seo_app_link_attribution.js` by both name and mechanism (both are link-attribution
  guards from the 202→203→204 chain).
- `test_llms_shared_source.js` → inserted after `test_llms_link_integrity.js`, the last of the four
  contiguous `test_llms_*` steps — unambiguous.
- `test_list_polish.js` → inserted after `test_list_default.js` — unambiguous (only other `test_list_*`
  file in the chain, and 095's spec text says it "clones test_list_default.js's server... verbatim").
- `test_earnings_dedup.js` → inserted after `test_pool_underlying_address.js`, before
  `test_kpi_rail_history.js`. No `test_earnings_*` sibling exists; chose the pool-detail cluster
  (`test_pool_type_badge.js` … `test_pool_underlying_address.js`) since 128's earnings-dedup change is a
  pool-detail-page change, per its own header comment.
- `test_audit_768_lens.js` → inserted after `test_audit_funnel_lens.js`, before
  `test_audit_cta_provenance.js` — placed with the other `_lens` audit tests
  (`test_audit_pool_lens.js`, `test_audit_funnel_lens.js`), continuing that naming pattern.
- `test_nav_rail_ia.js` → **no topical neighbor exists** (no other nav-rail-IA test in the chain).
  Appended at the end of the "content" tests, immediately before `test_run_tests.js`, per the spec's
  "otherwise append" instruction.
- `test_test_registry.js` → appended as the very last step, after `test_run_tests.js`. Spec explicitly
  says "chicken-and-egg is fine and intended" for wiring this test into the chain it itself audits;
  placing it last means by the time it runs, every other wiring decision above is already reflected in
  the file it reads.

Verified: `origin/main`'s 120 steps survive as an in-order subsequence of the new 128-step chain
(scripted check, see Verification section) — nothing was reordered or reworded, only inserted.

## 2. `test_list_polish.js` fix

Two changes, exactly as scoped:
- `IGNORABLE_ERROR_PATTERN` (line 32): appended `|icons\.llamao\.fi` — copied verbatim from
  `test_nav_rail_ia.js:31`'s pattern (same regex, same flag).
- `SCRATCH` (line 26): replaced the dead hardcoded UUID path with `os.tmpdir()` directly (added
  `const os = require('os');`). **Conservative choice**: I used `os.tmpdir()` unmodified rather than
  `fs.mkdtempSync(path.join(os.tmpdir(), 'dg-095-shots-'))` (the pattern other test files in this repo
  use for scratch dirs, e.g. `test_seo_src_attribution.js`'s `dg-203-gen-` prefix). Reasoning: `shot()`
  already swallows its own errors and writes four fixed-name PNGs (`095-1280.png`, `095-768.png`,
  `095-360.png`, `095-1280-dark.png`) with no cleanup step either way — the spec explicitly says this is
  "a correctness/portability fix, not a behaviour change," so I picked the smallest diff that makes
  `shot()` write somewhere that exists on every machine, rather than introducing a new mkdtemp/cleanup
  lifecycle that the file didn't have before. The four assertion bodies (A–F) were not touched.

`git diff origin/main -- test_list_polish.js` confirms only: the `os` require added, the `SCRATCH`
line, and the `IGNORABLE_ERROR_PATTERN` line changed. No assertion line differs.

Ran standalone: `timeout 280 node test_list_polish.js` → **exit 0**, `✓ 6/6 list-polish assertions
passed`. Screenshots wrote to `/tmp/095-*.png` (visible in the run's own log lines) — the gate defect
(`ERR_CONNECTION_RESET` on `icons.llamao.fi` flipping `process.exitCode = 1` despite 6/6 assertions
passing) is fixed.

## 3. `test_test_registry.js` — new guard test

Design choices and how each spec requirement is met:

- **(a)–(c)** are implemented as small pure functions (`computeOrphans`, `computeGhosts`,
  `computeDuplicates`) operating on plain arrays, shared between the real-repo assertions and (e)'s
  self-defeat case — so (e) proves the exact same logic (a) trusts, not a separate copy of it.
- **(d) parse integrity**: reuses `run-tests.js`'s own exported `parseFileList()`/`readSerialChain()`
  rather than re-deriving the `"node <file>.js"` regex a second time, per the spec's stated preference
  ("reuse run-tests.js's exported parser if it exports one" — it does export both). No export was added
  to `run-tests.js`; both functions were already in its `module.exports`. `run-tests.js` is therefore
  **completely untouched** by this item.
- **(e) self-defeat**: builds an in-memory chain **string** (`"node a.js && node b.js && ..."`, the same
  shape as `test:serial` itself) with one known on-disk file deliberately omitted, feeds it through the
  same reused `parseFileList()`, and asserts `computeOrphans()` reports exactly that one file — then
  re-asserts the real, unmutated chain is still clean, to show the red came from the deliberate omission
  and not from some ambient side effect of the test itself.
- **Lane classification (the trap named in the playbook and in spec §3)**: `run-tests.js`'s classifier
  flags a file as browser-lane if the file's **own raw text** contains the literal substring naming the
  browser-driving test framework — checked *before* it even looks at that file's requires. So the
  constraint is stricter than "don't require run-tests.js by a literal path": the word must not appear
  **anywhere** in this file's own source, including comments, or it self-flags regardless of any require
  mechanism. `test_test_registry.js` never needs to name that package at all (unlike
  `test_run_tests.js`, which legitimately tests the classifier itself and therefore needs a split-halves
  `PKG_HALF_A + PKG_HALF_B` reconstruction trick to build a *fixture* containing the word) — so this
  file is simpler than `test_run_tests.js`'s equivalent workaround: no marker string, no split literal,
  because none is needed. The one workaround it does share with `test_run_tests.js`: `run-tests.js` is
  loaded via a computed path (`const RUN_TESTS_PATH = path.join(REPO_ROOT, 'run-tests.js'); require(RUN_TESTS_PATH);`),
  never a bare quoted relative-path literal directly inside `require(...)`, since the classifier's local-require
  scan (`LOCAL_REQUIRE_RE`) only matches that exact literal-in-call shape — and `run-tests.js`'s own
  source does contain the browser-driver name many times over, so a literal `require('./run-tests.js')`
  would pull that dependency in and flip this file's lane via transitive scanning.
- Verified after writing: `node run-tests.js --list --lane=plain` includes `test_test_registry.js	plain`.

Wired into `test:serial` as the last step (see §1).

## 4. Playbook update

Edited `product-loop-kit/playbooks/test-gate-observability.md` **step 4 only** (plus one provenance
line in the file's existing end-of-file provenance-log style, matching the format already used for
items 163 and 186) — never duplicated the step, kept it a checklist per the spec's instruction. Step 4
now: (a) still states the original human-checklist rule verbatim ("if you add a test file, append it to
`test:serial`"), (b) records the measured fact from `specs/205.md` (7 of 127 orphaned, ~6 months of
accumulation), (c) names `test_test_registry.js` as the now-enforcing check, and (d) tells a future
reader that a red from that test means the checklist step was violated again — i.e. the step is now a
description of an enforced invariant, not the entire enforcement mechanism. No other section of the
playbook (Steps 1–3, 5, Traps, the two other Provenance blocks) was touched.

## 5. Pre-existing, out-of-allowlist state — NOT touched, flagged per instructions

`git status` shows `product-loop-kit/BACKLOG.md` modified (a new row 205, status `IN_PROGRESS`) and
`product-loop-kit/specs/205.md` untracked. **Neither was created or edited by me in this session** — no
`Edit`/`Write` call in this transcript touches either path. Both were already present in the working
tree when this task started (the build-loop's own item-promotion step, per the spec's own header: "Status:
promoted by the build loop 2026-08-02"). Per the allowlist instruction ("if correct work requires
touching ANY other file, STOP and report it") I did not touch, revert, or otherwise interact with
`BACKLOG.md` — reporting its pre-existing modified state here for the operator's awareness, since a
`git status --porcelain` at merge time will show it as a diff not accounted for by this item's own file
list.

## 6. Non-goals honored

- No product-red investigated or fixed beyond the one named gate defect in scope (`test_list_polish.js`'s
  `icons.llamao.fi` omission). No test in this run surfaced a NEW product red; the two additional
  standalone browser-lane runs I performed (see §7) both came back fully green.
- `run-tests.js` untouched (§3).
- No test CI added.
- `.gitignore` guard for `_audit_probe_*.html` (203's named residual) not touched — explicitly out of
  scope per spec §Non-goals.
- Existing 120 `test:serial` steps preserved byte-identical and in order (verified, see below).

## 7. Verification run log (all commands + decisive output)

All commands timeboxed under 5 foreground minutes as instructed.

1. **Disk-vs-chain diff** (`node -e` one-liner, parses `package.json` + `fs.readdirSync('.')`):
   ```
   listed: 128 onDisk: 128 orphans: 0 ghosts: 0 duplicates: 0
   {"orphans":[],"ghosts":[],"duplicates":[]}
   ```
   Matches acceptance criterion 1 exactly (127 pre-existing + `test_test_registry.js` = 128).

2. `node test_test_registry.js` → **exit 0**. Per-assertion lines:
   ```
   ✓ (a) no orphans: every test_*.js file in the repo root appears in test:serial
   ✓ (b) no ghosts: every test:serial step names a file that exists on disk
   ✓ (c) no duplicates: no file appears twice in test:serial
   ✓ (d) parse integrity: every test:serial step matches "node <file>.js" via run-tests.js's own parseFileList()
   ✓ (e) self-defeat: the orphan check goes RED on an in-memory chain string missing a known file
   5/5 assertions passed
   ```

3. `timeout 280 node test_list_polish.js` → **exit 0**, `✓ 6/6 list-polish assertions passed`.

4. `node test_helpers_parser.js` → **exit 0** (silent; module has no self-executing test body — it only
   exports `extractParser()` for its two consumers, matching the spec's "6/7 pass as-is" pre-verification
   note).

5. `node test_llms_shared_source.js` → **exit 0**, `12 assertions passed` (all ✓, including the
   git-status-unchanged guardrail).

6. `node run-tests.js --list --lane=plain` → includes `test_test_registry.js	plain`.
   `node run-tests.js --list` → `TOTAL files=128 plain=42 browser=86 listed=128`.

7. `git diff origin/main -- test_list_polish.js` → confirmed only the `os` require, the `SCRATCH` line,
   and the `IGNORABLE_ERROR_PATTERN` line changed (full diff pasted into §2 above). (Used `origin/main`,
   not local stale `main` — see the trap note at the top of this file.)

8. **Structural package.json diff** (parsed both JSONs, stripped `scripts['test:serial']`, compared the
   rest): `rest identical: true`. The raw text diff of `package.json` against `origin/main` is a
   **single changed line** (the `test:serial` value) — verified by `git diff --stat` and by eye.

9. **120-step preservation**: scripted subsequence check — every one of `origin/main`'s 120
   `test:serial` steps appears in the new 128-step chain, in the same relative order, byte-identical text
   (`matched old steps in order as subsequence: 120 / 120`).

10. **Heavy browser orphans — timebox honesty.** Of the four browser-lane orphans
    (`test_audit_768_lens.js`, `test_seo_src_attribution.js`, `test_nav_rail_ia.js`,
    `test_earnings_dedup.js`), I **ran two** in this session, within the 5-minute-per-command budget:
    - `node test_audit_768_lens.js` → **exit 0**, `12 passed, 0 failed` (all 10 source-level assertions
      plus both integration-layer assertions ran — Chromium was available in this sandbox).
    - `node test_seo_src_attribution.js` → **exit 0**, `6 passed, 0 failed`.
    I did **not** run `test_nav_rail_ia.js` or `test_earnings_dedup.js` in this session — per the task
    instructions these were "already verified green by the operator on this checkout" (10/10 and 4/4
    respectively, per `specs/205.md`'s pre-verified-state table) and re-running all four was out of
    budget. Their green status in this report rests on the operator's stated pre-verification, not on a
    run I performed — stated explicitly so "green" here is never claimed for a file I did not execute.

## Summary of deviations from a literal reading of the spec

None that change behavior or scope — the items above (§1 placement judgment calls, §2's `os.tmpdir()`
choice over `mkdtempSync`, §5's stale-`main` workaround) are all either explicitly left to judgment by
the spec's own wording ("where one obviously exists... otherwise append") or the most conservative
option consistent with "prove a correctness/portability fix, not a behaviour change."
