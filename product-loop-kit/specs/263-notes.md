# 263-notes.md — build notes

## Deviations from the spec, and why

1. **[FALSIFIED — see "Verifier round 1 FAIL" below. Original text preserved for the record, not
   rewritten, per "append, don't rewrite history":]** ~~Leg A's bounded-token rule was implemented as a
   digit-boundary regex over the WHOLE ref name, not "must start with `claude/loop-`". The spec's own
   wording — "match any ref whose name contains the item id as a bounded token" — is the weaker, more
   general form, and it's what's tested (`boundedIdInString`). In practice every real match is still a
   `claude/loop-<id>*` branch (that's the only convention this repo's loop uses), so this is a no-op in
   observed behavior; it's recorded as a deviation only because a narrower "must match
   `^refs/heads/claude/loop-\d+`" reading was also defensible and I chose the spec's literal, weaker
   wording instead (RAZOR: no check narrower than the class it guards).~~
   **This claim was FALSE.** "Every real match is still a `claude/loop-<id>*` branch" was never checked
   against the actual 441-ref remote population — it was an assumption. The verifier reproduced a live
   counterexample: `node check-item-inflight.js 065 --no-fetch` returned COLLISION (exit 1) on
   `refs/heads/claude/inspiring-meitner-fs065n`, a Claude Code auto-generated session branch
   (`adjective-name-hexid` naming) that carries a bounded digit run equal to id 065 but is **not** a
   `claude/loop-*` branch at all. Measured over the real 441 refs: **5/441 refs** (all five auto-generated
   session branches, none of them `claude/loop-*`) coincidentally carry a bounded digit run equal to a
   real BACKLOG id — `claude/dazzling-ride-190iql`(190), `claude/dazzling-ride-198cif`(198),
   `claude/inspiring-meitner-fs065n`(065), `claude/inspiring-meitner-pcl159`(159),
   `claude/jolly-turing-240dvy`(240). At the time of the verifier's report, three of those five (065, 198,
   240) had no corroborating `claude/loop-<id>` branch, so the coincidence ALONE flipped the verdict for
   those three ids — a false positive that would block a legitimate build run. "A no-op in observed
   behavior" was not evidence of anything; it was an unchecked assumption that happened to be wrong for
   3/5 of the actual coincidences. **Fixed** (see "Verifier round 1 FAIL" below): leg A now matches only
   when the ref carries a `loop-<digits>` TOKEN whose numeric value equals the id; a bounded-digit-run
   coincidence that is not a `loop-<id>` token is collected separately as a WEAK, informational-only
   candidate (never affects the exit code) and printed with a count, so the residue stays visible instead
   of silently vanishing OR silently flipping the verdict.
2. **`--base=<sha>` is informational-only and lives entirely in the CLI, not the pure core.** The spec
   calls it out as "informational, non-failing" with no acceptance criterion attached, so it isn't a
   fourth leg and isn't exported for testing beyond one CLI smoke test (`--base` never changes the exit
   code). No pure-core function was added for it (`git rev-list --count` is called directly in `runCli`);
   this keeps the pure/CLI split honest (drift-reporting genuinely needs a live git call, it has no
   meaningful "injected data" shape).
3. **`ROOT` in `check-item-inflight.js` is the REPO root (`path.join(__dirname, '..')`), not
   `product-loop-kit/` like `pr-orphan-detector.js`'s `ROOT`.** `pr-orphan-detector.js` only ever reads
   `BACKLOG.md`, which lives in `product-loop-kit/`, so its `ROOT = __dirname` is correct for its own use.
   This script runs `git` commands, which need the actual `.git` working tree root as `cwd`
   (`/home/user/defi_garden`), so a different `ROOT` value was necessary — not a stylistic drift from the
   225/245 convention, a correctness requirement of what this script actually does.
4. **The new BACKLOG row for the class residue (below) was added to `product-loop-kit/BACKLOG.md` even
   though that file isn't in the operator's enumerated deliverables list.** Spec 263's own acceptance
   criteria are explicit and unconditional: *"a BACKLOG row is filed for it if > 0"* under "Class closed
   by this item". The count below is 53, so the row was filed (id 271 — see the renumber note at the end of this section; 268 is main's current max on `main`, but 269 and 270 are already claimed by the unmerged `claude/loop-266` branch/PR #434 —
   verified CLEAR by the tool itself before use, see Negative Control below). Nothing in the HARD
   CONSTRAINTS list forbids editing `BACKLOG.md`, and the deliverables list is not stated as exhaustive of
   everything the spec requires — only as what must exist on the branch. Left in the working tree,
   uncommitted, like everything else.
5. **No product-loop-kit dependency change, no `package.json` touch** — confirmed by construction (the
   script uses only `fs`/`path`/`child_process`, all Node builtins) and by the regression check below.

No other deviations from the ORIGINAL build. The three legs, the exit codes, and the pickup/pre-push
double-run in `prompts/build.md` all matched the spec as written at the time. **The matching rules
themselves (leg A's bounded-token rule, leg B/C's leading-id rule) did NOT survive verifier round 1 — see
the section immediately below, which is the authoritative record of what changed and why.**

## Verifier round 1 FAIL — what was wrong and what changed (2026-08-11, attempt 2)

The verifier returned FAIL on the build above with two real, reproduced defects. Both are now fixed; this
section is the honest record of what was wrong, measured with real numbers, and what the fix predicate
now is. (Deviation #1 above is corrected in place with a strikethrough + falsification note, per "append,
don't rewrite history" — this section is the fuller account.)

### Finding 1 — leg A false positives (reproduced live)

**What was wrong:** leg A matched the id as a bounded digit run **anywhere** in a ref name
(`boundedIdInString`). Over the real 441 refs from `git ls-remote --heads origin`, **5 refs**
coincidentally carry a bounded digit run equal to a real BACKLOG id, all five Claude Code
auto-generated session branches (`adjective-name-hexid` naming, unrelated to the loop's own
`claude/loop-<id>` convention): `claude/dazzling-ride-190iql`(190), `claude/dazzling-ride-198cif`(198),
`claude/inspiring-meitner-fs065n`(065), `claude/inspiring-meitner-pcl159`(159),
`claude/jolly-turing-240dvy`(240). Reproduction: `node check-item-inflight.js 065 --no-fetch` returned
`VERDICT: COLLISION (exit 1)` on `refs/heads/claude/inspiring-meitner-fs065n` alone — a false positive
that would block a legitimate build run on id 065.

**The fix — exact new predicate:** leg A now matches a ref only when it carries a `loop-<digits>` TOKEN
whose numeric value equals the id (`refHasLoopIdToken`/`extractLoopIdTokens` in `check-item-inflight.js`):
the ref must contain the literal substring `loop-` immediately followed by a digit run, and
`Number(digitRun) === Number(id)`. This also makes zero-padded id arguments work as the fix instructions
required (`065` matches both `claude/loop-65` and `claude/loop-065`). A ref that carries the id as a
bounded digit run elsewhere, but not as a `loop-<id>` token, is **not** a match — but is not silently
dropped either: it is collected by `weakLegACandidates()` and printed as one informational line
(`leg A weak digit-coincidence refs (NOT counted as matches): N — <ref names>`), which never changes the
exit code.

**Reproduction after the fix:**
```
$ node product-loop-kit/check-item-inflight.js 065 --no-fetch
check-item-inflight: id=065
  leg A (remote branch refs, 441 scanned): 0 match(es)
  leg A weak digit-coincidence refs (NOT counted as matches): 1 — refs/heads/claude/inspiring-meitner-fs065n
  leg B (origin/main commit subjects, 90 scanned): 0 match(es)
  leg C (pull requests, any state): UNAVAILABLE — no --prs data supplied; this leg did not run.

VERDICT: CLEAR-WITH-UNAVAILABLE-LEG (exit 3)
$ echo $?
3
```
(exit 3, not 1 — the false positive is gone; the weak coincidence is visible, not hidden.)

**New measured number:** 5/441 real refs are weak digit-coincidences under the corrected rule (verified
live on the current remote at the time of this fix); 0 of those 5 are `loop-<id>` tokens for any id, so 0
false-positive COLLISIONs remain from this class. (At the time the fix was verified, all five of the
originally-named coincidence refs were still present on the remote — the earlier claim in the failure
report that only 3 of the 5 lacked a corroborating `claude/loop-<id>` branch is now moot in the fixed
rule: whether a corroborating branch exists is irrelevant, since NONE of the five coincidence refs
themselves are ever counted as a match — each id's actual match status now depends only on whether a
genuine `claude/loop-<id>` branch exists, checked directly.)

### Finding 2 — legs B/C false negatives (quantified over the real population)

**What was wrong:** `extractLeadingId` only accepted two forms: a bare `^<id>:` lead, and a
conventional-commit scope `type(<id>):`. Measured against the REAL 90-subject `git log --format=%s
origin/main` corpus with a second, independently-coded extractor: **5 of 31 subjects (16.1%)** that
genuinely carry a human-visible leading id were missed (e.g. `224 close-out: restore 19 BACKLOG rows
destroyed by the merge that landed #392` (#415) — colon is not immediately after the digit run, so the
old `^\s*(\d+)\s*:` rule failed; `feat(seo): 232 — depth section for the 130-page Google head...` (#397)
— the id follows a conventional-commit prefix that is NOT itself the scope). Against the real 12-row
PR-title fixture, 1/12 (`236 phase 1: one header band + ...`, PR #424) was missed the same way.

**The fix — exact new predicate (F1/F2/F3, applied in order):**
- **F1** — a bounded leading digit run, whatever punctuation or words follow:
  `/^\s*(?<!\d)(\d+)(?!\d)/`, matched at the very start of the string (after optional leading whitespace).
- **F2** — a conventional-commit scope equal to the id (unchanged from the original rule):
  `/^\s*[\w.-]+\((\d+)\)!?\s*:/`.
- **F3** — strip ONE optional leading conventional-commit prefix (`type:` or `type(scope):`, matched by
  `/^\s*[\w.-]+(?:\([\w.-]+\))?!?\s*:\s*/`) and re-apply F1 to the remainder (`docs(loop): 118 — GSC
  "Excluded by noindex" diagnosis` → strip `docs(loop): ` → F1 finds `118`).
`matchLegB`/`matchLegC` now compare `Number(extracted.id) === Number(id)` (numeric, not string, equality)
so this composes cleanly with F1's own "whose numeric value equals the id" framing.

**All eight real examples named in the failure report now match**, verified directly:
```
246 -> MATCH "246 follow-up (docs only): point the collision references at row 260, not 259"   (#427)
224 -> MATCH "224 close-out: restore 19 BACKLOG rows destroyed by the merge that landed #392"   (#415)
229 -> MATCH "229 compound step: a green test run before commit is not evidence"                (#404)
246 -> MATCH "246 (HIGH): numeral cells in pool cards never wrap ..."                            (#426)
110 -> MATCH "110 — KPI read-from-DB: ..."                                                       (#272)
117 -> MATCH "117.3 — planner 'prefer steadier yield' ..."                                       (#271)
145 -> MATCH "145 (compound step) — playbook: derived-number-rails"                              (#303)
118 -> MATCH "docs(loop): 118 — GSC \"Excluded by noindex\" diagnosis"                           (#269)
```
Both required negative controls still do NOT match: `123: fix inspired by 263` (mid-sentence mention —
F1 finds leading id 123, a DIFFERENT id, never 263) and `loop: stop the build picker re-taking items
whose PR is already open (148 was built twice today)` (a free word — "loop" — precedes the digit run,
which is not a conventional-commit prefix, so neither F1 nor F3 reaches it).

**New measured miss rate, before vs. after, over the real corpus (measured live 2026-08-11):**

| Corpus | Population | Before (2-form rule) | After (F1/F2/F3) |
|---|---|---|---|
| `origin/main` subjects (`git log --format=%s origin/main`, 90 total) | 31 subjects carry a genuine leading id | 26/31 matched — **5/31 missed (16.1%)** | **31/31 matched — 0/31 missed (0%)** |
| Real PR-title fixture (12 rows, same fixture Section 3's positive controls use) | 11 titles carry a genuine leading id | 10/11 matched — **1/11 missed (9.1%)** | **11/11 matched — 0/11 missed (0%)** |

**Residue, deliberately NOT special-cased (per RAZOR — "no claim more specific than the evidence
supports"):** a leading id preceded by a FREE WORD that is not a conventional-commit prefix (e.g. the
hypothetical `loop 102: RESOLVED …` from the fix instructions themselves) remains unmatched by design —
F1/F2/F3 do not cover "one arbitrary word, then the id". One REAL instance of this exact shape exists in
the PR-title fixture: PR #414's title `docs(loop): record 177 CULLED — $10M default floor stays
(bookkeeping for closed #332)` — after F3 strips the `docs(loop): ` prefix, the word `record` precedes
the digit run `177`, so F1 cannot reach it. **Enumerated residue count: 2** (the spec's own hypothetical
+ this one real example), out of 102 real subjects+titles examined this run (90 origin/main subjects + 12
PR-fixture titles) — both are `product-loop-kit/test_item_inflight_check.js`'s `KNOWN_LEGBC_RESIDUE`
constant, asserted to remain unmatched so a regression that silently widens the miss set fails loudly.
A broader auto-derived "skip one leading word, then require a digit" heuristic was tried and rejected for
measuring residue at population scale: it produces false positives on corrupted/unusual real subjects
(e.g. `feat: full 00K TVL floor alignment across app, poller, snapshots, and sitemaps` — a real commit
subject, apparently missing a `$1` before `00K` — would "candidate-match" a nonsensical id `00`). Per
RAZOR, an explicitly enumerated small list beats a noisy automatic one here.

**[FALSIFIED — see "Verifier round 2 FAIL" below. This entire "Enumerated residue count: 2" paragraph
(the text immediately above, ending "... an explicitly enumerated small list beats a noisy automatic one
here") turned out to be wrong in two ways: the count was undercounted by one real, uncounted instance,
AND the auto-derivation approach it rejected was, on this round's correction, exactly the right move once
the false-positive risk it correctly identified (`00K`) was filtered rather than used as a reason to avoid
automation altogether. Preserved verbatim above per "append, don't rewrite history"; corrected numbers and
the full account are immediately below.]**

## Verifier round 2 FAIL — residue accounting was undercounted (2026-08-11, attempt 3)

**Who found it, and what was claimed:** the round-2 verifier reported that the residue accounting above —
not the matcher itself — was wrong. Three specific claims from this file and from `check-item-inflight.js`
were named as false:
1. **"Enumerated residue count: 2"** — undercounted.
2. **"0/31 missed (0%)"** (leg B's "after" column in the round-1 fix table above) — the 31-subject
   denominator itself silently excluded the one instance below, so "0/31" was 0-out-of-the-wrong-31.
3. **"both instances of the SAME 'free word precedes the digit' shape"** — false as stated; the
   round-2 residue set actually contained a THIRD, structurally different instance, never enumerated.

**What was actually true (verified live, before any round-3 fix):** the commit subject
`design(247 world): certificate button skin app-wide — the pool-detail counterfoil look on every action
button (#412)` is a REAL, landed commit on `origin/main` — present in the exact same 90-subject
`git log --format=%s origin/main` corpus the round-1 fix table above claims to have measured — and it is
real PR #412's title. It genuinely names item 247 at the lead, exactly the way `fix(266):` names 266 or
`design(247)` would if the scope were well-formed. Under the round-2 build, `extractLeadingId()` returned
`null` for it (verified directly, reconstructing the round-2 regex — `SCOPE_ID_RE =
/^\s*[\w.-]+\((\d+)\)!?\s*:/` — since the scope's content, `247 world`, is not JUST the digits):
```
$ node -e "const RE=/^\s*[\w.-]+\((\d+)\)!?\s*:/; console.log('design(247 world): ...'.match(RE))"
null
```
It is not in `KNOWN_LEGBC_RESIDUE`. So the TRUE round-2 residue population was **3 real instances**, one
of them (`design(247 world)`) silently uncounted and excluded from its own denominator — the "31 subjects
carry a genuine leading id" figure was computed by `independentExtractLeadId`, the SAME narrow-F2 mirror
that shares this exact blind spot (its own F2 branch also required the digit run to be immediately
followed by `)`), so the cross-check that was supposed to catch drift could not see this instance either.
Compounding it, one of the "2" the round-2 notes counted was the spec's own HYPOTHETICAL example
(`loop 102: RESOLVED …`), which is not a member of either declared population (`git log` / the PR fixture)
at all — so the "2 ... out of 102 real subjects+titles examined this run" framing mixed a fabricated
example into a claimed real-corpus measurement.

**The fix (PART 1 — reduces the residue rather than re-describing it):** `check-item-inflight.js`'s F2
(`SCOPE_ID_RE`) is widened from "the scope IS the id" to "the scope's LEADING token IS the id" —
`/^\s*[\w.-]+\((\d+)[^)]*\)!?\s*:/` — so a malformed scope with a fused extra word (`design(247 world):`)
matches exactly like a well-formed one (`fix(266):`) does. `test_item_inflight_check.js`'s
`independentExtractLeadId` mirror is widened identically (same shape, independent implementation) so the
denominator computation stops sharing the shipped matcher's blind spot. Verified:
```
$ node -e "console.log(require('./product-loop-kit/check-item-inflight.js').extractLeadingId('design(247 world): certificate button skin app-wide — the pool-detail counterfoil look on every action button (#412)'))"
{ id: '247', via: 'conventional-scope' }
```
Leg B real-population count moves from 31/90 to **32/90** origin/main subjects carrying a genuine leading
id (one MORE subject now correctly counted, not a corpus change), still 0 disagreements between the module
and the (also widened) independent mirror.

**The fix (PART 2 — residue is now TEST-DERIVED, not memorized):** `test_item_inflight_check.js` adds
`permissiveLeadingIdCandidate()` — a THIRD extractor, deliberately MORE permissive than the shipped
F1/F2/F3 ladder (it answers "does a human see an id near the lead", not "does the shipped predicate
match") — and a new test sweeps every one of the 90 real `origin/main` subjects and all 12 real PR-fixture
titles through it, comparing each hit against the shipped module's own `extractLeadingId()`. Anywhere the
permissive extractor finds a candidate the module doesn't (null, or a numerically different id), that text
IS residue — derived at test time, not asserted from memory. The derived set is asserted equal to
`KNOWN_LEGBC_RESIDUE` in BOTH directions (a genuinely new residue instance in future history fails loudly;
a stale entry the matcher now covers — like `design(247 world)`, moved out of residue by the PART 1 fix —
also fails loudly if left in the list). Residue is grouped BY SHAPE (a `RESIDUE_SHAPE_NAMES` lookup keyed
off which strategy fired), so "both the same shape" is a printed, test-derived fact from here on, never a
hand-written claim.

**Corrected numbers, printed by the test itself (`node product-loop-kit/test_item_inflight_check.js`):**
```
    (leg B/C residue, TEST-DERIVED over the live corpus: 2 instance(s) out of 102 real subjects+titles examined this run — miss rate 2.0% of the corpus)
      shape "FREE_WORD_PRECEDES_DIGIT": 2 — FREE_WORD_PRECEDES_DIGIT (a bare word, not a conventional-commit prefix or scope, immediately precedes the id — the shipped F1/F2/F3 ladder has no rung that looks past a free word)
```
- **Corrected `KNOWN_LEGBC_RESIDUE` (2 real instances, denominator 90 origin/main subjects + 12 PR-fixture
  titles = 102, miss rate 2.0%, BOTH now genuinely the same test-derived shape,
  `FREE_WORD_PRECEDES_DIGIT`):**
  1. `docs(loop): gate 150/152/153 on their open questions, keep 151's PT half READY` — REAL origin/main
     subject (replaces the spec's hypothetical `loop 102: RESOLVED …`, which named no real commit and is
     removed from the population-derived list; it is kept as a plain `matchLegB` unit test elsewhere in
     the suite, not as a residue-population member, since a corpus sweep cannot assert a text that isn't
     in the corpus). After F3 strips `docs(loop): `, the free word `gate` precedes the digit run `150`
     (`151`, mentioned later in the same subject, is a second, even-less-lead mention — not counted
     separately, same "one instance per queried id" convention the rest of the suite uses).
  2. `docs(loop): record 177 CULLED — $10M default floor stays (bookkeeping for closed #332)` — REAL PR
     #414 title, unchanged from the round-2 finding.
- **`design(247 world)` is REMOVED from residue** — it is now MATCHED by the widened F2, which is why the
  true count returns to 2 despite the round-2 undercount being 3: the fix closes the gap the accounting
  missed rather than merely re-describing it. The "both the same shape" claim is TRUE this round, but for
  a different reason than round 2 claimed it: not because the same two items were re-examined and happened
  to share a shape, but because the F2 fix retired the one item that broke that claim, and the resulting
  two-member set is a fresh, test-derived fact printed on every run — not a re-assertion of the original
  (false) claim.
- **What remains open, stated with its number:** exactly 2 real texts, out of 102 examined, where a free
  word (not a conventional-commit prefix, not inside a parenthesised scope) immediately precedes the id —
  the one shape F1/F2/F3 structurally cannot reach, by design (widening further to "skip any leading free
  word" was tried during round 1 and rejected for producing a nonsensical `00` false-positive on a real,
  unrelated subject; PART 2's `permissiveLeadingIdCandidate()` reintroduces that exact heuristic but with a
  `nonZero()` guard that filters the `00` case out — proven by its absence from the derived residue set:
  `feat: full 00K TVL floor alignment across app, poller, snapshots, and sitemaps` is swept every run and
  never appears).

**Non-vacuity for this round's changes** — see "Non-vacuity, round 3" below for all five cycles (three
leg-neutering re-runs, the F2-widening-revert cycle proving PART 1 is load-bearing, and the
`KNOWN_LEGBC_RESIDUE` mutation cycle proving PART 2's set-equality check is load-bearing), with md5s.

## Files changed

- `product-loop-kit/check-item-inflight.js` — new, originally 354 lines, 454 after the verifier round 1
  FAIL fix (leg A token rule + weak bucket, leg B/C F1/F2/F3, updated file-header docs), now 476 after the
  round 2 FAIL fix (F2 widened to a leading-token scope rule, file-header docs updated again).
- `product-loop-kit/test_item_inflight_check.js` — new, originally 409 lines, 707 after the round 1 FAIL
  fix, now 871 after the round 2 FAIL fix (`independentExtractLeadId`'s F2 branch widened to match;
  `permissiveLeadingIdCandidate()` — the new, deliberately-more-permissive third extractor —
  `RESIDUE_SHAPE_NAMES`; the "design(247 world)" round-2 regression unit test; the test-derived
  `KNOWN_LEGBC_RESIDUE` set-equality test replacing the old hand-checked "remains unmatched" test).
- `product-loop-kit/prompts/build.md` — edited, +10 insertions / -1 deletion (`git diff --stat`).
- `product-loop-kit/playbooks/loop-container-contention.md` — edited, +17 insertions / -3 deletions
  (`git diff --stat`) — the "Unmerged PRs hold IDs invisibly" trap rewritten in place, not duplicated.
- `product-loop-kit/BACKLOG.md` — one new row appended (id 271, the class-residue ticket). Untouched by
  the round-1-FAIL fix, per the fix instructions' hard constraint. Untouched again this round (round 2
  FAIL's fix instructions carry the same constraint).
- `product-loop-kit/specs/263.md` — Territory notes corrected in place (the "two conventions verified
  against real history" framing was a 2-commit sample, not a measured corpus — see the note appended
  there 2026-08-11), corrected AGAIN this round (the "Enumerated residue count: 2" / "0/31 missed (0%)" /
  "both instances of the SAME shape" framing — see the note appended there 2026-08-11, attempt 3).
- `product-loop-kit/specs/263-notes.md` — this file.

## Positive controls — exact commands + REAL output

**id 266 — leg A, plain invocation (no `--prs`), against the live repo:**
```
$ node product-loop-kit/check-item-inflight.js 266
check-item-inflight: id=266
  leg A (remote branch refs, 441 scanned): 1 match(es)
    MATCH  refs/heads/claude/loop-266  @ 23219c38c8
  leg B (origin/main commit subjects, 90 scanned): 0 match(es)
  leg C (pull requests, any state): UNAVAILABLE — no --prs data supplied; this leg did not run.

VERDICT: COLLISION (exit 1)
$ echo $?
1
```

**id 266 — with the real PR list injected, leg C now also matches PR #434:**
```
$ node product-loop-kit/check-item-inflight.js 266 --no-fetch --prs=<scratch>/prs-real.json
check-item-inflight: id=266
  leg A (remote branch refs, 441 scanned): 1 match(es)
    MATCH  refs/heads/claude/loop-266  @ 23219c38c8
  leg B (origin/main commit subjects, 90 scanned): 0 match(es)
  leg C (pull requests, any state, 12 scanned): 1 match(es)
    MATCH  #434 [open]  266: WebMCP surface derives both trust rails from trust-rails.js + three-leg guard — PARKED at the attempt budget, do not merge as-is

VERDICT: COLLISION (exit 1)
$ echo $?
1
```

**id 227 — leg B matches the merged commit subject on `origin/main`, leg C matches PR #425 (CLOSED —
proving "any state"):**
```
$ node product-loop-kit/check-item-inflight.js 227 --no-fetch --prs=<scratch>/prs-real.json
check-item-inflight: id=227
  leg A (remote branch refs, 441 scanned): 1 match(es)
    MATCH  refs/heads/claude/loop-227  @ 3bd4a848f4
  leg B (origin/main commit subjects, 90 scanned): 1 match(es)
    MATCH  d4f7b3cf3c  227: public read-only railed Yield API on the edge Worker (#425)
  leg C (pull requests, any state, 12 scanned): 1 match(es)
    MATCH  #425 [closed]  227: public read-only railed Yield API on the edge Worker — the curated-answer endpoint agents cite

VERDICT: COLLISION (exit 1)
$ echo $?
1
```
(leg A also matches 227 — the branch `claude/loop-227` still exists even though the PR merged; this is
expected and doesn't weaken the leg-B/leg-C proof, it's additional evidence.)

## Negative controls — exact commands + REAL output

**max(BACKLOG id) + 1, derived at run time (268 → 269), no `--prs`: exits 3, not 0:**
```
$ grep -oE '^\| [0-9]+ ' product-loop-kit/BACKLOG.md | grep -oE '[0-9]+' | sort -n | tail -1
268
$ node product-loop-kit/check-item-inflight.js 269 --no-fetch
check-item-inflight: id=269
  leg A (remote branch refs, 441 scanned): 0 match(es)
  leg B (origin/main commit subjects, 90 scanned): 0 match(es)
  leg C (pull requests, any state): UNAVAILABLE — no --prs data supplied; this leg did not run.

VERDICT: CLEAR-WITH-UNAVAILABLE-LEG (exit 3)
$ echo $?
3
```

**Same id, empty `--prs` array: exits 0:**
```
$ node product-loop-kit/check-item-inflight.js 269 --no-fetch --prs=<(echo '[]')
check-item-inflight: id=269
  leg A (remote branch refs, 441 scanned): 0 match(es)
  leg B (origin/main commit subjects, 90 scanned): 0 match(es)
  leg C (pull requests, any state, 0 scanned): 0 match(es)

VERDICT: CLEAR (exit 0)
$ echo $?
0
```

**Bounded-token unit checks (see `test_item_inflight_check.js` Section 1 for the full set, all green):**
`claude/loop-2630` and `claude/loop-1263` do NOT match id `263` (leg A); `123: fix inspired by 263` does
NOT match id `263` (leg B); a PR title mentioning `263` mid-sentence does NOT match (leg C).

## All four exit codes, driven both directly and via the CLI child process (from the test suite)

| Code | Meaning | Command | Result |
|---|---|---|---|
| 0 | CLEAR | `node check-item-inflight.js 269 --no-fetch --prs=-` (stdin `[]`) | exit 0 |
| 1 | COLLISION | `node check-item-inflight.js 266 --no-fetch` | exit 1 |
| 2 | usage/env error | `node check-item-inflight.js` (no id) / `... not-a-number` | exit 2 |
| 3 | CLEAR-WITH-UNAVAILABLE-LEG | `node check-item-inflight.js 269 --no-fetch` (no `--prs`) | exit 3 |

## Test run (green)

```
$ node product-loop-kit/test_item_inflight_check.js
... (29 assertion groups, all ✓, see full output below) ...
29 assertion group(s) passed
$ echo $?
0
```
Population line printed by the suite:
```
(population: 261 BACKLOG ids × 441 real refs / 90 real subjects / 12 PR fixture rows → legA=215 legB=26 legC=10 matches, all independently re-verified)
```
Every one of those 251 matches (215+26+10) was independently re-extracted by a SEPARATE
char-scanning implementation (`independentRefHasId`/`independentExtractLeadId` in the test file, not
`check-item-inflight.js`'s own `boundedIdInString`/`extractLeadingId`) and found to carry the queried id.

## Test run, round 2 (after the verifier round 1 FAIL fix)

```
$ node product-loop-kit/test_item_inflight_check.js
... (51 assertion groups, all ✓) ...
51 assertion group(s) passed
$ echo $?
0
```
22 new `test()` groups were added on top of the original 29 (29 + 22 = 51, matching the number the suite
itself prints, which is the number that governs): 3 leg A regression tests for finding 1 (the 065
false-positive reproduction, zero-padding, weak-bucket/match exclusivity), 8 "FIX" regression tests (the
real previously-missed examples from the failure report), 2 leg B F1/F3 unit tests, 2 known-bad controls,
1 residue unit test, 2 "LEG A REAL POPULATION" tests (no-ref-outside-convention + the 5 known coincidence
refs), 2 "LEG B/C REAL POPULATION" tests (independent-implementation agreement over the real
subject/title corpora), 1 "KNOWN RESIDUE" test, and 1 CLI-level weak-bucket-line test.

New population line printed by the suite (BACKLOG.md has grown by one row — 271 — since the original
build, and the remote/`origin/main` have moved forward with new merges):
```
(population: 262 BACKLOG ids × 441 real refs / 90 real subjects / 12 PR fixture rows → legA=205 legB=31 legC=11 matches, all independently re-verified)
```
New leg A/B/C real-population lines (the two NEW sections the verifier's fix instructions required):
```
(legA real-population: 262 BACKLOG ids × 441 real refs → 205 matches, 0 false positives)
(known digit-coincidence refs: 5 present on remote / 0 deleted since, of 5 total)
(legB real-population: 90 real origin/main subjects, 31 carry a leading id per the independent implementation, 0 disagreement(s) with the module)
(legC real-population: 12 real PR titles, 11 carry a leading id per the independent implementation, 0 disagreement(s) with the module)
(known leg B/C residue: 2 hand-verified example(s) out of 102 real subjects+titles examined this run — miss rate 2.0% of the corpus, both instances of the SAME "free word precedes the digit" shape, deliberately not special-cased per RAZOR)
```
**[This "known leg B/C residue" line and the "2 hand-verified" framing above are FALSIFIED — see
"Verifier round 2 FAIL". Preserved verbatim per "append, don't rewrite history"; the corrected, test-derived
line is in "Test run, round 3" immediately below.]**

## Test run, round 3 (after the verifier round 2 FAIL fix)

```
$ node product-loop-kit/test_item_inflight_check.js
... (52 assertion groups, all ✓) ...
52 assertion group(s) passed
$ echo $?
0
```
One new `test()` group was added on top of round 2's 51 (51 + 1 = 52, matching the number the suite
itself prints): the `design(247 world)` round-2 regression unit test (Section 1d). The OLD "KNOWN RESIDUE"
test (round 2, hand-checked "these two texts remain unmatched") was REPLACED in place by the new
"RESIDUE (test-derived)" test (same test count either way — one test removed, one test added net zero,
plus the one genuinely new `design(247 world)` unit test — hence 51 → 52, not 51 → 53).

New population line (leg B's match count moves 31 → 32 — the `design(247 world)` subject, previously
uncounted, now correctly counted as a match; nothing else about the population changed):
```
(population: 262 BACKLOG ids × 441 real refs / 90 real subjects / 12 PR fixture rows → legA=205 legB=32 legC=11 matches, all independently re-verified)
```
New leg A/B/C real-population lines and the corrected, TEST-DERIVED residue line (replaces the falsified
"known leg B/C residue: 2 hand-verified example(s) ..." line above):
```
(legA real-population: 262 BACKLOG ids × 441 real refs → 205 matches, 0 false positives)
(known digit-coincidence refs: 5 present on remote / 0 deleted since, of 5 total)
(legB real-population: 90 real origin/main subjects, 32 carry a leading id per the independent implementation, 0 disagreement(s) with the module)
(legC real-population: 12 real PR titles, 11 carry a leading id per the independent implementation, 0 disagreement(s) with the module)
(leg B/C residue, TEST-DERIVED over the live corpus: 2 instance(s) out of 102 real subjects+titles examined this run — miss rate 2.0% of the corpus)
  shape "FREE_WORD_PRECEDES_DIGIT": 2 — FREE_WORD_PRECEDES_DIGIT (a bare word, not a conventional-commit prefix or scope, immediately precedes the id — the shipped F1/F2/F3 ladder has no rung that looks past a free word)
```
Leg B's real-population count is now correct at **32/90** (was wrongly 31/90 — see "Verifier round 2
FAIL"); the residue count is now printed by the test itself from a live sweep, not asserted from a
hand-written list, and its "both the same shape" claim is a grouped, derived fact (`RESIDUE_SHAPE_NAMES`),
not prose.

## Non-vacuity — all three legs, neutered separately, RED captured, byte-identical restore proven

Baseline hash (unmodified `check-item-inflight.js`, before any mutation):
```
1cbe1466c44b006270fe855a9ea8f350  product-loop-kit/check-item-inflight.js
```
The file is untracked (new in this branch), so `git checkout --` does not apply to it (`git status
--short` shows `??`, and `git diff --quiet` is trivially true for untracked paths regardless of content —
confirmed empirically during cycle 1 below). Each cycle instead reverts the EXACT edit by hand and proves
restoration via `md5sum` matching the baseline above (the equivalent guarantee `git checkout --` would
give a tracked file).

### Cycle 1 — neuter leg A (`matchLegA` always returns `[]`)
```
$ md5sum product-loop-kit/check-item-inflight.js
1cbe1466c44b006270fe855a9ea8f350  product-loop-kit/check-item-inflight.js
```
Edit: `matchLegA` body replaced with `return [];`.
```
$ md5sum product-loop-kit/check-item-inflight.js
71474495c695a83cea4e85570ea70900  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 7 assertion groups failed, and ONLY leg-A-scoped ones:
```
✗ legA: claude/loop-263 matches id 263                                          (0 !== 1)
✗ legA: claude/loop-263-operator matches id 263 (...)                           (0 !== 1)
✗ computeExitCode: any match -> 1 (COLLISION), even if leg C is unavailable     (3 !== 1)
✗ POSITIVE CONTROL: id 266 — legA matches refs/heads/claude/loop-266 (...)      (got [])
✗ POPULATION invariant: ...                                                     (legA=0, legB=26 — vacuous)
✗ CLI exit 1: COLLISION — real id 266 (leg A alone), --no-fetch                 (3 !== 1, VERDICT: CLEAR-WITH-UNAVAILABLE-LEG)
```
(23 of 30 assertion groups still passed — every leg-B/leg-C-only assertion, e.g. the id-227 leg-B/legC
positive controls and all leg-C unit/negative-control tests, stayed green.)

Restore (revert the exact edit) + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
1cbe1466c44b006270fe855a9ea8f350  product-loop-kit/check-item-inflight.js   # == baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
29 assertion group(s) passed
```

### Cycle 2 — neuter leg B (`matchLegB` always returns `[]`)
```
$ md5sum product-loop-kit/check-item-inflight.js
1cbe1466c44b006270fe855a9ea8f350  product-loop-kit/check-item-inflight.js
```
Edit: `matchLegB` body replaced with `return [];`.
```
$ md5sum product-loop-kit/check-item-inflight.js
553f5150fd9522d5be121c0c29927f12  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 5 assertion groups failed, and ONLY leg-B-scoped ones:
```
✗ legB: leading "<id>: " subject matches (...)                                  (0 !== 1)
✗ legB: conventional-commit scope "fix(<id>): " matches (...)                   (0 !== 1)
✗ legB: conventional-commit breaking-change scope "type(<id>)!: " matches       (0 !== 1)
✗ POSITIVE CONTROL: id 227 — legB matches the merged commit subject (...)       (got [])
✗ POPULATION invariant: ...                                                     (legA=215, legB=0 — vacuous)
```
(24 of 29 groups still passed — leg A and leg C assertions, including the id-266 legA/legC positive
controls and the CLI exit-1/exit-3/exit-0 tests, all stayed green.)

Restore + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
1cbe1466c44b006270fe855a9ea8f350  product-loop-kit/check-item-inflight.js   # == baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
29 assertion group(s) passed
```

### Cycle 3 — neuter leg C (`matchLegC` always returns `[]`)
```
$ md5sum product-loop-kit/check-item-inflight.js
1cbe1466c44b006270fe855a9ea8f350  product-loop-kit/check-item-inflight.js
```
Edit: `matchLegC` body replaced with `return [];`.
```
$ md5sum product-loop-kit/check-item-inflight.js
bd04a505dc34c823c777bc9f9b8ade5c  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 3 assertion groups failed, and ONLY leg-C-scoped ones:
```
✗ legC: matches regardless of PR state (open/closed both match a leading id)    (0 !== 1)
✗ POSITIVE CONTROL: id 266 — legC matches PR #434 (...)                         (got [])
✗ POSITIVE CONTROL: id 227 — legC matches PR #425 in CLOSED state (...)         (got [])
```
(26 of 29 groups still passed — legA/legB assertions all stayed green, including the population
invariant, which is scoped to legA+legB non-vacuity by design and correctly did not flag on a
leg-C-only failure — legC's own non-vacuity is separately proven by its 3 positive/negative-control
assertions above, which DID go red.)

Restore + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
1cbe1466c44b006270fe855a9ea8f350  product-loop-kit/check-item-inflight.js   # == baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
29 assertion group(s) passed
```

**Summary: three legs, three separately-neutered mutations, three DISTINCT and NON-OVERLAPPING RED
signatures, three byte-identical restores (same md5 `1cbe1466c44b006270fe855a9ea8f350` each time), three
green re-runs.** This is what distinguishes "three working legs" from "one working leg and two dead
ones" — each mutation broke exactly the assertions that name that leg and nothing else.

## Non-vacuity, round 2 (after the verifier round 1 FAIL fix) — 3 leg-neutering cycles re-run + 1 new cycle

The file changed (leg A's rule, leg B/C's rule, the weak bucket, the new tests), so the baseline hash
changed too. New baseline (unmodified, fixed `check-item-inflight.js`, 51/51 green):
```
$ node product-loop-kit/test_item_inflight_check.js | tail -1
51 assertion group(s) passed
$ md5sum product-loop-kit/check-item-inflight.js
1f333c798f36f87e8f3549c8252dec1c  product-loop-kit/check-item-inflight.js
```
Same untracked-file caveat as round 1 applies (`git status --short` shows `??`) — each cycle reverts the
exact edit by hand (this round: restoring from a saved copy of the fixed baseline file) and proves
restoration via `md5sum`.

### Cycle 1 (re-run) — neuter leg A (`matchLegA` body replaced with `return [];`)
```
$ md5sum product-loop-kit/check-item-inflight.js
9817b350173c1f3b09de913f78349b72  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 9 assertion groups failed, and ONLY leg-A-scoped ones:
```
✗ legA: claude/loop-263 matches id 263
✗ legA: claude/loop-263-operator matches id 263 (id is a bounded token, suffix after it is not another digit)
✗ legA: zero-padded id "065" matches both claude/loop-65 and claude/loop-065 (numeric equality, not string equality)
✗ weakLegACandidates: a genuine loop-<id> token match is NOT also reported as weak (matched refs never double as weak candidates)
✗ computeExitCode: any match -> 1 (COLLISION), even if leg C is unavailable
✗ POSITIVE CONTROL: id 266 — legA matches refs/heads/claude/loop-266 against the REAL ls-remote output
✗ POPULATION invariant: every BACKLOG id x {real refs, real subjects, real PR fixture} match is independently re-verified to carry the queried id
✗ LEG A REAL POPULATION: for every BACKLOG id, matchLegA never reports a ref outside the loop-<id> convention (independently re-verified)
✗ CLI exit 1: COLLISION — real id 266 (leg A alone), --no-fetch
```
(42 of 51 groups still passed — every leg-B/leg-C-scoped assertion stayed green, including all 8 "FIX"
regression tests for finding 2, the new leg B/C REAL POPULATION tests, and the KNOWN RESIDUE test.)

Restore + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
1f333c798f36f87e8f3549c8252dec1c  product-loop-kit/check-item-inflight.js   # == new baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
51 assertion group(s) passed
```

### Cycle 2 (re-run) — neuter leg B (`matchLegB` body replaced with `return [];`)
```
$ md5sum product-loop-kit/check-item-inflight.js
d84464089217058a9e132573d61a75ff  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 16 assertion groups failed, and ONLY leg-B-scoped ones (the 3 original legB unit tests, all 8 "FIX"
regression tests for finding 2 — since every one of them drives `matchLegB` directly, the legB F1/F3
unit tests, the id-227 legB positive control, the POPULATION invariant, and the new "LEG B REAL
POPULATION" test):
```
✗ legB: leading "<id>: " subject matches (e.g. "268: file the x402 ... (#433)")
✗ legB: conventional-commit scope "fix(<id>): " matches (e.g. "fix(266): derive WebMCP trust rails ...")
✗ legB: conventional-commit breaking-change scope "type(<id>)!: " matches
✗ FIX (leg B/C false negative): "246 follow-up (docs only): ..." now matches id 246 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "224 close-out: ..." now matches id 224 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "229 compound step: ..." now matches id 229 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "246 (HIGH): ..." now matches id 246 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "110 — KPI read-from-DB: ..." now matches id 110 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "117.3 — planner ..." now matches id 117 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "145 (compound step) — playbook: ..." now matches id 145 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "docs(loop): 118 — GSC ..." now matches id 118 (was null under the old two-convention rule)
✗ legB F1: a leading digit run followed by arbitrary punctuation/words matches (not only immediately by ":")
✗ legB F3: stripping ONE leading conventional-commit prefix then applying F1 matches (e.g. "docs(loop): 118 — ...")
✗ POSITIVE CONTROL: id 227 — legB matches the merged commit subject on the REAL origin/main history
✗ POPULATION invariant: every BACKLOG id x {real refs, real subjects, real PR fixture} match is independently re-verified to carry the queried id
✗ LEG B REAL POPULATION: independent re-implementation agrees with the module for every real origin/main subject (0 expected disagreements)
```
(35 of 51 groups still passed — leg A and leg C assertions, the known-bad controls, the residue test, and
the CLI exit-1/exit-3/exit-0 tests all stayed green.)

Restore + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
1f333c798f36f87e8f3549c8252dec1c  product-loop-kit/check-item-inflight.js   # == new baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
51 assertion group(s) passed
```

### Cycle 3 (re-run) — neuter leg C (`matchLegC` body replaced with `return [];`)
```
$ md5sum product-loop-kit/check-item-inflight.js
41fc8210320f2bf90fc8f2564aa019a6  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 4 assertion groups failed, and ONLY leg-C-scoped ones:
```
✗ legC: matches regardless of PR state (open/closed both match a leading id)
✗ POSITIVE CONTROL: id 266 — legC matches PR #434, with the real PR list injected (inline fixture)
✗ POSITIVE CONTROL: id 227 — legC matches PR #425 in CLOSED (merged) state — proving leg C matches ANY state, not just open
✗ LEG C REAL POPULATION (PR-title fixture): independent re-implementation agrees with the module for every real PR title (0 expected disagreements)
```
(47 of 51 groups still passed — legA/legB assertions all stayed green, including the population
invariant, unchanged from round 1's finding that it is scoped to legA+legB non-vacuity by design.)

Restore + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
1f333c798f36f87e8f3549c8252dec1c  product-loop-kit/check-item-inflight.js   # == new baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
51 assertion group(s) passed
```

### Cycle 4 (NEW) — revert leg A's rule to the OLD (pre-fix) bounded-anywhere rule, proving the new leg-A narrowing is load-bearing, not decorative

This cycle is different in kind from cycles 1–3: it does not neuter a leg to "always empty" — it
literally re-introduces the bug (`matchLegA` calls `boundedIdInString(ref, id)` instead of
`refHasLoopIdToken(ref, id)`), to prove the NEW real-refs population tests actually depend on the fixed
rule rather than merely coexisting with it.
```
$ md5sum product-loop-kit/check-item-inflight.js
1f333c798f36f87e8f3549c8252dec1c  product-loop-kit/check-item-inflight.js
```
Edit: in `matchLegA`, `refHasLoopIdToken(ref, id)` → `boundedIdInString(ref, id)` (one line).
```
$ md5sum product-loop-kit/check-item-inflight.js
5de98da6f630a3f71b47ed93a661698d  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 5 assertion groups failed, and they are EXACTLY the tests that guard the verifier-round-1 fix:
```
✗ FIX (leg A false positive): claude/inspiring-meitner-fs065n does NOT match id "065" via matchLegA (no loop-<id> token) — it is a bounded-digit-run COINCIDENCE, not a match
✗ legA: zero-padded id "065" matches both claude/loop-65 and claude/loop-065 (numeric equality, not string equality)
✗ POPULATION invariant: every BACKLOG id x {real refs, real subjects, real PR fixture} match is independently re-verified to carry the queried id
✗ LEG A REAL POPULATION: for every BACKLOG id, matchLegA never reports a ref outside the loop-<id> convention (independently re-verified)
✗ LEG A REAL POPULATION: the 5 known digit-coincidence refs (positive control, present-on-remote only) land in the weak bucket, never in matchLegA
```
(46 of 51 groups still passed. Note the original 4 legA bounded-token unit tests — `claude/loop-263`
matches, `claude/loop-263-operator` matches, `claude/loop-2630`/`claude/loop-1263` don't — stayed GREEN
under the OLD rule, because the old bounded-anywhere rule is a superset of the new loop-token rule on
those four specific inputs; that is exactly why the original suite never caught the false positive — the
old unit tests were consistent with both the wrong rule and the right one. Only the population-scale
REAL-refs tests, driven by data the unit tests never covered, can tell the two rules apart. This is the
proof the new leg-A narrowing is load-bearing: it is the only thing standing between the real remote's 5
digit-coincidence refs and a false-positive COLLISION.)

Restore (revert the one-line edit) + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
1f333c798f36f87e8f3549c8252dec1c  product-loop-kit/check-item-inflight.js   # == new baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
51 assertion group(s) passed
$ git status --short -- product-loop-kit/check-item-inflight.js
?? product-loop-kit/check-item-inflight.js
```
(File remains untracked/new-in-branch, as in round 1 — `git diff --quiet` against a tracked baseline does
not apply; the md5 match against `1f333c798f36f87e8f3549c8252dec1c` is the restoration proof, same
standard round 1 used.)

**Summary, round 2: four cycles — three re-run leg-neutering mutations (still three DISTINCT,
NON-OVERLAPPING RED signatures against the new 51-assertion baseline) plus one NEW mutation that reverts
leg A to the exact pre-fix rule and shows the new REAL-refs population tests are the ones that catch it.
All four cycles restored to the same md5 (`1f333c798f36f87e8f3549c8252dec1c`) and re-ran green.**

## Non-vacuity, round 3 (after the verifier round 2 FAIL fix) — 3 leg-neutering cycles re-run + F2-widening-revert cycle + KNOWN_LEGBC_RESIDUE mutation cycle

The file changed again (F2's rule, the file-header docs), so the baseline hash changed again too. The test
file also changed (`independentExtractLeadId`'s F2 widened, `permissiveLeadingIdCandidate` added, the
`design(247 world)` unit test added, `KNOWN_LEGBC_RESIDUE` corrected), so its own suite went from 51 to 52
assertion groups (see "Test run, round 3" above). New baselines (unmodified, both files, 52/52 green):
```
$ node product-loop-kit/test_item_inflight_check.js | tail -1
52 assertion group(s) passed
$ md5sum product-loop-kit/check-item-inflight.js
dab56c34e4db39a89ddf884203c6f1a6  product-loop-kit/check-item-inflight.js
$ md5sum product-loop-kit/test_item_inflight_check.js
ce2b644ed05e9869cc8c3b111c390364  product-loop-kit/test_item_inflight_check.js
```
Same untracked-file caveat as rounds 1 and 2 applies (`git status --short` shows `??` for both files) —
each cycle reverts the exact edit by hand (this round: from a saved copy of the round-3 baseline files) and
proves restoration via `md5sum`.

### Cycle 1 (re-run) — neuter leg A (`matchLegA` body replaced with `return [];`)
```
$ md5sum product-loop-kit/check-item-inflight.js
4f3ad6112f9daaeea89bff3cf33c52dd  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 9 assertion groups failed, and ONLY leg-A-scoped ones (identical signature to round 2's cycle 1):
```
✗ legA: claude/loop-263 matches id 263
✗ legA: claude/loop-263-operator matches id 263 (id is a bounded token, suffix after it is not another digit)
✗ legA: zero-padded id "065" matches both claude/loop-65 and claude/loop-065 (numeric equality, not string equality)
✗ weakLegACandidates: a genuine loop-<id> token match is NOT also reported as weak (matched refs never double as weak candidates)
✗ computeExitCode: any match -> 1 (COLLISION), even if leg C is unavailable
✗ POSITIVE CONTROL: id 266 — legA matches refs/heads/claude/loop-266 against the REAL ls-remote output
✗ POPULATION invariant: every BACKLOG id x {real refs, real subjects, real PR fixture} match is independently re-verified to carry the queried id
✗ LEG A REAL POPULATION: for every BACKLOG id, matchLegA never reports a ref outside the loop-<id> convention (independently re-verified)
✗ CLI exit 1: COLLISION — real id 266 (leg A alone), --no-fetch
```
(43 of 52 groups still passed — every leg-B/leg-C/residue-scoped assertion, including the new
`design(247 world)` unit test and the test-derived RESIDUE test, stayed green.)

Restore + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
dab56c34e4db39a89ddf884203c6f1a6  product-loop-kit/check-item-inflight.js   # == round-3 baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
52 assertion group(s) passed
```

### Cycle 2 (re-run) — neuter leg B (`matchLegB` body replaced with `return [];`)
```
$ md5sum product-loop-kit/check-item-inflight.js
151696df5c62a084ebe51ece23688483  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 17 assertion groups failed, and ONLY leg-B-scoped ones (round 2's 16 PLUS the new
`design(247 world)` unit test, which also drives `matchLegB`):
```
✗ legB: leading "<id>: " subject matches (e.g. "268: file the x402 ... (#433)")
✗ legB: conventional-commit scope "fix(<id>): " matches (e.g. "fix(266): derive WebMCP trust rails ...")
✗ legB: conventional-commit breaking-change scope "type(<id>)!: " matches
✗ FIX (leg B/C false negative): "246 follow-up (docs only): ..." now matches id 246 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "224 close-out: ..." now matches id 224 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "229 compound step: ..." now matches id 229 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "246 (HIGH): ..." now matches id 246 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "110 — KPI read-from-DB: ..." now matches id 110 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "117.3 — planner ..." now matches id 117 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "145 (compound step) — playbook: ..." now matches id 145 (was null under the old two-convention rule)
✗ FIX (leg B/C false negative): "docs(loop): 118 — GSC ..." now matches id 118 (was null under the old two-convention rule)
✗ legB F1: a leading digit run followed by arbitrary punctuation/words matches (not only immediately by ":")
✗ legB F3: stripping ONE leading conventional-commit prefix then applying F1 matches (e.g. "docs(loop): 118 — ...")
✗ FIX (leg B/C round 2 — malformed scope): "design(247 world): ..." now matches id 247 (was null before the round-2 F2 widening — the scope's leading token is the id, but the scope is not JUST the id)
✗ POSITIVE CONTROL: id 227 — legB matches the merged commit subject on the REAL origin/main history
✗ POPULATION invariant: every BACKLOG id x {real refs, real subjects, real PR fixture} match is independently re-verified to carry the queried id
✗ LEG B REAL POPULATION: independent re-implementation agrees with the module for every real origin/main subject (0 expected disagreements)
```
(35 of 52 groups still passed — leg A and leg C assertions, the residue test (scoped to comparing
`permissiveLeadingIdCandidate` against `extractLeadingId`, not `matchLegB` directly, so it is not part of
this leg's own regression signature here), and the CLI exit-code tests all stayed green.)

Restore + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
dab56c34e4db39a89ddf884203c6f1a6  product-loop-kit/check-item-inflight.js   # == round-3 baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
52 assertion group(s) passed
```

### Cycle 3 (re-run) — neuter leg C (`matchLegC` body replaced with `return [];`)
```
$ md5sum product-loop-kit/check-item-inflight.js
f650a7501f4899b3454cb98c8e5ae7f5  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — 4 assertion groups failed, and ONLY leg-C-scoped ones (identical signature to round 2's cycle 3):
```
✗ legC: matches regardless of PR state (open/closed both match a leading id)
✗ POSITIVE CONTROL: id 266 — legC matches PR #434, with the real PR list injected (inline fixture)
✗ POSITIVE CONTROL: id 227 — legC matches PR #425 in CLOSED (merged) state — proving leg C matches ANY state, not just open
✗ LEG C REAL POPULATION (PR-title fixture): independent re-implementation agrees with the module for every real PR title (0 expected disagreements)
```
(48 of 52 groups still passed.)

Restore + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
dab56c34e4db39a89ddf884203c6f1a6  product-loop-kit/check-item-inflight.js   # == round-3 baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
52 assertion group(s) passed
```

### Cycle 4 (NEW, this round) — revert ONLY the F2 scope widening, proving PART 1 is load-bearing

Reverts `SCOPE_ID_RE` from `/^\s*[\w.-]+\((\d+)[^)]*\)!?\s*:/` (round-3 fix) back to
`/^\s*[\w.-]+\((\d+)\)!?\s*:/` (round-2, the exact pre-fix rule) — a one-line edit, everything else
(leg A, leg C, F1, F3) unchanged.
```
$ md5sum product-loop-kit/check-item-inflight.js
dab56c34e4db39a89ddf884203c6f1a6  product-loop-kit/check-item-inflight.js
```
Edit: `SCOPE_ID_RE` regex literal, one line.
```
$ md5sum product-loop-kit/check-item-inflight.js
d737ec066a7357736637b16c341e5a53  product-loop-kit/check-item-inflight.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — exactly 3 assertion groups failed, all three tied to the SAME `design(247 world)` regression, caught
by THREE independent mechanisms (the explicit unit test, the leg-B real-population agreement check, AND
the test-derived residue sweep — proving the residue-derivation machinery itself also catches this class
of regression, not only the population-agreement check):
```
✗ FIX (leg B/C round 2 — malformed scope): "design(247 world): certificate button skin app-wide ... (#412)" now matches id 247 (was null before the round-2 F2 widening — the scope's leading token is the id, but the scope is not JUST the id)
✗ LEG B REAL POPULATION: independent re-implementation agrees with the module for every real origin/main subject (0 expected disagreements)
✗ RESIDUE (test-derived): sweep REAL_SUBJECTS + REAL_PR_FIXTURE with the permissive extractor; every text it flags where the shipped module disagrees (null or a different id) IS residue — asserted to equal KNOWN_LEGBC_RESIDUE exactly, both directions, grouped by shape, count and miss rate printed with their true denominator
```
(49 of 52 groups still passed — note this is the proof the task instructions specifically asked for:
"revert ONLY the scope widening → the `design(247 world)` assertion must go RED". It does, and two OTHER
assertions the widening was never explicitly written for also catch it — the population-agreement check
because the design(247 world) subject is a real BACKLOG-247 population member, and the residue-derivation
check because reverting the widening makes `design(247 world)` reappear as undeclared residue, which
`KNOWN_LEGBC_RESIDUE`'s both-directions equality assertion rejects.)

Restore + proof:
```
$ md5sum product-loop-kit/check-item-inflight.js
dab56c34e4db39a89ddf884203c6f1a6  product-loop-kit/check-item-inflight.js   # == round-3 baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
52 assertion group(s) passed
```

### Cycle 5 (NEW, this round) — mutate `KNOWN_LEGBC_RESIDUE`, proving the derived-residue both-directions equality check is load-bearing

Two sub-cycles, one per direction (the task instructions require both directions be provably checked).

**5a — add a bogus entry** (a text that is not in either real corpus):
```
$ md5sum product-loop-kit/test_item_inflight_check.js
ce2b644ed05e9869cc8c3b111c390364  product-loop-kit/test_item_inflight_check.js
```
Edit: insert `{ text: 'bogus 999: this text does not exist in either real corpus', reason: 'injected for non-vacuity cycle 5' },` into `KNOWN_LEGBC_RESIDUE`.
```
$ md5sum product-loop-kit/test_item_inflight_check.js
93b0da152933fb12eb3b08b797734bf9  product-loop-kit/test_item_inflight_check.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — exactly 1 assertion group failed, the residue test itself (the "known but not derived" direction —
`onlyInKnown` non-empty):
```
✗ RESIDUE (test-derived): sweep REAL_SUBJECTS + REAL_PR_FIXTURE with the permissive extractor; every text it flags where the shipped module disagrees (null or a different id) IS residue — asserted to equal KNOWN_LEGBC_RESIDUE exactly, both directions, grouped by shape, count and miss rate printed with their true denominator
```
(51 of 52 groups still passed.) Restore:
```
$ md5sum product-loop-kit/test_item_inflight_check.js
ce2b644ed05e9869cc8c3b111c390364  product-loop-kit/test_item_inflight_check.js   # == round-3 baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
52 assertion group(s) passed
```

**5b — remove a real entry** (the PR #414 `record 177` residue entry):
```
$ md5sum product-loop-kit/test_item_inflight_check.js
ce2b644ed05e9869cc8c3b111c390364  product-loop-kit/test_item_inflight_check.js
```
Edit: delete the `docs(loop): record 177 CULLED ...` object from `KNOWN_LEGBC_RESIDUE`.
```
$ md5sum product-loop-kit/test_item_inflight_check.js
8f4b605d4644f3003541204f4f1b67cb  product-loop-kit/test_item_inflight_check.js
$ node product-loop-kit/test_item_inflight_check.js
```
RED — exactly 1 assertion group failed, the same residue test, this time the OTHER direction (the
"derived but not known" direction — `onlyInDerived` non-empty, since the sweep still finds PR #414's title
as residue but `KNOWN_LEGBC_RESIDUE` no longer lists it):
```
✗ RESIDUE (test-derived): sweep REAL_SUBJECTS + REAL_PR_FIXTURE with the permissive extractor; every text it flags where the shipped module disagrees (null or a different id) IS residue — asserted to equal KNOWN_LEGBC_RESIDUE exactly, both directions, grouped by shape, count and miss rate printed with their true denominator
```
(51 of 52 groups still passed.) Restore + proof:
```
$ md5sum product-loop-kit/test_item_inflight_check.js
ce2b644ed05e9869cc8c3b111c390364  product-loop-kit/test_item_inflight_check.js   # == round-3 baseline
$ node product-loop-kit/test_item_inflight_check.js | tail -1
52 assertion group(s) passed
```

**Summary, round 3: five cycles — three re-run leg-neutering mutations (still three DISTINCT,
NON-OVERLAPPING RED signatures against the new 52-assertion baseline, modulo the `design(247 world)` unit
test correctly joining leg B's signature) plus the F2-widening-revert cycle (3 independent assertions catch
it, proving PART 1 is load-bearing) plus the two-sub-cycle `KNOWN_LEGBC_RESIDUE` mutation (both directions
of the set-equality check independently proven to fail, proving PART 2 is load-bearing). All cycles
restored to their respective baseline md5s (`dab56c34e4db39a89ddf884203c6f1a6` for
`check-item-inflight.js`, `ce2b644ed05e9869cc8c3b111c390364` for `test_item_inflight_check.js`) and re-ran
green (52/52).**

## Regression checks (kit + root registry untouched)

Re-confirmed unchanged after the verifier round 1 FAIL fix (same output as the original build):

```
$ node product-loop-kit/test_pr_orphan_detector.js | tail -1
24 assertion group(s) passed
$ echo $?
0
```
```
$ node run-tests.js --list --lane=plain | tail -3
test_edge_docs_settlement_claims.js	plain

TOTAL files=169 plain=62 browser=107 listed=62
$ echo $?
0
```
Both green, unchanged from before this item's work — the root test registry (`test_test_registry.js`'s
scan target) never saw `test_item_inflight_check.js`, confirming the `product-loop-kit/` placement keeps
it out of `package.json`'s `test:serial` chain as required.

## Class-residue count (spec's last acceptance criterion)

**Methodology:** every imperative behavioral directive in `product-loop-kit/prompts/build.md` and
`product-loop-kit/prompts/heartbeat.md` — one per numbered step / bullet / named-rule paragraph — was
classified SCRIPT (an executable check in this repo enforces or performs it) or MEMORY (the run is
trusted to follow it from the prompt text alone, with nothing outside the run's own diligence checking
compliance). This item converts exactly ONE prose rule to SCRIPT (the in-flight check, both its pickup
and pre-push occurrences count as the SAME rule made executable, per spec 263's own "no more specific
than necessary" framing — it's one invariant checked twice, not two invariants). Item 245 had already
converted the orphan-PR classification and the next-id computation to SCRIPT in a prior item; those are
counted as already-closed here, not credited to 263.

**`prompts/build.md`: 29 imperative directives total, 2 now SCRIPT (both from this item — pickup check
+ pre-push re-run of the SAME check), 27 remain MEMORY.**

**`prompts/heartbeat.md`: 28 imperative directives total, 2 SCRIPT (from item 245 — orphan classification
via `classifyAll`, next-id via `computeNextId`), 26 remain MEMORY.**

**Total open residue: 53 memory-enforced imperative rules across the two files.**

A representative sample (not exhaustive — the full enumeration lives in this build's working notes and
is reproducible by re-reading both files against the methodology above):
- `build.md` §1: "Take the highest-scored item with status READY (skip items at attempt-limit)" — no
  script verifies a build run actually picked the top-scored eligible row rather than a convenient one.
- `build.md` §3 "Guard rule": "watch the DEFINING mechanism, never a resemblance of it" — a build run is
  trusted to apply this judgment; nothing scans a new guard/test for "mirrors a resemblance instead of the
  real mechanism".
- `build.md` §5: "write the explainer to `specs/<item-id>-pr.md`... ending with a 5-question quiz
  (answers at the bottom, base64)" — no script checks the file exists, is the right tier's format, or
  that the quiz answers are actually base64-encoded.
- `build.md` §7: "Exit. Do not pick up another item." — the ralph one-item-per-session rule; nothing in
  this repo prevents (or detects) a run doing a second item in the same session.
- `heartbeat.md` §3: "Confidence = extension, not conviction... an item whose payoff exists ONLY under
  one specific unobserved condition is NOT scored and queued. File it GATED(...) instead" — a scoring
  judgment call with no script checking a filed item's confidence claim against its actual future-count.
- `heartbeat.md` §4: "Any shipped item whose gate has NOT opened within 60 days of ship → close it... as
  UNEXERCISED" — no script tracks ship dates against a 60-day clock; a heartbeat has to remember to check.
- `heartbeat.md` "Questions for the human": "Ask at most 3, and only where the answer changes what gets
  built" — no script counts or validates the questions a report actually asks.

**This class is NOT closed by item 263** (per spec 263's own "Class closed by this item: no" — this item
closes exactly the one in-flight-check rule). The residue is ticketed: `BACKLOG.md` row **271**, filed in
this same working tree (score 6.0, Risk LOW, no spec written — the ticket names the class and the count;
a future heartbeat or human decides whether/how much of the remaining 53 is worth converting, and at what
cost, per RAZOR's "weakness ≠ small diff" — most of these (e.g. "ask at most 3 questions", "10 lines max
report") are editorial judgment calls that may not be worth an executable check at all).

## Operator amendment (2026-08-11) — the residue row was renumbered 269 → 271

The build agent filed the class-residue ticket as **269**, derived from `main`'s own max id (268). That
derivation is exactly the trap this item's own playbook update warns about and `pr-orphan-detector.js`
(245) exists to prevent: **`BACKLOG.md` on `main` cannot show an id claimed by an unmerged PR**, because
the status change ships in the same commit as the code (the 2026-07-13 rule). The open PR **#434**
(branch `claude/loop-266`, PARKED) already claims **269** and **270** on its own copy of the table —
verified directly, not inferred:

```
$ git show origin/claude/loop-266:product-loop-kit/BACKLOG.md | grep -oE '^\| 2(69|70) ' 
| 269 
| 270 
```

so the next genuinely free id is **271**. The operator renumbered the row in place after the build agent
exited (never mid-run — `playbooks/loop-container-contention.md`'s "renumber after the agents exit" rule)
and re-ran the suite: **29/29 green**, unchanged.

The negative-control transcripts above are left **exactly as the build agent recorded them** (they used
`269`, the then-max+1) — rewriting a captured transcript to match a later state would falsify the record.
Re-run after the renumber, for the current tree, where max+1 is now `272`:

```
$ node product-loop-kit/check-item-inflight.js 272 --no-fetch          ; echo $?
VERDICT: CLEAR-WITH-UNAVAILABLE-LEG (exit 3)
3
$ node product-loop-kit/check-item-inflight.js 272 --no-fetch --prs=<(echo '[]') ; echo $?
VERDICT: CLEAR (exit 0)
0
```

Note the honest limit this exposes, stated rather than papered over: **the id-collision leg is NOT part of
this item's script.** `check-item-inflight.js` answers "has item `<id>` already been built/landed/claimed?"
— it does not allocate ids, and none of its three legs reads another branch's `BACKLOG.md`. Id allocation
is `pr-orphan-detector.js`'s `computeNextId()`/`detectIdCollisions()` (item 245), which does take open-PR
branches into account and which the heartbeat — not the build loop — is the caller of. This build run hit
the collision because it filed a *new* row, something build runs rarely do. Recorded here rather than
widened into 263's scope: the correct fix, if this recurs, is for `prompts/build.md` to route
row-filing through 245's existing `computeNextId()` rather than for 263's checker to grow a fourth leg it
was not built for.

---

# ROUND 3 VERDICT: FAIL → item PARKED at the 3-attempt budget (operator, 2026-08-11)

Three build attempts, three adversarial verifier rounds, three FAILs. Per `prompts/build.md` §4 and
NORTH_STAR's budget ("Max build-loop attempts per item: 3, then park with notes"), the item is **PARKED**
and its PR is left **OPEN and unmerged**. Parking is the recorded outcome, not a failure to record: a
fourth blind attempt is exactly what the budget exists to prevent.

## What each round found, and what survived

| Round | Verdict | Finding | State now |
|---|---|---|---|
| 1 | FAIL | Leg A matched a bounded digit run **anywhere** in a ref name → `065` returned COLLISION on the unrelated session branch `claude/inspiring-meitner-fs065n`; 5/441 real refs were digit-coincidences | **FIXED** — leg A now requires a `loop-<digits>` token compared numerically; coincidences demoted to an informational weak line that cannot change the exit code. Verifier re-derived: **0 false positives** over 262 ids × 441 real refs, **0 false negatives** over all **208** real `claude/loop-<id>` branches |
| 1 | FAIL | Legs B/C required the id to lead in one of two conventions → ~16% of real leading-id PR titles missed (`246 follow-up:`, `224 close-out:`, `229 compound step:`, `110 — …`, `117.3 — …`) | **FIXED** — F1/F2/F3 widening; verifier re-measured **0 disagreements** over 90 real `origin/main` subjects and **433** real PR titles fetched live from the API |
| 2 | FAIL | The residue accounting was undercounted: `design(247 world):` names item 247, matched nothing, and was a different shape from the two enumerated cases; "0/31 missed (0%)" excluded it from its own denominator | **FIXED** — F2 widened so a scope only has to START with the id, and the residue is now **derived at test time** by a third permissive extractor and asserted set-equal to `KNOWN_LEGBC_RESIDUE` in both directions, grouped by named shape. Prose claim replaced by a self-checking one |
| 3 | FAIL | **The round-2 fix over-corrected.** `SCOPE_ID_RE` = `/^\s*[\w.-]+\((\d+)[^)]*\)!?\s*:/` accepts ANY paren-scope whose content starts with a digit run. Demonstrated live on the shipped module: `matchLegB([{subject:'fix(2 factor auth): add TOTP support'}], '2')` → match, and `002` is a real BACKLOG row. Same class for `chore(404 page):`, `feat(500ms):`, `docs(100k):`. Zero instances in the current real corpus, but **no negative control exists for the shape**, and the notes' framing ("a human reads it as naming item 247") claims a scoping the regex does not have | **OPEN — this is why the item is parked** |

## Why round 3's finding is real and not a nitpick

The spec's own risk section names this exact failure mode: *"the check gates pushes, so a **false positive**
blocks legitimate work — hence the bounded-token criteria."* A false COLLISION does not merely annoy: under
the new `prompts/build.md` step it **stops a legitimate run from pushing finished work**. Shipping a gate
whose widest predicate is undisclosed and untested is the same defect class this item exists to retire —
a guard whose documentation claims coverage (or scoping) the code does not have. Merging it would make
263 an instance of itself.

## Unparking recipe (one focused change — do NOT redesign)

1. Tighten `SCOPE_ID_RE` in `check-item-inflight.js` to the weakest predicate consistent with BOTH the
   known-good evidence (`fix(266):`, `design(247 world):`) and the known-bad evidence
   (`fix(2 factor auth):`, `chore(404 page):`, `feat(500ms):`, `docs(100k):`, `chore(24hr):`) — the
   discriminator the evidence actually supports is that the id is followed by a scope-word that reads as
   an item reference, not by an ordinary English word or a unit. Mirror the change in the test file's
   `independentExtractLeadId` **and** `permissiveLeadingIdCandidate`.
2. Add negative controls for the shape (none exist today — verified by grep), and quantify the residual
   false-collision count over BOTH the real corpus and a constructed adversarial set, the way leg A's
   weak-bucket disclosure was done in round 1.
3. Must still match `design(247 world)` and must not regress any verified acceptance-criteria example.
4. Re-run the five non-vacuity cycles; baselines to restore against are recorded above.

## What is demonstrably TRUE about the parked branch, for whoever picks this up

Everything except the round-3 finding is independently verified by an adversarial checker that tried three
times to break it: 52/52 assertions green, `test_pr_orphan_detector.js` 24/24 unaffected, all four exit
codes reproduced against the live repo, the non-vacuity machinery reproduced firsthand (cycles 4 and 5
re-run by the verifier with byte-identical restores), scope confined to `product-loop-kit/`, and both
`prompts/build.md` call sites present. The parked branch is strictly better than the prose rule it would
replace — it is parked on an over-acceptance the loop's own budget says to hand over rather than to keep
swinging at.
---

# Round 4 — unparked by human directive: what changed (2026-08-11)

Human authorization to exceed the 3-attempt budget, with an efficiency mandate: ONE focused fix, one
verifier round. Round 3's finding is closed by SPLITTING F2 strong/weak, mirroring leg A's shipped
weak-bucket pattern — not by inventing a discriminator between "247 world" and "2 factor auth" that no
evidence supports and no regex can have.

- **STRONG (can cause a COLLISION):** `SCOPE_ID_RE` restored to strict `/^\s*[\w.-]+\((\d+)\)!?\s*:/` —
  the scope must be EXACTLY the digit run. F1/F3 untouched (round 3 population-swept F1 over 523 real
  texts, zero false positives — it is evidence-backed, so it stays).
- **WEAK (informational, never affects the exit code):** new `weakScopeIdCandidates(texts, id)` using the
  round-2 shape `/^\s*[\w.-]+\((\d+)([^)]*)\)!?\s*:/` with non-empty extra content, surfaced as
  `legB.weak`/`legC.weak` and printed one line per leg. A strong match is never also reported weak.
  Live (`check-item-inflight.js 247 --no-fetch --prs=…`, VERDICT CLEAR, exit 0 — visible, cannot block):
  `leg B weak scope-lead candidates (NOT counted as matches): 1 — 6c33899fee design(247 world): …`
  `leg C weak scope-lead candidates (NOT counted as matches): 1 — #412 design(247 world): …`
- **Residue machinery:** `design(247 world)` moves from strong-matched to weak-visible — a
  KNOWN_LEGBC_RESIDUE entry of its own DERIVED category `SCOPE_LEAD_EXTRA_CONTENT`/`WEAK_VISIBLE` (read
  from the shipped module's own weak bucket, never hand-assigned), distinct from the 2 `TRUE_MISS`
  instances no leg surfaces. Both-directions set equality holds and now covers category too, so a silent
  category flip fails as loudly as a new instance. Printed: `3 instance(s) out of 102 … 2 surfaced by
  NOTHING (2.0% true-miss rate) and 1 still printed as WEAK`.
- **Negative controls (round 3's requirement):** the 5 known-bad shapes (`fix(2 factor auth):`,
  `chore(404 page):`, `feat(500ms):`, `docs(100k):`, `chore(24hr):`) each assert no STRONG match on leg B
  or C, weak count 1, exit 0; plus a sweep asserting **0 strong matches over 262 BACKLOG ids × 5 shapes**
  (3 weak candidates — non-vacuous). Assertions **52 → 59 green**; `test_pr_orphan_detector.js` 24/24.

## Non-vacuity, round 4 (ONE cycle, per the ceremony cap)

Mutation: re-widen `SCOPE_ID_RE` to the round-2 `[^)]*` shape — i.e. delete the strong/weak split.

```
md5 before          bbe075155da14fa1e121b162d3940302   59 assertion group(s) passed
md5 mutated         19582988eb7ee7e96d95208cf82c0cee   RED — 50 passed, 9 groups FAIL: all 5 new
    negative controls, the swept 262-id control, the round-3 weak-candidate test, the POPULATION
    invariant, and the derived-residue set/category equality
md5 after restore   bbe075155da14fa1e121b162d3940302   byte-identical; 59 assertion group(s) passed
```
