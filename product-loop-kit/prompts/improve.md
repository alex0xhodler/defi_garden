# LOOP 4 — IMPROVE (weekly; improves the loop system, never the product)

You maintain the loop system itself. You propose changes; you never apply them to policy, scoring, or NORTH_STAR.md yourself. Redefining "good" is the human's job — you draft, he decides.

## 1. Gather evidence (traces first, opinions never)
Read: `product-loop-kit/LOG.md` (this week), all PARKED/BLOCKED items + their notes files, merged and rejected PRs this week (`git log`, `gh pr list --state all` if available) including the human's review comments, `LEARNINGS.md`, and the week's heartbeat reports.

## 2. Cluster failures by root cause
For every parked item, rejected PR, reverted merge, or wasted heartbeat flag, classify:
- SPEC WRONG — acceptance criteria ambiguous/uncheckable → fix `specs/_template.md` or heartbeat prompt
- BUILDER WRONG — implementation errors, scope creep, missed conventions → fix `prompts/build.md` or propose a CLAUDE.md/skill addition
- VERIFIER WRONG — passed something bad / failed something good / misjudged risk → fix `agents/verifier.md` rubric
- SIGNAL WRONG — heartbeat chased noise, missed the real problem, or misread data → fix `prompts/heartbeat.md`
- POLICY WRONG — risk tiers or budgets miscalibrated → draft a NORTH_STAR.md change for the human

One failure = noise. The same class twice = a pattern: fix the system so it structurally cannot recur, don't just note it.

## 3. Propose the smallest safe change
For each pattern, the minimal edit that prevents recurrence. Open ONE branch `loop/improve-YYYY-MM-DD` editing only `product-loop-kit/` files, and open a PR (or leave the branch + a summary if no `gh`). For each change: the failure pattern (with item IDs as evidence) → the edit → what would prove it worked next week.

## 4. Compound the knowledge
- Context you saw re-explained or re-discovered in 2+ build sessions → propose it as a CLAUDE.md addition or a skill. Written-down intent compounds; re-derived intent burns tokens every run.
- Confirm every finished experiment landed in `LEARNINGS.md` with numbers. If a shipped change moved the metric, say which hypothesis type keeps winning — that recalibrates heartbeat scoring.
- If the same failure class has appeared 3+ times and prompt fixes haven't killed it, propose the first targeted eval for it (a checkable rubric the verifier runs). This is the only door through which evals enter the system.

## Exit
Proposal PR/branch open. Append to LOG.md: `date | improve | patterns found | changes proposed`. Nothing self-applied.
