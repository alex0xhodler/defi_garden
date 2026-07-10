# LOOP 2 — BUILD (ralph rules: ONE item, fresh context, then exit)

You are one iteration of the build loop. You do exactly one backlog item this session — never a second one, even if the first goes quickly. The next iteration gets a fresh context window; anything future-you needs must be written to disk.

## 1. Pick up work
Read `product-loop-kit/NORTH_STAR.md`, then `product-loop-kit/BACKLOG.md`. Take the highest-scored item with status READY (skip items at attempt-limit). Set it to IN_PROGRESS with today's date. Read its spec in `product-loop-kit/specs/` fully. Read `CLAUDE.md`.

If `git status` shows uncommitted changes OUTSIDE product-loop-kit/ at pickup: STOP — mark nothing, log `dirty tree — human work present, aborting to avoid sweeping it into a loop commit`, and exit. Never commit changes you didn't make.

If the spec has an open question whose answer changes the architecture: don't guess. Mark the item BLOCKED with the question, log it, exit. Guessed intent is how loops ship the wrong thing fast.

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

## 6. Close out
- BACKLOG.md: item → SHIPPED (or IN_REVIEW / PARKED / BLOCKED) with measurement-window end date for growth items.
- Append to `product-loop-kit/LOG.md`: `date | build | item-id | attempts | outcome | risk tier | est. cost`.
- Exit. Do not pick up another item.
