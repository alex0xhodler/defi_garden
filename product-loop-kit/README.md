# Product Loop Kit

A loop of loops that improves your product autonomously. You live in exactly one loop: the top one.

```
┌─ LOOP 0 · OVERSIGHT (you, weekly, 30 min) ──────────────────────┐
│  set north star + theme · allocate budget · cull · approve       │
│                                                                   │
│  ┌─ LOOP 3 · HEARTBEAT (scheduled, daily) ─────────────────────┐ │
│  │  pull Mixpanel + error signals → diff → score → BACKLOG.md  │ │
│  │                                                               │ │
│  │  ┌─ LOOP 2 · BUILD (ralph runner, per item) ──────────────┐ │ │
│  │  │  one item · fresh context · build → verify → ship/park  │ │ │
│  │  │                                                           │ │ │
│  │  │  ┌─ LOOP 1 · EXECUTION ─────────────────────────────┐   │ │ │
│  │  │  │  Claude Code's own act-observe cycle (comes free) │   │ │ │
│  │  │  └──────────────────────────────────────────────────┘   │ │ │
│  │  └──────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ LOOP 4 · IMPROVE (weekly, before your review) ─────────────┐ │
│  │  cluster the week's failures → propose smallest safe change  │ │
│  │  to prompts/policy/specs — as a PR you approve               │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

Every loop has a wired-in exit condition. A loop without one doesn't converge — it just burns tokens until something external stops it.

| Loop | Iterates on | Exit condition | Human role |
|---|---|---|---|
| 0 Oversight | goals, budget, backlog | none — this is you | everything strategic |
| 3 Heartbeat | the backlog | signals pulled, backlog scored, report written | read the report |
| 2 Build | one spec | acceptance criteria + verifier PASS, or 3 strikes → park | review PRs; merge |
| 1 Execution | steps in a task | Claude Code handles it | none |
| 4 Improve | the loop system itself | proposal PR opened | approve/reject changes |

## Install

1. Copy this folder into your product repo root as `product-loop-kit/`.
2. Copy the verifier: `mkdir -p .claude/agents && cp product-loop-kit/agents/verifier.md .claude/agents/`.
3. Connect Mixpanel to Claude Code (`claude mcp add` your Mixpanel MCP). If you have Supabase, add it too — the heartbeat uses its error logs as a free "is it actually broken?" check.
4. Configure `NORTH_STAR.md` — the `product-loop-setup` skill fills its templated placeholders via recon + interview; if installing by hand, replace them yourself. The loops inherit every ambiguity you leave here.
5. Schedule the heartbeat (weekday mornings):
   ```
   0 8 * * 1-5  cd /path/to/repo && claude -p "$(cat product-loop-kit/prompts/heartbeat.md)" --permission-mode acceptEdits >> product-loop-kit/logs/heartbeat.log 2>&1
   ```
   Or run it manually with the same command while you're calibrating.

## Daily rhythm (~10 min)

1. Read the heartbeat report (`reports/` latest). Answer any questions it flagged for you — answers become standing decisions in `NORTH_STAR.md`.
2. Kick builds: `./product-loop-kit/loop.sh 3` runs up to 3 backlog items, one per fresh session.
3. Review PRs. High-risk PRs come with an explainer + 5-question quiz — don't merge until you'd pass it. That quiz is your speed regulator: it keeps the loop at the speed of your understanding, which is what generates next week's ideas.

## Weekly rhythm (~30 min, Loop 0)

1. Read the improve-loop's proposal PR. Approve/reject. Policy and scoring changes NEVER self-apply.
2. Check `LEARNINGS.md` — which shipped experiments actually moved the metric.
3. Set/confirm the weekly theme and budgets in `NORTH_STAR.md`. Cull backlog items you don't believe in.
4. Glance at spend in `LOG.md`.

## Ratcheting autonomy

Start: low-risk auto-merges, everything else PRs. When 4 consecutive weeks pass with zero reverted auto-merges, widen the low-risk definition in `NORTH_STAR.md` (that's a policy change — it goes through you). If a bad change ships, ratchet DOWN one notch and let the improve loop propose the fix. Go down a loop for reliability, up a loop for leverage.

## Deliberately left out (add only when the pain is real)

- **No custom eval framework.** Your eval is the north-star metric plus the verifier rubric. Add span-level evals only when the same failure class shows up 3+ times — evals should emerge from observed failures, not guesses.
- **No multi-agent swarm.** One task per loop, monolithic, vertical. Parallelism = at most 2-3 build loops in separate git worktrees on independent items.
- **No 24/7 daemon.** A scheduled heartbeat plus builds you kick off covers 95% of the value at 20% of the token burn. Watch the first ~10 build loops run — spotting failure patterns yourself is where your leverage comes from, and it's what feeds Loop 4.

## Files

```
NORTH_STAR.md        you own this — goal, guardrails, theme, budgets, risk policy, standing decisions
BACKLOG.md           scored queue (heartbeat writes, you cull)
LEARNINGS.md         validated results — what moved the metric, what didn't
LOG.md               run journal + spend
specs/               one spec per backlog item (_template.md)
prompts/heartbeat.md Loop 3
prompts/build.md     Loop 2
prompts/improve.md   Loop 4
agents/verifier.md   the checker (never the maker)
loop.sh              ralph runner
reports/, logs/      heartbeat output, run logs
```
