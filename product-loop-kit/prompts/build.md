# LOOP 2 — BUILD (ralph rules: ONE item, fresh context, then exit)

You are one iteration of the build loop. You do exactly one backlog item this session — never a second one, even if the first goes quickly. The next iteration gets a fresh context window; anything future-you needs must be written to disk.

## 0. Ceremony caps and the clock (2026-08-11 efficiency reset — these bind THIS run)
Over-cap is a verifier FAIL of category `ceremony`, resolved by **deleting text**, never by another attempt. Write to the cap from the start; a longer artifact is not a better one.

| artifact | LOW | HIGH |
|---|---|---|
| `specs/<id>.md` | ≤80 lines | ≤150 lines |
| `specs/<id>-notes.md` | ≤60 lines | ≤200 lines |
| `specs/<id>-pr.md` | ≤40 lines | ≤100 lines + quiz |
| LOG.md line | ≤300 chars | ≤300 chars |
| non-vacuity cycles | 1 per new gate file | 1 per new rule |
| verifier rounds | 1 | 2 max |
| test:code line ratio | ≤2:1 | ≤3:1 |

**Wall clock**: T+10 builder dispatched · T+75 builder deadline (over → descope to the smallest shippable slice, don't extend) · T+95 verifier round done · T+120 merged or parked. Terminal states are **MERGED / PARKED-with-recipe / SKIPPED (<20k tokens)** — there is no other end state, and "still going at T+120" is not one.

**Impact field.** Every spec carries one line: `Impact: <north-star leg | guardrail | defect-count n→0 on <surface>>`, repeated **verbatim as the PR body's first line**. An item whose Impact line cannot be filled is a **process item by definition** — score it as one and apply §1's pickup arithmetic.

## 1. Pick up work
Read `product-loop-kit/NORTH_STAR.md`, then `product-loop-kit/RAZOR.md` (the weakest-hypothesis rule — it governs the guard, test and class rules in §3), then `product-loop-kit/BACKLOG.md`. Take the highest-scored item with status READY (skip items at attempt-limit). **Pickup arithmetic (2026-08-11): a process (loop-tooling) item may be picked ONLY when it beats the best READY product item by >1.0 score, and at most ONE process item may be in flight at a time** (same pattern as the lens cap) — backtest: 263-process (8.0) beat 265-product (7.8) by 0.2, and that day shipped zero product impact; under this rule 265 wins. Set it to IN_PROGRESS with today's date. Read its spec in `product-loop-kit/specs/` fully. Read `CLAUDE.md`.

**Before you start building, check the item isn't already in flight** (added 2026-07-26 after two runs built item 148 the same day; made executable 2026-08-11, item 263, after a run built item 227's entire spec only to discover at push time it had already landed hours earlier as PR #425 — the prose version of this check ran once, at pickup, and could not see a merged-and-deleted branch, a base that went stale mid-run, or PR state at all). Fetch open PR data with the GitHub MCP tool (`list_pull_requests`/`search_pull_requests`) and save it to a JSON file, then run:
```
node product-loop-kit/check-item-inflight.js <id> --prs=<path-to-that-json>
```
Exit 0 (CLEAR) → proceed. Any other exit code obliges you to skip this item and take the next highest-scored READY item instead: exit 1 (COLLISION) means a leg matched — read the printed ref/sha/PR and treat the item as IN_REVIEW/BLOCKED rather than READY; exit 3 (CLEAR-WITH-UNAVAILABLE-LEG) means `--prs` was omitted — supply real PR data before trusting a CLEAR, never proceed on a 3; exit 2 is a usage/environment error — fix the invocation, it is not a verdict either way. Because the status change ships in the SAME commit as the code (2026-07-13 rule), an item whose PR is open-but-unmerged — the mandatory outcome for anything NEVER-list-gated — still reads `READY` on `main`; the check above is what actually catches that, not a memory of the rule. Full write-up in `LEARNINGS.md` (2026-07-26, loop process) and `product-loop-kit/specs/263.md`.

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

**Guard rule — watch the DEFINING mechanism, never a resemblance of it (RAZOR.md; item 212).** Any guard, mirror, drift-test or predicate must be derived from the mechanism the product actually executes, not from something that looks like it. A list of names that must exist in two places, where only one is read at runtime, is a **mirror**: it gets a **tested set-equality against the original, both directions, in the same commit that creates it**. If the original is not machine-readable, **making it parseable IS the task** — hand-maintaining the copy is not an alternative. 212's first attempt built the list by scanning for literal `.get('key')` calls and shipped a drift test on the same scan; it passed and was blind to `app` (`home.html:79` reads `ANALYTICS_PARAMS.some(k => params.has(k))`). A guard aimed at a resemblance is worse than no guard — it launders the gap as coverage, and the notes and PR explainer then claim protection the guard cannot give.

**Test rule — assert INVARIANTS over the population, never a hardcoded instance.** Acceptance tests draw from the population the code under test draws from (derive it at test time — the snapshot/estate churns daily), and assert the property. **The instance that motivated the item is the POSITIVE CONTROL, not the definition.** Every new test or gate proves non-vacuity in the session: mutate → red → restore → green, byte-identical restore (`md5sum`/`git show`), each sub-rule neutered separately so "three working rules" is distinguishable from "one working rule and two dead ones". A gate nobody has seen fail is not evidence (LEARNINGS 2026-07-27).

**Class rule — before calling the item done, answer the spec's "Instance of" field honestly.** Ask: *if this exact defect appeared in a different member of the same population tomorrow, would anything catch it?* If no, the class is **open**, and the item must say so **with a number** (population size, uncovered fraction, projects/pages/pools affected) and a ticket id. Item 138 added one missing map entry plus a test guarding that one protocol, closed nothing, and left 216 pools / $8.9B TVL / 134 projects exposed at a 70.9%-covered map (LEARNINGS 2026-07-30). Shipping the narrow fix is allowed; claiming it closed the class is not.

## 4. Verify (you do not grade your own work)
Invoke the `verifier` subagent with: the spec path, the branch name, the notes file. It independently checks acceptance criteria and assigns a risk tier.
- Verdict types (verifier.md): **PASS-WITH-AMENDS** → apply the exact text fixes in this same round and ship; it consumes no attempt. **FAIL** (a BLOCKING finding — resolvable only by changing code behavior) → fix and re-verify, within §0's round cap (1 LOW / 2 HIGH). A BLOCKING finding *introduced by the previous round's fix* → park immediately, remaining budget void.
- Verifier FAIL → fix and re-verify. After 3 total attempts: set item to PARKED with your notes and the verifier's reasons, log it, exit. Parking is success — an honest dead-end recorded beats a fourth blind attempt.
- Verifier PASS → continue.

## 5. Ship per policy (NORTH_STAR.md risk policy)
- **Immediately before the FIRST push, re-run the in-flight check** (new 2026-08-11, item 263 — this step did not exist before; it is what actually catches blind spots 1 and 2, both only observable at push time, not at pickup). Re-fetch open PR data with the GitHub MCP tool and re-run:
  ```
  node product-loop-kit/check-item-inflight.js <id> --prs=<path-to-freshly-fetched-json>
  ```
  (the script re-fetches `origin/main` itself, so this also catches a base that went stale mid-session). Exit 0 → push. Any non-zero exit obliges you to STOP and NOT push: exit 1 (COLLISION) means the item landed or someone else claimed it while you built — reconcile against what's actually on `main`/open before doing anything else, and if your work is now redundant, discard the branch and record why rather than merging duplicate work; exit 3 means `--prs` didn't carry real data — fetch it and re-run before pushing, never push on a 3; exit 2 is a usage/environment error — fix the invocation and re-run, it blocks the push exactly like a 1 or 3 until resolved.
- Check NORTH_STAR.md's NEVER list first (trust-rail weakening, credentials/org-admin/money, SEO deletion, out-of-scope dirs): if the diff touches any → leave the branch unmerged, mark the item BLOCKED with the question, log it, exit.
- Otherwise (standing decision 2026-07-10): verifier PASS + tests green → merge to main, ANY risk tier. No human pre-merge gate.
- BEFORE merging, write the explainer to `product-loop-kit/specs/<item-id>-pr.md`: HIGH tier = full walkthrough (goal → intuition → what changed and why, diff in reading order, deviations from spec) ending with a 5-question quiz (answers at the bottom, base64). LOW tier = short explainer, same file. Both under §0's caps, and the first line of the PR body is the spec's `Impact:` line verbatim.
- Note `auto-merged` + tier in the log. If the merge touches render paths and the smoke gate (backlog 003) hasn't shipped, append `needs human visual spot-check` to the log line.

## 6. Compound — codify a reusable playbook (only if this was a non-trivial investigation)
The compound step: each unit of work should make the next one easier. If this item involved a non-trivial **investigation** — a bug root-caused, a signal classified, a "is-this-a-bug-or-expected" judgment, an audit of where something is emitted — write or UPDATE a playbook so the next occurrence follows a checklist instead of re-deriving it. Skip for routine feature work (the spec already captures that).
- Write/update `product-loop-kit/playbooks/<topic>.md` in the format from `playbooks/README.md` (When / Answer-in-one-line / Steps with exact file:line + decision rule / Resolution / Traps / Provenance). If a playbook for the topic exists, UPDATE it — never duplicate.
- Keep it a checklist, not an essay. This is additive docs — it lands in the same commit/PR as the item.

## 7. Close out
- BACKLOG.md: item → SHIPPED (or IN_REVIEW / PARKED / BLOCKED) with measurement-window end date for growth items.
- Append to `product-loop-kit/LOG.md`: `date | build | item-id | attempts | outcome | risk tier | est. cost`. Note `+playbook: <topic>` if step 6 produced one.
- Exit. Do not pick up another item.
