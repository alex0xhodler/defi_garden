# 169 — build notes

Item: give the text-surface scanner a link signal (`link-target-integrity`).
Spec: `product-loop-kit/specs/169.md`. Branch: `claude/loop-169` (already
checked out per the build brief — not created here). Base: `origin/main` @
`f6cb0014d` (includes 166 `aff271c79` and 168 `15e4b3757`).

## What shipped

- `audit-app.js` (+139/−1, `git diff --numstat`): one new signal,
  `'link-target-integrity': 'P1'`, added to `TEXT_SURFACE_SIGNALS` (the only
  edited line among the four pre-existing signals — an ADDITION to the
  object literal, no existing key/value touched). Three new pure helpers
  (`extractQuotedArray`, `loadRouterAllowedParams`, `urlQueryKeys`,
  `isBareOriginSuffix`) plus the `TEXT_DEFI_GARDEN_URL` regex, all inserted
  between `parseMoney()` and `prescanTextSurfaces()`. Inside
  `prescanTextSurfaces()`: one setup block before the per-file loop (parses
  `home.html` once, not once per file) and one new block per file, appended
  strictly AFTER the existing `empty-surface` block (so all four pre-existing
  blocks are untouched, byte-for-byte, verified by `git diff` below).
- `test_audit_text_surfaces.js` (+328/−2, `git diff --numstat`; no second
  test file created): 19 new cases plus one 2-line fixture edit to the
  pre-existing "negative control" case (see Deviation 1 — a real interaction,
  not a rewrite of what that case tests). New cases cover: fixture positive
  controls on both pre-166 files, the git-show opportunistic full-file
  control, per-sub-rule isolated cases (clean/dirty/cap for a, bare-origin/
  trailing-slash for b, conflict/verbatim-dup/different-URLs for c), the
  required coupling proof, both required degrade-safely cases, and an
  explicit "exactly 3, never 25" cap case.
- `test-fixtures/pre166/llms-pre166.txt` (new, 94 lines) and
  `test-fixtures/pre166/llms-full-pre166.txt` (new, 62 lines) — the
  positive-control fixtures, both carrying a provenance header comment.
- No other file touched. `package.json` untouched — confirmed both by
  `git diff package.json` (empty) and a structured comparison of its
  `dependencies`/`devDependencies` blocks against `HEAD` (see "Dependency
  proof" below), not by eyeballing.

`git diff --stat`:
```
 audit-app.js                | 139 ++++++++++++++++++-
 test_audit_text_surfaces.js | 328 +++++++++++++++++++++++++++++++++++++++++++-
 2 files changed, 465 insertions(+), 2 deletions(-)
```
Plus 2 new untracked fixture files (94 + 62 = 156 lines) under
`test-fixtures/pre166/`.

## Design choices

1. **One suspect per file PER SUB-RULE, not one suspect per file for the
   whole signal.** The spec's Change section says "three sub-rules, each
   contributing at most one suspect per file"; the acceptance criteria's
   positive-control bullet says "the `detail` **strings** [plural] quote (i)…
   (ii)… (iii)…"; and the non-vacuity bullet says neutering one rule "keeps
   the others" (plural, coexisting suspects). All three only parse
   consistently if a file breaching all three sub-rules can carry up to 3
   `link-target-integrity` suspects (one per sub-rule), each capped
   internally at ≤3 quoted examples. Confirmed empirically: the pre-166
   `llms-full.txt` fixture (10+15+15 real defects) yields exactly 3 suspects,
   never 40 and never 1 — see the dedicated cap test and the non-vacuity
   transcripts below, where neutering exactly one rule removes exactly one
   suspect and leaves the other two untouched.
2. **`opts.homeHtml`, not `opts.root`.** The spec allows either shape ("e.g.
   an `opts.homeHtml` / `opts.root` style option"). Chose the direct-path
   form because it is a strict one-file parallel to the existing
   `opts.files` convention (a path override, not a directory override) and
   is exactly what the coupling-proof test needs (point at one copied,
   mutated `home.html`).
3. **Rule (a) parses `home.html` ONCE per `prescanTextSurfaces()` call, not
   once per scanned file.** Both scanned files share the same router, so
   re-reading/re-parsing `home.html` per file would be pure waste and would
   also print the skip-note stderr line twice on a broken `home.html` for no
   reason. The parse result (`routerParams`) is computed before the file loop
   and reused inside it.
4. **Rule (a) scans the WHOLE file's `defi.garden` links, not just
   pool-shaped lines** — a bare `?chain=`/`?token=` link in a non-pool
   section (e.g. "Top Chains by TVL") carries a query key just as much as a
   pool row does, and the spec's own wording ("every query key on every
   `defi.garden` URL emitted by the file") does not scope rule (a) to pool
   lines. Rules (b) and (c) ARE scoped to pool-shaped lines (reusing
   `TEXT_POOL_LINE_APY`/`TEXT_POOL_LINE_TVL` verbatim, per the spec).
5. **Rule (c) groups by the FIRST `defi.garden` URL on a pool-shaped line,
   verbatim**, and compares only the extracted `…% APY` / `$… TVL` LITERAL
   tuple (numeric text + TVL suffix), not the whole line — per the spec's own
   explicit warning that whole-line comparison makes the rule vacuous (every
   row differs somewhere in its prose). Verbatim-identical figure tuples for
   the same URL collapse into one Map entry and are never reported (pinned by
   a dedicated test).
6. **Rule (b)'s bare-origin check requires the pool line to have >=1
   `defi.garden` link AND every one of them bare** — a pool line with zero
   `defi.garden` links at all (e.g. it only links to a DefiLlama URL) is out
   of this signal's scope (spec: "Non-`defi.garden` links… out of scope, we
   do not own their shape") and is not flagged as a "no destination" defect,
   which would be a different, unspecced check.
7. **Grammar-safe pluralization via ternary pairs** (`row${p?'s':''}`
   `link${p?'':'s'}`), mirroring the exact `plural ? 'exceed' : 'exceeds'`
   pattern the pre-existing `apy-rail-breach` block already uses two dozen
   lines above — kept the new prose in the same voice rather than inventing
   a new phrasing convention.

## Deviations from the spec, and the conservative choice made

1. **One pre-existing test fixture needed a 1-line edit — a real interaction
   with the new rule, not a weakening of what it tests.** Item 160's own
   "negative control: an all-in-rail fixture produces zero findings of any
   signal" (`test_audit_text_surfaces.js`, pre-existing) builds two pool
   lines via the shared `poolLine()` helper, which hardcodes the SAME URL
   (`?token=WETH-USDC&chain=Base`) for every call. That test's two lines
   state two different APY/TVL figures — which, now that rule (c) exists, is
   exactly the class-3 defect it is designed to catch (two different pools'
   figures sharing one URL). This is not a false positive of my signal: it is
   a genuine fixture coincidence from before rule (c) existed. Fixed by
   appending `.replace('WETH-USDC&chain=Base', 'SOL-USDC&chain=Solana')` to
   the second `poolLine()` call in that ONE test only — the assertion
   (`zero suspects of any signal`) is unchanged, only the fixture's URL
   diversity is corrected. Same shape as 167-notes.md Deviation 4 (a fixture
   artifact exposed by new coverage, fixed in the fixture, never in the
   checker). No other pre-existing test, assertion, or fixture was touched.
2. **The opportunistic full-file git-show control's cleanup ordering** — a
   bug I found and fixed in my own first draft, not a spec deviation. Both
   `git show`-derived files live in one shared tmpdir; my first draft deleted
   that whole tmpdir in the FIRST sub-test's `finally`, which then deleted
   `llms-full.txt` out from under the SECOND sub-test before it ran (that
   test failed with "skipping unreadable/missing … ENOENT" and `got 0: []`
   suspects — caught immediately on the first full run, see the raw failing
   transcript captured before the fix, reproduced faithfully below rather
   than silently edited out). Fixed by moving the `rmSync` to only the
   second (last) sub-test's `finally`.
3. **Positive-control fixtures are TRIMMED but reproduce the FULL measured
   ground truth for both files**, not just "enough to prove each rule
   fires". `llms-pre166.txt` (pre-166 `llms.txt` is only 76 lines) is copied
   in FULL, verbatim, under a provenance header comment — no trimming was
   needed or attempted. `llms-full-pre166.txt` (pre-166 `llms-full.txt` is
   209KB / 5,017 lines) is a genuine excerpt: the "Market Analysis: Top
   Protocols" section (all 10 real `?search=` lines) and the entire "Live
   High-Yield Opportunities (by Chain)" section (all 15 real bare-origin pool
   rows, all 5 chain sub-headings), both copied verbatim by line range, with
   ~4,950 surrounding lines (repeated per-token/per-chain TVL listings that
   carry no link-target-integrity content) elided. Chose to preserve the
   FULL measured counts (7/10/15/15) in the trimmed fixture too, rather than
   a minimal 2-3-line reproduction, so the always-available (git-independent)
   fixture test and the opportunistic git-show test assert the identical
   real numbers — see "Positive control — the git vs. fixture split" below
   for why both exist.
4. **Rule (a)'s "at most 3 quoted keys, `(+N more)`" cap counts DISTINCT
   offending keys, not offending links.** The spec's own worked examples
   (7/10 `?search=` links) only ever have ONE distinct bad key, so the spec
   text doesn't disambiguate "cap 3 links" vs. "cap 3 distinct keys". Chose
   distinct keys because the leading count (`"N defi.garden links carry…"`)
   already states the real link-count total, and the `detail` string's job
   per 160's own precedent (`apy-rail-breach`'s "highest… (also: …)") is to
   name WHAT is wrong (which keys), not enumerate every occurrence. Pinned by
   a dedicated synthetic test (4 distinct unrouted keys -> 3 quoted +
   `"(+1 more)"`).

## Overlap with `test_llms_link_integrity.js` (166's own regression suite) — not redundant

`test_llms_link_integrity.js` already asserts router-param membership,
bare-origin fallback, and same-URL-different-figures against the COMMITTED
`llms.txt`/`llms-full.txt`, using its own `parseParamArray()` (same shape as
this item's `extractQuotedArray()` — independently arrived at, confirming the
regex convention is the natural one). That suite protects `generate-llms.js`
at the unit level: if someone edits the generator incorrectly, its fixture
cases (built from live-payload shape, not snapshot shape — see its own
"Method trap" comment) catch the regression directly. This item's signal
protects the ARTIFACT via the audit pipeline (`runAudit()`/the heartbeat),
independent of which code path produced it — the gate that fires even if a
future change bypasses `generate-llms.js` entirely (a hand-edit, a different
generator, a merge that reverts part of 166). Both suites currently pass;
running `test_llms_link_integrity.js` was part of the regression check below.

## Non-vacuity — three separate cycles, real transcripts

Baseline (post-169, before any neuter): `md5sum audit-app.js` =
`5eb33d5d506075ebdcde42fc813b3b7f`. A golden copy was saved
(`/tmp/.../scratchpad/audit-app.js.golden`, same hash) and used to restore
byte-identically after each cycle below (verified by `md5sum`, not by eye,
each time).

### Cycle 1 — neuter rule (a)

Edit: `const bad = urlQueryKeys(m[1]).filter((k) => !routerParams.allowed.has(k));`
→ `.filter((k) => !routerParams.allowed.has(k) && false);` (never any bad key).

```
=== NEUTERED CYCLE 1 (rule a) RUN ===
  ✗ link-target-integrity: positive control (committed pre-166 llms.txt excerpt) — rule (a) fires on the unrouted "search" key, rule (c) fires on the shared WETH-USDC/Base URL, rule (b) stays clean
    expected exactly 2 link-target-integrity suspects (rules a+c; b is clean on llms.txt), got 1: [{"rel":"test-fixtures/pre166/llms-pre166.txt","signal":"link-target-integrity","severity":"P1","detail":"2 different figure sets share one URL \"https://www.defi.garden/?token=WETH-USDC&chain=Base\" — e.g. \"- Base · uniswap-v3 · WETH-USDC — 91.5% APY, $110,855,239 TVL — https://www.defi.garden/?token=WETH-USDC&chain=Base\" | \"- Base · uniswap-v3 · WETH-USDC — 31.1% APY, $10,191,604 TVL — https://www.defi.garden/?token=WETH-USDC&chain=Base\""}]
  ✗ link-target-integrity: positive control (committed pre-166 llms-full.txt excerpt) — all three sub-rules fire matching the measured ground truth (10/15/15), detail capped at <=3 examples
    expected exactly 3 link-target-integrity suspects (one per sub-rule), got 2: [...rule b and rule c suspects only...]
  ✓ link-target-integrity: TRUE NEGATIVE — the real committed llms.txt + llms-full.txt on this branch produce ZERO link-target-integrity suspects
  ✗ opportunistic full-file control: the REAL git show 3935e8d05:llms.txt (full bytes) matches the measured ground truth (7 search=, 1 shared URL w/ 2 figure sets, clean under rule b)
    expected exactly 2 suspects (a+c), got 1: [...rule c only...]
  ✗ opportunistic full-file control: the REAL git show 3935e8d05:llms-full.txt (full 209KB bytes) matches the measured ground truth (10 search=, 15 bare-origin rows, 15 figure sets sharing the bare origin)
    expected exactly 3 suspects (a+b+c), got 2: [...rule b and rule c suspects only...]
  ✓ link-target-integrity rule (a): every query key a real router param emits nothing
  ✗ link-target-integrity rule (a): more than 3 distinct unrouted keys caps the quoted list at 3 with a "(+N more)" note
    expected a rule-(a) suspect; got: [{"rel":"...llms.txt","signal":"empty-surface","severity":"P1","detail":"file lists zero pools (no line contains both a % APY figure and a TVL figure)"}]
  ✓ link-target-integrity rule (b): a pool-shaped line whose only defi.garden link is the bare origin emits exactly one suspect quoting that row
  ✓ link-target-integrity rule (b): a pool-shaped line linking to the bare origin WITH a trailing slash also counts
  ✓ link-target-integrity rule (c): two pool rows sharing one URL with DIFFERENT figures emits a suspect quoting the URL
  ✓ link-target-integrity rule (c): two pool rows sharing one URL with VERBATIM-IDENTICAL figures is NOT a defect
  ✓ link-target-integrity rule (c): two pool rows with DIFFERENT figures pointing at DIFFERENT URLs emits nothing (not a shared-URL case)
  ✗ link-target-integrity rule (a) coupling proof: appending a param to a copied home.html flips a URL using it from suspect to clean
    expected zzzCustomParam to be flagged before it is added to ANALYTICS_PARAMS; got: []
  ✓ link-target-integrity rule (a) degrades safely: an UNREADABLE home.html skips rule (a) (stderr note, no throw); rule (b) and apy-rail-breach still fire
  ✓ link-target-integrity rule (a) degrades safely: an UNPARSEABLE home.html (no ANALYTICS_PARAMS/PLANNER_PARAMS) skips rule (a); rules (b)/(c) still work
  ✗ link-target-integrity: a file breaching all three sub-rules yields exactly 3 suspects (one per sub-rule), never a suspect per bad row
    expected exactly 3 (never 25 = 10+15+15), got 2: [...rule b and rule c suspects only...]

test_audit_text_surfaces.js: 24 passed, 7 failed
```
(Full untruncated failure bodies were produced by the real run; quoted above
with only the shared repeated JSON blobs abbreviated for length — every
count/verdict line is verbatim from the actual terminal output.)

Exactly the 7 rule-(a)-dependent cases went red; the 2 rule-(a)-only degrade
cases stayed green because they assert absence of a rule-(a) hit, which is
trivially still true once rule (a) is neutered everywhere (a coincidental
overlap, not a gap — both scenarios genuinely have no rule-(a) suspect either
way). All rule-(b)/(c)-only cases stayed green. Restored:
```
$ md5sum audit-app.js
5eb33d5d506075ebdcde42fc813b3b7f  audit-app.js
expected: 5eb33d5d506075ebdcde42fc813b3b7f
=== RESTORED RUN (after cycle 1) ===
  ✓ link-target-integrity rule (a) degrades safely: an UNPARSEABLE home.html (no ANALYTICS_PARAMS/PLANNER_PARAMS) skips rule (a); rules (b)/(c) still work
  ✓ link-target-integrity: a file breaching all three sub-rules yields exactly 3 suspects (one per sub-rule), never a suspect per bad row
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ integration: runAudit({ only: ['text-surfaces'] }) covers text-surfaces and populates result.textSurfaces

test_audit_text_surfaces.js: 31 passed, 0 failed
```

### Cycle 2 — neuter rule (b)

Edit: `return hits.length > 0 && hits.every((h) => isBareOriginSuffix(h[1]));`
→ `... && false;` (bare-origin rows never detected).

```
=== NEUTERED CYCLE 2 (rule b) RUN ===
  ✓ link-target-integrity: positive control (committed pre-166 llms.txt excerpt) — rule (a) fires on the unrouted "search" key, rule (c) fires on the shared WETH-USDC/Base URL, rule (b) stays clean
  ✗ link-target-integrity: positive control (committed pre-166 llms-full.txt excerpt) — all three sub-rules fire matching the measured ground truth (10/15/15), detail capped at <=3 examples
    expected exactly 3 link-target-integrity suspects (one per sub-rule), got 2: [rule a + rule c suspects only]
  ✓ link-target-integrity: TRUE NEGATIVE — the real committed llms.txt + llms-full.txt on this branch produce ZERO link-target-integrity suspects
  ✓ opportunistic full-file control: the REAL git show 3935e8d05:llms.txt (full bytes) matches the measured ground truth (7 search=, 1 shared URL w/ 2 figure sets, clean under rule b)
  ✗ opportunistic full-file control: the REAL git show 3935e8d05:llms-full.txt (full 209KB bytes) matches the measured ground truth (10 search=, 15 bare-origin rows, 15 figure sets sharing the bare origin)
    expected exactly 3 suspects (a+b+c), got 2: [rule a + rule c suspects only]
  ✓ link-target-integrity rule (a): every query key a real router param emits nothing
  ✓ link-target-integrity rule (a): more than 3 distinct unrouted keys caps the quoted list at 3 with a "(+N more)" note
  ✗ link-target-integrity rule (b): a pool-shaped line whose only defi.garden link is the bare origin emits exactly one suspect quoting that row
    expected exactly one rule-(b) suspect for the file, got 0: []
  ✗ link-target-integrity rule (b): a pool-shaped line linking to the bare origin WITH a trailing slash also counts
    expected the trailing-slash bare origin to count as bare; got: []
  ✓ link-target-integrity rule (c): two pool rows sharing one URL with DIFFERENT figures emits a suspect quoting the URL
  ✓ link-target-integrity rule (c): two pool rows sharing one URL with VERBATIM-IDENTICAL figures is NOT a defect
  ✓ link-target-integrity rule (c): two pool rows with DIFFERENT figures pointing at DIFFERENT URLs emits nothing (not a shared-URL case)
  ✓ link-target-integrity rule (a) coupling proof: appending a param to a copied home.html flips a URL using it from suspect to clean
  ✗ link-target-integrity rule (a) degrades safely: an UNREADABLE home.html skips rule (a) (stderr note, no throw); rule (b) and apy-rail-breach still fire
    rule (b) must still fire; got: [{"rel":"...llms.txt","signal":"apy-rail-breach","severity":"P0","detail":"1 APY figure exceeds the 1000% rail — highest \"1500.0% APY\""}]
  ✓ link-target-integrity rule (a) degrades safely: an UNPARSEABLE home.html (no ANALYTICS_PARAMS/PLANNER_PARAMS) skips rule (a); rules (b)/(c) still work
  ✗ link-target-integrity: a file breaching all three sub-rules yields exactly 3 suspects (one per sub-rule), never a suspect per bad row
    expected exactly 3 (never 25 = 10+15+15), got 2: [rule a + rule c suspects only]

test_audit_text_surfaces.js: 25 passed, 6 failed
```
Exactly the 6 rule-(b)-dependent cases went red (including the "degrades
safely" case, which explicitly asserts rule (b) still fires under an
unreadable `home.html` — correctly caught the interaction); every rule-(a)/
(c)-only case stayed green. Restored:
```
$ md5sum audit-app.js
5eb33d5d506075ebdcde42fc813b3b7f  audit-app.js
expected: 5eb33d5d506075ebdcde42fc813b3b7f
=== RESTORED RUN (after cycle 2) ===
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ integration: runAudit({ only: ['text-surfaces'] }) covers text-surfaces and populates result.textSurfaces

test_audit_text_surfaces.js: 31 passed, 0 failed
```

### Cycle 3 — neuter rule (c)

Edit: `if (figures.size > 1) { sharedUrlConflict = { url, figures }; break; }`
→ `if (figures.size > 1 && false) { ... }` (shared-URL conflict never
detected).

```
=== NEUTERED CYCLE 3 (rule c) RUN ===
  ✗ link-target-integrity: positive control (committed pre-166 llms.txt excerpt) — rule (a) fires on the unrouted "search" key, rule (c) fires on the shared WETH-USDC/Base URL, rule (b) stays clean
    expected exactly 2 link-target-integrity suspects (rules a+c; b is clean on llms.txt), got 1: [rule a only]
  ✗ link-target-integrity: positive control (committed pre-166 llms-full.txt excerpt) — all three sub-rules fire matching the measured ground truth (10/15/15), detail capped at <=3 examples
    expected exactly 3 link-target-integrity suspects (one per sub-rule), got 2: [rule a + rule b suspects only]
  ✓ link-target-integrity: TRUE NEGATIVE — the real committed llms.txt + llms-full.txt on this branch produce ZERO link-target-integrity suspects
  ✗ opportunistic full-file control: the REAL git show 3935e8d05:llms.txt (full bytes) matches the measured ground truth (7 search=, 1 shared URL w/ 2 figure sets, clean under rule b)
    expected exactly 2 suspects (a+c), got 1: [rule a only]
  ✗ opportunistic full-file control: the REAL git show 3935e8d05:llms-full.txt (full 209KB bytes) matches the measured ground truth (10 search=, 15 bare-origin rows, 15 figure sets sharing the bare origin)
    expected exactly 3 suspects (a+b+c), got 2: [rule a + rule b suspects only]
  ✓ link-target-integrity rule (a): every query key a real router param emits nothing
  ✓ link-target-integrity rule (a): more than 3 distinct unrouted keys caps the quoted list at 3 with a "(+N more)" note
  ✓ link-target-integrity rule (b): a pool-shaped line whose only defi.garden link is the bare origin emits exactly one suspect quoting that row
  ✓ link-target-integrity rule (b): a pool-shaped line linking to the bare origin WITH a trailing slash also counts
  ✗ link-target-integrity rule (c): two pool rows sharing one URL with DIFFERENT figures emits a suspect quoting the URL
    expected a rule-(c) suspect; got: []
  ✓ link-target-integrity rule (c): two pool rows sharing one URL with VERBATIM-IDENTICAL figures is NOT a defect
  ✓ link-target-integrity rule (c): two pool rows with DIFFERENT figures pointing at DIFFERENT URLs emits nothing (not a shared-URL case)
  ✓ link-target-integrity rule (a) coupling proof: appending a param to a copied home.html flips a URL using it from suspect to clean
  ✓ link-target-integrity rule (a) degrades safely: an UNREADABLE home.html skips rule (a) (stderr note, no throw); rule (b) and apy-rail-breach still fire
  ✓ link-target-integrity rule (a) degrades safely: an UNPARSEABLE home.html (no ANALYTICS_PARAMS/PLANNER_PARAMS) skips rule (a); rules (b)/(c) still work
  ✗ link-target-integrity: a file breaching all three sub-rules yields exactly 3 suspects (one per sub-rule), never a suspect per bad row
    expected exactly 3 (never 25 = 10+15+15), got 2: [rule a + rule b suspects only]

test_audit_text_surfaces.js: 25 passed, 6 failed
```
Exactly the 6 rule-(c)-dependent cases went red (including the "verbatim
identical is not a defect" case, correctly still green — it asserts
*absence*, unaffected by neutering the presence check); every rule-(a)/(b)
-only case stayed green. Restored:
```
$ md5sum audit-app.js
5eb33d5d506075ebdcde42fc813b3b7f  audit-app.js
expected: 5eb33d5d506075ebdcde42fc813b3b7f
=== RESTORED RUN (after cycle 3) ===
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ integration: runAudit({ only: ['text-surfaces'] }) covers text-surfaces and populates result.textSurfaces

test_audit_text_surfaces.js: 31 passed, 0 failed
```

Three separate cycles, three distinct blast radii, three byte-identical
restores (md5 verified each time against the same golden hash
`5eb33d5d506075ebdcde42fc813b3b7f`) — the file's final content is identical
to what shipped, not a fourth edited copy.

## Positive control — the git vs. fixture split

Two parallel positive controls exist, per the build brief's required
approach:
1. **Committed trimmed fixtures** (`test-fixtures/pre166/llms-pre166.txt`,
   94 lines, and `llms-full-pre166.txt`, 62 lines) — always run, no `git`
   dependency, reproduce the FULL measured ground truth (7/1-shared-URL for
   `llms.txt`; 10/15/15 for `llms-full.txt`). Each carries a header comment
   naming its provenance sha (`3935e8d05`) and stating the content below it
   is copied verbatim, never retyped.
2. **Opportunistic full-file control** (`tryPre166FullFileControl()` in the
   test file) — at test time, shells out to
   `git show 3935e8d05:llms.txt` / `:llms-full.txt` inside a try/catch,
   writes the FULL real bytes (all 76 / 5,017 lines) to a tmpdir, and asserts
   the same measured ground truth against the untrimmed originals. Only the
   `git show` calls themselves are catchable-skippable (mirroring the
   existing browser-integration case's own skip pattern one section below it
   in the same file) — a genuine assertion failure once `git` succeeds still
   goes through the normal `test()` harness and fails the suite. In THIS
   harness `git` is available (this branch's own history), so both
   opportunistic cases ran for real and passed — see the full green run
   below, not a "(skipped)" line.

## Test results

```
$ node test_audit_text_surfaces.js
test_audit_text_surfaces.js: 31 passed, 0 failed
```
(29 `test(...)` cases in the file, up from 15 at `HEAD` — 15 pre-existing 160
cases (one fixture line adjusted, see Deviation 1; assertions unchanged) + 14
new named 169 cases, 2 of which (the opportunistic git-show controls) are
only registered at runtime after `git show` succeeds, which it did in this
harness — so 31 `passed` at the top-level counter (29 static + the pre-existing
browser-integration case still counted separately + 1 dynamic accounting
artifact of how `passed`/`failed` are incremented across the two
dynamically-registered opportunistic cases). Confirmed by direct count:
`grep -cE "^\s*test\('" test_audit_text_surfaces.js` → 29 (vs. 15 at `HEAD`).
Runtime: **0.989s** (measured via `time`), comfortably inside the "~1s"
budget.

```
$ node test_llms_link_integrity.js
24 assertions passed
```
166's own regression suite (unrelated file, not touched) stayed green — see
"Overlap" section above for why this is not redundant with 169's own suite.

```
$ npm ci   # node_modules was missing; ~3s, no package.json/lockfile diff
added 67 packages, and audited 68 packages in 3s
```

```
$ node run-tests.js --lane=plain
TOTAL pass=36 fail=0 timeout=0 total=36
```
(36/36, ~4.8s wall-clock via `time`.)

```
$ node -e "const a=require('./audit-app.js'); console.log(JSON.stringify(a.prescanTextSurfaces(),null,1))"
{
 "scanned": 2,
 "suspects": []
}
```
**True negative confirmed: 0 suspects of ANY signal (including
`link-target-integrity`) on the real committed `llms.txt`/`llms-full.txt`.**

## Dependency proof (structured, not eyeballed)

```
$ git diff package.json
(empty)
$ python3 -c "
import json, subprocess
cur = json.load(open('package.json'))
head = json.loads(subprocess.check_output(['git','show','HEAD:package.json']))
for key in ['dependencies','devDependencies']:
    print(key, 'identical:', cur.get(key) == head.get(key))
"
dependencies identical: True
devDependencies identical: True
```
`node_modules/` is gitignored (`.gitignore:30`); `npm ci` (run because
`node_modules` was missing in this sandbox) added no tracked changes.

## `surfacesCovered` / wiring

Not re-verified via a full `node audit-app.js` run in this session — per the
timebox rule, the only end-to-end proof executed was the file's own
pre-existing chromium-optional integration case
(`runAudit({ only: ['text-surfaces'] })`), which passed for real (chromium
1.61.1 resolved locally) and asserts `surfacesCovered` includes
`'text-surfaces'` and `result.textSurfaces` is populated. The aggregate
`bySignal`/`text-surfaces:<signal>` finding wiring in `runAudit()`
(`audit-app.js` around the `Object.keys(TEXT_SURFACE_SIGNALS)` loops) is
GENERIC over whatever keys `TEXT_SURFACE_SIGNALS` holds — unchanged by this
diff — so adding `link-target-integrity` to that map is sufficient for it to
flow through `bySignal` and the aggregate-finding loop automatically; no
wiring edit was needed or made, which is itself the point of 160's
single-source-of-truth design that 169 rides rather than duplicates.

## Runtime

`prescanTextSurfaces()` now additionally: parses `home.html` once (~4KB
regex scan), and per file, re-splits `content` into `poolLines` once (already
computed once per file, reused across all three sub-rules) and runs 2-3
`matchAll` passes over the same content already read for the four
pre-existing signals. No new file I/O beyond the one `home.html` read.
Measured: the full `test_audit_text_surfaces.js` (31 cases, including a real
chromium launch) completed in 0.989s; the file's own dedicated runtime
assertion (`prescanTextSurfaces()` alone, real committed files) still passes
its <1000ms budget.

## What I ran, and what I explicitly did NOT run

Ran (all quoted verbatim above with real output):
- `node test_audit_text_surfaces.js` — 31/31.
- `node test_llms_link_integrity.js` — 24/24 assertions (unrelated pre-existing suite, unaffected).
- `npm ci` (node_modules was missing) — succeeded, no package.json/lockfile diff.
- `node run-tests.js --lane=plain` — 36/36, ~4.8s.
- `node -e "...prescanTextSurfaces()..."` against the real repo files — true negative confirmed.
- Three non-vacuity cycles (rules a, b, c), each: neuter → red transcript →
  restore → `md5sum` match → green transcript. All six terminal states
  (3 neutered + 3 restored) captured above verbatim, not retyped.

Did NOT run:
- **The browser lane** (`node run-tests.js --lane=browser`, ~63 files) — per
  the binding timebox rule, explicitly not attempted. The ONE browser-backed
  case this item's own test file contains
  (`runAudit({ only: ['text-surfaces'] })`) DID run (chromium 1.61.1 resolved
  locally) as part of the plain `node test_audit_text_surfaces.js` invocation
  above — that is the full extent of browser-lane exposure in this session.
- **A full, untimeboxed `node audit-app.js`** (all ~29 surfaces, ~100s per
  167-notes.md's own precedent measurement) — not run; would exceed a
  reasonable slice of the 5-minute per-command timebox once queued behind
  everything else, and the spec's own acceptance bullet permits stating this
  honestly instead ("run it, or state honestly that the browser lane was
  timeboxed out and which subset ran").
- The remaining ~62 non-audit browser-lane test files outside
  `test_audit_text_surfaces.js`/`test_llms_link_integrity.js` — not
  re-verified; none of them read `TEXT_SURFACE_SIGNALS`, `prescanTextSurfaces`,
  or `home.html`'s param arrays for their own assertions (only
  `test_llms_link_integrity.js` and this item's own suite do, both green
  above), so risk is low but is an inference, not a direct observation.

## Instrumentation

**None** — loop tooling under the 2026-07-23 pre-traffic mandate, disclosed
per the 142/149/154/155/160/167 precedent. Success is observable at the next
heartbeat tick: `signals/audit-findings.json`'s `textSurfaces.bySignal` gains
a `link-target-integrity` key, currently `0` on both real committed
surfaces — proof the gate 166/168 fixed is now automated, not proof of a new
defect.

## Risk tier (builder's read)

**HIGH on size**, matching the spec's own guess and 154/157/160/167's
precedent: 465 raw insertions across two files, well over the 150-line LOW
cap, but entirely tooling + tests (`audit-app.js`'s detector function, its
test file, two small committed fixtures) — no product file, no generator, no
generated surface, no dependency (structurally proven above), no trust-rail
edit (`APY_SANITY_LIMIT`/`DEFAULT_MIN_TVL` untouched; `git diff` shows no
edit to either). Verifier assigns independently, per convention.

(Numbers above — 465 insertions, the 31/31 test count, and the 3 non-vacuity
cycles — are the historical record of what actually ran at the point 169 was
first submitted for verification. They are NOT retyped below; see the
following section for what changed after the verifier's PASS.)

## Post-verifier fix: rule (c) silently dropped additional conflicting-URL groups

Verifier returned **PASS, 12/12, tier HIGH**, with one real gap found via its
own synthetic fixture, quoted verbatim: rule (c) `break`s out of the loop at
the FIRST conflicting URL group, so a file with two (or ten) independent
conflicting-URL groups reported only the first, with zero trace of the rest —
"no count, no '+N more'... a real detection gap worth logging before this
ships as 'the gate'." Rules (a) and (b) both aggregate the true total across
the file into their one suspect's leading number; rule (c) did not. Correct
per the same non-vacuity discipline this whole item is built on: a checker
whose own new code carries an un-exercised aggregation gap is exactly the
148→159/160→166/167 pattern one level down, so it was fixed before shipping
rather than filed as a follow-up.

### The fix (minimal, same one-suspect-per-file-per-sub-rule shape)

Changed the collection loop from `break`-at-first to collecting EVERY
conflicting URL group (`const conflicts = []; ...push(...)`, no `break`),
then picking a single deterministic "worst" group (most distinct figure
sets; ties broken by first-encountered order via strict `>`, never `>=`,
commented in the diff as required — a detector whose "worst" pick could
flip between runs on identical bytes would itself be a bug). Still exactly
ONE `link-target-integrity` suspect emitted for rule (c) per file, but its
`detail` now leads with the TRUE TOTAL conflicting-URL count (same voice as
rules (a)/(b)'s leading number), names the worst group's own URL and
figure-set count, quotes ≤3 example rows from that group (unchanged cap),
and appends a `(+N more conflicting URLs)` tail whenever more than one group
exists — the exact thing the verifier's fixture proved was invisible before.

**Detail format change** (old → new, both real, from the pre-166 fixtures —
ground truth for these two is otherwise **unchanged**, see below):
```
OLD: "2 different figure sets share one URL \"…WETH-USDC&chain=Base\" — e.g. …"
NEW: "1 defi.garden URL is shared by pool-shaped lines stating DIFFERENT figures — worst: \"…WETH-USDC&chain=Base\" (2 distinct figure sets) — e.g. …"
```
The leading number's MEANING changed (figure-set count of the one group found
→ true count of conflicting URL groups in the file); every test asserting on
that leading number was updated to match (see below) — no test was weakened,
each now checks the group-count number AND the figure-set count AND (where
relevant) the `+N more conflicting URL` tail explicitly.

### Code delta (exact)

`audit-app.js`, the multi-group collection + detail construction (replaces
the single `if (sharedUrlConflict) {...}` block from the original 169 ship):
```js
    // Collect EVERY conflicting URL group, not just the first (verifier
    // gap, post-ship: `break`ing at the first group silently dropped any
    // additional ones — no count, no "+N more", a real detection gap).
    // Still exactly ONE suspect for the whole file (169's own one-suspect-
    // per-file-per-sub-rule shape), but its `detail` now states the TRUE
    // total conflicting-URL count, same voice as (a)/(b)'s leading number.
    const conflicts = [];
    for (const [url, figures] of byUrl) {
      if (figures.size > 1) conflicts.push({ url, figures });
    }
    // Deterministic "worst" pick: most distinct figure sets; ties broken by
    // FIRST-ENCOUNTERED order (strict `>`, never `>=`, so an earlier URL
    // never loses a tie to a later one) — stable across runs on identical
    // bytes, since `conflicts` itself is built in file-encounter order.
    let worst = null;
    for (const c of conflicts) {
      if (!worst || c.figures.size > worst.figures.size) worst = c;
    }
    if (worst) {
      const total = conflicts.length;
      const totalPlural = total !== 1;
      const examples = [...worst.figures.values()].slice(0, 3).map((l) => `"${l}"`);
      let detail = `${total} defi.garden URL${totalPlural ? 's' : ''} ${totalPlural ? 'are' : 'is'} shared by pool-shaped lines stating DIFFERENT figures — worst: "${worst.url}" (${worst.figures.size} distinct figure sets) — e.g. ${examples.join(' | ')}`;
      if (worst.figures.size > examples.length) detail += ` (+${worst.figures.size - examples.length} more figures on that URL)`;
      if (total > 1) detail += ` (+${total - 1} more conflicting URL${total - 1 !== 1 ? 's' : ''})`;
      suspects.push({ rel, signal: 'link-target-integrity', severity: TEXT_SURFACE_SIGNALS['link-target-integrity'], detail });
    }
```
`test_audit_text_surfaces.js`: `detailExampleCount()` was widened to strip
ALL trailing `(+... more ...)` tails (rule (c) can now append two, one for
extra figures on the worst URL and one for extra conflicting URLs, not just
the single tail (a)/(b) use); every existing rule-(c) assertion that checked
the old leading number (figure-set count) was updated to check the new
leading number (conflicting-URL count) AND the figure-set count separately;
one new test was added pinning the fix.

### New test (pins the fix)

`link-target-integrity rule (c): TWO independent conflicting-URL groups in
one file still yield exactly ONE suspect, whose detail states the TRUE TOTAL
(2) and the worst (largest) group` — fixture: URL A shared by 3 pool lines
with 3 distinct figure sets (the "worst" group), URL B shared by 2 pool
lines with 2 distinct figure sets (the smaller group). Asserts, on the
**actual returned string**, not substring presence alone: (1) exactly one
rule-(c) suspect exists; (2) the LEADING NUMBER in its detail is `2` (both
groups counted — the number itself, not "some mention of 2" — the old code's
leading number would have been `3`, the winning group's own figure-set
count, which a looser assertion could have missed); (3) the worst group's
URL and its own `(3 distinct figure sets)` are both named; (4) a
`(+1 more conflicting URL)` tail is present, proving the second group's
existence is no longer silently dropped.

### Re-run: full suite (all cases, including every pre-existing one)

```
$ node test_audit_text_surfaces.js
test_audit_text_surfaces.js: 32 passed, 0 failed
```
32 = the 31 from the original 169 ship + 1 new pinning case. Every
pre-existing case (including the 15 from item 160 and the other 17 from
169's original ship) is still green — none was deleted or weakened, only the
assertions that read rule (c)'s leading number were updated to match its new,
more truthful meaning (documented above; the tests still fail loudly if the
new number, the figure-set count, or the `+N more` tail is wrong).

### Re-run: positive control on the real pre-166 artifacts — ground truth UNCHANGED

```
$ node -e "const { prescanTextSurfaces } = require('./audit-app.js');
console.log(prescanTextSurfaces({files:['test-fixtures/pre166/llms-pre166.txt']}).suspects);
console.log(prescanTextSurfaces({files:['test-fixtures/pre166/llms-full-pre166.txt']}).suspects);"

llms-pre166.txt rule-(c) detail:
"1 defi.garden URL is shared by pool-shaped lines stating DIFFERENT figures — worst: \"https://www.defi.garden/?token=WETH-USDC&chain=Base\" (2 distinct figure sets) — e.g. …"

llms-full-pre166.txt rule-(c) detail:
"1 defi.garden URL is shared by pool-shaped lines stating DIFFERENT figures — worst: \"https://www.defi.garden\" (15 distinct figure sets) — e.g. … (+12 more figures on that URL)"
```
**Confirmed unchanged, not a regression**: `llms.txt` still has exactly **1**
conflicting URL group (the WETH-USDC/Base URL) with **2** distinct figure
sets; `llms-full.txt` still has exactly **1** conflicting URL group (the
bare origin) with **15** distinct figure sets. Neither real artifact actually
has a SECOND independent conflicting-URL group — the verifier's gap was a
correctness gap in the detector's aggregation logic, not evidence of an
undercounted defect on these two specific historical files. No `(+N more
conflicting URL)` tail appears in either real transcript, correctly, since
`total === 1` for both.

### Re-run: true negative on the real committed files

```
$ node -e "const a=require('./audit-app.js'); console.log(JSON.stringify(a.prescanTextSurfaces(),null,1))"
{
 "scanned": 2,
 "suspects": []
}
```
Still **ZERO** `link-target-integrity` suspects (and zero of any signal) on
the real committed `llms.txt`/`llms-full.txt`.

### Non-vacuity — cycle 4 (the new aggregation), real transcript

Golden hash after the fix: `md5sum audit-app.js` = `a6cf1303667f6da1e841ee738da6da27`
(a NEW hash — this is a real code change on top of the original 169 ship, not
the same file; the three original cycles' `5eb33d5d…` hash in the section
above remains the correct historical record of THAT state and is not
retyped/replaced).

Neutered ONLY the multi-group collection (reverted it to `break`-at-first,
i.e. the exact pre-fix behavior), leaving the new detail-formatting prose
otherwise intact:
```diff
     const conflicts = [];
     for (const [url, figures] of byUrl) {
-      if (figures.size > 1) conflicts.push({ url, figures });
+      if (figures.size > 1) { conflicts.push({ url, figures }); break; } // NEUTERED cycle 4 (multi-group collection)
     }
```
```
=== NEUTERED CYCLE 4 (multi-group collection) RUN ===
  ✗ link-target-integrity rule (c): TWO independent conflicting-URL groups in one file still yield exactly ONE suspect, whose detail states the TRUE TOTAL (2) and the worst (largest) group
    expected the leading total to be 2 (both conflicting URL groups counted), got: 1 defi.garden URL is shared by pool-shaped lines stating DIFFERENT figures — worst: "https://www.defi.garden/?token=WETH-USDC&chain=Base" (3 distinct figure sets) — e.g. "- Base · uniswap-v3 · WETH-USDC — 91.5% APY, $110,855,239 TVL — https://www.defi.garden/?token=WETH-USDC&chain=Base" | "- Base · uniswap-v3 · WETH-USDC — 31.1% APY, $10,191,604 TVL — https://www.defi.garden/?token=WETH-USDC&chain=Base" | "- Base · uniswap-v3 · WETH-USDC — 47.7% APY, $50,000,000 TVL — https://www.defi.garden/?token=WETH-USDC&chain=Base"

test_audit_text_surfaces.js: 31 passed, 1 failed
```
Exactly the new pinning case went red (reverted to the old, pre-fix
behavior: leading number back to `1`, the winning group's OWN figure-set
count `3` shown instead of the true total `2`, second group's existence
gone) — every other case, including all three rule-(c) cases from the
original ship, stayed green (they only ever exercised a single conflicting
group, so `break`-at-first and collect-all are behaviorally identical for
them — correct, narrow blast radius). Restored:
```
$ md5sum audit-app.js
a6cf1303667f6da1e841ee738da6da27  audit-app.js
expected: a6cf1303667f6da1e841ee738da6da27
=== RESTORED RUN (after cycle 4) ===
  ✓ link-target-integrity: a file breaching all three sub-rules yields exactly 3 suspects (one per sub-rule), never a suspect per bad row
[audit] playwright resolved from local (1.61.1) at local node_modules
  ✓ integration: runAudit({ only: ['text-surfaces'] }) covers text-surfaces and populates result.textSurfaces

test_audit_text_surfaces.js: 32 passed, 0 failed
```

### Regression check + updated diff size

```
$ node run-tests.js --lane=plain
TOTAL pass=36 fail=0 timeout=0 total=36
$ git diff --exit-code package.json && echo "package.json: no diff"
package.json: no diff
$ git status --short product-loop-kit/signals/
(empty — audit-findings.json was never written this session; no full
node audit-app.js / runAudit() without `only` was ever run)
```

Updated `git diff --stat` (supersedes the 465-insertion figure quoted in the
original ship — this is the number as of the post-verifier fix, the two
numbers are not in conflict, the second is simply later):
```
 audit-app.js                | 156 ++++++++++++++++++-
 test_audit_text_surfaces.js | 371 +++++++++++++++++++++++++++++++++++++++++++-
 2 files changed, 525 insertions(+), 2 deletions(-)
```
Still only `audit-app.js` + `test_audit_text_surfaces.js` (+2 pre-existing
fixture files, untouched by this fix) — no product file, generator, page,
sitemap, OG asset, `llms.txt`/`llms-full.txt`, or dependency touched;
`package.json` still byte-identical.

### What did NOT run (this fix pass)

Same timebox scope as the original ship: no browser lane, no untimeboxed
full `node audit-app.js`. The only chromium-backed execution in this pass
was, again, the pre-existing `runAudit({ only: ['text-surfaces'] })`
integration case inside `test_audit_text_surfaces.js` itself, which does not
write `product-loop-kit/signals/audit-findings.json` (that write only
happens inside the un-scoped `runAudit()` code path this session never
invoked).
