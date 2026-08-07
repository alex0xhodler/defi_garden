# 186 — build notes (deviations, conservative choices, and why)

Item: teach `stripJsCommentsAndStrings()` (`test_audit_prescan.js`) regex-literal
state, so A6b's real-call-site counter for `reconcilePrescanFindings(` can no
longer be silently defeated by a regex literal shaped `/[/*]/` (swallows to
EOF) or by a `"` inside a regex character class (LIVE at
`audit-app.js:324/771/811` before this fix — read as a string opener, eating
real code). Plus a tail-survival invariant (Leg B) that makes any future
whole-file swallow loud. Branch: `claude/loop-186`. Built 2026-07-30.

Only `test_audit_prescan.js` was edited. `audit-app.js` and every other
product file are untouched.

---

## 1. Before/after test output, verbatim

**Before** (this build's own repro, clean `origin/main` `c46ed5164`, i.e. this
branch's own starting state — 185's post-fix scanner, pre-186): running
`node test_audit_prescan.js` at that commit passes all existing cases at
43 passed, 0 failed (185's own number); the bug is *dormant-turned-live* per
`specs/186.md`'s Evidence, not a visible red — it does not fail any existing
assertion, it silently undercounts on a mutation. Demonstrated instead via the
non-vacuity tests below.

**After** (this build, full run, verbatim tail):
```
  ✓ criterion 1: scanned >= 2000 and junk-slug suspects exactly match the on-disk junk predicate
  ✓ criterion 2: digit-leading real tickers (0x0, 1inch, 3crv, a0t) appear in NO suspect list
  ✓ criterion 3: promotion, REAL render — probe page covered + rendered junk-slug P1 finding
  ✓ criterion 4: non-vacuity — identical config with prescan:false does NOT cover the probe slug
  ✓ criterion 5: aggregate static-prescan:junk-slug count matches the independently re-derived on-disk count; clean signals emit nothing
  ✓ criterion 6: determinism — same seed gives identical prescan.promoted + surfacesCovered; a different seed (suspects<=cap) promotes the same SET
  ✓ criterion 7: budget unchanged — default-config (prescanMax=4, sampleSize=6) static surfaces stay within anchor + sampleSize
  ✓ A6a (spec 171, non-vacuity): reconcilePrescanFindings has no built-in text-surface exemption — ...
  ✓ A6b (spec 171): runAudit() never passes textSurfaceFindings to reconcilePrescanFindings — only prescanFindings (prefix static-prescan) and poolPrescanFindings (prefix pool-prescan)
  ✓ A6b non-vacuity (spec 185, direction a): a scratch COPY of audit-app.js gaining a GENUINE third call site trips the real-call-site count (3 -> 4)
  ✓ A6b non-vacuity (spec 185, direction b): a scratch COPY gaining only a COMMENT mentioning reconcilePrescanFindings( does NOT trip the count (stays 3)
  ✓ A6b regex-literal non-vacuity (backlog 186, shape a): a scratch COPY carrying a regex character class containing a literal '/*' ( const RE_186 = /[/*]/; ) plus a genuine appended call site counts 4 under the FIXED scanner — and the frozen pre-fix legacyStrip stays silently green at 3, proving the regression this item exists to prevent
  ✓ A6b regex-literal non-vacuity (backlog 186, shape b — the LIVE audit-app.js:324/771/811 shape): a scratch COPY carrying a regex character class containing a `"` plus a genuine appended call site counts 4 under the FIXED scanner, and 3 under legacyStrip
  ✓ backlog 186 criterion 5 — division is not mistaken for a regex: synthetic `a / b`, `a /= b`, `(x + y) / 2` leave a division on the near side untouched, and a real call site on the FAR side of a division stays counted
  ✓ backlog 186 Leg B — tail-survival invariant: the real audit-app.js's own final-line marker is present in the raw source AND survives the FIXED stripper
  ✓ backlog 186 Leg B non-vacuity: on the /[/*]/  -mutated scratch copy, the frozen pre-fix legacyStrip DROPS the tail marker; the FIXED stripper KEEPS it
  ✓ link-target-integrity: TRUE NEGATIVE — the real committed tokens/*.html + chains/*.html pages produce ZERO link-target-integrity suspects
  ... (all 172/175 link-target-integrity cases unchanged and green, as before) ...

test_audit_prescan.js: 48 passed, 0 failed
```
Full run: `timeout 290 node test_audit_prescan.js` → **48 passed, 0 failed**
(43 pre-186 + 5 new `test()` cases: shape-a mutation, shape-b mutation,
division-not-regex, Leg B on the real file, Leg B non-vacuity on the mutation
— criterion 1's "≥ 43" is satisfied, 48 > 43). A6b's own assertion still reads
`occurrences === 3` unchanged and passes with count exactly 3 on the real,
unmutated `audit-app.js`.

Wall time, final clean re-run (`time timeout 290 node test_audit_prescan.js`):
```
real  1m43.381s
user  0m17.616s
sys   0m6.063s
```
Well inside the 5-minute (300s) foreground timebox — criterion 13. Consistent
with 185's own 1m44.139s (same file, same Chromium-driven criteria 3/4/6
dominating the wall time; the new Leg A/B cases are pure fs/string-scan and
add negligible time, confirmed by sub-second pass times in the console
output).

## 2. Non-vacuity mutations run, and their results

All four new mutation-based tests operate on a scratch copy under
`os.tmpdir()` (pid-suffixed filename), never the real `audit-app.js`; each
hashes the real file's md5 before and after and asserts identity.

**Placement, and why it is NOT literally "before the existing call sites"**
(see §6 deviation (a) below for the full reasoning) — both mutations are built
by `buildTailMutation()`: the mutated regex snippet is inserted immediately
before `audit-app.js`'s own tail marker (`process.exit(unresolved ? 3 : 2)`,
line 3201 — well AFTER all 3 pre-existing real call sites at lines
2837/3059/3068), and the genuine new call site is appended after the marker,
at the very end of the mutated string. This placement was verified
empirically (not just reasoned about) to be the one that actually reproduces
the pre-186 bug — see §6(a).

**Shape a — `/[/*]/` (the verifier's original POC):**
- FIXED `stripJsCommentsAndStrings()`: count **4** (3 real + 1 genuine new).
  Confirmed PASS.
- Frozen `legacyStrip` (185's pre-fix scanner, verbatim): count **3** — silently
  green on the added 4th call site, reproducing exactly the "A6b green on the
  event it exists to catch" failure mode. Confirmed PASS.
- Real `audit-app.js` md5 unchanged before/after. Confirmed PASS.

**Shape b — `/[^\s"]*/ ` (the LIVE audit-app.js:324/771/811 shape, a `"`
inside a character class):**
- FIXED stripper: count **4**. `legacyStrip`: count **3**. Confirmed PASS both
  directions, md5 unchanged.

**Criterion 5 — division vs. regex, synthetic sources:**
- `a / b`, `a /= b`, `(x + y) / 2` all survive stripping with the division/
  `/=` operator intact (asserted via regex match on the stripped output).
- `const avg = (x + y) / 2;\nreconcilePrescanFindings(foo, { prefix: "far-side" });\n`
  → count **1** — the real call site on the far side of a division is not
  swallowed. Confirmed PASS (all four assertions in one `test()`).

**Leg B — tail-survival invariant:**
- On the real, unmutated `audit-app.js`: `deriveTailMarker()` finds
  `process.exit(unresolved ? 3 : 2)` by scanning backward from EOF for the
  last line starting with `process.exit(` (never hardcoded blind — read from
  the file's own tail at run time, so the invariant can't rot). Asserted
  present in the raw source first, then asserted present in the FIXED
  stripper's output. Confirmed PASS.
- Non-vacuity, same `/[/*]/` -mutated scratch copy as shape (a): `legacyStrip`
  output does **NOT** contain the marker (dropped — the exact "swallows the
  rest of the file" symptom from the spec's Evidence section); the FIXED
  stripper's output **DOES** contain the marker. Confirmed PASS, both
  directions, on the same mutation. Real file md5 unchanged.

## 3. Before/after live-mis-tokenization measurement (criterion 9)

Instrumented probe scripts (scratch, NOT committed, both in
`/tmp/claude-0/-home-user-defi-garden/867ceeb1-7284-5a7a-899a-45dfe10e86f7/scratchpad/`:
`probe.js` = pre-existing before-probe embedding 185's pre-fix stripper;
`probe_after.js` = new variant embedding this build's fixed stripper),
run over the real, unmodified `audit-app.js`:

**Before** (185's pre-fix stripper):
```
src len 176348   stripped len 75317   count reconcile in stripped: 3
largest consumed spans:
  block  line 1     6,389 chars  "/* audit-app.js — read-only Playwright product-audit scanner"   ← real comment, correct
  str"   line 765   1,188 chars  "\"/g;\n\n// Absolute owned form: https://(www.)?defi.garden/..."  ← REAL CODE (bug)
  str"   line 811   1,185 chars  "\"]+)\\1\\s*\\)/g;\n  let m;\n  while ((m = re.exec(text)) !== nul" ← REAL CODE (bug)
  str"   line 324     643 chars  "\"'<>]*)?/g;\n\n// (a) unrouted query key — every query key on"  ← REAL CODE (bug)
  str'   line 863     509 chars  (comment prose, apostrophe-triggered — same class of bug, not the 324/771/811 shape)
  str'   line 856     309 chars  (same)
  str"   line 841     308 chars  (same)
  str`   line 1269    295 chars  (genuine template literal — correct)
```

**After** (this build's fixed stripper):
```
src len 176348   stripped len 75569   count reconcile in stripped: 3
largest consumed spans:
  block  line 1     6,389 chars  "/* audit-app.js — read-only Playwright product-audit scanner"   ← real comment, correct (unchanged)
  str`   line 1269    295 chars  "`${badLinkCount} defi.garden link${plural ? 's' : ''} carr${"   ← genuine template literal, correct
  str`   line 1391    267 chars  (genuine template literal, correct)
  str`   line 1542    267 chars  (genuine template literal, correct)
  str`   line 645     249 chars  (genuine template literal, correct)
  str`   line 602     241 chars  (genuine template literal, correct)
  str`   line 1337    241 chars  (genuine template literal, correct)
  str`   line 568     235 chars  (genuine template literal, correct)
```

The `:324`/`:771`(shown as `:765` in the before-probe's own line-counting —
same span, counting-convention difference, immaterial) `/:811` real-code spans
are gone from the after list entirely — no span above the size of a genuine
template literal remains. `count reconcile in stripped` stays exactly **3**
both before and after, confirming the fix does not change the real file's
count (criterion 1's ===3 requirement).

**Stripped-output length**: before 75,317 → after 75,569 (net **+252**
chars). This net figure is smaller than the raw sum of the three flagged
real-code swallows (~3,016 chars) because the comparison has two effects
running in opposite directions, not one: (1) real code previously swallowed
by the false "string" state is now correctly preserved (recovery, positive);
(2) real regex-literal bodies throughout the file (dozens of `const X =
/.../;` declarations — `IGNORABLE`, `JUNK_SLUG_NUMERIC`, `TEXT_APY_FIGURE`,
etc.) previously passed through into the stripped output *by accident* (the
pre-fix scanner has no regex concept, so a regex with no comment-triggering
or quote-triggering characters inside it is simply emitted character-by-
character as if it were code) and are now correctly *dropped* from the
output, exactly like a string literal, per the spec's own instruction ("The
whole literal is dropped from the output (same treatment as a string — its
contents are not source structure)"). Verified directly: the first
stripped-output divergence between before/after is at
`const IGNORABLE = /mp\.defi\.garden|.../i;` — legacy's output contains the
regex body verbatim; the fixed stripper's output is `const IGNORABLE = ;`.
Net effect (+252) is (1) minus (2), and is expected, not a discrepancy.

## 4. `git status --porcelain`

```
 M test_audit_prescan.js
```
Confirmed empty of anything else (no stray scratch/fixture files) after the
full test-file run, after `npm ci`, and after the plain-lane run.

## 5. Plain-lane baseline comparison

`npm ci` was required first (`node_modules` was absent in this checkout;
`node_modules/` is gitignored, confirmed via `.gitignore:30`, so this did not
touch tracked files or `git status`).

`timeout 290 node run-tests.js --lane=plain`:
```
TOTAL pass=39 fail=0 timeout=0 total=39
real  0m6.085s
```
Identical to the baseline recorded in `specs/185-notes.md` §4
(`pass=39 fail=0 timeout=0 total=39`) — **no new failure**. `test_audit_prescan.js`
is not a plain-lane member (transitively requires Playwright via
`audit-app.js`), so this item cannot move the plain lane by construction,
consistent with 185's own note on this.

## 6. Scope proof

`git diff origin/main --stat`:
```
 product-loop-kit/specs/186.md |  171 +++++++++++++++++++++++++
 test_audit_prescan.js         |  260 +++++++++++++++++++++++++++++++++++++++++-
 2 files changed, 430 insertions(+), 1 deletion(-)
```
`product-loop-kit/specs/186.md` was already committed on this branch before
this build started (the spec commit), same pattern as 185's notes recorded —
this build only modified `test_audit_prescan.js` plus (uncommitted) this
notes file. `git diff origin/main -- audit-app.js app.js PoolDetail.js
planner.js translations.js home.html tokens/ chains/ data/ package.json` →
**0 lines**. No new dependency (`package-lock.json`/`package.json` untouched;
`require()` list in `test_audit_prescan.js` is unchanged — still only
`fs`/`os`/`path`/`crypto`/`./audit-app.js`, all pre-existing).

Trust rails: `git diff origin/main -- audit-app.js app.js PoolDetail.js
planner.js translations.js home.html | grep -n
"APY_SANITY_LIMIT\|DEFAULT_MIN_TVL\|anomal\|degen\|haircut"` → **zero lines**
(exit code 1 = grep found nothing).

## 7. Deviations from the spec / brief, and the conservative choice made

**(a) The two regex-literal mutation fixtures are NOT placed literally
"before the existing call sites" as criterion 2's illustrative example reads;
they are placed immediately before the tail marker (after all 3 existing
call sites).** This was a deliberate, empirically-verified choice, not an
oversight. I first tried the literal reading — inserting `const RE_186 =
/[/*]/;` near the top of the file (e.g. beside the other regex constants
around line 324, well before the pre-existing call sites at 2837/3059/3068)
— and measured what the frozen `legacyStrip` actually does with that
placement: `audit-app.js` has dozens of block/line comments distributed
throughout, so the pre-fix scanner's runaway "look for the next `*/`" search
recovers at the *very next* comment closing (a few lines later), never
reaching anywhere near EOF. Under that placement `legacyStrip` still counts
**4**, identical to the fixed scanner — which would make acceptance criterion
3 ("the OLD stripper... returns 3 on that same mutated copy") impossible to
satisfy, and the whole non-vacuity proof vacuous (both old and new agree,
proving nothing). I then located the actual mechanical requirement: for the
old scanner's runaway comment/string search to swallow all the way to true
EOF (the literal "swallows the rest of the file" symptom the spec's Evidence
section describes), the mutation must be inserted *after the last literal
`*/` occurring anywhere in the file* (verified: that is line 3097, itself
already after all 3 real call sites) *and before EOF*. Only that placement
reproduces old=3/new=4 exactly, and it additionally lets the SAME mutated
copy double as the Leg B (tail-survival) non-vacuity fixture, since the tail
marker (line 3201) sits inside the swallowed span. Conservative choice: keep
the placement that is mechanically verified to defeat the old scanner and
serve Leg B, and document the wording gap here explicitly rather than
building a fixture that "reads" more literally but doesn't prove anything —
per the operator's own instruction that acceptance criteria are measured by
running the file, not by matching prose. Every number this choice produces
(old=3, new=4, marker dropped/kept) was verified in a standalone Node script
before being written into the test file (see the exploration transcripts
referenced by this notes file's own construction), not merely asserted.

**(b) Criterion 9's "measured before and after" figures are recorded here
from two scratch instrumentation scripts, not from a test-file assertion.**
The spec's Evidence section itself measures this the same way (an ad hoc
probe over the real file printing consumed spans), so this follows the same
convention. `probe.js` (pre-existing, embeds 185's pre-fix stripper verbatim)
and the new `probe_after.js` (embeds this build's fixed stripper) both live
under the session scratchpad and were not committed, per the operator's
instructions.

**(c) `isRegexPosition()`'s trailing-whitespace trim (`emittedSoFar.replace(/\s+$/, '')`)
is O(output-length-so-far) per invocation in the worst case**, called once
per `/` character encountered (2,769 in the real file). This was measured,
not just assumed safe: the full test file (including all Chromium-driven
criteria 3/4/6/etc.) completes in ~1m43s, indistinguishable from 185's
~1m44s, and the pure fs/string-scan Leg A/B tests all report sub-second
individual pass times in the console output — no criterion 13 risk.

## 8. What could NOT be proven / is not covered

- **The regex-vs-division heuristic is the standard heuristic (previous
  significant character), not a full JS parser.** It is verified correct
  against every regex literal and every `/`-bearing line actually present in
  `audit-app.js` today (the real-file count stayed exactly 3, and the
  before/after span measurement shows no remaining real-code swallow), and
  against the four synthetic division shapes named in the spec's criterion 5.
  It has NOT been proven correct for arbitrary future JavaScript shapes not
  present in this repo today (e.g. a regex literal immediately following a
  post-increment `a++ /re/` — genuinely ambiguous in real JS too and not
  present here; or ASI-sensitive line-break cases). This is the same class of
  caveat 185's own notes recorded for the original hand-rolled scanner, one
  level more precise, not eliminated — a hand-rolled tokenizer is still not a
  real parser (per the spec's own "Out of scope" section, which explicitly
  defers replacing this with acorn/espree to a separate item).
- **No independent second measurement (e.g. a verifier re-run) is recorded in
  this file** — only this build's own runs are captured, per the outcome-loop
  convention noted in 185's own notes.
- **The exact byte-for-byte match to `specs/186.md`'s own Evidence
  measurement's line numbers (765 vs. this build's 771 for the same span) was
  not reconciled** — both probes agree on the *content* and *character count*
  of the swallowed span; the one-line discrepancy is a difference in how each
  probe script counts "line number of the swallow's start offset" (immaterial
  to the finding) and was not chased further since the acceptance criterion
  is about the span's existence/size and the count, not its printed line
  number.
