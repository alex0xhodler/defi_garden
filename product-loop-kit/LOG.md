# LOG — one line per loop run. The improve loop reads this; the human skims spend weekly.
# date | loop | item | attempts | outcome | risk | est. cost
2026-07-09 | install | — | — | kit installed via product-loop-setup; baseline pulled (north star = 0); backlog seeded 001-003 | — | —
2026-07-10 | heartbeat | dry-run | — | signals pulled live; 002 rescored 8.7; 2 questions for the human | — | ~$0 (ran inside install session)
2026-07-10 | build (in-session with human) | 002 | 1 | DONE — instrumentation sound; plan_saved double-fire root-caused & fixed (planSavedSignature dedupe, TDD, 190 assertions green); Q-a/Q-b answered → standing decisions | LOW | ~$0 (ran inside session)
2026-07-10 | heartbeat-update | 004 | — | added: surface share CTA at bloom (0 shares / 5 plans / 167 sessions); new Q-c (plan_created revisit semantics) | HIGH | —
2026-07-10 | build (sonnet-5 agent a927f15) | 004 | 1 | IN_REVIEW — verifier (fable) PASS: ~40-line diff, share prompt in sticky checkout col, handlers reused, EN+KO, tokens only, reduced-motion gated (css:1654); residual = human visual QA | HIGH | ~163k subagent tokens
2026-07-10 | build (sonnet-5 agent aa5e43e) | 001 | 1 | IN_REVIEW — verifier (fable) PASS: .mcp.json matches official docs (endpoint re-fetched independently), zero secrets, deferred criteria honestly documented; residual = org MCP enable + /mcp OAuth | HIGH | ~150k subagent tokens
2026-07-10 | operator note | — | — | .claude/ is gitignored → .claude/agents/verifier.md is local-only (works here; re-copy from product-loop-kit/agents/ on fresh clones per README step 2) | — | —
2026-07-10 | policy (human directive) | — | — | autonomy → (c) verifier PASS = auto-merge any tier; NEVER list stays human-gated; build.md step 5 updated + dirty-tree abort guard added to step 1; operator flagged visual-QA gap until 003 | — | —
