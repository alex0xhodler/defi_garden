# 185 — build notes (deviations, conservative choices, and why)

Item: repair the merge gate's own two pre-existing reds — A6b's stale raw-text
count (test_audit_prescan.js) and criterion 2's positive control pointed at a
permanently-deleted junk page (test_seo_surface_audit.js) — plus make the
silent override-drop in `buildStaticSurfaces()` audible (Leg C).
Branch: `claude/loop-185`. Built 2026-07-30.

---

## 1. Before/after test output, verbatim

### `test_audit_prescan.js`

**Before** (operator-supplied measurement, this run, clean `npm ci` at
`origin/main` `b2044a363`):
```
40 passed, 1 failed
✗ A6b (spec 171): runAudit() never passes textSurfaceFindings to reconcilePrescanFindings …
  expected exactly 3 occurrences of "reconcilePrescanFindings(" (1 function definition +
  2 runAudit() call sites) … got 5
```

**After** (this build, full run):
```
✓ A6a (spec 171, non-vacuity): ...
✓ A6b (spec 171): runAudit() never passes textSurfaceFindings to reconcilePrescanFindings — only prescanFindings (prefix static-prescan) and poolPrescanFindings (prefix pool-prescan)
✓ A6b non-vacuity (spec 185, direction a): a scratch COPY of audit-app.js gaining a GENUINE third call site trips the real-call-site count (3 -> 4)
✓ A6b non-vacuity (spec 185, direction b): a scratch COPY gaining only a COMMENT mentioning reconcilePrescanFindings( does NOT trip the count (stays 3)
...
test_audit_prescan.js: 43 passed, 0 failed
```
Full run: `timeout 290 node test_audit_prescan.js` → **43 passed, 0 failed**
(41 expected by the spec's own headline number — 40 pre-existing + A6b fixed —
plus 2 more test() cases for the two non-vacuity directions the spec's
acceptance criterion 2 requires be *asserted in the test file*, not just
demonstrated in prose; 43 > 40, satisfying the operator's "must be higher than
40" check).

### `test_seo_surface_audit.js`

**Before** (operator-supplied / reproduced from 184's notes, same baseline):
```
4 passed, 1 failed
✗ criterion 2 (positive control): expected a junk-slug P1 finding for tokens/00.html; got []
```
(`ls tokens/00.html` → No such file or directory, confirmed again at the top of
this run.)

**After** (this build, full run, verbatim):
```
✓ criterion 1: default run covers static-page + >=1 static-page:<slug>, writes findings JSON
✓ criterion 2 (positive control, self-provisioned fixture, backlog 185): control page real render -> junk-slug P1 quoting the rendered <h1>, control surface covered
✓ criterion 2 fixture hygiene (backlog 185): source page md5 unchanged, fixture fully removed
✓ criterion 6 non-vacuity (backlog 185): "surfacesCovered contains the control surface" CAN fail — a deliberately nonexistent override page drops silently and surfacesCovered lacks "static-page"
✓ buildStaticSurfaces() override branch (backlog 185 Leg C): a dropped nonexistent override entry is named on stderr; behaviour otherwise unchanged (still dropped, no throw, no finding)
✓ criterion 3 (negative control): tokens/usdc.html yields no junk-slug/zero-yield-claim/empty-table
✓ criterion 4 (false-positive guard): digit-LEADING real tickers (0X0, 1INCH) do not trip junk-slug
✓ criterion 5: same AUDIT_STATIC_SEED selects the same sample; a different seed selects a different one

test_seo_surface_audit.js: 8 passed, 0 failed
```
Wall time, **final clean re-run** (`time timeout 290 node test_seo_surface_audit.js`,
verified in isolation — see §1a below on why "final" matters here):
```
real  1m45.810s
user  0m16.426s
sys   0m6.602s
```
Well inside the 5-minute foreground timebox (acceptance criterion 11).

`test_audit_prescan.js` wall time, final clean re-run
(`time timeout 290 node test_audit_prescan.js`):
```
real  1m44.139s
user  0m18.556s
sys   0m5.371s
```
Well inside the 5-minute foreground timebox. (The bulk of this wall time is
the pre-existing Chromium-driven criteria 3/4/6 probe-page renders, unchanged
by this item; the new Leg A non-vacuity cases are pure fs/string-scan and add
negligible time — confirmed by their sub-second pass times in the console
output above.) Both figures were captured in dedicated, isolated `time`-prefixed
runs with nothing else in flight (see §1a) and are the numbers to trust; two
earlier same-day timings (1m55.312s / 1m43.711s / 1m51.567s across three prior
attempts) are consistent with these within normal variance and are not
separately listed.

### 1a. A stray background process from a resumed session corrupted one
intermediate re-run — caught, cleaned, and re-verified

Partway through re-verification, a second re-run of both files (issued to
double-check the numbers above) produced `test_audit_prescan.js: 42 passed, 1
failed` and a hard crash (`Node.js v22.22.2`, uncaught exception) in
`test_seo_surface_audit.js`, plus **two leftover untracked fixture
directories** (`_audit_seo_fixture_185_7020/`, `_audit_seo_fixture_185_3573/`)
and one leftover probe file (`tokens/_audit_probe_2538.html`) after the crash.

Root cause, confirmed via `ps aux`: a **separate, already-running** `node
test_seo_surface_audit.js` process (pid 3573, parent bash pid 2180, tagged
`--session-mode resume-cached`) was alive in the container from a resumed
session state, executing the *same* verification commands independently and
writing its own log to this session's scratchpad. It was already holding the
8901-8908 test ports when this build's own re-run tried to bind the same
ports, producing an `EADDRINUSE`-class crash (an unhandled `'error'` event on
`http.Server`, which throws and aborts the whole process before the test
file's `finally` block can run — the same reason its fixture and probe files
were left behind uncleaned).

**This was not caused by anything in the Leg A/B/C changes themselves** — it
is a test-port collision between two independently-running copies of the same
unmodified test infrastructure (this exact race would happen to the
*pre-change* files too, given two overlapping invocations). No product/test
logic bug. Remediation: the stray processes were killed
(`kill -9 2180 3571 3573`), the three leftover untracked
paths were removed (`rm -rf`/`rm -f`), all 15 relevant ports were confirmed
closed, and **both files were then re-run once more, in isolation, from a
verified-clean process table** — the `43 passed, 0 failed` /
`8 passed, 0 failed` / wall-time figures recorded throughout this document are
from that final clean pair of runs, with `git status --porcelain` confirmed
empty immediately afterward. Flagged here in full rather than silently
re-running past it, since a mid-run crash and leftover untracked files are
exactly the kind of thing this item's own acceptance criteria (5, "no
untracked file...anywhere else outside the intended diff") are designed to
catch.

## 2. Non-vacuity mutations run, and their results

**Leg A (A6b), both directions, inside `test_audit_prescan.js` itself:**
- Direction (a): a scratch copy of `audit-app.js` (written to
  `os.tmpdir()/audit-app-185-a6b-scratch-a-<pid>.js`, never the real file) had
  a genuine new call site appended:
  `reconcilePrescanFindings(someOtherAggregateFindings, { prefix: 'other-prescan' });`.
  Comment/string-stripped count moved from the asserted baseline of 3 to
  **4** — trips the `===3` assertion. Confirmed **PASS** (the test asserts
  `mutatedCount === 4` and `mutatedCount !== 3`).
- Direction (b): a second scratch copy had only a comment appended:
  `// another prose mention of reconcilePrescanFindings( added by the 185
  non-vacuity test (direction b), not a call site`. Comment-stripped count
  stayed at **3** — does NOT trip the assertion. Confirmed **PASS**.
- Both scratch files were written under `os.tmpdir()`, read back, counted, and
  removed in a `finally`; the real `audit-app.js`'s md5 was hashed before and
  re-hashed after each case and asserted identical both times — confirmed
  unchanged in both runs.

**Leg B (criterion 2), inside `test_seo_surface_audit.js` itself:**
- Positive direction: the real criterion-2 run against the self-provisioned
  fixture (a copy of `tokens/usdc.html` with its `<h1>` replaced by
  `00 DeFi Yields`) produces the junk-slug P1 finding AND
  `surfacesCovered.includes('static-page')` — confirmed **PASS**.
- Non-vacuity direction (acceptance criterion 6): a separate `runAudit()` call
  pointed `staticPages` at a deliberately nonexistent file
  (`_audit_seo_fixture_185_missing_<pid>.html`, asserted not to exist first)
  and asserted `surfacesCovered` does **NOT** include `'static-page'` — i.e.
  the same assertion criterion 2 relies on is shown capable of failing, not
  vacuously true. Confirmed **PASS** (stderr showed the Leg C drop note firing
  during this same call, corroborating the mechanism).
- Fixture hygiene: `tokens/usdc.html`'s md5 was hashed before the copy and
  re-hashed after the whole run; asserted identical. The fixture directory
  (`_audit_seo_fixture_185_<pid>/`) and file were asserted **absent** after the
  run's `finally` block ran. Confirmed **PASS**.

**Leg C, inside `test_seo_surface_audit.js`:**
- `buildStaticSurfaces({ staticPages: 'tokens/usdc.html,<nonexistent>' })`
  called directly (not through `runAudit()`, to capture `console.error`
  synchronously and cheaply — no browser needed since this is a pure fs
  function). Asserted: (a) a stderr line contains the dropped path; (b) the
  returned `surfaces` array contains exactly the one real entry, named
  `'static-page'` (i.e. behaviour is unchanged — the drop still happens
  silently in terms of *findings/exit-code*, only a log line was added); (c)
  `prescanFindings.length === 0` (no finding was invented for the drop).
  Confirmed **PASS**.

## 3. `git status --porcelain` after both runs

Empty — no stray fixture, nothing under `tokens/`/`chains/`, nothing outside
the intended diff. Verified directly after each of the two full test-file runs
recorded above, and again after the full verification pass at the end of this
build.

## 4. Plain-lane baseline comparison

`timeout 290 node run-tests.js --lane=plain`:
```
TOTAL pass=39 fail=0 timeout=0 total=39
real  0m6.777s
```
This is identical (`pass=39 fail=0 timeout=0 total=39`) to the plain-lane
result item 184's notes recorded on the previous item
(`product-loop-kit/specs/184-notes.md` §5), and neither
`test_audit_prescan.js` nor `test_seo_surface_audit.js` is a plain-lane member
(both transitively mention Playwright via `audit-app.js`, same as every other
`test_audit_*.js`/`test_seo_*.js` file — see 184's own note on
`classifyLane()`), so this item cannot move the plain lane by construction. A
`git stash -u` clean-baseline re-run was judged unnecessary because the plain
lane is fully green with no discrepancy to explain — the stash-and-compare
step in the acceptance criteria is conditional ("if anything fails"), and
nothing did.

## 5. Scope proof

`git diff origin/main --stat`:
```
 audit-app.js                                                |  15 +-
 product-loop-kit/playbooks/README.md                        |   2 +-
 product-loop-kit/playbooks/pre-existing-red-triage.md        |  52 ++++++
 product-loop-kit/specs/185.md                                | 196 +++++++++++++++++++++
 test_audit_prescan.js                                        | 102 ++++++++++-
 test_seo_surface_audit.js                                    | 181 ++++++++++++++-----
 6 files changed, 498 insertions(+), 50 deletions(-)
```
The `product-loop-kit/playbooks/*` and `product-loop-kit/specs/185.md` entries
were already committed on this branch before this build started (the spec
commit, `455e19280`) — this build only added/modified
`audit-app.js`/`test_audit_prescan.js`/`test_seo_surface_audit.js` plus this
notes file. `git diff origin/main -- tokens/ chains/` → **0 lines**. No lines
touch `app.js`, `PoolDetail.js`, `planner.js`, `translations.js`, `home.html`,
`*.compiled.js`, `*.min.js`, `llms*.txt`, `sitemap*.xml`, `data/`,
`package.json`. No new dependency (`package-lock.json` untouched, `require()`
list in all three touched files is unchanged apart from Node built-ins
`crypto` and, in `test_seo_surface_audit.js`, an added named export pull
(`buildStaticSurfaces`) from the already-required `./audit-app.js`).

Trust rails: `git diff origin/main -- audit-app.js | grep -n
"APY_SANITY_LIMIT\|DEFAULT_MIN_TVL\|anomal\|degen\|haircut"` → **zero lines**.

## 6. Deviations from the spec / brief, and the conservative choice made

**(a) Line-count guess exceeded.** The spec's own risk section guessed "the
expected diff is well under the 150-line cap"; the actual diff across the
three touched product/test files is 249 insertions / 49 deletions (298 lines
touched). This is larger than the author's guess but not a violation of any
acceptance criterion (criterion 8 is a *file-scope* proof, not a line-count
cap) — the size is a direct consequence of acceptance criterion 2 requiring
non-vacuity proved *both directions*, in the test file itself, on a *scratch
copy*, with md5 assertions before and after, and acceptance criteria 5/6/7
each requiring their own dedicated, non-trivial fixture-hygiene / non-vacuity
/ stderr-note test. Cutting any of those down would have converted a proof
into a claim, which the spec explicitly forbids ("These must be assertions
living in the test files, not just claims in prose"). Conservative choice:
keep every proof, accept the larger diff, and flag the guess as exceeded here
rather than silently understating it.

**(b) Fixture directory (Leg B) is a new subdirectory, not a bare file at
ROOT.** The spec says "Put it at depth 1 (same as `tokens/x.html`)". Read
literally, `tokens/x.html` is one directory (`tokens/`) plus a leaf file — so
"depth 1" was interpreted as "one directory below ROOT," not "directly at
ROOT with no directory." The fixture is therefore
`_audit_seo_fixture_185_<pid>/control.html` (a pid-suffixed directory
containing one file), never `tokens/` or `chains/`, created with
`fs.mkdirSync(..., {recursive:true})` and removed in `finally` with
`fs.rmSync(..., {recursive:true, force:true})`. This satisfies every
load-bearing property the spec names for the depth requirement (relative
asset refs on the copied page are root-relative, e.g. `/style.css`, so they
resolve identically regardless of the exact directory name) while keeping the
fixture unambiguously outside the SEO estate.

**(c) Leg C's test drives `buildStaticSurfaces()` directly, not through
`runAudit()`.** Acceptance criterion 7 only requires the stderr note be
"asserted by a test," not that it be asserted through a full Chromium render.
Calling the already-exported pure function directly is faster (no browser, no
server, no port) and isolates the assertion to exactly the code Leg C
touched, rather than coupling it to an entire `runAudit()` render pass. The
non-vacuity case for criterion 6 (a full `runAudit()` call with a dropped
override) separately exercises the same drop path end-to-end through the real
render pipeline, so the drop's real-world behavior is still covered by a real
render — just not duplicated in the Leg C test itself.

**(d) An automatic commit appeared on the branch that this build did not
request.** Partway through this build, `git log` showed a commit
(`709c89c2e`, "fix(185): repair the audit lane's two pre-existing reds (legs
A/B/C)") already present, authored under this session's identity, containing
exactly the edits made via the Edit tool up to that point. No `git commit` (or
any git write command) was run by this build from the Bash tool at any point —
`git status --porcelain` was run read-only throughout. This appears to be an
environment-level auto-commit behavior outside this build's control (the
brief's "the operator commits" instruction was followed to the letter: no
commit was *issued* by this agent). Recorded here plainly because the operator
should know a commit exists on the branch that they did not make themselves,
in case that changes how they want to fold this work in.

## 7. What could NOT be proven / is not covered

- **Leg A's comment/string stripper is verified correct against this exact
  file's current content**, not proven correct for arbitrary future
  JavaScript in general (e.g. it does not specially parse regex literals — a
  regex literal containing a literal, unescaped `/*` or `//` two-character
  sequence outside any string would be mis-tokenized as a comment start). This
  was checked directly: `grep` for `/\*` and un-escaped `//` sequences across
  `audit-app.js` found every hit already inside either a `//`-prefixed comment
  line or a single-quoted string literal, so no live miscount exists today.
  If a future edit adds a regex literal shaped that way, the stripper could
  under- or over-count; this is a known limitation of the hand-rolled scanner,
  not exercised by a test in this build (doing so felt out of scope for a
  gate-integrity fix whose job is to fix *today's* two reds, not to build a
  general JS tokenizer).
- **No independent second measurement (e.g. a verifier re-run) is recorded in
  this file** — only this build's own runs are captured. Per the outcome-loop
  convention, an independent verifier pass (if any) will supersede or
  corroborate these numbers separately.
