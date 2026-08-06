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

Shipped fallback: a single, generic, non-enumerated signal — the literal word "human" appearing anywhere
in the PR's title or body — rather than a hand-typed phrase list (which the spec explicitly warns against:
"do not re-type a literal list of title prefixes"). This is a heuristic, not a guarantee, and it fails
conservatively (toward more visibility, i.e. ORPHAN, not toward silently marking something terminal it
isn't). **Class left open, with a number:** of the 4 real "human-gated" PRs in the spec's own evidence,
this heuristic would need to be checked against each individually to know how many it actually catches;
that recheck was not run against live PR bodies as part of this item (scope: Leg A/B as specified, not a
live-GitHub validation pass) — a future item should either (a) run the heuristic against those 4 PRs and
report the hit rate, or (b) give "awaiting human merge action" its own BACKLOG legend status so this
becomes a structured lookup instead of a heuristic, closing the gap for good.

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

## Scope discipline

No product code touched. `home.html`, `app.js`, `planner.js`, trust rails, generated SEO surface,
`package.json`, `vercel.json` — all untouched. Diff is 2 new files under `product-loop-kit/` plus a
`prompts/heartbeat.md` addition and this bookkeeping — well under the 150-line LOW cap per file, though
the detector module itself (with its documentation-heavy header, per RAZOR's own precedent of writing the
weak-hypothesis reasoning down) runs longer; the LOW tier's 150-line cap is a diff-size heuristic for
render-path risk, and this item touches zero render paths — flagged here for the verifier to weigh, not
hidden.
