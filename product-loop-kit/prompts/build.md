# LOOP 2 — BUILD (ralph rules: ONE item, fresh context, then exit)

You are one iteration of the build loop. You do exactly one backlog item this session — never a second one, even if the first goes quickly. The next iteration gets a fresh context window; anything future-you needs must be written to disk.

## 1. Pick up work
Read `product-loop-kit/NORTH_STAR.md`, then `product-loop-kit/BACKLOG.md`. Take the highest-scored item with status READY (skip items at attempt-limit). Set it to IN_PROGRESS with today's date. Read its spec in `product-loop-kit/specs/` fully. Read `CLAUDE.md`.

**Before you start building, check the item isn't already in flight** (added 2026-07-26 after two runs built item 148 the same day): `git ls-remote origin 'refs/heads/claude/loop-<id>'`, or list open PRs. Because the status change ships in the SAME commit as the code (2026-07-13 rule), an item whose PR is open-but-unmerged — the mandatory outcome for anything NEVER-list-gated — still reads `READY` on `main`. An existing `claude/loop-<id>` branch or open PR means IN_REVIEW/BLOCKED: skip to the next item. Full write-up in `LEARNINGS.md` (2026-07-26, loop process).

If `git status` shows uncommitted changes OUTSIDE product-loop-kit/ at pickup: STOP — mark nothing, log `dirty tree — human work present, aborting to avoid sweeping it into a loop commit`, and exit. Never commit changes you didn't make.

If the spec has an open question whose answer changes the architecture: don't guess. Mark the item BLOCKED with the question, log it, exit. Guessed intent is how loops ship the wrong thing fast.

## 1b. UI work? Reuse before inventing (standing decision 2026-07-10)
Any UI change starts by finding the existing component/class that already does the job (grep the CSS + render code). New visual elements use the neumorphic token system exclusively; a gradient, one-off style, or duplicated near-identical component is a verifier FAIL.

## 2. Blindspot pass (only if the territory is unfamiliar)
If the item touches a part of the codebase not touched by a loop before, spend the first minutes searching the code for constraints the spec missed (existing patterns, edge cases, prior art). Add findings to the spec under `## Territory notes` before writing code.

## 3. Build
- Work on a branch: `loop/<item-id>`. If running in parallel with another loop, use a git worktree.
- Smallest change that satisfies the acceptance criteria. No scope creep, no drive-by refactors.
- Growth items: implement the instrumentation from the spec. An unmeasurable change is a failed change.
- Keep `product-loop-kit/specs/<item-id>-notes.md` as you go: any deviation from the spec, the conservative choice you made, and why. Deviations are data for the improve loop.
- Run the project's tests/lint/build. Fix what you broke.

## 4. Verify (you do not grade your own work)
Invoke the `verifier` subagent with: the spec path, the branch name, the notes file. It independently checks acceptance criteria and assigns a risk tier.
- Verifier FAIL → fix and re-verify. After 3 total attempts: set item to PARKED with your notes and the verifier's reasons, log it, exit. Parking is success — an honest dead-end recorded beats a fourth blind attempt.
- Verifier PASS → continue.

## 5. Ship per policy (NORTH_STAR.md risk policy)
- Check NORTH_STAR.md's NEVER list first (trust-rail weakening, credentials/org-admin/money, SEO deletion, out-of-scope dirs): if the diff touches any → leave the branch unmerged, mark the item BLOCKED with the question, log it, exit.
- Otherwise (standing decision 2026-07-10): verifier PASS + tests green → merge to main, ANY risk tier. No human pre-merge gate.
- BEFORE merging, write the explainer to `product-loop-kit/specs/<item-id>-pr.md`: HIGH tier = full walkthrough (goal → intuition → what changed and why, diff in reading order, deviations from spec) ending with a 5-question quiz (answers at the bottom, base64). LOW tier = short explainer, same file.
- Note `auto-merged` + tier in the log. If the merge touches render paths and the smoke gate (backlog 003) hasn't shipped, append `needs human visual spot-check` to the log line.

## 6. Compound — codify a reusable playbook (only if this was a non-trivial investigation)
The compound step: each unit of work should make the next one easier. If this item involved a non-trivial **investigation** — a bug root-caused, a signal classified, a "is-this-a-bug-or-expected" judgment, an audit of where something is emitted — write or UPDATE a playbook so the next occurrence follows a checklist instead of re-deriving it. Skip for routine feature work (the spec already captures that).
- Write/update `product-loop-kit/playbooks/<topic>.md` in the format from `playbooks/README.md` (When / Answer-in-one-line / Steps with exact file:line + decision rule / Resolution / Traps / Provenance). If a playbook for the topic exists, UPDATE it — never duplicate.
- Keep it a checklist, not an essay. This is additive docs — it lands in the same commit/PR as the item.

## 7. Close out
- BACKLOG.md: item → SHIPPED (or IN_REVIEW / PARKED / BLOCKED) with measurement-window end date for growth items.
- Append to `product-loop-kit/LOG.md`: `date | build | item-id | attempts | outcome | risk tier | est. cost`. Note `+playbook: <topic>` if step 6 produced one.
- Exit. Do not pick up another item.
