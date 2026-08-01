# Notes: backlog 201 — the 768px lens

Build session, 2026-08-01, branch `claude/loop-201`. Implements `specs/201.md`
exactly: leg A (ungate `checkResponsive` from `s.width <= 360` to `<= 768` at
all five call sites, fix the stale "at 360px" comment, plus the one-token
`test_audit_funnel_lens.js` co-move added by the operator's mid-build spec
amendment — see "The `test_audit_funnel_lens.js` co-move" below), leg B
(append five 768px surfaces after `plan-bloom-dark`), leg C
(`test_audit_768_lens.js`).

**Mid-build amendment.** This item's first pass surfaced a genuine
self-conflict in the spec's first draft (criteria 2 and 6 were jointly
unsatisfiable — see below); that was reported honestly rather than papered
over, the operator amended `specs/201.md` (leg A now carries the resolution;
criteria 4/6/7 updated) to authorize a single-token co-move in
`test_audit_funnel_lens.js`, and this second pass applies exactly that
co-move and re-verifies. Everything in this document from "The
`test_audit_funnel_lens.js` co-move" onward reflects that second pass.

## What changed and why

**`audit-app.js`** (31 lines changed: 24 insertions, 7 deletions):

- Leg A — five one-token edits, `s.width <= 360` → `s.width <= 768`, at the
  five `checkResponsive` call sites (pool-card, landing-search-submit,
  gp-chip, gp-checkout-cta, cta-button-primary). No `responsive: true` flag
  introduced (explicitly rejected by the spec). Fixed the one stale "at
  360px" comment inside `checkResponsive` itself (the scroll-check comment)
  to read "at the surface's own width" — the code already meant that, only
  the comment was stale. (The file's only other "360px" comment,
  `// page itself had never been rendered at 360px or in Korean at all.`, is
  backlog 200's own historical changelog comment describing what *that* item
  did — not a description of current behavior — so it was left untouched.)
- Leg B — five new surfaces appended strictly after `plan-bloom-dark`, with a
  comment block in the same style as the backlog-200 block above it:
  `pool-detail-768`, `grid-768`, `landing-768`, `planner-768`,
  `plan-bloom-768`. URLs reused byte-for-byte from siblings (`poolUrl`,
  `/home.html?token=USDC`, `/`, `/plan.html`,
  `/plan.html?goal=retirement&pace=stable&monthly=500&years=10`). No
  dark/ko flag, no new budget knob, per spec.

**`test_audit_768_lens.js`** (new file, 233 lines) — two layers mirroring
`test_audit_funnel_lens.js`'s shape: source-level assertions (surface
literals, append position, `--static-only` filter intact, all five call
sites at `<= 768`, zero at `<= 360`, and the load-bearing generic property
check that every kind pool/grid/landing/planner/bloom has >=1 surface at
width 768) plus one skip-tolerant `runAudit({ only: ['landing-768',
'pool-detail-768'] })` integration where only the `runAudit()` call sits
inside the timeout/catch.

**`test_audit_funnel_lens.js`** (one-token co-move, second pass only) — the
landing-driver assertion's verbatim source-literal match was updated from
`if (s.width <= 360) await checkResponsive(...'.landing-search-submit')` to
`if (s.width <= 768) await checkResponsive(...'.landing-search-submit')`,
because leg A moved the exact line that literal quotes. Nothing else in the
file changed — `git diff test_audit_funnel_lens.js` shows exactly one
changed line (see "The `test_audit_funnel_lens.js` co-move" below for the
full account, including the red-proof that this is a co-move and not a
weakened guardrail).

## Commands run, with real output

### 1. `node test_audit_768_lens.js`

```
$ node test_audit_768_lens.js
audit-app.js — backlog 201 768px lens surfaces

  ✓ default rotation contains "pool-detail-768" with url/kind/width per spec 201's table
  ✓ default rotation contains "grid-768" with url/kind/width per spec 201's table
  ✓ default rotation contains "landing-768" with url/kind/width per spec 201's table
  ✓ default rotation contains "planner-768" with url/kind/width per spec 201's table
  ✓ default rotation contains "plan-bloom-768" with url/kind/width per spec 201's table
  ✓ the five new surfaces are appended AFTER plan-bloom-dark (no existing surface renamed/moved)
  ✓ --static-only's exclusion mechanism (s.kind === 'static' filter) is present unchanged
  ✓ all five checkResponsive call sites read "s.width <= 768"
  ✓ zero checkResponsive call sites (or any other site) still read "s.width <= 360"
  ✓ property: every kind pool/grid/landing/planner/bloom has >=1 surface at width 768
[audit] playwright resolved from global (1.56.1) at /opt/node22/lib/node_modules
  (pools source: cache ..., 15819 pools)
  ✓ (e) runAudit({ only: ["landing-768", "pool-detail-768"] }) covers both new surfaces
  ✓ (e) the findings array is well-formed (a real defect found here is reported, never swallowed)

test_audit_768_lens.js: 12 passed, 0 failed
```

**12/12 pass**, both layers ran (integration was NOT skipped — real Chromium
render).

### 2. Guardrail tests

```
$ node test_audit_app.js
  ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes findings JSON
  ✓ positive control: injected 900T Base APY renders into pool-detail → P0 number-sanity finding
  ✓ negative control: injected 900T 30d-Mean APY is suppressed on pool-detail (backlog 144 rail holds)
test_audit_app.js: 3 passed, 0 failed
```

```
$ node test_audit_planner_surface.js
  ✓ (6 source-level checks)
  ✓ runAudit({ only: ["planner"] }) covers exactly the planner surface
  ✓ runAudit({ only: ["planner"] }) — the goal-picker first screen renders, no dead-end/dead-cta finding
  (skipped) case B integration — could not run the audit here: case B (staticOnly) exceeded 150s hard timeout
    reason recorded in product-loop-kit/specs/162-notes.md
test_audit_planner_surface.js: 8 passed, 0 failed
```
(That skip is pre-existing 162 behavior — a 150s timeout in *that* test's own
integration case B, unrelated to this item; unchanged by this diff.)

```
$ node test_audit_runner.js
9 assertions passed.
PASS test_audit_runner (9 assertions)
```

**Second-pass real output, after the operator-authorized one-token co-move**
(see "The `test_audit_funnel_lens.js` co-move" section below for the full
story — this superseded a first-pass run that legitimately failed 10/11
before the co-move; that failure and the spec conflict that caused it are
preserved verbatim below rather than deleted, per the operator's instruction
to "keep the honest account of how it was found — it is the most valuable
thing in the notes"):

```
$ node test_audit_funnel_lens.js
audit-app.js — backlog 200 funnel-lens surfaces

  ✓ default rotation contains "landing-360" with url/kind/width/dark/ko per spec 200's table
  ✓ default rotation contains "landing-dark" with url/kind/width/dark/ko per spec 200's table
  ✓ default rotation contains "landing-ko" with url/kind/width/dark/ko per spec 200's table
  ✓ default rotation contains "planner-dark" with url/kind/width/dark/ko per spec 200's table
  ✓ default rotation contains "plan-bloom-dark" with url/kind/width/dark/ko per spec 200's table
  ✓ the five new surfaces are appended AFTER plan-bloom-ko (no existing surface renamed/moved)
  ✓ --static-only's exclusion mechanism (s.kind === 'static' filter) is present unchanged
  ✓ property: every funnel kind (landing/planner/bloom) has >=1 dark surface, and landing has a 360px, a dark AND a ko surface
  ✓ the landing driver (kind === 'landing') captures auditText's return value and gains a responsive + an i18n check
[audit] playwright resolved from global (1.56.1) at /opt/node22/lib/node_modules
  (pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15819 pools)
  ✓ (e) runAudit({ only: ["landing-360", "landing-ko"] }) covers both new surfaces
  ✓ (e) the findings array is well-formed (a real defect found here is reported, never swallowed)

test_audit_funnel_lens.js: 11 passed, 0 failed
```

**11/11 pass — all green, including the previously-failing landing-driver
assertion.** (Note for anyone counting: this file has 11 `test()` calls
total, not 12 — `test_audit_768_lens.js` is the one with 12. "12/12" in the
coordinator's request appears to have meant "back to fully green"; the
correct real total for this file is 11/11.)

**First-pass output (before the co-move), preserved for the record:**
```
$ node test_audit_funnel_lens.js
  ✓ (8 of the surface/static-filter/property checks)
  ✗ the landing driver (kind === 'landing') captures auditText's return value and gains a responsive + an i18n check
    landing driver missing the 360px responsive check against .landing-search-submit — got block: [...]
      if (s.width <= 768) await checkResponsive(page, s, findings, '.landing-search-submit');
  ✓ (e) runAudit({ only: ["landing-360", "landing-ko"] }) covers both new surfaces
  ✓ (e) the findings array is well-formed (a real defect found here is reported, never swallowed)
test_audit_funnel_lens.js: 10 passed, 1 failed
```
This was reported honestly in the first pass rather than silently patched or
worked around, which is what let the operator identify it as a spec error
(criteria 2 and 6 of the first-draft spec were jointly unsatisfiable) rather
than an implementation error, and amend `specs/201.md` accordingly. Full
account in "The `test_audit_funnel_lens.js` co-move" below.

### 3. NORTH_STAR.md's Test command

```
$ node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
All 208 assertions evaluated.
9/9 passed
9/9 passed
```
All three pass, exit 0. (No line of these files touches `audit-app.js`;
included as required, ran clean as expected.)

### 4. Full `node audit-app.js` run + `surfacesCovered`

Started the static server (`npm run dev` → `node dev-server.js` on :8000) in
the background, then ran the full audit against it, timeboxed:

```
$ npm run dev &          # background, port 8000
$ node audit-app.js      # completed in well under the 5-minute timebox
[audit] findings: 1 total, 0 blocking (P0/P1)
```

Real `surfacesCovered` from the rewritten
`product-loop-kit/signals/audit-findings.json`: **82** entries, not the
spec's predicted **65**. All five new names are present:

```
pool-detail-768: true
grid-768: true
landing-768: true
planner-768: true
plan-bloom-768: true
```

The only finding in the whole run is the pre-existing, unrelated
`pool-prescan:mean30d-rail-breach` P2 aggregate (reconciled/downgraded, same
class as backlog 200's baseline) — **zero findings on any of the five new
768px surfaces in this run.**

**Why 82, not 65 — explained, not hand-waved:** the committed baseline
`audit-findings.json` at `HEAD` (before this session's changes) itself
reports `surfacesCovered.length === 60`, but that baseline predates backlog
200's own five surfaces even being rendered (its `surfacesCovered` array is
missing `landing-360/-dark/-ko`, `planner-dark`, `plan-bloom-dark` entirely —
21 "fixed" entries, not the 26 the current code produces) — i.e. the
committed signals file was stale relative to the code at `HEAD` even before
this item touched anything, most likely last regenerated before 200 shipped
its own surfaces and never refreshed since. The spec's "60 → 65" prediction
inherited that same stale number.

The *reproducible, deterministic* count — the fixed default-rotation array
length, independent of pool/static rotation sampling — moved from **23 to
28** (verified programmatically against an isolated `origin/main` worktree
below, criterion 1), exactly the `+5` leg B specifies. The *reported*
`surfacesCovered` total in a full run additionally includes non-deterministic
per-tick entries: individual `pool-detail:<uuid>` rotation/lens renders and
`static-page:<path>` rotation picks, whose count depends on rotation-state
position and time budget on each run (this run: 39 `pool-detail:` + 13
`static-page:` entries, vs the stale baseline's 33 + 6) — that variability is
inherent to the rotation design (161/167/197), not something leg A/B change.

**Files rewritten by this run** (as expected/permitted): `git status --short`
shows
```
 M audit-app.js
 M product-loop-kit/signals/audit-findings.json
 M product-loop-kit/signals/audit-rotation.json
 M product-loop-kit/signals/audit-static-rotation.json
?? test_audit_768_lens.js
```
The three `signals/*` files were rewritten purely by running the audit (per
instructions, that's fine — the operator decides what to commit).

### 5. Non-vacuity proof (acceptance criterion 3)

**Mutation** — `audit-app.js`, inside `checkResponsive`, forced the
ancestor-clip branch to always fire (mirrors backlog 200's own probe (a)):
```diff
     const box = await cta.boundingBox();
-    if (!box || box.width <= 0 || box.height <= 0) {
+    if (/* NON-VACUITY PROBE 201, TEMPORARY */ true) {
```

**Render** — real Chromium via `runAudit({ only: ['landing-768'] })`:
```
$ node -e '... runAudit({ port: 8949, only: ["landing-768"], outPath: ... })'
surfacesCovered: ["landing-768"]
findings: [
  {
    "surface": "landing-768",
    "viewport": "768px",
    "check": "responsive",
    "severity": "P2",
    "detail": ".landing-search-submit has zero-area box at 768px (ancestor-clipped)"
  }
]
```

The finding's `viewport` is `"768px"` and its `detail` string contains
`"768px"` — proof that `checkResponsive` actually executed at width 768 on a
real render, not that the 768 surface merely rendered clean because the
check never ran.

**Revert** — restored the exact original line:
```diff
     const box = await cta.boundingBox();
-    if (/* NON-VACUITY PROBE 201, TEMPORARY */ true) {
+    if (!box || box.width <= 0 || box.height <= 0) {
```
Confirmed byte-exact: `git diff --stat audit-app.js` → `31 ++++++++++++++---
------`, `1 file changed, 24 insertions(+), 7 deletions(-)` — identical to
the stat before the probe, i.e. only the intended leg A/B diff remains.

### 6. Red-proof for the test (acceptance criterion 5)

**Mutation** — reverted the `pool-card` call site (leg A's first edit) back
to `<= 360`:
```diff
-      if (s.width <= 768) await checkResponsive(page, s, findings, '.pool-card');
+      if (s.width <= 360) await checkResponsive(page, s, findings, '.pool-card');
```

**Run** — `node test_audit_768_lens.js`:
```
  ✗ all five checkResponsive call sites read "s.width <= 768"
    expected exactly 5 call sites reading "s.width <= 768", found 4
  ✗ zero checkResponsive call sites (or any other site) still read "s.width <= 360"
    expected 0 occurrences of "s.width <= 360" in audit-app.js, found 1
test_audit_768_lens.js: 10 passed, 2 failed
```
Went red exactly as designed — both the positive-count assertion and the
zero-360 regression guard caught it independently.

**Revert** — restored `<= 768`:
```diff
-      if (s.width <= 360) await checkResponsive(page, s, findings, '.pool-card');
+      if (s.width <= 768) await checkResponsive(page, s, findings, '.pool-card');
```
Re-ran: `test_audit_768_lens.js: 12 passed, 0 failed`. `git diff --stat
audit-app.js` back to `31 changed / 24+ / 7-` — byte-identical to the
intended diff.

### Criterion 1 — programmatic surface-name array diff (isolated worktree)

```
$ git worktree add <scratchpad>/main-baseline origin/main
$ node -e '... parse "let surfaces = [...]" names from both files ...'
baseline count: 23
branch count: 28
added: ["pool-detail-768","grid-768","landing-768","planner-768","plan-bloom-768"]
removed: []
branchMinusNew === baseline (order-preserving): true
$ git worktree remove <scratchpad>/main-baseline --force
```
Baseline (`origin/main`) + exactly five appended names, no rename, no
reorder — proven programmatically, not asserted.

## 768px product finding — filed, not fixed

**Null result, honestly reported.** The real `node audit-app.js` full run
(section 4) produced **zero** findings on any of the five new 768px
surfaces. The `test_audit_768_lens.js` integration run (`only: ['landing-768',
'pool-detail-768']`) also produced zero findings on those two surfaces. No
768px-specific product defect was surfaced by this session's real renders.

This is a measured null, not an assumption — CLAUDE.md's evidence 3 (the
`style.css:3931`/`:4029` `position: fixed` overlay risk at ≥641px) was the
*hypothesized* risk this lens was built to catch, but the actual renders in
this session did not trip `checkResponsive`'s ancestor-clip or scroll checks
against the specific selectors this item's five call sites cover
(`.pool-card`, `.landing-search-submit`, `.gp-chip`, `.gp-checkout-cta`,
`.cta-button-primary`) on the surfaces rendered. Per spec 200's rule (also
this item's own instruction), had a real defect been found it would have
been filed here with severity, not fixed — there is nothing to file.

## The `test_audit_funnel_lens.js` co-move — the conflict, the amendment, the resolution

**How this was found (first pass, kept verbatim — this is the most valuable
part of these notes).** Implementing leg A exactly as the spec's first draft
wrote it — "Change each `if (s.width <= 360)` to `if (s.width <= 768)`" at
**all five** call sites — necessarily includes the `.landing-search-submit`
site. `test_audit_funnel_lens.js` (backlog 200's own test) contains a
verbatim source-string assertion for that exact line:
```js
assertT(landingBlock.includes("if (s.width <= 360) await checkResponsive(page, s, findings, '.landing-search-submit');"), ...)
```
Once leg A ships, that literal string is permanently absent from
`audit-app.js`, so this assertion fails. The first-draft spec's own
acceptance criteria 2 ("`grep -c 's.width <= 360' audit-app.js` returns 0")
and 6 ("`test_audit_funnel_lens.js` ... all pass") were therefore **jointly
unsatisfiable** under the hard constraint "Touch ONLY audit-app.js and the
new test_audit_768_lens.js" (which forbade updating the stale literal). The
first pass of this build implemented leg A exactly as specified (all five
sites, no exception carved out for the landing one) and reported the
resulting `test_audit_funnel_lens.js` failure honestly rather than either
silently weakening leg A to keep the old test green (which would have left a
real `s.width <= 360` in the file and directly failed criterion 2) or quietly
editing the guardrail test outside the stated scope. That is what let this
surface as a **spec** error rather than being misdiagnosed as an
implementation bug.

**The operator's amendment.** The operator confirmed the conflict was an
error in the spec, not the implementation, amended `specs/201.md` (leg A now
documents the conflict and its resolution inline; criteria 4, 6 and 7
updated), and explicitly authorized — for this one case only — superseding
the "touch only audit-app.js + the new test" constraint with a single-token
co-move in `test_audit_funnel_lens.js`.

**The resolution actually applied (second pass).** One line changed in
`test_audit_funnel_lens.js`:
```diff
-  assertT(landingBlock.includes("if (s.width <= 360) await checkResponsive(page, s, findings, '.landing-search-submit');"),
+  assertT(landingBlock.includes("if (s.width <= 768) await checkResponsive(page, s, findings, '.landing-search-submit');"),
```
Confirmed as the *only* change:
```
$ git diff test_audit_funnel_lens.js
--- a/test_audit_funnel_lens.js
+++ b/test_audit_funnel_lens.js
@@ -171,7 +171,7 @@ test("the landing driver (kind === 'landing') captures auditText's return value
   assertT(landingBlock.includes('const text = await auditText(page, s, findings);'),
     `landing driver must capture auditText's return value (today's KO check needs it) — got block:\n${landingBlock}`);
-  assertT(landingBlock.includes("if (s.width <= 360) await checkResponsive(page, s, findings, '.landing-search-submit');"),
+  assertT(landingBlock.includes("if (s.width <= 768) await checkResponsive(page, s, findings, '.landing-search-submit');"),
     `landing driver missing the 360px responsive check against .landing-search-submit — got block:\n${landingBlock}`);
   assertT(landingBlock.includes('if (s.ko)') && landingBlock.includes('/[가-힣]/.test(text)') && landingBlock.includes("'i18n', 'P2', 'KO surface rendered no Hangul text'"),
     `landing driver missing the KO Hangul i18n check (same shape as the planner/bloom drivers) — got block:\n${landingBlock}`);
```
`git diff --stat` on that file: `1 file changed, 1 insertion(+), 1
deletion(-)` — a single changed line, exactly as criterion 6 requires. (The
line 175 error-message string, which also mentions "360px", was deliberately
left untouched per the operator's "change NOTHING else... at most that one
[optional] comment line" instruction — it is a failure-path message, not a
`//` comment, and its staleness is cosmetic: it only ever prints when the
assertion above it fails, which it no longer does.)

**Proof this is a co-move, not a weakened guardrail (acceptance criterion 6's
own point) — the assertion can still go red:**

Mutation — temporarily removed the `.landing-search-submit` call site from
`audit-app.js`'s landing driver (not just commented inline — the literal
substring had to be fully absent, not merely prefixed with `//`, since
`.includes()` matches inside comments too; first attempt at this proof
briefly failed to go red for exactly that reason and was corrected before
recording):
```diff
       // responsive — backlog 200, 360 surface only, against the primary control.
-      if (s.width <= 768) await checkResponsive(page, s, findings, '.landing-search-submit');
+      // RED-PROOF 201 (3), TEMPORARY: call site removed to prove the test can go red.
```
Run — `node test_audit_funnel_lens.js`:
```
  ✗ the landing driver (kind === 'landing') captures auditText's return value and gains a responsive + an i18n check
    landing driver missing the 360px responsive check against .landing-search-submit — got block:
if (s.kind === 'landing') {
      ...
      // responsive — backlog 200, 360 surface only, against the primary control.
      // RED-PROOF 201 (3), TEMPORARY: call site removed to prove the test can go red.

      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      ...
test_audit_funnel_lens.js: 10 passed, 1 failed
```
Exact failure line: **`✗ the landing driver (kind === 'landing') captures
auditText's return value and gains a responsive + an i18n check`**, same
assertion name as the original first-pass failure, now triggered by an
actually-missing call site rather than a stale literal — proving the
assertion still enforces "the landing driver has a responsive check against
`.landing-search-submit`" and did not become a tautology.

Revert — restored the exact original line:
```diff
       // responsive — backlog 200, 360 surface only, against the primary control.
-      // RED-PROOF 201 (3), TEMPORARY: call site removed to prove the test can go red.
+      if (s.width <= 768) await checkResponsive(page, s, findings, '.landing-search-submit');
```
Re-ran: `test_audit_funnel_lens.js: 11 passed, 0 failed`. `git diff --stat
audit-app.js` back to `31 changed / 24 insertions(+) / 7 deletions(-)` —
byte-identical to the intended leg A/B diff; `git diff --stat
test_audit_funnel_lens.js` back to `1 file changed, 1 insertion(+), 1
deletion(-)` — the single intended co-move line, nothing else.

## What was NOT run (UNRUN, not implied green)

- `test_audit_planner_surface.js`'s own integration **case B** (staticOnly)
  was skipped inside that test's own skip-tolerant catch — "exceeded 150s
  hard timeout" — this is pre-existing 162 behavior, unrelated to this item,
  and was not re-attempted or extended here.
- (Superseded — see "The `test_audit_funnel_lens.js` co-move" above.) In the
  first pass, no attempt was made to reconcile `test_audit_funnel_lens.js`'s
  failing assertion by editing that file, since doing so was outside that
  pass's hard constraints. The operator subsequently amended the spec to
  authorize exactly that one-token edit, which the second pass applied.
- The full `node audit-app.js` run in section 4 was run exactly once (not
  repeated) given the 5-minute timebox per command; a second run would very
  likely produce a different `surfacesCovered` total again (rotation state
  advances each run) — not re-run to chase a specific number since the
  deterministic part (the fixed surface list, 23→28) is what's actually
  being certified, and that was separately verified via the isolated-worktree
  diff (criterion 1).
- Acceptance criterion 8's bookkeeping (`BACKLOG.md` row 201, `specs/201-pr.md`,
  `LOG.md` entry) was **not** done in this session — this session's explicit
  task scope is "Touch ONLY audit-app.js and the new test_audit_768_lens.js"
  and "do NOT commit — the operator commits"; bookkeeping files are outside
  that scope and are left for the operator/harness step that owns the commit.

## Operator pass after the build agent (2026-08-01, same session)

Three changes made by the operator after the build agent's final run, each
re-verified below rather than inherited:

1. **Three stale call-site comments corrected** (`audit-app.js:3377`, `:3431`,
   `:3476`). They read `// responsive — 360 surface only, …` / `// responsive
   — backlog 200, 360 surface only, …`, which described the gate leg A had
   just widened — i.e. comments asserting current behaviour that had become
   false. Leg A already required fixing the stale "at 360px" comment inside
   `checkResponsive`; these three are the same class and were missed. Now
   `// responsive — 360 + 768 surfaces (widened by backlog 201), …`. Comment
   text only; no executable line touched.
2. **The three `product-loop-kit/signals/*.json` files were reverted**
   (`git checkout --`). They were rewritten purely as a byproduct of the
   agent's real `node audit-app.js` run, and they carry per-tick **rotation
   state** the heartbeat owns and compares day-over-day. Committing a
   mid-day, dev-server-driven rotation advance inside a build commit would
   corrupt that comparison. Precedent checked, not assumed: `git show --stat`
   on backlog 200's merge commit (`52ba75ed9`) lists no `signals/` file
   either.
3. **Carried forward for the heartbeat, not fixed here** (it is a signals-file
   observation, not product code, and fixing it inside this item would mean
   committing exactly the rotation state point 2 excludes): the committed
   `signals/audit-findings.json` is **stale relative to `main`** — its
   `surfacesCovered` array does not contain backlog 200's five surfaces at
   all, so the committed `60` never described the code at `HEAD`. That
   staleness is what the spec's wrong "60 → 65" prediction inherited.

**Re-run by the operator after edit 1** (never inherit a green across an edit,
even a comment-only one — `test_audit_funnel_lens.js` matches driver source as
a literal block, so comment edits are not automatically inert):

```
$ node test_audit_768_lens.js        → 12 passed, 0 failed
$ node test_audit_funnel_lens.js     → 11 passed, 0 failed
$ node test_audit_planner_surface.js →  8 passed, 0 failed   (pre-existing 162 case-B skip)
$ node test_audit_runner.js          →  9 assertions passed
$ node test_audit_app.js             →  3 passed, 0 failed
$ node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
                                     → 208 assertions + 9/9 + 9/9, exit 0
```

Final diff handed to the verifier — **regenerated from `git diff --name-only
origin/main` + `git status --short` at hand-off time, not written from
memory** (that is the whole lesson of attempt 1, applied to itself):

```
$ git diff --stat origin/main
 audit-app.js                                       | 40 ++++++++++++++------
 product-loop-kit/BACKLOG.md                        |  1 +
 product-loop-kit/LOG.md                            |  1 +
 .../playbooks/detector-signal-coverage.md          | 39 ++++++++++++++++++-
 test_audit_funnel_lens.js                          |  2 +-
 5 files changed, 71 insertions(+), 12 deletions(-)

$ git status --short   # untracked, all new files belonging to this item
?? product-loop-kit/specs/201-notes.md
?? product-loop-kit/specs/201-pr.md
?? product-loop-kit/specs/201.md
?? test_audit_768_lens.js
```

Nine files total: five modified, four new. `product-loop-kit/signals/*.json`
is deliberately absent (point 2 above).

4. **The playbook update — build.md step 6 (the compound step), standing
   decision 2026-07-22.** `playbooks/detector-signal-coverage.md` gains one
   subsection under its existing fourth (LENS) axis:
   *"The check exists, has a call site, and is still gated shut."* 200's
   paired trap is "the driver has no check for the condition"; 201 is the
   next costume down and survives 200's own remedy — the driver **has** the
   check, the call site **is** there, the body is generic, and the call
   site's own trigger predicate still excludes the value being added
   (`s.width <= 360` evaluated at 768). Plus the two rules that fall out
   (ship gate + surfaces as one item; widen the predicate rather than adding
   an opt-in flag), the "non-vacuity for a lens is width-specific" rule, and
   the co-move rule for a prior test that quotes the line you are changing.
   UPDATED, not duplicated, per the playbooks README — the provenance line at
   the foot of the file gains a 201 clause. LOG.md carries
   `+playbook: detector-signal-coverage`.

**Verifier attempt 1 returned FAIL — recorded here rather than quietly
fixed.** Criteria 1-6 were confirmed with evidence the verifier produced
itself (its own worktree parser, its own grep, three adversarial mutations of
`test_audit_768_lens.js`, a non-vacuity proof using a *different* mutation
site than this build used — forcing the scroll-width branch rather than the
ancestor-clip branch — and its own red-proof of the funnel co-move by
reverting the value rather than deleting the call site). The FAIL was
entirely process integrity, and it was mine:

- **The playbook change above was undisclosed.** It was made after the
  "Operator pass" section's final-diff line had been written, and that line
  was not updated — so the notes' own accounting of what changed was FALSE
  while a real, substantive file sat modified in the tree. The verifier
  caught it from `git diff --name-only`, which is exactly the check that
  should catch it. Item 4 above and the corrected final-diff line are the
  fix; the false claim is left visible in this paragraph rather than being
  silently overwritten.
- **Acceptance criterion 8 (same-commit bookkeeping) was unmet at review
  time** — no `BACKLOG.md` row, no `LOG.md` entry. Both were written before
  re-verification.

The lesson, which is the one worth carrying: a diff disclosed in prose is not
disclosed. `git diff --name-only` is the source of truth, and any notes
section claiming "the final diff is X" must be regenerated from it at the
moment of hand-off, not written from memory earlier in the session.
