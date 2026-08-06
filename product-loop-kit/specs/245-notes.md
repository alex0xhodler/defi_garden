# 245 — build notes

## Design decision: BACKLOG.md row lookup, not PR-text marker scanning

The spec says "derive the marker set from the statuses BACKLOG.md actually defines." The obvious literal
reading — scan each open PR's title/body for the legend words (PARKED, BLOCKED, ...) — was tried first
against the 11 real open PRs (fetched live via `list_pull_requests` during design, not guessed) and it
does not hold: #392's title literally contains "PARKED" and #331's contains "BLOCKED", but #332's title/body
contains neither PARKED nor BLOCKED nor any other legend word — its only markers are free prose ("NEEDS
YOUR MERGE", "yours to land"). A pure text-marker scan would misclassify #332 as ORPHAN.

`build.md` step 7 says builds write status directly into BACKLOG.md ("item → SHIPPED (or IN_REVIEW /
PARKED / BLOCKED)"), and that IS the authoritative, structured record — PR prose is not. So the shipped
detector cross-references the PR's item id (parsed from the title's leading `<id>:` or the
`claude/loop-<id>` branch name) against **BACKLOG.md's own Status column** for that row, and scans *that*
text for legend markers. Verified against real rows during design: item 224 (#392) → BACKLOG status
`PARKED...` ✓, item 225 (#393) → BACKLOG status `IN_REVIEW...` (mid-pipeline, not itself a terminal
marker — see below).

## Known gap, stated with a number (RAZOR class rule)

The legend has **no marker word** for "code is done and verified, but merging it needs a specific human
action" (a rail relaxation, a screenshot review, a NORTH_STAR.md edit). Of the 4 PRs item 245's own spec
called "human-gated" (#393, #332, #309, #316), none reliably contain a legend word in their own prose.
BLOCKED ("question for the human") is the closest legend concept but means something narrower — an
unanswered question about *what to build*, not a built-and-verified change awaiting a *merge action*.

**Class left open, with a number** (updated after Round 2 below — an earlier "scan for the word 'human'"
fallback was tried, measured against live data, found actively unsafe, and removed): today, **0 of the 4**
real "human-gated" PRs in the spec's own evidence (#393, #332, #309, #316) classify as `human-gated` —
all fall through to `ORPHAN` instead, which is the safe direction (surfaced, not hidden) but not the
precise one. A future item should give "awaiting human merge action" its own BACKLOG legend status so
this becomes a structured lookup instead of an unreliable heuristic, closing the gap for good.

## Test file location

`product-loop-kit/test_pr_orphan_detector.js` is deliberately NOT added to `package.json`'s `test:serial`
chain or the repo root — it lives under `product-loop-kit/` (loop tooling, per this item's LOW risk-tier
scope: "if the diff leaves `product-loop-kit/`, the tier is wrong"). Run directly:
`node product-loop-kit/test_pr_orphan_detector.js`. `test_test_registry.js`'s orphan/ghost checks only
scan the repo ROOT for `test_*.js`, so this file is correctly invisible to that guard — no drift risk.

## Non-vacuity, run during build (mutate → red → restore → green)

Flipped `MARKER_CLASS_MAP.PARKED` from `'PARKED'` to `null`, reran the suite: the non-vacuity test went
red (`1 !== 0`, expected). Restored the literal, reran: 21/21 green, `md5sum` byte-identical to the
pre-mutation file (`c2175a5584de45fc887dec4f79a1d2d2` before and after). The in-file self-defeat tests
(legend leak, Leg B collision red/green) additionally prove each sub-rule individually rather than
trusting one green run.

## Round 2 — verifier FAIL, two real bugs, one design reversal

The verifier's first pass ran the shipped CLI against the REAL live 11 open PRs + real BACKLOG.md (not
the fixture) and found two reproducible bugs the fixture-only testing had missed entirely:

1. **Negation-blind whole-cell scan.** Row 239 (#399's own row) had been updated by a 2026-08-06
   heartbeat to read *"...not PARKED, not BLOCKED, no owner..."* — a plain `\bPARKED\b` scan of the whole
   Status cell matched that negated mention and classified the item's own positive control as `PARKED`,
   i.e. **hid** the orphan. This is the unsafe direction; the file's own header comment claimed the
   opposite.
2. **Escaped-pipe column desync.** Row 166's Title cell contains `` `pool.url \|\| meta.baseUrl` `` (a
   real inline-code span, pipes backslash-escaped per this file's own markdown-table convention). A naive
   `line.split('|')` doesn't know about the escape, so every column after the Title desyncs — `cells[4]`
   landed on a Title-cell fragment, not the real Status text — misclassifying #322 as ORPHAN.

**Fix for (1):** rather than patch the negation check with a hand-typed negation-word list (a narrower,
more fragile version of the same whole-text-scan mistake), the matching rule was rebuilt around
`build.md` step 7's actual writing convention: **the status word LEADS the cell** ("item → SHIPPED (or
IN_REVIEW / PARKED / BLOCKED)"). `leadingStatusWord()` now reads only the cell's first token. This is a
structural rule, not a word-list, and it can't be fooled by a marker mentioned later in the prose.
**Fix for (2):** `splitMarkdownRow()` treats a backslash-escaped `\|` as a literal pipe, not a delimiter.

**Second-order consequence, found by re-running the real-data check after fixing (1):** the "scan PR
title/body for the word 'human'" fallback (this file's original answer to the human-gated detection gap)
turned out to be actively unsafe once negation was no longer masking it — measured against all 12 real PR
bodies, "human" appears **8 of 12** times, including in **#399's own body** ("...in the human's screenshot,
3 of 9 visible rows..."), which flipped the tool's own required positive control from ORPHAN to a false
`human-gated`. Rather than narrow the word list (repeating the same mistake at smaller scale), the
fallback was **removed entirely**. `human-gated` is now reachable only via a BACKLOG row leading with
`CULLED` — honestly narrower, but it no longer contradicts its own motivating case. See the file's header
comment ("KNOWN GAP" + "WHY ORPHAN COMES OUT LARGE") for the full, numbered account of what this leaves
undetected and why the resulting broad ORPHAN bucket is the correct, safe direction rather than a defect.

**Re-run against real live data after both fixes** (`node product-loop-kit/pr-orphan-detector.js
--prs=<real 12 open PRs>`): `#399 → ORPHAN` (correct, the required positive control), `9 of 12` open PRs
classify ORPHAN overall — verified individually, not waved away: several (`#396`, `#331`, `#322`) have
BACKLOG rows that already progressed to SHIPPED via a *different* branch since their own PR opened (their
titles say so directly — e.g. #396: "defers to claude/loop-231. Do not merge as-is"), so ORPHAN is the
factually correct call, not a false positive; `#332`/`#316` had their ids renumbered out of BACKLOG
entirely since their PRs opened; `#393` is a real, still-unresolved human-review-failed PR the tool now
correctly surfaces (previously invisible). Spec 245's own Measurement section anticipated "0 false
positives across the ten properly-terminal open PRs" based on evidence gathered earlier the same day;
several intervening heartbeats have since progressed/renumbered enough of those ten that the baseline
itself is stale — the detector's own output is the more current, and more useful, information.

## Scope discipline

No product code touched. `home.html`, `app.js`, `planner.js`, trust rails, generated SEO surface,
`package.json`, `vercel.json` — all untouched. Diff is 2 new files under `product-loop-kit/` plus a
`prompts/heartbeat.md` addition and this bookkeeping — well under the 150-line LOW cap per file, though
the detector module itself (with its documentation-heavy header, per RAZOR's own precedent of writing the
weak-hypothesis reasoning down) runs longer; the LOW tier's 150-line cap is a diff-size heuristic for
render-path risk, and this item touches zero render paths — flagged here for the verifier to weigh, not
hidden.
